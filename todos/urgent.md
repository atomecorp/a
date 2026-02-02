Thinkpad – Functional Memo (Draft Specification)

1. Folder / List Concept for Documents

Objective

Provide a way to group multiple documents or captures into logical containers (folders or lists) instead of always placing them directly into a project canvas.

Behavior
 • When multiple files are dropped at once:
 • The system creates a container (folder/list) automatically.
 • The container holds the dropped elements as a structured list.
 • When multiple captures are made in sequence:
 • They are grouped into a single container (list or folder).
 • Containers are:
 • Independent objects (not necessarily tied directly to the main project view).
 • Usable as intermediate organization layers.

Goals
 • Reduce clutter on project canvas.
 • Provide semantic grouping (“these belong together”).
 • Allow later transformation (list → project → structured view).

⸻

1. Calendar Enhancements

Required Views
 • Daily view (existing).
 • Weekly view (mandatory).

Search & Filters
 • Add a search system with filters:
 • Filter by date range.
 • Filter by event type.
 • Filter by keywords.
 • Search UI must:
 • Reuse the global search module.
 • Automatically focus on calendar data (events + dates).

Settings & Preferences
 • Add a dedicated settings icon in calendar UI.
 • Settings panel must allow:
 • Start of week selection (Monday, Sunday, etc.).
 • Display preferences.
 • Default view (day/week).

⸻

1. News Wall (Special Matrix Project)

Structure
 • Create a special project in the Matrix called: News.
 • This project is divided vertically:
 • Top section: live incoming news / notifications.
 • Bottom section: content threads and responses.

News Filtering Engine
 • Built-in filtering engine allowing selection of:
 • Specific friends.
 • Subscribed users.
 • Topics (e.g., Music, Art, Tech, etc.).
 • User can configure:
 • Which sources are allowed.
 • Which themes are shown.

Interaction
 • Each news item supports threaded responses.
 • Response types:
 • Text.
 • Audio.
 • Video.
 • Behavior is similar to:
 • Instagram comments.
 • Facebook feed reactions.

⸻

1. Capture Tool (Video / Audio / Photo)

Default Behavior (Single Click)
 • A single click on the tool:
 • Immediately starts capture based on default mode.

Default mode options:
 • Video.
 • Audio.
 • Last used tool.

Long Click (Advanced Mode)
 • A long click:
 • Opens tool selection panel:
 • Video.
 • Audio.
 • Photo.

Intent Detection & Cancellation Logic

Case 1 – Immediate correction
 • User single-clicks (video starts).
 • User long-clicks and selects another mode within a short delay (e.g. < 2s).
 • System behavior:
 • Cancel and delete current capture.
 • Start selected mode (audio/photo/etc.).

Case 2 – Delayed confirmation
 • User single-clicks (video starts).
 • User changes tool after a longer delay (e.g. > 10s).
 • System behavior:
 • Do NOT cancel previous capture.
 • Treat new tool as intentional second action.

Photo special rule
 • If user switches to Photo and takes a second photo:
 • No cancellation.
 • System assumes user intent was Photo mode.

Preferences
 • User can set default behavior:
 • Always Video.
 • Always Audio.
 • Last used tool.

⸻

1. Global Goal

These features aim to:
 • Improve cognitive organization (lists, folders, grouping).
 • Improve temporal organization (calendar).
 • Improve social and informational flow (news wall).
 • Improve capture ergonomics (fast intent-based recording).

⸻

Status

Draft – to be refined into full technical spec later.
