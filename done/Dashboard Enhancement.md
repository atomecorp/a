# Dashboard Enhancement — Prompt de réalisation atome / eVe

## 1. Mission et résultat attendu

Tu interviens dans le framework atome / eVe pour réaliser l'ensemble des corrections et évolutions décrites ci-dessous. Commence par un audit du code réel et un plan global, puis réalise les lots jusqu'à leur intégration complète. Un rapport, une maquette ou un plan sans réalisation ne constitue pas le résultat attendu de cette mission future.

Le chantier réunit les dashboards Basic et Pro, leurs variantes réellement présentes, les composants partagés du framework, la navigation par balayage, les contacts et Rencontre, les réglages du compte, la déconnexion et l'enregistrement des actions dans un projet. Les noms « F Basic », « F Pro », « Basic », « eVe Basic » et « eVe Pro » apparaissent dans les demandes initiales : vérifie leur correspondance dans le dépôt sans inventer de nouvelles variantes.

Ce fichier est le prompt destiné à l'IA réalisatrice. Sa rédaction ne signifie pas que les fonctions décrites sont déjà implémentées ou vérifiées.

La mission forme un seul chantier, organisé en lots vérifiables. Poursuis après chaque validation utilisateur jusqu'à la fin, sans demander une nouvelle autorisation de principe pour une étape déjà couverte. Respecte toutefois les pauses de validation visuelle, les décisions de produit encore ouvertes et les limitations réelles d'accès.

## 2. Sources, décisions confirmées et références visuelles

Lis les instructions du projet depuis sa racine principale, y compris pour une intervention dans le sous-module eVe : `AGENTS.md`, méthode commune et modules déclenchés par les travaux. Les procédures de validation UI et visuelle du dépôt restent applicables. Ce prompt complète les besoins fonctionnels ; il ne remplace pas les contrats du projet.

Les décisions suivantes sont confirmées :

- Toute création ou tout ajout utilise l'emplacement fixe **en haut à gauche**, dans tous les contextes concernés. L'ancienne mention « en haut à droite » est écartée.
- Les cinq images seront jointes manuellement à ce prompt. Aucune copie ni aucun lien vers les images n'est nécessaire dans ce document.
- Les questions de produit encore ouvertes sont posées par l'IA réalisatrice avant le lot concerné, après investigation de l'existant.
- Chaque résultat visuel doit être présenté et explicitement validé par l'utilisateur avant le passage au lot suivant.
- La consigne récente de correction des dimensions des listes prime sur les anciennes indications contradictoires, notamment « moitié de la hauteur d'une cellule ». La référence dimensionnelle exacte reste à faire préciser avant de figer les mesures.
- Les précisions de navigation, de contacts, de Rencontre, de réglages et de déconnexion intégrées ci-dessous complètent les références antérieures. Les directions et comportements explicitement décidés ne doivent plus être remis en question ; seules leurs ambiguïtés résiduelles figurent en section 5.
- Les nouveaux parcours utilisent les listes, cellules, champs et boutons standards du dashboard. Présenter leur assemblage pour que l'utilisateur puisse en faire ajuster le design à chaque étape concernée ; ne pas réinventer les contrôles ni ajouter un outil de conception à l'application.

Identifie les cinq références par leur contenu :

| Référence | Rôle et corrections à prendre en compte |
| --- | --- |
| R1 — Télévision, exemple BFM TV | Grande prévisualisation intégrée, outils en dessous, input et assistant en bas. L'annotation remplace « Écrire un message » par « Chercher » et barre l'envoi ainsi que « Je n'aime pas ». Appliquer le principe aux chaînes TV et aux vidéos YouTube en tenant compte de leurs capacités réelles. |
| R2 — Contacts à ajouter aux favoris | Liste de contacts avec photo, nom, cœur et éléments de sélection visibles dans la référence. L'input devient « Filtrer » ; l'envoi de message y est barré. Clarifier le rôle du sélecteur de gauche s'il fait doublon avec le cœur. |
| R3 — Capteurs de santé | Liste permettant de choisir les favoris destinés au moniteur/dashboard. Les lignes sont trop petites et la dernière déborde dans les commandes : ces défauts doivent être corrigés, avec un défilement réel. L'input devient « Filtrer », sans commande d'envoi. |
| R4 — Communication, publication sociale | Contenu média dans la grande surface, auteur et informations de publication, actions en dessous, saisie en bas. L'annotation demande « Partager » pour l'action barrée. Les actions Aimer, Partager, Reprendre, Vidéo, Audio, Joindre et Fermer sont à interpréter dans ce même outil Communication. |
| R5 — Communication, discussion | Référence de conversation avec messages, médias et documents, zone de saisie, assistant et commandes Visio, Audio, Joindre, Fermer. Elle ne définit pas une application séparée du mode social. |

Les images sont des références de conception, pas des preuves de fonctionnement du logiciel. Ne reproduis pas leurs défauts signalés. Ne transforme pas les détails encore ambigus en décisions implicites. Si une référence annoncée manque réellement lors de la réalisation, identifie la partie concernée et demande cette référence avant de prétendre en valider la conformité.

## 3. Architecture et règles transversales de réalisation

### Construction avec les composants du framework

- atome / eVe doit se construire avec ses propres composants. Réutilise les implémentations canoniques par composition, sans copier leur logique ou leur apparence dans une variante locale.
- Avant toute modification, vérifie les propriétaires, symboles, contrats, accès ou déclarations, plateformes compatibles, consommateurs réels et tests des briques nécessaires. Une mention documentaire ou une maquette ne prouve pas leur disponibilité.
- Distingue les objets typés, leurs propriétés ou capacités et les outils compatibles qui agissent dessus. Ne duplique pas un outil par type quand le contrat partagé suffit.
- Si une brique interne indispensable manque ou doit être étendue, documente les recherches, la limite constatée, le propriétaire et l'intégration proposée. Crée ou étends ensuite cette brique interne dans le périmètre demandé, sans réclamer d'accord supplémentaire pour sa seule absence. Un manque d'accès reste une limitation à signaler.
- Mutualise les comportements réellement communs ; conserve les différences Basic/Pro par les mécanismes de configuration existants. N'ajoute pas de registre, cache, abstraction ou API concurrente quand un propriétaire existant convient.

### Exécution, état et rendu

- Conserve JavaScript, les noms atome et eVe, les frontières de plateforme et l'architecture existante. N'introduis pas TypeScript, Python, de framework UI, de dépendance externe ou d'imitation HTML/DOM pour réaliser l'application.
- Passe par les outils et commandes canoniques, leurs politiques de droits et la chaîne durable unique de mutation, d'historique, de persistance et de synchronisation. Une vue ou une prévisualisation ne devient pas une deuxième source de vérité.
- Préserve l'état Atome hors du DOM jetable, le rendu partagé WebGPU, les services de texte et médias et les cycles de vie des ressources conformément aux propriétaires du dépôt.
- Les créations ou extensions de capacités doivent conserver des contrats typés et déclarés, exploitables par les interfaces UI, IA et MCP selon les mécanismes existants. Définis les changements d'interface seulement après l'audit ; n'invente pas de schéma parallèle.
- Respecte les chemins de communication, de signalisation et de transport média canoniques. Réutilise les contrôles natifs du framework avec leurs options réelles.

### Interface zen et limites

- Préserve arrondis, couleurs, fonds, flous, proportions, animations et contrôles natifs déjà validés. N'ajoute ni texte visible, ni bouton, ni indicateur au-delà des interactions demandées.
- Les libellés explicitement demandés restent localisés par le système `eveT()` ; conserve les contrats d'accessibilité.
- Aucun panneau surgissant ni fenêtre flottante pour une interaction réalisable dans une cellule : la tuile se transforme, s'agrandit puis se rétracte.
- Préserve les changements locaux préexistants. Cette mission n'autorise aucune écriture Git/GitHub : pas de branche, fetch, staging, commit, merge, rebase, push ou PR sans demande explicite correspondante.
- N'installe rien et ne modifie pas de paramètres personnels, de fournisseurs, d'authentification ou de sécurité pour contourner une limitation.

## 4. Plan global et procédure de progression

Commence par le lot 0, puis présente un plan court et numéroté couvrant **toutes les tâches de ce fichier**, y compris Rencontre, les réglages et la déconnexion. Pour chaque lot, indique ses dépendances, propriétaires, réutilisations ou extensions nécessaires, fichiers envisagés et critères de validation. Pendant cette préparation, regroupe les questions de produit encore nécessaires, notamment pour affiner ensemble le parcours Rencontre ; ne les remplace pas par des hypothèses silencieuses. L'ordre ci-dessous est l'ordre de référence ; toute adaptation nécessaire doit être expliquée par les dépendances réelles.

Pour chaque lot de réalisation :

1. Reproduire le problème ou établir le comportement actuel avec le niveau de preuve disponible.
2. Résoudre les questions de produit indispensables à ce lot. Ne repose pas une question déjà tranchée et n'interroge pas l'utilisateur sur un fait vérifiable dans le dépôt.
3. Réaliser la correction dans les propriétaires canoniques, puis exécuter les vérifications pertinentes et corriger les régressions constatées.
4. Vérifier réellement l'interface et les interactions, présenter le résultat visuel et préciser la variante, la plateforme et les scénarios contrôlés. Une assertion technique ne vaut pas preuve visuelle.
5. Demander explicitement la validation visuelle de ce lot et attendre la réponse. Le silence, l'écoulement du temps et une capture produite par l'IA ne valent pas accord.
6. Si le visuel est refusé, corriger et représenter le même lot. Une fois validé, reprendre directement le lot suivant sans redemander une autorisation générale.

Une question ouverte ne bloque que les travaux qui en dépendent : l'audit et les travaux indépendants peuvent avancer pendant cet arbitrage. Cela ne permet pas de contourner une validation visuelle en attente ni de déclarer le lot accepté. Conserve un suivi des lots terminés techniquement, en attente d'accord, validés et réellement bloqués.

