# Prompt — Audit complet architecture Atomes, rendu, historique, accessibilité et édition inline

## Rôle

Tu es un architecte logiciel senior spécialisé en :

- moteurs graphiques temps réel ;
- Bevy / ECS / WASM ;
- Tauri ;
- modèles de données persistants ;
- undo/redo transactionnel ;
- accessibilité d’applications riches ;
- architecture UI complexe multi-input.

Ta mission est de réaliser un **audit complet et sans complaisance** de l’architecture actuelle d’**eVe Intuition / Atome**.

L’objectif n’est pas de réécrire le système, ni de proposer une nouvelle architecture abstraite. L’objectif est de vérifier si l’architecture actuelle est réellement saine, extensible, robuste et compatible avec l’édition inline d’un atome.

---

## Contexte produit

Le projet utilise Tauri avec Bevy en WASM. Bevy natif dans Tauri n’est pas la cible actuelle.

La décision produit actuelle est :

```text
Quand un atome entre en édition, on ne l’isole pas dans un autre canvas.
L’atome reste dans le canevas principal.
On ajoute seulement des composants / éléments d’édition sous l’atome.
```

Le mode d’édition visé est donc un **InlineEditMode**, pas un DeepEditMode isolé.

Comportement UX visé :

```text
1. Double-clic sur un atome.
2. L’atome reste dans le canevas principal.
3. Un overlay léger apparaît sous l’atome.
4. Cet overlay affiche le nom de l’atome.
5. Double-clic sur le nom => renommage.
6. Un bouton permet de fermer l’édition.
7. L’atome peut être déplacé.
8. Les outils principaux restent fixes en bas de l’écran.
9. Le menu Flower reste disponible pour les actions contextuelles.
10. Le mode droitier/gaucher est conservé.
```

Décisions techniques actuelles :

```text
- Pas de vraie div DOM attachée à l’atome.
- Pas de deuxième canvas Bevy.
- Pas de deuxième instance Bevy.
- Pas d’isolation de l’atome dans une fenêtre séparée pour cette version.
- Pas de render-to-texture obligatoire pour l’édition inline.
- Les éléments visuellement attachés à l’atome doivent être rendus par Bevy ou par la couche graphique déjà utilisée par le canevas.
- Les panneaux fixes non spatiaux peuvent rester dans le DOM si l’architecture existante le fait déjà.
```

---

## Documents à lire avant l’audit

Lis entièrement les documents fournis dans le contexte, notamment :

```text
- actual_menu.md si disponible ;
- ui_project_system_specification_v146_MVP_consolidated.md si disponible ;
- prompt_modification_menu_mvp_v146_ios_touch_tests(1).md si disponible ;
- tout document décrivant Atome, AtomGraph, rendu, historique, DB, undo/redo, Bevy, Tauri ou accessibilité.
```

Ensuite seulement, inspecte le code source réel.

Ne te base pas sur les anciens chemins historiques comme source de vérité. Le chemin propriétaire actif mentionné dans le cahier UI est :

```text
eVe/intuition/
```

Mais tu dois aussi chercher dans tout le projet les modules liés à :

```text
Atome
Atom
AtomGraph
Tree
Node
Kind
Payload
Renderer
Bevy
ECS
Canvas
History
Undo
Redo
ActionLog
Command
Patch
Snapshot
Database
Storage
Tauri command
Accessibility
A11y
Input
Pointer
Flower
Menu
Inline edit
```

---

## Modification importante du cahier UI joint

Le cahier UI joint contient des exigences liées au mode dock. Pour cet audit, le mode dock est **hors périmètre**.

Tu dois donc considérer comme supprimées ou non prioritaires les exigences suivantes :

```text
- Dock on/off ;
- contextDocked ;
- projets dockés ;
- dock stacking ;
- ultraCompact lié au dock ;
- minimize/dock ;
- toolbar contextuelle dockée en bas ;
- relayout de projets dockés ;
- tout comportement dont le seul but est le docking.
```

En revanche, tu dois conserver et auditer :

```text
- mode droitier/gaucher ;
- Flower menu ;
- outils principaux fixes en bas ;
- édition par double-clic sur atome ;
- renommage par double-clic sur le nom ;
- accessibilité souris, tactile, clavier, iOS/WebKit ;
- suppression des comportements navigateur natifs indésirables ;
- séparation des surfaces UI existantes ;
- compatibilité avec les APIs publiques existantes.
```

Si le code contient encore du docking, ne le supprime pas pendant cet audit. Identifie seulement :

