import ActivityKit
import SwiftUI
import WidgetKit

private let HermesPurple = Color(red: 0.49, green: 0.29, blue: 0.95)

private struct AgentAvatar: View {
    var body: some View {
        ZStack {
            Circle().fill(HermesPurple)
            HStack(spacing: 4) {
                Capsule().fill(.white).frame(width: 3, height: 7)
                Capsule().fill(.white).frame(width: 3, height: 7)
            }
        }.frame(width: 24, height: 24).accessibilityLabel("KronosCode")
    }
}

private struct TaskStateIcon: View {
    let status: String
    var body: some View {
        if status == "running" {
            ProgressView().tint(HermesPurple)
        } else {
            Image(systemName: status == "completed" ? "checkmark.circle" : status == "failed" ? "exclamationmark.triangle" : "hand.raised")
                .foregroundStyle(HermesPurple)
        }
    }
}

private func surfaceIcon(_ surface: String) -> String {
    switch surface {
    case "browser": return "globe"
    case "sandbox": return "desktopcomputer"
    case "emulator": return "iphone"
    case "terminal": return "terminal"
    case "files": return "folder"
    default: return "square.grid.2x2"
    }
}

struct WorkspaceEntry: TimelineEntry {
    let date: Date
    let snapshot: WorkspaceSnapshot
}

struct WorkspaceProvider: TimelineProvider {
    func placeholder(in context: Context) -> WorkspaceEntry { WorkspaceEntry(date: Date(), snapshot: .empty) }
    func getSnapshot(in context: Context, completion: @escaping (WorkspaceEntry) -> Void) {
        completion(WorkspaceEntry(date: Date(), snapshot: .load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WorkspaceEntry>) -> Void) {
        completion(Timeline(entries: [WorkspaceEntry(date: Date(), snapshot: .load())], policy: .after(Date().addingTimeInterval(900))))
    }
}

struct WorkspaceWidgetView: View {
    let entry: WorkspaceEntry
    @Environment(\.widgetFamily) var family
    var body: some View {
        Group {
            if family == .accessoryCircular {
                Image(systemName: surfaceIcon(entry.snapshot.surface)).font(.title2)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Image(systemName: surfaceIcon(entry.snapshot.surface)).foregroundStyle(HermesPurple)
                        Spacer()
                        if family != .accessoryInline {
                            Circle().fill(entry.snapshot.status == "waiting" ? Color.orange : HermesPurple).frame(width: 6, height: 6)
                        }
                    }
                    Text(entry.snapshot.step).font(.headline).lineLimit(3)
                    if family == .systemSmall || family == .systemMedium {
                        Spacer(minLength: 0)
                        Text(entry.snapshot.title).font(.caption).foregroundStyle(.secondary).lineLimit(1).privacySensitive()
                        if entry.snapshot.status != "idle" {
                            Text(entry.snapshot.updatedAt, style: .relative).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .widgetURL(entry.snapshot.url)
        .containerBackground(.background, for: .widget)
    }
}

struct WorkspaceWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "KronTermWorkspace", provider: WorkspaceProvider()) { entry in WorkspaceWidgetView(entry: entry) }
            .configurationDisplayName("KronTerm")
            .description("Continue your workspace and follow KronosCode tasks.")
            .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

struct WorkspaceLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkspaceActivityAttributes.self) { context in
            HStack(spacing: 12) {
                AgentAvatar()
                VStack(alignment: .leading, spacing: 4) {
                    Text(context.state.step).font(.headline).lineLimit(2)
                    Text(context.attributes.title).font(.caption).foregroundStyle(.secondary).privacySensitive()
                }
                Spacer()
                TaskStateIcon(status: context.state.status)
            }.padding(16).foregroundStyle(Color.black).activityBackgroundTint(Color.white)
            .activitySystemActionForegroundColor(Color.black)
            .widgetURL(activityURL(context))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { AgentAvatar() }
                DynamicIslandExpandedRegion(.trailing) {
                    HStack(spacing: 8) {
                        Image(systemName: surfaceIcon(context.state.surface)).foregroundStyle(HermesPurple)
                        TaskStateIcon(status: context.state.status)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(context.state.step).font(.headline).lineLimit(2)
                        Link("Open workspace", destination: activityURL(context)).font(.caption).foregroundStyle(HermesPurple)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                AgentAvatar()
            } compactTrailing: {
                TaskStateIcon(status: context.state.status)
            } minimal: {
                AgentAvatar()
            }.widgetURL(activityURL(context)).keylineTint(HermesPurple)
        }
    }

    private func activityURL(_ context: ActivityViewContext<WorkspaceActivityAttributes>) -> URL {
        WorkspaceSnapshot(taskID: context.attributes.taskID, title: context.attributes.title, step: context.state.step, status: context.state.status, surface: context.state.surface, updatedAt: context.state.updatedAt).url
    }
}

@main
struct KronTermWidgetBundle: WidgetBundle {
    var body: some Widget {
        WorkspaceWidget()
        WorkspaceLiveActivity()
    }
}
