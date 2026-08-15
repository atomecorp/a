# Conditions

Status: dynamic transverse core implemented; focused validation complete on 2026-08-14. Physical HealthKit acceptance remains to verify.

## Ownership

`atome/src/squirrel/conditions/` is the only product-neutral Conditions owner.
It contains the versioned contract, extensible property/operator registry,
three-state evaluator, dynamic property discovery, safe computed-property AST,
dependency-aware queries, static/dynamic lists, persisted sets and bindings,
live providers (time, presence, session, location and health), and the adapter
used by ADOLE permission conditions.

`eVe/intuition/runtime/bevy_panel/bevy_panel_conditions.js` and
`bevy_panel_conditions_runtime.js` plus its projection-only
`bevy_panel_conditions_view.js` are the only eVe Conditions UI owner. The
component is a compact BevyUI accordion and holds no authoritative product
state. Finder, Contacts, Communication and Calendar configure and consume this
component; they do not implement local condition evaluators.

## Versioned schema

```js
const conditionSet = {
    schemaVersion: 1,
    id: 'nearby_available_contacts',
    name: 'Nearby and available',
    revision: 1,
    root: {
        combinator: 'and',
        children: [
            { source: 'contact', field: 'status', operator: 'eq', value: 'available' },
            { source: 'location', field: 'distance', operator: 'lt', value: 10, unit: 'km' }
        ]
    }
};
```

Groups support `and`, `or`, and unary `not`. Leaf nodes identify a registered
`source`, `field`, and `operator`. Unknown properties, operators, malformed
nodes, unavailable values, and evaluator errors produce `unknown`; they never
silently produce `true`.

The domain selects the unknown-value policy:

- search, contacts and communication: `exclude`;
- calendar and automation: `wait`;
- sharing, profile visibility, ACL and realtime: `deny`.

## Property discovery and computed criteria

`properties.discover({ scope, search })` combines registered Atome schemas,
readable particles present on candidates, nested paths up to three relations,
custom contact fields, computed criteria and registered live sources. A new
readable property becomes selectable without a Conditions code change. ACL is
applied before a remote catalogue or result projection is returned; a private,
missing, revoked or stale property evaluates to `UNKNOWN` and is never exposed.

`computedProperties.save/list/remove(...)` persists
`condition_computed_property` Atomes. Expressions are serialized AST only and
accept arithmetic, min/max, absolute value, rounding, length, text case,
coalescence, date differences and geographical distance. Unsupported
operations are rejected; missing data, invalid types, cycles and division by
zero produce `UNKNOWN`.

## Public runtime API

The bootstrap exposes the same frozen service through
`window.atome.conditions` and `window.Squirrel.conditions`:

```js
const properties = await window.atome.conditions.properties.discover({
    scope: { candidateSource: 'atome' },
    search: 'width'
});

const snapshot = await window.atome.conditions.query.once({
    conditionSet,
    scope: { candidateSource: 'atome' },
    sort: { field: 'properties.name', direction: 'asc' },
    projection: ['name', 'type']
});

const watcher = await window.atome.conditions.query.watch({
    conditionSet,
    scope: { candidateSource: 'atome' }
}, ({ addedIds, removedIds, updatedIds, revision }) => updateProjection());
watcher.unsubscribe();
```

The full API includes `sources.register/list`,
`computedProperties.save/list/remove`, `query.once/watch`,
`lists.create/get/list/resolve/watch/freeze/remove`, `sets.*`, `bindings.*`,
and the lower-level `validate/evaluate/match/filter/watch` compatibility surface.
Browser queries without supplied candidates use the WebSocket server authority.
The server filters ACL before evaluation and returns only the requested allowed
projection, never the private values used by its evaluation.

## Persistence and reuse

Condition sets, computed properties and lists are canonical Atomes of type
`condition_set`, `condition_computed_property` and `condition_list`; uses are
Atomes of type `condition_binding`. All persist only through the injected
canonical `Atome.commit` adapter.

