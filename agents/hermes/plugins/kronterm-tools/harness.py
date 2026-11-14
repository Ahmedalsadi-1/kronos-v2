"""Bindings for the KronOS action and worker lifecycle policy."""

import ctypes
from contextvars import ContextVar
import hashlib
import json
import logging
from pathlib import Path
import sys
from threading import Lock, Thread

logger = logging.getLogger(__name__)
_turn = ContextVar("kronos_action_turn", default=None)
_deadlines_lock = Lock()
_deadlines = {}
_dispatcher = None


def _supports_shared_deadlines(lib):
    return all(hasattr(lib, "kronos_deadline_" + name) for name in ("schedule", "cancel", "next"))


_slots_abi = (
    ("new", [ctypes.c_uint32], ctypes.c_void_p),
    ("start", [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_size_t], ctypes.c_bool),
    ("complete", [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_size_t, ctypes.c_bool], ctypes.c_uint8),
    ("expire", [ctypes.c_void_p], None),
    ("expired", [ctypes.c_void_p], ctypes.c_bool),
    ("free", [ctypes.c_void_p], None),
)


def _supports_worker_slots(lib):
    return all(hasattr(lib, "kronos_slots_" + name) for name, _, _ in _slots_abi)


def _load():
    filename = {
        "darwin": "libkronos_agent_harness.dylib",
        "win32": "kronos_agent_harness.dll",
    }.get(sys.platform, "libkronos_agent_harness.so")
    plugin = Path(__file__).resolve().parent
    paths = (plugin / filename, plugin.parents[1] / "harness" / "target" / "release" / filename)
    for path in paths:
        if not path.is_file():
            continue
        try:
            lib = ctypes.CDLL(str(path))
            for name, args, result in (
                ("action_begin", [ctypes.c_char_p], ctypes.c_uint8),
                ("action_end", [ctypes.c_char_p, ctypes.c_bool], None),
                ("worker_new", [ctypes.c_uint32], ctypes.c_void_p),
                ("worker_wait", [ctypes.c_void_p], ctypes.c_bool),
                ("worker_finish", [ctypes.c_void_p], None),
                ("worker_free", [ctypes.c_void_p], None),
            ):
                function = getattr(lib, "kronos_" + name)
                function.argtypes, function.restype = args, result
            if _supports_shared_deadlines(lib):
                for name, args, result in (
                    ("deadline_schedule", [ctypes.c_uint32], ctypes.c_uint64),
                    ("deadline_cancel", [ctypes.c_uint64], ctypes.c_bool),
                    ("deadline_next", [], ctypes.c_uint64),
                ):
                    function = getattr(lib, "kronos_" + name)
                    function.argtypes, function.restype = args, result
            if _supports_worker_slots(lib):
                for name, args, result in _slots_abi:
                    function = getattr(lib, "kronos_slots_" + name)
                    function.argtypes, function.restype = args, result
            return lib
        except (OSError, AttributeError) as error:
            logger.warning("Could not load the KronOS harness: %s", error)
    return None


_native = _load()


def register_action_middleware(ctx, mutations):
    if _native is None:
        logger.warning("KronOS Rust harness is unavailable. Run npm run build:agent-harness or reinstall KronOS.")
        return

    def bind(tool_name, args, next_call, session_id="", turn_id="", **_):
        if tool_name not in mutations or not (session_id and turn_id):
            return next_call(args)
        token = _turn.set((session_id, turn_id))
        try:
            return next_call(args)
        finally:
            _turn.reset(token)

    ctx.register_middleware("tool_execution", bind)


def run_action(name, args, execute):
    turn = _turn.get()
    if turn is None:
        return execute()
    key = hashlib.sha256(json.dumps([*turn, name, args], sort_keys=True, separators=(",", ":")).encode()).digest()
    decision = _native.kronos_action_begin(key)
    if decision == 1:
        return {"error": "An identical action is still running. Wait for its result and inspect the target."}
    if decision == 2:
        return {
            "error": "The previous identical action has an uncertain outcome. Inspect the exact target and report the observed state before attempting it in a new turn.",
            "failure": {"code": "UNCERTAIN_ACTION_REPLAY", "retryable": False, "uncertain": True},
        }
    if decision != 0:
        return {"error": "The KronOS action guard is at capacity. Pause and inspect the target."}
    uncertain = True
    try:
        response = execute()
        metadata = response.get("_meta")
        failure = response.get("failure") or (metadata.get("failure") if isinstance(metadata, dict) else None)
        uncertain = (
            isinstance(failure, dict) and failure.get("uncertain") is True
            or not response.get("error") and not isinstance(response.get("content"), list)
        )
        return response
    finally:
        _native.kronos_action_end(key, uncertain)


