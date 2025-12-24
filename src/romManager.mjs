// ROM Manager for zxspeccjs
// Provides: ROM metadata, factory loader, UI helpers, memory config integration, auto-detect heuristics

import spec48 from './roms/spec48.js';

// Built-in ROM registry. Additional ROM modules can be added by registering
const ROM_REGISTRY = new Map();

function normalizeId(id) {
  return String(id).replace(/\.js$/i, '').toLowerCase();
}

// Register bundled 48K ROM
ROM_REGISTRY.set('spec48', {
  id: 'spec48',
  category: 'spectrum16-48',
  model: '48k',
  memorySizeKB: 48,
  description: 'Sinclair Spectrum 48K (bundled spec48 module)',
  loader: async () => {
    const mod = spec48?.default ? spec48.default : spec48;
    // If the module exported raw bytes (Uint8Array) normalize to an object shape
    if (mod instanceof Uint8Array) return { metadata: { id: 'spec48' }, rom: mod };
    return mod;
  }
});

// Register placeholders that will attempt dynamic import when selected (fallbacks included)
ROM_REGISTRY.set('spec16', {
  id: 'spec16',
  category: 'spectrum16-48',
  model: '16k',
  memorySizeKB: 16,
  description: 'Spectrum 16K (placeholder - ROM not available)',
  loader: async () => {
    try {
      const mod = await import('./roms/spec16.js');
      return mod?.default || mod;
    } catch (e) {
      // fallback empty ROM
      return { metadata: { id: 'spec16' }, rom: new Uint8Array(16384) };
    }
  }
});

ROM_REGISTRY.set('spec128', {
  id: 'spec128',
  category: 'spectrum128-plus2',
  model: '128k',
  memorySizeKB: 128,
  description: 'Spectrum 128K (placeholder - ROM not available)',
  loader: async () => {
    try {
      const mod = await import('./roms/spec128.js');
      return mod?.default || mod;
    } catch (e) {
      return { metadata: { id: 'spec128' }, rom: new Uint8Array(65536) };
    }
  }
});

ROM_REGISTRY.set('zx80', {
  id: 'zx80',
  category: 'zx80-81',
  model: 'zx80',
  memorySizeKB: 4,
  description: 'ZX80 (placeholder - ROM not available)',
  loader: async () => {
    try {
      const mod = await import('./roms/zx80.js');
      return mod?.default || mod;
    } catch (e) {
      return { metadata: { id: 'zx80' }, rom: new Uint8Array(4096) };
    }
  }
});

export function listRoms() {
  return Array.from(ROM_REGISTRY.values()).map(r => ({ ...r }));
}

export function registerRom(metadata) {
  const id = normalizeId(metadata.id || metadata.name);
  ROM_REGISTRY.set(id, { id, ...metadata });
}

// dynamic factory loader for rom modules in ./roms
export async function loadRomModule(id) {
  const key = normalizeId(id);
  const entry = ROM_REGISTRY.get(key);
  if (entry && entry.loader) return await entry.loader();

  // fallback dynamic import
  try {
    const mod = await import(`./roms/${key}.js`);
    return mod?.default || mod;
  } catch (err) {
    throw new Error(`ROM module not found: ${id}`);
  }
}

// Load ROM bytes + metadata
export async function loadRom(id) {
  const mod = await loadRomModule(id);
  // Expecting module to export: metadata and rom (Uint8Array) or a factory
  if (mod?.getRom) {
    return await mod.getRom();
  }
  const metadata = mod?.metadata || ROM_REGISTRY.get(normalizeId(id)) || {};
  const rom = mod?.rom || mod?.bytes || (mod instanceof Uint8Array ? mod : null);
  if (!rom) throw new Error('ROM module did not provide ROM bytes: ' + id);
  return { metadata, rom: rom instanceof Uint8Array ? rom : new Uint8Array(rom) };
}

// Apply memory configuration based on ROM metadata. Expects memoryModule to expose configureBanks(config) and mapROM(buffer, offset)
export function applyMemoryConfig(memoryModule, metadata, romBytes) {
  if (!memoryModule) throw new Error('memoryModule required');
  if (metadata?.memoryConfig) {
    if (typeof memoryModule.configureBanks === 'function') memoryModule.configureBanks(metadata.memoryConfig);
  }
  if (typeof memoryModule.mapROM === 'function') {
    memoryModule.mapROM(romBytes, 0);
  }
}

export function autoDetectRom(romBytes) {
  const len = romBytes.length;
  if (len === 4096) return { category: 'zx80-81', model: 'zx80' };
  if (len === 8192) return { category: 'zx80-81', model: 'zx81' };
  if (len === 16384) return { category: 'spectrum16-48', model: '16k' };
  if (len === 32768 || len === 49152) return { category: 'spectrum16-48', model: '48k' };
  if (len === 65536 || len === 65536 + 32768) return { category: 'spectrum128-plus2', model: '128k' };
  if (len >= 131072) return { category: 'spectrum-plus3', model: '+3' };
  return { category: 'unknown', model: 'unknown', length: len };
}

// UI helper: populate a <select> element with available ROMs and wire change handler
export function initRomSelector(selectElement, onChange) {
  if (typeof selectElement === 'string') selectElement = document.querySelector(selectElement);
  if (!selectElement) throw new Error('selectElement not found');
  selectElement.innerHTML = '';
  const groups = {};
  for (const r of listRoms()) {
    groups[r.category] = groups[r.category] || [];
    groups[r.category].push(r);
  }
  for (const cat of Object.keys(groups)) {
    const optgrp = document.createElement('optgroup');
    optgrp.label = cat;
    for (const rom of groups[cat]) {
      const opt = document.createElement('option');
      opt.value = rom.id;
      opt.textContent = `${rom.model} — ${rom.description || rom.id}`;
      optgrp.appendChild(opt);
    }
    selectElement.appendChild(optgrp);
  }
  selectElement.addEventListener('change', async (ev) => {
    const id = ev.target.value;
    if (onChange) onChange(id);
  });
}

export function romModuleTemplate({ id = 'specNew', model = '48k', category = 'spectrum16-48', memorySizeKB = 48 } = {}) {
  return `// src/roms/${id}.js (template)\nexport const metadata = {\n  id: '${id}',\n  category: '${category}',\n  model: '${model}',\n  memorySizeKB: ${memorySizeKB},\n  memoryConfig: {\n    // bankSizeKB: 16,\n    // banks: 8,\n    // bankMap: [0,1,2,3,4,5,6,7]\n  }\n};\n\nexport const rom = new Uint8Array([/* bytes */]);\n\nexport default { metadata, rom };\n`;
}

export function registerBuiltin(id, metadata, loader) {
  const key = normalizeId(id);
  ROM_REGISTRY.set(key, { id: key, ...metadata, loader });
}

export default {
  listRoms,
  registerRom,
  loadRom,
  loadRomModule,
  applyMemoryConfig,
  autoDetectRom,
  initRomSelector,
  romModuleTemplate,
  registerBuiltin
};
