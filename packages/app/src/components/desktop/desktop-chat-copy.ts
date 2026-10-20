import type { Agent } from "@/stores/session-store";
import { buildProviderCommand } from "@/utils/provider-command-templates";

export function desktopChatResumeCommand(
  agent: Pick<Agent, "provider" | "runtimeInfo" | "persistence">,
): string | null {
  const sessionId = agent.runtimeInfo?.sessionId ?? agent.persistence?.sessionId;
  return sessionId
    ? buildProviderCommand({ provider: agent.provider, id: "resume", sessionId })
    : null;
}