```text
- où il vit ;
- s’il interfère avec l’édition inline ;
- s’il est couplé dangereusement au mode droitier/gaucher ;
- s’il peut être désactivé proprement sans casser le reste.
```

---

## Objectif principal de l’audit

Vérifier si l’architecture actuelle est compatible avec les exigences suivantes :

```text
1. L’arbre de données des atomes existe réellement.
2. Cet arbre est indépendant de la vue et du rendu.
3. Le rendu Bevy est une projection reconstructible depuis cet arbre.
4. Les entités ECS / Bevy ne sont pas la source de vérité métier.
5. L’ajout de nouveaux kinds d’atomes est prévu proprement.
6. Les kinds existants audio, video, text, image, shape, group, etc. ne sont pas codés de manière fragile.
7. Un atome peut être enrichi sans perdre son kind primaire.
8. L’arbre stocké permet une annulation parfaite.
9. L’historique est sauvegardé en base de manière exploitable.
10. Les actions utilisateur sont historisées au bon niveau métier, pas au niveau rendu.
11. L’édition inline ne casse pas l’historique.
12. L’édition inline ne pollue pas l’arbre métier avec des éléments UI temporaires.
13. L’architecture est compatible avec les standards d’accessibilité applicables.
14. L’architecture est robuste sur Tauri + Bevy WASM.
15. Le système reste compatible avec le mode droitier/gaucher.
```

---

## Standards d’accessibilité à utiliser comme référence

Audit minimum attendu :

```text
- WCAG 2.2 niveau AA ;
- WAI-ARIA 1.2 / ARIA Authoring Practices pour les composants DOM ;
- navigation clavier complète ;
- alternatives aux gestes complexes ;
- support souris, trackpad, tactile, stylet et clavier ;
- absence de dépendance au hover ;
- focus visible et ordre de focus cohérent ;
- noms accessibles pour les contrôles ;
- rôles et états accessibles ;
- annonces des changements d’état importants ;
- conformité raisonnable dans une WebView Tauri.
```

Point critique : si une partie de l’UI est dessinée uniquement dans Bevy/canvas, vérifie comment elle devient accessible aux lecteurs d’écran et aux technologies d’assistance.

Une UI dessinée dans un canvas n’est pas automatiquement accessible. Si aucun pont d’accessibilité n’existe, marque le point comme **bloquant** et propose une solution compatible avec l’architecture, par exemple :

```text
- arbre sémantique miroir côté DOM ;
- couche accessibility bridge ;
- focus manager explicite ;
- descriptions accessibles des atomes sélectionnés ;
- commandes clavier équivalentes ;
- panneau liste/layers accessible ;
- live regions pour changements critiques ;
- mapping stable entre AtomId et élément accessible.
```

Ne confonds pas une div DOM visuelle attachée à l’atome avec une couche sémantique invisible ou non spatiale destinée à l’accessibilité. La première est refusée pour l’UX. La seconde peut être nécessaire pour l’accessibilité.

---

## Questions obligatoires à résoudre

### 1. Source de vérité des atomes

Réponds précisément :

```text
- Où est défini l’arbre des atomes ?
- Quel est son nom réel dans le code ? AtomGraph ? Document ? Scene ? Tree ? Autre ?
- Quels fichiers le définissent ?
- Quels types / structs / classes / tables représentent un atome ?
- Quel identifiant stable est utilisé ? AtomId ? UUID ? DB id ? autre ?
- Les entités Bevy sont-elles seulement une projection ou sont-elles utilisées comme source métier ?
- Peut-on reconstruire la scène complète depuis les données stockées sans état Bevy caché ?
```

Verdict attendu :

```text
OK / PARTIEL / NON / INCONNU
```

Avec preuves : fichiers, fonctions, types, schémas, extraits courts.

---

### 2. Indépendance modèle / vue / rendu

Vérifie la séparation réelle entre :

```text
- modèle persistant ;
- état de document ;
- état d’édition temporaire ;
- état de sélection ;
- état de caméra / zoom / pan ;
- rendu Bevy ;
- entités ECS ;
- UI DOM éventuelle ;
- historique / action log.
```

Cherche les anti-patterns suivants :

```text
- position ou transform stockée uniquement sur une Entity Bevy ;
- nom d’atome stocké uniquement dans un composant UI ;
- action undo qui cible une Entity au lieu d’un AtomId ;
- source métier dépendante du canvas ;
- logique de rendu qui modifie directement la base ;
- UI temporaire sauvegardée comme contenu métier ;
- rebuild impossible sans état runtime.
```

