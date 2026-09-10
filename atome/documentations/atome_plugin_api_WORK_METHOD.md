# Atome / eVe — Méthode de travail par fonctionnalités et scénarios

**Version :** 3.0 — ajout des performances et benchmarks obligatoires  
**Date :** 9 septembre 2026  
**Statut :** document de travail à valider ; non installé dans le framework  
**Emplacement cible :** `WORK_METHOD.md`, à la racine du dépôt `atomecorp/a`  
**Documents associés :** [PLUGIN_SPEC.md](PLUGIN_SPEC.md) · [USER_GUIDE.md](USER_GUIDE.md)
**Historique :** conserve la méthode v2 et ajoute le contrat PERF-1 : budgets, mesures avant/après, appareils réels et verrou de validation. Cette révision remplace la méthode v2 du lot précédent.

> Ce document organise le travail entre l’utilisateur, l’IA de dialogue et l’IA de développement. Il ne remplace pas `.codex/AGENTS.md` ni ses modules. Les évolutions transverses sont préparées par les recommandations AGENTS déjà livrées, complétées par la section 13 de cette version.
>
> Cette version de discussion est rédigée en français et reste hors dépôt. Lors de son adoption, la version documentaire destinée au dépôt devra être rédigée en anglais, conformément à la politique de langue existante. Aucune modification GitHub, aucun développement et aucun déploiement ne sont réalisés par la livraison de ce document.

## Sommaire

