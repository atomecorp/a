# Menu solution — masquer / réafficher la barre, ne jamais perdre un objet

Date : 2026-09-24
Statut : cadrage, **rien n'est implémenté**. Ce fichier est le prompt à suivre pour réaliser la tâche.

Sources :
- `/Users/jean-ericgodard/Desktop/menu solution.md` §4 à §8 ;
- `todo/contextual_taxonomy_2026-09-24.md`, qui porte la taxonomie, la racine du menu (Q2), le niveau (Q5) et le bloc `behaviors` (§3bis.4, Q6).

Dépendance : les comportements variables selon le niveau lisent `behaviors.<level>` dans `eVe/intuition/menu/context_menus.json`. Ce bloc est défini à l'étape 1 du todo taxonomie. En attendant, lire le niveau via `resolveMasteryLevel` et y brancher les valeurs par défaut ci-dessous, sans les coder en dur à plusieurs endroits.

---

## Règles

- **M1** — Le masquage de la barre est une **fonction du menu lui-même**, jamais une commande de Mystic.
- **M2** — Aucun sixième bouton. Le point d'ancrage est le bouton **Organiser** (celui qui ouvre le Dashboard) :
  - clic simple = son comportement normal ;
  - **appui long = bascule masqué / affiché**.
- **M3** — **Même geste, même endroit** pour masquer et pour réafficher.
- **M4** — **Débutant** : quand la barre est masquée, un **petit repère visible** reste dans le coin. Son apparence est distincte de l'icône Organiser. Un clic dessus réaffiche la barre.
- **M5** — **Avancé** : quand la barre est masquée, rien n'est visible, mais la **zone tactile d'Organiser reste active**. Un appui long dessus réaffiche la barre.
- **M6** — À la **première** utilisation du masquage, afficher un tutoriel très court expliquant comment faire réapparaître la barre (une seule fois, mémorisé dans le profil).
- **M7** — Le masquage volontaire persiste tant que l'utilisateur ne demande pas le retour.
- **M8** — Pendant la manipulation d'un objet, l'interface système disparaît puis revient au relâchement **seulement si elle était affichée avant**. Une barre masquée volontairement reste masquée.
- **M9** — Un objet ne doit jamais être « perdu » derrière la barre. Quand la barre réapparaît sur l'objet qu'on vient de manipuler :
  1. **déplacer légèrement la vue** pour le rendre visible ;
  2. **dézoomer légèrement**, seulement si ce déplacement masque une partie importante du projet ;
  3. utiliser le zoom minimal nécessaire ;
  4. **les coordonnées des objets ne changent jamais**, seule la vue bouge.
  
  Interdits : zone morte permanente, écran partiellement interdit, scroll HTML classique.
- **M10** — Le projet peut être **déplacé et zoomé globalement**. Un contrôle de zoom simple peut être proposé, y compris aux débutants.

Valeurs par défaut de `behaviors` (réglables dans l'éditeur) :

| Clé | beginner | intermediate | advanced |
|---|---|---|---|
| `menu_recall` | `visible_marker` | `visible_marker` | `invisible_zone` |
| `auto_reframe` | `true` | `true` | `true` |
| `gesture_shortcuts` | `false` | `true` | `true` |
| `default_view_mode` | `list` | *(inchangé)* | *(inchangé)* |

## Existant (lu le 24/09)

- **Suspension du menu principal.** `setWorkspaceMainMenuDashboardSuspended` et `isWorkspaceMainMenuDashboardSuspended` dans `eVe/intuition/tools/workspace_main_menu_visibility.js`. À **réutiliser** pour M2/M7 : ne pas créer une opacité maison (voir la mémoire « se brancher sur les suspensions existantes »).
- **M8 est déjà en place.** `eVe/domains/rendering/gesture_chrome_suspension.js`, appelé par `surface_interaction_runtime.js`, suspend le menu, le rail et les panneaux pendant un geste. Il ne restaure que ce qu'il a lui-même suspendu. **À vérifier seulement**, avec une barre masquée volontairement.
- **Plein écran visuel.** `project_view_visual_fullscreen_runtime.js`, lié à l'outil `perform` : autre mécanisme de suspension. Ne pas le confondre avec M2, mais les deux ne doivent pas se contredire (sortir du plein écran ne doit pas réafficher une barre masquée volontairement).
- **Déplacement et zoom globaux de la vue : non trouvés.** `surface_pinch_runtime.js` zoome les objets et le recadrage des médias, pas la vue du projet. **M10 est un prérequis de M9** et un vrai chantier : caméra de projet dans le moteur Bevy, conversion des coordonnées écran ↔ projet, et impact sur hit-test, sélection, dépôt et fantômes de page.

## Travail, dans l'ordre

1. **Masquer / réafficher** (M1–M7).
   - Appui long sur Organiser → bascule de la suspension existante, avec un état « masqué volontairement » distinct de la suspension par geste ou par Dashboard.
   - Repère débutant : un petit nœud Bevy à la racine de l'arbre, pas dans le menu suspendu.
   - Zone invisible avancée : le hit-test reste actif sur la zone d'Organiser pendant que la barre est masquée.
   - Tutoriel de première utilisation.
   - Lire `behaviors.menu_recall`.
2. **Vérifier M8** : un vrai glisser d'objet, barre affichée puis barre masquée volontairement (sonde de référence : `temp/drag_chrome_visual_probe.mjs`).
3. **Déplacement et zoom globaux de la vue** (M10) : conception à part avant tout code (caméra, transformations, impact sur les gestes existants).
4. **Recadrage anti-perte** (M9), sur `behaviors.auto_reframe` : au réaffichage, calculer si la boîte de l'objet manipulé en dernier est couverte par la boîte de la barre. Si oui, déplacer la vue ; si ce n'est pas suffisant, dézoomer au minimum.

## Vérification

- Sonde Playwright sur l'app réelle, avec de vrais gestes (pas de stubs) :
  - appui long sur Organiser → barre masquée ; en débutant le repère est présent ; clic sur le repère → barre revenue ;
  - en avancé, aucun repère ; appui long sur la zone → barre revenue ;
  - le tutoriel s'affiche une seule fois ;
  - glisser un objet avec la barre masquée → elle reste masquée ; avec la barre affichée → elle revient ;
  - poser un objet sous l'emplacement de la barre, barre masquée, puis réafficher → l'objet est visible et ses coordonnées sont inchangées.
- Lire `report.json` **et** les PNG. Ne pas lancer la suite de tests du repo.

## Critères d'acceptation

1. Aucun sixième bouton ; Mystic ne contient aucune commande de masquage.
2. Appui long sur Organiser : masque puis réaffiche ; clic simple : ouvre le Dashboard.
3. Le débutant a toujours un repère visible quand la barre est masquée ; l'avancé peut avoir un écran totalement dégagé.
4. Tutoriel à la première utilisation seulement.
5. Une manipulation d'objet ne réaffiche jamais une barre masquée volontairement.
6. Un objet posé sous la barre redevient visible au réaffichage, par déplacement puis dézoom minimal, sans changer ses coordonnées.