class WorkerBudget:
    def __init__(self, milliseconds):
        self._lib = _native
        self._handle = self._lib.kronos_worker_new(milliseconds)

    def start(self, expire):
        def wait():
            if self._lib.kronos_worker_wait(self._handle):
                expire()()
        Thread(target=wait, name="kronos-worker-deadline", daemon=True).start()

    def finish(self):
        self._lib.kronos_worker_finish(self._handle)

    def __del__(self):
        self._lib.kronos_worker_free(self._handle)


def _dispatch_deadlines(lib):
    while True:
        identity = lib.kronos_deadline_next()
        with _deadlines_lock:
            expire = _deadlines.get(identity)
        if expire is None:
            continue
        try:
            cleanup = expire()
        except Exception:
            logger.exception("KronOS could not expire a worker batch")
            with _deadlines_lock:
                _deadlines.pop(identity, None)
            continue

        def settle(identity, cleanup):
            try:
                cleanup()
            except Exception:
                logger.exception("KronOS could not release an expired worker batch")
            finally:
                with _deadlines_lock:
                    _deadlines.pop(identity, None)

        try:
            Thread(target=settle, args=(identity, cleanup), name="kronos-worker-expiry", daemon=True).start()
        except RuntimeError:
            settle(identity, cleanup)
        del expire, cleanup


class ScheduledWorkerBudget:
    def __init__(self, milliseconds):
        self._lib = _native
        self._milliseconds = milliseconds
        self._id = 0

    def start(self, expire):
        global _dispatcher
        with _deadlines_lock:
            if _dispatcher is None:
                dispatcher = Thread(target=_dispatch_deadlines, args=(self._lib,), name="kronos-deadlines", daemon=True)
                dispatcher.start()
                _dispatcher = dispatcher
            if len(_deadlines) >= 128:
                raise RuntimeError("The KronOS worker deadline scheduler is at capacity.")
            self._id = self._lib.kronos_deadline_schedule(self._milliseconds)
            if not self._id:
                raise RuntimeError("The KronOS worker deadline scheduler is at capacity.")
            _deadlines[self._id] = expire

    def finish(self):
        with _deadlines_lock:
            if self._id and self._lib.kronos_deadline_cancel(self._id):
                _deadlines.pop(self._id, None)
            self._id = 0


def worker_budget(config):
    seconds = (config.get("delegation") or {}).get("kronos_wall_timeout_seconds", 300)
    if not isinstance(seconds, (int, float)) or isinstance(seconds, bool) or not 0 < seconds <= 900:
        seconds = 300
    if _native is None:
        return None
    budget_type = ScheduledWorkerBudget if _supports_shared_deadlines(_native) else WorkerBudget
    return budget_type(max(1, round(seconds * 1000)))


class NativeWorkerSlots:
    def __init__(self, lib, task_count):
        self._lib = lib
        self._handle = lib.kronos_slots_new(task_count)
        if not self._handle:
            raise RuntimeError("KronOS could not allocate worker slots.")

    def start(self, identity):
        key = identity.encode()
        return self._lib.kronos_slots_start(self._handle, key, len(key))

    def complete(self, identity, refused):
        key = identity.encode()
        return self._lib.kronos_slots_complete(self._handle, key, len(key), refused)

    def expire(self):
        self._lib.kronos_slots_expire(self._handle)

    @property
    def expired(self):
        return self._lib.kronos_slots_expired(self._handle)

    def __del__(self):
        if self._handle:
            self._lib.kronos_slots_free(self._handle)


def worker_slots(task_count):
    if _native is not None and _supports_worker_slots(_native):
        return NativeWorkerSlots(_native, task_count)
    return None
