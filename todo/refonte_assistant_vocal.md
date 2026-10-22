# Refonte de l'assistant vocal (premier lancement d'abord)

Rédigé le 22 oct. 2026. Statut : **plan à valider, rien de la refonte n'est encore codé.**

## 1. Pourquoi une refonte

Le guide vocal du premier lancement demande à un moteur de **dictée** de tenir une
**conversation**. On lui demande d'écouter sans interruption, d'ignorer la voix d'eVe et de saisir
un mot isolé après 30 s de silence. Ni la reconnaissance de WebKit (version d'origine) ni celle
d'Apple sur l'appareil (depuis le 21 oct.) ne sont faites pour ça : elles reconnaissent **une phrase
à la fois**.

Pour forcer ce fonctionnement, des astuces se sont empilées, chacune corrigeant un symptôme et en
créant un autre :

- couper le micro pendant qu'eVe parle (`muteListening` / `set_muted`) ;
- filtrer sa propre voix (`stripOwnVoice`, `ECHO_MS`, `OWN_VOICE_MS`) ;
- insérer des silences artificiels (0,3 s de zéros) ;
- appliquer des règles d'enchaînement et de renouvellement des requêtes.

Cause prouvée de la reconnaissance « erratique » (journaux du service `localspeechrecognition` de
l'iPad, 22 oct.) : la coupure du micro **met en pause une requête restée ouverte**. Quand le son
reprend, le moteur clôt l'énoncé en attente puis ne transcrit plus rien, alors que le son arrive.
Cela dépend du moment : 2 fois sur 3 dans les essais.

## 2. Exigences (règles de l'utilisateur)

1. **eVe reste en place sur tous les écrans** du premier lancement, du premier au dernier.
2. Elle ne s'en va **que** sur :
   - une **commande vocale explicite** (« au revoir », « raccroche », « arrête de m'écouter »…) ;
   - un **toucher sur le fond**, en dehors d'elle et en dehors des boutons et champs ;
   - **3 minutes sans un mot** (elle le dit à voix haute avant de raccrocher).
3. Raccrochée, elle n'entend rien. Elle revient sur un **toucher sur elle** ou sur
   « **Ève, écoute-moi** ».
4. La reconnaissance est **fiable** : chaque commande du parcours est comprise du premier coup, ou au
   plus au second.
5. Sa voix garde son **volume normal**.
6. Le code est **simple et standard**, le même concept sur iOS, Android et bureau. Aucune astuce propre
   à une plateforme.
7. Pas d'échange réseau au premier lancement : reconnaissance **sur l'appareil**.

## 3. Concept cible : la conversation tour par tour

C'est le fonctionnement de Siri et de l'assistant Google :

```
parle (micro fermé) → écoute UNE phrase → comprend → agit ou répond → écoute UNE phrase → …
```

- **Jamais de micro pendant qu'elle parle.** Il n'y a donc ni écho, ni coupure, ni filtre de sa
  propre voix.
- **Un tour = une reconnaissance = une phrase.** Le tour s'ouvre 300 ms après la fin réelle de sa voix.
  Il se ferme 1 s après le dernier mot entendu.
- **Un tour sans phrase** (rien dit) ne termine rien : un nouveau tour s'ouvre aussitôt.
- **Une erreur** relance le tour après 1 s, puis 2 s, 4 s… jusqu'à 15 s au plus, et écrit un
  diagnostic. Elle n'arrête jamais la conversation.
- **Les phrases du décor** (plus de 10 mots : télévision, conversation dans la pièce) sont ignorées
  sans réponse.
- « **Je n'ai pas compris** » : au plus une fois toutes les 10 s.

## 4. Architecture, couche par couche

### 4.1 Reconnaissance native : un tour, rien de plus (contrat `plugin:stt|…` inchangé)

- **iOS** (`platforms/ios/atome-auv3/application/AppNativeSpeechRecognizer.swift`, ~200 lignes visées) :
  - `start_listening` = un tour : il prend le micro et ouvre **une** requête
    `SFSpeechAudioBufferRecognitionRequest`, sur l'appareil, avec les `contextualStrings` de l'écran.
  - Fin de phrase : 1 s sans nouveau mot, sauf si le dernier mot est une élision (« C' »). La phrase
    est émise en `final`, puis le tour se termine (`stateChange: idle`) et le micro est rendu.
  - `stop_listening` annule le tour.
  - **Garantie de sérialisation** : un tour ne s'ouvre jamais tant que la requête précédente n'a pas
    rendu son dernier rappel. Le moteur sur l'appareil n'accepte qu'une requête à la fois ; si l'on
    chevauche, il reste sourd une vingtaine de secondes.
  - **Supprimé** : `set_muted`, le flux en pause, les zéros, `renewAfterWords`, la comparaison de
    transcriptions entre phrases.
- **Android** : même contrat avec `SpeechRecognizer`, déjà fourni par `tauri-plugin-stt`. À vérifier
  sur l'émulateur.
- **Bureau (Tauri)** : même contrat avec Vosk, via `tauri-plugin-stt`. Le mode « une phrase »
  (`continuous: false`) existe déjà.

### 4.2 Service vocal JS (`atome/src/squirrel/voice/`)

- Une seule façon d'écouter : `startListening({ continuous: false, onDevice: true, speechHints })`.
  La promesse rend la phrase, ou `''`.
- **Supprimé** :
  - le mode `onUtterance` (`service_tauri_stt.js`, `service_browser_stt.js`) ;
  - `muteListening` (`bootstrap.js`), `mute()` (`service_stt_runtime.js`) et `setMuted`
    (`stt_api.js`).
- **Gardé** : le pont iOS `window.__ATOME_NATIVE_STT__` (`stt_api.js`, `service_support.js`) et le
  chargement du service sur l'app iOS (`bootstrap.js`).

### 4.3 Brique réutilisable : la boucle de conversation

Nouveau module, ~150 lignes : `eVe/voice/conversation/conversation_turns.js`.

- Il possède la machine à états `idle → speaking → listening → acting`, le délai d'ouverture, la
  reprise après erreur, la règle des 3 minutes, l'état « raccroché » et l'état exposé au disque
  (`getState`, `subscribe`, niveaux d'entrée et de sortie).
- Il ne connaît ni les écrans ni les intentions. On lui donne :
  - `say(text)` : la voix pré-rendue ;
  - `listen(hints)` : un tour ;
  - `understand(text)` : la réponse ou l'action.
- Cette même brique servira plus tard à l'assistant sans compte, ou à tout autre écran guidé.

### 4.4 Le guide du premier lancement : du contenu seulement

`eVe/domains/user/first_launch_guide.js`, réécrit, ~120 lignes visées :

- les phrases de chaque écran ;
- les intentions (boutons, « répète », « raccroche », « décris ») ;
- l'appui sur le bouton nommé, par le même outil qu'un toucher.

**Supprimé** : `stripOwnVoice`, `ECHO_RUN_WORDS`, `muteWhileSpeaking`, `heardAfter`, `ECHO_MS`,
`SHORT_SESSION_MS`, `OWN_VOICE_MS`, `MUTE_TAIL_MS`.

**Gardé** : le routage d'« Ève, écoute-moi » vers le guide, une fois le service vocal prêt (corrigé le
22 oct.), et la remise de la préférence du profil à la fin du premier lancement.

### 4.5 eVe présente sur tous les écrans

- Catalogue (`eVe/domains/templates/first_launch_template_catalog.js`) : sur les 16 écrans de compte,
  la cellule `logo` devient la cellule `atom` (`operation: 'assistant'`). Le `version` de chaque gabarit
  touché est incrémenté, pour que les gabarits déjà installés soient remplacés.
- `first_launch_presentation.js` : une règle générale, « tout gabarit du premier lancement qui a une
  cellule `atom` héberge le disque », à la place de la liste `FIRST_LAUNCH_ATOM_TEMPLATES`.
  - Accueil et choix : le disque dans sa cellule.
  - Objectifs, sommeil et programme : le disque ancré en bas à droite (cellules `floating`).
  - Écrans de compte : le disque à la place de l'ancien logo.
- `first_launch_runtime.js` : sur une session déjà ouverte (`onReturn`), le disque est retiré comme
  l'était le logo. L'assistant de la session est déjà là.
- `first_launch_pairing` et `first_launch_confirmed` (fenêtres d'appairage par-dessus une session) :
  sans disque, comme aujourd'hui.

### 4.6 Quitter et rappeler

- **Toucher sur le fond** : réutiliser `touchOutside` de `eVe/domains/dashboard/dashboard_eve_atom.js`
  (couche `setRenderSurfaceInteractionInterceptorLayer`). Il est aujourd'hui désactivé quand le guide
  porte la voix (`if (!voice)`) : l'activer pour le guide, avec l'action `hangUp`.
  - Les boutons, champs et curseurs (`isBevyUiPointer`) gardent leur toucher.
- **Toucher sur le disque** :
  - raccrochée : elle revient (elle redit l'écran, puis écoute) ;
  - en train de parler : elle se tait et écoute ;
  - en train d'écouter : rien.
- **« Ève, écoute-moi »** : le détecteur de mot d'éveil tourne seulement quand elle est raccrochée.
  Il ne partage jamais le micro avec un tour.
- **Commande vocale** : les intentions `hang_up` existantes
  (`eVe/i18n/languages_first_launch_voice.js`).

## 5. Ordre de réalisation (lots)

| Lot | Contenu | Terminé quand |
| --- | --- | --- |
| 1 | Reconnaissance native iOS « un tour » + sérialisation, compilée | sonde JS sur l'iPad : 20 tours enchaînés, chacun rend sa phrase (Mac qui parle) |
| 2 | Service JS : retrait d'`onUtterance` et des coupures | import ESM du service + sonde Node des deux fournisseurs |
| 3 | Brique `conversation_turns.js` | sonde Node avec faux `say`, `listen` et `understand` : erreurs, silence, 3 min, raccrocher, rappel |
| 4 | Guide réécrit sur la brique | sonde Node du parcours complet (existe : `temp/voice_probe/`) |
| 5 | Disque sur tous les écrans + toucher sur le fond | captures iPad de chaque écran atteignable |
| 6 | Recette complète sur iPad (voir §6) | critères du §6 tenus |
| 7 | Nettoyage : diagnostics, cartes (`maps/`), `FRAMEWORK_STATE`, mémoire | grep sans reste de l'ancien modèle |

## 6. Recette sur l'iPad (le Mac parle avec la voix Thomas, l'iPad écoute)

Chaque essai part d'une installation neuve. `temp/ipad_campaign_2026-10-20/alerts.sh` accepte les
seules invites autorisées : reconnaissance vocale, micro, alarmes.

1. Parcours libre complet (Démarrer → Commencer → Sommeil → Valider → C'est parti), **3 fois de
   suite** sans échec.
2. Raccrocher par la voix, puis rappeler par « Ève, écoute-moi » : la commande suivante est comprise.
3. Raccrocher par un toucher sur le fond, puis rappeler par un toucher sur elle : idem.
4. Un toucher sur un bouton ne la fait pas raccrocher.
5. Télévision ou conversation dans la pièce pendant 2 min : aucune réponse, aucune action, elle écoute
   toujours.
6. 3 minutes de silence : elle dit au revoir et raccroche. « Ève, écoute-moi » la rappelle.
7. Volume de sa voix mesuré au micro du Mac : environ −27 dB crête, comme sans écoute.
8. Disque visible sur chaque écran atteignable : capture de chacun.
9. Un projet ouvert : l'assistant de la session répond.

**Critère d'acceptation** : les 9 points tenus, avec aucune commande ratée deux fois de suite et aucun
tour sourd (un tour ouvert qui ne rend rien alors qu'une phrase a été dite).

## 7. Risques à mesurer, pas à supposer

- **Micro pris et rendu à chaque tour.** Un premier mot coupé, ou un craquement au changement de
  catégorie de la session audio ? On mesure au lot 1. Si c'est le cas, le micro reste pris pendant
  toute la conversation et seules les requêtes vont et viennent. Ce choix est fait sur mesure, pas
  au hasard.
- **Mots isolés sur l'appareil** (« Sommeil » entendu « ce mail ») : `contextualStrings` plus des
  variantes mesurées dans les intentions. Pas de passage au serveur d'Apple (réponses retenues des
  dizaines de secondes, réseau).
- **Android et bureau** : pas d'appareil ici. Émulateur Android (`atome-api37`) pour le contrat ; Vosk
  sur Mac en Tauri dev.

## 8. Hors périmètre de cette refonte (à traiter ensuite)

- L'assistant connecté (OpenAI Realtime) et son fonctionnement avec l'IA choisie dans les préférences
  (Anthropic…).
- Les nouvelles voix françaises d'OpenAI.
- La prononciation de « synchroniser ».
- L'interruption à la voix pendant qu'elle parle. Ça demandera l'annulation d'écho native ; à évaluer
  après la refonte.

## 9. État du code au moment de la pause (22 oct.)

Modifié dans l'arbre de travail par cette campagne, rien n'est commité :

- **À garder** :
  - `stt_api.js` et `service_support.js` : pont iOS natif ;
  - `bootstrap.js` : chargement du service sur iOS ;
  - `realtime_session.js` et `assistant_session_keeper.js` : règle des 3 minutes ;
  - `matrix_template_runtime.js` et `matrix_grid_model.js` : cellules `floating`, et
    `matrixTemplateFrame` déplacé ;
  - `first_launch_presentation.js` : disque ancré `floating` ;
  - `first_launch_guide.js` : routage du mot d'éveil une fois le service prêt.
- **À retirer par la refonte** :
  - `muteListening` et `mute` (`bootstrap.js`, `service_stt_runtime.js`) ;
  - le mode `onUtterance` (`service_tauri_stt.js`, `service_browser_stt.js`) ;
  - la logique d'écho et de coupure du guide ;
  - dans `AppNativeSpeechRecognizer.swift` (non suivi par Git), la version « une requête entre deux
    prises de parole » compilée le 22 oct. et non vérifiée.
- **Pas de cette campagne, à ne pas toucher** : `Info.plist` et `NativeCalendarAlarm.swift` (alarmes
  AlarmKit, une autre session). C'est l'origine de la nouvelle invite « programmer des alarmes ».
- **Outils de test** : `temp/ipad_campaign_2026-10-20/` (`fullflow.sh`, `hw.sh`, `step.sh`,
  `alerts.sh`, `waitlisten.sh`, sondes `x_*.js`) et `temp/voice_probe/`.
