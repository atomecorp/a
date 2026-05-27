Étape 13 — Unifier la création d’atome dans tool_genesis.js

Objectif

Décomposer la correction de l’étape 13 afin de pouvoir traiter proprement createAtome dans tool_genesis.js, sans casser le rendu ni la création existante.

Le problème identifié est sérieux : createAtome semble encore pouvoir créer ou monter du DOM avant que l’atome existe réellement dans le chemin canonique.

La correction ne doit pas être un patch superficiel. Il faut comprendre le flux actuel, identifier pourquoi le DOM intervient trop tôt, puis déplacer progressivement le montage DOM après le commit canonique.

⸻

Règle d’architecture à respecter

L’atome doit naître dans le modèle canonique.
Le DOM doit seulement apparaître après validation, commit et projection de l’état courant.

Flux cible :

CreateAtomeCommand
  ↓
validate canonical envelope
  ↓
commit canonique / append event / DB
  ↓
state_current mis à jour ou relu
  ↓
renderer reçoit l’état canonique
  ↓
DOM host minimal créé

Flux interdit :

createAtome
  ↓
création DOM immédiate
  ↓
DOM utilisé comme état temporaire
  ↓
commit backend dérivé de la vue

⸻

Phase 0 — Sécuriser la passe avant modification

Objectif

Avant de modifier tool_genesis.js, créer un cadre de sécurité pour éviter une régression de rendu.

À faire

1. Identifier tous les appels à createAtome.
2. Identifier les scénarios où createAtome est utilisé :

- création d’atome simple ;
- création d’atome média ;
- création dans la matrice ;
- création dans un projet ;
- création depuis timeline ;
- création depuis import média ;
- création depuis un outil UI ;
- création depuis replay/snapshot si applicable ;
- création legacy Squirrel si applicable.

1. Ajouter une option de diagnostic temporaire, si nécessaire :

ATOME_CREATE_TRACE=true

1. Logguer le flux sans changer le comportement :

createAtome called
input payload received
canonical id resolved
DOM created before commit? yes/no
commit called? yes/no
state_current refreshed? yes/no
renderer mounted? yes/no

Résultat attendu

Un rapport clair :

Quels chemins créent un atome ?
Quels chemins montent du DOM trop tôt ?
Quels chemins bypassent le commit canonique ?
Quels chemins utilisent createAtome comme renderer au lieu de créateur métier ?

⸻

Phase 1 — Cartographier le createAtome actuel

Objectif

Comprendre précisément ce que fait createAtome aujourd’hui avant de le modifier.

À analyser dans tool_genesis.js

Pour createAtome, repérer :

- génération d’id ;
- normalisation du payload ;
- création ou modification d’objet Atome ;
- écriture backend ;
- appel à commitBatch ou équivalent ;
- append event ou create event ;
- accès à state_current ;
- création DOM ;
- insertion DOM ;
- styles inline ;
- data-* ;
- mounting renderer ;
- callbacks après création ;
- side effects sur globals ;
- side effects sur selection ;
- side effects sur timeline ;
- side effects sur renderedAtomes / renderedAtomeHosts.

Sortie attendue

Produire une mini-fiche :

Fonction : createAtome
Fichier : tool_genesis.js
Rôle actuel réel : ...
Entrées : ...
Sorties : ...
Side effects : ...
Crée du DOM avant commit : oui/non
Utilise DOM comme stockage temporaire : oui/non
Commit canonique utilisé : oui/non
state_current utilisé après commit : oui/non

⸻

Phase 2 — Séparer les responsabilités internes

Objectif

Découper createAtome en responsabilités séparées, sans changer immédiatement tous les appels externes.

Créer ou isoler des fonctions internes

1. buildCreateAtomeCommand(input)

Rôle : transformer l’entrée UI/API en commande métier.

input brut
  ↓
commande explicite

Ne doit pas créer de DOM.

1. validateCreateAtomeCommand(command)

Rôle : vérifier que la commande est complète et canonique.

À vérifier :

- kind présent ;
- id stable ou génération contrôlée ;
- propriétés minimales ;
- parent ou container si nécessaire ;
- aucune donnée DOM comme vérité ;
- aucune timeline complète dans le payload ;
- aucune source média brute non portable ;
- aucune propriété runtime non canonique.

1. commitCreateAtome(command)

Rôle : créer réellement l’atome dans le pipeline canonique.

Doit passer par le système existant approprié :

append event
DB
particles
particles_versions
state_current
commitBatch si c’est le chemin canonique existant

Ne doit pas monter le DOM.

1. refreshCreatedAtomeState(atomeId)

Rôle : relire l’état canonique après commit.

state_current / getStateCurrent / équivalent existant

Ne doit pas lire le DOM.

1. renderCreatedAtome(canonicalState)

Rôle : demander au renderer de produire la vue minimale.

