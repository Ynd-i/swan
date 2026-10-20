# Desktop shell QA — phase 1

Date: 2026-09-30. Scope: the macOS window frame, titlebar, navigation rail,
sidebar surface, and default dark palette. This is acceptance of the first UI
slice, not of the complete Codex clone. The source has existing chats and a
new-chat composer; the isolated Paseo instance has no projects. Chat navigation,
empty-state content, composer, and supporting-panel redesign belong to the later
slices in [the implementation plan](../../refactors/codex-desktop-ui-plan.md).

## Evidence

- Source visual truth: `.dev/codex-reference/new-chat.png`, supplied Codex
  26.924.22138 screenshot, 2700 × 1564 pixels at 2× density (1350 × 782 CSS px).
- Original Paseo: [baseline.jpg](baseline.jpg), real macOS ARM64 Electron,
  built from upstream `53ee9cd`, 2400 × 1566 pixels.
- Implementation: [phase1-final.jpg](phase1-final.jpg), real Electron renderer
  at `http://localhost:8083/open-project`, 2700 × 1566 pixels at 2× density
  (1350 × 783 CSS px), expanded 278px sidebar, system dark theme.
- Full-view comparison: `.dev/codex-reference/phase1-comparison.png`. Both
  images are shown together at 1×; only the final 1 CSS px at the bottom of the
  implementation is cropped. There is no horizontal scaling difference.
- Focused comparison: [phase1-chrome-comparison.png](phase1-chrome-comparison.png),
  unscaled 2× top-left crops. The more extensive shell comparison remains in
  `.dev/codex-reference/phase1-shell-comparison.png`.
- Private reference images and the full comparison remain in ignored `.dev`
  storage because they include personal chat titles. The committed focused crop
  ends before the chat list. macOS sometimes overlays a screen-capture badge
  over the native traffic lights; it is absent from the app's renderer.

## Comparison history

1. Initial implementation: [phase1-initial.jpg](phase1-initial.jpg). The shell
   rendered with the intended region hierarchy. Native interaction testing found
   that Back stayed disabled after navigation. Subscribing to root navigation
   state fixed the stale state; History → Back was retested successfully.
2. [The 278px footer](phase1-footer-before.jpg) truncated Add project because
   the existing footer still contained the Help and Settings actions also present
   in the new rail. Those two duplicates are now omitted only when the desktop
   rail is present. [The final capture](phase1-final.jpg) shows the full label
   and the remaining host, import, and usage controls.
3. [Narrow settings before the fix](phase1-narrow-before.jpg), 752 CSS px wide:
   the rail took width from the upstream settings split. The rail now yields
   below the settings minimum plus the shell inset. The same-width
   [post-fix capture](phase1-narrow-settings.jpg) confirms that the settings
   controls remain visible and usable. Widening restores the rail.
4. Final full-view and focused comparisons were opened together with their
   respective source crops. No actionable P0/P1/P2 differences remain within
   the phase-1 scope. The planned differences below are still visible.

## Fidelity surfaces

| Surface            | Result                                                                                                                                                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Typography         | Uses the existing system UI font and user font preferences. Brand heading and small controls follow the reference hierarchy. Chat typography is deferred.                                                                                                                                                                            |
| Spacing and layout | 44px titlebar, 50px rail, 36px rail controls, 278px default sidebar, 12px content radius. Saved sidebar widths remain resizable. The shell reserves 56px including border and right gutter in width calculations.                                                                                                                    |
| Colors             | Neutral dark surfaces replace the upstream green tint for macOS's default dark theme. Sampled source/implementation RGB: titlebar `(57,56,55)/(57,57,55)`, sidebar `(49,48,46)/(50,50,48)`, content `(45,45,43)/(44,44,44)`. These small differences include JPEG/capture color conversion; no material contrast mismatch was found. |
| Assets             | Reuses Paseo's brand and the existing Lucide icon library. No fabricated Codex logo or screenshot-shaped UI. The native window controls remain native.                                                                                                                                                                               |
| Copy and content   | Paseo branding and real upstream actions remain. History, schedules, and host management retain their actual semantics. The project/chat structure and main empty state intentionally remain upstream in this slice.                                                                                                                 |

## Interaction verification

- History navigation and titlebar Back; Back disables again at the root.
- Sidebar collapse and reopen. The content expands and the toggle remains reachable.
- Settings and Appearance navigation; Light → System dark theme restoration.
  [Light evidence](phase1-light.jpg), [dark evidence](phase1-dark-settings.jpg).
- Help menu opens beside the rail, escapes the content frame, and remains readable.
- Native titlebar drag, edge resize, fullscreen entry and exit. The fullscreen
  [capture](phase1-fullscreen.jpg) shows the titlebar controls clear of native chrome.
- Native minimize, then application activation through Launch Services restores
  the same window; Settings navigation works afterward. The capture API can still
  return the minimized window's image, so that cached image alone was not counted
  as proof of restoration.
- Development logs contain the expected un-packaged Electron CSP warning and no
  new renderer exception during these interactions. This is not packaged-app QA.

## Remaining work

- Phase 2: chat rows, attention and archive granularity, navigation controls and
  sidebar header actions. The source's forward button and other Codex-only rail
  destinations are not implemented in phase 1.
- Phase 3: new-chat empty state, transcript and composer.
- Phase 4: panel and settings visual matching after the missing source captures.
- Real provider turns, approval requests, remote pairing, Windows/mobile, and
  packaged updates have not been accepted by this QA run.

final result: passed
