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

---

## Dépendances embarquées à attribution — Audio → MIDI

Ces trois-là ne posent **aucune obligation de réciprocité** : elles sont
permissives et n'imposent que la conservation des notices. Elles sont recensées
ici parce qu'elles sont **redistribuées avec le produit** (bundle et modèle
committés sous `atome/src/assets/vendor/basic-pitch/`), pas parce qu'elles
contraignent la licence d'Atome.

| Composant | Licence | Rôle |
|---|---|---|
| [Basic Pitch](https://github.com/spotify/basic-pitch-ts) (`@spotify/basic-pitch`) | **Apache 2.0** | transcription audio → notes MIDI, modèle inclus |
| [TensorFlow.js](https://github.com/tensorflow/tfjs) (`@tensorflow/tfjs`) | **Apache 2.0** | inférence du modèle Basic Pitch (backends `webgl` et `cpu`) |
| [@tonejs/midi](https://github.com/Tonejs/Midi) | **MIT** | écriture du fichier MIDI standard |

Consommé par : `eVe/intuition/tools/audio_to_midi/` (outil Flower **Audio to MIDI**,
`ui.audio.to_midi`).

### Ce que cela implique

Apache 2.0 demande de conserver les notices de copyright et le texte de la
licence lors de la redistribution, et de signaler les modifications apportées.
Aucune modification n'a été apportée au code amont : `scripts/bundle-basic-pitch.js`
ne fait que **rassembler** les builds publiés par esbuild, sans les altérer.

Le texte de la licence Apache 2.0 de Basic Pitch est conservé à côté du bundle,
dans `atome/src/assets/vendor/basic-pitch/LICENSE`, et il est redistribué avec
lui sur les quatre cibles (web, Tauri, iOS, AUv3) puisque l'arbre `atome/` entier
est servi ou copié tel quel.

### Attribution

Basic Pitch est un projet publié par Spotify sous Apache 2.0. L'attribution
ci-dessus est **factuelle** : elle ne fait pas d'Atome un produit approuvé,
soutenu ou certifié par Spotify. Le logo Spotify n'est pas utilisé, et l'outil
est nommé « Audio to MIDI » dans l'interface, sans marque tierce.

### Comment en changer

Le moteur est isolé derrière `eVe/intuition/tools/audio_to_midi/engine.js`, qui
est le seul module à connaître Basic Pitch et TensorFlow.js. `midi_writer.js`,
`context.js`, `result_media.js` et l'entrée Flower ne dépendent que de ses
sorties (une liste de notes). En changer — pour ONNX Runtime Web, déjà vendoré
sous `atome/src/assets/vendor/onnxruntime-web/`, ou pour autre chose — se fait
dans ce seul fichier.
