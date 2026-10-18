import { describe, expect, test } from "vitest";
import { codexHookTrustHash } from "./session-hooks.js";

// Each hash is the `currentHash` that `hooks/list` reported in Codex 0.159.0 for the same hook
// in a $CODEX_HOME/hooks.json. hooks.real.e2e.test.ts catches a Codex release that changes it.
const MEASURED = [
  {
    eventName: "user_prompt_submit",
    matcher: undefined,
    handler: { command: "echo UserPromptSubmit >> /tmp/r1-codex/markers/thread-trusted.log" },
    hash: "sha256:0bee4aa1f31d7f80303efaa2afa1ba9c1a697605ea4cda7e914c21791d2afdc1",
  },
  {
    eventName: "pre_tool_use",
    matcher: "^(Bash|shell|functions.exec_command)$",
    handler: {
      command: "$HOME/.agents/hooks/check-command.sh",
      timeout: 30,
      statusMessage: "Checking command",
    },
    hash: "sha256:5819391e4d85c01c0066e3196e61c53801ebeeebfa973b4918b24c413cf796cd",
  },
  {
    eventName: "pre_tool_use",
    matcher: "^(Bash|shell|functions.exec_command)$",
    handler: { command: "echo second" },
    hash: "sha256:92d27aad95ed3246a4dde4e8f987ed4c4e46566829e2ea70cc24e12defc9f2e7",
  },
  {
    eventName: "pre_tool_use",
    matcher: "",
    handler: { command: "echo empty-matcher", async: true },
    hash: "sha256:f6616767c2eb1396495e355c012889deea29cae6ce361763c317333e771105c9",
  },
  {
    eventName: "permission_request",
    matcher: "*",
    handler: { command: "echo permission" },
    hash: "sha256:0972f862d7ffc7d2ef665a59eb6c6deb64de97d99fba11e23fce4da0aa90950d",
  },
  {
    eventName: "post_tool_use",
    matcher: "Edit|Write",
    handler: { command: "echo post" },
    hash: "sha256:74ed7b02c705bdafe739da4f8e04dd20c0d59058c2b6324ed57799077809b64c",
  },
  {
    eventName: "post_tool_use",
    matcher: "Edit|Write",
    handler: { command: "echo post", timeout: 600, async: false },
    hash: "sha256:74ed7b02c705bdafe739da4f8e04dd20c0d59058c2b6324ed57799077809b64c",
  },
  {
    eventName: "session_start",
    matcher: undefined,
    handler: { command: 'printf \'%s\\n\' "你好 ✓" "back\\\\slash" > /dev/null' },
    hash: "sha256:1a790fed7b75c6cba1e64e87aaf2a8733aed306c97b917ddb521ebcf51b26cdb",
  },
  {
    eventName: "stop",
    matcher: undefined,
    handler: { command: "echo one\necho two" },
    hash: "sha256:ea264bc9fac765db70f3ed641cad3ae95a04f59b84afdd6bbc3f7023637c8fef",
  },
  {
    eventName: "subagent_stop",
    matcher: undefined,
    handler: { command: "echo subagent-stop" },
    hash: "sha256:8dff196cee2c6b98b40d90eece4a50be689f83f4521ecc080203a1dabd3b6c18",
  },
  {
    eventName: "session_end",
    matcher: "",
    handler: { command: "echo first-of-two" },
    hash: "sha256:d876491b802e0958f7a12e845c1f6a4888bcc3e9b8cd719adc7ad60cfccd5b1b",
  },
  {
    eventName: "session_end",
    matcher: "",
    handler: { command: "echo second-of-two", timeout: 5 },
    hash: "sha256:5f1c19f265d5f277019cb73853d9b5927956c2ac7a2237253da166d3c0c6b7ff",
  },
  {
    eventName: "interrupt",
    matcher: undefined,
    handler: { command: "echo Interrupt default" },
    hash: "sha256:bdd566446541f0c018bdf519851fdadab09ebdd0e85c556b710ac70153ee59ab",
  },
  {
    eventName: "interrupt",
    matcher: undefined,
    handler: { command: "echo Interrupt huge", timeout: 100000 },
    hash: "sha256:e8b048a8f3c3b9d38e62a636dd732168de0379eac2b7e300d28f53100c0814b4",
  },
];

describe("codexHookTrustHash", () => {
  test.each(MEASURED)("matches Codex for $eventName $handler.command", (sample) => {
    expect(
      codexHookTrustHash({
        eventName: sample.eventName,
        matcher: sample.matcher,
        handler: { type: "command", ...sample.handler },
      }),
    ).toBe(sample.hash);
  });
});
