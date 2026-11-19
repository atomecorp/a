# 02 — Scénarios complets : fonctionnalités, gestes, visuel, performance et sécurité

> 56 parcours par famille de commandes, 10 parcours MCP transversaux, 17 parcours par groupe de gestes, 30 combinaisons réelles, 20 campagnes de sécurité.

## Lecture et mode opératoire

- Un **scénario** décrit un résultat réel (reportage, texte calculable, musique, santé, objectifs), pas une succession artificielle de boutons.
- **À la suite de chaque scénario**, la rubrique « Comment l’utiliser » explique l’entrée, les manipulations et le contexte. L’IA de test doit approfondir les gestes de chaque commande listée et garder une preuve de l’affichage.
- Chaque identifiant `C` du catalogue doit être exercé dans son scénario de famille ou, si l’accès/les droits manquent, classé `BLOCKED` ou `N/A` justifié. Aucune action n’est prétendue exécutée ici.
- Les `U` sont des gestes d’interface : un appel MCP seul ne remplace pas la manipulation visuelle, et la reconnaissance vocale réellement entendue n’est pas un simple appel RPC.
- Les `F` réconcilient le premier inventaire : toute variante mentionnée, y compris les sous-verbes, doit avoir un résultat séparé dans le compte rendu.
- Une commande non exposée graphiquement n’appelle pas l’invention d’un bouton : documenter sa source et tester sa commande par le canal autorisé. Un outil qui **devrait** être disponible sur une plateforme mais ne l’est pas devient un écart de parité.

## Cibles de test et saisies

| Plateforme | Geste graphique | Voix eVe | MCP direct | Statut |
| --- | --- | --- | --- | --- |
| Web (navigateurs supportés) | souris/clavier ; tactile si écran tactile | test complet réel si appareil audio | oui | obligatoire |
| Tauri macOS | souris/trackpad/clavier | test réel si microphone | oui | obligatoire |
| Tauri Windows | souris/trackpad/clavier ; tactile si disponible | test réel si microphone | oui | obligatoire |
| iOS (iPhone + iPad) | toucher ; souris/clavier externe si présents | test réel | oui sous autorisation | obligatoire |
| Android | toucher ; souris/clavier si présents | test réel | oui sous autorisation | obligatoire |
| FreeBSD | UI si client disponible ; sinon serveur et MCP | selon capacités de l’hôte | si disponible | option, obligatoire dès disponibilité |

**Tester chaque plateforme réellement accessible et chaque mode réellement applicable.** On ne déclare jamais PASS pour une machine non ouverte, un micro non utilisé ou un processus non observé.

## Critères systématiques sur chaque étape

1. **Fonction :** l’outil canonique réalise l’action attendue, avec les bonnes données, sans doublon, annulation et reprise possibles quand prévues.
2. **Affichage :** toutes les commandes, options, libellés, états, textes et valeurs demeurent lisibles, accessibles, non coupés, non cachés par la main, le clavier, la bande ou les panneaux. Respecter strictement la charte graphique propre à atome/eVe, les tailles de grille et les proportions.
3. **Fluidité :** gestes, défilements, inertie, animations et changements de page fluides ; mesurer la latence, FPS, mémoire, CPU et consommation si pertinent, sans seuil inventé.
4. **Continuité :** sauvegarder, fermer/réouvrir, annuler/rétablir, hors ligne/reconnexion si applicable, et comparer l’état sur deux dispositifs.
5. **Parité :** répéter en souris/clavier, tactile et voix/MCP autorisés ; comparer résultat, droits et feedback. Toute limitation spécifique à l’OS doit être décrite sans faux PASS.
6. **Sécurité :** jamais d’exposition de fichiers, comptes, patients, secrets, géolocalisation, microphones ou permissions hors du périmètre de test.
7. **Preuve :** garder captures d’écran/vidéo, logs expurgés et mesures réelles par couple action × plateforme × canal.

---

## I. Scénarios fonctionnels exhaustifs par famille

### S001 — Journal télévisé dans un projet

**Contexte :** Préparer un projet vidéo fictif avec un objet TV.

**Parcours utilisateur :**

1. Ouvrir TV, rechercher une chaîne autorisée, lire maintenant et après, afficher le programme, passer en plein écran, revenir et fermer.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Préparer un projet vidéo fictif avec un objet TV. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Ouvrir TV, rechercher une chaîne autorisée, lire maintenant et après, afficher le programme, passer en plein écran, revenir et fermer. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Le projet contient un lecteur TV ; une chaîne inconnue ne démarre rien, le changement d'écran ne masque pas les contrôles. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 10**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/tv/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0001` **`tv.list_channels`** — Lister channels. Relever entrée, résultat, affichage et état après retour.
- `C0002` **`tv.find_channel`** — find channel. Relever entrée, résultat, affichage et état après retour.
- `C0003` **`tv.open_channel`** — Ouvrir channel. Relever entrée, résultat, affichage et état après retour.
- `C0004` **`tv.close`** — Fermer. Relever entrée, résultat, affichage et état après retour.
- `C0005` **`tv.set_fullscreen`** — Définir fullscreen. Relever entrée, résultat, affichage et état après retour.
- `C0006` **`tv.get_state`** — Consulter l’état. Relever entrée, résultat, affichage et état après retour.
- `C0007` **`tv.now`** — now. Relever entrée, résultat, affichage et état après retour.
- `C0008` **`tv.next`** — next. Relever entrée, résultat, affichage et état après retour.
- `C0009` **`tv.get_epg`** — Consulter epg. Relever entrée, résultat, affichage et état après retour.
- `C0010` **`tv.search_program`** — Rechercher program. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Le projet contient un lecteur TV ; une chaîne inconnue ne démarre rien, le changement d'écran ne masque pas les contrôles.

---

### S002 — Monter un reportage avec références vidéo

**Contexte :** Projet reportage avec lien vidéo public.

**Parcours utilisateur :**

1. Chercher une vidéo, l'ouvrir dans un atome vidéo, vérifier les commandes plein écran, revenir puis fermer.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Projet reportage avec lien vidéo public. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Chercher une vidéo, l'ouvrir dans un atome vidéo, vérifier les commandes plein écran, revenir puis fermer. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** La vidéo apparaît dans l'objet du projet ; l'ouverture n'introduit pas de page parasite. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 4**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/youtube/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0011` **`youtube.search`** — Rechercher. Relever entrée, résultat, affichage et état après retour.
- `C0012` **`youtube.play`** — Lire. Relever entrée, résultat, affichage et état après retour.
- `C0013` **`youtube.close`** — Fermer. Relever entrée, résultat, affichage et état après retour.
- `C0014` **`youtube.set_fullscreen`** — Définir fullscreen. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** La vidéo apparaît dans l'objet du projet ; l'ouverture n'introduit pas de page parasite.

---

### S003 — Consulter une vidéo indépendante

**Contexte :** URL PeerTube publique de test.

**Parcours utilisateur :**

1. Chercher un contenu, choisir une adresse précise, lire, agrandir et fermer.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** URL PeerTube publique de test. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Chercher un contenu, choisir une adresse précise, lire, agrandir et fermer. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Lecture dans l'atome PeerTube et remise à l'état initial. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 4**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/peertube/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0015` **`peertube.search`** — Rechercher. Relever entrée, résultat, affichage et état après retour.
- `C0016` **`peertube.play`** — Lire. Relever entrée, résultat, affichage et état après retour.
- `C0017` **`peertube.close`** — Fermer. Relever entrée, résultat, affichage et état après retour.
- `C0018` **`peertube.set_fullscreen`** — Définir fullscreen. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Lecture dans l'atome PeerTube et remise à l'état initial.

---

### S004 — Préparer une publication multiréseaux

**Contexte :** Comptes de démonstration ou test isolé, aucune publication publique réelle.

**Parcours utilisateur :**

1. Afficher comptes, préparer un post, consulter la prévisualisation, demander confirmation, publier en bac à sable, vérifier état, annuler.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Comptes de démonstration ou test isolé, aucune publication publique réelle. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Afficher comptes, préparer un post, consulter la prévisualisation, demander confirmation, publier en bac à sable, vérifier état, annuler. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Aucune publication réelle sans accord, texte et média conservés avec destinations. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 7**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/social/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0019` **`social.accounts`** — accounts. Relever entrée, résultat, affichage et état après retour.
- `C0020` **`social.connect`** — Connecter. Relever entrée, résultat, affichage et état après retour.
- `C0021` **`social.disconnect`** — Déconnecter. Relever entrée, résultat, affichage et état après retour.
- `C0022` **`social.prepare`** — Préparer. Relever entrée, résultat, affichage et état après retour.
- `C0023` **`social.publish`** — Publier. Relever entrée, résultat, affichage et état après retour.
- `C0024` **`social.status`** — status. Relever entrée, résultat, affichage et état après retour.
- `C0025` **`social.cancel`** — Annuler. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Aucune publication réelle sans accord, texte et média conservés avec destinations.

---

### S005 — Composer une playlist Apple Music

**Contexte :** Connexion autorisée et bibliothèque de test.

**Parcours utilisateur :**

1. Autoriser, rechercher des morceaux, créer une playlist, ajouter des titres, lire, pause, déplacement, aléatoire, favoris, image, suivant, précédent, arrêter.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Connexion autorisée et bibliothèque de test. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Autoriser, rechercher des morceaux, créer une playlist, ajouter des titres, lire, pause, déplacement, aléatoire, favoris, image, suivant, précédent, arrêter. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Le résultat affiché et les titres correspondent aux commandes, pas de double lancement. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 19**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/apple_music/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0026` **`apple_music.favorite_current`** — Ajouter aux favoris current. Relever entrée, résultat, affichage et état après retour.
- `C0027` **`apple_music.get_state`** — Consulter l’état. Relever entrée, résultat, affichage et état après retour.
- `C0028` **`apple_music.authorize`** — authorize. Relever entrée, résultat, affichage et état après retour.
- `C0029` **`apple_music.search`** — Rechercher. Relever entrée, résultat, affichage et état après retour.
- `C0030` **`apple_music.list_playlists`** — Lister playlists. Relever entrée, résultat, affichage et état après retour.
- `C0031` **`apple_music.list_library`** — Lister library. Relever entrée, résultat, affichage et état après retour.
- `C0032` **`apple_music.playlist_tracks`** — playlist tracks. Relever entrée, résultat, affichage et état après retour.
- `C0033` **`apple_music.play`** — Lire. Relever entrée, résultat, affichage et état après retour.
- `C0034` **`apple_music.resume`** — Reprendre. Relever entrée, résultat, affichage et état après retour.
- `C0035` **`apple_music.pause`** — Mettre en pause. Relever entrée, résultat, affichage et état après retour.
- `C0036` **`apple_music.stop`** — Arrêter. Relever entrée, résultat, affichage et état après retour.
- `C0037` **`apple_music.seek`** — seek. Relever entrée, résultat, affichage et état après retour.
- `C0038` **`apple_music.shuffle`** — shuffle. Relever entrée, résultat, affichage et état après retour.
- `C0039` **`apple_music.artwork`** — artwork. Relever entrée, résultat, affichage et état après retour.
- `C0040` **`apple_music.next`** — next. Relever entrée, résultat, affichage et état après retour.
- `C0041` **`apple_music.previous`** — previous. Relever entrée, résultat, affichage et état après retour.
- `C0042` **`apple_music.create_playlist`** — Créer playlist. Relever entrée, résultat, affichage et état après retour.
- `C0043` **`apple_music.add_tracks`** — Ajouter tracks. Relever entrée, résultat, affichage et état après retour.
- `C0044` **`apple_music.operation_status`** — operation status. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Le résultat affiché et les titres correspondent aux commandes, pas de double lancement.

---

### S006 — Lire une bibliothèque musicale connectée

**Contexte :** Compte musical test et appareil disponible.

**Parcours utilisateur :**

1. Connecter, attendre, rechercher, afficher bibliothèque et playlists, créer/ajouter, jouer, pause, rechercher dans piste, aléatoire, périphériques, déconnecter.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Compte musical test et appareil disponible. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Connecter, attendre, rechercher, afficher bibliothèque et playlists, créer/ajouter, jouer, pause, rechercher dans piste, aléatoire, périphériques, déconnecter. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** La piste et le périphérique de sortie suivent exactement la sélection. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 22**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/music/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0045` **`music.get_state`** — Consulter l’état. Relever entrée, résultat, affichage et état après retour.
- `C0046` **`music.connect`** — Connecter. Relever entrée, résultat, affichage et état après retour.
- `C0047` **`music.await_connection`** — await connection. Relever entrée, résultat, affichage et état après retour.
- `C0048` **`music.cancel_connection`** — Annuler connection. Relever entrée, résultat, affichage et état après retour.
- `C0049` **`music.disconnect`** — Déconnecter. Relever entrée, résultat, affichage et état après retour.
- `C0050` **`music.search`** — Rechercher. Relever entrée, résultat, affichage et état après retour.
- `C0051` **`music.open_item`** — Ouvrir un élément. Relever entrée, résultat, affichage et état après retour.
- `C0052` **`music.list_library`** — Lister library. Relever entrée, résultat, affichage et état après retour.
- `C0053` **`music.list_playlists`** — Lister playlists. Relever entrée, résultat, affichage et état après retour.
- `C0054` **`music.playlist_tracks`** — playlist tracks. Relever entrée, résultat, affichage et état après retour.
- `C0055` **`music.devices`** — devices. Relever entrée, résultat, affichage et état après retour.
- `C0056` **`music.play`** — Lire. Relever entrée, résultat, affichage et état après retour.
- `C0057` **`music.resume`** — Reprendre. Relever entrée, résultat, affichage et état après retour.
- `C0058` **`music.pause`** — Mettre en pause. Relever entrée, résultat, affichage et état après retour.
- `C0059` **`music.next`** — next. Relever entrée, résultat, affichage et état après retour.
- `C0060` **`music.previous`** — previous. Relever entrée, résultat, affichage et état après retour.
- `C0061` **`music.seek`** — seek. Relever entrée, résultat, affichage et état après retour.
- `C0062` **`music.shuffle`** — shuffle. Relever entrée, résultat, affichage et état après retour.
- `C0063` **`music.create_playlist`** — Créer playlist. Relever entrée, résultat, affichage et état après retour.
- `C0064` **`music.add_tracks`** — Ajouter tracks. Relever entrée, résultat, affichage et état après retour.
- `C0065` **`music.favorite_current`** — Ajouter aux favoris current. Relever entrée, résultat, affichage et état après retour.
- `C0066` **`music.operation_status`** — operation status. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** La piste et le périphérique de sortie suivent exactement la sélection.

---

### S007 — Créer et suivre un trajet

**Contexte :** Itinéraire fictif entre deux points connus, localisation consentie.

**Parcours utilisateur :**

1. Rechercher un lieu, créer parcours, prévisualiser, favorite, dupliquer, naviguer, partager la position à un compte test, arrêter partage et navigation.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Ouvrir GPS, puis trajets, recherche et navigation.
2. **Préparer :** Itinéraire fictif entre deux points connus, localisation consentie. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Rechercher un lieu, créer parcours, prévisualiser, favorite, dupliquer, naviguer, partager la position à un compte test, arrêter partage et navigation. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Seuls les destinataires autorisés voient la position ; trajet réapparaît au retour. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 18**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/gps/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0067` **`gps.list_trips`** — Lister trips. Relever entrée, résultat, affichage et état après retour.
- `C0068` **`gps.get_trip`** — Consulter trip. Relever entrée, résultat, affichage et état après retour.
- `C0069` **`gps.create_trip`** — Créer un itinéraire. Relever entrée, résultat, affichage et état après retour.
- `C0070` **`gps.search_places`** — Rechercher places. Relever entrée, résultat, affichage et état après retour.
- `C0071` **`gps.locate`** — locate. Relever entrée, résultat, affichage et état après retour.
- `C0072` **`gps.calculate_route`** — calculate route. Relever entrée, résultat, affichage et état après retour.
- `C0073` **`gps.set_favorite`** — Définir comme favori. Relever entrée, résultat, affichage et état après retour.
- `C0074` **`gps.delete_trip`** — Supprimer trip. Relever entrée, résultat, affichage et état après retour.
- `C0075` **`gps.duplicate_trip`** — duplicate trip. Relever entrée, résultat, affichage et état après retour.
- `C0076` **`gps.preview`** — Prévisualiser. Relever entrée, résultat, affichage et état après retour.
- `C0077` **`gps.new_trip`** — Créer trip. Relever entrée, résultat, affichage et état après retour.
- `C0078` **`gps.start_navigation`** — Démarrer navigation. Relever entrée, résultat, affichage et état après retour.
- `C0079` **`gps.stop_navigation`** — Arrêter navigation. Relever entrée, résultat, affichage et état après retour.
- `C0080` **`gps.get_state`** — Consulter l’état. Relever entrée, résultat, affichage et état après retour.
- `C0081` **`gps.share_position`** — Partager position. Relever entrée, résultat, affichage et état après retour.
- `C0082` **`gps.stop_sharing_position`** — Arrêter sharing position. Relever entrée, résultat, affichage et état après retour.
- `C0083` **`gps.list_shared_positions`** — Lister shared positions. Relever entrée, résultat, affichage et état après retour.
- `C0084` **`gps.navigate_to`** — navigate to. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Seuls les destinataires autorisés voient la position ; trajet réapparaît au retour.

---

### S008 — Construire puis effectuer une séance de sport

**Contexte :** Exercices fictifs, charges faibles simulées, matériel fictif.

**Parcours utilisateur :**

1. Lister, choisir, régler charge/séries/temps, créer machine personnelle, enregistrer une discipline, planifier semaine, exécuter/pauser/reprendre, journaliser, filmer en test, lire la progression.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Activité › Sport ; choisir exercice, machine personnelle ou discipline puis sa fiche.
2. **Préparer :** Exercices fictifs, charges faibles simulées, matériel fictif. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Lister, choisir, régler charge/séries/temps, créer machine personnelle, enregistrer une discipline, planifier semaine, exécuter/pauser/reprendre, journaliser, filmer en test, lire la progression. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** États, compteurs et prises dans la bonne séance ; aucune double série ni commande cachée. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 51**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/training/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0085` **`training.list_exercises`** — Lister exercises. Relever entrée, résultat, affichage et état après retour.
- `C0086` **`training.get_exercise`** — Consulter exercise. Relever entrée, résultat, affichage et état après retour.
- `C0087` **`training.open_exercise`** — Ouvrir un exercice. Relever entrée, résultat, affichage et état après retour.
- `C0088` **`training.set_profile`** — Définir profile. Relever entrée, résultat, affichage et état après retour.
- `C0089` **`training.suggest_load`** — suggest load. Relever entrée, résultat, affichage et état après retour.
- `C0090` **`training.plan_week`** — plan week. Relever entrée, résultat, affichage et état après retour.
- `C0091` **`training.schedule_week`** — schedule week. Relever entrée, résultat, affichage et état après retour.
- `C0092` **`training.open_journal`** — Ouvrir journal. Relever entrée, résultat, affichage et état après retour.
- `C0093` **`training.open_week`** — Ouvrir week. Relever entrée, résultat, affichage et état après retour.
- `C0094` **`training.prepare_session`** — Préparer session. Relever entrée, résultat, affichage et état après retour.
- `C0095` **`training.session_transition`** — session transition. Relever entrée, résultat, affichage et état après retour.
- `C0096` **`training.get_session`** — Consulter session. Relever entrée, résultat, affichage et état après retour.
- `C0097` **`training.open_sessions`** — Ouvrir sessions. Relever entrée, résultat, affichage et état après retour.
- `C0098` **`training.keep_series`** — keep series. Relever entrée, résultat, affichage et état après retour.
- `C0099` **`training.open_series`** — Ouvrir series. Relever entrée, résultat, affichage et état après retour.
- `C0100` **`training.remove_series`** — Supprimer une série. Relever entrée, résultat, affichage et état après retour.
- `C0101` **`training.list_favorites`** — Lister favorites. Relever entrée, résultat, affichage et état après retour.
- `C0102` **`training.set_favorite`** — Définir comme favori. Relever entrée, résultat, affichage et état après retour.
- `C0103` **`training.read_points`** — Lire points. Relever entrée, résultat, affichage et état après retour.
- `C0104` **`training.read_program`** — Lire program. Relever entrée, résultat, affichage et état après retour.
- `C0105` **`training.add_to_program`** — Ajouter to program. Relever entrée, résultat, affichage et état après retour.
- `C0106` **`training.set_program`** — Définir program. Relever entrée, résultat, affichage et état après retour.
- `C0107` **`training.open_program`** — Ouvrir program. Relever entrée, résultat, affichage et état après retour.
- `C0108` **`training.list_ready_programs`** — Lister ready programs. Relever entrée, résultat, affichage et état après retour.
- `C0109` **`training.take_ready_program`** — take ready program. Relever entrée, résultat, affichage et état après retour.
- `C0110` **`training.read_log`** — Lire log. Relever entrée, résultat, affichage et état après retour.
- `C0111` **`training.open_media`** — Ouvrir media. Relever entrée, résultat, affichage et état après retour.
- `C0112` **`training.add_media`** — Ajouter media. Relever entrée, résultat, affichage et état après retour.
- `C0113` **`training.remove_media`** — Retirer media. Relever entrée, résultat, affichage et état après retour.
- `C0114` **`training.film`** — film. Relever entrée, résultat, affichage et état après retour.
- `C0115` **`training.card_action`** — card action. Relever entrée, résultat, affichage et état après retour.
- `C0116` **`training.measure_rhythm`** — measure rhythm. Relever entrée, résultat, affichage et état après retour.
- `C0117` **`training.set_music`** — Définir music. Relever entrée, résultat, affichage et état après retour.
- `C0695` **`training.list_machines`** — Lister machines. Relever entrée, résultat, affichage et état après retour.
- `C0696` **`training.get_machine`** — Consulter machine. Relever entrée, résultat, affichage et état après retour.
- `C0697` **`training.save_machine`** — Enregistrer machine. Relever entrée, résultat, affichage et état après retour.
- `C0698` **`training.archive_machine`** — archive machine. Relever entrée, résultat, affichage et état après retour.
- `C0699` **`training.delete_machine`** — Supprimer machine. Relever entrée, résultat, affichage et état après retour.
- `C0700` **`training.open_machine`** — Ouvrir machine. Relever entrée, résultat, affichage et état après retour.
- `C0701` **`training.open_disciplines`** — Ouvrir disciplines. Relever entrée, résultat, affichage et état après retour.
- `C0702` **`training.open_discipline`** — Ouvrir discipline. Relever entrée, résultat, affichage et état après retour.
- `C0703` **`training.open_movements`** — Ouvrir movements. Relever entrée, résultat, affichage et état après retour.
- `C0704` **`training.list_movements`** — Lister movements. Relever entrée, résultat, affichage et état après retour.
- `C0705` **`training.list_disciplines`** — Lister disciplines. Relever entrée, résultat, affichage et état après retour.
- `C0706` **`training.get_discipline`** — Consulter discipline. Relever entrée, résultat, affichage et état après retour.
- `C0707` **`training.save_discipline_choice`** — Enregistrer discipline choice. Relever entrée, résultat, affichage et état après retour.
- `C0708` **`training.save_discipline`** — Enregistrer discipline. Relever entrée, résultat, affichage et état après retour.
- `C0709` **`training.log_activity`** — log activity. Relever entrée, résultat, affichage et état après retour.
- `C0710` **`training.remove_discipline`** — Retirer discipline. Relever entrée, résultat, affichage et état après retour.
- `C0711` **`training.remove_activity`** — Retirer activity. Relever entrée, résultat, affichage et état après retour.
- `C0712` **`training.read_activity_log`** — Lire activity log. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** États, compteurs et prises dans la bonne séance ; aucune double série ni commande cachée.

---

### S009 — Séance de respiration et récupération

**Contexte :** Séance de relaxation de démonstration.

**Parcours utilisateur :**

1. Choisir les briques, régler durée, rythme et son, préparer, démarrer, passer les étapes, interrompre et retrouver la session.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Séance de relaxation de démonstration. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Choisir les briques, régler durée, rythme et son, préparer, démarrer, passer les étapes, interrompre et retrouver la session. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Décompte audible et visuel, arrêts et reprises cohérents. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 11**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/brick_sessions/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0118` **`brick_session.read`** — Lire. Relever entrée, résultat, affichage et état après retour.
- `C0119` **`brick_session.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.
- `C0120` **`brick_session.set_minutes`** — Définir minutes. Relever entrée, résultat, affichage et état après retour.
- `C0121` **`brick_session.set_breath`** — Définir breath. Relever entrée, résultat, affichage et état après retour.
- `C0122` **`brick_session.set_bell`** — Définir bell. Relever entrée, résultat, affichage et état après retour.
- `C0123` **`brick_session.prepare`** — Préparer. Relever entrée, résultat, affichage et état après retour.
- `C0124` **`brick_session.transition`** — transition. Relever entrée, résultat, affichage et état après retour.
- `C0125` **`brick_session.card_action`** — card action. Relever entrée, résultat, affichage et état après retour.
- `C0126` **`brick_session.suggestions`** — suggestions. Relever entrée, résultat, affichage et état après retour.
- `C0127` **`brick_session.get`** — Consulter. Relever entrée, résultat, affichage et état après retour.
- `C0128` **`brick_session.open_sessions`** — Ouvrir sessions. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Décompte audible et visuel, arrêts et reprises cohérents.

