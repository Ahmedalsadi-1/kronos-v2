// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import AppKit
import ApplicationServices

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
func finish(_ payload: [String: Any]) -> Never {
    if let data = try? JSONSerialization.data(withJSONObject: payload), let text = String(data: data, encoding: .utf8) {
        print(text)
        fflush(stdout)
    }
    exit(0)
}
let requestAccess = CommandLine.arguments.contains("--request-access")
let accessibilityOptions = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: requestAccess] as CFDictionary
guard AXIsProcessTrustedWithOptions(accessibilityOptions) else {
    finish(["error": "Allow KronOS in System Settings > Privacy & Security > Accessibility, then select again."])
}
let system = AXUIElementCreateSystemWide()
AXUIElementSetMessagingTimeout(system, 0.05)
var hovered: AXUIElement?
var eventTap: CFMachPort?
var lastPointer: CGPoint?
var pendingClick: (point: CGPoint, screenshot: Bool)?
let outline = NSPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
outline.level = .screenSaver
outline.isOpaque = false
outline.backgroundColor = .clear
outline.ignoresMouseEvents = true
outline.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
outline.contentView?.wantsLayer = true
outline.contentView?.layer?.borderWidth = 2
outline.contentView?.layer?.borderColor = NSColor.systemPurple.cgColor
outline.contentView?.layer?.cornerRadius = 5
func attribute(_ element: AXUIElement, _ name: CFString) -> Any? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name, &value) == .success ? value : nil
}
func bounds(_ element: AXUIElement) -> CGRect? {
    guard let position = attribute(element, kAXPositionAttribute as CFString),
          let size = attribute(element, kAXSizeAttribute as CFString),
          CFGetTypeID(position as CFTypeRef) == AXValueGetTypeID(), CFGetTypeID(size as CFTypeRef) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero
    var dimensions = CGSize.zero
    guard AXValueGetValue(position as! AXValue, .cgPoint, &point), AXValueGetValue(size as! AXValue, .cgSize, &dimensions) else { return nil }
    return CGRect(origin: point, size: dimensions)
}
func containsSensitiveDescendant(_ element: AXUIElement, _ depth: Int, _ budget: inout Int) -> Bool {
    budget -= 1
    if budget < 0 || depth > 6 { return true }
    let role = attribute(element, kAXRoleAttribute as CFString) as? String ?? ""
    let subrole = attribute(element, kAXSubroleAttribute as CFString) as? String ?? ""
    if role == "AXSecureTextField" || subrole == "AXSecureTextField" { return true }
    let name = (attribute(element, kAXTitleAttribute as CFString) as? String ?? "").lowercased()
    if name.range(of: "password|secret|token|api.?key", options: .regularExpression) != nil { return true }
    guard let children = attribute(element, kAXChildrenAttribute as CFString) as? [AXUIElement] else { return false }
    return children.contains { containsSensitiveDescendant($0, depth + 1, &budget) }
}
func elementAt(_ point: CGPoint) -> AXUIElement? {
    var target: AXUIElement?
    AXUIElementCopyElementAtPosition(system, Float(point.x), Float(point.y), &target)
    var pid: pid_t = 0
    if let target {
        AXUIElementSetMessagingTimeout(target, 0.05)
        AXUIElementGetPid(target, &pid)
        if attribute(target, kAXRoleAttribute as CFString) as? String == "AXDockItem",
           bounds(target)?.contains(point) == true { return target }
    }
    let bundle = NSRunningApplication(processIdentifier: pid)?.bundleIdentifier
    if (target == nil || bundle == "com.apple.dock"),
       let process = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.dock").first {
        let dock = AXUIElementCreateApplication(process.processIdentifier)
        AXUIElementSetMessagingTimeout(dock, 0.05)
        var queue = [dock]
        var index = 0
        while index < queue.count && index < 100 {
            let item = queue[index]
            index += 1
            let role = attribute(item, kAXRoleAttribute as CFString) as? String
            if role == "AXDockItem", bounds(item)?.contains(point) == true { return item }
            if role != "AXDockItem",
               let children = attribute(item, kAXChildrenAttribute as CFString) as? [AXUIElement] {
                queue.append(contentsOf: children.prefix(100 - queue.count))
            }
        }
    }
    var candidate: AXUIElement? = target
    for _ in 0..<5 {
        guard let item = candidate else { break }
        if let rect = bounds(item), !rect.isEmpty, rect.contains(point) { return item }
        guard let parent = attribute(item, kAXParentAttribute as CFString),
              CFGetTypeID(parent as CFTypeRef) == AXUIElementGetTypeID() else { break }
        candidate = parent as! AXUIElement
    }
    return nil
}
@MainActor func select(_ point: CGPoint) {
    hovered = elementAt(point)
    guard let element = hovered, let rect = bounds(element) else { outline.orderOut(nil); return }
    let screenHeight = NSScreen.screens.first?.frame.height ?? 0
    outline.setFrame(CGRect(x: rect.minX, y: screenHeight - rect.maxY, width: rect.width, height: rect.height), display: true)
    outline.orderFrontRegardless()
}
let mask = (1 << CGEventType.mouseMoved.rawValue) | (1 << CGEventType.leftMouseDown.rawValue) | (1 << CGEventType.leftMouseUp.rawValue) | (1 << CGEventType.rightMouseDown.rawValue) | (1 << CGEventType.rightMouseUp.rawValue) | (1 << CGEventType.keyDown.rawValue)
eventTap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .defaultTap, eventsOfInterest: CGEventMask(mask), callback: { _, type, event, _ in
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        if let tap = eventTap { CGEvent.tapEnable(tap: tap, enable: true) }
        return nil
    }
    if type == .keyDown {
        if event.getIntegerValueField(.keyboardEventKeycode) == 53 { finish(["cancelled": true]) }
        return nil
    }
    if type == .mouseMoved { lastPointer = event.location; return Unmanaged.passUnretained(event) }
    if type == .leftMouseDown || type == .rightMouseDown {
        pendingClick = (event.location, type == .rightMouseDown)
        return nil
    }
    if (type == .leftMouseUp || type == .rightMouseUp), let click = pendingClick {
        pendingClick = nil
        DispatchQueue.main.async { completeSelection(click.point, screenshot: click.screenshot) }
    }
    return nil
}, userInfo: nil)
@MainActor func completeSelection(_ point: CGPoint, screenshot: Bool) {
    select(point)
    guard let element = hovered, let rect = bounds(element) else { return }
    var pid: pid_t = 0
    AXUIElementGetPid(element, &pid)
    let application = NSRunningApplication(processIdentifier: pid)
    let role = attribute(element, kAXRoleAttribute as CFString) as? String ?? ""
    let subrole = attribute(element, kAXSubroleAttribute as CFString) as? String ?? ""
    let secure = subrole == "AXSecureTextField" || role == "AXSecureTextField"
    var budget = 64
    let screenshotSensitive = screenshot && containsSensitiveDescendant(element, 0, &budget)
    let window = attribute(element, kAXWindowAttribute as CFString)
    var title = ""
    if let window, CFGetTypeID(window as CFTypeRef) == AXUIElementGetTypeID() { title = attribute(window as! AXUIElement, kAXTitleAttribute as CFString) as? String ?? "" }
    let label = secure ? "[redacted]" : [kAXTitleAttribute, kAXDescriptionAttribute, kAXHelpAttribute]
        .compactMap { attribute(element, $0 as CFString) as? String }
        .first { !$0.isEmpty } ?? ""
    outline.orderOut(nil)
    finish(["application": application?.localizedName ?? "", "bundleId": application?.bundleIdentifier ?? "", "window": title, "role": role, "name": label, "value": secure ? "[redacted]" : String(describing: attribute(element, kAXValueAttribute as CFString) ?? ""), "secure": secure, "screenshotSensitive": screenshotSensitive, "screenshotRequested": screenshot, "bounds": ["x": rect.minX, "y": rect.minY, "width": rect.width, "height": rect.height]])
}
guard let tap = eventTap else {
    if requestAccess && !CGPreflightListenEventAccess() { _ = CGRequestListenEventAccess() }
    finish(["error": "Allow KronOS in System Settings > Privacy & Security > Input Monitoring, then select again."])
}
let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)
lastPointer = CGEvent(source: nil)?.location
Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
    MainActor.assumeIsolated {
        guard let point = lastPointer else { return }
        lastPointer = nil
        select(point)
    }
}
DispatchQueue.main.asyncAfter(deadline: .now() + 60) { finish(["cancelled": true]) }
app.run()
