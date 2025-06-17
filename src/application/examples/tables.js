/**
 * 📊 EXEMPLE TABLE SEXY - CODE MINIMALISTE
 * Tableau professionnel avec styles modernes
 */

// 🎨 Tableau simple mais élégant
const sexyTable = new Table({
    id: "sexy-table",
    position: { x: 50, y: 50 },
    size: { width: 700, height: 400 },
    attach: "#view",
    
    // Colonnes avec style
    columns: [
        {
            id: "name",
            header: "👤 Nom",
            width: 180,
            sortable: true,
            style: { textAlign: "left", fontWeight: "500" }
        },
        {
            id: "role", 
            header: "💼 Rôle",
            width: 150,
            sortable: true,
            style: { textAlign: "center" }
        },
        {
            id: "status",
            header: "📊 Status", 
            width: 120,
            sortable: true,
            style: { textAlign: "center" }
        },
        {
            id: "score",
            header: "⭐ Score",
            width: 100,
            sortable: true,
            style: { textAlign: "right", fontWeight: "bold" }
        },
        {
            id: "actions",
            header: "🔧 Actions",
            width: 150,
            sortable: false,
            style: { textAlign: "center" }
        }
    ],
    
    // Données avec styles individuels
    rows: [
        {
            id: "user-1",
            cells: {
                name: { content: "Alice Martin", style: { color: "#2c3e50", fontWeight: "600" }},
                role: { content: "Designer", style: { color: "#8e44ad", backgroundColor: "#f4f0ff", borderRadius: "12px", padding: "4px 8px" }},
                status: { content: "🟢 Actif", style: { color: "#27ae60" }},
                score: { content: "95", style: { color: "#e74c3c", fontSize: "16px" }},
                actions: { content: "✏️ 🗑️ 👁️", style: { fontSize: "18px" }}
            }
        },
        {
            id: "user-2", 
            cells: {
                name: { content: "Bob Wilson", style: { color: "#2c3e50", fontWeight: "600" }},
                role: { content: "Dev", style: { color: "#3498db", backgroundColor: "#ebf5ff", borderRadius: "12px", padding: "4px 8px" }},
                status: { content: "🟡 Pause", style: { color: "#f39c12" }},
                score: { content: "87", style: { color: "#e74c3c", fontSize: "16px" }},
                actions: { content: "✏️ 🗑️ 👁️", style: { fontSize: "18px" }}
            }
        },
        {
            id: "user-3",
            cells: {
                name: { content: "Carol Davis", style: { color: "#2c3e50", fontWeight: "600" }},
                role: { content: "Manager", style: { color: "#e67e22", backgroundColor: "#fff7ed", borderRadius: "12px", padding: "4px 8px" }},
                status: { content: "🔴 Occupé", style: { color: "#e74c3c" }},
                score: { content: "92", style: { color: "#e74c3c", fontSize: "16px" }},
                actions: { content: "✏️ 🗑️ 👁️", style: { fontSize: "18px" }}
            }
        }
    ],
    
    // Styles sexy minimalistes
    styling: {
        cellPadding: 16,
        rowHeight: 50,
        
        // En-tête moderne
        headerStyle: {
            backgroundColor: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            background: "#2c3e50",
            color: "#ffffff",
            fontSize: "14px",
            fontWeight: "600",
            padding: "16px",
            textAlign: "center",
            borderBottom: "3px solid #3498db"
        },
        
        // Cellules élégantes
        cellStyle: {
            backgroundColor: "#ffffff", 
            color: "#2c3e50",
            fontSize: "14px",
            border: "none",
            borderBottom: "1px solid #ecf0f1",
            padding: "12px 16px",
            transition: "all 0.3s ease"
        },
        
        // Lignes alternées
        alternateRowStyle: {
            backgroundColor: "#f8f9fa"
        },
        
        // États interactifs
        states: {
            hover: {
                backgroundColor: "#e3f2fd",
                transform: "scale(1.01)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
            },
            selected: {
                backgroundColor: "#3498db",
                color: "#ffffff",
                transform: "scale(1.02)",
                boxShadow: "0 4px 12px rgba(52,152,219,0.3)"
            }
        }
    },
    
    // Options
    options: {
        sortable: true,
        selectable: true,
        multiSelect: true
    },
    
    // Callbacks minimalistes
    onCellClick: (cell, row, col) => {
        console.log(`💎 Sexy Table: Clicked ${cell.content} (${row}/${col})`);
    },
    
    onSort: (column, direction) => {
        console.log(`🔄 Sorted by ${column} ${direction}`);
    },
    
    debug: true
});

