import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
  type PointerEvent,
} from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronDown, Monitor, Moon, Sun } from "lucide-react-native";
import {
  SYNTAX_THEME_OPTIONS,
  getDefaultSyntaxTheme,
  type SyntaxThemeId,
  type SyntaxThemeOption,
} from "@/appearance/syntax-theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { DropdownTrigger } from "@/components/ui/dropdown-trigger";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { useContributedThemes } from "@/appearance/provider";
import { Button } from "@/components/ui/button";
import { CONTROL_HEIGHTS } from "@/components/ui/control-geometry";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  EditingTextInput as TextInput,
  type EditingTextInputHandle,
} from "@/components/ui/text-input";
import {
  MAX_CODE_FONT_SIZE,
  MAX_CONTENT_FONT_SIZE,
  MAX_UI_BASE_FONT_SIZE,
  MIN_CODE_FONT_SIZE,
  MIN_CONTENT_FONT_SIZE,
  MIN_UI_BASE_FONT_SIZE,
  parseClampedFontSize,
  parseContentMaxWidth,
  resolveContentMaxWidth,
  sanitizeFontFamily,
  useAppSettings,
  type AppSettings,
  DEFAULT_THEME_PREFERENCE,
  DEFAULT_APP_SETTINGS,
} from "@/hooks/use-settings";
import {
  DEFAULT_MONO_FONT_STACK,
  DEFAULT_UI_FONT_STACK,
  ICON_SIZE,
  PLUGIN_THEME_PREFERENCE,
  THEME_OPTIONS,
  THEME_SWATCHES,
  type Theme,
} from "@/styles/theme";
import { getIsElectronMac, isNative } from "@/constants/platform";
import type { PluginThemeOption } from "@/plugins/themes";
import { settingsStyles } from "@/styles/settings";
import { REGISTERED_THEMES } from "@/styles/registered-themes";
import { useToast } from "@/contexts/toast-context";
import { AppearancePreview } from "./appearance-preview";
import { ThemeColorsSection } from "./theme-colors-section";

// ---------------------------------------------------------------------------
// Theme-reactive leaf icons (withUnistyles + uniProps color mapping — no
// useUnistyles). Icon sizes read the static ICON_SIZE token; the appearance
// feature does not scale icons.
// ---------------------------------------------------------------------------

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedSun = withUnistyles(Sun);
const ThemedMoon = withUnistyles(Moon);
const ThemedMonitor = withUnistyles(Monitor);

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

type BuiltInThemePreference = Exclude<AppSettings["theme"], typeof PLUGIN_THEME_PREFERENCE>;

function getThemeLabel(t: TFunction, value: BuiltInThemePreference): string {
  return t(`settings.appearance.theme.options.${value}`);
}

// Platform default stacks can be the bare native tokens ("normal"/"monospace");
// those read as a bug, so show a human label in the placeholder instead.
const BARE_DEFAULT_STACKS: ReadonlySet<string> = new Set(["normal", "monospace"]);
const APPEARANCE_INPUT_HEIGHT = getIsElectronMac() ? 40 : 36;

function resolveDefaultStackPlaceholder(t: TFunction, stack: string): string {
  return getIsElectronMac() || BARE_DEFAULT_STACKS.has(stack)
    ? t("settings.appearance.fonts.systemDefault")
    : stack;
}

// Local size string (digits only) -> preview override number. Empty/invalid
// yields undefined so the preview falls back to the committed theme value.
function sizeDraftToOverride(value: string): number | undefined {
  if (value.length === 0) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// ---------------------------------------------------------------------------
// Theme picker
// ---------------------------------------------------------------------------

type ThemeMode = "auto" | "light" | "dark";
const THEME_MODES: readonly ThemeMode[] = ["auto", "light", "dark"];

/** A miniature UI in the built-in palette, independent of the currently selected theme. */
function ThemeModePreview({ mode }: { mode: "light" | "dark" }) {
  const colors = REGISTERED_THEMES[mode].colors;
  return (
    <View style={[styles.modeTile, { backgroundColor: colors.surface1 }]}>
      <View
        testID={`appearance-mode-preview-${mode}`}
        style={[
          styles.modeWindow,
          { backgroundColor: colors.surface0, borderColor: colors.border },
        ]}
      >
        <View
          style={[
            styles.modeSidebar,
            { backgroundColor: colors.surface1, borderColor: colors.border },
          ]}
        >
          <View style={[styles.modeSidebarMark, { backgroundColor: colors.foregroundMuted }]} />
        </View>
        <View style={styles.modeConversation}>
          <View
            style={[styles.modeMessage, styles.modeUserMessage, { backgroundColor: colors.accent }]}
          />
          <View style={[styles.modeMessage, { backgroundColor: colors.foregroundMuted }]} />
          <View
            style={[
              styles.modeMessage,
              styles.modeShortMessage,
              { backgroundColor: colors.foregroundMuted },
            ]}
          />
          <View
            style={[styles.modeMessage, styles.modeUserMessage, { backgroundColor: colors.accent }]}
          />
          <View style={[styles.modeComposer, { borderColor: colors.border }]}>
            <View style={[styles.modeSend, { backgroundColor: colors.accent }]} />
          </View>
        </View>
      </View>
    </View>
  );
}

function ThemeModeChoice({
  mode,
  selected,
  onChange,
}: {
  mode: ThemeMode;
  selected: boolean;
  onChange: (mode: BuiltInThemePreference) => void;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const enter = useCallback(() => setHovered(true), []);
  const leave = useCallback(() => setHovered(false), []);
  const focus = useCallback(() => setFocused(true), []);
  const blur = useCallback(() => setFocused(false), []);
  const select = useCallback(() => onChange(mode), [mode, onChange]);
  const choiceStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.modeChoice,
      (hovered || pressed) && styles.modeChoiceHovered,
      selected && styles.modeChoiceSelected,
      focused && styles.modeChoiceFocused,
    ],
    [focused, hovered, selected],
  );
  return (
    <View style={styles.modeHoverTarget} onPointerEnter={enter} onPointerLeave={leave}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={getThemeLabel(t, mode)}
        aria-pressed={selected}
        onPress={select}
        onFocus={focus}
        onBlur={blur}
        style={choiceStyle}
      >
        <View
          style={styles.modeThumbnail}
          pointerEvents="none"
          accessibilityElementsHidden
          aria-hidden
        >
          {mode === "auto" ? (
            <>
              <View style={styles.modeHalf}>
                <ThemeModePreview mode="light" />
              </View>
              <View style={styles.modeHalf}>
                <View style={styles.modeRightHalf}>
                  <ThemeModePreview mode="dark" />
                </View>
              </View>
            </>
          ) : (
            <ThemeModePreview mode={mode} />
          )}
        </View>
      </Pressable>
    </View>
  );
}

