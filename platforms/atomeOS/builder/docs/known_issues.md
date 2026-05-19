# Problèmes connus et zones à valider

Cette liste reprend les "points critiques à valider" du cahier des charges et ajoute ce que l'audit du framework a révélé. Ce sont les chantiers à suivre en priorité.

## Compatibilité

### Webview FreeBSD
- **État** : WebKit2GTK4 fonctionne sur FreeBSD via le port `webkit2-gtk4`
- **Risque** : la version du port peut traîner derrière upstream → vérifier à chaque release
- **Plan B** : Tauri 2 embarque sa propre webview ; si WebKit pose problème, lancer directement le bundle Tauri

### Support GPU
- **Intel** : OK (pilotes `drm-kmod` dans les ports)
- **AMD** : OK (`drm-kmod` récent)
- **NVIDIA** : nécessite le pilote propriétaire, non testé dans ce builder
- **Raspberry Pi** : VideoCore OK avec le DTB approprié ; vc4 DRM activé par défaut

### Wayland stable
- `cage` + `wlroots` : stables sur amd64
- Sur ARM, certains SBC ont des bugs GL (contourner en forçant `WLR_RENDERER=pixman`)

### ARM complet
- RPi 4/5 : validés
- Pine64 : validé
- Apple Silicon via VM (UTM/Parallels) : non testé, la VM doit exposer UEFI

### JACK / audio basse latence
- OSS + JACK : stable sur amd64
- Sur certains chipsets USB (notamment USB 3.0 Alpine Ridge) : bugs latence ponctuels → tester cas par cas

### Interfaces audio USB multicanal
- Testé OK : Focusrite Scarlett (2i2, 4i4, 18i20), RME Babyface
- Risqué : interfaces class-compliant non-UAC1 (MOTU récents), à tester

### Runtime Atome + pile audio
- Le DSP core du framework (`atome/engines/audio/core/`) doit être recompilé côté runtime si l'architecture cible diffère de celle de construction
- **Pas géré actuellement** : l'image amd64 contient les binaires compilés pour amd64 ; l'image arm64 doit être construite sur ARM ou via qemu-user-static

### Synchronisation offline/online
- **Pas implémenté** côté builder ; c'est une responsabilité du framework et du serveur central
- Le builder installe seulement le runtime et les outils réseau

### Stabilité auto-update
- Intervalle 6h + jitter = pas de tempête
- **Risque** : un update qui casse le build côté framework → le service `atome` se relancera en boucle
- **Mitigation à ajouter** : détecter les crashes en boucle et rollback automatique sur le tag `atome-backup-*`

### Sécurité réseau
- TLS OK via `ca_root_nss`
- **À renforcer** : pinning certificat du serveur central, signature GPG des commits framework

## Limites connues du builder actuel

### Cross-build depuis Linux
- Fonctionne pour la partie pkg install via qemu-user-static + binfmt_misc
- **Instable** : certains packages FreeBSD plantent en cross (ports qui assument FreeBSD host)
- **Recommandation** : builder l'image sur un host FreeBSD quand c'est possible

### Détection version FreeBSD
- `resolve_freebsd_latest()` parse du HTML → fragile si le listing change de format
- **Mitigation** : option `--freebsd-version 15.0-RELEASE` pour pinner

### Blocklist WaveSurfer
- La dépendance a été retirée du framework courant.
- La blocklist reste utile pour neutraliser d'anciens clones ou branches qui embarqueraient encore `wavesurfer.js`.

### Profile `dev` trop permissif
- Clone en éditable, autostart off, watchdog off
- Sur une machine réellement publique (kiosk), utiliser `desktop` ou `minimal`, pas `dev`

### PF firewall entrant fermé
- Bloque SSH par défaut
- **Workaround** : décommenter la règle dans `overlays/network/pf.conf` avant build

### Pas d'UI de configuration au premier boot
- L'utilisateur atterrit directement sur la webview Atome
- Si le wifi n'est pas configuré avant flash → pas de réseau, pas d'auto-update
- **À ajouter** : un "onboarding" Atome-side au premier boot pour le wifi

## Roadmap suggérée

1. Tester le build end-to-end sur un host FreeBSD réel (amd64 d'abord)
2. Ajouter la signature GPG + checksums releases
3. Implémenter l'installeur Tauri (`installer/desktop/`)
4. Ajouter la détection rollback automatique dans `atome_updater.sh`
5. Écrire un onboarding wifi/langue au premier boot côté framework
6. Valider la pile audio sur 2-3 interfaces USB référence
7. Ajouter les tests CI GitHub Actions (au moins `shellcheck` + lint YAML)
