import { describe, expect, it } from "vitest";
import { resolveRunnableShellCommand } from "./shell-command-block";

describe("resolveRunnableShellCommand", () => {
  it("runs labelled shell fences unchanged", () => {
    expect(resolveRunnableShellCommand("bash", "npm test\nnpm run lint")).toBe(
      "npm test\nnpm run lint",
    );
  });

  it.each([null, "text", "plaintext"])("detects commands in a %s fence", (language) => {
    const code =
      "cd packages/desktop && command npm run test:e2e:renderer -- theme-colors content-font";
    expect(resolveRunnableShellCommand(language, code)).toBe(code);
  });

  it("detects multi-line scripts with comments, env assignments and continuations", () => {
    const code = [
      "# install",
      "CI=1 pnpm install \\",
      "  --frozen-lockfile",
      "./scripts/build.sh",
    ].join("\n");
    expect(resolveRunnableShellCommand(null, code)).toBe(code);
  });

  it("does not offer Run for unlabelled prose or code", () => {
    expect(resolveRunnableShellCommand(null, "Use the new tokens for links.")).toBeNull();
    expect(resolveRunnableShellCommand(null, "npm test\nthen open the report")).toBeNull();
    expect(resolveRunnableShellCommand(null, "")).toBeNull();
  });

  it("never runs fences labelled as another language", () => {
    expect(resolveRunnableShellCommand("ts", "cd(dir);")).toBeNull();
    expect(resolveRunnableShellCommand("json", "echo")).toBeNull();
  });

  it("runs only the prompted lines of a console transcript", () => {
    const code = ["$ git status", "On branch main", "$ npm run build \\", "  --verbose"].join("\n");
    expect(resolveRunnableShellCommand("console", code)).toBe(
      "git status\nnpm run build \\\n  --verbose",
    );
    expect(resolveRunnableShellCommand(null, "$ pnpm dev")).toBe("pnpm dev");
  });
});
