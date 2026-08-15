# Téléportation d’objets — Atome/eVe

## 1. Objectif

Implémenter dans Atome/eVe une fonctionnalité de **téléportation d’objet** permettant de déplacer réellement un objet d’une surface/appareil vers une autre, sans le dupliquer et sans faire un partage d’écran classique.

L’expérience doit donner l’impression qu’un objet quitte physiquement une surface pour apparaître sur une autre.

Exemples :

- prendre une photo affichée sur un téléphone et la pousser vers un Mac ;
- envoyer un film vers un autre écran puis continuer à le contrôler depuis le téléphone ;
- déplacer un objet vers l’appareil d’un autre utilisateur autorisé ;
- récupérer ensuite l’objet sur la surface d’origine ;
- laisser volontairement l’objet sur la surface distante ;
- utiliser un téléphone comme contrôleur/trackpad d’un autre appareil sans téléporter préalablement d’objet.

Le système doit rester cohérent avec la philosophie Atome/eVe : **interface minimale, contextuelle, directe, sans menu supplémentaire inutile**.

---

## 2. Principe fondamental

### 2.1 Téléportation ≠ copie

La téléportation ne crée pas une seconde instance indépendante de l’objet.

Quand un objet est téléporté :

- il quitte sa surface active d’origine ;
- il devient actif sur la surface de destination ;
- son état logique reste celui du même objet ;
- sa représentation principale n’est pas dupliquée ;
- l’utilisateur peut éventuellement continuer à le contrôler depuis la surface d’origine ;
- l’objet peut être rapatrié ;
- l’utilisateur peut décider de le laisser/persister sur la destination.

Le concept doit donc être pensé comme un **changement de surface active d’un objet**, et non comme un transfert de fichier ou un écran miroir.

---

## 3. Terminologie proposée

Nom fonctionnel retenu pour le cahier des charges :

**Téléportation**

Termes utiles :

- **Objet source** : objet avant téléportation.
- **Surface source** : appareil/surface depuis lequel l’objet part.
- **Surface destination** : appareil/surface où l’objet apparaît.
- **Objet téléporté** : même objet logique, actuellement rendu sur une autre surface.
- **Icône résiduelle** : représentation minimale laissée sur la surface source après téléportation.
- **Contrôle distant** : manipulation d’un objet ou d’une surface distante depuis l’appareil local.
- **Trackpad distant** : outil de contrôle de pointeur/gestes disponible dans la toolbox.
- **Rapatrier** : ramener l’objet téléporté sur la surface source.
- **Persister / laisser** : maintenir volontairement l’objet sur la destination.

---

## 4. Règles UX générales

### 4.1 Aucun menu dédié supplémentaire

La fonctionnalité doit vivre dans la **toolbox existante** d’Atome/eVe.

Il ne faut pas créer :

- de fenêtre de contrôle permanente ;
- de menu flottant supplémentaire ;
- de panneau plein écran ;
- de trackpad prenant tout l’écran ;
- d’interface parallèle déconnectée du système actuel.

Les outils disponibles changent **contextuellement** selon l’état de l’objet et la cible.

---

## 5. Déclenchement de la téléportation

Deux méthodes principales doivent coexister.

### 5.1 Téléportation par geste physique au bord

Cas privilégié lorsque la machine distante est physiquement proche et visible.

Flux :

1. l’utilisateur prend un objet ;
2. il le déplace vers un bord de l’écran ;
3. il insiste volontairement contre ce bord / dépasse la limite ;
4. Atome interprète cette action comme une intention de téléportation ;
5. Atome cherche les surfaces actuellement disponibles ;
6. si une seule surface éligible existe, l’objet est téléporté directement ;
7. si plusieurs surfaces sont disponibles, la toolbox contextuelle affiche les destinations possibles ;
8. l’utilisateur choisit une destination ;
9. l’objet apparaît sur la surface choisie.

### 5.2 Pas de cartographie préalable

