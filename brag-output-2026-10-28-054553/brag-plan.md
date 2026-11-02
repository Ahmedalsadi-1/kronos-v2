# KronTerm + Coucou: approved directed film

45 seconds / 1920x1080 / 30 fps. Animated on-screen type, instrumental audio, no narration.

The user approved proceeding with their supplied recordings and explicitly requested the Coucou notch pet with the KronTerm title in the intro. Their asset-by-asset directions are retained. Earlier date restrictions are superseded by the user-selected September/October recordings.

| Shot | Seconds | Frames | Subject |
| --- | --- | --- | --- |
| intro | 0-3 | 0-89 | COUCOU + KRONTERM |
| bots | 3-7 | 90-209 | BOT PROFILES |
| sessions | 7-10 | 210-299 | BOTS + SESSIONS |
| workspace | 10-15 | 300-449 | OS WIDGETS + COMPACT HUD |
| editor | 15-19 | 450-569 | FILE EDITOR |
| vm | 19-22 | 570-659 | COMPUTER ASSIGNMENT |
| chat | 22-24 | 660-719 | SIDE-PANEL CHAT |
| tools | 24-28 | 720-839 | BROWSER + TERMINAL |
| parallel | 28-32 | 840-959 | AGENTS SIDE BY SIDE |
| notch | 32-36 | 960-1079 | NOTCH WORKSPACE |
| browser | 36-39 | 1080-1169 | BROWSER USE + INDICATORS |
| phone | 39-42 | 1170-1259 | PHONE CONTROL LABS |
| outro | 42-45 | 1260-1349 | KRONTERM |

## Implementation and source notes
- Coucou uses the actual MochiBotEngine geometry from frontend/app/view/hermes/mochi/bot-engine.ts, ported from the Coucou companion. Its shape is not the unrelated pixel-cat artwork from an older video.
- The intro presents Coucou leaving a notch-shaped surface and arriving next to the animated KronTerm title. Coucou returns in the notch shot and closing lockup.
- Six actual recording excerpts are frozen in composition/assets/source-ledger.json.
- Notch expansion is an illustrated presentation containing actual agent-browser footage.
- The file editor is actual source imagery; no fabricated code changes are shown.
- Phone control is marked Labs and Experimental throughout its shot.
- Physical depth uses perspective planes, edge thickness, parallax and occlusion. Cutouts and focus highlights track actual controls.
- Compact HUD starts in close-up, then recedes to demonstrate headroom for widgets. Widget-focus motion also occurs in the underlying selected recording.
- No narration. Sparse impacts at the profile, OS, toolset, notch and closing reveals. Music fades in and out.
- Palette: #060708, #f5f5ef, #a3e635. Local Inter font. ENERGY 3 / RHYTHM 3 / MOTION 3.

## Validation
Run Hyperframes check, capture each scene midpoint, inspect the intro pet and all media-bearing scenes, then verify exported duration, dimensions, frame rate, audio and poster.
