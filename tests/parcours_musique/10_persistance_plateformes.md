# 10 — Persistance, historique, plateformes

Propriétaires : `eVe/core/atome_commit.js` (pipeline unique), `molecule/persistence/`, `molecule/session/`,
`kernel/timeline_validator.js`, `project_view_mode_state.js`. Règle 21 d'AGENTS.md : le serveur est la seule vérité.

Format : **ID** · priorité · plateformes — manipulation → attendu. *Sonde* · *Origine*.

## A. Retrouver son travail

- **PE-01** · P0 · W T I A — Faire une session complète (pistes, clips rognés, fondus, console avec effets et Aux,
  cellules, automation, prise), fermer le projet, le rouvrir → **tout est identique**, vue comprise.
  *Sonde* `tests/probes/molecule_mutation_property.probe.mjs`, `molecule_stores.probe.mjs`.
- **PE-02** · P0 · W I — Se déconnecter, se reconnecter (ou autre appareil sur le même compte) → même état.
- **PE-03** · P0 · W — Recharger la page en pleine prise → la prise est soit gardée, soit absente proprement (jamais un
  clip fantôme ou injouable). *Sonde* `tests/probes/molecule_recording_runtime.probe.mjs`.
- **PE-04** · P0 · W — Écriture atomique : plusieurs propriétaires modifiés en un geste → tout ou rien.
  *Sonde* `tests/probes/molecule_session_durability_atomicity.probe.mjs`.
- **PE-05** · P1 · W — Un projet de 1 000+ pistes s'ouvre et se sauve. *Sonde* `tests/probes/molecule_snapshot_invariants.probe.mjs`.
- **PE-06** · P1 · I — Quitter eVe sur iOS puis revenir → on revient dans le projet ouvert. *Origine* R-180 (2).
- **PE-08** · P0 · W I A — Un projet enregistré avec des effets **avant** un changement du catalogue (ex. une Réverb
  sans `space`, d'avant R-184) s'ouvre, ses effets gardés. *Sonde* `tests/probes/music/mix_catalog_params_upgrade.probe.mjs`.
  *Origine* défaut trouvé le 16 nov. 2026 (le noyau refusait `mix param space must be one of 5 choices`, projet impossible
  à ouvrir ; corrigé le jour même : au chargement, un paramètre absent prend sa valeur par défaut ; R-188).
- **PE-09** · P0 · W I A — Supprimer un projet dont la Timeline est ouverte → sa session de Timeline se ferme avec lui ;
  le projet ouvert ensuite, montré dans sa Timeline, est la Timeline active (lecture de l'hôte, Console). *Sonde*
  `tests/probes/music/project_delete_timeline.probe.mjs`. *Origine* défaut trouvé sur l'iPad dans AUM le 16 nov. 2026
  (la Timeline active restait sur le projet supprimé ; R-188).
- **PE-07** · P0 · I — Dans un projet, l'outil « Projets » du coin ramène à la matrice des Projets, sans coincer.
  *Origine* R-180 (1).

## B. Historique

- **PE-10** · P0 · W — Annuler / Rétablir sur 20 gestes variés, puis rouvrir le projet → l'historique est cohérent, rien
  n'est réécrit. *Sonde* `tests/probes/molecule_session_history.probe.mjs`, `tests/eve/atome_timeline_history.probe.mjs`.
- **PE-11** · P0 · W — Parité UI ↔ MCP : la même édition faite par l'interface et par la commande `ui.timeline.*` donne le
  même état et le même historique. *Sonde* `tests/probes/molecule_ui_mcp_parity.probe.mjs`.

## C. Plateformes

- **PE-20** · P0 · T — Tauri hors ligne : éditer, enregistrer une prise, fermer, rouvrir → tout est là ; reconnecté, le
  serveur le reçoit. *Sonde* `npm run test:molecule:tauri-startup`.
- **PE-21** · P1 · T — Annuler une création ne laisse pas de fantôme (Tauri). *Origine* mémoire « Annuler une création → fantôme ».
- **PE-22** · P0 · I — App iOS (serveur Swift local) : PE-01 sur l'iPad.
- **PE-23** · P1 · Ph — Téléphone : Timeline, Console et Cellules utilisables à 390×844 (rangée unique, panneaux dans l'écran).
- **PE-24** · P1 · W — Endurance : 30 min de cycles sans fuite ni ralentissement. *Sonde* `npm run test:molecule:endurance`.
- **PE-25** · P2 · W — Performance d'acceptation. *Sonde* `npm run test:molecule:performance`.
- **PE-26** · P0 · W I T — Importer un son de 90 Mo (AIFF) → sa durée est lue, l'app tient ; vers le moteur natif (iOS,
  Tauri) les octets passent une seule fois, en une chaîne base64, jamais en tableau JSON. *Sonde*
  `tests/probes/music/large_sound_import.probe.mjs` (Web) ; test Rust `test_large_clip_from_bytes_without_json`
  (`atome/engines/audio-engine/src/tests.rs`) ; iPad : `tests/ios/auv3_aum/large_sound.js` (banc AUM) (520 s lus en 0,6 s, AUv3 et app).
  *Origine* plantage sur l'iPad le 16 nov. 2026 (R-188).
  Depuis le 17 nov. 2026, la durée est lue dans l'en-tête du fichier, sans décoder le son ni le charger dans le
  moteur (un MP3 sans en-tête de longueur est lu paquet par paquet, sans décodage) ; vers le moteur natif, un seul
  `audio_probe_duration_from_bytes { bytesBase64 }`. Test Rust `test_probe_duration_matches_decode` (même durée
  que le décodage complet, AIFF de 91 Mo, m4a, alarmes MP3).

## À compléter

- Tests de la synchronisation hors ligne → en ligne sur iOS (file d'envoi) quand ils seront définis.
