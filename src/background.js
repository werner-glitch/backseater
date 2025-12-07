// Background service worker (MV3)
// Handles profile storage and messages from UI/content scripts.

const DEFAULT_PROFILE = {
  name: 'Default',
  ollamaUrl: 'http://localhost:11434',
  model: 'llama3',
  ocrUrl: 'http://localhost:8884/tesseract',
  ocrLanguages: ['deu','eng'],
  prompt: 'You are a helpful assistant.',
  filters: {
    regex: '',
    domInclude: [],
    domExclude: []
  }
};

async function getProfiles() {
  const res = await chrome.storage.sync.get({ profiles: [DEFAULT_PROFILE] });
  return res.profiles;
}

async function setProfiles(profiles) {
  await chrome.storage.sync.set({ profiles });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    const data = await chrome.storage.sync.get();
    if (!data || !data.profiles) {
      await chrome.storage.sync.set({ profiles: [DEFAULT_PROFILE] });
      console.log('Backseat: Default profile created');
    }
  } catch (e) {
    console.error('Error initializing default profile', e);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'getProfiles') {
        const p = await getProfiles();
        sendResponse({ ok: true, profiles: p });
      } else if (msg?.type === 'saveProfiles') {
        await setProfiles(msg.profiles || []);
        sendResponse({ ok: true });
      } else if (msg?.type === 'capture') {
        // proxy capture request: background has permission to call captureVisibleTab
        const options = { format: 'png' };
        chrome.tabs.captureVisibleTab(options, (dataUrl) => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse({ ok: true, dataUrl });
        });
      } else if (msg?.type === 'ocr') {
        // Perform OCR POST: expect msg.dataUrl and optional msg.ocrUrl / msg.ocrLanguages
        const dataUrl = msg.dataUrl;
        if (!dataUrl) {
          sendResponse({ ok: false, error: 'missing dataUrl' });
          return;
        }

        // determine OCR endpoint and languages from message or first profile
        let ocrUrl = msg.ocrUrl;
        let ocrLanguages = msg.ocrLanguages;
        if (!ocrUrl || !ocrLanguages) {
          const profiles = await getProfiles();
          const p = Array.isArray(profiles) && profiles.length ? profiles[0] : DEFAULT_PROFILE;
          ocrUrl = ocrUrl || p.ocrUrl;
          ocrLanguages = ocrLanguages || p.ocrLanguages;
        }

        try {
          const blob = dataUrlToBlob(dataUrl);
          const form = new FormData();
          form.append('file', new File([blob], 'screenshot.png', { type: blob.type }));
          form.append('options', JSON.stringify({ languages: ocrLanguages }));

          const controller = new AbortController();
          const timeout = msg.timeoutMs || 30000;
          const id = setTimeout(() => controller.abort(), timeout);

          const res = await fetch(ocrUrl, {
            method: 'POST',
            body: form,
            signal: controller.signal
          });
          clearTimeout(id);

          if (!res.ok) {
            const text = await res.text().catch(()=>'');
            sendResponse({ ok: false, status: res.status, error: `OCR server responded ${res.status}`, body: text });
            return;
          }

          const text = await res.text();
          sendResponse({ ok: true, text });
        } catch (err) {
          if (err.name === 'AbortError') {
            sendResponse({ ok: false, error: 'OCR request timed out' });
          } else {
            sendResponse({ ok: false, error: err?.message || String(err) });
          }
        }
      } else if (msg?.type === 'ask') {
        // Send prompt to Ollama (profile.ollamaUrl). Expect msg.userQuestion and optional profileIndex
        const userQuestion = msg.userQuestion || '';
        const profileIndex = typeof msg.profileIndex === 'number' ? msg.profileIndex : 0;
        const timeout = msg.timeoutMs || 30000;

        const profiles = await getProfiles();
        const profile = (Array.isArray(profiles) && profiles[profileIndex]) || profiles[0] || DEFAULT_PROFILE;

        // Build prompt according to spec
        const promptParts = [];
        promptParts.push(`System: ${profile.prompt}`);
        promptParts.push('');
        promptParts.push('Content:');
        promptParts.push(msg.ocrText || '');
        promptParts.push('');
        promptParts.push(`User question: ${userQuestion}`);
        const fullPrompt = promptParts.join('\n');

        try {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), timeout);

          // POST JSON: { model, prompt }
          const body = JSON.stringify({ model: profile.model, prompt: fullPrompt });
          const res = await fetch(profile.ollamaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            signal: controller.signal
          });
          clearTimeout(id);

          if (!res.ok) {
            const txt = await res.text().catch(()=>'');
            sendResponse({ ok: false, status: res.status, error: `Ollama responded ${res.status}`, body: txt });
            return;
          }

          // Try to parse JSON, otherwise return text
          let replyText = '';
          try {
            const json = await res.json();
            // Heuristic: try common fields
            if (typeof json === 'string') replyText = json;
            else if (json?.text) replyText = json.text;
            else if (json?.response) replyText = json.response;
            else replyText = JSON.stringify(json);
          } catch (e) {
            replyText = await res.text();
          }

          sendResponse({ ok: true, reply: replyText });
        } catch (err) {
          if (err.name === 'AbortError') sendResponse({ ok: false, error: 'Ollama request timed out' });
          else sendResponse({ ok: false, error: err?.message || String(err) });
        }
      } else {
        sendResponse({ ok: false, error: 'unknown message' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || String(err) });
    }
  })();
  return true; // indicate async sendResponse
});

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const b64 = parts[1] || '';
  const binary = atob(b64);
  const len = binary.length;
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = binary.charCodeAt(i);
  return new Blob([u8], { type: mime });
}
