# Agentic OS implementation

Updated native simulator implementation, source reuse and real-device validation are recorded in [native-simulator-implementation.md](native-simulator-implementation.md). The entries below document the preceding milestone.

Implemented 2026-10-06 with three specialists and root integration.

## Available in this checkout

- Computers & Devices is a registered workspace app. Open Command Center with Cmd+Shift+Space, search Devices, and launch it. Existing blocks are focused instead of duplicated.
- iOS Simulator discovery, boot, shutdown, Simulator launch, and bounded PNG screenshots use Xcode's simctl on macOS.
- Optional existing Appium XCUITest and UiAutomator2 sessions expose screen capture, normalized touch, Unicode text input, and Android Back. These are Labs controls, with manually refreshed captures rather than live video.
- Device ownership generations reject stale requests and discard stale results. Taking control pauses Kronos device mutations until explicit user resume, including after an agent refreshes its target list. Manual controls stay available. This pause applies to KronTerm's adapter, not arbitrary external automation.
- Eight `device_*` tools expose these adapters through the existing authenticated native/MCP server. Mutations require the observed ownership generation; fullscreen agents need computer-control capability.
- Command Center Enter follows the focused row. Agent overlays clear on paused/terminal states and reject superseded runs.
- Phone companion controls reject expired leases, preserve failed text, ignore stale page responses, and keep Watch/Stop reachable with the keyboard open.

## Setup

Simulator lifecycle requires full Xcode, its selected developer directory, and an installed iOS runtime. An explicit setup error appears if simctl is unavailable.

For mobile app automation, start KronTerm with `KRONTERM_APPIUM_URL=http://127.0.0.1:4723`. Run and provision your existing local Appium session separately. Appium 3 session discovery must be explicitly enabled by the server operator. Only loopback HTTP with `/` or `/wd/hub` base paths is accepted. Physical iPhones require signed WebDriverAgent and device provisioning. The phone companion controls desktop surfaces and remains a separate connection.

## Proven upstream references

- [Orca simulator architecture](https://github.com/stablyai/orca/blob/main/skill-guides/orca-emulator.md): distinct simulator backends, device identity, bounded capabilities and normalized coordinates. No private Orca helper or sibling source was copied into core.
- [Appium discovery API](https://appium.io/docs/en/latest/reference/api/appium/): modern session discovery and explicit server feature requirement.
- [Appium XCUITest](https://github.com/appium/appium-xcuitest-driver): supported iOS automation through a separately provisioned driver session.
- [OpenMausBot companion model](https://github.com/milind-soni/OpenMausBot/blob/main/docs/ios-companion.md): preserve the distinction between phone-to-desktop access and controlling native phone applications.
- [OpenMuse](https://github.com/CopilotKit/openmuse): persistent task/artifact direction remains in the broader plan; its deployment stack has not been imported.

## Remaining scope

This implementation is the device/control and interaction milestone of the broader plan. Durable rich result cards, cross-device agent scheduling, continuous device streaming, agent profile memory, and routines are not implemented by this change. Full live Electron session preservation, real Simulator, and physical phone journeys still require runtime verification. This host does not have simctl or a running Appium device session.

## Validation

- Desktop TypeScript check passes. MCP TypeScript build passes.

- 55 desktop targeted tests pass across device runtime/protocol/IPC, tool server, registry, Computers state, shell focus and overlay lifecycle.
- All 71 MCP tests pass, including device tool schemas, routing, image results, authenticated forwarding and capability restrictions.
- All 30 mobile tests pass, plus the mobile TypeScript and production build.
- Interactive browser preview exercised capture, device selection, boot and setup-error recovery. Light and dark captures saved in `screenshots/` at 1280x800, 1440x900 and 1920x1080; 420x800 narrow layout has no horizontal overflow. Mock captures are explicitly labeled and do not verify real devices.
- Browser preview also exercises explicit takeover/resume and an increased-contrast/reduced-motion/reduced-transparency appearance.
