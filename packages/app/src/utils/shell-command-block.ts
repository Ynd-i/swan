const SHELL_FENCE_LANGUAGES = new Set([
  "sh",
  "bash",
  "zsh",
  "fish",
  "shell",
  "shellscript",
  "console",
  "terminal",
  "shell-session",
  "sh-session",
]);

// Agents often leave a command fence unlabelled or mark it as text.
const UNLABELLED_FENCE_LANGUAGES = new Set(["text", "txt", "plain", "plaintext"]);

const KNOWN_COMMANDS = new Set([
  "alias",
  "awk",
  "brew",
  "bun",
  "bunx",
  "bundle",
  "cargo",
  "cat",
  "cd",
  "chmod",
  "chown",
  "claude",
  "clear",
  "cmake",
  "codex",
  "command",
  "composer",
  "conda",
  "cp",
  "curl",
  "dart",
  "defaults",
  "deno",
  "docker",
  "docker-compose",
  "echo",
  "env",
  "export",
  "find",
  "flutter",
  "gem",
  "gh",
  "git",
  "go",
  "gradle",
  "grep",
  "head",
  "java",
  "jq",
  "kill",
  "killall",
  "kubectl",
  "launchctl",
  "ln",
  "ls",
  "make",
  "mise",
  "mkdir",
  "mv",
  "mvn",
  "node",
  "npm",
  "npx",
  "open",
  "osascript",
  "paseo",
  "php",
  "pip",
  "pip3",
  "pkill",
  "pnpm",
  "pnpx",
  "pod",
  "ps",
  "psql",
  "pwd",
  "python",
  "python3",
  "rg",
  "rm",
  "rmdir",
  "rsync",
  "ruby",
  "rustc",
  "rustup",
  "scp",
  "sed",
  "source",
  "sqlite3",
  "ssh",
  "sudo",
  "swift",
  "tail",
  "tar",
  "tee",
  "terraform",
  "tmux",
  "touch",
  "unset",
  "unzip",
  "uv",
  "vercel",
  "watch",
  "wc",
  "wget",
  "which",
  "wrangler",
  "xcodebuild",
  "xcrun",
  "xargs",
  "yarn",
  "zip",
]);

const PROMPT = /^\$\s+/;
const ENV_ASSIGNMENTS = /^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*/;
const PATH_EXECUTABLE = /^(?:\.{1,2}|~)?\//;
const CONTINUES_ON_NEXT_LINE = /(?:\\|&&|\|\||\|)$/;

function startsWithCommand(line: string): boolean {
  const word = line.replace(PROMPT, "").replace(ENV_ASSIGNMENTS, "").split(/\s+/)[0] ?? "";
  return KNOWN_COMMANDS.has(word) || PATH_EXECUTABLE.test(word);
}

function looksLikeShellCommands(code: string): boolean {
  let commands = 0;
  let continued = false;
  for (const rawLine of code.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (!continued) {
      if (!startsWithCommand(line)) return false;
      commands += 1;
    }
    continued = CONTINUES_ON_NEXT_LINE.test(line);
  }
  return commands > 0;
}

/** A `$ ` transcript runs only its prompted lines and their continuations, not the output. */
function stripPrompts(code: string): string {
  const lines = code.split("\n");
  if (!lines.some((line) => PROMPT.test(line.trim()))) return code;
  const commands: string[] = [];
  let continued = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (PROMPT.test(line)) {
      commands.push(line.replace(PROMPT, ""));
    } else if (continued) {
      commands.push(rawLine);
    } else {
      continue;
    }
    continued = CONTINUES_ON_NEXT_LINE.test(line);
  }
  return commands.join("\n");
}

/**
 * The command a code block's Run button sends to the terminal, or null when the block
 * is not shell. `language` is the normalized fence language.
 */
export function resolveRunnableShellCommand(language: string | null, code: string): string | null {
  if (language && SHELL_FENCE_LANGUAGES.has(language)) return stripPrompts(code);
  if (language && !UNLABELLED_FENCE_LANGUAGES.has(language)) return null;
  return looksLikeShellCommands(code) ? stripPrompts(code) : null;
}
