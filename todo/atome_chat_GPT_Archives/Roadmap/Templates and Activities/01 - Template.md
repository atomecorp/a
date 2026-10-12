# Templates — atome

## Objectif
Ajouter à atome un système de **templates réutilisables et extensibles**, destiné à accélérer la création de projets sans repartir de zéro.

## Principe
Un template est **un projet atome comme les autres**, fondé sur le même modèle de projet, mais identifié comme **projet de type template** afin de servir de base réutilisable. Il peut contenir des atomes/molécules, des placeholders, des réglages, des conditions et des interactions déjà préparés. Lorsqu’il est utilisé pour créer un nouveau projet, le résultat est un projet atome normal que l’utilisateur peut ensuite modifier librement. Le statut template ne crée donc pas un format de projet parallèle.

La bibliothèque de templates doit pouvoir être enrichie progressivement au fur et à mesure des besoins. Le mécanisme technique exact qui identifie un projet comme template doit être aligné sur le modèle de données existant dans le code ; le principe fonctionnel, lui, est qu’il s’agit du même objet projet avec un type/statut template.

## Mode de travail par défaut du projet
Le **mode de travail par défaut est une propriété générale du projet**, et non une propriété spécifique aux templates. Un template, puisqu’il est lui-même un projet atome, utilise exactement le même mécanisme.

Le mode de travail par défaut du projet est simplement **le mode de travail actif au moment où le projet est fermé**. Aucune validation supplémentaire ni réglage dédié n’est nécessaire : fermer le projet en Consultation, Édition ou Performance enregistre ce mode comme mode par défaut pour sa prochaine ouverture.

Cette règle s’applique à tous les projets, y compris aux projets de type template. Lorsqu’un projet ou un template est sauvegardé puis partagé, le mode par défaut enregistré avec le projet est conservé. Le projet s’ouvre donc dans ce mode jusqu’à ce que l’utilisateur change de mode puis ferme à nouveau le projet, ce qui enregistre le nouveau mode comme défaut.

Ce mécanisme doit réutiliser exclusivement les modes de travail déjà existants et ne crée aucun réglage ni système parallèle propre aux templates.

## Cas d’usage initiaux
Les entrées ci-dessous désignent des **templates de projet orientés vers un usage**, et non des formats de template différents du projet atome :

- News
- Posts / publications
- Vidéo
- Audio
- Texte / document
- Pages / compositions
- Autres usages à ajouter ensuite

## Templates système, maîtrise et projet d’accueil
atome peut fournir des **templates système** associés au niveau de maîtrise de l’utilisateur. Ces templates permettent de préparer des projets adaptés à un utilisateur débutant, intermédiaire, confirmé ou à tout autre niveau défini par le système de maîtrise existant, sans créer une interface différente ni un type de projet particulier pour chaque niveau.

Au premier lancement ou dans d’autres contextes prévus par le produit, atome peut sélectionner automatiquement un template système adapté au niveau de maîtrise actif afin de présenter immédiatement un projet préparé plutôt qu’un projet vide.

Chaque utilisateur dispose également d’un **projet d’accueil de référence** auquel il peut revenir. Conceptuellement, ce projet constitue le Dashboard : il reste un projet atome fondé sur le même modèle que les autres projets et est préparé à partir d’un template système destiné à ce rôle. Le Dashboard ne doit donc pas introduire une architecture de projet séparée.

Le template système utilisé pour ce projet d’accueil peut dépendre du niveau de maîtrise et évoluer avec lui. Le projet d’accueil/Dashboard reste lié à ce template système : lorsqu’atome met à jour le template système Dashboard, la nouvelle structure est propagée automatiquement aux Dashboards déjà existants, sans demande de confirmation et sans possibilité de refuser la mise à jour. Les données propres à l’utilisateur sont conservées dans les placeholders correspondants selon les règles générales des instances liées ; les suppressions de placeholders suivent également ces règles générales.

