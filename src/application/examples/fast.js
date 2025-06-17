// 🚀 VERSION ULTRA-PERFORMANCE pour millions d'éléments
const A = p => {
  const el = document.createElement(p.markup || 'div');
  
  // Pré-allocation du string CSS pour éviter les push successifs
  let cssText = '';
  
  // Boucle optimisée avec moins de conditions
  for (const k in p) {
    const v = p[k];
    
    if (k === 'attach') continue;
    if (k === 'id') { el.id = v; continue; }
    if (k === 'text') { el.textContent = v; continue; }
    if (k === 'markup') continue;
    
    // Style direct sans array
    if (k === 'backgroundColor') cssText += `background-color:${v};`;
    else if (k in el.style) cssText += `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v};`;
    else el.setAttribute(k, v);
  }
  
  // Assignation CSS unique
  if (cssText) el.style.cssText = cssText;
  
  // Attachement optimisé
  (p.attach === 'body' ? document.body : document.querySelector(p.attach) || document.body).appendChild(el);
  return el;
};


const html_container = A({
  attach: 'body',
  id: 'main_html_container',
  position: 'absolute',
  text: 'This is a main HTML container',
  left: "56px",
  top: "120px",
  width: '333px',
  height: '234px',
  color: 'white',
  backgroundColor: 'rgba(255, 0, 255, 0.8)',  // ✅ camelCase standard
  overflow: 'hidden',
  filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))',
  draggable: true
});


html_container.style.left = '356px';