Il ne faut pas imposer à l’utilisateur de configurer à l’avance :

- quel écran est à droite ;
- quel appareil est à gauche ;
- une carte spatiale permanente ;
- une disposition de moniteurs.

Le **geste de l’utilisateur constitue l’intention**.

Si l’utilisateur pousse un objet vers un bord, le système considère qu’il souhaite le faire sortir par ce bord.

Quand une seule machine est disponible, aucune étape supplémentaire n’est nécessaire.

### 5.3 Cas de plusieurs machines

Si plusieurs destinations sont disponibles au moment du geste :

- ne pas téléporter arbitrairement ;
- ne pas afficher une grande fenêtre ;
- utiliser la toolbox contextuelle ;
- y faire apparaître la liste des surfaces/devices disponibles ;
- permettre une sélection immédiate.

La sélection doit rester rapide et visuellement légère.

---

## 6. Téléportation par envoi explicite

La téléportation doit également pouvoir être déclenchée sans geste vers un bord.

Cas :

- appareil distant non visible ;
- appareil physiquement éloigné ;
- autre utilisateur ;
- plusieurs appareils ;
- cible connue à l’avance.

Depuis la toolbox :

1. activer l’outil **Téléportation** ;
2. afficher les destinations disponibles ;
3. permettre de choisir :
   - un device du même compte ;
   - un device d’un autre utilisateur autorisé ;
   - éventuellement un utilisateur puis l’un de ses devices ;
4. sélectionner la cible ;
5. téléporter immédiatement l’objet.

L’expérience doit se rapprocher d’une **boîte d’envoi d’objet**, mais l’action produite reste une téléportation et non une copie.

---

## 7. Représentation de l’objet après téléportation

Quand l’objet quitte l’écran source, il ne doit pas disparaître sans trace.

### 7.1 Icône résiduelle obligatoire

L’écran source conserve un petit élément représentant l’objet téléporté.

Cette icône doit au minimum afficher :

- un symbole clair de téléportation ;
- le nom ou identifiant lisible de l’objet ;
- éventuellement la destination actuelle.

Cette représentation :

- n’est pas une duplication du contenu ;
- n’est pas une seconde instance ;
- représente un **lien vers l’objet distant** ;
- peut être sélectionnée ;
- réactive les outils contextuels liés à cet objet.

### 7.2 Comportement souhaité

Exemple :

`🎯 photo.jpg — téléporté vers MacBook`

La forme graphique finale devra respecter le design minimaliste d’Atome/eVe.

L’icône doit rester suffisamment discrète pour ne pas encombrer le bureau mais suffisamment explicite pour éviter qu’un objet semble « perdu ».

---

## 8. Toolbox contextuelle après téléportation

Quand l’icône résiduelle ou l’objet téléporté est sélectionné, la toolbox doit proposer les actions pertinentes.

Actions minimales à prévoir :

- **Rapatrier**
- **Contrôler**
- **Trackpad**
- **Laisser / Persister**
- **Changer de destination**
- **Plein écran** sur la surface distante, si pertinent
- **Arrêter le contrôle distant**

Les intitulés exacts et icônes devront être challengés selon la grammaire visuelle déjà utilisée dans Atome/eVe.

Aucune action inutile ne doit être affichée lorsque son contexte ne la permet pas.

---

## 9. Contrôle de l’objet distant

La téléportation ne doit pas obligatoirement transférer le contrôle.

Après téléportation, plusieurs scénarios sont possibles.

### 9.1 Contrôle depuis la destination

L’utilisateur manipule directement l’objet sur la machine où il est affiché.

### 9.2 Contrôle depuis la source

L’utilisateur conserve son téléphone ou son autre appareil comme contrôleur.

Exemples :

- lecture vidéo sur Mac ;
- téléphone utilisé comme contrôleur ;
- déplacement, pause, lecture, zoom, navigation ;
- édition ou interaction avec l’objet distant.