---

### 3. Rendu de l’atome

Cartographie le pipeline complet :

```text
Données persistées
→ arbre atome en mémoire
→ résolution des kinds / payloads / assets
→ systèmes Bevy / ECS
→ entités visibles
→ input picking
→ action utilisateur
→ mutation du modèle
→ sauvegarde DB
→ rerender
```

Pour chaque étape, indique :

```text
- fichiers impliqués ;
- fonctions principales ;
- types principaux ;
- sens des dépendances ;
- risques ;
- tests existants.
```

Vérifie particulièrement :

```text
- rendu texte ;
- rendu image ;
- rendu vidéo ;
- rendu audio ou représentation audio ;
- rendu groupe / composite ;
- overlays UI ;
- sélection ;
- drag ;
- rename ;
- double-clic ;
- focus ;
- relation entre Bevy et Tauri/WebView.
```

---

### 4. Édition inline de l’atome

Vérifie si l’architecture actuelle permet proprement :

```text
Double-clic atome
→ entrer en InlineEditMode
→ afficher overlay temporaire sous l’atome
→ afficher le nom
→ double-clic nom = renommage
→ bouton fermer édition
→ déplacement direct de l’atome
→ historique correct
→ sortie d’édition
```

L’overlay d’édition doit être un état UI temporaire, pas un atome métier.

Vérifie :

```text
- où stocker editing_atom_id ;
- où stocker renaming_atom_id ;
- comment positionner l’overlay sous l’atome ;
- comment garder l’overlay lisible au zoom ;
- comment éviter que l’overlay soit persisté comme contenu ;
- comment router clavier / souris / touch ;
- comment sortir proprement de l’édition ;
- comment gérer Escape / Enter / clic dehors ;
- comment gérer le focus clavier ;
- comment rendre cela accessible.
```

Règles UX à auditer :

```text
- sélection simple par clic/tap ;
- entrée édition par double-clic/double-tap ou alternative accessible ;
- renommage par double-clic sur label ou alternative clavier ;
- Enter valide le rename ;
- Escape annule le rename ;
- clic/tap dehors valide ou annule selon règle actuelle, à documenter ;
- bouton fermer édition accessible au clavier et au tactile ;
- aucune dépendance exclusive au hover ;
- mode droitier/gaucher respecté pour menus/outils.
```

---

### 5. Extensibilité des kinds

Vérifie si le modèle actuel permet d’ajouter de nouveaux kinds sans casser le système.

Questions obligatoires :

```text
- Où les kinds sont-ils définis ? enum ? registry ? strings ? DB ?
- Où les payloads par kind sont-ils définis ?
- Combien de switch/case ou match globaux doivent être modifiés pour ajouter un kind ?
- Existe-t-il un système de plugin/registry par kind ?
- Existe-t-il une interface commune pour render, edit, serialize, deserialize, validate, export ?
- Les actions undo/redo sont-elles génériques ou dépendantes de chaque kind ?
- Les tools filtrent-ils correctement par kind/capability ?
- Les tests garantissent-ils qu’un nouveau kind ne casse pas les anciens ?
```

Vérifie que l’architecture supporte le principe suivant :

```text
Un atome garde son kind primaire, mais peut être enrichi par des capacités, des outputs ou un graphe interne.
```

Exemples à valider architecturalement :

```text
TextAtom + audio interne
AudioAtom + vidéo interne
VideoAtom + sous-titres texte
ImageAtom + son d’ambiance
CompositeAtom contenant plusieurs médias
GroupAtom comme conteneur organisationnel simple
```

Ne recommande pas une mutation destructive du genre :

```text
TextAtom -> GroupAtom
AudioAtom -> GroupAtom
VideoAtom -> GroupAtom
```

Sauf si le code actuel ne permet rien d’autre, auquel cas marque cela comme une faiblesse grave.

Modèle cible à comparer avec l’existant :

```text
Atom
├── id stable
├── kind primaire
├── payload spécifique au kind
├── transform
├── timeline éventuelle
├── outputs/capabilities calculés ou stockés
├── internal_graph optionnel
└── metadata
```

Tu ne dois pas imposer ce modèle si l’existant a une autre forme saine. Mais tu dois vérifier que les mêmes propriétés sont couvertes.

---

### 6. Historique, undo/redo et base de données

Audit extrêmement strict.

Questions obligatoires :

