import ActivityKit
import Foundation

@available(iOS 16.1, *)
struct WorkspaceActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var step: String
        var status: String
        var surface: String
        var updatedAt: Date
    }
    var taskID: String
    var title: String
}

struct WorkspaceSnapshot: Codable {
    var taskID: String
    var title: String
    var step: String
    var status: String
    var surface: String
    var updatedAt: Date

    static let group = "group.dev.kronterm.iphone"
    static let key = "workspace.snapshot"
    static let empty = WorkspaceSnapshot(taskID: "", title: "KronosCode", step: "Open your workspace", status: "idle", surface: "workspace", updatedAt: Date())

    static func load() -> WorkspaceSnapshot {
        guard let data = UserDefaults(suiteName: group)?.data(forKey: key),
              let snapshot = try? JSONDecoder().decode(WorkspaceSnapshot.self, from: data) else { return empty }
        return snapshot
    }

    var url: URL {
        var parts = URLComponents()
        parts.scheme = "kronterm"
        parts.host = "surface"
        parts.path = "/\(surface)"
        parts.queryItems = taskID.isEmpty ? [] : [URLQueryItem(name: "task", value: taskID)]
        return parts.url!
    }
}
