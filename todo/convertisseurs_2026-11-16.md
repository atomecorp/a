# Convertisseurs universels — audit (Livrable A), architecture proposée, maquettes (2026-11-16)

Source : cahier `~/Downloads/atome_prompt_convertisseurs.md` (toi, 16 nov.). Registre : R-194.
Statut : décisions reçues le 16 nov. (§7 bis) ; réalisation en cours, lot par lot (§12). Branche `main`, aucune écriture Git.

## 1. En une phrase

Plus de choses existent qu'on ne le pense — Word, Excel, PDF, CSV, Markdown, HTML, **SFZ (import et export), SF2,
DecentSampler, MIDI (lecture et écriture)** — mais chacun a sa porte ; DAWproject, OTIO, OpenUSD et Lottie n'existent pas,
et **le moteur de rendu n'a aucune 3D** (Bevy 0.19 sans `bevy_pbr`), ce qui fait d'OpenUSD un chantier 3D, pas un convertisseur.

## 2. Tableau d'audit (vérifié dans le code et par sondes le 16 nov.)

| Format | Où (source) | Sens réel | État vérifié | Tests | Limites / risques | Reco. |
| --- | --- | --- | --- | --- | --- | --- |
| DOCX | `eVe/domains/document/import/docx_*.js`, `office_package.js`, `office_xml.js` | lecture → document texte unifié (atome texte) | **OK** : 2 vrais .docx du dépôt (371 et 297 paragraphes, 66 et 69 titres, 40 et 9 tableaux, 152 ms pour 10 Mo) | sonde `temp/calc/import/import.probe.mjs` 15/15 ; **aucun test sous `tests/`** | tableaux Word aplatis en lignes à tabulations (seules les valeurs deviennent des cellules Calc) ; en-têtes/pieds signalés non importés ; images seulement sur le fil principal | conserver, compléter |
| XLSX | `xlsx_*.js` | lecture → grille Calc, formules traduites et recalculées | **OK** : feuilles, formules partagées/absolues/inter-feuilles = valeurs Excel ; 10 000 cellules en 195–330 ms | idem | MFC, cellules fusionnées, tableaux croisés signalés ; `.xlsm` lu par l'importeur mais refusé par la porte (`document_kind_unsupported`) — macros jamais exécutées | conserver, compléter |
| DOC / XLS (binaires) | — | aucun | **absent** | — | refusés « type non pris en charge » | demander s'ils sont utiles |
| PDF | `pdf_import.js` + pdf.js vendoré (Apache-2.0) | lecture du texte seul | **OK** : vrai PDF 577 ko → 1 502 paragraphes, 590 titres, 1,07 s | aucun sous `tests/` | mise en page, images, liens perdus (signalés) ; scan refusé | conserver |
| CSV / TSV | `csv_import.js` | lecture | **OK** : CSV 1,1 Mo du dépôt, 53 ms | aucun | — | conserver |
| Markdown | `markdown_*.js` | lecture | **OK** (fixture) | aucun | liens, front matter, images signalés | conserver |
| HTML | `html_import.js` | lecture (navigateur seul : `DOMParser`) | refusé en Node (`html_parser_unavailable`) ; prouvé dans l'app le 30 oct. | aucun | — | conserver |
| ODT / ODS | — | aucun | **absent** | — | — | hors périmètre sauf demande |
| SFZ | `eVe/domains/audio_fx/banks/bank_sfz.js#parseSfz`, `bank_draft.js`, `bank_sources.js`, `instrument_bank_runtime.js#importBank` ; export `bank_sfz_export.js#exportSfz` | **import et export** → atome `instrument` (sampler natif, moteur Rust `atome-instrument`) | **OK** : banque d'essai 5 régions, héritage control/global/group, `#define`, round robin, groupes/off_by, boucle sustain, release trigger, filtre ; opcodes inconnus et `<curve>` **signalés** | Rust `atome-instrument` **51/51** ; JS : aucun sous `tests/` | **perte silencieuse** : l'enveloppe est globale à l'instrument (`mostCommon`) → l'attaque d'**une** zone (20 ms) appliquée à toutes sans avertissement ; `lovel=1` devient 0 | conserver, corriger |
| SF2, DecentSampler | `bank_sf2.js`, `bank_dspreset.js` | import | non sondé ici | Rust `bank_opcodes.rs` | — | conserver |
| MIDI (SMF) | `eVe/domains/midi/smf.js` (`compileSmfEventPlan`, `encodeSmfFromEvents`) ; « Exporter .mid » du séquenceur | lecture et écriture | **OK** : aller-retour 3 notes, hauteurs/vélocités (1 et 127)/temps identiques | `tests/eve/midi_playback_runtime.test.mjs` + 2 sondes | SMPTE refusé ; signature et autres méta non gardées | conserver ; brique de DAWproject |
| Audio (WAV, FLAC, MP3, OGG, AAC, MP4) | Kira 0.12 + Symphonia 0.6 (`mix-graph/src/clip_decode.rs`), `audio-kernels/src/wav.rs` | décodage ; WAV `smpl/acid` | prouvé par l'existant | Rust `kernels.rs` | **AIFF : aucun décodeur** (seulement nommé) | compléter AIFF au besoin |
| Images, vidéo, SVG | `atome-server/src/media/storage.rs#inferred_type`, ffmpeg serveur | import média | existant | sondes média | SVG rastérisé par le navigateur (aucun rendu vectoriel Rust) | conserver |
| **DAWproject** | — | aucun | **absent** | — | — | **créer** |
| **OTIO** | — (les 471 « otio » = ro*tatio*n, m*otio*n) | aucun | **absent** ; aucun EDL/FCPXML/AAF | — | la timeline n'a ni timecode ni transitions (fondus de clips seulement) ; `timebase.fps` stocké, jamais utilisé | **créer** |
| **OpenUSD** | — | aucun | **absent** ; **aucune 3D** : Bevy sans `bevy_pbr`/`bevy_gltf`, seulement `Mesh2d`/`Camera2d`, aucun type d'atome 3D | — | importer = construire d'abord la 3D | **décision (Q2)** |
| **Lottie** | — | aucun | **absent** ; aucun rendu vectoriel animé ; GSAP vendoré inutilisé | — | — | **décision (Q3)** |

