import {
  defaultGitHubAuth,
  githubChannel,
} from "@grok/agent-sdk/channels/github";

/**
 * GitHub stubs/hooks for cmrbudget.
 *
 * Repo scope is passed at serve/deploy time so local tool/run work without a
 * Cursor credential:
 *   npx --yes "@grok/agent-sdk@0.4.0" serve --dir . --cursor-events --repo jorgedantzig/cmrbudget
 *   npx --yes "@grok/agent-sdk@0.4.0" deploy --dir . --cursor-events-repo jorgedantzig/cmrbudget
 */
export default githubChannel({
  botName: "cmr-quote",
  cursorAccount: true,
  onPullRequest: (ctx, pr) => {
    if (pr.action !== "opened" && pr.action !== "reopened") {
      return null;
    }
    return {
      auth: defaultGitHubAuth(ctx),
      message: `Pull request ${pr.action}: ${pr.url}. Summarize impact on the CMR Quote agent if any; otherwise say no agent impact.`,
    };
  },
  onComment: (ctx, comment) => {
    const body = comment.body.trim().toLowerCase();
    if (!body.startsWith("@cmr-quote") && !body.startsWith("/cmr")) {
      return null;
    }
    return {
      auth: defaultGitHubAuth(ctx),
      message: comment.body,
    };
  },
});
