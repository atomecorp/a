# Sensor recording format v1 (`.asr`)

Raw motion recorded on a person's own devices during an activity session (Sport training, nap, meditation).
Decided with the user on 2026-10-28:

- everything the sensors give is kept, **losslessly** (compression only, never reduction);
- the files stay on the device that recorded them: outside every system backup (iCloud, Android Auto
  Backup), private to the app, encrypted by the platform's file protection;
- nothing is shared until a reviewed anonymisation engine exists, and then only with the person's consent;
- an end-to-end encrypted copy for account recovery (key wrapped by the recovery code) is a later step.

Writers: iOS/watchOS `platforms/ios/atome-auv3/Common/SensorRecordingWriter.swift`,
Android/Wear OS `platforms/desktop-tauri/vendor/sensor-recording/android/SensorRecordingWriter.kt` (compiled into the phone plugin and the watch module).
Both must produce byte-compatible files.

## Layout (all integers little-endian)

```
"ASR1"                      4 bytes, magic
u32  header_length
u8[] header                 UTF-8 JSON, header_length bytes
block*                      until end of file
```

A block:

```
u8   kind                   1 = samples (the only kind in v1)
u8   stream                 index into header.streams
u32  count                  number of samples in the block (>= 1)
u32  payload_length
u8[] payload                raw DEFLATE (RFC 1951, no zlib/gzip wrapper)
```

The inflated payload is columnar:

```
i64[count]                  time: first = ns since header.started_at, then delta ns from the previous sample
u64[count] per axis         IEEE-754 float64 bits XOR the previous sample's bits on that axis
                            (the first sample of the block XOR 0), axes in header order
```

Every block is self-contained: a file cut by a crash loses at most its last unfinished block.
Values are stored bit-exact (float32 sensor values are widened to float64 exactly).

## Header

```json
{
  "format": "atome.sensor_recording",
  "version": 1,
  "session_id": "program_session:training:biceps_curl:…",
  "session_started_at": 1761650000000,
  "started_at": 1761650000123,
  "clock": "ns_since_started_at",
  "source": { "platform": "ios", "role": "phone", "model": "iPhone17,1", "os": "27.0", "app_version": "1.36" },
  "streams": [
    { "index": 0, "id": "accelerometer", "sensor": "accelerometer", "axes": ["x", "y", "z"], "unit": "g", "rate_hz": 100 }
  ]
}
```

- `started_at` is the writer's own wall clock (epoch ms) at the instant its sensor clock origin was taken;
  `session_started_at` is the eVe session's recorded start. Step boundaries (sets, rests, pauses) are not
  copied into the file: they are the session's own recorded transitions (`program_session_contract.js`),
  aligned on the same wall clock.
- `rate_hz` is the requested rate; `0` means event-driven (pressure). Actual times are in the samples.
- `role` is `phone` or `watch`; `platform` is `ios`, `watchos`, `android` or `wearos`.
- No account id or name is written in the file.

## Streams by platform

| Platform | Streams |
| --- | --- |
| iOS (phone) | `accelerometer` (g), `gyroscope` (rad/s), `magnetometer` (µT, raw), `device_motion` (attitude quaternion, gravity g, user acceleration g, rotation rate rad/s, calibrated field µT, field accuracy), `pressure` (kPa, relative altitude m) — 100 Hz, pressure event-driven |
| Wear OS (watch) | the same set as Android, plus `heart_rate` (count/min, event-driven) once BODY_SENSORS is granted |
| Android (phone) | every present one of: `accelerometer`, `accelerometer_uncalibrated`, `gyroscope`, `gyroscope_uncalibrated`, `magnetometer`, `magnetometer_uncalibrated`, `linear_acceleration`, `gravity`, `rotation_vector`, `game_rotation_vector` (m/s², rad/s, µT, unitless) at 200 Hz; `pressure` (hPa) event-driven |

## Storage

| Platform | Directory |
| --- | --- |
| iOS | `Application Support/atome_sensor_recordings/<sha256(account)[0..32]>/` — excluded from backup, `completeUnlessOpen` protection |
| Android | `noBackupFilesDir/atome_sensor_recordings/<sha256(account)[0..32]>/` — excluded from Auto Backup, app-private |

File name `<started_at>-<role>.asr`. A file named `disabled` in the account directory pauses recording on that
device. Commands: `health_sensors_start|stop|status|list|delete|enable` (native), `sensors.*` (MCP).

## Encrypted copy in the account vault

With the person's agreement, every closed recording also gets an end-to-end encrypted copy
(`atome/src/squirrel/health/sensor_backup.js`), so a lost device loses nothing:

- The page reads the file from the host in pieces of 256 KiB (`health_sensors_read`) and encrypts each with
  AES-GCM 256 under the account's current backup key: IV = 8 random bytes (per file) ‖ piece index (u32 BE),
  additional data `atome.sensor_backup.v1\0<file>\0<index>\0<count>`. The copy is the concatenation of the
  encrypted pieces (each 16 bytes longer), stored as `sensor_backups/<file>.e2e` through the `/ws/api` file
  operations.
- One account-global record `sensor_backups:<actor>` describes the copies, one property per file:
  `{ version: 1, file, bytes, pieces, key_id, nonce, atome_id, sent_iso }`. No sample is ever in it.
- The backup keys (`atome/src/squirrel/security/backup_keyring.js`) never reach the server in the clear: a
  device keeps them; the recovery code (version 2) wraps them for the server, which only ever receives a
  proof derived from the code; pairing hands them to the new device sealed for its own ECDH key.
- Restoring (`sensors.restore`) downloads the pieces, decrypts and writes them back through
  `health_sensors_restore`; the recording appears only once whole. Deleting a recording deletes its copy.
