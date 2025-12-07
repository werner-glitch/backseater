// Content script: injects a minimal chat container (UI created programmatically)

(function() {
  try {
    if (document.getElementById('backseater-root')) return; // already injected

    const root = document.createElement('div');
    root.id = 'backseater-root';
    root.style.position = 'fixed';
    root.style.bottom = '0';
    root.style.left = '0';
    root.style.width = '100%';
    root.style.zIndex = 2147483647;
    root.style.boxSizing = 'border-box';

    // create a shadow root to reduce CSS collisions
    const shadow = root.attachShadow({ mode: 'open' });

    const container = document.createElement('div');
    container.id = 'backseater-container';
    container.style.width = '100%';
    container.style.maxHeight = '40vh';
    container.style.background = 'rgba(255,255,255,0.95)';
    container.style.borderTop = '1px solid #ddd';
    container.style.borderRadius = '12px 12px 0 0';
    container.style.boxSizing = 'border-box';
    container.style.padding = '8px';
    container.style.display = 'none';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';

    const title = document.createElement('div');
    title.textContent = 'Backseat';
    title.style.fontWeight = '600';

    const controls = document.createElement('div');

    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = 'Open';
    toggleBtn.style.marginLeft = '8px';
    toggleBtn.addEventListener('click', () => {
      if (container.style.display === 'none') {
        container.style.display = 'block';
        toggleBtn.textContent = 'Close';
      } else {
        container.style.display = 'none';
        toggleBtn.textContent = 'Open';
      }
    });

    controls.appendChild(toggleBtn);
    header.appendChild(title);
    header.appendChild(controls);

    container.appendChild(header);

    // message area
    const messages = document.createElement('div');
    messages.id = 'backseater-messages';
    messages.style.overflow = 'auto';
    messages.style.height = '220px';
    messages.style.marginTop = '8px';
    container.appendChild(messages);

    // Debug panel
    const debugPanel = document.createElement('details');
    debugPanel.style.marginTop = '8px';
    const debugSummary = document.createElement('summary');
    debugSummary.textContent = 'Debug Panel';
    debugPanel.appendChild(debugSummary);

    const debugContent = document.createElement('pre');
    debugContent.id = 'backseater-debug';
    debugContent.style.maxHeight = '200px';
    debugContent.style.overflow = 'auto';
    debugContent.style.whiteSpace = 'pre-wrap';
    debugContent.style.fontSize = '12px';
    debugContent.style.background = '#fafafa';
    debugContent.style.padding = '8px';
    debugContent.style.borderRadius = '8px';
    debugPanel.appendChild(debugContent);
    container.appendChild(debugPanel);

    // input area
    const inputWrap = document.createElement('div');
    inputWrap.style.display = 'flex';
    inputWrap.style.gap = '8px';
    inputWrap.style.marginTop = '8px';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Ask something...';
    input.style.flex = '1';
    inputWrap.appendChild(input);

    const screenshotBtn = document.createElement('button');
    screenshotBtn.textContent = '📸';
    screenshotBtn.title = 'Take screenshot (OCR)';
    let lastOcrText = '';
    let lastDomText = '';
    let lastFullText = '';

    screenshotBtn.addEventListener('click', async () => {
      const resp = await chrome.runtime.sendMessage({ type: 'capture' });
      if (!resp || !resp.ok) {
        appendMessage('error', resp?.error || 'Capture failed');
        return;
      }
      appendMessage('info', 'Screenshot captured — sending to OCR...');
      const ocrResp = await chrome.runtime.sendMessage({ type: 'ocr', dataUrl: resp.dataUrl });
      if (!ocrResp || !ocrResp.ok) {
        appendMessage('error', ocrResp?.error || 'OCR failed');
        updateDebug({ error: ocrResp?.error });
        return;
      }
      lastOcrText = ocrResp.text || '';
      appendMessage('info', 'OCR result received (' + (lastOcrText.length) + ' chars)');
      appendMessage('info', lastOcrText.slice(0, 800) + (lastOcrText.length>800? '\n…' : ''));
      // populate DOM and Fulltext for debug
      try {
        lastFullText = document.body ? document.body.textContent || '' : '';
      } catch(e) { lastFullText = ''; }

      // attempt to get DOM include/exclude via profiles
      try {
        const pResp = await chrome.runtime.sendMessage({ type: 'getProfiles' });
        const profiles = pResp?.profiles || [];
        const profile = profiles[0] || null;
        if (profile && profile.filters) {
          const inc = profile.filters.domInclude || [];
          const exc = profile.filters.domExclude || [];
          let includedText = '';
          if (Array.isArray(inc) && inc.length) {
            inc.forEach(sel => {
              try { document.querySelectorAll(sel).forEach(n=> includedText += (n.textContent || '') + '\n'); } catch(e) {}
            });
          }
          // apply exclude by removing matched elements' text
          if (Array.isArray(exc) && exc.length && includedText) {
            exc.forEach(sel => {
              try { document.querySelectorAll(sel).forEach(n=> { const t = n.textContent || ''; includedText = includedText.replace(t, ''); }); } catch(e) {}
            });
          }
          lastDomText = includedText || '';
        }
      } catch (e) { lastDomText = ''; }

      updateDebug({ ocr: lastOcrText, dom: lastDomText, full: lastFullText });
    });

    const sendBtn = document.createElement('button');
    sendBtn.textContent = '➜';
    sendBtn.title = 'Send question';
    sendBtn.addEventListener('click', async () => {
      const val = input.value.trim();
      if (!val) return;
      appendMessage('user', val);
      input.value = '';

      // Build prompt and send ask
      // get profile
      let profilesResp;
      try { profilesResp = await chrome.runtime.sendMessage({ type: 'getProfiles' }); } catch(e) { profilesResp = null; }
      const profiles = profilesResp?.profiles || [];
      const profile = profiles[0] || null;

      const promptParts = [];
      promptParts.push(`System: ${profile?.prompt || 'You are a helpful assistant.'}`);
      promptParts.push('');
      promptParts.push('Content:');
      promptParts.push(lastOcrText || '');
      promptParts.push('');
      promptParts.push(`User question: ${val}`);
      const fullPrompt = promptParts.join('\n');

      updateDebug({ prompt: fullPrompt });

      const askResp = await chrome.runtime.sendMessage({ type: 'ask', userQuestion: val, ocrText: lastOcrText });
      if (!askResp || !askResp.ok) {
        appendMessage('error', askResp?.error || 'KI request failed');
        updateDebug({ error: askResp?.error });
        return;
      }
      appendMessage('info', 'KI reply received');
      appendMessage('info', (askResp.reply || '').slice(0, 2000));
      updateDebug({ ai: askResp.reply });
    });

    inputWrap.appendChild(screenshotBtn);
    inputWrap.appendChild(sendBtn);
    container.appendChild(inputWrap);

    shadow.appendChild(container);
    document.documentElement.appendChild(root);

    function appendMessage(type, text) {
      const el = document.createElement('div');
      el.textContent = text;
      el.style.padding = '6px 8px';
      el.style.margin = '4px 0';
      el.style.borderRadius = '8px';
      if (type === 'user') {
        el.style.background = '#e6f3ff';
        el.style.alignSelf = 'flex-end';
      } else if (type === 'error') {
        el.style.background = '#ffe6e6';
      } else if (type === 'info') {
        el.style.background = '#f2f2f2';
      }
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
    }

    function updateDebug(obj) {
      const el = shadow.getElementById('backseater-debug');
      if (!el) return;
      const parts = [];
      if (obj.error) parts.push('ERROR: ' + obj.error);
      if (obj.ocr !== undefined) parts.push('* OCR-Text (' + (obj.ocr?.length||0) + ' chars):\n' + (obj.ocr||''));
      if (obj.dom !== undefined) parts.push('* DOM-Text (' + (obj.dom?.length||0) + ' chars):\n' + (obj.dom||''));
      if (obj.full !== undefined) parts.push('* Full-Text (' + (obj.full?.length||0) + ' chars):\n' + (obj.full||''));
      if (obj.prompt !== undefined) parts.push('* Prompt (' + (obj.prompt?.length||0) + ' chars):\n' + (obj.prompt||''));
      if (obj.ai !== undefined) parts.push('* AI Reply (' + (obj.ai?.length||0) + ' chars):\n' + (obj.ai||''));
      el.textContent = parts.join('\n\n');
    }
  } catch (err) {
    console.error('Backseater content script error', err);
  }
})();
