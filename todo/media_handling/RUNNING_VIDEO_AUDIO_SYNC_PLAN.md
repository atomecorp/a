# Running Video Audio Sync Plan

## Objectif

Unifier la lecture audio MTraX pour que toute source sonore suive le meme flux, qu'elle vienne d'un fichier audio pur ou d'une video importee.

Une video importee doit etre representee comme deux ressources synchronisees :

- une ressource video pour l'image ;
- une ressource audio traitee comme une bande son standard ;
- un lien de synchronisation explicite entre les deux.

Le moteur audio AUv3 ne doit plus avoir a deviner si le son vient d'un `.m4a`, d'un `.wav`, d'un `.m4v` ou d'un `.mp4`. Il doit recevoir une source audio, une position, une duree, un gain et un ordre de transport.

## Etat Actuel

- [x] Le scrub audio pur fonctionne en AUv3.
- [x] La lecture audio pure fonctionne en AUv3 apres stabilisation du chargement natif.
- [x] Les images importees s'affichent de nouveau en AUv3.
- [x] La route AUv3 considere maintenant une video comme source audio jouable si aucun clip audio derive n'existe.
- [x] Le modele d'import video cree maintenant une piste video et une piste audio derivee liee.
- [ ] Les commandes `play` / `stop` AUv3 ne sont pas encore scopees par source, clip ou session.

## Principe Cible

1. Importer une video cree une entite video et une entite audio liee.
2. La piste video pilote uniquement l'image.
3. La piste audio derivee passe par le meme workflow que les fichiers audio purs.
4. Le transport pilote les deux pistes avec un playhead commun.
5. Split, trim, move, duplicate et delete gardent les deux clips coherents.
6. AUv3 route tout l'audio par le moteur natif, pas par WebKit.

## Invariants Techniques

- Un ordre de lecture audio doit etre associe a une source identifiable.
- Un `stop` audio ne doit pas couper une autre source chargee.
- Le scrub et le play doivent utiliser la meme resolution de source et la meme position.
- Une video ne doit pas dependre du son de l'element `<video>` pour la sortie AUv3.
- Un import video doit conserver les metadonnees necessaires pour regenerer ou retrouver l'audio derive.
- Si une source audio ne peut pas etre resolue, l'erreur doit etre explicite.

## Plan D'Execution

### Phase 1 - Cartographie Du Flux Actuel

- [x] Identifier tous les chemins d'import media : image, audio, video.
- [x] Identifier ou les clips video sont crees dans le modele projet.
- [x] Identifier ou les clips audio purs sont crees dans le modele projet.
- [x] Identifier les champs existants : `kind`, `media_url`, `file_path`, `source`, `trackId`, `group_timeline`.
- [x] Documenter les differences actuelles entre audio pur et audio video.

Livrable : `timeline/import_media_timeline.js` cree le snapshot initial, `timeline/group_timeline_load_runtime.js` hydrate les clips, `media/element_runtime.js` resout les sources et durees, `audio/hmtracks_native_playback_runtime.js` pilote la route AUv3. La divergence principale etait que l'audio pur etait vu comme `audio`, alors que la video etait filtree hors de la route AUv3 de lecture audio.

### Phase 2 - Modele Source Audio Unifie

- [x] Definir une structure unique pour une source audio jouable.
- [x] Ajouter le lien entre clip video et clip audio derive.
- [x] Decider si l'audio derive est un clip visible separe ou un sous-clip affiche sous la video.
- [x] Garantir que les operations timeline peuvent retrouver les deux clips lies.

Livrable : un import video cree `video` sur piste Video et `audio` sur piste Audio avec `audio_source_role: video_audio`, `linked_video_clip_id`, `linked_audio_clip_id` et `sync_group_id`.

### Phase 3 - Import Video En Deux Ressources

- [x] A l'import video, creer la ressource video.
- [x] Creer ou referencer la ressource audio derivee.
- [x] Placer les deux clips sur des pistes synchronisees.
- [x] Enregistrer le lien parent/enfant ou group link.
- [x] Afficher deux pistes ou une representation claire video + audio.

Livrable attendu : une video importee montre l'image et une bande audio synchronisee.

