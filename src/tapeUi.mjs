/* eslint-env browser */
/* global document, setTimeout, AbortController */

/**
 * Tape Search UI for ZX Spectrum emulator.
 * Provides search box, results list, detail panel with file listings,
 * and tape loading controls with progress/error display.
 */

import { searchArchive, fetchMetadata, getLoadableFiles, getZipFiles } from './archiveClient.mjs';

// UI state
const state = {
  query: '',
  results: [],
  numFound: 0,
  selectedItem: null,
  isSearching: false,
  isLoadingDetails: false,
  isLoadingTape: false,
  loadProgress: 0,
  error: null,
  abortController: null
};

// DOM element references (populated on init)
let elements = {
  container: null,
  searchInput: null,
  searchButton: null,
  resultsContainer: null,
  resultsList: null,
  detailPanel: null,
  detailTitle: null,
  detailCreator: null,
  detailDate: null,
  detailDescription: null,
  filesList: null,
  progressContainer: null,
  progressBar: null,
  progressText: null,
  errorContainer: null,
  errorText: null,
  retryButton: null,
  closeDetailButton: null
};

// Callbacks (set via setCallbacks)
let callbacks = {
  onLoadTape: null // (url, fileName) => Promise<void>
};

/**
 * Create the UI DOM structure and inject into container.
 * @param {HTMLElement} container - Container element for the UI
 */
export function createUI(container) {
  if (!container) {
    throw new Error('Container element is required');
  }

  container.innerHTML = `
    <div class="tape-ui">
      <div class="tape-search">
        <input type="text" class="tape-search-input" placeholder="Search Archive.org for ZX Spectrum tapes..." />
        <button class="tape-search-btn" type="button">Search</button>
      </div>
      
      <div class="tape-error" style="display: none;">
        <span class="tape-error-text"></span>
        <button class="tape-retry-btn" type="button">Retry</button>
      </div>
      
      <div class="tape-results" style="display: none;">
        <div class="tape-results-header">
          <span class="tape-results-count"></span>
        </div>
        <ul class="tape-results-list"></ul>
      </div>
      
      <div class="tape-detail" style="display: none;">
        <div class="tape-detail-header">
          <h3 class="tape-detail-title"></h3>
          <button class="tape-detail-close" type="button">&times;</button>
        </div>
        <div class="tape-detail-meta">
          <p class="tape-detail-creator"></p>
          <p class="tape-detail-date"></p>
          <p class="tape-detail-description"></p>
        </div>
        <div class="tape-detail-files">
          <h4>Files:</h4>
          <ul class="tape-files-list"></ul>
        </div>
        <div class="tape-progress" style="display: none;">
          <div class="tape-progress-bar-container">
            <div class="tape-progress-bar"></div>
          </div>
          <span class="tape-progress-text"></span>
          <button class="tape-cancel-btn" type="button">Cancel</button>
        </div>
      </div>
    </div>
  `;

  // Cache element references
  elements.container = container.querySelector('.tape-ui');
  elements.searchInput = container.querySelector('.tape-search-input');
  elements.searchButton = container.querySelector('.tape-search-btn');
  elements.resultsContainer = container.querySelector('.tape-results');
  elements.resultsList = container.querySelector('.tape-results-list');
  elements.resultsCount = container.querySelector('.tape-results-count');
  elements.detailPanel = container.querySelector('.tape-detail');
  elements.detailTitle = container.querySelector('.tape-detail-title');
  elements.detailCreator = container.querySelector('.tape-detail-creator');
  elements.detailDate = container.querySelector('.tape-detail-date');
  elements.detailDescription = container.querySelector('.tape-detail-description');
  // Hide the detail description from the search results and remove it from the accessibility tree
  if (elements.detailDescription) {
    elements.detailDescription.style.display = 'none';
    elements.detailDescription.setAttribute('aria-hidden', 'true');
    elements.detailDescription.removeAttribute('tabindex');
  }
  elements.filesList = container.querySelector('.tape-files-list');
  elements.progressContainer = container.querySelector('.tape-progress');
  elements.progressBar = container.querySelector('.tape-progress-bar');
  elements.progressText = container.querySelector('.tape-progress-text');
  elements.cancelButton = container.querySelector('.tape-cancel-btn');
  elements.errorContainer = container.querySelector('.tape-error');
  elements.errorText = container.querySelector('.tape-error-text');
  elements.retryButton = container.querySelector('.tape-retry-btn');
  elements.closeDetailButton = container.querySelector('.tape-detail-close');

  bindEvents();
}

/**
 * Bind event listeners to UI elements.
 */
function bindEvents() {
  elements.searchButton.addEventListener('click', handleSearch);
  elements.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  });

  elements.closeDetailButton.addEventListener('click', closeDetail);
  elements.retryButton.addEventListener('click', handleRetry);
  elements.cancelButton.addEventListener('click', handleCancel);
}

