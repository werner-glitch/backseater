// Options page JS: Profile CRUD + import/export

const DEFAULT_PROFILE = {
  name: 'Default',
  ollamaUrl: 'http://localhost:11434',
  model: 'llama3',
  ocrUrl: 'http://localhost:8884/tesseract',
  ocrLanguages: ['deu','eng'],
  prompt: 'You are a helpful assistant.',
  filters: { regex: '', domInclude: [], domExclude: [] }
};

async function loadProfiles() {
  const res = await chrome.storage.sync.get({ profiles: [DEFAULT_PROFILE] });
  return res.profiles;
}

async function saveProfiles(profiles) {
  await chrome.storage.sync.set({ profiles });
}

function renderProfiles(profiles) {
  const container = document.getElementById('profiles');
  container.innerHTML = '';
  profiles.forEach((p, idx) => {
    const el = document.createElement('div');
    el.style.border = '1px solid #ddd';
    el.style.padding = '8px';
    el.style.marginBottom = '8px';
    el.style.borderRadius = '8px';

    el.innerHTML = `<strong>${escapeHtml(p.name)}</strong> <div style="font-size:12px;color:#555">${escapeHtml(p.ollamaUrl)} — ${escapeHtml(p.model)}</div>`;

    const edit = document.createElement('button');
    edit.textContent = 'Edit';
    edit.style.marginLeft = '8px';
    edit.addEventListener('click', () => editProfile(idx, profiles));

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.style.marginLeft = '8px';
    del.addEventListener('click', async () => {
      profiles.splice(idx, 1);
      await saveProfiles(profiles);
      renderProfiles(profiles);
    });

    el.appendChild(edit);
    el.appendChild(del);
    container.appendChild(el);
  });
}

function escapeHtml(s) {
  return String(s||'').replace(/[&<>"']/g, (c)=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]);
}

async function editProfile(index, profiles) {
  const p = profiles[index];
  const name = prompt('Profile name', p.name);
  if (name === null) return;
  p.name = name;
  await saveProfiles(profiles);
  renderProfiles(profiles);
}

document.addEventListener('DOMContentLoaded', async () => {
  const profiles = await loadProfiles();
  renderProfiles(profiles);

  document.getElementById('addProfile').addEventListener('click', async () => {
    profiles.push(Object.assign({}, DEFAULT_PROFILE, { name: `Profile ${profiles.length+1}` }));
    await saveProfiles(profiles);
    renderProfiles(profiles);
  });

  document.getElementById('exportProfiles').addEventListener('click', async () => {
    const p = await loadProfiles();
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backseat-profiles.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('importFile').addEventListener('change', async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    try {
      const txt = await f.text();
      const parsed = JSON.parse(txt);
      if (!Array.isArray(parsed)) throw new Error('Expected array of profiles');
      await saveProfiles(parsed);
      renderProfiles(parsed);
      alert('Import erfolgreich');
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  });
});
