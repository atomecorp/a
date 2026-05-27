Plan de correction restant — validation finale DOM / Atome / eVe

Objectif

Ce document liste les tâches restantes après vérification de :

- `todo/atome_vital_correction_P2.md`
- `todo/atome_vital_correction_P3.md`

Constat vérifié

Les corrections P2/P3 ne peuvent pas encore être considérées comme totalement terminées.

Les garde-fous et plusieurs tests existent et passent, mais les exports DOM d'exemple échouent encore aux seuils finaux.

Commandes exécutées pendant l'audit :

```sh
node --test tests/scripts/check_dom_projection_guardrails.test.mjs tests/scripts/export_dom_subtrees.test.mjs tests/eve/project_dom_teardown_reconstruction.test.mjs tests/eve/media_projection_state.dom_contract.test.mjs tests/probes/tool_genesis_create_atome_order.test.mjs tests/eve/group_state_runtime.dom_contract.test.mjs tests/eve/media_atom_integrity.test.mjs tests/eve/adole_commit_boundary.test.mjs
node scripts/check_dom_projection_guardrails.mjs
node scripts/check_dom_projection_guardrails.mjs --paths tests/fixtures/dom,tests/atom_matrix_example.dom,tests/atome_project_example.dom
node scripts/check_squirrel_dom_adapter_guardrails.mjs
node --test atome/shared/atome_contract.test.mjs tests/eve/atome_commit.sanitization.test.mjs tests/eve/media_persistence_service.sanitization.test.mjs
```

Résultats importants :

- les tests ciblés passent ;
- le scan DOM par défaut passe sur `tests/fixtures/dom` ;
- `createAtome` est bien orchestré en commit canonique avant rendu ;
- les exports `tests/atom_matrix_example.dom` et `tests/atome_project_example.dom` échouent encore avec 129 violations.

Métriques bloquantes observées sur les exports d'exemple :

```txt
files: 3
dom_size_bytes: 1026100
node_count: 2251
div_count: 1456
span_count: 220
button_count: 330
canvas_count: 21
video_count: 10
data_attribute_count: 4371
json_like_data_count: 0
large_data_count: 0
inline_style_count: 1924
duplicate_id_count: 127
html_count: 4
head_count: 6
body_count: 8
localhost_occurrence_count: 20
media_error_count: 0
data_group_timeline: absent
heavy_business_data_count: 0
violations: 129
```

Conclusion actuelle

P3 est largement avancé, mais doit encore être validé par des scénarios runtime plus complets.

P2 n'est pas terminé, car les seuils finaux ne sont pas respectés sur les exports DOM d'exemple.

⸻

Règle de travail

Ne pas contourner les garde-fous.

Chaque correction doit :

1. réduire une métrique mesurable ;
2. préserver le modèle canonique ;
3. éviter de faire du DOM une source de vérité ;
4. ajouter ou mettre à jour un test si le comportement corrigé peut régresser.

Les exports DOM peuvent être des captures obsolètes. Il faut d'abord déterminer s'ils doivent être régénérés ou s'ils révèlent encore un bug réel du renderer.

⸻

Étape 1 — Clarifier le statut des exports DOM d'exemple

Objectif

Savoir si `tests/atom_matrix_example.dom` et `tests/atome_project_example.dom` sont :

- des fixtures obsolètes à remplacer ;
- des captures volontairement historiques à déplacer hors des garde-fous stricts ;
- des preuves d'un problème réel dans le rendu actuel.

Fichiers concernés

- `tests/atom_matrix_example.dom`
- `tests/atome_project_example.dom`
- `scripts/check_dom_projection_guardrails.mjs`
- `scripts/export_dom_subtrees.mjs`
- `tests/scripts/check_dom_projection_guardrails.test.mjs`
- `tests/scripts/export_dom_subtrees.test.mjs`

À faire

1. Lire l'historique et les références de ces fichiers :

```sh
rg -n "atom_matrix_example|atome_project_example|check_dom_projection_guardrails|export_dom_subtrees" package.json scripts tests maps todo eVe atome
git log --oneline -- tests/atom_matrix_example.dom tests/atome_project_example.dom scripts/check_dom_projection_guardrails.mjs
```

2. Déterminer si ces `.dom` sont utilisés comme fixtures maintenues ou comme exemples debug.

3. Si ce sont des captures obsolètes :

- les régénérer depuis un runtime corrigé avec `scripts/export_dom_subtrees.mjs` ;
- ou les déplacer sous `temp/` / documentation debug non testée ;
- ou les renommer clairement en fixtures legacy si elles doivent rester comme exemples négatifs.

4. Si ce sont des fixtures maintenues :

- corriger le renderer jusqu'à ce qu'elles passent les seuils ;
- ne pas abaisser les seuils pour faire passer le test.

Validation

La commande suivante doit avoir un statut clair :

```sh
node scripts/check_dom_projection_guardrails.mjs --paths tests/fixtures/dom,tests/atom_matrix_example.dom,tests/atome_project_example.dom
```

Deux issues acceptables seulement :

