# Contextual Taxonomy — atome

## Statut

Document de cadrage et prompt d’implémentation pour construire dans **atome** un petit utilitaire DEV de gestion de la taxonomie contextuelle.

Objectif : remplacer l’édition manuelle d’un JSON complexe par une interface visuelle simple, sans dupliquer les outils, tout en conservant le JSON comme source de données exploitable par le framework.

---

## 1. Principe général

L’interface d’atome n’affiche pas systématiquement tous les outils disponibles.

L’affichage dépend de règles de taxonomie.

Il faut distinguer trois familles de menus :

1. **Main Menu**
2. **Mystic**
3. **Barre latérale contextuelle**

Le présent document fixe précisément la base du **Main Menu** et les premières définitions de **Mystic pour les objets `text` et `video`**.

La barre latérale contextuelle utilisera le même moteur de taxonomie, mais son catalogue détaillé sera défini séparément.

---

## 2. Règle fondamentale : catalogue unique des outils

Un outil ne doit être défini qu’une seule fois.

Exemple :

```json
{
  "id": "color",
  "label": "Color"
}
```

Les menus et les contextes ne recopient pas sa définition. Ils ne stockent que sa référence.

Exemple :

```json
{
  "tools": ["color", "delete"]
}
```

Le système doit donc séparer :

- le **catalogue global des outils** ;
- les **règles qui déterminent où et quand ils sont visibles**.

Le but est d’éviter toute redondance lorsque le nombre d’outils devient important.

---

## 3. Main Menu

### 3.1 Règle spécifique

Le **Main Menu est un cas particulier**.

Il dépend **uniquement du niveau de l’utilisateur**.

Il ne dépend pas :

- du type d’objet sélectionné ;
- de l’outil actif ;
- de l’activité ;
- du contexte ;
- du mode de vue.

Schéma :

```text
niveau utilisateur
       ↓
   Main Menu
```

Les niveaux prévus sont trois niveaux de maîtrise, par exemple :

- débutant ;
- confirmé ;
- expert / aguerri.

La nomenclature exacte pourra être ajustée sans modifier l’architecture.

### 3.2 Catalogue de base v0 du Main Menu

Le catalogue de départ contient les 9 outils suivants :

1. **Dashboard**
2. **Find / Trouver**
3. **Record / Enregistrer**
4. **Temps**
5. **Communication**
6. **Vue**
7. **Mode d’exécution**
8. **Activité**
9. **Création**

Le **Mode d’exécution** permet notamment de choisir entre les états prévus par atome, par exemple édition, exécution/performance ou consultation selon la nomenclature retenue dans le framework.

Cette liste constitue la **base v0**. Elle doit pouvoir être enrichie ultérieurement sans modifier le modèle de données.

La répartition exacte de ces 9 outils entre les différents niveaux utilisateur n’est pas encore figée. L’éditeur doit précisément permettre de la définir.

---

## 4. Mystic

### 4.1 Rôle

Mystic est un menu contextuel volontairement **minimaliste**.

Il doit permettre des actions rapides et essentielles.

Il ne faut pas le transformer en panneau d’options avancées.

Des réglages détaillés comme la typographie complète, l’interlignage, l’espacement des caractères, etc. n’ont pas à être ajoutés par défaut dans Mystic. Ils relèvent plutôt de la barre contextuelle ou d’outils plus spécialisés.

### 4.2 Quatre outils immuables

Mystic possède **4 outils immuables**.

Ils sont toujours présents :

- quel que soit le type d’objet ;
- quel que soit le niveau utilisateur ;
- quelle que soit l’activité ;
- quel que soit le contexte.

Ces quatre outils sont disposés selon la structure en croix de Mystic :

1. **Find / Trouver**
2. **Record / Enregistrer**
3. **Dashboard**
4. **Communication**

Leur position exacte dans les quatre directions doit suivre la définition existante de Mystic ; elle ne doit pas être inventée par cet utilitaire si elle est déjà définie ailleurs.

Ces outils sont des invariants du système : aucune règle contextuelle ne doit pouvoir les retirer.

### 4.3 Mystic — objet `text`

