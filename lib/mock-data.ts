import type { AnalysisReport } from "./types";

/**
 * VeriFYI — mock analysis data.
 *
 * Mock mode exists so the frontend can be built and demoed before the
 * analysis backend is live. The external evidence below is illustrative demo
 * data simulating what a real retrieval layer would return — the UI never
 * fabricates evidence at runtime.
 *
 * PRODUCT PRINCIPLES ENCODED HERE:
 * - The suspicious example is NOT labeled "scam". Claims come back
 *   UNVERIFIED or CONTRADICTED based on what the (simulated) evidence
 *   actually shows. Absence of evidence is never presented as proof of fraud.
 * - "Pay ₹1,500 onboarding fee" is CONTRADICTED because it contradicts
 *   well-documented hiring norms cited in the demo evidence — not because
 *   "AI said so".
 */

/** The suspicious internship offer from the demo script. */
export const SAMPLE_SUSPICIOUS = `You have been selected for an AI internship.
Salary ₹80,000/month.
Pay ₹1,500 onboarding fee.
Contact recruiter at googlecareers@gmail.com.`;

/** An ambiguous, unverifiable message — demonstrates honest UNVERIFIED results. */
export const SAMPLE_AMBIGUOUS = `Your profile has been shortlisted for an AI Engineering internship.
Please contact our recruitment team to schedule your interview.`;

/** A plausible, largely legitimate offer for contrast in the demo. */
export const SAMPLE_LEGITIMATE = `Subject: Internship Offer — Product Design Intern

Hi Ananya,

Following your interviews with our team, we are pleased to offer you the position of Product Design Intern at Razorpay, based in our Bengaluru office.

Details:
- Duration: 6 months, starting 4 January 2027
- Stipend: ₹40,000 per month
- Offer letter attached. Please reply to confirm by 20 December.

You can verify this offer by contacting our recruiting team through the official website at razorpay.com/contact or by calling the number listed there.

Best regards,
Meera Iyer
University Recruiting, Razorpay`;

