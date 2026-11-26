import { RATES, stdHour, usd } from "@/lib/pricing";

/** Pricing page FAQ: shown on the page and emitted as FAQPage structured data. */
export const PRICING_FAQ: [string, string][] = [
  ["How does that compare to other sandboxes?", `For 4 vCPU and 8 GiB, Jasmine Cloud is ${usd(stdHour(), 3)} an hour. E2B and Daytona list about $0.331 for the same size, and Boat $0.036 plus a $20/month minimum (list prices checked Nov 23, 2026). Self-hosted Jasmine is free.`],
  ["Is the open-source version limited?", "No. Cloud runs the same binary you can install. We charge for running the machines, not for features."],
  ["How do I start on Cloud?", `Sign in, create an API key, and point JASMINE_URL at https://api.tryjasmine.dev. Every account starts with ${usd(RATES.trialCredit, 0)} of credit, no card needed. Top up from $10 when you want more.`],
  ["Can a runaway agent run up a bill?", "Every sandbox has a timeout (one hour unless you set another, up to a day), and usage comes out of credit you bought up front, so you can never owe more than you put in. At $0, running sandboxes are paused, never deleted."],
  ["How does billing work?", "Per second, from create to delete, for the vCPUs and memory a sandbox was given. A paused sandbox keeps its memory and running processes and is billed only for the storage its snapshot uses. No minimum, no charge per start, no egress fees."],
  ["Do API keys work today?", `Yes. Create one in the dashboard and set it as JASMINE_API_KEY on your self-hosted daemon and in your agent; the same key will work on Cloud.`],
  ["Can I move between self-hosted and Cloud?", "Yes. The API and SDKs are the same; change JASMINE_URL."],
];
