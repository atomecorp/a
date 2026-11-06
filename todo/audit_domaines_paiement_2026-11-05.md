# Audit — Site, nom de domaine, hébergement atome, paiement global réservé à deux comptes (2026-11-05)

Demande (toi, 5 nov.) : « une audit et des screenshots de la tâche qui consiste, quand on crée un site internet, à
acheter un nom de domaine, à l'héberger chez atome, à relier le nom de domaine… ensuite on va établir un plan… un moyen
de paiement global pour atome, dont 2 seuls utilisateurs pourront valider les paiements… filtrage par numéro de
téléphone… acheter des tokens chez OpenAI, Runway, MusicGPT, Mistral, Anthropic, DeepSeek… une interface
d'administration spéciale que pour nous… se mettre en relation avec la tâche Not Diamond… comptabiliser l'espace stocké
et les tokens… abonnement, crédit ou renouvelable… pour l'instant on n'attaque pas la tâche ». **Audit seulement : rien
n'est codé.** Registre : R-121.

Les deux comptes habilités (au format du serveur, E.164) : **+33652575517** (06 52 57 55 17) et **+33663694055**
(06 63 69 40 55).

## 1. Ce qui existe vraiment (vérifié dans le code le 5 nov.)

Le chantier « Publication web » (cahier `todo/publication_web_2026-10-28.md`, 18 questions tranchées, 16 maquettes
validées le 28 oct.) est **codé de bout en bout**. En résumé : un fournisseur de domaines simulé, aucun paiement réel,
aucun filtrage.

| Étape | État | Où |
| --- | --- | --- |
| Créer le site depuis un projet (pages, menu, « Aller ») | **Réel**, sondé (13/13 au toucher le 28 oct.) | `eVe/domains/site/`, `server/site_projection*.js` |
| Publier / programmer / historique / retirer | **Réel**, servi à `atome.one/<adresse>` | `server/site_publishing.js`, `server/site_http.js` |
| Hébergement | **Réel, inclus dans l'abonnement** (Q15) : trafic et stockage lus, jamais coupé | `server/site_services.js#hosting` |
| Relier un domaine qu'on possède | **Réel côté code** : preuve TXT `_atome.<domaine>` + CNAME vers `sites.atome.one`, vraie lecture DNS, certificat par `ATOME_SITE_CERT_COMMAND` | `server/site_domains.js#connect/verify` |
| Acheter un domaine | **Simulé** : registre imaginaire (un nom sur quatre « pris » au hasard), prix écrits en dur, rien n'est acheté | `server/site_domains.js#search/quote/buy` |
| Renouveler, DNS, transfert entrant/sortant | **Simulé** (enregistrements gardés en base, jamais envoyés à un registraire) | idem |
| Boîtes mail, alias, renvois | **Simulé** | idem |
| Paiement du domaine | **Aucun** : la carte « Paiement » affiche « Simulé : aucun achat, aucun paiement » | `site_panel_domain.js#quote` |
| Qui peut acheter | **Tout compte connecté** : aucun contrôle de rôle | `server/ws_site.js` |
| Comptabilité des domaines | Grand livre à part `site_domain_ledger` (coût fournisseur, part atome ≥ 3 %, TVA séparés), **non relié** au grand livre des crédits | `server/site_domains.js#ledger` |

Ce qui bloque la mise en ligne réelle, en dehors du code :

1. **`sites.atome.one` n'existe pas dans le DNS** (`dig` du 5 nov. : aucune réponse ; `atome.one` → 5.196.69.103).
   Le CNAME qu'on demande à l'utilisateur pointe donc vers un nom vide : la vérification ne peut pas aboutir en
   production.
2. **nginx/certbot** pour les domaines personnels (routage par hôte + certificat à la volée) : pas en place sur le
   serveur (décisions Q13/Q18, feu vert et accès SSH à donner).
3. **Aucun registraire** n'est branché, et aucun compte marchand non plus.

Briques déjà prêtes pour la suite :

