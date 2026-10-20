# Explorer sidebar and side pane

The Explorer sidebar and the side pane share panel implementations, but they have different shell
contracts.

| Surface          | Purpose                      | Lifecycle                                  |
| ---------------- | ---------------------------- | ------------------------------------------ |
| Explorer sidebar | Files and Changes navigation | Cmd+E shows or hides the dedicated dock    |
| Side pane        | Ordinary workspace content   | Created and closed like any workspace pane |
| Sheets           | Compact look-ups             | One tab each, on the app-wide sheet stack  |

## Custom macOS layout

The custom macOS desktop keeps one current chat in the main area without a tab
strip. Supporting tools use Explorer on the right, including ordinary terminals,
browser, files, diffs and workspace plugin panels. New chat owns provider
selection; tool launchers omit Terminal profiles and Edit profiles. Agent in the Explorer
launcher opens a chat draft in the main area and leaves the launcher in place, because a chat
never stays in Explorer.
Cmd+W closes the selected Explorer tool tab and does nothing while Explorer is hidden.
It never closes the chat, because closing a chat tab archives the agent.
The new chat screen keeps the titlebar toggle and Cmd+E. It has no workspace yet, so its dock
shows the Explorer launcher without Agent. A tool creates the workspace the first message would
have created, without an agent, opens the workspace with the unsent draft and its provider setup
in the chat draft, and selects that tool in Explorer. The first message then starts the chat in that
workspace instead of creating a second one. While the toggle is on, a workspace created by sending
opens with Explorer visible. Explorer and the new chat dock slide open and closed over 220ms, the left sidebar's
timing (`packages/app/src/components/use-animated-dock.ts`), and skip it under reduced motion.

Saved layouts are adapted without closing sessions or replacing tab instances.
Chats and drafts remain available through workspace navigation; supporting tabs
retain their IDs, panel state and underlying resources. Every chat is its own
workspace here, so the dock keeps one width for all of them, like the left sidebar.
It starts at 576px until the user drags it, and still clamps to the available workspace width.

On wide macOS windows, tool tabs and their plus menu share the window titlebar.
The dock keeps its tabs inline in compact windows, while the main area remains a
chat. Hiding the dock or leaving the workspace also removes its titlebar controls.
File tools contain their own tree on the right; toggling it preserves the editor
instance and unsaved text. The Files view opens with the tree and an opened file without it.
Opening another file from a file's tree reuses that tab, so the tree stays as the user left it. One path/action row spans both columns. Its path menu
copies absolute or workspace-relative paths, and its editor action targets the
current file using the existing local/remote open-target rules.

The macOS tree's root menu retains creation, sorting, hidden-file and refresh
actions. The filter uses the existing directory-suggestions service, including
its 100-result limit and ignore rules; it can discover files in unopened folders.
Results include real ancestor entries without changing saved expansion state.
Clearing the filter restores the normal tree. File mutations also clear the
visible filter so input text and results stay consistent. Backend ownership is unchanged.

These placement rules override the desktop open-location preferences on macOS.
The inactive placement selectors are hidden there without deleting saved choices;
the service-URL behavior setting remains effective and visible.
The ordinary split-pane and preference contracts below continue on other platforms.

## Panel host contract

Every desktop panel registers its supported `PaneHost` values and presentation. Launchers derive
fixed-target labels and icons from that registration, filter by host, and never substitute one
panel type for another. Tab moves reject unsupported destinations, and placement resolves only to
a compatible pane.

Files and Changes are the Explorer defaults outside macOS; the macOS Explorer starts on the New
Tab launcher instead. Their panel manifests mark them as singletons,
so a pane’s + menu omits each while that pane already contains it. Closing one makes its menu
item available again. Closing Explorer's last tab leaves Explorer open on the New Tab launcher;
closing that launcher hides Explorer. Other compatible tabs, including agents, terminals, files, and diffs,
can move between Explorer and main panes.
Keep panel implementations independent of either shell. `WorkspacePanelHost` owns mounting and
retention, while each shell owns its tabs, focus, dragging, resizing, and shortcuts.

## Sheets

