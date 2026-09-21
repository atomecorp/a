# Implémenter l’outil Help dans eVe

## Mission

Implémente un outil Help compact réunissant aide contextuelle et consultation des notifications. Il doit permettre de parcourir les notifications non lues, ouvrir leur contenu, répondre lorsque le contenu le permet et accéder aux archives de Communication. Réalise la fonctionnalité dans le projet réel, avec les composants et les propriétaires canoniques existants, puis valide les parcours.

Ce document est un prompt d’exécution. Les comportements explicitement définis sont des décisions produit ; les paramètres signalés comme restant à préciser ne doivent pas être présentés comme déjà validés.

## 1. Lecture préalable et réutilisation obligatoire

Avant toute modification, lis `.codex/AGENTS.md` et les modules applicables, notamment les modules 01 à 07 pour cette tâche mêlant UI, communication, état et validation. Applique aussi la procédure canonique de diagnostic UI lorsqu’elle est requise. N’effectue aucune écriture Git : aucun commit, push, changement de branche, staging ou autre mutation Git.

Inspecte les composants réels et identifie les propriétaires existants de :

- l’outil et de son icône, des dimensions standard, des badges et de la préférence droitier/gaucher ;
- la barre latérale contextuelle et de sa composition selon le contexte actif ;
- l’affichage de listes, des panneaux dépliables, du texte et des animations ;
- l’input box Atome, du focus, du clavier mobile et des brouillons ;
- Communication, des messages, notifications, historiques, statuts de lecture et permissions ;
- l’aide contextuelle, des préférences et de l’internationalisation.

Réutilise impérativement l’input box Atome existante pour répondre et les composants de panneaux Atome/eVe existants pour afficher la liste et déplier le contenu au-dessus du bandeau. Compose ces composants ; ne recrée pas un champ de saisie, un panneau, un moteur de notifications ou une messagerie parallèle.

Ne présume pas du nom d’une API ou d’un fichier : vérifie les propriétaires dans le code et les cartes du projet. Étends le propriétaire canonique lorsque nécessaire. Préserve le rendu partagé Bevy/WebGPU, le DOM minimal et non autoritaire et le pipeline canonique de mutation. Toutes les chaînes d’interface passent par l’i18n existante.

## 2. Rôle du Help et de Communication

Help est le point d’entrée immédiat pour **toutes les notifications non lues** : messages de personnes, actualités, notifications système ou autres notifications unidirectionnelles autorisées par les filtres. Une notification sans possibilité de réponse reste pleinement présente dans Help ; il ne faut pas la détourner vers un autre écran simplement parce qu’on ne peut pas y répondre.

L’aide contextuelle utilise la même surface d’affichage, avec une présentation permettant de distinguer un conseil d’aide d’une notification ou d’un message. Les conseils d’aide ne gonflent pas le compteur des notifications non lues.

Communication est le propriétaire de l’historique durable et des conversations. Après lecture, les notifications, y compris unidirectionnelles, restent retrouvables dans ses archives. Help et Communication montrent les mêmes données canoniques : aucun stockage doublonné et aucun transfert destructif entre les deux vues.

## 3. Icône, position et dimensions

- Au repos, Help est une icône compacte au format standard des outils eVe.
- Pour un droitier, l’icône reste à droite et le bandeau se développe vers la gauche. Pour un gaucher, l’ensemble est inversé.
- L’icône conserve sa position pendant le déploiement et porte le badge des non-lus.
- Sur un écran suffisamment large, la zone ajoutée à côté de l’icône représente environ quatre largeurs standard d’outil. Il s’agit bien de quatre largeurs d’outil, jamais de quatre pixels.
- Sur mobile, cette zone utilise l’espace disponible sans déborder ; respecte les marges, les zones sûres et le clavier.
- Utilise les dimensions et styles partagés du framework, sans dupliquer de constantes de design.

## 4. Interactions et états de présentation

### Clic court sur Help

Un clic ou tap court sur l’icône repliée ouvre le bandeau et active le contexte Help dans la barre latérale. Le bandeau présente un aperçu de notification ou l’aide contextuelle pertinente. Un clic court sur l’icône déjà dépliée replie la surface, sans supprimer de notification ni modifier son statut de lecture.

### Clic dans le bandeau

Un clic ou tap dans la zone d’aperçu ouvre la liste des notifications non lues avec le composant de panneau existant, au-dessus de la zone basse. Les notifications avec et sans réponse y sont mélangées selon l’ordre canonique retenu, avec leur nature et leur provenance lisibles.

En tête de liste, affiche une action **« Voir les archives »**, accessible même lorsque le nombre de non-lus est nul. Elle ouvre le panneau Communication sur les archives et quitte le contexte Help ; utilise la navigation existante.

### Clic sur une notification de la liste

