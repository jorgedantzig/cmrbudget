import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

const SEND_PHRASE = /\b(please\s+send|send\s+(?:the\s+)?(?:quote|quotes|email|emails))\b/i;

type SendResult = {
  ok: boolean;
  stub: boolean;
  sent: boolean;
  vanIds: string[];
  message: string;
};

export default defineTool({
  description: prompt`
    Email RO Writer quotes for named vans ONLY after the human explicitly
    asks to send (e.g. "please send" / "send the quotes").
    Requires confirmSend=true and a matching authorizationPhrase.
    Never call this for draft-only or review requests.
  `,
  effect: "write",
  needsApproval: true,
  inputSchema: z.object({
    vanIds: z.array(z.string()).min(1),
    draftIds: z.array(z.string()).optional(),
    confirmSend: z
      .boolean()
      .describe("Must be true. Set only when the user explicitly asked to send."),
    authorizationPhrase: z
      .string()
      .describe(
        "Verbatim user phrase authorizing send, e.g. \"please send RE1 and RE12\".",
      ),
  }),
  dryRunResult: ({ vanIds }) => ({
    ok: true,
    stub: true,
    sent: false,
    vanIds,
    message: "Dry run: email not sent.",
  }),
  async execute({ vanIds, draftIds, confirmSend, authorizationPhrase }): Promise<SendResult> {
    if (!confirmSend) {
      return {
        ok: false,
        stub: false,
        sent: false,
        vanIds,
        message: "Refused: confirmSend must be true.",
      };
    }
    if (!SEND_PHRASE.test(authorizationPhrase)) {
      return {
        ok: false,
        stub: false,
        sent: false,
        vanIds,
        message:
          'Refused: authorizationPhrase must include an explicit send request (e.g. "please send").',
      };
    }

    const bridge = process.env.RO_BRIDGE_URL;
    const token = process.env.RO_BRIDGE_TOKEN;
    if (!bridge) {
      return {
        ok: true,
        stub: true,
        sent: false,
        vanIds,
        message:
          "RO bridge not configured (set RO_BRIDGE_URL). Send gated OK but email was not delivered.",
      };
    }

    const res = await fetch(`${bridge.replace(/\/$/, "")}/quotes/send`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        vanIds,
        draftIds,
        authorizationPhrase,
      }),
    });
    if (!res.ok) {
      return {
        ok: false,
        stub: false,
        sent: false,
        vanIds,
        message: `Send failed: HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      stub: false,
      sent: true,
      vanIds,
      message: `Sent quotes for: ${vanIds.join(", ")}.`,
    };
  },
});
