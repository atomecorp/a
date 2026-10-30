# Outil Aide (eVe)

L'outil Aide (`tool.main.help`) est une **rubrique d'aide, et rien d'autre**. Il n'affiche aucune notification, ne donne accès à aucune archive et n'ajoute rien à la barre latérale contextuelle. Les notifications relèvent de Communication (voir `todo/communication_refonte.md`).

## Comportement

1. **Toucher l'outil** déplie, dans le ruban, un message d'aide adapté au contexte : un conseil pour l'accueil, un autre dans un projet. Un nouveau toucher replie.
2. **Toucher le message** le transforme en champ de question. C'est le champ inline canonique du ruban : focus sur geste volontaire, clavier mobile, Échap pour fermer. Les sujets suggérés pour le contexte s'affichent aussitôt dans le panneau Aide, au-dessus de l'outil.
3. **Taper** lance une recherche dans le catalogue d'aide, avec un anti-rebond de 180 ms (Entrée la lance tout de suite). La recherche ignore la casse et les accents. Un mot tapé trouve les mots qui commencent par lui. Tous les mots doivent être trouvés, et le titre pèse plus que les mots-clés, qui pèsent plus que le texte.
4. **Toucher un résultat** ouvre l'article. « Résultats » revient à la liste. Fermer le panneau ramène au champ.

## Code

- `eVe/intuition/tools/help_tool.js` : runtime (ruban, champ, panneau), installé au premier toucher.
- `eVe/intuition/tools/help_tool_model.js` : règles pures (largeur du bandeau, conseil, `searchHelpTopics`).
- `eVe/intuition/tools/help_tool_view.js` : nœuds (bandeau, résultats, article).
- `eVe/intuition/tools/help_tool_topics.js` : le catalogue (données seulement).
- `eVe/i18n/languages_{fr,en}_help.js` : tous les textes.

## Ajouter un sujet

Une entrée `{ id, context: 'project' | 'dashboard' | 'any', keywords: [...] }` dans `help_tool_topics.js`, plus `eve.help.topic.<id>.title` et `.body` en français et en anglais.

## Pistes

- Rediriger une question sans résultat vers l'assistant IA.
- Compléter le catalogue au fil des fonctionnalités.

## Accès depuis le dashboard

Sur eVe Basic, l’outil Aide est dans le coin opposé à Atom. Quand Retour est présent, il occupe le coin et Aide se place juste à côté ; la bande est inversée pour un gaucher. Un toucher ouvre le panneau Aide et son champ de recherche. Dans les dashboards avec recherche, une saisie contenant « help » ou « aide » propose Aide en premier ; choisir ce résultat ouvre le même panneau.

L’assistant et MCP peuvent consulter le même catalogue avec `help.search` ; `help.open` ouvre l’outil existant. Une consultation ne déclenche pas d’action sur les projets. Les articles dont le parcours reste à vérifier le signalent dans leur texte. L’inventaire de déclaration et ses limites figurent dans `eVe/documentations/HELP_CAPABILITY_INVENTORY.md`.
