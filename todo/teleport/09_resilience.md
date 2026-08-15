# Téléportation — Lot 9 : résilience

État : **fait pour la logique** (2026-08-15).

## Ce qui existait déjà (lots 2 et 7)

- ACK obligatoire, timeout, rollback : un objet n'est jamais retiré avant confirmation.
- Perte de surface → offres en vol annulées, objets hébergés passés `DISCONNECTED`.
- Sessions de contrôle distant tuées avec leur surface.
- Heartbeat de surface toutes les 30 s.

## Ce qui manquait et a été ajouté

**Le retour d'une surface.** `buildReconnectTeleportPatch` existait depuis le lot 2 mais
n'était appelé par personne : une surface qui revenait laissait ses objets bloqués en
`DISCONNECTED` pour toujours.

- `handleTeleportSurfaceReconnect` dans `wsTeleportOperations.js`.
- Appelé depuis `surface/announce` — au moment de l'annonce, pas dans un balayage de
  fond, pour que l'objet soit joignable dès que la surface a fini de s'annoncer.
- La réponse d'annonce porte `restored_atome_ids`, donc le client sait ce qui est revenu.

Au passage, la recherche des atomes hébergés par une surface a été factorisée
(`atomesHostedBySurface`) : perte et retour lisaient la même chose de deux façons.

## Les comportements que la probe fixe

| Situation | Comportement exigé |
| --- | --- |
| destination perdue | `DISCONNECTED`, **jamais rapatrié d'office** — l'utilisateur décide |
| destination revenue | `REMOTE` restauré, même objet, même identité (§13) |
| « laisser » + coupure réseau | revient en `PERSISTED_REMOTE`, l'intention n'est pas révoquée |
| ré-annonce sans rien à restaurer | no-op, aucun événement parasite dans l'historique |
| objet injoignable | « rapatrier » fonctionne quand même — le chemin de secours du §16 |
| offre en vol quand la cible meurt | rollback, l'objet n'est jamais parti |

## Vérification

`temp/teleport_resilience_probe.mjs` — 7 sections, cycle complet
téléportation → perte → reconnexion → restauration, avec de vrais sockets recréés (une
reconnexion est un **nouveau** socket réutilisant l'identifiant persisté, pas le même
objet réanimé).

Les quatorze probes des lots 1 à 9 passent ensemble.

## Reste à faire

- **Journal d'audit des transitions.** Les transitions passent par `events`, donc elles
  sont tracées, mais il n'existe pas de vue d'audit dédiée aux sessions de téléportation
  et de contrôle.
- **Reprise de session de contrôle distant** après reconnexion : les sessions meurent
  avec la surface et doivent être redemandées. C'est délibéré (une délégation d'entrée
  ne doit pas ressusciter toute seule), mais à challenger côté UX.
- **Vérification en application réelle** : non faite.