- elle passe ;
- ou les deux exports d'exemple ne sont plus dans le périmètre des fixtures maintenues, et cette décision est documentée dans `maps/CODEMAP.md` et/ou `maps/ARCHITECTURE_MAP.md`.

⸻

Étape 2 — Corriger les IDs DOM dupliqués

Objectif

Atteindre :

```txt
duplicate_id_count = 0
```

Problème observé

Les exports d'exemple contiennent 127 IDs dupliqués, dont :

- `view`
- `project_view_*`
- `eve_project_matrix`
- `intuition`
- `intuition_tool_layer`
- `eve_delete_dialog`
- `eve_size_dialog`
- plusieurs IDs de styles (`unit-styles`, `slice-styles`, etc.)

Causes probables

- plusieurs exports complets concaténés dans un seul fichier `.dom` ;
- styles injectés plusieurs fois avec le même ID ;
- overlays/dialogs réutilisés sans namespace de vue ;
- racines globales clonées dans des sous-vues.

À faire

1. Distinguer deux cas :

- duplication dans une capture concaténée ;
- duplication dans le DOM live réel.

2. Pour les captures concaténées :

- modifier le flux d'export pour produire un fichier par sous-vue ;
- ne jamais concaténer plusieurs documents complets dans un `.dom` de sous-vue.

3. Pour le DOM live réel :

- remplacer les IDs globaux par des IDs namespacés par `projectId`, `viewId` ou `layerId` ;
- pour les styles, utiliser une fonction `ensureStyleElement(id)` qui réutilise l'élément existant au lieu d'en injecter un nouveau ;
- pour les dialogs, créer un singleton par surface ou utiliser `data-role` pour les instances répétées.

4. Ajouter un test ciblé si une fonction d'injection de style ou de création de layer est corrigée.

Commandes de recherche utiles

```sh
rg -n "id =|\\.id\\s*=|setAttribute\\('id'|setAttribute\\(\"id\"|unit-styles|slice-styles|eve_base_styles|eve_project_matrix|intuition_tool_layer|eve_delete_dialog|eve_size_dialog" eVe atome scripts tests
```

Validation

```sh
node scripts/check_dom_projection_guardrails.mjs --paths tests/fixtures/dom,tests/atom_matrix_example.dom,tests/atome_project_example.dom
```

La sortie doit contenir :

```txt
duplicate_id_count: 0
violations: 0
```

⸻

Étape 3 — Corriger les racines HTML multiples dans les exports `.dom`

Objectif

Atteindre, pour les exports de sous-vue :

```txt
html_count = 0
head_count = 0
body_count = 0
```

Problème observé

Les exports `.dom` contiennent :

```txt
html_count: 4
head_count: 6
body_count: 8
```

Règle

Un fichier `.dom` doit représenter une sous-vue jetable, pas un document complet.

À faire

1. Vérifier si `tests/atom_matrix_example.dom` et `tests/atome_project_example.dom` contiennent plusieurs documents complets.

2. Si oui, les remplacer par des exports produits via :

```sh
node scripts/export_dom_subtrees.mjs --input <capture-complete.html> --out temp/dom_subtree_exports
```

3. Ne versionner que les sous-vues minimales nécessaires aux tests.

4. Garder le full app debug uniquement sous `temp/`, sauf si un test explicite en a besoin.

Validation

```sh
node scripts/check_dom_projection_guardrails.mjs --paths tests/atom_matrix_example.dom,tests/atome_project_example.dom
```

La sortie doit contenir :

```txt
html_count: 0
head_count: 0
body_count: 0
```

⸻

Étape 4 — Supprimer les occurrences localhost / 127.0.0.1 dans les projections DOM maintenues

Objectif

Atteindre :

```txt
localhost_occurrence_count = 0
```

Problème observé

Les exports d'exemple contiennent 20 occurrences `localhost` / `127.0.0.1`.

Règle

Les URLs locales ne doivent pas être persistées dans le DOM maintenu.

Le DOM peut contenir une projection runtime temporaire uniquement si elle n'est pas utilisée comme vérité et n'est pas versionnée comme fixture canonique.

À faire

1. Localiser les occurrences :

```sh
rg -n "localhost|127\\.0\\.0\\.1" tests/atom_matrix_example.dom tests/atome_project_example.dom eVe atome
```

2. Identifier si les URLs viennent :

- de `media_url` canonique mal normalisé ;
- d'un état runtime projeté dans `data-*` ;
- d'une capture debug obsolète ;
- d'un src media live acceptable mais non maintenable en fixture.

3. Pour les médias :

- conserver dans le modèle une source portable (`/api/recordings/...`, asset id, media id, storage key) ;
- calculer l'URL locale uniquement au moment du montage média ;
- ne jamais écrire l'URL locale dans un `data-*` durable.

4. Si une URL locale est nécessaire pour lecture immédiate :

- la stocker dans une propriété runtime non sérialisée ou directement dans `src/currentSrc` ;
- ne pas l'inclure dans les fixtures DOM maintenues.

Validation

```sh
node scripts/check_dom_projection_guardrails.mjs --paths tests/fixtures/dom,tests/atom_matrix_example.dom,tests/atome_project_example.dom
```

