class JSONToVanillaConverter {
  constructor() {
    this.cache = {};
    this.globalHandlers = {};
    this.themeTokens = {};
    this.compiledComponents = {};
  }

  // Point d'entrée principal
  convert(jsonData) {
    if (typeof jsonData === 'string') {
      jsonData = JSON.parse(jsonData);
    }
    
    const componentClass = this.generateComponentClass(jsonData);
    const compiledCode = this.compileToFunction(componentClass, jsonData.id);
    
    return {
      code: compiledCode,
      factory: this.createFactory(jsonData),
      instance: () => new (this.createFactory(jsonData))()
    };
  }

  // Génère une classe VanillaJS optimisée
  generateComponentClass(data) {
    const className = this.toPascalCase(data.id);
    const props = data.props || {};
    
    return `
class ${className} {
  constructor(parentElement = null) {
    this.id = '${data.id}';
    this.element = null;
    this.props = ${JSON.stringify(props, null, 2)};
    this.children = [];
    this.handlers = {};
    this.vars = ${JSON.stringify(data.props?.variables || {})};
    this.isDestroyed = false;
    
    this.init(parentElement);
  }

  init(parentElement) {
    this.createElement();
    this.setupGeometry();
    this.setupStyling();
    this.setupEvents();
    this.setupAnimations();
    this.setupChildren();
    this.runMountActions();
    
    if (parentElement) {
      parentElement.appendChild(this.element);
    }
  }

  createElement() {
    this.element = document.createElement('div');
    this.element.id = this.id;
    this.element.className = 'atomic-component ${data.type}';
    this.element._component = this;
  }

  ${this.generateGeometryMethods(props.geometry)}
  
  ${this.generateStylingMethods(props)}
  
  ${this.generateEventMethods(props.interactions, props.listeners)}
  
  ${this.generateAnimationMethods(props.animation)}
  
  ${this.generateComputedMethods(props.computed)}
  
  ${this.generateActionMethods(props.actions)}

  setupChildren() {
    ${this.generateChildrenSetup(data.children)}
  }

  createChild(childId) {
    // Placeholder: retourne null, à surcharger pour gestion réelle des enfants
    return null;
  }

  // API publique optimisée
  updateProp(key, value) {
    const keys = key.split('.');
    let target = this.props;
    
    for (let i = 0; i < keys.length - 1; i++) {
      target = target[keys[i]] = target[keys[i]] || {};
    }
    
    target[keys[keys.length - 1]] = value;
    this.applyUpdate(key, value);
  }

  applyUpdate(key, value) {
    switch (key.split('.')[0]) {
      case 'geometry':
        this.setupGeometry();
        break;
      case 'color':
        this.setupStyling();
        break;
      case 'animation':
        this.setupAnimations();
        break;
      default:
        this.element.style.setProperty(\`--\${key.replace('.', '-')}\`, value);
    }
  }

  destroy() {
    if (this.isDestroyed) return;
    
    this.children.forEach(child => child.destroy?.());
    this.handlers = {};
    this.element?._component && (this.element._component = null);
    this.element?.remove();
    this.isDestroyed = true;
  }
}`;
  }

  // Génère les méthodes de géométrie ultra-optimisées
  generateGeometryMethods(geometry) {
    if (!geometry) return '';
    
    return `
  setupGeometry() {
    const g = this.props.geometry;
    if (!g) return;
    
    // Style direct pour performance maximale
    const s = this.element.style;
    
    if (g.size) {
      s.width = g.size.width + 'px';
      s.height = g.size.height + 'px';
    }
    
    if (g.position) {
      s.position = 'absolute';
      s.left = g.position.x + 'px';
      s.top = g.position.y + 'px';
    }
    
    if (g.smooth) {
      s.borderRadius = g.smooth + 'px';
    }
  }`;
  }

