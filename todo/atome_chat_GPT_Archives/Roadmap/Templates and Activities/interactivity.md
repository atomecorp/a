# Interactivity — théorie, interface et scénarios de validation

> **Statut :** brouillon fonctionnel à confronter au code d’atome/eVe. Les noms de commandes et l’agencement du panneau sont des propositions d’interface, pas des composants dont l’existence est confirmée dans le dépôt. Le premier scénario sert de cas de test après génération du code.

## 1. Trois notions à ne pas confondre

### Activité Interactivité

L’utilisateur choisit l’activité **Interactivité** dans le menu du bas. Elle fournit le contexte de travail pour configurer et utiliser des interactions. Elle est distincte du mode Jeu.

### Outil Interaction

Dans le contexte du projet ou d’un atome, l’utilisateur sélectionne l’outil **Interaction** disponible dans la barre latérale. Son panneau sert à configurer les liens entre un déclencheur, une cible et une action. Le Finder est utilisé dans le réglage d’une cible; il ne sert pas à trouver l’outil Interaction.

### Template

Un **template** est **un projet atome comme les autres**, fondé sur le même modèle de projet, mais identifié comme **projet de type template** afin de servir de base réutilisable. Il peut contenir des atomes/molécules, des placeholders, des réglages, des conditions et une ou plusieurs interactions déjà configurées. Le statut template ne crée pas un format de projet parallèle : il qualifie un projet atome destiné à être réutilisé comme modèle. Ce n’est ni l’outil Interaction ni une interaction isolée.

Lorsqu’un template sert à créer un nouveau projet, le résultat reste un projet atome normal. Comme pour tout projet, son **mode de travail actif au moment de la fermeture devient automatiquement son mode par défaut pour la prochaine ouverture**. Un template peut donc s’ouvrir par défaut en Consultation, Édition ou Performance selon le dernier mode dans lequel il a été fermé. Pour l’instant, le verrouillage par utilisateur ou par profil est **optionnel et reporté à une étape ultérieure**. Le retour au mode Édition suit le **système standard déjà prévu dans AF** : l’utilisateur fait un **clic long sur le projet**, puis choisit l’option de retour à l’édition dans le menu contextuel. Ce comportement est déjà prévu par AF; ce n’est pas une fonction nouvelle du template ou de l’outil Interaction.

## 2. Modèle d’une interaction

Une interaction relie :

**Déclencheur → Cible → Action**

- **Déclencheur :** événement émis par un atome ou une activité, par exemple l’activation d’un atome de type bouton.
- **Cible :** un ou plusieurs atomes concernés par l’action.
- **Action :** capacité déjà disponible dans atome/eVe, compatible avec les types d’objets ciblés et les droits de l’utilisateur. Pour un redimensionnement, l’action permet de choisir l’axe X (largeur), l’axe Y (hauteur) ou les deux, de régler la ou les valeurs, et d’activer ou non la conservation des proportions (homothétie). Lorsque cette option est activée avec un seul axe réglé, l’autre dimension suit pour conserver les proportions; lorsqu’elle est désactivée, l’objet peut être déformé.

Les atomes ont un type de base. Le Finder sert à chercher **des objets et des outils** : la recherche ne doit pas être limitée aux objets. Depuis l’interaction, l’utilisateur peut choisir des objets comme source ou cible, puis rechercher les outils existants à ajouter au traitement.

Les outils ajoutés sont les outils atome eux-mêmes, reliés à leurs capacités et connexions API/MCP existantes. Chaque outil apparaît physiquement dans la composition sous sa tuile carrée normalisée — icône au-dessus, libellé dessous — comme dans la barre latérale. Ses réglages sont affichés juste en dessous, dans le style et la logique de l’outil. Aucun menu d’actions parallèle ni réglage fictif ne doit être créé.

### Principe outil-first — règle générale

Le système d’Interactivité doit s’appuyer au maximum sur des **outils atome réels et réutilisables**. Une capacité fonctionnelle réutilisable ne doit pas exister uniquement comme logique cachée ou commande spéciale du panneau Interaction : elle doit correspondre à un outil atome existant ou, si cet outil n’existe pas encore, conduire à la création de l’outil atome correspondant. Par exemple, une liste doit être manipulée au travers de l’outil atome de liste correspondant, et non par une implémentation parallèle propre à Interaction.

