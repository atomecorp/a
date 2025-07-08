// === 🎨 Démonstrations SVG avec Squirrel ===

// Import GSAP pour les animations avancées
// GSAP est disponible globalement via src/js/gsap.min.js

// Vérification de la disponibilité de GSAP
const checkGSAP = () => {
  if (typeof window !== 'undefined' && window.gsap) {
    puts('✅ GSAP détecté et disponible');
    return true;
  } else {
    puts('⚠️ GSAP non disponible - animations limitées');
    return false;
  }
};

// Vérifier GSAP au chargement avec délai
setTimeout(() => {
  const gsapAvailable = checkGSAP();
  if (!gsapAvailable) {
    puts('⚠️ Les animations utilisent CSS comme fallback');
  }
}, 100);

// 1. SVG Container avec styles personnalisés
const svgContainer = $('div', {
  id: 'svg-container',
  css: {
    backgroundColor: '#1a1a1a',
    padding: '20px',
    margin: '20px',
    borderRadius: '10px',
    textAlign: 'center',
    minHeight: '400px'
  }
});

// 2. Titre de la démonstration
$('h2', {
  text: '🎨 Animations SVG avec Squirrel',
  css: {
    color: '#fff',
    textAlign: 'center',
    marginBottom: '20px'
  },
  parent: svgContainer
});

// 3. Container pour le SVG chargé depuis atome.svg
const svgWrapper = $('div', {
  id: 'svg-wrapper',
  css: {
    display: 'inline-block',
    margin: '20px',
    padding: '10px',
    border: '2px solid #333',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.5s ease',
    backgroundColor: 'transparent'
  },
  parent: svgContainer
});

// Variable pour stocker le SVG une fois chargé
let atomeSvg = null;

// Charger le SVG depuis le fichier atome.svg
const loadAtomeSvg = async () => {
  try {
    const response = await fetch('../../assets/images/atome.svg');
    const svgText = await response.text();
    
    // Créer un parser DOM pour le SVG
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;
    
    // Configurer les attributs du SVG
    svgElement.setAttribute('width', '200');
    svgElement.setAttribute('height', '200');
    svgElement.setAttribute('id', 'svg-atome');
    
    // Ajouter le SVG au wrapper
    svgWrapper.appendChild(svgElement);
    atomeSvg = svgElement;
    
    // Appliquer les styles CSS au SVG
    atomeSvg.style.backgroundColor = 'transparent';
    atomeSvg.style.transition = 'all 0.5s ease';
    
    // Attacher les événements une fois le SVG chargé
    attachSvgEvents();
    
    // Sauvegarder les transformations originales
    saveOriginalTransforms();
    
    puts('✅ SVG atome.svg chargé avec succès !');
    puts('🎨 GSAP disponible pour les animations avancées');
    
  } catch (error) {
    console.error('❌ Erreur lors du chargement du SVG:', error);
    
    // Fallback: créer un SVG de substitution
    atomeSvg = $('svg', {
      id: 'svg-atome-fallback',
      attrs: {
        width: '200',
        height: '200',
        viewBox: '0 0 237 237',
        xmlns: 'http://www.w3.org/2000/svg'
      },
      innerHTML: `
        <g transform="matrix(0.0267056,0,0,0.0267056,18.6376,20.2376)">
          <g id="shapePath1" transform="matrix(4.16667,0,0,4.16667,-377.307,105.632)">
            <path d="M629.175,81.832C740.508,190.188 742.921,368.28 634.565,479.613C526.209,590.945 348.116,593.358 236.784,485.002C125.451,376.646 123.038,198.554 231.394,87.221C339.75,-24.111 517.843,-26.524 629.175,81.832Z" style="fill:rgb(201,12,125);"/>
          </g>
          <g id="shapePath2" transform="matrix(4.16667,0,0,4.16667,-377.307,105.632)">
            <path d="M1679.33,410.731C1503.98,413.882 1402.52,565.418 1402.72,691.803C1402.91,818.107 1486.13,846.234 1498.35,1056.78C1501.76,1313.32 1173.12,1490.47 987.025,1492.89C257.861,1502.39 73.275,904.061 71.639,735.381C70.841,653.675 1.164,647.648 2.788,737.449C12.787,1291.4 456.109,1712.79 989.247,1706.24C1570.67,1699.09 1982.31,1234 1965.76,683.236C1961.3,534.95 1835.31,407.931 1679.33,410.731Z" style="fill:rgb(201,12,125);"/>
          </g>
        </g>
      `,
      parent: svgWrapper
    });
    
    // Attacher les événements même avec le fallback
    attachSvgEvents();
    
    // Sauvegarder les transformations originales
    saveOriginalTransforms();
    
    puts('⚠️ Utilisation du SVG de substitution');
  }
};

