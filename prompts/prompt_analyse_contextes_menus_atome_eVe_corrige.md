# Prompt — Réalisation complète du système de contextes et de menus d’atome / eVe

> **Décision fonctionnelle définitive : Mystic remplace Flower partout.** Flower, également appelé Flowers, est l’ancien menu abandonné. Les deux seuls menus contextuels à alimenter sont **Mystic** et le **menu contextuel de la barre latérale droite**. Leurs choix peuvent différer ; leur contexte de référence est commun.

> **Statut au 2026-09-20 — l’analyse et le plan sont livrés ; cette demande porte sur la réalisation complète.**
> La référence de mise en œuvre est `todo/context_menus_modes_spec_2026-09-20.md` : la lire en entier avant toute
> action. Les sections 1 à 12 conservent la demande fonctionnelle d’origine et restent la cible ; les sections
> 13 à 17 pilotent l’exécution (décisions verrouillées, ordre des lots, contrat i18n, commandes de validation,
> format de preuve). En cas de contradiction entre ce prompt et la spécification, s’arrêter et signaler la
> contradiction avant toute écriture de code.

## 1. Mission et résultat attendu

Tu interviens sur le projet **atome / eVe** pour analyser et organiser son système de modes d’usage, d’activités, de niveaux de maîtrise et de menus contextuels.

Je souhaite un **audit de l’existant**, une **spécification fonctionnelle cohérente**, une **recommandation d’architecture de configuration JSON**, puis un **plan de réalisation complet, ordonné et directement exploitable pour l’implémentation**.

Ne te contente pas de reformuler ma demande : confronte les règles ci-dessous au code, relève les contradictions, identifie les composants à modifier et explique comment réaliser la tâche sans reconstruire inutilement le système.

**L’analyse et le plan sont livrés : la demande porte désormais sur la réalisation, lot par lot, jusqu’à l’état cible.** La spécification `todo/context_menus_modes_spec_2026-09-20.md` contient l’audit, les décisions, le modèle de données et le plan détaillé ; les sections 13 à 17 ci-dessous imposent l’ordre d’exécution, le contrat i18n, les commandes de validation et le format de preuve. Aucune étape ne s’arrête à une analyse : chaque lot produit du code, des données ou des tests réellement exécutés.

Prends le temps d’examiner les interactions entre les dimensions du système. Présente tes conclusions, les alternatives utiles et les raisons de tes choix, sans dérouler un monologue de raisonnement interne.

---

## 2. Sources, méthode et contraintes du projet

Lis d’abord, sans exception, `.codex/AGENTS.md`, puis les modules qu’il impose : `.codex/modules/01-root-constitution.md`, `.codex/modules/02-coding-standards-and-prohibitions.md` et, pour toute écriture de code, `.codex/modules/07-future-code-guardrails.md` ; ajoute `03`, `05` et `06` selon la surface touchée. Ces règles sont supérieures à ce prompt et ne peuvent être ni contournées ni réinterprétées. Travaille ensuite à partir des dépôts et documents réellement accessibles : `atomecorp/a` et le dépôt eVe associé, dont tu vérifieras le nom et la casse, ainsi que la spécification `todo/context_menus_modes_spec_2026-09-20.md`.

Repère les implémentations actuelles des modes, des menus, de la sélection, des placeholders, des activités, des profils et des commandes. Réutilise les conventions, services et composants existants autant que possible.

Contraintes à respecter :

- Le front reste en **JavaScript**, sans introduction de TypeScript ni remplacement injustifié de l’architecture de rendu.
- L’interface doit rester sobre, cohérente et adaptée aux usages tactiles comme à la souris. N’ajoute pas de pop-ups ou de palettes flottantes supplémentaires.
- Cette demande ne constitue pas une refonte graphique générale. Préserve la géométrie, les positions et les gestes existants lorsqu’ils ne contredisent pas les règles explicites ci-dessous. Cette préservation ne justifie pas le maintien de Flower : Mystic est son remplaçant définitif, avec sa propre présentation.
- Les règles explicites de ce prompt sont la cible fonctionnelle. Si une ancienne documentation ou le code les contredit, expose l’écart au lieu de rétablir silencieusement l’ancien comportement.

Distingue systématiquement : **constat vérifié dans le code**, **règle demandée**, **recommandation**, **hypothèse à valider**. Cite les chemins de fichiers, les symboles et, lorsque possible, les lignes qui fondent ton audit. N’invente ni composants existants ni résultats de tests.

Si une source n’est pas accessible, indique précisément la limite et poursuis avec une proposition conditionnelle. Ne transforme pas une absence d’accès en affirmation sur le fonctionnement du projet.

---

## 3. Vocabulaire : séparer les dimensions

### 3.1. Mode d’usage

Il existe exactement trois modes :

1. **Édition**.
2. **Consultation**.
3. **Performance**, également appelée « Perform » ou « Exécution » dans les échanges.

Performance et Exécution désignent ici **le même mode**, pas deux modes distincts. Propose une terminologie canonique compatible avec l’existant, sans migration de noms superflue.

### 3.2. Type d’objet

Il s’agit de la nature de l’atome ou de l’objet sélectionné : vidéo, audio, texte, image, etc. Cette liste est illustrative ; relève les types effectivement présents dans le projet.

### 3.3. Activité

Une activité correspond au contexte de travail choisi : audio, vidéo, mise en page, PAO/DTP, travail bureautique, etc.

**Une activité n’est pas un quatrième mode d’usage.** Son rôle est d’orienter les outils contextuels en mode Édition.

Le périmètre envisagé est de l’ordre d’une dizaine d’activités, sans imposer artificiellement ce nombre. Retrouve la taxonomie réelle et propose les regroupements nécessaires sans masquer les activités distinctes sous une catégorie trop générale.

Les termes « DTP » et « PAO » figurent dans la demande initiale : vérifie s’ils désignent la même activité dans le projet avant de créer deux entrées.

### 3.4. Niveau de maîtrise

Il existe trois niveaux :

