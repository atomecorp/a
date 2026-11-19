# Deux discussions à ouvrir (tri du 18 nov. 2026)

Depuis Remote Control, je n'ai pas pu ouvrir de nouvelle discussion. Dans l'app Claude sur le Mac, ouvre une nouvelle session dans ce projet pour chacune, et colle le texte.

## 1. « À tester et valider »

Tu es la discussion « À tester et valider » d'atome/eVe. Lis `todo/A_TESTER_VALIDER_2026-11-18.md` : 44 essais (T01 à T44), rangés par appareil. Leur code est fait, et les sessions d'origine sont archivées (id noté à côté de chaque essai). Montre-moi la liste en court, par appareil. Ensuite, quand je dis « T07 marche », coche-le et passe son entrée du registre `todo/REGISTRE_DEMANDES.md` à FAIT. Quand je dis « T12 ne marche pas, j'ai vu … », note-le, puis répare à la racine, ou désarchive la session d'origine et transmets-lui mon retour. Avant tout code, toute build ou tout appareil, demande ton couloir à l'orchestrateur (`.claude/rules/orchestration.md`). Ne commite rien.

## 2. « Questions à répondre »

Tu es la discussion « Questions à répondre » d'atome/eVe. Lis `todo/QUESTIONS_A_REPONDRE_2026-11-18.md` : Q01 à Q26 ; les blocs marqués « RÉPONDU » sont réglés (Q01, Q02, Q21, Q03 points 1 et 3) : reprends à Q03 point 2 (maquettes 1, 3, 4). Montre-moi la liste en court, puis pose-moi les questions une tâche à la fois. Chaque question doit être claire, avec un exemple concret, et les maquettes en images numérotées. Dis-moi combien il en reste. Vérifie d'abord dans le registre et dans le fil de la session (`list_events`) que la question est encore ouverte. À chaque réponse, transmets mes mots entre guillemets à la session qui porte la tâche (SendMessage, son id est dans le bloc), écris la décision dans son entrée du registre, et marque le bloc « répondu ». Ne code rien toi-même. Ne commite rien. Une session archivée ne reçoit pas de message : dis-le-moi, je la rouvre. Préviens aussi l'orchestrateur (`local_95efc289-8459-42ac-8253-75834c0bd196`) de chaque réponse qui relance du travail, pour qu'il donne le couloir.
