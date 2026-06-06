(function () {
  const API = '/api/sites';
  const sitesGrid = document.getElementById('sites-grid');
  const ingestForm = document.getElementById('ingest-form');
  const ingestUrl = document.getElementById('ingest-url');
  const ingestName = document.getElementById('ingest-name');
  const ingestHtml = document.getElementById('ingest-html');
  const btnIngest = document.getElementById('btn-ingest');
  const ingestStatus = document.getElementById('ingest-status');
  const toastContainer = document.getElementById('toast-container');

  // Config refs
  const configToggle = document.getElementById('config-toggle');
  const configBody = document.getElementById('config-body');
  const btnToggleConfig = document.getElementById('btn-toggle-config');
  const aiBadge = document.getElementById('ai-badge');
  const vercelBadge = document.getElementById('vercel-badge');
  const dbBadge = document.getElementById('db-badge');
  const dotAi = document.getElementById('dot-ai');
  const dotVercel = document.getElementById('dot-vercel');
  const dotDb = document.getElementById('dot-db');
  const btnSaveAi = document.getElementById('btn-save-ai');
  const btnSaveVercel = document.getElementById('btn-save-vercel');

  let selectedProvider = 'openrouter';

  function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ── Config Toggle ──
  configToggle.addEventListener('click', () => {
    configBody.classList.toggle('hidden');
    btnToggleConfig.innerHTML = configBody.classList.contains('hidden')
      ? '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2H9v5a1 1 0 1 1-2 0V9H2a1 1 0 0 1 0-2h5V2a1 1 0 0 1 1-1z"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 7a1 1 0 0 0 0 2h12a1 1 0 1 0 0-2H2z"/></svg>';
  });

  // ── Provider Tabs ──
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedProvider = btn.dataset.provider;
      const keyInput = document.getElementById('ai-key');
      keyInput.placeholder = selectedProvider === 'anthropic' ? 'sk-ant-...' : 'sk-or-...';
    });
  });

  // ── Load Settings ──
  async function loadSettings() {
    try {
      const res = await fetch(`${API}/settings`);
      if (!res.ok) return;
      const data = await res.json();

      if (data.ai.connected) {
        aiBadge.textContent = `connected · ${data.ai.provider}`;
        aiBadge.className = 'badge badge-green';
        dotAi.classList.add('active');
      }
      if (data.vercel.connected) {
        vercelBadge.textContent = 'connected · vercel';
        vercelBadge.className = 'badge badge-green';
        dotVercel.classList.add('active');
      }
      if (data.db.connected) {
        dbBadge.textContent = 'connected · MongoDB';
        dbBadge.className = 'badge badge-green';
        dotDb.classList.add('active');
      }

      if (data.ai.model) {
        document.getElementById('ai-model').value = data.ai.model;
      }
    } catch {}
  }

  // ── Save AI Key ──
  btnSaveAi.addEventListener('click', async () => {
    const key = document.getElementById('ai-key').value.trim();
    const model = document.getElementById('ai-model').value.trim();
    if (!key) return showToast('Enter an API key', 'error');

    btnSaveAi.disabled = true;
    btnSaveAi.textContent = 'Saving...';
    try {
      const res = await fetch(`${API}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'ai', value: key, provider: selectedProvider, model }),
      });
      if (res.ok) {
        showToast('AI key saved', 'success');
        document.getElementById('ai-key').value = '';
        loadSettings();
      } else {
        const data = await res.json();
        showToast(data.error?.message || 'Save failed', 'error');
      }
    } catch {
      showToast('Connection error', 'error');
    } finally {
      btnSaveAi.disabled = false;
      btnSaveAi.textContent = 'Save key';
    }
  });

  // ── Save Vercel ──
  btnSaveVercel.addEventListener('click', async () => {
    const token = document.getElementById('vercel-token').value.trim();
    const teamId = document.getElementById('vercel-team').value.trim();
    if (!token) return showToast('Enter a Vercel token', 'error');

    btnSaveVercel.disabled = true;
    btnSaveVercel.textContent = 'Connecting...';
    try {
      const res = await fetch(`${API}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'vercel', value: token, teamId }),
      });
      if (res.ok) {
        showToast('Vercel connected', 'success');
        document.getElementById('vercel-token').value = '';
        loadSettings();
      } else {
        const data = await res.json();
        showToast(data.error?.message || 'Failed', 'error');
      }
    } catch {
      showToast('Connection error', 'error');
    } finally {
      btnSaveVercel.disabled = false;
      btnSaveVercel.textContent = 'Connect';
    }
  });

  // ── Load Sites ──
  async function loadSites() {
    try {
      const res = await fetch(API);
      if (res.status === 401 || res.status === 403) {
        window.location.href = '/login';
        return;
      }
      const { sites } = await res.json();

      if (sites.length === 0) {
        sitesGrid.innerHTML = '<p class="loading-text">No sites yet. Ingest one above.</p>';
        return;
      }

      sitesGrid.innerHTML = '';
      sites.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      for (const site of sites) {
        const card = createSiteCard(site);
        sitesGrid.appendChild(card);
      }
    } catch (err) {
      sitesGrid.innerHTML = '<p class="loading-text" style="color:#999999;">Failed to load sites</p>';
    }
  }

  function getSiteStatus(site) {
    if (!site.clientPasswordHash) {
      return { label: 'NOT HANDED OFF', cls: 'status-not-handed' };
    }
    if (site.clientHasAccessed) {
      const name = site.clientDisplayName ? ` · ${site.clientDisplayName}` : '';
      return { label: `LIVE WITH CLIENT${name}`, cls: 'status-live' };
    }
    return { label: 'PASSWORD SET', cls: 'status-password-set' };
  }

  function createSiteCard(site) {
    const card = document.createElement('div');
    card.className = 'site-card';
    const status = getSiteStatus(site);
    const vCount = site.versionCount || 0;
    const pageCount = 1;

    card.innerHTML = `
      <div class="site-card-preview">
        <iframe src="${API}/${site.siteId}/preview" loading="lazy" sandbox></iframe>
        <div class="site-card-preview-bar">
          <div class="preview-dots"><span></span><span></span><span></span></div>
          ${escapeHtml(site.name)} · ${pageCount} page(s)
        </div>
      </div>
      <div class="site-card-body">
        <div class="site-card-title-row">
          <span class="site-card-name">${escapeHtml(site.name)}</span>
          <span class="site-card-status ${status.cls}">${status.label}</span>
        </div>
        <div class="site-card-meta">${pageCount} page · ${vCount} versions in history</div>

        <div class="site-card-actions">
          ${site.publishUrl ? `<button class="btn-action" data-action="live" data-url="${escapeHtml(site.publishUrl)}"><span class="dot-green"></span>View live site</button>` : ''}
          <button class="btn-action" data-action="edit" data-id="${site.siteId}">&#9998; Open editor</button>
          <button class="btn-action" data-action="export" data-id="${site.siteId}">&#8681; Export static</button>
          <button class="btn-action" data-action="rename" data-id="${site.siteId}" data-name="${escapeHtml(site.name)}">&#9998; Rename</button>
          <button class="btn-action btn-action-danger" data-action="delete" data-id="${site.siteId}" data-name="${escapeHtml(site.name)}">&#10005; Delete</button>
        </div>

        <!-- Client Access -->
        <div class="site-card-expand">
          <div class="expand-header" data-expand="client-${site.siteId}">
            &#128273; Client access
            <span>${site.clientPasswordHash ? '· set (password)' : ''}</span>
          </div>
          <div class="expand-body" id="client-${site.siteId}">
            <p class="expand-desc">Set a password, then send your client the editor link below. They can edit only this site.</p>
            <div class="expand-row">
              <input type="text" class="input" placeholder="Client name (shown on login)" value="${escapeHtml(site.clientDisplayName || '')}" data-field="clientName" data-site="${site.siteId}">
            </div>
            <div class="expand-row">
              <input type="password" class="input" placeholder="Min. 8 characters" data-field="password" data-site="${site.siteId}">
              <button class="btn-primary btn-small" data-action="set-password" data-id="${site.siteId}">Set password</button>
            </div>
            <div class="checkbox-row">
              <input type="checkbox" ${site.requireApproval ? 'checked' : ''} data-field="approval" data-site="${site.siteId}">
              <label>Require my approval before their changes go live</label>
            </div>
            <button class="btn-secondary btn-small" style="margin-top:8px;" data-action="gen-token" data-id="${site.siteId}">Generate one-click private link</button>
            <div class="client-url-display">
              <code>${window.location.origin}/editor/?site=${site.siteId}</code>
              <button class="btn-secondary btn-small" data-action="copy-url" data-url="${window.location.origin}/editor/?site=${site.siteId}">Copy</button>
            </div>
          </div>
        </div>

        <!-- Vercel Project -->
        <div class="site-card-expand">
          <div class="expand-header" data-expand="vercel-${site.siteId}">
            &#9650; Vercel project
            <span>${site.publishUrl ? '· live' : ''}</span>
          </div>
          <div class="expand-body" id="vercel-${site.siteId}">
            <p class="expand-desc">The Vercel project this site deploys to whenever it's published.</p>
            <div class="expand-row">
              <input type="text" class="input" placeholder="Vercel project name" value="${escapeHtml(site.vercelProjectName || '')}" data-field="vercelProject" data-site="${site.siteId}">
              <button class="btn-secondary btn-small" data-action="save-vercel" data-id="${site.siteId}">Save</button>
              <button class="btn-primary btn-small" data-action="deploy" data-id="${site.siteId}">Save & deploy</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Event listeners
    card.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.href = '/editor/?site=' + btn.dataset.id;
      });
    });

    card.querySelectorAll('[data-action="live"]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.open(btn.dataset.url, '_blank');
      });
    });

    card.querySelectorAll('[data-action="export"]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.href = `${API}/${btn.dataset.id}/export`;
      });
    });

    card.querySelectorAll('[data-action="copy-url"]').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.url).then(() => {
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
        });
      });
    });

    card.querySelectorAll('[data-action="set-password"]').forEach(btn => {
      btn.addEventListener('click', () => setPassword(btn.dataset.id, card));
    });

    card.querySelectorAll('[data-action="gen-token"]').forEach(btn => {
      btn.addEventListener('click', () => generateToken(btn.dataset.id, card));
    });

    card.querySelectorAll('[data-action="rename"]').forEach(btn => {
      btn.addEventListener('click', () => renameSite(btn.dataset.id, btn.dataset.name));
    });

    card.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => deleteSite(btn.dataset.id, btn.dataset.name));
    });

    card.querySelectorAll('[data-action="deploy"]').forEach(btn => {
      btn.addEventListener('click', () => deploySite(btn.dataset.id, card));
    });

    card.querySelectorAll('[data-action="save-vercel"]').forEach(btn => {
      btn.addEventListener('click', () => saveVercelProject(btn.dataset.id, card));
    });

    // Expand toggles
    card.querySelectorAll('.expand-header').forEach(header => {
      header.addEventListener('click', () => {
        const targetId = header.dataset.expand;
        const body = document.getElementById(targetId);
        if (body) body.classList.toggle('open');
      });
    });

    // Client name change (save on blur)
    card.querySelectorAll('[data-field="clientName"]').forEach(input => {
      input.addEventListener('change', () => {
        saveClientName(input.dataset.site, input.value.trim());
      });
    });

    return card;
  }

  async function setPassword(siteId, card) {
    const pwInput = card.querySelector(`[data-field="password"][data-site="${siteId}"]`);
    const pw = pwInput.value;
    if (pw.length < 8) {
      return showToast('Password must be at least 8 characters', 'error');
    }
    try {
      const res = await fetch(`${API}/${siteId}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        showToast('Password set', 'success');
        pwInput.value = '';
        loadSites();
      } else {
        const data = await res.json();
        showToast(data.error?.message || 'Failed', 'error');
      }
    } catch {
      showToast('Connection error', 'error');
    }
  }

  async function saveClientName(siteId, name) {
    try {
      await fetch(`${API}/${siteId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientDisplayName: name }),
      });
    } catch {}
  }

  async function generateToken(siteId, card) {
    try {
      const res = await fetch(`${API}/${siteId}/access-token`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.token) {
        const url = `${window.location.origin}/editor/?site=${siteId}&token=${data.token}`;
        navigator.clipboard.writeText(url);
        showToast('Private link copied to clipboard', 'success');
      }
    } catch {
      showToast('Failed to generate link', 'error');
    }
  }

  async function saveVercelProject(siteId, card) {
    const input = card.querySelector(`[data-field="vercelProject"][data-site="${siteId}"]`);
    const name = input.value.trim();
    try {
      await fetch(`${API}/${siteId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vercelProjectName: name }),
      });
      showToast('Vercel project saved', 'success');
    } catch {
      showToast('Failed', 'error');
    }
  }

  async function deploySite(siteId, card) {
    const btn = card.querySelector(`[data-action="deploy"][data-id="${siteId}"]`);
    btn.disabled = true;
    btn.textContent = 'Deploying...';
    try {
      // Save project name first
      await saveVercelProject(siteId, card);
      const res = await fetch(`${API}/${siteId}/publish`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Published: ${data.url}`, 'success');
        loadSites();
      } else {
        showToast(data.error?.message || 'Deploy failed', 'error');
      }
    } catch {
      showToast('Deploy failed', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save & deploy';
    }
  }

  // ── Rename Site ──
  async function renameSite(siteId, currentName) {
    const newName = prompt('Enter new site name:', currentName);
    if (!newName || newName.trim() === '' || newName.trim() === currentName) return;

    try {
      const res = await fetch(`${API}/${siteId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        showToast('Site renamed', 'success');
        loadSites();
      } else {
        const data = await res.json();
        showToast(data.error?.message || 'Rename failed', 'error');
      }
    } catch {
      showToast('Connection error', 'error');
    }
  }

  // ── Delete Site ──
  async function deleteSite(siteId, siteName) {
    if (!confirm(`Delete "${siteName}"? This will permanently remove the site and all its versions. This cannot be undone.`)) return;

    try {
      const res = await fetch(`${API}/${siteId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Site deleted', 'success');
        loadSites();
      } else {
        const data = await res.json();
        showToast(data.error?.message || 'Delete failed', 'error');
      }
    } catch {
      showToast('Connection error', 'error');
    }
  }

  // ── Ingest ──
  ingestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = ingestUrl.value.trim();
    const name = ingestName.value.trim();
    const html = ingestHtml.value.trim();

    if (!url && !html) {
      return showToast('Enter a URL or paste HTML', 'error');
    }

    btnIngest.disabled = true;
    btnIngest.textContent = 'Ingesting...';
    ingestStatus.textContent = 'Fetching and parsing site...';
    ingestStatus.className = 'ingest-status';
    ingestStatus.classList.remove('hidden');

    try {
      const body = { name: name || undefined };
      if (html) {
        body.html = html;
        if (url) body.url = url;
      } else {
        body.url = url;
      }

      const res = await fetch(`${API}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok) {
        ingestStatus.classList.add('hidden');
        ingestUrl.value = '';
        ingestName.value = '';
        ingestHtml.value = '';
        showToast(`Site ingested: ${data.slotCount} slots found`, 'success');
        loadSites();
      } else {
        ingestStatus.textContent = data.error?.message || 'Ingest failed';
        ingestStatus.classList.add('error');
      }
    } catch (err) {
      ingestStatus.textContent = 'Connection error';
      ingestStatus.classList.add('error');
    } finally {
      btnIngest.disabled = false;
      btnIngest.textContent = 'Ingest site';
    }
  });

  // Init
  loadSettings();
  loadSites();
})();
