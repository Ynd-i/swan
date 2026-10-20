// Claude desktop's `think.loop` working mark: 110 frames stacked top to bottom at 30fps.
export const SYNCED_LOADER_FRAME_COUNT = 110;
const SYNCED_LOADER_FRAME_MS = 1000 / 30;
const SYNCED_LOADER_DURATION_MS = SYNCED_LOADER_FRAME_COUNT * SYNCED_LOADER_FRAME_MS;

export function getSyncedLoaderStep(nowMs: number): number {
  "worklet";
  const elapsedMs = nowMs % SYNCED_LOADER_DURATION_MS;
  return Math.floor(elapsedMs / SYNCED_LOADER_FRAME_MS);
}
