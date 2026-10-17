import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const autoHandoffSettings = defineSettings({
  id: "auto-handoff",
  scope: "host",
  version: 1,
  schema: z.object({
    enabled: z.boolean().default(true),
    absoluteThresholdTokens: z.number().int().positive().default(350_000),
    windowFraction: z.number().min(0.1).max(0.95).default(0.75),
    maxAttempts: z.number().int().min(1).max(3).default(2),
  }),
});

export type AutoHandoffSettings = z.output<typeof autoHandoffSettings.schema>;
