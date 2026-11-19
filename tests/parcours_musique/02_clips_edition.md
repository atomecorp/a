# 02 — Clips : poser, éditer, annuler

Propriétaires : `eVe/domains/rendering/project_view_timeline_gestures.js`, `_clip_rail.js`, `_fade.js`, `_lasso.js` ;
noyau `eVe/intuition/tools/molecule/kernel/` (`reducers.js`, `collisions.js`, `clip_join.js`, `clip_fades.js`,
`clip_tone.js`, `stretch.js`, `block_loop.js`) ; historique `molecule/session/`.

Format : **ID** · priorité · plateformes — manipulation → attendu. *Sonde* · *Origine*.

## A. Poser et importer

- **CL-01** · P0 · W I — Importer un son par le panneau d'import unique (règle 18) sur une piste → le clip apparaît à la
  tête, avec son onde, et joue. *Sonde* `tests/probes/media_fixture_import_playback_probe.probe.mjs`.
- **CL-02** · P0 · W — Première visite Web : importer un son crée bien le clip et il n'est pas muet.
  *Origine* bug connu `web-import-first-visit-and-duration`.
- **CL-03** · P1 · W — Glisser un média depuis Médias sur une piste, sur la piste vide de fin, entre deux pistes → il se
  pose là où on le lâche. *Sonde* `tests/probes/molecule_ui_drop_*.mjs`.
- **CL-04** · P1 · W — Inclure dans une Molécule ajoute à la Molécule, ne l'enveloppe pas. *Origine* bug connu `include-wraps-target-molecule`.

## B. Déplacer, rogner, couper

- **CL-10** · P0 · W I — Glisser un clip → il suit le doigt et se pose ; contre un voisin il passe au-delà (placement
  libre), un bord s'arrête au voisin. *Sonde* `tests/eve/molecule_kernel_free_placement.test.mjs`, `tests/probes/molecule_ui_timeline_acceptance.mjs`.
- **CL-11** · P0 · W — Deux clips bord à bord : le second se déplace **sans** avoir été rogné d'abord.
  *Origine* bug connu `timeline-clip-moves-only-after-crop`.
- **CL-12** · P0 · W — Rétrécir un clip par sa fin le **rogne** (jamais une boucle). *Origine* bug connu `timeline-crop-becomes-loop`.
- **CL-13** · P0 · W — Rogner le début, puis rallonger : la matière cachée revient (non destructif).
- **CL-14** · P0 · W — Couper à la tête (Avant / Après), puis Joindre → le clip redevient exactement l'original.
  *Sonde* `tests/probes/molecule_clip_join.probe.mjs`.
- **CL-15** · P1 · W — Dupliquer, copier, coller à la tête, effacer. Chaque verbe = un seul pas d'annulation.
- **CL-16** · P1 · W — Boucler un clip (Bloc) : il se répète sur la durée tirée, chaque tour calé.

## C. Son du clip

- **CL-20** · P0 · W — Fondu d'entrée et de sortie par la poignée demi-cercle → voile visible au-dessus des vignettes,
  rampe audible sans clic. *Origine* R-170 point 13.
- **CL-21** · P1 · W — Fondu enchaîné entre deux clips qui se recouvrent (deux courbes qui se croisent). *Origine* R-178 M7.
- **CL-22** · P1 · W — Gain du clip (+ / −) et Normal. (+6,0 dB sur un son à −6 dB crête). *Origine* R-178 F29.
- **CL-23** · P1 · W — Vitesse du clip (la hauteur suit) ; Transition vidéo entre deux clips.
- **CL-24** · P1 · W — Son d'une vidéo : Isoler (piste à part) puis Délier ; le son reste calé sur l'image.

## D. Sélection et historique

- **CL-30** · P0 · W — Lasso (tenir puis glisser) sélectionne plusieurs clips ; toucher le vide désélectionne ; un
  glisser rapide fait défiler, ne sélectionne pas.
- **CL-31** · P0 · W I — Annuler / Rétablir après chacune des manipulations B et C → retour exact, un pas par geste ;
  une opération groupée s'annule en une fois. *Sonde* `tests/probes/molecule_session_history.probe.mjs`.
- **CL-32** · P0 · W — Supprimer une Molécule par Suppr. passe par la Molécule (pas de membre orphelin).
  *Origine* bug connu `project-view-molecule-text-regressions`.
- **CL-33** · P1 · W — Clip texte : toucher = prompteur, double toucher = édition, appui long = menu Mystic.
- **CL-34** · P0 · W — Aucun objet fantôme (cadre de sélection autour de rien) après suppression, annulation, prise.
  *Origine* R-169.

## À compléter

- Inverser un clip audio (non codé, R-178 F29).
- Warp / étirement sans changer la hauteur : bloqué (moteur sous licence absent, R-178 F30).
