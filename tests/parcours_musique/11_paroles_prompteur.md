# 11 — Paroles et prompteur (créer, enregistrer, importer LRC / SRT / VTT / Lyrix)

Propriétaires : `eVe/intuition/tools/prompter/` (`prompter_model.js`, `prompter_timing.js`, `prompter_socle.js`,
`prompter_subtitles.js`, `prompter_reading_runtime.js`) ; import des paroles `prompter_lyrics_import.js`,
`prompter_lyrics_lrc.js`, `prompter_lyrics_subtitles.js`, `prompter_lyrics_lyrix.js` ; table d'import
`eVe/intuition/runtime/file_import_table.js` (route `lyrics`), hors projet `file_import_destination.js`, dans un projet
`eVe/intuition/tools/project_drop_external_runtime.js`, Timeline `project_media_import_runtime.js#attachImportedAtomesToTrack` (Import), dépôt sur une piste
`eVe/domains/rendering/project_view_timeline_file_drop.js`.
Fichiers de référence : `tests/fixtures/lyrics/`.

Format : **ID** · priorité · plateformes — manipulation → attendu. *Sonde* · *Origine*.

## A. Le prompteur existant

- **PRM-01** · P0 · W T I — Créer › Texte, taper trois lignes de paroles, sortir → le texte est là après rechargement.
  *Sonde* `tests/probes/prompter/prompter_ui.probe.mjs`.
- **PRM-02** · P0 · W T I — Double-toucher le texte, ajouter une 4ᵉ ligne → la modification est gardée (coffre).
- **PRM-03** · P0 · W T I — Choisir le texte, rail › Prompt → le socle de temps apparaît à côté du texte, durée lisible
  (au moins 5 s).
- **PRM-04** · P0 · W — Prompt › Rec, faire glisser le doigt du haut vers le bas du socle pendant la lecture, Rec de
  nouveau → une perle par ligne, des temps croissants. Le doigt posé sur une perle **pendant la prise** fait glisser,
  sans fixer la ligne à la fin. *Origine* défaut corrigé le 17 nov. (`prompter_socle.js`).
- **PRM-05** · P1 · W — Exporter les sous-titres (.srt, .vtt) → un bloc par ligne parlée, sans les notes `[...]`.

## B. Importer des paroles minutées

- **PRM-20** · P0 · W — Déposer `simple.lrc` sur le **Dashboard** → un projet « simple » s'ouvre, avec un prompteur
  « Chanson simple » ; les lignes `[ar:]`, `[al:]`, `[by:]` n'apparaissent pas ; perles à 1 s, 4,5 s, 8,25 s ; durée
  12 s. *Sonde* `tests/probes/prompter/prompter_lyrics_import_ui.probe.mjs`.
- **PRM-21** · P0 · W — Dans un projet ouvert, panneau d'import › Ouvrir › `basic.srt` → le prompteur entre dans **ce**
  projet (pas un nouveau), à la place libre suivante.
- **PRM-22** · P0 · W — Vue Timeline, panneau d'import › Ouvrir › `basic.vtt` → le prompteur est créé et posé en clip
  sur la piste, de la durée des sous-titres (12 s).
- **PRM-22b** · P0 · W — Vue Timeline, déposer `unicode.lrc` sur une piste → le prompteur est créé et posé en clip **sur
  cette piste**, à l'instant du dépôt ; plusieurs fichiers déposés ensemble se suivent sur la piste. *Origine* défaut
  corrigé le 17 nov. (`project_view_timeline_file_drop.js`).
- **PRM-23** · P0 · W — Déposer un `.lrc` directement sur le canevas d'un projet ouvert → il entre dans ce projet.
  *Origine* défaut du dépôt corrigé par R-205.
- **PRM-24** · P0 · W — Un `.lrc` à plusieurs temps sur une ligne (`[00:06.00][00:18.00]Refrain`) → la ligne apparaît
  deux fois, à chaque instant. Fichier `multi_timestamp.lrc`.
- **PRM-25** · P0 · W — `[offset:+500]` → toutes les lignes avancent d'une demi-seconde ; millisecondes et
  centièmes lus. Fichier `offset_ms.lrc`.
- **PRM-26** · P0 · W — LRC enrichi mot à mot (`enhanced.lrc`) → les mots sont gardés, sans balises `<mm:ss>` ; un
  message discret dit que le temps mot à mot est gardé par ligne.
- **PRM-27** · P0 · W — SRT : balises `<i>`, `{\an8}` retirées ; un sous-titre de deux lignes donne deux lignes ; un
  silence de 3 s ou plus devient une ligne vide ; deux sous-titres qui se chevauchent restent dans l'ordre. Exporter
  ensuite en .srt → mêmes débuts, même fin. Fichier `basic.srt`.
- **PRM-28** · P0 · W — VTT : blocs `NOTE` et `STYLE` jamais dans les paroles ; `<v Nom>` retiré ; `&amp;` devient `&` ;
  `[applaudissements]` reste une note non minutée. Fichier `basic.vtt`.
- **PRM-29** · P0 · W — Accents, emoji, japonais, BOM (`unicode.lrc`) → texte intact, titre « Ünïcødé 🎵 ».
- **PRM-30** · P0 · W — Fichiers refusés (`empty.lrc`, `no_timing.lrc`, `no_header.vtt`) → un message discret qui dit
  pourquoi ; **rien** n'est créé, aucun projet vide sur le Dashboard.
- **PRM-31** · P1 · W — Un `.txt` déposé reste un texte simple ; rail › Prompt en fait un prompteur à durée estimée.
- **PRM-32** · P1 · W — Ancien Lyrix : `lyrix_poil.lrx` → un prompteur « poil », temps lus en millisecondes (231295 →
  3 min 51 s) ; `lyrix_jeezs.prx` → un prompteur par chanson, en pages, dans l'ordre de la playlist. Le fichier n'est
  jamais exécuté ; ni le texte brut `raw` ni l'audio ne sont importés.
- **PRM-33** · P1 · W — Après chaque import, recharger la page → prompteur, perles et durée identiques (règle 21).

*Sonde pure* (sans navigateur) : `node tests/probes/prompter/prompter_lyrics_import.probe.mjs` (lecteurs, pages, aller-retour
SRT/VTT, routes de la table).
