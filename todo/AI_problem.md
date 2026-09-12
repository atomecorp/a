# Réparation et validation de l’assistant OpenAI sur iPhone

**Date de reprise :** 11 septembre 2026  
**Dépôt :** `/Users/jean-ericgodard/RubymineProjects/a`  
**Cible d’acceptation principale :** iPhone physique connecté, application `one.atome.app`

## But utilisateur

L’assistant eVe doit fonctionner simplement avec le même compte Atome sur Web, Tauri et iOS. Une clé OpenAI valide enregistrée une fois pour ce compte doit être conservée chiffrée sur `atome.one`, retrouvée automatiquement sur les autres appareils du même utilisateur et ne jamais être exposée au client, dans les logs ou dans ce document.

Sur iPhone, l’utilisateur doit pouvoir :

- ouvrir Home immédiatement et sans `Request timeout` ;
- voir un statut de clé exact ;
- ouvrir l’assistant et lui parler ;
- toucher le champ pour arrêter l’écoute et envoyer une demande écrite ;
- demander une action Atome ou une génération d’image et obtenir le résultat réel ;
- effectuer un appui long dans une zone de saisie et voir le menu Flower standard, notamment pour copier et coller ;
- retrouver les mêmes capacités et les mêmes données que sur Web et Tauri avec le même compte.

Une validation par compilation, tests unitaires ou navigateur ne suffit pas. La tâche n’est acceptée que lorsque les gestes et le résultat sont visibles sur l’iPhone physique.

## Symptômes observés

1. Home affichait longtemps `Request timeout`, ou un statut de clé indisponible.
2. L’assistant affichait : « Cet appareil n’est pas relié à votre compte en ligne » alors que le compte était sélectionné.
3. La clé semblait configurée, mais une demande réelle renvoyait `invalid_api_key`.
4. L’appui long sur une zone de saisie déclenchait le contexte Flower dans les traces, mais le menu disparaissait avant d’être visible.
5. La voix pouvait terminer par `provider_connection_closed`.
6. Des comportements antérieurs divergeaient entre Web, Tauri et iOS : refus intermittent d’appeler les outils, génération d’image non importée ou média distant en 404.

## Causes profondes déjà établies

### 1. Journal local iOS trop lent

L’allocation du numéro de séquence exécutait une recherche du maximum dans le journal d’événements sans reprendre le prédicat de l’index SQLite partiel. Chaque mutation pouvait donc scanner un journal volumineux. Les réponses WebSocket locales dépassaient leur délai, ce qui rendait Home et l’assistant incohérents.

Le propriétaire a été extrait dans `platforms/ios/atome-auv3/Common/AiSRuntimeEvents.swift`. La requête contient maintenant `sequence IS NOT NULL`, ce qui permet à SQLite d’utiliser `idx_events_stream_sequence`. L’écriture du journal et sa projection sont protégées par un `SAVEPOINT`, y compris dans une transaction de synchronisation englobante.

Mesure sur l’iPhone physique après correction : 453 événements, 1 379 ms cumulées, médiane 3 ms, p95 4 ms et zéro timeout, contre 892 timeouts lors de la mesure initiale.

### 2. Flower fermé par le geste qui venait de l’ouvrir

Sur iOS, le pointeur maintenu est reprojeté après le montage du menu. Cette projection frappait la racine ou un pétale encore en phase d’ouverture et refermait immédiatement Flower. Le runtime ignore maintenant ces activations pendant l’ouverture et rétablit la fermeture normale une fois le menu stabilisé.

Les contrats automatisés couvrent le maintien initial, l’absence d’activation invisible, la fermeture après stabilisation et l’activation d’un pétale réel. La preuve tactile et visuelle finale doit encore être refaite sur le binaire nettoyé.

### 3. Une clé invalide pouvait être enregistrée comme « configurée »

Le serveur conservait auparavant une chaîne ayant la forme d’une clé sans vérifier son acceptation par OpenAI. L’interface pouvait donc afficher « configurée » alors que l’API refusait la clé. Le stockage vérifie maintenant la clé auprès d’OpenAI avant de remplacer le secret chiffré existant. En cas de refus, aucune écriture n’a lieu et seul un code d’erreur assaini est renvoyé.

