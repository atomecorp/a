# Mix/Timeline of a Molecule shows the project

## Symptom

Choosing Activity > Mix or Timeline on a selected Molecule shows the project's
mixer/timeline instead of the Molecule's.

## Confirmed cause

`eVe/intuition/tools/molecule/runtime_activity.js#setMoleculeTimelineActivity`
switched the view mode without entering the Molecule level.

## Durable correction

When the activity names a group other than the project, it enters it through
`requestProjectViewNavigation({ operation: 'enter' })` first (unless already
there), then sets the mode.

## Regression checks

- Acceptance « Mix controls » / Timeline checks (`molecule_ui_timeline_acceptance.mjs`).