### 9.3 Cible visible physiquement

Si la surface distante est visible par l’utilisateur, il n’est pas nécessaire d’afficher une prévisualisation permanente sur la surface source.

L’appareil source peut fonctionner comme un contrôleur.

### 9.4 Cible non visible

Si la destination est distante ou hors du champ de vision, prévoir un moyen contextuel d’obtenir une **prévisualisation distante** afin de comprendre ce que l’on manipule.

Cette preview ne doit apparaître que lorsqu’elle est utile.

Elle ne doit pas devenir un partage d’écran permanent par défaut.

---

## 10. Trackpad distant

Le trackpad est un outil autonome.

Il ne doit pas être limité aux objets déjà téléportés.

### 10.1 Utilisation autonome

Un appareil peut prendre le contrôle d’une autre surface et agir comme :

- trackpad ;
- souris/touchpad distant ;
- contrôleur de gestes ;
- surface de manipulation.

Exemple :

- téléphone connecté au Mac ;
- activation de l’outil Trackpad dans la toolbox ;
- le téléphone contrôle le pointeur ou les interactions du Mac ;
- l’utilisateur peut manipuler les objets déjà présents sur le Mac.

### 10.2 Pas de plein écran imposé

Le trackpad ne doit jamais monopoliser toute l’interface par défaut.

Il doit être :

- un **outil de la toolbox** ;
- activable/désactivable ;
- compatible avec la manipulation simultanée d’autres objets ;
- intégré au fonctionnement contextuel d’Atome/eVe.

### 10.3 Téléportation secondaire via trackpad

Une fois le contrôle distant actif, l’utilisateur doit pouvoir déplacer un objet présent sur la machine distante, y compris éventuellement le téléporter vers une autre surface.

Le contrôle distant et la téléportation doivent donc être deux briques distinctes mais interopérables.

---

## 11. Permissions et sécurité

### 11.1 Devices du même utilisateur

Pour les devices authentifiés sous le même compte/utilisateur :

- le contrôle peut être considéré comme autorisé par défaut ;
- éviter une confirmation répétitive ;
- conserver néanmoins des indicateurs de session active.

### 11.2 Device appartenant à un autre utilisateur

Le contrôle d’un appareil appartenant à un autre utilisateur nécessite une autorisation explicite.

Flux recommandé :

1. User A demande le contrôle ou la téléportation interactive vers le device de User B ;
2. User B reçoit une demande claire ;
3. User B accepte ou refuse ;
4. le système ouvre une session autorisée ;
5. User B peut révoquer l’autorisation à tout moment.

### 11.3 Séparer les autorisations

Prévoir des permissions distinctes, par exemple :

- recevoir un objet ;
- afficher un objet ;
- manipuler un objet ;
- contrôler le pointeur ;
- contrôler une surface entière ;
- laisser un objet persistant sur la machine ;
- permettre le rapatriement.

Ne pas partir du principe qu’« accepter un objet » équivaut automatiquement à « donner le contrôle total de la machine ».

---

## 12. État logique recommandé

Chaque objet téléportable doit posséder un état explicite.

Exemple conceptuel :

```text
object_id
owner_user_id
current_surface_id
origin_surface_id
current_controller_id
teleport_state
persistence_state
remote_control_state
permissions
session_id
```

États possibles :

```text
LOCAL
TELEPORT_PREPARING
TELEPORTING
REMOTE
REMOTE_CONTROLLED
RETURNING
PERSISTED_REMOTE
DISCONNECTED
ERROR
```

La téléportation doit être traitée comme un changement d’état atomique et traçable.

---

## 13. Principe d’unicité

Le système doit garantir qu’un objet téléporté reste identifiable comme **le même objet logique**.

À éviter :

- créer silencieusement une copie ;
- créer deux versions modifiables concurrentes sans le signaler ;
- faire croire qu’un objet a été déplacé alors qu’il existe réellement deux objets indépendants ;
- perdre l’identité de l’objet lors d’une reconnexion.

