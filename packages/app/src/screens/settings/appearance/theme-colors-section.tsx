import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { Button } from "@/components/ui/button";
import { CONTROL_HEIGHTS } from "@/components/ui/control-geometry";
import {
  EditingTextInput as TextInput,
  type EditingTextInputHandle,
} from "@/components/ui/text-input";
import { getIsElectronMac } from "@/constants/platform";
import { useToast } from "@/contexts/toast-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { DEFAULT_THEME_PREFERENCE, useAppSettings, type AppSettings } from "@/hooks/use-settings";
import { REGISTERED_THEME_TINTS } from "@/styles/registered-themes";
import { settingsStyles } from "@/styles/settings";
import {
  HEX_COLOR_PATTERN,
  PLUGIN_THEME_PREFERENCE,
  resolveThemeColorRoles,
  THEME_COLOR_ROLES,
  type ThemeColorRole,
  type ThemeName,
} from "@/styles/theme";
import { ColorSwatch } from "./color-swatch";

/** The built-in theme on screen; System resolves to Light or Dark. */
function resolveVisibleTheme(
  preference: AppSettings["theme"],
  systemScheme: ReturnType<typeof useColorScheme>,
): ThemeName {
  const builtIn = preference === PLUGIN_THEME_PREFERENCE ? DEFAULT_THEME_PREFERENCE : preference;
  if (builtIn !== "auto") return builtIn;
  return systemScheme === "dark" ? "dark" : "light";
}

/** Accepts `#rrggbb` with or without the hash. */
function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  const hex = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return HEX_COLOR_PATTERN.test(hex) ? hex : null;
}

interface ThemeColorRowProps {
  role: ThemeColorRole;
  value: string | undefined;
  themeColor: string;
  withBorder: boolean;
  onChange: (role: ThemeColorRole, hex: string | null) => void;
}

function ThemeColorRow({ role, value, themeColor, withBorder, onChange }: ThemeColorRowProps) {
  const { t } = useTranslation();
  const input = useRef<EditingTextInputHandle>(null);
  const [draft, setDraft] = useState(value ?? "");
  const title = t(`settings.appearance.colors.roles.${role}.title`);

  // Resync from the committed value when it changes elsewhere.
  useEffect(() => {
    setDraft(value ?? "");
    input.current?.replaceText(value ?? "");
  }, [value]);

  const commit = useCallback(() => {
    if (draft.trim() === "") {
      if (value) onChange(role, null);
      return;
    }
    const hex = normalizeHexColor(draft);
    if (!hex) {
      setDraft(value ?? "");
      input.current?.replaceText(value ?? "");
      return;
    }
    if (hex !== value) onChange(role, hex);
  }, [draft, onChange, role, value]);

  const pick = useCallback((hex: string) => onChange(role, hex), [onChange, role]);

  return (
    <View style={withBorder ? [settingsStyles.row, settingsStyles.rowBorder] : settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{title}</Text>
        <Text style={settingsStyles.rowHint}>
          {t(`settings.appearance.colors.roles.${role}.hint`)}
        </Text>
      </View>
      <View style={styles.controls}>
        <ColorSwatch
          color={normalizeHexColor(draft) ?? themeColor}
          accessibilityLabel={t("settings.appearance.colors.pickerAccessibility", { role: title })}
          onChange={pick}
        />
        <TextInput
          ref={input}
          initialValue={draft}
          onChangeText={setDraft}
          onBlur={commit}
          onSubmitEditing={commit}
          placeholder={themeColor}
          placeholderTextColor={styles.placeholderColor.color}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          maxLength={7}
          style={styles.hexInput}
          accessibilityLabel={t("settings.appearance.colors.fieldAccessibility", { role: title })}
          testID={`appearance-color-${role}`}
        />
      </View>
    </View>
  );
}

export function ThemeColorsSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const { settings, updateSettings } = useAppSettings();
  const systemScheme = useColorScheme();
  const themeName = resolveVisibleTheme(settings.theme, systemScheme);
  const overrides = settings.themeColors[themeName];
  const themeColors = useMemo(
    () => resolveThemeColorRoles(REGISTERED_THEME_TINTS[themeName], {}),
    [themeName],
  );
  const themeLabel = t(`settings.appearance.theme.options.${themeName}`);

  const setRoleColor = useCallback(
    (role: ThemeColorRole, hex: string | null) => {
      void updateSettings((current) => {
        const { [role]: _previous, ...rest } = current.themeColors[themeName] ?? {};
        return {
          themeColors: {
            ...current.themeColors,
            [themeName]: hex ? { ...rest, [role]: hex } : rest,
          },
        };
      }).catch(() => toast.error(t("common.errors.unableToSave")));
    },
    [t, themeName, toast, updateSettings],
  );

  const reset = useCallback(() => {
    void updateSettings((current) => {
      const { [themeName]: _previous, ...rest } = current.themeColors;
      return { themeColors: rest };
    }).catch(() => toast.error(t("common.errors.unableToSave")));
  }, [t, themeName, toast, updateSettings]);

  const hasOverrides = Object.keys(overrides ?? {}).length > 0;
  const resetButton = useMemo(
    () => (
      <Button
        variant="ghost"
        size="sm"
        onPress={reset}
        disabled={!hasOverrides}
        accessibilityLabel={t("settings.appearance.colors.resetLabel", { theme: themeLabel })}
        testID="appearance-theme-colors-reset"
      >
        {t("settings.appearance.colors.reset")}
      </Button>
    ),
    [hasOverrides, reset, t, themeLabel],
  );

  return (
    <SettingsSection
      title={t("settings.appearance.colors.title", { theme: themeLabel })}
      info={t("settings.appearance.colors.info")}
      testID="appearance-theme-colors"
      trailing={resetButton}
    >
      <View style={settingsStyles.card}>
        {THEME_COLOR_ROLES.map((role, index) => (
          <ThemeColorRow
            key={`${themeName}-${role}`}
            role={role}
            value={overrides?.[role]}
            themeColor={themeColors[role]}
            withBorder={index > 0}
            onChange={setRoleColor}
          />
        ))}
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  hexInput: {
    width: 96,
    minHeight: getIsElectronMac() ? CONTROL_HEIGHTS.tight : 36,
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
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.base,
  },
  placeholderColor: {
    color: theme.colors.foregroundExtraMuted,
  },
}));