1. **Débutant** — « novice » est un synonyme, pas un niveau supplémentaire.
2. **Intermédiaire**.
3. **Confirmé / professionnel** — un seul niveau supérieur, avec un libellé canonique à proposer.

Ce niveau module principalement la quantité d’outils exposés et la pédagogie de leur présentation. Il ne définit pas une autre activité et ne doit pas être confondu avec les permissions d’accès.

**Décision acquise le 2026-09-20 (D4) :** la maîtrise est une **hiérarchie**, et la portée la plus précise gagne —
`effectiveLevel(activité) = activityLevels[activité] ?? profileLevel`. Le niveau par défaut appartient au profil
utilisateur, puis se décline par activité ; un utilisateur débutant globalement mais confirmé en vidéo résout en
`advanced` en vidéo. Les **trois modes d’usage sont au niveau projet** : Exécution cesse d’être une préférence
persistée du profil (`perform_state.js:12`, clé `performMode`).

### 3.5. Menus cibles et statut définitif de Flower

**Il existe exactement deux menus contextuels à alimenter dans cette tâche :**

| Menu cible | Rôle et configuration |
|---|---|
| **Mystic** | Nouveau menu qui remplace Flower partout. Ses choix, ses regroupements et leur présentation sont définis pour Mystic. Il porte aussi la surcharge par mode, accessible au clic long dans les modes non éditoriaux. |
| **Menu contextuel de la barre latérale droite** | Menu distinct, visible uniquement en Édition, avec sa propre composition d’outils et ses propres regroupements. |

Ces deux menus sont **indépendants dans leur composition**, mais conditionnés par le même contexte : mode d’usage, niveau de maîtrise, type de l’objet ou activité explicitement choisie. Ils peuvent avoir des choix communs, différents ou partiellement communs. **Un même contexte n’impose pas la même liste de commandes dans les deux menus.**

Le **menu principal**, ou `main menu`, reste un élément distinct et constant en Édition. Il ne constitue pas une troisième cible de configuration contextuelle.

**Flower / Flowers est l’ancien menu, définitivement abandonné. Mystic est sa refonte et son unique remplaçant, pas un menu supplémentaire à faire coexister avec lui.** La graphie « Mystique » employée dans la demande initiale désigne également Mystic ; utilise désormais **Mystic** dans la spécification cible.

La relation entre Flower et Mystic est une décision déjà prise : **ne la remets pas à l’étude et ne demande pas de la confirmer**. L’audit doit seulement déterminer où l’ancien menu subsiste et comment achever son remplacement.

Ne prévois aucune variante Flower utilisable, aucun sélecteur Flower/Mystic, aucune nouvelle configuration destinée à Flower et aucun maintien de compatibilité fonctionnelle avec son ancienne interface. Les références à Flower ne sont utiles que pour identifier le code historique, récupérer les éléments réellement réutilisables et planifier leur migration ou leur suppression. Aucun parcours utilisateur cible ne doit encore ouvrir Flower.

Ne transpose pas automatiquement à Mystic la disposition en pétales, les limites de capacité ou les autres contraintes graphiques de Flower. Appuie-toi sur les spécifications et l’implémentation de Mystic pour sa présentation.

Les éventuelles vues Naturel / Liste / Matrice restent une dimension distincte : ne les mélange pas avec les activités ou les modes d’usage.

---

## 4. Règles fonctionnelles obligatoires des trois modes

### 4.1. Matrice de référence

| Comportement | Consultation | Performance / Exécution | Édition |
|---|---|---|---|
| Sélection éditoriale d’un atome ou outil | Interdite | Interdite | Autorisée selon le fonctionnement existant |
| Poignées et opérations de transformation éditoriale | Interdites | Interdites | Disponibles selon les outils et permissions |
| Activation d’un placeholder | Non | Oui, pour son usage prévu | Comportement à relever dans l’existant |
| Capture / enregistrement par placeholder | Non | Oui | Comportement à relever dans l’existant |
| Menu principal | Absent | Absent | Présent et stable |
| Barre latérale contextuelle | Absente | Absente | Liée à la sélection et au contexte |
| Choix contextuels d’édition dans Mystic | Absents | Absents | Adaptés au contexte, avec une composition propre à Mystic |
| Mystic au clic long | Surcharge du mode : centre (assistant / IA) + sortie = 2 entrées | Surcharge du mode : centre (assistant / IA) + sortie = 2 entrées | Croix de base : 5 tuiles (centre + 4 bras) |
| Nouvelles interactions personnalisées sur les objets | Hors périmètre | Hors périmètre | Ne pas développer leur moteur dans cette tâche |

**Important :** l’interdiction de sélection porte sur la sélection éditoriale des objets. Ne supprime pas par erreur le focus nécessaire aux contrôles autorisés, aux menus ou aux placeholders utilisables en Performance.

### 4.2. Consultation

En Consultation :

- Cliquer ou toucher un atome ou un outil ne le sélectionne pas pour l’éditer.
- Les placeholders sont inactifs : aucune activation, capture ni création d’enregistrement par leur intermédiaire.
- Aucun menu principal, aucune barre latérale d’édition et aucun contrôle de transformation ne doivent apparaître.
- Le clic long reste disponible afin d’ouvrir Mystic avec la surcharge déclarée pour le mode.

Pour cette itération, n’active pas les futures interactions personnalisées attachées aux objets. Leur ajout ultérieur pourra permettre des comportements de consultation, mais ce moteur n’est pas à réaliser maintenant.

La Consultation ne signifie pas que les commandes système autorisées du menu restreint sont inopérantes. Distingue celles-ci des interactions avec le contenu et des commandes d’édition interdites.

### 4.3. Performance / Exécution

En Performance, les restrictions de sélection et d’interface sont identiques à celles de la Consultation : pas de sélection éditoriale, pas de barre latérale contextuelle et pas de menu principal.

**La différence essentielle est que les placeholders fonctionnent et peuvent notamment capturer ou enregistrer.** Leur fonctionnement précis doit être relevé dans le code.

Un placeholder actif ne doit pas sélectionner automatiquement son atome ni ouvrir les outils d’édition.

