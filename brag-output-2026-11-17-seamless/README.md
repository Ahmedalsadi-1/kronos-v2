# KronOS: typing and seamless transitions

[Video](brag.mp4) · [Poster](brag.jpg) · [Share caption](share-copy.txt)

50 seconds, 1920 x 1080, 30 fps. Preserves the actual recordings and the tabs/sandbox focus of the approved kinetic cut.

## Changes

- Opens directly on the actual first chatbox, isolated from the recording.
- Types “Find the best restaurants in Chicago.” with caret-following sparkle particles and quiet typing sounds.
- Reveals the workspace from the same captured image used by the first live frame; no separate slide into the tabs demo.
- Uses one persistent frame with source head/tail holds and short overlapping blends, eliminating empty handoff frames.
- Smooths the cursor-led camera moves with longer easing curves and a zoom into the VM pane before the sandbox handoff.
- Ends with the KronOS wordmark alone. No tagline or beta label.

## Source

- [Editable composition](composition/index.html)
- [Storyboard](brag-plan.md)
- [Source ranges and variable speeds](edit-decisions.json)
- [Validation report](check.json)

The UI is real recorded footage. Typing, caret, sparkles, camera moves, captions and audio are editorial additions. Source MOV files remain preserved in the earlier real-demos output; exact paths are recorded in the edit decisions. The composition contains its own local media for rendering.

Hyperframes checks passed with zero errors and zero warnings across lint, runtime, layout, motion, contrast, craft and audio. Intro, transition and outro keyframes were reviewed.

Export verified as H.264/AAC, 50 seconds, 1500 frames. Decoded typing, sparkle, handoff and logo frames were reviewed. The full-prompt frame at 3.8 seconds is saved as the poster and baked into frame zero.
