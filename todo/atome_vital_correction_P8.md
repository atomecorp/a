# Prompt — P8 Migration des styles inline statiques vers CSS de production

Contexte

P7 a traité la partie critique du DOM de production liée aux données lourdes et aux fuites de ressources :

- `data-preview-signature` supprimé du DOM de production ;
- previews, thumbnails, waveforms et signatures déplacés vers des registres/caches runtime ;
- `data:image`, `data:audio`, `data:video` et `base64` absents des captures runtime validées ;
- `media_user_id`, URLs locales persistantes et sources protégées absentes des attributs DOM audités ;
- canvas de rendu nommés par `data-role` ;
- audit DOM enrichi avec PASS/FAIL, compteurs base64/data URI/signature, handlers inline, sources locales, ratio de styles inline et propriétés inline les plus fréquentes.

La dette restante de P7 n'est donc plus la vérité métier dans le DOM. La dette restante est la densité de styles inline statiques.

Dernier constat runtime propre :

- les seuils bloquants de données lourdes passent ;
- `inline_handler_count = 0` ;
- `localhost_or_127_count_in_persisted_attrs = 0` ;
- `base64_in_dom_count = 0` ;
- `data_uri_in_dom_count = 0` ;
- `data_preview_signature_count = 0` ;
- `canvas_without_role_count = 0` ;
- mais `inline_style_ratio` reste trop élevé, environ `0.80` sur une capture runtime propre.

Objectif P8

Réduire massivement les styles inline statiques dans le DOM de production Atome/eVe.

Objectif immédiat :

`inline_style_ratio < 0.50`

Objectif suivant :

`inline_style_ratio < 0.25`

Cible finale :

`inline_style_ratio < 0.10`

Formule finale :

CSS classes / CSS variables = style stable de production  
Inline style = valeur réellement dynamique et non factorisable  
DOM = projection minimale, lisible, auditée, reconstructible  
Identité DOM = `id` namespacé dérivé de `atome_id`, registre runtime = source de vérité

Règles non négociables

1. Ne pas supprimer les styles après rendu.

Interdit :

- nettoyer `style=""` après coup ;
- faire un post-processing du DOM ;
- masquer les styles inline dans un export ;
- créer un mode d'audit qui ignore les styles réels.

Correction attendue :

- modifier les générateurs responsables ;
- déplacer les styles statiques vers classes CSS ou presets existants ;
- garder en inline uniquement les valeurs dynamiques nécessaires.

2. Ne pas créer un nouveau système CSS parallèle.

Réutiliser en priorité :

- `eVe/elements/system_ui_tokens.js` ;
- `eVe/elements/eVe_look.js` ;
- `eVe/elements/look/css_preset.js` ;
- `eVe/elements/design.js` ;
- `eVe/elements/design/panel_chrome.js` ;
- les modules design déjà documentés dans `maps/DESIGN_MAP.md`.

Créer une nouvelle classe ou un nouveau module CSS uniquement si :

- aucun owner existant ne couvre le cas ;
- le style est répété ;
- le nom décrit un rôle de production stable ;
- la carte de design est mise à jour.

3. Ne pas casser les dimensions dynamiques.

Inline autorisé pour :

- `left`, `top`, `right`, `bottom` calculés à runtime ;
- `width`, `height`, `min-width`, `min-height` calculés par layout, drag, resize, média ou timeline ;
- `transform` ;
- `opacity` animée ;
- `z-index` temporaire ;
- coordonnées de drag, resize, crop, scrub, playback ;
- variables CSS dynamiques comme `--clip-x`, `--track-height`, `--preview-height`.

Inline interdit quand la valeur est statique :

- couleurs fixes ;
- fonds fixes ;
- borders fixes ;
- radius fixes ;
- padding/margin fixes ;
- typographie fixe ;
- `display:flex` répété ;
- `align-items` et `justify-content` répétés ;
- styles de boutons ;
- styles de panels ;
- styles de tiles projet ;
- styles de preview ;
- styles de couches globales ;
- styles de headers/footers/outils.

4. Garder le DOM comme projection.

P8 ne doit pas réintroduire :

- données métier dans `data-*` ;
- JSON encodé ;
- base64 ;
- data URI ;
- URL locale persistée ;
- source média protégée ;
- handler inline.

Toute migration de style doit préserver les garanties P7.

5. Alléger les attributs métier du DOM par identité runtime.

Le DOM ne doit pas porter les données métier nécessaires uniquement au framework quand elles peuvent être retrouvées par une identité unique et un registre runtime.

Principe recommandé :

```js
// Runtime
const atome_id = "29e26b0b-e986-4809-a6d5-8c559376e5a3";

// DOM
const dom_id = toDomId(atome_id); // "eve-atome_29e26b0b-e986-4809-a6d5-8c559376e5a3"

// Registry
atomeRegistry.set(atome_id, atome);
```

Forme DOM standard pour le host principal d'un atome :

```html
<div id="eve-atome_abc123" class="eve-matrix-tile"></div>
```

Règles :

