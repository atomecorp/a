import { describe, it, expect } from 'vitest';
import { Button } from '../src/squirrel/components/button_builder.js';

describe('Button Component', () => {
  it('should create a button element', () => {
    const button = Button({ text: 'Test' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.textContent).toBe('Test');
  });
});