La dernière clé réellement testée a été refusée par OpenAI avec `invalid_api_key`. Ce résultat prouve que la chaîne iPhone → compte Atome → courtier serveur → OpenAI a été atteinte. Il ne prouve pas un échange texte ou voix réussi. Une clé valide doit être saisie dans Home, jamais communiquée dans un chat ou placée dans le dépôt.

### 4. Le Flower s'ouvrait sous le panneau, et plus rien ne le refermait (11 septembre 2026, session de reprise)

La cause 2 ci-dessus décrivait un menu refermé par le geste qui venait de l'ouvrir. La
reprise a mesuré autre chose sur l'iPhone physique, et la correction précédente avait
en outre supprimé la seule fermeture disponible sur iOS.

Constat visuel : l'appui long sur un champ du panneau Home n'affichait rien
(`temp/ios-ai-10-flower-field.png`). En fermant Home, le menu `copier`/`coller` était
là, ouvert, centré exactement sur le point de l'appui long
(`temp/ios-ai-11-flower-workspace.png`). En rouvrant Home il disparaissait de nouveau
(`temp/ios-ai-14-home-over-flower.png`). Le menu n'était donc jamais fermé : il était
peint dessous.

Propriétaire : le rendu empile chaque nœud sur une échelle absolue unique
(`atome/renderers/bevy-core/src/ui/mod.rs` pose `GlobalZIndex(style.z_index || 0)` sur
chaque entité). Seule la racine du Flower déclarait `z_index: 1300` ; pétales, icônes et
libellés n'en déclaraient aucun et atterrissaient donc à 0, sous les nœuds du panneau
(1250 à 1354). `bevy_ui_flower_model.js` descend maintenant la bande Flower dans tout le
sous-arbre, comme `bevy_panel_tree.js` le fait déjà pour la sienne, et lit la bande chez
son propriétaire (`workspaceSceneLayerOrder('flower')`) au lieu de la réécrire.

Second constat : aucun appui extérieur ne refermait le menu
(`temp/ios-ai-13-after-outside-tap.png`). Sur la surface native, le propriétaire de
fermeture au niveau document ne reçoit pas ces événements ; la racine Bevy est le seul
témoin d'un appui hors corolle, et la correction précédente l'avait rendue passive.
`bevy_ui_flower_runtime.js` referme de nouveau sur appui racine, en ignorant la seule
chose qu'il faut ignorer : la reprojection du pointeur qui tient encore le menu ouvert,
identifiée par ses deux moitiés — ce pointeur n'a pas été relâché et l'appui retombe sur
le point d'ouverture (tolérance : celle déjà accordée au tremblement d'un appui tactile).

Limite connue restante : les sur-couches de panneau (popup de Select) sont peintes à
1354, donc au-dessus de la bande Flower. Un Select ouvert recouvrirait encore le menu.

### 5. `provider_connection_closed` : la requête tuait le canal qui la portait (11 septembre 2026)

`ensureFastifyToken` republie la même configuration distante avant chaque requête
authentifiée. Côté iOS, `FastifySyncClient.reloadConfiguration` déconnectait sans
condition, et `disconnectLocked` referme tous les canaux fournisseur : la demande
de l'assistant mourait donc de l'appel qui venait de la préparer. Trace relevée
sur l'appareil : `close reason=disconnect pending=1 voices=1`. Le rechargement ne
déconnecte plus que si la configuration a réellement changé.

Derrière ce défaut s'en cachait un second : `voice/bootstrap.js` importait
`../../application/audio_runtime/*.js` par chemin d'exécution. Ces fichiers
n'existent pas dans le paquet iOS — ils y sont regroupés et résolus par
identifiant via `__ATOME_PACKAGED_MODULES__` — d'où l'échec
`voice.bootstrap.preload.failed: Importing a module script failed` et un pont
vocal jamais monté. Le bootstrap passe maintenant des descripteurs `{ id, path }`
au chargeur canonique. Après correction : `bridge_modules.loaded`
(`audio_facade`, `backend_kira`) puis `ensure_ready.service_ready`.

