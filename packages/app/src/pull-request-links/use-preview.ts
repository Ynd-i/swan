import type { UseQueryResult } from "@tanstack/react-query";
import type { ForgeChangeRequestPreview } from "@getpaseo/protocol/messages";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";

export type PullRequestPreviewState = "open" | "draft" | "merged" | "closed";

export function getPullRequestPreviewState(
  preview: ForgeChangeRequestPreview,
): PullRequestPreviewState {
  if (preview.state === "merged" || preview.mergedAt) return "merged";
  if (preview.state === "closed") return "closed";
  return preview.isDraft ? "draft" : "open";
}

/** The chat's host and workspace; the hover card renders in a portal outside the chat's providers. */
export interface PullRequestPreviewHost {
  serverId: string;
  cwd: string;
}

/** Null when this host or chat cannot fetch previews; the link then stays a plain link. */
export function usePullRequestPreview({
  host: { serverId, cwd },
  url,
  enabled,
}: {
  host: PullRequestPreviewHost;
  url: string;
  enabled: boolean;
}): UseQueryResult<ForgeChangeRequestPreview> | null {
  const client = useHostRuntimeClient(serverId);
  // COMPAT(forgeChangeRequestGet): added in v0.11.4 (fork), remove gate after 2027-04-16.
  const supported = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.forgeChangeRequestGet === true,
  );
  const available = supported && client !== null && cwd.length > 0;
  const query = useFetchQuery({
    dataShape: "value",
    queryKey: ["pullRequestPreview", serverId, url],
    queryFn: async () => {
      const result = await client?.getForgeChangeRequest({ cwd, url });
      if (!result?.changeRequest) throw new Error(result?.error ?? "Pull request not found");
      return result.changeRequest;
    },
    enabled: enabled && available,
    staleTimeMs: 60_000,
    retry: false,
  });
  return available ? query : null;
}
