/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { ToastApi } from "@/components/toast-host";
import { useBranchSwitcher } from "./use-branch-switcher";

interface SwitchResult {
  error: { message: string } | null;
}

function createDeferredSwitch() {
  let resolve: (result: SwitchResult) => void = () => {};
  const promise = new Promise<SwitchResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderSwitcher(switchResult: Promise<SwitchResult>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const client = {
    checkoutSwitchBranch: vi.fn(() => switchResult),
    stashList: vi.fn(async () => ({ entries: [] })),
  } as unknown as DaemonClient;
  const toast = { show: vi.fn(), error: vi.fn() } as unknown as ToastApi;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () =>
      useBranchSwitcher({
        client,
        normalizedServerId: "server",
        normalizedWorkspaceId: "/repo",
        workspaceDirectory: "/repo",
        currentBranchName: "main",
        isGitCheckout: true,
        isConnected: true,
        toast,
        queryClient,
      }),
    { wrapper },
  );
  return { ...view, toast };
}

describe("useBranchSwitcher", () => {
  it("shows the target branch while the daemon switch is in flight", async () => {
    const deferred = createDeferredSwitch();
    const { result } = renderSwitcher(deferred.promise);

    act(() => result.current.handleBranchSelect("feature"));
    expect(result.current.pendingBranch).toBe("feature");

    await act(async () => deferred.resolve({ error: null }));
    await waitFor(() => expect(result.current.pendingBranch).toBeNull());
  });

  it("drops the target branch when the switch fails", async () => {
    const deferred = createDeferredSwitch();
    const { result, toast } = renderSwitcher(deferred.promise);

    act(() => result.current.handleBranchSelect("feature"));
    await act(async () => deferred.resolve({ error: { message: "Branch not found: feature" } }));

    await waitFor(() => expect(result.current.pendingBranch).toBeNull());
    expect(toast.error).toHaveBeenCalledWith("Branch not found: feature");
  });
});