### Lot 0 — Audit de l'existant et préparation

- Examiner les dashboards, la création dans les projets, la recherche, les listes, les favoris, la communication, les lecteurs et leurs gestes, les contacts, le profil et Rencontre, les réglages, la déconnexion, les enregistrements et la relecture des actions.
- Retrouver les références graphiques et décisions validées les plus récentes. Signaler les contradictions restantes au lieu de choisir silencieusement.
- Identifier les propriétaires de l'agrandissement/réduction des tuiles, de la prévisualisation, des commandes contextuelles, de l'assistant, des listes, de la navigation et de son historique, du profil, des réglages, de la fin d'opération et de l'ajout au projet courant.
- Vérifier les mécanismes réels d'import des contacts, de sélection de photo et de prise de vue, de capteurs de santé, d'appels, de pièces jointes, d'annulation et de déconnexion. Distinguer implémentation inspectée, test exécuté et validation en fonctionnement.
- Décrire l'assemblage interne retenu et les capacités à réparer, étendre ou créer. Utiliser les statuts de disponibilité définis par la méthode commune.
- Relever les runtimes concernés et les moyens de validation accessibles : Web, Tauri, iOS et, pour les demandes d'import, Android et macOS selon leur prise en charge réelle. Signaler une plateforme ou un accès natif indisponible au lieu de prétendre l'avoir vérifié.

### Lot 1 — Surface commune, disposition et transitions

Utiliser le système existant de prévisualisation vidéo comme point de départ vérifié pour une surface commune aux textes, dessins, images, médias, enregistrements, documents et projets.

- La tuile concernée s'agrandit par animation dans le dashboard. Les autres dalles sont recouvertes ou s'effacent selon le mécanisme natif ; la fermeture restaure l'état précédent par l'animation inverse.
- La surface principale occupe approximativement les trois quarts de l'espace disponible, en respectant le modèle existant. Cette proportion ne doit pas masquer les commandes, l'input ou les zones de sécurité de l'appareil.
- Immédiatement sous cette surface se trouve la bande d'outils contextuels. Tout en bas reste la bande d'input générale ; les deux fonctions ne doivent pas être mélangées.
- Dans tout affichage agrandi, l'outil atome se place en bas à droite, à l'extrémité de la bande d'input, avec son apparence et ses comportements natifs. Retrouver et mutualiser le propriétaire de ce positionnement.
- Préserver les données et la navigation lors du retour. Supprimer scintillements, anciens contenus encore visibles et éléments résiduels.
- Adapter l'ensemble aux téléphones, tablettes, ordinateurs, orientations, clavier virtuel et zones de sécurité. Aucun contenu ni contrôle essentiel ne doit sortir de l'écran.

### Lot 2 — Accueil, catégories et menu Créer

Le menu Créer du dashboard possède son propre contenu, distinct de celui à l'intérieur d'un projet. La correction du dashboard ne doit pas retirer les outils de création du projet.

| Élément | Modification demandée |
| --- | --- |
| Menu Créer du dashboard | Retirer Télévision, YouTube, Placeholder, Matrix, Page et Code. Conserver Créer, Forme, Texte et Dessin. Ajouter Générateur. Vérifier dans l'existant le sens de l'entrée Créer sans introduire de boucle de menu. |
| Racine du dashboard | Remplacer l'outil Générateur par Boutique. Le Générateur reste accessible dans le menu Créer. |
| Activité | Afficher deux briques vides pour cette phase : Sport,  Spectacles, liste des courses, . Ne pas inventer leurs fonctionnalités futures. |
| Activité — Liste des courses (décision utilisateur du 2026-10-19) | La brique Liste des courses ouvre la liste de courses (panneau `shopping`, alimentée par les repas planifiés, enrichie par Open Food Facts, scan). Sport et Spectacles restent vides. |
| GPS | Renommer en Plan en conservant le contenu et le comportement actuels. |
| Première ligne d'accueil | Créer — Contact — Agenda, dans cet ordre. |
| Blanc | Déplacer à l'ancien emplacement de Créer, après identification réelle de cet emplacement. |
| Créations et ajouts | Réserver systématiquement la dalle en haut à gauche, y compris Nouveau contact, nouvelle date et autres ajouts. |

Conserver les autres éléments et comportements du dashboard. Si la fonction de Boutique ou le repositionnement de Blanc ne peuvent pas être déduits sans ambiguïté, poser la question ciblée avant de réaliser la partie concernée.

### Lot 3 — Recherche et cohérence des labels

#### Recherche

- Supprimer la ligne intérieure et les lignes blanches apparaissant au clic, au focus ou à la saisie. Ajouter une petite loupe discrète.
- Conserver le design, les dimensions, les proportions, les couleurs et les coins existants, y compris lorsque le champ est actif.
- À l'accueil uniquement, le clic dans la recherche remplace les dalles par les filtres Contacts, Agenda, Projets, Activités, Vidéos, Musique et Lieux.
- Les filtres sont initialement en état fantôme, légèrement transparents. Le clic les active visuellement avec une petite coche ; plusieurs catégories peuvent être sélectionnées.
- Afficher discrètement l'indication demandée « Rechercher dans », sans autre texte explicatif ajouté.
- Dans une catégorie, filtrer directement le contexte courant : vidéos dans Vidéos, agenda dans Agenda, contacts dans Contacts, etc. Ne pas y afficher le sélecteur de catégories de l'accueil.
- Les résultats restent dans les dalles natives du dashboard avec leurs interactions. Aucun écran ni panneau supplémentaire de résultats.
- Distinguer cet usage de la saisie d'un message en communication et du filtrage d'une liste agrandie. Les annotations R1, R2 et R3 excluent un bouton Envoyer dans un champ de recherche ou de filtrage.

#### Labels et vignettes

- Tous les labels concernés utilisent le même bandeau de fond que les outils du premier niveau, quel que soit le contenu ou le niveau de navigation.
- Préserver ce bandeau pour les contacts ; l'appliquer aux chaînes TV, vidéos et résultats de recherche YouTube.
- Tronquer les intitulés longs dans le bandeau sans modifier ses dimensions.
- Les vignettes YouTube occupent toute la surface disponible de leur brique, sans marges inutiles.
- Cette uniformisation ne doit pas changer la disposition ni les dimensions des briques ; les réorganisations explicitement demandées au lot 2 restent distinctes.

### Lot 4 — Listes partagées et corrections dimensionnelles

Employer un composant interne commun pour les contacts, capteurs de santé, rendez-vous, projets, médias, sélections de pièces jointes et réglages. Réutiliser aussi ses champs et cellules compatibles pour la fiche de création d'un contact et le parcours Rencontre. Adapter son contenu et ses actions au type d'objet sans reconstruire chaque liste séparément.

- La cellule s'agrandit dans la surface commune ; les commandes inférieures, l'input et l'assistant conservent leur place.
- Reprendre les arrondis, fonds et flous des cellules natives. Présentation horizontale, régulière, sobre et lisible.
- Corriger particulièrement les lignes de R3 : elles doivent avoir la hauteur de référence liée à l'icône et à la ligne d'input du bas, après clarification de la mesure exacte. Ne pas recopier les petites lignes de cette capture ni figer une valeur arbitraire en pixels à partir de l'image.
- Le contenu débordant défile dans la liste. La dernière ligne reste entièrement accessible et ne passe jamais sous les commandes ou l'input. Le défilement ne doit pas déplacer les commandes fixes avec le contenu.
- Conserver un champ de filtrage dans les contextes de liste qui en ont besoin.
- Pour les contacts favoris : photo à gauche, nom au centre et cœur à droite. Préserver les accessoires propres à cet usage.
- Pour les projets et médias : reprendre le dernier modèle validé. Ne pas réintroduire miniatures, cœurs ou mises en vedette là où ils ont été supprimés ; ne pas appliquer cette suppression aux contacts qui en ont explicitement besoin.
- Pour les sélections multiples de pièces jointes : sélecteur à gauche, puis informations ou visuel pertinents au type et au modèle validé.
- Adapter le même système aux rendez-vous sans inventer de nouvelles actions métier.

### Lot 5 — Contacts, Rencontre, santé et favoris du moniteur

#### Contacts — Première ouverture et ajout

- À la première ouverture de l'agenda/calendrier ou des contacts, proposer directement l'import des contacts de l'appareil si cet import n'a pas déjà été effectué. Cette demande concerne les contacts, même lorsque l'entrée initiale est l'agenda ; elle ne demande pas un import implicite des événements du calendrier.
- Sur iOS, Android et macOS, utiliser les capacités natives d'import et les autorisations réellement disponibles. La proposition d'import ne vaut pas permission accordée ni import réussi. Vérifier le propriétaire existant et ses adaptations de plateforme avant réalisation.
- Le bouton d'ajout « + » reste en haut à gauche. Il ouvre les choix **Créer un nouveau contact**, **Répertoire** et l'icône **Rencontre**. Tant que l'import n'a pas été effectué, y proposer également **Importer les contacts de l'appareil** pour reprendre l'opération si la proposition initiale a été ignorée, refusée ou non validée.
- Après un import effectivement réalisé, ne plus proposer cette action d'import, ni à l'ouverture ni dans « + ». Utiliser l'état canonique de l'import ; ne pas le déduire d'une liste vide, de la seule ouverture du sélecteur ou d'une permission non vérifiée. Les cas d'import partiel ou sans contact exploitable sont à préciser dans le plan.
- Le **Répertoire** est uniquement le répertoire applicatif déjà chargé, appelé « RF » dans la demande : contacts importés et contacts créés dans l'application. Parcourir ce répertoire via la liste commune ; ne pas ouvrir le carnet d'adresses de la machine à sa place. L'accès aux contacts de l'appareil passe par l'outil d'import.
- Cette précision remplace l'ancienne règle imposant l'import dans la dernière cellule en bas à droite. Après import, l'action Importer disparaît ; conserver le parcours Ajouter favoris décrit ci-dessous sans en faire un accès au carnet natif.

