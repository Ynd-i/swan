import { describe, expect, it } from "vitest";
import { createCompactMarkdownStyles, createMarkdownStyles } from "./markdown-styles";
import { darkTheme } from "./theme";

describe("createMarkdownStyles", () => {
  it.each(["400", "500", "600"] as const)(
    "applies explicit code weight %s without changing prose or authored emphasis",
    (codeFontWeight) => {
      const baseline = createMarkdownStyles(darkTheme);
      const theme = { ...darkTheme, codeFontWeight };
      for (const styles of [createMarkdownStyles(theme), createCompactMarkdownStyles(theme)]) {
        expect(styles.code_inline.fontWeight).toBe(codeFontWeight);
        expect(styles.code_block.fontWeight).toBe(codeFontWeight);
        expect(styles.fence.fontWeight).toBe(codeFontWeight);
      }
      const styles = createMarkdownStyles(theme);
      expect(styles.body).toEqual(baseline.body);
      expect(styles.text).toEqual(baseline.text);
      expect(styles.heading1).toEqual(baseline.heading1);
      expect(styles.strong).toEqual(baseline.strong);
    },
  );

  it("keeps content weight independent from code and authored heading weights", () => {
    const styles = createMarkdownStyles({
      ...darkTheme,
      contentFontWeight: "600",
      codeFontWeight: null,
    });
    expect(styles.body.fontWeight).toBe("600");
    expect(styles.strong.fontWeight).toBe("700");
    expect(styles.heading1.fontWeight).toBe(darkTheme.fontWeight.bold);
    expect(styles.code_inline.fontWeight).toBe("400");
    expect(styles.fence.fontWeight).toBe("400");
    expect(styles.text).not.toHaveProperty("fontWeight");
  });

  it("leaves code weight inherited when the override is unset", () => {
    const theme = { ...darkTheme, codeFontWeight: null };
    for (const styles of [createMarkdownStyles(theme), createCompactMarkdownStyles(theme)]) {
      expect(styles.code_inline).not.toHaveProperty("fontWeight");
      expect(styles.code_block).not.toHaveProperty("fontWeight");
      expect(styles.fence).not.toHaveProperty("fontWeight");
    }
  });

  it("colors links and inline code from their theme tokens", () => {
    const desktopDark = {
      ...darkTheme,
      colors: { ...darkTheme.colors, link: "#7aa6e7", inlineCode: "#de8481" },
    };
    const styles = createMarkdownStyles(desktopDark);
    expect(styles.link.color).toBe("#7aa6e7");
    expect(styles.code_inline.color).toBe("#de8481");

    const baseline = createMarkdownStyles(darkTheme);
    expect(baseline.link.color).toBe(darkTheme.colors.accentBright);
    expect(baseline.code_inline.color).toBe(darkTheme.colors.foreground);
  });

  it("uses the content font for prose while code remains monospace", () => {
    const theme = {
      ...darkTheme,
      fontFamily: { ...darkTheme.fontFamily, content: "Charter" },
    };
    const styles = createMarkdownStyles(theme);

    expect(styles.body.fontFamily).toBe("Charter");
    expect(styles.text.fontFamily).toBe("Charter");
    expect(styles.bullet_list_icon.fontFamily).toBe("Charter");
    expect(styles.ordered_list_icon.fontFamily).toBe("Charter");
    expect(styles.code_inline.fontFamily).toBe(theme.fontFamily.mono);
    expect(styles.code_block.fontFamily).toBe(theme.fontFamily.mono);
    expect(styles.fence.fontFamily).toBe(theme.fontFamily.mono);
  });

  it("uses the content size for conversation prose and list markers", () => {
    const styles = createMarkdownStyles(darkTheme);
    const proseLineHeight = Math.round(darkTheme.fontSize.content * 1.4);

    expect(styles.body).toMatchObject({
      fontSize: darkTheme.fontSize.content,
      lineHeight: proseLineHeight,
    });
    expect(styles.bullet_list_icon).toMatchObject({
      fontSize: darkTheme.fontSize.content,
      lineHeight: proseLineHeight,
    });
    expect(styles.ordered_list_icon).toMatchObject({
      fontSize: darkTheme.fontSize.content,
      lineHeight: proseLineHeight,
    });
  });

  it("applies shrink-and-wrap constraints to long markdown text and links", () => {
    const styles = createMarkdownStyles(darkTheme);

    expect(styles.body).toMatchObject({
      flexShrink: 1,
      minWidth: 0,
      width: "100%",
    });

    expect(styles.paragraph).toMatchObject({
      flexShrink: 1,
      minWidth: 0,
      width: "100%",
      flexWrap: "wrap",
    });

    expect(styles.text).toMatchObject({
      flexShrink: 1,
      minWidth: 0,
      overflowWrap: "anywhere",
    });

    expect(styles.link).toMatchObject({
      flexShrink: 1,
      minWidth: 0,
      overflowWrap: "anywhere",
    });

    expect(styles.blocklink).toMatchObject({
      flexShrink: 1,
      minWidth: 0,
      overflowWrap: "anywhere",
    });
  });

  it("keeps assistant markdown text selectable on web", () => {
    const styles = createMarkdownStyles(darkTheme);

    expect(styles.body).toMatchObject({
      userSelect: "text",
    });
    expect(styles.text).toMatchObject({
      userSelect: "text",
    });
    expect(styles.heading1).toMatchObject({
      userSelect: "text",
    });
    expect(styles.link).toMatchObject({
      userSelect: "text",
    });
    expect(styles.code_inline).toMatchObject({
      userSelect: "text",
    });
    expect(styles.code_block).toMatchObject({
      userSelect: "text",
    });
    expect(styles.fence).toMatchObject({
      userSelect: "text",
    });
    expect(styles.bullet_list_icon).toMatchObject({
      userSelect: "text",
    });
    expect(styles.ordered_list_icon).toMatchObject({
      userSelect: "text",
    });
  });

  it("uses the mono font-size token directly for inline and block code", () => {
    const styles = createMarkdownStyles(darkTheme);
    const compactStyles = createCompactMarkdownStyles(darkTheme);

    expect(styles.code_inline).toMatchObject({
      fontFamily: darkTheme.fontFamily.mono,
      fontSize: darkTheme.fontSize.code,
    });
    expect(styles.code_inline).not.toHaveProperty("lineHeight");
    expect(styles.code_block).toMatchObject({
      fontFamily: darkTheme.fontFamily.mono,
      fontSize: darkTheme.fontSize.code,
    });
    expect(styles.fence).toMatchObject({
      fontFamily: darkTheme.fontFamily.mono,
      fontSize: darkTheme.fontSize.code,
    });
    expect(compactStyles.code_inline).toMatchObject({
      fontFamily: darkTheme.fontFamily.mono,
      fontSize: darkTheme.fontSize.code,
    });
    expect(compactStyles.code_inline).not.toHaveProperty("lineHeight");
  });

  it("scales Markdown headings from content size with safe line heights", () => {
    const largeContentTheme = {
      ...darkTheme,
      fontSize: { ...darkTheme.fontSize, content: 21 },
    };
    const styles = createMarkdownStyles(largeContentTheme);

    expect(styles.heading1.lineHeight).toBeGreaterThan(styles.heading1.fontSize);
    expect(styles.heading2.lineHeight).toBeGreaterThan(styles.heading2.fontSize);
    expect(styles.heading3.lineHeight).toBeGreaterThan(styles.heading3.fontSize);
  });

  it("keeps blockquotes quiet with a square left edge", () => {
    const styles = createMarkdownStyles(darkTheme);

    expect(styles.blockquote).toMatchObject({
      backgroundColor: darkTheme.colors.surface1,
      color: `${darkTheme.colors.foreground}cc`,
      borderLeftColor: darkTheme.colors.surface2,
      paddingTop: darkTheme.spacing[3],
      paddingBottom: 0,
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
    });
    expect(styles.paragraph.marginBottom).toBe(darkTheme.spacing[3]);
    expect(styles.text).not.toHaveProperty("color");
  });
});