Lorsqu’un objet de type `text` est sélectionné, Mystic conserve les quatre outils immuables et ajoute les actions contextuelles de base suivantes :

- **Avant / Arrière** : placer le texte devant ou derrière un autre objet, donc agir sur l’ordre d’empilement ;
- **Coloriser** ;
- **Supprimer** ;
- **Copier / Coller**.

Version de base :

```text
MYSTIC
│
├── immuable
│   ├── Find
│   ├── Record
│   ├── Dashboard
│   └── Communication
│
└── objet : text
    ├── Front / Back
    ├── Color
    ├── Delete
    └── Copy / Paste
```

Cette première version doit rester volontairement petite.

### 4.4 Mystic — objet `video`

Lorsqu’un objet de type `video` est sélectionné, Mystic conserve les quatre outils immuables et ajoute les actions contextuelles de base suivantes :

- **Avant / Arrière** : changer le plan / l’ordre d’empilement de la vidéo ;
- **Supprimer** ;
- **Copier / Coller** ;
- **Lecture**.

Version de base :

```text
MYSTIC
│
├── immuable
│   ├── Find
│   ├── Record
│   ├── Dashboard
│   └── Communication
│
└── objet : video
    ├── Front / Back
    ├── Delete
    ├── Copy / Paste
    └── Play
```

Pour cette première version, **Lecture** est la différence fonctionnelle principale ajoutée pour `video`. Ne pas ajouter d’autres commandes vidéo tant qu’elles n’ont pas été explicitement définies.

---

## 5. Règles contextuelles générales

Pour les menus contextuels comme Mystic et la barre latérale, la taxonomie doit pouvoir tenir compte de plusieurs dimensions.

Le modèle général à prévoir est :

```text
type d’objet OU outil actif
        ↓
niveau utilisateur
        ↓
activité
        ↓
contexte / mode de vue si nécessaire
        ↓
outils visibles
```

Exemple conceptuel :

```text
text + activité musique + expert + vue liste
→ peut afficher des commandes supplémentaires propres à ce contexte
```

Un même objet peut donc présenter des outils différents selon l’activité.

Exemple : un objet `text` utilisé dans une activité musique pourra ultérieurement recevoir des outils différents d’un objet `text` utilisé dans une activité vidéo.

Important : cette logique doit être extensible, mais la première implémentation ne doit pas remplir artificiellement toutes les combinaisons possibles.

---

## 6. Héritage et overrides

Pour éviter l’explosion du JSON, le système doit fonctionner par **base + ajouts/retraits**, plutôt que recopier une liste complète pour chaque combinaison.

Exemple conceptuel :

```json
{
  "mystic": {
    "immutable": [
      "find",
      "record",
      "dashboard",
      "communication"
    ],
    "objects": {
      "text": {
        "base": [
          "front_back",
          "color",
          "delete",
          "copy_paste"
        ]
      },
      "video": {
        "base": [
          "front_back",
          "delete",
          "copy_paste",
          "play"
        ]
      }
    }
  }
}
```

Plus tard, une activité ou un niveau pourra ajouter ou retirer des outils contextuels :

```json
{
  "add": ["tool_x"],
  "remove": ["tool_y"]
}
```

Restriction impérative :

```text
remove
```

ne doit jamais pouvoir supprimer un outil déclaré `immutable`.

---

## 7. Utilitaire DEV à créer dans atome

L’éditeur de taxonomie doit être construit **dans atome**, mais comme un **outil de développement interne**.

Il ne doit pas être une fonctionnalité utilisateur cachée.

Architecture cible :

```text
atome DEV
   ↓
Taxonomy Editor
   ↓
validation
   ↓
aperçu des changements / diff
   ↓
écriture contrôlée
   ↓
taxonomy.json dans le dépôt local
   ↓
Git détecte le fichier modifié
   ↓
commit / push par le développeur avec son environnement Git habituel
```

---

## 8. Aucun identifiant GitHub dans atome

Le dépôt GitHub est privé.

Il est donc interdit de placer dans atome :

- un token GitHub partagé ;
- les identifiants GitHub du propriétaire ;
- des credentials permanents ;
- un secret permettant à atome de pousser directement sur le dépôt privé.

