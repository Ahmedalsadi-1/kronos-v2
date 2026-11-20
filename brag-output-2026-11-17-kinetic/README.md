# KronOS: In motion

[Play the video](brag.mp4) · [Poster](brag.jpg) · [Share caption](share-copy.txt)

50 seconds, 1920 x 1080, 30 fps. This revision preserves the original hook and uses the same six actual app recordings.

## Changes

- A 6.25x pullback reveals the populated browser and sandbox workspace from the actual floating chatbox.
- Tabs and the sandbox get 22 seconds combined. Hover previews and the agent action play at normal speed; waiting and traversal accelerate.
- Keyframed close-ups follow the recorded cursor across the tab rail, into the split pane, and toward the sandbox action panel.
- White and graphite backgrounds, clear typography, clean masks, and directional transitions give the film a restrained product-design presentation.
- Wide shots restore context after close-ups. The canvas section follows minimap selection into the selected live widget before the recorded zoom-out.

## Editable files

- [Composition](composition/index.html)
- [Storyboard](brag-plan.md)
- [Exact source ranges and speeds](edit-decisions.json)
- [Validation report](check.json)

The source recordings remain preserved in the previous real-demos output. Exact absolute paths appear in the edit decisions. All rendered assets are local to this composition, so playback/rendering does not depend on those original MOV files.

## Individual edited clips

- [tabs](composition/assets/tabs.mp4)
- [vm](composition/assets/vm.mp4)
- [canvas](composition/assets/canvas.mp4)
- [browser](composition/assets/browser.mp4)
- [annotate](composition/assets/annotate.mp4)
- [design](composition/assets/design.mp4)

Validation: Hyperframes check passed with zero errors and zero warnings across lint, runtime, layout, motion, contrast, craft, and audio. Scene keyframes were visually reviewed.

Final export: H.264 video and AAC audio, 50.000 seconds, 1500 frames. Exported scene and transition frames reviewed; the sandbox-to-canvas boundary and tabs endpoint were corrected and reverified. The settled tabs/split-pane poster is baked into frame zero.