function ThemeModes({
  value,
  onChange,
}: {
  value: AppSettings["theme"];
  onChange: (mode: BuiltInThemePreference) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.modeCard} testID="appearance-theme-modes">
      <Text style={[settingsStyles.rowTitle, styles.modeLabel]}>
        {t("settings.appearance.theme.mode")}
      </Text>
      <View style={styles.modeChoices}>
        {THEME_MODES.map((mode) => (
          <ThemeModeChoice key={mode} mode={mode} selected={value === mode} onChange={onChange} />
        ))}
      </View>
    </View>
  );
}

interface ThemeLeadingProps {
  themeValue: BuiltInThemePreference;
}

function ThemeLeading({ themeValue }: ThemeLeadingProps) {
  switch (themeValue) {
    case "light":
      return <ThemedSun size={ICON_SIZE.md} uniProps={mutedColorMapping} />;
    case "dark":
      return <ThemedMoon size={ICON_SIZE.md} uniProps={mutedColorMapping} />;
    case "auto":
      return <ThemedMonitor size={ICON_SIZE.md} uniProps={mutedColorMapping} />;
    default:
      return <ThemeSwatch color={THEME_SWATCHES[themeValue]} />;
  }
}

interface ThemeSwatchProps {
  color: string;
}

function ThemeSwatch({ color }: ThemeSwatchProps) {
  const swatchStyle = useMemo(() => [styles.swatch, { backgroundColor: color }], [color]);
  return <View style={swatchStyle} />;
}

interface ThemeMenuItemProps {
  themeValue: BuiltInThemePreference;
  selected: boolean;
  onChange: (theme: BuiltInThemePreference) => void;
}

function ThemeMenuItem({ themeValue, selected, onChange }: ThemeMenuItemProps) {
  const { t } = useTranslation();
  const handleSelect = useCallback(() => {
    onChange(themeValue);
  }, [onChange, themeValue]);
  const leading = useMemo(() => <ThemeLeading themeValue={themeValue} />, [themeValue]);
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect} leading={leading}>
      {getThemeLabel(t, themeValue)}
    </DropdownMenuItem>
  );
}

interface PluginThemeMenuItemProps {
  option: PluginThemeOption;
  selected: boolean;
  onSelect: (option: PluginThemeOption) => void;
}

function PluginThemeMenuItem({ option, selected, onSelect }: PluginThemeMenuItemProps) {
  const handleSelect = useCallback(() => {
    onSelect(option);
  }, [onSelect, option]);
  const leading = useMemo(() => <ThemeSwatch color={option.swatch} />, [option.swatch]);
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect} leading={leading}>
      {option.name}
    </DropdownMenuItem>
  );
}

interface ThemeRowProps {
  value: AppSettings["theme"];
  pluginThemes: PluginThemeOption[];
  selectedPluginTheme: PluginThemeOption | null;
  onChange: (theme: BuiltInThemePreference) => void;
  onSelectPluginTheme: (option: PluginThemeOption) => void;
}

