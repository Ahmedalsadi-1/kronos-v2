// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import AppKit
import ApplicationServices
import ScreenCaptureKit
import CryptoKit
import Darwin

struct BackgroundError: Error, LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

func fail(_ message: String) throws -> Never { throw BackgroundError(message: message) }
func attribute(_ element: AXUIElement, _ key: String) -> AnyObject? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, key as CFString, &value) == .success else { return nil }
    return value
}
func children(_ element: AXUIElement) -> [AXUIElement] {
    attribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? []
}
func identity(_ element: AXUIElement) -> [String: String] {
    var result: [String: String] = [:]
    for key in [kAXRoleAttribute, kAXSubroleAttribute, kAXTitleAttribute, kAXIdentifierAttribute, kAXDescriptionAttribute] {
        result[key] = attribute(element, key) as? String ?? ""
    }
    return result
}
struct GroupWindow {
    let element: AXUIElement
    let id: UInt32
    let metadata: [String: Any]
}

enum WindowServerIdentity {
    static let library = dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight", RTLD_LAZY)

    static func symbol(_ names: [String]) -> UnsafeMutableRawPointer? {
        for name in names {
            if let pointer = dlsym(UnsafeMutableRawPointer(bitPattern: -2), name) { return pointer }
            if let library, let pointer = dlsym(library, name) { return pointer }
        }
        return nil
    }

    static func windowID(_ element: AXUIElement) throws -> UInt32 {
        typealias Resolve = @convention(c) (AXUIElement, UnsafeMutablePointer<UInt32>) -> Int32
        guard let pointer = symbol(["_AXUIElementGetWindow"]) else {
            try fail("Exact accessibility window identity is unavailable on this macOS version. Group control was refused.")
        }
        var id: UInt32 = 0
        guard unsafeBitCast(pointer, to: Resolve.self)(element, &id) == 0, id > 0 else {
            try fail("A native window could not be identified exactly. Group control was refused.")
        }
        return id
    }

    static func spaces(_ id: UInt32) throws -> [String] {
        typealias Connection = @convention(c) () -> Int32
        typealias CopySpaces = @convention(c) (Int32, Int32, CFArray) -> Unmanaged<CFArray>?
        guard let connection = symbol(["SLSMainConnectionID", "CGSMainConnectionID"]),
              let copy = symbol(["SLSCopySpacesForWindows", "CGSCopySpacesForWindows"]),
              let result = unsafeBitCast(copy, to: CopySpaces.self)(
                unsafeBitCast(connection, to: Connection.self)(), 0x7, [NSNumber(value: id)] as CFArray
              ) else {
            try fail("macOS desktop membership is unavailable. Group control was refused.")
        }
        let values = result.takeRetainedValue() as NSArray
        let ids = values.compactMap { ($0 as? NSNumber)?.stringValue }.sorted()
        guard !ids.isEmpty else { try fail("Native window has no verifiable macOS desktop membership.") }
        return ids
    }

    static func display(_ id: UInt32) -> CGDirectDisplayID? {
        typealias Connection = @convention(c) () -> Int32
        typealias CopyDisplay = @convention(c) (Int32, UInt32) -> Unmanaged<CFString>?
        guard let connection = symbol(["SLSMainConnectionID", "CGSMainConnectionID"]),
              let copy = symbol(["SLSCopyManagedDisplayForWindow", "CGSCopyManagedDisplayForWindow"]),
              let value = unsafeBitCast(copy, to: CopyDisplay.self)(unsafeBitCast(connection, to: Connection.self)(), id) else { return nil }
        let name = value.takeRetainedValue()
        guard let uuid = CFUUIDCreateFromString(nil, name) else { return nil }
        let display = CGDisplayGetDisplayIDFromUUID(uuid)
        return display == kCGNullDirectDisplay ? nil : display
    }
}

