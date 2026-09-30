# Visio improvisée, invitation au calendrier, « Ne pas déranger » — cahier des charges (30 sept. 2026)

Suite de `done/communication_news_broadcast_2026-09-30.md` (serveur visio sécurisé en L9).
Règle de complétion inchangée : une case n'est cochée qu'avec une preuve d'exécution multi-comptes
réels consignée au Journal (rouge d'abord). Tauri / iOS « non vérifiés » tant que non exécutés.

## Décisions (utilisateur, 30 sept. 2026)

- **V1** — Le rail « Visio » de l'outil Com lance l'appel caméra + micro avec le ou les contacts
  choisis (sinon le choix de contacts s'ouvre d'abord). « Audio » / « Vidéo » restent des notes.
- **V2** — Appel improvisé multi-personnes. Chez l'appelé, **aucune notification hors de l'outil
  Com** : sonnerie, l'outil sort comme à un message, **clignote en rouge**, sa zone de saisie
  affiche « Demande de visio de X » ; Accepter / Refuser depuis l'outil (texte touché ou rail).
  Sans réponse 30 s : appel manqué dans la réception du panneau Communication.
- **V3** — Panneau Atome standard ; une tuile par participant (2×2 unités = 4× un outil) ; la tuile
  touchée ou celle du locuteur actif s'agrandit (4×4) et repousse les autres ; sa propre tuile est
  fixe en bas, agrandissable pareil ; en bas : micro, caméra, ajouter (+), raccrocher.
- **V4** — Invitation planifiée (seconde étape) : accepter crée l'événement dans le calendrier de
  chacun, avec « Rejoindre ».
- **NPD** — Bouton « Ne pas déranger » dans le panneau Communication, **avant** Visio : outil Com
  grisé (icône + texte), plus de défilement / d'agrandissement / de sonnerie ; messages et appels
  arrivent quand même (appel manqué) ; réglage suivi sur tous les appareils (profil).

## Limites de la phase de test
6 participants max, vidéo 640×360, pas d'enregistrement, pas de partage d'écran, pas de choix de
périphérique. atome.one : `MEDIASOUP_ANNOUNCED_IP` + ports RTC (40000–49999 UDP/TCP) ouverts.

## Cases

### A — Client d'appel
- [x] mediasoup-client livré en ESM navigateur (`atome/src/assets/vendor/mediasoup-client/`).
- [x] Démarrer un appel : salle, invitation des contacts, transports, caméra + micro publiés.
- [x] Consommer les flux existants et nouveaux ; départ d'un participant pris en compte.
- [x] Couper micro / caméra : l'autre le voit (producteur en pause).
- [x] Un non-invité ou un bloqueur ne peut pas entrer ; un bloqué n'est pas sonné.
- [x] Appel entrant : sonnerie + outil Com qui sort, clignote rouge, « Demande de visio de X ».
- [x] Accepter depuis l'outil rejoint ; Refuser prévient l'appelant.
- [x] 30 s sans réponse : appel manqué dans la réception ; déjà en appel : « occupé ».
- [x] Ajouter un participant en cours d'appel (+).

### B — Panneau de visio
- [x] Tuiles 2×2 par participant, nom, indicateur micro coupé ; sa propre tuile fixe en bas.
- [x] Flux distant affiché dans la tuile (source vidéo enregistrée pour le nœud).
- [x] Toucher une tuile l'agrandit ; le locuteur actif s'agrandit (maintien 1,5 s).
- [x] Barre : micro, caméra, +, raccrocher ; raccrocher fait sortir. (« Le dernier ferme la salle » : le routeur
  mediasoup est fermé par le code serveur existant quand la salle se vide — **non sondé**.)

### C — Invitation au calendrier
- [x] Inviter pour plus tard (date, heure, participants) ; salle planifiée persistante.
- [x] Accepter crée l'événement (avec `visio_room_id`) chez l'invité ; l'organisateur l'a aussi.
- [x] « Rejoindre » depuis l'événement, y compris après redémarrage du serveur.

### D — Ne pas déranger
- [x] Bouton avant Visio dans le panneau ; préférence persistée dans le profil.
- [x] Outil Com grisé ; aucun défilement ni agrandissement.
- [x] Appel entrant en NPD : pas de sonnerie, directement « appel manqué ».
- [x] Désactivation : tout revient.

## Journal

Tout est vérifié dans le harnais `temp/comm/`, avec une instance Fastify isolée, de vrais comptes (lien SMS simulé) et Chromium avec caméra et micro simulés.

- **Signalisation** — `l12_visio_signaling.probe.mjs`, **13/13**.
  - Créer une salle, inviter, `call-invitation` avec `room_id`.
  - Refus, occupé et manqué remontent à l'appelant (`call-declined` avec la raison).
  - Un non-contact est refusé avec 403. Un bloqueur n'est pas sonné (succès silencieux) et n'est pas admis.
  - 6 participants au maximum (409 `room_full`).
- **Moteur** — `l12_engine_browser.probe.mjs`, **10/10**.
  - Images réelles 640×360 et audio `live` dans les deux sens.
  - Micro coupé et caméra coupée vus par l'autre.
  - Raccrocher retire le participant chez l'autre.
- **Outil Com, panneau, NPD** — `l12_visio_browser.probe.mjs`, **40/40**.
  - Le rail Visio lance l'appel.
  - Chez l'appelé, sans aucun panneau ni fenêtre ailleurs :
    - sonnerie ;
    - l'outil sort ;
    - clignotement (alternance alerte on/off) ;
    - texte « Demande de visio de X » ;
    - Accepter depuis le rail rejoint l'appel, la sonnerie s'arrête et l'outil se rétablit.
  - Tuiles : une par participant, plus la sienne à part en bas.
    - Les flux sont enregistrés sous l'id de record du nœud de tuile, et la source distante est `presentable` pour Bevy.
    - Toucher une tuile la double, un second toucher la rétablit. Sa propre tuile s'agrandit aussi.
  - Barre : micro, caméra, ajouter, raccrocher. Micro et caméra coupés sont vus par l'autre.
  - **Son distant joué** par un élément `<audio>` actif. **Bug trouvé** : la vidéo cachée lue par Bevy est muette, donc sans cet élément personne ne s'entendait.
  - **Locuteur actif détecté** sur l'audio réel, sans toucher, et sa tuile s'agrandit.
  - « + » ajoute un troisième compte : il est sonné pour la même salle, et l'appelant voit trois tuiles.
  - Refuser depuis le rail : l'appelant reçoit `declined`, la réception affiche « Demande de visio · Refusé ».
  - Occupé : l'appelant reçoit `busy`, rien ne sonne.
  - NPD :
    - le bouton est placé avant Visio ;
    - le réglage est enregistré dans le profil et relu par une page neuve ;
    - l'outil est grisé (`setToolMuted`) ;
    - un message et un appel pendant NPD arrivent dans la réception (appel manqué), sans sonnerie, défilement ni agrandissement ;
    - l'appelant reçoit « sans réponse » ;
    - la désactivation dégrise l'outil et reprojette les non-lus.
  - Sans réponse pendant 30 s (mesuré : 30,1 s) : appel manqué, l'outil se replie sur « Appel manqué · X ».
  - Au rechargement, les invitations gardent leur salle, mais une invitation de plus de 30 s ne sonne pas.
- **Calendrier** — `l12_visio_calendar.probe.mjs`, **15/15**.
  - « Inviter en visio » dans l'éditeur crée une salle planifiée (table `visio_rooms`) et invite 2 contacts.
  - L'événement de l'organisateur porte `visio_room_id`, et le rouvrir affiche « Rejoindre ».
  - L'invité reçoit `call-scheduled` (salle et début), affiché « Invitation visio · date ». Cela ne sonne pas.
  - Accepter crée l'événement dans **son** calendrier, avec la même salle, et marque l'invitation acceptée.
  - Le refus d'un autre invité remonte à l'organisateur.
  - **Après redémarrage du serveur** (même base), « Rejoindre » fait entrer l'organisateur puis l'invité dans la même salle, et chacun voit l'autre. Un compte non invité reçoit « Access denied ».
  - Rouge d'abord : sans relecture de la table, les 3 contrôles après redémarrage échouent (12/15).
- **Régression complète** (tout vert) :

  | Probe | Résultat |
  |---|---|
  | L0 | 2/2 |
  | L1 | 16/16 |
  | L2/L3 | 28/28 |
  | L4/L5 | 16/16 |
  | L6 | 11/11 |
  | Pile | 1/1 |
  | L9 notes | 10/10 |
  | L9 visio | 13/13 * |
  | L10 | 28/28 |
  | L11 | 11/11 |
  | L12 signalisation | 13/13 |
  | Identité média | 32/32 |
  | Navigateur L7/L8 | 15/15 |
  | Réception L8 | 15/15 |
  | L10 navigateur | 9/9 |
  | L11 navigateur | 9/9 |
  | Moteur L12 | 10/10 |
  | Identité média navigateur | 11/11 |

  \* La case L9 « invitation d'un bloqueur refusée (403) » est alignée sur la décision L12 : succès silencieux, bloqueur ni sonné ni admis. Cette nouvelle version est vérifiée.
- **Non vérifié** :
  - Tauri et iOS (autorisations caméra WKWebView) ;
  - rendu visuel : SwiftShader ne compose pas le canvas, donc les preuves portent sur l'état, les pistes et les nœuds ;
  - vrai réseau NAT et TURN.
- **À faire côté atome.one** : redéployer avec `MEDIASOUP_ANNOUNCED_IP` égal à l'IP publique, et ouvrir les ports RTC 40000–49999 en UDP et TCP. `package-lock.json` n'est pas mis à jour (`npm install` non lancé) ; le bundle navigateur est déjà livré dans `atome/src/assets/vendor/`.
