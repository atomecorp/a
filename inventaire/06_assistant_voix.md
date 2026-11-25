# Inventaire — Assistant, voix et commandes MCP

Périmètre : L'assistante eVe (l'Atome) : son champ, son micro, ses discussions, ce qu'elle fait tout de suite (règle 22), la voix (« Ève, écoute-moi », raccrocher), les erreurs dites à voix haute, CarPlay ; le MCP universel et le catalogue des outils (chaque action d'écran a sa commande).

État : **à relever**. Les cas du parcours de tests ci-dessous décrivent déjà une partie des fonctions ; les
demandes du registre listées plus bas disent ce qui a été demandé dans ce domaine. Chaque fonction relevée
est vérifiée dans le code avant d'être écrite (format dans [README.md](README.md#format-dune-fonction)).

## Sources
- Parcours : aucun pour l'instant.
- Propriétaires du code : `atome/src/squirrel/ai`, `atome/src/squirrel/voice`, `atome/src/squirrel/mcp_access`, `atome/src/squirrel/atome`, `eVe/registry/generated`.

## Fonctions

Aucune fonction relevée pour l'instant. Identifiants : `ASV-001`, `ASV-002`… dans l'ordre du relevé.

- **ASV-001** · Tâche programmée de l'assistante — « demain à 8 h, fais une recherche sur … et donne-moi le résultat », « chaque
  lundi à 9 h, range mes fichiers », « à 18 h, s'il pleut, envoie … » → un événement du calendrier « eVe » de l'Agenda ; à son heure
  elle fait tout, sans rien redemander (envois compris), et son compte rendu arrive en notification ; la discussion rejoint ses
  Discussions ; manquée (aucun eVe ouvert), elle se fait une fois à la prochaine ouverture. *Voix* `assistant.task.schedule`
  (liste et annulation : `calendar.search`, `calendar.delete`) · *Code* `eVe/voice/assistant/assistant_task.js`,
  `atome/src/squirrel/ai/conversation_session.js` (`programmed`), `eVe/intuition/tools/calendar_alarm_instant.js#missedCalendarAlarmTrigger`
  · *Plat.* W T I · *Origine* R-377.
- **ASV-002** · Surveiller la caméra — « filme s'il y a quelqu'un devant la porte », « préviens-moi quand le chat arrive » → l'aperçu
  de la caméra est regardé toutes les 5 s pendant 21 min (par défaut) ; vu, elle filme ou agit. *Voix* `camera.watch`,
  `camera.watch_stop` · *Code* `eVe/domains/capture/camera_watch.js` · *Plat.* W T I · *Origine* R-377.

## Demandes du registre (15)

Titre et statut tels que [todo/REGISTRE_DEMANDES.md](../todo/REGISTRE_DEMANDES.md) les donne le 2026-11-25. Une demande `FAIT`
a des fonctions à relever ; les autres disent ce qui reste ouvert.

- R-362 — Assistant : toute erreur énoncée, pas seulement affichée ; le 429 « OpenAI limite les demandes » est-il légitime ? (2026-11-25) — `FAIT`
- R-342 — L'assistant ne répond plus : « L'assistant vocal est indisponible » (2026-11-24) — `FAIT`
- R-264 — Bande du bas : outil Recherche retiré ; l'assistante touchée déplie son champ (bascule recherche, Discussions, micro d'écoute, Envoyer), Dashboard et projet (2026-11-22) — `FAIT`
- R-245 — CarPlay, écran vocal : plus de ✕ ni de texte « atome », Atome agrandi, micro pour couper l'écoute, fond d'écran standard (2026-11-19) — `ATTENTE UTILISATEUR`
- R-228 — Bande du bas : le micro de l'assistant chevauche le champ ; ses mots passent sur la bande du haut (2026-11-17) — `FAIT`
- R-227 — Assistant : « je t'écoute » dit à l'aveugle en pleine conversation (2026-11-17) — `ATTENTE UTILISATEUR`
- R-226 — Assistant : actions pendant une durée, et la notion du temps (2026-11-17) — `FAIT`
- R-224 — Assistant vocal : « Ève, écoute-moi », raccrocher, micro de coupure (2026-11-17) — `ATTENTE UTILISATEUR`
- R-223 — CarPlay : l'assistant ne s'affiche pas, ne démarre pas, ne répond pas (2026-11-17) — `ATTENTE UTILISATEUR`
- R-222 — Rapports de bug de l'assistant : lire ceux du jour et les anciens, corriger ceux qui ne le sont pas (2026-11-17) — `FAIT`
- R-220 — Assistant : une action demandée est faite tout de suite, jamais de Valider / Refuser à l'écran (2026-11-17) — `FAIT`
- R-124 — Assistant inopérant (« Le serveur atome n'a pas pu mener la demande IA à bien ») et scan sans netteté ni bip (2026-11-07) — `OUVERT`
- R-120 — IA unifiée, Not Diamond et facturation (2026-11-05) — `FAIT`
- R-013 — Moteur vocal : restes ouverts — `FAIT`
- R-109 — Vérification MCP « universel en accès » (cahier V1.2/V1.23) sur l'app réelle (2026-11-02) — `FAIT`
