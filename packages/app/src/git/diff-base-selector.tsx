import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { ArrowRight } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import { Combobox, ComboboxItem, type ComboboxProps } from "@/components/ui/combobox";
import { ToolbarLabelSelectTrigger } from "@/components/ui/toolbar-label-trigger";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFetchQuery } from "@/data/query";
import {
  buildDiffBaseOptions,
  diffBaseRefOptionPrefix,
  formatDiffBaseRef,
  resolveValidatedDiffBaseRef,
  workspaceDefaultDiffBaseOptionId,
} from "@/git/diff-base-options";
import { useCheckoutStatusQuery } from "@/git/use-status-query";
import { useWorkingDiffComparison } from "@/git/working-diff-comparison";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useToast } from "@/contexts/toast-context";

interface DiffBaseSelectorProps {
  serverId: string;
  workspaceId?: string | null;
  cwd: string;
}

const mutedIconColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedArrowRight = withUnistyles(ArrowRight);

function getSuggestionsEnabled(input: {
  client: unknown;
  connected: boolean;
  cwd: string;
  isGit: boolean;
  isFixed: boolean;
  open: boolean;
}): boolean {
  return Boolean(
    input.client && input.connected && input.cwd && input.isGit && !input.isFixed && input.open,
  );
}

function getEmptyText(input: {
  connected: boolean;
  error: Error | null;
  pending: boolean;
  translate: (key: string) => string;
}): string {
  if (!input.connected) return input.translate("common.errors.daemonClientDisconnected");
  if (input.pending) return input.translate("common.states.loading");
  return input.error?.message ?? input.translate("branchSwitcher.empty");
}

function resolveEffectiveBaseRef(
  fixedBase: boolean,
  selectedBaseRef: string | undefined,
  defaultBaseRef: string | null | undefined,
): string | null | undefined {
  return fixedBase ? defaultBaseRef : (selectedBaseRef ?? defaultBaseRef);
}

