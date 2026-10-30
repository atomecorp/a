# Questions du registre — envoi du 2026-10-30

Posées le 2026-10-30 par la session d'exécution du registre (`todo/REGISTRE_DEMANDES.md`). Chaque question donne
ma recommandation (« Reco »). Tu peux répondre « reco partout », ou seulement les numéros où tu choisis autre chose.
Les réponses s'écrivent ici, en face de chaque numéro, puis dans l'entrée du registre.

> **Réponse du 2026-10-30, soir (session du registre)** : « Oui, reco partout » → chaque question ouverte prend sa
> reco. Sans code (l'état actuel est la reco) : 1, 8, 10, 39, 42, 53, 57, 59, 60, 63 ; 32 (cases laissées ouvertes à
> ton nom) ; 64 (pas de fil public ; étude des faux comptes après le lancement des invitations). À coder : 2, 3, 4–7,
> 11, 12, 13–17, 19–29, 31 (Strava d'abord), 33, 34, 35, 36, 38, 41, 54, 55, 56, 58, 61, 62. Maquette d'abord (la
> reco le dit) : 9, 18, 37, 40.

## Calendrier — R-001 (maquettes validées le 27 oct., il restait 2 questions)

1. **Pas du rouleau des minutes** (début, fin, durée, alarmes). De 5 en 5 : 12 valeurs, on vise vite :00, :15,
   :30 ; une minute précise se tape (toucher deux fois). Minute par minute : 60 valeurs, plus de chemin. Reco : 5 en 5.
2. **Calendriers créés au départ.** Le panneau Calendriers permet d'en créer autant qu'on veut. Au premier
   lancement : « Perso » seul, ou « Perso », « Pro » et « Sport » déjà là ? Reco : les trois (ils montrent tout de
   suite à quoi ça sert, et un calendrier vide se replie).

60. **Rendez-vous : cinq comportements choisis en codant** (panneau codé, captures `temp/r001/shots/`). À confirmer :
    (a) un lancement qui dure (une musique) au-delà de la fin du rendez-vous n'est pas arrêté ; (b) choisir Musique,
    Média, Projet ou Outil dans « Quoi » n'enregistre rien tant qu'un élément n'est pas choisi (l'alarme reste une
    notification) ; (c) un invité de visio ajouté après coup n'est appelé qu'à l'heure de l'alarme ; (d) passer
    « Répéter » sur Personnalisé part d'une semaine au jour du début ; (e) « Jusqu'à · N fois » propose 9 (règle 19).
    Exemple : alarme « Musique » à 19 h, rendez-vous fini à 19 h 30, la musique continue. Reco : les cinq tels quels.

## Sampler — R-002 (maquettes E1 à E4, `temp/synth/mockups/e1…e4_*.png`)

3. **L'éditeur de sample plein écran.** La carte de l'onde grandit sur tout le panneau : vue d'ensemble en haut
   (tout le son, la fenêtre vue éclaircie), vue de travail au milieu (pincer pour zoomer, glisser pour défiler, les
   deux canaux l'un sur l'autre, la sélection entre ses deux bulles), outils au pied. Trop d'outils pour la bande :
   ils sont rangés en 4 familles ; toucher une famille ouvre ses outils dans une carte au-dessus du pied.
   Écoute (joue la sélection) ; Éditer : Couper, Copier, Coller, Muet, Rogner, Figer ; Forme : Entrée (fondu),
   Sortie (fondu), Envers, Gain, Norme, Centre (retire le décalage continu), Étirer, Ton ; Repère : Slice, Boucle,
   Marque, Aimant. Valides-tu ? Reco : oui.

## Finder du projet — R-007 (maquette `temp/finder_charter/mockups/finder_charter.png`, remise aux règles du 30 oct.)

