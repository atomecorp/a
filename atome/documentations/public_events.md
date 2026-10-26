# Public events (declared activities)

Status (2026-10-26): implemented and verified on Web against an isolated real `server.js`
(`temp/public_events/l3_server.probe.mjs` 20/20 with 4 real accounts; `temp/public_events/ui.probe.mjs`
51/51 in the real app with 2 accounts, real clicks). Tauri and iOS have not been run. Plan and decisions:
`todo/evenements_publics_2026-10-26.md`.

## What the user sees

- **Any Activité list** (Spectacles › Concerts, Sport, Scène…; Temps libre › Sortie, Événements…) mixes
  the events people declared around with the open sources, **by date**. A declared row names its
  organiser (« … · par Marie · Place de Jaude »). Touched, it gets the usual tools (Agenda, Trajet,
  Site, Billet) plus **Écrire** (a conversation with the organiser, a first contact being a contact
  request) and **Signal** (a report). Écrire turns the list's bottom field into a writing field
  (« Écrire à Marie »); Entrée sends (`events.contact`). The author sees **Modif.** and **Retir.** instead.
- **« Annon. »**, a tile under the rows of every list a category reaches, opens the event panel in its
  **« Annon. » mode** with the list's category chosen.
- **The event panel** (calendar, design A · Cartes) has a band tool **Annon.**. It is selected while the event
  is public, and its halo shows until the server has answered. In this mode, five cards follow the
  alarms:
  - **Quoi**: 1 to 3 categories.
  - **Où**: the place typed; the geocoder's answers read as name · town; the one touched is kept.
  - **Affiche**: the one import panel, AGENTS.md rule 18.
  - **Entrée**: Gratuit, or Payant with − price +, plus the ticket link.
  - **Diffuser**: Contacts, a News to the accepted contacts once saved; Réseaux, the system share sheet at
    once with the poster.
- **Créer › Envoi** (Texte, Dessin, Retouche) has **Annon.** beside Réseau and Envoi. The creation
  becomes the poster: a drawing, a picture, or a Carré/Story text.
- **Mes annonces**, a plate of the Dashboard's calendar rubric, lists the user's public events and the
  server's word on each: *En ligne*, *Refusée · limite du jour atteinte*, *Masquée · signalée*, …
- **Voice / MCP**, family `events.*`, everything the screens do:
  - `categories`;
  - `declare` and `publish` (both confirmed by the user);
  - `update`, `unpublish`, `mine`, `nearby`;
  - `report`, `contact { entry_id, text }`;
  - `open { event_id? | categories? | creation_id? | mine }`;
  - `panel` (every field of the « Annon. » panel shown: title, date, repetition, categories, place,
    price, ticket link, poster, Annon., Contacts), with `choose_poster` opening the one import panel that
    `media_import.*` drives;
  - `save` (Garder, confirmed);
  - `share { event_id, destinations }`: Diffuser › Réseaux by voice through the user's connected
    networks, as `social.prepare` then `social.publish`.

  `creation_id` lays a creation of Créer as the poster. On screen, Réseaux is the system share sheet,
  which needs a touch; by voice it goes through the connected accounts.

## Model: the event stays the author's

A public event is the author's own `calendar_event` Atome. It is written by the calendar's one writer
(`CalendarAPI`, `eVe/intuition/tools/calendar_api.js`) through `Atome.commit`. It carries two properties:

| Property | Writer | Shape (`atome/src/shared/public_event_contract.js`) |
|---|---|---|
| `publication` | the author's devices | `{ visibility: 'public'\|'private', categories[1..3], place: { label, address, city, lat, lon }, poster: 'data:image/jpeg;base64,…' (≤ 360 px), price: { free } \| { amount, currency }, ticket_url, url }` |
| `publication_status` | the server only | `{ status: 'live'\|'refused'\|'hidden'\|'pending', reason: 'quota'\|'suspended'\|'invalid'\|'past'\|'reported'\|null, at }` |

- **Unpublishing** sets `visibility: 'private'`; the event stays in the calendar.
- **Deleting** the event removes it from the shared base.
- **The poster travels inside the publication.** Readers draw it without reaching the author's files,
  and there is no HTTP route.

**Categories.** One taxonomy, `atome/src/shared/activity_categories.js`: concert, stage, screening,
sport, festival, expo, family, meal, party, workshop, outing, market, wellbeing.
- Each category names the Activité plate it shows in, and the OpenAgenda kind and words that find its
  open events.
- `server/ws_shows.js` reads its `AGENDA_WORDS` there. Markets, brocantes and vide-greniers moved from
  Événements to the new **Sortie** plate (`outings` kind).