Ne traduis donc pas Performance par une interdiction absolue de toute écriture : l’enregistrement autorisé peut produire des données ou faire évoluer un placeholder. Il faut distinguer cette opération de la modification structurelle d’édition.

Les futures interactions personnalisées appliquées aux objets restent hors périmètre de cette tâche, même si elles devront également pouvoir fonctionner en Performance plus tard.

### 4.4. Mystic en mode non éditorial : surcharge et sortie

En Consultation comme en Performance, **le seul parcours normal de sortie demandé est : clic long → Mystic avec la surcharge déclarée pour le mode → commande de sortie du mode**.

Il s’agit de **Mystic avec une composition adaptée au mode**, pas d’un troisième menu autonome ni d’un retour à Flower.

**Règle tranchée le 2026-09-20 (D1, D8, D9) — décision acquise, ne pas la rouvrir :**

- La **base** de Mystic est une croix de **cinq tuiles immuables** : centre (assistant / intelligence artificielle),
  nord, est, sud, ouest. Elle est déclarée dans le JSON sous `menus.mystic.base` et reste modifiable à tout
  moment, sans toucher au code.
- Chaque mode possède **son propre bloc** `menus.mystic.modes[<mode>]`, qui **surcharge** cette base. Une surcharge
  déclarée **remplace** la base et la composition de contexte **en bloc** : aucune fusion partielle. Un mode sans
  bloc déclaré — Édition aujourd’hui — affiche la croix de base.
- En **Consultation** et en **Performance**, la surcharge déclarée contient **exactement deux entrées** : le centre
  (assistant / intelligence artificielle) et la **sortie du mode** (« Quitter le mode Consultation » / « Quitter
  le mode Performance »). Aucun bras de la croix n’est affiché ; ils restent déclarés et réactivables par une
  seule valeur de données.
- La sortie réutilise la commande existante `mode_edit` et la clé `eve.menu.mode_edit` : **aucune nouvelle
  commande, aucune nouvelle clé de sortie**.
- Aucune commande contextuelle d’édition ne s’ajoute par type, activité ou niveau, et le niveau de maîtrise ne
  retire jamais une entrée requise.

Si un bras de la croix de base mène à une action incompatible avec un mode non éditorial, il n’est pas affiché
dans la surcharge : relève le conflit dans le rapport plutôt que de modifier silencieusement la composition.

Le menu de mode ne doit pas recevoir de choix contextuels d’édition supplémentaires à cause du type d’objet, de
l’activité ou du niveau utilisateur. Le filtrage de maîtrise ne doit pas non plus retirer l’une des entrées
déclarées. N’ajoute pas une seconde voie de sortie par bouton permanent, clic simple, raccourci d’édition ou
commande indirecte de l’assistant.

**Décision acquise (D2) :** quitter Consultation ou Performance ramène en Édition. Aucune destination n’est
définie dans le code actuel ; c’est cette destination qui est implémentée. Quitter un mode ne signifie ni fermer
le projet ni déconnecter la session.

### 4.5. Édition

En Édition, cliquer sur un atome le sélectionne selon les mécanismes existants et fait apparaître les outils contextuels pertinents, notamment la barre latérale à droite.

Le **menu principal reste constant** : sa structure et son emplacement ne deviennent pas contextuels. Les changements de type, d’activité et de maîtrise concernent les surfaces contextuelles, pas une recomposition du menu principal.

Mystic et le menu contextuel de la barre latérale doivent être alimentés à partir d’un **contexte commun**, mais avec **deux compositions de menu distinctes et configurables séparément**. Ils ne sont pas deux rendus obligatoirement identiques d’une même liste : chacun peut proposer ses propres choix, groupes et priorités. Lorsqu’une commande est présente dans les deux, elle conserve la même identité et la même sémantique ; les contraintes communes du mode, de permissions et d’applicabilité restent respectées.

Définis également le comportement sans sélection, avec plusieurs objets de même type, avec une sélection hétérogène et avec une molécule ou un groupe si ces cas existent. Ne fabrique pas de menu d’objet sélectionné lorsqu’aucun objet ne l’est.

---

## 5. Articulation entre type, activité et maîtrise

### 5.1. Contexte fondé sur le type

Sans activité explicitement choisie, le type de l’objet sélectionné doit déterminer les outils contextuels pertinents. Exemple : sélectionner une vidéo conduit au contexte vidéo, sous réserve des capacités réellement disponibles.

### 5.2. Contexte fondé sur l’activité

Lorsqu’une activité est explicitement choisie, elle devient le contexte de travail qui oriente les outils proposés. Un objet vidéo sélectionné dans une activité de mise en page ne doit donc pas automatiquement imposer l’intégralité d’un atelier de montage vidéo.

L’activité ne rend toutefois pas compatibles des commandes qui ne le sont pas : le type, la sélection, les capacités disponibles et les permissions réelles restent à prendre en compte.

**Propose une règle de priorité unique et déterministe.** Distingue clairement la sélection du contexte de travail, le filtrage d’applicabilité et la présentation du résultat. Évite une union automatique de tous les outils du type et de l’activité qui produirait un menu surchargé.

### 5.3. Les niveaux sont des sous-ensembles du même catalogue

À contexte identique **et pour un menu donné**, les niveaux de maîtrise utilisent **les mêmes outils et les mêmes commandes**, mais en exposent une quantité différente. Cette règle ne signifie pas que Mystic et la barre latérale doivent proposer les mêmes outils.

Pour un même mode, une même activité, une même sélection, les mêmes capacités et les mêmes permissions, applique séparément l’inclusion suivante à chacun des deux menus :

`outils débutant du menu ⊆ outils intermédiaire du menu ⊆ outils confirmé du menu`

Il n’existe aucune obligation d’égalité ou d’inclusion entre les outils de Mystic et ceux de la barre latérale. La surcharge de Mystic en Consultation et en Performance — centre (assistant / IA) et sortie — reste imposée par le mode, indépendamment du niveau de maîtrise.

Un outil commun aux trois niveaux garde le même identifiant, la même action et la même signification. Le niveau débutant peut avoir un libellé plus explicite ou une aide plus visible ; il ne doit pas déclencher une commande différente sous le même nom.