atome n’a pas besoin de connaître GitHub pour éditer la taxonomie.

Chaque développeur dispose de :

- son propre clone local du dépôt ;
- son propre compte GitHub ;
- ses propres droits ;
- sa propre authentification Git/SSH/GitHub CLI ou équivalent.

Le Taxonomy Editor écrit uniquement dans le fichier local du dépôt.

Git voit ensuite simplement une modification de fichier, par exemple :

```text
modified: config/taxonomy.json
```

Le développeur utilise ensuite son workflow Git normal.

---

## 9. Synchronisation Git recommandée

### Première version

Ne pas implémenter de push GitHub dans l’éditeur.

Workflow :

```text
1. Le développeur ouvre atome en mode DEV
2. Il modifie la taxonomie
3. L’éditeur valide les règles
4. Il visualise le diff
5. Il clique sur Apply / Save
6. taxonomy.json est modifié localement
7. VS Code / Git voit le changement
8. Le développeur commit et push normalement
```

Avantages :

- aucun secret GitHub dans atome ;
- compatible avec un dépôt privé ;
- chaque développeur conserve son identité et ses permissions ;
- historique Git normal ;
- revue de code possible ;
- branches et pull requests restent utilisables.

### Extension éventuelle

Une version future pourra proposer :

```text
Save + Commit
```

en utilisant le Git installé localement.

Même dans ce cas :

- ne pas stocker de credentials dans atome ;
- ne pas embarquer de token GitHub ;
- utiliser uniquement l’identité Git déjà configurée sur la machine ;
- conserver le push comme action distincte ou comme extension explicitement autorisée.

Cette extension n’est pas nécessaire pour la V1.

---

## 10. Séparation DEV / production

Il faut distinguer :

```text
atome production
→ lit la taxonomie
→ applique les règles
→ aucune capacité d’écriture de la taxonomie
```

et :

```text
atome DEV
→ lit la taxonomie
→ affiche le Taxonomy Editor
→ peut enregistrer une nouvelle taxonomie locale validée
```

Idéalement, le code permettant l’écriture ne doit pas être inclus dans le build public.

Ne pas se contenter d’un bouton caché.

La protection doit être structurelle.

---

## 11. Passerelle d’écriture limitée

Le JavaScript de l’éditeur ne doit pas recevoir une API générique de type :

```js
writeFile(path, content)
```

Il faut une commande spécialisée, par exemple :

```js
saveTaxonomy(data)
```

La couche privilégiée connaît elle-même le chemin autorisé.

Exemple :

```text
Taxonomy Editor
      ↓
saveTaxonomy(data)
      ↓
bridge DEV / Tauri / Rust
      ↓
chemin unique autorisé
      ↓
taxonomy.json
```

L’éditeur ne doit pas pouvoir écrire arbitrairement dans le framework.

---

## 12. Garde-fous obligatoires

Avant toute écriture :

1. valider que le JSON est syntaxiquement correct ;
2. valider le schéma de données ;
3. vérifier que chaque `tool_id` existe réellement dans le catalogue ;
4. refuser les doublons incohérents ;
5. détecter les références à des outils inexistants ;
6. empêcher la suppression des outils `immutable` ;
7. détecter autant que possible les règles contradictoires ;
8. afficher un diff avant l’écriture ;
9. écrire le fichier de manière atomique ;
10. conserver une possibilité de restauration de la version précédente.

Exemple de diff :

```text
MYSTIC / TEXT

+ color
+ delete
- tool_x
```

Le développeur doit savoir exactement ce que l’éditeur va modifier avant de confirmer.

---

## 13. Interface de l’éditeur

L’objectif n’est pas de reproduire un gros tableur.

L’interface doit rester simple même avec beaucoup d’outils.

### Sélecteurs principaux

Prévoir en haut de l’éditeur :

```text
Menu
[ Main Menu | Mystic | Sidebar ]

Objet / outil actif
[ Text ▼ ]

Niveau utilisateur
[ Beginner ▼ ]

Activité
[ None / Music / Video / ... ▼ ]

Contexte / vue
[ Default / List / Matrix / ... ▼ ]
```

