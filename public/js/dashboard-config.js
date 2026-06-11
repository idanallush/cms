(function () {
  const { showToast, escapeHtml } = window.CMS.utils;
  const DASH = window.DASH;
  const API = DASH.API;
  const modalBody = DASH.refs.modalBody;

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
    const connected = DASH.settingsCache && DASH.settingsCache.ai && DASH.settingsCache.ai.connected;
    const model = (DASH.settingsCache && DASH.settingsCache.ai && DASH.settingsCache.ai.model) || 'anthropic/claude-sonnet-4.5';
    const provider = (DASH.settingsCache && DASH.settingsCache.ai && DASH.settingsCache.ai.provider) || 'openrouter';

    const statusClass = connected ? 'connected' : 'disconnected';
    const statusText = connected ? `Connected via ${provider}` : 'Not connected';

    DASH.fn.openModal('AI Editing', `
      <div class="modal-status ${statusClass}">
        <span class="modal-status-dot"></span>
        ${statusText}
      </div>
      <p class="config-desc">Your key is stored on your server and never shown again. Click-to-edit works without AI.</p>
      <div class="config-tabs" style="margin-bottom:14px;">
        <button class="tab-btn ${DASH.selectedProvider === 'openrouter' ? 'active' : ''}" data-provider="openrouter">OpenRouter</button>
        <button class="tab-btn ${DASH.selectedProvider === 'anthropic' ? 'active' : ''}" data-provider="anthropic">Anthropic</button>
      </div>
      <div class="config-fields">
        <div class="modal-field">
          <label>API Key</label>
          <input type="password" id="modal-ai-key" placeholder="${DASH.selectedProvider === 'anthropic' ? 'sk-ant-...' : 'sk-or-...'}" class="input">
        </div>
        <div class="modal-field">
          <label>Model</label>
          <input type="text" id="modal-ai-model" class="input" value="${escapeHtml(model)}">
        </div>
        <button id="modal-btn-save-ai" class="btn-primary btn-small">Save key</button>
      </div>
    `, {
      onOpen: () => {
        modalBody.querySelectorAll('.tab-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            modalBody.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            DASH.selectedProvider = btn.dataset.provider;
            const keyInput = modalBody.querySelector('#modal-ai-key');
            if (keyInput) keyInput.placeholder = DASH.selectedProvider === 'anthropic' ? 'sk-ant-...' : 'sk-or-...';
          });
        });
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
              body: JSON.stringify({ key: 'ai', value: key, provider: DASH.selectedProvider, model }),
            });
            if (res.ok) {
              showToast('AI key saved', 'success');
              DASH.fn.closeModal();
              DASH.fn.loadSettings();
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
    const connected = DASH.settingsCache && DASH.settingsCache.vercel && DASH.settingsCache.vercel.connected;
    const statusClass = connected ? 'connected' : 'disconnected';
    const statusText = connected ? 'Connected to Vercel' : 'Not connected';

    DASH.fn.openModal('Vercel Hosting', `
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
              DASH.fn.closeModal();
              DASH.fn.loadSettings();
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
    const connected = DASH.settingsCache && DASH.settingsCache.db && DASH.settingsCache.db.connected;
    const statusClass = connected ? 'connected' : 'disconnected';
    const statusText = connected ? 'Connected to MongoDB' : 'Using filesystem storage';

    DASH.fn.openModal('Database', `
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
})();
