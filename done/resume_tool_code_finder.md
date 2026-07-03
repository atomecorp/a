# Resume de la demande et du probleme

## Demande initiale

Ajouter un nouvel outil `Code` dans eVe.

Contraintes demandees :

- L'outil doit ouvrir l'editeur de code existant.
- Il doit etre disponible uniquement via l'outil de recherche / Finder.
- Il ne doit pas apparaitre dans les menus.
- Il doit pouvoir etre depose sur le bureau par drag and drop depuis la fenetre de resultats Finder.
- Il doit utiliser l'icone `./atome/src/assets/images/icons/code.svg`.

## Probleme constate

Lors du drag and drop d'un outil depuis la fenetre de resultats Finder vers le bureau, le comportement etait incorrect.

Comportement attendu :

- Deposer l'outil existant sur le bureau.
- Creer une instance de projection d'outil conforme.
- Ne pas creer de nouvel atome metier.
- Ne pas creer de pseudo-outil.
- Ne pas creer un atome de type `shape`.

Comportement observe :

- Le drop recreait un pseudo-outil non conforme.
- L'ancien chemin creait ou utilisait une representation type `tool_shortcut`.
- Le systeme pouvait creer un nouvel atome de type `shape`.
- Cela multipliait les atomes inutilement et rendait l'architecture confuse.

## Cause racine identifiee

Le chemin Finder drag/drop utilisait encore une ancienne architecture de raccourci d'outil.

Cette ancienne architecture reposait sur :

- des marqueurs DOM `data-tool-shortcut`;
- le role `tool_shortcut`;
- des donnees persistantes de type Atome / `shape`;
- un montage visuel qui melangeait projection d'outil et creation d'atome.

Ce modele etait incompatible avec le comportement attendu : un outil depose depuis Finder doit etre une instance d'outil, pas un nouvel atome `shape`.

## Correction architecturale visee

Le nouveau chemin doit etre :

1. Finder fournit un payload d'outil canonique.
2. Le drop projet identifie le `tool_id`.
3. Le runtime cree une instance `tool_instance`.
4. Le bureau monte une projection DOM de cette instance.
5. Le deplacement met a jour l'instance, pas un atome `shape`.

Nouveau contrat DOM attendu :

```html
<div
  data-tool-projection-host="true"
  data-tool-instance-id="tool_instance_..."
  data-projection-record-type="tool_instance"
  data-source-tool-id="ui.code.editor">
</div>
```

Ce contrat remplace le vieux modele :

```html
<div
  data-tool-shortcut="true"
  data-atome-id="..."
  data-atome-role="tool_shortcut">
</div>
```

## Probleme restant observe apres correction

Le DOM montre maintenant bien un `tool_instance`, ce qui confirme que le vieux chemin `shape/tool_shortcut` n'est plus utilise pour ce drop.

Mais le payload Finder contenait encore des metadonnees obsoletes :

- `data-source-tool-name-key="editor"`
- `data-source-tool-icon=""`
- `data-icon=""`
- `src=""`

Cela signifie que le bon outil est depose, mais avec un ancien record Finder ou catalogue non canonique.

## Cause du probleme restant

Finder possedait deja un ancien enregistrement persistant pour `ui.code.editor`.

La fusion entre les resultats persistants et le registre canonique gardait l'ancien record si le `tool_id` existait deja.

Effet :

- le registre canonique contenait l'outil `Code`;
- mais Finder gardait l'ancien record `editor`;
- l'icone canonique n'etait pas transmise;
- le bouton et l'image recevaient une icone vide.

## Correction appliquee

La fusion Finder doit maintenant laisser le registre canonique remplacer les metadonnees obsoletes pour un meme `tool_id`.

Ainsi, pour `ui.code.editor`, la source canonique doit fournir :

- `tool_key: "code"`;
- `name_key` coherent avec l'outil Code;
- `icon: "./atome/src/assets/images/icons/code.svg"`;
- `icon_key: "./atome/src/assets/images/icons/code.svg"`.

## Regle importante

Le code deprecated ou non utilise doit etre supprime imperativement.

Dans ce contexte, cela implique :

- supprimer les anciens chemins actifs `tool_shortcut` pour le drop Finder;
- ne pas conserver de fallback vers la creation de `shape`;
- ne pas ajouter de couche de compatibilite provisoire;
- verifier les usages avant suppression;
- ajouter des tests empechant la reintroduction du vieux chemin.

## Validations ajoutees

Des tests ciblent maintenant :

- l'enregistrement Finder-only de l'outil Code;
- le store `tool_instance`;
- l'absence du vieux contrat `tool_shortcut` dans le chemin actif `project_drop.js`;
- la preservation des icones dans le payload Finder;
- le remplacement des vieux records Finder par le registre canonique.