La sortie doit contenir :

```txt
localhost_occurrence_count: 0
```

⸻

Étape 5 — Réduire les styles inline sur les surfaces maintenues

Objectif

Descendre progressivement sous les seuils P2 :

```txt
inline style ratio < 25 %
inline style ratio < 10 %
```

Problème observé

Les exports d'exemple contiennent :

```txt
inline_style_count: 1924
node_count: 2251
```

Cela donne un ratio très élevé.

Règle

Les styles de structure et de composant doivent vivre dans des classes CSS.

Les styles inline ne doivent rester que pour :

- coordonnées runtime ;
- dimensions runtime ;
- transformation interactive temporaire ;
- variables CSS très ciblées.

À faire

1. Ne pas commencer par une refonte globale.

2. Identifier les plus gros générateurs de styles inline :

```sh
rg -n "\\.style\\.|setAttribute\\(['\"]style|style:" eVe/intuition eVe/core eVe/domains atome/src
```

3. Classer chaque style :

- statique : migrer en CSS ;
- dynamique mais discret : remplacer par variable CSS ;
- runtime strict : garder inline mais justifier ;
- debug/preview : supprimer ou isoler.

4. Prioriser :

- tool layers ;
- dialogs ;
- panels ;
- matrix ;
- group preview ;
- media hosts ;
- timeline.

5. Ajouter ou mettre à jour un test DOM si une surface a un seuil dédié.

Validation minimale

```sh
node scripts/check_dom_projection_guardrails.mjs --paths tests/fixtures/dom,tests/atom_matrix_example.dom,tests/atome_project_example.dom
```

Objectif progressif :

```txt
inline_style_count <= 25 % du node_count
```

Puis :

```txt
inline_style_count <= 10 % du node_count
```

⸻

Étape 6 — Valider P3 par scénarios runtime complets

Objectif

Confirmer que la restructuration de `createAtome` ne casse pas les scénarios historiques.

Déjà validé

Le test statique suivant passe :

```sh
node --test tests/probes/tool_genesis_create_atome_order.test.mjs
```

Il vérifie que :

- `commitCreateAtome` précède le refresh ;
- `renderCreatedAtome` suit le refresh canonique ;
- `render:false` existe ;
- `createAtome` ne crée pas directement de DOM ;
- `renderCreatedAtome` délègue au renderer existant.

Reste à valider

Scénarios runtime :

- création d'atome simple ;
- création média image ;
- création média audio ;
- création média vidéo ;
- création depuis matrice ;
- création depuis projet ;
- création depuis import média ;
- création depuis timeline ;
- création depuis outil UI ;
- création avec sélection active ;
- création avec parent explicite ;
- création avec `render:false` ;
- création multi-parent si la sélection contient plusieurs parents.

À faire

1. Ajouter un probe runtime qui monkey-patch :

- `window.Atome.commit`
- `document.createElement`
- `renderAtomeRecord` si accessible
- `window.dispatchEvent`

2. Pour chaque création, enregistrer l'ordre réel :

```txt
build command
validate command
commit
state_current refresh
render
event dispatch
```

3. Vérifier qu'aucun `document.createElement` lié à l'atome créé ne survient avant le commit.

4. Vérifier que `render:false` produit un état canonique sans view.

5. Vérifier que la création média ne persiste pas de source locale dans le DOM ou dans les propriétés canonisées.

Fichiers probables

- `eVe/intuition/runtime/tool_genesis.js`
- `eVe/intuition/matrix/core/project_data.js`
- `eVe/core/atome_events/project_layer_runtime.js`
- `eVe/intuition/tools/core/tool_runtime.js`
- `eVe/intuition/eVeIntuition.js`
- `eVe/domains/mtrax/transport/transport_gestures_runtime.js`
- `tests/probes/atome_persistence_probe.test.mjs`
- `tests/probes/media_import_probe.test.mjs`
- `tests/probes/browser_media_acceptance_probe.test.mjs`

Validation

Créer ou compléter un test du type :

```txt
tests/probes/tool_genesis_create_atome_runtime_order.test.mjs
```

La validation finale P3 doit passer avec :

```sh
node --test tests/probes/tool_genesis_create_atome_order.test.mjs
node tests/probes/atome_persistence_probe.test.mjs
node tests/probes/media_import_probe.test.mjs
node tests/probes/browser_media_acceptance_probe.test.mjs
```

Si un probe nécessite un serveur local, documenter la commande exacte de démarrage et l'URL testée.

⸻

Étape 7 — Auditer les lectures DOM encore utilisées comme vérité métier

Objectif

Prouver que le DOM ne reconstruit jamais le modèle.

Risque restant

Des helpers lisent encore des informations depuis le host DOM :

- `readGroupStepsFromHost`
- `readGroupTimelineFromHost`
- `readGroupPreviewFromHost`
- `readMediaProjectionSource`
- `readMediaProjectionIdentifier`
- `readMediaProjectionError`
- `getRenderedAtomeHost`
- `renderedAtomes`
- `renderedAtomeHosts`

Ces lectures peuvent être acceptables pour de l'UI runtime, mais interdites pour :