---

### S010 — Comparer une photo du visage à une date antérieure

**Contexte :** Deux photos de test consenties dans une même pose.

**Parcours utilisateur :**

1. Choisir zone et angle, prendre photo avec transparence de référence, comparer deux dates, programmer rappel, retirer une photo du suivi.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Activité › Bien-être › Beauté ; sélectionner la zone et la pose puis photographier ou comparer.
2. **Préparer :** Deux photos de test consenties dans une même pose. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Choisir zone et angle, prendre photo avec transparence de référence, comparer deux dates, programmer rappel, retirer une photo du suivi. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Même cadrage comparé, photo retirée demeure dans les médias personnels. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 7**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/beauty/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0129` **`beauty.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.
- `C0130` **`beauty.list_photos`** — Lister les photos. Relever entrée, résultat, affichage et état après retour.
- `C0131` **`beauty.shoot`** — shoot. Relever entrée, résultat, affichage et état après retour.
- `C0132` **`beauty.add_photo`** — Ajouter photo. Relever entrée, résultat, affichage et état après retour.
- `C0133` **`beauty.remove_photo`** — Retirer une photo. Relever entrée, résultat, affichage et état après retour.
- `C0134` **`beauty.read_reminder`** — Lire reminder. Relever entrée, résultat, affichage et état après retour.
- `C0135` **`beauty.set_reminder`** — Définir reminder. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Même cadrage comparé, photo retirée demeure dans les médias personnels.

---

### S011 — Déclarer et retirer une information personnelle

**Contexte :** Profil de santé fictif et consentement explicite.

**Parcours utilisateur :**

1. Déclarer une information, consulter ce qui est autorisé et la retirer.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Profil de santé fictif et consentement explicite. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Déclarer une information, consulter ce qui est autorisé et la retirer. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Aucune écriture ou lecture non autorisée, la révocation est visible. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 2**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/health/declaration_contracts.js); chaque ligne suivante est un cas indépendant :

- `C0136` **`health_declaration.add`** — Ajouter. Relever entrée, résultat, affichage et état après retour.
- `C0137` **`health_declaration.withdraw`** — Retirer. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Aucune écriture ou lecture non autorisée, la révocation est visible.

---

### S012 — Journal quotidien du ressenti

**Contexte :** Ressenti fictif sur une journée d'essai.

**Parcours utilisateur :**

1. Ouvrir la fiche, noter état/ressenti, consulter et effacer une note.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Ressenti fictif sur une journée d'essai. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Ouvrir la fiche, noter état/ressenti, consulter et effacer une note. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** La note est datée, corrigible et privée. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 3**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/health/feeling_contracts.js); chaque ligne suivante est un cas indépendant :

- `C0138` **`health_feeling.set`** — Définir. Relever entrée, résultat, affichage et état après retour.
- `C0139` **`health_feeling.clear`** — clear. Relever entrée, résultat, affichage et état après retour.
- `C0140` **`health_feeling.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** La note est datée, corrigible et privée.

---

### S013 — Définir un profil de santé limité

**Contexte :** Compte test, données fictives.

**Parcours utilisateur :**

1. Déclarer une catégorie, demander la lecture de cette seule catégorie avec motif explicite, refuser puis autoriser.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Compte test, données fictives. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Déclarer une catégorie, demander la lecture de cette seule catégorie avec motif explicite, refuser puis autoriser. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Un refus empêche l'accès ; les catégories non demandées restent invisibles. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 2**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/health/profile_contracts.js); chaque ligne suivante est un cas indépendant :

- `C0141` **`health_profile.read`** — Lire. Relever entrée, résultat, affichage et état après retour.
- `C0142` **`health_profile.declare`** — declare. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Un refus empêche l'accès ; les catégories non demandées restent invisibles.

---

### S014 — Importer puis valider un protocole fictif

**Contexte :** Texte synthétique de protocole, sans conseil médical réel.

**Parcours utilisateur :**

1. Importer texte, vérifier chaque ligne et alertes, corriger statuts, répondre, choisir garder/refuser, enregistrer revue, tester proposition et modèles, activer uniquement après confirmation.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Dans le Carnet de santé, ouvrir Protocoles ; ne pas activer des données réelles pour ce test.
2. **Préparer :** Texte synthétique de protocole, sans conseil médical réel. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Importer texte, vérifier chaque ligne et alertes, corriger statuts, répondre, choisir garder/refuser, enregistrer revue, tester proposition et modèles, activer uniquement après confirmation. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Le texte source reste intact ; aucune prise activée sans validation. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 19**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/health/protocol_contracts.js); chaque ligne suivante est un cas indépendant :

- `C0143` **`health_protocol.import`** — Importer. Relever entrée, résultat, affichage et état après retour.
- `C0144` **`health_protocol.list`** — Lister. Relever entrée, résultat, affichage et état après retour.
- `C0145` **`health_protocol.read`** — Lire. Relever entrée, résultat, affichage et état après retour.
- `C0146` **`health_protocol.correct`** — correct. Relever entrée, résultat, affichage et état après retour.
- `C0147` **`health_protocol.decide`** — Décider. Relever entrée, résultat, affichage et état après retour.
- `C0148` **`health_protocol.professional`** — professional. Relever entrée, résultat, affichage et état après retour.
- `C0149` **`health_protocol.answer`** — answer. Relever entrée, résultat, affichage et état après retour.
- `C0150` **`health_protocol.review`** — review. Relever entrée, résultat, affichage et état après retour.
- `C0151` **`health_protocol.refuse`** — Refuser. Relever entrée, résultat, affichage et état après retour.
- `C0152` **`health_protocol.activate`** — Activer. Relever entrée, résultat, affichage et état après retour.
- `C0153` **`health_protocol.template_create`** — template create. Relever entrée, résultat, affichage et état après retour.
- `C0154` **`health_protocol.template_revise`** — template revise. Relever entrée, résultat, affichage et état après retour.
- `C0155` **`health_protocol.template_list`** — template list. Relever entrée, résultat, affichage et état après retour.
- `C0156` **`health_protocol.template_preview`** — template preview. Relever entrée, résultat, affichage et état après retour.
- `C0157` **`health_protocol.template_proposals`** — template proposals. Relever entrée, résultat, affichage et état après retour.
- `C0158` **`health_protocol.template_accept`** — template accept. Relever entrée, résultat, affichage et état après retour.
- `C0159` **`health_protocol.template_refuse`** — template refuse. Relever entrée, résultat, affichage et état après retour.
- `C0160` **`health_protocol.template_duplicate`** — template duplicate. Relever entrée, résultat, affichage et état après retour.
- `C0161` **`health_protocol.template_remove`** — template remove. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Le texte source reste intact ; aucune prise activée sans validation.

---

### S015 — Gérer compléments et prises

**Contexte :** Catalogue fictif de produits et boîtes de test.

**Parcours utilisateur :**

1. Déclarer un complément, régler dose/horaire, confirmer recommandation, noter prise/report/oubli, consulter historique et stock, réapprovisionner, suspendre puis reprendre, scanner un code de test.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Dans le Carnet de santé ou l’espace Médicaments / Compléments, ouvrir la fiche et les prises.
2. **Préparer :** Catalogue fictif de produits et boîtes de test. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Déclarer un complément, régler dose/horaire, confirmer recommandation, noter prise/report/oubli, consulter historique et stock, réapprovisionner, suspendre puis reprendre, scanner un code de test. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Stocks, rappels et historique cohérents ; aucune posologie inventée. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 21**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/health/protocol_contracts.js); chaque ligne suivante est un cas indépendant :

- `C0162` **`health_products.declare`** — declare. Relever entrée, résultat, affichage et état après retour.
- `C0163` **`health_products.validate`** — Valider. Relever entrée, résultat, affichage et état après retour.
- `C0164` **`health_products.list`** — Lister. Relever entrée, résultat, affichage et état après retour.
- `C0165` **`health_products.restock`** — restock. Relever entrée, résultat, affichage et état après retour.
- `C0166` **`health_products.pause`** — Mettre en pause. Relever entrée, résultat, affichage et état après retour.
- `C0167` **`health_products.resume`** — Reprendre. Relever entrée, résultat, affichage et état après retour.
- `C0168` **`health_products.stop`** — Arrêter. Relever entrée, résultat, affichage et état après retour.
- `C0169` **`health_products.remove`** — Retirer. Relever entrée, résultat, affichage et état après retour.
- `C0170` **`health_products.list_pause`** — Lister pause. Relever entrée, résultat, affichage et état après retour.
- `C0171` **`health_products.list_stop`** — Lister stop. Relever entrée, résultat, affichage et état après retour.
- `C0172` **`health_products.list_remove`** — Lister remove. Relever entrée, résultat, affichage et état après retour.
- `C0173` **`health_products.intake_note`** — intake note. Relever entrée, résultat, affichage et état après retour.
- `C0174` **`health_products.intakes`** — intakes. Relever entrée, résultat, affichage et état après retour.
- `C0175` **`health_products.intakes_range`** — intakes range. Relever entrée, résultat, affichage et état après retour.
- `C0176` **`health_products.catalogue_search`** — catalogue search. Relever entrée, résultat, affichage et état après retour.
- `C0177` **`health_products.catalogue_barcode`** — catalogue barcode. Relever entrée, résultat, affichage et état après retour.
- `C0178` **`health_products.medicine_search`** — medicine search. Relever entrée, résultat, affichage et état après retour.
- `C0179` **`health_products.medicine_presentation`** — medicine presentation. Relever entrée, résultat, affichage et état après retour.
- `C0180` **`health_products.medicine_posology`** — medicine posology. Relever entrée, résultat, affichage et état après retour.
- `C0181` **`health_products.medicine_scan`** — medicine scan. Relever entrée, résultat, affichage et état après retour.
- `C0182` **`health_products.reminder`** — reminder. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Stocks, rappels et historique cohérents ; aucune posologie inventée.

---

### S016 — Consulter une fiche nutrition avec justification

**Contexte :** Produit alimentaire et profils synthétiques.

**Parcours utilisateur :**

1. Lire verdict, raison, règles, produits concernés, consigner un conseil fictif de professionnel puis le retirer.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Produit alimentaire et profils synthétiques. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Lire verdict, raison, règles, produits concernés, consigner un conseil fictif de professionnel puis le retirer. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Sources affichées, règles consultables, données privées non divulguées. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 8**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/health/food_advice_contracts.js); chaque ligne suivante est un cas indépendant :

- `C0183` **`food_advice.verdicts`** — verdicts. Relever entrée, résultat, affichage et état après retour.
- `C0184` **`food_advice.profile`** — profile. Relever entrée, résultat, affichage et état après retour.
- `C0185` **`food_advice.products`** — products. Relever entrée, résultat, affichage et état après retour.
- `C0186` **`food_advice.reason`** — reason. Relever entrée, résultat, affichage et état après retour.
- `C0187` **`food_advice.tips`** — tips. Relever entrée, résultat, affichage et état après retour.
- `C0188` **`food_advice.tip_save`** — tip save. Relever entrée, résultat, affichage et état après retour.
- `C0189` **`food_advice.tip_remove`** — tip remove. Relever entrée, résultat, affichage et état après retour.
- `C0190` **`food_advice.rules`** — rules. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Sources affichées, règles consultables, données privées non divulguées.

---

### S017 — Constituer un carnet médical de démonstration

**Contexte :** Bilans, résultats et ordonnances fictifs.

**Parcours utilisateur :**

1. Ouvrir rubriques, ajouter consultation/allergie/document, importer bilan fictif, vérifier ligne par ligne, consulter évolution, exporter CSV, retirer une entrée.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Moniteur › Carnet de santé ; sélectionner rubrique, document ou résultat fictif.
2. **Préparer :** Bilans, résultats et ordonnances fictifs. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Ouvrir rubriques, ajouter consultation/allergie/document, importer bilan fictif, vérifier ligne par ligne, consulter évolution, exporter CSV, retirer une entrée. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Les valeurs et unités sont fidèles à l'original, partage et export volontaire. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 12**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/health/health_record_contracts.js); chaque ligne suivante est un cas indépendant :

- `C0191` **`health_record.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.
- `C0192` **`health_record.close`** — Fermer. Relever entrée, résultat, affichage et état après retour.
- `C0193` **`health_record.entries`** — entries. Relever entrée, résultat, affichage et état après retour.
- `C0194` **`health_record.entry_save`** — entry save. Relever entrée, résultat, affichage et état après retour.
- `C0195` **`health_record.entry_remove`** — entry remove. Relever entrée, résultat, affichage et état après retour.
- `C0196` **`health_record.allergies`** — allergies. Relever entrée, résultat, affichage et état après retour.
- `C0197` **`health_record.result_import`** — result import. Relever entrée, résultat, affichage et état après retour.
- `C0198` **`health_record.result_remove`** — result remove. Relever entrée, résultat, affichage et état après retour.
- `C0199` **`health_record.result_read`** — result read. Relever entrée, résultat, affichage et état après retour.
- `C0200` **`health_record.result_verify`** — result verify. Relever entrée, résultat, affichage et état après retour.
- `C0201` **`health_record.results`** — results. Relever entrée, résultat, affichage et état après retour.
- `C0202` **`health_record.results_export`** — results export. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Les valeurs et unités sont fidèles à l'original, partage et export volontaire.

---

### S018 — Composer une ordonnance de démonstration

**Contexte :** Compte professionnel autorisé et patient fictif, aucune ordonnance médicale réelle.

**Parcours utilisateur :**

1. Ouvrir, créer, dicter, photographier un document test, modifier lignes, valider identité et signature selon autorisation, prévisualiser/exporter uniquement en environnement d'essai.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Compte professionnel autorisé et patient fictif, aucune ordonnance médicale réelle. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Ouvrir, créer, dicter, photographier un document test, modifier lignes, valider identité et signature selon autorisation, prévisualiser/exporter uniquement en environnement d'essai. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Les obligations d'identité et permission ne sont pas contournées. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 16**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/prescription/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0203` **`ordonnance.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.
- `C0204` **`ordonnance.new`** — Créer. Relever entrée, résultat, affichage et état après retour.
- `C0205` **`ordonnance.dictate`** — Dicter. Relever entrée, résultat, affichage et état après retour.
- `C0206` **`ordonnance.read_photo`** — Analyser une photo. Relever entrée, résultat, affichage et état après retour.
- `C0207` **`ordonnance.add_line`** — Ajouter line. Relever entrée, résultat, affichage et état après retour.
- `C0208` **`ordonnance.lines`** — lines. Relever entrée, résultat, affichage et état après retour.
- `C0209` **`ordonnance.validate`** — Valider. Relever entrée, résultat, affichage et état après retour.
- `C0210` **`ordonnance.identity`** — identity. Relever entrée, résultat, affichage et état après retour.
- `C0211` **`ordonnance.identity_set`** — identity set. Relever entrée, résultat, affichage et état après retour.
- `C0212` **`ordonnance.tip_remove`** — tip remove. Relever entrée, résultat, affichage et état après retour.
- `C0213` **`ordonnance.sign`** — sign. Relever entrée, résultat, affichage et état après retour.
- `C0214` **`ordonnance.print`** — Imprimer. Relever entrée, résultat, affichage et état après retour.
- `C0215` **`ordonnance.export`** — Exporter. Relever entrée, résultat, affichage et état après retour.
- `C0216` **`ordonnance.send`** — Envoyer. Relever entrée, résultat, affichage et état après retour.
- `C0217` **`ordonnance.list`** — Lister. Relever entrée, résultat, affichage et état après retour.
- `C0218` **`ordonnance.received`** — received. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Les obligations d'identité et permission ne sont pas contournées.

---

### S019 — Explorer une aide à la prescription

**Contexte :** Symptômes et traitements de simulation, professionnel de test.

**Parcours utilisateur :**

1. Décrire symptômes, analyser propositions sans automatiser prescription, corriger/refuser, vérifier heures, valider après décision humaine.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Symptômes et traitements de simulation, professionnel de test. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Décrire symptômes, analyser propositions sans automatiser prescription, corriger/refuser, vérifier heures, valider après décision humaine. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Propositions distinguées des prescriptions, accès professionnel vérifié. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 12**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/prescription/prescription_aid_contracts.js); chaque ligne suivante est un cas indépendant :

- `C0219` **`prescription_aid.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.
- `C0220` **`prescription_aid.symptoms`** — symptoms. Relever entrée, résultat, affichage et état après retour.
- `C0221` **`prescription_aid.analyse`** — analyse. Relever entrée, résultat, affichage et état après retour.
- `C0222` **`prescription_aid.view`** — Basculer la vue texte / grille. Relever entrée, résultat, affichage et état après retour.
- `C0223` **`prescription_aid.list`** — Lister. Relever entrée, résultat, affichage et état après retour.
- `C0224` **`prescription_aid.send`** — Envoyer. Relever entrée, résultat, affichage et état après retour.
- `C0225` **`prescription_aid.received`** — received. Relever entrée, résultat, affichage et état après retour.
- `C0226` **`prescription_aid.resolve`** — resolve. Relever entrée, résultat, affichage et état après retour.
- `C0227` **`prescription_aid.correct`** — correct. Relever entrée, résultat, affichage et état après retour.
- `C0228` **`prescription_aid.refuse`** — Refuser. Relever entrée, résultat, affichage et état après retour.
- `C0229` **`prescription_aid.validate`** — Valider. Relever entrée, résultat, affichage et état après retour.
- `C0230` **`prescription_aid.hours`** — hours. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Propositions distinguées des prescriptions, accès professionnel vérifié.

---

### S020 — Assembler un programme d'objectifs

**Contexte :** Objectif fictif avec exercices, respiration et temps disponibles.

**Parcours utilisateur :**

1. Proposer briques, conserver, reporter, voir programme hebdomadaire, réduire en cas de conflit, lancer, suivre, ajouter sous-étapes, adapter, suspendre et reprendre.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Activité › Objectifs / programme ; composer les briques déjà existantes.
2. **Préparer :** Objectif fictif avec exercices, respiration et temps disponibles. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Proposer briques, conserver, reporter, voir programme hebdomadaire, réduire en cas de conflit, lancer, suivre, ajouter sous-étapes, adapter, suspendre et reprendre. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** La semaine garde ses créneaux et la réduction ne supprime pas les choix sans confirmation. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 26**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/objective_program/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0231` **`objective_program.propose`** — propose. Relever entrée, résultat, affichage et état après retour.
- `C0232` **`objective_program.need_set`** — need set. Relever entrée, résultat, affichage et état après retour.
- `C0233` **`objective_program.decide`** — Décider. Relever entrée, résultat, affichage et état après retour.
- `C0234` **`objective_program.preview`** — Prévisualiser. Relever entrée, résultat, affichage et état après retour.
- `C0235` **`objective_program.reduce`** — reduce. Relever entrée, résultat, affichage et état après retour.
- `C0236` **`objective_program.planning`** — planning. Relever entrée, résultat, affichage et état après retour.
- `C0237` **`objective_program.launch`** — launch. Relever entrée, résultat, affichage et état après retour.
- `C0238` **`objective_program.today`** — today. Relever entrée, résultat, affichage et état après retour.
- `C0239` **`objective_program.adapt_preview`** — adapt preview. Relever entrée, résultat, affichage et état après retour.
- `C0240` **`objective_program.adapt`** — adapt. Relever entrée, résultat, affichage et état après retour.
- `C0241` **`objective_program.free_read`** — free read. Relever entrée, résultat, affichage et état après retour.
- `C0242` **`objective_program.free_set`** — free set. Relever entrée, résultat, affichage et état après retour.
- `C0243` **`objective_program.free_step_add`** — free step add. Relever entrée, résultat, affichage et état après retour.
- `C0244` **`objective_program.free_step_rename`** — free step rename. Relever entrée, résultat, affichage et état après retour.
- `C0245` **`objective_program.free_step_move`** — free step move. Relever entrée, résultat, affichage et état après retour.
- `C0246` **`objective_program.free_step_wait`** — free step wait. Relever entrée, résultat, affichage et état après retour.
- `C0247` **`objective_program.free_step_remove`** — free step remove. Relever entrée, résultat, affichage et état après retour.
- `C0248` **`objective_program.free_done`** — free done. Relever entrée, résultat, affichage et état après retour.
- `C0249` **`objective_program.pause`** — Mettre en pause. Relever entrée, résultat, affichage et état après retour.
- `C0250` **`objective_program.resume`** — Reprendre. Relever entrée, résultat, affichage et état après retour.
- `C0251` **`objective_program.library`** — library. Relever entrée, résultat, affichage et état après retour.
- `C0252` **`objective_program.sheet`** — sheet. Relever entrée, résultat, affichage et état après retour.
- `C0253` **`objective_program.sensors`** — sensors. Relever entrée, résultat, affichage et état après retour.
- `C0254` **`objective_program.scenario`** — scenario. Relever entrée, résultat, affichage et état après retour.
- `C0255` **`objective_program.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.
- `C0256` **`objective_program.close`** — Fermer. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** La semaine garde ses créneaux et la réduction ne supprime pas les choix sans confirmation.

---

### S021 — Organiser une cure et ses séances

**Contexte :** Fiche séjour fictive.

**Parcours utilisateur :**

1. Explorer catalogue, fixer séjour, ajouter/retirer soins, noter soin fait et effacer le séjour de test.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Fiche séjour fictive. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Explorer catalogue, fixer séjour, ajouter/retirer soins, noter soin fait et effacer le séjour de test. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Les créneaux restent cohérents avec l'agenda. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 8**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/thalasso/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0257` **`thalasso.catalog`** — catalog. Relever entrée, résultat, affichage et état après retour.
- `C0258` **`thalasso.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.
- `C0259` **`thalasso.stay_read`** — stay read. Relever entrée, résultat, affichage et état après retour.
- `C0260` **`thalasso.stay_set`** — stay set. Relever entrée, résultat, affichage et état après retour.
- `C0261` **`thalasso.stay_clear`** — stay clear. Relever entrée, résultat, affichage et état après retour.
- `C0262` **`thalasso.care_add`** — care add. Relever entrée, résultat, affichage et état après retour.
- `C0263` **`thalasso.care_remove`** — care remove. Relever entrée, résultat, affichage et état après retour.
- `C0264` **`thalasso.care_done`** — care done. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Les créneaux restent cohérents avec l'agenda.

---

### S022 — Gérer l'usage des capteurs

**Contexte :** Capteur simulé ou matériel autorisé.

**Parcours utilisateur :**

1. Consulter consentement, l'activer, voir liste, désactiver, supprimer/restaurer et révoquer.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Capteur simulé ou matériel autorisé. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Consulter consentement, l'activer, voir liste, désactiver, supprimer/restaurer et révoquer. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Aucune lecture capteur après refus ; état identique sur les appareils synchronisés. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 7**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/health/sensor_contracts.js); chaque ligne suivante est un cas indépendant :

- `C0265` **`sensors.status`** — status. Relever entrée, résultat, affichage et état après retour.
- `C0266` **`sensors.consent`** — consent. Relever entrée, résultat, affichage et état après retour.
- `C0267` **`sensors.set_consent`** — Définir consent. Relever entrée, résultat, affichage et état après retour.
- `C0268` **`sensors.list`** — Lister. Relever entrée, résultat, affichage et état après retour.
- `C0269` **`sensors.delete`** — Supprimer. Relever entrée, résultat, affichage et état après retour.
- `C0270` **`sensors.restore`** — restore. Relever entrée, résultat, affichage et état après retour.
- `C0271` **`sensors.set_enabled`** — Définir enabled. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Aucune lecture capteur après refus ; état identique sur les appareils synchronisés.

---

### S023 — Consentement aux données corporelles

**Contexte :** Mesures corporelles fictives.

**Parcours utilisateur :**

1. Lire l'état, accorder/révoquer consentement et supprimer données de test.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Mesures corporelles fictives. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Lire l'état, accorder/révoquer consentement et supprimer données de test. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Permissions et effacement reflétés dans l'interface et le stockage. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 4**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/health/body_data_contracts.js); chaque ligne suivante est un cas indépendant :

- `C0272` **`body_data.consent`** — consent. Relever entrée, résultat, affichage et état après retour.
- `C0273` **`body_data.set_consent`** — Définir consent. Relever entrée, résultat, affichage et état après retour.
- `C0274` **`body_data.status`** — status. Relever entrée, résultat, affichage et état après retour.
- `C0275` **`body_data.delete`** — Supprimer. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Permissions et effacement reflétés dans l'interface et le stockage.

---

### S024 — Faire une liste de courses à plusieurs

**Contexte :** Liste de courses et deux comptes fictifs.

**Parcours utilisateur :**

1. Ajouter pain/lait, changer quantités et prix, cocher/décocher, synchroniser infos nutritionnelles, supprimer les éléments achetés.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Activité › Achat ; sélectionner la liste et ses lignes.
2. **Préparer :** Liste de courses et deux comptes fictifs. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Ajouter pain/lait, changer quantités et prix, cocher/décocher, synchroniser infos nutritionnelles, supprimer les éléments achetés. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Deux appareils voient les bons états, aucune ligne perdue. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 9**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/shopping/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0276` **`shopping.list`** — Lister. Relever entrée, résultat, affichage et état après retour.
- `C0277` **`shopping.add`** — Ajouter. Relever entrée, résultat, affichage et état après retour.
- `C0278` **`shopping.update`** — Modifier. Relever entrée, résultat, affichage et état après retour.
- `C0279` **`shopping.check`** — Cocher. Relever entrée, résultat, affichage et état après retour.
- `C0280` **`shopping.uncheck`** — Décocher. Relever entrée, résultat, affichage et état après retour.
- `C0281` **`shopping.remove`** — Retirer. Relever entrée, résultat, affichage et état après retour.
- `C0282` **`shopping.clear_checked`** — clear checked. Relever entrée, résultat, affichage et état après retour.
- `C0283` **`shopping.sync_nutrition`** — sync nutrition. Relever entrée, résultat, affichage et état après retour.
- `C0284` **`shopping.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Deux appareils voient les bons états, aucune ligne perdue.

---

### S025 — Organiser une bibliothèque pour un reportage

**Contexte :** Photos, sons et vidéos fictifs.

**Parcours utilisateur :**

1. Créer/renommer liste, ajouter/retrancher des médias, lire, pause/suivant, fermer et supprimer liste.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Photos, sons et vidéos fictifs. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Créer/renommer liste, ajouter/retrancher des médias, lire, pause/suivant, fermer et supprimer liste. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Supprimer une liste ne supprime pas les médias sources. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 8**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/media_lists/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0285` **`media_lists.list`** — Lister. Relever entrée, résultat, affichage et état après retour.
- `C0286` **`media_lists.create`** — Créer. Relever entrée, résultat, affichage et état après retour.
- `C0287` **`media_lists.rename`** — Renommer. Relever entrée, résultat, affichage et état après retour.
- `C0288` **`media_lists.add`** — Ajouter. Relever entrée, résultat, affichage et état après retour.
- `C0289` **`media_lists.remove`** — Retirer. Relever entrée, résultat, affichage et état après retour.
- `C0290` **`media_lists.delete`** — Supprimer. Relever entrée, résultat, affichage et état après retour.
- `C0291` **`media_lists.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.
- `C0292` **`media_lists.control`** — control. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Supprimer une liste ne supprime pas les médias sources.

---

### S026 — Partager un projet avec un collaborateur

**Contexte :** Deux comptes et un projet de test.

**Parcours utilisateur :**

1. Envoyer, consulter les demandes, accepter/refuser, suivre les destinataires, détacher, révoquer, partager une liste.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Dans un objet, liste ou projet, utiliser le véritable outil de partage.
2. **Préparer :** Deux comptes et un projet de test. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Envoyer, consulter les demandes, accepter/refuser, suivre les destinataires, détacher, révoquer, partager une liste. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Le droit révoqué est effectivement perdu sur les deux appareils. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 12**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/sharing/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0293` **`share.send`** — Envoyer. Relever entrée, résultat, affichage et état après retour.
- `C0294` **`share.pending`** — pending. Relever entrée, résultat, affichage et état après retour.
- `C0295` **`share.view`** — Basculer la vue texte / grille. Relever entrée, résultat, affichage et état après retour.
- `C0296` **`share.accept`** — Accepter. Relever entrée, résultat, affichage et état après retour.
- `C0297` **`share.refuse`** — Refuser. Relever entrée, résultat, affichage et état après retour.
- `C0298` **`share.detach`** — detach. Relever entrée, résultat, affichage et état après retour.
- `C0299` **`share.revoke`** — revoke. Relever entrée, résultat, affichage et état après retour.
- `C0300` **`share.sent`** — sent. Relever entrée, résultat, affichage et état après retour.
- `C0301` **`share.list_create`** — Lister create. Relever entrée, résultat, affichage et état après retour.
- `C0302` **`share.list_delete`** — Lister delete. Relever entrée, résultat, affichage et état après retour.
- `C0303` **`share.draft`** — draft. Relever entrée, résultat, affichage et état après retour.
- `C0304` **`share.announce`** — announce. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Le droit révoqué est effectivement perdu sur les deux appareils.

