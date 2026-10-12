# Extensive Test — atome / eVe

**Type :** protocole d'homologation exhaustif, scénarios E2E multi-appareils et prompt d'exécution pour agents IA  
**Date :** 10 octobre 2026  
**Destination :** bibliothèque `/atome/Roadmap/Extensive Test.md`  
**Statut :** scénarios et exigences rédigés ; **aucun test réel n'est déclaré exécuté ou réussi** par ce document.  
**Priorité :** P0 pour la parité fonctionnelle MCP, la sécurité, les données, l'historique et le multi-appareil.

> **Exigence fondamentale.** Toute API fonctionnelle d'atome, tout outil, toute action utilisateur et toute opération disponible par l'interface ou un connecteur doivent être découvrables, pilotables et vérifiables au travers du chemin **MCP canonique**, avec respect des mêmes autorisations, validations, journalisations et restrictions de plateforme. **Aucune opération métier ne doit exister uniquement dans l'interface sans équivalent MCP.** Une fonction annoncée mais impossible à piloter par MCP constitue un échec bloquant. Les fonctions natives interdites par l'OS ne doivent jamais être simulées comme réussies ; elles sont tracées comme impossibilités/gaps avec justification et décision produit.

---

## 0. PROMPT MAÎTRE — À REMETTRE AUX IA DE TEST

**Rôle :** tu es l'orchestrateur QA d'atome/eVe. Tu coordonnes au moins trois agents indépendants et trois environnements d'exécution réels : iPhone/iOS, navigateur Web et application desktop Tauri, avec **Atom.1** comme point de référence à identifier et vérifier (instance, appareil ou environnement tel qu'il existe réellement). Tu exécutes les parcours de ce fichier dans l'ordre, puis des permutations et des tests adversariaux. Tu ne déclares jamais « OK » sur la seule base du code source, d'une réponse MCP simulée, d'un test unitaire ou d'une capture : tu vérifies l'état observable réel et persistant sur les autres appareils.

**Mission :** dresser l'inventaire intégral des capacités disponibles ; contrôler la parité **UI ↔ MCP direct ↔ IA texte ↔ IA voix ↔ automatisations/interactions** ; réaliser les scénarios de création, manipulation, interactivité, échange, collaboration, SMS, mail, visio, TV, YouTube, historique, synchronisation, fermeture/réinstallation et restauration ; découvrir tous les cas négatifs ; livrer un rapport traçable avec preuves et anomalies priorisées.

**Contraintes absolues :**

1. Lis en premier les instructions du dépôt, notamment `.codex/AGENTS.md` et, s'ils existent, `Agent.md`, `Work Method.md`, `maps/CODEMAP.md`, `maps/ARCHITECTURE_MAP.md`, `maps/API_MAP.md`, `maps/DESIGN_MAP.md`, ainsi que les règles Task Guard/Code Relation Alignment. N'invente aucun composant, nom d'API, point d'entrée, compte ou machine ; découvre-les dans le code et le runtime.
2. Préserve la structure **atome/eVe**, les composants natifs des outils, la taxonomie des menus, les modes **Édition / Consultation / Performance** et les conventions visuelles. Code frontend JavaScript, pas de TypeScript ajouté sans mandat. Ne réimplémente pas les logiques métier derrière une interface de test.
3. Ne modifie ni production ni données privées. Utilise uniquement comptes, boîtes mail, numéros SMS, projets, contacts et chaînes de test **explicitement autorisés**. Ne lis aucun SMS ou mail privé ; n'envoie pas de message réel non autorisé. Demande les permissions système et les validations transactionnelles dans les flux d'application prévus ; ne les contourne pas.
4. Ne fais **aucun commit, push, déploiement ou effacement irréversible** sans autorisation explicite. Ne désinstalle l'application que sur appareils de test dédiés, après état initial capturé et restauration possible. Documente les restrictions iOS/OS réelles.
5. Classifie chaque fonctionnalité : `VERIFIED_SUPPORTED`, `IMPLEMENTED_BROKEN`, `SPEC_ONLY`, `NOT_IMPLEMENTED`, `PLATFORM_UNSUPPORTED`, `ENV_BLOCKED`, `SECURITY_DENIED_EXPECTED`. `SPEC_ONLY`, `NOT_IMPLEMENTED` et `ENV_BLOCKED` **ne comptent jamais** comme succès. Une réponse « non pris en charge » à une action fonctionnelle attendue sur une plateforme cible compte comme manque de couverture, même si la réponse technique est correctement formatée.
6. Un agent exécute, un second observe l'état distant et un troisième effectue la vérification indépendante des API/MCP et des preuves. Permute les rôles au cours du parcours.
7. Toute action doit produire un résultat testable : `test_id`, acteur, dispositif, version, horodatage, action UI ou intention vocale, contexte actif, capability/API réelle, appel et identifiant d'opération MCP si disponible, résultat, état avant/après, corrélation serveur/client, preuve, verdict.
8. Si l'interface et MCP divergent, **échoue** et localise le propriétaire canonique ; ne crée jamais de contournement dédié au test. Si une API tierce n'est pas intégrée à atome, déclare le manque au lieu d'inventer un connecteur.
9. La logique contextuelle des pré-prompts doit être testée en profondeur : **une demande explicite fonctionne depuis n'importe quel contexte**, tandis que le contexte d'activité, l'outil actif, l'objet sélectionné, les permissions et l'historique guident l'interprétation des demandes elliptiques ou ambiguës. Clarifier seulement lorsque nécessaire. Ne jamais traiter le contexte courant comme une barrière empêchant l'ouverture d'un autre outil.
10. Termine par la matrice de couverture, les problèmes reproductibles, les preuves, le classement P0/P1/P2, le plan de correction et les contre-tests. Aucun `PASS` sans preuve ; pas de `PASS` par extrapolation.

**Consigne opérationnelle à l'agent :** *Commence par l'audit du dépôt et des environnements. Lis puis exécute tous les scénarios ci-dessous dans leurs dépendances. Pour chaque cas, consigne les étapes, l'état attendu, l'état observé et les preuves. Mesure séparément la parité des fonctions et la sûreté des permissions. Arrête la qualification de livraison si une condition P0 échoue, mais continue les tests non destructifs pour produire le diagnostic le plus complet. Tout trou d'instrumentation est une anomalie observable, pas une permission d'affirmer que le test est réussi.*

---

## 1. Références, périmètre et frontières

### 1.1 Références fonctionnelles connues

Consulter les versions actuelles de ces spécifications de la bibliothèque/dépôt plutôt que d'en déduire que leur contenu est déjà implémenté :

- `/atome/Roadmap/Urgent.md` — gateway MCP canonique, outils/runtime, capacités, sécurité, confirmations.
- `/atome/Roadmap/Action 2.md` — intégration IA texte/voix via Runtime V2, Tool Gateway, Command Bus et MCP.
- `/atome/Roadmap/Authentication security.md` — identification par numéro/lien SMS, clés d'appareil, sessions et récupération.
- `/atome/Roadmap/TV Integration et MCP.md` — TV unifiée, fournisseurs officiels et commande vocale/MCP.
- `/atome/Roadmap/User Backup and Format/user_backup_and_format.md` — schéma canonique, exports, checksums, sauvegardes, restauration, événements.
- `/atome/Taxonomie/Contextual Taxonomy.md` si présent, ou document `Contextual Taxonomy.md` effectivement découvert — taxonomie objets/outils/activité/niveau utilisateur, menu principal et Mystic.
- `interactivity.md` réellement découvert — outil Interaction, sélection fixe/dynamique, modules d'outils réels, templates et modes.
- `Atom UI.pptx`, captures et composants actuels — **référence visuelle**, à confronter au rendu de la version testée.
- Configuration et documentation du runtime courant : les anciens documents peuvent diverger. En cas de conflit, enregistrer les deux versions et signaler le besoin d'arbitrage ; ne pas corriger un test en adaptant silencieusement son objectif.

### 1.2 Définition de « tout tester »