Tout outil utilisable par Interaction doit être **recherchable dans le Finder**, même s’il n’est pas présent dans l’arborescence ou la barre d’outils affichée par défaut. Lorsqu’il est choisi dans le panneau Interaction, c’est le **véritable composant de l’outil** qui est affiché avec son apparence normalisée et ses options natives. Le panneau ne doit ni recopier son interface, ni dupliquer son style, ni réimplémenter sa logique. Le même composant, le même style, les mêmes comportements et les mêmes contrats/API doivent être réutilisés.

Cette règle vaut aussi pour les nouveaux besoins découverts lors de la construction des templates : si une capacité manque, elle doit être ajoutée comme outil atome réutilisable avant d’être assemblée dans Interaction, plutôt que codée spécifiquement pour un seul scénario.

Il faut distinguer **atome** et **outil** : une source ou un contenu comme Météo, Contacts, Calendrier, Liste, Audio ou Vidéo est normalement représenté par un **atome** ; un outil représente une capacité permettant de créer, modifier, relier, filtrer ou traiter ces atomes. Les deux doivent pouvoir être retrouvés et sélectionnés via le Finder lorsque le contexte d’Interaction le nécessite.

Une interaction peut assembler plusieurs outils en cascade. Leur ordre dans la composition définit l’ordre des traitements. Chaque outil garde son apparence, ses options et son comportement propres; l’utilisateur peut ajouter un outil depuis le Finder, puis en ajouter d’autres.

Pour le redimensionnement, le cahier des charges prévoit le choix X, Y ou X+Y, la valeur de dimension, un slider et l’option d’homothétie. Le code doit vérifier quelles options existent déjà et réutiliser leur contrat; les options manquantes sont à intégrer au module Redimensionner, sans changer le design normalisé des outils.

### Cibles fixes et dynamiques

- **Sélection fixe :** conserve les références des atomes choisis pendant la configuration.
- **Sélection dynamique :** conserve des critères et évalue les objets qui y répondent. Les objets nouvellement créés ou modifiés peuvent être inclus lors des prochaines exécutions.

Les critères doivent afficher sans ambiguïté les groupes logiques. Par exemple :

**(largeur > 30 px OU hauteur > 30 px) ET type ≠ Vidéo**

Le filtre reste distinct des outils de traitement : il désigne les objets, tandis que les outils assemblés indiquent ce qu’il faut leur faire.

### Projets/templates imbriqués — règles validées

Un projet atome peut contenir une **instance liée d’un autre projet de type template**. Cette instance n’est pas une copie détachée : elle conserve une référence vers son template source et reçoit automatiquement les modifications ultérieures de ce template. Si cette capacité projet-dans-projet n’existe pas encore dans le code, elle devra être ajoutée en réutilisant le modèle de projet existant plutôt qu’en créant un type d’objet parallèle.

Lorsqu’un projet-template est embarqué dans un projet parent, son **mode de travail** n’est pas autonome : il est assujetti au mode de travail du projet parent. En revanche, sa **vue** (par exemple Naturel, Liste ou Matrice) peut rester propre à l’instance si le template le prévoit.

Les droits de modification d’une instance liée ne sont pas définis par Interaction ni par le système de templates. Ils réutilisent le mécanisme existant de **Communication / partage** : les droits sont portés par l’objet partagé lui-même et déterminent notamment si l’utilisateur peut modifier l’objet, créer une copie ou effectuer une modification dynamique. La possibilité de modifier les droits dépend elle-même des permissions détenues.

Les mises à jour du template source modifient la **structure** des instances liées sans effacer simplement leurs données propres. Le passage d’une instance en mode Édition ne supprime pas son contenu. Les données déjà placées dans les placeholders restent associées aux mêmes placeholders lors d’un déplacement ou d’un renommage. Si un placeholder est supprimé du template source, ce placeholder, son contenu dans l’instance et sa liaison sont supprimés de l’instance ; une ressource indépendante référencée par ce placeholder n’est pas détruite si elle existe par ailleurs.

Le template reste responsable de la structure, de la disposition, des placeholders et des comportements configurés. Interaction sert à exprimer les relations et comportements choisis par l’auteur du template ; il ne doit pas imposer de comportement spécifique à un type de contenu. Un clic, une sélection ou tout autre déclencheur n’est donc pas intrinsèque à une liste : il dépend de ce que l’auteur a configuré dans le template.

