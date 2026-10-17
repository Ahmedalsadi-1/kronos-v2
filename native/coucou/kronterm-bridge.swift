import AppKit
import Combine
import Foundation
import SwiftUI

struct KronTermMediaState: Decodable {
    let id: String
    let source: String
    let title: String
    let artist: String
    let playing: Bool
    let canSkip: Bool
}

struct KronTermCategory: Identifiable, Decodable {
    let id: String
    let name: String
    let detail: String
    let route: String
    let kind: String
}

struct KronTermWorkspace: Identifiable, Decodable {
    let id: String
    let name: String
    let selected: Bool
}

struct KronTermWidget: Identifiable, Decodable {
    let id: String
    let title: String
    let view: String?
    let paneCount: Int?
    let parentId: String?
}

struct KronTermAgent: Identifiable, Decodable {
    let id: String
    let name: String
    let backend: String
    let detail: String
    let phase: String
    let blockId: String?
}

struct WorkflowOption: Identifiable, Equatable {
    let id: String
    let label: String
    let kind: String?
}

struct KronTermExplorerEntry: Identifiable, Decodable {
    var id: String { path }
    let path: String
    let name: String
    let directory: Bool
    let depth: Int
    let expanded: Bool
}

struct KronTermExplorer: Decodable {
    let blockId: String
    let root: String
    let selected: String
    let entries: [KronTermExplorerEntry]
    let error: String
}

struct KronTermProductivity: Decodable {
    struct Focus: Decodable {
        let label: String
        let status: String
        let remainingMs: Double
        let updatedAt: Double
    }
    let focus: Focus?
    let openTasks: Int
    let dueTasks: Int
    let habits: Int
}

struct KronTermVoiceState: Equatable {
    var active = false
    var status = "idle"
    var transcript = ""
    var response = ""
    var error: String?
    var muted = false
    var level = 0.0
    var speechLevel = 0.0
    var speechAvailable = false
}

@MainActor
final class KronTermBridge: ObservableObject {
    static let shared = KronTermBridge()
    @Published var productivity: KronTermProductivity?
    @Published var agents: [KronTermAgent] = []
    @Published var explorer: KronTermExplorer?
    @Published var workspaces: [KronTermWorkspace] = []
    @Published var paletteName = "coucou"
    var accentHex: String { (KronTermPalette.all.first { $0.name == paletteName } ?? KronTermPalette.all[0]).accent }
    var accentColor: Color { Color(hex: accentHex) }
    @Published var devicePlatform = ""
    @Published var workspaceLarge = false
    @Published var screenRevision = 0
    @Published var categories: [KronTermCategory] = []
    @Published var selectedId: String?
    @Published var preview: NSImage?
    @Published var previewTitle = ""
    @Published var previewCount = 0
    @Published var previewLocation = ""
    @Published var previewView = ""
    @Published var browserURL = ""
    @Published var browserDetached = false
    @Published var browserCanGoBack = false
    @Published var browserCanGoForward = false
    @Published var browserLoading = false
    var microBrowser: Bool { browserDetached && !chatExpanded && !voice.active }
    var measuredChat: Bool { splitChat || (browserDetached && !voice.active) }
    @Published var previewSelected = 0
    @Published var previewExpanded = true
    @Published var previewStale = false
    @Published var widgets: [KronTermWidget] = []
    @Published var voice = KronTermVoiceState()
    @Published var voiceExpanded = false
    @Published var reducedMotion = false
    @Published var followAgent = false
    @Published var widgetFocused = false
    @Published var widgetDocked = false
    @Published var chatExpanded = true
    @Published var controlTarget = ""
    @Published var controlRoute = ""
    @Published var caption = ""
    @Published var media: KronTermMediaState?
    @Published var taskDetail = "Ready when you are"
    @Published var taskPhase = "idle"
    @Published var taskSteps: [String] = []
    @Published var workflowID = ""
    @Published var workflowTitle = ""
    @Published var workflowStep = ""
    @Published var workflowStatus = ""
    @Published var workflowQuestionID = ""
    @Published var workflowOptions: [WorkflowOption] = []
    weak var previewHost: NSView?
    weak var chatHost: NSView?
    private var lastPreviewLayout = ""
    private var lastChatLayout = ""
    private var chatLayoutRevision = 0
    private var chatLayoutProtocol = 1
    private var chatRequested = false
    private var subscriptions = Set<AnyCancellable>()
    private var parentTimer: Timer?
    private var lastPanelMode: IslandMode?
    private weak var controller: IslandWindowController?
    private var hasOpenedWorkspace = false
    private var voicePreviousView: IslandView?

