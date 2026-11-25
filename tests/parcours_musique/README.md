# Parcours de tests — Timeline et création musicale

Parcours de recette **à la main** (et, où une sonde existe, automatisable) de toute la création musicale du projet eVe :
Timeline, Cellules, Scènes, Console (Mixage), effets, enregistrement, MIDI et séquenceur, instruments, Slicer,
synchro d'un hôte AUv3, persistance. Il sert à **éviter toute régression** : chaque défaut corrigé ces dernières
semaines y a sa ligne, pour qu'il ne revienne pas.

Ce dossier est vivant : on le complète au fil des chantiers (voir « Compléter ce parcours » plus bas).

C'est aussi **la liste complète des fonctions du multipiste**, la source de toute documentation d'utilisation :
chaque ligne dit le geste et ce qu'on voit ou entend. Relevé complet du 2026-11-25 (demandes R-199 à R-369, chacune
vérifiée dans le code) : les lignes changées depuis portent une note *Mise à jour 2026-11-25*, ce qui n'est pas codé
est en bas de chaque fichier (« À compléter »).
C'est le domaine « Multipiste » de l'inventaire de tout eVe, [inventaire/README.md](../../inventaire/README.md).

## Les fichiers

| Fichier | Contenu |
| --- | --- |
| [00_preparation.md](00_preparation.md) | Banc, comptes, projets de test, plateformes, comment noter un résultat |
| [01_transport_timeline.md](01_transport_timeline.md) | Lecture, arrêt, Début, boucle, tempo, métronome, tête, scrub, zoom, aimant, pistes |
| [02_clips_edition.md](02_clips_edition.md) | Clips : poser, déplacer, rogner, couper, joindre, dupliquer, boucler, fondus, gain, annuler |
| [03_enregistrement.md](03_enregistrement.md) | Prises audio, vidéo, MIDI : à la volée, par zone, piste vide, placement exact, point REC |
| [04_cellules_scenes.md](04_cellules_scenes.md) | Cellules, Scènes, Édition / Réglages, longueurs, quantification, prise dans une cellule |
| [05_console.md](05_console.md) | Console : tranches, IN, OUT, VOL, PAN, REC, Aux, bus, ordre des outils, panneaux soudés |
| [06_effets.md](06_effets.md) | Effets audio (45 briques) et vidéo, panneaux, mesures, automation des effets |
| [07_midi_sequenceur.md](07_midi_sequenceur.md) | MIDI : prise, piano roll, batterie, pas à pas, couloirs, sortie MIDI |
| [08_instruments_slicer.md](08_instruments_slicer.md) | Sampler, instruments, Slicer (Découpe, Motif), tranches en cellules |
| [09_hote_auv3.md](09_hote_auv3.md) | Atome dans AUM sur l'iPad : synchro hôte, prises, bus, MIDI hôte, latence |
| [10_persistance_plateformes.md](10_persistance_plateformes.md) | Réouverture, historique, serveur seule vérité, Web / Tauri / iOS / AUv3 |
| [11_paroles_prompteur.md](11_paroles_prompteur.md) | Paroles et prompteur : créer, Rec au doigt, importer LRC, SRT, VTT, anciens Lyrix (.lrx, .prx) |
| [12_controles.md](12_controles.md) | Objets « Contrôles » (sliders, rotatifs, pads, clavier…) : poser, jouer, actions sur clips, Scènes, pistes et transport |
| [commandes_vocales.md](commandes_vocales.md) | Toutes les commandes vocales et MCP du multipiste, par domaine, et les écarts à la règle 22 |

## Légende

Chaque test a un identifiant (`TL-03`, `REC-12`…), une priorité et une plateforme.

- **P0 — bloquant** : doit **impérativement** passer avant toute livraison (TestFlight, déploiement, démo). Un P0 qui
  échoue bloque la version. Les P0 couvrent le cœur (lire, enregistrer, mixer, retrouver son travail) et chaque
  défaut déjà corrigé une fois (régression = P0).
