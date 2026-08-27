# Prompt complet — évolution de l’outil Liste / Hiérarchie / Lecture / Pistes multimédia

Objectif : modifier et compléter l’outil existant dans atome/eVe sans réinventer ce qui fonctionne déjà. Le projet possède déjà une grande partie du code de molécules, de navigation, de liste, de sélection, de preview, de drag & drop, de lecture et de structure générale. Il faut d’abord analyser l’existant et réutiliser au maximum les composants, structures de données, comportements et styles déjà en place. Ne pas recréer un système parallèle. Ne modifier que ce qui manque, ce qui est incohérent avec le présent cahier des charges, ou ce qui doit être étendu.

La priorité est de préserver la cohérence du framework existant et d’éviter le code zombie, les duplications, les nouveaux sous-systèmes inutiles et les régressions. Toute nouvelle logique doit s’intégrer à l’architecture existante. Avant toute modification importante, identifier les éléments déjà disponibles, les réutiliser, puis ajouter uniquement la couche minimale nécessaire.

## 1. Philosophie générale

L’outil doit rester mobile-first, sombre, minimal, extrêmement lisible et cohérent avec le design squirrel / atome/eVe existant.

Ne pas transformer l’interface en explorateur de fichiers, DAW classique, tableau Excel ou dashboard surchargé.

Ne pas ajouter d’éléments décoratifs sans fonction claire.

Ne pas introduire de nouvelles conventions visuelles si une convention existante peut être réutilisée.

La complexité du moteur peut être élevée, mais l’interface utilisateur doit rester simple.

L’utilisateur débutant doit pouvoir utiliser une chanson multipiste simple sans comprendre toute la profondeur du système.

L’utilisateur avancé doit pouvoir construire des molécules imbriquées et des comportements complexes sans que l’interface change de géométrie.

## 2. Structure générale de l’écran

Conserver la structure existante :

- Grand preview fixe en haut.
- Liste verticale d’objets sous le preview.
- Colonne contextuelle verticale fixe à droite, alignée vers le bas.
- Footer du conteneur courant en bas de la liste, juste au-dessus de la toolbox principale.
- Toolbox / navigation standard fixe en bas.

Ne pas ajouter de header supplémentaire.

Ne pas déplacer la colonne contextuelle droite vers le haut.

Ne pas redesign la toolbox principale du bas.

Le preview supérieur doit conserver ses proportions généreuses et afficher le contenu de l’objet sélectionné.

## 3. Structure géométrique de chaque ligne

Chaque ligne doit garder exactement la même géométrie quelle que soit la profondeur hiérarchique.

Nouvelle structure finale :

[Hiérarchie][Mute][Nom][Prévisualisation média]

Le bouton Solo a été supprimé.

La taille du carré de base sert d’unité de mesure.

Une ligne a exactement la hauteur d’un carré de base.

### 3.1 Hiérarchie

Première cellule = carré strict.

Largeur = hauteur.

Le carré entier est interactif.

Aucun bouton interne.

Aucun cadre dans le cadre.

Aucune ombre de bouton.

Aucun support secondaire.

Contenu :

- ▶ = objet replié avec enfants.
- ▼ = objet déplié avec enfants.
- rien = feuille sans enfant.

Clic simple sur la cellule Hiérarchie :
déplier / replier les enfants dans la liste courante.

La vue courante ne change pas.

### 3.2 Mute

Deuxième cellule = carré strict exactement identique au carré Hiérarchie.

Le carré entier est interactif.

Contenu :

M

centré.

Mute reste disponible parce qu’il permet d’exclure durablement une piste lors d’une lecture multipiste.

### 3.3 Nom

Troisième zone = rectangle fixe.

Largeur recommandée : environ trois unités de carré de base.

Tous les noms commencent exactement au même X.

Aucune indentation selon la profondeur.

Double-clic ou double-tap sur le nom :
édition inline du nom.

Le renommage doit être prioritaire sur l’action d’entrée dans un conteneur.

### 3.4 Prévisualisation média

Quatrième zone = tout l’espace restant jusqu’au bord droit.

Toutes les prévisualisations commencent exactement au même X.

Toutes les pistes partagent le même point zéro temporel.

Aucun décalage horizontal selon la profondeur.

