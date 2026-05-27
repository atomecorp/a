Prompt de correction — DOM Atome, matrice, source de vérité et simplification

Objectif

Corriger l’architecture actuelle d’Atome/eVe afin que :

- le DOM ne soit jamais une source de vérité ;
- les atomes soient minimaux, non verbeux et découplés de leur rendu ;
- la matrice et le projet soient reconstruits depuis le modèle canonique ;
- les IDs DOM soient uniques ;
- les styles inline soient fortement réduits ;
- les erreurs média soient corrigées ;
- les vues soient légères, jetables et reconstructibles ;
- la complexité globale soit réduite au maximum.

Ce prompt doit être exécuté méthodiquement, étape par étape. Ne pas tout modifier brutalement en une seule passe. Chaque étape doit être validée par des tests ou au minimum par un audit mesurable.

⸻

Prompt à donner à l’agent de code

Tu vas corriger l’architecture DOM/Atome/eVe en suivant les étapes ci-dessous dans l’ordre le plus efficace.

Avant toute modification :

1. Parcours le code existant.
2. Identifie les fichiers responsables de la création du DOM de la matrice.
3. Identifie les fichiers responsables de la création du DOM du projet Atome.
4. Identifie les fichiers responsables des atomes, des médias, de la timeline, du renderer, de state_current, des events et des snapshots.
5. Ne crée pas de nouveau système parallèle si un mécanisme équivalent existe déjà.
6. Réutilise l’architecture existante quand elle est saine.
7. Si un ancien système est mauvais, isole-le comme legacy adapter au lieu de le laisser piloter le modèle.

Tu dois impérativement te référer si nécessaire aux fichiers d’audit suivants :

01-call-graph.md
02-event-graph.md
03-state-graph.md
04-source-of-truth-graph.md
05-async-graph.md
06-lifecycle-graph.md
07-risk-map.md
08-open-questions.md
README.md
atome_usage.md

Ces fichiers servent à vérifier les chemins de mutation, les sources de vérité, les cycles de vie et les risques d’architecture.

⸻

Règle absolue

Le DOM ne doit jamais être une source de vérité.

Le DOM doit être :

- minimal ;
- temporaire ;
- jetable ;
- reconstructible ;
- non canonique ;
- non persistant ;
- non porteur du modèle ;
- non porteur du code métier.

Si le DOM est détruit entièrement, le projet doit pouvoir être reconstruit depuis :

events / ADOLE / DB / state_current

Le DOM ne doit contenir que des références courtes et de l’état d’interaction temporaire.

Accepté dans le DOM :

data-atome-id
data-role
data-view-id
data-renderer
data-selected
aria-*
class
id DOM unique temporaire

Interdit dans le DOM :

gros JSON
timeline complète
propriétés métier complètes
groupes complets
membres complets
historique
versions
permissions
chemins fichiers persistants
URLs localhost persistées
waveform complète
thumbnail encodé massif
état de synchronisation
état métier canonique
règles métier
code fonctionnel
handlers inline

⸻

Étape 1 — Figement du diagnostic avant correction

Objectif

Créer ou améliorer un audit automatique du DOM pour mesurer objectivement les progrès.

À faire

Ajouter un outil ou script d’audit capable de mesurer, pour la matrice et pour le projet :

- taille du DOM exporté ;
- nombre total de nœuds ;
- nombre de div ;
- nombre de span ;
- nombre de boutons ;
- nombre de canvas ;
- nombre de video ;
- nombre total d’attributs data-* ;
- nombre de data-* contenant du JSON ;
- nombre de data-* dépassant 256 caractères ;
- nombre de styles inline ;
- nombre d’IDs dupliqués ;
- nombre de html/head/body ;
- nombre d’occurrences localhost / 127.0.0.1 ;
- nombre d’erreurs média data-media-api-error ;
- nombre de data-atome-id total ;
- nombre de data-atome-id uniques ;
- liste des data-atome-id répétés ;
- présence de data-group-timeline ;
- présence de propriétés métier lourdes dans le DOM.

Résultat attendu

Produire un rapport lisible avant/après.

Ne pas continuer sans un état initial mesurable.

