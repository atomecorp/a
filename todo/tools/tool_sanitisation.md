# Sanitisation du systeme de tools

## Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

Date: 2026-05-19

## Objectif

Remettre le systeme de tools au niveau du contrat documentaire Atome/eVe sur quatre axes inseparables:

1. conception canonique du tool;
2. execution runtime et APIs;
3. projection visuelle, styles, iconographie, et etats;
4. modularite, unicite, et absence de chemins legacy concurrents.

Ce document sert de plan de sanitisation et de reference de travail pour converger vers un systeme de tools unique, coherent, persistable, historisable, visuellement propre, et exploitable depuis UI, script, MCP, et AI.

## Perimetre inspecte

Documentation normative:

- documentations/AI.md
- documentations/code&tools.md
- documentations/atome_object.md
- documentations/tools_api_and_coding.md
- eVe/documentations/tools.md
- eVe/documentations/atome_concepts.md
- eVe/documentations/runtime_ai_mcp_entrypoints.md
- eVe/documentations/int8.md

Implementation actuellement inspectee pour le volet audio/capture:

- eVe/intuition/tools/capture.js
- eVe/intuition/runtime/tool.js
- eVe/intuition/tools/core/tool_registry.js
- eVe/intuition/tools/core/tool_definition_ssot.js
- eVe/intuition/tools/core/tool_runtime.js
- eVe/intuition/projection/tool_strip.js
- eVe/intuition/projection/button.js
- eVe/intuition/ribbon/menu.js

Ce rapport ne modifie pas le code applicatif. Il prepare la correction structurelle.

## Resume executif

Le socle tools V2 existe deja, mais l'ensemble n'est pas encore assez strict ni assez unifie pour satisfaire le contrat documentaire.

Constat principal:

1. Le runtime sait deja persister et invoquer des tools via un chemin canonique.
2. Les tools capture audio/video utilisent ce chemin, mais a travers une definition locale minimale et encore partiellement legacy.
3. La couche visuelle des boutons est encore contaminer par des exceptions locales, des conventions dupliquees, des icones par fallback, et des attributs de compatibilite qui ont deborde dans le contrat visible.
4. Le systeme manque encore d'une SSOT suffisamment riche pour garantir en meme temps: unicite metier, rendu unifie, i18n, manifeste outille, permissions/capabilities justes, et absence de definitions paralleles.

Conclusion:

- Le systeme n'est pas a refaire de zero.
- Le systeme doit etre sanitise par convergence vers un seul contrat complet, puis par suppression des chemins legacy qui reconstruisent partiellement un tool au lieu de consommer sa definition canonique.

## Checklist de conformite ultra courte

Un tool conforme doit satisfaire tous les points suivants:

- [ ] Le tool existe comme atome canonique de type tool.
- [ ] Le tool est cree ou mis a jour via le registre V2, pas via une definition orpheline locale.
- [ ] Le tool possede une identite unique stable: id, tool_key, tool_id canonique.
- [ ] Le tool declare un manifeste minimal: description, inputs, outputs, effects, history_class, capabilities.
- [ ] Le tool declare une UI canonique: icon, label_key, label_fallback, style_token, size_mode.
- [ ] Le tool declare un comportement canonique: button_type, actions, bindings.
- [ ] Le tool s'execute via ToolRuntime et Command Bus, jamais par mutation directe UI.
- [ ] Le tool fonctionne dans les memes conditions depuis menu, panel, projection, script, MCP, et AI.
- [ ] Le tool est obligatoirement utilisable via MCP avec un entrypoint canonique stable.
- [ ] Le tool declare explicitement sa correspondance MCP: entrypoint canonique, actions autorisees, audit, et policy.
- [ ] Le tool est obligatoirement batch-capable avec un contrat explicite de cibles, atomicite, politique d'erreur, et historisation.
- [ ] Le tool est obligatoirement chainable avec sorties machine-readables reutilisables par un autre tool ou un pipeline.
- [ ] Le tool est obligatoirement utilisable programmatiquement sans UI.
- [ ] Le tool est obligatoirement activable par un systeme de CRON ou de scheduling, en batch ou non.
- [ ] Le tool expose un contrat d'avancement et de post-traitement: progression, etapes, statut, erreurs, annulation, reprise, et resultat final.
- [ ] Le tool ne bloque pas sa reutilisation pendant un post-traitement long lorsque le domaine permet une execution en arriere-plan.
- [ ] Le tool affiche son avancement via une projection visuelle canonique, claire, elegante, et derivee du runtime plutot que d'un etat local decoratif.
- [ ] Le rendu visuel provient d'une factory unique, sans chemin clone/fallback specifique au support.
- [ ] Le tool n'a qu'une seule source d'icone et n'utilise pas de fallback generique pour masquer une definition manquante.
- [ ] Le tool n'expose pas de doublons de conventions techniques dans son contrat visible sauf migration explicitement bornee.
- [ ] Le tool a des tests de persistance, d'invocation, de latch si applicable, et de parite visuelle entre ses projections.

## Controle MCP et correspondance obligatoire tool <-> MCP

Le document et le systeme doivent expliciter, pour chaque tool canonique, sa relation exacte avec MCP.

Regles obligatoires:

1. Aucun tool canonique ne doit rester sans statut MCP explicite.
2. Tous les tools canoniques doivent etre utilisables via MCP.
3. Si une surface runtime V2 existe pour le tool, MCP doit preferer runtime.tools.call ou runtime.tools.batch_call.
4. AtomeAI ne remplace pas le runtime; il ajoute policy, proposal, confirmation, et audit pour les appels AI.
5. Un tool peut etre cache cote UI et rester pleinement invocable via MCP, a condition que son contrat runtime soit complet.
6. Un host UI ou une palette qui n'est pas encore utilisable via MCP doit etre considere comme non_conforme jusqu'a decomposition ou contractualisation correcte.
7. Le mapping MCP ne doit jamais pointer vers un helper legacy si une surface runtime V2 equivalente existe deja.
8. Les actions MCP doivent reutiliser les memes noms canoniques que l'UI: pointer.*, gesture.*, state.*, commit.
9. Le meme trace_id doit pouvoir traverser UI, MCP, AI, runtime, et command bus.

Statuts MCP autorises:

- expose_direct_runtime: le tool est appele directement via runtime.tools.call ou runtime.tools.batch_call.
- expose_via_ai_policy: le tool est execute via AtomeAI.callTool, puis delegue au runtime canonique.
- non_conforme: aucun mapping canonique stable n'existe encore; blocage a traiter.

## Traitement par lots obligatoire

Le batch ne doit pas etre compris seulement comme un transport MCP. Il doit etre un contrat metier obligatoire de tous les tools canoniques.

Regles obligatoires:

1. Tous les tools canoniques doivent etre batch-capables.
2. Un tool conforme ne doit pas forcer l'appelant a boucler hors du runtime pour traiter une liste de cibles.
3. Le traitement par lots doit reutiliser le meme contrat metier en UI, script, MCP, AI, et scheduling.
4. Le batch peut etre transporte via runtime.tools.batch_call, mais cette presence ne dispense pas de declarer le comportement batch du tool lui-meme.
5. Le contrat batch de chaque tool doit preciser:
   - les types de cibles acceptes;
   - le format des listes de cibles;
   - l'atomicite attendue;
   - la politique d'erreur;
   - la politique d'historisation et de coalescence.
6. Les tools a semantique mono-cible doivent tout de meme accepter une enveloppe batch et executer proprement une sequence canonique sur chaque item ou signaler une erreur contractuelle explicite par item.
7. Un tool batch-capable doit etre capable de traiter une selection multiple d'atomes quand son domaine metier le justifie.
8. Les effets batch ne doivent jamais contourner le Command Bus ni l'audit.

Modes batch autorises:

- native_multi_target: le tool sait traiter nativement plusieurs cibles dans une seule logique metier.
- sequenced_single_target: le tool est semantiquement mono-cible mais accepte obligatoirement l'enveloppe batch et traite la liste de facon canonique.
- non_conforme: le comportement batch est flou ou recompose localement selon le support.

Bloc conceptuel minimal attendu pour la batch semantics:

```jsonc
{
  "batch": {
    "mode": "native_multi_target",
    "entrypoint": "runtime.tools.batch_call",
    "accepted_targets": ["selection_ids", "target_ids", "property_targets"],
    "atomicity": "per_target",
    "error_policy": "collect_and_report",
    "history_policy": "single_trace_multi_events",
    "coalescing": "gesture_or_tx_boundary"
  }
}
```

Contrat d'entree batch recommande:

```jsonc
{
  "tool_id": "ui.capture.import",
  "action": "pointer.click",
  "input": {
    "target_ids": ["atome_1", "atome_2"],
    "selection_ids": ["atome_1", "atome_2"],
    "params": {}
  }
}
```

Consequence pour ce chantier:

- il faut distinguer le batch comme mecanisme d'appel MCP du batch comme capacite semantique d'un tool;
- chaque tool critique devra declarer s'il implemente un mode native_multi_target ou sequenced_single_target;
- les tools de transformation et d'edition multi-cible devront converger vers un vrai contrat batch runtime.

## Avancement, post-traitement, et execution non bloquante

Tous les tools canoniques qui declenchent une operation longue, asynchrone, ou post-traitee doivent exposer un contrat d'avancement unifie.

Ce contrat couvre notamment:

- capture audio/video;
- import media;
- transcodage video;
- extraction audio;
- upload/download;
- synchronisation;
- generation, analyse, indexation, conversion, export, et toute operation differable.

Regles obligatoires:

1. Un tool ne doit pas cacher un post-traitement derriere un etat binaire actif/inactif.
2. Le runtime doit publier des evenements d'avancement machine-readables: queued, running, post_processing, completed, failed, cancelled.
3. Chaque evenement doit porter un trace_id, tool_id, action, job_id, phase, percent si disponible, label_key, detail technique optionnel, et resultat partiel ou final.
4. Le post-traitement doit etre decouple de l'interaction UI initiale quand il peut durer plus qu'un instant perceptible.
5. Quand le post-traitement est decouple, l'utilisateur doit pouvoir reutiliser le tool si cela ne viole pas les preconditions metier.
6. Les jobs concurrents doivent etre visibles et distinguables: un enregistrement termine peut convertir en arriere-plan pendant qu'un nouvel enregistrement est prepare.
7. Les operations non interruptibles doivent le declarer explicitement; les autres doivent exposer cancel, retry, dismiss, et open_result quand cela a du sens.
8. L'UI doit consommer l'etat runtime du job; elle ne doit pas simuler une progression locale sans source runtime.
9. Le rendu visuel doit rester lisible et coherent dans toutes les projections: bouton, palette, panel, footer, monitoring, MCP/AI feedback.
10. Un echec de post-traitement ne doit pas bloquer la ressource principale si elle existe deja: par exemple, une video enregistree doit rester visible meme si l'extraction audio echoue.

