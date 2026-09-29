# Brag Plan: KronTerm

## What is this app?
KronTerm is a desktop command center that unifies terminal, browser, editor, sandboxes, desktop control, and AI agents on one living, programmable canvas — with agent activity that stays inspectable.

## The angle
Most AI tools hide the work. KronTerm's actual site claim is the brag: **"Stop feeding AI a transcript. Give it the workspace."** The video shows real product footage (not mockups) — real screen recordings of the canvas, agents, and terminal — cut fast, with the site's real copy as the spine. Specificity: real UI recordings, real hero copy, real feature names ("Human + Agent Orchestra", "Terminal Night Shift", "Safe execution").

## Hook (first 2-3 seconds)
Black screen → a cursor drops onto the live canvas recording and four widget panes (terminal, browser, editor, agent) snap into place around it — while the line types/slams in: **"The living canvas for human + agent work."** Real footage on frame one.

## Key moments (the middle)
- **KronosCode working** — the agent recording shows "Reading terminal output + 4 files" — real agent activity, visible, not hidden.
- **Browser + terminal loop** — "Change the code. See the product answer." Terminal and browser widgets side by side.
- **Safe execution** — a whole Linux sandbox desktop, isolated on demand, from the sandbox imagery.

## Outro / punchline
Final line from the site itself, verbatim: **"Stop feeding AI a transcript. Give it the workspace."** → KronTerm icon + wordmark lockup (icon SVG + typographic wordmark — never logo.svg, it's still Wave-branded), "kronterm.io" lower third, music fade-out.

## User flow worth showing
Using real screen recordings from `video/public/promo/`:
- **Canvas entry** — canvas-widgets.mp4: widgets tile in on the canvas (entry)
- **Agent action** — agent-chat.mp4: KronosCode working with visible activity (key action)
- **Result** — browser-focus.mp4 / terminal.mp4: the change lands in the browser/terminal (result)

## Tone
- Preset: `polished`
- Creative direction: quiet-premium product film built from real screen recordings; confident restraint, big serif-feeling type over live UI
- Interpretation: fewer scenes, longer holds, real footage does the talking; copy arrives in small confident slams, no playful bounce; transitions are soft crossfades with occasional hard cuts on line changes.

## Format: landscape — 1920x1080
## Duration: 20 seconds

## Visual identity (from the project)
- Background: #050608 (with #090b10 panels)
- Accent: #b8ff6c (lime) with #74d7ff (cyan) support
- Text: #f5f7fb, muted #a6adba
- Display font: Inter (700/800), body Inter
- Strongest visual element: real canvas screen recordings; lime status-dot + accent glow; widget-panel chrome

## Share copy (draft)
Stop feeding AI a transcript. KronTerm gives agents the whole workspace — terminal, browser, sandbox, and canvas in one living command center. Private beta now open.

## Audio direction
- Role: cinematic support — steady, low, professional bed under real footage
- Music: happy-beats-business-moves-vol-12-by-ende-dot-app.mp3 (steady and clean — fits polished)
- Music treatment: starts at ~0.3s with quick fade-in, volume 0.28, fades out under the final logo across the last ~1.5s
- Music cue guidance: bundled preset available at `<skill-dir>/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json` (tempo + strongCues + beats). Use 1-2 strongCue locks: one for the hero line landing (~2s), one for the outro line/logo (~17s). Sequential widget reveals snap to nearby beats within ±0.10s.
- Audio-reactive treatment: subtle; hero title glow and the canvas recording's vignette breathe with music RMS/bass. No waveforms.
- SFX posture: sparse, restrained — 4-5 cues max, low HF risk
- Audio-coupled moments: hero line typing with quiet key ticks (scene 1); widget panels snapping in on beats with card/drop sounds (scene 2); soft impact on the outro line landing; logo bell only if quiet
- Restraint rule: no aggressive impacts, no dense stacking — the footage and copy carry it; SFX never louder than ~0.7

## Storyboard

### Scene 1 — Hook — 3.5s
Black → live canvas recording (canvas-widgets.mp4) scales in slightly; status-dot + "Private beta · open canvas notebook" topline; hero line slams in word-group by word-group: "The living canvas for **human + agent** work." with "human + agent" in lime.
Sequential/interaction: yes — 3 typed/sliding word groups of the hero line, key ticks, ~0.3s apart then hold
Audio intent: anticipation → confident landing on the full line
Audio-coupled idea: typing/key ticks + soft drop accents; strongCue lock on the full-line landing
Music: steady low bed, quick fade-in
Transition mood: soft crossfade → Scene 2

### Scene 2 — The canvas — 4.5s
The canvas recording continues with a gentle camera push; four widget labels appear sequentially as small chips along the frame: Terminal, Browser, Editor, Agent — each snapping on a beat, then holding as a set.
Sequential/interaction: yes — 4 label chips snap in one by one (beat-grid, non-reading-pace accents)
Audio intent: building rhythm, organized energy
Audio-coupled idea: card/drop sound per chip (4 max)
Music: steady
Transition mood: soft crossfade → Scene 3

### Scene 3 — The agent — 4.5s
Cut to agent-chat.mp4 recording; overlay chip reads "KronosCode is working"; below it, verbatim: "Reading terminal output + 4 files" appears typed.
Sequential/interaction: yes — status chip pops in, then activity line types character-by-character with quiet keys
Audio intent: focused, watchable-work feeling
Audio-coupled idea: typing ticks on the activity line
Music: steady, slight lift
Transition mood: hard cut → Scene 4

### Scene 4 — Two surfaces — 4s
Split frame: browser-focus.mp4 left, terminal.mp4 right. Copy over the seam, verbatim: "Change the code." on the left half, "See the product answer." on the right half, arriving one then the other.
Sequential/interaction: yes — two copy lines, two beats apart, each held
Audio intent: cause and effect
Audio-coupled idea: one soft accent per line
Music: steady
Transition mood: dramatic wipe → Scene 5

### Scene 5 — Outro / punchline — 3.5s
Recording dims to deep background. Final line lands centered, verbatim: "Stop feeding AI a transcript. Give it the workspace." ("workspace" in lime). Then KronTerm icon + typographic wordmark + "kronterm.io" lower third; music fades to silence.
Sequential/interaction: yes — line lands, then logo lockup rises
Audio intent: resolution, calm confidence
Audio-coupled idea: soft impact/bell on the line; silence into logo
Music: fade-out across last 1.5s

**Music mood for this video:** steady, clean, professional
**Audio summary:** one steady low bed from 0.3s, sparse restrained SFX on typing and chip snaps, one soft impact on the outro line, music fades out under the logo.

Scene durations: 3.5 + 4.5 + 4.5 + 4 + 3.5 = **20 seconds** ✓
