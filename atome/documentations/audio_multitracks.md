# Multitrack — where it is documented

This file used to hold the July 2026 « Atome Audio – Multitrack MVP » specification (TypeScript-style object
sketches, direct-to-disk plan). It no longer described the product and was replaced on 2026-11-25; its old text
remains in Git history.

The multitrack (Timeline, Cells and Scenes, Mix console, recording, effects, MIDI, instruments, AUv3 host) is
described in:

- **Feature listing, gesture by gesture:** [tests/parcours_musique/](../../tests/parcours_musique/README.md) — every
  user-visible function with its manipulation and expected result, its platforms, its origin request and what is
  not coded yet (« À compléter » in each file). This is the source for any user documentation.
- **Voice and MCP commands:** [tests/parcours_musique/commandes_vocales.md](../../tests/parcours_musique/commandes_vocales.md).
- **Design rules (normative):** `AGENTS.md`, rules 12–15.
- **Specifications and intent:** `todo/timeline/`, `todo/mixer/`, `todo/sampler_cahier_des_charges_2026-10-29.md`.
- **Open requests:** `todo/REGISTRE_DEMANDES.md`.
- **Owners in the code:** `eVe/intuition/tools/molecule/` (kernel and runtime), `eVe/domains/rendering/project_view_*`
  and `molecule_mix_*` (views and console), `atome/engines/` (audio engines).
