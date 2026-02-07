/* eslint-env browser */
/* global fetch, localStorage, URLSearchParams */

/**
 * Archive.org client for ZX Spectrum tape search and metadata fetching.
 * Provides search via advancedsearch API and item metadata for file listings.
 */

const ARCHIVE_BASE = 'https://archive.org';
const ADVANCEDSEARCH_ENDPOINT = `${ARCHIVE_BASE}/advancedsearch.php`;
const METADATA_ENDPOINT = (id) => `${ARCHIVE_BASE}/metadata/${id}`;
const DOWNLOAD_URL = (id, file) => `${ARCHIVE_BASE}/download/${id}/${encodeURIComponent(file)}`;

// ZX Spectrum collection on archive.org
const SPECTRUM_COLLECTION = 'softwarelibrary_zx_spectrum';

// Cache TTLs (milliseconds)
const SEARCH_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const METADATA_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// In-memory cache (localStorage used for persistence)
const memoryCache = new Map();

/**
 * Normalize a search result to a consistent in-memory shape.
 * @param {Object} doc - Raw archive.org document from advancedsearch
 * @returns {Object} Normalized result
 */
export function normalizeSearchResult(doc) {
  return {
    id: doc.identifier || '',
    source: 'archive.org',
    title: (doc.title || 'Unknown').trim(),
    creator: doc.creator || 'Unknown',
    date: doc.publicdate || doc.date || null,
    mediatype: doc.mediatype || null,
    format: Array.isArray(doc.format) ? doc.format : (doc.format ? [doc.format] : []),
    files: [], // Populated later via fetchMetadata
    score: null
  };
}

/**
 * Normalize file entry from metadata.files array.
 * @param {string} identifier - Archive.org item identifier
 * @param {Object} file - Raw file object from metadata
 * @returns {Object} Normalized file entry
 */
export function normalizeFileEntry(identifier, file) {
  const name = file.name || '';
  const ext = name.split('.').pop().toLowerCase();
  const format = ext.toUpperCase();
  const isTape = ['tap', 'tzx'].includes(ext);
  const isSnapshot = ['z80', 'sna'].includes(ext);
  const isZip = ext === 'zip';
  const isImage = ['scr', 'png', 'jpg', 'gif'].includes(ext);

  return {
    name,
    format,
    size: file.size ? parseInt(file.size, 10) : null,
    url: DOWNLOAD_URL(identifier, name),
    compressed: isZip,
    isTape,
    isSnapshot,
    isLoadable: isTape || isSnapshot, // Can be directly loaded into emulator
    isImage,
    md5: file.md5 || null,
    source: file.source || null
  };
}

/**
 * Build an archive.org advancedsearch URL.
 * @param {string} query - User search query (e.g., "jet set willy")
 * @param {Object} options - Search options
 * @param {number} [options.rows=50] - Number of results
 * @param {number} [options.start=0] - Offset for pagination
 * @returns {string} Full advancedsearch URL
 */
export function buildSearchUrl(query, { rows = 50, start = 0 } = {}) {
  const fields = ['identifier', 'creator', 'title', 'mediatype', 'format', 'publicdate'];
  const q = `collection:${SPECTRUM_COLLECTION} title:"${query}"`;

  const params = new URLSearchParams();
  params.set('q', q);
  fields.forEach((f) => params.append('fl[]', f));
  params.set('rows', String(rows));
  params.set('start', String(start));
  params.set('output', 'json');

  return `${ADVANCEDSEARCH_ENDPOINT}?${params.toString()}`;
}

/**
 * Get cached data if valid.
 * @param {string} key - Cache key
 * @param {number} ttl - TTL in milliseconds
 * @returns {Object|null} Cached data or null
 */
function getCached(key, ttl) {
  // Check memory cache first
  if (memoryCache.has(key)) {
    const entry = memoryCache.get(key);
    if (Date.now() - entry.timestamp < ttl) {
      return entry.data;
    }
    memoryCache.delete(key);
  }

  // Check localStorage
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const entry = JSON.parse(stored);
      if (Date.now() - entry.timestamp < ttl) {
        memoryCache.set(key, entry);
        return entry.data;
      }
      localStorage.removeItem(key);
    }
  } catch {
    // localStorage unavailable or invalid JSON
  }

  return null;
}

/**
 * Set cache entry.
 * @param {string} key - Cache key
 * @param {Object} data - Data to cache
 */
function setCache(key, data) {
  const entry = { timestamp: Date.now(), data };
  memoryCache.set(key, entry);

  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable
  }
}

