# Système financier atome/eVe — audit, avis, plan, questions (2026-11-16)

Demande (toi, 16 nov. 2026) : cahier « Implémentation complète du système financier atome/eVe » + diagramme
`atome_diagramme_flux_financiers.html` (7 flux : activation, recharge, domaine, vente entre personnes, service/IA,
remboursement, verrou bêta). « Avant de coder, audit et plan précis ; arbitrages financiers/réglementaires et maquettes
validés avant l'implémentation. » Puis : « j'ai besoin de mock-up, de ton avis, et si tu as la moindre question, il faut
que je la pose avant de commencer. » Registre : R-193. Reprend R-120 (facturation IA, partie financière) et R-121
(domaine payé, registraire OVH). **Rien n'est codé à ce stade.**

## 1. Audit : ce qui existe vraiment (vérifié dans le code le 16 nov.)

Propriétaire : le serveur Rust `atome-server` sert seul (`scripts/run_fastify.sh`, « No Node process runs ») ; chaque
fichier d'argent JS de `server/` a son double Rust ligne à ligne (portage R-118 L3.8) et n'est plus servi. Le plan
code en Rust, les doubles JS seront retirés à la bascule L3.10.

| Brique | État | Où | Écart avec le cahier |
| --- | --- | --- | --- |
| Grand livre | **Réel, partiel** : 2 tables (`billing_purchases`, `billing_credit_ledger`), append-only, idempotent par référence, solde recalculé (SUM) | `database/auth_security_schema.sql:60-82`, `atome-server/src/billing/ledger.rs` | compte des **crédits IA**, pas des centimes ; pas d'euros ; pas de partie double ; pas de réservation |
| Débit / autorisation | **Mort en JS, absent en Rust** : `debit`/`authorize` sans appelant ; `debit` laisse le solde devenir négatif | `server/billing/billing_ledger.js:85-102` | le cahier interdit le négatif et exige une réservation |
| Activation 12 € | **Simulée** : la création de compte « paie » l'offre Standard (12 €/mois, 3 000 crédits IA, 50 Gio) par un moyen fictif (`card`, `paypal`, `wero`…) qui ouvre une vraie période | `eVe/domains/user/first_launch_runtime.js:338-352`, `auth/signup.rs:131` | aucun encaissement ; « source: simulated » donne les mêmes crédits qu'un vrai paiement |
| Invitation | **Réelle** mais n'exempte pas du paiement (elle ouvre seulement l'inscription fermée) | `auth/signup.rs:26-28` | exemption à ajouter |
| Payer pour autrui | **Absent** (la preuve d'achat doit porter la clé de l'appareil qui crée le compte) | `billing/mod.rs:248` | à créer |
| Web / Tauri | **Simulé** : aucun code Stripe/PayPal ; aucune recharge possible hors stores | `billing_contract.js:26-27` | prestataire réel à brancher |
| Apple StoreKit 2 | **Réel** (chaîne Apple G3 vérifiée) mais **coupé** (`BILLING_STORE_PURCHASE_LIVE = false`) ; **Sandbox/TestFlight non distingué de Production** : un reçu sandbox donnerait tous les crédits | `billing/apple.rs:125-133`, `store_purchase.js:22-26`, `PurchaseManager.swift` | faille majeure à fermer en premier |
| Google Play | **Réel** (API Play), coupé ; `testPurchase` ignoré ; un abonnement annulé compte comme actif | `billing/google.rs`, `google_play_verify.js:10` | même faille |
| Boutique (ventes entre personnes) | **Simulée** : états `requested → held → shipped → delivered → released`, litige, remboursement ; l'argent n'est qu'une ligne de journal `{simulated:true}` | `shop_order_contract.js`, `social/shop/orders.rs` | **3 % pris sur le vendeur** (10 € → vendeur 9,70 €), montants en `REAL` (virgule flottante) ; litige tranché par atome jamais appelé |
| Domaines | **Simulés** : registre imaginaire (un nom sur quatre « pris »), prix en dur ; achat, transfert, DNS, mails simulés ; seuls Relier/Vérifier (TXT, CNAME, certificat) sont réels | `site/domains.rs`, `server/site_domains.js` | 3 % **inclus dans le HT** (`ceil`), TVA 20 % **ajoutée** ; aucun contrôle de rôle ; devis non lié au compte qui l'a demandé ; renouvellement jamais facturé ; grand livre à part `site_domain_ledger` |
| Client OVH | **Réel pour les SMS** (signature `$1$` SHA-1, `/auth/time`) | `auth/sms.rs:144-205` | réutilisable pour `/order/cart` après extraction (fonction privée, erreurs propres aux SMS) |
| IA payée par atome | **Réelle pour OpenAI seul** (clé partagée), gardée par des « sièges » et quotas journaliers (400 ops, 300 k jetons), **sans lien avec l'argent** ; jetons comptés après l'appel ; aucun coût par appel enregistré | `providers/shared_grant.rs`, `dispatch.rs:267-314` | réservation de budget avant l'appel, coût réel et prix facturé tracés à part |
| Not Diamond | **Absent** (R-120, non commencé) | — | hors de ce lot, sauf le comptage financier |
| Rôles | **Réels** : `admin`, `tester`, donnés seulement par `scripts/account_roles_admin.mjs` ; revérifiés par le serveur à chaque trame | `ws_api/sources/account_roles.rs` | pas de rôle propriétaire ni de liste blanche TestFlight ; aucun écran d'administration |
| Identité d'environnement | **Déclarée par le client** (`platform` libre, `#if DEBUG` pour les notifications) ; aucun signal de confiance TestFlight / App Store | `auth/devices.rs:17-61` | il faut une preuve signée par Apple (`AppTransaction`) |
| MCP | passe par les mêmes trames `/ws/api` que l'app ; `shop.buy`, `shop.order`, `site.domain_buy`, `site.domain_transfer` exposés ; seule garde serveur = compte connecté | `remote_commands.rs`, `full-map.json` | les contrôles d'argent iront dans le serveur, donc aussi pour MCP |
| Synchro hors ligne | ne rejoue que des événements d'atomes ; aucune dépense n'est rejouée | `local_atome_sync_worker.rs:134-147` | garder ainsi (aucune dépense dans `sync_queue`) |

