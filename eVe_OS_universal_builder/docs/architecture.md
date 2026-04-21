# Architecture du builder universel

## Vue d'ensemble

Le builder est une pipeline **déclarative** : toutes les décisions sont dans des fichiers YAML, le code shell se contente d'appliquer ce que décrivent `config.yml`, les profils et les packages.

```
┌─────────────────────────────────────────────────────────┐
│                  core/build.sh                          │
│  (orchestrateur : lit config, résout versions, pipeline)│
└───────┬─────────────────────────────────────────────────┘
        │
        ├──► preflight.sh          (vérifs host)
        ├──► fetch_base_image.sh   (download FreeBSD)
        ├──► mount_image.sh        (chroot setup)
        ├──► install_packages.sh   (pkg install selon profil)
        ├──► install_runtime.sh    (clone + build framework `a`)
        ├──► configure_boot.sh     (silent boot + splash)
        ├──► configure_ui.sh       (cage + webview)
        ├──► configure_audio.sh    (si profil audio)
        ├──► configure_network.sh  (DHCP + TLS + auto-update)
        └──► finalize_image.sh     (cleanup + compress + checksum)
```

## Les 4 couches conceptuelles

### 1. Couche matérielle (`architectures` dans `config.yml`)
- Sélectionne l'image de base FreeBSD (amd64 ou arm64)
- Définit le bootloader (UEFI) et le layout de partition
- Sur ARM, gère les device trees (`dts/`)

### 2. Couche système (`overlays/boot` + `overlays/services`)
- `loader.conf` : boot silencieux, splash BMP
- `rc.conf` : services minimaux
- Getty désactivés sur consoles virtuelles (pas de tty visible)
- Service `atome_updater` cron toutes les 6h

### 3. Couche runtime (`packages/*.yml` + `install_runtime.sh`)
- Stacks : base, js, ruby, rust, native, webview, audio, network
- Résolution dynamique "latest" :
  - FreeBSD RELEASE courant depuis download.freebsd.org
  - Node LTS depuis nodejs.org/dist/
  - Ruby 3.x depuis pkg FreeBSD
  - Rust stable depuis rustup
- Framework Atome cloné depuis `atomecorp/a` avec audit des deps
- **Blocklist wavesurfer** appliquée automatiquement

### 4. Couche applicative (`overlays/ui` + `runtime` dans `config.yml`)
- Service rc.d `atome` qui lance sous l'user `atome`
- `start_atome.sh` → démarre Fastify/Tauri backend → attend qu'il réponde → lance `cage` + `cog` (webview plein écran)
- Watchdog : relance automatique en cas de crash

## Pourquoi ce découpage ?

1. **Ajouter une stack** = un seul fichier `packages/<nom>.yml`, aucun script à modifier
2. **Changer un profil** = éditer un seul YAML, pas toucher le code
3. **Supporter un SBC** = ajouter un DTB dans `dts/` + variante dans `config.yml` (section `sbc_targets`)
4. **Mettre à jour une dépendance** = rien à faire côté builder (tout est en `latest`)

## Flux des versions "latest"

```
build.sh --arch amd64 --profile desktop
   │
   ├─► versions.sh::resolve_freebsd_latest()
   │       └─► GET download.freebsd.org/releases/amd64/amd64/
   │               └─► parse HTML, sort -V, tail -1  →  "15.0-RELEASE"
   │
   ├─► versions.sh::resolve_node_lts()
   │       └─► GET nodejs.org/dist/index.json
   │               └─► premier "lts":"..." != false  →  "22.15.0"
   │
   └─► install_packages.sh écrit /usr/local/etc/pkg/repos/FreeBSD.conf
           avec url: "pkg+http://pkg.FreeBSD.org/${ABI}/latest"
               └─► pkg install tire toujours la dernière version du repo
```

## Points de débat / décisions prises

| Sujet                     | Choix                          | Raison                                    |
|---------------------------|--------------------------------|-------------------------------------------|
| Compositor                | `cage` (Wayland kiosk)         | Simple, pas de WM, plein écran natif      |
| Webview                   | `cog` (WebKit2GTK)             | Léger, pas d'Electron, compatible Tauri   |
| Backend par défaut        | Fastify sur 3001               | Ce que le framework `a` lance             |
| Audio                     | OSS + JACK                     | OSS natif stable, JACK pour basse latence |
| PipeWire                  | Désactivé                      | Support FreeBSD encore irrégulier         |
| Ruby                      | Inclus                         | Demandé explicitement (profil legacy)     |
| wavesurfer.js             | Blocklist                      | Abandonné côté Squirrel                   |
| Versions                  | Toutes en "latest"             | Demandé explicitement                     |
| Auto-update               | cron 6h + jitter               | Évite tempêtes de requêtes sync           |
| Firewall                  | PF — entrant fermé             | Posture kiosk                             |