/**
 * Search archive.org for ZX Spectrum items.
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {number} [options.rows=50] - Results per page
 * @param {number} [options.start=0] - Offset
 * @param {AbortSignal} [options.signal] - AbortController signal
 * @returns {Promise<{results: Array, numFound: number, start: number}>}
 */
export async function searchArchive(query, { rows = 50, start = 0, signal } = {}) {
  if (!query || typeof query !== 'string') {
    throw new Error('Search query is required');
  }

  const cacheKey = `archive:search:${query.toLowerCase().trim()}:${rows}:${start}`;
  const cached = getCached(cacheKey, SEARCH_CACHE_TTL);
  if (cached) {
    return cached;
  }

  const url = buildSearchUrl(query.trim(), { rows, start });

  const response = await fetch(url, {
    mode: 'cors',
    signal
  });

  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new Error(`Rate limited. Retry after ${retryAfter || 'a moment'}.`);
    }
    throw new Error(`Archive.org search failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  const responseData = json.response || {};
  const docs = responseData.docs || [];

  const result = {
    results: docs.map(normalizeSearchResult),
    numFound: responseData.numFound || 0,
    start: responseData.start || 0
  };

  setCache(cacheKey, result);
  return result;
}

/**
 * Fetch item metadata including file listings.
 * @param {string} identifier - Archive.org item identifier
 * @param {Object} options
 * @param {AbortSignal} [options.signal] - AbortController signal
 * @returns {Promise<Object>} Normalized item with files array
 */
export async function fetchMetadata(identifier, { signal } = {}) {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Identifier is required');
  }

  const cacheKey = `archive:metadata:${identifier}`;
  const cached = getCached(cacheKey, METADATA_CACHE_TTL);
  if (cached) {
    return cached;
  }

  const url = METADATA_ENDPOINT(identifier);

  const response = await fetch(url, {
    mode: 'cors',
    signal
  });

  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new Error(`Rate limited. Retry after ${retryAfter || 'a moment'}.`);
    }
    throw new Error(`Metadata fetch failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  const meta = json.metadata || {};
  const files = json.files || [];

  const item = {
    id: identifier,
    source: 'archive.org',
    title: (meta.title || 'Unknown').trim(),
    creator: meta.creator || 'Unknown',
    date: meta.publicdate || meta.date || null,
    description: meta.description || null,
    mediatype: meta.mediatype || null,
    files: files.map((f) => normalizeFileEntry(identifier, f)),
    // Preserve host info from raw metadata to help client-side CORS fallbacks
    server: json.server || null,
    d1: json.d1 || null,
    d2: json.d2 || null,
    workable_servers: json.workable_servers || null
  };

  setCache(cacheKey, item);
  return item;
}

/**
 * Get tape files (TAP/TZX) from an item's file list.
 * @param {Array} files - Array of normalized file entries
 * @returns {Array} Only tape files
 */
export function getTapeFiles(files) {
  return files.filter((f) => f.isTape);
}

/**
 * Get snapshot files (Z80/SNA) from an item's file list.
 * Snapshots load directly into memory - faster than tapes.
 * @param {Array} files - Array of normalized file entries
 * @returns {Array} Only snapshot files
 */
export function getSnapshotFiles(files) {
  return files.filter((f) => f.isSnapshot);
}

/**
 * Get all loadable files (tapes + snapshots) from an item's file list.
 * Prioritizes snapshots over tapes for faster loading.
 * @param {Array} files - Array of normalized file entries
 * @returns {Array} Loadable files, snapshots first
 */
export function getLoadableFiles(files) {
  const snapshots = files.filter((f) => f.isSnapshot);
  const tapes = files.filter((f) => f.isTape);
  return [...snapshots, ...tapes];
}

/**
 * Get ZIP files that may contain tapes.
 * @param {Array} files - Array of normalized file entries
 * @returns {Array} Only ZIP files
 */
export function getZipFiles(files) {
  return files.filter((f) => f.compressed);
}

/**
 * Clear all archive-related cache entries.
 */
export function clearCache() {
  memoryCache.clear();

  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith('archive:')) {
        localStorage.removeItem(key);
      }
    });
  } catch {
    // localStorage unavailable
  }
}

export default {
  searchArchive,
  fetchMetadata,
  buildSearchUrl,
  normalizeSearchResult,
  normalizeFileEntry,
  getTapeFiles,
  getSnapshotFiles,
  getLoadableFiles,
  getZipFiles,
  clearCache
};
