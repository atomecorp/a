// Point d'entrée du bundle CDN
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

// Expose $ globalement et initialise le conteneur + event ready
if (typeof window !== 'undefined') {
  window.$ = Squirrel.$;
  if (!document.getElementById('view')) {
    const view = document.createElement('div');
    view.id = 'view';
    document.body.appendChild(view);
  }
  // Déclenche l'événement squirrel:ready de façon asynchrone pour garantir la capture
  setTimeout(() => {
    window.squirrelReady = true;
    window.dispatchEvent(new Event('squirrel:ready'));
  }, 0);
}

// Expose all main components on the Squirrel global for CDN usage
if (typeof window !== 'undefined') {
  window.Squirrel = window.Squirrel || {};
  window.Squirrel.$ = Squirrel.$;
  window.Squirrel.define = Squirrel.define;
  window.Squirrel.batch = Squirrel.batch;
  window.Squirrel.observeMutations = Squirrel.observeMutations;
  window.Squirrel.Slider = Slider;
  window.Squirrel.Badge = Badge;
  window.Squirrel.Button = Button;
  window.Squirrel.Draggable = Draggable;
  window.Squirrel.List = List;
  window.Squirrel.Matrix = Matrix;
  window.Squirrel.Menu = Menu;
  window.Squirrel.Minimal = Minimal;
  window.Squirrel.Table = Table;
  window.Squirrel.Template = Template;
  window.Squirrel.Tooltip = Tooltip;
  window.Squirrel.Unit = Unit;
}

export default Squirrel;
