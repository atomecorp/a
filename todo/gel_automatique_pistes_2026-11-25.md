# Gel automatique des pistes — proposition complète (R-370, 2026-11-25)

Statut : proposition, rien n'est codé. Avant de coder : trois maquettes (règle 16), voir §7.

## 1. Ce que tu as demandé, et ma réponse point par point

| Ton idée | Mon avis |
| --- | --- |
| Geler surtout quand la lecture est à l'arrêt | **Oui.** Mieux : on rend dès que la machine a de la marge (charge < 39 %). À l'arrêt, c'est toujours le cas ; pendant la lecture, seulement s'il reste de la marge. Le rendu se met en pause dès que la charge remonte. |
| Dégeler à la volée | **Oui**, avec deux garde-fous : (a) Volume, Pan, Mute, Solo et Envois ne dégèlent jamais, car ils restent en direct après le point de gel ; (b) un dégel pendant la lecture démarre la chaîne « à chaud » (pré-roulage, §4.6), pour qu'on n'entende ni trou ni clic. |
| Un indicateur de charge | **Oui, indispensable.** Il donne la charge du moment, le pic de la dernière lecture et **ce que coûterait le dégel** de la piste touchée. Son emplacement doit être validé sur maquette (§7). |
| Ne pas geler les pistes en travail ni les pistes live | **Oui.** La liste des pistes « chaudes » est au §3.2. Elle est plus longue que prévu : la probabilité de notes, le MIDI Learn et les boucles de retour en font partie. |
| Une option par piste | **Oui, une seule** : « Toujours en direct ». Je **refuse** l'option inverse, « toujours gelée, même touchée » : un bouton tourné qui ne changerait pas le son serait une aberration. |
| Les répétitions suffisent à voir si ça coince | **Oui, à condition de garder une trace** : le pic de chaque lecture, l'endroit (mesure, Scène), la cause (quelle piste dégelée), les décrochages. On peut lire ce rapport ou le demander à eVe (« comment s'est passée la répétition ? »). |

Mon seul vrai désaccord : il ne faut pas que **60 % déclenche un gel**. Le gel se prépare à l'avance. Pendant la lecture, il n'y a que des bascules, qui ne coûtent rien. Les seuils servent à autre chose : savoir quand rendre en tâche de fond, et quelle couleur prend l'indicateur.

## 2. Ce qui existe déjà (lu dans le code le 25 nov.)

