# Squirrel Button Usage Guide

## Overview
This document provides comprehensive guidelines for creating functional buttons in the Squirrel framework, based on analysis of common pitfalls and working examples.

## ✅ Correct Button Syntax

### Basic Button Structure
```javascript
const myButton = Button({
    onText: 'Button Text',           // ✅ Required: Text when button is in "on" state
    offText: 'Button Text',          // ✅ Required: Text when button is in "off" state
    onAction: functionName,          // ✅ Required: Named function (no parentheses)
    offAction: functionName,         // ✅ Optional: Function for off state
    parent: '#view',                 // ✅ Required: Simple selector string
    css: { /* styles */ }            // ✅ Optional: CSS properties
});
```

### Working Example
```javascript
// ✅ Define functions BEFORE creating buttons
function handleButtonClick(state) {
    console.log('Button clicked with state:', state);
    output.$({ text: `Button state: ${state}` });
}

function handleButtonOff(state) {
    console.log('Button turned off:', state);
}

// ✅ Create button with correct syntax
const workingButton = Button({
    onText: 'Click Me',
    offText: 'Click Me',
    onAction: handleButtonClick,     // Function name only, no ()
    offAction: handleButtonOff,
    parent: '#view',
    css: {
        margin: '10px',
        padding: '10px 20px',
        backgroundColor: '#007bff',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer'
    }
});
```

## ❌ Common Mistakes to Avoid

### 1. Using `text:` Property
```javascript
// ❌ WRONG - 'text' property doesn't exist
const wrongButton = Button({
    text: 'My Button',              // ❌ This doesn't work
    onAction: myFunction
});

// ✅ CORRECT - Use onText and offText
const correctButton = Button({
    onText: 'My Button',            // ✅ This works
    offText: 'My Button',
    onAction: myFunction
});
```

### 2. Anonymous Functions with Parameters
```javascript
// ❌ WRONG - Anonymous functions with closures don't work
const wrongButton = Button({
    onText: 'Search',
    offText: 'Search',
    onAction: () => performSearch(term),    // ❌ This doesn't work
    parent: '#view'
});

// ✅ CORRECT - Create specific named functions
function searchSpecificTerm() {
    performSearch('JavaScript');            // ✅ This works
}

const correctButton = Button({
    onText: 'Search JavaScript',
    offText: 'Search JavaScript',
    onAction: searchSpecificTerm,           // ✅ Named function
    parent: '#view'
});
```

### 3. Complex Parent Selectors
```javascript
// ❌ WRONG - Complex parent variables may not work
const container = $('div', { parent: '#view' });
const wrongButton = Button({
    onText: 'Test',
    offText: 'Test',
    onAction: myFunction,
    parent: container                       // ❌ May not work
});

// ✅ CORRECT - Use simple string selectors
const correctButton = Button({
    onText: 'Test',
    offText: 'Test',
    onAction: myFunction,
    parent: '#view'                         // ✅ Simple selector works
});
```

### 4. Missing Required Properties
```javascript
// ❌ WRONG - Missing required properties
const wrongButton = Button({
    onAction: myFunction                    // ❌ Missing onText, offText, parent
});

// ✅ CORRECT - All required properties included
const correctButton = Button({
    onText: 'Button',                       // ✅ Required
    offText: 'Button',                      // ✅ Required
    onAction: myFunction,                   // ✅ Required
    parent: '#view'                         // ✅ Required
});
```

## 🎯 Best Practices

### 1. Function Organization
```javascript
// ✅ Define all functions first
function handleSearch() {
    console.log('Search clicked');
    performSearch('query');
}

function handleNavigation() {
    console.log('Navigate clicked');
    loadInWebView('https://example.com', 'Example');
}

function handleClose() {
    console.log('Close clicked');
    closeWebView();
}

// ✅ Then create buttons
const searchButton = Button({
    onText: 'Search',
    offText: 'Search',
    onAction: handleSearch,
    parent: '#view',
    css: { backgroundColor: '#4285f4', color: 'white' }
});
```

### 2. Dynamic Content Pattern
```javascript
// ✅ For dynamic content, create specific functions
const sites = ['Google', 'YouTube', 'GitHub'];

// Create individual functions for each site
function navigateToGoogle() {
    loadInWebView('https://google.com', 'Google');
}

function navigateToYouTube() {
    loadInWebView('https://youtube.com', 'YouTube');
}

function navigateToGitHub() {
    loadInWebView('https://github.com', 'GitHub');
}

// Map sites to their functions
const siteActions = {
    'Google': navigateToGoogle,
    'YouTube': navigateToYouTube,
    'GitHub': navigateToGitHub
};

// Create buttons using specific functions
sites.forEach(site => {
    const button = Button({
        onText: site,
        offText: site,
        onAction: siteActions[site],        // ✅ Use mapped function
        parent: '#view',
        css: { margin: '5px', padding: '10px' }
    });
});
```

### 3. State Management
```javascript
// ✅ For toggle buttons with different states
function turnOn(state) {
    console.log('Button turned on:', state);
    // Handle on state
}

function turnOff(state) {
    console.log('Button turned off:', state);
    // Handle off state
}

const toggleButton = Button({
    onText: 'ON',
    offText: 'OFF',
    onAction: turnOn,                       // ✅ Different function for on
    offAction: turnOff,                     // ✅ Different function for off
    parent: '#view',
    onStyle: { backgroundColor: '#28a745' },
    offStyle: { backgroundColor: '#dc3545' }
});
```

## 🔧 Debugging Button Issues

### Check Console for Errors
1. Open browser console (F12)
2. Look for JavaScript errors when clicking buttons
3. Check if functions are defined before button creation

### Common Error Messages
- `"functionName is not defined"` → Define function before button creation
- `"Cannot read property of undefined"` → Check parent selector
- `"Button not responding"` → Check onAction syntax

### Testing Pattern
```javascript
// ✅ Always test with simple button first
function testFunction() {
    console.log('🔥 Test button works!');
    alert('Button is working correctly');
}

const testButton = Button({
    onText: 'TEST',
    offText: 'TEST',
    onAction: testFunction,
    parent: '#view',
    css: {
        backgroundColor: 'red',
        color: 'white',
        padding: '10px',
        margin: '10px'
    }
});
```

## 📋 Checklist for Button Creation

- [ ] Function defined before button creation
- [ ] `onText` property included
- [ ] `offText` property included  
- [ ] `onAction` uses function name (no parentheses)
- [ ] `parent` is a simple string selector
- [ ] No `text:` property used
- [ ] No anonymous functions with parameters
- [ ] Console tested for errors

## 🎨 Templates and Styling

Squirrel buttons support templates and custom styling:

```javascript
// ✅ Using templates
const styledButton = Button({
    template: 'material_design_blue',       // ✅ Use predefined templates
    onText: 'Material Button',
    offText: 'Material Button',
    onAction: myFunction,
    parent: '#view'
});

// ✅ Custom styling
const customButton = Button({
    onText: 'Custom',
    offText: 'Custom',
    onAction: myFunction,
    parent: '#view',
    css: {
        background: 'linear-gradient(45deg, #ff6b6b, #4ecdc4)',
        border: 'none',
        borderRadius: '25px',
        color: 'white',
        padding: '12px 24px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
        transition: 'all 0.3s ease'
    }
});
```

Remember: **Always test with a simple button first before creating complex functionality!**
