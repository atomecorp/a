# Inventaire — Multipiste et création musicale

Périmètre : Timeline, Cellules, Scènes, Console (Mixage), effets audio et vidéo, enregistrement, MIDI et séquenceur, instruments, sampler, Slicer, Contrôles, Prompteur, hôte AUv3, persistance du multipiste.

État : **relevé complet** au 2026-11-25 (demandes R-199 à R-369, chacune vérifiée dans le code, R-371).
La liste des fonctions du multipiste est son parcours de tests : chaque ligne y dit le geste et ce qu'on voit ou
entend. Elle reste dans `tests/parcours_musique/`, dont les identifiants (`TL-03`, `REC-12`…) sont cités par les sondes.

## Sources
- Parcours : [tests/parcours_musique/README.md](../tests/parcours_musique/README.md)
- Parcours : [tests/parcours_musique/commandes_vocales.md](../tests/parcours_musique/commandes_vocales.md)
- Propriétaires du code : `eVe/intuition/tools/molecule`, `eVe/domains/midi`, `eVe/domains/music`, `eVe/domains/audio_fx`, `eVe/domains/sample_edit`, `eVe/domains/controls`, `eVe/domains/molecule_import`, `atome/engines`.

## Demandes du registre (96)

Titre et statut tels que [todo/REGISTRE_DEMANDES.md](../todo/REGISTRE_DEMANDES.md) les donne le 2026-11-25. Une demande `FAIT`
a des fonctions à relever ; les autres disent ce qui reste ouvert.

