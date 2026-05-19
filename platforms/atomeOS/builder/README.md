# Atome OS / eVe — Builder

Builder modulaire et déclaratif pour produire des images bootables **FreeBSD >= 15** capables de démarrer directement l'environnement **Atome / eVe (Squirrel)** sans logs visibles, avec webview plein écran.

## Cibles supportées

- `amd64` (desktop, laptop, VM) — boot UEFI
- `arm64` (Apple Silicon via VM, Raspberry Pi, Pine64, SBC génériques) — boot UEFI

## Dépôts sources

- Builder : ce dépôt, branche `universal`
- Framework Atome (source de vérité pour les dépendances) : https://github.com/atomecorp/a
- Ancien builder (référence historique) : https://github.com/atomecorp/atomic_builder

## Philosophie

1. **Déclaratif** — toute la config passe par YAML (`core/config.yml`, `packages/*.yml`, `profiles/*.yml`)
2. **Latest by default** — aucune version figée ; FreeBSD = RELEASE courant, pkg install depuis `latest`, Node = LTS courant, Ruby = 3.x courant, Rust = stable
3. **Modulaire** — ajouter une stack = ajouter un `packages/<stack>.yml` et l'activer dans un profil
4. **Silencieux** — boot sans logs, splash immédiat, webview fullscreen

## Démarrage rapide

```sh
# Vérifier l'environnement (FreeBSD host recommandé, Linux possible via qemu-user-static)
sudo ./scripts/preflight.sh

# Builder une image desktop amd64 (par défaut)
sudo ./core/build.sh --arch amd64 --profile desktop

# Builder une image ARM minimale
sudo ./core/build.sh --arch arm64 --profile minimal

# Builder une image dev complète (Node + Ruby + Rust + toolchains natives)
sudo ./core/build.sh --arch amd64 --profile dev

# Builder un profil audio basse-latence
sudo ./core/build.sh --arch amd64 --profile audio
```

L'image finale est produite dans `./output/atome-<profile>-<arch>-<date>.img`.

## Arborescence

```
platforms/atomeOS/builder/
├── README.md
├── Makefile                    # raccourcis make amd64 / make arm64 / make dev ...
├── core/
│   ├── build.sh                # orchestrateur principal
│   ├── config.yml              # config globale (arch, mirrors, versions, stacks)
│   └── lib/                    # fonctions shell partagées
├── profiles/
│   ├── minimal.yml             # runtime Atome seul
│   ├── desktop.yml             # drivers GPU, réseau, UI
│   ├── dev.yml                 # desktop + toolchains complètes
│   └── audio.yml               # desktop + JACK + tuning basse latence
├── packages/
│   ├── base.yml                # paquets systèmes fondamentaux
│   ├── js.yml                  # Node LTS + npm/pnpm/yarn
│   ├── ruby.yml                # Ruby 3.x + bundler
│   ├── rust.yml                # Rust stable + cargo
│   ├── native.yml              # clang, cmake, ninja, pkgconf
│   ├── webview.yml             # webkit + wayland + compositor
│   ├── audio.yml               # JACK, ports audio
│   └── network.yml             # TLS, outils réseau, auto-update
├── overlays/
│   ├── boot/                   # loader.conf, rc.conf, splash
│   ├── ui/                     # service autostart webview
│   ├── services/               # atome.service, watchdog, auto-update
│   ├── network/                # DHCP, DNS, TLS trust store
│   └── audio/                  # config JACK, tuning temps réel
├── scripts/
│   ├── preflight.sh            # vérifs host (qemu-user, root, espace disque)
│   ├── fetch_base_image.sh     # télécharge l'image FreeBSD officielle
│   ├── mount_image.sh          # montage/démontage
│   ├── install_packages.sh     # pkg install depuis profiles + packages
│   ├── install_runtime.sh      # clone + install framework Atome
│   ├── configure_boot.sh       # boot silencieux + splash
│   ├── configure_ui.sh         # autostart webview
│   ├── configure_audio.sh      # tuning audio si profil audio
│   ├── configure_network.sh    # auto-update + TLS
│   └── finalize_image.sh       # compactage + checksums
├── installer/
│   ├── desktop/                # installateurs Win/macOS
│   └── sbc/                    # procédure flash SD/USB
├── dts/                        # device trees ARM (Pi, Pine64, BBB, etc.)
└── docs/
    ├── architecture.md
    ├── adding_a_stack.md
    ├── audio_lowlatency.md
    ├── auto_update.md
    └── known_issues.md
```

## Exclusions explicites

- **WaveSurfer** : la dépendance `wavesurfer.js` est **abandonnée** côté Squirrel. Elle reste en blocklist dans le builder pour neutraliser d'anciens clones ou branches qui la contiendraient encore.

## Source de vérité des dépendances

Le builder **audite dynamiquement** le dépôt framework Atome avant installation. Il lit :

- `package.json` → dépendances JS
- `Gemfile` (si présent) → gems Ruby
- `Cargo.toml` / `src-tauri/Cargo.toml` → crates Rust
- `CMakeLists.txt` → deps natives C++

Voir `scripts/install_runtime.sh` fonction `audit_framework_deps`.

## Licence

Apache-2.0 (alignée sur le framework Atome).
