import * as store from '../storage/index.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

async function getAiConfig() {
  const settings = await store.getAllSettings();
  const provider = settings.ai_provider || 'openrouter';
  const model = settings.ai_model || 'anthropic/claude-sonnet-4.5';
  const apiKey = settings.openrouter_api_key || process.env.OPENROUTER_API_KEY;
  return { provider, model, apiKey };
}

export async function processChat(siteId, userMessage) {
  const { provider, model, apiKey: OPENROUTER_API_KEY } = await getAiConfig();

  if (!OPENROUTER_API_KEY) {
    throw new Error('AI API key not configured. Add one in the Config panel.');
  }

  const content = await store.getContent(siteId);
  if (!content) throw new Error('Site has no content');

  // Build a simplified slot map for the AI
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

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
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
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`AI API failed: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  const aiResponse = data.choices?.[0]?.message?.content;

  if (!aiResponse) {
    throw new Error('No response from AI');
  }

  // Parse AI response
  let parsed;
  try {
    // Strip potential markdown code blocks
    const cleaned = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    // If AI didn't return valid JSON, treat as a text message
    return {
      changes: {},
      message: aiResponse,
      applied: false,
    };
  }

  const changes = parsed.changes || {};
  const message = parsed.message || 'Changes applied';

  // Validate that referenced slots actually exist
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
