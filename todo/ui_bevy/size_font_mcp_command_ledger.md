# Size And Font MCP Command Ledger

Date: 2026-08-08

Every effectful Package 8 function is mapped before composition. The Bevy
surfaces emit user intent only and reuse the existing registered tools and
canonical selection-style mutation facade.

| Function/intent | Canonical owner/path | Tool and input | Capability/risk | Status |
| --- | --- | --- | --- | --- |
| Open/close Size | panel router -> registered Bevy surface | `ui.size.panel`, `open` / `close` | `ui.read`, LOW | `mapped` |
| Open/close Font | panel router -> registered Bevy surface | `ui.font.panel`, `open` / `close` | `ui.read`, LOW | `mapped` |
| Apply Size direct/step/preset | Bevy intent -> `invokeToolGateway` -> `ui.size.apply` -> `applySizeToSelection` -> canonical Atome mutation or `ui.resize` | `ui.size.apply`, `{ size, phase: "end", live: false }` | `ui.write`, LOW | `mapped` |
| Apply Size scrub | Bevy intent -> `invokeToolGateway` -> `ui.size.apply` -> `applySizeToSelection` -> range mutation or `ui.resize` | `ui.size.apply`, `{ size, phase: "start"|"frame"|"end", live }` | `ui.write`, LOW | `mapped` |
| Apply Font | Bevy intent -> `invokeToolGateway` -> `ui.font.apply` -> `applyFontToSelection` -> `applySelectionStyleMutation` | `ui.font.apply`, `{ font_family }` | `ui.write`, LOW | `mapped` |
| Read selection count/current text size | canonical selection and text-selection owners | none | passive read | `not_applicable` |
| Hover/focus/press/close reset | disposable Bevy panel state | none | presentation only | `not_applicable` |

No effectful Size or Font function is unreviewed or blocked. Public tool ids and
accepted input aliases remain unchanged. A non-empty active/recent project text
range writes only canonical `rich_text.spans`; without a range, the existing
whole-Atome fallback writes `font_family` or numeric `font_size`.
