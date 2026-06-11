(function (CMS) {
  const { showToast, apiFetch, formatDate } = CMS.utils;
  const state = CMS.state;
  const refs = CMS.refs;
  const fn = CMS.fn;

  if (!state.siteId) return;

  // ── Save ──
  refs.btnSave.addEventListener('click', async () => {
    if (state.saving) return;
    const hasContent = Object.keys(state.pendingChanges).length > 0;
    const hasStyles = Object.keys(state.pendingStyleChanges).length > 0;
    if (!hasContent && !hasStyles) return;

    state.saving = true;
    refs.btnSave.textContent = 'Saving...';

    try {
      if (hasContent) {
        const changes = {};
        for (const [slotId, { newValue }] of Object.entries(state.pendingChanges)) {
          changes[slotId] = newValue;
        }
        const q = state.currentPageId ? `?pageId=${state.currentPageId}` : '';
        const res = await fetch(`${state.API}/content${q}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        });
        const data = await res.json();
        if (data.valid) {
          for (const slotId of Object.keys(state.pendingChanges)) {
            if (state.contentMap[slotId]) {
              state.contentMap[slotId].value = state.pendingChanges[slotId].newValue;
            }
          }
          state.pendingChanges = {};
        } else {
          showToast(data.errors.join('; '), 'error');
          state.saving = false;
          refs.btnSave.textContent = 'Save';
          return;
        }
      }

      if (hasStyles) {
        const q = state.currentPageId ? `?pageId=${state.currentPageId}` : '';
        const res = await fetch(`${state.API}/styles${q}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state.pendingStyleChanges),
        });
        const data = await res.json();
        if (data.valid) {
          state.stylesMap = data.styles;
          state.pendingStyleChanges = {};
        } else {
          showToast(data.errors.join('; '), 'error');
        }
      }

      state.undoStack = [];
      fn.updateChangesUI();
      showToast('Changes saved', 'success');
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error');
    } finally {
      state.saving = false;
      refs.btnSave.textContent = 'Save';
    }
  });

  // ── Publish ──
  refs.btnPublish.addEventListener('click', async () => {
    if (state.publishing) return;

    if (Object.keys(state.pendingChanges).length > 0 || Object.keys(state.pendingStyleChanges).length > 0) {
      if (!confirm('You have unsaved changes. Save first before publishing?')) return;
      refs.btnSave.click();
      return;
    }

    state.publishing = true;
    refs.btnPublish.textContent = 'Publishing...';
    refs.btnPublish.disabled = true;

    try {
      const res = await fetch(`${state.API}/publish`, { method: 'POST' });
      const data = await res.json();

      if (res.ok && data.success) {
        showToast('Site published!', 'success');
        showPublishBar(data.url);
      } else {
        showToast(data.error?.message || 'Publish failed', 'error');
      }
    } catch (err) {
      showToast('Publish failed: ' + err.message, 'error');
    } finally {
      state.publishing = false;
      refs.btnPublish.textContent = 'Publish';
      refs.btnPublish.disabled = false;
    }
  });

  function showPublishBar(url) {
    refs.publishStatusText.textContent = 'Published:';
    refs.publishLink.href = url;
    refs.publishLink.textContent = url;
    refs.publishLink.classList.remove('hidden');
    refs.publishBar.classList.remove('hidden');
  }

  fn.loadPublishStatus = async function () {
    try {
      const res = await fetch(`${state.API}/publish`);
      const data = await res.json();
      if (data.published && data.publishUrl) {
        showPublishBar(data.publishUrl);
      }
    } catch {}
  };

  // ── History ──
  refs.btnHistory.addEventListener('click', () => {
    refs.historyPanel.classList.toggle('hidden');
    if (!refs.historyPanel.classList.contains('hidden')) {
      loadVersions();
    }
  });

  refs.btnCloseHistory.addEventListener('click', () => {
    refs.historyPanel.classList.add('hidden');
  });

  async function loadVersions() {
    refs.historyList.innerHTML = '<p style="color:#888;padding:12px;font-size:12px;">Loading...</p>';
    try {
      const res = await fetch(`${state.API}/versions`);
      const { versions } = await res.json();

      if (versions.length === 0) {
        refs.historyList.innerHTML = '<p style="color:#888;padding:12px;font-size:12px;">No versions yet</p>';
        return;
      }

      refs.historyList.innerHTML = '';
      versions.forEach((v, i) => {
        const item = document.createElement('div');
        item.className = 'history-item';
        const timeDisplay = formatDate(v);

        item.innerHTML = `
          <div class="history-item-time">${i === 0 ? timeDisplay + ' (latest)' : timeDisplay}</div>
          <div class="history-item-actions">
            ${i > 0 ? `<button class="btn-restore" data-version="${v}">Restore</button>` : ''}
          </div>
        `;
        refs.historyList.appendChild(item);
      });

      refs.historyList.querySelectorAll('.btn-restore').forEach(btn => {
        btn.addEventListener('click', async () => {
          const versionId = btn.dataset.version;
          if (!confirm('Restore this version? Current unsaved changes will be lost.')) return;
          try {
            const result = await apiFetch(`${state.API}/rollback/${versionId}`, { method: 'POST' });
            if (!result) return;
            state.pendingChanges = {};
            state.pendingStyleChanges = {};
            state.undoStack = [];
            fn.updateChangesUI();
            await fn.loadContent();
            fn.loadIframe();
            showToast('Version restored', 'success');
            loadVersions();
          } catch (err) {
            showToast('Restore failed: ' + err.message, 'error');
          }
        });
      });
    } catch {
      refs.historyList.innerHTML = '<p style="color:#999999;padding:12px;font-size:12px;">Failed to load versions</p>';
    }
  }
})(window.CMS);
