# Prompt amélioré — Interface DAW / séquenceur audio-vidéo HTML

Crée un fichier **HTML autonome** reproduisant une interface DAW / séquenceur audio-vidéo sombre, compacte, minimaliste, réaliste et professionnelle.

Le résultat doit être un **mockup visuel statique** en **HTML + CSS + SVG inline uniquement**.

## Contraintes techniques obligatoires

- Fournir un seul fichier HTML complet.
- Ne pas utiliser de framework.
- Ne pas utiliser de bibliothèque externe.
- Ne pas utiliser de fichier image externe.
- Ne pas utiliser de canvas.
- Ne pas dépendre de JavaScript pour dessiner les éléments principaux.
- Tous les éléments visuels doivent exister directement dans le DOM en HTML/CSS/SVG.
- Utiliser SVG inline pour :
  - la preview vidéo futuriste,
  - les miniatures vidéo,
  - les waveforms audio des clips,
  - la waveform détaillée du sample.
- Le rendu doit rester visible et complet même si JavaScript est désactivé.
- Prévoir une largeur réaliste de mockup, environ `1440px`, centrée dans la page.
- Utiliser une structure CSS claire avec variables pour les dimensions principales.

## Objectif visuel

Créer une interface de timeline audio/vidéo de type séquenceur moderne avec :

- preview vidéo en haut,
- zone de tracks dense,
- clips audio/vidéo/groupes/sampler/FX,
- ruler compact,
- zone de sélection verte dans le ruler,
- marqueurs colorés,
- waveform détaillée orange,
- tête de lecture verticale,
- barre d’outils inférieure.

Le style doit ressembler à un logiciel professionnel de montage/séquence audio-vidéo, pas à une maquette décorative générique.

## Style général

- Thème sombre noir / gris très foncé.
- Design flat, net, réaliste, dense mais lisible.
- Interface compacte, sans zones vides inutiles.
- Typographie sans-serif blanche ou gris clair.
- Couleurs sobres avec accents : rouge, bleu, vert, orange, violet, cyan.
- Clips et boutons avec coins légèrement arrondis.
- Bordures discrètes, ombres très légères.
- Aucun effet glossy excessif.
- Aucun panneau inutile.
- Aucun inspecteur.
- Aucune barre de transport en haut.
- Aucun menu superflu.

## Dimensions et alignement global

Définir des variables CSS similaires à celles-ci :

```css
:root {
  --app-width: 1440px;
  --header-width: 112px;
  --timeline-width: calc(var(--app-width) - var(--header-width));
  --track-height: 42px;
  --ruler-height: 28px;
  --marker-height: 28px;
  --sample-height: 132px;
  --toolbar-height: 62px;
}
```

Règle critique :

- Le bord gauche des clips, du ruler, des marqueurs et de la waveform détaillée doit commencer exactement au même X.
- Le ruler ne doit jamais commencer sous les headers de tracks.
- Les marqueurs ne doivent jamais commencer sous les headers de tracks.
- Le début de la zone clips doit être aligné horizontalement avec le début du ruler et des marqueurs.
- Le ruler doit être situé sous les tracks.
- Les marqueurs doivent être immédiatement sous le ruler.
- La waveform détaillée doit être immédiatement sous les marqueurs.
- L’espace vertical entre ruler, marqueurs et sample doit être de `0px` à `1px` maximum.

## Structure verticale obligatoire

L’interface doit être organisée strictement dans cet ordre :

1. Preview vidéo
2. Zone des tracks
3. Ruler
4. Zone marqueurs
5. Zone sample détaillée
6. Barre d’outils inférieure

Ne pas insérer de bande “Timeline”, de titre ou de toolbar entre la preview et les tracks.

---

# 1. Preview vidéo

- Placée tout en haut.
- Centrée horizontalement.
- Format large panoramique, environ `760px × 250px`.
- Fond noir autour.
- Aucun bouton.
- Aucun label.
- Aucune UI dans la preview.
- Contenir uniquement une image futuriste en SVG inline :
  - fond noir / violet sombre,
  - profondeur ou grille subtile,
  - triangle lumineux ou tunnel néon,
  - accents cyan, violet, rose ou bleu.

La preview ne doit pas contenir d’overlay de contrôle vidéo.

---

# 2. Zone des tracks

La zone des tracks est directement sous la preview, sans bande intermédiaire.

## Layout tracks

Chaque ligne de track est une grille à deux colonnes :

```css
grid-template-columns: var(--header-width) var(--timeline-width);
```

## Headers de tracks

À gauche : headers réduits en largeur, environ moitié d’un header standard.

Chaque header doit afficher uniquement :

- un petit carré de couleur,
- le nom de la track.

Interdictions dans les headers :

- ne pas afficher d’icône œil,
- ne pas afficher de bouton mute/solo,
- ne pas afficher de type générique “Video” ou “Audio”,
- ne pas afficher d’extension de fichier,
- ne pas ajouter d’icône décorative.

Noms de tracks à utiliser, dans cet ordre :

