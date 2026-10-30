# Markdown and HTML import into Atomes — evaluation plan (30 Oct. 2026)

Status: coded 30 Oct. 2026 (L1–L5). The user accepted the four recommendations (§5) the same day. Measured results:
`eVe/documentations/calc/import_benchmark.md` and FRAMEWORK_STATE §5. Added the same day at the user's request, not probed (the user said not to test): `.csv`/`.tsv` (`csv_import.js`), PDF read as text (`pdf_import.js`), and the Médiathèque's import converting documents (`document_filing.js`).

## 0. What exists (verified 30 Oct. 2026)

- One import door: the Media tool. A file given to a project (Media's « Ouvrir », or dropped on the canvas) goes through
  `eVe/intuition/tools/project_drop_external_runtime.js#importFilesToProjectViaCreator`, which already routes by file:
  `.vcf` → contacts, `.ics` → calendar, `.docx`/`.xlsx` → converted text Atome (since 30 Oct.), media → upload.
- The target model: ONE text Atome per document — `text`, `rich_text` runs (bold, italic, underline, strike, colour,
  font, size, `link`, `cell`), `paragraphs` (role h1–h6/subtitle/body/list/quote/caption/note, `list`
  bullet/number/check + `checked`, `indent`, `align`, `block` rule/picture), `cells` (live calc), `page`, `view`.
- The writer `eVe/domains/document/import/office_document_builder.js` (paragraphs, runs, table → cells, report), and
  the filer `dashboard_create_filing.js#newTextCreation` + `fileCreation`.
- Scripts: `eVe/domains/script/script_trust.js` — a script arriving with an imported document is `untrusted`, runs only
  when the person enables it, in a worker that reaches only its own document's cells and text (no DOM, no network).
- Today `.md` is imported as a plain text Atome showing its raw marks (`# Titre`, `**gras**`); `.html` as a raw file.

## 1. The challenge

- **« HTML needs almost no change, just import it » does not hold in eVe.** An Atome is a description, the renderer is
  Bevy on WebGPU, the DOM is never a view (AGENTS.md rules 1, 6, 7; module 01). Showing HTML as HTML means a DOM or
  iframe view — forbidden, and it would be a second rendering engine. HTML must be *read* into Atomes exactly like Word.
- **HTML is harder than Markdown, not easier.** Markdown is already a document: every mark has its place in our model.
  HTML mixes a document (headings, paragraphs, lists, tables, links, images) with a page (CSS cascade, flex/grid layout,
  positioned boxes, forms, iframes, scripts). V1 takes the document and reports the page; turning a page layout into
  a scene of several Atomes is a different project, not proposed.
- **A page's JavaScript cannot be kept working.** It talks to `document`/`window`, which do not exist for an Atome.
  Kept as an inert `untrusted` script it would look enableable and fail the day it is enabled. Recommendation: not
  imported, counted in the report.
- **Class-based CSS is not readable without a rendering engine.** Only semantic tags and inline `style` carry over.

## 2. Mapping

| Source | Markdown | HTML | Atome |
| --- | --- | --- | --- |
| Headings | `#`…`######`, setext | `h1`–`h6` | role h1–h6 |
| Paragraph | blank-line block | `p`, `div` with text | body |
| Bold / italic / strike | `**` `*` `~~` | `b strong`, `i em`, `s del`, inline `font-weight` etc. | runs |
| Underline, colour | — | `u`, inline `color` | runs |
| Link | `[t](url)`, autolink | `a href` | run `link` (http(s), mailto, tel only) |
| Lists | `-` `*` `1.`, nesting | `ul ol li`, nesting | `list` bullet/number + `indent` |
| Task list | `- [ ]` `- [x]` | checkbox in `li` | `list: check` + `checked` |
| Quote | `>` | `blockquote` | quote |
| Rule | `---` | `hr` | block rule |
| Code | fences, indented | `pre`, `code` | body, font `monospace` run |
| Table | GFM table | `table` | cells, like Word tables (live calc) |
| Image | `![a](src)` | `img` | picture block once in the person's media (lot L4) |
| Caption | — | `figcaption` | caption |
| Title / front matter | YAML front matter | `title`, `meta` | reported (no Atome field asked) |
| Inline HTML in Markdown | raw tags | — | through the HTML reader, same rules |
| Scripts, forms, iframes, embeds, event handlers | — | `script`, `form`, `iframe`, `on*` | not imported, reported |

## 3. Lots

- **L1 — Markdown reader** `eVe/domains/document/import/markdown_import.js`: in-house CommonMark subset + GFM tables,
  task lists, strike; DOM-free like the Office readers; writes through `office_document_builder.js`; size and nesting
  caps. Routed in the same branch as `.docx`/`.xlsx` (`.md`, `.markdown`, `text/markdown`), replacing the raw text.
- **L2 — HTML reader** `html_import.js`: parsed by the browser's `DOMParser` into an inert document (never attached,
  no script run, no resource fetched), walked into the builder; semantic tags + inline styles; scripts, handlers,
  forms, iframes dropped and counted. Caps: size, depth, node count.
- **L3 — Report**: each import returns `{ imported, notImported[] }` like Word/Excel (already stored in the result;
  not shown on screen — showing it is a new panel, mockup first under rule 16).
- **L4 — Images** (also closes the Word limit): `data:` images and images inside the package join the person's
  media (`media_store.js#storeMediaFile`) and become picture blocks; remote images are not fetched at import (decision Q3).
- **L5 — Evaluation** (below), then maps, CODEMAP, module 05, FRAMEWORK_STATE record.

Optional, same builder, small: `.csv`/`.tsv` → cells grid (today plain text), like a one-sheet Excel.

## 4. Evaluation

Corpus `tests/fixtures/documents/` (generated by a script, like the Office fixtures):

- Markdown: headings of every level, nested lists 3 deep, task list, GFM table with numbers and currency, fences,
  links, images (`data:` and remote), front matter, inline HTML, a 1 MB README-like file.
- HTML: a saved Wikipedia article, a blog export, Word « Save as Web page », a Google Docs HTML export, a Notion
  export, a page with layout CSS.
- Hostile: `<script>`, `onerror=`, `javascript:` links, `<iframe>`, `<form>`, `<meta http-equiv=refresh>`,
  10 000-deep nesting, 50 MB file, a `data:` image bomb.

Measures (Playwright probe on the real app, the file given through Media's « Ouvrir »):

1. Fidelity: per row of the mapping table, the expected role / run / list / cell / block is present.
2. Report: everything not imported is listed — nothing silently lost.
3. Safety: zero script executed (a page-level sentinel never set), zero network request during the import
   (Playwright request log), hostile files refused with their own error code.
4. Time: 1 MB Markdown and 1 MB HTML under 300 ms on the main thread, else the worker.
5. Life after import: the text opens in Créer › Texte, edits keep roles and runs, table cells compute.

Acceptance: every measure green on Web; iOS and Tauri left to the user's device tests.

## 5. Decisions for the user

1. A page's JavaScript: not imported and reported (recommended), or kept as an inert `untrusted` script.
2. HTML parser: the browser's inert `DOMParser` (recommended: complete, safe, nothing to maintain), or an in-house reader.
3. Remote images: not fetched, reported (recommended: no hidden network, no tracking), or fetched into the person's media.
4. `.md` converted at every import into a project (recommended); a code project keeps its raw files (it does not import
   through Media).
