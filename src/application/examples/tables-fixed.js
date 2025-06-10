// Table Component Examples - Version Corrigée
// Exemples compatibles avec l'API réelle du composant Table

console.log("=== TABLE EXAMPLES (CORRECTED) ===");

// 1. Tableau d'Employés - Configuration simplifiée
const employeeTable = new Table({
    attach: 'body',
    id: 'employee_table',
    x: 50, y: 50,
    width: 800, height: 400,
    columns: [
        { 
            key: 'id', 
            title: 'ID', 
            width: 60, 
            sortable: true
        },
        { 
            key: 'name', 
            title: 'Nom Complet', 
            width: 180, 
            sortable: true,
            editable: true
        },
        { 
            key: 'position', 
            title: 'Poste', 
            width: 150, 
            sortable: true,
            editable: true
        },
        { 
            key: 'department', 
            title: 'Département', 
            width: 120, 
            sortable: true,
            editable: true
        },
        { 
            key: 'salary', 
            title: 'Salaire', 
            width: 100, 
            sortable: true,
            render: (value) => `${value.toLocaleString('fr-FR')} €`
        },
        { 
            key: 'status', 
            title: 'Statut', 
            width: 100, 
            sortable: true,
            render: (value) => {
                const colors = {
                    'Actif': '#4caf50',
                    'Congé': '#ff9800',
                    'Inactif': '#f44336'
                };
                return `<span style="background: ${colors[value] || '#757575'}; color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px;">${value}</span>`;
            }
        }
    ],
    data: [
        { 
            id: 1, 
            name: 'Jean Dupont', 
            position: 'Développeur', 
            department: 'IT', 
            salary: 45000, 
            status: 'Actif' 
        },
        { 
            id: 2, 
            name: 'Marie Martin', 
            position: 'Manager', 
            department: 'IT', 
            salary: 65000, 
            status: 'Actif' 
        },
        { 
            id: 3, 
            name: 'Pierre Durand', 
            position: 'Designer', 
            department: 'Marketing', 
            salary: 42000, 
            status: 'Congé' 
        },
        { 
            id: 4, 
            name: 'Sophie Leroy', 
            position: 'Analyst', 
            department: 'Finance', 
            salary: 48000, 
            status: 'Actif' 
        },
        { 
            id: 5, 
            name: 'Thomas Bernard', 
            position: 'Tester', 
            department: 'IT', 
            salary: 38000, 
            status: 'Actif' 
        },
        { 
            id: 6, 
            name: 'Julie Moreau', 
            position: 'Manager', 
            department: 'HR', 
            salary: 58000, 
            status: 'Inactif' 
        }
    ],
    // Configuration simple selon l'API réelle
    sortable: true,
    searchable: true,
    selectable: true,
    multiSelect: true,
    editable: true,
    pagination: {
        enabled: true,
        pageSize: 4
    },
    style: {
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e1e8ed',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
    },
    headerStyle: {
        backgroundColor: '#f8f9fa',
        fontWeight: 'bold',
        color: '#495057'
    },
    callbacks: {
        onRowClick: (row, index, event) => {
            console.log(`Employee clicked: ${row.name} (${row.position})`);
        },
        onCellEdit: (row, column, oldValue, newValue) => {
            console.log(`Cell edited - ${column}: ${oldValue} → ${newValue}`);
        },
        onSelectionChange: (selectedRows) => {
            console.log(`Selected employees: ${selectedRows.length}`);
        },
        onSort: (column, direction) => {
            console.log(`Sorted by ${column} (${direction})`);
        },
        onFilter: (filteredData) => {
            console.log(`Filtered results: ${filteredData.length} employees`);
        }
    }
});

