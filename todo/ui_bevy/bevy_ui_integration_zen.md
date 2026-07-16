# Pourquoi utiliser Bevy UI plutôt qu’un système UI maison

Status: Specification

## Décision recommandée

Pour ton application Bevy + Tauri, il est préférable d’utiliser **Bevy UI comme fondation principale** plutôt que de continuer à développer toute l’interface avec un code maison bas niveau.

La recommandation n’est pas d’utiliser Bevy UI naïvement partout, ni de dépendre directement de chaque widget expérimental. La bonne stratégie est :

```text
Bevy UI
  -> surcouche Zen UI maison
    -> composants applicatifs stables
      -> écrans et modules de ton app
```

Autrement dit :

```text
Bevy UI = moteur de layout, interaction, texte, structure UI
Zen UI maison = identité visuelle, composants avancés, règles de design
Code manuel = zones graphiques spéciales seulement
```

Cette approche est plus solide qu’un système 100 % maison, surtout pour une application ambitieuse qui va évoluer sur beaucoup de domaines.

---

## 1. Le problème du code UI maison

Un système UI maison semble léger au début parce que tu écris exactement ce dont tu as besoin. Mais dès que l’application grossit, tu dois recréer des couches entières normalement fournies par un système UI.

Tu finis par devoir gérer toi-même :

```text
layout
alignement
redimensionnement
hiérarchie parent/enfant
scroll
clipping
z-index
focus
hover
pressed
disabled
drag
input texte
navigation clavier
gestion souris/touch
états visuels
thèmes
polices
images
icônes
responsive
fenêtres/panels
reconstruction/destruction d’écrans
optimisation des listes longues
```

Au départ, cela ressemble à du contrôle. À long terme, cela devient un framework UI incomplet que tu dois maintenir seul.

Le danger n’est pas seulement le temps de développement. Le danger est architectural : chaque nouveau besoin oblige à modifier la base du système maison.

---

## 2. Pourquoi Bevy UI est plus économique à long terme

Bevy UI fournit déjà les briques fondamentales nécessaires :

```text
Node
Text
Button
ImageNode
BackgroundColor
BorderColor
BorderRadius
BoxShadow
Overflow
ScrollPosition
ZIndex
GlobalZIndex
UiTransform
UiScale
```

Ces briques ne sont pas seulement visuelles. Elles s’intègrent dans l’ECS de Bevy, donc elles peuvent être pilotées par des composants, des ressources, des états et des systèmes.

Bevy UI utilise des modèles de layout proches de Flexbox et CSS Grid. C’est important parce que tu peux construire des interfaces complexes sans repositionner manuellement chaque élément.

Exemples :

```text
sidebar
topbar
panels
listes
accordéons
vues calendrier
grilles
formulaires
contrôles audio/graphique
sections repliables
dashboards
```

Avec un système maison, tu dois écrire toi-même la logique de layout. Avec Bevy UI, tu concentres ton énergie sur tes composants métier.

---

## 3. Bevy UI n’empêche pas une identité visuelle forte

Utiliser Bevy UI ne veut pas dire que ton app ressemblera à une interface générique.

Bevy UI est une fondation. Le style reste à toi.

Tu peux construire une interface Zen :

```text
peu de bruit visuel
peu de popups
peu de menus parasites
contrôles calmes
animations sobres
sliders avancés
boutons rotatifs
panneaux repliables
calendrier minimal
grands espaces
hiérarchie claire
```

Le bon modèle est de créer tes propres composants :

```text
ZenButton
ZenIconButton
ZenSlider
ZenKnob
ZenFader
ZenToggle
ZenAccordion
ZenPanel
ZenCalendar
ZenList
ZenInput
ZenSegmentedControl
```

Ces composants peuvent utiliser Bevy UI en interne, mais ton application ne dépend que de ton API maison.

---

## 4. Bevy UI réduit la dette technique

### Avec du code maison

Chaque fonctionnalité demande souvent du code bas niveau :

```text
bouton
hover
click
pressed
disabled
focus
animation
layout
texte
icône
accessibilité
```

Tu risques de dupliquer les mêmes patterns dans plusieurs modules.

### Avec Bevy UI

Tu peux factoriser :

```text
état interactif
style
thème
layout
input
events
affichage
```

Dans une app qui va beaucoup évoluer, la dette technique vient moins du poids du binaire que du poids mental du système. Une UI maison grossit vite en complexité invisible.

---

## 5. Bevy UI est plus adapté au modèle ECS

Tu utilises déjà Bevy. Donc ton application repose probablement sur :

```text
Components
Resources
Events
States
Systems
Plugins
Commands
Assets
```

Une UI maison séparée risque de créer deux mondes :

```text
monde Bevy ECS
monde UI maison
```

Cela complique les échanges :

```text
état de l’application -> UI
UI -> commandes métier
UI -> rendu
UI -> assets
UI -> input
```

Bevy UI évite cette séparation. L’UI devient une partie normale de ton application ECS.

Exemple :

```text
SelectedDate
CalendarViewMode
ZenTheme
ActiveTool
SelectedLayer
AudioParameter
CurrentProject
```

Ces états peuvent directement piloter les composants UI.

---

## 6. Une meilleure gestion de l’ajout et retrait de fonctionnalités

Pour une application ambitieuse, il faut pouvoir ajouter et retirer des modules sans casser l’interface.

Bevy UI fonctionne bien avec une architecture par plugins :

```text
CoreUiPlugin
CalendarUiPlugin
AudioUiPlugin
GraphicsUiPlugin
SettingsUiPlugin
ExportUiPlugin
```

Chaque plugin peut déclarer :

```text
ses composants
ses systèmes
ses écrans
ses assets
ses événements
ses styles spécifiques
```

Puis tu actives seulement ce qui est nécessaire selon le profil de build.

Exemple :

```rust
pub fn register_ui_modules(app: &mut App) {
    app.add_plugins(CoreUiPlugin);

    #[cfg(feature = "calendar")]
    app.add_plugins(CalendarUiPlugin);

    #[cfg(feature = "audio")]
    app.add_plugins(AudioUiPlugin);

    #[cfg(feature = "graphics")]
    app.add_plugins(GraphicsUiPlugin);

    #[cfg(feature = "export")]
    app.add_plugins(ExportUiPlugin);
}
```

