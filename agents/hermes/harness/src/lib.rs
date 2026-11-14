// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

use std::collections::{BTreeSet, HashMap};
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};

const ACTION_LIMIT: usize = 4096;
const UNCERTAIN_ACTION_TTL: Duration = Duration::from_secs(900);

type ActionKey = [u8; 32];

enum Fence {
    InFlight,
    Uncertain(Instant),
}

#[derive(Default)]
struct ActionFences {
    by_key: HashMap<ActionKey, Fence>,
    expiry: BTreeSet<(Instant, ActionKey)>,
}

impl ActionFences {
    fn begin(&mut self, key: ActionKey, now: Instant) -> u8 {
        match self.by_key.get(&key) {
            Some(Fence::InFlight) => return 1,
            Some(Fence::Uncertain(until)) if *until > now => return 2,
            Some(Fence::Uncertain(until)) => {
                self.expiry.remove(&(*until, key));
                self.by_key.insert(key, Fence::InFlight);
                return 0;
            }
            None => {}
        }

        if self.by_key.len() >= ACTION_LIMIT {
            // Reclaim one slot without scanning every active or unexpired action.
            if self.expiry.first().is_some_and(|(until, _)| *until <= now) {
                let (_, expired_key) = self.expiry.pop_first().unwrap();
                self.by_key.remove(&expired_key);
            } else {
                return 3;
            }
        }

        self.by_key.insert(key, Fence::InFlight);
        0
    }

    fn end(&mut self, key: ActionKey, uncertain: bool, now: Instant) {
        if let Some(Fence::Uncertain(until)) = self.by_key.get(&key) {
            self.expiry.remove(&(*until, key));
        }
        if uncertain {
            if let Some(fence) = self.by_key.get_mut(&key) {
                let until = now + UNCERTAIN_ACTION_TTL;
                *fence = Fence::Uncertain(until);
                self.expiry.insert((until, key));
            }
        } else {
            self.by_key.remove(&key);
        }
    }
}

static ACTIONS: OnceLock<Mutex<ActionFences>> = OnceLock::new();

fn actions() -> &'static Mutex<ActionFences> {
    ACTIONS.get_or_init(|| Mutex::new(ActionFences::default()))
}

/// The adapter supplies a SHA-256 digest of the session, turn, tool and arguments.
/// Returns 0 for admission, 1 for in-flight, 2 for an uncertain result, 3 at capacity.
///
/// # Safety
/// `key` must point to a readable 32-byte digest for the duration of the call.
#[no_mangle]
pub unsafe extern "C" fn kronos_action_begin(key: *const [u8; 32]) -> u8 {
    actions().lock().unwrap().begin(*key, Instant::now())
}

/// # Safety
/// `key` must point to the same readable 32-byte digest used for admission.
#[no_mangle]
pub unsafe extern "C" fn kronos_action_end(key: *const [u8; 32], uncertain: bool) {
    actions()
        .lock()
        .unwrap()
        .end(*key, uncertain, Instant::now())
}

const DEADLINE_LIMIT: usize = 4096;

#[derive(Default)]
struct DeadlineQueue {
    next_id: u64,
    by_id: HashMap<u64, Instant>,
    by_time: BTreeSet<(Instant, u64)>,
}

impl DeadlineQueue {
    fn schedule(&mut self, deadline: Instant) -> u64 {
        let Some(id) = self.next_id.checked_add(1) else {
            return 0;
        };
        if self.by_id.len() >= DEADLINE_LIMIT {
            return 0;
        }
        self.next_id = id;
        self.by_id.insert(id, deadline);
        self.by_time.insert((deadline, id));
        id
    }

    fn cancel(&mut self, id: u64) -> bool {
        self.by_id
            .remove(&id)
            .is_some_and(|deadline| self.by_time.remove(&(deadline, id)))
    }
}

#[derive(Default)]
struct DeadlineScheduler {
    queue: Mutex<DeadlineQueue>,
    changed: Condvar,
}

impl DeadlineScheduler {
    fn schedule(&self, milliseconds: u32) -> u64 {
        let mut queue = self.queue.lock().unwrap();
        let previous_head = queue.by_time.first().copied();
        let id = queue.schedule(Instant::now() + Duration::from_millis(milliseconds.into()));
        if queue.by_time.first().copied() != previous_head {
            self.changed.notify_one();
        }
        id
    }

