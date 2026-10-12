# Menu solution

## Objectif

Définir le menu racine minimal d’atome pour un utilisateur débutant, tout en conservant :
- une interface extrêmement simple ;
- un accès immédiat aux actions urgentes ;
- toute la surface de travail disponible lorsque nécessaire ;
- une montée en complexité progressive selon le niveau de maîtrise ;
- Mystic comme système contextuel global, sans lui ajouter des commandes système qui peuvent être gérées plus simplement ailleurs.

---

## 1. Menu racine débutant : 5 outils maximum

Le menu principal ne doit jamais dépasser **5 outils visibles** pour un débutant.

### 1. Organiser

Point d’accès à tout ce qui sert à retrouver, suivre et structurer l’activité.

Contient notamment :
- Dashboard ;
- agenda / calendrier ;
- temps ;
- alarmes ;
- historique ;
- projets et éléments d’organisation.

Le Dashboard n’est donc plus une icône racine indépendante : il est intégré dans **Organiser**.

L’accès Organiser / Dashboard peut néanmoins servir de **point d’ancrage système** pour le masquage et le rappel de la barre, sans créer de sixième icône.

### 2. Capturer

Action de premier niveau, car une capture peut être urgente et impossible à reproduire plus tard.

Doit permettre un accès très rapide à :
- photo ;
- vidéo ;
- audio.

Principe :
- Capturer reste directement accessible au premier niveau ;
- ne pas l’enfouir dans Créer ou Importer ;
- l’interaction doit rester immédiate et adaptée à une capture « sur l’instant » ;
- des gestes rapides peuvent exister pour les utilisateurs avancés, mais ils ne doivent jamais être obligatoires pour comprendre ou utiliser la fonction.

### 3. Créer

Regroupe la production de nouveaux contenus.

Pour un débutant, limiter fortement les choix visibles, par exemple :
- Texte ;
- Dessin.

Les fonctions plus complexes peuvent apparaître progressivement selon le niveau de maîtrise :
- mise en page ;
- image ;
- code ;
- générateurs ;
- autres outils de création.

Pour le niveau débutant, privilégier par défaut un **mode Liste**, plus simple à comprendre.

### 4. Trouver

Recherche universelle.

Doit permettre de retrouver rapidement :
- données ;
- documents ;
- contenus ;
- projets ;
- personnes ;
- éléments internes à atome.

Trouver reste au premier niveau : la recherche est suffisamment fondamentale pour ne pas être cachée dans Organiser.

### 5. Communiquer

Regroupe les moyens de communication.

Peut contenir notamment :
- texte / messagerie ;
- audio ;
- vidéo ;
- téléphonie ;
- contacts et autres moyens de mise en relation.

---

## 2. Ce qui ne doit pas occuper une icône racine

Les éléments suivants ne doivent pas ajouter de sixième icône au menu débutant :

- Assistant ;
- Aide ;
- Préférences ;
- Profil / utilisateur ;
- modes de vue ;
- modes d’exécution / consultation / édition ;
- fonctions avancées ;
- commande dédiée de masquage de l’interface.

Ces fonctions sont soit contextuelles, soit accessibles ailleurs, soit réservées aux niveaux de maîtrise supérieurs.

---

## 3. Mystic : accès global et contextuel

Mystic reste disponible globalement par **appui long**.

Il sert notamment à :
- accéder à l’Assistant / aide ;
- proposer les actions contextuelles liées à l’objet ou à la situation.

Il ne faut pas ajouter une icône Mystic dans les cinq outils de base.

**Important : le masquage / réaffichage de la barre ne dépend plus de Mystic.**

Le but est d’éviter d’ajouter dans Mystic une commande système supplémentaire et surtout d’éviter tout conflit avec sa taxonomie contextuelle, qui varie selon le type d’objet ou le contexte courant.

---

## 4. Masquer et réafficher le menu

Objectif : permettre d’obtenir ponctuellement un écran totalement dégagé sans ajouter de sixième icône et sans dépendre de Mystic.

### Principe général

L’accès **Organiser / Dashboard**, placé au bord de l’écran, sert aussi de point d’ancrage au comportement de masquage.

- **Clic simple** : comportement normal de l’outil Organiser / Dashboard.
- **Appui long** : bascule l’état d’affichage de la barre du menu.

### Masquer

1. L’utilisateur effectue un **appui long sur l’accès Organiser / Dashboard**.
2. Toute la barre des cinq outils disparaît.
3. Aucun sixième bouton « masquer » n’est ajouté.
4. L’état masqué reste actif tant que l’utilisateur ne demande pas explicitement le retour de la barre.

Lors de la toute première utilisation de cette fonction, afficher un avertissement / tutoriel très court indiquant clairement comment faire réapparaître le menu.

### Réafficher — utilisateur avancé / expert

Lorsque la barre est entièrement masquée :