const suspiciousReport: AnalysisReport = {
  overallStatus: "HIGH_RISK",
  summary:
    "Several claims could not be verified and one claim contradicts well-documented hiring practices. This pattern is common in recruitment fraud, but verification — not assumption — is what settles it.",
  claims: [
    {
      id: "1",
      claim: "The recruiter represents the company",
      category: "RECRUITER",
      status: "UNVERIFIED",
      confidence: 0.92,
      explanation:
        "No independently verifiable evidence connecting the recruiter to the claimed company was provided. The contact is a public email domain, which any individual can register — this neither confirms nor denies their identity.",
      actions: [
        "Verify the recruiter's identity through the company's official website",
        "Ask the recruiter for a verifiable company email address",
      ],
      evidence: [
        {
          source: "Message text",
          excerpt: "Contact recruiter at googlecareers@gmail.com",
          stance: "NEUTRAL",
          origin: "USER_INPUT",
        },
      ],
    },
    {
      id: "2",
      claim: "The sender's email domain matches the company",
      category: "CONTACT",
      status: "CONTRADICTED",
      confidence: 0.9,
      explanation:
        "Major companies use their own domains for recruiting (e.g. @google.com, not public mailbox providers). The message uses a public @gmail.com address styled to look official — a documented impersonation pattern.",
      actions: [
        "Cross-check the address against the company's official contact page",
        "Do not share sensitive documents until the request is verified",
      ],
      evidence: [
        {
          source: "Message text",
          excerpt: "Contact recruiter at googlecareers@gmail.com",
          stance: "NEUTRAL",
          origin: "USER_INPUT",
        },
        {
          source: "Public guidance on recruitment impersonation",
          excerpt:
            "Reputable employers recruit from their own email domains. Offers made through generic mailbox providers styled to imitate a brand are a recurring impersonation pattern.",
          stance: "CONTRADICTS",
          origin: "WEB",
        },
      ],
    },
    {
      "id": "3",
      claim: "The ₹1,500 onboarding fee is a standard hiring requirement",
      category: "PAYMENT",
      status: "CONTRADICTED",
      confidence: 0.96,
      explanation:
        "The request contradicts well-documented hiring norms: legitimate employers do not ask candidates to pay to join. Public consumer-guidance sources consistently flag onboarding-fee requests as a recruitment-fraud pattern.",
      actions: [
        "Avoid sending payment before verification",
        "Report the message to the impersonated company and to cybercrime.gov.in",
      ],
      evidence: [
        {
          source: "Message text",
          excerpt: "Pay ₹1,500 onboarding fee.",
          stance: "NEUTRAL",
          origin: "USER_INPUT",
        },
        {
          source: "Public consumer guidance",
          excerpt:
            "No legitimate employer asks candidates for money at any stage of hiring. Upfront 'registration', 'onboarding' or 'processing' fees are a hallmark of recruitment fraud.",
          stance: "CONTRADICTS",
          origin: "WEB",
        },
      ],
    },
    {
      id: "4",
      claim: "The offered salary is ₹80,000/month for an AI internship",
      category: "COMPENSATION",
      status: "UNVERIFIED",
      confidence: 0.78,
      explanation:
        "The figure could not be checked against a listing for this role. The amount is well above typical intern stipends, but above-market pay alone is not proof of fraud — no reliable source was found to confirm or contradict it.",
      actions: [
        "Confirm the job listing independently on the company's careers site",
        "Ask for the official offer letter on company letterhead",
      ],
      evidence: [
        {
          source: "Message text",
          excerpt: "Salary ₹80,000/month.",
          stance: "NEUTRAL",
          origin: "USER_INPUT",
        },
      ],
    },
    {
      id: "5",
      claim: "The candidate has been selected for an AI internship",
      category: "COMPANY",
      status: "UNVERIFIED",
      confidence: 0.81,
      explanation:
        "The selection claim rests entirely on the message itself. No application on record and no listing for this drive were found, so it can be neither supported nor contradicted.",
      actions: [
        "Confirm the job listing independently on the company's careers site",
        "Check the official careers portal for this recruitment drive",
      ],
      evidence: [
        {
          source: "Message text",
          excerpt: "You have been selected for an AI internship.",
          stance: "NEUTRAL",
          origin: "USER_INPUT",
        },
      ],
    },
  ],
};

/**
 * The ambiguous example: nothing is contradicted, nothing is confirmed —
 * and the missing company name is itself a finding. VeriFYI returns honest
 * UNVERIFIED statuses instead of guessing in either direction.
 */
const ambiguousReport: AnalysisReport = {
  overallStatus: "NEEDS_VERIFICATION",
  summary:
    "Nothing in this message is contradicted, but nothing is verifiable either — no company is even named. Treat it as incomplete rather than dangerous, and fill the gaps before responding.",
  claims: [
    {
      id: "1",
      claim: "The candidate's profile has been shortlisted for an internship",
      category: "COMPANY",
      status: "UNVERIFIED",
      confidence: 0.83,
      explanation:
        "Shortlisting cannot be checked: there is no application reference, no company name, and no listing to match against. Mass-sent messages often use this exact phrasing, but that alone does not make it fraudulent.",
      actions: [
        "Ask the sender which company and role this is for",
        "Check the official careers portal for this recruitment drive",
      ],
      evidence: [
        {
          source: "Message text",
          excerpt:
            "Your profile has been shortlisted for an AI Engineering internship.",
          stance: "NEUTRAL",
          origin: "USER_INPUT",
        },
      ],
    },
    {
      id: "2",
      claim: "The opportunity is an AI Engineering internship",
      category: "COURSE",
      status: "UNVERIFIED",
      confidence: 0.79,
      explanation:
        "The role cannot be validated because the message never names an organization. A role title with no company behind it is not yet an opportunity — there is nothing to check it against.",
      actions: [
        "Ask for the official job description and company name",
        "Search the role on the company's careers site once identified",
      ],
      evidence: [
        {
          source: "Message text",
          excerpt: "...for an AI Engineering internship.",
          stance: "NEUTRAL",
          origin: "USER_INPUT",
        },
      ],
    },
    {
      id: "3",
      claim: "Contacting the 'recruitment team' is a safe next step",
      category: "RECRUITER",
      status: "UNVERIFIED",
      confidence: 0.71,
      explanation:
        "The sender is unidentified, so the safety of replying cannot be assessed. This is not marked as dangerous — replying is simply a step to take knowingly, after the sender is identified.",
      actions: [
        "Verify the recruiter's identity through the company's official website",
        "Do not share sensitive documents until the request is verified",
      ],
      evidence: [
        {
          source: "Message text",
          excerpt:
            "Please contact our recruitment team to schedule your interview.",
          stance: "NEUTRAL",
          origin: "USER_INPUT",
        },
      ],
    },
  ],
};