4. **La maquette A à F** (liste, Choix par appui long, Filtre, Lieux, TV, vidéos en ligne) : valides-tu ?
5. **Suppr. dans Choix** : garder l'outil Supprimer quand des lignes sont cochées (avec confirmation) ? Reco : oui.
6. **Le tri** : Récents / A → Z / Type rangés dans Filtre (l'en-tête Nom / Date / Type disparaît), ou toujours les
   plus récents d'abord (et les plus pertinents quand on tape des mots) ? Reco : rangés dans Filtre.
7. **Le champ de recherche** dans la bande du panneau, l'outil Trouver du ruban restant allumé tant que le panneau
   est ouvert ? Reco : oui.

## Timeline et vidéo — R-010

8. **Synchro image / son.** Aujourd'hui l'image se recale si elle s'écarte de plus de 120 ms ; on mesure +3 à 9 ms
   en moyenne (38 ms au pire), imperceptible. On garde ce réglage, ou plus strict ? Reco : on garde.
9. **Réaligner la timeline sur la Liste.** La timeline est remplie une fois depuis la Liste, puis ne bouge plus si
   tu réordonnes la Liste (ex. Liste A-B-C → tu mets C en premier → la timeline reste A-B-C). Ajouter un outil
   « Réalig. » dans la bande de la Liste (annulable), ou rien ? Reco : l'outil (maquette avant le code).
10. **Gaucher : ordre des tranches du mixeur.** Aujourd'hui la piste 1 reste à gauche (seuls les groupes et les
    palettes passent en miroir). Inverser (piste 1 à droite) ? Reco : garder la piste 1 à gauche (on lit les pistes
    dans le même ordre que la timeline).

## TV et YouTube — R-011

11. **Mode liste.** Une ligne de la Liste qui est une vidéo TV ou YouTube : elle joue dans sa vignette (comme sur la
    scène, avec sa découpe), ou un toucher l'ouvre en grand ? Reco : elle joue dans sa vignette.

## Voix — R-013

12. **Dictée libre** (capture du Dashboard, panneau vocal, trackpad). Garder la reconnaissance du système
    (fonctionne sans internet) ou passer par l'assistant connecté (transcription par internet, plus juste, et on
    retire deux plugins) ? Reco : garder le système quand il n'y a pas internet, l'assistant connecté sinon.

61. **« Répète » sur l'iPad.** Sur le Mac, avec 36 vraies prises, « répète » n'échoue presque jamais comme sur l'iPad
    (« hors grammaire ») ; ajouter des variantes n'aide pas et crée de fausses commandes sous la télé (mesuré, rien
    changé). Pour trouver la cause, il faut entendre ce que le moteur vocal reçoit sur l'iPad. Exemple : tu dis
    « répète » 10 fois sur l'iPad, eVe garde le son exact donné au moteur, je le rejoue au banc. J'ajoute ce mode
    d'essai (éteint par défaut, allumé seulement pour ce test), puis tu fais les 10 prises ? Reco : oui.

## Objectifs et Sport — R-006

13. **Changer l'heure d'un objectif** (ex. séances à 18 h → 19 h) déplace toutes les séances futures, sauf celles
    que tu as déjà déplacées à la main ou faites ? Reco : oui.
14. **Clore un objectif atteint** : une ligne « Clore » au maintien de la tuile, à côté de « Fait » ; les rappels
    s'arrêtent, l'historique reste ? Reco : oui.
