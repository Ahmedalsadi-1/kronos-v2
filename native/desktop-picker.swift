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
guard AXIsProcessTrusted() else { finish(["error": "Enable Accessibility permission for KronTerm to select desktop elements."]) }
let system = AXUIElementCreateSystemWide()
AXUIElementSetMessagingTimeout(system, 0.05)
var hovered: AXUIElement?
var eventTap: CFMachPort?
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
func select(_ point: CGPoint) {
    var target: AXUIElement?
    hovered = nil
    if AXUIElementCopyElementAtPosition(system, Float(point.x), Float(point.y), &target) == .success {
        hovered = target
        if let target { AXUIElementSetMessagingTimeout(target, 0.05) }
    }
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
    if type == .mouseMoved { select(event.location); return Unmanaged.passUnretained(event) }
    if type == .leftMouseDown || type == .rightMouseDown {
        select(event.location)
        guard let element = hovered, let rect = bounds(element) else { return nil }
        var pid: pid_t = 0
        AXUIElementGetPid(element, &pid)
        let application = NSRunningApplication(processIdentifier: pid)
        let role = attribute(element, kAXRoleAttribute as CFString) as? String ?? ""
        let subrole = attribute(element, kAXSubroleAttribute as CFString) as? String ?? ""
        let secure = subrole == "AXSecureTextField" || role == "AXSecureTextField"
        var budget = 64
        let screenshotSensitive = type == .rightMouseDown && containsSensitiveDescendant(element, 0, &budget)
        let window = attribute(element, kAXWindowAttribute as CFString)
        var title = ""
        if let window, CFGetTypeID(window as CFTypeRef) == AXUIElementGetTypeID() { title = attribute(window as! AXUIElement, kAXTitleAttribute as CFString) as? String ?? "" }
        outline.orderOut(nil)
        finish(["application": application?.localizedName ?? "", "bundleId": application?.bundleIdentifier ?? "", "window": title, "role": role, "name": secure ? "[redacted]" : (attribute(element, kAXTitleAttribute as CFString) as? String ?? attribute(element, kAXDescriptionAttribute as CFString) as? String ?? ""), "value": secure ? "[redacted]" : String(describing: attribute(element, kAXValueAttribute as CFString) ?? ""), "secure": secure, "screenshotSensitive": screenshotSensitive, "screenshotRequested": type == .rightMouseDown, "bounds": ["x": rect.minX, "y": rect.minY, "width": rect.width, "height": rect.height]])
    }
    return nil
}, userInfo: nil)
guard let tap = eventTap else { finish(["error": "Desktop selection requires Accessibility and Input Monitoring permission."]) }
let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)
DispatchQueue.main.asyncAfter(deadline: .now() + 60) { finish(["cancelled": true]) }
app.run()
