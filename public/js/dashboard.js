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
  // Config Toggle
  // ══════════════════════════════════════

  configToggle.addEventListener('click', () => {
    configBody.classList.toggle('hidden');
    btnToggleConfig.innerHTML = configBody.classList.contains('hidden')
      ? '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2H9v5a1 1 0 1 1-2 0V9H2a1 1 0 0 1 0-2h5V2a1 1 0 0 1 1-1z"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 7a1 1 0 0 0 0 2h12a1 1 0 1 0 0-2H2z"/></svg>';
  });

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
        <div class="modal-field">
          <label>Client Name (shown on login)</label>
          <input type="text" id="manage-client-name" class="input" placeholder="Client name" value="${escapeHtml(site.clientDisplayName || '')}">
        </div>
        <div class="modal-field">
          <label>Set Password</label>
          <div class="modal-row">
            <input type="password" id="manage-client-pw" class="input" placeholder="Min. 8 characters">
            <button class="btn-primary btn-small" id="manage-btn-set-pw">Set</button>
          </div>
        </div>
        <div class="checkbox-row" style="margin-bottom:14px;">
          <input type="checkbox" id="manage-approval" ${site.requireApproval ? 'checked' : ''}>
          <label>Require my approval before changes go live</label>
        </div>
        <div class="modal-divider"></div>
        <div class="modal-field">
          <label>Client Editor URL</label>
          <div class="client-url-display">
            <code>${window.location.origin}/editor/?site=${site.siteId}</code>
            <button class="btn-secondary btn-small" id="manage-btn-copy-url" data-url="${window.location.origin}/editor/?site=${site.siteId}">Copy</button>
          </div>
        </div>
        <button class="btn-secondary btn-small" id="manage-btn-gen-token" style="margin-top:8px;">Generate one-click private link</button>
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
    const btnSetPw = modalBody.querySelector('#manage-btn-set-pw');
    if (btnSetPw) {
      btnSetPw.addEventListener('click', async () => {
        const pw = modalBody.querySelector('#manage-client-pw').value;
        if (pw.length < 8) return showToast('Password must be at least 8 characters', 'error');
        try {
          const res = await fetch(`${API}/${siteId}/password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pw }),
          });
          if (res.ok) {
            showToast('Password set', 'success');
            modalBody.querySelector('#manage-client-pw').value = '';
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

    // Client — Name blur save
    const clientNameInput = modalBody.querySelector('#manage-client-name');
    if (clientNameInput) {
      clientNameInput.addEventListener('change', () => {
        saveClientName(siteId, clientNameInput.value.trim());
      });
    }

    // Client — Copy URL
    const btnCopyUrl = modalBody.querySelector('#manage-btn-copy-url');
    if (btnCopyUrl) {
      btnCopyUrl.addEventListener('click', () => {
        navigator.clipboard.writeText(btnCopyUrl.dataset.url).then(() => {
          btnCopyUrl.textContent = 'Copied!';
          setTimeout(() => { btnCopyUrl.textContent = 'Copy'; }, 1500);
        });
      });
    }

    // Client — Generate token
    const btnGenToken = modalBody.querySelector('#manage-btn-gen-token');
    if (btnGenToken) {
      btnGenToken.addEventListener('click', async () => {
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
      });
    }

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

  async function loadSiteHistory(siteId) {
    const container = modalBody.querySelector('#manage-history-list');
    if (!container) return;
    try {
      const res = await fetch(`${API}/${siteId}/history`);
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
      container.innerHTML = '<ul class="modal-history-list">' + versions.map(v => {
        const date = new Date(v.createdAt || v.savedAt).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const badge = v.published
          ? '<span class="modal-history-badge published">published</span>'
          : '<span class="modal-history-badge">draft</span>';
        return `<li class="modal-history-item"><span class="modal-history-date">${date}</span>${badge}</li>`;
      }).join('') + '</ul>';
    } catch {
      container.innerHTML = '<p class="modal-info">Could not load history.</p>';
    }
  }

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