// Charger le SVG
loadAtomeSvg();

// 4. Variables pour les animations
let currentColor = '#c90c7d'; // Couleur initiale
let isAnimating = false;
let isDeforming = false;
let rotationAngle = 0;
let deformTweens = [];

// 5. Fonction pour changer la couleur des paths SVG
const changeAtomeColor = (color) => {
  if (!atomeSvg) return;
  const paths = atomeSvg.querySelectorAll('path');
  paths.forEach(path => {
    path.style.fill = color;
  });
};

// 6. Fonction pour sauvegarder les transformations originales
let originalTransforms = [];

const saveOriginalTransforms = () => {
  if (!atomeSvg) return;
  originalTransforms = [];
  const paths = atomeSvg.querySelectorAll('path');
  paths.forEach(path => {
    originalTransforms.push(path.getAttribute('transform') || '');
  });
};

// 7. Fonction pour déformer les paths - VERSION SANS GSAP (plus stable)
const deformPaths = () => {
  if (!atomeSvg) {
    console.warn('Aucun SVG disponible pour la déformation');
    return;
  }
  
  // Nettoyer d'abord toutes les animations existantes
  cleanupAnimations();
  
  // Utiliser uniquement CSS pour éviter les erreurs GSAP
  puts('🎨 Déformation CSS activée (plus stable)');
  deformPathsCSS();
};

// 7a. Fonction de nettoyage des animations
const cleanupAnimations = () => {
  // Nettoyer les tweens personnalisés
  deformTweens.forEach(tween => {
    if (tween && typeof tween.kill === 'function') {
      tween.kill();
    }
  });
  deformTweens = [];
  
  // Nettoyer les styles CSS précédents
  if (atomeSvg) {
    const paths = atomeSvg.querySelectorAll('path');
    paths.forEach(path => {
      if (path && path.style) {
        path.style.transition = '';
        path.style.transform = '';
      }
    });
  }
};