### Phase 4 - Transport Et Synchronisation

- [x] Faire passer l'audio video par le meme moteur que l'audio pur.
- [ ] Supprimer les `play` / `stop` globaux non scopes.
- [x] Introduire une cle de lecture stable : session, clip, source.
- [x] Synchroniser playhead, offset, trim et boucle pour video et audio derive.
- [x] Verifier que scrub et play demarrent au meme offset.

Livrable attendu : audio pur et audio de video suivent exactement le meme transport.

### Phase 5 - Operations Timeline

- [x] Move : deplacer video et audio lie ensemble.
- [x] Trim : appliquer les memes bornes temporelles.
- [x] Split : couper les deux ressources au meme temps.
- [x] Delete : proposer ou appliquer la suppression coherente du couple.
- [ ] Duplicate : dupliquer le lien sans collision d'identifiants.

Livrable : move, crop, split et delete etendent maintenant leur cible aux clips lies par `linked_*` ou `sync_group_id`. Duplicate reste a durcir si le workflow expose une duplication directe de clips lies.

### Phase 6 - AUv3 Native Audio

- [x] Garder le decodage natif AUv3 pour toute source audio.
- [x] Rendre le chargement idempotent par source/session.
- [ ] Scoper `setPlayActive` ou son remplacement par source.
- [x] Eviter qu'un warmup video envoie un stop audio global.
- [ ] Garder des logs audio utiles mais non verbeux.

Livrable attendu : aucune source audio ne coupe une autre source par effet de bord.

### Phase 7 - Nettoyage Des Logs Et Diagnostics

- [ ] Reduire les logs `playback state` repetitifs.
- [ ] Garder les logs de decision : load, decoded, play, stop, source key.
- [ ] Retirer les traces temporaires une fois la cause confirmee.
- [ ] Conserver uniquement les logs utiles en mode diagnostic.

Livrable attendu : logs lisibles pour valider sans polluer la console.

### Phase 8 - Tests Et Validation

- [ ] Test import audio pur AUv3 : scrub + play.
- [ ] Test import video AUv3 : image + audio en play.
- [ ] Test scrub video AUv3 : image + audio synchronises.
- [ ] Test fermeture/reouverture du panneau MTraX.
- [ ] Test import successif audio puis video.
- [ ] Test import successif video puis audio.
- [ ] Test iOS app hors AUv3 pour verifier absence de regression.
- [ ] Test desktop/local si applicable.

Livrable attendu : matrice de validation renseignee dans ce fichier.

## Risques

- Le modele projet peut deja contenir des videos sans audio derive explicite.
- Certaines operations timeline peuvent supposer qu'un media est un seul clip.
- Le rendu visuel video peut encore piloter du son indirectement via WebKit.
- AUv3 impose des contraintes strictes : tout audio fiable doit passer par l'audio unit.
- Les changements doivent eviter les chemins implicites et les stops globaux.

## Journal D'Avancement

### 2026-04-30

- [x] Decision technique validee : separer image video et audio derive, puis synchroniser.
- [x] Fichier de suivi cree a la racine du projet.
- [x] Cartographie du flux actuel faite.
- [x] Import video transforme en deux clips lies : video + audio derive.
- [x] Chargeur timeline transmet le role `video_audio` au resolveur media.
- [x] Resolveur media conserve une source audio derivee de video meme quand le navigateur ne sait pas decoder le conteneur pour metadata audio.
- [x] Route AUv3 de lecture audio prend `audio` et `video` comme sources audibles, avec priorite aux clips audio derives.
- [x] Move/crop/split/delete propagent l'operation aux clips lies.
- [x] Verification syntaxe initiale passee : `npm run check:syntax`.
- [x] Verification anti-regression finale passee : `npm run check:syntax` et `npm run check:no-fallbacks`.

## Definition De Termine

La tache sera consideree terminee quand :

- importer une video cree une representation audio synchronisee ;
- l'audio video et l'audio pur utilisent le meme flux de lecture ;
- le scrub et le play donnent le meme resultat temporel ;
- les operations timeline gardent video et audio lies ;
- les tests AUv3 audio, video et import successif passent ;
- les logs temporaires sont retires ou limites a un mode diagnostic.