#### Contacts — Création et photo

- Créer un nouveau contact ouvre une fiche composée des mêmes cellules, champs et listes standards que le dashboard, dans la surface commune. Vérifier d'abord la documentation et les composants existants ; s'ils ne fixent pas les détails nécessaires, présenter les questions restantes pendant le plan.
- Permettre la saisie du **nom**, du **prénom**, du **numéro de téléphone** et de l'**adresse e-mail**, ainsi que le choix d'une **photo**. Une adresse e-mail est un champ du contact ; il n'est pas demandé de créer une boîte mail. Faire préciser les champs obligatoires si l'existant ne les définit pas.
- Un clic sur la photo ouvre, dans les composants standards, les deux actions demandées : **Importer une photo** et **Prendre une photo** avec l'appareil photo. Réutiliser les outils canoniques et leurs droits de plateforme ; ne pas inventer de sélecteur ou de capture parallèle.
- Présenter le design standard assemblé pour ajustement et validation par l'utilisateur. Conserver ce même langage visuel pour la fiche, le choix de photo et les étapes suivantes.
- À la confirmation, créer le contact par la chaîne canonique et le rendre disponible dans le répertoire applicatif. Le remplissage des champs et le choix de photo à la création sont explicitement demandés ; les restrictions historiques de l'action Modifier ci-dessous ne doivent pas les interdire.

#### Contacts — Favoris et modification

- Ajouter favoris ouvre la liste commune de sélection. Les contacts favoris sont ensuite visibles dans le dashboard.
- Un appui long sur un favori reprend le comportement natif de petites briques d'action autour de l'utilisateur, avec Retirer des favoris et Modifier. Reprendre leur format réduit de moitié déjà utilisé au premier niveau ; cette dimension ne définit pas la hauteur des lignes de liste.
- Retirer des favoris enlève la dalle du dashboard sans supprimer le contact.
- Modifier ouvre la surface commune avec les champs photo, nom, prénom, pseudonyme, téléphone et e-mail. Pour cette modification d'un contact existant, les indications antérieures annonçaient photo et nom non modifiables, et téléphone/e-mail renseignables s'ils manquent. La nouvelle demande autorise la saisie et la photo lors de la création ; faire préciser dans le plan si elle étend aussi l'édition ultérieure, et quelles différences subsistent entre contacts importés et créés, sans confondre les deux parcours.
- Un clic simple sur un contact ouvre la communication dans la tuile agrandie.

#### Rencontre — Profil et visibilité

- L'icône Rencontre est une entrée importante du menu d'ajout des contacts. Elle ouvre un parcours de découverte de personnes assemblé avec les briques standards, relié au profil canonique ; ne pas créer une fiche utilisateur ou un outil Communication concurrent.
- Retrouver l'accès à **Ma fiche/profil** depuis les réglages. Le profil doit permettre de renseigner les informations personnelles demandées, notamment **taille, sexe et âge**, ainsi que les critères servant à Rencontre. Vérifier les champs déjà prévus et faire préciser ceux qui manquent, leur visibilité et leur caractère facultatif.
- Prévoir deux choix distincts : **être contacté par tout le monde** et **apparaître dans le site**. Les deux sont activés par défaut conformément à la demande, et l'utilisateur peut les décocher. Leur articulation avec les droits de communication et la portée exacte de la visibilité est à préciser dans le plan, sans inverser silencieusement ces valeurs par défaut.
- Une personne ne peut ressortir que si sa visibilité le permet et si elle a renseigné les critères correspondant à la recherche. Une fiche sans aucun critère renseigné n'apparaît dans aucun résultat de Rencontre, même lorsque le choix de visibilité est activé par défaut. Ne pas déduire les critères d'une personne à sa place.
- L'âge peut être une information de profil, mais **aucun filtre d'âge n'est demandé dans Rencontre** ; la suggestion d'en ajouter un a été explicitement retirée, notamment pour Amour et Sexe.

#### Rencontre — Recherche, buts et thèmes

1. Proposer un champ de recherche **en bas** pour chercher par nom ou par un autre critère effectivement renseigné par la personne recherchée. Préciser dans le plan comment cette recherche s'articule avec le choix d'un but ; ne pas afficher des informations privées pour expliquer une correspondance.
2. Proposer les buts ci-dessous sous forme de briques. Les exemples de sous-catégories demandés ici sont des propositions initiales à affiner ensemble pendant le plan, puis à compléter progressivement ; ils ne constituent pas une nomenclature exhaustive.
3. Après le but et ses éventuels thèmes, présenter l'étape géographique commune.
4. Afficher les personnes répondant aux critères retenus avec les mêmes listes/cellules standards. L'ouverture d'une discussion rejoint l'outil Communication existant.

| But | Briques ou critères à proposer |
| --- | --- |
| Professionnel | Six domaines initiaux proposés : Santé ; Sciences et technologies ; Éducation et formation ; Commerce et services ; Administration et bureautique ; Culture et spectacle. |
| Sexe | Hétérosexuel, homosexuel, bisexuel, avec la notion de ce que la personne recherche ; préciser la correspondance entre profil et recherche. Aucun filtre d'âge ajouté. |
| Amour | Orientation et personnes recherchées, notamment hétérosexuel, homosexuel ou bisexuel. Aucun filtre d'âge ajouté. |
| Amical | Aucun sous-filtre thématique ou personnel supplémentaire à cette étape. |
| Tout | Tous les buts confondus, sans filtre de but, de thème ou filtre supplémentaire inventé. L'étape géographique commune et les règles de visibilité restent applicables. |
| Aide | Cinq briques initiales proposées : Aide à domicile ; Éducation et devoirs ; Informatique ; Démarches administratives ; Bricolage et dépannage. |
| Conseils | Cinq briques initiales proposées : Éducation ; Informatique ; Santé ; Vie quotidienne ; Démarches administratives. |
| Discussion | Philosophie, Divers, Science, Sport, Musique, Cinéma ; inclure aussi Santé pour couvrir l'exemple de parcours explicitement donné. |
| Passion — intitulé à affiner | Quatre briques initiales proposées : Sport, Spectacles, Musique, Cinéma. Conserver cette entrée supplémentaire même si son intitulé évolue. |

« Tout » et « Amical » n'ajoutent pas de filtrage spécifique. Ne pas interpréter l'objectif évoqué d'éviter les arnaques comme la demande d'un filtre caché ou comme une garantie fournie par l'absence de filtre.

#### Rencontre — Géographie et résultats

- Pour **tous les buts**, après l'étape précédente, proposer la portée géographique : **France entière**, **Monde entier** ou **Zone géographique particulière**. Pour Tout et Amical, l'absence de sous-filtre précédent ne supprime pas cette étape.
- Exemple de parcours : Discussion → Santé → choix de la portée géographique → personnes correspondantes. Conseils, Aide et les autres buts utilisent la même étape géographique réutilisable.
- Faire préciser dans le plan la définition et la saisie d'une zone particulière, la localisation utilisée pour la correspondance et sa visibilité. Ne pas supposer une géolocalisation automatique ni une nouvelle collecte de position.
- Les résultats respectent les informations renseignées, les critères choisis, la géographie et les droits du profil. Préciser ensemble les règles de correspondance et le cas des fiches partiellement renseignées avant réalisation. Une fiche sans critères n'est jamais ajoutée pour remplir une liste vide.
- Aucun résultat n'élargit silencieusement la recherche. Réutiliser le comportement standard de liste vide, sans ajout de texte ou de commandes non demandés.

#### Santé

- Employer la liste des capteurs comme sélection des favoris à afficher dans le moniteur/dashboard.
- Préserver le lien avec les données et autorisations réellement disponibles. Choisir un favori ne doit pas être présenté comme l'activation d'une source de mesure inexistante.
- Vérifier l'affichage des éléments choisis dans le moniteur et le comportement après changement de sélection selon le contrat existant.
- Appliquer les corrections de hauteur, de filtrage et de défilement du lot 4, sans reproduire la ligne qui déborde dans R3.

### Lot 6 — Communication, publication sociale et pièces jointes

La conversation individuelle, la discussion à plusieurs et le contenu de réseau social relèvent du **même outil Communication**, dans le même emplacement. Adapter son contenu et ses actions au contexte au lieu de créer deux applications ou deux architectures.

#### Discussion

- Agrandir la tuile du contact ou du contexte choisi ; reprendre la direction visuelle de R5.
- Présenter le contenu récent et permettre la consultation des échanges, médias et documents par les mécanismes réels disponibles.
- Dans ce contexte, l'input devient « Écrire un message » avec une commande Envoyer, éventuellement intégrée au champ selon l'agencement validé. L'assistant reste en bas à droite.
- Présenter Visio, Audio et Joindre ; Fermer doit rester disponible. Trancher la place de Fermer avant réalisation, car les anciens textes et R5 ne décrivent pas le même nombre de dalles.
- Pour Visio et Audio, réutiliser exactement la logique native existante : clic bref pour initier l'appel correspondant ; maintien pour enregistrer ; relâchement pour arrêter ; glissement vers le haut pendant le maintien pour verrouiller ; nouveau clic pour arrêter un enregistrement verrouillé.
- Préserver la distinction entre appel et message enregistré ainsi que les permissions et le routage canoniques. Vérifier les comportements de fin et d'envoi au lieu de les supposer.

#### Pièces jointes

- Joindre présente d'abord des dalles de choix de type : Projets, Images, Vidéos, Audio et autres fichiers selon les capacités existantes.
- La catégorie choisie ouvre la liste commune correspondante dans la même surface supérieure.
- Permettre la sélection de plusieurs éléments, avec le sélecteur à gauche et les informations pertinentes. Distinguer sélectionner, confirmer la pièce jointe et envoyer le message.
- Préserver le contexte de discussion lors de la navigation, de la fermeture ou de l'annulation de cette sélection.