    var chatSize: (CGFloat, CGFloat) {
        let screen = IslandWindowController.notchScreen() ?? NSScreen.main
        if browserDetached && !voice.active { return (min(680, (screen?.visibleFrame.width ?? 1000) - 24), min(440, (screen?.visibleFrame.height ?? 800) - 24)) }
        return (max(1, min(720, (screen?.visibleFrame.width ?? 1000) - 24)),
                max(1, min(760, (screen?.visibleFrame.height ?? 800) - 24)))
    }

    var splitChat: Bool {
        let view = AppState.shared.view
        return widgetDocked && !voice.active && (view == .overview || view == .empty)
    }
    var chatVisible: Bool {
        let state = AppState.shared
        return state.mode == .expanded && (state.view == .prompt || (splitChat && chatExpanded && (state.view == .overview || state.view == .empty)))
    }
    var isPhonePreview: Bool { devicePlatform == "android" || devicePlatform == "iphone" || previewView == "computers" }
    var railWidth: CGFloat {
        if isPhonePreview { return max(240, workspaceSize.0 - 410) }
        return chatExpanded && splitChat ? min(520, max(340, workspaceSize.0 * 0.44)) : 240
    }

    var workspaceSize: (CGFloat, CGFloat) {
        let screen = IslandWindowController.notchScreen() ?? NSScreen.main
        if browserDetached && !voice.active { return microBrowser ? (min(480, (screen?.visibleFrame.width ?? 1000) - 24), 64) : chatSize }
        let wide = ["web", "term", "preview", "codeeditor", "appstream", "installedapps", "linux-vms", "computers"].contains(previewView)
        return (min(workspaceLarge ? 1240 : wide ? 1100 : 900, (screen?.visibleFrame.width ?? 1000) - 24),
                min(workspaceLarge ? 800 : wide ? 680 : 540, (screen?.visibleFrame.height ?? 720) - 24))
    }

    func focusBrowserAddress() {
        controller?.window?.makeKey()
        controller?.fsm.cancelTimers()
    }

