window.CMS = window.CMS || {};
window.CMS.state = {};
window.CMS.refs = {};
window.CMS.fn = {};

(function (CMS) {
  const { showToast, apiFetch, sanitizeHtml } = CMS.utils;
  const state = CMS.state;
  const refs = CMS.refs;
  const fn = CMS.fn;

  // ── Site ID and API base ──
  const params = new URLSearchParams(window.location.search);
  let siteId = params.get('site');
  if (!siteId) {
    const pathMatch = window.location.pathname.match(/\/editor\/([^/?]+)/);
    siteId = pathMatch ? pathMatch[1] : null;
  }
  if (!siteId) return;

  state.siteId = siteId;
  state.API = `/api/sites/${siteId}`;

  // ── State ──
  state.editorMode = 'edit';
  state.contentMap = {};
  state.stylesMap = {};
  state.seoData = {};
  state.pendingChanges = {};
  state.pendingStyleChanges = {};
  state.undoStack = [];
  state.selectedSlot = null;
  state.saving = false;
  state.publishing = false;
  state.siteMeta = {};
  state.contentPanelBuilt = false;
  state.previewBackBtn = null;
  state.pages = [];
  state.currentPageId = null;

  // ── DOM refs ──
  refs.iframe = document.getElementById('site-iframe');
  refs.siteName = document.getElementById('site-name');
  refs.siteUrl = document.getElementById('site-url');
  refs.btnSave = document.getElementById('btn-save');
  refs.saveBadge = document.getElementById('save-badge');
  refs.btnHistory = document.getElementById('btn-history');
  refs.btnPublish = document.getElementById('btn-publish');
  refs.btnChat = document.getElementById('btn-chat');
  refs.btnUndo = document.getElementById('btn-undo');
  refs.changesIndicator = document.getElementById('changes-indicator');
  refs.historyPanel = document.getElementById('history-panel');
  refs.historyList = document.getElementById('history-list');
  refs.btnCloseHistory = document.getElementById('btn-close-history');
  refs.chatPanel = document.getElementById('chat-panel');
  refs.chatMessages = document.getElementById('chat-messages');
  refs.chatInput = document.getElementById('chat-input');
  refs.btnSendChat = document.getElementById('btn-send-chat');
  refs.btnCloseChat = document.getElementById('btn-close-chat');
  refs.publishBar = document.getElementById('publish-bar');
  refs.publishStatusText = document.getElementById('publish-status-text');
  refs.publishLink = document.getElementById('publish-link');
  refs.editorEmpty = document.getElementById('editor-empty');
  refs.editorProps = document.getElementById('editor-props');
  refs.propElementInfo = document.getElementById('prop-element-info');
  refs.propTextSection = document.getElementById('prop-text-section');
  refs.propImageSection = document.getElementById('prop-image-section');
  refs.propLinkSection = document.getElementById('prop-link-section');
  refs.propTextInput = document.getElementById('prop-text-input');
  refs.propImgSrc = document.getElementById('prop-img-src');
  refs.propImgAlt = document.getElementById('prop-img-alt');
  refs.propLinkText = document.getElementById('prop-link-text');
  refs.propLinkHref = document.getElementById('prop-link-href');
  refs.propApply = document.getElementById('prop-apply');
  refs.styleApply = document.getElementById('style-apply');
  refs.styleReset = document.getElementById('style-reset');
  refs.btnModeEdit = document.getElementById('btn-mode-edit');
  refs.btnModePreview = document.getElementById('btn-mode-preview');
  refs.pageSelect = document.getElementById('page-select');
  refs.btnAddPage = document.getElementById('btn-add-page');
  refs.addPageModal = document.getElementById('add-page-modal');
  refs.newPageTitle = document.getElementById('new-page-title');
  refs.newPageSlug = document.getElementById('new-page-slug');
  refs.newPageTemplate = document.getElementById('new-page-template');
  refs.modalCreate = document.getElementById('modal-create');
  refs.modalCancel = document.getElementById('modal-cancel');
  refs.modalClose = document.getElementById('modal-close');

  // ── Pending changes tracking ──
  fn.addPendingChange = function (slotId, oldValue, newValue) {
    if (oldValue === newValue) {
      delete state.pendingChanges[slotId];
    } else {
      state.undoStack.push({ slotId, oldValue, newValue });
      state.pendingChanges[slotId] = { oldValue, newValue };
    }
    fn.updateChangesUI();
    if (CMS.fn.syncContentPanel) CMS.fn.syncContentPanel(slotId);
  };

  fn.updateChangesUI = function () {
    const contentCount = Object.keys(state.pendingChanges).length;
    const styleCount = Object.keys(state.pendingStyleChanges).length;
    const count = contentCount + styleCount;
    if (count > 0) {
      refs.changesIndicator.textContent = `${count} unsaved change${count > 1 ? 's' : ''}`;
      refs.changesIndicator.classList.remove('hidden');
      refs.saveBadge.textContent = count;
      refs.saveBadge.classList.remove('hidden');
      refs.btnSave.disabled = false;
    } else {
      refs.changesIndicator.classList.add('hidden');
      refs.saveBadge.classList.add('hidden');
      refs.btnSave.disabled = true;
    }
    refs.btnUndo.disabled = state.undoStack.length === 0;
  };

  fn.deselectSlot = function () {
    const doc = refs.iframe.contentDocument;
    if (doc) {
      doc.querySelectorAll('.slot-selected').forEach(s => s.classList.remove('slot-selected'));
    }
    state.selectedSlot = null;
    refs.editorEmpty.classList.remove('hidden');
    refs.editorProps.classList.add('hidden');
  };

  // ── Undo ──
  refs.btnUndo.addEventListener('click', () => {
    const last = state.undoStack.pop();
    if (!last) return;
    const doc = refs.iframe.contentDocument;
    if (doc) {
      const el = doc.querySelector(`[data-slot-id*="${last.slotId}"]`);
      if (el) {
        const slot = state.contentMap[last.slotId];
        if (slot?.type === 'richtext') el.innerHTML = sanitizeHtml(last.oldValue);
        else if (slot?.type === 'text') el.textContent = last.oldValue;
        else if (slot?.type === 'image') el.src = last.oldValue;
        else if (slot?.type === 'link') el.href = last.oldValue;
      }
    }
    delete state.pendingChanges[last.slotId];
    fn.updateChangesUI();
  });

  // ── Unsaved changes warning ──
  window.addEventListener('beforeunload', (e) => {
    if (Object.keys(state.pendingChanges).length > 0 || Object.keys(state.pendingStyleChanges).length > 0) {
      e.preventDefault();
    }
  });

  // ── Panel tabs ──
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel-content').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.panel}`).classList.add('active');

      if (tab.dataset.panel === 'content') {
        if (!state.contentPanelBuilt && CMS.fn.buildContentList) {
          CMS.fn.buildContentList();
          state.contentPanelBuilt = true;
        }
      }
      if (tab.dataset.panel === 'sections' && CMS.fn.buildSectionsList) CMS.fn.buildSectionsList();
      if (tab.dataset.panel === 'seo' && CMS.fn.loadSeo) CMS.fn.loadSeo();
    });
  });

  // ── Property tabs (Edit/Style) ──
  document.querySelectorAll('.prop-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.prop-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.prop-tab-content').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`prop-${tab.dataset.propTab}`).classList.add('active');
    });
  });

  // ── Responsive preview ──
  document.querySelectorAll('.resp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.resp-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const width = btn.dataset.width;
      refs.iframe.style.maxWidth = width;
      refs.iframe.style.margin = width === '100%' ? '0' : '0 auto';
    });
  });

  // ── Load functions ──
  fn.loadMeta = async function () {
    const data = await apiFetch(state.API);
    if (!data) return;
    state.siteMeta = data;
    refs.siteName.textContent = state.siteMeta.name || 'Untitled Site';
    refs.siteUrl.textContent = state.siteMeta.originalUrl;
    refs.siteUrl.href = state.siteMeta.originalUrl;
    document.title = `Editor - ${state.siteMeta.name}`;
  };

  fn.loadPages = async function () {
    try {
      const res = await fetch(`${state.API}/pages`);
      const data = await res.json();
      state.pages = data.pages || [];
    } catch { state.pages = []; }

    if (state.pages.length > 0) {
      refs.pageSelect.innerHTML = '';
      state.pages.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.pageId;
        opt.textContent = p.title + (p.isIndex ? ' (Home)' : '');
        refs.pageSelect.appendChild(opt);
      });
      if (!state.currentPageId) {
        const indexPage = state.pages.find(p => p.isIndex) || state.pages[0];
        state.currentPageId = indexPage.pageId;
      }
      refs.pageSelect.value = state.currentPageId;
    } else {
      refs.pageSelect.innerHTML = '<option value="">Single page</option>';
    }
  };

  fn.loadContent = async function () {
    const q = state.currentPageId ? `?pageId=${state.currentPageId}` : '';
    const data = await apiFetch(`${state.API}/content${q}`);
    if (data) state.contentMap = data;
  };

  fn.loadStyles = async function () {
    const q = state.currentPageId ? `?pageId=${state.currentPageId}` : '';
    const data = await apiFetch(`${state.API}/styles${q}`);
    state.stylesMap = data || {};
  };

  fn.loadIframe = function () {
    const q = state.currentPageId ? `?pageId=${state.currentPageId}` : '';
    refs.iframe.src = `${state.API}/render${q}`;
  };

  // ── Page switching ──
  refs.pageSelect.addEventListener('change', async () => {
    if (Object.keys(state.pendingChanges).length > 0 || Object.keys(state.pendingStyleChanges).length > 0) {
      if (!confirm('You have unsaved changes. Discard and switch page?')) {
        refs.pageSelect.value = state.currentPageId;
        return;
      }
    }
    state.currentPageId = refs.pageSelect.value;
    state.pendingChanges = {};
    state.pendingStyleChanges = {};
    state.undoStack = [];
    state.contentPanelBuilt = false;
    fn.updateChangesUI();
    fn.deselectSlot();
    await Promise.all([fn.loadContent(), fn.loadStyles()]);
    fn.loadIframe();
  });

  // ── Add Page Modal ──
  refs.btnAddPage.addEventListener('click', () => {
    refs.newPageTitle.value = '';
    refs.newPageSlug.value = '';
    refs.newPageTemplate.value = 'blank';
    refs.addPageModal.classList.remove('hidden');
    refs.newPageTitle.focus();
  });

  refs.newPageTitle.addEventListener('input', () => {
    const auto = refs.newPageTitle.value.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    refs.newPageSlug.value = auto;
  });

  function closeAddPageModal() {
    refs.addPageModal.classList.add('hidden');
  }

  refs.modalCancel.addEventListener('click', closeAddPageModal);
  refs.modalClose.addEventListener('click', closeAddPageModal);
  refs.addPageModal.addEventListener('click', (e) => {
    if (e.target === refs.addPageModal) closeAddPageModal();
  });

  refs.modalCreate.addEventListener('click', async () => {
    const title = refs.newPageTitle.value.trim();
    const slug = refs.newPageSlug.value.trim();
    const templateType = refs.newPageTemplate.value;

    if (!title) { showToast('Page title is required', 'error'); return; }
    if (!slug) { showToast('Page slug is required', 'error'); return; }

    refs.modalCreate.textContent = 'Creating...';
    refs.modalCreate.disabled = true;

    try {
      const res = await fetch(`${state.API}/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, slug, templateType }),
      });
      const data = await res.json();

      if (res.ok) {
        closeAddPageModal();
        showToast(`Page "${title}" created`, 'success');
        state.currentPageId = data.pageId;
        await fn.loadPages();
        refs.pageSelect.value = state.currentPageId;
        state.pendingChanges = {};
        state.pendingStyleChanges = {};
        state.undoStack = [];
        fn.updateChangesUI();
        fn.deselectSlot();
        await Promise.all([fn.loadContent(), fn.loadStyles()]);
        fn.loadIframe();
      } else {
        showToast(data.error?.message || 'Failed to create page', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      refs.modalCreate.textContent = 'Create Page';
      refs.modalCreate.disabled = false;
    }
  });

  // ── Edit/Preview Mode ──
  fn.switchToEditMode = function () {
    state.editorMode = 'edit';
    const doc = refs.iframe.contentDocument;
    if (doc) {
      const expandStyle = doc.querySelector('style[data-cms-expand]');
      if (expandStyle) expandStyle.disabled = false;
      enableSlotInteractions(doc);
      doc.body.setAttribute('data-cms-expand-active', 'true');
    }
    refs.btnModeEdit.classList.add('active');
    refs.btnModePreview.classList.remove('active');
    removePreviewBackBtn();
    fn.deselectSlot();
  };

  fn.switchToPreviewMode = function () {
    state.editorMode = 'preview';
    const doc = refs.iframe.contentDocument;
    if (doc) {
      const expandStyle = doc.querySelector('style[data-cms-expand]');
      if (expandStyle) expandStyle.disabled = true;
      disableSlotInteractions(doc);
      doc.body.removeAttribute('data-cms-expand-active');
    }
    refs.btnModePreview.classList.add('active');
    refs.btnModeEdit.classList.remove('active');
    fn.deselectSlot();
    showPreviewBackBtn();
  };

  function enableSlotInteractions(doc) {
    const editorStyle = doc.querySelector('style[data-cms-editor]');
    if (editorStyle) editorStyle.disabled = false;
    doc.querySelectorAll('[data-slot-id]').forEach(el => {
      el.style.pointerEvents = '';
    });
  }

  function disableSlotInteractions(doc) {
    const editorStyle = doc.querySelector('style[data-cms-editor]');
    if (editorStyle) editorStyle.disabled = true;
    doc.querySelectorAll('[data-slot-id]').forEach(el => {
      el.style.pointerEvents = '';
    });
  }

  function showPreviewBackBtn() {
    removePreviewBackBtn();
    state.previewBackBtn = document.createElement('button');
    state.previewBackBtn.className = 'preview-back-btn';
    state.previewBackBtn.textContent = 'Back to Edit';
    state.previewBackBtn.addEventListener('click', fn.switchToEditMode);
    document.getElementById('preview-area').appendChild(state.previewBackBtn);
  }

  function removePreviewBackBtn() {
    if (state.previewBackBtn) {
      state.previewBackBtn.remove();
      state.previewBackBtn = null;
    }
  }

  refs.btnModeEdit.addEventListener('click', fn.switchToEditMode);
  refs.btnModePreview.addEventListener('click', fn.switchToPreviewMode);

  // ── Welcome Banner ──
  fn.showWelcomeBanner = function () {
    const storageKey = `welcome_done_${state.siteId}`;
    if (localStorage.getItem(storageKey)) return;

    const banner = document.getElementById('welcome-banner');
    const dismissBtn = document.getElementById('welcome-dismiss');
    if (!banner || !dismissBtn) return;

    banner.classList.remove('hidden');

    dismissBtn.addEventListener('click', () => {
      banner.classList.add('hidden');
      localStorage.setItem(storageKey, 'true');
    });

    setTimeout(() => {
      banner.classList.add('hidden');
      localStorage.setItem(storageKey, 'true');
    }, 10000);
  };

  // ── Iframe load handler ──
  refs.iframe.addEventListener('load', () => {
    if (CMS.fn.injectEditorScript) CMS.fn.injectEditorScript();
    setTimeout(fn.showWelcomeBanner, 500);
  });

  // ── switchToTab (used by content panel and message handler) ──
  fn.switchToTab = function (tabName) {
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel-content').forEach(p => p.classList.remove('active'));
    const tab = document.querySelector(`.panel-tab[data-panel="${tabName}"]`);
    if (tab) {
      tab.classList.add('active');
      document.getElementById(`panel-${tabName}`).classList.add('active');
      if (tabName === 'content' && !state.contentPanelBuilt && CMS.fn.buildContentList) {
        CMS.fn.buildContentList();
        state.contentPanelBuilt = true;
      }
    }
  };

  // ── Init ──
  fn.init = async function () {
    try {
      await fn.loadMeta();
      await fn.loadPages();
      await Promise.all([fn.loadContent(), fn.loadStyles()]);
      fn.loadIframe();
      if (CMS.fn.loadPublishStatus) CMS.fn.loadPublishStatus();
    } catch (err) {
      showToast('Failed to load site: ' + err.message, 'error');
    }
  };

  fn.init();
})(window.CMS);
