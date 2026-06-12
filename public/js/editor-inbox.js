// editor-inbox.js — Inbox tab for form submissions
(function () {
  'use strict';

  const { state, refs, fn, utils } = window.CMS;
  const { apiFetch, escapeHtml, formatDate, showToast } = utils;

  let loaded = false;
  let submissions = [];
  let currentPage = 1;
  let totalPages = 1;

  function getPathname(url) {
    try { return new URL(url).pathname || '/'; } catch { return url; }
  }

  function getPanel() {
    return document.getElementById('panel-inbox');
  }

  function buildInboxUI() {
    const panel = getPanel();
    panel.innerHTML = `
      <div class="inbox-header">
        <div class="inbox-title">
          <span>Inbox</span>
          <span id="inbox-count" class="inbox-count hidden">0</span>
        </div>
        <button id="inbox-refresh" class="inbox-refresh-btn" title="Refresh">&#8635;</button>
      </div>
      <div id="inbox-list" class="inbox-list"></div>
      <div id="inbox-empty" class="panel-empty hidden">
        <p>No submissions yet</p>
        <p class="panel-empty-sub">Form submissions from your published site will appear here</p>
      </div>
      <div id="inbox-pagination" class="inbox-pagination hidden">
        <button id="inbox-prev" class="inbox-page-btn" disabled>&larr; Prev</button>
        <span id="inbox-page-info" class="inbox-page-info">1 / 1</span>
        <button id="inbox-next" class="inbox-page-btn">Next &rarr;</button>
      </div>
    `;

    document.getElementById('inbox-refresh').addEventListener('click', () => loadSubmissions());
    document.getElementById('inbox-prev').addEventListener('click', () => {
      if (currentPage > 1) { currentPage--; loadSubmissions(); }
    });
    document.getElementById('inbox-next').addEventListener('click', () => {
      if (currentPage < totalPages) { currentPage++; loadSubmissions(); }
    });
  }

  async function loadSubmissions() {
    const siteId = state.siteId;
    if (!siteId) return;

    try {
      const data = await apiFetch(`/api/sites/${siteId}/submissions?page=${currentPage}&limit=30`);
      submissions = data.submissions || [];
      totalPages = data.totalPages || 1;
      currentPage = data.page || 1;
      renderList();
      updateUnreadBadge();
    } catch (err) {
      console.error('[inbox] Load error:', err);
      showToast('Failed to load submissions', 'error');
    }
  }

  function renderList() {
    const list = document.getElementById('inbox-list');
    const empty = document.getElementById('inbox-empty');
    const pagination = document.getElementById('inbox-pagination');

    if (submissions.length === 0) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      pagination.classList.add('hidden');
      return;
    }

    empty.classList.add('hidden');
    list.innerHTML = submissions.map(sub => {
      const fields = sub.fields || {};
      const keys = Object.keys(fields);
      const preview = keys.slice(0, 3).map(k => `<span class="inbox-field"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(fields[k]).slice(0, 80))}</span>`).join('');
      const extra = keys.length > 3 ? `<span class="inbox-more">+${keys.length - 3} more</span>` : '';
      const readCls = sub.isRead ? 'inbox-item-read' : 'inbox-item-unread';
      const time = sub.createdAt ? formatDate(sub.createdAt) : '';

      return `
        <div class="inbox-item ${readCls}" data-id="${sub._id}">
          <div class="inbox-item-header">
            <span class="inbox-item-dot ${sub.isRead ? '' : 'unread'}"></span>
            <span class="inbox-item-time">${escapeHtml(time)}</span>
            ${sub.pageUrl ? `<span class="inbox-item-page" title="${escapeHtml(sub.pageUrl)}">${escapeHtml(getPathname(sub.pageUrl))}</span>` : ''}
            <div class="inbox-item-actions">
              ${!sub.isRead ? `<button class="inbox-btn-read" data-id="${sub._id}" title="Mark as read">&#10003;</button>` : ''}
              <button class="inbox-btn-delete" data-id="${sub._id}" title="Delete">&times;</button>
            </div>
          </div>
          <div class="inbox-item-fields">${preview}${extra}</div>
        </div>
      `;
    }).join('');

    // Toggle expand on item click
    list.querySelectorAll('.inbox-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.inbox-btn-read') || e.target.closest('.inbox-btn-delete')) return;
        const id = item.dataset.id;
        toggleExpand(item, id);
      });
    });

    // Mark read buttons
    list.querySelectorAll('.inbox-btn-read').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        markRead(btn.dataset.id);
      });
    });

    // Delete buttons
    list.querySelectorAll('.inbox-btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSubmission(btn.dataset.id);
      });
    });

    // Pagination
    if (totalPages > 1) {
      pagination.classList.remove('hidden');
      document.getElementById('inbox-page-info').textContent = `${currentPage} / ${totalPages}`;
      document.getElementById('inbox-prev').disabled = currentPage <= 1;
      document.getElementById('inbox-next').disabled = currentPage >= totalPages;
    } else {
      pagination.classList.add('hidden');
    }
  }

  function toggleExpand(item, id) {
    const existing = item.querySelector('.inbox-item-expanded');
    if (existing) {
      existing.remove();
      return;
    }

    const sub = submissions.find(s => s._id === id);
    if (!sub) return;

    // Auto-mark as read when expanded
    if (!sub.isRead) {
      markRead(id, true);
    }

    const fields = sub.fields || {};
    const rows = Object.entries(fields).map(([k, v]) =>
      `<div class="inbox-detail-row"><span class="inbox-detail-key">${escapeHtml(k)}</span><span class="inbox-detail-val">${escapeHtml(String(v))}</span></div>`
    ).join('');

    const expanded = document.createElement('div');
    expanded.className = 'inbox-item-expanded';
    expanded.innerHTML = `
      <div class="inbox-detail-fields">${rows}</div>
      ${sub.pageUrl ? `<div class="inbox-detail-meta">Page: <a href="${escapeHtml(sub.pageUrl)}" target="_blank" rel="noopener">${escapeHtml(sub.pageUrl)}</a></div>` : ''}
      ${sub.ipHash ? `<div class="inbox-detail-meta">IP hash: ${escapeHtml(sub.ipHash)}</div>` : ''}
    `;
    item.appendChild(expanded);
  }

  async function markRead(id, silent) {
    const siteId = state.siteId;
    try {
      await apiFetch(`/api/sites/${siteId}/submissions/${id}/read`, { method: 'PUT' });
      const sub = submissions.find(s => s._id === id);
      if (sub) sub.isRead = true;
      renderList();
      updateUnreadBadge();
      if (!silent) showToast('Marked as read');
    } catch (err) {
      console.error('[inbox] Mark read error:', err);
    }
  }

  async function deleteSubmission(id) {
    if (!confirm('Delete this submission?')) return;
    const siteId = state.siteId;
    try {
      await apiFetch(`/api/sites/${siteId}/submissions/${id}`, { method: 'DELETE' });
      submissions = submissions.filter(s => s._id !== id);
      renderList();
      updateUnreadBadge();
      showToast('Submission deleted');
    } catch (err) {
      console.error('[inbox] Delete error:', err);
      showToast('Failed to delete', 'error');
    }
  }

  async function updateUnreadBadge() {
    const siteId = state.siteId;
    if (!siteId) return;
    try {
      const data = await apiFetch(`/api/sites/${siteId}/submissions/unread-count`);
      const count = data.count || 0;
      const badge = document.getElementById('inbox-count');
      const tabBadge = document.querySelector('.panel-tab[data-panel="inbox"] .tab-badge');

      if (badge) {
        badge.textContent = count;
        badge.classList.toggle('hidden', count === 0);
      }
      if (tabBadge) {
        tabBadge.textContent = count;
        tabBadge.classList.toggle('hidden', count === 0);
      }
    } catch (err) {
      // Silent fail for badge
    }
  }

  // Public API
  fn.loadInbox = function () {
    if (!loaded) {
      buildInboxUI();
      loaded = true;
    }
    loadSubmissions();
  };

  fn.updateInboxBadge = updateUnreadBadge;

})();
