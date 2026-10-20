import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect } from "vitest";

import type { AgentTimelineItem } from "../../agent/agent-sdk-types.js";
import type { DaemonClient } from "../../test-utils/daemon-client.js";

export interface RewindSessionBase {
  agentId: string;
  cwd: string;
  scratchPath?: string;
}

export function tmpRewindCwd(prefix: string, options?: { realpath?: boolean }): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  return options?.realpath ? realpathSync(dir) : dir;
}

export function closeRewindSession(session: RewindSessionBase): void {
  rmSync(session.cwd, { recursive: true, force: true });
}

export function timelineItems(
  timeline: Awaited<ReturnType<DaemonClient["fetchAgentTimeline"]>>,
): AgentTimelineItem[] {
  return timeline.entries.map((entry) => entry.item);
}

export function textByRole(
  items: AgentTimelineItem[],
  role: "user_message" | "assistant_message",
): string {
  return items
    .filter((item) => item.type === role)
    .map((item) => item.text)
    .join("\n");
}

export function userMessageIdForToken(items: AgentTimelineItem[], token: string): string {
  const item = items.find(
    (candidate) => candidate.type === "user_message" && candidate.text.includes(token),
  );
  if (!item?.messageId) {
    throw new Error(`Timeline did not contain a user message id for ${token}`);
  }
  return item.messageId;
}

export async function fetchTimelineItems(
  client: DaemonClient,
  agentId: string,
): Promise<AgentTimelineItem[]> {
  const timeline = await client.fetchAgentTimeline(agentId, {
    direction: "tail",
    limit: 0,
    projection: "canonical",
  });
  return timelineItems(timeline);
}

export async function readScratchFile(session: { scratchPath: string }): Promise<string> {
  return await readFile(session.scratchPath, "utf8");
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function waitForTimelineItems(
  client: DaemonClient,
  agentId: string,
  predicate: (items: AgentTimelineItem[]) => boolean,
): Promise<AgentTimelineItem[]> {
  const existingItems = await fetchTimelineItems(client, agentId);
  if (predicate(existingItems)) {
    return existingItems;
  }

  return await new Promise<AgentTimelineItem[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for timeline items for ${agentId}`));
    }, 60_000);
    const unsubscribe = client.on("agent_update", (message) => {
      if (message.payload.kind !== "upsert" || message.payload.agent.id !== agentId) {
        return;
      }
      void (async () => {
        try {
          const items = await fetchTimelineItems(client, agentId);
          if (!predicate(items)) {
            return;
          }
          clearTimeout(timeout);
          unsubscribe();
          resolve(items);
        } catch (error) {
          clearTimeout(timeout);
          unsubscribe();
          reject(error);
        }
      })();
    });
  });
}

const NATIVE_FORK_PROMPTS = [
  "Remember this early fact: MANGO-17. Reply with just OK. Do not use tools.",
  "Run the shell command `echo TOOL-RESULT-58` and reply with its output only.",
  "Reply with exactly: CHOSEN-TURN-3. Do not use tools.",
  "Reply with exactly: SENTINEL-99. Do not use tools.",
];

function userTexts(items: AgentTimelineItem[]): string[] {
  return items.flatMap((item) => (item.type === "user_message" ? [item.text] : []));
}

/**
 * Forks a real conversation through its third turn, releases the child's runtime, and checks
 * that the child resumes its own provider session with exactly the inherited prefix.
 */
export async function expectRealNativeFork(input: {
  client: DaemonClient;
  agentId: string;
  turnTimeoutMs: number;
  releaseRuntime: (agentId: string) => Promise<void>;
}): Promise<void> {
  const { client, agentId } = input;
  for (const prompt of NATIVE_FORK_PROMPTS) {
    await client.sendMessage(agentId, prompt);
    expect((await client.waitForFinish(agentId, input.turnTimeoutMs)).status).toBe("idle");
  }
  const source = await client.fetchAgentTimeline(agentId, { direction: "tail", limit: 0 });
  const chosen = source.entries.find(
    (entry) => entry.item.type === "assistant_message" && entry.item.text.includes("CHOSEN-TURN"),
  );
  if (!chosen) throw new Error("The source timeline has no reply to the chosen turn");

  const childId = await client.forkAgent(agentId, { epoch: source.epoch, seq: chosen.seqEnd });

  const childItems = await fetchTimelineItems(client, childId);
  expect(userTexts(childItems)).toEqual(NATIVE_FORK_PROMPTS.slice(0, 3));
  expect(JSON.stringify(childItems)).toContain("TOOL-RESULT-58");
  expect(JSON.stringify(childItems)).not.toContain("SENTINEL-99");
  const sourceAgent = (await client.fetchAgent(agentId))?.agent;
  const childAgent = (await client.fetchAgent(childId))?.agent;
  expect(childAgent?.persistence?.sessionId).toBeTruthy();
  expect(childAgent?.persistence?.sessionId).not.toBe(sourceAgent?.persistence?.sessionId);
  expect(childAgent?.labels).toEqual({ "paseo.forked-from-agent-id": agentId });

  await input.releaseRuntime(childId);
  const followUp =
    "What was the early fact I asked you to remember? Reply with just the fact. Do not use tools.";
  await client.sendMessage(childId, followUp);
  expect((await client.waitForFinish(childId, input.turnTimeoutMs)).status).toBe("idle");
  const childAfter = await fetchTimelineItems(client, childId);
  expect(userTexts(childAfter)).toEqual([...NATIVE_FORK_PROMPTS.slice(0, 3), followUp]);
  expect(textByRole(childAfter, "assistant_message")).toContain("MANGO-17");
  expect(userTexts(await fetchTimelineItems(client, agentId))).toEqual(NATIVE_FORK_PROMPTS);

  await client.archiveAgent(agentId);
  expect((await client.fetchAgent(childId))?.agent.archivedAt ?? null).toBeNull();
}
