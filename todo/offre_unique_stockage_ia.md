# Offre unique « atome » : stockage + IA, achats intégrés et carte

> Plan établi le 2026-10-18. Statut : **lot 1 livré (fondation serveur, non déployé), débit IA (lot 1b) en attente de la table de prix ; lots 2 (Apple) et 5 (Android) codés le 18 oct. — achat intégré à la création de compte, vérification serveur, notifications ; restent les produits App Store Connect / Play Console, la compilation Kotlin (pas de JDK) et un achat réel ; lots 3, 4 et 6 à faire.** Il fait suite aux places de test sur la
> clé OpenAI partagée (`server/providerSharedGrant.js`), qui restent en place jusqu'au lot 6.

## 1. Décision produit (proposée)

- **Un seul abonnement mensuel, 12 € TTC**, qui inclut **50 Go** de stockage et **3 000 crédits IA par mois**.
- **1 crédit = 0,001 € de coût fournisseur.** Le crédit est une unité interne en euros, pas en tokens : le
  prix d'un token change selon le modèle, et la voix, les images et la vidéo ne se comptent pas en tokens.
  3 000 crédits représentent donc environ 3 € de coût OpenAI par mois.
- **Dépassement IA :** des packs de crédits à achat unique (par exemple 5 € → 4 000 crédits), qui
  n'expirent pas à la fin du mois. Les crédits inclus dans l'abonnement, eux, ne se reportent pas.
- **Dépassement stockage :** des paliers d'abonnement, car le stockage est récurrent (12 € → 50 Go,
  20 € → 200 Go, 30 € → 1 To). On change de palier ; on n'achète pas de stockage à l'unité.
- **Marge estimée :** 12 € TTC ≈ 10 € HT. Après la commission Apple ou Google (15 % au titre du programme
  petites entreprises), il reste environ 8,5 €. Une fois retirés 3 € d'IA et le coût disque (marginal sur
  le serveur OVH), il reste environ 5 €. La voix Realtime est le poste le plus cher : la mesurer avant de
  fixer les packs.

## 2. Contraintes des magasins

| Plateforme | Moyen de paiement imposé | Conséquence |
| --- | --- | --- |
| iOS (règle 3.1.1) | StoreKit 2 | Pas de carte dans l'app ; bouton « Restaurer » obligatoire ; pas de lien vers le paiement Web (sauf vitrine US) |
| Android | Google Play Billing | Même logique ; bibliothèque Play Billing (dépendance Gradle externe, **autorisation à demander**) |
| Web, Tauri bureau | Stripe Checkout (page hébergée) | Carte, Apple Pay, Google Pay, PayPal selon la configuration du compte Stripe |

- Un abonnement acheté sur une plateforme vaut partout : le droit appartient au **compte**, pas à
  l'appareil.
- L'app iOS ne montre jamais la page Stripe. Le Web ne montre jamais la feuille Apple.

## 3. Ce qui existe