#### Réseau social

- Reprendre la direction visuelle de R4 : auteur, contenu média, informations utiles et bande d'actions.
- Conserver les interactions demandées Aimer, Partager, Reprendre, Vidéo, Audio, Joindre et Fermer, avec uniquement celles qui sont pertinentes dans le contexte validé.
- Remplacer l'action barrée par Partager conformément à l'annotation. Ne pas inventer le sens de Reprendre, la destination du partage ou la fonction exacte de Vidéo.
- Appliquer la navigation commune du lot 7 aux contenus, publications, conversations et fils compatibles. Les positions précédent/suivant et l'accès terminal à une nouvelle discussion ou publication sont désormais précisés ; ne faire arbitrer que le sens physique horizontal et les cas de navigation encore ouverts en section 5.

### Lot 7 — Télévision, YouTube, lecteurs et orientation

- Reprendre R1 pour l'organisation générale : média dans la grande prévisualisation, outils sous le média, input de recherche en bas et assistant à droite.
- Retirer l'action « Je n'aime pas » barrée dans cette référence. Reprendre les actions J'aime, Favoris, Suggestion, Pause et Fermer représentées dans R1, en les adaptant aux capacités réelles du média et au comportement de lecture validé.
- Dans cet affichage, le champ « Chercher » recherche un contenu ; il n'affiche pas une invitation à écrire un message ni un bouton Envoyer.
- Corriger le défaut de rotation pendant la lecture : vidéo et conteneur doivent se redimensionner et se repositionner dans l'espace disponible en portrait et paysage, sans débordement, déformation ou perte des commandes essentielles.
- Respecter le ratio du média et les capacités de la source. Ne pas confondre les bandes noires du contenu avec un débordement de conteneur.
- Intégrer la navigation entre contenus définie ci-dessous au lecteur partagé. Faire préciser seulement les gestes encore indéfinis d'apparition/masquage des contrôles, de lecture/pause et de déplacement dans une vidéo. Adapter les actions à une vidéo à la demande ou à un direct sans promettre une capacité absente de la source.
- Vérifier les conflits entre gestes de lecture, navigation, défilement et interaction avec les outils. Ne pas créer de lecteur ou de contrôle local concurrent.

#### Navigation commune par balayage — Vidéos, chaînes et threads

Le terme « sweep » de la demande désigne ici un balayage ou swipe. Mutualiser son propriétaire et l'historique de navigation pour les contextes compatibles, en préservant les différences de contenu et les gestes natifs des outils.

| Axe ou position | Comportement demandé |
| --- | --- |
| Balayage **du haut vers le bas** sur le contenu | Passer au contenu suivant de la suite courante : vidéo suivante sur YouTube, chaîne suivante en télévision. Pour les threads, préciser dans le plan l'unité suivante concernée, sans inventer une seconde navigation concurrente. |
| Côté **gauche** de la navigation horizontale | Retrouver les éléments précédents de l'historique : vidéos, discussions ou publications déjà consultées selon le contexte. |
| Côté **droit** de la navigation horizontale | Retrouver les éléments suivants lorsqu'ils existent, notamment après un retour en arrière. |
| Extrémité de la suite, après les éléments suivants existants, dans un contexte de communication compatible | Proposer l'accès à **Nouveau thread**, **Nouvelle discussion** ou **Nouvelle publication**, selon le contexte, par l'outil de création canonique. Il s'agit d'ouvrir la création, pas d'envoyer ou de publier automatiquement. |

- La demande donne à la fois l'expression « de droite à gauche » et les positions « précédents à gauche, suivants à droite ». Conserver ces destinations et faire confirmer dans le plan le mouvement exact du doigt qui conduit à chacune ; ne pas confondre déplacement du doigt et déplacement du contenu.
- Distinguer le contenu suivant de la suite courante et l'élément suivant de l'historique. Faire préciser les limites de la suite, l'ordre des éléments et le devenir de l'historique après un nouveau choix, plutôt que supposer une boucle, une recommandation ou un élément inexistant.
- L'accès terminal à la création concerne les threads, discussions et publications qui disposent de ce parcours ; ne pas l'appliquer arbitrairement à une chaîne TV ou à la création d'une vidéo YouTube.
- Délimiter les zones et priorités des gestes : le balayage vers le bas sur un contenu navigue ; le même axe sur l'assistant ouvre les réglages du lot 10. Préserver le défilement interne d'une discussion, les gestes d'enregistrement et les interactions avec le lecteur ; régler les collisions réelles dans le propriétaire partagé.

### Lot 8 — Création, enregistrements et projets Basic/Pro

#### Parcours commun de création

La création démarre par l'outil placé en haut à gauche. La tuile s'agrandit dans la surface commune, les outils contextuels apparaissent au-dessus de l'input et l'outil atome passe en bas à droite.

- Texte : permettre la saisie et l'édition directes ; proposer les outils élémentaires de police, taille, couleur et mise en forme effectivement disponibles. Ne pas construire un traitement de texte conventionnel.
- Dessin : surface interactive et outils natifs de tracé, couleur et épaisseur. Ne pas inventer de commandes pour remplir une barre.
- Images : appliquer la même organisation pour création, manipulation et consultation, avec les outils réels nécessaires.
- Audio et vidéo : utiliser le même parcours pour enregistrer, avec le retour visuel approprié et les commandes natives. À la fin, restaurer l'affichage attendu.
- Faire préciser la liste exacte d'outils texte, dessin et image après avoir montré les possibilités internes vérifiées.

#### Fin d'opération

| Commande | Sens attendu |
| --- | --- |
| Fermer | Quitter la surface de prévisualisation ou d'édition et restaurer l'affichage précédent. Distinguer cette action d'une annulation. |
| Valider | Terminer logiquement l'opération et confirmer le résultat créé ou enregistré. |
| Annuler | Abandonner uniquement l'opération courante via les mécanismes canoniques d'historique ou de transaction, sans affecter les autres éléments du projet. |

L'état est enregistré continuellement selon le modèle atome. Ne pas ajouter de sauvegarde manuelle classique ni de sauvegarde de session parallèle. N'afficher que les commandes pertinentes ; préciser avant réalisation tout cas où Fermer une opération en cours reste ambigu.

#### Ajout au projet et consultation

- Tout texte, dessin, image, enregistrement audio/vidéo ou autre contenu produit et validé alimente automatiquement le projet courant par la chaîne canonique.
- Cet ajout ne doit pas ouvrir automatiquement le projet : créer, ajouter au projet et ouvrir explicitement son environnement sont des actions distinctes.
- Dans Basic, Projet, Derniers projets et Dernier projet affichent leurs éléments dans la surface de prévisualisation du dashboard, avec les listes communes.
- La sélection déclenche l'action adaptée au type : lecture audio ou vidéo, affichage du texte ou de l'image, consultation du contenu d'un projet.
- Basic reste une expérience simplifiée : aucun basculement automatique ni accès indirect ajouté vers l'éditeur complet au cours de ces parcours.
- Pro conserve ses fonctions avancées et l'accès à l'édition complète selon les mécanismes déjà définis.
- Si aucun projet courant n'est disponible, examiner le contrat existant et faire trancher uniquement la décision manquante ; ne pas inventer de stockage ou de projet implicite concurrent.

### Lot 9 — Enregistrement et relecture précise des actions

Reproduire le scénario initial : ouvrir un projet, activer l'enregistrement d'actions, passer en dessin, tracer une forme puis relire. Le défaut décrit est l'apparition immédiate de la forme finale, suivie d'éventuels déplacements, sans restitution progressive du tracé.

- Suivre toute la chaîne réelle : gestes de création, commandes et mutations, journalisation, données conservées puis exécution de la relecture.
- Corriger la cause pour reproduire les gestes de dessin progressivement et dans leur temporalité, au lieu de simplement insérer le résultat final.
- Préserver l'identité des objets, leurs propriétés pertinentes, la précision des gestes et l'ordre des événements par les mécanismes canoniques, sans deuxième journal de vérité.
- Vérifier aussi les autres gestes pris en charge par l'enregistreur, notamment déplacements, redimensionnements et rotations lorsqu'ils sont concernés. Ne pas limiter la correction à une animation cosmétique du dessin.
- Vérifier qu'une relecture répétée ne produit ni création en double, ni dérive du résultat, et qu'elle reste compatible avec l'historique et la persistance applicables.
- Présenter une preuve visuelle du tracé rejoué, en complément des vérifications techniques.

### Lot 10 — Réglages du compte et préférences en briques

- Un balayage **vers le bas sur l'assistant/outil atome** ouvre les réglages. Conserver les choix demandés : **Confidentialité**, **Niveau d'expertise**, **Compte**, **Sécurité**, **Mot de passe**, **Ma fiche** et **Préférences**, en vérifiant leur organisation actuelle.
- Chaque choix ouvre uniquement les cellules de son propre domaine, dans une nouvelle liste standard utilisant le composant commun du lot 4. Ne plus afficher le panneau complet des réglages pour une seule rubrique.
- **Préférences** mène à un autre niveau composé des briques **Préférences**, **Communication**, **Serveur**, **Langue**, **Visuel**, **Mail** et **Assistant**. La présence d'une entrée Préférences à l'intérieur de Préférences est explicitement mentionnée : en préciser le contenu dans le plan pour éviter une boucle de navigation, sans la supprimer silencieusement.
- Pour **Confidentialité**, n'afficher que la liste de ses réglages, avec le même modèle standard. Appliquer ce principe à chaque choix des réglages et à chaque sous-rubrique de Préférences.
- Décomposer les anciens panneaux monolithiques en assemblages des briques internes correspondantes. Préserver leurs outils, options, valeurs et chemins de commande réels ; ne pas recopier leur logique dans de nouveaux panneaux locaux.
- **Ma fiche** rejoint le profil utilisé par Rencontre au lot 5. Ne pas créer deux profils indépendants pour les réglages et les contacts.
- Présenter et faire valider le design de la liste standard, puis l'appliquer de manière cohérente à ces niveaux. Réutiliser la navigation de retour existante et préserver les changements selon les contrats canoniques, sans ajouter de contrôles non demandés.

