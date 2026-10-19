# Achats intégrés (App Store, Google Play)

L'offre unique (12 € par mois, stockage + crédits IA, paliers et packs) est décrite dans
`atome/src/shared/billing_contract.js`. Sur l'app iOS et l'app Android, le seul moyen de
paiement est l'achat intégré du magasin. Le Web et les apps de bureau gardent le paiement
Web (encore simulé). Le droit appartient au **compte**, jamais à l'appareil : le serveur
vérifie chaque achat auprès du magasin avant d'accorder quoi que ce soit.

## 1. Chaîne

1. `atome/src/squirrel/billing/store_purchase.js` choisit le magasin de l'hôte natif et
   achète le palier de base avec le jeton de compte `billingAccountToken(keyId)` de la clé
   d'appareil qui crée le compte.
2. iOS : `platforms/ios/atome-auv3/Common/PurchaseManager.swift` (StoreKit 2, commande
   `billing_store_purchase`, `appAccountToken`) renvoie la transaction signée (JWS).
   Android : `platforms/desktop-tauri/src/native_billing.rs` (`billing_invoke`) →
   `vendor/tauri-plugin-billing` (`BillingPlugin.kt`, `obfuscatedAccountId`) renvoie le
   jeton d'achat.
3. La preuve part avec `account-create` ou `phone-link-payment`, ou plus tard avec
   `billing` › `apple.verify` / `google.verify`.
4. `server/billing/store_purchases.js` la vérifie (`apple_store_verify.js`,
   `google_play_verify.js`), la lie au compte, puis l'inscrit dans `billing_ledger.js`.
   Google exige ensuite un accusé (abonnement) ou une consommation (pack).
5. Renouvellements et remboursements : `POST /api/billing/apple/notifications`
   (App Store Server Notifications v2) et `POST /api/billing/google/rtdn` (Pub/Sub).

## 2. App Store Connect

- Groupe d'abonnements avec `one.atome.plan.standard.monthly`, `.plus.monthly`,
  `.max.monthly` ; achat consommable `one.atome.credits.4000`.
- URL des notifications v2 : `https://atome.one/api/billing/apple/notifications`.
- Test local : un fichier `.storekit` dans le schéma Xcode. Le serveur de développement
  accepte ces transactions (`environment: Xcode`) si `ATOME_STOREKIT_TEST_CERT` désigne le
  certificat exporté par Xcode (Editor › Save Public Certificate). Jamais en production.

## 3. Google Play Console

- Mêmes identifiants : un abonnement (avec une offre de base) par palier, un produit
  unique par pack.
- Notifications en temps réel : sujet Pub/Sub en push vers
  `https://atome.one/api/billing/google/rtdn`.
- Compte de service avec l'accès financier : `ATOME_PLAY_SERVICE_ACCOUNT_FILE`, ou
  `serviceAccountFile` de `Private/android-play.json`. Sans lui, la vérification répond
  `billing_store_unconfigured`.
