# Inventaire — Plateformes, moteur et performances

Périmètre : Web, Tauri (Mac, Windows, Linux), iOS et iPadOS, AUv3, Android, la montre ; le rendu Bevy sur WebGPU ; les serveurs Rust ; la mémoire et l'énergie ; la commande à distance ; l'installation et la distribution ; l'ouverture du moteur à des applications tierces.

État : **à relever**. Les cas du parcours de tests ci-dessous décrivent déjà une partie des fonctions ; les
demandes du registre listées plus bas disent ce qui a été demandé dans ce domaine. Chaque fonction relevée
est vérifiée dans le code avant d'être écrite (format dans [README.md](README.md#format-dune-fonction)).

## Sources
- Parcours : aucun pour l'instant.
- Propriétaires du code : `platforms/web`, `platforms/desktop-tauri`, `platforms/ios`, `eVe/domains/rendering`, `atome/renderers`, `atome/src/squirrel/teleport`, `atome/src/squirrel/distribution`.

## Fonctions

Aucune fonction relevée pour l'instant. Identifiants : `PLT-001`, `PLT-002`… dans l'ordre du relevé.

## Demandes du registre (17)

Titre et statut tels que [todo/REGISTRE_DEMANDES.md](../todo/REGISTRE_DEMANDES.md) les donne le 2026-11-25. Une demande `FAIT`
a des fonctions à relever ; les autres disent ce qui reste ouvert.

- R-316 — Exposer le moteur atome à l'extérieur (SDK / applications tierces) : analyse de faisabilité (2026-11-24) — `FAIT`
- R-295 — Audit exhaustif atome/eVe sur l'iPad « Ipad atomic » : tests réels, corrections, rapport (2026-11-23) — `EN COURS`
- R-246 — Campagne catalogue/scénarios/sécurité (priorité absolue) + nettoyage profond du framework (2026-11-19) — `EN COURS`
- R-241 — iPad : sortie d'un modèle bloquée, Projets → matrice, cases vides, rail, halo du Mystic (2026-11-19) — `FAIT`
- R-239 — iPhone : lag, chauffe, retour au Dashboard lent, bande du bas disparue, retournement des tuiles cassé (2026-11-19) — `ATTENTE UTILISATEUR`
- R-234 — chrono remplacé par jiff dans tout le Rust (RUSTSEC-2026-0543) (2026-11-18) — `FAIT`
- R-233 — iPhone : Dashboard et projet mal dessinés (plaques coupées, restes de plaques, bande d'outils à moitié) (2026-11-18) — `ATTENTE UTILISATEUR`
- R-206 — Audit d'un journal de démarrage iOS : corriger ce qui est louche (2026-11-17) — `FAIT`
- R-192 — Entrées contextuelles iOS : un lien ouvre eVe général ou eVe Musique, premier lancement compris (2026-11-16) — `CODE`
- R-128 — Défauts iPhone : ⌂ entre les flèches, ✕ selon la main, code de récupération, disque Sport, lenteurs Rust, Capture photo/vidéo (2026-11-08) — `OUVERT`
- R-125 — Mémoire de l'app sur les appareils de 2 Go (iPhone 8…) : mesurer, puis alléger (2026-11-07) — `OUVERT`
- R-122 — Page d'installation iOS (atome.one/ios/install) vide : réparée et déployée (2026-11-06) — `FAIT`
- R-118 — Refonte Rust-first : étapes 1 (hygiène) et 2 (atome-store) faites, restes et suite (2026-11-04) — `EN COURS`
- R-106 — Complete atome/eVe optimization campaign — `EN COURS`
- R-104 — Refonte globale atome/eVe : cartographie, MCP universel en accès, offline sans IA — `FAIT`
- R-108 — Incident iOS 1.46 (44) : projets, Sport, registre R-104, design V5 (2026-11-01 soir)
- R-110 — Android local test, tester distribution and server update (2026-11-02) — `FAIT`
