# Updates and recovery

The previous automatic pkg/Git updater has been removed after caller inspection.
It followed mutable dependencies and used git reset; it was neither an image
rollback nor a safe production update channel. No replacement daemon is claimed.

Initial manual workflow: construct an explicitly identified image, verify its
manifest/archive/payload, preserve user data separately and use the shared flash
CLI on an explicitly selected external support. Reflashing erases that support,
including its data; it does not preserve `/var/db/atome` automatically.

Production update design is gated on the system comparison and target evidence:
separate data/configuration, trusted signatures/key rotation/revocation, bounded
profile-specific healthchecks, migrations compatible with recovery, disk capacity
and interruption tests. Network absence must not fail an offline profile. A/B
activation requires actual bootloader/persistent-state support and physical power
cut tests. pkg upgrade and a Git tag do not provide these guarantees.

No GitHub Release, atome.one upload, CI runner, signing key or publication has been
created. Those actions require the corresponding validated access/authorization.
