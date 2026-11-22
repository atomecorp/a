# 06 — Plan d'exécution : campagne de tests + nettoyage profond (2026-11-19)

Rapport demandé le 19 nov. : « dis-moi le plus urgent, comment tu comptes t'y prendre et dans quel ordre »,
puis « tu codes pas, tu me fais un rapport de tout ce qu'il y a à faire dans l'ordre le plus intelligent ».
Deux chantiers : (A) le catalogue/scénarios/sécurité de ce dossier ; (B) le nettoyage en profondeur du
framework (texte collé le 19 nov., voix d'abord). Aucun code n'a été écrit.

## État constaté (lecture des fichiers, 19 nov.)

- `02b_matrice_couverture.csv` : 1 202 lignes (712 commandes, 104 méthodes MCP, 106 actions UI, 280 gestes F),
  10 colonnes de test par ligne = **12 020 cases, toutes `NOT_TESTED`**. Aucune preuve.
- `05_to_debug.md` : **aucun ticket**. Les campagnes n'ont jamais été lancées.
- Les scénarios L01–L17 sont des listes de gestes F, sans données ni résultats chiffrés : il faut les instancier
  (jeu de données, valeurs attendues) au moment du test.
- Disque : 14 Go libres. Une quinzaine de sessions écrivent en même temps, dont plusieurs dans les domaines
  média : R-184 (effets), R-186 (synthé), R-178 (séquenceur), R-199 (pistes), R-194 (import), R-243 (cellules),
  R-236 (tableur). Une réparation dans leurs fichiers passe par leur couloir.
- Voix (premier relevé) : `tauri-plugin-stt` est vendorié (`platforms/desktop-tauri/vendor`, 34 Mo, avec des
  sources iOS) alors que l'app iOS a son propre `AppNativeSpeechRecognizer.swift` ; Web Speech passe par
  `atome/src/squirrel/voice/service_support.js`. Doublon probable, à prouver.

**Le plus urgent** : rien n'est prouvé. Avant toute promesse « un professionnel peut travailler », il faut un
premier passage réel sur la chaîne média (import → image → capture → audio → instrument → timeline → montage →
export), précédé des quelques contrôles de sécurité qui peuvent révéler une faille grave à faible coût.

## Ordre proposé

### Phase 0 — Préparation (commune aux deux chantiers)

1. Couloir de l'orchestrateur : fichiers, serveur isolé, cibles cargo, créneaux Playwright.
2. Place disque : supprimer les résidus régénérables (règle « Disque »), viser ≥ 30 Go avant les builds.
3. **Inventaire vivant** recalculé depuis le registre, les `tool_id`, les contrats MCP et les exécuteurs,
   comparé aux 816 contrats du catalogue. Ce même relevé donne, pour chaque brique, ses consommateurs :
   c'est la carte des usages dont le nettoyage (B) a besoin. Un seul travail pour les deux chantiers.
4. Banc de test Web : Playwright sans fenêtre (`--use-angle=metal`), serveur isolé, deux comptes fictifs,
   état initial enregistré, vrais clics au centre des enregistrements Bevy (procédure `how_debug_UI.md`).
5. Médias de référence « pro » : vidéo 4K (H.264, HEVC), 1080p 60 i/s, WAV 24 bits/96 kHz, multicanal,
   photos très grandes (JPEG, PNG, HEIC), MIDI, banque SFZ. Fichiers fictifs, aucune donnée réelle.
6. Mesures de référence sur la même machine : démarrage, ouverture de projet, i/s Bevy, mémoire, latence audio.

### Phase 1 — Sécurité critique, courte (MCP direct et WebSocket, sur le Web)

Q01 comptes, Q03 MCP aux droits différents, Q04 voix = mêmes droits, Q07 fuites médicales, Q09 transport et
sessions, Q11 chemins de fichiers, Q05 imports non fiables. Raison : `05_to_debug.md` met les failles en tête,
ces campagnes ne demandent ni appareil ni UI, et une faille d'import (Q05/Q11) concerne directement la chaîne
média de la phase 2.

### Phase 2 — Chaîne média professionnelle (le cœur de la demande)

Dans l'ordre des dépendances, chaque étape réutilisant le produit de la précédente :

1. Import unique (règle 18) : S037, F095 — tous les formats ci-dessus, glisser-déposer et « Ouvrir ».
2. Image : L04 (F070–F086), puis X06 (affiche vectorielle).
3. Capture : L05 (F087–F101), S038 (photo, vidéo, son).
4. Audio : L06 (F102–F124) — coupe, fondus, gain, normalisation, effets, bypass, chaîne, presets.
5. Instrument et MIDI : S039, L07 (F125–F142) — sampler, zones, enveloppes, découpe, piano roll, SFZ.
6. Timeline multipiste : L08 (F143–F157), cellules (R-243) — clips, pistes, mixage, automation, annuler/rétablir.
7. Montage vidéo : S001, S002, X19 (vidéo avec son original), X01 (reportage géolocalisé).
8. Livraison : X02 (morceau multipiste et export), X07 (pack réseaux depuis une vidéo).
9. Endurance et lisibilité : X24 (longue session multimédia : fuites mémoire, décrochages), X23 (fenêtre réduite,
   orientation, clavier ouvert).

Pour chaque geste : fonction, affichage conforme à la charte (règles 11–16), fluidité mesurée, persistance
(fermer/rouvrir, annuler/rétablir), voix/MCP équivalents. Tout écart devient un ticket `BUG-NNNN` dans
`05_to_debug.md`, est réparé à la racine (dans le couloir du propriétaire), puis rejoué par **un sous-agent
indépendant** qui seul le passe à `VERIFIED` ; la matrice CSV est remplie au fur et à mesure.

### Phase 3 — Nettoyage en profondeur (chantier B), voix d'abord

Placé après la phase 2 pour deux raisons : les sondes de la phase 2 forment le filet qui prouve qu'un retrait ne
casse rien ; et supprimer pendant que quinze sessions écrivent demande un accord de l'orchestrateur lot par lot.

1. Voix : séparer mot d'éveil, commandes guidées, dictée libre, guide hors ligne, conversation, synthèse,
   capture ; consommateurs de `tauri-plugin-stt`, Apple Speech, Web Speech ; dictée libre validée sur chaque
   plateforme **avant** toute migration ; permissions micro, hors ligne, interruption puis reprise.
2. Puis le reste : bibliothèques vendoriées, binaires précompilés, modèles, ressources en double (empreintes,
   versions, contenu réel des apps livrées), imports dynamiques, registres, ponts natifs, manifestes hors ligne.
3. Classement en cinq preuves (fréquent / ponctuel nécessaire / doublon / inutilisé / incertain), suppressions
   par lots cohérents, verrous régénérés, mesures avant/après (dépôt, app livrée, démarrage, mémoire).
4. Bilan : tableau par brique, fichiers et dépendances supprimés, tests exécutés, plateformes à vérifier,
   optimisations restantes classées par impact.

### Phase 4 — Reste du catalogue

Tableur déstructuré (S034, X03–X05, CALC-01–20, en lien avec R-236) ; documents (S033, S035, S036) ;
MCP M01–M10 ; agenda L09 ; santé S010–S023 + Q02 ; sport ; courses ; contacts/courrier ; publication ;
objectifs ; interactions ; L09–L17 et X restants ; Q restantes, dont Q14/Q19 (dépendances : `cargo deny`,
`npm audit` en lecture seule, puis mises à niveau compatibles).

### Phase 5 — Autres plateformes

Tauri macOS (je peux le piloter sur ce Mac) ; iPad, iPhone, Windows, Android, FreeBSD : essais par toi
(ou `BLOCKED` motivé), à partir des listes exactes de cas produites par les phases 1 à 4. Jamais de PASS
pour une plateforme non ouverte.

## Avancement

### Phase 0 (19 nov.)

- Médias de référence fictifs : `temp/r246_media/fixtures/` (183 Mo, dont `hostile/` et `sfz/`). Bombe PNG réduite
  à 6400×6400 à la demande de l'orchestrateur.
- Inventaire vivant : `temp/r246_media/inventory_live.json`. Le registre compte 58 familles et 771 commandes, dont
  **93 absentes du catalogue** :
  - audio_fx : 19 (master, auto, driver, synth_*, motif_*) ;
  - projects : 5 (order, folder, move, rename, data_order) ;
  - dashboard : 35 ;
  - communication : 13 ;
  - billing : 10 ;
  - social : 4, health_products : 3, training : 2, share : 2.

  Les familles `cb`, `billing` et `dashboard_progression` manquent aussi au catalogue. Les commandes de la timeline
  (`ui.timeline.*`, `eve.timeline.*`, `mix.*`) ne forment pas une famille MCP : elles sont absentes du catalogue C.
- Sonde du lot 1 : `temp/r246_media/lot1_import.probe.mjs`, lancée par `run_lot.sh` (copie figée, coupure si le
  swap dépasse 10,8 Go).

### Carte statique L04–L08 (lecture du code, sous-agent, 19 nov.) — à confirmer dans l'app

Ce relevé vient de la lecture du code. Il n'atteste aucun PASS ; un écart ne devient ticket qu'une fois vu dans l'app.

- **Absent : le rendu ou l'export d'un projet ou d'une timeline vers un fichier** (mixdown WAV, vidéo MP4). Aucune
  route trouvée, aucun verbe d'export dans `timeline_tool_contract.js`. Seuls existent l'export d'un clip MIDI,
  `creation.export` et `takes_send`. C'est le plus gros manque pour un usage pro : on monte, mais on ne livre pas.
  Un outil d'export dans un projet est un nouvel élément visuel : **maquette exigée (règle 16)**.
- **F086 : l'export d'une photo retouchée envoie l'original sans la retouche.** `creationFile` envoie
  `state.image.preview` tel quel. Défaut probable, sans nouvel élément visuel.
- Partiels :
  - F081 : miroir horizontal seulement ;
  - F093 : pas d'arrêt distinct de la pause ;
  - F114, F115 : fin silencieuse, analyse de boucle et note fondamentale existent en commande, sans outil dans l'UI ;
  - F124 : presets sans renommer ni favori ;
  - F140 : choix du canal MIDI absent de la bande ;
  - F142 : export SFZ en commande seulement.

  Ceux qui demandent un nouvel outil visible passent par une maquette.
- Tout le reste de F070–F157 est présent dans le code, avec son propriétaire et son chemin d'UI. Le tableau complet
  est le rapport du sous-agent, résumé ici.

## Règles de l'orchestrateur (19 nov., 17:15)

- Chromium/Playwright : une passe à la fois, sur son signal écrit, avec `PROBE_ISOLATED=1`,
  `PROBE_PREBUILT_SERVER=1`, `PROBE_SERVER_BIN=target/release/atome-server` ; lots courts, la main rendue
  entre deux lots.
- Serveur isolé de préférence ; le port 3001 (serveur de dev de l'utilisateur) seulement après sa permission.
- Cargo : une cible privée en `-j 2`, lancée au-dessus de 15 Go libres, arrêtée sous 6 Go, puis supprimée ;
  jamais pendant un `cargo check --workspace` du rust-analyzer.
- Nettoyage : chaque lot lui est envoyé avec sa liste de fichiers ; un fichier qui porte le diff d'une autre
  session ne se modifie qu'en éditions ciblées, et ce diff est gardé ; les fichiers partagés attendent son accord.
- Tests : mes propres sondes ciblées, pas les grandes suites du dépôt.
- Essais sur appareil : leur texte lui est envoyé pour A_TESTER_VALIDER.

## Blocages connus d'avance

- Une fonction du catalogue absente dont l'ajout demande un nouvel élément visuel : maquette d'abord
  (règle 16). Proposition : maquettes regroupées en fin de phase, le reste continuant.
- Appareils (iOS, Android, Windows) et voix réellement entendue : à toi.
- Disque à 14 Go : builds WASM/cargo seulement après avoir libéré de la place.

## Questions posées à l'utilisateur (19 nov.)

1. Ordre : la sécurité critique (phase 1, courte) avant les médias, ou les médias d'abord ?
   **Réponse (19 nov.) : les médias d'abord.** La phase 2 passe donc avant la phase 1. Les contrôles d'import
   (Q05, Q11) se font pendant l'étape « Import unique » de la phase 2.
2. Rôles : je teste et je répare, et un sous-agent indépendant fait les retests — d'accord ?
3. Médias de référence : tes propres fichiers pro (lesquels, où ?) ou des fichiers synthétiques générés ?
4. Nettoyage : dans cette session après la phase 2, ou une session parallèle dès maintenant (cartographie en
   lecture seule d'abord) ?
