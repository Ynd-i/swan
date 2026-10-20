# Auto handoff

When an agent's context passes a threshold, the built-in `auto-handoff` plugin
(`plugins/auto-handoff/`) asks that agent for a handoff briefing and starts a fresh agent with it.
The new agent appears in the sidebar as the chat; the source nests greyed under it. Nothing is
archived.

## Threshold

The threshold is the smaller of an absolute cap (default 350,000 tokens) and a fraction of the
model's window (default 0.75). A 1M-token model hands off at 350k; a 200k model hands off at 150k,
which stays under Claude's auto-compaction point. Keep the threshold under every provider's own
compaction point, or compaction lowers `contextWindowUsedTokens` and the handoff never fires.

The plugin reads `lastUsage.contextWindowUsedTokens`, a snapshot of current fullness, not
cumulative spend. `lastUsage` lives in memory, so after a daemon restart nothing happens until the
agent's next turn reports usage.

## Flow

1. On `agent.turn_ended` with outcome `completed`, the agent `idle` and no pending permission, the
   plugin compares usage with the threshold. `usage_updated` fires mid-turn, so the plugin never
   acts on it. A Paseo subagent (an agent with `paseo.parent-agent-id`) never hands off: its
   parent waits on its id, and a continuation would be a root chat the parent never hears from.
   It runs until it finishes or its provider compacts it.
   Past the threshold, the plugin waits while the source has running subagents, both provider
   subagents (Claude Task agents and workflows) and Paseo subagents that are `initializing` or
   `running`. They report to the source's id, so a continuation would never see their results.
   A finish report starts a turn on the source: Claude does this for its own subagents, and
   `notifyOnFinish` does it for Paseo subagents. The check runs again when that turn ends.
   Background shells and monitors do not hold the handoff yet.
2. It sends the source agent a briefing request wrapped in `<paseo_auto_handoff>`. The request
   quotes the user's latest message (skipping earlier requests by that tag) so the briefing is
   written around what the user asked for last. Its `## Active skills` section lists the skills
   the user turned on, such as `/poteto-mode`, and the child prompt tells the child to turn them on
   again. A skill loaded by a slash command lives in the source's context only; a session-start hook
   that offers the skill runs in the child too, but does not load it.
3. When that turn ends, the plugin takes the assistant text after the turn's last tool call, checks
   it has `## Task` and `## Current state`, and creates the new agent in the source's workspace with
   the same provider, model, mode, thinking option and feature values, such as fast mode. A
   source without a model gets the provider default, which is what it ran on.

The plugin launches the child itself instead of telling the agent to run the `paseo-handoff`
skill. That works for every provider, with or without Paseo's MCP tools or skills, and the fake
provider can drive it in tests. To hand off to a different or cheaper model, run `paseo-handoff`
by hand.

## Linking, not parenting

The child carries `paseo.handoff-from-agent-id` and no `paseo.parent-agent-id`. A parented child
would be a subagent: it would live only in the source's subagent track, out of the sidebar, and
archiving the source would cascade to it. See [agent lifecycle](agent-lifecycle.md#relationships).

The Mac chat sidebar folds each chain in `buildDesktopChatSidebar`
(`packages/app/src/components/desktop/desktop-chat-model.ts`): the newest unarchived chat is the
row, earlier ones nest under its chevron. Archived links are walked through. Pinning, archiving
and custom sections belong to the whole chain, so a handoff keeps the chat where the user put it.
Nested rows show only their status; pin and archive live on the head row and act on every chat
of the chain, earliest first, so archiving never promotes an earlier chat to the head for a moment.

## Latch and retries

State is per source agent and in memory: `idle → requested → spawned`, or `failed`. `spawned` and
`failed` never trigger again for that agent; the child has its own state and can hand off later.

- A child never hands off on its first turn. That turn only reads the briefing, and the system
  prompt plus briefing is already about 45k tokens on Claude: with a threshold below that, every
  child handed off again as soon as it started.
- Children are titled `[Handoff N] <source title>`. N comes from the `auto-handoff.generation`
  label, so a renamed chat keeps counting. The source title is read from the agent snapshot; the
  hook agent's title is empty for chats whose title was generated.

- A reply that is not a briefing gets one retry that says "Reply with the briefing only", then
  `failed` (`maxAttempts`, default 2).
- If the user interrupts the briefing turn, or the agent is busy when it ends, the request is
  dropped and asked again at the next clean turn end.
- The handoff note is the briefing request itself in the source's timeline. A first prompt is
  recorded in the child's timeline only because the plugin sends a `clientMessageId`.

## Settings

Host settings `auto-handoff`: `enabled`, `absoluteThresholdTokens`, `windowFraction`,
`maxAttempts`. Environment variables override them for tests and one-off hosts:
`PASEO_AUTO_HANDOFF_ENABLED` (`1` or `0`), `PASEO_AUTO_HANDOFF_THRESHOLD_TOKENS`,
`PASEO_AUTO_HANDOFF_WINDOW_FRACTION`.

Claude Code hooks that do their own handoff also run inside Paseo-managed Claude agents, because
the Agent SDK loads user settings. Make them exit when `PASEO_AGENT_ID` is set, or a context limit
produces two handoffs.
