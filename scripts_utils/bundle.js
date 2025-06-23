// Point d'entrée du bundle CDN
import * as Apis from '../src/squirrel/apis.js';
import Squirrel from '../src/squirrel/squirrel.js';
import Slider from '../src/squirrel/components/slider_builder.js';
import Badge from '../src/squirrel/components/badge_builder.js';
import Button from '../src/squirrel/components/button_builder.js';
import Draggable from '../src/squirrel/components/draggable_builder.js';
import List from '../src/squirrel/components/List_builder.js';
import Matrix from '../src/squirrel/components/matrix_builder.js';
import Menu from '../src/squirrel/components/menu_builder.js';
import Minimal from '../src/squirrel/components/minimal_builder.js';
import Table from '../src/squirrel/components/table_builder.js';
import Template from '../src/squirrel/components/template_builder.js';
import Tooltip from '../src/squirrel/components/tooltip_builder.js';
import Unit from '../src/squirrel/components/unit_builder.js';

// Ajout du composant Slider dans Squirrel.components pour accès via le CDN
Squirrel.components = {
  Slider,
  Badge,
  Button,
  Draggable,
  List,
  Matrix,
  Menu,
  Minimal,
  Table,
  Template,
  Tooltip,
  Unit
};

// Expose Squirrel globals immediately for both CDN and NPM builds
if (typeof window !== 'undefined') {
  // Expose Squirrel globals and bare component names immediately
  window.Squirrel.Apis = Apis;
window.Apis = Apis;
  window.$ = Squirrel.$;
  window.Squirrel = window.Squirrel || {};
  window.Squirrel.$ = Squirrel.$;
  window.Squirrel.define = Squirrel.define;
  window.Squirrel.batch = Squirrel.batch;
  window.Squirrel.observeMutations = Squirrel.observeMutations;
  window.Squirrel.Slider = Slider;
  window.Squirrel.Badge = Badge;
  window.Squirrel.Button = Button;
  window.Squirrel.Draggable = Draggable;
  window.Squirrel.makeDraggable = Draggable.makeDraggable;
  window.Squirrel.List = List;
  window.Squirrel.Matrix = Matrix;
  window.Squirrel.Menu = Menu;
  window.Squirrel.Minimal = Minimal;
  window.Squirrel.Table = Table;
  window.Squirrel.Template = Template;
  window.Squirrel.Tooltip = Tooltip;
  window.Squirrel.Unit = Unit;

  window.Slider = window.Squirrel.Slider;
  window.Badge = window.Squirrel.Badge;
  window.Button = window.Squirrel.Button;
  window.Draggable = window.Squirrel.Draggable;
  window.List = window.Squirrel.List;
  window.Matrix = window.Squirrel.Matrix;
  window.Menu = window.Squirrel.Menu;
  window.Minimal = window.Squirrel.Minimal;
  window.Table = window.Squirrel.Table;
  window.Template = window.Squirrel.Template;
  window.Tooltip = window.Squirrel.Tooltip;
  window.Unit = window.Squirrel.Unit;

  // Create #view container only after DOMContentLoaded
  const createViewContainer = () => {
    if (!document.getElementById('view')) {
      const view = document.createElement('div');
      view.id = 'view';
      document.body.appendChild(view);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createViewContainer);
  } else {
    createViewContainer();
  }

  // Only dispatch squirrel:ready after DOMContentLoaded
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      window.squirrelReady = true;
      window.dispatchEvent(new Event('squirrel:ready'));
    }, 0);
  });
}

export default Squirrel;
