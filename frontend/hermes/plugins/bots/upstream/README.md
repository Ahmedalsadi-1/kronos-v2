# Hermes Bot Mode

Vendored from [NousResearch/Hermes-Bot-Mode](https://github.com/NousResearch/Hermes-Bot-Mode)
at commit `80fee22582b871b9765a65e2992b8b5a8211c9f8` under the adjacent MIT license.

`hermes-bot-mode.js` retains the upstream implementation with local changes to
dispose gateway/profile listeners and the avatar animation on plugin unload, and
honor reduced motion in avatar rendering. The canonical-chat guard reads the
SDK's stored session identity so `/new` cannot disconnect a pinned bot chat.
The parent adapter registers
its roster with KronTerm's existing pane ID and adds navigation immediately after
Scheduled jobs. Bot conversations use Hermes profiles and session navigation.
The existing OpenMausBot VM runtime and viewer remain available independently.

Upstream is archived; ongoing development moved into Hermes Desktop. Update this
snapshot deliberately and review its SDK and gateway requirements before shipping.

KronTerm additionally mounts its native Bot Sections component in the existing
roster. Empty sections and collapse state persist locally; membership continues
to use upstream `ui_meta` so existing groups and group chats stay compatible.
Agents may write `<hermesHome>/bot-sections.json` with `sections` and `assign`
fields. The roster polls that file while mounted; manual moves remain until its
contents change. Section commands are registered while the roster is mounted.
