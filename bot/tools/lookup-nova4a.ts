import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

type NovaLookupResult = {
  ok: boolean;
  stub: boolean;
  query: {
    budgetNumber: string | null;
    plateOrUnit: string | null;
    vanId: string | null;
    vin: string | null;
  };
  vehicle: {
    year: string | null;
    make: string | null;
    model: string | null;
    vin: string | null;
    mileage: number | null;
    customer: string | null;
  } | null;
  message: string;
};

export default defineTool({
  description: prompt`
    Look up a van in Nova4a for year/make/model/VIN/mileage enrichment.
    Stub until NOVA4A_* credentials and bridge URL are configured.
    Prefer Budget number; fall back to plate/unit or VIN.
  `,
  effect: "read",
  inputSchema: z.object({
    budgetNumber: z.string().optional(),
    plateOrUnit: z.string().optional(),
    vanId: z.string().optional(),
    vin: z.string().optional(),
  }),
  async execute(input): Promise<NovaLookupResult> {
    const query = {
      budgetNumber: input.budgetNumber ?? null,
      plateOrUnit: input.plateOrUnit ?? null,
      vanId: input.vanId ?? null,
      vin: input.vin ?? null,
    };
    if (
      !query.budgetNumber &&
      !query.plateOrUnit &&
      !query.vanId &&
      !query.vin
    ) {
      return {
        ok: false,
        stub: true,
        query,
        vehicle: null,
        message: "Provide budgetNumber, plateOrUnit, vanId, or vin.",
      };
    }

    const base = process.env.NOVA4A_BRIDGE_URL ?? process.env.NOVA4A_BASE_URL;
    const token = process.env.NOVA4A_API_TOKEN ?? process.env.NOVA4A_PASSWORD;

    if (!base || !token) {
      return {
        ok: true,
        stub: true,
        query,
        vehicle: {
          year: null,
          make: null,
          model: null,
          vin: query.vin,
          mileage: null,
          customer: "Ceiba Routes",
        },
        message:
          "Nova4a bridge not configured (set NOVA4A_BRIDGE_URL and NOVA4A_API_TOKEN). Returning stub enrichment.",
      };
    }

    const res = await fetch(`${base.replace(/\/$/, "")}/lookup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(query),
    });
    if (!res.ok) {
      return {
        ok: false,
        stub: false,
        query,
        vehicle: null,
        message: `Nova4a lookup failed: HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as {
      year?: string;
      make?: string;
      model?: string;
      vin?: string;
      mileage?: number;
      customer?: string;
    };
    return {
      ok: true,
      stub: false,
      query,
      vehicle: {
        year: body.year ?? null,
        make: body.make ?? null,
        model: body.model ?? null,
        vin: body.vin ?? null,
        mileage: body.mileage ?? null,
        customer: body.customer ?? null,
      },
      message: "Nova4a lookup ok.",
    };
  },
});