Les sélecteurs non pertinents doivent être désactivés.

Exemple : lorsque `Main Menu` est sélectionné :

```text
Objet             désactivé
Activité          désactivée
Contexte / vue    désactivé
Niveau utilisateur actif
```

puisque le Main Menu dépend uniquement du niveau utilisateur.

### Liste des outils

La partie principale affiche les outils disponibles avec :

- recherche ;
- filtre ;
- activation/désactivation ;
- origine de la règle.

Exemple :

```text
Find            IMMUTABLE
Record          IMMUTABLE
Dashboard       IMMUTABLE
Communication   IMMUTABLE

Front / Back    TEXT
Color           TEXT
Delete          TEXT
Copy / Paste    TEXT
```

Un outil immuable peut être visible mais non décochable.

---

## 14. Catalogue automatique

À terme, l’éditeur ne doit pas maintenir à la main une seconde liste des outils existants.

Il doit idéalement lire le **registre réel des outils d’atome**.

Objectif :

```text
nouvel outil ajouté au framework
        ↓
registre des outils mis à jour
        ↓
Taxonomy Editor le voit automatiquement
```

Ainsi, le catalogue de taxonomie ne devient pas une copie divergente du framework.

Si le framework ne possède pas encore de registre central exploitable, la V1 peut utiliser un catalogue JSON dédié, mais l’architecture doit permettre de le remplacer par une source de vérité unique.

---

## 15. Proposition de structure JSON minimale

La structure exacte peut être adaptée au code existant, mais elle doit conserver ces propriétés :

```json
{
  "tools": {
    "dashboard": {},
    "find": {},
    "record": {},
    "time": {},
    "communication": {},
    "view": {},
    "execution_mode": {},
    "activity": {},
    "create": {},
    "front_back": {},
    "color": {},
    "delete": {},
    "copy_paste": {},
    "play": {}
  },

  "menus": {
    "main": {
      "condition": "user_level",
      "levels": {
        "beginner": [],
        "confirmed": [],
        "expert": []
      }
    },

    "mystic": {
      "immutable": [
        "find",
        "record",
        "dashboard",
        "communication"
      ],

      "objects": {
        "text": {
          "base": [
            "front_back",
            "color",
            "delete",
            "copy_paste"
          ]
        }
      }
    }
  }
}
```

Important : les tableaux du Main Menu sont laissés vides ici volontairement, car la répartition des 9 outils par niveau n’a pas encore été décidée.

---

# PROMPT D’IMPLÉMENTATION

## Mission

Implémenter dans **atome** un module DEV nommé provisoirement **Taxonomy Editor** permettant de gérer visuellement le fichier de taxonomie JSON du framework.

Le module doit être conçu comme un outil de développement interne et non comme une fonctionnalité utilisateur publique.

## Objectifs

1. Fournir une interface visuelle simple pour éditer les règles de taxonomie.
2. Conserver le JSON comme format de données persistant.
3. Ne jamais dupliquer la définition d’un outil entre plusieurs menus ou contextes.
4. Séparer le catalogue des outils et les règles d’affichage.
5. Permettre l’extension future à de nombreux objets, outils, activités et contextes.
6. Protéger strictement l’écriture dans le framework.
7. Ne stocker aucun identifiant ou token GitHub.
8. Fonctionner correctement avec un dépôt GitHub privé et plusieurs développeurs.

## Règles fonctionnelles à implémenter immédiatement

### Main Menu

Le Main Menu dépend uniquement du niveau utilisateur.

Catalogue v0 :

- Dashboard
- Find / Trouver
- Record / Enregistrer
- Temps
- Communication
- Vue
- Mode d’exécution
- Activité
- Création

Ne pas inventer la répartition par niveau. Créer l’interface permettant de la définir.

### Mystic

Quatre outils sont immuables pour tous les objets, niveaux et activités :

- Find / Trouver
- Record / Enregistrer
- Dashboard
- Communication

Ils ne doivent jamais pouvoir être retirés par une règle d’override.

Pour l’objet `text`, ajouter :

- Front / Back
- Color
- Delete
- Copy / Paste

Pour l’objet `video`, ajouter :

