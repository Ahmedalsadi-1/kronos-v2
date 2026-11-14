import Foundation

enum KronTermPanelSizing {
    static func workspaceHeight(available: CGFloat, enlarged: Bool, wide: Bool) -> CGFloat {
        min(enlarged ? 680 : wide ? 480 : 400, max(1, available - 24))
    }

    static func chatHeight(available: CGFloat, enlarged: Bool, detached: Bool) -> CGFloat {
        min(enlarged ? 640 : detached ? 420 : 480, max(1, available - 24))
    }
}
