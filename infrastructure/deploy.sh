#!/usr/bin/env bash
# VeriFYI backend — one-command AWS deployment.
#
# Prerequisites:
#   - Docker Desktop running (container image build)
#   - AWS credentials valid (`aws login` for SSO) with permissions for
#     CloudFormation, ECR, Lambda, API Gateway, DynamoDB, IAM
#   - Gemini API key: exported as GEMINI_API_KEY, or present in .env.local
#     (loaded automatically). Without it the backend deploys but /api/analyze
#     returns a controlled error until the key is set.
#   - Bedrock (FUTURE/alternative provider only): account-level Bedrock model
#     access + AI_PROVIDER=bedrock. NOT required for the current deployment.
#
# Usage:
#   ./infrastructure/deploy.sh                 # guided first deploy
#   ./infrastructure/deploy.sh --guided        # force guided
#   AWS_REGION=us-east-1 ./infrastructure/deploy.sh
#
# After deploy the script prints the production /api/analyze endpoint.

set -euo pipefail

cd "$(dirname "$0")/.."
export AWS_PAGER=""

# Load the operator's local env (never committed) so GEMINI_API_KEY etc. can be
# picked up without being typed into the shell. Strip Windows CRLF endings.
if [ -f .env.local ]; then
  set -a; . ./.env.local 2>/dev/null; set +a
fi
GEMINI_API_KEY="${GEMINI_API_KEY:-}"; GEMINI_API_KEY="${GEMINI_API_KEY%$'\r'}"

REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${STACK_NAME:-verifiy-backend}"
LWA_LAYER_VERSION="${LWA_LAYER_VERSION:-1.1.0}"

echo "== VeriFYI backend deploy =="
echo "Region: ${REGION}  Stack: ${STACK_NAME}"

# --- preflight -------------------------------------------------------------
if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "ERROR: AWS credentials are not valid. Run 'aws login' first."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is not running. Start Docker Desktop and retry."
  exit 1
fi

if ! command -v sam >/dev/null 2>&1; then
  echo "sam CLI not found — installing via pip (user install)..."
  if command -v pip3 >/dev/null 2>&1; then
    pip3 install --user aws-sam-cli
  else
    echo "ERROR: pip3 not found. Install AWS SAM CLI: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
    exit 1
  fi
fi

# --- build & deploy --------------------------------------------------------
# The template lives at infrastructure/template.yaml (SAM's default is
# ./template.yml). --base-dir keeps relative paths in the template — most
# importantly the function's "DockerContext: ." — resolving against the
# REPOSITORY ROOT, so the Docker build context stays at the root. SAM also
# resolves the Image-function "Dockerfile" metadata against that same base,
# while the repo keeps the Dockerfile in infrastructure/ — so a temporary
# copy is staged at the root for the build only (removed afterwards; the
# EXIT trap guarantees cleanup even when sam build fails).
if [ -e Dockerfile ]; then
  echo "ERROR: unexpected Dockerfile already exists at repository root"
  exit 1
fi
cp infrastructure/Dockerfile Dockerfile
trap 'rm -f Dockerfile' EXIT

sam build \
  --template infrastructure/template.yaml \
  --base-dir . \
  2>&1 | sed 's/^/  /'

rm -f Dockerfile
trap - EXIT

sam deploy \
  ${DEPLOY_ARGS:-} \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --template-file .aws-sam/build/template.yaml \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --resolve-s3 \
  --image-repository "$(aws sts get-caller-identity --output text --query 'Account')".dkr.ecr."${REGION}".amazonaws.com/"${STACK_NAME}" \
  --parameter-overrides \
      AiProvider="${AI_PROVIDER:-gemini}" \
      GeminiModel="${GEMINI_MODEL:-gemini-2.5-flash}" \
      GeminiApiKey="${GEMINI_API_KEY}" \
      BedrockModelId="${BEDROCK_MODEL_ID:-}" \
      CorsOrigin="${CORS_ORIGIN:-*}" \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset

# --- verify ----------------------------------------------------------------
echo
echo "== Deployment outputs =="
API_BASE_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiBaseUrl'].OutputValue" \
  --output text)
ANALYZE_ENDPOINT="${API_BASE_URL%/}/api/analyze"
HEALTH_ENDPOINT="${API_BASE_URL%/}/api/health"

echo "ApiBaseUrl:        ${API_BASE_URL}"
echo "AnalyzeEndpoint:   ${ANALYZE_ENDPOINT}"
echo "HealthEndpoint:    ${HEALTH_ENDPOINT}"

AI_PROVIDER_DEPLOYED="${AI_PROVIDER:-gemini}"
if [ "$AI_PROVIDER_DEPLOYED" = "gemini" ] && [ -z "$GEMINI_API_KEY" ]; then
  echo
  echo "WARNING: AiProvider=gemini but no GEMINI_API_KEY was provided."
  echo "         /api/analyze will return a controlled error until the key is set."
  echo "         Re-run with GEMINI_API_KEY exported (or present in .env.local)."
fi

echo
echo "== Verifying production endpoint =="
curl -s -m 30 "$HEALTH_ENDPOINT" && echo

# Wire the table name into the Lambda env and redeploy the function config.
TABLE_NAME=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='VerificationsTableName'].OutputValue" \
  --output text)
echo "DynamoDB table:    ${TABLE_NAME}"

cat <<'EOF'

Next steps:
  1. If you did not run guided mode, note that the first deploy creates the ECR repo automatically.
  2. AI provider is Gemini (AI_PROVIDER=gemini): ensure GEMINI_API_KEY was passed (see warning above).
     Bedrock remains available as a future provider: AI_PROVIDER=bedrock + account-level model access.
  3. Run the live suite against production:
       curl -X POST "$ANALYZE_ENDPOINT" -H 'Content-Type: application/json' \
         -d '{"text":"Congratulations! ... Pay Rs 1,500 onboarding fee ..."}'
  4. Share ApiBaseUrl with the frontend team (J Bob) — the contract is in lib/contract.ts.
EOF
