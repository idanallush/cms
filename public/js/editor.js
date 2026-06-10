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

  // ── DOM refs ──
  const iframe = document.getElementById('site-iframe');
  const siteName = document.getElementById('site-name');
  const siteUrl = document.getElementById('site-url');
  const btnSave = document.getElementById('btn-save');
  const saveBadge = document.getElementById('save-badge');
  const btnHistory = document.getElementById('btn-history');
  const btnPublish = document.getElementById('btn-publish');
  const btnChat = document.getElementById('btn-chat');
  const btnUndo = document.getElementById('btn-undo');
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

  // Right panel refs
  const editorEmpty = document.getElementById('editor-empty');
  const editorProps = document.getElementById('editor-props');
  const propElementInfo = document.getElementById('prop-element-info');

  // Content editing refs
  const propTextSection = document.getElementById('prop-text-section');
  const propImageSection = document.getElementById('prop-image-section');
  const propLinkSection = document.getElementById('prop-link-section');
  const propTextInput = document.getElementById('prop-text-input');
  const propImgSrc = document.getElementById('prop-img-src');
  const propImgAlt = document.getElementById('prop-img-alt');
  const propLinkText = document.getElementById('prop-link-text');
  const propLinkHref = document.getElementById('prop-link-href');
  const propApply = document.getElementById('prop-apply');

  // Style refs
  const styleApply = document.getElementById('style-apply');
  const styleReset = document.getElementById('style-reset');

  // SEO refs
  const seoTitle = document.getElementById('seo-title');
  const seoDescription = document.getElementById('seo-description');
  const seoOgImage = document.getElementById('seo-ogImage');
  const seoCanonicalUrl = document.getElementById('seo-canonicalUrl');
  const seoNoIndex = document.getElementById('seo-noIndex');
  const seoSave = document.getElementById('seo-save');
  const seoGpTitle = document.getElementById('seo-gp-title');
  const seoGpUrl = document.getElementById('seo-gp-url');
  const seoGpDesc = document.getElementById('seo-gp-desc');
  const seoTitleCount = document.getElementById('seo-title-count');
  const seoDescCount = document.getElementById('seo-desc-count');
  const seoChecks = document.getElementById('seo-checks');

  // Mode toggle refs
  const btnModeEdit = document.getElementById('btn-mode-edit');
  const btnModePreview = document.getElementById('btn-mode-preview');

  // Page switcher refs
  const pageSelect = document.getElementById('page-select');
  const btnAddPage = document.getElementById('btn-add-page');

  // Add page modal refs
  const addPageModal = document.getElementById('add-page-modal');
  const newPageTitle = document.getElementById('new-page-title');
  const newPageSlug = document.getElementById('new-page-slug');
  const newPageTemplate = document.getElementById('new-page-template');
  const modalCreate = document.getElementById('modal-create');
  const modalCancel = document.getElementById('modal-cancel');
  const modalClose = document.getElementById('modal-close');

  // ── State ──
  let editorMode = 'edit'; // 'edit' or 'preview'
  let contentMap = {};
  let stylesMap = {};
  let seoData = {};
  let pendingChanges = {};
  let pendingStyleChanges = {};
  let undoStack = [];
  let selectedSlot = null;
  let saving = false;
  let publishing = false;
  let siteMeta = {};
  let previewBackBtn = null;
  let pages = [];
  let currentPageId = null;

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
      undoStack.push({ slotId, oldValue, newValue });
      pendingChanges[slotId] = { oldValue, newValue };
    }
    updateChangesUI();
    // Sync content panel if open
    syncContentPanel(slotId);
  }

  function updateChangesUI() {
    const contentCount = Object.keys(pendingChanges).length;
    const styleCount = Object.keys(pendingStyleChanges).length;
    const count = contentCount + styleCount;
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
    btnUndo.disabled = undoStack.length === 0;
  }

  // ── Undo ──
  btnUndo.addEventListener('click', () => {
    const last = undoStack.pop();
    if (!last) return;

    const doc = iframe.contentDocument;
    if (doc) {
      const el = doc.querySelector(`[data-slot-id*="${last.slotId}"]`);
      if (el) {
        const slot = contentMap[last.slotId];
        if (slot?.type === 'richtext') el.innerHTML = last.oldValue;
        else if (slot?.type === 'text') el.textContent = last.oldValue;
        else if (slot?.type === 'image') el.src = last.oldValue;
        else if (slot?.type === 'link') el.href = last.oldValue;
      }
    }
    delete pendingChanges[last.slotId];
    updateChangesUI();
  });

  // ── Unsaved changes warning ──
  window.addEventListener('beforeunload', (e) => {
    if (Object.keys(pendingChanges).length > 0 || Object.keys(pendingStyleChanges).length > 0) {
      e.preventDefault();
    }
  });

  // ── Panel tabs ──
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel-content').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panelId = `panel-${tab.dataset.panel}`;
      document.getElementById(panelId).classList.add('active');

      if (tab.dataset.panel === 'content') buildContentList();
      if (tab.dataset.panel === 'sections') buildSectionsList();
      if (tab.dataset.panel === 'seo') loadSeo();
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
      iframe.style.maxWidth = width;
      iframe.style.margin = width === '100%' ? '0' : '0 auto';
    });
  });

  // ── Load site metadata ──
  async function loadMeta() {
    const res = await fetch(API);
    siteMeta = await res.json();
    siteName.textContent = siteMeta.name || 'Untitled Site';
    siteUrl.textContent = siteMeta.originalUrl;
    siteUrl.href = siteMeta.originalUrl;
    document.title = `Editor - ${siteMeta.name}`;
  }

  // ── Load pages list ──
  async function loadPages() {
    try {
      const res = await fetch(`${API}/pages`);
      const data = await res.json();
      pages = data.pages || [];
    } catch { pages = []; }

    if (pages.length > 0) {
      pageSelect.innerHTML = '';
      pages.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.pageId;
        opt.textContent = p.title + (p.isIndex ? ' (Home)' : '');
        pageSelect.appendChild(opt);
      });
      if (!currentPageId) {
        const indexPage = pages.find(p => p.isIndex) || pages[0];
        currentPageId = indexPage.pageId;
      }
      pageSelect.value = currentPageId;
    } else {
      pageSelect.innerHTML = '<option value="">Single page</option>';
    }
  }

  // ── Load content map ──
  async function loadContent() {
    const q = currentPageId ? `?pageId=${currentPageId}` : '';
    const res = await fetch(`${API}/content${q}`);
    contentMap = await res.json();
  }

  // ── Load styles ──
  async function loadStyles() {
    try {
      const q = currentPageId ? `?pageId=${currentPageId}` : '';
      const res = await fetch(`${API}/styles${q}`);
      stylesMap = await res.json();
    } catch { stylesMap = {}; }
  }

  // ── Load iframe ──
  function loadIframe() {
    const q = currentPageId ? `?pageId=${currentPageId}` : '';
    iframe.src = `${API}/render${q}`;
  }

  // ── Page switching ──
  pageSelect.addEventListener('change', async () => {
    if (Object.keys(pendingChanges).length > 0 || Object.keys(pendingStyleChanges).length > 0) {
      if (!confirm('You have unsaved changes. Discard and switch page?')) {
        pageSelect.value = currentPageId;
        return;
      }
    }
    currentPageId = pageSelect.value;
    pendingChanges = {};
    pendingStyleChanges = {};
    undoStack = [];
    updateChangesUI();
    deselectSlot();
    await Promise.all([loadContent(), loadStyles()]);
    loadIframe();
  });

  // ── Add Page Modal ──
  btnAddPage.addEventListener('click', () => {
    newPageTitle.value = '';
    newPageSlug.value = '';
    newPageTemplate.value = 'blank';
    addPageModal.classList.remove('hidden');
    newPageTitle.focus();
  });

  newPageTitle.addEventListener('input', () => {
    const auto = newPageTitle.value.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    newPageSlug.value = auto;
  });

  function closeAddPageModal() {
    addPageModal.classList.add('hidden');
  }

  modalCancel.addEventListener('click', closeAddPageModal);
  modalClose.addEventListener('click', closeAddPageModal);
  addPageModal.addEventListener('click', (e) => {
    if (e.target === addPageModal) closeAddPageModal();
  });

  modalCreate.addEventListener('click', async () => {
    const title = newPageTitle.value.trim();
    const slug = newPageSlug.value.trim();
    const templateType = newPageTemplate.value;

    if (!title) { showToast('Page title is required', 'error'); return; }
    if (!slug) { showToast('Page slug is required', 'error'); return; }

    modalCreate.textContent = 'Creating...';
    modalCreate.disabled = true;

    try {
      const res = await fetch(`${API}/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, slug, templateType }),
      });
      const data = await res.json();

      if (res.ok) {
        closeAddPageModal();
        showToast(`Page "${title}" created`, 'success');
        currentPageId = data.pageId;
        await loadPages();
        pageSelect.value = currentPageId;
        pendingChanges = {};
        pendingStyleChanges = {};
        undoStack = [];
        updateChangesUI();
        deselectSlot();
        await Promise.all([loadContent(), loadStyles()]);
        loadIframe();
      } else {
        showToast(data.error?.message || 'Failed to create page', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      modalCreate.textContent = 'Create Page';
      modalCreate.disabled = false;
    }
  });

  // ── Edit/Preview Mode ──
  function switchToEditMode() {
    editorMode = 'edit';
    const doc = iframe.contentDocument;
    if (doc) {
      const expandStyle = doc.querySelector('style[data-cms-expand]');
      if (expandStyle) expandStyle.disabled = false;
      enableSlotInteractions(doc);
      doc.body.setAttribute('data-cms-expand-active', 'true');
    }
    btnModeEdit.classList.add('active');
    btnModePreview.classList.remove('active');
    removePreviewBackBtn();
    deselectSlot();
  }

  function switchToPreviewMode() {
    editorMode = 'preview';
    const doc = iframe.contentDocument;
    if (doc) {
      const expandStyle = doc.querySelector('style[data-cms-expand]');
      if (expandStyle) expandStyle.disabled = true;
      disableSlotInteractions(doc);
      doc.body.removeAttribute('data-cms-expand-active');
    }
    btnModePreview.classList.add('active');
    btnModeEdit.classList.remove('active');
    deselectSlot();
    showPreviewBackBtn();
  }

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
    previewBackBtn = document.createElement('button');
    previewBackBtn.className = 'preview-back-btn';
    previewBackBtn.textContent = 'Back to Edit';
    previewBackBtn.addEventListener('click', switchToEditMode);
    document.getElementById('preview-area').appendChild(previewBackBtn);
  }

  function removePreviewBackBtn() {
    if (previewBackBtn) {
      previewBackBtn.remove();
      previewBackBtn = null;
    }
  }

  btnModeEdit.addEventListener('click', switchToEditMode);
  btnModePreview.addEventListener('click', switchToPreviewMode);

  // ── Inject editor behavior into iframe ──
  function injectEditorScript() {
    const doc = iframe.contentDocument;
    if (!doc) return;

    const style = doc.createElement('style');
    style.setAttribute('data-cms-editor', 'true');
    style.textContent = `
      [data-slot-id] {
        cursor: pointer !important;
        transition: outline 0.12s ease, outline-offset 0.12s ease, box-shadow 0.12s ease;
        outline: 2px solid transparent;
        outline-offset: 2px;
      }
      [data-slot-id]:hover {
        outline: 2px dashed rgba(59, 130, 246, 0.5) !important;
        box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.1);
      }
      [data-slot-id].slot-selected {
        outline: 2px solid #3b82f6 !important;
        outline-offset: 2px;
      }
      .slot-label {
        position: absolute;
        background: #3b82f6;
        color: #fff;
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 0 0 4px 0;
        pointer-events: none;
        z-index: 10000;
        font-family: -apple-system, sans-serif;
        font-weight: 600;
        letter-spacing: 0.3px;
      }
    `;
    doc.head.appendChild(style);

    let activeLabel = null;

    function showLabel(el, text) {
      removeLabel();
      activeLabel = doc.createElement('div');
      activeLabel.className = 'slot-label';
      activeLabel.textContent = text;
      const rect = el.getBoundingClientRect();
      activeLabel.style.position = 'fixed';
      activeLabel.style.left = rect.left + 'px';
      activeLabel.style.top = (rect.top - 18) + 'px';
      doc.body.appendChild(activeLabel);
    }

    function removeLabel() {
      if (activeLabel) {
        activeLabel.remove();
        activeLabel = null;
      }
    }

    // Hover labels — per-element since mouseenter doesn't bubble
    doc.querySelectorAll('[data-slot-id]').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        if (editorMode !== 'edit') return;
        if (!el.classList.contains('slot-selected')) {
          const slotType = el.getAttribute('data-slot-type');
          showLabel(el, slotType);
        }
      });
      el.addEventListener('mouseleave', () => {
        if (editorMode !== 'edit') return;
        if (!el.classList.contains('slot-selected')) {
          removeLabel();
        }
      });
    });

    // Capture-phase click handler — intercepts ONLY clicks on editable slots.
    // Non-slot clicks (tab buttons, carousel arrows, accordion toggles) pass through.
    doc.addEventListener('click', (e) => {
      if (editorMode !== 'edit') return;

      const target = e.target.closest('[data-slot-id]');
      if (target) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const slotType = target.getAttribute('data-slot-type');
        const slotIds = target.getAttribute('data-slot-id').split(',');
        selectSlot(target, slotType, slotIds);
      }
      // If NOT a slot element — do nothing, let the click pass through
      // so tab buttons, carousel arrows, accordion toggles work normally
    }, true); // CAPTURE phase

    // Bubble-phase handler for click-outside-to-deselect
    doc.addEventListener('click', (e) => {
      if (editorMode !== 'edit') return;
      if (!e.target.closest('[data-slot-id]')) {
        deselectSlot();
      }
    });

    // Set edit-mode body attribute for CSS coordination
    if (editorMode === 'edit') {
      doc.body.setAttribute('data-cms-expand-active', 'true');
    }

    // If we reloaded iframe while in preview mode, restore that state
    if (editorMode === 'preview') {
      style.disabled = true;
      const expandStyle = doc.querySelector('style[data-cms-expand]');
      if (expandStyle) expandStyle.disabled = true;
      doc.body.removeAttribute('data-cms-expand-active');
    }
  }

  // ── Slot selection ──
  function selectSlot(el, slotType, slotIds) {
    const doc = iframe.contentDocument;
    if (!doc) return;

    // Deselect previous
    doc.querySelectorAll('.slot-selected').forEach(s => s.classList.remove('slot-selected'));

    el.classList.add('slot-selected');
    selectedSlot = { el, slotType, slotIds };

    // Switch to editor panel
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel-content').forEach(p => p.classList.remove('active'));
    document.querySelector('.panel-tab[data-panel="editor"]').classList.add('active');
    document.getElementById('panel-editor').classList.add('active');

    // Show props, hide empty
    editorEmpty.classList.add('hidden');
    editorProps.classList.remove('hidden');

    // Element info
    const tag = el.tagName.toLowerCase();
    const mainSlotId = slotIds[0];
    propElementInfo.textContent = `<${tag}> - ${slotType} (${mainSlotId.slice(0, 8)}...)`;

    // Reset sections
    propTextSection.classList.add('hidden');
    propImageSection.classList.add('hidden');
    propLinkSection.classList.add('hidden');

    // Populate based on type
    if (slotType === 'text' || slotType === 'richtext') {
      propTextSection.classList.remove('hidden');
      const slot = contentMap[mainSlotId];
      propTextInput.value = slot?.value || el.textContent.trim();
    } else if (slotType === 'image') {
      propImageSection.classList.remove('hidden');
      const srcSlotId = slotIds.find(id => contentMap[id]?.type === 'image');
      const altSlotId = slotIds.find(id => contentMap[id]?.type === 'text');
      propImgSrc.value = srcSlotId ? contentMap[srcSlotId].value : '';
      propImgAlt.value = altSlotId ? contentMap[altSlotId].value : '';
      updateImagePreview(propImgSrc.value);
    } else if (slotType === 'link') {
      propLinkSection.classList.remove('hidden');
      const textSlotId = slotIds.find(id => contentMap[id]?.type === 'text');
      const hrefSlotId = slotIds.find(id => contentMap[id]?.type === 'link');
      propLinkText.value = textSlotId ? contentMap[textSlotId].value : el.textContent.trim();
      propLinkHref.value = hrefSlotId ? contentMap[hrefSlotId].value : '';
    }

    // Load style values for this slot
    loadSlotStyles(mainSlotId);
  }

  function deselectSlot() {
    const doc = iframe.contentDocument;
    if (doc) {
      doc.querySelectorAll('.slot-selected').forEach(s => s.classList.remove('slot-selected'));
    }
    selectedSlot = null;
    editorEmpty.classList.remove('hidden');
    editorProps.classList.add('hidden');
  }

  // ── Style sliders ──
  function loadSlotStyles(slotId) {
    const overrides = stylesMap[slotId] || {};

    setSliderValue('marginTop', overrides.marginTop || 0);
    setSliderValue('marginBottom', overrides.marginBottom || 0);
    setSliderValue('paddingTop', overrides.paddingTop || 0);
    setSliderValue('paddingBottom', overrides.paddingBottom || 0);
    setSliderValue('fontSize', overrides.fontSize || 16);
    setSliderValue('letterSpacing', overrides.letterSpacing || 0);

    const lhSlider = document.getElementById('style-lineHeight');
    const lhVal = overrides.lineHeight || 1.5;
    lhSlider.value = Math.round(lhVal * 100);
    document.getElementById('val-lineHeight').textContent = lhVal;

    // Text align
    document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
    const alignVal = overrides.textAlign || 'left';
    const alignBtn = document.querySelector(`.align-btn[data-align="${alignVal}"]`);
    if (alignBtn) alignBtn.classList.add('active');

    // Font weight
    document.getElementById('style-fontWeight').value = overrides.fontWeight || '';

    // Color
    const colorInput = document.getElementById('style-color');
    const colorText = document.getElementById('style-color-text');
    if (colorInput) { colorInput.value = overrides.color || '#000000'; }
    if (colorText) { colorText.value = overrides.color || ''; }

    // Background color
    const bgColorInput = document.getElementById('style-backgroundColor');
    const bgColorText = document.getElementById('style-backgroundColor-text');
    if (bgColorInput) { bgColorInput.value = overrides.backgroundColor || '#ffffff'; }
    if (bgColorText) { bgColorText.value = overrides.backgroundColor || ''; }

    // Border radius
    setSliderValue('borderRadius', overrides.borderRadius || 0);

    // Opacity (stored 0-1, slider 0-100)
    const opacitySlider = document.getElementById('style-opacity');
    const opacityVal = overrides.opacity !== undefined ? overrides.opacity : 1;
    if (opacitySlider) opacitySlider.value = Math.round(opacityVal * 100);
    document.getElementById('val-opacity').textContent = opacityVal;

    // Font style
    document.getElementById('style-fontStyle').value = overrides.fontStyle || '';
  }

  function setSliderValue(prop, value) {
    const slider = document.getElementById(`style-${prop}`);
    if (slider) {
      slider.value = value;
      const unit = (prop === 'lineHeight') ? '' : 'px';
      document.getElementById(`val-${prop}`).textContent = value + unit;
    }
  }

  // Slider change handlers
  ['marginTop', 'marginBottom', 'paddingTop', 'paddingBottom', 'fontSize', 'letterSpacing', 'borderRadius'].forEach(prop => {
    const slider = document.getElementById(`style-${prop}`);
    if (slider) {
      slider.addEventListener('input', () => {
        document.getElementById(`val-${prop}`).textContent = slider.value + 'px';
        applyLiveStyle(prop, slider.value + 'px');
      });
    }
  });

  // Line height (special - stored as ratio, displayed as ratio)
  const lhSlider = document.getElementById('style-lineHeight');
  if (lhSlider) {
    lhSlider.addEventListener('input', () => {
      const val = (lhSlider.value / 100).toFixed(2);
      document.getElementById('val-lineHeight').textContent = val;
      applyLiveStyle('lineHeight', val);
    });
  }

  // Text align buttons
  document.querySelectorAll('.align-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyLiveStyle('textAlign', btn.dataset.align);
    });
  });

  // Opacity slider (stored 0-1, slider 0-100)
  const opacitySlider = document.getElementById('style-opacity');
  if (opacitySlider) {
    opacitySlider.addEventListener('input', () => {
      const val = (opacitySlider.value / 100).toFixed(2);
      document.getElementById('val-opacity').textContent = val;
      applyLiveStyle('opacity', val);
    });
  }

  // Color picker handlers
  ['color', 'backgroundColor'].forEach(prop => {
    const picker = document.getElementById(`style-${prop}`);
    const textInput = document.getElementById(`style-${prop}-text`);
    if (picker) {
      picker.addEventListener('input', () => {
        if (textInput) textInput.value = picker.value;
        applyLiveStyle(prop, picker.value);
      });
    }
    if (textInput) {
      textInput.addEventListener('change', () => {
        const val = textInput.value.trim();
        if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(val)) {
          if (picker) picker.value = val;
          applyLiveStyle(prop, val);
        }
      });
    }
  });

  // Font style select
  const fontStyleSelect = document.getElementById('style-fontStyle');
  if (fontStyleSelect) {
    fontStyleSelect.addEventListener('change', () => {
      applyLiveStyle('fontStyle', fontStyleSelect.value);
    });
  }

  function applyLiveStyle(prop, value) {
    if (!selectedSlot) return;
    const el = selectedSlot.el;
    const cssPropMap = {
      marginTop: 'marginTop', marginBottom: 'marginBottom',
      paddingTop: 'paddingTop', paddingBottom: 'paddingBottom',
      fontSize: 'fontSize', lineHeight: 'lineHeight',
      letterSpacing: 'letterSpacing', textAlign: 'textAlign',
      fontWeight: 'fontWeight', color: 'color',
      backgroundColor: 'backgroundColor', borderRadius: 'borderRadius',
      opacity: 'opacity', fontStyle: 'fontStyle',
    };
    if (cssPropMap[prop]) {
      el.style[cssPropMap[prop]] = value;
    }
  }

  // ── Image upload (base64) ──
  const imgUploadInput = document.getElementById('prop-img-upload');
  const imagePreviewImg = document.getElementById('image-preview-img');
  const imagePreviewPlaceholder = document.getElementById('image-preview-placeholder');
  const uploadStatus = document.getElementById('upload-status');

  if (imgUploadInput) {
    imgUploadInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.size > 2 * 1024 * 1024) {
        showToast('Image must be under 2MB', 'error');
        imgUploadInput.value = '';
        return;
      }

      uploadStatus.textContent = 'Processing...';
      uploadStatus.className = 'upload-status uploading';

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Url = event.target.result;

        propImgSrc.value = base64Url;
        updateImagePreview(base64Url);

        uploadStatus.textContent = 'Ready!';
        uploadStatus.className = 'upload-status success';
        setTimeout(() => { uploadStatus.textContent = ''; }, 2000);
        showToast('Image loaded. Click Apply to use it.', 'info');
      };
      reader.onerror = () => {
        uploadStatus.textContent = 'Failed to read file';
        uploadStatus.className = 'upload-status error';
      };
      reader.readAsDataURL(file);

      imgUploadInput.value = '';
    });
  }

  function updateImagePreview(url) {
    if (imagePreviewImg && imagePreviewPlaceholder) {
      if (url) {
        imagePreviewImg.src = url;
        imagePreviewImg.classList.remove('hidden');
        imagePreviewPlaceholder.classList.add('hidden');
      } else {
        imagePreviewImg.classList.add('hidden');
        imagePreviewPlaceholder.classList.remove('hidden');
      }
    }
  }

  // ── Apply content changes ──
  propApply.addEventListener('click', () => {
    if (!selectedSlot) return;
    const { el, slotType, slotIds } = selectedSlot;

    if (slotType === 'text' || slotType === 'richtext') {
      const mainSlotId = slotIds[0];
      const oldVal = contentMap[mainSlotId]?.value || '';
      const newVal = propTextInput.value.trim();
      if (newVal !== oldVal) {
        if (slotType === 'richtext') {
          el.innerHTML = newVal;
        } else {
          el.textContent = newVal;
        }
        addPendingChange(mainSlotId, oldVal, newVal);
      }
    } else if (slotType === 'image') {
      const srcSlotId = slotIds.find(id => contentMap[id]?.type === 'image');
      const altSlotId = slotIds.find(id => contentMap[id]?.type === 'text');
      if (srcSlotId) {
        const oldVal = contentMap[srcSlotId].value;
        const newVal = propImgSrc.value.trim();
        if (newVal && newVal !== oldVal) {
          el.src = newVal;
          addPendingChange(srcSlotId, oldVal, newVal);
        }
      }
      if (altSlotId) {
        const oldVal = contentMap[altSlotId].value;
        const newVal = propImgAlt.value.trim();
        if (newVal !== oldVal) {
          el.alt = newVal;
          addPendingChange(altSlotId, oldVal, newVal);
        }
      }
    } else if (slotType === 'link') {
      const textSlotId = slotIds.find(id => contentMap[id]?.type === 'text');
      const hrefSlotId = slotIds.find(id => contentMap[id]?.type === 'link');
      if (textSlotId) {
        const oldVal = contentMap[textSlotId].value;
        const newVal = propLinkText.value.trim();
        if (newVal && newVal !== oldVal) {
          el.textContent = newVal;
          addPendingChange(textSlotId, oldVal, newVal);
        }
      }
      if (hrefSlotId) {
        const oldVal = contentMap[hrefSlotId].value;
        const newVal = propLinkHref.value.trim();
        if (newVal !== oldVal) {
          el.href = newVal;
          addPendingChange(hrefSlotId, oldVal, newVal);
        }
      }
    }

    showToast('Change applied. Save to keep.', 'info');
  });

  // ── Apply style changes ──
  styleApply.addEventListener('click', () => {
    if (!selectedSlot) return;
    const mainSlotId = selectedSlot.slotIds[0];

    const overrides = {};

    const mt = parseInt(document.getElementById('style-marginTop').value);
    if (mt !== 0) overrides.marginTop = mt;

    const mb = parseInt(document.getElementById('style-marginBottom').value);
    if (mb !== 0) overrides.marginBottom = mb;

    const pt = parseInt(document.getElementById('style-paddingTop').value);
    if (pt !== 0) overrides.paddingTop = pt;

    const pb = parseInt(document.getElementById('style-paddingBottom').value);
    if (pb !== 0) overrides.paddingBottom = pb;

    const fs = parseInt(document.getElementById('style-fontSize').value);
    if (fs !== 16) overrides.fontSize = fs;

    const lh = parseFloat((document.getElementById('style-lineHeight').value / 100).toFixed(2));
    if (lh !== 1.5) overrides.lineHeight = lh;

    const ls = parseInt(document.getElementById('style-letterSpacing').value);
    if (ls !== 0) overrides.letterSpacing = ls;

    const activeAlign = document.querySelector('.align-btn.active');
    if (activeAlign && activeAlign.dataset.align !== 'left') {
      overrides.textAlign = activeAlign.dataset.align;
    }

    const fw = document.getElementById('style-fontWeight').value;
    if (fw) overrides.fontWeight = fw;

    const colorVal = document.getElementById('style-color-text')?.value?.trim();
    if (colorVal && /^#[0-9a-fA-F]{3,8}$/.test(colorVal)) overrides.color = colorVal;

    const bgColorVal = document.getElementById('style-backgroundColor-text')?.value?.trim();
    if (bgColorVal && /^#[0-9a-fA-F]{3,8}$/.test(bgColorVal)) overrides.backgroundColor = bgColorVal;

    const br = parseInt(document.getElementById('style-borderRadius').value);
    if (br !== 0) overrides.borderRadius = br;

    const op = parseFloat((document.getElementById('style-opacity').value / 100).toFixed(2));
    if (op !== 1) overrides.opacity = op;

    const fst = document.getElementById('style-fontStyle').value;
    if (fst) overrides.fontStyle = fst;

    if (Object.keys(overrides).length > 0) {
      pendingStyleChanges[mainSlotId] = overrides;
    } else {
      delete pendingStyleChanges[mainSlotId];
    }

    updateChangesUI();
    showToast('Style applied. Save to keep.', 'info');
  });

  styleReset.addEventListener('click', () => {
    if (!selectedSlot) return;
    const mainSlotId = selectedSlot.slotIds[0];
    delete pendingStyleChanges[mainSlotId];
    delete stylesMap[mainSlotId];

    // Reset visual
    const el = selectedSlot.el;
    el.style.cssText = '';

    loadSlotStyles(mainSlotId);
    updateChangesUI();
    showToast('Styles reset', 'info');
  });

  // ── Content panel ──
  const contentListEl = document.getElementById('content-list');
  const contentSearch = document.getElementById('content-search');
  const contentSearchCount = document.getElementById('content-search-count');
  const contentSearchClear = document.getElementById('content-search-clear');
  let contentItemElements = []; // cache for search filtering

  function isElementVisible(slotId) {
    const doc = iframe.contentDocument;
    if (!doc) return true; // assume visible if no iframe
    const el = doc.querySelector(`[data-slot-id*="${slotId}"]`);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = iframe.contentWindow.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    // Check if any ancestor is hidden
    let parent = el.parentElement;
    while (parent) {
      const ps = iframe.contentWindow.getComputedStyle(parent);
      if (ps.display === 'none' || ps.visibility === 'hidden') return false;
      parent = parent.parentElement;
    }
    return true;
  }

  function buildContentList() {
    contentListEl.innerHTML = '';
    contentItemElements = [];

    const slotIds = Object.keys(contentMap);
    if (slotIds.length === 0) {
      contentListEl.innerHTML = '<p class="panel-empty">No editable content found</p>';
      return;
    }

    // Always group by element type (from API data, not iframe DOM)
    const typeGroups = {
      headings: { label: 'Headings', icon: 'H', items: [] },
      paragraphs: { label: 'Text', icon: 'T', items: [] },
      buttons: { label: 'Buttons', icon: 'B', items: [] },
      links: { label: 'Links', icon: '🔗', items: [] },
      images: { label: 'Images', icon: '🖼', items: [] },
      other: { label: 'Other', icon: '…', items: [] },
    };
    const hiddenItems = [];

    for (const slotId of slotIds) {
      const slot = contentMap[slotId];
      if (!slot) continue;
      const tag = (slot.tag || '').toLowerCase();
      const type = slot.type;
      const visible = isElementVisible(slotId);
      const entry = { slotId, slot, visible };

      if (!visible) {
        hiddenItems.push(entry);
      }

      if (/^h[1-6]$/.test(tag)) typeGroups.headings.items.push(entry);
      else if (tag === 'p' || tag === 'div' || tag === 'span' || tag === 'li' || tag === 'td' || tag === 'th' || tag === 'label') typeGroups.paragraphs.items.push(entry);
      else if (tag === 'button' || tag === 'submit') typeGroups.buttons.items.push(entry);
      else if (type === 'link') typeGroups.links.items.push(entry);
      else if (type === 'image') typeGroups.images.items.push(entry);
      else typeGroups.other.items.push(entry);
    }

    // Render type groups
    for (const group of Object.values(typeGroups)) {
      if (group.items.length === 0) continue;

      const header = document.createElement('div');
      header.className = 'content-group-header';
      header.textContent = `${group.label} (${group.items.length})`;
      contentListEl.appendChild(header);

      for (const entry of group.items) {
        const item = createContentItem(entry.slotId, entry.slot, entry.visible);
        contentListEl.appendChild(item);
        contentItemElements.push({ el: item, slotId: entry.slotId, slot: entry.slot });
      }
    }

    // Hidden content section at bottom
    if (hiddenItems.length > 0) {
      const hiddenHeader = document.createElement('div');
      hiddenHeader.className = 'content-group-header content-group-hidden';
      hiddenHeader.innerHTML = `<span class="hidden-icon">&#9888;</span> Hidden / Collapsed (${hiddenItems.length})`;
      contentListEl.appendChild(hiddenHeader);

      const hiddenNote = document.createElement('div');
      hiddenNote.className = 'content-hidden-note';
      hiddenNote.textContent = 'Elements inside accordions, tabs, or collapsed sections. Edit them here — changes apply on save.';
      contentListEl.appendChild(hiddenNote);

      for (const entry of hiddenItems) {
        const item = createContentItem(entry.slotId, entry.slot, false);
        item.classList.add('content-item-hidden');
        contentListEl.appendChild(item);
        contentItemElements.push({ el: item, slotId: entry.slotId, slot: entry.slot });
      }
    }
  }

  function createContentItem(slotId, slot, visible) {
    const item = document.createElement('div');
    item.className = 'content-item';
    item.dataset.slotId = slotId;

    const tag = (slot.tag || '').toUpperCase();
    const typeLabel = slot.type === 'richtext' ? 'rich text' : slot.type;
    const currentValue = pendingChanges[slotId]?.newValue ?? slot.value;
    const visibilityBadge = visible === false
      ? '<span class="content-item-hidden-badge" title="Hidden on page">&#9673;</span>'
      : '';

    if (slot.type === 'image') {
      item.innerHTML = `
        <div class="content-item-header">
          <span class="content-item-type">${tag || 'IMG'}</span>
          <span class="content-item-label">${typeLabel}</span>
          ${visibilityBadge}
        </div>
        <div class="content-item-img-preview">
          <img src="${escapeHtml(currentValue)}" alt="">
        </div>
        <div class="content-item-edit">
          <label class="prop-label" style="margin-top:0">Image URL</label>
          <input type="text" class="content-item-textarea content-img-src" value="${escapeAttr(currentValue)}" style="min-height:auto">
          <label class="prop-label">Alt Text</label>
          <input type="text" class="content-item-textarea content-img-alt" value="${escapeAttr(getAltForImageSlot(slotId))}" style="min-height:auto">
          <div class="content-item-actions">
            <button class="content-item-apply">Apply</button>
            <button class="content-item-cancel">Cancel</button>
          </div>
        </div>
      `;
    } else {
      const previewText = stripHtml(currentValue).slice(0, 120);
      item.innerHTML = `
        <div class="content-item-header">
          <span class="content-item-type">${tag || 'TXT'}</span>
          <span class="content-item-label">${typeLabel}</span>
          ${visibilityBadge}
        </div>
        <div class="content-item-preview">${escapeHtml(previewText) || '(empty)'}</div>
        <div class="content-item-edit">
          <textarea class="content-item-textarea">${escapeHtml(currentValue)}</textarea>
          <div class="content-item-actions">
            <button class="content-item-apply">Apply</button>
            <button class="content-item-cancel">Cancel</button>
          </div>
        </div>
      `;
    }

    // Click to expand
    const headerEl = item.querySelector('.content-item-header');
    const previewEl = item.querySelector('.content-item-preview') || item.querySelector('.content-item-img-preview');

    const toggleExpand = (e) => {
      // Don't toggle if clicking inside the edit area
      if (e.target.closest('.content-item-edit')) return;

      const wasExpanded = item.classList.contains('content-item-expanded');

      // Collapse all
      contentListEl.querySelectorAll('.content-item-expanded').forEach(el => {
        el.classList.remove('content-item-expanded');
      });

      if (!wasExpanded) {
        item.classList.add('content-item-expanded');
        highlightOnPage(slotId);

        // Focus textarea
        const ta = item.querySelector('.content-item-textarea');
        if (ta) setTimeout(() => ta.focus(), 50);
      }
    };

    headerEl.addEventListener('click', toggleExpand);
    if (previewEl) previewEl.addEventListener('click', toggleExpand);

    // Apply
    item.querySelector('.content-item-apply').addEventListener('click', (e) => {
      e.stopPropagation();
      applyContentItem(slotId, slot, item);
    });

    // Cancel
    item.querySelector('.content-item-cancel').addEventListener('click', (e) => {
      e.stopPropagation();
      cancelContentItem(slotId, slot, item);
    });

    return item;
  }

  function applyContentItem(slotId, slot, item) {
    const oldVal = slot.value;
    const doc = iframe.contentDocument;

    if (slot.type === 'image') {
      const newSrc = item.querySelector('.content-img-src').value.trim();
      const newAlt = item.querySelector('.content-img-alt').value.trim();

      if (newSrc && newSrc !== oldVal) {
        addPendingChange(slotId, oldVal, newSrc);
        if (doc) {
          const el = doc.querySelector(`[data-slot-id*="${slotId}"]`);
          if (el) el.src = newSrc;
        }
      }

      // Find and update alt slot
      const altSlotId = findAltSlotForImage(slotId);
      if (altSlotId && contentMap[altSlotId]) {
        const oldAlt = contentMap[altSlotId].value;
        if (newAlt !== oldAlt) {
          addPendingChange(altSlotId, oldAlt, newAlt);
          if (doc) {
            const el = doc.querySelector(`[data-slot-id*="${altSlotId}"]`);
            if (el) el.alt = newAlt;
          }
        }
      }
    } else {
      const textarea = item.querySelector('.content-item-textarea');
      const newVal = textarea.value.trim();

      if (newVal !== oldVal) {
        addPendingChange(slotId, oldVal, newVal);

        if (doc) {
          const el = doc.querySelector(`[data-slot-id*="${slotId}"]`);
          if (el) {
            if (slot.type === 'richtext') el.innerHTML = newVal;
            else if (slot.type === 'text') el.textContent = newVal;
            else if (slot.type === 'link') el.href = newVal;
          }
        }
      }
    }

    // Collapse and update preview
    item.classList.remove('content-item-expanded');
    updateContentItemPreview(slotId, item);

    // Show brief "Updated" indicator
    const indicator = document.createElement('div');
    indicator.className = 'content-item-updated';
    indicator.textContent = 'Updated';
    item.appendChild(indicator);
    setTimeout(() => indicator.remove(), 2000);

    showToast('Change applied. Save to keep.', 'info');
  }

  function cancelContentItem(slotId, slot, item) {
    const currentValue = pendingChanges[slotId]?.newValue ?? slot.value;

    if (slot.type === 'image') {
      item.querySelector('.content-img-src').value = currentValue;
      item.querySelector('.content-img-alt').value = getAltForImageSlot(slotId);
    } else {
      item.querySelector('.content-item-textarea').value = currentValue;
    }

    item.classList.remove('content-item-expanded');
  }

  function updateContentItemPreview(slotId, item) {
    const slot = contentMap[slotId];
    if (!slot) return;
    const currentValue = pendingChanges[slotId]?.newValue ?? slot.value;

    if (slot.type === 'image') {
      const img = item.querySelector('.content-item-img-preview img');
      if (img) img.src = currentValue;
      const srcInput = item.querySelector('.content-img-src');
      if (srcInput) srcInput.value = currentValue;
    } else {
      const preview = item.querySelector('.content-item-preview');
      if (preview) preview.textContent = stripHtml(currentValue).slice(0, 120) || '(empty)';
      const textarea = item.querySelector('.content-item-textarea');
      if (textarea) textarea.value = currentValue;
    }
  }

  function highlightOnPage(slotId) {
    const doc = iframe.contentDocument;
    if (!doc) return;

    const el = doc.querySelector(`[data-slot-id*="${slotId}"]`);
    if (!el) return;

    // Check if element is visible
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Temporary glow
    const prevOutline = el.style.outline;
    const prevOutlineOffset = el.style.outlineOffset;
    el.style.outline = '3px solid #3b82f6';
    el.style.outlineOffset = '3px';
    setTimeout(() => {
      el.style.outline = prevOutline;
      el.style.outlineOffset = prevOutlineOffset;
    }, 2000);
  }

  // Helper: find alt text slot ID that is a sibling of an image slot
  function findAltSlotForImage(imgSlotId) {
    // Image slots are paired: img_src and img_alt share the same element
    // The alt slot ID follows the pattern: replace img_src with img_alt
    const altId = imgSlotId.replace('img_src', 'img_alt');
    if (contentMap[altId]) return altId;

    // Fallback: look for same element with text type
    const imgSlot = contentMap[imgSlotId];
    if (!imgSlot) return null;
    for (const [id, s] of Object.entries(contentMap)) {
      if (id !== imgSlotId && s.path === imgSlot.path && s.type === 'text' && s.tag === 'img') {
        return id;
      }
    }
    return null;
  }

  function getAltForImageSlot(imgSlotId) {
    const altId = findAltSlotForImage(imgSlotId);
    if (altId && contentMap[altId]) {
      return pendingChanges[altId]?.newValue ?? contentMap[altId].value;
    }
    return '';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function stripHtml(str) {
    if (!str) return '';
    return str.replace(/<[^>]*>/g, '').trim();
  }

  // Content search
  function filterContentList() {
    const query = contentSearch.value.toLowerCase().trim();
    let currentHeader = null;
    let headerHasVisible = false;
    let matchCount = 0;

    for (const child of Array.from(contentListEl.children)) {
      if (child.classList.contains('content-group-header') || child.classList.contains('content-hidden-note')) {
        if (currentHeader) {
          currentHeader.style.display = headerHasVisible ? '' : 'none';
        }
        if (child.classList.contains('content-hidden-note')) {
          child.style.display = query ? 'none' : '';
          continue;
        }
        currentHeader = child;
        headerHasVisible = false;
        continue;
      }

      if (!child.dataset?.slotId) continue;

      if (!query) {
        child.style.display = '';
        headerHasVisible = true;
        matchCount++;
        continue;
      }

      const slot = contentMap[child.dataset.slotId];
      const text = (slot?.value || '').toLowerCase();
      const tag = (slot?.tag || '').toLowerCase();
      const typeLabel = (slot?.type || '').toLowerCase();
      const matches = text.includes(query) || tag.includes(query) || typeLabel.includes(query);
      child.style.display = matches ? '' : 'none';
      if (matches) {
        headerHasVisible = true;
        matchCount++;
      }
    }

    if (currentHeader) {
      currentHeader.style.display = headerHasVisible ? '' : 'none';
    }

    // Update search count and clear button
    if (query) {
      contentSearchCount.textContent = `${matchCount} found`;
      contentSearchCount.classList.remove('hidden');
      contentSearchClear.classList.remove('hidden');
    } else {
      contentSearchCount.classList.add('hidden');
      contentSearchClear.classList.add('hidden');
    }
  }

  contentSearch.addEventListener('input', filterContentList);

  contentSearchClear.addEventListener('click', () => {
    contentSearch.value = '';
    filterContentList();
    contentSearch.focus();
  });

  // Sync: update content panel when page editing applies changes
  function syncContentPanel(slotId) {
    const item = contentListEl.querySelector(`.content-item[data-slot-id="${slotId}"]`);
    if (item) {
      updateContentItemPreview(slotId, item);
    }
  }

  // ── Sections panel ──
  function buildSectionsList() {
    const doc = iframe.contentDocument;
    const list = document.getElementById('sections-list');
    if (!doc) {
      list.innerHTML = '<p class="panel-empty">No sections found</p>';
      return;
    }

    const sections = [];
    const sectionTags = ['header', 'nav', 'main', 'section', 'article', 'aside', 'footer'];
    sectionTags.forEach(tag => {
      doc.querySelectorAll(tag).forEach((el, i) => {
        const heading = el.querySelector('h1, h2, h3');
        const text = heading ? heading.textContent.trim().slice(0, 40) : el.textContent.trim().slice(0, 40);
        sections.push({ tag, index: i, text, el });
      });
    });

    // Also add major headings
    doc.querySelectorAll('h1, h2').forEach((el, i) => {
      if (!el.closest('header, nav, footer')) {
        sections.push({ tag: el.tagName.toLowerCase(), index: i, text: el.textContent.trim().slice(0, 40), el });
      }
    });

    if (sections.length === 0) {
      list.innerHTML = '<p class="panel-empty">No semantic sections found</p>';
      return;
    }

    list.innerHTML = '';
    sections.forEach(s => {
      const item = document.createElement('div');
      item.className = 'section-item';
      item.innerHTML = `
        <div class="section-item-tag">${s.tag}${s.index > 0 ? ` #${s.index + 1}` : ''}</div>
        <div class="section-item-text">${s.text || '(empty)'}</div>
      `;
      item.addEventListener('click', () => {
        s.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.querySelectorAll('.section-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
      });
      list.appendChild(item);
    });
  }

  // ── SEO panel ──
  async function loadSeo() {
    try {
      const q = currentPageId ? `?pageId=${currentPageId}` : '';
      const res = await fetch(`${API}/seo${q}`);
      seoData = await res.json();
    } catch { seoData = {}; }

    seoTitle.value = seoData.title || siteMeta.name || '';
    seoDescription.value = seoData.description || '';
    seoOgImage.value = seoData.ogImage || '';
    seoCanonicalUrl.value = seoData.canonicalUrl || '';
    seoNoIndex.checked = !!seoData.noIndex;

    updateSeoPreview();
    updateSeoChecklist();
  }

  function updateSeoPreview() {
    seoGpTitle.textContent = seoTitle.value || siteMeta.name || 'Page Title';
    seoGpUrl.textContent = seoCanonicalUrl.value || siteMeta.publishUrl || siteMeta.originalUrl || 'example.com';
    seoGpDesc.textContent = seoDescription.value || 'No description set...';
    seoTitleCount.textContent = seoTitle.value.length;
    seoDescCount.textContent = seoDescription.value.length;
  }

  function updateSeoChecklist() {
    const checks = [
      { label: 'Title present', pass: !!seoTitle.value },
      { label: 'Title under 60 chars', pass: seoTitle.value.length > 0 && seoTitle.value.length <= 60 },
      { label: 'Description present', pass: !!seoDescription.value },
      { label: 'Description under 160 chars', pass: seoDescription.value.length > 0 && seoDescription.value.length <= 160 },
      { label: 'OG image set', pass: !!seoOgImage.value },
      { label: 'Not marked noindex', pass: !seoNoIndex.checked },
    ];

    seoChecks.innerHTML = checks.map(c => `
      <div class="seo-check-item ${c.pass ? 'seo-check-pass' : 'seo-check-fail'}">
        <span class="seo-check-icon">${c.pass ? '&#10003;' : '&#10007;'}</span>
        <span>${c.label}</span>
      </div>
    `).join('');
  }

  // Live preview updates
  seoTitle.addEventListener('input', () => { updateSeoPreview(); updateSeoChecklist(); });
  seoDescription.addEventListener('input', () => { updateSeoPreview(); updateSeoChecklist(); });
  seoOgImage.addEventListener('input', updateSeoPreview);
  seoCanonicalUrl.addEventListener('input', updateSeoPreview);
  seoNoIndex.addEventListener('change', updateSeoChecklist);

  seoSave.addEventListener('click', async () => {
    seoSave.textContent = 'Saving...';
    seoSave.disabled = true;
    try {
      const q = currentPageId ? `?pageId=${currentPageId}` : '';
      const res = await fetch(`${API}/seo${q}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: seoTitle.value,
          description: seoDescription.value,
          ogImage: seoOgImage.value,
          canonicalUrl: seoCanonicalUrl.value,
          noIndex: seoNoIndex.checked,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('SEO saved', 'success');
      } else {
        showToast(data.error?.message || 'Save failed', 'error');
      }
    } catch (err) {
      showToast('Failed to save SEO', 'error');
    } finally {
      seoSave.textContent = 'Save SEO';
      seoSave.disabled = false;
    }
  });

  // ── Save ──
  btnSave.addEventListener('click', async () => {
    if (saving) return;
    const hasContent = Object.keys(pendingChanges).length > 0;
    const hasStyles = Object.keys(pendingStyleChanges).length > 0;
    if (!hasContent && !hasStyles) return;

    saving = true;
    btnSave.textContent = 'Saving...';

    try {
      // Save content changes
      if (hasContent) {
        const changes = {};
        for (const [slotId, { newValue }] of Object.entries(pendingChanges)) {
          changes[slotId] = newValue;
        }
        const q = currentPageId ? `?pageId=${currentPageId}` : '';
        const res = await fetch(`${API}/content${q}`, {
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
        } else {
          showToast(data.errors.join('; '), 'error');
          saving = false;
          btnSave.textContent = 'Save';
          return;
        }
      }

      // Save style changes
      if (hasStyles) {
        const q = currentPageId ? `?pageId=${currentPageId}` : '';
        const res = await fetch(`${API}/styles${q}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pendingStyleChanges),
        });
        const data = await res.json();
        if (data.valid) {
          stylesMap = data.styles;
          pendingStyleChanges = {};
        } else {
          showToast(data.errors.join('; '), 'error');
        }
      }

      undoStack = [];
      updateChangesUI();
      showToast('Changes saved', 'success');
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error');
    } finally {
      saving = false;
      btnSave.textContent = 'Save';
    }
  });

  // ── Publish ──
  btnPublish.addEventListener('click', async () => {
    if (publishing) return;

    if (Object.keys(pendingChanges).length > 0 || Object.keys(pendingStyleChanges).length > 0) {
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
        showToast('Site published!', 'success');
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
  const btnClearChat = document.getElementById('btn-clear-chat');

  // Rotating placeholder prompts
  const chatPlaceholders = [
    'שנה את הכותרת הראשית ל...',
    'הפוך את הכפתור לבולט יותר',
    'תקן שגיאת כתיב בפסקה השנייה',
    'שנה את מספר הטלפון ל...',
    'Change the hero heading to...',
    "Make the CTA button say 'Get Started'",
    'Fix the typo in the about section',
  ];
  let placeholderIndex = 0;
  let placeholderInterval = null;

  function startPlaceholderRotation() {
    chatInput.setAttribute('placeholder', chatPlaceholders[0]);
    placeholderInterval = setInterval(() => {
      placeholderIndex = (placeholderIndex + 1) % chatPlaceholders.length;
      chatInput.setAttribute('placeholder', chatPlaceholders[placeholderIndex]);
    }, 3000);
  }

  function stopPlaceholderRotation() {
    if (placeholderInterval) {
      clearInterval(placeholderInterval);
      placeholderInterval = null;
    }
  }

  function formatTime() {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Toggle chat panel — overlays the right panel
  btnChat.addEventListener('click', () => {
    const isHidden = chatPanel.classList.contains('hidden');
    chatPanel.classList.toggle('hidden');
    if (isHidden) {
      chatInput.focus();
      startPlaceholderRotation();
    } else {
      stopPlaceholderRotation();
    }
  });

  btnCloseChat.addEventListener('click', () => {
    chatPanel.classList.add('hidden');
    stopPlaceholderRotation();
  });

  // Clear chat
  btnClearChat.addEventListener('click', () => {
    chatMessages.innerHTML = '';
    const msg = document.createElement('div');
    msg.className = 'chat-msg chat-msg-system';
    msg.textContent = 'Tell me what you\'d like to change on the site.';
    chatMessages.appendChild(msg);
  });

  // Enable/disable send button based on input
  chatInput.addEventListener('input', () => {
    btnSendChat.disabled = chatInput.value.trim().length === 0;
    // Auto-resize textarea
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  });

  function addChatMessage(text, type) {
    const msg = document.createElement('div');
    msg.className = `chat-msg chat-msg-${type}`;

    const content = document.createElement('div');
    content.textContent = text;
    msg.appendChild(content);

    if (type === 'user' || type === 'ai') {
      const time = document.createElement('div');
      time.className = 'chat-msg-time';
      time.textContent = formatTime();
      msg.appendChild(time);
    }

    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msg;
  }

  function showThinkingIndicator() {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-thinking';
    wrapper.id = 'chat-thinking';
    wrapper.innerHTML = `
      <div class="thinking-dots">
        <span></span><span></span><span></span>
      </div>
      <div class="thinking-label">AI is thinking...</div>
    `;
    chatMessages.appendChild(wrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function hideThinkingIndicator() {
    const el = document.getElementById('chat-thinking');
    if (el) el.remove();
  }

  function showChangesCard(changes) {
    const card = document.createElement('div');
    card.className = 'chat-changes-card';

    const count = Object.keys(changes).length;
    let itemsHtml = '';
    for (const [slotId, newValue] of Object.entries(changes)) {
      const slot = contentMap[slotId];
      if (!slot) continue;
      const oldVal = (slot.value || '').slice(0, 30);
      const newVal = (newValue || '').slice(0, 30);
      const tag = (slot.tag || '').toUpperCase();
      itemsHtml += `<div class="chat-change-item">${tag}: '${escapeHtml(oldVal)}' → '${escapeHtml(newVal)}'</div>`;
    }

    card.innerHTML = `
      <div class="chat-changes-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Applied ${count} change${count > 1 ? 's' : ''}
      </div>
      ${itemsHtml}
      <div class="chat-changes-hint">Click Save to keep them</div>
    `;

    chatMessages.appendChild(card);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function sendChatMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    chatInput.value = '';
    chatInput.style.height = 'auto';
    btnSendChat.disabled = true;
    btnSendChat.classList.add('loading');

    addChatMessage(message, 'user');
    showThinkingIndicator();

    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();

      hideThinkingIndicator();

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
                  if (slot.type === 'richtext') el.innerHTML = newValue;
                  else if (slot.type === 'text') el.textContent = newValue;
                  else if (slot.type === 'image') el.src = newValue;
                  else if (slot.type === 'link') el.href = newValue;
                }
              }
            }
          }
          showChangesCard(data.changes);
        }
      } else {
        addChatMessage(data.error?.message || 'Something went wrong', 'system');
      }
    } catch (err) {
      hideThinkingIndicator();
      addChatMessage('Connection error: ' + err.message, 'system');
    } finally {
      btnSendChat.disabled = chatInput.value.trim().length === 0;
      btnSendChat.classList.remove('loading');
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
    historyList.innerHTML = '<p style="color:#888;padding:12px;font-size:12px;">Loading...</p>';
    try {
      const res = await fetch(`${API}/versions`);
      const { versions } = await res.json();

      if (versions.length === 0) {
        historyList.innerHTML = '<p style="color:#888;padding:12px;font-size:12px;">No versions yet</p>';
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
            pendingStyleChanges = {};
            undoStack = [];
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
      historyList.innerHTML = '<p style="color:#999999;padding:12px;font-size:12px;">Failed to load versions</p>';
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

  // ── Welcome Banner (non-blocking) ──
  function showWelcomeBanner() {
    const storageKey = `welcome_done_${siteId}`;
    if (localStorage.getItem(storageKey)) return;

    const banner = document.getElementById('welcome-banner');
    const dismissBtn = document.getElementById('welcome-dismiss');
    if (!banner || !dismissBtn) return;

    banner.classList.remove('hidden');

    dismissBtn.addEventListener('click', () => {
      banner.classList.add('hidden');
      localStorage.setItem(storageKey, 'true');
    });

    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      banner.classList.add('hidden');
      localStorage.setItem(storageKey, 'true');
    }, 10000);
  }

  // ── Iframe load handler ──
  iframe.addEventListener('load', () => {
    injectEditorScript();
    setTimeout(showWelcomeBanner, 500);
  });

  // ── Init ──
  async function init() {
    try {
      await loadMeta();
      await loadPages();
      await Promise.all([loadContent(), loadStyles()]);
      loadIframe();
      loadPublishStatus();
    } catch (err) {
      showToast('Failed to load site: ' + err.message, 'error');
    }
  }

  init();
})();