const legitimateReport: AnalysisReport = {
  overallStatus: "PARTIALLY_VERIFIED",
  summary:
    "Most claims are consistent with the document and publicly known facts. Two items could not be independently confirmed and deserve a quick check before you accept.",
  claims: [
    {
      id: "1",
      claim: "The offer is from Razorpay's University Recruiting team",
      category: "RECRUITER",
      status: "SUPPORTED",
      confidence: 0.94,
      explanation:
        "The message is signed by a named recruiter with a role title, references the candidate's interview process, and points to the company's official website for verification — consistent with legitimate recruiting correspondence.",
      actions: ["Reply only through the official contact details listed on razorpay.com"],
      evidence: [
        {
          source: "Message text",
          excerpt:
            "Best regards, Meera Iyer — University Recruiting, Razorpay",
          stance: "SUPPORTS",
          origin: "USER_INPUT",
        },
        {
          source: "Message text",
          excerpt:
            "Following your interviews with our team, we are pleased to offer you the position of Product Design Intern",
          stance: "SUPPORTS",
          origin: "USER_INPUT",
        },
      ],
    },
    {
      id: "2",
      claim: "The offer can be verified via the official website",
      category: "CONTACT",
      status: "SUPPORTED",
      confidence: 0.91,
      explanation:
        "The message directs verification through the company's official domain rather than a private channel — the opposite of the impersonation pattern seen in fraudulent offers.",
      actions: ["Use the contact page on razorpay.com to confirm the offer"],
      evidence: [
        {
          source: "Message text",
          excerpt:
            "You can verify this offer by contacting our recruiting team through the official website at razorpay.com/contact",
          stance: "SUPPORTS",
          origin: "USER_INPUT",
        },
      ],
    },
    {
      id: "3",
      claim: "The stipend offered is ₹40,000 per month",
      category: "COMPENSATION",
      status: "UNVERIFIED",
      confidence: 0.74,
      explanation:
        "The amount is stated in the offer document, which supports that it was offered — but no external source was available to confirm it against a published range for this role.",
      actions: [
        "Ask for the official offer letter on company letterhead",
        "Confirm the job listing independently on the company's careers site",
      ],
      evidence: [
        {
          source: "Message text",
          excerpt: "Stipend: ₹40,000 per month",
          stance: "NEUTRAL",
          origin: "USER_INPUT",
        },
      ],
    },
    {
      id: "4",
      claim: "No payment is requested from the candidate",
      category: "PAYMENT",
      status: "SUPPORTED",
      confidence: 0.97,
      explanation:
        "The message contains no request for money and explicitly asks the candidate only to confirm acceptance — consistent with standard hiring practice.",
      actions: ["Keep it that way: never pay any fee at any hiring stage"],
      evidence: [
        {
          source: "Message text",
          excerpt: "Please reply to confirm by 20 December.",
          stance: "SUPPORTS",
          origin: "USER_INPUT",
        },
      ],
    },
  ],
};

/**
 * Returns the matching mock report for a sample, or the suspicious report as
 * the default mock for arbitrary user text.
 */
export function getMockReport(text: string): AnalysisReport {
  const normalized = text.toLowerCase();
  if (normalized.includes("razorpay") || normalized.includes("ananya")) {
    return structuredClone(legitimateReport);
  }
  if (normalized.includes("shortlisted") || normalized.includes("schedule your interview")) {
    return structuredClone(ambiguousReport);
  }
  return structuredClone(suspiciousReport);
}

export const MOCK_LATENCY_MS = { min: 5200, max: 6800 } as const;
