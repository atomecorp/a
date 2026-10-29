# Mesures des lots Activités (O17, 28 oct. 2026)

## Ce qui a été mesuré

- **Sonde** : `temp/activities_audit/o17/probe.mjs`, rapport dans `o17/shots/report.json`, résultat ALL OK.
- **Conditions** : Web, Chromium avec WebGPU réel, fenêtre 402 × 874, compte neuf.
- **Mémoire** : tas JS mesuré après un ramasse-miettes forcé (CDP `HeapProfiler.collectGarbage`, puis `Runtime.getHeapUsage`).
- **CPU** : temps des tâches du fil principal (CDP `Performance.getMetrics` `TaskDuration`) sur une fenêtre de 10 s, en part de cette fenêtre.

## Mémoire, CPU et latence (exercice Pompes)

| Moment | Tas JS | CPU fil principal |
| --- | --- | --- |
| Accueil, 3 s après son ouverture | 26,2 Mo | 19,1 % (démarrage pas encore fini) |
| Fiche Pompes ouverte | 29,1 Mo | — |
| Séance en cours, fiche ouverte | 29,2 Mo | 4,9 % |
| Séance en cours, fiche fermée | — | 1,4 % |
| Après Stop et fermeture | 29,2 Mo | 1,3 % |

| Latence | Valeur |
| --- | --- |
| Ouvrir la fiche (de la commande au disque « Lancer » posé) | 478 ms la 1re fois (modules chargés), puis 71 et 74 ms |
| Toucher « Lancer » → disque de séance posé | 69 ms |

Ce qu'on en tire :

- La fiche coûte environ 3 Mo de tas, et la séance n'ajoute presque rien.
- Rien ne reste derrière après Stop : le tas ne monte pas, et le CPU revient au niveau du repos.
- Une séance qui continue fiche fermée (L3) coûte environ 1,4 % du fil principal : son minuteur de 250 ms et la tuile « en cours ».

## Taille du code

Fichiers créés par les lots (L3–L12, briques, coachs, VideoTrain, serveur) :

- 53 fichiers, 4 202 lignes, 330 Ko non minifiés ;
- aucun ne dépasse 300 lignes, le plus grand en fait 213 (`dashboard_brick_session_card.js`).

Fichiers existants qui ont grandi :

| Fichier | HEAD → maintenant |
| --- | --- |
| `dashboard_training_card.js` | 215 → 329 (à justifier : coordination de la séance, de la reprise, du trajet, de la musique et de l'envoi) |
| `dashboard_training_card_view.js` | 202 → 323 |
| `dashboard_training_session.js` | 198 → 248 |
| `dashboard_training_session_view.js` | 152 → 222 |
| `training_runtime.js` | 321 → 356 |
| `atome/src/shared/training_catalog.js` | 133 → 327 |
| `atome/src/squirrel/training/contracts.js` | 73 → 105 |
| `languages_training.js` | 61 → 184 (textes, exempté) |

Fichiers partagés au-delà de 500 lignes, édités aussi par d'autres sessions :

- `dashboard_mystic_sources.js` : 501 lignes (L12 n'y a touché que des lignes existantes) ;
- `bevy_panel_calendar_runtime.js` : 474 lignes.

## Ce qui n'est pas mesuré (honnêtement)

- **Pas de mesure « avant » pour L1 et L2** : aucune n'a été prise avant leur codage. Les rejouer sur un HEAD vierge
  (`git archive HEAD`) demanderait un second serveur et une seconde construction WASM. Les chiffres ci-dessus servent
  désormais de référence pour les lots suivants.
- **Appareils** : iPad, Android et Tauri ne sont pas mesurés. Leur mesure est un test utilisateur.
- **Taille livrée** : la taille minifiée et compressée n'est pas mesurée, car les modules sont servis en ESM, sans
  bundle.