Cette structure est plus propre qu’un gros fichier UI maison qui accumule toutes les fonctionnalités.

---

## 7. Bevy UI permet une gestion économique des ressources

Une bonne intégration Bevy UI ne signifie pas que tout doit être actif en permanence.

Tu peux choisir entre plusieurs stratégies :

| Besoin | Stratégie |
|---|---|
| Élément temporairement invisible | `Display::None` ou équivalent |
| Écran rarement utilisé | despawn complet |
| Liste très longue | virtualisation |
| Module rarement utilisé | plugin séparé / feature Cargo |
| Asset lourd | chargement à la demande |
| Animation inactive | système conditionné par état |
| Widget désactivé | composant `Disabled` ou état maison |
| Vue inactive | système non exécuté |

Le point important : **l’économie de ressources vient de l’architecture**, pas du fait de tout coder à la main.

Un système maison mal structuré peut consommer plus qu’un Bevy UI bien organisé.

---

## 8. Les features Cargo ne sont pas un problème si elles sont maîtrisées

Bevy permet d’activer ou désactiver des fonctionnalités avec les features Cargo.

Il faut éviter :

```toml
bevy = "0.19"
```

pour une app sérieuse et sensible au poids.

Il vaut mieux partir sur :

```toml
bevy = { version = "0.19", default-features = false, features = [
    "2d",
    "ui"
] }
```

Puis ajouter seulement ce dont l’app a besoin.

Selon le projet, tu peux prévoir plusieurs profils :

```toml
[features]
default = ["desktop"]

desktop = [
    "ui_core",
    "calendar",
    "graphics"
]

light = [
    "ui_core"
]

pro = [
    "ui_core",
    "calendar",
    "graphics",
    "audio",
    "export"
]

ui_core = []
calendar = []
graphics = []
audio = []
export = []
```

Cela ne donne pas du chargement dynamique comme JavaScript, mais cela permet de produire plusieurs builds maîtrisés.

---

## 9. Pourquoi le “tout manuel” n’est pas forcément plus léger

C’est une erreur fréquente :

```text
moins de dépendance = forcément plus léger
```

Ce n’est pas toujours vrai.

Un code maison peut être plus petit au début, mais il peut vite devenir lourd parce qu’il recrée :

```text
layout
input
scroll
focus
widgets
animations
cache
calculs de taille
texte
états interactifs
```

Bevy UI mutualise déjà ces mécanismes dans le moteur. Si tu utilises déjà Bevy pour le rendu et l’input, Bevy UI s’inscrit dans une infrastructure déjà présente.

Le vrai coût mémoire d’une grosse app vient souvent davantage de :

```text
textures
polices
images
audio
buffers GPU
documents ouverts
historique undo/redo
assets en cache
données projet
vues complexes
```

plutôt que de Bevy UI lui-même.

---

## 10. Quand le code maison reste justifié

Il ne faut pas tout confier à Bevy UI.

Le code manuel reste pertinent pour les zones spéciales :

```text
knobs circulaires très graphiques
sliders audio avancés
waveforms
timeline
éditeur nodal
canvas créatif
viewport 2D/3D
graphiques animés
visualiseur audio
courbes
effets shader
rendu très dense
```

La bonne séparation :

```text
UI structurelle -> Bevy UI
UI interactive standard -> Bevy UI + composants Zen
UI graphique spéciale -> rendu custom
```

Exemple :

```text
sidebar       -> Bevy UI
calendrier    -> Bevy UI
accordéon     -> Bevy UI
liste         -> Bevy UI
slider simple -> Bevy UI
knob premium  -> composant custom dans Bevy
waveform      -> rendu custom
timeline      -> mix Bevy UI + rendu custom
```

---

## 11. Risques de Bevy UI

Bevy UI n’est pas parfait. Les principales limites sont :

```text
moins mature que HTML/CSS
moins de widgets prêts à l’emploi
certains widgets haut niveau encore expérimentaux
moins d’outillage visuel
moins naturel pour texte riche
animations UI à architecturer soi-même
accessibilité à tester sérieusement
effets type backdrop blur à faire en custom
```

Donc il ne faut pas dépendre directement de tous les widgets fournis par Bevy.

La bonne approche :

```text
ne pas exposer Bevy UI directement dans toute l’app
ne pas utiliser Feathers comme API produit stable
ne pas coder les écrans en style brut partout
créer une couche Zen UI stable
```

---

## 12. Architecture recommandée

Structure possible :

```text
src/
  ui/
    mod.rs
    theme.rs
    style.rs
    tokens.rs
    interaction.rs
    layout.rs
    animation.rs

    widgets/
      button.rs
      icon_button.rs
      slider.rs
      knob.rs
      toggle.rs
      panel.rs
      accordion.rs
      list.rs
      input.rs
      calendar.rs

    screens/
      home.rs
      calendar.rs
      settings.rs
      editor.rs

    modules/
      calendar_ui.rs
      audio_ui.rs
      graphics_ui.rs
      export_ui.rs
```

Principe :

```text
les écrans n’utilisent pas directement les détails Bevy UI
les écrans utilisent les composants Zen UI
Zen UI encapsule Bevy UI
les modules peuvent être activés/désactivés proprement
```

---

## 13. Exemple de composant Zen UI

Au lieu d’écrire directement partout :

```rust
commands.spawn((
    Node { ... },
    BackgroundColor(...),
    BorderRadius(...),
    Button,
));
```

Créer une fonction ou un bundle maison :

```rust
commands.spawn(zen_button("Valider", ZenButtonKind::Primary));
```

Ou :

```rust
ZenButton::primary("Valider")
    .with_icon("check")
    .with_action(AppAction::Validate)
    .spawn(&mut commands, &theme);
```

L’objectif : si Bevy change une API ou si ton style évolue, tu modifies `ZenButton`, pas 200 écrans.

---

## 14. Stratégie pour garder l’UI légère

### À faire

