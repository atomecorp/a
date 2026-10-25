# iOS keyboard: the band tools shrink and stop answering

## Symptom

On iPhone, writing a text on the Dashboard surface (« Créer › Texte »): once the
keyboard is up, the tools of the band (Teinte, Taille, Police, Ôter, Garder), the
✕, the search field and the Atom are all drawn smaller (60 → 38 px at 430×932),
and a tap on a tool does nothing. Reported on 2026-10-25 with two captures; noted
as « not reproduced » on 2026-10-21 for the project text tool.

## Confirmed cause — two independent owners

1. **The home's layout only knew the search's keyboard.**
   `eVe/domains/dashboard/dashboard_mystic_geometry.js#typingOverKeyboard` kept the
   tiles' size under the keyboard only while the home's search or a rubric's filter
   had the focus. Any other field (a text being created, a new contact) let the home
   be laid again in the contracted surface: a smaller shape, so smaller tiles, and
   the band's unit (half a tile) with them.
2. **The touchable hidden editor rose over the band.** On iOS the hidden editor
   (`hidden_text_service_runtime.js`) is hit-testable (`pointer-events: auto`, the
   space-bar caret drag needs it) and pinned `bottom: 0`, under the keyboard. Its
   height was the edited field's: a whole surface (616 px) is far taller than the
   keyboard, so its top stuck out above the keyboard, over the band. Every tap on a
   tool reached the editor (`pointerdown` target `TEXTAREA`).

## Durable correction

- The geometry treats any focused text editor as the keyboard's and keeps that state
  until the surface is whole again (no shrink flash on blur). Under the keyboard the
  expanded surface starts at the first visible line (`frame.roomTop`) and is cut; the
  tools keep their size (AGENTS.md rule 12).
- The hidden editor keeps the field's width (its lines) but its height is cut to the
  keyboard band (`layout height − visual viewport bottom`), followed on every visual
  viewport resize: it never rises above the keyboard.

## Regression probe

`temp/text_create_style/workflow.probe.mjs` (real app, isolated Fastify, 430×932, iOS
keyboard emulated at runtime by `support.mjs#installKeyboard`): the tool keeps 60 px,
the text stays on screen, a real drag selects a word, Teinte answers and keeps the
selection. `sweep.probe.mjs`: new contact and home search under the keyboard.

## Acceptance

On iPhone: write on « Créer › Texte », keyboard up — the band keeps its size and a
tap on Teinte opens the colours. Not yet verified on a device (2026-10-25).
