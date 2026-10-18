import { ToolCallDetailsContent } from "@/components/tool-call-details";
import { PlanCard } from "@/components/plan-card";
import { useProviderIcon } from "@/components/provider-icons";
import { QuestionFormCard } from "@/components/question-form-card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Shortcut } from "@/components/ui/shortcut";
import { getIsElectronMac, isWeb } from "@/constants/platform";
import type { Theme } from "@/styles/theme";
import type { PendingPermission } from "@/types/shared";
import { toErrorMessage } from "@/utils/error-messages";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type {
  AgentPermissionAction,
  AgentPermissionResponse,
} from "@getpaseo/protocol/agent-types";
import { useMutation } from "@tanstack/react-query";
import { Check, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useIsCompactFormFactor } from "@/constants/layout";

const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const ThemedCheckIcon = withUnistyles(Check);
const ThemedXIcon = withUnistyles(X);
const ENTER_KEYS = ["Enter"];
const ESCAPE_KEYS = ["Esc"];

const primaryColorMapping = (theme: Theme) => ({
  color: theme.colors.foreground,
});
const mutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});
const dockedPrimaryColorMapping = (theme: Theme) => ({
  color: theme.colors.surface0,
});

function resolvePermissionActions({
  request,
  isPlanRequest,
  t,
}: {
  request: PendingPermission["request"];
  isPlanRequest: boolean;
  t: ReturnType<typeof useTranslation>["t"];
}): AgentPermissionAction[] {
  if (request.kind === "question") return [];
  if (Array.isArray(request.actions) && request.actions.length > 0) return request.actions;
  return [
    {
      id: "reject",
      label: t("agentStream.permission.deny"),
      behavior: "deny",
      variant: "danger",
      intent: "dismiss",
    },
    {
      id: "accept",
      label: isPlanRequest
        ? t("agentStream.permission.implement")
        : t("agentStream.permission.accept"),
      behavior: "allow",
      variant: "primary",
    },
  ];
}

function resolveActionTestId(action: AgentPermissionAction): string {
  if (action.behavior === "deny") return "permission-request-deny";
  if (action.id === "accept" || action.id === "implement") return "permission-request-accept";
  return `permission-request-action-${action.id}`;
}

interface PermissionActionButtonProps {
  action: AgentPermissionAction;
  isRespondingAction: boolean;
  isResponding: boolean;
  isPrimary: boolean;
  Icon: typeof ThemedCheckIcon;
  testID: string;
  docked: boolean;
  shortcut?: "Enter" | "Escape";
  onPress: (action: AgentPermissionAction) => void;
}

