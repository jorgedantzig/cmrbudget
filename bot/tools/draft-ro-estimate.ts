import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

type DraftResult = {
  ok: boolean;
  stub: boolean;
  draftId: string | null;
  vanId: string;
  budgetNumber: string | null;
  defectCount: number;
  message: string;
};

export default defineTool({
  description: prompt`
    Draft a repair-order estimate in RO Writer via the shop-PC bridge.
    Does NOT email the customer. Use after fetch-cmr-list and lookup-nova4a.
    Stub until RO_BRIDGE_URL is configured.
  `,
  effect: "idempotent",
  inputSchema: z.object({
    vanId: z.string(),
    budgetNumber: z.string().optional(),
    plateOrUnit: z.string().optional(),
    dsp: z.string().default("Ceiba Routes"),
    defects: z
      .array(
        z.object({
          description: z.string(),
          critical: z.boolean().optional(),
        }),
      )
      .min(1),
    nova: z
      .object({
        year: z.string().nullable().optional(),
        make: z.string().nullable().optional(),
        model: z.string().nullable().optional(),
        vin: z.string().nullable().optional(),
        mileage: z.number().nullable().optional(),
      })
      .optional(),
  }),
  dryRunResult: ({ vanId, budgetNumber, defects }) => ({
    ok: true,
    stub: true,
    draftId: `dry-run-${vanId}`,
    vanId,
    budgetNumber: budgetNumber ?? null,
    defectCount: defects.length,
    message: "Dry run: draft not written to RO Writer.",
  }),
  async execute(input): Promise<DraftResult> {
    const bridge = process.env.RO_BRIDGE_URL;
    const token = process.env.RO_BRIDGE_TOKEN;
    const key = `draft:${input.dsp}:${input.vanId}:${input.budgetNumber ?? ""}`;

    if (!bridge) {
      return {
        ok: true,
        stub: true,
        draftId: `stub-${input.vanId}-${Date.now()}`,
        vanId: input.vanId,
        budgetNumber: input.budgetNumber ?? null,
        defectCount: input.defects.length,
        message:
          "RO bridge not configured (set RO_BRIDGE_URL). Stub draft recorded for review; not written to RO Writer.",
      };
    }

    const res = await fetch(`${bridge.replace(/\/$/, "")}/estimates`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        idempotencyKey: key,
        vanId: input.vanId,
        budgetNumber: input.budgetNumber,
        plateOrUnit: input.plateOrUnit,
        dsp: input.dsp,
        defects: input.defects,
        nova: input.nova,
      }),
    });
    if (!res.ok) {
      return {
        ok: false,
        stub: false,
        draftId: null,
        vanId: input.vanId,
        budgetNumber: input.budgetNumber ?? null,
        defectCount: input.defects.length,
        message: `RO draft failed: HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as { draftId?: string };
    return {
      ok: true,
      stub: false,
      draftId: body.draftId ?? null,
      vanId: input.vanId,
      budgetNumber: input.budgetNumber ?? null,
      defectCount: input.defects.length,
      message: "Draft estimate created in RO Writer.",
    };
  },
});
