eVe / Atome — Protocole Maître de Debug des Atomes

Objectif Global

Stabiliser définitivement le système des atomes dans Atome / eVe.

Un atome est l’unité fondamentale du runtime Atome.
Il représente un objet vivant pouvant contenir :

* propriétés ;
* rendu ;
* état ;
* historique ;
* interactions ;
* événements ;
* données persistées ;
* relations ;
* permissions ;
* composants UI ;
* médias ;
* références vers des molécules ;
* comportements runtime.

Le but n’est PAS de corriger des symptômes visuels.
Le but est :

* identifier les causes racines ;
* stabiliser le cycle de vie des atomes ;
* empêcher les duplications d’état ;
* empêcher les états fantômes ;
* supprimer les sources de vérité concurrentes ;
* rendre les mutations observables ;
* rendre les comportements reproductibles ;
* empêcher les modifications implicites ;
* fiabiliser la persistance et la reconstruction.

⸻

Règles Absolues

Interdictions

* Pas de fallback runtime.
* Pas de patch rapide.
* Pas de refactorisation globale.
* Pas de duplication de logique.
* Pas de nouvelle source de vérité.
* Pas de mutation silencieuse.
* Pas de try/catch qui masque une erreur.
* Pas de correction cosmétique.
* Pas de watcher supplémentaire pour “réparer” un problème.
* Pas de synchronisation implicite cachée.
* Pas de logique dispersée entre UI et runtime.

⸻

Principe Fondamental

Un atome = une vérité runtime cohérente

Règle fondamentale :

1 atome logique
→ 1 état runtime cohérent
→ 1 cycle de vie observable
→ 1 owner principal

ou :

échec
→ rollback
→ destruction propre
→ aucun état résiduel

⸻

Problèmes Typiques à Détecter

Le système d’atomes peut devenir instable si :

* plusieurs couches modifient le même état ;
* l’UI possède une copie concurrente ;
* les propriétés sont mutées silencieusement ;
* des watchers déclenchent des mutations secondaires ;
* plusieurs renders représentent des états différents ;
* des listeners persistent après destruction ;
* un atome est restauré plusieurs fois ;
* un historique réinjecte un état ancien ;
* plusieurs sources contrôlent les propriétés ;
* un atome est recréé au lieu d’être restauré ;
* la persistance diverge du runtime ;
* des références mortes restent actives.

⸻

Pipeline Théorique d’un Atome

Cycle de vie attendu

requested
→ creating
→ initializing
→ binding-properties
→ rendering
→ ready
→ updating
→ syncing
→ persisting
→ disposing
→ disposed

En cas d’erreur :

failed
→ rollback
→ cleanup
→ disposed

⸻

Sources Possibles de Création d’Atome

Toutes les routes doivent converger vers UNE logique centrale.

Sources possibles

* création UI ;
* import ;
* duplication ;
* restauration projet ;
* chargement historique ;
* création depuis molécule ;
* drag & drop ;
* API runtime ;
* automation ;
* script ;
* synchronisation réseau ;
* synchronisation offline/online ;
* reconstruction état.

⸻

Factory Centrale Obligatoire

Toutes les créations doivent passer par :

createAtome(request)

Interdiction de :

* créer un atome directement depuis UI ;
* muter les propriétés hors pipeline ;
* créer des renders autonomes ;
* restaurer partiellement un atome ;
* bypasser la logique de persistance ;
* contourner le système d’historique.

⸻

Phase 1 — Cartographie

Prompt Audit Principal

Analyse uniquement le pipeline des atomes dans Atome / eVe.
Contexte :
Un atome est l’unité fondamentale du runtime.
Il peut contenir propriétés, rendu, historique, interactions, persistance, médias et références vers des molécules.
Objectif :
cartographier précisément le cycle de vie des atomes.
Ne modifie aucun code.
Produit :

1. points d’entrée ;
2. création des atomes ;
3. mutations des propriétés ;
4. synchronisation ;
5. persistance ;
6. historique ;
7. restauration ;
8. rendu ;
9. destruction ;
10. sources de vérité ;
11. routes concurrentes ;
12. dépendances UI/runtime ;
13. listeners ;
14. watchers ;
15. mutations implicites ;
16. zones pouvant laisser un état fantôme.
Interdictions :

- ne pas corriger ;
* ne pas refactoriser ;
* ne pas ajouter de fallback ;
* ne pas inventer une nouvelle architecture.
Résultat attendu :
un graphe clair du pipeline des atomes.

⸻

Phase 2 — Instrumentation

Objectif

Rendre les mutations d’atomes observables.

⸻

Prompt Instrumentation

