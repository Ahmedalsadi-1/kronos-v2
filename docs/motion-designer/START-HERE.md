# KronTerm: motion designer handoff

Prepared 2026-11-02. Start here; no app installation is needed to browse the ZIP.

## Repository and branch

- Repository: https://github.com/Ahmedalsadi-1/kronterm
- **Use this branch: `feat/kronsettings-from-kronoschamber`.** Do not use `main` for this brief.
- Branch: https://github.com/Ahmedalsadi-1/kronterm/tree/feat/kronsettings-from-kronoschamber
- Live source ZIP: https://github.com/Ahmedalsadi-1/kronterm/archive/refs/heads/feat/kronsettings-from-kronoschamber.zip
- The separately supplied designer ZIP is a fixed copy. `HANDOFF-MANIFEST.json` at its root records the exact commit.

## What the product is

KronTerm is a persistent workspace where a human and agents use terminals, browsers, files, editors, computers and sandboxes together. The same work can be presented as tiled widgets, focused tabs, a spatial canvas or the KronTerm OS desktop. The film should make that shared workspace and the visible connection between a request, an action and its result easy to understand.

KronTerm is the product name. KronosCode is the execution engine. KronTerm Agent is the user-facing agent surface; Hermes names remain in source files and some development interfaces. KronosChamber and Wave names in older documentation are historical or compatibility names. Avoid putting those legacy names in new titles unless the brief explicitly needs them.

**Release framing:** macOS private beta. Windows/Linux availability is under evaluation. Phone/iPhone work is Labs, voice is Experimental, and the workflow canvas remains In development. This repository contains development UI, concepts and older films alongside current implementation.

## First hour

1. Read the root `README.md`, then [FEATURES.md](FEATURES.md). The feature guide includes status, source evidence and a suggested visual demonstration for each capability.
2. Browse [VISUAL-TOUR.md](VISUAL-TOUR.md) for a quick orientation. Open [ASSETS.md](ASSETS.md) and search [assets.csv](assets.csv). Start with `website/public/assets/product/`, `assets/`, `output/hermes-computer/`, `output/subagent-theater/` and `output/device-workspace/`.
3. Watch the recordings in `assets/` and the edited footage under `brag-output-2026-10-28-054553/composition/assets/`. Filenames alone do not establish what a clip demonstrates; inspect the entire clip before selecting it.
4. Read `brag-output-2026-10-28-054553/storyboard.md`, `composition-brief.md` where present, and the composition's source ledger. These explain the previous directed Coucou/KronTerm film. Earlier approvals apply to that film, not automatically to a new brief.
5. Read `video/README.md` for the editable Remotion projects. `website/public/assets/video/` contains website video assets. Existing films are references, not a mandate to repeat the same duration or style.
6. Make a footage shortlist: feature, source path, in/out timecode, caption, feature status and any capture needed. Then propose a storyboard for review before making a full edit.

## Recommended story to explore

This is a starting proposal, not an approved final script or duration:

1. Establish one persistent workspace: terminal, browser and files around a compact agent HUD.
2. Give the agent a concrete task; keep the user request and the affected surface connected.
3. Show tools doing actual work: a browser action, terminal output or file edit with a readable result.
4. Expand to parallel agents and computer widgets using real captured states.
5. Show a useful outcome and review: evidence, a diff, an approval or a completed task.
6. Close on KronTerm and the private-beta call to action. If workflows, voice or phones appear, carry the appropriate development/experimental/Labs label.

## Visual and asset guidance

- Prefer current real UI captures for product demonstrations. Use generated illustrations only as clearly illustrative transitions or explanations.
- The previous directed film uses near-black, off-white and lime, with Inter. Treat its brief as a reference; confirm the new film direction with the project owner.
- `website/public/assets/product/kronterm-icon.svg` is the README icon. Inspect `kronterm-logo.svg` before use: the video instructions warn that it retains legacy Wave branding. A checked icon plus a text wordmark is the safer starting point.
- The recent directed film uses Coucou. Older artwork includes a pixel cat. Do not mix the companion identities without an explicit creative decision.
- Use calm, readable camera moves and enough dwell time to understand the task. Keep cursor actions and the resulting UI state aligned; do not manufacture a successful outcome with an unrelated shot.
- Crop or replace personal information, tokens, account names, private code and notification content before publishing recordings. Retain third-party notices in source deliveries and check music/font/art rights for the final distribution.
- `docs/social-brand-kit.md` is older marketing reference. The root README and this feature/status guide take precedence when its release language differs.

## What to deliver

Agree the film length, aspect ratios, voice/music, deadline and final CTA with the project owner. Suggested review package:

- Footage shortlist and storyboard/animatic with proposed captions and feature labels.
- Review MP4, then approved final export(s) in the agreed formats.
- Editable project with linked footage, fonts and licensed audio; no missing files.
- A source/rights ledger listing the repository paths, timecodes, licenses and any new assets.
- Notes identifying any mockups or development features used in the film.

## Optional: run the source

For a source checkout:

```sh
git clone --branch feat/kronsettings-from-kronoschamber --single-branch https://github.com/Ahmedalsadi-1/kronterm.git
cd kronterm
git branch --show-current
```

The designer ZIP is for browsing and editing media; it has no `.git` history and should not be used to run Git checkout commands. For the desktop build, follow `BUILD.md` prerequisites and the root README. `BUILD.md` retains upstream Wave clone examples; use the KronTerm clone command above. A prepared macOS development machine can use `task dev`; `task preview` runs the component preview without Electron. These have not been rerun as part of this documentation handoff.

For existing video compositions, work in `video/`:

```sh
npm install
npm start
# Optional existing renders:
npm run build:promo
npm run build:intro
npm run build:field-guide
npm run build:os-demo
```

The workflow editor has additional setup in `integrations/n8n/README.md`. You do not need to build it to review the assets.

## ZIP scope and external repositories

The ZIP includes all tracked files from the recorded handoff commit, including source, documentation, media and existing composition projects. Installed dependencies, build caches, credentials, temporary verification files and Git history are omitted.

Nested Git repositories are separate projects, not flattened copies. Their pinned revisions are listed in `HANDOFF-MANIFEST.json`. `output/source-snapshots/` preserves the local nested-repository patches and untracked-file archives from the earlier snapshot. Those backups are source material, not media to import into an editing timeline. Ask an engineer to restore them if rebuilding an integration. Do not run a blanket recursive submodule update: several inherited gitlinks have no `.gitmodules` mapping.

The uncompressed archive is roughly 1 GB before ZIP compression. Keep the directory layout intact so relative links and video project asset paths continue to work.
