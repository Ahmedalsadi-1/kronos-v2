import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time

root = Path(__file__).resolve().parents[3]
binary = root / "dist/native/background-computer"
evidence = Path(__file__).with_name("window-group-smoke.json")
results = {}
app = None
temporary = tempfile.TemporaryDirectory(prefix="kronterm-window-group-")
first = Path(temporary.name) / "group-document-one.txt"
second = Path(temporary.name) / "group-document-two.txt"
text = "KronTerm assigned native window group test.\n"


def call(action, **args):
    completed = subprocess.run(
        [str(binary)], input=json.dumps({"action": action, **args}),
        text=True, capture_output=True, timeout=45,
    )
    result = json.loads(completed.stdout)
    return {"exitCode": completed.returncode, "result": result}


def require(receipt):
    if receipt["exitCode"]:
        raise RuntimeError(receipt["result"].get("error", "Native operation failed"))
    return receipt["result"]


def scope(windows):
    return {
        "allowedWindowIds": [window["windowId"] for window in windows],
        "expectedWindowSpaces": {str(window["windowId"]): window["spaceIds"] for window in windows},
        "expectedWindowDisplays": {str(window["windowId"]): window["displayIds"] for window in windows},
    }


def inventory():
    last = None
    for _ in range(10):
        last = call("inventory_windows", **app)
        if last["exitCode"] == 0:
            return last["result"]["windows"]
        time.sleep(0.2)
    return require(last)["windows"]


def foreground():
    for _ in range(5):
        status = require(call("status"))
        if status.get("frontmostPid", 0) > 0:
            return status
        time.sleep(0.2)
    raise RuntimeError("The native foreground app could not be verified.")


try:
    before = foreground()
    results["frontmostBefore"] = before["frontmostPid"]
    if "com.apple.TextEdit" in before["runningBundleIds"]:
        raise RuntimeError("TextEdit is already running; no existing app was touched.")
    launched = require(call("launch", bundleId="com.apple.TextEdit"))
    app = {key: launched[key] for key in ["pid", "bundleId", "launchTime"]}
    results["launch"] = {"isActive": launched["isActive"], "pid": app["pid"]}
    time.sleep(0.75)
    initial = inventory()
    first.write_text(text)
    second.write_text(text)
    results["openFirst"] = call("open_file", **app, **scope(initial), filePath=str(first))
    require(results["openFirst"])
    windows = []
    for _ in range(10):
        windows = inventory()
        if any(window["title"].startswith(first.stem) for window in windows):
            break
        time.sleep(0.2)
    if not windows:
        raise RuntimeError("No exact native windows were found.")
    assigned = scope(windows)
    results["membership"] = windows
    observed = require(call("observe", **app, **assigned))
    results["observation"] = {"elements": len(observed["elements"]), "windowIds": [w["windowId"] for w in observed["windows"]], "screenshot": "imageDataUrl" in observed}
    bad_space = {**assigned, "expectedWindowSpaces": {str(w["windowId"]): ["0"] for w in windows}}
    results["wrongDesktop"] = call("observe", **app, **bad_space)
    bad_display = {**assigned, "expectedWindowDisplays": {str(w["windowId"]): [4294967295] for w in windows}}
    results["wrongDisplay"] = call("observe", **app, **bad_display)
    results["openSecond"] = call("open_file", **app, **assigned, filePath=str(second))
    require(results["openSecond"])
    latest = []
    for _ in range(10):
        latest = inventory()
        if len(latest) > len(windows):
            break
        time.sleep(0.2)
    pending = require(call("observe", **app, **assigned))
    results["unapprovedWindow"] = {"pendingIds": pending["pendingWindowIds"], "observedIds": [w["windowId"] for w in pending["windows"]], "elementWindowIds": sorted(set(e["windowId"] for e in pending["elements"]))}
    results["unapprovedMutation"] = call("press", **app, **assigned, windowId=windows[0]["windowId"], elementId=str(windows[0]["windowId"]), treeFingerprint=pending["treeFingerprint"], identity={})
    results["frontmostAfter"] = foreground()["frontmostPid"]
    results["passed"] = (
        results["wrongDesktop"]["exitCode"] != 0
        and results["wrongDisplay"]["exitCode"] != 0
        and results["unapprovedMutation"]["exitCode"] != 0
        and bool(pending["pendingWindowIds"])
        and set(e["windowId"] for e in pending["elements"]).issubset(set(assigned["allowedWindowIds"]))
        and results["frontmostBefore"] == results["frontmostAfter"]
    )
except Exception as error:
    results["error"] = str(error)
    results["passed"] = False
finally:
    if app is not None:
        status = require(call("status"))
        valid = call("inventory_windows", **app)
        unchanged = all(not file.exists() or file.read_text() == text for file in [first, second])
        if valid["exitCode"] == 0 and status.get("frontmostPid", 0) > 0 and status["frontmostPid"] != app["pid"] and unchanged:
            os.kill(app["pid"], signal.SIGTERM)
            results["testProcessCleanup"] = {"pid": app["pid"], "identityVerified": True, "contentUnchanged": True}
        else:
            results["testProcessCleanup"] = {"preserved": True, "reason": "Identity, foreground or content changed"}
    evidence.write_text(json.dumps(results, indent=2) + "\n")
    if results.get("testProcessCleanup", {}).get("preserved"):
        temporary._finalizer.detach()
        results["preservedFixtureDirectory"] = temporary.name
        evidence.write_text(json.dumps(results, indent=2) + "\n")
    else:
        temporary.cleanup()
print(json.dumps(results, indent=2))
raise SystemExit(0 if results.get("passed") else 1)
