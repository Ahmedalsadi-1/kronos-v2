import SwiftUI

struct KronTermMediaIndicator: View {
    let media: KronTermMediaState
    @ObservedObject private var bridge = KronTermBridge.shared
    @State private var expanded = false
    var body: some View {
        Button { expanded.toggle() } label: {
            Image(systemName: media.playing ? "waveform" : "music.note")
                .foregroundStyle(bridge.accentColor)
                .frame(width: 32, height: 32)
        }.buttonStyle(.plain)
            .accessibilityLabel("Now Playing: \(media.title), \(media.playing ? "playing" : "paused")")
            .help("\(media.title) · \(media.artist.isEmpty ? media.source : media.artist)")
            .popover(isPresented: $expanded) {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 12) {
                        Image(systemName: "music.note").font(.system(size: 22))
                            .frame(width: 44, height: 44)
                            .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                        VStack(alignment: .leading, spacing: 4) {
                            Text(media.title).font(.system(size: 13, weight: .semibold)).lineLimit(2)
                            Text(media.artist.isEmpty ? media.source : media.artist)
                                .font(.system(size: 11)).foregroundStyle(Color(hex: "#B2B6C0")).lineLimit(1)
                        }
                    }
                    HStack {
                        Text(media.source).font(.system(size: 11)).foregroundStyle(Color(hex: "#B2B6C0"))
                        Spacer()
                        if media.canSkip {
                            Button { bridge.action("media-previous", route: media.id) } label: {
                                Image(systemName: "backward.end.fill").frame(width: 32, height: 32)
                            }.accessibilityLabel("Previous track")
                        }
                        Button { bridge.action("media-toggle", route: media.id) } label: {
                            Image(systemName: media.playing ? "pause.fill" : "play.fill")
                                .frame(width: 32, height: 32)
                        }.accessibilityLabel(media.playing ? "Pause media" : "Play media")
                        if media.canSkip {
                            Button { bridge.action("media-next", route: media.id) } label: {
                                Image(systemName: "forward.end.fill").frame(width: 32, height: 32)
                            }.accessibilityLabel("Next track")
                        }
                    }.buttonStyle(.plain)
                }.padding(16).frame(width: 260)
                    .foregroundStyle(Color(hex: "#F4F5F7"))
                    .background(Color(hex: "#141519"))
            }
    }
}

struct KronTermLaunchers: View {
    @ObservedObject private var bridge = KronTermBridge.shared
    private let items = [("globe", "web", "Browser"), ("folder.fill", "files", "Files"),
        ("terminal", "terminal", "Terminal"), ("desktopcomputer", "machines", "Sandbox"),
        ("display", "apps", "Streamed apps"), ("square.grid.2x2", "widget", "Widget"),
        ("rectangle.portrait.and.arrow.right", "exit", "Exit HUD")]
    var body: some View {
        HStack(spacing: 5) {
            ForEach(items, id: \.1) { item in
                Button {
                    AppState.shared.isPinned = true
                    AppState.shared.view = .overview
                    KronTermBridge.shared.action(item.1)
                } label: {
                    Image(systemName: item.0).font(.system(size: 12))
                        .foregroundStyle(Color(hex: "#8E939C"))
                        .frame(width: 28, height: 24)
                        .background(Color.white.opacity(0.06), in: Capsule())
                }.buttonStyle(.plain).help(item.2).accessibilityLabel(item.2)
            }
            KronTermProductivityControls()
            if bridge.widgetDocked {
                Divider().frame(height: 14).padding(.horizontal, 3)
                Button { bridge.action("preview-detach") } label: {
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 12)).frame(width: 28, height: 24)
                }.buttonStyle(.plain).help("Enlarge widget").accessibilityLabel("Enlarge widget")
                Button { bridge.action("preview-hide") } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 12)).frame(width: 28, height: 24)
                }.buttonStyle(.plain).help("Hide widget").accessibilityLabel("Hide widget")
            }
        }.padding(.leading, 8)
            .foregroundStyle(Color(hex: "#8E939C"))
    }
}

struct KronTermBrowserAddressBar: View {
    @ObservedObject private var bridge = KronTermBridge.shared
    @State private var address = ""
    @FocusState private var editing: Bool