## 3. Points d'entrée et partage (réels)

- Une porte pour les médias (règle 18) : `eVe/intuition/tools/media.js#requestMediaSelection` → « Ouvrir » →
  `atome/src/squirrel/shared/file_selection.js#requestProjectImportFiles` (iOS : sélecteur natif ; Web : `<input type=file>`).
- **Quatre aiguillages distincts aujourd'hui** (aucun registre) : `media.js#importMediaIntoLibrary` (`documentKindOf`),
  `project_drop_external_runtime.js` (dépôt sur le canevas, `documentKindOf`), `project_drop_media_runtime.js` (`PROJECT_DROP_MEDIA_KINDS`),
  les banques (`instrument_bank_commands.js`, porte séparée) ; plus le classement serveur `storage.rs#inferred_type`.
- Lacunes d'entrée : iOS déclare l'ouverture de `.atome`/`.json` mais `SceneDelegate.openURLContexts` ne traite que l'authentification ;
  pas d'extension de partage iOS ; Tauri `RunEvent::Opened` ne traite que l'assistant ; types de documents du sélecteur iOS **non vérifiés**.
- `office_import_worker.js` existe mais **rien ne le lance** : tout l'Office tourne sur le fil principal ; `importDocumentFile` lit tout le fichier sans plafond de taille.
- Sécurité vérifiée : ZIP maison (`books/zip_archive_reader.js`) plafonné pendant l'inflation, ratio, total, CRC, ZIP64/chiffré refusés ;
  XML sans DOCTYPE/ENTITY ; chemins `..` neutralisés ; 9 fichiers hostiles refusés chacun avec son code.
- Partage/export existants : `file_export.js#saveExportFile` (Tauri : Téléchargements ; Web : téléchargement), partage de listes
  (`eVe/domains/sharing/`, droits `server/sharingPermissionService.js` / `atome-server/src/social/sharing/`), export SFZ, export .mid, PDF de page.
  **Aucun outil « Exporter » dans les menus** (seul `prompter.export`).

## 4. Modèles natifs (cibles des traductions)

