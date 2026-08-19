# Licences des dépendances tierces à obligation forte

Atome/Squirrel est publié sous licence MIT (`LICENSE`, `package.json`). Ce
fichier recense les dépendances dont la licence impose des obligations à la
**distribution** du produit — c'est-à-dire celles qui ne peuvent pas être
embarquées sans décision.

---

## `rubberband-wasm` — GPL v2 ou ultérieure

| | |
|---|---|
| Paquet npm | `rubberband-wasm` (build WebAssembly de Rubber Band Library) |
| Licence | **GNU General Public License v2 ou ultérieure** |
| Éditeur amont | Breakfast Quay — Rubber Band Library |
| Rôle dans Atome | moteur d'étirement temporel préservant la hauteur (§7.3 de `todo/0 -finalise-features.md`) |
| Consommé par | `eVe/intuition/tools/audio_edit/rubberband_stretch_runtime.js`, enregistré comme moteur `rubberband` dans `stretch_engine.js` |

### Ce que cela implique

La GPL est une licence à réciprocité forte. **Distribuer Atome en embarquant
cette bibliothèque oblige à publier le code source d'Atome sous GPL**, y compris
les parties qui sont aujourd'hui MIT. Les deux seules autres voies sont :

1. **acheter la licence commerciale** de Rubber Band auprès de Breakfast Quay
   (<https://breakfastquay.com/rubberband/license.html>), qui lève l'obligation
   de publication ;
2. **retirer la dépendance** et enregistrer un autre moteur à sa place.

Ce point a été signalé avant l'intégration ; le choix de Rubber Band a été
maintenu par le propriétaire du produit le 17 août 2026. Ce fichier consigne la
décision, il ne la tranche pas.

### Comment en changer

Rien dans Atome ne dépend de Rubber Band en propre : le moteur est enregistré
derrière l'interface `registerStretchEngine`, qui est le seul contrat. En
changer — pour zplane élastique, pour une bibliothèque MIT, ou pour rien — se
fait en enregistrant un autre moteur sous le même contrat, sans toucher au
modèle d'édition, à la persistance ni au transport.

Le slot `zplane_elastique` est d'ailleurs déjà déclaré, `available: false`, en
attente de son SDK.