## 3. Workflow complet de l’interactivité — brouillon à vérifier dans le code

1. L’utilisateur ouvre un projet dans eVe et choisit l’activité **Interactivité** dans le menu du bas.
2. Il choisit la portée concernée : le projet ou un atome précis, selon le besoin.
3. Il ouvre **Interaction** depuis la barre latérale. Le panneau reprend les teintes, proportions et tuiles normalisées de cette barre.
4. Il crée une interaction dans le panneau (le libellé exact de la commande reste à vérifier dans l’interface/code).
5. Dans le bloc **Déclencheur**, il sélectionne l’événement et l’objet qui le déclenche. Pour un bouton, celui-ci est créé manuellement avec la manipulation standard, puis sélectionné ici.
6. Dans le bloc **Entrée**, il choisit la **Sélection active** du projet ou le **Finder**.
7. Avec le Finder, il peut rechercher des objets et constituer une cible fixe ou une sélection dynamique fondée sur des propriétés et critères. Il vérifie les objets ou le filtre obtenu avant validation.
8. Pour définir le traitement, il utilise aussi le Finder pour rechercher les outils atome existants. Les résultats de recherche peuvent contenir des objets ou des outils; les catégories ne doivent pas enfermer l’utilisateur dans une recherche d’objets uniquement.
9. Il sélectionne un outil dans les résultats. L’outil choisi est ajouté à la composition comme tuile carrée réelle, identique à sa représentation normalisée dans la barre latérale : icône au-dessus, libellé dessous.
10. Les options de cet outil s’ouvrent directement sous sa tuile, sous la forme visuelle prévue pour les outils atome. Pour Redimensionner, elles comprennent le slider et les réglages X, Y ou X+Y, avec le choix de conserver ou non l’homothétie.
11. Il peut rechercher et ajouter plusieurs outils de la même manière. Les outils apparaissent comme modules distincts; leur ordre définit la cascade de traitements. Chaque module affiche ses propres options dessous.
12. Il vérifie l’entrée, la cible, l’ordre des outils et leurs réglages, puis enregistre la configuration dans le projet. Si ce projet est destiné à servir de template, il est identifié comme projet de type template par le système de templates ; l’outil Interaction ne crée pas un format de projet distinct.
13. L’interaction s’exécute en mode **Consultation** ou **Performance**, dans un projet ordinaire ou un template; elle ne s’exécute pas en mode **Édition**. Pour modifier le projet, le retour au mode Édition suit le système standard prévu dans AF.

Le Finder et la composition doivent réutiliser les outils, composants, contrats API/MCP et comportements existants. Les captures fournies confirment visuellement certaines tuiles (dont Redimensionner), mais l’inventaire réel, les options disponibles et les connexions correspondantes restent à vérifier dans le code avant implémentation. Tout outil ou option absent du code doit être signalé comme travail à réaliser, pas présenté comme déjà existant.

L’interactivité peut être utilisée dans un projet ordinaire ou dans un template, en mode **Consultation** ou **Performance**, jamais en mode **Édition**. L’interface doit tenir compte du projet ou de l’atome sélectionné, de l’activité, du mode actif et des permissions. Les libellés ci-dessus sont des éléments du brouillon à vérifier avec les composants et contrats du code.

## 4. Premier exemple — redimensionner les objets correspondants

### Résultat attendu

Dans cet exemple d’utilisation, l’activation d’un bouton redimensionne les atomes qui correspondent au filtre dynamique :

**(largeur > 30 px OU hauteur > 30 px) ET type ≠ Vidéo**

L’action est réglée sur **redimensionner à 80 × 80 px**, avec le choix explicite de conserver ou non les proportions. Une vidéo est toujours exclue. Les atomes qui correspondent au filtre plus tard doivent pouvoir être pris en compte lors des activations suivantes.

### Création du template dans eVe

