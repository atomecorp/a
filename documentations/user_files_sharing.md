# User Files & Sharing System

Ce document décrit le système de gestion des fichiers utilisateur et de partage dans Squirrel.

## Architecture

### Composants

1. **`server/userFiles.js`** - Gestion de la propriété des fichiers
2. **`server/sharing.js`** - Système de partage (projets, atomes, fichiers)
3. **Routes intégrées dans `server/server.js`**

## Fichiers Utilisateur

### Isolation par utilisateur

Quand un utilisateur se connecte :

- Il ne voit que ses propres fichiers
- Les fichiers partagés avec lui sont accessibles
- Les fichiers publics sont visibles par tous

### Routes API

#### `GET /api/files/my-files`

Retourne les fichiers dont l'utilisateur est propriétaire.

```javascript
// Requête
fetch('/api/files/my-files', {
    headers: {
        'Authorization': 'Bearer <token>'
    }
});

// Réponse
{
    "success": true,
    "data": [
        {
            "name": "document.pdf",
            "owner_id": "user_123",
            "uploaded_at": "2024-01-15T10:30:00Z",
            "is_public": false,
            "shared_with": []
        }
    ],
    "count": 1
}
```

#### `GET /api/files/accessible`

Retourne tous les fichiers accessibles (propriétaire + partagés).

```javascript
// Réponse
{
    "success": true,
    "data": [
        {
            "name": "my_file.txt",
            "access": "owner",
            ...
        },
        {
            "name": "shared_doc.pdf",
            "access": "read",
            ...
        }
    ]
}
```

#### `POST /api/files/share`

Partage un fichier avec un autre utilisateur.

```javascript
fetch('/api/files/share', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer <token>'
    },
    body: JSON.stringify({
        fileName: "document.pdf",
        targetUserId: "user_456",
        permission: "read" // "read" | "write"
    })
});
```

#### `POST /api/files/unshare`

Révoque le partage d'un fichier.

```javascript
fetch('/api/files/unshare', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer <token>'
    },
    body: JSON.stringify({
        fileName: "document.pdf",
        targetUserId: "user_456"
    })
});
```

#### `POST /api/files/visibility`

Rend un fichier public ou privé.

```javascript
fetch('/api/files/visibility', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer <token>'
    },
    body: JSON.stringify({
        fileName: "document.pdf",
        isPublic: true
    })
});
```

#### `GET /api/files/stats`

Statistiques sur les fichiers (admin).

## Système de Partage

### Niveaux de permission

| Niveau | Valeur | Description |
|--------|--------|-------------|
| NONE   | 0      | Aucun accès |
| READ   | 1      | Lecture seule |
| WRITE  | 2      | Lecture et écriture |
| ADMIN  | 3      | Contrôle total, peut re-partager |

### Types de ressources

- `project` - Projets Squirrel
- `atome` - Atomes individuels
- `file` - Fichiers uploadés

### Routes API

#### `POST /api/share/create`

Crée un partage.

```javascript
fetch('/api/share/create', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer <token>'
    },
    body: JSON.stringify({
        resource_type: "project",
        resource_id: "project_123",
        target_user_id: "user_456",
        permission: "write" // "read" | "write" | "admin"
    })
});

// Réponse
{
    "success": true,
    "data": {
        "id": "share_1705312200000_abc123",
        "owner_id": "user_123",
        "resource_type": "project",
        "resource_id": "project_123",
        "target_user_id": "user_456",
        "permission": 2,
        "created_at": "2024-01-15T10:30:00Z",
        "expires_at": null
    }
}
```

#### `DELETE /api/share/:shareId`

Révoque un partage.

```javascript
fetch('/api/share/share_123', {
    method: 'DELETE',
    headers: {
        'Authorization': 'Bearer <token>'
    }
});
```

#### `GET /api/share/my-shares`

Liste les ressources que j'ai partagées.

#### `GET /api/share/shared-with-me`

Liste les ressources partagées avec moi.

## Upload avec propriété

Quand un fichier est uploadé via `/api/uploads`, la propriété est automatiquement enregistrée :

```javascript
fetch('/api/uploads', {
    method: 'POST',
    headers: {
        'X-Filename': 'document.pdf',
        'Authorization': 'Bearer <token>'  // Optionnel
    },
    body: fileBlob
});

// Réponse
{
    "success": true,
    "file": "document.pdf",
    "owner": "user_123"  // ou "anonymous" si non connecté
}
```

## Métadonnées

Les métadonnées des fichiers sont stockées dans `.file_metadata.json` dans le dossier uploads :

```json
{
    "document.pdf": {
        "owner_id": "user_123",
        "uploaded_at": "2024-01-15T10:30:00Z",
        "original_name": "Document Final.pdf",
        "mime_type": null,
        "size": 1024000,
        "shared_with": [
            {
                "user_id": "user_456",
                "permission": "read",
                "shared_at": "2024-01-15T11:00:00Z"
            }
        ],
        "is_public": false
    }
}
```

## Test interactif

Utilisez la page de test pour valider le système :

```
http://localhost:3001/application/examples/socket_test
```

Cette page propose des sections pour :

1. 📁 **User Files & Sharing** - Tester les fichiers utilisateur
2. 🤝 **Sharing** - Créer et gérer les partages

## Sécurité

- Seul le propriétaire peut partager/repartager ses fichiers
- Les partages peuvent avoir une date d'expiration
- Les tokens JWT sont validés pour chaque requête
- Les fichiers "legacy" (sans métadonnées) restent accessibles à tous

## Exemple d'utilisation

```javascript
// 1. Se connecter
const loginResp = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'user@example.com', password: 'secret' })
});
const { token } = await loginResp.json();

// 2. Uploader un fichier
await fetch('/api/uploads', {
    method: 'POST',
    headers: {
        'X-Filename': 'my_doc.pdf',
        'Authorization': `Bearer ${token}`
    },
    body: pdfBlob
});

// 3. Partager avec un collègue
await fetch('/api/files/share', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
        fileName: 'my_doc.pdf',
        targetUserId: 'colleague_id',
        permission: 'read'
    })
});

// 4. Lister mes fichiers
const myFiles = await fetch('/api/files/my-files', {
    headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json());

console.log(myFiles.data);
```

## Prochaines étapes

- [ ] Persistance en base de données (actuellement en mémoire)
- [ ] Quotas par utilisateur
- [ ] Notifications lors des partages
- [ ] Historique des accès
- [ ] Partage par lien (sans compte)