⸻

Étape 2 — Verrouiller la source de vérité unique

Objectif

Éliminer toute ambiguïté entre modèle, état courant, renderer, DOM, timeline cache, globals et preview.

Architecture cible

events / ADOLE / DB = vérité historique
state_current = projection canonique courante
frontend store minimal = miroir contrôlé de state_current
renderer = transformation du modèle vers la vue
DOM = projection minimale jetable
Canvas / WebGPU = rendu dense jetable
SelectionAPI = état UI temporaire
timeline cache = cache dérivé régénérable
preview timeline = sandbox temporaire

À faire

Identifier tous les endroits où le code :

- lit le DOM pour reconstruire un atome ;
- lit le DOM pour reconstruire une timeline ;
- lit le DOM pour reconstruire un média ;
- lit le DOM pour produire un commit backend ;
- utilise renderedAtomes comme store métier ;
- utilise renderedAtomeHosts comme store métier ;
- utilise TIMELINE_STATE comme source canonique ;
- utilise des globals de sélection comme source métier ;
- applique des patches realtime directement à la vue comme vérité.

Puis remplacer ces usages par :

Command explicite
  ↓
Validator
  ↓
Domain service
  ↓
Event append / mutation contrôlée
  ↓
state_current
  ↓
Renderer
  ↓
Vue minimale

Interdictions

- aucune mutation canonique depuis lecture du DOM ;
- aucun commit backend basé sur un DOM preview ;
- aucun replay timeline appliqué au backend depuis l’état du DOM ;
- aucun cache utilisé comme source canonique ;
- aucun global UI utilisé comme vérité métier.

⸻

Étape 3 — Séparer définitivement Atome canonique et DOM host

Objectif

Un atome ne doit pas être un élément DOM. Un atome doit être un objet métier minimal affichable par différents renderers.

À faire

Identifier les objets legacy de type Squirrel/Atome qui possèdent directement :

this.element
HTMLElement
style inline
children DOM
handlers DOM
configuration copiée dans la vue

Les classer comme :

Legacy DOM Adapter

et non comme modèle canonique.

Architecture cible

Atome canonique minimal
  ↓
Renderer adapter
  ↓
DOM host / Canvas / WebGPU

Contrat d’atome minimal

Un atome doit ressembler à :

{
  "id": "atom_audio_001",
  "kind": "audio",
  "properties": {
    "source_ref": "media://audio_001",
    "duration": 12.42,
    "visual_ref": "waveform_audio_001_v1"
  }
}

Il ne doit pas ressembler à :

{
  "id": "atom_audio_001",
  "html": "<div>...</div>",
  "style": "width:...; height:...;",
  "dom_id": "...",
  "timeline_json_inside_dom": "...",
  "waveform_pixels": "...",
  "runtime_selection_state": true,
  "ui_cache": "..."
}

Résultat attendu

Le modèle canonique ne dépend plus d’un HTMLElement.

⸻

Étape 4 — Corriger les IDs DOM dupliqués

Objectif

Supprimer tous les IDs HTML dupliqués.

Problème actuel

Les audits DOM montrent encore des IDs dupliqués, notamment autour de :

project_view_...
eve_background_visual_layer
eve_project_matrix
eve_project_matrix_scroll
view
intuition
intuition_tool_layer

Règle

id HTML = unique dans le document
id HTML = temporaire, lié à une instance de vue
data-atome-id = identifiant métier stable

À faire

Remplacer les IDs fixes réutilisés par des classes ou par des IDs de vue générés.

Exemple incorrect :

<div id="eve_project_matrix"></div>
<div id="eve_project_matrix"></div>

Exemple correct :

<div class="eve-project-matrix" data-view-id="matrix_view_001"></div>
<div class="eve-project-matrix" data-view-id="matrix_view_002"></div>

Ou :

<div id="view_8f3a91" class="eve-project-matrix"></div>

Test obligatoire

L’audit doit retourner :

duplicate_id_count = 0

⸻

Étape 5 — Réduire massivement les styles inline

Objectif

Sortir les styles répétitifs du DOM et réduire la verbosité.

Problème actuel

