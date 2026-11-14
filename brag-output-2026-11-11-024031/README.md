# KronOS launch concept

38 seconds · 1920 × 1080 · 60 fps · stereo music · HyperFrames / GSAP

The film moves from the edge-attached agent into live widgets, sandbox tools, n8n, and the ComfyUI node canvas. Silver presentation space alternates with dark development surfaces. Camera landings use short restrained impacts.

## Important capture distinction

This is a source-based product concept, not an uninterrupted live recording. Expanded native agent, widget workspace, sandbox, n8n, and ComfyUI are staged development views grounded in current source and reference captures. Field Notes is fictional demo content designed for the film. No agent completion, workflow run, or generated image success is fabricated. See `asset-ledger.md` for every source and `recording-shot-list.md` for replacement takes.

## Files

- `brag.mp4` — final master, poster baked into frame zero
- `brag.jpg` — settled poster frame
- `composition/index.html` — editable HyperFrames project
- `brag-plan.md` — storyboard, rubric and capture decisions
- `composition-brief.md` — art direction and timing
- `share-copy.txt` — canonical caption
- `asset-ledger.md` — source provenance and staging disclosures

## Edit and render

From the composition directory, run `npx hyperframes preview` to open the timeline. Each feature has its own HTML file in `compositions/`. Timeline timings are in `index.html`. Font, runtime, images, music and sound are local.

Run `npx hyperframes check`, then `npx hyperframes render --quality delivery --fps 60 --workers 4 -o ../brag.mp4`.

## Delivery finishing

The final MP4 adds 8.9 dB of gain to the quiet source music mix (approximately -16 LUFS, with peak headroom). Only frame zero is replaced by the settled notch poster at 7.2 seconds. The film remains 38 seconds and 2280 frames. `brag-master.mp4` retains the direct HyperFrames export.
