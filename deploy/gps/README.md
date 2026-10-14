# GPS services preparation — 2026-10-14

This directory prepares three independent local services for the existing
atome.one infrastructure. Nothing has been installed, started, published or
changed on production. `services.json` records the intended boundaries and
`server.env.example` records the already implemented server configuration.

The original hostname attempt failed strict ED25519 host-key verification.
The operator then supplied an IP destination, and read-only SSH inspection from
the Mac succeeded with existing credentials and strict verification. No trust
store was changed. [The capacity report](CAPACITY_REPORT.md) records Debian 13,
two physical Atom cores/four threads, 3,887 MiB RAM without swap and about
1.68 TiB available on a disk reported as rotational. The short sample was idle;
combined France import/serving capacity alongside production is not qualified.
Use `sh deploy/gps/inspect_host.sh HOST` with an existing verified destination
to repeat resource inspection. Measure I/O and ordinary peak production load
on an authorized target before selecting the deployment recipe. Obtain the
hosting plan's disk, backup and egress limits from its billing contract;
SSH cannot establish absence of cost.
Do not import a France database or install packages until both capacity and
billing are verified. Dataset import requires temporary space beyond final
serving data. Three services must fit together with the existing production
reserve; a single upstream's minimum does not establish that capacity.

## Service contracts

- Routing: Valhalla `/route`, automobile costing, kilometer distances, French
  maneuvers, polyline precision six, at most sixteen intermediate stops. Prepare
  a France graph and record extract timestamp, checksum and upstream version.
  Its [official build and service instructions](https://valhalla.github.io/valhalla/building/)
  own installation and graph generation. Validate the selected binary/config
  locally before creating a service-manager unit for the identified OS.
- Addresses: Nominatim `/search?format=jsonv2&countrycodes=fr&limit=8` on explicit
  submission, with a separate PostgreSQL/PostGIS index and bounded workers.
  Use the [official installation](https://nominatim.org/release-docs/latest/admin/Installation/)
  and [production deployment](https://nominatim.org/release-docs/latest/admin/Deployment-Python/)
  instructions for the selected version. Its upstream runtime is infrastructure;
  no Python application code or alternate product stack is introduced here.
- Raster: independent OSM tile rendering/storage, XYZ PNG zoom zero to nineteen.
  Select the OS-specific [Switch2OSM recipe](https://switch2osm.org/serving-tiles/)
  after inspection. Keep the routing graph and raster render database distinct.
  Test cold-tile generation latency and storage growth, including updates.

Bind each service to loopback/private networking and expose it only to Fastify.
Do not add a public production proxy, demo service, subscription or client URL.
The product requests these resources through its authenticated existing
`/ws/api` relay; native forwarding reuses the selected cloud bridge.

## Activation and acceptance

1. Record capacity, billing, selected pinned versions, France dataset timestamp,
   ODbL obligations and service health before installation. Render the existing
   `© OpenStreetMap contributors` attribution and provide access to
   [OSM copyright and license](https://www.openstreetmap.org/copyright).
2. Install independent services only in the authorized deployment task. Verify
   A→B, intermediate stops, no-route, malformed provider responses, bounded
   address results and PNG tiles through the server boundary. No positions
   should be included in infrastructure access logs or persistent diagnostics.
3. Add the three environment values to the existing Fastify deployment only
   after those checks. Restart/roll out using the existing production procedure.
   There is no activation or installation script in this integration.
4. Inspect native iOS background/locked-screen guidance, app reopen, explicit
   stop and energy consumption on a physical device. Browser guidance does not
   promise locked-screen operation. Force-quit restoration requires explicit
   start; UI teardown must not stop an active session.

Absent configuration returns `NOT_CONFIGURED`. Retained itinerary geometry can
still be opened without starting guidance. Network failure retains the previous
route and produces a typed error; recalculation is confirmation/cooldown bound.
No offline map downloads, live traffic or community API are implemented.
