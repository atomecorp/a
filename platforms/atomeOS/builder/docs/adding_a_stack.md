# Ajouter une nouvelle stack

Le builder est pensé pour qu'ajouter une stack technique (ex : Python, Go, Elixir, DSP spécifique) soit **une opération locale** qui ne touche aucun script.

## Étapes

### 1. Créer `packages/<nom>.yml`

Exemple : ajouter Python comme stack first-class.

```yaml
# packages/python.yml
stack:
  name: python
  pkg:
    - python3
    - py311-pip
    - py311-virtualenv
    - py311-setuptools
  pip_global:
    - "fastapi"
    - "uvicorn"
```

### 2. Déclarer la stack dans `core/config.yml`

Sous `stacks_available` :

```yaml
stacks_available:
  - base
  - js
  - ruby
  - rust
  - native
  - webview
  - audio
  - network
  - python        # ← ajouté
```

### 3. Activer la stack dans les profils concernés

Dans `profiles/dev.yml` par exemple :

```yaml
stacks:
  - base
  - js
  - ruby
  - rust
  - native
  - webview
  - audio
  - network
  - python        # ← activée pour le profil dev
```

### 4. (Optionnel) Post-install spécifique

Si la stack a besoin d'une installation globale d'outils (pip, gem, cargo, npm…), ajouter un case dans `scripts/install_packages.sh` section "Post-install spécifiques aux stacks".

```sh
case "${stack}" in
    # ...
    python)
        pips=$(awk '
            /^[[:space:]]+pip_global:/ { capture=1; next }
            capture && /^[[:space:]]+-/ {
                sub(/^[[:space:]]+-[[:space:]]*/, "")
                gsub(/"/, "")
                print
            }
            capture && /^[[:space:]]*[a-z_]+:/ && !/^[[:space:]]+-/ { capture=0 }
        ' "${BUILDER_ROOT}/packages/python.yml")
        if [ -n "${pips}" ]; then
            ${CHROOT} pip3 install ${pips}
        fi
        ;;
esac
```

### 5. Tester

```sh
sudo ./core/build.sh --arch amd64 --profile dev
```

## Cas spéciaux

### Stack avec service au boot

Si la stack doit démarrer un daemon au boot, ajouter dans `overlays/services/<nom>.rc` un script rc.d et l'activer dans un `configure_*.sh` ou directement dans `install_packages.sh` via `sysrc <name>_enable="YES"`.

### Stack avec configuration utilisateur

Placer les fichiers dans `overlays/<domaine>/` et les copier dans `${INSTALL_HOME}/.config/<stack>/` depuis le script de configuration approprié.

### Stack cross-architecture

Si une stack ne fonctionne pas sur une architecture (ex : certaines libs AVX-only), le signaler dans le YAML :

```yaml
stack:
  name: ma_stack
  arch_blocklist:
    - arm64
  pkg:
    - ...
```

Et dans `install_packages.sh`, vérifier `arch_blocklist` avant d'installer.

## Exemples de stacks potentielles

- `python` — backend data / ML
- `go` — services réseau légers
- `java` — compat appli legacy
- `dsp_extra` — libs audio supplémentaires (lv2, ladspa plugins)
- `gpu_cuda` — si besoin sur machines avec GPU Nvidia (complexe sur FreeBSD)
- `containers` — Jails / Podman-like pour sandbox
