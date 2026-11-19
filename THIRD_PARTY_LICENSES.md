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

---

## Code porté à attribution — Étirement temporel (Signalsmith Stretch)

| Composant | Licence | Rôle |
|---|---|---|
| [Signalsmith Stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch) 1.3.1 | **MIT** | étirement en temps réel du sampler et warp des clips audio de la Timeline |
| [Signalsmith Linear](https://github.com/Signalsmith-Audio/linear) (STFT, FFT réelle à demi-case) | **MIT** | transformée sous l'étirement |

Porté en Rust (18 nov. 2026, R-178) dans `atome/engines/atome-instrument/src/stretch/engine.rs` et `stretch/stft.rs`, sans code
C++ ni dépendance `signalsmith-stretch` : il tourne sur toutes les cibles, le Web (wasm32) compris. La FFT complexe est `rustfft`
(MIT/Apache 2.0). Équivalence vérifiée contre le C++ d'origine : `temp/warp_2026-11-18/compare`. La MIT demande de garder la notice
ci-dessous avec toute copie ou portion substantielle :

```
MIT License

Copyright (c) 2022 Geraint Luff / Signalsmith Audio Ltd.
Copyright (c) 2025 Signalsmith Audio

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Dépendance embarquée à attribution — Lecteur de livres (PDF)

| Composant | Licence | Rôle |
|---|---|---|
| [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist` 6.4.299) | **Apache 2.0** | ouverture et rastérisation des pages PDF du lecteur « Livre » |
| Polices standard de pdf.js (Foxit, Liberation) | BSD (Foxit), **SIL OFL 1.1** (Liberation) | polices des PDF qui n'embarquent pas les leurs |
| Décodeurs d'images de pdf.js (OpenJPEG, JBIG2, QCMS) | BSD-2-Clause (OpenJPEG), Apache 2.0 (JBIG2 de pdf.js), MIT (QCMS) | images JPEG 2000 / JBIG2, profils ICC |

Copiés sans modification par `scripts/bundle-pdfjs.js` sous `atome/src/assets/vendor/pdfjs/` (avec `LICENSE`, `standard_fonts/LICENSE_*`
et `wasm/LICENSE_*`), servis sur les quatre cibles avec l'arbre `atome/`. Consommé par le seul `eVe/domains/books/pdf_document.js`.
MuPDF n'est **pas** utilisé (AGPLv3, incompatible avec la licence MIT d'Atome sans licence commerciale). L'EPUB est lu par un moteur
interne (`eVe/domains/books/epub_document.js`), sans dépendance.


## Données embarquées à attribution — Catalogue d'aliments de la liste de courses

