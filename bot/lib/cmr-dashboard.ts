/**
 * Parse CMR buckets dashboard HTML into structured vans/defects.
 * Matches the table shape: VAN | DEFECTS OPEN | INSPECTED | RO LINES IN THIS BUCKET
 */

export type CmrDefect = {
  description: string;
  critical: boolean;
  foundAgain: boolean;
  seenCount: number | null;
};

export type CmrVan = {
  vanId: string;
  budgetNumber: string | null;
  plateOrUnit: string | null;
  defects: CmrDefect[];
  inspected: string | null;
  roLines: string;
  noRoLine: boolean;
  dsp: string;
};

export type CmrListResult = {
  dsp: string;
  vans: CmrVan[];
  selected: CmrVan[];
  summary: {
    defectCount: number;
    vanCount: number;
    selectedVanCount: number;
    selectedDefectCount: number;
  };
  source: "live" | "fixture";
};

const DEFAULT_URL =
  "https://budget-dashboards-sandy.vercel.app/buckets.html";

const INTEREST_PATTERNS = [
  /crack/i,
  /windshield\s+washer/i,
  /washer\s+fluid/i,
  /side\s+step/i,
  /missing\s+light/i,
  /clearance\s+light/i,
  /loose\s+mirror/i,
  /mirror/i,
  /tail\s+light/i,
];

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<script[\s\S]*?<\/script>/gi, " "));
}

function normalizeDsp(name: string): string {
  return name.replace(/\s+/g, " ").trim().toUpperCase();
}

function dspMatches(vanDsp: string, filter: string): boolean {
  const a = normalizeDsp(vanDsp);
  const b = normalizeDsp(filter);
  return a === b || a.includes(b) || b.includes(a);
}

function parseSeenCount(text: string): number | null {
  const m = text.match(/seen\s+(\d+)\s*x/i);
  return m ? Number(m[1]) : null;
}

function parseDefectChunk(raw: string): CmrDefect {
  const text = stripTags(raw);
  const critical = /\bcritical\b/i.test(text);
  const foundAgain = /found\s+again/i.test(text);
  const seenCount = parseSeenCount(text);
  let description = text
    .replace(/\bcritical\b/gi, " ")
    .replace(/found\s+again/gi, " ")
    .replace(/seen\s+\d+\s*x/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Prefer the clause before badge noise when still empty.
  if (!description) {
    description = text;
  }
  return { description, critical, foundAgain, seenCount };
}

function parseVanCell(raw: string): {
  vanId: string;
  budgetNumber: string | null;
  plateOrUnit: string | null;
} {
  const text = stripTags(raw);
  const budgetMatch = text.match(/Budget\s+(\d+)/i);
  const budgetNumber = budgetMatch ? budgetMatch[1]! : null;
  const withoutBudget = text
    .replace(/Budget\s+\d+/i, " ")
    .replace(/Add comment/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = withoutBudget.split(" ").filter(Boolean);
  const vanId = tokens[0] ?? "UNKNOWN";
  const plateOrUnit =
    tokens
      .slice(1)
      .find((t) => /^[A-Z0-9]{4,}$/i.test(t) && t !== vanId) ?? null;
  return { vanId, budgetNumber, plateOrUnit };
}

function isNoRoLine(roText: string): boolean {
  return /no\s+ro\s+line/i.test(roText);
}

function defectOfInterest(d: CmrDefect): boolean {
  if (d.critical) return true;
  return INTEREST_PATTERNS.some((re) => re.test(d.description));
}

/**
 * Split HTML into DSP sections using headers like
 * "CEIBA ROUTES - 18 DEFECTS ON 13 VANS."
 */
function splitDspSections(html: string): Array<{ dsp: string; body: string }> {
  const headerRe =
    /([A-Z][A-Z0-9 &/.-]{2,}?)\s*[-–—]\s*\d+\s+DEFECTS?\s+ON\s+\d+\s+VANS?/gi;
  const matches = [...html.matchAll(headerRe)];
  if (matches.length === 0) {
    return [{ dsp: "UNKNOWN", body: html }];
  }
  const sections: Array<{ dsp: string; body: string }> = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1]!.index ?? html.length) : html.length;
    sections.push({
      dsp: m[1]!.replace(/\s+/g, " ").trim(),
      body: html.slice(start, end),
    });
  }
  return sections;
}