Ne crée pas trois catalogues indépendants copiés-collés pour les niveaux de maîtrise. Prévois un catalogue commun de commandes, des compositions propres à chaque menu et un mécanisme de filtrage ou de visibilité par niveau. Partager les définitions des commandes ne doit pas imposer une composition unique aux deux menus. Le niveau de maîtrise est une adaptation d’interface, **pas une autorisation de sécurité**.

---

## 6. Audit technique à réaliser

*Livré le 2026-09-20 : le résultat de cet audit est la section 2 de `todo/context_menus_modes_spec_2026-09-20.md`. La consigne ci-dessous reste la définition de ce qui doit être su et prouvé.*

Reconstitue le parcours réel : **événement utilisateur → état du contexte → résolution des outils → affichage → exécution de commande**.

Identifie au minimum :

- L’endroit où le mode actif est stocké, sa portée actuelle — application, projet ou autre — et toutes les voies de changement de mode.
- Le système de sélection, ses effets de bord et les contrôles de déplacement, redimensionnement ou autres transformations.
- La définition réelle d’un placeholder, ses états, ses événements et son parcours de capture / enregistrement. Ne suppose pas qu’il s’agit d’un type d’objet autonome.
- Les implémentations de Mystic et du menu contextuel de la barre latérale, leurs sources de données et leurs points de raccordement au contexte ; le menu principal, uniquement pour préserver son caractère constant.
- Les anciens composants Flower, leurs appels, gestes, routes, configurations et éventuels replis encore actifs, afin de les remplacer par Mystic partout. Ne traite pas leur existence dans le code comme une raison de maintenir Flower dans la cible.
- Les catalogues d’activités, de types, de commandes, de capacités et les mécanismes de maîtrise ou de profil déjà présents.
- Les points d’exécution qui pourraient contourner un simple masquage visuel : raccourcis, gestionnaires directs, assistant, API ou MCP lorsque ces accès existent.
- Les tests existants, les doublons de logique et les configurations ou valeurs codées en dur.

Pour chaque écart important, fournis : **règle cible, comportement observé, preuve dans le code, impact et correction proposée**.

---

## 7. Architecture JSON : comparer, recommander et illustrer

Je n’ai pas décidé s’il faut un fichier JSON unique ou plusieurs fichiers. **Compare les options avant de recommander celle qui convient au projet.**

Examine au moins :

1. Un fichier central contenant les définitions et les règles.
2. Plusieurs fichiers spécialisés partageant des identifiants et des références communes.
3. Si cela apporte une valeur réelle, des sources modulaires assemblées en une configuration de chargement unique.

Compare la lisibilité, la maintenance, la duplication, les conflits de modification, la validation, le chargement, l’intégration à l’existant et le coût de migration. N’ajoute pas de chaîne de compilation ou de dépendance importante sans bénéfice démontré.

### 7.1. Informations à représenter

La proposition doit couvrir :

- Les identifiants canoniques des modes, activités, types, niveaux et des deux menus contextuels cibles : Mystic et le menu contextuel de la barre latérale.
- Un catalogue partagé de commandes / outils avec des références stables.
- Deux compositions de menu explicitement distinctes : choix, groupes, ordre et règles de visibilité propres à Mystic, d’une part, et à la barre latérale, d’autre part.
- La croix de base de Mystic (`base`) et sa surcharge propre à chaque mode (`modes`), y compris les deux entrées déclarées pour Consultation et pour Performance.
- Les contextes d’édition fondés sur le type ou l’activité, et leur association aux compositions de chacun des deux menus.
- L’applicabilité selon la sélection et les capacités.
- La visibilité selon la maîtrise et les variantes pédagogiques de présentation.
- Les références nécessaires au rendu : libellé, icône, groupe, ordre ou position lorsque pertinents.
- Les valeurs par défaut, les règles de repli et une stratégie de versionnement proportionnée au besoin.

Ne génère pas un fichier indépendant pour chaque combinaison `mode × activité × type × niveau × menu`. Cherche une composition de définitions réutilisables, sans concevoir un système d’héritage inutilement complexe.

Les deux compositions doivent être adressables indépendamment, qu’elles soient stockées dans un seul fichier ou dans plusieurs. Ne prévois pas de troisième composition pour Flower. Le menu principal reste hors de cette configuration contextuelle.

### 7.2. Limite entre données et comportement

Explique ce qui appartient au JSON et ce qui doit rester dans le code : gestion des gestes, cycle de vie d’un enregistrement, exécution d’une commande ou contrôle du mode ne doivent pas devenir des chaînes de JavaScript exécutables dans la configuration.

Privilégie des références de commandes et des conditions déclaratives simples. N’introduis ni `eval` ni langage de règles opaque pour résoudre un besoin qui peut rester explicite.

### 7.3. Exemples et validation

Fournis une arborescence proposée, un schéma de validation adapté à l’existant et des exemples de JSON **syntaxiquement valides**, sans commentaires ni virgules finales.

Les exemples doivent montrer au minimum : un contexte vidéo déterminé par le type ; ce contexte aux trois niveaux de maîtrise pour chacun des deux menus ; une activité de mise en page appliquée à une sélection compatible ; la croix de base de Mystic et ses surcharges en Consultation et en Performance.

Montre explicitement, pour un **même contexte**, comment Mystic et la barre latérale peuvent proposer des **choix différents**, tout en référençant le même catalogue de commandes. Il ne suffit pas d’illustrer deux présentations graphiques d’une liste identique. Aucun exemple de configuration cible ne doit alimenter Flower.

Les identifiants réels doivent provenir de l’audit. Tout exemple fictif doit être explicitement présenté comme tel, hors du bloc JSON. Vérifie la cohérence des références entre exemples. Les cinq tuiles de la croix de base ne doivent pas être remplacées par des inventions pour rendre l’exemple apparemment complet.

---

## 8. Résolution commune et contrôle des commandes

Propose un mécanisme central de résolution du contexte, ou l’extension du mécanisme existant, pour partager l’état de référence et les contraintes transversales. **La résolution commune du contexte ne signifie pas une liste de choix identique pour les deux menus.**