## 4. Règle absolue de hiérarchie visuelle

Aucune indentation.

Aucun retrait.

Aucune marge croissante.

Aucun arbre de fichiers classique.

Aucun trait en L.

Aucun fil de hiérarchie.

Aucun connecteur.

Aucune colonne ajoutée pour la profondeur.

La profondeur ne modifie jamais la géométrie de la ligne.

Même au niveau 1, 3, 10 ou 40, toutes les cellules restent strictement alignées.

La hiérarchie est comprise uniquement grâce à :

- l’ordre des lignes ;
- l’état ▶ / ▼ du carré Hiérarchie ;
- le code couleur.

## 5. Code couleur hiérarchique

Le code couleur doit permettre de comprendre la parenté et la profondeur sans déplacer aucun élément.

Principe :

- la teinte représente la branche / famille ;
- l’intensité, luminosité ou saturation représente la profondeur dans cette branche.

Exemple :

Parent racine = violet.

Enfant A = bleu soutenu.
Sous-enfant A1 = même bleu atténué.
Sous-enfant A2 = même bleu atténué.

Enfant B = vert soutenu.
Sous-enfant B1 = même vert atténué.
Sous-enfant B2 = même vert atténué.

Le carré Hiérarchie peut porter la couleur de façon plus marquée.

Le fond complet de la ligne peut reprendre la même teinte sous forme d’un voile très léger, sombre et discret.

Ne pas utiliser une couleur arbitraire par niveau sans notion de branche.

Ne pas laisser la sélection écraser le code hiérarchique.

## 6. Sélection et scope de lecture

Principe fondamental :

La sélection définit QUOI lire.
Le Play Mode définit COMMENT lire cette cible.

Il faut toujours avoir une cible de lecture valide.

Éviter un état ambigu “aucune sélection”.

### 6.1 Sélection d’une ligne

Toucher une ligne :

- cette ligne devient la cible de lecture ;
- elle reçoit un état de sélection fort ;
- les autres lignes cessent d’être dans le scope global.

Play joue cette ligne uniquement.

Si la ligne sélectionnée est elle-même une molécule, Play exécute son contenu selon son Play Mode propre.

### 6.2 Sélection du footer

Toucher le footer du conteneur courant :

- le footer devient la cible forte ;
- l’ensemble des lignes appartenant au conteneur reçoit un état secondaire léger ;
- cet état secondaire signifie “ces lignes font partie du contexte qui va être joué”.

Play exécute alors tout le conteneur selon son Play Mode.

La sélection forte et l’illumination du scope global doivent être visuellement différentes.

### 6.3 Retour visuel recommandé

Sélection forte :
contour plus lumineux, contraste accentué ou légère hausse de luminosité.

Scope global :
voile ou illumination très légère sur toutes les lignes concernées.

Ne pas remplacer la couleur hiérarchique.

## 7. Suppression du Solo

Le bouton Solo est supprimé de la grille principale.

La fonction d’audition isolée est remplacée par :

sélection d’une ligne + Play.

Cela permet de gagner une colonne complète.

Mute reste présent parce qu’il a une fonction distincte :
exclure durablement une piste d’un ensemble multipiste.

Si une multisélection est ajoutée plus tard, plusieurs lignes sélectionnées pourront être jouées simultanément sans réintroduire Solo.

## 8. Navigation dans la hiérarchie

Deux comportements distincts doivent exister.

### 8.1 Déplier / replier dans la vue courante

Clic simple sur le carré Hiérarchie :

- affiche les enfants sous le parent ;
- ou les masque ;
- reste dans la même vue ;
- ne change pas le contexte courant ;
- ne décale rien horizontalement.

### 8.2 Entrer / isoler un conteneur

Double-clic sur l’objet hors zone Nom
OU
clic long sur le carré Hiérarchie.

Résultat :

- le conteneur devient le contexte courant ;
- la liste n’affiche plus que son contenu ;
- le footer représente désormais ce conteneur.

Ce comportement est différent du simple dépliage.

### 8.3 Footer et retour parent

Le footer représente toujours le parent / conteneur courant.

Lorsqu’un parent supérieur existe, le footer possède un petit indicateur de retour orienté vers la gauche, cohérent avec le langage graphique de navigation existant.

