# Atom Creation AI

## Statut
Roadmap / spécification à concevoir et valider.

## Objectif général
Créer une couche d'identification et de contexte destinée aux intelligences artificielles afin qu'une IA puisse comprendre, retrouver, créer et modifier les objets Atom de manière fiable à partir du langage naturel.

Le système ne doit pas dépendre d'une position visuelle fragile du type « le texte à gauche », car un objet peut être déplacé, redimensionné, masqué, regroupé ou affiché différemment suivant le mode de vue.

L'objectif est de pouvoir dire par exemple :
- « retrouve le titre du projet » ;
- « modifie le texte que je viens de créer » ;
- « prends l'image de couverture » ;
- « change le texte associé à cette photo » ;
- « utilise le bouton qui lance la lecture » ;

et que l'IA puisse résoudre correctement l'objet visé.

---

# 1. Identité des objets Atom

## 1.1 Principe
Chaque objet Atom doit posséder une identité stable, indépendante de sa position à l'écran.

Un objet ne doit donc pas être identifié uniquement par :
- ses coordonnées ;
- son ordre d'affichage ;
- sa taille ;
- son parent visuel courant ;
- son texte visible ;
- un nom généré à partir de sa position.

Ces informations peuvent servir d'indices, mais jamais d'identité principale.

## 1.2 Identifiant technique immuable
Chaque atome ou molécule reçoit à sa création un `id` technique unique et immuable.

Exemple conceptuel :

```text
id: atom_01J...
```

Cet ID sert de référence absolue pour le moteur, le stockage, MCP et les opérations programmatiques.

L'ID technique ne doit pas être réécrit quand l'objet :
- change de position ;
- change de nom ;
- change de parent ;
- change de mode d'affichage ;
- est utilisé dans une autre vue ;
- est déplacé dans la hiérarchie.

## 1.3 Identité sémantique pour l'IA
En complément de l'ID technique, chaque objet peut exposer une couche sémantique exploitable par l'IA.

Champs à étudier :

```text
semantic_role
semantic_key
label
aliases
object_type
content_type
parent_context
relations
created_by
created_at
last_interaction
user_priority
```

Exemple :

```text
id: atom_01J8...
object_type: text
semantic_role: project_title
semantic_key: project.home.title
label: "Titre du projet"
aliases: ["titre", "nom du projet", "titre principal"]
```

Le `semantic_key` doit être stable autant que possible, mais il ne remplace pas l'ID technique.

---

# 2. Retrouver un objet à partir du langage naturel

## 2.1 Résolution multi-indices
Quand l'utilisateur désigne un objet, l'IA doit combiner plusieurs indices au lieu d'interpréter littéralement une position.

Ordre de priorité proposé :

1. objet explicitement sélectionné ;
2. objet manipulé lors de la dernière action ;
3. ID ou référence directe ;
4. rôle sémantique ;
5. type d'objet ;
6. contenu ;
7. relations avec d'autres objets ;
8. contexte de projet / molécule / page ;
9. proximité temporelle avec la dernière création ;
10. position visuelle courante comme indice secondaire seulement.

Exemple : « modifie le texte à gauche ».

La position « à gauche » ne doit être qu'un filtre secondaire. Le moteur doit d'abord rechercher les objets texte pertinents dans le contexte courant, puis comparer leur rôle, leur sélection, l'historique d'interaction et enfin leur position actuelle.

## 2.2 Références conversationnelles
Le système doit conserver des références contextuelles temporaires :

```text
current_selection
last_created
last_modified
last_mentioned
active_container
active_project
active_tool
active_mode
```

Cela permet de comprendre :
- « celui-là » ;
- « le précédent » ;
- « le texte que tu viens de créer » ;
- « remets-le comme avant ».

## 2.3 Ambiguïté
Si plusieurs objets possèdent un score de correspondance proche, l'IA ne doit pas choisir arbitrairement.

Stratégie :
- résoudre automatiquement lorsque la confiance est élevée ;
- demander une précision seulement lorsque l'ambiguïté est réelle ;
- proposer les candidats avec une description compréhensible ;
- réutiliser ensuite le choix comme contexte conversationnel.

---

# 3. Registre sémantique Atom

Créer un registre léger permettant aux IA et à MCP d'obtenir une représentation structurée de l'état du projet sans devoir analyser toute la scène brute à chaque requête.

