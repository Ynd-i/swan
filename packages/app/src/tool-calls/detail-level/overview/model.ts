import { isPaseoToolName } from "@getpaseo/protocol/tool-name-normalization";
import { describeToolCall, type ToolCallRun } from "../grouping";

const DIRECT_PASEO_TOOL_PREFIX = "paseo_";
const DIRECT_SEARCH_TOOL_SUFFIX_PATTERN = /(?:^|[_.:/])(?:web_search|llm_context)$/;

export interface OverviewSummary {
  editedFileCount: number;
  commandCount: number;
  readFileCount: number;
  searchCount: number;
  otherToolCount: number;
  paseoCallCount: number;
}

export type OverviewCategory =
  | "loadTools"
  | "skill"
  | "read"
  | "search"
  | "edit"
  | "command"
  | "paseo"
  | "other";

export interface OverviewToolCallGroup {
  mode: "overview";
  run: ToolCallRun;
  summary: OverviewSummary;
  // Distinct categories in first-appearance order; the first one picks the group icon.
  categories: OverviewCategory[];
  isLoading: boolean;
}

function isPaseoCall(name: string, normalizedName: string): boolean {
  return isPaseoToolName(name) || normalizedName.startsWith(DIRECT_PASEO_TOOL_PREFIX);
}

function isSearchCall(name: string): boolean {
  return DIRECT_SEARCH_TOOL_SUFFIX_PATTERN.test(name);
}

function categorize(
  descriptor: ReturnType<typeof describeToolCall>,
  normalizedName: string,
): OverviewCategory {
  if (isPaseoCall(descriptor.name, normalizedName)) return "paseo";
  if (normalizedName === "skill") return "skill";
  if (normalizedName === "toolsearch") return "loadTools";
  switch (descriptor.detail.type) {
    case "edit":
    case "write":
      return "edit";
    case "shell":
      return "command";
    case "read":
      return "read";
    case "search":
      return "search";
    default:
      return isSearchCall(normalizedName) ? "search" : "other";
  }
}

export function buildOverviewGroup(run: ToolCallRun): OverviewToolCallGroup {
  const editedFiles = new Set<string>();
  const readFiles = new Set<string>();
  let isLoading = false;
  let commandCount = 0;
  let searchCount = 0;
  let otherToolCount = 0;
  let paseoCallCount = 0;
  const categories = new Set<OverviewCategory>();

  for (const call of run.calls) {
    const descriptor = describeToolCall(call);
    const normalizedName = descriptor.name.trim().toLowerCase();
    isLoading ||= descriptor.status === "running" || descriptor.status === "executing";
    const category = categorize(descriptor, normalizedName);
    categories.add(category);
    if (category === "paseo") {
      paseoCallCount += 1;
    } else if (category === "edit" && "filePath" in descriptor.detail) {
      editedFiles.add(descriptor.detail.filePath);
    } else if (category === "command") {
      commandCount += 1;
    } else if (category === "read" && "filePath" in descriptor.detail) {
      readFiles.add(descriptor.detail.filePath);
    } else if (category === "search") {
      searchCount += 1;
    } else {
      otherToolCount += 1;
    }
  }

  // A thought still streaming inside the run keeps the group live.
  isLoading ||= run.items.some((item) => item.kind === "thought" && item.status === "loading");

  const summary = {
    editedFileCount: editedFiles.size,
    commandCount,
    readFileCount: readFiles.size,
    searchCount,
    otherToolCount,
    paseoCallCount,
  };
  return {
    mode: "overview",
    run,
    isLoading,
    summary,
    categories: [...categories],
  };
}
