# Hermes tool bridge

The `kronterm-tools` plugin registers the desktop TypeScript tool manifest with
Hermes. Availability comes from the live workspace-scoped tool list; the desktop
validates capability again when a tool executes.

- `browser_navigate` is exposed as `kronterm_browser_navigate` to preserve Hermes's
  own browser tool.
- `tool_search` is exposed as `kronterm_tool_search` to preserve Hermes's discovery
  configuration. It searches the enabled catalog and can return input schemas.
- `app_workflow` returns inspection, draft, and publishing recipes for existing
  browser or native app sessions. It does not connect accounts or execute actions.

Capability discovery caches successful responses for 20 seconds, scoped to the
bridge URL and token. A failed refresh disables the catalog and caches that failure
for two seconds so availability probes do not flood an unavailable bridge. Failed
calls invalidate the cache. Side-effecting calls are never automatically replayed.

Validate the Python adapter with:

```sh
uv run --with pytest python -m pytest agents/hermes/tests/test_kronterm_tools.py -q
```

The adapter translates tool-search results, capability guides and workflow recipes
to those same exposed names. Search queries translate back to canonical server names;
ordinary widget/page content is never rewritten. Background native workspace calls
use a 125-second transport budget, beyond the server's 120-second deadline. A transport
failure during a mutation remains explicitly uncertain and is never replayed automatically.
