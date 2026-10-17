---
name: kronterm-phone-control
description: Control connected Android phones, Android emulators, iPhone simulators, or configured physical iPhones through KronTerm device tools.
---

# KronTerm Phone Control

Use the device tools for guest or phone interaction; do not substitute host mouse control.

1. Call `device_list`. Select the exact observed `targetId` and read its capabilities and `controlGeneration`. A physical phone is a connected target, not a VM to create.
2. For a stopped emulator with `boot` capability, call `device_boot` with that ID and generation; list again until booted. Do not boot or shut down a physical phone. Do not boot every discovered emulator.
3. Capture `device_screenshot`. Use the current image to choose actions. `device_tap` and `device_swipe` use normalized coordinates from 0 to 1, not Linux pixel coordinates.
4. Supply the current `expectedGeneration` to mutating tools. Use `device_type`, `device_key`, `device_home`, `device_back`, and `device_rotate` only when advertised. Android keyboard keys include Enter, Backspace, Delete, Tab, Escape and arrows. Send full text in a single typing call. Inspect the screenshot after each meaningful action.
5. A stale generation or human pause means stop automation and refresh state. Do not take control back automatically. Ask the user to resume through the widget when paused.
6. Finish by reporting the observed result. Shut down only an emulator you started for a disposable task and were asked to close; never shut down the user's physical phone.

Emulators shut down after five minutes without input. Capturing or viewing the screen does not reset the idle timeout. Physical phones are excluded from automatic shutdown.

## Physical phones

Android requires a connected ADB device with debugging authorized by the phone owner. Physical iPhone control requires a working local Appium session and signed WebDriverAgent; configure `KRONTERM_APPIUM_URL` outside the tool arguments. A listed target does not guarantee every action is supported. If no phone appears, explain the actual missing connection or runtime rather than simulating a phone.

Unlocking, authentication, purchases, messages, and account changes remain separate user actions or require the task's corresponding authorization. Do not collect phone credentials.

## Agent shortcuts

- **phone observe**: `device_list` -> select exact target -> `device_screenshot`.
- **phone tap**: observe -> normalized tap with generation -> screenshot.
- **phone type**: observe editable field -> tap -> `device_type` -> screenshot.
- **phone swipe**: screenshot -> normalized start/end points -> `device_swipe` -> screenshot.
- **phone done**: report evidence; leave physical phones connected and return control to the user.
