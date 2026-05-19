# Auto-update — mécanisme

L'image embarque un service d'auto-update qui suit le principe **"latest partout, tout le temps"** sans jamais requérir d'action utilisateur.

## Ce qui est mis à jour

1. **Système FreeBSD** via `pkg upgrade` (tous les paquets du repo `latest`)
2. **Framework Atome** via `git pull` sur le dépôt `atomecorp/a`
3. **Dépendances du framework** (npm, bundle, cargo) si les lockfiles changent
4. **Runtimes** (Node, Ruby, Rust) sont mis à jour par `pkg upgrade`

## Quand ça tourne

- **Au boot** : 30 secondes après démarrage (service `atome_updater` rc.d)
- **Périodiquement** : cron toutes les 6 heures avec jitter aléatoire 0-30 min
- **Jamais en premier plan** : l'utilisateur ne voit rien, pas de prompt

## Log

Tout est tracé dans `/var/log/atome_updater.log` :

```
[2026-04-21T12:00:03] === atome_updater start ===
[2026-04-21T12:00:04] pkg update
[2026-04-21T12:00:12] pkg upgrade
[2026-04-21T12:02:47] Framework: git fetch
[2026-04-21T12:02:49] Update disponible : abc123 -> def456
[2026-04-21T12:02:51] Réinstallation deps npm
[2026-04-21T12:03:34] Restart service atome
[2026-04-21T12:03:35] Update appliqué : def456
[2026-04-21T12:03:35] === atome_updater end ===
```

## Rollback

Avant chaque `git reset --hard origin/HEAD`, l'updater pose un tag local :

```
atome-backup-202604211200
```

Pour revenir en arrière manuellement (en mode rescue ou via ssh) :

```sh
su - atome
cd ~/atome
git log --tags --oneline | head
git reset --hard atome-backup-202604211200
npm ci
sudo service atome restart
```

## Désactiver l'auto-update

### À la construction de l'image

```sh
sudo ./core/build.sh --arch amd64 --profile desktop --no-auto-update
```

### Sur une image déjà installée

```sh
sudo sysrc atome_updater_enable="NO"
sudo crontab -l | grep -v atome_updater | sudo crontab -
```

## Propagation "instantanée" (cahier des charges)

Le cahier des charges mentionne "propagation rapide des nouvelles versions". L'intervalle cron de 6h est un compromis raisonnable. Pour du temps quasi-réel (ex : push du serveur central) on peut :

1. Ajouter un endpoint long-poll côté serveur central (`https://sync.atome.one`)
2. Faire écouter par `atome_updater.sh` en mode daemon
3. Déclencher la mise à jour dès qu'un nouveau HEAD est signalé

Cette partie n'est **pas implémentée dans le builder actuel** : c'est une évolution future côté framework + serveur central.

## Sécurité

- Toutes les requêtes passent par TLS (`ca_root_nss` est dans l'image)
- Signature des commits git à venir (vérif GPG côté updater)
- Aucun secret embarqué dans l'image (clés API éventuelles récupérées dynamiquement côté serveur)

## Conflits locaux

Si l'utilisateur (en profil dev) a modifié le framework localement, `git reset --hard` perdrait ses changements. Le profil `dev` doit donc :

- Soit désactiver l'updater (`--no-auto-update`)
- Soit travailler sur une branche différente de `main` (l'updater ne pull que sur la branche configurée dans `config.yml`)
