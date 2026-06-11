(function () {
  const { showToast, apiFetch, escapeHtml } = window.CMS.utils;
  const API = '/api/sites';

  const sitesGrid = document.getElementById('sites-grid');
  const toastContainer = document.getElementById('toast-container');

  const aiBadge = document.getElementById('ai-badge');
  const vercelBadge = document.getElementById('vercel-badge');
  const dbBadge = document.getElementById('db-badge');
  const dotAi = document.getElementById('dot-ai');
  const dotVercel = document.getElementById('dot-vercel');
  const dotDb = document.getElementById('dot-db');

  const btnAddSite = document.getElementById('btn-add-site');
  const ingestSection = document.getElementById('ingest-section');
  const btnCloseIngest = document.getElementById('btn-close-ingest');

  const modalOverlay = document.getElementById('modal-overlay');
  const modalBox = document.getElementById('modal-box');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalTabsContainer = document.getElementById('modal-tabs-container');
  const modalClose = document.getElementById('modal-close');

  let selectedProvider = 'openrouter';
  let settingsCache = null;

  window.DASH = {
    API,
    refs: { sitesGrid, modalOverlay, modalBox, modalTitle, modalBody, modalTabsContainer, modalClose },
    get settingsCache() { return settingsCache; },
    set settingsCache(v) { settingsCache = v; },
    get selectedProvider() { return selectedProvider; },
    set selectedProvider(v) { selectedProvider = v; },
    fn: {},
  };

  // ── Modal infrastructure ──

  window.DASH.fn.openModal = function (title, bodyHtml, options) {
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
  };

  window.DASH.fn.closeModal = function () {
    modalOverlay.classList.remove('open');
  };

  function switchModalTab(tabId) {
    modalTabsContainer.querySelectorAll('.modal-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tabId === tabId);
    });
    modalBody.querySelectorAll('.modal-tab-content').forEach(panel => {
      panel.classList.toggle('active', panel.id === 'mtab-' + tabId);
    });
  }

  modalClose.addEventListener('click', window.DASH.fn.closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) window.DASH.fn.closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('open')) window.DASH.fn.closeModal();
  });

  // ── Ingest Toggle ──

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

  // ── Load Settings ──

  window.DASH.fn.loadSettings = async function () {
    try {
      const res = await fetch(`${API}/settings`);
      if (!res.ok) return;
      const data = await res.json();
      settingsCache = data;

      if (data.ai.connected) {
        aiBadge.textContent = `connected · ${data.ai.provider}`;
        aiBadge.className = 'badge badge-green';
        dotAi.className = 'status-dot active';
      } else {
        aiBadge.textContent = 'not connected';
        aiBadge.className = 'badge badge-red';
        dotAi.className = 'status-dot inactive';
      }

      if (data.vercel.connected) {
        vercelBadge.textContent = 'connected · vercel';
        vercelBadge.className = 'badge badge-green';
        dotVercel.className = 'status-dot active';
      } else {
        vercelBadge.textContent = 'not connected';
        vercelBadge.className = 'badge badge-red';
        dotVercel.className = 'status-dot inactive';
      }

      if (data.db.connected) {
        dbBadge.textContent = 'connected · MongoDB';
        dbBadge.className = 'badge badge-green';
        dotDb.className = 'status-dot active';
      } else {
        dbBadge.textContent = 'filesystem mode';
        dbBadge.className = 'badge badge-gray';
        dotDb.className = 'status-dot inactive';
      }
    } catch (err) {
      console.error('[dashboard] loadSettings error:', err.message);
    }
  };

  // ── Load Sites ──

  function getSiteStatus(site) {
    if (site.publishUrl) {
      return { label: 'LIVE', cls: 'status-live' };
    }
    if (!site.clientPasswordHash) {
      return { label: 'NO CLIENT', cls: 'status-not-handed' };
    }
    return { label: 'DRAFT', cls: 'status-draft' };
  }

  window.DASH.fn.getSiteStatus = getSiteStatus;

  function createSiteCard(site) {
    const card = document.createElement('div');
    card.className = 'site-card';
    const status = getSiteStatus(site);
    const vCount = site.versionCount || 0;
    const pageCount = site.pageCount || 1;

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
      btn.addEventListener('click', () => {
        if (window.DASH.fn.openSiteManageModal) {
          window.DASH.fn.openSiteManageModal(site);
        }
      });
    });

    return card;
  }

  window.DASH.fn.loadSites = async function () {
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
  };

  // Init
  window.DASH.fn.loadSettings();
  window.DASH.fn.loadSites();
})();
