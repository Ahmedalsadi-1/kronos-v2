# Orca phone pairing source ledger

Inspected 2026-10-14 from the local `../orca/` source checkout. This is source inspection, not proof of a running Orca installation or a completed phone connection. No Orca implementation has been transplanted by this investigation.

## Observed flow

1. Desktop Settings > Mobile offers LAN and Orca Relay connection paths. LAN selects a reachable Wi-Fi/Tailscale address; Relay requires the configured cloud service and account. Generating a mobile offer explicitly widens the runtime listener from loopback to network reach.
2. The desktop generates a QR and copyable pairing URL. QR rendering uses error correction M, four quiet-zone modules and an integer module pitch. An enlarged QR dialog and paste fallback are available.
3. Phone Pair Desktop opens a camera scanner with three instructions: open the computer app, visit Settings > Mobile, scan. Camera permission refusal has Open Settings and paste alternatives. Opening paste unmounts the camera.
4. Scan/paste validates an offer, shows Connecting with a real connection log, and bounds initial connection at 25 seconds. Retry and paste remain available after failure. Leaving the screen disposes the in-flight attempt.
5. The phone authenticates before saving the host. A host identity derived from the desktop public key deduplicates repeat pairings. Cached clients are refreshed after saving.

## Exact source references

| Concern | Orca file |
| --- | --- |
| Phone camera/paste/error interaction | `mobile/app/pair-scan.tsx` |
| External deep link dispatch | `mobile/app/pair.tsx` |
| Phone parser | `mobile/src/transport/pairing.ts` |
| Desktop offer encoding/parser | `src/shared/pairing.ts` |
| Offer validation and Relay invite bounds | `src/shared/mobile-relay-pairing-offer.ts` |
| LAN/Relay desktop options | `src/renderer/src/components/settings/MobilePairingConnectionOptions.tsx` |
| Desktop address/generation UI | `src/renderer/src/components/settings/MobilePairingSetupSection.tsx` |
| QR/copy/enlarge UI | `src/renderer/src/components/settings/MobilePairingQrSection.tsx` |
| Integer QR rendering | `src/main/runtime/mobile-pairing-qr.ts` |
| Host credential and listener requirements | `src/main/runtime/runtime-rpc/runtime-rpc-pairing.ts` |
| Mobile generation, mode rotation and Relay minting | `src/main/runtime/runtime-rpc/runtime-rpc-mobile-pairing.ts` |
| Candidate race, authentication and persistence | `mobile/src/transport/pre-profile-pairing-coordinator.ts` |
| Direct encryption primitives | `mobile/src/transport/e2ee.ts` |

## Protocol and reuse boundary

The URL is `orca://pair?code=<base64url JSON>`, with fragment compatibility and bare-code paste accepted. Its version-2 offer includes `endpoint`, `deviceToken`, `publicKeyB64`, optional `pairedDeviceId`, scope, and an optional Relay offer. This is an authorization-bearing QR, not a host-only QR followed by a six-digit Mac confirmation code. Direct pairing authenticates over WebSocket with a pinned Curve25519 public key; the inspected direct primitives use TweetNaCl Curve25519 and XSalsa20-Poly1305. Relay uses a separate framing-v2/session implementation and cloud credential provisioning. Relay invite validation permits at most ten minutes plus clock skew.

The current KronTerm host bridge instead exchanges a six-digit pairing code over HTTP and returns its own bearer token. Copying the Orca offer parser alone cannot connect that bridge: its WebSocket runtime, key handling, device registry, credential reconciliation and RPC wire contract would also need adaptation on both ends. The camera/paste/log/retry UI can be recreated faithfully while retaining the existing bridge and clearly presenting LAN pairing. A Relay option must remain unavailable until an actual compatible backend exists.

Orca's phone components depend on React Native, Expo Router, Expo Camera, Expo Crypto and native safe-area APIs; KronTerm's client uses React DOM/Capacitor. The component source is not directly importable. A Capacitor camera scanner and DOM layout are needed for equivalent phone behavior.

## License and unknowns

The inspected root `../orca/LICENSE` is MIT, copyright 2026 Lovecast Inc. Copies or substantial portions must retain its copyright and permission notice. Check component-local third-party notices before transplanting dependencies; the root notice does not establish rights to every bundled asset.

This investigation did not execute pairing, inspect OpenMausBot, verify deployed Relay availability, audit the full encryption protocol, or demonstrate native camera permissions on the user's iPhone. Those remain separate verification work.