On compact layouts, files and subagents open in a sheet over the workspace, so the tab switcher
keeps only agents and terminals. A panel kind opts in with `compactSheet` in its manifest
(`packages/app/src/panels/panel-manifest.ts`), and the layout store's `openTab` decides between
sheet and tab, so callers open targets the same way on every layout. Each such sheet holds one
ordinary `WorkspaceTab` (`SheetTab` in the store) and is an `IsolatedBottomSheetModal` like every
other sheet in the app, so it sits on the one app-wide stack: a sheet opened from any sheet, a
subagent chosen from the subagents list included, lands on top of it, and closing the top sheet
(drag, Close, backdrop, or Android Back) uncovers the one below. The list stays open under the
sheet it opened; see [menus.md](menus.md#selecting-an-item-on-ios) for the row contract.

The store keeps `sheetsByWorkspace` in opening order and never reorders it, because moving a sheet
remounts its panel. Revealing a target that already has a sheet uncovers that sheet by closing the
ones above it, except ones holding unsaved work, which stay where they are. Opening a sheet as a tab
dismisses the sheets above it, since the tab would sit under them. The stack is not persisted.

Sheets are modal and cover the whole compact column, header included. A sheet's header is its drag
handle, because the panel scrolls on its own and content panning would fight it. Its trailing rail
holds icon buttons only (`SheetHeaderIconButton`): Open as tab is the full-screen glyph beside
Close, so the title keeps its width. The sheets present
from inside the compact column's `SheetHostScope`, so their panels read the navigator and every
workspace provider an ordinary pane has without a context bridge
([floating-panels.md Gotcha 6](floating-panels.md#gotcha-6--bottom-sheet-refs-are-not-lifecycle-truth)).

A sheet holding unsaved work is never implicitly displaced; only its guarded close removes it.
Moving its tab to another host remounts the panel, and the file editor keeps unsaved text in the
mounted view, so the move would drop it. Widening the layout is the known exception: it still moves
the sheet's tab into a pane, and edits the autosave has not started writing are lost.

## Explorer sidebar

`packages/app/src/workspace-tabs/explorer-sidebar.ts` owns show, hide, toggle, and view selection.
On desktop, the shell is rendered outside the workspace split canvas so it divides the full
workspace, including the header. It has its own persisted width and resize handle. Main-pane splits
never read or modify that width.

`packages/app/src/workspace-tabs/open-supporting-view.ts` owns semantic Changes and pull-request
opens. Compact and wide native layouts select the matching Explorer tab. Outside the custom macOS
layout, desktop Changes opens follow the shared diff preference and pull requests use Main panel, On the side, or
Explorer sidebar setting. Automatic PR discovery follows that preference once per workspace without
interrupting the user's work. Closing the tab opts that workspace out of future automatic opens,
even for a different PR; moving or reordering it remains the user's choice.
Callers request the content and never choose the shell.
The composer Changes pill is a two-stage desktop action: it first reveals Explorer on Changes, then
routes later presses to the working diff through the shared diff preference.

The persisted layout still contains the Explorer pane so tabs survive reloads. The renderer removes
that pane from the workspace split tree and docks it separately. Persisted identifiers retain the
literal `"explorer"` pane id and `explorerPaneIdByWorkspace` key for compatibility.

On macOS, the tab rail shows an inline close control on the selected tab and on
hover or keyboard focus. Other platforms retain the context-menu close action.
Other platforms have no inline add control. The rail's context menu opens a New Tab launcher and
toggles Files, Changes, and Explorer-compatible workspace-scoped plugin panels from the shared
launch catalog. Individual tab menus close instances or, outside macOS, move compatible tabs to main. Explorer tabs
can be reordered, but the dock cannot be split. Selecting an Explorer tab does not change workspace
focus.

Cmd+E shows or hides Explorer without changing its selected view. Outside macOS, compact layouts use the combined
full-screen Explorer overlay for Changes, Files, and pull requests, and close it after a file opens. Compact Changes has no tree rail; its overview is the Jump to file action (`packages/app/src/git/jump-to-file/`), a sheet over the same changed-files tree the desktop rail renders.
Wide native layouts without pane splits use the same combined content in a resizable inline dock;
opening a file leaves that dock visible. Both presentations keep their selection in the panel store
and reuse the layout store's per-workspace Explorer width. They do not create a second Explorer
lifecycle.

## Side pane

`packages/app/src/workspace-tabs/open-beside.ts` owns content opened beside the user's work. The
layout store remembers one ordinary pane per workspace. The first side open creates a full-height
right split around the workspace root; later side opens reuse it. Only the `split-panes` layout
mode opens beside. Compact and single-pane layouts (touch tablets) open the same target in the main
pane, so callers never check whether splits render.

Removing a pane clears its remembered id; a later side open creates a new pane. The last visible
ordinary pane stays when its final tab closes and shows the New launcher. An empty workspace does
not automatically create an agent draft tab; choosing Agent opens one. Explorer cannot replace the
workspace canvas, even when visible. Restoring a saved layout enforces the same rule while preserving Explorer and saved
tab content. There is no hidden side-pane lifecycle.

Placement intent still controls existing tabs:

| Mode      | New target                  | Existing target                   |
| --------- | --------------------------- | --------------------------------- |
| `pane`    | opens in the requested pane | moves to the requested pane       |
| `prefer`  | opens in the requested pane | stays where the user placed it    |
| `focused` | opens in the focused pane   | focuses it where it already lives |
| `ambient` | opens in a compatible pane  | focuses it where it already lives |

Explicit **Open to Side** uses `pane`. Implicit opens use `prefer`, so a preference affects only a
new target and never yanks an existing tab out of a user-selected pane.

## Routing preferences

Desktop **Settings → Layout → Open location** has independent Main panel or On the side choices for
Explorer Files, diffs, chat files, files opened from diffs, and subagents. They default to Main
panel. Mobile ignores them.

Pull requests have a three-way open location: Main panel, On the side, or Explorer sidebar. Explorer
sidebar is the default. Compact layouts always open pull requests in Explorer regardless of this
desktop preference.

Panels request an implicit open through the narrow `openPreferredTarget(target, source)` pane
contract. Entry points outside panels use `openPreferredWorkspaceTarget`. Do not branch on a
specific shell inside a panel.
