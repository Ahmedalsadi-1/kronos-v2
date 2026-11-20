# KronOS AI compatibility code

KronOS V2 chat is implemented in `../view/hermes/hermes-app.tsx` and
`../../hermes/`. The managed process lives in `../../../emain/hermes-runtime.ts`.
Use those implementations for current KronOS Agent work.

The retired ACP chat panel, rich composer, duplicate message renderer and old
AI panel UI were removed during the V2 source cleanup. The implementation guide
and summary in this directory describe that retired rollout and are historical.

This directory still contains shared provider settings, agent logos, voice
state, attachment helpers and compatibility model code with current consumers.
The `WaveAIModel`, `waveai:*` settings and existing configuration identifiers
remain compatibility contracts. They were not renamed or removed by this cleanup.

`acp-chat-controls.tsx`, `acp-agent-mark.tsx` and `use-acp-session.ts` were retained
with their direct tests. They are legacy support code, not the V2 chat entry point.

For the complete list of removed and retained files and verification results,
see `../../../docs/audits/kronos-v2-cleanup-2026-11-19.md`.