- aucune icône n’est obligatoirement visible ;
- la **zone tactile système correspondant à la position de l’accès Organiser / Dashboard reste active**, même si elle est visuellement invisible ;
- un **appui long sur cette même zone** réaffiche les cinq outils.

Ainsi :
- la surface peut être totalement dégagée ;
- aucune commande n’est ajoutée dans Mystic ;
- aucune sixième icône n’est nécessaire ;
- le geste pour masquer et réafficher est symétrique : même emplacement, même appui long.

### Réafficher — utilisateur débutant

Pour un débutant, ne jamais laisser l’utilisateur sans aucun repère visuel.

Quand la barre est masquée :
- conserver dans le coin un **petit repère / bouton système visible** ;
- ce repère peut avoir une représentation différente de l’icône Dashboard normale afin d’indiquer qu’il sert à rappeler l’interface ;
- un clic sur ce repère réaffiche immédiatement les cinq outils ;
- l’utilisateur n’a pas besoin de mémoriser l’existence d’une zone invisible.

Le niveau débutant conserve donc la possibilité de dégager l’écran, mais avec une sécurité visuelle permanente.

---

## 5. Comportement pendant la manipulation d’un objet

Lorsqu’un utilisateur déplace ou manipule un objet :

- les éléments système peuvent disparaître automatiquement ;
- l’utilisateur bénéficie alors de toute la surface de l’écran ;
- au relâchement, l’interface revient automatiquement si elle était affichée avant la manipulation ;
- si l’utilisateur avait volontairement masqué la barre, elle reste masquée après la manipulation.

Ce comportement évite qu’une barre ou un menu gêne directement une manipulation.

---

## 6. Problème : objet placé derrière la barre

Un débutant peut déplacer un objet pendant que l’interface est masquée, puis voir cet objet recouvert lorsque la barre réapparaît.

Il ne faut pas :
- interdire une partie de l’écran ;
- créer une « zone morte » permanente ;
- déplacer les coordonnées réelles de l’objet ;
- imposer un scroll HTML classique.

### Solution retenue : ajuster la caméra / le viewport

Quand la barre réapparaît :

1. Si l’objet qui vient d’être manipulé est recouvert, **pan automatique léger** de la vue pour le rendre visible.
2. Si ce pan risque de masquer ou couper une partie importante du projet ailleurs, appliquer un **léger zoom-out automatique**.
3. Le zoom doit être le minimum nécessaire pour conserver les éléments importants visibles.
4. Les coordonnées des objets restent inchangées : seule la caméra / vue change.

### Priorité

**Pan d’abord, léger dézoom seulement si nécessaire.**

Le but est que le débutant ne puisse jamais « perdre » l’objet qu’il vient de poser.

---

## 7. Pan et zoom globaux

Le projet doit pouvoir être :
- déplacé globalement par panning ;
- zoomé / dézoomé.

Cela permet notamment :
- d’accéder à un contenu momentanément situé derrière une zone d’interface ;
- de conserver toute la surface logique du projet ;
- d’éviter de considérer la barre comme une limite réelle du canvas.

Un outil ou contrôle de zoom peut être proposé si nécessaire, y compris pour les débutants, à condition de rester simple.

---

## 8. Adaptation au niveau de maîtrise

Le niveau de maîtrise ne doit pas simplement changer l’apparence : il doit contrôler la densité fonctionnelle et le niveau de sécurité de l’interface.

### Débutant

- 5 outils racine maximum ;
- gros repères stables ;
- Créer fortement limité ;
- mode Liste privilégié par défaut ;
- guidage plus important ;
- options avancées masquées ;
- disparition temporaire des éléments système pendant la manipulation ;
- sécurité automatique de pan / zoom pour éviter les objets inaccessibles ;
- si le menu est volontairement masqué, conserver un petit repère visible permettant de le réafficher immédiatement.

### Utilisateur avancé / expert

Peut recevoir progressivement :
- davantage de modes de vue ;
- modes d’exécution / consultation / édition ;
- commandes avancées ;
- raccourcis gestuels ;
- masquage complet de l’interface ;
- zone de rappel invisible à l’emplacement Organiser / Dashboard ;
- fonctions supplémentaires contextuelles via Mystic.

Le principe est de ne pas exposer à un débutant la complexité utile à un expert.

---

## 9. Principe directeur

Le menu racine ne doit pas représenter tout ce qu’atome sait faire.

Il doit représenter uniquement les **intentions humaines essentielles** :

**Organiser — Capturer — Créer — Trouver — Communiquer**

Tout le reste doit être :
- contenu dans ces intentions ;
- contextuel via Mystic lorsque cela relève réellement du contexte ;
- ou révélé progressivement selon le niveau de maîtrise.

Le masquage de la barre est une **fonction système du menu lui-même**, et non une fonction contextuelle Mystic.

La cible est donc une interface qui peut être très guidée pour un débutant, très dense pour un expert, et totalement dégagée lorsque l’utilisateur veut travailler sans interface visible.