    var body: some View {
        if bridge.previewView == "web" && (bridge.widgetDocked || (bridge.browserDetached && bridge.chatExpanded)) {
            HStack(spacing: 5) {
                navigationButton("arrow.left", action: "browser-back", label: "Go back", enabled: bridge.browserCanGoBack)
                navigationButton("arrow.right", action: "browser-forward", label: "Go forward", enabled: bridge.browserCanGoForward)
                navigationButton(bridge.browserLoading ? "xmark" : "arrow.clockwise", action: "browser-reload", label: bridge.browserLoading ? "Stop loading" : "Reload page")
                TextField("Search or enter address", text: $address)
                    .textFieldStyle(.plain)
                    .font(.system(size: 11))
                    .focused($editing)
                    .simultaneousGesture(TapGesture().onEnded {
                        bridge.focusBrowserAddress()
                        editing = true
                    })
                    .onSubmit {
                        bridge.action("browser-navigate", route: address)
                        editing = false
                    }
                    .padding(.horizontal, 8)
                    .frame(minWidth: 80, idealWidth: 150, maxWidth: 190)
                    .animation(bridge.reducedMotion ? nil : .timingCurve(0.16, 1, 0.3, 1, duration: 0.52), value: editing)
                    .frame(height: 24)
                    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 6))
                    .accessibilityLabel("Search or enter address")
            }
            .padding(.leading, 8)
            .foregroundStyle(Color(hex: "#D6D8DD"))
            .onAppear { address = bridge.browserURL }
            .onChange(of: bridge.browserURL) { _, url in
                if !editing { address = url }
            }
            .onChange(of: bridge.previewSelected) { _, _ in
                address = bridge.browserURL
                editing = false
            }
        }
    }

    private func navigationButton(_ icon: String, action: String, label: String, enabled: Bool = true) -> some View {
        Button { bridge.action(action) } label: {
            Image(systemName: icon).font(.system(size: 11)).frame(width: 20, height: 24)
        }.buttonStyle(.plain).disabled(!enabled).opacity(enabled ? 1 : 0.35).help(label).accessibilityLabel(label)
    }
}

struct KronTermBrowserTabs: View {
    @ObservedObject private var bridge = KronTermBridge.shared
    var body: some View {
        if bridge.previewView == "web" {
            HStack(spacing: 4) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(bridge.widgets.filter { $0.view == "web" }) { widget in
                            Button { bridge.action("browser-select:" + widget.id) } label: {
                                Label(widget.title, systemImage: "globe")
                                    .font(.system(size: 10)).lineLimit(1).frame(maxWidth: 156)
                                    .padding(.horizontal, 9).frame(height: 24)
                                    .background(bridge.widgets.indices.contains(bridge.previewSelected) && bridge.widgets[bridge.previewSelected].id == widget.id ? bridge.accentColor.opacity(0.22) : Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 7))
                            }.buttonStyle(.plain).help(widget.title).accessibilityLabel("Switch to " + widget.title)
                        }
                    }
                }.frame(minWidth: 80, idealWidth: bridge.browserDetached ? 190 : 260, maxWidth: bridge.browserDetached ? 210 : 340)
                Button { bridge.action("web-new") } label: { Image(systemName: "plus").frame(width: 22, height: 24) }
                    .buttonStyle(.plain).help("New browser tab").accessibilityLabel("New browser tab")
            }.foregroundStyle(Color(hex: "#D6D8DD"))
        }
    }
}

struct KronTermChatButton: View {
    @ObservedObject private var bridge = KronTermBridge.shared
    var body: some View {
        Button { bridge.action("chat") } label: {
            Image(systemName: bridge.chatVisible ? "bubble.left.fill" : "bubble.left")
                .font(.system(size: 14)).foregroundStyle(Color(hex: "#8E939C"))
                .frame(width: 28, height: 24)
        }.buttonStyle(.plain)
            .help(bridge.chatVisible ? "Collapse chat" : "Expand chat")
            .accessibilityLabel(bridge.chatVisible ? "Collapse chat" : "Expand chat")
    }
}

