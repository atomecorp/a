/**
 * 🍽️ EXEMPLES MENU MODERNES - MATERIAL DESIGN DARK
 * Menus beaux, modernes et responsives avec espacement correct et sobre
 */
import Menu from '../../squirrel/components/menu_builder.js';

// Variable pour gérer l'état actif et menu mobile
let currentActiveItem = null;
let isMobileMenuOpen = false;

// 🌙 Menu Header Material Dark - Navigation principale FINE avec contraste
const modernHeaderMenu = Menu({
    id: "modern-header-menu",
    attach: "#view",
    position: { x: 50, y: 30 },
    size: { width: "100%", maxWidth: 1200 },
    
    layout: {
        direction: "horizontal",
        justify: "space-between",
        align: "center",
        gap: "32px"
    },
    
    style: {
        background: "rgba(15, 15, 15, 0.98)",
        backdropFilter: "blur(24px)",
        borderRadius: "12px",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4), 0 1px 0 rgba(255, 255, 255, 0.12)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        padding: "8px 20px",
        minHeight: "44px",
        height: "44px",
        position: "relative",
        zIndex: "1000"
    },
    
    // Responsive design avec menu hamburger
    responsive: {
        breakpoints: {
            mobile: {
                maxWidth: "768px",
                showHamburger: true,
                style: {
                    padding: "8px 16px",
                    height: "44px"
                }
            },
            tablet: {
                maxWidth: "1024px",
                style: {
                    padding: "8px 18px"
                }
            }
        }
    },
    
    content: [
        {
            type: "item",
            id: "logo",
            content: {
                html: `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 28px; height: 28px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 14px;">S</div>
                        <span style="font-size: 16px; font-weight: 600; color: #f8f9fa; letter-spacing: -0.01em;">Squirrel</span>
                    </div>
                `
            },
            style: { 
                padding: "0",
                cursor: "default"
            }
        },
        {
            type: "item",
            id: "hamburger-menu",
            content: {
                html: `
                    <div id="hamburger-icon" style="display: none; flex-direction: column; cursor: pointer; padding: 4px;">
                        <div style="width: 20px; height: 2px; background: #f8f9fa; margin: 2px 0; transition: 0.3s; border-radius: 1px;"></div>
                        <div style="width: 20px; height: 2px; background: #f8f9fa; margin: 2px 0; transition: 0.3s; border-radius: 1px;"></div>
                        <div style="width: 20px; height: 2px; background: #f8f9fa; margin: 2px 0; transition: 0.3s; border-radius: 1px;"></div>
                    </div>
                `
            },
            style: {
                padding: "4px"
            }
        },
        {
            type: "group",
            id: "nav-links",
            layout: { 
                direction: "horizontal", 
                gap: "4px" 
            },
            style: {
                display: "flex" // Sera caché sur mobile
            },
            items: [
                {
                    id: "dashboard",
                    content: { text: "Dashboard" },
                    style: { 
                        color: "#f8f9fa",
                        fontWeight: "500",
                        fontSize: "13px",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                    },
                    states: {
                        hover: { 
                            backgroundColor: "rgba(255,255,255,0.12)",
                            transform: "translateY(-1px)",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.25)"
                        },
                        active: {
                            backgroundColor: "#667eea",
                            color: "#ffffff",
                            borderLeft: "3px solid #ffffff"
                        }
                    }
                },
                {
                    id: "projects",
                    content: { text: "Projets" },
                    style: { 
                        color: "#f8f9fa",
                        fontWeight: "500",
                        fontSize: "13px",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                    },
                    states: {
                        hover: { 
                            backgroundColor: "rgba(255,255,255,0.12)"
                        }
                    },
                    dropdown: {
                        position: "bottom-start",
                        offset: { x: 0, y: 4 },
                        style: {
                            marginTop: "8px",
                            background: "rgba(25, 25, 25, 0.98)",
                            backdropFilter: "blur(20px)",
                            borderRadius: "12px",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
                            padding: "8px",
                            minWidth: "180px",
                            position: "fixed",
                            zIndex: "1001"
                        },
                        items: [
                            { 
                                id: "new-project", 
                                content: { text: "➕ Nouveau projet" },
                                style: { 
                                    color: "#4caf50",
                                    padding: "8px 12px",
                                    borderRadius: "6px",
                                    fontSize: "14px"
                                },
                                states: {
                                    hover: { backgroundColor: "rgba(76, 175, 80, 0.1)" }
                                }
                            },
                            { 
                                id: "my-projects", 
                                content: { text: "📁 Mes projets" },
                                style: { 
                                    padding: "8px 12px",
                                    borderRadius: "6px",
                                    fontSize: "14px"
                                },
                                states: {
                                    hover: { backgroundColor: "rgba(255,255,255,0.08)" }
                                }
                            },
                            { 
                                id: "shared-projects", 
                                content: { text: "🤝 Projets partagés" },
                                style: { 
                                    padding: "8px 12px",
                                    borderRadius: "6px",
                                    fontSize: "14px"
                                },
                                states: {
                                    hover: { backgroundColor: "rgba(255,255,255,0.08)" }
                                }
                            },
                            { 
                                type: "separator",
                                style: {
                                    borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                                    margin: "6px 0"
                                }
                            },
                            { 
                                id: "archived", 
                                content: { text: "📦 Archivés" },
                                style: { 
                                    color: "#9e9e9e",
                                    padding: "8px 12px",
                                    borderRadius: "6px",
                                    fontSize: "14px"
                                },
                                states: {
                                    hover: { backgroundColor: "rgba(158,158,158,0.1)" }
                                }
                            }
                        ]
                    }
                },
                {
                    id: "team",
                    content: { text: "Équipe" },
                    style: { 
                        color: "#f8f9fa",
                        fontWeight: "500",
                        fontSize: "13px",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                    },
                    states: {
                        hover: { 
                            backgroundColor: "rgba(255,255,255,0.12)"
                        }
                    }
                },
                {
                    id: "analytics",
                    content: { text: "Analytics" },
                    style: { 
                        color: "#f8f9fa",
                        fontWeight: "500",
                        fontSize: "13px",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                    },
                    states: {
                        hover: { 
                            backgroundColor: "rgba(255,255,255,0.12)"
                        }
                    }
                }
            ]
        },
        {
            type: "group",
            id: "user-section",
            layout: { 
                direction: "horizontal", 
                gap: "12px" 
            },
            items: [
                {
                    id: "notifications",
                    content: { 
                        html: `
                            <div style="position: relative;">
                                🔔
                                <span style="position: absolute; top: -6px; right: -6px; background: #f44336; color: white; border-radius: 50%; width: 14px; height: 14px; font-size: 9px; display: flex; align-items: center; justify-content: center; font-weight: 600;">3</span>
                            </div>
                        `
                    },
                    style: {
                        color: "#f8f9fa",
                        padding: "6px",
                        borderRadius: "50%",
                        width: "32px",
                        height: "32px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "14px",
                        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                    },
                    states: {
                        hover: { 
                            backgroundColor: "rgba(255,255,255,0.12)",
                            transform: "scale(1.05)"
                        }
                    }
                },
                {
                    id: "user-profile",
                    content: { 
                        html: `
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle fill='%23667eea' cx='12' cy='12' r='12'/%3E%3Ctext x='12' y='16' text-anchor='middle' fill='white' font-size='10' font-weight='600'%3EJD%3C/text%3E%3C/svg%3E" style="border-radius: 50%; width: 24px; height: 24px;">
                                <span style="color: #f8f9fa; font-weight: 500; font-size: 13px;">John</span>
                                <span style="color: #9e9e9e; font-size: 9px; margin-left: 2px;">▼</span>
                            </div>
                        `
                    },
                    style: {
                        padding: "4px 10px",
                        borderRadius: "16px",
                        border: "1px solid rgba(255,255,255,0.15)",
                        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                    },
                    dropdown: {
                        position: "bottom-end",
                        offset: { x: 0, y: 4 },
                        style: {
                            marginTop: "8px",
                            background: "rgba(25, 25, 25, 0.98)",
                            backdropFilter: "blur(20px)",
                            borderRadius: "12px",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
                            padding: "8px",
                            minWidth: "160px",
                            position: "fixed",
                            zIndex: "1001"
                        },
                        items: [
                            { 
                                content: { text: "👤 Mon profil" },
                                style: { 
                                    padding: "8px 12px",
                                    borderRadius: "6px",
                                    fontSize: "14px"
                                },
                                states: {
                                    hover: { backgroundColor: "rgba(255,255,255,0.08)" }
                                }
                            },
                            { 
                                content: { text: "⚙️ Paramètres" },
                                style: { 
                                    padding: "8px 12px",
                                    borderRadius: "6px",
                                    fontSize: "14px"
                                },
                                states: {
                                    hover: { backgroundColor: "rgba(255,255,255,0.08)" }
                                }
                            },
                            { 
                                content: { text: "🎨 Thème" },
                                style: { 
                                    padding: "8px 12px",
                                    borderRadius: "6px",
                                    fontSize: "14px"
                                },
                                states: {
                                    hover: { backgroundColor: "rgba(255,255,255,0.08)" }
                                }
                            },
                            { 
                                type: "separator",
                                style: {
                                    borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                                    margin: "6px 0"
                                }
                            },
                            { 
                                content: { text: "🚪 Déconnexion" }, 
                                style: { 
                                    color: "#f44336",
                                    padding: "8px 12px",
                                    borderRadius: "6px",
                                    fontSize: "14px"
                                },
                                states: {
                                    hover: { backgroundColor: "rgba(244, 67, 54, 0.1)" }
                                }
                            }
                        ]
                    },
                    states: {
                        hover: { 
                            backgroundColor: "rgba(255,255,255,0.08)",
                            borderColor: "rgba(255,255,255,0.25)"
                        }
                    }
                }
            ]
        }
    ],
    
    callbacks: {
        onItemClick: (itemId, event) => {
            console.log("🍽️ Menu Header - Clic sur:", itemId);
            
            // Gestion du menu hamburger
            if (itemId === "hamburger-menu") {
                toggleMobileMenu();
                return;
            }
            
            // Gestion de l'état actif
            if (currentActiveItem && currentActiveItem !== itemId) {
                // Retirer l'état actif de l'ancien item
                const oldActiveElement = document.querySelector(`[data-menu-id="${currentActiveItem}"]`);
                if (oldActiveElement) {
                    oldActiveElement.style.backgroundColor = "";
                    oldActiveElement.style.color = "#f8f9fa";
                    oldActiveElement.style.borderLeft = "";
                }
            }
            
            // Appliquer l'état actif au nouvel item
            const newActiveElement = document.querySelector(`[data-menu-id="${itemId}"]`);
            if (newActiveElement) {
                newActiveElement.style.backgroundColor = "#667eea";
                newActiveElement.style.color = "#ffffff";
                newActiveElement.style.borderLeft = "3px solid #ffffff";
            }
            
            currentActiveItem = itemId;
            
            if (itemId === "dashboard") {
                console.log("📊 Redirection vers Dashboard");
            }
        },
        onDropdownOpen: (itemId) => {
            console.log("📂 Dropdown ouvert:", itemId);
        },
        onDropdownClose: (itemId) => {
            console.log("📂 Dropdown fermé:", itemId);
        }
    }
});

