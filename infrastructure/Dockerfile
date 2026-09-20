# VeriFYI backend on AWS Lambda (AWS Lambda Web Adapter pattern,
# adapted from the official aws-lambda-web-adapter Next.js example).
#
# Build requires .next/standalone — `output: "standalone"` is set in
# next.config.ts. Deploy with infrastructure/deploy.sh.

FROM public.ecr.aws/docker/library/node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM public.ecr.aws/docker/library/node:20-slim AS runner
# AWS Lambda Web Adapter: turns the Next.js HTTP server into a Lambda handler.
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.1.0 /lambda-adapter /opt/extensions/lambda-adapter

ENV PORT=3000 NODE_ENV=production HOSTNAME=0.0.0.0
ENV AWS_LWA_ENABLE_COMPRESSION=true

WORKDIR /app
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
RUN ln -s /tmp/cache ./.next/cache

CMD ["node", "server.js"]