- commit backend ;
- snapshot ;
- reconstruction projet ;
- replay timeline ;
- synchronisation ;
- source canonique.

À faire

1. Cartographier tous les usages :

```sh
rg -n "readGroupStepsFromHost|readGroupTimelineFromHost|readGroupPreviewFromHost|readMediaProjectionSource|readMediaProjectionIdentifier|readMediaProjectionError|getRenderedAtomeHost|renderedAtomes|renderedAtomeHosts" eVe atome tests
```

2. Pour chaque usage, le classer :

- UI projection temporaire ;
- rendu ;
- diagnostic ;
- commit ;
- snapshot ;
- timeline ;
- sync.

3. Corriger tout usage métier :

- remplacer la lecture DOM par `state_current` ;
- ou passer par une commande canonique explicite ;
- ou lire depuis les propriétés canoniques déjà chargées.

4. Ajouter un test anti-corruption DOM :

- modifier artificiellement un `data-*` ;
- forcer un refresh renderer ;
- vérifier que `state_current` ne change pas ;
- vérifier qu'aucun commit backend n'est produit.

Validation

Créer ou renforcer :

```txt
tests/eve/project_dom_teardown_reconstruction.test.mjs
tests/eve/dom_projection_cannot_mutate_canonical_state.test.mjs
```

Critères :

```txt
DOM mutation -> no canonical mutation
DOM mutation -> no backend commit
DOM destroy/rebuild -> project restored from state_current / ADOLE / DB
```

⸻

Étape 8 — Encadrer snapshots, replay et timeline preview

Objectif

Garantir que snapshot, replay et preview ne restaurent jamais directement le DOM comme vérité.

À faire

1. Rechercher les chemins snapshot/replay :

```sh
rg -n "snapshot|restore|replay|preview|timeline" eVe atome tests | head -200
```

2. Identifier les fonctions qui :

- lisent le DOM ;
- écrivent un commit ;
- restaurent une vue ;
- injectent une timeline ;
- rejouent des clips.

3. Pour chaque chemin, imposer le flux :

```txt
snapshot/replay input
↓
validate
↓
restore command / preview command
↓
state_current ou sandbox preview
↓
renderer
```

4. Ajouter un garde-fou :

- une preview timeline ne peut pas appeler `window.Atome.commit` ;
- un snapshot ne peut pas restaurer `innerHTML` comme état projet ;
- un replay ne peut pas produire un commit à partir d'un host DOM.

Validation

Ajouter des tests ciblés :

```txt
tests/eve/timeline_preview_no_backend_commit.test.mjs
tests/eve/snapshot_restore_uses_canonical_state.test.mjs
```

⸻

Étape 9 — Remplacer ou régénérer les fixtures DOM maintenues

Objectif

Les fixtures DOM versionnées doivent représenter l'état corrigé, pas l'état historique cassé.

À faire

1. Après corrections runtime, capturer un DOM complet.

2. Exporter les sous-vues :

```sh
node scripts/export_dom_subtrees.mjs --input <capture-complete.html> --out temp/dom_subtree_exports
```

3. Vérifier les exports temporaires :

```sh
node scripts/check_dom_projection_guardrails.mjs --paths temp/dom_subtree_exports
```

4. Remplacer uniquement les fixtures maintenues nécessaires.

5. Ne pas versionner :

- full app debug massif ;
- captures contenant URLs locales ;
- exports concaténés ;
- document roots dans `.dom`.

Validation

```sh
node scripts/check_dom_projection_guardrails.mjs
node scripts/check_dom_projection_guardrails.mjs --paths tests/fixtures/dom,tests/atom_matrix_example.dom,tests/atome_project_example.dom
```

⸻

Étape 10 — Mettre à jour les maps d'architecture

Objectif

Documenter précisément ce qui est désormais canonique, ce qui est projection, et ce qui est legacy adapter.

Fichiers à mettre à jour si les corrections modifient les responsabilités :

- `maps/CODEMAP.md`
- `maps/ARCHITECTURE_MAP.md`
- `maps/API_MAP.md`

À documenter

- `createAtome` est un orchestrateur canonique temporaire ;
- `renderCreatedAtome` est propriétaire du montage DOM post-commit ;
- `renderedAtomes` / `renderedAtomeHosts` sont des caches de projection, pas des stores métier ;
- les fixtures DOM maintenues sont auditées par `check_dom_projection_guardrails.mjs` ;
- les captures debug complètes restent sous `temp/` ;
- les previews timeline sont sandboxées et non persistantes ;
- snapshots et replay restaurent via commandes / state_current, pas via DOM.

Validation

```sh
rg -n "DOM source|source de vérité|renderedAtomes|createAtome|check_dom_projection_guardrails|snapshot|timeline preview" maps
```

⸻

⸻

Complément opérationnel fusionné depuis P5

Cette section reprend intégralement les informations ajoutées dans `todo/atome_vital_correction_P5.md` afin de conserver un seul document maître. Elle complète les étapes précédentes avec les métriques séparées Matrice / Projet Atome, les règles détaillées de styles inline, les répétitions `data-atome-id`, le contrôle canvas/vidéos et les seuils CI.