L’ouverture volontaire d’une notification affiche son contenu développé dans le panneau situé au-dessus de la zone basse. C’est la vue de lecture complète, distincte du simple aperçu. Adapte sa hauteur à l’écran ; « ouverture en grand » ne signifie pas imposer un nouveau panneau plein écran indépendant des composants existants.

À cette ouverture, marque la notification comme lue et mets à jour le badge. Ne ferme pas le panneau et ne retire pas le contenu affiché au moment où son statut change. La notification sort de la liste des non-lus, mais reste consultable dans la vue courante jusqu’à navigation ou fermeture, puis dans les archives.

### Réponse

- Si le contenu permet une réponse et que l’utilisateur dispose des droits nécessaires, la zone basse devient l’input box Atome existante.
- Si aucune réponse n’est possible, n’affiche ni input box, ni bouton d’envoi, ni faux champ désactivé.
- Utilise la chaîne d’envoi de Communication, ses erreurs explicites et ses permissions.
- Préserve les brouillons lors d’un changement de notification, d’une fermeture ou de l’ouverture du clavier, conformément au mécanisme existant.
- Lire ne signifie jamais répondre ; l’envoi d’une réponse est une action indépendante.

### Navigation entre notifications

Un balayage dans la vue de lecture permet de passer au contenu précédent ou suivant. Réutilise les gestes existants et assure une navigation accessible sur ordinateur et au clavier. Le balayage ne doit pas entrer en conflit avec la sélection de texte, le défilement vertical ou la saisie.

La navigation doit rester stable malgré la diminution des non-lus : pas de contenu sauté ni de fermeture lorsque la notification courante devient lue. Conserve uniquement le contexte de navigation temporaire nécessaire, sans créer une deuxième source de vérité métier.

## 5. Lecture, compteur et archives

- Un aperçu dans le bandeau, un défilement automatique ou la présence d’une ligne dans la liste ne marque jamais une notification comme lue.
- L’ouverture volontaire du contenu développé marque la notification comme lue.
- Le badge reflète les notifications réellement non lues selon une règle canonique unique. Réutilise la convention existante à zéro ; à défaut, masque le badge.
- Une lecture dans Communication met également à jour Help, et inversement.
- L’archivage après lecture est automatique au sens de disponibilité dans l’historique : ce n’est pas une suppression et cela ne nécessite pas de bouton « Archiver » supplémentaire.
- « Marquer comme non lu » remet la notification parmi les non-lus. Si elle est encore ouverte, elle reste non lue jusqu’à sa prochaine ouverture volontaire : un rendu ou un rafraîchissement ne doit pas annuler ce choix.
- « À traiter » et « Urgent » sont indépendants de la lecture. Un contenu peut être lu et rester à traiter ou urgent ; ces indicateurs sont conservés dans Communication. Ils ne gonflent pas le badge des non-lus.

## 6. Barre latérale contextuelle

Utilise la barre latérale contextuelle existante pour rendre les actions immédiatement lisibles, sans ajouter de longs boutons dans le petit bandeau et sans obliger à ouvrir le menu Mystique, anciennement Flower.

Lorsque Help devient actif, alimente automatiquement cette barre selon le contexte :

- Liste ou bandeau : actions générales pertinentes, notamment l’accès aux archives et aux filtres existants.
- Notification ouverte : actions applicables à cette notification, notamment **« Marquer comme non lu »**, **« À traiter »**, **« Urgent »** et **« Supprimer »**.
- Permets de retirer les indicateurs « À traiter » et « Urgent » avec les conventions de bascule existantes.
- Une suppression définitive doit être clairement nommée et confirmée avec le composant de confirmation existant ; respecte les droits et la sémantique de suppression de Communication. Ne confonds jamais retirer une notification pour soi et supprimer un message pour tous.
- N’ajoute pas une action « Archiver » redondante avec le rangement automatique après lecture.
- En quittant Help, restaure le contexte normal de la barre latérale par le mécanisme existant.

## 7. Neutralisation : mode « Ne pas déranger »

L’appui long sur l’icône Help bascule le mode « Ne pas déranger ». Réutilise le seuil et la gestion d’appui long des outils existants. Il ne doit pas déclencher en plus le clic court.

Lorsque ce mode est actif :

- un signe barré ou une croix superposée à l’icône indique que les sollicitations automatiques sont neutralisées, sans évoquer une suppression ;
- aucun bandeau ne s’ouvre automatiquement et aucune aide contextuelle ne vient interrompre l’utilisateur ;
- les notifications continuent d’être reçues, conservées et comptées ; le badge reste discret et sans animation intrusive ;
- un clic court reste possible pour consulter volontairement les notifications, sans réactiver les sollicitations automatiques ;
- un nouvel appui long réactive le fonctionnement normal, sans rejouer en rafale toutes les anciennes animations.

