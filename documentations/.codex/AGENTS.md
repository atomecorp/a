# eVe AI Coding Guideline

Ce fichier fournit les règles globales pour guider Codex dans la génération et la revue de code pour le projet eVe.

## Version

1.0

## Statut

Active

## Portée

Directives pour la génération de code, l’intégration, et les conventions de revue dans eVe.

---

## 1) Langage et stack

- Utiliser **JavaScript** pour tout code généré.
- **Interdit** d’utiliser TypeScript ou Python pour le code d’implémentation eVe.
- Tous les commentaires, warnings, erreurs, logs et documentations doivent être en anglais.

## 2) UI et composants

- Ne **pas créer ni modifier** de fichiers `.html` ou `.css` sauf demande explicite.
- Construire l’interface utilisateur via les **API et composants Squirrel**.
- Favoriser les patterns des composants Squirrel plutôt que manipulation directe du DOM.

## 3) Politique de fallback (strict)

- Les fallbacks runtime, données, et control-flow sont **interdits**.
- En cas de valeur/dépendance manquante, échouer de manière explicite avec une erreur claire.
- Les shims transitoires, proxys silencieux, et routes legacy occultes sont **interdits**.
- Exception requise : fallback des labels i18n via :
  - `eveT(key, fallback)`
  - `ui.label_fallback`

## 4) Politique de mutation et sync

- **Aucune mutation d’état directe** dans le frontend.
- Toutes les écritures visibles utilisateur doivent passer par :
  - `window.Atome.commit`
  - `window.Atome.commitBatch`
- Le journal des événements est append-only.
- L’état est une projection de snapshot + replay déterministe.

## 5) Politique modèle Atome

- Respecter la forme canonique d’un atome :
  - `id, type, optional kind, optional renderer, meta, traits, properties`
- `id` est **immuable**.
- `type` est canonique.
- `renderer` sert uniquement d’indication UI.
- Les propriétés inconnues sont rejetées sauf autorisées par le schéma.
- `atome.create` doit inclure toutes les caractéristiques physiques pour un replay déterministe.

## 6) Bus de commandes et outils

- Toutes les actions effectives passent **uniquement par le Command Bus**.
- Les outils/retours de code doivent exprimer des **intentions**, pas des effets directs.
- Appliquer capacités, politiques, audit, et idempotence pour actions effectives.
- Aucun fallback occulte vers l’ancien runtime n’est autorisé.

## 7) Historique et time-travel

- L’historique est **immuable**.
- Les timelines au niveau des propriétés sont de première classe.
- Le comportement restore/replay doit être déterministe.
- Les snapshots servent d’ancres immuables pour restore.

## 8) Partage et ACL

- Le partage est explicite, auditable, et piloté par permissions.
- Permissions au niveau des propriétés s’appliquent.
- Les modes public read/write doivent être explicites et vérifiés par politique.

## 9) Politique i18n

- Utiliser `eveT` pour tous les labels/placeholders.
- Garder les clés regroupées par domaine (ex. : `eve.menu.*`, `eve.user.*`).
- Ne pas contourner les clés manquantes en dehors des contrats i18n.

## 10) Précedence des règles

- Ce fichier représente la **single operational guideline** pour le comportement de l’assistant Codex.
- Les architectures et contrats sont définis par les documents internes du projet (fichiers .md dans `/src/application/eVe/documentations/`).