Flux du diagramme et leur état aujourd'hui : 01 activation simulée · 02 recharge absente · 03 domaine simulé,
3 % mal placés · 04 vente simulée, 3 % pris au vendeur · 05 IA réelle sans argent · 06 remboursement simulé (boutique
seulement) · 07 verrou bêta **absent** (aucune distinction sandbox).

## 2. Avis

1. **La faille urgente est le verrou bêta.** Dès qu'on rallume les achats intégrés, un reçu sandbox TestFlight vaut un
   vrai paiement. Le lot C (protection) passe donc avant tout le reste, comme le demande le cahier.
2. **Le diagramme a un point juridiquement fragile : payer un vendeur avec un solde.** Garder de l'argent de clients
   et le transférer à un autre utilisateur, c'est de la monnaie électronique ou un service de paiement (DSP2) ; il faut
   un agrément ou un établissement agréé. Un compte Stripe classique ne le permet pas. Deux voies conformes :
   - **A (recommandée)** : le solde en euros ne paie **que atome** (son offre, l'IA, les services, les domaines qu'atome
     achète puis revend) : ce sont des avoirs sur les propres services d'atome, hors monnaie électronique (exclusion
     « réseau limité »). Une vente entre personnes se paie **par carte au moment de l'achat**, via **Stripe Connect** :
     Stripe garde les fonds pendant le séquestre, verse 10 € au vendeur après livraison, et atome garde 0,30 € en frais
     d'application. Le vendeur et son IBAN sont vérifiés chez Stripe.
   - **B** : un établissement de monnaie électronique pour places de marché (Mangopay, Lemonway) tient de vrais
     porte-monnaie par utilisateur, transférables. C'est conforme au diagramme tel quel, mais c'est un second
     prestataire et un contrat de plus.
   À faire relire par un juriste ou un expert-comptable avant la mise en production, quelle que soit la voie.
3. **Les frais de paiement mangent la commission.** Stripe en France coûte environ 1,5 % + 0,25 € par carte
   européenne : 0,43 € sur une recharge de 12 €, et environ 0,40 € sur un achat de 10,30 €. Sur une vente entre
   personnes, atome perd donc environ 0,10 € par vente à 10 €.
4. **TestFlight : le contrôle doit tenir même contre un client qui ment.** Je propose trois verrous cumulés, tous côté
   serveur :
   - (a) un achat **sandbox ne donne jamais de valeur monétaire** : il est enregistré « test », au mieux il active le
     compte, sans euros ;
   - (b) l'app iOS envoie à l'ouverture de session l'**`AppTransaction` signée par Apple** ; le serveur y lit
     l'environnement : *Sandbox* = TestFlight ; un client iOS sans preuve valide est traité comme TestFlight
     (on bloque par défaut) ;
   - (c) toute dépense réelle exige un **rôle de liste blanche + un budget réservé**, et l'interrupteur général est
     allumé.
   Un testeur ne peut pas re-signer l'app ; s'il passe par le Web, il paie avec de l'argent réel, ce qui est le
   fonctionnement voulu.