À partir du graphe précédent, ajoute une instrumentation temporaire minimale pour observer les atomes.
Objectif :
identifier les mutations incohérentes, duplications d’état et comportements erratiques.
Règles :
* ne corrige rien ;
* ajoute uniquement des logs TEMP_DEBUG ;
* chaque atome doit avoir un atome_runtime_id ;
* tracer les mutations de propriétés ;
* tracer les créations/destructions ;
* tracer les listeners ;
* tracer les watchers ;
* tracer les synchronisations ;
* tracer les restaurations ;
* tracer les changements d’état ;
* tracer les références molécules ;
* tracer les divergences UI/runtime.
Format obligatoire :
TEMP_DEBUG_ATOME {
  atome_id,
  atome_runtime_id,
  source,
  step,
  file,
  function,
  property,
  previous_value,
  next_value,
  renderer_state,
  persistence_state,
  history_state,
  timestamp,
  status,
  error
}
Logger uniquement aux points critiques.

⸻

Phase 3 — Reproduction

Objectif

Transformer les comportements erratiques en scénarios reproductibles.

⸻

Scénarios Obligatoires

Création

* création UI ;
* création via import ;
* duplication ;
* restauration projet ;
* restauration historique ;
* création depuis molécule ;
* drag & drop ;
* synchronisation réseau.

Mutations

* modification propriété ;
* suppression propriété ;
* undo/redo ;
* changement état runtime ;
* synchronisation online/offline ;
* historique ;
* suppression/recréation.

Stress

* multiples updates rapides ;
* suppression pendant render ;
* restauration pendant sync ;
* mutation pendant persistance ;
* double restauration ;
* rollback incomplet.

⸻

Vérifications Obligatoires

Pour chaque scénario :

1 seul owner principal
1 seul état runtime cohérent
aucune mutation silencieuse
aucune propriété divergente
aucun render fantôme
aucun listener zombie
aucune duplication d’atome
aucun historique incohérent
aucune divergence UI/runtime
aucune divergence runtime/persistence

⸻

Phase 4 — Isolation de la Cause Racine

Ennemis Probables

* mutations implicites ;
* propriétés modifiées depuis plusieurs endroits ;
* watchers concurrents ;
* état UI concurrent ;
* historique réinjectant des états obsolètes ;
* persistance asynchrone ;
* rollback incomplet ;
* listeners non nettoyés ;
* références mortes ;
* rendu découplé du runtime ;
* synchronisation offline/online concurrente ;
* atomes recréés au lieu d’être restaurés ;
* cycles de dépendances ;
* duplication de propriétés.

⸻

Phase 5 — Correction

Règle Absolue

Correction minimale.

Pas de réécriture globale.

⸻

Prompt Correction

À partir des logs TEMP_DEBUG et des tests, identifie la cause racine des problèmes d’atomes.
Corrige uniquement la cause racine prouvée.
Contraintes :
* aucune refonte globale ;
* aucun fallback runtime ;
* aucune nouvelle source de vérité ;
* aucune route alternative ;
* aucune correction cosmétique ;
* supprimer tous les logs TEMP_DEBUG après validation ;
* conserver ou ajouter les tests de non-régression.
Priorité absolue :
garantir qu’un atome possède un état runtime cohérent, observable et non dupliqué.
Pour chaque modification :
* fichier ;
* fonction ;
* cause corrigée ;
* comportement avant ;
* comportement après ;
* test associé.

⸻

Signaux d’Alerte Critiques

Extrêmement suspects

* propriété modifiée depuis plusieurs couches ;
* état UI différent du runtime ;
* historique différent du runtime ;
* persistance différente du runtime ;
* render autonome ;
* listeners non supprimés ;
* mutation silencieuse ;
* état global mutable ;
* singleton implicite ;
* cache concurrent ;
* atome restauré plusieurs fois ;
* duplication de propriété ;
* synchronisation implicite ;
* accès direct global à des états runtime.

⸻

Focus spécial : Relations Atome ↔ Molécule

Vérifier spécialement :

* références croisées ;
* ownership ;
* destruction synchronisée ;
* restauration ;
* persistance ;
* timeline liée ;
* médias liés ;
* événements croisés ;
* dispose ;
* rollback.

Principe à garantir :

1 atome
→ référence contrôlée vers 0..N molécules
→ aucune référence morte
→ aucune session fantôme

⸻

Objectif Final

Obtenir un système où :

Un atome =
une entité runtime cohérente,
observable,
reproductible,
non dupliquée,
persistable,
rollbackable,
sans mutation cachée.

Et où :

Toutes les mutations passent par une seule vérité runtime.

⸻

Priorités Réelles

Priorité 1

Stabilité des mutations d’atomes.

Priorité 2

Suppression des sources de vérité multiples.

Priorité 3

Fiabilisation du cycle de vie.

Priorité 4

Nettoyage listeners/watchers/références mortes.

Priorité 5

Synchronisation et persistance.

Priorité 6

Performance.

Les optimisations de performances viennent uniquement après stabilisation complète du runtime des atomes.
