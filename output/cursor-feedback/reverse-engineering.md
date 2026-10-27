# Ego Lite cursor and aura reconstruction

## Evidence

- Installed target: `/Applications/ego lite.app`, framework version `0.6.0.16`.
- Native launcher SHA-256: `43077d9c70dd39ecba57adcf12dadd050fc161532b7e6520e18f94b2a055f8f3`.
- Packaged `resources.pak` SHA-256: `1545a337b288f1d2244e5a189effe4cab152c7073e128d5e53084d0db33b2f97`.
- Chromium DataPack v5 inventory: 5,842 resource entries and 371 aliases. Resource 59400 contains the shipped browser automation runtime.
- REA Evidence `ev_aed3fe8ba41a6c01d1d5703eae6823db43f15e5680d2d482ed9a97ce554667e6` analyzes a focused 1,638-byte inert JavaScript excerpt from that runtime (character range 589126..590764). One file parsed, 165 AST nodes, no parse failures. Excerpt SHA-256: `778ad8758b3323b0dccc95fe6cceabb61d1ed6f96081db48f313b5fe6efbfd26`.
- Native framework string inventory identifies `AgentMouseLayerView`, `agent_mouse_layer_view.cc`, `agent_task_overlay_view.cc`, and `OnAgentControlStarted`. These strings establish component names, not painting or timing behavior.
- The supplied 12.7767-second screen recording establishes the visible broad blue/periwinkle edge wash, sparse dots, triangular dark pointer with white rim, adjacent dark pill, and diffuse shadow. See `reference-observations.md` and `reference/`.

## Observations and inferences

The shipped JavaScript dispatches input through CDP, then sends mouse movement to `services.showAgentMousePosition`. Cursor and label rendering are display-only, asynchronous hints whose failures do not fail the website action. This is a static code observation; REA did not execute those functions.

The recorded aura covers browser chrome as well as page content. The separate native mouse/task-overlay names corroborate a native display layer, but exact native paint code remains unknown.

Packaged Chromium actor-overlay resources also contain a 24px cursor, a 400ms press animation, and a 4s border pulse. They belong to the Chromium actor overlay and are NOT established as Ego Lite's active overlay. They were not treated as authoritative Ego animation parameters.

## Reconstruction choices

KronTerm uses a dark triangular pointer, a compact action label, a soft hue press pulse, and a blue/periwinkle-dominant rainbow aura with sparse dots. The page aura and full-block aura are separate, click-through layers. Feather masks keep the center clear. The block layer also covers toolbars and integrated chrome. Existing browser, app-stream, and VM cursor mounts share the page implementation; all block views receive the outer aura.

The 48px feather, subdued rainbow accents, 320ms click pulse, and slow drift/breathing are reconstruction choices. The recording does not establish click, drag, scroll, or zoom animation timing. Reduced motion disables animated feedback; completion, takeover, timeout, and unmount clear activity.

## Limitations

REA opened the installed native launcher, but Hopper could not start. The native session was closed. Broad analysis of the 830KB browser runtime exceeded REA's 300-second call budget; the focused dispatch excerpt above succeeded. Static evidence does not prove runtime execution, and binary strings do not recover native rendering logic. This is an evidence-guided recreation, not a claim of byte-for-byte native equivalence.

## Validation

- Final combined run: 25 cursor, aura, ownership, and browser-injection tests passed; four app-stream tests passed separately (29 total).
- Nine aura/activity lifecycle tests passed.
- Seven cursor rendering/injection/cleanup tests passed; the injection case required a larger test timeout on the heavily loaded host.
- Two browser injection lifecycle tests passed.
- ESLint and diff whitespace checks passed for changed implementation files.
- Live component preview exercised both browser and computer/VM feedback. Stop feedback changed active full-block and content-aura counts from two each to zero each.
