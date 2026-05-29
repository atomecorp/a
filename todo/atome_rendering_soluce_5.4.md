# Atome Rendering Solution 5.4

## Purpose

This document explains how Atomes are supposed to exist in the framework, why the current DOM projection feels too complex, what the real problem is, and what a simpler and more efficient rendering model should look like.

It is written for an AI system that does not know this framework yet.

The goal is not to describe only one export file. The goal is to describe:

- the canonical Atome model
- the current DOM projection layers
- the mismatch between the model and the rendered DOM
- the proposed target architecture
- the tradeoffs and challenge points

This document is intended to be challengeable. It does not assume the solution is correct just because it is simpler.

## Scope of the audit

The analysis is based on the following sources:

- `temp/!atome_matrix_example.html`
- `temp/!atome_project_example.hml`
- `eVe/documentations/atome_object.md`
- `eVe/core/atome_dom_id.js`
- `eVe/intuition/matrix/ui/view.js`
- `eVe/intuition/runtime/tool_genesis.js`
- `eVe/intuition/runtime/selection.js`
- `eVe/elements/eVe_look.js`
- `tests/eve/atome_dom_projection_contract.test.mjs`
- `done/atome_vital_correction_P8.md`
- `done/atome_vital_correction_P10.md`

Important note:

The user request refers to `temp/!atome_project_example.html`, but the file currently present in the repository is `temp/!atome_project_example.hml`.

## Executive summary

The current DOM is more complex than the Atome model requires.

However, the root cause is not that the Atome concept itself is too rich. The root cause is that the current DOM projection mixes multiple concerns in the same visible tree:

- canonical Atome hosts
- project navigation tiles
- project scene containers
- interaction overlays
- system layers
- menu and panel infrastructure
- media rendering helpers

Because these concerns are mixed together, the rendered DOM looks like Atome is structurally heavy, while the actual framework contract already points toward a much smaller canonical representation.

The framework already contains a strong direction:

- runtime is the source of truth
- the registry stores canonical state
- DOM is a visual projection
- business metadata should stay out of DOM attributes
- visual state should use generic classes only
- only dynamic geometry should remain inline when necessary

The best solution is therefore not to invent a new conceptual model for Atome.

The best solution is to enforce a strict separation between:

1. canonical Atome host
2. optional renderer child
3. matrix tile
4. project view
5. system and interaction overlays

## What the framework says an Atome is

The canonical Atome model is already defined in `eVe/documentations/atome_object.md`.

An Atome is a runtime object with a stable identity and validated properties.

Canonical shape:

```js
atome({
  id: 'string',
  type: 'string',
  kind: 'string',
  renderer: 'string?',
  meta: {
    name: 'string?',
    tags: ['string']?,
    created_at: 'iso?',
    updated_at: 'iso?'
  },
  traits: ['string'],
  properties: {}
})
```

Core rules:

- `id` is immutable
- `type` is canonical and selects schema plus defaults
- `kind` is a logical category, not a rendering trick
- `renderer` is a UI hint only
- `properties` carry type-specific data
- tools must operate on traits and capabilities, not hard-coded DOM shapes

This means the Atome model is runtime-first, not DOM-first.

The DOM should never be treated as the canonical object.

## What the framework says DOM should be

The most explicit direction appears in `done/atome_vital_correction_P10.md`.

The rule is strict:

```text
Runtime = source of truth
Registry = real state storage
DOM = minimal visual projection
```

The canonical Atome identity is the raw runtime id.

Example:

```js
const atomeId = 'file_1779975219260_2e17803fac43c8';
```

The DOM receives only a derived and namespaced id:

```html
<div id="eve-atome_file_1779975219260_2e17803fac43c8"></div>
```

This contract is implemented in `eVe/core/atome_dom_id.js`:

- `toDomId(atomeId)` converts runtime id to DOM id
- `fromDomId(domId)` converts DOM id back to runtime id
- runtime metadata is stored in a `WeakMap`
- the DOM host is only an access point

This is important because it means the framework already knows that DOM should be thin.

## What is actually visible in the exported DOM

The exported files show several layers at once.

### In the matrix export

The beginning of `temp/!atome_matrix_example.html` shows a matrix root containing tiles:

```html
<div id="eve_project_matrix" class="is-active">
  <div id="eve_project_matrix_scroll" data-total-slots="64" data-first-empty-slot="5">
    <div class="eve-matrix-tile is-filled is-current" data-project-id="..." data-project-name="..." data-slot-index="0">
      <div class="eve-matrix-tile__preview"></div>
      <div class="eve-matrix-tile__label-row">
        <div class="eve-matrix-tile__label">untitled</div>
      </div>
    </div>
  </div>
</div>
```

This is not an Atome host. This is a navigation tile for a project.

### In the project export

The project export shows a full scene container and multiple Atome hosts:

```html
<div id="project_view_<project-id>" class="eve-drop-target eve-project-drop-target">
  <div data-role="eve_intuitionx-delete-target"></div>
  <div id="eve-atome_<id>" class="eve-atome eve-matrix-tile eve-media-atome"></div>
  <div id="eve-atome_<id>" class="eve-atome eve-matrix-tile eve-text-atome"></div>
</div>
```

This tree mixes:

- the scene container
- an overlay drop target
- an interaction delete target
- actual Atome hosts
- media render helpers

### In the full file body

The exported files also contain:

- `#view`
- `#intuition`
- panel layers
- menu layers
- tool layers
- dialog infrastructure
- system roots
- media raster pools
- matrix root
- project root

This is a full app shell snapshot, not a pure Atome example.

That distinction matters.

## The real problem

The problem is not simply “too many divs”.

The real problem is a responsibility leak.

### Problem 1: one class name is used for incompatible concepts

`eve-matrix-tile` currently serves two different roles:

- a matrix navigation tile in `eVe/intuition/matrix/ui/view.js`
- an Atome host living inside a project view in `eVe/intuition/runtime/tool_genesis.js`

These are not the same object.

One is a project navigation representation.
The other is a scene object host.

As long as they share the same class and visual contract, the DOM remains semantically confusing.

### Problem 2: the DOM mixes canonical projection and application infrastructure

An exported body currently shows more than Atome projection:

- global shell
- project scene
- matrix navigation
- tool overlays
- dialogs
- menu systems
- transient drag layers
- media pools

This makes it difficult to understand what “the Atome DOM” even is.

### Problem 3: matrix tiles still carry redundant business data

The matrix tiles currently expose values like:

- `data-project-id`
- `data-project-name`
- `data-slot-index`
- `data-total-slots`
- `data-first-empty-slot`
- `data-matrix-empty`

But the repository already documents that this kind of state should be reconstructed from runtime or structure when possible.

This redundancy has several costs:

- more DOM noise
- duplicated truth
- harder refactors
- risk of stale data
- AI and tooling confusion

### Problem 4: overlays are embedded in scene trees

In the project export, the delete target is inside the project view.

That means the scene tree contains elements that are not Atomes and not part of canonical project content.

This breaks the mental model.

### Problem 5: text projection is heavier than it should be

Media hosts are already relatively close to a good pattern:

- host
- renderer child
- canvas or media surface

Text projection is heavier because it keeps too much visual styling inline and exposes binding markers that are implementation detail, not core representation.

### Problem 6: example files amplify complexity

The exported examples are useful for debugging, but they are not a clean pedagogical representation of Atome.

They overstate complexity because they contain whole-scene and whole-app data together.

## What is not the problem

Several things may look heavy but are not conceptually wrong.

### Dynamic geometry inline styles

Inline values like:

- `left`
- `top`
- `width`
- `height`
- sometimes `z-index`

are acceptable as long as they remain strictly layout-related and are not used as business truth.

The repository tests and rendering code already assume that geometry may remain inline.

### Optional renderer children

A host may need one or more internal children when rendering actually requires them.

Examples:

- media canvas
- svg root
- text container
- audio host

This is not inherently bad.

It only becomes bad when wrappers are added automatically without a clear rendering responsibility.

### Generic visual classes

Classes such as:

- `eve-atome`
- `eve-media-atome`
- `eve-shape-atome`
- `eve-svg-atome`
- `is-selected`

are useful if they stay generic and visual.

The tests in `tests/eve/atome_dom_projection_contract.test.mjs` already validate this direction.

## Canonical design principles for the target solution

The target DOM should follow these principles.

### Principle 1: one canonical host per Atome

Each Atome must have exactly one primary DOM host.

That host is the only canonical DOM anchor for runtime lookup.

Secondary representations may exist, but they must not act as competing truths.

### Principle 2: DOM identity must remain derived

The canonical runtime id remains raw and immutable.

The DOM host id is derived and namespaced.

The DOM should not duplicate the runtime id in multiple attribute forms.

### Principle 3: business truth must stay outside DOM

The DOM must not carry the canonical values for:

- project identity
- project title
- slot mapping
- selected state as business truth
- media source identity
- renderer identity as business truth
- group internal runtime state

These belong in runtime registries, state stores, and replayable events.

### Principle 4: classes should describe visual category, not internal truth

A class is good when it helps styling.

A class is bad when it encodes runtime-specific truth that should stay in memory.

Good examples:

- `eve-atome`
- `eve-media-atome`
- `eve-text-atome`
- `is-selected`

Bad examples:

- classes encoding project id
- classes encoding renderer name
- classes encoding internal tool binding status
- classes encoding runtime layer names as truth

### Principle 5: renderer children must be explicit and justified

Every child node under an Atome host must have a rendering job.

Examples of valid responsibilities:

- text content node
- media canvas node
- svg root node
- waveform surface

Wrappers without a rendering responsibility should be removed.

### Principle 6: matrix and scene must be different abstractions

A matrix tile is not an Atome.

A project view is not an Atome.

An Atome host inside a project view is not a matrix tile.

These distinctions must become explicit in DOM structure and naming.

## Proposed target representation

### 1. Standard Atome

Target shape:

```html
<div id="eve-atome_<atome-id>" class="eve-atome"></div>
```

Allowed additions:

- generic family class such as `eve-text-atome`, `eve-media-atome`, `eve-shape-atome`
- dynamic geometry inline styles
- `is-selected` as a pure visual class

No runtime business metadata should be required on the element.

### 2. Media Atome

Target shape:

```html
<div id="eve-atome_<atome-id>" class="eve-atome eve-media-atome" style="left: ...; top: ...; width: ...; height: ...;">
  <canvas class="eve-media-canvas"></canvas>
</div>
```

If a wrapper is required, it must have a specific rendering reason:

```html
<div id="eve-atome_<atome-id>" class="eve-atome eve-media-atome" style="left: ...; top: ...; width: ...; height: ...;">
  <div class="eve-media-host">
    <canvas class="eve-media-canvas"></canvas>
  </div>
</div>
```

The wrapper must not exist only because an earlier implementation needed a placeholder.

### 3. Shape or SVG Atome

Target shape:

```html
<div id="eve-atome_<atome-id>" class="eve-atome eve-shape-atome eve-svg-atome" style="left: ...; top: ...; width: ...; height: ...;">
  <svg class="eve-atome-shape-svg"></svg>
</div>
```

The host remains minimal.
The renderer child is the SVG root.

### 4. Text Atome

Target shape:

```html
<div id="eve-atome_<atome-id>" class="eve-atome eve-text-atome" style="left: ...; top: ...; width: ...; height: ...;">
  <div class="eve-atome-text">Hello</div>
</div>
```

The inner text node is legitimate.

The goal is not to remove it.

The goal is to remove unnecessary inline visual decoration and any implementation markers that are not required for rendering.

### 5. Matrix tile representing a project

This should not be represented as an Atome host.

Target shape:

```html
<button id="eve-project-tile_<project-id>" class="eve-project-tile is-current">
  <div class="eve-project-tile__preview"></div>
  <div class="eve-project-tile__label">untitled</div>
</button>
```

Why:

- it is a navigation object
- it belongs to the matrix UI
- it is not the canonical scene object
- it should use project runtime state, not Atome semantics

Its slot mapping should live in matrix runtime state, not in DOM attributes.

### 6. Project view

Target shape:

```html
<div id="project_view_<project-id>" class="eve-project-view">
  <div id="eve-atome_<id>" class="eve-atome ..."></div>
  <div id="eve-atome_<id>" class="eve-atome ..."></div>
</div>
```

The project view should only be a scene container.

Transient overlays should not be mounted inside it unless they are truly scene-local rendering objects.

### 7. Application shell

At the body level, the app should expose a few explicit roots:

```html
<body>
  <div id="view"></div>
  <div id="matrix_layer"></div>
  <div id="system_overlay_layer"></div>
  <div id="panel_layer"></div>
  <div id="menu_layer"></div>
</body>
```

This is not mandatory in that exact naming, but the separation is mandatory in spirit.

## Proposed responsibility split

### Atome host

Responsibilities:

- canonical DOM anchor for one Atome
- geometry projection
- generic visual category classes
- optional selection class
- parent for renderer children

Must not own:

- duplicated business metadata
- matrix slot identity
- project navigation state
- tool infrastructure state

### Renderer child

Responsibilities:

- draw the Atome visual content
- contain renderer-specific child DOM only if needed

Must not own:

- canonical identity
- global scene semantics

### Matrix tile

Responsibilities:

- represent a project in navigation
- show preview and label
- accept tile interaction

Must not pretend to be an Atome host.

### Project view

Responsibilities:

- contain scene Atomes for one project
- provide scene scrolling and scene-local presentation

Must not be polluted by unrelated system overlays.

### System overlay layer

Responsibilities:

- transient targets
- drag affordances
- contextual interaction helpers
- temporary feedback elements

Must remain external to canonical scene content.

## Why this solution is better

### Better semantic clarity

Each node type corresponds to one concept.

An AI, a developer, or a tool can quickly distinguish:

- project navigation
- project scene container
- scene objects
- system overlays

### Better runtime integrity

The runtime remains the only source of truth.

This matches the architecture already described in the repository.

### Better performance profile

The benefits are not only theoretical.

Reducing DOM redundancy lowers:

- attribute churn
- reconciliation complexity
- query complexity
- accidental dependencies on stale DOM metadata

It also makes selective rerendering easier.

### Better export quality