struct KronTermSettingsButton: View {
    @ObservedObject private var bridge = KronTermBridge.shared
    var body: some View {
        HStack(spacing: 12) {
            if let media = bridge.media { KronTermMediaIndicator(media: media) }
            Menu {
                ForEach(KronTermPalette.all) { palette in
                    Button {
                        bridge.action("theme-select", route: palette.name)
                    } label: {
                        Label(palette.label, systemImage: bridge.paletteName == palette.name ? "checkmark.circle.fill" : "circle")
                    }
                }
            } label: {
                Image(systemName: "paintpalette").foregroundStyle(bridge.accentColor)
            }.menuStyle(.borderlessButton).fixedSize().help("Coucou palette").accessibilityLabel("Choose Coucou palette")
            if !bridge.widgets.isEmpty {
                Button { bridge.action("follow-agent") } label: {
                    Image(systemName: "scope").foregroundStyle(bridge.followAgent ? bridge.accentColor : Color(hex: "#8E939C"))
                }.buttonStyle(.plain).help("Follow agent cursor with floating Coucou").accessibilityLabel("Follow agent cursor")
                    .accessibilityAddTraits(bridge.followAgent ? .isSelected : [])
                Button { bridge.workspaceLarge.toggle() } label: {
                    Image(systemName: bridge.workspaceLarge ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                }.buttonStyle(.plain).help(bridge.workspaceLarge ? "Restore notch size" : "Enlarge notch")
                    .accessibilityLabel(bridge.workspaceLarge ? "Restore notch size" : "Enlarge notch")
                Button { bridge.action("preview-detach") } label: {
                    Image(systemName: "arrow.up.right.square")
                }.buttonStyle(.plain).help("Detach preview").accessibilityLabel("Detach preview")
            }
            Button { KronTermBridge.shared.action("navigate", route: "/settings") } label: {
            Image(systemName: "gearshape").font(.system(size: 14))
                .foregroundStyle(Color(hex: "#8E939C"))
        }.buttonStyle(.plain).help("KronTerm and Hermes settings")
            .accessibilityLabel("Open KronTerm and Hermes settings")
        }.foregroundStyle(Color(hex: "#8E939C"))
    }
}

struct KronTermOverviewView: View {
    let presentation: IslandView
    @ObservedObject private var appState = AppState.shared
    @ObservedObject private var bridge = KronTermBridge.shared
    @State private var page = 0
    private var homeCategories: [KronTermCategory] { bridge.categories.filter { !$0.route.hasPrefix("/settings") } }
    private var pageCount: Int { max(1, Int(ceil(Double(homeCategories.count) / 4))) }
    private var selected: KronTermCategory? { homeCategories.first { $0.id == bridge.selectedId } ?? homeCategories.first }
    var body: some View {
        if bridge.browserDetached && !bridge.voice.active {
            if bridge.chatExpanded {
                KronTermChatGeometry(tracksLayout: appState.view == presentation)
                    .padding(12).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else { Color.clear }
        } else if !bridge.widgets.isEmpty && !bridge.voice.active {
            HStack(spacing: 10) {
                Group {
                    if bridge.splitChat && bridge.chatExpanded {
                        VStack(spacing: 10) {
                            KronTermProgressSummary()
                                .fixedSize(horizontal: false, vertical: true)
                            KronTermChatGeometry(tracksLayout: appState.view == presentation)
                                .frame(maxWidth: .infinity, minHeight: 160, maxHeight: .infinity)
                        }
                        .padding(.top, 118)
                        .padding(.horizontal, 12)
                        .padding(.bottom, 12)
                        .frame(maxHeight: .infinity)
                        .clipped()
                        .background(Color.white.opacity(0.025), in: RoundedRectangle(cornerRadius: 18))
                    } else { KronTermTaskCard() }
                }.frame(width: bridge.railWidth)
                KronTermPreviewView(tracksLayout: appState.view == presentation).transition(.opacity.combined(with: .move(edge: .trailing)))
            }
            .animation(bridge.reducedMotion ? nil : .spring(response: 0.4, dampingFraction: 1), value: bridge.previewView)
            .animation(bridge.reducedMotion ? nil : .spring(response: 0.4, dampingFraction: 1), value: bridge.widgetDocked)
            .animation(bridge.reducedMotion ? nil : .spring(response: 0.4, dampingFraction: 1), value: bridge.chatExpanded)
        } else if bridge.voice.active {
            KronTermVoiceCard(state: bridge.voice)
        } else {
        HStack(spacing: 10) {
            CardBackground(wash: nil) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(bridge.taskPhase == "idle" ? "KronTerm companion" : bridge.taskDetail).font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.white).lineLimit(1)
                    Text(bridge.taskPhase == "idle" ? "Drag me onto an app to work together" : bridge.taskSteps.dropLast().last ?? bridge.taskPhase.capitalized).font(.system(size: 11))
                        .foregroundStyle(Color(hex: "#8E939C")).lineLimit(2)
                    if let selected {
                        Button("Open \(selected.name)") {
                            bridge.action("navigate", route: selected.route)
                        }.buttonStyle(.plain).font(.system(size: 10)).foregroundStyle(bridge.accentColor)
                    }
                }.padding(.leading, 108).padding(.trailing, 12)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            }.frame(width: 322)
            CardBackground(wash: nil) {
                VStack(spacing: 3) {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4)], spacing: 4) {
                        ForEach(Array(homeCategories.dropFirst(page * 4).prefix(4))) { category in
                            Button {
                                bridge.selectedId = category.id
                                bridge.action("navigate", route: category.route)
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: category.kind == "plugin" ? "puzzlepiece.extension.fill" : "gearshape.fill")
                                        .foregroundStyle(category.kind == "plugin" ? bridge.accentColor : Color(hex: "#4DC8A0"))
                                    Text(category.name).lineLimit(1)
                                    Spacer(minLength: 0)
                                }.font(.system(size: 10, weight: .medium)).foregroundStyle(Color(hex: "#B9BDC5"))
                                    .padding(.horizontal, 7).frame(height: 27)
                                    .background(Color.black.opacity(0.35), in: Capsule())
                                    .overlay(Capsule().stroke(Color.white.opacity(bridge.selectedId == category.id ? 0.4 : 0.1)))
                            }.buttonStyle(.plain).help(category.detail)
                        }
                    }
                    if pageCount > 1 {
                        KronTermPageDots(page: $page, count: pageCount)
                    }
                }.padding(.horizontal, 8).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }.onChange(of: pageCount) { _, count in page = min(page, count - 1) }
        }
    }
}

