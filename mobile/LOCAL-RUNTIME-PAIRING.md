# Local runtime and Mac pairing

## Implemented source

- Local console VM starts without connecting to saved host profiles. Commands and files execute on the device's v86
  runtime; no Mac backend is involved in those tools.
- Agent tab accepts an explicit HTTPS OpenAI-compatible chat-completions endpoint, model and API key. Its adapter
  handles `vm_exec`, `vm_read_file` and `vm_write_file` calls locally. Model computation occurs at the configured API;
  this build does not contain an offline model. Prompts and tool results are sent to that endpoint.
- Credentials use device-only Keychain storage in the native app, or session storage in the browser prototype.
- Code tools default to the saved phone console VM. Disposable execution remains selectable. Completed persistent
  calls save a checkpoint. Cancellation or timeout interrupts and pauses the persistent guest; review partial work
  before continuing. Calls in disposable guests destroy that guest at completion.
- Browser tabs render on the phone using sandboxed frames; sites may refuse embedding. They are outside Linux and
  have network access. VM networking remains disabled.
- Mac connections are explicit per launch. Choose a saved host's Connect button, or pair it again. Returning to local
  mode closes gateways and clears remote widget snapshots.

## Pair the Mac

Start the connector on the Mac with its real KronTerm/KronosCode HTTP backend as `--upstream`:

```sh
npm --prefix mobile run host -- --lan --upstream http://127.0.0.1:YOUR_BACKEND_PORT
```

Open http://127.0.0.1:4119/pair on that Mac. Scan the QR using the iPhone camera and open KronTerm. Enter the six-digit
code shown on the Mac. The QR carries only the LAN address and expiry, not a bearer token or the pairing code.
The existing pairing endpoint verifies the code and issues the stored host token. The pairing page is loopback-only;
the connector's authenticated widget endpoints are LAN-visible only when `--lan` is selected.

The code expires after 15 minutes. Restart the connector for a new code. Both devices must be on the same trusted
local network. The prototype LAN pairing transport is HTTP; it does not authenticate the network with TLS.
QR scanning/deep links still need a signed native build for physical-device verification. Pasting the QR link into
the host sheet exercises the parser in the browser prototype.

## Native installation status

`ipatool` and `ideviceinstaller` are installed. `ipatool` downloads App Store apps; KronTerm is not published there,
so it cannot supply this app's IPA. Full Xcode with an iOS SDK, a development signing identity and a provisioning
profile covering the device are needed to build/export KronTerm's IPA.

Readiness check:

```sh
node mobile/scripts/install-iphone.mjs --check
```

Once a device-provisioned signed IPA exists and the iPhone is connected/trusted:

```sh
node mobile/scripts/install-iphone.mjs /absolute/path/KronTerm.ipa
```

The script verifies the app bundle identity and provisioning-profile presence, then invokes
`ideviceinstaller -u DEVICE_UDID install IPA_PATH`. Installation failure propagates; it does not bypass signing.

## Remaining limits

The graphical Tiny Core guest is still separate from the saved console guest used by model tools. It has no tool
service, checkpoint or file-transfer integration. A single persistent graphical VM shared by terminal, desktop,
browser and tools is not implemented. UTM integration is also not compiled. Browser verification establishes
prototype behavior, not physical iPhone or Android performance. Model-provider interoperability requires a real
configured endpoint; the adapter currently uses fetch and is subject to its CORS policy.
