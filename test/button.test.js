import { describe, it, expect } from 'vitest';
import { Button } from '../src/squirrel/components/button_builder.js';

describe('Button Component', () => {
  it('should create a button element', () => {
    const button = Button({ text: 'Test' });
    expect(button.tagName).toBe('BUTTON');

    const textEl = button.querySelector('.hs-button-text');
    expect(textEl.textContent).toBe('Test');
  });

  it('supports updating text and badge', () => {
    const button = Button({ text: 'Old', badge: 1 });
    button.updateText('New');
    const textEl = button.querySelector('.hs-button-text');
    expect(textEl.textContent).toBe('New');
    button.updateBadge(2);
    const badgeEl = button.querySelector('.hs-button-badge');
    expect(badgeEl.textContent).toBe('2');


  });
});
