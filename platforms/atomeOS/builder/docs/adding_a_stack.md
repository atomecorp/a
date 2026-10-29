# Extend the existing recipe

Add a cohesive `packages/<stack>.yml` with `stack.name` and `stack.pkg`.
Connect it through `core/config.yml` module stacks or an existing profile's stacks.
No per-target orchestrator, application runtime or package installer is added.

Add a target in `core/config.yml` only after identifying its official base image,
architecture/boot chain and output formats. The common `baseImage` owner handles
image selection; extend it for an evidenced new upstream naming/boot requirement.
Keep model/peripheral qualification in the existing matrix, marked untested until
proved. An option or package declaration is not a validated capability.

Run `node --test tests/governance/aos_builder.test.mjs` from the framework root,
inspect all-target plans, then perform native/VM/physical acceptance for the new
scope and the previously validated targets. Keep dependencies out of the control
host unless separately authorized. No new dependency is needed for YAML parsing:
the framework already declares `yaml`.
