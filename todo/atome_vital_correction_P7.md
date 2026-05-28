Prompt — Correction finale du DOM de production Atome/eVe

Contexte

Le DOM actuel a été fortement amélioré :

- racines html/head/body corrigées ;
- IDs dupliqués supprimés ;
- gros modèles métier retirés du DOM ;
- data-group-timeline absent ;
- erreurs média supprimées ;
- canvas et vidéos réduits ;
- répétitions data-atome-id fortement réduites.

Mais il reste des problèmes incompatibles avec un DOM de production :

- data-preview-signature contient encore une donnée lourde, parfois base64 ;
- certains data-* contiennent encore des tableaux JSON-like ;
- les styles inline restent trop nombreux ;
- des URLs locales ou media_user_id apparaissent encore dans le DOM ;
- le DOM reste trop orienté debug/runtime dump au lieu d’être un DOM final minimal de production.

Le but de cette tâche n’est pas de produire un DOM de test propre, mais un vrai DOM de production : minimal, stable, valide, sans données lourdes, sans logique métier, sans cache visuel embarqué.

⸻

Objectif final

Produire un DOM de production conforme aux règles suivantes :

Le DOM est une projection minimale.
Le DOM ne contient aucune vérité métier.
Le DOM ne contient aucun cache lourd.
Le DOM ne contient aucun modèle complet.
Le DOM ne contient aucun JSON encodé.
Le DOM ne contient aucune image base64.
Le DOM ne contient aucune URL locale persistante.
Le DOM ne contient aucun handler inline.
Le DOM ne contient que les références strictement nécessaires au renderer et à l’interaction.

Formule finale :

ADOLE / DB / events / state_current = vérité
Renderer/cache = données dérivées
DOM = projection minimale de production

⸻

Règles non négociables

1. Aucune donnée lourde dans le DOM

Interdit dans le DOM :

base64
image data URI
audio data URI
video data URI
waveform complète
thumbnail encodé
preview signature complète
JSON complet
tableau JSON-like
timeline complète
cache renderer
cache média
source locale persistante

1. data-* uniquement pour références courtes

Accepté :

data-atome-id="atom_123"
data-role="media-host"
data-renderer="molecule"
data-preview-id="preview_abc123"
data-resource-id="media_abc123"
data-view-id="view_abc123"
data-selected="true"

Interdit :

data-preview-signature="data:image/jpeg;base64,..."
data-preview-signature="[...json array...]"
data-source="<http://127.0.0.1/>..."
data-media-user-id="..."
data-waveform="[...]"
data-thumbnail="data:image/..."

1. Pas de logique métier dans la vue

Le DOM ne doit jamais servir à :

- reconstruire un atome ;
- reconstruire un média ;
- reconstruire une timeline ;
- produire un commit ;
- stocker une preview ;
- stocker une waveform ;
- stocker un thumbnail ;
- décider de la vérité courante.

⸻

Étape 1 — Identifier toutes les données lourdes encore présentes

À faire

Auditer le DOM réel de production, pas seulement les exports de test.

Chercher :

data-preview-signature
data:image
data:audio
data:video
base64
JSON-like data-*
valeurs data-* > 256 caractères
127.0.0.1
localhost
media_user_id
source.url directe
source.bytes directe
waveform encodée
thumbnail encodé
preview encodée

Sortie attendue

Produire une table :

Attribut trouvé
Taille
Élément concerné
Fichier/fonction qui le génère
Cause source
Correction à appliquer

Ne pas corriger en supprimant après rendu. Corriger le générateur responsable.

⸻

Étape 2 — Supprimer data-preview-signature du DOM

Problème

data-preview-signature contient actuellement une signature lourde, parfois une image base64 ou un tableau JSON-like.

C’est incompatible avec un DOM de production.

Correction attendue

Remplacer :

<div data-preview-signature="data:image/jpeg;base64,..."></div>

par :

<div data-preview-id="preview_abc123"></div>

ou :

<div data-preview-key="preview_video_file_1779954925407_rev1"></div>

Architecture cible

MediaAtom / ClipAtom
  ↓
visual_ref / preview_ref
  ↓
PreviewCache / MediaCache / RendererCache
  ↓
Renderer
  ↓
DOM minimal avec data-preview-id

Le contenu réel de la preview doit vivre dans :

- cache renderer ;
- cache média ;
- IndexedDB / SQLite / filesystem si nécessaire ;
- mémoire runtime si purement temporaire ;
- state_current uniquement sous forme de référence courte.

Jamais dans le DOM.

Règle

Le DOM peut dire :

j’affiche preview_abc123

Il ne doit pas contenir :

voici les pixels de preview_abc123

⸻

Étape 3 — Remplacer les signatures JSON-like par des identifiants courts

