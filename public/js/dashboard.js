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

  // Sidebar integration refs
  const aiBadge = document.getElementById('ai-badge');
  const vercelBadge = document.getElementById('vercel-badge');
  const dbBadge = document.getElementById('db-badge');
  const dotAi = document.getElementById('dot-ai');
  const dotVercel = document.getElementById('dot-vercel');
  const dotDb = document.getElementById('dot-db');

  // Ingest toggle refs
  const btnAddSite = document.getElementById('btn-add-site');
  const ingestSection = document.getElementById('ingest-section');
  const btnCloseIngest = document.getElementById('btn-close-ingest');

  // Modal refs
  const modalOverlay = document.getElementById('modal-overlay');
  const modalBox = document.getElementById('modal-box');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalTabsContainer = document.getElementById('modal-tabs-container');
  const modalClose = document.getElementById('modal-close');

  let selectedProvider = 'openrouter';
  let settingsCache = null;

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

  // ══════════════════════════════════════
  // Modal infrastructure
  // ══════════════════════════════════════

  function openModal(title, bodyHtml, options) {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    modalTabsContainer.style.display = 'none';
    modalTabsContainer.innerHTML = '';

    if (options && options.tabs) {
      modalTabsContainer.style.display = 'flex';
      options.tabs.forEach((tab, i) => {
        const btn = document.createElement('button');
        btn.className = 'modal-tab' + (i === 0 ? ' active' : '');
        btn.textContent = tab.label;
        btn.dataset.tabId = tab.id;
        btn.addEventListener('click', () => switchModalTab(tab.id));
        modalTabsContainer.appendChild(btn);
      });
    }

    modalOverlay.classList.add('open');

    if (options && options.onOpen) {
      options.onOpen();
    }
  }

  function closeModal() {
    modalOverlay.classList.remove('open');
  }

  function switchModalTab(tabId) {
    modalTabsContainer.querySelectorAll('.modal-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tabId === tabId);
    });
    modalBody.querySelectorAll('.modal-tab-content').forEach(panel => {
      panel.classList.toggle('active', panel.id === 'mtab-' + tabId);
    });
  }

  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('open')) closeModal();
  });

  // ══════════════════════════════════════
  // Ingest Toggle (Add site / Close)
  // ══════════════════════════════════════

  if (btnAddSite && ingestSection) {
    btnAddSite.addEventListener('click', () => {
      ingestSection.classList.toggle('hidden');
      if (!ingestSection.classList.contains('hidden')) {
        const firstInput = ingestSection.querySelector('input');
        if (firstInput) firstInput.focus();
      }
    });
  }

  if (btnCloseIngest && ingestSection) {
    btnCloseIngest.addEventListener('click', () => {
      ingestSection.classList.add('hidden');
    });
  }

  // ══════════════════════════════════════
  // Config Manage Buttons
  // ══════════════════════════════════════

  document.querySelectorAll('[data-manage]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const type = btn.dataset.manage;
      if (type === 'ai') openAiManageModal();
      else if (type === 'vercel') openVercelManageModal();
      else if (type === 'db') openDbManageModal();
    });
  });

  function openAiManageModal() {
    const connected = settingsCache && settingsCache.ai && settingsCache.ai.connected;
    const model = (settingsCache && settingsCache.ai && settingsCache.ai.model) || 'anthropic/claude-sonnet-4.5';
    const provider = (settingsCache && settingsCache.ai && settingsCache.ai.provider) || 'openrouter';

    const statusClass = connected ? 'connected' : 'disconnected';
    const statusText = connected ? `Connected via ${provider}` : 'Not connected';

    openModal('AI Editing', `
      <div class="modal-status ${statusClass}">
        <span class="modal-status-dot"></span>
        ${statusText}
      </div>
      <p class="config-desc">Your key is stored on your server and never shown again. Click-to-edit works without AI.</p>
      <div class="config-tabs" style="margin-bottom:14px;">
        <button class="tab-btn ${selectedProvider === 'openrouter' ? 'active' : ''}" data-provider="openrouter">OpenRouter</button>
        <button class="tab-btn ${selectedProvider === 'anthropic' ? 'active' : ''}" data-provider="anthropic">Anthropic</button>
      </div>
      <div class="config-fields">
        <div class="modal-field">
          <label>API Key</label>
          <input type="password" id="modal-ai-key" placeholder="${selectedProvider === 'anthropic' ? 'sk-ant-...' : 'sk-or-...'}" class="input">
        </div>
        <div class="modal-field">
          <label>Model</label>
          <input type="text" id="modal-ai-model" class="input" value="${escapeHtml(model)}">
        </div>
        <button id="modal-btn-save-ai" class="btn-primary btn-small">Save key</button>
      </div>
    `, {
      onOpen: () => {
        // Provider tabs inside modal
        modalBody.querySelectorAll('.tab-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            modalBody.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedProvider = btn.dataset.provider;
            const keyInput = modalBody.querySelector('#modal-ai-key');
            if (keyInput) keyInput.placeholder = selectedProvider === 'anthropic' ? 'sk-ant-...' : 'sk-or-...';
          });
        });
        // Save button
        modalBody.querySelector('#modal-btn-save-ai').addEventListener('click', async () => {
          const key = modalBody.querySelector('#modal-ai-key').value.trim();
          const model = modalBody.querySelector('#modal-ai-model').value.trim();
          if (!key) return showToast('Enter an API key', 'error');

          const btn = modalBody.querySelector('#modal-btn-save-ai');
          btn.disabled = true;
          btn.textContent = 'Saving...';
          try {
            const res = await fetch(`${API}/settings`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key: 'ai', value: key, provider: selectedProvider, model }),
            });
            if (res.ok) {
              showToast('AI key saved', 'success');
              closeModal();
              loadSettings();
            } else {
              const data = await res.json();
              showToast(data.error?.message || 'Save failed', 'error');
            }
          } catch {
            showToast('Connection error', 'error');
          } finally {
            btn.disabled = false;
            btn.textContent = 'Save key';
          }
        });
      }
    });
  }

  function openVercelManageModal() {
    const connected = settingsCache && settingsCache.vercel && settingsCache.vercel.connected;
    const statusClass = connected ? 'connected' : 'disconnected';
    const statusText = connected ? 'Connected to Vercel' : 'Not connected';

    openModal('Vercel Hosting', `
      <div class="modal-status ${statusClass}">
        <span class="modal-status-dot"></span>
        ${statusText}
      </div>
      <p class="config-desc">Connect your Vercel account once. Then every client Publish auto-deploys to their live Vercel site.</p>
      <div class="config-fields">
        <div class="modal-field">
          <label>Vercel Token</label>
          <input type="password" id="modal-vercel-token" placeholder="Vercel token" class="input">
        </div>
        <div class="modal-field">
          <label>Team ID (optional)</label>
          <input type="text" id="modal-vercel-team" placeholder="team_..." class="input">
        </div>
        <button id="modal-btn-save-vercel" class="btn-primary btn-small">Connect</button>
      </div>
    `, {
      onOpen: () => {
        modalBody.querySelector('#modal-btn-save-vercel').addEventListener('click', async () => {
          const token = modalBody.querySelector('#modal-vercel-token').value.trim();
          const teamId = modalBody.querySelector('#modal-vercel-team').value.trim();
          if (!token) return showToast('Enter a Vercel token', 'error');

          const btn = modalBody.querySelector('#modal-btn-save-vercel');
          btn.disabled = true;
          btn.textContent = 'Connecting...';
          try {
            const res = await fetch(`${API}/settings`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key: 'vercel', value: token, teamId }),
            });
            if (res.ok) {
              showToast('Vercel connected', 'success');
              closeModal();
              loadSettings();
            } else {
              const data = await res.json();
              showToast(data.error?.message || 'Failed', 'error');
            }
          } catch {
            showToast('Connection error', 'error');
          } finally {
            btn.disabled = false;
            btn.textContent = 'Connect';
          }
        });
      }
    });
  }

  function openDbManageModal() {
    const connected = settingsCache && settingsCache.db && settingsCache.db.connected;
    const statusClass = connected ? 'connected' : 'disconnected';
    const statusText = connected ? 'Connected to MongoDB' : 'Using filesystem storage';

    openModal('Database', `
      <div class="modal-status ${statusClass}">
        <span class="modal-status-dot"></span>
        ${statusText}
      </div>
      <p class="config-desc">MongoDB enables multi-site management, version history, and team access.</p>
      <div class="modal-divider"></div>
      <p class="modal-info">
        ${connected
          ? 'Your MongoDB connection is active. Data is being stored in the cloud database.'
          : 'Set the <code style="color:#aaa;background:#222;padding:2px 6px;border-radius:3px;">MONGODB_URI</code> environment variable and restart the server to enable MongoDB.'}
      </p>
    `);
  }

  // ══════════════════════════════════════
  // Load Settings
  // ══════════════════════════════════════

  async function loadSettings() {
    try {
      const res = await fetch(`${API}/settings`);
      if (!res.ok) return;
      const data = await res.json();
      settingsCache = data;

      // AI
      if (data.ai.connected) {
        aiBadge.textContent = `connected · ${data.ai.provider}`;
        aiBadge.className = 'badge badge-green';
        dotAi.className = 'status-dot active';
      } else {
        aiBadge.textContent = 'not connected';
        aiBadge.className = 'badge badge-red';
        dotAi.className = 'status-dot inactive';
      }

      // Vercel
      if (data.vercel.connected) {
        vercelBadge.textContent = 'connected · vercel';
        vercelBadge.className = 'badge badge-green';
        dotVercel.className = 'status-dot active';
      } else {
        vercelBadge.textContent = 'not connected';
        vercelBadge.className = 'badge badge-red';
        dotVercel.className = 'status-dot inactive';
      }

      // Database
      if (data.db.connected) {
        dbBadge.textContent = 'connected · MongoDB';
        dbBadge.className = 'badge badge-green';
        dotDb.className = 'status-dot active';
      } else {
        dbBadge.textContent = 'filesystem mode';
        dbBadge.className = 'badge badge-gray';
        dotDb.className = 'status-dot inactive';
      }
    } catch {}
  }

  // ══════════════════════════════════════
  // Load Sites
  // ══════════════════════════════════════

  async function loadSites() {
    try {
      const res = await fetch(API);
      if (res.status === 401 || res.status === 403) {
        window.location.href = '/login';
        return;
      }
      const { sites } = await res.json();

      if (sites.length === 0) {
        sitesGrid.innerHTML = `
          <div class="sites-empty">
            <div class="sites-empty-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            </div>
            <h3>No sites yet</h3>
            <p>Click "Add site" to ingest your first website</p>
          </div>`;
        return;
      }

      sitesGrid.innerHTML = '';
      sites.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      sites.forEach((site, i) => {
        const card = createSiteCard(site);
        card.style.animationDelay = `${i * 60}ms`;
        sitesGrid.appendChild(card);
      });
    } catch (err) {
      sitesGrid.innerHTML = '<p class="loading-text" style="color:#999999;">Failed to load sites</p>';
    }
  }

  function getSiteStatus(site) {
    if (site.publishUrl) {
      return { label: 'LIVE', cls: 'status-live' };
    }
    if (!site.clientPasswordHash) {
      return { label: 'NO CLIENT', cls: 'status-not-handed' };
    }
    return { label: 'DRAFT', cls: 'status-draft' };
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
          <button class="btn-action" data-action="edit" data-id="${site.siteId}">&#9998; Open editor</button>
          ${site.publishUrl ? `<button class="btn-action" data-action="live" data-url="${escapeHtml(site.publishUrl)}"><span class="dot-green"></span>View live</button>` : ''}
          <button class="btn-manage-site" data-action="manage" data-id="${site.siteId}">&#9881; Manage</button>
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

    card.querySelectorAll('[data-action="manage"]').forEach(btn => {
      btn.addEventListener('click', () => openSiteManageModal(site));
    });

    return card;
  }

  // ══════════════════════════════════════
  // Site Manage Modal (Tabbed)
  // ══════════════════════════════════════

  function renderClientTabHtml(site) {
    const hasPassword = !!site.clientPasswordHash;
    const clientName = site.clientDisplayName || '';
    const loginUrl = `${window.location.origin}/login/${site.siteId}`;

    if (hasPassword) {
      return `
        <div class="client-status-badge client-status-active">
          <span class="client-status-dot active"></span>
          Client access: Active
        </div>
        <div class="modal-field">
          <label>Client name</label>
          <p class="modal-info" style="color:#ccc;">${escapeHtml(clientName) || 'Not set'}</p>
        </div>
        <div class="modal-field">
          <label>Password</label>
          <div class="modal-row">
            <span style="color:#888;letter-spacing:2px;">&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;</span>
            <button class="btn-secondary btn-small" id="manage-btn-change-pw">Change</button>
          </div>
        </div>
        <div id="change-pw-form" class="hidden" style="margin-bottom:14px;">
          <div class="modal-field">
            <label>New password (min 8 chars)</label>
            <div class="modal-row">
              <input type="password" id="manage-client-pw" class="input" placeholder="New password">
              <button class="btn-primary btn-small" id="manage-btn-set-pw">Update</button>
            </div>
          </div>
          <div class="modal-field" style="margin-top:8px;">
            <label>Client name</label>
            <input type="text" id="manage-client-name" class="input" placeholder="Client name" value="${escapeHtml(clientName)}">
          </div>
        </div>
        <div class="modal-divider"></div>
        <div class="modal-field">
          <label>Login URL</label>
          <div class="client-url-display">
            <code>${loginUrl}</code>
            <button class="btn-secondary btn-small" id="manage-btn-copy-url" data-url="${loginUrl}">Copy</button>
          </div>
        </div>
        <p class="modal-info" style="margin-top:10px;">Send your client the URL and password. They can edit only this site.</p>
        <div id="client-pw-success" class="hidden" style="margin-top:10px;color:#22c55e;font-size:12px;">Password updated &#10003;</div>
      `;
    } else {
      return `
        <div class="client-status-badge client-status-inactive">
          <span class="client-status-dot inactive"></span>
          Client access: Not configured
        </div>
        <p class="modal-info" style="margin-bottom:14px;">Set a password to give your client access to edit this site.</p>
        <div class="modal-field">
          <label>Client name</label>
          <input type="text" id="manage-client-name" class="input" placeholder="e.g. רועי" value="${escapeHtml(clientName)}">
        </div>
        <div class="modal-field">
          <label>Password (min 8 chars)</label>
          <div class="modal-row">
            <input type="password" id="manage-client-pw" class="input" placeholder="Enter password">
            <button class="btn-primary btn-small" id="manage-btn-set-pw">Set password</button>
          </div>
        </div>
      `;
    }
  }

  function openSiteManageModal(site) {
    const status = getSiteStatus(site);
    const publishDate = site.publishedAt ? new Date(site.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';

    const bodyHtml = `
      <!-- General tab -->
      <div class="modal-tab-content active" id="mtab-general">
        <div class="modal-status ${site.publishUrl ? 'connected' : 'disconnected'}">
          <span class="modal-status-dot"></span>
          ${status.label}
        </div>
        <div class="modal-field">
          <label>Site Name</label>
          <div class="modal-row">
            <input type="text" id="manage-site-name" class="input" value="${escapeHtml(site.name)}">
            <button class="btn-primary btn-small" id="manage-btn-rename">Save</button>
          </div>
        </div>
        <div class="modal-field">
          <label>Original URL</label>
          <p class="modal-info">${escapeHtml(site.originalUrl || 'Pasted HTML')}</p>
        </div>
        <div class="modal-divider"></div>
        <div class="modal-row" style="gap:8px;">
          <button class="btn-action" id="manage-btn-export" data-id="${site.siteId}">&#8681; Export static</button>
          <button class="btn-action btn-action-danger" id="manage-btn-delete" data-id="${site.siteId}" data-name="${escapeHtml(site.name)}">&#10005; Delete site</button>
        </div>
      </div>

      <!-- Client tab -->
      <div class="modal-tab-content" id="mtab-client">
        <div id="client-tab-content">${renderClientTabHtml(site)}</div>
      </div>

      <!-- Publishing tab -->
      <div class="modal-tab-content" id="mtab-publishing">
        <div class="modal-status ${site.publishUrl ? 'connected' : 'disconnected'}">
          <span class="modal-status-dot"></span>
          ${site.publishUrl ? 'Published' : 'Not published'}
        </div>
        ${site.publishUrl ? `<div class="modal-field"><label>Live URL</label><p class="modal-info"><a href="${escapeHtml(site.publishUrl)}" target="_blank" rel="noopener" style="color:#22c55e;">${escapeHtml(site.publishUrl)}</a></p></div>` : ''}
        <div class="modal-field">
          <label>Vercel Project Name</label>
          <div class="modal-row">
            <input type="text" id="manage-vercel-project" class="input" placeholder="Vercel project name" value="${escapeHtml(site.vercelProjectName || '')}">
            <button class="btn-secondary btn-small" id="manage-btn-save-vercel">Save</button>
          </div>
        </div>
        <div class="modal-divider"></div>
        <button class="btn-primary btn-small" id="manage-btn-deploy" data-id="${site.siteId}">Publish now</button>
        <p class="modal-info" style="margin-top:8px;">Last published: ${publishDate}</p>
      </div>

      <!-- History tab -->
      <div class="modal-tab-content" id="mtab-history">
        <div id="manage-history-list">
          <p class="modal-info">Loading versions...</p>
        </div>
      </div>
    `;

    openModal(site.name, bodyHtml, {
      tabs: [
        { id: 'general', label: 'General' },
        { id: 'client', label: 'Client' },
        { id: 'publishing', label: 'Publishing' },
        { id: 'history', label: 'History' },
      ],
      onOpen: () => {
        bindSiteManageEvents(site);
        loadSiteHistory(site.siteId);
      }
    });
  }

  function bindSiteManageEvents(site) {
    const siteId = site.siteId;

    // General — Rename
    const btnRename = modalBody.querySelector('#manage-btn-rename');
    if (btnRename) {
      btnRename.addEventListener('click', async () => {
        const newName = modalBody.querySelector('#manage-site-name').value.trim();
        if (!newName) return;
        try {
          const res = await fetch(`${API}/${siteId}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName }),
          });
          if (res.ok) {
            showToast('Site renamed', 'success');
            closeModal();
            loadSites();
          } else {
            const data = await res.json();
            showToast(data.error?.message || 'Rename failed', 'error');
          }
        } catch {
          showToast('Connection error', 'error');
        }
      });
    }

    // General — Export
    const btnExport = modalBody.querySelector('#manage-btn-export');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        window.location.href = `${API}/${siteId}/export`;
      });
    }

    // General — Delete
    const btnDelete = modalBody.querySelector('#manage-btn-delete');
    if (btnDelete) {
      btnDelete.addEventListener('click', () => {
        if (!confirm(`Delete "${site.name}"? This cannot be undone.`)) return;
        deleteSite(siteId, site.name);
        closeModal();
      });
    }

    // Client — Set password
    bindClientTabEvents(site);


    // Publishing — Save Vercel project
    const btnSaveVercel = modalBody.querySelector('#manage-btn-save-vercel');
    if (btnSaveVercel) {
      btnSaveVercel.addEventListener('click', async () => {
        const name = modalBody.querySelector('#manage-vercel-project').value.trim();
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
      });
    }

    // Publishing — Deploy
    const btnDeploy = modalBody.querySelector('#manage-btn-deploy');
    if (btnDeploy) {
      btnDeploy.addEventListener('click', async () => {
        btnDeploy.disabled = true;
        btnDeploy.textContent = 'Deploying...';
        try {
          // Save project name first
          const projName = modalBody.querySelector('#manage-vercel-project');
          if (projName) {
            await fetch(`${API}/${siteId}/settings`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ vercelProjectName: projName.value.trim() }),
            });
          }
          const res = await fetch(`${API}/${siteId}/publish`, { method: 'POST' });
          const data = await res.json();
          if (res.ok && data.success) {
            showToast(`Published: ${data.url}`, 'success');
            closeModal();
            loadSites();
          } else {
            showToast(data.error?.message || 'Deploy failed', 'error');
          }
        } catch {
          showToast('Deploy failed', 'error');
        } finally {
          btnDeploy.disabled = false;
          btnDeploy.textContent = 'Publish now';
        }
      });
    }
  }

  function bindClientTabEvents(site) {
    const siteId = site.siteId;

    // Change password toggle
    const btnChangePw = modalBody.querySelector('#manage-btn-change-pw');
    if (btnChangePw) {
      btnChangePw.addEventListener('click', () => {
        const form = modalBody.querySelector('#change-pw-form');
        if (form) form.classList.toggle('hidden');
      });
    }

    // Set/update password
    const btnSetPw = modalBody.querySelector('#manage-btn-set-pw');
    if (btnSetPw) {
      btnSetPw.addEventListener('click', async () => {
        const pw = modalBody.querySelector('#manage-client-pw').value;
        if (pw.length < 8) return showToast('Password must be at least 8 characters', 'error');

        const clientNameInput = modalBody.querySelector('#manage-client-name');
        if (clientNameInput) {
          await saveClientName(siteId, clientNameInput.value.trim());
        }

        try {
          const res = await fetch(`${API}/${siteId}/password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pw }),
          });
          if (res.ok) {
            showToast('Password set', 'success');
            // Refresh the site data and re-render client tab
            const siteRes = await fetch(`${API}/${siteId}`);
            if (siteRes.ok) {
              const updatedSite = await siteRes.json();
              const container = modalBody.querySelector('#client-tab-content');
              if (container) {
                container.innerHTML = renderClientTabHtml(updatedSite);
                bindClientTabEvents(updatedSite);
                const successEl = modalBody.querySelector('#client-pw-success');
                if (successEl) {
                  successEl.classList.remove('hidden');
                  setTimeout(() => successEl.classList.add('hidden'), 3000);
                }
              }
            }
            loadSites();
          } else {
            const data = await res.json();
            showToast(data.error?.message || 'Failed', 'error');
          }
        } catch {
          showToast('Connection error', 'error');
        }
      });
    }

    // Name auto-save on blur
    const clientNameInput = modalBody.querySelector('#manage-client-name');
    if (clientNameInput) {
      clientNameInput.addEventListener('change', () => {
        saveClientName(siteId, clientNameInput.value.trim());
      });
    }

    // Copy URL
    const btnCopyUrl = modalBody.querySelector('#manage-btn-copy-url');
    if (btnCopyUrl) {
      btnCopyUrl.addEventListener('click', () => {
        navigator.clipboard.writeText(btnCopyUrl.dataset.url).then(() => {
          btnCopyUrl.textContent = 'Copied!';
          setTimeout(() => { btnCopyUrl.textContent = 'Copy'; }, 1500);
        });
      });
    }
  }

  async function loadSiteHistory(siteId) {
    const container = modalBody.querySelector('#manage-history-list');
    if (!container) return;
    try {
      const res = await fetch(`${API}/${siteId}/versions`);
      if (!res.ok) {
        container.innerHTML = '<p class="modal-info">Could not load history.</p>';
        return;
      }
      const data = await res.json();
      const versions = data.versions || [];
      if (versions.length === 0) {
        container.innerHTML = '<p class="modal-info">No versions yet. Save changes in the editor to create versions.</p>';
        return;
      }
      container.innerHTML = '<ul class="modal-history-list">' + versions.map((v, i) => {
        // versions can be strings (timestamp IDs) or objects with createdAt
        const versionId = typeof v === 'string' ? v : (v.versionId || v._id || '');
        const dateStr = typeof v === 'string' ? v.replace(/-/g, (m, offset) => {
          if (offset === 4 || offset === 7) return '-';
          if (offset === 10) return 'T';
          if (offset === 13 || offset === 16) return ':';
          if (offset === 19) return '.';
          return m;
        }) : (v.createdAt || v.savedAt);
        const date = new Date(dateStr);
        const formatted = isNaN(date.getTime()) ? versionId : date.toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const num = versions.length - i;
        return `<li class="modal-history-item">
          <div>
            <span class="modal-history-version">v${num}</span>
            <span class="modal-history-date">${formatted}</span>
          </div>
          <button class="btn-secondary btn-small" onclick="window.__restoreVersion('${siteId}','${versionId}')">Restore</button>
        </li>`;
      }).join('') + '</ul>';
    } catch {
      container.innerHTML = '<p class="modal-info">Could not load history.</p>';
    }
  }

  window.__restoreVersion = async function(siteId, versionId) {
    if (!confirm('Restore this version? Current content will be saved as a new version first.')) return;
    try {
      const res = await fetch(`${API}/${siteId}/rollback/${versionId}`, { method: 'POST' });
      if (res.ok) {
        showToast('Version restored', 'success');
        loadSiteHistory(siteId);
        loadSites();
      } else {
        const data = await res.json();
        showToast(data.error?.message || 'Restore failed', 'error');
      }
    } catch {
      showToast('Connection error', 'error');
    }
  };

  // ══════════════════════════════════════
  // Site Actions (standalone)
  // ══════════════════════════════════════

  async function saveClientName(siteId, name) {
    try {
      await fetch(`${API}/${siteId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientDisplayName: name }),
      });
    } catch {}
  }

  async function deleteSite(siteId, siteName) {
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

  // ══════════════════════════════════════
  // Ingest
  // ══════════════════════════════════════

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
        if (ingestSection) ingestSection.classList.add('hidden');
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
      btnIngest.textContent = 'Ingest';
    }
  });

  // Init
  loadSettings();
  loadSites();
})();