Etats minimaux:

- idle: aucune operation active.
- armed: tool pret ou latch arme.
- requesting_permission: attente permission systeme.
- recording: capture active.
- stopping: finalisation de capture.
- queued: job en file.
- processing: travail long en cours.
- post_processing: transcodage, extraction, indexation, upload, sync, ou autre suite technique.
- ready: resultat utilisable.
- degraded: resultat principal utilisable mais post-traitement partiel ou absent.
- failed: operation echouee.
- cancelled: operation annulee.

Bloc conceptuel minimal attendu:

```jsonc
{
  "progress": {
    "enabled": true,
    "runtime_surface": "runtime.jobs.watch",
    "event_surface": "runtime.events.progress",
    "job_id_strategy": "trace_id_plus_tool_action",
    "phases": ["queued", "running", "post_processing", "ready", "degraded", "failed"],
    "percent_policy": "best_effort",
    "concurrency": {
      "mode": "background_per_job",
      "reuse_tool_while_processing": true,
      "max_parallel_jobs": 2,
      "conflict_policy": "precondition_checked"
    },
    "controls": ["cancel", "retry", "dismiss", "open_result"],
    "outputs": ["job_id", "phase", "percent", "result", "warnings", "errors"]
  },
  "progress_ui": {
    "projection": "tool_progress_badge",
    "surfaces": ["button", "palette", "panel", "monitoring"],
    "visual_tokens": ["pending", "running", "success", "warning", "error"],
    "show_percent": "when_known",
    "show_phase_label": true,
    "avoid_blocking_primary_action": true
  }
}
```

Application directe au cas video Tauri:

- le bouton capture video doit indiquer capture active, arret, puis post-traitement;
- le transcodage video et l'extraction audio doivent devenir des jobs suivis;
- le preview video doit utiliser la ressource video des qu'elle est disponible;
- la piste audio native doit utiliser une ressource audio materialisee, pas decoder le conteneur video dans le chemin critique du Play;
- si l'audio cache est absent ou en erreur, l'etat doit etre degraded: video visible, audio indisponible, aucun freeze.

Consequence pour ce chantier:

- la sanitisation des tools doit inclure une SSOT d'etat et de progression;
- les tools media/capture sont le premier terrain d'application;
- le systeme de monitoring des tools doit afficher aussi les jobs actifs et post-traitements;
- une solution locale au record video ne doit pas court-circuiter ce contrat.

## Chainage, execution headless, et scheduling obligatoires

Tous les tools canoniques doivent etre composables en pipeline, invocables sans UI, et planifiables.

Regles obligatoires:

1. Tous les tools doivent etre chainables.
2. Tous les tools doivent pouvoir etre invoques programmatiquement sans aucune dependance a une projection UI.
3. Tous les tools doivent pouvoir etre actives par un systeme de scheduling ou de CRON, en appel unitaire ou en batch.
4. Le chainage doit reposer sur des sorties machine-readables stables: ids cibles, diffs, resultats, resume d'effet, erreurs normalisees.
5. Le scheduling doit reutiliser les memes entrypoints canoniques que UI, script, MCP et AI.
6. Un tool ne doit jamais exiger un DOM present pour executer sa logique metier.
7. Tout pre-requis UI doit etre degrade en parametre ou en resolution runtime headless explicite.
8. Les executions programmees doivent supporter idempotency_key, preconditions, audit, et timezone/trigger metadata quand necessaire.

Bloc conceptuel minimal attendu pour l'automation:

```jsonc
{
  "automation": {
    "mcp_mandatory": true,
    "headless": true,
    "chainable": true,
    "cron_capable": true,
    "preferred_entrypoint": "runtime.tools.call",
    "batch_entrypoint": "runtime.tools.batch_call",
    "schedule_entrypoints": ["runtime.tools.call", "runtime.tools.batch_call"],
    "outputs": ["effect_summary", "machine_events", "target_ids", "result"],
    "requires_ui_projection": false
  },
  "progress": {
    "enabled": true,
    "runtime_surface": "runtime.jobs.watch",
    "event_surface": "runtime.events.progress",
    "phases": ["queued", "running", "post_processing", "ready", "degraded", "failed"],
    "percent_policy": "best_effort",
    "concurrency": {
      "mode": "background_per_job",
      "reuse_tool_while_processing": true,
      "conflict_policy": "precondition_checked"
    },
    "controls": ["cancel", "retry", "dismiss", "open_result"],
    "outputs": ["job_id", "phase", "percent", "result", "warnings", "errors"]
  },
  "progress_ui": {
    "projection": "tool_progress_badge",
    "surfaces": ["button", "palette", "panel", "monitoring"],
    "visual_tokens": ["pending", "running", "success", "warning", "error"],
    "avoid_blocking_primary_action": true
  }
}
```

Chaque tool doit porter ou derivable sans ambiguite le bloc conceptuel suivant:

```jsonc
{
  "mcp": {
    "status": "expose_direct_runtime",
    "preferred_entrypoint": "runtime.tools.call",
    "batch_entrypoint": "runtime.tools.batch_call",
    "tool_name": "ui.capture.audio",
    "allowed_actions": ["pointer.click", "state.on", "state.off"],
    "audit_surface": "runtime.audit.list",
    "policy_surface": "AtomeAI.callTool",
    "source_layer": "atome_mcp_runtime_call"
  },
  "batch": {
    "mode": "sequenced_single_target",
    "entrypoint": "runtime.tools.batch_call",
    "accepted_targets": ["selection_ids", "target_ids"],
    "atomicity": "per_target",
    "error_policy": "collect_and_report",
    "history_policy": "single_trace_multi_events",
    "coalescing": "gesture_or_tx_boundary"
  },
  "automation": {
    "mcp_mandatory": true,
    "headless": true,
    "chainable": true,
    "cron_capable": true,
    "preferred_entrypoint": "runtime.tools.call",
    "batch_entrypoint": "runtime.tools.batch_call",
    "schedule_entrypoints": ["runtime.tools.call", "runtime.tools.batch_call"],
    "outputs": ["effect_summary", "machine_events", "target_ids", "result"],
    "requires_ui_projection": false
  },
  "progress": {
    "enabled": true,
    "runtime_surface": "runtime.jobs.watch",
    "event_surface": "runtime.events.progress",
    "phases": ["queued", "running", "post_processing", "ready", "degraded", "failed"],
    "percent_policy": "best_effort",
    "concurrency": {
      "mode": "background_per_job",
      "reuse_tool_while_processing": true,
      "conflict_policy": "precondition_checked"
    },
    "controls": ["cancel", "retry", "dismiss", "open_result"],
    "outputs": ["job_id", "phase", "percent", "result", "warnings", "errors"]
  },
  "progress_ui": {
    "projection": "tool_progress_badge",
    "surfaces": ["button", "palette", "panel", "monitoring"],
    "visual_tokens": ["pending", "running", "success", "warning", "error"],
    "avoid_blocking_primary_action": true
  }
}
```

Matrice minimale obligatoire a maintenir pendant la sanitisation:

| Tool canonique | Role | Statut MCP | Entrypoint canonique | Mode batch | Chainable | Headless | CRON | Action(s) MCP | Policy/Audit | Etat |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tool.main.capture | host palette capture | non_conforme | a refactorer vers runtime.tools.call | non_conforme | cible = oui | cible = oui | cible = oui | a clarifier | runtime.audit.list | host UI a decomposer ou contractualiser pour devenir invocable via MCP |
| ui.capture.audio | capture audio | expose_direct_runtime | runtime.tools.call | sequenced_single_target | oui | oui | oui | pointer.click, state.on, state.off | runtime.audit.list + AtomeAI.callTool si policy | contrat a enrichir |
| ui.capture.video | capture video | expose_direct_runtime | runtime.tools.call | sequenced_single_target | oui | oui | oui | pointer.click, state.on, state.off | runtime.audit.list + AtomeAI.callTool si policy | contrat a enrichir |
| ui.capture.preview | preview camera | expose_direct_runtime | runtime.tools.call | sequenced_single_target | oui | oui | oui | pointer.click, state.on, state.off | runtime.audit.list | contrat a enrichir |
| ui.capture.photo | capture photo | expose_direct_runtime | runtime.tools.call | sequenced_single_target | oui | oui | oui | pointer.click | runtime.audit.list | contrat a enrichir |
| ui.capture.import | import media | expose_direct_runtime | runtime.tools.call | native_multi_target | oui | oui | oui | pointer.click | runtime.audit.list + AtomeAI.callTool si policy | surface a confirmer en detail |
| ui.capture.screen | capture screen | expose_direct_runtime | runtime.tools.call | sequenced_single_target | oui | oui | oui | pointer.click, state.on, state.off | runtime.audit.list + AtomeAI.callTool si policy | surface a confirmer en detail |
| ui.capture.validation | validation capture | expose_direct_runtime | runtime.tools.call | native_multi_target | oui | oui | oui | pointer.click | runtime.audit.list | semantics a clarifier |

Progression minimale obligatoire pour la famille capture:

| Tool canonique | Operations longues | Progression attendue | Reutilisation pendant post-traitement | Etat degrade autorise |
| --- | --- | --- | --- | --- |
| ui.capture.audio | finalisation, ecriture, indexation, sync | recording, stopping, post_processing, ready/failed | oui si aucune capture audio active conflictuelle | oui: fichier present, indexation/sync echouee |
| ui.capture.video | finalisation, transcodage video, extraction audio, preview cache, sync | recording, stopping, post_processing, ready/degraded/failed | oui si la camera/source peut etre reacquise sans conflit | oui: video visible, audio cache absent |
| ui.capture.import | copie, normalisation, extraction metadata, thumbnails, sync | queued, processing, post_processing, ready/degraded/failed | oui avec jobs multiples | oui: asset importe, metadata incomplete |
| ui.capture.screen | capture, encodage, post-traitement, sync | recording, stopping, post_processing, ready/degraded/failed | oui selon permission/source | oui: capture presente, metadata incomplete |

Consequence pour ce chantier:

- la sanitisation ne doit pas seulement nettoyer les boutons;
- elle doit produire une cartographie explicite entre chaque tool critique et sa forme MCP canonique;
- tout tool sans correspondance MCP documentee reste incomplet, meme si son rendu UI est propre.

## Comparaison contrat vs implementation actuelle audio/capture

### Alignements deja presents

Points conformes ou partiellement conformes observes dans l'implementation actuelle:

1. Les tools capture sont invokes via un chemin runtime canonicalise.
   - capture.js appelle invokeToolGateway avec action pointer.click et source ui/capture.

2. Les handlers sont enregistres dans le systeme de tools runtime.
   - registerCaptureTool utilise registerUiAction, qui passe ensuite par defineTool puis persistToolInCanonicalRegistry.

3. Les labels passent deja par l'i18n.
   - capture.js utilise eveT(item.labelKey, item.defaultValue).

4. Les tools capture ont des tool_id stables et explicites.
   - ui.capture.audio, ui.capture.video, ui.capture.preview, ui.capture.photo, ui.capture.import, ui.capture.screen, ui.capture.validation.

5. La projection V2 dispose deja d'une factory commune pour les boutons.
   - tool_strip.js et button.js portent une base unifiee de rendu pour les tools projetes.

### Ecarts structurels constates

#### Ecart 1 - La definition capture reste locale, minimale, et specialisee

Constat:

- CAPTURE_TOOLS dans capture.js ne contient qu'un sous-ensemble de la definition documentaire attendue.
- On y trouve essentiellement key, labelKey, defaultValue, tool_id, et parfois action.
- Le manifeste complet attendu par la doc n'est pas porte explicitement a cet endroit: description, inputs, outputs, effects, history_class, contexts, style_token, size_mode, button_type, bindings normalises.

Impact:

- La source de verite reste trop pauvre pour servir de reference unique a tous les supports.
- La definition de tool est reconstituee a plusieurs endroits au lieu d'etre consommee comme un contrat complet.

#### Ecart 2 - Capture garde un chemin legacy menu local concurrent

Constat:

- capture.js continue d'utiliser menuApi / new_menu.add(...).
- Ce chemin reinjecte une definition locale de type tool avec touch, children, longPressAction, etc.

Impact:

- On a encore une dualite entre definition runtime canonique et definition menu legacy.
- Le menu ne consomme pas une definition complete issue d'une SSOT unique; il reconstruit une variante locale.

#### Ecart 3 - L'icone audio est explicitement neutralisee puis remplacee par un fallback generique

Constat:

- Dans le chemin menu capture, entry.icon est force a false.
- La normalisation d'icone dans ribbon/menu.js et projection/tool_strip.js remplace ensuite les valeurs vides/false-like par tool.svg.

Impact:

- Le tool audio peut afficher une icone generique au lieu de son icone metier.
- Cela viole le principe d'une seule source d'icone canonique et masque une definition incomplete par un fallback visuel.

#### Ecart 4 - Les capabilities et le risk level sont trop generiques cote capture

Constat:

- registerCaptureTool donne par defaut capabilities = ['ui.read'] et risk_level = LOW.
- Or les tools capture pilotent des permissions media, des enregistrements, des imports, et des effets applicatifs reels.

Impact:

- Le contrat security/policy est sous-exprime.
- La doc demande des capabilities et une policy explicites, mais la definition locale reste trop permissive ou trop vague.

#### Ecart 5 - La nomenclature et les attributs de compatibilite debordent dans le contrat visible

Constat:

- Le systeme manipule encore toolId et tool_id en parallele.
- Les selectors et les datasets ecoutent les deux conventions.

Impact:

- La compatibilite existe, mais elle a envahi le contrat public visible des boutons.
- Cela augmente la duplication, la fragilite des selectors, et la dette de migration.

#### Ecart 6 - La couche visuelle n'est pas encore completement alignee avec le contrat de singularite

Constat:

- Le renderer V2 est commun, mais certains choix de presentation restent portes par des donnees locales pauvres ou par des fallbacks.
- Exemple concret: icone generique, metadata technique en double, press-state code en dur, taille compacte rigide issue de tokens, et definitions partiellement recomposees selon le support.

Impact:

- La factory commune existe, mais le systeme global n'est pas encore suffisamment propre pour produire partout un resultat metier net et intentionnel.

#### Ecart 7 - Les interactions capture gardent un fort couplage DOM local

Constat:

- capture.js contient des listeners document-level et de nombreux resolvers de source DOM.
- Cette couche est melangee avec la logique d'invocation et la logique de session visuelle.

Impact:

- Une partie du comportement reste plus proche d'un outil specialise de surface que d'un tool strictement centre sur son contrat runtime.
- Cela rend les garanties de parite multi-support plus difficiles a tenir.

#### Ecart 8 - La correspondance explicite de chaque tool avec MCP n'est pas encore formalisee

Constat:

- Le document mentionne MCP comme surface cible, mais il ne formalisait pas jusqu'ici le mapping tool par tool.
- L'implementation capture expose des tool_id exploitables, mais pas encore une matrice stable et explicite du type:
  - quel tool est appelable via runtime.tools.call,
  - quel tool doit passer par AtomeAI pour policy,
  - quel tool n'est qu'un host UI et ne doit pas etre expose tel quel.

Impact:

- Le systeme peut paraitre "compatible MCP" sans que la correspondance exacte soit auditable.
- Cela ouvre la porte a des expositions incoherentes, a des appels MCP trop bas niveau, ou a des hosts UI exposes comme s'ils etaient des tools metier.

#### Ecart 9 - Le traitement par lots des tools n'est pas encore formule comme un contrat metier explicite

Constat:

- Le document mentionne runtime.tools.batch_call, mais cela ne suffisait pas a imposer une capacite batch tool par tool.
- Aucune section n'imposait encore qu'un tool multi-cible declare explicitement son statut batch, ses cibles acceptees, son atomicite, et sa politique d'erreur.

Impact:

- Le batch peut rester un simple transport MCP sans semantique stable cote tool.
- Les appelants risquent de boucler eux-memes sur les cibles, avec des comportements divergents entre UI, script, MCP, et AI.
- Les tools d'edition multi-atome risquent de rester incomplets tant que leur contrat batch n'est pas explicite.

#### Ecart 10 - Le chainage, l'execution programmatique headless, le scheduling, et l'usage MCP obligatoire pour tous les tools ne sont pas encore poses comme contrat universel

Constat:

- Le document ne posait pas encore de maniere assez stricte que tous les tools doivent etre utilisables par MCP.
- Le document ne posait pas non plus que tous les tools doivent etre chainables, invocables sans UI, et planifiables par CRON ou scheduler.

Impact:

- Un tool pourrait rester "bon" en UI tout en etant inutilisable en orchestration.
- Les pipelines MCP, les automatisations, et les executions planifiees resteraient des comportements ad hoc au lieu de devenir des invariants de plateforme.
- Les tools trop dependants du DOM ou d'un evenement visuel resteraient structurellement non conformes.

#### Ecart 11 - L'avancement et le post-traitement ne sont pas encore un contrat runtime de tool

Constat:

- Les operations longues peuvent se cacher derriere un bouton actif/inactif ou un log technique.
- Les post-traitements media comme transcodage video, extraction audio, upload, sync, et indexation peuvent bloquer l'experience ou echouer sans retour visuel clair.
- La reutilisation d'un tool pendant un post-traitement n'est pas formalisee.

Impact:

- L'utilisateur ne sait pas si l'outil travaille, a fini, est degrade, ou a echoue.
- Des operations couteuses peuvent etre placees dans le chemin critique de l'action suivante, comme le Play d'une video Tauri.
- Chaque outil risque de reinventer son propre indicateur de progression, avec des UI incoherentes et des etats non auditables.

Objectif de correction:

- Faire de l'avancement un contrat runtime transverse aux tools.
- Rendre les post-traitements visibles, non bloquants, annulables ou relancables quand possible.
- Permettre une degradation explicite: resultat principal utilisable, suite technique incomplete.

## Template canonique cible pour un tool conforme

Template cible a utiliser comme reference de convergence:

```jsonc
{
  "id": "tool.capture.audio",
  "type": "tool",
  "tool_key": "capture_audio",
  "schema_version": 2,
  "meta": {
    "name": "Capture Audio",
    "category": "capture",
    "description": "Start or stop audio capture from the active source.",
    "created_by": "system",
    "created_at": "2026-05-19T00:00:00.000Z",
    "updated_at": "2026-05-19T00:00:00.000Z"
  },
  "ui": {
    "icon": "./assets/images/icons/audio.svg",
    "label_key": "eve.capture.audio",
    "label_fallback": "audio",
    "style_token": "tool-default",
    "size_mode": "compact",
    "visual_type": "tool"
  },
  "behavior": {
    "button_type": "alternate",
    "actions": [
      "pointer.click",
      "state.on",
      "state.off"
    ],
    "effects": {
      "pointer.click": "persistent",
      "state.on": "ephemeral",
      "state.off": "ephemeral"
    },
    "history": {
      "mode": "auto",
      "coalesce_key": null
    }
  },
  "capabilities": {
    "contexts": ["project", "panel", "desktop", "mcp", "script"],
    "selection_required": false,
    "permissions": ["media.audio.capture"]
  },
  "bindings": {
    "pointer.click": "capture_audio.pointer.click",
    "state.on": "capture_audio.state.on",
    "state.off": "capture_audio.state.off"
  },
  "manifest": {
    "inputs": ["source", "project_id", "gesture", "permission_state"],
    "outputs": ["recording_state", "capture_result", "timeline_append"],
    "effects": ["media_capture", "timeline_mutation", "ui_feedback"],
    "history_class": "persistent",
    "risk_level": "MEDIUM"
  },
  "runtime": {
    "execution_mode": "v2_registered_handler",
    "handler_id": "ui.capture.audio"
  },
  "mcp": {
    "status": "expose_direct_runtime",
    "preferred_entrypoint": "runtime.tools.call",
    "batch_entrypoint": "runtime.tools.batch_call",
    "tool_name": "ui.capture.audio",
    "allowed_actions": ["pointer.click", "state.on", "state.off"],
    "audit_surface": "runtime.audit.list",
    "policy_surface": "AtomeAI.callTool",
    "source_layer": "atome_mcp_runtime_call"
  },
  "batch": {
    "mode": "sequenced_single_target",
    "entrypoint": "runtime.tools.batch_call",
    "accepted_targets": ["target_ids"],
    "atomicity": "per_target",
    "error_policy": "collect_and_report",
    "history_policy": "single_trace_multi_events",
    "coalescing": "gesture_or_tx_boundary"
  },
  "automation": {
    "mcp_mandatory": true,
    "headless": true,
    "chainable": true,
    "cron_capable": true,
    "preferred_entrypoint": "runtime.tools.call",
    "batch_entrypoint": "runtime.tools.batch_call",
    "schedule_entrypoints": ["runtime.tools.call", "runtime.tools.batch_call"],
    "outputs": ["effect_summary", "machine_events", "target_ids", "result"],
    "requires_ui_projection": false
  },
  "progress": {
    "enabled": true,
    "runtime_surface": "runtime.jobs.watch",
    "event_surface": "runtime.events.progress",
    "phases": ["queued", "running", "post_processing", "ready", "degraded", "failed"],
    "percent_policy": "best_effort",
    "concurrency": {
      "mode": "background_per_job",
      "reuse_tool_while_processing": true,
      "conflict_policy": "precondition_checked"
    },
    "controls": ["cancel", "retry", "dismiss", "open_result"],
    "outputs": ["job_id", "phase", "percent", "result", "warnings", "errors"]
  },
  "progress_ui": {
    "projection": "tool_progress_badge",
    "surfaces": ["button", "palette", "panel", "monitoring"],
    "visual_tokens": ["pending", "running", "success", "warning", "error"],
    "show_percent": "when_known",
    "show_phase_label": true,
    "avoid_blocking_primary_action": true
  }
}
```