- **Rôles de compte** : `server/auth_account_roles.js` (table `auth_account_roles`, rôle `admin` pour la Roadmap). Un
  rôle ne se donne que sur le serveur, par `scripts/account_roles_admin.mjs grant <rôle> --phone +33…` : le compte est
  retrouvé par son **téléphone vérifié**. Le serveur revérifie le rôle à chaque trame. C'est exactement le filtrage
  par téléphone demandé, sans écrire les numéros dans le code.
- **Grand livre de facturation** : `server/billing/billing_ledger.js` (append-only, idempotent, crédits inclus et
  achetés, offres 12 / 20 / 30 €, pack 4 000 crédits = 5 €, 1 crédit = 0,001 € de coût fournisseur). `debit` et
  `authorize` **n'ont aucun appelant** : aucune consommation d'IA n'est débitée aujourd'hui. **En cours de portage en
  Rust aujourd'hui** (`atome/servers/atome-server/src/billing/`, session Rust-first, R-118 L3.8) : c'est le futur
  propriétaire.
- **Coffre des clés fournisseurs** : `server/providerCredentialVault.js`, côté serveur seulement (chiffré, jamais lisible
  par le navigateur). Il ne connaît que `openai`, `musicgpt`, `runway` (plus Spotify et Deezer). **Anthropic, Mistral,
  DeepSeek et Not Diamond n'y sont pas**, alors qu'ils sont dans le catalogue des modèles
  (`atome/src/squirrel/ai/model_catalog_registry.js`).
- **Achats intégrés** Apple et Google vérifiés côté serveur ; Web et Tauri restent simulés (Stripe = un nom sans code).
- **SMS** : l'envoi OVH sert déjà au lien de téléphone. Il peut porter un code de validation de paiement.

« SoundGPT / AudioGPT » : c'est **MusicGPT** (`server/ai_audio/providers/musicgpt.js`), déjà branché.

## 2. Captures du vrai parcours (code actuel, Web, téléphone 430 × 932)

Sonde `temp/domaines_paiement/domain_flow_shots.mjs` : Fastify isolé, compte neuf, projet « Atelier Lune », vrais
touchers sur le canevas. Captures dans `temp/domaines_paiement/shots/` :

| Capture | Ce qu'elle montre |
| --- | --- |
| `01_publier_premiere_fois.png` | Panneau Publier d'un projet neuf (adresse, pages, « Mon domaine ») |
| `02_domaine_recherche.png` | Trouver un domaine, ligne orange « Simulé : aucun achat, aucun paiement » |
| `03_domaine_resultats.png` | Six extensions, « ✓ Libre », prix TTC à l'année (3 % compris), la rangée choisie sélectionnée |
| `04_devis.png` | Devis : réservé 15 min, prix, TVA, total garanti, renouvellement, paiement simulé |
| `05_domaine_actif_dns.png` | Après « Payer » : domaine actif, adresse principale, renouvellement, enregistrements DNS « Auto » |
| `06_mails.png` | Mails du domaine : nouvelle boîte, prix au mois, simulé |
| `07_hebergement.png` | Hébergement « Inclus », trafic et stockage de l'offre, domaines et mails |
| `08_domaine_connecte_preuve_dns.png` | Domaine qu'on possède déjà : en attente du DNS, étapes Domaine · DNS · Certificat, TXT et CNAME à copier |

Résultat de la sonde : **11/11** vérifications au toucher, aucune erreur console (`temp/domaines_paiement/run3.log`).

