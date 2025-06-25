import { describe, it, expect } from 'vitest';
import { Tooltip } from '../src/squirrel/components/tooltip_builder.js';

describe('Tooltip Component', () => {
  it('creates tooltip element with text', () => {
    const tooltip = Tooltip({ text: 'Hello' });
    expect(tooltip.classList.contains('hs-tooltip')).toBe(true);
    expect(tooltip.textContent).toBe('Hello');
  });
});
