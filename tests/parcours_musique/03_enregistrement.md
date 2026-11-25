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
  *Mise à jour 2026-11-25 (25 nov., R-351)* : « Choisir une piste, Enr. › Audio, parler 4 s, Arrêter » : dans la Timeline à l'arrêt, Enr. **arme** la piste ; il faut Lecture pour lancer la prise (`project_view_timeline_recording.js#toggle` → `arm`). En lecture, Enr. démarre tout de suite (REC-05 reste vrai). Réécrire avec « Enr. puis Lecture ». Le choix « Enr. › Audio » passe aussi par un appui tenu ou un glisser : le toucher bref prend le dernier type (R-362).
- **REC-02** · P0 · W — Pendant la prise, le bloc grandit sur la piste avec ses crêtes, après le pré-roll. *Origine* R-170.
- **REC-03** · P0 · W I A — **Projet neuf**, aucune piste choisie : Enr. › Audio → la prise se pose sur la piste vide
  (« Piste 1 ») sans erreur `mix_record_point_missing`. *Sonde* `tests/probes/music/console_empty_track_take.probe.mjs`. *Origine* R-183 (défaut iPad).
  *Mise à jour 2026-11-25 (25 nov., R-351 / R-362)* : projet neuf, Enr. › Audio : la prise attend Lecture (armement) ; en vue Scène, la piste n'est plus créée d'office tant qu'une piste de contenu existe.
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
- **REC-53** · P0 · W T I A Ph — Piste audio choisie, Enr. › Audio **à l'arrêt** → Enr. s'arme, la région rouge armée
  respire de la tête de lecture à la fin de la piste, rien n'enregistre ; Lecture → la prise démarre (après son pré-roll),
  le clip grandit. Enr. touché de nouveau avant Lecture → désarmé, rien posé. *Origine* R-351 (25 nov.).
