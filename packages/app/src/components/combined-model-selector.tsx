import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { useTranslation } from "react-i18next";
import { Zap } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { AgentProvider } from "@getpaseo/protocol/agent-types";
import type { AgentProfilePicker, AgentProfileSeed } from "@/agent-profiles";
import { ComboboxTrigger } from "@/components/ui/combobox-trigger";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Combobox, type ComboboxOption, type ComboboxProps } from "@/components/ui/combobox";
import { ModelBrowser, ModelProviderGlyph, useModelBrowser } from "@/components/model-browser";
import { resolveModelBrowserScrolling } from "@/components/model-browser-view";
import { useIsCompactFormFactor } from "@/constants/layout";
import { getIsElectronMac, isNative, isWeb } from "@/constants/platform";
import {
  DesktopModelPreferences,
  type DesktopThinkingControl,
} from "@/components/desktop/desktop-model-preferences";
import type { ProviderSelectorProvider } from "@/provider-selection/provider-selection";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const EMPTY_COMBOBOX_OPTIONS: ComboboxOption[] = [];
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);

const foregroundMutedMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

const mutedFilledIcon = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
  fill: theme.colors.foregroundMuted,
});
const FastBadgeIcon = withUnistyles(Zap);

function noop() {}

interface CombinedModelSelectorProps {
  providers: ProviderSelectorProvider[];
  selectedProvider: string;
  selectedModel: string;
  onSelect: (provider: AgentProvider, modelId: string) => void;
  isLoading: boolean;
  profiles?: AgentProfilePicker | null;
  onApplyProfile?: (profileId: string) => void;
  onEditProfiles?: () => void;
  onCreateProfile?: (seed: AgentProfileSeed) => void;
  onEditProfile?: (profileId: string) => void;
  renderTrigger?: (input: {
    selectedModelLabel: string;
    onPress: () => void;
    disabled: boolean;
    isOpen: boolean;
    hovered: boolean;
    pressed: boolean;
  }) => React.ReactNode;
  onOpen?: () => void;
  onClose?: () => void;
  onRetryProvider?: (provider: AgentProvider) => void;
  isRetryingProvider?: boolean;
  disabled?: boolean;
  serverId?: string | null;
  desktopPlacement?: ComboboxProps["desktopPlacement"];
  desktopMinWidth?: number;
  desktopThinking?: DesktopThinkingControl;
  /**
   * Render the custom trigger as a full-width form field: the outer Pressable
   * becomes a transparent passthrough that stretches its child edge-to-edge and
   * stops painting its own hover/pressed background and rounded corners. The
   * trigger itself owns the field visuals and reads hovered/pressed to show its
   * active state. Without this the trigger stays a content-width toolbar chip
   * (the composer's layout).
   */
  triggerFill?: boolean;
  toolbar?: {
    glyphSize: number;
    showCaret: boolean;
  };
}