```text
désactiver les default features inutiles
organiser l’UI en plugins
monter/démonter les écrans avec les états
charger les assets lourds à la demande
virtualiser les longues listes
éviter de créer trop d’entités invisibles
limiter les effets coûteux
centraliser les thèmes
mutualiser les composants
conditionner les systèmes par état
```

### À éviter

```text
DefaultPlugins sans contrôle
tout garder en mémoire
un composant unique géant
des systèmes UI qui tournent tout le temps
des milliers d’entités pour des éléments invisibles
des ombres/flous partout
des clones inutiles d’assets
des styles copiés/collés
un framework maison parallèle à Bevy
```

---

## 15. Comparaison nette

| Critère | Bevy UI + Zen UI | Code maison total |
|---|---:|---:|
| Layout complexe | Bon | À développer |
| Maintenance long terme | Bonne si abstraction | Risquée |
| Ajout de composants | Structuré | De plus en plus coûteux |
| Intégration ECS | Native | À créer |
| Input / interaction | Déjà partiel | À créer |
| Scroll / clipping | Déjà disponible | À créer |
| Texte | Déjà intégré | À créer |
| Personnalisation visuelle | Très bonne | Totale |
| Taille initiale | Potentiellement plus grande | Potentiellement plus petite |
| Dette technique | Contrôlable | Forte à long terme |
| Risque de réinventer un framework | Faible | Très élevé |
| Contrôle absolu | Moyen à élevé | Très élevé |
| Vitesse d’évolution | Bonne | Mauvaise à long terme |

---

## 16. Décision finale

Il est nécessaire d’utiliser Bevy UI non pas parce que Bevy UI est parfait, mais parce qu’une grosse application ne peut pas durablement reposer sur une interface entièrement manuelle.

Le code maison doit être réservé aux composants à forte valeur artistique ou technique :

```text
knobs
sliders avancés
visualiseurs
timelines
canvas
effets spéciaux
```

Mais la structure générale de l’app doit reposer sur Bevy UI :

```text
layout
écrans
panels
listes
boutons
texte
grilles
scroll
accordéons
navigation
états
```

La meilleure architecture est donc :

```text
Bevy UI comme fondation
Zen UI comme design system maison
rendu custom pour les éléments signature
features Cargo pour les variantes de build
plugins Bevy pour ajouter/retirer les modules
assets dynamiques pour éviter de tout charger
```

Conclusion :

```text
Ne construis pas ton propre framework UI complet.
Construis ton propre design system au-dessus de Bevy UI.
```

C’est le compromis le plus robuste entre performance, évolutivité, maîtrise visuelle et coût de maintenance.

---

## Références techniques

- Bevy UI documentation : `Node`, `Text`, `Button`, `ImageNode`, Flexbox et CSS Grid  
  https://docs.rs/bevy/latest/bevy/ui/index.html

- Bevy UI Widgets : widgets headless comme buttons, checkboxes et sliders  
  https://docs.rs/bevy/latest/bevy/ui_widgets/index.html

- Bevy 0.19 : support upstream de `EditableText`, améliorations UI et Feathers  
  https://bevy.org/news/bevy-0-19/

- Bevy Cargo features : usage de `default-features = false`, profils `2d`, `3d`, `ui`  
  https://github.com/bevyengine/bevy/blob/main/docs/cargo_features.md

- Cargo features Rust : fonctionnement de `default-features = false`  
  https://doc.rust-lang.org/cargo/reference/features.html




# Intégration Bevy UI — architecture Zen, économique et modulaire

**Contexte visé :** application Bevy + Tauri, UI migrée progressivement depuis HTML/JS vers Bevy UI, avec une interface volontairement calme, peu bavarde, sans dépendre d’un système de tooltips/popovers permanent.

**Hypothèse technique :** Bevy `0.19.x`. Les exemples de code doivent être adaptés si ton projet cible une autre version.

---

## 1. Décision d’architecture

La stratégie conseillée est :

```text
Bevy UI comme fondation technique
+ design system Zen maison
+ composants applicatifs maison
+ fonctionnalités activables par composants ECS
+ écrans montés/démontés selon état
+ assets chargés à la demande
+ modules lourds hors UI core
```

À éviter :

```text
UI 100 % manuelle partout
UI directement codée en primitives Bevy dans tous les écrans
DefaultPlugins sans contrôle
widgets expérimentaux Bevy exposés partout dans le code métier
plugins dynamiques Rust/WASM comme base de modularité
```

Le cœur de l’idée : **tu compiles un noyau stable**, mais tu ne gardes pas tout vivant en mémoire. Les fonctionnalités sont découpées en plugins, composants, ressources et écrans montables.

---

## 2. Principes de conception

### 2.1 Bevy UI ne doit pas être ton API produit

Ton code applicatif ne doit pas manipuler directement partout :

```rust
Node
BackgroundColor
BorderColor
BorderRadius
UiRect
Val::Px
Text
Button
```

Il doit manipuler tes composants :

```rust
ZenButton
ZenSlider
ZenKnob
ZenPanel
ZenAccordion
ZenCalendar
ZenList
ZenToggle
```

Cela permet de changer la technologie interne plus tard sans casser tout le produit.

---

### 2.2 Tout widget doit être composable

Un contrôle UI ne doit pas être une grosse entité magique. Il doit être une composition de composants ECS.

Exemple :

```rust
ZenKnob
ValueControl
DragValueControl
WheelValueControl
KeyboardAdjustable
ResettableValue
ZenStyleToken
DirtyVisual
```

Tu peux ainsi ajouter ou retirer des comportements sans recréer le widget.

Exemple mental :

```rust
// Knob simple
commands.spawn((
    ZenKnob,
    ValueControl::normalized(0.5),
    DragValueControl::vertical(),
));

// Plus tard : activation de la molette
commands.entity(knob).insert(WheelValueControl::default());

// Plus tard : retrait de la molette
commands.entity(knob).remove::<WheelValueControl>();
```

C’est une des forces de Bevy : **le comportement vient des composants présents**, pas d’une classe héritée figée.

---

### 2.3 UI Zen : pas de bruit par défaut

Dans ton core UI, ne mets pas :

