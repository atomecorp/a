# Orchestrateur de test réel, puis réparation — dont mes propres régressions

Date : 18 août 2026
État : **rouverte le 18 août 2026 — implémentation terminée, acceptation visuelle en cours**.
La vidéo utilisateur invalide la clôture précédente : 13,465 s séparent le clic et le
premier changement visible. Atteindre le gestionnaire ne constitue pas une présentation.
La tâche ne pourra être refermée qu'après comparaison vidéo avant/après et validation
headed WebKit/WebGPU puis Tauri ; iOS physique reste un gate distinct.

---

## Pourquoi ce document

Vingt tours de diagnostic, sept correctifs, **trois régressions livrées**, et le lag de
plusieurs dizaines de secondes toujours introuvable.

La cause n'est pas la difficulté du bug : **l'agent ne peut pas exécuter l'application**.
Chaque hypothèse coûte à l'utilisateur un rechargement et une capture de journal, et on
devine entre deux. Deux régressions sur trois ont été livrées **avec des probes vertes** —
la probe vérifiait ce qu'on avait imaginé, pas ce que le code fait.

Or `.codex/visual-test-protocol.md` et `atome/documentations/how_debug_UI.md` décrivent
déjà la procédure d'acceptation Web / Tauri / iOS, et le dépôt contient déjà un harnais
Playwright complet — **dont une probe WebKit qui ne peut pas tourner faute du moteur
installé**. Ce plan répare d'abord la méthode, ensuite le code.

---

## Découverte majeure : une chaîne bloquante construite en trois tours

```
loadProjectAtomes → await restoreProjectViewModeSafely   ← changement void → await
                  → setProjectViewMode
                  → runExclusiveByProject                ← file par projet ajoutée après
                  → await mountProjectViewSurface
```

Chaque chargement de projet **bloque désormais sur le montage d'une surface de vue**,
sérialisé par une file introduite deux tours plus tard. Trois modifications isolées,
chacune défendable, qui composent un blocage que personne n'a regardé dans son ensemble.

C'est le premier suspect du lag **et** du « impossible d'ouvrir Home / tout est cassé ».

Illustration du défaut structurel récurrent du dépôt — *plusieurs endroits décident d'une
même chose sans arbitre* — reproduit ici par les correctifs eux-mêmes.

---

## Décisions actées avec l'utilisateur

| Sujet | Décision |
|---|---|
| iOS | `devicectl` + console + API WebSocket locale. **Pas d'Appium.** |
| Priorité | **Mesurer** le lag avant tout correctif de performance |
| Exigence | Aucune modification du chemin de rendu sans preuve dans l'app lancée |

---

## État vérifié de l'environnement

| Élément | État |
|---|---|
| `scripts/run_fastify.sh` → :3001 | présent, **premier plan** |
| `scripts/run_tauri.sh --test` → :3000 | présent, **premier plan** |
| Playwright | installé — **Chromium seul** |
| WebKit (moteur Safari / WKWebView / iOS) | **absent** → `npx playwright install webkit` |
| iPhone 17 Pro + `one.atome.app` | appairé, application installée |
| Appium | absent (hors périmètre) |
| `devicectl … screenshot` | n'existe pas |

---

## À réutiliser — ne rien réécrire

La règle du dépôt interdit une seconde implémentation quand un propriétaire existe.

| Besoin | Propriétaire existant |
|---|---|
| Aides UI canoniques | `tests/probes/molecule_ui_acceptance_support.mjs` — `waitFor`, `recordCenter`, `visibleMenuTool`, `clickCanvasTarget`, `findBevyUiNodeTarget` |
| Plus petit exemple correct | `temp/finder_ui_acceptance_probe.mjs` |
| WebKit déjà câblé | `tests/probes/project_surface_safari_reload_probe.test.mjs` |
| Client WebSocket | `tests/probes/remote_account_not_provisioned_ws_runtime_probe.test.mjs` |
| Acceptance UI de référence | `npm run test:molecule:ui` |

**Deux pièges documentés :**

- Le prédicat `async` du snippet `waitForFunction` de la doc **ne garde rien** : une Promise
  est toujours vraie. Utiliser `waitFor` de l'aide canonique.
- Le clic vise le record **`_background`** d'un outil (`eve_bevy_ui_main_menu_tool_<clé>`),
  pas `_icon_image` ni `_label`.

---

## Partie A — L'orchestrateur

- [x] **A1** — `npx playwright install webkit` — **fait**
      `Webkit 26.0 (playwright build v2227)` installé et lancé avec succès.
      Le moteur de Safari est désormais pilotable localement.