- Projet musical / vidéo : **un document JSON** `molecule_timeline` sur l'atome groupe (`eVe/intuition/runtime/molecule_stores.js`), schéma
  `eve.molecule.timeline` v2 (`kernel/schemas.js`) : sections (tempo, mesure), pistes (audio, vidéo, image, texte, automation, midi, mixed),
  clips (secondes **et** trames à 48 kHz, source = atome média), automation (images clés linéaire/palier/lisse), `mix` (volume, pan, effets,
  aux, destinations bus/piste/sortie), marqueurs, fondus de clips, étirement. Écriture canonique : `applyGroupTimelineBatch` (`molecule/runtime.js:386`).
- Notes MIDI : **le fichier SMF du média MIDI est la donnée** (`midi_clip_store.js`) ; un DAWproject devra donc écrire un SMF par clip.
- Sampler : atome `instrument` (`instrument_schema.js`, Rust `atome-instrument/src/zone.rs`) : zones clé/vélocité, prises, empilement
  (round robin), coupes (choke), filtre, boucle, relâche ; **enveloppe et paramètres de voix globaux, pas par zone**.

## 5. Architecture proposée (aucune couche universelle)

1. **Une seule table « quel lecteur pour quel fichier, et où il atterrit »**, née de l'existant : le tableau `KINDS`/`READERS` de
   `document_import.js` devient la table unique ; chaque entrée déclare extensions, MIME, signature de contenu (ZIP + `project.xml`
   pour DAWproject, JSON `OTIO_SCHEMA`, ZIP + `[Content_Types].xml` pour Office…), destination (`document` → atome texte,
   `timeline` → Molécule, `instrument` → sampler, `media`), lecteur chargé à la demande, plafonds, capacités vérifiées. Les quatre aiguillages
   du §3 la consultent au lieu de décider chacun. Pas de nouvelle interface : la porte reste le panneau d'import (M0).
2. Chaque adaptateur suit le contrat déjà en place : `{ ok, kind, … , report: { imported, notImported:[{ what, where, reason, count }] } }`
   ou `{ ok:false, error }` ; aucun fichier d'origine modifié ; écriture atomique en **un seul** `commitBatch` (pistes + clips + médias),
   donc rien de créé en cas de refus ; médias liés passés par `storeMediaFile` (dédoublonnage du coffre) ; source gardée comme média
   (provenance) tant qu'il reste des éléments « gardés non restitués ».
3. Modèles spécialisés conservés : DAWproject → timeline + instruments + SMF ; OTIO → timeline (RationalTime → secondes, débit gardé dans
   `timebase.fps`, timecode de départ en métadonnée) ; SFZ → instrument (existant) ; documents → atome texte (existant).
4. Briques réutilisées : `openZipArchive`, `parseXml`, `encodeSmfFromEvents`, `applyGroupTimelineBatch`, `storeMediaFile`, `importBank`.
   Dépendance externe : **aucune** pour DAWproject, OTIO, SFZ.
5. Hors fil principal : lancer enfin le worker existant pour l'Office et y mettre DAWproject/OTIO (les images/médias reviennent au fil principal pour le stockage).

## 6. Matrice de compatibilité (honnête, avant code)

