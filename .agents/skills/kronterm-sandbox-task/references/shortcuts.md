# Machine task shortcuts

These are tool-use recipes, not shell commands or an autonomous scheduler.

| Shortcut | Sequence | Result |
| --- | --- | --- |
| sandbox observe | linux_desktop_list -> linux_desktop_screenshot using current assignment/generation | Current guest image |
| sandbox click | screenshot -> linux_desktop_click with pixel coordinates -> screenshot | Verified pointer action |
| sandbox type | click editable control -> linux_desktop_type -> screenshot | Verified text entry |
| sandbox command | linux_desktop_exec -> inspect bounded output -> screenshot when visual evidence matters | Guest-only command result |
| phone observe | device_list -> device_screenshot | Current actual phone image |
| phone tap | screenshot -> device_tap normalized coordinates/current generation -> screenshot | Verified phone interaction |
| pause | Stop issuing mutations after human takeover or lease mismatch | Human control retained |

Choose only actions supported by the selected target. Do not run a loop without a task-specific stopping condition.