Un clic sur cet indicateur :

- remonte exactement d’un niveau ;
- restaure idéalement l’état précédent de la vue ;
- restaure la position de scroll ;
- restaure l’état déplié / replié ;
- restaure la sélection précédente si possible.

Au niveau racine :
indicateur Retour absent ou désactivé.

### 8.4 Renommage

Double-clic / double-tap sur le nom du footer :
édition inline du nom du conteneur courant.

Double-clic / double-tap sur le nom d’une ligne :
édition inline du nom de cette ligne.

## 9. Modèle de données

Trois concepts fondamentaux.

### 9.1 Clip

Objet atomique.

Exemples :

- audio ;
- vidéo ;
- image ;
- texte ;
- SVG ;
- autre média.

### 9.2 Lane / piste

Une lane est une ligne temporelle multimédia.

Elle peut contenir successivement plusieurs clips de types différents.

Exemple :

audio → image → vidéo → texte → audio.

La piste n’est pas “audio” ou “vidéo”.

Elle est multimédia.

### 9.3 Molécule

Conteneur générique.

Peut contenir :

- clips ;
- lanes ;
- autres molécules ;
- combinaisons quelconques de ces éléments.

Chaque molécule possède son propre mode d’exécution.

## 10. Play Mode

Modes disponibles :

- Séquentiel.
- Multipiste / simultané.
- Aléatoire.
- Actions enregistrées.

Chaque conteneur décide lui-même comment exécuter ses enfants.

Ne pas imposer d’héritage automatique du Play Mode depuis le parent.

Un enfant peut utiliser un mode différent de son parent.

Exemple valide :

Playlist = séquentiel.
Chanson = séquentiel ou multipiste.
Section = séquentiel.
Groupe de pistes = multipiste.

Quand un enfant ou un conteneur termine :
il renvoie simplement un état terminé à son parent.

Le parent applique ensuite son propre mode.

## 11. Follow Actions

Ne pas utiliser les Follow Actions comme fondation du moteur.

Le comportement normal doit être déterminé par les conteneurs.

Les Follow Actions peuvent éventuellement être ajoutées plus tard comme overrides avancés :

- Stop ;
- Suivant ;
- Boucle ;
- Aller vers X.

Elles ne sont pas nécessaires au fonctionnement de base.

## 12. Chanson par défaut

Une nouvelle chanson doit de préférence être créée comme une molécule en mode multipiste contenant directement plusieurs pistes.

Exemple :

Chanson
- Batterie
- Basse
- Voix
- Guitare

Toutes jouent simultanément.

Ne pas imposer une structure :

Chanson → Section → Pistes.

La structure avancée est facultative.

Un utilisateur avancé peut ensuite regrouper des pistes dans des sous-molécules :

- Intro ;
- Couplet ;
- Refrain ;
- Groupe de voix ;
- Séquence ;
- autre.

Chaque sous-molécule peut avoir son propre Play Mode.

## 13. Colonne contextuelle droite

Conserver une colonne verticale fixe, alignée vers le bas.

Chaque tool est un carré strict.

Chaque tool mesure environ deux fois la hauteur d’une ligne.

Tous les tools ont exactement la même taille.

Chaque tool contient :

- pictogramme centré ;
- label sous le pictogramme dans le même carré.

Ordre conceptuel :

1. Lecture / Pause
2. Play Mode
3. Plein écran
4. Record actions utilisateur
5. Import
6. Info
7. Poubelle

### 13.1 Lecture / Pause

Action / toggle.

Lance ou met en pause la lecture.

### 13.2 Play Mode

Placée directement sous Lecture / Pause.

Doit afficher immédiatement le mode actif via son pictogramme.

Modes exclusifs :

- Séquentiel
- Multipiste
- Aléatoire
- Actions enregistrées

Un clic permet de changer le mode.

Le mode actif doit être identifiable sans ouvrir un menu uniquement pour connaître l’état.

### 13.3 Boucle

Boucle = On / Off indépendant du mode.

Peut être exposée dans la palette / options associées au Play Mode.

### 13.4 Plein écran

On / Off.

Si la lecture est arrêtée :
le plein écran est armé mais la vue ne change pas encore.

Au prochain Play :
passage automatique en plein écran.

