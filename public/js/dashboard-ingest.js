(function () {
  const { showToast } = window.CMS.utils;
  const DASH = window.DASH;
  const API = DASH.API;

  const ingestForm = document.getElementById('ingest-form');
  const ingestUrl = document.getElementById('ingest-url');
  const ingestName = document.getElementById('ingest-name');
  const ingestHtml = document.getElementById('ingest-html');
  const btnIngest = document.getElementById('btn-ingest');
  const ingestStatus = document.getElementById('ingest-status');
  const ingestSection = document.getElementById('ingest-section');

  ingestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = ingestUrl.value.trim();
    const name = ingestName.value.trim();
    const html = ingestHtml.value.trim();

    if (!url && !html) {
      return showToast('Enter a URL or paste HTML', 'error');
    }

    btnIngest.disabled = true;
    btnIngest.textContent = 'Ingesting...';
    ingestStatus.textContent = 'Fetching and parsing site...';
    ingestStatus.className = 'ingest-status';
    ingestStatus.classList.remove('hidden');

    try {
      const body = { name: name || undefined };
      if (html) {
        body.html = html;
        if (url) body.url = url;
      } else {
        body.url = url;
      }

      const res = await fetch(`${API}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok) {
        ingestStatus.classList.add('hidden');
        ingestUrl.value = '';
        ingestName.value = '';
        ingestHtml.value = '';
        if (ingestSection) ingestSection.classList.add('hidden');
        showToast(`Site ingested: ${data.slotCount} slots found`, 'success');
        DASH.fn.loadSites();
      } else {
        ingestStatus.textContent = data.error?.message || 'Ingest failed';
        ingestStatus.classList.add('error');
      }
    } catch (err) {
      ingestStatus.textContent = 'Connection error';
      ingestStatus.classList.add('error');
    } finally {
      btnIngest.disabled = false;
      btnIngest.textContent = 'Ingest';
    }
  });
})();
