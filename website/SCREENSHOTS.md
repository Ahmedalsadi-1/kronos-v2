# KronOS website captures

The website now uses the supplied current KronOS captures. It never reuses the old KronTerm or KronosCode screenshots. The originals are preserved without cropping or altering their contents.

Put image files in `website/public/assets/kronos/`. Existing captures are mapped to website sections in `src/os-captures.ts`; change that mapping to replace an assigned image. For unassigned slots, `ScreenshotSlot` automatically looks for `<slot-name>.webp`. Unavailable media is omitted. Galleries filter missing slots before laying out their items and disappear entirely if they have no captures. Reload the dev preview after adding files; rebuild before publishing so the asset inventory includes the new captures.

## Supplied screenshot library

The original screenshots remain available alongside the clips. The video placement table below records the current featured media.

| Source                      | Current use                                                    |
| --------------------------- | -------------------------------------------------------------- |
| `01-canvas-overview.png`    | Retained original overview; the hero now uses A01.             |
| `02-iphone-and-web.png`     | Retained Labs image; the homepage Labs section now uses A09.   |
| `03-canvas-and-devices.png` | Workspace and browser detail galleries.                        |
| `04-web-workspace.png`      | Retained original browser view.                                |
| `05-agent-history.png`      | Agent history gallery.                                         |
| `06-voice-workspace.png`    | Voice page and gallery, explicitly labeled Experimental.       |
| `07-orbit-canvas.png`       | Retained design image; the Design tab now uses A07.            |
| `08-orbit-agent-canvas.png` | Retained agent image; the featured agent sections now use A08. |

`09-gmail-browser.png` is intentionally not copied into the website's public assets: it contains a personal email address, inbox subjects, and account details. Use a demo account or a separately redacted capture before including that view in public marketing.

Remote-session, native desktop-control, and legacy compatibility placeholders still need corresponding captures. Unmatched detail slots are not filled with unrelated footage.

## Capture brief

| Filename                  | What to capture                                                                                  | Composition                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `workspace-hero.webp`     | The current KronOS OS desktop with a terminal, browser preview, files, and KronOS Agent visible. | 16:9. One coherent project. Show the dock and enough desktop to establish the spatial layout. |
| `os-desktop.webp`         | A clean OS workspace with several well arranged live windows.                                    | 16:9. Use Overview if it communicates the arrangement more clearly.                           |
| `canvas.webp`             | The same project in Canvas, with live widgets and a few useful notes or connectors.              | 16:9. Zoom so the content remains legible.                                                    |
| `tabs.webp`               | Tabs mode with an active project tab and a useful pane split.                                    | 16:9. Keep the tab strip visible.                                                             |
| `widgets.webp`            | Widgets mode showing a terminal, file browser, and preview in tiled splits.                      | 16:9. Show the panel boundaries clearly.                                                      |
| `agent-workspace.webp`    | KronOS Agent beside the file or preview it is working with.                                      | 16:9. Use a short real conversation with a visible result. No invented execution logs.        |
| `connected-workflow.webp` | A terminal result, edited file, and browser preview for one small task.                          | 4:3 preferred. Fits without cropping; the mobile frame is wider.                              |

## Capture settings

- Capture the app window at 2560 x 1440 or higher, ideally with the same theme and project in every shot.
- Use the current KronOS and KronOS Agent UI, with readable text and calm window arrangements.
- Hide API keys, tokens, account details, private paths, and unrelated notifications.
- Capture the actual app only. Website frames and captions are already provided.
- Start with the hero and agent images; those establish the product most quickly.

## Design and reference

Reference reviewed: https://www.warp.dev/ on November 18, 2026, through the live browser and page text. Observed: large left-aligned mono headings, pale grid, compact navigation, framed product modules, interactive feature panels, FAQ, and substantial footer. The KronOS implementation uses those layout principles with its own copy and product structure. No Warp images, customer claims, or metrics are used.

Design read: product landing page for developers, with a clear editorial hierarchy. Energy 3 / Rhythm 2 / Motion 2. Light mode retains cobalt accents; dark mode uses layered neutral greys, from charcoal backgrounds to graphite panels and silver text. Manrope unifies headings, body copy, and the KronOS wordmark. IBM Plex Mono is reserved for technical captions and metadata. The transparent cube sits beside the wordmark with consistent spacing and capitalization. Motion comes from the real product clips while they are in view.

All pages now share the KronOS shell, transparent outline logo, typography, and light/dark themes. Documentation search, product chapters, journal posts, security, pricing, support, and download routes remain available. Legacy screenshots and videos are no longer rendered on any page.

## Product chapter captures

The product index and chapter heroes use the following additional captures. Put them in the same `public/assets/kronos/` folder.

| Filename                  | Capture                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `workspace-canvas.webp`   | An overview of the current spatial workspace with useful notes and live widgets.                               |
| `terminal.webp`           | A terminal running a real project command beside its output.                                                   |
| `browser-automation.webp` | A browser task or localhost preview inside the current KronOS workspace.                                       |
| `sandbox-vms.webp`        | A clearly identified Linux environment inside KronOS, with its boundary visible.                               |
| `desktop-control.webp`    | A native macOS app task alongside the agent that is operating it.                                              |
| `remote-sessions.webp`    | An SSH session with a non-sensitive remote project.                                                            |
| `acp-agents.webp`         | Only capture if documenting an available legacy integration; this page is marked as compatibility information. |
| `voice.webp`              | Optional voice UI in an experimental build, with its state visible.                                            |

