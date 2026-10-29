# Séances en cours : verrouillage, arrière-plan, arrêt — par plateforme (O16, 28 oct. 2026)

Ce que fait réellement une séance (Sport, Bien-être, Sommeil) quand l'écran se verrouille, quand l'app passe en
arrière-plan, et quand elle s'arrête. Décrit d'après le code, chaque fois avec ce qui est vérifié et ce qui ne l'est pas.

## Ce qui est commun à toutes les plateformes

- **L'horloge ne vit pas dans la page.** Une étape compte à partir des horodatages enregistrés par le serveur
  (`clock.elapsed_s` + `clock.since`, `dashboard_training_session.js#elapsedSeconds`). Une page gelée puis réveillée
  retrouve donc le bon temps : rien n'est perdu, rien n'est compté deux fois.
- **Fermer la carte ne termine pas la séance.** Une séance en cours ou en pause continue ; la tuile « en cours » de
  l'accueil la liste et la rouvre (`activity_ongoing.js`, `dashboard_ongoing_entry.js`). Seuls Arrêter et la fin de la
  dernière étape la terminent.
- **L'écran reste allumé pendant la séance.** La séance demande `navigator.wakeLock` (`screen`) au départ ; le navigateur
  le rend quand la page est cachée, et la séance le redemande à son retour (`visibilitychange`). S'il n'existe pas,
  l'erreur `training_wake_lock_unavailable` est signalée et la séance continue sans lui.
- **Pendant que la page est gelée**, ces trois choses ne se font pas :
  - les bips ;
  - le passage automatique à l'étape suivante ;
  - la trace GPS de la séance (`training_gps_track.js` ne compte que les positions reçues).

  Au retour, le minuteur rattrape l'étape échue au premier tick. Les bips manqués ne sont pas rejoués.
- **Après un arrêt de l'app** (fermée, tuée ou plantée), la séance reprend à la prochaine ouverture de l'accueil, par
  `resumeOngoingActivities` (Q7) :
  - quelle séance : la plus récente de chaque famille, si elle date de moins de 24 h et qu'elle était en cours ou en
    pause (`training.open_sessions`, `brick_session.open_sessions`) ;
  - dans quel état : une séance retrouvée en cours est mise en pause à la reprise. Le temps d'arrêt compte dans son
    étape, si bien qu'une étape chronométrée peut déjà être finie ;
  - la trace GPS d'avant l'arrêt est perdue, car seule la distance est enregistrée, jamais les positions.

## Par plateforme

| | Web (navigateur) | iOS / iPadOS (WebView + serveur Swift) | Tauri macOS | Android (Tauri) |
| --- | --- | --- | --- | --- |
| **Écran gardé allumé** | Wake Lock de la page. Vérifié au Web (Chromium). | Wake Lock de la WebView. Aucun `isIdleTimerDisabled` natif. **Non vérifié sur l'iPad.** | Wake Lock de la WebView. Sur Mac, la veille de l'écran suit le réglage système. | Wake Lock de la WebView. Aucun `FLAG_KEEP_SCREEN_ON`. **Non vérifié.** |
| **Écran verrouillé ou app en arrière-plan** | Onglet caché : les minuteurs ralentissent ou gèlent ; plus de bips ni de trace. | WebView suspendue : plus de bips ni de passage d'étape. La musique continue si elle joue (mode `audio`). | La fenêtre cachée continue, minuteurs ralentis. Les bips continuent, ou non, selon macOS. | WebView suspendue : plus de bips ni de passage d'étape. |
| **GPS d'une séance cardio** | `watchPosition`, au premier plan seulement. | Le natif `locate` est interrogé toutes les 2 s depuis le JS. Il s'arrête avec la WebView : `allowsBackgroundLocationUpdates` n'est activé que pour le guidage de trajet, pas pour la séance. | Hôte natif `gps_native.rs`, interrogé depuis le JS. | `watchPosition` de la WebView, au premier plan seulement. |
| **App arrêtée** | Reprise à la prochaine ouverture (Q7). | Reprise à la prochaine ouverture (Q7). Données dans le SQLite local, hors ligne compris. | Reprise à la prochaine ouverture (Q7). Données dans le SQLite d'Axum. | Reprise à la prochaine ouverture (Q7). |

## Écarts honnêtes (non faits, à décider)

1. **Course dehors, écran verrouillé, sur iOS :**
   - la distance s'arrête de compter ;
   - pour qu'elle continue, il faudrait que la séance tienne le GPS natif comme le guidage le fait
     (`allowsBackgroundLocationUpdates`), et que le natif accumule les positions hors de la WebView ;
   - c'est une capacité native à ajouter dans `AtomeGPSHost.m`, puis à lire au retour : ce n'est pas codé.
2. **Bips écran verrouillé :**
   - aujourd'hui, ils ne sonnent que si la page vit ;
   - pour les garantir sur iOS, il faudrait programmer les sons à l'avance côté natif, ou passer par des notifications
     locales ;
   - ce n'est pas codé.
3. **Wake Lock sur iOS et Android :** à vérifier sur l'appareil (iPad « Jeezs's Tab ») ; c'est un test utilisateur.
4. **Autres tâches en cours que le Sport et les briques :**
   - aucune n'est inscrite dans `activity_ongoing.js` pour l'instant ;
   - les candidats sont le guidage GPS, l'enregistrement d'écran, le minuteur de cuisine et la lecture d'un livre audio ;
   - chacune devra s'y inscrire avec son entrée `{ key, glyph, name, active, line, clock, foot, open }`.