# Tâches finales — Nettoyage complet du DOM Atome / Matrice

## Objectif

Résoudre les derniers problèmes visibles après la correction de l’étape 13.

L’architecture semble maintenant beaucoup plus saine sur le point principal : le DOM ne transporte plus massivement de données métier, les gros JSON ont disparu, les erreurs média visibles ont disparu, les canvas/vidéos ont fortement diminué.

Mais le DOM n’est pas encore validable tant que les points suivants ne sont pas corrigés :

```txt
- racines html/head/body multiples ;
- IDs HTML dupliqués ;
- styles inline encore massifs ;
- exports DOM probablement trop globaux ou mal segmentés ;
- répétitions de data-atome-id à justifier ;
- nombre de canvas/vidéos à maintenir sous contrôle ;
- tests finaux de non-régression.
```

---

# État actuel observé

## Matrice

```txt
Taille : environ 570 Ko
Nœuds HTML : environ 1163
data-* : environ 2215
gros data-* : 0
JSON dans data-* : 0
data-media-api-error : 0
canvas : 10
vidéos : 5
data-atome-id total : 15
atomes uniques : 3
html/head/body : encore multiples
IDs dupliqués : encore présents
styles inline : environ 85 % des nœuds
```

## Projet Atome

```txt
Taille : environ 456 Ko
Nœuds HTML : environ 1085
data-* : environ 2150
gros data-* : 0
JSON dans data-* : 0
data-media-api-error : 0
canvas : 10
vidéos : 5
data-atome-id total : 15
atomes uniques : 3
html/head/body : encore multiples
IDs dupliqués : encore présents
styles inline : environ 86 % des nœuds
```

---

# Priorité 1 — Corriger les racines HTML multiples

## Problème

Les exports contiennent encore plusieurs occurrences de :

```txt
html
head
body
```

Un DOM correct ne doit pas contenir plusieurs documents imbriqués ou concaténés.

## Objectif

Comprendre si le problème vient :

```txt
- du DOM live réel ;
- d’un export concaténé ;
- de plusieurs app roots ;
- d’un snapshot global ;
- d’iframes ;
- de templates qui injectent html/head/body ;
- d’un outil d’export qui agrège plusieurs documents ;
- d’une réhydratation qui remonte plusieurs instances complètes.
```

## Tâches

```txt
1. Identifier le code d’export DOM.
2. Vérifier si l’export cible document.documentElement, body, ou plusieurs roots.
3. Vérifier si des fragments HTML complets sont injectés dans la vue.
4. Vérifier si plusieurs documents ou iframes sont concaténés.
5. Vérifier si la matrice et le projet exportent toute l’app au lieu du subtree visé.
6. Corriger l’export selon le type attendu.
```

## Règles

Pour un export de document complet :

```txt
html_count = 1
head_count = 1
body_count = 1
```

Pour un export de sous-vue :

```txt
html_count = 0
head_count = 0
body_count = 0
```

## Validation

Créer ou modifier l’audit pour échouer si :

```txt
- un subtree contient html/head/body ;
- un document complet contient plus d’un html/head/body ;
- un export matrice/projet capture toute l’app sans le signaler explicitement.
```

---

# Priorité 2 — Supprimer tous les IDs HTML dupliqués

## Problème

Il reste encore des IDs dupliqués.

Exemples observés :

```txt
view
eve_background_visual_layer
project_view_...
eve_project_matrix
eve_project_matrix_scroll
intuition
intuition_tool_layer
intuition_floating_group_layer
intuition_molecule_layer
intuition_component_layer
```

Un ID HTML doit être unique dans le document.

## Hypothèse forte

Les duplications semblent liées aux racines multiples ou à des exports concaténés, car plusieurs IDs apparaissent plusieurs fois avec les mêmes structures.

## Tâches

```txt
1. Corriger d’abord les racines multiples.
2. Relancer l’audit des IDs.
3. Classer les IDs restants en deux catégories :
   - IDs dupliqués causés par export global/concaténé ;
   - IDs réellement dupliqués par le renderer ou les templates.
4. Pour chaque ID dupliqué restant, identifier le générateur exact.
5. Remplacer les IDs fixes réutilisés par des classes ou par des view_id uniques.
6. Ne pas utiliser data-atome-id comme id HTML.
7. Ne pas réutiliser un id métier stable comme id DOM.
```

## Règle cible

```txt
id HTML = unique, temporaire, lié à une instance de vue
data-atome-id = stable, métier, non unique dans la vue si plusieurs projections existent
class = pour les éléments réutilisables
```

## Exemple incorrect

```html
<div id="eve_project_matrix"></div>
<div id="eve_project_matrix"></div>
```

## Exemple correct

```html
<div class="eve-project-matrix" data-view-id="matrix_view_001"></div>
<div class="eve-project-matrix" data-view-id="matrix_view_002"></div>
```

ou :

```html
<div id="view_8f3a91" class="eve-project-matrix"></div>
```

## Validation

```txt
duplicate_id_count = 0
```

Cette valeur doit être bloquante pour valider le DOM.

---

# Priorité 3 — Segmenter correctement les exports DOM