## Résultat de la reprise du 11 septembre 2026

Vérifié à l'écran sur l'iPhone physique, binaire Debug nettoyé, `one.atome.app` :

- démarrage à froid `presentation_ready` en 1533 ms, zéro `Request timeout` ;
- Home s'ouvre peuplé au premier toucher, sans Retry ;
- appui long réel de 900 ms dans un champ : Flower `copier`/`coller` visible
  au-dessus du panneau (`temp/ios-final-02-flower.png`) ;
- appui extérieur : Flower refermé, panneau intact (`temp/ios-fix-03-dismissed.png`) ;
- copier depuis Nom puis coller dans Email : la valeur arrive réellement dans le
  champ (`temp/ios-final-07-paste-result.png`), puis le champ a été remis à vide ;
- statut de clé exact et masqué : « Clé enregistrée sur le serveur », `••••••••`
  pour OpenAI, « Clé non configurée » pour Anthropic (`temp/ios-bridge-06-keys.png`) ;
- assistant ouvert par son geste réel, modèle `gpt-5.6-sol`, saisie texte active,
  demande envoyée : réponse « La clé OpenAI a été refusée. Modifiez-la dans Home. »
  (`temp/ios-final-11-assistant.png`), zéro `provider_connection_closed`.

Reste donc bloqué sur une seule dépendance : **une clé OpenAI valide**, que seul
le titulaire du compte peut saisir dans Home → Mots de passe et clés →
Intelligence artificielle → OpenAI → Clé API. Tant qu'elle n'est pas saisie, la
génération d'image, le carré rouge, la voix, la persistance des médias et les
parcours Web/Tauri restent non vérifiés.

## Acceptation atteinte le 12 septembre 2026

Une clé OpenAI valide a été saisie sur l'iPhone par le chemin réparé (appui long →
`coller`). Mesure sans contenu de ce que l'appareil a envoyé : 164 caractères,
préfixe `sk-`, jeu de caractères valide ; réponse du serveur `configured: true`,
c'est-à-dire **acceptée par OpenAI** lors de la vérification préalable à l'écriture.

Puis, sur l'iPhone physique : « dessine un carre rouge » → « Assistant: Carré rouge
dessiné. », avec un **vrai carré rouge vectoriel créé dans le projet**, sélectionné,
footer contextuel ouvert, sans étape de confirmation (`temp/ios-after-key-3.png`).
Après relance à froid, le carré est toujours là (`temp/ios-persist-01.png`).

Ce résultat corrige la lecture précédente : la clé de l'utilisateur était valide ; ce
qui était stocké sur `atome.one` pour ce principal était une **autre clé, périmée**,
issue de la migration one-shot de l'ancien coffre local du téléphone et jamais
revérifiée.

Restent non vérifiés : la voix (capture, transcription, interruption), la génération
d'image et son import canonique, et les parcours Web/Tauri avec le même compte.

## Contrat de synchronisation de la clé

Le comportement exigé est le suivant :

1. Home identifie le principal authentifié du serveur sélectionné.
2. La clé est envoyée au courtier uniquement lors de son enregistrement explicite.
3. Le serveur vérifie la clé puis la conserve chiffrée, liée à l’identifiant immuable du principal.
4. Web, Tauri et iOS demandent uniquement `credential.status` et utilisent les opérations du courtier ; ils ne reçoivent jamais la clé principale.
5. Une ancienne clé locale du même principal peut être migrée automatiquement une seule fois vers le coffre serveur, puis supprimée localement.
6. Un changement de compte pendant l’opération annule la migration et interdit tout transfert entre deux utilisateurs différents.

## Procédure de prise en main et de test de l’iPhone

La procédure utilise les outils Apple et Appium/XCUITest déjà installés. Elle ne contourne ni le verrouillage de l’appareil ni les permissions iOS.

### 1. Détecter la cible physique

```bash
xcrun devicectl list devices
```

Repérer l’iPhone connecté. La cible connue lors du diagnostic est `Jeezs’s phone`, CoreDevice `06AE42D0-F348-5F60-9351-9418099FBF49`, UDID `00008150-000C19822140401C`. Toujours redécouvrir l’appareil au début d’une reprise au lieu de supposer qu’il est encore disponible.

