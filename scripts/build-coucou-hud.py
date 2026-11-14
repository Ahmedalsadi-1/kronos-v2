#!/usr/bin/env python3
"""Build the user's local Coucou companion; assets are never added to release packages."""
import pathlib
import os
import re
import platform
import plistlib
import json
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
REVISION = "8a5c26328bd6409ff873e6f66bdc2e6ba004c856"
OUTPUT = pathlib.Path(os.environ.get("KRONTERM_COUCOU_OUTPUT", str(ROOT / ".local/coucou-hud/Coucou.app"))).expanduser().resolve()
ASSET_REVISION = OUTPUT.parent / "assets-revision"
CACHED_ASSETS = ASSET_REVISION.exists() and ASSET_REVISION.read_text().strip() == REVISION and all((OUTPUT / "Contents/Resources" / name).exists() for name in [
    "sounds", "MenuBarIcon.png", "MenuBarIcon@2x.png", "MenuBarIcon@3x.png", "AppIcon.png"
])
SDK = pathlib.Path(subprocess.check_output(["xcrun", "--show-sdk-path"], text=True).strip())
with tempfile.TemporaryDirectory(prefix="kronterm-coucou-") as directory:
    source = pathlib.Path(directory) / "source"
    local_source = os.environ.get("KRONTERM_COUCOU_SOURCE")
    if local_source:
        paths = ["LICENSE", "LICENSE-ASSETS.md", "NotchBuddy/Sources/App", "NotchBuddy/Resources/Info.plist"]
        if not CACHED_ASSETS:
            paths += ["NotchBuddy/Resources/sounds", "NotchBuddy/Assets.xcassets/MenuBarIcon.imageset", "NotchBuddy/Assets.xcassets/AppIcon.appiconset/icon_512x512.png"]
        files = subprocess.check_output(["git", "-C", local_source, "ls-tree", "-r", "--name-only", REVISION, *paths], text=True).splitlines()
        source.mkdir()
        for filename in files:
            target = source / filename
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(subprocess.check_output(["git", "-C", local_source, "show", f"{REVISION}:{filename}"]))
    else:
        subprocess.run(["git", "init", str(source)], check=True)
        subprocess.run(["git", "-C", str(source), "remote", "add", "origin", "https://github.com/Louis-CFM/coucou.git"], check=True)
        subprocess.run(["git", "-C", str(source), "fetch", "--depth", "1", "--filter=blob:none", "origin", REVISION], check=True)
        subprocess.run(["git", "-C", str(source), "sparse-checkout", "init", "--no-cone"], check=True)
        subprocess.run([
            "git", "-C", str(source), "sparse-checkout", "set", "--no-cone",
            "/LICENSE", "/LICENSE-ASSETS.md", "/NotchBuddy/Sources/App/",
            "/NotchBuddy/Resources/Info.plist",
            *([] if CACHED_ASSETS else [
                "/NotchBuddy/Resources/sounds/",
                "/NotchBuddy/Assets.xcassets/MenuBarIcon.imageset/",
                "/NotchBuddy/Assets.xcassets/AppIcon.appiconset/icon_512x512.png"
            ])
        ], check=True)
        subprocess.run(["git", "-C", str(source), "checkout", "--detach", REVISION], check=True)
    app = source / "NotchBuddy"
    engine = app / "Sources/App/BotEngine.swift"
    text = engine.read_text()
    marker = "        let bodyPath = mochiPath(rx: rx, ry: ry, morph: morph, R: R)"
    assert marker in text, "Upstream companion body path changed"
    text = text.replace(marker, """        var bodyPath = mochiPath(rx: rx, ry: ry, morph: morph, R: R)
        if morph < 0.3 {
            let earHeight = (1 - morph / 0.3) * ry * 0.36
            for side: CGFloat in [-1, 1] {
                var ear = Path()
                ear.move(to: CGPoint(x: side * rx * 0.86, y: -ry * 0.5))
                ear.addQuadCurve(to: CGPoint(x: side * rx * 0.8, y: -ry - earHeight),
                                 control: CGPoint(x: side * rx, y: -ry - earHeight))
                ear.addLine(to: CGPoint(x: side * rx * 0.35, y: -ry * 0.78))
                ear.closeSubpath()
                bodyPath.addPath(ear)
            }
        }""", 1)
    engine.write_text(text)
    delegate = app / "Sources/App/AppDelegate.swift"
    text = delegate.read_text()
    assert "setupIsland()\n" in text, "Upstream launch hook changed"
    text = text.replace("setupIsland()\n", "setupIsland()\n        KronTermBridge.shared.start(controller: islandController)\n", 1)
    delegate.write_text(text)
    content = app / "Sources/App/IslandViewContent.swift"
    text = content.read_text()
    assert "case .prompt:    PromptView(state: state)" in text, "Upstream chat entry changed"
    text = text.replace(
        "case .prompt:    PromptView(state: state)",
        'case .prompt:    KronTermPromptView().onAppear { state.isPinned = true }'
    )
    text = text.replace("case .overview:  OverviewView(state: state)", "case .overview:  KronTermOverviewView(presentation: .overview)")
    text = text.replace("case .empty:     EmptyStateView(state: state)", "case .empty:     KronTermOverviewView(presentation: .empty)")
    content.write_text(text)
    header = app / "Sources/App/IslandRootView.swift"
    text = header.read_text()
    marker = 'TabButton(icon: "plus", view: .upload, state: state)'
    assert marker in text, "Upstream header changed"
    text = text.replace(marker, marker + '\n                KronTermLaunchers()\n                if KronTermBridge.shared.browserDetached { KronTermBrowserTabs() }\n                KronTermBrowserAddressBar()')
    chat_button = r'TabButton\(icon: "bubble.left.fill", view: \.prompt, state: state, preAction: \{.*?\n                \}\)'
    text, chat_replacements = re.subn(chat_button, "KronTermChatButton()", text, count=1, flags=re.S)
    assert chat_replacements == 1, "Upstream chat button changed"
    settings_button = '''                Button(action: {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        state.view = .settings
                    }
                }) {
                    Image(systemName: state.view == .settings ? "gearshape.fill" : "gearshape")
                        .font(.system(size: 14))
                        .foregroundColor(state.view == .settings ? Color(hex: "#F5F6F8") : Color(hex: "#8E939C"))
                }
                .buttonStyle(.plain)'''
    assert settings_button in text, "Upstream settings button changed"
    text = text.replace(settings_button, "                KronTermSettingsButton()", 1)
    text = text.replace('TabButton(icon: "house.fill", view: .overview, state: state)', 'if !KronTermBridge.shared.browserDetached { TabButton(icon: "house.fill", view: .overview, state: state) }')
    text = text.replace('TabButton(icon: "plus", view: .upload, state: state)', 'if !KronTermBridge.shared.browserDetached { TabButton(icon: "plus", view: .upload, state: state) }')
    text = text.replace('KronTermLaunchers()', 'if !KronTermBridge.shared.browserDetached { KronTermLaunchers() }')
    text = text.replace('KronTermSettingsButton()', 'if !KronTermBridge.shared.browserDetached { KronTermSettingsButton() }')
    height_formula = '''        let base: CGFloat = 240
        let perMsg: CGFloat = 40
        return min(300, base + CGFloat(state.chatHistory.count) * perMsg)'''
    assert height_formula in text, "Upstream prompt geometry changed"
    text = text.replace("struct IslandContainer: View {", "struct IslandContainer: View {\n    @ObservedObject private var kronterm = KronTermBridge.shared")
    assert ".fill(Color.black)" in text, "Upstream shell material changed"
    text = text.replace(".fill(Color.black)", ".fill(state.mode == .expanded ? kronterm.contentColor : Color.black)", 1)
    text = text.replace(".frame(width: islandWidth, height: islandHeight, alignment: .topLeading)",
                        ".frame(width: islandWidth, height: islandHeight, alignment: .topLeading)\n        .preferredColorScheme(kronterm.colorScheme)", 1)
    text = text.replace(height_formula, "        return kronterm.voice.active && !kronterm.voiceExpanded ? 160 : kronterm.chatSize.1")
    text = text.replace(".onChange(of: state.chatHistory.count)", ".onChange(of: kronterm.voice.active && !kronterm.voiceExpanded)")
    text = text.replace(
        '.opacity(uploadActive || greetingActive ? 0 : 1)',
        '.opacity(uploadActive || greetingActive || state.view == .prompt ? 0 : 1)'
    )
    marker = '        .onAppear {\n            let (w, h) = islandSize'
    assert marker in text, "Upstream overview geometry hook changed"
    text = text.replace(marker, '        .onChange(of: kronterm.widgetDocked) { _, _ in\n            guard state.mode == .expanded else { return }\n            let (w, h) = islandSize(mode: .expanded, view: state.view)\n            withAnimation(kronterm.reducedMotion ? nil : .spring(response: 0.4, dampingFraction: 1)) { islandWidth = w; islandHeight = h }\n        }\n' + marker, 1)
    text = text.replace('.onChange(of: kronterm.widgetDocked)', r'.onChange(of: "\(kronterm.widgets.count):\(kronterm.widgetDocked):\(kronterm.browserDetached):\(kronterm.previewView):\(kronterm.workspaceLarge):\(kronterm.chatExpanded):\(kronterm.screenRevision):\(kronterm.devicePlatform)")', 1)
    marker = '    let resting = IslandRestingLayout(width: islandW, height: islandH)'
    assert marker in text, "Upstream pet geometry changed"
    text = text.replace(marker, '    if mode == .expanded && (view == .overview || view == .empty) && !KronTermBridge.shared.widgets.isEmpty && !KronTermBridge.shared.voice.active { return KronTermBridge.shared.browserDetached ? (0, 0, 0, 0) : (108, 110, 68, 1) }\n' + marker, 1)
    text = text.replace('func botPosition(mode:', '@MainActor\nfunc botPosition(mode:', 1)
    text = text.replace('struct IslandContentView: View {', 'struct IslandContentView: View {\n    @ObservedObject private var kronterm = KronTermBridge.shared')
    marker = 'let isTall = v == .prompt || (v == .mail && active)'
    assert marker in text, "Upstream content sizing changed"
    text = text.replace(marker, marker + ' || ((v == .overview || v == .empty) && active && !kronterm.widgets.isEmpty)')
    text = text.replace("state.mode == .expanded ? 320 : islandHeight", "islandHeight")
    header.write_text(text)
    controller = app / "Sources/App/IslandWindowController.swift"
    text = controller.read_text()
    text = text.replace("let panelH: CGFloat = 320", "let panelH: CGFloat = min(850, screen.frame.height)")
    text = text.replace("let panelW: CGFloat = 720", "let panelW: CGFloat = min(1280, screen.frame.width)")
    text = text.replace(
        '''            let base: CGFloat = 240
            let perMsg: CGFloat = 40
            islandH = min(300, base + CGFloat(s.chatHistory.count) * perMsg)''',
        "            islandH = KronTermBridge.shared.voice.active && !KronTermBridge.shared.voiceExpanded ? 160 : KronTermBridge.shared.chatSize.1"
    ).replace(
        '''            let base: CGFloat = 240
            let perMsg: CGFloat = 40
            h = min(300, base + CGFloat(s.chatHistory.count) * perMsg)''',
        "            h = KronTermBridge.shared.voice.active && !KronTermBridge.shared.voiceExpanded ? 160 : KronTermBridge.shared.chatSize.1"
    )
    marker = '        let layout = IslandConst.viewLayouts[view]!'
    assert marker in text, "Upstream island sizing changed"
    text = text.replace(marker, '        if view == .prompt { return (KronTermBridge.shared.chatSize.0, KronTermBridge.shared.voice.active && !KronTermBridge.shared.voiceExpanded ? 160 : KronTermBridge.shared.chatSize.1) }\n        if !KronTermBridge.shared.widgets.isEmpty && (view == .overview || view == .empty) { return KronTermBridge.shared.workspaceSize }\n' + marker, 1)
    marker = '                    self.state.promptContext = ctx'
    assert marker in text, "Upstream pet drop hook changed"
    text = text.replace(marker, marker + '\n                    KronTermBridge.shared.attach(ctx)', 1)
    text = text.replace('func islandSize(mode:', '@MainActor\nfunc islandSize(mode:', 1)
    text = text.replace("let islandLeft = (panelW - IslandConst.expandedWidth) / 2", "let islandLeft = (panelW - islandSize(mode: state.mode, view: state.view).0) / 2")
    hover_start = text.index("        // Feed FSM hover enter/leave")
    hover_end = text.index("        // Bot-head hover", hover_start)
    text = text[:hover_start] + """        // Dwell filters pass-through movement; click and drag paths remain immediate.
        let entered = krontermHover.update(inside: inIsland && !inAttachDrag,
            x: Double(mouse.x), y: Double(mouse.y), time: CACurrentMediaTime())
        let previouslyInIsland = wasInIsland
        wasInIsland = inIsland
        if entered {
            if fsm.state == .coucou {
                NotificationCenter.default.post(name: .greetingHover, object: nil)
            }
            fsm.mouseEntered()
        }
        if !inIsland && previouslyInIsland { fsm.mouseLeft() }

""" + text[hover_end:]
    text = text.replace("    private var wasInIsland = false", "    private var wasInIsland = false\n    private var krontermHover = KronTermPointerRest()", 1)
    controller.write_text(text)
    OUTPUT.joinpath("Contents/MacOS").mkdir(parents=True, exist_ok=True)
    resources = OUTPUT / "Contents/Resources"
    resources.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / "frontend/hermes/themes/coucou-palettes.json", resources / "coucou-palettes.json")
    shutil.copytree(ROOT / "native/coucou/agent-logos", resources / "agent-logos", dirs_exist_ok=True)
    for name in ["LICENSE", "LICENSE-ASSETS.md"]:
        shutil.copy2(source / name, resources / name)
    if not CACHED_ASSETS:
        shutil.copytree(app / "Resources/sounds", resources / "sounds", dirs_exist_ok=True)
        for suffix in ["", "@2x", "@3x"]:
            shutil.copy2(app / f"Assets.xcassets/MenuBarIcon.imageset/menubar{suffix}.png", resources / f"MenuBarIcon{suffix}.png")
        shutil.copy2(app / "Assets.xcassets/AppIcon.appiconset/icon_512x512.png", resources / "AppIcon.png")
        ASSET_REVISION.write_text(REVISION + "\n")
    info = plistlib.loads((app / "Resources/Info.plist").read_bytes())
    info["CFBundleIconFile"] = "AppIcon.png"
    info["CFBundleDevelopmentRegion"] = "en"
    info["CFBundleExecutable"] = "Coucou"
    info["CFBundleIdentifier"] = "dev.kronterm.local-coucou-hud"
    (OUTPUT / "Contents/Info.plist").write_bytes(plistlib.dumps(info))
    sources = sorted((app / "Sources/App").glob("*.swift"))
    for source_file in sources:
        text = source_file.read_text()
        text = re.sub(r"\.animation\((?!\s*(?:[A-Za-z_]\w*\s*:|\)))", ".animation(KronTermBridge.shared.reducedMotion ? nil : ", text)
        text = re.sub(r"withAnimation\((?!\s*\))", "withAnimation(KronTermBridge.shared.reducedMotion ? nil : ", text)
        text = text.replace("paused: state.mode == .hidden", "paused: KronTermBridge.shared.reducedMotion || state.mode == .hidden")
        if source_file.name == "IslandViewContent.swift":
            text = text.replace("TimelineView(.animation)", "TimelineView(.animation(minimumInterval: KronTermBridge.shared.reducedMotion ? 1 : nil))")
        else:
            text = text.replace("TimelineView(.animation)", "TimelineView(.animation(paused: KronTermBridge.shared.reducedMotion))")
        if source_file.name == "BotCanvasView.swift":
            for view in ["BotCanvasView", "MiniBotCanvasView"]:
                text = text.replace(f"struct {view}: View {{", f"struct {view}: View {{\n    @ObservedObject private var krontermMotion = KronTermBridge.shared")
            text = text.replace("KronTermBridge.shared.reducedMotion", "krontermMotion.reducedMotion")
            marker = ": nil\n                engine.update(dt: dt)"
            assert marker in text, "Upstream main Mochi colour hook changed"
            text = text.replace(marker, ": (krontermMotion.paletteName == \"coucou\" ? nil : cgColorFromHex(krontermMotion.accentHex))\n                engine.update(dt: dt)", 1)
        if source_file.name == "BotEngine.swift":
            marker = "        let dtCG = CGFloat(dt)"
            assert marker in text, "Upstream bot update changed"
            text = text.replace(marker, marker + """
        if KronTermBridge.shared.reducedMotion {
            tweens.removeAll()
            locks.removeAll()
            particles.removeAll()
            col = colT
            tint = cfg.tint
            tilt = cfg.tilt
            ox = 0; oy = 0; roll = 0; sx = 1; sy = 1; open = 1
            badgeS = badge == nil ? 0 : 1
            eyeOverride = permanentEye
            lastTime = now
            return
        }
""", 1)
        if source_file.name in ["IslandRootView.swift", "IslandWindowController.swift"]:
            # Use the same spring on reversal so SwiftUI retains presentation velocity.
            text = re.sub(r"\.spring\(response: ([0-9.]+), dampingFraction: [0-9.]+\)",
                          r".spring(response: \1, dampingFraction: 1)", text)
            text = text.replace(".timingCurve(0.45, 0, 0.2, 1, duration: 0.34)",
                                ".spring(response: 0.5, dampingFraction: 1)")
        source_file.write_text(text)
    compiler_flags = ["-explicit-module-build", "-j", "4"]
    developer = pathlib.Path(subprocess.check_output(["xcode-select", "-p"], text=True).strip())
    swift_headers = developer / "usr/include/swift"
    old_map = swift_headers / "module.modulemap"
    new_map = swift_headers / "bridging.modulemap"
    if old_map.exists() and new_map.exists() and "module SwiftBridging" in old_map.read_text():
        # CLT upgrades can leave the obsolete map beside its replacement.
        empty_map = pathlib.Path(directory) / "empty.modulemap"
        empty_map.write_text("")
        overlay = pathlib.Path(directory) / "swift-overlay.json"
        overlay.write_text(json.dumps({"version": 0, "roots": [{
            "type": "file", "name": str(old_map), "external-contents": str(empty_map)
        }]}))
        compiler_flags.extend(["-vfsoverlay", str(overlay)])
    bridge_source = pathlib.Path(directory) / "bridge-source"
    bridge_source.mkdir()
    for bridge_file in (ROOT / "native/coucou").glob("*.swift"):
        shutil.copy2(bridge_file, bridge_source / bridge_file.name)
    compiled_binary = pathlib.Path(directory) / "Coucou"
    subprocess.run([
        "swiftc", "-sdk", str(SDK), "-whole-module-optimization", "-g", "-swift-version", "6", "-target", f"{platform.machine()}-apple-macosx15.0",
        *compiler_flags,
        *map(str, sources), *map(str, sorted(bridge_source.glob("*.swift"))),
        "-o", str(compiled_binary)
    ], check=True)
    # Replacing the executable atomically preserves pages mapped by a running companion.
    staged_binary = OUTPUT / "Contents/MacOS" / f"Coucou.{os.getpid()}.next"
    shutil.copy2(compiled_binary, staged_binary)
    staged_binary.replace(OUTPUT / "Contents/MacOS/Coucou")
    symbols = pathlib.Path(directory) / "Coucou.dSYM"
    if symbols.exists():
        destination = OUTPUT / "Contents/MacOS/Coucou.dSYM"
        if destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(symbols, destination)
        dwarf = destination / "Contents/Resources/DWARF"

    subprocess.run(["codesign", "--force", "--sign", "-", str(OUTPUT)], check=True)
print(OUTPUT)
