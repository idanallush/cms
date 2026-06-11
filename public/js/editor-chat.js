(function (CMS) {
  const { showToast, escapeHtml, sanitizeHtml } = CMS.utils;
  const state = CMS.state;
  const refs = CMS.refs;
  const fn = CMS.fn;

  if (!state.siteId) return;

  const btnClearChat = document.getElementById('btn-clear-chat');

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
    refs.chatInput.setAttribute('placeholder', chatPlaceholders[0]);
    placeholderInterval = setInterval(() => {
      placeholderIndex = (placeholderIndex + 1) % chatPlaceholders.length;
      refs.chatInput.setAttribute('placeholder', chatPlaceholders[placeholderIndex]);
    }, 3000);
  }

  function stopPlaceholderRotation() {
    if (placeholderInterval) {
      clearInterval(placeholderInterval);
      placeholderInterval = null;
    }
  }

  function formatTime() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  refs.btnChat.addEventListener('click', () => {
    const isHidden = refs.chatPanel.classList.contains('hidden');
    refs.chatPanel.classList.toggle('hidden');
    if (isHidden) {
      refs.chatInput.focus();
      startPlaceholderRotation();
    } else {
      stopPlaceholderRotation();
    }
  });

  refs.btnCloseChat.addEventListener('click', () => {
    refs.chatPanel.classList.add('hidden');
    stopPlaceholderRotation();
  });

  btnClearChat.addEventListener('click', () => {
    refs.chatMessages.innerHTML = '';
    const msg = document.createElement('div');
    msg.className = 'chat-msg chat-msg-system';
    msg.textContent = 'Tell me what you\'d like to change on the site.';
    refs.chatMessages.appendChild(msg);
  });

  refs.chatInput.addEventListener('input', () => {
    refs.btnSendChat.disabled = refs.chatInput.value.trim().length === 0;
    refs.chatInput.style.height = 'auto';
    refs.chatInput.style.height = Math.min(refs.chatInput.scrollHeight, 120) + 'px';
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

    refs.chatMessages.appendChild(msg);
    refs.chatMessages.scrollTop = refs.chatMessages.scrollHeight;
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
    refs.chatMessages.appendChild(wrapper);
    refs.chatMessages.scrollTop = refs.chatMessages.scrollHeight;
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
      const slot = state.contentMap[slotId];
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

    refs.chatMessages.appendChild(card);
    refs.chatMessages.scrollTop = refs.chatMessages.scrollHeight;
  }

  async function sendChatMessage() {
    const message = refs.chatInput.value.trim();
    if (!message) return;

    refs.chatInput.value = '';
    refs.chatInput.style.height = 'auto';
    refs.btnSendChat.disabled = true;
    refs.btnSendChat.classList.add('loading');

    addChatMessage(message, 'user');
    showThinkingIndicator();

    try {
      const res = await fetch(`${state.API}/chat`, {
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
            if (state.contentMap[slotId]) {
              const oldValue = state.contentMap[slotId].value;
              fn.addPendingChange(slotId, oldValue, newValue);

              const doc = refs.iframe.contentDocument;
              if (doc) {
                const el = doc.querySelector(`[data-slot-id*="${slotId}"]`);
                if (el) {
                  const slot = state.contentMap[slotId];
                  if (slot.type === 'richtext') el.innerHTML = sanitizeHtml(newValue);
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
      refs.btnSendChat.disabled = refs.chatInput.value.trim().length === 0;
      refs.btnSendChat.classList.remove('loading');
    }
  }

  refs.btnSendChat.addEventListener('click', sendChatMessage);
  refs.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
})(window.CMS);