// 📱 Menu Mobile Overlay - Menu hamburger minimaliste
const mobileMenuOverlay = Menu({
    id: "mobile-menu-overlay",
    attach: "#view",
    position: { x: 0, y: 0 },
    size: { width: "100vw", height: "100vh" },
    
    style: {
        position: "fixed",
        top: "0",
        left: "0",
        background: "rgba(0, 0, 0, 0.8)",
        backdropFilter: "blur(10px)",
        zIndex: "1500",
        display: "none",
        opacity: "0",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
    },
    
    layout: {
        direction: "vertical",
        justify: "center",
        align: "center",
        gap: "20px"
    },
    
    content: [
        {
            type: "group",
            id: "mobile-nav",
            layout: {
                direction: "vertical",
                gap: "16px",
                align: "center"
            },
            style: {
                background: "rgba(15, 15, 15, 0.95)",
                borderRadius: "16px",
                padding: "32px 24px",
                minWidth: "280px",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)"
            },
            items: [
                {
                    id: "mobile-dashboard",
                    content: { text: "Dashboard" },
                    style: {
                        color: "#f8f9fa",
                        fontSize: "18px",
                        fontWeight: "500",
                        padding: "12px 24px",
                        borderRadius: "8px",
                        width: "200px",
                        textAlign: "center",
                        transition: "all 0.2s ease"
                    },
                    states: {
                        hover: {
                            backgroundColor: "#667eea",
                            transform: "scale(1.05)"
                        }
                    }
                },
                {
                    id: "mobile-projects",
                    content: { text: "Projets" },
                    style: {
                        color: "#f8f9fa",
                        fontSize: "18px",
                        fontWeight: "500",
                        padding: "12px 24px",
                        borderRadius: "8px",
                        width: "200px",
                        textAlign: "center",
                        transition: "all 0.2s ease"
                    },
                    states: {
                        hover: {
                            backgroundColor: "#667eea",
                            transform: "scale(1.05)"
                        }
                    }
                },
                {
                    id: "mobile-team",
                    content: { text: "Équipe" },
                    style: {
                        color: "#f8f9fa",
                        fontSize: "18px",
                        fontWeight: "500",
                        padding: "12px 24px",
                        borderRadius: "8px",
                        width: "200px",
                        textAlign: "center",
                        transition: "all 0.2s ease"
                    },
                    states: {
                        hover: {
                            backgroundColor: "#667eea",
                            transform: "scale(1.05)"
                        }
                    }
                },
                {
                    id: "mobile-analytics",
                    content: { text: "Analytics" },
                    style: {
                        color: "#f8f9fa",
                        fontSize: "18px",
                        fontWeight: "500",
                        padding: "12px 24px",
                        borderRadius: "8px",
                        width: "200px",
                        textAlign: "center",
                        transition: "all 0.2s ease"
                    },
                    states: {
                        hover: {
                            backgroundColor: "#667eea",
                            transform: "scale(1.05)"
                        }
                    }
                },
                {
                    type: "separator",
                    style: {
                        borderTop: "1px solid rgba(255, 255, 255, 0.2)",
                        margin: "16px 0",
                        width: "100%"
                    }
                },
                {
                    id: "mobile-close",
                    content: { text: "✕ Fermer" },
                    style: {
                        color: "#9e9e9e",
                        fontSize: "16px",
                        fontWeight: "500",
                        padding: "8px 16px",
                        borderRadius: "20px",
                        border: "1px solid rgba(255, 255, 255, 0.2)",
                        transition: "all 0.2s ease"
                    },
                    states: {
                        hover: {
                            color: "#f44336",
                            borderColor: "#f44336"
                        }
                    }
                }
            ]
        }
    ],
    
    callbacks: {
        onItemClick: (itemId, event) => {
            console.log("📱 Mobile Menu - Clic sur:", itemId);
            
            if (itemId === "mobile-close") {
                hideMobileMenu();
                return;
            }
            
            // Fermer le menu et traiter l'action
            hideMobileMenu();
            
            // Mapper les actions mobile vers les actions desktop
            const desktopMapping = {
                "mobile-dashboard": "dashboard",
                "mobile-projects": "projects",
                "mobile-team": "team",
                "mobile-analytics": "analytics"
            };
            
            const desktopItemId = desktopMapping[itemId];
            if (desktopItemId) {
                // Trigger l'action correspondante sur le menu desktop
                modernHeaderMenu.callbacks.onItemClick(desktopItemId, event);
            }
        }
    }
});

