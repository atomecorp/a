Notification System – Functional Specification

1. Purpose

This document defines the complete functional specification of the notification system. It is intended to be used directly by Copilot (or any developer/AI agent) to implement the feature without interpretation gaps.

The notification system acts both as:
 • A real-time notification indicator
 • A persistent mailbox / message center

Nothing is automatically purged.

⸻

1. Global Location & Entry Point
 • The notification system is accessed via a dedicated tool/icon located in the top toolbar, always visible.
 • The icon is empty and visually neutral when there are no notifications.

⸻

1. Notification Arrival Behavior (Passive Display)

When a new notification arrives:
 1. The toolbar icon automatically expands horizontally (animated, smooth).
 2. The notification text is displayed immediately inside the expanded icon.

Text Display Rules
 • If the full text fits in the expanded area:
 • It is displayed statically for ~2–3 seconds.
 • If the text does not fit:
 • It scrolls horizontally.
 • The scroll happens exactly two full passes, allowing full readability.
 • No third pass is allowed.

Size Constraints
 • Maximum expanded width = 3 × icon height.
 • The icon never grows beyond this ratio.

End of Passive Display
 • After display (static or scrolling):
 • The icon collapses back to its default size.
 • The notification is not marked as read.

⸻

1. Unread State Indicator
 • As long as at least one notification is unread:
 • The icon shows a soft pulse animation.
 • Color pulse: white → subtle orange → white.
 • No aggressive blinking.
 • A counter badge shows the number of unread notifications.

⸻

1. Opening the Notification Panel (Primary Accordion)

When the user clicks the notification icon:
 1. The icon expands vertically into a panel (accordion behavior).
 2. The panel displays a list of notification titles only.
 3. The pulse animation stops only after the panel is opened.

⸻

1. Notification List Rules
 • The list:
 • Is never purged automatically.
 • Is chronological (newest first).
 • Can grow infinitely.
 • A lazy loading mechanism must be used for performance.
 • Opening the panel does not mark notifications as read.

This panel is effectively a mailbox.

⸻

1. Secondary Accordion (Per-Notification Content)

Inside the notification list:
 • Each notification item has:
 • A title row (always visible)
 • A collapsible content area

Interaction
 • Clicking a title:
 • Expands a second-level accordion.
 • Reveals the full notification content.
 • Only the clicked notification expands.
 • Notifications can be manually marked as read from this state.

⸻

1. Filters (Top of Panel)

At the very top of the notification panel:

Filter Buttons
 • Three filter toggles:
 • Discussion (mail / messages / conversations)
 • Share (all sharing-related notifications)
 • Other (system, ads, miscellaneous)

Filter Logic
 • Filters are non-exclusive.
 • Any combination is allowed:
 • One active
 • Multiple active
 • None active (shows everything)
 • Filters affect only the list view, not unread state.

⸻

1. Share Notifications (Detailed Behavior)

Share notifications are a core feature of this system.

A share notification may represent:
 • A shared Atome
 • A shared Project
 • A shared User / Contact request
 • A request to initiate contact (discussion, meeting, exchange)

Share Notification Content

Each share notification must clearly specify:
 • Who initiated the request
 • What is being shared or requested:
 • Atome
 • Project
 • User / contact
 • Other share type

Actions
 • Each share notification includes explicit actions:
 • Accept
 • Decline
 • Accepting triggers the appropriate permission / relationship logic.

⸻

1. Read / Unread Logic
 • A notification is considered read only when the user explicitly opens it.
 • Passive display (auto-expand on arrival) does not mark as read.
 • Opening the main panel does not mark as read.

⸻

1. Design & UX Constraints
 • Animations must be:
 • Smooth
 • Subtle
 • Non-intrusive
 • No modal dialogs.
 • Everything happens inline via accordions.
 • The system must feel alive but calm.

⸻

1. Non-Goals (Explicit)
 • No automatic deletion
 • No auto-read behavior
 • No forced separation of lists
 • No exclusive filters

⸻

1. Summary

This notification system is:
 • A real-time indicator
 • A persistent mailbox
 • A share request hub
 • Fully user-controlled

Copilot must implement this exact behavior, exact order of events, and exact interaction model without simplification.
