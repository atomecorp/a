// List Component Examples - VERSION CORRIGÉE
// Exemples complets du composant List avec différents types et configurations
//
// 🔧 CORRECTION APPLIQUÉE :
// - Remplacement de new A() par des éléments HTML standard
// - Élimination des divs positionnés absolument excessifs
// - Structure DOM propre et sémantique
// - Performance améliorée

console.log("🔧 CHARGEMENT DES EXEMPLES LISTES CORRIGÉS");

// 1. Liste Simple avec styling personnalisé
const simpleList = new List({
    attach: 'body',
    id: 'simple_list',
    x: 50, y: 50,
    width: 300, height: 200,
    type: 'simple',
    items: [
        { id: 1, text: 'Premier élément' },
        { id: 2, text: 'Deuxième élément' },
        { id: 3, text: 'Troisième élément' },
        { id: 4, text: 'Quatrième élément' }
    ],
    searchable: true,
    selectable: true,
    styling: {
        backgroundColor: '#f8f9fa',
        borderRadius: 8,
        border: '1px solid #dee2e6',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        itemStyling: {
            padding: '12px 16px',
            borderBottom: '1px solid #e9ecef',
            backgroundColor: '#ffffff',
            transition: 'all 0.2s ease',
            ':hover': {
                backgroundColor: '#e3f2fd',
                transform: 'translateX(4px)'
            },
            ':selected': {
                backgroundColor: '#1976d2',
                color: '#ffffff'
            }
        }
    },
    callbacks: {
        onItemClick: (item, id, event) => {
            console.log(`Simple List - Clicked: ${item.text} (ID: ${id})`);
        },
        onSelectionChange: (selectedItems) => {
            console.log('Simple List - Selection:', selectedItems);
        }
    }
});

// 2. Liste avec Icônes (Contact List)
const iconList = new List({
    attach: 'body',
    id: 'icon_list',
    x: 400, y: 50,
    width: 350, height: 300,
    type: 'icon',
    items: [
        { 
            id: 1, 
            text: 'Jean Dupont', 
            icon: '👤',
            subtext: 'Développeur Frontend',
            data: { email: 'jean@example.com', phone: '+33 6 12 34 56 78' }
        },
        { 
            id: 2, 
            text: 'Marie Martin', 
            icon: '👩‍💼',
            subtext: 'Chef de Projet',
            data: { email: 'marie@example.com', phone: '+33 6 87 65 43 21' }
        },
        { 
            id: 3, 
            text: 'Pierre Durand', 
            icon: '👨‍💻',
            subtext: 'Développeur Backend',
            data: { email: 'pierre@example.com', phone: '+33 6 11 22 33 44' }
        },
        { 
            id: 4, 
            text: 'Sophie Leroy', 
            icon: '🎨',
            subtext: 'UX/UI Designer',
            data: { email: 'sophie@example.com', phone: '+33 6 55 66 77 88' }
        }
    ],
    searchable: true,
    sortable: true,
    styling: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        border: '2px solid #e1e8ed',
        boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
        itemStyling: {
            padding: '16px',
            borderBottom: '1px solid #f1f3f4',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            transition: 'all 0.3s ease',
            ':hover': {
                backgroundColor: '#f8f9ff',
                borderLeft: '4px solid #4285f4'
            }
        },
        iconStyling: {
            fontSize: '24px',
            width: '40px',
            textAlign: 'center'
        },
        textStyling: {
            fontWeight: '600',
            color: '#202124'
        },
        subtextStyling: {
            fontSize: '14px',
            color: '#5f6368',
            marginTop: '4px'
        }
    },
    callbacks: {
        onItemClick: (item, id, event) => {
            console.log(`Contact clicked: ${item.text}`, item.data);
            // Simuler l'ouverture d'un profil
            alert(`Contacter ${item.text}\nEmail: ${item.data.email}\nTél: ${item.data.phone}`);
        },
        onItemHover: (item, id, event) => {
            console.log(`Hovering: ${item.text}`);
        }
    }
});

// 3. Liste TODO Interactive
const todoList = new List({
    attach: 'body',
    id: 'todo_list',
    x: 50, y: 300,
    width: 400, height: 350,
    type: 'todo',
    items: [
        { 
            id: 1, 
            text: 'Finir la documentation API', 
            completed: false,
            priority: 'high',
            dueDate: '2025-06-15'
        },
        { 
            id: 2, 
            text: 'Tester les nouveaux composants', 
            completed: true,
            priority: 'medium',
            dueDate: '2025-06-10'
        },
        { 
            id: 3, 
            text: 'Optimiser les performances', 
            completed: false,
            priority: 'low',
            dueDate: '2025-06-20'
        },
        { 
            id: 4, 
            text: 'Préparer la démo client', 
            completed: false,
            priority: 'high',
            dueDate: '2025-06-12'
        }
    ],
    sortable: true,
    searchable: true,
    styling: {
        backgroundColor: '#fafafa',
        borderRadius: 10,
        border: '1px solid #e0e0e0',
        boxShadow: '0 3px 6px rgba(0,0,0,0.1)',
        itemStyling: {
            padding: '14px 16px',
            borderBottom: '1px solid #eeeeee',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            backgroundColor: '#ffffff',
            transition: 'all 0.2s ease',
            ':hover': {
                backgroundColor: '#f5f5f5',
                transform: 'scale(1.02)'
            },
            ':completed': {
                backgroundColor: '#e8f5e8',
                textDecoration: 'line-through',
                opacity: 0.7
            }
        },
        checkboxStyling: {
            width: '20px',
            height: '20px',
            borderRadius: '4px',
            border: '2px solid #757575',
            cursor: 'pointer'
        },
        priorityStyling: {
            high: { borderLeft: '4px solid #f44336' },
            medium: { borderLeft: '4px solid #ff9800' },
            low: { borderLeft: '4px solid #4caf50' }
        }
    },
    callbacks: {
        onItemToggle: (item, id, completed) => {
            console.log(`TODO ${completed ? 'completed' : 'uncompleted'}: ${item.text}`);
        },
        onItemClick: (item, id, event) => {
            // Afficher les détails de la tâche
            const details = `Tâche: ${item.text}\nPriorité: ${item.priority}\nÉchéance: ${item.dueDate}\nStatut: ${item.completed ? 'Terminée' : 'En cours'}`;
            alert(details);
        }
    }
});