// Fonctions pour gérer le menu mobile
function toggleMobileMenu() {
    if (isMobileMenuOpen) {
        hideMobileMenu();
    } else {
        showMobileMenu();
    }
}

function showMobileMenu() {
    const mobileMenu = document.getElementById('mobile-menu-overlay');
    const hamburgerIcon = document.getElementById('hamburger-icon');
    
    if (mobileMenu) {
        mobileMenu.style.display = 'flex';
        requestAnimationFrame(() => {
            mobileMenu.style.opacity = '1';
        });
    }
    
    // Animation du hamburger vers X
    if (hamburgerIcon) {
        const lines = hamburgerIcon.querySelectorAll('div');
        if (lines.length >= 3) {
            lines[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
            lines[1].style.opacity = '0';
            lines[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
        }
    }
    
    isMobileMenuOpen = true;
    console.log("📱 Menu mobile ouvert");
}

function hideMobileMenu() {
    const mobileMenu = document.getElementById('mobile-menu-overlay');
    const hamburgerIcon = document.getElementById('hamburger-icon');
    
    if (mobileMenu) {
        mobileMenu.style.opacity = '0';
        setTimeout(() => {
            mobileMenu.style.display = 'none';
        }, 300);
    }
    
    // Animation du X vers hamburger
    if (hamburgerIcon) {
        const lines = hamburgerIcon.querySelectorAll('div');
        if (lines.length >= 3) {
            lines[0].style.transform = 'none';
            lines[1].style.opacity = '1';
            lines[2].style.transform = 'none';
        }
    }
    
    isMobileMenuOpen = false;
    console.log("📱 Menu mobile fermé");
}

// 📱 Sidebar Material Dark - Menu latéral moderne et sobre
const modernSidebar = Menu({
    id: "modern-sidebar",
    attach: "#view",
    position: { x: 50, y: 130 },
    size: { width: 260, height: 600 },
    
    style: {
        background: "rgba(18, 18, 18, 0.98)",
        backdropFilter: "blur(20px)",
        borderRadius: "16px",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3), 0 1px 0 rgba(255, 255, 255, 0.05)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        padding: "20px",
        position: "relative",
        zIndex: "999"
    },
    
    // Responsive design pour sidebar
    responsive: {
        breakpoints: {
            mobile: {
                maxWidth: "768px",
                size: { width: "100%", height: "auto" },
                position: { x: 0, y: 100 },
                style: {
                    borderRadius: "0",
                    padding: "16px"
                }
            }
        }
    },
    
    layout: {
        direction: "vertical",
        justify: "flex-start",
        align: "stretch",
        gap: "6px"
    },
    
    content: [
        {
            type: "item",
            id: "sidebar-header",
            content: { 
                html: `
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <h3 style="margin: 0; color: #f5f5f5; font-size: 16px; font-weight: 600; letter-spacing: -0.01em;">Navigation</h3>
                        <p style="margin: 0; color: #9e9e9e; font-size: 12px;">Workspace principal</p>
                    </div>
                `
            },
            style: {
                padding: "0 0 16px 0",
                cursor: "default",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                marginBottom: "12px"
            }
        },
        {
            type: "group",
            id: "main-nav",
            layout: {
                direction: "vertical",
                gap: "2px"
            },
            items: [
                {
                    id: "overview",
                    content: { 
                        html: `
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="font-size: 16px;">📊</span>
                                <span>Vue d'ensemble</span>
                            </div>
                        `
                    },
                    style: {
                        color: "#e0e6ed",
                        fontSize: "14px",
                        fontWeight: "500",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                    },
                    states: {
                        hover: { 
                            backgroundColor: "rgba(255,255,255,0.08)",
                            transform: "translateX(2px)"
                        },
                        active: {
                            backgroundColor: "#667eea",
                            color: "#ffffff",
                            borderLeft: "3px solid #ffffff",
                            transform: "translateX(4px)"
                        }
                    }
                },
                {
                    id: "projects-sidebar",
                    content: { 
                        html: `
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="font-size: 16px;">📁</span>
                                <span>Projets</span>
                            </div>
                        `
                    },
                    style: {
                        color: "#e0e6ed",
                        fontSize: "14px",
                        fontWeight: "500",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                    },
                    states: {
                        hover: { 
                            backgroundColor: "rgba(255,255,255,0.08)",
                            transform: "translateX(2px)"
                        }
                    }
                },
                {
                    id: "team-sidebar",
                    content: { 
                        html: `
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="font-size: 16px;">👥</span>
                                <span>Équipe</span>
                            </div>
                        `
                    },
                    style: {
                        color: "#e0e6ed",
                        fontSize: "14px",
                        fontWeight: "500",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                    },
                    states: {
                        hover: { 
                            backgroundColor: "rgba(255,255,255,0.08)",
                            transform: "translateX(2px)"
                        }
                    }
                },
                {
                    id: "analytics-sidebar",
                    content: { 
                        html: `
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="font-size: 16px;">📈</span>
                                <span>Analytics</span>
                            </div>
                        `
                    },
                    style: {
                        color: "#e0e6ed",
                        fontSize: "14px",
                        fontWeight: "500",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                    },
                    states: {
                        hover: { 
                            backgroundColor: "rgba(255,255,255,0.08)",
                            transform: "translateX(2px)"
                        }
                    }
                }
            ]
        },
        {
            type: "item",
            id: "separator-1",
            content: { html: "" },
            style: {
                height: "1px",
                backgroundColor: "rgba(255, 255, 255, 0.08)",
                margin: "16px 0"
            }
        },
        {
            type: "group",
            id: "tools-nav",
            layout: {
                direction: "vertical",
                gap: "2px"
            },
            items: [
                {
                    id: "settings",
                    content: { 
                        html: `
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="font-size: 16px;">⚙️</span>
                                <span>Paramètres</span>
                            </div>
                        `
                    },
                    style: {
                        color: "#e0e6ed",
                        fontSize: "14px",
                        fontWeight: "500",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                    },
                    states: {
                        hover: { 
                            backgroundColor: "rgba(255,255,255,0.08)",
                            transform: "translateX(2px)"
                        }
                    }
                },
                {
                    id: "help",
                    content: { 
                        html: `
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="font-size: 16px;">❓</span>
                                <span>Aide</span>
                            </div>
                        `
                    },
                    style: {
                        color: "#e0e6ed",
                        fontSize: "14px",
                        fontWeight: "500",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                    },
                    states: {
                        hover: { 
                            backgroundColor: "rgba(255,255,255,0.08)",
                            transform: "translateX(2px)"
                        }
                    }
                }
            ]
        }
    ],
    
    callbacks: {
        onItemClick: (itemId, event) => {
            console.log("📱 Sidebar - Clic sur:", itemId);
            
            // Gestion de l'état actif pour sidebar
            const sidebarItems = document.querySelectorAll('#modern-sidebar [data-menu-id]');
            sidebarItems.forEach(item => {
                if (item.dataset.menuId !== itemId) {
                    item.style.backgroundColor = "";
                    item.style.color = "#e0e6ed";
                    item.style.borderLeft = "";
                    item.style.transform = "";
                }
            });
            
            // Appliquer l'état actif
            const activeElement = document.querySelector(`#modern-sidebar [data-menu-id="${itemId}"]`);
            if (activeElement) {
                activeElement.style.backgroundColor = "#667eea";
                activeElement.style.color = "#ffffff";
                activeElement.style.borderLeft = "3px solid #ffffff";
                activeElement.style.transform = "translateX(4px)";
            }
        }
    }
});

// 🎯 Menu FAB (Floating Action Button) moderne
const modernFAB = Menu({
    id: "modern-fab",
    attach: "#view",
    position: { x: 1200, y: 500 },
    size: { width: 64, height: 64 },
    
    style: {
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        borderRadius: "50%",
        boxShadow: "0 8px 24px rgba(102, 126, 234, 0.4), 0 4px 12px rgba(0, 0, 0, 0.3)",
        border: "none",
        padding: "0",
        overflow: "visible",
        position: "fixed",
        zIndex: "1002"
    },
    
    // Responsive pour FAB
    responsive: {
        breakpoints: {
            mobile: {
                maxWidth: "768px",
                position: { x: "calc(100vw - 80px)", y: "calc(100vh - 80px)" },
                size: { width: 56, height: 56 }
            }
        }
    },
    
    layout: {
        direction: "vertical",
        justify: "center",
        align: "center"
    },
    
    content: [
        {
            type: "item",
            id: "fab-main",
            content: { 
                html: `
                    <div style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">
                        <span style="font-size: 24px; color: white;">+</span>
                    </div>
                `
            },
            style: {
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                cursor: "pointer",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
            },
            states: {
                hover: { 
                    transform: "scale(1.1) rotate(45deg)",
                    boxShadow: "0 12px 32px rgba(102, 126, 234, 0.5)"
                }
            },
            dropdown: {
                position: "top-end",
                offset: { x: -8, y: -8 },
                style: {
                    marginBottom: "16px",
                    background: "rgba(25, 25, 25, 0.98)",
                    backdropFilter: "blur(20px)",
                    borderRadius: "12px",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
                    padding: "8px",
                    minWidth: "200px",
                    position: "fixed",
                    zIndex: "1003"
                },
                items: [
                    { 
                        content: { text: "📄 Nouveau document" },
                        style: { 
                            padding: "10px 12px",
                            borderRadius: "6px",
                            fontSize: "14px",
                            color: "#e0e6ed"
                        },
                        states: {
                            hover: { backgroundColor: "rgba(255,255,255,0.08)" }
                        }
                    },
                    { 
                        content: { text: "📁 Nouveau dossier" },
                        style: { 
                            padding: "10px 12px",
                            borderRadius: "6px",
                            fontSize: "14px",
                            color: "#e0e6ed"
                        },
                        states: {
                            hover: { backgroundColor: "rgba(255,255,255,0.08)" }
                        }
                    },
                    { 
                        content: { text: "👥 Inviter utilisateur" },
                        style: { 
                            padding: "10px 12px",
                            borderRadius: "6px",
                            fontSize: "14px",
                            color: "#e0e6ed"
                        },
                        states: {
                            hover: { backgroundColor: "rgba(255,255,255,0.08)" }
                        }
                    },
                    { 
                        type: "separator",
                        style: {
                            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                            margin: "6px 0"
                        }
                    },
                    { 
                        content: { text: "⚙️ Paramètres rapides" },
                        style: { 
                            padding: "10px 12px",
                            borderRadius: "6px",
                            fontSize: "14px",
                            color: "#9e9e9e"
                        },
                        states: {
                            hover: { backgroundColor: "rgba(158,158,158,0.1)" }
                        }
                    }
                ]
            }
        }
    ],
    
    callbacks: {
        onItemClick: (itemId, event) => {
            console.log("🎯 FAB - Action:", itemId);
        }
    }
});

// 📋 Menu Contextuel moderne - Clic droit
const modernContextMenu = Menu({
    id: "modern-context-menu",
    attach: "#view",
    position: { x: 0, y: 0 }, // Position dynamique selon le clic
    size: { width: "auto", minWidth: 200 },
    
    style: {
        background: "rgba(25, 25, 25, 0.98)",
        backdropFilter: "blur(20px)",
        borderRadius: "12px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2)",
        padding: "8px",
        position: "fixed",
        zIndex: "2000",
        display: "none", // Caché par défaut
        opacity: "0",
        transform: "scale(0.9)",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
    },
    
    layout: {
        direction: "vertical",
        gap: "2px"
    },
    
    content: [
        {
            type: "group",
            id: "context-actions",
            layout: {
                direction: "vertical",
                gap: "1px"
            },
            items: [
                {
                    id: "copy",
                    content: { 
                        html: `
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="font-size: 14px;">📋</span>
                                <span>Copier</span>
                                <span style="margin-left: auto; font-size: 12px; color: #9e9e9e;">Ctrl+C</span>
                            </div>
                        `
                    },
                    style: {
                        color: "#e0e6ed",
                        fontSize: "14px",
                        fontWeight: "500",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        transition: "all 0.15s ease",
                        cursor: "pointer"
                    },
                    states: {
                        hover: { 
                            backgroundColor: "rgba(255,255,255,0.08)"
                        }
                    }
                },
                {
                    id: "paste",
                    content: { 
                        html: `
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="font-size: 14px;">📄</span>
                                <span>Coller</span>
                                <span style="margin-left: auto; font-size: 12px; color: #9e9e9e;">Ctrl+V</span>
                            </div>
                        `
                    },
                    style: {
                        color: "#e0e6ed",
                        fontSize: "14px",
                        fontWeight: "500",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        transition: "all 0.15s ease",
                        cursor: "pointer"
                    },
                    states: {
                        hover: { 
                            backgroundColor: "rgba(255,255,255,0.08)"
                        }
                    }
                },
                {
                    id: "cut",
                    content: { 
                        html: `
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="font-size: 14px;">✂️</span>
                                <span>Couper</span>
                                <span style="margin-left: auto; font-size: 12px; color: #9e9e9e;">Ctrl+X</span>
                            </div>
                        `
                    },
                    style: {
                        color: "#e0e6ed",
                        fontSize: "14px",
                        fontWeight: "500",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        transition: "all 0.15s ease",
                        cursor: "pointer"
                    },
                    states: {
                        hover: { 
                            backgroundColor: "rgba(255,255,255,0.08)"
                        }
                    }
                },
                {
                    type: "separator",
                    style: {
                        borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                        margin: "4px 0"
                    }
                },
                {
                    id: "duplicate",
                    content: { 
                        html: `
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="font-size: 14px;">📑</span>
                                <span>Dupliquer</span>
                            </div>
                        `
                    },
                    style: {
                        color: "#e0e6ed",
                        fontSize: "14px",
                        fontWeight: "500",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        transition: "all 0.15s ease",
                        cursor: "pointer"
                    },
                    states: {
                        hover: { 
                            backgroundColor: "rgba(255,255,255,0.08)"
                        }
                    }
                },
                {
                    id: "rename",
                    content: { 
                        html: `
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="font-size: 14px;">✏️</span>
                                <span>Renommer</span>
                                <span style="margin-left: auto; font-size: 12px; color: #9e9e9e;">F2</span>
                            </div>
                        `
                    },
                    style: {
                        color: "#e0e6ed",
                        fontSize: "14px",
                        fontWeight: "500",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        transition: "all 0.15s ease",
                        cursor: "pointer"
                    },
                    states: {
                        hover: { 
                            backgroundColor: "rgba(255,255,255,0.08)"
                        }
                    }
                },
                {
                    type: "separator",
                    style: {
                        borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                        margin: "4px 0"
                    }
                },
                {
                    id: "properties",
                    content: { 
                        html: `
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="font-size: 14px;">ℹ️</span>
                                <span>Propriétés</span>
                            </div>
                        `
                    },
                    style: {
                        color: "#e0e6ed",
                        fontSize: "14px",
                        fontWeight: "500",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        transition: "all 0.15s ease",
                        cursor: "pointer"
                    },
                    states: {
                        hover: { 
                            backgroundColor: "rgba(255,255,255,0.08)"
                        }
                    }
                },
                {
                    id: "delete",
                    content: { 
                        html: `
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="font-size: 14px;">🗑️</span>
                                <span>Supprimer</span>
                                <span style="margin-left: auto; font-size: 12px; color: #9e9e9e;">Del</span>
                            </div>
                        `
                    },
                    style: {
                        color: "#f44336",
                        fontSize: "14px",
                        fontWeight: "500",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        transition: "all 0.15s ease",
                        cursor: "pointer"
                    },
                    states: {
                        hover: { 
                            backgroundColor: "rgba(244, 67, 54, 0.1)"
                        }
                    }
                }
            ]
        }
    ],
    
    callbacks: {
        onItemClick: (itemId, event) => {
            console.log("📋 Menu Contextuel - Action:", itemId);
            hideContextMenu();
            
            // Actions spécifiques
            switch (itemId) {
                case 'copy':
                    console.log("📋 Action: Copier");
                    break;
                case 'paste':
                    console.log("📄 Action: Coller");
                    break;
                case 'cut':
                    console.log("✂️ Action: Couper");
                    break;
                case 'duplicate':
                    console.log("📑 Action: Dupliquer");
                    break;
                case 'rename':
                    console.log("✏️ Action: Renommer");
                    break;
                case 'properties':
                    console.log("ℹ️ Action: Propriétés");
                    break;
                case 'delete':
                    console.log("🗑️ Action: Supprimer");
                    break;
            }
        }
    }
});

// Fonctions pour gérer le menu contextuel
function showContextMenu(x, y) {
    const contextMenu = document.getElementById('modern-context-menu');
    if (contextMenu) {
        // Position responsive
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const menuWidth = 200;
        const menuHeight = 280;
        
        // Ajuster la position si le menu dépasse
        let finalX = x;
        let finalY = y;
        
        if (x + menuWidth > viewportWidth) {
            finalX = viewportWidth - menuWidth - 10;
        }
        if (y + menuHeight > viewportHeight) {
            finalY = viewportHeight - menuHeight - 10;
        }
        
        contextMenu.style.left = finalX + 'px';
        contextMenu.style.top = finalY + 'px';
        contextMenu.style.display = 'block';
        
        // Animation d'apparition
        requestAnimationFrame(() => {
            contextMenu.style.opacity = '1';
            contextMenu.style.transform = 'scale(1)';
        });
    }
}

function hideContextMenu() {
    const contextMenu = document.getElementById('modern-context-menu');
    if (contextMenu) {
        contextMenu.style.opacity = '0';
        contextMenu.style.transform = 'scale(0.9)';
        setTimeout(() => {
            contextMenu.style.display = 'none';
        }, 200);
    }
}

// Event listeners pour le menu contextuel
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY);
});