Le DOM contient encore trop de styles inline.

À faire

Remplacer les styles inline répétitifs par :

classes CSS
variables CSS
tokens d’interface
presets de renderer
layout rules centralisées

Règle

Le style inline est autorisé uniquement pour des valeurs réellement dynamiques :

transform calculé
position temporaire
dimensions runtime
drag preview
opacity animée
z-index ponctuel

Il est interdit pour :

couleurs fixes
font-size fixe
background fixe
border fixe
display/flex répétitif
padding/margin répétitifs
styles de boutons
styles de tiles
styles de panels

Exemple incorrect

<div style="display:flex; padding:8px; background:#111; border-radius:12px;"></div>

Exemple correct

<div class="eve-panel eve-panel--dark"></div>

Test obligatoire

Définir un seuil progressif :

Phase 1 : réduire les styles inline d’au moins 50 %
Phase 2 : descendre sous 25 % des nœuds
Phase 3 : descendre sous 10 % des nœuds

⸻

Étape 6 — Corriger les racines HTML multiples

Objectif

Éviter que les exports ou fragments contiennent plusieurs html, head, body.

Problème actuel

Les nouveaux DOM contiennent encore :

2 html
3 head
4 body

À faire

Identifier si cela vient :

- d’un dump trop global ;
- d’iframes ;
- de fragments complets injectés ;
- de templates mal sérialisés ;
- de plusieurs app roots concaténées.

Règle

Un composant, une matrice ou un projet ne doit jamais produire :

<html>
<head></head>
<body></body>
</html>

sauf s’il s’agit explicitement du document complet de l’application.

Résultat attendu

Pour un export de sous-vue :

html_count = 0
head_count = 0
body_count = 0

Pour un export document complet :

html_count = 1
head_count = 1
body_count = 1

⸻

Étape 7 — Isoler les exports DOM par sous-vue

Objectif

Éviter que l’audit matrice/projet soit pollué par toute l’interface globale.

Problème actuel

Les DOM matrice et projet ont des métriques proches, ce qui suggère que les dumps capturent trop large.

À faire

Créer des exports séparés :

export_matrix_subtree.dom
export_project_subtree.dom
export_timeline_subtree.dom
export_media_hosts_subtree.dom
export_full_app_debug.dom

Règle

Les audits précis doivent utiliser les subtrees ciblés, pas le document complet.

Résultat attendu

On doit pouvoir auditer séparément :

- matrice seule ;
- projet seul ;
- timeline seule ;
- média hosts seuls ;
- app complète.

⸻

Étape 8 — Réduire les data-* au strict minimum

Objectif

Supprimer toute donnée non nécessaire dans le DOM.

Règle

data-* doit contenir uniquement :

- identifiants courts ;
- rôles UI ;
- références de renderer ;
- état d’interaction temporaire.

data-* ne doit jamais contenir :

- JSON complet ;
- timeline ;
- properties complètes ;
- sources locales persistantes ;
- cache ;
- historique ;
- permissions ;
- modèle métier.

À faire

Scanner tous les attributs data-* et supprimer/déplacer :

- toute valeur longue ;
- toute valeur ressemblant à du JSON ;
- toute valeur contenant des chemins locaux persistants ;
- toute valeur contenant des erreurs utilisées comme logique métier ;
- toute valeur dupliquant `state_current`.

Test obligatoire

json_like_data_count = 0
large_data_count = 0
data-group-timeline = absent

Ces trois points sont déjà améliorés : ne pas régresser.

⸻

Étape 9 — Vérifier les répétitions de data-atome-id

Objectif

S’assurer que les mêmes atomes apparaissent plusieurs fois uniquement comme projections, jamais comme duplications d’état.

Problème actuel

Les audits montrent que les mêmes data-atome-id sont répétés plusieurs fois dans le DOM.

Règle

Un atome peut avoir plusieurs vues.
Une vue ne doit jamais posséder sa propre vérité de l’atome.

À faire

Pour chaque data-atome-id répété :

1. Identifier les vues qui le référencent.
2. Vérifier qu’elles ne stockent aucune propriété métier complète.
3. Vérifier qu’elles ne peuvent pas muter directement l’atome.
4. Vérifier que leurs données viennent de state_current ou du renderer.
5. Vérifier qu’elles sont détruisibles/reconstructibles.