---

### S027 — Trouver et organiser une sortie culturelle

**Contexte :** Catégorie concert ou musée dans une zone de test.

**Parcours utilisateur :**

1. Chercher, régler rayon, consulter fiche, enregistrer favori, ajouter événement au calendrier, voir itinéraire et billetterie.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Catégorie concert ou musée dans une zone de test. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Chercher, régler rayon, consulter fiche, enregistrer favori, ajouter événement au calendrier, voir itinéraire et billetterie. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Aucun achat automatique ; les liens externes sont clairement identifiés. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 10**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/shows/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0305` **`shows.plates`** — plates. Relever entrée, résultat, affichage et état après retour.
- `C0306` **`shows.search`** — Rechercher. Relever entrée, résultat, affichage et état après retour.
- `C0307` **`shows.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.
- `C0308` **`shows.set_favorite`** — Définir comme favori. Relever entrée, résultat, affichage et état après retour.
- `C0309` **`shows.set_radius`** — Définir radius. Relever entrée, résultat, affichage et état après retour.
- `C0310` **`shows.set_place`** — Définir place. Relever entrée, résultat, affichage et état après retour.
- `C0311` **`shows.add_to_calendar`** — Ajouter to calendar. Relever entrée, résultat, affichage et état après retour.
- `C0312` **`shows.navigate`** — navigate. Relever entrée, résultat, affichage et état après retour.
- `C0313` **`shows.open_site`** — Ouvrir site. Relever entrée, résultat, affichage et état après retour.
- `C0314` **`shows.open_tickets`** — Ouvrir tickets. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Aucun achat automatique ; les liens externes sont clairement identifiés.

---

### S028 — Ouvrir une ressource dans le navigateur interne

**Contexte :** URL publique de test.

**Parcours utilisateur :**

1. Ouvrir, naviguer, modifier taille, enregistrer/consulter favoris, choisir moteur si disponible, fermer.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Dans un projet ou depuis l’outil Web, ouvrir la page ou ses favoris.
2. **Préparer :** URL publique de test. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Ouvrir, naviguer, modifier taille, enregistrer/consulter favoris, choisir moteur si disponible, fermer. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** La page reste lisible et retour au projet correct. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 8**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/web/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0315` **`web.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.
- `C0316` **`web.navigate`** — navigate. Relever entrée, résultat, affichage et état après retour.
- `C0317` **`web.page`** — page. Relever entrée, résultat, affichage et état après retour.
- `C0318` **`web.favorite`** — Ajouter aux favoris. Relever entrée, résultat, affichage et état après retour.
- `C0319` **`web.favorites`** — favorites. Relever entrée, résultat, affichage et état après retour.
- `C0320` **`web.size`** — size. Relever entrée, résultat, affichage et état après retour.
- `C0321` **`web.close`** — Fermer. Relever entrée, résultat, affichage et état après retour.
- `C0322` **`web.engine`** — engine. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** La page reste lisible et retour au projet correct.

---

### S029 — Publier une annonce d'événement d'essai

**Contexte :** Événement privé en environnement test.

**Parcours utilisateur :**

1. Déclarer catégorie/lieu, publier avec validation, consulter proches, modifier, contacter, partager, dépublier et signaler un contenu test.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Événement privé en environnement test. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Déclarer catégorie/lieu, publier avec validation, consulter proches, modifier, contacter, partager, dépublier et signaler un contenu test. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Les métadonnées sont exactes et un événement retiré disparaît des recherches. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 13**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/public_events/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0323` **`events.categories`** — categories. Relever entrée, résultat, affichage et état après retour.
- `C0324` **`events.declare`** — declare. Relever entrée, résultat, affichage et état après retour.
- `C0325` **`events.publish`** — Publier. Relever entrée, résultat, affichage et état après retour.
- `C0326` **`events.update`** — Modifier. Relever entrée, résultat, affichage et état après retour.
- `C0327` **`events.unpublish`** — unpublish. Relever entrée, résultat, affichage et état après retour.
- `C0328` **`events.mine`** — mine. Relever entrée, résultat, affichage et état après retour.
- `C0329` **`events.nearby`** — nearby. Relever entrée, résultat, affichage et état après retour.
- `C0330` **`events.report`** — report. Relever entrée, résultat, affichage et état après retour.
- `C0331` **`events.contact`** — contact. Relever entrée, résultat, affichage et état après retour.
- `C0332` **`events.panel`** — panel. Relever entrée, résultat, affichage et état après retour.
- `C0333` **`events.save`** — Enregistrer. Relever entrée, résultat, affichage et état après retour.
- `C0334` **`events.share`** — Partager. Relever entrée, résultat, affichage et état après retour.
- `C0335` **`events.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Les métadonnées sont exactes et un événement retiré disparaît des recherches.

---

### S030 — Préparer une fiche de produit et une commande fictive

**Contexte :** Catalogue et boutique de test sans paiement réel.

**Parcours utilisateur :**

1. Créer fiche, modifier prix/photos, gérer favoris, discuter, préparer achat fictif, consulter commande et retrait.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Catalogue et boutique de test sans paiement réel. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Créer fiche, modifier prix/photos, gérer favoris, discuter, préparer achat fictif, consulter commande et retrait. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Le prix et les droits restent cohérents, aucune dépense réelle. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 25**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/shop/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0336` **`shop.browse`** — browse. Relever entrée, résultat, affichage et état après retour.
- `C0337` **`shop.sell`** — sell. Relever entrée, résultat, affichage et état après retour.
- `C0338` **`shop.update`** — Modifier. Relever entrée, résultat, affichage et état après retour.
- `C0339` **`shop.withdraw`** — Retirer. Relever entrée, résultat, affichage et état après retour.
- `C0340` **`shop.delete`** — Supprimer. Relever entrée, résultat, affichage et état après retour.
- `C0341` **`shop.mine`** — mine. Relever entrée, résultat, affichage et état après retour.
- `C0342` **`shop.buy`** — buy. Relever entrée, résultat, affichage et état après retour.
- `C0343` **`shop.orders`** — orders. Relever entrée, résultat, affichage et état après retour.
- `C0344` **`shop.order`** — order. Relever entrée, résultat, affichage et état après retour.
- `C0345` **`shop.write`** — Écrire. Relever entrée, résultat, affichage et état après retour.
- `C0346` **`shop.conversation`** — conversation. Relever entrée, résultat, affichage et état après retour.
- `C0347` **`shop.conversations`** — conversations. Relever entrée, résultat, affichage et état après retour.
- `C0348` **`shop.report`** — report. Relever entrée, résultat, affichage et état après retour.
- `C0349` **`shop.favorite`** — Ajouter aux favoris. Relever entrée, résultat, affichage et état après retour.
- `C0350` **`shop.favorites`** — favorites. Relever entrée, résultat, affichage et état après retour.
- `C0351` **`shop.web_shops`** — web shops. Relever entrée, résultat, affichage et état après retour.
- `C0352` **`shop.web_shop_add`** — web shop add. Relever entrée, résultat, affichage et état après retour.
- `C0353` **`shop.plans`** — plans. Relever entrée, résultat, affichage et état après retour.
- `C0354` **`shop.plan_set`** — plan set. Relever entrée, résultat, affichage et état après retour.
- `C0355` **`shop.plan_item`** — plan item. Relever entrée, résultat, affichage et état après retour.
- `C0356` **`shop.web_shop_site`** — web shop site. Relever entrée, résultat, affichage et état après retour.
- `C0357` **`shop.plan_remove`** — plan remove. Relever entrée, résultat, affichage et état après retour.
- `C0358` **`shop.plan_order`** — plan order. Relever entrée, résultat, affichage et état après retour.
- `C0359` **`shop.plan_decline`** — plan decline. Relever entrée, résultat, affichage et état après retour.
- `C0360` **`shop.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Le prix et les droits restent cohérents, aucune dépense réelle.

---

### S031 — Prendre un rendez-vous d'essai avec un coach

**Contexte :** Coach et client de test.

**Parcours utilisateur :**

1. Rechercher, consulter plages, réserver, répondre, annuler et vérifier listes de rendez-vous.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Coach et client de test. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Rechercher, consulter plages, réserver, répondre, annuler et vérifier listes de rendez-vous. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Pas de double réservation ; horaires et fuseaux corrects. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 10**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/coaches/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0361` **`coaches.find`** — find. Relever entrée, résultat, affichage et état après retour.
- `C0362` **`coaches.slots`** — slots. Relever entrée, résultat, affichage et état après retour.
- `C0363` **`coaches.book`** — book. Relever entrée, résultat, affichage et état après retour.
- `C0364` **`coaches.bookings`** — bookings. Relever entrée, résultat, affichage et état après retour.
- `C0365` **`coaches.answer`** — answer. Relever entrée, résultat, affichage et état après retour.
- `C0366` **`coaches.cancel`** — Annuler. Relever entrée, résultat, affichage et état après retour.
- `C0367` **`coaches.mine`** — mine. Relever entrée, résultat, affichage et état après retour.
- `C0368` **`coaches.become`** — become. Relever entrée, résultat, affichage et état après retour.
- `C0369` **`coaches.stop`** — Arrêter. Relever entrée, résultat, affichage et état après retour.
- `C0370` **`coaches.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Pas de double réservation ; horaires et fuseaux corrects.

---

### S032 — Chercher un film et enregistrer sa sélection

**Contexte :** Catalogue public selon disponibilité des services.

**Parcours utilisateur :**

1. Choisir services, rechercher, comparer films similaires, ajouter favori et liste, ouvrir bande-annonce et lecture autorisée.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Catalogue public selon disponibilité des services. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Choisir services, rechercher, comparer films similaires, ajouter favori et liste, ouvrir bande-annonce et lecture autorisée. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Le service de lecture choisi correspond aux droits ; position de retour conservée. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 10**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/films/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0371` **`films.services`** — services. Relever entrée, résultat, affichage et état après retour.
- `C0372` **`films.set_service`** — Définir service. Relever entrée, résultat, affichage et état après retour.
- `C0373` **`films.search`** — Rechercher. Relever entrée, résultat, affichage et état après retour.
- `C0374` **`films.similar`** — similar. Relever entrée, résultat, affichage et état après retour.
- `C0375` **`films.lists`** — lists. Relever entrée, résultat, affichage et état après retour.
- `C0376` **`films.favorite`** — Ajouter aux favoris. Relever entrée, résultat, affichage et état après retour.
- `C0377` **`films.like`** — like. Relever entrée, résultat, affichage et état après retour.
- `C0378` **`films.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.
- `C0379` **`films.play`** — Lire. Relever entrée, résultat, affichage et état après retour.
- `C0380` **`films.control`** — control. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Le service de lecture choisi correspond aux droits ; position de retour conservée.

---

### S033 — Créer un document illustré de A à Z

**Contexte :** Projet d'édition, texte et photo de test.

**Parcours utilisateur :**

1. Créer texte, écrire et styliser, insérer image/lien, créer dessin, modifier les formes, retoucher photo, exporter, partager.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Créer › Texte / Dessin / Retouche ; les outils et options natives s’affichent dans les palettes propres à l’objet.
2. **Préparer :** Projet d'édition, texte et photo de test. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Créer texte, écrire et styliser, insérer image/lien, créer dessin, modifier les formes, retoucher photo, exporter, partager. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Chaque objet reste éditable, tous les styles sont visibles et enregistrés. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 22**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/creation/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0381` **`creation.list`** — Lister. Relever entrée, résultat, affichage et état après retour.
- `C0382` **`creation.read`** — Lire. Relever entrée, résultat, affichage et état après retour.
- `C0383` **`creation.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.
- `C0384` **`creation.new_text`** — Créer un texte. Relever entrée, résultat, affichage et état après retour.
- `C0385` **`creation.new_drawing`** — Créer un dessin. Relever entrée, résultat, affichage et état après retour.
- `C0386` **`creation.new_picture`** — Créer une image. Relever entrée, résultat, affichage et état après retour.
- `C0387` **`creation.write`** — Écrire. Relever entrée, résultat, affichage et état après retour.
- `C0388` **`creation.style`** — style. Relever entrée, résultat, affichage et état après retour.
- `C0389` **`creation.paragraph`** — paragraph. Relever entrée, résultat, affichage et état après retour.
- `C0390` **`creation.page`** — page. Relever entrée, résultat, affichage et état après retour.
- `C0391` **`creation.insert`** — insert. Relever entrée, résultat, affichage et état après retour.
- `C0392` **`creation.link`** — link. Relever entrée, résultat, affichage et état après retour.
- `C0393` **`creation.draw`** — draw. Relever entrée, résultat, affichage et état après retour.
- `C0394` **`creation.drawing_style`** — drawing style. Relever entrée, résultat, affichage et état après retour.
- `C0395` **`creation.arrange`** — arrange. Relever entrée, résultat, affichage et état après retour.
- `C0396` **`creation.erase`** — erase. Relever entrée, résultat, affichage et état après retour.
- `C0397` **`creation.retouch`** — retouch. Relever entrée, résultat, affichage et état après retour.
- `C0398` **`creation.frame`** — Recadrer. Relever entrée, résultat, affichage et état après retour.
- `C0399` **`creation.keep`** — keep. Relever entrée, résultat, affichage et état après retour.
- `C0400` **`creation.delete`** — Supprimer. Relever entrée, résultat, affichage et état après retour.
- `C0401` **`creation.export`** — Exporter. Relever entrée, résultat, affichage et état après retour.
- `C0402` **`creation.send`** — Envoyer. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Chaque objet reste éditable, tous les styles sont visibles et enregistrés.

---

### S034 — Calculer directement dans le texte sans tableur

**Contexte :** Document avec «12 bananes», «14 pommes», «total» et «prix 3 €».

**Parcours utilisateur :**

1. Ouvrir Créer › Texte, activer Calc, sélectionner valeurs, choisir + puis =, déposer le résultat sur «total», modifier 12 en 20, basculer Grille et rééditer.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Créer › Texte › Calc (interrupteur de la bande). Les opérateurs +, −, ×, ÷, = et Grille apparaissent au-dessus de la bande.
2. **Préparer :** Document avec «12 bananes», «14 pommes», «total» et «prix 3 €». Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Ouvrir Créer › Texte, activer Calc, sélectionner valeurs, choisir + puis =, déposer le résultat sur «total», modifier 12 en 20, basculer Grille et rééditer. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Le texte et la grille partagent les mêmes valeurs ; total 26 puis 34, jamais de fichier tableur séparé. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 8**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/calc/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0403` **`calc.cells`** — Lister les cellules de texte. Relever entrée, résultat, affichage et état après retour.
- `C0404` **`calc.cell`** — Créer une cellule ancrée à une valeur. Relever entrée, résultat, affichage et état après retour.
- `C0405` **`calc.cell_update`** — Modifier une cellule. Relever entrée, résultat, affichage et état après retour.
- `C0406` **`calc.uncell`** — Retirer le statut de cellule sans effacer le texte. Relever entrée, résultat, affichage et état après retour.
- `C0407` **`calc.formula`** — Créer ou modifier une formule. Relever entrée, résultat, affichage et état après retour.
- `C0408` **`calc.view`** — Basculer la vue texte / grille. Relever entrée, résultat, affichage et état après retour.
- `C0409` **`calc.grid_move`** — Déplacer ou échanger deux cellules de grille. Relever entrée, résultat, affichage et état après retour.
- `C0410` **`calc.recalc`** — Recalculer les formules. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Le texte et la grille partagent les mêmes valeurs ; total 26 puis 34, jamais de fichier tableur séparé.

---

### S035 — Appliquer un modèle typographique

**Contexte :** Document texte fictif.

**Parcours utilisateur :**

1. Afficher modèles, appliquer, changer rôle et styles, retirer modèle.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Document texte fictif. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Afficher modèles, appliquer, changer rôle et styles, retirer modèle. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** La sémantique des paragraphes reste intacte, seule l'apparence change. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 5**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/document/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0411` **`document.templates`** — templates. Relever entrée, résultat, affichage et état après retour.
- `C0412` **`document.template`** — template. Relever entrée, résultat, affichage et état après retour.
- `C0413` **`document.untemplate`** — untemplate. Relever entrée, résultat, affichage et état après retour.
- `C0414` **`document.role`** — role. Relever entrée, résultat, affichage et état après retour.
- `C0415` **`document.role_style`** — role style. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** La sémantique des paragraphes reste intacte, seule l'apparence change.

---

### S036 — Attacher un script autorisé à un document

**Contexte :** Document fictif avec cellules de calcul.

**Parcours utilisateur :**

1. Lister/écrire script JavaScript ou Ruby validé, activer, exécuter dans sandbox, puis retirer.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Sur un document texte, utiliser Scripts (si attaché) et son éditeur/autorisation.
2. **Préparer :** Document fictif avec cellules de calcul. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Lister/écrire script JavaScript ou Ruby validé, activer, exécuter dans sandbox, puis retirer. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Le script ne voit que les données du document autorisé ; résultats traçables. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 5**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/script/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0416` **`script.list`** — Lister. Relever entrée, résultat, affichage et état après retour.
- `C0417` **`script.save`** — Enregistrer. Relever entrée, résultat, affichage et état après retour.
- `C0418` **`script.remove`** — Retirer. Relever entrée, résultat, affichage et état après retour.
- `C0419` **`script.enable`** — enable. Relever entrée, résultat, affichage et état après retour.
- `C0420` **`script.run`** — run. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Le script ne voit que les données du document autorisé ; résultats traçables.

---

### S037 — Importer des documents et médias par le même outil

**Contexte :** Fichiers JPG, MP4, WAV, DOCX, XLSX, CSV, PDF test.

**Parcours utilisateur :**

1. Ouvrir le panneau unique d'import, choisir source, filtres/vue, importer depuis appareil ou caméra, prévisualiser, choisir, fermer, supprimer la prise test.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Depuis l’objet ou le projet, utiliser l’import unique ; la source, les filtres et l’aperçu sont dans son panneau.
2. **Préparer :** Fichiers JPG, MP4, WAV, DOCX, XLSX, CSV, PDF test. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Ouvrir le panneau unique d'import, choisir source, filtres/vue, importer depuis appareil ou caméra, prévisualiser, choisir, fermer, supprimer la prise test. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Le média externe rejoint la médiathèque et les formats sont identifiés correctement. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 11**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/media_import/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0421` **`media_import.state`** — Consulter l’état. Relever entrée, résultat, affichage et état après retour.
- `C0422` **`media_import.list`** — Lister. Relever entrée, résultat, affichage et état après retour.
- `C0423` **`media_import.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.
- `C0424` **`media_import.source`** — source. Relever entrée, résultat, affichage et état après retour.
- `C0425` **`media_import.filter`** — filter. Relever entrée, résultat, affichage et état après retour.
- `C0426` **`media_import.layout`** — layout. Relever entrée, résultat, affichage et état après retour.
- `C0427` **`media_import.camera`** — camera. Relever entrée, résultat, affichage et état après retour.
- `C0428` **`media_import.take`** — take. Relever entrée, résultat, affichage et état après retour.
- `C0429` **`media_import.choose`** — choose. Relever entrée, résultat, affichage et état après retour.
- `C0430` **`media_import.close`** — Fermer. Relever entrée, résultat, affichage et état après retour.
- `C0431` **`media_import.delete`** — Supprimer. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Le média externe rejoint la médiathèque et les formats sont identifiés correctement.

---

### S038 — Enregistrer un reportage photo, vidéo et son

**Contexte :** Caméra/micro fictifs ou appareil autorisé.

**Parcours utilisateur :**

1. Choisir photo/vidéo/audio, afficher aperçu, démarrer/arrêter, revoir prise, plein écran, supprimer.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** La commande Enr. de la bande ouvre Capture ; choisir Photo, Vidéo ou Audio.
2. **Préparer :** Caméra/micro fictifs ou appareil autorisé. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Choisir photo/vidéo/audio, afficher aperçu, démarrer/arrêter, revoir prise, plein écran, supprimer. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** La prise est sauvegardée, le son propre, commandes accessibles pendant capture. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 11**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/capture/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0432` **`captures.state`** — Consulter l’état. Relever entrée, résultat, affichage et état après retour.
- `C0433` **`captures.start`** — Démarrer. Relever entrée, résultat, affichage et état après retour.
- `C0434` **`captures.stop`** — Arrêter. Relever entrée, résultat, affichage et état après retour.
- `C0435` **`captures.close`** — Fermer. Relever entrée, résultat, affichage et état après retour.
- `C0436` **`captures.camera`** — camera. Relever entrée, résultat, affichage et état après retour.
- `C0437` **`captures.show`** — show. Relever entrée, résultat, affichage et état après retour.
- `C0438` **`captures.play`** — Lire. Relever entrée, résultat, affichage et état après retour.
- `C0439` **`captures.pause`** — Mettre en pause. Relever entrée, résultat, affichage et état après retour.
- `C0440` **`captures.preview`** — Prévisualiser. Relever entrée, résultat, affichage et état après retour.
- `C0441` **`captures.fullscreen`** — fullscreen. Relever entrée, résultat, affichage et état après retour.
- `C0442` **`captures.delete`** — Supprimer. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** La prise est sauvegardée, le son propre, commandes accessibles pendant capture.

