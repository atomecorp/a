// === 🎨 SVG Demonstrations with Squirrel - Simplified Version ===

// Import GSAP for advanced animations
// GSAP is globally available via src/js/gsap.min.js

// Check if GSAP is available
const checkGSAP = () => {
  if (typeof window !== 'undefined' && window.gsap) {
    puts('✅ GSAP detected and available');
    return true;
  } else {
    puts('⚠️ GSAP not available - animations will be limited');
    return false;
  }
};

// Check GSAP on load with delay
setTimeout(() => {
  const gsapAvailable = checkGSAP();
  if (!gsapAvailable) {
    puts('⚠️ Animations will fallback to CSS');
  }
}, 100);

// 1. SVG Container with custom styles
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

// 2. Demo title
$('h2', {
  text: '🎨 SVG Animations with Squirrel (Simplified Version)',
  css: {
    color: '#fff',
    textAlign: 'center',
    marginBottom: '20px'
  },
  parent: svgContainer
});

// 3. Atome SVG loaded from file - NEW SIMPLIFIED SYNTAX
const atomeSvg = $('svg', {
  id: 'svg-atome',
  attrs: {
    width: '200',
    height: '200',
    viewBox: '0 0 237 237',
    xmlns: 'http://www.w3.org/2000/svg'
  },
  svgSrc: './assets/images/logos/atome.svg',
  parent: svgContainer,
  css: {
    width: '200px',
    height: '200px',
    margin: '20px',
    padding: '10px',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.5s ease',
    backgroundColor: 'transparent',
    border: '2px solid #333'
  },
  onClick: () => {
    puts('🎨 Clicked on SVG - Starting deformation animation');
    toggleDeformation();
  },
  onMouseEnter: () => {
    atomeSvg.style.transform = 'scale(1.1)';
    atomeSvg.style.boxShadow = '0 0 20px rgba(201, 12, 125, 0.5)';
  },
  onMouseLeave: () => {
    if (!isDeforming) {
      atomeSvg.style.transform = 'scale(1)';
      atomeSvg.style.boxShadow = 'none';
    }
  }
});

// 4. Vie SVG loaded from file - COMPARISON
const vieSvg = $('svg', {
  id: 'svg-vie',
  attrs: {
    width: '200',
    height: '200',
    xmlns: 'http://www.w3.org/2000/svg'
  },
  svgSrc: './assets/images/logos/vie.svg',
  parent: svgContainer,
  css: {
    width: '200px',
    height: '200px',
    margin: '20px',
    padding: '10px',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.5s ease',
    backgroundColor: 'transparent',
    border: '2px solid #666'
  },
  onClick: () => {
    puts('💫 Clicked on Vie SVG - Starting rotation animation');
    animateRotation();
  },
  onMouseEnter: () => {
    vieSvg.style.transform = 'scale(1.1) rotate(5deg)';
    vieSvg.style.filter = 'brightness(1.2)';
  },
  onMouseLeave: () => {
    vieSvg.style.transform = 'scale(1) rotate(0deg)';
    vieSvg.style.filter = 'brightness(1)';
  }
});

// 5. Variables for animations
let currentColor = '#c90c7d';
let isAnimating = false;
let isDeforming = false;
let rotationAngle = 0;
let deformTweens = [];

// 6. Function to change the color of SVG paths
const changeAtomeColor = (color) => {
  const paths = atomeSvg.querySelectorAll('path');
  paths.forEach(path => {
    path.style.fill = color;
  });
};

// 7. Function to deform paths - SIMPLIFIED VERSION
const deformPaths = () => {
  puts('🎨 CSS deformation activated');
  
  const paths = atomeSvg.querySelectorAll('path');
  paths.forEach((path, index) => {
    const randomScale = 0.7 + Math.random() * 0.6;
    const randomRotation = -20 + Math.random() * 40;
    const randomX = -15 + Math.random() * 30;
    const randomY = -15 + Math.random() * 30;
    
    path.style.transition = `transform ${2 + index * 0.3}s ease-in-out`;
    path.style.transformOrigin = 'center center';
    path.style.transform = `
      scale(${randomScale}) 
      rotate(${randomRotation}deg) 
      translate(${randomX}px, ${randomY}px)
    `;
    
    const animationInterval = setInterval(() => {
      if (!isDeforming) {
        clearInterval(animationInterval);
        return;
      }
      
      const newScale = 0.8 + Math.random() * 0.4;
      const newRotation = -25 + Math.random() * 50;
      const newX = -12 + Math.random() * 24;
      const newY = -12 + Math.random() * 24;
      
      path.style.transform = `
        scale(${newScale}) 
        rotate(${newRotation}deg) 
        translate(${newX}px, ${newY}px)
      `;
    }, 3000 + index * 500);
    
    deformTweens.push({ kill: () => clearInterval(animationInterval) });
  });
  
  let hue = 0;
  const colorInterval = setInterval(() => {
    if (!isDeforming) {
      clearInterval(colorInterval);
      return;
    }
    hue = (hue + 3) % 360;
    const color = `hsl(${hue}, 75%, 55%)`;
    paths.forEach(path => {
      if (path && path.style) {
        path.style.fill = color;
      }
    });
  }, 100);
  
  deformTweens.push({ kill: () => clearInterval(colorInterval) });
};