    fn cancel(&self, id: u64) -> bool {
        let mut queue = self.queue.lock().unwrap();
        let is_head = queue.by_time.first().is_some_and(|(_, head)| *head == id);
        let cancelled = queue.cancel(id);
        if is_head {
            self.changed.notify_one();
        }
        cancelled
    }

    fn next(&self) -> u64 {
        let mut queue = self.queue.lock().unwrap();
        loop {
            let Some((deadline, id)) = queue.by_time.first().copied() else {
                queue = self.changed.wait(queue).unwrap();
                continue;
            };
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                queue.cancel(id);
                return id;
            }
            (queue, _) = self.changed.wait_timeout(queue, remaining).unwrap();
        }
    }
}

static DEADLINES: OnceLock<DeadlineScheduler> = OnceLock::new();

fn deadlines() -> &'static DeadlineScheduler {
    DEADLINES.get_or_init(DeadlineScheduler::default)
}

/// Registers a monotonic deadline. Returns 0 if the process queue is full.
#[no_mangle]
pub extern "C" fn kronos_deadline_schedule(milliseconds: u32) -> u64 {
    deadlines().schedule(milliseconds)
}

/// Cancels a queued deadline. Returns false if the ID is unknown or was already delivered.
#[no_mangle]
pub extern "C" fn kronos_deadline_cancel(id: u64) -> bool {
    deadlines().cancel(id)
}

/// Blocks until an expired deadline is delivered. Use a single dispatcher per process.
#[no_mangle]
pub extern "C" fn kronos_deadline_next() -> u64 {
    deadlines().next()
}

pub struct WorkerBudget {
    deadline: Instant,
    finished: Mutex<bool>,
    changed: Condvar,
}

#[no_mangle]
pub extern "C" fn kronos_worker_new(milliseconds: u32) -> *mut WorkerBudget {
    Box::into_raw(Box::new(WorkerBudget {
        deadline: Instant::now() + Duration::from_millis(milliseconds.into()),
        finished: Mutex::new(false),
        changed: Condvar::new(),
    }))
}

/// # Safety
/// The budget must stay alive until this call returns.
#[no_mangle]
pub unsafe extern "C" fn kronos_worker_wait(budget: &WorkerBudget) -> bool {
    let finished = budget.finished.lock().unwrap();
    let remaining = budget.deadline.saturating_duration_since(Instant::now());
    let (finished, _) = budget
        .changed
        .wait_timeout_while(finished, remaining, |finished| !*finished)
        .unwrap();
    !*finished
}

/// # Safety
/// The budget must stay alive until this call returns.
#[no_mangle]
pub unsafe extern "C" fn kronos_worker_finish(budget: &WorkerBudget) {
    *budget.finished.lock().unwrap() = true;
    budget.changed.notify_all();
}

/// # Safety
/// The adapter must free this allocation once, after every other call returns.
#[no_mangle]
pub unsafe extern "C" fn kronos_worker_free(budget: *mut WorkerBudget) {
    drop(Box::from_raw(budget));
}

const MAX_WORKER_SLOTS: u32 = 4;
const MAX_WORKER_KEY_BYTES: usize = 1024;

pub struct WorkerSlots {
    state: Mutex<WorkerSlotState>,
}

struct WorkerSlotState {
    // A key is absent before start, true while active and false after completion.
    slots: HashMap<Vec<u8>, bool>,
    capacity: usize,
    remaining: u32,
    expired: bool,
}

#[no_mangle]
pub extern "C" fn kronos_slots_new(count: u32) -> *mut WorkerSlots {
    if !(1..=MAX_WORKER_SLOTS).contains(&count) {
        return std::ptr::null_mut();
    }
    Box::into_raw(Box::new(WorkerSlots {
        state: Mutex::new(WorkerSlotState {
            slots: HashMap::new(),
            capacity: count as usize,
            remaining: count,
            expired: false,
        }),
    }))
}

/// # Safety
/// The slot batch must stay alive until this call returns. The key must point to
/// a readable byte slice of the given length.
#[no_mangle]
pub unsafe extern "C" fn kronos_slots_start(
    batch: *const WorkerSlots,
    key: *const u8,
    len: usize,
) -> bool {
    let Some(batch) = batch.as_ref() else {
        return false;
    };
    if key.is_null() || len == 0 || len > MAX_WORKER_KEY_BYTES {
        return false;
    }
    let key = std::slice::from_raw_parts(key, len);
    let mut state = batch.state.lock().unwrap();
    if let Some(active) = state.slots.get(key) {
        return *active;
    }
    // Late starts still need a handle for interruption at the model boundary.
    if state.slots.len() >= state.capacity {
        return false;
    }
    state.slots.insert(key.to_vec(), true);
    true
}

