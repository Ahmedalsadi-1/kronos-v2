import SafariServices
import ActivityKit
import Capacitor
import WidgetKit
import UserNotifications

@objc(KronTermWorkspacePlugin)
public class KronTermWorkspacePlugin: CAPPlugin, CAPBridgedPlugin, UNUserNotificationCenterDelegate {
    public let identifier = "KronTermWorkspacePlugin"
    public let jsName = "KronTermWorkspace"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestNotifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeNotificationLink", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openBrowser", returnType: CAPPluginReturnPromise)
    ]

    var operation: Task<Void, Never>?
    var notificationLink: String?

    public override func load() {
        UNUserNotificationCenter.current().delegate = self
    }

    func enqueue(_ body: @escaping @MainActor () async -> Void) {
        DispatchQueue.main.async {
            let previous = self.operation
            self.operation = Task { @MainActor in
                await previous?.value
                await body()
            }
        }
    }

    @objc func openBrowser(_ call: CAPPluginCall) {
        guard let value = call.getString("url"), let url = URL(string: value),
              url.scheme?.lowercased() == "https", url.host != nil,
              url.user == nil, url.password == nil else {
            call.reject("Use an HTTPS web address")
            return
        }
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController, presenter.presentedViewController == nil else {
                call.reject("Close the current sheet before opening Safari")
                return
            }
            let controller = SFSafariViewController(url: url)
            controller.dismissButtonStyle = .close
            presenter.present(controller, animated: true) { call.resolve() }
        }
    }

    @objc func requestNotifications(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, error in
            if let error = error { call.reject(error.localizedDescription); return }
            call.resolve(["granted": granted])
        }
    }

    @objc func consumeNotificationLink(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(self.notificationLink.map { ["url": $0] } ?? [:])
            self.notificationLink = nil
        }
    }

    public func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        if let value = response.notification.request.content.userInfo["workspaceURL"] as? String,
           let url = URL(string: value), url.scheme == "kronterm", url.host == "surface" {
            DispatchQueue.main.async {
                self.notificationLink = value
                self.notifyListeners("notificationOpen", data: ["url": value])
                completionHandler()
            }
            return
        }
        completionHandler()
    }

    public func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([])
    }

    func notifyTransition(from previous: WorkspaceSnapshot, to snapshot: WorkspaceSnapshot) async {
        let needsAttention = previous.status == "running" && snapshot.status == "waiting"
        let finished = ["running", "waiting"].contains(previous.status) && ["completed", "failed"].contains(snapshot.status)
        guard previous.taskID == snapshot.taskID, needsAttention || finished else { return }
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized else { return }
        let content = UNMutableNotificationContent()
        content.title = "KronTerm"
        switch snapshot.status {
        case "waiting": content.body = "KronosCode needs your attention."
        case "completed": content.body = "Your task is ready to review."
        default: content.body = "Your task needs attention."
        }
        content.sound = .default
        content.userInfo = ["workspaceURL": snapshot.url.absoluteString]
        let identifier = "workspace-\(snapshot.taskID)-\(snapshot.status)"
        try? await center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: nil))
    }

    @objc func update(_ call: CAPPluginCall) {
        guard let taskID = call.getString("taskID"), let title = call.getString("title"),
              let step = call.getString("step"), let status = call.getString("status"),
              let surface = call.getString("surface"),
              ["workspace", "browser", "sandbox", "emulator", "terminal", "files", "chat"].contains(surface),
              ["running", "waiting", "completed", "failed", "idle"].contains(status) else {
            call.reject("Invalid workspace snapshot")
            return
        }
        let snapshot = WorkspaceSnapshot(taskID: String(taskID.prefix(128)), title: String(title.prefix(80)), step: String(step.prefix(120)), status: status, surface: surface, updatedAt: Date())
        enqueue {
            guard let defaults = UserDefaults(suiteName: WorkspaceSnapshot.group),
                  let data = try? JSONEncoder().encode(snapshot) else {
                call.reject("Workspace storage unavailable")
                return
            }
            let previous = WorkspaceSnapshot.load()
            defaults.set(data, forKey: WorkspaceSnapshot.key)
            WidgetCenter.shared.reloadTimelines(ofKind: "KronTermWorkspace")
            await self.notifyTransition(from: previous, to: snapshot)
            guard #available(iOS 17.0, *), ActivityAuthorizationInfo().areActivitiesEnabled else {
                call.resolve(["liveActivity": false])
                return
            }
            let state = WorkspaceActivityAttributes.ContentState(step: snapshot.step, status: status, surface: surface, updatedAt: snapshot.updatedAt)
            let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(300))
            for activity in Activity<WorkspaceActivityAttributes>.activities where activity.attributes.taskID != snapshot.taskID {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            if let activity = Activity<WorkspaceActivityAttributes>.activities.first(where: { $0.attributes.taskID == snapshot.taskID }) {
                if ["completed", "failed", "idle"].contains(status) {
                    await activity.end(content, dismissalPolicy: .after(Date().addingTimeInterval(60)))
                } else {
                    await activity.update(content)
                }
                call.resolve(["liveActivity": true])
                return
            }
            guard ["running", "waiting"].contains(status) else {
                call.resolve(["liveActivity": false])
                return
            }
            do {
                _ = try Activity.request(attributes: WorkspaceActivityAttributes(taskID: snapshot.taskID, title: snapshot.title), content: content, pushType: nil)
                call.resolve(["liveActivity": true])
            } catch {
                call.resolve(["liveActivity": false, "reason": error.localizedDescription])
            }
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        enqueue {
            UserDefaults(suiteName: WorkspaceSnapshot.group)?.removeObject(forKey: WorkspaceSnapshot.key)
            WidgetCenter.shared.reloadTimelines(ofKind: "KronTermWorkspace")
            if #available(iOS 17.0, *) {
                for activity in Activity<WorkspaceActivityAttributes>.activities {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
            }
            call.resolve()
        }
    }
}

class KronTermBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(KronTermWorkspacePlugin())
    }
}
