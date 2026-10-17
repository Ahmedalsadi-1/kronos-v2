# Test KronTerm on your iPhone

The minimalist client lives in `mobile/`. It connects to real KronosCode hosts and presents their Browser, Sandbox, Terminal, and Labs phone surfaces. Local files and the bundled iPhone shell remain available from Workspace. It does not create pretend bot conversations or emulator sessions.

## Browser preview

Run `npm --prefix mobile run dev`. Open the network URL printed by Vite in Safari on an iPhone on the same network. This tests the web interface, pairing flow, and remote surfaces. Safari cannot test this app's native shell, WidgetKit extension, Dynamic Island, or native notifications. A managed HTTPS host or an explicitly paired KronLink host is needed for agent work.

## Native install

1. Install Xcode with an iOS SDK supporting the iOS version on your iPhone 17 Pro. Select its developer directory if macOS still points to Command Line Tools.
2. Run `npm --prefix mobile run ios:sync`, then `npm --prefix mobile run ios:open`.
3. Connect and trust the iPhone. Enable Developer Mode in Settings > Privacy & Security when prompted.
4. In Xcode, assign the App and KronTermWidgets targets to the same signing team. Use unique bundle IDs if these IDs belong to another team. Configure the `group.dev.kronterm.iphone` App Group for both targets; if changing the group, update both entitlements and `Shared/workspace-state.swift`.
5. Select the App scheme and your connected iPhone as the run destination, then Run. Any signing or capability errors need to be resolved for the selected team. A Personal Team may be sufficient for basic app testing; do not assume all extension capabilities are available to that team.
6. Pair a compatible host in the app. Add the KronTerm widget from the Home or Lock Screen widget picker. Start a real agent task to create its Live Activity.
7. In Workspace > Add surface, choose Enable task notifications to request notification permission explicitly.

## What to exercise

- Start a task, switch to Workspace, and open a browser or sandbox card. Cards show actual screenshots when available; otherwise they show an honest empty preview.
- Use browser navigation and page controls. Sandbox and phone control requires an explicit control lease; return to watch mode afterward.
- Open a remote terminal and run a harmless command. Open local files from the Workspace local-tools link.
- Open Devices only when a Labs phone bridge is connected. No emulator is started on the iPhone itself.
- Switch apps during a running task and inspect Dynamic Island and the Lock Screen. Tap the activity or widget to resume the validated host/session surface.
- Disconnect the host, reconnect, and check that drafts and read-only mode survive.
- Exercise larger accessibility text, VoiceOver, landscape, and keyboard transitions on device.

## Current verification boundary

The TypeScript build and web/host regression suites were run, and phone-sized web screens were inspected. Xcode and the iOS SDK were unavailable on the implementation host. Native code has been statically reviewed and project/plist syntax checked, but has not been compiled or run on a device.

System surfaces display a shared task summary and open the app. They do not embed a remote desktop in the Island. Local notifications cover tracked task transitions received while the app is running; APNs registration and server-driven background updates are not implemented. When suspended, the displayed summary can become stale. Native pause/approval actions, a large widget, and Control Center/StandBy-specific controls are not implemented in this slice.

The reconstruction uses the approved mockup and publicly observed Grok Bot store screenshots as visual references. No installed Grok Bot binary or iPhone runtime was required or analyzed, and no private Grok implementation claims are made.

Apple references: [Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device/), [running on a device](https://help.apple.com/xcode/mac/current/en.lproj/dev5a825a1ca.html), [App Groups](https://developer.apple.com/documentation/xcode/configuring-app-groups).

## USB check, October 14, 2026

The iPhone is now detected and `idevicepair validate` succeeds. A valid Apple Development identity is present. The selected developer directory remains `/Library/Developer/CommandLineTools`; no full Xcode installation or signed KronTerm IPA was found in the inspected Applications/Downloads/Desktop locations. The app has not been installed. Current web assets have been built and synchronized into the iOS project.

Install full Xcode with iOS support from https://developer.apple.com/xcode/, open `mobile/ios/App/App.xcodeproj`, select the connected phone and configure signing for the app and widget extension. Build and run to verify native keyboard and Safari presentation. After exporting a device-provisioned signed KronTerm IPA, `node mobile/scripts/install-iphone.mjs /absolute/path/KronTerm.ipa` uses ideviceinstaller. ipatool cannot download this unpublished KronTerm build.
