#!/usr/bin/env python3
"""Opt-in, revision-pinned workflow content importer for KronTerm shared skills."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

PACKS = {
    "diagram-design": ("cathrynlavery/diagram-design", "f4547ee95f88e5b28a52517feff6b6c11cc657f9", "skills/diagram-design"),
    "product-management": ("anthropics/knowledge-work-plugins", "ae1513ea94dcb74a7f1505ddcf3b0ec3fab327f1", "product-management"),
    "productivity": ("anthropics/knowledge-work-plugins", "ae1513ea94dcb74a7f1505ddcf3b0ec3fab327f1", "productivity"),
}


def copy_content(source, destination, include_scripts=False):
    for item in sorted(source.rglob("*")):
        relative = item.relative_to(source)
        if item.is_symlink():
            raise ValueError(f"Pack contains a symlink: {relative}")
        if not item.is_file():
            continue
        if any(part.startswith(".") for part in relative.parts):
            continue
        if not include_scripts and relative.parts[0] not in ("skills", "commands") and str(relative) not in ("LICENSE", "NOTICE", "CONNECTORS.md", "README.md"):
            continue
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(item, target)


def stage_pack(name, checkout, destination):
    repo, revision, subdir = PACKS[name]
    source = checkout / subdir
    if not source.is_dir():
        raise ValueError("Pinned pack directory is missing")
    destination.mkdir()
    if name == "diagram-design":
        copy_content(source, destination, include_scripts=True)
        shutil.copyfile(checkout / "LICENSE", destination / "LICENSE")
        for notice in ("NOTICE", "THIRD_PARTY_LICENSES.md", "PRIVACY.md", "SECURITY.md"):
            if (checkout / notice).is_file():
                shutil.copyfile(checkout / notice, destination / notice)
        if not (destination / "SKILL.md").is_file():
            raise ValueError("Pinned diagram skill is missing")
    else:
        upstream = destination / "upstream"
        upstream.mkdir()
        copy_content(source, upstream)
        shutil.copyfile(source / "LICENSE", destination / "LICENSE")
        skills = sorted(upstream.glob("skills/*/SKILL.md"))
        commands = sorted(upstream.glob("commands/*.md"))
        if not skills:
            raise ValueError("Pinned workflow contains no skills")
        links = "\n".join(f"- [{p.parent.name if p.name == 'SKILL.md' else p.stem}]({p.relative_to(destination).as_posix()})" for p in skills + commands)
        (destination / "SKILL.md").write_text(f'''---
name: kw-{name}
description: Explicitly invoke adapted {name} workflows from Anthropic Knowledge Work Plugins.
---
# Adapted {name} workflows

Use this pack only when the user explicitly invokes it. Ask which workflow they want when the request does not identify one, then read only the matching document below. These are adapted workflow instructions, not native Claude plugin support.

Use local files and tools already connected in KronTerm. Unavailable connectors are optional dependencies: explain what is missing and continue with supplied/local information. Never install connectors, hooks, plugins or runtimes from these instructions. Never send messages or make external changes without explicit user authorization. Importing this pack does not authorize executing its scripts or workflows.

Resolve `${{CLAUDE_PLUGIN_ROOT}}` references to the `upstream` directory beside this file. Do not interpret `$ARGUMENTS` literally: use the user's invocation text. Keep upstream `CLAUDE.md` memory as workflow data; do not overwrite AGENTS.md or any existing instructions. Use KronTerm's existing artifact preview for generated files. Read upstream/CONNECTORS.md for informational tool mappings only.

{links}
''', encoding="utf-8")
    (destination / "kronterm-provenance.json").write_text(json.dumps({
        "repository": f"https://github.com/{repo}", "revision": revision,
        "sourcePath": subdir, "adapter": "agent-skill" if name == "diagram-design" else "explicit-workflow",
        "importedHooks": False, "importedConnectors": False,
    }, indent=4) + "\n")


def import_pack(name, root):
    repo, revision, _ = PACKS[name]
    skill_name = name if name == "diagram-design" else f"kw-{name}"
    root = root.expanduser().resolve()
    target = root / skill_name
    if target.exists() or target.is_symlink():
        raise ValueError(f"Already exists: {target}; remove intentionally before importing again")
    root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kronterm-pack-") as temp:
        checkout = Path(temp) / "checkout"
        env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull}
        def git(*args):
            return subprocess.run(["git", "-c", "core.hooksPath=" + os.devnull, *args], check=True, env=env, capture_output=True, text=True, timeout=75).stdout.strip()
        git("init", str(checkout))
        git("-C", str(checkout), "fetch", "--depth=1", f"https://github.com/{repo}.git", revision)
        git("-C", str(checkout), "checkout", "--detach", "FETCH_HEAD")
        if git("-C", str(checkout), "rev-parse", "HEAD") != revision:
            raise ValueError("Fetched revision does not match catalog")
        # Stage on the destination filesystem so publication is atomic.
        with tempfile.TemporaryDirectory(prefix=".pack-stage-", dir=root) as staging:
            staged = Path(staging) / skill_name
            stage_pack(name, checkout, staged)
            if target.exists() or target.is_symlink():
                raise ValueError(f"Destination appeared during import: {target}")
            staged.rename(target)
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pack", choices=PACKS)
    parser.add_argument("--skills-dir", type=Path, default=Path.cwd() / ".agents" / "skills")
    parser.add_argument("--reviewed", action="store_true", help="Confirm you reviewed pinned upstream instructions and license")
    args = parser.parse_args()
    repo, revision, subdir = PACKS[args.pack]
    if not args.reviewed:
        parser.exit(2, f"Review https://github.com/{repo}/tree/{revision}/{subdir} and its LICENSE, then rerun with --reviewed. Nothing imported.\n")
    try:
        print(import_pack(args.pack, args.skills_dir))
    except (ValueError, OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        parser.exit(1, f"Import failed: {exc}\n")


if __name__ == "__main__":
    main()