Les couches de rendu peuvent évidemment avoir plusieurs représentations techniques temporaires, mais le modèle fonctionnel doit conserver une identité unique.

---

## 14. Téléportation de médias

Le système doit supporter au minimum les objets Atome/eVe courants :

- images ;
- texte ;
- audio ;
- vidéo ;
- documents ;
- objets graphiques ;
- groupes d’objets ;
- objets interactifs.

Pour une vidéo, par exemple :

1. l’utilisateur téléporte le film vers un écran ;
2. l’écran distant devient surface de rendu ;
3. le téléphone peut continuer à contrôler la lecture ;
4. le film peut passer en plein écran ;
5. à la fin :
   - l’utilisateur peut le rapatrier ;
   - ou le laisser sur la destination.

---

## 15. Distinction entre transport de données et transport de rendu

L’implémentation ne doit pas imposer un seul mécanisme technique.

Selon le type d’objet, Atome/eVe peut choisir :

- transfert des données ;
- accès distant aux données ;
- streaming ;
- synchronisation d’état ;
- rendu distant ;
- combinaison de plusieurs techniques.

L’utilisateur, lui, ne doit voir qu’un comportement cohérent :

**l’objet est ici, puis il est là-bas.**

---

## 16. Résilience réseau

Le comportement doit rester déterministe lorsque :

- la connexion disparaît pendant la téléportation ;
- la destination se déconnecte ;
- l’application distante se ferme ;
- un device s’endort ;
- le réseau change ;
- le propriétaire révoque l’autorisation.

Règle de sécurité UX :

**un objet ne doit jamais être considéré comme définitivement parti tant que la destination n’a pas confirmé sa prise en charge.**

Prévoir :

- ACK de destination ;
- timeout ;
- rollback ;
- état « connexion perdue » ;
- possibilité de rapatriement ;
- reprise de session si possible.

---

## 17. Animation et sensation de déplacement

L’expérience visuelle est importante.

### 17.1 Machine adjacente visible

Lors d’un drag vers un bord :

- l’objet doit pouvoir sembler franchir la limite ;
- la transition doit être immédiate ;
- si les deux appareils sont visuellement proches, l’illusion d’un objet qui passe d’un écran à l’autre doit être privilégiée.

### 17.2 Pas de lourdeur visuelle

Éviter :

- dialogues modaux ;
- confirmations inutiles ;
- animations longues ;
- gros panneaux ;
- interfaces de « partage d’écran » traditionnelles.

La sensation recherchée est celle d’un espace de travail étendu, mais basé sur les **objets**, pas sur un framebuffer partagé.

---

## 18. Détection de l’intention au bord

Le système ne doit pas déclencher une téléportation au moindre contact accidentel avec un bord.

Détecter une intention à partir d’une combinaison possible de :

- pression/insistance temporelle contre le bord ;
- vitesse ;
- distance dépassée ;
- répétition du mouvement ;
- maintien du drag ;
- contexte de l’objet.

Les seuils doivent être testés afin d’éviter les faux positifs.

Le geste doit rester naturel : l’utilisateur ne doit pas avoir à apprendre une combinaison artificielle.

---

## 19. Découverte des surfaces

Le système doit pouvoir connaître les surfaces éligibles au moment où une téléportation est demandée.

Catégories possibles :

- mes devices ;
- devices proches ;
- devices récemment utilisés ;
- devices d’utilisateurs autorisés ;
- devices distants accessibles via le compte.

Cette liste n’a pas besoin d’être visible en permanence.

Elle apparaît uniquement lorsque le contexte exige un choix.

---

## 20. Cas où aucune cible n’est disponible

Si l’utilisateur pousse un objet vers un bord mais qu’aucune surface n’est disponible :

