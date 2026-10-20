import { z } from "zod";
import type { ForgeChangeRequestPreview } from "@getpaseo/protocol/messages";

const PULL_REQUEST_PATH = /^\/[^/]+\/[^/]+\/pull\/\d+\/?$/;

export const GitHubChangeRequestPreviewSchema = z.object({
  number: z.number(),
  title: z.string().catch(""),
  url: z.string().catch(""),
  state: z.string().catch(""),
  isDraft: z.boolean().catch(false),
  author: z.object({ login: z.string() }).nullable().catch(null),
  additions: z.number().catch(0),
  deletions: z.number().catch(0),
  changedFiles: z.number().catch(0),
  createdAt: z.string().catch(""),
  updatedAt: z.string().catch(""),
  mergedAt: z.string().nullable().catch(null),
  closedAt: z.string().nullable().catch(null),
});

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function buildGitHubChangeRequestPreviewArgs(url: string): string[] {
  const parsed = parseUrl(url);
  // gh would read anything else as a PR number, branch, or flag.
  if (
    !parsed ||
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    !PULL_REQUEST_PATH.test(parsed.pathname)
  ) {
    throw new Error(`Not a GitHub pull request URL: ${url}`);
  }
  return [
    "pr",
    "view",
    `${parsed.origin}${parsed.pathname}`,
    "--json",
    "number,title,url,state,isDraft,author,additions,deletions,changedFiles,createdAt,updatedAt,mergedAt,closedAt",
  ];
}

export function toGitHubChangeRequestPreview(
  item: z.infer<typeof GitHubChangeRequestPreviewSchema>,
): ForgeChangeRequestPreview {
  return {
    forge: "github",
    number: item.number,
    title: item.title,
    url: item.url,
    state: item.state.toLowerCase(),
    isDraft: item.isDraft,
    authorLogin: item.author?.login ?? null,
    additions: item.additions,
    deletions: item.deletions,
    changedFiles: item.changedFiles,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    mergedAt: item.mergedAt || null,
    closedAt: item.closedAt || null,
  };
}
