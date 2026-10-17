import AppKit
import QuartzCore
import SwiftUI

@MainActor
final class KronTermCursorFollower {
    static let shared = KronTermCursorFollower()
    private var panel: NSPanel?
    private var timer: Timer?
    private var target = CGPoint.zero
    private var updated = 0.0
    private var tick = 0.0
    private let size: CGFloat = 112
    let engine = BotEngine()

    func follow(x: Double, y: Double) {
        let top = NSScreen.screens.first?.frame.maxY ?? 0
        target = CGPoint(x: x, y: top - y)
        updated = CACurrentMediaTime()
        if panel == nil {
            let window = NSPanel(contentRect: NSRect(x: 0, y: 0, width: size, height: size),
                                 styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
            window.isOpaque = false
            window.backgroundColor = .clear
            window.hasShadow = false
            window.ignoresMouseEvents = true
            window.level = .statusBar
            window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
            window.contentView = NSHostingView(rootView: KronTermCursorPet(engine: engine))
            panel = window
        }
        guard let panel else { return }
        if !panel.isVisible {
            panel.setFrameOrigin(destination())
            panel.orderFrontRegardless()
        }
        if timer == nil {
            tick = updated
            timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
                MainActor.assumeIsolated { self?.advance() }
            }
        }
    }

    private func destination() -> CGPoint {
        let screen = NSScreen.screens.first(where: { $0.frame.contains(target) }) ?? NSScreen.main
        let bounds = screen?.visibleFrame ?? .zero
        var x = target.x + 28
        if x + size > bounds.maxX - 8 { x = target.x - size - 28 }
        return CGPoint(x: max(bounds.minX + 8, min(x, bounds.maxX - size - 8)),
                       y: max(bounds.minY + 8, min(target.y - size - 28, bounds.maxY - size - 8)))
    }

    private func advance() {
        let now = CACurrentMediaTime()
        guard let panel, now - updated < 3 else { hide(); return }
        let dt = max(0, min(now - tick, 0.05))
        tick = now
        let next = destination()
        let factor = KronTermBridge.shared.reducedMotion ? 1 : 1 - exp(-12 * dt)
        let origin = panel.frame.origin
        panel.setFrameOrigin(CGPoint(x: origin.x + (next.x - origin.x) * factor,
                                     y: origin.y + (next.y - origin.y) * factor))
        engine.lookX = tanh((target.x - panel.frame.midX) / 160)
        engine.lookY = tanh((target.y - panel.frame.midY) / 160)
    }

    func hide() {
        timer?.invalidate()
        timer = nil
        panel?.orderOut(nil)
    }
}

@MainActor
private struct KronTermCursorPet: View {
    @ObservedObject var engine: BotEngine
    @ObservedObject private var bridge = KronTermBridge.shared

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: bridge.reducedMotion)) { timeline in
            Canvas { context, size in
                engine.setState(AppState.shared.effectiveState)
                engine.bodyColor = bridge.paletteName == "coucou" ? nil : cgColorFromHex(bridge.accentHex)
                engine.update(dt: min(0.05, max(0, timeline.date.timeIntervalSinceReferenceDate - engine.lastTime)))
                engine.draw(context: context, size: size)
            }
        }.accessibilityHidden(true)
    }
}