```text
- Où les actions utilisateur sont-elles définies ?
- Où sont-elles sauvegardées ?
- Quelle base est utilisée ? SQLite ? autre ?
- Quel est le schéma réel ?
- L’historique est-il en base ou seulement en mémoire ?
- Les actions contiennent-elles before/after ? patch inverse ? snapshot ? event sourcing ?
- Peut-on annuler parfaitement après redémarrage de l’application ?
- Peut-on rejouer l’historique pour reconstruire un document ?
- Les actions sont-elles atomiques ?
- Existe-t-il une notion de transaction ou batch ?
- Le drag est-il coalescé en une seule action finale ?
- Le rename est-il sauvegardé comme une seule action finale ?
- Les actions temporaires d’UI sont-elles exclues de l’historique métier ?
- BeginEdit / EndEdit sont-ils historisés ou seulement des états UI ?
- Comment gérer crash/reload pendant une édition ?
- Comment gérer conflits de version ?
- Existe-t-il des migrations de schéma ?
```

Critères de conformité :

```text
- Une action métier doit cibler AtomId / path stable, pas Entity Bevy.
- Les mutations doivent être rejouables.
- Les inverses doivent être déterministes.
- Les actions composées doivent pouvoir être annulées comme une unité.
- Les actions UI temporaires ne doivent pas polluer l’historique document.
- La base doit contenir assez d’information pour restaurer l’état et l’historique.
```

Cas de test obligatoires :

```text
1. Rename atome, undo, redo, redémarrage, undo encore possible.
2. Drag atome pendant 2 secondes, une seule action Move finale dans l’historique.
3. Entrer en édition puis fermer sans mutation métier : aucun changement document inutile.
4. Entrer en édition, renommer, fermer : une action Rename propre.
5. Ajouter un atome enfant/interne si supporté, undo parfait.
6. Modifier un TextAtom enrichi audio si supporté, undo parfait.
7. Supprimer un atome avec enfants, undo restaure tout.
8. Rejouer l’historique sur document vide produit le même arbre.
```

---

### 7. Compatibilité multi-input

Vérifie la cohérence entre :

```text
- souris ;
- trackpad ;
- tactile ;
- stylet ;
- clavier ;
- iOS / iPadOS WebKit ;
- Tauri WebView.
```

Le cahier UI impose que les fonctionnalités disponibles à la souris aient une équivalence tactile/clavier.

Vérifie :

```text
- click = tap ;
- double-click = double-tap ou alternative claire ;
- right click = secondary press si disponible ;
- long press = long touch ;
- drag souris = drag tactile ;
- Escape = fermeture alternative par tap/click hors menu ;
- hover jamais obligatoire ;
- menu contextuel navigateur bloqué sur les zones nécessaires ;
- sélection native / callout / drag image natif neutralisés sans bloquer les interactions utiles.
```

---

### 8. Accessibilité détaillée

Produis un audit WCAG 2.2 AA orienté application graphique.

Points minimum à vérifier :

```text
- accès clavier à la sélection d’atome ;
- accès clavier à l’entrée en édition ;
- accès clavier au renommage ;
- accès clavier au bouton fermer édition ;
- focus visible ;
- ordre de focus ;
- labels accessibles ;
- noms accessibles des atomes ;
- annonce du mode édition ;
- annonce du renommage ;
- alternative au drag pour déplacer l’atome ;
- target size suffisant pour touch ;
- contraste texte / icônes / focus ;
- réduction d’animation si prefers-reduced-motion ;
- aucun piège clavier ;
- pas d’action uniquement au hover ;
- erreurs de rename annoncées ;
- compatibilité lecteurs d’écran ou stratégie claire si le canvas est dominant.
```

Pour chaque non-conformité, donne :

```text
- critère concerné ;
- impact utilisateur ;
- fichier / zone de code ;
- correction recommandée ;
- priorité : bloquant / majeur / moyen / mineur.
```

---

### 9. Mode droitier/gaucher

Le mode droitier/gaucher doit rester.

Vérifie :

```text
- état global actuel ;
- persistance éventuelle ;
- effet sur toolbox principale ;
- effet sur Flower ;
- effet sur toolbars ;
- effet sur overlays inline ;
- effet sur labels, boutons et zones d’action ;
- absence de dépendance au mode dock supprimé ;
- tests existants ou nécessaires.
```

Le mode droitier/gaucher ne doit pas être couplé au docking. Si c’est le cas, marque comme risque architectural.

---

### 10. Surfaces UI et outils

Clarifie précisément où vivent les outils :

