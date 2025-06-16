import { describe, test, expect } from 'vitest';

describe('Basic functionality tests', () => {
  test('basic arithmetic works', () => {
    expect(2 + 2).toBe(4);
  });

  test('string operations work', () => {
    expect('hello' + ' world').toBe('hello world');
  });

  test('array operations work', () => {
    const arr = [1, 2, 3];
    expect(arr.length).toBe(3);
    expect(arr.includes(2)).toBe(true);
  });
});