- `atome/engines/mix-graph/src/offline_render.rs` : `OfflineRenderer` / `render_offline` (R-349). Il rend un plan de mix hors temps réel, avec le même hôte Kira que le temps réel, aussi vite que la machine le permet, sans toucher l'état global du moteur. Il travaille **par morceaux** (`render_into`), ce qui permet de le mettre en pause et de le reprendre. **C'est la brique de rendu à réutiliser.** Il existe aussi en natif (`audio-engine/src/render_proxy.rs`).
- `eVe/domains/rendering/project_view_timeline_midi_freeze.js` : l'outil « Figer » d'un clip MIDI. C'est un **acte de création** : une vraie prise audio, posée dans l'historique, la piste MIDI coupée. Il enregistre en temps réel et seulement sur le Web. **Ce n'est pas le mécanisme du gel automatique**, qui ne doit jamais rien écrire dans l'historique. Je propose de garder cet outil pour le « rendu en place », et de lui faire utiliser `OfflineRenderer` : il deviendrait instantané et marcherait aussi en natif.
- `platforms/web/audio-wasm/src/scheduled_backend.rs` : sur le Web, le moteur rend **sur le fil principal** (pompe toutes les 10 ms, 120 ms d'avance) et compte déjà ses décrochages (`discontinuities`). Conséquences : (a) sur le Web, le rendu de fond doit tourner dans un **Worker**, jamais sur le fil principal ; (b) la mesure de charge s'ajoute à cet endroit.
- **Aucune mesure de charge processeur n'existe aujourd'hui** (ni Web, ni natif). C'est le lot L1.
- `runtime_midi.js` : `note_probability` tire les notes **à chaque lecture**. Une piste qui l'utilise ne peut pas être gelée sans perdre son hasard.

## 3. Le principe

### 3.1 Ce qu'est un gel

- Un gel est un **dérivé régénérable**, comme un cache. Ce n'est jamais une vérité : aucun commit, aucun événement d'historique, aucune synchro. La description de l'atome reste la seule source. La règle « pas de cache sans goulot mesuré » est respectée : la mesure de charge de L1 est ce goulot.
- **Point de gel** : la sortie des inserts, avant le fader. Le gel contient la source (clips, instrument, notes, automation des inserts) et tous les inserts. Fader, Pan, Mute, Solo, Envois et automation du Volume restent en direct : ils sont peu coûteux et ce sont ceux qu'on touche en live.
- **Unité** : en Timeline, un stem par piste, aligné sur la timeline, queues comprises. En Cellules, un fichier par cellule.
- **Une cellule qui boucle** est rendue en régime établi : on rend deux tours et on garde le second, pour que la queue du tour précédent y soit. Un fichier « queue à l'arrêt » est rendu à part.
- **Empreinte** : une clé calculée sur la sous-partie de la description qui change le son avant le fader : clips et leurs sources, instrument et ses réglages, chaîne d'inserts et ses paramètres, automation des inserts, tempo et ses changements, signature, warp, fréquence d'échantillonnage, version du moteur. Si l'empreinte change, le gel ne vaut plus : la piste repasse en direct tout de suite et un nouveau rendu se met en file.

### 3.2 Pistes « chaudes », jamais gelées

1. Une piste armée ou en enregistrement, une piste dont l'entrée live est écoutée (micro, instrument).
2. Un instrument joué depuis un clavier MIDI ou un contrôleur en direct.
3. Une piste qui a un réglage appris au MIDI (R-293), ou un widget « Contrôles » (R-347) qui la cible.
4. Une piste choisie, ou une piste dont le panneau d'un effet est ouvert.
5. Une piste modifiée dans les **5 dernières minutes** (les « pistes sur lesquelles on travaille »).
6. Une piste dont un clip a `note_probability` < 1, ou un autre tirage au hasard à chaque lecture.
7. Une piste qui fait partie d'une boucle de retour audio (autorisée, voir la mémoire du 29 oct.).
8. Une piste qui reçoit une sidechain d'une piste chaude : la chaleur se propage le long des dépendances.
9. Une piste réglée « Toujours en direct ».
10. Un plugin hébergé non déterministe ou externe, s'il en existe (à vérifier en L2) : chaud par défaut en V1.

### 3.3 Ce qu'on lit

Une piste qui n'est pas chaude et dont le gel est valide est **toujours** lue gelée, quelle que soit la charge. On a ainsi moins de modes, une charge prévisible et moins de batterie consommée. C'est sans perte, à condition que le test de nullité (L10) passe.

## 4. Mécanismes

### 4.1 Mesure de charge (L1)
- Natif (cpal) : le temps de calcul du callback divisé par la durée du tampon. Web : le temps de `render_ahead` par bloc divisé par la durée du bloc, plus le compteur `discontinuities` existant.
- On publie trois valeurs : la charge lissée (moyenne sur 300 ms), le **pic** de la lecture en cours et les **décrochages**.
- **Coût par piste** : la part de temps de chaque tranche, mesurée quand elle joue en direct. Elle est gardée avec le gel (c'est « le coût si on dégèle »). Si une piste n'a jamais joué, on l'estime à partir des poids du catalogue des modules.
- La mesure tient compte de la réduction de fréquence quand l'iPad chauffe : on mesure du temps réel, pas un pourcentage du système d'exploitation.

### 4.2 Planificateur de rendu (L7)
- Il rend quand la charge est < 39 % depuis 3 s, et se met en pause au-dessus, entre deux morceaux de `render_into`.
- Ordre : d'abord les pistes au plus fort coût mesuré, puis les cellules des Scènes proches de celle qui est choisie.
- Natif : un fil de faible priorité (QoS « utility » sur iOS). Web : un Worker avec sa propre instance WASM d'`OfflineRenderer` (qui ne touche aucun état global) ; les octets des clips lui sont transférés.
- Pendant la lecture, il rend aussi, mais seulement sous le même seuil, et il s'arrête au premier signe de montée.

### 4.3 Stockage (L5)
- PCM 24 bits stéréo, environ 17 Mo par minute à 48 kHz. Pas d'Opus : il perd de la qualité. Lu en flux depuis le disque, jamais chargé en entier.
- Web : OPFS. Tauri : le disque, par Axum. iOS : un dossier de cache de l'app (pas le coffre `adole.db`).
- **Budget** : 3 % de l'espace libre, plafonné à 3 Go. On évince d'abord les projets fermés, puis le plus ancien. Tout se régénère, donc rien n'est sauvé sur le serveur (règle 21 : ce n'est pas une donnée de la personne).

### 4.4 Lecture gelée (L6)
- Dans le graphe de mix, la source et les inserts de la tranche sont remplacés par une voix qui lit le stem au point de gel. Le reste de la tranche ne change pas.
- **Bascule direct → gelé** : à une limite de bloc, avec un fondu linéaire de 21 ms (les deux signaux sont identiques, donc corrélés).

### 4.5 Ce qui dégèle
- Toucher un paramètre d'insert, l'instrument, un clip ou ses notes, ou ajouter ou enlever un effet. Le dégel part dès l'appui, pas à la première valeur.
- Armer la piste, ou faire naître une dépendance chaude (§3.2).
- Volume, Pan, Mute, Solo et Envois ne dégèlent jamais.

### 4.6 Dégel pendant la lecture, sans trou
1. Le stem gelé continue de jouer.
2. On instancie la chaîne en direct, puis on la **pré-roule** hors temps réel sur les 2 dernières secondes, sortie jetée. Les notes tenues, la queue de la réverb et l'état des filtres sont ainsi chauds. Cela prend quelques dizaines de ms, plus vite que le temps réel.
3. Fondu de 21 ms vers la chaîne en direct.
- Le pic de ce pré-roulage est compté dans l'indicateur. Pendant la bascule, le changement de valeur arrive avec environ 50 ms de retard : c'est acceptable et c'est documenté.
- Regel : la piste redevient candidate 5 minutes après sa dernière modification, si elle n'est plus chaude.

### 4.7 Décisions révisées pendant le codage (25 nov., elles remplacent §3.1, §4.2 à §4.6 là où elles diffèrent)

- **Point de gel** : la source et le **préfixe de modules dsp autonomes** de la tranche (sans sortie, sans key, sans source, sans modulation, non modulés, sans traîne longue > 89 ms). Une réverb, un écho et tout ce qui suit (Volume, Pan, Envois, REC) restent en direct. Un EQ ou un saturateur sont gelés. Une tranche n'est gelable que si son entrée n'est pas live, qu'elle a au plus 2 canaux et que rien n'y entre depuis une autre tranche. (`mix-graph/src/freeze_graph.rs`)
- **Pas de disque** : les stems vivent en mémoire seulement, budget 377 Mio (environ 18 min de stéréo à 48 kHz), compactés en 24 bits. Ils se re-rendent à la réouverture. Pas d'OPFS, pas d'Axum, pas de dossier iOS : moins de code, rien à évincer sur disque, aucune donnée de la personne (`freeze_store.rs`).
- **Web sans Worker** : le moteur de la page rend par tranches de 0,1 s sur le fil de la page (`audio_freeze_advance`, budget en ms), appelé par eVe quand la page est oisive. Natif : un fil à part, en pause de 34 ms tant que la charge dépasse 39 %.
- **Dégel sans pré-roulage** : la chaîne en direct n'a jamais cessé de tourner sur les modules après le point de gel, et l'instrument « au repos » garde son horloge. Au dégel, le stem s'éteint en fondu de 1 s pendant que la chaîne froide reprend. Le test de nullité montre un écart < 1e-4 avant et après le dégel.
- **Instrument au repos** : un instrument entendu seulement par des tranches gelées ne calcule rien (`SourceBus::rest`), ses événements sont écartés, et il reçoit un « toutes notes coupées » à la reprise.
- **Changement du programme** : si la partie gelée d'une tranche change (entrée, largeur, transport, modules gelés), le moteur la dégèle lui-même à l'application (`Freezes::applied`), sans attendre la page.
- **Cellules** : un stem représente la timeline linéaire (temps 0 → fin). Pendant une lecture des Cellules (Scènes lancées en direct), toutes les pistes sont chaudes : aucun gel par cellule en V1.
- **Clé** : FNV-1a 128 bits du plan du stem écrit canoniquement (clés triées), sans les identifiants de voix ni l'état de lecture des transports, préfixée « stem-1 » (`freeze_plan.rs`).

## 5. Information pour les répétitions et le live (L8, L9)

- **Charge** : valeur lissée, pic de la lecture, décrochages. Couleurs : sous 60 % le ton normal du thème ; de 60 à 80 % l'orange ; au-delà, ou après un décrochage, le rouge d'enregistrement.
- **Coût du dégel** : à l'appui sur une piste gelée, l'indicateur montre en aperçu la charge estimée une fois cette piste en direct.
- **Rapport de lecture** : pic, endroit (mesure, Scène), cause (piste dégelée, piste armée), décrochages. Il est gardé pour les 5 dernières lectures, dérivé et local.
- **Commandes voix et MCP** (une commande par action d'écran) :
  - `audio.load.read` ;
  - `audio.load.report` (« comment s'est passée la répétition ? ») ;
  - `audio.freeze.prepare` (« prépare le concert » : tout ce qui peut l'être est rendu tout de suite, au maximum de vitesse) ;
  - `audio.freeze.status` ;
  - `track.freeze_policy.set` (Auto / Toujours en direct) ;
  - `audio.freeze.enable` (réglage global, actif par défaut).

## 6. Lots

| Lot | Contenu | Langage, propriétaire |
| --- | --- | --- |
| L1 | Mesure de charge et coût par tranche, Web et natif | Rust (`audio-engine`, `audio-wasm`), lecture JS mince |
| L2 | Pistes chaudes (§3.2), propagation par les dépendances | Rust ; JS n'envoie que les faits d'UI (choix, panneau ouvert, appris) |
| L3 | Empreinte et invalidation | Rust (`mix-graph`) |
| L4 | Rendu de stem et de cellule (régime établi, queue), réutilisation d'`OfflineRenderer` | Rust ; Worker Web |
| L5 | Stockage, budget, éviction | Rust ; OPFS, Axum, iOS |
| L6 | Voix gelée dans le graphe, bascules, pré-roulage | Rust (`mix-graph`) |
| L7 | Planificateur (seuil, ordre, pause) | Rust |
| L8 | Indicateur, état « gelée » d'une piste, option par piste, réglage global | **FAIT** (1A seule, « Gel auto. » dans Avancé ; §7 tranché) |
| L9 | Commandes voix et MCP, `eveT` | JS (glue), passerelles existantes |
| L10 | Sondes : nullité gelé/direct (résidu < −89 dBFS), clic de bascule, dégel sous charge, invalidation, éviction, Worker, répétition simulée | `temp/` |
| L11 | « Figer » MIDI branché sur `OfflineRenderer` (instantané, aussi en natif) | JS + Rust |

Ordre : L1 → L3 → L4 → L6 → L2 → L7 → L5 → L9 → L11 → L10, puis L8 après validation des maquettes.

**État au 25 nov. (soir)** : L1–L7, L9, L10 et L11 sont codés et vérifiés (voir R-370 dans le registre). L5 est réduit à la mémoire (§4.7). Les commandes s'appellent `audio_freeze.load`, `.report`, `.prepare`, `.status`, `.enable` et `.track_policy`, une seule famille comme les autres. L8 est codé à son tour (25 nov., soir) selon le choix de l'utilisateur : maquette 1A seule (Lecture or à partir de 60 %, rouge à partir de 80 %, tenu 3 s), « Gel auto. » dans Réglages › Avancé ; pas de jauge au rail, pas de marque sur l'en-tête, « Toujours en direct » à la voix seulement (`audio_freeze.track_policy`). Tout le cahier est fait.
Fichiers partagés à demander à l'orchestrateur : `atome/engines/*`, `platforms/web/audio-wasm`, `Cargo.toml`, `Cargo.lock` (si une dépendance de hachage est ajoutée), `eVe/intuition/tools/molecule/*`.

## 7. Ce que la règle 16 bloque (à montrer en maquettes avant de coder)

1. **Indicateur de charge.** Propositions :
   - A : dans la case Activité de la bande, qui alterne déjà entre ses faces (rien de nouveau dans la grille) ;
   - B : une jauge dans le rail contextuel, au-dessus de « Niveau », pliée par défaut comme les autres rouleaux (R-360) ;
   - C : rien tant que tout va bien, le glyphe de Lecture passant à l'orange ou au rouge seulement au-delà de 60 %.

   **Ma préférence : C, plus B à la demande.** C'est zen en temps normal, et le détail est là pour la répétition.
2. **État « gelée » sur l'en-tête de piste** : une marque discrète ou rien du tout (le zen dit rien ; le live dit qu'il faut le savoir).
3. **Option « Toujours en direct »** dans le rail de la piste en Édition, et **Gel automatique** dans Réglages › Avancé.

## 8. Risques, par nature

Gravité et probabilité : F (faible), M (moyenne), É (élevée).

### 8.1 Utilisateur et usage
| Risque | G | P | Parade |
| --- | --- | --- | --- |
| Dégel en concert d'une piste lourde, qui provoque un décrochage | É | M | Aperçu du coût au toucher, rapport de répétition, « prépare le concert », option « Toujours en direct » pour ce qu'on touchera en live |
| La personne ne comprend pas pourquoi la charge saute | M | M | Le rapport nomme la cause ; eVe l'explique à l'oral |
| Elle ne sait pas qu'une piste est gelée et croit que son réglage n'a pas pris | M | F | Le dégel part dès l'appui ; état visible (maquette 2) |
| Une répétition non représentative (autres pistes en live le soir du concert) | M | M | Le rapport donne le pire cas « si tout est dégelé » ; la marge reste visible |
| Le hasard des notes (probabilité) disparaîtrait | M | — | Piste chaude d'office (§3.2-6) |

### 8.2 Qualité audio
| Risque | G | P | Parade |
| --- | --- | --- | --- |
| Le gel ne sonne pas comme le direct (dérive, hasard non semé) | É | F | Même moteur, graine fixe, test de nullité L10 qui bloque le lot |
| Clic ou trou à la bascule | M | M | Limite de bloc, fondu de 21 ms, pré-roulage ; sonde de clic |
| Queues coupées en Cellules (réverb, écho) | M | M | Régime établi sur 2 tours, fichier de queue à l'arrêt |
| Compensation de latence (PDC) décalée entre gelé et direct | É | M | Le stem est aligné après compensation ; sonde de phase gelé + direct sommés |
| Changement de fréquence d'échantillonnage ou de carte son | M | F | La fréquence fait partie de l'empreinte |

### 8.3 Performance
| Risque | G | P | Parade |
| --- | --- | --- | --- |
| Le rendu de fond vole la marge du direct | É | M | Seuil de 39 %, pause entre morceaux, faible priorité, Worker sur le Web |
| Web : le moteur sur le fil principal est gêné par le décodage et le transfert vers le Worker | M | M | Transferts sans copie, décodage dans le Worker ; mesure avant et après |
| Lecture disque trop lente pour beaucoup de stems (iPad, disque lent) | M | F | Lecture en flux avec tampon d'avance ; au-delà d'un nombre de stems mesuré, on garde le direct |
| iPad qui chauffe : le rendu chauffe, ce qui réduit la fréquence, ce qui fait monter la charge | M | M | La mesure en temps réel le voit ; rendu suspendu en état thermique « grave » |
| Pic de pré-roulage au dégel | M | M | Pré-roulage court (2 s), compté dans l'aperçu |
| Mémoire : le Worker Web double les octets des clips | M | M | Transfert, pas copie ; une seule instance |
| AUv3 : quotas de mémoire et de processeur d'une extension, hôte tiers | É | M | En V1 dans l'AUv3 : lecture des gels existants seulement, aucun rendu de fond |

### 8.4 Code et architecture
| Risque | G | P | Parade |
| --- | --- | --- | --- |
| Empreinte incomplète : un gel périmé joue l'ancien son (le pire bug, silencieux) | É | M | Liste fermée des champs, test qui casse si un champ du `Program` est ajouté sans y être classé, version du moteur dans la clé |
| Le gel glisse vers une vérité (écrit dans l'historique, synchronisé) | É | F | Aucun commit ; stockage hors coffre ; relu au §9 de la structure de l'atome |
| Deux mécanismes de « gel » qui se confondent (Figer MIDI et automatique) | M | M | Noms distincts : Figer = rendu en place (création), gel = interne et invisible |
| Graphe de mix plus complexe (une voix de remplacement par tranche) | M | M | Un seul propriétaire dans `mix-graph`, lots isolés, fichiers de moins de 300 lignes |
| Concurrence : invalidation pendant un rendu en cours | M | É | Rendu marqué par son empreinte ; un résultat obsolète est jeté à l'arrivée |
| Sessions parallèles sur `atome/engines/*` | M | É | Couloir demandé à l'orchestrateur avant L1 |

### 8.5 Données et stockage
| Risque | G | P | Parade |
| --- | --- | --- | --- |
| Disque saturé (iPad, projets longs) | M | M | Budget de 3 %, éviction, nettoyage avec `clean:build-cache` |
| Cache corrompu (fichier tronqué) | M | F | Taille et somme vérifiées à la lecture ; un fichier invalide est simplement re-rendu |
| Vie privée : des stems laissés sur un appareil partagé | F | F | Effacés à la déconnexion, comme le reste de la copie de travail |

### 8.6 Plateformes
| Risque | G | P | Parade |
| --- | --- | --- | --- |
| Web sans OPFS (anciens navigateurs) ou en navigation privée | F | M | Erreur explicite : gel désactivé, dit une fois dans le message discret, sans substitut |
| iOS en arrière-plan : le rendu est tué | F | M | Rendu repris par morceaux, rien perdu |
| Android Exynos sans WebGPU (sans rapport avec l'audio) | — | — | Sans effet |

### 8.7 Validation
| Risque | G | P | Parade |
| --- | --- | --- | --- |
| Les sondes Web ne reproduisent pas la charge réelle de l'iPad | M | É | Sondes de mécanique sur le Web ; mesure sur l'iPad « Jeezs's Tab » faite par toi |
| Charge mesurée faussée sous Chromium sans tête (SwiftShader, processeur partagé) | M | M | Seuils injectés dans la sonde ; on vérifie la logique, pas la valeur absolue |

## 9. Ce qu'il reste à décider

- Les trois maquettes du §7 (règle 16).
- Rien d'autre : seuils (39 / 60 / 80 %), délai (5 min), fondu (21 ms), pré-roulage (2 s) et budget (3 %) sont des valeurs par défaut naturelles (règle 19), toutes ajustables par la suite.