- le registre Atome reste indexé par `atome_id` brut, jamais par l'id DOM dérivé ;
- l'id DOM doit être namespacé et commencer par une lettre pour rester pratique avec CSS, debug et tooling ;
- la conversion `atome_id` vers id DOM doit être centralisée dans un petit owner framework, par exemple `toDomId(atome_id)` / `fromDomId(dom_id)` ;
- le host DOM principal porte l'id unique ; les sous-éléments utilisent des classes de rôle et une navigation relative depuis le host ;
- `data-atome-id` est optionnel et réservé aux éléments secondaires, au debug explicite, aux tests ou à du HTML généré hors registre runtime ;
- les attributs custom directs comme `atome_id="..."` sont à éviter dans le DOM HTML ;
- les attributs métier redondants comme `data-project-name`, `data-slot-index`, `data-first-empty-slot`, `data-total-slots` ou `data-matrix-empty` doivent être supprimés quand le registre runtime ou la structure DOM permet de les reconstruire sans ambiguïté.

Attention :

- si un même `atome_id` possède plusieurs représentations DOM visibles, un seul élément peut être le host principal avec `id`; les autres représentations doivent utiliser une identité secondaire namespacée ou `data-atome-id` si nécessaire ;
- si une tile de matrix représente un projet plutôt qu'un atome réel, choisir un préfixe honnête et stable, par exemple `eve-project-tile_`, plutôt que forcer `eve-atome_`.

Étape 1 — Établir l'audit de départ

Utiliser une capture runtime propre, avec un utilisateur de test neuf, et exécuter :

```bash
node scripts/check_dom_projection_guardrails.mjs --paths temp/p7_runtime_dom_final
```

Collecter :

- `inline_style_ratio` ;
- `inline_style_count` ;
- `node_count` ;
- `inline_style_properties` ;
- top 20 des éléments porteurs de styles inline ;
- fichiers/fonctions générateurs.

Sortie attendue :

| Propriété inline | Occurrences | Rôle UI | Générateur propriétaire | Statique/dynamique | Action |
| --- | ---: | --- | --- | --- | --- |

Exemples de propriétés fréquentes observées :

- `display` ;
- `width` ;
- `pointer-events` ;
- `background` ;
- `height` ;
- `align-items` ;
- `min-width` ;
- `min-height` ;
- `overflow` ;
- `position` ;
- `color` ;
- `justify-content` ;
- `border-radius` ;
- `padding` ;
- `box-shadow` ;
- `border`.

Étape 2 — Classer les styles par surface

Classer les styles inline par owner, pas par fichier isolé :

- racine système et fond ;
- couches globales Intuition ;
- panels/dialogs ;
- Molecule/MTraX ;
- timeline/ruler/tracks/clips ;
- outils/footer/toolbar ;
- project tiles / Atome hosts ;
- placeholders et overlays ;
- contrôles partagés.

Pour chaque surface :

- identifier le module propriétaire ;
- vérifier `maps/CODEMAP.md`, `maps/DESIGN_MAP.md`, `maps/API_MAP.md`, `maps/ARCHITECTURE_MAP.md` avant modification ;
- décider si le style appartient à un preset existant, une classe existante, ou une nouvelle classe.

Étape 3 — Réduire les attributs DOM par registre runtime

Pour les surfaces `project tiles / Atome hosts`, Molecule/MTraX et overlays :

- identifier le host DOM principal de chaque atome ou représentation stable ;
- remplacer les attributs métier redondants par un `id` DOM namespacé dérivé de l'identité runtime ;
- déplacer les correspondances métier vers un registre runtime en mémoire ;
- garder dans le DOM seulement les classes de rôle, l'id du host principal et les attributs indispensables à l'accessibilité ou au rendu ;
- vérifier que les événements retrouvent l'objet runtime via `closest(...)`, `fromDomId(host.id)` puis `atomeRegistry.get(atome_id)`.

Exemple attendu :

Avant :

```html
<div
  class="eve-matrix-tile is-filled is-current"
  data-project-id="29e26b0b-e986-4809-a6d5-8c559376e5a3"
  data-project-name="untitled"
  data-slot-index="0">
</div>
```

Après :

```html
<div
  id="eve-atome_29e26b0b-e986-4809-a6d5-8c559376e5a3"
  class="eve-matrix-tile is-filled is-current">
</div>
```

Avec en mémoire :

```js
atomeRegistry.set("29e26b0b-e986-4809-a6d5-8c559376e5a3", {
  atome_id: "29e26b0b-e986-4809-a6d5-8c559376e5a3",
  type: "project_tile",
  project_name: "untitled",
  slot_index: 0,
  state: "current"
});
```

Cette étape ne doit pas supprimer les informations fonctionnelles : elle doit déplacer leur source de vérité du DOM vers le runtime.

Étape 4 — Migrer les styles globaux à fort rendement

Commencer par les styles répétés sur de nombreux noeuds.

Candidats prioritaires :

- couches Intuition globales ;
- panel header/body/footer communs ;
- boutons de panel/outils ;
- containers flex ;
- placeholders ;
- media hosts ;
- preview hosts ;
- timeline rows/tracks/clips.

Exemple attendu :

Avant :