- [x] **A2** — `temp/lag_orchestrator_probe.mjs` — **fait et fonctionnel**

      Chaîne complète validée en WebKit *sans aucune intervention de l'utilisateur* :
      serveur → coquille eVe → session anonyme → menu BevyUI monté (9 outils) →
      collecteur de perf armé → **435 marques capturées** → palette Vue ouverte par un
      vrai clic sur le record `_background`.

      **Piège rencontré, à retenir** : `eveDashboardBevyUiRuntime.state.projectId`
      **n'existe pas**. Le champ réel est `state.sceneProjectId`. Passer `undefined`
      donne un inventaire vide et *aucune erreur* — exactement le genre d'échec
      silencieux qui coûte une heure.

      Identifiants réels des modes de vue (constatés, plus supposés) :
      ```
      …_main_menu_tool_view__view_natural_background
      …_main_menu_tool_view__view_table_background
      …_main_menu_tool_view__view_list_background
      ```

- [x] **A3** — Scénario décisif joué **de bout en bout, sans intervention humaine**

      Chaîne : serveur → session anonyme → menu monté → **création de projet**
      (via `ensureProject` de `dashboard_workspace_stress/product_actions.mjs`) →
      changements de vue → lecture des marques.

      **Résultat mesuré, projet neuf et vide, WebKit headless :**

      | Mode demandé | Durée | Résultat |
      |---|---|---|
      | `list` | **14 ms** | appliqué |
      | `natural` | **10 ms** | appliqué |
      | `list` | **10 ms** | appliqué |
      | `table` | **4 ms** | appliqué |

      **Le lag ne se reproduit pas dans ces conditions.** Silences maximaux observés :
      600 ms à 2 s, tous `fil libre`, aucun proche des dizaines de secondes.

      **Deux faux départs à consigner — ils auraient été présentés comme des
      découvertes si le harnais n'avait pas permis de les recouper :**

      1. Un premier tir a produit `⏳ 47909ms … après view_mode.click`. Ce n'était
         **pas** le lag : le clic échouait légitimement et le harnais sondait dans le
         vide. Un silence long n'est pas une preuve de lenteur.
      2. Cause de cet échec, obtenue en interrogeant le propriétaire canonique :
         `setProjectViewMode('list')` → `{ ok: false, error: 'project_view_project_id_required' }`
         car `__currentProject` était `null` (espace Dashboard, aucun projet ouvert).

      **Défaut mineur mais réel mis au jour** : dans cet état, le clic est accepté,
      `view_mode.click` est émis, et **rien n'indique à l'utilisateur que la demande a
      été refusée**. Échec silencieux.

      **Ce que ce résultat élimine** : le changement de vue n'est pas intrinsèquement
      lent ; ni le code de bascule, ni la file de sérialisation ne coûtent des secondes.

      **Ce qu'il n'élimine pas** — trois différences avec la session de l'utilisateur :
      - son projet **contient des médias** (vidéo, audio) ; le mien est vide ;
      - il est en **headed avec WebGPU réel** ; je suis en headless ;
      - il **recharge une session existante** ; je pars d'un état neuf.

- [x] **A3-bis** — Rejoué avec contenu et après rechargement — **et ça a trouvé autre chose**

      | Mesure | Valeur |
      |---|---|
      | `loadProjectAtomes(force)` | **33 ms** (4 records) |
      | Changements de vue, projet peuplé | **4 → 17 ms** |
      | Silence le plus long | 4 247 ms, `fil libre`, après `atomes.load_project` |

      Import de médias **non concluant** : `upload_failed` sur les trois fixtures, puis
      `Server unreachable` sur une écriture suivante. Le serveur HTTP répondait 200 —
      la coupure est **côté WebSocket applicatif** (`adole_websocket.js:191`), pas réseau.
      La piste « médias » reste donc ouverte, et je le dis plutôt que de conclure.

---

## Découverte majeure — le symptôme signalé est reproduit et expliqué

L'utilisateur écrivait : *« toujours pas de rendu du mode naturel tant que je clique pas
un projet dans le Dashboard »*. **C'est exactement ce qui se produit, et voici pourquoi.**

Relevé en session anonyme réelle, démarrage complet, menu monté :

| Sonde | Valeur |
|---|---|
| `getCurrentUserId()` | `null` |
| `window.__currentProject` | `null` |
| `AdoleAPI.projects.getCurrentId()` | `null` |
| `currentProjectId()` | `""` |
| `projects.loadSaved()` | `null` |
| `getProjectViewMode()` | **`"natural"`** |
| `setProjectViewMode('natural')` | **`project_view_project_id_required`** |

