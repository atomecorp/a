# Étude — Achats récurrents et boutiques (plan d'analyse)

Demande (toi, 2026-11-05) : une tâche transverse sur les produits. Faire des listes (compléments chez Nutri&Co ou
Nutripure, produits ménagers, n'importe quoi), commander chaque mois au même endroit, soit tout seul, soit après ta
validation (eVe prépare la commande, tu la relances). eVe te rappelle quand un produit va manquer. Savoir comment gérer
les boutiques (combien), et comment ça s'articule avec l'agenda, les projets et les objectifs. **Analyse seulement** :
si ce n'est pas faisable ou pas pertinent, on s'arrête là. Registre : R-119.

Ce document est le plan de l'analyse, pas l'analyse. Rien n'est codé, aucune maquette n'est faite.

## 0. Ce qui existe déjà (relevé le 2026-11-05, à confirmer en phase 1)

| Brique | Propriétaire | Utile pour |
| --- | --- | --- |
| Liste de courses « Quotidien » (panier, Récent, Éviter, Scan, Ajout, prix, favoris, quantité, `checked_at`) | `atome/src/shared/shopping_list_contract.js`, `eVe/domains/shopping/shopping_list_runtime.js`, `eVe/domains/dashboard/dashboard_shopping*.js` | Les listes elles-mêmes ; l'historique d'achat (dates) pour deviner le rythme |
| Panier partagé en temps réel | `dashboard_shopping_share.js`, `share.*` | Liste du foyer |
| Compléments et Médicaments (posologie, prises par jour, pause, arrêt automatique) | `eVe/domains/dashboard/health_products_*.js`, `health_products.*` | Calcul exact du jour où une boîte sera vide |
| Boutiques (Tout, Ma boutique, Favoris, Achats, Ventes ; vente entre personnes, paiement simulé, séquestre) | `atome/src/shared/shop_contract.js`, `server/shop.js`, `eVe/domains/shop/shop_runtime.js`, `eVe/domains/dashboard/dashboard_shop.js:27` | **La même rubrique** reçoit les boutiques du web (Tout, Favoris) et leurs commandes (Achats) ; décision de travail du 2026-11-05 |
| Calendrier, alarmes, actions programmées | `atome/src/shared/calendar_tool_contract.js`, cahier `todo/Calendar Scheduled Actions.md`, R-008 | L'échéance « commander » et son action |
| Objectifs, programmes, repas préconisés | `eVe/domains/objectives/`, `eVe/domains/programs/`, `todo/etude_nutrition_menus_2026-10-27.md` | Un objectif qui produit ses besoins |
| Facturation (crédits eVe, paiement simulé) | `atome/src/shared/billing_contract.js`, `server/billing/` | Ne paie pas un tiers |

Contraintes fixes : serveur seule vérité (règle 21), une seule chaîne de mutation, toute action d'écran a sa commande MCP,
charte 11–16 (tout nouvel écran passe par une maquette validée), nombres d'or pour les valeurs proposées (règle 19).

## 1. Inventaire précis des briques (lecture du code)

But : savoir ce qu'on réutilise tel quel, ce qu'on étend, ce qui manque.

- Lire le contrat des articles de courses : peut-il porter une boutique, une contenance (boîte de 60 gélules), un rythme ?
- Lire le modèle Compléments : la contenance d'une boîte et la date d'ouverture existent-elles, ou seulement la posologie ?
- Lire le moteur d'actions programmées : une action « ouvrir une commande préparée » peut-elle s'y loger sans brique neuve ?
- Lire les objectifs et les repas : d'où viendrait la liste des besoins d'un objectif ?
- Lire la rubrique Boutiques : ce qu'une boutique du web doit y ajouter (paiement hors eVe, pas de séquestre ni de conversation).

Livrable : tableau brique → réutilisée / étendue / à créer, avec les fichiers.

## 2. Pertinence : pour quoi, pour qui

But : vérifier que ça vaut la peine avant d'étudier la technique.

- Familles de produits : compléments, médicaments sans ordonnance, hygiène, ménager, animaux, alimentation sèche, drive
  alimentaire. Pour chacune : fréquence, régularité de la consommation, panier moyen, nombre de boutiques en jeu.
- Ce que la personne perd aujourd'hui : la rupture (oublier de recommander), le temps (refaire le même panier), l'argent
  (frais de port, promotions manquées).
- Ce que les boutiques offrent déjà : beaucoup proposent leur propre abonnement. eVe apporte alors la vue d'ensemble de
  toutes les boutiques, les rappels liés à la consommation réelle, et le lien avec la santé et les objectifs.

Critère de poursuite : au moins deux familles où eVe apporte plus qu'un abonnement chez le marchand.

## 3. Faisabilité boutique par boutique (le cœur de l'analyse)

Échantillon de départ (8 boutiques) : Nutri&Co, Nutripure, Amazon, un drive (Carrefour ou Leclerc), une pharmacie en
ligne autorisée, une boutique bio (La Fourche ou équivalent), un site de produits ménagers, une animalerie en ligne.

Pour chacune, relever sur le vrai site (sans compte ni achat) :

- La plateforme (Shopify, WooCommerce, Magento, maison) : elle dit si un lien de panier prérempli est possible.
- Le lien de panier prérempli : un lien qui ouvre la boutique avec les bons produits et les bonnes quantités déjà dans le
  panier. Exemple Shopify : `boutique.fr/cart/<variante>:<quantité>,<variante>:<quantité>`. Le tester à la main.
- L'abonnement propre à la boutique (rythme, remise, modification, résiliation).
- Une API publique ou un flux produits (catalogue, prix, disponibilité), un programme d'affiliation (Awin, Effiliation…).
- Les conditions d'utilisation sur l'automatisation et les robots.

Chaque boutique est rangée à un niveau d'intégration :

| Niveau | Ce que fait eVe | Qui paie, où |
| --- | --- | --- |
| N0 | Rappel + lien vers la page du produit | La personne, sur le site |
| N1 | Rappel + panier prérempli en un toucher | La personne, sur le site (une validation) |
| N2 | Suit l'abonnement de la boutique (dates, contenu), prévient avant chaque envoi, propose d'ajuster | La boutique prélève, selon l'abonnement que la personne a souscrit chez elle |
| N3 | Passe la commande elle-même | Seulement par une API officielle de la boutique ; à justifier |

Hypothèse à vérifier : N0 et N1 sont faisables presque partout, N2 chez les boutiques à abonnement, N3 presque nulle part.
L'automatisation d'un site (robot qui clique « Payer ») est exclue d'avance : fragile, souvent interdite par les
conditions, et elle obligerait eVe à garder les moyens de paiement.

Livrable : la grille des 8 boutiques avec leur niveau, et deux liens de panier prérempli vérifiés à la main
(Nutri&Co et Nutripure), sondes et captures sous `temp/achats_recurrents/`.

## 4. Paiement et droit

- Authentification forte (DSP2, 3-D Secure) : un paiement mensuel sans la personne n'est possible que si la boutique le
  déclenche elle-même dans le cadre d'un abonnement (N2). Le confirmer.
- Commande au nom de la personne (mandat), droit de rétractation, responsabilité en cas d'erreur de commande.
- Médicaments : en France, seulement sans ordonnance et seulement par une pharmacie autorisée.
- Données de santé : la consommation de compléments et de médicaments en est. Hébergement et chiffrement comme le reste
  de la santé.
- iOS et Android : un bien physique peut se payer hors de l'achat intégré ; vérifier qu'un lien sortant vers une
  boutique ne pose pas de souci de règles d'application.
- Rémunération possible pour eVe : affiliation (commission sur les ventes envoyées), sans changer le prix pour la personne.

Phase de test : ces points sont relevés, pas bloquants pour coder (ta règle de phase de test).

## 5. Savoir quand ça va manquer

- Compléments et médicaments : contenance de la boîte ÷ prises par jour → date exacte de la fin. Rappel quand il reste
  le délai de livraison de la boutique plus une marge.
- Autres produits : rythme appris des achats passés (dates de `checked_at`), ou rythme réglé à la main (« tous les mois »).
- Signal manuel : « presque fini » au toucher, ou le scan du code-barres d'un produit vide.
- À mesurer : sur tes vraies listes, le rythme appris est-il assez juste pour prévenir sans déranger ?

Livrable : la règle de calcul de la date de rappel, par famille, avec un exemple chiffré.

## 6. Gérer les boutiques

Questions à instruire :

- Une boutique = un atome (nom, adresse du site, niveau N0–N3, modèle de lien, délai de livraison, seuil de port
  gratuit, abonnement en cours). Où vit-il, à qui appartient-il ?
- Combien : pas de limite. Un catalogue de départ des boutiques étudiées en phase 3, plus « une autre boutique » par son
  adresse. À voir : catalogue commun à tous (tenu par nous) ou propre à chaque personne.
- Un produit lié à sa boutique habituelle, avec une boutique de secours possible ; une liste regroupée par boutique pour
  atteindre le port gratuit.
- Prix suivis à chaque commande (le champ `price` existe déjà) pour voir les hausses.
- Une seule rubrique Boutiques (2026-11-05, ta question « pourquoi pas la même boutique pour les deux ? ») : une boutique
  porte sa sorte, « eVe » (une personne vend dans eVe) ou « web » (on paie sur le site de la boutique) ; ce qui diffère
  (paiement, séquestre, conversation, 3 %) suit la sorte, pas une autre rubrique.

Livrable : proposition du modèle de données (atome boutique, liens avec articles et compléments), sans code.

## 7. Agenda

- Une commande récurrente = une série dans l'agenda (« Commande Nutripure », tous les mois), ou une échéance recalculée
  à chaque fois à partir de la consommation : comparer les deux.
- Les deux modes que tu as décrits :
  - **Automatique** : la commande part sans toi. En pratique, c'est l'abonnement de la boutique (N2) qu'eVe suit et
    annonce la veille.
  - **Validée** : eVe prépare la commande et la place dans l'agenda ; à l'heure dite, un toucher ouvre le panier
    prérempli (N1) ; « Fait » enregistre la commande et cale la suivante.
- Vérifier que le moteur d'actions programmées porte cette action sans brique parallèle.

## 8. Projets et objectifs

- Un objectif (Muscles, Sommeil, Nutrition…) qui recommande des compléments ou des repas produit ses besoins dans la liste,
  rattachés à l'objectif ; l'objectif clos, ses achats récurrents s'arrêtent ou te sont proposés à l'arrêt.
- Un projet (déménagement, travaux, une fête) avec sa propre liste et ses boutiques.
- Budget : le coût mensuel des achats récurrents, par objectif et en tout.
- Le suivi : un complément pris et recommandé sans rupture compte dans le suivi de l'objectif.

## 9. Assistant et commandes

- Les commandes MCP à prévoir (prolonger `shopping.*` et `health_products.*`, ou une famille neuve) ; une commande vers une
  boutique jamais lancée par une IA sans ta confirmation.
- Ce que l'assistant peut dire seul : « Ta créatine finit dans 6 jours, je prépare la commande Nutripure ? ».

## 10. Bilan et décision

Le rapport final (dans ce fichier) dira :

1. Faisable ou non, famille par famille et boutique par boutique (grille de la phase 3).
2. Pertinent ou non (phase 2), avec la recommandation : continuer, réduire, ou arrêter.
3. Si on continue : les briques réutilisées et à créer, les écrans à maquetter (règle 16), les lots de code.
4. Les décisions qui restent à toi (ci-dessous), à poser une par une.

## Avancement

- [x] Plan d'analyse écrit (2026-11-05)
- [x] 1. Inventaire des briques
- [x] 2. Pertinence
- [x] 3. Grille des boutiques + 2 liens de panier vérifiés
- [x] 4. Paiement et droit
- [x] 5. Règle de rappel
- [x] 6. Modèle des boutiques
- [x] 7. Agenda
- [x] 8. Projets et objectifs
- [x] 9. Assistant et commandes
- [x] 10. Bilan et recommandation

# Résultats de l'analyse (2026-11-05)

## R1. Inventaire (lecture du code)

- Article de courses : ni boutique, ni lien, ni contenance, ni rythme. Racheter **écrase** `checked_at` (un seul instant,
  `eVe/domains/shopping/shopping_list_runtime.js:255`) ; l'historique n'existe que dans les versions de l'atome.
  Commandes `shopping.*` : list, add, update, check, uncheck, remove, clear_checked, sync_nutrition, open.
- Compléments et Médicaments : posologie (`per_intake`, heures, `start_day`, `end_day`) et **journal des prises**
  (`health_products.intakes`, `intakes_range`), mais ni contenance de boîte, ni stock, ni date d'ouverture
  (`eVe/domains/programs/program_declared_products.js:122-131`). La recherche BDPM lit pourtant déjà « boîte de 8 »
  (`medicine_catalogue.js:42-58`) sans l'enregistrer. Aucun rappel « bientôt fini ». Ces commandes sont fermées aux IA.
- Agenda : séries (`recurrence` RFC 5545) et **alarme qui lance une commande canonique à l'heure dite**
  (`calendar.alarm.set` `command`, `atome/src/shared/calendar_tool_contract.js:27-33`, tirée par
  `eVe/intuition/tools/calendar_alarm_delivery.js:106-118`, refusée si l'utilisateur a changé). Aucune brique neuve à
  créer pour l'échéance.
- Lien sortant : `atome/src/squirrel/shared/external_page.js` (iOS `squirrel.openURL`, Tauri opener, Web `window.open`
  **`noopener`** réservé pendant le geste). Avec `noopener`, eVe perd la fenêtre : impossible d'y enchaîner des ajouts.
- Objectifs : les repas écrivent déjà la liste (`shopping.sync_nutrition`, `shopping_list_model.js:37-78`) ; aucun objectif
  ne propose de compléments (brique `treatments_and_supplements`, `review_required`, jamais par défaut).
- Boutiques : plaques Tout, Ma boutique, Favoris, **Achats**, Ventes (`eVe/domains/dashboard/dashboard_shop.js:27`) ;
  aucune affiliation nulle part.

## R2. Pertinence

| Famille | Conso régulière | Ce qu'eVe sait déjà | Verdict |
| --- | --- | --- | --- |
| Compléments | oui, exacte | posologie + journal des prises | **fort** : date de fin exacte, plusieurs marques, lien santé |
| Animaux (croquettes) | oui | rien | bon : rythme fixe, souvent un abonnement chez la boutique |
| Ménager, hygiène | assez | catégories `household`, `hygiene` | moyen : rythme appris ou réglé à la main |
| Médicaments sans ordonnance | selon le traitement | posologie, `end_day` | possible, pharmacie autorisée seulement |
| Drive alimentaire | non, la liste varie | la liste de courses | faible : la liste actuelle suffit, aucun lien de panier |

Critère du plan (deux familles où eVe apporte plus qu'un abonnement chez la boutique) : **atteint** (compléments,
animaux ; ménager en appoint). Ce qu'aucune boutique ne fait : regrouper toutes les marques, déclencher sur la
consommation réelle et non sur un calendrier fixe, relier au suivi santé et aux objectifs.

## R3. Grille des boutiques (vérifiée sur les vrais sites, sans compte ni achat)

| Boutique | Plateforme | Panier prérempli | Abonnement chez elle | Niveau |
| --- | --- | --- | --- | --- |
| Nutri&Co | PrestaShop (code de la page) | **oui, vérifié** : un lien par produit, enchaînés | oui (« Mes abonnements », −15 % selon un blog, non confirmé sur le site) | N1 + N2 |
| Nutripure | PrestaShop (étude Axome) | **oui, vérifié** : 2 liens → 3 articles au panier | non trouvé (packs −10 %, cagnotte) | N1 |
| Amazon | maison | oui, documenté : **un seul lien** pour plusieurs articles (`/gp/aws/cart/add.html?ASIN.1=…&Quantity.1=…`, avec l'identifiant Partenaires) | « Prévoyez et économisez » (jusqu'à −15 %) | N1 + N2 |
| Boutiques Shopify | Shopify | oui, documenté : un seul lien `/cart/<variante>:<qté>,…` | selon l'appli de la boutique | N1 |
| La Fourche | Shopify derrière un site Next.js, adhésion | non : le lien Shopify ne passe pas par leur site | adhésion annuelle | N0 |
| Pharma GDD | Sylius | à étudier (pas de lien connu) | non vérifié | N0 |
| Zooplus | maison (Next.js) | non vérifié | **oui** : « zooplus Zen », gratuit, sans engagement, −5 % | N0 + N2 |
| Carrefour, Leclerc (drive) | maison, Cloudflare | non (bloqué aux requêtes automatiques) | non | N0 |

Preuves : `temp/achats_recurrents/cart_chain.probe.mjs` (une page ouvre la boutique, puis la fenêtre qu'elle a ouverte
passe par les liens d'ajout : Nutri&Co → Magnésium B6 ×2 + Multivitamines ×1, 67,70 € + 4,50 € de port, capture
`temp/achats_recurrents/out_NutriCo_cart.png`) ; `temp/achats_recurrents/nutripure_cart.probe.mjs` (panier à 2 puis
3 articles). Deux pièges vus : le premier ajout se perd si la boutique n'a pas encore ouvert sa session (ouvrir son
accueil d'abord) ; Nutripure a bloqué la page du panier au navigateur automatique (Cloudflare) — chez une vraie
personne elle s'affiche, mais **N3 (robot qui commande) est exclu**, et ce blocage le confirme.

## R4. Paiement et droit (relevé, non bloquant en phase de test)

- Paiement mensuel sans la personne : seule la boutique peut le faire (paiement initié par le marchand après une
  première authentification forte, DSP2). Donc « automatique » = l'abonnement de la boutique (N2), jamais eVe.
- eVe ne voit ni ne garde aucun moyen de paiement : la personne paie sur le site, souvent déjà connectée et avec sa carte
  enregistrée (Nutri&Co : « Ma carte enregistrée »).
- Bien physique : paiement hors achat intégré permis sur iOS et Android ; un lien sortant vers une boutique est admis.
- Médicaments : en France, sans ordonnance et par une pharmacie autorisée seulement.
- Données de santé : la consommation de compléments en est ; elle reste dans le coffre de la personne (règle 21).
- Affiliation possible : Nutri&Co a une page « affiliation », Nutripure est listée sur affi.io, Amazon Partenaires ;
  le prix ne change pas pour la personne.

## R5. Savoir quand ça va manquer

- Compléments et médicaments : `stock = unités achetées − prises notées depuis l'achat` (le journal des prises existe) ;
  `jours restants = stock ÷ prises par jour` ; rappel quand `jours restants ≤ délai de livraison de la boutique + 3`.
  Exemple : Magnésium B6 120 gélules, 2 par jour, livraison 3 jours → fin au 60ᵉ jour, rappel au 54ᵉ.
  Il manque la contenance de la boîte (à ajouter à `health_products.declare`, la BDPM la donne déjà pour les médicaments).
- Autres produits : rythme réglé à la main (tous les 21 jours, tous les mois…) ou appris des dates d'achat ; il faut alors
  garder les dates d'achat (aujourd'hui écrasées) : une ligne d'achat par commande dans Boutiques › Achats.
- Signal manuel : « presque fini » au maintien d'un article.

## R6. Modèle des boutiques (proposition, non codée)

- **Une seule rubrique Boutiques.** Une boutique porte sa sorte : `eve` (une personne vend dans eVe, l'existant) ou `web`
  (nom, site, plateforme `prestashop | shopify | amazon | autre`, modèle de lien, délai de livraison, seuil de port
  gratuit, abonnement chez elle oui/non). Ce qui suit la sorte : paiement (dans eVe / sur le site), séquestre,
  conversation, 3 %.
- Pas de nombre fixe. Catalogue de départ : les boutiques de la grille, plus « une autre boutique » par son adresse.
- Un article de courses ou un complément porte sa boutique habituelle et la référence du produit chez elle
  (`id_product`, variante, ASIN) avec sa contenance.
- Un **plan d'achat** par boutique : ses articles et quantités, son rythme (fixe ou selon la consommation), son mode
  (validé à chaque fois / abonnement de la boutique suivi), sa prochaine date. Chaque commande faite devient une ligne
  d'Achats (date, contenu, prix), ce qui donne l'historique et les hausses de prix.
- Regroupement par boutique pour atteindre le port gratuit (Nutri&Co l'affiche : « plus que 1,30 € »).

## R7. Agenda

- La prochaine date d'un plan est un événement de l'agenda avec une alarme `command` (mécanisme existant) qui prépare la
  commande et prévient. Rythme fixe → série ; selon la consommation → l'échéance est recalculée et l'événement déplacé à
  chaque prise ou achat. Recommandation : les deux, un seul événement par plan.
- Mode validé : la notification ouvre la commande préparée ; un toucher (le geste dont le Web a besoin) ouvre la boutique
  et remplit son panier ; « Commandé » écrit la ligne d'Achats et cale la suivante.
- Mode abonnement de la boutique : eVe annonce l'envoi la veille et rappelle comment le décaler chez la boutique.
- À créer pour le Web : dans `external_page.js`, une fenêtre de boutique gardée le temps d'enchaîner les ajouts
  (sans `noopener` pour cette seule séquence ; risque : la boutique peut alors agir sur l'onglet d'eVe, à n'ouvrir que
  pour les boutiques du catalogue). iOS et Tauri : vue web de l'app, aucun risque d'onglet, à vérifier sur appareil.

## R8. Projets et objectifs

- Un complément déclaré dans un objectif garde son lien : objectif clos → `health_products.list_stop` (existant) arrête
  aussi son plan d'achat.
- Les repas d'un objectif remplissent déjà la liste ; ils restent hors plan d'achat (alimentation variable).
- Un projet (déménagement, fête, travaux) peut porter sa liste et ses boutiques comme un objectif.
- Budget : somme des plans au mois, par objectif et en tout ; suivi : « sans rupture » compte dans l'objectif.

## R9. Assistant et commandes

- Prolonger `shop.*` (rubrique unique) : ajouter une boutique du web, régler un plan, lister les plans, préparer et ouvrir
  le panier, marquer commandé. L'assistant peut préparer et proposer (« Ta créatine finit dans 6 jours, je prépare la
  commande Nutripure ? ») ; ouvrir le panier reste un toucher de la personne ; payer se fait toujours sur le site.
- Les plans nés d'un complément suivent la règle des `health_products.*` : fermés aux IA.

## R10. Bilan

**Faisable et pertinent, en version réduite.** On garde N0 (rappel + lien), N1 (panier prérempli, vérifié sur
PrestaShop, documenté sur Shopify et Amazon) et N2 (suivi de l'abonnement de la boutique). On écarte N3 (eVe qui commande
et paie) : interdit par l'authentification forte sans abonnement chez la boutique, bloqué par les anti-robots.
Le plus fort : les compléments (date de fin exacte), puis animaux et ménager. Le drive alimentaire reste à la liste
actuelle.

Lots si tu dis oui (après tes réponses et les maquettes, règle 16) : L1 contenance et stock des compléments + rappel ;
L2 boutique `web` dans Boutiques + catalogue ; L3 plan d'achat + ligne d'Achats + agenda ; L4 panier prérempli
(PrestaShop, Shopify, Amazon) avec la fenêtre de boutique du Web ; L5 objectifs, budget, commandes MCP.

Écrans neufs à maquetter : la fiche d'une boutique du web, le plan d'achat, la notification « à commander ».

## Catalogue de départ proposé (ta demande du 2026-11-05 : « les boutiques les plus courantes… Amazon, Boulanger, et autres, à valider »)

Niveau attendu : N1 = panier prérempli, N2 = abonnement chez la boutique suivi par eVe, N0 = rappel + lien du produit.
« Vérifié » = testé sur le vrai site ; sinon à tester avant l'entrée au catalogue (décision Q2 A). Relevé automatique :
la plupart des grandes enseignes bloquent les requêtes automatiques (403), leur plateforme n'est donc pas confirmée.

| Usage | Boutique | Pertinence | Niveau attendu | État |
| --- | --- | --- | --- | --- |
| Compléments | Nutri&Co | forte | N1 + N2 | N1 vérifié |
| Compléments | Nutripure | forte | N1 | N1 vérifié |
| Compléments, sport | Nutrimuscle | forte | N1 + N2 (abonnement −10 %) | Shopify, à tester |
| Compléments, sport | Myprotein | forte | N1 ? | à tester |
| Tout | Amazon | forte | N1 + N2 (Prévoyez et économisez) | lien documenté, à tester |
| Tout | Cdiscount | moyenne | N0 | à tester |
| Courses, ménager | Carrefour, Leclerc, Auchan, Intermarché, Monoprix | moyenne (ménager, hygiène) | N0 | bloqués aux robots |
| Surgelés | Picard | faible à moyenne | N0 | Salesforce Commerce |
| Café | Nespresso | forte (capsules) | N0 + N2 (abonnement) | à tester |
| Animaux | Zooplus | forte | N0 + N2 (zooplus Zen) | à tester |
| Animaux | Wanimo | forte | N1 | Shopify, à tester |
| Pharmacie | Pharma GDD, Newpharma, Cocooncenter | moyenne (sans ordonnance, hygiène) | N0 | à tester |
| Beauté | Sephora, Nocibé | moyenne (soins rachetés) | N0 | à tester |
| Sport | Decathlon | moyenne (nutrition sport, consommables) | N0 | à tester |
| Équipement, électroménager | Boulanger, Fnac, Darty | faible en récurrent ; utile pour une liste de projet (déménagement) et les consommables (filtres, cartouches) | N0 | à tester |
| Bricolage, maison | Leroy Merlin, Castorama, ManoMano, IKEA | utile pour un projet (travaux, déménagement) | N0 | à tester |

Écartés : Leboncoin, Vinted (vente entre personnes : c'est la Boutique eVe elle-même), et Temu, Shein, AliExpress.
**Liste VALIDÉE telle quelle (A, 2026-11-05).** Chaque boutique est testée avant d'entrer au catalogue.

## Décisions (5, toutes répondues le 2026-11-05)

1. Le mode par défaut — **RÉPONDU B (2026-11-05)** : automatique quand la boutique a un abonnement que tu as pris chez
   elle (eVe le suit et annonce l'envoi la veille) ; sinon validé (eVe prévient, un toucher ouvre le panier rempli).
2. Catalogue de boutiques — **RÉPONDU A (2026-11-05)** : une liste commune tenue par nous (lien de panier réglé et
   testé par boutique), visible de tous dans Boutiques › Tout ; une boutique ajoutée par une personne et absente du
   catalogue reste privée, en mode rappel + lien du produit, jusqu'à ce que nous la réglions pour tous.
3. La place à l'écran — **RÉPONDU B (2026-11-05)** : tout rangé dans Boutiques › Achats, et un outil « Commander » sur
   la fiche d'un complément (Santé › Compléments) et au maintien d'un article (Mes courses), qui ouvre la même commande
   (même écran, pas une copie ; outil nouveau → maquette avant le code).
4. Affiliation — **RÉPONDU A (2026-11-05)** : oui ; liens des boutiques du catalogue avec l'identifiant d'Atome ; eVe ne
   choisit jamais une boutique parce qu'elle paie plus (boutique habituelle ou la moins chère) ; mention « lien affilié »
   une fois dans Boutiques (maquette) ; comptes Partenaires et programmes à ouvrir par toi (compte de l'entreprise).
5. Web — **RÉPONDU A (2026-11-05)** : un toucher, panier complet ; eVe garde la main sur l'onglet de la boutique le temps
   d'enchaîner les liens d'ajout (PrestaShop), seulement pour les boutiques du catalogue ; iOS et Tauri : vue propre à
   l'app.

**Toutes les décisions sont prises (2026-11-05).** Suite : les trois maquettes aux vrais jetons (fiche d'une boutique du
web, plan d'achat avec l'outil « Commander », notification « à commander »), puis les lots L1–L5.

## Lien avec l'audit paiement (R-121) et la facturation (R-120) — évalué le 2026-11-06

Ta question : réunir cette tâche avec « audit système de paiement atome » (`todo/audit_domaines_paiement_2026-11-05.md`).
Réponse : **non**, les deux restent séparées, rien n'est supprimé.
- Ici, aucun argent ne passe par atome : la personne paie sur le site de la boutique (décisions Q1, Q5).
- R-121 achète des noms de domaine avec de l'argent réel ; son paiement est déjà confié à R-120 (porte-monnaie, Stripe,
  grand livre Rust).
- Les fusionner bloquerait les achats récurrents derrière les comptes Stripe, OVH et les 10 questions de R-120.
- Point de contact unique : les commissions d'affiliation (Q4) sont un revenu d'atome, écrit dans le grand livre de
  R-120 quand il existera (lot L5).

## Maquettes (toutes validées le 2026-11-06)

- m1 fiche d'une boutique du web : `temp/achats_recurrents/mockups/m1_phone.png`, `m1_desktop.png` (outils Achat, Rythme, Site, Favori).
- m2 outil « Achat » au maintien d'un complément et d'un article de Mes courses : `m2a_complement.png`, `m2b_courses.png`.
- m3 proposition « à commander » dans la phrase d'eVe du champ du bas : `m3_phone.png`, `m3_desktop.png`.
