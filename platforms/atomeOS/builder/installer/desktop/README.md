# Installeur Desktop (Windows / macOS)

Objectif : permettre à un utilisateur final d'installer Atome OS sur sa machine en **un clic**, à la manière d'un installeur Windows ou macOS standard.

## Architecture cible

```
Utilisateur télécharge Atome OS-Installer-<os>.{exe,dmg}
         │
         ▼
Interface graphique simple :
  - Avertissement "ceci va effacer le disque X"
  - Choix du disque cible
  - Bouton [Installer]
         │
         ▼
Étapes automatiques :
  1. Download image FreeBSD Atome OS depuis releases/
  2. Vérification SHA256 + signature
  3. Flash du disque (dd-equivalent natif OS)
  4. Installation bootloader UEFI
  5. Reboot
         │
         ▼
Premier boot : Atome OS directement, logo Atome puis webview.
```

## Stack technique recommandée

- **Tauri 2** (cohérent avec le framework `a`), qui compile en :
  - `.exe` + NSIS installer pour Windows
  - `.dmg` + `.app` pour macOS
  - `.AppImage` pour Linux (bonus)
- Backend Rust pour :
  - Télécharger l'image (avec barre de progression)
  - Vérifier checksum + signature
  - Écrire sur le disque (nécessite élévation : UAC / sudo)
  - Écrire le bootloader

## Composants à produire

```
installer/desktop/
├── platforms/desktop-tauri/               # application Tauri
│   ├── src/
│   │   ├── main.rs
│   │   └── installer/       # logique flash + bootloader
│   └── Cargo.toml
├── src/                     # UI (Squirrel DSL, cohérent avec atome)
│   ├── index.html
│   └── app.js
├── scripts/
│   ├── build-win.sh         # produit .exe
│   ├── build-mac.sh         # produit .dmg notarisé
│   └── sign-release.sh      # signature + upload GitHub Releases
└── README.md                # ce fichier
```

## Écriture disque — détails OS

### Windows
- API : `DeviceIoControl` + `CreateFile(\\.\PhysicalDriveN)`
- Élévation requise via manifeste UAC
- Bootloader : l'image FreeBSD contient déjà un EFI system partition → rien à configurer

### macOS
- `diskutil unmountDisk /dev/diskN`
- `dd if=image.img of=/dev/rdiskN bs=1m`
- Authentification via `osascript -e 'do shell script ... with administrator privileges'`
- Signature + notarisation obligatoire pour éviter GateKeeper

### Linux (bonus)
- `pkexec dd if=image.img of=/dev/sdX bs=4M status=progress`

## Sécurité

- Signature de l'image (clé Atome) vérifiée avant flash
- Dialogue de confirmation explicite avec nom du disque et taille
- Impossibilité de flasher le disque système courant (détection automatique)
- Écriture atomique : si l'opération échoue, l'installeur ne laisse pas le disque dans un état bootable partiel

## Flux utilisateur (< 5 clics)

1. Ouvrir `Atome OS-Installer.exe`
2. Choisir le disque
3. Cocher "Je comprends que ce disque sera effacé"
4. Cliquer [Installer]
5. Attendre + reboot

## Statut

**À implémenter.** Ce dossier contient actuellement uniquement la spec. L'implémentation Tauri est la suivante étape recommandée après validation du builder.