**Chaîne de causes, lue dans le code :**

1. `adole_api/projects.js:219` — `load_saved_current_project()` sort immédiatement si
   `!currentUserId`. **Une session anonyme n'a pas d'identifiant utilisateur.**
2. Donc `project_bootstrap.js:119→260` (`loadSaved` → `setCurrent`) ne pose jamais
   `window.__currentProject` : `updateWindowProject` n'est appelé **que** par `setCurrent`.
3. Donc `currentProjectId()` (`project_view_records.js:18`) rend `""`.
4. Donc toute demande de vue est refusée par `project_view_mode_state.js:168`.

**Deux défauts distincts, et le second est le plus toxique :**

- **Refus silencieux** — le clic est accepté, `view_mode.click` est émis, la valeur de
  retour `{ ok: false }` n'est lue par personne. Ni journal, ni retour visuel.
- **Le lecteur contredit l'écrivain** — `project_view_mode_state.js:29` : sans projet
  courant, `getProjectViewMode()` renvoie `NATURAL` **par défaut**, pendant que
  `setProjectViewMode` refuse le même appel. Toute UI qui lit le mode pour surligner le
  bouton actif affiche donc « naturel » **alors qu'aucune surface ne peut être montée**.
  L'interface affirme un état que le moteur a refusé d'atteindre.

C'est le défaut structurel que l'utilisateur avait diagnostiqué à l'œil — *plusieurs
endroits décident d'une même chose sans arbitre* — dans sa forme la plus coûteuse :
**la lecture et l'écriture d'un même état ne suivent pas la même règle.**

> À noter honnêtement : ceci explique l'**absence de rendu**. Cela n'explique pas encore
> les **dizaines de secondes**, qui restent non reproduites.

- [ ] **A4** — iOS : `xcrun devicectl device process launch --device <ID> one.atome.app`,
      console + `/ws/api`. **Port éphémère** (`LocalHTTPServer.start` sans port) : le
      découvrir, jamais le supposer

---

## Partie B — Mesurer le lag, puis seulement corriger

- [ ] **B1** — Rejouer A3 sur WebKit
- [ ] **B2** — Rejouer A3 sur Tauri

| Ce que dit la ligne `⏳` | Conclusion |
|---|---|
| `TEMPS SYSTEME depuis le geste`, plusieurs secondes | lag réel, **borné entre deux marques nommées** |
| silence **avant** `input.press` | le temps n'est pas dans le traitement du clic |
| aucun silence long | non reproductible ici → différence d'environnement |

> **Aucun correctif de performance avant ce résultat.**

---

## Partie C — Défauts

### C1 — Chaîne bloquante introduite par les correctifs *(priorité haute)*

- [x] Rétablir le non-bloquant **sans** ramener le clignotement d'origine

`eVe/intuition/runtime/tool_genesis_project_load_runtime.js:298` attend la restauration,
qui attend la file, qui attend le montage de surface. Le **chargement** ne doit pas dépendre
de la **présentation**.