```text
tooltip global
popover automatique
menu contextuel partout
surcouche d’aide envahissante
micro-animations permanentes
```

À la place :

```text
libellés courts
panneaux latéraux calmes
mode édition explicite
feedback visuel minimal
raccourcis clavier
clic long si nécessaire
status strip discret
valeur affichée seulement quand utile
```

Tu peux toujours implémenter un système de popover plus tard, mais il ne doit pas être une dépendance du design system de base.

---

## 3. Découpage Cargo recommandé

### 3.1 Dépendance Bevy contrôlée

Ne pars pas sur :

```toml
bevy = "0.19"
```

Pars plutôt sur une sélection explicite :

```toml
[dependencies]
bevy = { version = "0.19", default-features = false, features = [
    "ui"
] }
```

Si ton app a aussi une scène 2D importante :

```toml
[dependencies]
bevy = { version = "0.19", default-features = false, features = [
    "2d"
] }
```

Si tu as besoin de 3D seulement dans une version avancée :

```toml
[dependencies]
bevy = { version = "0.19", default-features = false, features = [
    "2d"
] }
```

Puis tu crées une feature produit séparée :

```toml
[features]
default = ["desktop"]

desktop = [
    "ui-core",
    "calendar",
    "controls-advanced",
]

web-light = [
    "ui-core",
]

pro = [
    "ui-core",
    "calendar",
    "controls-advanced",
    "audio-tools",
    "graphics-tools",
    "video-tools",
]

ui-core = []
calendar = []
controls-advanced = []
audio-tools = []
graphics-tools = []
video-tools = []
```

> Les features Cargo servent à produire plusieurs builds. Elles ne sont pas un système de chargement dynamique à l’exécution.

---

### 3.2 Profils de build

Ajoute un profil dédié WASM :

```toml
[profile.wasm-release]
inherits = "release"
opt-level = "s"
strip = "debuginfo"
lto = "thin"
codegen-units = 1
```

Build :

```bash
cargo build \
  --profile wasm-release \
  --target wasm32-unknown-unknown \
  --no-default-features \
  --features web-light
```

Optimisation post-build :

```bash
wasm-opt -Os -o app.opt.wasm app.wasm
```

Mesure toujours :

```bash
ls -lh app.wasm app.opt.wasm
gzip -k9 app.opt.wasm
brotli -f app.opt.wasm
```

Ne décide pas au ressenti. Mesure la taille brute, gzip, brotli, le temps de démarrage, la mémoire JS/WASM et la mémoire GPU.

---

## 4. Organisation du projet

Structure conseillée :

```text
crates/
  app_core/
    src/
      lib.rs
      app_state.rs
      feature_flags.rs
      commands.rs
      events.rs

  zen_ui/
    src/
      lib.rs
      plugin.rs
      theme.rs
      tokens.rs
      lifecycle.rs
      interaction.rs
      dirty.rs
      layout.rs
      registry.rs
      widgets/
        button.rs
        toggle.rs
        slider.rs
        knob.rs
        fader.rs
        panel.rs
        accordion.rs
        list.rs
        input.rs

  module_calendar/
    src/
      lib.rs
      plugin.rs
      model.rs
      systems.rs
      widgets/
        calendar_root.rs
        month_view.rs
        week_view.rs
        day_view.rs
        event_chip.rs

  module_audio/
  module_graphics/
  module_video/

src-tauri/
  src/
    commands.rs
    sidecars.rs
```

Objectif :

```text
app_core       = logique globale stable
zen_ui         = toolkit UI maison
module_*       = fonctionnalités applicatives
src-tauri      = calculs lourds / accès natif / fichiers / sidecars
```

---

## 5. Plugin principal UI

### 5.1 Plugin racine

```rust
use bevy::prelude::*;

pub struct ZenUiPlugin;

impl Plugin for ZenUiPlugin {
    fn build(&self, app: &mut App) {
        app
            .init_resource::<ZenTheme>()
            .init_resource::<UiFeatureFlags>()
            .init_resource::<UiRegistry>()
            .add_plugins((
                ZenInteractionPlugin,
                ZenControlsPlugin,
                ZenLayoutPlugin,
                ZenLifecyclePlugin,
            ))
            .add_systems(Update, (
                apply_ui_feature_flags,
                update_dirty_visuals,
                sync_value_labels,
            ));
    }
}
```

Le plugin racine ne doit pas tout spawner. Il doit seulement installer :

```text
ressources globales
systèmes communs
comportements transversaux
registre UI
thème
contrôles de base
```

Les écrans et modules sont montés séparément.

---

### 5.2 Enregistrement conditionnel des modules

```rust
pub fn register_product_modules(app: &mut App) {
    app.add_plugins(ZenUiPlugin);

    #[cfg(feature = "calendar")]
    app.add_plugins(CalendarModulePlugin);

    #[cfg(feature = "controls-advanced")]
    app.add_plugins(AdvancedControlsPlugin);

    #[cfg(feature = "audio-tools")]
    app.add_plugins(AudioToolsPlugin);

    #[cfg(feature = "graphics-tools")]
    app.add_plugins(GraphicsToolsPlugin);

    #[cfg(feature = "video-tools")]
    app.add_plugins(VideoToolsPlugin);
}
```

Ce code donne trois niveaux :

```text
non compilé      -> feature Cargo absente
compilé dormant  -> plugin présent, mais écran non monté
monté actif      -> entités UI présentes et systèmes utiles actifs
```

---

## 6. Gestion du cycle de vie UI

### 6.1 États de vie recommandés

| État | Signification | Usage |
|---|---|---|
| `NotCompiled` | La feature Cargo n’est pas activée | Version light / web |
| `Registered` | Le plugin est ajouté, aucun écran visible | Module disponible |
| `Preloaded` | Assets critiques chargés ou handles créés | Écran bientôt utilisé |
| `Mounted` | Les entités UI existent | Écran préparé |
| `Visible` | L’écran participe au layout/rendu/input | Usage actif |
| `Hidden` | L’écran existe mais n’est pas visible | Retour rapide |
| `Disabled` | L’écran est ignoré par les queries standard | Parking contrôlé |
| `Unmounted` | Entités despawn | Libération ECS |
| `Unloaded` | Handles assets relâchés | Libération mémoire assets |