struct KronTermVoiceCard: View {
    @ObservedObject private var bridge = KronTermBridge.shared
    let state: KronTermVoiceState

    var body: some View {
        CardBackground(wash: nil) {
            HStack(spacing: 18) {
                ZStack {
                    RoundedRectangle(cornerRadius: 16).fill(Color.white)
                    HStack(spacing: 14) {
                        Circle().frame(width: 5, height: 5)
                        Circle().frame(width: 5, height: 5)
                    }.foregroundStyle(.black).offset(y: state.status == "speaking" ? 3 : 10)
                    Capsule().fill(.black)
                        .frame(width: 11, height: state.status == "speaking" ? (bridge.reducedMotion || !state.speechAvailable ? 5 : 2 + CGFloat(state.speechLevel) * 10) : 2)
                        .offset(y: 20)
                        .animation(bridge.reducedMotion ? nil : .easeOut(duration: 0.08), value: state.speechLevel)
                }.frame(width: 74, height: 58)
                    .shadow(color: bridge.accentColor.opacity(0.3), radius: 8 + state.level * 20)
                VStack(alignment: .leading, spacing: 5) {
                    Text(state.muted ? "Microphone muted" : title)
                        .font(.system(size: 15, weight: .semibold)).foregroundStyle(.white).lineLimit(1)
                    Text(state.error ?? (state.transcript.isEmpty ? (state.status == "transcribing" ? "Transcribing…" : "Say something to KronTerm…") : "You: \(state.transcript)"))
                        .font(.system(size: 13)).foregroundStyle(Color.white.opacity(0.58)).lineLimit(1)
                    if !state.response.isEmpty {
                        Text("KronTerm: \(state.response)").font(.system(size: 13)).foregroundStyle(bridge.accentColor).lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                VStack(spacing: 6) {
                    Button { KronTermBridge.shared.action("voice-mute") } label: {
                        Image(systemName: state.muted ? "mic.slash.fill" : "mic.fill")
                    }.help(state.muted ? "Unmute microphone" : "Mute microphone")
                    Button { KronTermBridge.shared.action("voice-stop") } label: {
                        Image(systemName: "stop.fill")
                    }.help("End voice conversation")
                    if state.status == "speaking" || state.status == "thinking" || state.status == "error" {
                        Button { KronTermBridge.shared.action("voice-interrupt") } label: {
                            Image(systemName: state.status == "error" ? "arrow.clockwise" : "pause.fill")
                        }.help(state.status == "error" ? "Retry voice" : "Interrupt reply")
                    }
                }.buttonStyle(.plain).font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.65))
                Button { KronTermBridge.shared.action("voice-expand") } label: {
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                }.buttonStyle(.plain).help("Expand chat").foregroundStyle(Color.white.opacity(0.65))
            }.padding(.horizontal, 28).padding(.vertical, 18)
                .background(LinearGradient(colors: [Color.clear, Color(hex: "#6B2B55").opacity(0.5)], startPoint: .leading, endPoint: .trailing))
        }.padding(.horizontal, 12)
    }

    private var title: String {
        switch state.status {
        case "listening": return "Listening…"
        case "transcribing": return "Transcribing…"
        case "thinking": return "KronTerm is thinking"
        case "speaking": return "KronTerm is speaking"
        case "error": return "Voice unavailable"
        default: return "Voice ready"
        }
    }
}