5. **Une seule source de vérité.** Un grand livre en partie double, en centimes, dans `atome-server` : comptes
   (solde client, dû vendeur, dû fournisseur, commission atome, TVA, frais prestataire, en attente, versé),
   réservations à expiration, références uniques, et rapprochement avec les webhooks Stripe et les commandes OVH.
   `site_domain_ledger` et le journal de la Boutique s'y replient. Les crédits IA du mois restent un **quota** à part,
   jamais convertible en euros.
6. **Ordre de travail** : on peut coder et tester sans argent réel tout ce qui ne dépend pas de tes comptes (verrou,
   grand livre, réservations, 3 %, Stripe en **mode test**, faux OVH contractuel). Les essais réels (Stripe en direct,
   commande OVH, IAP en production) attendent tes comptes et ton accord, dépense par dépense.

## 3. Maquettes (vraies briques, vrais jetons ; à valider, règle 16)

Script : `temp/finance_2026-11-16/mockups/finance.mockup.mjs`. Planches légendées :
`temp/finance_2026-11-16/mockups/planche_1_client.png`, `planche_2_historique_admin.png`.

| Maquette | Écran |
| --- | --- |
| M1 `paiement.png` | Réglages › **Paiement** : solde en euros (« Argent réel ») à part des crédits IA du mois (quota) ; carte gardée chez Stripe ; offre et recharge automatique ; compte bancaire des ventes ; bande Rechar. · Histo. · ✕ |
| M2 `recharge.png` | **Recharger** pour moi ou pour quelqu'un (un contact : sa recharge ou son activation), montant sur un rouleau (12, 21, 34, 55 €), carte validée par la banque ; bande ← · Payer |
| M3 `devis.png` | **Devis d'un domaine** : 10,00 € OVHcloud + 0,30 € atome = 10,30 € ; solde 12,00 → 1,70 € ; ligne orange « Argent réel » pour un compte autorisé sur TestFlight seulement |
| M4 `refus.png` | Le même devis sur **TestFlight non autorisé** : pas de Payer, la phrase de refus du cahier |
| M5 `histo.png` | **Historique** : sommes en attente (séquestre) à part, une ligne par opération |
| M6 `admin.png` | Réglages › **Budget** (propriétaire seul) : budget de test, dépensé/réservé, plafonds par catégorie (lignes de curseur), comptes autorisés ; interrupteur **Réels** à côté du ✕ = arrêt d'urgence |
| M7 `compte.png` | **Un compte autorisé** : autorisé/bloqué, plafonds opération/jour/mois, prompts IA, catégories permises |

Contrôle de la charte : panneau standard, cartes, aucune bordure, ✕ dans le coin opposé à l'assistant, l'interrupteur
à côté du ✕, nom au centre du pied, ← de pas à gauche, valeurs sur la ligne du curseur, choix dans une série sur un
rouleau, valeurs par défaut naturelles (règle 19). Éléments neufs à valider : les tuiles « Paiement » et « Budget »
dans Réglages (M1 remplace la tuile « Offre » de la maquette M1 de R-120 ; M6 absorbe « Budget IA » de M2 de R-120).
Défaut vu au passage : la ligne de texte d'une carte coupe sans « … » (même défaut que `site_panel_nodes.js#line`) ;
correction à la brique pendant le lot G.

## 4. Plan (après tes réponses)