Si la lecture est déjà active :
activation immédiate du plein écran.

Cela évite un bouton supplémentaire sur le viewer.

### 13.5 Record actions utilisateur

On / Off.

Enregistre les actions utilisateur.

Distinct du Record média de la toolbox principale du bas.

### 13.6 Import

Action.

Ouvre l’import.

### 13.7 Info

Action.

Affiche les informations de :

- clip ;
- piste ;
- molécule ;
- parent courant lorsque le footer est sélectionné.

### 13.8 Poubelle

Action.

Supprime la cible sélectionnée.

## 14. Toolbox du bas

Conserver la toolbox/navigation existante.

Ne pas la redesign.

Record média reste dans cette barre.

La colonne droite ne doit pas dupliquer la fonction d’enregistrement média.

## 15. Représentation temporelle des médias

### 15.1 Audio

Waveform continue.

La waveform utilise toute la hauteur disponible de la cellule preview.

### 15.2 Vidéo

Bande de vignettes temporelles successives.

Chaque vignette représente l’état du média à un instant T.

### 15.3 Image

Ne jamais étirer une image unique sur toute la durée.

Afficher une succession de vignettes temporelles.

Si l’image est statique :
les vignettes peuvent être identiques.

Si elle est animée / transformée :
les vignettes reflètent son état à différents instants.

### 15.4 Texte

Ne pas étirer un bloc de texte.

Afficher une succession de vignettes temporelles du texte.

Si statique :
états identiques.

Si animé ou modifié :
chaque vignette reflète l’état à l’instant T.

### 15.5 SVG et autres visuels

Même logique que vidéo / image / texte.

### 15.6 Règle générale

Audio = waveform.

Tous les médias non audio = vignettes temporelles successives.

Ne jamais afficher une simple icône de fichier si le contenu réel peut être prévisualisé.

La tête de lecture doit fonctionner de manière cohérente sur tous les médias.

## 16. Édition des clips

Fonctions minimales :

- Split.
- Join.
- Crop début.
- Crop fin.
- Déplacement.
- Duplication si nécessaire.
- Time Stretch pour l’audio.

Les opérations doivent rester génériques autant que possible.

## 17. Drag & Drop

Le drag & drop doit être uniforme entre les médias et indépendant du Play Mode.

Le drag & drop définit la structure.
Le Play Mode définit l’exécution de cette structure.

### 17.1 Au-dessus / en dessous

Déposer un clip, une piste ou une molécule au-dessus :
insérer au-dessus.

Déposer en dessous :
insérer en dessous.

Effets :

- réordonner ;
- modifier le layering ;
- modifier l’ordre de lecture selon le contexte.

### 17.2 Au centre

Déposer directement au centre d’un objet :

- créer ou enrichir une molécule contenant les deux objets.

La molécule créée est par défaut en mode :

Multipiste / simultané.

### 17.3 À gauche / à droite

Dans une lane composite ou une molécule temporelle :

Déposer à gauche :
insérer avant.

Déposer à droite :
insérer après.

Exemple :

audio → image → vidéo → texte.

### 17.4 Ergonomie mobile

Les zones de drop :

- dessus ;
- dessous ;
- gauche ;
- centre ;
- droite

doivent être suffisamment larges pour une interaction au doigt.

Ne pas exiger une précision de quelques pixels.

## 18. Multipiste

Dans un conteneur multipiste :

plusieurs lanes évoluent simultanément.

Exemple :

Piste 1 :
audio → image → vidéo.

Piste 2 :
vidéo → texte → audio.

Piste 3 :
audio continu.

Piste 4 :
image → vidéo → image.

Toutes partagent le même temps global.

Mute s’applique à chaque lane.

La sélection + Play remplace la fonction Solo.

## 19. Séquentiel

Dans un conteneur séquentiel :

les enfants sont exécutés les uns après les autres.

Un enfant peut être :

- clip ;
- lane ;
- molécule.

Exemple :

Image.
Audio.
Vidéo.
Molécule multipiste.
Texte.

Quand la molécule multipiste termine :
le conteneur séquentiel poursuit avec l’élément suivant.

## 20. Actions enregistrées

Le bouton Record actions utilisateur enregistre la navigation et les interactions de l’utilisateur.

Exemple :