- Gratuit reads `price.free`; it is not a category.

## Server: a projection, never a truth

- **One hook after every commit.** `server/ws_api_commit_effects.js#afterCommitted` is called by all four
  commit paths: `wsAtomeOperations.js` commit, commit-batch and sync (offline / native), and
  `atomeHistoryCommands.js` (undo/redo). It runs three things in order:
  1. it publishes the committed events to `/ws/sync`;
  2. it refreshes the public directory card;
  3. it calls `publicEvents.afterCommit`.
- **`server/public_events.js#project(owner, atomeId)`** re-reads the event in the author's vault (it never
  trusts the frame) and validates it. A new publication goes through the guard. The service then:
  - expands the occurrences of the next **60 days** (`calendarRangeOccurrences` of
    `atome/src/squirrel/calendar/icalendar.js`; a repeated event is one row per date);
  - writes the series and its occurrences (`server/public_events_store.js`; tables in
    `database/adole_public_events_schema.js`);
  - writes `publication_status` back with `vaultRouter.commit` (published to `/ws/sync`);
  - broadcasts `public-events-changed { cells }` to every `/ws/api` connection.
- **Reading**: `shows-nearby` kind `declared` with `categories`. The service:
  - reads the grid cells around (≈ 11 km cells);
  - drops entries outside the radius, past ones, hidden ones, and those whose author and reader block
    each other;
  - answers OpenAgenda-shaped entries plus `declared`, `eventId`, `authorId`, `organizer`, `categories` and
    `free`, soonest first, 25 a page.
- **Organiser**: the display name the account shares on its public card (directory sharing rules). An
  account sharing no name shows none.
- **Limits** (`server/public_events_guard.js`, decision Q3, post-moderation):
  - 5 publications a day; 1 while the account is younger than 72 h;
  - 30 events still to come at most;
  - 3 reports from distinct accounts hide an event;
  - 3 hidden events within 30 days suspend publishing for 30 days.
- **Reports**: the `public-events` frame, action `report`, account only, never on one's own event.
- **Operator**: `node scripts/public_events_admin.mjs reported|restore <id>|withdraw <id>`. It writes the
  shared base only; the author's status follows at their next change.
- **Repeated series**: projected again when less than 30 days of their horizon are left. Ended
  occurrences are purged one day after their end. Both happen at read time; there is no timer.

## Client owners

| Concern | Owner |
|---|---|
| Commands `events.*` (contract) | `atome/src/squirrel/public_events/contracts.js` |
| Executor (the screens and MCP alike) | `eVe/domains/public_events/public_events_runtime.js` |
| Poster (picture → small JPEG) | `eVe/domains/public_events/public_event_poster.js` |
| « Annon. » mode of the event panel | `eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_publication.js` (state, intents) and `…_publication_view.js` (cards), on the shared cards of `bevy_panel_calendar_cards.js` |
| Band tool | `bevy_panel_calendar_band.js#calendarAnnounceTool` (panel band and the Dashboard's hosted card) |
| Lists | `eVe/domains/dashboard/dashboard_shows.js`; declared reading and the date merge in `eVe/domains/shows/shows_declared.js`; `shows_client.js#readDeclaredShows` |
| Mes annonces | `eVe/domains/dashboard/dashboard_public_events.js` |
| Presentation (`events.open`, `events.contact`) | `dashboard_mystic_stage.js` (`registerPublicEventsPresentation`) |
| Live arrival | push `public-events-changed` becomes the window event `squirrel:public-events-changed` (`adole_websocket_message.js`); an open list whose cells changed reads again |
| Report | `AdoleAPI.publicEvents.report` |

## Shared owners fixed on the way

- The event panel on the Dashboard survives the import panel taking its place: it comes back with the very
  draft it held (`context.restoreDraft`, `reopenPublicEventPanel`), then the poster lands in it.

`eVe/intuition/tools/contact_conversation.js#resolveConversationContact`: an account outside the book (a
public event's organiser, a publication's author) is now reached by its account id. The server decides:
an accepted contact gets the message, anyone else gets `contact_required`, so the first message travels
as their contact request (`dashboard_first_contact.js#writeToPerson`). Before this fix, writing to them
failed with `conversation_contact_unavailable`.

## Known limits

- **Tauri / iOS.** The native local servers relay `shows-nearby` with the token stripped, so reading works
  there but without the block filter. `public-events` and pushes travel on the FastifyAdapter cloud
  connection. None of this has been run on a device.
- **Texts as posters.** An A4 or screen text exports as PDF or plain text, which gives no poster. The
  panel's Affiche picks one instead.
- **The `shows-nearby` IP rate limit** (30 a minute) applies to declared reads too.
