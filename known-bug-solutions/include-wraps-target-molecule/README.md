# Include wraps a Molecule instead of adding to it

## Symptom

Dropping an Atome on a member of a Molecule and choosing Include (the one
composition choice the rail offers) creates a new group around the target
instead of adding the Atome to the Molecule.

## Confirmed cause

`tool_runtime_molecule_combine.js#combineCanonicalMolecule` reused the target
Molecule only without a `choice`; any choice (`front`) composed a new one.

## Durable correction

`front` on a canonical Molecule target inserts the source into it, under the
Molecule's own playback rule (`targetRule.mode`). A plain Atome target still
composes a new Molecule.

## Regression checks

- Acceptance, layered scenario: texts, image and second audio join the existing
  Molecule (`assertMembership`).
