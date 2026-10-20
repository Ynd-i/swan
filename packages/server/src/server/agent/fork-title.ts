const NUMBERED_TITLE = /^(.*) \((\d+)\)$/;

/**
 * Like Codex, a fork takes its source's title with the next free number: "Plan (2)", then
 * "Plan (3)". A fork of a fork numbers from the same base title.
 */
export function forkTitle(input: {
  sourceTitle: string;
  sourceIsFork: boolean;
  existingTitles: Iterable<string>;
}): string {
  const base = input.sourceIsFork
    ? (input.sourceTitle.match(NUMBERED_TITLE)?.[1] ?? input.sourceTitle)
    : input.sourceTitle;
  let highest = 1;
  for (const title of input.existingTitles) {
    const match = title.match(NUMBERED_TITLE);
    if (match?.[1] === base) highest = Math.max(highest, Number(match[2]));
  }
  return `${base} (${highest + 1})`;
}
