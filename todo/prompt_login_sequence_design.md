# Atome Authentication UI Prompt

Créer une interface d’authentification mobile ultra minimaliste, premium, sombre, accessible et émotionnelle.

L'interface doit tenir dans un seul écran de smartphone sans aucun élément parasite.

Aucun menu.
Aucune icône système.
Aucune barre de navigation.
Aucun bouton classique.
Aucune bordure décorative.
Aucune ombre artificielle inutile.

Le design doit donner l'impression d'un produit haut de gamme entre Apple, Linear, Stripe et Notion, mais avec une identité plus artistique et émotionnelle.

## Style général

- Fond noir profond.
- Dégradés très sombres.
- Contrastes élevés.
- Typographie extrêmement fine.
- Atmosphère calme.
- Peu d'éléments.
- Beaucoup d'espace.
- Transitions fluides.
- Aucun effet gaming.
- Aucun effet neumorphism.
- Aucun effet glassmorphism excessif.

## Logo

Le logo Atome est blanc.

Le logo possède un halo diffus violet/blanc très doux.

Le halo suit exactement la forme du logo.

Le halo pulse en permanence.

Le halo :
- augmente légèrement en taille
- augmente légèrement en intensité
- revient lentement à son état initial

Le halo et le mouvement du logo doivent être asynchrones.

Le logo ne doit jamais être entouré :
- d'un cercle
- d'une boîte
- d'un fond
- d'un badge
- d'une capsule

## Écran 1 : Choix initial

L'écran est divisé en deux zones occupant ensemble 100% de l'espace disponible.

Aucune zone morte.

### Zone supérieure

Texte :
Entrez sans compte

Dégradé :
mauve sombre → noir

### Zone inférieure

Texte :
Authentification

Dégradé :
violet profond → noir

Le logo est placé exactement à la jonction entre les deux zones.

Le logo chevauche visuellement les deux zones.

## Règles d'interaction

Le logo central n'est pas décoratif.

Le logo central est une zone interactive.

Sur l'écran 1 :

- cliquer sur Authentification
- cliquer sur le logo central

doivent déclencher exactement la même fonction.

Résultat :

→ ouverture de l'écran de saisie du numéro de téléphone.

Le logo central doit être considéré comme une extension du bouton Authentification.

Toute la surface occupée par le logo doit être cliquable.

Aucune différence de comportement n'est autorisée entre :
- le bouton Authentification
- le logo central

## Transition Écran 1 → Écran 2

Le bloc violet inférieur se découpe.

Il devient :

1. un bandeau supérieur fixe occupant 1/7 de la hauteur
2. un bandeau inférieur occupant 1/7 de la hauteur

Le logo descend progressivement.

Le logo suit le bandeau inférieur.

Le logo termine centré dans le bandeau inférieur.

La disparition du grand bloc violet révèle un panneau violet beaucoup plus clair au centre.

## Écran 2 : Téléphone

Structure :

- Bandeau supérieur : 1/7
- Zone centrale : 5/7
- Bandeau inférieur : 1/7

### Bandeau supérieur

Texte :

Entrez votre numéro de téléphone

Le texte :
- est centré horizontalement
- est placé sous le notch
- occupe presque toute la largeur
- reste sur une seule ligne
- utilise une typographie très fine

### Zone centrale

Contient uniquement un champ téléphone.

Le champ :
- est centré
- reçoit automatiquement le focus
- déclenche immédiatement le clavier
- sélectionne tout son contenu lors d'un clic

Aucune zone morte.

### Bandeau inférieur

Contient uniquement le logo Atome.

Le logo est le bouton de validation.

### Comportement du logo

Si le champ téléphone est vide :
→ retour écran 1

Si le champ téléphone contient au moins un chiffre :
→ passage écran 3

La touche Entrée doit produire exactement le même comportement.

## Écran 3 : Mot de passe

Structure identique à l'écran 2.

Texte du bandeau supérieur :

Saisissez votre mot de passe

Le logo du bandeau inférieur reste le bouton principal.

### Comportement du logo

Si le mot de passe est vide :
→ rester sur l'écran 3

Si le mot de passe est renseigné :
→ validation finale

## Transition finale

Après validation :

- la zone centrale disparaît progressivement
- le fond du bureau utilisateur apparaît en fondu
- le bandeau supérieur sort par le haut
- le bandeau inférieur sort par le bas
- le logo disparaît avec le bandeau inférieur

## Règles absolues

- Aucun élément supplémentaire.
- Aucun texte supplémentaire.
- Aucun bouton supplémentaire.
- Aucune icône supplémentaire.
- Aucun indicateur d'étape.
- Aucun cercle autour du logo.
- Aucun cadre autour du logo.
- Aucun fond derrière le logo.
