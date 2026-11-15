# Touching the Contacts rubric (Carnet) freezes the phone, then everything lags

## Symptom

iPhone and iPad, 14 Nov. 2026 (R-163): touching Carnet in the Dashboard Contacts rubric
showed nothing, the device froze for seconds, then the whole app stayed slow.

## Evidence

- On the iPad atomic, one touch on Carnet ran `Squirrel.contacts.service.contactsList`
  154 times (counted by wrapping it, with call stacks, `temp/contacts_r163_2026-11-14/q_count_calls.js`);
  each call clones the whole book (2 936 cards) and sorts it with `localeCompare`.
- The stacks all came from the Dashboard messages refresh, re-entered by
  `eve:people-directory-read`.

## Root cause

`eVe/domains/dashboard/dashboard_communication_input.js` refreshed the messages (to rename
their senders) on every `eve:people-directory-read`. That refresh reaches
`dashboard_mystic_runtime.js#onMessagesChanged`, which refreshes the `contacts` rubric; the
rubric reads the book (`collectPeopleDirectory`), which dispatches `eve:people-directory-read`
again: a loop without end, each turn reading and sorting the whole book.

## Correction

A directory read only renames what is shown (`cycle.update(pending())`); it is no longer a
messages change, so nothing reads the book again. The two sorts of the book
(`dashboard_contact_items.js#sortContactItemsForDashboard`, `service.js#storeContacts`) use
one `Intl.Collator` with precomputed keys instead of `localeCompare` per comparison.

## Regression checks

- iPad: touch Carnet, count `contactsList` calls: 1 (was 154); the book opens at once.

## Acceptance

Opening Carnet reads the book once; no freeze on a book of ~3 000 cards.
