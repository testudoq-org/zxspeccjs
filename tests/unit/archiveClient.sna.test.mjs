import { test, expect } from 'vitest';
import { normalizeFileEntry } from '../../src/archiveClient.mjs';

test('normalizeFileEntry advertises .sna as loadable snapshot', () => {
  const sna = normalizeFileEntry('id', { name: 'game.sna', size: '100' });
  const z80 = normalizeFileEntry('id', { name: 'game.z80', size: '100' });
  expect(sna.isSnapshot).toBe(true);
  expect(sna.isLoadable).toBe(true);
  expect(z80.isSnapshot).toBe(true);
  expect(z80.isLoadable).toBe(true);
});