### 2. Compiler le vrai produit

```bash
xcodebuild \
  -project platforms/ios/atome-auv3/atome.xcodeproj \
  -scheme atome \
  -configuration Debug \
  -destination 'id=00008150-000C19822140401C' \
  -derivedDataPath temp/openai-ios-build \
  build
```

Le succès de cette commande prouve seulement que le code compile. Il ne valide pas l’interface.

### 3. Installer et lancer

```bash
xcrun devicectl device install app \
  --device 06AE42D0-F348-5F60-9351-9418099FBF49 \
  temp/openai-ios-build/Build/Products/Debug-iphoneos/atome.app

xcrun devicectl device process launch \
  --device 06AE42D0-F348-5F60-9351-9418099FBF49 \
  --terminate-existing \
  one.atome.app
```

### 4. Piloter l’interface réelle

1. Vérifier l’état d’Appium sur `http://127.0.0.1:4723/status`.
2. Créer ou réutiliser une session XCUITest visant `one.atome.app` et l’UDID physique.
3. Utiliser les interactions Appium réelles : `click`, saisie native et `mobile: touchAndHold`.
4. Pour Flower, maintenir réellement le doigt au moins 520 ms sur une zone de saisie. Les coordonnées ne sont qu’un dernier recours diagnostic et doivent être recalculées depuis l’arbre d’accessibilité ou la capture courante.
5. Prendre une capture après chaque état décisif : Home chargé, Flower visible, assistant ouvert, écoute active, saisie texte, résultat final.
6. Lire en parallèle la console native/Xcode et les erreurs WebView. Ne conserver dans le dépôt aucune trace temporaire ni aucun secret.

Repères observés lors du diagnostic, à ne pas traiter comme des sélecteurs permanents : Home vers `(312, 807)`, assistant vers `(372, 807)`, champ Nom vers `(170, 316)`. La géométrie change avec le clavier, l’orientation et la vue.

## Scénario d’acceptation obligatoire

1. Lancer l’application à froid avec l’iPhone connecté au réseau.
2. Ouvrir Home par un toucher réel et constater visuellement son affichage immédiat, complet et sans timeout.
3. Vérifier que le serveur sélectionné est `https://atome.one` et que le compte affiché est le compte attendu.
4. Effectuer un appui long réel dans une zone de saisie et conserver une capture où Flower est visible avec ses actions de texte.
5. Coller ou saisir une clé OpenAI valide dans Home. Vérifier que la sauvegarde réussit et que la clé reste masquée. Ne jamais imprimer sa valeur.
6. Fermer et relancer l’application. Vérifier que le statut reste configuré sans nouvelle saisie.
7. Ouvrir l’assistant par son geste réel. Vérifier visuellement son état actif et l’autorisation micro.
8. Dire « dessine une chèvre photoréaliste ». Vérifier que la transcription orale déclenche le même outil que la saisie écrite, que l’image est générée puis importée comme Atome canonique et qu’elle demeure visible après rechargement.
9. Toucher le champ : l’écoute doit s’arrêter. Envoyer « dessine un carré rouge ». Vérifier la création directe d’un objet vectoriel conforme, sans étape de confirmation pour cette mutation annulable.
10. Reprendre l’écoute par un toucher explicite. Interrompre une réponse vocale et vérifier l’arrêt audio.
11. Contrôler l’absence de `Request timeout`, `provider_connection_closed`, `no_active_ai_provider`, 404 média et double mutation dans les logs.
12. Refaire le parcours minimal sur Web et Tauri avec le même compte pour vérifier la persistance et la synchronisation, sans présenter ces parcours comme preuve iOS.

## Tests automatisés minimaux à conserver

```bash
node --test \
  tests/eve/bevy_ui_flower_contract.probe.mjs \
  tests/probes/flower_menu_modules.probe.mjs

node --test tests/probes/ios_event_transaction.probe.mjs

npx vitest run \
  tests/eve/openai_provider_integration.test.mjs \
  tests/eve/openai_credential_migration.test.mjs \
  --maxWorkers=1

git diff --check
git -C eVe diff --check
```

