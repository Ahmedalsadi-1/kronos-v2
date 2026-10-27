# Ego Lite visual reference observations

Source: `/Users/albsheralsadi/Desktop/Screen Recording 2026-10-20 at 12.19.34 PM.mov`.
Video: 12.7767 seconds, 1970 x 2198 pixels, 60 frames/second.
Evidence: `reference/frame-0.3.png`, `reference/frame-6.png`, `reference/pointer-6.png`, and half-second samples in `reference/timeline.jpg` (left-to-right, top-to-bottom starting at 0 seconds).

## Observed

- The aura follows the entire rounded browser window, including browser chrome, rather than only the webpage viewport. A strong but diffuse periwinkle/blue band lies inside the perimeter. Its falloff is broad, approximately 60-100 source pixels (a visual estimate), with the center clear.
- The aura is not a sharply drawn animated outline. There is a fine regular white dotted texture, strongest near the edge and fading toward the center. The corners form soft rounded pools of blue light.
- Edge brightness varies over the recording. At some half-second samples the top or side wash is faint; at others it is stronger. This supports slow changing intensity/position but does not establish an exact period or easing curve. No rainbow sweep is clearly established by this recording; blue/periwinkle dominates.
- The visible agent pointer is a dark filled triangular wedge, roughly 14 x 18 source pixels, bordered by a narrow white rim. It is much simpler than the full physical mouse-arrow silhouette. It points up-left.
- A charcoal capsule, reading `Browsing the web`, sits immediately below/right of the pointer. It is roughly 140 x 32 source pixels with fully rounded ends, white type, and a subtle white edge. These sizes are visual estimates from the 2x enlarged crop.
- A large, soft gray shadow spreads below the pointer/capsule, making a floating appearance. The pointer itself does not have a visible rainbow halo in the inspected frames.
- A separate physical mouse pointer is visible lower in the window. The agent pointer and physical cursor are distinct.
- A bottom-centered dark control pill stays above the bottom aura. It identifies agent control and includes takeover/stop controls.

## Limits and reconstruction choices

The agent pointer is essentially stationary in this short recording. No click, drag, scroll, or zoom event can be confidently identified, so click burst duration, path curvature, movement easing, and drag behavior are unknown. A light rainbow accent or click bloom is a requested KronTerm design choice unless corroborated by shipped-artifact evidence. This report is video observation, not a source-code finding.