| Format | Exprimable | Lu par nous | Représentable dans atome | Affiché/joué | Perdu |
| --- | --- | --- | --- | --- | --- |
| DAWproject | pistes, clips audio/MIDI, tempo/signature, automation, mix, plug-ins (état opaque) | non testé (à créer) | pistes, clips, SMF, tempo, mesure, automation, volume/pan, aux | moteur Molécule existant | états de plug-ins tiers (gardés), routages latéraux, certaines automations de plug-ins |
| OTIO | pistes, plages, débit, transitions, marqueurs, effets (nommés) | non testé | pistes vidéo/audio, clips, marqueurs ; transition → fondus de clips (approché) | lecteur vidéo Bevy existant | transitions exactes, effets, titres, timecode affiché |
| SFZ | opcodes v1/v2/ARIA | **oui, partiel** (matrice `MAPPED`) | zones, groupes, RR, boucles, filtre | **joué** (Rust 51/51) | modulations eg/lfo, courbes, enveloppe par zone (aujourd'hui sans avertir) |
| DOCX/XLSX | tout Office | **oui** | texte riche, grille Calc | oui | tableaux Word structurés, MFC, fusions, croisés, images (worker) |
| OpenUSD | 3D complète | non | **rien** (pas de 3D) | non | tout, tant que la 3D n'existe pas |
| Lottie | formes, calques, images clés, masques | non | approché : formes + automation (Transformer, opacité) | partiel | morphing de tracés, masques, effets |

## 7. Questions (8) — décisions à prendre avant tout code

1. **Langage** : AGENTS.md règle 7 (4 nov.) impose Rust pour toute nouvelle logique ; ton cahier dit « JavaScript dans le front-end ».
   Reco. : DAWproject et OTIO en JS, car ce sont des assemblages des briques JS déjà durcies (ZIP, XML, SMF, timeline), sans calcul lourd ; Rust pour USD binaire si un jour. Tu tranches ?
2. **OpenUSD** : aucune 3D dans le moteur. (a) reporter USD jusqu'à un chantier 3D décidé (reco.) ; (b) ouvrir maintenant le socle 3D (bevy_pbr, type d'atome 3D, caméra, gestes) ; (c) USDZ seulement comme média (aperçu).
3. **Lottie** : (a) reporter ; (b) traduction approchée en formes + automation existantes ; (c) moteur vectoriel Rust externe (velato/vello, compatibilité wgpu de Bevy 0.19 non vérifiée). En as-tu un usage réel ?
4. **Fichiers réels** : aucun DAWproject/OTIO/FCPXML dans le dépôt et le téléchargement externe a été refusé la dernière fois. Tu me fournis des exports (Bitwig/Studio One/Cubase pour DAWproject, Resolve pour OTIO, Final Cut pour FCPXML), ou tu m'autorises à télécharger les exemples publics du dépôt DAWproject (MIT) ?
5. **Final Cut** n'exporte que FCPXML (l'adaptateur OTIO correspondant est en Python, exclu). Une passerelle FCPXML → même traduction que l'OTIO : maintenant ou plus tard ?
6. **Maquettes M1–M3** (`temp/converters_audit_2026-11-16/mockups/`) : le panneau n'apparaît que s'il y a une perte ; faut-il aussi le montrer quand tout ce qui manque est seulement « gardé dans la source » (rien à décider), ou ouvrir directement l'outil dans ce cas ?
7. **Office** (« À corriger » proposés pour `./ToDo`) : tests sous `tests/`, lancer le worker, plafond de taille, types du sélecteur iOS, message clair pour .doc/.xls ; et les tableaux Word structurés en vraies cellules. Je les ajoute et les fais à l'étape 1 ?
8. **SFZ** : étendre l'instrument (schéma JS + `Zone` Rust) à une enveloppe **par zone**, pour supprimer la perte silencieuse ; ou, au minimum, l'avertir ?

## 8. Maquettes (aux vrais jetons, vraies briques, téléphone 430 × 932)

`temp/converters_audit_2026-11-16/mockups/planche_convertisseurs.png` ; script `converters.mockup.mjs` (+ `board.mjs`).
M0 panneau d'import réel (inchangé) · M1 DAWproject avec arbitrage · M2 SFZ · M3 OTIO · M4 export depuis la bande de l'appui long (phase ultérieure, non codé).
Composants : `registerBevyPanelSurface`, `calendarCard`, `panelBandTool`/`panelBandBack`, `radioGroupNode`, `toggleableRowNode`, glyphes `dashboardDiscIconSourceFor`.

## 9. Plan par étapes (après tes réponses)

1. Table unique + Office (corrections Q7) — tests unitaires sous `tests/`, sonde app réelle.
2. DAWproject → timeline (comptes pistes/clips/notes/tempos avant-après, lecture dans Molécule).
3. OTIO (puis FCPXML si Q5) → timeline vidéo (durées, débit fractionnaire, synchro A/V, médias hors ligne).
4. SFZ : correction Q8 + tests JS + jeu note par note dans le sampler natif.
5. USD / Lottie selon Q2/Q3. 6. Export : conception seulement (M4), non codé sans accord.

## 10. Preuves de cet audit

- `node temp/calc/import/make_fixtures.mjs && node temp/calc/import/import.probe.mjs` → 15/15.
- `node temp/converters_audit_2026-11-16/real_documents.probe.mjs` → DOCX×3, XLSX, CSV, MD, PDF importés avec comptes ; HTML refusé hors navigateur ; `.xlsm` refusé par la porte.
- `node temp/converters_audit_2026-11-16/sfz_smf.probe.mjs` → SFZ 5/5 régions, 4 avertissements ; SMF aller-retour identique.
- `cargo test -p atome-instrument` → 51 tests, 0 échec.
- Non vérifié : iOS, Tauri, écoute, rendu vidéo (rien de nouveau à rendre à ce stade).