- Intro
- Music_Intro
- Group 1
- Layer 1
- Layer 2
- Kick
- Snare
- Hat
- Bass
- FX

## Zone timeline des clips

À droite des headers : zone timeline.

Règles :

- Les clips doivent être placés dans la zone timeline uniquement.
- Les clips ne doivent pas être collés les uns aux autres.
- Les clips doivent avoir des longueurs différentes.
- Les clips doivent être espacés de façon irrégulière.
- Les clips doivent occuper quasiment toute la hauteur de leur track.
- Chaque track doit contenir au moins un élément visible.
- L’ensemble doit donner une timeline non linéaire, réaliste, pas une grille régulière.

## Clips

Chaque clip doit être un bloc avec :

- coins légèrement arrondis,
- couleur sombre selon son type,
- bordure discrète,
- contenu interne selon le type,
- handle de redimensionnement à gauche,
- handle de redimensionnement à droite.

## Handles obligatoires

Chaque clip, chaque marqueur et la zone de sélection du ruler doivent avoir des embouts identiques :

- trait vertical de `3px`,
- pleine hauteur de l’élément,
- placé à gauche et à droite,
- couleur claire adaptée à l’élément,
- même style sur tous les clips, marqueurs et sélection.

Les handles doivent être visibles, pas symboliques.

## Types de clips

### Clips vidéo

- Couleur : rouge sombre.
- Afficher certains clips avec miniature visuelle SVG inline.
- Miniature : abstraite, futuriste, néon, ou image stylisée.
- Ne pas afficher d’extension de fichier.

### Clips audio

- Couleur : bleu sombre.
- Afficher une waveform fine en SVG inline dans chaque bloc audio.
- Waveform claire bleutée ou cyan discret.
- Pas de gros blocs simplistes : la waveform doit avoir plusieurs variations.

### Clips groupes/layers

- Couleur : vert sombre.
- Peut contenir de petites lignes ou segments internes subtils.
- Tracks concernées : Group 1, Layer 1, Layer 2.

### Clips sampler/drums

- Couleur : orange sombre.
- Afficher de petits ticks internes réguliers ou semi-réguliers.
- Tracks concernées : Kick, Snare, Hat.

### Bass

- Clip audio sombre avec waveform plus large ou plus lourde.
- Couleur dominante bleu sombre ou bleu-vert sombre.

### FX

- Zone sombre avec hachures discrètes.
- Accents violets ou gris.
- Peut contenir un ou deux blocs FX, espacés.

---

# 3. Tête de lecture

Ajouter une tête de lecture verticale qui traverse :

- les tracks,
- le ruler,
- les marqueurs,
- la waveform détaillée.

Règles :

- Trait vertical blanc fin, environ `1px` à `2px`.
- Placée dans la timeline, pas dans les headers.
- Le triangle de tête de lecture est en bas du trait.
- Le triangle est orienté vers le haut.
- Ne pas placer le triangle en haut.
- Le triangle doit être visible au-dessus de la waveform ou en bas de la zone traversée.

---

# 4. Ruler

Le ruler est sous les tracks et au-dessus des marqueurs.

## Layout ruler

Le ruler doit être une grille à deux colonnes :

```css
grid-template-columns: var(--header-width) var(--timeline-width);
```

À gauche : zone sombre alignée avec les headers.

Cette zone gauche contient uniquement :

```text
00:00:00:00
```

Interdictions côté gauche du ruler :

- pas de bouton plus,
- pas d’icône,
- pas de menu,
- pas de label supplémentaire.

## Ruler timeline

La partie timeline du ruler doit :

- commencer exactement au même X que les clips,
- avoir la même largeur que la zone clips,
- avoir une hauteur compacte,
- contenir des graduations temporelles,
- afficher des ticks mineurs et majeurs,
- afficher quelques labels temporels discrets.

## Zone de sélection verte

Dans le ruler uniquement, ajouter une zone de sélection verte :

- légèrement transparente,
- occupe toute la hauteur du ruler,
- reste confinée au ruler,
- ne déborde ni au-dessus ni en dessous,
- ne crée pas de bande verte supplémentaire.

La sélection verte doit avoir :

- un handle gauche standard,
- un handle droit standard,
- traits vert clair ou blancs verdâtres,
- pleine hauteur de la sélection.

---

# 5. Zone marqueurs

La zone marqueurs est immédiatement sous le ruler.

## Layout marqueurs

La zone marqueurs doit être une grille à deux colonnes :

```css
grid-template-columns: var(--header-width) var(--timeline-width);
```

À gauche : zone vide sombre alignée avec les headers.

Interdictions côté gauche :

- pas de bouton plus,
- pas d’icône,
- pas de label,
- pas de contrôle.

## Marqueurs

Dans la partie timeline, créer les blocs :

- Intro
- Part A
- Part B
- Breakdown
- Part C
- Outro

Règles :

