/* eslint-env browser */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Input from '../../src/input.mjs';

/**
 * Tests for keyboard focus handling — ensuring editable elements receive
 * keyboard events instead of the emulator capturing them.
 */
describe('Input keyboard focus handling', () => {
  let input;

  beforeEach(() => {
    input = new Input();
    // Mock window/document for start()
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      __TEST__: {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should not capture keydown when target is an INPUT element', () => {
    const pressKeySpy = vi.spyOn(input, 'pressKey');
    
    // Create a mock event with an INPUT target
    const mockEvent = {
      code: 'KeyA',
      key: 'a',
      target: { tagName: 'INPUT', isContentEditable: false },
      preventDefault: vi.fn(),
    };

    input._keydown(mockEvent);

    // pressKey should NOT be called because target is an input
    expect(pressKeySpy).not.toHaveBeenCalled();
    // preventDefault should NOT be called either
    expect(mockEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('should not capture keydown when target is a TEXTAREA element', () => {
    const pressKeySpy = vi.spyOn(input, 'pressKey');
    
    const mockEvent = {
      code: 'KeyB',
      key: 'b',
      target: { tagName: 'TEXTAREA', isContentEditable: false },
      preventDefault: vi.fn(),
    };

    input._keydown(mockEvent);

    expect(pressKeySpy).not.toHaveBeenCalled();
    expect(mockEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('should not capture keydown when target is contentEditable', () => {
    const pressKeySpy = vi.spyOn(input, 'pressKey');
    
    const mockEvent = {
      code: 'KeyC',
      key: 'c',
      target: { tagName: 'DIV', isContentEditable: true },
      preventDefault: vi.fn(),
    };

    input._keydown(mockEvent);

    expect(pressKeySpy).not.toHaveBeenCalled();
    expect(mockEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('should capture keydown when target is the canvas or body', () => {
    const pressKeySpy = vi.spyOn(input, 'pressKey');
    
    const mockEvent = {
      code: 'KeyD',
      key: 'd',
      target: { tagName: 'CANVAS', isContentEditable: false },
      preventDefault: vi.fn(),
    };

    input._keydown(mockEvent);

    // pressKey SHOULD be called for canvas target
    expect(pressKeySpy).toHaveBeenCalledWith('d');
    expect(mockEvent.preventDefault).toHaveBeenCalled();
  });

  it('should not capture keyup when target is an INPUT element', () => {
    const releaseKeySpy = vi.spyOn(input, 'releaseKey');
    
    const mockEvent = {
      code: 'KeyE',
      key: 'e',
      target: { tagName: 'INPUT', isContentEditable: false },
      preventDefault: vi.fn(),
    };

    input._keyup(mockEvent);

    expect(releaseKeySpy).not.toHaveBeenCalled();
    expect(mockEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('should capture keyup when target is not an editable element', () => {
    // First simulate a proper keydown so _seenKeyCodes is populated
    const keydownEvent = {
      code: 'KeyF',
      key: 'f',
      target: { tagName: 'BODY', isContentEditable: false },
      preventDefault: vi.fn(),
    };
    input._keydown(keydownEvent);
    
    const releaseKeySpy = vi.spyOn(input, 'releaseKey');
    
    const keyupEvent = {
      code: 'KeyF',
      key: 'f',
      target: { tagName: 'BODY', isContentEditable: false },
      preventDefault: vi.fn(),
    };

    input._keyup(keyupEvent);

    // releaseKey SHOULD be called for body target
    expect(releaseKeySpy).toHaveBeenCalled();
    expect(keyupEvent.preventDefault).toHaveBeenCalled();
  });

  it('should handle SELECT elements as editable', () => {
    const pressKeySpy = vi.spyOn(input, 'pressKey');
    
    const mockEvent = {
      code: 'KeyG',
      key: 'g',
      target: { tagName: 'SELECT', isContentEditable: false },
      preventDefault: vi.fn(),
    };

    input._keydown(mockEvent);

    expect(pressKeySpy).not.toHaveBeenCalled();
  });

  it('should handle null target gracefully', () => {
    const pressKeySpy = vi.spyOn(input, 'pressKey');
    
    const mockEvent = {
      code: 'KeyH',
      key: 'h',
      target: null,
      preventDefault: vi.fn(),
    };

    // Should not throw and should process the key normally
    expect(() => input._keydown(mockEvent)).not.toThrow();
    expect(pressKeySpy).toHaveBeenCalledWith('h');
  });
});