function PermissionActionButton({
  action,
  isRespondingAction,
  isResponding,
  isPrimary,
  Icon,
  testID,
  docked,
  shortcut,
  onPress,
}: PermissionActionButtonProps) {
  const handlePress = useCallback(() => onPress(action), [onPress, action]);
  const style = useCallback(
    ({ pressed, hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => {
      const baseStyle = docked ? styles.dockedOptionButton : styles.optionButton;
      const hoverStyle = docked ? styles.dockedOptionButtonHovered : styles.optionButtonHovered;
      const pressedStyle = docked ? styles.dockedOptionButtonPressed : styles.optionButtonPressed;
      return [
        baseStyle,
        docked && isPrimary ? styles.dockedOptionButtonPrimary : null,
        hovered ? hoverStyle : null,
        pressed ? pressedStyle : null,
      ];
    },
    [docked, isPrimary],
  );
  const textStyle = docked
    ? [styles.dockedOptionText, isPrimary && styles.dockedOptionTextPrimary]
    : [styles.optionText, isPrimary && styles.optionTextPrimary];
  let colorMapping = mutedColorMapping;
  if (isPrimary) colorMapping = docked ? dockedPrimaryColorMapping : primaryColorMapping;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      testID={testID}
      style={style}
      onPress={handlePress}
      disabled={isResponding}
    >
      {isRespondingAction ? (
        <ThemedLoadingSpinner size="small" uniProps={colorMapping} />
      ) : (
        <View style={styles.optionContent}>
          {!docked ? <Icon size={14} uniProps={colorMapping} /> : null}
          <Text style={textStyle}>{action.label}</Text>
          {shortcut ? (
            <Shortcut
              keys={shortcut === "Enter" ? ENTER_KEYS : ESCAPE_KEYS}
              textStyle={isPrimary ? styles.dockedOptionTextPrimary : undefined}
            />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

function PermissionError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Text style={styles.responseError}>{message}</Text>;
}

export function PermissionRequestCard({
  permission,
  client,
  docked = false,
  serverId,
}: {
  permission: PendingPermission;
  client: DaemonClient | null;
  docked?: boolean;
  serverId?: string;
}) {
  const { t } = useTranslation();
  const isMobile = useIsCompactFormFactor();
  const { request } = permission;
  const ProviderIcon = useProviderIcon(request.provider, serverId);
  const isPlanRequest = request.kind === "plan";
  const isDockedToolRequest = docked && getIsElectronMac() && request.kind === "tool";
  const title = isPlanRequest
    ? t("agentStream.permission.plan")
    : (request.title ?? request.name ?? t("agentStream.permission.required"));
  const description = request.description ?? "";
  const resolvedToolCallDetail = useMemo(
    () =>
      request.detail ?? {
        type: "unknown" as const,
        input: request.input ?? null,
        output: null,
      },
    [request.detail, request.input],
  );
  const resolvedActions = useMemo(
    () => resolvePermissionActions({ request, isPlanRequest, t }),
    [isPlanRequest, request, t],
  );
  const planMarkdown = useMemo(() => {
    const planFromMetadata =
      typeof request.metadata?.planText === "string" ? request.metadata.planText : undefined;
    if (planFromMetadata) return planFromMetadata;
    const candidate = request.input?.plan;
    return typeof candidate === "string" ? candidate : undefined;
  }, [request]);
  const permissionMutation = useMutation({
    mutationFn: async (input: {
      agentId: string;
      requestId: string;
      response: AgentPermissionResponse;
    }) => {
      if (!client) throw new Error(t("common.errors.daemonClientUnavailable"));
      return client.respondToPermissionAndWait(
        input.agentId,
        input.requestId,
        input.response,
        15000,
      );
    },
  });
  const {
    reset: resetPermissionMutation,
    mutateAsync: respondToPermission,
    isPending: isResponding,
  } = permissionMutation;
  const [respondingActionId, setRespondingActionId] = useState<string | null>(null);
  const [responseError, setResponseError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    resetPermissionMutation();
    setRespondingActionId(null);
    setResponseError(null);
    inFlightRef.current = false;
  }, [permission.request.id, resetPermissionMutation]);

  const handleResponse = useCallback(
    (response: AgentPermissionResponse, actionId: string) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setRespondingActionId(actionId);
      setResponseError(null);
      respondToPermission({
        agentId: permission.agentId,
        requestId: permission.request.id,
        response,
      })
        .catch((error) => {
          setRespondingActionId(null);
          setResponseError(
            t("agentStream.permission.responseFailed", { message: toErrorMessage(error) }),
          );
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    },
    [permission.agentId, permission.request.id, respondToPermission, t],
  );
  const handleActionPress = useCallback(
    (action: AgentPermissionAction) => {
      if (action.behavior === "allow") {
        handleResponse({ behavior: "allow", selectedActionId: action.id }, action.id);
        return;
      }
      handleResponse(
        { behavior: "deny", selectedActionId: action.id, message: "Denied by user" },
        action.id,
      );
    },
    [handleResponse],
  );
  const handleQuestionResponse = useCallback(
    (response: AgentPermissionResponse) => handleResponse(response, "question"),
    [handleResponse],
  );

  const optionsContainerStyle = useMemo(
    () => [styles.optionsContainer, !isMobile && styles.optionsContainerDesktop],
    [isMobile],
  );
  const renderAction = useCallback(
    (action: AgentPermissionAction) => {
      const isPrimary = action.variant === "primary";
      const Icon = action.behavior === "allow" ? ThemedCheckIcon : ThemedXIcon;
      let shortcut: "Enter" | "Escape" | undefined;
      if (isDockedToolRequest) {
        if (isPrimary && resolvedActions.filter((item) => item.variant === "primary").length === 1)
          shortcut = "Enter";
        else if (
          action.behavior === "deny" &&
          resolvedActions.filter((item) => item.behavior === "deny").length === 1
        )
          shortcut = "Escape";
      }
      return (
        <PermissionActionButton
          key={action.id}
          action={action}
          isRespondingAction={respondingActionId === action.id}
          isResponding={isResponding}
          isPrimary={isPrimary}
          Icon={Icon}
          testID={resolveActionTestId(action)}
          docked={isDockedToolRequest}
          shortcut={shortcut}
          onPress={handleActionPress}
        />
      );
    },
    [handleActionPress, isDockedToolRequest, isResponding, respondingActionId, resolvedActions],
  );
  const primaryActions = useMemo(
    () => resolvedActions.filter((action) => action.variant === "primary"),
    [resolvedActions],
  );
  const leftActions = useMemo(
    () =>
      resolvedActions.filter(
        (action) => action.behavior === "allow" && action.variant !== "primary",
      ),
    [resolvedActions],
  );
  const rightActions = useMemo(
    () => [
      ...resolvedActions.filter(
        (action) => !leftActions.includes(action) && action.variant !== "primary",
      ),
      ...primaryActions,
    ],
    [leftActions, resolvedActions, primaryActions],
  );
  const primaryAction = primaryActions.length === 1 ? primaryActions[0] : null;
  const denyActions = useMemo(
    () => resolvedActions.filter((action) => action.behavior === "deny"),
    [resolvedActions],
  );
  const canHandleCardKey = primaryAction !== null || denyActions.length === 1;
  const handleCardKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.target !== event.currentTarget || !canHandleCardKey || isResponding) return;
      if (event.key === "Enter" && primaryAction) {
        event.preventDefault();
        event.stopPropagation();
        handleActionPress(primaryAction);
      } else if (event.key === "Escape" && denyActions.length === 1) {
        event.preventDefault();
        event.stopPropagation();
        handleActionPress(denyActions[0]);
      }
    },
    [canHandleCardKey, denyActions, handleActionPress, isResponding, primaryAction],
  );

  if (request.kind === "question") {
    return (
      <QuestionFormCard
        permission={permission}
        onRespond={handleQuestionResponse}
        isResponding={isResponding}
      />
    );
  }

  const footer = (
    <>
      <Text testID="permission-request-question" style={styles.question}>
        {t("agentStream.permission.question")}
      </Text>
      <View style={optionsContainerStyle}>{resolvedActions.map(renderAction)}</View>
      <PermissionError message={responseError} />
    </>
  );

  if (isPlanRequest && planMarkdown) {
    return (
      <PlanCard
        title={title}
        description={description}
        text={planMarkdown}
        outcome="pending"
        footer={footer}
        testID="permission-plan-card"
        disableOuterSpacing
      />
    );
  }

  if (isDockedToolRequest) {
    return (
      <View
        testID="permission-request-card"
        role="group"
        accessibilityLabel={title}
        style={styles.dockedContainer}
        {...(isWeb && canHandleCardKey ? { tabIndex: 0, onKeyDown: handleCardKeyDown } : {})}
      >
        <View style={styles.dockedTitleRow}>
          <ProviderIcon size={16} color={styles.dockedProviderIcon.color} />
          <Text style={styles.dockedTitle}>{title}</Text>
        </View>
        <Text testID="permission-request-question" style={styles.dockedQuestion}>
          {description || t("agentStream.permission.question")}
        </Text>
        <ToolCallDetailsContent detail={resolvedToolCallDetail} maxHeight={200} />
        <View style={styles.dockedActions}>
          <View style={styles.dockedActionGroup}>{leftActions.map(renderAction)}</View>
          <View style={styles.dockedActionGroup}>{rightActions.map(renderAction)}</View>
        </View>
        <PermissionError message={responseError} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {planMarkdown ? (
        <PlanCard
          title={t("agentStream.permission.proposedPlan")}
          text={planMarkdown}
          testID="permission-plan-card"
          disableOuterSpacing
        />
      ) : null}
      {!isPlanRequest ? (
        <ToolCallDetailsContent detail={resolvedToolCallDetail} maxHeight={200} />
      ) : null}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => {
  const defaultDark = getIsElectronMac() && rt.themeName === "dark";
  return {
    container: {
      marginVertical: theme.spacing[3],
      padding: theme.spacing[3],
      borderRadius: theme.spacing[2],
      borderWidth: 1,
      gap: theme.spacing[2],
      backgroundColor: theme.colors.surface1,
      borderColor: theme.colors.border,
    },
    title: {
      fontSize: theme.fontSize.base,
      lineHeight: 22,
      color: theme.colors.foreground,
    },
    description: {
      fontSize: theme.fontSize.base,
      lineHeight: 20,
      color: theme.colors.foregroundMuted,
    },
    question: {
      fontSize: theme.fontSize.base,
      marginTop: theme.spacing[1],
      marginBottom: theme.spacing[1],
      color: theme.colors.foregroundMuted,
    },
    optionsContainer: { gap: theme.spacing[2] },
    optionsContainerDesktop: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "flex-start",
      alignItems: "center",
      width: "100%",
    },
    optionButton: {
      paddingVertical: theme.spacing[2],
      paddingHorizontal: theme.spacing[3],
      borderRadius: theme.borderRadius.md,
      alignItems: "center",
      borderWidth: theme.borderWidth[1],
      backgroundColor: theme.colors.surface1,
      borderColor: theme.colors.borderAccent,
    },
    optionButtonHovered: { backgroundColor: theme.colors.surface2 },
    optionButtonPressed: { opacity: 0.9 },
    optionContent: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
    optionText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.normal,
      color: theme.colors.foregroundMuted,
    },
    optionTextPrimary: { color: theme.colors.foreground },
    responseError: {
      fontSize: theme.fontSize.sm,
      lineHeight: 18,
      color: theme.colors.palette.red[300],
    },
    dockedContainer: {
      padding: 16,
      gap: 12,
      borderRadius: 20,
      borderWidth: 1,
      backgroundColor: defaultDark ? theme.colors.surface2 : theme.colors.surface1,
      borderColor: defaultDark ? theme.colors.borderAccent : theme.colors.border,
    },
    dockedTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    dockedProviderIcon: { color: theme.colors.foregroundMuted },
    dockedTitle: {
      flexShrink: 1,
      fontSize: theme.fontSize.base,
      lineHeight: 22,
      color: theme.colors.foreground,
    },
    dockedQuestion: {
      fontSize: theme.fontSize.base,
      lineHeight: 22,
      color: theme.colors.foreground,
    },
    dockedActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8,
      width: "100%",
    },
    dockedActionGroup: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
    dockedOptionButton: {
      paddingVertical: 4,
      paddingHorizontal: 12,
      minHeight: 28,
      borderRadius: 14,
      alignItems: "center",
      borderWidth: 1,
      backgroundColor: defaultDark ? theme.colors.surface3 : theme.colors.surface2,
      borderColor: defaultDark ? theme.colors.borderAccent : theme.colors.border,
    },
    dockedOptionButtonPrimary: {
      backgroundColor: theme.colors.foreground,
      borderColor: theme.colors.foreground,
    },
    dockedOptionButtonHovered: { opacity: 0.88 },
    dockedOptionButtonPressed: { opacity: 0.74 },
    dockedOptionText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.normal,
      color: theme.colors.foreground,
    },
    dockedOptionTextPrimary: { color: theme.colors.surface0 },
  };
});
