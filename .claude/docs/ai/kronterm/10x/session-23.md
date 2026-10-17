# KronTerm cross-category add-on roadmap

Session 23 | 2026-10-10

## Scope

Keep the developer roadmap from session 22 and expand into browser research, video, canvas design, games, images, 3D, audio, documents, data and automation. These are proposed add-ons, not installed capabilities. Existing browser controls, spatial canvas, audio infrastructure and video/Remotion project are foundations; a finished end-user production workflow is not established by their presence.

## Candidate modules

| Module | Useful output | Reference |
| --- | --- | --- |
| Browser research | Cited cross-tab report and structured extraction | https://github.com/browser-use/browser-use ; https://github.com/browserbase/stagehand |
| Video studio | Editable storyboard, preview, captions and rendered video | https://github.com/remotion-dev/remotion ; https://www.descript.com/ |
| Canvas design | Editable diagrams, storyboards and visual project boards | https://github.com/excalidraw/excalidraw ; https://github.com/jgraph/drawio |
| Games | Playable web prototype, assets and export | https://github.com/phaserjs/phaser ; https://github.com/godotengine/godot |
| Image workflows | Reproducible generation jobs, variations and asset provenance | https://github.com/Comfy-Org/ComfyUI |
| 3D | Scripted Blender scene, render and reusable game asset | https://github.com/blender/blender |
| Audio | Transcript, captions, searchable recording and editable segment list | https://github.com/ggml-org/whisper.cpp ; https://www.descript.com/ |
| Documents | Extracted tables, cited document analysis and exportable decks | https://github.com/docling-project/docling ; https://github.com/marp-team/marp-cli |
| Data | SQL exploration of files, charts and reproducible report | https://github.com/duckdb/duckdb |
| Automation | Triggered cross-app jobs with run history | https://github.com/activepieces/activepieces ; https://github.com/n8n-io/n8n |
| Media library | Searchable photo/video assets and collections | https://github.com/immich-app/immich |
| Local AI infrastructure | Optional local inference and provider routing | https://github.com/ml-explore/mlx ; https://github.com/BerriAI/litellm |

## Shared architecture

Each module declares its skill workflows, tools, optional runtime/provider prerequisites, independent widget, output formats and job status. Reuse the existing terminal/chat, theme and artifact storage instead of creating a separate agent UI per module. Long jobs need cancellation, persistence and accurate failure state. Generic skills do not replace engines or runtime adapters.

## Order

First deliver browser research through the existing browser bridge, editable creative canvas, Phaser game templates, and video production using existing infrastructure. Preserve the developer improvements in parallel scope. Next deliver image/audio/documents/data workflows. Later extend into deeper Godot/Blender integrations, media indexing and cross-app automation.

## Compatibility decisions

No Playwright or added browser automation stack. Browser Use and Stagehand are behavior references, not approved drop-in dependencies. Remotion rendering and Marp export browser/runtime requirements need evaluation against that constraint. tldraw requires a production license key; Remotion uses special licensing; n8n is fair-code. Do not label all public GitHub repositories permissively open source or assume their hosted products are embeddable. Evaluate licenses and supported APIs for every selected adapter.

## Example compound workflow

Research an idea in the existing browser, collect source-linked findings, place a storyboard on the canvas, generate assets, build a playable Phaser prototype, and render a product demo. Every step yields an inspectable artifact; the existing chat directs the process and widgets hold the work.