## 7 bis. Décisions (toi, 16 nov.)

1. Rust pour toute logique nouvelle (lecteurs DAWproject, OTIO, FCPXML, USD, Lottie en Rust ; JS = colle fine).
2. OpenUSD **maintenant**, avec le chantier 3D mené en même temps (dire ce qui manque : `temp/converters_audit_2026-11-16/3d_gap.md`).
3. Lottie : moteur vectoriel externe Rust accepté.
4. Téléchargement des fichiers d'exemple publics autorisé.
5. Passerelle FCPXML (Final Cut) : oui.
6. **Aucun panneau d'arbitrage** : l'import ouvre directement l'outil ; le bilan reste une donnée (méta de l'import), rien à l'écran. Maquettes M1–M3 abandonnées.
7. Corrections Office : maintenant.
8. Sampler : enveloppe **par zone** (extension du sampler, pas un avertissement).
9. **Plug-ins externes (VST/AU/CLAP) jamais pris en charge**, sans en parler à l'import (on le dit une fois au départ). Raison : un projet diffusé doit toujours jouer ; un plug-in commercial peut manquer chez celui qui reçoit. atome aura ses propres plug-ins, toujours disponibles en lecture seule ; achetés, modifiables (presets…).

## 11. Système de plug-ins atome — avis et réalisation

**Avis.** Oui, il faut un système normé, même avec une IA qui code à la volée. Une IA qui écrit du code libre produit des pièces
uniques, non vérifiables, qui ne tourneront pas pareil sur Web, iOS et Tauri, et qu'on ne peut ni garantir à l'écoute ni vendre.
La norme proposée : **un plug-in atome est une description, jamais du code** — une composition des modules du moteur
(atome-dsp, mix-graph, synthé à voix, effets vidéo), ses réglages exposés, ses presets et sa face. Comme les briques sont
livrées dans le moteur sur toutes les plateformes, **un plug-in est toujours jouable partout** ; l'IA compose dans ce format
(c'est déjà le cas : `audio_effect` d'origine `assistant`). Un second niveau (code DSP en WASM isolé, transporté avec le plug-in)
pourra venir plus tard sans casser la règle « toujours présent », puisque les octets voyagent avec lui.

**Existant vérifié.** « Mes effets » (`eVe/domains/audio_fx/audio_effect_library.js`, atome `audio_effect`, contrat
`atome/src/shared/audio_fx_contract.js`) : une chaîne de modules du moteur, liée partout où elle est posée (`user_effect`). Défaut
trouvé : la composition était lue dans la bibliothèque **de l'auteur** — un projet partagé ne pouvait pas la jouer chez un autre.

**Fait (16 nov.), noyau sans UI :**
- `eVe/intuition/tools/molecule/kernel/mix_plugins.js` : `timeline.mix.plugins[effect_id] = { revision, name, short_name, icon, chain, owner_id }`, copie figée validée par le noyau (`validateMixPlugins`, appelé par `mix_schema.js#validateMixDocument`) ; droit de modifier injecté (`registerPluginEditRight`) ; `requirePluginEditable` refuse `plugin_read_only` dans `mix_structure.js#updateMixModule`.
- `audio_effect_library.js` : `expandAudioEffect(module, carried)` lit la bibliothèque, sinon la copie du projet ; `carryAudioEffects(mix)` fige chaque plug-in utilisé (imbriqués compris) à sa révision, garde les copies que la personne ne peut pas reconstruire, retire celles qui ne servent plus ; droit = la bibliothèque de la personne le contient.
- `molecule_stores.js` : chaque sauvegarde de timeline porte ces copies ; `molecule_mix_engine.js` compile avec elles.
- Test `tests/eve/mix_plugins_carried.test.mjs` 3/3 (auteur fige ; auditeur sans bibliothèque entend la copie, `plugin_read_only` en modification ; copies orphelines retirées).