- lancer un objet ;
- attendre ;
- sélectionner un autre objet ;
- afficher un média ;
- changer d’action.

Le mode Actions enregistrées rejoue ce scénario avec son ordre et ses durées.

Ne pas confondre avec le Record média.

## 21. Durée des médias fixes

Pour une image ou un texte statique :
utiliser une durée d’affichage par défaut si aucune durée explicite n’est définie.

Valeur de départ possible :
environ 2 secondes.

Pour audio et vidéo :
respecter leur durée temporelle réelle sauf édition explicite.

## 22. Séparation conceptuelle stricte

Structure :
définit qui contient quoi.

Play Mode :
définit comment les enfants sont exécutés.

Sélection / scope :
définit quoi sera joué.

Navigation :
définit quel conteneur est actuellement affiché.

Drag & Drop :
définit comment les objets sont déplacés, regroupés ou séquencés.

Ces notions doivent rester indépendantes.

## 23. Contraintes d’intégration dans le projet existant

Ne pas repartir de zéro.

Avant modification :

1. Localiser les composants de liste déjà existants.
2. Localiser la logique de molécules.
3. Localiser les états open / closed.
4. Localiser la sélection existante.
5. Localiser le footer existant.
6. Localiser la colonne contextuelle droite.
7. Localiser la toolbox du bas.
8. Localiser la logique de preview.
9. Localiser la lecture actuelle.
10. Localiser le drag & drop existant.
11. Localiser le moteur de timeline / playhead.
12. Localiser les outils d’édition existants.
13. Réutiliser les structures existantes plutôt que créer un second système.

N’ajouter une nouvelle abstraction que si aucune abstraction existante ne couvre correctement le besoin.

Éviter :

- duplication de logique ;
- fonctions parallèles ;
- styles parallèles ;
- objets redondants ;
- code zombie ;
- anciennes implémentations laissées actives ;
- multiples sources de vérité.

Après modification :
supprimer ou désactiver proprement l’ancienne logique devenue obsolète.

## 24. Priorités d’implémentation

Priorité 1 :
structure géométrique fixe [Hiérarchie][Mute][Nom][Preview].

Priorité 2 :
navigation déplier / entrer / revenir / footer.

Priorité 3 :
scope de lecture sélection ligne vs footer.

Priorité 4 :
Play Mode visible et correctement lié au conteneur.

Priorité 5 :
représentation temporelle multimédia cohérente.

Priorité 6 :
drag & drop structurel.

Priorité 7 :
édition clips.

Priorité 8 :
raffinement du code couleur hiérarchique et des états visuels.

## 25. Critères de validation

Le résultat est correct uniquement si :

- aucun niveau hiérarchique ne décale horizontalement une ligne ;
- les cellules commencent toujours au même X ;
- Solo a disparu ;
- Mute reste disponible ;
- une ligne sélectionnée + Play joue cette ligne ;
- footer sélectionné + Play joue tout le conteneur ;
- le footer actif illumine légèrement toutes les lignes incluses dans le scope ;
- toucher une ligne remplace ce scope global par cette ligne ;
- déplier ne change pas de vue ;
- entrer dans une molécule isole son contenu ;
- le footer permet de revenir au parent ;
- double-clic sur nom renomme sans entrer dans l’objet ;
- Play Mode est visible directement ;
- une chanson simple fonctionne immédiatement en multipiste ;
- une piste peut contenir plusieurs types de clips successifs ;
- les médias non audio sont rendus par vignettes temporelles ;
- le drag & drop permet réordonnancement, regroupement et insertion temporelle ;
- aucune fonctionnalité déjà existante n’est réimplémentée inutilement ;
- aucune régression visuelle majeure n’est introduite ailleurs dans l’interface.

Règle finale absolue :

Ne pas réinventer le projet.
Analyser l’existant.
Réutiliser ce qui existe.
Modifier uniquement ce qui doit l’être.
Ajouter uniquement ce qui manque.
Conserver la cohérence visuelle et comportementale globale d’atome/eVe.
note que les pistes 'muted seront' ignorés même en mode de lecture sequentiel ou aléatoire
Regarde le visuel de ce fichier : ./todo/!!!!atome_eve_liste_hierarchie_lecture_prompt.html, pour etablir le design des pistes 