Exemple conceptuel :

```text
AtomSemanticRegistry
- id
- type
- semantic_role
- semantic_key
- label
- aliases
- parent
- children
- relations
- state
- visibility
- current_bounds
- content_summary
- interaction_history
```

Le registre doit être mis à jour automatiquement lors des créations, suppressions, duplications, déplacements, regroupements et changements de rôle.

Le registre ne doit pas recréer un second système d'objets : il doit exposer les informations déjà présentes dans Atom et ajouter uniquement les métadonnées nécessaires à la compréhension IA.

---

# 4. Pré-prompts

## 4.1 Pré-prompt global Atom
Toutes les IA utilisées à l'intérieur d'Atom doivent recevoir un socle commun expliquant la logique fondamentale du framework.

Ce socle doit notamment préciser :
- qu'un objet manipulé est un atome ou une molécule Atom ;
- qu'il faut réutiliser les fonctions et types déjà existants au lieu de recréer des systèmes parallèles ;
- que toute action doit rester compatible MCP ;
- qu'une référence utilisateur doit être résolue via le contexte Atom et le registre sémantique ;
- qu'une position visuelle seule n'est pas une identité fiable ;
- que les réponses et créations doivent respecter le type d'objet demandé.

## 4.2 Règles de création par type
Règles initiales à intégrer au pré-prompt global ou contextuel :

### Texte
Quand l'utilisateur demande un texte, créer ou manipuler un objet texte natif Atom, sauf demande explicite contraire.

Ne pas convertir implicitement un texte en image raster.

### Image
Quand l'utilisateur demande une image sans préciser de style, le comportement par défaut doit privilégier une image photoréaliste de haute qualité, sauf si le contexte ou le projet impose une autre direction artistique.

Le style explicite de l'utilisateur reste toujours prioritaire.

### Vecteur
Quand l'utilisateur demande un vecteur, produire un objet réellement vectoriel et éditable, pas une image raster simulant du vectoriel.

### Audio / vidéo / code / dessin
Chaque famille doit disposer de règles équivalentes définissant :
- le type Atom attendu ;
- le format natif ;
- les outils autorisés ;
- les contraintes du contexte ;
- le comportement par défaut si la demande est incomplète.

---

# 5. Pré-prompts contextuels

Le prompt transmis à l'IA ne doit pas être monolithique. Il doit être assemblé dynamiquement en fonction du contexte.

Exemples de dimensions :
- type de projet ;
- outil actif ;
- objet sélectionné ;
- type d'objet ;
- mode d'usage : Édition / Consultation / Performance ;
- mode de représentation : Naturel / Liste / Matrice ;
- action demandée : créer / modifier / analyser / rechercher / automatiser ;
- niveau de l'utilisateur ;
- préférences de l'utilisateur ;
- capacités du modèle IA utilisé ;
- permissions disponibles ;
- contraintes du device.

Exemple : une IA sollicitée depuis un objet texte ne doit pas recevoir exactement les mêmes règles qu'une IA appelée depuis une image, un outil de code ou une scène de performance.

---

# 6. Tableau de règles / matrice de pré-prompts

Créer une table déclarative permettant de composer les pré-prompts au lieu d'écrire des prompts différents à la main pour chaque cas.

Structure à étudier :

| Champ | Fonction |
|---|---|
| `rule_id` | ID stable de la règle |
| `scope` | global / projet / outil / type / mode |
| `trigger` | condition d'activation |
| `priority` | priorité de la règle |
| `audience` | novice / avancé / développeur / IA interne |
| `object_type` | texte / image / vecteur / audio / vidéo / code / etc. |
| `action` | create / edit / search / transform / delete / etc. |
| `prompt_fragment` | fragment de pré-prompt à injecter |
| `constraints` | contraintes supplémentaires |
| `fallback` | comportement par défaut |
| `version` | version de la règle |
| `enabled` | activation |

Exemple conceptuel :

```text
rule_id: image.default.photorealistic
scope: object_type
trigger: object_type=image AND no_explicit_style
priority: 50
prompt_fragment: "Par défaut, produire une image photoréaliste..."
```

Cette matrice doit pouvoir évoluer sans modifier le cœur du système IA.

---

# 7. Niveaux utilisateur

Les règles peuvent varier selon le niveau ou le profil d'utilisation.

Exemples :

