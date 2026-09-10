# Atome / eVe — Guide utilisateur : imaginer, créer, tester et partager une application

**Version :** 1.1 — guide du fonctionnement proposé, vérification des performances ajoutée  
**Date :** 9 septembre 2026  
**Public :** personnes qui décrivent un besoin, auteurs d’applications, testeurs et développeurs de plugins  
**Documents associés :** [WORK_METHOD.md](WORK_METHOD.md) · [PLUGIN_SPEC.md](PLUGIN_SPEC.md)

> Ce guide couvre le parcours utilisateur complet : scénarios, évolution du framework, applications, plugins et tests à distance. Il accompagne un système en conception. Il ne signifie pas que le chargeur de plugins, les écrans d’installation ou la plateforme de prévisualisation existent déjà.
>
> Les parcours d’installation et les exemples ci-dessous décrivent le comportement à obtenir. Aucun bouton, commande de terminal ou SDK fictif n’est présenté comme actuellement disponible. Les fonctionnalités réellement accessibles devront être identifiées par les tests du moteur et son état documentaire.

## Sommaire

1. [Ce que cette méthode change](#1-ce-que-cette-méthode-change)
2. [Application, classe, instance et plugin](#2-application-classe-instance-et-plugin)
3. [Choisir le bon parcours](#3-choisir-le-bon-parcours)
4. [Décrire une demande](#4-décrire-une-demande)
5. [Écrire des scénarios](#5-écrire-des-scénarios)
6. [Exemple complet : un carnet de répétition](#6-exemple-complet--un-carnet-de-répétition)
7. [Lire le plan proposé par l’IA](#7-lire-le-plan-proposé-par-lia)
8. [Comprendre les vérifications et la validation](#8-comprendre-les-vérifications-et-la-validation)
9. [Tester à distance](#9-tester-à-distance)
10. [Travailler à plusieurs](#10-travailler-à-plusieurs)
11. [Créer un plugin avec une IA ou à la main](#11-créer-un-plugin-avec-une-ia-ou-à-la-main)
12. [Utiliser une API, un module ou MCP](#12-utiliser-une-api-un-module-ou-mcp)
13. [Installer, mettre à jour et retirer un plugin](#13-installer-mettre-à-jour-et-retirer-un-plugin)
14. [Comprendre les autorisations](#14-comprendre-les-autorisations)
15. [Apprendre avec l’aide, les tutoriels et les vidéos](#15-apprendre-avec-laide-les-tutoriels-et-les-vidéos)
16. [Signaler un problème et valider une livraison](#16-signaler-un-problème-et-valider-une-livraison)
17. [Retrouver les documents et reprendre le travail](#17-retrouver-les-documents-et-reprendre-le-travail)
18. [Demandes prêtes à adapter](#18-demandes-prêtes-à-adapter)
19. [Ce qui reste à construire](#19-ce-qui-reste-à-construire)
20. [Sources et statut des informations](#20-sources-et-statut-des-informations)

## 1. Ce que cette méthode change

Tu pars d’un usage, pas d’un problème de programmation. Tu expliques ce que tu veux obtenir ; l’IA aide à préciser le comportement, vérifie ce que le moteur sait déjà faire, puis prépare un plan. Une même description alimente ensuite le développement, les tests et l’aide.

Tu peux participer de trois façons, sans changer de méthode : décrire le besoin et laisser l’IA coder ; écrire toi-même le code ; ou partager les tâches entre humains et IA. La provenance du code ne change pas les exigences de test, de sécurité ou de cohérence avec eVe.

Le parcours commun est :

```text
Décrire → préciser les scénarios → examiner le plan → réaliser
        → tester → obtenir la validation IA → donner ta validation finale
```

Une prévisualisation expérimentale peut être proposée pendant la réalisation, avant la fin de tous les tests. Elle sert à essayer, pas à déclarer le travail terminé. Le circuit de publication stable reste distinct.

Tu n’as pas à recopier les règles du framework dans chaque demande. Elles sont chargées depuis leur point d’entrée global. Ton document décrit seulement ton besoin et les scénarios propres au changement.

## 2. Application, classe, instance et plugin

### Une application : un ensemble cohérent pour un usage

Une application peut être un carnet de répétition, un journal, un organiseur de concert ou un outil de préparation vidéo. Elle utilise les données, les outils et les fonctions du moteur eVe au lieu de reconstruire son propre environnement.

### Une classe d’application : la définition réutilisable

Dans ces documents, « classe d’application » désigne le modèle réutilisable : ce que l’application fait, ses données, ses actions et ses comportements. Ce terme n’impose pas d’écrire une classe JavaScript ni d’apprendre l’héritage orienté objet.

Exemple : la classe **Carnet de répétition** définit la possibilité de préparer des morceaux, noter des indications et retrouver le travail d’une séance. Cette définition est commune aux personnes qui utilisent l’application.

### Une instance : ton utilisation et tes données

**Répétition du groupe A** et **Préparation de mon concert solo** peuvent utiliser la même classe d’application tout en ayant des morceaux, des notes et des droits différents. Ce sont deux instances, contextualisées dans leurs projets.

Réutiliser une classe ne signifie pas partager automatiquement les données. Partager un projet ne signifie pas non plus autoriser automatiquement l’installation de son code chez un autre utilisateur.

### Un plugin : le paquet que l’on peut installer

Le plugin est le mode de distribution. Il peut apporter une application complète, un outil, un connecteur vers un service ou une automatisation. Son code peut vivre dans son propre dépôt, indépendamment du dépôt du moteur.

| Exemple | Rôle |
| --- | --- |
| Carnet de répétition | Application : l’usage proposé. |
| Sa définition réutilisable | Classe d’application : les comportements communs. |
| Carnet du groupe A | Instance : un contexte et ses données. |
| Paquet « Carnet de répétition », version 1.2 | Plugin : ce qui est distribué et installé. |
| Fonction qui trie les morceaux | Module : une partie du code du plugin. |

Le modèle Atome possède déjà les catégories conceptuelles `application` et `pack`. Cela ne prouve pas qu’un paquet tiers peut aujourd’hui être installé : le mécanisme d’exécution doit encore être réalisé et qualifié. [G1, G2]

## 3. Choisir le bon parcours

L’IA propose le parcours après avoir examiné le besoin et l’existant.

| Situation | Parcours recommandé |
| --- | --- |
| Le moteur possède déjà la fonction | La configurer, l’utiliser ou mieux l’exposer, sans la recréer. |
| Plusieurs fonctions existantes suffisent ensemble | Composer une application, éventuellement distribuée en plugin. |
| Une logique propre à ton application manque, mais les API nécessaires existent | Écrire un plugin JavaScript, à la main ou avec l’IA. |
| Un service en ligne possède la capacité recherchée | Étudier un connecteur autorisé, ses données, son coût et ses limites. |
| Il manque une capacité fondamentale du moteur ou une API sûre | Préparer une évolution du framework avant de l’utiliser dans le plugin. |

Un plugin ne sert pas à contourner les règles du moteur. Il ne peut pas inventer un accès natif absent, remplacer le rendu eVe par sa propre interface ou obtenir les données d’un autre projet sans autorisation.

Tu ne dois pas décider seul de ces détails techniques. Le plan explique le choix recommandé et te demande seulement les arbitrages qui influencent ton usage, tes données ou le périmètre.

## 4. Décrire une demande

Une demande utile dit **qui fait quoi, dans quelle situation et avec quel résultat**. Une capture, un dessin ou une référence peut aider, sans remplacer la description du comportement.

```markdown
# Ma demande

Nom :
À qui cela sert :
Ce que je veux pouvoir faire :
Pourquoi cela m’est utile :
Situation de départ :
Résultat attendu :
Ce que je ne veux pas :
Plateformes et appareils concernés :
Données ou services utilisés :
Travail individuel ou partagé :
Exemple concret :
```

Les rubriques peuvent rester courtes. Une réponse « à déterminer avec l’IA » vaut mieux qu’une décision inventée. Les identifiants de test peuvent être utiles ; les mots de passe, clés d’API et données personnelles inutiles ne doivent pas apparaître dans la demande.

Pour un bug, conserve la même structure et ajoute ce qui s’est passé, ce qui aurait dû se passer et les étapes permettant de le reproduire. Le niveau de rigueur ne diminue pas parce qu’il s’agit d’une correction.

L’IA doit d’abord chercher dans le projet et les décisions déjà prises. Elle ne te pose pas une série de questions techniques auxquelles elle peut répondre par inspection.

## 5. Écrire des scénarios

### Un scénario décrit une action observable

« Le bouton fonctionne » est trop vague. « Après avoir ajouté un morceau à la répétition, il apparaît une seule fois dans le bon carnet et reste présent après réouverture » est vérifiable.

Un scénario n’a pas besoin de contenir du code. Il doit permettre à un humain ou à un système de test de suivre les mêmes étapes et de comparer le résultat.

```markdown
## SC-01 — Nom court

Personne et droits :
Appareil ou environnement :
Données de départ :

Actions :
1. ...
2. ...
3. ...

Résultat visible attendu :
Données qui doivent avoir changé :
Ce qui doit rester inchangé :
Cas d’erreur, refus ou annulation :
Preuve permettant de valider :
```

Pour une fonction sans interface visible, le résultat peut être une donnée, une réponse d’API ou un événement attendu. Le scénario reste obligatoire.

### Le bon nombre de scénarios

Il ne faut ni un scénario superficiel pour tout couvrir, ni cent variantes arbitraires. Le plan propose ceux qui prouvent le comportement demandé et ses risques réels : usage normal, erreur ou annulation pertinente, droits, persistance et collaboration lorsqu’elles sont concernées.

La plateforme est importante. « Cela marche dans Safari » ne signifie pas « cela marche dans l’application native iOS ». Un essai sur ordinateur ne prouve pas non plus le confort tactile sur téléphone.

### UI et UX : deux questions différentes

L’**UI** concerne ce qui est affiché et manipulable : texte lisible, contrôle visible, état correct, absence de chevauchement, réaction au toucher.

L’**UX** concerne le parcours : comprendre l’action, obtenir un retour clair, retrouver le résultat, ne pas perdre le contexte, pouvoir corriger une erreur sans confusion.

L’IA transforme ces attentes en critères concrets. Par exemple : « Après l’ajout, le carnet reste ouvert, la sélection reste sur le morceau ajouté et aucune nouvelle palette non demandée n’encombre l’écran. » Une appréciation subjective comme « zen » peut guider la conception, mais doit être accompagnée de comportements ou de références observables.

## 6. Exemple complet : un carnet de répétition

Cet exemple est pédagogique. Il n’affirme pas qu’un plugin de ce nom ou ses commandes existe déjà.

### Besoin

> Je veux préparer mes répétitions dans eVe. Dans un projet, je veux retrouver mes morceaux, leur ordre et mes notes. Je veux pouvoir utiliser la même application pour plusieurs groupes sans mélanger leurs données, puis partager un carnet avec les membres concernés. Je veux garder les présentations et les outils déjà disponibles dans eVe.

### Limites de la première version

Pas de nouveau moteur audio, pas de réseau social, pas de messagerie supplémentaire. Un enregistrement éventuel utilise les capacités existantes, après vérification de leur disponibilité. Le plugin ne construit pas un nouvel éditeur de texte ou un nouveau gestionnaire de listes.

### SC-01 — Préparer une répétition

**Départ :** l’utilisateur a le droit de modifier le carnet du groupe A ; celui-ci est vide.

**Actions :** ouvrir le carnet, ajouter trois morceaux, changer leur ordre, fermer puis rouvrir.

**Attendu :** chaque morceau apparaît une seule fois ; l’ordre est conservé ; les notes et la sélection restent cohérentes. Le projet du groupe B n’a pas changé.

**Preuves :** interaction réelle, capture de l’état final et vérification des données persistées. Un simple journal « ajout réussi » ne suffit pas à prouver l’affichage.

### SC-02 — Corriger une note sans perdre le contexte

**Départ :** le deuxième morceau contient une note.

**Actions :** modifier cette note avec l’éditeur existant ; annuler la modification avant sa confirmation lorsque ce parcours est prévu.

**Attendu :** le texte précédent est conservé, le carnet reste ouvert, le même morceau reste accessible et aucun doublon d’éditeur n’apparaît. Si la fonction utilise au contraire un enregistrement immédiat, le scénario décrit explicitement son mécanisme d’annulation au lieu d’inventer une confirmation.

### SC-03 — Ouvrir avec des droits de lecture

**Départ :** un autre membre possède uniquement un accès en lecture.

**Actions :** consulter le carnet et tenter une modification par le parcours disponible.

**Attendu :** la consultation fonctionne ; l’écriture n’est pas autorisée ; l’utilisateur comprend la limite ; aucune modification cachée n’est enregistrée.

### SC-04 — Travailler à deux

**Départ :** deux membres autorisés ouvrent le même carnet sur deux appareils.

**Actions :** chacun modifie la note d’un morceau différent, puis observe le résultat partagé.

**Attendu :** les deux changements sont conservés et attribuables. Une seconde variante porte sur la même note : le comportement attendu doit être défini, pas résumé par « le dernier gagne » au risque de perdre un travail.

Le conflit de données dans l’application et le conflit de code entre deux branches GitHub sont deux problèmes différents. L’IA les traite avec les mécanismes propres à chacun.

### SC-05 — Vérifier une mise à jour du plugin

**Départ :** le carnet contient des données ; une nouvelle version ajoute un affichage de durée déjà permis par le moteur.

**Actions :** installer la version de test dans l’environnement prévu, l’activer puis rouvrir les deux carnets.

**Attendu :** données et droits conservés, aucune duplication, autres projets inchangés. Si la migration n’est pas sûre, l’activation doit échouer proprement plutôt que risquer les données.

Ces scénarios servent ensuite au plan, aux vérifications locales et aux exemples de l’aide. Les tests techniques complémentaires sont préparés par l’IA, pas rédigés à la main par chaque utilisateur.

## 7. Lire le plan proposé par l’IA

Le plan doit te permettre de comprendre ce qui sera fait avant la réalisation. Il indique le besoin retenu, ce qui existe déjà, ce qui sera réutilisé, les changements nécessaires, les scénarios et le livrable de test.

La partie vérification présente un choix recommandé parmi **simple, intermédiaire et avancé**, accompagné d’une raison. Tu décides sur ce plan concret. Il n’est pas nécessaire d’établir à l’avance une règle pour toutes les situations possibles.

Ces trois niveaux ne correspondent pas à « aucun test », « quelques tests » et « tous les tests ». Le socle global applicable et les scénarios locaux restent obligatoires, **y compris les benchmarks de performance**. Le niveau organise la profondeur des vérifications supplémentaires selon l’impact.

Le plan présente aussi la vitesse attendue, les appareils et la charge de test, la mesure avant/après et le plafond recommandé. Tu juges cette proposition concrète ; tu n’as pas à inventer le protocole de mesure ni à répéter cette exigence à chaque demande.

Avant d’approuver le plan, vérifie surtout ces trois points : le comportement correspond-il à ce que tu demandes ; le périmètre n’a-t-il pas grossi sans raison ; peux-tu comprendre comment tu essaieras le résultat et ce qui prouvera qu’il fonctionne ?

Un manque de capacité du moteur, une nouvelle permission sensible ou un nouvel outil doit être signalé avant sa création. L’IA ne doit pas te demander d’autoriser après coup une architecture qu’elle a déjà inventée.

## 8. Comprendre les vérifications et la validation

### Validation IA

L’IA exécute les contrôles communs obligatoires, puis les scénarios propres au changement et les vérifications du plan retenu. Elle fournit un rapport relié à une version précise du livrable.

Un résultat doit être identifié comme réussi, échoué, bloqué, non exécuté ou réellement non applicable. Un appareil inaccessible n’est pas un appareil validé. Une capture seule ne prouve pas une interaction ; un test interne seul ne prouve pas que le résultat est visible.

### Vérifier aussi la vitesse, pas seulement le fonctionnement

Une fonction qui s’ouvre lentement, bloque les gestes ou consomme des ressources après sa fermeture n’est pas terminée parce que ses boutons fonctionnent. Pour toute nouvelle fonctionnalité et tout plugin, l’IA doit produire des mesures comparables avant/après et vérifier les seuils décidés dans le plan. La même règle s’applique aux corrections de bugs.

Le [catalogue PERF-1](WORK_METHOD.md#performance-contract) est la référence unique des chiffres recommandés. Il distingue le retour visuel immédiat, le panneau ou projet réellement utilisable, et la fin du chargement. Les conditions de première ouverture et de réouverture ne sont pas confondues. Un spinner rapide ne prouve pas que la fonction est rapide.

**Exemple pédagogique :** si le plafond retenu pour une réouverture de panneau est 200 ms, l’IA doit mesurer le délai entre ton geste et le panneau visible et utilisable. Une petite animation à 60 ms suivie de 900 ms d’attente ne remplit pas ce critère. Cet exemple explique le protocole ; ce n’est pas un résultat mesuré sur eVe.

Dans le rapport, **P50** décrit la médiane et **P95** une limite sous laquelle passent au moins 95 % des observations de la campagne. Le maximum et les échecs doivent rester visibles. Un seul bon essai ou une moyenne mélangeant ordinateur rapide et téléphone lent ne suffisent pas. L’IA indique aussi le nombre d’essais et les limites de ses mesures.

Tu dois pouvoir lire une fiche du type : « version exacte, appareil, scénario, première ouverture ou réouverture, seuil convenu, avant, après, résultat ». Les chiffres manquants sont marqués non mesurés, pas remplacés par « fluide ». Un budget dépassé ou un ralentissement confirmé empêche la validation IA ; tu peux néanmoins accéder à une préversion privée explicitement expérimentale.

### Ce que tu peux observer sur ton appareil

Essaie la fonction une première fois puis réouvre-la ; vérifie que tu peux agir dès que son contenu apparaît. Utilise un projet représentatif, avec ses textes ou médias, puis change de panneau, saisis du texte ou déplace un élément pendant le travail. Signale délai, saccade, blocage, chauffe ou coupure audio, sans devoir identifier toi-même la cause.

Un enregistrement vidéo peut aider à localiser le problème. Il ne remplace pas les benchmarks horodatés, et la vidéo d’un appareil piloté à distance peut elle-même ajouter du délai. Note appareil, version, état de connexion et scénario ; l’IA doit instrumenter le chemin réel et comparer sur le même matériel.

Pour un plugin, les essais comparent aussi l’hôte avant installation, le plugin installé mais inactif et le plugin en cours d’usage. Une désactivation doit libérer ses ressources ; le gain de vitesse d’un panneau ne justifie pas automatiquement plus de batterie consommée ou un démarrage général plus lent.

### Validation finale par toi

Tu essaies le candidat présenté, avec la série de tests convenue. Tu peux t’appuyer sur les preuves de l’IA, vérifier les parcours importants et signaler ce qui ne correspond pas à ton attente.

Ta validation finale concerne **ce candidat exact**, pas tous les changements futurs. Si le code, le plugin ou une migration change ensuite, le périmètre concerné doit être revalidé.

Tu n’as pas à reconstruire le projet pour chaque essai lorsque le circuit distant existe. Le livrable doit fournir le lien ou le canal d’installation, son identité et les étapes de test.

## 9. Tester à distance

### Ce que « sans validation avant de tester » signifie ici

La méthode propose un environnement de prévisualisation autorisé à l’avance. Une nouvelle version peut y être rendue disponible automatiquement après les vérifications préliminaires prévues, sans demander une nouvelle autorisation humaine pour chaque mise à disposition.

Il faut distinguer :

| Version | Usage | Statut |
| --- | --- | --- |
| Prévisualisation expérimentale | Essayer pendant le développement. | Peut avoir des tests encore en cours ou des défauts annoncés. |
| Candidat de validation | Effectuer ta réception du travail. | Les vérifications IA obligatoires du périmètre sont passées. |
| Version stable | Utilisation et diffusion selon le circuit retenu. | Acceptée par la personne autorisée à valider. |

Cela ne supprime ni le contrôle d’accès, ni les permissions système, ni les règles d’installation des plateformes. Une fonction qui envoie des messages réels ou modifie des données de production ne doit pas s’exécuter librement parce qu’elle est en test.

### Sur ton propre appareil

Le parcours cible fournit une fiche de test : nom du changement, version, plateformes prévues, lien d’accès ou instructions d’installation, scénarios et moyen de retour. Un QR code éventuel ouvre cette fiche ou un lien autorisé ; il ne remplace pas l’authentification.

Tu utilises un compte et un projet de test, puis suis les scénarios. Le retour mentionne le modèle de l’appareil, le système, le navigateur ou l’application native, ainsi que la version réellement testée.

### Sur des appareils de test distants

Une IA peut exécuter des interactions sur un appareil de laboratoire si celui-ci est connecté à une infrastructure de contrôle autorisée. Elle doit recevoir les résultats, les images et les journaux nécessaires.

L’installation sur ton téléphone personnel ne donne pas automatiquement à l’IA le contrôle de son écran. En l’absence d’un tel accès, tu réalises les gestes et l’IA analyse les preuves transmises. Ces deux formes de test doivent rester clairement identifiées.

### Par plateforme

| Cible | Comment préparer l’essai |
| --- | --- |
| Web | Un lien de prévisualisation isolée, avec le navigateur et les capacités requises. |
| Téléphone en navigateur | Même principe, avec de vrais scénarios tactiles ; ce n’est pas une validation de l’application native. |
| iOS natif | Un canal de distribution compatible avec ton statut de testeur et ton appareil. TestFlight interne ou ad hoc ne suppriment pas leurs prérequis. |
| Android natif | Un paquet signé ou un canal de test adapté, une fois la cible Android du moteur auditée et disponible. |
| Desktop natif | Un livrable du runtime concerné ; la signature, les permissions et les restrictions système restent applicables. |
| Plugin | Un paquet de test compatible avec la version du moteur installée, sans reconstruire celui-ci lorsque ses capacités suffisent. |

La matrice technique détaillée et les sources de distribution sont dans [la méthode, section 8](WORK_METHOD.md#8-livrables-distants-déploiement-et-tests-multiplateformes). La disponibilité Android native n’est pas établie par l’audit réalisé pour ces documents. La première invitation externe TestFlight peut nécessiter une revue Apple : « tester à distance » ne veut donc pas dire « installer immédiatement chez n’importe qui ». [G4, G5]

## 10. Travailler à plusieurs

### Sur le code et les spécifications

Chaque changement doit conserver son besoin, son plan, sa version de départ et son résultat. Un auteur peut travailler dans un dépôt de plugin indépendant ; les contributeurs du moteur travaillent selon le circuit GitHub autorisé.

L’IA prépare l’intégration technique des changements compatibles. Tu n’as pas à ouvrir des marqueurs de conflit Git ou à choisir des lignes de code. En revanche, si deux demandes donnent des comportements incompatibles, l’IA présente le conflit en langage d’usage.

Exemple : une personne demande une liste toujours triée automatiquement ; une autre demande un ordre manuel conservé. Ce n’est pas un problème que l’on résout en gardant le fichier le plus récent. L’IA explique les options et la conséquence ; la personne responsable du produit décide.

La combinaison finale doit être testée. Deux modifications validées séparément peuvent ne plus l’être une fois réunies. Le système doit rattacher les preuves au résultat intégré, avec les bonnes versions d’Atome, d’eVe et des plugins.

La politique Codex actuellement lue interdit les écritures Git. Le circuit automatique d’intégration reste donc une évolution à autoriser explicitement, pas une capacité activée par ce guide. [G3]

### Sur les données de l’application

Les droits de chaque membre, le partage des objets et les conflits de modification suivent les mécanismes du moteur. Installer le même plugin ne donne pas accès aux données de tous ses utilisateurs.

Les scénarios de collaboration doivent utiliser au moins deux identités lorsque le comportement dépend des droits. Deux fenêtres connectées au même compte ne prouvent pas que la séparation des utilisateurs fonctionne.

Les sessions de test doivent aussi être isolées. Deux campagnes ne doivent pas modifier le même jeu de données ou se disputer le même appareil sans coordination.

## 11. Créer un plugin avec une IA ou à la main

### Avec une IA

Tu fournis le besoin et les scénarios. L’IA lit les règles du moteur et la spécification de plugins, inspecte les API disponibles, puis propose un plan. Si l’application peut être réalisée par composition, elle évite du code inutile. Si une logique spécifique est nécessaire, elle prépare un script JavaScript dans le paquet.

Avant de coder contre une nouvelle fonction, elle doit distinguer **API existante vérifiée** et **API proposée mais à construire**. Elle n’invente pas une méthode `eve.plugin.install(...)` puis ne la présente pas comme disponible.

### À la main

Tu suis les mêmes contrats et scénarios. Lorsque le système sera réalisé, le kit auteur devra fournir un paquet minimal réellement exécuté en test, un manifeste validable, les API publiques documentées et des scénarios de conformité réutilisables.

Le code métier se place dans ton projet de plugin. Il demande des actions au moteur, utilise des données autorisées et décrit son interface avec les composants disponibles. Il ne modifie pas directement les fichiers internes d’eVe pour devenir installable.

Tu peux demander à l’IA d’auditer ton script, de compléter les scénarios ou de préparer les tests sans lui confier la totalité du développement. Le paquet produit à la main doit passer les mêmes contrôles qu’un paquet généré.

### Un repère pour l’organisation du paquet

Voici des rôles de fichiers, **pas une arborescence déjà imposée par un chargeur existant** :

```text
Mon application
  description et scénarios
  manifeste du paquet
  code JavaScript éventuel
  contributions déclaratives et traductions
  ressources autorisées
  tests et exemples
  documentation d’usage
```

Le manifeste décrit ce que le paquet apporte, sa version, sa compatibilité et les droits qu’il demande. Son format final proviendra du contrat testé du moteur. Les exemples de [PLUGIN_SPEC.md](PLUGIN_SPEC.md) restent des propositions tant que ce contrat n’est pas implémenté.

### Ce qui reste à la charge du moteur

Affichage, édition de texte, listes, stockage partagé, historique, autorisations et interactions générales ne doivent pas être reconstruits par chaque auteur. Le plugin doit consommer leurs propriétaires existants.

Une logique JavaScript de contrôle n’est pas un nouveau moteur DSP. Un effet audio temps réel, une nouvelle primitive graphique ou une capacité native demande une étude séparée si le moteur ne l’expose pas déjà.

## 12. Utiliser une API, un module ou MCP

Ces trois points d’entrée peuvent aider à créer une application, mais ils ne signifient pas la même chose.

| Tu fournis… | Ce que l’IA doit examiner |
| --- | --- |
| Le cahier des charges d’une fonction | Comment la réaliser avec les capacités existantes et quels scénarios en prouvent l’usage. |
| Une documentation d’API en ligne | Les opérations, les données envoyées, les identifiants, les limites, le coût et les conditions du service. |
| Une bibliothèque ou un module de code | Sa licence, sa version, ses dépendances, ses permissions, sa sécurité et sa compatibilité avec le moteur. |
| Un serveur MCP | Les outils réellement exposés, leurs droits et leur intégration à la passerelle IA autorisée. |

**MCP est un langage d’échange avec les outils d’IA, pas un format magique d’installation.** Il ne rend pas un module compatible avec eVe et ne le dispense pas d’autorisation. Une même fonction doit garder les mêmes limites qu’elle soit appelée par ton interface ou par une IA. [G6]

Exemple : un service d’analyse sonore peut recevoir un fichier et retourner des informations. Avant d’en faire une fonction du carnet, il faut décider si le fichier peut quitter la machine, avec quel compte, pour quel coût et ce qui se passe lorsque le service ne répond pas. L’IA doit chercher si un connecteur existant sait déjà prendre en charge ce service.

Une réponse de service, un texte récupéré sur le Web ou une description d’outil reste une donnée. Ce contenu ne doit pas pouvoir ordonner à l’IA de désactiver les contrôles ou d’envoyer tes secrets ailleurs.

## 13. Installer, mettre à jour et retirer un plugin

Les étapes suivantes constituent le comportement utilisateur demandé au futur système.

### Installer

Avant l’activation, tu dois pouvoir identifier l’auteur, la version, les capacités offertes, les droits demandés, les environnements compatibles et l’origine du paquet. Un paquet corrompu ou incompatible doit être refusé avec une explication utilisable.

Dans un environnement de test préautorisé, un paquet peut être mis à disposition automatiquement. L’activation de nouveaux droits ou l’accès à des données sensibles ne doivent pas devenir implicites pour autant.

### Activer et utiliser

L’application apparaît dans les surfaces prévues par le moteur, sans reconstruire le menu principal ni remplir le bureau d’outils supplémentaires. Une contribution doit avoir une raison d’être et s’intégrer aux règles graphiques existantes.

Les données de chaque instance restent rattachées à leur contexte. L’activation ne doit pas lancer des tâches réseau ou des traitements lourds non demandés au démarrage d’eVe.

### Mettre à jour à chaud

« À chaud » signifie activer une version compatible dans un eVe déjà ouvert, sans imposer le redémarrage complet du moteur lorsqu’il n’est pas nécessaire. Cela ne veut pas dire remplacer du code pendant n’importe quelle opération.

Si une capture, une écriture ou une migration est en cours, l’hôte doit atteindre un état sûr. La mise à jour doit conserver les données, les droits et les projets non concernés, ou refuser proprement l’activation.

Une nouvelle capacité native ou un changement de moteur peut encore nécessiter une nouvelle application hôte. Le plugin n’est pas une solution pour contourner les règles des plateformes.

### Désactiver ou retirer

Désactiver arrête le comportement du plugin et retire ses contributions actives. Désinstaller retire le paquet de l’environnement concerné.

**Retirer le code ne doit pas effacer automatiquement tes créations.** Le système doit préserver les données et expliquer leur état : encore consultables, exportables ou temporairement non interprétables sans le plugin. Toute suppression de données constitue une décision distincte.

Revenir à une version de code précédente n’annule pas automatiquement un message déjà envoyé ou une migration irréversible. Le plan doit préciser le retour possible avant de modifier les données.

## 14. Comprendre les autorisations

Une permission doit correspondre à une action et à un périmètre compréhensibles : lire les éléments du projet choisi, modifier ses notes, utiliser le microphone, contacter un service déterminé.

« Accès complet pour que tout fonctionne » n’est pas une explication suffisante. L’auteur ne peut pas se donner lui-même des droits en déclarant sa fonction peu risquée.

Le système proposé doit permettre de voir les permissions et de les révoquer. Une révocation doit être prise en compte lors des appels suivants, même si le plugin était déjà ouvert. Les actions réellement commencées sur un service externe doivent être suivies et expliquées : on ne peut pas prétendre retirer un effet déjà effectué.

Les clés de service doivent être configurées dans le mécanisme sécurisé de l’hôte, pas collées dans le code, le manifeste ou le prompt public. Le plugin utilise une opération autorisée sans recevoir une copie du secret.

Une signature permet de vérifier l’origine et l’intégrité d’un paquet selon la chaîne de confiance retenue. Elle ne signifie pas que tout son comportement est sans risque. Le test et le contrôle des droits restent nécessaires.

## 15. Apprendre avec l’aide, les tutoriels et les vidéos

Les scénarios validés doivent servir à produire une aide cohérente. L’objectif est d’éviter qu’un tutoriel décrive une ancienne interface ou une fonction que le paquet n’offre pas réellement.

Le système d’aide envisagé propose trois formes :

| Support | Ce qu’il doit montrer |
| --- | --- |
| Explication | À quoi sert la fonction, les conditions de départ, les actions et le résultat. |
| Tutoriel exécuté | Le parcours réel, dans un environnement sûr, avec possibilité de suivre ou d’interrompre. |
| Vidéo | Une capture d’un parcours identifié et validé, correspondant à une version connue. |

Un tutoriel ne doit pas envoyer un vrai message, supprimer un vrai fichier ou modifier ton projet silencieusement pour faire une démonstration. Il utilise un contexte de démonstration ou demande l’autorisation adéquate avant un effet réel.

Le plugin fournit les descriptions et les scénarios propres à son application. Le moteur prend en charge la présentation commune de l’aide. Il n’est pas nécessaire que chaque plugin installe son propre système de tutoriels.

Si la vidéo ou le tutoriel n’est pas encore généré ou validé, l’aide doit le dire, pas proposer un bouton menant à une promesse vide. L’outil d’aide intégré fait lui-même partie des capacités à auditer et à construire.

## 16. Signaler un problème et valider une livraison

### Retour de test

Un retour court mais précis permet à l’IA de reproduire le problème :

```markdown
# Retour de test

Changement et candidat testé :
Appareil / système :
Navigateur ou application native :
Scénario :
Données de test concernées :
Actions effectuées :
Résultat attendu :
Résultat observé :
Pour une lenteur : première ouverture/réouverture, charge du projet, délai ressenti ou preuve horodatée, réseau :
Fréquence : toujours / parfois / une fois
Capture ou enregistrement utile :
Autres participants ou versions impliqués :
```

Précise aussi si un autre utilisateur travaillait sur les mêmes données. Une image est utile pour l’UI ; une courte vidéo ou les étapes exactes sont souvent nécessaires pour comprendre une interaction. Masque les données personnelles qui n’aident pas au diagnostic.

Ne transforme pas immédiatement un symptôme en solution technique. « Le morceau disparaît après réouverture » aide davantage que « ajoute une sauvegarde locale supplémentaire », qui pourrait dupliquer le stockage existant.

### Validation finale

```markdown
# Validation finale

Spécification :
Candidat / version exacte :
Scénarios de réception effectués :
Appareils utilisés :
Rapport de performances du candidat consulté / écarts ressentis :
Résultat : accepté / à corriger
Écarts observés :
Décision et date :
```

Un résultat « accepté » ne doit pas masquer un test obligatoire bloqué. L’écart doit d’abord être résolu ou faire l’objet d’un arbitrage explicite du périmètre, compatible avec les règles globales. Une cible non testée ne devient pas validée par simple déclaration.

L’IA effectue ensuite le travail technique associé à la correction ou à la préparation de la livraison, dans les limites du circuit autorisé. L’accès à un aperçu ne vaut pas ordre de publier en production.

## 17. Retrouver les documents et reprendre le travail

Trois documents couvrent cette méthode :

| Document | Quand le lire |
| --- | --- |
| `USER_GUIDE.md` | Pour décrire une demande, comprendre applications/plugins et essayer une livraison. |
| `WORK_METHOD.md` | Pour organiser les étapes, les rôles, les livrables, les validations et le travail à plusieurs. |
| `PLUGIN_SPEC.md` | Pour concevoir le système d’extensions et écrire du code contre son futur contrat publié. |

Les règles transverses restent dans `.codex/AGENTS.md` et ses modules. Les anciens fichiers de recommandations servent à préparer leur évolution ; ils ne doivent pas devenir un quatrième ensemble de règles concurrent.

Chaque changement possède sa spécification locale, ses décisions, son plan et ses preuves. Pour reprendre une conversation, fournir ces références est plus fiable que demander à l’IA de reconstituer le projet de mémoire.

Lors de l’installation des documents dans le dépôt, leurs liens doivent être adaptés à leur emplacement définitif. Il ne faut pas recopier le guide complet dans chaque paquet : le paquet peut référencer le guide commun et fournir uniquement son mode d’emploi spécifique.

## 18. Demandes prêtes à adapter

### Décrire une nouvelle application sans décider de son architecture

```text
Je veux créer [application] pour [utilisateurs].
Le résultat recherché est [résultat].
Voici un usage concret : [situation, actions et résultat].
Les plateformes nécessaires sont [plateformes].
Les données sont [privées/partagées, nature des données].
Je ne veux pas [limites].

Lis les règles et les capacités existantes avant de proposer du code.
Propose le parcours le plus simple : configuration, composition,
plugin ou évolution nécessaire du moteur.
Aide-moi à préciser les scénarios et présente un plan avec ton
niveau de vérification recommandé. Pose seulement les questions
qui demandent mon arbitrage, une par une.
```

### Faire examiner une API ou un module trouvé en ligne

```text
Voici la source à examiner : [lien ou référence précise].
Je veux l’utiliser pour [usage], dans [application/scénario].

Vérifie ce que le moteur propose déjà, la licence ou les conditions,
les données qui sortiraient de mon environnement, les permissions,
les coûts, les dépendances et les plateformes compatibles.
Distingue ce qui est disponible de ce qu’il faudrait développer.
Ne l’installe pas et n’envoie aucune donnée réelle avant le plan retenu.
```

### Développer un plugin à la main avec assistance

```text
Je vais écrire moi-même [partie du plugin].
La spécification et les scénarios sont [références].
La version du moteur ciblée est [référence].

Vérifie les API publiques réellement disponibles.
Indique les responsabilités que je dois réutiliser dans le moteur.
Audite mon code et prépare les scénarios de conformité et de test.
Ne présente aucune API proposée comme déjà implémentée.
```

### Demander une prévisualisation distante

```text
Prépare une version de test de [changement] pour [participants/appareils],
dans le canal de test autorisé [référence, s’il existe].

Indique le candidat exact, les prérequis d’accès, les scénarios,
les tests déjà passés et ceux qui restent à faire.
Aucune publication stable ni utilisation de données de production.
Si l’infrastructure ou la plateforme manque, signale précisément
le prérequis et intègre sa réalisation au plan proposé.
```

Ces modèles ne remplacent pas les règles transverses. Ils permettent simplement de donner à l’IA le contexte utile sans réécrire toute la méthode.

## 19. Ce qui reste à construire

La livraison de ces documents ne crée pas de chargeur de plugins, de SDK auteur ou de service de test distant. Elle décrit leurs attentes, leurs limites et leurs critères d’acceptation.

Le travail suivant devra notamment vérifier les points d’extension existants, choisir et prouver l’isolation de code tiers, publier un contrat de plugin réellement testé et établir les canaux de livraison autorisés. Les capacités de chaque plateforme devront être vérifiées séparément.

Le guide devra évoluer avec les résultats : les procédures proposées deviendront des instructions d’utilisation seulement lorsqu’elles auront été réalisées et validées. Les commandes et captures ajoutées à cette occasion devront venir du produit réel.

La cible est une même expérience de création : partir d’une idée, la préciser, coder ou faire coder, essayer à distance, puis installer et faire évoluer une application indépendante sans reconstruire tout eVe.

## 20. Sources et statut des informations

Les choix de parcours, exemples, écrans à prévoir et règles du futur système sont des propositions de conception issues du dialogue. Les références ci-dessous étayent uniquement les constats sur l’existant et les contraintes externes. Consultation du 9 septembre 2026.

- **[G1] Contrat universel Atome**, catégories conceptuelles et enveloppe : https://github.com/atomecorp/a/blob/17f9af3e6b3fd880977f3a761375278bb689580f/atome/src/shared/atome_universal_contract.js
- **[G2] Brouillon de plugins existant**, annoncé comme conception sans code : https://github.com/atomecorp/a/blob/17f9af3e6b3fd880977f3a761375278bb689580f/todo/eVe_plugin.md
- **[G3] Point d’entrée Codex**, règles modulaires et Git en lecture seule : https://github.com/atomecorp/a/blob/17f9af3e6b3fd880977f3a761375278bb689580f/.codex/AGENTS.md
- **[G4] Apple, testeurs internes TestFlight** : https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/
- **[G5] Apple, testeurs externes et revue** : https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/
- **[G6] MCP, spécification vérifiée** : https://modelcontextprotocol.io/specification/2026-07-28

Pour les détails sur l’ad hoc, Android, les signatures, les environnements distants, les transports MCP et les règles d’exécution des plugins, consulter les sections et références de `WORK_METHOD.md` et `PLUGIN_SPEC.md` plutôt que dupliquer leurs normes ici.


**Mise à jour performances du 9 septembre 2026 :** les budgets proposés, leur justification, le protocole de benchmark et les sources sont dans [WORK_METHOD.md — PERF-1](WORK_METHOD.md#performance-contract). Cette révision ajoute des obligations et des explications ; elle ne prétend pas que les seuils sont déjà atteints ni que des essais matériels ont été réalisés.
