window.CMS = window.CMS || {};
window.CMS.utils = {};

(function (utils) {
  utils.showToast = function (message, type) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  };

  utils.apiFetch = async function (url, options = {}) {
    try {
      const res = await fetch(url, { credentials: 'include', ...options });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const message = errorData.error?.message || errorData.message || `Request failed (${res.status})`;
        utils.showToast(message, 'error');
        return null;
      }
      return await res.json();
    } catch (err) {
      utils.showToast('Network error — check your connection', 'error');
      console.error('[apiFetch]', url, err);
      return null;
    }
  };

  utils.escapeHtml = function (str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  utils.escapeAttr = function (str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  };

  utils.stripHtml = function (str) {
    if (!str) return '';
    return str.replace(/<[^>]*>/g, '').trim();
  };

  utils.sanitizeHtml = function (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,iframe,object,embed,form,link[rel="import"]').forEach(el => el.remove());
    doc.querySelectorAll('*').forEach(el => {
      for (const attr of [...el.attributes]) {
        if (attr.name.startsWith('on') || (attr.name === 'href' && attr.value.trim().toLowerCase().startsWith('javascript:'))) {
          el.removeAttribute(attr.name);
        }
      }
    });
    return doc.body.innerHTML;
  };

  utils.formatDate = function (isoStr) {
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
  };
})(window.CMS.utils);