A debug export can isolate exactly what is being studied:

- matrix projection
- project scene projection
- panel projection
- full app shell when needed

This makes audits, tests, and AI assistance more accurate.

### Better testability

The repository already contains DOM projection tests.

This solution aligns with them instead of fighting them.

## Why this solution can still be challenged

This solution is intentionally strict. It should be challenged on real edge cases.

### Challenge 1: multi-representation Atomes

If one Atome is visible simultaneously in several places, what is the canonical host?

Required answer:

- exactly one primary host carries canonical DOM identity
- secondary views use secondary identifiers or explicit projection descriptors

### Challenge 2: groups and imported media structures

Some group wrappers may currently be doing more than visual layout.

Before removing them, verify whether they still provide:

- crop boundary behavior
- media synchronization surface
- import placeholder semantics
- interaction or composition hooks

The rule is not “remove all wrappers”.

The rule is “every wrapper must justify its existence”.

### Challenge 3: text editing lifecycle

Text Atomes may need an inner element for:

- editable content
- selection isolation
- text metrics
- line wrapping behavior

That is acceptable.

The challenge is to keep only what editing actually needs.

### Challenge 4: local overlay ownership

Some overlays may be logically local to a project scene.

If so, they may remain close to the project view, but they should still be clearly separated from canonical Atome content.

For example, a dedicated child overlay layer can be acceptable:

```html
<div id="project_view_<id>" class="eve-project-view">
  <div class="eve-project-scene"></div>
  <div class="eve-project-overlay-layer"></div>
</div>
```

That is still better than embedding transient targets directly among Atome hosts.

### Challenge 5: geometry versus layout system

Keeping geometry inline is pragmatic, but it also preserves a direct coupling between runtime and style attributes.

This is acceptable for now if the framework still depends on it.

It should still be challenged later if a stronger layout abstraction is introduced.

## What should not be changed blindly

Several parts of the current projection should not be removed without proof.

### Do not remove renderer children blindly

If a child node is the actual rendering surface, keep it.

### Do not remove geometry inline styles blindly

The current runtime and tests rely on them.

### Do not assume that all placeholder layers are useless

Some may still act as legitimate render composition boundaries.

### Do not make matrix tiles into Atomes

This would preserve the current semantic confusion.

### Do not use DOM attributes as fallback truth

If the runtime registry is incomplete, fix the registry.
Do not reintroduce metadata into DOM as a convenience workaround.

## Recommended migration path

### Phase 1: define contracts explicitly

Create and enforce three separate DOM contracts:

- Atome host contract
- Project tile contract
- Project view contract

### Phase 2: stop class overload

Remove the use of `eve-matrix-tile` for actual Atome scene hosts.

Introduce distinct classes for:

- project tiles
- Atome hosts

### Phase 3: move project tile truth out of DOM

Remove redundant project metadata from matrix tile attributes and keep it in matrix runtime state.

### Phase 4: isolate overlays

Move delete targets, drag affordances, and similar helpers to dedicated overlay layers.

### Phase 5: simplify renderer subtrees

Audit each extra wrapper under Atome hosts.

For each wrapper, ask:

- does it render?
- does it clip?
- does it isolate input?
- does it host a renderer?
- does it carry composition semantics?

If the answer is no, remove it.

### Phase 6: improve exports

Produce separate clean exports for:

- matrix only
- project view only
- Atome-only subtree samples
- full app shell when needed

This will prevent future confusion.

## Acceptance criteria for the target solution

The solution can be considered successful when the following statements are true.

### Atome identity

- each Atome has one canonical DOM host
- the host id is derived from the runtime id
- no duplicated identity attributes are required

### DOM cleanliness

- no business metadata is needed in DOM attributes for normal operation
- classes remain generic and visual
- dynamic geometry is the main allowed inline styling category

### Semantic separation

- matrix tiles are not Atome hosts
- project views are not Atomes
- overlays are not mixed with canonical scene content

### Renderer discipline

- renderer wrappers exist only when they have a real rendering role
- text, media, and svg use the smallest subtree that preserves behavior

### Tooling and AI readability

- a new AI can identify what is Atome, what is project navigation, and what is system infrastructure without reverse-engineering implementation details

## Final position

The correct simplification is not to reduce Atome features.

The correct simplification is to reduce projection ambiguity.

The framework already contains the right architectural direction:

- canonical runtime identity
- registry-first truth
- minimal DOM projection
- generic visual classes
- business metadata outside DOM

The current exports look too complex because they mix multiple layers and because one visual vocabulary is reused for incompatible concepts.

The best target model is therefore:

- one minimal canonical host per Atome
- one optional renderer child when justified
- matrix tiles separated from Atomes
- project views separated from overlays
- system infrastructure separated from canonical scene content

This preserves all capabilities while making the DOM much easier to understand, optimize, test, and challenge.
