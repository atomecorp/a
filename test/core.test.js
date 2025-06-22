import { describe, it, expect } from 'vitest';
import { $, define } from '../src/squirrel/squirrel.js';

describe('Core utilities', () => {
  it('creates element from template and updates style', () => {
    define('test-box', { tag: 'div', css: { color: 'red' } });
    const el = $('test-box');
    expect(el.tagName).toBe('DIV');
    expect(el.style.color).toBe('red');
    el.$({ css: { color: 'blue' } });
    expect(el.style.color).toBe('blue');
  });
});
