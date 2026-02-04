/* UI helper to display transient keyword text (e.g., LIST) for debugging and accessibility */
export function initKeywordUI() {
  if (typeof document === 'undefined') return null;
  // Avoid duplicate initialization
  if (window.__EMU_UI__ && window.__EMU_UI__._inited) return window.__EMU_UI__;

  const el = document.createElement('div');
  el.id = '__emu_keyword';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.style.position = 'fixed';
  el.style.right = '16px';
  el.style.top = '16px';
  el.style.zIndex = '2147483646';
  el.style.background = 'rgba(0,0,0,0.8)';
  el.style.color = '#fff';
  el.style.padding = '6px 10px';
  el.style.borderRadius = '4px';
  el.style.fontFamily = 'monospace';
  el.style.fontSize = '14px';
  el.style.display = 'none';
  el.style.pointerEvents = 'none';
  el.style.opacity = '0';
  el.style.transition = 'opacity 120ms linear';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);

  let timeoutId = null;

  function showKeyword(text, { timeout = 1500 } = {}) {
    el.textContent = text;
    el.style.display = 'block';
    // Ensure reflow for transition
    requestAnimationFrame(() => { el.style.opacity = '1'; el.setAttribute('aria-hidden', 'false'); });
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => hideKeyword(), timeout);
  }

  function hideKeyword() {
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    el.style.opacity = '0';
    el.setAttribute('aria-hidden', 'true');
    // remove visually after transition
    setTimeout(() => { try { if (el.style.opacity === '0') el.style.display = 'none'; } catch (e) {} }, 200);
  }

  // Expose a small API via window for tests and debug
  window.__EMU_UI__ = window.__EMU_UI__ || {};
  window.__EMU_UI__.showKeyword = showKeyword;
  window.__EMU_UI__.hideKeyword = hideKeyword;
  window.__EMU_UI__._inited = true;
  window.__EMU_UI__._el = el;

  return window.__EMU_UI__;
}