console.log('✨ Sexy Table créée ! Cliquez sur les en-têtes pour trier, sur les cellules pour sélectionner.');

// 🎮 Tableau Gaming/Dark Theme
const gamingTable = new Table({
    id: "gaming-table",
    position: { x: 800, y: 50 },
    size: { width: 500, height: 300 },
    attach: "#view",
    
    columns: [
        { id: "player", header: "🎮 Player", width: 120, sortable: true },
        { id: "level", header: "🏆 Level", width: 80, sortable: true },
        { id: "score", header: "💯 Score", width: 100, sortable: true },
        { id: "rank", header: "👑 Rank", width: 100, sortable: true }
    ],
    
    rows: [
        {
            id: "player-1",
            cells: {
                player: { content: "NoobMaster69", style: { color: "#00ff88", fontFamily: "monospace", fontWeight: "bold" }},
                level: { content: "42", style: { color: "#ff6b35", textAlign: "center" }},
                score: { content: "13,337", style: { color: "#ffd23f", textAlign: "right", fontWeight: "bold" }},
                rank: { content: "🥇 Master", style: { color: "#ffdf00", textAlign: "center" }}
            }
        },
        {
            id: "player-2",
            cells: {
                player: { content: "xX_Pro_Xx", style: { color: "#00ff88", fontFamily: "monospace", fontWeight: "bold" }},
                level: { content: "38", style: { color: "#ff6b35", textAlign: "center" }},
                score: { content: "9,001", style: { color: "#ffd23f", textAlign: "right", fontWeight: "bold" }},
                rank: { content: "🥈 Expert", style: { color: "#c0c0c0", textAlign: "center" }}
            }
        }
    ],
    
    styling: {
        cellPadding: 12,
        rowHeight: 45,
        headerStyle: {
            background: "linear-gradient(45deg, #1a1a2e, #16213e)",
            color: "#00ff88",
            fontSize: "12px",
            fontWeight: "bold",
            textTransform: "uppercase",
            letterSpacing: "1px",
            borderBottom: "2px solid #00ff88"
        },
        cellStyle: {
            backgroundColor: "#0f0f23",
            color: "#e0e6ed",
            fontSize: "13px",
            border: "1px solid #1a1a2e",
            fontFamily: "monospace"
        },
        alternateRowStyle: {
            backgroundColor: "#1a1a2e"
        },
        states: {
            hover: {
                backgroundColor: "#16213e",
                boxShadow: "0 0 10px rgba(0,255,136,0.3)"
            },
            selected: {
                backgroundColor: "#00ff88",
                color: "#0f0f23",
                fontWeight: "bold"
            }
        }
    },
    
    onCellClick: (cell, row, col) => {
        console.log(`🎮 Gaming Table: ${cell.content} clicked!`);
    }
});