15. **Repos fixe** (90 s pour un exercice d'isolation, 120 s pour un poly-articulaire comme le squat) au lieu d'un
    repos qui raccourcit avec le niveau (90 → 75 → 60 s) ? Reco : oui, fixe.
16. **Visée « Force »** : proposer 3 à 5 répétitions avec une charge lourde (aujourd'hui la visée existe mais ne
    change rien aux propositions) ? Reco : oui.
17. **Ordre dans la séance** : les poly-articulaires (squat, développé) d'abord par défaut ? Reco : oui.
18. **Échauffement et programmes tout faits** : proposer d'office 1 à 2 séries légères avant la première série d'un
    exercice lourd ; et offrir des programmes prêts (ex. « Débutant, 3 séances par semaine ») ? Reco : oui aux deux
    (maquette avant le code).
19. **Split View** (deux outils côte à côte, ex. Sport et une vidéo) : on l'ouvre par une ligne « Côte à côte » au
    maintien d'une tuile, ou par un outil de la bande du bas ? Reco : au maintien (aucun nouvel outil dans la bande).
20. **Photos de suivi** (même pose, deux dates comparées) : le module s'appelle « Beauté » ou « Apparence » ?
    (« Apparence » dépasse les 6 lettres d'un outil : il s'afficherait « Appar. ».) Reco : « Beauté ».

## Santé, Plaisir, Thalasso — R-006 (étude `todo/etude_sante_plaisir_thalasso_2026-10-22.md` §7)

21. **« Se faire plaisir »** : un objectif à part, ou une partie de l'objectif « Équilibre » existant ? Reco : à part.
22. **Les activités Plaisir hors de la progression** du Dashboard (elles ne font pas monter de niveau, pour ne pas
    culpabiliser) ? Reco : oui, hors progression.
23. **Suggestions spontanées** d'eVe (« et si tu faisais une sieste ? ») : par la bulle de l'assistant, une par jour
    au plus, avec « Ne plus proposer » ? Reco : oui.
24. **Bilan unique** (« comment ça s'est passé ? ») : le Ressenti déjà codé (panneau Résultats, lot A) sert de bilan
    unique après une séance, un soin ou une journée ? Reco : oui.
25. **Profil santé** : la première déclaration se fait par pastilles (allergies, grossesse, cœur, articulations…)
    plus « Rien à déclarer », corrigée ensuite dans la fiche Santé ? Reco : oui.
26. **Séjour Thalasso** : on saisit ses dates et son lieu une fois, puis chaque soin s'ajoute à une journée du
    séjour ? Reco : oui.
27. **Découverte locale** (lieux proches pour une activité) : depuis ta position (ou un lieu tapé), rayon réglable,
    chaque résultat avec sa source ? Reco : oui.
28. **L'assistant et ta santé** : il reste aveugle à ton profil santé (aujourd'hui), ou il te demande ton accord à
    chaque question qui en a besoin ? Reco : accord à chaque question.
29. **Stockage du profil santé** : seulement sur l'appareil, ou synchronisé ? Synchroniser des données médicales
    demande un avis juridique (hébergement de données de santé). Reco : sur l'appareil seulement pour l'instant.

34. **Respiration « Kapalabhati »** (validée le 28 oct. : 30 expirations vives, une par seconde, puis souffle libre).
    L'étude du 22 oct. écarte toute hyperventilation cyclique, qui peut faire perdre connaissance, surtout dans ou
    près de l'eau. Exemple : une séance Thalasso proposerait aujourd'hui Kapalabhati au bord du bassin. On la garde
    (jamais proposée dans un contexte d'eau, avec ses contre-indications dans son « i » : grossesse, épilepsie, cœur,
    crises de panique), ou on la retire ? Reco : la garder ainsi.

## Résultats — R-016

30. ~~**Le matin en Basic**~~ — déjà répondu le 28 oct. (session `67c374b0`) : une courte phrase de l'assistant,
    qu'on touche pour ouvrir le ressenti. Rien à répondre.
31. **Connexions Strava, Whoop, Oura** (lot F) : chaque service demande que tu signes son accord développeur.
    Lesquels veux-tu, et dans quel ordre ? Reco : Strava d'abord.

40. **« Mon nom » dans l'aperçu de l'envoi** (Envoyer mes résultats, codé le 30 oct., capture
    `temp/r016de/shots/E1_all_ticked.png`). Coché, ton nom part en première ligne (« Résultats de Jean-Eric »), mais
    l'aperçu ne le montre pas. Exemple : tu décoches Cardio, l'aperçu enlève la carte Cardio ; tu décoches « Mon nom »,
    l'aperçu ne change pas. On le montre dans l'aperçu (maquette à faire), ou l'aperçu reste aux cartes ? Reco : le
    montrer, une ligne en haut de l'aperçu, maquette d'abord.
41. **Ce que reçoit le destinataire** : aujourd'hui des lignes de texte (« Glycémie : 146 mg/dL · +2 h »), pas l'image
    des cartes. Exemple : ton coach reçoit 4 lignes, pas le visuel pastel que tu vois. On joint aussi une image de
    l'aperçu ? Reco : oui, l'image en plus du texte.
42. **Réseaux dans Publier pour un envoi de résultats** : Publier ouvert depuis l'envoi n'offre que des personnes et
    le fil eVe (pas TikTok, Instagram, forums). C'est voulu pour des résultats de santé ? Reco : oui, garder ainsi
    (données de santé, cercle restreint).

53. **Ressenti : une case cochée** (capture `temp/r016c/09_summary_mood_open.png`). Une case cochée montre seulement
    le ✓, comme toutes les listes d'eVe (brique commune) ; les maquettes M6/M7 teintaient aussi la rangée choisie.
    Exemple : tu coches « Joie », sa rangée garde son fond, seul le ✓ paraît. On ajoute la teinte (et alors dans
    toutes les listes), ou le ✓ seul suffit ? Reco : le ✓ seul (règle 15 : un seul aspect par état).
54. **Séance où tout a été passé.** Si tu passes toutes les étapes, le bilan reste bloqué : « Passer » et « Enreg. »
    échouent, seul le ✕ en sort. Exemple : tu lances la planche puis passes les 3 tenues. On l'enregistre comme
    « arrêtée » (pas comptée dans tes objectifs), ou on ne garde rien ? Reco : arrêtée, pas comptée.

55. **Résultats : effacer l'heure choisie** (moniteur codé, captures `temp/r016b/out/`). En glissant le long d'une
    carte, tu choisis une heure ; chaque carte montre sa valeur à cette heure. Les maquettes ne disent pas comment
    revenir à la journée entière. Exemple : tu as glissé sur 10 h, tu veux revoir toute la journée. Reco : toucher la
    même carte sans glisser rend la journée entière.
56. **Résultats : les bascules du pied.** Tout est allumé ; tu touches « Sport ». Aujourd'hui (comme le filtre des
    médias), Sport s'éteint et les autres restent. La maquette M3 laisse penser que Sport reste seul. Lequel ?
    Reco : depuis « Tout », un toucher garde l'activité seule (M3) ; ensuite chaque toucher ajoute ou retire.
