# GPS host capacity inspection — 2026-10-14

Outcome: SSH access verified; production deployment capacity not qualified.
The operator-supplied IP destination accepts the Mac's existing SSH credentials
with `BatchMode=yes` and `StrictHostKeyChecking=yes`. No host-key store,
packages, server configuration, data or services were changed.

## Observed resources

Read-only inspection at 2026-10-14 16:57 UTC, using `inspect_host.sh` and a
second OS/storage/service inventory through the same SSH destination:

| Resource | Observation |
| --- | --- |
| OS / service manager | Debian 13.7 (trixie), x86_64; Linux 6.14.11-4-pve; systemd reports `running`, no failed units listed |
| CPU | Intel Atom N2800 at 1.86 GHz; 2 physical cores, 2 threads per core, 4 logical CPUs |
| RAM | 3,887 MiB total, 2,950 MiB available at inspection; no swap |
| Root and `/srv` | Same ext4 filesystem: 1,921,719,488 KiB total, 1,805,600,600 KiB available (about 1.68 TiB); 2% used |
| Disk | One 1.8 TiB block device; kernel reports `ROTA=1`. Storage performance was not benchmarked |
| Inodes | 1% used on the shared filesystem |
| Load | 1/5/15 minute averages 0.36 / 0.08 / 0.03; short `vmstat` sample 98–100% CPU idle, no I/O wait |
| Existing services | nginx, PostgreSQL 17, Redis, squirrel and Proxmox Backup services are already running |
| Intended GPS ports | No TCP listeners observed on 8002, 8003 or 8004 |
| Virtualization | `systemd-detect-virt` reports `none`; the probed cgroup-v2 limit files were not present/readable. Neither result establishes contractual hardware guarantees |

This is a short idle-period observation, not a peak-load, import, disk throughput
or provider-serving benchmark. Available RAM and disk are shared with existing
production and backup activity. Apparent filesystem space does not prove backup
retention, provider quotas or future storage cost.

## Deployment decision

Do not install or import the combined mainland-France Valhalla, Nominatim and
raster stack on the strength of this inspection. Memory headroom and the
rotational storage flag prevent qualifying it alongside existing production
without a measured resource budget. This is a deployment assessment, not a
claim that every individual service is technically impossible on this machine.

[Switch2OSM's hardware guidance](https://switch2osm.org/serving-tiles/) gives
approximately 4 GB RAM for a city-sized raster service alone, with greater
requirements depending on coverage and traffic. [Nominatim 5.3.2 installation
guidance](https://nominatim.org/release-docs/latest/admin/Installation/) states a
2 GB installation minimum and emphasizes fast storage. Neither number is a
measured France budget or an allowance for the other services. Planet-scale
recommendations must not be treated as France measurements.

The [Debian 13 tile recipe](https://switch2osm.org/serving-tiles/manually-building-a-tile-server-debian-13/)
matches the observed OS; it has not been executed or validated on this existing
server. No upstream version set or installation unit is accepted for production
yet. The original separate loopback service contracts remain unchanged.

## To verify before deployment

1. Identify existing infrastructure with enough memory and suitable storage,
   including the production/backup reserve; do not infer spare physical memory
   from the Proxmox kernel or change host allocation/configuration.
2. Establish the hosting contract's disk, backup and egress allowances. SSH
   inspection cannot certify that imports and operation incur no additional cost.
3. On an authorized isolated target, pin upstream versions and measure the
   France import peak RAM, temporary disk, final datasets, update work and
   concurrent routing/search/cold-tile latency. Preserve the approved coverage;
   a city-only installation would not meet it.
4. Only after capacity and billing qualification, proceed with the separately
   authorized installation and production activation procedure in [README](README.md).

No new subscription, download, import, installation, restart, production change
or Git write was performed during this inspection.