- **REC-54** · P0 · W I A Ph — Pendant une prise micro dans la Timeline, l'onde du clip en cours se dessine au fur et à
  mesure (pas seulement à l'arrêt), y compris sur l'app iOS (prise par le point REC de la piste, moteur Kira).
  *Sonde* `tests/probes/music/timeline_live_take_waveform.probe.mjs`, `tests/probes/ios_strip_take_scope_contract.probe.mjs`. *Origine* R-247.
- **REC-55** · P0 · W T I A Ph — Arrêter une prise audio → le clip garde son onde (256 crêtes), elle ne disparaît pas à
  l'arrêt ; une longue prise garde son passage le plus fort dans l'onde. *Sonde*
  `tests/probes/music/timeline_live_take_waveform.probe.mjs`. *Origine* R-256.
- **REC-56** · P1 · W T I — Timeline, Cellules ou vue Scène : un toucher bref sur Enr. (sans choisir de type) enregistre
  dans le **dernier type** choisi (Audio au premier usage) ; un appui tenu ou un glisser déplie toujours la palette des
  types pour en prendre un autre. *Origine* R-362 (remplace « un toucher ouvre toujours la palette » de R-271).
- **REC-57** · P1 · W — Enr. armé, rien n'enregistre encore : choisir un autre type dans la palette d'Enr. → la prise
  est réarmée dans ce type (jamais désarmée). *Origine* R-362.

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
  *Mise à jour 2026-11-25 (22 nov., R-271)* : « Zone avec Décompte » : dans les Cellules, le décompte est celui de Réglages › Décompte (0–16 temps), plus le pré-roll du métronome ; préciser que la ligne vise la Timeline.
- **REC-33** · P1 · W — Deux zones simultanées sur deux pistes → deux prises.
  *Mise à jour 2026-11-25 (25 nov., R-351)* : « Deux zones simultanées sur deux pistes » : le geste canonique est maintenant l'armement de plusieurs en-têtes (REC-82/83), pistes hétérogènes possibles ; la ligne reste vraie pour les zones mais incomplète.
- **REC-58** · P1 · W — Timeline : double toucher sur une piste (au même endroit) → une région d'enregistrement armée
  d'une mesure s'y pose, choisie ; son type est le dernier type d'Enr., MIDI si aucun n'a jamais été choisi (sinon le
  premier que la piste accepte) ; le rail montre ses types, celui-ci allumé ; Lecture l'enregistre. *Origine* R-362.
- **REC-59** · P1 · W — Timeline : double toucher puis glisser sur une piste → la région suit le doigt pendant le glisser
  et prend exactement la taille du glisser. *Origine* R-362.
- **REC-60** · P1 · W — Timeline : double toucher sur une région MIDI → un clip MIDI vide prend sa place, ouvert dans
  l'éditeur pour entrer les notes ; sur une région d'un autre type, le double toucher règle son nombre de prises.
  *Origine* R-362.

## D. Vidéo, photo, écran

- **REC-40** · P0 · W I — Enr. › Vidéo : aperçu caméra, prise, clip vidéo avec son, calé. *Sonde* `tests/probes/video_recording_stop_contract.probe.mjs`, `video_recording_audio_integrity_probe.probe.mjs`.
  *Mise à jour 2026-11-25 (25 nov., R-351)* : Enr. › Vidéo à l'arrêt arme la piste (région rouge + glyphe caméra) ; la prise démarre à Lecture.
- **REC-41** · P1 · W — Une vidéo enregistrée ne reste pas noire dans l'aperçu Bevy (jeton de média).
  *Origine* bug connu `hidden-video-missing-media-token`.
- **REC-42** · P1 · W — Photo dans une zone : elle couvre toute la zone.
- **REC-61** · P1 · W — Deux pistes vidéo armées sur **deux caméras différentes** (Entrée de chaque piste), Lecture →
  deux prises vidéo filmées en même temps, deux clips. *Origine* R-351.
- **REC-62** · P1 · W — Deux pistes armées sur **la même caméra** → la seconde est refusée avec sa raison
  (`video_camera_in_use`, message discret), la première filme. *Origine* R-351.
- **REC-63** · P1 · I — Sur l'iPad (enregistreur natif, une caméra à la fois), une seconde prise vidéo simultanée est
  refusée et annoncée (`video_recording_single_camera`), jamais un plantage ni une prise noire. *Origine* R-351.
- **REC-64** · P1 · W — Une caméra armée à côté d'une piste audio armée : la vidéo filme l'image seule, le son vient de la
  piste audio. *Origine* R-351.

## E. MIDI

- **REC-50** · P0 · W A — Enr. › MIDI avec un clavier → un clip MIDI **sur la piste** (pas un média à part), aux temps
  joués. *Sonde* `tests/probes/midi_take_routing_piano_roll.probe.mjs`. *Origine* R-178 A1, R-179 constat 3.
  *Mise à jour 2026-11-25 (25 nov., R-351)* : Enr. › MIDI à l'arrêt arme ; la prise démarre à Lecture.
- **REC-51** · P1 · W — Reprendre MIDI (prise rétrospective) : ce qui a été joué sans Rec est récupérable.
- **REC-52** · P1 · W — Deux claviers : une prise par périphérique.
- **REC-65** · P1 · W — Vue Scène ou Cellules, Édition allumée : une case armée en MIDI (double toucher puis Prise MIDI)
  ouvre un clip MIDI vide dans l'éditeur, prêt à recevoir des notes à la main. *Origine* R-362.

## F. Entrée, décompte et calibration

- **REC-66** · P0 · W T I — Rail › Entrée (piste choisie) : la liste monte depuis l'outil — le micro contre le doigt,
  puis la caméra, **Monitoring** tout en haut ; chaque sorte a son barillet (caméra, micro), réglé sur l'entrée propre de
  la piste ; un cran ne referme pas la liste. *Origine* R-254 (maquette 2 « barillets »).
- **REC-67** · P0 · W I — Entrée d'une piste réglée sur un micro A, une autre piste sur un micro B → chaque prise ouvre
  l'entrée de sa piste ; recharger l'app → les choix sont relus (gardés dans la tranche, `mix.record.set`). *Origine* R-254.
- **REC-68** · P0 · W — Monitoring éteint sur une piste, prise audio → on n'entend pas la piste pendant la prise, mais la
  prise est bien captée (au point REC) ; Monitoring allumé = glyphe lavande. Sans piste choisie, Monitoring règle toutes
  les pistes qui enregistrent du son. *Origine* R-254.
- **REC-69** · P1 · W I — Sans piste choisie, Monitoring reste en tête de liste et le barillet règle l'entrée en usage ;
  en vue Cellules, la piste des cellules choisies est celle réglée. *Origine* R-254 (retour iPhone du 22 nov.).
- **REC-70** · P1 · I Ph — App iOS : Entrée liste les caméras natives (Arrière, Avant) et les micros natifs (jamais
  « Aucune entrée ») ; choisir Avant bascule l'aperçu et la prise de la piste sur la caméra avant. *Origine* R-254.
- **REC-71** · P1 · W I — Entrée d'une piste réglée sur une carte débranchée → le barillet montre « Entrée débranchée »
  en premier (jamais remplacée par une autre) ; armer ou enregistrer cette piste est refusé avec le nom de l'entrée
  manquante (`audio_input_device_not_found`). *Origine* R-254, R-351.
- **REC-72** · P0 · W I — Piste audio sur une carte multicanale : Entrée montre le rouleau des canaux et Mono / Stéréo ;
  Mono 17 → une prise d'un canal ; Stéréo 23–24 (la paire lue entre 21–22 et 25–26) → une prise de deux canaux ; retour à
  Mono redonne 17 ; réglages gardés par piste après relance. *Origine* R-286.
- **REC-73** · P1 · W I — Changer de carte sur une piste → ses canaux sont gardés seulement si la nouvelle carte les a,
  sinon la piste reprend les deux premiers (jamais un programme refusé par le moteur). *Origine* R-286.
- **REC-74** · P1 · W — Entrée › « Inputs » → le moniteur des entrées : chaque appareil audio et MIDI branché en accordéon
  déplié, une jauge par entrée (16 canaux par appareil MIDI) ; en largeur un panneau collé à Inputs, en hauteur les
  accordéons dans la liste qui défile ; Inputs de nouveau le replie. *Origine* R-286 (maquettes A + B).
- **REC-75** · P1 · W — Un appareil replié dans le moniteur montre un voyant rond à côté de son chevron : éteint au
  silence, allumé par une note MIDI ou le signal de la carte, éteint de lui-même. *Origine* R-286 (maquette 1 « voyant »).
- **REC-76** · P1 · I T — Brancher un clavier MIDI à chaud → il apparaît dans le moniteur et les entrées sans relancer
  l'app (iOS : avis CoreMIDI ; bureau : relecture des ports chaque seconde). *Origine* R-286.
- **REC-77** · P0 · W T I — Première prise audio d'une session sur une entrée jamais calibrée → la calibration se fait
  seule, avant la prise (Web : message discret « Calibration de l'entrée… », impulsions audibles ~2,5 s ; natif :
  silencieuse) ; une calibration déjà gardée pour cette entrée n'est pas refaite ; un échec n'empêche pas la prise.
  *Origine* « Calibrer automatique » (suite R-254, 22 nov.).
- **REC-78** · P1 · W T I — Réglages › Avancé › Calibrer → mesure manuelle de l'entrée de la piste choisie (sinon de celle
  en usage), son glyphe allumé pendant la mesure, le résultat en ms (ou l'erreur) dans le message discret ; Entrée ne
  contient plus Calibrer et n'ouvre plus l'ancien panneau « Entrée » (deux sélecteurs globaux, Actualiser). *Origine*
  « Calibrer automatique », R-254 (doublon supprimé), R-293.
- **REC-79** · P1 · W — Une piste choisie : la case « Niveau » du rail (au-dessus de Replier), repliée par défaut,
  touchée, montre deux barres gauche/droite qui suivent l'entrée sans l'entendre ni l'enregistrer ; repliée, elle ne lit
  plus l'entrée. *Origine* « Calibrer automatique » (VU-mètre), remplacé par R-285 / R-360.
- **REC-80** · P0 · W — Cellules, Réglages › Décompte = 4 temps, rien ne joue, prise dans une cellule → 4 clics de
  décompte puis la prise commence (décalée de 4 temps) ; 3 temps → 3 clics ; non réglé = une mesure ; 0 = aucun clic.
  *Origine* R-271.
- **REC-81** · P1 · W — Cellules, d'autres cellules jouent déjà → pas de clics de décompte, la prise part au prochain pas
  de la grille. Le décompte des Cellules ne change pas le pré-roll du métronome de la Timeline. *Origine* R-271 (validé 22 nov.).

## G. Prises simultanées et Geste

- **REC-82** · P0 · W — Timeline : Enr. armé, toucher l'en-tête d'autres pistes → chacune s'arme dans le média que Prises
  montre (région rouge qui respire + glyphe de sa source au début : micro, caméra, clavier) ; un second toucher la désarme ;
  désarmer la dernière remet Enr. au repos. *Origine* R-351 (« A+B, un seul geste »).
- **REC-83** · P0 · W — Une piste audio, une vidéo et une MIDI armées → une seule Lecture lance les trois prises
  ensemble, trois blocs qui grandissent, trois clips à l'arrêt ; Lecture ou Enr. les arrête toutes. *Origine* R-351.
- **REC-84** · P1 · W — Enr. armé dans un média, toucher l'en-tête d'une piste d'un autre type (ex. MIDI sur une piste
  vidéo) → refusé avec la raison, la piste n'est pas armée. *Origine* R-351.