struct KronTermPromptView: View {
    @ObservedObject private var bridge = KronTermBridge.shared
    var body: some View {
        VStack {
            if bridge.voice.active && !bridge.voiceExpanded { KronTermVoiceCard(state: bridge.voice).frame(height: 98) }
            if bridge.browserDetached && !bridge.voice.active {
                KronTermChatGeometry(tracksLayout: AppState.shared.view == .prompt)
                    .padding(.horizontal, 12).padding(.bottom, 12)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else { Spacer(minLength: 0) }
        }.clipped()
    }
}

struct KronTermPageDots: View {
    @Binding var page: Int
    let count: Int
    private var visiblePages: Range<Int> {
        let start = min(max(0, page - 2), max(0, count - 5))
        return start..<min(count, start + 5)
    }
    var body: some View {
        HStack(spacing: 7) {
            Button { page = max(0, page - 1) } label: {
                Image(systemName: "chevron.left").font(.system(size: 8, weight: .semibold))
                    .frame(width: 18, height: 18)
            }.buttonStyle(.plain).disabled(page == 0).accessibilityLabel("Previous category page")
            HStack(spacing: 7) {
                ForEach(visiblePages, id: \.self) { index in
                    Button { page = index } label: {
                        Circle()
                            .fill(index == page ? Color.clear : Color.white.opacity(0.7))
                            .overlay(Circle().stroke(index == page ? Color.white : Color.clear, lineWidth: 1))
                            .frame(width: 5, height: 5)
                            .frame(width: 8, height: 14)
                    }.buttonStyle(.plain).accessibilityLabel("Category page \(index + 1) of \(count)")
                        .accessibilityAddTraits(index == page ? .isSelected : [])
                }
            }.padding(.horizontal, 7).background(Color.white.opacity(0.12), in: Capsule())
            Button { page = min(count - 1, page + 1) } label: {
                Image(systemName: "chevron.right").font(.system(size: 8, weight: .semibold))
                    .frame(width: 18, height: 18)
            }.buttonStyle(.plain).disabled(page == count - 1).accessibilityLabel("Next category page")
        }.foregroundStyle(Color(hex: "#8E939C")).frame(height: 18)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Agent category pages")
    }
}

struct KronTermPreviewView: View {
    let tracksLayout: Bool
    @ObservedObject private var bridge = KronTermBridge.shared
    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                if bridge.widgetDocked {
                    Color.clear
                } else {
                    RoundedRectangle(cornerRadius: 18).fill(Color(hex: "#141416"))
                }
                if !bridge.previewExpanded {
                    Button { bridge.action("preview-dock") } label: {
                        Label("Show preview", systemImage: "rectangle.inset.filled")
                            .font(.system(size: 12)).foregroundStyle(bridge.accentColor)
                    }.buttonStyle(.plain)
                } else if !bridge.widgetDocked {
                    VStack(spacing: 8) {
                        ProgressView().controlSize(.small)
                        Text("Opening live widget…").font(.system(size: 11)).foregroundStyle(.gray)
                        if bridge.previewStale {
                            Button("Retry") { bridge.action("preview-dock") }.buttonStyle(.plain)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background { if tracksLayout { KronTermPreviewGeometry() } }
            .accessibilityLabel(bridge.previewTitle.isEmpty ? "Live workspace widget" : bridge.previewTitle)
            HStack(spacing: 6) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(bridge.workspaces) { workspace in
                            Button { bridge.action("workspace-select:" + workspace.id) } label: {
                                Text(workspace.name).font(.system(size: 11, weight: .medium)).lineLimit(1)
                                    .padding(.horizontal, 10).padding(.vertical, 6)
                                    .foregroundStyle(workspace.selected ? Color(hex: "#F5F6F8") : Color(hex: "#8E939C"))
                                    .background(Color.white.opacity(workspace.selected ? 0.1 : 0.025), in: Capsule())
                            }.buttonStyle(.plain).help(workspace.name)
                                .accessibilityAddTraits(workspace.selected ? .isSelected : [])
                        }
                        Button { bridge.action("workspace-create") } label: {
                            Image(systemName: "plus").frame(width: 28, height: 28)
                        }.buttonStyle(.plain).help("Create workspace").accessibilityLabel("Create workspace")
                    }
                }.accessibilityLabel("KronTerm workspaces")
                if bridge.widgets.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 2) {
                            ForEach(Array(bridge.widgets.enumerated()), id: \.element.id) { index, widget in
                                Button { bridge.action("preview-select:" + widget.id) } label: {
                                    Circle().fill(index == bridge.previewSelected ? bridge.accentColor : .white.opacity(0.35))
                                        .frame(width: 6, height: 6).frame(width: 28, height: 28)
                                }.buttonStyle(.plain).help(widget.title).accessibilityLabel("Show " + widget.title)
                                    .accessibilityAddTraits(index == bridge.previewSelected ? .isSelected : [])
                            }
                        }
                    }.frame(maxWidth: 180)
                }
            }.buttonStyle(.plain).foregroundStyle(bridge.accentColor)
        }.padding(.trailing, 12).padding(.bottom, 10)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct KronTermPreviewGeometry: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        KronTermBridge.shared.previewHost = view
        return view
    }
    func updateNSView(_ view: NSView, context: Context) {
        KronTermBridge.shared.previewHost = view
    }
}

struct KronTermChatGeometry: NSViewRepresentable {
    let tracksLayout: Bool
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        if tracksLayout { KronTermBridge.shared.chatHost = view }
        return view
    }
    func updateNSView(_ view: NSView, context: Context) {
        if tracksLayout { KronTermBridge.shared.chatHost = view }
        else if KronTermBridge.shared.chatHost === view { KronTermBridge.shared.chatHost = nil }
    }
    static func dismantleNSView(_ view: NSView, coordinator: ()) {
        if KronTermBridge.shared.chatHost === view { KronTermBridge.shared.chatHost = nil }
    }
}

