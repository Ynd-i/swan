import { getIsElectronMac } from "@/constants/platform";
import { i18n } from "@/i18n/i18next";

interface ControlLabelInput {
  id: string;
  label?: string | null;
}

function sentenceCase(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function splitCompactLabel(value: string, splitHyphen: boolean): string {
  const separatorPattern = splitHyphen ? /[_-]+/g : /_+/g;

  return value
    .replace(separatorPattern, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function formatControlLabel(option: ControlLabelInput, splitHyphen: boolean): string {
  const rawLabel = (option.label ?? option.id).trim();
  return sentenceCase(splitCompactLabel(rawLabel, splitHyphen));
}

// The Mac desktop names Codex permission modes the way the Codex app does; other providers
// keep their own labels.
const DESKTOP_MODE_LABEL_KEYS: Record<string, Record<string, string>> = {
  codex: {
    auto: "agentControls.mode.desktop.askForReview",
    "auto-review": "agentControls.mode.desktop.autoReview",
    "full-access": "agentControls.mode.desktop.fullAccess",
  },
};

export function formatAgentModeLabel(mode: ControlLabelInput, provider?: string | null): string {
  const desktopKey = provider ? DESKTOP_MODE_LABEL_KEYS[provider]?.[mode.id] : undefined;
  if (desktopKey && getIsElectronMac()) return i18n.t(desktopKey);
  return formatControlLabel(mode, mode.label == null);
}

export function formatThinkingOptionLabel(option: ControlLabelInput): string {
  const rawLabel = (option.label ?? option.id).trim();
  const compactId = option.id.replace(/[\s_-]+/g, "").toLowerCase();
  const compactLabel = rawLabel.replace(/[\s_-]+/g, "").toLowerCase();

  if (compactId === "xhigh" || compactLabel === "xhigh") {
    return i18n.t("agentControls.thinking.extraHigh");
  }

  return formatControlLabel(option, true);
}
