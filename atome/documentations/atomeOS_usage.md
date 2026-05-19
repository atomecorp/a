# Atome OS usage

Atome OS is the FreeBSD image builder for running Atome/eVe as a bootable kiosk-style operating system. It is platform packaging infrastructure, not part of the Atome runtime API.

## Location

```text
platforms/atomeOS/builder/
```

The builder owns its scripts, profiles, package manifests, overlays, installers, and local technical docs as one coherent platform target.

## Purpose

The builder creates bootable FreeBSD images that start the Atome/eVe environment directly, with a silent boot and fullscreen webview.

Supported targets are:

- `amd64` for desktop, laptop, and VM.
- `arm64` for Apple Silicon VMs and SBC-style targets.

## Main commands

Run commands from:

```sh
cd platforms/atomeOS/builder
```

Preflight:

```sh
sudo ./scripts/preflight.sh
```

Desktop image:

```sh
sudo ./core/build.sh --arch amd64 --profile desktop
```

Minimal image:

```sh
sudo ./core/build.sh --arch arm64 --profile minimal
```

Development image:

```sh
sudo ./core/build.sh --arch amd64 --profile dev
```

Audio profile:

```sh
sudo ./core/build.sh --arch amd64 --profile audio
```

The output image is produced under:

```text
platforms/atomeOS/builder/output/
```

## Internal structure

- `core/`: build orchestrator and shared shell libraries.
- `scripts/`: build pipeline steps.
- `profiles/`: image profiles such as `minimal`, `desktop`, `dev`, and `audio`.
- `packages/`: package stacks installed into the image.
- `overlays/`: files injected into the FreeBSD image.
- `installer/`: notes and plans for desktop and SBC install flows.
- `docs/`: detailed builder documentation.

## Placement rule

Keep Atome OS under `platforms/atomeOS/`.

Do not move it into `atome/`, because it is not runtime code. Do not flatten it into root `scripts/`, because the scripts depend on colocated profiles, package manifests, overlays, and local docs.