Décris ses entrées, ses sorties et son ordre de traitement. Un ordre de départ à examiner en Édition est :

`contraintes du mode → permissions réelles → activité explicite ou contexte du type → composition propre au menu cible → applicabilité à la sélection → filtre de maîtrise propre à ce menu → présentation`

Applique cette résolution à Mystic et à la barre latérale avec leurs définitions respectives. Le résultat peut être deux structures distinctes, ou une résolution paramétrée par le menu cible, selon l’architecture existante. Une modification de la composition de Mystic ne doit pas modifier implicitement celle de la barre latérale, et réciproquement. Les définitions des commandes réellement partagées restent communes.

En Consultation et Performance, la branche de résolution imposée par le mode produit **la surcharge déclarée de Mystic — aujourd’hui le centre et la sortie, soit deux entrées —** et **aucun menu contextuel latéral**. Elle ne doit pas réintroduire la composition d’édition par les filtres d’activité, de type ou de maîtrise.

Cet ordre est une proposition à confronter au code, pas une raison de masquer des incohérences. Précise notamment le traitement des capacités indisponibles, des commandes inapplicables et des règles de visibilité.

Le résultat doit être déterministe et testable. Une commande peut être absente pour une raison de présentation, désactivée parce qu’elle est inapplicable ou interdite par le mode : ne confonds pas ces situations.

**Masquer un outil ne suffit pas à empêcher son exécution.** Les opérations d’édition doivent respecter le mode au niveau du déclenchement effectif. À l’inverse, un outil masqué pour simplifier le niveau débutant ne devient pas automatiquement une opération interdite par les permissions.

Vérifie que le traitement autorisé des placeholders en Performance reste possible et qu’aucune commande indirecte ne réactive l’édition dans un mode non éditorial.

---

## 9. Gestes, transitions et cas limites

Analyse explicitement les situations suivantes :

- Passage de l’Édition vers Consultation ou Performance avec un objet sélectionné, un menu ouvert ou un geste d’édition en cours. Neutraliser la sélection éditoriale active, les poignées et les actions en attente ; préciser ce qui pourra être restauré ensuite.
- Clic long sur le fond, sur un atome et sur un placeholder. Il doit rester accessible sans provoquer simultanément sélection ou enregistrement involontaire. Réutiliser les seuils et conventions de gestes existants après vérification.
- Distinction entre fermer le menu restreint et quitter le mode : fermer le menu ne doit pas changer de mode.
- Changement de mode pendant une capture ou un enregistrement. Proposer une règle explicite de finalisation ou d’interruption, signaler les arbitrages et éviter toute perte silencieuse de données.
- Événements différés ou asynchrones arrivant après un changement de mode : ils ne doivent pas rétablir des contrôles d’édition interdits.
- Changement d’activité, de sélection, de capacités ou de maîtrise : mise à jour cohérente des surfaces contextuelles, sans recomposition du menu principal.
- Configuration manquante, référence inconnue ou JSON invalide : comportement de repli documenté dans Mystic, sans blocage de la sortie par clic long ni activation accidentelle d’outils interdits. Flower ne doit jamais servir de menu de repli.
- Ancien point d’ouverture de Flower encore présent : prévoir son remplacement par Mystic et vérifier qu’aucun geste, route ou chemin alternatif ne réactive l’ancien menu.
- Écran sans projet actif, notamment le Dashboard si cette séparation existe : ne pas lui appliquer artificiellement une sélection ou une activité de projet.

Prévois le point d’extension pour les futures interactions personnalisées sur les objets, mais n’implémente pas leur fonctionnement dans cette tâche.

---

## 10. Plan d’implémentation attendu

*Livré le 2026-09-20 : le plan détaillé est la section 6 de `todo/context_menus_modes_spec_2026-09-20.md` ; l’ordre d’exécution est la section 13 de ce prompt.*

Fournis un plan progressif, avec dépendances et étapes de validation. Ne propose pas une réécriture globale par défaut.

Le plan doit couvrir l’audit, la normalisation du modèle de contexte, le choix et la validation des configurations, la résolution commune avec compositions distinctes, les protections d’exécution, le raccordement de Mystic et du menu contextuel latéral, les transitions, les placeholders et les tests de non-régression.

Prévois explicitement l’achèvement du remplacement de Flower par Mystic **partout où l’ancien menu est encore appelé**, y compris au clic long en Consultation et Performance. Identifie les commandes et services réutilisables, remplace les points d’entrée, puis planifie la suppression des branches et configurations devenues inutiles après vérification des références. La cible finale ne comporte ni coexistence, ni option de réactivation, ni compatibilité à maintenir avec Flower. Un éventuel retour arrière technique de version ne constitue pas une variante Flower à proposer dans l’application.

Pour chaque lot, indique :

| Champ | Contenu attendu |
|---|---|
| Identifiant et objectif | Une tâche concrète, de portée maîtrisée |
| Fichiers concernés | Chemins réels à modifier ou chemins explicitement proposés à créer |
| Dépendances | Conditions nécessaires avant de commencer |
| Modifications | Comportements, données et composants à faire évoluer |
| Tests | Vérifications automatisées et manuelles pertinentes |
| Critère de fin | Résultat observable permettant de considérer le lot terminé |
| Risques et retour arrière | Régressions possibles et moyen de revenir à l’état précédent |

Distingue le **socle indispensable** des améliorations ultérieures. La généralisation des interactions personnalisées reste hors périmètre. Ne donne pas d’estimation de durée artificiellement précise.

Le plan doit pouvoir être confié à un agent de développement sans qu’il ait à réinventer les règles fonctionnelles ou la structure des données.

---

## 11. Tests et critères d’acceptation

Prépare une matrice couvrant au minimum les critères suivants :

