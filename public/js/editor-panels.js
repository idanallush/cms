(function (CMS) {
  const { showToast, escapeHtml, escapeAttr, stripHtml, sanitizeHtml } = CMS.utils;
  const state = CMS.state;
  const refs = CMS.refs;
  const fn = CMS.fn;

  if (!state.siteId) return;

  // ── Content panel ──
  const contentListEl = document.getElementById('content-list');
  const contentSearch = document.getElementById('content-search');
  const contentSearchCount = document.getElementById('content-search-count');
  const contentSearchClear = document.getElementById('content-search-clear');
  let contentItemElements = [];

  function isElementVisible(slotId) {
    const doc = refs.iframe.contentDocument;
    if (!doc) return true;
    const el = doc.querySelector(`[data-slot-id*="${slotId}"]`);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = refs.iframe.contentWindow.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    let parent = el.parentElement;
    while (parent) {
      const ps = refs.iframe.contentWindow.getComputedStyle(parent);
      if (ps.display === 'none' || ps.visibility === 'hidden') return false;
      parent = parent.parentElement;
    }
    return true;
  }

  fn.buildContentList = function () {
    contentListEl.innerHTML = '';
    contentItemElements = [];

    const slotIds = Object.keys(state.contentMap);
    if (slotIds.length === 0) {
      contentListEl.innerHTML = '<p class="panel-empty">No editable content found</p>';
      return;
    }

    const doc = refs.iframe.contentDocument;
    const sections = buildSectionMap(doc, state.contentMap);

    if (sections.length === 0) {
      contentListEl.innerHTML = '<p class="panel-empty">No editable content found</p>';
      return;
    }

    sections.forEach(section => {
      const header = document.createElement('div');
      header.className = 'content-group-header section-group-header';
      header.innerHTML = `<span class="section-icon">${section.icon}</span><span class="section-name">${escapeHtml(section.name)}</span><span class="section-count">${section.slots.length}</span>`;
      contentListEl.appendChild(header);

      for (const entry of section.slots) {
        const item = createContentItem(entry.slotId, entry.slot, entry.visible, entry.context);
        if (!entry.visible) item.classList.add('content-item-hidden');
        contentListEl.appendChild(item);
        contentItemElements.push({ el: item, slotId: entry.slotId, slot: entry.slot });
      }
    });
  };

  function buildSectionMap(doc, cMap) {
    const sections = [];
    const assignedSlots = new Set();

    if (!doc || !doc.body) {
      const all = Object.entries(cMap).map(([slotId, slot]) => ({
        slotId, slot, visible: false, context: null
      }));
      if (all.length > 0) sections.push({ name: 'All Content', icon: '📄', slots: all });
      return sections;
    }

    const sectionEls = [];
    doc.querySelectorAll('header, nav, section, article, footer, main, [class*="section"], [class*="hero"], [class*="about"], [class*="service"], [class*="feature"], [class*="testimonial"], [class*="faq"], [class*="contact"], [class*="footer"], [class*="pricing"], [class*="team"], [class*="gallery"], [class*="review"]').forEach(el => {
      let depth = 0, p = el.parentElement;
      while (p && p !== doc.body) { depth++; p = p.parentElement; }
      if (depth <= 6) sectionEls.push(el);
    });

    if (sectionEls.length === 0) {
      doc.body.querySelectorAll(':scope > *').forEach(el => {
        if (el.querySelector('[data-slot-id]')) sectionEls.push(el);
      });
    }

    sectionEls.forEach((sectionEl, idx) => {
      const slots = [];
      sectionEl.querySelectorAll('[data-slot-id]').forEach(slotEl => {
        const slotId = slotEl.getAttribute('data-slot-id');
        if (assignedSlots.has(slotId)) return;
        assignedSlots.add(slotId);
        const slot = cMap[slotId];
        if (!slot) return;
        const visible = isElementVisible(slotId);
        const context = !visible ? getSlotContextFromEl(slotEl, doc) : null;
        slots.push({ slotId, slot, visible, context });
      });

      if (slots.length === 0) return;
      const { name, icon } = getSectionNameAndIcon(sectionEl, idx);
      sections.push({ name, icon, slots });
    });

    const orphanSlots = [];
    Object.entries(cMap).forEach(([slotId, slot]) => {
      if (!assignedSlots.has(slotId)) {
        orphanSlots.push({ slotId, slot, visible: false, context: '🔒 Hidden content' });
      }
    });
    if (orphanSlots.length > 0) {
      sections.push({ name: 'Hidden / Other', icon: '🔒', slots: orphanSlots });
    }

    return sections;
  }

  function getSectionNameAndIcon(sectionEl, index) {
    const cls = (sectionEl.className || '').toLowerCase();
    const tag = sectionEl.tagName.toLowerCase();
    const heading = sectionEl.querySelector('h1, h2, h3');
    const headingText = heading ? heading.textContent.trim().substring(0, 40) : null;

    if (tag === 'header' || tag === 'nav' || cls.includes('header') || cls.includes('nav'))
      return { name: headingText || 'Navigation', icon: '🧭' };
    if (cls.includes('hero') || cls.includes('banner') || cls.includes('jumbotron') || (index === 0 && tag === 'section'))
      return { name: headingText || 'Hero', icon: '🏔️' };
    if (cls.includes('about')) return { name: headingText || 'About', icon: '📖' };
    if (cls.includes('service') || cls.includes('feature'))
      return { name: headingText || 'Features', icon: '⭐' };
    if (cls.includes('testimonial') || cls.includes('review'))
      return { name: headingText || 'Reviews', icon: '💬' };
    if (cls.includes('faq') || cls.includes('question'))
      return { name: headingText || 'FAQ', icon: '❓' };
    if (cls.includes('contact') || cls.includes('form'))
      return { name: headingText || 'Contact', icon: '📧' };
    if (cls.includes('pricing') || cls.includes('price'))
      return { name: headingText || 'Pricing', icon: '💰' };
    if (cls.includes('team') || cls.includes('staff'))
      return { name: headingText || 'Team', icon: '👥' };
    if (cls.includes('gallery') || cls.includes('portfolio'))
      return { name: headingText || 'Gallery', icon: '🖼️' };
    if (tag === 'footer' || cls.includes('footer'))
      return { name: headingText || 'Footer', icon: '📋' };

    if (headingText) return { name: headingText, icon: '📄' };
    return { name: 'Section ' + (index + 1), icon: '📄' };
  }

  function getSlotContextFromEl(slotEl, iframeDoc) {
    const accordion = slotEl.closest('[class*="accordion"], [class*="faq"], details');
    if (accordion) {
      const header = accordion.querySelector('h2, h3, h4, summary, [class*="header"], [class*="title"]');
      return '📋 ' + (header?.textContent?.trim()?.substring(0, 40) || 'Accordion');
    }
    const tabPanel = slotEl.closest('[role="tabpanel"], [class*="tab-pane"]');
    if (tabPanel) {
      const panelId = tabPanel.id || tabPanel.getAttribute('aria-labelledby');
      if (panelId) {
        const tabEl = iframeDoc.querySelector('[aria-controls="' + panelId + '"], [href="#' + panelId + '"]');
        if (tabEl) return '📑 Tab: ' + (tabEl.textContent?.trim()?.substring(0, 30) || 'Tab');
      }
      return '📑 Tab content';
    }
    const readMore = slotEl.closest('[class*="read-more"], [class*="collapse"]:not(.navbar-collapse), [class*="expandable"]');
    if (readMore) {
      const heading = readMore.parentElement?.querySelector('h2, h3, h4');
      return '📖 Under "' + (heading?.textContent?.trim()?.substring(0, 30) || 'Read More') + '"';
    }
    return null;
  }

  function createContentItem(slotId, slot, visible, context) {
    const item = document.createElement('div');
    item.className = 'content-item';
    item.dataset.slotId = slotId;

    const tag = (slot.tag || '').toUpperCase();
    const typeLabel = slot.type === 'richtext' ? 'rich text' : slot.type;
    const currentValue = state.pendingChanges[slotId]?.newValue ?? slot.value;
    const visibilityBadge = visible === false
      ? '<span class="content-item-hidden-badge" title="Hidden on page">🔒</span>'
      : '';
    const contextHtml = context ? `<div class="content-item-context">${escapeHtml(context)}</div>` : '';

    if (slot.type === 'image') {
      item.innerHTML = `
        <div class="content-item-header">
          <span class="content-item-type">${tag || 'IMG'}</span>
          <span class="content-item-label">${typeLabel}</span>
          ${visibilityBadge}
        </div>
        ${contextHtml}
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
        ${contextHtml}
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

    const headerEl = item.querySelector('.content-item-header');
    const previewEl = item.querySelector('.content-item-preview') || item.querySelector('.content-item-img-preview');

    const toggleExpand = (e) => {
      if (e.target.closest('.content-item-edit')) return;
      const wasExpanded = item.classList.contains('content-item-expanded');
      contentListEl.querySelectorAll('.content-item-expanded').forEach(el => el.classList.remove('content-item-expanded'));
      if (!wasExpanded) {
        item.classList.add('content-item-expanded');
        highlightOnPage(slotId);
        const ta = item.querySelector('.content-item-textarea');
        if (ta) setTimeout(() => ta.focus(), 50);
      }
    };

    headerEl.addEventListener('click', toggleExpand);
    if (previewEl) previewEl.addEventListener('click', toggleExpand);

    item.querySelector('.content-item-apply').addEventListener('click', (e) => {
      e.stopPropagation();
      applyContentItem(slotId, slot, item);
    });

    item.querySelector('.content-item-cancel').addEventListener('click', (e) => {
      e.stopPropagation();
      cancelContentItem(slotId, slot, item);
    });

    return item;
  }

  function applyContentItem(slotId, slot, item) {
    const oldVal = slot.value;
    const doc = refs.iframe.contentDocument;

    if (slot.type === 'image') {
      const newSrc = item.querySelector('.content-img-src').value.trim();
      const newAlt = item.querySelector('.content-img-alt').value.trim();

      if (newSrc && newSrc !== oldVal) {
        fn.addPendingChange(slotId, oldVal, newSrc);
        if (doc) {
          const el = doc.querySelector(`[data-slot-id*="${slotId}"]`);
          if (el) el.src = newSrc;
        }
      }

      const altSlotId = findAltSlotForImage(slotId);
      if (altSlotId && state.contentMap[altSlotId]) {
        const oldAlt = state.contentMap[altSlotId].value;
        if (newAlt !== oldAlt) {
          fn.addPendingChange(altSlotId, oldAlt, newAlt);
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
        fn.addPendingChange(slotId, oldVal, newVal);
        if (doc) {
          const el = doc.querySelector(`[data-slot-id*="${slotId}"]`);
          if (el) {
            if (slot.type === 'richtext') el.innerHTML = sanitizeHtml(newVal);
            else if (slot.type === 'text') el.textContent = newVal;
            else if (slot.type === 'link') el.href = newVal;
          }
        }
      }
    }

    item.classList.remove('content-item-expanded');
    updateContentItemPreview(slotId, item);

    const indicator = document.createElement('div');
    indicator.className = 'content-item-updated';
    indicator.textContent = 'Updated';
    item.appendChild(indicator);
    setTimeout(() => indicator.remove(), 2000);

    showToast('Change applied. Save to keep.', 'info');
  }

  function cancelContentItem(slotId, slot, item) {
    const currentValue = state.pendingChanges[slotId]?.newValue ?? slot.value;
    if (slot.type === 'image') {
      item.querySelector('.content-img-src').value = currentValue;
      item.querySelector('.content-img-alt').value = getAltForImageSlot(slotId);
    } else {
      item.querySelector('.content-item-textarea').value = currentValue;
    }
    item.classList.remove('content-item-expanded');
  }

  function updateContentItemPreview(slotId, item) {
    const slot = state.contentMap[slotId];
    if (!slot) return;
    const currentValue = state.pendingChanges[slotId]?.newValue ?? slot.value;

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
    const doc = refs.iframe.contentDocument;
    if (!doc) return;
    const el = doc.querySelector(`[data-slot-id*="${slotId}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const prevOutline = el.style.outline;
    const prevOutlineOffset = el.style.outlineOffset;
    el.style.outline = '3px solid #3b82f6';
    el.style.outlineOffset = '3px';
    setTimeout(() => {
      el.style.outline = prevOutline;
      el.style.outlineOffset = prevOutlineOffset;
    }, 2000);
  }

  function findAltSlotForImage(imgSlotId) {
    const altId = imgSlotId.replace('img_src', 'img_alt');
    if (state.contentMap[altId]) return altId;
    const imgSlot = state.contentMap[imgSlotId];
    if (!imgSlot) return null;
    for (const [id, s] of Object.entries(state.contentMap)) {
      if (id !== imgSlotId && s.path === imgSlot.path && s.type === 'text' && s.tag === 'img') {
        return id;
      }
    }
    return null;
  }

  function getAltForImageSlot(imgSlotId) {
    const altId = findAltSlotForImage(imgSlotId);
    if (altId && state.contentMap[altId]) {
      return state.pendingChanges[altId]?.newValue ?? state.contentMap[altId].value;
    }
    return '';
  }

  // Content search
  function filterContentList() {
    const query = contentSearch.value.toLowerCase().trim();
    let currentHeader = null;
    let headerHasVisible = false;
    let matchCount = 0;

    for (const child of Array.from(contentListEl.children)) {
      if (child.classList.contains('content-group-header') || child.classList.contains('section-group-header')) {
        if (currentHeader) currentHeader.style.display = headerHasVisible ? '' : 'none';
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

      const slot = state.contentMap[child.dataset.slotId];
      const text = (slot?.value || '').toLowerCase();
      const tag = (slot?.tag || '').toLowerCase();
      const typeLabel = (slot?.type || '').toLowerCase();
      const contextText = (child.querySelector('.content-item-context')?.textContent || '').toLowerCase();
      const matches = text.includes(query) || tag.includes(query) || typeLabel.includes(query) || contextText.includes(query);
      child.style.display = matches ? '' : 'none';
      if (matches) {
        headerHasVisible = true;
        matchCount++;
      }
    }

    if (currentHeader) currentHeader.style.display = headerHasVisible ? '' : 'none';

    if (query) {
      contentSearchCount.textContent = `${matchCount} found`;
      contentSearchCount.classList.remove('hidden');
      contentSearchClear.classList.remove('hidden');
    } else {
      contentSearchCount.classList.add('hidden');
      contentSearchClear.classList.add('hidden');
    }
  }

  let contentSearchTimeout;
  contentSearch.addEventListener('input', () => {
    clearTimeout(contentSearchTimeout);
    contentSearchTimeout = setTimeout(() => filterContentList(), 300);
  });

  contentSearchClear.addEventListener('click', () => {
    contentSearch.value = '';
    filterContentList();
    contentSearch.focus();
  });

  fn.syncContentPanel = function (slotId) {
    const item = contentListEl.querySelector(`.content-item[data-slot-id="${slotId}"]`);
    if (item) updateContentItemPreview(slotId, item);
  };

  // Hidden content message handler
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'show-hidden-content') {
      const { slotIds, triggerText } = e.data;
      fn.switchToTab('content');

      if (slotIds && slotIds.length > 0) {
        setTimeout(() => {
          const firstSlotItem = contentListEl.querySelector(`.content-item[data-slot-id="${slotIds[0]}"]`);
          if (firstSlotItem) {
            firstSlotItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstSlotItem.classList.add('highlight-flash');
            setTimeout(() => firstSlotItem.classList.remove('highlight-flash'), 2000);
            const header = firstSlotItem.querySelector('.content-item-header');
            if (header && !firstSlotItem.classList.contains('content-item-expanded')) {
              header.click();
            }
            showToast(`Found ${slotIds.length} hidden item(s) — edit here`, 'info');
          } else {
            showToast(`No editable content found for "${triggerText}"`, 'info');
          }
        }, 300);
      } else {
        showToast(`No editable content found for "${triggerText}"`, 'info');
      }
    }
  });

  // ── Sections panel ──
  fn.buildSectionsList = function () {
    const doc = refs.iframe.contentDocument;
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
  };
})(window.CMS);
