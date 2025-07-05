
/**
 * Simple Button Component Template
 */
define('simple-button', {
  tag: 'button',
  text: 'Click me',
  css: {
    padding: '10px 20px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontFamily: 'system-ui, sans-serif'
  },
  attrs: {
    type: 'button'
  }
});

// Usage with property override
const myButton = $('simple-button', {
  text: 'My Custom Button',
  css: { 
    backgroundColor: '#28a745' 
  },
  onClick: () => alert('Clicked!')
});