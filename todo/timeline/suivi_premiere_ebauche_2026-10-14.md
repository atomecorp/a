# Timeline — suivi de la première ébauche (14 oct. 2026)

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