Problème

Des attributs data-* contiennent encore des structures de type :

["video","video:file_...","pending",[],[1],0]
["audio","audio:file_...","ready",128,[...]]

Même si ces structures sont courtes, elles restent une sérialisation de logique/cache dans la vue.

Correction attendue

Remplacer ces structures par des IDs opaques :

<div data-preview-id="preview_7f3a91"></div>

ou :

<div data-cache-key="mtrack_preview_7f3a91"></div>

La signature complète doit être stockée hors DOM :

previewRegistry.set("preview_7f3a91", {
  kind: "video",
  mediaRef: "video:file_...",
  status: "pending",
  revision: 1
});

Règle

data-* peut contenir une clé. Il ne doit pas contenir le contenu de la clé.

⸻

Étape 4 — Créer un registre/cache de previews de production

Objectif

Remplacer les previews encodées dans le DOM par un vrai registre.

API cible minimale

Créer ou utiliser un module équivalent :

PreviewRegistry.register(previewData) -> previewId
PreviewRegistry.get(previewId) -> previewData
PreviewRegistry.release(previewId)
PreviewRegistry.has(previewId)
PreviewRegistry.rebuildFromState(state_current)

Responsabilités

Le registre doit gérer :

- thumbnails vidéo ;
- waveforms audio ;
- signatures de preview ;
- état pending/ready/error ;
- références vers ressources médias ;
- invalidation par revision ;
- reconstruction après refresh ;
- suppression quand la vue est détruite si cache temporaire.

Interdiction

Le registre ne doit pas devenir une nouvelle source de vérité métier.

Il est :

cache dérivé / renderer cache

pas :

source canonique

⸻

Étape 5 — Nettoyer les URLs locales et media_user_id du DOM

Problème

Le DOM contient encore des traces de :

127.0.0.1
localhost
media_user_id

En runtime local, le renderer peut utiliser une URL locale. Mais le DOM de production ne doit pas persister ou exposer ces informations si elles ne sont pas nécessaires à l’interaction.

Correction attendue

Remplacer les sources directes par des références abstraites :

<div data-resource-id="media_abc123"></div>

ou :

<div data-media-ref="media://audio_001"></div>

Puis résoudre l’URL dans le renderer :

media://audio_001
  ↓
MediaResolver
  ↓
<http://127.0.0.1/>... uniquement au moment du rendu

Règle

Le DOM contient une référence stable.
Le renderer résout la ressource.
Le DOM ne stocke pas l’URL locale résolue comme vérité.

⸻

Étape 6 — Réduire les styles inline pour un DOM de production

Problème

Les styles inline représentent encore environ 80 % des nœuds.

Pour un vrai DOM de production, c’est trop.

Objectif immédiat

Descendre sous :

50 % de nœuds avec style inline

Puis viser :

25 %

Puis idéalement :

10 %

Méthode

Ne pas supprimer les styles inline après rendu. Corriger le renderer.

1. Auditer les styles les plus fréquents

Lister les patterns inline répétés :

display:flex
align-items
justify-content
background
color
border
border-radius
padding
margin
font-size
font-family
position statique

1. Créer des classes de production

Exemples :

.eve-panel {}
.eve-panel--dark {}
.eve-button {}
.eve-project-tile {}
.eve-media-host {}
.eve-preview-host {}
.eve-timeline-track {}
.eve-matrix-root {}

1. Garder inline uniquement le dynamique

Autorisé :

transform calculé
left/top dynamiques si non remplaçables
width/height dynamiques
opacity animée
z-index temporaire
coordonnées de drag/resize

Interdit en inline :

couleurs fixes
paddings fixes
fontes fixes
borders fixes
styles de boutons
styles de panels
styles de tiles
styles de preview

⸻

Étape 7 — Différencier DOM de production et DOM de debug

Problème

Certains attributs peuvent être utiles au debug mais ne doivent pas exister en production.

Correction attendue

Créer deux modes explicites :

production DOM
debug DOM

Production DOM

Doit être minimal :

id unique si nécessaire
class
data-atome-id
data-role
data-view-id
data-renderer
data-preview-id
data-resource-id
aria-*

Debug DOM

Peut contenir plus d’informations, mais seulement si :

- activé explicitement ;
- jamais par défaut ;
- clairement préfixé data-debug-* ;
- jamais utilisé comme source métier ;
- jamais inclus dans les exports production.

Exemple

<div data-debug-preview-signature="...">

Uniquement autorisé en mode debug explicite, jamais en production.

⸻

Étape 8 — Mettre à jour l’audit DOM de production

Objectif

L’audit doit vérifier le DOM réellement utilisé en production, pas seulement un snapshot de test.