- **P1 — important** : à passer à chaque recette complète ; un échec s'inscrit au registre, ne bloque pas seul.
- **P2 — confort** : à passer quand le domaine a bougé.

Plateformes : **W** Web (Chrome, `localhost:3001`), **T** Tauri, **I** app iOS (iPad atomic), **A** AUv3 dans AUM
sur l'iPad atomic, **Ph** téléphone (viewport 390×844 ou iPhone).

Colonne « Sonde » : la sonde existante qui couvre déjà le test (à relancer d'abord) ; vide = test seulement à la main.
« Origine » : la demande du registre (`todo/REGISTRE_DEMANDES.md`) ou le bug connu (`known-bug-solutions/`) dont il vient.

## Les sondes du parcours

- `tests/probes/music/` — sondes Web de la console, des cellules, du séquenceur et du Slicer (versées le 16 nov. 2026
  depuis `temp/`). Les sondes navigateur démarrent leur propre serveur isolé (`PROBE_PREBUILT_SERVER=1` pour garder le
  binaire déjà construit) ; `console_strip_take_web.probe.mjs` aussi (compte réel, micro simulé à 440 Hz). Sorties sous
  `temp/probe_reports/music/`. Aides communes : `tests/helpers/probe_app.mjs`, `probe_home.mjs`, `probe_server.mjs`,
  `probe_app_session.mjs`.
- `tests/ios/auv3_aum/` — le banc de l'iPad dans AUM (fichier 09) ; mode d'emploi dans son README.
- `tests/probes/music/scenes_ui.probe.mjs` — les Scènes au doigt (SC-10 à SC-30) : tracer, poignées droite et gauche,
  déplacer, renommer (Timeline, Cellules, vue Scène), supprimer, rouvrir ; temps de réponse mesurés dans la page.
- `tests/probes/music/views_stability.probe.mjs` — tenue du design et fluidité (DS-01, DS-02, DS-04) : 5 tours
  Timeline → Cellules → Scène → Console sur quatre écrans, rien ne bouge ni ne change de taille, bascule mesurée.
- Les sondes navigateur démarrent leur serveur isolé sur un port libre (et ses ports +200 et +1000) ; sur une machine
  chargée : `PROBE_SERVER_START_MS=480000`. Elles lancent le `target/release/atome-server` déjà construit (target/ est
  partagé entre sessions) ; `PROBE_BUILD_SERVER=1` le reconstruit d'abord, pour sonder un changement du serveur.

```bash
PROBE_PREBUILT_SERVER=1 node tests/probes/music/console_rec_light.probe.mjs
```

## Le passage minimum avant une livraison (les P0)

Un passage P0 complet = tous les tests marqués **P0** des fichiers 01 à 10, sur **W** et sur **A** (l'iPad dans
AUM), plus **I** pour les tests qui le demandent. Ordre conseillé : 00 → 01 → 02 → 03 → 05 → 09 → 10, puis 04, 06,
07, 08.

## Noter un passage

Copier [modele_passage.md](modele_passage.md) dans `temp/recette_musique_<date>/passage.md` (jamais ici : ce
dossier garde les cas, pas les résultats), y cocher chaque test, joindre captures et sons. Un échec P0 ou P1 va au
registre `todo/REGISTRE_DEMANDES.md` avec l'identifiant du test.

## Compléter ce parcours

- Un chantier qui ajoute ou change une fonction musicale ajoute ses tests dans le fichier du domaine, avec un
  identifiant nouveau (on ne renumérote jamais) et l'origine (n° R-…).
- Un défaut corrigé ajoute un test **P0** qui le reproduit (la manipulation exacte et ce qu'on doit voir/entendre).
- Un test devenu faux (fonction retirée, design changé et validé) est barré avec la date et la raison, pas effacé.
- Section « À compléter » en bas de chaque fichier : ce qu'on sait manquer.