| Lot | Contenu | Dépend de |
| --- | --- | --- |
| C1 | Verrou : environnement de paiement enregistré sur chaque achat (Apple `environment`, Google `testPurchase`) ; sandbox = jamais d'euros ; `AppTransaction` vérifiée à la session ; rôles `owner` et liste blanche ; interrupteur général ; garde serveur unique `spend.authorize(compte, environnement, catégorie, montant)` appelée par **toute** opération qui coûte (IA partagée, domaine, boutique, services), donc aussi par MCP | rien |
| C2 | Budgets : global, par compte, jour/mois/opération, par catégorie ; réservation avant l'appel au fournisseur, coût réel ensuite, différence libérée ; quota IA à 0 par défaut pour TestFlight | C1 |
| B | Grand livre en partie double en centimes (Rust) ; réservations à expiration ; idempotence ; concurrence (transaction `IMMEDIATE`) ; rapprochement ; replis de `site_domain_ledger` et du journal Boutique ; correction « jamais négatif » | rien |
| D | Stripe (Web, Tauri) : moyen de paiement (SetupIntent, 3-D Secure), recharge, activation 12 €, paiement pour autrui, webhooks signés et dédoublonnés, recharge automatique ; mode test d'abord | ton compte Stripe (clés test puis live) |
| E1 | 3 % en supplément pour l'acheteur, une seule fois, partout (contrat unique, centimes) ; Boutique corrigée (vendeur 10 €, atome 0,30 €) | B |
| E2 | Domaines : fournisseur OVH réel derrière le contrat existant (prix lu, commande `/order/cart`, confirmation avant « acheté »), renouvellement facturé, devis lié au compte, échecs régularisés | B, C, ton compte API OVH |
| E3 | Boutique : paiement par Stripe Connect (voie A) ou par l'établissement choisi (voie B) ; versement après séquestre ; litige tranché par atome | ta réponse Q3, compte Connect |
| E4 | IA et services : coût réel par appel (fournisseur, modèle, jetons, prix daté), prix facturé à part, rien facturé quand un tiers paie | B, C2 |
| F | iOS/Android : achats intégrés rallumés avec la séparation sandbox/réel, règles Apple appliquées | tes réponses Q8, accords payants Apple/Google actifs |
| G | Interfaces M1–M7 validées, phrases dans `eveT`, commandes MCP/voix de chaque écran | tes validations |
| H | Matrice des 20 tests du cahier en sondes `temp/` (Stripe en mode test, faux OVH) ; tests réels seulement sur compte autorisé, budget approuvé, ton feu vert avant chaque dépense | tout ce qui précède |

## 5. Réponses de l'utilisateur (16 nov. 2026) — le modèle validé

1. **Voie A validée** : le solde paie atome (services, IA, stockage, domaines) ; une vente entre personnes se paie par
   carte via Stripe Connect, le vendeur reçoit le prix entier, atome garde ses 3 %.
2. **Frais de carte absorbés par atome** (le taux de 3 % pourra monter plus tard, décision de l'utilisateur).
3. **Arrondi** : prix TTC, 3 % au centime le plus proche, TVA d'atome comprise. Validé.
4. **Plus de mois, nulle part.** Les 12 € d'activation sont un **solde de consommation** qui se décompte : l'IA
   (jetons au coût réel + 3 %) et le stockage (son coût, 5 €/mois pour atome, facturé + 3 %, décompté au fil des
   jours comme des jetons). La personne voit son solde baisser, sans durée promise. Les offres Standard/Plus/Max
   « par mois » et le pack de crédits disparaissent au profit de ce décompte unique.
5. **Invitations** : l'administrateur choisit pour chacune : offerte, à payer, ou avec un rabais.
6. **Sans objet** : à 0, c'est 0 ; il n'y a pas de quota mensuel.
7. **Retrait vers la banque : obligatoire.** Mise en œuvre conforme à la voie A : l'argent des ventes est sur le
   compte Stripe Connect du vendeur et se vire vers sa banque ; le solde de consommation non utilisé se rend par
   remboursement sur la carte qui l'a payé (jamais vers le compte d'un autre).
8. **iOS** : la commission d'Apple est répercutée sur le prix (12 € → 16,20 € en achat intégré) ; lien vers le
   paiement Web là où Apple le tolère.
9. **Achat sandbox TestFlight** : il active le compte, et rien d'autre : pas d'euros, pas de décompte, pas d'IA, pas de
   paiement.
10. **Administrateurs** : plusieurs à terme, sur une liste bien protégée (jamais dans le code, jamais par téléphone en
    dur).
11. **Pas de compte Stripe.** Tout essai doit être gratuit : le mode test de Stripe ne coûte rien (compte gratuit,
    aucune carte demandée, aucun débit) ; sinon, autre solution.