---

### S039 — Fabriquer un instrument et une chaîne d'effets

**Contexte :** Samples originaux, micro et clavier MIDI de test.

**Parcours utilisateur :**

1. Créer sampler, répartir notes et vélocités, découper samples, poser marqueurs, créer round-robin, tester notes, monter chaîne FX, presets, exporter SFZ.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Ouvrir le projet musical, sélectionner l’entrée, le rack, un sample ou un instrument ; chaque effet conserve ses réglages natifs.
2. **Préparer :** Samples originaux, micro et clavier MIDI de test. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Créer sampler, répartir notes et vélocités, découper samples, poser marqueurs, créer round-robin, tester notes, monter chaîne FX, presets, exporter SFZ. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Notes justes, audio sans décrochement, réglages audibles, effets non doublés. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 70**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/audio_fx/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0443` **`audio_fx.catalog`** — catalog. Relever entrée, résultat, affichage et état après retour.
- `C0444` **`audio_fx.inputs`** — inputs. Relever entrée, résultat, affichage et état après retour.
- `C0445` **`audio_fx.start`** — Démarrer. Relever entrée, résultat, affichage et état après retour.
- `C0446` **`audio_fx.stop`** — Arrêter. Relever entrée, résultat, affichage et état après retour.
- `C0447` **`audio_fx.add`** — Ajouter. Relever entrée, résultat, affichage et état après retour.
- `C0448` **`audio_fx.move`** — Déplacer. Relever entrée, résultat, affichage et état après retour.
- `C0449` **`audio_fx.remove`** — Retirer. Relever entrée, résultat, affichage et état après retour.
- `C0450` **`audio_fx.set_param`** — Définir param. Relever entrée, résultat, affichage et état après retour.
- `C0451` **`audio_fx.bypass`** — bypass. Relever entrée, résultat, affichage et état après retour.
- `C0452` **`audio_fx.set_input`** — Définir input. Relever entrée, résultat, affichage et état après retour.
- `C0453` **`audio_fx.save`** — Enregistrer. Relever entrée, résultat, affichage et état après retour.
- `C0454` **`audio_fx.update`** — Modifier. Relever entrée, résultat, affichage et état après retour.
- `C0455` **`audio_fx.compose`** — compose. Relever entrée, résultat, affichage et état après retour.
- `C0456` **`audio_fx.delete`** — Supprimer. Relever entrée, résultat, affichage et état après retour.
- `C0457` **`audio_fx.favorite`** — Ajouter aux favoris. Relever entrée, résultat, affichage et état après retour.
- `C0458` **`audio_fx.save_preset`** — Enregistrer preset. Relever entrée, résultat, affichage et état après retour.
- `C0459` **`audio_fx.delete_preset`** — Supprimer preset. Relever entrée, résultat, affichage et état après retour.
- `C0460` **`audio_fx.tone3000_search`** — tone3000 search. Relever entrée, résultat, affichage et état après retour.
- `C0461` **`audio_fx.tone3000_models`** — tone3000 models. Relever entrée, résultat, affichage et état après retour.
- `C0462` **`audio_fx.tone3000_take`** — tone3000 take. Relever entrée, résultat, affichage et état après retour.
- `C0463` **`audio_fx.instrument_create`** — instrument create. Relever entrée, résultat, affichage et état après retour.
- `C0464` **`audio_fx.instrument_update`** — instrument update. Relever entrée, résultat, affichage et état après retour.
- `C0465` **`audio_fx.instrument_delete`** — instrument delete. Relever entrée, résultat, affichage et état après retour.
- `C0466` **`audio_fx.instrument_read`** — instrument read. Relever entrée, résultat, affichage et état après retour.
- `C0467` **`audio_fx.samples_place`** — samples place. Relever entrée, résultat, affichage et état après retour.
- `C0468` **`audio_fx.zone_drop`** — zone drop. Relever entrée, résultat, affichage et état après retour.
- `C0469` **`audio_fx.zone_set`** — zone set. Relever entrée, résultat, affichage et état après retour.
- `C0470` **`audio_fx.zone_remove`** — zone remove. Relever entrée, résultat, affichage et état après retour.
- `C0471` **`audio_fx.take_set`** — take set. Relever entrée, résultat, affichage et état après retour.
- `C0472` **`audio_fx.take_remove`** — take remove. Relever entrée, résultat, affichage et état après retour.
- `C0473` **`audio_fx.release_takes_set`** — release takes set. Relever entrée, résultat, affichage et état après retour.
- `C0474` **`audio_fx.params_set`** — params set. Relever entrée, résultat, affichage et état après retour.
- `C0475` **`audio_fx.facade_set`** — facade set. Relever entrée, résultat, affichage et état après retour.
- `C0476` **`audio_fx.note_play`** — note play. Relever entrée, résultat, affichage et état après retour.
- `C0477` **`audio_fx.composed_set`** — composed set. Relever entrée, résultat, affichage et état après retour.
- `C0478` **`audio_fx.composed_step_add`** — composed step add. Relever entrée, résultat, affichage et état après retour.
- `C0479` **`audio_fx.composed_step_set`** — composed step set. Relever entrée, résultat, affichage et état après retour.
- `C0480` **`audio_fx.composed_step_remove`** — composed step remove. Relever entrée, résultat, affichage et état après retour.
- `C0481` **`audio_fx.composed_segment_set`** — composed segment set. Relever entrée, résultat, affichage et état après retour.
- `C0482` **`audio_fx.transition_set`** — transition set. Relever entrée, résultat, affichage et état après retour.
- `C0483` **`audio_fx.transition_remove`** — transition remove. Relever entrée, résultat, affichage et état après retour.
- `C0484` **`audio_fx.marker_add`** — marker add. Relever entrée, résultat, affichage et état après retour.
- `C0485` **`audio_fx.marker_move`** — marker move. Relever entrée, résultat, affichage et état après retour.
- `C0486` **`audio_fx.marker_set`** — marker set. Relever entrée, résultat, affichage et état après retour.
- `C0487` **`audio_fx.marker_remove`** — marker remove. Relever entrée, résultat, affichage et état après retour.
- `C0488` **`audio_fx.validate`** — Valider. Relever entrée, résultat, affichage et état après retour.
- `C0489` **`audio_fx.slice_read`** — slice read. Relever entrée, résultat, affichage et état après retour.
- `C0490` **`audio_fx.slice_tempo_set`** — slice tempo set. Relever entrée, résultat, affichage et état après retour.
- `C0491` **`audio_fx.slice_divide`** — slice divide. Relever entrée, résultat, affichage et état après retour.
- `C0492` **`audio_fx.slice_detect`** — slice detect. Relever entrée, résultat, affichage et état après retour.
- `C0493` **`audio_fx.slice_point_add`** — slice point add. Relever entrée, résultat, affichage et état après retour.
- `C0494` **`audio_fx.slice_point_move`** — slice point move. Relever entrée, résultat, affichage et état après retour.
- `C0495` **`audio_fx.slice_point_remove`** — slice point remove. Relever entrée, résultat, affichage et état après retour.
- `C0496` **`audio_fx.slice_point_lock`** — slice point lock. Relever entrée, résultat, affichage et état après retour.
- `C0497` **`audio_fx.slices_make`** — slices make. Relever entrée, résultat, affichage et état après retour.
- `C0498` **`audio_fx.slices_to_keys`** — slices to keys. Relever entrée, résultat, affichage et état après retour.
- `C0499` **`audio_fx.slices_to_round_robin`** — slices to round robin. Relever entrée, résultat, affichage et état après retour.
- `C0500` **`audio_fx.slices_to_midi`** — slices to midi. Relever entrée, résultat, affichage et état après retour.
- `C0501` **`audio_fx.slices_to_cells`** — slices to cells. Relever entrée, résultat, affichage et état après retour.
- `C0502` **`audio_fx.edit_from_slices`** — Modifier from slices. Relever entrée, résultat, affichage et état après retour.
- `C0503` **`audio_fx.edit_apply`** — Modifier apply. Relever entrée, résultat, affichage et état après retour.
- `C0504` **`audio_fx.edit_undo`** — Modifier undo. Relever entrée, résultat, affichage et état après retour.
- `C0505` **`audio_fx.sample_analyze`** — sample analyze. Relever entrée, résultat, affichage et état après retour.
- `C0506` **`audio_fx.sample_play`** — sample play. Relever entrée, résultat, affichage et état après retour.
- `C0507` **`audio_fx.sample_freeze`** — sample freeze. Relever entrée, résultat, affichage et état après retour.
- `C0508` **`audio_fx.bank_inspect`** — bank inspect. Relever entrée, résultat, affichage et état après retour.
- `C0509` **`audio_fx.bank_import`** — bank import. Relever entrée, résultat, affichage et état après retour.
- `C0510` **`audio_fx.samples_arrange`** — samples arrange. Relever entrée, résultat, affichage et état après retour.
- `C0511` **`audio_fx.instrument_export_sfz`** — instrument export sfz. Relever entrée, résultat, affichage et état après retour.
- `C0512` **`audio_fx.auto_sample`** — auto sample. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Notes justes, audio sans décrochement, réglages audibles, effets non doublés.

---

### S040 — Basculer entre plusieurs profils de vie

**Contexte :** Deux profils fictifs.

**Parcours utilisateur :**

1. Créer, renommer, changer couleur, affecter projet, activer et supprimer un profil.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Dans la bande haute de eVe, ouvrir les profils de vie.
2. **Préparer :** Deux profils fictifs. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Créer, renommer, changer couleur, affecter projet, activer et supprimer un profil. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Seuls les objets assignés suivent la règle attendue. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 7**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/life_profiles/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0513` **`profiles.list`** — Lister. Relever entrée, résultat, affichage et état après retour.
- `C0514` **`profiles.create`** — Créer. Relever entrée, résultat, affichage et état après retour.
- `C0515` **`profiles.rename`** — Renommer. Relever entrée, résultat, affichage et état après retour.
- `C0516` **`profiles.color`** — color. Relever entrée, résultat, affichage et état après retour.
- `C0517` **`profiles.delete`** — Supprimer. Relever entrée, résultat, affichage et état après retour.
- `C0518` **`profiles.activate`** — Activer. Relever entrée, résultat, affichage et état après retour.
- `C0519` **`profiles.assign`** — assign. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Seuls les objets assignés suivent la règle attendue.

---

### S041 — Comparer deux aliments et trouver une alternative

**Contexte :** Codes-barres de produits de test.

**Parcours utilisateur :**

1. Rechercher/scanner, consulter nutri-éléments/allergènes, identifier substances, comparer alternative, ajouter aux courses.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Dans Achat, lancer la recherche ou le scanner du produit alimentaire.
2. **Préparer :** Codes-barres de produits de test. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Rechercher/scanner, consulter nutri-éléments/allergènes, identifier substances, comparer alternative, ajouter aux courses. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Aucune information santé inventée ; origine des données visible. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 7**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/food/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0520` **`food.lookup`** — lookup. Relever entrée, résultat, affichage et état après retour.
- `C0521` **`food.search`** — Rechercher. Relever entrée, résultat, affichage et état après retour.
- `C0522` **`food.alternatives`** — alternatives. Relever entrée, résultat, affichage et état après retour.
- `C0523` **`food.attach`** — attach. Relever entrée, résultat, affichage et état après retour.
- `C0524` **`food.scan`** — scan. Relever entrée, résultat, affichage et état après retour.
- `C0525` **`food.add`** — Ajouter. Relever entrée, résultat, affichage et état après retour.
- `C0526` **`food.identify`** — identify. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Aucune information santé inventée ; origine des données visible.

---

### S042 — Lire un livre numérique avec reprise

**Contexte :** EPUB/PDF de test sans DRM et livre audio original.

**Parcours utilisateur :**

1. Importer, ouvrir, naviguer pages, commander le transport audio, télécharger si permis, fermer puis reprendre.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Ouvrir la bibliothèque puis un livre de test ; les commandes restent dans son lecteur.
2. **Préparer :** EPUB/PDF de test sans DRM et livre audio original. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Importer, ouvrir, naviguer pages, commander le transport audio, télécharger si permis, fermer puis reprendre. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** La position se retrouve et les textes restent lisibles. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 8**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/books/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0527` **`books.list`** — Lister. Relever entrée, résultat, affichage et état après retour.
- `C0528` **`books.download`** — download. Relever entrée, résultat, affichage et état après retour.
- `C0529` **`books.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.
- `C0530` **`books.remove`** — Retirer. Relever entrée, résultat, affichage et état après retour.
- `C0531` **`books.import`** — Importer. Relever entrée, résultat, affichage et état après retour.
- `C0532` **`books.page`** — page. Relever entrée, résultat, affichage et état après retour.
- `C0533` **`books.transport`** — Contrôler le transport. Relever entrée, résultat, affichage et état après retour.
- `C0534` **`books.close`** — Fermer. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** La position se retrouve et les textes restent lisibles.

---

### S043 — Créer un projet avec les bons outils

**Contexte :** Projet graphique fictif.

**Parcours utilisateur :**

1. Lister, créer, ouvrir, ajouter bande d'outils, intégrer médias, filtrer recherche/favoris, supprimer projet test.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Accueil › Projets, ou la palette du projet ; choisir les outils dans la vraie bande du projet.
2. **Préparer :** Projet graphique fictif. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Lister, créer, ouvrir, ajouter bande d'outils, intégrer médias, filtrer recherche/favoris, supprimer projet test. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Projet et objets persistants, bande réelle et non imitation. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 8**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/projects/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0535` **`projects.list`** — Lister. Relever entrée, résultat, affichage et état après retour.
- `C0536` **`projects.create`** — Créer. Relever entrée, résultat, affichage et état après retour.
- `C0537` **`projects.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.
- `C0538` **`projects.favorite`** — Ajouter aux favoris. Relever entrée, résultat, affichage et état après retour.
- `C0539` **`projects.delete`** — Supprimer. Relever entrée, résultat, affichage et état après retour.
- `C0540` **`projects.band_tool`** — band tool. Relever entrée, résultat, affichage et état après retour.
- `C0541` **`projects.media`** — media. Relever entrée, résultat, affichage et état après retour.
- `C0542` **`projects.search`** — Rechercher. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Projet et objets persistants, bande réelle et non imitation.

---

### S044 — Examiner un projet de code

**Contexte :** Dépôt de code fictif accessible.

**Parcours utilisateur :**

1. Créer/ouvrir, consulter état, planifier/check, rechercher dans dépôt, changer mode, afficher fichiers.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Dépôt de code fictif accessible. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Créer/ouvrir, consulter état, planifier/check, rechercher dans dépôt, changer mode, afficher fichiers. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Les fichiers ne sont pas modifiés par simple consultation. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 9**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/code_projects/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0543` **`code_project.create`** — Créer. Relever entrée, résultat, affichage et état après retour.
- `C0544` **`code_project.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.
- `C0545` **`code_project.state`** — Consulter l’état. Relever entrée, résultat, affichage et état après retour.
- `C0546` **`code_project.plan`** — plan. Relever entrée, résultat, affichage et état après retour.
- `C0547` **`code_project.check`** — Cocher. Relever entrée, résultat, affichage et état après retour.
- `C0548` **`code_project.mode`** — mode. Relever entrée, résultat, affichage et état après retour.
- `C0549` **`code_project.repo_list`** — repo list. Relever entrée, résultat, affichage et état après retour.
- `C0550` **`code_project.repo_read`** — repo read. Relever entrée, résultat, affichage et état après retour.
- `C0551` **`code_project.repo_search`** — repo search. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Les fichiers ne sont pas modifiés par simple consultation.

---

### S045 — Créer et suivre des objectifs personnels

**Contexte :** Trois objectifs fictifs sur semaine.

**Parcours utilisateur :**

1. Créer objectif, régler cible, effort, budget de temps, argent, jour/heure, étape et défi, préparer séance, terminer, afficher moniteurs/résultats, revenir, tester Duo.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Accueil › Objectifs / Moniteur ; régler un objectif ou ouvrir ses résultats.
2. **Préparer :** Trois objectifs fictifs sur semaine. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Créer objectif, régler cible, effort, budget de temps, argent, jour/heure, étape et défi, préparer séance, terminer, afficher moniteurs/résultats, revenir, tester Duo. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Progrès, séances, moniteurs et résultats sont cohérents et non dupliqués. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 34**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/dashboard_progression/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0552` **`dashboard.progression.read`** — Lire — progression. Relever entrée, résultat, affichage et état après retour.
- `C0553` **`dashboard.progression.evaluate`** — evaluate — progression. Relever entrée, résultat, affichage et état après retour.
- `C0554` **`dashboard.objectives.list`** — Lister — objectives. Relever entrée, résultat, affichage et état après retour.
- `C0555` **`dashboard.objective.target.set`** — Définir — objective / target. Relever entrée, résultat, affichage et état après retour.
- `C0556` **`dashboard.objective.settings.read`** — Lire — objective / settings. Relever entrée, résultat, affichage et état après retour.
- `C0557` **`dashboard.objective.settings.set`** — Définir — objective / settings. Relever entrée, résultat, affichage et état après retour.
- `C0558` **`dashboard.objective.schedule.read`** — Lire — objective / schedule. Relever entrée, résultat, affichage et état après retour.
- `C0559` **`dashboard.objective.schedule.set`** — Définir — objective / schedule. Relever entrée, résultat, affichage et état après retour.
- `C0560` **`dashboard.objective.aim.set`** — Définir — objective / aim. Relever entrée, résultat, affichage et état après retour.
- `C0561` **`dashboard.objective.deadline.set`** — Définir — objective / deadline. Relever entrée, résultat, affichage et état après retour.
- `C0562` **`dashboard.objective.challenge.set`** — Définir — objective / challenge. Relever entrée, résultat, affichage et état après retour.
- `C0563` **`dashboard.objective.prepare`** — Préparer — objective. Relever entrée, résultat, affichage et état après retour.
- `C0564` **`dashboard.objective.done`** — done — objective. Relever entrée, résultat, affichage et état après retour.
- `C0565` **`dashboard.objective.close`** — Fermer — objective. Relever entrée, résultat, affichage et état après retour.
- `C0566` **`dashboard.objective.delete`** — Supprimer — objective. Relever entrée, résultat, affichage et état après retour.
- `C0567` **`dashboard.session.objectives.read`** — Lire — session / objectives. Relever entrée, résultat, affichage et état après retour.
- `C0568` **`dashboard.session.objectives.set`** — Définir — session / objectives. Relever entrée, résultat, affichage et état après retour.
- `C0569` **`dashboard.monitors.select`** — Sélectionner — monitors. Relever entrée, résultat, affichage et état après retour.
- `C0570` **`dashboard.monitors.favorite`** — Ajouter aux favoris — monitors. Relever entrée, résultat, affichage et état après retour.
- `C0571` **`dashboard.ongoing.open`** — Ouvrir — ongoing. Relever entrée, résultat, affichage et état après retour.
- `C0572` **`dashboard.activity.recent`** — recent — activity. Relever entrée, résultat, affichage et état après retour.
- `C0573` **`dashboard.activity.resume`** — Reprendre — activity. Relever entrée, résultat, affichage et état après retour.
- `C0574` **`dashboard.stage.layout`** — layout — stage. Relever entrée, résultat, affichage et état après retour.
- `C0575` **`dashboard.duo.open`** — Ouvrir — duo. Relever entrée, résultat, affichage et état après retour.
- `C0576` **`dashboard.duo.choose`** — choose — duo. Relever entrée, résultat, affichage et état après retour.
- `C0577` **`dashboard.duo.close`** — Fermer — duo. Relever entrée, résultat, affichage et état après retour.
- `C0578` **`dashboard.search.end`** — end — search. Relever entrée, résultat, affichage et état après retour.
- `C0579` **`dashboard.results.open`** — Ouvrir — results. Relever entrée, résultat, affichage et état après retour.
- `C0580` **`dashboard.results.day`** — day — results. Relever entrée, résultat, affichage et état après retour.
- `C0581` **`dashboard.results.week`** — week — results. Relever entrée, résultat, affichage et état après retour.
- `C0582` **`dashboard.results.filter`** — filter — results. Relever entrée, résultat, affichage et état après retour.
- `C0583` **`dashboard.results.hour`** — hour — results. Relever entrée, résultat, affichage et état après retour.
- `C0584` **`dashboard.results.feeling`** — feeling — results. Relever entrée, résultat, affichage et état après retour.
- `C0585` **`dashboard.results.close`** — Fermer — results. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Progrès, séances, moniteurs et résultats sont cohérents et non dupliqués.

---

### S046 — Créer un mini-site depuis les outils modulaires

**Contexte :** Projet de site factice et domaine de test.

**Parcours utilisateur :**

