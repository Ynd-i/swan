import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  type MutableRefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { Text } from "react-native";
import { Target } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type { AgentFeature } from "@getpaseo/protocol/agent-types";
import { PlanModeIcon } from "@/agent-controls/icons";
import {
  type PlanToggle,
  adoptDraftBaseMode,
  getDisplayedModeId,
  resolvePlanToggle,
  selectPermissionMode,
  takeBaseModeOnPlanExit,
} from "@/agent-controls/policy";
import { resolveDefaultModeId } from "@/command-center/agent-control-registration";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AgentControlTrigger } from "@/composer/agent-controls/control";
import { useComposerKeyboardScope } from "@/composer/keyboard-scope";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import type { KeyboardActionDefinition } from "@/keyboard/keyboard-action-dispatcher";
import type { AgentModeControlValue } from "@/composer/agent-controls/mode-control";

// Plan is a toggle next to the permission mode: the trigger keeps showing the base permission
// mode while a mode-based plan (Claude, OpenCode, Copilot) is on, and leaving plan re-applies it.
export function useDesktopPlanMode(input: {
  enabled: boolean;
  ownerKey: string;
  modeControl: AgentModeControlValue | null | undefined;
  features: AgentFeature[] | undefined;
  onSetFeature: ((featureId: string, value: unknown) => void) | undefined;
}) {
  const { enabled, ownerKey, modeControl, features, onSetFeature } = input;
  const [version, bump] = useReducer((count: number) => count + 1, 0);
  const selectedId = modeControl?.selectedModeId ?? null;
  const previousRef = useRef({ ownerKey, selectedId });

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = { ownerKey, selectedId };
    if (!enabled || !modeControl || previous.ownerKey !== ownerKey) return;
    const restoreModeId = takeBaseModeOnPlanExit(
      ownerKey,
      modeControl.modeOptions,
      previous.selectedId,
      selectedId,
    );
    if (restoreModeId) modeControl.onSelectMode(restoreModeId);
  }, [enabled, modeControl, ownerKey, selectedId]);

  useEffect(() => {
    if (!enabled || !modeControl) return;
    if (adoptDraftBaseMode(ownerKey, modeControl.modeOptions, selectedId)) bump();
  }, [enabled, modeControl, ownerKey, selectedId]);

  const displayedModeControl = useMemo(() => {
    if (!enabled || !modeControl) return modeControl;
    const modes = {
      options: modeControl.modeOptions,
      selectedId,
      select: modeControl.onSelectMode,
    };
    return {
      ...modeControl,
      selectedModeId: getDisplayedModeId(ownerKey, modeControl.modeOptions, selectedId),
      onSelectMode: (modeId: string) => {
        const result = selectPermissionMode(ownerKey, modes, modeId);
        bump();
        return result;
      },
    };
    // version: the remembered base mode lives outside React state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, modeControl, ownerKey, selectedId, version]);

  const planToggle =
    enabled && onSetFeature
      ? resolvePlanToggle({
          ownerKey,
          features: features ?? [],
          setFeature: onSetFeature,
          modes: modeControl
            ? {
                options: modeControl.modeOptions,
                selectedId,
                defaultModeId: resolveDefaultModeId(
                  modeControl.provider,
                  modeControl.providerDefinitions,
                ),
                select: modeControl.onSelectMode,
              }
            : undefined,
        })
      : null;

  return { modeControl: displayedModeControl, planToggle };
}

export interface ComposerModesMenuState {
  planOn: boolean | null;
  goalAvailable: boolean;
}

/**
 * Lets the composer's "+" menu toggle plan and goal. The agent controls own the plan toggle, so
 * they publish its state as primitives (the toggle object is rebuilt every render) and the live
 * toggle through a ref. Goal mode is composer state: its next message is sent as `/goal <text>`.
 */
export interface ComposerModesBridge {
  planToggleRef: MutableRefObject<PlanToggle | null>;
  setMenuState: (state: ComposerModesMenuState) => void;
  goalOn: boolean;
  setGoalOn: (on: boolean) => void;
}

export const ComposerModesContext = createContext<ComposerModesBridge | null>(null);

export function usePublishComposerModes(toggle: PlanToggle | null, goalAvailable: boolean) {
  const bridge = useContext(ComposerModesContext);
  const planToggleRef = bridge?.planToggleRef;
  const setMenuState = bridge?.setMenuState;
  useEffect(() => {
    if (planToggleRef) planToggleRef.current = toggle;
  });
  const planOn = toggle ? toggle.isOn : null;
  useEffect(() => {
    setMenuState?.({ planOn, goalAvailable });
    return () => setMenuState?.({ planOn: null, goalAvailable: false });
  }, [goalAvailable, planOn, setMenuState]);
  return bridge;
}

export function GoalModeToggle({
  iconColor,
  disabled,
  onTurnOff,
}: {
  iconColor: string;
  disabled: boolean;
  onTurnOff: () => void;
}) {
  const { t } = useTranslation();
  const label = t("composer.goalMode.label");
  return (
    <AgentControlTrigger
      icon={Target}
      iconColor={iconColor}
      surface="toolbar"
      label={label}
      disabled={disabled}
      onPress={onTurnOff}
      accessibilityLabel={label}
      testID="agent-goal-toggle"
    />
  );
}

// Shift+Tab toggles plan, as in Codex. It outranks the mode control's Shift+Tab cycling, which
// still applies where there is no plan toggle.
export function usePlanModeShortcut(toggle: PlanToggle | null, disabled: boolean) {
  const { isActiveComposer } = useComposerKeyboardScope();
  const handlerId = `plan-mode:${useId()}`;
  const handle = useCallback(
    (action: KeyboardActionDefinition): boolean => {
      if (action.id !== "message-input.mode-cycle" || !toggle) return false;
      void (toggle.isOn ? toggle.turnOff() : toggle.turnOn());
      return true;
    },
    [toggle],
  );
  useKeyboardActionHandler({
    handlerId,
    actions: ["message-input.mode-cycle"],
    enabled: isActiveComposer && !disabled && toggle !== null,
    priority: 201,
    handle,
  });
}

export function PlanModeToggle({
  toggle,
  iconColor,
  disabled,
}: {
  toggle: PlanToggle;
  iconColor: string;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const label = t("shell.commandCenter.planModeGroupLabel");
  const handlePress = useCallback(() => {
    void (toggle.isOn ? toggle.turnOff() : toggle.turnOn());
  }, [toggle]);
  return (
    <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild triggerRefProp="ref">
        <AgentControlTrigger
          icon={PlanModeIcon}
          iconColor={iconColor}
          surface="toolbar"
          label={label}
          showToolbarLabel={false}
          disabled={disabled}
          onPress={handlePress}
          accessibilityLabel={label}
          testID="agent-plan-toggle"
        />
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8}>
        <Text style={styles.tooltipText}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

const styles = StyleSheet.create((theme) => ({
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: theme.fontSize.base * 1.4,
  },
}));