export function DiffBaseSelector({ serverId, workspaceId, cwd }: DiffBaseSelectorProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const anchorRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const selectionVersion = useRef(0);
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const { status } = useCheckoutStatusQuery({ serverId, cwd });
  const currentBranch = status?.currentBranch ?? null;
  const defaultBaseRef = status?.baseRef ?? null;
  const isDirty = Boolean(status?.isGit && status.isDirty);
  const { selectedBaseRef, selectBaseRef } = useWorkingDiffComparison({
    serverId,
    workspaceId,
    cwd,
    isDirty,
    currentBranch,
    defaultBaseRef,
  });
  const isFixed = Boolean(status?.isPaseoOwnedWorktree);
  useEffect(
    () => () => {
      selectionVersion.current += 1;
    },
    [
      serverId,
      workspaceId,
      cwd,
      client,
      isConnected,
      isDirty,
      currentBranch,
      defaultBaseRef,
      isFixed,
    ],
  );
  const branchSuggestionsQuery = useFetchQuery({
    queryKey: ["diffBaseSuggestions", serverId, workspaceId ?? cwd],
    queryFn: async () => {
      if (!client) throw new Error(t("common.errors.daemonClientUnavailable"));
      const payload = await client.getBranchSuggestions({ cwd, limit: 200 });
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    enabled: getSuggestionsEnabled({
      client,
      connected: isConnected,
      cwd,
      isGit: status?.isGit === true,
      isFixed,
      open,
    }),
    retry: false,
    dataShape: "value",
    staleTimeMs: 15_000,
  });
  const effectiveBaseRef = resolveEffectiveBaseRef(isFixed, selectedBaseRef, defaultBaseRef);
  const baseOptions = useMemo(() => {
    if (isFixed || !isConnected || !branchSuggestionsQuery.isSuccess) return null;
    return buildDiffBaseOptions({
      suggestions: branchSuggestionsQuery.data,
      currentBranch,
      defaultBaseRef,
      selectedBaseRef,
      workspaceDefault: t("diffBaseSelector.workspaceDefault"),
    });
  }, [
    branchSuggestionsQuery.data,
    branchSuggestionsQuery.isSuccess,
    isConnected,
    isFixed,
    selectedBaseRef,
    currentBranch,
    defaultBaseRef,
    t,
  ]);
  const emptyText = useMemo(() => {
    const error =
      branchSuggestionsQuery.error instanceof Error ? branchSuggestionsQuery.error : null;
    return getEmptyText({
      connected: isConnected,
      error,
      pending: branchSuggestionsQuery.isPending,
      translate: t,
    });
  }, [branchSuggestionsQuery.error, branchSuggestionsQuery.isPending, isConnected, t]);
  const handleOpen = useCallback(() => setOpen(true), []);
  const handleSelect = useCallback(
    (optionId: string) => {
      const version = ++selectionVersion.current;
      if (optionId === workspaceDefaultDiffBaseOptionId) {
        selectBaseRef(null);
        return;
      }
      const legacyBranch = baseOptions?.legacyBranchByOptionId.get(optionId);
      if (!legacyBranch) {
        selectBaseRef(optionId.slice(diffBaseRefOptionPrefix.length));
        return;
      }
      if (!client) {
        toast.error(t("common.errors.daemonClientUnavailable"));
        return;
      }
      void (async () => {
        try {
          const result = await client.validateBranch({ cwd, branchName: legacyBranch });
          if (version !== selectionVersion.current) return;
          const ref = resolveValidatedDiffBaseRef(result);
          if (ref) {
            selectBaseRef(ref);
            return;
          }
          toast.error(result.error ?? t("diffBaseSelector.unableToResolve", { ref: legacyBranch }));
        } catch (error) {
          if (version !== selectionVersion.current) return;
          toast.error(
            error instanceof Error
              ? error.message
              : t("diffBaseSelector.unableToResolve", { ref: legacyBranch }),
          );
        }
      })();
    },
    [baseOptions, client, cwd, selectBaseRef, t, toast],
  );
  const renderOption = useCallback<NonNullable<ComboboxProps["renderOption"]>>(
    ({ option, selected, active, onPress }) => (
      <ComboboxItem label={option.label} selected={selected} active={active} onPress={onPress} />
    ),
    [],
  );

  if (!status?.isGit || !status.currentBranch) return null;

  const baseLabel = effectiveBaseRef
    ? formatDiffBaseRef(effectiveBaseRef)
    : t("diffBaseSelector.workspaceDefault");
  return (
    <View ref={anchorRef} collapsable={false} style={styles.anchor} testID="changes-base-selector">
      <View style={styles.relation}>
        <Text numberOfLines={1} style={styles.currentBranch}>
          {status.currentBranch}
        </Text>
        <ThemedArrowRight size={14} uniProps={mutedIconColorMapping} />
        {isFixed ? (
          <Tooltip delayDuration={300} enabledOnDesktop enabledOnMobile={false}>
            <TooltipTrigger asChild>
              <View>
                <ToolbarLabelSelectTrigger
                  label={baseLabel}
                  disabled
                  accessibilityRole="button"
                  accessibilityLabel={t("diffBaseSelector.compareAgainst", { ref: baseLabel })}
                  accessibilityHint={t("diffBaseSelector.worktreeFixed")}
                />
              </View>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <Text style={styles.tooltipText}>{t("diffBaseSelector.worktreeFixed")}</Text>
            </TooltipContent>
          </Tooltip>
        ) : (
          <ToolbarLabelSelectTrigger
            label={baseLabel}
            open={open}
            onPress={handleOpen}
            accessibilityRole="button"
            accessibilityLabel={t("diffBaseSelector.compareAgainst", { ref: baseLabel })}
          />
        )}
      </View>
      {!isFixed ? (
        <Combobox
          options={baseOptions?.options ?? []}
          value={
            selectedBaseRef
              ? `${diffBaseRefOptionPrefix}${selectedBaseRef}`
              : workspaceDefaultDiffBaseOptionId
          }
          onSelect={handleSelect}
          searchable
          placeholder={baseLabel}
          searchPlaceholder={t("branchSwitcher.searchPlaceholder")}
          emptyText={emptyText}
          open={open}
          onOpenChange={setOpen}
          anchorRef={anchorRef}
          desktopPlacement="bottom-start"
          desktopPreventInitialFlash
          desktopMinWidth={280}
          renderOption={renderOption}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  anchor: {
    flexShrink: 1,
    minWidth: 0,
  },
  relation: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[1],
    minWidth: 0,
  },
  currentBranch: {
    color: theme.colors.foregroundMuted,
    flexShrink: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    minWidth: 0,
  },
  tooltipText: {
    color: theme.colors.popoverForeground,
    fontSize: theme.fontSize.sm,
  },
}));