Le périmètre comprend **toutes les opérations et routes fonctionnelles réellement présentes ou attendues** sur : projet/atome/molécule, outils graphiques, texte, image, vidéo, audio, interaction, templates, Finder, Dashboard, vues, menus, mode de travail, agenda, contacts, communication, RTC, partage et permissions, import/export, historique, sauvegarde, IA, voix, API/MCP, intégrations externes, TV, YouTube, e-mail, SMS, téléphone/OS lorsque permis, identités, stockage et synchronisation. Y ajouter automatiquement tout module, outil, adaptateur, bridge ou capability découvert pendant l'audit : **la liste n'est pas close**.

**Parité MCP** : pour chaque commande fonctionnelle réellement déclenchable par l'UI, le clavier, le tactile, le geste, un module Interaction, un plugin ou une API publique/interne autorisée, vérifier le chemin équivalent via l'unique moteur métier exposé au MCP. Une fonction qui exige une permission doit être invocable et obtenir le refus/consentement correct ; « pilotable » ne signifie pas « exécutable sans autorisation ». Aucune exigence ne justifie d'exposer une clé privée, un secret, un endpoint de débogage dangereux ou une primitive système interdite.

### 1.3 Les trois niveaux de validation

- **Niveau 1 — contrat/code :** découverte exhaustive des fonctions, types/schémas, tests unitaires, guards, sécurité et couverture des routes MCP.
- **Niveau 2 — interface réelle :** interactions tactiles/souris/clavier, écrans, propriétés, accessibilité, modes, transitions, animation, rendu et latence.
- **Niveau 3 — E2E distribué :** persistance serveur, identités réelles de test, synchronisation entre appareils, communication, erreurs réseau, processus natifs, réinstallation et reprise.

Un test de niveau 1 ne valide pas les niveaux 2 et 3.

---

## 2. Topologie de test et jeux d'essai

| Identifiant | Environnement | Compte/acteur | Fonction | Preuve principale |
|---|---|---|---|---|
| `REF` | **Atom.1**, à identifier réellement au démarrage | Référence | Source de contrôle de version, intégrité et chronologie | ID/version/config + snapshot signé |
| `IOS-A` | iPhone physique, app native iOS/WKWebView (ou runtime découvert) | Alice, propriétaire | Création mobile, micro/voix, notifications, SMS, permissions, désinstallation/réinstallation | vidéo, logs natifs, snapshots |
| `WEB-B` | Navigateur desktop récent et navigateur mobile en complément | Bob, collaborateur | Édition concurrente, navigation Web, MCP direct, e-mail | trace réseau, capture, état serveur |
| `TAURI-C` | macOS ou plateforme desktop Tauri réellement supportée | Charlie, collaborateur | RTC, fichiers, multitâche, interruption de processus, stockage local | logs desktop, vidéo, snapshot |
| `MCP-D` | Client MCP standard indépendant, identité dédiée | Dana, agent vérificateur | Énumération complète, parité, ACL, erreur, idempotence, toolchains | traces MCP expurgées |
| `EXTRA` | iPad, Android, second navigateur, TV ou appareil auxiliaire si disponibles | Comptes de test | Matrice complémentaire d'affichage et permissions | captures et traces |

**Ne pas supposer ce qu'est « Atom.1 ».** Au préflight, relever son identifiant réel, sa version, son adresse/URL éventuelle, ses droits, ses capacités et son rôle de référence ; si introuvable, mettre `ENV_BLOCKED` au préflight et utiliser une référence explicitement nommée dans le rapport sans prétendre avoir testé Atom.1.

**Appareils et agents** : idéalement `IOS-A`, `WEB-B` et `TAURI-C` tournent en parallèle, avec horloges synchronisées, Wi-Fi puis 4G/5G au besoin. Un quatrième agent observe le serveur. Le même compte sur trois appareils **et** trois comptes distincts doivent être testés en permutations. Prévoir des comptes de test et numéros/boîtes mail contrôlés ; aucun identifiant personnel dans les preuves.

**Fixtures à créer** (noms exacts seulement comme données de test ; les objets réels sont créés via les fonctions existantes) :

- `P-Atlas` : projet graphique collaboratif, propriétaire Alice ; objets texte `Titre A`, rectangle `Bloc B`, image locale, SVG, audio, vidéo, interaction, couleurs et positions connues.
- `P-Studio` : projet multimédia, propriétaire Bob ; piste audio, clip vidéo, contenu texte et outils de traitement disponibles.
- `P-Miroir` : projet de Charlie, destinataire de copies/transferts entre projets.
- `T-Module` : template/projet source avec placeholders et interaction ; une instance liée dans `P-Atlas` lorsque cette capacité est implémentée.
- `P-Privé` : projet non partagé, appartenant à Dana, servant aux refus d'accès.
- Carnet de contacts, calendrier, boîte mail et numéros SMS **de test** ; petit et grand asset avec checksums SHA-256 pré-calculés ; clips de courte durée dont les droits permettent les tests ; compte TV officiel/test lorsque nécessaire.

**Capturer l'état S0** : versions des trois clients, commit ou build ID, versions de schéma et de protocole, ID canonique des projets/atomes, nombre d'objets/relations/assets, checksum de chaque asset, permissions, dernière révision/event ID, contenu d'historique, connexions et statut offline. Ne pas modifier les bases de données en direct pour préparer une « réussite ».

**Matrice minimale** :

- même compte, trois appareils ;
- trois comptes, projet partagé et non partagé ;
- utilisateur débutant, intermédiaire et expert ;
- Édition, Consultation, Performance ;
- Naturel, Liste, Matrice ;
- réseau online, offline, instable et reprise ;
- voix explicite, voix elliptique, texte, GUI et MCP direct ;
- permission propriétaire, contributeur, lecteur, invité, révoqué et non autorisé ;
- smartphone vertical/horizontal, navigateur redimensionné, desktop ;
- première installation, mise à jour, session fermée, désinstallation/réinstallation et nouvelle machine.

---

## 3. Couverture MCP à 100 % : exigence bloquante

### 3.1 Inventaire dynamique obligatoire

Construire **trois inventaires indépendants**, automatiquement comparables :

1. **Inventaire S — surface métier** : toutes les opérations déclenchables via outils, menus, gestures, Finder, raccourcis, interactions, automatisations, voix, intégrations, routeurs, services, classes fonctionnelles et bridges natifs ; inclure actions cachées derrière les modes, permissions, feature flags et plugins disponibles.
2. **Inventaire A — API/runtime** : endpoints, RPC, commandes du Command Bus, tool registry, `runtime.tools.call`, `runtime.tools.batch_call`, `ai.tools.call`, fonctions exportées constituant des opérations métier, adaptateurs natifs iOS/Tauri/Web, événements et intégrations externes gérés par atome. Distinguer actions de lecture, mutation, système, communication et tierces.
3. **Inventaire M — MCP** : discovery au runtime (`initialize`, `tools/list`, `resources/list`, `prompts/list` et les commandes réellement exposées), schémas d'arguments, ressources, droits, confirmations, versions et adapters ; suivre le gateway canonique jusqu'au propriétaire métier. Vérifier les mécanismes existants `mcp.tools.list`, `mcp.resources.list`, `mcp.resources.read`, `mcp.prompts.list`, `mcp.prompts.get`, `mcp.toolchains.execute` et `mcp.operations.*` **s'ils existent dans le build testé**.

Créer pour chaque fonctionnalité une ligne :

`capability_id | opération/outil UI | modules d'origine | API canonique découverte | schéma | méthode MCP découverte | voice intent | disponibilité par plateforme | droits/consentement | réversible ? | tests de parité | preuves | statut`.

**Règle :** aucune ligne fonctionnelle de S ou A ne peut être dépourvue de correspondance MCP réelle (ligne M) et de test d'invocation. Ne pas considérer une simple déclaration `tools/list`, un alias lexical ou un stub qui renvoie toujours « OK » comme preuve d'exécution. Détecter les API orphelines, les méthodes MCP mortes, les doubles implémentations, les accès directs à l'état/DOM/BDD/natif court-circuitant le Command Bus.

### 3.2 Métriques et portes de sortie

