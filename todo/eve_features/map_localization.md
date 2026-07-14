# Map And Location Search Migration Audit

Status: Active research and migration backlog. No product implementation may proceed until the provider and platform contract are approved.

## Current implementation to retire

`eVe/intuition/tools/map.js` is a browser-only DOM/Leaflet implementation. It creates DOM nodes, relies on global `window.L`, renders OpenStreetMap raster tiles in Leaflet, queries Nominatim directly from the client, stores view state in `mapState`, and binds browser resize/input events.

This route is incompatible with the final product UI contract and must be deleted after a Bevy replacement passes validation. It is not a fallback or a permanent exception.

The current 250 ms debounced query is an address-search autocomplete pattern. The public Nominatim policy forbids client-side autocomplete and requires rate limiting, identifiable requests, attribution, and caching. The standard OpenStreetMap tile service is best-effort and policy-bound, not an application SLA. Therefore neither public endpoint may be retained as an uncontrolled product runtime dependency.

The current tool does not request device location: it only geocodes text entered in the Finder. Device geolocation, reverse geocoding, saved places, and user consent are separate unimplemented capabilities.

## Required research decisions

1. Select one approved map-data provider and one geocoding provider, including licensing, attribution, quota, privacy, offline policy, cache policy, cost, and availability on Web, Tauri, and iOS.
2. Decide whether map tiles/vector data are fetched by the canonical backend, packaged for offline use, or both. Do not let each UI runtime make uncontrolled provider requests.
3. Define the canonical location schema: human label, normalized address, latitude, longitude, precision, provider/place identifier, timezone when relevant, consent/provenance, and update timestamp.
4. Define permission and consent policy for device location, including denial, revocation, approximate location, and no-location states as typed outcomes rather than fallback UI paths.
5. Verify native presentation and networking constraints in Tauri and iOS before selecting the provider.

## Migration tasks

- Expose geocoding, reverse geocoding, location permission, and saved-location operations through the canonical API/MCP/Command Bus with policy checks and audit records.
- Keep query/result/selection state as bounded UI runtime data; persist only user-approved canonical locations through the mutation pipeline.
- Implement map scene, markers, results, search field, attribution, keyboard/touch/pointer navigation, and accessibility through Bevy plus the hidden text service where needed.
- Bound texture/tile cache memory and release GPU resources, listeners, requests, and subscriptions on close.
- Add deterministic test fixtures for provider responses and target-runtime probes for Web, Tauri, and iOS.
- Delete Leaflet globals, DOM factories, direct client Nominatim calls, DOM resize observers, and browser-only map state after migration validation.

## Acceptance criteria

- One documented provider/ownership contract covers all targets.
- No visible Leaflet or DOM map remains.
- No canonical location data is owned by the renderer or DOM.
- Attribution, privacy, consent, offline behavior, and typed error states are compliant and tested.
- Map open/close leaves no retained browser or GPU resources.
