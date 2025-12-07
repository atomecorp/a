# Copilot Instructions

## Code Generation Rules

- **Always use JavaScript** when creating code
- **Never create or modify any `.html` or `.css` files** (unless the prompt explicitly specifies creating an HTML file)
- When creating HTML elements, **always use Squirrel syntax**:
  ```javascript
  $('div', {
    id: 'myDiv',
    css: {
      backgroundColor: '#00f',
      marginLeft: '0',
      padding: '10px',
      color: 'white',
      margin: '10px',
      display: 'inline-block'
    },
    text: 'I am a div! 🎯'
  });
  ```

## Components

- For buttons, sliders, and other HTML components, **always use Squirrel components**
- Refer to examples in `src/application/examples/` to understand how to use these components

## Language

- All comments, warnings, errors, messages, console logs, and documentation **must be written in English only**

## Restrictions

- **Never use fallbacks** unless explicitly specified
- **Never use system dialogs** like `confirm()`, `alert()`, or any other system dialog
- Everything must be done within the webview using HTML elements and JavaScript