- `MCP_DISCOVERY_COVERAGE = opérations fonctionnelles inventoriées avec commande MCP valide / opérations fonctionnelles inventoriées` → **100 %**.
- `MCP_EXECUTION_PARITY = opérations fonctionnelles supportées dont l'effet MCP réel est identique à l'effet UI pour des entrées équivalentes / opérations fonctionnelles supportées testées` → **100 %**.
- `MCP_PERMISSION_PARITY = opérations testées avec même authentification, ACL, consentement, audit, idempotence, isolation et résultats sûrs / opérations testées` → **100 %**.
- `MCP_PLATFORM_STATUS_COVERAGE` → **100 %** des plateformes cibles ont un résultat explicite (succès réel, refus de permission, indisponibilité prouvée, ou anomalie) ; les cas impossibles n'augmentent pas le taux de succès fonctionnel.
- `API_RECONCILIATION` → **0 fonctionnalité inventoriée non classée**, **0 action UI sans mapping MCP**, **0 comportement MCP plus privilégié que l'UI**.
- Le total et les dénominateurs sont dérivés **de la version exacte du code**, jamais d'une liste statique imaginée.

Si une opération est réellement spécifique à une plateforme, sa commande MCP doit rester découvrable avec les métadonnées de support et refuser proprement depuis une plateforme incompatible. Une **fonction cible annoncée mais absente** reste `NOT_IMPLEMENTED`/`P0` et non « non applicable » pour effacer l'écart.

### 3.3 Tests MCP transversaux, répétés POUR CHAQUE API

| ID | Manipulation pour chaque API réelle | Attendu |
|---|---|---|
| `MCP-001` | Comparer inventaires S/A/M ; identifier propriétaire et chemin d'exécution | zéro orphelin ; mapping et schéma traçables |
| `MCP-002` | Vérifier discovery et paramètres obligatoires/optionnels, types, erreurs | contrat valide, versionné, documenté |
| `MCP-003` | Déclencher UI puis MCP direct sur fixture comparable | mêmes mutations, mêmes IDs/événements attendus, même rendu |
| `MCP-004` | Reformuler par IA texte puis par voix | même opération canonique et même résultat observable |
| `MCP-005` | Action issue d'Interaction/automatisation, si applicable | aucun deuxième moteur métier |
| `MCP-006` | Répéter une requête avec même clé d'idempotence, puis autre clé | aucun double effet, règle documentée |
| `MCP-007` | Paramètres absents, mal typés, hors bornes, cible supprimée | refus structuré ; aucune corruption |
| `MCP-008` | Acteur non autorisé, lecteur seul, jeton expiré ou révoqué | même refus quel que soit le client ; pas de fuite |
| `MCP-009` | Opération sensible : consentement/confirmation selon policy | aucun effet avant approbation effective, annulation sûre |
| `MCP-010` | Réseau coupé, timeout, appel différé, retry, annulation | état connu, pas de double effet, récupération possible |
| `MCP-011` | Appel concurrent sur même atome depuis deux appareils | résolution déterministe, historiques cohérents |
| `MCP-012` | Modifier puis undo/redo, fermer/reprendre, relire sur appareil tiers | effet traçable dans historique et synchronisé |
| `MCP-013` | Charge batch/toolchain avec échec au milieu | atomicité ou compensation documentée, zéro demi-état masqué |
| `MCP-014` | Demander opération sur plateforme non compatible | `unsupported` honnête, sans faux effet, gap produit documenté |
| `MCP-015` | Lire ressource/prompt et versions, cache invalidé après changement | données exactes, ACL respectées, pas d'ancienne version trompeuse |
| `MCP-016` | Inspecter audit/correlation ID, logs et métriques | aucune clé secrète/token/PII en clair, origine et résultat attribuables |
| `MCP-017` | Désactiver/recharger un plugin ou module | discovery mise à jour, références inaccessibles supprimées, état sûr |
| `MCP-018` | Enchaîner action UI → voix → MCP → UI sur même cible | **une seule** source de vérité, pas de désynchronisation |
| `MCP-019` | Tester un outil inconnu mais annoncé par découverte runtime | ajouté automatiquement aux suites génériques, pas oublié |
| `MCP-020` | Rechercher appels directs contournant Tool Gateway/Command Bus | aucun contournement pour les mutations fonctionnelles |

