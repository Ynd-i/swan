import { findClusterBreak } from "@marijn/find-cluster-break";
import { diffArrays } from "diff";

const MAX_LINE_LENGTH = 8192;
const MAX_EDIT_LENGTH = 256;

export interface IntralineRange {
  start: number;
  end: number;
}

export function getIntralineRanges(
  before: string,
  after: string,
): { before: IntralineRange[]; after: IntralineRange[] } {
  // ponytail: cap render-thread work at 8192 UTF-16 units and 256 grapheme edits;
  // retain line color beyond that budget, or move fine-grained minified diffs to a worker.
  if (before === after || before.length > MAX_LINE_LENGTH || after.length > MAX_LINE_LENGTH) {
    return { before: [], after: [] };
  }

  const beforeGraphemes = splitGraphemes(before);
  const afterGraphemes = splitGraphemes(after);
  const changes = diffArrays(beforeGraphemes, afterGraphemes, { maxEditLength: MAX_EDIT_LENGTH });
  if (!changes) return { before: [], after: [] };

  const ranges = { before: [] as IntralineRange[], after: [] as IntralineRange[] };
  let beforeOffset = 0;
  let afterOffset = 0;

  for (const change of changes) {
    const length = change.value.reduce((total, grapheme) => total + grapheme.length, 0);
    if (change.removed) {
      ranges.before.push({ start: beforeOffset, end: beforeOffset + length });
      beforeOffset += length;
      continue;
    }
    if (change.added) {
      ranges.after.push({ start: afterOffset, end: afterOffset + length });
      afterOffset += length;
      continue;
    }
    beforeOffset += length;
    afterOffset += length;
  }

  return ranges;
}

function splitGraphemes(text: string): string[] {
  const graphemes: string[] = [];
  for (let start = 0; start < text.length; ) {
    const end = findClusterBreak(text, start);
    graphemes.push(text.slice(start, end));
    start = end;
  }
  return graphemes;
}