Expose également cette bascule de façon accessible dans les actions ou réglages existants ; l’appui long ne doit pas être le seul moyen de la commander. Réutilise la persistance des préférences du projet et documente sa portée effective.

## 8. Arrivée, défilement et fermeture automatique

Hors mode « Ne pas déranger », une notification éligible peut déployer le bandeau pour présenter son aperçu. Une arrivée ne remplace jamais une notification en cours de lecture et ne vole jamais le focus d’une saisie.

Le concept prévoit un texte qui défile une ou deux fois, puis reste fixe, ainsi qu’un repli après trois présentations sans consultation. Ces deux compteurs ne sont pas interchangeables : un passage du texte est une animation, une présentation est une sollicitation.

Avant d’implémenter ce point, inspecte le comportement partagé des autres outils et réutilise sa politique si elle définit ces notions. Si elle ne les définit pas, fais préciser le nombre exact de passages, la durée de maintien et ce qui déclenche chacune des trois présentations. N’invente pas un cycle de rappels périodiques.

Dans tous les cas :

- le repli conserve le badge et tous les non-lus ;
- aucun défilement ne marque comme lu ;
- aucune fermeture automatique pendant une lecture volontaire, une interaction ou une rédaction ;
- respecte la réduction des animations et maintiens une consultation possible sans texte animé ;
- réutilise les mécanismes de cycle de vie et d’animation partagés, sans boucle ou minuterie permanente propre à Help.

## 9. Filtres et limites de périmètre

Les catégories affichées doivent pouvoir être filtrées via les réglages existants. Un filtre ne supprime rien et ne marque rien comme lu. Réutilise le modèle de catégories et de préférences de Communication, sans inventer une taxonomie parallèle.

Si le comportement existant ne tranche pas le calcul du badge en présence de filtres, fais préciser s’il compte tous les non-lus ou seulement les catégories affichées. Documente la règle retenue et applique-la partout.

N’ajoute pas de nouvelles fonctions de messagerie ou de gestion de tâches au-delà des statuts demandés. Si les statuts « À traiter » et « Urgent » n’existent pas, introduis uniquement leur représentation minimale chez le propriétaire canonique concerné.

## 10. Déroulement attendu

1. Cartographie brièvement les propriétaires et composants réutilisables, avec les fichiers et API vérifiés. Sépare les capacités déjà présentes de celles à compléter.
2. Identifie les seules ambiguïtés bloquantes restantes, notamment les trois présentations et la politique des filtres ; poursuis les parties indépendantes sans rouvrir les décisions de ce document.
3. Implémente les données et actions chez leurs propriétaires existants, puis compose Help, bandeau, liste, panneau de lecture et saisie.
4. Branche la barre latérale, les archives, les statuts et le mode « Ne pas déranger ».
5. Valide les parcours réels et les régressions pertinentes. Mets à jour les cartes concernées si les contrats ou responsabilités changent.

## 11. Critères de validation

Vérifie au minimum :

- déploiement et repli par clic court ; appui long distinct et réversible ;
- placement droitier/gaucher, mobile étroit, écran large, zones sûres et clavier mobile ;
- présence dans Help d’un message répondable et d’une notification unidirectionnelle ;
- aperçu et liste sans changement de lecture ; ouverture complète avec mise à jour du badge ;
- maintien du contenu visible après son passage à l’état lu ;
- champ de réponse exclusivement quand autorisé, envoi réel par Communication et conservation des brouillons ;
- navigation précédent/suivant sans saut causé par le retrait des non-lus ;
- « Marquer comme non lu » persistant tant qu’aucune nouvelle ouverture volontaire n’a lieu ;
- indépendance entre lu, répondu, à traiter et urgent ;
- ouverture des archives depuis la tête de liste, y compris liste vide, avec sortie du contexte Help ;
- synchronisation des états entre Help et Communication ;
- actions latérales adaptées à la sélection et restauration du contexte à la fermeture ;
- suppression conforme aux permissions avec confirmation si définitive ;
- réception silencieuse en mode « Ne pas déranger », consultation manuelle possible et absence de rafale au réveil ;
- absence de fermeture ou de remplacement intempestif pendant lecture et rédaction ;
- i18n, navigation accessible et réduction des animations ;
- absence de composants dupliqués, d’état métier dans le DOM et de stockage parallèle.

Exécute les contrôles ciblés réellement disponibles et les parcours dans les environnements concernés. Ne présente pas une validation navigateur comme une preuve Tauri ou iOS. Ne prétends pas avoir passé un contrôle absent ou un parcours non exécuté.

## Livrable final

Livre l’implémentation intégrée, les validations pertinentes et un compte rendu court indiquant les composants réutilisés, les comportements réalisés, les décisions restantes et les environnements effectivement vérifiés. Signale explicitement toute limite réelle. N’effectue aucune opération d’écriture Git.