// 7b. Fonction de déformation CSS améliorée
const deformPathsCSS = () => {
  if (!atomeSvg) return;
  
  const paths = atomeSvg.querySelectorAll('path');
  paths.forEach((path, index) => {
    // Créer des valeurs aléatoires pour chaque path
    const randomScale = 0.7 + Math.random() * 0.6; // 0.7 à 1.3
    const randomRotation = -20 + Math.random() * 40; // -20 à 20 degrés
    const randomX = -15 + Math.random() * 30; // -15 à 15 pixels
    const randomY = -15 + Math.random() * 30; // -15 à 15 pixels
    
    // Appliquer les transformations CSS avec des transitions fluides
    path.style.transition = `transform ${2 + index * 0.3}s ease-in-out`;
    path.style.transformOrigin = 'center center';
    path.style.transform = `
      scale(${randomScale}) 
      rotate(${randomRotation}deg) 
      translate(${randomX}px, ${randomY}px)
    `;
    
    // Animation continue avec des changements périodiques
    const animationInterval = setInterval(() => {
      if (!isDeforming) {
        clearInterval(animationInterval);
        return;
      }
      
      // Nouvelles valeurs aléatoires
      const newScale = 0.8 + Math.random() * 0.4;
      const newRotation = -25 + Math.random() * 50;
      const newX = -12 + Math.random() * 24;
      const newY = -12 + Math.random() * 24;
      
      path.style.transform = `
        scale(${newScale}) 
        rotate(${newRotation}deg) 
        translate(${newX}px, ${newY}px)
      `;
    }, 3000 + index * 500); // Intervalles différents pour chaque path
    
    deformTweens.push({ kill: () => clearInterval(animationInterval) });
  });
  
  // Animation de couleur CSS
  let hue = 0;
  const colorInterval = setInterval(() => {
    if (!isDeforming) {
      clearInterval(colorInterval);
      return;
    }
    hue = (hue + 3) % 360; // Progression plus rapide
    const color = `hsl(${hue}, 75%, 55%)`; // Couleurs plus vives
    paths.forEach(path => {
      if (path && path.style) {
        path.style.fill = color;
      }
    });
  }, 100); // Mise à jour plus fréquente
  
  deformTweens.push({ kill: () => clearInterval(colorInterval) });
};

// 8. Fonction pour arrêter la déformation - VERSION SANS GSAP (plus stable)
const stopDeformation = () => {
  // Arrêter toutes les animations de déformation
  deformTweens.forEach(tween => {
    if (tween && typeof tween.kill === 'function') {
      tween.kill();
    }
  });
  deformTweens = [];
  
  // Retourner à l'état original - TOUJOURS CSS pour éviter les erreurs GSAP
  if (atomeSvg) {
    const paths = atomeSvg.querySelectorAll('path');
    
    // Utiliser uniquement CSS pour éviter les conflits GSAP
    paths.forEach(path => {
      if (path && path.style) {
        path.style.transition = 'transform 0.8s ease-out';
        path.style.transform = 'scale(1) rotate(0deg) translate(0px, 0px)';
      }
    });
    
    // Restaurer la couleur avec délai
    setTimeout(() => {
      if (atomeSvg) {
        changeAtomeColor(currentColor);
      }
    }, 200);
  }
  
  puts('✅ Déformation arrêtée - retour à l\'état original');
};

// 9. Fonction pour animer la rotation - VERSION CSS PURE
const animateRotation = () => {
  if (!isAnimating || !atomeSvg) return;
  
  puts('🔄 Animation de rotation CSS activée');
  
  // Utiliser CSS pour éviter les erreurs GSAP
  animateRotationCSS();
};

// 9b. Fonction fallback pour rotation CSS
const animateRotationCSS = () => {
  if (!isAnimating || !atomeSvg) return;
  
  rotationAngle += 2;
  atomeSvg.style.transform = `rotate(${rotationAngle}deg) scale(${1 + Math.sin(rotationAngle * Math.PI / 180) * 0.1})`;
  
  // Changer la couleur en fonction de l'angle
  const hue = (rotationAngle * 2) % 360;
  const color = `hsl(${hue}, 70%, 50%)`;
  changeAtomeColor(color);
  
  if (isAnimating) {
    requestAnimationFrame(animateRotationCSS);
  }
};