### Lot 11 — Déconnexion depuis le geste vers le haut

Le balayage **vers le haut sur l'assistant/outil atome** ouvre une confirmation de déconnexion intégrée à la bande d'input. Ce parcours possède les règles suivantes, qui remplacent l'ancienne disposition de confirmation.

#### Présentation

- Transformer le contenu de l'input : il quitte son contexte de saisie courant pour afficher la confirmation de déconnexion. Le panneau devient rouge, avec un contenu central centré dans l'input. La transcription évoque « déconnecté » pour ce contenu : faire confirmer son libellé exact lors du plan, sans annoncer une déconnexion déjà effectuée avant confirmation.
- Afficher **Annuler en haut**, sous le doigt à l'arrivée du geste vers le haut.
- Afficher **Déconnecter en bas**, sous le logo atome, en rouge dans l'input. Cette cible basse porte la confirmation ; aucun libellé Valider supplémentaire n'est nécessaire.
- Supprimer **Valider en haut** et l'ancien bouton Déconnecter séparé, devenu redondant. La cible Déconnecter intégrée à l'input reste l'unique action de confirmation.
- Composer les contrôles et les tokens standards ; faire ajuster le rendu rouge, les positions et le texte central par l'utilisateur, sans créer un autre style de panneau.

#### Gestes et états

| Interaction | Résultat attendu |
| --- | --- |
| Monter vers le haut puis relâcher sous Annuler, sans autre geste | Garder la confirmation ouverte. Ce relâchement seul ne déconnecte pas et n'annule pas. |
| Cliquer explicitement sur Annuler | Fermer la confirmation et restaurer le contexte précédent, sans déconnecter. Le relâchement du geste d'ouverture ne doit pas être interprété comme ce clic. |
| Cliquer en dehors de la confirmation | Annuler et revenir au contexte précédent, sans déconnecter. |
| Monter puis redescendre directement, sans lever le doigt, et relâcher sur la cible basse Déconnecter | Confirmer et exécuter la déconnexion **en un seul geste continu**. |
| Ouvrir par le geste vers le haut, relâcher, puis cliquer sur Déconnecter en bas | Exécuter la même déconnexion par le même outil canonique. |
| Relâcher sans atteindre une cible de confirmation | Ne pas déconnecter ; conserver la confirmation tant qu'aucune annulation explicite n'a eu lieu. |

- L'annulation nécessite un clic sur Annuler ou un clic extérieur. Ne pas ajouter d'annulation automatique au simple relâchement ni de confirmation automatique à l'ouverture.
- Faire exécuter une seule fois la commande canonique de déconnexion après confirmation, quel que soit le parcours choisi. Vérifier les événements de geste/clic pour éviter un déclenchement en double ou un clic involontaire sur Annuler au premier relâchement.
- Conserver les contrats existants de session et de restauration de l'interface. Ce lot adapte le déclenchement et la confirmation ; il ne demande pas de modifier des paramètres personnels de sécurité.

### Lot 12 — Intégration complète et bilan

Exécuter les scénarios transversaux après assemblage de tous les lots. Vérifier les variantes réelles et chaque frontière de runtime concernée, conformément aux procédures du dépôt. Corriger les régressions avant de conclure.

Mettre à jour les cartes d'architecture/API/design et le fichier d'état du framework quand les faits nouveaux et les changements réalisés le requièrent. Ne pas présenter une intention ou une limitation non vérifiée comme une capacité implémentée.

Terminer par un bilan indiquant les lots intégrés et validés, composants réutilisés ou étendus, fichiers modifiés, tests réellement exécutés, validations visuelles reçues et éventuelles vérifications encore impossibles. Une validation obligatoire manquante laisse l'acceptation correspondante ouverte.

### Lot 13 — eVe Basic grandit avec les objectifs de santé (20 oct. 2026)

Décisions de l'utilisateur : la récompense est la brique débloquée elle-même ; une brique verrouillée est invisible à l'accueil, seule la prochaine apparaît en fantôme dans la rubrique Objectifs ; sans mesures de santé (Web, Mac, accès refusé), les séances déclarées comptent.

- Paliers (`eVe/domains/dashboard/dashboard_progression_catalog.js`) : P0 socle (Atome, Contacts, Agenda, Objectifs) ; P1 un objectif de santé avec sa cible → Moniteur ; P2 3 jours sur 7 ou 3 séances sur 14 → Activité et la brique de son objectif ; P3 10/14 ou 8/14 → le second moniteur, la Médiathèque (case `library`, depuis le template v5), toutes les activités, Capture, Plan (mouvement) ; P4 21/28 ou 20/28 → Créer, Divertissement, Projets, Dernier projet, Plan. La Boutique reste verrouillée tant qu'elle n'a pas de contenu.
- Outils MCP `dashboard.progression.read|evaluate`, `dashboard.objectives.list`, `dashboard.objective.target.set`, `dashboard.monitors.select` ; l'accueil et la rubrique passent par eux.
- État : réalisé (tests `tests/eve/dashboard_progression_{rules,runtime}.test.mjs`, sonde `temp/dashboard_progression/real_app.probe.mjs` 16/16), **validé visuellement par l'utilisateur le 20 oct. 2026** (Web). iOS/HealthKit reste à vérifier sur appareil.

## 5. Questions ouvertes à résoudre au bon moment

Ces points ne sont pas des invitations à choisir silencieusement un comportement. Rechercher d'abord les réponses vérifiables dans le code et les décisions validées, puis poser seulement les questions restantes avant la réalisation dépendante.

| Point | Décision ou clarification attendue |
| --- | --- |
| Activité — Incohérence antérieure | Le lot 2 annonce « deux briques » mais cite Sport, Spectacles et liste des courses, tandis que la matrice conserve Sport/Quotidien. Quelle liste et quel nombre retenir ? Conserver cette décision ouverte dans le plan plutôt que modifier ces indications par supposition. |
| Hauteur des listes | Quelle dimension de l'icône et de la ligne d'input inférieure constitue la référence exacte ? Définir une relation responsive, sans reprendre les proportions défectueuses des capteurs. |
| Commandes de conversation | Trois dalles Visio/Audio/Joindre et Fermer près de l'input, ou quatre dalles comme R5 ? Conserver une seule disposition validée. |
| Listes de favoris | Quel rôle a le sélecteur de gauche de R2 par rapport au cœur ? Comment terminer ou annuler une sélection sans ajouter de commandes redondantes ? |
| Contacts — Création et modification | Quels champs sont obligatoires à la création ? La possibilité de choisir/importer/prendre une photo concerne-t-elle aussi Modifier ? Quelles règles d'édition pour nom, prénom, pseudonyme et les autres champs, selon un contact importé ou créé ? Ne pas remettre en cause leur saisie demandée à la création. |
| Contacts — Import | Quel état marque un import terminé s'il est partiel ou ne contient aucun contact exploitable ? Déduire les autres cas des contrats existants ; la reprise par « + » et la disparition après import réussi sont déjà décidées. |
| Contacts — Répertoire et favoris | Comment articuler la consultation du répertoire et Ajouter favoris avec les sélections existantes, sans commande redondante ? Répertoire reste le carnet applicatif chargé, jamais le carnet natif. |
| Rencontre — Profil | Quels champs et critères de Rencontre sont renseignables, recherchables ou visibles ? Qu'est-ce qu'une fiche « sans aucun critère » : un nom seul suffit-il ? Comment traiter les profils partiels ? Vérifier d'abord le contrat de Ma fiche. |
| Rencontre — Contact et visibilité | Quelle portée exacte pour « être contacté par tout le monde » et « apparaître dans le site » : utilisateurs du service, accès public, autres droits existants ? Comment ces deux choix indépendants s'articulent-ils avec les résultats et l'ouverture d'une discussion ? Leur valeur par défaut activée reste confirmée. |
| Rencontre — Buts et correspondance | Un ou plusieurs buts/thèmes peuvent-ils être choisis, côté profil et côté recherche ? Comment distinguer orientation personnelle et personnes recherchées pour Amour/Sexe ? Quel intitulé retenir pour Passion et quelles catégories proposées valider ? Aucun filtre d'âge à réintroduire. |
| Rencontre — Recherche et Tout | Comment le nom ou un critère saisi en bas se combine-t-il avec le but ? Dans Tout, faut-il conserver une saisie de nom existante ou l'effacer ? Le choix n'ajoute aucun filtre de but/thème ; préciser son articulation avec la recherche textuelle sans retirer l'étape géographique commune. |
| Rencontre — Zone | Une zone particulière se définit-elle par ville, région, rayon ou autre mécanisme interne ? La correspondance utilise-t-elle une zone déclarée dans le profil ou une autre information autorisée ? Ne pas supposer de collecte automatique de position. |
| Recherche | Quel est le périmètre lorsqu'aucun filtre n'est choisi ? Quel comportement validé adopter pour quitter la recherche et retrouver le contexte précédent ? |
| Médias | Quels gestes encore indéfinis affichent les contrôles, mettent en pause ou déplacent la lecture dans une vidéo ? Comment se combinent-ils avec l'orientation et les capacités d'un direct ? Le passage haut → bas à la vidéo/chaîne suivante est déjà décidé. |
| Navigation horizontale et historique | Quel mouvement physique du doigt conduit aux précédents placés à gauche et aux suivants placés à droite ? Quel ordre, quelles limites et quel comportement d'historique après une nouvelle navigation ? Ne pas rouvrir les destinations ni l'accès terminal à la création dans les contextes compatibles. |
| Navigation sociale | Dans un thread, quelle unité parcourt le balayage haut → bas : fil, publication ou autre élément existant ? Comment distinguer les médias d'une publication, les publications et les fils, sans collision avec le défilement des messages ? |
| Réglages | Quel contenu précis ouvre l'entrée Préférences à l'intérieur du niveau Préférences ? Vérifier les autres rubriques et retours dans le code avant toute question. Toutes doivent utiliser la liste standard limitée au domaine choisi. |
| Déconnexion — Design | Quel libellé central exact remplace le contenu de l'input, et comment appliquer les tokens rouges au panneau et à la cible basse ? Les gestes, Annuler en haut, Déconnecter en bas et l'annulation par clic extérieur sont déjà décidés. |
| Actions sociales | Que signifient exactement Reprendre et Vidéo dans ce contexte ? Quels destinataires ou supports le partage doit-il proposer ? |
| Outils de création | Quelle sélection des outils natifs texte, dessin et image réellement disponibles doit être affichée ? |
| Boutique et Blanc | Si l'existant ne suffit pas, quel contenu Boutique doit-elle ouvrir et comment résoudre une collision éventuelle entre Blanc et le nouvel ordre d'accueil ? Aucun commerce complet n'est implicitement demandé. |
| Mention « le mois » | Le texte initial demande de garder « le mois » en haut des contacts. Vérifier s'il s'agit d'un élément existant ou d'une erreur de transcription ; ne pas ajouter une ligne de calendrier sans clarification. |
| Fin d'opération | Quel est le devenir d'une création ou d'un enregistrement en cours lorsque l'utilisateur ferme ? Comment la validation et l'annulation des favoris s'articulent-elles avec l'enregistrement continu ? |
| Absence de projet courant | Quel parcours appliquer si la création validée ne peut pas être rattachée à un projet courant selon le contrat existant ? |