    func start(controller: IslandWindowController?) {
        guard ProcessInfo.processInfo.arguments.contains("--kronterm-hud") else { return }
        self.controller = controller
        let parent = getppid()
        NotificationCenter.default.publisher(for: NSApplication.didChangeScreenParametersNotification)
            .receive(on: DispatchQueue.main).sink { [weak self] _ in
                self?.screenRevision += 1
                self?.lastPreviewLayout = ""
                self?.fitPanel()
            }.store(in: &subscriptions)
        fitPanel()
        // The pipe stays private to the owning Electron process; no token or socket is exposed.
        DispatchQueue.global(qos: .utility).async {
            while let line = readLine() {
                Task { @MainActor in KronTermBridge.shared.receive(line) }
            }
        }
        parentTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak controller] _ in
            Task { @MainActor in
                if kill(parent, 0) != 0 { NSApp.terminate(nil); return }
                KronTermBridge.shared.reportPreviewLayout()
                KronTermBridge.shared.reportChatLayout()
                let state = AppState.shared
                if state.mode == .expanded && (state.view == .prompt || (state.isPinned && !KronTermBridge.shared.widgets.isEmpty)) { controller?.fsm.cancelTimers() }
            }
        }
        let state = AppState.shared
        state.$view.combineLatest(state.$mode)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] view, mode in
                self?.lastChatLayout = ""
                self?.reportChatLayout()
                if self?.lastPanelMode != mode { self?.fitPanel() }
                self?.lastPanelMode = mode
                if self?.widgetDocked == true {
                    self?.emit("action", action: mode == .expanded && (view == .overview || view == .empty) ? "dock-visible" : "dock-hidden")
                }
            }.store(in: &subscriptions)
        emit("ready")
    }

    private func pinWorkspace() {
        guard let controller else { return }
        // Align the hover state machine before expanding; its greeting timer otherwise folds the live preview.
        if controller.fsm.state == .coucou { controller.fsm.collapse() }
        controller.fsm.click()
        controller.expand(to: .overview)
        AppState.shared.isPinned = true
        controller.fsm.cancelTimers()
    }

    private func fitPanel() {
        // The collapsed island stays on the physical notch; the expanded panel follows
        // the display the pointer currently works on, like an OS HUD.
        guard let window = controller?.window else { return }
        let notchScreen = IslandWindowController.notchScreen() ?? NSScreen.main
        let expanded = AppState.shared.mode == .expanded
        let mouseScreen = expanded ? NSScreen.screens.first { $0.frame.contains(NSEvent.mouseLocation) } : nil
        let screen = mouseScreen ?? notchScreen
        guard let screen else { return }
        let width = min(1280, screen.frame.width)
        let height = min(850, screen.frame.height)
        window.setFrame(NSRect(x: screen.frame.midX - width / 2, y: screen.frame.maxY - height, width: width, height: height), display: true)
    }

    private func receive(_ line: String) {
        guard let data = line.data(using: .utf8),
              let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        if let version = value["chatLayoutProtocol"] as? Int, version >= 2, chatLayoutProtocol != version {
            chatLayoutProtocol = version
            lastChatLayout = ""
            reportChatLayout()
        }
        if let expanded = value["chatExpanded"] as? Bool {
            chatExpanded = expanded
            chatRequested = expanded
            lastChatLayout = ""
            reportChatLayout()
        }
        if value["chatLayout"] as? String == "toggle" {
            chatExpanded = true
            chatRequested = true
            AppState.shared.isPinned = true
            if AppState.shared.view == .prompt && widgetDocked {
                pinWorkspace()
            } else {
                controller?.expand(to: .prompt)
                controller?.fsm.cancelTimers()
            }
            lastChatLayout = ""
            reportChatLayout()
        }
        if value["showChat"] as? Bool == true {
            chatExpanded = true
            chatRequested = true
            AppState.shared.isPinned = true
            controller?.expand(to: .prompt)
            controller?.fsm.cancelTimers()
        }
        if let decoded = KronTermJSON.decode(KronTermProductivity.self, from: value["productivity"]) { productivity = decoded }
        if let appearance = value["appearance"] as? [String: Any] {
            reducedMotion = appearance["reducedMotion"] as? Bool ?? false
            if let name = appearance["theme"] as? String, KronTermPalette.all.contains(where: { $0.name == name }) {
                paletteName = name
            }
        }
        if let decoded = KronTermJSON.decode([KronTermCategory].self, from: value["categories"]) {
            categories = decoded
            if !categories.contains(where: { $0.id == selectedId }) { selectedId = categories.first?.id }
        }
        if let decoded = KronTermJSON.decode([KronTermAgent].self, from: value["agents"]) { agents = decoded }
        if value["explorer"] is NSNull { explorer = nil }
        if let decoded = KronTermJSON.decode(KronTermExplorer.self, from: value["explorer"]) { explorer = decoded }
        if let title = value["title"] as? String { previewTitle = title }
        if let location = value["location"] as? String { previewLocation = location }
        if let decoded = KronTermJSON.decode([KronTermWorkspace].self, from: value["workspaces"]) { workspaces = decoded }
        if let platform = value["devicePlatform"] as? String { devicePlatform = platform }
        if let view = value["view"] as? String { previewView = view }
        if let url = value["browserURL"] as? String { browserURL = url }
        if let back = value["browserCanGoBack"] as? Bool { browserCanGoBack = back }
        if let forward = value["browserCanGoForward"] as? Bool { browserCanGoForward = forward }
        if let loading = value["browserLoading"] as? Bool { browserLoading = loading }
        if let detached = value["browserDetached"] as? Bool, detached != browserDetached {
            browserDetached = detached
            lastChatLayout = ""
            if detached && !chatExpanded { controller?.expand(to: .overview) }
        }
        if let count = value["count"] as? Int { previewCount = count }
        if let selected = value["selected"] as? Int { previewSelected = selected }
        if let expanded = value["expanded"] as? Bool { previewExpanded = expanded }
        if let stale = value["stale"] as? Bool { previewStale = stale }
        if let decoded = KronTermJSON.decode([KronTermWidget].self, from: value["widgets"]) {
            widgets = decoded
            if !widgets.isEmpty && !hasOpenedWorkspace {
                hasOpenedWorkspace = true
                pinWorkspace()
            }
        }
        if value["preview"] != nil {
            preview = (value["preview"] as? String).flatMap { Data(base64Encoded: $0) }.flatMap { NSImage(data: $0) }
        }
        if let target = value["controlTarget"] as? String { controlTarget = target }
        if let route = value["controlRoute"] as? String { controlRoute = route }
        if let text = value["caption"] as? String { caption = text }
        if value.keys.contains("media") { media = KronTermJSON.decode(KronTermMediaState.self, from: value["media"]) }
        if let focused = value["widgetFocused"] as? Bool { widgetFocused = focused }
        if let workflow = value["workflow"] as? [String: Any] {
            workflowID = workflow["id"] as? String ?? ""
            workflowTitle = workflow["title"] as? String ?? ""
            workflowStep = workflow["step"] as? String ?? ""
            workflowStatus = workflow["status"] as? String ?? ""
            workflowQuestionID = workflow["questionId"] as? String ?? ""
            workflowOptions = (workflow["options"] as? [[String: Any]] ?? []).compactMap { option in
                guard let id = option["id"] as? String, let label = option["label"] as? String else { return nil }
                return WorkflowOption(id: id, label: label, kind: option["kind"] as? String)
            }
        } else if value["workflow"] is NSNull { workflowID = "" }
        if let activity = value["activity"] as? [String: Any] {
            taskDetail = activity["detail"] as? String ?? "Working…"
            taskPhase = activity["phase"] as? String ?? "running"
            taskSteps = activity["steps"] as? [String] ?? []
            let bot: BotState
            switch taskPhase {
            case "awaiting-approval": bot = .approval
            case "failed", "error": bot = .error
            case "succeeded", "finish": bot = .finished
            case "paused", "cancelled", "idle": bot = .idle
            case "degraded": bot = .question
            case "queued": bot = .thinking
            case "verifying": bot = .searching
            default: bot = taskDetail == "Thinking" ? .thinking : .working
            }
            AppState.shared.stateOverride = bot
        }
        if let follow = value["followAgent"] as? Bool {
            followAgent = follow
            if !follow { KronTermCursorFollower.shared.hide() }
        }
        if value.keys.contains("agentCursor") {
            if followAgent, let point = value["agentCursor"] as? [String: Double],
               let x = point["x"], let y = point["y"], x.isFinite, y.isFinite {
                KronTermCursorFollower.shared.follow(x: x, y: y)
            } else { KronTermCursorFollower.shared.hide() }
        }
        if let docked = value["widgetDocked"] as? Bool {
            widgetDocked = docked
            if docked {
                pinWorkspace()
            }
        }
        if let rawVoice = value["voice"] as? [String: Any] {
            let wasActive = voice.active
            voice = KronTermVoiceState(
                active: rawVoice["active"] as? Bool ?? false,
                status: rawVoice["status"] as? String ?? "idle",
                transcript: rawVoice["transcript"] as? String ?? "",
                response: rawVoice["response"] as? String ?? "",
                error: rawVoice["error"] as? String,
                muted: rawVoice["muted"] as? Bool ?? false,
                level: min(1, max(0, rawVoice["level"] as? Double ?? 0)),
                speechLevel: min(1, max(0, rawVoice["speechLevel"] as? Double ?? 0)),
                speechAvailable: rawVoice["speechAvailable"] as? Bool ?? false
            )
            if voice.active && !wasActive {
                voicePreviousView = AppState.shared.view
                AppState.shared.isPinned = true
                controller?.expand(to: .prompt)
                controller?.fsm.cancelTimers()
            } else if !voice.active && wasActive {
                voiceExpanded = false
                if let previous = voicePreviousView { controller?.expand(to: previous) }
                voicePreviousView = nil
            }
        }
    }

    func action(_ name: String, route: String? = nil) {
        if name == "chat" && splitChat {
            chatExpanded.toggle()
            chatRequested = true
            pinWorkspace()
            lastChatLayout = ""
            reportChatLayout()
            return
        }
        if name == "chat" && AppState.shared.view == .prompt && !voice.active {
            chatExpanded = false
            controller?.expand(to: .overview)
            emit("chat-close")
            return
        }
        if name == "voice-expand" || ((name == "chat" || name == "navigate") && voice.active) { voiceExpanded = true }
        if name == "navigate" && voice.active { voicePreviousView = .prompt }
        if name == "navigate" || name == "chat" || name == "voice-expand" {
            chatExpanded = true
            chatRequested = true
            AppState.shared.isPinned = true
            controller?.expand(to: .prompt)
            controller?.fsm.cancelTimers()
        }
        emit("action", action: name == "chat" && voice.active ? "voice-expand" : name, route: route)
    }

    func attach(_ context: PromptContext) {
        guard case let .window(appName, title, _) = context else { return }
        let target = ["application": appName, "window": title]
        guard let data = try? JSONSerialization.data(withJSONObject: target),
              let route = String(data: data, encoding: .utf8) else { return }
        action("pet-attach", route: route)
    }

    private var measuredChatFrame: NSRect? {
        guard let view = chatHost, let window = view.window,
              view.bounds.width > 0, view.bounds.height > 0 else { return nil }
        return window.convertToScreen(view.convert(view.bounds, to: nil)).integral
    }

    private func reportChatLayout() {
        let measured = measuredChat ? measuredChatFrame : nil
        let ready = chatVisible && (!measuredChat || measured != nil)
        let signature = "\(chatLayoutProtocol):\(chatRequested):\(chatVisible):\(splitChat):\(chatExpanded):\(workspaceSize.0):\(workspaceSize.1):\(screenRevision):\(devicePlatform):\(String(describing: measured))"
        guard signature != lastChatLayout else { return }
        lastChatLayout = signature
        chatLayoutRevision += 1
        if chatLayoutProtocol < 2 {
            if chatRequested && chatExpanded && ready { emit("chat-open") }
            else if !chatExpanded { emit("chat-close") }
            return
        }
        emit("chat-layout", extra: ["layoutRevision": chatLayoutRevision,
             "layoutReady": ready, "chatIntent": chatRequested && chatExpanded])
    }

    private func reportPreviewLayout() {
        guard let view = previewHost, let window = view.window,
              let primary = NSScreen.screens.first else { return }
        let frame = window.convertToScreen(view.convert(view.bounds, to: nil))
        let state = AppState.shared
        let visible = state.mode == .expanded && (state.view == .overview || state.view == .empty) && !voice.active
        let bounds: [String: Any] = ["previewX": frame.minX.rounded(),
            "previewY": (primary.frame.maxY - frame.maxY).rounded(),
            "previewWidth": frame.width.rounded(), "previewHeight": frame.height.rounded(),
            "previewVisible": visible]
        let signature = "\(frame.integral):\(visible)"
        guard frame.width > 0, frame.height > 0, signature != lastPreviewLayout else { return }
        lastPreviewLayout = signature
        emit("preview-layout", extra: bounds)
    }

    private func emit(_ event: String, action: String? = nil, route: String? = nil, extra: [String: Any] = [:]) {
        guard let screen = IslandWindowController.notchScreen() ?? NSScreen.main,
              let primary = NSScreen.screens.first else { return }
        let frame = screen.frame
        var message: [String: Any] = ["event": event, "x": frame.minX,
            "y": primary.frame.maxY - frame.maxY, "width": frame.width,
            "height": frame.height, "inset": max(24, screen.safeAreaInsets.top)]
        message["action"] = action
        message["route"] = route
        message["compactChat"] = browserDetached
        message["splitChat"] = measuredChat
        if measuredChat {
            if let content = measuredChatFrame {
                message["contentX"] = content.minX
                message["contentY"] = primary.frame.maxY - content.maxY
                message["contentWidth"] = content.width
                message["contentHeight"] = content.height
            } else if browserDetached {
                let top = primary.frame.maxY - frame.maxY + 52
                message["contentX"] = frame.midX - chatSize.0 / 2 + 14
                message["contentY"] = top
                message["contentWidth"] = chatSize.0 - 28
                message["contentHeight"] = max(1, chatSize.1 - 66)
            } else if event == "chat-open" { return }
        } else {
        message["contentX"] = frame.midX - chatSize.0 / 2 + 14
        message["contentY"] = primary.frame.maxY - frame.maxY + 52
        message["contentWidth"] = chatSize.0 - 28
        message["contentHeight"] = max(1, chatSize.1 - 66)
        }
        message.merge(extra) { _, next in next }
        guard let data = try? JSONSerialization.data(withJSONObject: message) else { return }
        FileHandle.standardOutput.write(data + Data([10]))
    }
}
