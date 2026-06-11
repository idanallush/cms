(function (CMS) {
  const { showToast, apiFetch } = CMS.utils;
  const state = CMS.state;
  const fn = CMS.fn;

  if (!state.siteId) return;

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

  fn.loadSeo = async function () {
    const q = state.currentPageId ? `?pageId=${state.currentPageId}` : '';
    const data = await apiFetch(`${state.API}/seo${q}`);
    state.seoData = data || {};

    seoTitle.value = state.seoData.title || state.siteMeta.name || '';
    seoDescription.value = state.seoData.description || '';
    seoOgImage.value = state.seoData.ogImage || '';
    seoCanonicalUrl.value = state.seoData.canonicalUrl || '';
    seoNoIndex.checked = !!state.seoData.noIndex;

    updateSeoPreview();
    updateSeoChecklist();
  };

  function updateSeoPreview() {
    seoGpTitle.textContent = seoTitle.value || state.siteMeta.name || 'Page Title';
    seoGpUrl.textContent = seoCanonicalUrl.value || state.siteMeta.publishUrl || state.siteMeta.originalUrl || 'example.com';
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

  seoTitle.addEventListener('input', () => { updateSeoPreview(); updateSeoChecklist(); });
  seoDescription.addEventListener('input', () => { updateSeoPreview(); updateSeoChecklist(); });
  seoOgImage.addEventListener('input', updateSeoPreview);
  seoCanonicalUrl.addEventListener('input', updateSeoPreview);
  seoNoIndex.addEventListener('change', updateSeoChecklist);

  seoSave.addEventListener('click', async () => {
    seoSave.textContent = 'Saving...';
    seoSave.disabled = true;
    try {
      const q = state.currentPageId ? `?pageId=${state.currentPageId}` : '';
      const res = await fetch(`${state.API}/seo${q}`, {
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
    } catch {
      showToast('Failed to save SEO', 'error');
    } finally {
      seoSave.textContent = 'Save SEO';
      seoSave.disabled = false;
    }
  });
})(window.CMS);