// 📊 Tableau Financial/Professional
const financialTable = new Table({
    id: "financial-table",
    position: { x: 50, y: 500 },
    size: { width: 600, height: 250 },
    attach: "#view",
    
    columns: [
        { id: "symbol", header: "Symbol", width: 80, sortable: true },
        { id: "company", header: "Company", width: 160, sortable: true },
        { id: "price", header: "Price", width: 90, sortable: true },
        { id: "change", header: "Change", width: 80, sortable: true },
        { id: "volume", header: "Volume", width: 100, sortable: true }
    ],
    
    rows: [
        {
            id: "stock-1",
            cells: {
                symbol: { content: "AAPL", style: { fontFamily: "monospace", fontWeight: "bold", color: "#1d1d1f" }},
                company: { content: "Apple Inc.", style: { color: "#333" }},
                price: { content: "$150.25", style: { textAlign: "right", fontWeight: "600", color: "#1d1d1f" }},
                change: { content: "+2.5%", style: { color: "#28a745", textAlign: "right", fontWeight: "bold" }},
                volume: { content: "45.2M", style: { textAlign: "right", color: "#6c757d" }}
            }
        },
        {
            id: "stock-2",
            cells: {
                symbol: { content: "GOOGL", style: { fontFamily: "monospace", fontWeight: "bold", color: "#1d1d1f" }},
                company: { content: "Alphabet Inc.", style: { color: "#333" }},
                price: { content: "$2,750.80", style: { textAlign: "right", fontWeight: "600", color: "#1d1d1f" }},
                change: { content: "-1.2%", style: { color: "#dc3545", textAlign: "right", fontWeight: "bold" }},
                volume: { content: "1.8M", style: { textAlign: "right", color: "#6c757d" }}
            }
        }
    ],
    
    styling: {
        cellPadding: 14,
        rowHeight: 48,
        headerStyle: {
            background: "linear-gradient(135deg, #f8f9fa, #e9ecef)",
            color: "#495057",
            fontSize: "13px",
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            borderBottom: "2px solid #dee2e6"
        },
        cellStyle: {
            backgroundColor: "#ffffff",
            color: "#212529",
            fontSize: "14px",
            border: "1px solid #e9ecef",
            fontFamily: "system-ui"
        },
        alternateRowStyle: {
            backgroundColor: "#f8f9fa"
        },
        states: {
            hover: {
                backgroundColor: "#e3f2fd",
                borderLeft: "4px solid #2196f3"
            },
            selected: {
                backgroundColor: "#1976d2",
                color: "#ffffff"
            }
        }
    }
});

// 🌈 Tableau Colorful/Creative
const creativeTable = new Table({
    id: "creative-table", 
    position: { x: 700, y: 400 },
    size: { width: 450, height: 300 },
    attach: "#view",
    
    columns: [
        { id: "emoji", header: "😊", width: 60, sortable: false },
        { id: "project", header: "Project", width: 150, sortable: true },
        { id: "status", header: "Status", width: 120, sortable: true },
        { id: "priority", header: "Priority", width: 120, sortable: true }
    ],
    
    rows: [
        {
            id: "project-1",
            cells: {
                emoji: { content: "🎨", style: { fontSize: "24px", textAlign: "center" }},
                project: { content: "Design System", style: { fontWeight: "600", color: "#6f42c1" }},
                status: { content: "In Progress", style: { 
                    backgroundColor: "#fff3cd", 
                    color: "#856404", 
                    borderRadius: "15px", 
                    padding: "4px 12px",
                    textAlign: "center",
                    fontSize: "12px",
                    fontWeight: "500"
                }},
                priority: { content: "High", style: { 
                    backgroundColor: "#f8d7da", 
                    color: "#721c24",
                    borderRadius: "15px",
                    padding: "4px 12px", 
                    textAlign: "center",
                    fontSize: "12px",
                    fontWeight: "500"
                }}
            }
        },
        {
            id: "project-2",
            cells: {
                emoji: { content: "🚀", style: { fontSize: "24px", textAlign: "center" }},
                project: { content: "Launch App", style: { fontWeight: "600", color: "#dc3545" }},
                status: { content: "Done", style: { 
                    backgroundColor: "#d1e7dd", 
                    color: "#0f5132",
                    borderRadius: "15px", 
                    padding: "4px 12px",
                    textAlign: "center",
                    fontSize: "12px",
                    fontWeight: "500"
                }},
                priority: { content: "Critical", style: { 
                    backgroundColor: "#721c24", 
                    color: "#ffffff",
                    borderRadius: "15px",
                    padding: "4px 12px", 
                    textAlign: "center",
                    fontSize: "12px",
                    fontWeight: "500"
                }}
            }
        }
    ],
    
    styling: {
        cellPadding: 16,
        rowHeight: 55,
        headerStyle: {
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "#ffffff",
            fontSize: "14px",
            fontWeight: "600",
            borderRadius: "8px 8px 0 0"
        },
        cellStyle: {
            backgroundColor: "#ffffff",
            fontSize: "14px",
            border: "none",
            borderBottom: "1px solid #f0f0f0"
        },
        alternateRowStyle: {
            backgroundColor: "#fafbfc"
        },
        states: {
            hover: {
                backgroundColor: "#f8f9ff",
                transform: "translateX(4px)",
                boxShadow: "4px 0 12px rgba(102,126,234,0.15)"
            },
            selected: {
                backgroundColor: "#667eea",
                color: "#ffffff",
                transform: "scale(1.02)"
            }
        }
    }
});