Named media slots are resolved through `ProductCaptures` in `src/os-captures.ts`. Unassigned gallery slots can use `<slug>-detail-1.webp`, and so on. The agent gallery has four detail slots. Leave optional or unavailable features empty.

## Validation

- Hard gate PASS: production build succeeds; 320px, 390px, and 1280px browser checks show no horizontal overflow; anchor targets resolve; screenshot gaps are explicit placeholders; no customer metrics or testimonials were invented.
- Purpose gate PASS: cobalt marks agent work and selected layouts; the grid references spatial composition; mono typography reflects the terminal foundation. These reasons are recorded above.
- Liveliness PASS: Energy 3 / Rhythm 2 / Motion 1; oversized hero, full-width agent section, linear tool rows, split workflow section, and a compact FAQ provide distinct compositions.
- Craft PASS: all four workspace tabs, keyboard tab switching, all five FAQ disclosures, mobile menu and Escape dismissal were exercised. Docs and download navigation were verified in the browser. The original secondary pages remain available.
- Site-wide PASS: all 20 routes render a heading in both light and dark mode. Browser checks at desktop width and 320 CSS pixels found no horizontal overflow and no legacy screenshots or videos. Documentation search, an empty search result, clearing search, mobile menu navigation, Escape dismissal, and theme persistence after reload were verified. The browser error log was empty after the final pass. TypeScript, the production build, formatting, and whitespace checks passed.

## Video handoff

The two supplied MOV files have been split into 18 numbered clips. Following the user's selections, all 18 are now placed in matching website sections and detail galleries. The original files are unchanged. Website copies and their posters are stored in `public/assets/kronos/clips/`.

| Source               | Duration       | Video              | Audio           |
| -------------------- | -------------- | ------------------ | --------------- |
| `kronos.MOV`         | 55.67 seconds  | 1280 x 720, 30 fps | Present         |
| `New Project 15.MOV` | 128.80 seconds | 1280 x 720, 30 fps | No audio stream |

Review gallery: http://localhost:5175/. The gallery remains available with source in/out timestamps, playable previews, and individual MP4 downloads. A01-A10 cover `kronos.MOV`; B01-B08 cover `New Project 15.MOV`. A09 is labeled Labs-only, and A10 is labeled as including Labs devices. The B clips retain the original `kite.video` watermark.

| Clip | Website placement                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------- |
| A01  | Homepage hero and OS tab, as requested.                                                                                   |
| A02  | Tabs preview.                                                                                                             |
| A03  | Sandbox chapter gallery.                                                                                                  |
| A04  | Sandbox VMs card and chapter hero, as requested.                                                                          |
| A05  | Canvas preview.                                                                                                           |
| A06  | Browser card and chapter hero.                                                                                            |
| A07  | Design preview.                                                                                                           |
| A08  | Homepage agent section, agent card/chapter hero, and terminal gallery, as requested.                                      |
| A09  | Homepage Labs section.                                                                                                    |
| A10  | Agent gallery, labeled as including Labs devices.                                                                         |
| B01  | Workspace card and chapter hero.                                                                                          |
| B02  | Terminal card and chapter hero, as requested; also browser gallery. The caption describes the browser footage accurately. |
| B03  | Workspace gallery: frame navigation.                                                                                      |
| B04  | Workspace gallery: design preview.                                                                                        |
| B05  | Agent gallery: code and localhost preview.                                                                                |
| B06  | Homepage connected-workflow section.                                                                                      |
| B07  | Browser gallery: inspection and navigation.                                                                               |
| B08  | Agent gallery: tools and configuration.                                                                                   |

Every clip starts playing when at least 15% of it enters the viewport, loops silently, pauses offscreen, and resumes on re-entry. Native controls and picture-in-picture are hidden. Multiple visible clips can play together. Background tabs and reduced-motion preferences pause playback. Posters remain visible until playback starts. Empty media covers and gallery slots are omitted; text descriptions and chapter links remain available.

Video integration PASS: the browser found all 18 clip IDs across their assigned sections; the five explicit user assignments match. Native playback, independent chapter links, cross-player pausing, and reduced-motion autoplay suppression were checked. Mobile checks found no horizontal overflow or distorted video ratios, and Labs labels remained visible. Production build and formatting checks passed.

Autoplay update PASS: viewport entry, offscreen pause, re-entry resume, muted looping, and simultaneous playback of two visible cards were verified. No video exposes native controls. The workspace index has nine descriptions and six populated media covers; its three empty covers are removed. Chapter galleries contain no empty items, and pages without gallery media omit the section entirely.

Typography and grey-theme PASS: header and footer wordmarks read KronOS, with the transparent cube aligned to the left. Headings and body use Manrope. Dark backgrounds, selected panels, text accents, footer, and focus colors use neutral grey values. Light-mode styling was also reviewed. At 320 CSS pixels, the header logo and actions do not overlap and the page has no horizontal overflow. The production build passed.