Les décisions déjà confirmées — notamment créations en haut à gauche, corrections explicites des annotations, import reprenable, répertoire applicatif, absence de filtre d'âge, navigation précisée et gestes de déconnexion — ne doivent pas être rouvertes sans nouvelle contradiction démontrée. Poser les questions de Rencontre pendant la construction du plan pour affiner ensemble ce parcours avant sa réalisation ; poursuivre l'investigation indépendante utile.

## 6. Matrice de vérification et d'acceptation

Compléter les vérifications ciblées ci-dessous par les tests des consommateurs partagés affectés. Commencer par les contrôles pertinents les plus étroits ; élargir en cas de nouvelles frontières touchées, d'échec ou de risque non résolu. Ne pas substituer une lecture de code à une preuve d'exécution disponible.

| Scénario | Résultat attendu |
| --- | --- |
| Accueil et menu Créer | Ordre demandé, création en haut à gauche, contenu du menu dashboard correct ; menu du projet préservé. |
| Catégories | Boutique à la racine, Générateur dans Créer, Sport/Quotidien vides, Plan avec son contenu antérieur. |
| Recherche à l'accueil | Filtres fantômes puis actifs avec coche, sélection multiple, résultats dans les dalles et sortie selon la décision validée. |
| Recherche en catégorie | Filtrage limité au contexte ; aucun sélecteur global ni écran de résultats ajouté. |
| Focus et saisie | Aucun trait parasite ; proportions, couleurs et arrondis conservés. |
| Labels et vignettes | Bandeau cohérent à tous les niveaux, titres longs tronqués, vignettes YouTube sans marges inutiles. |
| Listes courtes et longues | Hauteur validée, défilement effectif, dernier élément accessible ; aucun recouvrement de l'input ou des outils. |
| Contacts — Première ouverture | Agenda/calendrier ou Contacts propose l'import si nécessaire ; refus ou abandon ne vaut pas import terminé. Vérifier iOS, Android et macOS selon les accès réels. |
| Contacts — Ajout et import | « + » ouvre Créer un nouveau contact, Répertoire et Rencontre ; Importer reste proposé tant que nécessaire, puis disparaît après import réussi, y compris après réouverture. |
| Contacts — Répertoire | La liste parcourt uniquement les contacts applicatifs importés ou créés ; aucun accès au carnet natif hors de l'outil d'import. |
| Contacts — Création et photo | Nom, prénom, téléphone, e-mail et photo disponibles dans la liste/fiche standard ; clic photo vers import ou appareil photo selon les droits ; contact confirmé disponible dans le répertoire. |
| Contacts et favoris | Ajouter favoris conservé, ajout visible au dashboard, retrait sans suppression du contact ; règles de modification validées distinctes de la création. |
| Rencontre — Profil | Même Ma fiche que les réglages ; taille, sexe, âge et critères selon le contrat validé ; contactabilité et visibilité activées par défaut puis décochables. Aucun filtre d'âge ajouté. |
| Rencontre — Parcours | Neuf buts présents avec les thèmes validés ; Tout et Amical sans sous-filtre spécifique ; recherche basse par nom ou critère déclaré ; France/monde/zone proposés pour chaque but. |
| Rencontre — Résultats | Personnes conformes aux critères, à la zone et aux droits ; aucune fiche sans critères, aucun élargissement silencieux ; distinction entre visibilité et contactabilité respectée selon le plan validé. |
| Capteurs favoris | Sélection et filtrage corrects, affichage dans le moniteur, respect des autorisations et aucune dernière ligne débordante. |
| Rendez-vous et autres listes | Même composant partagé avec contenu et actions adaptés ; aucune généralisation abusive des photos, cœurs ou miniatures. |
| Conversation et social | Même outil et même emplacement, contenu adapté, saisie pertinente, fermeture correcte et actions sociales selon les décisions validées. |
| Appels et messages enregistrés | Clic bref, maintien, relâchement, verrouillage par glissement et arrêt après verrouillage distinguent correctement les actions. |
| Pièces jointes | Choix du type, sélection multiple, confirmation/annulation et retour à la discussion sans perte du contexte. |
| TV et YouTube | Recherche à la place du message, absence d'envoi dans ce champ, actions annotées corrigées et contrôles pertinents à la source. |
| Navigation verticale | Haut → bas sur le contenu passe à la vidéo ou chaîne suivante ; comportement des threads selon l'unité validée, sans déplacement dans la lecture ni défilement détourné. |
| Navigation horizontale | Précédents à gauche, suivants à droite lorsqu'ils existent, mouvements du doigt selon le plan validé ; historique et limites cohérents. |
| Création en bout de parcours | Après les éléments suivants existants, accès contextuel Nouveau thread/discussion/publication ; ouverture du parcours canonique sans envoi/publication automatique ni création arbitraire en télévision. |
| Rotation pendant lecture | Portrait vers paysage puis retour : média et conteneur dans l'écran, ratio préservé et commandes accessibles. |
| Texte, dessin et image | Surface agrandie interactive, vrais outils contextuels au-dessus de l'input, assistant en bas à droite. |
| Enregistrement audio/vidéo | Retour visuel adapté, commandes natives, fin cohérente et résultat intégré selon le parcours validé. |
| Fermer, Valider, Annuler | Sémantiques distinctes, restauration correcte et annulation limitée à l'opération ; aucun bouton de sauvegarde classique. |
| Projet courant | Contenus validés ajoutés sans ouverture automatique de l'environnement complet. |
| Basic et Pro | Consultation simplifiée dans Basic, y compris Dernier projet ; fonctions avancées de Pro préservées. |
| Enregistrement des gestes | Tracé progressif et temporalité reproduits ; gestes concernés exacts, sans doublon à la relecture. |
| Réglages et préférences | Balayage bas sur l'assistant ; rubriques demandées et sept briques de Préférences présentes ; chaque choix ouvre sa seule liste standard, profil partagé et aucune boucle Préférences. |
| Déconnexion — Affichage | Balayage haut sur l'assistant ; confirmation rouge intégrée à l'input, contenu central validé, Annuler en haut et Déconnecter en bas sous atome ; ancien bouton séparé et Valider en haut absents. |
| Déconnexion — Confirmation | Aller-retour haut → bas puis relâchement sur la cible basse, ou clic ultérieur sur Déconnecter : même commande exécutée une seule fois. |
| Déconnexion — Annulation | Relâcher après la montée laisse la confirmation ouverte ; clic Annuler ou clic extérieur restaure le contexte sans déconnexion. Aucun clic involontaire à la fin du geste d'ouverture. |
| Transitions et adaptation | Aucun scintillement ni résidu ; navigation, clavier, tailles, orientations et zones de sécurité gérés. |

Pour les contrôles Web, Tauri et iOS, appliquer le protocole du projet et indiquer les appareils ou environnements effectivement utilisés. Ajouter les contrôles Android et macOS des imports et de l'appareil photo selon les frontières réellement concernées. Ne pas déclarer une plateforme validée par simple analogie avec une autre.

À chaque étape visuelle, présenter les pixels réellement obtenus et les interactions vérifiées, puis attendre l'accord explicite de l'utilisateur. En fin de chantier, distinguer clairement : fonctionnement techniquement vérifié, visuel validé par l'utilisateur, décision encore attendue et contrôle impossible avec sa cause observée.

Le travail est terminé lorsque toutes les exigences sont intégrées, les vérifications applicables passent, les visuels ont reçu leur validation et les blocages obligatoires sont levés. En cas de limitation réelle, poursuivre le travail indépendant utile, décrire précisément ce qui reste et l'action minimale nécessaire ; ne pas annoncer une intégration complète par défaut.

## 7. Suivi de réalisation

Plan global : `~/.claude/plans/traite-loutes-les-taches-humming-scone.md` (lot 0 = audit fait le 19 oct. 2026). Références R1–R5 reçues le 19 oct. Décision du 19 oct. : Visio, Audio, Joindre, Fermer (et Annuler/Fermer des listes) sont des **outils** au-dessus de l'input, pas des dalles. Consigne du 19 oct. : ne retirer aucune fonction existante du dashboard (appui long et ses petits outils, balayages…) ; l'appui long doit fonctionner sur quasiment tous les éléments du dashboard, contacts favoris compris (Retirer des favoris, Modifier).