## Problème

Les DOM matrice et projet ont des métriques proches, ce qui suggère qu’ils capturent encore trop d’interface globale.

## Objectif

Créer des exports ciblés par sous-vue pour auditer précisément chaque zone.

## Exports attendus

```txt
export_full_app_debug.dom
export_matrix_subtree.dom
export_project_subtree.dom
export_timeline_subtree.dom
export_media_hosts_subtree.dom
export_toolbar_subtree.dom
```

## Règles

```txt
export_full_app_debug.dom peut contenir html/head/body.
Les exports *_subtree.dom ne doivent jamais contenir html/head/body.
Chaque export doit déclarer clairement sa racine cible.
Un export matrice ne doit pas inclure toute l’app.
Un export projet ne doit pas inclure toute l’app.
```

## Tâches

```txt
1. Identifier les roots DOM réelles : app, matrice, projet, timeline, media hosts, toolbar.
2. Ajouter une fonction d’export par root.
3. Nommer explicitement les exports.
4. Ajouter dans chaque export un commentaire ou header debug indiquant la root exportée.
5. Relancer l’audit séparément sur chaque export.
```

## Validation

L’audit doit distinguer :

```txt
full_app_debug
matrix_subtree
project_subtree
timeline_subtree
media_hosts_subtree
```

et ne plus mélanger les résultats.

---

# Priorité 4 — Réduire les styles inline à la source

## Problème

Les styles inline restent très élevés : environ 85–86 % des nœuds.

Ce n’est pas le problème architectural principal, mais c’est encore trop lourd pour une architecture propre, maintenable et portable.

## Objectif

Réduire les styles inline en corrigeant le renderer ou les générateurs, pas en nettoyant le DOM après rendu.

## Tâches

```txt
1. Auditer les styles inline les plus fréquents.
2. Regrouper les styles répétitifs par pattern.
3. Identifier le fichier/fonction qui les génère.
4. Séparer styles statiques et styles dynamiques.
5. Transformer les styles statiques en classes CSS.
6. Transformer les valeurs partagées en variables CSS ou tokens.
7. Garder inline uniquement les valeurs dynamiques nécessaires.
8. Relancer l’audit après chaque catégorie migrée.
```

## Styles inline autorisés

```txt
transform calculé
position temporaire
dimensions runtime réellement variables
drag preview
opacity animée
z-index ponctuel
coordonnées dépendantes du viewport
```

## Styles inline à supprimer

```txt
background fixe
color fixe
font-size fixe
font-family fixe
border fixe
border-radius fixe
padding fixe
margin fixe
display:flex répété
align-items répété
justify-content répété
styles de boutons
styles de panels
styles de tiles
```

## Exemple incorrect

```html
<div style="display:flex; padding:8px; background:#111; border-radius:12px;"></div>
```

## Exemple correct

```html
<div class="eve-panel eve-panel--dark"></div>
```

## Seuils progressifs

```txt
Phase 1 : styles inline < 50 % des nœuds
Phase 2 : styles inline < 25 % des nœuds
Phase 3 : styles inline < 10 % des nœuds
```

## Validation finale souhaitée

```txt
inline_style_ratio < 10 %
```

---

# Priorité 5 — Vérifier les répétitions de `data-atome-id`

## Problème

Le nombre de `data-atome-id` a fortement diminué, mais certains atomes peuvent encore apparaître plusieurs fois dans la vue.

Cela peut être correct si ce sont des projections différentes. Cela devient dangereux si chaque projection porte sa propre vérité.

## Règle

```txt
Un atome peut avoir plusieurs vues.
Une vue ne doit jamais posséder sa propre vérité de l’atome.
```

## Tâches

```txt
1. Lister tous les data-atome-id répétés.
2. Pour chaque atome répété, lister les éléments DOM qui le référencent.
3. Vérifier que ces éléments ne contiennent pas de propriétés métier complètes.
4. Vérifier qu’ils ne peuvent pas produire un commit depuis leurs attributs.
5. Vérifier qu’ils sont reconstruits depuis state_current ou canonicalState.
6. Documenter les répétitions légitimes.
7. Supprimer les répétitions inutiles.
```

## Validation

Pour chaque répétition restante :

```txt
raison = projection légitime
source = state_current / renderer
mutation directe = interdite
commit depuis DOM = impossible
```

---

# Priorité 6 — Maintenir les `data-*` sous contrôle

## Progrès actuel

Les points critiques sont déjà bons :

```txt
gros data-* = 0
JSON dans data-* = 0
data-group-timeline absent
```

## Objectif

Ne pas régresser et réduire encore le volume global si possible.

## Tâches

```txt
1. Scanner tous les data-* restants.
2. Classer chaque data-* : nécessaire / debug / legacy / supprimable.
3. Retirer les data-* de debug en production.
4. Retirer les data-* redondants avec class, aria ou state_current.
5. Garder uniquement les références courtes utiles au renderer ou aux interactions.
```

## Data-* acceptés

```txt
data-atome-id
data-role
data-view-id
data-renderer
data-selected
data-media-kind si nécessaire
data-state minimal si strictement UI
```

