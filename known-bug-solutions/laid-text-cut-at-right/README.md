# Laid text cut at the right of its line (Créer › Texte, Capture › Liste)

## Symptom

Reported on 2026-10-27 (Mac, iPhone): editing a text in Créer › Texte, or showing it
large in a capture list, the end of a line is cut (« shgε »); an italic last letter
loses its lean. Sometimes the cut seemed to be at the bottom (descenders): that one
was the double line-height growth fixed on 2026-10-26 (see the comment in
`bevy_panel_laid_text.js`), not this defect.

## Root cause (confirmed 2026-10-27)

Each laid line is a text node exactly as wide as its measured advance
(`createTextEditingLayout`). Three things made the painted line wider than that box:

1. `bevy_ui_overlay_record_projection.js#textRecord` dropped `font_family`: the line was
   measured in the chosen face (Arial by default) and painted in the system face (SF),
   which is wider. The Police choice was never painted either.
2. `bevy_panel_record_preview.js#laidTextPreviewNode` measured the lines at weight 400
   while `textNode` paints them at `bodyTextWeight` (500).
3. A glyph's ink overhangs its advance (italic, some bold curves); the box kept 2 px.

## Fix

`textRecord` passes `font_family`; the preview layout measures at `bodyTextWeight`;
`laidTextNodes` reaches `INK_OVERHANG` (a quarter of the line height) past the last
advance. Caret and selection still come from the layout: nothing moves.

## Regression

`temp/laid_text_ink/ink.probe.mjs` (Chromium, real layout → nodes → projection →
texture resolver): no ink in a line texture's last column/row. Before: 3 of 5 cases
cut, `font=(none)`. After: 5/5 whole.

Device (« Jeezs's Tab », iPad M5, 2026-10-27): HEAD + the fix repackaged into the Debug app
(`temp/laid_text_ink/ipad_install.sh`), the same check run in its WebView on the installed
chunks (`temp/laid_text_ink/ipad/js/ink.js` through `ipad/e.sh`): 5/5 whole; the old box
(advance + 2 px, no `font_family`) cuts the same 3 cases on the iPad's fonts.

## The bottom: a line flush with the sheet's edge (2026-10-27)

On the iPad, typing at the end of a long text scrolled the field just enough for the caret's
line box: its last line sat on the sheet's bottom edge, the page margin gone (AGENTS.md rule 14).
The glyphs themselves were whole (measured: the ink of « g » ends 6 px above the edge), but the
line read as cut. `bevy_panel_text_editing.js#scrollForCaret` now keeps the field's own
`padding_y` (`paddingYFor`, the layout's margin) beyond the caret's line, above and below.

Screen check on « Jeezs's Tab » (WebView pointer events, `temp/laid_text_ink/ipad/tap.sh`,
`drag.sh`, `devicectl` screenshots, `rows.mjs` ink rows): Créer › Texte in Arial at 28, 66 and
86 px (Sous-titre, then bold italic) and the list's large preview: every line end whole; 31 px
of sheet below the last line at 66 px (0 before).
