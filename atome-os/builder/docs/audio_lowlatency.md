# Audio basse latence

Le profil `audio` est conçu pour faire d'Atome OS une base de travail pour la création musicale.

## Cible

- Latence I/O < 5 ms en usage normal, < 3 ms en tuning agressif
- Zéro xrun sur session longue (heures) avec charge CPU raisonnable
- Support USB class-compliant sans configuration
- Multi-canal jusqu'à la limite de l'interface

## Stack retenue

| Composant        | Choix                             | Alternative écartée                       |
|------------------|-----------------------------------|--------------------------------------------|
| Backend système  | OSS natif FreeBSD                 | ALSA (pas natif BSD)                       |
| Serveur          | JACK2                             | PipeWire (instable sur FreeBSD)            |
| Sample rate      | 48 kHz par défaut                 | 44.1 possible via config                   |
| Buffer           | 128 frames                        | 64 si matériel stable, 256 pour portables  |
| Compat ALSA apps | libalsa (port FreeBSD)            | —                                          |

## Tuning appliqué par `configure_audio.sh`

### Sysctl (`/etc/sysctl.conf`)
```
hw.snd.feeder_rate_quality=4       # interpolation meilleure qualité
hw.snd.default_auto=0              # pas de resample silencieux
hw.snd.maxautovchans=16
hw.snd.latency=1                   # mode basse latence OSS
kern.sched.preempt_thresh=224      # ordonnanceur plus réactif
```

### Login class `audio` (`/etc/login.conf`)
- Priorité temps réel renice négative
- `memorylocked=unlimited` (permet `mlock()` côté JACK)
- Pas de time limit CPU

### JACK (`~/.jackdrc`)
```
jackd -R -P70 -doss -r48000 -p128 -n2 -w16 -i2 -o2 /dev/dsp
```
- `-R` realtime
- `-P70` priorité 70
- `-p128 -n2` → 128 frames × 2 périodes ≈ 5.3 ms round-trip
- `-w16` word length 16 (ajuster selon interface)

## Validation

Une fois l'image installée, vérifier :

```sh
# 1. Devices détectés
cat /dev/sndstat

# 2. JACK démarre
service jackd status

# 3. Mesure de latence
jack_iodelay                  # envoie/reçoit et affiche la latence réelle

# 4. Stress test (laisser tourner 1h+)
jack_bench --duration 3600
```

## Profils audio

Trois niveaux dans `config.yml` (section `audio`) :

```yaml
# desktop standard
audio:
  enabled: true
  jack: false
  lowlatency: false

# audio standard (profil audio)
audio:
  enabled: true
  jack: true
  lowlatency: true
  buffer_frames: 128

# audio extrême (à configurer manuellement)
audio:
  enabled: true
  jack: true
  lowlatency: true
  buffer_frames: 64            # nécessite matériel très stable
  realtime_priority: 95
```

## Problèmes connus sur FreeBSD

### USB audio qui disparaît après suspend
- Solution : `devd` règle de reconnexion automatique (à ajouter dans une version future)

### Xruns sur Ryzen
- Désactiver `powerd` en session audio (`sudo service powerd stop`)
- Fixer la fréquence : `sysctl dev.cpu.0.freq=<max>`

### Interface avec plus de 8 canaux
- OSS limite par défaut à 8 vchans, override via `hw.snd.maxautovchans`
- Tester en bit-perfect avec `hw.snd.feeder_rate_quality=0` si l'interface fait le resample

### JACK qui refuse realtime
- Vérifier que l'utilisateur est bien dans la classe `audio` :
  ```sh
  pw usershow atome | grep Class
  ```
- Vérifier `cap_mkdb /etc/login.conf`

## À explorer

- **PipeWire** dès qu'il sera considéré stable sur FreeBSD (2026+) : offrirait le routage Bluetooth + la compat PulseAudio sans effort
- **sndio** comme alternative légère pour profils embarqués
- **Couche maison** (long terme) si JACK pose trop de limites pour les besoins Atome DSP
