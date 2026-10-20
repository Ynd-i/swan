import { useCallback, useMemo, useState } from "react";
import { StyleSheet } from "react-native-unistyles";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SearchField } from "@/components/ui/search-field";
// The sheet-aware list: inside a bottom sheet the tree scrolls with the sheet
// gesture, and outside one it is the ordinary React Native FlatList.
import { FlatList } from "@/components/ui/scroll-view";
import type { WorkingDiffMode } from "@/git/diff-document";
import { DiffFolderRow } from "@/git/diff-folder-row";
import {
  buildDiffTree,
  collectDirPaths,
  compressSingleChildChains,
  flattenDiffTree,
  searchDiffTree,
  type DiffTreeRow,
} from "@/git/diff-tree";
import { FileHeader } from "@/git/file-header";
import type { ParsedDiffFile } from "@/git/use-diff-query";

export interface ChangedFilesTreeProps {
  files: ParsedDiffFile[];
  mode: WorkingDiffMode;
  onSelectFile: (path: string) => void;
  collapsedFolderPaths: string[];
  onCollapsedFolderPathsChange: (paths: string[]) => void;
  searchable?: boolean;
}

/** The changed-files tree shared by the desktop Changes rail and the compact Jump to file sheet. */
export function ChangedFilesTree({
  files,
  mode,
  onSelectFile,
  collapsedFolderPaths,
  onCollapsedFolderPathsChange,
  searchable = false,
}: ChangedFilesTreeProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const query = searchable ? filter.trim() : "";
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const compressedTree = useMemo(() => compressSingleChildChains(buildDiffTree(files)), [files]);
  const allFolderPaths = useMemo(() => collectDirPaths(compressedTree), [compressedTree]);
  const collapsedFolders = useMemo(() => new Set(collapsedFolderPaths), [collapsedFolderPaths]);
  const items = useMemo(
    () =>
      query
        ? searchDiffTree(compressedTree, query)
        : flattenDiffTree(compressedTree, collapsedFolders),
    [collapsedFolders, compressedTree, query],
  );
  const handleSelectPath = useCallback((path: string) => setSelectedPath(path), []);
  const handleSelectFile = useCallback(
    (path: string) => {
      setSelectedPath(path);
      onSelectFile(path);
    },
    [onSelectFile],
  );
  const handleToggleFolder = useCallback(
    (dirPath: string) => {
      const next = collapsedFolders.has(dirPath)
        ? Array.from(collapsedFolders).filter((path) => path !== dirPath)
        : [...collapsedFolders, dirPath];
      onCollapsedFolderPathsChange(next);
    },
    [collapsedFolders, onCollapsedFolderPathsChange],
  );
  const handleCollapseFolder = useCallback(
    (dirPath: string) => {
      const prefix = `${dirPath}/`;
      onCollapsedFolderPathsChange([
        ...new Set([
          ...collapsedFolders,
          ...allFolderPaths.filter(
            (folderPath) => folderPath === dirPath || folderPath.startsWith(prefix),
          ),
        ]),
      ]);
    },
    [allFolderPaths, collapsedFolders, onCollapsedFolderPathsChange],
  );
  const renderItem = useCallback(
    ({ item }: { item: DiffTreeRow }) => {
      if (item.kind === "folder") {
        return (
          <DiffFolderRow
            dirPath={item.dirPath}
            displayName={item.displayName}
            depth={item.depth}
            collapsed={collapsedFolders.has(item.dirPath)}
            isSelected={selectedPath === item.dirPath}
            additions={item.additions}
            deletions={item.deletions}
            onToggle={handleToggleFolder}
            onCollapse={handleCollapseFolder}
            onSelect={handleSelectPath}
            onCopyPath={mode.onCopyPath}
            onCopyRelativePath={mode.onCopyRelativePath}
            onReveal={mode.onReveal}
            revealTargetName={mode.revealTargetName}
            onDuplicate={mode.onDuplicate}
            onRevert={mode.onRevert}
            testID={`diff-folder-${item.dirPath}`}
          />
        );
      }
      return (
        <FileHeader
          file={item.file}
          workspaceFileDragScope={mode.workspaceFileDragScope}
          bodyVisible={false}
          showsBodyState={false}
          isSelected={selectedPath === item.file.path}
          depth={item.depth}
          showDir={Boolean(query)}
          onActivate={handleSelectFile}
          onSelect={handleSelectPath}
          onOpenFile={mode.onOpenFile}
          onOpenToSide={mode.onOpenToSide}
          onAddToChat={mode.onAddToChat}
          onCopyPath={mode.onCopyPath}
          onCopyRelativePath={mode.onCopyRelativePath}
          onReveal={mode.onReveal}
          revealTargetName={mode.revealTargetName}
          onDownload={mode.onDownload}
          onDuplicate={mode.onDuplicate}
          onRevert={mode.onRevert}
          testID={`diff-tree-file-${item.fileIndex}`}
        />
      );
    },
    [
      handleCollapseFolder,
      handleSelectFile,
      handleSelectPath,
      handleToggleFolder,
      collapsedFolders,
      mode,
      selectedPath,
      query,
    ],
  );
  const keyExtractor = useCallback(
    (item: DiffTreeRow) =>
      item.kind === "folder" ? `folder-${item.dirPath}` : `file-${item.file.path}`,
    [],
  );

  const list = (
    <FlatList
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      style={styles.scrollView}
      contentContainerStyle={styles.contentContainer}
      testID="changes-file-tree"
    />
  );
  if (!searchable) return list;
  return (
    <View style={styles.scrollView}>
      <View style={styles.filter}>
        <SearchField
          value={filter}
          onChangeText={setFilter}
          placeholder={t("workspace.fileExplorer.filter.placeholder")}
          clearAccessibilityLabel={t("sessions.actions.clearSearch")}
          testID="changes-filter"
          clearTestID="changes-filter-clear"
          fullWidth
        />
      </View>
      {query && items.length === 0 ? (
        <Text style={styles.emptyText} testID="changes-filter-empty">
          {t("workspace.fileExplorer.filter.noResults")}
        </Text>
      ) : null}
      {list}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  filter: { margin: 8, height: 30, flexDirection: "row" },
  emptyText: { padding: 12, color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: theme.spacing[8],
  },
}));