- ne pas perdre l’objet ;
- ne pas interrompre brutalement le drag ;
- fournir un retour discret ;
- remettre naturellement l’objet dans la surface ;
- éventuellement faire apparaître l’outil Téléportation afin de rechercher une cible.

---

## 21. Persistance distante

Après utilisation, l’objet peut :

### A. Être rapatrié

Il revient sur sa surface d’origine ou une surface choisie.

### B. Être laissé

L’objet reste sur la destination.

Cela peut impliquer :

- conservation de sa surface active ;
- changement de surface de référence ;
- persistance après fermeture ;
- stockage local ou distant selon l’architecture.

Cette action doit être explicite.

---

## 22. Changement de destination

Un objet déjà téléporté doit pouvoir être retransféré :

```text
Téléphone → Mac → iPad → autre utilisateur → retour téléphone
```

Le système ne doit pas traiter la surface d’origine comme une destination privilégiée techniquement, sauf pour la fonction pratique « Rapatrier ».

---

## 23. Propriété vs localisation

La propriété de l’objet ne doit pas être confondue avec l’endroit où il est affiché.

Exemple :

- objet appartenant à User A ;
- rendu sur le Mac de User B ;
- contrôlé par User A ;
- temporairement manipulable par User B ;
- toujours propriété de User A.

Le modèle de permissions doit donc séparer :

- **owner**
- **host**
- **controller**
- **viewer/editor**
- **surface active**

---

## 24. Interaction avec le système de partage existant

La téléportation est une fonctionnalité distincte du partage d’objet existant.

Le système existant peut éventuellement fournir certaines briques :

- synchronisation d’état ;
- transport réseau ;
- permissions ;
- identité ;
- sessions temps réel.

Mais il ne faut pas confondre :

### Partage

Plusieurs participants peuvent accéder au même contenu.

### Téléportation

L’objet change de surface active et l’expérience utilisateur donne la sensation qu’il s’est déplacé.

La téléportation doit être modélisée explicitement plutôt que simulée par une simple option de partage.

---

## 25. Relation éventuelle avec le système de débogage distribué

Un ancien concept de débogage multi-parties a été évoqué comme base potentielle.

Avant implémentation :

- rechercher dans le framework Atome/eVe les briques déjà existantes de communication inter-device ;
- identifier les mécanismes de synchronisation d’état, de contrôle distant ou de remontée d’événements ;
- vérifier si l’architecture du débogage distribué peut être réutilisée ;
- ne pas reconstruire inutilement une couche réseau déjà disponible.

Ne pas inventer le fonctionnement de l’ancien système de débogage : commencer par auditer ce qui existe réellement dans le code.

---

# 26. Architecture fonctionnelle suggérée

Séparer au minimum les responsabilités suivantes.

## 26.1 Surface Registry

Connaît les surfaces/devices disponibles.

Responsabilités :

- découverte ;
- statut online/offline ;
- utilisateur propriétaire ;
- capacités ;
- permissions ;
- proximité éventuelle ;
- session active.

## 26.2 Teleport Manager

Responsable du déplacement logique de l’objet.

Fonctions possibles :

```text
teleport(object, target_surface)
return(object)
persist(object, target_surface)
move(object, new_surface)
cancel_teleport(object)
```

## 26.3 Remote Control Manager

Responsable du contrôle distant.

Fonctions :

```text
request_control(surface)
grant_control(surface)
revoke_control(surface)
send_pointer_event(...)
send_gesture(...)
send_keyboard_event(...)
```

## 26.4 Contextual Toolbox Adapter

Expose les outils pertinents selon l’état.

Exemple :

```text
Objet local
→ Téléporter

Objet téléporté
→ Rapatrier
→ Contrôler
→ Trackpad
→ Persister
→ Changer de cible

Surface distante sélectionnée
→ Trackpad
→ Demander contrôle
→ Quitter contrôle
```

## 26.5 Residual Proxy

Gère la représentation locale de l’objet téléporté.

Il ne contient pas une copie fonctionnelle de l’objet mais une référence vers :