document.addEventListener('click', (e) => {
    // Fermer le menu contextuel si on clique ailleurs
    if (!e.target.closest('#modern-context-menu')) {
        hideContextMenu();
    }
});

document.addEventListener('keydown', (e) => {
    // Fermer le menu contextuel avec Escape
    if (e.key === 'Escape') {
        hideContextMenu();
    }
});

console.log("🍽️ Menus Material Design chargés avec succès!");
console.log("✨ Styles modernes, sobres et responsives appliqués");
console.log("🔧 Gestion des états actifs et positionnement des dropdowns corrigés");
console.log("📋 Menu contextuel moderne ajouté (clic droit)");
console.log("📱 Menu hamburger responsive ajouté");
console.log("🎨 Design plus fin avec contraste amélioré");
console.log("🎯 Fonctionnalités disponibles:");
console.log("   - Menu Header FINE avec contraste (44px de hauteur)");
console.log("   - Menu Hamburger minimaliste sur mobile");
console.log("   - Sidebar avec navigation");
console.log("   - FAB (Floating Action Button)");
console.log("   - Menu contextuel (clic droit)");
console.log("   - Responsive automatique avec hamburger");
console.log("   - window.resetMenuStates() pour reset");

// Initialisation responsive et CSS adaptatif
window.addEventListener('resize', () => {
    console.log("📱 Responsive: Redimensionnement détecté");
    handleResponsiveMenus();
});