canonical state
  ↓
renderer adapter
  ↓
DOM host minimal

Le DOM apparaît seulement ici.

⸻

Phase 3 — Transformer createAtome en orchestrateur

Objectif

createAtome peut rester l’API publique temporaire, mais il ne doit plus mélanger modèle, commit et DOM.

Structure cible

async function createAtome(input, options = {}) {
  const command = buildCreateAtomeCommand(input, options);
  const validated = validateCreateAtomeCommand(command);
  const commitResult = await commitCreateAtome(validated);
  const canonicalState = await refreshCreatedAtomeState(commitResult.atomeId);
  if (options.render !== false) {
    return renderCreatedAtome(canonicalState, options);
  }
  return canonicalState;
}

Règles

- aucune création DOM avant commitCreateAtome ;
- aucun commit basé sur un DOM host ;
- aucun state_current reconstruit depuis le DOM ;
- aucun style inline massif injecté dans createAtome ;
- aucun handler inline créé dans createAtome ;
- aucun data-* lourd créé dans createAtome ;
- aucun renderer ne doit modifier le modèle directement.

⸻

Phase 4 — Déplacer le montage DOM après commit canonique

Objectif

C’est le cœur de la correction.

Le montage DOM doit passer après :

validation
commit canonique
state_current relu ou mis à jour

À faire

Identifier dans createAtome les lignes qui :

- créent un élément DOM ;
- appellent document.createElement ;
- ajoutent un enfant dans le DOM ;
- modifient innerHTML ;
- assignent this.element ;
- montent dans renderedAtomes ou renderedAtomeHosts ;
- appliquent des styles ;
- ajoutent des data-* ;
- branchent des événements UI.

Les déplacer dans une fonction dédiée :

renderCreatedAtome(canonicalState, options)

Important

Si certains appels existants dépendent du DOM immédiatement retourné par createAtome, ne pas casser brutalement.

Prévoir une compatibilité temporaire :

createAtome(...) retourne encore la vue si options.render !== false
createAtome(..., { render: false }) retourne l’état canonique

Mais la création DOM doit quand même être post-commit.

⸻

Phase 5 — Gérer les appels legacy sans casser le rendu

Objectif

Éviter que les anciens appels cassent si le DOM n’est plus créé immédiatement.

À faire

Classer les appels existants en trois catégories :

Catégorie A — Appels métier

Ces appels veulent créer un atome réel.

Ils doivent recevoir :

canonicalState ou atomeId

Pas un DOM element.

Catégorie B — Appels UI/render

Ces appels veulent créer et afficher.

Ils peuvent continuer à appeler :

createAtome(input, { render: true })

Mais le rendu vient après commit.

Catégorie C — Legacy calls

Ces appels attendent peut-être directement :

HTMLElement
this.element
DOM host

Pour eux, créer un wrapper temporaire :

createAtomeAndRenderLegacy(input, options)

Ce wrapper doit être marqué :

legacy adapter
à migrer
interdit pour nouveau code

⸻

Phase 6 — Contrat de retour clair

Objectif

Éviter que createAtome retourne parfois un DOM, parfois un modèle, parfois autre chose.

Option recommandée

Retourner un objet structuré :

{
  atomeId,
  canonicalState,
  view: domHostOrNull,
  committed: true,
  rendered: trueOrFalse
}

Exemple

const result = await createAtome(payload, { render: true });
result.atomeId;
result.canonicalState;
result.view;

Règle

Le code appelant ne doit plus deviner ce que createAtome retourne.

⸻

Phase 7 — Tests ciblés avant refactor lourd

Tests minimaux avant modification

Créer ou identifier des tests pour :

- création d’un atome simple ;
- création d’un atome avec parent/container ;
- création d’un atome média audio ;
- création d’un atome média vidéo ;
- création depuis matrice ;
- création depuis projet ;
- création puis sélection ;
- création puis refresh ;
- création puis destruction/reconstruction DOM ;
- création sans rendu : render:false ;
- création legacy si nécessaire.

Test critique

1. Appeler createAtome(..., { render: false })
2. Vérifier qu’aucun DOM n’est créé
3. Vérifier que l’atome existe dans state_current
4. Appeler renderCreatedAtome(canonicalState)
5. Vérifier que le DOM host apparaît

Test ordre d’exécution

1. Instrumenter createAtome
2. Vérifier l’ordre : validate -> commit -> state_current -> render
3. Échouer si document.createElement intervient avant commit

⸻

Phase 8 — Tests anti-régression après correction

Test : le DOM ne crée pas l’atome

- createAtome(payload, { render: false })
- aucun DOM host créé
- atome présent dans state_current
- atome présent dans le stockage canonique

Test : le rendu vient après le commit

- createAtome(payload, { render: true })
- commit appelé avant render
- state_current relu avant render
- DOM host créé depuis canonicalState