```text
- outils principaux fixes en bas ;
- actions contextuelles dans Flower ;
- overlay inline minimal sous l’atome ;
- éléments systèmes de sélection rendus autour de l’atome ;
- panneaux fixes éventuels ;
- DOM éventuel ;
- Bevy UI éventuelle.
```

Distingue obligatoirement :

```text
Outils métier : draw, audio, video, shape, text, layer, effect, etc.
Éléments système : cadre, poignées, nom, bouton close edit, guides, snap, handles.
```

L’overlay inline ne doit pas devenir un menu complet. Il doit rester minimal.

Recommandation cible à vérifier :

```text
- Outils principaux : fixes en bas.
- Actions rapides : Flower.
- Overlay inline : nom + rename + fermeture édition + éventuellement handle déplacement.
- Cadres/poignées/gizmos : Bevy/canvas.
- Panneaux lourds : fixes, éventuellement DOM si non attachés spatialement.
```

---

## Fichiers et zones probables à inspecter

Commence par chercher avec `rg` ou outil équivalent :

```bash
rg -n "Atome|Atom|AtomGraph|kind|payload|children|parent|tree|node|render|renderer|Bevy|Entity|Component|Bundle|spawn|despawn|undo|redo|history|Action|Command|Patch|Snapshot|database|sqlite|storage|Tauri|double|dbl|rename|accessibility|a11y|aria|focus|keyboard|pointer|touch|Flower|leftHanded|rightHanded" .
```

Inspecte au minimum les zones suivantes si elles existent :

```text
eVe/intuition/eVeIntuition.js
eVe/intuition/menu/index.js
eVe/intuition/ribbon/menu.js
eVe/intuition/ribbon/reveal.js
eVe/intuition/flower/menu.js
eVe/intuition/tools/contextual/flower_menu_context.js
eVe/intuition/flower/context_target.js
eVe/intuition/flower/context_selection.js
eVe/intuition/footer/runtime.js
eVe/intuition/footer/tool_row_runtime.js
eVe/intuition/runtime/layer_contract.js
eVe/intuition/runtime/eve_intuition/tool_latched_state_runtime.js
eVe/intuition/tools/molecule/footer_tools_contract.js
eVe/intuition/tools/molecule/panel/index.js
eVe/domains/mtrax/ui/tool_keys.js
eVe/intuition/tools/core/tool_interaction.js
```

Ajoute tous les fichiers réellement trouvés pour :

```text
- Bevy WASM ;
- Tauri commands ;
- stockage DB ;
- modèles Atome ;
- serialisation ;
- historique ;
- rendu ;
- input ;
- accessibilité.
```

---

## Méthode obligatoire

1. Lis les documents fournis.
2. Fais un inventaire des fichiers réels.
3. Cartographie le modèle de données Atome.
4. Cartographie le pipeline de rendu.
5. Cartographie l’historique / undo / redo / DB.
6. Cartographie l’input et les surfaces UI.
7. Cartographie l’accessibilité.
8. Vérifie l’extensibilité des kinds.
9. Vérifie la compatibilité avec InlineEditMode.
10. Identifie les couplages dangereux.
11. Classe les risques.
12. Donne un verdict GO / GO AVEC CONDITIONS / NO-GO.

Ne modifie pas le code pendant cet audit, sauf si la demande explicite suivante te demande une implémentation. Ici, la sortie attendue est un audit.

---

## Format obligatoire du rapport final

Réponds avec la structure suivante.

### 1. Verdict exécutif

```text
GO / GO AVEC CONDITIONS / NO-GO
```

Explique en 10 lignes maximum.

### 2. Tableau de conformité

Tableau obligatoire :

```text
Exigence | Statut | Preuves | Risque | Correction recommandée | Priorité
```

Statuts autorisés :

```text
OK
PARTIEL
NON
INCONNU
```

Interdiction de mettre `OK` sans preuve concrète.

### 3. Cartographie architecture actuelle

Inclure :

```text
- diagramme texte du modèle Atome ;
- diagramme texte du pipeline rendu ;
- diagramme texte de l’historique ;
- diagramme texte de l’édition inline cible ;
- liste des fichiers clés.
```

### 4. Audit modèle Atome / arbre de données

Répondre aux questions de la section 1.

### 5. Audit rendu Bevy / vue

Répondre aux questions de la section 3.

### 6. Audit extensibilité des kinds

Inclure :

```text
- nombre de zones à modifier pour ajouter un kind ;
- switch/case dangereux ;
- registry ou absence de registry ;
- impact sur tools, rendu, historique, DB, export.
```

