import { describe, it, expect } from 'vitest';
import Slider from '../src/squirrel/components/slider_builder.js';

describe('Slider Component', () => {
  it('should create a slider and update value', () => {
    const slider = Slider({ min: 0, max: 10, value: 5, showLabel: false });
    expect(slider.classList.contains('hs-slider')).toBe(true);
    expect(slider.querySelector('.hs-slider-track')).not.toBeNull();
    expect(slider.getValue()).toBe(5);
    slider.setValue(7);
    expect(slider.getValue()).toBe(7);
  });
});
