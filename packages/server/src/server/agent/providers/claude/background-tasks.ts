import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import type { AgentBackgroundTask } from "../../agent-sdk-types.js";

type BackgroundTasksChangedMessage = Extract<
  SDKMessage,
  { type: "system"; subtype: "background_tasks_changed" }
>;

/**
 * Subagents and workflows are background tasks too, but the subagents track already shows them.
 *
 * Verified on the wire (Claude Code 2.1.300): a backgrounded Bash command and a Monitor both
 * announce as `local_bash`, so the task type cannot tell them apart and is not forwarded.
 */
const SUBAGENT_TRACK_TASK_TYPES: ReadonlySet<string> = new Set(["local_agent", "local_workflow"]);

/**
 * Claude Code's level signal for live background work: every payload is the full set, so a
 * missed start or end edge cannot leave a task stuck running.
 */
export function readClaudeBackgroundTasks(
  message: BackgroundTasksChangedMessage,
): AgentBackgroundTask[] {
  return message.tasks
    .filter((task) => !SUBAGENT_TRACK_TASK_TYPES.has(task.task_type))
    .map((task) => ({ id: task.task_id, description: task.description }));
}