Résultat attendu

Les répétitions de data-atome-id sont documentées comme projections légitimes ou supprimées si inutiles.

⸻

Étape 10 — Corriger les erreurs média

Objectif

Corriger les erreurs média visibles dans le DOM.

Problèmes observés

Le DOM contient encore des erreurs de type :

data-media-api-error = play_record_native_local_path_required
Video clip requires source.url or source.bytes

À faire

Auditer la chaîne média :

MediaAtom
  ↓
MediaResource
  ↓
source_ref
  ↓
source.url ou source.bytes
  ↓
MediaRenderer
  ↓
thumbnail/waveform
  ↓
DOM host minimal

Règle

Un DOM host média ne doit pas contenir l’erreur comme état durable.

Il peut afficher une erreur temporaire, mais l’erreur réelle doit venir du modèle/runtime média, pas être une vérité du DOM.

Contrat média obligatoire

Un atome audio valide doit avoir :

id stable
type audio
source_ref valide
durée détectée
waveform générée ou régénérable
cache waveform persisté ou régénérable
restauration après refresh
restauration après reboot

Un atome vidéo valide doit avoir :

id stable
type video
source_ref valide
source.url ou source.bytes disponible pour le renderer
durée détectée
thumbnail généré ou régénérable
cache thumbnail persisté ou régénérable
restauration après refresh
restauration après reboot

Tests obligatoires

Utiliser tous les fichiers disponibles dans :

./tests/fixtures/media

Tester :

- import audio ;
- import vidéo ;
- record audio si disponible ;
- record vidéo si disponible ;
- refresh ;
- reboot ;
- vérification waveform audio ;
- vérification thumbnail vidéo ;
- vérification preview playable ;
- vérification absence de data-media-api-error durable.

⸻

Étape 11 — Réduire le nombre de canvas actifs

Objectif

Éviter de créer trop de canvas simultanés.

Problème actuel

Le nombre de canvas a augmenté dans les nouveaux DOM.

À faire

Identifier :

- canvas réellement visibles ;
- canvas nécessaires au rendu actif ;
- canvas inactifs ;
- canvas dupliqués ;
- canvas créés par tile/clip alors qu’un pool suffirait.

Architecture cible

1 canvas principal pour zones denses si possible
1 canvas preview actif
pool de canvas réutilisables
textures gérées par renderer
DOM host minimal par média

Règle

Ne pas créer un canvas permanent pour chaque clip ou chaque tile si un rendu groupé suffit.

⸻

Étape 12 — Encadrer timeline preview et replay

Objectif

Empêcher la timeline preview de devenir une source de vérité.

À faire

S’assurer que le replay timeline produit :

ReplayState

puis :

ReplayState -> Renderer preview

et jamais :

DOM preview -> Backend

Si l’état replayé doit être appliqué

Il doit passer par :

ReplayState
  ↓
Command list
  ↓
Validator
  ↓
commitBatch
  ↓
state_current
  ↓
renderer

Interdiction

Aucun commit ne doit être produit en lisant le DOM preview.

⸻

Étape 13 — Unifier les chemins de création d’atome

Objectif

Tous les atomes doivent naître par le même chemin canonique.

Problème

Il peut exister plusieurs chemins :

route directe db.createAtome
create_atome event-style
kind:set
frontend adapters
legacy creation

Architecture cible

CreateAtomeCommand
  ↓
validate canonical envelope
  ↓
append create event
  ↓
materialize atomes/particles/state_current
  ↓
renderer creates view

À faire

Transformer les routes parallèles en wrappers du chemin canonique.

Si un chemin ne peut pas être migré immédiatement, le marquer :

legacy/internal/deprecated

et empêcher son usage pour les nouveaux atomes.

⸻

Étape 14 — Unifier snapshots legacy et snapshots projet

Objectif

Éviter deux vérités de restauration.

À faire

Identifier :

legacy atome snapshot helpers
new project/state snapshot pipeline

Architecture cible

