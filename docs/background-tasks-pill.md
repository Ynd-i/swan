# Background tasks pill

A read-only composer pill that counts the shell commands and monitors an agent left running in the background. It sits in the track bar next to the tasks and subagents pills. Phase 1 covers Claude only.

## Why

Claude sessions use `perTaskStopAffordance: true`, so Esc stops only the main turn. Background shells and monitors keep running. The subagents track filters them out, so before this pill nothing in the UI showed them.

## Data flow

1. Claude Code emits `system/background_tasks_changed` with the full set of live background tasks. It is a level signal: each payload replaces the previous set.
2. `providers/claude/background-tasks.ts` drops `local_agent` and `local_workflow` tasks (the subagents track shows them) and emits the `background_tasks_changed` stream event.
3. `AgentManager` stores the set on the live agent (never persisted) and emits agent state.
4. `toAgentPayload` always sends `backgroundTasks`, empty included. Older daemons and stored agents omit it.
5. The app keeps it on `Agent.backgroundTasks`. `acceptAgentDirectoryUpdate` adopts it even when `updatedAt` did not advance, the same way it handles `lastUsage`.
6. `composer/background-tasks` renders the pill while the set is non-empty.

The set is cleared when the Claude process dies or is retired (`failRunningRuntimeTasks`) and when the agent closes. Claude Code sends nothing at process start, so a new process starts empty.

## Wire facts (Claude Code 2.1.300, 2026-10-15)

Captured with the Agent SDK against the installed `claude` binary:

- `background_tasks_changed` arrives before the matching `task_started`, and again when a task ends.
- A backgrounded Bash command and a `Monitor` both report `task_type: "local_bash"`. The type cannot tell them apart, so it is not forwarded and every row uses the terminal icon.
- The payload carries `task_id`, `run_id`, `task_type` and `description`.

## Verification

- Unit: Claude translation and runtime-exit clearing (`agent.runtime-exit.test.ts`), manager snapshot (`agent-manager.test.ts`), app update policy (`agent-directory-update-policy.test.ts`).
- Daemon e2e: the fake provider's `Emit a background task` prompt reaches a WebSocket client on the agent snapshot (`daemon-client.e2e.test.ts`).
- Not checked in a rendered window.

## Not in phase 1

- A stop button. It needs a new RPC and `query.stopTask(taskId)`.
- Other providers. They can emit the same stream event.
- `ScheduleWakeup`, which belongs to `/loop` and is not a background task.
