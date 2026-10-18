# The `.agents` workspace contract

You keep shared agent configuration in `.agents/` directories and log in to each provider. When the daemon launches an agent, it supplies the parts that a provider CLI does not read from `.agents/` itself. Code: `packages/server/src/server/agent/workspace-contract/`.

## What `.agents/` holds

| Path                             | Level   | Read natively by        | Bridged by the daemon                                                     |
| -------------------------------- | ------- | ----------------------- | ------------------------------------------------------------------------- |
| `~/.agents/.mcp.json`            | user    | nobody                  | MCP registry, every provider                                              |
| `<dir>/.agents/.mcp.json`        | project | nobody                  | MCP registry, trusted repos only                                          |
| `~/.agents/AGENTS.md`            | user    | nobody                  | Appended instructions (see below)                                         |
| `~/.agents/hooks/hooks.json`     | user    | nobody                  | Claude and Codex hooks (see [Hooks](#hooks))                              |
| `<dir>/.agents/hooks/hooks.json` | project | nobody                  | Claude and Codex hooks, trusted repos only                                |
| `~/.agents/skills/<name>/`       | user    | Codex, OpenCode, Gemini | Symlinked into `~/.claude/skills` for Claude                              |
| `<repo>/.agents/skills/<name>/`  | project | Codex, OpenCode, Gemini | Claude plugin, trusted repos only (see [Project skills](#project-skills)) |

`.mcp.json` uses the Claude Code and Codex plugin shape, `{ "mcpServers": { "<name>": { ... } } }`. An entry with `command` is stdio, and `"type": "http"` or `"type": "sse"` with `url` is remote. Entries with `"enabled": false` are skipped. Fields the launch config does not carry, such as Codex's `cwd` or `startup_timeout_sec`, are dropped. `${VAR}` references are passed through as literal text. A malformed file or entry logs a warning in `daemon.log` and is skipped. It never fails agent creation.

## Precedence

The daemon reads `~/.agents`, then every `.agents` directory from the git repo root down to the agent's cwd. A later layer overrides an earlier one by server name, so the nearest directory wins and the user level is lowest. Outside a git repo, only `~/.agents` and `<cwd>/.agents` apply. A worktree's `.git` file counts as a repo root.

Explicit `mcpServers` on the agent (from the UI, SDK, CLI, or a plugin `agent.create` hook) override registry entries with the same name. Registry servers reach the launch config only. They are not in the agent's stored config or in `paseo inspect`; the `Loaded .agents workspace contract` line in `daemon.log` lists them. Codex copies its launch servers into the record's provider persistence metadata, the same way it copies the runtime `paseo` server. Because the stored config does not hold them, a `toolPolicy` preapproval cannot name a registry-only server.

The name `paseo` is reserved for the daemon's own MCP server. A registry entry named `paseo` is ignored with a warning.

## Trusted repo roots

A project `.mcp.json` starts commands that the repo defines, so project layers apply only to repos you trust. List trusted directories in `$PASEO_HOME/config.json`:

```json
{
  "daemon": {
    "workspaceContract": {
      "trustedRoots": ["~/code", "/Volumes/work/client-repo"]
    }
  }
}
```

A repo is trusted when its root is one of these directories or below one. The repo root is the directory holding `.git`, or the cwd itself outside a repo. Entries are absolute or start with `~/`. A relative entry trusts nothing. Paths match as written or after resolving symlinks, so `/var/...` and `/private/var/...` on macOS match.

`~/.agents` always applies. When a repo is not trusted and has a project `.agents` directory, the daemon skips every project layer and logs one warning per launch in `daemon.log` that names the repo root and `daemon.workspaceContract.trustedRoots`. Agent creation still succeeds.

The daemon reads the list at every agent launch. After you edit it, run `paseo reload`, and the next launch uses the new list without a daemon restart. To untrust a repo, remove its entry and reload.

### Trust from a client

Two RPCs let a client show a repo's trust state and trust it. Gate both on `server_info.features.workspaceContractTrust`.

| RPC                          | Permission       | Result                                                                                                |
| ---------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| `workspace.contract.inspect` | `workspace.read` | The repo root for a cwd, whether it is trusted, and its existing project `.agents` directories        |
| `workspace.contract.trust`   | `daemon.manage`  | Appends the repo root to `trustedRoots` in `config.json`, reloads the daemon config, returns the list |

Trust writes the repo root as an absolute path and keeps existing entries as written. When a listed root already covers the repo, it writes nothing. It saves through the same editor as `paseo daemon config set`, which rewrites the whole file in schema key order. Inspect, trust, and agent launches share one function, `inspectWorkspaceContract`, for the repo root and the trust check, so the app and the next launch agree.

When inspect reports project `.agents` directories in an untrusted repo, the app shows a warning above the composer, on the new chat screen and in that workspace's chats. **Trust project** calls the trust RPC and hides the warning. **Not now** hides it for that repo until you restart the app. The app re-inspects open workspaces on every `daemon_config_changed`, so an edit followed by `paseo reload` updates the warning too. Code: `packages/app/src/workspace-contract/`.

## Instructions

When `~/.agents/AGENTS.md` is non-empty, the daemon appends it after the daemon's own `appendSystemPrompt`. Providers that receive it: Claude (system prompt append), Codex (developer instructions), OpenCode, Pi, OMP, and plugin providers. ACP providers (Copilot, Cursor, Kimi, Kiro, Trae, generic ACP agents) take no system prompt, so they do not receive it.

The daemon skips the append when the provider already loads the same text from its own global file, so it never loads twice:

| Provider | Global file                    |
| -------- | ------------------------------ |
| Claude   | `~/.claude/CLAUDE.md`          |
| Codex    | `~/.codex/AGENTS.md`           |
| OpenCode | `~/.config/opencode/AGENTS.md` |

The file carries the contract when it resolves to `~/.agents/AGENTS.md` (a symlink), has identical content, or, for Claude only, imports it with `@~/.agents/AGENTS.md` or the absolute path. Custom profiles use their base provider's row.

The daemon reads the file from the directory the provider process uses. `CLAUDE_CONFIG_DIR` replaces `~/.claude` and `CODEX_HOME` replaces `~/.codex` when the launch env sets them: the daemon's own env, then `agents.providers.<id>.env` (a profile's env merged over its base provider's), then per-agent env. A plugin `agent.session_open` hook that changes the env is not seen. OpenCode is always checked at `~/.config/opencode`, because Paseo never moves it.

## Claude skills mirror

Claude Code discovers personal skills only in `~/.claude/skills`. Before a Claude-based session opens, the daemon links `~/.claude/skills/<name>` to `~/.agents/skills/<name>` for every skill directory that has a `SKILL.md`. It skips dotfiles, `synced`, and names starting with `anthropic-skills`.

The mirror never replaces a real directory or file in `~/.claude/skills`. Paseo's bundled skill sync writes real directories there, and a skill you created by hand belongs to you. It only replaces or removes symlinks that point into `~/.agents/skills`, and removes them once their target is gone.

## Project skills

Codex reads `<repo>/.agents/skills` itself. For Claude, the daemon passes every trusted project `.agents` directory to the Claude Agent SDK as a local plugin. Claude then loads that directory's `skills/`, `hooks/hooks.json`, `agents/` and `commands/`. It does not read the plugin's `.mcp.json`, because the daemon already registers those servers.

- Claude names a project skill `.agents:<name>`, so the composer lists `/.agents:<name>`. Typing `/<name>` also works. A `name` in `.agents/.claude-plugin/plugin.json` replaces the `.agents` prefix.
- Every layer becomes a plugin named `.agents`. When a repo has `.agents` directories at the root and below it, Claude loads the skills of all of them but runs the hooks of the repo root's only, and logs `Skipping duplicate hook registration for plugin ".agents"`. Codex runs the hooks of every layer.
- A repo that also links a skill into `.claude/skills` lists it twice, as `/<name>` and `/.agents:<name>`.

## Hooks

Keep hooks in `~/.agents/hooks/hooks.json` and `<dir>/.agents/hooks/hooks.json`, in the Claude Code hooks format:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^(Bash|shell|functions.exec_command)$",
        "hooks": [{ "type": "command", "command": "$HOME/.agents/hooks/check.sh", "timeout": 30 }]
      }
    ]
  }
}
```

The file must use this wrapped form. The daemon keeps `command` handlers with their `command`, `timeout`, `async` and `statusMessage`. It drops other handler types, such as `prompt` and `agent`, and other fields, because those differ between vendors. A malformed file, group or handler logs a warning in `daemon.log` and is skipped. Hooks from all layers add up, user layer first. Project files apply only to trusted repos, and internal agents, such as the one that names a branch, get no hooks.

| Provider | User layer                                    | Project layers                                                    |
| -------- | --------------------------------------------- | ----------------------------------------------------------------- |
| Claude   | Merged into the `--settings` the daemon sends | Run by the layer's plugin (see [Project skills](#project-skills)) |
| Codex    | Thread config                                 | Thread config                                                     |

Codex runs a hook only when it is trusted. The daemon sends each bridged hook together with the trust hash Codex computes for it, so trusting a repo in Paseo also trusts its hooks in Codex, without Codex's own review. Codex does not document that hash. The formula in `providers/codex/session-hooks.ts` matches Codex 0.159.0, and if a release changes it, Codex skips the bridged hooks without a message. `workspace-contract/hooks.real.e2e.test.ts` fails in that case, so run it after a Codex upgrade.

When you write a hook for both vendors:

- Match tool names for both. Claude calls its shell tool `Bash`, and Codex calls it `shell` or `functions.exec_command`, so use a matcher such as `^(Bash|shell|functions.exec_command)$`. The daemon passes matchers through unchanged.
- An event that one vendor does not know runs only in the other. Codex ignores `Notification`, and Claude ignores `Interrupt`. Neither reports it.
- Handle both stdin shapes. The JSON a hook receives, and the output it may print, differ between vendors.
- Do not rely on `${CLAUDE_PLUGIN_ROOT}`. Claude sets it only for project hooks, and Codex never does. Commands run in the session's cwd, so use absolute paths, `$HOME/...` or `$(git rev-parse --show-toplevel)/.agents/...`.
- Keep `SessionEnd` and `Interrupt` hooks short. Codex gives them a 1 second default and a 3 second limit.
- A hook that you also keep in `~/.claude/settings.json` or `~/.codex/hooks.json` runs twice. The daemon does not compare them.

## What is not covered

The bridges run only when Paseo launches an agent. Running `claude`, `codex`, or `opencode` in a terminal outside Paseo gets none of them.