  // Génère les méthodes de styling haute performance
  generateStylingMethods(props) {
    const methods = [];
    
    methods.push(`
  setupStyling() {
    const s = this.element.style;
    const p = this.props;
    
    // Couleurs
    if (p.color) {
      const c = p.color;
      s.backgroundColor = \`rgba(\${c.red * 255}, \${c.green * 255}, \${c.blue * 255}, \${c.alpha})\`;
    }
    
    // Texte
    if (p.contents) {
      this.element.textContent = p.contents.text;
      if (p.contents.color) {
        const tc = p.contents.color;
        s.color = \`rgba(\${tc.red * 255}, \${tc.green * 255}, \${tc.blue * 255}, \${tc.alpha})\`;
      }
      if (p.contents.font) {
        s.fontFamily = p.contents.font.name;
        s.fontWeight = p.contents.font.weight;
        s.fontSize = p.contents.font.size + 'px';
      }
      if (p.contents.align) {
        s.textAlign = p.contents.align;
      }
    }
    
    // Border
    if (p.border) {
      const b = p.border;
      s.borderWidth = b.width + 'px';
      s.borderStyle = b.style;
      if (b.color) {
        const bc = b.color;
        s.borderColor = \`rgba(\${bc.red * 255}, \${bc.green * 255}, \${bc.blue * 255}, \${bc.alpha})\`;
      }
    }
    
    // Shadow
    if (p.shadow) {
      const sh = p.shadow;
      s.boxShadow = \`\${sh.left}px \${sh.top}px \${sh.blur}px rgba(\${sh.red * 255}, \${sh.green * 255}, \${sh.blue * 255}, \${sh.alpha})\`;
    }
    
    // Layout
    if (p.layout) {
      const l = p.layout;
      s.display = l.type;
      if (l.type === 'flex') {
        s.flexDirection = l.direction;
        s.justifyContent = l.justify;
        s.alignItems = l.align;
        s.gap = l.gap + 'px';
        if (l.padding) {
          s.padding = \`\${l.padding.top}px \${l.padding.right}px \${l.padding.bottom}px \${l.padding.left}px\`;
        }
      }
    }
  }`);
    
    return methods.join('\n');
  }

  // Génère les gestionnaires d'événements optimisés
  generateEventMethods(interactions, listeners) {
    let methods = [`
  setupEvents() {
    this.bindEventHandlers();
  }
  
  bindEventHandlers() {`];

    // Interactions de drag
    if (interactions?.drag?.enabled) {
      methods.push(`
    // Drag handlers - Performance optimisée
    let dragData = {};
    let moveHandler, upHandler;
    
    this.element.addEventListener('mousedown', (e) => {
      if (!this.props.interactions?.drag?.enabled) return;
      e.preventDefault();
      dragData.dragging = true;
      
      // Désactiver les transitions pendant le drag
      const originalTransition = this.element.style.transition;
      this.element.style.transition = 'none';
      
      ${this.compileEventActions(interactions.drag.onDragStart, 'dragData')}
      
      moveHandler = (e) => {
        if (!dragData.dragging) return;
        ${this.compileEventActions(interactions.drag.onDragMove, 'dragData')}
      };
      
      upHandler = (e) => {
        if (!dragData.dragging) return;
        ${this.compileEventActions(interactions.drag.onDragEnd, 'dragData')}
        dragData = {};
        
        // Restaurer les transitions
        this.element.style.transition = originalTransition;
        
        // Nettoyer les listeners
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('mouseup', upHandler);
      };
      
      // Ajouter les listeners seulement pendant le drag
      document.addEventListener('mousemove', moveHandler, { passive: true });
      document.addEventListener('mouseup', upHandler);
    }, { passive: false });`);
    }

    // Autres événements
    if (listeners) {
      Object.entries(listeners).forEach(([event, handler]) => {
        methods.push(`
    this.element.addEventListener('${event}', (e) => {
      this.${handler}(e);
    });`);
      });
    }

    methods.push('  }');
    return methods.join('\n');
  }