1. Créer pages, menu, formulaire, prévisualiser, publier en bac à sable, annuler/revenir version précédente, préparer domaine sans acheter.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Projet de site factice et domaine de test. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Créer pages, menu, formulaire, prévisualiser, publier en bac à sable, annuler/revenir version précédente, préparer domaine sans acheter. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Prévisualisation égale au rendu, actions externes confirmées. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 30**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/site/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0586` **`site.goto`** — goto. Relever entrée, résultat, affichage et état après retour.
- `C0587` **`site.pages`** — pages. Relever entrée, résultat, affichage et état après retour.
- `C0588` **`site.state`** — Consulter l’état. Relever entrée, résultat, affichage et état après retour.
- `C0589` **`site.list`** — Lister. Relever entrée, résultat, affichage et état après retour.
- `C0590` **`site.settings`** — settings. Relever entrée, résultat, affichage et état après retour.
- `C0591` **`site.check`** — Cocher. Relever entrée, résultat, affichage et état après retour.
- `C0592` **`site.preview`** — Prévisualiser. Relever entrée, résultat, affichage et état après retour.
- `C0593` **`site.publish`** — Publier. Relever entrée, résultat, affichage et état après retour.
- `C0594` **`site.cancel`** — Annuler. Relever entrée, résultat, affichage et état après retour.
- `C0595` **`site.history`** — history. Relever entrée, résultat, affichage et état après retour.
- `C0596` **`site.rollback`** — rollback. Relever entrée, résultat, affichage et état après retour.
- `C0597` **`site.retire`** — retire. Relever entrée, résultat, affichage et état après retour.
- `C0598` **`site.menu`** — menu. Relever entrée, résultat, affichage et état après retour.
- `C0599` **`site.form`** — form. Relever entrée, résultat, affichage et état après retour.
- `C0600` **`site.domain_search`** — domain search. Relever entrée, résultat, affichage et état après retour.
- `C0601` **`site.domain_quote`** — domain quote. Relever entrée, résultat, affichage et état après retour.
- `C0602` **`site.domain_buy`** — domain buy. Relever entrée, résultat, affichage et état après retour.
- `C0603` **`site.domain_connect`** — domain connect. Relever entrée, résultat, affichage et état après retour.
- `C0604` **`site.domain_verify`** — domain verify. Relever entrée, résultat, affichage et état après retour.
- `C0605` **`site.domain_primary`** — domain primary. Relever entrée, résultat, affichage et état après retour.
- `C0606` **`site.domain_unlink`** — domain unlink. Relever entrée, résultat, affichage et état après retour.
- `C0607` **`site.domain_transfer`** — domain transfer. Relever entrée, résultat, affichage et état après retour.
- `C0608` **`site.domain_records`** — domain records. Relever entrée, résultat, affichage et état après retour.
- `C0609` **`site.domain_record_set`** — domain record set. Relever entrée, résultat, affichage et état après retour.
- `C0610` **`site.domain_renewal`** — domain renewal. Relever entrée, résultat, affichage et état après retour.
- `C0611` **`site.domain_leave`** — domain leave. Relever entrée, résultat, affichage et état après retour.
- `C0612` **`site.mail_list`** — mail list. Relever entrée, résultat, affichage et état après retour.
- `C0613` **`site.mail_add`** — mail add. Relever entrée, résultat, affichage et état après retour.
- `C0614` **`site.mail_remove`** — mail remove. Relever entrée, résultat, affichage et état après retour.
- `C0615` **`site.hosting`** — hosting. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Prévisualisation égale au rendu, actions externes confirmées.

---

### S047 — Fabriquer un QR code associé à un objet

**Contexte :** URL de test non sensible.

**Parcours utilisateur :**

1. Générer, afficher, conserver le QR dans le projet et relire avec appareil test.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** URL de test non sensible. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Générer, afficher, conserver le QR dans le projet et relire avec appareil test. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Le QR ouvre exactement la destination encodée. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 3**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/qr/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0616` **`qr.make`** — make. Relever entrée, résultat, affichage et état après retour.
- `C0617` **`qr.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.
- `C0618` **`qr.keep`** — keep. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Le QR ouvre exactement la destination encodée.

---

### S048 — Construire une interaction d'objet

**Contexte :** Projet avec rectangle et texte.

**Parcours utilisateur :**

1. Sélectionner l'objet source, choisir déclencheur, ajouter actions canoniques, enregistrer, exécuter puis éditer/supprimer.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Dans un projet, sélectionner un objet et ouvrir les outils d’interaction disponibles.
2. **Préparer :** Projet avec rectangle et texte. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Sélectionner l'objet source, choisir déclencheur, ajouter actions canoniques, enregistrer, exécuter puis éditer/supprimer. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Toucher et déclenchement par MCP conduisent au même résultat. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 5**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/interactions/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0619` **`interactions.list`** — Lister. Relever entrée, résultat, affichage et état après retour.
- `C0620` **`interactions.create`** — Créer. Relever entrée, résultat, affichage et état après retour.
- `C0621` **`interactions.update`** — Modifier. Relever entrée, résultat, affichage et état après retour.
- `C0622` **`interactions.remove`** — Retirer. Relever entrée, résultat, affichage et état après retour.
- `C0623` **`interactions.run`** — run. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Toucher et déclenchement par MCP conduisent au même résultat.

---

### S049 — Analyser et partager une vidéo d'entraînement

**Contexte :** Clip original de test avec 2 participants.

**Parcours utilisateur :**

1. Partager, lire le fil, répondre/commenter, voter, signaler, changer niveau, importer/transférer, retirer.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Clip original de test avec 2 participants. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Partager, lire le fil, répondre/commenter, voter, signaler, changer niveau, importer/transférer, retirer. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Ordre des vidéos et commentaires correct, droits et consentement respectés. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 17**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/video_train/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0624` **`video_train.share`** — Partager. Relever entrée, résultat, affichage et état après retour.
- `C0625` **`video_train.thread`** — thread. Relever entrée, résultat, affichage et état après retour.
- `C0626` **`video_train.open_thread`** — Ouvrir thread. Relever entrée, résultat, affichage et état après retour.
- `C0627` **`video_train.open_share`** — Ouvrir share. Relever entrée, résultat, affichage et état après retour.
- `C0628` **`video_train.play`** — Lire. Relever entrée, résultat, affichage et état après retour.
- `C0629` **`video_train.order`** — order. Relever entrée, résultat, affichage et état après retour.
- `C0630` **`video_train.reply`** — reply. Relever entrée, résultat, affichage et état après retour.
- `C0631` **`video_train.vote`** — vote. Relever entrée, résultat, affichage et état après retour.
- `C0632` **`video_train.report`** — report. Relever entrée, résultat, affichage et état après retour.
- `C0633` **`video_train.retire`** — retire. Relever entrée, résultat, affichage et état après retour.
- `C0634` **`video_train.replies`** — replies. Relever entrée, résultat, affichage et état après retour.
- `C0635` **`video_train.import`** — Importer. Relever entrée, résultat, affichage et état après retour.
- `C0636` **`video_train.forward`** — forward. Relever entrée, résultat, affichage et état après retour.
- `C0637` **`video_train.open_forward`** — Ouvrir forward. Relever entrée, résultat, affichage et état après retour.
- `C0638` **`video_train.reported`** — reported. Relever entrée, résultat, affichage et état après retour.
- `C0639` **`video_train.level`** — level. Relever entrée, résultat, affichage et état après retour.
- `C0640` **`video_train.dismiss`** — dismiss. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Ordre des vidéos et commentaires correct, droits et consentement respectés.

---

### S050 — Choisir quelles données de résultats transmettre

**Contexte :** Résultats entièrement fictifs.

**Parcours utilisateur :**

1. Ouvrir l'aperçu d'envoi, décocher nom ou mesure, voir prévisualisation, passer à la publication sans envoyer, fermer.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Résultats entièrement fictifs. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Ouvrir l'aperçu d'envoi, décocher nom ou mesure, voir prévisualisation, passer à la publication sans envoyer, fermer. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Aucune donnée décochée ne figure dans la prévisualisation sortante. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 5**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/results_send/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0641` **`results_send.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.
- `C0642` **`results_send.read`** — Lire. Relever entrée, résultat, affichage et état après retour.
- `C0643` **`results_send.pick`** — pick. Relever entrée, résultat, affichage et état après retour.
- `C0644` **`results_send.next`** — next. Relever entrée, résultat, affichage et état après retour.
- `C0645` **`results_send.close`** — Fermer. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Aucune donnée décochée ne figure dans la prévisualisation sortante.

---

### S051 — Importer puis révoquer des activités Strava

**Contexte :** Compte Strava de démonstration autorisé.

**Parcours utilisateur :**

1. Consulter configuration, connecter, importer dernières activités, relire journal, supprimer import test et déconnecter.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Compte Strava de démonstration autorisé. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Consulter configuration, connecter, importer dernières activités, relire journal, supprimer import test et déconnecter. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Aucun doublon, jetons non exposés, activités restent ou disparaissent selon action. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 8**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/strava/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0646` **`strava.get_state`** — Consulter l’état. Relever entrée, résultat, affichage et état après retour.
- `C0647` **`strava.connect`** — Connecter. Relever entrée, résultat, affichage et état après retour.
- `C0648` **`strava.await_connection`** — await connection. Relever entrée, résultat, affichage et état après retour.
- `C0649` **`strava.cancel_connection`** — Annuler connection. Relever entrée, résultat, affichage et état après retour.
- `C0650` **`strava.import`** — Importer. Relever entrée, résultat, affichage et état après retour.
- `C0651` **`strava.disconnect`** — Déconnecter. Relever entrée, résultat, affichage et état après retour.
- `C0652` **`strava.remove_imports`** — Retirer imports. Relever entrée, résultat, affichage et état après retour.
- `C0653` **`strava.remove_import`** — Retirer import. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Aucun doublon, jetons non exposés, activités restent ou disparaissent selon action.

---

### S052 — Synchroniser des données de santé permises

**Contexte :** Plateforme santé et compte de test.

**Parcours utilisateur :**

1. Voir état, choisir connexion, confirmer les permissions, synchroniser, déconnecter, ouvrir réglages.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Plateforme santé et compte de test. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Voir état, choisir connexion, confirmer les permissions, synchroniser, déconnecter, ouvrir réglages. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Consentement traçable et données non accessibles sans droit. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 5**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/health/health_sync_contracts.js); chaque ligne suivante est un cas indépendant :

- `C0654` **`health_sync.get_state`** — Consulter l’état. Relever entrée, résultat, affichage et état après retour.
- `C0655` **`health_sync.connect`** — Connecter. Relever entrée, résultat, affichage et état après retour.
- `C0656` **`health_sync.sync`** — sync. Relever entrée, résultat, affichage et état après retour.
- `C0657` **`health_sync.disconnect`** — Déconnecter. Relever entrée, résultat, affichage et état après retour.
- `C0658` **`health_sync.open_settings`** — Ouvrir les réglages. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Consentement traçable et données non accessibles sans droit.

---

### S053 — Publier un contenu à un contact ou flux de test

**Contexte :** Texte/media de test, destinataire de test.

**Parcours utilisateur :**

1. Sélectionner destinataires, choisir publication immédiate ou programmée, prévisualiser, modifier, envoyer ou annuler.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Depuis un contenu ou la rubrique de publication, choisir les destinataires et le mode de diffusion.
2. **Préparer :** Texte/media de test, destinataire de test. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Sélectionner destinataires, choisir publication immédiate ou programmée, prévisualiser, modifier, envoyer ou annuler. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Visibilité exacte, une publication programmée n'est pas envoyée prématurément. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 9**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/publish/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0659` **`publish.recipients`** — recipients. Relever entrée, résultat, affichage et état après retour.
- `C0660` **`publish.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.
- `C0661` **`publish.send`** — Envoyer. Relever entrée, résultat, affichage et état après retour.
- `C0662` **`publish.list`** — Lister. Relever entrée, résultat, affichage et état après retour.
- `C0663` **`publish.open_planned`** — Ouvrir planned. Relever entrée, résultat, affichage et état après retour.
- `C0664` **`publish.edit`** — Modifier. Relever entrée, résultat, affichage et état après retour.
- `C0665` **`publish.update`** — Modifier. Relever entrée, résultat, affichage et état après retour.
- `C0666` **`publish.send_now`** — Envoyer maintenant. Relever entrée, résultat, affichage et état après retour.
- `C0667` **`publish.cancel`** — Annuler. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Visibilité exacte, une publication programmée n'est pas envoyée prématurément.

---

### S054 — Créer une discussion collaborative

**Contexte :** Groupe de test avec 2 comptes.

**Parcours utilisateur :**

1. Créer, inviter, publier, répondre, consulter membres/posts, retirer message, quitter/supprimer groupe.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Groupe de test avec 2 comptes. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Créer, inviter, publier, répondre, consulter membres/posts, retirer message, quitter/supprimer groupe. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Messages et modération reflétés pour tous les membres, permissions respectées. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 11**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/forum/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0668` **`forum.list`** — Lister. Relever entrée, résultat, affichage et état après retour.
- `C0669` **`forum.create`** — Créer. Relever entrée, résultat, affichage et état après retour.
- `C0670` **`forum.invite`** — invite. Relever entrée, résultat, affichage et état après retour.
- `C0671` **`forum.respond`** — respond. Relever entrée, résultat, affichage et état après retour.
- `C0672` **`forum.leave`** — leave. Relever entrée, résultat, affichage et état après retour.
- `C0673` **`forum.delete`** — Supprimer. Relever entrée, résultat, affichage et état après retour.
- `C0674` **`forum.remove_post`** — Retirer post. Relever entrée, résultat, affichage et état après retour.
- `C0675` **`forum.members`** — members. Relever entrée, résultat, affichage et état après retour.
- `C0676` **`forum.posts`** — posts. Relever entrée, résultat, affichage et état après retour.
- `C0677` **`forum.post`** — post. Relever entrée, résultat, affichage et état après retour.
- `C0678` **`forum.open`** — Ouvrir. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Messages et modération reflétés pour tous les membres, permissions respectées.

---

### S055 — Limiter les droits d'un programme MCP

**Contexte :** Deux programmes de test avec niveaux d'accès différents.

**Parcours utilisateur :**

