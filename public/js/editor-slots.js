(function (CMS) {
  const { showToast, sanitizeHtml } = CMS.utils;
  const state = CMS.state;
  const refs = CMS.refs;
  const fn = CMS.fn;

  if (!state.siteId) return;

  // ── Inject editor behavior into iframe ──
  fn.injectEditorScript = function () {
    const doc = refs.iframe.contentDocument;
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

    doc.querySelectorAll('[data-slot-id]').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        if (state.editorMode !== 'edit') return;
        if (!el.classList.contains('slot-selected')) {
          showLabel(el, el.getAttribute('data-slot-type'));
        }
      });
      el.addEventListener('mouseleave', () => {
        if (state.editorMode !== 'edit') return;
        if (!el.classList.contains('slot-selected')) {
          removeLabel();
        }
      });
    });

    function isTriggerElement(el) {
      const text = (el.textContent || '').trim();
      const textLower = text.toLowerCase();
      const cls = (el.className || '').toLowerCase();

      if (text === 'קרא עוד' || text === 'הצג עוד' || text === 'פרטים נוספים' ||
          text === 'למידע נוסף' || text === 'הצג הכל') return true;
      if (textLower === 'read more' || textLower === 'show more' ||
          textLower === 'learn more' || textLower === 'see more' ||
          textLower === 'view more' || textLower === 'expand') return true;
      if (cls.includes('read-more') || cls.includes('readmore') ||
          cls.includes('show-more') || cls.includes('expand') ||
          cls.includes('toggle') || cls.includes('accordion') ||
          cls.includes('faq') || cls.includes('collapse')) return true;
      if (el.getAttribute('role') === 'tab') return true;
      if (el.closest('details > summary')) return true;
      if (el.closest('[class*="accordion-header"]') || el.closest('[class*="accordion-title"]')) return true;
      if (el.closest('[role="tablist"]')) return true;
      if (el.getAttribute('aria-controls') || el.getAttribute('data-target') ||
          el.getAttribute('data-toggle') || el.getAttribute('data-bs-toggle')) return true;
      return false;
    }

    function findRelatedHiddenSlots(triggerEl) {
      const hiddenSlots = [];
      const targetId = triggerEl.getAttribute('aria-controls') ||
                       (triggerEl.getAttribute('data-target') || '').replace('#', '') ||
                       (triggerEl.getAttribute('href') || '').replace('#', '');
      if (targetId) {
        const targetEl = doc.getElementById(targetId);
        if (targetEl) {
          targetEl.querySelectorAll('[data-slot-id]').forEach(s => hiddenSlots.push(s.getAttribute('data-slot-id')));
        }
      }
      if (hiddenSlots.length === 0) {
        let sibling = triggerEl.nextElementSibling;
        while (sibling && hiddenSlots.length === 0) {
          sibling.querySelectorAll('[data-slot-id]').forEach(s => hiddenSlots.push(s.getAttribute('data-slot-id')));
          if (sibling.getAttribute('data-slot-id')) hiddenSlots.push(sibling.getAttribute('data-slot-id'));
          sibling = sibling.nextElementSibling;
        }
      }
      if (hiddenSlots.length === 0) {
        const parentSibling = triggerEl.parentElement?.nextElementSibling;
        if (parentSibling) {
          parentSibling.querySelectorAll('[data-slot-id]').forEach(s => hiddenSlots.push(s.getAttribute('data-slot-id')));
        }
      }
      if (hiddenSlots.length === 0) {
        const container = triggerEl.closest('section, article, div[class*="card"], div[class*="item"], div[class*="block"]');
        if (container) {
          container.querySelectorAll('[data-slot-id]').forEach(s => {
            const st = doc.defaultView.getComputedStyle(s);
            if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0' || s.offsetHeight === 0) {
              hiddenSlots.push(s.getAttribute('data-slot-id'));
            }
          });
        }
      }
      return hiddenSlots;
    }

    // Capture-phase click handler
    doc.addEventListener('click', (e) => {
      if (state.editorMode !== 'edit') return;
      const target = e.target.closest('[data-slot-id]');

      if (target) {
        if (isTriggerElement(target)) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const hiddenSlotIds = findRelatedHiddenSlots(target);
          if (hiddenSlotIds.length > 0) {
            window.parent.postMessage({
              type: 'show-hidden-content',
              slotIds: hiddenSlotIds,
              triggerText: target.textContent.trim().slice(0, 60)
            }, '*');
            return;
          }
        }

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const slotType = target.getAttribute('data-slot-type');
        const slotIds = target.getAttribute('data-slot-id').split(',');
        selectSlot(target, slotType, slotIds);
      } else {
        const clickedEl = e.target.closest('a, button, summary, [role="tab"], [class*="accordion"], [class*="toggle"], [class*="tab"]');
        if (clickedEl && isTriggerElement(clickedEl)) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const hiddenSlotIds = findRelatedHiddenSlots(clickedEl);
          window.parent.postMessage({
            type: 'show-hidden-content',
            slotIds: hiddenSlotIds,
            triggerText: clickedEl.textContent.trim().slice(0, 60)
          }, '*');
        }
      }
    }, true);

    doc.addEventListener('click', (e) => {
      if (state.editorMode !== 'edit') return;
      if (!e.target.closest('[data-slot-id]')) {
        fn.deselectSlot();
      }
    });

    if (state.editorMode === 'edit') {
      doc.body.setAttribute('data-cms-expand-active', 'true');
    }

    if (state.editorMode === 'preview') {
      style.disabled = true;
      const expandStyle = doc.querySelector('style[data-cms-expand]');
      if (expandStyle) expandStyle.disabled = true;
      doc.body.removeAttribute('data-cms-expand-active');
    }
  };

  // ── Slot selection ──
  function selectSlot(el, slotType, slotIds) {
    const doc = refs.iframe.contentDocument;
    if (!doc) return;

    doc.querySelectorAll('.slot-selected').forEach(s => s.classList.remove('slot-selected'));
    el.classList.add('slot-selected');
    state.selectedSlot = { el, slotType, slotIds };

    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel-content').forEach(p => p.classList.remove('active'));
    document.querySelector('.panel-tab[data-panel="editor"]').classList.add('active');
    document.getElementById('panel-editor').classList.add('active');

    refs.editorEmpty.classList.add('hidden');
    refs.editorProps.classList.remove('hidden');

    const tag = el.tagName.toLowerCase();
    const mainSlotId = slotIds[0];
    refs.propElementInfo.textContent = `<${tag}> - ${slotType} (${mainSlotId.slice(0, 8)}...)`;

    refs.propTextSection.classList.add('hidden');
    refs.propImageSection.classList.add('hidden');
    refs.propLinkSection.classList.add('hidden');

    if (slotType === 'text' || slotType === 'richtext') {
      refs.propTextSection.classList.remove('hidden');
      const slot = state.contentMap[mainSlotId];
      refs.propTextInput.value = slot?.value || el.textContent.trim();
    } else if (slotType === 'image') {
      refs.propImageSection.classList.remove('hidden');
      const srcSlotId = slotIds.find(id => state.contentMap[id]?.type === 'image');
      const altSlotId = slotIds.find(id => state.contentMap[id]?.type === 'text');
      refs.propImgSrc.value = srcSlotId ? state.contentMap[srcSlotId].value : '';
      refs.propImgAlt.value = altSlotId ? state.contentMap[altSlotId].value : '';
      updateImagePreview(refs.propImgSrc.value);
    } else if (slotType === 'link') {
      refs.propLinkSection.classList.remove('hidden');
      const textSlotId = slotIds.find(id => state.contentMap[id]?.type === 'text');
      const hrefSlotId = slotIds.find(id => state.contentMap[id]?.type === 'link');
      refs.propLinkText.value = textSlotId ? state.contentMap[textSlotId].value : el.textContent.trim();
      refs.propLinkHref.value = hrefSlotId ? state.contentMap[hrefSlotId].value : '';
    }

    loadSlotStyles(mainSlotId);
  }

  // ── Style sliders ──
  function loadSlotStyles(slotId) {
    const overrides = state.stylesMap[slotId] || {};

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

    document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
    const alignVal = overrides.textAlign || 'left';
    const alignBtn = document.querySelector(`.align-btn[data-align="${alignVal}"]`);
    if (alignBtn) alignBtn.classList.add('active');

    document.getElementById('style-fontWeight').value = overrides.fontWeight || '';

    const colorInput = document.getElementById('style-color');
    const colorText = document.getElementById('style-color-text');
    if (colorInput) colorInput.value = overrides.color || '#000000';
    if (colorText) colorText.value = overrides.color || '';

    const bgColorInput = document.getElementById('style-backgroundColor');
    const bgColorText = document.getElementById('style-backgroundColor-text');
    if (bgColorInput) bgColorInput.value = overrides.backgroundColor || '#ffffff';
    if (bgColorText) bgColorText.value = overrides.backgroundColor || '';

    setSliderValue('borderRadius', overrides.borderRadius || 0);

    const opacitySlider = document.getElementById('style-opacity');
    const opacityVal = overrides.opacity !== undefined ? overrides.opacity : 1;
    if (opacitySlider) opacitySlider.value = Math.round(opacityVal * 100);
    document.getElementById('val-opacity').textContent = opacityVal;

    document.getElementById('style-fontStyle').value = overrides.fontStyle || '';
  }

  fn.loadSlotStyles = loadSlotStyles;

  function setSliderValue(prop, value) {
    const slider = document.getElementById(`style-${prop}`);
    if (slider) {
      slider.value = value;
      const unit = (prop === 'lineHeight') ? '' : 'px';
      document.getElementById(`val-${prop}`).textContent = value + unit;
    }
  }

  ['marginTop', 'marginBottom', 'paddingTop', 'paddingBottom', 'fontSize', 'letterSpacing', 'borderRadius'].forEach(prop => {
    const slider = document.getElementById(`style-${prop}`);
    if (slider) {
      slider.addEventListener('input', () => {
        document.getElementById(`val-${prop}`).textContent = slider.value + 'px';
        applyLiveStyle(prop, slider.value + 'px');
      });
    }
  });

  const lhSlider = document.getElementById('style-lineHeight');
  if (lhSlider) {
    lhSlider.addEventListener('input', () => {
      const val = (lhSlider.value / 100).toFixed(2);
      document.getElementById('val-lineHeight').textContent = val;
      applyLiveStyle('lineHeight', val);
    });
  }

  document.querySelectorAll('.align-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyLiveStyle('textAlign', btn.dataset.align);
    });
  });

  const opacitySlider = document.getElementById('style-opacity');
  if (opacitySlider) {
    opacitySlider.addEventListener('input', () => {
      const val = (opacitySlider.value / 100).toFixed(2);
      document.getElementById('val-opacity').textContent = val;
      applyLiveStyle('opacity', val);
    });
  }

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

  const fontStyleSelect = document.getElementById('style-fontStyle');
  if (fontStyleSelect) {
    fontStyleSelect.addEventListener('change', () => {
      applyLiveStyle('fontStyle', fontStyleSelect.value);
    });
  }

  function applyLiveStyle(prop, value) {
    if (!state.selectedSlot) return;
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
      state.selectedSlot.el.style[cssPropMap[prop]] = value;
    }
  }

  // ── Image upload ──
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
        refs.propImgSrc.value = base64Url;
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
  refs.propApply.addEventListener('click', () => {
    if (!state.selectedSlot) return;
    const { el, slotType, slotIds } = state.selectedSlot;

    if (slotType === 'text' || slotType === 'richtext') {
      const mainSlotId = slotIds[0];
      const oldVal = state.contentMap[mainSlotId]?.value || '';
      const newVal = refs.propTextInput.value.trim();
      if (newVal !== oldVal) {
        if (slotType === 'richtext') el.innerHTML = sanitizeHtml(newVal);
        else el.textContent = newVal;
        fn.addPendingChange(mainSlotId, oldVal, newVal);
      }
    } else if (slotType === 'image') {
      const srcSlotId = slotIds.find(id => state.contentMap[id]?.type === 'image');
      const altSlotId = slotIds.find(id => state.contentMap[id]?.type === 'text');
      if (srcSlotId) {
        const oldVal = state.contentMap[srcSlotId].value;
        const newVal = refs.propImgSrc.value.trim();
        if (newVal && newVal !== oldVal) {
          el.src = newVal;
          fn.addPendingChange(srcSlotId, oldVal, newVal);
        }
      }
      if (altSlotId) {
        const oldVal = state.contentMap[altSlotId].value;
        const newVal = refs.propImgAlt.value.trim();
        if (newVal !== oldVal) {
          el.alt = newVal;
          fn.addPendingChange(altSlotId, oldVal, newVal);
        }
      }
    } else if (slotType === 'link') {
      const textSlotId = slotIds.find(id => state.contentMap[id]?.type === 'text');
      const hrefSlotId = slotIds.find(id => state.contentMap[id]?.type === 'link');
      if (textSlotId) {
        const oldVal = state.contentMap[textSlotId].value;
        const newVal = refs.propLinkText.value.trim();
        if (newVal && newVal !== oldVal) {
          el.textContent = newVal;
          fn.addPendingChange(textSlotId, oldVal, newVal);
        }
      }
      if (hrefSlotId) {
        const oldVal = state.contentMap[hrefSlotId].value;
        const newVal = refs.propLinkHref.value.trim();
        if (newVal !== oldVal) {
          el.href = newVal;
          fn.addPendingChange(hrefSlotId, oldVal, newVal);
        }
      }
    }

    showToast('Change applied. Save to keep.', 'info');
  });

  // ── Apply style changes ──
  refs.styleApply.addEventListener('click', () => {
    if (!state.selectedSlot) return;
    const mainSlotId = state.selectedSlot.slotIds[0];
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
    if (activeAlign && activeAlign.dataset.align !== 'left') overrides.textAlign = activeAlign.dataset.align;

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
      state.pendingStyleChanges[mainSlotId] = overrides;
    } else {
      delete state.pendingStyleChanges[mainSlotId];
    }

    fn.updateChangesUI();
    showToast('Style applied. Save to keep.', 'info');
  });

  refs.styleReset.addEventListener('click', () => {
    if (!state.selectedSlot) return;
    const mainSlotId = state.selectedSlot.slotIds[0];
    delete state.pendingStyleChanges[mainSlotId];
    delete state.stylesMap[mainSlotId];

    state.selectedSlot.el.style.cssText = '';
    loadSlotStyles(mainSlotId);
    fn.updateChangesUI();
    showToast('Styles reset', 'info');
  });
})(window.CMS);