### 7. Audit undo/redo/history/DB

Inclure :

```text
- schéma actuel ;
- niveau de persistance ;
- possibilité d’undo après restart ;
- replay ;
- transactions ;
- failles exactes.
```

### 8. Audit édition inline

Inclure :

```text
- faisabilité ;
- changements minimaux nécessaires ;
- où stocker l’état temporaire ;
- comment éviter la pollution du modèle ;
- interaction avec historique ;
- interaction avec droitier/gaucher ;
- interaction avec accessibilité.
```

### 9. Audit accessibilité

Inclure :

```text
- conformité WCAG 2.2 AA estimée ;
- points bloquants ;
- stratégie pour canvas/Bevy ;
- clavier ;
- lecteur d’écran ;
- tactile ;
- focus ;
- contrastes ;
- target size ;
- alternatives au drag/double-click.
```

### 10. Audit suppression du mode dock

Inclure :

```text
- où le docking existe ;
- ce qui peut être ignoré ;
- ce qui doit être désactivé ;
- ce qui est couplé au handedness ;
- risques de régression.
```

### 11. Plan de tests recommandé

Inclure au minimum :

```text
- tests unitaires modèle ;
- tests undo/redo persisté ;
- tests replay historique ;
- tests E2E double-click/tap édition ;
- tests rename Enter/Escape ;
- tests drag coalescé ;
- tests tactile ;
- tests clavier ;
- tests WCAG automatisés ;
- tests manuels lecteur d’écran ;
- tests Tauri WebView.
```

### 12. Risques classés

Tableau :

```text
Risque | Impact | Probabilité | Priorité | Correction courte
```

### 13. Recommandation finale

Conclure par :

```text
- ce qui est déjà solide ;
- ce qui doit être corrigé avant édition inline ;
- ce qui peut attendre ;
- ce qu’il ne faut surtout pas changer ;
- première étape de patch recommandée si l’audit est positif.
```

---

## Critères de rejet immédiat

Marque `NO-GO` si tu trouves l’un de ces cas :

```text
- l’arbre des atomes n’existe pas réellement ;
- les Entity Bevy sont la source de vérité métier ;
- l’historique n’est pas sauvegardé en base alors que le produit prétend le faire ;
- l’undo parfait après redémarrage est impossible sans refonte ;
- les actions undo ciblent des entités runtime instables ;
- ajouter un nouveau kind exige de modifier une quantité excessive de code central ;
- l’UI canvas n’a aucune stratégie d’accessibilité ;
- le mode droitier/gaucher est inséparable du mode dock ;
- l’édition inline impose de sauvegarder des éléments UI temporaires dans l’arbre métier.
```

Marque `GO AVEC CONDITIONS` si les bases sont bonnes mais qu’il manque des correctifs limités.

Marque `GO` seulement si l’architecture est déjà saine et que l’édition inline peut être ajoutée avec un patch limité.

---

## Interdictions strictes pendant l’audit

Ne fais pas ceci :

```text
- ne réécris pas le système ;
- ne crée pas un prototype parallèle ;
- ne propose pas un deuxième canvas ;
- ne propose pas une div DOM visuelle attachée à l’atome ;
- ne remets pas le mode dock dans le périmètre ;
- ne confonds pas GroupAtom et atome enrichi ;
- ne transforme pas destructivement audio/video/text en group ;
- ne valide pas l’accessibilité sans preuve ;
- ne valide pas l’undo/redo sans vérifier la base ;
- ne valide pas l’indépendance modèle/rendu sans inspecter le code ;
- ne donne pas de conseil général sans fichiers et preuves.
```

---

## Résultat attendu

Je veux un rapport d’audit exploitable directement par un développeur.

Le rapport doit permettre de décider clairement :

```text
1. Est-ce que l’architecture actuelle est saine ?
2. Est-ce que l’arbre Atome est vraiment indépendant de la vue et du rendu ?
3. Est-ce que le rendu Bevy est bien une projection ?
4. Est-ce qu’on peut ajouter de nouveaux kinds proprement ?
5. Est-ce que l’historique en base permet un undo/redo parfait ?
6. Est-ce que l’édition inline peut être ajoutée sans casser l’existant ?
7. Est-ce que l’accessibilité est réellement couverte ?
8. Est-ce que le mode droitier/gaucher reste compatible sans dock ?
9. Quels sont les risques exacts ?
10. Quelle est la première étape de correction si nécessaire ?
```

Ne conclus jamais “tout est bon” sans preuves concrètes.
