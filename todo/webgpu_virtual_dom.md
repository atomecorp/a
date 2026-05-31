# WebGPU Virtual DOM Diagnostic

## Executive Conclusion

Atome and eVe already provide a canonical hierarchical object model and a disposable rendering projection for the active canvas route. This is close to a virtual scene system, but it is not yet a full tree-shaped virtual DOM implementation on the rendering side.

The canonical model is hierarchical through parent-child relationships and system group roots. The active WebGPU path keeps canonical Atome state outside the DOM, derives render-only atoms, builds a render scene, and draws that scene into one shared canvas per active rendering zone.

## What Is Confirmed

1. The Atome model is hierarchical.
   Objects can contain children and form a nested tree structure.

2. Hierarchy is part of the canonical storage contract.
   The model uses parent_id as the canonical hierarchy field.

3. eVe uses explicit system roots and canonical parent mounting.
   Project visuals are described through a canonical hierarchy under view and project_view_<project_id>.

4. The active rendering route is projection-based, not DOM-based.
   Canonical state stays outside the DOM, is normalized into render-only data, then drawn through a bounded WebGPU canvas surface.

5. The runtime already behaves like a virtual render pipeline.
   The flow is:

   canonical Atome records
   -> normalized render atoms
   -> render scene
   -> shared WebGPU compositor
   -> one visible canvas per rendering zone

6. Interaction is scene-driven.
   Selection, hit testing, drag, resize, and text editing intents are resolved at the canvas surface level rather than through one DOM node per Atome.

## What Is Not Fully True Yet

1. The current render scene is not a full hierarchical virtual DOM.
   The active scene implementation is currently a filtered and z-index-sorted atom list with by-id lookup, not a render tree with explicit parent-child render nodes.

2. Parent-child semantics exist canonically, but they are not yet expressed as a first-class hierarchical render graph in the active WebGPU scene builder.

3. Group support exists at the model and system-root level, but the renderer still appears to flatten visible atoms for composition order.

## Accessibility Conclusion

Accessibility is possible in this architecture, but not as an automatic property of the canvas itself.

The current design explicitly allows a hidden text bridge for:

- bounded editing
- accessibility
- IME
- copy/paste
- measurement
- system interaction

This means the architecture is compatible with accessibility, but full accessible behavior requires a semantic bridge layer parallel to the canvas renderer. A raw canvas scene alone is not sufficient.

## Final Verdict

The correct conclusion is:

Atome and eVe already provide the foundations of a hierarchical, declarative, virtual-scene-like rendering architecture for WebGPU canvas rendering.

However, the current active implementation should be described as:

- a canonical hierarchical object model,
- a disposable render projection,
- a scene-based canvas renderer,
- and an accessibility-capable architecture through dedicated bridge services,

but not yet as a complete hierarchical virtual DOM renderer in the strict sense.

## Recommended Wording

Recommended wording for future technical communication:

"Atome/eVe uses a canonical hierarchical object model projected into a disposable WebGPU render scene. The active canvas renderer is virtual-scene-like and DOM-independent, but the current implementation is still flatter than a strict hierarchical virtual DOM. Accessibility is supported through dedicated bridge services rather than through the canvas surface alone."