1. En Consultation, cliquer sur un objet ne le sélectionne pas ; les placeholders ne s’activent pas et n’enregistrent pas ; les menus d’édition restent absents.
2. En Performance, les mêmes restrictions éditoriales s’appliquent, mais un placeholder peut fonctionner et enregistrer sans déclencher de sélection.
3. Dans chacun de ces deux modes, le clic long ouvre Mystic avec exactement la surcharge déclarée pour le mode actif — aujourd’hui le centre (assistant / IA) et la sortie, soit deux entrées. Aucun choix contextuel d’édition ni entrée supplémentaire n’apparaît, et le niveau de maîtrise ne supprime pas d’entrée requise.
4. Le parcours de sortie reste utilisable sur souris et écran tactile. Fermer le menu seul conserve le mode actif.
5. En Édition, la sélection et les outils contextuels fonctionnent ; le menu principal garde sa structure et sa position lors des changements de contexte.
6. Sans activité explicite, le type guide les outils. Avec une activité explicite, la règle de priorité retenue s’applique sans présenter des commandes incompatibles avec la sélection.
7. À contexte identique et pour chaque menu pris séparément, les ensembles d’outils respectent l’inclusion débutant / intermédiaire / confirmé. Les outils partagés conservent leurs identifiants et leurs actions, sans imposer l’égalité des choix entre Mystic et la barre latérale.
8. Mystic et la barre latérale utilisent le même contexte de référence, mais peuvent proposer des choix différents. Un test démontre cette différence pour un même contexte et vérifie qu’une modification de composition d’un menu ne modifie pas implicitement l’autre.
9. Les raccourcis, événements résiduels et commandes indirectes ne contournent pas les restrictions du mode ; le filtrage pédagogique n’est pas confondu avec une permission.
10. Les transitions pendant une sélection, un geste ou un enregistrement suivent la politique documentée et ne provoquent pas de perte silencieuse.
11. Les configurations sont valides ; les identifiants, références et commandes déclarées sont cohérents ; les cas inconnus suivent le repli prévu.
12. Les futures interactions personnalisées ne sont pas activées par inadvertance et les comportements existants hors périmètre ne régressent pas.
13. Tous les anciens points d’ouverture de Flower conduisent désormais à Mystic. Aucun parcours actif, option, configuration cible ou repli ne permet d’afficher Flower ; aucune contrainte graphique propre à Flower n’est imposée à Mystic sans justification indépendante.

Sépare tests de logique, tests d’intégration UI et vérifications UX. Distingue ce qui a réellement été testé de ce qui reste à exécuter. Appuie les contrôles de performance sur les objectifs existants ou sur une mesure de référence, pas sur des chiffres inventés.

---

## 12. Format du rapport d’analyse (livré le 2026-09-20 — conservé comme référence)

Organise le rapport ainsi :

1. **Synthèse de la compréhension** : dimensions du système et règles non négociables.
2. **Audit de l’existant** : composants, chemins, comportements observés, écarts et références historiques à Flower à remplacer.
3. **Spécification cible** : matrice des modes, règles de contexte, compositions distinctes de Mystic et du menu contextuel latéral, et transitions.
4. **Décision d’architecture** : comparaison fichier unique / fichiers multiples, recommandation et justification.
5. **Modèle de données** : arborescence, schéma, exemples JSON et fonctionnement du résolveur.
6. **Plan de réalisation** : lots ordonnés, dépendances, fichiers, tests et critères de fin.
7. **Matrice d’acceptation et risques** : notamment sélection, gestes, enregistrement et commandes indirectes.
8. **Décisions restant réellement à valider** : uniquement celles que ni cette demande ni les sources accessibles ne permettent de résoudre.

Pour une ambiguïté non résolue, propose un choix par défaut argumenté, indique son impact et identifie ce qui exige effectivement une validation. Ne bloque pas toute l’analyse sur une question locale et ne redemande pas les informations déjà fournies. **Le remplacement définitif de Flower par Mystic et l’indépendance de composition entre Mystic et la barre latérale ne sont pas des ambiguïtés : ces décisions sont acquises.**

Termine par une recommandation concrète : **quelle organisation JSON adopter pour les deux menus cibles, quels composants conserver ou modifier, dans quel ordre achever la migration vers Mystic, et quels tests prouvent que les trois modes restent cohérents sans dépendance à Flower**.

---

## 13. Exécution — décisions verrouillées, ordre imposé et portes de validation

### 13.1. Décisions verrouillées au 2026-09-20 (ne pas rouvrir)

| Décision | Contenu acquis |
|---|---|
| **D1** | La **base** de Mystic est une croix de **cinq tuiles** : centre = assistant / IA, puis nord, est, sud, ouest. Elle est déclarée dans `menus.mystic.base` et reste modifiable en données à tout moment. `find` occupe le nord aujourd’hui ; l’ordre des bras n’a pas à être figé. |
| **D4** | Maîtrise = **hiérarchie**, la portée la plus précise gagne : `effectiveLevel(activité) = activityLevels[activité] ?? profileLevel`. Les **trois modes sont au niveau projet** ; Exécution cesse d’être une préférence persistée du profil (`perform_state.js:12`, clé `performMode`). |
| **D8** | Un seul outil **Mode**, avec les libellés réels : `Mode` / `Édition` / `Exécution` / `Consultation` (fr et en). La sortie réutilise la commande `mode_edit` et la clé `eve.menu.mode_edit` : aucune clé ni commande nouvelle. |
| **D9 (option A)** | **Base = 5, surcharge par mode** : chaque mode a son bloc `menus.<menu>.modes[<mode>]` ; un bloc déclaré remplace la base et la composition de contexte **en bloc** (aucune fusion partielle) ; bloc absent ou `{}` = base. Consultation et Exécution déclarent **2 entrées** (centre + sortie) et sont les seules surcharges ; Édition ne déclare rien. |
| **D2, D3, D5, D6, D7** | Défauts acceptés : sortie → Édition ; réutilisation de `mode_edit` ; une seule activité `dtp` ; `consultation` comme seul identifiant de mode accepté (l’outil et la clé restent `mode_consume`) ; la palette Mode du menu principal est conservée. |

### 13.2. Forme de données cible (extrait contractuel)