// 11. Fonction pour attacher les événements une fois le SVG chargé
const attachSvgEvents = () => {
  if (!atomeSvg) return;
  
  // Sauvegarder les transformations originales
  saveOriginalTransforms();
  
  // Événement de clic pour démarrer/arrêter l'animation de rotation
  atomeSvg.addEventListener('click', () => {
    isAnimating = !isAnimating;
    if (isAnimating) {
      // Arrêter la déformation si elle est active
      if (isDeforming) {
        isDeforming = false;
        stopDeformation();
      }
      animateRotation();
      svgWrapper.$({
        css: {
          borderColor: '#00ff00',
          backgroundColor: 'rgba(0,255,0,0.1)'
        }
      });
    } else {
      // Arrêter toutes les animations de rotation
      if (window.gsap) {
        gsap.killTweensOf(atomeSvg);
      }
      // Restaurer l'état original
      if (atomeSvg) {
        atomeSvg.style.transform = '';
        changeAtomeColor(currentColor);
      }
      svgWrapper.$({
        css: {
          borderColor: '#333',
          backgroundColor: 'transparent'
        }
      });
    }
  });
  
  // Événement de double-clic pour démarrer/arrêter la déformation GSAP
  atomeSvg.addEventListener('dblclick', () => {
    isDeforming = !isDeforming;
    if (isDeforming) {
      // Arrêter la rotation si elle est active
      if (isAnimating) {
        isAnimating = false;
        if (window.gsap) {
          gsap.killTweensOf(atomeSvg);
        }
        // Restaurer transform
        if (atomeSvg) {
          atomeSvg.style.transform = '';
        }
      }
      deformPaths();
      svgWrapper.$({
        css: {
          borderColor: '#ff6b00',
          backgroundColor: 'rgba(255,107,0,0.1)'
        }
      });
    } else {
      stopDeformation();
      svgWrapper.$({
        css: {
          borderColor: '#333',
          backgroundColor: 'transparent'
        }
      });
    }
  });

  // Événement de hover pour des effets supplémentaires
  atomeSvg.addEventListener('mouseenter', () => {
    if (!isAnimating && !isDeforming) {
      svgWrapper.$({
        css: {
          transform: 'scale(1.1)',
          borderColor: '#ff6b6b',
          backgroundColor: 'rgba(255,107,107,0.1)'
        }
      });
    }
  });

  atomeSvg.addEventListener('mouseleave', () => {
    if (!isAnimating && !isDeforming) {
      svgWrapper.$({
        css: {
          transform: 'scale(1)',
          borderColor: '#333',
          backgroundColor: 'transparent'
        }
      });
    }
  });
};

// 11. Boutons de contrôle
const controlsContainer = $('div', {
  css: {
    marginTop: '20px',
    display: 'flex',
    justifyContent: 'center',
    gap: '10px',
    flexWrap: 'wrap'
  },
  parent: svgContainer
});