1. L’utilisateur ouvre le projet qui servira de base au template.
2. Il choisit **Interactivité** dans le menu du bas.
3. Il choisit la portée **Projet**.
4. Il sélectionne **Interaction** dans la barre latérale. Le panneau Interaction se déplie.
5. S’il n’y a encore aucune interaction, il choisit la commande de création affichée dans l’état vide. La fiche **Déclencheur / Cible / Action** apparaît.
6. Il crée manuellement un atome de type **bouton** avec la manipulation standard. Dans **Déclencheur**, il choisit l’événement **Activation**, puis sélectionne cet atome comme source. Le template ne crée pas lui-même le bouton.
7. Dans **Entrée**, il choisit le Finder pour rechercher les objets à cibler et définit une **sélection dynamique**.
8. Il règle le premier critère : **Largeur** → **supérieure à** → **30 px**.
9. Il ajoute un critère relié par **OU** : **Hauteur** → **supérieure à** → **30 px**.
10. Il ajoute l’exclusion de type : **ET Type** → **différent de** → **Vidéo**.
11. Le Finder affiche la condition groupée **(largeur > 30 px OU hauteur > 30 px) ET type ≠ Vidéo**. L’utilisateur la vérifie et valide la cible.
12. Pour définir le traitement, il utilise le Finder pour rechercher l’outil atome existant **Redimensionner** et le sélectionne. La tuile carrée de l’outil apparaît dans la composition, avec son icône et son libellé comme dans la barre latérale.
13. Les options de Redimensionner apparaissent directement sous la tuile. Il sélectionne X et Y et règle chaque dimension à **80 px**. Il peut activer ou désactiver l’homothétie. Pour obtenir exactement 80 × 80 px, il désactive la conservation des proportions, ce qui peut déformer l’objet.
14. Le panneau affiche les modules ordonnés : déclencheur → entrée/cible → outil Redimensionner et ses options. L’utilisateur vérifie le résultat puis enregistre la configuration dans le projet. Si ce projet doit devenir un template, il est alors identifié comme projet de type template par le système de templates.
15. Le mode actif lorsque le projet-template est fermé devient automatiquement son mode d’ouverture par défaut. S’il est fermé en **Consultation**, il se rouvrira en Consultation ; la même règle vaut pour Édition et Performance. Le verrouillage par profils reste une possibilité future et n’est pas nécessaire pour cette première version.

### Utilisation du template

1. Un utilisateur ouvre le template ou crée un nouveau projet à partir de lui. Le projet résultant s’ouvre dans le mode prévu, par exemple Consultation.
2. Il active le bouton qu’il a créé manuellement et sélectionné comme déclencheur.
3. Interaction évalue la sélection dynamique et applique l’action aux atomes admissibles; les vidéos restent exclues.
4. Lors des activations suivantes, les nouveaux atomes qui répondent aux critères sont inclus.
5. Pour modifier le projet-template, l’utilisateur reprend le système standard déjà prévu dans AF : clic long sur le projet, puis choix de l’option de retour au mode Édition dans le menu contextuel. Le contrôle des droits par profil pourra être ajouté ultérieurement.

### Vérifications IA après génération du code

- Un atome dont seule la largeur dépasse 30 px est ciblé.
- Un atome dont seule la hauteur dépasse 30 px est ciblé.
- Un atome dont aucune dimension ne dépasse 30 px n’est pas ciblé.
- Une vidéo est exclue même lorsque ses dimensions dépassent le seuil.
- L’activation du bouton applique 80 px sur X et 80 px sur Y aux atomes ciblés lorsque la conservation des proportions est désactivée.
- Un nouvel atome qui répond aux critères est pris en compte à l’activation suivante.
- Avec un seul axe réglé et la conservation des proportions activée, l’autre dimension suit afin de conserver le rapport initial.
- Avec la conservation des proportions désactivée, l’axe non réglé ne suit pas; l’objet peut être déformé.
- Quand X et Y sont réglés séparément et que la conservation des proportions est désactivée, les deux valeurs sont appliquées exactement, même si l’objet est déformé.
- Si X et Y sont réglés à 80 px avec conservation des proportions activée, le comportement conserve le rapport initial; la dimension dérivée peut donc différer de 80 px.
- Une nouvelle vidéo reste exclue.
- La règle peut être utilisée dans un projet ordinaire ou un template en mode Consultation ou Performance, et ne s’exécute pas en mode Édition.
- La configuration et ses références sont conservées après sauvegarde puis réouverture du template.
- Le retour au mode Édition reprend le système standard déjà prévu dans AF : clic long sur le projet, puis choix de l’option correspondante dans le menu contextuel. Il ne s’agit pas d’une nouvelle fonction propre au template ou à Interaction.
- Le verrouillage et les droits de modification par profil ne sont pas requis pour cette version; ils restent une évolution possible.
- Le Finder permet de retrouver des objets et des outils; sa recherche ne doit pas exclure l’un de ces deux types de résultats.
- Un outil sélectionné apparaît comme une tuile carrée normalisée, avec icône au-dessus et libellé dessous, conformément à la barre latérale existante.
- Les options du tool Redimensionner sont visibles directement sous sa tuile et reprennent le style atome prévu pour ses contrôles.
- Plusieurs outils peuvent être ajoutés puis exécutés en cascade dans l’ordre affiché; chaque outil conserve son module et ses options propres.

