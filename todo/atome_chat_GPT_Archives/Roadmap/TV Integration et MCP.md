# TV Integration et MCP — atome

## Statut
Roadmap / tâche d’implémentation / prompt d’exécution.

## Objectif

Intégrer dans **atome** une expérience TV unifiée permettant d’accéder aux chaînes gratuites disponibles sur le Web ainsi qu’aux chaînes fournies par **SoFast**, sans exposer à l’utilisateur la complexité des différents fournisseurs.

L’utilisateur doit disposer d’une interface TV unique dans atome, avec une seule liste de chaînes et un accès direct à la chaîne demandée.

L’intégration doit également être raccordée au système **MCP** afin qu’eVe puisse lancer et piloter la télévision par texte ou par voix.

Exemples attendus :

- « Ouvre France 2 »
- « Mets TF1 »
- « Lance M6 »
- « Ouvre une chaîne d’information »
- « Qu’est-ce qu’il y a maintenant sur France 5 ? »

---

# Accès dans les Activités

Ajouter un nouvel accès dans le tool **Activités**.

Arborescence demandée :

```text
Activités
└── Divertissement
    └── Télévision
```

## Règles UX

- Ajouter **Divertissement** comme catégorie d’activité.
- Ajouter **Télévision** à l’intérieur de **Divertissement**.
- L’activation de **Télévision** ouvre l’interface TV unifiée d’atome.
- Ne pas exposer dans l’interface principale les portails ou pages de sélection propres à chaque fournisseur.
- L’utilisateur choisit une chaîne dans l’interface atome ; atome résout ensuite automatiquement le fournisseur approprié.
- Respecter les principes UI existants d’atome : interface simple, cohérente, mobile-first et sans recréer une interface de logiciel TV traditionnelle inutilement complexe.

---

# Sources TV — phase initiale

Prévoir des adapters pour les sources suivantes :

1. **TF1+**
2. **france.tv**
3. **M6+**
4. **RMC+ / RMC BFM Play**
5. **CANAL+ / CNEWS / CStar** pour les flux gratuits concernés
6. **T18**
7. **SoFast**

Le système doit être extensible afin de permettre l’ajout ultérieur d’autres sources FAST ou gratuites sans modifier l’interface ni le MCP public.

---

# Architecture cible

Créer un service TV interne unique, indépendant des fournisseurs.

```text
Interface atome TV
        │
        ▼
    atome.tv
        │
        ▼
 Channel Resolver
        │
        ├── provider/tf1
        ├── provider/francetv
        ├── provider/m6
        ├── provider/rmc
        ├── provider/canal
        ├── provider/t18
        └── provider/sofast
```

L’UI et eVe ne doivent jamais avoir à connaître les détails spécifiques d’un fournisseur.

Chaque chaîne doit être enregistrée dans un registre canonique comprenant au minimum :

```js
{
  id: 'france2',
  name: 'France 2',
  aliases: ['france 2', 'fr2', 'la 2'],
  provider: 'francetv',
  type: 'live',
  playback: 'provider',
  country: 'FR',
  language: 'fr'
}
```

Le registre doit permettre :

- recherche par nom ;
- alias et formulations naturelles ;
- regroupement par catégorie ;
- changement de fournisseur sans modifier les commandes utilisateur ;
- ajout de chaînes futures sans modifier le contrat MCP.

---

# Lecture des chaînes

## SoFast

Pour SoFast, utiliser les mécanismes officiels disponibles :

- HLS / DASH lorsque fournis ;
- EPG JSON / XMLTV ;
- logos et métadonnées ;
- publicité / SSAI selon le contrat de distribution.

SoFast doit pouvoir utiliser le player natif d’atome lorsque les droits et le contrat le permettent.

## Fournisseurs Web

Pour TF1+, france.tv, M6+, RMC+, CANAL+/CNEWS/CStar et T18 :

- utiliser uniquement les mécanismes officiels autorisés ;
- privilégier l’ouverture directe de la chaîne ou du player concerné ;
- éviter les pages HTML de choix de chaînes lorsqu’un accès direct officiel est disponible ;
- conserver authentification, DRM, restrictions géographiques, cookies et publicité du fournisseur ;
- ne pas extraire ou détourner des flux vidéo non prévus pour la redistribution ;
- ne pas supprimer ou masquer les publicités imposées par le fournisseur ;
- encapsuler les différences techniques dans des **provider adapters**.

Le but est que l’utilisateur voie l’interface de sélection d’atome, puis arrive directement sur la lecture de la chaîne choisie avec le minimum d’UI fournisseur nécessaire.

---

# MCP TV