| Lot | État |
| --- | --- |
| 0 — Audit | Fait (19 oct.) |
| 2 — Accueil, catégories, menu Créer | **Validé** (19 oct.) : sonde `temp/dashboard_enhancement/lot2.probe.mjs` verte en eVe Pro téléphone/bureau et eVe Basic, visuel validé par l’utilisateur. Contenu de Boutique encore à décider (tuile sans rubrique). « Blanc » interprété comme « Plan » (GPS renommé) placé à l'ancienne case de Créer. |
| 2b — Heure et météo autour de la Dynamic Island | Demande ajoutée le 19 oct. : heure à gauche et météo à droite de la Dynamic Island, centrées verticalement sur elle. **Validé** visuellement (19 oct.) sur Web avec zone de sécurité iPhone simulée (`temp/dashboard_enhancement/lot2b_island.probe.mjs`). Contrôle sur iPhone réel à faire (le simulateur n'a pas WebGPU). |
| 3 — Recherche et labels | **Validé** (19 oct.), sauf le dernier ajustement demandé : une portée choisie s'allume du halo pulsant des outils actifs (plus de coche) — fait, `lot3.probe.mjs` vert, à confirmer d'un coup d'œil. Bandeau du titre YouTube en verre au-dessus de la vignette. Périmètre sans portée choisie = toutes les portées ; sortie = Retour ou toucher hors des plaques. |
| 11 — Déconnexion par le geste vers le haut | **Validé** (19 oct.) : `temp/dashboard_enhancement/lot11.probe.mjs` vert en eVe Pro (MODE=slide, tap, field) et eVe Basic. Annuler au-dessus de l’Atome sous le doigt, « Quitter eVe » (icône déconnexion) symétrique au-dessous — glisser haut puis bas et relâcher dessus déconnecte d’un geste —, champ du bas rouge « Déconnecter » conservé ; plus de Valider ni de retrait automatique de 10 s ; une seule déconnexion. |
| 9 — Enregistrement et relecture des gestes | **Validé** (19 oct.) : défaut reproduit par la route du rail Naturel quand un objet est sélectionné au Record (la prise lui appartient, le trait dessiné hors de lui n'était pas journalisé → relecture « forme finale d'emblée »). Correctif dans `natural_action_journal.js` : ce qui naît pendant la prise lui appartient. Sondes vertes : `temp/dashboard_enhancement/lot9.probe.mjs` (CASE=empty et selected : trait absent puis progressif, relecture répétée sans doublon ni dérive), `temp/draw_latency/draw_record_replay.probe.mjs` et `shape_record_replay.probe.mjs` (création + déplacement). iOS : l'app embarque le JS, un nouveau build est nécessaire pour y voir le correctif. |
| 1 — Surface commune, disposition et transitions | **Validé** (19 oct.) : `temp/dashboard_enhancement/lot1.probe.mjs` vert. Surface partagée (`dashboard_mystic_geometry.js#surfaceRects`, ≈ ¾ de l'accueil), bande d'outils contextuels (`dashboard_surface_tools.js`, outils canoniques du ruban alignés à droite au-dessus du champ), Atome ancré au bout du champ, toutes les tuiles effacées, croissance depuis la plaque touchée et retrait vers elle, suivi des rotations/redimensionnements (`stage.relayout`). Plan (GPS) et message gardent leurs propres actions. |
| 4 — Listes partagées | **Validé** (19 oct.) : tout panneau canonique peut être hébergé dans la surface (`context.hostBounds`, sans pied, `bevy_panel_projection.js`), ouvert par `stage.openPanel` (grandi depuis sa plaque), outils Annuler/Fermer dans la bande, champ du bas « Filtrer ». Premier consommateur : capteurs santé (R3) — lignes à la hauteur d'un outil et du champ (`rowDensity: 'tall'`), défilement réel, dernière ligne au-dessus des outils, filtre, Annuler rend le choix d'avant. `temp/dashboard_enhancement/lot4.probe.mjs` vert (Web : capteurs déjà choisis listés « indisponibles »). Rendu iOS à vérifier sur l'iPhone. Contacts, rendez-vous, pièces jointes, réglages : branchés aux lots 5, 6, 10. |
| 10 — Réglages en briques | **Validé** (19 oct., globalement ; libellés de Confidentialité à clarifier) : glisser l'Atome vers le bas → Confidentialité, Niveau d'expertise, Compte, Sécurité, Mot de passe, Ma fiche, Préférences ; chaque brique ouvre SA rubrique seule sur la surface (panneau Home `focus`, sans autres sections ni pied, `buildHomeSettingsFocus` réutilise les constructeurs existants ; `securityBody` découpé en compte / sécurité / mot de passe), Fermer dessous, retour sur la liste des briques. Préférences → Préférences, Communication, Serveur, Langue, Visuel, Mail, Assistant ; « Préférences » interne = latéralité et accessibilité (`ownerBodyChoices`, aussi dans Ma fiche) — **à confirmer**. Correctif Mystic : une grille fermée pendant qu'elle était suspendue rend son arbre au moteur (`bevy_ui_mystic_grid_runtime.js#detach`). `temp/dashboard_enhancement/lot10.probe.mjs` vert, lots 1 et 4 revérifiés. |
| 5 — Contacts, Rencontre, santé | **Validé** (19 oct., après retrait de « Déconnecter » du panneau Moi / Ma fiche : se déconnecter = seulement le geste de l'Atome ; sonde `lot5_home_no_logout`, contrat `tests/probes/user_login_logout_focus_contract.probe.mjs` mis à jour). Contacts : état canonique « importé sur cet appareil » (`import_lifecycle.js#completed`, `last_completed_at` posé une fois au premier passage complet — sonde `lot5_import_state`) ; « + » en haut à gauche → Créer un nouveau contact, Répertoire, Rencontre, Importer (tant que dû) ; fiche de création sur la surface (photo Importer / Prendre — `capturePhoto({ persist: false })` —, nom ou prénom obligatoire, Annuler / Valider) ; Répertoire = panneau Contact en mode carnet seul (cœurs, filtre) ; appui long sur un favori → outils Ôter (des favoris) / Éditer, dessinés comme les outils d'édition d'une tuile (libellés ≤ 6 caractères, règle des outils). Règles d'édition (décision 7) : un contact importé (`isImportedContactId`) garde nom, prénom, pseudonyme, photo et téléphone de sa source (`loadHomeSubject` → `locked`, champs sans action, `canEdit` refuse la clé) ; e-mail manquant complétable ; contact créé dans eVe entièrement modifiable — sonde `lot5_edit_rules` verte. Rencontre (refaite le 19 oct. selon R4, choix utilisateur : vertical = personnes, horizontal = photos, 6 photos max, outils Favori / Masquer / Fermer + message direct ; puis précisé : dans la fiche on parcourt SES photos, Retour revient aux plaques) : contrat partagé `atome/src/shared/meeting_contract.js` (buts, thèmes, sexe, orientation, recherche, zone déclarée, accroche ≤ 60, présentation ≤ 1000, photos ≤ 6, personnes masquées ; `meetingDeclarations` = seul ce que l'annuaire garde) ; serveur `directoryPublicService.js` (`meet` exclut les masqués, `meetCard` ne donne accroche/présentation/photos qu'à qui correspond sous la même recherche ; action WS `meet_card`, `AdoleAPI.directory.meetCard`) ; résultats = plaques photo comme les vidéos (niveau Mystic paresseux, Retour = recherche serveur nom/ville, silhouette sans photo) — `eVe/domains/dashboard/dashboard_meeting.js` ; fiche plein cadre sur la surface — `dashboard_meeting_card.js` : photo pleine, segments, bande sombre translucide nom · âge (si date partagée) · zone + accroche, toucher = présentation dépliée, glisser de côté = ses photos (geste canonique `bevy_panel_tile_gesture.js`) ; outils Favori (halo si favori) / Cacher / Retour (libellés ≤ 6 caractères : « Masquer » devient « Cacher ») ; champ du bas « Écrire un message » + Envoyer (mode `compose` de la surface) : un premier message part comme mot de la demande de contact (règle serveur `contact_required`). Ma fiche › Rencontre : Mes photos (panneau Média, réduites 1280 px JPEG, croix pour retirer, + tant que < 6), Accroche, Présentation (champ multiligne `areaNode`) ; photos dans la propriété `meeting_photos` écrite à part (`eVe/domains/user/meeting_photos_api.js`), jamais dans `eve_profile`. Correctif moteur : une grille Mystic suspendue sous la surface retenait l'appui et avalait les déplacements (`intuition/mystic/context.js`) — aucun glisser n'atteignait un panneau hébergé (touch iPhone compris). Sondes vertes : `lot5_meeting_contract`, `lot5_meeting_server` (fiche refusée hors correspondance, masqué jamais revu, annuaire sans photos ni textes), `lot5_meeting_ui` (15 contrôles). Santé : liste des capteurs favoris couverte par `lot4.probe.mjs`. **Reste** : mise à jour des maps (lot 12) ; hors Web : photo prise sur iPhone (pont natif `persist:false` à écrire — erreur explicite `photo_capture_unpersisted_unavailable` aujourd'hui) ; import Android indisponible (aucun pont) ; la recherche Rencontre exige le déploiement du serveur sur atome.one (non autorisé sans demande). |
| 7 — TV, YouTube, rotation, balayages | **Validé** (20 oct.). Décisions confirmées le 20 oct. : J'aime privé (`intuition/tools/media_likes_preference.js`, jamais envoyé à YouTube), Favori TV existant + Favori YouTube (`youtube_history_preference.js`, en tête de la rubrique) ; Idées (libellé ≤ 6) = recherche YouTube chaîne + titre (sa chaîne d'abord, puis chaînes aimées) / chaînes TV du même pays partageant une catégorie (catégories aimées d'abord), en plaques à la place de l'image ; « Arrêter » retiré. Navigation `dashboard_media_navigation.js` : haut→bas = suivant de la liste d'origine (arrêt en fin), doigt gauche→droite = retour, droite→gauche = en avant, nouveau choix = l'avant est abandonné. `dashboard_stage_media.js` porte plaques, outils, idées, balayages, progression et « Chercher » ; la scène garde la lecture (`swap` sans rétrécir/regrandir). Barre de progression YouTube dans l'écart image/outils (sur l'image la découpe vidéo l'efface), toucher = aller à ; direct TV sans barre. Champ du bas « Chercher » pendant la lecture, sans Envoyer : Entrée cherche des vidéos (YouTube) ou des chaînes (TV). Correctif Mystic : un niveau paresseux (YouTube) s'ouvrait sur sa lecture précédente — la lecture fraîche remplace maintenant la plaque en place (`bevy_ui_mystic_activation.js`, `refreshLevel`). Icônes créées : `star.svg`, `idea.svg`. Sondes vertes : `lot7.probe.mjs` (18 contrôles, vraie lecture YouTube), `lot7_tv.probe.mjs` (BFM TV → arte, Idées). Rotation : paysage/portrait, la vidéo et ses outils suivent. |
| 6 — Communication, publication, pièces jointes | **Validé** (20 oct.), recommandations confirmées le 20 oct. Discussion (R5) : la conversation canonique hébergée sur la surface jusqu'à la bande (`cover: 'band'`), ses outils Visio / Audio (logique native : toucher = appel, maintenir = prise, glisser vers le haut = verrou) / Joint / Fermer en pied, le champ du bas « Écrire un message… » + Envoyer (texte + prises + pièces d'un coup, `sendText`) ; Fermer passe par la surface (`hostClose`). Joindre : types Projet / Images / Vidéos / Audio / Autres en outils de la bande (rien dans le corps), puis les objets à cases dans le corps, Annuler / Joint (valider) (`bevy_panel_contact_conversation_attach.js`). Correction du 20 oct. (images 2 et 3 refusées) : aucune commande dans le corps ; prise relue = Lire / Caméra / Encore / Ôter / Envoi / Suite dans la bande, « Suite » rend les outils habituels (la prise attend en puce) ; média de l'historique = Lire / Fermer. Publication (R4) : `dashboard_news_publication.js` depuis Messages — auteur et heure (« via » d'une reprise), média, titre et texte sur bande sombre ; outils Aimer (l'auteur seul est prévenu, `news-like`), Diffus (choix de personnes `dashboard_people_picker.js`, puis Envoi), Relais (republiée, créditée), Vidéo / Audio / Joint (la conversation de l'auteur sur la surface), Fermer ; champ du bas = écrire à l'auteur (premier contact = demande avec le mot, `dashboard_first_contact.js`). Serveur : `news_broadcast.js` actions `like` et `repost` (médias de l'auteur lisibles par l'audience de la reprise) — sonde `lot6_news_server` verte. Balayages : publication haut→bas = suivante, côtés = historique, au-delà de la dernière « Créer » (nouvelle publication) ; discussion : en-tête de la personne balayé de côté = discussions consultées, au-delà = Répertoire. Correctifs : le champ du bas qui a un rôle (Filtrer, Écrire, Chercher) n'ouvre plus Messages au premier toucher ; une notification garde sa `publication` ; bande d'outils réduite pour 7 outils ; libellés ≤ 6 (« Diffus », « Relais », « Envoi », « Créer »). Correctif Mystic : une grille suspendue sous la surface ne repeint plus (halo « allumé » `bevy_ui_mystic_runtime.js`, peinture en vol effacée après démontage `bevy_ui_mystic_level_turn.js`). Sondes vertes : `lot6_discussion` (10), `lot6_publication` (11), `lot6_news_server` (6). |
| 8 — Création, enregistrements, projets Basic | **Validé** (20 oct.) prises refaites en **liste canonique** (option A, validée le 20 oct. ; à étudier : zone qui lit — l'aperçu — et renommage par le nom) : les prises audio et vidéo du projet en rangées (case, aperçu, nom · durée), la nouvelle cochée ; toucher une rangée la lit (vidéo en grand au-dessus) ; Lire / Ôter / Garder sur les rangées cochées (`dashboard_takes_list.js`) ; recommandations prises comme validées (« tu ne dois pas t'arrêter », 20 oct.). Créer › Texte / Dessin / Forme / Image sur la surface (`dashboard_create_surface.js`), versés au PROJET COURANT (le dernier travaillé, comme la Capture) sans l'ouvrir ; sans projet, Valider = « Créer » (un projet est fait, jamais ouvert). Texte : le champ du bas l'écrit (montré en direct), Teinte / Taille / Police ; Dessin : géométrie canonique `resolveDrawGeometry` montrée pendant le geste, Teinte / Taille / Brosse / Tracé (Libre, Rect., Ovale) ; Forme = dessin commencé en rectangle ; Image : Import (bibliothèque, panneau Média) / Coins, créée par `ui.creator` ; un choix change la bande (couleurs, tailles, tracés), Police montre la liste. Annuler retire le dernier trait puis abandonne ; Valider verse (`createAtome`) et ferme ; rien n'est écrit avant. Enregistrements : la prise montrée = Lecture / Annuler (elle quitte le projet, suppression canonique) / Valider. Basic : Projets = chaque projet est un niveau de ses éléments, Dernier projet = ses éléments (`dashboard_project_items.js`) ; audio / vidéo jouent sur la scène (Lecture, Fermer), image / texte / dessin en grand (Fermer) ; jamais l'éditeur. Sondes vertes : `lot8_create` (12), `lot8_capture`, `lot8_basic` (progression palier 4 publiée par son événement). Non testé de bout en bout : l'import d'une image de la bibliothèque (panneau Média). Libellés ≤ 6 : « Teinte », « Coins ». |
| 12 — Intégration et bilan | **Clos** (21 oct., à la demande de l'utilisateur ; restent à reprendre ailleurs si besoin : contenu de la tuile Boutique, libellé « Accès : public » de Confidentialité, zone de lecture (aperçu) et renommage dans la liste des prises ; bilan écrit non rédigé) : cartes `maps/ARCHITECTURE_MAP.md`, `API_MAP.md`, `DESIGN_MAP.md`, `CODEMAP.md` et `eVe/documentations/FRAMEWORK_STATE.md` §5 mis à jour ; régressions des lots 1 à 11 relancées après le lot 8 (sonde du lot 1 alignée sur la prise Lire / Annuler / Valider) ; revue des panneaux de réglage un à un par `temp/dashboard_enhancement/lot12_settings.probe.mjs` (13 panneaux, vert) ; libellés corrigés à cette revue : Latéralité, Auditif, Visuel, Générateur, Sélection, Importer, Télécharger, « Supprimer le compte », « Connecté à {serveur} » (le serveur n'était pas transmis). Teinte : pastilles sans libellé, sans Retour. Le lot 13 appartient à l'autre session (validé le 20 oct.). |
| Réseau social (proposition approuvée le 20 oct.) | **Validé** (20 oct.) : répondre à l'auteur d'une publication depuis le champ du bas (« Répondre à … » ; premier message = demande de contact avec le mot, une seule tant qu'elle attend ; Vidéo / Audio grisés jusqu'à l'acceptation) ; demande reçue sur la surface (`dashboard_contact_request.js` : la personne, son mot, outils Bannir / Refus / Fermer ; répondre = accepter puis la conversation) ; appui long sur sa plaque : Bannir / Refus ; serveur : Refus ≠ blocage (silencieux, nouvelle demande notifiée après 30 jours). Sonde `temp/dashboard_enhancement/social.probe.mjs` verte (13 contrôles). Non déployé sur atome.one. Limite : le mot de la demande reste dans Messages, il ne devient pas le premier message de la conversation. |

Décisions du 19 oct. (lot 5, validées par l'utilisateur, ajustables ensuite) :
1. « Apparaître dans le site » = accès « Public » de Confidentialité (annuaire eVe, pas le web ouvert) ; « Être contacté par tout le monde » = « Accepter les demandes hors de mon carnet ». Les deux activés par défaut.
2. Ma fiche gagne : sexe, orientation, personnes recherchées, buts choisis (plusieurs), zone déclarée (ville/région, jamais de position automatique). Âge calculé depuis la date de naissance, jamais un filtre.
3. Une fiche sans aucun but coché n'apparaît jamais dans Rencontre, même publique.
4. Correspondance : but (et thème) choisi coché par la personne, dans la zone, publique ; Amour/Sexe : orientation compatible dans les deux sens.
5. « Passion » conservé, avec Sport, Spectacles, Musique, Cinéma.
6. Recherche du bas : restreint les résultats du but choisi par nom ou critère déclaré ; dans « Tout », tous les buts.
7. Contacts : nom OU prénom obligatoire à la création ; un contact importé garde nom et photo de sa source (téléphone et e-mail complétables s'ils manquent) ; un contact créé dans eVe reste entièrement modifiable.
8. Revue finale (lot 12) : montrer un à un tous les panneaux de réglage.

À vérifier : la capture vidéo charge un aperçu `stream://capture/...` que le navigateur refuse (`ERR_UNKNOWN_URL_SCHEME`), indépendant du lot 1.

À vérifier (constats hors lot) : après l'édition d'une tuile par appui long, le glissement de l'Atome vers Réglages n'a pas ouvert la rubrique dans la sonde (à attribuer contre HEAD) ; un niveau Mystic paresseux (Divertissement › YouTube) s'ouvrait sur sa lecture précédente — corrigé au lot 7.
