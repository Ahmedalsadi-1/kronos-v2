import Foundation

@main struct PanelSizingRegression {
    static func main() {
        precondition(KronTermPanelSizing.workspaceHeight(available: 900, enlarged: false, wide: true) == 480)
        precondition(KronTermPanelSizing.workspaceHeight(available: 900, enlarged: true, wide: true) == 680)
        precondition(KronTermPanelSizing.workspaceHeight(available: 900, enlarged: false, wide: false) == 400)
        precondition(KronTermPanelSizing.chatHeight(available: 900, enlarged: false, detached: false) == 480)
        precondition(KronTermPanelSizing.chatHeight(available: 900, enlarged: true, detached: false) == 640)
        for available: CGFloat in [1, 24, 200, 600, 800] {
            for enlarged in [false, true] {
                let maximum = max(1, available - 24)
                precondition(KronTermPanelSizing.workspaceHeight(available: available, enlarged: enlarged, wide: true) <= maximum)
                precondition(KronTermPanelSizing.chatHeight(available: available, enlarged: enlarged, detached: true) <= maximum)
            }
        }
        print("Native slim-panel sizing regression passed")
    }
}