Créer un MCP public unique pour toute la télévision.

Nom logique proposé :

```text
atome.tv
```

Ne pas créer un MCP différent pour chaque fournisseur.

## Commandes minimales

Prévoir au minimum :

```text
tv.list_channels()
tv.find_channel()
tv.open_channel()
tv.close()
tv.now()
tv.next()
tv.get_epg()
tv.search_program()
```

Exemple :

```js
await tv.open_channel({
  channel: 'France 2'
})
```

Le resolver doit trouver automatiquement :

```text
France 2
→ provider francetv
→ adapter france.tv
→ ouverture directe de France 2
```

Autre exemple :

```text
« Ouvre France 2 »
→ eVe
→ MCP atome.tv
→ tv.open_channel('France 2')
→ Channel Resolver
→ FranceTVAdapter
→ lecture France 2
```

---

# Voix et prompts

Le système doit être utilisable de manière identique depuis :

- la voix ;
- le champ de prompt eVe ;
- un appel MCP direct ;
- l’interface graphique Activités → Divertissement → Télévision.

Prévoir des formulations naturelles et des alias.

Exemples :

```text
ouvre France 2
mets France 2
lance France 2
je veux regarder France 2
passe sur France 2
```

Toutes doivent résoudre vers la même action canonique :

```text
tv.open_channel('france2')
```

---

# Interface TV unifiée

Créer une interface de sélection propre à atome.

Elle doit au minimum permettre :

- affichage de toutes les chaînes disponibles ;
- logo + nom de chaîne ;
- recherche ;
- catégories simples ;
- accès direct à la chaîne ;
- favoris si le système de préférences d’atome le permet ;
- indication du programme courant lorsque l’EPG est disponible.

Les chaînes des différents fournisseurs doivent être mélangées dans une liste logique unique : le fournisseur ne doit pas être la structure principale visible par l’utilisateur.

---

# Contraintes d’architecture

- Frontend **JavaScript uniquement**.
- Ne pas introduire TypeScript.
- Respecter l’architecture existante d’atome et le système MCP déjà en place.
- Séparer strictement : UI, registre des chaînes, resolver, adapters providers, player et MCP.
- Ne jamais mettre d’identifiants, tokens ou secrets fournisseur dans le frontend.
- Prévoir des erreurs normalisées : chaîne indisponible, authentification requise, zone géographique non autorisée, provider indisponible, DRM non supporté, etc.
- Une source ne doit jamais être considérée comme intégrable nativement sans vérification de ses droits et mécanismes officiels.

---

# Tâche d’implémentation

1. Examiner l’architecture actuelle du tool **Activités** et son registre d’items.
2. Ajouter la catégorie **Divertissement** sans casser les activités existantes.
3. Ajouter l’activité **Télévision** dans **Divertissement**.
4. Relier cette activité au nouveau service interne `atome.tv`.
5. Créer le registre canonique des chaînes.
6. Créer le Channel Resolver.
7. Créer une interface commune pour les provider adapters.
8. Implémenter les adapters initiaux : TF1+, france.tv, M6+, RMC+, CANAL+/CNEWS/CStar, T18 et SoFast.
9. Intégrer le player natif pour les flux autorisés, notamment SoFast.
10. Pour les fournisseurs Web, utiliser uniquement les accès officiels autorisés et aller directement vers la chaîne/player lorsque possible.
11. Créer les commandes MCP `tv.*`.
12. Raccorder eVe afin qu’une commande vocale ou texte comme « ouvre France 2 » déclenche `tv.open_channel()`.
13. Ajouter les alias de chaînes et les formulations naturelles.
14. Tester le même comportement depuis : UI Activités, prompt, voix et MCP direct.
15. Vérifier les cas d’erreur, le mobile, desktop et Tauri.

---

# Critères de validation

La tâche est terminée lorsque :

- **Activités → Divertissement → Télévision** existe et ouvre la TV ;
- l’utilisateur dispose d’une page de choix des chaînes conçue par atome ;
- les pages de sélection de chaînes des fournisseurs ne constituent plus le point d’entrée utilisateur ;
- les chaînes sont résolues via un registre unique ;
- SoFast fonctionne via son adapter officiel ;
- les fournisseurs Web fonctionnent via leurs mécanismes officiels compatibles ;
- `tv.open_channel('France 2')` lance France 2 ;
- « ouvre France 2 » fonctionne depuis eVe par texte ;
- la même commande fonctionne par voix ;
- aucune logique fournisseur n’est codée directement dans l’UI ;
- l’ajout futur d’un provider ne nécessite pas de modifier le contrat MCP public.
