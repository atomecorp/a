# Ouverture de session sur iOS

Symptôme rapporté : sur iOS, aucune session ne s'ouvre — seule la session
d'essai (invité) fonctionne. Le log du device montrait
`submit_password_on_submit_result … "cause":"phone_mismatch"`, après un
`submit_phone_lookup_result … "lookupStatus":"found"`.

## Cause

Sur iOS, `isTauriRuntime()` répond **vrai** (`atome:` fait partie des protocoles
reconnus dans `atome/src/squirrel/apis/unified/adole_api/runtime.js`). Le backend
primaire n'est donc pas Fastify mais le **serveur local Swift**
(`platforms/ios/atome-auv3/Common/LocalHTTPServer.swift`, `AiSRuntime`), joint
par WebSocket sur `/ws/api`.

Ce serveur répondait à `bootstrap` par une session valide — succès, jeton, et un
`user` construit par `loadUserInfo`, qui ne portait **pas de téléphone**. Or le
client refuse toute session dont l'utilisateur ne porte pas le numéro demandé :
il ne peut pas la distinguer de la session de quelqu'un d'autre. Le refus était
étiqueté `phone_mismatch`, c'est-à-dire le signal de sécurité — d'où un message
d'identifiants invalides pour une connexion pourtant correcte.

La session d'essai échappait au problème : `handleStartGuest` ne passe pas par
ce contrôle.

Reproduit à l'identique en pilotant le vrai code client avec la charge utile que
produisait le serveur iOS : `{"ok":false,"error":"phone_mismatch"}`.

## Corrections

1. `LocalHTTPServer.swift` — `loadUserInfo` renvoie le numéro vérifié
   (`readVerifiedPhone`, jusque-là écrit mais jamais appelé), comme le font
   Fastify et le backend Tauri.
2. `LocalHTTPServer.swift` — `registerUser` **vérifie le mot de passe** avant de
   délivrer un jeton sur un compte existant, refuse un compte supprimé, et ne
   répond plus par une session à un `register` sur un numéro déjà pris. Les
   trois comportements alignent iOS sur les deux autres backends ; sans eux,
   corriger le point 1 aurait ouvert un contournement d'authentification
   (connaître le numéro suffisait à obtenir une session).
3. `auth_core.js` / `auth_backends.js` — `classifyPhoneClaim` distingue « le
   backend n'annonce aucun numéro » (`backend_user_phone_missing`) de « le
   backend annonce un autre numéro » (`phone_mismatch`). Le garde-fou n'est pas
   affaibli : les deux cas restent refusés, mais ils sont désormais lisibles.
4. `auth_core.js` — `extractAlreadyExists` lit aussi `already_exists`, la forme
   employée par le backend iOS.
5. `platforms/ios/build_bevy_renderer.sh` — les bibliothèques construites sont
   accumulées en paramètres positionnels et non en chaîne jointe par des
   espaces : un chemin contenant une espace arrivait découpé à `lipo`.

## Reste à traiter

- Le mot de passe local iOS est un SHA-256 salé sans étirement de clé
  (`hashPassword`), là où Fastify et Tauri utilisent bcrypt. Changer de format
  invaliderait les comptes locaux existants : à planifier avec une migration.
- `verifyPassword` compare les empreintes avec `==` (non constant en temps).
- Un compte créé sur iOS reste **local à l'appareil** : il n'est pas provisionné
  côté serveur. C'est l'architecture actuelle, pas un défaut, mais l'interface
  ne le dit pas à l'utilisateur.