- R-375 — Multicam dans la Timeline : une piste Multicam qui se déplie (une voie par angle), la régie dans le Visuel (toucher une vignette = couper), Vue › Régie live (sources à 6 zones A · AV · V / F1 · F2 · F3, effets live, Latch, Enr. = toutes les sources), stabilo, PiP, synchro débrayable (repère, aimant), Auto (Manuel, Son, Rythme, Scènes, Hasard, Modèles en direct), effets et colorimétrie non destructifs par angle et master, caméras Blackmagic (panneau Iris…Pivot, Réseau ou Bluetooth), l'iPhone comme caméra, sorties live (écran relié et flux TV : le programme seul ; « à l'antenne » ; le programme rendu en MP4 après une prise) ; voix/MCP `multicam.*` (2026-11-25) ; Capture › Multicam (tuile après Vidéo : l'appareil filme pour le Mac, son flux dans l'aperçu) et sa lampe rouge « à l'antenne » qui respire (26 nov.) — `FAIT` (L0–L8) ; Vision plus tard
- R-380 — Prises › Matériel : un appareil MIDI externe (synthé ou effet) posé et peint sur la Timeline, ses CC envoyés et reçus (2026-11-25) — `FAIT` (fonctions PZ-09 à PZ-13 du parcours `06_effets.md`)
- R-374 — Clavier d'une piste : split, layer et multitimbral en barres sur un clavier, Fondu de jointure, Vélocité, commandes `keyboard.bar.*` (2026-11-25) — `FAIT` (fonctions KB-01 à KB-06 du parcours `08_instruments_slicer.md`)
- R-372 — Quantise audio par les repères warp, correction de hauteur « à la Melodyne », effets de pitch (vibrato, rampe) (2026-11-25) — `FAIT` (fonctions TN-01 à TN-06 du parcours `08_instruments_slicer.md`)
- R-370 — Gel automatique et invisible des pistes, pour soulager le processeur, avec indicateur de charge (2026-11-25) — `FAIT` (PE-30 à PE-38 du parcours `10_persistance_plateformes.md`)
- R-373 — Console (Mixage) : rack d'effets vertical à droite de la tranche, potards rotatifs d'une couleur, écran du compresseur, faces repliées (2026-11-25) — `FAIT` (fonctions MX-76 à MX-80 du parcours `05_console.md`)
- R-369 — Montage gigogne : une Scène incluse dans une autre Scène (cellule ou clip), et des clips groupés en clip-bloc dans la Timeline (2026-11-25) — `FAIT` (fonctions PI-15 à PI-20 du parcours `02_clips_edition.md`)
- R-368 — Prises › Instr. et Effets : poser un synthé ou un effet sur une piste et le peindre sur une zone de la Timeline (2026-11-25) — `FAIT` (fonctions PZ-01 à PZ-08 du parcours `06_effets.md`)
- R-379 — Synchro MIDI entrée et sortie : horloge, départ/arrêt (Start, Continue, position) par appareil avec décalage, eVe maître ou esclave d'un appareil (tempo suivi, départs suivis), Réglages › Avancé › Synchro, commandes `midi_sync.*` (2026-11-25) — `FAIT`
- R-367 — Multipiste : effets temps réel Stutter / Ratchet, Hachoir, Chaos et Vitesse (rampes, avec ou sans time stretch) (2026-11-25) — `FAIT` (FX-19 à FX-25, CT-21, MX-70 ; moteur audio installé avec celui de R-370)
- R-366 — Presets de tranche par parties : sauver avec un nom, charger tout / effets / routage / E/S (2026-11-25) — `ATTENTE UTILISATEUR`
- R-365 — Charger un preset de tranche à la volée : depuis un widget du projet ou une Follow Action (2026-11-25) — `FAIT`
- R-364 — Timeline : fiabiliser Rogner / extension, Boucle, Étirer, Scinder et leurs enchaînements, vérifiés graphiquement (2026-11-25) — `FAIT`
- R-363 — Contrôles : actions de clip (lire, depuis le début, arrêter, pause, vitesse, pitch) et sauts de Timeline calés sur la quantification (2026-11-25) — `FAIT`
- R-362 — Enr. idiomatique : vue Scène, Cellules et Timeline ; double toucher = clip prêt à enregistrer ; piste explicite (2026-11-25) — `FAIT`
- R-361 — Lecture : Pause dans la Timeline, Stop dans les Cellules, appui long = Stop ; Début glissé = bande de navigation (2026-11-25) — `FAIT`
- R-360 — Rail d'un clip/piste MIDI : outils repliés par défaut, regroupement par thème, Temps sur un clip MIDI (2026-11-25) — `FAIT`
- R-355 — En-têtes de piste dépliés : un glisser sur les noms choisit plusieurs pistes, traitées en lot (2026-11-25) — `FAIT`
- R-354 — Transport par MIDI et par le clavier : Lecture, Enr., Début ; raccourcis par défaut (2026-11-25) — `FAIT`
- R-353 — Vue Scène « instrument » : disposition par blocs, auto-assignation MIDI, piste des lancements, jeu chromatique d'une cellule (2026-11-25) — `FAIT`
- R-352 — Contrôles : cible relative au contexte (« le Nᵉ clip de la Scène ») (2026-11-25) — `FAIT`
- R-351 — Enregistrement multipiste simultané, pistes hétérogènes (2-3 vidéo, audio, MIDI) (2026-11-25) — `FAIT`
- R-356 — Forme d'onde du Visuel : toute petite sur l'iPad, énorme et en blocs sur le moniteur, en blocs aussi sur l'iPad agrandie (2026-11-25)
- R-348 — Sortie d'un clip et d'une piste en Édition ; rail du clip rangé en palettes (2026-11-24) — `FAIT`
- R-347 — Objets « Contrôles » (sliders, rotatifs, champs, menus) : cahier des charges point par point (2026-11-24) — `FAIT`
- R-346 — Cellules : clip vidéo/son muet et aperçu vide ; progression des cellules d'une Scène ; scrub Timeline (2026-11-24) — `FAIT`
- R-344 — Import de plusieurs fichiers : cellules libres suivantes ; Timeline : maintien sur une piste → Importer, bout à bout ; dépôt sur les pistes (2026-11-24) — `FAIT`
- R-343 — Timeline MIDI : notes en direct, édition de la prise, piste dépliée pleine hauteur, Sortie MIDI (2026-11-24) — `FAIT`
- R-318 — Cellules : butées de la barre des Scènes ; Début revient à la première Scène (2026-11-24) — `FAIT`
- R-315 — Édition : un clip vidéo, image ou texte a les mêmes outils qu'un clip audio (2026-11-24) — `FAIT`
- R-314 — Panneau d'effets du clip (rail « Effets ») : nouveau visuel (2026-11-24) — `FAIT`
- R-313 — Timeline : Édition allumée, toucher un clip l'ouvre dans l'éditeur des Cellules (2026-11-24) — `FAIT`
- R-312 — Automation d'une piste : Auto qui se referme, persistance, repli/dépli des couloirs (2026-11-24) — `FAIT`
- R-330 — Grouper des pistes (triangle) et des cellules (cellule-bloc où l'on entre) (2026-11-24) — `FAIT`
- R-311 — Pistes traitées en lot : choisir plusieurs pistes, puis Suppr., Volume, Effets, M/S pour toutes (2026-11-24) — `FAIT`
- R-310 — Multipiste : gestes dans le vide bloqués hors de l'aperçu ; toute création de Créer dans l'aperçu, à la tête de lecture (2026-11-24) — `FAIT`
- R-309 — Mixage : Lecture/Début, monitoring, rangée des vues fixe, plugin ouvert, Timeline intacte ; icône Cellules (2026-11-24) — `FAIT`
- R-307 — Cellules : une cellule (clap) relancée « comme une mitrailleuse », sans latence, mono avec léger fondu (2026-11-24) — `FAIT`
- R-306 — iPhone : pistes non supprimables, vue Mixage « sans console », Scope mort (2026-11-24) — `FAIT`
- R-305 — Timeline : Enr. › Geste enregistre, déplace dans l'aperçu et rejoue, fluide à 60 images/s (2026-11-24) — `FAIT`
- R-304 — Scènes : un seul fond, plus vif, en Timeline et en Cellules (2026-11-24) — `FAIT`
- R-303 — En-têtes de piste : lettres trop grosses, carré pointillé inutile, en-tête ouvert à redessiner (2026-11-24) — `FAIT`
- R-299 — Cellules : « Importer » de l'appui long n'importe rien ; un son déposé sur l'iPhone ne se joue pas (2026-11-23) — `ATTENTE UTILISATEUR`
- R-297 — Disposition → Multipiste : images et dessins perdus, une piste par objet (2026-11-23) — `FAIT`
- R-296 — Sortir des vues multipistes vers Liste, Matrice, Disposition ; vue Multipiste dans Vue et le Mystic (2026-11-23) — `FAIT`
- R-294 — Rail et Inspecteur figés au passage Timeline → Cellules ; palettes du bas dans le rail de droite (2026-11-23) — `FAIT`
- R-293 — Réglages des vues multipistes rangés : Réglages fixe dans le rail, panneaux expliqués, rouleaux compacts, case de valeur sur tous les sliders, MIDI binding dans les 3 vues (2026-11-23) — `FAIT`
- R-291 — Cellules : vérifier Nv. piste / Nv. scène du « + » ; barre de défilement des Scènes (2026-11-23)
- R-290 — Console : module Scope (vidéo/audio) et envois (Aux) visibles, y compris en vidéo (2026-11-23)
- R-289 — Cellules : les Scènes en rectangle d'une demi-hauteur, gris plus clair, progression sur tout le rectangle (2026-11-23) — `EN COURS`
- R-288 — Éditeur d'une cellule audio : temps de cellule, règle, aimant, sélection, couper/copier/coller/insérer/supprimer/silence, Annuler partout (2026-11-23) — `EN COURS`
- R-286 — Carte et canaux audio mono ou stéréo dans Entrée, mémorisés par piste (2026-11-23) — `CODÉ`
- R-285 — Vumètres : niveau d'entrée de la piste choisie dans le rail, sortie de chaque tranche sur ses deux bords (2026-11-23) — `FAIT`
- R-287 — Réordonner par appui long : Scènes (Cellules) et outils de la console (2026-11-23)
- R-284 — Réorganisation du rail contextuel Timeline / Cellules / Mixage (2026-11-23) — `FAIT`
- R-283 — Console (Mixage) en « Ambre » : panneau « + », sa liaison à l'outil, tranche choisie (2026-11-23) — `FAIT`
- R-282 — Couleur des Scènes : la même en Cellules et en Timeline (2026-11-23) — `FAIT`
- R-278 — Cellules : onde gris clair sur fond assombri ; Scènes du bas : fond gris foncé et barre de couleur en bas (2026-11-22) — `FAIT`
- R-277 — Cellules et Scène : sélection d'Édition, boucles de Lecture, défilement du filtre, fond de Scène relié à sa tuile (2026-11-22) — `FAIT`
- R-276 — Cellules : appui long sur une cellule vide ou la zone vide = menu des Prises, la prise choisie démarre calée (2026-11-22) — `FAIT`
- R-275 — Outils d'édition des vues multipistes : mêmes cases dans toutes les vues, Mixage épuré, réécriture d'Édition (Cellules et Timeline) (2026-11-22) — `FAIT`
- R-273 — Lecture hors du rail : toucher une ligne/tuile la lit ; en multipiste Lecture dans la bande après Enr. ; à sa place un outil Replier/Déplier le rail (2026-11-22) — `FAIT`
- R-272 — Console vs Cellules : marge autour des outils, taille standard, sélection de ligne/Scène qui déborde (2026-11-22) — `FAIT`
- R-271 — Cellules : décompte réglable (en temps) avant chaque prise ; rec. du bas : un toucher ouvre toujours sa palette, la prise va dans la cellule ou la piste choisie (2026-11-22) — `FAIT`
- R-270 — Vues multipistes : Aperçu et Inspecteur dans Vue ; disposition de la rangée du bas et du coin Pistes/Scènes (2026-11-22) — `FAIT`
- R-258 — Vue Scène supprimée → filtre « Scène » de la vue Cellules ; couleur par Scène ; cellule sélectionnée sans agrandissement, import dans les cellules (2026-11-21) — `FAIT`
- R-256 — La forme d'onde d'une prise disparaît à l'arrêt (2026-11-21) — `FAIT`
- R-254 — Entrée d'une piste : Monitoring en tête de liste, une entrée par piste (liste ou barillet) (2026-11-21) — `FAIT`
- R-253 — Vues multipistes : rail latéral épuré (Réglages permanent, sélecteur de vue au-dessus de Lecture), mode Édition d'un seul clip, cellules qui jouent, prise déposée sur une cellule, Aimant en barillet (2026-11-21) — `FAIT`
- R-251 — Vue Cellules : liserés de séparation (codés) + fond de la ligne sélectionnée (maquette) (2026-11-21) — `FAIT`
- R-249 — Projet (Timeline) : un seul outil, l’import, qui injecte directement (2026-11-20 → 22) — `FAIT`
- R-247 — iPhone : la forme d'onde de la prise ne se dessine pas pendant l'enregistrement dans la Timeline (2026-11-19) — `FAIT`
- R-243 — Mode Cellules refait « à la Ableton » : prise dans la Scène touchée, prise pendant la lecture, multitouch, forme d'onde, réglages par clip, effets, comping, projet Vide, Multipiste, Scène depuis la Timeline (2026-11-19) — `FAIT`
- R-235 — ASIO sous Windows, à côté de WASAPI exclusif (2026-11-18) — `FAIT`
- R-231 — Cellules et Scènes : une cellule touchée doit jouer (son, vidéo, MIDI) ; outils de lancement (2026-11-17) — `FAIT`
- R-211 — Prompteur : importer des paroles LRC, SRT, VTT et anciens Lyrix (.lrx, .prx) (2026-11-17) — `FAIT`
- R-203 — Scènes et cellules : créer au toucher dans le vide (sans scène ni piste), appui long sur une Scène ou une cellule (Nom, Suppr., Piste, Effets) (2026-11-17) — `FAIT`
- R-199 — Entêtes de piste (toucher / glisser / peindre M-S), piste dépliée sur place ou inspecteur, état de la console gardé à la réouverture (2026-11-16) — `FAIT`
- R-196 — Convertisseur Loopy Pro → atome : `.lpproj` en projet natif, son partagé jamais dupliqué, comparaison WDA (2026-11-16) — `FAIT`
- R-195 — Prises : « Multipiste » depuis une prise ou une sélection, projet créé et rempli, retour vers la liste (2026-11-16) — `FAIT`
- R-191 — Moteur audio universel : ports typés, modulation à la trame, multicanal 1/2/4/8, voix séparées dans le synthé (2026-11-16) — `FAIT`
- R-187 — Console : le fond de la tranche visible derrière, les outils posés dessus, plus petits, sans ombre (2026-11-15) — `FAIT`
- R-186 — Synthé modulaire : challenge des briques de base, maquettes, puis code (2026-11-15) — `FAIT`
- R-184 — Effets pro audio et vidéo : compresseur à caractères + sidechain, réverb, égaliseur, mastering, vocodeur ; flou, étalonnage, incrustation (2026-11-15) — `FAIT`
- R-182 — Cellules : enregistrer une cellule vide, créer une cellule, rangée Vues/Transport/Enr. en bas de la Timeline, inspecteur d'une cellule, outils Aperçu et Inspecteur, sortie du métronome (2026-11-15) — `FAIT`
- R-181 — Slicer : découpe d'un clip audio (seuil, mesures, main, Warp) et lecture des tranches (hasard, ordre, hauteur, volume, roulé), chaque tranche une cellule (2026-11-15) — `FAIT`
- R-183 — Console : outil REC (point de prise), ordre libre des outils, OUT = sorties physiques, Envoi / Retour, palettes sur dalle (2026-11-15) — `FAIT`
- R-179 — Recette pro du multipiste dans l'AUv3 (AUM) sur l'iPad atomic : synchro hôte, prises, bus (2026-11-15) — `ATTENTE UTILISATEUR`
- R-178 — Séquenceur pro : MIDI dans la capture, piano roll à trois modes, automation commune (2026-11-15) — `FAIT`
- R-177 — Projet sur l'iPhone : la Lecture « ne démarre plus » (Multipiste et Liste), pistes vides (2026-11-15) — `FAIT`
- R-175 — Rail du fond de projet : Photo, Colorer, Multipiste retirés ; Activité en bas ; Gestes en rouge (2026-11-15) — `FAIT`
- R-171 — Console de mixage : refonte (taille d'outil de l'écran, effet ouvert visible, Volume dans l'écran, déplacer une piste) et bugs (2026-11-14) — `FAIT`
- R-170 — Vue Timeline : hauteur de piste, défilement des en-têtes, rail sans trou, aperçu sous la tête, fondu, prise en direct, sélection de piste, aimant, scrub (2026-11-14) — `FAIT`
- R-002 — Sampler : écran complet de l'éditeur de sample — `FAIT`
- R-003 — Sampler : correspondances SFZ manquantes — `FAIT`
- R-004 — Sampler : auto-sampling de la sortie d'eVe — `FAIT`
- R-009 — Séquenceur : M7, Ouvrir / Lancer sur un événement du calendrier — `FAIT`
- R-010 — Timeline et vidéo : restes ouverts — `FAIT`
- R-345 — Cellules : rangées reliées à leur en-tête de piste (2026-11-24) — FAIT
