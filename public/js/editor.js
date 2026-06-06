(function () {
  // Support both /editor/?site=xxx and /editor/:siteId
  const params = new URLSearchParams(window.location.search);
  let siteId = params.get('site');
  if (!siteId) {
    const pathMatch = window.location.pathname.match(/\/editor\/([^/?]+)/);
    siteId = pathMatch ? pathMatch[1] : null;
  }
  if (!siteId) return;

  const API = `/api/sites/${siteId}`;

  // DOM refs
  const iframe = document.getElementById('site-iframe');
  const siteName = document.getElementById('site-name');
  const siteUrl = document.getElementById('site-url');
  const btnSave = document.getElementById('btn-save');
  const saveBadge = document.getElementById('save-badge');
  const btnHistory = document.getElementById('btn-history');
  const btnPublish = document.getElementById('btn-publish');
  const btnChat = document.getElementById('btn-chat');
  const changesIndicator = document.getElementById('changes-indicator');
  const historyPanel = document.getElementById('history-panel');
  const historyList = document.getElementById('history-list');
  const btnCloseHistory = document.getElementById('btn-close-history');
  const toastContainer = document.getElementById('toast-container');

  // Chat refs
  const chatPanel = document.getElementById('chat-panel');
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const btnSendChat = document.getElementById('btn-send-chat');
  const btnCloseChat = document.getElementById('btn-close-chat');

  // Publish refs
  const publishBar = document.getElementById('publish-bar');
  const publishStatusText = document.getElementById('publish-status-text');
  const publishLink = document.getElementById('publish-link');

  // Image popover refs
  const popoverImage = document.getElementById('popover-image');
  const popoverImgSrc = document.getElementById('popover-img-src');
  const popoverImgAlt = document.getElementById('popover-img-alt');
  const popoverImgApply = document.getElementById('popover-img-apply');
  const popoverImgCancel = document.getElementById('popover-img-cancel');

  // Link popover refs
  const popoverLink = document.getElementById('popover-link');
  const popoverLinkText = document.getElementById('popover-link-text');
  const popoverLinkHref = document.getElementById('popover-link-href');
  const popoverLinkApply = document.getElementById('popover-link-apply');
  const popoverLinkCancel = document.getElementById('popover-link-cancel');

  let contentMap = {};
  let pendingChanges = {};
  let activePopoverTarget = null;
  let saving = false;
  let publishing = false;

  // ── Toast ──

  function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ── Pending changes tracking ──

  function addPendingChange(slotId, oldValue, newValue) {
    if (oldValue === newValue) {
      delete pendingChanges[slotId];
    } else {
      pendingChanges[slotId] = { oldValue, newValue };
    }
    updateChangesUI();
  }

  function updateChangesUI() {
    const count = Object.keys(pendingChanges).length;
    if (count > 0) {
      changesIndicator.textContent = `${count} unsaved change${count > 1 ? 's' : ''}`;
      changesIndicator.classList.remove('hidden');
      saveBadge.textContent = count;
      saveBadge.classList.remove('hidden');
      btnSave.disabled = false;
    } else {
      changesIndicator.classList.add('hidden');
      saveBadge.classList.add('hidden');
      btnSave.disabled = true;
    }
  }

  // ── Unsaved changes warning ──

  window.addEventListener('beforeunload', (e) => {
    if (Object.keys(pendingChanges).length > 0) {
      e.preventDefault();
    }
  });

  // ── Responsive preview ──

  document.querySelectorAll('.resp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.resp-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const width = btn.dataset.width;
      iframe.style.maxWidth = width;
      iframe.style.margin = width === '100%' ? '0' : '0 auto';
    });
  });

  // ── Load site metadata ──

  async function loadMeta() {
    const res = await fetch(API);
    const meta = await res.json();
    siteName.textContent = meta.name || 'Untitled Site';
    siteUrl.textContent = meta.originalUrl;
    siteUrl.href = meta.originalUrl;
    document.title = `Editor - ${meta.name}`;
  }

  // ── Load content map ──

  async function loadContent() {
    const res = await fetch(`${API}/content`);
    contentMap = await res.json();
  }

  // ── Load iframe ──

  function loadIframe() {
    iframe.src = `${API}/render`;
  }

  // ── Inject editor behavior into iframe ──

  function injectEditorScript() {
    const doc = iframe.contentDocument;
    if (!doc) return;

    const style = doc.createElement('style');
    style.textContent = `
      [data-slot-id] {
        cursor: pointer !important;
        transition: outline 0.12s ease, outline-offset 0.12s ease;
        outline: 2px solid transparent;
        outline-offset: 2px;
      }
      [data-slot-id]:hover {
        outline: 2px dashed #4a6cf7 !important;
      }
      [data-slot-id].slot-active {
        outline: 2px solid #4a6cf7 !important;
        background: rgba(74, 108, 247, 0.06);
      }
      .slot-tooltip {
        position: absolute;
        background: #111;
        color: #fff;
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 4px;
        pointer-events: none;
        z-index: 10000;
        font-family: -apple-system, sans-serif;
        white-space: nowrap;
      }
    `;
    doc.head.appendChild(style);

    let tooltip = null;

    function showTooltip(el, text) {
      removeTooltip();
      tooltip = doc.createElement('div');
      tooltip.className = 'slot-tooltip';
      tooltip.textContent = text;
      doc.body.appendChild(tooltip);
      const rect = el.getBoundingClientRect();
      tooltip.style.left = rect.left + 'px';
      tooltip.style.top = (rect.top - 24) + 'px';
    }

    function removeTooltip() {
      if (tooltip) {
        tooltip.remove();
        tooltip = null;
      }
    }

    const slots = doc.querySelectorAll('[data-slot-id]');

    slots.forEach((el) => {
      const slotType = el.getAttribute('data-slot-type');
      const slotIds = el.getAttribute('data-slot-id').split(',');

      el.addEventListener('mouseenter', () => {
        showTooltip(el, slotType);
      });

      el.addEventListener('mouseleave', () => {
        removeTooltip();
      });

      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleSlotClick(el, slotType, slotIds);
      });
    });
  }

  // ── Slot click handlers ──

  function handleSlotClick(el, slotType, slotIds) {
    closeAllPopovers();

    if (slotType === 'text') {
      startTextEdit(el, slotIds[0]);
    } else if (slotType === 'image') {
      startImageEdit(el, slotIds);
    } else if (slotType === 'link') {
      startLinkEdit(el, slotIds);
    }
  }

  // ── Text editing ──

  function startTextEdit(el, slotId) {
    const slot = contentMap[slotId];
    if (!slot) return;

    el.classList.add('slot-active');
    el.setAttribute('contenteditable', 'true');
    el.focus();

    const originalValue = slot.value;

    function finishEdit() {
      el.removeAttribute('contenteditable');
      el.classList.remove('slot-active');
      const newValue = el.textContent.trim();
      if (newValue !== originalValue) {
        addPendingChange(slotId, originalValue, newValue);
      }
      el.removeEventListener('blur', finishEdit);
      el.removeEventListener('keydown', handleKey);
    }

    function handleKey(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        finishEdit();
      }
      if (e.key === 'Escape') {
        el.textContent = originalValue;
        finishEdit();
      }
    }

    el.addEventListener('blur', finishEdit);
    el.addEventListener('keydown', handleKey);
  }

  // ── Image editing ──

  function startImageEdit(el, slotIds) {
    const srcSlotId = slotIds.find(id => contentMap[id]?.type === 'image');
    const altSlotId = slotIds.find(id => contentMap[id]?.type === 'text');

    popoverImgSrc.value = srcSlotId ? contentMap[srcSlotId].value : '';
    popoverImgAlt.value = altSlotId ? contentMap[altSlotId].value : '';

    activePopoverTarget = { el, srcSlotId, altSlotId };
    positionPopover(popoverImage, el);
    popoverImage.classList.remove('hidden');
  }

  popoverImgApply.addEventListener('click', () => {
    if (!activePopoverTarget) return;
    const { el, srcSlotId, altSlotId } = activePopoverTarget;
    const newSrc = popoverImgSrc.value.trim();
    const newAlt = popoverImgAlt.value.trim();

    if (srcSlotId && newSrc) {
      const oldVal = contentMap[srcSlotId].value;
      el.src = newSrc;
      addPendingChange(srcSlotId, oldVal, newSrc);
    }
    if (altSlotId) {
      const oldVal = contentMap[altSlotId].value;
      el.alt = newAlt;
      addPendingChange(altSlotId, oldVal, newAlt);
    }

    closeAllPopovers();
  });

  popoverImgCancel.addEventListener('click', closeAllPopovers);

  // ── Link editing ──

  function startLinkEdit(el, slotIds) {
    const textSlotId = slotIds.find(id => contentMap[id]?.type === 'text');
    const hrefSlotId = slotIds.find(id => contentMap[id]?.type === 'link');

    popoverLinkText.value = textSlotId ? contentMap[textSlotId].value : el.textContent.trim();
    popoverLinkHref.value = hrefSlotId ? contentMap[hrefSlotId].value : '';

    activePopoverTarget = { el, textSlotId, hrefSlotId };
    positionPopover(popoverLink, el);
    popoverLink.classList.remove('hidden');
  }

  popoverLinkApply.addEventListener('click', () => {
    if (!activePopoverTarget) return;
    const { el, textSlotId, hrefSlotId } = activePopoverTarget;
    const newText = popoverLinkText.value.trim();
    const newHref = popoverLinkHref.value.trim();

    if (textSlotId && newText) {
      const oldVal = contentMap[textSlotId].value;
      el.textContent = newText;
      addPendingChange(textSlotId, oldVal, newText);
    }
    if (hrefSlotId) {
      const oldVal = contentMap[hrefSlotId].value;
      el.href = newHref;
      addPendingChange(hrefSlotId, oldVal, newHref);
    }

    closeAllPopovers();
  });

  popoverLinkCancel.addEventListener('click', closeAllPopovers);

  // ── Popover positioning ──

  function positionPopover(popover, targetEl) {
    const iframeRect = iframe.getBoundingClientRect();
    const elRect = targetEl.getBoundingClientRect();

    let top = iframeRect.top + elRect.bottom + 8;
    let left = iframeRect.left + elRect.left;

    if (top + 250 > window.innerHeight) {
      top = iframeRect.top + elRect.top - 250;
    }
    if (left + 300 > window.innerWidth) {
      left = window.innerWidth - 316;
    }

    popover.style.top = top + 'px';
    popover.style.left = Math.max(8, left) + 'px';
  }

  function closeAllPopovers() {
    popoverImage.classList.add('hidden');
    popoverLink.classList.add('hidden');
    activePopoverTarget = null;
  }

  document.addEventListener('click', (e) => {
    if (!popoverImage.classList.contains('hidden') &&
        !popoverImage.contains(e.target)) {
      closeAllPopovers();
    }
    if (!popoverLink.classList.contains('hidden') &&
        !popoverLink.contains(e.target)) {
      closeAllPopovers();
    }
  });

  // ── Save ──

  btnSave.addEventListener('click', async () => {
    if (saving || Object.keys(pendingChanges).length === 0) return;
    saving = true;
    btnSave.textContent = 'Saving...';

    const changes = {};
    for (const [slotId, { newValue }] of Object.entries(pendingChanges)) {
      changes[slotId] = newValue;
    }

    try {
      const res = await fetch(`${API}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      const data = await res.json();

      if (data.valid) {
        for (const slotId of Object.keys(pendingChanges)) {
          if (contentMap[slotId]) {
            contentMap[slotId].value = pendingChanges[slotId].newValue;
          }
        }
        pendingChanges = {};
        updateChangesUI();
        showToast('Changes saved', 'success');
      } else {
        showToast(data.errors.join('; '), 'error');
        revertRejectedSlots(data.errors);
      }
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error');
    } finally {
      saving = false;
      btnSave.textContent = 'Save';
      const count = Object.keys(pendingChanges).length;
      if (count > 0) {
        saveBadge.textContent = count;
        saveBadge.classList.remove('hidden');
      }
    }
  });

  function revertRejectedSlots(errors) {
    const doc = iframe.contentDocument;
    if (!doc) return;

    for (const err of errors) {
      const match = err.match(/Slot "([^"]+)"/);
      if (!match) continue;
      const slotId = match[1];
      const change = pendingChanges[slotId];
      if (!change) continue;

      const el = doc.querySelector(`[data-slot-id*="${slotId}"]`);
      if (!el) continue;

      const slot = contentMap[slotId];
      if (slot?.type === 'text') {
        el.textContent = change.oldValue;
      } else if (slot?.type === 'image') {
        el.src = change.oldValue;
      } else if (slot?.type === 'link') {
        el.href = change.oldValue;
      }
      delete pendingChanges[slotId];
    }
    updateChangesUI();
  }

  // ── Publish ──

  btnPublish.addEventListener('click', async () => {
    if (publishing) return;

    if (Object.keys(pendingChanges).length > 0) {
      if (!confirm('You have unsaved changes. Save first before publishing?')) return;
      btnSave.click();
      return;
    }

    publishing = true;
    btnPublish.textContent = 'Publishing...';
    btnPublish.disabled = true;

    try {
      const res = await fetch(`${API}/publish`, { method: 'POST' });
      const data = await res.json();

      if (res.ok && data.success) {
        showToast('Site published successfully!', 'success');
        showPublishBar(data.url);
      } else {
        showToast(data.error?.message || 'Publish failed', 'error');
      }
    } catch (err) {
      showToast('Publish failed: ' + err.message, 'error');
    } finally {
      publishing = false;
      btnPublish.textContent = 'Publish';
      btnPublish.disabled = false;
    }
  });

  function showPublishBar(url) {
    publishStatusText.textContent = 'Published:';
    publishLink.href = url;
    publishLink.textContent = url;
    publishLink.classList.remove('hidden');
    publishBar.classList.remove('hidden');
  }

  async function loadPublishStatus() {
    try {
      const res = await fetch(`${API}/publish`);
      const data = await res.json();
      if (data.published && data.publishUrl) {
        showPublishBar(data.publishUrl);
      }
    } catch {}
  }

  // ── AI Chat ──

  btnChat.addEventListener('click', () => {
    chatPanel.classList.toggle('hidden');
    if (!chatPanel.classList.contains('hidden')) {
      chatInput.focus();
    }
  });

  btnCloseChat.addEventListener('click', () => {
    chatPanel.classList.add('hidden');
  });

  function addChatMessage(text, type) {
    const msg = document.createElement('div');
    msg.className = `chat-msg chat-msg-${type}`;
    msg.textContent = text;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function sendChatMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    chatInput.value = '';
    addChatMessage(message, 'user');
    btnSendChat.disabled = true;
    btnSendChat.textContent = '...';

    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();

      if (res.ok) {
        addChatMessage(data.message, 'ai');

        if (data.applied && Object.keys(data.changes).length > 0) {
          for (const [slotId, newValue] of Object.entries(data.changes)) {
            if (contentMap[slotId]) {
              const oldValue = contentMap[slotId].value;
              addPendingChange(slotId, oldValue, newValue);

              const doc = iframe.contentDocument;
              if (doc) {
                const el = doc.querySelector(`[data-slot-id*="${slotId}"]`);
                if (el) {
                  const slot = contentMap[slotId];
                  if (slot.type === 'text') el.textContent = newValue;
                  else if (slot.type === 'image') el.src = newValue;
                  else if (slot.type === 'link') el.href = newValue;
                }
              }
            }
          }

          const count = Object.keys(data.changes).length;
          addChatMessage(
            `Applied ${count} change${count > 1 ? 's' : ''}. Click Save to keep them.`,
            'system'
          );
        }
      } else {
        addChatMessage(data.error?.message || 'Something went wrong', 'system');
      }
    } catch (err) {
      addChatMessage('Connection error: ' + err.message, 'system');
    } finally {
      btnSendChat.disabled = false;
      btnSendChat.textContent = 'Send';
    }
  }

  btnSendChat.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  // ── History ──

  btnHistory.addEventListener('click', () => {
    historyPanel.classList.toggle('hidden');
    if (!historyPanel.classList.contains('hidden')) {
      loadVersions();
    }
  });

  btnCloseHistory.addEventListener('click', () => {
    historyPanel.classList.add('hidden');
  });

  async function loadVersions() {
    historyList.innerHTML = '<p style="color:#888;padding:12px;font-size:13px;">Loading...</p>';
    try {
      const res = await fetch(`${API}/versions`);
      const { versions } = await res.json();

      if (versions.length === 0) {
        historyList.innerHTML = '<p style="color:#888;padding:12px;font-size:13px;">No versions yet</p>';
        return;
      }

      historyList.innerHTML = '';
      versions.forEach((v, i) => {
        const item = document.createElement('div');
        item.className = 'history-item';

        const timeDisplay = formatDate(v);

        item.innerHTML = `
          <div class="history-item-time">${i === 0 ? timeDisplay + ' (latest)' : timeDisplay}</div>
          <div class="history-item-actions">
            <button class="btn-version-preview" data-version="${v}">Preview</button>
            ${i > 0 ? `<button class="btn-restore" data-version="${v}">Restore</button>` : ''}
          </div>
        `;
        historyList.appendChild(item);
      });

      historyList.querySelectorAll('.btn-version-preview').forEach(btn => {
        btn.addEventListener('click', () => {
          window.open(`${API}/preview`, '_blank');
        });
      });

      historyList.querySelectorAll('.btn-restore').forEach(btn => {
        btn.addEventListener('click', async () => {
          const versionId = btn.dataset.version;
          if (!confirm('Restore this version? Current unsaved changes will be lost.')) return;
          try {
            await fetch(`${API}/rollback/${versionId}`, { method: 'POST' });
            pendingChanges = {};
            updateChangesUI();
            await loadContent();
            loadIframe();
            showToast('Version restored', 'success');
            loadVersions();
          } catch (err) {
            showToast('Restore failed: ' + err.message, 'error');
          }
        });
      });
    } catch {
      historyList.innerHTML = '<p style="color:#ef4444;padding:12px;font-size:13px;">Failed to load versions</p>';
    }
  }

  function formatDate(isoStr) {
    try {
      const cleaned = isoStr.replace(/-/g, (m, offset) => {
        if (offset === 4 || offset === 7) return '-';
        if (offset === 10) return 'T';
        if (offset === 13 || offset === 16) return ':';
        if (offset === 19) return '.';
        return m;
      });
      const d = new Date(cleaned);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleString();
    } catch {
      return isoStr;
    }
  }

  // ── Onboarding ──

  const onboardingSteps = [
    {
      title: 'Click anything to edit',
      desc: 'Hover any text, button or image — then click it and just type. Changes preview instantly.',
      target: '#site-iframe',
    },
    {
      title: 'Check every screen',
      desc: 'Preview your site on desktop, tablet and mobile before you publish.',
      target: '#responsive-btns',
    },
    {
      title: 'Or just ask',
      desc: 'Describe what you want changed in plain English. The AI does it, the Guardian checks it.',
      target: '#btn-chat',
    },
    {
      title: 'Save, then Publish',
      desc: 'Save keeps your edits as a draft. Publish pushes it live. Made a mistake? Roll back any version anytime.',
      target: '#btn-save',
    },
  ];

  function showOnboarding() {
    const storageKey = `onboarding_done_${siteId}`;
    if (localStorage.getItem(storageKey)) return;

    let step = 0;
    const overlay = document.getElementById('onboarding-overlay');
    const tooltip = document.getElementById('onboarding-tooltip');
    const titleEl = document.getElementById('onboarding-title');
    const descEl = document.getElementById('onboarding-desc');
    const dotsEl = document.getElementById('onboarding-dots');
    const skipBtn = document.getElementById('onboarding-skip');
    const nextBtn = document.getElementById('onboarding-next');

    function renderStep() {
      const s = onboardingSteps[step];
      titleEl.textContent = s.title;
      descEl.textContent = s.desc;
      nextBtn.innerHTML = step === onboardingSteps.length - 1 ? 'Got it' : 'Next &rarr;';

      dotsEl.innerHTML = onboardingSteps.map((_, i) =>
        `<span class="ob-dot ${i === step ? 'active' : ''}"></span>`
      ).join('');

      // Position tooltip near target
      const target = document.querySelector(s.target);
      if (target) {
        const rect = target.getBoundingClientRect();
        tooltip.style.top = (rect.bottom + 12) + 'px';
        tooltip.style.left = Math.max(16, Math.min(rect.left, window.innerWidth - 320)) + 'px';
      }
    }

    function finish() {
      overlay.classList.add('hidden');
      localStorage.setItem(storageKey, 'true');
    }

    overlay.classList.remove('hidden');
    renderStep();

    nextBtn.addEventListener('click', () => {
      step++;
      if (step >= onboardingSteps.length) {
        finish();
      } else {
        renderStep();
      }
    });

    skipBtn.addEventListener('click', finish);
  }

  // ── Iframe load handler ──

  iframe.addEventListener('load', () => {
    injectEditorScript();
    // Show onboarding after first load
    setTimeout(showOnboarding, 500);
  });

  // ── Init ──

  async function init() {
    try {
      await loadMeta();
      await loadContent();
      loadIframe();
      loadPublishStatus();
    } catch (err) {
      showToast('Failed to load site: ' + err.message, 'error');
    }
  }

  init();
})();