// Gestion responsive intelligente avec menu hamburger
function handleResponsiveMenus() {
    const viewportWidth = window.innerWidth;
    const isMobile = viewportWidth <= 768;
    const isTablet = viewportWidth <= 1024;
    
    // Header responsive avec menu hamburger
    const headerMenu = document.getElementById('modern-header-menu');
    const navLinks = document.getElementById('nav-links');
    const hamburgerIcon = document.getElementById('hamburger-icon');
    
    if (headerMenu) {
        if (isMobile) {
            // Mode mobile : menu hamburger
            headerMenu.style.padding = '8px 16px';
            headerMenu.style.height = '44px';
            headerMenu.style.width = '100%';
            headerMenu.style.left = '0';
            headerMenu.style.borderRadius = '0 0 12px 12px';
            
            // Cacher les liens de navigation
            if (navLinks) {
                navLinks.style.display = 'none';
            }
            
            // Afficher le hamburger
            if (hamburgerIcon) {
                hamburgerIcon.style.display = 'flex';
            }
            
        } else if (isTablet) {
            // Mode tablette
            headerMenu.style.padding = '8px 18px';
            headerMenu.style.height = '44px';
            
            // Afficher les liens
            if (navLinks) {
                navLinks.style.display = 'flex';
            }
            
            // Cacher le hamburger
            if (hamburgerIcon) {
                hamburgerIcon.style.display = 'none';
            }
        } else {
            // Mode desktop
            headerMenu.style.padding = '8px 20px';
            headerMenu.style.height = '44px';
            
            // Afficher les liens
            if (navLinks) {
                navLinks.style.display = 'flex';
            }
            
            // Cacher le hamburger
            if (hamburgerIcon) {
                hamburgerIcon.style.display = 'none';
            }
        }
    }
    
    // Sidebar responsive
    const sidebar = document.getElementById('modern-sidebar');
    if (sidebar) {
        if (isMobile) {
            sidebar.style.width = '100%';
            sidebar.style.height = 'auto';
            sidebar.style.left = '0';
            sidebar.style.top = '100px';
            sidebar.style.borderRadius = '0';
            sidebar.style.padding = '16px';
            sidebar.style.position = 'relative';
        } else {
            sidebar.style.width = '260px';
            sidebar.style.height = '600px';
            sidebar.style.left = '50px';
            sidebar.style.top = '130px';
            sidebar.style.borderRadius = '16px';
            sidebar.style.padding = '20px';
            sidebar.style.position = 'fixed';
        }
    }
    
    // FAB responsive
    const fab = document.getElementById('modern-fab');
    if (fab) {
        if (isMobile) {
            fab.style.width = '56px';
            fab.style.height = '56px';
            fab.style.right = '16px';
            fab.style.bottom = '16px';
            fab.style.left = 'auto';
            fab.style.top = 'auto';
        } else {
            fab.style.width = '64px';
            fab.style.height = '64px';
            fab.style.right = '50px';
            fab.style.bottom = '50px';
            fab.style.left = 'auto';
            fab.style.top = 'auto';
        }
    }
}