struct KronTermTaskCard: View {
    @ObservedObject private var bridge = KronTermBridge.shared
    @State private var search = ""
    @State private var showSearch = false
    private var primary: KronTermAgent? { bridge.agents.first }
    var body: some View {
        CardBackground(wash: nil) {
            VStack(alignment: .leading, spacing: 8) {
                Spacer().frame(height: 118)
                KronTermProgressSummary()
                if bridge.taskPhase == "idle", let primary {
                    Text(primary.detail).font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.7)).lineLimit(2)
                }
                if !bridge.agents.isEmpty {
                    Divider().padding(.vertical, 4)
                    Text("ACTIVE AGENTS").font(.system(size: 10, weight: .medium)).tracking(1).foregroundStyle(Color.white.opacity(0.45))
                    ScrollView {
                        VStack(spacing: 7) {
                            ForEach(bridge.agents) { agent in
                                Button {
                                    if let id = agent.blockId { bridge.action("preview-select:" + id) }
                                } label: {
                                    HStack(spacing: 8) {
                                        KronTermAgentLogo(backend: agent.backend).frame(width: 20, height: 20)
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(agent.name).font(.system(size: 11, weight: .medium))
                                            Text(agent.detail).font(.system(size: 10)).foregroundStyle(Color.white.opacity(0.55)).lineLimit(1)
                                        }
                                        Spacer(minLength: 0)
                                        KronTermActivityFace(active: ["running", "queued", "verifying"].contains(agent.phase))
                                    }.padding(4)
                                }.buttonStyle(.plain).disabled(agent.blockId == nil).help(agent.detail)
                                    .accessibilityLabel(agent.name + ": " + agent.detail)
                            }
                        }
                    }.frame(maxHeight: 150)
                }
                if bridge.previewView == "web" {
                    Divider()
                    Text("BROWSER TABS").font(.system(size: 10)).tracking(1).foregroundStyle(.gray)
                    ScrollView {
                        VStack(spacing: 5) {
                            ForEach(bridge.widgets.filter { $0.view == "web" }) { widget in
                                Button { bridge.action("browser-select:" + widget.id) } label: {
                                    Label(widget.title, systemImage: "globe").font(.system(size: 10)).lineLimit(1)
                                        .frame(maxWidth: .infinity, alignment: .leading).padding(7)
                                        .background(bridge.widgets.indices.contains(bridge.previewSelected) && bridge.widgets[bridge.previewSelected].id == widget.id ? bridge.accentColor.opacity(0.2) : Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 8))
                                }.buttonStyle(.plain).help(widget.title)
                            }
                        }
                    }
                    Button { bridge.action("web-new") } label: { Label("New tab", systemImage: "plus").font(.system(size: 11)) }
                        .buttonStyle(.plain).help("New browser tab")
                } else if bridge.previewView == "term" || bridge.previewView == "appstream" || bridge.previewView == "installedapps" {
                    Divider()
                    HStack {
                        Text(bridge.previewView == "term" ? "TERMINALS" : "STREAMED APPS")
                            .font(.system(size: 10)).tracking(1).foregroundStyle(.gray)
                        Spacer()
                        Button { bridge.action(bridge.previewView == "term" ? "terminal-new" : "apps-connect") } label: {
                            Image(systemName: "plus").frame(width: 32, height: 32)
                        }.buttonStyle(.plain).accessibilityLabel(bridge.previewView == "term" ? "New terminal" : "Connect app")
                    }
                    ScrollView {
                        VStack(spacing: 5) {
                            ForEach(bridge.widgets.filter { bridge.previewView == "term" ? ($0.view == "term" && $0.parentId == nil) : $0.view == "appstream" }) { widget in
                                Button { bridge.action("preview-select:" + widget.id) } label: {
                                    Label(widget.title + ((widget.paneCount ?? 0) > 1 ? " • 2 panes" : ""), systemImage: bridge.previewView == "term" ? "terminal" : "display")
                                        .font(.system(size: 11)).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading).padding(7)
                                        .background(bridge.widgets.indices.contains(bridge.previewSelected) && bridge.widgets[bridge.previewSelected].id == widget.id ? Color(hex: "#9270FF").opacity(0.2) : Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 8))
                                }.buttonStyle(.plain).help(widget.title)
                            }
                        }
                    }
                    if bridge.previewView == "term" {
                        HStack {
                            Button { bridge.action("terminal-split-right") } label: { Image(systemName: "rectangle.split.2x1").frame(width: 32, height: 32) }
                                .help("Split right").accessibilityLabel("Split terminal right")
                            Button { bridge.action("terminal-split-down") } label: { Image(systemName: "rectangle.split.1x2").frame(width: 32, height: 32) }
                                .help("Split down").accessibilityLabel("Split terminal down")
                        }.buttonStyle(.plain)
                        Button { bridge.action("terminal-new") } label: { Label("New terminal", systemImage: "plus").font(.system(size: 11)).frame(height: 32) }
                            .buttonStyle(.plain).accessibilityLabel("Open a new terminal tab")
                    }
                } else if bridge.previewView == "preview" {
                    Divider()
                    Text("EXPLORER").font(.system(size: 10)).tracking(1).foregroundStyle(.gray)
                    HStack(spacing: 2) {
                        Button { bridge.action("explorer-new-file") } label: { Image(systemName: "doc.badge.plus").frame(width: 32, height: 32) }.help("New file").accessibilityLabel("New file")
                        Button { bridge.action("explorer-new-folder") } label: { Image(systemName: "folder.badge.plus").frame(width: 32, height: 32) }.help("New folder").accessibilityLabel("New folder")
                        Button { bridge.action("explorer-refresh") } label: { Image(systemName: "arrow.clockwise").frame(width: 32, height: 32) }.help("Refresh files").accessibilityLabel("Refresh files")
                        Button { bridge.action("explorer-collapse") } label: { Image(systemName: "rectangle.compress.vertical").frame(width: 32, height: 32) }.help("Collapse folders").accessibilityLabel("Collapse folders")
                    }.buttonStyle(.plain)
                    if showSearch {
                        TextField("Filter files…", text: $search).textFieldStyle(.plain).font(.system(size: 10))
                            .padding(5).background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 5))
                    }
                    if let explorer = bridge.explorer {
                        ScrollView(.horizontal) { Text(explorer.root).font(.system(size: 10)).textSelection(.enabled).fixedSize() }
                            .help(explorer.root)
                        if !explorer.error.isEmpty { Text(explorer.error).font(.system(size: 10)).foregroundStyle(.red).lineLimit(3) }
                        ScrollView {
                            VStack(alignment: .leading, spacing: 2) {
                                ForEach(explorer.entries.filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) }) { row in
                                    Button { bridge.action("explorer-open", route: row.path) } label: {
                                        HStack(spacing: 5) {
                                            if row.directory { Image(systemName: row.expanded ? "chevron.down" : "chevron.right").font(.system(size: 7)) }
                                            Image(systemName: row.directory ? "folder.fill" : "doc.text").foregroundStyle(row.directory ? Color(hex: "#70BDD6") : Color.white.opacity(0.6))
                                            Text(row.name).lineLimit(1)
                                            Spacer(minLength: 0)
                                        }.font(.system(size: 10)).padding(.leading, CGFloat(min(row.depth, 6)) * 9).padding(.vertical, 4)
                                            .background(row.path == explorer.selected ? Color(hex: "#9270FF").opacity(0.18) : .clear, in: RoundedRectangle(cornerRadius: 4))
                                    }.buttonStyle(.plain).help(row.path).accessibilityLabel((row.directory ? "Folder " : "Open file ") + row.name)
                                }
                            }
                        }
                    } else { Text("Loading files…").font(.system(size: 10)).foregroundStyle(.gray) }
                }
                if !bridge.controlTarget.isEmpty {
                    Divider()
                    Text("CONTROLLING").font(.system(size: 10)).tracking(1).foregroundStyle(.gray)
                    Text(bridge.controlTarget).font(.system(size: 11, weight: .medium)).lineLimit(2)
                    Text(bridge.controlRoute == "Kron tools" ? "Uses Kron tools for widget control, extraction, and automation." : "Uses Kron Computer Use for this native app.")
                        .font(.system(size: 10)).foregroundStyle(Color.white.opacity(0.65)).lineLimit(3)
                    HStack {
                        Button("Pause") { bridge.action("control-pause") }
                        Button("Release") { bridge.action("control-release") }
                    }.font(.system(size: 11)).buttonStyle(.plain).frame(height: 32)
                }
                Spacer(minLength: 0)
                HStack(spacing: 13) {
                    if bridge.previewView == "preview" {
                        Button { showSearch.toggle() } label: { Image(systemName: "magnifyingglass") }.help("Filter files").accessibilityLabel("Filter files")
                        Button { bridge.action("files") } label: { Image(systemName: "folder") }.help("Open files").accessibilityLabel("Open files")
                    } else {
                        Button { bridge.action("chat") } label: { Image(systemName: "paperplane.fill") }.help("Open chat").accessibilityLabel("Open chat")
                        Button { bridge.action("chat") } label: { Image(systemName: "bubble.left.fill") }.help("Agent conversation").accessibilityLabel("Agent conversation")
                    }
                    Menu { Button("Open chat") { bridge.action("chat") }; Button("Enlarge notch") { bridge.workspaceLarge.toggle() } } label: { Image(systemName: "ellipsis") }
                        .menuStyle(.borderlessButton).fixedSize().help("Notch actions")
                }.font(.system(size: 11)).buttonStyle(.plain).padding(.horizontal, 10).padding(.vertical, 7)
                    .background(Color.black.opacity(0.5), in: Capsule()).overlay(Capsule().stroke(Color.white.opacity(0.15)))
            }.padding(12).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
    }
}