snapshot = état projet/state_current validé à un instant donné
legacy snapshot = adapter de migration uniquement

Règle

Un snapshot ne restaure jamais directement un DOM.

Il doit passer par :

Snapshot
  ↓
validate
  ↓
restore commands / controlled projection replacement
  ↓
state_current
  ↓
renderer

⸻

Étape 15 — Ajouter les tests de reconstruction sans DOM

Objectif

Prouver que le DOM n’est plus une source de vérité.

Test décisif

1. Créer un projet.
2. Créer plusieurs atomes.
3. Importer des médias audio et vidéo.
4. Créer des clips sur timeline.
5. Générer waveforms et thumbnails.
6. Détruire entièrement le DOM.
7. Reconstruire la vue depuis state_current / ADOLE / DB.
8. Vérifier que le projet est identique fonctionnellement.
9. Vérifier que les médias sont encore valides.
10. Vérifier que les waveforms et thumbnails sont restaurés ou régénérés.

Test anti-corruption DOM

1. Modifier artificiellement un data-* dans le DOM.
2. Forcer un refresh renderer.
3. Vérifier que state_current ne change pas.
4. Vérifier qu’aucun commit backend n’est produit.

Si ce test échoue, le DOM influence encore la vérité.

⸻

Étape 16 — Ajouter des seuils de validation finale

Objectif

Empêcher les régressions.

Seuils obligatoires immédiats

json_like_data_count = 0
large_data_count = 0
data-group-timeline = absent
duplicate_id_count = 0
DOM mutation -> no canonical mutation
DOM destroy/rebuild -> project restored

Seuils à améliorer progressivement

inline style ratio < 25 %, puis < 10 %
canvas count réduit au strict nécessaire
data-* count réduit au minimum
data-atome-id repetitions justifiées
html/head/body corrects selon type d’export
media error count = 0 après import/refresh/reboot

⸻

Ordre d’exécution recommandé

Ne pas commencer par les styles. L’ordre efficace est :

1. Audit automatique DOM avant/après.
2. Verrouillage source de vérité unique.
3. Séparation Atome canonique / DOM host.
4. Pipeline de mutation unique.
5. IDs DOM uniques.
6. Suppression des racines HTML multiples ou clarification des exports.
7. Export par sous-vue pour auditer proprement.
8. Réduction data-*.
9. Vérification data-atome-id répétés.
10. Correction média source.url/source.bytes.
11. Tests import/record/refresh/reboot médias.
12. Encadrement timeline preview/replay.
13. Unification des chemins de création.
14. Unification snapshots.
15. Réduction styles inline.
16. Réduction canvas actifs.
17. Tests finaux anti-régression.

Pourquoi cet ordre :

- la source de vérité doit être corrigée avant la performance ;
- les IDs doivent être corrigés avant les tests DOM fiables ;
- les exports doivent être isolés avant les métriques précises ;
- les médias doivent être corrigés avant validation refresh/reboot ;
- les styles inline sont importants mais secondaires par rapport à l’intégrité ;
- les canvas sont à optimiser après stabilisation du modèle et du renderer.

⸻

Résultat final attendu

À la fin de la correction :

- le DOM ne contient plus de modèle métier ;
- le DOM ne contient plus de gros JSON ;
- le DOM ne contient plus de timeline complète ;
- le DOM ne contient plus d’IDs dupliqués ;
- les styles inline sont fortement réduits ;
- les erreurs média sont corrigées ;
- les sources média sont valides ;
- les waveforms audio persistent ou se régénèrent ;
- les thumbnails vidéo persistent ou se régénèrent ;
- le projet est reconstructible sans lire le DOM ;
- la timeline preview ne peut pas écrire au backend depuis le DOM ;
- les chemins de création d’atomes sont unifiés ;
- les snapshots ne restaurent jamais directement la vue ;
- les atomes restent minimaux, clairs et non verbeux ;
- le renderer est responsable de la vue ;
- ADOLE / DB / events / state_current restent la vérité.

Formule de validation finale :

Le DOM peut être détruit sans perte.
Le modèle peut reconstruire le DOM.
Le DOM ne peut pas reconstruire le modèle.