Seuils bloquants production

html_count = 1
head_count = 1
body_count = 1
duplicate_id_count = 0
large_data_count = 0
json_like_data_count = 0
base64_in_dom_count = 0
data_uri_in_dom_count = 0
data_group_timeline_count = 0
data_preview_signature_count = 0
data_media_api_error_count = 0
localhost_or_127_count_in_persisted_attrs = 0
inline_handler_count = 0

Seuils progressifs production

inline_style_ratio < 50 % immédiatement
inline_style_ratio < 25 % ensuite
inline_style_ratio < 10 % cible finale
canvas_count justifié
video_count justifié
data_attribute_count justifié

Rapport attendu

L’audit doit afficher :

PASS / FAIL
liste des attributs interdits
liste des data-*trop longs
liste des JSON-like data-*
liste des data URI / base64
liste des URLs locales exposées
ratio de styles inline
liste des styles inline les plus fréquents

⸻

Étape 9 — Tests runtime obligatoires

Test 1 — Preview sans DOM lourd

1. Importer une vidéo.
2. Générer une preview/thumbnail.
3. Vérifier que le DOM contient data-preview-id.
4. Vérifier que le DOM ne contient aucun base64.
5. Vérifier que le renderer affiche bien la preview.

Test 2 — Audio waveform sans DOM lourd

1. Importer un audio.
2. Générer une waveform.
3. Vérifier que le DOM contient data-preview-id ou data-waveform-id.
4. Vérifier que le DOM ne contient pas la waveform encodée.
5. Vérifier que la waveform s’affiche.

Test 3 — Refresh

1. Créer projet avec audio/vidéo.
2. Refresh.
3. Vérifier que les previews reviennent depuis PreviewRegistry/MediaCache.
4. Vérifier que le DOM reste minimal.

Test 4 — Reboot app

1. Créer projet avec audio/vidéo.
2. Fermer app.
3. Rouvrir app.
4. Vérifier que les previews sont restaurées ou régénérées.
5. Vérifier que le DOM ne contient toujours pas de base64 ni JSON-like.

Test 5 — Production mode

1. Lancer l’app en mode production.
2. Exporter le DOM réel.
3. Vérifier les seuils bloquants.
4. Échouer si data-preview-signature ou base64 apparaît.

⸻

Étape 10 — Correction précise attendue dans le code

À modifier dans le renderer preview

Chercher les endroits qui font :

setAttribute("data-preview-signature", ...)
dataset.previewSignature = ...

Remplacer par :

const previewId = PreviewRegistry.register(signatureOrPreviewData)
element.dataset.previewId = previewId

ou si la preview existe déjà dans le modèle :

element.dataset.previewId = canonicalState.visual_ref

À modifier dans le renderer média

Chercher les endroits qui injectent :

data:image/jpeg;base64
source.url
127.0.0.1
media_user_id

Remplacer par :

data-resource-id
media://...
preview://...

Puis résoudre côté renderer/média resolver.

À modifier dans le style renderer

Chercher les générateurs de styles inline statiques et les remplacer par :

classList.add(...)
CSS variables si valeur dynamique mais contrôlée

Exemple :

element.classList.add("eve-media-host", "eve-media-host--video");
element.style.setProperty("--clip-x", `${x}px`);

au lieu de :

element.setAttribute("style", "display:flex; background:#111; border-radius:8px; ...")

⸻

Ce qu’il ne faut pas faire

- ne pas supprimer data-preview-signature après rendu sans corriger le générateur ;
- ne pas masquer le base64 avec une compression dans le DOM ;
- ne pas remplacer un JSON array par une string encodée équivalente ;
- ne pas déplacer les données lourdes dans un autre attribut data-* ;
- ne pas créer un nouveau store qui devient une source de vérité ;
- ne pas casser refresh/reboot ;
- ne pas traiter uniquement les exports de test ;
- ne pas laisser le mode production dépendre du DOM debug.

⸻

Résultat attendu

À la fin de la tâche, le DOM de production doit respecter :

html/head/body : 1/1/1
duplicate_id_count : 0
large_data_count : 0
json_like_data_count : 0
base64_in_dom_count : 0
data_uri_in_dom_count : 0
data_preview_signature_count : 0
data_media_api_error_count : 0
localhost_or_127_in_persisted_attrs : 0
inline_handler_count : 0
inline_style_ratio : < 50 % immédiatement, puis < 25 %, cible < 10 %

Et surtout :

Le DOM de production ne contient que des références courtes.
Les previews, thumbnails, waveforms et signatures vivent dans des caches/registries hors DOM.
Le renderer sait reconstruire l’affichage depuis state_current + caches.
Le DOM reste minimal, valide, jetable et reconstructible.
