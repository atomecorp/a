# atome/eVe — Améliorations et débogages (Sport, communications, discussions, Musique, WebView, Elastic Design, interface transversale, données d’activité iPhone/Android)

**Création :** 3 novembre 2026  
**Statut :** besoins fonctionnels à implémenter / vérifier (mise à jour : 4 novembre 2026)  
**Périmètre :** tous les contextes d’atome/eVe, dont projets et dashboard ; programmes sportifs, activités, exercices, historique des séances, communications audio/vidéo, discussions, Musique/Apple Music, WebView, Elastic Design et synchronisation des activités sportives avec le moniteur eVe

## Règle générale de validation avant toute livraison — applicable à toutes les tâches

**Obligation transversale :** toute correction de bug, amélioration ou nouvelle fonctionnalité décrite dans le présent cahier, passée ou future, doit être **effectivement intégrée et vérifiée** avant d'être déclarée terminée ou remise comme opérationnelle. La présence du code, une revue statique ou une maquette ne suffisent pas à prouver le fonctionnement.

- **Inspecter l'existant**, identifier les composants et les API réels d'atome/eVe, puis vérifier que le changement s'intègre au parcours utilisateur attendu sans dupliquer les outils.
- **Exécuter le comportement en conditions réelles** : depuis l'interface jusqu'au résultat observable ; confronter ce résultat aux exigences précises de la tâche.
- **Tester toutes les plateformes concernées**, en particulier les appareils physiques lorsque la fonctionnalité dépend de l'iPhone, de l'iPad, du Mac ou d'Android ; tester les orientations et configurations pertinentes. Une simulation ou des logs seuls ne remplacent pas un test d'interaction sur appareil lorsque celui-ci est nécessaire.
- **Contrôler les régressions**, les chemins de retour, la persistance des données, les erreurs et les interactions avec les autres outils.
- **Documenter les preuves** : scénario joué, environnement, résultats, captures ou journaux pertinents, anomalies restantes et limitations.
- **Ne pas déclarer « fait », « corrigé », « testé » ou « livré » sans preuves correspondantes**. Si un test ne peut être exécuté, indiquer « non vérifié », la raison et ce qu'il reste à contrôler. Ne pas confondre « code implémenté » et « fonctionnement validé ».

**Critère d'acceptation :** chaque tâche doit disposer d'une vérification de son intégration réelle, de son fonctionnement et de l'absence de régression bloquante avant validation finale. Cette règle s'applique aussi rétroactivement aux tâches D1 à D18 et aux améliorations 1 à 15.

## Suivi d'exécution (session D18, 4 novembre 2026)

