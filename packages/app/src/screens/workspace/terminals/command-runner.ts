import type { TerminalStreamEvent } from "@getpaseo/client/internal/daemon-client";
import { encodeTerminalPaste } from "@/terminal/runtime/terminal-paste";

// One shell per workspace runs every command the user sends from a chat code
// block, so `cd`, exports and virtualenvs carry over to the next command.
// Agents find this shell by name: list_terminals, then capture_terminal (Paseo MCP).
export const RUNNER_TERMINAL_NAME = "Run";

// The daemon's zsh integration prints OSC 633;A from precmd, once the rc files have
// run and the line editor is about to read input. Shells without that integration
// count as ready once their startup output goes quiet.
const SHELL_PROMPT_MARKER = "\x1b]633;A";
const SHELL_QUIET_MS = 1000;
const SHELL_READY_TIMEOUT_MS = 5000;

const runnerTerminalIds = new Map<string, string>();

/** Calls onReady once a newly created shell can take input without losing it to startup. */
export function whenShellReady(
  client: {
    observeTerminal(
      terminalId: string,
      receive: (event: TerminalStreamEvent) => void,
    ): { release(): Promise<unknown> };
  },
  terminalId: string,
  onReady: () => void,
): void {
  let ready = false;
  let quietTimer: ReturnType<typeof setTimeout> | undefined;
  const decoder = new TextDecoder();
  const finish = () => {
    if (ready) return;
    ready = true;
    clearTimeout(quietTimer);
    clearTimeout(timeoutTimer);
    void subscription.release().catch(() => {});
    onReady();
  };
  let subscription: { release(): Promise<unknown> };
  try {
    subscription = client.observeTerminal(terminalId, (event) => {
      if (
        event.type === "output" &&
        decoder.decode(event.data, { stream: true }).includes(SHELL_PROMPT_MARKER)
      ) {
        finish();
        return;
      }
      clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, SHELL_QUIET_MS);
    });
  } catch {
    onReady();
    return;
  }
  const timeoutTimer = setTimeout(finish, SHELL_READY_TIMEOUT_MS);
}

export function resolveRunnerTerminalId(key: string, liveTerminalIds: string[]): string | null {
  const terminalId = runnerTerminalIds.get(key);
  if (terminalId && liveTerminalIds.includes(terminalId)) {
    return terminalId;
  }
  runnerTerminalIds.delete(key);
  return null;
}

export function setRunnerTerminalId(key: string, terminalId: string): void {
  runnerTerminalIds.set(key, terminalId);
}

export function toTerminalCommandInput(command: string): string {
  const text = command.replace(/\n+$/, "");
  if (!text.includes("\n")) {
    return `${text}\r`;
  }
  // Typed raw, a multi-line block runs its first line and leaves the rest in the tty
  // queue, where an interactive first command (gh, git, npm) reads them as its own
  // stdin and they never run. Bracketed paste loads the whole block into the shell's
  // edit buffer before anything executes.
  // ponytail: assumes the shell enabled DECSET 2004; one that never does (bash 3.2)
  // echoes the markers. Gate on the emulator's tracked mode if that ever shows up.
  return `${encodeTerminalPaste({ text, bracketedPaste: true })}\r`;
}