## Data-* interdits

```txt
JSON
modèle complet
timeline complète
propriétés métier complètes
cache
historique
permissions
source locale persistante
```

## Validation

```txt
json_like_data_count = 0
large_data_count = 0
data_group_timeline_count = 0
```

Ces valeurs doivent rester à zéro.

---

# Priorité 7 — Garder les médias propres

## Progrès actuel

Les erreurs média visibles ont disparu :

```txt
data-media-api-error = 0
```

## Objectif

Vérifier que cette correction est réelle et pas seulement visuelle.

## Tâches

```txt
1. Vérifier la chaîne MediaAtom -> MediaResource -> Renderer.
2. Vérifier que source_ref est stable.
3. Vérifier que source.url ou source.bytes existe au moment du rendu.
4. Vérifier que les erreurs ne sont pas simplement masquées.
5. Vérifier refresh/reboot.
6. Vérifier import audio.
7. Vérifier import vidéo.
8. Vérifier record audio si disponible.
9. Vérifier record vidéo si disponible.
10. Vérifier waveform audio.
11. Vérifier thumbnail vidéo.
```

## Validation

```txt
media_error_count = 0 après import
media_error_count = 0 après refresh
media_error_count = 0 après reboot
waveform restaurée ou régénérée
thumbnail restauré ou régénéré
preview jouable
```

---

# Priorité 8 — Stabiliser le nombre de canvas et vidéos

## Progrès actuel

Les canvas et vidéos ont fortement diminué :

```txt
canvas : 63 -> 10
vidéos : 20 -> 5
```

## Objectif

Vérifier que ce nombre est justifié et stable.

## Tâches

```txt
1. Lister tous les canvas actifs.
2. Identifier leur rôle exact.
3. Vérifier s’ils sont visibles ou nécessaires.
4. Vérifier qu’il n’existe pas de canvas dupliqué par clip/tile inutilement.
5. Vérifier qu’un pool est utilisé si plusieurs canvas temporaires sont nécessaires.
6. Vérifier que les anciennes instances sont bien détruites.
7. Faire le même audit pour les éléments video.
```

## Règle

```txt
Canvas permanent uniquement si nécessaire.
Canvas temporaire via pool.
Pas de canvas par clip si un rendu groupé suffit.
Pas de video par clip si une source active suffit.
```

## Validation

```txt
canvas_count justifié
video_count justifié
aucune fuite après navigation / refresh / changement de projet
```

---

# Priorité 9 — Vérifier que `createAtome` reste bien canonique

## Objectif

Après correction de l’étape 13, vérifier que le comportement ne régresse pas.

## Tâches

```txt
1. Tester createAtome avec render:false.
2. Vérifier qu’aucun DOM n’est créé avant commit.
3. Vérifier que l’atome existe dans state_current.
4. Vérifier que renderCreatedAtome affiche l’atome après commit.
5. Vérifier que les anciens appels UI fonctionnent encore.
6. Vérifier que les atomes médias passent par le même pipeline.
7. Vérifier que renderedAtomes/renderedAtomeHosts ne sont pas des stores métier.
```

## Validation

```txt
validate -> commit -> state_current -> render
```

Aucun `document.createElement` lié à l’atome ne doit intervenir avant le commit canonique.

---

# Priorité 10 — Tests finaux de reconstruction sans DOM

## Objectif

Prouver que le DOM n’est pas une source de vérité.

## Test décisif

```txt
1. Créer un projet.
2. Créer plusieurs atomes.
3. Importer audio et vidéo.
4. Créer des clips timeline si applicable.
5. Générer waveforms et thumbnails.
6. Détruire entièrement le DOM.
7. Reconstruire depuis state_current / ADOLE / DB.
8. Vérifier que tout revient fonctionnellement.
9. Vérifier que les médias sont toujours valides.
10. Vérifier que les vues sont recréées sans lecture de l’ancien DOM.
```

## Test anti-corruption DOM

```txt
1. Modifier manuellement un data-* dans le DOM.
2. Modifier manuellement un id DOM.
3. Modifier manuellement une classe DOM.
4. Forcer un refresh renderer.
5. Vérifier que state_current ne change pas.
6. Vérifier qu’aucun commit backend n’est produit.
```

## Validation

```txt
DOM détruit = aucune perte métier
DOM modifié = aucune mutation canonique
DOM reconstruit = vue correcte
```

---

# Priorité 11 — Ajouter un seuil bloquant dans l’audit CI

## Objectif

Empêcher les régressions.

## Seuils bloquants immédiats

```txt
json_like_data_count = 0
large_data_count = 0
data_group_timeline_count = 0
data_media_api_error_count = 0
duplicate_id_count = 0
subtree_html_count = 0
subtree_head_count = 0
subtree_body_count = 0
```

## Seuils progressifs

```txt
inline_style_ratio < 50 %
inline_style_ratio < 25 %
inline_style_ratio < 10 %
canvas_count stable et justifié
video_count stable et justifié
data_attribute_count réduit ou justifié
```

## Rapport attendu

Chaque audit doit produire :