Légende : **Web** = codé et prouvé sur Web/Node ; **appareil** = reste à tester sur appareil (par l'utilisateur) ;
**bloqué** = attend une validation de l'utilisateur (maquette, décision). Détail et preuves : `todo/REGISTRE_DEMANDES.md` R-115.

| Point | État | Preuve / dossier |
| --- | --- | --- |
| 1–3 Reprise, progression, modes 1/2 bras | moteur Web ; écran bloqué (maquettes m1, m2 ; 4 questions) | `temp/d18_sport/` resume 26/26 |
| 4 Musique continue | Web ; appareil | `temp/d18_music/` 25/25 |
| 5 Aléatoire | Web ; glyphe à valider ; appareil | `temp/d18_music/` |
| 6 Synchro Santé / Health Connect | Node + compilation ; marque à valider, 4 décisions ; appareil | `temp/d18_health/` 17/17 |
| 7 Assistant désactivé par défaut | Web ; question CarPlay ; appareil | `temp/d18_assistant/` 19/19 |
| 8 Elastic Design | confié à R-114 (fait) | `temp/r114_tile_norm/` |
| 9 Préférences visuelles | joint (0–6 px) et rapport des textes (1,1–1,3) FAITS par R-114 le 4 nov. (choix personnel, défauts de la charte ; `temp/r114_tile_norm/visual_settings.probe.mjs`) ; reste bloqué (règle 14) : opacité, flou, rayon, couleurs | `temp/d18_visual/AUDIT.md` |
| 10 Gestes | B bis Web ; A, B, C bloqués (maquettes) | `temp/d18_gestures/` |
| 11 HTML embarqué | audit rendu ; nouvelle surface à arbitrer | `temp/d18_audits/HTML_AUDIT.md` |
| 12 Roadmap et signalements | audit rendu ; place dans l'UI à arbitrer | `temp/d18_audits/FEEDBACK_CHAIN_AUDIT.md` |
| 13 Hébergements, fiches | A, B Web ; C/D bloqués (4 maquettes) | `temp/d18_activities/` |
| 14 Taxonomie Activités | Web ; appareil | `temp/d18_activities/` 29/29 |
| 15 AUv3 instrument | codé, build simulateur ; hôtes réels | `temp/d18_auv3/` |
| D1–D3 Appels, visio, fil | Web ; outil « Décrocher » à valider ; appareil | `temp/d18_comms/` |
| D4 WebView | Web ; outil « Moteur » à valider ; natif | `temp/d18_webview/` 21/21 |
| D5 Outils des panneaux sur la grille | Web (Dashboard, projet, Sport, FX) ; appareil | `temp/d18_panelgrid/` 25/25 |
| D6 Suppressions et alarmes | Web ; iPhone | `temp/d18_delete/` |
| D7 Bips et voix | Web ; bips natifs à écouter | `temp/d18_sport/` |
| D8 Barre de saisie adaptative | codé (traits repliant le champ) ; UI non vérifiée | `temp/d18_rail/` |
| D9 Recherche universelle | Web ; carte des Lieux, groupes de contacts bloqués | `temp/d18_search/` 27/27 |
| D10 Bien-être | Web | `temp/d18_activities/` |
| D11 Libellés des tuiles 120 | Web | `temp/d18_rail/ui.probe.mjs` |
| D12 CarPlay | compilé ; appareil | `temp/d18_native/` |
| D13 Montre | compilé ; Live Activity à arbitrer ; appareil | `temp/d18_native/` |
| D14 Scanner | Web ; 4 maquettes ; déployer atome.one ; appareil | `temp/d18_scanner/` 35/35 |
| D15 AUv3 ne s'ouvre plus | 3 causes probables corrigées ; non reproduit ; iPad | `temp/d18_auv3/` |
| D16 Tauri écran blanc, mot de passe | compilé ; Mac | `temp/d18_native/` |
| D17/D18 Rail contextuel | modèle 62/62 ; UI non vérifiée | `temp/d18_rail/` |
| D19 V en paysage | fait par R-114 ; place de « Se déconnecter » à arbitrer | `temp/r114_tile_norm/` |
| D20 Code du second appareil | Web ; déployer serveur + paquet iOS ; iPad | `temp/d18_auth/` 14/14 |
| D21 Rafraîchissement des vues | Web ; appareil | `temp/d18_refresh/` 33/33 |

## Améliorations

### 1. Reprise de séance et progression facultative

**Besoin.** Lorsqu'un utilisateur reprend une activité ou un programme déjà pratiqué, reprendre les paramètres de la **dernière exécution comparable** de cette activité / de cet exercice. La référence est la séance précédente, **pas la série précédente au sein de la séance actuelle**. **La progression est entièrement facultative : il est possible de reproduire exactement les valeurs précédentes, sans augmentation.**

**Règles attendues :**

- Conserver l'historique exact de la séance précédente, sans écraser ses valeurs.
- Proposer explicitement deux possibilités : **maintenir les valeurs de la séance précédente** ou **activer une progression personnalisée**. Le maintien ne doit déclencher aucune augmentation automatique.
- La progression doit pouvoir être **activée ou désactivée**, sans modifier l'historique et sans obliger l'utilisateur à augmenter quoi que ce soit.
- Permettre de configurer **ce qui progresse** : par exemple la charge, le nombre de répétitions, le nombre de séries, la durée, la distance ou un autre paramètre pertinent de l'activité.
- Permettre de configurer **de combien** ce paramètre progresse : valeur absolue ou pourcentage, selon le type de mesure et les possibilités réelles du module.
- **Uniquement si la progression est activée**, calculer à la séance suivante une proposition à partir de la dernière valeur comparable et du réglage de progression choisi. Exemple indicatif : charge précédente de 20 kg et incrément choisi de +2 kg → proposition de 22 kg. **Aucun incrément fixe de +10 n'est imposé.**
- Permettre d'accepter ou d'ajuster la proposition avant ou pendant la séance ; enregistrer les valeurs réellement réalisées pour établir la référence suivante.
- Tenir compte d'une éventuelle **période d'adaptation** : la progression peut être neutralisée, ralentie ou adaptée pendant cette période selon les réglages définis. Vérifier et réutiliser la fonctionnalité d'adaptation si elle existe déjà.
- Ne jamais supposer qu'une augmentation est souhaitée : **maintenir les valeurs reste une option à part entière** ; une diminution peut aussi être choisie lorsque l'objectif ou l'exécution le nécessite.

**Points à décider au moment de l'implémentation :** paramètres de progression effectivement pris en charge par chaque activité, niveaux de réglage (programme / exercice / utilisateur), arrondis et limites, critères déclenchant ou empêchant la hausse. Ne pas inventer de comportements par défaut sans validation.

### 2. Distinguer les modes d'exécution et les charges

**Besoin.** Un même exercice peut être pratiqué **unilatéralement** (un bras après l'autre) ou **bilatéralement** (les deux bras simultanément). La charge et parfois les autres mesures ne sont pas directement comparables entre ces variantes.

**Règles attendues :**

- Conserver le mode d'exécution pour chaque séance / exercice.
- Distinguer clairement la **charge par bras / par côté** de la **charge totale**, sans conversion automatique ambiguë.
- Comparer les séances et calculer la progression à mode d'exécution comparable, ou demander une validation explicite en cas de changement de mode.
- Permettre de changer de mode sans perdre l'historique de l'exercice ; ne pas confondre un changement de mode avec un progrès ou une régression de charge.
- Réutiliser les outils et réglages existants d'atome/eVe plutôt que créer une interface parallèle.

### 3. Vérifications fonctionnelles à effectuer

- **Progression désactivée** : la séance suivante reprend les valeurs précédentes sans les augmenter.
- **Progression activée** : une séance avec charge de référence et incrément personnalisé propose la bonne valeur à la prochaine exécution.
- Désactiver puis réactiver la progression ne modifie pas l'historique des séances.
- Un changement du paramètre ciblé (charge plutôt que répétitions, par exemple) modifie uniquement la mesure sélectionnée.
- Les valeurs réellement effectuées deviennent la nouvelle référence, sans modifier les séances passées.
- Les variantes unilatérale et bilatérale conservent leurs références propres.
- La période d'adaptation, si activée, est respectée.
- Un exercice non effectué lors de la dernière séance ne reçoit pas une progression déduite arbitrairement d'un autre exercice.

### 4. Musique — maintenir la lecture en multitâche

**Besoin validé.** Une musique lancée depuis le module Musique (notamment via Apple Music) doit continuer sans interruption lorsque l'utilisateur change de page ou utilise un autre outil d'atome/eVe. La lecture ne doit pas être liée au fait que la vue Musique reste affichée.

**Comportement attendu :**

- Préserver la lecture en cours et sa position lorsque l'utilisateur navigue dans atome/eVe, change de module ou revient dans Musique.
- Garder l'état du lecteur cohérent (piste, lecture/pause, progression) lors du retour au module Musique, sans relancer inutilement le morceau.
- Vérifier également la continuité lorsque l'application passe en arrière-plan ou lorsque l'utilisateur utilise une autre application, **dans les limites des mécanismes audio du système et des droits/API réellement disponibles pour Apple Music**. Ne pas présumer que toutes les plateformes autorisent le même comportement.
- Réutiliser le lecteur, les outils et les connexions existants ; ne pas introduire un second moteur audio par défaut.

**Tests de validation à effectuer :**

- Démarrer un morceau Apple Music puis passer à une autre page et à plusieurs outils d'atome/eVe : la lecture et le son se poursuivent.
- Revenir dans Musique : retrouver le même morceau, la bonne position et les commandes synchronisées.
- Tester pause/reprise et changement de morceau avant et après un changement de page, sans lectures concurrentes ni redémarrage intempestif.
- Tester le passage en arrière-plan et le retour au premier plan sur les plateformes concernées ; documenter toute restriction de plateforme ou d'API observée.

### 5. Musique — bouton de lecture aléatoire

**Besoin validé.** Ajouter à l'outil de lecture Musique un bouton explicite **« Aléatoire »**, permettant de lire les morceaux d'une liste ou d'une sélection dans un ordre mélangé.

**Comportement attendu :**

- L'activation du bouton applique la lecture aléatoire à la file/liste de morceaux concernée ; sa désactivation rétablit le comportement de lecture normal, selon l'ordre de la liste.
- Le bouton reflète son état actif ou inactif sans ajouter un panneau de paramètres parallèle.
- Préserver la compatibilité avec les listes et la lecture Apple Music, **sous réserve des possibilités réelles de l'intégration existante**.
- Ne pas modifier ni réordonner définitivement les listes enregistrées : seul l'ordre de lecture doit changer.

**Tests de validation à effectuer :**

- Activer l'aléatoire dans une liste comportant plusieurs morceaux : vérifier que l'ordre de lecture peut différer de l'ordre de la liste, sans dupliquer ou ignorer indûment des morceaux.
- Désactiver l'aléatoire : vérifier le retour au fonctionnement normal de la lecture.
- Changer de page pendant la lecture aléatoire, revenir au lecteur et vérifier que le mode choisi est conservé pendant la session et reste visible.
- Tester le bouton avec les listes et morceaux accessibles via l'intégration Apple Music ; identifier les éventuelles limitations de l'API sans prétendre qu'elles sont résolues.

### 6. Moniteur eVe — synchronisation des activités sportives iPhone et Android

**Fonctionnalité à ajouter — 3 novembre 2026.** **Ajouter dans atome/eVe la synchronisation des activités sportives de l’iPhone et d’Android avec le moniteur d’eVe**, afin que les séances et mesures autorisées soient effectivement récupérées et affichées dans eVe, même lorsque l’activité a été enregistrée par une autre application. L’accès aux données nécessite le consentement de l’utilisateur.

**Intégrations à réaliser et compatibilité à vérifier :**

- **iPhone :** utiliser si possible **Apple Santé / HealthKit**, via les autorisations et mécanismes natifs disponibles sur iOS, pour lire les séances et mesures compatibles.
- **Android :** utiliser si possible **Health Connect**, qui centralise des données de santé et d’activité provenant d’applications compatibles. Vérifier les versions Android prises en charge et les types de données effectivement accessibles.
- Réutiliser les éventuelles intégrations natives, composants et connexions déjà présents dans atome/eVe ; ne pas présumer qu’une API de lecture est déjà implémentée ou que toutes les mesures sont disponibles sur tous les appareils.

**Comportements attendus :**

- Proposer une **connexion volontaire** à la source de données disponible, avec des **autorisations précises par catégorie** et la possibilité de les retirer. Une absence de permission ne doit pas bloquer les autres fonctions d’eVe.
- Synchroniser les **séances et données sportives réellement disponibles et autorisées** : type d’activité, horaires, durée, distance, pas, fréquence cardiaque, calories actives et autres indicateurs pertinents selon les sources. Ne pas inventer de valeurs absentes.
- Faire apparaître les activités importées et leurs indicateurs dans le **moniteur d’eVe**, en cohérence avec l’historique et les outils Sport existants ; distinguer les données collectées par atome des données importées.
- Ajouter l’import de l’**historique autorisé**, puis une **synchronisation incrémentale**, selon les contraintes des plateformes. Ne pas promettre du temps réel si la source ne le permet pas ; afficher la dernière date de synchronisation si nécessaire.
- Préserver la **provenance**, les unités et les horodatages ; éviter les doublons lorsqu’une même séance est issue de plusieurs sources ou synchronisée plusieurs fois.
- Permettre de **déconnecter** la source et gérer les données déjà importées selon un comportement à définir et à soumettre à validation ; éviter tout transfert de données de santé non nécessaire ou non autorisé.
- Garder l’interface **modulaire et minimaliste**, réutiliser le moniteur d’eVe et les outils existants plutôt que créer un tableau de bord parallèle.

**Tests à réaliser lors de l’implémentation :**

- iPhone : autoriser l’accès à un jeu de données sportives connu dans Apple Santé ; vérifier sa récupération et son affichage exact dans eVe.
- Android : effectuer le même parcours avec Health Connect et une application ayant enregistré une activité compatible.
- Vérifier la synchronisation initiale, les ajouts ultérieurs, la reprise après fermeture/reconnexion et l’absence de doublons.
- Vérifier la concordance des dates, distances, pas, durées et fréquences cardiaques avec les données sources, seulement lorsque ces mesures sont présentes.
- Refuser puis révoquer certaines autorisations ; vérifier qu’aucun accès non autorisé n’a lieu, sans perturber les activités propres à atome/eVe.
- Vérifier le comportement hors ligne, les appareils ou versions non compatibles, les données absentes et les activités provenant de sources multiples.

**Statut :** **fonctionnalité à implémenter** (et non simple piste à envisager) ; compatibilité à auditer dans le projet, intégration non développée et tests non réalisés.

### 7. Assistant eVe — désactivé par défaut (priorité critique)

**Statut : À réaliser. Priorité : critique.**

**Objectif :** éviter toute consommation de tokens non sollicitée et permettre l’utilisation d’atome/eVe sans dépendre de l’intelligence artificielle.

**Comportements attendus :**

- **OFF par défaut :** au premier lancement, l’assistant IA est désactivé pour tout nouvel utilisateur.
- **Préférence dans les réglages :** proposer un réglage explicite pour activer ou désactiver l’assistant ; conserver le choix de l’utilisateur.
- **Aucun appel IA automatique en mode OFF :** ni au démarrage, ni pendant la navigation, ni en arrière-plan. Ne pas déclencher de consommation de tokens sans demande explicite.
- **Activation ponctuelle à la demande :** permettre de solliciter l’assistant pour une action sans basculer durablement la préférence sur ON.
- **Retour à OFF :** une fois l’intervention ponctuelle terminée, l’état reste OFF, sauf si l’utilisateur a choisi volontairement une activation durable dans les réglages.
- **Fonctionnement sans IA :** les modules et outils classiques d’atome/eVe restent utilisables lorsque l’assistant est OFF.
- **Interface conservée :** la présence de l’outil ou de l’interface eVe ne vaut pas activation du moteur IA ; ne pas confondre affichage de l’assistant et exécution d’appels IA.
- Réutiliser les réglages, l’orchestration et les composants existants d’atome/eVe ; vérifier leur fonctionnement réel avant l’implémentation.

**Tests de validation obligatoires :**

- Installer ou lancer atome/eVe avec un nouveau profil : vérifier que la préférence initiale est **OFF**.
- Contrôler les appels aux fournisseurs IA au démarrage, pendant la navigation et en arrière-plan : **aucune requête automatique** en mode OFF.
- Solliciter explicitement eVe une fois : vérifier qu’une demande autorisée fonctionne et que le mode revient à OFF après l’intervention.
- Activer puis désactiver volontairement l’assistant dans les réglages : vérifier la prise en compte et la persistance du choix.
- Vérifier que les fonctions sans IA restent utilisables et qu’aucune activation intempestive n’est déclenchée par un changement de module ou une relance.
- Confirmer par les traces et compteurs disponibles que les tokens ne sont consommés que lors des interventions IA réellement demandées.

### 8. Elastic Design — grille universelle et composition adaptative

**Statut : À réaliser.**  
**Portée :** toute l'interface d'**atome/eVe**, sans exception de contexte : dashboard, projets, modules, panneaux et outils.

**Principe non négociable — une seule grille pour tout l'écran :**

- À tout instant, l'écran est organisé par **une seule grille / matrice commune**, comme un tableau continu dans lequel viennent se greffer les outils et modules existants.
- Les outils, zones supérieures, panneaux déployés et espaces vides partagent les **mêmes lignes, colonnes, positions et espacements de référence**. Un panneau ne doit jamais générer une grille locale indépendante qui désaligne son contenu.
- La grille reste unique en **portrait comme en paysage**, sur le dashboard comme dans les projets et les autres contextes. Ouvrir, fermer ou changer de module ne doit pas rompre l'alignement.
- Il est interdit de compenser les décalages par un positionnement arbitraire hors de la matrice. Préserver les vrais composants et outils d'atome/eVe, notamment leurs options natives.

**Unités modulaires et espaces invisibles :**

- Utiliser comme base de composition la cellule **60 × 60 pixels de référence** ; les grandes tuiles occupent notamment **120 × 120** (2 × 2 cellules). Les autres assemblages doivent occuper des cellules entières de cette même grille.
- Les cellules **inoccupées** font partie du tableau : l'espace libre est construit comme des rangées ou colonnes de tuiles invisibles, jamais comme une marge arbitraire qui déplace les autres éléments hors de la grille.
- Sur le **dashboard d'accueil**, placer date, météo et événements dans la zone supérieure, puis ménager entre cette zone et les tuiles inférieures **une ou plusieurs rangées vides entières**, de hauteur unitaire 60. Leur nombre peut évoluer selon l'espace disponible, sans altérer la matrice.

**Comportement « Elastic Design » :**

- **Privilégier une composition 4:3**, adaptée à l'orientation portrait ou paysage, aussi longtemps que la surface disponible le permet.
- Lorsque l'écran est plus contraint, **compacter la disposition** en réduisant d'abord les rangées/colonnes vides modulaires, puis en réorganisant les outils dans les cellules disponibles, sans désalignement.
- Lorsque la surface augmente (par exemple sur **iPad**), **afficher davantage de tuiles et d'outils utiles**, notamment au-delà de 12 si la place le permet ; exploiter les cellules supplémentaires plutôt que simplement agrandir artificiellement les mêmes tuiles.
- Si l'espace disponible le justifie, accepter une **exception au 4:3** : élargir/étendre la composition ou espacer certains groupes afin d'obtenir un résultat plus équilibré. Ces espacements demeurent toujours des multiples de la cellule de base et ne rompent jamais la grille commune.
- **Hiérarchie des règles :** le **4:3 est une préférence de composition** ; l'**alignement sur la grille unique est impératif**, même dans les exceptions au 4:3.
- Ne pas confondre cette adaptation avec un simple redimensionnement proportionnel : l'élasticité concerne le **nombre, l'agencement et les espacements** des modules dans une matrice partagée.

**Étape obligatoire avant réalisation — mock-ups :**

- Produire plusieurs **maquettes visuelles** qui montrent explicitement les cellules occupées, les rangées invisibles et les repères de la **même grille globale** ; valider leur conformité avant d'implémenter la fonctionnalité.
- Montrer au minimum : **iPhone portrait**, **iPhone paysage**, **iPad portrait**, **iPad paysage**, une **variante hors 4:3** mais toujours alignée, et des **panneaux ouverts** dont les outils internes sont calés sur ceux du bas.
- Montrer pour ces exemples plusieurs densités d'outils, dont une disposition compacte et une disposition qui ajoute des tuiles sur un écran plus vaste, tout en respectant les références visuelles et composants déjà fournis pour atome/eVe.

**Tests de validation :**

- Superposer une grille de référence à chaque mock-up puis aux écrans réalisés : **toutes les limites des tuiles, outils et panneaux doivent tomber sur les lignes communes** ; aucun second système de coordonnées indépendant.
- Vérifier les bascules **portrait ⇄ paysage**, les différents formats d'iPhone/iPad et la variation du nombre d'outils visibles.
- Vérifier que le dashboard conserve sa **zone supérieure** et des **rangées vides entières** dans les configurations prévues.
- Ouvrir et fermer des panneaux dans **dashboard, projets et modules** : contrôler le calage des outils internes sur ceux du bas, en cohérence avec le débogage **D5**.
- Vérifier les cas **4:3** et **exception hors 4:3** : dans les deux cas, la grille reste unique et les composants existants conservent leur apparence et leur fonctionnement.

**Résultat attendu :** une interface qui s'étend, se compacte et réorganise intelligemment ses outils en fonction de la surface disponible, **sans jamais sortir de la matrice universelle**.

### 9. Préférences visuelles — thème centralisé et réglages des tuiles

**Statut : À réaliser.**  
**Portée :** préférences visuelles d’atome/eVe ; tuiles du dashboard, outils, menus et panneaux qui partagent les mêmes propriétés visuelles.

**Réglages à ajouter dans les préférences visuelles :**

- **Opacité :** un curseur pour régler la transparence des fonds de dalles/tuiles.
- **Arrondi des angles (border radius) :** un curseur pour ajuster les coins des tuiles, et des éléments concernés utilisant ce même style.
- **Flou d’arrière-plan (background blur) :** un curseur pour doser le flou appliqué derrière les surfaces concernées.
- **Taille de base des caractères :** un curseur pour ajuster la taille générale des textes en préservant les différences relatives entre typographies, la lisibilité et l’alignement des outils.
- **Couleurs des fonds :** un choix par **palette de couleurs standard**, et non un curseur imposé. Identifier au préalable combien de couleurs de fond distinctes sont réellement utilisées par les composants existants. Si une seule couleur est employée, permettre de modifier sa teinte ; si plusieurs couleurs sont utilisées, afficher séparément **toutes les couleurs réellement présentes** (quatre ou cinq uniquement si c’est le nombre constaté), chacune étant sélectionnable et éditable par la palette.

**Comportement commun et règles de conception :**

- **Centraliser** ces propriétés dans les réglages visuels et dans le système de thème existant, s’il existe ; ne pas créer un second mécanisme ou une interface de réglages parallèle pour les panneaux.
- Appliquer chaque changement aux **composants réellement concernés** : outils, tuiles du dashboard, menus — y compris le menu évoqué dans la demande — et panneaux, afin de conserver un thème cohérent d’un contexte à l’autre.
- **Réutiliser les composants et paramètres existants** après inspection de l’implémentation : ne pas supposer le nombre de couleurs, les mécanismes de flou ni la structure du thème sans vérification.
- Rendre les modifications visibles lors du réglage et **conserver les préférences** après changement de page et redémarrage.
- Respecter l’**Elastic Design** : les réglages visuels ne doivent ni déplacer les outils hors de la **grille unique**, ni perturber le calage entre panneaux et tuiles ; anticiper les textes longs et les tailles de caractères élevées.
- Préserver l’apparence par défaut de l’interface tant que l’utilisateur n’a pas choisi de personnalisation.

**Tests de validation :**

1. Vérifier séparément les quatre curseurs, leurs bornes fonctionnelles et leurs effets visuels réels.
2. Inspecter les couleurs actuellement utilisées, puis confirmer que les couleurs disponibles dans les préférences correspondent exactement à celles du thème réellement appliqué.
3. Modifier chaque couleur via le sélecteur standard ; contrôler l’effet sur les composants concernés, sans changer involontairement les autres couleurs.
4. Vérifier la cohérence du thème entre dashboard, projets, outils, menus et panneaux ouverts.
5. Vérifier la persistance des réglages après navigation et relance de l’application.
6. Contrôler l’alignement sur la **grille universelle** et la lisibilité en portrait/paysage, sur petits et grands écrans, en particulier après changement de taille des caractères.

**Résultat attendu :** des préférences visuelles **centralisées, cohérentes et réellement paramétrables**, permettant de personnaliser le thème de l’ensemble de l’interface sans dégrader la grille modulaire.

### 10. Gestes directionnels — rotation des tuiles, navigation et outil central

**Statut : À réaliser / À corriger.**  
**Portée :** dashboard, tuiles à retournement, menu mystique, navigation entre panneaux et outil central d’atome/eVe. Il s’agit de faire évoluer les interactions réellement présentes, sans ajouter de commandes ou de composants fictifs.

**A. Rotation des tuiles selon le geste :**

- Lorsqu’un utilisateur effectue un **glissement** sur une tuile pour révéler un autre contenu, **toutes les tuiles concernées se retournent dans le sens du geste**, avec une animation directionnelle cohérente : droite vers gauche → rotation de droite vers gauche ; gauche vers droite → rotation de gauche vers droite ; haut vers bas → rotation vers le bas ; bas vers haut → rotation vers le haut.
- Supprimer les orientations aléatoires ou incohérentes entre tuiles pour un même glissement ; conserver la synchronisation et la fluidité des transitions.
- Lors d’un **clic / tap**, conserver une logique **distincte du glissement** : l’animation se propage **vers l’extérieur à partir du point de contact**. Les tuiles situées au-dessus se retournent vers le haut, celles du dessous vers le bas, celles de gauche vers la gauche et celles de droite vers la droite. Définir les cas sur le même axe ou au point de contact à partir du comportement visuel existant, puis les vérifier dans la maquette, sans introduire d’aléatoire.
- Appliquer également la **propagation directionnelle au clic** dans le **menu mystique**, en réutilisant les animations et les véritables outils existants.

**B. Navigation entre les panneaux — sens à challenger puis corriger si confirmé :**

- **Constat rapporté :** depuis le dashboard principal, glisser vers la gauche sur une tuile ne mène pas au panneau suivant ; l’utilisateur doit glisser vers la droite, ce qui donne une impression de navigation inversée.
- **Hypothèse à comparer :** glissement vers la **gauche = panneau suivant** ; glissement vers la **droite = panneau précédent**, comme dans de nombreuses navigations tactiles horizontales.
- **Ne pas inverser automatiquement le comportement avant vérification** : inspecter le sens de navigation réel, les panneaux et leur ordre ; produire un prototype comparant les deux conventions et retenir celle qui est la plus cohérente avec la logique propre à atome/eVe, après validation.
- Une fois le sens retenu, garantir que geste, déplacement/animation du panneau et résultat de navigation racontent **le même mouvement**. Contrôler les gestes depuis le premier panneau et aux extrémités de navigation, sans transition involontaire.

**B bis. Distinguer le clic simple du glissement de navigation annulé :**

- **Clic simple :** si l’utilisateur touche une tuile et relâche le doigt **sans déplacement significatif**, déclencher normalement l’action de cette tuile.
- **Glissement validé :** si l’utilisateur glisse pour afficher un dashboard précédent ou suivant puis relâche le doigt sur cet autre dashboard, valider uniquement la navigation prévue, sans activer par erreur la tuile sous le doigt.
- **Glissement aller-retour annulé :** si, **sans lever le doigt**, l’utilisateur quitte le dashboard d’origine par un glissement, revient sur ce même dashboard en inversant le mouvement, puis relâche le doigt, **ne déclencher aucune action**, ni clic sur une tuile ni navigation supplémentaire. Conserver le dashboard initial.
- **Critère décisif : l’historique du geste.** Même si le doigt finit exactement à son point de départ, un mouvement de navigation déjà reconnu ne redevient **jamais un clic** au relâchement. Le retour à la position initiale annule la navigation, pas la qualification du geste comme glissement.
- Appliquer cette règle dans les deux directions et après un aller-retour traversant éventuellement plusieurs dashboards, en réutilisant le système de gestes réel d’atome/eVe et en évitant tout déclenchement en double.

**C. Outil central — accès directionnel aux quatre actions :**

- **Glisser vers le haut :** conserver l’accès à la **fermeture de session**.
- **Glisser vers le bas :** conserver l’accès aux **réglages**.
- **Glisser vers la gauche :** conserver l’accès au **changement de profil**.
- **Glisser vers la droite :** ajouter le **changement cyclique de vue du dashboard** (modes d’affichage), en s’appuyant sur les modes réellement disponibles, notamment **F basic** et **F pro**, puis sur les futurs modes s’ils sont effectivement ajoutés. Ne pas figer le nombre de vues ni créer des vues inexistantes.
- **Clic / tap sur l’outil central :** présenter **les quatre possibilités autour du centre**, avec leur position fonctionnelle : fermeture de session en haut, réglages en bas, profils à gauche, vues à droite. Préserver l’identité visuelle et les outils natifs du menu central ; ne pas créer un menu conventionnel indépendant.
- Les transitions déclenchées au clic suivent la **propagation depuis le point de contact** décrite ci-dessus ; les glissements conservent le lien entre direction du geste et action.

**Étape obligatoire avant réalisation — mock-ups et prototypes :**

1. Montrer, avec les tuiles et outils **réels** d’atome/eVe, les quatre directions de glissement et le retournement correspondant de toutes les tuiles concernées.
2. Montrer un clic sur une tuile puis dans le menu mystique, avec une propagation **radiale/directionnelle** des retournements autour du point touché.
3. Comparer les deux conventions possibles de navigation entre panneaux, avec animation et sens de déplacement explicites ; **soumettre le sens final à validation** avant de modifier ce comportement.
4. Montrer l’outil central en état normal, les quatre gestes directionnels, puis son ouverture par clic avec **haut = session, bas = réglages, gauche = profils, droite = vues**.
5. Vérifier la cohérence géométrique avec l’**Elastic Design** : grille unique, pas de décalage lors des animations ou de l’ouverture du menu, en portrait et paysage sur iPhone et iPad.

**Tests de validation à exécuter :**

- Effectuer les quatre glissements sur les tuiles et observer que leurs animations suivent **toutes** la direction voulue, sans inversion ni hasard.
- Effectuer des taps à différents emplacements ; vérifier le sens de propagation des tuiles, puis du menu mystique, à partir du point touché.
- Parcourir les panneaux dans les deux sens après validation du sens choisi ; vérifier la cohérence des gestes et du déplacement effectif ainsi que les limites de navigation.
- **Tester trois scénarios distincts sur une même tuile :** (1) toucher sans glisser puis relâcher → action de la tuile exécutée ; (2) glisser jusqu’au dashboard voisin puis relâcher → navigation validée, aucune action de tuile ; (3) glisser jusqu’au voisin, revenir au dashboard d’origine **sans lever le doigt**, puis relâcher → aucune action et maintien du dashboard initial. Répéter en inversant les directions et en revenant exactement au point de départ.
- Vérifier sur appareil les quatre gestes de l’outil central : session, réglages, profils, cycle des vues existantes ; tester le clic montrant les quatre actions et le retour à l’état normal.
- Vérifier l’absence de conflit entre un tap et un glissement, la disponibilité des outils natifs, la fluidité des animations et le respect de la grille dans les deux orientations.

**Résultat attendu :** des animations dont le sens découle clairement du geste ou du point touché ; une navigation de panneaux intuitive dont le sens a été validé ; un outil central à quatre directions permettant d’accéder aux profils et vues sans perdre les fonctions existantes.

**État :** demande validée et documentée ; mock-ups, comparaison du sens de navigation, implémentation et tests réels à effectuer.


### 11. HTML et JavaScript embarqué — prévisualisation isolée et conversion graphique vers atome

**Statut : Recherche / vérification à effectuer ultérieurement.**  
**Nature :** audit d'une fonctionnalité supposée déjà prévue ou partiellement intégrée ; ne pas réimplémenter avant d'avoir établi précisément ce qui existe.

**Objectif 1 — Prévisualisation HTML avec JavaScript :**

- Vérifier qu'un **fichier HTML**, local ou importé, peut être ouvert et prévisualisé **avec son rendu graphique d'origine** et, lorsqu'il comporte du **JavaScript embarqué**, que ce JavaScript est réellement interprété et exécuté dans l'environnement de prévisualisation.
- Vérifier la présence d'un **bac à sable isolé** pour ce rendu : le document peut fonctionner et interagir dans son propre contexte sans accéder librement aux données, aux outils natifs, à la session, au stockage ni aux privilèges d'atome/eVe. Tester la séparation des origines, les ressources, les accès réseau et les permissions pertinentes.
- Contrôler le fonctionnement avec un HTML simple sans script, un HTML avec scripts interactifs, puis une page plus complexe avec CSS et ressources. Identifier clairement les limites et les éventuels refus de chargement, sans présenter une page blanche comme un aperçu valide.
- Distinguer une **prévisualisation exécutable de page Web** de l'**import documentaire HTML** : convertir des titres et paragraphes en texte atome tout en éliminant le JavaScript ne suffit pas à répondre à cette demande.

**Objectif 2 — Conversion graphique du HTML au format natif atome :**

- Vérifier si une commande existante permet de **convertir l'apparence graphique d'un fichier HTML** en véritables objets/modules atome, structurés et éditables, plutôt que d'afficher seulement une image, un iframe ou le texte du document.
- Examiner la fidélité des positions, dimensions, typographies, couleurs, fonds, bordures, images, styles et mises en page ; établir une correspondance avec les capacités réelles de rendu, de composition et d'édition d'atome/eVe.
- Définir explicitement ce qui est convertissable (visuel et structure) et ce qui ne l'est pas, notamment les comportements JavaScript, événements dynamiques, formulaires, contenus embarqués et dépendances externes. Ne jamais prétendre qu'un script reste fonctionnel si la conversion ne le prend pas en charge.
- Rechercher les points d'entrée réellement présents et leurs éventuelles intégrations dans l'outil Web, l'import de médias/documents et le projet, **sans créer de mécanisme parallèle** ni contourner les règles de rendu Bevy/WebGPU.

**Vérification et livrables attendus :**

1. Localiser le code, les commandes, l'accès utilisateur et les tests existants pour chacun des deux parcours (**prévisualiser** / **convertir**).
2. Tester les deux parcours de bout en bout sur l'application réelle, avec au minimum un HTML+CSS statique et un HTML+JavaScript interactif ; noter les résultats séparément sur Web et, si disponibles, sur iOS et Tauri/macOS.
3. Produire un comparatif **HTML original / aperçu isolé / objets atome convertis**, avec captures, éléments manquants, comportement des scripts et limitations de sécurité.
4. Classer chaque fonction **opérationnelle, partielle, absente ou à corriger**, avec les fichiers concernés, les preuves et les corrections éventuelles à prévoir ; ne développer qu'après constat et validation si une évolution d'interface est nécessaire.

**Résultat attendu :** savoir sans ambiguïté si les fichiers HTML peuvent **fonctionner en prévisualisation isolée avec leur JavaScript**, et si leur **présentation graphique peut être transformée en objets atome natifs**. Les deux capacités doivent être évaluées séparément.

### 12. Roadmap et signalements — accès Codex/Claude, traitement et statut visible

**Statut : Recherche / vérification à effectuer ultérieurement.**  
**Nature :** contrôle complet d'une chaîne de retour utilisateur supposée déjà implémentée, et de sa disponibilité réelle pour les outils de développement utilisés sur le Mac.

**Objectif :** permettre à un utilisateur de transmettre depuis les préférences d'atome/eVe soit une **demande d'amélioration / proposition pour la roadmap**, soit un **signalement de bug**, puis de suivre leur traitement sans perdre l'historique nécessaire.

**Points à vérifier :**

- **Saisie et consultation dans les préférences :** localiser les points d'entrée réels pour les demandes d'amélioration et les bugs ; vérifier qu'ils permettent de déposer, enregistrer, transmettre et retrouver les demandes. Ne pas confondre le seul formulaire de débogage avec une prise en charge complète des propositions de roadmap.
- **Stockage et accessibilité sur le Mac :** identifier le stockage canonique des demandes (fichiers de logs, documents, base ou service) et la manière dont **Codex et Claude** peuvent effectivement y accéder depuis l'environnement de développement sur le Mac. Vérifier droits, chemin, connexion, synchronisation et format lisible ; ne pas supposer que des fichiers présents sur un serveur sont automatiquement visibles dans le clone Git local.
- **Exploitation par les agents :** vérifier que Codex/Claude peuvent **lire chaque demande**, identifier son type et son identifiant, la prendre en charge, consulter le contexte disponible et travailler sur sa correction ou son étude, sans doublons ni perte d'information.
- **Suivi des statuts :** vérifier qu'après traitement et contrôle effectif du résultat, la demande peut être **marquée comme traitée / résolue dans la source de référence**, puis que ce statut et, si pertinent, la note de résolution sont visibles dans **la liste de l'utilisateur**. Le statut ne doit pas être mis à « traité » sur simple lecture ou tentative infructueuse.
- **Suppression par l'utilisateur :** s'assurer que l'utilisateur peut **effacer de sa liste** une demande traitée avec le mécanisme natif de suppression, sans supprimer accidentellement les journaux techniques ou l'historique de traitement que le système doit conserver. Vérifier ce comportement pour les bugs **et** les demandes de roadmap, ou noter explicitement la différence.
- **Sécurité et fiabilité :** vérifier la portée des données envoyées, le contrôle d'accès, les pièces jointes et les informations personnelles, ainsi que la gestion de l'envoi impossible, des doublons, des reprises et de la synchronisation multiappareils.

**Scénarios de contrôle à effectuer :**

1. Depuis les préférences, déposer **un signalement de bug** et **une proposition d'amélioration** ; relever leurs identifiants, leur stockage effectif et leur visibilité dans la liste.
2. Sur le Mac, ouvrir le même environnement que Codex et Claude ; prouver par lecture effective que **les deux types de demandes sont accessibles** aux agents (ou documenter précisément les limites et le chemin d'accès manquant).
3. Simuler ou effectuer un traitement réel, puis appliquer le **statut traité / résolu** par le mécanisme existant et vérifier qu'il se répercute correctement dans l'interface de l'utilisateur, avec sa note et sa date lorsque prévues.
4. Supprimer depuis l'interface une demande traitée ; vérifier que seul l'élément de la liste utilisateur disparaît, avec conservation des journaux requis et absence de suppression involontaire d'autres demandes.
5. Vérifier le parcours après fermeture/réouverture de l'application et en cas d'échec ou de retard de synchronisation.

**Livrable attendu :** un diagnostic explicite de chaque maillon (**dépôt → stockage → accès Mac/Codex/Claude → traitement → statut → suppression utilisateur**), avec code réel, tests, preuves et liste limitée des écarts à corriger. **Aucune nouvelle interface ni second gestionnaire de tickets ne doit être créé** tant que le fonctionnement existant n'a pas été audité.

**État de ces deux ajouts :** demandes rédigées et consignées pour vérification future ; ni audit de bout en bout, ni implémentation, ni validation sur le Mac de l'utilisateur n'est revendiqué ici.

### 13. Activités — hébergements, restauration et enrichissement des fiches

**Statut : À réaliser.**  
**Portée :** module Activités dans son ensemble, catégories touristiques, recherche et fiches détaillées des lieux ; utilisation contextuelle pour les stations thermales et les séjours.

**A. Ajouter la catégorie Hébergements :**

- Introduire **Hébergements** dans la taxonomie du module Activités, aux côtés des catégories déjà présentes, sans remplacer « Sorties » ni créer un module séparé.
- Couvrir notamment : **hôtels, chambres d'hôtes, maisons d'hôtes, gîtes, locations de vacances, meublés de tourisme, résidences de tourisme, appart'hôtels, campings** et les autres catégories pertinentes réellement disponibles dans les sources.
- Permettre de retrouver les hébergements **à proximité d'une station thermale, d'une cure ou d'une activité de bien-être**, avec recherche géographique, carte et outils existants pour préparer un séjour.
- Vérifier la taxonomie déjà en place et les filtres réellement disponibles avant de déterminer la présentation des catégories et sous-catégories.

**B. Rechercher les sources de données pour les hébergements et la restauration :**

- **Étudier et comparer** les sources pertinentes pour les hébergements et pour **Restaurants & Gastronomie**, catégorie existante à enrichir et non à dupliquer : DATAtourisme, OpenStreetMap, bases touristiques institutionnelles et données ouvertes locales.
- Étudier les fournisseurs d'**avis et de notes** (par exemple Google Places, Tripadvisor et autres sources pertinentes), en vérifiant précisément leurs API, coûts, licences, règles d'affichage, restrictions de stockage et de réutilisation. Ne pas présumer que tous les avis sont accessibles ou librement réutilisables.
- Évaluer, pour chaque source : couverture géographique, fiabilité, actualisation, qualité des descriptions, médias, coordonnées, équipements, tarifs, horaires, disponibilité des avis et possibilité de relier les établissements aux lieux thermaux.
- Identifier les doublons éventuels entre fournisseurs et réutiliser les mécanismes de recherche, d'enrichissement et de fusion de données déjà présents dans atome/eVe.

**C. Enrichir les fiches de toutes les catégories Activités :**

- Lorsqu'un utilisateur ouvre la fiche d'un lieu, **afficher le maximum d'informations pertinentes réellement disponibles**, et pas seulement un aperçu limité. Cette règle s'applique notamment au patrimoine, aux musées, à la nature, aux sorties, à la restauration, aux hébergements et au bien-être.
- Selon le type de lieu et les données disponibles, exploiter : **description complète, histoire, particularités, photos/vidéos, adresse, position sur la carte, itinéraire, horaires, périodes d'ouverture, tarifs, conditions d'accès, réservation, équipements, services, accessibilité, site officiel, téléphone et contacts**.
- Afficher, lorsqu'ils sont disponibles et autorisés : **note moyenne, nombre d'avis et avis associés**, avec provenance explicite et respect des conditions des fournisseurs.
- Mettre en relation les fiches pertinentes : **station thermale ↔ hébergements proches ↔ restaurants et activités voisines**, sans inventer d'associations ni de disponibilités.
- **Ne pas inventer de données et ne pas afficher de champs vides** ; conserver une présentation adaptée au contenu et progressive si le volume d'informations est important.

**D. Intégration et validation :**

- Réutiliser les véritables outils, composants, cartes, sources et parcours d'atome/eVe ; **ne pas créer un répertoire touristique parallèle**. Un établissement doit garder une fiche cohérente entre ses différents points d'accès.
- Respecter la **grille universelle de l'Elastic Design**, les dispositions existantes et les deux orientations.
- **Avant toute modification visuelle, réaliser des mock-ups** basés sur les composants réels pour au moins : une fiche de patrimoine, un restaurant, un hôtel et une station thermale. Montrer l'accès aux détails supplémentaires et aux établissements associés.
- Tester le parcours complet : rechercher un hébergement près d'une station thermale ; ouvrir des fiches de restaurant, d'hôtel, de sortie et de patrimoine ; vérifier la quantité, la justesse, la provenance et l'actualisation des informations réellement affichées ; contrôler les cas sans données ou sans avis.

**Résultat attendu :** depuis Activités, l'utilisateur peut découvrir un lieu, consulter une fiche nettement plus complète avec les données et avis légalement accessibles, puis préparer une visite, un repas ou un séjour, notamment autour d'une station thermale.

**État :** demande validée et documentée ; audit des sources et composants existants, mock-ups, intégration et tests à effectuer ultérieurement.

### 14. Activités — audit et réorganisation de la taxonomie

**Statut : À réaliser.**  
**Portée :** taxonomie, catégories, sous-catégories, tuiles et parcours de navigation dans le module Activités ; recherche des cas équivalents ailleurs dans atome/eVe.

**Objectif :** supprimer les imbrications redondantes, doublons structurels, mauvaises associations de catégories et niveaux de navigation inutiles, sans perdre les contenus ni perturber les outils existants.

**Anomalies constatées à investiguer :**

- Une **tuile « Activités » dans la rubrique « Activités »**, constituant un niveau redondant.
- Une **tuile « Sport » dans la rubrique « Sport »**, constituant le même type de redondance.
- Une **tuile « Bien-être » dans la rubrique « Loisirs »**, alors que Bien-être doit être classé et accessible de manière cohérente dans la taxonomie ; vérifier la catégorie native et les liens contextuels existants avant toute réorganisation.

**Travail demandé :**

1. **Auditer la taxonomie réelle** dans les données, définitions, composants, outils, liens et routes existants, en commençant par le module Activités ; ne pas supposer que l'intitulé d'une tuile représente nécessairement une catégorie distincte.
2. **Chercher systématiquement tous les autres cas similaires** : catégorie imbriquée sous elle-même, doublon de tuile ou de catégorie, catégorie rangée au mauvais endroit, référence circulaire, sous-catégorie redondante, écran intermédiaire inutile, lien invalide et chemin incohérent.
3. Produire une **cartographie avant/après des catégories existantes**, avec justification des déplacements, fusions ou suppressions de niveaux et préservation des véritables outils et activités.
4. **Corriger la hiérarchie** sans supprimer les données et sans créer de taxonomie parallèle ; préserver notamment l'accès aux sports, sorties, loisirs, bien-être, hébergements et restauration, ainsi que les accès contextuels pertinents.
5. **Conserver les identifiants, associations, favoris, recherches et liens existants** autant que possible ; prévoir une adaptation contrôlée des références si des catégories sont déplacées, afin d'éviter les fiches orphelines ou les doublons.
6. **Tester chaque catégorie et sous-catégorie** : ouverture, contenu, navigation aller/retour, recherche globale et filtres, accès aux fiches et comportement en portrait/paysage ; contrôler les entrées depuis plusieurs chemins lorsque c'est pertinent.
7. **Ne déclarer la tâche achevée qu'après inventaire complet et tests en application réelle**, conformément à la règle générale de validation en tête du document. Documenter tous les autres cas similaires identifiés et leur résolution.

**Résultat attendu :** une taxonomie cohérente, sans rubriques auto-imbriquées ni détours inutiles, qui conserve tous les contenus et permet d'atteindre chaque catégorie à l'emplacement attendu.

### 15. AUv3 — ajouter le mode instrument sans perdre l'effet MIDI

**Statut : À réaliser — amélioration fonctionnelle.**  
**Portée :** extension AUv3 iOS d'atome/eVe, ses déclarations de composants, son moteur audio/instrument et son traitement MIDI.

**Constat et objectif :** l'extension est actuellement utilisée comme **effet MIDI**. Elle doit aussi pouvoir être sélectionnée **comme instrument AUv3** dans les hôtes compatibles, tout en conservant son rôle existant. Ne pas confondre effet MIDI, effet audio et instrument : vérifier les types de composants AUv3 réellement déclarés et pris en charge par le projet et les hôtes.

**Travail attendu :**

1. Auditer les cibles, extensions et types de composants déjà présents, ainsi que le moteur audio et le routage des événements MIDI.
2. Déclarer/exposer, si nécessaire, un **composant instrument distinct**, partageant le code et le moteur existants plutôt que créant une application ou une chaîne audio parallèle.
3. Permettre le chargement sur une piste instrument, la **réception MIDI**, la **génération d'audio** et la sortie audio correcte vers l'hôte ; réutiliser les véritables instruments et réglages d'atome/eVe.
4. Préserver l'instance d'effet MIDI, son traitement et ses possibilités de routage actuels. Documenter les différences imposées par les catégories de composants et les capacités des hôtes.
5. Vérifier les exigences d'initialisation, de sandbox, de cycle de vie, de session audio et de ressources AUv3 ; ne pas rendre l'instrument dépendant de services ou connexions non nécessaires.

**Tests obligatoires :** vérifier la découverte des **deux types** dans plusieurs hôtes compatibles, leur chargement, le MIDI entrant/sortant lorsque pertinent, le son produit par l'instrument, le comportement de l'effet MIDI existant, l'arrêt/redémarrage du transport, la sauvegarde/reprise des projets et l'absence de régression.

**État :** besoin validé et documenté ; implémentation et tests réels non effectués.

## Débogages / régressions

### D1. Appels entrants — bouton « Décrocher » absent

**Constat rapporté.** L'interface signale un appel audio ou vidéo entrant, mais ne propose pas de commande explicite permettant de décrocher.

**Correction attendue.** Ajouter à la notification d'appel entrant un bouton identifiable **« Décrocher »**. Son activation doit **accepter effectivement l'appel** et **ouvrir l'interface de communication appropriée** (audio ou vidéo) ; il ne suffit pas de masquer la notification ou d'afficher un écran sans connexion.

**Tests de validation à exécuter lors du débogage :**

- Déclencher un appel audio entrant ; vérifier la présence du bouton, le décrochage effectif et l'ouverture de l'interface audio.
- Déclencher un appel vidéo entrant ; vérifier le même parcours, puis la disponibilité de l'image et du son dans la communication.
- Vérifier que le clic sur « Décrocher » provoque réellement le changement d'état de l'appel (appel accepté/établi), sans rester bloqué sur la notification.
- Vérifier les deux sens de communication audio, ainsi que l'activation et l'affichage de la vidéo lorsqu'elle est attendue ; relever toute absence ou tout retard de média.

### D2. Appels et événements vidéo — prévisualisation non visible

**Constat rapporté.** La prévisualisation vidéo ne s'ouvre pas correctement au-dessus de la fenêtre active : l'utilisateur n'a pas accès à l'image, même lorsqu'une vidéo est attendue.

**Correction attendue.** Afficher **la prévisualisation vidéo au-dessus de l'interface concernée**, au bon moment, sans obliger l'utilisateur à changer de fenêtre. Vérifier que le flux vidéo lui-même est bien visible, et pas seulement que la fenêtre a été créée.

**Tests de validation à exécuter lors du débogage :**

- Après avoir décroché un appel vidéo, vérifier que la prévisualisation apparaît et montre effectivement l'image, pendant que l'audio reste fonctionnel.
- Depuis un événement ou une communication contenant de la vidéo, vérifier l'ouverture de la prévisualisation et son ordre d'affichage par rapport à la fenêtre active.
- Vérifier le cas où le son est disponible avant l'image : constater le comportement, identifier la cause et confirmer après correction que la vidéo devient visible comme attendu.
- Vérifier aussi la **réception et la lecture d'une vidéo préenregistrée** : la prévisualisation doit s'ouvrir et afficher les images, avec le son si le fichier en contient.
- Vérifier la **réception et la lecture d'un fichier audio préenregistré** : le son doit être lisible, sans exiger l'ouverture d'une prévisualisation vidéo inutile.

### D3. Discussions — remontée intempestive lors de l'ouverture d'un contenu

**Constat rapporté.** Dans une fenêtre de discussion, un clic sur une vidéo ou un texte pour le consulter fait remonter l'affichage en haut de l'espace de discussion.

**Correction attendue.** Ouvrir ou développer le contenu **sur place**, en conservant la position de lecture et de défilement de la discussion. Ne pas repositionner automatiquement l'utilisateur au début du fil.

**Tests de validation à exécuter lors du débogage :**

- Se placer au milieu ou en bas d'une discussion ; ouvrir une vidéo, puis vérifier que la discussion ne remonte pas en haut.
- Reproduire le même test avec un texte à lire ou à développer.
- Vérifier le comportement après lecture d'une **vidéo préenregistrée** et d'un **fichier audio préenregistré** reçus dans la discussion : lecture effective et position de défilement conservée.
- Vérifier qu'à la fermeture du contenu consulté, l'utilisateur retrouve le bon emplacement dans le fil.

### D4. WebView — aucune fenêtre ni page de navigation visible

**Constat rapporté.** Lorsque l'utilisateur ouvre l'outil WebView, aucune WebView utilisable ne s'affiche. Il n'y a ni véritable affichage web ni page d'accueil permettant de naviguer.

**Correction attendue :**

- Corriger l'ouverture de **l'outil WebView existant** pour que la vue web soit réellement créée, visible et interactive dans l'interface d'atome/eVe.
- Charger une **page d'accueil par défaut** utilisable dès l'ouverture, afin de ne pas présenter une zone vide. Le contenu exact de cette page reste à déterminer à partir des capacités et préférences déjà présentes.
- Permettre de choisir le **moteur de recherche préféré** : **Google, DuckDuckGo ou Ecosia** ; mémoriser ce choix et l'utiliser lors des recherches depuis l'outil.
- Rendre possibles l'ouverture des liens, la saisie d'adresses/recherches, la navigation arrière/avant et le chargement des pages, en s'appuyant sur les composants WebView réellement disponibles dans le projet.
- Préserver les conventions visuelles et les composants réels d'atome/eVe, sans fabriquer un navigateur ou des panneaux génériques en parallèle.

**Tests de validation à exécuter lors du débogage :**

- Ouvrir WebView depuis son outil : vérifier qu'une vue web apparaît, qu'elle est visible et qu'elle répond aux interactions.
- Vérifier qu'une page d'accueil s'affiche effectivement au lieu d'un écran blanc.
- Choisir successivement Google, DuckDuckGo puis Ecosia ; lancer une recherche et vérifier que les résultats se chargent et que leurs liens peuvent être ouverts.
- Quitter puis rouvrir WebView et vérifier que le moteur préféré est conservé.
- Naviguer sur plusieurs liens et tester retour, avance et chargement d'une nouvelle adresse.
- Refaire les tests après changement de page dans atome/eVe et retour dans WebView ; vérifier que l'affichage reste exploitable.

### D5. Interface transversale — décalage des outils dans les panneaux ouverts

**Constat rapporté.** Dans différents contextes d’atome/eVe, lorsque l’utilisateur ouvre ou déploie un panneau, les outils situés à l’intérieur, notamment dans sa partie inférieure, ne respectent pas toujours le même calage que les outils du bas de l’interface. Ils apparaissent décalés par rapport à la matrice commune.

**Portée :** correction **transversale**, et non limitée au module Entraînement. Elle s’applique **à tous les modules et à tous les contextes**, notamment **projets, dashboard, outils et activités**, dès lors qu’un panneau se déploie.

**Correction attendue :**

- Conserver **une seule grille/matrice d’alignement** pour les outils, avec les **mêmes colonnes, espacements et positions de référence** entre les outils d’un panneau ouvert et ceux de la zone inférieure.
- Lors de l’ouverture, permettre au **panneau de s’élargir légèrement vers la gauche et vers la droite, si nécessaire**, afin que les outils qu’il contient retombent exactement sur la grille commune.
- Maintenir le calage quels que soient le module, le contexte (projet ou dashboard) et l’état ouvert/fermé du panneau. Éviter toute dérive d’alignement à l’ouverture ou au repli.
- **Adapter les dimensions du panneau à la grille**, sans repositionner arbitrairement les outils, sans créer de grille locale différente ni réinventer les composants et commandes existants.
- Préserver le design, les proportions et le comportement des outils existants ; ne modifier que ce qui est nécessaire pour rétablir la cohérence d’alignement.

**Tests de validation à exécuter lors du débogage :**

- Ouvrir et fermer plusieurs panneaux dans le **dashboard** ; vérifier visuellement et géométriquement l’alignement des outils internes avec ceux du bas.
- Reproduire les mêmes tests dans les **projets**, puis sur différents modules et activités, y compris **Entraînement**.
- Comparer colonnes, espacements et bords de référence en états **fermé, déployé et replié** ; aucun décalage ne doit apparaître.
- Vérifier les panneaux de largeurs et de contenus différents : leur extension latérale respecte la grille sans faire sortir les commandes de l’espace utilisable ni créer de chevauchements.
- Vérifier l’absence de régression sur les outils, leur sélection et leurs options natives après la correction.

**Statut :** anomalie transversale validée et documentée ; diagnostic technique, correction et tests réels restent à effectuer.

### D6. Suppression des tâches, événements, objectifs, projets et alarmes iOS

**Statut : À corriger. Priorité : haute (bug transversal).**

**Constat rapporté :** depuis le dashboard, une tâche ou un événement ne disparaît pas correctement lorsque l’utilisateur effectue un appui long et choisit « Supprimer ». Les rappels/alarmes associés peuvent également subsister après la suppression d’une tâche, d’un objectif ou d’un projet.

**Corrections attendues :**

- Corriger la commande de suppression par appui long ; supprimer effectivement la tâche ou l’événement sélectionné et synchroniser les vues du dashboard et du calendrier concerné.
- Annuler les notifications, rappels et alarmes iOS liés à un élément supprimé, en utilisant le mécanisme réellement employé par atome/eVe et ses identifiants associés.
- Lors de la suppression d’un objectif, annuler les alarmes des tâches et activités concernées ; lors de la suppression d’un projet, appliquer cette suppression en cascade aux objectifs et activités réellement supprimés.
- Éviter toute alarme orpheline, tout événement réapparaissant après synchronisation ou redémarrage et toute suppression d’une alarme non associée.
- Vérifier la prise en charge réelle des notifications locales, rappels du calendrier et éventuelles alarmes natives iOS. Ne pas supposer que ces trois systèmes se pilotent de manière identique.

**Tests réels obligatoires sur iPhone :**

1. Créer une tâche avec alarme ; vérifier que l’alarme se déclenche à l’heure prévue.
2. Supprimer cette tâche depuis le dashboard par appui long > Supprimer ; vérifier qu’elle disparaît du dashboard et du calendrier associé et que son alarme ne se déclenche plus.
3. Créer un objectif comportant plusieurs activités/tâches avec alarmes ; démarrer l’objectif, puis le supprimer ; vérifier la disparition des éléments concernés et de leurs alarmes.
4. Créer un projet contenant un objectif et des alarmes ; supprimer le projet ; vérifier que toutes les alarmes des éléments supprimés sont annulées.
5. Créer directement un événement avec alarme dans le calendrier ; vérifier son déclenchement, puis supprimer cet événement depuis le dashboard et confirmer que son alarme est annulée.
6. Vérifier dans les données du projet, dans le calendrier et dans les notifications programmées que les entrées associées ont disparu ; attendre les anciennes heures de déclenchement pour confirmer l’absence de sonnerie résiduelle.
7. Vérifier la persistance après fermeture/réouverture de l’application, redémarrage du téléphone et synchronisation, sans réapparition des éléments supprimés.

**Résultat attendu :** suppression effective, persistante et complète, sans déclenchement d’alarme résiduelle.

### D7. Activités sportives — bips et annonces vocales absents

**Statut : À corriger.**

**Constat rapporté :** les bips sonores associés aux comptes à rebours, aux séquences et aux exercices ne sont plus audibles. Un problème de synchronisation des bips avec le déroulement des activités avait été constaté auparavant ; désormais, aucun bip ne se fait entendre. Les annonces vocales des activités sportives sont également absentes.

**Corrections attendues :**

- Rétablir l’émission et l’audibilité des **bips sonores** aux moments prévus par le déroulement des activités.
- Rétablir les **annonces vocales** prévues pendant les exercices, comptes à rebours et transitions.
- Vérifier que les bips et les annonces vocales sont **correctement synchronisés** avec les séquences de l’entraînement : pas de décalage, d’omission ni de déclenchement en double.
- Identifier et corriger la cause technique de la disparition du son sans remplacer les outils audio existants par un système parallèle.

**Tests de validation obligatoires sur appareil :**

- Lancer une activité comportant un compte à rebours et des bips : **écouter réellement** les bips et comparer leur émission aux instants attendus.
- Lancer une activité comportant des annonces vocales : **écouter réellement** les messages prévus, vérifier leur intelligibilité et leur déclenchement.
- Tester les transitions entre exercices, séries et périodes de repos pour contrôler la synchronisation audio avec le déroulement de la séance.
- Répéter les essais après pause/reprise et sur les configurations audio pertinentes afin de vérifier l’absence de coupures ou de régression.
- Ne pas considérer les tests réussis sur la seule base de traces d’événements : confirmer que les sons et la voix sont **effectivement entendus**.

**Résultat attendu :** bips et annonces vocales audibles, émis aux bons moments, vérifiés par une écoute réelle.

### D8. Barre de saisie adaptative — cohérence entre dashboard et mode Projet

**Statut : À corriger.**  
**Portée :** barre de saisie et outils adjacents du dashboard et des projets, en portrait comme en paysage.

**Comportement existant de référence :** sur le dashboard, sélectionner la zone de saisie (input box) provoque son extension horizontale, presque sur toute la largeur disponible. Les outils secondaires de la bande inférieure se compactent sous forme de **trois ou quatre traits**, selon le nombre réel d'outils repliés et le comportement existant. Les commandes indispensables, notamment l'outil de rotation du dashboard et l'assistant eVe, restent visibles et accessibles. Ce comportement est **à conserver**, pas à réinventer.

**Anomalie / différence à corriger :** en **mode Projet**, sélectionner une zone de saisie ne déclenche pas le même agrandissement centré ni la même compaction des outils adjacents. Les deux contextes doivent partager une logique de comportement cohérente.

**Correction attendue :**

- Lorsqu'une zone de saisie est sélectionnée dans un projet, **l'étendre horizontalement au maximum utile, quasiment sur toute la largeur disponible, et la maintenir centrée à l'écran**, sous réserve de l'espace nécessaire aux commandes qui doivent rester accessibles. Il s'agit d'étendre la zone de saisie dans la barre existante, et non de créer une nouvelle fenêtre ou une interface plein écran indépendante.
- **Reprendre le mécanisme réel de compaction** déjà utilisé sur le dashboard : les autres outils secondaires de la barre se replient en représentations sous forme de traits, dont le nombre correspond au nombre d'outils effectivement compactés, conformément au comportement actuel.
- **Préserver les commandes essentielles** dans chaque contexte. Sur le dashboard, conserver notamment l'outil de rotation du dashboard et eVe ; en mode Projet, garder accessibles les commandes indispensables réellement présentes, sans inventer de nouvel outil.
- **Un clic / tap sur la zone représentant les outils compactés par des traits verticaux doit immédiatement refermer la saisie étendue** : l'input box reprend sa taille minimisée initiale et **tous les outils compactés retrouvent leur taille, leur apparence, leur ordre et leur position d'origine**. Le clic sur cette zone sert à restaurer la disposition et **ne doit déclencher aucune action d'un outil replié**.
- À la fin de la saisie ou lors de la désélection, **restaurer l'état initial** de la barre et des outils, sans déplacement, perte de sélection ni changement d'ordre injustifié.
- **Réutiliser les composants, transitions et interactions existants**, plutôt que dupliquer une seconde logique pour les projets. Contrôler le comportement du clavier virtuel et l'espace restant disponible sur téléphone.
- Respecter l'**Elastic Design** : extension, compaction et décompaction restent intégrées à **l'unique grille/matrice de l'écran**, sans grille locale, chevauchements ni ruptures d'alignement.

**Mock-ups à réaliser avant modification de l'interface :**

- Représenter le dashboard et un projet avec la barre **au repos, sélectionnée/étendue, puis restaurée**, en utilisant les composants réels et leur apparence existante.
- Visualiser explicitement les outils qui restent visibles, ceux qui se replient en traits, et la position centrée de la saisie.
- Ajouter le scénario **tap sur les traits verticaux → input box minimisée → outils restaurés à leur emplacement initial**, sans activation involontaire, aussi bien dans le dashboard que dans un projet.
- Comparer **portrait et paysage**, notamment sur iPhone ; vérifier le calage de l'ensemble sur la grille unique.
- Ne pas étendre ce mécanisme à d'autres éléments pour l'instant : l'hypothèse complémentaire évoquée oralement a été abandonnée.

**Tests de validation :**

1. Sur le dashboard, sélectionner la saisie et vérifier que l'agrandissement, la compaction des outils et les commandes permanentes restent conformes au comportement de référence.
2. En mode Projet, sélectionner la saisie et vérifier la **même logique** : extension quasi maximale, centrage horizontal, compression des outils secondaires en traits et disponibilité des commandes nécessaires.
3. Avec la saisie étendue et les outils compactés, **toucher directement les traits verticaux** ; vérifier que l'input box se minimise, que chaque outil retrouve exactement sa taille et sa position initiales, et qu'aucun outil replié ne s'active. Répéter sur dashboard et en mode Projet.
4. Désélectionner la saisie, rouvrir et répéter ; vérifier le retour exact des outils, leur ordre et leurs actions natives.
5. Tester en **portrait et paysage**, avec et sans clavier virtuel, ainsi qu'avec des longueurs de texte différentes ; vérifier l'absence de chevauchement et de perte de focus.
6. Superposer la grille universelle aux mock-ups puis aux vues réalisées pour vérifier l'alignement en états normal, étendu et replié.
7. Confirmer sur appareil que les interactions restent réellement fonctionnelles ; ne pas limiter la validation à une maquette.

**Résultat attendu :** la saisie en mode Projet se comporte comme celle du dashboard : elle s'étend et se centre, tandis que les outils secondaires se compactent automatiquement. **Un clic sur les traits verticaux minimise la saisie et restaure immédiatement les outils compactés à leurs taille et position initiales**, sans déclencher leur action ni dégrader la grille unique.

### D9. Dashboard — recherche universelle des activités et de tous les types d’atomes

**Statut : À corriger. Priorité : haute.**  
**Portée :** input box de recherche située en bas du dashboard, filtres « Tout » et filtres spécialisés, affichage et ouverture des résultats de tous les types d'atomes accessibles.

**Anomalie rapportée :** une recherche depuis l'input box inférieure du dashboard ne retrouve pas les activités, **ni avec le filtre « Tout », ni avec le filtre « Activité »**, même lorsque l'activité recherchée existe. La correction doit être étendue et contrôlée sur **toutes les catégories d'atomes**, et non limitée aux seules activités.

**Comportement attendu :**

- **« Tout »** : rechercher dans **tous les types d'atomes réellement accessibles** dans le contexte et afficher les résultats correspondants, sans oublier une catégorie.
- **Filtres spécialisés** : retrouver les éléments de la catégorie sélectionnée et exclure les autres sans masquer les éléments qui correspondent ; vérifier notamment « Activité ».
- **Activités** : sport, loisirs, sorties, événements et autres activités disponibles ; retrouver une activité connue et l'ouvrir.
- **Outils** : retrouver les outils existants et déclencher leur action ou ouverture native.
- **Contacts** : retrouver un contact et ouvrir le parcours de contact correspondant.
- **Projets** : retrouver les projets existants et ouvrir le projet choisi.
- **Lieux** : retrouver des lieux, **présenter les résultats géographiques sur une carte avec des marqueurs**, et permettre l'accès à la fiche du lieu et, lorsque disponible, à l'itinéraire.
- **Vidéos, musiques et images** : retrouver les médias réellement disponibles et ouvrir la fiche, le lecteur ou l'outil existant adapté au type ; respecter les sources, droits et autorisations.
- **Tous les autres types d'atomes** : établir l'inventaire à partir de la taxonomie et des contrats existants et vérifier leur prise en charge par la recherche et les filtres pertinents. Ne pas inventer des types ou des sources.
- Réutiliser le **moteur de recherche, la taxonomie, les contrats, les index et les outils déjà présents** ; rechercher la cause des absences de résultats (indexation, disponibilité des données, routage ou filtres) et corriger à la source, sans créer un second moteur parallèle.
- Gérer correctement les créations, modifications, suppressions, éléments non disponibles et absence de résultats ; ne pas afficher d'éléments fantômes ni renvoyer vers une destination incorrecte.

**Tests fonctionnels obligatoires avant livraison :**

1. Recenser tous les types d'atomes existants dans atome/eVe et préparer **au moins un élément connu et accessible de chaque type**, sans dépendre d'un résultat aléatoire ou inaccessible.
2. Chercher chaque élément connu avec **« Tout »**, puis avec le **filtre spécialisé correspondant** lorsque celui-ci existe ; vérifier l'exactitude, la présence et la pertinence du résultat. Tester explicitement le cas initial d'une activité introuvable avec les filtres « Tout » et « Activité ».
3. **Ouvrir réellement chaque résultat** et confirmer l'accès à l'outil, au contact, au projet, à l'activité ou au média attendu, pas seulement la présence de son libellé dans une liste.
4. Pour les **lieux**, vérifier la carte, les marqueurs, la bonne localisation, l'ouverture de la fiche détaillée et l'itinéraire s'il est disponible ; tester plusieurs résultats simultanés et l'absence de résultat.
5. Répéter après **création, renommage, modification et suppression** d'éléments pertinents pour vérifier la fraîcheur de l'index et l'absence de résultats obsolètes.
6. Tester les changements successifs de filtres et le retour à « Tout », les recherches sans résultat, les entrées longues et les caractères accentués, ainsi que les différents contextes de connexion/autorisations pertinents.
7. Vérifier en application réelle sur les plateformes concernées, consigner les résultats **par catégorie et par filtre**, tester l'absence de régressions et ne déclarer la correction terminée qu'une fois les parcours validés conformément à la **règle générale de livraison** ci-dessus.

**Résultat attendu :** une recherche universelle et cohérente depuis l'input box du dashboard : chaque type d'atome accessible est trouvable avec « Tout » et son filtre spécialisé éventuel, ses résultats s'ouvrent réellement et les lieux sont visibles sur une carte avec accès à leurs détails.

**Statut des ajouts du 3 novembre 2026 :** demandes validées et documentées ; implémentation et tests réels encore à effectuer. Les fonctionnalités ne sont pas annoncées comme corrigées ou déjà opérationnelles.

**État des vérifications :** tests **définis, non exécutés**. Les dix anomalies ont été rapportées par l'utilisateur ; ni diagnostic technique ni correction de code ne sont prétendus à ce stade.

### D10. Activités — rubrique Bien-être inaccessible

**Statut : À corriger. Priorité : haute.**  
**Portée :** sélection de la rubrique ou tuile Bien-être dans Activités, ouverture de son contenu et navigation associée.

**Anomalie rapportée :** la rubrique **« Bien-être » ne s'ouvre pas** lorsqu'elle est sélectionnée. Ce dysfonctionnement doit être corrigé indépendamment de l'audit de classement prévu à l'amélioration 14.

**Correction attendue :**

- **Reproduire le dysfonctionnement réel**, puis identifier sa cause dans l'implémentation existante : interaction, routage, association à une catégorie, chargement des données ou erreur de transition. Ne pas conclure sans vérification.
- **Rétablir l'ouverture de Bien-être** et l'affichage de son contenu réel, sans écran vide ni retour intempestif.
- Vérifier l'accès aux éventuelles **sous-catégories et fiches détaillées**, les outils associés et le chemin de retour.
- Vérifier le comportement depuis tous les accès pertinents à Bien-être, en tenant compte de la réorganisation de taxonomie de l'amélioration 14.
- Respecter les composants natifs et la grille Elastic Design ; ne pas créer un écran ou outil de remplacement artificiel.

**Tests de validation obligatoires :**

1. Ouvrir la rubrique Bien-être dans l'application réelle et vérifier que le contenu attendu apparaît et reste navigable.
2. Ouvrir ses sous-catégories et au moins une fiche de lieu ou activité disponible, puis revenir à la rubrique et au dashboard.
3. Tester les accès depuis les autres rubriques où Bien-être apparaît aujourd'hui, puis depuis son emplacement corrigé après audit taxonomique.
4. Vérifier les différentes orientations et plateformes concernées, les cas de contenu absent, et l'absence de régression des autres catégories d'Activités.
5. Documenter les résultats ; **ne pas déclarer le bug corrigé sans preuve de fonctionnement**, conformément à la règle générale.

**Résultat attendu :** un clic sur la rubrique Bien-être ouvre correctement son contenu et permet un parcours complet, avec navigation retour fonctionnelle.


### D11. Elastic Design — multiplicateur des labels des tuiles 120 × 120

**Statut : À corriger.**  
**Anomalie rapportée :** les labels des tuiles 120 × 120 conservent la même taille de police que ceux des tuiles 60 × 60, malgré le coefficient de taille prévu pour les grandes tuiles.

**Correction attendue :**

- Identifier le coefficient et le mécanisme de typographie déjà définis dans les paramètres d'atome/eVe ; ne pas imposer un nouveau ratio arbitraire.
- Appliquer correctement ce multiplicateur aux labels des tuiles 120 × 120, avec une taille effectivement supérieure selon le coefficient configuré.
- Répercuter toute modification du coefficient sans nécessiter de reconstruction manuelle de l'interface.
- Préserver les positions, proportions, alignements, ellipses et règles de débordement dans la grille universelle de l'Elastic Design.

**Tests obligatoires :** comparer visuellement les tuiles 60 et 120 à différents coefficients, sur dashboard et projets, en portrait et paysage ; vérifier les libellés courts et longs, et confirmer le comportement sur l'application réelle.

### D12. CarPlay — régression et lancement de l'assistant eVe

**Statut : Régression à corriger. Priorité : haute.**  
**Anomalie rapportée :** CarPlay ne fonctionne plus et l'assistant eVe ne se lance plus automatiquement au démarrage.

**Correction attendue :**

- Reproduire la régression, analyser les chemins d'initialisation, la connexion CarPlay et les événements de cycle de vie de l'application.
- Rétablir le lancement automatique de l'assistant eVe au démarrage, **dans la mesure permise par les API et les règles de CarPlay** ; documenter précisément toute limitation imposée par Apple.
- **Respecter à la lettre le design et le comportement de l'assistant eVe existant** : reprendre les composants, états, animations, commandes et interactions réels, sans inventer une interface générique ni une variante arbitrairement simplifiée.
- **Réaliser des mock-ups obligatoires** à partir des captures et composants de référence avant toute modification visuelle ; confronter chaque état CarPlay aux états correspondants de l'assistant existant, tout en identifiant les adaptations éventuellement imposées par Apple.
- Réutiliser les connexions et API déjà présentes ; ne pas inventer de connecteurs ni contourner les restrictions de sécurité ou de conduite.

**Tests obligatoires :** démarrage et reconnexion CarPlay, présence et activation de l'assistant, commandes vocales, transitions, interruption et reprise ; contrôler l'apparence et les comportements par comparaison avec les références, sur un environnement CarPlay compatible. Ne pas annoncer la régression corrigée sans essai effectif.

### D13. Apple Watch — démarrage d'activité et synchronisation avec l'iPhone

**Statut : À corriger.**  
**Anomalie rapportée :** démarrer une activité depuis l'application Apple Watch ne provoque plus le lancement attendu de l'application atome/eVe sur l'iPhone.

**Correction attendue :**

- Auditer le déclenchement d'activité sur watchOS et la communication avec l'application iOS : session, messages, transfert d'état et cycle de vie.
- Lorsqu'une activité commence sur la montre, déclencher **la prise en charge automatique de cette activité côté iPhone**, en réutilisant les mécanismes natifs et connexions existants.
- Vérifier si l'ouverture automatique **au premier plan** de l'application iPhone est réellement autorisée par iOS. Si elle ne l'est pas, implémenter la meilleure synchronisation ou notification native autorisée et signaler explicitement cette limite, sans promettre un lancement impossible.
- Assurer la cohérence de l'état de l'activité, de ses données, de sa progression et de son arrêt entre la montre et le téléphone ; gérer la reconnexion et éviter les sessions dupliquées.

**Tests obligatoires :** démarrer et arrêter une activité depuis l'Apple Watch avec l'application iPhone au premier plan, en arrière-plan et non active ; vérifier les transferts, la reprise après interruption, les autorisations, les pertes de connexion et l'état affiché sur les deux appareils physiques.

**État des tâches D11 à D13 :** exigences documentées uniquement ; diagnostic, implémentation et tests fonctionnels restent à effectuer.

### D14. Scanner de codes-barres — identification, évaluation du produit et liste de courses

**Statut : Régression à corriger et fonctionnalité à améliorer. Priorité : haute.**  
**Portée :** scanner de codes-barres, accès aux données Open Food Facts, analyse alimentaire/santé et outil existant de liste de courses.

**Anomalies rapportées :** le scanner ne fonctionne plus correctement ; l'identification du produit et son ajout à la liste de courses, qui fonctionnaient auparavant, sont en régression. L'utilisateur doit pouvoir scanner une seule fois, consulter un verdict compréhensible, puis décider d'ajouter ou non le produit.

**Comportement à rétablir et unifier :**

1. **Lecture :** scanner un code-barres et confirmer la reconnaissance réussie par un **bip**. Éviter les déclenchements multiples pour le même scan. Ne pas bipper comme pour un scan réussi si aucun code valable n'a été identifié.
2. **Image figée :** figer le flux de la caméra à la validation du code ; conserver une image exploitable du produit et le code détecté, puis permettre de reprendre le scan avec les commandes existantes.
3. **Données :** identifier le produit par son code et récupérer **le maximum d'informations disponibles et autorisées**, notamment via **Open Food Facts** : nom, marque, photo, ingrédients, allergènes, informations nutritionnelles, Nutri-Score, classe NOVA, additifs et provenance des données. Les données absentes doivent être distinguées des données négatives.
4. **Verdict :** afficher clairement les informations utiles, l'évaluation et ses raisons, avec des **avertissements visibles** lorsque les critères justifient une réserve. Distinguer la **qualité nutritionnelle**, l'ultratransformation, les additifs et les **risques toxicologiques réellement documentés** ; la présence d'une substance chimique, à elle seule, ne démontre pas une toxicité.
5. **Barème à étudier :** examiner la possibilité d'un score global de qualité sur 100 et d'un seuil d'alerte envisagé autour de **60/100**, **sans le considérer comme validé**. Vérifier les critères, pondérations, preuves scientifiques, scores et limites des données disponibles. Les indicateurs Open Food Facts ne constituent pas automatiquement une note toxicologique universelle sur 100 ; documenter toute conversion ou tout score propre à atome/eVe.
6. **Conseil :** si l'évaluation est défavorable et suffisamment étayée, afficher directement une mise en garde et déconseiller le produit avec une explication factuelle. Ne pas émettre de verdict catégorique lorsque la fiche est incomplète ou qu'un risque n'est pas établi.
7. **Ajout à la liste de courses, *après le verdict seulement* :** faire apparaître l'outil/bouton natif **« Ajouter à la liste de courses »** une fois le résultat d'analyse affiché, pour que l'utilisateur décide après avoir pris connaissance de la qualité du produit. Un produit défavorable ne doit **pas être ajouté automatiquement** ; laisser l'utilisateur libre de confirmer explicitement l'ajout même en présence d'un avertissement.
8. **Confirmation et absence de doublons :** au clic sur « Ajouter à la liste de courses », enregistrer réellement le produit dans la liste de courses existante et **afficher une confirmation visible du succès**. Si le produit figure déjà dans cette liste, **ne pas créer de second article identique** : retrouver l'entrée existante, proposer sa consultation ou la mise à jour de sa quantité suivant les fonctions natives disponibles, et signaler clairement qu'il était déjà présent. Utiliser prioritairement le code produit (GTIN/EAN) pour reconnaître une même référence ; gérer les cas sans identifiant exploitable.
9. **Intégration :** réutiliser le scanner, les outils de produit, l'outil de liste de courses, les mécanismes de navigation et les connexions Open Food Facts déjà présents dans atome/eVe. Ne pas créer une fiche indépendante, un gestionnaire de liste parallèle ou une interface générique ; respecter la grille d'Elastic Design et les accès natifs.
10. **Erreurs :** gérer les codes inconnus, produits absents d'Open Food Facts, absence de réseau, autorisation caméra refusée, fiches incomplètes, échec de l'enregistrement et lecture répétée ; donner un état fidèle, sans faux verdict ni fausse confirmation d'ajout.

**Tests fonctionnels obligatoires avant livraison :**

1. Sur appareil réel, scanner plusieurs produits connus : vérifier l'unique bip de validation, le gel de l'image, la capture du code, l'identification correcte et la récupération des données disponibles.
2. Vérifier l'affichage du verdict **avant** celui du bouton d'ajout ; distinguer produit favorable, défavorable et insuffisamment documenté. Contrôler la pertinence et la traçabilité des avertissements.
3. Cliquer sur « Ajouter à la liste de courses » après le verdict : vérifier que **le bon produit apparaît réellement** dans la liste, avec une confirmation visible ; recommencer le même scan puis le même ajout et **vérifier l'absence de doublon**.
4. Vérifier qu'un produit déconseillé n'est pas ajouté par défaut et qu'un utilisateur peut néanmoins décider explicitement de l'ajouter.
5. Tester code inconnu, fiche partielle, refus caméra, hors ligne, reprise du scanner, changement de produit et erreurs de sauvegarde ; vérifier la cohérence des messages.
6. Confirmer sur les plateformes concernées que la correction ne provoque pas de régression des autres fonctions de capture, de recherche produit ou de liste de courses ; consigner les preuves des essais et les limites.

**Résultat attendu :** un parcours fluide et fiable **scan → bip → image figée → récupération des données → verdict explicite → bouton d'ajout → confirmation dans la liste de courses sans doublon**, avec avertissement immédiat pour les produits jugés défavorables selon des critères justifiés.

**État :** besoin validé et documenté ; aucune correction technique ou validation réelle n'est revendiquée à ce stade.

### D15. AUv3 — l'extension ne s'ouvre plus

**Statut : À corriger — régression. Priorité : haute.**  
**Anomalie rapportée :** l'extension AUv3 d'atome/eVe ne s'ouvre plus alors qu'elle s'ouvrait auparavant.

**Diagnostic et correction attendus :**

1. Reproduire l'échec d'ouverture dans un hôte compatible, recueillir les journaux et identifier l'étape d'initialisation bloquante ou l'erreur exacte.
2. Vérifier les **permissions et demandes de connexion**, les accès réseau, la sandbox AUv3, les services externes, la signature et le cycle de vie de l'extension, sans présumer que les permissions sont la cause.
3. Vérifier si **l'assistant eVe est lancé inutilement au démarrage de l'AUv3** et s'il déclenche une connexion ou une permission indisponible dans cet environnement. Si c'est le cas, éviter son lancement automatique ou isoler cette dépendance, **sans supprimer de fonction audio/MIDI nécessaire**.
4. Corriger la cause identifiée, éviter tout blocage de l'interface par un service facultatif et restaurer l'ouverture fiable de l'extension.
5. Tester la compatibilité avec le mode effet MIDI existant et le futur mode instrument, sans introduire de régression.

**Tests obligatoires :** ouverture, fermeture et réouverture dans des hôtes AUv3 compatibles, chargement à froid/à chaud, autorisations accordées/refusées, réseau présent/absent, initialisation, fonctionnement MIDI et audio, et reprise de projets de l'hôte. Conserver les traces de l'erreur et de sa résolution.

**État :** anomalie déclarée ; cause non confirmée, correction et tests non effectués.

### D16. Tauri/macOS — écran blanc prolongé au démarrage et demande injustifiée du mot de passe de session

**Statut : À corriger — régression et étude technique. Priorité : haute.**  
**Portée :** application de bureau atome/eVe bâtie avec Tauri, en **production** et en **développement**.

**Constats confirmés par l'utilisateur :**

- En **production**, l'application présente un **écran blanc très long** au démarrage. Vérifier aussi si la lenteur existe en développement, sans le considérer comme déjà établi.
- Une boîte de dialogue demande le **mot de passe de la session macOS** au lancement, notamment au **premier lancement**. Ce comportement est également observé **en développement** et la demande se reproduit **systématiquement** selon l'utilisateur. La cause est inconnue ; ne pas supposer que cela provient uniquement de sa machine.
- Cette demande systématique est inadaptée pour un utilisateur ordinaire et doit être expliquée et, si elle n'est pas indispensable, supprimée **sans affaiblir la sécurité de macOS**.

**Étude et corrections attendues :**

1. **Mesurer le démarrage** de bout en bout, avec horodatage des étapes : processus Tauri, chargement WebView, serveur local, Rust, JavaScript, ressources, services externes, affichage initial et première interface interactive. Identifier précisément ce qui provoque l'écran blanc ; corriger les blocages et chargements inutiles plutôt que masquer le problème par un écran factice.
2. **Identifier la boîte de dialogue macOS** par son intitulé exact, l'application/processus qui la présente et l'opération déclenchante : accès au Trousseau, élément secret, autorisation système, privilège administrateur, signature/identité de code, service au lancement ou autre. Ne jamais demander ni enregistrer le mot de passe de l'utilisateur pour le diagnostic.
3. Vérifier **les identités et signatures** en développement/production, les droits d'accès aux éléments du Trousseau et le comportement de l'installation initiale, d'une mise à jour et des redémarrages successifs. Déterminer ce qui est légitime, ce qui est superflu, et pourquoi macOS redemande éventuellement une autorisation.
4. Éviter toute sollicitation injustifiée : corriger la cause (accès, déclaration, configuration, séquence d'initialisation ou permissions) et **ne pas contourner le mécanisme de sécurité** si une autorisation est effectivement requise. Documenter explicitement toute demande qui ne peut légalement ou techniquement être supprimée.
5. Comparer **production vs développement**, **premier lancement vs lancements suivants**, **démarrage à froid vs à chaud**, **installation propre vs installation existante**, et autant que possible **plusieurs Macs/comptes** pour distinguer un problème local d'un défaut général.
6. Ne considérer le problème résolu qu'après vérification de la suppression de l'écran blanc prolongé et de la demande de mot de passe **non nécessaire**, tout en préservant le fonctionnement et les protections légitimes.

**Tests obligatoires :** noter temps avant premier affichage utile et temps avant interaction, chaque dialogue macOS réellement rencontré et son origine, versions/signatures/contexte de lancement, et comportement après plusieurs redémarrages. Tester en conditions utilisateur final et conserver les preuves.

**État :** symptômes rapportés ; cause, nécessité de l'authentification et correctifs non vérifiés.

### D17. Projets — la palette parente de la bande contextuelle verticale remonte en haut de l'écran

**Statut : À corriger — régression.**  
**Périmètre strict :** palettes ouvertes depuis la **bande verticale contextuelle à l'intérieur d'un projet**.

**Anomalie :** l'ouverture d'une palette enfant se fait désormais au bon endroit, mais **la palette parente se déplace intempestivement en haut de l'écran**. Il existait auparavant le défaut inverse : l'enfant s'affichait au mauvais endroit. Il faut corriger les deux niveaux de positionnement, sans revenir à l'ancien bug.

**Correction attendue :**

1. Conserver la position, les dimensions et l'ancrage de la **palette parente** quand une palette enfant s'ouvre, se ferme ou que d'autres niveaux sont ajoutés.
2. Positionner chaque **palette enfant** correctement par rapport à son déclencheur et au conteneur/contextuel réel, sans saut ni décalage lors des mises à jour de layout.
3. Préserver les **gestes natifs** : défilement des palettes, gestes de glissement et agrandissement lent lorsqu'ils existent, sans déclenchements involontaires.
4. Tester séquences multi-niveaux, retour, fermeture, scroll et changements d'orientation/dimensions. Réutiliser les composants, le système d'ancrage et la logique de navigation existants.
5. **Ne pas modifier les palettes du menu principal inférieur** : leur comportement est considéré comme correct et ne fait pas partie de cette régression.

**Résultat attendu :** palette parente immobile et palette enfant au bon endroit, indépendamment du scroll et du nombre de niveaux ouverts.

**État :** à diagnostiquer et à tester sur l'application réelle.

### D18. Projets — barre de défilement visible dans les palettes contextuelles

**Statut : À corriger — régression visuelle et gestuelle.**  
**Anomalie :** une **scrollbar** devient visible durant le défilement d'une palette contextuelle, alors qu'elle doit rester totalement **invisible**.

**Correction attendue :**

1. Masquer l'indicateur de défilement **y compris pendant le geste**, dans les palettes concernées de la bande contextuelle verticale.
2. Conserver intégralement le **défilement tactile/souris/trackpad**, son inertie, les gestes existants et l'accessibilité du contenu ; masquer la barre, **pas désactiver le scroll**.
3. Vérifier qu'aucun changement de largeur, saut, décalage ou recadrage du conteneur n'est provoqué par le masquage.
4. Tester sur les moteurs et appareils concernés, en portrait/paysage et pendant l'ouverture simultanée de niveaux de palettes, afin d'éviter une régression de D17.

**Résultat attendu :** défilement fonctionnel et fluide, sans scrollbar visible à aucun moment.

**État :** à diagnostiquer et à tester sur l'application réelle.

**État de D15 à D18 :** exigences approuvées et intégrées au cahier ; aucune correction de code, aucun test sur application réelle n'est revendiqué.

## Notes de cadrage

- « Séance suivante » = prochaine pratique de la même activité ou du même exercice, selon l'unité de comparaison choisie.
- **Reprendre une séance ne signifie pas progresser** : la progression est une option, pas une obligation.
- « Série suivante » = série à l'intérieur d'une séance ; **ce n'est pas la référence visée par cette demande**.
- Conserver la terminologie propre à **atome** et **eVe**, ainsi que les composants réellement présents dans le projet.

## Ajouts du 4 novembre 2026 (demandes orales de l'utilisateur, session D18)

### D19. Dashboard paysage — le glisser sur l'outil central (logo V) ne fonctionne pas
**Constat (utilisateur, 4 nov. 2026) :** en paysage, un glisser sur le centre de l'outil au logo V ne fait pas monter les réglages ni aucun des comportements attendus ; le glisser ne fonctionne pas dans ce mode. Lien : amélioration 10 C.

### D20. Authentification par numéro sur un second appareil — saisie du code introuvable, aucune notification app ouverte (priorité haute)
**Constat (utilisateur, 4 nov. 2026) :** après saisie d'un numéro existant, l'app annonce l'envoi de la demande aux autres appareils ; l'assistant vocal en parle, mais l'outil Communication du bas n'offre aucun champ explicite pour saisir le numéro/code reçu ; toucher une input box passe en mode recherche. Il faut un outil explicite qui reste présent tant que la demande n'est pas traitée (même après fermeture de session, changement de panneau du dashboard et retour). De plus, app ouverte, aucune notification ni parole n'arrive sur le second appareil : il faut fermer et rouvrir l'app pour que l'assistant demande la saisie. Vérifier la remise en direct (push / WS) et corriger. Test sur l'iPad branché en USB.

### D21. Rafraîchissement des vues — transversal à tout le framework (priorité haute)
**Constat (utilisateur, 4 nov. 2026) :** beaucoup d'actions ne rafraîchissent pas la vue immédiatement (ex. une alarme supprimée reste affichée) ; il faut fermer/rouvrir le panneau ou l'app. Toute action reçue doit rafraîchir la vue concernée immédiatement. Corriger le mécanisme de manière transversale.

## Ajouts du 5 novembre 2026 (questions une par une, réponses validées ; détail : `todo/REGISTRE_DEMANDES.md` R-115)

### D22. Navigation du bas sur une seule ligne — Fait (Web, 5 nov. 2026)
- [x] Une seule ligne en bas : `Atome | Saisie | ← | ⌂ | →` ; plus de rangée de flèches au-dessus (`pagerRect` et sa case gardée libre retirés).
- [x] ← = Précédent + Retour (page d'avant, niveau au-dessus, accueil) ; → = page ou étape suivante, absente quand rien ne suit ; ← toujours à gauche de →, gaucher compris.
- [x] Avec l'outil Dashboard : `← | ⌂ | →`, sinon `⌂ | ←` — jamais au bord tant qu'une flèche est là ; sans lui les flèches se touchent `← | →`.
- [x] Une rubrique de premier niveau n'affiche jamais l'outil Dashboard. Premier lancement aligné : l'Atome dans son coin (gauche pour un droitier, droite pour un gaucher), ← → et ✕ dans l'autre coin, sur chaque écran ancré.
- [x] Tuile Agenda (eVe Pro) : plus de feuilletage latéral des rendez-vous ; glisser à droite l'ouvre comme toute tuile (règle 20).
- Maquettes validées : `temp/d18_plan/out2/` (sauf 6 et 7, remplacées par `⌂ | ←`).
- Preuve : `PROBE_PREBUILT_SERVER=1 PROBE_ISOLATED=1 PROBE_SERVER_START_MS=240000 node temp/d18_nav_line/nav_line.probe.mjs right|left|landscape|mic` — 44/44, 31/31, 31/31, 15/15 ; vrai premier lancement `node temp/d18_nav_line/first_launch.probe.mjs both` — 82/82 (rapports `temp/d18_nav_line/out_*/report.json`, `first_launch_out/report.json` ; captures `temp/d18_nav_line/shots_*/`, `first_launch_out/`). Reste : essai sur l'iPad USB (utilisateur).

### D23. Médias : toucher, double toucher, maintien, plein écran, suivant — Fait (Web)
- [x] Consultation, Exécution, Dashboard : toucher = contrôles affichés / masqués ; double toucher = plein écran (et sortie) ; maintien = menu Mystic toujours.
- [x] Plein écran : le média seul ; un toucher montre les contrôles et la ✕ (place de Retour) ; sortie par double toucher ou ✕.
- [x] Glissement latéral en plein écran : doigt vers la gauche = média suivant de la collection, droite = précédent.
- [x] Photos et sons aussi (son : pochette, sinon forme d'onde).
- [x] Édition d'un projet inchangée (toucher = sélection, rail pour lire, double toucher = recadrage).
- Étude des axes : `temp/d18_plan/swipe_axes_study.md` (flux futurs : vertical dans le sujet, latéral = sujet voisin).
- Codé (5 nov.) : capacité unique `eVe/domains/rendering/tap_or_double.js` (pointeur BevyUI et canevas) ; Dashboard `dashboard_media_scrub.js#handlers` (`onDouble`, `onHold`, `still`), `dashboard_media_sideways.js`, ✕ du plein écran dans la case de Retour (`media_controls_overlay.js#mediaControlsCloseNode`), pastilles « Tous / Mes vidéos / Autres » absentes du plein écran, jeton `mediaControls.ground` ; projet `project_media_gestures.js`, `project_media_fullscreen.js` (l'Atome posé sur un fond noir éphémère, sa place rendue), `project_context_hold.js` (maintien = Mystic hors Édition) ; commandes `films.control controls|hide_controls`, `media_lists.control`, `projects.media`.
- [x] Suite (5 nov.) : plein écran = le média seul, la marque « V » des profils retirée du cadre du Dashboard tant que dure le plein écran (`dashboard_mystic_runtime.js` `frameNodes`), rendue à la sortie.
- [x] Suite : prises (liste des prises, Retouche et listes de Créer), prises de l'entraînement et vidéos de la conversation : même ✕ en case de Retour (`media_controls_overlay.js#mediaFullscreenCloseNodes` / `createMediaCloseOverlay`, toutes deux par `mediaControlsCloseNode`) et même glissé latéral sur leur collection (`sidewaysThrough`) ; commande `captures.fullscreen`.
- [x] Suite : son d'un projet en plein écran : sa pochette quand l'atome en porte une (`poster_source`), sinon sa forme d'onde ; une seule règle de pochette avec le Dashboard (`eVe/domains/media/media_cover.js#mediaSoundCover`).
- [x] Suite : mode Exécution essayé à part (sonde, partie D).
- [x] Suite : `media_lists.control` pilote aussi la Médiathèque quand elle est ouverte (`registerMediaLibraryControl`, une seule commande partagée `dashboard_stage_list_media.js#command`).
- [x] Suite 2 (5 nov.) : la ✕ du plein écran peinte partout. Causes : l'arbre de la ✕ portait l'identifiant de son hôte (`<hôte>_fullscreen_close`), que l'hôte, propriétaire de tous les enregistrements de son préfixe, effaçait à chaque peinture ; et la ✕ posée dans l'arbre de l'hôte restait sous l'image (profondeur de l'outil). Corrigé à la source (`createMediaCloseOverlay({ hostTreeId })`, `mediaControlsToolsLayer()`). Sol noir = jeton `EVE_COMMON_SKIN_TOKENS.mediaGround` pour tout hôte. Une vidéo de conversation finie en plein écran rend le fil. Le son téléversé depuis le Dashboard ne tombe plus sur `play_record_audio_facade_unavailable` (modules audio différés chargés d'abord). Preuves : `media_gestures.probe.mjs` LAEBCD 68/68 (✕ peinte L et E par pixels), `training_takes.probe.mjs` 11/11 (prises d'une séance de Sport : ✕ peinte, glissés, bout immobile, ✕), `conversation_takes.probe.mjs` (deux comptes, deux vidéos : ✕ peinte, glissés, fin de vidéo), `list_share_ui.probe.mjs` S7 (✕ peinte 0,97).
- Règles 13 et 20 d'AGENTS.md : vérifiées, elles portent le texte de l'utilisateur (l'image d'une vidéo, place nommée de ses contrôles ; doigt vers la gauche = suivant).
- Preuve : `PROBE_PREBUILT_SERVER=1 PROBE_ISOLATED=1 node temp/d18_media_gestures/media_gestures.probe.mjs` (rapport `temp/probe_reports/d18_media_gestures/report/report.json`, captures `temp/d18_media_gestures/shots/`). Parties L (Médiathèque), A (Dashboard), E (prises), B/C (Consultation, Édition), D (Exécution). Reste : essai sur l'iPad USB (utilisateur) ; une liste eVe ne prend pas d'image (contrat `audio|video`) ; pochette des services de musique et lecteurs TV / en ligne laissés tels quels (consigne).

### D24. Activité › Médicaments — À réaliser
- [ ] Source BDPM importée chaque mois par un binaire Rust natif, index poussé aux appareils, recherche sur l'appareil.
- [x] Tuile visible d'emblée après Compléments (eVe Pro et Basic) ; écrans M1–M6 validés (`temp/d18_plan/med_mockups/`). Fait 5 nov. (Web) : `temp/d18_meds/meds.probe.mjs`, `basic.probe.mjs`, `model.probe.mjs`, captures `temp/d18_meds/out/`.
- [x] Fiche : plusieurs heures, début/fin ou sans fin, si besoin (max par jour), notice, rappel ; prises Prise / Reportée / Oubliée ; historique ; scan DataMatrix. Fait 5 nov. (Web ; scan par un lecteur simulé, DataMatrix iOS compilé seulement).
- [x] Doses = recommandations (5 nov.) : « Par prise », les heures et « Max/jour » pré-remplis selon la posologie de la référence pour les paramètres connus de la personne (âge, sexe, poids, taille, IMC, grossesse, fonction rénale et hépatique, glycémie, HbA1c, tension, résultats du Carnet ; un paramètre absent reste inconnu, jamais deviné) ; « — » sans posologie connue ; fiche « à valider », sans prise ni rappel, jusqu'à « Valider » (✓) dans la rangée d'outils. Fait (Web, `temp/d18_meds/meds.probe.mjs`, `model.probe.mjs`) ; posologie lue dans la fixture tant que le contrat Rust n'en porte pas.
- [x] Roller « Max/jour » à côté de « Si besoin » (même brique), pré-rempli par la référence, sinon « — ». Fait (Web).
- [x] Supprimer : second toucher gardé (validé 5 nov.).
- [x] (5 nov., R-115) Ajouter ou changer un médicament : sa fiche dit ce que la personne prend et est, sur ses propres lignes, sans élément nouveau : interactions (compléments compris), allergie, antécédent, profil, vie (sport, sommeil, coucher, conduite, soleil, alcool déclarés au profil Santé, sinon « inconnu ») et aliments. Preuve : `temp/d18_cross_check/cross.probe.mjs` 44/44.
- [x] (5 nov., R-115, règle 21 qui remplace Q70) Le profil Santé (« Ce que eVe doit savoir », alcool compris) et les allergies et intolérances vivent sur le serveur, scellés pour la seule personne (`health_profile_store.js`, type `health_profile`, rien en clair) ; ce que Q70 gardait sur l'appareil y est scellé une fois puis effacé. Un appareil appairé, ou reconnecté après déconnexion, retrouve tout. Preuve : `temp/d18_cross_check/profile_server.probe.mjs` 30/30 (trois navigateurs : appairé, reconnecté, restauré par le code de secours ; coffres, base et trames lus).
- [x] Carnet : une ligne de DFG en mL/min/1,73m² (aussi mL/min/1.73m2, ml/min/1,73 m²) est lue (lecteur de résultats, unité par surface corporelle) et prise comme DFG. Fait (`temp/d18_meds/lab_reader.probe.mjs`).
- [x] Allaitement : ligne du profil de santé juste après Grossesse (même brique), lue dans les paramètres de la personne. Fait (Web, `temp/d18_meds/meds.probe.mjs`).
- [x] eVe Basic : un médicament existant (déclaré, scanné, ou reçu puis validé) fait gagner la tuile Activité, supprimé elle repart. Fait (Web, `temp/d18_meds/basic.probe.mjs`).
- [x] Pause (suspend prises et rappels), Arrêter (fin aujourd'hui, historique gardé), Supprimer (efface tout après confirmation), pour une liste entière ou un médicament ; arrêt automatique à la date de fin. Fait 5 nov. (Web, coffre serveur lu).
- [ ] Chiffrement de bout en bout des traitements et prises (clé du compte) ; jamais lus par les IA. Fait 5 nov. pour ce qui est ENVOYÉ : une liste de médicaments, de compléments ou d'atomes (conseils du médecin, papier signé de l'ordonnance compris) part scellée sur l'appareil pour la clé publique de chaque destinataire (`share_keys.js`, `list_share_sealed.js`) ; le serveur ne porte que du chiffré, ni dans ses coffres ni dans le flux temps réel (`temp/d18_meds/share.probe.mjs` 36/36, coffres et trames lus) ; l'aide à la prescription (D27), partagée en direct dans les deux sens, est scellée de même (`temp/d18_rx_aid/rx_aid.probe.mjs` 66/66). Proposition, non demandée : chiffrer au repos les traitements et prises de la personne dans SON coffre. Fait aussi 5 nov. (règle 21) : le profil Santé et les allergies scellés pour la personne seule, sur le serveur ; un appareil appairé ou restauré reçoit désormais les clés de secours du compte (défaut corrigé, il ne les recevait jamais).

### D25. Envoyer une liste à un tiers — transversal à toutes les listes — À réaliser
- [x] Toute liste (médicaments, compléments, playlists, courses, programmes d'activité, tout atome liste ou protocole) : outil « Envoi » → Publier (carte nom + nombre), aussi par le réseau intégré. Fait 5 nov. hors écrans de santé : playlists (S1b), programmes (maintien d'un programme dans Projets › « Envoi »), modèles de protocole (Modèles › Envoi par `share.send`), courses partagées en direct (`share.send` live) ; un seul moteur `share.*` (`shopping.share` et `template_share` retirés). Écrans Médicaments/Compléments : faits 5 nov. (Envoi, scellé ; `temp/d18_meds/share.probe.mjs`).
- [x] « + » : Pour moi / Pour un tiers ; une liste pour un tiers reste chez l'auteur (tuile « Marie (3) »), hors Dashboard et Agenda. Fait 5 nov. (Web, écrans Médicaments/Compléments, aucune occurrence d'Agenda ; `share.probe.mjs`).
- [x] (5 nov.) Liste de santé chiffrée de bout en bout : clé publique par compte, scellée pour chaque destinataire ; destinataire sans clé = partage en attente, invitation existante, scellée et envoyée dès sa clé publiée ; le sceau porte le papier signé de l'ordonnance et les enfants d'une liste d'atomes (conseils `food_advice_tip`). Fait (Web ; `share.probe.mjs` 32/32, `temp/d18_ordonnance/ordonnance.probe.mjs` 57/57, `temp/d18_food/food.probe.mjs`).
- [x] Le destinataire valide (Valider / Refuser, mots repris sur toutes les cartes de partage) ; liste liée : chaque version marquée à valider, Détacher garde une copie ; programmes partageables (plan seul). Fait 5 nov. (Web) : `temp/d18_list_share/list_share_ui.probe.mjs` 43/43, `server_lists.probe.mjs` 25/25, captures `temp/d18_list_share/out/s5`, `s6`.
- [x] Brouillon IA depuis une ordonnance (photo en vignette), à valider ; l'IA ne lit jamais le traitement. Fait 5 nov. (Web) : vignette 4:3 sous les mots d'eVe, touchée = le plein écran média de D23 (photo seule sur tout l'écran, un toucher montre la ✕ dans la case de Retour, ✕ ou double toucher = retour) ; `list_share_ui.probe.mjs` (S7, captures `s7_*`, `s7b`, `s7c`). La ✕ de `createMediaCloseOverlay` est peinte depuis la suite 2 de D23 (S7 : 0,97 des pixels de sa case changent au toucher).
- [x] Une famille de commandes `share.*` (MCP/voix). Maquettes validées : `temp/d18_plan/share_mockups/out/`. Audit : `temp/d18_plan/list_share_audit.md`. Fait 5 nov. : `eVe/domains/sharing/list_share_commands.js` (send, view, accept, refuse, detach, revoke, sent, announce, list_create, draft), registre reconstruit.
- Branché 5 nov. (fin) : les écrans de santé appellent les crochets ci-dessous. Historique : Codé 5 nov., à brancher : Envoi sur les listes de la Médiathèque (S1b/S2 prouvé) ; les écrans Médicaments/Compléments appellent les crochets de `eVe/domains/sharing/list_share_health.js` (Envoi `openListSend({ list_kind })`, « + » `openNewList`, tuiles « Marie (n) » `thirdPartyListTiles`, hors Dashboard/Agenda `keptForOthers`/`isKeptForOther`, nouvelle version `announceProductChange`) — panneau S3 et tuiles S4 prouvés, branchement aux écrans de santé non fait (fichiers de la session Médicaments) ; outil Envoi d'un programme posé (5 nov.) ; vignette S7 faite (5 nov.) ; Publier : fiche du carnet et compte du même numéro = une seule personne (5 nov.).

### D26. Ordonnance dictée — FAIT 5 nov. (Web de bout en bout ; impression native compilée, jamais lancée sur appareil)
- [x] « + » Pour un tiers, puis l'outil « Rédiger » de la liste (O1) : dictée (outil « Dicter » de la bande, micro allumé, lignes en direct) → lecture BDPM + IA qui corrige → lignes « à valider » pré-remplies par la posologie → Valider ; aussi saisie tapée, photo lue par l'IA, Ajouter (fiche médicament), et l'assistant (`ordonnance.new` « Fais une ordonnance pour Marie »). Fait 5 nov. (Web).
- [x] Document A4 (O4) : identité du praticien (profil professionnel, sinon fiche de base), demandée sur l'ordonnance quand elle manque et écrite dans la fiche ; patient, âge, « Lyon, le … », lignes, conseils. Réglages › Ma fiche › Profil › « Ordonnances » (O6) : la même identité, et les ordonnances reçues. Fait 5 nov. (Web).
- [x] Signature au doigt (O5, pinceau, gomme, Valider) ; Exporter (PDF A4). Fait 5 nov. (Web).
- [x] Imprimer partout (5 nov.) : une brique `file_export.js#printExportFile` (la page A4 en JPEG) ; Web = impression du navigateur ; iOS = `export_file_print` du pont natif existant (`NativePersonalImport.swift`, `UIPrintInteractionController`, iPad en popover) ; Tauri = commande `export_file_print` (`native_file_export.rs` : fenêtre de la page seule, `print()` de la webview sur macOS, `window.print()` ailleurs ; Android : `export_print_unavailable`). Annulé par la personne = pas une erreur ; hôte sans impression (AUv3, Android) = `ordonnance_print_unavailable`. Preuve : pont factice dans la sonde (appel, JPEG A4, imprimé / annulé / indisponible) ; Swift `swiftc -typecheck` propre sur les 3 fichiers ; `cargo clippy -p squirrel --all-targets` sans avertissement first-party. Jamais lancé sur appareil (test de l'utilisateur).
- [x] Envoi : outil Envoi → Publier (`openListSend`), et `ordonnance.send` vers le compte du patient ; le patient la valide, ses lignes deviennent ses médicaments et son papier signé (scellé par la session Médicaments) est son ordonnance reçue. Fait 5 nov. (Web, de bout en bout).
- [x] Conseils alimentaires du médecin (5 nov., décision du coordinateur, même motif) : une phrase « Conseil : … » dictée ou tapée devient une ligne « Conseil » (même brique de ligne), un `food_advice_tip` (D28) sous la liste, signé de son nom, ses aliments lus par la base de règles ; touchée deux fois, elle est retirée ; imprimée sous les médicaments, figée à la signature, et sur le papier du patient. Fait (Web).
- [x] Le conseil appliqué chez le patient : validée, la liste lui donne le conseil, et sa fiche d'aliment montre « Conseil · Dr Claire Martin » (sceau des enfants par la session Médicaments). Fait 5 nov. (Web, sonde).
- [x] Une famille MCP/voix `ordonnance.*` (16 commandes, dont `tip_remove` ; seuls `open` et `new` ouverts à l'assistant et au MCP, le reste = la personne dans l'app).
- Preuve : `PROBE_PREBUILT_SERVER=1 node temp/d18_ordonnance/ordonnance.probe.mjs` → 57/57 (`temp/d18_ordonnance/run14.log`), `node temp/d18_ordonnance/unit.mjs` → 16/16 ; captures `temp/d18_ordonnance/out/`.
- Maquettes O1–O6 validées : `temp/d18_plan/ordonnance_mockups/out/` ; identité lue dans la fiche du praticien (profil professionnel, sinon de base), sinon saisie sur l'ordonnance qui remplit la fiche.

### Points validés le 5 novembre sur des lots déjà codés
- [x] D13 : icônes = SVG d'eVe dans le catalogue du widget (fait 5 nov., appex compilé) ; « 0:42 », toucher → séance, rien pendant le 3-2-1 gardés.
- [ ] Tuile Agenda d'eVe Pro : plus de défilement latéral (règle à un axe).
- [x] Admin partout : serveurs locaux iOS/Tauri relaient les trames d'admin vers atome.one. Codé 5 nov. (`account-roles`, `feature-request-admin`, `share` avec le jeton distant du compte ; `public_relay.rs` clippy propre, `FastifySyncPublicRelay.swift` analysé) ; jamais lancé sur appareil.
- Groupe de contacts (grille depuis le bas), Roadmap, motif de refus, aperçu de page (site nommé, Autoriser, Réseau des pages, « Lancer ») : gardés tels que codés.

### D27. Aide à la prescription — FAIT (5 nov. 2026, Web ; `PROBE_PREBUILT_SERVER=1 node temp/d18_rx_aid/rx_aid.probe.mjs` 56/56 ; restes nommés dans R-115)
- [x] Symptômes (patient ou médecin, voix ou texte) → pré-diagnostic, traitement suggéré et pré-ordonnance par l'assistant ; le patient les voit aussi, « à valider par le médecin », et les envoie à un médecin de ses contacts, qui valide, corrige ou refuse. (Écrans `prescription_aid_screens.js`, famille `prescription_aid.*` ; l'outil « Sympt. » de la bande Médicaments est une jointure laissée à son propriétaire, R-115.)
- [x] Contrôles par règles sur l'appareil (Thésaurus ANSM + RCP §4.3/4.4/4.5 importés par le binaire Rust avec la BDPM) : médicament–médicament, médicament–aliment (liste de courses, repas des objectifs), allergies et antécédents du Carnet. (`prescription_aid_rules.js` ; aliments : `prescription_aid.food_flags`, la liste et les repas les lisent par D28 dès la liste reçue ; antécédents montrés au médecin, pas encore règle.)
- [x] Ligne en cause marquée (raison, source), alternative ou écart d'horaire proposé ; une contre-indication bloque Valider tant que le médecin ne l'a ni changée ni confirmée ; l'aliment à éviter signalé sur la liste de courses et les repas.
- [x] Horaires de prise optimisés (RCP, repas, sommeil), proposés et ajustables dans les marges des règles. (La journée est lue : programme Sommeil, repas tenus ; un fait absent est montré inconnu et l'heure suit alors les espacements.)
- [x] L'assistant ne reçoit symptômes et éléments du carnet que le temps d'une demande lancée par la personne.
- Maquettes P1–P5 : `temp/d18_plan/prescription_aid_mockups/out/` (à valider).
- Maquettes P1–P5 validées ; lever un blocage : toucher la ligne → Remplacer ou Confirmer. Captures du rendu : `temp/d18_rx_aid/out/`.
- [x] (5 nov.) Restes fermés : « Sympt. » dans Médicaments, aliments par D28 (pré-ordonnance validée = traitement), journée lue, aides reçues dans Profil › Ordonnances, antécédents × RCP 4.3/4.4, ligne bloquée amenée en vue (`run23.log` 66/66). Reste le sceau du partage (agent médicaments).

### D28. Conseils alimentaires selon la santé — transverse — FAIT (5 nov. 2026, Web ; reste l'écran de saisie du médecin, sans maquette — R-115)
- [x] Base de règles sourcée dans eVe (HAS, ANSES/PNNS, FFD…) par pathologie et allergie : aliments déconseillés (raison, source), conseils de cuisson et de préparation, idées reçues corrigées ; appliquée par règles, expliquée par l'assistant.
- [x] D'office dès qu'une pathologie ou une allergie est au Carnet ; le médecin peut ajouter, retirer, nuancer par une liste envoyée (validée par le patient), ses ajouts portent son nom. (Commandes, envoi par share.send/accept et application faits ; l'écran de saisie du médecin attend sa maquette — R-115.)
- [x] Partout où il y a un aliment : verdict du scanner, liste de courses, repas et recettes des objectifs, assistant (food_advice.rules). Fiche de médicament/complément : interactions et espacements (food_advice.products), même rangée, Pourquoi/Source au toucher.
- Maquettes F1–F4 validées : `temp/d18_plan/food_advice_mockups/out/` ; le verdict principal suit la santé de la personne.

### D29. Compléments alimentaires — parité avec les Médicaments — À réaliser
- [x] Parité D24 (fiche, heures, si besoin, début/fin, Pause/Arrêter/Supprimer, historique, rappels) : mêmes briques, fait 5 nov. (Web, `temp/d18_meds/meds.probe.mjs`).
- [x] Exactement la même chose que D24–D27 : partage de liste, interactions (règles enrichies de la nutrivigilance ANSES et des ingrédients Compl'Alim), optimisation des horaires, selon la pathologie ou l'objectif. (D28 : interactions aliment, médicament et pathologie, espacements en heures, mêmes lignes qu'un médicament — `temp/d18_food/food.probe.mjs` 51/51.)
- [x] (5 nov.) Préconisations, interactions, posologies et conseils tiennent compte des allergies, intolérances, interactions, espacements et de TOUS les paramètres physiologiques et biologiques de la personne (âge, poids, taille/IMC, sexe, grossesse/allaitement, fonction rénale et hépatique, glycémie/HbA1c, tension, biologie du Carnet) — D24, D27, D28, D29.
  - FAIT 5 nov. (recoupement R-115) : un lecteur pour tout, `readFoodAdviceContext`. La fiche médicament ou complément, l'ordonnance (lignes vérifiées contre le Carnet du patient), l'aide à la prescription et les fiches d'aliment croisent les compléments × médicaments (règle ANSES lue dans les deux sens), les compléments entre eux, les allergies, les antécédents, le profil (RCP 4.3/4.4/4.6), grossesse et allaitement, les aliments achetés ou mangés, le sport et le sommeil (RCP 4.2–4.8). Conduite, soleil et alcool se déclarent dans Préférences › Santé (« Je conduis », « Exposition au soleil », « Alcool » en verres par semaine sur le rouleau) ; jamais déclarés, ils restent « inconnu », jamais supposés. Preuve : `temp/d18_cross_check/cross.probe.mjs` 44/44, `rx_aid.probe.mjs` 68/68, matrice `temp/d18_cross_check/matrix.md`.
  - D27 (5 nov.) : la pré-ordonnance lit tous ces paramètres (`readPersonParameters` → profil du contrat, critères RCP 4.3/4.4, posologie) ; un paramètre absent est montré « inconnu », jamais deviné ; compléments contrôlés comme les médicaments (thésaurus + règles ANSES). Ligne gardée ouverte pour D24/D28/D29.
- [ ] (5 nov.) eVe Basic : un médicament (déclaré, scanné ou reçu puis validé) fait gagner la tuile Activité.

### D30. Activités — le disque orange met en pause — FAIT (5 nov. 2026, Web)
- [x] Pendant une séance (ex. les pompes), toucher le disque orange = pause, un nouveau toucher reprend ; plus jamais la phase suivante au toucher.
- [x] Outils du bas pendant la séance : « Suivant » (phase suivante) et « Stop ». Toutes les activités au disque orange.
  Preuve : `PROBE_PREBUILT_SERVER=1 node temp/d18_disc_pause/disc_pause.probe.mjs` → 37/37 (pompes, chaise au mur, sieste ; Live Activity
  `paused`, minuteur figé, aucun bip placé en pause ; MCP `training.card_action` pause / resume / next / stop), captures `temp/d18_disc_pause/out/`.
  En pause le disque garde son chiffre, son mot devient « En pause » ; « Filmer » reste entre Suivant et Stop. Reste : la montre (son disque
  envoie toujours `done`, Swift non touché).
- [x] D30 montre (5 nov.) : le disque de la montre met en pause et reprend (`act("pause")`), et l'outil de la page Contrôles est « Suivant » (`act("next")`, libellé `forward` donné par `dashboard_ongoing_entry.js`). `WatchCardScreen.swift`, `WatchLinkModel.swift`. Le Swift passe `swiftc -parse`. Pas encore lancé sur une montre : c'est le test de l'utilisateur.

### D31. Activités — se filmer : choix de la caméra, et blocage après l'arrêt — À corriger
Demande de l'utilisateur (5 nov.) : « on peut pas changer de caméra… on clique sur filmer, il faut qu'il propose caméra frontale, choisir la caméra » ; « une fois que c'est filmé, j'arrête, tout est bloqué, je peux pas fermer la fenêtre, j'ai plus qu'à envoyer… ça plante » (peut-être une ancienne version).
- [x] Pendant une séance filmée, l'outil « Caméra » de la bande passe à la caméra suivante (frontale ↔ arrière, ou entrée vidéo suivante). C'est le même outil que la capture du Dashboard (`ui.capture.camera_switch`, `camera_source.js#nextCameraSource`) : même motif, donc pas de maquette. Il n'apparaît que s'il y a plus d'une caméra.
  FAIT (5 nov., Web) : bande Suivant · Caméra · Filmer · Stop ; comme la capture, la prise vidéo en cours est gardée (liée à la séance) et
  la suivante démarre sur l'autre caméra ; MCP `training.card_action camera`. Preuve : `PROBE_PREBUILT_SERVER=1 node temp/d18_disc_pause/film_camera.probe.mjs`
  → 37/37 (deux fausses caméras Chromium), captures `temp/d18_disc_pause/out_film/`.
- [x] Après l'arrêt d'une prise filmée, rien ne reste bloqué : on peut fermer, revenir et reprendre. Reproduire sur Web, trouver la cause et la corriger.
  FAIT (5 nov., Web). Cause trouvée : la séance d'une carte (`dashboard_training_session.js#record`, Sport et séances-briques) REFUSAIT
  tout geste touché pendant qu'une autre écriture de la séance était en cours (le départ, une pause, une fin de pas) : le Stop était perdu
  sans rien dire, la séance restait « en cours », sans résumé ni sortie — intermittent sur Web, d'autant plus probable que l'écriture est
  lente (iPad). Correction : une écriture à la fois, dans l'ordre des touchers ; un geste touché pendant une écriture attend sa fin et part
  sur la nouvelle révision ; un geste dont le pas est déjà fini (double Suivant) ou dont la séance est finie n'écrit rien. La piste
  « Mystic resté hébergé après Back » : c'est le comportement voulu — Back (« Passer », `card_action back`) ramène la carte à son
  départ, toujours ouverte ; son ✕ la ferme et l'accueil répond. Preuves : `PROBE_PREBUILT_SERVER=1 node temp/d18_disc_pause/move_in_flight.probe.mjs`
  → 4/4 (avant correction 2/4 : Stop perdu) ; `temp/d18_disc_pause/back_freeze.probe.mjs` → 82/82 deux fois (Pompes et Sieste, ouvertes
  depuis leur plate et depuis Récent, filmées pour Pompes, Stop, puis « Passer » ou `card_action back`, ✕, toucher sur l'accueil qui rouvre
  la carte ; captures `temp/d18_disc_pause/out_back/`) ; avant correction, une exécution sur trois perdait le Stop de la Sieste.

### D32. Activité — une tuile « Récent » — FAIT (5 nov. 2026, Web)
Demande de l'utilisateur (5 nov.) : « il faudra rajouter aussi récent. On clique dessus, on aura… les plus récentes… Pas la peine d'en mettre des tonnes. Mais tu peux remplir les cases avec les dernières activités récentes, ça permet de reprendre… où on en était. »
- [x] Une plate « Récent » dans la rubrique Activité (eVe Pro et eVe Basic), à côté de Médicaments. C'est le même motif qu'une plate de rubrique, donc pas de maquette.
- [x] Touchée, elle ouvre un niveau de tuiles qui ne remplit que les cases libres d'une page avec les activités les plus récentes, la plus récente en premier : séances, cartes, programmes, sans doublon. Une seule page, jamais de pagination.
- [x] Toucher une tuile reprend l'activité où on en était (la séance en cours ou en pause, sinon sa carte au point laissé).
- [x] La plate n'apparaît pas tant qu'aucune activité n'a été faite.
  Preuve : `PROBE_PREBUILT_SERVER=1 node temp/d18_recent/recent.probe.mjs` → 31/31 (compte neuf sans plate ; 18 activités, Pro et Basic ;
  une page pleine, la plus récente en premier, sans doublon, jamais de page suivante ; Pompes en pause reprises sur leur carte vivante à la
  même phase ; Méditation en pause sans carte reprise par sa carte ; Chaise au mur rouverte au niveau 2 laissé ; MCP `dashboard.activity.recent`
  et `dashboard.activity.resume`), captures `temp/d18_recent/out/`. Choix consignés dans R-115 (D32).

### D33. Activité terminée — un pouce levé et trois bips — Validé (5 nov.) : C + bips à chaque série
Demande de l'utilisateur (5 nov.), en deux temps :
- d'abord un gros pouce à la place du disque, « avec peut-être des points à récolter… pour encourager les gens » ;
- puis, précisé : « peut-être sur le panneau terminé, en face de terminé, tu mets un pouce, peut-être pas aussi énorme… et peut-être mettre un petit son… trois petits sons… très rapide. Pour signaler la fin de la série ».
Maquettes : `temp/d18_plan/done_mockups/out/` (a pouce blanc, b pouce orange, c pouce orange + ligne Points), sur l'écran « Terminé » réel.
- [x] Le pouce à côté de « Terminé » (variante choisie par l'utilisateur), seulement pour une activité menée à son terme, jamais pour « Arrêté ».
- [x] Trois bips courts et rapides à la fin de CHAQUE série (réponse de l'utilisateur), par le moteur de bips de D7, avec le même réglage de son.
- [x] Variante C validée : pouce orange + ligne « Points ». Points : un nombre naturel (règle 19), cumulé dans le compte (règle 21).
  FAIT (5 nov., Web) : `PROBE_PREBUILT_SERVER=1 node temp/d18_disc_pause/done_points.probe.mjs` → 18/18 (3 bips par série, aucun en fin de
  repos ; pouce et Points sur Terminé, rien sur Arrêté ; total relu du profil après rechargement). Règle des points dans R-115.

### D34. Rouleaux — le glisser fait défiler le panneau au lieu du rouleau — FAIT (Web, 5 nov.)
Demande de l'utilisateur (5 nov.) : « des séries, on a des espèces de rouleaux… quand on clique, ça entraîne le panneau complet. Ça doit pas… quand on est sur un rouleau, automatiquement, ça le déroule. Et sur le panneau, ça scrolle, mais que ça scrolle pas le panneau quand on est sur le rouleau. »
- [x] Un glisser qui commence sur un rouleau fait tourner ce rouleau seul, sans jamais faire défiler le panneau qui le contient. Cela vaut pour tous les rouleaux : Séries, Rép., Repos, Charge, Max/jour, heures, dates.
- [x] Un glisser qui commence ailleurs dans le panneau le fait défiler, comme aujourd'hui.
- Cause : la fenêtre du rouleau était inerte, son champ de valeur large de son seul texte ; un appui à côté tombait sur la
  zone de défilement. Correction : la fenêtre porte le glisser (`bevy_panel_numeric_field.js#numericRollerFieldNode`,
  `pointer_capture`). Preuve : `temp/d18_rollers/rollers.probe.mjs` 72/72 (avant : 41/71). Fiche
  `known-bug-solutions/roller-drag-scrolls-panel/`.

### D35. L'assistante ne dit jamais qu'elle est prête — FAIT (Web, 5 nov.)
Demande de l'utilisateur (5 nov.) : à l'arrivée elle dit « Attends, je prépare tes documents », puis « Salut », jamais qu'elle est prête ; il doit demander « tu es là ? ».
- [x] Chaque fois qu'elle peut écouter (arrivée eVe Pro, ouverture au toucher, rappel avec contexte, session locale hors ligne), elle dit une phrase prête, avant toute parole du modèle ; le modèle n'est jamais invité à parler le premier à une arrivée simple.
- [x] Si on lui a parlé avant (`heard`), elle répond à cela ; sa propre phrase et le bruit ne comptent plus comme parole.
- [x] Une phrase prête impossible à dire devient une erreur visible de la session.
- Cause et correction : `known-bug-solutions/assistant-ready-sentence-missing/`. Preuve : `temp/d18_assistant_ready/ready_sentence.probe.mjs` 9/9 (avant : 4/9).
- [ ] Appareil (utilisateur) : sur l'iPad USB, la phrase prête s'entend à l'arrivée (route audio iOS quand le micro s'ouvre).

### Défauts connus du 5 novembre (session D18, Web) — détail : `todo/REGISTRE_DEMANDES.md` R-115
- [x] 1 Accueil couché : plus de défilement ni de curseur ; le cadre de l'accueil est un panneau découpé (`temp/d18_defects/landscape_scroll.probe.mjs` 33/33).
- [x] 2 Vignette de projet : la capture lit le média sur l'origine de l'app, plus sur 127.0.0.1:3000 (`temp/d18_defects/capture.probe.mjs`).
- [x] 3 Course Basic/Pro : reproduite (appareil sans copie du profil, lecture lente → Pro puis Basic) ; l'accueil n'est plus présenté que sur un style connu, sans délai ni niveau par défaut ; style absent = erreur explicite (`temp/d18_defects/basic_slow_profile.probe.mjs` 17/17 : rechargements, déconnexion → connexion même compte, autre compte Pro, retour depuis un projet ; captures `shots_basic_slow_profile/`). Reste : appareils (utilisateur).
- [x] 4 Couleurs lues en direct (rail d'imbrication, sol et film des panneaux, badge, marque des profils, Carnet) (`temp/d18_defects/live_colours.probe.mjs` 8/8) ; Live Activity confiée à la session Sport.
- [x] 5 Capture sur un compte neuf : un projet est créé pour les prises, plus de `dashboard_capture_project_missing` (`temp/d18_defects/capture.probe.mjs`).
- [x] 6 Caméra : plus aucune requête `stream://` (`temp/d18_defects/capture.probe.mjs` 10/10).
- [x] 7 Le rail contextuel ne couvre plus la fin de la timeline (`temp/d18_defects/rail_timeline.probe.mjs` 6/6).
- [x] 8 Tests périmés après D22 : aucun test ne cite les noms retirés ; rien à changer.

### D36. Tout ce qu'on crée doit pouvoir s'effacer — À corriger, transverse
Demande de l'utilisateur (5 nov.) : « si je crée un complément, si je fais un clic long dessus, je peux pas le supprimer. Ça doit être transverse… tous les items que l'on peut créer… Dès qu'on crée quelque chose, on puisse l'effacer. Et ensuite, tu vas challenger. »
- [x] Inventaire de tout ce qu'une personne peut créer (Dashboard et projet) : compléments, médicaments, listes, playlists, programmes, objectifs, alarmes, contacts, prises, dessins, modèles, ordonnances, profils de vie, projets…
  FAIT (5 nov., Web) : `temp/d18_delete/inventory.md`. 23 lignes. Les objets faits par le système sont nommés à part. Avant (code d'avant D36, vrais appuis longs) : 3 objets déjà OK et le texte de Créer par son bandeau ; 14 manques prouvés.
- [x] Chacun : l'appui long sur sa tuile ou sa ligne propose « Supprimer », au second toucher, comme partout. L'effacement passe par le pipeline canonique (corbeille si elle existe) et se fait aussi par commande vocale.
  FAIT (5 nov., Web) : `temp/d18_delete/d36/hold_delete.probe.mjs`, 17/17 objets sondés. Chacun : appui long réel, 1er toucher qui arme seulement, 2e qui efface, absent de l'écran, de la commande et du coffre, absent après rechargement. MCP : 13 OK, 4 familles de santé refusées par conception. Pas de corbeille dans le code : l'effacement canonique est `kind: 'delete'`. Reste noté dans R-115 : le média importé de la Médiathèque (copies de l'appareil en Rust/Swift) et l'objectif, corrigé mais non sondé sur le canevas.
  FAIT les restes (5 nov., Web) : média de la Médiathèque effacé de bout en bout (écran, commande, coffre, octets du serveur, magasin du navigateur, rechargement, 2e session ; Tauri et iOS compilés, non lancés), `media_import.delete` ; Loisirs (appui long réel : Favori) ; objectif sondé sur eVe Basic (2 touchers, MCP) ; chaîne d'effets et effet enregistré sondés. Détail dans R-115.
- [x] Une revue adverse de l'inventaire et des preuves (« challenger »).
  Revue faite : `temp/d18_delete/challenge/report.md` (19 constats). FAIT (5 nov., Web) les constats 2–6, 9–13, 15–18 : une seule confirmation (l'état armé partagé de `bevy_ui_tools_band.js`, désarmé par tout toucher ailleurs), plus rien ne s'efface au 1er toucher, annonces et ventes vraiment effacées, machines effacées, séries gardées en Atomes propres (un écrit périmé ne les fait plus revenir), `calendar.delete_event` refuse un id inconnu. Détail et choix : R-115. Restent à l'autre agent : constats 1, 7, 8, 14, 19.
  FAIT (5 nov., Web) les constats 1, 7, 8, 14, 19.
  - Un projet effacé emporte son contenu.
  - Préréglages, livres, disciplines, pratiques, prises, ressenti, résultats de laboratoire, photos Beauté et imports
    Strava s'effacent, par commande et par appui long. Le ressenti et les résultats sont refusés à MCP.
  - Soins et séjour Thalasso, courrier du site, forums et messages de forum ont leur appui long (« Quitter » pour un
    membre). Un forum est une tuile.
  - Une liste faite pour soi est une tuile.
  - Une liste partagée effacée est retirée chez son destinataire, en direct.
  Sondes : `temp/d18_delete/d36b/items.probe.mjs` 24/24 et `lists_forums.probe.mjs` 14/14 (deux comptes).
  Corrigés ensuite, avec preuve : la tuile quittée suit aussitôt ; un retrait manqué hors ligne est rattrapé à la
  reconnexion ; l'appui long d'un outil du niveau de la rangée la plus basse s'ancre sur l'outil
  (`anchor.probe.mjs` 3/3, `lists_forums.probe.mjs` 16/16).
  FAIT (6 nov., Web, maquettes A validées) : les scripts d'un texte dans Créer › Texte › Calc › « Scripts », les activités
  Strava dans Sport › Journal, chacun effacé par son appui long (`script.remove`, `strava.remove_import`).
  Sonde `temp/d18_lists_mockup/proof.probe.mjs` 26/26. Détail dans R-115.