État au moment de la rédaction : Flower 9/9, journal iOS 1/1, fournisseur et migration OpenAI 45/45. Ces résultats ne remplacent pas le scénario visuel.

## Prompt professionnel de reprise

```text
Tu travailles dans /Users/jean-ericgodard/RubymineProjects/a sur la réparation complète de l’assistant OpenAI eVe/Atome, avec l’iPhone physique comme cible d’acceptation principale.

Commence par lire .codex/AGENTS.md puis tous les modules obligatoires qu’il référence, en particulier les règles de débogage UI, de réutilisation du framework, d’API, de synchronisation et de garde-fous. Lis aussi atome/documentations/how_debug_UI.md. Respecte strictement l’interdiction des écritures Git.

Lis todo/AI_problem.md en entier. Reprends depuis l’état réel du checkout sans écraser les modifications existantes. Établis d’abord le symptôme, le propriétaire canonique et la cause vérifiée. Ne crée aucun système parallèle, aucun état métier dans le DOM, aucun contournement spécifique aux tests et aucun second chemin de synchronisation.

Objectif : avec le même compte Atome, une clé OpenAI valide enregistrée une fois doit être vérifiée et stockée chiffrée sur atome.one, puis utilisable automatiquement sur Web, Tauri et iOS sans exposer la clé principale aux clients. Aucun secret ne doit apparaître dans les logs, captures, tests, documents ou réponses.

Termine les correctifs en cours :
- conserver la réparation de performance et d’atomicité du journal iOS dans AiSRuntimeEvents.swift ;
- valider sur l’iPhone physique que l’appui long d’une zone de saisie laisse Flower visible et utilisable ;
- valider que Home s’ouvre instantanément et systématiquement sans Request timeout ;
- valider le statut de clé, sa persistance liée au même principal et le refus sans écrasement d’une clé invalide ;
- valider texte et voix avec une clé réellement acceptée par OpenAI ;
- vérifier que la demande vocale et la demande écrite appellent exactement les mêmes outils ;
- vérifier la création directe d’un carré rouge et la génération/import d’une chèvre photoréaliste comme Atomes canoniques ;
- vérifier la persistance, le rechargement, la synchronisation des médias et l’absence de 404 ;
- retirer toutes les traces de diagnostic temporaires avant la livraison ;
- mettre à jour les maps et eVe/documentations/FRAMEWORK_STATE.md avec les preuves exactes et les limites restantes.

Utilise xcrun devicectl pour découvrir, installer et lancer l’application one.atome.app. Utilise Appium/XCUITest pour de vrais touchers, un vrai appui long, la saisie native et les captures. Les coordonnées historiques ne sont que des repères diagnostics : redécouvre les éléments et vérifie les pixels. Garde séparées les preuves navigateur, Tauri et iOS.

Ne t’arrête pas à une compilation réussie, à un test automatisé vert, à un état interne ou à une hypothèse. Ne déclare pas le problème résolu tant que le parcours obligatoire n’est pas probant visuellement sur l’iPhone physique et que les effets métier attendus ne persistent pas après rechargement. Si un service externe ou un appareil est momentanément indisponible, termine tout le travail indépendant possible, documente exactement le blocage avec les preuves, puis reprends dès que la dépendance redevient disponible. Une clé invalide ne doit jamais être présentée comme un défaut de transport résolu ni comme un test OpenAI réussi.

À chaque étape, indique : pourcentage réel, étape terminée, preuve obtenue, prochaine étape et obstacle éventuel. À la fin, fournis les fichiers modifiés, les suppressions de traces temporaires, les tests exécutés, les mesures, les captures par plateforme et toutes les limites non validées. Ne dis jamais « tout fonctionne » si un seul scénario d’acceptation demandé n’a pas été exécuté avec succès.
```

## Critère de clôture

Le dossier peut être clos seulement si le parcours visuel iPhone est réussi, si les demandes texte et voix produisent les mutations et médias attendus, si la même clé valide est retrouvée automatiquement pour le même compte sur les trois plateformes, si les résultats persistent et se synchronisent, et si les logs finaux ne contiennent ni erreur pertinente, ni trace temporaire, ni secret.
