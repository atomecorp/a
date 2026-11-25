# Inventaire des fonctionnalités — atome/eVe

La liste de **tout ce que fait eVe**, domaine par domaine : chaque fonction, le geste qui la lance, ce qu'on voit ou
entend, la commande vocale ou MCP qui fait la même chose (règle 22), le code qui la porte et la demande qui l'a créée.
C'est la base de toute documentation d'utilisation (avec captures, faite ailleurs) et la liste de contrôle des
passages de débogage.

Ce dossier dit **ce qui existe**. Les parcours de tests ([tests/parcours/](../tests/parcours/README.md),
[tests/parcours_musique/](../tests/parcours_musique/README.md)) disent **comment le vérifier** ; le
[registre](../todo/REGISTRE_DEMANDES.md) dit **ce qui a été demandé et ce qui reste**. Chaque fichier de domaine pointe
vers les deux.

## Les domaines

| Fichier | Domaine | Identifiants | État | Demandes du registre |
| --- | --- | --- | --- | --- |
| [01_dashboard.md](01_dashboard.md) | Dashboard et accueil | `DSH-…` | à relever | 21 |
| [02_design_ui.md](02_design_ui.md) | Design, charte et composants d'interface | `DSN-…` | à relever | 18 |
| [03_projets.md](03_projets.md) | Projets, objets et vues hors multipiste | `PRJ-…` | à relever | 15 |
| [04_musique.md](04_musique.md) | Multipiste et création musicale | ceux du parcours | relevé complet (2026-11-25) | 94 |
| [05_medias.md](05_medias.md) | Médias, capture, import et écrans | `MED-…` | à relever | 20 |
| [06_assistant_voix.md](06_assistant_voix.md) | Assistant, voix et commandes MCP | `ASV-…` | à relever | 15 |
| [07_sport_sante.md](07_sport_sante.md) | Sport, santé, objectifs et bien-être | `SAN-…` | à relever | 30 |
| [08_agenda_activites.md](08_agenda_activites.md) | Agenda, alarmes et événements | `AGD-…` | à relever | 4 |
| [09_communication.md](09_communication.md) | Communication, contacts et partage | `COM-…` | à relever | 8 |
| [10_publication_commerce.md](10_publication_commerce.md) | Publication, site, commerce et facturation | `PUB-…` | à relever | 10 |
| [11_bureautique.md](11_bureautique.md) | Bureautique : tableur, calcul, documents | `BUR-…` | à relever | 2 |
| [12_compte_serveur.md](12_compte_serveur.md) | Compte, serveur et synchronisation | `CPT-…` | à relever | 5 |
| [13_plateformes_moteur.md](13_plateformes_moteur.md) | Plateformes, moteur et performances | `PLT-…` | à relever | 17 |

Un domaine nouveau (une rubrique, un moteur, une plateforme) = un fichier `NN_<domaine>.md` ici et une ligne dans ce
tableau. Une fonction qui touche plusieurs domaines est écrite dans celui de son propriétaire de code, et les autres
la citent par son identifiant.

## Ajouter une fonctionnalité (toute session, tout domaine)

Une session qui finit de coder une fonction (une demande `R-…`), quel que soit le domaine, l'écrit dans le fichier de
son domaine avant de rendre la main : une ligne par fonction, vérifiée dans le code. Une fonction changée garde son
identifiant et prend une note `*Mise à jour AAAA-MM-JJ* : …` ; une fonction retirée est barrée avec la date et la raison,
jamais effacée. Le multipiste écrit dans [tests/parcours_musique/](../tests/parcours_musique/README.md), qui est son
inventaire (règles de ce parcours).

## Format d'une fonction

```markdown
- **SAN-012** · Mode zen du Sport — disque tenu (▶ lancé) → seul le disque reste, sur des cases entières, la série et
  le temps à sa base ; Fermer (ou le disque tenu à nouveau) rend l'écran du Sport. *Voix* `eve.training.zen` ·
  *Code* `eVe/domains/dashboard/dashboard_training_zen.js` · *Plat.* W T I · *Origine* R-298.
```

- **Identifiant** : le préfixe du domaine (tableau ci-dessus) et un numéro, jamais renuméroté.
- **Nom court**, puis **geste → effet** : ce que la personne fait, ce qu'elle voit ou entend (les mots de l'écran entre
  guillemets).
- **Voix** : l'outil `eve.…` / `ui.…` qui fait la même chose ; s'il n'y en a pas, écrire *Voix* **manque** (un écart à la
  règle 22, à combler).
- **Code** : le propriétaire canonique (`fichier#fonction` si utile). **Plat.** : W Web, T Tauri, I iOS, A AUv3,
  Ph téléphone, An Android, Wa montre. **Origine** : la demande `R-…`, la règle d'`AGENTS.md` ou le bug connu.

L'exemple ci-dessus montre seulement le format : son identifiant et son outil vocal ne sont pas relevés.

## Relever un domaine

Pour un domaine encore « à relever » : partir de ses demandes `FAIT` du registre et des cas de son parcours, vérifier
chaque fonction dans le code (le propriétaire cité, ses appelants, son outil dans `eVe/registry/generated/`), puis
l'écrire au format ci-dessus. Ce qui est demandé mais pas codé va dans un « À compléter » en bas du fichier, et reste
dans le registre.

## Hors inventaire

Ces demandes du registre portent sur la méthode (tests, Git, essais), pas sur une fonction d'eVe :

- R-371 — Listing complet des fonctions du multipiste, pour une documentation avec captures (2026-11-25)
- R-189 — Parcours de tests de tout eVe (domaines + transverse), rapport validé / non validé, régressions rejouées (2026-11-16)
- R-188 — Parcours de tests de la Timeline et de la création musicale, anti-régression (2026-11-16)
- R-112 — Publish the remaining version and Framework State changes on main (2026-11-03)
- R-006 — Tâche urgente du 22 oct. : designs et questions restés en attente
- R-107 — Fusion R-104 → main (2026-11-01) : décisions et essais restés ouverts
- R-102 — Essais sur tes appareils