57. **Résultats : les bascules sur deux rangées.** La brique commune arrondit chaque bascule au demi-outil : Tout,
    Sport, Repas, Bien-être prennent deux rangées sur un téléphone (M3/M4 en montrent une). Reco : accepter deux
    rangées (règle 12 : la taille ne change jamais, le conteneur se réorganise).
58. **Résultats : la plaque du Moniteur.** Sa plaque est une demi-plaque, son nom est coupé « Résul… ». Reco : la
    plaque entière, comme les autres entrées du Moniteur, pour que le nom tienne.
59. **Résultats : le nom des anneaux.** Aujourd'hui les anneaux portent le nom de tes objectifs (Forme, Muscles,
    Calme) ; les maquettes disaient Bouger, Sport, Bien-être. Reco : le nom de tes objectifs (c'est ce que tu suis).

62. **Ressenti avant Lancer sur une carte cardio** (capture `temp/r016c/c01_cardio_prestart.png`). Sur la carte
    Tapis, les rouleaux But et Voir puis le plan (« 8 × Effort / puis Récup ») remplissent déjà la place au-dessus du
    disque. Les lignes Forme et Force posées à la fin seraient cachées sous le pli. A) les lignes en tête de la zone
    des valeurs, visibles tout de suite, le plan défilant dessous ; B) les lignes fixes au-dessus du disque comme sur
    la carte de force (le plan n'a plus qu'environ 50 px, une ligne ouverte couvre les niveaux sur un petit
    téléphone). Exemple : tu ouvres Tapis, tu vois d'abord « Forme · Non renseigné ». Reco : A.

## Publier — R-014

