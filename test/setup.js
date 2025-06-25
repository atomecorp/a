// Vitest setup file. Add global mocks here if needed.

import { beforeAll } from 'vitest';

beforeAll(() => {
  const view = document.createElement('div');
  view.id = 'view';
  document.body.appendChild(view);
});

