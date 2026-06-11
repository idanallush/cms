import * as store from '../storage/index.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const AI_TIMEOUT = 30000;

async function getAiConfig() {
  const settings = await store.getAllSettings();
  const provider = settings.ai_provider || 'openrouter';
  const model = settings.ai_model || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  const apiKey = settings.openrouter_api_key || process.env.OPENROUTER_API_KEY;
  return { provider, model, apiKey };
}

export async function processChat(siteId, userMessage) {
  let apiKey;
  try {
    const config = await getAiConfig();
    apiKey = config.apiKey;
    var { model } = config;
  } catch (err) {
    console.error('[aiChat] Error loading config:', err.message);
    throw new Error('AI editing temporarily unavailable. Could not load configuration.');
  }

  if (!apiKey) {
    throw new Error('AI API key not configured. Add one in the Config panel.');
  }

  const content = await store.getContent(siteId);
  if (!content) throw new Error('Site has no content');

  const slotSummary = {};
  for (const [slotId, slot] of Object.entries(content)) {
    slotSummary[slotId] = {
      type: slot.type,
      tag: slot.tag,
      currentValue: slot.value,
    };
  }

  const systemPrompt = `You are an AI assistant that helps edit website content through a CMS.
The website has editable content slots. Each slot has an ID, type (text/image/link), HTML tag, and current value.

When the user asks to change content, respond with a JSON object containing:
1. "changes": an object mapping slot IDs to their new values
2. "message": a brief description of what you changed

Rules:
- Only modify slots that match what the user is asking to change
- For text slots: provide plain text only, no HTML tags
- For image slots: provide a valid https:// URL
- For link slots: provide a valid URL or relative path
- If you can't find a matching slot, set "changes" to {} and explain in "message"
- Be conservative: only change what's explicitly requested
- Match by content/context, not by slot ID names

IMPORTANT: Always respond with valid JSON only. No markdown, no code blocks. Just the JSON object.

Current content slots:
${JSON.stringify(slotSummary, null, 2)}`;

  let res;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT);

    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://client-cms.vercel.app',
        'X-Title': 'Client CMS',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[aiChat] Request timed out after 30s');
      throw new Error('AI request timed out. Try a simpler request or try again later.');
    }
    console.error('[aiChat] Network error:', err.message);
    throw new Error('AI editing temporarily unavailable. Check your network connection.');
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    if (res.status === 401) {
      console.error('[aiChat] Invalid API key');
      throw new Error('AI API key is invalid. Update it in the Config panel.');
    }
    if (res.status === 429) {
      console.error('[aiChat] Rate limited');
      throw new Error('AI rate limit reached. Wait a moment and try again.');
    }
    console.error(`[aiChat] API error ${res.status}:`, errBody);
    throw new Error(`AI API failed: ${errBody.error?.message || res.statusText}`);
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    console.error('[aiChat] Invalid JSON response from API');
    throw new Error('AI returned an invalid response. Try again.');
  }

  const aiResponse = data.choices?.[0]?.message?.content;

  if (!aiResponse) {
    throw new Error('No response from AI');
  }

  let parsed;
  try {
    const cleaned = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      changes: {},
      message: aiResponse,
      applied: false,
    };
  }

  const changes = parsed.changes || {};
  const message = parsed.message || 'Changes applied';

  const validChanges = {};
  const invalidSlots = [];

  for (const [slotId, newValue] of Object.entries(changes)) {
    if (content[slotId]) {
      validChanges[slotId] = newValue;
    } else {
      invalidSlots.push(slotId);
    }
  }

  return {
    changes: validChanges,
    message,
    applied: Object.keys(validChanges).length > 0,
    invalidSlots: invalidSlots.length > 0 ? invalidSlots : undefined,
  };
}