- `sets.get/list/save/duplicate/remove`;
- `computedProperties.save/list/remove`;
- `lists.create/get/list/resolve/watch/freeze/remove`;
- `bindings.attach/detach/list/load/evaluate`.

A static list persists its member identifiers, including an unavailable marker
for a later-deleted identifier. A dynamic list persists only its ConditionSet
reference and scope, recalculates on resolution, and observes dependencies only
while consumed by an open UI, share or automation. Updating its ConditionSet
restarts the active query from the latest revision.

Bindings record the exact set revision. Changing a set used by a security
domain requires explicit reauthorization, and evaluation fails closed if the
binding revision or authorized revision is stale. Removing a referenced set is
rejected.

## MCP

The MCP surface includes discovery, one-shot query, computed-property, list,
set, binding and evaluation operations. Reads require `conditions.read`; mutations require
`conditions.write`, confirmation, proposal-mode policy, and the normal MCP
audit/idempotency path. MCP does not create a second evaluator or persistence
route.

## Permission and realtime security

ADOLE migrates legacy permission conditions to schema version 1 and evaluates
them with the shared engine. Unsupported or malformed conditions are rejected
on grant creation or denied on use. Authorization receives explicit actor,
Atome, operation and property context.

Canonical event commits authorize every touched property inside the same
database transaction. A mixed allowed/denied patch is rejected atomically.
State, event history and realtime payloads are projected independently for
each recipient and property; empty projections are suppressed and revocations
are re-evaluated before delivery.

Conditions remain criteria only. Action execution stays in the existing
command/action pipeline, and realtime transport remains owned by the existing
sync runtime.

## Current integrations

- Finder: text and generic Conditions combine; candidate changes produce live
  result deltas.
- Contacts: every readable profile particle, custom field, relation, computed
  criterion and live source is dynamically discoverable.
- Communication and Share: a dynamic target is resolved into a stable recipient
  snapshot only when Send is explicitly activated; Conditions never sends.
- Calendar and alarms: persisted event conditions; unknown automation context
  waits instead of firing and an active automation retains its subscription.
- Permissions and realtime: server-authoritative property-scoped evaluation and
  recipient projection.

Profile/Info conditional visibility is intentionally not exposed yet: a local
profile rule would be cosmetic security because the public directory has no
server-authoritative target/group binding for that rule. It must be connected
to a canonical server ACL target before UI exposure.

## Validation boundary

Focused engine, discovery, formulas, lists, live providers, ACL, realtime
projection and UI integration tests are permanent under `tests/`. The focused
2026-08-14 repair run passes 14/14 targeted Node tests and 10/10 integration
tests. The synthetic
10,000-record gate completes in about 30 ms, below the existing one-second
limit; this is not a production load benchmark. One hundred irrelevant
mutations cause zero reevaluations and one hundred subscribe/unsubscribe cycles
leave zero active subscriptions. Because the measured 10,000-candidate path is
already below its gate, no speculative derived index or second state authority
was added. Future time boundaries schedule their exact next deadline without
polling; presence and session reuse online/offline and canonical auth events.
The HealthKit bridge compiles for iOS Simulator, but simulator build
does not prove permission or sensor behavior on a physical device. The visible
anonymous desktop pointer path passes through Communication, opening Conditions,
immediate first-row creation, direct property typing, selection from the
dynamically discovered autocomplete and direct value typing. The selector
renders property names only: no module catalogue, source prefix or category
heading. `+ Ajouter` stays visible beside the group selector; each new row
starts with an operator supported by its discovered property. The Conditions UI has no secondary computed-criterion editor;
computed properties created through the canonical API remain discoverable as
ordinary properties. The mobile path for this latest repair, authenticated result deltas
and physical HealthKit remain to verify. The tests also do not prove the complete property-granularity
matrix. In particular, property-local delete/restore/undo,
same-property revision conflicts, search/export leakage, and every reconnect
queue scenario remain separate required work in
`todo/2- Granularity_Validation.md`.
