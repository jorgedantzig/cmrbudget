import { defineAgent } from "@grok/agent-sdk";

export default defineAgent({
  name: "cmr-quote",
  description:
    "Daily CMR dashboard → Nova4a → RO Writer drafts; email only after explicit send.",
  model: {
    id: "grok-4.7",
    params: [
      { id: "reasoning_effort", value: "high" },
      { id: "fast", value: "true" },
    ],
  },
  // Domain assistant: read workspace/memory; no shell by default.
  tools: ["read", "grep", "glob", "ls"],
  hosting: {
    egressDomains: [
      "budget-dashboards-sandy.vercel.app",
      "app.nova4a.com",
    ],
    secretNames: [
      "CMR_DASHBOARD_PASSWORD",
      "CMR_DASHBOARD_URL",
      "NOVA4A_BRIDGE_URL",
      "NOVA4A_API_TOKEN",
      "NOVA4A_USERNAME",
      "NOVA4A_PASSWORD",
      "RO_BRIDGE_URL",
      "RO_BRIDGE_TOKEN",
      "CMR_QUOTE_SLACK_BOT_TOKEN",
      "CMR_QUOTE_SLACK_APP_TOKEN",
    ],
  },
});