35. **Ranger un réseau sous un profil** (TikTok, Instagram, une Page Facebook). Les forums se rangent déjà comme les
    contacts : appui long sur leur tuile dans Contacts, ligne « Profils », une case par profil ; Publier ne montre
    alors que ce qui va avec le profil actif. Un réseau n'a aujourd'hui aucune tuile qu'on tient : il n'est rangé que
    par l'assistant (« range TikTok sous Sport »), et un réseau non rangé apparaît sous tous les profils. Exemple :
    tenir la tuile TikTok dans Publier ouvrirait la même ligne « Profils » qu'un contact. Par là, ou ailleurs
    (Préférences › Réseaux sociaux) ? Reco : l'appui long sur sa tuile dans Publier, même ligne « Profils »
    (aucun élément nouveau à dessiner : c'est le maintien commun des tuiles).

## Curseurs — R-015 (capture `temp/r015/live_dom_slider.png`)

36. **Un outil lâché sur un projet.** Quand tu glisses un outil depuis Trouver › Outils sur un projet, il se pose
    aujourd'hui en bouton flottant (ancien DOM) à l'endroit du lâcher. Pour « Taille », c'est un vieux curseur natif
    de 0 à 100, alors que Taille va de 8 à 420 ; c'est le dernier curseur hors du curseur unique. La règle 13 interdit
    un outil posé sur le contenu sans place nommée par toi. Exemple : tu lâches « Taille » au milieu de ta page, un
    petit curseur reste là, sur ton contenu. Que doit devenir un outil lâché sur le projet ?
    A) il reste à l'endroit du lâcher, redessiné en Bevy (outil standard, le curseur d'outil pour Taille) : une
       exception nommée à la règle 13, maquette d'abord ;
    B) il rejoint la bande d'outils du bas du projet ;
    C) on retire le dépôt d'outils sur le projet (glisser un outil sur un objet vers son rail contextuel reste).
    Reco : B (rien de nouveau à dessiner, la règle 13 tenue).

## Activités — R-005

32. **Relecture par des coachs ou des spécialistes** (charges, catégories, défis) : tu as quelqu'un ? Sinon, ces
    cases restent ouvertes, à ton nom. Reco : les laisser ouvertes à ton nom.
33. **Média d'un tiers qu'on n'a pas le droit de redistribuer** (une vidéo d'exercice d'une autre chaîne) : on ne
    partage que son lien ? Reco : oui, le lien seul.

