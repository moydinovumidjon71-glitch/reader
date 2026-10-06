// Project Gutenberg'dan kitob qidiradi (?q=...) yoki matnini yuklaydi (?id=...)
const UA = { 'User-Agent': 'Mozilla/5.0 (reader-app)' };

const reply = (code, body) => ({
  statusCode: code,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': code === 200 ? 'public, max-age=86400' : 'no-store',
  },
  body: JSON.stringify(body),
});

async function get(url, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { headers: UA, signal: c.signal, redirect: 'follow' });
  } finally {
    clearTimeout(t);
  }
}

const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

// 1-yo'l: Gutendex
async function searchGutendex(q) {
  const res = await get(
    `https://gutendex.com/books/?languages=en&search=${encodeURIComponent(q)}`,
    4500
  );
  if (!res.ok) throw new Error('gutendex ' + res.status);
  const d = await res.json();
  return (d.results || [])
    .filter((b) => (b.formats || {})['text/plain; charset=utf-8'] || (b.formats || {})['text/plain; charset=us-ascii'] || (b.formats || {})['text/plain'])
    .slice(0, 12)
    .map((b) => ({
      id: b.id,
      title: b.title,
      author: (b.authors[0] && b.authors[0].name) || '',
    }));
}

// 2-yo'l (zaxira): Gutenberg'ning o'z qidiruvi
async function searchOpds(q) {
  const res = await get(
    `https://www.gutenberg.org/ebooks/search.opds/?query=${encodeURIComponent(q)}`,
    5500
  );
  if (!res.ok) throw new Error('gutenberg ' + res.status);
  const xml = await res.text();
  const out = [];
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml)) && out.length < 12) {
    const idm = m[1].match(/ebooks\/(\d+)(?:\.opds)?</);
    const tm = m[1].match(/<title>([^<]*)<\/title>/);
    if (!idm || !tm) continue;
    const am = m[1].match(/<content[^>]*>([^<]*)<\/content>/);
    out.push({ id: Number(idm[1]), title: decode(tm[1]), author: am ? decode(am[1]) : '' });
  }
  return out;
}

async function loadText(id) {
  const urls = [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
    `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`,
  ];
  for (const u of urls) {
    try {
      const r = await get(u, 6000);
      if (r.ok) return await r.text();
    } catch (e) { /* keyingisini sinaymiz */ }
  }
  throw new Error('Gutenberg matnni bermadi');
}

exports.handler = async (event) => {
  const { q, id } = event.queryStringParameters || {};
  try {
    // Kitob matnini olish
    if (id) {
      if (!/^\d+$/.test(id)) return reply(400, { error: 'Noto\'g\'ri kitob raqami' });
      let text = (await loadText(id)).replace(/\r/g, '');

      const title = ((text.match(/^Title:\s*(.+)$/mi) || [])[1] || 'Kitob ' + id).trim();
      const author = ((text.match(/^Author:\s*(.+)$/mi) || [])[1] || '').trim();

      const s = text.match(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/i);
      if (s) text = text.slice(s.index + s[0].length);
      const e = text.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/i);
      if (e > -1) text = text.slice(0, e);
      text = text.trim();

      if (text.length > 4500000) {
        return reply(413, { error: 'Bu kitob juda katta. Alohida hikoya tanlang.' });
      }
      return reply(200, { id: Number(id), title, author, text });
    }

    // Qidirish
    if (q && q.trim()) {
      const errs = [];
      let results = null;
      try { results = await searchGutendex(q.trim()); } catch (e) { errs.push(e.message); }
      if (!results || !results.length) {
        try {
          const alt = await searchOpds(q.trim());
          if (alt.length) results = alt;
        } catch (e) { errs.push(e.message); }
      }
      if (results) return reply(200, { results });
      return reply(502, { error: 'Qidiruv ishlamadi (' + errs.join('; ') + '). Birozdan so\'ng qayta urinib ko\'ring.' });
    }

    return reply(400, { error: 'Qidiruv so\'zi yoki kitob raqami kerak' });
  } catch (err) {
    return reply(500, { error: 'Server xatosi: ' + err.message });
  }
};
