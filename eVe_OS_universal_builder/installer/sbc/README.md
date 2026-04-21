# Installeur SBC (Raspberry Pi, Pine64, etc.)

Pour les SBC, **aucun installeur natif n'est nécessaire** : l'image brute produite par le builder (`atome-desktop-arm64-*.img.xz`) est directement flashable avec les outils standards.

## Pour l'utilisateur final

1. Télécharger `atome-<profil>-arm64-<version>.img.xz` depuis les releases
2. Flasher avec l'un des outils suivants :
   - **Raspberry Pi Imager** (multi-plateforme, recommandé)
   - **Balena Etcher** (Windows/macOS/Linux)
   - `dd` en ligne de commande :
     ```sh
     xz -d atome-desktop-arm64-15.0-RELEASE-20260421.img.xz
     sudo dd if=atome-desktop-arm64-15.0-RELEASE-20260421.img \
             of=/dev/sdX bs=4M status=progress conv=fsync
     sudo sync
     ```
3. Insérer la SD/USB dans le SBC et booter.

## SBC supportés

| SBC              | Statut       | Notes                                   |
|------------------|--------------|------------------------------------------|
| Raspberry Pi 4   | ✅ supporté   | DTB inclus (`dts/rpi4.dts`)              |
| Raspberry Pi 5   | ✅ supporté   | DTB inclus (`dts/rpi5.dts`)              |
| Pine64 RockPro64 | ✅ supporté   | Bootloader U-Boot fourni                 |
| Generic ARM64    | ⚠️ UEFI req.  | Nécessite firmware UEFI (EDK2)           |
| BeagleBone Black | 🧪 legacy    | Port historique, héritage `u-boot-beaglebone` |

## Premier boot SBC

- Le SBC doit avoir une alimentation stable (5 V 3 A minimum pour Pi)
- HDMI branché **avant** le démarrage (certains SBC n'activent pas HDMI à chaud)
- Clavier USB pour la configuration wifi initiale si pas d'ethernet
- À partir du deuxième boot, AtomeOS mémorise la config réseau

## Dépannage

### L'écran reste noir
- Vérifier que `atome_logo.bmp` est bien présent (splash affiché = loader OK)
- Sinon → brancher un clavier et appuyer sur `Esc` pendant le boot pour interrompre le loader silencieux

### Pas de son sur Pi
- Le profil `desktop` active la sortie jack 3.5 mm par défaut ; pour HDMI audio :
  ```
  sudo sysrc hw_snd_default_unit=1   # à adapter selon sortie détectée
  ```

### Pas de réseau wifi
- Éditer `/etc/wpa_supplicant.conf` au premier boot (clavier connecté)
- Ou préconfigurer avant flash en montant la partition FAT ESP et en déposant un `wpa_supplicant.conf`

## Construction des images SBC

Depuis le builder :

```sh
sudo ./core/build.sh --arch arm64 --profile desktop
```

La sortie `output/atome-desktop-arm64-*.img.xz` est l'image prête à flasher.