/**
 * Handle search button click or Enter key.
 */
async function handleSearch() {
  const query = elements.searchInput.value.trim();
  if (!query) return;

  state.query = query;
  state.error = null;
  state.isSearching = true;
  updateSearchUI();

  try {
    state.abortController = new AbortController();
    const data = await searchArchive(query, { signal: state.abortController.signal });
    state.results = data.results;
    state.numFound = data.numFound;
    state.isSearching = false;
    updateResultsUI();
  } catch (err) {
    state.isSearching = false;
    if (err.name !== 'AbortError') {
      state.error = err.message;
      showError(err.message);
    }
  }
  updateSearchUI();
}

/**
 * Handle retry button click.
 */
function handleRetry() {
  hideError();
  if (state.selectedItem && state.isLoadingTape) {
    // Retry tape load
    // (would need to track last attempted file)
  } else {
    // Retry search
    handleSearch();
  }
}

/**
 * Handle cancel button click.
 */
function handleCancel() {
  if (state.abortController) {
    state.abortController.abort();
    state.abortController = null;
  }
  state.isLoadingTape = false;
  state.loadProgress = 0;
  updateProgressUI();
}

/**
 * Open detail panel for a result item.
 * @param {Object} item - Search result item
 */
async function openDetail(item) {
  state.selectedItem = item;
  state.isLoadingDetails = true;
  state.error = null;
  updateDetailUI();

  try {
    state.abortController = new AbortController();
    const fullItem = await fetchMetadata(item.id, { signal: state.abortController.signal });
    state.selectedItem = fullItem;
    state.isLoadingDetails = false;
    updateDetailUI();
  } catch (err) {
    state.isLoadingDetails = false;
    if (err.name !== 'AbortError') {
      state.error = err.message;
      showError(err.message);
    }
    updateDetailUI();
  }
}

/**
 * Close detail panel.
 */
function closeDetail() {
  state.selectedItem = null;
  state.isLoadingDetails = false;
  state.isLoadingTape = false;
  state.loadProgress = 0;
  elements.detailPanel.style.display = 'none';
}

/**
 * Handle load tape button click.
 * @param {Object} file - File entry to load
 */
async function handleLoadTape(file) {
  if (!callbacks.onLoadTape) {
    showError('Tape loading not configured');
    return;
  }

  state.isLoadingTape = true;
  state.loadProgress = 0;
  state.error = null;
  updateProgressUI();

  try {
    state.abortController = new AbortController();
    await callbacks.onLoadTape(file.url, file.name, {
      signal: state.abortController.signal,
      onProgress: (percent) => {
        state.loadProgress = percent;
        updateProgressUI();
      }
    });
    state.isLoadingTape = false;
    state.loadProgress = 100;
    updateProgressUI();
    showSuccess(`Loaded: ${file.name}`);
  } catch (err) {
    state.isLoadingTape = false;
    if (err.name !== 'AbortError') {
      state.error = err.message;
      showError(err.message);
    }
    updateProgressUI();
  }
}

/**
 * Update search input/button state.
 */
function updateSearchUI() {
  elements.searchButton.disabled = state.isSearching;
  elements.searchButton.textContent = state.isSearching ? 'Searching...' : 'Search';
}

/**
 * Update results list UI.
 */
function updateResultsUI() {
  if (state.results.length === 0 && !state.isSearching) {
    if (state.query) {
      elements.resultsCount.textContent = 'No results found';
      elements.resultsContainer.style.display = 'block';
    } else {
      elements.resultsContainer.style.display = 'none';
    }
    elements.resultsList.innerHTML = '';
    return;
  }

  elements.resultsCount.textContent = `Found ${state.numFound} items`;
  elements.resultsContainer.style.display = 'block';

  elements.resultsList.innerHTML = state.results.map((item) => `
    <li class="tape-result-item" data-id="${escapeHtml(item.id)}">
      <span class="tape-result-title">${escapeHtml(item.title)}</span>
      <span class="tape-result-creator">${escapeHtml(item.creator)}</span>
      <span class="tape-result-source">${escapeHtml(item.source)}</span>
      <button class="tape-result-details-btn" type="button">Details</button>
    </li>
  `).join('');

  // Bind detail buttons
  elements.resultsList.querySelectorAll('.tape-result-details-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const li = e.target.closest('.tape-result-item');
      const id = li.dataset.id;
      const item = state.results.find((r) => r.id === id);
      if (item) {
        openDetail(item);
      }
    });
  });
}

/**
 * Update detail panel UI.
 */