## Exemple système de référence — Dashboard
Le Dashboard constitue le cas de référence d’un **template système complet**. Il doit être construit comme un projet atome ordinaire de type template, en assemblant les atomes, outils et interactions existants plutôt qu’en introduisant un composant Dashboard monolithique.

Sa composition de référence utilise plusieurs **rails horizontaux de contenu** et un **rail de leaders**. Les leaders sont **Calendrier, News, Contacts, Moniteur et Projets**. Le rail des leaders est placé à droite ou à gauche selon le contexte droitier/gaucher déjà géré par atome ; le template doit réutiliser ce contexte plutôt que créer un réglage parallèle.

Certains éléments du Dashboard restent fixes dans leur rail : **Date/Heure** pour Calendrier, **Météo** pour News et le **propriétaire du compte** en tête des Contacts. Les autres éléments sont alimentés dynamiquement par leurs sources réelles et peuvent défiler horizontalement : événements du calendrier, News/messages, contacts récents, monitorings en cours et projets récents.

L’activation d’un leader affiche la collection complète correspondante dans la zone centrale définie par le template. Chaque leader dispose également d’une action **Nouveau**, reliée à la capacité existante de création du type concerné : événement, News/publication, contact, monitoring ou projet. Ces comportements sont configurés avec Interaction ; le template définit la structure et la présentation, tandis que les outils et atomes existants fournissent les capacités réelles.

Ce Dashboard reste une instance liée du template système et reçoit automatiquement les évolutions structurelles imposées par atome, selon les règles de conservation des données déjà définies pour les instances liées. La spécification détaillée de ses rails, sources, interactions et tests de validation est documentée dans `interactivity.md`.

## Exigences fonctionnelles
- Choisir un template au moment de la création d’un projet.
- Prévisualiser rapidement le résultat avant application.
- Dupliquer et modifier un template existant.
- Créer un nouveau template à partir d’un projet existant, y compris lorsqu’il a été construit à partir de contenus ou de structures déjà présents.
- Enregistrer un projet comme template personnel.
- Prévoir des templates système fournis par atome.
- Enregistrer automatiquement comme mode de travail par défaut le mode actif au moment de la fermeture du projet.
- Restaurer ce mode lors de la prochaine ouverture du projet.
- Conserver ce mode par défaut lors du partage d’un projet ou d’un template.
- Ne créer aucun réglage supplémentaire pour définir ce mode : un changement de mode suivi de la fermeture du projet suffit à définir le nouveau défaut.
- Permettre d’associer des templates système aux niveaux de maîtrise existants afin de préparer automatiquement des expériences adaptées.
- Prévoir un projet d’accueil/Dashboard fondé sur un template système et utilisant le même modèle de projet atome.
- Propager automatiquement et sans option de refus les mises à jour du template système Dashboard aux projets d’accueil déjà existants, tout en conservant les données utilisateur selon les règles générales des instances liées.
- Permettre l’évolution progressive de la bibliothèque sans casser les projets déjà créés ou instanciés depuis un template.
- Conserver le caractère modulaire d’atome : un template doit pouvoir composer plusieurs atomes/molécules et leurs comportements sans imposer une structure figée.
- Prévoir la compatibilité avec le système de plugins/MCP afin que des plugins ou agents puissent proposer, créer ou appliquer des templates.

## À définir ensuite
- Mécanisme de stockage et métadonnées propres aux projets de type template, sans créer un format de projet parallèle.
- Représentation technique du mode de travail par défaut dans le modèle de projet existant et persistance du mode actif lors de la fermeture.
- Règles de sélection automatique des templates système selon le niveau de maîtrise.
- Règles exactes de sélection ou de remplacement du template système Dashboard lorsque le niveau de maîtrise change ; la propagation des mises à jour du template système lui-même est déjà définie comme automatique et obligatoire.
- Héritage et variantes de templates.
- Paramètres modifiables avant instanciation.
- Templates locaux, partagés et éventuellement distants.
- Versionnement et compatibilité ascendante.
- UX de sélection, recherche et organisation des templates.
