// Matnni A1/A2 darajadagi sodda inglizchaga o'tkazadi (Gemini API orqali).
// Netlify'da kerak: GEMINI_API_KEY (majburiy), GEMINI_MODEL (ixtiyoriy)

const reply = (code, body) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

const RULES = {
  a1:
    'CEFR A1 level (absolute beginner). Sentences of 5-10 words. Only simple present and simple past. ' +
    'Use only very common everyday words (about the 1000 most common English words). ' +
    'No idioms, no passive voice, no relative clauses, no long descriptions. ' +
    'Replace every difficult word with a simple one.',
  a2:
    'CEFR A2 level (elementary). Sentences of 8-15 words. Simple past, present and future; simple connectors such as and, but, because, then. ' +
    'Use common words. Avoid idioms and rare words. Replace difficult words with simple ones.',
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'POST kerak' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return reply(500, { error: 'GEMINI_API_KEY Netlify\'da sozlanmagan.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return reply(400, { error: 'Noto\'g\'ri so\'rov' }); }
  const { text, level } = body;
  if (!text || typeof text !== 'string' || text.length > 6000) {
    return reply(400, { error: 'Matn bo\'sh yoki juda uzun' });
  }
  const rules = RULES[level] || RULES.a1;

  const system =
    'You rewrite passages of classic fiction for adult learners of English. ' +
    `Target: ${rules} ` +
    'Keep the same events, the same characters, the same names and the same order. ' +
    'Keep the dark, mysterious mood. Do not add new events and do not skip important events. ' +
    'Keep dialogue as dialogue. Output exactly one paragraph for each input paragraph, separated by a blank line. ' +
    'Output ONLY the rewritten text: no title, no notes, no explanations.';

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: { temperature: 0.3 },
        }),
      }
    );
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (d.error && d.error.message) || 'Gemini javob bermadi';
      return reply(502, { error: 'Soddalashtirib bo\'lmadi: ' + msg.slice(0, 160) });
    }
    const out = (((d.candidates || [])[0] || {}).content || {}).parts;
    const result = (out || []).map((p) => p.text || '').join('').trim();
    if (!result) return reply(502, { error: 'Gemini bo\'sh javob qaytardi' });
    return reply(200, { text: result });
  } catch (err) {
    return reply(500, { error: 'Server xatosi: ' + err.message });
  }
};
