# Optional workflow packs

KronTerm can import three reviewed, pinned packs into its existing shared skill system. Nothing is installed at startup. This importer does not configure MCP servers, Claude plugin manifests, hooks, or automatic updates. No upstream content ships with KronTerm.

| Pack | Source | Pinned revision | Result |
| --- | --- | --- | --- |
| Diagram Design | https://github.com/cathrynlavery/diagram-design | f4547ee95f88e5b28a52517feff6b6c11cc657f9 | diagram-design skill, references, assets and export scripts |
| Product management | https://github.com/anthropics/knowledge-work-plugins | ae1513ea94dcb74a7f1505ddcf3b0ec3fab327f1 | kw-product-management explicit workflow adapter |
| Productivity | https://github.com/anthropics/knowledge-work-plugins | ae1513ea94dcb74a7f1505ddcf3b0ec3fab327f1 | kw-productivity explicit workflow adapter |

Review the source at the pinned revision and its LICENSE before importing. Diagram Design uses MIT; the knowledge-work packs carry Apache 2.0 files. Preserve those files and provenance if sharing an imported copy. The importer deliberately requires review because upstream workflow instructions can request file changes and external actions when invoked.

In Hermes, open Capabilities → Skills → Optional workflow packs. Choose Review, open the pinned source/license, and select Install into this profile. The install uses the backend-reported profile directory; subsequent enable/disable controls stay in the existing Skills inventory. Errors, including missing Python 3 or Git, are displayed without configuring other dependencies.

From this repository:

```sh
python3 scripts/import-workflow-pack.py diagram-design --reviewed
python3 scripts/import-workflow-pack.py product-management --reviewed
python3 scripts/import-workflow-pack.py productivity --reviewed
```

Python 3 and Git are required. The default destination is the current project's `.agents/skills`. For a dedicated Hermes profile, pass `--skills-dir` with that profile's actual skill directory. Global import is explicit: `--skills-dir "$HOME/.agents/skills"`. The importer prints the destination on success. Open a new agent session if its skill inventory is cached; use the existing Capabilities skill controls to disable or archive it.

Ask explicitly for Diagram Design or `/kw-product-management` and `/kw-productivity` once the active agent discovers them. Knowledge-work adapters list their available workflows and preserve original files beneath `upstream/`; they do not claim native Claude plugin support. Connector placeholders describe optional requirements rather than connections that already exist. Add any desired connections separately through existing MCP settings. Productivity can write TASKS.md, CLAUDE.md and memory files when invoked; existing instructions are preserved by the adapter.

Diagram Design requires first-use brand setup. Choose a project profile using KronTerm's actual palette and fonts; leave the shared upstream style guide intact. Ask for static HTML/SVG and open the output in the existing artifact preview. Export scripts remain available as skill content but importing never executes them. This integration adds no browser driver or rendering service.

Imports fail if a destination already exists, avoiding overwrites of user-customized skills. To update, review a new revision, change the catalog and test it, then intentionally remove/archive the old copy before importing. A failed fetch or staging validation never publishes a partial skill.

Validation:

```sh
python3 scripts/test-workflow-packs.py
```
