# FreeBSD system recipe decision — 2026-10-29

No final production partition/update architecture has been selected. The POC
reference reuses an official supported FreeBSD 15.1 GENERIC/UFS image and its
boot components. This preserves a broad hardware baseline. It does not decide
against ZFS, NanoBSD or A/B; those need comparable native builds and measurements.

| Candidate | Current evidence | Measurements | Decision |
| --- | --- | --- | --- |
| Official FreeBSD adapted | upstream images/source identified; builder recipe tested on macOS | no native build/boot data | POC reference |
| Optimized FreeBSD | not constructed | none | assess only after baseline |
| NanoBSD | official tooling documented; not constructed here | none | compare at equal features |
| FreeBSD A/B | no target boot/rollback implementation | none | justify by recovery evidence |

Compare on the same version/machine/profile: raw/compressed size, occupied space,
minimum media, RAM, boot/first use, CPU, application response, driver/peripheral
coverage, write volume, build/maintenance cost and recovery/security properties.
Record unavailable scenarios as blocked. Do not substitute estimates for results.
Validate a major recipe/update architecture choice with the user after presenting
the actual comparative evidence. An A/B layout may require more disk space.

Sources checked: [upstream downloads](https://www.freebsd.org/where/),
[15.1 VM images](https://download.freebsd.org/releases/VM-IMAGES/15.1-RELEASE/),
[security support table](https://www.freebsd.org/security/),
[NanoBSD tooling](https://docs.freebsd.org/en/articles/nanobsd/).
At audit time 15.1 was supported through 2027-03-31; recheck before any release.
