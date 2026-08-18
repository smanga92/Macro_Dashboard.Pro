import axios from 'axios';
import { getDb, generateId } from '../utils/db.js';
import { decrypt } from '../utils/crypto.js';
import { logProvider } from '../utils/logger.js';

export async function callAI(prompt, context = '') {
  const db = getDb();
  const providers = db.prepare(
    'SELECT * FROM ai_providers WHERE enabled = 1 ORDER BY priority ASC'
  ).all();

  if (providers.length === 0) {
    throw new Error('No AI providers enabled. Add and enable a provider in admin settings.');
  }

  let lastError = null;

  for (const provider of providers) {
    const start = Date.now();
    try {
      const apiKey = decrypt(provider.api_key_encrypted);
      if (!apiKey) {
        logProvider(provider.id, 'skip', `${provider.name}: no API key set`);
        continue;
      }

      const result = await callProvider(provider, apiKey, prompt, context);
      const duration = Date.now() - start;

      db.prepare(`
        UPDATE ai_providers
        SET last_used_at = CURRENT_TIMESTAMP, failure_count = 0,
            health_status = 'healthy', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(provider.id);

      logProvider(provider.id, 'success', `${provider.name} responded OK`, duration);
      return { result, provider_id: provider.id, provider_name: provider.name };

    } catch (err) {
      const duration = Date.now() - start;
      lastError = err;
      db.prepare(`
        UPDATE ai_providers
        SET failure_count = failure_count + 1,
            health_status = CASE WHEN failure_count >= 2 THEN 'unhealthy' ELSE 'degraded' END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(provider.id);
      logProvider(provider.id, 'error', `${provider.name} failed: ${err.message}`, duration);
    }
  }

  throw new Error(`All AI providers failed. Last error: ${lastError?.message}`);
}

async function callProvider(provider, apiKey, prompt, context) {
  switch (provider.provider_type) {
    case 'openai':
    case 'openai_compatible':
      return callOpenAI(provider, apiKey, prompt, context);
    case 'anthropic':
      return callAnthropic(provider, apiKey, prompt, context);
    case 'google':
      return callGoogle(provider, apiKey, prompt, context);
    default:
      throw new Error(`Unknown provider type: ${provider.provider_type}`);
  }
}

async function callOpenAI(provider, apiKey, prompt, context) {
  const baseUrl = provider.base_url || 'https://api.openai.com/v1';
  const model = provider.model || 'gpt-4o';
  const response = await axios.post(`${baseUrl}/chat/completions`, {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: context ? `${context}\n\n${prompt}` : prompt }
    ],
    temperature: 0.3,
    max_tokens: 4000,
  }, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 60000,
  });
  return response.data.choices[0].message.content;
}

async function callAnthropic(provider, apiKey, prompt, context) {
  const model = provider.model || 'claude-sonnet-4-6';
  const response = await axios.post('https://api.anthropic.com/v1/messages', {
    model,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: context ? `${context}\n\n${prompt}` : prompt }],
  }, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    timeout: 60000,
  });
  return response.data.content[0].text;
}

async function callGoogle(provider, apiKey, prompt, context) {
  const model = provider.model || 'gemini-1.5-pro';
  const fullPrompt = context ? `${SYSTEM_PROMPT}\n\n${context}\n\n${prompt}` : `${SYSTEM_PROMPT}\n\n${prompt}`;
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4000 } },
    { timeout: 60000 }
  );
  return response.data.candidates[0].content.parts[0].text;
}

export const SYSTEM_PROMPT = `You are a senior macro analyst. Your job is to interpret macroeconomic conditions for a set of assets and produce structured, analyst-quality signals.

You must:
- Assess each asset's macro bias using these states ONLY: bullish, bearish, neutral, watch, unconfirmed
- "watch" means early signs of change, not yet confirmed
- "unconfirmed" means a move occurred but supporting macro factors have not aligned
- Never force a strong bullish or bearish label if evidence is mixed
- Consider: USD direction, real yields, inflation surprise risk, central bank tone, growth momentum, liquidity conditions, risk sentiment, geopolitical risk, commodity pressure
- For GER40, weight euro-area growth and ECB tone most heavily
- Write in a professional but direct analyst voice

Your response MUST be valid JSON matching this exact structure:
{
  "regime_summary": "one paragraph describing the overall macro regime",
  "assets": [
    {
      "symbol": "USD",
      "bias": "bullish|bearish|neutral|watch|unconfirmed",
      "confirmed": true|false,
      "drivers": ["driver 1", "driver 2"],
      "what_changed": "what shifted recently",
      "what_would_flip": "what evidence would change this bias",
      "next_event": "next key event to watch",
      "analyst_note": "one clear sentence conclusion in analyst voice"
    }
  ]
}

Return ONLY the JSON. No preamble, no explanation outside the JSON.`;

export function buildMorningPrompt(assets, headlines, calendarEvents) {
  return `MORNING MACRO DASHBOARD — ${new Date().toUTCString()}

ASSETS TO ASSESS: ${assets.map(a => a.symbol).join(', ')}

UPCOMING CALENDAR EVENTS (next 24h):
${calendarEvents.slice(0, 20).map(e =>
  `- ${e.event_time}: [${e.currency}] ${e.event_name} (Impact: ${e.impact || 'unknown'}) | Forecast: ${e.forecast || 'n/a'} | Previous: ${e.previous || 'n/a'}`
).join('\n') || 'None available'}

RECENT NEWS HEADLINES:
${headlines.slice(0, 15).map(h => `- ${h}`).join('\n') || 'None available'}

Assess each asset's macro bias. Flag any asset where the bias is early or unconfirmed.`;
}

export function buildPostEventPrompt(assets, event, headlines, previousSignals) {
  return `POST-EVENT MACRO REASSESSMENT — ${new Date().toUTCString()}

EVENT: ${event.event_name} [${event.currency}]
Time: ${event.event_time}
Actual: ${event.actual || 'n/a'} | Forecast: ${event.forecast || 'n/a'} | Previous: ${event.previous || 'n/a'}
Impact: ${event.impact || 'unknown'}

PRE-EVENT SIGNALS:
${previousSignals.map(s => `${s.symbol}: ${s.bias} (${s.confirmed ? 'confirmed' : 'unconfirmed'})`).join('\n') || 'None'}

RECENT HEADLINES:
${headlines.slice(0, 10).map(h => `- ${h}`).join('\n') || 'None available'}

ASSETS TO REASSESS: ${assets.map(a => a.symbol).join(', ')}

Reassess each asset given the event outcome. Note whether the surprise (actual vs forecast) confirms or invalidates existing signals.`;
}