---

### 6.2 Quand cacher, désactiver ou despawn ?

| Technique | Coût mémoire | Coût CPU | Recommandation |
|---|---:|---:|---|
| `Display::None` | Garde les entités | Faible | Accordéons, panels fréquents |
| `Visibility::Hidden` | Garde les entités | Peut rester dans layout selon usage | Éléments temporairement invisibles |
| `Disabled` | Garde les entités | Évite les queries standard | Parking d’arbres UI entiers, avec prudence |
| `despawn()` | Libère les entités | Rebuild nécessaire | Écrans lourds ou rarement utilisés |
| Drop des handles assets | Libère assets quand plus référencés | Rechargement nécessaire | Assets lourds, modules rares |

Règle simple :

```text
si l’utilisateur peut rouvrir en moins de 2 secondes -> cacher
si l’écran est lourd et rarement utilisé -> despawn
si les systèmes ne doivent plus le voir -> Disabled
si les assets sont lourds -> drop des handles au teardown
```

---

### 6.3 Exemple : root d’écran montable

```rust
#[derive(Component)]
pub struct UiScreenRoot {
    pub screen: UiScreenKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum UiScreenKind {
    Home,
    Calendar,
    Settings,
    Audio,
    Graphics,
}
```

Spawn :

```rust
pub fn spawn_calendar_screen(mut commands: Commands) {
    commands.spawn((
        UiScreenRoot { screen: UiScreenKind::Calendar },
        Node {
            width: Val::Percent(100.0),
            height: Val::Percent(100.0),
            ..default()
        },
    ))
    .with_children(|parent| {
        // Header, sidebar, vue mois/semaine, etc.
    });
}
```

Despawn :

```rust
pub fn despawn_screen(
    mut commands: Commands,
    query: Query<Entity, With<UiScreenRoot>>,
) {
    for entity in &query {
        commands.entity(entity).despawn();
    }
}
```

Sur Bevy 0.19, `despawn()` despawn aussi les enfants dans les relations configurées pour despawn les descendants, dont `Children`. Si tu cibles une version plus ancienne, vérifie l’API exacte de despawn récursif.

---

## 7. États applicatifs et montage/démontage

### 7.1 État principal

```rust
#[derive(States, Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum AppMode {
    #[default]
    Boot,
    Home,
    Calendar,
    Editor,
    Settings,
}
```

Installation :

```rust
app.init_state::<AppMode>()
   .add_systems(OnEnter(AppMode::Calendar), spawn_calendar_screen)
   .add_systems(OnExit(AppMode::Calendar), despawn_calendar_screen)
   .add_systems(
       Update,
       update_calendar_interactions.run_if(in_state(AppMode::Calendar)),
   );
```

Les règles :

```text
OnEnter = spawn / preload / bind
Update + in_state = systèmes actifs uniquement quand nécessaire
OnExit = despawn / drop handles / cleanup
```

---

### 7.2 Sous-états UI

Pour une app riche, évite un seul énorme `AppMode`. Ajoute un sous-état UI :

```rust
#[derive(States, Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum UiMode {
    #[default]
    Normal,
    Editing,
    Dragging,
    ModalInput,
}
```

Usage :

```rust
app.init_state::<UiMode>()
   .add_systems(
       Update,
       knob_drag_system.run_if(in_state(UiMode::Normal).or(in_state(UiMode::Editing))),
   );
```

Cela évite d’avoir des systèmes de drag, d’édition ou de saisie actifs en permanence.

---

## 8. Gestion des fonctionnalités UI à l’exécution

### 8.1 Feature flags runtime

Les features Cargo décident ce qui est compilé. Les flags runtime décident ce qui est actif pour l’utilisateur.

```rust
#[derive(Resource, Default)]
pub struct UiFeatureFlags {
    pub calendar: bool,
    pub advanced_controls: bool,
    pub audio_tools: bool,
    pub graphics_tools: bool,
    pub video_tools: bool,
}
```

Composant de dépendance :

```rust
#[derive(Component, Clone, Copy, PartialEq, Eq)]
pub enum RequiresUiFeature {
    Calendar,
    AdvancedControls,
    AudioTools,
    GraphicsTools,
    VideoTools,
}
```

Système :

```rust
fn apply_ui_feature_flags(
    flags: Res<UiFeatureFlags>,
    mut query: Query<(&RequiresUiFeature, &mut Node)>,
) {
    if !flags.is_changed() {
        return;
    }

    for (required, mut node) in &mut query {
        let enabled = match required {
            RequiresUiFeature::Calendar => flags.calendar,
            RequiresUiFeature::AdvancedControls => flags.advanced_controls,
            RequiresUiFeature::AudioTools => flags.audio_tools,
            RequiresUiFeature::GraphicsTools => flags.graphics_tools,
            RequiresUiFeature::VideoTools => flags.video_tools,
        };

        node.display = if enabled {
            Display::Flex
        } else {
            Display::None
        };
    }
}
```

Ce système ne tourne réellement que lorsque `UiFeatureFlags` change.

---

### 8.2 Ajout/retrait de comportement par composants

Un bouton peut être seulement visuel :

```rust
commands.spawn((
    ZenButton,
    ZenStyleToken::Primary,
));
```

Puis devenir cliquable :

```rust
commands.entity(button).insert(Clickable {
    command: UiCommand::OpenCalendar,
});
```

Puis devenir toggle :

```rust
commands.entity(button).insert(Toggleable {
    value: false,
});
```

Puis perdre le comportement toggle :

```rust
commands.entity(button).remove::<Toggleable>();
```

Systèmes séparés :

```rust
fn clickable_system(query: Query<(&Clickable, &Interaction), Changed<Interaction>>) {
    // Seulement les entités avec Clickable sont concernées.
}

fn toggleable_system(query: Query<(&mut Toggleable, &Interaction), Changed<Interaction>>) {
    // Seulement les entités avec Toggleable sont concernées.
}
```

Avantage :