**Point à raccorder au code :** vérifier les noms et le contrat de la capacité de redimensionnement existante, notamment la sélection des axes X/Y et l’option de conservation des proportions. Les tests doivent reprendre ce contrat et distinguer le redimensionnement proportionnel du redimensionnement indépendant.

## 5. Autres scénarios prévus

Ces cas sont des templates distincts; le contrôle de timeline ne fait pas partie du scénario de liste.

### Scénario 2 — liste dynamique associée à des instances de template

L’intitulé historique « Liste avec pages audio » désigne un **exemple générique**, pas une fonction spécifique à l’audio. Le même mécanisme doit pouvoir servir à des listes de vidéos, contacts, documents ou tout autre type d’objets compatible.

Dans l’exemple musical, le projet parent contient une liste de morceaux. Chaque élément de cette liste est associé à une **instance liée d’un même projet-template enfant**, par exemple un template « Fiche morceau ». Cette fiche peut contenir des placeholders tels que le titre, la pochette, le nom de l’album, un contenu audio ou d’autres données prévues par le template. La position de la liste, l’emplacement de la fiche, sa présentation et les interactions utilisées pour l’afficher sont définis par les templates concernés ; aucune disposition ni aucun déclencheur n’est imposé par le système de liste lui-même.

La liste peut être alimentée de plusieurs façons sans créer de mécanisme spécifique à ce scénario. L’utilisateur peut ajouter les éléments **un par un** au moyen de l’outil atome de liste, ou alimenter la liste **globalement à partir d’une source importée** avec le système d’import déjà existant dans atome, par exemple une liste ou un dossier. Interaction travaille ensuite sur les éléments présents dans la liste et leurs relations ; il ne doit pas réimplémenter le mécanisme d’import.

Lorsqu’un nouvel élément est ajouté à la liste, une nouvelle instance liée du template enfant associé est créée automatiquement et reliée à cet élément. Chaque élément conserve une correspondance stable avec son instance. Les mises à jour du template enfant se propagent automatiquement à toutes ses instances selon les règles générales des projets/templates imbriqués, tout en conservant les données propres à chaque instance lorsque les placeholders correspondants subsistent.

Cette correspondance doit reposer sur **l’identité stable de l’objet atome source**, jamais sur sa position dans la liste ni sur son nom affiché. Un réordonnancement de la liste, un renommage ou toute autre modification de présentation ne doit donc pas recréer l’instance ni la rattacher au mauvais élément : la fiche reste liée au même objet tant que son identité atome est conservée.

Une même liste peut utiliser **plusieurs templates enfants différents**. Le template à instancier pour un élément est défini par la configuration d’Interactivité de l’auteur : il peut par exemple associer certains éléments à un template « Fiche audio » et d’autres à un template « Fiche vidéo », ou utiliser tout autre critère prévu par l’interaction. Le système ne doit pas coder de règles spéciales propres à l’audio, à la vidéo ou à un type de liste particulier ; la sélection du template fait partie de l’assemblage défini avec les outils et relations d’Interaction.

L’affectation du template enfant doit pouvoir fonctionner de deux façons complémentaires :
- **automatique/dynamique**, au moyen des critères et règles d’Interaction (type, propriété, condition ou autre critère disponible) ;
- **manuelle**, élément par élément, afin que l’auteur puisse déroger à la règle automatique pour un objet précis.