// 4. Liste avec Avatar (Équipe)
const avatarList = new List({
    attach: 'body',
    id: 'avatar_list',
    x: 500, y: 300,
    width: 320, height: 280,
    type: 'avatar',
    items: [
        { 
            id: 1, 
            text: 'Alice Johnson', 
            avatar: 'https://i.pravatar.cc/150?img=1',
            subtext: 'Lead Developer',
            status: 'online',
            data: { role: 'Senior', experience: '5 ans' }
        },
        { 
            id: 2, 
            text: 'Bob Smith', 
            avatar: 'https://i.pravatar.cc/150?img=2',
            subtext: 'Product Manager',
            status: 'away',
            data: { role: 'Manager', experience: '8 ans' }
        },
        { 
            id: 3, 
            text: 'Carol Wilson', 
            avatar: 'https://i.pravatar.cc/150?img=3',
            subtext: 'UX Designer',
            status: 'busy',
            data: { role: 'Designer', experience: '3 ans' }
        },
        { 
            id: 4, 
            text: 'David Brown', 
            avatar: 'https://i.pravatar.cc/150?img=4',
            subtext: 'DevOps Engineer',
            status: 'offline',
            data: { role: 'Engineer', experience: '6 ans' }
        }
    ],
    searchable: true,
    styling: {
        backgroundColor: '#ffffff',
        borderRadius: 15,
        border: '1px solid #e3e8ef',
        boxShadow: '0 5px 15px rgba(0,0,0,0.08)',
        itemStyling: {
            padding: '16px 20px',
            borderBottom: '1px solid #f6f8fa',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            transition: 'all 0.3s ease',
            position: 'relative',
            ':hover': {
                backgroundColor: '#f8fafc',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }
        },
        avatarStyling: {
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            border: '2px solid #e1e8ed',
            objectFit: 'cover'
        },
        statusStyling: {
            online: { borderColor: '#34d399' },
            away: { borderColor: '#fbbf24' },
            busy: { borderColor: '#f87171' },
            offline: { borderColor: '#9ca3af' }
        },
        textStyling: {
            fontWeight: '600',
            fontSize: '16px',
            color: '#1f2937'
        },
        subtextStyling: {
            fontSize: '14px',
            color: '#6b7280',
            marginTop: '2px'
        }
    },
    callbacks: {
        onItemClick: (item, id, event) => {
            console.log(`Team member clicked: ${item.text} (${item.status})`);
            const profile = `Membre: ${item.text}\nRôle: ${item.subtext}\nStatut: ${item.status}\nExpérience: ${item.data.experience}`;
            alert(profile);
        }
    }
});

// Démonstration des méthodes dynamiques
setTimeout(() => {
    console.log("\n=== DÉMONSTRATION DES MÉTHODES DYNAMIQUES ===");
    
    // Ajouter un élément à la liste simple
    simpleList.addItem({ id: 5, text: 'Nouvel élément ajouté dynamiquement' });
    
    // Ajouter une nouvelle tâche TODO
    todoList.addItem({ 
        id: 5, 
        text: 'Nouvelle tâche urgente', 
        completed: false,
        priority: 'high',
        dueDate: '2025-06-11'
    });
    
    // Mettre à jour un contact
    iconList.updateItem(1, { 
        text: 'Jean Dupont (Mis à jour)', 
        subtext: 'Senior Frontend Developer',
        data: { email: 'jean.dupont@newcompany.com', phone: '+33 6 12 34 56 78' }
    });
    
    console.log("Éléments ajoutés et mis à jour !");
    
}, 3000);

// Test des filtres après 5 secondes
setTimeout(() => {
    console.log("\n=== TEST DES FILTRES ===");
    
    // Filtrer les tâches non terminées
    todoList.filter(item => !item.completed);
    console.log("Filtrage des tâches non terminées appliqué à la TODO list");
    
    // Recherche dans la liste de contacts
    iconList.search('Développeur');
    console.log("Recherche 'Développeur' appliquée à la liste de contacts");
    
}, 5000);

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    🔧 LISTS FIXED LOADED                    ║
║                                                              ║
║  ✅ Problem: Excessive div generation RESOLVED              ║
║  ✅ Structure: Standard HTML div elements                   ║
║  ✅ Performance: Optimized rendering                        ║
║  ✅ Features: All original functionality preserved          ║
║                                                              ║
║  🎯 4 example lists created successfully                    ║
║  🎮 Interactive demos running automatically                 ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
console.log("✅ Tous les exemples de listes ont été créés avec succès !");
console.log("📝 4 types de listes différents sont maintenant visibles");
console.log("🔄 Des démonstrations dynamiques vont s'exécuter dans quelques secondes...");