- Front / Back
- Delete
- Copy / Paste
- Play / Lecture

Mystic doit rester minimaliste. Ne pas ajouter automatiquement d’options typographiques, vidéo ou avancées non demandées.

## Architecture

Créer une séparation claire entre :

```text
taxonomy engine
taxonomy data
taxonomy DEV editor
privileged save bridge
```

Le moteur de taxonomie doit être utilisable en production.

L’éditeur et le bridge d’écriture doivent être DEV-only.

## Écriture

Ne pas exposer une API générique d’accès au système de fichiers.

Créer une commande spécialisée du type :

```js
saveTaxonomy(data)
```

Cette commande doit être limitée au seul fichier de taxonomie autorisé.

Avant écriture :

- schema validation ;
- tool IDs validation ;
- immutable rules validation ;
- conflict detection ;
- diff preview ;
- atomic write ;
- recovery/backup de la version précédente.

## Git / GitHub

Ne pas utiliser l’API GitHub pour la V1.

Ne stocker aucun token.

Le module écrit dans le fichier du clone local du développeur.

Git, VS Code, GitHub Desktop ou la CLI voient ensuite la modification normalement.

Chaque développeur utilise sa propre authentification pour commit/push.

Le dépôt privé ne doit donc nécessiter aucune credential supplémentaire dans atome.

## Interface

Créer une interface avec :

- sélection du menu ;
- sélection objet/outil si applicable ;
- sélection du niveau utilisateur ;
- sélection activité si applicable ;
- sélection contexte/vue si applicable ;
- liste recherchable des outils ;
- cases ou toggles pour les règles modifiables ;
- indication visuelle `IMMUTABLE`, `BASE`, `LEVEL`, `ACTIVITY`, `CONTEXT` ;
- aperçu du diff ;
- bouton Apply/Save.

Quand `Main Menu` est choisi, désactiver objet, activité et contexte.

Quand `Mystic` est choisi, afficher les quatre outils immuables comme présents et non décochables.

## Non-objectifs V1

Ne pas :

- intégrer des credentials GitHub ;
- pousser automatiquement vers GitHub ;
- créer un éditeur JSON brut comme interface principale ;
- permettre d’écrire dans n’importe quel fichier du framework ;
- ajouter des dizaines d’options non définies ;
- surcharger Mystic ;
- recopier la définition complète d’un outil dans chaque règle.

## Critères de validation

Le module est validé lorsque :

1. le Main Menu peut être configuré selon le seul niveau utilisateur ;
2. aucun changement d’objet ou d’activité n’altère directement la règle du Main Menu ;
3. Mystic affiche toujours ses quatre outils immuables ;
4. `text` ajoute Front/Back, Color, Delete et Copy/Paste ;
5. `video` ajoute Front/Back, Delete, Copy/Paste et Play/Lecture ;
6. les outils immuables ne peuvent pas être désactivés ;
7. le JSON généré est valide et lisible par le framework ;
8. un ID d’outil inexistant bloque la sauvegarde ;
9. un diff est affiché avant Apply ;
10. l’écriture est limitée au fichier de taxonomie ;
11. la sauvegarde locale apparaît immédiatement comme modification Git ;
12. aucun token ou identifiant GitHub n’est présent dans atome ;
13. le module d’édition/écriture n’est pas disponible dans le build public.

## Principe de développement

Commencer par une V1 minimale utilisant uniquement :

- les 9 outils du Main Menu ;
- les 4 invariants Mystic ;
- l’objet `text` et ses 4 groupes/actions contextuels ;
- l’objet `video` avec Front/Back, Delete, Copy/Paste et Play/Lecture.

Ne pas généraliser prématurément l’interface à des dizaines de cas fictifs.

Valider d’abord ce flux complet :

```text
ouvrir Taxonomy Editor
→ choisir Main ou Mystic
→ choisir les conditions applicables
→ modifier la sélection
→ valider
→ visualiser le diff
→ Apply
→ écrire taxonomy.json localement
→ constater la modification dans Git
```

Une fois ce flux stable, étendre progressivement le catalogue et les règles aux autres objets, outils, activités et à la barre latérale contextuelle.