La priorité est : **affectation manuelle explicite > règle dynamique > template par défaut**. Le template par défaut n’est utilisé que si aucune affectation manuelle ni règle dynamique ne correspond. Ces trois niveaux doivent réutiliser les sélections fixes/dynamiques et les outils existants d’Interaction plutôt que créer un système parallèle.

La correspondance entre les données de l’élément et les placeholders du template enfant est définie explicitement par l’auteur au moyen du système **Interaction**. Par exemple, dans le cas musical, le champ titre peut être relié au placeholder Titre, le champ album au placeholder Album, l’image au placeholder Pochette et le fichier audio au placeholder Audio. Le système ne doit pas inventer de correspondance automatique fondée sur le nom ou le type des champs : ces liaisons font partie de la configuration d’interactivité du template.

Les suppressions, modifications, créations de copie et modifications dynamiques doivent se conformer aux règles générales déjà définies pour les objets et aux droits portés par l’objet via Communication / partage ; ce scénario ne crée pas de règles spécifiques supplémentaires.
### Scénario 3 — page dynamique alimentée par des atomes sources

Un template peut présenter des données provenant de plusieurs **atomes sources** : par exemple un atome Météo, un atome Contacts, un atome Calendrier, un atome Date/Heure ou un atome Liste. Ces éléments sont d’abord des atomes réels du système, recherchables et sélectionnables dans le Finder, puis reliés aux placeholders ou aux autres atomes du template avec Interaction.

La distinction est importante : **la donnée ou la source est portée par un atome ; les outils sont les capacités qui permettent d’agir sur les atomes ou de les configurer**. Interaction relie les atomes entre eux et peut aussi assembler les outils nécessaires à leur traitement. Le panneau doit afficher les véritables atomes et outils avec leurs composants et styles natifs, sans duplication de code ou d’interface.

Dans l’exemple de référence, la page peut contenir la date et l’heure, la météo, des contacts avec vignette, une liste et des événements d’agenda. Les liaisons entre les sorties de ces atomes sources et les placeholders du template sont configurées explicitement dans Interaction. Les mises à jour dynamiques et les droits suivent les règles générales déjà définies pour les objets et Communication / partage. Une action telle que l’envoi d’un message reste une action explicite déclenchée selon l’interaction configurée par l’auteur du template.
### Scénario 4 — contrôle d’une timeline existante

Le template référence une **timeline déjà existante** dans le projet ; il ne crée pas de système de timeline parallèle et ne remplace pas la timeline source. La sélection de la timeline, des contrôles et des relations doit réutiliser les atomes, outils et mécanismes d’Interaction déjà définis.

Le template peut contenir des contrôles **Lecture / Pause / Stop** ainsi qu’un **slider lié à la timeline**. Le slider fonctionne dans les deux sens :
- lorsque la timeline avance pendant la lecture, la position du slider suit automatiquement la tête de lecture ;
- lorsque l’utilisateur déplace le slider, la tête de lecture de la timeline est déplacée immédiatement à la position correspondante.

Il s’agit d’une liaison réelle avec la timeline, pas d’une copie visuelle de son état. La plage et la position du slider doivent donc rester cohérentes avec l’état courant de la timeline et suivre ses évolutions selon les règles générales de liaison dynamique d’Interaction.

### Scénario 5 — recréation complète du Dashboard actuel sous forme de template

Ce scénario reproduit le Dashboard actuel sous la forme d’un **projet atome de type template système**, composé d’atomes, d’outils et d’interactions réels. Le Dashboard ne doit pas devenir un composant monolithique ni une interface spéciale codée à part : il doit démontrer qu’un projet complet peut être reconstruit par composition avec les mécanismes ordinaires d’atome/eVe.

La capture de référence et les décisions fonctionnelles définissent la structure suivante.

#### Structure générale : rails horizontaux + leaders

Le Dashboard est organisé en plusieurs **rails horizontaux de contenu** dans la zone principale et un **rail de leaders** placé sur un bord de l’écran. Dans la configuration actuellement illustrée, les leaders sont à droite. Le template doit cependant tenir compte du contexte **droitier/gaucher** déjà prévu par atome : le rail de leaders peut donc être placé à droite ou à gauche selon ce contexte, sans créer deux Dashboards indépendants.

Cette adaptation constitue un cas concret de **mise en page conditionnée par le contexte utilisateur**. Le mécanisme technique exact doit réutiliser le contexte droitier/gaucher existant ; il ne faut pas inventer une préférence parallèle propre au Dashboard.

