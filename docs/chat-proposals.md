# Chat proposals

An agent can propose a follow-up chat at the end of its reply. The app shows the proposal as a
card under the reply: a title, a Start button, and collapsed Task and Context rows. Nothing runs
until the user presses Start. The started chat opens with "Started from <source chat>" and the same
Task and Context rows, and the Mac sidebar lists it under the chat it came from. When the started
chat ends a turn, its source gets a short report. This copies Claude Desktop's linked sessions.

The feature lives in the app (`packages/app/src/chat-proposals/`), except report back, which is the
built-in plugin `plugins/started-chat-report/`. The protocol and the providers are unchanged, so it
works with every provider.

## The proposal block

The agent writes one block per proposal. Each tag sits on a line of its own:

```text
<paseo_chat_proposal>
<title>Make first tools/list wait for startup health</title>
<model>Opus 5.5</model>
<thinking>xhigh</thinking>
<task>
The brief for a fresh agent: the task, the files, what done looks like.
</task>
<context>
Background the new chat needs from this one. Optional.
</context>
</paseo_chat_proposal>
```

`model`, `thinking` and `context` are optional.

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
a follow-up PR), propose it instead of only mentioning it. When the user asks you to hand off or to
continue in a new chat, propose that chat instead of creating an agent. End your reply with one
block per proposal, each tag on its own line:

<paseo_chat_proposal>
<title>Short imperative title</title>
<model>Optional. A model of your provider, only when the user named one or the work needs it.</model>
<thinking>Optional. A thinking level of that model, such as high or xhigh.</thinking>
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

A `model` or `thinking` tag overrides the source's setting. The provider never changes, so a
proposal can't move work from Claude to Codex. Agents write names the way people say them, so the
card matches a model by ID, alias or label and a thinking option by ID or label, case-insensitively,
against the source provider's catalog (`resolveProposalRuntime`). The card shows the matched labels
next to "Suggested chat". A name the catalog doesn't have disables Start and says which name failed,
so a typo never starts a chat on the wrong model.

A new model without a `thinking` tag runs at its own default thinking, because the source's option
may not exist on it.

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

## Report back

When a started chat ends a turn, the plugin sends its source one message: a lead line that tells the
model what the note is, then one block per started chat with the first 400 characters of its final
reply. The source chat shows each block as a "Report from <chat>" row with the reply collapsed
(`parseStartedChatReports`), not as a user bubble.

```text
<paseo_started_chat_report>
<chat>agent ID of the started chat</chat>
<title>Fix login</title>
<outcome>completed</outcome>
<reply>
Login fixed. Tests pass.
</reply>
</paseo_started_chat_report>
```

The plugin finds the source through `codex-ui.started-from-agent-id` and repeats that label and the
block format, so a change to either touches the plugin and `chat-proposals/proposal.ts`.

Every note starts a turn on the source, so each turn of a started chat costs its source a turn.

- A send interrupts a running turn. A source that is running, starting or waiting on a permission
  gets its notes when its own turn ends. Waiting notes keep the latest per started chat and go out
  as one message.
- A turn that answered notes reports nothing. The source's reply never flows back to the started
  chat, and a chain of started chats does not cascade turns up to the first source. An auto handoff
  briefing turn reports nothing either.
- Either side may hand off, as in the sidebar. A chat that auto handoff started reports through
  the started-from label of the first chat of its chain, and reports go to the newest live chat of
  the source's chain.
- At a source's turn end, its waiting reports and an auto handoff briefing request can go out
  together, and one interrupts the other. Auto handoff asks again at the next turn end; an
  interrupted report stays in the chat unanswered.
- A canceled turn reports nothing. Notes for a source whose turn was canceled wait for its next turn
  end or the next report.
- An archived source gets nothing. Waiting notes live in daemon memory and are lost when the daemon
  stops.

## Not built

- **Worktree isolation.** Start always uses the source's workspace.
