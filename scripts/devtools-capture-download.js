(function(){
  if (typeof window === 'undefined') return;
  if (window.__EMU_CAPTURE_INSTALLED) { console.log('[EMU] capture already installed'); return; }
  window.__EMU_CAPTURE_INSTALLED = true;

  window.__EMU_KEY_LOG__ = window.__EMU_KEY_LOG__ || [];

  function shortTarget(t){
    if (!t) return null;
    try{
      return (t.id ? ('#'+t.id) : '') + (t.tagName ? t.tagName.toLowerCase() : (t.nodeName||'')).toLowerCase() + (t.className ? ('.'+(''+t.className).split(/\s+/).join('.')) : '');
    }catch(e){ return String(t); }
  }

  function mk(ev, tag){
    const t = ev.target;
    return {
      ts: Date.now(),
      type: ev.type,
      tag: tag || ev.type,
      target: shortTarget(t),
      targetOuter: (t && t.outerHTML) ? (t.outerHTML.slice(0,300)) : null,
      key: ev.key !== undefined ? ev.key : null,
      code: ev.code !== undefined ? ev.code : null,
      which: ev.which !== undefined ? ev.which : null,
      keyCode: ev.keyCode !== undefined ? ev.keyCode : null,
      isComposing: ev.isComposing === true,
      defaultPrevented: ev.defaultPrevented === true,
      trusted: ev.isTrusted === true,
      bubbles: !!ev.bubbles,
      cancelable: !!ev.cancelable,
      altKey: !!ev.altKey,
      ctrlKey: !!ev.ctrlKey,
      metaKey: !!ev.metaKey,
      shiftKey: !!ev.shiftKey
    };
  }

  function logEvent(ev, label){
    try{
      window.__EMU_KEY_LOG__.push(mk(ev, label));
      if (window.__EMU_KEY_LOG__.length > 32768) window.__EMU_KEY_LOG__.shift();
    }catch(e){ /* ignore */ }
  }

  const evTypes = ['keydown','keypress','keyup','compositionstart','compositionupdate','compositionend','input','focus','blur'];
  evTypes.forEach(ev => {
    window.addEventListener(ev, function(e){ logEvent(e, 'window:'+ev); }, true);
    document.addEventListener(ev, function(e){ logEvent(e, 'document:'+ev); }, true);
  });

  const canvas = document.getElementById && document.getElementById('screen');
  if (canvas){ ['keydown','keypress','keyup','focus','blur','input'].forEach(ev => canvas.addEventListener(ev, function(e){ logEvent(e, 'canvas:'+ev); }, true)); }

  // helper to record focus/overlay state snapshot
  window.__EMU_INSPECT__ = function(){
    try{
      const out = {};
      out.time = Date.now();
      out.activeElement = document.activeElement ? (document.activeElement.id || document.activeElement.tagName || document.activeElement.nodeName) : null;
      out.activeElementOuter = document.activeElement && document.activeElement.outerHTML ? document.activeElement.outerHTML.slice(0,200) : null;
      out.hiddenInput = !!document.getElementById('__emu_hidden_input');
      out.hiddenInputFocused = document.getElementById('__emu_hidden_input') ? (document.activeElement === document.getElementById('__emu_hidden_input')) : false;
      const screen = document.getElementById('screen');
      out.screen = screen ? { id: screen.id || null, tabIndex: screen.getAttribute && screen.getAttribute('tabindex'), rect: screen.getBoundingClientRect ? screen.getBoundingClientRect().toJSON() : null } : null;
      if (screen){ const r = screen.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2); out.elementAtCanvasCenter = el ? (el.id || el.tagName || (el.outerHTML && el.outerHTML.slice(0,200))) : null; }
      try{ out.windowTest = window.__TEST__ ? { inputListeners: window.__TEST__.inputListeners || null, keyEventsTail: (window.__TEST__.keyEvents || []).slice(-20) } : null; }catch(e){}
      console.log(out);
      return out;
    }catch(e){ console.error('[EMU] inspect failed', e); return null; }
  };

  window.__EMU_DUMP_LOG__ = function(filename){
    try{
      const payload = {
        meta: {
          createdAt: Date.now(),
          userAgent: navigator.userAgent,
          url: location.href
        },
        events: window.__EMU_KEY_LOG__ || []
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || ('emu-key-log-' + (new Date()).toISOString().replace(/[:.]/g,'-') + '.json');
      document.body.appendChild(a);
      a.click();
      setTimeout(function(){ try{ URL.revokeObjectURL(url); a.remove(); }catch(e){} }, 1000);
      console.log('[EMU] dumped', a.download, 'events:', payload.events.length);
      return payload;
    }catch(e){ console.error('[EMU] dump failed', e); return null; }
  };

  window.__EMU_CLEAR_LOG__ = function(){ window.__EMU_KEY_LOG__ = []; console.log('[EMU] log cleared'); };

  // keyboard shortcut: Ctrl+Shift+S to dump
  window.addEventListener('keydown', function(e){ try{ if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')){ e.preventDefault(); window.__EMU_DUMP_LOG__(); } }catch(err){} }, true);

  // add a small dump button (non-invasive)
  try{
    const btn = document.createElement('button');
    btn.id = '__emu_dump_button';
    btn.textContent = 'Dump EMU Log';
    btn.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:2147483647;padding:6px 8px;font-size:11px;opacity:0.85;';
    btn.addEventListener('click', function(){ window.__EMU_DUMP_LOG__(); });
    document.body.appendChild(btn);
  }catch(e){}

  console.log('[EMU] capture installed. Use window.__EMU_DUMP_LOG__() to save a JSON log, window.__EMU_INSPECT__() to inspect focus/state, and window.__EMU_CLEAR_LOG__() to clear. Shortcut Ctrl+Shift+S available.');
})();
