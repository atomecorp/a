# System UI Component SSOT Cleanup

Status: in progress
Priority: high

## Audit summary

- The architecture documentation expects canonical Squirrel UI components for Button, Slider, Input, and Console.
- The Atome Squirrel registry currently exposes Button, Slider, and Console in atome/src/squirrel/spark.js, but no canonical Input component is registered there.
- Atome has canonical component builders for button and slider in atome/src/squirrel/components, but there is no matching input builder in the same registry layer.
- eVe/elements/design.js currently defines createEveButton, createEveInput, createEveToggle, and createEveSlider as a parallel component layer instead of consuming one canonical Atome/Squirrel owner.
- Several runtime surfaces still instantiate system controls locally with document.createElement or surface-local builders, which creates duplicated interaction and visual contracts.

## Evidence to reconcile

- Canonical registry: atome/src/squirrel/spark.js
- Canonical component directory: atome/src/squirrel/components/
- Parallel eVe factories: eVe/elements/design.js
- Local projected tool button and slider implementation: eVe/intuition/projection/button.js
- Local flower buttons: eVe/intuition/flower/menu.js
- Canonical tool slider owner: atome/src/squirrel/components/tool_slider_builder.js
- Product wrapper for tool slider runtime: eVe/intuition/shared/slider_tool_content.js
- Local toolbox slider implementation: eVe/intuition/tools/ui/tool_button_factory.js
- Additional direct system button or input creation remains in multiple runtime modules, including calendar, detail, layer, color, finder, user, molecule, track, and shared runtime surfaces.

## Slider source of truth to preserve

- The canonical product-tool slider behavior is now owned by atome/src/squirrel/components/tool_slider_builder.js and consumed through the eVe shared wrapper/runtime surfaces.
- This slider is not a plain always-visible range input.
- The canonical behavior is: compact square tool at rest, expand on pointer down or touch down, manipulate while expanded, collapse again on pointer up or pointer cancel unless the interaction is explicitly pinned by the current model.
- Any future Atome/Squirrel canonical slider promotion must preserve this exact tool behavior and geometry contract.

## Goal

Make Atome/Squirrel the single source of truth for all system UI controls and reduce eVe to composition over canonical controls.

## Required tasks

- Define the canonical ownership boundary for Button, Slider, Input, Toggle, Select, and equivalent system controls.
- Add the missing canonical Input component to the Atome/Squirrel registry, or explicitly realign the architecture documents if a different owner is intended. Silent divergence is forbidden.
- Refactor eVe/elements/design.js so that eVe helpers compose canonical Atome/Squirrel controls instead of re-owning the component contract.
- Replace surface-local button, slider, and input implementations in projection, flower, ribbon, footer, toolbox, and panel runtimes with canonical controls or thin canonical wrappers.
- Preserve the current expanding square product-tool slider behavior as the non-negotiable slider source of truth while centralizing ownership.
- Eliminate direct document.createElement usage for product system controls wherever a canonical control exists.
- Centralize visual tokens, interaction semantics, focus behavior, accessibility attributes, and gesture behavior for system controls in one owning layer.
- Add focused tests proving that canonical controls are reused across the main UI surfaces.
- Keep the strict distinction explicit: `Slider` is the generic content slider builder, while `ToolSlider` is the canonical product-tool slider owner. Revisit unification only if both contracts can be preserved without reintroducing parallel sources of truth.

## Acceptance criteria

- Button, Slider, Input, Toggle, Select, and equivalent system controls have one owning implementation surface.
- Atome/Squirrel exposes the canonical system control registry expected by the architecture.
- eVe wrappers only compose or configure canonical controls and do not redefine control semantics.
- Slider controls keep the current compact-square to expanded-slider behavior from the Intuition ribbon/projection runtime instead of regressing to a plain persistent range input.
- Projection, flower, footer, ribbon, toolbox, panel, and dialog controls reuse the same canonical interaction and design contract.
- No new product system UI control is introduced through ad-hoc DOM creation or a feature-local factory.
- The shared product-tool slider runtime is owned in Atome/Squirrel, while eVe slider modules are reduced to composition, token injection, or compatibility re-exports only.
