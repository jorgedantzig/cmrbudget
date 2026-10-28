import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description:
    "Fetches the Ceiba Routes CMR list (fixture) and drafts without sending.",
  async test(t) {
    await t.send(
      'Run the CMR draft workflow for Ceiba Routes using the fixture. Call fetch-cmr-list with useFixture true. Summarize vans with No RO line. Do not send any email.',
    );
    t.succeeded();
    t.calledTool("fetch-cmr-list");
    t.notCalledTool("send-ro-quote");
  },
});
