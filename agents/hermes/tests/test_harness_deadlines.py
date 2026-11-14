import importlib.util
from pathlib import Path
from threading import Event
from types import SimpleNamespace

import pytest


@pytest.fixture
def harness():
    path = Path(__file__).resolve().parents[1] / "plugins" / "kronterm-tools" / "harness.py"
    spec = importlib.util.spec_from_file_location("harness_deadline_tests", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_partial_scheduler_abi_uses_legacy_waiter(harness, monkeypatch):
    lib = SimpleNamespace(kronos_deadline_schedule=lambda _: 1, kronos_worker_new=lambda _: 42)
    monkeypatch.setattr(harness, "_native", lib)
    lib.kronos_worker_free = lambda _: None
    assert isinstance(harness.worker_budget({}), harness.WorkerBudget)


def test_failed_expiry_does_not_drop_next_deadline(harness, caplog):
    def fail_expiry():
        raise ValueError("broken expiry")

    cleanup = Event()
    harness._deadlines.update({1: fail_expiry, 2: lambda: cleanup.set})
    lib = SimpleNamespace(kronos_deadline_next=iter((1, 2)).__next__)
    with pytest.raises(StopIteration):
        harness._dispatch_deadlines(lib)
    assert cleanup.wait(timeout=1)
    assert 1 not in harness._deadlines
    assert "KronOS could not expire a worker batch" in caplog.text


def test_worker_slots_use_legacy_accounting_for_partial_abi(harness, monkeypatch):
    monkeypatch.setattr(harness, "_native", SimpleNamespace(kronos_slots_new=lambda _: 42))
    assert harness.worker_slots(2) is None


def test_native_worker_slots_account_once_per_identity(harness):
    slots = harness.worker_slots(2)
    if slots is None:
        pytest.skip("Build the KronOS harness to exercise its worker slots ABI.")
    assert slots.complete("unstarted", False) == 0
    assert slots.start("worker")
    assert slots.complete("refused:1", True) == 1
    assert slots.complete("refused:1", True) == 0
    assert not slots.start("refused:1")
    assert not slots.expired
    slots.expire()
    assert slots.expired
    assert slots.complete("worker", False) == 2
    assert slots.complete("worker", False) == 0