function extractRows(sectionHtml: string): string[][] {
  const rows: string[][] = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  for (const tr of sectionHtml.matchAll(trRe)) {
    const cells = [...tr[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (c) => c[1] ?? "",
    );
    if (cells.length >= 4) {
      const head = stripTags(cells[0] ?? "").toLowerCase();
      if (head === "van" || head.includes("defects open")) continue;
      rows.push(cells);
    }
  }
  // Fallback: div/card layout without <tr> — look for Budget markers.
  if (rows.length === 0) {
    const blocks = sectionHtml.split(/(?=\bBudget\s+\d+)/i);
    for (const block of blocks) {
      if (!/Budget\s+\d+/i.test(block)) continue;
      const vanChunk = block.slice(0, 400);
      const inspected =
        block.match(
          /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+[A-Z][a-z]{2}\s+\d{1,2}/,
        )?.[0] ?? "";
      const ro =
        block.match(/No\s+RO\s+line|RO\s+line[^<\n]*/i)?.[0] ?? "No RO line";
      const defectParts = [...block.matchAll(
        /((?:Tail light|Clearance light|Side step|Windshield[^<\n]{0,80}|Mirror[^<\n]{0,80}|Side mirror[^<\n]{0,60})[^<\n]{0,120})/gi,
      )].map((m) => m[1]!);
      rows.push([
        vanChunk,
        defectParts.join(" || ") || block,
        inspected,
        ro,
      ]);
    }
  }
  return rows;
}

export function parseCmrDashboardHtml(
  html: string,
  options: { dsp?: string; onlyNoRoLine?: boolean; onlyInterest?: boolean } = {},
): Omit<CmrListResult, "source"> {
  const dspFilter = options.dsp ?? "Ceiba Routes";
  const onlyNoRoLine = options.onlyNoRoLine ?? true;
  const onlyInterest = options.onlyInterest ?? true;

  const vans: CmrVan[] = [];
  for (const section of splitDspSections(html)) {
    if (
      normalizeDsp(dspFilter) !== "ALL" &&
      !dspMatches(section.dsp, dspFilter)
    ) {
      continue;
    }
    for (const cells of extractRows(section.body)) {
      const vanMeta = parseVanCell(cells[0] ?? "");
      const defectRaw = cells[1] ?? "";
      const defectChunks = defectRaw
        .split(/\|\||(?=<br\s*\/?>)|(?=<(?:div|li|p)\b)/i)
        .map((c) => c.trim())
        .filter((c) => stripTags(c).length > 3);
      const defects = (defectChunks.length ? defectChunks : [defectRaw])
        .map(parseDefectChunk)
        .filter((d) => d.description.length > 0);
      const inspected = stripTags(cells[2] ?? "") || null;
      const roLines = stripTags(cells[3] ?? "") || "Unknown";
      vans.push({
        ...vanMeta,
        defects,
        inspected,
        roLines,
        noRoLine: isNoRoLine(roLines),
        dsp: section.dsp,
      });
    }
  }

  const selected = vans.filter((v) => {
    if (onlyNoRoLine && !v.noRoLine) return false;
    if (v.defects.length === 0) return false;
    if (onlyInterest && !v.defects.some(defectOfInterest)) return false;
    return true;
  });

  return {
    dsp: dspFilter,
    vans,
    selected,
    summary: {
      defectCount: vans.reduce((n, v) => n + v.defects.length, 0),
      vanCount: vans.length,
      selectedVanCount: selected.length,
      selectedDefectCount: selected.reduce((n, v) => n + v.defects.length, 0),
    },
  };
}

export async function unlockVercelPassword(
  baseUrl: string,
  password: string,
): Promise<string | null> {
  const origin = new URL(baseUrl).origin;
  const res = await fetch(`${origin}/_vercel_password`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      password,
      path: new URL(baseUrl).pathname,
    }),
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookieHeader =
    setCookie.length > 0
      ? setCookie.map((c) => c.split(";")[0]).join("; ")
      : res.headers.get("set-cookie")?.split(";")[0] ?? null;
  return cookieHeader;
}

export async function fetchCmrDashboardHtml(options: {
  url?: string;
  password?: string;
  fixtureHtml?: string;
}): Promise<{ html: string; source: "live" | "fixture" }> {
  if (options.fixtureHtml) {
    return { html: options.fixtureHtml, source: "fixture" };
  }
  const url = options.url ?? process.env.CMR_DASHBOARD_URL ?? DEFAULT_URL;
  const password =
    options.password ??
    process.env.CMR_DASHBOARD_PASSWORD ??
    process.env.DASHBOARD_PASSWORD;
  const headers: Record<string, string> = {
    accept: "text/html,application/xhtml+xml",
    "user-agent": "cmr-quote-agent/0.1",
  };
  if (password) {
    const cookie = await unlockVercelPassword(url, password);
    if (cookie) headers.cookie = cookie;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`CMR dashboard fetch failed: HTTP ${res.status} ${res.statusText}`);
  }
  return { html: await res.text(), source: "live" };
}

export { DEFAULT_URL, INTEREST_PATTERNS };