- son identité ;
- sa destination ;
- son état ;
- les commandes autorisées.

---

# 27. UX à prototyper

Créer au minimum les prototypes suivants.

## Prototype A — Téléphone → Mac, une seule cible

1. image sur téléphone ;
2. drag vers le bord ;
3. insistance ;
4. image disparaît du téléphone ;
5. image apparaît sur Mac ;
6. icône résiduelle apparaît sur téléphone ;
7. sélection de l’icône ;
8. toolbox → Rapatrier / Contrôler / Trackpad / Persister.

## Prototype B — Plusieurs devices disponibles

1. drag vers le bord ;
2. plusieurs surfaces détectées ;
3. toolbox contextuelle affiche :
   - MacBook ;
   - iPad ;
   - écran salon ;
4. sélection ;
5. téléportation.

## Prototype C — Device distant

1. objet sélectionné ;
2. outil Téléportation ;
3. choix user/device ;
4. téléportation ;
5. preview distante disponible si nécessaire.

## Prototype D — Trackpad sans téléportation

1. téléphone ;
2. toolbox → Trackpad ;
3. sélection du Mac ;
4. prise de contrôle ;
5. manipulation d’un objet déjà présent sur le Mac ;
6. arrêt du contrôle.

## Prototype E — Autre utilisateur

1. demande d’accès ;
2. notification ;
3. acceptation ;
4. téléportation ou contrôle ;
5. révocation possible.

---

# 28. Tests indispensables

## Fonctionnels

- téléportation vers une seule cible ;
- choix entre plusieurs cibles ;
- rapatriement ;
- persistance distante ;
- changement de destination ;
- contrôle depuis source ;
- contrôle depuis destination ;
- trackpad sans téléportation ;
- permissions entre utilisateurs ;
- révocation ;
- perte réseau ;
- destination fermée ;
- réouverture de session ;
- objets lourds ;
- groupes d’objets ;
- vidéo plein écran.

## UX

- faux déclenchement au bord ;
- délai avant téléportation ;
- compréhension de l’icône résiduelle ;
- compréhension de « rapatrier » ;
- visibilité de la destination ;
- nombre d’actions contextuelles ;
- utilisation à une main sur téléphone ;
- coexistence du trackpad avec le reste de l’interface.

## Sécurité

- impossible de prendre le contrôle d’un autre user sans accord ;
- impossible de continuer après révocation ;
- permissions par session ;
- traçabilité de la destination ;
- validation de l’identité du device ;
- résistance aux messages réseau falsifiés.

---

# 29. Critères d’acceptation

La première version est acceptable si :

- [ ] un objet peut quitter une surface sans être dupliqué fonctionnellement ;
- [ ] il apparaît sur une autre surface ;
- [ ] une icône résiduelle reste sur la surface source ;
- [ ] cette icône permet de retrouver l’objet et ses actions ;
- [ ] le geste vers un bord fonctionne sans configuration spatiale préalable ;
- [ ] une cible unique est utilisée directement ;
- [ ] plusieurs cibles déclenchent une sélection contextuelle ;
- [ ] aucune fenêtre ou menu permanent supplémentaire n’est nécessaire ;
- [ ] l’ensemble des commandes vit dans la toolbox ;
- [ ] le trackpad est un outil contextuel et non un écran imposé ;
- [ ] le trackpad peut fonctionner indépendamment de la téléportation ;
- [ ] les devices du même compte peuvent être contrôlés directement ;
- [ ] les devices d’un autre user demandent une autorisation ;
- [ ] l’utilisateur peut rapatrier l’objet ;
- [ ] l’utilisateur peut laisser/persister l’objet sur la destination ;
- [ ] une perte de connexion ne provoque pas la perte logique de l’objet ;
- [ ] l’objet conserve une identité unique ;
- [ ] la destination peut être locale, proche ou distante.

---

# 30. Non-objectifs