function updateDetailUI() {
  const item = state.selectedItem;
  if (!item) {
    elements.detailPanel.style.display = 'none';
    return;
  }

  elements.detailPanel.style.display = 'block';
  elements.detailTitle.textContent = item.title;
  elements.detailCreator.textContent = `Creator: ${item.creator}`;
  elements.detailDate.textContent = item.date ? `Date: ${item.date}` : '';
  // Description intentionally hidden in search UI for all result states

  if (state.isLoadingDetails) {
    elements.filesList.innerHTML = '<li>Loading files...</li>';
    return;
  }

  // Get loadable files (snapshots prioritized over tapes) plus ZIPs
  const loadableFiles = getLoadableFiles(item.files || []);
  const zipFiles = getZipFiles(item.files || []);
  const allFiles = [...loadableFiles, ...zipFiles];

  if (allFiles.length === 0) {
    elements.filesList.innerHTML = '<li>No loadable files available</li>';
    return;
  }

  elements.filesList.innerHTML = allFiles.map((file) => {
    // Use appropriate button text based on file type
    const buttonText = file.isSnapshot ? 'Load snapshot' : (file.isTape ? 'Load tape' : 'Load');
    return `
    <li class="tape-file-item" data-url="${escapeHtml(file.url)}" data-name="${escapeHtml(file.name)}">
      <span class="tape-file-name">${escapeHtml(file.name)}</span>
      <span class="tape-file-format">(${escapeHtml(file.format)})</span>
      ${file.size ? `<span class="tape-file-size">${formatSize(file.size)}</span>` : ''}
      <button class="tape-load-btn" type="button">${buttonText}</button>
    </li>
  `;
  }).join('');

  // Bind load buttons
  elements.filesList.querySelectorAll('.tape-load-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const li = e.target.closest('.tape-file-item');
      const file = {
        url: li.dataset.url,
        name: li.dataset.name
      };
      handleLoadTape(file);
    });
  });
}

/**
 * Update progress bar UI.
 */
function updateProgressUI() {
  if (!state.isLoadingTape && state.loadProgress === 0) {
    elements.progressContainer.style.display = 'none';
    return;
  }

  elements.progressContainer.style.display = 'flex';
  elements.progressBar.style.width = `${state.loadProgress}%`;
  elements.progressText.textContent = state.isLoadingTape
    ? `Loading... ${Math.round(state.loadProgress)}%`
    : 'Complete';
}

/**
 * Show error message.
 * @param {string} message - Error message
 */
function showError(message) {
  elements.errorContainer.style.display = 'flex';
  elements.errorText.textContent = message;
}

/**
 * Hide error message.
 */
function hideError() {
  elements.errorContainer.style.display = 'none';
  elements.errorText.textContent = '';
  state.error = null;
}

/**
 * Show success message (toast-like).
 * @param {string} message - Success message
 */
function showSuccess(message) {
  // Simple implementation - could be replaced with toast library
  elements.progressText.textContent = message;
  setTimeout(() => {
    if (!state.isLoadingTape) {
      elements.progressContainer.style.display = 'none';
    }
  }, 3000);
}

/**
 * Escape HTML to prevent XSS.
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Format file size for display.
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Set callbacks for tape loading integration.
 * @param {Object} cbs - Callbacks object
 * @param {Function} cbs.onLoadTape - (url, fileName, opts) => Promise<void>
 */
export function setCallbacks(cbs) {
  if (cbs.onLoadTape) {
    callbacks.onLoadTape = cbs.onLoadTape;
  }
}

/**
 * Get current UI state (for testing/debugging).
 * @returns {Object} Current state
 */
export function getState() {
  return { ...state };
}

/**
 * Reset UI state.
 */
export function reset() {
  state.query = '';
  state.results = [];
  state.numFound = 0;
  state.selectedItem = null;
  state.isSearching = false;
  state.isLoadingDetails = false;
  state.isLoadingTape = false;
  state.loadProgress = 0;
  state.error = null;

  if (state.abortController) {
    state.abortController.abort();
    state.abortController = null;
  }

  if (elements.searchInput) {
    elements.searchInput.value = '';
  }
  if (elements.resultsContainer) {
    elements.resultsContainer.style.display = 'none';
  }
  if (elements.detailPanel) {
    elements.detailPanel.style.display = 'none';
  }
  hideError();
}

/**
 * Show the tape UI panel.
 */
export function showPanel() {
  if (elements.container) {
    elements.container.style.display = 'block';
  }
}

/**
 * Hide the tape UI panel.
 */
export function hidePanel() {
  if (elements.container) {
    elements.container.style.display = 'none';
  }
}

/**
 * Toggle the tape UI panel visibility.
 */
export function togglePanel() {
  if (elements.container) {
    // On first toggle, style.display is '' (empty) - treat as hidden and show panel
    // After that, it's either 'block' (visible) or 'none' (hidden)
    const currentDisplay = elements.container.style.display;
    const isCurrentlyShown = currentDisplay === 'block';
    elements.container.style.display = isCurrentlyShown ? 'none' : 'block';
  }
}

export default {
  createUI,
  setCallbacks,
  getState,
  reset,
  showPanel,
  hidePanel,
  togglePanel
};
