# Shared agent backend contract

Hermes delegates through the validated desktop KronosCode backend. Delegated KronosCode sessions use the same backend session store as KronosChamber. Hermes chat IDs and KronosCode session IDs remain distinct; attachment does not merge transcripts or replay tool effects.

Startup transitions: idle -> resolving KronosCode -> validating backend -> launching Hermes -> ready. Failure to validate the delegation backend fails startup rather than silently spawning an isolated backend. Backend credentials travel through the child environment, never command arguments or renderer descriptors.

Each Hermes launch resolves the current backend endpoint and credentials. A changed backend instance, endpoint, or credential causes Hermes to restart automatically while retaining its active surface context. Shutdown invalidates pending startup work so late health responses cannot restore a stopped connection. Pending prompts are not automatically replayed. Existing persisted backend sessions remain available through the backend's session APIs.
