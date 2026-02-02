// @unit
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Input from '../src/input.mjs';

describe('seenKeyCodes handling and punctuation mapping @unit', () => {
  let input;

  beforeEach(() => {
    // Minimal DOM and window for tests
    if (typeof global.document === 'undefined') {
      global.document = { body: { appendChild() {} }, createElement: () => ({ id:'', addEventListener(){}, removeEventListener(){}, style:{} }), getElementById: () => null };
    }
    if (typeof global.window === 'undefined') {
      global.window = { addEventListener: () => {}, removeEventListener: () => {}, __TEST__: {} };
    }
    input = new Input();
    input.start();
  });

  afterEach(() => {
    try { input.stop(); } catch (e) {}
    if (global.__savedDocumentForTests) { global.document = global.__savedDocumentForTests; delete global.__savedDocumentForTests; }
  });

  it('releases previous mapped key when same physical key maps to different logical names', () => {
    // Simulate pressing semicolon key which maps to 'o'
    const ev1 = { code: 'Semicolon', key: ';', preventDefault: () => {} };
    input._keydown(ev1);
    expect(input.isKeyPressed('o')).toBe(true);

    // Simulate that while held, shift is applied and the same physical key now maps to ':' -> 'z'
    const ev2 = { code: 'Semicolon', key: ':', preventDefault: () => {} };
    input._keydown(ev2);

    // previous 'o' must have been released and 'z' pressed
    expect(input.isKeyPressed('o')).toBe(false);
    expect(input.isKeyPressed('z')).toBe(true);

    // Simulate keyup of the physical key
    const up = { code: 'Semicolon', key: ':', preventDefault: () => {} };
    input._keyup(up);
    expect(input.isKeyPressed('z')).toBe(false);
  });

  it('cleans seenKeyCodes mapping after keyup', () => {
    const ev1 = { code: 'Semicolon', key: ';', preventDefault: () => {} };
    input._keydown(ev1);
    expect(input._seenKeyCodes.get('Semicolon')).toBe('o');
    input._keyup({ code: 'Semicolon', key: ';', preventDefault: () => {} });
    expect(input._seenKeyCodes.has('Semicolon')).toBe(false);
  });
});