La première implémentation ne doit pas devenir :

- un clone de partage d’écran ;
- un système de bureau distant générique ;
- une copie type AirDrop ;
- une réplication systématique de fichiers ;
- une UI de gestion de devices complexe ;
- une cartographie permanente des écrans ;
- un mode trackpad plein écran obligatoire.

---

# 31. Prompt d’implémentation

## Mission

Analyser le framework Atome/eVe existant puis concevoir et implémenter la fonctionnalité **Téléportation** décrite dans ce document.

La priorité absolue est de respecter l’architecture, le design, la granularité et les conventions déjà présentes dans le projet.

### Étape 1 — Audit

Avant de modifier le code :

1. identifier le système actuel de partage d’objets ;
2. identifier les briques de communication temps réel ;
3. identifier les notions de user, device, session, surface et permissions ;
4. rechercher les mécanismes existants de contrôle distant ou de synchronisation d’état ;
5. rechercher l’ancien système ou prototype de débogage distribué susceptible de fournir des briques réutilisables ;
6. vérifier le fonctionnement actuel de la toolbox contextuelle ;
7. identifier le meilleur niveau architectural pour introduire `Teleport Manager`, `Surface Registry`, contrôle distant et proxy résiduel ;
8. documenter ce qui peut être réutilisé et ce qui doit réellement être créé.

Ne pas commencer par ajouter une nouvelle architecture parallèle si une abstraction existante peut être étendue proprement.

### Étape 2 — Modèle

Définir précisément :

- identité unique de l’objet ;
- surface active ;
- surface d’origine ;
- destination ;
- owner ;
- host ;
- controller ;
- permissions ;
- état de téléportation ;
- session distante ;
- stratégie de reconnexion ;
- persistance.

### Étape 3 — Prototype minimal

Implémenter d’abord :

1. deux devices du même user ;
2. téléportation d’un objet simple ;
3. geste au bord ;
4. une seule destination ;
5. icône résiduelle ;
6. rapatriement ;
7. toolbox contextuelle.

Puis ajouter :

8. plusieurs destinations ;
9. choix contextuel ;
10. contrôle distant ;
11. trackpad autonome ;
12. autre user + permission ;
13. persistance ;
14. reconnexion et gestion des erreurs.

### Étape 4 — UX

Challenger chaque interaction.

Questions à vérifier :

- Peut-on téléporter sans comprendre un nouveau menu ?
- Le geste au bord est-il naturel ?
- Le seuil évite-t-il les déclenchements accidentels ?
- L’icône résiduelle explique-t-elle immédiatement où est parti l’objet ?
- La toolbox ne montre-t-elle que les commandes utiles ?
- Le trackpad reste-t-il discret ?
- Peut-on continuer à utiliser normalement le téléphone pendant qu’un contrôle distant est actif ?
- Le fonctionnement reste-t-il compréhensible avec plusieurs devices ?

### Étape 5 — Qualité

Ajouter :

- tests unitaires ;
- tests d’intégration multi-device ;
- tests réseau ;
- tests de permissions ;
- tests de reconnexion ;
- logs de session ;
- gestion explicite des erreurs ;
- mécanisme de rollback ;
- instrumentation suffisante pour déboguer les téléportations.

### Étape 6 — Restitution

Fournir :

1. l’analyse de l’existant ;
2. les composants réutilisés ;
3. les nouveaux composants créés ;
4. les fichiers modifiés ;
5. les choix architecturaux ;
6. les éventuelles limitations ;
7. les tests exécutés ;
8. les scénarios UX validés ;
9. les points restant à challenger.

---

# 32. Règle directrice

La fonctionnalité doit toujours donner l’impression suivante :

> **Je ne partage pas mon écran. Je ne copie pas mon objet. Je prends mon objet et je le fais passer sur une autre surface.**

La technique sous-jacente peut être complexe. L’expérience utilisateur, elle, doit rester immédiate.