Chaque leader correspond à une famille de contenu et à son rail horizontal :

- **Calendrier** ;
- **News** ;
- **Contacts** ;
- **Moniteur** ;
- **Projets**.

Le contenu d’un rail est alimenté dynamiquement par les atomes/sources correspondants et peut être parcouru horizontalement. Certains éléments sont **fixes** et ne participent pas au défilement, tandis que les éléments dynamiques du rail peuvent défiler. Le leader reste lui aussi une référence fixe sur le bord prévu par le template.

Chaque leader expose également l’action **Nouveau**, qui déclenche la création d’un nouvel objet du type correspondant en réutilisant l’outil/capacité atome existant. Le Dashboard ne doit pas implémenter une seconde logique de création.

#### Rail Calendrier

Le premier élément fixe du rail Calendrier est l’élément **Date/Heure**, issu de l’outil Date/Heure existant. Il reste visible et ne se déplace pas avec les événements du rail.

Les événements du calendrier — rendez-vous et autres événements gérés par le système Calendrier — alimentent dynamiquement le reste du rail selon l’ordre fourni par la source Calendrier. Les événements affichés sont des objets réels reliés à cette source, pas des copies visuelles indépendantes.

Le leader **Calendrier** possède deux comportements configurés avec Interaction :

- activation du leader → afficher l’ensemble du contenu Calendrier dans la zone centrale afin de pouvoir le parcourir avec plus d’espace ;
- activation de **Nouveau** → créer un nouvel événement avec le mécanisme Calendrier existant.

#### Rail News

Le premier élément fixe du rail News est **Météo**. Il reste visible et ne participe pas au défilement des nouvelles.

Le reste du rail est alimenté par les **News/messages reçus** : informations généralistes, publications ou messages provenant du système de News/communication déjà défini dans atome. Ce scénario ne redéfinit pas le mécanisme de réception ; il réutilise la source et les objets existants, puis les présente dans le rail.

Le leader **News** permet :

- d’afficher toutes les News dans la zone centrale, avec parcours/défilement du contenu ;
- via **Nouveau**, de créer une nouvelle News/publication au moyen de la capacité existante correspondante.

#### Rail Contacts

Le propriétaire du compte atome utilisé sur le device apparaît **toujours en tête** du rail Contacts comme élément fixe/de référence. Les autres positions sont alimentées par les **contacts les plus récents** selon l’ordre fourni par la source Contacts.

Une interaction sur un contact peut, selon la configuration définie dans le template et les capacités existantes, **ouvrir sa fiche** ou **contacter la personne**. Aucun de ces comportements ne doit être imposé intrinsèquement par le type Contact : ils sont configurés avec Interaction en réutilisant les actions existantes.

Le leader **Contacts** permet :

- d’afficher l’ensemble des contacts dans la zone centrale ;
- via **Nouveau**, de créer un nouveau contact avec le mécanisme Contacts existant.

#### Rail Moniteur

Le rail **Moniteur** présente les monitorings et tâches en cours. Un monitoring n’est pas limité à un domaine particulier : il peut concerner une tâche de projet, un spectacle, une mise en page, une randonnée, une activité sportive, le sommeil, une donnée physiologique ou tout autre suivi compatible avec les sources et outils disponibles dans atome.

Certains monitorings peuvent être proposés par défaut par le système, tandis que l’utilisateur peut configurer ailleurs ceux qu’il souhaite suivre. Le Dashboard ne duplique pas leurs réglages : il affiche et relie les objets de monitoring existants.

Le leader **Moniteur** permet :

- d’afficher l’ensemble des monitorings dans la zone centrale ;
- via **Nouveau**, d’ajouter un nouveau monitoring et de le rattacher à la source, au projet ou à la donnée concernée au moyen des outils existants.

#### Rail Projets

Le rail **Projets** présente les projets de l’utilisateur, avec les projets récents ordonnés selon la date fournie par le système Projet. Chaque élément est un projet atome réel et conserve son identité stable.

Le leader **Projets** permet :

- d’afficher tous les projets dans la zone centrale ;
- via **Nouveau**, de créer un nouveau projet avec le mécanisme de création de projet existant.

#### Ouverture d’un leader dans la zone centrale