// 📱 Tableau Mobile/Card Style
const mobileTable = new Table({
    id: "mobile-table",
    position: { x: 1200, y: 50 },
    size: { width: 350, height: 400 },
    attach: "#view",
    
    columns: [
        { id: "avatar", header: "", width: 50, sortable: false },
        { id: "name", header: "Contact", width: 150, sortable: true },
        { id: "action", header: "", width: 80, sortable: false }
    ],
    
    rows: [
        {
            id: "contact-1",
            cells: {
                avatar: { content: "👩‍💼", style: { fontSize: "28px", textAlign: "center" }},
                name: { content: "Sarah Connor", style: { fontWeight: "600", color: "#2c3e50" }},
                action: { content: "📞 💬", style: { fontSize: "20px", textAlign: "center" }}
            }
        },
        {
            id: "contact-2", 
            cells: {
                avatar: { content: "👨‍💻", style: { fontSize: "28px", textAlign: "center" }},
                name: { content: "John Doe", style: { fontWeight: "600", color: "#2c3e50" }},
                action: { content: "📞 💬", style: { fontSize: "20px", textAlign: "center" }}
            }
        },
        {
            id: "contact-3",
            cells: {
                avatar: { content: "👩‍🎨", style: { fontSize: "28px", textAlign: "center" }},
                name: { content: "Alice Design", style: { fontWeight: "600", color: "#2c3e50" }},
                action: { content: "📞 💬", style: { fontSize: "20px", textAlign: "center" }}
            }
        }
    ],
    
    styling: {
        cellPadding: 18,
        rowHeight: 65,
        headerStyle: {
            backgroundColor: "#ffffff",
            color: "#6c757d",
            fontSize: "12px",
            fontWeight: "500",
            textTransform: "uppercase",
            letterSpacing: "1px",
            borderBottom: "1px solid #e9ecef"
        },
        cellStyle: {
            backgroundColor: "#ffffff",
            fontSize: "16px",
            border: "none",
            borderBottom: "1px solid #f8f9fa",
            borderRadius: "0"
        },
        alternateRowStyle: {
            backgroundColor: "#ffffff"
        },
        states: {
            hover: {
                backgroundColor: "#f8f9fa",
                borderLeft: "4px solid #007bff",
                transform: "translateX(2px)"
            },
            selected: {
                backgroundColor: "#e7f3ff",
                borderLeft: "4px solid #007bff"
            }
        }
    },
    
    onCellClick: (cell, row, col) => {
        console.log(`📱 Mobile Table: Contact action for ${cell.content}`);
    }
});