12. Non répondu explicitement : partie financière de R-120 prise ici (proposition maintenue).
13. **Maquettes non validables** : les planches étaient noires (images non chargées par l'assemblage). Refaites.

## 5 bis. Second tour (16 nov. 2026, après les maquettes refaites)

- **Maquettes M1–M9 validées** (« les visuels sont parfaits pour moi »).
- **Entrée 12 €** : prix d'entrée unifié qui couvre à peu près les frais d'inscription ; il ouvre **12 € de crédit**
  (rien n'est gardé pour l'entrée) ; le compte reste ouvert à 0.
- **Recharge à montant libre** (1 €, 2 €…), le rouleau propose des valeurs naturelles et se tape au double toucher.
  Les frais de carte restent absorbés (sur 1 €, ≈ 0,27 € de frais Stripe : noté, décision de l'utilisateur).
- **Stockage** : forfait récurrent dont le prix par mois est affiché (5 € + 3 % = 5,15 € les 30 jours, décompté au jour).
- Questions 1–4 du second tour : adoptées telles que recommandées (« ça me semble très bien ») : stockage au forfait
  affiché ; à 0 € rien n'est effacé, tout reste lisible, IA et nouveaux envois arrêtés, le stockage est alors à la
  charge d'atome ; un administrateur propose un administrateur, l'administrateur principal confirme ; domaines en
  simulation tant que la clé OVH avec droit de commande n'existe pas (code du fournisseur réel prêt).

## 5 ter. Questions initiales (13), pour mémoire


1. **Sommes entre utilisateurs** : voie A (le solde ne paie qu'atome ; une vente se paie par carte via Stripe Connect)
   ou voie B (établissement de monnaie électronique, vrais porte-monnaie transférables comme dans le diagramme) ?
   *Recommandé : A.*
2. **Frais de carte** (≈ 1,5 % + 0,25 €) : atome les absorbe, ou l'acheteur paie « 3 % + frais réels » ?
   Exemple d'une vente à 10 € : soit 10,30 € et atome perd ≈ 0,10 €, soit ≈ 10,70 €. Pour une recharge de 12 € :
   frais absorbés (recommandé) ou recharge minimale plus haute ?
3. **TVA et arrondi des 3 %** : prix affichés TTC ; 3 % calculés sur le prix TTC du fournisseur ou du vendeur,
   arrondis au centime le plus proche (0,015 € → 0,02 €) ; la TVA due sur la part d'atome est comprise dans ces 3 %.
   D'accord ? (Aujourd'hui, les domaines ajoutent la TVA par-dessus.)
4. **Activation 12 €** : c'est le premier mois de l'offre Standard (12 €/mois, comme aujourd'hui), ou un droit
   d'entrée unique, l'offre se payant à part ? Une part de ces 12 € va-t-elle au solde en euros ? *Recommandé : premier
   mois de l'offre, rien au solde (diagramme : « pas automatiquement crédité »).*
5. **Invitation sans paiement** : seulement les invitations que l'administrateur marque « offerte », ou toute
   invitation ? *Recommandé : marquée par l'administrateur.*
6. **IA au-delà du quota du mois** : l'IA s'arrête jusqu'au mois suivant, ou elle continue en débitant le solde en
   euros au coût réel + 3 % ? (Le pack « 4 000 crédits = 5 € » disparaîtrait alors.)
7. **Solde rendu en argent** : un utilisateur peut-il retirer son solde inutilisé vers sa banque ? (Voie A : non,
   sauf fermeture de compte ou faute d'atome ; voie B : oui, c'est obligatoire.)
8. **iOS en production** : offre et recharge par achat intégré (prix majoré : environ 16,20 € au lieu de 12 € avec
   la commission Apple de 26 %), ou lien vers notre paiement Web (Apple prend 15 %, ou 10 % pour les petits
   développeurs, en Europe) ? Domaines et biens physiques payés par Stripe dans l'app (permis par Apple) ; ventes de
   contenus numériques entre personnes masquées sur iOS tant que ce n'est pas tranché.
9. **Achat sandbox sur TestFlight** : il active le compte (compte « test », sans euros et sans IA payante), ou rien
   du tout (les testeurs entrent seulement par invitation) ? *Recommandé : il active, sans valeur.*
10. **Propriétaire et liste blanche** : le propriétaire, c'est ton compte seul (rôle `owner` donné une fois par le
    script, par ton téléphone vérifié, jamais dans le code) ? La liste blanche, c'est un rôle donné depuis l'écran M6
    par le propriétaire ? Faut-il un second administrateur ?
11. **Comptes et clés** : as-tu un compte Stripe (clés test puis live, Connect si voie A) et un accès API OVH avec
    droits de commande et moyen de paiement par défaut sur le compte OVH ? Les clés iront dans `private/`, jamais
    dans le dépôt.
12. **Périmètre IA** : ce chantier prend la partie financière de R-120 (réservation, coût réel par appel, budget) ;
    le routage Not Diamond reste dans R-120. D'accord ?
13. **Maquettes M1 à M7**, et les deux tuiles neuves « Paiement » (tout compte, après Compte) et « Budget »
    (propriétaire seul) : validées telles quelles ?
