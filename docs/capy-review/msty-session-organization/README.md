# Msty-style session organization review bundle

This folder collects the implementation notes and preview screenshots for the Msty Studio-style session organization work in PR #3 (`itsablabla/feat/org-sessions-m1`). It is intentionally placed under `docs/capy-review/` so another agent can inspect the UI work without digging through the Capy thread artifacts.

## Scope implemented in Milestone 1

- Frontend-only organization model backed by local storage.
- Workspaces displayed as the `Teams` selector.
- Projects mapped from existing Assistants and shown as sidebar groups.
- Conversation metadata extended with `workspace_id` and `project_id` in `extra`.
- Existing `ConversationTabs` enhanced with horizontal tabs, project breadcrumbs, tab close actions, move-to-project context menu, and keyboard shortcuts.
- No ACP, command queue, session preheat pool, or team-mode behavior was intentionally changed.

## Important code entry points

- `src/common/types/orgTypes.ts` — org/workspace/project/session type definitions.
- `src/common/utils/orgStorage.ts` — localStorage-backed org/project helpers.
- `src/renderer/pages/conversation/GroupedHistory/index.tsx` — workspace/project sidebar grouping.
- `src/renderer/pages/conversation/GroupedHistory/ConversationRow.tsx` — project-aware row actions.
- `src/renderer/pages/conversation/components/ConversationTabs.tsx` — horizontal tab bar UI and actions.
- `src/renderer/pages/conversation/hooks/ConversationTabsContext.tsx` — persisted tab state with org breadcrumbs.
- `src/renderer/hooks/ui/useConversationShortcuts.ts` — tab keyboard shortcuts.
- `tests/unit/orgStorage.test.ts` — storage helper tests.

## Preview screenshots

| File | What it shows |
| --- | --- |
| `images/aionui-org-preview.png` | Main live preview after login: workspace selector, New Project action, Assistant-backed projects, empty per-project session slots. |
| `images/aionui-org-tabs-preview.png` | Welcome/guid page with org-aware left sidebar and Assistant-backed project groups visible. |
| `images/aionui-org-seeded-tabs-preview.png` | Attempted seeded tab state route capture while conversation details were still loading. |
| `images/aionui-org-real-session-preview.png` | Real app preview after selecting a project; message input did not create a session in this headless pass. |
| `images/aionui-org-real-session-preview2.png` | Second real app preview pass after trying to drive the composer. |
| `images/aionui-webui-login.png` | WebUI login screen used for local preview access. |
| `images/aionui-preview.png` | Initial renderer-only capture before authenticated WebUI login. |

## Local preview notes

The preview server was started with:

```bash
NO_SANDBOX=1 bun run webui -- --host 0.0.0.0
```

The Electron/WebUI server reported:

- Dev renderer: `http://localhost:5173/`
- Authenticated WebUI: `http://localhost:25809`
- Dev userData: `/home/.config/AionUi-Dev`

The root Electron crash was avoided by using `NO_SANDBOX=1`; `ELECTRON_EXTRA_LAUNCH_ARGS=--no-sandbox` did not work because `electron-vite` reads `NO_SANDBOX=1` for this path.

## Verification status at time of bundle

- PR #3 exists: `https://github.com/itsablabla/garzaos-AionUi/pull/3`
- Commit reviewed locally for preview: `dfa7e67`
- WebUI launched successfully and screenshots were captured.
- Capy automated PR review was not started because the org review usage limit was reached.
- External check `Continuous AI: New Dev Agent` was still pending/blocked by external quota behavior in the previous handoff context.
