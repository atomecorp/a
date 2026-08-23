# Fond d'écran → « télécharger » : le 401 qui revenait sans arrêt

## Le symptôme

Accueil → préférences → fond d'écran → **télécharger** ne faisait rien, par
intermittence : `POST /api/uploads/remote-wallpaper → 401 (Unauthorized)` dans la
console, deux fois de suite, puis parfois ça remarchait, puis plus.

## Pourquoi ça revenait à chaque fois

Ce n'était pas UNE régression mais **quatre causes distinctes**, chacune capable
de produire le même 401. Corriger celle du jour laissait les trois autres.

| # | Cause | Où | Preuve |
|---|---|---|---|
| 1 | Une session **invité de navigateur** n'a aucun principal côté serveur : `startGuest` fabrique un UUID en local (`backend: 'local_guest'`), le chemin `start-guest` du serveur n'est appelé qu'en Tauri. `registerFileUpload` refuse donc l'écriture (`remote_account_not_provisioned` → 401). **Ce cas ne pouvait jamais marcher.** | `auth_methods_session_account.js`, `server/userFiles.js` | `curl -X POST … -H 'X-User-Id: <id invité>'` → 401 reproduit à l'identique |
| 2 | La validation du jeton Fastify (`auth me`) passe par le **WebSocket** : « socket injoignable » et « délai dépassé » y ressemblent trait pour trait à « jeton refusé ». `ensureFastifyToken` **effaçait le jeton** sur ces réponses-là. Sans mot de passe en cache, la session restait sans credential jusqu'à la reconnexion manuelle. **C'est le « ça marchait, puis ça ne marche plus ».** | `auth_fastify_token.js` | `temp/fastify_token_survives_transport_failure.probe.mjs` |
| 3 | Le 401 n'était rattrapé que dans le runtime natif ; côté navigateur il devenait une exception portant le statut HTTP brut, sans aucune tentative de renouvellement. | `asset_box_upload_transport.js` | `temp/wallpaper_download_resilience.probe.mjs` |
| 4 | La page est servie par `http://localhost:3001`, mais la base Fastify résolue était `http://127.0.0.1:3001` : **même serveur, autre origine**, donc cookie de session non transmis et requête cross-origin pour rien. | `asset_box_auth.js` | probe ci-dessus, dernier cas |

S'ajoutait une fragilité de service : un seul `fetch` vers picsum.photos, sans
délai maximal ni reprise (un `Connect Timeout` est déjà présent dans
`logs/fastify.log`), et **le téléchargement complet + l'écriture disque avaient
lieu AVANT** de découvrir que l'appelant ne possédait rien — d'où un 401 payé au
prix fort et un fichier orphelin à effacer.

## Ce qui a été fait

**Serveur** (`server/server.js`, `server/userFiles.js`)
- La propriété est tranchée **en premier** : plus aucun trafic sortant pour un
  appelant qui ne peut rien posséder ; le refus arrive en ~50 ms et **nomme la
  suite** (`inline_supported: true`).
- Un appelant sans propriétaire (invité) peut demander `?inline=1` : l'image
  revient **en ligne** (data URL), rien n'est écrit sur disque, rien n'est
  enregistré en base. Ce chemin non authentifié est limité à un appel / 2 s par IP.
- Le téléchargement distant a un délai par tentative (12 s) et 3 tentatives, la
  reprise visant une autre clé de cache du fournisseur.

**Client** (`eVe/domains/media/…`, `eVe/intuition/tools/…`)
- Une session invité demande directement la réponse en ligne : **le 401 ne part
  même plus** (vérifié en application réelle).
- Un jeton périmé est effacé de TOUTES les couches (`clearFastifyToken`, ajouté à
  l'API auth — retirer les clés de stockage à la main laissait la copie mémoire),
  re-délivré, et la requête rejouée.
- Un 401 qui persiste et que le serveur déclare `inline_supported` bascule en ligne.
- Un 429 est réessayé une fois ; deux clics simultanés **partagent** le même
  téléchargement au lieu de se le disputer.
- Toute erreur revient en `{ ok: false, reason }` typé — plus d'exception portant
  un statut HTTP nu.
- L'origine de la page l'emporte sur une écriture équivalente de la boucle locale.

**Auth** (`auth_fastify_token.js`)
- `isTransportFailure` distingue une panne de transport d'un refus du serveur.
  **Seul un verdict venant réellement du serveur efface le jeton.**

**UI**
- Le fond appliqué mais non enregistré (cas invité : aucun profil où écrire) est
  un **succès partiel**, plus un échec : la notice le dit au lieu que l'action
  entière soit déclarée ratée alors que le fond est à l'écran.
- Les causes réelles ont une phrase lisible (fr + en) au lieu d'un code brut.

## Preuves

| Probe | Vert après | Rouge avant |
|---|---|---|
| `temp/wallpaper_download_resilience.probe.mjs` | 8/8 | 5/5 contre `git archive HEAD` (parent + sous-module eVe) |
| `temp/fastify_token_survives_transport_failure.probe.mjs` | 2/2 | 2/2 |
| `temp/remote_wallpaper_route_contract.probe.mjs` | 3/3 (serveur corrigé, port 3099) | 3/3 (serveur HEAD propre, port 3098) |

Gardes existantes du dépôt toujours vertes :
`asset_box_remote_wallpaper_contract` (2), `background_quick_action_contract` (2),
`bevy_surface_background_runtime` (17).

**Application réelle** (`http://localhost:3001`, session invité) : double clic
simultané → deux succès pour **une** requête `?inline=1` → 200 ; appel suivant →
200 ; fond appliqué (`backgroundSource: 'image'`) ; **zéro 401**.

## Ce qui reste ouvert

- Un invité n'a toujours pas de profil : son fond d'écran vit le temps de la
  session (`background_profile_unavailable`). Le rendre durable suppose de
  refaire le provisionnement explicite d'invité côté serveur — hors sujet ici,
  et déjà noté dans `todo/!urgent_corrections.md`.
- Le fournisseur d'images reste unique (picsum.photos) : les reprises couvrent un
  incident passager, pas une panne longue du service.
