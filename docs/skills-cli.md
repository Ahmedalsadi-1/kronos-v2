# Install skills for KronOS

KronOS has a dedicated Skills CLI integration: agent ID `kronos`, display name **KronOS**. It does not use the Hermes or retired KronosCode identity in the agent picker.

## Upstream availability

The registration is submitted in [vercel-labs/skills#2717](https://github.com/vercel-labs/skills/pull/2717). Released versions of `npx skills` do not recognize `kronos` until that change is merged and published. The development CLI has been verified against the KronOS runtime catalog.

With a CLI version containing the registration:

```sh
npx skills add <owner/repository> --agent kronos
npx skills add <owner/repository> --agent kronos --global
npx skills list --agent kronos
```

The first command installs into the current project. `--global` installs for use across projects. Both symlink and `--copy` installation modes are supported.

## Detection and storage

KronOS initializes `~/.kronos/skills` when the desktop starts. The CLI detects the `.kronos` home directory or a project's `.kronos` directory, independently of other installed agents. `KRONOS_HOME` overrides the home location; use the same value for the desktop and CLI.

| Scope | Skills directory |
| --- | --- |
| Project | `.kronos/skills` |
| User | `$KRONOS_HOME/skills`, default `~/.kronos/skills` |
| Shared canonical content | Project `.agents/skills` and `~/.agents/skills` |

The shared catalog also retains previous Hermes, Codex, and legacy skill roots for compatibility with existing installations. This does not enable or require the retired KronosCode engine.

ACP specialists use their selected project directory. The desktop agent defaults to the app process's working directory; global installation is suitable when it has no project directory selected.

## Runtime discovery

The agent discovers installed guidance with `shared_skill_list` and loads it with `shared_skill_read`. The catalog refreshes on every lookup, including the first installation into a folder created after startup. Updates and removals appear on the next lookup; previously loaded conversation context is not rewritten.

The CLI's canonical `.agents/skills` content is read directly, so symlink installs require no duplicate copy or background synchronization. Symlinks escaping a configured root are not followed; canonical content is discovered through its own configured root. Project skills take precedence over bundled or user skills with the same source and folder ID. Additional trusted roots can be specified using `KRONTERM_SHARED_SKILL_DIRS`, separated by the platform's path delimiter.