```json
{
  "menus": {
    "mystic": {
      "base": {
        "center": { "command": "ai", "slot": "center" },
        "cross": [
          { "command": "find", "slot": "north" },
          { "command": "capture", "slot": "east" },
          { "command": "dashboard", "slot": "south" },
          { "command": "communicate", "slot": "west" }
        ]
      },
      "modes": {
        "consultation": {
          "center": { "command": "ai", "slot": "center" },
          "cross": [],
          "exit": { "command": "mode_edit", "labelKey": "eve.menu.mode_edit" }
        },
        "performance": {
          "center": { "command": "ai", "slot": "center" },
          "cross": [],
          "exit": { "command": "mode_edit", "labelKey": "eve.menu.mode_edit" }
        }
      }
    }
  }
}
```

Règles non négociables du document : identifiants et `labelKey` uniquement, **jamais de texte affiché** ;
fichiers JSON rédigés en anglais ; aucune commande JavaScript, aucun `eval`, aucun langage de règles ; chaque
identifiant référencé doit exister dans les catalogues JavaScript canoniques, sinon le chargement échoue avec une
erreur nommée.

### 13.3. Ordre d’exécution (un lot à la fois, porte avant passage au suivant)

| Lot | Objectif | Fichiers principaux | Porte de fin de lot |
|---|---|---|---|
| **0** | Geler le comportement actuel avant toute modification | nouveau `tests/eve/context_menus_characterisation.test.mjs` ; lecture de `flower_context_items_runtime.js`, `navigation_taxonomy.js`, `flower_tool_capability_matrix.js`, `atome_contextual_rail_model_runtime.js`, `project_work_mode_state.js` | `npx vitest run tests/eve/context_menus_characterisation.test.mjs` vert ; aucun fichier de production touché |
| **1** | Un vocabulaire et un propriétaire par dimension | `eVe/domains/rendering/project_work_mode_state.js`, `eVe/intuition/tools/perform_state.js`, `eVe/intuition/tools/user_visual_preferences_model.js`, `eVe/intuition/menu/navigation_taxonomy.js` | trois identifiants de mode acceptés et retournés ; un champ de maîtrise avec portée et défaut documentés ; règle de priorité dans une seule fonction testable ; `npm run check:syntax` |
| **2** | Document de configuration + chargeur + validateur | nouveaux `eVe/intuition/menu/context_menus.json`, `context_menus_loader.js` ; style d’erreur de `eVe/intuition/contracts/validator.js` | un document invalide échoue avec une erreur nommée ; chaque commande référencée existe dans le catalogue JS canonique |
| **2.5** | Clés i18n, parité et propriété des libellés | `eVe/i18n/languages_fr_interaction.js`, `eVe/i18n/languages_en_interaction.js` | test de parité fr/en vert + test de présence pour chaque `labelKey` référencé par le document |
| **3** | Résolveur commun, compositions indépendantes | nouveau `eVe/intuition/menu/context_menu_resolver.js` | tests de logique : indépendance des deux menus, inclusion par niveau, surcharge de mode prioritaire |
| **4** | Câblage de Mystic et fin du sélecteur Flower/Mystic | `eVe/intuition/ribbon/bevy_ui_flower_model.js`, `eVe/intuition/ribbon/bevy_ui_flower_surface.js`, `eVe/intuition/ribbon/bevy_ui_menu_surface.js`, `eVe/intuition/ribbon/bevy_ui_flower_runtime.js`, `eVe/intuition/runtime/eve_intuition/flower_context_items_runtime.js`, `eVe/intuition/liquid/intuition_liquid_preference.js`, `eVe/intuition/tools/user_visual_preferences_model.js`, `eVe/intuition/flower/menu_layout.js` | avec `renderStyle: 'flat'`, le menu contextuel est Mystic avec la croix de base ; plus aucun chemin ne sélectionne une disposition en pétales ; tests `tests/eve/bevy_ui_flower_contract.probe.mjs`, `tests/eve/bevy_ui_flower_projection.test.mjs`, `tests/probes/flower_menu_modules.probe.mjs` |
| **5** | Câblage de la barre latérale | `eVe/intuition/runtime/eve_intuition/atome_contextual_rail_runtime.js`, `eVe/intuition/runtime/eve_intuition/atome_contextual_rail_model_runtime.js`, `eVe/intuition/runtime/eve_intuition/atome_contextual_edit_runtime.js`, `eVe/domains/rendering/project_view_contextual_rail.js` | plus aucune table littérale type → outil ; `npm run test:molecule` vert |
| **6** | Protection réelle à l’exécution | `eVe/domains/rendering/project_work_mode_state.js`, `eVe/intuition/runtime/eve_intuition/atome_contextual_edit_runtime.js`, `eVe/domains/rendering/project_view_placeholder_fill.js`, `eVe/domains/rendering/placeholder_creation_runtime.js`, points d’entrée sélection / transformation | une opération d’édition invoquée directement est refusée en Consultation et en Performance ; le placeholder se comporte différemment dans les deux modes |
| **7** | Transitions et gestes | propriétaire du mode, `eVe/intuition/runtime/eve_intuition/atome_contextual_edit_runtime.js`, `eVe/intuition/tools/perform.js`, `eVe/intuition/flower/context.js`, `eVe/intuition/flower/context_pointer_lock.js` | aucun état éditorial ne survit à une sortie d’Édition ; fermer le menu ne change pas le mode ; changement de mode pendant un enregistrement défini sans perte silencieuse |
| **8** | Suppression de Flower | `eVe/intuition/flower/`, `eVe/intuition/ribbon/bevy_ui_flower_*.js`, `eVe/domains/dashboard/dashboard_item_flower_menu.js`, `eVe/intuition/runtime/eve_intuition/flower_context_items_runtime.js`, `eVe/intuition/runtime/eve_intuition/flower_tool_capability_matrix.js` | `rg -i flower` ne retourne plus aucun chemin produit actif ; `npm run check:m0`, `npm run check:m1`, `npm run test:run` verts ; relocaliser d’abord les helpers réutilisables de `flower_tool_capability_matrix.js` |
| **9** | Non-régression multi-runtime | `tests/eve/*`, `tests/probes/*` + fiche d’acceptation manuelle | critères de la section 11 vérifiés dans les runtimes déclarés ; toute voie non exécutée est rapportée comme non exécutée |

