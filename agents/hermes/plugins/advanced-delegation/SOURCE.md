# Advanced Delegation source

NousResearch/hermes-official-plugins, reviewed commit
`e404b6816b20237a82f6fbe2749b5a576cf75dba`, `advanced-delegation/` (MIT).
Only the manifest kind changes from standalone to backend so this explicitly
bundled provider loads without replacing the user profile's plugin allowlist.
The routing, CLI, slash command and tests retain upstream source.
KronTerm's scope/readiness middleware lives in the separate kronterm-tools adapter.
