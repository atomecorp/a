// Squirrel localStorage viewer (pure JS, no imports)

// UI container
const panel = $('div', {
  id: 'ls_panel',
  css: {
    margin: '16px',
    padding: '12px',
    backgroundColor: '#1e1e1e',
    color: 'white',
    borderRadius: '10px',
    fontFamily: 'monospace',
    maxWidth: '680px'
  },
  text: '📦 localStorage'
});

// Toolbar
const toolbar = $('div', {
  parent: panel,
  css: {
    display: 'flex',
    gap: '8px',
    marginTop: '10px',
    marginBottom: '10px',
    alignItems: 'center',
    flexWrap: 'wrap'
  }
});

const refreshBtn = $('button', {
  parent: toolbar,
  text: 'Refresh',
  css: {
    padding: '6px 10px',
    backgroundColor: '#3a8dde',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  onclick: () => refreshList()
});

const clearBtn = $('button', {
  parent: toolbar,
  text: 'Clear all',
  css: {
    padding: '6px 10px',
    backgroundColor: '#d14a4a',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  onclick: () => {
    localStorage.clear();
    refreshList();
  }
});

// List container
const list = $('div', {
  id: 'ls_list',
  parent: panel,
  css: {
    borderTop: '1px solid #333',
    marginTop: '8px',
    paddingTop: '8px'
  }
});

// Render function
function refreshList() {
  list.innerHTML = '';
  if (localStorage.length === 0) {
    $('div', {
      parent: list,
      text: '— empty —',
      css: { color: '#aaa', padding: '4px 0' }
    });
    return;
  }
  // Sort keys for stable view
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  keys.sort();

  keys.forEach((key) => {
    const value = localStorage.getItem(key);

    const row = $('div', {
      parent: list,
      css: {
        display: 'grid',
        gridTemplateColumns: '1fr 2fr auto',
        gap: '10px',
        alignItems: 'center',
        padding: '6px 0',
        borderBottom: '1px solid #2a2a2a'
      }
    });

    $('div', {
      parent: row,
      text: key,
      css: { color: '#ffd479', wordBreak: 'break-all' }
    });

    $('div', {
      parent: row,
      text: value,
      css: { color: '#e6e6e6', wordBreak: 'break-all' }
    });

    $('button', {
      parent: row,
      text: 'Delete',
      css: {
        padding: '4px 8px',
        backgroundColor: '#444',
        color: 'white',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer'
      },
      onclick: () => {
        localStorage.removeItem(key);
        refreshList();
      }
    });
  });
}

// Initial render
refreshList();


function localStorageContent(path) {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    data[key] = localStorage.getItem(key);
  }
  return data;
}

// Exemple d’appel
const result = localStorageContent('./');
console.log(result);