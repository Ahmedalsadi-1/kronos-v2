#!/usr/bin/env python3
"""Apply the personal KronTerm bridge to the pinned Linux Coucou source."""

import argparse
import pathlib
import shutil
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
REVISION = "841a81ce1d75b65882b30139e6b716d0837dce30"


def replace(path, before, after):
    text = path.read_text()
    if after in text:
        return
    if text.count(before) != 1:
        raise RuntimeError(f"Upstream integration point changed: {path}: {before!r}")
    path.write_text(text.replace(before, after, 1))


def prepare(source):
    if (source / ".git").exists():
        revision = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
        if revision != REVISION:
            raise RuntimeError(f"Expected Coucou Linux {REVISION}, found {revision}")
    app = source / "windows"
    for name in ["bridge.ts", "bridge.css"]:
        shutil.copy2(ROOT / "native/coucou/linux" / name, app / "src" / f"kronterm-{name}")
    shutil.copy2(ROOT / "native/coucou/linux/bridge.rs", app / "src-tauri/src/kronterm.rs")
    lib = app / "src-tauri/src/lib.rs"
    replace(lib, "mod agent_hooks;", "mod kronterm;\nmod agent_hooks;")
    replace(lib, "            boot,", "            kronterm::kronterm_enabled,\n            kronterm::kronterm_event,\n            boot,")
    replace(lib, "            let handle = app.handle().clone();", "            let handle = app.handle().clone();\n            kronterm::start(handle.clone());")
    main = app / "src/main.ts"
    replace(main, 'import "./style.css";', 'import "./style.css";\nimport "./kronterm-bridge.css";\nimport { bootKronTerm } from "./kronterm-bridge";')
    replace(main, "  island.launch();", "  island.launch();\n  await bootKronTerm(island);")
    views = app / "src/views/views.ts"
    replace(views, 'import { h, svg, clear, dot } from "./dom";', 'import { h, svg, clear, dot } from "./dom";\nimport { krontermLaunchers, krontermWidgetTabs } from "../kronterm-bridge";')
    replace(views, 'h("div", { class: "tabs" }, tabHome, tabChat, tabDrop),', 'h("div", { class: "tabs" }, tabHome, tabChat, tabDrop, krontermLaunchers()),')
    replace(views, "  const right = card(null, pills);", "  const right = card(null, pills, krontermWidgetTabs());")
    replace(app / "src/core/layout.ts", "export const PANEL_H = 320;", "export const PANEL_H = 850;")
    replace(app / "src-tauri/src/island.rs", "pub const PANEL_H: f64 = 320.0;", "pub const PANEL_H: f64 = 850.0;")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=pathlib.Path)
    prepare(parser.parse_args().source.resolve())
