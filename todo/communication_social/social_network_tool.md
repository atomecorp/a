# Tache - Social Network Tool

## Objectif

Creer un outil social permettant de suivre un user ou un contact et de recevoir des notifications sur ses nouvelles publications.

## Fonctionnalites attendues

1. Suivre un user (follow) depuis son profil ou sa fiche contact.
2. Ne plus suivre un user (unfollow).
3. Afficher un flux des publications des users suivis.
4. Recevoir une notification a chaque nouvelle publication d un user suivi.
5. Ouvrir directement la publication depuis la notification.

## Regles

1. Le follow fonctionne pour les users et les contacts resolves en user.
2. Une publication deja notifiee ne doit pas etre notifiee deux fois.
3. Les notifications doivent etre scopees par utilisateur connecte.
4. Le flux doit rester coherent apres refresh/reload.

## Donnees minimales

1. `follower_user_id`
2. `followed_user_id`
3. `publication_id`
4. `publication_author_id`
5. `publication_created_at`
6. `notification_status` (unread/read)

## Livrables

1. Tool `social.network` (nom runtime a valider selon catalogue).
2. UI pour follow/unfollow dans profil/contact.
3. UI feed des publications suivies.
4. Notifications de nouvelles publications avec ouverture directe.
5. Tests minimaux:
   - follow/unfollow
   - reception notification nouvelle publication
   - pas de duplication notification
   - persistance etat apres refresh.
