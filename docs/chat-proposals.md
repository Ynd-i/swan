# Chat proposals

An agent can propose a follow-up chat at the end of its reply. The app shows the proposal as a
card under the reply: a title, a Start button, and collapsed Task and Context rows. Nothing runs
until the user presses Start. The started chat opens with "Started from <source chat>" and the same
Task and Context rows, and the Mac sidebar lists it under the chat it came from. This copies
Claude Desktop's linked sessions.

The feature lives in the app (`packages/app/src/chat-proposals/`). The daemon, the protocol and the
providers are unchanged, so it works with every provider.

## The proposal block

The agent writes one block per proposal. Each tag sits on a line of its own:

```text
<paseo_chat_proposal>
<title>Make first tools/list wait for startup health</title>
<task>
The brief for a fresh agent: the task, the files, what done looks like.
</task>
<context>
Background the new chat needs from this one. Optional.
</context>
</paseo_chat_proposal>
```

`splitChatProposals` takes complete blocks out of the reply before the reply is split into Markdown
blocks (`agent-stream/presentation.ts`), so a block never spans display rows. The cards hang off the
message's last block.

- A tag inside fenced code, or in the middle of a line, stays text. An agent can explain the format
  without making a card.
- An unclosed block hides from its opening line on, so a streaming reply never shows the raw tag.
  A reply that never closes its block also stays hidden from there.
- A closed block without a title and a task stays text.

## Teach agents the format

No agent writes the block until its instructions describe it. Add this text to the host's system
prompt (Settings > Host > Orchestration) or to your global `AGENTS.md`. The daemon adds the host
prompt when a chat's session starts, so start a new chat after you change it:

```text
When follow-up work belongs in its own chat (a separate fix, a piece you could not finish or verify,
a follow-up PR), propose it instead of only mentioning it. End your reply with one block per
proposal, each tag on its own line:

<paseo_chat_proposal>
<title>Short imperative title</title>
<task>
A complete brief for an agent with no context: the task, the files, what done looks like.
</task>
<context>
Decisions and background from this chat that the new chat needs.
</context>
</paseo_chat_proposal>

The user sees a card and starts the chat with one click. Nothing runs until then. Do not propose
work you are about to do yourself, and propose at most three chats per reply.
```

## Starting the chat

Start creates the chat in the source's workspace with the source's provider, model, mode, thinking
option and feature values (`buildProposedChatRequest` in `chat-proposals/start.ts`). The first prompt
wraps the task and context in `<paseo_started_chat>`, and the chat view shows that prompt as the
Task and Context rows instead of a user bubble (`presentUserMessage`). The model reads the same tags.

## Linking, not parenting

The started chat carries two app-owned labels and no `paseo.parent-agent-id`:

| Label                            | Value                                                        |
| -------------------------------- | ------------------------------------------------------------ |
| `codex-ui.started-from-agent-id` | The source chat's agent ID                                   |
| `codex-ui.started-from-proposal` | `<source agent ID>:<hash of title and task>` (`proposalKey`) |

A parent label would make the chat a subagent: it would leave the sidebar for the source's subagent
track, and archiving the source would archive it. See
[agent lifecycle](agent-lifecycle.md#relationships).

The card finds its started chat through the proposal label, so a reload shows the started chat's
status instead of a second Start button. If the store has no agent with that label, for example
after the started chat was archived and dropped from the list, Start shows again.

## Sidebar nesting

`buildDesktopChatSidebar` folds handoff chains first, then nests each started chat under the row
that now shows its source (`foldStartedChats` in `components/desktop/desktop-chat-model.ts`):

- Either side may be a handoff chain. The link is read from any chat of the started chain and
  resolves to the source's newest chat.
- A started chat in another workspace, such as a worktree, still nests under its source. Its
  workspace counts as holding a chat, so it gets no empty placeholder row.
- A pinned started chat keeps its own row in Pinned. A started chat whose source is archived or
  hidden stays at the top level.
- Started chats are always shown, one level deeper per link, and keep their own pin and archive
  actions.

## Not built

- **Report back.** Claude Desktop sends the source a note when the started chat ends a turn. That
  needs a server-side `agent.turn_ended` hook, so it is not part of this app-only feature.
- **Worktree isolation.** Start always uses the source's workspace.
