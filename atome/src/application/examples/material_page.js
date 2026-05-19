import Menu from '../../squirrel/components/menu_builder.js';
import Button, { materialSwitch } from '../../squirrel/components/button_builder.js';
import { materialHorizontal } from '../../squirrel/components/slider_builder.js';
import { createCard } from '../../squirrel/components/template_builder.js';

window.addEventListener('squirrel:ready', () => {
  const page = Squirrel.$('div', {
    id: 'material-demo',
    parent: '#view',
    css: {
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100%',
      backgroundColor: '#fafafa',
      fontFamily: 'Roboto, Arial, sans-serif',
      color: '#333'
    }
  });

  Menu({
    id: 'demo-menu',
    attach: page,
    layout: {
      direction: 'horizontal',
      justify: 'space-between',
      align: 'center',
      gap: '16px'
    },
    style: {
      width: '100%',
      padding: '12px 24px',
      backgroundColor: '#6200ee',
      color: 'white',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    },
    responsive: {
      breakpoints: {
        mobile: {
          maxWidth: '768px',
          showHamburger: true,
          style: { padding: '12px 16px' }
        }
      }
    },
    content: [
      {
        type: 'item',
        id: 'menu-title',
        content: { text: 'Squirrel Demo' },
        style: { fontWeight: '500', fontSize: '20px', color: '#fff', padding: '0' }
      },
      {
        type: 'group',
        id: 'menu-links',
        layout: { gap: '12px' },
        items: [
          {
            id: 'home-link',
            content: { text: 'Home' },
            style: { color: '#fff', padding: '4px 8px', borderRadius: '4px' },
            states: { hover: { backgroundColor: 'rgba(255,255,255,0.1)' } }
          },
          {
            id: 'features-link',
            content: { text: 'Features' },
            style: { color: '#fff', padding: '4px 8px', borderRadius: '4px' },
            states: { hover: { backgroundColor: 'rgba(255,255,255,0.1)' } }
          },
          {
            id: 'contact-link',
            content: { text: 'Contact' },
            style: { color: '#fff', padding: '4px 8px', borderRadius: '4px' },
            states: { hover: { backgroundColor: 'rgba(255,255,255,0.1)' } }
          }
        ]
      }
    ]
  });

  const main = Squirrel.$('div', {
    id: 'page-main',
    parent: page,
    css: {
      flex: '1',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '24px'
    }
  });

  createCard('Hello Material!', 'This page demonstrates a simple Material design layout built with Squirrel.js.', {
    attach: main,
    style: { maxWidth: '600px', textAlign: 'center' }
  });

  materialHorizontal({
    parent: main,
    value: 50
  });

  materialSwitch({
    parent: main,
    text: 'OFF',
    onClick: (btn) => {
      btn.textContent = btn.textContent === 'OFF' ? 'ON' : 'OFF';
    }
  });
});