// 2. Tableau de Ventes - Configuration simplifiée
const salesTable = new Table({
    attach: 'body',
    id: 'sales_table',
    x: 900, y: 50,
    width: 700, height: 350,
    columns: [
        { 
            key: 'product', 
            title: 'Produit', 
            width: 150, 
            sortable: true
        },
        { 
            key: 'category', 
            title: 'Catégorie', 
            width: 120, 
            sortable: true
        },
        { 
            key: 'price', 
            title: 'Prix', 
            width: 80, 
            sortable: true,
            render: (value) => `${value} €`
        },
        { 
            key: 'quantity', 
            title: 'Quantité', 
            width: 80, 
            sortable: true,
            editable: true
        },
        { 
            key: 'total', 
            title: 'Total', 
            width: 100, 
            sortable: false,
            render: (value, row) => `${(row.price * row.quantity).toLocaleString('fr-FR')} €`
        },
        { 
            key: 'performance', 
            title: 'Performance', 
            width: 120, 
            sortable: false,
            render: (value, row) => {
                const percentage = Math.min(100, (row.quantity / 50) * 100);
                const color = percentage > 75 ? '#4caf50' : percentage > 50 ? '#ff9800' : '#f44336';
                return `
                    <div style="background: #f0f0f0; border-radius: 10px; overflow: hidden; height: 20px;">
                        <div style="background: ${color}; width: ${percentage}%; height: 100%; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px;">
                            ${Math.round(percentage)}%
                        </div>
                    </div>
                `;
            }
        }
    ],
    data: [
        { 
            product: 'iPhone 15', 
            category: 'Électronique', 
            price: 999, 
            quantity: 25
        },
        { 
            product: 'MacBook Pro', 
            category: 'Électronique', 
            price: 2499, 
            quantity: 12
        },
        { 
            product: 'Nike Air Max', 
            category: 'Sport', 
            price: 149, 
            quantity: 45
        },
        { 
            product: 'The Great Gatsby', 
            category: 'Livres', 
            price: 15, 
            quantity: 8
        },
        { 
            product: 'Samsung TV 55"', 
            category: 'Électronique', 
            price: 899, 
            quantity: 18
        },
        { 
            product: 'Adidas Hoodie', 
            category: 'Vêtements', 
            price: 79, 
            quantity: 32
        }
    ],
    sortable: true,
    searchable: true,
    selectable: true,
    multiSelect: true,
    editable: true,
    pagination: {
        enabled: true,
        pageSize: 3
    },
    style: {
        backgroundColor: '#ffffff',
        borderRadius: '10px',
        border: '1px solid #ddd',
        boxShadow: '0 3px 8px rgba(0,0,0,0.08)'
    },
    headerStyle: {
        backgroundColor: '#2c3e50',
        color: '#ffffff',
        fontWeight: 'bold'
    },
    callbacks: {
        onRowClick: (row, index, event) => {
            const revenue = row.price * row.quantity;
            console.log(`Produit: ${row.product} - Revenus: ${revenue.toLocaleString('fr-FR')} €`);
        },
        onCellEdit: (row, column, oldValue, newValue) => {
            if (column === 'quantity') {
                const newRevenue = row.price * newValue;
                console.log(`Quantité mise à jour. Nouveau revenu: ${newRevenue.toLocaleString('fr-FR')} €`);
            }
        }
    }
});

