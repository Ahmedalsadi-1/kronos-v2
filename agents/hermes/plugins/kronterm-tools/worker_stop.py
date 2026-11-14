"""Keep a scoped Hermes worker alive until its native bridge operations settle."""

from contextlib import contextmanager
from contextvars import ContextVar
from functools import wraps
import logging
from threading import Event, Lock, Thread
import time

logger = logging.getLogger(__name__)
child_id = ContextVar("kronos_native_child_id", default="")
_install_lock = Lock()


@contextmanager
def bind_worker_stop(cancel):
    from run_agent import AIAgent

    with _install_lock:
        run = AIAgent.run_conversation
        binding = getattr(run, "_kronos_stop_binding", None)
        if binding is None:
            binding = ContextVar("kronos_worker_stop", default=None)

            @wraps(run)
            def run_and_drain(agent, *args, **kwargs):
                cancel_worker = binding.get()
                if cancel_worker is None or agent.platform != "subagent":
                    return run(agent, *args, **kwargs)
                identity = str(agent.session_id)
                token = child_id.set(identity)
                done = Event()

                def watch():
                    while not done.wait(0.05):
                        if agent._interrupt_requested:
                            cancel_worker(identity)
                            return

                Thread(target=watch, name="kronos-tool-stop", daemon=True).start()
                try:
                    return run(agent, *args, **kwargs)
                finally:
                    done.set()
                    try:
                        drain_worker(cancel_worker, identity, agent._touch_activity)
                    finally:
                        child_id.reset(token)

            run_and_drain._kronos_stop_binding = binding
            AIAgent.run_conversation = run_and_drain
    token = binding.set(cancel)
    try:
        yield
    finally:
        binding.reset(token)


def drain_worker(cancel, identity, touch_activity):
    failures = 0
    next_activity = time.monotonic()
    while True:
        result = cancel(identity)
        pending = result.get("pending")
        if type(pending) is int and pending >= 0:
            if pending == 0:
                return
            failures = 0
            if time.monotonic() >= next_activity:
                touch_activity("waiting for cancelled KronOS tool operations")
                next_activity = time.monotonic() + 5
        else:
            failures += 1
            if failures == 3:
                raise RuntimeError("KronOS could not confirm that this worker's native tools stopped.")
            logger.warning("Retrying native tool drain for worker %s", identity)
        time.sleep(0.1)