/// Returns 0 for an ignored completion, 1 for an accepted completion, or 2
/// when the last slot is completed.
///
/// # Safety
/// The slot batch must stay alive until this call returns. The key must point to
/// a readable byte slice of the given length.
#[no_mangle]
pub unsafe extern "C" fn kronos_slots_complete(
    batch: *const WorkerSlots,
    key: *const u8,
    len: usize,
    refused: bool,
) -> u8 {
    let Some(batch) = batch.as_ref() else {
        return 0;
    };
    if key.is_null() || len == 0 || len > MAX_WORKER_KEY_BYTES {
        return 0;
    }
    let key = std::slice::from_raw_parts(key, len);
    let mut state = batch.state.lock().unwrap();
    if state.remaining == 0 {
        return 0;
    }
    let has_space = state.slots.len() < state.capacity;
    match state.slots.get_mut(key) {
        Some(active) if *active => *active = false,
        None if refused && has_space => {
            state.slots.insert(key.to_vec(), false);
        }
        _ => return 0,
    }
    state.remaining -= 1;
    if state.remaining == 0 {
        2
    } else {
        1
    }
}

/// # Safety
/// The slot batch must stay alive until this call returns.
#[no_mangle]
pub unsafe extern "C" fn kronos_slots_expire(batch: *const WorkerSlots) {
    if let Some(batch) = batch.as_ref() {
        batch.state.lock().unwrap().expired = true;
    }
}

/// # Safety
/// The slot batch must stay alive until this call returns.
#[no_mangle]
pub unsafe extern "C" fn kronos_slots_expired(batch: *const WorkerSlots) -> bool {
    batch
        .as_ref()
        .is_some_and(|batch| batch.state.lock().unwrap().expired)
}