37. **Où paraît un message discret sur l'accueil du Dashboard ?** Aujourd'hui il passe par la scène du projet
    ouvert : sans projet, rien ne s'affiche. Cela touche aussi Coachs, Boutique, Émissions, Web et Vidéo. Exemple :
    fiche Écarté, Forme › Pas +3 kg sur 8 séries ; eVe calcule « Séries 4–8 ramenées à 18 kg », mais l'écran reste
    muet (l'assistant, lui, le reçoit désormais). Reco : l'afficher dans le champ de la bande du bas, à la place de son
    texte d'attente, comme l'annonce de Loisirs (même verre, effacé au toucher) ; maquette si tu valides l'idée.
38. **Énergie mesurée par l'appareil ?** La montre et Santé mesurent l'énergie active pendant la séance, mais eVe ne
    la relit pas. On la lit (avec ton accord, contrôlée comme le pouls) et on affiche « Énergie · montre ≈ 245 kcal »
    à la place du calcul poids × durée ? Reco : oui, l'appareil d'abord, le calcul seulement sans appareil.
39. **Saisir les calories soi-même ?** Exemple : l'écran du vélo indique 312 kcal. Il faudrait un curseur « Énergie »
    nouveau sur le bilan, donc une maquette d'abord. Reco : pas maintenant, le calcul et l'appareil suffisent.

Maquettes des éléments nouveaux (règle 16), sur de vraies captures du 30 oct. : `temp/r005_mockups/out/`.

> **Réponse du 2026-10-30 (session du registre)** : « les écrans que je vois, je valide tout. C'est très beau, c'est
> très bien. » → maquettes 43 à 52 validées avec leurs recos : 43 oui (source visible à l'envoi seulement) ; 44 A et B,
> 300 m ; 45, 46, 47, 48 oui ; 49 variante A (tuile Coachs) + rouleau Fuseau ; 50 « Avis », Import d'un autre s'il l'a
> permis ; 51 l'auteur du fil modère, pas de fil public sous 15 ans tant que non décidé ; 52 variante B (« ↳ nom »),
> toucher l'heure lit l'ancre.


43. **Défi de cadence : réglage et bilan.** Aujourd'hui, « Record » fait faire une série aussi longue que possible,
    mais aucun rythme n'est imposé. Proposition : dans Record › Régler, on ajoute sous « Séries » le même rouleau
    « Rythme » que dans Perso. Son premier cran, « Libre », donne le record simple. Avec 3 s, le record devient un
    défi de cadence. Le bilan dit alors ce qui était visé, ce qui a été tenu, la charge et la fois d'avant.
    Exemple : pompes au rythme de 3 s par répétition. Le bilan dit « Défi de cadence 3 s / rép. · Rythme moyen
    3,0 s / rép. · Résultat tenu · 21 en 63 s · Charge poids du corps · La dernière fois 18 · tenu ». La case
    « Garder ce rythme » existe déjà.
    Maquettes : `temp/r005_mockups/out/r005_01a_defi_cadence_reglage.png`, `temp/r005_mockups/out/r005_01b_defi_cadence_bilan.png`.
    La source de chaque mesure (chronométrée, calculée, saisie) n'apparaît pas sur le bilan. Elle part seulement
    avec un envoi, comme aujourd'hui. Ça te va ?
    Reco : oui aux deux écrans ; la source reste visible seulement à l'envoi, pour garder le bilan zen.

44. **Échauffement, retour au calme, distance et allure par phase (programme cardio).** Aujourd'hui,
    l'échauffement et le retour au calme durent 5 min et ne se règlent pas. Un effort se règle seulement en
    secondes, et l'intensité seulement en zone cardiaque.
    Proposition en deux points :
    - (a) Sur la fiche, un rouleau « Effort » (Temps / Distance) se place entre « But » et « Voir ».
    - (b) Dans Forme :
      - les curseurs « Échauf. » et « Calme » rejoignent Nombre, Effort et Récup ;
      - le rouleau « Cible » (Zone / Allure) existe déjà dans le code ; il gagne la valeur « Allure » ;
      - Bas et Haut se lisent alors en min/km.
    Exemple : 5 × 300 m entre 6:00 et 4:30 /km, 1 min de récup, 5 min d'échauffement et 5 min de calme. La fiche
    dit « ≈ 21 min · 5 × 300 m / 1 min ».
    Maquettes : `temp/r005_mockups/out/r005_02a_effort_distance.png`, `temp/r005_mockups/out/r005_02b_echauffement_allure.png`.
    Reco : A et B tels quels. 300 m respecte la règle 19 (multiple de 3). Le 400 m d'une piste est une norme du
    monde : on le propose aussi ?

45. **GPS perdu ou pouls absent, dehors.** Aujourd'hui, en course dehors, une ligne vide disparaît sans rien
    dire. Proposition : la dernière distance reste affichée, et deux rangées disent pourquoi une mesure manque. Ce
    sont les rangées « Pouls » qui existent déjà à l'intérieur.
    Exemple : « GPS · Signal perdu · 0:42 » (ou « Refusé » si tu n'as pas donné l'accès) et « Pouls · Aucun
    capteur ». L'allure reste « — ». Chaque rangée s'efface dès que la mesure revient.
    Maquette : `temp/r005_mockups/out/r005_03_gps_pouls_absents.png`.
    Reco : oui.

46. **La trace après la séance.** Aujourd'hui, la fiche finie ne garde que la distance. Proposition : sur la
    fiche finie, la ligne « Distance » est suivie de la carte de la séance, avec deux tracés. Le tracé rose est
    celui que tu as vraiment fait ; le vert est le trajet prévu, s'il y en avait un. La carte est la même que
    pendant la séance.
    Exemple : « Distance 1,62 km », puis la carte des quais avec ta trace rose qui suit le trajet vert.
    « Comment te sens-tu ? » descend en dessous.
    Maquette : `temp/r005_mockups/out/r005_04_trace_apres.png`.
    Reco : oui. La trace reste privée ; elle part à l'envoi seulement si tu la coches.

47. **Pas de charge personnalisés.** Aujourd'hui, la charge avance d'un pas fixé par le matériel (2,5 kg pour une
    barre). Proposition : un rouleau « Pas » sous « Charge », dans Perso. On y choisit le pas de son matériel
    (1,25 · 2,5 · 5 kg). Touché deux fois, on peut taper un pas à soi. Le rouleau « Charge » suit ce pas.
    Exemple : ta salle n'a que des disques de 1,25 kg. Tu choisis « 1,25 kg », et la charge passe de 40 à
    41,25 kg au lieu de 42,5 kg.
    Maquette : `temp/r005_mockups/out/r005_05_pas_de_charge.png`.
    Reco : oui, avec un pas gardé pour chaque exercice.

48. **Échéance et Défi réglés au toucher.** Aujourd'hui, l'échéance d'un objectif et son défi se règlent
    seulement à la voix ou par MCP. Proposition : dans la préparation de l'objectif, après « Heure de la séance »,
    on ajoute deux cartes :
    - « Échéance » : une date sur son rouleau, « Aucune » au premier cran ;
    - « Défi » : un nombre (13 · 21 · 34, règle 19) et son unité (jours / séances).
    Exemple : Muscles, avec « avant le 15 mars 2027 » et un défi de « 21 jours ». La suite de l'écran défile sous
    les boutons.
    Maquette : `temp/r005_mockups/out/r005_06_echeance_defi.png`.
    Pour les changer plus tard : un appui long sur la tuile de l'objectif rouvrirait ce même écran (une rangée
    « Régler »).
    Reco : oui, avec cette rangée « Régler ».

49. **Accès aux coachs depuis une activité, et fuseau du coach.** Le cahier demande un accès discret, par
    exemple un coach de tennis depuis le tennis, sans l'imposer à chaque activité.
    Deux façons de le montrer :
    - **A** : une tuile « Coachs » dans le niveau de la discipline. C'est la vraie tuile du niveau Coachs, et elle
      n'apparaît que si l'annuaire a des coachs de cette discipline.
    - **B** : une rangée « Coachs » dans l'appui long de l'activité.
    Exemple : Cardio montre la tuile Coachs à côté de Vélo (A), ou bien on tient « Course dehors » et on choisit
    « Coachs » (B). Les deux ouvrent la liste filtrée « course ».
    Pour le fuseau : dans « Mon coaching › Séance », un rouleau « Fuseau » se place sous Annulation. Par défaut,
    c'est le fuseau de l'appareil. Le client voit toujours les créneaux à sa propre heure, sans autre texte.
    Maquettes : `temp/r005_mockups/out/r005_07a_coachs_tuile.png` (A), `temp/r005_mockups/out/r005_07b_coachs_appui_long.png` (B),
    `temp/r005_mockups/out/r005_07c_fuseau_coach.png` (fuseau).
    Reco : A, car il se voit sans geste caché. Oui au rouleau Fuseau.

50. **Récupérer, repartager, couper les réponses d'un fil.** Aujourd'hui, tenir ta propre contribution dans le
    Fil ne propose que « Retir. ». Proposition : quatre outils au pied du Fil, dans cet ordre :
    - « Import » : ta vidéo rejoint tes médias. C'est l'outil de la médiathèque, avec la même icône.
    - « Envoi » : la même contribution part vers d'autres personnes.
    - « Avis » : un interrupteur. Allumé, les réponses sont ouvertes ; un toucher les coupe.
    - « Retir. ».
    Exemple : tu tiens ta série de pompes. Tu touches « Avis », il s'éteint, et plus personne ne peut répondre.
    Les réponses déjà faites restent.
    Maquette : `temp/r005_mockups/out/r005_08_fil_copie_envoi_avis.png`.
    Questions : le nom « Avis » te va-t-il, et « Import » est-il permis aussi sur la contribution des autres ?
    Reco : « Avis ». Import d'une contribution d'un autre seulement s'il l'a permis à l'envoi.

51. **File de modération.** Aujourd'hui, « Signal » ne masque une contribution que pour celui qui la signale.
    Personne ne voit les signalements. Proposition : l'auteur du partage d'origine, le propriétaire du fil, a un
    niveau « Signalés ». On y voit les contributions signalées dans son fil, avec leur nombre de signalements.
    Quand on en tient une, deux outils : « Garder » (les signalements sont écartés) ou « Retir. ».
    Exemple : la vidéo de Hugo est signalée 3 fois. Tu la tiens, tu la regardes en haut, puis tu touches « Retir. ».
    Maquette : `temp/r005_mockups/out/r005_09_file_moderation.png`.
    À trancher : qui modère (l'auteur du fil, eVe pour les fils publics ?), et faut-il une protection des mineurs
    (âge de la fiche) ?
    Reco : l'auteur du fil modère son fil. La question des mineurs reste ouverte : pas de fil public pour un
    compte de moins de 15 ans tant que ce n'est pas décidé.

52. **Réponses à une réponse, et lecture du passage ancré.** Aujourd'hui, le fil n'affiche qu'un seul niveau de
    réponses. Deux façons de montrer qu'Olive répond à Fanny et non à la vidéo d'origine :
    - **A** : les rangées gardent toute la largeur, et le rail d'imbrication tient lieu de retrait, comme pour les
      accordéons. Le rail est cyan pour une réponse à l'origine, rose pour une réponse à une réponse.
    - **B** : pas de rail ; la rangée dit « ↳ Fanny » sous le nom.
    Maquettes : `temp/r005_mockups/out/r005_10a_reponses_rail.png` (A), `temp/r005_mockups/out/r005_10b_reponses_a_qui.png` (B).
    Geste du passage ancré : la réponse de Fanny porte « 0:02 », l'instant qu'elle commente. Un toucher sur sa
    rangée lit sa réponse. Un toucher sur « 0:02 » lit la vidéo d'origine à partir de 0:02, en haut.
    Reco : B, car le rail est défini dans la charte pour les groupes dépliés, pas pour un fil. Toucher l'heure
    pour lire l'ancre.

63. **Choix pris sans maquette dans le fil VideoTrain** (captures `temp/r005_code_thread/shots/3a_own_held.png`,
    `5d_signales_held.png`). Trois détails ont suivi les motifs existants. Ils sont codés, mais tu peux les changer :
    a) l'outil qui ouvre « Signalés » s'appelle « Modér. » (« Signal. » était coupé à 6 lettres) et ne se montre que
    si des signalements attendent ; b) la case « Import permis » de l'Envoi est décochée par défaut (personne ne peut
    importer ta vidéo sans ton accord) ; c) quand tu touches Garder sur une réponse signalée, elle reste cachée pour la
    personne qui l'a signalée. Exemple : Fanny signale la réponse de Hugo, tu la gardes ; tout le monde la voit, sauf
    Fanny. Reco : garder les trois.