console.log('🎨 Tous les tableaux d\'exemple créés !');
console.log('💫 Sexy Table (basique élégant)');
console.log('🎮 Gaming Table (thème sombre)'); 
console.log('📊 Financial Table (professionnel)');
console.log('🌈 Creative Table (coloré créatif)');
console.log('📱 Mobile Table (style mobile/card)');

// 🧪 Test des fonctionnalités avancées
setTimeout(() => {
    console.log('\n🧪 Test des fonctionnalités avancées...');
    
    // Test ajout de ligne au tableau sexy
    sexyTable.addRow({
        id: "user-4",
        cells: {
            name: { content: "Eva Green", style: { color: "#2c3e50", fontWeight: "600" }},
            role: { content: "Lead", style: { color: "#16a085", backgroundColor: "#f0fff4", borderRadius: "12px", padding: "4px 8px" }},
            status: { content: "🟢 En ligne", style: { color: "#27ae60" }},
            score: { content: "98", style: { color: "#e74c3c", fontSize: "16px" }},
            actions: { content: "✏️ 🗑️ 👁️", style: { fontSize: "18px" }}
        }
    });
    
    // Test ajout de donnée au tableau gaming
    gamingTable.addRow({
        id: "player-3",
        cells: {
            player: { content: "EliteSniper", style: { color: "#00ff88", fontFamily: "monospace", fontWeight: "bold" }},
            level: { content: "50", style: { color: "#ff6b35", textAlign: "center" }},
            score: { content: "15,999", style: { color: "#ffd23f", textAlign: "right", fontWeight: "bold" }},
            rank: { content: "🏆 Legend", style: { color: "#ff4444", textAlign: "center" }}
        }
    });
    
    console.log('✅ Nouvelles lignes ajoutées dynamiquement !');
}, 2000);

// 📜 Tableau Long avec En-tête Fixe (test scrolling)
const longTable = new Table({
    id: "long-table",
    position: { x: 50, y: 800 },
    size: { width: 800, height: 300 },  // Hauteur limitée pour forcer le scroll
    attach: "#view",
    
    columns: [
        { id: "id", header: "ID", width: 80, sortable: true },
        { id: "name", header: "Nom Complet", width: 200, sortable: true },
        { id: "email", header: "Email", width: 250, sortable: true },
        { id: "department", header: "Département", width: 150, sortable: true },
        { id: "salary", header: "Salaire", width: 120, sortable: true }
    ],
    
    rows: [], // On va les générer dynamiquement
    
    styling: {
        cellPadding: 12,
        rowHeight: 45,
        headerStyle: {
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "#ffffff",
            fontSize: "13px",
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            position: "sticky",  // Pour s'assurer que l'en-tête reste fixe
            top: "0",
            zIndex: "10"
        },
        cellStyle: {
            backgroundColor: "#ffffff",
            color: "#333333",
            fontSize: "14px",
            border: "none",
            borderBottom: "1px solid #e9ecef",
            padding: "12px"
        },
        alternateRowStyle: {
            backgroundColor: "#f8f9fa"
        },
        states: {
            hover: {
                backgroundColor: "#e3f2fd",
                borderLeft: "4px solid #2196f3"
            },
            selected: {
                backgroundColor: "#1976d2",
                color: "#ffffff"
            }
        }
    },
    
    onCellClick: (cell, row, col) => {
        console.log(`📜 Long Table: ${cell.content} clicked (${row}/${col})`);
    },
    
    onSort: (column, direction) => {
        console.log(`📜 Long Table sorted by ${column} ${direction}`);
    }
});

