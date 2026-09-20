# Record actions Naturel, Page conteneur, Placeholders, Templates — 19 sept. 2026

## Demande
1. Record actions en mode Naturel (déplacements, agrandissements…) + bouton Lecture ; accès
   depuis le menu principal (palette rec.) et le Flower pour enregistrer même sur le bureau.
2. Outil Page (Create) : une vraie page, conteneur à débordement masqué (invisible hors
   édition, semi-visible en édition).
3. Palette Placeholder (Create) : texte, vidéo, audio, photo, image, forme.
4. Lecture temps réel ou « one shot » (état final) ; templates instanciables au clic.

**Arbitrage (le « challenge »)** : un seul enregistreur. « En template » est une action sur
la prise : le template = les atomes NÉS pendant la prise, dans leur état final, en relatif.
L'instancier est une duplication canonique du sous-arbre, pas un rejeu d'actions (les ids,
parents et timelines sont remappés ; les placeholders restent des placeholders).

## Lots
- [x] C — Page conteneur
- [x] D — Placeholders
- [x] A — Capture spatiale Naturel + Lecture
- [x] B — Menu principal (rec. > Actions / Relire) + Flower (bureau)
- [x] E — Templates

## Fait

### C — Page
- Diagnostic : l'outil créait un `group` transparent, non cliquable (`render_atom.js`), dont le
  cadre était remplacé par l'union des membres ; `overflow:'hidden'` n'était lu par personne.
- `page_container_projection.js` : `container_kind:'page'` ; la page garde son cadre ; chaque
  descendant reçoit `clip` = intersection des pages ancêtres (clip absolu déjà porté jusqu'à
  `clip.rs`, aucune modif Rust) ; en édition, pas de clip et 4 voiles `__eve_page_veil:`.
  Re-projection sur `eve:atome-contextual-edit-changed`.
- `page_container_drop.js` : un dépôt libre sur une page y range l'objet par l'insertion
  canonique (`combineCanonicalMolecule`, mode simultané) ; pas de palette de composition.
- Picking : la partie découpée d'un membre ne capte plus le pointeur (`scene_graph.js`).
- Redimensionner une page ne déforme pas son contenu ; la déplacer l'emporte.

### D — Placeholders
- `placeholder_creation_runtime.js` : palette `create_placeholder` (accent hérité de `create`),
  un outil direct `ui.placeholder.create` ; un clic = un emplacement, rangé dans la page sous
  le point. Média : `mediaPlaceholderCreateSpec` (écrase la démo du preset).
- `project_view_placeholder_fill.js` : toucher un emplacement photo = prise de vue sur la même
  ligne ; texte = l'invite s'efface et l'édition continue ; forme = devient une forme ordinaire.
- Menu Create : Placeholder et Template sont des outils « directs » de la famille Create
  (exclusifs avec Texte/Dessin/Code/Page) ; changer d'enfant change le choix sans désarmer.

### A — Capture Naturel + Lecture
- `natural_action_journal.js` : écoute `atome:changed` (valeurs) + trames de geste observées à
  la source (`setProjectSceneGestureFrameObserver`, ~30 Hz, coût nul hors prise) ; instantané de
  départ de la scène ; créations détectées ; ignore projet, autre projet, relectures.
- `natural_action_capture.js` : la prise est rangée sur l'hôte (`action_recording`).
- `natural_action_replay_runtime.js` : temps réel = sur la PROJECTION seule (rien n'est écrit
  pendant la lecture), puis l'état final est garanti par commit canonique (seuls les écarts),
  sous `withActionRecordingSuppressed` ; one shot = état final d'un coup.
- Rail Naturel (`natural_action_rail.js`) : Record + « Relire » (appui long : Temps réel / État
  final / En template), Relire absent sans prise. Famille d'accent `natural` ajoutée (sinon le
  rail entier ne monte plus).

### B — Menu rec. + Flower
- `action_recording_tools.js` : outils de passerelle `ui.record.actions`, `.replay`, `.template`
  (définis au catalogue) ; entrées `record_actions` + palette `capture_actions` (Relire) dans rec.
  (`main_menu_action_recording_content.js`) ; `record_actions` dans le Flower du bureau.

### E — Templates
- `template_creation_runtime.js` : stockés dans `action_templates` du record PROJET (jamais
  rendu) ; palette Create > Template dynamique (templates du projet + autres projets), absente
  sans template ; un clic = une instance au point.

### Bugs trouvés en route (par l'app réelle, pas par les probes Node)
- `createAtome` redimensionne à sa politique d'axe max : une page dessinée 400×300 naissait
  333×250. Le cadre dessiné est réécrit après création (page et placeholders).
- **Bug existant** : tout rechargement du projet (`loadProjectAtomes(force)`, p. ex. après une
  duplication) restaure le mode de vue et émet « mode changé » même inchangé → le rail arrêtait
  TOUS les outils de création. L'écouteur n'arrête plus que sur un vrai changement de mode.

- Outil armé, un clic sur le menu Bevy (même canevas que la scène) était avalé par
  l'intercepteur de création : « Créer » ne répondait plus. `surface_ui_pointer.js` laisse
  passer les pressions sur l'UI Bevy (Page, Placeholder, Template) ; la Page n'avale plus un
  relâchement sans geste en cours.
- R4 du ruban : « Créer » éteint l'outil verrouillé en invoquant l'enfant actif — ici la
  palette imbriquée, qui n'avait ni `tool_id` ni `extra_input` : le clic tombait dans le vide.
  Les palettes Placeholder et Template portent désormais leur outil (comme `draw_create`).

## Vérification
- `temp/page_container_clip.probe.mjs`, `temp/placeholder_create.probe.mjs`,
  `temp/natural_record_replay.probe.mjs`, `temp/template_instantiate.probe.mjs` : OK ;
  mutations (exception page retirée / observateur de trames retiré / suppression retirée) → rouge.
- `temp/record_page_link_check.mjs` : 35/35 modules liés en ESM.
- **App réelle** `temp/record_page_placeholder_ui.probe.mjs` (Playwright, serveur 3001, vrais
  gestes souris) : 15/15, zéro erreur console. Page créée par glisser, voile en édition, dépôt
  débordant, découpe hors édition ; placeholder vidéo posé dans la page ; Record depuis l'outil
  rec. > Actions, page glissée + texte créé pendant la prise (95 événements) ; relecture temps
  réel `300 → 368 → 400 → 420` ; one shot ; template listé dans Create et instancié 2 fois.
  PNG dans `temp/probe_reports/record_page_placeholder_ui/`.
  Étape menu (vrais clics Bevy) : Créer > Placeholder > Audio arme l'outil, un clic canevas
  pose un emplacement, l'outil reste armé pour un 2e clic, « Créer » le désarme ; rec. >
  Actions démarre la prise, « rec. » l'arrête. Total : 21/21, zéro erreur console.

## Restes (non vérifiés à l'écran)
- Le Flower du bureau (appui long) : l'entrée `record_actions` y est déclarée, pas cliquée.
- Toucher un placeholder texte / forme / photo dans l'app (vérifié en Node seulement).
- Un atome né pendant la prise puis effacé est recréé par duplication (nouvel id) au one shot.