// 3. Tableau Compact de Projets - Configuration simplifiée
const projectTable = new Table({
    attach: 'body',
    id: 'project_table',
    x: 50, y: 500,
    width: 600, height: 250,
    columns: [
        { 
            key: 'project', 
            title: 'Projet', 
            width: 180, 
            sortable: true
        },
        { 
            key: 'client', 
            title: 'Client', 
            width: 120, 
            sortable: true
        },
        { 
            key: 'progress', 
            title: 'Avancement', 
            width: 120, 
            sortable: true,
            render: (value) => {
                const color = value > 75 ? '#4caf50' : value > 50 ? '#2196f3' : value > 25 ? '#ff9800' : '#f44336';
                return `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="background: #e0e0e0; border-radius: 8px; overflow: hidden; height: 16px; flex: 1;">
                            <div style="background: ${color}; width: ${value}%; height: 100%; transition: width 0.3s ease;"></div>
                        </div>
                        <span style="font-size: 12px; font-weight: bold; color: ${color};">${value}%</span>
                    </div>
                `;
            }
        },
        { 
            key: 'priority', 
            title: 'Priorité', 
            width: 80, 
            sortable: true,
            render: (value) => {
                const colors = {
                    'Haute': '#e53e3e',
                    'Moyenne': '#dd6b20',
                    'Basse': '#38a169'
                };
                return `<span style="background: ${colors[value]}; color: white; padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: bold;">${value}</span>`;
            }
        }
    ],
    data: [
        { 
            project: 'Site E-commerce', 
            client: 'TechCorp', 
            progress: 85, 
            priority: 'Haute' 
        },
        { 
            project: 'App Mobile iOS', 
            client: 'StartupXYZ', 
            progress: 45, 
            priority: 'Moyenne' 
        },
        { 
            project: 'Dashboard Analytics', 
            client: 'DataInc', 
            progress: 92, 
            priority: 'Haute' 
        },
        { 
            project: 'Site Vitrine', 
            client: 'LocalBiz', 
            progress: 30, 
            priority: 'Basse' 
        },
        { 
            project: 'API REST', 
            client: 'CloudServ', 
            progress: 67, 
            priority: 'Moyenne' 
        }
    ],
    sortable: true,
    searchable: true,
    selectable: true,
    pagination: {
        enabled: false
    },
    style: {
        backgroundColor: '#fafafa',
        borderRadius: '8px',
        border: '1px solid #e0e0e0'
    },
    headerStyle: {
        backgroundColor: '#37474f',
        color: '#ffffff',
        fontSize: '14px'
    },
    callbacks: {
        onRowClick: (row, index, event) => {
            console.log(`Projet sélectionné: ${row.project} (${row.progress}% terminé)`);
            alert(`Projet: ${row.project}\nClient: ${row.client}\nAvancement: ${row.progress}%\nPriorité: ${row.priority}`);
        }
    }
});

// Démonstrations dynamiques avec gestion d'erreurs
setTimeout(() => {
    console.log("\n=== DÉMONSTRATIONS DYNAMIQUES ===");
    
    try {
        // Ajouter un nouvel employé
        employeeTable.addRow({
            id: 7,
            name: 'Lucas Petit',
            position: 'Développeur',
            department: 'IT',
            salary: 41000,
            status: 'Actif'
        });
        
        // Ajouter une nouvelle vente
        salesTable.addRow({
            product: 'AirPods Pro',
            category: 'Électronique',
            price: 279,
            quantity: 28
        });
        
        // Mettre à jour un projet
        projectTable.updateRow(1, { progress: 55 });
        
        console.log("✅ Nouvelles données ajoutées aux tableaux !");
    } catch (error) {
        console.error("Erreur lors de l'ajout de données:", error);
    }
    
}, 3000);

// Test des exports et filtres avec gestion d'erreurs
setTimeout(() => {
    console.log("\n=== TEST DES EXPORTS ET FILTRES ===");
    
    try {
        // Filtrer les employés actifs
        employeeTable.filter(row => row.status === 'Actif');
        console.log("Filtrage des employés actifs appliqué");
        
        // Recherche dans les ventes
        salesTable.search('Électronique');
        console.log("Recherche 'Électronique' appliquée aux ventes");
        
        // Trier les projets par priorité
        projectTable.sort('priority', 'desc');
        console.log("Tri par priorité appliqué aux projets");
        
    } catch (error) {
        console.error("Erreur lors des opérations de filtre/tri:", error);
    }
    
}, 5000);

// Simulation d'export de données
setTimeout(() => {
    console.log("\n=== SIMULATION D'EXPORT ===");
    
    try {
        // Simuler un export CSV des ventes
        const salesData = salesTable.getFilteredData();
        console.log(`Export simulé: ${salesData.length} ventes à exporter`);
        
        // Obtenir les employés sélectionnés
        const selectedEmployees = employeeTable.getSelectedRows();
        console.log(`Employés sélectionnés: ${selectedEmployees.length}`);
        
    } catch (error) {
        console.error("Erreur lors de l'export:", error);
    }
    
}, 7000);

console.log("✅ Exemples de tableaux corrigés créés avec succès !");
console.log("📊 3 tableaux avec configuration simplifiée :");
console.log("   1. Tableau d'employés - API standard");
console.log("   2. Tableau de ventes - Rendu personnalisé");
console.log("   3. Tableau compact de projets");
console.log("🔧 Configuration adaptée à l'API réelle du composant");