func inventoryWindows(_ running: NSRunningApplication) throws -> [GroupWindow] {
    guard AXIsProcessTrusted() else {
        try fail("Accessibility access is required for exact native window grouping. No foreground fallback is used.")
    }
    let root = AXUIElementCreateApplication(running.processIdentifier)
    var displayCount: UInt32 = 0
    guard CGGetActiveDisplayList(0, nil, &displayCount) == .success, displayCount > 0 else {
        try fail("Display membership is unavailable. Group control was refused.")
    }
    var displays = [CGDirectDisplayID](repeating: 0, count: Int(displayCount))
    guard CGGetActiveDisplayList(displayCount, &displays, &displayCount) == .success else {
        try fail("Display membership is unavailable. Group control was refused.")
    }
    var rawWindows: CFTypeRef?
    guard AXUIElementCopyAttributeValue(root, kAXWindowsAttribute as CFString, &rawWindows) == .success,
          let windows = rawWindows as? [AXUIElement],
          let serverWindows = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as? [[String: Any]] else {
        try fail("Native window inventory is unavailable. Membership cannot be treated as empty.")
    }
    guard windows.count <= 128 else { try fail("Native window inventory exceeds the group limit.") }
    return try windows.map { window in
        let id = try WindowServerIdentity.windowID(window)
        guard let server = serverWindows.first(where: { ($0[kCGWindowNumber as String] as? NSNumber)?.uint32Value == id }),
              (server[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == running.processIdentifier,
              let bounds = server[kCGWindowBounds as String] as? NSDictionary,
              let frame = CGRect(dictionaryRepresentation: bounds) else {
            try fail("Window \(id) ownership or bounds changed. No title or frame matching fallback is used.")
        }
        let displayIDs: [CGDirectDisplayID]
        if frame.isEmpty, let managed = WindowServerIdentity.display(id), displays.contains(managed) {
            displayIDs = [managed]
        } else {
            displayIDs = displays.prefix(Int(displayCount)).filter { CGDisplayBounds($0).intersects(frame) }.sorted()
        }
        guard !displayIDs.isEmpty else { try fail("Native window is outside all verifiable displays. Group control was refused.") }
        return GroupWindow(element: window, id: id, metadata: [
            "windowId": Int(id), "title": attribute(window, kAXTitleAttribute) as? String ?? "",
            "spaceIds": try WindowServerIdentity.spaces(id), "displayIds": displayIDs.map(Int.init),
            "bounds": ["x": frame.minX, "y": frame.minY, "width": frame.width, "height": frame.height]
        ])
    }
}

func scopedWindows(_ inventory: [GroupWindow], _ args: [String: Any], mutation: Bool) throws -> [GroupWindow] {
    guard let rawIDs = args["allowedWindowIds"] as? [NSNumber], rawIDs.count <= 128,
          let expectedSpaces = args["expectedWindowSpaces"] as? [String: [String]],
          let expectedDisplays = args["expectedWindowDisplays"] as? [String: [NSNumber]] else {
        try fail("An explicit window and desktop group is required. App-wide control was refused.")
    }
    let ids = rawIDs.map { $0.uint32Value }
    guard Set(ids).count == ids.count, rawIDs.allSatisfy({ $0.doubleValue > 0 && $0.doubleValue <= Double(UInt32.max) && $0.doubleValue.rounded() == $0.doubleValue }) else {
        try fail("Invalid group window IDs.")
    }
    let current = Set(inventory.map { $0.id })
    guard Set(ids).isSubset(of: current) else { try fail("A group window closed or changed identity. Human review is required.") }
    if mutation && current != Set(ids) { try fail("An unapproved native window appeared. Human review is required before further actions.") }
    let selected = inventory.filter { ids.contains($0.id) }
    for window in selected {
        let key = String(window.id)
        guard let spaces = expectedSpaces[key], !spaces.isEmpty,
              let displays = expectedDisplays[key], !displays.isEmpty,
              (window.metadata["spaceIds"] as? [String]) == spaces.sorted(),
              (window.metadata["displayIds"] as? [Int]) == displays.map({ $0.intValue }).sorted() else {
            try fail("A group window moved to another macOS desktop or display. Human review is required.")
        }
    }
    return selected
}

func treeFingerprint(_ windows: [GroupWindow]) -> String {
    var rows: [[String: Any]] = []
    var complete = true
    func walk(_ element: AXUIElement, _ path: [Int], _ depth: Int) {
        guard depth < 16, rows.count < 1500 else { complete = false; return }
        var row: [String: Any] = identity(element)
        row["path"] = path
        row["windowNumber"] = attribute(element, "AXWindowNumber") as? NSNumber ?? 0
        for key in [kAXPositionAttribute, kAXSizeAttribute] {
            if let value = attribute(element, key), CFGetTypeID(value) == AXValueGetTypeID() {
                let ax = value as! AXValue
                var point = CGPoint.zero
                var size = CGSize.zero
                if AXValueGetValue(ax, .cgPoint, &point) { row[key] = [point.x, point.y] }
                else if AXValueGetValue(ax, .cgSize, &size) { row[key] = [size.width, size.height] }
            }
        }
        let descendants = children(element)
        row["children"] = descendants.count
        rows.append(row)
        for (index, child) in descendants.enumerated() { walk(child, path + [index], depth + 1) }
    }
    for window in windows.sorted(by: { $0.id < $1.id }) { walk(window.element, [Int(window.id)], 0) }
    guard complete else { return "" }
    let data = (try? JSONSerialization.data(withJSONObject: rows, options: [.sortedKeys])) ?? Data()
    return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

@main
struct BackgroundComputer {
    @MainActor static func foregroundApp() async -> NSRunningApplication? {
        for _ in 0..<5 {
            if let application = NSWorkspace.shared.frontmostApplication { return application }
            if let application = NSWorkspace.shared.runningApplications.first(where: { $0.isActive }) { return application }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        return nil
    }

    @MainActor static func requireBackground(_ running: NSRunningApplication) async throws {
        guard let foreground = await foregroundApp() else {
            try fail("Foreground app identity is unavailable. Background control was refused.")
        }
        guard foreground.processIdentifier != running.processIdentifier, !running.isActive else {
            try fail("The task-owned app is foreground. Return it to the background before resuming.")
        }
    }

    @MainActor static func main() async {
        NSApplication.shared.setActivationPolicy(.prohibited)
        NSApplication.shared.finishLaunching()
        do {
            let data = FileHandle.standardInput.readDataToEndOfFile()
            guard let args = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let action = args["action"] as? String else { try fail("Invalid native workspace request.") }
            let result = try await perform(action, args)
            let output = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
            FileHandle.standardOutput.write(output)
        } catch {
            let output = try! JSONSerialization.data(withJSONObject: ["error": error.localizedDescription])
            FileHandle.standardOutput.write(output)
            exit(1)
        }
    }

    @MainActor static func app(_ args: [String: Any]) throws -> NSRunningApplication {
        guard let pid = args["pid"] as? Int, let bundle = args["bundleId"] as? String,
              let launched = args["launchTime"] as? Double,
              let app = NSRunningApplication(processIdentifier: pid_t(pid)),
              !app.isTerminated, app.bundleIdentifier == bundle,
              let date = app.launchDate, abs(date.timeIntervalSince1970 - launched) < 0.001 else {
            try fail("Workspace app exited or changed identity. Start a new task-owned app; existing apps are never adopted.")
        }
        return app
    }

    @MainActor static func perform(_ action: String, _ args: [String: Any]) async throws -> [String: Any] {
        if action == "status" {
            let foreground = await foregroundApp()
            return ["frontmostBundleId": foreground?.bundleIdentifier ?? "",
                    "frontmostPid": foreground.map { Int($0.processIdentifier) } ?? 0,
                    "accessibilityTrusted": AXIsProcessTrusted(), "screenCaptureGranted": CGPreflightScreenCaptureAccess(),
                    "runningBundleIds": NSWorkspace.shared.runningApplications.compactMap { $0.bundleIdentifier }]
        }
        if action == "launch" {
            guard let bundle = args["bundleId"] as? String,
                  let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundle) else {
                try fail("Installed application bundle ID was not found.")
            }
            if FileManager.default.fileExists(atPath: url.appendingPathComponent("Contents/Frameworks/Electron Framework.framework").path) {
                try fail("Electron apps are not supported in the quiet native desktop path because they can activate their renderers during launch.")
            }
            let baseline = Set(NSWorkspace.shared.runningApplications.map { $0.processIdentifier })
            guard NSRunningApplication.runningApplications(withBundleIdentifier: bundle).isEmpty else {
                try fail("This application is already running. Background workspaces refuse existing user apps; use an app that is not running.")
            }
            let configuration = NSWorkspace.OpenConfiguration()
            configuration.activates = false
            configuration.addsToRecentItems = false
            configuration.allowsRunningApplicationSubstitution = false
            let launched: NSRunningApplication = try await withCheckedThrowingContinuation { continuation in
                NSWorkspace.shared.openApplication(at: url, configuration: configuration) { app, error in
                    if let error { continuation.resume(throwing: error) }
                    else if let app { continuation.resume(returning: app) }
                    else { continuation.resume(throwing: BackgroundError(message: "Application launch returned no process.")) }
                }
            }
            guard !baseline.contains(launched.processIdentifier), let date = launched.launchDate else {
                try fail("The application reused an existing process; it has not been adopted into the background workspace.")
            }
            return ["pid": Int(launched.processIdentifier), "bundleId": bundle,
                    "launchTime": date.timeIntervalSince1970, "name": launched.localizedName ?? bundle,
                    "isActive": launched.isActive]
        }
        if action == "app_alive" {
            return ["alive": (try? app(args)) != nil]
        }
        let running = try app(args)
        if action == "place_windows" || action == "review_on_main" {
            try await requireBackground(running)
            let reviewing = action == "review_on_main"
            let approved = reviewing ? try scopedWindows(inventoryWindows(running), args, mutation: true) : []
            let requested = reviewing ? CGMainDisplayID() : (args["displayId"] as? UInt32 ?? 0)
            let rawIDs = reviewing ? approved.map { $0.id } : (args["windowIds"] as? [UInt32] ?? [])
            guard requested > 0, (reviewing || requested != CGMainDisplayID()),
                  !rawIDs.isEmpty, rawIDs.count <= 128 else {
                try fail("A dedicated background display and exact task window IDs are required.")
            }
            var count: UInt32 = 0
            guard CGGetActiveDisplayList(0, nil, &count) == .success else { try fail("Display inventory unavailable.") }
            var displays = [UInt32](repeating: 0, count: Int(count))
            guard CGGetActiveDisplayList(count, &displays, &count) == .success,
                  displays.contains(requested), CGDisplayMirrorsDisplay(requested) == kCGNullDirectDisplay else {
                try fail("Assigned background display disconnected or became mirrored.")
            }
            let bounds = CGDisplayBounds(requested)
            let windows = try inventoryWindows(running)
            guard Set(rawIDs).count == rawIDs.count, Set(rawIDs).isSubset(of: Set(windows.map { $0.id })) else {
                try fail("Task window ownership changed before placement.")
            }
            for window in windows where rawIDs.contains(window.id) {
                try await requireBackground(running)
                var position = CGPoint(x: bounds.minX + 40, y: bounds.minY + 48)
                var size = CGSize(width: min(1000, bounds.width - 80), height: min(700, bounds.height - 96))
                guard let point = AXValueCreate(.cgPoint, &position), let extent = AXValueCreate(.cgSize, &size),
                      AXUIElementSetAttributeValue(window.element, kAXPositionAttribute as CFString, point) == .success else {
                    try fail("Native app refused placement on its assigned background display.")
                }
                _ = AXUIElementSetAttributeValue(window.element, kAXSizeAttribute as CFString, extent)
            }
            for _ in 0..<10 {
                let inventory = try inventoryWindows(running)
                let current = inventory.filter { rawIDs.contains($0.id) }
                if current.count == rawIDs.count && current.allSatisfy({ ($0.metadata["displayIds"] as? [Int]) == [Int(requested)] }) {
                    if reviewing {
                        try await requireBackground(running)
                        let finalInventory = try inventoryWindows(running)
                        guard Set(finalInventory.map { $0.id }) == Set(rawIDs),
                              finalInventory.allSatisfy({ ($0.metadata["displayIds"] as? [Int]) == [Int(requested)] }) else {
                            try fail("Window membership changed during human review. App activation was refused.")
                        }
                        running.activate(options: [.activateIgnoringOtherApps])
                    }
                    return ["windows": current.map { $0.metadata }, "isActive": running.isActive]
                }
                try await Task.sleep(nanoseconds: 50_000_000)
            }
            try fail("Native window did not settle on its assigned background display. Actions remain blocked.")
        }
        if action == "inventory_windows" {
            return ["windows": try inventoryWindows(running).map { $0.metadata }, "isActive": running.isActive]
        }
        if action == "open_file" {
            try await requireBackground(running)
            _ = try scopedWindows(inventoryWindows(running), args, mutation: true)
            guard let document = args["filePath"] as? String, document.hasPrefix("/"),
                  !document.contains("\0"), FileManager.default.fileExists(atPath: document),
                  let url = running.bundleURL else { try fail("An existing absolute local file path is required.") }
            guard (try URL(fileURLWithPath: document).resourceValues(forKeys: [.isRegularFileKey])).isRegularFile == true else {
                try fail("Document path must identify a regular file, not a directory or application bundle.")
            }
            guard NSRunningApplication.runningApplications(withBundleIdentifier: running.bundleIdentifier ?? "").allSatisfy({ $0.processIdentifier == running.processIdentifier }) else {
                try fail("Another process for this app is running; document routing is ambiguous and was refused.")
            }
            let configuration = NSWorkspace.OpenConfiguration()
            configuration.activates = false
            configuration.addsToRecentItems = false
            configuration.allowsRunningApplicationSubstitution = false
            let opened: NSRunningApplication = try await withCheckedThrowingContinuation { continuation in
                NSWorkspace.shared.open([URL(fileURLWithPath: document)], withApplicationAt: url, configuration: configuration) { app, error in
                    if let error { continuation.resume(throwing: error) }
                    else if let app { continuation.resume(returning: app) }
                    else { continuation.resume(throwing: BackgroundError(message: "Document open returned no process.")) }
                }
            }
            guard opened.processIdentifier == running.processIdentifier else {
                try fail("Document open did not use the task-owned app process. No additional process was adopted.")
            }
            return ["opened": true, "pid": Int(running.processIdentifier), "isActive": running.isActive]
        }
        if action == "reveal" {
            _ = try scopedWindows(inventoryWindows(running), args, mutation: true)
            return ["revealed": running.activate(options: [])]
        }
        guard AXIsProcessTrusted() else {
            try fail("Accessibility access is required for the KronTerm background computer helper. Enable it in macOS Privacy & Security, then retry; no foreground input fallback is used.")
        }
        let inventory = try inventoryWindows(running)
        let windows = try scopedWindows(inventory, args, mutation: action != "observe")
        if action == "observe" {
            var nodes: [[String: Any]] = []
            func walk(_ element: AXUIElement, _ path: [Int], _ depth: Int, _ windowID: UInt32) {
                guard depth < 16, nodes.count < 1500 else { return }
                var node: [String: Any] = identity(element)
                node["elementId"] = path.map(String.init).joined(separator: ".")
                node["windowId"] = Int(windowID)
                let secure = (node[kAXSubroleAttribute] as? String) == "AXSecureTextField"
                    || (node[kAXRoleAttribute] as? String) == "AXSecureTextField"
                    || (attribute(element, "AXProtectedContent") as? Bool) == true
                if !secure, let value = attribute(element, kAXValueAttribute) as? String { node["value"] = String(value.prefix(4096)) }
                if secure { node["secureValueOmitted"] = true }
                var actions: CFArray?
                if AXUIElementCopyActionNames(element, &actions) == .success { node["actions"] = actions as? [String] ?? [] }
                var settable = DarwinBoolean(false)
                node["valueSettable"] = AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &settable) == .success && settable.boolValue
                nodes.append(node)
                for (index, child) in children(element).enumerated() { walk(child, path + [index], depth + 1, windowID) }
            }
            for window in windows.sorted(by: { $0.id < $1.id }) {
                walk(window.element, [Int(window.id)], 0, window.id)
            }
            let fingerprint = treeFingerprint(windows)
            var snapshot: [String: Any] = ["pid": Int(running.processIdentifier), "isActive": running.isActive,
                                          "elements": nodes, "truncated": fingerprint.isEmpty,
                                          "treeFingerprint": fingerprint, "windows": windows.map { $0.metadata },
                                          "pendingWindowIds": inventory.filter { candidate in !windows.contains(where: { $0.id == candidate.id }) }.map { Int($0.id) }]
            if CGPreflightScreenCaptureAccess() {
                do {
                    let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: false)
                    let shareable = content.windows.filter { candidate in
                        candidate.owningApplication?.processID == running.processIdentifier && candidate.windowLayer == 0
                            && windows.contains(where: { $0.id == candidate.windowID })
                    }.sorted {
                        let left = ($0.title?.isEmpty == false ? 2 : 0) + ($0.isOnScreen ? 1 : 0)
                        let right = ($1.title?.isEmpty == false ? 2 : 0) + ($1.isOnScreen ? 1 : 0)
                        return left > right
                    }
                    if let window = shareable.first {
                        let configuration = SCStreamConfiguration()
                        configuration.width = min(1280, max(1, Int(window.frame.width)))
                        let scale = min(1, 1280 / max(1, window.frame.width), 1280 / max(1, window.frame.height))
                        configuration.width = max(1, Int(window.frame.width * scale))
                        configuration.height = max(1, Int(window.frame.height * scale))
                        configuration.showsCursor = false
                        _ = try scopedWindows(inventoryWindows(running), args, mutation: false)
                        let image = try await SCScreenshotManager.captureImage(contentFilter: SCContentFilter(desktopIndependentWindow: window), configuration: configuration)
                        _ = try scopedWindows(inventoryWindows(running), args, mutation: false)
                        let representation = NSBitmapImageRep(cgImage: image)
                        if let data = representation.representation(using: .png, properties: [:]) {
                            snapshot["imageDataUrl"] = "data:image/png;base64," + data.base64EncodedString()
                        }
                    } else { snapshot["captureUnavailable"] = "No shareable window for this task-owned app. Off-Space or minimized windows may be unavailable." }
                } catch { snapshot["captureUnavailable"] = error.localizedDescription }
            } else { snapshot["captureUnavailable"] = "Screen Recording access is not granted to the background helper. Accessibility observation remains available." }
            _ = try scopedWindows(inventoryWindows(running), args, mutation: false)
            return snapshot
        }
        try await requireBackground(running)
        guard let fingerprint = args["treeFingerprint"] as? String, !fingerprint.isEmpty, fingerprint == treeFingerprint(windows) else {
            try fail("Window hierarchy, labels or bounds changed. Observe again before acting.")
        }
        guard action == "press" || action == "set_value", let path = args["elementId"] as? String,
              let expected = args["identity"] as? [String: String] else { try fail("Unsupported background operation.") }
        let indexes = path.split(separator: ".").compactMap { Int($0) }
        guard !indexes.isEmpty, indexes.count <= 16, indexes.count == path.split(separator: ".").count else { try fail("Invalid element path.") }
        guard let requestedID = args["windowId"] as? NSNumber,
              let first = indexes.first, first == requestedID.intValue,
              let window = windows.first(where: { Int($0.id) == first }) else {
            try fail("Action is outside the assigned native window group.")
        }
        var level = children(window.element)
        var target: AXUIElement? = window.element
        for index in indexes.dropFirst() {
            guard index >= 0, index < level.count else { try fail("Element changed; observe the workspace again.") }
            target = level[index]
            level = children(level[index])
        }
        guard let target, identity(target) == expected else { try fail("Element changed; observe the workspace again.") }
        guard [kAXIdentifierAttribute, kAXTitleAttribute, kAXDescriptionAttribute].contains(where: { !(expected[$0] ?? "").isEmpty }) else {
            try fail("Element has no stable identifying label. Background actions refuse ambiguous controls.")
        }
        let result: AXError
        _ = try scopedWindows(inventoryWindows(running), args, mutation: true)
        try await requireBackground(running)
        var targetPID: pid_t = 0
        guard AXUIElementGetPid(target, &targetPID) == .success, targetPID == running.processIdentifier else {
            try fail("Accessibility target belongs to another native process. Group control was refused.")
        }
        if action == "press" {
            result = AXUIElementPerformAction(target, kAXPressAction as CFString)
        } else {
            guard let value = args["value"] as? String else { try fail("A literal value is required.") }
            var settable = DarwinBoolean(false)
            guard AXUIElementIsAttributeSettable(target, kAXValueAttribute as CFString, &settable) == .success,
                  settable.boolValue else { try fail("This element does not support background value assignment. No keyboard fallback is used.") }
            result = AXUIElementSetAttributeValue(target, kAXValueAttribute as CFString, value as CFString)
        }
        guard result == .success else { try fail("Background accessibility action failed (\(result.rawValue)). No global pointer or keyboard fallback is used.") }
        return ["performed": action, "pid": Int(running.processIdentifier), "isActive": running.isActive]
    }
}
