# Finder — scope Lieu et carte native Bevy

Date : 2026-08-05

## La règle d'ordonnancement, née d'une erreur

Le scope `place` du Finder a été **retiré** pendant la migration du panel, au
motif que sa carte Leaflet n'était pas portable en l'état. C'était une décision
produit prise par le migrateur, pas par le propriétaire du produit, et elle a
fait disparaître une fonction : localiser un endroit physique.

La cause n'est pas le jugement porté sur Leaflet — il était exact. C'est
**l'ordre** : le panel a été migré avant que le sort de la carte soit tranché,
et une pièce « pas encore portable » est devenue une pièce « supprimée ».

**Règle, désormais contraignante pour tout panel :**

> On arrête d'abord le périmètre complet du panel — tous ses scopes, toutes ses
> vues, y compris celles qui semblent difficiles — **puis** on migre. Une pièce
> qu'on ne sait pas encore porter se **planifie** ; elle ne se retire jamais au
> fil de la migration. Retirer une fonction est une décision produit et exige
> une approbation explicite, au même titre qu'une suppression de fichier.

Corollaire pratique : le registre de retirement doit être écrit **avant** la
migration, pas après. Une ligne « supprimé, rien migré » qui apparaît en cours
de route est le signal d'alarme.

## Pourquoi Leaflet n'a pas été « converti »

Leaflet construit ses propres éléments DOM — conteneur, tuiles `img`, contrôles,
attribution. Rien de tout cela ne peut exister dans un canvas WebGPU. Il ne
s'agissait donc pas de traduire `map.js` ligne à ligne mais de **réécrire la
carte** sur les primitives Bevy. Le legacy reste la spécification du
comportement ; il n'est pas la source du code.

Ce qui **a** été réutilisé, sans modification :

- le géocodeur Nominatim, du `fetch` pur, indépendant du rendu ;
- le pipeline d'images Bevy, qui charge déjà les URL distantes
  (`bevy_media_texture_resolver.js`, `crossOrigin = 'anonymous'`) ;
- le cache de textures LRU, borné en entrées **et** en octets — exactement ce
  qu'une carte à tuiles réclame.

## Architecture

| Module | Rôle |
|---|---|
| `atome/src/squirrel/components/slippy_map_contract.js` | Projection Web Mercator, grille de tuiles, pan, zoom. Pur, sans DOM ni réseau. |
| `eVe/intuition/runtime/bevy_panel/bevy_panel_map.js` | Composition : tuiles en nœuds image, marqueur, attribution, intents. |
| `eVe/intuition/runtime/bevy_panel/bevy_panel_finder_place_runtime.js` | Géocodage débouncé, état carte, navigation. |

Le panel Finder ne fait que router : le scope `place` remplace le tableau par la
carte et **masque l'en-tête triable**, comme le legacy le faisait
(`canDisplayHeader = effectiveScope !== 'place'`).

## Contraintes de fournisseur — à décider par le propriétaire

- **Tuiles.** Le gabarit d'URL vit derrière **une seule constante**,
  `TILE_TEMPLATE` dans `bevy_panel_map.js`. Les tuiles OSM publiques conviennent
  au développement ; leur politique d'usage **interdit** un trafic applicatif
  soutenu. Basculer vers un fournisseur dédié doit rester un changement d'une
  ligne, et aucun appelant ne construit d'URL lui-même.
- **Attribution.** La politique d'usage des tuiles l'exige. Elle est composée
  dans le canvas et une garde de probe vérifie sa présence à tous les zooms —
  ce n'est pas de la décoration.
- **Débit du géocodage.** Nominatim plafonne à une requête par seconde. La
  requête est débouncée (`geocodeDebounceMs`, 600 ms) au lieu de partir à chaque
  frappe.

## Critères de sortie

- Les quatre scopes s'affichent : **Atome, Outils, People, Lieu**.
- Une requête géocode, centre la carte et pose le marqueur ; le pan et le zoom
  répondent.
- Aucun nœud Leaflet, aucun `window.L` consommé, un seul canvas.
- Les assets Leaflet (~299 Ko) quittent le shell : la bibliothèque n'est plus
  utilisée, seules les tuiles le sont.
- Approbation produit explicite sur le rendu réel avant toute suppression.
