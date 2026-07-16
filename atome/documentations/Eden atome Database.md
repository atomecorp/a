Atome Specification – Sync API + Database Schema (English Version)

Status: Spécification conceptuelle

This proposal is not the current database schema or supported runtime API. The canonical
maintained contracts live in `database/schema.sql`,
`atome/documentations/atome_structur_to_respect.md`, the active persistence
documentation and the architecture maps.

References to temporal branches describe a future capability only. Historical branching
must not be implemented or exposed before explicit validation of
`todo/ai_voice/time_machine_historical_branching.md`. The examples below must not be
used to infer that branch tables or APIs currently exist.

1. Validation of the API Syntax (client → server)

Proposed syntax:

atome_create({
  id: 'a12365',
  type: 'project',
  kind: 'project',
  properties: {
    name: 'my_prj',
    date: Date.now()
  }
})

atome_create({
  id: 'a65465',
  type: 'shape',
  kind: 'shape',
  parent: 'a12365',
  properties: {
    color: 'red',
    date: Date.now()
  }
})

atome_update({
  id: 'a65465',
  properties: {
    color: 'blue',
    date: Date.now()
  }
})

Rationale
 • Unified API for creation and update.
 • Fully declarative and compatible with Squirrel/ADOLE.
 • Allows complete reconstruction of the UI object:

$('div', {
  parent: '#view',
  id: 'demo-title',
  type: 'project',
  css: {...},
  text: 'Demo project'
})

 • type is the canonical schema identifier; kind is optional but validated (or derived).
 • renderer (UI) will remain separate.

⸻

Atome Database Schema – Flexible, Granular, Extensible

Designed for:
 • dynamic user attributes
 • per-project / per-atom / per-particle permissions
 • complete time-travel on every particle
 • Squirrel/ADOLE object reconstruction

⸻

1. TABLE objects (universal object)
 • id (PK)
 • type (canonical type, e.g. project, user, shape...)
 • kind (optional, validated)
 • renderer (optional UI hint)
 • created_at
 • created_by_id
 • updated_at

All entities share this base.

⸻

2. TABLE users
 • id (PK, FK → objects.id)
 • login
 • password_hash
 • email
 • status
 • last_login_at

All profile data → particles.

⸻

3. TABLE projects
 • id (PK, FK → objects.id)
 • owner_id
 • slug
 • default_state (json)

Everything else → particles.

⸻

4. TABLE atomes
 • id (PK, FK → objects.id)
 • project_id
 • parent_id
 • type (shape, sound, video, text…)

Visual/logical attributes → particles.

⸻

5. TABLE properties (current particle state)
 • id (PK)
 • object_id
 • key (“color”, “position.x”, “css.backgroundColor”, …)
 • value_type
 • value_json
 • updated_at
 • updated_by_id

Flat storage enables fine ACL and time-travel.

⸻

6. TABLE property_versions (timeline per particle)
 • id
 • property_id
 • object_id
 • key
 • version_index
 • value_json
 • valid_from
 • valid_to
 • created_at
 • created_by_id
 • meta

Past is never modified.
After the branch model is validated and implemented, a future system may create a new
temporal branch. The currently valid restoration operation brings a past value into the
present by appending a new event/version without modifying past history.

⸻

7. TABLE permissions (granular ACL)
 • id
 • object_id
 • property_key (nullable)
 • user_id
 • can_read
 • can_write
 • can_share
 • created_at
 • created_by_id
 • expires_at
 • meta

Examples:
 • read-only project access
 • change only color of an atom
 • see an atom’s position but not edit it
 • visibility restricted atom-by-atom

⸻

8. Optional: groups & group_members

groups
 • id
 • name
 • created_at

group_members
 • group_id
 • user_id

Used to assign ACL to groups.

⸻

9. Separation of renderer (UI) and kind/type (logic)

In Atome/Squirrel:
 • type = canonical schema (shape.rect, tool, code, user…)
 • kind = optional logical category (project, user, atom, sound…)
 • renderer = UI renderer (dom, text, image, webgl-quad…)
 • tags = classification metadata (e.g. "rock", "solo", "draft")

Why this separation is required:
 • Some objects are not visual (project, user).
 • The renderer must be interchangeable (DOM, WebGL, Tauri Native, FreeBSD UI).
 • The server must not know anything about rendering.
 • ACL apply to logical particles, not rendering properties.
 • eVe OS rendering does not rely on the DOM.

This separation is a structural requirement, not an option.

⸻

10. Validated Technical Points
 • Coherent API: Atome.create / update / delete
 • Strict separation renderer (UI) / kind/type (logic)
 • Particles flattened in DB and reconstructed client-side
 • Flexible schema with particle-level versioning
 • Granular ACL per object or particle

⸻

11. Summary

This architecture allows:
 • ultra-fine collaboration
 • precise ACL
 • full time-travel without altering history
 • future temporal branching after explicit model validation and implementation
 • declarative reconstruction into Squirrel/ADOLE
 • OS-level abstraction (DOM-independent rendering)

The database and API design directly support Atome’s core philosophy:
everything is an object; every detail is a particle; every particle has a timeline.