// 8. Function to stop deformation
const stopDeformation = () => {
  deformTweens.forEach(tween => {
    if (tween && typeof tween.kill === 'function') {
      tween.kill();
    }
  });
  deformTweens = [];
  
  const paths = atomeSvg.querySelectorAll('path');
  paths.forEach(path => {
    if (path && path.style) {
      path.style.transition = 'transform 0.8s ease-out';
      path.style.transform = 'scale(1) rotate(0deg) translate(0px, 0px)';
    }
  });
  
  setTimeout(() => {
    changeAtomeColor(currentColor);
  }, 200);
  
  puts('✅ Deformation stopped');
};

// 9. Toggle deformation
const toggleDeformation = () => {
  if (isDeforming) {
    isDeforming = false;
    stopDeformation();
  } else {
    isDeforming = true;
    deformPaths();
  }
};

// 10. Rotation animation for Vie SVG
const animateRotation = () => {
  let currentRotation = 0;
  const rotationInterval = setInterval(() => {
    currentRotation += 5;
    vieSvg.style.transform = `rotate(${currentRotation}deg)`;
    
    if (currentRotation >= 360) {
      clearInterval(rotationInterval);
      vieSvg.style.transform = 'rotate(0deg)';
    }
  }, 50);
};

// 11. Control panel - SIMPLIFIED VERSION
const controlPanel = $('div', {
  id: 'control-panel',
  css: {
    margin: '20px auto',
    padding: '20px',
    backgroundColor: '#2a2a2a',
    borderRadius: '10px',
    textAlign: 'center',
    width: '80%',
    maxWidth: '600px'
  },
  parent: '#view'
});

$('h3', {
  text: '🎮 Controls',
  css: {
    color: '#fff',
    marginBottom: '15px'
  },
  parent: controlPanel
});

// Toggle Deformation Button
$('button', {
  text: '🎨 Toggle Deformation',
  css: {
    padding: '10px 20px',
    margin: '5px',
    backgroundColor: '#c90c7d',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  onClick: toggleDeformation,
  parent: controlPanel
});

// Vie Rotation Button
$('button', {
  text: '💫 Rotate Vie',
  css: {
    padding: '10px 20px',
    margin: '5px',
    backgroundColor: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  onClick: animateRotation,
  parent: controlPanel
});

// Reset Button
$('button', {
  text: '🔄 Reset',
  css: {
    padding: '10px 20px',
    margin: '5px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  onClick: () => {
    isDeforming = false;
    stopDeformation();
    vieSvg.style.transform = 'rotate(0deg)';
    atomeSvg.style.transform = 'scale(1)';
    puts('🔄 Full reset');
  },
  parent: controlPanel
});

// 12. Instructions
$('div', {
  css: {
    backgroundColor: '#333',
    color: '#fff',
    padding: '15px',
    margin: '20px',
    borderRadius: '8px',
    lineHeight: '1.5',
    textAlign: 'left'
  },
  innerHTML: `
    <h3>🎮 Instructions:</h3>
    <ul>
      <li><strong>Click on the Atome</strong> to start/stop deformation</li>
      <li><strong>Click on the Vie SVG</strong> for a full rotation</li>
      <li><strong>Hover over the SVGs</strong> for hover effects</li>
      <li><strong>Use the buttons</strong> to control animations</li>
      <li><strong>SVGs are loaded</strong> with the new simplified syntax</li>
    </ul>
    <h4>🔧 New Syntax:</h4>
    <pre style="background: #222; padding: 10px; border-radius: 5px; overflow-x: auto; font-size: 12px;">
const svg = $('svg', {
  svgSrc: './assets/images/logos/atome.svg',
  attrs: { width: '200', height: '200' },
  onClick: () => console.log('Click!'),
  css: { margin: '20px' }
});
    </pre>
  `,
  parent: controlPanel
});

puts('✅ Simplified SVG demo loaded!');
puts('🎨 Click on the SVGs or use the buttons to animate them');
puts('📝 Much simpler code with the new $ syntax!');