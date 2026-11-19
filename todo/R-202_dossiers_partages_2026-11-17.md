# R-202 — Fichiers « à la Dropbox » et projets partagés (cahier des charges, 17 nov. 2026)

Demande (toi, 17 nov.) : retrouver la fonction de l'ancien aBox (se servir d'atome comme d'une Dropbox) sur iOS, Tauri
et Web ; partager un projet avec des personnes, en lecture ou en écriture, en direct ; un appui long sur le projet
partagé pour arrêter de partager ou passer en lecture / écriture ; par défaut tout le monde lit et écrit ; le plus
simple possible, quitte à avoir moins de possibilités. Ajout (toi, 17 nov.) : un fichier partagé peut être exposé sur
le Web par un site (lecture publique) ; pas d'envoi anonyme, un envoi demande un compte atome.

## 1. Ce qui marche aujourd'hui (vérifié)

Sonde `temp/r202_partage/flow.probe.mjs`, deux vrais comptes, serveur isolé (`atome-server`, binaire du 16 nov. 23:16,
`PROBE_PREBUILT_SERVER=1 PROBE_NO_REFERENCE=1`) : **20/22**.

| Étape | Résultat |
| --- | --- |
| Envoyer un PDF et un zip (`POST /api/uploads`), relire le sien | OK |
| Les poser dans un projet (atomes `file` / `raw` enfants du projet) | OK |
| Partager le projet (lit + écrit + crée + supprime), invitation reçue en direct, acceptée | OK |
| « Partagés avec moi » liste le projet ; le destinataire voit les fichiers (`state-current` `include_shared`) | OK |
| Le destinataire renomme un fichier et ajoute un élément ; le propriétaire voit les deux | OK |
| Passage en lecture seule : l'écriture du destinataire est refusée par le serveur (`property_write_denied`) | OK |
| Arrêt du partage : le destinataire ne voit plus rien | OK |
| Envoi sans compte refusé (401) | OK |
| **Le destinataire télécharge le PDF du projet partagé** | **ÉCHEC : 403 « Access denied »** |

Le moteur de partage est complet côté serveur (`atome/servers/atome-server/src/social/sharing/`, port de
`server/syncSharingService.js`) : rôles lecteur / contributeur / éditeur / co-propriétaire, partage d'une racine =
tout son contenu présent et futur, changement de droits, arrêt en cascade, consentement du destinataire.

## 2. Ce qui manque

### Fichiers
- F1. **Téléchargement d'un fichier d'un projet partagé refusé** : `media/downloads.rs#shared` ne cherche qu'un partage
  du fichier lui-même (`atome_id = ?`), jamais celui du projet qui le contient. Racine : reprendre la portée par
  hiérarchie du routeur de coffres (`vault_router/shares.rs#share_for_atome`). Touche aussi toute image ou vidéo d'un
  projet partagé (même route).
- F2. PDF, docx, md, csv… sont convertis en texte à l'import (`document_filing.js`) ; l'original n'est pas gardé.
  Dans un dossier partagé, il faut garder le fichier tel quel.
- F3. Un fichier autre (zip…) est stocké puis invisible : rendu comme une forme vide (`render_atom.js`), absent de la
  Médiathèque (`MEDIA_LIST_TYPES` = audio, vidéo, image), refusé au placement (`media_kind_unsupported`).
- F4. Les types `file` et `raw` ne déclarent ni position ni taille (`eVe/registry/generated/atome_types.json`) : un
  fichier ne peut pas être posé sur le canevas d'un projet.
- F5. Aucune action pour ouvrir ou enregistrer un fichier stocké (la seule, `downloadUpload`, est dans le panneau
  aBox éteint).
- F6. Le dépôt ne marche que sur un projet ouvert ; pas sur une tuile de Projets.
- F7. Aucune limite de taille ni quota de stockage (le stockage est facturé au jour, pas au volume, R-193).

### Partage de projet (interface)
- P1. Pas d'outil « Part. » dans l'appui long d'un projet (Projets n'a que Publier et Envoi d'un programme).
- P2. Les projets partagés avec moi n'apparaissent pas dans Projets (`list_projects` filtre sur le propriétaire,
  `adole_api/projects.js`).
