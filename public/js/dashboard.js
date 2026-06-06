(function () {
  const API = '/api/sites';
  const sitesGrid = document.getElementById('sites-grid');
  const ingestForm = document.getElementById('ingest-form');
  const ingestUrl = document.getElementById('ingest-url');
  const ingestName = document.getElementById('ingest-name');
  const btnIngest = document.getElementById('btn-ingest');
  const ingestStatus = document.getElementById('ingest-status');
  const toastContainer = document.getElementById('toast-container');

  // Modal refs
  const modalOverlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalClose = document.getElementById('modal-close');
  const settingsNameInput = document.getElementById('settings-name');
  const settingsDomain = document.getElementById('settings-domain');
  const settingsLoginUrl = document.getElementById('settings-login-url');
  const btnCopyUrl = document.getElementById('btn-copy-url');
  const settingsPassword = document.getElementById('settings-password');
  const btnSetPassword = document.getElementById('btn-set-password');
  const passwordStatus = document.getElementById('password-status');
  const settingsDeleteConfirm = document.getElementById('settings-delete-confirm');
  const btnDeleteSite = document.getElementById('btn-delete-site');
  const btnSaveSettings = document.getElementById('btn-save-settings');

  let currentSettingsSiteId = null;
  let currentSettingsSiteName = '';

  function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function formatDate(iso) {
    if (!iso) return 'N/A';
    try {
      return new Date(iso).toLocaleDateString();
    } catch {
      return iso;
    }
  }

  // Load sites
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
        const card = document.createElement('div');
        card.className = 'site-card';
        card.innerHTML = `
          <div class="site-card-name">${escapeHtml(site.name)}</div>
          <div class="site-card-url">${escapeHtml(site.originalUrl)}</div>
          <div class="site-card-meta">
            <span>${site.slotCount || 0} slots</span>
            <span>${site.versionCount || 0} versions</span>
            <span>Created ${formatDate(site.createdAt)}</span>
          </div>
          ${site.publishUrl ? `<div class="site-card-publish">
            <a href="${escapeAttr(site.publishUrl)}" target="_blank" rel="noopener" class="publish-link-badge">Live: ${escapeHtml(site.publishUrl)}</a>
          </div>` : ''}
          <div class="site-card-actions">
            <button class="btn-primary btn-small" data-action="edit" data-id="${site.siteId}">Edit</button>
            <button class="btn-secondary btn-small" data-action="preview" data-id="${site.siteId}">Preview</button>
            <button class="btn-publish-card btn-small" data-action="publish" data-id="${site.siteId}">Publish</button>
            <button class="btn-secondary btn-small" data-action="settings" data-id="${site.siteId}" data-name="${escapeAttr(site.name)}">Settings</button>
          </div>
        `;
        sitesGrid.appendChild(card);
      }

      sitesGrid.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', () => {
          window.location.href = '/editor/' + btn.dataset.id;
        });
      });

      sitesGrid.querySelectorAll('[data-action="preview"]').forEach(btn => {
        btn.addEventListener('click', () => {
          window.open(`${API}/${btn.dataset.id}/preview`, '_blank');
        });
      });

      sitesGrid.querySelectorAll('[data-action="publish"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = 'Publishing...';
          try {
            const res = await fetch(`${API}/${btn.dataset.id}/publish`, { method: 'POST' });
            const data = await res.json();
            if (res.ok && data.success) {
              showToast(`Published: ${data.url}`, 'success');
              loadSites();
            } else {
              showToast(data.error?.message || 'Publish failed', 'error');
            }
          } catch {
            showToast('Publish failed', 'error');
          } finally {
            btn.disabled = false;
            btn.textContent = 'Publish';
          }
        });
      });

      sitesGrid.querySelectorAll('[data-action="settings"]').forEach(btn => {
        btn.addEventListener('click', () => {
          openSettings(btn.dataset.id, btn.dataset.name);
        });
      });
    } catch (err) {
      sitesGrid.innerHTML = '<p class="loading-text" style="color:#e74c3c;">Failed to load sites</p>';
    }
  }

  // Ingest
  ingestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = ingestUrl.value.trim();
    const name = ingestName.value.trim();
    if (!url) return;

    btnIngest.disabled = true;
    btnIngest.textContent = 'Ingesting...';
    ingestStatus.textContent = 'Fetching and parsing site...';
    ingestStatus.className = 'ingest-status';
    ingestStatus.classList.remove('hidden');

    try {
      const res = await fetch(`${API}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, name: name || undefined }),
      });
      const data = await res.json();

      if (res.ok) {
        ingestStatus.classList.add('hidden');
        ingestUrl.value = '';
        ingestName.value = '';
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

  // Settings modal
  function openSettings(siteId, siteName) {
    currentSettingsSiteId = siteId;
    currentSettingsSiteName = siteName;
    modalTitle.textContent = 'Settings: ' + siteName;
    settingsNameInput.value = siteName;
    settingsDomain.value = '';
    settingsLoginUrl.value = window.location.origin + '/login/' + siteId;
    settingsPassword.value = '';
    passwordStatus.textContent = '';
    settingsDeleteConfirm.value = '';
    btnDeleteSite.disabled = true;

    fetch(`${API}/${siteId}`)
      .then(r => r.json())
      .then(meta => {
        settingsDomain.value = meta.customDomain || '';
      })
      .catch(() => {});

    modalOverlay.classList.remove('hidden');
  }

  modalClose.addEventListener('click', () => {
    modalOverlay.classList.add('hidden');
  });

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.add('hidden');
  });

  btnCopyUrl.addEventListener('click', () => {
    navigator.clipboard.writeText(settingsLoginUrl.value).then(() => {
      btnCopyUrl.textContent = 'Copied!';
      setTimeout(() => { btnCopyUrl.textContent = 'Copy'; }, 1500);
    });
  });

  btnSetPassword.addEventListener('click', async () => {
    const pw = settingsPassword.value;
    if (pw.length < 8) {
      passwordStatus.textContent = 'Must be at least 8 characters';
      passwordStatus.className = 'field-status error';
      return;
    }

    btnSetPassword.disabled = true;
    try {
      const res = await fetch(`${API}/${currentSettingsSiteId}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (res.ok) {
        passwordStatus.textContent = 'Password set successfully';
        passwordStatus.className = 'field-status success';
        settingsPassword.value = '';
      } else {
        passwordStatus.textContent = data.error?.message || 'Failed';
        passwordStatus.className = 'field-status error';
      }
    } catch {
      passwordStatus.textContent = 'Connection error';
      passwordStatus.className = 'field-status error';
    } finally {
      btnSetPassword.disabled = false;
    }
  });

  settingsDeleteConfirm.addEventListener('input', () => {
    btnDeleteSite.disabled = settingsDeleteConfirm.value !== currentSettingsSiteName;
  });

  btnDeleteSite.addEventListener('click', async () => {
    if (settingsDeleteConfirm.value !== currentSettingsSiteName) return;
    btnDeleteSite.disabled = true;

    try {
      const res = await fetch(`${API}/${currentSettingsSiteId}`, { method: 'DELETE' });
      if (res.ok) {
        modalOverlay.classList.add('hidden');
        showToast('Site deleted', 'success');
        loadSites();
      } else {
        const data = await res.json();
        showToast(data.error?.message || 'Delete failed', 'error');
      }
    } catch {
      showToast('Connection error', 'error');
    } finally {
      btnDeleteSite.disabled = false;
    }
  });

  btnSaveSettings.addEventListener('click', async () => {
    const name = settingsNameInput.value.trim();
    const customDomain = settingsDomain.value.trim();

    btnSaveSettings.disabled = true;
    try {
      const res = await fetch(`${API}/${currentSettingsSiteId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, customDomain }),
      });
      if (res.ok) {
        modalOverlay.classList.add('hidden');
        showToast('Settings saved', 'success');
        loadSites();
      } else {
        const data = await res.json();
        showToast(data.error?.message || 'Save failed', 'error');
      }
    } catch {
      showToast('Connection error', 'error');
    } finally {
      btnSaveSettings.disabled = false;
    }
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  loadSites();
})();
