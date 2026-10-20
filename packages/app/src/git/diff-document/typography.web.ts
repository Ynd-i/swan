import { createMeasuredAdvances } from "./text-measurement";
import type { DiffTypography, TextMeasurer } from "./types";

export function webDiffFont(typography: DiffTypography): string {
  return `${typography.weight ?? "400"} ${typography.size}px ${typography.family}`;
}

export function createWebTextMeasurer(typography: DiffTypography): TextMeasurer {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return { measure: () => 0 };
  const measure = (text: string, weight: "regular" | "semibold" = "regular") => {
    context.font = webDiffFont(
      weight === "semibold" ? { ...typography, weight: "600" } : typography,
    );
    return context.measureText(text).width;
  };
  // Canvas exposes no glyph coverage, so shaping determines which runs need
  // complete-prefix measurement instead of independent character advances.
  return { measure, measureAdvances: createMeasuredAdvances((text) => measure(text)) };
}