| Données | Licence | Rôle |
|---|---|---|
| [Table de composition nutritionnelle des aliments Ciqual 2025](https://doi.org/10.57745/RDMHWY), ANSES, mise à jour du 19/11/2025 | **Licence Ouverte / Open Licence 2.0 (Etalab)** | aliments génériques par rayon, noms FR/EN, énergie (kcal/100 g) |

Extrait par `scripts/generate_food_catalogue.mjs` (sélection des aliments qu'on achète, noms raccourcis, une entrée par nom et par rayon)
dans `atome/src/assets/food/ciqual_2025.json`, servi sur les quatre cibles avec l'arbre `atome/`. Consommé par le seul
`eVe/domains/shopping/food_catalogue.js`. Le même script écrit la table nutritionnelle `atome/src/assets/food/ciqual_2025_composition.json`
(les 3 484 aliments, 8 nutriments de la déclaration UE pour 100 g, valeurs « traces », « < x » et « - » conservées), consommée par le
seul `eVe/domains/shopping/food_composition.js`. La licence autorise la réutilisation et la redistribution, y compris commerciale, à
condition de **mentionner la source et la date de sa dernière mise à jour** : « Anses. 2025. Table de composition nutritionnelle des
aliments Ciqual » (bloc `source` de l'asset et cette page ; rien n'est affiché dans l'interface, conformément au contrat zen).


## Données embarquées — Frontières des pays de la CB sociale (Bouteille)

| Données | Licence | Rôle |
|---|---|---|
| [Natural Earth](https://www.naturalearthdata.com) admin-0 countries 1:110m (`ne_110m_admin_0_countries.geojson`, dépôt `nvkelso/natural-earth-vector`, VERSION 5.2.0-pre) | **Domaine public** (aucune attribution exigée ; mentionnée ici par courtoisie) | le pays d'une position, calculé sur l'appareil (R-173 lot L2b) |

Réduit par `temp/cb_l2b_2026-11-16/build_borders.mjs` (code ISO_A2_EH, coordonnées arrondies à 0,01°, anneaux vides retirés ; sha256 de la source
dans le fichier) dans `eVe/domains/cb_social/data/ne_110m_admin0_countries.json` (≈ 140 Ko, 175 pays), consommé par le seul
`eVe/domains/cb_social/cb_country.js`. Ce n'est pas une dépendance npm ni cargo.


## Dépendance embarquée à attribution — Enregistrement des voix de la CB sociale

| Composant | Licence | Rôle |
|---|---|---|
| [ogg](https://github.com/RustAudio/ogg) 0.9.2 (crate cargo, Rust pur) | **BSD-3-Clause** | écriture des prises de parole de la CB en Ogg Opus, sans transcodage (R-173 lot L4) |

Dépendance du seul `atome-server` (`atome/servers/atome-server/src/social/cb/recordings/ogg_opus.rs`), validée par l'utilisateur le
15 nov. 2026. Elle ne fait que mettre en pages Ogg les paquets Opus reçus. Le binaire du serveur n'est pas distribué aux
utilisateurs. S'il l'était, sa documentation devrait reproduire la notice ci-dessous.

```
Copyright (c) 2016-2017 est31 <MTest31@outlook.com> and contributors
Copyright (c) 2002-2015 Xiph.org Foundation

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:

- Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.

- Redistributions in binary form must reproduce the above copyright
notice, this list of conditions and the following disclaimer in the
documentation and/or other materials provided with the distribution.

- Neither the name of the Xiph.org Foundation nor the names of its
contributors may be used to endorse or promote products derived from
this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE FOUNDATION
OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```


## Données consultées à attribution — Produits du commerce

| Données | Licence | Rôle |
|---|---|---|
| [Open Food Facts](https://world.openfoodfacts.org), [Open Beauty Facts](https://world.openbeautyfacts.org), [Open Products Facts](https://world.openproductsfacts.org) — base de données | **Open Database License (ODbL) 1.0** | fiche d'un produit (code-barres, nom, marque, Nutri-Score, NOVA, additifs, allergènes, nutriments), recherche, alternatives |
| Contenus individuels de ces bases | **Database Contents License (DbCL) 1.0** | idem |
| Images des produits (`image_url`) | **Creative Commons Attribution-ShareAlike (CC BY-SA)** ; une image peut contenir des éléments de tiers soumis à d'autres droits | photo du produit sur sa fiche |
| Taxonomie des additifs d'Open Food Facts (`additives.json`, risque de surexposition évalué par l'EFSA) | ODbL 1.0 | risque de chaque additif, entrée du verdict de `atome/src/shared/food_health_assessment.js` |

Lues à la demande par le seul `server/ws_open_food_facts.js` (trame `food-facts` sur `/ws/api`, relayée par les serveurs natifs
Tauri et iOS), gardées en mémoire du serveur quelques heures, et sur un article de la liste de courses seulement l'identité, les
scores et le verdict du produit (`eVe/domains/shopping/food_runtime.js#storedFoodProduct`). Aucune base dérivée n'est publiée.
Mention : « Données produits : Open Food Facts, contributeurs, sous licence ODbL ». Elle figure sur cette page et sur la
page « À propos / Sources » de l'application (décision de l'utilisateur du 2026-10-28, `todo/etude_nutrition_menus_2026-10-27.md`
§8.6 ; page à concevoir), jamais sur la fiche produit. Le verdict est l'évaluation ouverte d'eVe, pas un score d'Open Food Facts.