struct KronTermAgentLogo: View {
    let backend: String
    var body: some View {
        if let url = Bundle.main.url(forResource: backend, withExtension: "png", subdirectory: "agent-logos"), let image = NSImage(contentsOf: url) {
            Image(nsImage: image).resizable().scaledToFit().accessibilityHidden(true)
        } else {
            Text(String(backend.prefix(1)).uppercased()).font(.system(size: 11, weight: .semibold)).accessibilityHidden(true)
        }
    }
}

struct KronTermActivityFace: View {
    let active: Bool
    @ObservedObject private var bridge = KronTermBridge.shared
    var body: some View {
        ZStack {
            Circle().fill(Color(hex: "#B9D7E7"))
            HStack(spacing: 4) {
                Capsule().fill(.black).frame(width: 3, height: 7)
                Capsule().fill(.black).frame(width: 3, height: 7)
            }
        }.frame(width: 18, height: 18).shadow(color: Color(hex: "#70BDD6").opacity(active ? 0.6 : 0.1), radius: active ? 5 : 0)
            .overlay(alignment: .topLeading) {
                Image(systemName: active ? "ellipsis" : "checkmark").font(.system(size: 5, weight: .bold))
                    .frame(width: 8, height: 8).background(Color(hex: "#70BDD6"), in: Circle())
                    .symbolEffect(.pulse, isActive: active && !bridge.reducedMotion)
            }.accessibilityHidden(true)
    }
}

