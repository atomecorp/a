import { define } from '../squirrel.js';

define('table-container', {
  tag: 'div',
  class: 'hs-table',
  css: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid #dee2e6',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '14px'
  }
});

define('table-header', {
  tag: 'div',
  class: 'hs-table-header',
  css: {
    display: 'flex',
    flexShrink: 0,
    borderBottom: '2px solid #dee2e6',
    backgroundColor: '#343a40'
  }
});

define('table-header-cell', {
  tag: 'div',
  class: 'hs-table-header-cell',
  css: {
    padding: '12px',
    backgroundColor: '#343a40',
    color: '#ffffff',
    fontWeight: '600',
    fontSize: '14px',
    borderRight: '1px solid #495057',
    cursor: 'pointer',
    userSelect: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  }
});

define('table-body', {
  tag: 'div',
  class: 'hs-table-body',
  css: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden'
  }
});

define('table-row', {
  tag: 'div',
  class: 'hs-table-row',
  css: {
    display: 'flex',
    borderBottom: '1px solid #dee2e6',
    backgroundColor: '#ffffff',
    transition: 'all 0.2s ease'
  }
});

define('table-cell', {
  tag: 'div',
  class: 'hs-table-cell',
  css: {
    padding: '8px 12px',
    borderRight: '1px solid #dee2e6',
    backgroundColor: '#ffffff',
    color: '#212529',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center'
  }
});

export const tableStyles = {
  default: {
    headerStyle: {
      backgroundColor: '#343a40',
      color: '#ffffff'
    },
    cellStyle: {
      backgroundColor: '#ffffff',
      color: '#212529'
    },
    alternateRowStyle: {
      backgroundColor: '#f8f9fa'
    }
  },
  modern: {
    headerStyle: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: '#ffffff'
    },
    cellStyle: {
      backgroundColor: '#ffffff',
      color: '#2c3e50'
    },
    alternateRowStyle: {
      backgroundColor: '#f8f9fa'
    }
  },
  minimal: {
    headerStyle: {
      backgroundColor: '#f8f9fa',
      color: '#495057',
      borderBottom: '2px solid #dee2e6'
    },
    cellStyle: {
      backgroundColor: '#ffffff',
      color: '#212529',
      border: 'none',
      borderBottom: '1px solid #f1f3f4'
    },
    alternateRowStyle: {
      backgroundColor: '#fbfbfb'
    }
  }
};
