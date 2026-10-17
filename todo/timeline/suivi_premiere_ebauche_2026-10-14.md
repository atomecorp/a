# Timeline — suivi de la première ébauche (14 oct. 2026)

> 2026-10-16 documentary reconciliation: the initial 14 October “Reste à faire” section is historical. Its Cells/Scenes, basic comping/punch, native fades, loop and shared iOS engine creation items are superseded by the dated 15 October continuation below and current owners; do not reopen them as development tasks. Keep the later concrete remainder and platform acceptance evidence. The single active scope is ATM-2010 in `todo/execution_order.md`.

Référence : `timeline_cellules_cahier_des_charges_v1.6.md` et les deux maquettes validées.

## Livré

- **Timeline du projet**
  - Le projet est la Molécule racine : plus de « Aucune Molécule ».
  - La timeline est amorcée depuis la Liste si elle n'existe pas.
- **Vue Timeline en arbre BevyUI**
  - En-têtes colorés, qui s'ouvrent en nom + M + S.
  - Clips pleine hauteur, régions Record, détail du média sélectionné.
  - Ruler à deux niveaux : bande Scènes réservée et vide, mesures, ruban vert de boucle.
  - Traits de lignes du prompteur et points d'automation.
- **Gestes**
  - Déplacer un clip, y compris vers une autre piste.
  - Rogner sans détruire, prolonger en boucle.
  - Déplacer et étirer une zone.
  - Ruler : chercher, dessiner la boucle, faire défiler.
  - Zoom à la molette et au pincement.
- **Outils du rail** : Quantize, Zoom, Métronome, Input, Volume et Supprimer de piste (en batch).
- **Enregistrement**
  - rec. audio ou vidéo glissé hors du ruban : zone de 4 mesures, étirable et déplaçable.
  - À la volée, depuis la tête de lecture, avec pré-roll. Stop termine la prise.
  - La prise va sur la piste sélectionnée, sinon sur une nouvelle piste.
- **Solo effectif. Métronome audible**, aussi pendant le décompte.
- **Calage à l'échantillon près**
  - Toutes les voix d'une lecture démarrent sur leur trame exacte.
  - Une prise est placée sur la trame réellement entendue, puis corrigée de la calibration de l'entrée.
  - **Web : prouvé.** Erreur de 0 échantillon sur les prises et sur leur relecture, 3 passes sur 3, y compris quand le thread principal cale.
  - **Tauri : moteur prouvé sur le vrai CoreAudio** (voix pile sur leurs trames, horloge de capture). Le scénario complet dans l'application reste à vérifier.
- **Outils audio sur les blocs** : ils agissent sur le bloc sélectionné dans la Timeline.
- **Ancienne scène `mol:*` retirée.**

## À vérifier par l'utilisateur

- La latence matérielle réelle (vrai micro, vrais haut-parleurs). Elle se corrige par une calibration de l'entrée (registre `av.latency`, portée `calibration`) ; il n'existe pas encore d'outil de calibration.
- Le scénario multipiste dans l'application Tauri.

## Reste à faire

- **Prochain lot** : Cellules (vue Matrice, colonnes par région, cellules carrées), Scènes, Follow Actions assignables à toute cellule, comping, punch in/out.
- **Fondus et automation de gain à l'échantillon près, en natif.** Aujourd'hui, ils sont appliqués depuis la boucle d'animation JS.
- **Plugins (prévu, non réalisé)** : insertion par piste dans la chaîne Kira, latence déclarée compensée, réglages dans le modèle de la piste (§11.13).
- **iOS** : pas encore de calage à l'échantillon près.
- **Lecture en boucle du ruban** dans le moteur.

## Suite du 15 oct. 2026 (todo/audio_to_finalize.md)

- **Livré** : Scènes (bande de la règle), Cellules (vue seule ou côte à côte, Édition/Jeu, lasso, réglages en lot, MIDI, projection Scènes), transport des cellules à la trame (quantisation, passes, Follow Actions, arrêt exact, attaque/relâchement), enregistrement dans une cellule vide, comping (prises en boucle, choix de prise), punch in/out, outils de blocs (joindre, couper, rogner, boucle, étirer, fondus), fondus et enveloppes natives à l'échantillon, lecture en boucle du ruban, métronome natif, calibration de l'entrée, iOS sur le moteur natif partagé.
- **Preuves** : sonde de synchro 13/13 (±1 échantillon, punch, prises en boucle, prise de cellule), Cellules 22/22, Scènes 14/14, outils de blocs 11/11 ; Node : cellules, prises, jonction, enregistrement de cellule.
- **Reste** : gestes tactiles et latence sur appareils réels, Échantillons (reportés), interface de comping au-delà de « couper + choisir », règle d'ordre de la Liste (à valider), enregistrement MIDI sur bloc, plugins.

## Recette « comme un utilisateur » (15 oct. 2026, soir)

Souris et tactile réels, Playwright fenêtré, `PROBE_ISOLATED=1` : `temp/timeline/ux/timeline_user_acceptance.probe.mjs` **32/32**, synchro `timeline_sync_real_app.probe.mjs` **13/13** (seule).

- **Corrigé** : un clip ne bougeait qu'après un rognage (clips bout à bout refusés en silence par le noyau) → il se pose sur la place libre dans le sens du geste ; les bords s'arrêtent aux voisins ; le début d'un clip bouclé ne l'écrase plus.
- **Corrigé** : la lecture s'arrêtait au dernier clip (tête bloquée au-delà) → lecture ouverte sauf boucle ; Stop garde la position.
- **Corrigé** : le défilement du bas (ligne du projet) pilotait la Liste → il pilote et montre la Timeline.
- **Corrigé** : prise à la volée + région armée de même source → plus d'erreur « source occupée » ; saisie du nombre de prises (unité « × »).
- **Design** : fond sombre de la vue (`timeline.surfaceFill`), Scènes vertes comme les maquettes.
- **Non testé** : Tauri lancé, iOS/AUv3, vrai micro/interface (latence matérielle).
