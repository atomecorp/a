# Web publishing — eVe projects as websites at atome.one/&lt;slug&gt;

A project becomes a website: its root Pages, in project order, are the site's pages; publishing freezes a version that
`https://atome.one/<slug>[/<page>]` (or a personal domain) serves. Decisions and validated mockups:
`todo/publication_web_2026-10-28.md` (§5, §6).

## Truth and identity

- One `site` Atome per project in the author's vault, id `site_<project_id>` (`siteAtomeId` / `siteProjectId` in
  `atome/src/shared/site_contract.js`). The project is read from the id: `project_id` is a reserved Atome key and is
  never written as a property.
- Properties: `slug`, `title`, `description`, `page_ids` (JSON, absent = every page), `credit`, `site_menu` (JSON, the
  menu last laid). The server writes `site_status` (JSON: state, live version, next operation, domain).
- A page is a `group` with `container_kind: 'page'` whose parent is the project (`sitePages`). The home is the first.

## Commands (one contract for UI, voice, AI and MCP)

Family `site` (`atome/src/squirrel/site/contracts.js`, declared in `mcp_contract_families.js`), run by
`eVe/domains/site/site_runtime.js#executeSiteCommand`: `goto`, `pages`, `state`, `list`, `settings`, `check`,
`preview`, `publish` (`at` = planned), `cancel`, `history`, `rollback`, `retire`, `menu`, `form`, and the
domain/mail commands (`domain_*`, `mail_*`, `hosting`). « Aller » is `site.goto { page_id | url, new_tab }`, used as an
action of an `interaction` Atome (family `interactions`).

Client ↔ server: `/ws/api` frames `type: 'site'` (`server/ws_site.js` → `server/site_services.js`). The frame
`reschedule` (no MCP command: the Agenda's own move is the gesture) moves the pending operation.

## Server

| Piece | Owner |
| --- | --- |
| Tables (`site_publications`, `site_versions`, `site_operations`, `site_slugs`, `site_media`, `site_domains`, `site_contact_log`) | `database/adole_site_schema.js`, SQL in `server/site_store.js` |
| Publish, versions, planned operations and their clock, rollback, retire, status written back | `server/site_publishing.js` |
| Atomes → HTML/CSS (pages, menu links, media by SHA-256, credit line) | `server/site_projection.js`, `site_projection_css.js` |
| Public serving: `/<slug>/…` (not-found handler, never hides a static file), personal domain host (`onRequest`), `/_site/m/<sha>`, `/_site/fonts/*`, `/_site/preview/<token>/*`, `POST /_site/contact` | `server/site_http.js` |
| Domains and mail boxes: SIMULATED provider, ledger with atome's share included in the price | `server/site_domains.js` |

Versions live on disk under `data/sites/<site>/<version>/` (`ATOME_SITES_ROOT`); media are never copied, a version
points to the original file by its content hash. The history is append-only: a rollback publishes an earlier version
as a new one. A contact form's messages arrive in Communiquer (`kind: 'site-contact'`).

## Interface

- Site panel `eVe/domains/site/site_panel.js` (cards Mon site, Dates, Depuis la mise en ligne, Quand; band Voir, MàJ,
  Hist., Arrêt), domain/mail levels `site_panel_domain*.js`. Opened from the Projets rubric's hold « Publier sur le
  web », from « Mes sites » (`site_list.js`, the rubric's Sites tool), or from its Agenda event.
- Créer › Menu: `site_menu_panel.js` (tool `ui.site.menu.panel`) lays one text per page with its « Aller ».
- Interaction panel: « Aller » in the « Faire » card, page tiles or a link (`bevy_panel_interaction_cards.js`).
- Agenda: a planned publication is an event (`scheduledSend.kind: 'site'`, `publish_calendar.js#settleSiteEvent`);
  moving it reschedules, deleting it cancels.

## Validation

`temp/publication_web/server_site.probe.mjs` (service, 58 checks) and `temp/publication_web/site_ui.acceptance.mjs`
(Playwright on an isolated real server, by touch: pages, Menu, « Aller », Interaction, Publier, served site, Agenda).
Run the acceptance with `HEADLESS=0` (headless WebGPU screenshots are blank).