// Injection de CSS responsive global
const responsiveStyles = `
<style id="menu-responsive-styles">
    /* Styles responsive pour les menus avec hamburger */
    @media (max-width: 768px) {
        #modern-header-menu #nav-links {
            display: none !important;
        }
        
        #modern-header-menu #hamburger-icon {
            display: flex !important;
        }
        
        .menu-container {
            transform: scale(1);
        }
        
        .menu-dropdown {
            max-width: calc(100vw - 20px) !important;
            left: 10px !important;
        }
        
        #modern-sidebar {
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2) !important;
        }
        
        /* Cache la section utilisateur sur très petit écran */
        #modern-header-menu #user-section {
            gap: 8px !important;
        }
        
        #modern-header-menu #user-section #notifications {
            display: none !important;
        }
    }
    
    @media (min-width: 769px) {
        #modern-header-menu #nav-links {
            display: flex !important;
        }
        
        #modern-header-menu #hamburger-icon {
            display: none !important;
        }
    }
    
    @media (max-width: 1024px) {
        .menu-dropdown {
            max-width: calc(100vw - 40px) !important;
        }
    }
    
    /* Animation pour les transitions responsive */
    .menu-container, .menu-dropdown {
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }
    
    /* Amélioration du z-index en cascade */
    #modern-header-menu { z-index: 1000 !important; }
    #modern-sidebar { z-index: 999 !important; }
    #modern-fab { z-index: 1002 !important; }
    #modern-context-menu { z-index: 2000 !important; }
    .menu-dropdown { z-index: 1001 !important; }
    
    /* Style pour les séparateurs responsive */
    @media (max-width: 768px) {
        .menu-separator {
            margin: 8px 0 !important;
        }
    }
</style>
`;

// Injection du CSS dans le head
if (!document.getElementById('menu-responsive-styles')) {
    document.head.insertAdjacentHTML('beforeend', responsiveStyles);
}

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', () => {
    handleResponsiveMenus();
});

// Appel initial
handleResponsiveMenus();

// Fonction utilitaire pour réinitialiser tous les états actifs
window.resetMenuStates = () => {
    currentActiveItem = null;
    document.querySelectorAll('[data-menu-id]').forEach(item => {
        item.style.backgroundColor = "";
        item.style.color = "#e0e6ed";
        item.style.borderLeft = "";
        item.style.transform = "";
    });
    console.log("🔄 États des menus réinitialisés");
};