- **REC-85** · P1 · W — Écran externe : un en-tête touché sur l'écran arme la piste sur l'appareil, la liste armée est
  recopiée des deux côtés. *Origine* R-351 (R-212).
- **REC-86** · P1 · W — Mixage : Enr. arme la tranche choisie, Lecture lance la prise. *Origine* R-351.
- **REC-87** · P0 · W — Timeline, objet visible dans l'aperçu : Enr. › Geste (puis Lecture, avec son décompte) → l'objet
  se déplace au doigt dans l'aperçu, la prise se pose en clip Geste ; relecture → l'objet refait le mouvement, fluide.
  *Origine* R-305.
- **REC-88** · P1 · W — Clip Geste posé, tête de lecture glissée (scrub) ou calée à l'arrêt → l'objet prend la pose de cet
  instant ; pause et arrêt gardent la pose ; en quittant la Timeline l'objet retrouve son état d'origine. *Origine* R-305 (25 nov.).
- **REC-89** · P1 · W — Un geste enregistré en vue Naturelle est posé en clip Geste et rejoué dans la Timeline.
  *Origine* R-305.
- **REC-90** · P2 · W — L'outil Geste montre son glyphe (point rouge au centre, flèche qui monte), le point reste rouge
  quel que soit le thème. *Origine* R-305.

