import { readFile } from "node:fs/promises";
import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import {
  fetchCmrDashboardHtml,
  parseCmrDashboardHtml,
} from "../lib/cmr-dashboard.js";

export default defineTool({
  description: prompt`
    Fetch and parse the CMR buckets dashboard for a DSP.
    Returns vans with open defects, focusing on No RO line rows.
    Default DSP is Ceiba Routes. Prefer this over guessing the list.
  `,
  effect: "read",
  inputSchema: z.object({
    dsp: z
      .string()
      .default("Ceiba Routes")
      .describe("DSP bucket name, e.g. Ceiba Routes. Use ALL for every DSP."),
    onlyNoRoLine: z
      .boolean()
      .default(true)
      .describe("When true, selected vans must show No RO line."),
    onlyInterest: z
      .boolean()
      .default(true)
      .describe(
        "When true, keep Critical defects and cracks/washer/side step/lights/mirrors.",
      ),
    useFixture: z
      .boolean()
      .optional()
      .describe(
        "When true, read fixtures/cmr-ceiba-sample.html instead of the live dashboard.",
      ),
  }),
  async execute({ dsp, onlyNoRoLine, onlyInterest, useFixture }) {
    const fixturePath =
      process.env.CMR_FIXTURE_PATH ??
      new URL("../../fixtures/cmr-ceiba-sample.html", import.meta.url).pathname;

    let fixtureHtml: string | undefined;
    const wantFixture =
      useFixture === true ||
      process.env.CMR_USE_FIXTURE === "1" ||
      (!process.env.CMR_DASHBOARD_PASSWORD &&
        !process.env.DASHBOARD_PASSWORD &&
        useFixture !== false);

    if (wantFixture) {
      fixtureHtml = await readFile(fixturePath, "utf8");
    }

    const { html, source } = await fetchCmrDashboardHtml({
      fixtureHtml,
    });
    const parsed = parseCmrDashboardHtml(html, {
      dsp,
      onlyNoRoLine,
      onlyInterest,
    });

    return {
      ...parsed,
      source,
      note:
        source === "fixture"
          ? "Parsed local fixture (set CMR_DASHBOARD_PASSWORD for live fetch)."
          : "Parsed live CMR dashboard.",
    };
  },
});