function ThemeRow({
  value,
  pluginThemes,
  selectedPluginTheme,
  onChange,
  onSelectPluginTheme,
}: ThemeRowProps) {
  const { t } = useTranslation();
  // A selected contribution that is no longer installed shows the fallback the app renders.
  const builtInValue = value === PLUGIN_THEME_PREFERENCE ? DEFAULT_THEME_PREFERENCE : value;
  const selectedLabel = selectedPluginTheme
    ? selectedPluginTheme.name
    : getThemeLabel(t, builtInValue);
  const leading = useMemo(
    () =>
      selectedPluginTheme ? (
        <ThemeSwatch color={selectedPluginTheme.swatch} />
      ) : (
        <ThemeLeading themeValue={builtInValue} />
      ),
    [builtInValue, selectedPluginTheme],
  );
  return (
    <View style={settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{t("settings.appearance.theme.title")}</Text>
      </View>
      <DropdownMenu>
        <DropdownTrigger
          accessibilityLabel={t("settings.appearance.theme.accessibilityLabel", {
            value: selectedLabel,
          })}
          leading={leading}
        >
          {selectedLabel}
        </DropdownTrigger>
        <DropdownMenuContent side="bottom" align="end" width={200} scrollable>
          {THEME_OPTIONS.map((option, index) => {
            const previousOption = THEME_OPTIONS[index - 1];
            return (
              <Fragment key={option.name}>
                {previousOption && previousOption.group !== option.group ? (
                  <DropdownMenuSeparator />
                ) : null}
                <ThemeMenuItem
                  themeValue={option.name}
                  selected={selectedPluginTheme === null && builtInValue === option.name}
                  onChange={onChange}
                />
              </Fragment>
            );
          })}
          {pluginThemes.length > 0 ? <DropdownMenuSeparator /> : null}
          {pluginThemes.map((option) => (
            <PluginThemeMenuItem
              key={option.id}
              option={option}
              selected={selectedPluginTheme?.id === option.id}
              onSelect={onSelectPluginTheme}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Fonts: family text fields + numeric size fields (commit on blur/submit)
// ---------------------------------------------------------------------------

interface FontFamilyRowProps {
  resetKey?: number;
  title: string;
  hint: string;
  accessibilityLabel: string;
  placeholder: string;
  value: string;
  draft: string;
  withBorder: boolean;
  children?: ReactNode;
  onChangeDraft: (value: string) => void;
  onCommit: (value: string) => string;
}

function FontFamilyRow({
  resetKey = 0,
  title,
  hint,
  accessibilityLabel,
  placeholder,
  value,
  draft,
  withBorder,
  children,
  onChangeDraft,
  onCommit,
}: FontFamilyRowProps) {
  const inputRef = useRef<EditingTextInputHandle>(null);
  const handleCommit = useCallback(() => {
    const committed = onCommit(draft);
    inputRef.current?.replaceText(committed);
  }, [draft, onCommit]);

  // Resync from the committed value when it changes elsewhere.
  useEffect(() => {
    onChangeDraft(value);
    inputRef.current?.replaceText(value);
  }, [value, resetKey, onChangeDraft]);

  const familyInput = (
    <TextInput
      ref={inputRef}
      initialValue={draft}
      onChangeText={onChangeDraft}
      onBlur={handleCommit}
      onSubmitEditing={handleCommit}
      placeholder={placeholder}
      placeholderTextColor={styles.placeholderColor.color}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      style={styles.fontFamilyInput}
      accessibilityLabel={accessibilityLabel}
    />
  );

  return (
    <View style={withBorder ? styles.rowWithBorder : settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{title}</Text>
        <Text style={settingsStyles.rowHint}>{hint}</Text>
      </View>
      {children ? (
        <View style={styles.fontFamilyControls}>
          {familyInput}
          {children}
        </View>
      ) : (
        familyInput
      )}
    </View>
  );
}

const FONT_WEIGHT_OPTIONS = [
  { value: null, label: "default" },
  { value: "400", label: "regular" },
  { value: "500", label: "medium" },
  { value: "600", label: "semibold" },
] as const;

function FontWeightOption({
  option,
  selected,
  onChange,
}: {
  option: (typeof FONT_WEIGHT_OPTIONS)[number];
  selected: boolean;
  onChange: (value: AppSettings["codeFontWeight"]) => void;
}) {
  const { t } = useTranslation();
  const select = useCallback(() => onChange(option.value), [onChange, option.value]);
  return (
    <DropdownMenuItem selected={selected} onSelect={select}>
      {t(`settings.appearance.fonts.weightOptions.${option.label}`)}
    </DropdownMenuItem>
  );
}

function FontWeight({
  kind,
  value,
  onChange,
}: {
  kind: "code" | "content" | "interface";
  value: AppSettings["codeFontWeight"];
  onChange: (value: AppSettings["codeFontWeight"]) => void;
}) {
  const { t } = useTranslation();
  const selected = FONT_WEIGHT_OPTIONS.find((option) => option.value === value)!;
  const label = t(`settings.appearance.fonts.weightOptions.${selected.label}`);
  return (
    <DropdownMenu>
      <DropdownTrigger
        accessibilityLabel={t(`settings.appearance.fonts.${kind}WeightAccessibility`, {
          value: label,
        })}
      >
        {label}
      </DropdownTrigger>
      <DropdownMenuContent side="bottom" align="end" width={180}>
        {FONT_WEIGHT_OPTIONS.map((option) => (
          <FontWeightOption
            key={option.label}
            option={option}
            selected={value === option.value}
            onChange={onChange}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface FontSizeRowProps {
  value: number;
  resetKey?: number;
  title: string;
  hint: string;
  accessibilityLabel: string;
  draft: string;
  withBorder?: boolean;
  onChangeDraft: (value: string) => void;
  onCommit: () => void;
}

function FontSizeRow({
  value,
  resetKey = 0,
  title,
  hint,
  accessibilityLabel,
  draft,
  withBorder = true,
  onChangeDraft,
  onCommit,
}: FontSizeRowProps) {
  const input = useRef<EditingTextInputHandle>(null);
  useEffect(() => {
    input.current?.replaceText(String(value));
  }, [value, resetKey]);
  return (
    <View style={withBorder ? styles.rowWithBorder : settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{title}</Text>
        <Text style={settingsStyles.rowHint}>{hint}</Text>
      </View>
      <View style={styles.sizeField}>
        <TextInput
          ref={input}
          initialValue={draft}
          onChangeText={onChangeDraft}
          onBlur={onCommit}
          onSubmitEditing={onCommit}
          keyboardType="number-pad"
          inputMode="numeric"
          selectTextOnFocus
          style={styles.sizeInput}
          accessibilityLabel={accessibilityLabel}
        />
        <Text style={styles.unit}>px</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Content width: numeric field (commit on blur/submit) + reset to the default
// ---------------------------------------------------------------------------

interface ContentWidthRowProps {
  resetKey?: number;
  value: AppSettings["contentMaxWidth"];
  onChange: (value: AppSettings["contentMaxWidth"]) => void;
}

function ContentWidthRow({ value, onChange, resetKey = 0 }: ContentWidthRowProps) {
  const { t } = useTranslation();
  const width = resolveContentMaxWidth({ contentMaxWidth: value });
  // The field is uncontrolled, so a saved or reset width is written into it directly.
  const input = useRef<EditingTextInputHandle>(null);

  useEffect(() => {
    input.current?.replaceText(String(width));
  }, [width, resetKey]);

  const commit = useCallback(() => {
    const next = parseContentMaxWidth(input.current?.getText()) ?? width;
    input.current?.replaceText(String(next));
    // Typing the width already in effect keeps following the default.
    if (next !== width) {
      onChange(next);
    }
  }, [onChange, width]);

  const reset = useCallback(() => {
    onChange(null);
  }, [onChange]);

  return (
    <View style={settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{t("settings.appearance.layout.contentWidth")}</Text>
        <Text style={settingsStyles.rowHint}>
          {t("settings.appearance.layout.contentWidthHint")}
        </Text>
      </View>
      <View style={styles.sizeField}>
        {value === null ? null : (
          <Button
            variant="ghost"
            size="sm"
            onPress={reset}
            accessibilityLabel={t("settings.appearance.layout.resetAccessibility")}
          >
            {t("settings.appearance.layout.reset")}
          </Button>
        )}
        <TextInput
          ref={input}
          initialValue={String(width)}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="number-pad"
          inputMode="numeric"
          selectTextOnFocus
          style={styles.widthInput}
          accessibilityLabel={t("settings.appearance.layout.contentWidthAccessibility")}
        />
        <Text style={styles.unit}>px</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Syntax highlight theme picker (commits immediately)
// ---------------------------------------------------------------------------

function syntaxLabelForId(id: SyntaxThemeId): string {
  const option = SYNTAX_THEME_OPTIONS.find((entry) => entry.id === id);
  return option ? option.label : id;
}

interface SyntaxMenuItemProps {
  option: SyntaxThemeOption;
  selected: boolean;
  onChange: (id: SyntaxThemeId) => void;
}

function SyntaxMenuItem({ option, selected, onChange }: SyntaxMenuItemProps) {
  const handleSelect = useCallback(() => {
    onChange(option.id);
  }, [onChange, option.id]);
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect}>
      {option.label}
    </DropdownMenuItem>
  );
}

interface SyntaxRowProps {
  value: SyntaxThemeId;
  onChange: (id: SyntaxThemeId) => void;
}

function SyntaxRow({ value, onChange }: SyntaxRowProps) {
  const { t } = useTranslation();
  const selectedLabel = syntaxLabelForId(value);
  return (
    <View style={settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>
          {t("settings.appearance.syntax.highlightTheme")}
        </Text>
        <Text style={settingsStyles.rowHint}>
          {t("settings.appearance.syntax.highlightThemeHint")}
        </Text>
      </View>
      <DropdownMenu>
        <DropdownTrigger
          accessibilityLabel={t("settings.appearance.syntax.highlightThemeAccessibility", {
            value: selectedLabel,
          })}
        >
          {selectedLabel}
        </DropdownTrigger>
        <DropdownMenuContent side="bottom" align="end" width={200}>
          {SYNTAX_THEME_OPTIONS.map((option) => (
            <SyntaxMenuItem
              key={option.id}
              option={option}
              selected={value === option.id}
              onChange={onChange}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const ADVANCED_DEFAULTS = {
  uiBaseFontSize: DEFAULT_APP_SETTINGS.uiBaseFontSize,
  uiFontWeight: DEFAULT_APP_SETTINGS.uiFontWeight,
  contentFontSize: DEFAULT_APP_SETTINGS.contentFontSize,
  contentFontWeight: DEFAULT_APP_SETTINGS.contentFontWeight,
  codeFontSize: DEFAULT_APP_SETTINGS.codeFontSize,
  codeFontWeight: DEFAULT_APP_SETTINGS.codeFontWeight,
  contentFontFamily: DEFAULT_APP_SETTINGS.contentFontFamily,
  monoFontFamily: DEFAULT_APP_SETTINGS.monoFontFamily,
  contentMaxWidth: DEFAULT_APP_SETTINGS.contentMaxWidth,
  reducedMotion: DEFAULT_APP_SETTINGS.reducedMotion,
};

function AppearanceAdvanced({
  children,
  resetting,
  onReset,
}: {
  children: ReactNode;
  resetting: boolean;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const toggle = useCallback(() => setExpanded((current) => !current), []);
  // A pointer reset must discard the focused draft, not blur-save it first.
  const keepDraftFocused = useCallback((event: PointerEvent) => event.preventDefault(), []);
  return (
    <View style={styles.advancedGroup}>
      <View style={styles.advancedHeader}>
        <Pressable
          onPress={toggle}
          style={styles.advancedToggle}
          accessibilityRole="button"
          aria-expanded={expanded}
          testID="appearance-advanced-toggle"
        >
          <Text style={settingsStyles.rowTitle}>{t("settings.appearance.advanced.title")}</Text>
          <ThemedChevronDown
            size={14}
            uniProps={mutedColorMapping}
            style={!expanded ? styles.collapsedChevron : undefined}
          />
        </Pressable>
        <Button
          variant="ghost"
          size="sm"
          onPress={onReset}
          onPointerDown={keepDraftFocused}
          loading={resetting}
          accessibilityLabel={t("settings.appearance.advanced.resetLabel")}
          testID="appearance-advanced-reset"
        >
          {t("settings.appearance.advanced.reset")}
        </Button>
      </View>
      <View
        style={!expanded ? styles.advancedHidden : undefined}
        testID="appearance-advanced-content"
      >
        {children}
      </View>
    </View>
  );
}

export function AppearanceSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const toast = useToast();
  const [resetKey, setResetKey] = useState(0);
  const [resetting, setResetting] = useState(false);
  const resetInFlight = useRef(false);
  const {
    options: pluginThemes,
    selected: selectedPluginTheme,
    select: selectPluginTheme,
  } = useContributedThemes();
  const showInterfaceFontFamilyRow = !isNative;
  const showThemeModes = getIsElectronMac();
  const uiFontPlaceholder = resolveDefaultStackPlaceholder(t, DEFAULT_UI_FONT_STACK);
  const monoFontPlaceholder = resolveDefaultStackPlaceholder(t, DEFAULT_MONO_FONT_STACK);

  const [uiFontDraft, setUiFontDraft] = useState(settings.uiFontFamily);
  const [contentFontDraft, setContentFontDraft] = useState(settings.contentFontFamily);
  const [monoFontDraft, setMonoFontDraft] = useState(settings.monoFontFamily);
  const [uiBaseSizeDraft, setUiBaseSizeDraft] = useState(String(settings.uiBaseFontSize));
  const [contentSizeDraft, setContentSizeDraft] = useState(String(settings.contentFontSize));
  const [codeSizeDraft, setCodeSizeDraft] = useState(String(settings.codeFontSize));

  const resetAdvanced = useCallback(async () => {
    if (resetInFlight.current) return;
    resetInFlight.current = true;
    setResetting(true);
    try {
      await updateSettings({ ...ADVANCED_DEFAULTS, syntaxTheme: getDefaultSyntaxTheme() });
      setUiBaseSizeDraft(String(ADVANCED_DEFAULTS.uiBaseFontSize));
      setContentSizeDraft(String(ADVANCED_DEFAULTS.contentFontSize));
      setCodeSizeDraft(String(ADVANCED_DEFAULTS.codeFontSize));
      setContentFontDraft(ADVANCED_DEFAULTS.contentFontFamily);
      setMonoFontDraft(ADVANCED_DEFAULTS.monoFontFamily);
      setResetKey((current) => current + 1);
    } catch {
      toast.error(t("common.errors.unableToSave"));
    } finally {
      resetInFlight.current = false;
      setResetting(false);
    }
  }, [t, toast, updateSettings]);

  // Resync numeric drafts when the committed value changes elsewhere.
  useEffect(() => {
    setUiBaseSizeDraft(String(settings.uiBaseFontSize));
  }, [settings.uiBaseFontSize]);
  useEffect(() => {
    setContentSizeDraft(String(settings.contentFontSize));
  }, [settings.contentFontSize]);
  useEffect(() => {
    setCodeSizeDraft(String(settings.codeFontSize));
  }, [settings.codeFontSize]);

  const motionOptions = useMemo(
    () =>
      (["system", "on", "off"] as const).map((value) => ({
        value,
        label: t(`settings.appearance.motion.${value}`),
      })),
    [t],
  );
  const handleMotionChange = useCallback(
    (reducedMotion: AppSettings["reducedMotion"]) => {
      void updateSettings({ reducedMotion });
    },
    [updateSettings],
  );

  const handleThemeChange = useCallback(
    (theme: BuiltInThemePreference) => {
      void updateSettings({ theme });
    },
    [updateSettings],
  );

  const handlePluginThemeChange = useCallback(
    (option: PluginThemeOption) => {
      selectPluginTheme(option);
    },
    [selectPluginTheme],
  );

  const handleContentMaxWidthChange = useCallback(
    (contentMaxWidth: AppSettings["contentMaxWidth"]) => {
      void updateSettings({ contentMaxWidth });
    },
    [updateSettings],
  );

  const handleSyntaxThemeChange = useCallback(
    (syntaxTheme: SyntaxThemeId) => {
      void updateSettings({ syntaxTheme });
    },
    [updateSettings],
  );

  const commitUiFontFamily = useCallback(
    (value: string) => {
      const sanitized = sanitizeFontFamily(value);
      if (sanitized === null) {
        setUiFontDraft(settings.uiFontFamily);
        return settings.uiFontFamily;
      }
      setUiFontDraft(sanitized);
      if (sanitized !== settings.uiFontFamily) {
        void updateSettings({ uiFontFamily: sanitized });
      }
      return sanitized;
    },
    [settings.uiFontFamily, updateSettings],
  );

  const commitContentFontFamily = useCallback(
    (value: string) => {
      const sanitized = sanitizeFontFamily(value);
      if (sanitized === null) {
        setContentFontDraft(settings.contentFontFamily);
        return settings.contentFontFamily;
      }
      setContentFontDraft(sanitized);
      if (sanitized !== settings.contentFontFamily) {
        void updateSettings({ contentFontFamily: sanitized });
      }
      return sanitized;
    },
    [settings.contentFontFamily, updateSettings],
  );

  const changeInterfaceFontWeight = useCallback(
    (uiFontWeight: AppSettings["uiFontWeight"]) => {
      void updateSettings({ uiFontWeight }).catch(() =>
        toast.error(t("common.errors.unableToSave")),
      );
    },
    [t, toast, updateSettings],
  );

  const changeContentFontWeight = useCallback(
    (contentFontWeight: AppSettings["contentFontWeight"]) => {
      void updateSettings({ contentFontWeight }).catch(() =>
        toast.error(t("common.errors.unableToSave")),
      );
    },
    [t, toast, updateSettings],
  );

  const changeCodeFontWeight = useCallback(
    (codeFontWeight: AppSettings["codeFontWeight"]) => {
      void updateSettings({ codeFontWeight }).catch(() =>
        toast.error(t("common.errors.unableToSave")),
      );
    },
    [t, toast, updateSettings],
  );

  const commitMonoFontFamily = useCallback(
    (value: string) => {
      const sanitized = sanitizeFontFamily(value);
      if (sanitized === null) {
        setMonoFontDraft(settings.monoFontFamily);
        return settings.monoFontFamily;
      }
      setMonoFontDraft(sanitized);
      if (sanitized !== settings.monoFontFamily) {
        void updateSettings({ monoFontFamily: sanitized });
      }
      return sanitized;
    },
    [settings.monoFontFamily, updateSettings],
  );

  const handleUiBaseSizeChange = useCallback((value: string) => {
    setUiBaseSizeDraft(value.replace(/[^\d]/g, ""));
  }, []);

  const handleCodeSizeChange = useCallback((value: string) => {
    setCodeSizeDraft(value.replace(/[^\d]/g, ""));
  }, []);

  const handleContentSizeChange = useCallback((value: string) => {
    setContentSizeDraft(value.replace(/[^\d]/g, ""));
  }, []);

  const commitUiBaseSize = useCallback(() => {
    const parsed = parseClampedFontSize(uiBaseSizeDraft, {
      min: MIN_UI_BASE_FONT_SIZE,
      max: MAX_UI_BASE_FONT_SIZE,
    });
    const next = parsed ?? settings.uiBaseFontSize;
    setUiBaseSizeDraft(String(next));
    if (next !== settings.uiBaseFontSize) {
      void updateSettings({ uiBaseFontSize: next });
    }
  }, [settings.uiBaseFontSize, uiBaseSizeDraft, updateSettings]);

  const commitCodeSize = useCallback(() => {
    const parsed = parseClampedFontSize(codeSizeDraft, {
      min: MIN_CODE_FONT_SIZE,
      max: MAX_CODE_FONT_SIZE,
    });
    const next = parsed ?? settings.codeFontSize;
    setCodeSizeDraft(String(next));
    if (next !== settings.codeFontSize) {
      void updateSettings({ codeFontSize: next });
    }
  }, [codeSizeDraft, settings.codeFontSize, updateSettings]);

  const commitContentSize = useCallback(() => {
    const parsed = parseClampedFontSize(contentSizeDraft, {
      min: MIN_CONTENT_FONT_SIZE,
      max: MAX_CONTENT_FONT_SIZE,
    });
    const next = parsed ?? settings.contentFontSize;
    setContentSizeDraft(String(next));
    if (next !== settings.contentFontSize) {
      void updateSettings({ contentFontSize: next });
    }
  }, [contentSizeDraft, settings.contentFontSize, updateSettings]);

  // Live-while-typing: the in-progress drafts drive the preview without
  // committing to the global theme. Empty/invalid fields fall back to the
  // theme value inside the preview.
  const previewOverrides = useMemo(
    () => ({
      contentFontSize: sizeDraftToOverride(contentSizeDraft),
      monoFontFamily: monoFontDraft,
      codeFontSize: sizeDraftToOverride(codeSizeDraft),
    }),
    [codeSizeDraft, contentSizeDraft, monoFontDraft],
  );

  const interfaceFont = (
    <FontFamilyRow
      title={t("settings.appearance.fonts.interfaceFont")}
      hint={t("settings.appearance.fonts.interfaceFontHint")}
      accessibilityLabel={t("settings.appearance.fonts.interfaceFontAccessibility")}
      placeholder={uiFontPlaceholder}
      value={settings.uiFontFamily}
      draft={uiFontDraft}
      withBorder={showThemeModes}
      onChangeDraft={setUiFontDraft}
      onCommit={commitUiFontFamily}
    />
  );
  const contentFont = (
    <FontFamilyRow
      resetKey={resetKey}
      title={t("settings.appearance.fonts.contentFont")}
      hint={t("settings.appearance.fonts.contentFontHint")}
      accessibilityLabel={t("settings.appearance.fonts.contentFontAccessibility")}
      placeholder={settings.uiFontFamily || uiFontPlaceholder}
      value={settings.contentFontFamily}
      draft={contentFontDraft}
      withBorder
      onChangeDraft={setContentFontDraft}
      onCommit={commitContentFontFamily}
    >
      {showThemeModes ? (
        <FontWeight
          kind="content"
          value={settings.contentFontWeight}
          onChange={changeContentFontWeight}
        />
      ) : null}
    </FontFamilyRow>
  );
  const codeFont = (
    <FontFamilyRow
      resetKey={resetKey}
      title={t("settings.appearance.fonts.codeFont")}
      hint={t("settings.appearance.fonts.codeFontHint")}
      accessibilityLabel={t("settings.appearance.fonts.codeFontAccessibility")}
      placeholder={monoFontPlaceholder}
      value={settings.monoFontFamily}
      draft={monoFontDraft}
      withBorder
      onChangeDraft={setMonoFontDraft}
      onCommit={commitMonoFontFamily}
    >
      {showThemeModes ? (
        <FontWeight kind="code" value={settings.codeFontWeight} onChange={changeCodeFontWeight} />
      ) : null}
    </FontFamilyRow>
  );
  const interfaceSize = (
    <FontSizeRow
      value={settings.uiBaseFontSize}
      resetKey={resetKey}
      title={t("settings.appearance.fonts.interfaceSize")}
      hint={t("settings.appearance.fonts.interfaceSizeHint")}
      accessibilityLabel={t("settings.appearance.fonts.interfaceSizeAccessibility")}
      draft={uiBaseSizeDraft}
      withBorder={showInterfaceFontFamilyRow && !showThemeModes}
      onChangeDraft={handleUiBaseSizeChange}
      onCommit={commitUiBaseSize}
    />
  );
  const contentSize = (
    <FontSizeRow
      value={settings.contentFontSize}
      resetKey={resetKey}
      title={t("settings.appearance.fonts.contentSize")}
      hint={t("settings.appearance.fonts.contentSizeHint")}
      accessibilityLabel={t("settings.appearance.fonts.contentSizeAccessibility")}
      draft={contentSizeDraft}
      onChangeDraft={handleContentSizeChange}
      onCommit={commitContentSize}
    />
  );
  const codeSize = (
    <FontSizeRow
      value={settings.codeFontSize}
      resetKey={resetKey}
      title={t("settings.appearance.fonts.codeSize")}
      hint={t("settings.appearance.fonts.codeSizeHint")}
      accessibilityLabel={t("settings.appearance.fonts.codeSizeAccessibility")}
      draft={codeSizeDraft}
      onChangeDraft={handleCodeSizeChange}
      onCommit={commitCodeSize}
    />
  );
  const layoutSection = (
    <SettingsSection title={t("settings.appearance.layout.title")}>
      <View style={settingsStyles.card}>
        <ContentWidthRow
          resetKey={resetKey}
          value={settings.contentMaxWidth}
          onChange={handleContentMaxWidthChange}
        />
      </View>
    </SettingsSection>
  );
  const syntaxSection = (
    <SettingsSection title={t("settings.appearance.syntax.title")}>
      <View style={settingsStyles.card}>
        <SyntaxRow value={settings.syntaxTheme} onChange={handleSyntaxThemeChange} />
      </View>
      <View style={styles.preview}>
        <AppearancePreview overrides={previewOverrides} />
      </View>
    </SettingsSection>
  );
  const motionCard = (
    <View style={settingsStyles.section}>
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.appearance.motion.title")}</Text>
            <Text style={settingsStyles.rowHint}>{t("settings.appearance.motion.hint")}</Text>
          </View>
          <SegmentedControl
            options={motionOptions}
            value={settings.reducedMotion}
            onValueChange={handleMotionChange}
            size="sm"
            testID="appearance-reduced-motion"
          />
        </View>
      </View>
    </View>
  );
  return (
    <View>
      <SettingsSection
        title={t(
          showThemeModes
            ? "settings.appearance.theme.visualStyle"
            : "settings.appearance.theme.title",
        )}
      >
        {showThemeModes ? <ThemeModes value={settings.theme} onChange={handleThemeChange} /> : null}
        <View style={settingsStyles.card}>
          <ThemeRow
            value={settings.theme}
            pluginThemes={pluginThemes}
            selectedPluginTheme={selectedPluginTheme}
            onChange={handleThemeChange}
            onSelectPluginTheme={handlePluginThemeChange}
          />
          {showThemeModes ? interfaceFont : null}
        </View>
      </SettingsSection>
      {selectedPluginTheme ? null : <ThemeColorsSection />}
      {showThemeModes ? (
        <AppearanceAdvanced resetting={resetting} onReset={resetAdvanced}>
          <View style={settingsStyles.section}>
            <View style={settingsStyles.card}>
              {interfaceSize}
              {codeSize}
              {contentSize}
            </View>
          </View>
          {motionCard}
          <View style={settingsStyles.section}>
            <View style={settingsStyles.card}>
              <View style={settingsStyles.row}>
                <View style={settingsStyles.rowContent}>
                  <Text style={settingsStyles.rowTitle}>
                    {t("settings.appearance.fonts.interfaceStyle")}
                  </Text>
                </View>
                <FontWeight
                  kind="interface"
                  value={settings.uiFontWeight}
                  onChange={changeInterfaceFontWeight}
                />
              </View>
              {contentFont}
              {codeFont}
            </View>
          </View>
          {layoutSection}
          {syntaxSection}
        </AppearanceAdvanced>
      ) : (
        <>
          <SettingsSection title={t("settings.appearance.fonts.title")}>
            <View style={settingsStyles.card}>
              {showInterfaceFontFamilyRow ? interfaceFont : null}
              {interfaceSize}
              {showInterfaceFontFamilyRow ? contentFont : null}
              {contentSize}
              {codeFont}
              {codeSize}
            </View>
          </SettingsSection>
          {layoutSection}
          {syntaxSection}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  advancedGroup: { marginTop: theme.spacing[6] },
  advancedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  advancedToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  collapsedChevron: { transform: [{ rotate: "-90deg" }] },
  advancedHidden: { display: "none" },
  modeCard: {
    height: 78,
    marginBottom: theme.spacing[1],
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  modeLabel: { flex: 1, marginRight: 12 },
  modeChoices: { flexDirection: "row", gap: 16 },
  modeHoverTarget: { position: "relative" },
  modeChoice: {
    width: 80,
    height: 60,
    padding: 0,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modeChoiceHovered: {
    backgroundColor: theme.colors.surface2,
    borderColor: theme.colors.foregroundMuted,
  },
  modeChoiceSelected: { borderColor: theme.colors.ring },
  modeChoiceFocused: {
    outlineWidth: 2,
    outlineOffset: 2,
    outlineColor: theme.colors.ring,
    outlineStyle: "solid",
  },
  modeTile: { width: 76, height: 56, padding: 4 },
  modeThumbnail: {
    width: 76,
    height: 56,
    flexDirection: "row",
    borderRadius: 6,
    overflow: "hidden",
  },
  modeHalf: { width: 38, height: 56, overflow: "hidden" },
  modeRightHalf: { marginLeft: -38 },
  modeWindow: {
    width: 68,
    height: 48,
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 5,
    overflow: "hidden",
  },
  modeSidebar: { width: 11, borderRightWidth: 1, alignItems: "center", paddingTop: 4 },
  modeSidebarMark: { width: 4, height: 4, borderRadius: 2 },
  modeConversation: { flex: 1, padding: 4, gap: 4 },
  modeMessage: { height: 2, width: "84%", borderRadius: 1, opacity: 0.55 },
  modeShortMessage: { width: "62%" },
  modeUserMessage: { width: "62%", alignSelf: "flex-end" },
  modeComposer: {
    height: 10,
    borderWidth: 1,
    borderRadius: 3,
    marginTop: "auto",
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 3,
  },
  modeSend: { width: 4, height: 4, borderRadius: 2 },
  preview: {
    marginTop: theme.spacing[4],
  },
  rowWithBorder: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
  },
  swatch: {
    width: ICON_SIZE.md,
    height: ICON_SIZE.md,
    borderRadius: ICON_SIZE.md / 2,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  fontFamilyControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flex: 1,
    minWidth: 0,
    maxWidth: 380,
  },
  fontFamilyInput: {
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: 280,
    minHeight: getIsElectronMac() ? CONTROL_HEIGHTS.tight : APPEARANCE_INPUT_HEIGHT,
    paddingVertical: getIsElectronMac() ? theme.spacing[1] : theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: getIsElectronMac() ? CONTROL_HEIGHTS.tight / 2 : theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor:
      getIsElectronMac() && rt.themeName === "dark"
        ? theme.colors.borderAccent
        : theme.colors.border,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    textAlign: "left",
  },
  sizeField: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  sizeInput: {
    width: 64,
    minHeight: getIsElectronMac() ? CONTROL_HEIGHTS.tight : APPEARANCE_INPUT_HEIGHT,
    paddingVertical: getIsElectronMac() ? theme.spacing[1] : theme.spacing[2],
    paddingHorizontal: getIsElectronMac() ? theme.spacing[2] : theme.spacing[3],
    borderRadius: getIsElectronMac() ? theme.borderRadius.lg : theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor:
      getIsElectronMac() && rt.themeName === "dark"
        ? theme.colors.borderAccent
        : theme.colors.border,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    textAlign: getIsElectronMac() ? "left" : "right",
  },
  widthInput: {
    width: 80,
    minHeight: APPEARANCE_INPUT_HEIGHT,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    textAlign: "right",
  },
  unit: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  placeholderColor: {
    color: theme.colors.foregroundMuted,
  },
}));