function ModelSelectorLabel({
  selectedProvider,
  serverId = null,
  toolbar,
  desktopThinking,
  label,
  placeholder,
}: Pick<
  CombinedModelSelectorProps,
  "selectedProvider" | "serverId" | "toolbar" | "desktopThinking"
> & { label: string; placeholder: boolean }) {
  return (
    <>
      {selectedProvider.trim().length > 0 ? (
        <View style={toolbar?.glyphSize === 20 ? styles.toolbarGlyph20 : styles.toolbarGlyph16}>
          <ModelProviderGlyph
            provider={selectedProvider}
            serverId={serverId}
            size={toolbar?.glyphSize ?? ICON_SIZE.md}
          />
        </View>
      ) : null}
      <Text
        style={[
          placeholder ? styles.triggerTextPlaceholder : styles.triggerText,
          desktopThinking && !placeholder && styles.triggerModelText,
        ]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {label}
        {desktopThinking ? (
          <Text style={styles.triggerEffortText}>{` ${desktopThinking.label}`}</Text>
        ) : null}
      </Text>
      {desktopThinking?.fast?.on ? <FastBadgeIcon size={12} uniProps={mutedFilledIcon} /> : null}
    </>
  );
}

export function CombinedModelSelector({
  providers,
  selectedProvider,
  selectedModel,
  onSelect,
  isLoading,
  profiles = null,
  onApplyProfile,
  onEditProfiles,
  onCreateProfile,
  onEditProfile,
  renderTrigger,
  onOpen,
  onClose,
  onRetryProvider,
  isRetryingProvider = false,
  disabled = false,
  serverId = null,
  desktopPlacement,
  desktopMinWidth,
  desktopThinking,
  triggerFill = false,
  toolbar,
}: CombinedModelSelectorProps) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const modelBrowserScrolling = resolveModelBrowserScrolling({ isNative, isCompact });
  const anchorRef = useRef<View>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showModelBrowser, setShowModelBrowser] = useState(false);
  const [isContentReady, setIsContentReady] = useState(isWeb);
  const browser = useModelBrowser({
    providers,
    selectedProvider,
    selectedModel,
    isLoading,
    profiles,
    serverId,
  });
  const { prepareToOpen, reset } = browser;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      setShowModelBrowser(false);
      if (open) {
        prepareToOpen();
        onOpen?.();
        return;
      }
      reset();
      onClose?.();
    },
    [onClose, onOpen, prepareToOpen, reset],
  );

  const handleSelect = useCallback(
    (provider: string, modelId: string) => {
      onSelect(provider, modelId);
      handleOpenChange(false);
    },
    [handleOpenChange, onSelect],
  );

  useEffect(() => {
    if (isWeb) return () => {};
    if (!isOpen) {
      setIsContentReady(false);
      return () => {};
    }
    const frame = requestAnimationFrame(() => {
      setIsContentReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  const handleTriggerPress = useCallback(() => {
    handleOpenChange(!isOpen);
  }, [handleOpenChange, isOpen]);
  const openModelBrowser = useCallback(() => setShowModelBrowser(true), []);
  // While models load, a stable placeholder replaces the loading text so the trigger does not
  // change wording when the real model and effort arrive.
  const isLabelLoading = browser.triggerLabel === t("providerSelection.loading");
  const triggerLabel = isLabelLoading ? t("modelSelector.selectModel") : browser.triggerLabel;
  const showPreferences = getIsElectronMac() && Boolean(desktopThinking) && !showModelBrowser;

  const triggerStyle = useCallback(
    ({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => {
      if (triggerFill) {
        return [
          styles.trigger,
          styles.customTriggerWrapper,
          styles.triggerFill,
          disabled && styles.triggerDisabled,
        ];
      }
      return [
        styles.trigger,
        Boolean(hovered) && styles.triggerHovered,
        (pressed || isOpen) && styles.triggerPressed,
        disabled && styles.triggerDisabled,
        renderTrigger ? styles.customTriggerWrapper : null,
      ];
    },
    [disabled, isOpen, renderTrigger, triggerFill],
  );

  const handleApplyProfile = useCallback(
    (profileId: string) => {
      onApplyProfile?.(profileId);
      handleOpenChange(false);
    },
    [handleOpenChange, onApplyProfile],
  );

  const handleEditProfiles = useCallback(() => {
    handleOpenChange(false);
    onEditProfiles?.();
  }, [handleOpenChange, onEditProfiles]);

  const handleCreateProfile = useCallback(
    (seed: AgentProfileSeed) => {
      handleOpenChange(false);
      onCreateProfile?.(seed);
    },
    [handleOpenChange, onCreateProfile],
  );

  const handleEditProfile = useCallback(
    (profileId: string) => {
      handleOpenChange(false);
      onEditProfile?.(profileId);
    },
    [handleOpenChange, onEditProfile],
  );

  const presentation = showPreferences
    ? { desktopMinWidth: 256 }
    : { desktopMinWidth, desktopFixedHeight: browser.desktopFixedHeight, header: browser.header };
  let selectorBody;
  if (showPreferences && desktopThinking) {
    selectorBody = (
      <DesktopModelPreferences
        thinking={desktopThinking}
        modelLabel={browser.selectedModelLabel}
        onBrowseModels={openModelBrowser}
      />
    );
  } else if (isContentReady) {
    selectorBody = (
      <ModelBrowser
        state={browser}
        onSelect={handleSelect}
        onApplyProfile={handleApplyProfile}
        onEditProfiles={onEditProfiles ? handleEditProfiles : undefined}
        onCreateProfile={onCreateProfile ? handleCreateProfile : undefined}
        onEditProfile={onEditProfile ? handleEditProfile : undefined}
        onRetryProvider={onRetryProvider}
        isRetryingProvider={isRetryingProvider}
        scrolling={modelBrowserScrolling}
      />
    );
  } else {
    selectorBody = (
      <View style={styles.sheetLoadingState}>
        <ThemedLoadingSpinner size={ICON_SIZE.sm} uniProps={foregroundMutedMapping} />
        <Text style={styles.sheetLoadingText}>{t("modelSelector.loadingSelector")}</Text>
      </View>
    );
  }

  return (
    <>
      {renderTrigger ? (
        <Pressable
          ref={anchorRef}
          collapsable={false}
          disabled={disabled}
          onPress={handleTriggerPress}
          style={triggerStyle}
          accessibilityRole="button"
          accessibilityLabel={t("modelSelector.selectedModel", {
            model: browser.selectedModelLabel,
          })}
          testID="combined-model-selector"
        >
          {({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) =>
            renderTrigger({
              selectedModelLabel: triggerLabel,
              onPress: handleTriggerPress,
              disabled,
              isOpen,
              hovered: Boolean(hovered),
              pressed,
            })
          }
        </Pressable>
      ) : (
        <ComboboxTrigger
          ref={anchorRef}
          collapsable={false}
          disabled={disabled}
          onPress={handleTriggerPress}
          style={triggerStyle}
          accessibilityRole="button"
          accessibilityLabel={t("modelSelector.selectedModel", {
            model: browser.selectedModelLabel,
          })}
          testID="combined-model-selector"
          chevron={toolbar?.showCaret === false ? null : undefined}
        >
          <ModelSelectorLabel
            selectedProvider={selectedProvider}
            serverId={serverId}
            toolbar={toolbar}
            desktopThinking={desktopThinking}
            label={triggerLabel}
            placeholder={isLabelLoading}
          />
        </ComboboxTrigger>
      )}
      <Combobox
        options={EMPTY_COMBOBOX_OPTIONS}
        value=""
        onSelect={noop}
        open={isOpen}
        onOpenChange={handleOpenChange}
        anchorRef={anchorRef}
        desktopPlacement={desktopPlacement}
        {...presentation}
        desktopLockWidth
        desktopChildrenScrollEnabled={false}
        searchable={false}
        mobileChildrenScrollEnabled={!browser.isProviderView || !isNative}
        mobileChildrenContentContainerStyle={styles.mobileBrowserContent}
      >
        {selectorBody}
      </Combobox>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  mobileBrowserContent: {
    paddingHorizontal: 0,
  },
  trigger: {
    height: 28,
    minWidth: 0,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius["2xl"],
  },
  triggerHovered: {
    backgroundColor: theme.colors.surface2,
  },
  toolbarGlyph16: {
    width: 16,
    height: 16,
    flexShrink: 0,
  },
  toolbarGlyph20: {
    width: 20,
    height: 20,
    flexShrink: 0,
  },
  triggerPressed: {
    backgroundColor: theme.colors.surface0,
  },
  triggerDisabled: {
    opacity: 0.5,
  },
  triggerTextPlaceholder: {
    minWidth: 88,
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
  },
  triggerText: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
  },
  // Codex footer: the model reads in full foreground, the effort after it stays muted.
  triggerModelText: {
    color: theme.colors.foreground,
  },
  triggerEffortText: {
    color: theme.colors.foregroundMuted,
  },
  customTriggerWrapper: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    height: "auto",
  },
  triggerFill: {
    alignSelf: "stretch",
    flexShrink: 0,
    flexDirection: "column",
    alignItems: "stretch",
    backgroundColor: "transparent",
    borderRadius: 0,
  },
  sheetLoadingState: {
    minHeight: 160,
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  sheetLoadingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));