```js
node.style.cssText = 'display:flex;align-items:center;justify-content:center;pointer-events:none;';
```

Après :

```js
node.classList.add('eve-flex-center', 'eve-pointer-passive');
```

ou, si la surface a un owner :

```js
node.classList.add('eve-panel-tool-button');
```

Les classes génériques ne doivent pas devenir un système utilitaire incontrôlé. Préférer les classes de rôle quand le rôle est stable.

Étape 5 — Utiliser des CSS variables pour le dynamique

Quand un style contient une partie statique et une partie dynamique, déplacer le statique en classe et garder le dynamique en variable.

Avant :

```js
clip.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:#111;border-radius:4px;`;
```

Après :

```js
clip.classList.add('eve-timeline-clip');
clip.style.setProperty('--clip-x', `${x}px`);
clip.style.setProperty('--clip-y', `${y}px`);
clip.style.setProperty('--clip-width', `${w}px`);
clip.style.setProperty('--clip-height', `${h}px`);
```

CSS :

```css
.eve-timeline-clip {
  position: absolute;
  left: var(--clip-x);
  top: var(--clip-y);
  width: var(--clip-width);
  height: var(--clip-height);
  background: var(--eve-timeline-clip-bg);
  border-radius: var(--eve-radius-sm);
}
```

Étape 6 — Interdire les migrations risquées

Ne pas migrer sans preuve :

- styles liés au drag/resize actif ;
- styles de bounds viewport ;
- styles de WebGPU/canvas nécessaires au sizing ;
- styles de crop/scrub live ;
- styles calculés par média dimensions ;
- styles conditionnels dépendant de playback ou hover runtime.

Pour ces cas, remplacer seulement les constantes stables, et garder les valeurs dynamiques en inline ou en variables CSS.

Étape 7 — Renforcer l'audit

L'audit doit continuer à afficher :

- `inline_style_ratio` ;
- `inline_style_count` ;
- top propriétés inline ;
- violations de seuil.

Ajouter si nécessaire :

- rapport par `data-role` ;
- rapport par `id` namespacé Atome/eVe ;
- compteur d'attributs métier redondants (`data-project-name`, `data-slot-index`, `data-first-empty-slot`, etc.) ;
- rapport par tag ;
- rapport par surface (`molecule`, `mtrax`, `panel`, `project`, `intuition`) ;
- liste des 20 premiers éléments avec style inline ;
- distinction heuristique statique/dynamique.

Seuil bloquant P8 :

`inline_style_ratio < 0.50`

Seuils à préparer :

- warning si `inline_style_ratio >= 0.25` ;
- target si `inline_style_ratio < 0.10`.

Étape 8 — Tests obligatoires

Après chaque lot de migration :

```bash
npm run check:syntax
npm run check:m0
npm run check:dom-projection-guardrails
npm run test:run -- tests/probes/clip_preview_metadata_source_window.test.mjs
```

Après les changements touchant Molecule/MTraX/media :

```bash
npm run probe:browser-media-acceptance
```

Le probe média peut échouer sur un critère de différence pixel pour un fixture court si le comportement utilisateur est confirmé manuellement. Dans ce cas, documenter précisément :

- fichier concerné ;
- progression transport ;
- résultat visuel manuel ;
- absence d'erreurs console/HTTP ;
- pourquoi l'échec est classé comme fragilité de probe et non régression produit.

Étape 9 — Validation runtime production

Créer une capture DOM runtime propre avec :

- utilisateur de test neuf ;
- import vidéo ;
- import audio ;
- ouverture Molecule/MTraX ;
- preview visible ;
- waveform visible.

Puis vérifier :

- `base64_in_dom_count = 0` ;
- `data_uri_in_dom_count = 0` ;
- `data_preview_signature_count = 0` ;
- `localhost_or_127_count_in_persisted_attrs = 0` ;
- `inline_handler_count = 0` ;
- `canvas_without_role_count = 0` ;
- `inline_style_ratio < 0.50`.

Étape 10 — Résultat attendu

À la fin de P8 :

- le DOM de production reste conforme à P7 ;
- les hosts Atome/projet stables utilisent une identité DOM namespacée reliée à un registre runtime ;
- les attributs métier redondants sont retirés du DOM quand le registre runtime suffit ;
- les styles inline statiques majeurs sont migrés vers classes/presets/CSS variables ;
- le ratio inline passe sous `50 %` sur capture runtime propre ;
- les maps sont mises à jour pour tout owner style déplacé ou créé ;
- aucun nouveau système CSS parallèle n'est introduit ;
- aucune donnée métier ou média lourde ne revient dans le DOM.

Définition de fini

P8 est fini uniquement si :

- `inline_style_ratio < 0.50` dans l'audit runtime propre ;
- les seuils bloquants P7 restent à zéro ;
- les tests obligatoires passent ou les écarts sont documentés avec preuve ;
- la convention `atome_id` runtime / id DOM namespacé / registre en mémoire est documentée quand elle est introduite ;
- les propriétaires de styles migrés sont documentés dans les maps ;
- aucun fichier source touché n'a reçu de nouvelle responsabilité incohérente.
