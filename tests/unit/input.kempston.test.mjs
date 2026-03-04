/* eslint-env browser */
/* eslint-disable no-empty, no-unused-vars, no-undef */
import { describe, it, expect, beforeEach } from 'vitest';
import Input from '../../src/input.mjs';

describe('Kempston joystick emulation', () => {
  let input;

  beforeEach(() => {
    input = new Input();
  });

  it('initializes kempstonState to 0', () => {
    expect(input.kempstonState).toBe(0);
  });

  it('sets Right bit on ArrowRight keydown', () => {
    const e = { code: 'ArrowRight', key: 'ArrowRight', target: {}, preventDefault: () => {} };
    input._keydown(e);
    expect(input.kempstonState & 0x01).toBe(0x01);
  });

  it('sets Left bit on ArrowLeft keydown', () => {
    const e = { code: 'ArrowLeft', key: 'ArrowLeft', target: {}, preventDefault: () => {} };
    input._keydown(e);
    expect(input.kempstonState & 0x02).toBe(0x02);
  });

  it('sets Down bit on ArrowDown keydown', () => {
    const e = { code: 'ArrowDown', key: 'ArrowDown', target: {}, preventDefault: () => {} };
    input._keydown(e);
    expect(input.kempstonState & 0x04).toBe(0x04);
  });

  it('sets Up bit on ArrowUp keydown', () => {
    const e = { code: 'ArrowUp', key: 'ArrowUp', target: {}, preventDefault: () => {} };
    input._keydown(e);
    expect(input.kempstonState & 0x08).toBe(0x08);
  });

  it('sets Fire bit on Space keydown in addition to ZX keyboard Space', () => {
    const e = { code: 'Space', key: ' ', target: {}, preventDefault: () => {} };
    input._keydown(e);
    expect(input.kempstonState & 0x10).toBe(0x10);
    // Space should ALSO set the ZX keyboard matrix (row 7, bit 0)
    expect(input.matrix[7] & 0x01).toBe(0); // active low: 0 = pressed
  });

  it('sets Fire bit on Enter keydown in addition to ZX keyboard Enter', () => {
    const e = { code: 'Enter', key: 'Enter', target: {}, preventDefault: () => {} };
    input._keydown(e);
    expect(input.kempstonState & 0x10).toBe(0x10);
    // Enter should ALSO set the ZX keyboard matrix (row 6, bit 0)
    expect(input.matrix[6] & 0x01).toBe(0); // active low: 0 = pressed
  });

  it('clears direction bits on arrow keyup', () => {
    // Press all directions
    for (const code of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) {
      input._keydown({ code, key: code, target: {}, preventDefault: () => {} });
    }
    expect(input.kempstonState).toBe(0x0F);

    // Release Right
    input._keyup({ code: 'ArrowRight', key: 'ArrowRight', target: {}, preventDefault: () => {} });
    expect(input.kempstonState).toBe(0x0E);

    // Release Up
    input._keyup({ code: 'ArrowUp', key: 'ArrowUp', target: {}, preventDefault: () => {} });
    expect(input.kempstonState).toBe(0x06);
  });

  it('clears Fire bit on Space keyup', () => {
    input._keydown({ code: 'Space', key: ' ', target: {}, preventDefault: () => {} });
    expect(input.kempstonState & 0x10).toBe(0x10);
    input._keyup({ code: 'Space', key: ' ', target: {}, preventDefault: () => {} });
    expect(input.kempstonState & 0x10).toBe(0);
  });

  it('clears Fire bit on Enter keyup', () => {
    input._keydown({ code: 'Enter', key: 'Enter', target: {}, preventDefault: () => {} });
    expect(input.kempstonState & 0x10).toBe(0x10);
    input._keyup({ code: 'Enter', key: 'Enter', target: {}, preventDefault: () => {} });
    expect(input.kempstonState & 0x10).toBe(0);
  });

  it('supports simultaneous direction + fire', () => {
    input._keydown({ code: 'ArrowRight', key: 'ArrowRight', target: {}, preventDefault: () => {} });
    input._keydown({ code: 'ArrowUp', key: 'ArrowUp', target: {}, preventDefault: () => {} });
    input._keydown({ code: 'Enter', key: 'Enter', target: {}, preventDefault: () => {} });
    // Right (0x01) + Up (0x08) + Fire (0x10) = 0x19
    expect(input.kempstonState).toBe(0x19);
  });

  it('reset() clears kempstonState', () => {
    input._keydown({ code: 'ArrowUp', key: 'ArrowUp', target: {}, preventDefault: () => {} });
    input._keydown({ code: 'Space', key: ' ', target: {}, preventDefault: () => {} });
    expect(input.kempstonState).not.toBe(0);
    input.reset();
    expect(input.kempstonState).toBe(0);
  });

  it('arrow keys do not affect ZX keyboard matrix', () => {
    const matrixBefore = [...input.matrix];
    input._keydown({ code: 'ArrowRight', key: 'ArrowRight', target: {}, preventDefault: () => {} });
    input._keydown({ code: 'ArrowUp', key: 'ArrowUp', target: {}, preventDefault: () => {} });
    // ZX keyboard matrix should be unchanged
    for (let i = 0; i < 8; i++) {
      expect(input.matrix[i]).toBe(matrixBefore[i]);
    }
  });

  it('arrow keys are ignored when target is editable', () => {
    const e = { code: 'ArrowRight', key: 'ArrowRight', target: { tagName: 'INPUT' }, preventDefault: () => {} };
    input._keydown(e);
    expect(input.kempstonState).toBe(0);
  });

  it('kempstonState bits are masked to 5 bits (0x1F)', () => {
    // Press all directions + fire
    for (const code of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) {
      input._keydown({ code, key: code, target: {}, preventDefault: () => {} });
    }
    input._keydown({ code: 'Space', key: ' ', target: {}, preventDefault: () => {} });
    expect(input.kempstonState & 0x1F).toBe(0x1F);
    expect(input.kempstonState & ~0x1F).toBe(0); // no stray bits above bit 4
  });
});