**À valider (règle 16) :** maquettes M5 (plug-in en lecture seule : valeurs affichées sans jauge, « Acheter » dans la bande) et
M6 (plug-in acheté ou de l'auteur : sliders, Presets, Enreg.) — `temp/converters_audit_2026-11-16/mockups/plugin_ro.png`, `plugin_rw.png`, planche `planche_plugins.png` (envoyée le 16 nov.).
L'achat lui-même passe par le grand livre de R-193 (licence = droit `plugin.edit` accordé), en attente de tes réponses à R-193.
Étendre la même copie figée aux instruments (`instrument`) et aux chaînes vidéo : même mécanisme, après validation.

## 12. Avancement (16 nov.)

- [x] **Office** (Q7) : plafonds de taille avant lecture, refus nommés (`.doc/.xls/.ppt`, présentations, OpenDocument, fichier composé), `.xlsm/.docm` importés macros signalées, worker réellement lancé (`office_import_thread.js`), cellules texte (`calc_cells.js` rôle `text`), sélecteur `document` (`file_selection.js`). Tests `tests/eve/document_import_office.test.mjs` + `document_import_text.test.mjs` 23/23 ; sondes `temp/document_import_2026-11-16/` ; `import.probe.mjs` 15/15. iOS (`iCloudFileManager.swift`) non compilé ici.
- [x] **Enveloppe par zone** (Q8) : `ZoneEnvelope` dans `atome-instrument` (zone.rs, sampler.rs, notes.rs) + `mix-graph/instrument_spec.rs` ; `instrument_schema.js` `envelope` ; une seule règle `bank_draft.js#sharedEnvelope` pour SFZ, SF2 et DecentSampler (valeur absente = défaut du format) ; export SFZ par zone. `cargo test -p atome-instrument` 71/71 ; `tests/eve/bank_sfz_zone_envelope.test.mjs` 4/4, `bank_readers_zone_envelope.test.mjs` 2/2 ; WASM audio et direct reconstruits.
- [x] **Plug-ins atome, noyau** (§11) : copie figée dans le projet, lecture seule appliquée par le noyau ; 3/3.
- [x] **Table unique d'import** : `eVe/intuition/runtime/file_import_table.js` (`fileImportRoute`, `fileImportPlan`, `CONVERTED_ACCEPT`) ; branchée dans le dépôt sur un projet (`project_drop_external_runtime.js`) et l'import de la Médiathèque (`media.js#importMediaIntoLibrary`, fenêtre système `bevy_panel_media_runtime.js`). Une banque SFZ/DecentSampler prend les sons du même lot ; aucun arbitrage. Test `tests/eve/file_import_table.test.mjs` 3/3.
- [x] **DAWproject, OTIO, FCPXML** (`.fcpxmld` compris) : crate Rust `atome/engines/interchange` (lecteurs + `molecule_writer`/`TimelineBuilder`, réutilisé par Loopy), liaison `platforms/web/audio-wasm/src/interchange.rs` (`interchangeReadDawproject/Otio/Fcpxml`), applicateur unique `eVe/domains/molecule_import/timeline_document_import.js#applyTimelineImport` (média stocké une fois par `content_sha256`, ré-import = même projet par `import_source`), entrées `dawproject_import.js`, `otio_import.js`, `fcpxml_import.js`, aiguillage `timeline_files_import.js#importTimelineFiles` ; route `timeline` dans la table. `cargo test -p atome-interchange` 29/29 (ajouté à `scripts/rust/check.sh`) ; `tests/eve/timeline_document_import.test.mjs` + table 10/10 ; sonde `temp/converters_audit_2026-11-16/interchange.probe.mjs` : 17 exemples publics (`tests/fixtures/interchange/`, licences jointes) valides pour le noyau. Pertes notées dans `meta.import` (plug-ins externes ignorés sans rien afficher). Vraie archive `.dawproject` (18 nov., fournie par toi, 2,4 Go) : lue entière, le lecteur ZIP lisant désormais par tranches (`temp/converters_audit_2026-11-16/dawproject_real/`) ; dépôt réel dans l'UI sondé le 18 nov. (`drop_ui/`) ; nouveau projet = 2 commits (création puis timeline), rattrapé par le ré-import.
- [x] **OpenUSD + fondation 3D** : atome `scene3d` (kind media) ; chaque scène = une Camera3d rendue dans l'image de son quad 2D ordinaire (canevas, ordre, découpe, gestes, hit-test inchangés), un calque de rendu par scène ; lecture `openusd 0.6.0` en Rust (`atome/renderers/bevy-core/src/scene3d/`, usda/usdc/usdz par résolveur en mémoire) ; horloge = `playback_progress` (temps / durée) ; export `register_atome_bevy_scene3d_source` ; entrée `eVe/domains/scene3d/usd_import.js#importUsdFile` ; route `scene3d`. `cargo test … scene3d` 5/5 (usda statique, animé, usdz avec texture, usdc Pixar, octets inconnus refusés) ; sonde `temp/converters_audit_2026-11-16/scene3d/scene3d.probe.mjs` ALL OK (cube rouge, cube bleu animé suivi au pixel). Non sondés dans le navigateur : usdz/usdc, caméra du fichier, redimensionnement. Manques : `temp/converters_audit_2026-11-16/3d_gap.md` (skinning, PointInstancer, prims intrinsèques, subdivision, MaterialX/MDL, textures JPEG et hors paquet, lumières dôme/HDR, ombres, caméra orthographique, variantes/payloads/références, horloge par clip Molécule, iPad A12Z non mesuré).
- [x] **Lottie** : crate `atome/engines/atome-lottie` (dotLottie v1/v2, bodymovin 4, horloge, inventaire des fonctions non prises) ; dessin velato 0.12 + vello 0.10 sur le wgpu de Bevy dans l'image du quad (`bevy-core/src/lottie_*.rs`, `bevy-renderer/src/lottie_exports.rs`) ; entrée `eVe/domains/media/lottie_import.js#importLottieFile` ; route `vector` (`.lottie` par le nom, `.json` par le contenu). Tests 9/9 + 4/4 ; sonde `temp/converters_audit_2026-11-16/lottie/lottie.probe.mjs` ALL OK (2 animations, pixels, boucle, ~56 img/s, < 0,5 ms CPU par image). Non pris (notés en données) : coins arrondis, fusion de tracés, masques, tangentes de trajectoire.
- [x] **Budget iOS** (rendu 3D maison, 16 nov.) : moteur 14 967 907 o (br 3,75 Mo), module USD à part 1,42 Mo chargé à la demande ; perdu : BRDF GGX/Fresnel/environnement → Blinn-Phong, transparence triée par maillage, lumières au-delà de 8 (écrites dans le rapport). Ancien texte :  : renderer publié (Lottie + 3D) 18,76 Mo > 16 Mo ; 3D ≈ +3,8 Mo, Lottie ≈ +1,1 Mo ; décision à toi (renderer de HEAD remis, ou 3D en module à part / exclue d'iOS). `cargo deny` : `zip 8.6.0` tiré par openusd 0.6 (RUSTSEC-2026-0367/0368/0369/0429).
- [x] **zip 8.6.0 / cargo deny** (17 nov., choix utilisateur) : RUSTSEC-2026-0367/0368/0369/0429 ignorés dans deny.toml avec leur raison (seul extract est visé, jamais appelé) ; à retirer quand openusd passe à zip 9.
- [x] Loopy Pro (`.lpproj`) : route `loopy` dans la table (un dossier `.lpproj` déposé sur un projet, tous ses fichiers ensemble → `lpproj_import.js#importLoopyProject`, écrit par la session Loopy). Test 6/6. Choisir un dossier depuis l'import de la Médiathèque serait un contrôle nouveau : question à poser (règle 16).
- [x] Plug-ins, UI M5 dans un projet (option 1, « Dans la console », choisie par l'utilisateur le 18 nov.) : un plug-in qu'on ne possède pas ouvre son panneau soudé à sa case (auteur · nombre de modules, ses réglages en outils fixes, sans interrupteur ni ✕) ; la console lit la copie du projet (`readAudioEffect(id, carried)`) ; `tests/eve/mix_plugins_carried.test.mjs` 5/5.
- [x] Instruments portés par le projet (18 nov.) : `mix.instruments`, lus par le moteur et la console depuis la copie ; chaînes vidéo sans objet (aucun atome de chaîne vidéo enregistré).
- [ ] Plug-ins : prix et « Acheter » (achat par R-193). (Échantillons d'un Sampler reçu : FAIT le 18 nov., partagés avec le projet par `uses_media`, sonde deux comptes 19/19, registre R-194.)
- Hors champ : export (M4), non codé sans accord.