  // Compile les actions d'événements en JS natif
  compileEventActions(actions, dataVar = 'data') {
    if (!actions || !Array.isArray(actions)) return '';
    
    return actions.map(action => {
      // Remplace les variables par les vraies références
      return action
        .replace(/\bel\b/g, 'this.element')
        .replace(/\bevent\b/g, 'e')
        .replace(/\bdata\b/g, dataVar);
    }).join('\n      ');
  }

  // Génère les méthodes d'animation
  generateAnimationMethods(animation) {
    if (!animation) return '';
    
    return `
  setupAnimations() {
    // Ne rien faire ici : aucune transition par défaut
  }

  playAnimation() {
    const anim = this.props.animation;
    if (!anim) return;
    // Appliquer la transition uniquement sur les propriétés nécessaires
    this.element.style.transition = \`opacity \${anim.duration}ms \${anim.easing}, transform \${anim.duration}ms \${anim.easing}\`;
    // Animation selon le type
    switch (anim.type) {
      case 'slide-in':
        this.element.style.transform = 'translateY(0)';
        this.element.style.opacity = '1';
        break;
      case 'fade-in':
        this.element.style.opacity = '1';
        break;
    }
    // Nettoyer la transition après l'animation
    setTimeout(() => {
      this.element.style.transition = '';
    }, anim.duration);
  }`;
  }

  // Génère les propriétés calculées
  generateComputedMethods(computed) {
    if (!computed) return '';
    
    const methods = ['  // Propriétés calculées'];
    
    Object.entries(computed).forEach(([key, expression]) => {
      methods.push(`
  get ${key}() {
    return ${this.compileExpression(expression)};
  }`);
    });
    
    return methods.join('\n');
  }

  // Génère les méthodes d'actions
  generateActionMethods(actions) {
    if (!actions) return '';
    
    const methods = [];
    
    Object.entries(actions).forEach(([trigger, actionList]) => {
      const methodName = trigger.replace('on', '').toLowerCase();
      methods.push(`
  ${methodName}() {
    ${actionList.map(action => `this.${action}();`).join('\n    ')}
  }`);
    });
    
    methods.push(`
  runMountActions() {
    if (this.props.actions?.onMount) {
      this.props.actions.onMount.forEach(action => this[\`\${action}\`]?.());
    }
  }`);
    
    return methods.join('\n');
  }

  // Génère la configuration des enfants
  generateChildrenSetup(children) {
    if (!children || children.length === 0) return '';
    
    return children.map(childId => `
    // Child: ${childId}
    const ${childId} = this.createChild('${childId}');
    if (${childId}) this.children.push(${childId});`).join('\n');
  }

  // Compile le code final
  compileToFunction(classCode, componentId) {
    return `
// Generated VanillaJS Component - Zero Overhead
// Component: ${componentId}
// Generated: ${new Date().toISOString()}

${classCode}

// Factory function
function create${this.toPascalCase(componentId)}(parent) {
  return new ${this.toPascalCase(componentId)}(parent);
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ${this.toPascalCase(componentId)}, create${this.toPascalCase(componentId)} };
}`;
  }

  // Crée une factory function
  createFactory(data) {
    const code = this.generateComponentClass(data);
    // Retourne la classe générée, pas une instance
    return new Function(code + `; return ${this.toPascalCase(data.id)};`)();
  }

  // Utilitaires
  toPascalCase(str) {
    return str.replace(/(^|_)([a-z])/g, (_, __, letter) => letter.toUpperCase());
  }

  compileExpression(expr) {
    return expr.replace(/props\./g, 'this.props.');
  }
}

// Usage
const converter = new JSONToVanillaConverter();

// Exemple d'utilisation
function convertAndRun(jsonData) {
  const result = converter.convert(jsonData);
  
  console.log('Generated Code:', result.code);
  
  // Instanciation directe
  const component = result.instance();
  document.body.appendChild(component.element);
  
  return component;
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { JSONToVanillaConverter, convertAndRun };
}

// Export universel pour ESM (navigateur)
export { JSONToVanillaConverter };