// Bouton pour couleur rouge
$('button', {
  text: '🔴 Rouge',
  css: {
    padding: '10px 20px',
    backgroundColor: '#ff4757',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  onclick: () => {
    if (!isAnimating && atomeSvg) {
      changeAtomeColor('#ff4757');
    }
  },
  parent: controlsContainer
});

// Bouton pour couleur bleue
$('button', {
  text: '🔵 Bleu',
  css: {
    padding: '10px 20px',
    backgroundColor: '#3742fa',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  onclick: () => {
    if (!isAnimating && atomeSvg) {
      changeAtomeColor('#3742fa');
    }
  },
  parent: controlsContainer
});

// Bouton pour couleur verte
$('button', {
  text: '🟢 Vert',
  css: {
    padding: '10px 20px',
    backgroundColor: '#2ed573',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  onclick: () => {
    if (!isAnimating && atomeSvg) {
      changeAtomeColor('#2ed573');
    }
  },
  parent: controlsContainer
});

// Bouton pour couleur originale
$('button', {
  text: '🎯 Original',
  css: {
    padding: '10px 20px',
    backgroundColor: '#c90c7d',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  onclick: () => {
    if (!isAnimating && atomeSvg) {
      changeAtomeColor('#c90c7d');
    }
  },
  parent: controlsContainer
});

// Bouton pour recharger le SVG
$('button', {
  text: '🔄 Recharger SVG',
  css: {
    padding: '10px 20px',
    backgroundColor: '#5f27cd',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  onclick: () => {
    if (atomeSvg) {
      // Nettoyer complètement toutes les animations
      isAnimating = false;
      isDeforming = false;
      
      // Nettoyer les tweens personnalisés d'abord
      deformTweens.forEach(tween => {
        if (tween && typeof tween.kill === 'function') {
          tween.kill();
        }
      });
      deformTweens = [];
      
      // Nettoyage GSAP plus sûr
      if (window.gsap) {
        try {
          // Nettoyer uniquement les animations liées à l'atome
          if (atomeSvg) {
            gsap.killTweensOf(atomeSvg);
            const paths = atomeSvg.querySelectorAll('path');
            paths.forEach(path => {
              if (path) {
                gsap.killTweensOf(path);
              }
            });
          }
        } catch (error) {
          console.warn('Erreur lors du nettoyage GSAP:', error);
        }
      }
      
      // Retirer l'ancien SVG
      if (svgWrapper.contains(atomeSvg)) {
        svgWrapper.removeChild(atomeSvg);
      }
      atomeSvg = null;
      rotationAngle = 0;
      
      // Restaurer l'état du wrapper
      svgWrapper.$({
        css: {
          borderColor: '#333',
          backgroundColor: 'transparent',
          transform: 'scale(1)'
        }
      });
      
      // Recharger
      loadAtomeSvg();
      puts('🔄 SVG rechargé avec succès');
    }
  },
  parent: controlsContainer
});

// Bouton pour déformation CSS (renommé pour plus de clarté)
$('button', {
  text: '🌀 Déformer (CSS)',
  css: {
    padding: '10px 20px',
    backgroundColor: '#ff6b00',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  onclick: () => {
    if (atomeSvg) {
      // Vérifier que l'atome n'est pas en cours d'animation de rotation
      if (isAnimating) {
        puts('⚠️ Arrêtez d\'abord l\'animation de rotation');
        return;
      }
      
      isDeforming = !isDeforming;
      if (isDeforming) {
        puts('🎨 Déformation CSS activée');
        deformPaths();
        svgWrapper.$({
          css: {
            borderColor: '#ff6b00',
            backgroundColor: 'rgba(255,107,0,0.1)'
          }
        });
      } else {
        puts('⏹️ Déformation CSS arrêtée');
        stopDeformation();
        svgWrapper.$({
          css: {
            borderColor: '#333',
            backgroundColor: 'transparent'
          }
        });
      }
    }
  },
  parent: controlsContainer
});

// 9. SVG créé entièrement via JavaScript
const customSvg = $('svg', {
  id: 'svg-custom',
  attrs: {
    width: '150',
    height: '150',
    viewBox: '0 0 150 150',
    xmlns: 'http://www.w3.org/2000/svg'
  },
  css: {
    backgroundColor: '#2c2c2c',
    margin: '20px',
    padding: '10px',
    border: '2px solid #555',
    borderRadius: '50%',
    display: 'inline-block',
    cursor: 'pointer'
  },
  parent: svgContainer
});

// Créer des éléments SVG via JavaScript
const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
circle.setAttribute('cx', '75');
circle.setAttribute('cy', '75');
circle.setAttribute('r', '50');
circle.setAttribute('fill', '#ff6b6b');
circle.setAttribute('stroke', '#fff');
circle.setAttribute('stroke-width', '3');
customSvg.appendChild(circle);

// Animation pulsation pour le cercle personnalisé
let pulseDirection = 1;
let currentRadius = 50;

const animatePulse = () => {
  currentRadius += pulseDirection * 0.5;
  
  if (currentRadius >= 60) {
    pulseDirection = -1;
  } else if (currentRadius <= 40) {
    pulseDirection = 1;
  }
  
  circle.setAttribute('r', currentRadius);
  
  // Changer la couleur en fonction du rayon
  const intensity = Math.round(((currentRadius - 40) / 20) * 255);
  circle.setAttribute('fill', `rgb(${255 - intensity}, ${intensity}, ${intensity})`);
  
  requestAnimationFrame(animatePulse);
};

// Démarrer l'animation de pulsation
animatePulse();

// 10. Instructions pour l'utilisateur
$('div', {
  css: {
    backgroundColor: '#333',
    color: '#fff',
    padding: '15px',
    margin: '20px',
    borderRadius: '8px',
    lineHeight: '1.5'
  },
  innerHTML: `
    <h3>🎮 Instructions :</h3>
    <ul>
      <li><strong>Cliquez sur l'atome</strong> pour démarrer/arrêter l'animation de rotation</li>
      <li><strong>Double-cliquez sur l'atome</strong> pour démarrer/arrêter la déformation GSAP</li>
      <li><strong>Utilisez le bouton "🌀 Déformer (GSAP)"</strong> pour activer la déformation avancée</li>
      <li><strong>Survolez l'atome</strong> pour un effet de zoom</li>
      <li><strong>Utilisez les boutons</strong> pour changer la couleur de l'atome</li>
      <li><strong>Le cercle à droite</strong> pulse automatiquement</li>
      <li><strong>Le SVG est chargé</strong> depuis le fichier assets/images/atome.svg</li>
      <li><strong>GSAP est utilisé</strong> pour des animations fluides et professionnelles</li>
    </ul>
  `
});

// 11. Exemple d'utilisation avec un SVG externe
const externalSvgExample = $('div', {
  css: {
    backgroundColor: '#444',
    color: '#fff',
    padding: '15px',
    margin: '20px',
    borderRadius: '8px'
  },
  innerHTML: `
    <h3>📁 Chargement SVG externe depuis assets :</h3>
    <p>Le SVG principal est chargé depuis <strong>assets/images/atome.svg</strong> avec fetch() :</p>
    <pre style="background: #222; padding: 10px; border-radius: 5px; overflow-x: auto;">
// Chargement asynchrone
const response = await fetch('../../assets/images/atome.svg');
const svgText = await response.text();
const parser = new DOMParser();
const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
const svgElement = svgDoc.documentElement;

// Configuration et ajout au DOM
svgElement.setAttribute('width', '200');
svgElement.setAttribute('height', '200');
svgWrapper.appendChild(svgElement);
    </pre>
    <p><strong>Avantages :</strong> Réutilisable, modifiable, source unique</p>
  `
});

// 12. Exemple d'utilisation de GSAP pour les animations SVG
const gsapExample = $('div', {
  css: {
    backgroundColor: '#2c3e50',
    color: '#fff',
    padding: '15px',
    margin: '20px',
    borderRadius: '8px'
  },
  innerHTML: `
    <h3>⚡ Animations GSAP :</h3>
    <p>La déformation utilise <strong>GSAP</strong> pour des animations fluides et professionnelles :</p>
    <pre style="background: #222; padding: 10px; border-radius: 5px; overflow-x: auto;">
// Création d'une timeline GSAP pour chaque path
const tl = gsap.timeline({ repeat: -1, yoyo: true });

// Animation de déformation organique
tl.to(path, {
  duration: 2 + Math.random() * 2,
  scaleX: 0.8 + Math.random() * 0.4,
  scaleY: 0.8 + Math.random() * 0.4,
  rotation: -10 + Math.random() * 20,
  x: -5 + Math.random() * 10,
  y: -5 + Math.random() * 10,
  ease: "power2.inOut"
})
.to(path, {
  duration: 1.5 + Math.random() * 1.5,
  scaleX: 1.1 + Math.random() * 0.2,
  scaleY: 1.1 + Math.random() * 0.2,
  rotation: -5 + Math.random() * 10,
  x: -3 + Math.random() * 6,
  y: -3 + Math.random() * 6,
  ease: "elastic.out(1, 0.3)"
});
    </pre>
    <p><strong>Avantages GSAP :</strong> Performance optimisée, easings avancés, contrôle précis</p>
  `
});

puts('✅ Exemple SVG avec GSAP chargé avec succès !');
puts('🎨 Double-cliquez sur l\'atome pour voir la déformation GSAP en action !');