```text
pas d’énorme enum de comportement
pas de widget monolithique
pas de coût pour une fonctionnalité absente
ajout/retrait à chaud par insert/remove
```

---

## 9. Design system Zen

### 9.1 Tokens, pas styles copiés partout

```rust
#[derive(Resource)]
pub struct ZenTheme {
    pub spacing_xs: f32,
    pub spacing_sm: f32,
    pub spacing_md: f32,
    pub spacing_lg: f32,
    pub radius_sm: f32,
    pub radius_md: f32,
    pub radius_lg: f32,
    pub alpha_idle: f32,
    pub alpha_hover: f32,
    pub alpha_active: f32,
}
```

```rust
#[derive(Component, Clone, Copy)]
pub enum ZenStyleToken {
    Panel,
    SubtlePanel,
    PrimaryButton,
    GhostButton,
    SliderTrack,
    SliderThumb,
    KnobBody,
    KnobIndicator,
    CalendarCell,
    CalendarToday,
    CalendarEvent,
}
```

Un système applique le thème :

```rust
fn apply_style_tokens(
    theme: Res<ZenTheme>,
    mut query: Query<(&ZenStyleToken, &mut BackgroundColor), Or<(
        Changed<ZenStyleToken>,
        Changed<ZenThemeMarker>,
    )>>,
) {
    // Mapping token -> couleur/style.
}
```

Dans la pratique, marque plutôt les entités comme sales (`DirtyVisual`) quand le thème change, puis mets à jour uniquement ce qui doit l’être.

---

### 9.2 Ne pas animer tout

UI Zen : animations sobres.

À privilégier :

```text
fade court sur apparition/disparition
transition douce de valeur slider/knob
léger changement d’alpha au hover
chevron d’accordéon si nécessaire
scroll fluide
```

À éviter :

```text
rebond permanent
glow partout
ombres animées lourdes
flou temps réel sur grands panneaux
background animé permanent
```

---

## 10. Contrôles avancés : sliders et knobs

### 10.1 Modèle de valeur commun

Tous les contrôles numériques doivent partager un même modèle.

```rust
#[derive(Component, Clone, Copy)]
pub struct ValueControl {
    pub normalized: f32, // 0.0..1.0
    pub default: f32,
    pub min: f32,
    pub max: f32,
    pub curve: ValueCurve,
    pub step: Option<f32>,
}

#[derive(Clone, Copy)]
pub enum ValueCurve {
    Linear,
    Logarithmic,
    Exponential(f32),
    Bipolar,
    Stepped,
}
```

Mapping :

```rust
pub fn normalized_to_value(v: f32, min: f32, max: f32, curve: ValueCurve) -> f32 {
    let v = v.clamp(0.0, 1.0);

    match curve {
        ValueCurve::Linear => min + v * (max - min),
        ValueCurve::Logarithmic => min * (max / min).powf(v),
        ValueCurve::Exponential(power) => min + v.powf(power) * (max - min),
        ValueCurve::Bipolar => (v * 2.0) - 1.0,
        ValueCurve::Stepped => min + v * (max - min),
    }
}
```

Le même `ValueControl` peut piloter :

```text
ZenSlider
ZenFader
ZenKnob
ZenRing
ZenNumberInput
```

---

### 10.2 Slider avancé

Composants :

```rust
#[derive(Component)]
pub struct ZenSlider;

#[derive(Component)]
pub enum SliderAxis {
    Horizontal,
    Vertical,
}

#[derive(Component)]
pub struct SliderFineDrag {
    pub multiplier: f32,
}
```

Fonctionnalités ajoutables :

```text
DragValueControl          -> drag normal
WheelValueControl         -> molette
KeyboardAdjustable        -> flèches / raccourcis
ResettableValue           -> double-clic ou commande reset
SnapToStep                -> valeurs discrètes
BipolarCenter             -> centre visuel à 0
ValueLabelOnEdit          -> affiche valeur seulement pendant édition
```

Ne crée pas 15 types de sliders. Crée un noyau `ValueControl` + des composants comportementaux.

---

### 10.3 Bouton rotatif / knob

Composants :

```rust
#[derive(Component)]
pub struct ZenKnob;

#[derive(Component)]
pub struct KnobVisual {
    pub min_angle_rad: f32,
    pub max_angle_rad: f32,
}

#[derive(Component)]
pub struct DragValueControl {
    pub pixels_per_full_range: f32,
    pub fine_multiplier: f32,
}
```

Interaction recommandée :

```text
clic + drag vertical -> ajuste la valeur
Shift + drag         -> précision fine
molette              -> incrément court
double clic          -> reset
valeur affichée      -> uniquement pendant manipulation
```

Pour une UI Zen, préfère le drag vertical au calcul d’angle souris. C’est plus précis et moins nerveux.

---

## 11. Économie CPU

### 11.1 Pas de reconstruction permanente

À éviter :

```text
à chaque frame : despawn toute l’UI puis respawn
à chaque frame : recalculer tout le thème
à chaque frame : relayout manuel complet
à chaque frame : parcourir tous les widgets
```

À faire :

```text
OnEnter -> spawn
OnExit -> despawn
Changed<T> -> mise à jour ciblée
Events -> réaction ponctuelle
DirtyVisual -> update visuel local
resource_changed -> recalcul global rare
```

---

### 11.2 Exemple DirtyVisual

```rust
#[derive(Component)]
pub struct DirtyVisual;

fn mark_knob_dirty(
    mut commands: Commands,
    query: Query<Entity, (With<ZenKnob>, Changed<ValueControl>)>,
) {
    for entity in &query {
        commands.entity(entity).insert(DirtyVisual);
    }
}

fn update_knob_visuals(
    mut commands: Commands,
    mut query: Query<(Entity, &ValueControl, &KnobVisual), With<DirtyVisual>>,
) {
    for (entity, value, visual) in &mut query {
        let angle = visual.min_angle_rad
            + value.normalized * (visual.max_angle_rad - visual.min_angle_rad);

        // Appliquer la rotation sur l’indicateur enfant ou un matériau.

        commands.entity(entity).remove::<DirtyVisual>();
    }
}
```

Principe : **un widget ne se redessine pas parce que le frame avance, mais parce que ses données ont changé.**

