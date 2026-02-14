/* eslint-env node */
import { describe, it, expect } from 'vitest';
import Input from '../../src/input.mjs';

describe('Input._normalizeEvent (unit)', () => {
  const input = new Input();

  it('maps punctuation characters to ZX keys', () => {
    expect(input._normalizeEvent({ key: ';', code: 'Semicolon' })).toBe('o');
    expect(input._normalizeEvent({ key: ':', code: 'Semicolon' })).toBe('z');
    expect(input._normalizeEvent({ key: ',', code: 'Comma' })).toBe('n');
    expect(input._normalizeEvent({ key: '>', code: 'Period' })).toBe('t');
    expect(input._normalizeEvent({ key: '\'', code: 'Quote' })).toBe('7');
  });

  it('prefers code mapping when available (and returns null for Backspace code)', () => {
    expect(input._normalizeEvent({ key: 'a', code: 'KeyA' })).toBe('a');
    expect(input._normalizeEvent({ key: 'Backspace', code: 'Backspace' })).toBe(null);
  });

  it('maps named keys and modifiers correctly', () => {
    expect(input._normalizeEvent({ key: 'Enter' })).toBe('enter');
    expect(input._normalizeEvent({ key: ' ' })).toBe('space');
    expect(input._normalizeEvent({ key: 'Shift' })).toBe('shift');
    expect(input._normalizeEvent({ key: 'Control' })).toBe('symshift');
    expect(input._normalizeEvent({ key: 'Ctrl' })).toBe('symshift');
    expect(input._normalizeEvent({ key: 'Alt' })).toBe('symshift');
  });

  it('falls back to lowercase key string when nothing else matches', () => {
    expect(input._normalizeEvent({ key: 'X' })).toBe('x');
    expect(input._normalizeEvent({})).toBe('');
  });
});