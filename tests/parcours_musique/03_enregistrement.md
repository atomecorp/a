# 03 — Enregistrement (prises audio, vidéo, MIDI)

Propriétaires : `eVe/domains/rendering/project_view_timeline_recording.js`, `_live_take.js`, `_take_lanes.js`,
`project_view_record_trigger.js` ; `eVe/intuition/tools/molecule/recording/` (`generic.js`, `exact_placement.js`,
`midi_take.js`, `takes_event.js`) ; `runtime_record_scheduler.js` ; outil rec.
`eVe/intuition/tools/core/tool_runtime_recording_handlers.js` ; moteur `mix-graph/src/record_tap.rs`,
`audio-engine/src/recorder_strip.rs`.

Format : **ID** · priorité · plateformes — manipulation → attendu. *Sonde* · *Origine*.

## A. Prise audio à la volée

- **REC-01** · P0 · W T I A — Choisir une piste, Enr. › Audio, parler 4 s, Arrêter → un clip à la tête de départ,
  de la bonne durée, audible, son onde dessinée. *Sonde* `tests/probes/molecule_generic_recording.probe.mjs`, `molecule_recording_runtime.probe.mjs`.
- **REC-02** · P0 · W — Pendant la prise, le bloc grandit sur la piste avec ses crêtes, après le pré-roll. *Origine* R-170.
- **REC-03** · P0 · W I A — **Projet neuf**, aucune piste choisie : Enr. › Audio → la prise se pose sur la piste vide
  (« Piste 1 ») sans erreur `mix_record_point_missing`. *Sonde* `tests/probes/music/console_empty_track_take.probe.mjs`. *Origine* R-183 (défaut iPad).
- **REC-04** · P0 · W — La prise Web dure ce qu'on a enregistré ; ce qui est dit à la fin n'arrive pas trop tôt.
  *Origine* bug connu `recorder-inactive-input-drops-time`.
- **REC-05** · P0 · W I — Lecture en cours (hôte arrêté) puis Enr. → la lecture continue, la prise se pose sur le temps
  en cours ; Lecture/Stop pendant une prise la termine proprement. *Origine* R-179 défaut 6.
- **REC-06** · P0 · W I — Une prise finie montre Lecture dans le rail et dans le menu Mystic.
  *Origine* bug connu `recorded-media-contextual-play`.
- **REC-07** · P0 · W — Stop d'une prise de performance pendant un rafraîchissement : la prise s'arrête quand même.
  *Origine* bug connu `performance-record-stop-rail`.
- **REC-08** · P1 · W — Reprendre (après un échec de prise) récupère ce qui a été capté.
- **REC-09** · P0 · W I A — Relire une prise par son URL de média après avoir rechargé l'app → elle joue (jamais 404
  « Recording not found »). *Origine* R-179 défaut 5.

## B. Point REC de la tranche (R-183)

- **REC-20** · P0 · W A — REC sous IN (défaut) → prise **sèche** ; déplacer REC après VOL réglé à −20 dB → la prise est
  ~20 dB plus basse. *Sonde* `tests/probes/music/console_strip_take_web.probe.mjs` ; iPad `tests/ios/auv3_aum/rec_point_take.js`, `rec_point_ratio.js`.
- **REC-21** · P0 · W — REC placé après un effet (ex. Écho) → la prise contient l'effet.
- **REC-22** · P0 · W — Pendant la prise, l'outil REC de la tranche s'allume en rouge d'enregistrement, et s'éteint à
  l'arrêt. *Sonde* `tests/probes/music/console_rec_light.probe.mjs`.
- **REC-23** · P0 · A — Toute prise AUv3, y compris par l'outil rec. du ruban, passe par le REC de la tranche (pas
  l'enregistreur Swift brut) : le placement reste exact (`sample_accurate`). *Origine* R-183.
- **REC-24** · P1 · W — REC présent sur un bus et sur une piste vidéo ; on peut le déplacer, jamais le supprimer, jamais
  le passer dans une autre tranche.

## C. Zones d'enregistrement

- **REC-30** · P0 · W A — Poser une zone rec. sur la Timeline (glisser Enr. vers une piste), Lecture avant la zone → la
  prise démarre et s'arrête exactement aux bornes de la zone. *Sonde* `tests/probes/molecule_record_scheduler.probe.mjs`.
- **REC-31** · P1 · W — Zone en boucle : une prise par tour, couloirs de prises, choisir un passage par glisser (comping).
  *Sonde* `tests/probes/molecule_takes.probe.mjs`.
- **REC-32** · P1 · W — Zone avec Décompte, Mode Fusion/Remplacer, Quantif. à l'entrée.
- **REC-33** · P1 · W — Deux zones simultanées sur deux pistes → deux prises.

## D. Vidéo, photo, écran

- **REC-40** · P0 · W I — Enr. › Vidéo : aperçu caméra, prise, clip vidéo avec son, calé. *Sonde* `tests/probes/video_recording_stop_contract.probe.mjs`, `video_recording_audio_integrity_probe.probe.mjs`.
- **REC-41** · P1 · W — Une vidéo enregistrée ne reste pas noire dans l'aperçu Bevy (jeton de média).
  *Origine* bug connu `hidden-video-missing-media-token`.
- **REC-42** · P1 · W — Photo dans une zone : elle couvre toute la zone.

## E. MIDI

- **REC-50** · P0 · W A — Enr. › MIDI avec un clavier → un clip MIDI **sur la piste** (pas un média à part), aux temps
  joués. *Sonde* `tests/probes/midi_take_routing_piano_roll.probe.mjs`. *Origine* R-178 A1, R-179 constat 3.
- **REC-51** · P1 · W — Reprendre MIDI (prise rétrospective) : ce qui a été joué sans Rec est récupérable.
- **REC-52** · P1 · W — Deux claviers : une prise par périphérique.

## À compléter

- Calibration d'entrée par bouclage (aucune sonde).
