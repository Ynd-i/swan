export interface PullRequestLinkTarget {
  url: string;
  owner: string;
  repo: string;
  number: number;
}

const PULL_REQUEST_PATH = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/;

/** GitHub (cloud or Enterprise) pull request page URLs; sub-pages like /files stay plain links. */
export function parsePullRequestLink(href: string): PullRequestLinkTarget | null {
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const match = parsed.pathname.match(PULL_REQUEST_PATH);
  if (!match) return null;
  const [, owner, repo, number] = match;
  return {
    url: `${parsed.origin}/${owner}/${repo}/pull/${number}`,
    owner,
    repo,
    number: Number(number),
  };
}
