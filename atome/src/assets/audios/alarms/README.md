# Alarm ringtones

Played by `atome/src/application/audio_runtime/notification_sounds.js` when a calendar
alarm rings in atome (the « Sonnerie » chosen in the event panel), each one repeated until
it is stopped. iOS plays the same sounds natively through AlarmKit when atome is not in the
foreground: the CAF copies live in `platforms/ios/atome-auv3/application/AlarmSounds`.

| File | Name in the panel | Source (BigSoundBank, CC0 public domain) |
| --- | --- | --- |
| `alarm_gentle.mp3` | Réveil doux | #2079 « Chimes Dream 1 » |
| `alarm_chime.mp3` | Carillon | #3360 « 1 pendulum chime », first 6 s |
| `alarm_birds.mp3` | Aube | #0935 « Birds waking 2 », first 10 s |
| `alarm_bells.mp3` | Cloches | #0829 « 4 church bells », first 10 s |
| `alarm_gong.mp3` | Gong | #1482 « Gong, sweet », first 8 s |
| `alarm_clock.mp3` | Réveil | #2657 « Mechanical alarm clock, ring 1 » |

All six are mono 44.1 kHz MP3 (128 kb/s), leading silence trimmed, cut with a fade-out,
peak-normalized to −1 dBFS. The iOS copies are the same cuts as IMA4 CAF.
Origin pages: `https://bigsoundbank.com/<name>-s<number>.html`.