---

### 11.3 Sets de systèmes UI

Crée des sets séparés :

```rust
#[derive(SystemSet, Debug, Hash, PartialEq, Eq, Clone)]
pub enum ZenUiSet {
    Input,
    Commands,
    ModelSync,
    Layout,
    Visual,
    Cleanup,
}
```

Installation :

```rust
app.configure_sets(Update, (
    ZenUiSet::Input,
    ZenUiSet::Commands,
    ZenUiSet::ModelSync,
    ZenUiSet::Layout,
    ZenUiSet::Visual,
    ZenUiSet::Cleanup,
).chain());
```

Cela évite une UI qui devient imprévisible quand le projet grossit.

---

## 12. Économie mémoire

### 12.1 Virtualiser les grandes listes

Pour calendrier, fichiers, presets, historiques, bibliothèques : ne spawn pas tout.

Mauvais modèle :

```text
10 000 événements -> 10 000 entités visibles
```

Bon modèle :

```text
10 000 événements en données
40 à 200 entités UI visibles
recyclage des lignes/cellules
mise à jour du contenu selon scroll/date visible
```

Composants :

```rust
#[derive(Component)]
pub struct VirtualList {
    pub item_height: f32,
    pub visible_start: usize,
    pub visible_count: usize,
    pub total_count: usize,
}
```

Pour un calendrier :

```text
vue mois    -> 35 à 42 cellules de jours
vue semaine -> 7 colonnes + blocs visibles
vue jour    -> blocs visibles seulement
vue année   -> 12 mini-mois, données simplifiées
```

---

### 12.2 Pooling seulement pour les éléments chauds

Le pooling est utile pour :

```text
lignes de liste recyclées
cellules de calendrier
puces d’événements
contrôles dans une timeline
éléments répétés en grand nombre
```

Il est inutile pour :

```text
boutons fixes
header
topbar
sidebar
settings rares
```

Ne complexifie pas tout avec un pool général. Fais des pools ciblés.

---

### 12.3 Assets par module

Chaque module doit gérer ses handles :

```rust
#[derive(Resource)]
pub struct CalendarAssets {
    pub calendar_icon: Handle<Image>,
    pub event_dot: Handle<Image>,
}
```

Au teardown lourd :

```rust
commands.remove_resource::<CalendarAssets>();
```

Quand plus aucun handle fort ne référence un asset, Bevy peut le libérer selon son système d’assets. La règle produit : **ne garde pas des handles globaux pour des assets rarement utilisés.**

---

## 13. Accordéon Zen

Un accordéon est un bon composant Bevy UI.

Structure :

```text
ZenAccordion
  ZenAccordionSection
    Header
      Label
      OptionalIndicator
    Body
      Content
```

Composants :

```rust
#[derive(Component)]
pub struct ZenAccordion;

#[derive(Component)]
pub struct ZenAccordionSection;

#[derive(Component)]
pub struct AccordionOpen(pub bool);
```

Système :

```rust
fn sync_accordion_sections(
    mut query: Query<(&AccordionOpen, &Children), Changed<AccordionOpen>>,
    mut nodes: Query<&mut Node>,
) {
    for (open, children) in &mut query {
        // Convention : body = dernier enfant, ou composant AccordionBody.
        for child in children.iter() {
            if let Ok(mut node) = nodes.get_mut(child) {
                node.display = if open.0 { Display::Flex } else { Display::None };
            }
        }
    }
}
```

Pour économiser :

```text
petit contenu -> Display::None
contenu lourd -> despawn du body à la fermeture
contenu très fréquent -> garder monté
```

---

## 14. Calendrier Apple-like mais Zen

### 14.1 Architecture

```text
CalendarRoot
  CalendarHeader
    PreviousButton
    TodayButton
    NextButton
    ViewModeSegment
  CalendarBody
    CalendarSidebar optional
    CalendarMainView
      MonthView | WeekView | DayView | AgendaView
```

Pas de popover obligatoire. Pour l’édition :

```text
sélection d’un événement -> panneau latéral calme
création rapide -> ligne inline ou mini-formulaire fixe
édition avancée -> mode édition dédié
```

---

### 14.2 Vue mois

```text
42 cellules maximum
chaque cellule affiche seulement les N premiers événements
bouton/ligne “+X” facultatif, ou panneau latéral au clic
```

Économie : très bonne.

---

### 14.3 Vue semaine/jour

```text
TimeColumn
DayColumns
EventBlocks positionnés par heure
```

À optimiser :

```text
calculer les collisions d’événements seulement quand la plage visible change
cacher les événements hors scroll
mettre en cache le layout des événements
```

---

## 15. Règles d’intégration avec `bevy_ui_widgets` et Feathers

### 15.1 `bevy_ui_widgets`

Utilise-le pour des comportements standards quand ça t’arrange :

```text
Button
Checkbox
Slider
Scrollbar
ScrollArea
ListBox
```

Mais ne l’expose pas directement au reste de ton app.

Correct :

```text
bevy_ui_widgets::Slider -> ZenSlider interne -> app
```

Incorrect :

```text
app -> bevy_ui_widgets::Slider partout
```

Raison : `bevy_ui_widgets` est expérimental. L’API peut changer. Ton wrapper protège le projet.

---

### 15.2 Feathers

Feathers peut servir :

```text
inspiration
référence de comportement
prototype interne
éditeur/debug tools
```

Mais pour ton UI Zen finale, évite de dépendre visuellement de Feathers. Ton identité visuelle doit rester dans `zen_ui`.

---

## 16. Chargement/retrait de fonctionnalités

### 16.1 Trois niveaux de retrait

| Niveau | Méthode | Effet |
|---|---|---|
| Build | Feature Cargo absente | Code non compilé |
| Runtime module | Plugin compilé mais écran non monté | Code présent, entités absentes |
| Widget | Composants ajoutés/retirés | Comportement actif/inactif |

Exemple :

```text
calendar feature absente -> aucun code calendrier
calendar feature présente mais AppMode != Calendar -> pas d’entités calendrier
Calendar visible mais advanced_controls=false -> knobs/sliders avancés cachés ou simplifiés
```

