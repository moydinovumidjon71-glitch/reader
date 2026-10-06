// Project Gutenberg'dan kitob qidiradi (?q=...) yoki matnini yuklaydi (?id=...)
const UA = { 'User-Agent': 'Mozilla/5.0 (reader-app)' };

const reply = (code, body) => ({
  statusCode: code,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=86400',
  },
  body: JSON.stringify(body),
});

const textUrl = (f) =>
  f['text/plain; charset=utf-8'] ||
  f['text/plain; charset=us-ascii'] ||
  f['text/plain'];

exports.handler = async (event) => {
  const { q, id } = event.queryStringParameters || {};
  try {
    // 1) Kitob matnini olish
    if (id) {
      if (!/^\d+$/.test(id)) return reply(400, { error: 'Noto\'g\'ri kitob raqami' });
      const meta = await fetch(`https://gutendex.com/books/${id}`, { headers: UA });
      if (!meta.ok) return reply(404, { error: 'Kitob topilmadi' });
      const b = await meta.json();
      const url = textUrl(b.formats || {});
      if (!url) return reply(404, { error: 'Bu kitobning matn varianti yo\'q' });

      const res = await fetch(url, { headers: UA });
      if (!res.ok) return reply(502, { error: 'Gutenberg matnni bermadi' });
      let text = (await res.text()).replace(/\r/g, '');

      const s = text.match(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/i);
      if (s) text = text.slice(s.index + s[0].length);
      const e = text.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/i);
      if (e > -1) text = text.slice(0, e);
      text = text.trim();

      if (text.length > 4500000) {
        return reply(413, { error: 'Bu kitob juda katta. Alohida hikoya tanlang.' });
      }
      return reply(200, {
        id: b.id,
        title: b.title,
        author: (b.authors[0] && b.authors[0].name) || '',
        text,
      });
    }

    // 2) Qidirish
    if (q && q.trim()) {
      const res = await fetch(
        `https://gutendex.com/books/?languages=en&search=${encodeURIComponent(q.trim())}`,
        { headers: UA }
      );
      if (!res.ok) return reply(502, { error: 'Qidiruv xizmati javob bermadi' });
      const d = await res.json();
      const results = (d.results || [])
        .filter((b) => textUrl(b.formats || {}))
        .slice(0, 12)
        .map((b) => ({
          id: b.id,
          title: b.title,
          author: (b.authors[0] && b.authors[0].name) || '',
        }));
      return reply(200, { results });
    }

    return reply(400, { error: 'Qidiruv so\'zi yoki kitob raqami kerak' });
  } catch (err) {
    return reply(500, { error: 'Server xatosi: ' + err.message });
  }
};