La restauration est maintenant lancée après la projection sans retenir
`loadProjectAtomes()`. Le préchargement reste au début du chargement ; la probe
`temp/view_mode_restore_flash_probe.mjs` vérifie ce contrat au lieu d'interdire
le non-bloquant. Le contrat Node `project_load_filter_contract.test.mjs` garde
une lecture de préférence non résolue et prouve que le chargement rend la main.
Validation locale : probe ciblée, syntaxe des deux runtimes, garde de réutilisation
et garde sans fallback vertes. WebKit/Tauri/iOS restent à vérifier (voir état de
l'environnement dans `FRAMEWORK_STATE.md`).

### C2 — Panneau Home inopérant (Safari)

- [ ] Départager les deux causes en session réelle

Deux candidates, **toutes deux silencieuses par construction** :

1. `eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js:370` rend
   `{ ok: false, error: 'bevy_panel_surface_canvas_missing' }` sans rien journaliser quand
   `#eve_surface_project` est absent — or le démarrage ne matérialise la surface que via le
   Dashboard.
2. `eVe/intuition/tools/user_home_panel_runtime.js:202` — un écouteur **en capture** ferme
   Home et rouvre le login à chaque `squirrel:auth-checked` non authentifié. Candidat
   Safari fort (ITP / stockage cloisonné).

Diagnostic unique qui tranche, en session réelle :

```js
document.getElementById('eve_surface_project')
await window.open_home_panel({ source: { type: 'manual' } })   // lire .error
```

### C3 — Double chargement du document sous Tauri *(confirmé)*

- [ ] Servir depuis Axum dès l'ouverture, ou ne pas démarrer le boot avant navigation

`platforms/desktop-tauri/src/main.rs:320` navigue vers `http://127.0.0.1:3000/` alors que la
fenêtre affiche déjà l'`index.html` empaqueté → premier boot tué en vol.
`atome/src/squirrel/spark.js:325` journalise sans réessayer : la seconde séquence est un
**second document**, pas une reprise.

> Ne concerne **pas** Safari.

### C4 — Clignotement au démarrage *(confirmé)*

- [ ] Rendre le reconcile post-démarrage observationnel — **preuve dans l'app d'abord**

`eVe/domains/rendering/bevy_web_renderer_runtime.js:247` arme un reconcile à +160 ms ;
`eVe/domains/rendering/surface_runtime.js:60` court-circuite le test « taille inchangée »
sous `forceReconcile` et dispatche `surface.resize` **à taille identique** → reprojection
complète → `bevy.op.transform ×41`.

> Chemin de rendu : preuve exigée avant toute modification.

---

## Partie D — Garde-fou contre le défaut récurrent

- [ ] Probe qui échoue si une décision **par projet** est gouvernée par un état **global**
- [ ] Probe qui échoue si une opération de **chargement** dépend d'une opération de
      **présentation**

---

## Vérification

1. Probes ciblées **rouges d'abord** pour chaque correctif hors rendu
2. Pour C4 : preuve par le harnais dans l'app lancée, avant et après
3. Matrice `fonction × Web × Tauri × iOS` du protocole visuel
4. `npm run check:component-reuse-guardrails`, `check:no-fallbacks`,
   `temp/run_all_probes.sh`, `npm run test:molecule:ui`
5. Rapport de complétion et `FRAMEWORK_STATE.md` selon le module 07
6. **Aucune commande Git en écriture**

---

## Acquis conservés de la session de diagnostic

Correctifs mesurés qui tiennent, à ne pas défaire :

| Correctif | Preuve |
|---|---|
| Temporisation des textures vidéo | 13 300 ms → 1 800 ms |
| Forme d'onde audio en cache | 220 ms → 0 ms |
| Preview média : propriétaire unique | probe |
| Rail contextuel en liste / matrice | probe |
| Import et record au niveau courant | probe |
| Mesure activable sous Tauri / iOS | utilisée en production de diagnostic |
| Chien de garde des silences (`⏳`) | bloqué / gelé / attente + frames + geste |
| Mesure du lot de mapping | N mesures qui se recouvraient → 1 mesure honnête |

---

## Réparation commune du montage — 18 août 2026

Causes confirmées et corrigées :

- la restauration de vue a quitté chaque `renderProjectRecords()` et n'est exécutée
  qu'une fois après la projection finale autoritative ;
- `activateProjectWorkspace()` ne relance plus un second rendu complet après
  `loadProjectAtomes()` ;
- les files de mode et de montage BevyUI sont désormais latest-wins et annulables jusque
  dans l'hydratation d'image et la projection d'overlay ; Naturel suspend immédiatement
  l'arbre structuré avant son démontage ;
- Dashboard, menu et vue projet remplacent leur préfixe de records atomiquement ; aucun
  lot de vingt records n'est présenté pour ces arbres ;
- `surface_runtime.js` publie l'unique taille stabilisée. Menu, Dashboard et vue projet
  consomment cette notification et n'installent plus d'observers concurrents. La passe
  forcée à taille identique est supprimée ;
- le menu principal est prêt avant l'ouverture du Dashboard. Les catégories et cartes
  visibles sont chargées avant son premier montage invisible, puis l'arbre complet est
  révélé par un court fondu GPU ; une réouverture suit le même contrat ;
- fermer le Dashboard annule présentation, hydratation et rendu avant suspension.

Preuves automatisées actuelles : 43 contrats BevyUI/overlay/resize verts, 3 contrats
activation projet verts, et les probes `project_load_filter_contract` et
`workspace_dashboard_project_bootstrap_contract` vertes. Le contrat de chargement prouve
une seule restauration et deux projections seulement (locale puis finale), jamais une
projection supplémentaire de restauration.

Acceptation restant obligatoire avant clôture : scénario multimédia réel dans Naturel,
Liste et Matrice, bascules rapides, resize continu, Dashboard visible/masqué, premier frame
de boot complet, vidéo après, headed WebKit/WebGPU, Tauri, puis iOS physique séparément.