---

### 16.2 Registre UI

```rust
#[derive(Resource, Default)]
pub struct UiRegistry {
    pub screens: Vec<UiScreenDescriptor>,
}

pub struct UiScreenDescriptor {
    pub kind: UiScreenKind,
    pub label: &'static str,
    pub required_feature: Option<RequiresUiFeature>,
}
```

Chaque module enregistre ses écrans :

```rust
pub struct CalendarModulePlugin;

impl Plugin for CalendarModulePlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, register_calendar_screen)
           .add_systems(OnEnter(AppMode::Calendar), spawn_calendar_screen)
           .add_systems(OnExit(AppMode::Calendar), despawn_calendar_screen);
    }
}

fn register_calendar_screen(mut registry: ResMut<UiRegistry>) {
    registry.screens.push(UiScreenDescriptor {
        kind: UiScreenKind::Calendar,
        label: "Calendar",
        required_feature: Some(RequiresUiFeature::Calendar),
    });
}
```

---

## 17. Stratégie WASM/Tauri

### 17.1 Ce qui reste dans Bevy/WASM

```text
UI interactive
rendu immédiat
navigation
édition légère
calendrier
sliders/knobs
visualisation temps réel légère
```

### 17.2 Ce qui sort du core Bevy/WASM

```text
export vidéo
analyse audio lourde
IA locale lourde
indexation de fichiers
compression/décompression massive
traitement batch
conversion de formats complexes
```

Ces blocs doivent aller plutôt dans :

```text
commandes Tauri Rust
sidecars natifs
modules WASM séparés spécialisés
workers JS/WASM
```

La règle : **l’UI reste fluide, les traitements lourds sortent du thread/UI core.**

---

## 18. Plan de migration depuis HTML/JS

### Phase 1 — Noyau UI

Créer :

```text
ZenUiPlugin
ZenTheme
ZenStyleToken
ZenButton
ZenPanel
ZenSlider simple
ZenKnob simple
UiRegistry
AppMode
```

Ne migre pas tout. Migre seulement une surface limitée.

---

### Phase 2 — Wrappers et conventions

Créer une API interne stable :

```rust
spawn_zen_button(parent, label, command)
spawn_zen_slider(parent, value_model)
spawn_zen_knob(parent, value_model)
spawn_zen_panel(parent, panel_kind)
```

Objectif : ne pas répéter les arbres Bevy UI partout.

---

### Phase 3 — Écrans modulaires

Migrer écran par écran :

```text
Home
Settings minimal
Calendar month view
Calendar week view
Advanced controls
```

Chaque écran a :

```text
spawn_screen
update_screen
cleanup_screen
assets optionnels
state local
```

---

### Phase 4 — Optimisation

Mesurer :

```text
taille wasm
temps premier affichage
nombre d’entités UI visibles
nombre de systèmes actifs
temps layout UI
temps rendu UI
mémoire assets
mémoire GPU
```

Puis seulement optimiser.

---

## 19. Checklist concrète

### Cargo

- [ ] `default-features = false`
- [ ] profils `web-light`, `desktop`, `pro`
- [ ] pas de feature `dev` en release
- [ ] build `wasm-release`
- [ ] `wasm-opt` dans pipeline release

### Architecture

- [ ] `zen_ui` séparé du code métier
- [ ] aucun écran ne manipule directement les styles bas niveau sans wrapper
- [ ] tous les gros modules derrière features Cargo
- [ ] tous les écrans derrière `AppMode` / `OnEnter` / `OnExit`
- [ ] registre UI central

### Performance

- [ ] pas de rebuild UI par frame
- [ ] systèmes avec `Changed<T>` ou events
- [ ] listes virtualisées
- [ ] calendrier limité à la plage visible
- [ ] assets par module
- [ ] handles lourds drop au teardown

### Composants

- [ ] `ValueControl` commun pour sliders/knobs/faders
- [ ] comportements ajoutables par composants
- [ ] `DirtyVisual` pour updates visuels ciblés
- [ ] accordéon avec `Display::None` ou despawn selon poids
- [ ] pas de tooltip/popover dans le core Zen

---

## 20. Conclusion

L’intégration recommandée est :

```text
Bevy UI dans le core
+ design system Zen maison
+ widgets maison composables
+ comportements par composants ECS
+ écrans montés par états
+ modules compilés par features Cargo
+ activation runtime par flags
+ virtualisation des gros ensembles
+ assets par module
+ traitements lourds hors UI core
```

Cette architecture évite deux pièges :

```text
1. recoder un framework UI manuel complet
2. garder toute l’app vivante en mémoire sous prétexte qu’elle est compilée
```

La règle à garder :

```text
compiler le nécessaire
monter seulement l’actif
cacher le fréquent
unmount le lourd
libérer les assets rares
ajouter les comportements par composants
```

---

## Sources techniques consultées

- Bevy UI `0.19.0`, primitives `Node`, `Text`, `ImageNode`, `Button`, layout Flexbox/Grid : https://docs.rs/bevy_ui/latest/bevy_ui/
- Bevy Cargo features, profils `default`, `2d`, `3d`, `ui`, collections : https://github.com/bevyengine/bevy/blob/main/docs/cargo_features.md
- Cargo features et `default-features = false` : https://doc.rust-lang.org/cargo/reference/features.html
- `bevy_ui_widgets`, widgets headless et statut expérimental : https://docs.rs/bevy/latest/bevy/ui_widgets/index.html
- Bevy State `OnEnter`, `OnExit`, `in_state`, state-scoped cleanup : https://docs.rs/crate/bevy_state/latest
- Bevy entity disabling, `Disabled`, default query filters : https://docs.rs/bevy/latest/bevy/ecs/entity_disabling/index.html
- Bevy `despawn()` et descendants `Children` en 0.19 : https://docs.rs/bevy/latest/bevy/ecs/system/entity_command/fn.despawn.html
- Bevy Asset system, handles et chargement async : https://docs.rs/bevy_asset
- Bevy 0.19 release notes, `EditableText`, BSN, Feathers : https://bevy.org/news/bevy-0-19/