### Débutant
- interprétation plus automatique ;
- davantage de valeurs par défaut ;
- langage non technique ;
- moins de demandes de paramètres.

### Utilisateur avancé
- accès à davantage de paramètres ;
- moins d'hypothèses ;
- contrôle plus précis des formats et transformations.

### Développeur
- références directes aux IDs ;
- détails MCP ;
- structure des atomes ;
- fonctions disponibles ;
- état et relations des objets.

Le niveau ne doit pas modifier la structure réelle des objets ; il modifie uniquement la manière dont l'IA interprète, explique et propose les actions.

---

# 8. Compatibilité MCP

Toute cette couche doit être pensée comme une interface utilisable par MCP.

L'IA doit pouvoir demander au MCP, par exemple :

```text
find_objects(query, context)
get_object(id)
get_selection()
get_recent_objects()
get_relations(id)
resolve_reference(natural_language, context)
create_object(type, params)
update_object(id, params)
```

Les noms exacts sont à définir en fonction des fonctions Atom déjà existantes.

Règle fondamentale : ne pas recréer une API parallèle si Atom possède déjà les primitives nécessaires. Cette couche doit normaliser et exposer l'existant.

---

# 9. Historique et mémoire locale de contexte

Pour aider l'IA à comprendre les références naturelles, Atom doit pouvoir conserver un historique court des actions pertinentes :
- objets créés ;
- objets sélectionnés ;
- objets modifiés ;
- commandes récentes ;
- relations créées ;
- dernier objet cité dans la conversation.

Il ne s'agit pas d'un historique complet du projet mais d'une mémoire opérationnelle limitée servant à la résolution des références.

---

# 10. Contraintes de conception

- Pas d'identification basée uniquement sur la géométrie ou la position.
- Pas de duplication inutile des données déjà présentes dans Atom.
- Pas de second modèle objet indépendant du framework.
- IDs stables et utilisables par MCP.
- Métadonnées sémantiques extensibles.
- Règles de pré-prompt déclaratives et versionnables.
- Compatibilité avec les différents modèles IA.
- Fonctionnement local-first lorsque c'est possible.
- Le système doit rester utilisable sans IA : l'IA est une couche d'interprétation, pas une dépendance structurelle d'Atom.

---

# 11. Travail à mener

1. Auditer le système actuel d'IDs Atom.
2. Vérifier quelles métadonnées existent déjà dans les atomes et molécules.
3. Définir le minimum de métadonnées sémantiques supplémentaires.
4. Définir un algorithme de résolution des références naturelles.
5. Définir le registre sémantique exposé à MCP.
6. Définir le pré-prompt global Atom.
7. Définir les pré-prompts par type d'objet.
8. Définir les pré-prompts par outil et par contexte.
9. Créer la matrice/table de règles.
10. Définir les règles de priorité et de conflits entre pré-prompts.
11. Définir les niveaux utilisateur.
12. Ajouter les tests de résolution d'ambiguïté.
13. Tester les références après déplacement, renommage et changement de vue.
14. Tester la compatibilité MCP.
15. Mesurer le coût en tokens et éviter d'envoyer inutilement toute la scène au modèle.

---

# 12. Cas de test minimum

Le système devra réussir au minimum les scénarios suivants :

- « modifie le texte que tu viens de créer » ;
- « agrandis le titre » après déplacement du titre ;
- « remplace l'image de couverture » ;
- « prends le texte lié à cette image » ;
- « sélectionne le bouton lecture » lorsqu'il existe plusieurs boutons ;
- « change celui de gauche » après réorganisation de la scène ;
- « applique la même chose aux trois autres » ;
- « reviens sur l'objet précédent » ;
- « transforme ce dessin en vecteur » ;
- « crée une image d'une forêt » sans style précisé -> comportement photoréaliste par défaut ;
- « crée une icône vectorielle » -> résultat réellement vectoriel ;
- passage Naturel -> Liste -> Matrice sans perte de référence ;
- déplacement d'un objet dans une autre molécule sans changement de son ID technique.

---

# 13. Principe directeur

L'utilisateur doit pouvoir parler des objets comme un humain sans connaître leurs IDs.

L'IA, elle, doit toujours finir par résoudre cette référence humaine vers un objet Atom précis et stable avant d'exécuter une action.

**Langage humain -> résolution sémantique -> ID Atom stable -> action MCP / Atom.**
