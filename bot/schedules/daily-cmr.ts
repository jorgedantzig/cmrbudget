import { defineSchedule } from "@grok/agent-sdk/schedules";

/**
 * 10:30 America/New_York during EDT = 14:30 UTC.
 * Schedules are UTC-only; after DST ends (EST) this is 09:30 ET — adjust to
 * `30 15 * * *` if you need 10:30 Eastern year-round without a TZ-aware cron.
 */
export default defineSchedule({
  cron: "30 14 * * *",
  markdown: `Run the daily CMR quote draft job for Ceiba Routes.

1. Call fetch-cmr-list for DSP "Ceiba Routes" (No RO line + defect interest rules).
2. For each selected van, call lookup-nova4a then draft-ro-estimate.
3. Post a concise draft summary (van, budget, defects, draft ids).
4. Do NOT call send-ro-quote. Wait for an explicit human "please send …".`,
});