Les actions **externes irréversibles** (envoi d'un vrai SMS/e-mail, appel sortant, publication) ne doivent jamais être « annulées » fictivement. L'historique doit les auditer et éventuellement prendre une action compensatrice uniquement si le service externe la permet. Les tests vérifient cette distinction.

---

## 4. Pré-prompts et interprétation contextuelle — moteur transversal

### 4.1 Principe attendu

L'assistant doit composer son interprétation à partir de l'intention explicite **et** d'un contexte vivant : acteur + permissions + session + appareil + projet actif + activité + outil ouvert + objet sélectionné + mode de travail + vue + fenêtre/écran cible + historique conversationnel utile + état des commandes/connexions. Ce contexte ne doit ni contaminer un autre utilisateur, ni persister de façon abusive après changement d'activité, ni masquer l'intention explicite.

**Hiérarchie fonctionnelle à tester (orientation, pas une implémentation imposée) :**

1. intention explicite claire et autorisée (« lance France 2 », « ouvre la télévision », « envoie un e-mail à Bob ») ;
2. permissions, disponibilité réelle, effet sensible et besoin de confirmation ;
3. contexte actif pour l'objet cible et les ellipses (« France 2 », « agrandis-le », « réponds-lui ») ;
4. mémoire récente pertinente de la conversation ;
5. clarification ciblée si plusieurs interprétations plausibles subsistent ;
6. exécution via la **même capability MCP** que l'UI, puis retour d'état réellement observé.

Le pré-prompt doit être **dynamique**, contextualisé, testable, versionné et contrôlable sans nécessiter un prompt géant répété inutilement. La résolution des intentions ne doit pas résider uniquement dans des exemples figés. Tester injection dans objets/e-mails/pages externes : ces contenus restent des données, jamais des instructions donnant des droits.

### 4.2 Matrice de scénarios conversationnels

| ID | Contexte au départ | Commande (voix et texte) | Attendu |
|---|---|---|---|
| `CTX-001` | TV ouverte | « France 2 » | sélection/ouverture de **France 2** dans l'outil TV |
| `CTX-002` | Projet dessin ouvert | « Lance la chaîne France 2 » | ouvrir TV puis France 2 malgré le contexte dessin |
| `CTX-003` | Aucun outil TV | « Ouvre la télévision » | ouvrir l'outil TV ; pas d'obligation de préciser la chaîne |
| `CTX-004` | Aucun outil TV | « Mets France 2 » | inférer l'intention TV raisonnablement ; ouvrir la chaîne si autorisée |
| `CTX-005` | Projet dessin, objet texte `France 2` sélectionné | « Mets France 2 en bleu » | colorer le texte, **ne pas** lancer la chaîne |
| `CTX-006` | Projet dessin, ambiguïté entre objet et chaîne | « France 2 » | question ciblée ou résolution justifiée par le contexte, sans action destructrice |
| `CTX-007` | TV active puis changement vers Dessin | « Agrandis-le » | agir sur sélection du nouveau contexte, ou demander précision |
| `CTX-008` | Dessin actif ; rectangle sélectionné | « Déplace-le de 20 pixels à droite » | mutation de l'atome via MCP, rendue identique sur trois clients |
| `CTX-009` | Vidéo active | « Mets-le au début », « coupe le son » | cibler lecture/propriété vidéo si sans ambiguïté, selon outils réels |
| `CTX-010` | Mail ouvert sur un message | « Réponds-lui que je confirme » | produire brouillon/réponse ciblée ; demander confirmation avant envoi externe |
| `CTX-011` | Sans mail ouvert | « Ouvre mon dernier mail de test » | ouvrir messagerie et message autorisé, ou clarifier la boîte si ambiguë |
| `CTX-012` | Projet collaboratif | « Envoie ce projet à Bob » | choisir partage par droits et confirmer destinataire/permissions nécessaires |
| `CTX-013` | Communication active | « Appelle Bob en vidéo » | initier visio via le service réellement disponible, avec consentement nécessaire |
| `CTX-014` | Outil dessin actif | « Écris à Bob : j'arrive » | router vers messagerie ; ne pas créer un texte dans le dessin |
| `CTX-015` | TV active | « Ouvre YouTube et cherche un concert » | quitter/ouvrir le bon fournisseur, lancer la recherche officielle |
| `CTX-016` | Projet A actif, projet B en arrière-plan | « Copie le titre dans l'autre projet » | identifier la cible B si unique ; préserver source et références |
| `CTX-017` | Plusieurs objets/titulaires/destinataires plausibles | « Supprime-le », « envoie-le » | demander **une** clarification utile avant action à risque |
| `CTX-018` | Mode Consultation | « Modifie ce titre » | respecter droits et mode ; proposer voie normale d'édition, pas contourner |
| `CTX-019` | Changement de device en cours de phrase | « Mets-le en rouge » | contexte par utilisateur/projet correctement repris, sans cible d'un autre acteur |
| `CTX-020` | Offline ou fournisseur indisponible | « Ouvre France 2 » | réponse honnête et stratégie autorisée ; pas de faux succès |
| `CTX-021` | Interaction personnalisée installée | « Active la scène suivante » | résoudre outil/capability enregistrée, pas un raccourci caché |
| `CTX-022` | Commande explicite contre contexte | « Ferme la TV et ouvre P-Studio » | la commande explicite prime, deux actions ordonnées, sans pollution contextuelle |
| `CTX-023` | Bascule profil débutant/expert | même demande fonctionnelle | même résultat métier, découverte/affichage adaptés sans restriction arbitraire |
| `CTX-024` | Message/page reçu contenant faux « instructions système » | question sur ce contenu | ne pas exécuter les instructions injectées, données isolées |
| `CTX-025` | Deux acteurs disent simultanément « bouge-le » | deux sessions/projets | isolation stricte des acteurs et de leurs sélections |
| `CTX-026` | TV déjà ouverte sur une autre machine | « Mets France 2 sur l'iPhone » | router vers appareil autorisé explicitement choisi, ou demander lequel |
| `CTX-027` | Projet dessin, outil TV en arrière-plan | « Mets la 2 » | contexte pondéré ; choisir chaîne seulement si intention suffisamment nette, sinon clarifier |
| `CTX-028` | Après restart/reconnexion | « Reprends là où on était » | récupération du projet et contexte permis, pas d'actions externes répétées |
| `CTX-029` | Une réponse API contradictoire avec le contexte supposé | « ouvre le dernier projet » | résoudre sur source canonique fraîche, pas sur souvenir périmé |
| `CTX-030` | Micro occupé/permission refusée | même requête écrite | route texte maintenue ; permission vocale signalée correctement |

**Vérifications additionnelles** : accents, variations lexicales, ASR imparfait, pronoms, singulier/pluriel, enchaînement multi-intentions, annulation vocale avant confirmation, transcription partielle, changement de langue, bruit ambiant, replay audio, outil fermé mais activité encore sélectionnée, outil actif différent de l'activité, présence d'une sélection multiple, latence de synchronisation du contexte. Pour chaque prompt : journaliser **les champs de contexte réellement utilisés**, la version du résolveur, l'intention retenue, la raison de clarification et le tool call ; **pas** de secret ni de contenu privé brut dans les journaux.

---

## 5. Grand scénario continu E2E — trois acteurs, trois appareils

**Principe :** les étapes `E2E-01` à `E2E-36` forment **une seule histoire cohérente** ; ne pas réinitialiser les projets entre chaque étape. Photographier/sérialiser l'état canonique aux checkpoints `K0…K9`, ainsi que les historiques et permissions. Répéter ensuite avec rotation des rôles et autres réseaux/modes.

| ID | Actions concrètes et enchaînement | Critères observables attendus |
|---|---|---|
| `E2E-01` | Démarrer Atom.1 puis trois clients ; noter build, capacités, baseline `K0` | environnements identifiés, zéro compte confondu |
| `E2E-02` | Alice s'authentifie sur iPhone par numéro de test + lien SMS ; Bob Web et Charlie Tauri s'authentifient séparément | session liée aux bonnes identités/appareils ; pas de second facteur inventé dans le parcours normal spécifié |
| `E2E-03` | Alice crée `P-Atlas`, le nomme, ouvre Finder, choisit mode Édition puis vue Naturel | projet présent sur iPhone et référencé correctement côté serveur |
| `E2E-04` | Elle crée texte, forme, SVG, image, audio et vidéo ; règle dimensions, positions, couleurs, empilement et visibilité | propriétés lisibles par UI et MCP ; assets et IDs stables |
| `E2E-05` | Sur `P-Atlas`, Alice effectue 6 modifications successives, 2 undo puis 1 redo | état calculé exact ; événements corrélés et reconstructibles |
| `E2E-06` | Alice active une option d'outil qui reste en état actif ; compare à un one-shot, vérifie liseré/halo doux sans déformation SVG | design réel conforme à référence et états fonctionnels cohérents |
| `E2E-07` | Bob crée `P-Studio` sur Web, ajoute médias et outils de traitement présents, modifie lecture/effet | rendu et effets sans assets perdus, état MCP identique |
| `E2E-08` | Charlie crée `P-Miroir` dans Tauri ; configure projet/vues et sauvegarde | identité propriétaire/ACL vérifiable |
| `E2E-09` | Alice partage `P-Atlas` avec Bob en écriture et Charlie en lecture ; notifications sur leurs appareils | permissions exactes, accès non autorisé refusé |
| `E2E-10` | Alice/Bob déplacent simultanément deux objets distincts de `P-Atlas` ; Charlie regarde | convergence temps réel, ordre et auteur des événements stables |
| `E2E-11` | Alice/Bob modifient **le même objet** en concurrence ; tester même propriété puis propriétés indépendantes | politique de conflit conforme et explicite ; pas de perte silencieuse |
| `E2E-12` | Bob copie un objet de `P-Studio` vers `P-Atlas`, puis vers `P-Miroir` après autorisation ; teste texte, style, asset et relations | IDs de copie appropriés, références valides, propriété/ACL correcte, origine intacte |
| `E2E-13` | Alice duplique, groupe, réordonne, masque et restaure objets ; Bob ouvre le projet en vue Liste et Matrice | correspondance exacte entre représentations d'un même graphe d'atomes |
| `E2E-14` | Alice crée `T-Module`, place un placeholder + interaction ; l'instancie dans `P-Atlas` si mécanisme présent | lien template/instance canonique, pas d'objet fantôme |
| `E2E-15` | Alice modifie le template source ; Bob renseigne une valeur d'instance ; propagation puis undo source | structure synchronisée, données d'instance préservées selon contrat |
| `E2E-16` | Alice configure Interaction via outils réels trouvés dans Finder : bouton → sélection dynamique `(largeur > 30 OU hauteur > 30) ET non vidéo` → redimensionnement ; puis cascade d'outils | comportement exact en Consultation/Performance ; rien d'exécuté lors de la configuration en Édition |
| `E2E-17` | Alice passe Édition → Consultation → Performance, ferme/réouvre ; vérifie mode par défaut mémorisé | dernier mode de fermeture restauré ; garde-fous selon mode |
| `E2E-18` | Alice dicte « déplace le titre de 20 pixels à droite » ; Bob modifie le même objet via UI, Charlie l'inspecte via MCP | route commune, contrôle concurrent, mêmes valeurs observées |
| `E2E-19` | Sans TV ouverte, Charlie dit « lance France 2 » ; puis avec TV ouverte « France 2 », « France 5 », « ferme » | l'intention explicite fonctionne hors contexte ; ellipse guidée par TV ; ouverture fournisseur officiel autorisée |
| `E2E-20` | Alice revient au dessin, sélectionne le texte `France 2`, dit « mets France 2 en bleu » puis « ouvre la télévision » | d'abord modification graphique, puis changement explicite d'activité TV |
| `E2E-21` | Bob ouvre YouTube dans atome, cherche une vidéo libre, la lance et ferme ; réouvre le projet | recherche/lecture/fermeture cohérentes, lien conservé si prévu, pas de player parallèle inventé |
| `E2E-22` | Alice envoie un message de test à Bob depuis Communication ; Bob répond sur Web ; Charlie reçoit notification/mention si autorisé | destinataires, timestamps, accusés/rattrapage hors ligne cohérents |
| `E2E-23` | Alice/Bob commencent une visio ; Charlie rejoint ou tente sans autorisation ; couper micro/caméra, changer réseau, raccrocher | permissions mic/cam, signalisation, médias, présence et fin d'appel corrects |
| `E2E-24` | Depuis voix/MCP, Alice crée puis modifie un brouillon d'e-mail de test, l'ouvre, le recherche et l'envoie après validation à Bob | toutes les étapes contrôlables MCP, boîte réceptrice réelle vérifiée |
| `E2E-25` | Bob ouvre l'e-mail reçu, lit pièce jointe, répond, transfère à une boîte de test et archive | cohérence UI/MCP/mail provider, aucun envoi doublé |
| `E2E-26` | Alice ouvre un contact test, consulte agenda, crée un événement, ajoute une invitation prévue, importe vCard/ICS si supporté | état importé, permissions et direction de synchronisation respectées |
| `E2E-27` | Alice déclenche l'envoi d'un SMS de test **si le provider et l'OS l'autorisent**, après confirmation ; Bob observe ; tester cas de refus/absence | preuve délivrée par fournisseur/appareil réel ; aucun accès SMS privé simulé |
| `E2E-28` | Charlie coupe Internet, édite les données autorisées offline, laisse Alice/Bob travailler online ; rétablit réseau | file offline, fusion/résolution de conflit, synchronisation convergente |
| `E2E-29` | Capturer `K5`, fermer le projet sur les 3 dispositifs, déconnecter Bob et tuer/re-lancer Tauri ; Alice quitte l'app | tous projets et historiques persistants, aucun état temporaire promu par erreur |
| `E2E-30` | Reconnecter avec les mêmes comptes, sur appareils inchangés ; réouvrir les projets dans différents modes | `K5` récupéré exactement (propriétés, assets, liens, ACL, mode, révisions) |
| `E2E-31` | Exécuter **undo d'une modification de plusieurs séances auparavant**, après fermeture/redémarrage, puis redo et nouvelle modification ; observer sur les 3 appareils | undo historique persisté, causalité et dépendances correctes, pas de suppression d'actions d'un autre acteur |
| `E2E-32` | Sur iPhone de test seulement, exporter l'état si requis, **désinstaller**, réinstaller la version compatible, réauthentifier par flux officiel | récup projets, actifs, historique et droits depuis source durable ; aucun faux succès basé sur cache local restant |
| `E2E-33` | Recommencer avec nouvel appareil ou nouveau navigateur vierge ; restaurer sauvegarde canonique sur environnement de test séparé | identité et liens corrects ; restauration round-trip, checksums, historique selon politique cible |
| `E2E-34` | Révoquer les droits de Charlie, puis tenter lecture/édition du même projet via UI, MCP, URL directe, vieux jeton et cache offline | aucun nouveau droit ni lecture non autorisée ; révocation effective selon politique documentée |
| `E2E-35` | Simuler asset manquant/corrompu, crash pendant sauvegarde, échec réseau pendant opération sensible, retry même ID | rollback ou erreur explicite, données intactes, jamais double SMS/mail |
| `E2E-36` | Auditeur compare `K0…K9`, exécute inventaire MCP final et contre-tests ; nettoie fixtures avec sauvegarde | aucun ID orphelin, historiques reconstruisibles, 100 % couverture MCP ou anomalies P0 explicites |

**Checkpoints obligatoires** : `K0` état initial ; `K1` création projets ; `K2` partage/permissions ; `K3` création de copies ; `K4` interactions/templates ; `K5` après IA/communication ; `K6` offline/reprise ; `K7` après fermeture/reconnexion ; `K8` après réinstallation ; `K9` après undo tardif/revocation/restauration. À chaque checkpoint : exporter manifest canonique, références d'assets et checksums, liste des révisions, auteur et ordonnancement des opérations, empreinte structurale, ACL, vérification inter-appareils. Une comparaison brute de pixels **ne remplace pas** l'intégrité du modèle.

---

## 6. Catalogue étendu de tests fonctionnels

Chaque cas ci-dessous doit être décliné, quand applicable, en **UI**, **MCP direct**, **IA texte**, **IA voix**, **après fermeture**, **sur appareil distant**, **avec permission minimale** ; l'orchestrateur génère les permutations pertinentes et note les impossibilités au lieu de les ignorer.

### 6.1 Projet, atome, graphisme et Finder

- `OBJ-001` création projet vide, renommage, duplication, suppression/restore autorisés, ouverture multiple et retour Dashboard.
- `OBJ-002` création atomes texte, image, SVG, forme, vidéo, audio, groupe/molécule ; IDs uniques immuables et graphe parents/enfants sans cycle illégal.
- `OBJ-003` réglages X/Y, dimensions, homothétie, rotation si disponible, couleur, transparence, ordre des plans, visibilité ; lecture de chaque propriété via MCP.
- `OBJ-004` copie/colle à l'intérieur et entre projets, sur trois appareils ; remapping des IDs et références, permissions, déduplication d'assets.
- `OBJ-005` opérations de sélection unique/multiple, Finder par titre/type/outil, sélection persistée et ciblage MCP sûr.
- `OBJ-006` glisser-déposer/import d'images, audio, vidéo, SVG et fichiers permis ; formats valides/invalides, provenance, checksum, limites de taille.
- `OBJ-007` changement Naturel/Liste/Matrice, redimensionnement de fenêtre, zoom, disposition, texte éditable, sélection et ordre cohérents.
- `OBJ-008` icônes d'outils carrées, aspect exact de chaque composant, options natives directement sous l'outil ; zéro panneau de réglage parallèle.
- `OBJ-009` Menu principal conditionné uniquement par niveau utilisateur ; Mystic et barre contextuelle conditionnés par taxonomie réelle. Vérifier versions/invariants effectifs, sans présumer d'une ancienne définition.
- `OBJ-010` gestes long (~300 ms), très long (~2 s), accès Assistant, glisser Dashboard si disponibles ; absence de conflit tactile/focus.
- `OBJ-011` traitement bitmap/SVG sans rééchantillonnage injustifié ; capture écran vs source vectorielle, états visuels activé/inactif.
- `OBJ-012` outils à état maintenu : halo/liseré doux, éventuellement pulsation zen ; ne pas appliquer aux one-shot. Contrôler FPS, focus, sensibilité aux animations réduites.
- `OBJ-013` modes Édition/Consultation/Performance : opérations permises/interdites, changements de mode, sauvegarde du dernier mode au prochain lancement.
- `OBJ-014` performance d'ouverture de panneau : objectif existant **< 500 ms** sur banc défini ; mesurer médiane/P95, plateforme et charges.
- `OBJ-015` interruption pendant saisie : iOS scroll ne doit pas fermer le clavier ni voler le focus ; retour arrière et sélection texte stables.
- `OBJ-016` droits de consultation et édition d'un sous-objet lié, y compris lors de la copie vers un projet différent.

### 6.2 Interactivité, templates, activité et automatisations

- `INT-001` ouvrir activité Interactivité et le **vrai** outil Interaction via recherche Finder, sans recréer les outils.
- `INT-002` construire Déclencheur → Cible → Action avec sélection fixe ; actions existantes réellement raccordées.
- `INT-003` filtre dynamique `(largeur>30 OU hauteur>30) ET type!=vidéo`, avec ajout ultérieur d'objet et exclusion de vidéo.
- `INT-004` cascade de plusieurs outils ; l'ordre de traitement et les options réelles sont préservés.
- `INT-005` édition d'une interaction sur iPhone puis exécution Web/Tauri en Consultation et Performance ; non-exécution lors de la configuration en Édition.
- `INT-006` projet tagué template ; création d'instance, références, édition de source et propagation vers instances liées.
- `INT-007` modification de placeholders, renommage/déplacement/suppression ; données d'instance préservées selon contrat, référence indépendante non détruite.
- `INT-008` droits de modifications/copier sur instance hérités du partage standard, pas d'un système parallèle.
- `INT-009` automations : programmation horaire, récurrence, alarmes, déclenchement d'un outil/script/scénario eVe si disponible ; précision, fuseau horaire, annulation et historique.
- `INT-010` changement d'activité, sélection et niveau utilisateur : règles réévaluées sans casser la sémantique des outils.

### 6.3 Audio, vidéo, médias, TV et YouTube

- `MEDIA-001` importer/ouvrir/lire/pause/stop/scrub plusieurs formats vidéo ; durée, pistes, son, changement de plan, plein écran et fermeture.
- `MEDIA-002` audio : lecture, enregistrement autorisé, mute/unmute, effet, niveau, synchro, retour audio/casque et arrêt propre.
- `MEDIA-003` Bluetooth iOS : lecture A2DP HQ quand le microphone n'est pas nécessaire ; activation temporaire du micro et retour au profil audio attendu.
- `MEDIA-004` audio/vidéo et transitions sous charge, changement de réseau et reprise après interruption native.
- `MEDIA-005` TV depuis Activités → Divertissement → Télévision ; liste unique, choix et lecture de chaînes disponibles légalement via leur fournisseur officiel.
- `MEDIA-006` TV : « ouvre France 2 » depuis tout écran, « France 2 » TV active, changement chaîne, fermeture, recherche de programme/EPG si disponibles, contrôle texte/voix/MCP.
- `MEDIA-007` TV : fournisseur indisponible, DRM/identification/geo-blocage, flux non autorisé ; refus explicite sans extraction illicite ni contournement.
- `MEDIA-008` YouTube : ouverture, recherche Finder/input, sélection, lecture, fermeture, réouverture et conservation du lien suivant politique ; comportement iOS/Web/Tauri.
- `MEDIA-009` plein écran vidéo/TV/YouTube, bande inférieure native prévue, nom/Fermer, double clic/équivalent tactile réel, pas de clone d'interface fournisseur.
- `MEDIA-010` médias copiés entre projets/apparaux : intégrité, références, licences, caches et checksum stables.

### 6.4 Communication, collaboration et RTC

- `COM-001` découverte de contacts autorisés, utilisateur actif, présence et statut sur les trois plateformes.
- `COM-002` messages directs/groupes : composer, envoyer, recevoir, éditer/supprimer si fonction existante, joindre fichier, rechercher, historique, notifications.
- `COM-003` message voix/MCP depuis activité hors Communication ; clarification destinataire, envoi avec approbation et accusé réel.
- `COM-004` partage instantané d'un projet avec rôles lecture/écriture, invitation, ouverture sans copie forcée, révocation et propagation.
- `COM-005` édition concurrente et présence/cursors si prévus ; ordre d'événements, résolutions de conflits, snapshots cohérents.
- `COM-006` visio 1:1 puis groupe si supporté : démarrage/réception/refus, micro/caméra, permission, mute, changement caméra, raccrochage, retentative.
- `COM-007` interruptions RTC : autre appel, verrouillage d'écran, changement Wi-Fi↔4G, réseau faible, reconnexion, sortie/réentrée réunion.
- `COM-008` messages et invitations hors ligne : files, réception différée, ordre, absence de duplication, rattrapage notifications.
- `COM-009` partage d'un objet vs projet : héritage des droits, source de vérité, accès depuis un projet conteneur.
- `COM-010` accès depuis compte non invité via URL, ancienne invitation, MCP ou cache ; refus réel, aucune fuite d'assets.

### 6.5 E-mail — **TOUTES LES OPÉRATIONS DISPONIBLES VIA MCP**

**Ne pas inventer de mail provider.** Découvrir le compte/provider réellement intégré. Un objet « e-mail » visible sans connexion fonctionnelle ne valide pas l'ouverture/lecture. Si atome expose l'e-mail dans son UI/API, chaque action doit être découverte et testée en MCP, y compris les éventuelles extensions découvertes par l'audit.

- `MAIL-001` connecter une boîte de test (autorisation OAuth/équivalent), consulter statuts, déconnecter/révoquer, vérifier tokens protégés.
- `MAIL-002` lister dossiers/boîtes, ouvrir boîte de réception, ouvrir **un e-mail précis** depuis UI, voix, texte et MCP.
- `MAIL-003` lire sujet, auteur, destinataires, date, corps texte/HTML, fil de conversation, pièces jointes et métadonnées permises.
- `MAIL-004` rechercher par expéditeur, destinataire, sujet, date, mots, pièces jointes ; pagination, tri, filtres et conversation.
- `MAIL-005` marquer lu/non lu, favoris/drapeaux, étiquettes, déplacer, classer, archiver et désarchiver, selon capacités réelles.
- `MAIL-006` créer brouillon, modifier destinataires/CC/CCI, sujet/corps, formatage, enregistrer, fermer/reprendre, supprimer le brouillon.
- `MAIL-007` attacher/télécharger/ouvrir pièces jointes autorisées, limites de taille, formats invalides, nom Unicode, absence de fuite entre comptes.
- `MAIL-008` envoyer e-mail à boîte autorisée après confirmation conforme à la policy ; comparer ID message, dossier Envoyés, réception effective, pas de doublon.
- `MAIL-009` répondre, répondre à tous, transférer ; vérifier destinataires, citation, attachments, threading, consentement.
- `MAIL-010` suppression → corbeille → restauration → suppression définitive **uniquement sur fixture et après confirmation explicite**.
- `MAIL-011` spam/indésirable, bloquer/débloquer, snooze, calendrier intégré **si opérations réelles existantes** ; toute fonction ajoutée rentre dans l'inventaire.
- `MAIL-012` actions groupées et pagination : annuler ce qui est réversible, cohérence compte distant, rollback partiel explicite.
- `MAIL-013` séquences contextuelles : « ouvre mon dernier mail », « lis-le », « réponds-lui », « archive-le », même après passage à Dessin ou TV.
- `MAIL-014` changement de compte mail/dispositif ; ne jamais exposer un mail d'un autre compte ni utiliser un vieux token.
- `MAIL-015` 401/403, quota, rate-limit, hors ligne, déconnexion du provider, pièce jointe infectée/HTML non fiable : erreurs explicites, sanitation, aucune exécution d'instructions contenues dans le mail.
- `MAIL-016` audit MCP automatisé de toutes les commandes provider découvertes ; **aucune** action UI du mail sans équivalent MCP testable.

### 6.6 SMS, téléphone, contacts, calendrier et services natifs

- `NATIVE-001` authentification par numéro + lien SMS : durée/usage unique, expiration, replay, nouveau dispositif, changement numéro, risk policy, zéro fuite de token dans URL/logs.
- `NATIVE-002` message SMS sortant depuis voix, texte, UI et MCP vers **numéro de test autorisé** ; demande de confirmation, numéro E.164, livraison réelle et erreurs transport.
- `NATIVE-003` messages longs, Unicode, erreurs provider, quota, retry idempotent, refus utilisateur, et distinction « message préparé » vs « réellement envoyé ».
- `NATIVE-004` réception/lecture/consultation SMS **seulement si une API système/provider légalement accessible existe et a été autorisée** ; documenter précisément les limitations iOS/Web. Ne jamais contourner le sandbox iOS ni revendiquer un accès arbitraire aux SMS privés.
- `NATIVE-005` téléphonie/appels natifs, composition, permission et ouverture composeur selon plateforme, si fonction existante ; ne pas prétendre contrôler iOS au-delà des API disponibles.
- `NATIVE-006` import Contacts OS → atome en sens unique selon conception ; doublons, modifications concurrentes, révocations, autorisations et import sans écrasement injustifié.
- `NATIVE-007` calendrier/événements : lecture, création, modification, déplacement, invitation, suppression, récurrence, fuseaux horaires, alarmes et notifications iOS hors application si réellement disponibles.
- `NATIVE-008` vCard/ICS import/export : caractères internationaux, TZ/DST, collisions, données propriétaires, intégrité.
- `NATIVE-009` caméra, photo, micro, presse-papiers, fichiers, GPS et notifications : discovery de chaque capability native réelle, refus puis autorisation, permission « limitée », arrêt/reprise.
- `NATIVE-010` fermeture, background/foreground, app tuée par OS, faible mémoire, changement orientation, réinstallation, batterie/veille ; ressources nettoyées.
- `NATIVE-011` interface de contrôle de l'iPhone via automation **autorisée** (ex. WebDriverAgent/XCTest si configuré), captures et logs ; ne pas confondre agent de test externe et capacité MCP native d'atome.
- `NATIVE-012` capability inaccessible depuis Web/iOS mais disponible depuis Tauri : réponse MCP structurée, disponibilité par cible, action déportée seulement sur appareil autorisé et explicitement ciblé.

### 6.7 Identité, données, backup, historique et sécurité

- `DATA-001` démarrage première fois, création et fermeture session, login multi-appareils, rotation/expiration de clés, logout partout, suppression de session.
- `DATA-002` identité canonique non fondée sur numéro téléphonique ; changement/recyclage de numéro sans transfert accidentel de projet.
- `DATA-003` undo/redo séquentiel de création, déplacement, style, suppression, groupement, copie, interaction et partage **selon réversibilité réelle**.
- `DATA-004` historique après fermeture/réouverture, déconnexion/reconnexion, nouveau navigateur, app kill, réinstallation ; snapshots vs événements cohérents.
- `DATA-005` undo ancien avec opérations d'autres auteurs entre-temps ; préserver causalité, dépendances et droits, signaler conflit si inversion sûre impossible.
- `DATA-006` vue d'historique, auteurs/horodatage, restauration d'un état déterminé, replay déterministe et comparaison checksum.
- `DATA-007` suppression logique/physique et restauration ; ne pas réapparaître des objets révoqués ni conserver des références pendantes.
- `DATA-008` export user backup canonique : manifest, version de schéma, IDs, assets, ACL, historique éventuel, timestamps, checksums.
- `DATA-009` restore archive vers environnement de test vide ; dry-run, migrations, collision IDs, restauration atomique et validation post-restore.
- `DATA-010` backup modifié, incomplet, ancien schéma ou corrompu : checksum refusé, rollback complet, aucune demi-restauration.
- `DATA-011` réinstallation iPhone : comparer stockage réellement détruit vs clés système persistantes ; valider état serveur/backup indépendamment du cache.
- `DATA-012` corruption d'asset/taille extrême, références perdues, pagination massive, fermeture pendant upload/download et reprise sûre.
- `DATA-013` confidentialité : ACL projet/atome/asset/message/mail, propagation de révocation, cache offline, accès à une ressource partagée depuis autre compte.
- `DATA-014` tests de secrets dans logs, traces, exports et support ; pas de token/session/clé privée dans Markdown/captures partagées.
- `DATA-015` requêtes MCP malformées, injection, rate-limit, sandbox, escalade d'identité, replay de confirmation, usurpation de tool caller.
- `DATA-016` commandes externes non annulables : audit avant/après, ne pas modifier abusivement l'historique comme si un message déjà délivré n'existait plus.

### 6.8 Expérience visuelle, accessibilité et régressions

- `UI-001` comparaison screenshot/rendu réel aux références (teintes, proportions, SVG, tool réel, disposition zen), sans inventer de panels conventionnels.
- `UI-002` navigation avec clavier, tactile, VoiceOver si supporté, labels concis, focus, contrastes, zones tactiles, zoom texte.
- `UI-003` iPhone portrait/paysage, taille d'écran, notch/safe area, barre basse et Mystic selon latéralité ; bureau fenêtre étroite.
- `UI-004` Dashboard premier lancement, retour arrière, transitions, ouverture rapide de panneau, sans flicker ni projet résiduel.
- `UI-005` toolbar bas en Édition, Assistant fixe côté choisi, menu latéral contextuel, Finder et barre de recherche réelle.
- `UI-006` aucun effet graphique actif sur outils one-shot, états activés actualisés après sync/restart et animations réduites.
- `UI-007` tests de non-régression après chaque réparation ciblée : pas de modification UI hors périmètre sans motif ni snapshot différentiel.

---

## 7. Scénarios de panne, charge et attaques

| ID | Injection/condition | Invariant de réussite |
|---|---|---|
| `CHAOS-001` | couper Wi-Fi sur iPhone pendant mutation projet | sauvegarde/reprise déterministe sans doublon |
| `CHAOS-002` | 4G↔Wi-Fi pendant visio et partage | session ou reprise propre sans accès non autorisé |
| `CHAOS-003` | tuer processus Tauri pendant écriture | état durable cohérent, replay sans corruption |
| `CHAOS-004` | fermer onglet Web pendant envoi e-mail/SMS | état externe vérifiable ; aucune répétition non confirmée |
| `CHAOS-005` | délai élevé/perte de paquets/réponse hors ordre | opérations idempotentes, résolution de version correcte |
| `CHAOS-006` | deux clients changent même propriété simultanément | conflit traçable, convergence conforme à politique |
| `CHAOS-007` | sauvegarde/restore interrompus et archive tronquée | échec atomique, ancien état préservé |
| `CHAOS-008` | arrivée d'un nouvel utilisateur après 100 événements | état et historique cohérents sans replay irréaliste |
| `CHAOS-009` | 1, 10, 100, 1000 atomes puis assets lourds selon banc | temps de charge, mémoire, FPS, latence MCP mesurés et comparés à baselines |
| `CHAOS-010` | jeton périmé, permission retirée en pleine opération | accès refusé à partir du point défini, fuite nulle |
| `CHAOS-011` | serveur MCP redémarre après ack perdu | reprise via operation ID, pas de double effet |
| `CHAOS-012` | import fichier malformé et SVG/HTML hostile | sanitisation/sandbox, aucun script exécuté |
| `CHAOS-013` | prompt injection dans mail, projet, page TV/YouTube | texte traité comme données, aucun bypass de permission |
| `CHAOS-014` | client ancien sur schema nouveau / inverse | migration/versionnement ou erreur explicite sans corruption |
| `CHAOS-015` | décalage d'horloge d'appareil, changement DST Europe/Paris | timestamps et récurrence fiables ; ordre basé sur protocole, pas horloge locale seule |
| `CHAOS-016` | double appui, double requête MCP, double speech recognition | pas de double message, création ou paiement/action externe |
| `CHAOS-017` | coupure micro/caméra par OS pendant visio | feedback clair, état permissions correct, aucune capture clandestine |
| `CHAOS-018` | suppression projet parent avec partage et instance template | politiques de cascade/références/restore vérifiées |
| `CHAOS-019` | utilisateurs nombreux et connexions simultanées | aucune contamination des sélections, pré-prompts, tokens et projets |
| `CHAOS-020` | plugin MCP indisponible ou API inconnue | capability déclarée indisponible, pas de faux `PASS` ni appel direct caché |

**Bench performance** : spécifier matériel/OS/version/charge, répétitions et méthode ; mesurer médiane, P95, max, erreurs et mémoire. Seuil déjà défini : ouverture d'un panneau **< 500 ms** à valider avec protocole reproductible. Pour les autres métriques (délai sync, latence voix, RTCPeerConnection, ouverture de projet), établir une baseline puis approuver les seuils de release ; ne pas inventer une valeur contractuelle.

---

## 8. Automatisation IA et contrôle des machines

1. **Découvrir les outils disponibles** avant d'agir : Playwright/navigateur pour Web s'il est configuré ; mécanismes Tauri réellement accessibles (UI automation/app test) ; XCTest/WebDriverAgent/iOS simulator ou appareil réel **uniquement si installés et autorisés** ; remote logs/telemetry et client MCP standard. La présence d'un outil de test n'implique pas l'existence d'une capability métier correspondante dans atome.
2. **Créer un coordinateur** qui distribue les tests à `IOS-A`, `WEB-B`, `TAURI-C`, `MCP-D` avec horodatage commun, files de barrières et checkpoints. Ne pas automatiser des opérations OS interdites et ne jamais supposer une commande de contrôle du téléphone absente.
3. **Attacher les identités de test** à chaque appareil et garder un catalogue sûr des comptes, projets et permissions. Aucune clé secrète dans le code de tests ni dans les rapports.
4. **Exécuter par couches** : contrat MCP, fonctionnalités UI, E2E enchaîné, chaos, permutations. Réemployer le même état sur le grand scénario continu ; autres suites utilisent fixtures isolées pour reproductibilité.
5. **Créer une source de vérité de résultats** (`results.jsonl` ou équivalent) avec identifiant, fixture, acteur, device, test, status, mutation/révision, preuve, erreur et référence de bug. Ne pas utiliser un tableau manuel comme seule preuve.
6. **Prendre des snapshots conditionnels** avant/après les mutations et aux checkpoints du scénario continu, en expurgeant données privées. Sauvegarder les images/captures/trace MCP/profiling sous dossier de campagne daté.
7. **Tester par mutations inverses** : une action UI est répétée sur fixture comparable en MCP et en voix ; comparer projection canonique, historique, permission et affichage. Une comparaison purement textuelle des réponses d'API est insuffisante.
8. **Faire une revue indépendante** : un agent n'a pas le droit de valider un test qu'il vient d'écrire sans vérification croisée d'état et de preuve.
9. **Après un défaut** : reproduire sur deux surfaces, isoler module propriétaire, créer ticket avec reproduction minimale, proposer correction confinée au périmètre, repasser suites liées et smoke tests UI/voice/sync/MCP. Les réparations sont une phase distincte du diagnostic.
10. **Ne pas simuler des services réels** pour qualifier la livraison. Les mocks servent aux tests unitaires et à l'injection de pannes ; un test E2E « appel livré » exige un destinataire/provider de test réellement observable.

### Exemple de schéma d'un résultat — structure illustrative, pas API atome

```json
{
  "test_id": "E2E-31",
  "run_id": "2026-10-10-campagne-exemple",
  "actor": "Alice",
  "device": "IOS-A",
  "surface": "voice->mcp",
  "active_context": { "activity": "dessin", "project_fixture": "P-Atlas" },
  "capability_discovered": "<id réel découvert au runtime>",
  "mcp_operation_id": "<identifiant réel si disponible>",
  "before_revision": "<révision>",
  "after_revision": "<révision>",
  "expected": "undo tardif convergent après réinstallation",
  "observed": "<observation vérifiable>",
  "evidence": ["<capture>", "<snapshot>", "<trace expurgée>"],
  "status": "NOT_RUN",
  "issue_id": null
}
```

**Statuts autorisés de cas de test** : `PASS`, `FAIL`, `BLOCKED_ENV`, `NOT_RUN`, `NOT_IMPLEMENTED`, `NOT_SUPPORTED_PLATFORM`, `SKIPPED_APPROVED`. `SKIPPED_APPROVED` exige motif et approbation explicite ; ne compte pas dans le numérateur de réussite. Aucun cas `NOT_RUN` ne doit être confondu avec un succès.

---

## 9. Oracles d'intégrité et politique undo/redo

**À chaque checkpoint**, contrôler quatre plans de vérité :

1. **Données canoniques** : projet IDs/atomes, hiérarchie, parents, propriétés, liens template/instance, médias, assets, version schéma, compte propriétaire.
2. **Historique** : journal ordonné, transaction IDs, auteur, cause, révisions, snapshots, undo/redo autorisés, vérification replay → état courant attendu.
3. **Partage/sécurité** : droits d'accès effectifs, invitations, ACL, révocations, appareils de session, politiques de demande de consentement.
4. **Expérience sur chaque appareil** : vue et mode, dernière sélection selon règle de portée, médias lisibles, état d'outil, messages/calls, alarmes, cache et reprise.

**L'undo à posteriori est une exigence produit explicite**, pas seulement la touche Cmd-Z tant que la page reste ouverte. Au moins une action structurelle et une action de propriété doivent être annulées après **fermeture + reconnexion + réinstallation** lorsque l'historique serveur/restauré le permet. Tester également les limites légitimes : objet supprimé avec descendants, action révoquée, autre auteur ayant modifié la même propriété, publication externe irréversible. Si le contrat actuel ne permet pas cet undo persistant, classer `NOT_IMPLEMENTED/P0` avec dépendance au journal d'événements/backup plutôt que le déclarer valide parce qu'une capture historique existe.

Pour vérifier indépendamment une restauration : calculer l'empreinte d'un manifeste **canonique normalisé** (sans champs volatils ni secrets) et comparer les IDs stables, propriétés, nombre et checksum des assets, relations, ACL, données d'instances et éventuels événements. Si les IDs sont remappés par une restauration volontaire dans un autre compte, exiger un plan de remapping vérifiable, pas une égalité brute.

---

## 10. Critères de sortie, livrables des IA et priorisation

**Livrables obligatoires d'une campagne :**

1. `environment.md` : définition réelle d'Atom.1, versions, appareils, agents, comptes de test, providers, niveau d'automatisation/permissions, limites et chronologie.
2. `api-inventory.csv` : inventaires S/A/M fusionnés, toutes les API/capabilities, propriétaire, mapping MCP, voix, UI, disponibilité plateforme et matrice de permissions.
3. `results.jsonl` + `report.md` : résultat chaque test, statut, horodatage, états attendus/observés, latence, ID événement/opération, issue et preuve.
4. `checkpoints/` : manifests canoniques, contrôles de cohérence K0…K9, checksums assets, historiques/revisions et comparaison multi-appareils.
5. `evidence/` : captures, vidéos, logs expurgés, traces MCP, réponses provider de test, snapshots visuels et mesures des temps.
6. `issues.md` : bugs reproductibles, sévérité, environnement, parcours exact, cause présumée (distincte des faits), propriétaire canonique, correctifs proposés et tests de non-régression.
7. `coverage.md` : pourcentages justifiés avec numérateurs et dénominateurs, détails des APIs absentes, tests bloqués, fonctions `SPEC_ONLY`, écarts plateforme, résumé pré-prompts et résultats multi-device.
8. `release-decision.md` : décision **PASS / FAIL / INCOMPLETE**, justifiée. **INCOMPLETE n'est pas PASS**.

**Blocages P0 (non négociables)** : au moins une API fonctionnelle/UI sans chemin MCP ; appel MCP sans ACL/consentement normal ; corruption/perte d'un projet, asset ou historique ; impossibilité de restaurer un projet après réinstallation lorsque la récupération est requise ; undo persistant promis mais indisponible ; fuite de données entre acteurs ; doublon d'envoi externe ; interprétation contextuelle déclenchant une mutation externe ou destructrice sans les permissions/confirmations applicables ; impossibilité de lancer une action explicite hors contexte alors qu'elle est supportée et autorisée ; absence de preuve pour une réussite déclarée.

**P1** : rupture d'un workflow multi-device non destructif, micro/cam/UI incohérents, synchronisation tardive sans perte, défaut de contexte entraînant clarification inutile mais pas d'action erronée, problème de performances récurrent.

**P2** : défaut cosmétique, libellé, dégradation mineure sans impact métier ni sécurité. Une anomalie de rendu qui masque une donnée ou permet une mauvaise action est reclassée au niveau supérieur.

**Conditions de clôture** : 100 % des API métier opérationnelles ont un mapping et une parité MCP démontrés, 100 % des restrictions d'accès testées, aucune P0 ouverte, tous les checkpoints d'intégrité cohérents, matrice des tests exécutée avec justification des `BLOCKED/NOT_IMPLEMENTED`, et revue indépendante des preuves. Aucun test n'est « réussi » par la seule existence de ce protocole.

---

## 11. Ordre d'exécution recommandé

**Campagne 1 — audit** : `MCP-001,002,019,020`, inventaire UI/API, identité réelle d'Atom.1, appareils, fixturing.  
**Campagne 2 — vertical slices** : objet, projet, action UI/MCP/voix, historique et droits.  
**Campagne 3 — parcours continu** : `E2E-01…36`, checkpoints K0…K9, rotations des utilisateurs.  
**Campagne 4 — parités fonctionnelles** : `OBJ-*`, `INT-*`, `MEDIA-*`, `COM-*`, `MAIL-*`, `NATIVE-*`, `DATA-*`, `UI-*` ; toute nouvelle API trouvée ajoute sa ligne de test.  
**Campagne 5 — contexte/pré-prompt** : `CTX-001…030`, voix vs texte, bascules d'activités, ambiguïtés, injection, permissions.  
**Campagne 6 — résistance** : `CHAOS-001…020`, offline, problèmes de réseau, kill, réinstallation, idempotence.  
**Campagne 7 — bilan** : audit de couverture **100 % MCP**, classification des manquants, artefacts de preuve, décision release et recommandations sans modifier le code hors autorisation.

### Note de précision

Le protocole présente l'**exigence cible**, pas un état de conformité confirmé. Les capacités tierces (mail, SMS ordinaires, TV, commande native du téléphone, vision, appels) doivent être **découvertes dans les builds et via leurs permissions réelles**. Les mécanismes iOS de confidentialité peuvent interdire de lire des SMS privés ou de déclencher silencieusement certaines actions. Le test doit relever ces barrières avec exactitude et décider de leur traitement produit ; il ne doit ni prétendre les contourner ni maquiller une impossibilité en réussite MCP. L'objectif est une surface MCP uniforme pour **toutes les capacités réellement autorisées**, et un rapport explicite pour **toutes les capacités demandées mais manquantes**.
