export function formatTokenCount(value: number, fractionDigits = 0): string {
  const scale = 10 ** fractionDigits;
  const round = (scaled: number) => Math.round(scaled * scale) / scale;
  if (value >= 1_000_000) {
    return `${round(value / 1_000_000)}m`;
  }
  if (value >= 1_000) {
    return `${round(value / 1_000)}k`;
  }
  return Math.round(value).toString();
}