L’activation d’un leader — Calendrier, News, Contacts, Moniteur ou Projets — remplace/alimente la **zone centrale de consultation** avec la collection complète correspondante. Cette vue permet de parcourir davantage d’éléments que le rail résumé du Dashboard.

Cette relation doit être exprimée par Interaction : **leader activé → source/collection correspondante → affichage dans l’emplacement central défini par le template**. La géométrie, les placeholders et l’emplacement de cette vue sont définis par le template ; Interaction ne doit pas coder une position arbitraire.

#### Construction du Dashboard avec Template + Interaction

La réalisation de référence doit suivre le principe suivant :

1. créer ou identifier le **projet-template système Dashboard** ;
2. reproduire la composition visuelle du Dashboard de référence dans ce template avec les atomes/molécules et styles réels ;
3. définir le rail de leaders et son placement contextuel droite/gauche en réutilisant le contexte droitier/gaucher d’atome ;
4. placer les éléments fixes : Date/Heure dans le rail Calendrier, Météo dans le rail News, propriétaire du compte en tête du rail Contacts ;
5. relier chaque rail à sa source réelle avec Interaction : Calendrier, News/communication, Contacts, Moniteur et Projets ;
6. utiliser des relations dynamiques pour alimenter les rails sans copier ni dupliquer les sources ;
7. relier chaque leader à l’affichage de sa collection complète dans la zone centrale ;
8. relier chaque commande **Nouveau** à l’outil/capacité existant permettant de créer l’objet correspondant ;
9. conserver les composants, styles, icônes, options et contrats existants : aucune tuile factice ni interface parallèle ne doit être créée ;
10. vérifier que les données et identités des objets restent stables lors des tris, renommages, changements d’ordre ou mises à jour du template ;
11. valider le fonctionnement dans les modes autorisés et avec les permissions déjà définies par Communication/partage.

Les noms techniques exacts des sources, outils et événements doivent être raccordés au code réel au moment de l’implémentation. Si un élément fonctionnel nécessaire n’existe pas encore, il doit être créé comme **atome ou outil réutilisable** selon la règle outil-first, et non comme logique privée du Dashboard.

#### Cycle de vie du Dashboard système

Le Dashboard de chaque utilisateur reste une **instance liée du template système Dashboard**. Toute mise à jour de ce template système fournie par atome est appliquée **automatiquement et sans possibilité de refus** aux Dashboards déjà existants. Il n’y a ni demande de confirmation ni option permettant de conserver volontairement une ancienne structure.

Cette propagation respecte les règles générales des instances liées : les données propres à l’utilisateur restent associées aux placeholders correspondants tant que ceux-ci existent ; un déplacement ou un renommage structurel ne doit pas effacer ces données ; si un placeholder est supprimé par une nouvelle version du template système, son contenu et sa liaison disparaissent conformément aux règles déjà définies, sans supprimer une ressource indépendante existant par ailleurs.

#### Vérifications fonctionnelles minimales

- Le Dashboard peut être reconstruit comme projet-template système sans composant Dashboard monolithique spécifique.
- Le rail de leaders peut être positionné à droite ou à gauche selon le contexte droitier/gaucher existant.
- Date/Heure reste fixe dans le rail Calendrier pendant que les événements peuvent défiler horizontalement.
- Météo reste fixe dans le rail News pendant que les News/messages peuvent défiler horizontalement.
- Le propriétaire du compte reste en tête du rail Contacts ; les contacts récents suivent.
- Les rails Moniteur et Projets sont alimentés par leurs objets réels et restent dynamiques.
- Un clic/activation sur chaque leader affiche la collection complète correspondante dans la zone centrale définie par le template.
- Chaque action **Nouveau** crée un objet du bon type en réutilisant la capacité existante correspondante.
- Les interactions sur un contact peuvent être configurées pour ouvrir sa fiche ou lancer une action de contact sans imposer un comportement intrinsèque au type Contact.
- Les mises à jour du template système Dashboard sont propagées automatiquement aux instances existantes sans possibilité de refus, tout en respectant les règles de conservation des données utilisateur.
- Aucune logique d’import, de création, de consultation, de partage, de monitoring ou de données n’est dupliquée dans le Dashboard lorsque la capacité existe déjà ailleurs dans atome/eVe.
