# Prompt de verification des tests Molecule / Mtracks

## Mandatory Execution Gate

Before starting any verification, implementation, refactor, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

Tu dois verifier de maniere exhaustive que le panel Molecule / Mtracks est present, conforme a l'architecture canonique des panels, stable visuellement, deplacable, redimensionnable, et qu'il conserve correctement son etat apres chaque interaction.

Avant toute verification, lis et applique strictement:

- `./todos/moelcule_sanitizer.md`
- `./todos/panel_sanitizer.md`
- `./eVe/documentations/Good practices.md`

Objectif: produire une verification fonctionnelle et DOM du panel Molecule / Mtracks, sans patch, sans fallback, sans shim, et sans recreer artificiellement les pistes si elles ne sont pas correctement chargees par le runtime existant.

## 1. Structure canonique attendue

Verifier que le panel Molecule utilise le chrome canonique commun aux panels:

- root de panel unique, rattache au bon hote molecule/groupe ou a la couche canonique selon le mode.
- header canonique present, visible, utilisable comme zone de deplacement.
- body canonique present, avec preview et timeline internes.
- footer canonique present, avec les controles attendus.
- toolsDock canonique present si le panel expose des outils.
- bouton de fermeture issu du chrome canonique, place dans le footer, pas recree localement.
- grip de resize canonique en bas a droite du footer, pas un grip local duplique.
- tokens CSS de panel canonique respectes, sans valeurs locales dupliquees pour header/footer/chrome.

Verifier explicitement que le panel n'est jamais docke directement dans un atome media pur (`video`, `audio`, `image`). Un atome media doit etre membre/source de la molecule, pas le conteneur du panel.

## 2. Contenu interne obligatoire

Verifier que le panel contient au minimum:

- une zone de preview interne, avec le canvas de preview a l'interieur du panel.
- une timeline visible sous la preview.
- un separateur visible et interactif entre la preview et la zone des pistes.
- les pistes video affichees quand la timeline contient des clips video.
- les pistes audio affichees quand la timeline contient des clips audio.
- le ruler / la zone temporelle si le runtime timeline la prevoit.
- les clips existants, positionnes dans leurs pistes.
- les labels ou entetes de pistes si le design courant les expose.
- les outils de timeline attendus par le domaine Molecule / Mtracks.

Ne pas recreer les pistes par du code de test. Si les donnees indiquent qu'elles existent mais qu'elles ne s'affichent pas, signaler une regression d'affichage ou de layout.

Verifier explicitement dans le DOM que les pistes audio et video sont situees sous la zone de preview et sous le separateur preview/tracks. La hierarchie attendue est: panel Molecule, body canonique, zone preview interne, separateur preview/tracks, zone timeline/tracks contenant les pistes audio et video.

## 3. Interactions de deplacement

Tester le deplacement du panel:

- en drag depuis le header.
- en drag depuis le footer si le comportement commun des panels l'autorise.
- en drag depuis la zone outil si cette zone est censee servir de surface de deplacement.

Apres chaque deplacement:

- le panel doit rester dans les limites visibles de l'ecran.
- le panel ne doit pas passer sous la main toolbar en bas.
- le panel ne doit pas sortir a gauche, a droite, en haut ou en bas.
- la taille du panel ne doit pas changer toute seule.
- le panel doit rester deplacable apres le premier drag.
- aucune image ou canvas de fond parasite ne doit reapparaitre derriere le design du panel.
- les tracks doivent rester visibles.

Tester aussi le deplacement apres resize et apres manipulation du separateur preview/tracks.

## 4. Resize du panel complet

Tester le redimensionnement par le grip en bas a droite du footer:

- agrandir le panel.
- reduire le panel.
- relacher le pointeur puis verifier la taille finale.
- deplacer le panel apres resize.
- verifier que la taille definie par l'utilisateur est conservee apres le deplacement.
- verifier que le panel ne s'elargit pas ou ne change pas de taille automatiquement.
- verifier que la taille reste bornee par l'ecran et par la main toolbar en bas.

Tester ensuite:

- double-clic fullscreen.
- double-clic restauration.
- resize apres restauration.
- drag apres restauration.