1. Afficher programmes, limiter une famille, initier demande d'autorisation, accepter/refuser localement, révoquer le programme.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Réglages › Mon matériel › Programmes et demandes de confirmation locales.
2. **Préparer :** Deux programmes de test avec niveaux d'accès différents. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Afficher programmes, limiter une famille, initier demande d'autorisation, accepter/refuser localement, révoquer le programme. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Un programme ne peut pas élargir lui-même ses droits. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 6**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/mcp_access/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0679` **`mcp_access.programs`** — programs. Relever entrée, résultat, affichage et état après retour.
- `C0680` **`mcp_access.program_families`** — program families. Relever entrée, résultat, affichage et état après retour.
- `C0681` **`mcp_access.program_withdraw`** — program withdraw. Relever entrée, résultat, affichage et état après retour.
- `C0682` **`mcp_access.confirmations`** — confirmations. Relever entrée, résultat, affichage et état après retour.
- `C0683` **`mcp_access.confirmation_open`** — confirmation open. Relever entrée, résultat, affichage et état après retour.
- `C0684` **`mcp_access.confirmation_decide`** — confirmation decide. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Un programme ne peut pas élargir lui-même ses droits.

---

### S056 — Échanger autour d'un objectif partagé

**Contexte :** Deux comptes adultes fictifs, zone approximative seulement.

**Parcours utilisateur :**

1. Activer réseau, rendre objectif visible, parcourir personnes, consulter carte, bloquer/signaler, quitter le réseau.

**Comment l’utiliser (après le scénario) :**

1. **Point d’entrée :** Rechercher l’outil réel correspondant dans la rubrique du projet ou du Dashboard ; vérifier son propriétaire dans la source avant de supposer un bouton dédié.
2. **Préparer :** Deux comptes adultes fictifs, zone approximative seulement. Utiliser uniquement des données, comptes, médias et services explicitement autorisés.
3. **Manipuler :** Activer réseau, rendre objectif visible, parcourir personnes, consulter carte, bloquer/signaler, quitter le réseau. Faire les gestes sur les vraies surfaces et les options natives.
4. **Contrôler :** Ni valeur médicale ni position précise ne deviennent visibles. Conserver la trace des valeurs avant/après et du retour au point de départ.
5. **Rejouer par un second canal :** si la commande est exposée au MCP/à la voix et autorisée, reproduire la même action, sinon inscrire la cause précise du `N/A`.

**Actions individuelles à couvrir : 10**. Les arguments et restrictions (accès santé, confirmation, réseau, achat) se lisent dans [le contrat](https://github.com/atomecorp/a/blob/main/atome/src/squirrel/objective_network/contracts.js); chaque ligne suivante est un cas indépendant :

- `C0685` **`objective_network.visibility_get`** — visibility get. Relever entrée, résultat, affichage et état après retour.
- `C0686` **`objective_network.visibility_set`** — visibility set. Relever entrée, résultat, affichage et état après retour.
- `C0687` **`objective_network.visibility_open`** — visibility open. Relever entrée, résultat, affichage et état après retour.
- `C0688` **`objective_network.people`** — people. Relever entrée, résultat, affichage et état après retour.
- `C0689` **`objective_network.people_open`** — people open. Relever entrée, résultat, affichage et état après retour.
- `C0690` **`objective_network.report`** — report. Relever entrée, résultat, affichage et état après retour.
- `C0691` **`objective_network.block`** — block. Relever entrée, résultat, affichage et état après retour.
- `C0692` **`objective_network.end_link`** — end link. Relever entrée, résultat, affichage et état après retour.
- `C0693` **`objective_network.network_get`** — network get. Relever entrée, résultat, affichage et état après retour.
- `C0694` **`objective_network.network_set`** — network set. Relever entrée, résultat, affichage et état après retour.

**Résultat attendu du scénario :** Ni valeur médicale ni position précise ne deviennent visibles.

---

## II. Scénarios des méthodes MCP et des ponts natifs

Méthodes directes non réduites à un bouton. Pour les accès de sécurité et les confirmations, le résultat correct est parfois **le refus de la commande** ; ne jamais valider un contournement.

### M01 — Créer et décrire des objets par commande

**Scénario :** Dans un projet fictif, émettre atome.create puis atome.describe; construire un cadre atome.box; comparer avec le même outil graphique.

**Comment l’utiliser (après le scénario) :**

1. Identifier la commande dans le registre MCP de l’appareil et le propriétaire listé dans le catalogue.
2. Employer un acteur autorisé et un jeu de données factices, en respectant les confirmations et droits.
3. Exécuter : Dans un projet fictif, émettre atome.create puis atome.describe; construire un cadre atome.box; comparer avec le même outil graphique.
4. Vérifier : Le protocole crée une instance canonique et la scène contient bien cet objet.
5. Si une surface native expose l’action, comparer la même action au clic/toucher/voix ; sinon noter qu’il s’agit d’un pont technique.

**Méthodes obligatoires (3) :**

- `C0713` `atome.create` — Créer.
- `C0714` `atome.box` — box.
- `C0715` `atome.describe` — describe.

**Résultat attendu :** Le protocole crée une instance canonique et la scène contient bien cet objet.

---

### M02 — Boîte de réception unifiée

**Scénario :** Indexer deux conversations fictives, les rechercher, ouvrir, préparer réponse et envoyer à un destinataire test.

**Comment l’utiliser (après le scénario) :**

1. Identifier la commande dans le registre MCP de l’appareil et le propriétaire listé dans le catalogue.
2. Employer un acteur autorisé et un jeu de données factices, en respectant les confirmations et droits.
3. Exécuter : Indexer deux conversations fictives, les rechercher, ouvrir, préparer réponse et envoyer à un destinataire test.
4. Vérifier : Une seule réponse est produite et le routage du destinataire reste exact.
5. Si une surface native expose l’action, comparer la même action au clic/toucher/voix ; sinon noter qu’il s’agit d’un pont technique.

**Méthodes obligatoires (5) :**

- `C0733` `communication.list` — Lister.
- `C0734` `communication.search` — Rechercher.
- `C0735` `communication.read` — Lire.
- `C0736` `communication.reply_draft` — reply draft.
- `C0737` `communication.send` — Envoyer.

**Résultat attendu :** Une seule réponse est produite et le routage du destinataire reste exact.

---

### M03 — Cycle de vie complet d’un courrier de test

**Scénario :** Rechercher, lire, marquer lu/non lu, préparer réponse, envoyer au compte test, archiver et supprimer.

**Comment l’utiliser (après le scénario) :**

1. Identifier la commande dans le registre MCP de l’appareil et le propriétaire listé dans le catalogue.
2. Employer un acteur autorisé et un jeu de données factices, en respectant les confirmations et droits.
3. Exécuter : Rechercher, lire, marquer lu/non lu, préparer réponse, envoyer au compte test, archiver et supprimer.
4. Vérifier : Le message est bien modifié, rien n’est envoyé sans commande et accord explicites.
5. Si une surface native expose l’action, comparer la même action au clic/toucher/voix ; sinon noter qu’il s’agit d’un pont technique.

**Méthodes obligatoires (11) :**

- `C0738` `mail.list` — Lister.
- `C0739` `mail.read` — Lire.
- `C0740` `mail.search` — Rechercher.
- `C0741` `mail.next_unread` — next unread.
- `C0742` `mail.summarize` — summarize.
- `C0743` `mail.reply_draft` — reply draft.
- `C0744` `mail.mark_read` — mark read.
- `C0745` `mail.mark_unread` — mark unread.
- `C0746` `mail.archive` — archive.
- `C0747` `mail.delete` — Supprimer.
- `C0748` `mail.send` — Envoyer.

**Résultat attendu :** Le message est bien modifié, rien n’est envoyé sans commande et accord explicites.

---

### M04 — Importer et entretenir un carnet de contacts

**Scénario :** Importer VCF, lire, créer, modifier, fusionner doublons, exporter VCF, tester arrêt synchronisation.

**Comment l’utiliser (après le scénario) :**

1. Identifier la commande dans le registre MCP de l’appareil et le propriétaire listé dans le catalogue.
2. Employer un acteur autorisé et un jeu de données factices, en respectant les confirmations et droits.
3. Exécuter : Importer VCF, lire, créer, modifier, fusionner doublons, exporter VCF, tester arrêt synchronisation.
4. Vérifier : Pas de doublons ni réécriture d’un contact d’une autre personne.
5. Si une surface native expose l’action, comparer la même action au clic/toucher/voix ; sinon noter qu’il s’agit d’un pont technique.

**Méthodes obligatoires (16) :**

- `C0749` `contacts.sources` — sources.
- `C0750` `contacts.list` — Lister.
- `C0751` `contacts.search` — Rechercher.
- `C0752` `contacts.read` — Lire.
- `C0753` `contacts.create` — Créer.
- `C0754` `contacts.update` — Modifier.
- `C0755` `contacts.delete` — Supprimer.
- `C0756` `contacts.import_icloud` — Importer icloud.
- `C0757` `contacts.push_icloud` — push icloud.
- `C0804` `contacts.select_personal` — Sélectionner personal.
- `C0805` `contacts.import_macos` — Importer macos.
- `C0806` `contacts.import_vcf` — Importer vcf.
- `C0807` `contacts.export_vcf` — Exporter vcf.
- `C0808` `contacts.stop_import` — Arrêter import.
- `C0809` `contacts.import_status` — Importer status.
- `C0810` `contacts.merge_duplicates` — merge duplicates.

**Résultat attendu :** Pas de doublons ni réécriture d’un contact d’une autre personne.

---

### M05 — Importer puis exporter des événements

**Scénario :** Lire agenda, créer/modifier événement, importer ICS / calendrier natif, partager en test, exporter ICS et retirer.

**Comment l’utiliser (après le scénario) :**

1. Identifier la commande dans le registre MCP de l’appareil et le propriétaire listé dans le catalogue.
2. Employer un acteur autorisé et un jeu de données factices, en respectant les confirmations et droits.
3. Exécuter : Lire agenda, créer/modifier événement, importer ICS / calendrier natif, partager en test, exporter ICS et retirer.
4. Vérifier : Heures, fuseaux, permissions et alarmes sont conservés.
5. Si une surface native expose l’action, comparer la même action au clic/toucher/voix ; sinon noter qu’il s’agit d’un pont technique.

**Méthodes obligatoires (15) :**

- `C0758` `calendar.sources` — sources.
- `C0759` `calendar.search` — Rechercher.
- `C0760` `calendar.today` — today.
- `C0761` `calendar.next` — next.
- `C0762` `calendar.create` — Créer.
- `C0763` `calendar.update` — Modifier.
- `C0764` `calendar.delete` — Supprimer.
- `C0765` `calendar.share` — Partager.
- `C0766` `calendar.export_webcal` — Exporter webcal.
- `C0811` `calendar.import_native` — Importer native.
- `C0812` `calendar.import_dav` — Importer dav.
- `C0813` `calendar.import_ics` — Importer ics.
- `C0814` `calendar.export_ics` — Exporter ics.
- `C0815` `calendar.stop_import` — Arrêter import.
- `C0816` `calendar.import_status` — Importer status.

**Résultat attendu :** Heures, fuseaux, permissions et alarmes sont conservés.

---

### M06 — Analyser des données financières de démonstration

**Scénario :** Lister comptes synthétiques, consulter dépenses, comparer périodes, marchands et paiements récurrents.

**Comment l’utiliser (après le scénario) :**

1. Identifier la commande dans le registre MCP de l’appareil et le propriétaire listé dans le catalogue.
2. Employer un acteur autorisé et un jeu de données factices, en respectant les confirmations et droits.
3. Exécuter : Lister comptes synthétiques, consulter dépenses, comparer périodes, marchands et paiements récurrents.
4. Vérifier : Aucune écriture ni divulgation de données bancaires externes.
5. Si une surface native expose l’action, comparer la même action au clic/toucher/voix ; sinon noter qu’il s’agit d’un pont technique.

**Méthodes obligatoires (9) :**

- `C0767` `bank.accounts` — accounts.
- `C0768` `bank.balance` — balance.
- `C0769` `bank.transactions` — transactions.
- `C0770` `bank.summary` — summary.
- `C0771` `bank.search_transactions` — Rechercher transactions.
- `C0772` `bank.find_payer` — find payer.
- `C0773` `bank.spending_by_period` — spending by period.
- `C0774` `bank.top_merchants` — top merchants.
- `C0775` `bank.recurring_payments` — recurring payments.

**Résultat attendu :** Aucune écriture ni divulgation de données bancaires externes.

---

### M07 — Calculer des conditions sans tableur

**Scénario :** Créer une liste et un ensemble de conditions, attacher une règle à un objet, évaluer, dupliquer et révoquer.

**Comment l’utiliser (après le scénario) :**

1. Identifier la commande dans le registre MCP de l’appareil et le propriétaire listé dans le catalogue.
2. Employer un acteur autorisé et un jeu de données factices, en respectant les confirmations et droits.
3. Exécuter : Créer une liste et un ensemble de conditions, attacher une règle à un objet, évaluer, dupliquer et révoquer.
4. Vérifier : Les règles ne s’appliquent qu’aux objets autorisés ; aucun doublon de source de vérité.
5. Si une surface native expose l’action, comparer la même action au clic/toucher/voix ; sinon noter qu’il s’agit d’un pont technique.

**Méthodes obligatoires (21) :**

- `C0776` `conditions.evaluate` — evaluate.
- `C0777` `conditions.properties.discover` — discover.
- `C0778` `conditions.query.once` — once.
- `C0779` `conditions.computed.list` — Lister.
- `C0780` `conditions.computed.save` — Enregistrer.
- `C0781` `conditions.computed.remove` — Retirer.
- `C0782` `conditions.lists.list` — Lister.
- `C0783` `conditions.lists.get` — Consulter.
- `C0784` `conditions.lists.create` — Créer.
- `C0785` `conditions.lists.resolve` — resolve.
- `C0786` `conditions.lists.freeze` — freeze.
- `C0787` `conditions.lists.remove` — Retirer.
- `C0788` `conditions.sets.list` — Lister.
- `C0789` `conditions.sets.get` — Consulter.
- `C0790` `conditions.sets.save` — Enregistrer.
- `C0791` `conditions.sets.duplicate` — duplicate.
- `C0792` `conditions.sets.remove` — Retirer.
- `C0793` `conditions.bindings.attach` — attach.
- `C0794` `conditions.bindings.detach` — detach.
- `C0795` `conditions.bindings.list` — Lister.
- `C0796` `conditions.bindings.evaluate` — evaluate.

**Résultat attendu :** Les règles ne s’appliquent qu’aux objets autorisés ; aucun doublon de source de vérité.

---

### M08 — Utiliser l’outil IA selon les droits

**Scénario :** Lister outils accessibles, invoquer un outil non destructif avec traçabilité, consulter journal des opérations.

**Comment l’utiliser (après le scénario) :**

1. Identifier la commande dans le registre MCP de l’appareil et le propriétaire listé dans le catalogue.
2. Employer un acteur autorisé et un jeu de données factices, en respectant les confirmations et droits.
3. Exécuter : Lister outils accessibles, invoquer un outil non destructif avec traçabilité, consulter journal des opérations.
4. Vérifier : Les autorisations et traces d’exécution correspondent à l’acteur.
5. Si une surface native expose l’action, comparer la même action au clic/toucher/voix ; sinon noter qu’il s’agit d’un pont technique.

**Méthodes obligatoires (3) :**

- `C0797` `ai.tools.list` — Lister.
- `C0798` `ai.tools.call` — call.
- `C0799` `ai.audit.list` — Lister.

**Résultat attendu :** Les autorisations et traces d’exécution correspondent à l’acteur.

---

### M09 — Exécuter un outil via le registre

**Scénario :** Lister, appeler et exécuter un petit lot de commandes non destructives et lire le journal.

**Comment l’utiliser (après le scénario) :**

1. Identifier la commande dans le registre MCP de l’appareil et le propriétaire listé dans le catalogue.
2. Employer un acteur autorisé et un jeu de données factices, en respectant les confirmations et droits.
3. Exécuter : Lister, appeler et exécuter un petit lot de commandes non destructives et lire le journal.
4. Vérifier : L’appel unique et le batch produisent des résultats concordants sans double effet.
5. Si une surface native expose l’action, comparer la même action au clic/toucher/voix ; sinon noter qu’il s’agit d’un pont technique.

**Méthodes obligatoires (4) :**

- `C0800` `runtime.tools.list` — Lister.
- `C0801` `runtime.tools.call` — call.
- `C0802` `runtime.tools.batch_call` — batch call.
- `C0803` `runtime.audit.list` — Lister.

**Résultat attendu :** L’appel unique et le batch produisent des résultats concordants sans double effet.

---

### M10 — Surveiller confirmations, accès et ressources

**Scénario :** Lister droits, ressources, demandes et événements, simuler une autorisation locale, lire le journal assaini.

**Comment l’utiliser (après le scénario) :**

1. Identifier la commande dans le registre MCP de l’appareil et le propriétaire listé dans le catalogue.
2. Employer un acteur autorisé et un jeu de données factices, en respectant les confirmations et droits.
3. Exécuter : Lister droits, ressources, demandes et événements, simuler une autorisation locale, lire le journal assaini.
4. Vérifier : Aucune extension automatique de droit, aucune clé dans la sortie.
5. Si une surface native expose l’action, comparer la même action au clic/toucher/voix ; sinon noter qu’il s’agit d’un pont technique.

**Méthodes obligatoires (17) :**

- `C0716` `mcp.tools.list` — Lister.
- `C0717` `mcp.resources.list` — Lister.
- `C0718` `mcp.resources.read` — Lire.
- `C0719` `mcp.prompts.list` — Lister.
- `C0720` `mcp.prompts.get` — Consulter.
- `C0721` `mcp.acl.list` — Lister.
- `C0722` `mcp.proposals.list` — Lister.
- `C0723` `mcp.proposals.read` — Lire.
- `C0724` `mcp.confirmations.list` — Lister.
- `C0725` `mcp.confirmations.read` — Lire.
- `C0726` `mcp.rate_limits.list` — Lister.
- `C0727` `mcp.security.journal.list` — Lister.
- `C0728` `mcp.toolchains.execute` — execute.
- `C0729` `mcp.operations.list` — Lister.
- `C0730` `mcp.operations.read` — Lire.
- `C0731` `mcp.operations.cancel` — Annuler.
- `C0732` `mcp.events.list` — Lister.

**Résultat attendu :** Aucune extension automatique de droit, aucune clé dans la sortie.

---

## III. Scénarios des gestes de base et d’édition

Chaque ligne du premier catalogue conserve son ID `F`; chaque sous-verbe explicitement mentionné est testé séparément.

### L01 — Créer et retrouver des projets

**Scénario :** préparer un projet de démonstration et effectuer dans l’ordre chacun des gestes ci-dessous, puis les rejouer sur un autre type d’objet compatible.

**Comment l’utiliser (après le scénario) :**

1. Choisir le vrai objet du projet ou la vraie rubrique eVe du domaine, et ouvrir ses outils natifs.
2. Exécuter chaque action listée, puis ses variantes séparées, avec un geste physique.
3. Observer la sélection, le focus, les états visuels, la persistance et la place du panneau dans la grille.
4. Revenir, refaire l’action à la voix si le chemin existe ; vérifier refus explicite des actions non autorisées.

**Liste des 32 entrées à parcourir :**

- `F001` Créer un projet.
- `F002` Ouvrir un projet existant.
- `F003` Renommer un projet.
- `F004` Supprimer un projet.
- `F005` Rechercher un projet par son nom.
- `F006` Filtrer par catégorie, type ou favoris.
- `F007` Ajouter un projet aux favoris ou l'en retirer.
- `F008` Ajouter un objet à un projet.
- `F009` Sélectionner un objet, plusieurs objets ou tous les objets concernés.
- `F010` Sélectionner par lasso.
- `F011` Désélectionner.
- `F012` Copier un objet.
- `F013` Couper un objet.
- `F014` Coller un objet.
- `F015` Dupliquer un objet.
- `F016` Copier et coller un groupe en conservant sa structure.
- `F017` Déplacer un objet, librement ou d'une distance donnée.
- `F018` Redimensionner un objet.
- `F019` Faire pivoter un objet.
- `F020` Modifier l'opacité d'un objet.
- `F021` Aligner plusieurs objets.
- `F022` Répartir plusieurs objets dans l'espace.
- `F023` Changer l'ordre de superposition (avant/arrière).
- `F024` Regrouper et dégrouper des objets.
- `F025` Supprimer, retrouver et restaurer des éléments supprimés.
- `F026` Annuler ou rétablir une action.
- `F027` Consulter l'historique des modifications.
- `F028` Zoomer, revenir à 100 % et adapter la vue.
- `F029` Passer d'une vue naturelle à une liste ou une matrice.
- `F030` Créer une matrice, régler ses lignes et colonnes, modifier une cellule.
- `F031` Ajouter et organiser les outils du projet.
- `F032` Rechercher un objet, un contenu ou un outil dans le Finder.

**Résultat attendu :** chaque sous-action est visible, réversible lorsqu’elle doit l’être, et n’altère pas les autres données.

---

### L02 — Sélectionner, dupliquer et organiser des objets

**Scénario :** préparer un projet de démonstration et effectuer dans l’ordre chacun des gestes ci-dessous, puis les rejouer sur un autre type d’objet compatible.

**Comment l’utiliser (après le scénario) :**

1. Choisir le vrai objet du projet ou la vraie rubrique eVe du domaine, et ouvrir ses outils natifs.
2. Exécuter chaque action listée, puis ses variantes séparées, avec un geste physique.
3. Observer la sélection, le focus, les états visuels, la persistance et la place du panneau dans la grille.
4. Revenir, refaire l’action à la voix si le chemin existe ; vérifier refus explicite des actions non autorisées.

**Liste des 25 entrées à parcourir :**

- `F033` Créer, ouvrir, sauvegarder et supprimer un texte.
- `F034` Saisir, insérer, remplacer et effacer des caractères.
- `F035` Sélectionner un mot, une phrase ou un passage.
- `F036` Copier, couper et coller une sélection textuelle.
- `F037` Mettre en gras, en italique, souligner ou barrer.
- `F038` Changer la couleur des caractères.
- `F039` Changer la police et la taille de police.
- `F040` Utiliser des titres H1 à H6, paragraphes, citations, légendes et notes.
- `F041` Aligner le texte à gauche, au centre ou à droite ; justifier.
- `F042` Créer des listes à puces, numérotées ou à cases à cocher.
- `F043` Cocher ou décocher un élément.
- `F044` Modifier retrait, indentation, interligne et espacement.
- `F045` Choisir le format de page (écran, A4, carré ou Story).
- `F046` Modifier l'orientation, les marges, les colonnes et l'arrière-plan.
- `F047` Insérer des séparateurs, images et dessins dans le document.
- `F048` Ajouter ou supprimer un lien hypertexte.
- `F049` Appliquer un modèle de document et ses styles.
- `F050` Séparer le texte en plusieurs objets en fonction de ses lignes.
- `F051` Utiliser le texte comme prompteur.
- `F052` Exporter en texte brut, PDF ou image lorsque le format est proposé.
- `F053` Partager le document ou une sélection.
- `F054` Dans un texte, transformer une ou plusieurs valeurs sélectionnées en cellules de calcul ancrées aux mots (distinct du module Matrix graphique).
- `F055` Assembler par sélection des opérations +, −, × et ÷, nommer les valeurs, composer une formule et déposer le résultat dans le texte.
- `F056` Recalculer automatiquement après modification d’un nombre ; montrer les mêmes cellules en vue Grille puis revenir à la vue Texte.
- `F057` Associer un script à un document et l'exécuter avec autorisation.

**Résultat attendu :** chaque sous-action est visible, réversible lorsqu’elle doit l’être, et n’altère pas les autres données.

---

### L03 — Écrire et mettre en forme un texte

**Scénario :** préparer un projet de démonstration et effectuer dans l’ordre chacun des gestes ci-dessous, puis les rejouer sur un autre type d’objet compatible.

**Comment l’utiliser (après le scénario) :**

1. Choisir le vrai objet du projet ou la vraie rubrique eVe du domaine, et ouvrir ses outils natifs.
2. Exécuter chaque action listée, puis ses variantes séparées, avec un geste physique.
3. Observer la sélection, le focus, les états visuels, la persistance et la place du panneau dans la grille.
4. Revenir, refaire l’action à la voix si le chemin existe ; vérifier refus explicite des actions non autorisées.

**Liste des 12 entrées à parcourir :**

- `F058` Dessiner au stylo, crayon, feutre, marqueur ou pinceau calligraphique.
- `F059` Tracer des lignes, flèches, rectangles, ellipses, étoiles et polygones.
- `F060` Régler la couleur de contour et de remplissage.
- `F061` Régler l'épaisseur d'un tracé.
- `F062` Appliquer des styles de traits, remplissage, arrondi, ombre, néon et encre.
- `F063` Modifier le rayon des coins.
- `F064` Régler les ombres et les effets de luminosité.
- `F065` Déplacer, agrandir, réduire, tourner ou dupliquer un élément dessiné.
- `F066` Effacer ou restaurer localement une partie du dessin.
- `F067` Créer, sélectionner, réordonner ou supprimer des couches SVG.
- `F068` Masquer un élément avec un masque compatible et retirer ce masque.
- `F069` Exporter un dessin en SVG.

**Résultat attendu :** chaque sous-action est visible, réversible lorsqu’elle doit l’être, et n’altère pas les autres données.

---

### L04 — Retoucher et transformer une image

**Scénario :** préparer un projet de démonstration et effectuer dans l’ordre chacun des gestes ci-dessous, puis les rejouer sur un autre type d’objet compatible.

**Comment l’utiliser (après le scénario) :**

1. Choisir le vrai objet du projet ou la vraie rubrique eVe du domaine, et ouvrir ses outils natifs.
2. Exécuter chaque action listée, puis ses variantes séparées, avec un geste physique.
3. Observer la sélection, le focus, les états visuels, la persistance et la place du panneau dans la grille.
4. Revenir, refaire l’action à la voix si le chemin existe ; vérifier refus explicite des actions non autorisées.

**Liste des 17 entrées à parcourir :**

- `F070` Importer une photo.
- `F071` Prendre une photo avec l'appareil photo.
- `F072` Régler luminosité et contraste.
- `F073` Ajuster ombres et hautes lumières.
- `F074` Modifier saturation et température colorimétrique.
- `F075` Ajuster netteté et vignettage.
- `F076` Appliquer une correction automatique.
- `F077` Choisir un rendu vif, doux, monochrome, sépia, chaud, froid, film ou nuit.
- `F078` Régler l'intensité d'un rendu.
- `F079` Recadrer librement ou à un ratio prédéfini (carré, 4:3, 16:9, 9:16).
- `F080` Tourner une photo de 90 degrés.
- `F081` Retourner horizontalement ou verticalement.
- `F082` Redresser l'horizon.
- `F083` Arrondir les coins d'une image.
- `F084` Effacer et restaurer des régions d'image.
- `F085` Conserver des réglages non destructifs.
- `F086` Exporter une photo retouchée.

**Résultat attendu :** chaque sous-action est visible, réversible lorsqu’elle doit l’être, et n’altère pas les autres données.

---

### L05 — Capturer puis relire un média

**Scénario :** préparer un projet de démonstration et effectuer dans l’ordre chacun des gestes ci-dessous, puis les rejouer sur un autre type d’objet compatible.

**Comment l’utiliser (après le scénario) :**

1. Choisir le vrai objet du projet ou la vraie rubrique eVe du domaine, et ouvrir ses outils natifs.
2. Exécuter chaque action listée, puis ses variantes séparées, avec un geste physique.
3. Observer la sélection, le focus, les états visuels, la persistance et la place du panneau dans la grille.
4. Revenir, refaire l’action à la voix si le chemin existe ; vérifier refus explicite des actions non autorisées.

**Liste des 15 entrées à parcourir :**

- `F087` Capturer du son, de la vidéo, de la photo, de la dictée ou du MIDI.
- `F088` Démarrer, arrêter et enregistrer une prise.
- `F089` Afficher ou masquer l'aperçu de capture.
- `F090` Changer de caméra.
- `F091` Capturer l'écran lorsque le système le permet.
- `F092` Parcourir les prises, aller à la précédente ou à la suivante.
- `F093` Lire, mettre en pause, arrêter et afficher en plein écran.
- `F094` Supprimer une ou plusieurs prises.
- `F095` Importer depuis des albums, la bibliothèque multimédia ou les fichiers.
- `F096` Filtrer les médias par son, photo et vidéo.
- `F097` Basculer entre affichage en tuiles et en liste.
- `F098` Sélectionner plusieurs fichiers.
- `F099` Créer, renommer ou supprimer une liste de médias.
- `F100` Ajouter ou retirer des médias d'une liste sans supprimer le fichier d'origine.
- `F101` Piloter une liste : lecture, pause, avancer, revenir en arrière, suivant, précédent.

**Résultat attendu :** chaque sous-action est visible, réversible lorsqu’elle doit l’être, et n’altère pas les autres données.

---

### L06 — Enregistrer et traiter une piste audio

**Scénario :** préparer un projet de démonstration et effectuer dans l’ordre chacun des gestes ci-dessous, puis les rejouer sur un autre type d’objet compatible.

**Comment l’utiliser (après le scénario) :**

1. Choisir le vrai objet du projet ou la vraie rubrique eVe du domaine, et ouvrir ses outils natifs.
2. Exécuter chaque action listée, puis ses variantes séparées, avec un geste physique.
3. Observer la sélection, le focus, les états visuels, la persistance et la place du panneau dans la grille.
4. Revenir, refaire l’action à la voix si le chemin existe ; vérifier refus explicite des actions non autorisées.

**Liste des 23 entrées à parcourir :**

- `F102` Lire, mettre en pause ou arrêter un son.
- `F103` Régler des points d'entrée et de sortie.
- `F104` Couper un clip en deux.
- `F105` Répéter un bloc ou une section en boucle.
- `F106` Déplacer les marqueurs de début et de fin d'une boucle.
- `F107` Étirer ou raccourcir la durée d'un passage.
- `F108` Réinitialiser une transformation temporelle.
- `F109` Copier, couper, coller ou supprimer un fragment audio.
- `F110` Rendre un fragment silencieux.
- `F111` Inverser la lecture d'un fragment.
- `F112` Appliquer un fondu d'entrée ou de sortie.
- `F113` Régler le gain et normaliser un échantillon.
- `F114` Détecter la fin silencieuse d'un échantillon.
- `F115` Analyser la possibilité d'une boucle et estimer une note fondamentale.
- `F116` Écouter isolément une tranche audio.
- `F117` Figer le résultat d'une modification.
- `F118` Ajouter un effet audio sur une entrée.
- `F119` Modifier les paramètres d'un effet.
- `F120` Activer ou désactiver temporairement un effet (bypass).
- `F121` Ajouter, déplacer, réordonner ou supprimer un module de la chaîne d'effets.
- `F122` Choisir et modifier la source d'entrée audio.
- `F123` Sauvegarder une chaîne d'effets personnelle.
- `F124` Créer, renommer, supprimer ou mettre en favori un preset.

**Résultat attendu :** chaque sous-action est visible, réversible lorsqu’elle doit l’être, et n’altère pas les autres données.

---

### L07 — Créer un sampler et éditer des notes MIDI

**Scénario :** préparer un projet de démonstration et effectuer dans l’ordre chacun des gestes ci-dessous, puis les rejouer sur un autre type d’objet compatible.

**Comment l’utiliser (après le scénario) :**

1. Choisir le vrai objet du projet ou la vraie rubrique eVe du domaine, et ouvrir ses outils natifs.
2. Exécuter chaque action listée, puis ses variantes séparées, avec un geste physique.
3. Observer la sélection, le focus, les états visuels, la persistance et la place du panneau dans la grille.
4. Revenir, refaire l’action à la voix si le chemin existe ; vérifier refus explicite des actions non autorisées.

**Liste des 18 entrées à parcourir :**

- `F125` Créer un instrument basé sur des échantillons.
- `F126` Assigner des samples à des notes et à des plages de vélocité.
- `F127` Créer des zones, couches et répartitions de samples.
- `F128` Définir des alternances de type round-robin.
- `F129` Définir des modes polyphonique, monophonique et legato.
- `F130` Régler attaque, déclin, maintien et relâchement d'une enveloppe.
- `F131` Régler gain et polyphonie.
- `F132` Choisir lecture normale, inversée, en boucle ou ping-pong.
- `F133` Segmenter un sample avec marqueurs, transitions et fondus.
- `F134` Détecter automatiquement les attaques audio.
- `F135` Découper un échantillon en parties égales, temps, mesures ou subdivisions.
- `F136` Poser, déplacer, verrouiller ou supprimer un point de découpage.
- `F137` Aligner les découpages sur un tempo ou un passage par zéro.
- `F138` Affecter les tranches à des notes, touches ou cellules.
- `F139` Convertir un contenu audio en représentation MIDI selon les outils disponibles.
- `F140` Enregistrer des événements MIDI en précisant entrée et canal.
- `F141` Éditer les notes d'un piano roll et d'une grille de pas.
- `F142` Importer des banques de samples et exporter des descriptions d'instrument SFZ.

**Résultat attendu :** chaque sous-action est visible, réversible lorsqu’elle doit l’être, et n’altère pas les autres données.

---

### L08 — Assembler une timeline multipiste

**Scénario :** préparer un projet de démonstration et effectuer dans l’ordre chacun des gestes ci-dessous, puis les rejouer sur un autre type d’objet compatible.

**Comment l’utiliser (après le scénario) :**

1. Choisir le vrai objet du projet ou la vraie rubrique eVe du domaine, et ouvrir ses outils natifs.
2. Exécuter chaque action listée, puis ses variantes séparées, avec un geste physique.
3. Observer la sélection, le focus, les états visuels, la persistance et la place du panneau dans la grille.
4. Revenir, refaire l’action à la voix si le chemin existe ; vérifier refus explicite des actions non autorisées.

**Liste des 15 entrées à parcourir :**

- `F143` Démarrer, suspendre, reprendre ou arrêter une lecture de projet.
- `F144` Recommencer à partir d'une position de lecture choisie.
- `F145` Répéter un passage.
- `F146` Créer, poser et déplacer des clips.
- `F147` Organiser des pistes et des scènes.
- `F148` Déplacer la tête de lecture.
- `F149` Enregistrer une prise sur la timeline.
- `F150` Modifier début, fin, durée et boucle d'un clip.
- `F151` Découper, étirer ou replacer un clip.
- `F152` Ajuster la hauteur d'une piste.
- `F153` Éditer des notes MIDI, des pas et des clips texte.
- `F154` Modifier les paramètres du mixage.
- `F155` Mettre un effet en bypass ou le réactiver.
- `F156` Créer ou modifier des points et courbes d'automation.
- `F157` Annuler, rétablir ou réaligner une édition.

**Résultat attendu :** chaque sous-action est visible, réversible lorsqu’elle doit l’être, et n’altère pas les autres données.

---

### L09 — Préparer un agenda avec alarmes

**Scénario :** préparer un projet de démonstration et effectuer dans l’ordre chacun des gestes ci-dessous, puis les rejouer sur un autre type d’objet compatible.

**Comment l’utiliser (après le scénario) :**

1. Choisir le vrai objet du projet ou la vraie rubrique eVe du domaine, et ouvrir ses outils natifs.
2. Exécuter chaque action listée, puis ses variantes séparées, avec un geste physique.
3. Observer la sélection, le focus, les états visuels, la persistance et la place du panneau dans la grille.
4. Revenir, refaire l’action à la voix si le chemin existe ; vérifier refus explicite des actions non autorisées.

**Liste des 123 entrées à parcourir :**

- `F158` Créer, éditer ou supprimer un événement ou une tâche.
- `F159` Définir titre, description, lieu, date et heure.
- `F160` Définir un événement sur la journée entière.
- `F161` Choisir un fuseau horaire et une couleur.
- `F162` Créer plusieurs calendriers ; en afficher ou masquer certains.
- `F163` Programmer une alarme à une date exacte ou après un délai.
- `F164` Programmer une alarme avant ou après le début ou la fin d'un événement.
- `F165` Ajouter plusieurs alarmes à un même événement.
- `F166` Utiliser une sonnerie intégrée ou un fichier sonore personnel.
- `F167` Répéter quotidiennement, hebdomadairement, tous les quinze jours, mensuellement ou annuellement.
- `F168` Choisir une fréquence personnalisée, des jours particuliers et une fin de récurrence.
- `F169` Annuler une alarme sans effacer l'événement.
- `F170` Faire démarrer une musique, un média, un projet ou un outil à l'heure définie.
- `F171` Préparer l'ouverture d'une visioconférence à l'heure d'une alarme.
- `F172` Partager un calendrier et exporter des événements ICS ou webcal.
- `F173` Renseigner un profil médical, les antécédents et les allergies.
- `F174` Enregistrer les vaccinations, consultations, examens, ordonnances et suivis.
- `F175` Ajouter, corriger, supprimer et conserver des versions d'une entrée.
- `F176` Importer un compte rendu ou un résultat d'examen.
- `F177` Vérifier les valeurs extraites avant intégration.
- `F178` Consulter une série de résultats dans le temps.
- `F179` Exporter une série en CSV.
- `F180` Enregistrer médicaments, compléments, cosmétiques et dispositifs.
- `F181` Préciser dose, horaire, fréquence, période et prise « si besoin ».
- `F182` Marquer une prise effectuée, reportée, oubliée ou interrompue.
- `F183` Consulter l'historique des prises.
- `F184` Programmer, suspendre et reprendre des rappels.
- `F185` Suivre le stock et la date d'épuisement prévisible.
- `F186` Rechercher des médicaments dans des données officielles françaises.
- `F187` Scanner une boîte de médicament.
- `F188` Importer un protocole proposé, examiner ses lignes et accepter, refuser, reporter ou corriger.
- `F189` Créer un modèle de protocole à partager.
- `F190` Enregistrer ressenti, humeur, énergie et fatigue.
- `F191` Sélectionner des capteurs et autorisations pour la synchronisation santé.
- `F192` Consulter des mesures de santé et leur évolution via les moniteurs et historiques prévus.
- `F193` Parcourir des exercices de force, cardio, mobilité et gainage.
- `F194` Choisir un programme ou un niveau.
- `F195` Définir séries, répétitions, charges, temps de maintien et repos.
- `F196` Planifier des séances sur la semaine.
- `F197` Définir une progression de charge, durée ou répétitions.
- `F198` Lancer, suspendre, reprendre ou terminer une séance.
- `F199` Passer une étape et corriger une série.
- `F200` Consulter le journal de séances et des graphiques d'évolution.
- `F201` Mettre des exercices et groupes musculaires en favoris.
- `F202` Visualiser les groupes musculaires sollicités.
- `F203` Enregistrer une vidéo pendant un entraînement.
- `F204` Configurer des cycles de respiration, durées et sons.
- `F205` Construire des programmes d'objectifs avec des étapes réutilisables.
- `F206` Suivre la réalisation des étapes d'un programme.
- `F207` Rechercher un aliment par nom ou code-barres.
- `F208` Scanner un code-barres avec la caméra.
- `F209` Lire les ingrédients, allergènes et valeurs nutritionnelles disponibles.
- `F210` Consulter Nutri-Score et classe NOVA lorsque les données sont présentes.
- `F211` Repérer des substances ou additifs signalés.
- `F212` Afficher des suggestions d'alternatives.
- `F213` Créer une liste de courses.
- `F214` Ajouter, modifier, cocher et décocher un produit.
- `F215` Ajuster quantités et informations d'un article.
- `F216` Supprimer un article ou vider les articles déjà cochés.
- `F217` Partager une liste et gérer sa réception.
- `F218` Accepter une liste reçue ou en conserver une copie indépendante.
- `F219` Trouver un contact et l'inviter.
- `F220` Ouvrir une conversation et envoyer un message.
- `F221` Voir notifications et messages non lus.
- `F222` Préparer ou rejoindre une visioconférence.
- `F223` Envoyer un objet, une création ou une sélection d'objets.
- `F224` Consulter, accepter ou refuser un partage reçu.
- `F225` Conserver une copie indépendante d'une liste reçue.
- `F226` Révoquer un partage.
- `F227` Donner des droits de lecture, modification, création ou suppression selon le contexte.
- `F228` Transférer ou présenter un objet sur une surface autorisée.
- `F229` Demander un accès distant, visualiser un aperçu et transmettre certaines commandes.
- `F230` Rechercher une destination.
- `F231` Construire, conserver, dupliquer ou supprimer un itinéraire.
- `F232` Ajouter un trajet aux favoris.
- `F233` Lancer ou arrêter une navigation guidée.
- `F234` Partager sa position avec un contact autorisé.
- `F235` Ouvrir des pages Web et gérer des favoris.
- `F236` Rechercher et lire des vidéos via les services configurés.
- `F237` Rechercher films ou séries, conserver favoris et historique.
- `F238` Lire une bande-annonce ou ouvrir un service de visionnage.
- `F239` Ouvrir des livres EPUB/PDF non protégés et des livres audio.
- `F240` Tourner les pages et reprendre une lecture à sa dernière position.
- `F241` Avancer ou reculer dans un livre audio.
- `F242` Rechercher de la musique et piloter lecture, pause, suivant et précédent selon le service.
- `F243` Consulter ou utiliser des playlists via les services connectés.
- `F244` Commander des outils existants à la voix.
- `F245` Dictée, reconnaissance vocale, synthèse vocale et activation par mot-clé selon moteur et plateforme.
- `F246` Transcrire un enregistrement audio.
- `F247` Traduire un texte ou une transcription.
- `F248` Générer une parole synthétique.
- `F249` Générer ou modifier une image avec un fournisseur IA configuré.
- `F250` Demander une génération audio ou vidéo à un fournisseur configuré.
- `F251` Intégrer les contenus produits dans un projet.
- `F252` Créer un menu, un formulaire, un lien ou un code QR.
- `F253` Créer des profils de contexte et leur affecter des contenus.
- `F254` Changer et personnaliser les profils.
- `F255` Associer à un objet une action déclenchée par activation.
- `F256` Associer à un objet une action déclenchée par appui prolongé.
- `F257` Réagir à une saisie, un changement de valeur, un événement de lecture/transport ou un nouvel élément.
- `F258` Déclencher manuellement une interaction.
- `F259` Choisir des objets précis comme cibles.
- `F260` Cibler automatiquement les objets qui satisfont des conditions.
- `F261` Limiter la recherche de cibles à un projet, un parent ou certains types.
- `F262` Combiner des conditions logiques ET, OU et NON.
- `F263` Exécuter plusieurs actions d'outils en cascade, dans l'ordre.
- `F264` Donner à chaque action des paramètres fixes ou issus de la donnée déclenchante.
- `F265` Activer ou désactiver une interaction.
- `F266` Autoriser une interaction selon le mode de travail (édition, consultation, performance).
- `F267` Réutiliser les **vrais outils** du projet, sans moteur d'action parallèle.
- `F268` Combiner une sélection avec une suite de transformations, l'ouverture d'un média, un déclenchement temporel ou une modification d'objet, lorsque les outils concernés sont disponibles.
- `F269` Changer le fond d'un objet ou d'une surface.
- `F270` Changer sa couleur.
- `F271` Ajuster largeur et hauteur.
- `F272` Régler les arrondis.
- `F273` Activer et ajuster une ombre.
- `F274` Appliquer un effet de fond/verre dépoli.
- `F275` Changer la police du texte.
- `F276` Organiser les calques et l'ordre de superposition.
- `F277` Affecter des étiquettes ou des tags.
- `F278` Ouvrir les panneaux des outils depuis le ruban.
- `F279` Régler les matrices et leurs cellules.
- `F280` Importer des médias à partir du panneau prévu.

**Résultat attendu :** chaque sous-action est visible, réversible lorsqu’elle doit l’être, et n’altère pas les autres données.

---

### L10 — Constituer un carnet de santé

**Scénario :** préparer un projet de démonstration et effectuer dans l’ordre chacun des gestes ci-dessous, puis les rejouer sur un autre type d’objet compatible.

**Comment l’utiliser (après le scénario) :**

1. Choisir le vrai objet du projet ou la vraie rubrique eVe du domaine, et ouvrir ses outils natifs.
2. Exécuter chaque action listée, puis ses variantes séparées, avec un geste physique.
3. Observer la sélection, le focus, les états visuels, la persistance et la place du panneau dans la grille.
4. Revenir, refaire l’action à la voix si le chemin existe ; vérifier refus explicite des actions non autorisées.

**Liste des 0 entrées à parcourir :**


**Résultat attendu :** chaque sous-action est visible, réversible lorsqu’elle doit l’être, et n’altère pas les autres données.

---

### L11 — Créer un programme sportif

**Scénario :** préparer un projet de démonstration et effectuer dans l’ordre chacun des gestes ci-dessous, puis les rejouer sur un autre type d’objet compatible.

**Comment l’utiliser (après le scénario) :**

1. Choisir le vrai objet du projet ou la vraie rubrique eVe du domaine, et ouvrir ses outils natifs.
2. Exécuter chaque action listée, puis ses variantes séparées, avec un geste physique.
3. Observer la sélection, le focus, les états visuels, la persistance et la place du panneau dans la grille.
4. Revenir, refaire l’action à la voix si le chemin existe ; vérifier refus explicite des actions non autorisées.

**Liste des 0 entrées à parcourir :**


**Résultat attendu :** chaque sous-action est visible, réversible lorsqu’elle doit l’être, et n’altère pas les autres données.

---

### L12 — Analyser des produits et préparer les courses

**Scénario :** préparer un projet de démonstration et effectuer dans l’ordre chacun des gestes ci-dessous, puis les rejouer sur un autre type d’objet compatible.

**Comment l’utiliser (après le scénario) :**

1. Choisir le vrai objet du projet ou la vraie rubrique eVe du domaine, et ouvrir ses outils natifs.
2. Exécuter chaque action listée, puis ses variantes séparées, avec un geste physique.
3. Observer la sélection, le focus, les états visuels, la persistance et la place du panneau dans la grille.
4. Revenir, refaire l’action à la voix si le chemin existe ; vérifier refus explicite des actions non autorisées.

**Liste des 0 entrées à parcourir :**


**Résultat attendu :** chaque sous-action est visible, réversible lorsqu’elle doit l’être, et n’altère pas les autres données.

---

### L13 — Contacter, inviter et partager

**Scénario :** préparer un projet de démonstration et effectuer dans l’ordre chacun des gestes ci-dessous, puis les rejouer sur un autre type d’objet compatible.

**Comment l’utiliser (après le scénario) :**

1. Choisir le vrai objet du projet ou la vraie rubrique eVe du domaine, et ouvrir ses outils natifs.
2. Exécuter chaque action listée, puis ses variantes séparées, avec un geste physique.
3. Observer la sélection, le focus, les états visuels, la persistance et la place du panneau dans la grille.
4. Revenir, refaire l’action à la voix si le chemin existe ; vérifier refus explicite des actions non autorisées.

**Liste des 0 entrées à parcourir :**


**Résultat attendu :** chaque sous-action est visible, réversible lorsqu’elle doit l’être, et n’altère pas les autres données.

---

### L14 — Se déplacer, lire et naviguer

**Scénario :** préparer un projet de démonstration et effectuer dans l’ordre chacun des gestes ci-dessous, puis les rejouer sur un autre type d’objet compatible.

**Comment l’utiliser (après le scénario) :**

1. Choisir le vrai objet du projet ou la vraie rubrique eVe du domaine, et ouvrir ses outils natifs.
2. Exécuter chaque action listée, puis ses variantes séparées, avec un geste physique.
3. Observer la sélection, le focus, les états visuels, la persistance et la place du panneau dans la grille.
4. Revenir, refaire l’action à la voix si le chemin existe ; vérifier refus explicite des actions non autorisées.

**Liste des 0 entrées à parcourir :**


**Résultat attendu :** chaque sous-action est visible, réversible lorsqu’elle doit l’être, et n’altère pas les autres données.

---

### L15 — Commander les outils avec eVe

**Scénario :** préparer un projet de démonstration et effectuer dans l’ordre chacun des gestes ci-dessous, puis les rejouer sur un autre type d’objet compatible.

**Comment l’utiliser (après le scénario) :**

1. Choisir le vrai objet du projet ou la vraie rubrique eVe du domaine, et ouvrir ses outils natifs.
2. Exécuter chaque action listée, puis ses variantes séparées, avec un geste physique.
3. Observer la sélection, le focus, les états visuels, la persistance et la place du panneau dans la grille.
4. Revenir, refaire l’action à la voix si le chemin existe ; vérifier refus explicite des actions non autorisées.

**Liste des 0 entrées à parcourir :**


**Résultat attendu :** chaque sous-action est visible, réversible lorsqu’elle doit l’être, et n’altère pas les autres données.

---

### L16 — Assembler les interactions et les automatismes

**Scénario :** préparer un projet de démonstration et effectuer dans l’ordre chacun des gestes ci-dessous, puis les rejouer sur un autre type d’objet compatible.

**Comment l’utiliser (après le scénario) :**

1. Choisir le vrai objet du projet ou la vraie rubrique eVe du domaine, et ouvrir ses outils natifs.
2. Exécuter chaque action listée, puis ses variantes séparées, avec un geste physique.
3. Observer la sélection, le focus, les états visuels, la persistance et la place du panneau dans la grille.
4. Revenir, refaire l’action à la voix si le chemin existe ; vérifier refus explicite des actions non autorisées.

**Liste des 0 entrées à parcourir :**


**Résultat attendu :** chaque sous-action est visible, réversible lorsqu’elle doit l’être, et n’altère pas les autres données.

---

### L17 — Régler l’apparence de tous les outils

**Scénario :** préparer un projet de démonstration et effectuer dans l’ordre chacun des gestes ci-dessous, puis les rejouer sur un autre type d’objet compatible.

**Comment l’utiliser (après le scénario) :**

1. Choisir le vrai objet du projet ou la vraie rubrique eVe du domaine, et ouvrir ses outils natifs.
2. Exécuter chaque action listée, puis ses variantes séparées, avec un geste physique.
3. Observer la sélection, le focus, les états visuels, la persistance et la place du panneau dans la grille.
4. Revenir, refaire l’action à la voix si le chemin existe ; vérifier refus explicite des actions non autorisées.

**Liste des 0 entrées à parcourir :**


**Résultat attendu :** chaque sous-action est visible, réversible lorsqu’elle doit l’être, et n’altère pas les autres données.

---

## IV. Scénarios combinatoires réels (plusieurs domaines par parcours)

Ces scénarios sont conçus pour faire apparaître les régressions de composition entre outils, y compris les méthodes de données et d’interface. Tous sont à exécuter sur les plateformes applicables, dans chaque mode d’interaction disponible.

### X01 — Reportage géolocalisé avec photo, vidéo et voix

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `projects`, `captures`, `gps`, `creation`, `media_import`, `media_lists`, `publish`, `share`.

**Actions :**

1. Créer projet.
2. enregistrer deux photos, une vidéo et une narration.
3. positionner la carte.
4. légender le texte.
5. prévisualiser et préparer le partage sans publication réelle.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Créer projet ; enregistrer deux photos, une vidéo et une narration ; positionner la carte ; légender le texte ; prévisualiser et préparer le partage sans publication réelle.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Montage lisible, fichiers persistants, lieux justes, médias sans saut ni perte. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Montage lisible, fichiers persistants, lieux justes, médias sans saut ni perte.

---

### X02 — Morceau de musique multipiste et livraison

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `projects`, `audio_fx`, `captures`, `media_lists`, `music`, `share`.

**Actions :**

1. Créer projet musique.
2. importer samples.
3. construire un sampler.
4. jouer au MIDI.
5. capturer son.
6. mixer effets.
7. exporter.
8. partager à un compte de test.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Créer projet musique ; importer samples ; construire un sampler ; jouer au MIDI ; capturer son ; mixer effets ; exporter ; partager à un compte de test.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Horloge et transitoires cohérents, aucun drop audio, fichier conforme. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Horloge et transitoires cohérents, aucun drop audio, fichier conforme.

---

### X03 — Document calculable sans tableur classique

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `creation`, `calc`, `document`, `script`.

**Actions :**

1. Créer un texte «12 bananes, 14 pommes, total».
2. toucher Calc.
3. sélectionner les nombres.
4. +.
5. =.
6. déposer sur total.
7. remplacer 12 par 20.
8. utiliser SOMME et SI.
9. vérifier version Grille et le texte.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Créer un texte «12 bananes, 14 pommes, total» ; toucher Calc ; sélectionner les nombres ; + ; = ; déposer sur total ; remplacer 12 par 20 ; utiliser SOMME et SI ; vérifier version Grille et le texte.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Résultat recalculé 26 puis 34, même objet texte, formules traçables. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Résultat recalculé 26 puis 34, même objet texte, formules traçables.

---

### X04 — Feuille de calcul importée depuis Excel

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `media_import`, `calc`, `creation`, `document`.

**Actions :**

1. Importer XLSX avec une somme, ouvrir le texte résultant, modifier valeur puis vérifier résultat en grille et revenir au texte.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Importer XLSX avec une somme, ouvrir le texte résultant, modifier valeur puis vérifier résultat en grille et revenir au texte.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Formules compatibles exactes et aucune perte de la correspondance texte-cellule. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Formules compatibles exactes et aucune perte de la correspondance texte-cellule.

---

### X05 — Budget de production lié à un document

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `projects`, `calc`, `document`, `dashboard_progression`.

**Actions :**

1. Créer objectif de projet.
2. définir temps et budget.
3. rédiger coûts en euros.
4. calculer somme.
5. éditer le texte et vérifier recalcul.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Créer objectif de projet ; définir temps et budget ; rédiger coûts en euros ; calculer somme ; éditer le texte et vérifier recalcul.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Montants conservés et cohérents après fermeture. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Montants conservés et cohérents après fermeture.

---

### X06 — Graphisme vectoriel pour une affiche

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `creation`, `projects`, `media_import`.

**Actions :**

1. Importer photo.
2. dessiner formes.
3. ombres et contours.
4. transformer, grouper.
5. créer titre, aligner.
6. exporter.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Importer photo ; dessiner formes ; ombres et contours ; transformer, grouper ; créer titre, aligner ; exporter.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Aucun objet masqué ou mauvais ordre de superposition. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Aucun objet masqué ou mauvais ordre de superposition.

---

### X07 — Pack réseaux sociaux depuis une vidéo

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `captures`, `creation`, `publish`, `social`, `video_train`.

**Actions :**

1. Capturer clip.
2. cadrer.
3. ajouter texte.
4. créer variantes.
5. préparer posts et destinataires sans publier réellement.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Capturer clip ; cadrer ; ajouter texte ; créer variantes ; préparer posts et destinataires sans publier réellement.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Aperçus et versions correctement dissociés, aucun envoi non demandé. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Aperçus et versions correctement dissociés, aucun envoi non demandé.

---

### X08 — Concert avec prompteur et déclencheurs

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `projects`, `creation`, `captures`, `audio_fx`, `interactions`.

**Actions :**

1. Composer scène.
2. écrire texte.
3. ouvrir prompteur.
4. créer actions sur objets.
5. déclencher lecture audio et changement de page.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Composer scène ; écrire texte ; ouvrir prompteur ; créer actions sur objets ; déclencher lecture audio et changement de page.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Le texte défile correctement, commandes de scène synchronisées. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Le texte défile correctement, commandes de scène synchronisées.

---

### X09 — Visite d’un lieu et agenda

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `gps`, `shows`, `events`, `calendar`.

**Actions :**

1. Chercher musée.
2. itinéraire.
3. enregistrer visite dans agenda.
4. alarme.
5. trajet partagé avec autorisation.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Chercher musée ; itinéraire ; enregistrer visite dans agenda ; alarme ; trajet partagé avec autorisation.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Date, lieu, alarme et navigation identiques sur appareils. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Date, lieu, alarme et navigation identiques sur appareils.

---

### X10 — Suivi sportif photo et journal

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `training`, `captures`, `beauty`, `dashboard_progression`.

**Actions :**

1. Créer objectif.
2. séance vélo.
3. enregistrer temps.
4. faire photo d’évolution.
5. consulter journal et objectifs.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Créer objectif ; séance vélo ; enregistrer temps ; faire photo d’évolution ; consulter journal et objectifs.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Aucune confusion entre photo de suivi et vidéo de séance. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Aucune confusion entre photo de suivi et vidéo de séance.

---

### X11 — Suivi santé et compléments fictifs

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `health_record`, `health_protocol`, `health_products`, `sensors`, `health_sync`.

**Actions :**

1. Importer bilan synthétique.
2. contrôler unités.
3. configurer protocole fictif.
4. suivre prises et rappels.
5. vérifier permissions de synchronisation.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Importer bilan synthétique ; contrôler unités ; configurer protocole fictif ; suivre prises et rappels ; vérifier permissions de synchronisation.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Aucune activation médicale sans décision humaine ; données isolées. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Aucune activation médicale sans décision humaine ; données isolées.

---

### X12 — Compte rendu de santé à partager sélectivement

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `health_record`, `results_send`, `publish`, `share`.

**Actions :**

1. Constituer résultats fictifs.
2. prévisualiser l’envoi.
3. décocher une mesure et le nom.
4. choisir destinataire de test.
5. annuler.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Constituer résultats fictifs ; prévisualiser l’envoi ; décocher une mesure et le nom ; choisir destinataire de test ; annuler.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Contenu non coché absent des données sortantes. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Contenu non coché absent des données sortantes.

---

### X13 — Gestion des courses avec régime fictif

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `shopping`, `food`, `food_advice`, `share`.

**Actions :**

1. Scanner produit, consulter allergies, alternatives.
2. modifier quantité/prix.
3. partager liste.
4. cocher et révoquer.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Scanner produit, consulter allergies, alternatives ; modifier quantité/prix ; partager liste ; cocher et révoquer.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Informations fiables selon source ; droits respectés. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Informations fiables selon source ; droits respectés.

---

### X14 — Carnet de bord voyage augmenté

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `gps`, `captures`, `creation`, `calendar`, `calc`.

**Actions :**

1. Créer trajet.
2. photos.
3. texte.
4. associer dépenses.
5. additionner.
6. créer rendez-vous.
7. importer vers autre appareil.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Créer trajet ; photos ; texte ; associer dépenses ; additionner ; créer rendez-vous ; importer vers autre appareil.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Traces conservées, total correct, permissions localisation conformes. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Traces conservées, total correct, permissions localisation conformes.

---

### X15 — Club créatif avec forum, messages et vidéo

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `forum`, `communication`, `video_train`, `share`, `publish`.

**Actions :**

1. Créer discussion.
2. inviter deux comptes test.
3. publier clip.
4. commenter.
5. retirer, bloquer et révoquer partage.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Créer discussion ; inviter deux comptes test ; publier clip ; commenter ; retirer, bloquer et révoquer partage.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Modération et notifications cohérentes ; aucune fuite inter-comptes. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Modération et notifications cohérentes ; aucune fuite inter-comptes.

---

### X16 — Répertoire de contacts et courrier

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `contacts`, `mail`, `calendar`, `communication`.

**Actions :**

1. Importer VCF.
2. fusionner doublon.
3. trouver contact.
4. créer événement et mail.
5. répondre depuis la boîte unifiée.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Importer VCF ; fusionner doublon ; trouver contact ; créer événement et mail ; répondre depuis la boîte unifiée.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Un seul contact canonique, aucune réponse à une mauvaise personne. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Un seul contact canonique, aucune réponse à une mauvaise personne.

---

### X17 — Séance d’entraînement enrichie de données de capteurs

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `training`, `sensors`, `body_data`, `brick_session`.

**Actions :**

1. Choisir discipline.
2. régler source capteur.
3. préparer séance.
4. noter effort.
5. suspendre capteur et vérifier refus.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Choisir discipline ; régler source capteur ; préparer séance ; noter effort ; suspendre capteur et vérifier refus.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** L’absence de permission n’est pas masquée par des chiffres inventés. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** L’absence de permission n’est pas masquée par des chiffres inventés.

---

### X18 — Tableau de bord personnel modulaire

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `dashboard_progression`, `profiles`, `objective_program`, `projects`.

**Actions :**

1. Créer deux profils.
2. des objectifs avec étapes.
3. sélectionner moniteurs et favoris.
4. réorganiser vues.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Créer deux profils ; des objectifs avec étapes ; sélectionner moniteurs et favoris ; réorganiser vues.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Libellés, panneaux et tuiles respectent la grille et la main dominante. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Libellés, panneaux et tuiles respectent la grille et la main dominante.

---

### X19 — Studio hybride : vidéo avec son original

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `projects`, `captures`, `audio_fx`, `creation`, `media_import`.

**Actions :**

1. Filmer une prise.
2. enregistrer narration.
3. importer son.
4. mettre sur timeline.
5. appliquer effet.
6. lire en plein écran.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Filmer une prise ; enregistrer narration ; importer son ; mettre sur timeline ; appliquer effet ; lire en plein écran.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Fluidité vidéo et synchronisation audio maintenues. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Fluidité vidéo et synchronisation audio maintenues.

---

### X20 — Vérifier conditions et droits d’une interaction

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `conditions`, `interactions`, `mcp_access`.

**Actions :**

1. Créer objet et condition.
2. attribuer action.
3. tenter accès MCP non autorisé.
4. approuver localement.
5. réessayer.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Créer objet et condition ; attribuer action ; tenter accès MCP non autorisé ; approuver localement ; réessayer.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Équivalence fonctionnelle seulement sous les mêmes droits. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Équivalence fonctionnelle seulement sous les mêmes droits.

---

### X21 — Récupération et fusion hors ligne

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `projects`, `creation`, `calc`, `sharing`.

**Actions :**

1. Créer texte à calculs.
2. couper réseau.
3. éditer depuis un appareil.
4. reconnecter.
5. consulter version et l’historique.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Créer texte à calculs ; couper réseau ; éditer depuis un appareil ; reconnecter ; consulter version et l’historique.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Pas de perte de valeur, duplication ni partage non voulu. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Pas de perte de valeur, duplication ni partage non voulu.

---

### X22 — Parité clavier/souris, tactile et voix

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `projects`, `creation`, `calc`, `captures`, `interactions`.

**Actions :**

1. Faire les mêmes gestes et commandes dans une scène : créer texte, sélectionner, calculer, capturer, ouvrir et fermer.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Faire les mêmes gestes et commandes dans une scène : créer texte, sélectionner, calculer, capturer, ouvrir et fermer.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Résultat canonique identique, sans faux PASS d’un seul canal. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Résultat canonique identique, sans faux PASS d’un seul canal.

---

### X23 — Redimensionnement extrême et lisibilité

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `creation`, `media_lists`, `dashboard_progression`, `captures`.

**Actions :**

1. Créer longs textes et listes.
2. réduire fenêtre, basculer portrait/paysage, ouvrir clavier, déplacer les outils, changer police.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Créer longs textes et listes ; réduire fenêtre, basculer portrait/paysage, ouvrir clavier, déplacer les outils, changer police.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Aucun texte ou contrôle critique invisible ou recouvert. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Aucun texte ou contrôle critique invisible ou recouvert.

---

### X24 — Résistance aux longues sessions multimédias

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `audio_fx`, `captures`, `training`, `calendar`, `projects`.

**Actions :**

1. Enchaîner 100 opérations et une longue lecture.
2. capturer, éditer, changer de vue puis rouvrir.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Enchaîner 100 opérations et une longue lecture ; capturer, éditer, changer de vue puis rouvrir.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Pas de fuite, saccade, pic CPU/RAM ou double lancement. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Pas de fuite, saccade, pic CPU/RAM ou double lancement.

---

### X25 — Événement public et réservation de coach

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `shows`, `events`, `coaches`, `gps`, `calendar`.

**Actions :**

1. Créer événement test, chercher coach, consulter horaires, réserver/corriger, ajouter itinéraire et rappel.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Créer événement test, chercher coach, consulter horaires, réserver/corriger, ajouter itinéraire et rappel.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Les contraintes horaires et les autorisations sont respectées. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Les contraintes horaires et les autorisations sont respectées.

---

### X26 — Synchronisation musique entre supports

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `apple_music`, `music`, `media_lists`, `profiles`.

**Actions :**

1. Connecter service test, créer une playlist, lire sur appareils disponibles, basculer profil et reprendre.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Connecter service test, créer une playlist, lire sur appareils disponibles, basculer profil et reprendre.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** État de lecture cohérent, pas de sortie audio inattendue. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** État de lecture cohérent, pas de sortie audio inattendue.

---

### X27 — Réseau d’objectifs avec visibilité contrôlée

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `objective_network`, `dashboard_progression`, `share`, `forum`.

**Actions :**

1. Définir objectif fictif, activer visibilité limitée, relier deux comptes tests, bloquer puis constater disparition.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Définir objectif fictif, activer visibilité limitée, relier deux comptes tests, bloquer puis constater disparition.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Aucune valeur de santé ou géolocalisation exacte exposée. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Aucune valeur de santé ou géolocalisation exacte exposée.

---

### X28 — Boutique et site de présentation en bac à sable

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `site`, `shop`, `qr`, `projects`.

**Actions :**

1. Créer fiche boutique, site de test et QR, prévisualiser, inspecter commande fictive puis restaurer.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Créer fiche boutique, site de test et QR, prévisualiser, inspecter commande fictive puis restaurer.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Aucun achat réel ; prévisualisation et données identiques. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Aucun achat réel ; prévisualisation et données identiques.

---

### X29 — Photo beauté et rappel périodique

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `beauty`, `calendar`, `health_feeling`.

**Actions :**

1. Prendre poses de démonstration, comparer, programmer rappel hebdomadaire et noter ressenti fictif.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Prendre poses de démonstration, comparer, programmer rappel hebdomadaire et noter ressenti fictif.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Photos comparées et rappels maintenus sans confusion de données. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Photos comparées et rappels maintenus sans confusion de données.

---

### X30 — Mobilité des applications natives et des importations

**Contexte :** projet ou compte synthétique isolé, au moins deux types d’objets si le parcours le permet.
**Outils sollicités :** `media_import`, `contacts`, `calendar`, `health_sync`, `strava`.

**Actions :**

1. Importer VCF/ICS/CSV, synchroniser source autorisée, quitter et réouvrir sur Web/Tauri/iOS/Android.

**Comment l’utiliser (après le scénario) :**

1. Depuis le Dashboard ou le projet en cours, sélectionner le premier outil réel ; ne pas introduire de fenêtre ou panneau supplémentaire.
2. Suivre ces étapes dans cet ordre : Importer VCF/ICS/CSV, synchroniser source autorisée, quitter et réouvrir sur Web/Tauri/iOS/Android.
3. Utiliser les outils suivants dans le même projet/flux, sans recréer les données sous une autre identité.
4. Comparer geste graphique et commande vocale ou MCP lorsqu’ils sont autorisés ; vérifier les passages entre objets.
5. **Contrôler :** Même logique canonique avec adaptateurs natifs et droits préservés. Regarder la lisibilité de chaque valeur, panneau et contrôle après chaque transition.

**Résultat attendu :** Même logique canonique avec adaptateurs natifs et droits préservés.

---

## V. Campagnes de sécurité, dépendances et parité des plateformes

Chaque campagne comprend essais **autorisés et non destructifs**, sur appareils de test et données factices. Remonter immédiatement une vulnérabilité suspecte dans `05_to_debug.md` avec preuves caviardées et priorité adaptée.

### Q01 — Authentification et séparation des comptes

**Scénario :** Deux utilisateurs test, connexion/déconnexion ; interdire lecture ou mutation croisée ; vérifier tokens et sessions.

**Comment l’utiliser (après le scénario) :**

1. Préparer des comptes, objets et jetons de test, sans toucher à des utilisateurs externes.
2. Appliquer exactement les cas positifs et négatifs décrits, depuis chaque canal applicable.
3. Noter pour chaque tentative : résultat, réponse de l’interface, droits, journaux expurgés et persistance.
4. Créer un ticket de sécurité sur preuve si un accès interdit réussit, si une fuite apparaît ou si une restriction n’est pas respectée.

**Résultat attendu :** aucune extension de droit implicite ; les commandes interdites échouent proprement, les commandes autorisées restent utilisables.

---

### Q02 — Permissions locales et santé

**Scénario :** Demander, refuser puis révoquer chaque autorisation de photo, micro, GPS, fichiers, santé, capteurs.

**Comment l’utiliser (après le scénario) :**

1. Préparer des comptes, objets et jetons de test, sans toucher à des utilisateurs externes.
2. Appliquer exactement les cas positifs et négatifs décrits, depuis chaque canal applicable.
3. Noter pour chaque tentative : résultat, réponse de l’interface, droits, journaux expurgés et persistance.
4. Créer un ticket de sécurité sur preuve si un accès interdit réussit, si une fuite apparaît ou si une restriction n’est pas respectée.

**Résultat attendu :** aucune extension de droit implicite ; les commandes interdites échouent proprement, les commandes autorisées restent utilisables.

---

### Q03 — MCP avec permissions différentes

**Scénario :** Comparer programme lecture seule, programme autorisé, demande de confirmation, refus et révocation.

**Comment l’utiliser (après le scénario) :**

1. Préparer des comptes, objets et jetons de test, sans toucher à des utilisateurs externes.
2. Appliquer exactement les cas positifs et négatifs décrits, depuis chaque canal applicable.
3. Noter pour chaque tentative : résultat, réponse de l’interface, droits, journaux expurgés et persistance.
4. Créer un ticket de sécurité sur preuve si un accès interdit réussit, si une fuite apparaît ou si une restriction n’est pas respectée.

**Résultat attendu :** aucune extension de droit implicite ; les commandes interdites échouent proprement, les commandes autorisées restent utilisables.

---

### Q04 — Commandes vocales et équivalence des droits

**Scénario :** Parole reconnue et commande MCP directe pour la même action ; refus de droits identique.

**Comment l’utiliser (après le scénario) :**

1. Préparer des comptes, objets et jetons de test, sans toucher à des utilisateurs externes.
2. Appliquer exactement les cas positifs et négatifs décrits, depuis chaque canal applicable.
3. Noter pour chaque tentative : résultat, réponse de l’interface, droits, journaux expurgés et persistance.
4. Créer un ticket de sécurité sur preuve si un accès interdit réussit, si une fuite apparaît ou si une restriction n’est pas respectée.

**Résultat attendu :** aucune extension de droit implicite ; les commandes interdites échouent proprement, les commandes autorisées restent utilisables.

---

### Q05 — Importation de documents non fiables

**Scénario :** Tester XLSX/DOCX/PDF/CSV malformés et formules de type injection sur fichiers de test.

**Comment l’utiliser (après le scénario) :**

1. Préparer des comptes, objets et jetons de test, sans toucher à des utilisateurs externes.
2. Appliquer exactement les cas positifs et négatifs décrits, depuis chaque canal applicable.
3. Noter pour chaque tentative : résultat, réponse de l’interface, droits, journaux expurgés et persistance.
4. Créer un ticket de sécurité sur preuve si un accès interdit réussit, si une fuite apparaît ou si une restriction n’est pas respectée.

**Résultat attendu :** aucune extension de droit implicite ; les commandes interdites échouent proprement, les commandes autorisées restent utilisables.

---

### Q06 — Scripts et environnement isolé

**Scénario :** Tester script permis/interdit, imports externes refusés, temps/mémoire bornés, accès disque et réseau interdits.

**Comment l’utiliser (après le scénario) :**

1. Préparer des comptes, objets et jetons de test, sans toucher à des utilisateurs externes.
2. Appliquer exactement les cas positifs et négatifs décrits, depuis chaque canal applicable.
3. Noter pour chaque tentative : résultat, réponse de l’interface, droits, journaux expurgés et persistance.
4. Créer un ticket de sécurité sur preuve si un accès interdit réussit, si une fuite apparaît ou si une restriction n’est pas respectée.

**Résultat attendu :** aucune extension de droit implicite ; les commandes interdites échouent proprement, les commandes autorisées restent utilisables.

---

### Q07 — Fuites de données médicales

**Scénario :** Utiliser uniquement données synthétiques ; vérifier journaux, partage, aperçu et export sans divulgation.

**Comment l’utiliser (après le scénario) :**

1. Préparer des comptes, objets et jetons de test, sans toucher à des utilisateurs externes.
2. Appliquer exactement les cas positifs et négatifs décrits, depuis chaque canal applicable.
3. Noter pour chaque tentative : résultat, réponse de l’interface, droits, journaux expurgés et persistance.
4. Créer un ticket de sécurité sur preuve si un accès interdit réussit, si une fuite apparaît ou si une restriction n’est pas respectée.

**Résultat attendu :** aucune extension de droit implicite ; les commandes interdites échouent proprement, les commandes autorisées restent utilisables.

---

### Q08 — Intégrité des transactions et répétitions

**Scénario :** Rejouer idempotency_key, tester double clic, annulation et concurrence.

**Comment l’utiliser (après le scénario) :**

1. Préparer des comptes, objets et jetons de test, sans toucher à des utilisateurs externes.
2. Appliquer exactement les cas positifs et négatifs décrits, depuis chaque canal applicable.
3. Noter pour chaque tentative : résultat, réponse de l’interface, droits, journaux expurgés et persistance.
4. Créer un ticket de sécurité sur preuve si un accès interdit réussit, si une fuite apparaît ou si une restriction n’est pas respectée.

**Résultat attendu :** aucune extension de droit implicite ; les commandes interdites échouent proprement, les commandes autorisées restent utilisables.

---

### Q09 — Transport réseau et sessions

**Scénario :** WebSocket/API : contrôle d’accès, session expirée, entrée invalide, reconnexion et chiffrement.

**Comment l’utiliser (après le scénario) :**

1. Préparer des comptes, objets et jetons de test, sans toucher à des utilisateurs externes.
2. Appliquer exactement les cas positifs et négatifs décrits, depuis chaque canal applicable.
3. Noter pour chaque tentative : résultat, réponse de l’interface, droits, journaux expurgés et persistance.
4. Créer un ticket de sécurité sur preuve si un accès interdit réussit, si une fuite apparaît ou si une restriction n’est pas respectée.

**Résultat attendu :** aucune extension de droit implicite ; les commandes interdites échouent proprement, les commandes autorisées restent utilisables.

---

### Q10 — Stockage et suppression

**Scénario :** Vérifier persistance, données locales de travail, serveur source de vérité, suppression et restauration autorisées.

**Comment l’utiliser (après le scénario) :**

1. Préparer des comptes, objets et jetons de test, sans toucher à des utilisateurs externes.
2. Appliquer exactement les cas positifs et négatifs décrits, depuis chaque canal applicable.
3. Noter pour chaque tentative : résultat, réponse de l’interface, droits, journaux expurgés et persistance.
4. Créer un ticket de sécurité sur preuve si un accès interdit réussit, si une fuite apparaît ou si une restriction n’est pas respectée.

**Résultat attendu :** aucune extension de droit implicite ; les commandes interdites échouent proprement, les commandes autorisées restent utilisables.

---

### Q11 — Fichiers, chemins et sortie de sandbox

**Scénario :** Tester chemin relatif ou interdit, média trop volumineux, mauvais MIME ; pas de traversal.

**Comment l’utiliser (après le scénario) :**

1. Préparer des comptes, objets et jetons de test, sans toucher à des utilisateurs externes.
2. Appliquer exactement les cas positifs et négatifs décrits, depuis chaque canal applicable.
3. Noter pour chaque tentative : résultat, réponse de l’interface, droits, journaux expurgés et persistance.
4. Créer un ticket de sécurité sur preuve si un accès interdit réussit, si une fuite apparaît ou si une restriction n’est pas respectée.

**Résultat attendu :** aucune extension de droit implicite ; les commandes interdites échouent proprement, les commandes autorisées restent utilisables.

---

### Q12 — Confidentialité caméra et microphone

**Scénario :** Vérifier témoins, arrêt, permissions, capture non voulue et nettoyage de l’état.

**Comment l’utiliser (après le scénario) :**

1. Préparer des comptes, objets et jetons de test, sans toucher à des utilisateurs externes.
2. Appliquer exactement les cas positifs et négatifs décrits, depuis chaque canal applicable.
3. Noter pour chaque tentative : résultat, réponse de l’interface, droits, journaux expurgés et persistance.
4. Créer un ticket de sécurité sur preuve si un accès interdit réussit, si une fuite apparaît ou si une restriction n’est pas respectée.

**Résultat attendu :** aucune extension de droit implicite ; les commandes interdites échouent proprement, les commandes autorisées restent utilisables.

---

### Q13 — Liens et contenus Web intégrés

**Scénario :** Tester liens malformés, protocole non permis, isolation iframe et permissions média.

**Comment l’utiliser (après le scénario) :**

1. Préparer des comptes, objets et jetons de test, sans toucher à des utilisateurs externes.
2. Appliquer exactement les cas positifs et négatifs décrits, depuis chaque canal applicable.
3. Noter pour chaque tentative : résultat, réponse de l’interface, droits, journaux expurgés et persistance.
4. Créer un ticket de sécurité sur preuve si un accès interdit réussit, si une fuite apparaît ou si une restriction n’est pas respectée.

**Résultat attendu :** aucune extension de droit implicite ; les commandes interdites échouent proprement, les commandes autorisées restent utilisables.

---

### Q14 — Dépendances et chaîne logicielle

**Scénario :** Auditer npm/Cargo.lock/Swift/Kotlin/Tauri/Bevy/wgpu ; vulnérabilités CVE, signatures et cohérence des versions.

**Comment l’utiliser (après le scénario) :**

1. Préparer des comptes, objets et jetons de test, sans toucher à des utilisateurs externes.
2. Appliquer exactement les cas positifs et négatifs décrits, depuis chaque canal applicable.
3. Noter pour chaque tentative : résultat, réponse de l’interface, droits, journaux expurgés et persistance.
4. Créer un ticket de sécurité sur preuve si un accès interdit réussit, si une fuite apparaît ou si une restriction n’est pas respectée.

**Résultat attendu :** aucune extension de droit implicite ; les commandes interdites échouent proprement, les commandes autorisées restent utilisables.

---

### Q15 — Branches natives macOS, Windows, Android, iOS

**Scénario :** Contrôler ponts WebView/OS, permissions, accès fichiers, RPC et barrières de plateforme.

**Comment l’utiliser (après le scénario) :**

1. Préparer des comptes, objets et jetons de test, sans toucher à des utilisateurs externes.
2. Appliquer exactement les cas positifs et négatifs décrits, depuis chaque canal applicable.
3. Noter pour chaque tentative : résultat, réponse de l’interface, droits, journaux expurgés et persistance.
4. Créer un ticket de sécurité sur preuve si un accès interdit réussit, si une fuite apparaît ou si une restriction n’est pas respectée.

**Résultat attendu :** aucune extension de droit implicite ; les commandes interdites échouent proprement, les commandes autorisées restent utilisables.

---

### Q16 — FreeBSD conditionnel

**Scénario :** Si matériel et compilation disponibles, contrôler accès serveur, absence d’accélération GPU, dépendances natives et sécurité.

**Comment l’utiliser (après le scénario) :**

1. Préparer des comptes, objets et jetons de test, sans toucher à des utilisateurs externes.
2. Appliquer exactement les cas positifs et négatifs décrits, depuis chaque canal applicable.
3. Noter pour chaque tentative : résultat, réponse de l’interface, droits, journaux expurgés et persistance.
4. Créer un ticket de sécurité sur preuve si un accès interdit réussit, si une fuite apparaît ou si une restriction n’est pas respectée.

**Résultat attendu :** aucune extension de droit implicite ; les commandes interdites échouent proprement, les commandes autorisées restent utilisables.

---

### Q17 — Contrôle de charge et déni de service

**Scénario :** Répéter calculs, importations, requêtes et animations ; vérifier budgets et absence de blocage.

**Comment l’utiliser (après le scénario) :**

1. Préparer des comptes, objets et jetons de test, sans toucher à des utilisateurs externes.
2. Appliquer exactement les cas positifs et négatifs décrits, depuis chaque canal applicable.
3. Noter pour chaque tentative : résultat, réponse de l’interface, droits, journaux expurgés et persistance.
4. Créer un ticket de sécurité sur preuve si un accès interdit réussit, si une fuite apparaît ou si une restriction n’est pas respectée.

**Résultat attendu :** aucune extension de droit implicite ; les commandes interdites échouent proprement, les commandes autorisées restent utilisables.

---

### Q18 — Partage, collaboration et révocation

**Scénario :** Partager entre comptes tests, lire, modifier, révoquer ; vérifier impossibilité d’accès après révocation.

**Comment l’utiliser (après le scénario) :**

1. Préparer des comptes, objets et jetons de test, sans toucher à des utilisateurs externes.
2. Appliquer exactement les cas positifs et négatifs décrits, depuis chaque canal applicable.
3. Noter pour chaque tentative : résultat, réponse de l’interface, droits, journaux expurgés et persistance.
4. Créer un ticket de sécurité sur preuve si un accès interdit réussit, si une fuite apparaît ou si une restriction n’est pas respectée.

**Résultat attendu :** aucune extension de droit implicite ; les commandes interdites échouent proprement, les commandes autorisées restent utilisables.

---

### Q19 — Versions, failles et correctifs de bibliothèques

**Scénario :** Vérifier abandon de mainteneur, versions stables, incompatibilités, alertes critiques et régression après mises à jour.

**Comment l’utiliser (après le scénario) :**

1. Préparer des comptes, objets et jetons de test, sans toucher à des utilisateurs externes.
2. Appliquer exactement les cas positifs et négatifs décrits, depuis chaque canal applicable.
3. Noter pour chaque tentative : résultat, réponse de l’interface, droits, journaux expurgés et persistance.
4. Créer un ticket de sécurité sur preuve si un accès interdit réussit, si une fuite apparaît ou si une restriction n’est pas respectée.

**Résultat attendu :** aucune extension de droit implicite ; les commandes interdites échouent proprement, les commandes autorisées restent utilisables.

---

### Q20 — Audit visuel de sécurité

**Scénario :** S’assurer que confirmation, avertissement, valeur, destinataire et commandes d’annulation ne sont jamais cachés.

**Comment l’utiliser (après le scénario) :**

1. Préparer des comptes, objets et jetons de test, sans toucher à des utilisateurs externes.
2. Appliquer exactement les cas positifs et négatifs décrits, depuis chaque canal applicable.
3. Noter pour chaque tentative : résultat, réponse de l’interface, droits, journaux expurgés et persistance.
4. Créer un ticket de sécurité sur preuve si un accès interdit réussit, si une fuite apparaît ou si une restriction n’est pas respectée.

**Résultat attendu :** aucune extension de droit implicite ; les commandes interdites échouent proprement, les commandes autorisées restent utilisables.

---

## VI. Cas de régression spécifiques à Calc (détaillés)

Ces cas complètent S034, X03–X05. Ils sont obligatoires sur iPad tactile, Web clavier/souris, Tauri macOS/Windows, Android et via MCP/voix si les droits permettent le même document.

| Cas | Entrée et manipulation | Résultat précis à constater |
| --- | --- | --- |
| CALC-01 | `12 bananes` + `14 pommes`, toucher 12, +, toucher 14, = | Résultat porté `26` |
| CALC-02 | Déposer `26` sur le mot « total » | Mot remplacé par la valeur, formule conservée dans sa cellule |
| CALC-03 | Modifier `12` en `20` | Résultat lié automatiquement `34` |
| CALC-04 | Sélectionner les deux valeurs, toucher + puis = | `34` sans double comptage de sélection |
| CALC-05 | Écrire `12 bananes + 14 pommes =` | Le résultat suit `=` |
| CALC-06 | Écrire `total = bananes + pommes`, nouvelle ligne | Total calculé et inséré |
| CALC-07 | Sélectionner « total », puis = après choix des valeurs | Le mot sélectionné est remplacé |
| CALC-08 | Grille, changer une valeur, retour Texte | Même valeur et résultats dans le même document |
| CALC-09 | Glisser une cellule par son titre en Grille | Cellule déplacée, une cellule occupante échangée |
| CALC-10 | `SOMME(A1:A3)`, `MOYENNE`, `SI` | Noms français traités et résultat correct |
| CALC-11 | `12 € + 3 €`, `1 kg + 500 g`, dates | Valeurs et unités cohérentes, erreur de mélange incompatible |
| CALC-12 | Introduire une formule circulaire de test | `#CYCLE` ou erreur canonique sans boucle infinie |
| CALC-13 | Tester `MAINTENANT`, `ALEA` dans un document | Refus des fonctions volatiles (reproductibilité) |
| CALC-14 | Importer XLSX avec plusieurs feuilles et formules compatibles | Rapport d’import exact et cellules cohérentes |
| CALC-15 | Importer CSV/TSV puis ouvrir Grille et Texte | Valeurs persistantes et mêmes références |
| CALC-16 | `calc.cell` puis `calc.formula` via MCP autorisé | Résultat identique au geste utilisateur |
| CALC-17 | `calc.uncell` | Texte conservé, ancre de cellule ôtée |
| CALC-18 | Édition, annuler/rétablir et réouverture | Une mutation cohérente sur texte + cellules + formule |
| CALC-19 | Manipulation clavier sans souris puis tactile sans clavier | Résultat identique, pas de contrôle caché |
| CALC-20 | Long document >100 cellules, texte zoomé et panneaux | Performances mesurées, aucune valeur tronquée sans accès |

## VII. Compte rendu par exécution (à produire, non pré-rempli)

| Champ | Valeur à renseigner |
| --- | --- |
| Référence | ID `C`, `U` ou `F`, scénario `S`, `M`, `L`, `X`, `Q` |
| Environnement | navigateur / macOS / Windows / iOS / Android / FreeBSD + version + matériel |
| Entrée | outil graphique, clavier/souris, tactile, parole réellement transcrite, MCP direct |
| État | `PASS`, `FAIL`, `BLOCKED`, `N/A` (motif), `NOT_TESTED` |
| Aspect | texte lisible, bande visible, panneau correct, pas de chevauchement |
| Mesure | CPU, RAM, FPS, latence de réponse, durée audio/vidéo, avant/après si possible |
| Sécurité | autorisation, consentement, contrôle d’accès, destination exacte |
| Preuves | capture, vidéo, log expurgé, rapport de test |
| Ticket | `BUG-...` si résultat constaté différent de l’attendu |

Toutes les fonctions de la matrice sont couvertes **documentairement**. Aucun test d’exécution n’est prétendu accompli par la génération de ce fichier.