- Les blocs marqueurs ne doivent pas être collés.
- Il doit y avoir des espaces irréguliers entre eux.
- Les longueurs doivent être différentes.
- Chaque bloc doit occuper presque toute la hauteur de la zone marqueurs.
- Chaque bloc doit avoir un handle gauche et un handle droit standard.
- Les labels doivent être lisibles.

Couleurs :

- Intro : violet.
- Part A : bleu.
- Part B : vert.
- Breakdown : jaune / marron.
- Part C : orange.
- Outro : cyan sombre.

---

# 6. Zone sample détaillée

La zone sample détaillée est immédiatement sous les marqueurs.

## Layout sample

Utiliser encore une grille à deux colonnes :

```css
grid-template-columns: var(--header-width) var(--timeline-width);
```

À gauche : zone sombre vide alignée avec les headers.

À droite : waveform détaillée.

## Waveform détaillée

La zone doit contenir uniquement le visuel détaillé de la waveform.

Règles :

- fond noir très sombre,
- waveform orange en SVG inline,
- waveform dense, détaillée, irrégulière,
- remplissage horizontal complet,
- aucune UI interne,
- aucun label,
- aucun bouton,
- aucun contrôle zoom,
- aucun menu,
- aucun texte.

Option autorisée :

- une sélection subtile orange/brun légèrement transparente dans la waveform.

Mais cette sélection ne doit pas contenir de label ni de contrôle.

---

# 7. Barre d’outils inférieure

La barre d’outils est placée tout en bas, sous la waveform.

Règles :

- Ajouter uniquement cette zone en bas.
- Ne pas modifier le reste de l’interface pour compenser.
- Les outils sont alignés en ligne.
- Chaque outil est contenu dans un carré sombre.
- Coins des carrés : environ `3px`.
- Les carrés sont collés les uns aux autres, sans gros espace.
- Chaque carré contient :
  - une icône blanche ou gris clair centrée,
  - un label sous l’icône.
- Icônes possibles : caractères Unicode sobres ou petits SVG inline.
- Labels lisibles mais compacts.

Outils à afficher, dans cet ordre :

1. Play
2. Stop
3. Record
4. Rewind
5. Fast Forward
6. Loop
7. Metronome
8. Mute
9. Solo
10. Cut
11. Delete
12. Split
13. Join
14. Zoom In
15. Zoom Out

---

# Interdictions absolues

Ne pas ajouter :

- panneau inspecteur,
- barre de transport en haut,
- menu principal,
- bande “Timeline” entre preview et tracks,
- bouton plus,
- icône œil,
- contrôles dans la preview,
- contrôles dans la waveform détaillée,
- labels “Video” ou “Audio” dans les headers,
- extensions de fichiers dans les noms,
- zones blanches ou claires dominantes,
- design coloré fantaisie,
- longues zones vides inutiles.

Ne pas faire :

- coller tous les clips,
- coller tous les marqueurs,
- donner la même longueur à tous les clips,
- donner la même longueur à tous les marqueurs,
- placer le ruler ailleurs que sous les tracks,
- faire commencer le ruler sous les headers,
- faire commencer les marqueurs sous les headers,
- faire déborder la sélection verte hors du ruler,
- placer le triangle de lecture en haut,
- masquer des éléments dans un canvas,
- dépendre d’un script pour afficher les éléments demandés.

---

# Contrôle qualité avant livraison

Avant de livrer le HTML, vérifier explicitement que :

- la preview est visible en haut et sans UI ;
- les 10 tracks sont présentes ;
- les headers n’affichent que carré couleur + nom ;
- les clips commencent au même X que le ruler et les marqueurs ;
- les clips ont des longueurs différentes ;
- les clips ont des espaces irréguliers ;
- tous les clips ont un handle gauche et un handle droit ;
- les clips vidéo ont au moins certaines miniatures ;
- les clips audio ont des waveforms visibles ;
- les clips drums/sampler ont des ticks internes ;
- la zone FX a des hachures discrètes ;
- le ruler est sous les tracks ;
- le ruler commence après la colonne header, pas dessous ;
- la sélection verte est uniquement dans le ruler ;
- la sélection verte a deux handles ;
- la zone marqueurs est immédiatement sous le ruler ;
- les marqueurs commencent au même X que le ruler ;
- les marqueurs ont des longueurs différentes ;
- les marqueurs ne sont pas collés ;
- tous les marqueurs ont deux handles ;
- la waveform détaillée est immédiatement sous les marqueurs ;
- la waveform détaillée n’a aucun label ni bouton ;
- la tête de lecture traverse tracks, ruler, marqueurs et sample ;
- le triangle de tête de lecture est en bas et orienté vers le haut ;
- la barre d’outils inférieure contient bien les 15 outils demandés ;
- aucun élément interdit n’a été ajouté.

## Résultat attendu

Livrer uniquement le fichier HTML final, propre, autonome et complet.

Le rendu doit être une interface sombre, compacte, réaliste et lisible, ressemblant à un séquenceur audio/vidéo moderne avec timeline non linéaire, clips espacés, marqueurs espacés, ruler compact avec sélection verte redimensionnable, waveform détaillée orange et barre d’outils inférieure.