Notes de conception:

- Le template cible doit etre aligne avec le registre V2 reel, pas seulement avec un ideal documentaire abstrait.
- Les champs peuvent etre stockes dans la structure attendue par la persistence canonique actuelle, mais ils doivent converger vers une semantique equivalente a ce manifeste.
- L'UI ne doit jamais devoir reinventer icon, label, button_type, action list, or history intent localement.

## Plan de renforcement et correction

### Phase A - Sanctionner la SSOT du tool

Objectif:

- Faire d'une definition unique et riche la source de verite pour chaque tool.

Taches:

- [ ] Inventorier tous les points d'entree qui definissent ou re-definissent un tool: registry, menu legacy, palette, projection, footer, finder, flower, MCP.
- [ ] Definir la shape canonique minimale obligatoire d'un tool V2 reellement persistable.
- [ ] Aligner la persistence runtime sur ce contrat minimal sans champ implicite reconstruit localement.
- [ ] Garantir qu'un support visuel consomme une definition, au lieu de la recomposer.
- [ ] Etablir pour chaque tool critique sa correspondance MCP explicite: statut, entrypoint, actions autorisees, audit, et policy.
- [ ] Etablir pour chaque tool critique son mode batch explicite: native_multi_target, sequenced_single_target, ou non_conforme.
- [ ] Etablir pour chaque tool critique son contrat d'automation explicite: MCP, chainage, headless, CRON.
- [ ] Etablir pour chaque tool critique son contrat de progression et post-traitement: phases, jobs, evenements, UI, annulation, retry, degradation, et reutilisation possible.

Critere de sortie:

- Une definition capture audio unique suffit a generer toutes ses projections sans ajout local obligatoire.

### Phase B - Supprimer les doubles definitions legacy

Objectif:

- Retirer les chemins menu/clone/projection qui bricolent un tool a partir d'un schema local incomplet.

Taches:

- [ ] Supprimer la dependance fonctionnelle a new_menu pour les tools V2 encore relies au capture path.
- [ ] Eliminer les definitions locales entry.icon = false qui provoquent des fallbacks generiques.
- [ ] Faire consommer la meme definition capture par menu, projection, finder, panel, et invocation runtime.

Critere de sortie:

- Plus aucun support ne reintroduit une definition capture partielle ou concurrente.

### Phase C - Corriger la couche visuelle et stylistique des tools

Objectif:

- Obtenir une UI de tools nette, intentionnelle, et strictement derivee du contrat metier.

Taches:

- [ ] Supprimer les icones generiques par fallback quand une icone metier est attendue.
- [ ] Nettoyer les attributs techniques exposes par duplication quand ils ne sont plus indispensables.
- [ ] Revoir le contrat de taille, rayon, label, pressed-state, et icon tint pour qu'il soit semantique et pas seulement opportuniste.
- [ ] Garantir que la factory commune rende le meme tool avec la meme identite visuelle dans tous les contextes.
- [ ] Ajouter un rendu canonique d'avancement des tools: badge, anneau, barre fine, phase textuelle courte, et etat degrade/erreur lisibles sans surcharger le bouton.
- [ ] Garantir que l'indicateur visuel lit les jobs runtime et non un timer local decoratif.

Critere de sortie:

- Un meme tool a la meme icone, le meme label, les memes etats, et la meme lisibilite visuelle partout.

### Phase D - Recentrer les APIs tools autour du runtime canonique

Objectif:

- Faire converger UI, MCP, AI, et script vers le meme contrat d'invocation et le meme audit.

Taches:

- [ ] Normaliser toutes les actions tools sur pointer.*, gesture.*, state.*, commit.
- [ ] Exposer les tools a MCP et AI via runtime.tools.list, runtime.tools.call, runtime.tools.batch_call quand la surface existe.
- [ ] Faire porter les capabilities, contextes, et risk levels par la definition canonique plutot que par des valeurs par defaut trop larges.
- [ ] Verifier que les handlers ne contiennent pas de mutation directe hors pipeline.
- [ ] Interdire qu'un tool canonique reste sans usage MCP stable.
- [ ] Interdire toute exposition MCP d'un host UI ou d'un helper legacy quand un tool runtime canonique existe deja.
- [ ] Interdire qu'un tool multi-cible laisse la logique de batch a la charge de l'appelant si une semantique runtime batch canonique est attendue.
- [ ] Interdire qu'un tool depende d'une projection UI pour etre execute programmatiquement ou par scheduler.
- [ ] Exposer les jobs et evenements d'avancement via le runtime, avec le meme trace_id que l'invocation du tool.
- [ ] Garantir que les post-traitements longs ne s'executent pas dans le chemin critique d'une action interactive suivante quand ils peuvent etre differes.

Critere de sortie:

- Le meme tool_id produit le meme comportement et le meme audit quel que soit l'entreepoint.

### Phase E - Sanctionner la modularite reelle

Objectif:

- Isoler proprement les responsabilites: contrat, runtime, projection, session visuelle, media domain, et compatibilite.

Taches:

- [ ] Sortir des fichiers specialises les resolvers DOM ou bridges qui ne relevent pas du contrat metier d'un tool.
- [ ] Separer clairement logique metier, orchestration runtime, et presentation visuelle.
- [ ] Reduire les fichiers qui melangent trop de couches si la sanitisation des tools y touche.
- [ ] Extraire les post-traitements longs dans une couche job/runtime partagee plutot que dans les handlers UI des tools.

Critere de sortie:

- Les fichiers tools critiques deviennent lisibles par responsabilite et n'ont plus besoin de fallbacks structurels.

## Ordre d'execution recommande dans ce chantier

- [ ] Etablir la matrice de verite: definition canonique attendue vs definition effectivement consommee par chaque support.
- [ ] Corriger en premier la famille capture, car elle expose a la fois les problemes de contrat, de legacy menu, d'icones, et d'API runtime.
- [ ] Integrer l'avancement et le post-traitement non bloquant dans la famille capture avant de generaliser aux autres tools.
- [ ] Generaliser ensuite la meme methode aux tools latch, palette, slider, finder, et panels.
- [ ] Terminer par les suppressions de compatibilite devenue inutile.

## Validations obligatoires pour ce chantier

- [ ] Verification documentaire: chaque tool critique a un contrat complet et unique.
- [ ] Verification registre: createTool / registerTool / registerUiAction convergent vers la meme semantique persistante sans definition parallele.
- [ ] Verification invocation: UI, projection, MCP, et script utilisent les memes actions canoniques.
- [ ] Verification correspondance MCP: chaque tool critique a un statut MCP explicite, un entrypoint unique, et aucune ambiguite entre runtime direct, AI policy, et host UI.
- [ ] Verification batch: chaque tool critique declare explicitement s'il traite ou non les cibles par lots, avec contrat de cibles, atomicite, et politique d'erreur.
- [ ] Verification automation: chaque tool critique est chainable, headless, et activable par scheduling/CRON via les memes entrypoints canoniques.
- [ ] Verification progression: chaque tool critique publie des evenements d'avancement runtime, expose les jobs actifs, et affiche un etat visuel coherent.
- [ ] Verification non-blocage: un post-traitement long n'empeche pas la reutilisation du tool quand les preconditions metier l'autorisent.
- [ ] Verification degradation: un resultat principal utilisable reste accessible meme si un post-traitement secondaire echoue.
- [ ] Verification visuelle: meme iconographie, meme label, meme style actif/inactif, meme comportement de latch ou momentary dans tous les contextes.
- [ ] Verification de non-regression: persistence, historique, et audit restent intacts apres simplification.

## Premier lot recommande

Le premier lot de correction a executer sur ce chantier doit couvrir exactement:

- l'audio capture;
- la palette capture qui le contient;
- la source d'icone canonique de ces tools;
- la matrice MCP explicite de la famille capture;
- la declaration batch explicite de la famille capture;
- la declaration explicite de leur chainage, usage headless, et activation CRON;
- la declaration explicite de leur progression, post-traitement, jobs non bloquants, degradation, retry/cancel, et rendu visuel d'avancement;
- la suppression de la definition menu locale qui force icon = false si une source canonique equivalente existe deja.

## Definition de termine pour ce chantier

Ce chantier ne pourra etre considere comme termine que lorsque les conditions suivantes seront vraies:

- tous les tools critiques sont definis depuis une SSOT complete;
- tous les tools critiques ont une correspondance MCP explicite et verifiable;
- tous les tools critiques ont un mode batch explicite et coherent avec leur metier;
- tous les tools critiques sont chainables, headless, et activables via scheduling/CRON;
- tous les tools critiques exposent un contrat d'avancement et de post-traitement verifiable;
- les operations longues sont suivies comme jobs runtime, visibles dans l'UI, et non bloquantes quand le domaine le permet;
- aucun support UI ne reconstruit une variante metier locale d'un tool;
- les icones et labels proviennent d'une source unique et explicite;
- les chemins legacy de compatibilite restants sont borner, documentes, et limites a une migration residuelle strictement necessaire;
- les tests de persistance, runtime, projection, et parite visuelle sont en place sur les familles de tools critiques.