// Générer 50 lignes de données pour tester le scroll
const departments = ['IT', 'Sales', 'Marketing', 'HR', 'Finance', 'Operations'];
const firstNames = ['Alice', 'Bob', 'Carol', 'David', 'Eva', 'Frank', 'Grace', 'Henry', 'Iris', 'Jack'];
const lastNames = ['Smith', 'Johnson', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas'];

for (let i = 1; i <= 50; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const department = departments[Math.floor(Math.random() * departments.length)];
    const salary = (Math.floor(Math.random() * 5000) + 3000) * 10; // Entre 30k et 80k
    
    longTable.addRow({
        id: `employee-${i}`,
        cells: {
            id: { content: String(i).padStart(3, '0'), style: { fontFamily: "monospace", color: "#666" }},
            name: { content: `${firstName} ${lastName}`, style: { fontWeight: "600" }},
            email: { content: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@company.com`, style: { color: "#0066cc" }},
            department: { content: department, style: { 
                backgroundColor: department === 'IT' ? '#e3f2fd' : 
                                department === 'Sales' ? '#fff3e0' : 
                                department === 'Marketing' ? '#f3e5f5' : 
                                department === 'HR' ? '#e8f5e8' : 
                                department === 'Finance' ? '#fff8e1' : '#fce4ec',
                color: department === 'IT' ? '#1976d2' : 
                       department === 'Sales' ? '#f57c00' : 
                       department === 'Marketing' ? '#7b1fa2' : 
                       department === 'HR' ? '#388e3c' : 
                       department === 'Finance' ? '#fbc02d' : '#c2185b',
                borderRadius: "12px",
                padding: "4px 12px",
                fontWeight: "500",
                textAlign: "center",
                fontSize: "12px"
            }},
            salary: { content: `${salary.toLocaleString()}€`, style: { 
                textAlign: "right", 
                fontWeight: "bold",
                color: salary > 60000 ? "#4caf50" : salary > 45000 ? "#ff9800" : "#757575"
            }}
        }
    });
}

console.log('📜 Long Table créée avec 50 lignes !');
console.log('🎯 Testez le scroll - l\'en-tête doit rester fixe !');
console.log('💡 Cliquez sur les en-têtes pour trier les données.');

// 📊 Résumé des exemples créés
console.log('\n🎨 ========== RÉSUMÉ DES EXEMPLES DE TABLEAUX ==========');
console.log('💎 1. Sexy Table - Élégant et professionnel');
console.log('🎮 2. Gaming Table - Thème sombre cyberpunk');
console.log('📊 3. Financial Table - Style financier sobre');
console.log('🌈 4. Creative Table - Coloré et créatif');
console.log('📱 5. Mobile Table - Style mobile optimisé');
console.log('📜 6. Long Table - Test d\'en-tête fixe avec scroll');
console.log('🎯 L\'en-tête ne scroll plus avec le contenu !');
console.log('================================================\n');

// 🧪 Test de débogage pour vérifier la structure
setTimeout(() => {
    console.log('\n🔧 Test de débogage de la structure...');
    
    try {
        const testTable = document.getElementById('sexy-table');
        if (testTable) {
            const headerContainer = testTable.querySelector('.table-header-container');
            const bodyContainer = testTable.querySelector('.table-body-container');
            
            console.log('✅ Container principal trouvé:', testTable);
            console.log('✅ Header container trouvé:', headerContainer ? 'Oui' : 'Non');
            console.log('✅ Body container trouvé:', bodyContainer ? 'Oui' : 'Non');
            
            if (headerContainer) {
                const headers = headerContainer.querySelectorAll('.table-header-cell');
                console.log(`✅ En-têtes trouvés: ${headers.length}`);
            }
            
            if (bodyContainer) {
                const rows = bodyContainer.querySelectorAll('.table-row');
                const cells = bodyContainer.querySelectorAll('.table-cell');
                console.log(`✅ Lignes trouvées: ${rows.length}`);
                console.log(`✅ Cellules trouvées: ${cells.length}`);
            }
            
            console.log('🎯 Test de tri - cliquez sur un en-tête pour tester !');
        }
    } catch (error) {
        console.error('❌ Erreur de debug:', error);
    }
}, 3000);