- P3. Pas de présentation lecture seule chez un lecteur (le serveur refuse, mais l'interface laisse faire).
- P4. Un projet ouvert ne réagit pas à l'arrêt du partage (`share-revoked`).
- P5. `shared_project_override_runtime.js` lit des champs que le moteur ne renvoie plus : probablement mort, à vérifier.

## 3. Parcours retenu (proposé)

Ton parcours est le bon, avec une simplification : **le dossier partagé, c'est le projet.** Pas de nouveau type
« dossier » : un projet contient déjà ses éléments par `parent_id`, et le partage d'un projet couvre tout ce qui y
entre, maintenant et plus tard.

1. Je dépose un fichier (n'importe lequel) sur un projet ouvert **ou sur sa tuile dans Projets** : il entre dans le
   projet et dans mes médias, en une fois (pas d'étape « médias puis projet »).
2. Appui long sur le projet → **Part.** → je coche des contacts : ils lisent et écrivent (défaut demandé).
3. Chez eux : la demande (page N2b déjà validée), Valider → le projet est dans leur Projets, en direct.
4. Appui long sur le projet partagé → **Lecture** (interrupteur : tout le monde en lecture seule) ou **Arrêter**.
   Pour une seule personne : la page Part., appui long sur la personne → les mêmes deux outils.

Pourquoi pas « médias, puis projet » comme étape obligatoire : deux gestes là où un suffit. Le fichier va de toute façon
dans les médias (la règle 18 « un seul import » est gardée : même panneau, même code).

## 4. Le Web (ajout du 17 nov.)

- Lecture publique : un fichier d'un projet publié en site (Publier, déjà là) s'affiche sur la page : un PDF s'ouvre,
  un autre fichier se télécharge. Aujourd'hui le site ne sert que image, vidéo, son, SVG (`server/site_publishing.js`
  `MEDIA_TYPES`) : ajouter `file` / `raw`, servis par empreinte comme les médias (`/_site/m/<sha>`).
- Envoi : **jamais anonyme.** Mon avis : tu as raison. Un envoi anonyme sur ton compte, c'est du stockage payé par toi,
  de l'abus (fichiers énormes, contenus illicites hébergés chez toi, donc ta responsabilité) et aucun moyen de savoir
  qui. Le serveur refuse déjà tout envoi sans session (vérifié : 401). Pour qu'un visiteur dépose, il crée un compte
  atome ; il devient alors un contact et on lui partage le projet en écriture : c'est le même parcours, rien de plus
  dans l'interface.
- Garde-fous à ajouter (aucun aujourd'hui) : une taille maximale par fichier et un quota par compte, réglables côté
  serveur ; un fichier déposé par un autre dans mon projet compte sur le quota de celui qui dépose, pas sur le mien.
  Valeurs proposées (nombres naturels, règle 19) : 3 Go par fichier, 21 Go par compte de test. Tranché (18 nov.) : aucune limite.

## 5. Maquettes (aux vrais jetons, sur captures réelles) — à valider avant tout code (règle 16)

`temp/r202_partage/mockups/` (source `build.mjs`) :
1. `1_appui_projet.png` — projet tenu, pas partagé : « Part. » rejoint les outils de l'appui long.
2. `2_part_projet.png` — page Part. du projet (même brique que les listes, R-161 N4) : cocher = partager, lit et écrit.
3. `3_personne_tenue.png` — une personne tenue : Lecture (interrupteur) et Arrêter dans la bande du pied.
4. `4_appui_projet_partage.png` — projet partagé tenu : Part., Lecture, Arrêter ; la légende « Partagé avec … ».
5. `5_demande_recue.png` — chez l'autre : la demande N2b avec le contenu du projet.
6. `6_fichiers_dans_projet.png` — un fichier dans un projet : une tuile (nom en haut, glyphe du genre) ; toucher =
   ouvrir (PDF) ou enregistrer.

Questions ouvertes :
- Q1. Valides-tu les 6 maquettes ?
- Q2. Chez le destinataire, un projet partagé avec lui se distingue-t-il dans Projets ? Proposition : rien sur la
  tuile (zen) ; la légende « Partagé par Jean-Eric » dans son appui long, où « Suppr. » devient « Quitter ».
- Q3. Taille maximale par fichier et quota par compte.
- Q4. Le dépôt sur une tuile de Projets (F6) : oui ?

## 6. Lots (après validation)

| Lot | Contenu | Propriétaires |
| --- | --- | --- |
| L1 | F1 : téléchargement par la portée du partage du projet (Rust), test serveur ; demander l’orchestrateur avant, build dans une cible privée seulement | `atome-server/src/media/downloads.rs`, `vault_router/shares.rs` |
| L2 | F4 : position et taille déclarées pour `file` / `raw` ; couloir R-192, demander l’orchestrateur, régénérer uniquement par `npm run registry:build` | registre (couloir R-192, demander à l'orchestrateur) |
| L3 | F2–F3, F5 : garder l'original, tuile de fichier (maquette 6), ouvrir / enregistrer, Médiathèque › Fichiers | `file_import_table.js`, `render_atom.js`, `media.js`, `project_media_import_runtime.js` |
| L4 | P1 + maquettes 1–4 : Part. du projet, Lecture, Arrêter, en généralisant la page Part. des listes | `dashboard_projects_items.js`, `dashboard_shopping_share.js`, `list_share_runtime.js` |
| L5 | P2–P4 : partagés avec moi dans Projets, lecture seule à l'écran, fermeture à l'arrêt | `adole_api/projects.js`, `communication_share_resolve.js` |
| L6 | F6 : dépôt sur une tuile de Projets | `project_drop_zone_runtime.js` |
| L7 | Web : fichiers dans les sites ; taille max + quota | `server/site_publishing.js` et son port Rust, `media/uploads.rs` |
| L8 | Sonde deux comptes de bout en bout (étendre `flow.probe.mjs`) + Playwright sur l'app ; iPad et Tauri par toi | `temp/r202_partage/` |

### État des lots (17 nov.)

- [x] L1 — `atome-server/src/media/shared_folders.rs` (lecture par un dossier partagé : propriétaire et membres, le fichier de chacun ; garde : un membre ne nomme dans le dossier qu'un fichier qu'il peut lire), `downloads.rs`, `served.rs` (indice `media_user_id`), `vault_router/shares.rs` (un appel). Test Rust `shared_folders::tests`.
- [x] L2 — `atome_type_written_properties.js` (`file`, `raw` : place, taille, `media_url`) ; `registry:build` cc0adc139c4d, `registry:check ok`.
- [x] L3 — tuile `eVe/domains/rendering/file_tile_source.js` (verre, bandeau du nom 9 car., disque + glyphe `document` / `archive` ajoutés à `dashboard_svg_sources.js`), `render_atom.js` ; toucher hors Édition : `eVe/domains/media/project_file_open.js` (PDF ouvert sur le Web, sinon enregistré par `saveExportFile`). Non codé : filtre « Fichiers » de la Médiathèque (élément nouveau, maquette à valider).
- [x] L4, L5 — appui de Projets (Part., Lecture, Arrêter, Quitter, légende), projets reçus parmi les miens, lecture seule → Consultation.
- [x] L6 — dépôt sur une tuile de Projets (`bevy_ui_mystic_model.js` `onDropFiles` → `dashboard_projects_sharing.js#dropInto`).
- [x] L7 — limites retirées (toi, 18 nov. : « pas de limite… sur leur propre machine, on va pas limiter » ; `media/upload_limits.rs` supprimé, plus de refus 413 ; seules bornes : l'espace payé, R-120 lot D, et le disque) ; fichiers dans les sites : lien de téléchargement (`site/projection.rs`, `site/media.rs`, `site/objects.rs`).
- [x] L8 — sondes : `flow.probe.mjs` 29/29 (build privée), `runtime.probe.mjs` 13/13, `render_atom.probe.mjs` 2/2 ; Playwright de l'app non lancé (serveur 3001 interdit, machine saturée) ; iPad et Tauri par toi.