Règles d’exécution : un seul lot à la fois ; aucun lot ne commence avant que la porte du précédent soit franchie
et rapportée ; à la fin de chaque lot, produire le rapport de la section 16 ; si une porte ne peut pas être
franchie, s’arrêter et exposer le blocage plutôt que d’élargir le périmètre ; ne jamais présenter un test prévu
comme un test exécuté ni une voie non exécutée comme corrigée.

---

## 14. Contrat i18n obligatoire

- **JSON en anglais, sans texte affiché** : le document ne porte que des identifiants et des `labelKey`.
- **Toute chaîne visible passe par `eveT`**, y compris les libellés d’accessibilité, les infobulles et les états d’erreur.
- **Un seul propriétaire du libellé** : réutiliser `eVe/intuition/shared/tool_presentation.js`
  (`toolLabelKey`, `resolveToolPresentation`). Ne jamais écrire une quatrième résolution de libellé.
- **Clés à créer (Lot 2.5)** : `eve.menu.z_order`, `eve.menu.line_splitter`, `eve.menu.record_action`,
  `eve.menu.midi_binding`, `eve.menu.copy.tip`, `eve.menu.delete.tip` — en `fr` **et** en `en`.
- **Libellés de mode à corriger** (fr / en) : `eve.menu.mode` = `Mode` / `Mode` ; `eve.menu.mode_edit` = `Édition`
  / `Edit` ; `eve.menu.mode_consume` = `Consultation` / `Consultation` ; `eve.menu.perform` = `Exécution` /
  `Exécution`.
- **Chaînes codées en dur à supprimer** : `flower_context_items_runtime.js:306` (`label: 'Stop'`),
  `bevy_ui_flower_model.js:192` (`BACK_ITEM`), `mystic_menu_items.js:55` (`MYSTIC_CENTER_FALLBACK`). Réutiliser
  `eve.menu.taxonomy.dashboard` : la clé `eve.menu.dashboard` **n’existe pas**.
- **À ne pas « corriger »** : les `label:` de `eVe/intuition/tools/core/tool_runtime_bootstrap_defs_a.js` /
  `eVe/intuition/tools/core/tool_runtime_bootstrap_defs_b.js` sont l’argument de repli
  autorisé de `eveT(key, fallback)`, et `label: 'Mystic'` sur la surface SDF est décoratif
  (`visible_to_accessibility: false`).

---

## 15. Commandes de validation à exécuter

Dans cet ordre, en commençant par le plus étroit :

1. `npm run check:syntax` après chaque édition substantielle.
2. Vitest ciblé : `npm run test:run -- <chemin-du-test>`.
3. Socle de garde-fous : `npm run check:m0`, puis `npm run check:m1`.
4. Suites produit : `npm run test:molecule`, `npm run test:run`, et `npm run test:server-verification` lorsque le
   chemin touché l’atteint.
5. UI : `npm run quality:ui` (avec navigateur réel, jamais headless pour l’acceptation visuelle).
6. Si le rendu ou le shader est touché : reconstruction du renderer concerné avant de conclure.

`.codex/modules/03-debugging-testing-and-ui-validation.md` mentionne `npm run check:m2` ; **ce script n’existe pas
dans `package.json`** aujourd’hui. Ne pas l’inventer ni l’exécuter à vide : utiliser les commandes ci-dessus et
signaler l’écart dans le rapport.

---

## 16. Preuve et rapport attendus (format imposé, à la fin de chaque lot)

1. **Fichiers modifiés** : chemins réels, avec la nature du changement.
2. **Comportement obtenu** : ce qui fonctionne maintenant, en une à trois phrases.
3. **Tests exécutés** : commande exacte, résultat, et le périmètre réellement couvert.
4. **Tests prévus mais non exécutés** : liste explicite.
5. **Voies non exécutées** : navigateur, Tauri, iOS, AUv3, pixels, appareil — distinguées les unes des autres.
6. **Risque résiduel** et moyen de retour arrière.

Pour toute vérification UI : descendre l’échelle de preuve — disponibilité réelle de l’application, arbre monté,
pointeur réel, puis pixels ou appareil. Ne jamais conclure depuis un simple `domcontentloaded`, un état de
document ou un clic simulé.

---

## 17. Interdits et pièges déjà identifiés

- Ne pas rouvrir D1, D4, D8, D9 ni le remplacement définitif de Flower ; ne pas demander de confirmer ces points.
- Aucun repli Flower, aucun sélecteur, aucune option de réactivation, aucune couche de compatibilité.
- Le seul repli autorisé est `eveT(key, fallback)` et `ui.label_fallback` ; toute dépendance manquante produit une
  erreur explicite.
- Un mode **masqué** n’est pas un mode **interdit** : la garde doit être consultée au point de déclenchement de
  chaque opération, pas au niveau du pointeur ni du rendu.
- La maîtrise est une adaptation d’interface, jamais une permission de sécurité.
- En Performance, préserver le focus nécessaire aux placeholders autorisés tout en supprimant la sélection
  éditoriale.
- Aucune seconde voie de sortie de mode : ni bouton permanent, ni clic simple, ni raccourci, ni commande de
  l’assistant.
- Aucune écriture directe de l’état : les mutations passent par `window.Atome.commit` / `window.Atome.commitBatch`.
  L’état canonique reste hors du DOM, qui demeure une projection jetable ; le rendu reste WebGPU.
- Ne pas agrandir un fichier au-delà de 500 lignes ; s’il est déjà au-dessus, le réduire à l’occasion du lot
  concerné (`eVe/intuition/runtime/eve_intuition/flower_context_items_runtime.js` = 501 lignes,
  `eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js` = 510 lignes).
- Fichiers temporaires uniquement sous `./temp` ; tests persistants uniquement sous `./tests`.
- Aucune opération Git en écriture : lecture, diff et blame seulement.
- Ne jamais élargir silencieusement le périmètre, ni remplacer une correction de fond par un correctif de surface.