Test : le DOM peut être détruit

- créer atome avec rendu
- supprimer son DOM host
- relire state_current
- rerender
- vérifier que l’atome réapparaît correctement

Test : le DOM ne modifie pas le modèle

- créer atome
- modifier manuellement data-atome-id ou data-role dans le DOM
- forcer refresh renderer
- vérifier que state_current ne change pas
- vérifier qu’aucun commit backend n’est produit

Test : compatibilité legacy

- exécuter les anciens scénarios qui dépendaient de createAtome
- vérifier que le rendu apparaît encore
- vérifier qu’aucun atome n’est créé uniquement dans le DOM

⸻

Phase 9 — Gestion des médias dans createAtome

Objectif

Ne pas casser les atomes médias pendant la séparation commit/rendu.

Règle

La création d’un atome média doit créer d’abord :

MediaAtom canonique
MediaResource ou source_ref valide
state_current à jour

Ensuite seulement :

MediaRenderer
DOM host minimal
canvas/WebGPU si nécessaire
thumbnail/waveform

Test audio

- createAtome audio avec render:false
- vérifier source_ref
- vérifier durée si disponible
- vérifier absence de DOM
- render
- vérifier waveform ou génération waveform

Test vidéo

- createAtome video avec render:false
- vérifier source_ref
- vérifier source.url ou source.bytes disponible
- vérifier absence de DOM
- render
- vérifier thumbnail ou génération thumbnail
- vérifier absence de data-media-api-error durable

⸻

Phase 10 — Gestion de la sélection

Objectif

Éviter que la sélection crée une dépendance au DOM.

Règle

Après création :

selection = état UI temporaire

La sélection peut référencer :

atomeId
viewId

Mais elle ne doit pas être la preuve que l’atome existe.

À faire

Si createAtome sélectionne automatiquement l’atome créé :

- sélectionner par atomeId après commit ;
- renderer applique l’état sélectionné à la vue ;
- ne pas utiliser le DOM comme source de sélection canonique.

⸻

Phase 11 — Gestion de renderedAtomes / renderedAtomeHosts

Objectif

Empêcher ces registres de devenir des stores métier.

Règle

Ils peuvent exister comme caches de rendu :

renderedAtomes = vues actuellement montées
renderedAtomeHosts = hôtes DOM actuellement montés

Ils ne doivent pas être utilisés pour :

- reconstruire un atome ;
- produire un commit ;
- restaurer un projet ;
- synchroniser ;
- décider de la vérité métier.

À faire

Vérifier tous les usages dans tool_genesis.js et autour.

Si un usage métier existe, le remplacer par une lecture de :

state_current

ou par une commande canonique.

⸻

Phase 12 — Stratégie de migration progressive

Objectif

Faire la correction sans tout casser.

Ordre recommandé

1. Ajouter les traces et tests d’ordre d’exécution.
2. Extraire buildCreateAtomeCommand.
3. Extraire validateCreateAtomeCommand.
4. Extraire commitCreateAtome sans changer le rendu.
5. Extraire renderCreatedAtome.
6. Modifier createAtome pour orchestrer validate -> commit -> state_current -> render.
7. Ajouter option render:false.
8. Adapter les appels métier pour utiliser render:false si nécessaire.
9. Garder un wrapper legacy temporaire pour les appels UI anciens.
10. Ajouter tests anti-régression.
11. Supprimer progressivement les chemins legacy.

⸻

Ce qu’il ne faut pas faire

- Ne pas déplacer brutalement tout le DOM sans tests.
- Ne pas créer un nouveau createAtome parallèle permanent.
- Ne pas faire un workaround qui contourne state_current.
- Ne pas masquer les erreurs de rendu.
- Ne pas garder deux vérités : createAtome DOM-first et createAtome canonique.
- Ne pas créer le DOM puis essayer de déduire le modèle depuis lui.
- Ne pas utiliser le DOM preview comme source de commit.

⸻

Critères de validation finale

L’étape 13 est considérée comme traitée si :

- tous les nouveaux atomes passent par CreateAtomeCommand ;
- createAtome ne crée plus de DOM avant commit canonique ;
- createAtome peut fonctionner avec render:false ;
- le rendu utilise state_current ou canonicalState après commit ;
- le DOM host est minimal ;
- les anciens scénarios de création fonctionnent encore ;
- les atomes médias fonctionnent encore ;
- la sélection fonctionne encore ;
- le DOM peut être détruit puis reconstruit ;
- renderedAtomes/renderedAtomeHosts ne sont pas des sources métier ;
- aucun commit backend n’est produit depuis lecture du DOM.

Formule finale :

createAtome crée un atome canonique.
renderCreatedAtome affiche cet atome.
Le DOM ne participe jamais à la naissance de l’atome.