/// # Safety
/// The adapter must free this allocation once, after every other call returns.
#[no_mangle]
pub unsafe extern "C" fn kronos_slots_free(batch: *mut WorkerSlots) {
    if !batch.is_null() {
        drop(Box::from_raw(batch));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_uncertain_or_in_flight_actions_stay_fenced() {
        let key = [42; 32];
        unsafe {
            assert_eq!(kronos_action_begin(&key), 0);
            assert_eq!(kronos_action_begin(&key), 1);
            kronos_action_end(&key, false);
            assert_eq!(kronos_action_begin(&key), 0);
            kronos_action_end(&key, true);
            assert_eq!(kronos_action_begin(&key), 2);
        }
    }

    #[test]
    fn full_fence_table_reclaims_only_expired_keys() {
        let mut fences = ActionFences::default();
        let now = Instant::now();
        let key_for = |id: usize| {
            let mut key = [0; 32];
            key[..std::mem::size_of::<usize>()].copy_from_slice(&id.to_le_bytes());
            key
        };
        for id in 0..ACTION_LIMIT {
            assert_eq!(fences.begin(key_for(id), now), 0);
        }
        fences.end(key_for(0), true, now);
        fences.end(key_for(1), true, now);
        let incoming = key_for(ACTION_LIMIT);
        assert_eq!(fences.begin(incoming, now), 3);
        assert_eq!(fences.begin(key_for(0), now), 2);
        assert_eq!(fences.begin(key_for(2), now), 1);

        let expired = now + UNCERTAIN_ACTION_TTL;
        assert_eq!(fences.begin(key_for(0), expired), 0);
        assert_eq!(fences.begin(incoming, expired), 0);
        assert_eq!(fences.begin(key_for(1), expired), 3);
        assert_eq!(fences.begin(key_for(0), expired), 1);
        assert_eq!(fences.by_key.len(), ACTION_LIMIT);
        assert!(fences.expiry.is_empty());
    }

    #[test]
    fn deadlines_deliver_earliest_once_and_skip_cancelled_entries() {
        let scheduler = DeadlineScheduler::default();
        let late = scheduler.schedule(60_000);
        let cancelled = scheduler.schedule(0);
        let first = scheduler.schedule(0);
        let second = scheduler.schedule(0);

        assert!(scheduler.cancel(cancelled));
        assert!(!scheduler.cancel(cancelled));
        assert_eq!(scheduler.next(), first);
        assert!(!scheduler.cancel(first));
        assert_eq!(scheduler.next(), second);
        assert!(scheduler.cancel(late));
        assert!(scheduler.queue.lock().unwrap().by_time.is_empty());
    }

    #[test]
    fn newly_scheduled_deadline_wakes_dispatcher() {
        let scheduler = DeadlineScheduler::default();
        let late = scheduler.schedule(60_000);
        std::thread::scope(|threads| {
            let (send, receive) = std::sync::mpsc::channel();
            let scheduler = &scheduler;
            threads.spawn(move || send.send(scheduler.next()).unwrap());
            let immediate = scheduler.schedule(0);
            assert_eq!(
                receive.recv_timeout(Duration::from_secs(2)).ok(),
                Some(immediate)
            );
            assert!(scheduler.cancel(late));
        });
    }

    #[test]
    fn deadline_queue_capacity_recovers_after_cancellation() {
        let scheduler = DeadlineScheduler::default();
        let cancelled = scheduler.schedule(60_000);
        for _ in 1..DEADLINE_LIMIT {
            assert_ne!(scheduler.schedule(60_000), 0);
        }
        assert_eq!(scheduler.schedule(0), 0);
        assert!(scheduler.cancel(cancelled));
        let replacement = scheduler.schedule(0);
        assert!(replacement > cancelled);
        assert_eq!(scheduler.next(), replacement);
    }

    #[test]
    fn worker_slots_reject_invalid_inputs_and_preserve_registered_workers() {
        let null_key = std::ptr::null();
        let child = b"child";
        let other = b"other";
        assert!(kronos_slots_new(0).is_null());
        assert!(kronos_slots_new(MAX_WORKER_SLOTS + 1).is_null());
        let batch = kronos_slots_new(1);
        unsafe {
            assert!(!kronos_slots_start(
                std::ptr::null(),
                child.as_ptr(),
                child.len()
            ));
            assert!(!kronos_slots_start(batch, null_key, 1));
            assert!(!kronos_slots_start(batch, child.as_ptr(), 0));
            assert!(!kronos_slots_start(
                batch,
                child.as_ptr(),
                MAX_WORKER_KEY_BYTES + 1
            ));
            assert_eq!(kronos_slots_complete(batch, null_key, 1, true), 0);

            kronos_slots_expire(batch);
            assert!(kronos_slots_start(batch, child.as_ptr(), child.len()));
            assert!(!kronos_slots_start(batch, other.as_ptr(), other.len()));
            assert_eq!(
                kronos_slots_complete(batch, other.as_ptr(), other.len(), true),
                0
            );
            assert_eq!(
                kronos_slots_complete(batch, child.as_ptr(), child.len(), false),
                2
            );
            assert!(!kronos_slots_start(batch, child.as_ptr(), child.len()));
            kronos_slots_free(batch);
        }
    }

    #[test]
    fn worker_slots_count_active_and_refused_routes_once() {
        let batch = kronos_slots_new(2);
        let child = b"child";
        let refused = b"refused";
        unsafe {
            let slots = batch;
            assert_eq!(
                kronos_slots_complete(slots, child.as_ptr(), child.len(), false),
                0
            );
            assert!(kronos_slots_start(slots, child.as_ptr(), child.len()));
            assert!(kronos_slots_start(slots, child.as_ptr(), child.len()));
            assert_eq!(
                kronos_slots_complete(slots, refused.as_ptr(), refused.len(), true),
                1
            );
            assert_eq!(
                kronos_slots_complete(slots, refused.as_ptr(), refused.len(), true),
                0
            );
            assert!(!kronos_slots_start(slots, refused.as_ptr(), refused.len()));
            assert!(!kronos_slots_expired(slots));
            kronos_slots_expire(slots);
            assert!(kronos_slots_expired(slots));
            assert_eq!(
                kronos_slots_complete(slots, child.as_ptr(), child.len(), false),
                2
            );
            assert_eq!(
                kronos_slots_complete(slots, child.as_ptr(), child.len(), true),
                0
            );
            kronos_slots_free(batch);
        }
    }

    #[test]
    fn completed_budget_wakes_waiter_and_zero_budget_expires() {
        let finished = kronos_worker_new(60_000);
        let expired = kronos_worker_new(0);
        unsafe {
            std::thread::scope(|threads| {
                let budget = &*finished;
                let waiter = threads.spawn(|| kronos_worker_wait(budget));
                kronos_worker_finish(budget);
                assert!(!waiter.join().unwrap());
            });
            assert!(kronos_worker_wait(&*expired));
            kronos_worker_free(finished);
            kronos_worker_free(expired);
        }
    }
}
