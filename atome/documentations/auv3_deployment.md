# AUv3 Deployment Script (local device, development)

`auv3.sh` builds a **Debug** AUv3 and installs it on a connected device so you
can test it in a host app. It is not a distribution path: it does not archive,
does not sign for distribution, does not notarize, and does not upload
anything.

For release paths, see instead:

- **iOS app + AUv3 → TestFlight**: `scripts/XCode_testflight_generator`,
  documented in
  [`platforms/ios/atome-auv3/README.md`](../../platforms/ios/atome-auv3/README.md).
- **macOS desktop (Tauri)**: [desktop_tauri_distribution.md](desktop_tauri_distribution.md).

## Usage

```bash
# Compile + Deploy + Launch AUM
./auv3.sh

# Just compile (fast)
./auv3.sh --build-only

# Deploy + Launch specific app
./auv3.sh --app GarageBand
./auv3.sh --app NanoStudio
```

## What it does

1. **Compiles** the AUv3 project
2. **Installs** the companion app on your iPad
3. **Launches** a music app (AUM by default)

## Requirements

- iPad connected via USB
- Xcode command line tools
- Valid Apple Developer certificate

## Supported Apps

- AUM
- GarageBand  
- NanoStudio
- Cubasis
- BeatMaker
- Auria

## After Installation

1. Open your music app (AUM, GarageBand, etc.)
2. Add the **"atome"** AUv3 plugin
3. Use the web interface with C4, A4, E5, Chord buttons
4. Toggle **Local/AUv3 Mode** switch

## Troubleshooting

If the app doesn't appear on iPad:
- Go to **Settings > General > Device Management**
- Trust your Apple Developer certificate
- Restart iPad

✨ **Ready to make music!**