| Brique | État | Preuve |
| --- | --- | --- |
| Paiement à la création de compte | **Simulé** (12 €/mois, méthodes card/paypal/wero/apple_pay/google_pay) | `server/auth_accounts.js:39-58`, `server/auth_phone_link.js:90-97`, étape `billing` de `eVe/domains/user/first_launch_runtime.js:276-285` |
| StoreKit 2 | Existe mais ne convient pas : un seul produit `midi_console_unlock`, droit **local** (App Group), sans vérification serveur | `platforms/ios/atome-auv3/Common/PurchaseManager.swift`, `PurchaseBridge.swift`, `EntitlementStore.swift` |
| Comptage d'usage IA | Par place de test : opérations, tokens `responses` et sessions vocales ; tokens Realtime non comptés | `server/providerSharedGrant.js` |
| Tarif par modèle | Introuvable après recherche (`model_catalog_registry.js` n'a ni prix ni coût) | — |
| Quota de stockage | Introuvable après recherche dans `userFiles.js`, `server_uploads.js`, `fileStorage.js`, `userVaultProvider.js` | — |
| Plugins Tauri vendorés | Le modèle existe (`vendor/tauri-plugin-health`, `-stt`, `-mobile-host`) | `platforms/desktop-tauri/Cargo.toml:71-73` |
| Clé de service Play | Présente localement | `private/android-play.json` |

## 4. Architecture visée

- **Le serveur est la seule vérité.** Nouvel owner `server/billing/` :
  - `entitlements.js` : abonnement actif, palier, fin de période, source, identifiant de transaction
    d'origine ;
  - `credit_ledger.js` : grand livre **append-only** et idempotent (clé unique par référence d'achat ou
    de période). Le solde est dérivé du grand livre ;
  - `pricing.js` : coût en crédits par modèle et par unité (tokens d'entrée et de sortie, minute audio,
    image).
- Les tables vivent dans `database/auth_security_schema.sql`, comme les places : c'est de
  l'infrastructure protégée, jamais des propriétés d'Atome ni des évènements synchronisés.
- **Trois sources de preuve, une seule écriture :** les transactions StoreKit 2 vérifiées (JWS), Google
  Play (RTDN et API Play Developer) et les webhooks Stripe. Chacune appelle la même fonction
  `applyPurchase(principal, proof)`.
- **Transport :** nouvelle trame `billing` sur `/ws/api` (`status`, `offers`, `apple.verify`,
  `google.verify`, `stripe.checkout`). Seules exceptions HTTP, imposées par les fournisseurs comme pour
  le rappel OAuth social : `POST /api/billing/apple/notifications`, `/google/rtdn` et `/stripe/webhook`.
- **Débit IA :** `wsAiProviderOperations.js` vérifie le solde avant l'appel, puis débite le coût réel
  d'après `usage`. La voix est débitée par minute de session. Si le solde est vide, l'appel répond
  `insufficient_quota`, que le client sait déjà afficher.
- **Stockage :** l'octet utilisé est compté à l'écriture et à la suppression dans le coffre du principal.
  Un envoi qui dépasse le quota est refusé avec une erreur explicite.
- **Interface zen :** l'étape `billing` du premier lancement appelle la vraie feuille du magasin sur
  iOS et Android, ou Stripe ailleurs. Un panneau d'offre unique (palier, recharge, restaurer) est
  construit avec les briques Bevy existantes, sans texte superflu.

## 5. Lots

1. **Fondation serveur (sans compte externe).** `server/billing/` (droits, grand livre, tarifs), trame
   `billing.status|offers`, débit IA dans `wsAiProviderOperations`, mode simulé conservé pour le
   développement et les sondes, en remplacement direct du paiement simulé actuel.
   Tests : `tests/server/billing_*.test.mjs`, plus une sonde sur un vrai `/ws/api`.
2. **Apple.**
   - Serveur : vérification JWS des transactions StoreKit 2 (chaîne de certificats vers Apple Root
     CA G3, avec `node:crypto` `X509Certificate`, sans dépendance) et route des notifications v2.
   - iOS : `PurchaseManager` reconverge. Il charge les produits depuis `billing.offers`, achète avec
     `appAccountToken` dérivé du principal et transmet le JWS. Le droit local `EntitlementStore` est
     retiré pour l'abonnement.
3. **Quota de stockage.** Comptage dans le coffre du principal, refus à l'envoi, `billing.status` expose
   l'usage.
4. **Stripe (Web et Tauri).** Session Checkout par l'API REST (`fetch`, sans SDK). La page s'ouvre par
   l'opener existant. La vérification passe par le webhook signé. Le portail client permet de résilier.
5. **Android.** Plugin Tauri vendoré `tauri-plugin-billing` (Kotlin + Play Billing Library), selon le
   modèle de `tauri-plugin-health`. Côté serveur : API Play Developer avec la clé de service.
   **Autorisation de la dépendance Gradle requise.**
6. **Bascule.** L'étape `billing` réelle par plateforme et le panneau d'offre remplacent le paiement
   simulé. Le système de places est retiré : la clé partagée devient la clé de production débitée en
   crédits.

## 6. Prérequis de votre côté

- App Store Connect : un groupe d'abonnements « atome » avec 3 paliers, des packs consommables, l'URL
  des notifications v2 et une clé API App Store Server (fichier `.p8`).
- Play Console : les mêmes produits, un sujet Pub/Sub pour les notifications temps réel, et le droit
  « financier » pour le compte de service.
- Un compte Stripe (clé secrète, secret de webhook), avec l'activation de PayPal ou Wero si voulu.
- La TVA : Apple et Google la reversent pour vous ; avec Stripe, Stripe Tax ou une déclaration OSS.

## 7. Points à arbitrer avant le lot 1

1. Valider 12 € / 50 Go / 3 000 crédits, ou donner d'autres valeurs.
2. Prix identique sur iOS et sur le Web (recommandé, plus simple), ou majoré sur iOS pour absorber les
   15 %.
3. Faut-il un essai gratuit (Apple et Google gèrent un mois offert nativement) ou garder le paiement à
   la création ?
4. Faut-il un mode gratuit sans IA ni cloud, avec stockage local seulement, ou l'abonnement est-il
   obligatoire ?