La taille restauree doit etre exactement la derniere taille utilisateur connue, pas une taille recalculee arbitrairement.

## 5. Double-clic fullscreen / restauration

Tester le double-clic sur:

- le header.
- le footer.

Comportement attendu:

- a l'ouverture initiale par double-clic sur l'atome, la molecule doit deja occuper tout l'espace autorise de l'ecran.
- cette ouverture initiale fullscreen doit respecter la zone interdite de la main toolbar en bas de l'ecran.
- premier double-clic: le panel passe en fullscreen borne.
- le fullscreen occupe tout l'espace autorise.
- le fullscreen respecte la zone interdite de la main toolbar en bas.
- le panel reste dans les marges de viewport prevues par le systeme.
- second double-clic: le panel restaure sa position et sa taille precedentes.
- la restauration conserve la taille utilisateur precedente, y compris si elle etait reduite.
- les pistes et la preview restent visibles et correctement layoutes apres chaque alternance.

## 6. Separateur preview / tracks

Tester le separateur entre la preview et les pistes:

- le deplacer vers le bas pour donner plus de place a la preview.
- verifier que les pistes restent presentes et visibles dans l'espace restant.
- le deplacer vers le haut pour donner plus de place aux tracks.
- verifier que la preview diminue proprement sans sortir du panel.
- verifier qu'aucun canvas ou image de fond parasite ne reapparait.
- verifier que le design global ne change pas de mode ou de structure DOM.
- verifier que le panel reste deplacable apres manipulation du separateur.
- verifier que le panel reste redimensionnable apres manipulation du separateur.

Le separateur ne doit jamais transformer l'hote, externaliser la preview hors du panel, ni casser la hierarchie root/header/body/footer.

## 7. Preview et canvas

Verifier que le canvas de preview:

- est enfant du body Molecule, dans la zone preview attendue.
- n'est pas place en fond du panel.
- n'est pas place comme enfant direct parasite de l'atome hote.
- ne bloque pas les interactions header/footer/grip.
- ne capte pas les evenements de drag du panel quand l'utilisateur agit sur le chrome.

Verifier qu'un canvas media natif appartenant a un atome source ne reste pas visible derriere le panel quand la molecule est ouverte.

## 8. Tracks et timeline

Verifier que les tracks:

- existent dans le DOM quand le payload timeline contient des pistes.
- sont visibles dans le design.
- ne sont pas masquees par la preview.
- ne sont pas masquees par un overflow incorrect.
- restent visibles apres resize du panel.
- restent visibles apres deplacement du separateur.
- restent visibles apres fullscreen/restauration.
- restent visibles apres drag du panel.

Verifier que les interactions internes aux tracks ne declenchent pas un deplacement involontaire du panel.

## 9. Bouton de fermeture

Tester le bouton de fermeture:

- il est visible dans le footer canonique.
- il ferme le panel.
- il nettoie les artefacts de dock.
- il restaure l'hote source.
- il ne laisse pas de panel invisible bloquant les clics.
- il ne laisse pas de canvas parasite ou de surface overlay morte.
- rouvrir ensuite la molecule et verifier que le panel revient dans un etat propre.

## 10. Non-regressions DOM

Inspecter le DOM apres chaque grande interaction et verifier:

- un seul panel Molecule actif.
- pas de duplication de root/header/body/footer.
- pas de duplication de tracks.
- pas de preview externalisee si le mode attendu est preview interne.
- pas d'atome `video/audio/image` utilise comme hote direct du panel.
- pas de `position: fixed` parasite applique a un atome media source a cause du dock.
- pas de `z-index` extreme conserve sur un hote ferme.
- pas de listeners ou timers visibles qui continuent a modifier le layout apres interaction.

## 11. Rapport attendu

Produire un rapport avec:

- chaque element attendu: present / absent.
- chaque interaction testee: ok / echec.
- la ligne DOM ou le selecteur implique en cas d'echec.
- la cause racine probable, pas seulement le symptome.
- les fichiers suspects si une correction est necessaire.

Ne pas corriger par patch local. Toute correction doit remonter au module canonique ou au proprietaire architectural du comportement.