## H. Enr. dans les Cellules et la vue Scène

- **REC-91** · P0 · W — Cellules, rien ne joue : Enr. arme sa case (plus de prise immédiate) ; Enr. armé, toucher une
  case vide l'arme ou la désarme ; la Scène lancée (ou une Suite, ou Lecture) enregistre toutes ses cases armées ensemble.
  Enr. au repos : un toucher sur une case vide enregistre tout de suite, comme avant. *Origine* R-351 (question 3 validée).
- **REC-92** · P0 · W — Cellules, Édition éteinte : appui long sur une case vide → les plaques Prise audio, Prise vidéo,
  Prise MIDI montent dans les cases au-dessus ; rien n'enregistre pendant l'appui ; relâcher sur Prise audio → décompte
  puis prise, clip audio posé (départ quantifié, longueur de la Scène). *Sonde* `tests/probes/music/cells_record_ui.probe.mjs`. *Origine* R-276.
- **REC-93** · P1 · W — Cellules : appui long sur la zone vide (Édition allumée ou non) → les plaques restent au lâcher
  hors plaque, un toucher sur Prise audio → une nouvelle Scène qui enregistre. *Sonde* `tests/probes/music/cells_record_ui.probe.mjs`. *Origine* R-276.
- **REC-94** · P1 · W — Cellules : une case choisie, Enr. → la prise va dans cette case ; une piste choisie → une case
  sur cette piste ; rien de choisi → une nouvelle case dans la Scène choisie. *Origine* R-271.