64. **Fils publics, moins de 15 ans et faux comptes** (cahier des Activités). Aujourd'hui, un fil VideoTrain va
    toujours à un groupe : l'envoi « à tout le monde » est refusé. Aucun moins de 15 ans ne peut donc ouvrir un fil
    public, et aucun code d'âge n'a été ajouté. Deux décisions te reviennent : faut-il un jour des fils publics (et
    alors, qu'est-ce qu'un moins de 15 ans y voit) ? Et veux-tu une étude des faux comptes (signes, seuils, ce qu'eVe
    fait) avant tout code ? Reco : pas de fil public pour l'instant ; l'étude après le lancement des invitations.

## Maquettes demandées par « reco partout » (2026-10-30, soir)

65. **Suite de la 37 : le message discret dans la bande du bas** (maquettes
    `temp/reco_activites/mockups/q37_message_dans_la_bande.png` et `q37_loisirs_et_message.png`, à côté de l'annonce
    de Loisirs). Sur la fiche Écarté › Forme (Perso, 8 séries, Pas +3 kg depuis 12 kg), eVe ramène les séries 4 à 8 à
    18 kg. Le message s'écrit dans le champ de la bande du bas, à la place de « Rechercher », sans loupe, comme
    l'annonce de Loisirs ; il s'efface au toucher. Je le code ainsi pour tous les messages discrets (Forme, Coachs,
    Boutique, Émissions, Web, Vidéo) ? Reco : oui.
