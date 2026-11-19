# 09 — Atome dans un hôte AUv3 (AUM sur l'iPad atomic)

Aucune sonde automatique ne tourne dans AUM : ce fichier est **la** recette de l'AUv3. Outils de pilotage :
[tests/ios/auv3_aum/](../ios/auv3_aum/README.md) (`build.sh`, `wda.sh`, `reload.sh`, `run.sh`, `w.sh` + sondes évaluées dans la page
de l'AUv3 ; mode d'emploi et derniers résultats dans son README).

Propriétaires : `eVe/domains/rendering/project_view_timeline_host_follow.js`, `eVe/core/media_engine/molecule_render_schedule.js`
(`hostLockedPosition`), `atome/src/application/audio_runtime/auv3_host_bridge.js`, Swift
`platforms/ios/atome-auv3/` (`AUv3TransportObserver.swift`, `AUv3KiraEngine.swift`, `utils.swift`), Rust `audio-engine/src/host_output.rs`.

Session AUM de référence : séquenceur (horloge de l'hôte) → synthé (Pro-A5) → envoi « Bus A » ; « Bus A » → Atome → sortie.

Format : **ID** · priorité — manipulation → attendu. *Sonde* · *Origine*.

## A. Synchro sur l'hôte

- **HO-01** · P0 — AUM Lecture → Atome démarre calé (`sample_accurate`), sa position = celle de l'hôte. AUM Stop →
  Atome s'arrête. AUM relancé → Atome se recale là où en est l'hôte. *Origine* R-179 (prouvé).
- **HO-02** · P0 — Hôte arrêté : Lecture d'Atome démarre quand même (lecture libre).
- **HO-03** · P0 — Ouvrir (ou rouvrir) un projet pendant que l'hôte joue → Atome se met en lecture, calé (ex. AUM
  05:40.1 ↔ Atome 340,02 s). *Sonde* `host_reopen_lock.js`. *Origine* R-179 défaut 4.
- **HO-04** · P1 — Boucle, déplacement de la tête ou changement de tempo dans AUM pendant la lecture → Atome se recale.
- **HO-05** · P1 — Stop d'Atome pendant que l'hôte joue → la Timeline reste arrêtée jusqu'au prochain départ de l'hôte.
- **HO-06** · P1 — Multi-projets : projet 1 → 2 → 3 → 1, ancrages identiques. *Sonde* `multi_project_anchor.js`.
- **HO-07** · ⏸ — Hôte arrêté, tête déplacée dans AUM : Atome ne suit pas aujourd'hui. Question R-179 (3) ouverte.

## B. Prises dans l'AUv3

- **HO-10** · P0 — Prise audio à la volée l'hôte jouant → elle démarre là où est l'hôte, sans pré-roll, la lecture
  continue après ; calage sur la grille de l'hôte à ±1 ms. *Sonde* `take_onsets_grid.js` — avec une source nette et quantifiée (clic ou
  note percussive sur chaque double croche) ; un synthé à attaque lente ne permet pas la mesure (voir le README du banc). *Origine* R-179 défaut 3.
- **HO-11** · P0 — Prise par zone rec. posée → calée à ±1 ms. *Sonde* `record_region_take.js`.
- **HO-12** · P0 — La prise prend l'entrée du plugin (le bus envoyé par l'hôte), jamais le micro (erreur 2003329396).
  *Origine* R-179 défaut 1.
- **HO-13** · P0 — REC sous IN → sèche ; REC après VOL −20 dB → −20 dB environ. *Sonde* `rec_point_take.js`, `rec_point_ratio.js`. *Origine* R-183.
- **HO-14** · P0 — Prise sur la « Piste 1 » d'un projet neuf → réussit. *Origine* R-183 (défaut iPad).
- **HO-15** · P0 — Prise relue après rechargement du plugin (URL de média) → joue. *Origine* R-179 défaut 5.
- **HO-16** · P1 — Plusieurs pistes, changement de piste et de clip pendant la session.
- **HO-17** · P0 — Une prise ne se perd pas et l'arrêt d'une prise ne reste pas bloqué (messages natifs jamais annulés).
  *Origine* R-179 défaut 2.

## C. Mixage dans l'AUv3

- **HO-20** · P0 — Aux d'une piste vers un bus : le bus reçoit ; piste coupée : le bus reçoit toujours. *Sonde* `aux_to_bus.js`.
- **HO-21** · P0 — OUT mono (voie 1) appliqué sans erreur. *Sonde* `out_mono.js`.
- **HO-22** · P1 — Ampli NAM en direct : pas de décalage entre pistes ; latence déclarée à l'hôte (`latency` de l'AU).
- **HO-23** · P1 — DSP d'AUM : ~18 % au repos, 22–26 % avec effets ; pas de craquement.

## D. MIDI avec l'hôte

- **HO-30** · P0 — MIDI de l'hôte reçu par Atome. *Sonde* `host_midi_capture.js`.
- **HO-31** · P0 — MIDI d'Atome vers le synthé de l'hôte : le synthé sonne. *Origine* R-179 défaut 7.

## E. Fenêtre du plugin

- **HO-40** · P1 — Plugin rechargé → rouvre le projet de travail (pas l'accueil). *Origine* R-179 constat 4 (ouvert).
- **HO-41** · P1 — Accueil et Réalisations dans la fenêtre AUv3 : tuiles en ordre, sans trou. *Origine* R-179 constat 4 (ouvert).

## À compléter

- Rendu audio réel du trim / stretch dans l'AUv3 (pas d'enregistreur de sortie dans les sondes).
- Niveau d'une note du Sampler interne lu à 0 (à reconfirmer).