- **REC-95** · P1 · W — Cellules : Enr. armé, puis des cases choisies, puis Lecture → ce sont les cases choisies qui
  enregistrent (une case pleine est vidée et remplacée par la prise ; Annuler la rend). *Origine* R-362.
- **REC-96** · P1 · W — Cellules ou vue Scène, Édition éteinte : double toucher sur le fond → une case choisie, armée,
  prête à enregistrer au dernier type ; double toucher sur cette case vide → le rail ne montre que les types (Prise audio,
  vidéo, MIDI, Geste), le sien allumé ; un choix l'arme dans ce type et en fait le type d'Enr. *Origine* R-362.
- **REC-97** · P0 · W — Vue Scène, aucune piste ni case choisie : Enr. → une case est créée et enregistrée, sur la
  dernière piste choisie si elle est libre dans cette Scène, sinon la première piste libre ; **jamais de piste créée
  d'office** (sauf projet sans aucune piste) ; toutes prises → refus. *Origine* R-362.
- **REC-98** · P1 · W — Vue Scène, Édition allumée, une case choisie : « Piste » (premier du rail) liste les pistes puis
  « Nv. piste » ; un choix déplace la case (même vide et armée) sur cette piste. *Origine* R-362.
- **REC-99** · P1 · W — Une Scène neuve créée pour une prise commence après le contenu déjà posé : sa case naît vide et
  enregistre (jamais pleine et jouant à la place). *Origine* R-351 (défaut réparé, `newSceneCommand`).

## À compléter

- ~~Calibration d'entrée par bouclage (aucune sonde).~~ Faux le 2026-11-25 : la calibration est automatique avant la première prise, Calibrer manuel dans Réglages › Avancé (REC-77, REC-78).

*Relevé du 2026-11-25 (demandes du 17 au 25 nov.), non codé ou partiel :*

- R-351 — Mixage : seule la tranche choisie s'arme ; armer d'autres tranches (même état que l'en-tête Timeline/Cellules
  et le REC de la tranche) n'est pas codé (hors maquettes validées).
- R-351 — iPad : une seule caméra filme à la fois (refus nommé) ; essai sur appareil et deux micros réels non faits.
  Plusieurs prises audio simultanées passent chacune par le point REC de sa tranche ; l'ancien enregistreur brut
  (`audio_core_record.js`, `__recording`) reste à une prise à la fois.
- R-351 — `molecule/recording/index.js#resolveArmedTrack` garde « exactly one armed track » quand aucune piste n'est
  nommée (le chemin des vues nomme toujours la piste).
- R-362 — BLOQUÉ (règle 16) : vue Scène, Édition allumée, le rail a 14 cases ; sur un écran de 820 px de haut, « Piste »
  et « Disposer » sortent par le haut. Regroupement à maquetter et valider.
- R-286 — Essai iPad BLOQUÉ (builds 10–12 : Dashboard vide, `auth_session_required`) ; débranchement / rebranchement de
  la carte pendant l'essai non vérifié ; les 32 canaux de la Digiface lus en direct non vus. Limite iPadOS : une seule
  entrée routée, les autres cartes listées repliées et non lues.
- R-305 — Fluidité ≥ 60 images/s non prouvée dans le navigateur de sonde (49–52 images/s sous charge) ; persistance du
  clip Geste sur Tauri/iOS attend un serveur et des builds reconstruits ; « objets fixes visibles dans tout le projet »
  (USR-01 de R-295) non codé ici.
- R-256 / R-254 / R-247 — essais sur iPhone / AUv3 à faire par l'utilisateur sur une nouvelle build (R-247 validé
  sur l'iPhone, AUv3 non essayé à part).
- R-271 — pas de capture Playwright du décompte (sondes Node et WASM seulement).
- Calibrer automatique — preuve seulement structurelle (`temp/probe_calibrer_level_meter.mjs`) ; aucune sonde ne mesure
  la calibration automatique sur un vrai bouclage.
