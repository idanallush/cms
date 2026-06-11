(function () {
  const { showToast, escapeHtml } = window.CMS.utils;
  const DASH = window.DASH;
  const API = DASH.API;
  const modalBody = DASH.refs.modalBody;

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

  DASH.fn.openSiteManageModal = function (site) {
    const status = DASH.fn.getSiteStatus(site);
    const publishDate = site.publishedAt ? new Date(site.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';

    const bodyHtml = `
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

      <div class="modal-tab-content" id="mtab-client">
        <div id="client-tab-content">${renderClientTabHtml(site)}</div>
      </div>

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

      <div class="modal-tab-content" id="mtab-history">
        <div id="manage-history-list">
          <p class="modal-info">Loading versions...</p>
        </div>
      </div>
    `;

    DASH.fn.openModal(site.name, bodyHtml, {
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
  };

  function bindSiteManageEvents(site) {
    const siteId = site.siteId;

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
            DASH.fn.closeModal();
            DASH.fn.loadSites();
          } else {
            const data = await res.json();
            showToast(data.error?.message || 'Rename failed', 'error');
          }
        } catch {
          showToast('Connection error', 'error');
        }
      });
    }

    const btnExport = modalBody.querySelector('#manage-btn-export');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        window.location.href = `${API}/${siteId}/export`;
      });
    }

    const btnDelete = modalBody.querySelector('#manage-btn-delete');
    if (btnDelete) {
      btnDelete.addEventListener('click', () => {
        if (!confirm(`Delete "${site.name}"? This cannot be undone.`)) return;
        deleteSite(siteId);
        DASH.fn.closeModal();
      });
    }

    bindClientTabEvents(site);

    const btnSaveVercel = modalBody.querySelector('#manage-btn-save-vercel');
    if (btnSaveVercel) {
      btnSaveVercel.addEventListener('click', async () => {
        const name = modalBody.querySelector('#manage-vercel-project').value.trim();
        try {
          const res = await fetch(`${API}/${siteId}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vercelProjectName: name }),
          });
          if (res.ok) {
            showToast('Vercel project saved', 'success');
          } else {
            const data = await res.json().catch(() => ({}));
            showToast(data.error?.message || 'Save failed', 'error');
          }
        } catch {
          showToast('Network error', 'error');
        }
      });
    }

    const btnDeploy = modalBody.querySelector('#manage-btn-deploy');
    if (btnDeploy) {
      btnDeploy.addEventListener('click', async () => {
        btnDeploy.disabled = true;
        btnDeploy.textContent = 'Deploying...';
        try {
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
            DASH.fn.closeModal();
            DASH.fn.loadSites();
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

    const btnChangePw = modalBody.querySelector('#manage-btn-change-pw');
    if (btnChangePw) {
      btnChangePw.addEventListener('click', () => {
        const form = modalBody.querySelector('#change-pw-form');
        if (form) form.classList.toggle('hidden');
      });
    }

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
            DASH.fn.loadSites();
          } else {
            const data = await res.json();
            showToast(data.error?.message || 'Failed', 'error');
          }
        } catch {
          showToast('Connection error', 'error');
        }
      });
    }

    const clientNameInput = modalBody.querySelector('#manage-client-name');
    if (clientNameInput) {
      clientNameInput.addEventListener('change', () => {
        saveClientName(siteId, clientNameInput.value.trim());
      });
    }

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
      const ul = document.createElement('ul');
      ul.className = 'modal-history-list';
      versions.forEach((v, i) => {
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
        const li = document.createElement('li');
        li.className = 'modal-history-item';
        const info = document.createElement('div');
        info.innerHTML = `<span class="modal-history-version">v${num}</span><span class="modal-history-date">${escapeHtml(formatted)}</span>`;
        const btn = document.createElement('button');
        btn.className = 'btn-secondary btn-small';
        btn.textContent = 'Restore';
        btn.addEventListener('click', () => restoreVersion(siteId, versionId));
        li.appendChild(info);
        li.appendChild(btn);
        ul.appendChild(li);
      });
      container.innerHTML = '';
      container.appendChild(ul);
    } catch {
      container.innerHTML = '<p class="modal-info">Could not load history.</p>';
    }
  }

  async function restoreVersion(siteId, versionId) {
    if (!confirm('Restore this version? Current content will be saved as a new version first.')) return;
    try {
      const res = await fetch(`${API}/${siteId}/rollback/${encodeURIComponent(versionId)}`, { method: 'POST' });
      if (res.ok) {
        showToast('Version restored', 'success');
        loadSiteHistory(siteId);
        DASH.fn.loadSites();
      } else {
        const data = await res.json();
        showToast(data.error?.message || 'Restore failed', 'error');
      }
    } catch {
      showToast('Connection error', 'error');
    }
  }

  async function saveClientName(siteId, name) {
    try {
      const res = await fetch(`${API}/${siteId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientDisplayName: name }),
      });
      if (!res.ok) console.error('[dashboard] saveClientName failed:', res.status);
    } catch (err) {
      console.error('[dashboard] saveClientName error:', err.message);
    }
  }

  async function deleteSite(siteId) {
    try {
      const res = await fetch(`${API}/${siteId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Site deleted', 'success');
        DASH.fn.loadSites();
      } else {
        const data = await res.json();
        showToast(data.error?.message || 'Delete failed', 'error');
      }
    } catch {
      showToast('Connection error', 'error');
    }
  }
})();
