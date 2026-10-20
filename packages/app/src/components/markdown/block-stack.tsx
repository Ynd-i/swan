import { useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { markdownCopyImageSourcesDataSet } from "@/assistant-selection-copy/markup";
import { isWeb } from "@/constants/platform";
import { CONTENT_SURFACE_DATASET } from "@/styles/content-surface";
import { density } from "@/styles/density";

/** Stacks Markdown blocks rendered as separate views with the same gap the text puts between its blocks. */
export function MarkdownBlockStack({
  imageSources,
  children,
}: {
  imageSources?: Record<string, string>;
  children: ReactNode;
}) {
  // Content-marked so the web root font rule gives Markdown the content font.
  const dataSet = useMemo(
    () =>
      isWeb
        ? {
            ...CONTENT_SURFACE_DATASET,
            ...(imageSources ? markdownCopyImageSourcesDataSet(imageSources) : null),
          }
        : undefined,
    [imageSources],
  );
  return (
    <View style={styles.stack} dataSet={dataSet}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: density.blockGap },
});