Défauts constatés au passage (non corrigés, l'audit ne touche pas le code) :
- **Texte coupé sans « … »** dans le panneau Site (`site_panel_nodes.js#line`) : « rappel J-21 » s'affiche « rappel
  J-2 », « renouvelé le … 202 ». La règle 12 veut « … ». Correctif à la brique, au lot P4.
- Dates et prix au format anglais (« Fri, Nov 5 », « €8.64 ») : le navigateur de la sonde était en anglais avec l'app en
  français. Ce sera à vérifier sur un appareil en français.
- Le prix affiché vient d'une table écrite en dur (.fr 6,99 € HT chez le fournisseur simulé), pas d'un registraire.

## 3. Le parcours, tel qu'il marche aujourd'hui

1. Dans le projet, **Communiquer › Publier**, ou dans Projets, l'appui long › « Publier sur le web » → panneau Publier
   (adresse `atome.one/<nom>`, pages, présentation, Maint. / Plus tard).
2. **Mon domaine** → *Trouver un domaine* : le nom du projet est proposé, puis **Chercher** → une rangée par extension
   (.fr, .com, .shop, .net, .eu, .org), « ✓ Libre » ou « Pris », prix à l'année avec les 3 % d'atome compris.
3. Une rangée touchée → **Devis** : réservé 15 min, prix, TVA, total garanti, « Chaque année » coché.
4. **Payer** → le domaine est inscrit comme actif et relié au site (**simulé**), puis on arrive sur le niveau *Mon
   domaine* : expiration, renouvellement (rappel J-21), enregistrements DNS (A, CNAME www et MX posés par atome,
   protégés ; les autres modifiables), Mails, Sortie (code de transfert).
5. **Adresse principale** : atome.one ou le domaine (l'autre redirige).
6. **Hébergement** : « Inclus », sites en ligne, trafic du mois, stockage, domaines et boîtes avec leurs prix.
7. Variante *J'ai déjà un domaine* → **Connecter** : TXT de preuve + CNAME à poser chez son hébergeur DNS, Copier,
   **Vérif.** (Domaine · DNS · Certificat cochés au fil de l'eau) ; ou **Transférer** avec le code du registraire.

## 4. Maquettes des écrans à créer (vraies briques, vrais jetons ; à valider, règle 16)

Script `temp/domaines_paiement/admin.mockup.mjs` (même recette que les maquettes M3dom validées) ; PNG dans
`temp/domaines_paiement/mockups/` :

| Maquette | Écran |
| --- | --- |
| `pay.png` — **A. Paiement atome** | carte Moyen de paiement (« Carte atome · ✓ Chez le prestataire, pas dans atome » ; Domaines = compte OVHcloud ; Crédits IA = chez chaque fournisseur) ; carte **Habilités** (les deux téléphones, rôle, ligne orange « Test : paiements réservés aux 2 comptes habilités ») ; carte Ce mois-ci (domaines, IA, plafond) ; bande ✕ · Ajout |
| `ai.png` — **B. Crédits IA** | carte À recharger (le fournisseur le plus bas, durée restante au rythme actuel, « Recharger chez OpenAI » qui ouvre sa page de facturation) ; carte Fournisseurs (OpenAI, Anthropic, Mistral, DeepSeek, Runway, MusicGPT, Not Diamond : mode de recharge et solde) ; bande ✕ · Relire |
| `quote.png` — **C. Devis payé par atome** | le devis validé du 28 oct., dont seule la carte Paiement change : « Carte atome · validée par toi · Test » ; « Payer » devient « Valider » (suivi du code SMS) |

Contrôle de la charte (règles 11 à 16) : cartes et bandes du panneau standard, aucune bordure, ✕ à gauche du pied et
nom au centre, outils au pied, textes tenant dans leur boîte. Écart à trancher : les fournisseurs de B portent tous le
glyphe eVe (il n'existe pas de glyphe par fournisseur, et la mission Not Diamond interdit de montrer leurs marques aux
clients ; cet écran n'est vu que par nous).

## 5. Préconisations

### 5.1 Séparer deux flux d'argent qui n'ont rien en commun

| | Flux **sortant** : atome paie ses fournisseurs | Flux **entrant** : les clients paient atome |
| --- | --- | --- |
| Qui | registraire (domaines, mails), OpenAI, Anthropic, Mistral, DeepSeek, Runway, MusicGPT, Not Diamond | les comptes clients |
| Moyen | **une carte d'entreprise atome, enregistrée chez chaque fournisseur**, jamais dans atome | Stripe (Web, Tauri), achats intégrés (iOS, Android) |
| Phase de test | **seuls les 2 comptes habilités** déclenchent une dépense réelle | **aucun paiement** : les bêta-testeurs ne paient pas (offre simulée, déjà en place) |
| Vérité | grand livre unique (Rust), écritures « coût fournisseur » | même grand livre, écritures « achat client » et « débit de crédits » |

**atome ne garde jamais un numéro de carte.** Le « moyen de paiement global », c'est la même carte enregistrée chez
chaque prestataire. atome garde seulement les clés d'API (coffre serveur), lit les soldes et décide quand dépenser.

### 5.2 Ce que les fournisseurs permettent vraiment (vérifié le 5 nov.)

- **Domaines** : OVHcloud a une API de commande (panier `POST /order/cart`, ajout du domaine, validation, bon de
  commande) et une API de zone DNS. Le serveur d'atome est déjà chez OVH : même compte, mêmes factures, l'envoi de SMS
  déjà branché. **Recommandé pour la v1.** Le paiement par le moyen enregistré sur le compte OVH reste à confirmer sur
  la console API avant de coder.
- **IA : aucun fournisseur ne vend ses crédits par API.** OpenAI : crédits prépayés et recharge automatique réglés dans
  son tableau de bord (seuil, plafond mensuel ; crédits valables 1 an ; erreur `credit_balance_exhausted` quand le solde
  est vide). Anthropic et Mistral : même principe, dans leur console. DeepSeek : solde **lisible** par
  `GET /user/balance`. Runway : solde lisible par `GET /v1/organization` (`creditBalance`). MusicGPT et Not Diamond : à
  vérifier.
  Donc « recharger depuis notre interface » veut dire : l'interface **montre** le solde (lu par l'API là où elle existe,
  sinon estimé depuis notre propre grand livre), **alerte**, et **Recharger** ouvre la page de facturation du
  fournisseur, où la carte atome est déjà enregistrée. La recharge automatique se règle chez chaque fournisseur, avec
  un plafond mensuel.

### 5.3 Habilitation par téléphone

- Un **nouveau rôle `payer`**, distinct d'`admin` (Roadmap), dans `auth_account_roles`. Il est donné une fois sur le
  serveur : `node scripts/account_roles_admin.mjs grant payer --phone +33652575517`, puis la même chose pour
  `+33663694055`. Les numéros ne vont **jamais** dans le code ni dans le dépôt : ce sont des données personnelles, et un
  numéro changé se règle sans redéployer.
- Le serveur vérifie `payer` avant **toute** dépense réelle : `domain_buy`, `domain_transfer`, le renouvellement,
  une boîte mail payante, l'écriture d'une clé fournisseur, les trames d'administration. L'application qui masque un
  bouton ne prouve rien.
- **Chaque dépense réelle est confirmée par un code SMS** envoyé au téléphone habilité (l'envoi OVH existe déjà). Une
  session volée ne suffit donc pas à dépenser.
- **Un plafond mensuel global** (exemple : 150 €) et un plafond par opération. Au-delà, rien ne part sans un nouveau
  réglage.
- Un compte **non habilité**, en phase de test : il cherche, voit le devis, relie un domaine qu'il possède déjà
  (gratuit) ; il ne peut pas payer (question 3).

### 5.4 Interface d'administration « que pour nous »

- Une rubrique **Administration** dans Réglages, montrée seulement à un compte `payer` ou `admin`, le rôle relu sur le
  serveur. Écrans : **Paiement atome** (maquette `pay`), **Crédits IA** (maquette `ai`), plus, pour la suite, *Clients* :
  consommation par compte (crédits IA, Gio stockés, domaines) et marge.
- Les clés des 7 fournisseurs se saisissent dans cette rubrique, vont directement dans le coffre serveur, et ne sont
  jamais relues en clair : on ne voit que « ✓ Enregistrée · se termine par …a1F3 ».
- Toutes les décisions (clé changée, plafond, achat validé) sont écrites dans un journal d'audit append-only.

### 5.5 Liaison avec la tâche Not Diamond (R-120)

Trois points de contact, à figer avec cette session avant qu'elle code les lots B et C :

1. **Un seul grand livre** : chaque appel d'IA réserve puis débite les crédits du **compte client** (lot C de la
   mission), dans le grand livre Rust, pas dans un second livre. Le même livre reçoit le **coût fournisseur** de l'appel.
   La consommation par client et la marge en découlent.
2. **Santé des soldes fournisseurs** : quand un fournisseur répond « crédit épuisé » (OpenAI `credit_balance_exhausted`,
   les équivalents chez les autres) ou que son solde lu passe sous un seuil, le serveur **retire ce fournisseur des
   candidats** envoyés à Not Diamond, alerte les habilités (notification + carte « À recharger ») et reprend le
   fournisseur dès que le solde revient.
3. **Solde client à zéro** : `authorize` refuse toute nouvelle opération payante (jamais de solde négatif : à corriger
   à la source, la mission le demande aussi) ; le client voit « Crédits épuisés » avec Recharger ou Attendre le
   renouvellement.

### 5.6 Le modèle de facturation client (pour plus tard, après la bêta)

- **Trois formes, un seul compteur** : *abonnement* mensuel (stockage inclus + crédits inclus, remis à chaque période),
  *crédit* prépayé (packs, qui n'expirent pas, comme l'exige Apple), *renouvelable* (recharge automatique **choisie
  explicitement**, plafonnée en montant et en fréquence). Le catalogue actuel (12 / 20 / 30 €, 50 / 200 / 1 024 Gio,
  3 000 crédits) est gardé tant que tu n'as pas fixé les prix.
- **Stockage** : mesurer les octets réellement stockés par compte et les compter en **Gio-mois**. Le quota de l'offre est
  inclus ; un dépassement se vend à part au prix « coût OVH du Gio-mois × marge », à relever sur la facture OVH. Quota
  atteint = nouveaux envois bloqués, **jamais une donnée effacée** (règle 21).
- **IA** : crédit = coût fournisseur réel + marge, avec un prix versionné et daté. Le crédit n'est jamais lié à un
  token, puisque chaque fournisseur a son unité.
- **Sites** : hébergement inclus (Q15, déjà décidé) ; domaine = prix du registraire + 3 % compris (Q16) ; boîte mail au
  mois. À zéro : le site **reste en ligne** (jamais de coupure brutale) ; seul le renouvellement du domaine attend le
  paiement, avec des rappels à J-21 puis J-7.
- **Règle 19** : 20 € n'est pas un nombre « naturel » (la règle propose 21 €) ; 12 € et 30 € le sont. À trancher quand
  on fixera les prix.

## 6. Plan en lots (esquisse ; le plan détaillé vient après tes réponses)

| Lot | Contenu | Dépend de |
| --- | --- | --- |
| P0 | DNS `sites.atome.one`, nginx/certbot des domaines personnels sur le serveur | ton feu vert et l'accès SSH |
| P1 | Rôle `payer`, vérification serveur sur toutes les dépenses, code SMS, plafonds, journal d'audit | rien (codable tout de suite) |
| P2 | Fournisseur de domaines **réel** (OVH) derrière le contrat existant de `site_domains.js`, prix lus en direct, commande validée par un habilité | ton compte OVH API, la carte enregistrée chez OVH |
| P3 | Coffre serveur étendu (Anthropic, Mistral, DeepSeek, Not Diamond), soldes lus, alertes | les clés des fournisseurs |
| P4 | Rubrique Administration (maquettes A et B validées) | P1, P3 |
| P5 | Grand livre unique : `site_domain_ledger` replié dans le livre Rust ; coûts fournisseurs ; consommation par client | portage Rust L3.8, lot C de la mission Not Diamond |
| P6 | Facturation client réelle (Stripe, achats intégrés, stockage en Gio-mois) | après la bêta, tes prix |

## 7. Questions (6), une par une après ta lecture

1. **Registraire** : **RÉPONDU (5 nov.) : OVHcloud**, même compte que le serveur atome.one (commande par l'API OVH, carte enregistrée sur ce compte).
2. **Valider** : est-ce « seuls ces deux comptes peuvent acheter », ou « un autre compte demande, et l'un des deux valide
   avant que la dépense parte » ? Recommandé pour la bêta : la première ; la seconde plus tard, quand d'autres testeurs
   créeront des sites.
3. **Compte non habilité** en bêta : il voit la recherche et le devis sans « Payer » (recommandé), ou rien du tout ?
4. **Code SMS** à chaque dépense réelle : oui (recommandé) ou seulement au-dessus d'un montant ?
5. **Plafond mensuel global** des dépenses de test : 150 € ? Et par opération ?
6. **Maquettes** A (Paiement atome), B (Crédits IA), C (Devis payé par atome) : validées telles quelles ?

## 8. Changement de cap (toi, 5 nov., après Q1) : le vrai système de paiement, pour tout le monde, dès maintenant

Tes mots : « on change d'avis… on fait directement le système de paiement dès maintenant. Les gens rentrent leur
système de paiement, PayPal, ce qu'ils veulent… la personne achète des crédits chez nous… quand c'est épuisé, elle lui
demande 12 €, sinon elle peut utiliser atome sans l'assistant… on ne bloque pas ses documents… pas de sauvegarder de
nouveaux fichiers sur le cloud… on synchronise dès qu'elle repaye… nous on prend 3 %… je te donne un RIB pour qu'on
récupère les 3 %… sur Apple Store… on reporte les 30 % d'Apple… sauf si on peut passer outre… on fait du final
maintenant ». Puis : « certaines IA pourront ne pas être facturées… auto-hébergées, style Mistral… par l'université qui
prendra en charge les frais… calculer les frais en fonction de ce que atome paye ».

Conséquences sur ce qui précède :
- **§5.3 (deux téléphones habilités) et maquettes A et C : abandonnés.** Tout compte paie pour lui-même, nous aussi.
- **Maquette B : retirée**, elle doublait la M2 « Budget IA » de R-120 (`temp/notdiamond_billing/mockups/m2_budget_ia.png`).
- Le panneau client existe déjà en maquette chez R-120 (M1 « Abonnement » : formule, crédits, stockage, Recharger,
  Gérer, Restaurer) : la suite s'appuie dessus.
- Q1 (OVHcloud) reste valable : atome achète le domaine chez OVH avec son compte, le client le paie en crédits.
- Déjà fait dans le code : facturation et sites portés en Rust (`atome-server`, R-118 L3.8 FAIT) ; Boutique avec
  séquestre et 3 % (`atome/src/shared/shop_contract.js` `SHOP_COMMISSION_RATE`), paiement simulé.

### 8.1 Faits vérifiés le 5 nov. (règles et frais)

- **Apple, Union européenne, depuis le 1er oct. 2026** (annonce Apple d'août 2026) : achat intégré **26 %** ; **lien
  sortant** vers son propre paiement **15 %** (**10 %** pour les petits développeurs) ; hors App Store, 5 %. Le
  petit-développeur pour l'achat intégré reste à vérifier sur le contrat.
- **Apple, États-Unis** : lien sortant **sans commission pour l'instant** (injonction Epic de 2025) ; Apple demande au
  juge jusqu'à 15 %, et le taux n'est pas encore fixé.
- **Majoration réelle sur iOS** pour garder le même net : il faut diviser, pas ajouter. Avec 26 % → prix × 1,35
  (+35 %) ; avec 15 % → +18 % ; avec 10 % → +11 %. Ajouter « 30 % + 3 % » ne compense pas une commission de 30 %
  (il faudrait +43 %).
- **Stripe France**, cartes européennes standard : **1,5 % + 0,25 €** (à confirmer sur la grille officielle).
  Une recharge de 12 € coûte donc 0,43 € de frais, soit **3,6 %** : **une marge de 3 % ne couvre pas les frais de
  paiement**. PayPal passe par Stripe, à un tarif plus élevé (à lire sur la grille).
- **RIB** : il se saisit dans **ton** tableau de bord Stripe (versements automatiques). Il n'entre jamais dans atome.
- **Ventes entre personnes (Boutique)** : reverser l'argent aux vendeurs demande Stripe Connect (identité du vendeur
  vérifiée par Stripe, son IBAN chez Stripe). atome garde ses 3 % comme « frais d'application ».

### 8.2 Le principe proposé

- **Un porte-monnaie par compte, en euros** (crédits), un seul grand livre (Rust). Il se remplit par une recharge
  ponctuelle, une recharge automatique quand il est vide (« renouvelable ») ou un abonnement mensuel.
- **Chaque dépense débite ce que atome a réellement payé, plus la marge** :
  - un appel d'IA = coût mesuré de l'appel (zéro pour un modèle payé par un tiers) ;
  - le stockage = Go réellement stockés × prix du Go-jour ;
  - un domaine = prix OVH + 3 % ;
  - une vente entre personnes = 3 % retenus sur la vente.
  Le coût de chaque modèle vient de la table de R-120 (coût fournisseur, ou zéro, ou coût d'hébergement documenté).
- **Porte-monnaie vide** : l'assistant et l'IA s'arrêtent ; on travaille en local ; ce qui est au cloud reste lisible
  et téléchargeable ; aucun nouvel envoi au cloud ; tout se synchronise dès la recharge.

### 8.3 Questions (11), une par une ; les maquettes suivent les réponses 1 à 6

1. Répartition avec R-120 (qui fait quoi, un seul grand livre).
2. Formules : recharge seule, renouvelable, abonnement, ou les trois ?
3. Marge : 3 % sur le coût, et les frais de paiement ?
4. IA payée par un tiers (université) : gratuite pour qui ?
5. Stockage : quota gratuit, puis prix du Go-mois ?
6. Porte-monnaie vide : confirmer le mode local + cloud en lecture, et l'exception à la règle 21.
7. Apple et Android : lien sortant vers notre paiement, ou achat intégré ; majoration sur mobile.
8. Prestataire de paiement : Stripe (cartes, PayPal, Apple Pay, Google Pay, SEPA) ?
9. Boutique : reversements réels aux vendeurs (Stripe Connect) dans ce lot ?
10. Domaines payés en crédits : que se passe-t-il au renouvellement si le porte-monnaie est vide ?
11. TVA : prix affichés TTC, crédit valant le HT ?

**Mise à jour (toi, 5 nov.)** : le paiement s'établit dans la session R-120 « Évaluation de tâche et faisabilité ».
La question 1 est donc tranchée : elle porte le grand livre, le porte-monnaie, Stripe, Apple et le coût réel des IA ;
cette tâche-ci porte le registraire OVH et le domaine payé en crédits. Les questions 2 à 11 lui ont été transmises
pour qu'elle les reprenne dans sa série, sans doublon.

**Correction (toi, 6 nov.) : atome.one n'est pas hébergé chez OVH.** Le motif « même compte que le serveur » du §5.2
et de la question 1 était faux : je l'ai tiré du cahier de publication (« le trafic du serveur OVH ») sans relire ta
précision du 5 nov. (OVH n'envoie que les SMS ; hébergement futur chez Almerys, HDS). Relevé du 6 nov. : DNS
d'atome.one chez o2switch (`ns1/ns2.o2switch.net`) ; son adresse 5.196.69.103 appartient pourtant à un bloc OVH SAS
(whois `FR-OVH-20120823`, nom inverse `ns378864.ip-5-196-69.eu`), écart à éclaircir. La réponse « OVHcloud » à la
question 1 est **rouverte**. Restent comme motifs : l'API de commande de domaines d'OVH (indépendante de
l'hébergement) et ton compte OVH déjà ouvert pour les SMS. o2switch n'a pas d'API publique de commande de domaines
trouvée (commande par l'espace client seulement). Autres registraires à API : Gandi, Porkbun.

**Question 1 re-tranchée (toi, 6 nov.) : registraire des domaines = OVH**, par l'API de commande d'OVH ; sans lien avec l'hébergement.