```txt
status: pass/fail
metrics
régressions depuis dernier audit
liste des IDs dupliqués si fail
liste des styles inline les plus fréquents
liste des data-* suspects
liste des canvas/video actifs
```

---

# Ordre d’exécution recommandé

## Ordre prioritaire

```txt
1. Corriger les racines html/head/body multiples.
2. Relancer l’audit.
3. Corriger les IDs dupliqués restants.
4. Segmenter les exports DOM par sous-vue.
5. Vérifier data-atome-id répétés.
6. Maintenir data-* à zéro pour JSON/gros attributs.
7. Vérifier médias après refresh/reboot.
8. Vérifier createAtome canonique.
9. Réduire styles inline par classes/tokens.
10. Vérifier canvas/vidéos actifs.
11. Ajouter seuils bloquants CI.
12. Exécuter le test final de destruction/reconstruction DOM.
```

## Pourquoi cet ordre

```txt
- Les racines multiples peuvent expliquer une partie des IDs dupliqués.
- Les IDs doivent être corrigés avant de considérer le DOM valide.
- Les exports doivent être segmentés pour obtenir des métriques fiables.
- Les styles inline sont importants, mais moins critiques que la validité structurelle.
- Les médias semblent corrigés, mais doivent être prouvés par refresh/reboot.
- Les tests DOM destruct/rebuild valident l’architecture globale.
```

---

# Critères de validation finale

Le DOM sera considéré comme correctement traité si :

```txt
- aucun gros JSON dans data-* ;
- aucun data-* volumineux ;
- aucune timeline complète dans le DOM ;
- aucune erreur média persistante dans le DOM ;
- aucune racine html/head/body invalide ;
- aucun ID HTML dupliqué ;
- exports DOM segmentés et fiables ;
- data-atome-id répétés uniquement comme projections légitimes ;
- styles inline fortement réduits ;
- canvas/vidéos justifiés ;
- createAtome reste canonique ;
- le DOM peut être détruit sans perte ;
- le DOM peut être reconstruit depuis state_current ;
- le DOM ne peut jamais modifier la vérité métier.
```

Formule finale :

```txt
Le DOM est une projection minimale, valide, jetable et reconstructible.
La vérité reste dans ADOLE / DB / events / state_current.
Aucun code métier, aucun état canonique et aucun modèle complet ne vivent dans la vue.
```

⸻

Étape 11 — Validation finale obligatoire

Objectif

Ne déclarer P2/P3/P4 terminés que si la validation finale passe.

Commandes minimales

```sh
node scripts/check_dom_projection_guardrails.mjs
node scripts/check_dom_projection_guardrails.mjs --paths tests/fixtures/dom,tests/atom_matrix_example.dom,tests/atome_project_example.dom
node scripts/check_squirrel_dom_adapter_guardrails.mjs
node --test tests/scripts/check_dom_projection_guardrails.test.mjs tests/scripts/export_dom_subtrees.test.mjs
node --test tests/eve/project_dom_teardown_reconstruction.test.mjs tests/eve/media_projection_state.dom_contract.test.mjs tests/eve/group_state_runtime.dom_contract.test.mjs tests/eve/media_atom_integrity.test.mjs
node --test tests/probes/tool_genesis_create_atome_order.test.mjs
node --test atome/shared/atome_contract.test.mjs tests/eve/atome_commit.sanitization.test.mjs tests/eve/media_persistence_service.sanitization.test.mjs tests/eve/adole_commit_boundary.test.mjs
```

Commandes runtime à ajouter si environnement disponible

```sh
node tests/probes/atome_persistence_probe.test.mjs
node tests/probes/media_import_probe.test.mjs
node tests/probes/browser_media_acceptance_probe.test.mjs
```

Seuils finaux

```txt
json_like_data_count = 0
large_data_count = 0
data_group_timeline = absent
duplicate_id_count = 0
media_error_count = 0
localhost_occurrence_count = 0 sur les fixtures maintenues
DOM mutation -> no canonical mutation
DOM mutation -> no backend commit
DOM destroy/rebuild -> project restored
createAtome -> commit before render
createAtome render:false -> canonical state without view
renderedAtomes/renderedAtomeHosts -> projection cache only
snapshot/replay -> no direct DOM restore as truth
timeline preview -> no backend commit from DOM
```

Critère de fermeture

La correction est complète seulement quand cette phrase est vraie et prouvée par tests :

```txt
Le DOM peut être détruit sans perte.
Le modèle peut reconstruire le DOM.
Le DOM ne peut pas reconstruire le modèle.
```

⸻

Ordre recommandé

1. Clarifier ou régénérer les exports DOM d'exemple.
2. Corriger les IDs dupliqués.
3. Supprimer les racines HTML multiples des `.dom`.
4. Supprimer les occurrences localhost des projections maintenues.
5. Réduire les styles inline par surfaces.
6. Ajouter les probes runtime manquants pour `createAtome`.
7. Auditer les lectures DOM encore utilisées comme vérité métier.
8. Encadrer snapshots, replay et timeline preview.
9. Régénérer les fixtures DOM maintenues.
10. Mettre à jour les maps.
11. Exécuter la validation finale complète.
