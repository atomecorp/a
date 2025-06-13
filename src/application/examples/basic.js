// / === 🎉 Démonstrations ===

// 1. Template basique
define('box', {
  tag: 'div',
  class: 'box',
  css: {
    width: '100px',
    height: '100px',
    backgroundColor: '#f00',
    transition: 'all 0.5s ease',
    margin: '10px'
  }
});

// 2. Animation avec CSS
const animatedBox = $('box', {
  parent: document.body,
  onmouseover: () => animatedBox.$({
    css: {
      width: '200px',
      height: '200px',
      backgroundColor: '#0f0'
    }
  }),
  onmouseout: () => animatedBox.$({
    css: {
      width: '100px',
      height: '100px',
      backgroundColor: '#f00'
    }
  })
});

// 3. Animation JS personnalisée
const jsAnimatedBox = $('box', {
  css: {
    backgroundColor: '#00f',
    marginLeft: '0'
  },
  text: 'Cliquez-moi !',
  onclick: () => {
    jsAnimatedBox.animate(
      { marginLeft: '200' },
      { duration: 500, easing: 'ease-in-out' }
    );
  },
  parent: body
});

// Ajouter une méthode animate() personnalisée
jsAnimatedBox.animate = (keyframes, options = {}) => {
  const {
    duration = 300,
    easing = 'linear',
    delay = 0
  } = options;

  let start = null;
  const computedStyle = window.getComputedStyle(jsAnimatedBox);
  
  const initial = {}, target = {};
  
  for (const prop in keyframes) {
    initial[prop] = parseFloat(computedStyle[toKebabCase(prop)]);
    target[prop] = parseFloat(keyframes[prop]);
  }

  const step = (timestamp) => {
    if (!start) start = timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);
    
    for (const prop in keyframes) {
      const value = initial[prop] + (target[prop] - initial[prop]) * progress;
      jsAnimatedBox.style.setProperty(toKebabCase(prop), value + 'px');
    }

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  };
  
  setTimeout(() => requestAnimationFrame(step), delay);
};

// 4. Observation des mutations
const logArea = $('log', {
  tag: 'div',
  css: {
    marginTop: '20px',
    padding: '10px',
    border: '1px solid #ccc',
    minHeight: '100px'
  },
  parent: body
});

observeMutations(animatedBox, (mutation) => {
  logArea.$({
    text: `Mutation détectée : ${mutation.type} - ${new Date().toLocaleTimeString()}`
  });
});

// 5. Bouton pour déclencher une mutation
$('btn', {
  text: 'Modifier le DOM',
  css: {
    padding: '10px 20px',
    cursor: 'pointer',
    backgroundColor: '#eee'
  },
  onclick: () => {
    animatedBox.textContent = 'Contenu modifié !';
  },
  parent: body
});

puts('hello');
