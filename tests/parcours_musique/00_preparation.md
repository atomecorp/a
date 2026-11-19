# 00 — Préparation du banc

## Matériel et logiciels

| Plateforme | Ce qu'il faut |
| --- | --- |
| W Web | Serveur Fastify sur `http://localhost:3001` (`lsof -ti:3001 \|\| ./scripts/run_fastify.sh` ; ce script tue ce qui tient le port 3001). Chrome avec WebGPU. Micro, casque. |
| T Tauri | `scripts/run_tauri.sh --test` (serveur Axum embarqué sur `127.0.0.1:3000`). Doit fonctionner hors ligne. |
| I iOS | iPad atomic (UDID `00008027-000520902E31802E`), build Debug du schéma `atome`. Jamais l'iPhone pour les tests appareil. |
| A AUv3 | Même iPad, AUM installé. Session AUM type : un séquenceur (horloge de l'hôte) → un synthé (ex. Pro-A5) → envoi vers « Bus A » ; « Bus A » → Atome (effet AUv3) → sortie haut-parleur. |
| Ph Téléphone | Viewport 390×844 (Chrome ou Playwright), ou iPhone pour l'essai au doigt. |

Sources sonores à garder sous la main : un fichier son court (2–4 s, attaque nette), une boucle d'une mesure à 120 BPM,
une vidéo sonore courte, un fichier MIDI simple, un clavier MIDI (USB ou Bluetooth) si possible.

## Comptes et projets

- Un compte de test dédié par plateforme ; jamais le compte personnel.
- Créer pour chaque passage deux projets neufs : `QA musique <plateforme> A` (vide, pour les tests « projet neuf »)
  et `QA musique <plateforme> B` (rempli au fil des fichiers 01–08).
- À la fin : supprimer ces projets (appui long sur la tuile › Suppr.) et noter la suppression.

## Contrôles systématiques pendant chaque test

1. Console du navigateur / de la WebView : **aucune erreur** (rouge) ni avertissement nouveau.
2. Journal du serveur (Fastify, Axum ou Swift) : aucune erreur, aucun refus `canonical_event_commit_required`.
3. Rien ne clignote ni ne saute pendant la lecture (le rail ne se redessine pas à chaque tic).
4. Design : aucune bordure, outils dans les cases de la grille, bande du bas fixe (règles 11–16 d'AGENTS.md).
5. Après le test, recharger la page / relancer l'app : ce qui a été fait est toujours là (règle 21).

## Sondes automatiques à lancer avant le passage manuel

Elles ne remplacent pas le passage à la main, mais un échec ici dispense de commencer :

```bash
npm run test:molecule
```

```bash
cargo test -p atome-mix-graph
```

```bash
npm run check:rust
```

Les sondes listées dans la colonne « Sonde » de chaque fichier se lancent avec `node <chemin>` (serveur 3001 démarré).

## Noter un résultat

Par test : ✅ passé · ❌ échoué (dire ce qu'on a vu, capture ou son) · ⏭ non passé (pourquoi) · ➖ sans objet sur
cette plateforme. Modèle : [modele_passage.md](modele_passage.md).
