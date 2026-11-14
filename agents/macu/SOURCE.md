# MACU planner source

This directory and the files identified below contain a TypeScript adaptation of
[Multi-Agent Computer Use](https://github.com/kohjingyu/multi-agent-computer-use/tree/5b1b8f91dfc5dc66a2f06af4b443b3009a9cd105)
by Jing Yu Koh and contributors, pinned to commit
`5b1b8f91dfc5dc66a2f06af4b443b3009a9cd105`. The upstream Apache-2.0 license is
reproduced verbatim in [LICENSE](./LICENSE). The pinned revision has no NOTICE file.

| KronOS file                     | Upstream source                                                                                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agents/macu/planner-prompt.ts` | `prompts/manager_cua_v2.yaml` and `prompts/replan.yaml`                                                                                                                                                              |
| `emain/macu-planner.ts`         | `utils/graph_utils.py` functions `generate_validated_dependency_graph`, `validate_dependency_graph`, `validate_subtask_ids`, `topological_sort_levels`, `compute_aggregation_ancestors`, and `apply_replan_decision` |
| `emain/macu-planner.test.ts`    | Topological chain and cycle fixtures adapted from `tests/test_run_macu_args_and_graph.py`                                                                                                                            |

KronOS preserves the manager prompt's decomposition principles, the subtasks and
aggregation graph schema, validation-driven correction retries, and topological
graph checks. The adaptation binds workers to host-supplied targets, adds
observable success criteria, requires a manager aggregation sink, validates its
dependency closure, and rejects graphs that remain invalid. The completion
provider is injected and bounded by a shared deadline. The parser accepts a
single JSON document with an optional enclosing Markdown fence.

The Electron adapter projects the validated CUA subtasks into a versioned
worker-only plan for KronOS. The host owns scheduling and aggregation. The
replanner preserves MACU's no-change and add/remove/modify decision schema,
evidence-based instruction enrichment, frozen work, and tentative graph
validation. It only edits pending work, and the host commits accepted changes
against the current plan revision. Cancellation and aggregation remain host
operations.

The adaptation excludes the upstream Python runtime, OSWorld, provider clients,
VM snapshot mechanics, file transfer, and computer actions.