- [1. Finalité](#1-finalité)
- [2. Répartition des responsabilités documentaires](#2-répartition-des-responsabilités-documentaires)
- [3. Décisions déjà établies dans le dialogue](#3-décisions-déjà-établies-dans-le-dialogue)
- [4. Conduite du dialogue](#4-conduite-du-dialogue)
- [5. Déroulement d’un changement](#5-déroulement-dun-changement)
- [6. Documentation, aide, tutoriel et vidéo](#6-documentation-aide-tutoriel-et-vidéo)
- [7. Travail à plusieurs et intégration intelligente](#7-travail-à-plusieurs-et-intégration-intelligente)
- [8. Livrables distants, déploiement et tests multiplateformes](#8-livrables-distants-déploiement-et-tests-multiplateformes)
- [9. Statuts et progression](#9-statuts-et-progression)
- [10. Adoption progressive recommandée](#10-adoption-progressive-recommandée)
- [11. Modèle de spécification locale](#11-modèle-de-spécification-locale)
- [12. Sources et périmètre de cette rédaction](#12-sources-et-périmètre-de-cette-rédaction)
- [13. Intégration documentaire et évolutions transverses à préparer](#13-intégration-documentaire-et-évolutions-transverses-à-préparer)
- [Contrat PERF-1 — performances et benchmarks obligatoires](#performance-contract)
- [14. Sources complémentaires vérifiées pour cette version](#14-sources-complémentaires-vérifiées-pour-cette-version)

## 1. Finalité

Faire évoluer Atome/eVe à partir de comportements attendus et de scénarios explicites, plutôt qu’à partir d’une demande de code isolée.

Une même spécification sert de point d’entrée pour le plan de développement, les scénarios de validation, la documentation et les supports d’aide. Les tests exécutables et les supports produits restent reliés à cette spécification ; ils ne deviennent pas des descriptions concurrentes du besoin.

Le parcours de travail est le suivant :

```text
Besoin et comportement attendu
  → dialogue fonctionnel
  → audit de l’existant et discussion d’intégration
  → scénarios et spécification
  → plan Codex avec vérifications recommandées
  → décision de l’utilisateur sur le plan
  → réalisation et tests
  → validation IA : globale + locale
  → livrable de validation et preuves
  → validation finale de l’utilisateur
  → livraison selon le circuit autorisé
```

Les décisions sur le besoin ou le plan ne sont pas des validations finales supplémentaires. La réception du travail comporte bien deux temps : validation par l’IA, puis validation finale par l’utilisateur.

## 2. Répartition des responsabilités documentaires

| Support | Responsabilité | Ce qu’il ne doit pas contenir |
| --- | --- | --- |
| `.codex/AGENTS.md` et ses modules actifs | Règles transverses, obligations, garde-fous, catalogue commun de vérifications et conditions de clôture. | Le comportement détaillé de chaque fonctionnalité. |
| `WORK_METHOD.md` | Dialogue, préparation des scénarios, articulation des étapes et passage vers développement et aide. | Une copie des règles techniques ou des procédures de test existantes. |
| Spécification locale d’une fonctionnalité ou d’un bug | Besoin, comportement, périmètre, scénarios, critères d’acceptation et décisions propres à ce changement. | La répétition du socle global de règles et de tests. |
| Plan et rapport associés | Actions proposées, choix de vérification, exécution, résultats et références au livrable. | Une réécriture concurrente du besoin. |
| Documentation et supports d’aide | Explication du comportement réellement livré, issue des scénarios validés. | Des fonctionnalités seulement envisagées ou des résultats non vérifiés. |
| `eVe/documentations/FRAMEWORK_STATE.md` | État factuel du framework et niveau de preuve, selon le protocole déjà existant. | Une seconde liste de tâches ou une roadmap. |

Le point d’entrée global existant est déjà modulaire. Ajouter une règle transverse signifie la rattacher à ce point d’entrée et à son module propriétaire, pas nécessairement grossir le fichier d’entrée lui-même.

Une spécification possède un emplacement canonique unique. Si elle concerne les deux dépôts, elle référence les deux périmètres sans être dupliquée dans chacun. Son emplacement exact se choisit après inspection de l’organisation documentaire existante ; ce document ne crée pas arbitrairement un nouveau dossier de spécifications.

## 3. Décisions déjà établies dans le dialogue

Les choix suivants sont acquis pour la méthode ; leur inscription effective dans les règles globales reste à réaliser :

- Fonctionnalités et corrections de bugs suivent le même protocole, la même structure et le même système de statuts.
- Chaque changement comporte des scénarios locaux à valider. Ils ne sont pas optionnels.
- Les performances sont vérifiées par des benchmarks obligatoires, y compris pour une nouvelle fonction sans UI, un correctif ou un plugin. Le plan fixe les seuils mesurables avant réalisation ; le contrôle comprend les résultats absolus et la non-régression avant/après. Le bloc transverse à intégrer se trouve en [section 13.5](#performance-contract).
- La validation IA comprend le socle global obligatoire et les scénarios locaux de la spécification, puis intervient la validation finale de l’utilisateur.
- Le plan propose un niveau de vérification parmi **simple, intermédiaire, avancé**, indique sa préférence et la justifie. L’utilisateur tranche.
- Un nouveau véritable outil ou une évolution majeure ne se crée pas silencieusement : son besoin et son comportement doivent être discutés après audit de l’existant.
- L’IA prend en charge le travail technique ; les questions adressées à l’utilisateur portent sur les décisions qui nécessitent réellement son arbitrage, une par une.

Les modalités d’automatisation, le nom détaillé des statuts et l’organisation des livrables ci-dessous sont des recommandations opérationnelles. Elles ne valent pas autorisation d’exécuter des opérations actuellement interdites.

## 4. Conduite du dialogue

### 4.1 Partir de l’usage

L’utilisateur décrit ce qu’il veut pouvoir faire, pourquoi et dans quelle situation. L’IA reformule le résultat attendu sans transformer immédiatement la demande en nouvelle architecture ou en nouvel outil.

On distingue le besoin fonctionnel de la solution pressentie. Un besoin peut déjà être couvert par une fonctionnalité existante qu’il suffit d’exposer, de connecter ou de compléter.

Pour un bug, le point de départ contient le comportement observé, le comportement attendu et un contexte de reproduction. La correction n’a pas un circuit moins rigoureux qu’une nouveauté.

### 4.2 Poser seulement les questions nécessaires

L’IA cherche d’abord les réponses dans les décisions déjà prises et dans les sources du projet.

Lorsqu’une question reste nécessaire, elle est posée seule, avec le contexte utile et une recommandation lorsque l’IA en dispose. Les questions portent notamment sur un comportement ambigu, un arbitrage d’usage, un effet destructif, un conflit fonctionnel ou une capacité réellement nouvelle.

L’IA ne demande pas à l’utilisateur de décider à l’avance toutes les combinaisons possibles de niveau de test. Le plan fait une recommandation contextualisée et l’utilisateur choisit.

Les détails d’exécution que l’IA maîtrise sont traités dans le plan, sans transformer le dialogue en questionnaire technique permanent.

## 5. Déroulement d’un changement

### Étape A — Cadrer le besoin

Décrire le résultat recherché, les utilisateurs concernés, les situations d’usage, les limites et les comportements non souhaités.

Pour une interface, préciser ce qui doit se passer quand l’utilisateur entre dans la fonction, agit, annule, revient en arrière ou quitte le contexte. Ne pas dessiner un nouveau langage graphique : référencer le contrat de design existant et décrire uniquement le comportement spécifique.

**Sortie :** une description compréhensible du besoin, avec les éventuelles décisions produit non résolues.

### Étape B — Examiner l’existant et discuter l’intégration

Appliquer l’audit déjà prescrit par les règles globales. Dans le dossier local, ne conserver que ses résultats utiles : propriétaires identifiés, composants et API réutilisables, surfaces touchées, contraintes réelles et références.

Discuter ensuite de la manière dont la fonction s’insère dans le framework. Distinguer extension d’un mécanisme existant, composition de mécanismes et création d’une capacité réellement absente.

Si un nouvel outil paraît nécessaire, présenter sa fonction, ses entrées et sorties, son comportement visible, son emplacement, son cycle de vie et ses interactions avec les outils existants. Ne pas confondre cette décision produit avec la création normale d’un test ou d’un petit changement interne déjà justifié par l’audit.

**Sortie :** une orientation d’intégration argumentée ; aucune création de capacité majeure fondée sur une simple supposition.

### Étape C — Écrire les scénarios

Chaque scénario possède un identifiant stable, un contexte initial, des actions et un résultat attendu observable.

Le scénario distingue ce que voit ou comprend l’utilisateur du résultat canonique attendu dans le système. Pour une capacité interne sans interface propre, décrire le comportement observable à sa frontière et son effet sur le parcours concerné ; ne pas inventer un écran pour remplir une rubrique.

Selon le périmètre, examiner le parcours nominal, l’annulation, les erreurs, les permissions, la persistance, le redémarrage, le hors-ligne, la reconnexion ou les interactions entre plusieurs utilisateurs. La sélection concrète se justifie dans la spécification et le plan ; ces thèmes ne déclenchent pas automatiquement une extension de périmètre.

Pour un bug, conserver le scénario qui reproduit le défaut et le résultat qui prouve sa disparition. Ajouter les cas voisins nécessaires pour éviter sa réapparition.

Les critères UX doivent être observables : comprendre le prochain geste, percevoir le résultat d’une action, retrouver son contexte, pouvoir annuler lorsque le parcours le prévoit, comprendre une erreur et savoir comment continuer. Une capture visuelle correcte ne suffit pas à établir ces points.

**Sortie :** des scénarios locaux et leurs critères d’acceptation, définis avant le développement.

### Étape D — Stabiliser la spécification

Rassembler le besoin, les résultats d’audit, les scénarios, les décisions et les éléments propres au changement dans un fichier Markdown unique. Utiliser le modèle de la section 11.

Les scénarios pédagogiques sont identifiés dès cette étape. Leur génération en documentation, démonstration ou vidéo dépend ensuite des mécanismes réellement disponibles et du plan accepté.

Un comportement non tranché reste explicitement ouvert. Il n’est pas rempli par une invention silencieuse de l’IA.

**Sortie :** une spécification identifiée et révisée, suffisamment claire pour produire un plan.

### Étape E — Produire le plan Codex

Le plan complète le format de préparation déjà prescrit dans les modules globaux. Il présente les étapes numérotées, les propriétaires concernés, les modifications prévues et les validations associées.

Sa section de vérification contient :

| Élément | Contenu attendu |
| --- | --- |
| Niveau recommandé | Simple, intermédiaire ou avancé. |
| Justification | Risques réels, surfaces touchées, contraintes et bénéfice des vérifications proposées. |
| Socle global | Références aux contrôles globaux applicables ; pas de recopie de leurs définitions. |
| Validation locale | Correspondance entre scénarios et tests ou observations nécessaires. |
| Environnements | Contextes d’exécution et équipements requis, avec leurs disponibilités connues. |
| Performances obligatoires | Référence au contrat PERF-1, baseline à mesurer avant modification, scénarios et points de mesure, budgets chiffrés proposés, appareils/fixtures/cache/réseau, répétitions et tolérance de non-régression. |
| Preuves | Résultats, captures, traces et mesures attendus, dont rapport de benchmark avant/après et observations brutes. |
| Validation utilisateur | Série d’essais proposée sur le futur livrable, définie avant sa réalisation. |
| Décision | Choix explicite de l’utilisateur sur le plan et le niveau proposé. |

Les trois niveaux modulent l’étendue et la profondeur des vérifications. Ils ne suppriment ni le socle obligatoire, ni les scénarios locaux, ni les deux temps de validation. Une contrainte déjà imposée par les règles existantes ne devient pas optionnelle parce qu’un plan est étiqueté « simple ».

Des étapes peuvent être regroupées lorsque le contexte le justifie, mais le plan indique comment les mêmes obligations et preuves sont conservées. Un bug n’obtient pas automatiquement un chemin raccourci.

**Sortie :** un plan accepté, avec le périmètre de vérification retenu.

### Étape F — Réaliser et produire les preuves

L’IA de développement applique le plan et le protocole global existant. Elle relie les tests aux scénarios et tient à jour les supports concernés.

Avant la première modification du comportement, elle collecte les benchmarks de référence retenus. Après modification, elle rejoue les mêmes parcours et mesure aussi le coût de la fonction nouvelle. Elle réutilise les propriétaires de mesure existants et applique le [contrat PERF-1](#performance-contract), sans inventer de résultats ni changer la fixture pour améliorer le chiffre.

Une découverte qui modifie le besoin, introduit une capacité majeure ou rend le plan caduc entraîne une mise à jour explicite de la spécification et du plan. Une adaptation technique à l’intérieur du périmètre accepté est documentée sans provoquer une question inutile.

Le travail se poursuit jusqu’au passage des vérifications requises ou jusqu’à un blocage démontré. Le rapport ne transforme jamais « lu », « prévu » ou « compilé » en « testé en situation réelle ».

**Sortie :** un candidat identifiable et un dossier de vérification, selon les formats globaux.

### Étape G — Valider par l’IA

La validation IA rassemble les deux périmètres : le global et le local. Ce n’est pas deux réceptions humaines séparées.

L’IA exécute les tests requis, examine leurs résultats et vérifie les interactions réelles lorsque le périmètre l’exige. Un test annoncé mais non exécuté reste non exécuté. Un matériel absent ou un environnement incapable de produire la preuve requise reste un blocage de validation, pas un succès supposé.

Les exigences UI ne remplacent pas les exigences UX. Les deux sont reliées aux critères prévus dans le plan.

Le verdict comprend obligatoirement les performances : respect des budgets retenus, absence de régression confirmée, ressources et résultats par appareil. Une fonctionnalité correcte mais trop lente n’est pas validée. Un benchmark requis manquant ou non exploitable bloque le candidat de réception ; l’aperçu expérimental peut rester disponible avec son état réel.

**Sortie :** un verdict IA étayé et un livrable candidat accompagné de la série d’essais prévue pour l’utilisateur.

### Étape H — Valider par l’utilisateur

L’utilisateur accède à une version précisément identifiée, avec des instructions courtes pour exécuter les essais définis dans le plan. Le dossier expose les résultats IA, les limites et les éventuels écarts.

La validation finale est une décision explicite de l’utilisateur sur ce livrable. L’absence de réponse ne vaut pas validation.

En cas de refus ou d’écart, le changement revient en réalisation avec le scénario concerné. Après correction, les vérifications nécessaires sont rejouées et un nouveau candidat est soumis.

Une modification ultérieure du code, de la configuration ou de l’assemblage livré impose de réexaminer la validité des preuves et de soumettre le candidat modifié à la validation finale. On ne réutilise pas silencieusement l’acceptation d’un autre livrable.

## 6. Documentation, aide, tutoriel et vidéo

### 6.1 Une source fonctionnelle, plusieurs supports

La spécification décrit le comportement ; les scénarios structurent son apprentissage. À partir de ces éléments, le circuit cible produit ou met à jour : la documentation, l’entrée d’aide de la fonction, le tutoriel exécuté dans eVe et sa vidéo de démonstration.

Un Markdown n’est pas automatiquement un programme exécutable. Le passage d’un scénario à une automatisation exige un format interprétable, un mécanisme de traduction ou de préparation et une exécution vérifiée. Ce mécanisme doit être audité et spécifié avant d’être implémenté.

La traçabilité recommandée est :

```text
Spécification + révision
  → scénario identifié
    → test de validation
    → explication documentaire
    → démonstration guidée
    → capture vidéo de la version validée
```

Pour un correctif, mettre à jour ou revérifier les supports de la fonctionnalité concernée plutôt que produire artificiellement une deuxième aide décrivant la même chose.

### 6.2 Outil d’aide : une fonctionnalité distincte

L’outil d’aide souhaité ne doit pas être présenté comme déjà implémenté ou créé à l’occasion d’un autre changement sans discussion. Il doit faire l’objet de son propre audit, de sa spécification et de son plan.

Son intention fonctionnelle est d’orienter l’utilisateur vers l’explication, le tutoriel en direct ou la vidéo de la fonction concernée. Son nom final, sa place, son interaction et ses dépendances seront déterminés par ce travail, en réutilisant les outils et les contrats graphiques existants.

En attendant son existence, une spécification peut préparer les contenus et scénarios pédagogiques. Leur état reste « préparé, non intégré ». Si leur intégration fait partie du périmètre accepté d’une livraison, cette exigence reste à satisfaire ; elle n’est pas déclarée terminée fictivement.

### 6.3 Comportement recommandé des démonstrations

Un tutoriel exécuté devant l’utilisateur doit avoir des préconditions vérifiées, des étapes compréhensibles, une progression observable et des possibilités de pause, d’arrêt et de reprise définies.

Il réutilise les intentions, outils et API canoniques. Les preuves d’usage UI passent par les interactions réelles documentées ; une invocation interne réussie ne prouve pas à elle seule qu’un utilisateur peut réaliser le parcours.

Par défaut, utiliser un contexte de démonstration isolé. Une exécution sur le projet réel nécessite un consentement et des effets explicites. Ne pas envoyer de message, partager de donnée, supprimer un contenu ou déclencher une action externe à l’insu de l’utilisateur.

L’arrêt et le nettoyage ne doivent annuler que les effets appartenant au tutoriel. Ne pas restaurer globalement un ancien état si d’autres modifications légitimes ont eu lieu entre-temps.

La vidéo provient d’une exécution réelle du parcours accepté. Elle porte la référence du scénario, la version produit et la langue. Une animation illustrative n’est pas une preuve de fonctionnement. Si le parcours change, ses supports sont signalés comme à réviser avant d’être présentés comme actuels.

## 7. Travail à plusieurs et intégration intelligente

**Statut : circuit cible à mettre en place, pas infrastructure active.** La politique actuelle de `.codex/AGENTS.md` interdit les écritures Git. Cette version prépare son évolution ; ni un appel API GitHub ni un agent d’intégration ne doivent contourner cette interdiction. Les recommandations transverses figurent en section 13. [R1]

### 7.1 Deux collaborations différentes

**Collaboration de développement :** plusieurs personnes et IA modifient le code, les scénarios ou un plugin dans GitHub. Elle passe par des changements identifiés, des revues, un assemblage vérifié et une intégration maîtrisée.

**Collaboration dans eVe :** plusieurs utilisateurs travaillent sur des projets et des Atomes pendant l’exécution. Elle relève des permissions, de l’historique et de la synchronisation du framework. Un merge Git n’est pas une résolution de conflits de données utilisateur. Installer le même plugin ne partage aucun projet et n’accorde aucun droit à une autre personne.

### 7.2 Organisation proposée pour GitHub

Chaque changement a une spécification canonique, un responsable de décision produit, une révision de départ et un périmètre déclaré. L’IA propose les contributions à répartir et signale les propriétaires de code communs avant que deux travaux ne divergent.

Après adoption de la politique d’écriture bornée, utiliser une branche et une demande d’intégration (pull request, PR) par changement cohérent. Une PR relie spécification, plan, scénario, résultats, candidat et décision finale. Les branches ne constituent pas des projets fonctionnels distincts : elles isolent le travail avant rapprochement.

Chaque agent travaille dans un espace isolé autorisé, sans écraser l’espace d’un autre agent. Ne pas décider implicitement de créer des worktrees : un ancien brouillon de plugins contient une contrainte locale contraire ; ce conflit de consignes doit être résolu lors de l’adoption. Une isolation par clone ou environnement distant se décide dans le plan d’infrastructure. Aucun chemin de machine personnelle ne devient un prérequis du protocole commun. [R6]

Les statuts des changements restent ceux de la section 9, identiques pour fonctionnalités et bugs. Une PR supplémentaire, un workflow ou une branche n’ajoute pas une nouvelle validation humaine du produit.

### 7.3 Assemblage des dépôts et plugins externes

`atomecorp/a` référence `eVe` comme sous-module vers `atomecorp/eVe`. Pour un changement transversal, le candidat doit désigner les deux révisions exactes. Un test d’une branche eVe avec une autre version d’Atome ne prouve pas le candidat final. [R3]

Une mise à jour du sous-module suit l’intégration autorisée dans eVe, puis le référencement exact dans le parent. Une coordination est requise ; Git ne fournit pas ici de transaction atomique entre les deux dépôts.

Un plugin peut conserver son propre dépôt et son propre rythme de versionnement. Son code n’a pas à être copié dans le framework. Le candidat indique alors aussi l’identifiant et la version du plugin, son empreinte, le contrat d’API hôte requis et les dépendances exactes. Le moteur doit d’abord posséder les points d’extension nécessaires : « code externe au dépôt » ne signifie pas « aucune évolution initiale du moteur ».

### 7.4 Merge intelligent

Partir de la cible actuelle, comparer chaque changement à sa base commune et conserver les intentions compatibles. Ne jamais choisir un fichier entier sur sa seule date de modification.

| Situation | Traitement proposé |
| --- | --- |
| Ajouts indépendants et compatibles | Intégrer les deux, puis tester leur combinaison. |
| Changements compatibles dans le même fichier | Réconcilier techniquement sans question produit artificielle. |
| Suppression décidée, sans dépendance restante | Intégrer après vérification des usages et de la concurrence. |
| Suppression contre modification, changement d’API contre nouvel appelant | Examiner les intentions ; demander un arbitrage si elles restent incompatibles. |
| Deux comportements UX ou métier incompatibles | Expliquer le cas concret, proposer une solution, poser une question unique. |
| Fichiers générés | Régénérer depuis leurs sources canoniques au lieu de fusionner aveuglément leur contenu. |
| Changement de version d’une dépendance | Recalculer l’assemblage ; ne pas prendre automatiquement la version numériquement supérieure. |

L’IA résout matériellement les conflits autorisés. L’utilisateur tranche uniquement un conflit de sens non résolu par les décisions déjà prises. Une résolution sémantique change la spécification, le plan et les tests concernés ; elle ne se cache pas dans un commit de merge.

Une intégration sans conflit textuel peut casser une fonctionnalité. Les tests doivent porter sur l’assemblage, pas seulement sur les branches séparées. Une file d’intégration GitHub peut vérifier chaque candidat avec la cible actualisée ; lorsqu’elle est retenue, ses contrôles doivent écouter `merge_group` en plus des PR. Sa disponibilité et sa configuration restent à vérifier. [E3]

### 7.5 Préserver la validation finale sans multiplier les demandes

L’acceptation utilisateur porte sur un candidat identifié et son périmètre. Une fusion qui change les octets, les dépendances ou le comportement entraîne un nouveau candidat et un réexamen des preuves. Toute modification fonctionnelle pertinente retourne à la réception prévue ; l’IA ne transfère pas silencieusement une acceptation à une autre version.

La configuration du pipeline doit éviter une boucle où chaque simple publication reconstruit un produit différent : produire le candidat intégré, le tester, le faire accepter, puis promouvoir cet artefact. Une transformation imposée par la signature ou un canal natif reste identifiée et vérifiée.

### 7.6 Concurrence des tests et des ressources

Une campagne possède ses comptes QA, ses projets, sa base de test ou son espace logique isolé, ses fichiers et ses ressources. Ne jamais réinitialiser une base partagée pour faciliter une probe.

Les tests UI concurrents n’utilisent pas le même serveur ou le même appareil sans orchestration explicite. Réserver chaque appareil avec un verrou de durée bornée, un propriétaire et une libération même après échec. Les règles existantes signalent déjà des faux échecs causés par la concurrence entre probes. [R4]

Le plan réserve également les ports, les périphériques audio/MIDI, la caméra et le microphone lorsqu’ils sont partagés. Les campagnes destructives ne ciblent jamais les données de production.

## 8. Livrables distants, déploiement et tests multiplateformes

**Statut : stratégie d’automatisation à implémenter après audit des scripts et autorisations.** Il ne s’agit pas de workflows déjà installés.

### 8.1 Le sens de « tester immédiatement, sans validation »

Le fonctionnement proposé distingue trois situations :

| Situation | Mise à disposition | Statut réel |
| --- | --- | --- |
| Aperçu de développement isolé | Automatique après contrôles de sécurité et de démarrage, selon une autorisation permanente du canal de test. | Expérimental ; validation IA complète encore possible en cours. |
| Candidat de réception | Disponible lorsque tous les contrôles IA globaux et locaux requis ont réussi. | Validé IA ; attente de la validation finale utilisateur. |
| Version stable | Publication dans le circuit adopté après réception du candidat concerné. | Validé utilisateur ; production ou distribution stable. |

**Supprimer une approbation manuelle avant chaque aperçu ne supprime ni les tests, ni les permissions, ni ta validation finale.** Cela ne supprime pas non plus un contrôle obligatoire d’Apple, de Google, du système ou de l’organisation.

L’autorisation permanente définit les projets de test, les destinataires, les canaux, la durée des liens, les coûts autorisés et les opérations exclues. Un aperçu ne reçoit aucun secret de production et n’envoie aucun message réel par défaut. Un défaut de sécurité ou une provenance inconnue bloque sa diffusion ; un défaut fonctionnel explicitement signalé peut rester reproductible dans un environnement QA confiné.

### 8.2 Manifeste et fiche du candidat

Le candidat contient une version accessible, les scénarios à jouer et les preuves déjà acquises. Sa fiche distingue source, construction et installation réellement testée.

```text
candidate_id
specification_id + specification_revision
approved_plan_revision
atome_commit + eve_commit
plugin_id + plugin_version + plugin_digest, si pertinent
source_snapshot_digest, si code non commité
build_id + artifact_digest
host_api_version + data_schema_version
channel: preview / acceptance / stable
target_platform + OS_version + runtime_version
actual_device + GPU_or_software_renderer + input_mode
environment_id + backend_revision
scenario_ids + global_check_results + local_check_results
evidence_location + retention_date
IA_validation_status + user_validation_status
access_link_or_install_instructions + expiry
known_limits + rollback_reference
```

Ce bloc décrit des champs du dossier de livraison, pas une API déjà implémentée. Le QR code, s’il est produit, renvoie vers une page authentifiée ; ce n’est pas un secret d’accès permanent. Un lien « latest » peut orienter, mais le test et la réception enregistrent toujours la version immuable résolue.

### 8.3 Chaîne proposée

```text
Spécification et plan acceptés
  → préparation d’un environnement isolé et des révisions exactes
  → audit / réalisation / contrôles ciblés
  → construction reproductible du candidat
  → contrôles de sécurité et de démarrage
  → aperçu privé optionnel, automatiquement disponible et marqué expérimental
  → tests globaux + scénarios locaux sur les cibles requises
  → rapport IA, captures et limites par cible
  → candidat de réception accessible à distance
  → essais et validation finale utilisateur
  → promotion de l’artefact accepté selon le canal autorisé
```

Le plan d’automatisation doit inventorier d’abord les scripts existants, la CI effective, les signatures et le matériel. La précédente inspection de `.github` n’avait trouvé aucun dossier `workflows` dans le parent ; cela ne prouve pas l’absence de CI ailleurs. Ne pas présenter une automatisation proposée comme active. [R5]

### 8.4 Matrice de diffusion

| Cible | Canal de test proposé | Ce qu’il faut prévoir | Limite à annoncer |
| --- | --- | --- | --- |
| Web sur ordinateur | Aperçu HTTPS privé par candidat, backend de test identifié. | URL, authentification, données QA, version du navigateur et capacités WebGPU vérifiées. | Un navigateur compatible n’établit pas toutes les fonctions natives. |
| Web sur iPhone/iPad ou Android | Même candidat via un lien sur le vrai appareil ; installation PWA seulement si le mode est réellement pris en charge. | Tester tactile, viewport, clavier, permissions, reprise, réseau et cache. | Ce n’est pas une validation de l’application native. |
| iOS/iPadOS, équipe interne | TestFlight interne pour les membres habilités ; distribution ad hoc pour les appareils enregistrés lorsque ce canal est retenu. | Compte développeur, signature, traitement du build et invitations ; en ad hoc, profil incluant les appareils. | Pas de promesse d’installation instantanée sur n’importe quel iPhone. [E4, E6] |
| iOS/iPadOS, testeurs externes | TestFlight externe. | Build, informations de test, groupe externe et circuit Apple. | La première soumission nécessite une revue ; les suivantes peuvent encore être revues. [E5] |
| Android natif | APK signé diffusé à un groupe QA, éventuellement via Firebase App Distribution ; Internal App Sharing est une autre option à évaluer. | Chaîne Android opérationnelle, identifiant, clé, règles d’installation et groupe de test. | La présence d’Android natif dans Atome/eVe n’est pas établie par cet audit. [E7, E8, E9] |
| macOS/Tauri | Artefact natif de test construit sur le runtime officiel. | Signature/distribution adaptées au canal, backend Axum, permissions et logs. | Un aperçu Web n’est pas une preuve Tauri. |
| Autres OS / TV / AUv3 | Cible explicite du plan, avec le runtime et l’équipement correspondants. | Audit du support existant ; hôte AUv3 réel lorsqu’il est concerné. | Ne pas extrapoler le succès d’une plateforme vers une autre. |
| Plugin dans un hôte déjà installé | Paquet versionné et vérifié, chargé à la demande dans l’espace de test. | Contrat compatible, permissions, sandbox et gestionnaire de cycle de vie réalisés. | Une nouvelle capacité native exige une nouvelle version de l’hôte ; le chargement à chaud ne contourne pas les règles des stores. |

TestFlight interne est un canal de test destiné aux utilisateurs habilités d’App Store Connect, pas un accès public sans conditions. La distribution automatique dépend du mode de construction ; les particularités du canal doivent être vérifiées plutôt que supposées. [E4]

Pour Android, préférer une clé de test séparée et une identité QA distincte lorsque la cohabitation avec la production l’exige. Un AAB n’est pas simplement un APK à ouvrir sur un appareil ; le canal doit produire ou délivrer l’application installable. [E7, E8]

### 8.5 Test à distance : où s’exécutent les essais ?

Trois lieux peuvent compléter la même campagne : navigateurs sur runners distants, laboratoire de vrais appareils accessible à distance, et appareils des testeurs. Le poste du développeur ne doit pas être requis pour consulter un candidat.

Un laboratoire minimal peut associer un Mac autorisé aux builds iOS et à un iPhone/iPad enregistré, ainsi qu’un runner Android relié à des appareils de test. Une ferme de dispositifs distante est une option, non un service présumé connecté. Vérifier ses OS, GPU, possibilités de contrôle, logs, signatures, coûts et contraintes de confidentialité avant choix.

Un téléphone personnel distant n’est pas automatiquement pilotable par l’IA. Sans agent de test autorisé et accès réel aux gestes, l’essai est humain ; il est enregistré comme tel. Une diffusion d’écran seule ne prouve pas que les actions automatisées ont eu lieu sur l’appareil.

### 8.6 Matrice de vérification

Le plan recommande **simple, intermédiaire ou avancé** et l’utilisateur choisit. Ces niveaux n’enlèvent jamais les obligations des modules Codex ni les scénarios locaux. Les contrôles existants restent propriétaires de leur définition ; cette matrice décrit les axes à renseigner, pas une deuxième suite globale.

| Axe | Informations et preuves attendues |
| --- | --- |
| Fonctionnement | Parcours nominal et erreurs locales, résultat canonique, absence de régression voisine. |
| UI | Gestes réels, pixels rendus, lisibilité, géométrie, maintien des menus et du contexte. |
| UX | Prochain geste compréhensible, retour d’action, annulation, erreur explicable, absence d’impasse. |
| Appareils | Téléphone/tablette/desktop pertinents, OS, taille, orientation, tactile/souris/clavier, mode gaucher/droitier selon portée. |
| Runtime | Web, natif, hôte AUv3 ou serveur réellement concerné ; émulation explicitement étiquetée. |
| Données | Persistance, changement de compte/projet, redémarrage, droits et absence de fuite. |
| Réseau | Latence/perte/interruption, hors-ligne lorsque supporté, reconnexion et absence de doublons. |
| Collaboration | Deux comptes distincts, droits différents, modification concurrente, révocation et convergence. |
| Médias | Images/pixels, son effectivement produit ou acquis, permissions, périphériques et reprise selon scénario. |
| Plugin | Installation, activation, désactivation, mise à jour, permissions, maintien des données et retrait propre. |
| Performance obligatoire | Contrat PERF-1 et budgets des propriétaires : comparaison avant/après, P50/P95/max, première ouverture/réouverture, fluidité, ressources et non-régression ; résultats séparés par appareil, charge et runtime. |

La validation visuelle applique les procédures existantes de `how_debug_UI.md` et `visual-test-protocol.md`. Un DOM correct, un test de contrat, un émulateur ou une capture vide ne deviennent jamais « testé sur appareil réel ». Un contrôle non exécuté reste `not-run` ou `blocked`, avec sa raison. [R4]

### 8.7 Collaboration réellement testée

Pour une fonction partageable, prévoir au minimum les situations pertinentes suivantes : A modifie et B observe ; B en lecture seule tente une écriture ; A et B produisent des changements compatibles ; une modification hors-ligne revient après une modification distante ; un droit est retiré pendant la session. Vérifier les données canoniques, les permissions et les résultats visibles de chaque participant.

Pour les plugins, ajouter des versions différentes de paquet sur deux appareils. Partager un document ne doit jamais exécuter automatiquement le code de son auteur sur la machine du destinataire. Un plugin absent ou incompatible laisse les données conservées et signale la capacité manquante ; aucun téléchargement/exécution silencieux.

### 8.8 Sécurité, coûts et exploitation du circuit

Les contributions non fiables s’exécutent sans secrets de signature ni identifiants de production. Les jobs de publication ont des permissions minimales et n’exécutent pas arbitrairement le code d’une PR externe avec des secrets. Vérifier les actions et dépendances utilisées, les versions et les empreintes des artefacts.

Limiter le nombre d’aperçus, leur durée, la conservation des preuves et l’occupation des appareils. Fermer et nettoyer un aperçu abandonné sans supprimer les données réelles. Les journaux sont expurgés des secrets et données personnelles inutiles. Les accès de test sont révocables.

### 8.9 Retour arrière

Distinguer retour à une version de code, désactivation d’un plugin, retour d’un artefact et restauration de données. Un ancien binaire peut être incompatible avec un nouveau schéma ; une action externe déjà exécutée n’est pas annulée par un redéploiement.

Conserver les artefacts vérifiés immuables dans le canal autorisé, pas du code mort dans le framework. Tester la compatibilité descendante ou une procédure de réparation avant de promettre un retour arrière. Préserver les événements et les changements des autres utilisateurs. Le protocole d’upgrade des plugins est détaillé dans `PLUGIN_SPEC.md`.

### 8.10 Conditions d’activation de cette automatisation

Avant exécution réelle, disposer de : politique Git mise en cohérence ; environnements QA ; comptes et canaux choisis ; signatures et clés accessibles au seul job autorisé ; inventaire de dispositifs ; scripts de build vérifiés ; scénarios ; mécanisme de preuves ; règles d’accès, coûts et rétention.

Ce sont des prérequis d’implémentation, pas des questions à répéter pour chaque fonctionnalité. Les définir une fois dans le plan d’infrastructure, puis les référencer.

## 9. Statuts et progression

Utiliser un même vocabulaire pour fonctionnalités et bugs. Les noms ci-dessous sont proposés pour la première version du protocole :

```text
Brouillon → Spécifié → Plan proposé → Plan approuvé
  → En réalisation → À valider par l’IA
  → Validé IA / À valider par l’utilisateur
  → Validé utilisateur → Livré
```

`Bloqué` et `Abandonné` sont des états explicites, accompagnés d’un motif. Une correction demandée peut faire revenir en réalisation sans perdre l’historique des décisions.

La progression d’exécution et le format de compte rendu restent ceux du module 07. Ils ne doivent pas être redéfinis dans chaque spécification. Une validation technique achevée et une validation utilisateur en attente doivent rester distinguables.

## 10. Adoption progressive recommandée

Adopter d’abord les ajouts transverses retenus et la structure de spécification. Éprouver ensuite le circuit sur un changement représentatif, avec son plan, ses preuves et sa validation finale.

Formaliser les contrôles communs dans leurs propriétaires existants avant d’automatiser leurs appels. Mettre ensuite en place la production de candidats et l’intégration multi-dépôts, après résolution de la politique Git. Développer enfin l’outil d’aide et la génération pédagogique comme capacités spécifiées à part entière.

Cette progression ne dispense pas des obligations applicables à une livraison. Elle évite de confondre une méthode écrite avec une infrastructure déjà construite.

## 11. Modèle de spécification locale

Le modèle est volontairement centré sur le changement. Les définitions globales restent dans le jeu de règles Codex. Les rubriques sans objet sont expliquées, pas remplies par des fonctionnalités inventées.

````markdown
# [Identifiant] — [Titre du changement]

## Identité
- Type : fonctionnalité / bug.
- Forme de livraison : moteur / application externe / plugin.
- Contrat plugin applicable et version, si pertinent :
- Révision de la spécification :
- Statut :
- Responsable de la décision produit :
- Dépôt et emplacement canonique de cette spécification :
- Dépôts et contextes d’exécution concernés :
- Plateformes demandées, devices de test et support actuellement vérifié :
- Références : jeu de règles global, WORK_METHOD.md, documentation pertinente.

## 1. Besoin et périmètre
- Objectif et résultat observable :
- Utilisateurs et situations concernés :
- Inclus :
- Exclus :
- Pour un bug : attendu / observé / contexte de reproduction.

## 2. Comportement spécifique
- Déclenchement et préconditions :
- Actions et transitions :
- Résultat visible et résultat canonique :
- Annulation, sortie et reprise :
- Erreurs, permissions et effets externes pertinents :
- Critères UX spécifiques :
- Contrats graphiques existants référencés ; éventuel besoin non couvert :

## 3. Résultats de l’audit
- Propriétaire canonique et références de code :
- Mécanismes, outils, composants et API réutilisés :
- Documentation et maps consultées :
- Surfaces et dépendances impactées :
- Nouveauté réellement nécessaire, preuve et décision associée :

## 4. Scénarios locaux
### SCN-001 — [Titre]
- Acteur et contexte initial :
- Environnement, jeu de données et autorisations :
- Actions utilisateur ou actions observables à la frontière du système :
  1. ...
  2. ...
- Résultats attendus après les actions importantes :
- Critères d’acceptation identifiés : AC-001, AC-002...
- Critères UI et UX propres au scénario :
- Benchmark associé, référence PERF, définition locale de « utilisable » et point de début/fin :
- Cas d’erreur, interruption ou annulation concernés :
- Effets persistants et remise en état du contexte de test :
- Test ou procédure de validation associé :
- Preuves attendues :
- Réutilisation pédagogique : documentation / tutoriel / vidéo.

[Répéter pour chaque scénario nécessaire.]

## 5. Impacts et risques spécifiques
- Données, historique, permissions, synchronisation :
- Autres fonctions, projets ou utilisateurs concernés :
- Performances spécifiques : scénario benchmark, charge/données, budget local et références aux seuils globaux (ne pas recopier le catalogue) :
- Compatibilité et retour arrière :
- Dépendances à d’autres changements :

## 6. Plan proposé
- Révision du plan :
- Niveau de vérification recommandé : simple / intermédiaire / avancé.
- Justification et éventuelle alternative utile :
- Références aux contrôles globaux applicables :
- Tests locaux reliés à SCN-xxx et AC-xxx :
- Benchmark obligatoire : baseline/version de départ, seuils proposés, appareils, fixtures, cache/réseau, répétitions, tolérance de régression et ressources concernées :
- Environnements, prérequis et capacités manquantes :
- Étapes numérotées, avec leur preuve de validation :
- Livrable candidat prévu et canal de test :
- Aperçu expérimental automatique autorisé : oui/non + politique de canal.
- Accès distant, identités QA, signatures et installations nécessaires :
- Pour un plugin : permissions, paquet/version, chargement à chaud, migration et retrait :
- Série d’essais prévue pour la validation utilisateur :
- Niveau retenu et décision de l’utilisateur :

## 7. Documentation et aide
- Documentation existante à mettre à jour :
- Parcours pédagogique et scénario source :
- Tutoriel et vidéo concernés ; versions :
- Entrée d’aide cible et dépendances d’intégration :
- Textes localisés concernés :
- État réel de chaque support : prévu / préparé / produit / vérifié / intégré.

## 8. Résultats et réception
- Référence du rapport global de validation IA :
- Résultats locaux par scénario et critère :
- Rapport de performances : avant/après, P50/P95/max et échecs, budgets retenus, ressources, verdict par appareil, observations brutes et limites de mesure :
- Identifiant exact du candidat et révisions Atome/eVe/plugin :
- Statut par device : physique / émulation / navigateur, résultats et preuves :
- Preuves et limites connues :
- Verdict IA :
- Décision finale utilisateur, date et version concernée :
- Référence de livraison effective :

## 9. Décisions et questions ouvertes
- Décisions acquises, motif et révision concernée :
- Question réellement bloquante, contexte et recommandation :
- Évolutions du périmètre acceptées :
````

## 12. Sources et périmètre de cette rédaction

Cette rédaction repose sur le dialogue du 9 septembre 2026 et sur la lecture des règles du dépôt via GitHub. Elle n’est pas un audit exhaustif du code, de la CI, du support Android ou de l’outil d’aide. Aucun test applicatif n’a été exécuté pour la produire.

- **R1 — Règles globales :** [.codex/AGENTS.md](https://github.com/atomecorp/a/blob/main/.codex/AGENTS.md), version lue `3.1-modular-entry`, et ses modules 01 à 07. Les empreintes et le détail du rapprochement figurent dans `AGENTS_RECOMMENDATIONS.md`.
- **R2 — État factuel :** [FRAMEWORK_STATE.md](https://github.com/atomecorp/eVe/blob/7af4209b238338c304c8ae43429f878d3932a29b/documentations/FRAMEWORK_STATE.md), introduction et état récent consultés au commit référencé par le parent ; ce document n’a pas été revérifié par exécution.
- **R3 — Relation entre dépôts :** [.gitmodules](https://github.com/atomecorp/a/blob/main/.gitmodules) et entrée GitHub `a/eVe`, consultées le 9 septembre 2026.
- **R4 — Validation existante :** [.codex/visual-test-protocol.md](https://github.com/atomecorp/a/blob/main/.codex/visual-test-protocol.md) et [atome/documentations/how_debug_UI.md](https://github.com/atomecorp/a/blob/main/atome/documentations/how_debug_UI.md).
- **R5 — Répertoire GitHub inspecté :** [arbre .github](https://api.github.com/repos/atomecorp/a/git/trees/e5e110f080491e1041828ad8ab8c6546c0b00eef), non tronqué.
- **E2 — Documentation officielle GitHub :** [Reviewing deployments](https://docs.github.com/actions/managing-workflow-runs/reviewing-deployments), consultée le 9 septembre 2026.

Les chemins sont ceux du dépôt inspecté. La présence d’anciens chemins dans certaines règles doit être vérifiée au moment de l’application ; elle ne justifie pas de créer un répertoire ou une deuxième documentation pour les rendre artificiellement vrais.

## 13. Intégration documentaire et évolutions transverses à préparer

### 13.1 Les trois documents de ce lot

| Document | Destinataire et rôle | Emplacement recommandé lors de l’adoption |
| --- | --- | --- |
| `WORK_METHOD.md` | Équipe, IA de dialogue et IA de réalisation : méthode et chaîne de livraison. | Racine de `atomecorp/a`, comme prévu. |
| `PLUGIN_SPEC.md` | IA et développeurs du moteur : proposition de contrat des applications/plugins et plan d’implémentation. | Fusionner son apport dans le chantier canonique déjà présent `todo/eVe_plugin.md`, puis publier la référence stable selon l’organisation du dépôt. Ne pas activer deux normes concurrentes. |
| `USER_GUIDE.md` | Utilisateurs, auteurs et testeurs : scénarios, applications, plugins et réception à distance. | Documentation utilisateur existante d’eVe ; intégration ultérieure à l’aide. |

Les noms sont ceux du lot téléchargeable. Les liens relatifs entre les trois fichiers fonctionnent lorsqu’ils sont conservés ensemble. Si leur emplacement change dans le dépôt, mettre à jour les liens et l’index documentaire.

`AGENTS_RECOMMENDATIONS.md`, livré précédemment, reste un document de préparation historique, pas une quatrième norme active. Les décisions déjà établies qu’il rassemble restent applicables à la préparation de l’adoption. La présente section complète son plan d’intégration pour les nouveaux besoins.

### 13.2 Répartition des nouveaux compléments

| Propriétaire documentaire | Complément à intégrer une seule fois |
| --- | --- |
| `.codex/AGENTS.md` | Renvois et routage vers la méthode, le contrat plugin retenu et les procédures de validation ; pas une copie de leurs contenus. |
| Module 02 | Autorisation Git bornée éventuelle, séparation QA/production, règles de provenance des dépendances et protection des secrets. |
| Module 03 et runbooks | Exécution distante, matrice de devices, distinction simulateur/réel, réservation des appareils, contrôles plugin et **contrat PERF-1 : benchmarks obligatoires, seuils et protocole unique**. |
| Module 04 | Même audit pour contribution au moteur, application externe et plugin ; nouvel outil/capacité soumis au plan ; baseline, budgets et campagnes de performance proposés avant développement. |
| Module 05 | Contrat d’extension dans les propriétaires existants ; frontière d’interopérabilité MCP/API externe à décider, sans transport interne parallèle. |
| Module 06 | Données d’application distinctes du code installé, aucune exécution implicite par partage, migrations et versions concurrentes. |
| Module 07 | Identité du candidat, état expérimental / validation IA / réception humaine, preuves par cible ; clôture bloquée si benchmark absent, budget dépassé ou régression confirmée non résolue. |

Le socle global, la rigueur identique pour bugs et fonctionnalités, les scénarios systématiques, le choix utilisateur du niveau recommandé et la réception finale restent ceux du dialogue initial. Une règle nouvelle ne se recopie pas dans chaque spécification.

### 13.3 Réconcilier le brouillon plugin existant

Le brouillon `todo/eVe_plugin.md` constitue un point de départ réel, mais son statut de conception ne prouve pas la présence d’un chargeur opérationnel. Il contient aussi des consignes locales qui doivent être harmonisées : tests limités à des probes temporaires, interdiction de worktree, chemin de machine personnelle et plusieurs garanties de sandbox ou de compatibilité à démontrer. [R6]

`PLUGIN_SPEC.md` fournit un tableau de rapprochement et remplace les garanties non établies par des contrats testables. Ce rapprochement doit être approuvé dans le plan documentaire avant de transformer le brouillon en consigne d’exécution. Le présent lot ne modifie aucune règle active du dépôt.

### 13.4 Ordre d’adoption recommandé

1. Mettre en cohérence les règles globales et les références sans perdre les garde-fous existants.
2. Faire fonctionner le circuit scénario → plan → candidat distant → tests → réception sur une modification représentative.
3. Réconcilier la spécification plugin avec l’ancien brouillon et les propriétaires de code.
4. Livrer les fondations du moteur, puis un premier paquet déclaratif et un paquet JavaScript limité après preuve d’isolation.
5. Valider le chargement à chaud sur les cibles effectivement supportées, puis ouvrir les sources externes/MCP selon la frontière autorisée.
6. Intégrer le guide, les tutoriels et les captures réelles dans l’aide, en affichant clairement les capacités disponibles.

La création d’un magasin, la monétisation, de nouveaux rendus ou les effets audio temps réel ne sont pas des prérequis imposés pour une première application tierce. Ils relèvent de périmètres ultérieurs explicites.

<a id="performance-contract"></a>

### 13.5 Ajout transverse — performances et benchmarks obligatoires

**Révision proposée : PERF-1, 9 septembre 2026.** L’obligation de mesurer chaque nouvelle fonctionnalité est demandée par l’utilisateur ; la même rigueur s’applique aux bugs, refactors et plugins. Les valeurs ci-dessous sont des **seuils de départ recommandés**, à challenger sur les appareils de référence dans le plan. Ce ne sont ni des performances déjà atteintes ni une norme Apple/Google imposant ces mêmes chiffres.

**Domicile après adoption :** intégrer ce contrat dans le module 03 existant, avec les renvois nécessaires depuis `.codex/AGENTS.md`, les obligations de plan dans le module 04 et le verrou de livraison dans le module 07. Ne pas créer de quatrième document normatif par défaut. Cette section sert de bloc d’intégration hors dépôt : une fois adoptée, la remplacer ici par un renvoi vers son propriétaire global, sans conserver deux copies actives.

#### 13.5.1 Obligation et portée

Chaque nouvelle fonctionnalité, modification de comportement, correction, refactor ou version de plugin doit avoir un **benchmark exécutable, reproductible et comparatif** avant sa validation IA. Même le niveau « simple » conserve un benchmark ciblé ; les niveaux intermédiaire et avancé étendent les appareils, charges, durées et interactions croisées, pas le droit de ne rien mesurer.

Mesurer le nouveau parcours et les parcours existants susceptibles de ralentir. Une fonction sans UI mesure son API, sa tâche ou son effet sur le parcours consommateur ; elle n’est pas dispensée de performance parce qu’elle n’a pas de panneau. Une modification strictement documentaire peut être déclarée sans impact exécutable, avec preuve du diff ; ce n’est pas une dispense pour une fonctionnalité.

Avant de modifier le comportement, collecter une référence sur la version de départ et enregistrer ses révisions. Pour un comportement réellement nouveau, mesurer son coût absolu sur le candidat et comparer les parcours existants avec et sans l’ajout. **Ne jamais inventer un « avant = 0 ms » ni un pourcentage de gain pour une fonction absente.**

Le benchmark n’est pas une nouvelle validation humaine : il appartient à la validation IA globale et locale déjà prévue. La décision finale de l’utilisateur demeure unique.

#### 13.5.2 Définir ce que le chronomètre mesure

| Mesure | Début et fin | Ce qui ne constitue pas une preuve |
| --- | --- | --- |
| `feedback_ms` | Entrée réelle déclenchant l’action → premier retour visuel pertinent effectivement présenté. | Début du handler, changement d’un flag interne ou simple retour d’API. |
| `usable_ms` | Même entrée → contenu requis visible **et** commandes nécessaires au scénario utilisables. | Coque vide, spinner, squelette ou panneau dessiné mais clics encore bloqués. |
| `complete_ms` | Même entrée → ensemble fini des données et ressources requis par ce scénario chargé et prêt. | « Réseau calme » pour une application à WebSocket permanent ; attendre la fin d’un média en lecture. |
| `local_durable_ms` | Intention d’écriture → acquittement de persistance locale par le propriétaire canonique, si supporté. | Simple mise à jour optimiste des pixels. |
| `remote_converged_ms` | Intention → convergence reconnue par le protocole canonique chez les participants attendus. | Acquittement local assimilé à une synchronisation distante. |

Chaque scénario nomme sa définition de « utilisable » : par exemple, titre et éléments du projet affichés, sélection effective et ouverture d’un élément par une vraie interaction. Pour une liste, les éléments du viewport convenu peuvent suffire si c’est le contrat produit approuvé ; les données manquantes et le chargement complémentaire restent visibles dans `complete_ms`.

Distinguer **réouverture à chaud**, **première ouverture dans un moteur déjà prêt**, **lancement à froid de l’application** et **première installation/téléchargement**. Décrire l’état des caches disque, données, modules, shaders et médias. Un redémarrage du processus ne prouve pas un cache disque froid ; ne pas les mélanger.

Le temps commence au geste déclencheur réel, en incluant son attente avant traitement. Pour un clic, employer l’événement défini par le contrat d’interaction ; pour un appui long, publier aussi la durée intentionnelle de maintien. Ne pas commencer après les accès disque/réseau. Les animations qui retardent l’actionnabilité sont incluses ; une animation décorative ne doit pas servir à cacher un panneau non utilisable.

#### 13.5.3 Seuils de départ à proposer dans le plan

Les plafonds s’appliquent au **P95 empirique par scénario, appareil, runtime, charge et état de cache**, sans moyenne entre plateformes. P95 = au moins 95 % des observations de la campagne sous ce seuil ; ce n’est pas une garantie statistique de tous les usages futurs. Un maximum et le nombre de dépassements sont aussi obligatoires.

| ID | Parcours mesuré | Objectif d’optimisation | Plafond P95 recommandé |
| --- | --- | --- | --- |
| PERF-UI-01 | Retour visuel à un clic/tap/commande clavier, moteur prêt | 50 ms | **100 ms** |
| PERF-UI-02 | Menu, outil ou panneau courant réouvert, contenu local prêt, jusqu’à `usable_ms` | 100 ms | **200 ms** |
| PERF-UI-03 | Première ouverture d’un outil/panneau dans un moteur déjà prêt, ressources installées | 300 ms | **500 ms** |
| PERF-UI-04 | Ouverture/changement de projet à chaud, jeu de référence local prêt | 300 ms | **500 ms** |
| PERF-UI-05 | Première ouverture d’un projet représentatif dans un moteur prêt, données locales présentes | 500 ms | **1 000 ms** |
| PERF-UI-06 | Saisie, glissement ou réglage continu → résultat visuel correspondant | Présentation au prochain rafraîchissement | **50 ms** de latence entrée → présentation |

Le plafond n’est pas la cible à atteindre au plus juste. Une fonction déjà à 60 ms ne peut pas passer à 180 ms au motif que le tableau autorise 200 ms : le contrôle de non-régression s’applique en plus.

**Pourquoi ne pas imposer 500 ms à tout ?** C’est trop permissif pour un outil fréquent, et ce n’est pas une mesure honnête du chargement intégral d’un gros projet distant. Les repères de réponse immédiate se situent autour de 100 ms ; le seuil web INP « bon » est de 200 ms, mais INP mesure la réponse vers la prochaine présentation, pas la fin de tous les traitements asynchrones. Le P75 terrain de l’INP est distinct du P95 par scénario choisi ici. [P1–P3]

Les seuils d’ouverture visent les conditions déclarées, **pas** un matériel ou un réseau arbitraire. Pour démarrage complet, import/export, rendu lourd, téléchargement, API distante et synchronisation, le plan fixe un budget chiffré propre au volume et au réseau : délai de retour visuel, première capacité utile, achèvement, débit minimal et délai d’erreur/annulation. Aucun « rapide », « optimisé » ou seuil vide ne remplace ces chiffres.

Pour le lancement de l’application, mesurer au minimum la variation avant/après et le temps jusqu’à son premier parcours réellement utilisable. Fixer son plafond absolu après une baseline release sur les appareils retenus, avant de développer le changement ; ne pas confondre ce lancement avec PERF-UI-03 ou 05.

**Calibration, pas assouplissement automatique :** l’IA propose la classe de scénario, le plafond, les fixtures et le matériel dans le plan, avec sa préférence. L’utilisateur décide comme déjà convenu. Un seuil différent doit être justifié avant le développement par le besoin et les mesures, pas relevé après un échec pour le faire disparaître. Une règle globale plus stricte déjà active reste applicable jusqu’à sa modification explicite.

#### 13.5.4 Fluidité, blocages et ressources

Le temps d’ouverture ne suffit pas. Le plan doit couvrir les dimensions applicables ci-dessous et expliquer les autres comme non applicables ; une métrique requise mais non mesurable est `blocked`, pas `N/A`.

| ID | Contrôle | Règle de départ proposée |
| --- | --- | --- |
| PERF-FRAME | Animation, scroll, resize, drag et sliders en charge | Viser 60 images/s sur le profil nominal. Budget de production d’image = `1000 / fréquence_visée` : 16,67 ms à 60 Hz, 8,33 ms à 120 Hz. Mesurer les échéances de présentation ratées ; **≤ 1 %** recommandé sur une séquence active d’au moins 30 s. Le compteur doit distinguer budget CPU/GPU, présentation et jitter d’horodatage. |
| PERF-BLOCK | Blocages pendant l’interaction | Objectif : **aucune tâche de thread principal > 50 ms attribuable au changement** sur les parcours de référence. Toute occurrence est analysée ; aucun blocage reproductible non justifié ne passe la validation. Collecter également durée maximale et total bloqué. Le seuil de détection d’un outil n’est pas un budget acceptable. |
| PERF-MEM | Mémoire et cycle de vie | Fixer avant développement le plafond mémoire active et le budget de cache du propriétaire. Après échauffement documenté, répéter **100 cycles** ouvrir/utiliser/fermer ; comparer les derniers cycles aux premiers à état stable. Aucun listener, timer, abonnement ou ressource média/GPU privé ne reste sans propriétaire/lifecycle. Une pente de mémoire retenue reproductible ou un cache sans borne bloque. |
| PERF-IDLE | Coût lorsque la fonction est inactive | **Aucun nouveau polling, rendu périodique, téléchargement ou démarrage de plugin inactif** non prévu par un besoin explicite. Mesurer au moins **60 s** au repos avant/après, avec instrumentation perturbatrice désactivée. Compter les réveils/activités propres au changement, pas seulement le CPU moyen. |
| PERF-SIZE | Livraison et charge initiale | Mesurer les octets transférés, modules chargés, taille de paquet et ressources initialisées. Le plan fixe le delta maximal justifié ; interdiction de précharger tous les plugins pour embellir leur temps d’ouverture. |
| PERF-IO | Stockage, API, réseau et synchronisation | Mesurer requêtes, octets, latence P50/P95, débit et attente en file quand concernés. Fixer dans la spec les volumes, concurrence et budgets spécifiques ; ne pas soustraire le réseau du délai réellement perçu. |
| PERF-AV | Audio/vidéo et calcul en temps réel | Benchmark sur la chaîne concernée avec UI active et charge représentative : latence, temps du callback, underruns, frames perdues et continuité. Pour audio concerné : **zéro underrun imputable au changement pendant au moins 10 min** au buffer/fréquence retenus ; publier ces paramètres. Aucun seuil générique de 500 ms pour le DSP. |
| PERF-ENERGY | Énergie et thermique sur mobile quand impactées | Mesurer une charge représentative de durée fixée au plan, au moins **10 min** pour média/activité continue. Fixer et comparer un budget énergétique ou un proxy clairement nommé ; ne pas présenter CPU ou un pourcentage de batterie ponctuel comme une mesure directe d’énergie. |

Les budgets d’image sont des objectifs de pipeline, pas une autorisation à consommer tout le temps disponible en JavaScript. RAIL donne environ 10 ms de travail applicatif par image à 60 Hz ; la répartition réelle de Bevy/WebGPU est à mesurer. Les tâches web dépassant 50 ms sont classées comme longues ; ces repères éclairent le choix mais ne certifient pas eVe. [P1, P4]

Sur affichage à fréquence variable, publier fréquence effectivement active, fréquence visée et méthodologie de comptage. Un intervalle rAF de 17 ms ne suffit pas à prouver une image ratée. En vue immobile, zéro rendu inutile est préférable à une boucle imposant 60 FPS : mesurer la fluidité seulement pendant le mouvement.

#### 13.5.5 Référence, répétitions et statistique

**Pendant le développement :** au moins 30 répétitions ciblées d’une interaction courte servent au diagnostic. **Pour la réception des plafonds P95 UI :** au moins 100 observations par version et cellule de benchmark retenue ; sur un scénario froid, restaurer réellement le même état initial à chaque observation. Ne pas compter 1 ouverture froide et 99 chaudes comme 100 ouvertures froides. Le coût de campagne et la matrice sont fixés dans le plan ; réduire les cellules sans justification ne remplace pas les mesures requises.

Une campagne coûteuse de démarrage, export ou énergie peut utiliser une autre procédure proposée dans le plan (répétitions et intervalle de confiance ou borne explicités). Avec moins de 100 observations, ne pas présenter son P95 comme certifié selon ce protocole : le publier comme exploratoire et appliquer la règle de décision spécifique approuvée. Une borne au maximum observé n’est pas une garantie absolue sur les usages futurs.

Pour les interactions courtes, publier `n`, P50, P95, maximum, taux de dépassement du plafond, échecs et timeouts. Convention par défaut : tri croissant et rang `ceil(p × n)` pour le percentile `p`. Un timeout est un dépassement, jamais une ligne supprimée. Une erreur fonctionnelle bloque indépendamment du calcul des latences réussies. Conserver les essais lents ; identifier séparément toute erreur de laboratoire prouvée et rejouer la cellule complète plutôt que sélectionner le meilleur résultat.

Exécuter la référence et le candidat sur le **même appareil**, dans des sessions comparables, en alternant leur ordre quand possible. Fixer versions, charge, cache, réseau, énergie, température et durée de repos. Si le résultat se situe à moins de 10 % d’un plafond, si une régression apparaît ou si la campagne est instable, faire une seconde série indépendante. Conserver les deux séries ; un succès ultérieur n’efface pas un échec inexpliqué.

Une référence déjà lente ne rend pas le candidat acceptable. Elle signale une dette préexistante et la nécessité de traiter le propriétaire ou de décider un périmètre honnête. Les résultats relatifs et le respect absolu des objectifs restent deux conclusions distinctes.

#### 13.5.6 Non-régression et décision de livraison

Pour les latences UI couvertes par le tableau, signaler une régression dès que le P50 **ou** le P95 augmente de plus de `max(10 % de la référence, 10 ms)`. C’est un seuil de détection proposé, pas un droit de ralentir volontairement. Confirmer la mesure par une série indépendante ; une régression confirmée et non résolue bloque, même si le plafond absolu reste respecté. Pour les métriques beaucoup plus courtes, le plan fixe une tolérance compatible avec leur résolution et leur bruit, pas un forfait de 10 ms.

La baisse du temps d’ouverture ne compense pas silencieusement une hausse mémoire, énergie, réseau, charge de boot ou risque audio. Les budgets de ces dimensions sont décidés avant développement, appliqués séparément et reportés ensemble. Une baseline mise à jour est liée à une version acceptée ; le candidat ne remplace pas sa propre référence pour effacer une régression.

**Verdicts :** `passed`, `failed`, `blocked`, `not-run`, `not-applicable` avec justification. Une nouvelle cible sans baseline peut passer ses seuils absolus après campagne complète, mais ne revendique aucune non-régression historique non mesurée ; les parcours existants comparables doivent malgré tout être mesurés avant/après.

**Verrou :** aucun statut « validé IA », « candidat de réception » ou « terminé » si un benchmark requis est absent, inexploitable, en échec ou si un dépassement n’est pas résolu. Un aperçu QA préautorisé peut rester accessible avec la mention **expérimental — performances non validées**, sans devenir une version stable. Un changement de budget ou de périmètre impose une décision tracée, une révision du contrat et une nouvelle validation ; jamais un résultat fictivement vert.

#### 13.5.7 Appareils, charges et tests distants

Le plan nomme au moins un appareil physique de référence pour chaque runtime natif supporté concerné, dont un profil mobile représentatif non limité au téléphone le plus rapide. Nommer aussi le matériel/GPU du navigateur pour les preuves Web. Ne pas transformer l’émulation de viewport, un simulateur iOS, un runner GPU logiciel ou un test Web sur Android en benchmark natif Android. Le support Android reste à établir avant de promettre sa conformité. Les recommandations Android privilégient une configuration proche de release et déconseillent les chiffres d’émulateur comme représentatifs de l’utilisateur. [P5]

Fixer par cellule : modèle, CPU/GPU, RAM, OS, navigateur/WebView, runtime, build optimisé, versions/empreintes Atome/eVe/plugin, viewport/DPR, fréquence écran, état thermique/économie d’énergie, cache, réseau, jeu de données et plugins actifs. Des conditions de diagnostic Debug peuvent aider à trouver la cause ; elles ne remplacent pas la mesure du build livré ou d’un build strictement comparable documenté.

Recommander une fixture nominale et une fixture de charge : nombre d’Atomes/projets, taille des textes, médias réellement décodés, résolutions, durées, participants et concurrence. Les chiffres sont fixés dans le plan à partir de l’usage, et les mêmes fixtures sont conservées avant/après. Un projet vide ne représente pas un projet média ; un téléphone puissant ne prouve pas la performance de toute la gamme.

Pour le distant, définir au moins un profil réseau normal et un profil dégradé reproductibles lorsque le parcours dépend du réseau : RTT, bande passante et pertes. Mesurer le temps utilisateur de bout en bout et séparer son diagnostic réseau/serveur/client. La latence de commande depuis la machine de test et celle de son flux vidéo distant ne doivent pas être attribuées au moteur ; les horodatages commencent sur l’appareil qui reçoit le geste. Ne pas soustraire des horloges non synchronisées entre appareils.

Réserver l’appareil et son runtime pendant la mesure ; ne pas lancer deux campagnes concurrentes pour comparer leur vitesse. Vérifier foreground, absence de débranchement/changement thermique et disponibilité du serveur. Une CI sans l’équipement requis archive un résultat bloqué, elle ne simule pas un résultat matériel.

#### 13.5.8 Instrumentation et réutilisation de l’existant

**Propriétaire déjà identifié :** `atome/src/utils/perf_collector_runtime.js`, qui recueille les événements `squirrel:perf` dans `window.__squirrelPerf`. Le fichier inspecté propose `?perf=1`, `__squirrelPerfEnable()` et les méthodes `timeline()`, `summary()` et l’accès aux événements ; vérifier leur disponibilité dans le runtime du candidat. Réutiliser ce propriétaire et les probes existantes après audit, pas un second collecteur propre à chaque feature. [P6]

Le collecteur possède un buffer borné et des vues arrondies ; exporter les observations brutes suffisamment tôt pour ne pas perdre ou fausser des échantillons. Son `summary()` n’est pas à lui seul une distribution P95. Des durées internes doivent être corrélées au geste et à la présentation du contenu requis ; ne pas appeler une fin de promesse « pixels affichés ».

L’instrumentation active peut ajouter timers et callbacks rAF. Pour `PERF-IDLE` et l’énergie, mesurer aussi un lancement propre sans collecte active et vérifier les ressources de monitoring réellement arrêtées. Ne pas annoncer un surcoût nul parce que le logger est silencieux. Une capture de preuve lourde ne doit pas allonger artificiellement chaque échantillon : employer traces légères et captures de contrôle séparées, en calibrant leur coût.

Les marques `performance.mark/measure` peuvent compléter le propriétaire existant si nécessaire ; User Timing fournit des horodatages, pas une preuve que le compositeur a présenté le contenu. Une attente rAF seule n’est pas une attestation d’affichage. Privilégier le signal de présentation réel du renderer et corroborer par captures/trace natives. Si seule une capture tardive permet de borner le délai, publier une **borne supérieure**, pas une mesure précise de première présentation. [P7]

L’état eVe daté du 7 septembre 2026 indique dix ouvertures chaudes avec médianes Home 437 ms et Dashboard 558,5 ms, explicitement mesurées comme bornes clic → capture. Les ouvertures froides rapportées s’étendent jusqu’à plusieurs secondes. Ces résultats justifient une instrumentation plus précise ; ils ne constituent ni un P95 ni la preuve que les seuils proposés sont déjà atteints. Aucune nouvelle campagne applicative n’a été exécutée pour rédiger cette révision. [P8]

Tests/benchmarks persistants : sous `tests/`, via le harnais approprié déjà présent. Traces, captures et fichiers temporaires : sous `temp/`, puis archivés comme preuves du candidat avant nettoyage. Les identités de test ne doivent pas révéler de données personnelles ou de secrets. L’instrumentation durable reste dans les propriétaires de monitoring autorisés.

#### 13.5.9 Champs obligatoires du plan et du rapport

Le plan référence ce contrat global et définit seulement le spécifique : scénarios, classes PERF, point de début/fin, seuils retenus, appareils, fixtures, cache, réseau, baseline, répétitions, mesures de ressources, commandes réutilisées, limites et décision utilisateur. Un changement de définition entre avant/après invalide la comparaison et exige de rejouer les deux côtés.

Le rapport joint un tableau exploitable, pas seulement « perfs OK » :

```text
Performance contract: PERF-1 + approved profile revision
Candidate / base: exact artifacts and Atome/eVe/plugin revisions
Scenario / criterion / metric: stable identifiers
Device / runtime / build / fixture / cache / network: exact profile
Timing start / end / evidence: definitions and proof level
Samples: attempted / valid / failed / timed-out / invalid-with-proof
Before: P50 / P95 / max / exceedance rate, or new behavior
After: P50 / P95 / max / exceedance rate
Absolute budget / regression tolerance: approved values
Delta: ms and percent where meaningful
Resources: memory / CPU-GPU / idle / IO / size / energy / AV as applicable
Raw observations / traces: paths and hashes
Verdict: passed / failed / blocked / not-run / not-applicable + reason
Remaining action: root cause or missing evidence; never assumed success
```

Un export machine JSON/CSV associé permet le suivi des versions et le contrôle automatique. Il conserve l’identifiant de campagne, la méthode de percentile et les unités ; il ne devient pas une seconde définition des seuils. La CI lit le contrat adopté et applique les mêmes critères au résultat intégré après merge, pas seulement aux branches séparées.

## 14. Sources complémentaires vérifiées pour cette version

Les sources du dépôt ont été lues via le connecteur GitHub. Référence de lecture complémentaire : `atomecorp/a@17f9af3e6b3fd880977f3a761375278bb689580f`, eVe référencé `7af4209b238338c304c8ae43429f878d3932a29b`. Les sources externes ci-dessous ont été consultées le 9 septembre 2026. Leurs règles devront être revérifiées avant déploiement.

- **R6 — Conception plugin existante :** https://github.com/atomecorp/a/blob/17f9af3e6b3fd880977f3a761375278bb689580f/todo/eVe_plugin.md
- **E3 — GitHub, merge queue et événement merge_group :** https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
- **E4 — Apple, TestFlight interne :** https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/
- **E5 — Apple, TestFlight externe :** https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/
- **E6 — Apple, profil de distribution ad hoc :** https://developer.apple.com/help/account/provisioning-profiles/create-an-ad-hoc-provisioning-profile
- **E7 — Android, publication et artefacts :** https://developer.android.com/studio/publish
- **E8 — Google Play, Internal App Sharing :** https://support.google.com/googleplay/android-developer/answer/9844679?hl=en
- **E9 — Firebase App Distribution, intégration à une CI :** https://firebase.google.com/docs/app-distribution?hl=fr
- **E10 — Apple, règles des logiciels proposés dans une application, notamment 4.7 :** https://developer.apple.com/app-store/review/guidelines/
- **E11 — Google Play, code téléchargé et interprété :** https://support.google.com/googleplay/android-developer/answer/16559646?hl=en

### Sources ajoutées pour PERF-1

Consultation documentaire le 9 septembre 2026. Les repères externes inspirent les objectifs ; les plafonds PERF-1, tailles de campagne et tolérances de régression sont des propositions de politique Atome/eVe, pas des seuils publiés identiques par ces organismes.

- **P1 — Google, RAIL, repères réponse/animation :** https://web.dev/articles/rail — document historique, qui renvoie lui-même aux Core Web Vitals pour les objectifs web actuels ; utilisé ici pour ses repères perceptifs, pas son ancien budget de chargement 3G.
- **P2 — Google, INP :** https://web.dev/articles/inp — bonne réponse ≤ 200 ms, évaluation terrain au P75 et distinction entre prochain paint et fin des effets asynchrones.
- **P3 — Apple, Improving app responsiveness :** https://developer.apple.com/documentation/xcode/improving-app-responsiveness — repère d’interaction discrète autour de 100 ms.
- **P4 — Google, Optimize long tasks :** https://web.dev/articles/optimize-long-tasks — seuil de tâche longue supérieur à 50 ms.
- **P5 — Android, Macrobenchmark :** https://developer.android.com/topic/performance/benchmarking/macrobenchmark-overview — build proche de release, preuves/traces et limites de représentativité des émulateurs. L’outil ne prouve pas le support natif Android d’eVe.
- **P6 — Propriétaire de collecte inspecté :** https://github.com/atomecorp/a/blob/main/atome/src/utils/perf_collector_runtime.js — blob lu `4676af61d2e8107d86e05b5cddca8f3e45a80011`, lignes 1–230 ; activation, buffer, API de lecture et instrumentation. Également repéré : `done/optimisations.md` pour les baselines avant/après ; ses anciennes consignes ne remplacent pas les garde-fous actifs.
- **P7 — W3C, User Timing :** https://www.w3.org/TR/user-timing/ — marques et mesures temporelles ; ne certifie pas la présentation des pixels.
- **P8 — État eVe inspecté :** https://github.com/atomecorp/eVe/blob/main/documentations/FRAMEWORK_STATE.md — blob lu `1ab84d6f98399eca2d7cb863197200e470b47777`, lignes 1–110, état du 7 septembre 2026. Bornes de temps rapportées, non rejouées lors de cette rédaction.

**Bilan de cette révision :** obligation de benchmark et proposition de normes documentées ; aucun benchmark du moteur exécuté, aucun seuil d’eVe déclaré atteint, aucune modification de règles dans GitHub. Les autres chapitres du lot précédent sont conservés et leurs sources historiques n’ont pas toutes été revérifiées dans cette révision centrée sur les performances.

**Portée de la livraison :** documents rédigés et relus ; pas de code moteur implémenté, pas de configuration GitHub modifiée, pas de build diffusé, pas de test applicatif ou matériel exécuté.
