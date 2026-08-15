# Téléportation — Lot 8 : permissions inter-utilisateurs

État : **fait pour la logique** (2026-08-15). Débloque les refus posés volontairement
aux lots 2 et 7.

## Écart assumé par rapport au plan

Le plan prévoyait de porter les capacités dans le JSON `conditions` de la table
`permissions`. **Je ne l'ai pas fait**, pour deux raisons vérifiées dans le code :

1. `conditions` appartient au moteur Conditions
   (`atome/src/squirrel/conditions/permission_adapter.js` possède le schéma versionné,
   et `setPermission` normalise toute valeur à travers lui). Y écrire des capacités
   serait un détournement, et serait normalisé/écarté.
2. `permissions` est **portée par atome**. Une autorisation inter-utilisateurs porte sur
   un **siège d'appareil**, pas sur un objet.

D'où une table dédiée `surface_grants`, ajoutée par l'owner de migrations existant.

## Ce qui a été livré

- `database/adole_schema_migrations.js` — table `surface_grants`
  (`pending` / `granted` / `denied` / `revoked`) + deux index.
- `server/surfaceGrants.js` (nouveau) — vocabulaire des capacités, cycle de vie des
  autorisations, et `hasSurfaceCapability`, **le seul point de contrôle** des actions
  inter-comptes.
- `server/wsSurfaceGrantOperations.js` (nouveau) — famille `surface-grant` :
  `request`, `accept`, `deny`, `revoke`, `list` ; notifications
  `surface-grant-request` / `-granted` / `-denied` / `-revoked`.
- `wsTeleportOperations.js` et `wsRemoteControlOperations.js` — les refus en dur
  `*_cross_user_not_authorized` sont remplacés par de vraies vérifications de capacité.

## Les sept capacités (§11.3), réellement séparées

`teleport_receive`, `teleport_display`, `teleport_manipulate`, `teleport_persist`,
`teleport_return`, `remote_pointer`, `remote_surface`.

La règle que tout cela protège : **« accepter un objet » ne doit jamais valoir « donner
le contrôle de la machine »**. La probe le vérifie explicitement — après avoir accordé
`teleport_receive` + `teleport_display`, la prise de contrôle du pointeur reste refusée.

Autres propriétés tenues :

- **seul le propriétaire décide** — ni le demandeur, ni un tiers ;
- **le propriétaire peut accorder moins que demandé**, jamais plus ;
- **la révocation coupe immédiatement**, et les deux parties sont notifiées ;
- **un refus est enregistré**, pas oublié : il ne peut pas être re-décidé ;
- **la demande n'est pas une autorisation** — tant qu'elle est `pending`, tout reste
  refusé ;
- la surface visée doit réellement appartenir au propriétaire sollicité.

`owner_id` de l'objet n'est jamais touché : §23 (propriété ≠ localisation ≠ contrôle)
tient par construction.

## Bug trouvé par la probe

`hasSurfaceCapability` ne lisait que **la dernière** autorisation
(`ORDER BY decided_at DESC LIMIT 1`). Avec `datetime('now')` à la seconde, deux
autorisations décidées dans la même seconde se masquaient l'une l'autre — donc accorder
« pointeur » **annulait silencieusement** « recevoir un objet ».

C'est exactement ce que §11.3 interdit : les capacités doivent coexister. Corrigé —
toute autorisation vivante est prise en compte, pas seulement la plus récente.

## Vérification

`temp/teleport_surface_grants_probe.mjs` — 11 sections, le flux complet du §11.2
(demande → notification → décision → action → révocation) avec trois comptes, plus les
refus : auto-attribution, décision par un tiers, élargissement au-delà de la demande,
double décision, surface inexistante, non-authentifié.

Les treize probes des lots 1 à 8 passent ensemble.

## Reste à faire

- **UI de demande/acceptation.** Les notifications sont émises ; rien ne les peint
  encore. Le pipeline existant (`notificationStack.js`, `addNotification`) est le
  raccordement naturel — non fait.
- **Purge des autorisations expirées** : `expires_at` est respecté à la lecture, mais
  aucune tâche ne nettoie les lignes.
- **Vérification en application réelle** : non faite.