struct KronTermProgressSummary: View {
    @ObservedObject private var bridge = KronTermBridge.shared
    private var needsAttention: Bool {
        ["awaiting-approval", "failed", "error"].contains(bridge.taskPhase)
            || ["awaiting-approval", "blocked"].contains(bridge.workflowStatus)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: needsAttention ? "exclamationmark.circle" : bridge.widgetFocused ? "circle.inset.filled" : "waveform")
                Text(needsAttention ? "Needs your attention" : bridge.widgetFocused ? "Working together" : "Agent activity")
                    .font(.system(size: 12, weight: .semibold))
                Spacer(minLength: 0)
            }.foregroundStyle(needsAttention ? Color.orange : Color(hex: "#C7B9FF"))
            if !bridge.workflowID.isEmpty {
                Text(bridge.workflowTitle).font(.system(size: 12, weight: .semibold)).lineLimit(2)
                Text("\(bridge.workflowStatus.capitalized) · \(bridge.workflowStep)")
                    .font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.65)).lineLimit(2)
                HStack(spacing: 8) {
                    Button { bridge.action("workflow-open", route: bridge.workflowID) } label: { Image(systemName: "square.grid.2x2") }.help("Open workspace")
                    Button { bridge.action("workflow-pause", route: bridge.workflowID) } label: { Image(systemName: "pause") }.help("Pause task")
                    Button { bridge.action("workflow-takeover", route: bridge.workflowID) } label: { Image(systemName: "hand.raised") }.help("Take over")
                    Button { bridge.action("workflow-review", route: bridge.workflowID) } label: { Image(systemName: "doc.text.magnifyingglass") }.help("Review result")
                }.buttonStyle(.plain).foregroundStyle(bridge.accentColor)
                if bridge.workflowStatus == "awaiting-approval", !bridge.workflowQuestionID.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(bridge.workflowOptions) { option in
                            Button {
                                bridge.action("workflow-answer:\(option.id)", route: bridge.workflowID)
                            } label: {
                                Text(option.label)
                                    .font(.system(size: 11, weight: .semibold))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 4)
                                    .background(
                                        Capsule().fill(
                                            option.kind == "danger"
                                                ? Color.orange.opacity(0.18)
                                                : bridge.accentColor.opacity(0.16)
                                        )
                                    )
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(option.kind == "danger" ? Color.orange : bridge.accentColor)
                            .help(option.label)
                        }
                    }
                }
            }
            Text(bridge.taskDetail).font(.system(size: 12)).foregroundStyle(Color.white).lineLimit(2)
            if !bridge.widgetFocused {
                ForEach(Array(bridge.taskSteps.dropLast().suffix(2).enumerated()), id: \.offset) { _, step in
                    Label(step, systemImage: "circle.fill")
                        .font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.65)).lineLimit(1)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

struct KronTermProductivityControls: View {
    @ObservedObject private var bridge = KronTermBridge.shared

    var body: some View {
        if let productivity = bridge.productivity {
            Button { bridge.action("navigate", route: "/productivity") } label: {
                HStack(spacing: 3) {
                    Image(systemName: "checklist")
                    if productivity.openTasks > 0 { Text("\(productivity.openTasks)") }
                }.font(.system(size: 11)).frame(minWidth: 24, minHeight: 24)
            }.buttonStyle(.plain).help("Tasks and habits").accessibilityLabel("Tasks and habits")
            Button { bridge.action("productivity-focus-toggle") } label: {
                HStack(spacing: 3) {
                    Image(systemName: productivity.focus?.status == "running" ? "pause.circle" : "timer")
                    if let focus = productivity.focus {
                        Text("\(Int(ceil(max(0, focus.remainingMs) / 60000)))m")
                    }
                }.font(.system(size: 11)).frame(minWidth: 24, minHeight: 24)
            }.buttonStyle(.plain).help("Start, pause, or resume focus").accessibilityLabel("Toggle focus session")
            Button { bridge.action("navigate", route: "/productivity?tab=notes") } label: {
                Image(systemName: "square.and.pencil").font(.system(size: 11)).frame(width: 24, height: 24)
            }.buttonStyle(.plain).help("Quick note").accessibilityLabel("Open notes")
        }
    }
}
