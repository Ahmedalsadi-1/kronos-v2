# Hyperframes Composition Brief: KronTerm

## Objective
Create a short launch-style brag video for KronTerm — a polished, footage-driven product film.

## Output
- Composition directory: `brag-output-2026-09-28-171409/composition/`
- Rendered video: `brag-output-2026-09-28-171409/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20 seconds

## Source Material
- Project root: `/Users/albsheralsadi/kronterm`
- Primary files read: `website/src/App.tsx`, `website/index.html`, `video/src/theme.ts`, `video/AGENTS.md`
- Product name: KronTerm
- Tagline / strongest claim: "Stop feeding AI a transcript. Give it the workspace."
- Key UI or visual moment to recreate: the living canvas with terminal/browser/agent widgets (real recordings), KronosCode agent activity chip
- Real screen recordings (copy into composition assets, use via local paths):
  - `video/public/promo/canvas-widgets.mp4` (16.0s)
  - `video/public/promo/agent-chat.mp4` (14.0s)
  - `video/public/promo/browser-focus.mp4` (15.9s)
  - `video/public/promo/terminal.mp4` (12.9s)
- Icon asset: `video/public/kronterm-icon.svg` (square glyph). **Never use `kronterm-logo.svg`** — it still carries Wave branding. Build the wordmark typographically as "KronTerm".
- Copy that must appear verbatim:
  - "The living canvas for human + agent work."
  - "KronosCode is working" / "Reading terminal output + 4 files"
  - "Change the code." / "See the product answer."
  - "Stop feeding AI a transcript. Give it the workspace."
  - "Private beta · open canvas notebook" (scene 1 topline, optional)
  - "kronterm.io" (lower third)

## Creative Direction
- Tone preset: polished
- Creative direction: quiet-premium product film built from real screen recordings; confident restraint
- Interpretation: fewer scenes, longer holds; copy arrives in small confident slams; soft crossfades with occasional hard cuts
- Angle: Most AI tools hide the work. KronTerm shows it — real footage of the canvas, agents, and terminal, with the site's own copy as the spine.
- Hook: live canvas recording on frame one + hero line slamming in with "human + agent" in lime
- Outro / punchline: "Stop feeding AI a transcript. Give it the workspace." → icon + wordmark → kronterm.io
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign
  - The Wave-branded logo.svg

## Visual Identity
- Background: #050608 (panels #090b10)
- Text: #f5f7fb (muted #a6adba)
- Accent: #b8ff6c (support #74d7ff)
- Display font: Inter 700/800
- Body font: Inter
- Visual references from the project: lime status-dot, widget panel chrome (rgba white borders), agent activity chips

## Storyboard
Use the storyboard in `brag-output-2026-09-28-171409/brag-plan.md` as the creative contract.

Scene summary:
1. Hook — 3.5s — canvas recording + hero line, "human + agent" in lime
2. The canvas — 4.5s — camera push + 4 widget label chips snapping on beats
3. The agent — 4.5s — agent-chat recording + "KronosCode is working" + typed activity line
4. Two surfaces — 4s — split browser/terminal + two-line cause/effect copy
5. Outro — 3.5s — punchline line, icon+wordmark, kronterm.io, music out

## Audio
- Audio role: cinematic support — steady, low, professional bed
- Audio arc: quick fade-in → steady bed with slight lift at scene 3 → fade out under logo
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`
- Music treatment: volume 0.28, fade-in 0-0.3s, fade-out over final 1.5s
- Music cue guidance: bundled preset at `/Users/albsheralsadi/.agents/skills/brag/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`. 1-2 strongCue locks: hero-line landing (~2s), outro line (~17s). Scene-2 chip snaps use nearby beats ±0.10s.
- Audio-reactive treatment: subtle; hero title glow + canvas vignette breathe with RMS/bass
- Audio-coupled moments:
  - Scene 1 — hero line word groups: quiet key ticks + soft drop accents
  - Scene 2 — 4 widget chips: card/drop sounds per chip
  - Scene 3 — typed activity line: quiet keys
  - Scene 5 — outro line: soft impact; logo: quiet bell or none
- SFX selection guidance: sparse, low high-frequency risk, restrained (polished tone); see `/Users/albsheralsadi/.agents/skills/brag/assets/sfx/sfx-analysis.md`
- SFX analysis guidance: prefer low/medium HF-risk files; nothing above 0.7 volume
- Exact SFX choice: Hyperframes chooses filenames, timestamps, density, volume based on implemented animation
- Audio files: copy chosen music + SFX into `composition/assets/`

## Hyperframes Instructions
Load the Hyperframes domain skills — `hyperframes-core`, `hyperframes-animation`, `hyperframes-creative`, `hyperframes-keyframes`, `hyperframes-cli`. /brag is its own workflow: do not enter the `hyperframes` entry-point intent interview and do not route into its generic promo / launch-video workflow.

Requirements:
- Show at least one real UI recording from the source project (4 provided above)
- Keep all text readable in the final render (read-time floors respected)
- Keep the video at 20 seconds
- Include the planned music/SFX layer
- Treat audio notes as guidance, not a fixed cue sheet
- Treat music cue metadata as optional timing hints; readability first
- 1-2 strong cue locks max; mark `// beat-locked` / `// beat-grid`
- Audio-reactive: subtle RMS/bass on hero glow + vignette; no waveform/equalizer visuals
- Use local assets for audio and media (copy recordings into `composition/assets/video/`)
- Run `hyperframes check` before render — the single gate
