export const PARENT_AGENT_ID_LABEL = "paseo.parent-agent-id";
/** Origin of a native fork. Unlike the parent label it implies no ownership or archive cascade. */
export const FORKED_FROM_AGENT_ID_LABEL = "paseo.forked-from-agent-id";
/** The agent an auto handoff continued from. Like a fork origin, it implies no ownership. */
export const HANDOFF_FROM_AGENT_ID_LABEL = "paseo.handoff-from-agent-id";
/** When a native fork finished importing; timeline rows up to it are the inherited history. */
export const FORKED_AT_LABEL = "paseo.forked-at";
const OPEN_AGENT_TAB_LABEL_PREFIX = "paseo.open-agent-tab.";

export function getOpenAgentTabLabel(clientId: string): string {
  return `${OPEN_AGENT_TAB_LABEL_PREFIX}${clientId}`;
}

export function isOpenAgentTabLabel(label: string): boolean {
  return label.startsWith(OPEN_AGENT_TAB_LABEL_PREFIX);
}

export interface AgentLabelSource {
  labels?: Record<string, unknown> | null;
}

export function getParentAgentIdFromLabels(labels: Record<string, unknown> | null | undefined) {
  const parentAgentId = labels?.[PARENT_AGENT_ID_LABEL];
  return typeof parentAgentId === "string" && parentAgentId.trim().length > 0
    ? parentAgentId.trim()
    : null;
}

export function isDelegatedAgent(agent: AgentLabelSource): boolean {
  return getParentAgentIdFromLabels(agent.labels) !== null;
}

export function hasOpenAgentTab(labels: Record<string, unknown> | null | undefined): boolean {
  return Object.entries(labels ?? {}).some(
    ([label, value]) => isOpenAgentTabLabel(label) && value === "true",
  );
}
