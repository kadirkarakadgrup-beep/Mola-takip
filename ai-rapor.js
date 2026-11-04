// 🤖 Rapor modülü v3
// 1) Görseli telefonda OCR ile okur (görsel internete gönderilmez, "Failed to fetch" olmaz)
// 2) Ürün ADLARINI (küçük bir metin listesi) Gemini'ye gönderip gruplara ayırtır
// 3) Gemini'ye ulaşılamazsa anahtar kelime kurallarıyla gruplar
// 4) Toplamları kod hesaplar: Personel x Grup (Bira, Kokteyl, Kahve, Tatlı, Başlangıç, Yemek, Diğer) + Toplam
// index.html'de gas-shim.js satırının HEMEN ALTINA: <script src="ai-rapor.js"></script>
(function () {
window.addEventListener('load', function () {

const GR = ['Bira', 'Kokteyl', 'Türk Kahvesi', 'Filtre Kahve', 'Kahve', 'Çay', 'Sıcak İçecek', 'Tatlı', 'Başlangıç', 'Yemek', 'Diğer'];
const fmt = n => Number(n).toLocaleString('tr-TR');
const nu = s => parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
const fold = s => String(s || '').replace(/İ/g, 'I').replace(/ı/g, 'i').toUpperCase().replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C').replace(/\s+/g, ' ').trim();

// ---- Yedek kural listesi (Gemini çalışmazsa bunlar kullanılır) ----
const RX = [
  ['Bira', /EFES|PILSEN|MALT|CORONA|MILLER|BOMONTI|\bBUD\b|GUINNESS|HEINEKEN|TUBORG|CARLSBERG|BIRA|FICI|FILTRESIZ|WHE+L|KMPN/],
  ['Kokteyl', /MOJITO|MARGARITA|COSMOPOLITAN|LONG ISLAND|ICE TEA|APEROL|SPRITZ|MARTINI|ZESTY|VELVET|PINA|COLADA|KOKTEYL|NEGRONI|DAIQUIRI|CAIPIRINHA|BLOODY|SOUR|SEX ON|COCKTAIL|SANGRIA|MIMOSA|BELLINI/],
  ['Türk Kahvesi', /TURK\s*KAH/],
  ['Filtre Kahve', /FILI?TRE\s*KAH/],
  ['Çay', /\bCAY\b/],
  ['Sıcak İçecek', /CHAI|SICAK CIKOLATA|SAHLEP|SALEP/],
  ['Kahve', /KAHVE|COFFEE|ESPRESSO|LATTE|CAPPUCCINO|AMERICANO|MOCHA|NESCAFE|FRAPPE|MACCHIATO|FLAT WHITE|CORTADO/],
  ['Tatlı', /TATLI|CHEESECAKE|SUFLE|TIRAMISU|BROWNIE|WAFFLE|DONDURMA|SAN SEBASTIAN|PROFITEROL|BAKLAVA|KUNEFE|SUTLAC|TRILECE|CHURROS|PASTA\b|KEK\b|LAVA|FONDANT|MAGNOLIA/],
  ['Başlangıç', /BASLANGIC|CHICKEN|NACOS|NACHOS|MAC AND CHEESE|CHURROS|QUESADILLA|COMBO|FONDU|PARMAK|CORBA|SALATA|MEZE|PATATES|SOGAN|NACHOS|CITIR|KANAT|PEYNIR|BRUSCHETTA|HUMMUS|SIGARA|BOREK|ATISTIRMALIK/],
  ['Yemek', /BURGER|PIZZA|MAKARNA|PENNE|SPAGHETTI|TAVUK|STEAK|BIFTEK|KOFTE|SANDVIC|SANDWICH|DURUM|WRAP|KUZU|KARIDES|BALIK|SNITZEL|PILAV|YEMEK|IZGARA|SOTE|TOST|OMLET|MENEMEN/]
];
const hot = n => {   // 2201xxx = sıcak içecekler, alt grubu ürün adından
  const x = fold(n);
  if (/TURK\s*KAH/.test(x)) return 'Türk Kahvesi';
  if (/FILI?TRE/.test(x)) return 'Filtre Kahve';
  if (/\bCAY\b/.test(x)) return 'Çay';
  if (/CHAI|SICAK CIKOLATA|SAHLEP|SALEP/.test(x)) return 'Sıcak İçecek';
  if (/AMERICANO|LATTE|MOCHA|CAPP?UCCINO|CAPUCINO|ESPRESSO|NES ?CAFE|CAFE|MACCHIATO|KAHVE/.test(x)) return 'Kahve';
  return 'Sıcak İçecek';
};
const byCode = (c, n) => /^2500/.test(c) ? 'Bira' : (/^2512/.test(c) ? 'Kokteyl' : (/^2201/.test(c) ? hot(n) : (/^2003/.test(c) ? 'Başlangıç' : (/^2013/.test(c) ? 'Tatlı' : ''))));
const rule = (code, name) => { const c = byCode(String(code || ''), name); if (c) return c; const n = fold(name); for (const r of RX) if (r[1].test(n)) return r[0]; return 'Diğer'; };

const known = () => (typeof D !== 'undefined' && D && D.staff) || [];
const match = n => {
  const k = nrm(n); if (k.length < 4) return null;
  const st = known();
  return st.find(x => nrm(x.name) == k) || st.find(x => typeof lev == 'function' && lev(k, nrm(x.name)) <= Math.floor(nrm(x.name).length * .25)) || null;
};

// ---- Gemini: sadece ürün adı listesi gider ----
async function gem(key, list, note) {
  const models = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
  const prompt = 'Aşağıda bir restoran/kafe kasa programından ürün adları var. Her ürünü şu gruplardan SADECE birine ata: ' + GR.join(', ') + '. Türk kahvesi ayrı grup (Türk Kahvesi), filtre kahve ayrı grup (Filtre Kahve); espresso bazlı kahveler (americano, latte, mocha, cappuccino, espresso, nescafe) Kahve; bardak/fincan çay Çay; sıcak çikolata, salep, chai tea latte Sıcak İçecek. Su, gazlı/gazsız içecek, meyve suyu, sigara vb. "Diğer" olsun.' + (note ? '\nKullanıcı notu: ' + note : '') + '\nYanıtı yalnızca JSON nesnesi olarak ver, anahtar ürün adı (aynen), değer grup: {"ÜRÜN ADI":"Grup"}\n\nÜrünler:\n' + list.join('\n');
  let last = '';
  for (let at = 0; at < 3; at++) {
    let busy = false;
    for (const m of models) {
      const gc = { temperature: 0, responseMimeType: 'application/json' };
      if (m.indexOf('2.5') >= 0) gc.thinkingConfig = { thinkingBudget: 0 };
      const ac = new AbortController(), to = setTimeout(() => ac.abort(), 40000);
      let r;
      try {
        r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + encodeURIComponent(key), {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal,
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: gc })
        });
      } catch (e) { clearTimeout(to); throw new Error(e.name == 'AbortError' ? 'zaman aşımı' : 'bağlantı kurulamadı'); }
      clearTimeout(to);
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        const p = (((j.candidates || [])[0] || {}).content || {}).parts;
        if (!p) { last = 'boş yanıt'; continue; }
        try { return JSON.parse(p.map(x => x.text || '').join('').replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim()); } catch (e) { last = 'yanıt okunamadı'; continue; }
      }
      last = (j.error && j.error.message) || ('HTTP ' + r.status);
      if (r.status === 429) throw new Error('kullanım sınırı (429), biraz sonra tekrar dene');
      if (r.status === 503 || r.status === 500) { busy = true; continue; }   // yoğunluk: sıradaki modeli dene
      if (r.status !== 404) throw new Error(last);
    }
    if (!busy) break;
    await new Promise(res => setTimeout(res, 2500));                       // biraz bekle, tekrar dene
  }
  throw new Error(last);
}
async function classify(names, note) {
  const map = {};
  if (!names.length) return { map: map, info: '' };
  let key = ''; try { key = localStorage.getItem('mola_gemini_key') || ''; } catch (e) {}
  if (!key) return { map: map, info: '⚠ Gemini anahtarı yok, ürünler anahtar kelime kurallarıyla gruplandı (⚙ Ayarlar → 🔑 Gemini anahtarı).' };
  try {
    const r = await gem(key, names, note), lk = {};
    Object.keys(r || {}).forEach(k => { lk[fold(k)] = r[k]; });
    let n = 0;
    names.forEach(nm => { const v = lk[fold(nm)], g = GR.find(x => fold(x) == fold(v)); if (g) { map[fold(nm)] = g; n++; } });
    return { map: map, info: '✓ Ürün grupları Gemini ile belirlendi (' + n + '/' + names.length + ' ürün).' };
  } catch (e) { return { map: map, info: '⚠ Gemini\'ye ulaşılamadı (' + e.message + '), ürünler anahtar kelime kurallarıyla gruplandı.' }; }
}

// ---- Sayfa okuma (OCR kelimeleri -> personel / ürün satırları) ----
function parse(pages) {
  const staff = [], notes = [];
  let cur = null, grand = null;
  const qre = /^\d{1,3}(?:\.\d{3})*,\d{3}$/, are = /^\d{1,3}(?:\.\d{3})*,\d{2}$/, BRW = ['hm', 'izmir', 'optimum', 'mavi', 'bahce'];
  const fix = t => (/^[\dOoIl.,]+$/.test(t) && /\d/.test(t)) ? t.replace(/[Oo]/g, '0').replace(/[Il]/g, '1') : t;
  const open = () => { cur = { name: '?', items: [], sum: 0, tot: null }; staff.push(cur); };
  const letters = s => String(s).replace(/[^A-Za-z]/g, '').length;
  pages.forEach(pg => {
    const W = pg.W.map(w => Object.assign({}, w, { t: fix(w.t) }));
    if (!W.length) return;
    const mk = W.filter(w => { const n = nrm(w.t); return n == 'miktar' || n == 'tutar'; }).sort((a, b) => a.y - b.y)[0];
    const hdr = mk ? W.filter(w => nrm(w.t) == 'urun' && Math.abs(w.y - mk.y) < mk.h * 1.5).sort((a, b) => a.x0 - b.x0)[0] : null;
    const codes = W.filter(w => /^\d{7}$/.test(w.t)).map(w => w.x0).sort((a, b) => a - b);
    let cx = hdr ? hdr.x0 : (codes.length ? codes[codes.length >> 1] : 0);
    if (!cx) { notes.push('Bir sayfada tablo başlığı bulunamadı, o sayfa atlandı'); return; }
    cx -= 8;
    const sb = mk ? W.filter(w => nrm(w.t) == 'sube' && Math.abs(w.y - mk.y) < mk.h * 1.5)[0] : null, sx = sb ? sb.x0 - 6 : 1e9;
    const topY = mk ? mk.y + mk.h : 0, hs = W.map(w => w.h).sort((a, b) => a - b), H = hs[hs.length >> 1] || 12, L = [];
    W.filter(w => w.y > topY).sort((a, b) => a.y - b.y).forEach(w => {
      const l = L[L.length - 1];
      if (l && Math.abs(w.y - l.y) < H * .6) { l.w.push(w); l.y = (l.y * (l.w.length - 1) + w.y) / l.w.length; } else L.push({ y: w.y, w: [w] });
    });
    let last = null;
    L.forEach(l => {
      const t = l.w.sort((a, b) => a.x0 - b.x0), left = t.filter(w => w.x0 < cx), right = t.filter(w => w.x0 >= cx);
      const idw = left.find(w => w.t.length <= 8 && /\d{1,2}-\d{1,3}/.test(w.t));
      const nmL = left.filter(w => w !== idw).map(w => w.t.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '')).filter(x => x.length > 1).join(' ');
      if (idw || nmL.length >= 4) { open(); cur.name = nmL || '?'; last = null; }
      const code = right.find(w => /^\d{7}$/.test(w.t));
      const q = right.filter(w => qre.test(w.t)).pop(), a = right.filter(w => are.test(w.t)).pop();
      const pn = right.filter(w => w !== code && w !== q && w !== a && w.x0 < sx && !/^(HM|I?ZMIR|1ZMIR|OPTIMUM|OPTIMUN|MAVI|BAHCE)$/.test(fold(w.t))).map(w => w.t).join(' ').replace(/\s+/g, ' ').trim();
      const qv = q ? nu(q.t) : NaN, av = a ? nu(a.t) : NaN;
      if (q && !code && letters(pn) < 2) {                 // sarı toplam satırı
        if (cur && cur.tot == null) cur.tot = qv; else grand = qv;
        last = null; return;
      }
      if (q && (code || letters(pn) >= 3)) {               // ürün satırı
        if (!cur || cur.tot != null) open();
        const it = { code: code ? code.t : '', pn: pn, q: qv, wh: (av === 0 && qv > 0 && /^2500/.test(code ? code.t : '')) || /WHE+L|KMPN/i.test(pn) };
        cur.items.push(it); cur.sum += qv; last = it;
      } else if (!q && cur && last && !last.wh && /WHE+L|KMPN/i.test(pn)) last.wh = true;   // alt satırda "WHELL KMPNY"
    });
  });
  staff.forEach(s => {
    if (!s.items.length) return;
    const nm = nice(s.name);
    if (s.tot == null) notes.push(nm + ': toplam satırı okunamadı, satırlar toplandı (kontrol edin)');
    else if (Math.abs(s.sum - s.tot) > 0.5) notes.push(nm + ': satırlar toplamı ' + fmt(s.sum) + ', rapordaki toplam ' + fmt(s.tot) + ' → kontrol edin');
  });
  return { staff: staff.filter(s => s.items.length), notes: notes, grand: grand };
}
const needNames = P => { const o = {}; P.staff.forEach(s => s.items.forEach(it => { if (!it.wh && it.q > 0 && !byCode(it.code, it.pn) && it.pn) o[fold(it.pn)] = it.pn; })); return Object.keys(o).map(k => o[k]); };

function build(P, pages, gmap, info) {
  const map = {}, order = [], other = {};
  let gsum = 0;
  P.staff.forEach(s => {
    gsum += s.sum;
    const m = match(s.name), nm = nice(m ? m.name : s.name), k = nrm(nm) || ('x' + order.length);
    const t = map[k] || (map[k] = { name: nm, g: {}, wheel: 0 });
    if (!t._in) { t._in = 1; order.push(k); }
    s.items.forEach(it => {
      if (it.wh) { t.wheel += it.q; return; }
      const g = byCode(it.code, it.pn) || gmap[fold(it.pn)] || rule(it.code, it.pn);
      t.g[g] = (t.g[g] || 0) + it.q;
      if (g == 'Diğer' && it.q > 0) other[it.pn] = 1;
    });
  });
  const used = GR.filter(g => order.some(k => map[k].g[g] > 0)), hasW = order.some(k => map[k].wheel > 0), r2 = x => Math.round(x * 100) / 100;
  const rows = order.map(k => {
    const t = map[k], v = used.map(g => r2(t.g[g] || 0));
    return [t.name].concat(v, hasW ? [r2(t.wheel)] : [], [r2(v.reduce((a, x) => a + x, 0))]);
  });
  if (rows.length) {
    const tot = ['TOPLAM'];
    for (let i = 1; i < rows[0].length; i++) tot.push(r2(rows.reduce((a, r) => a + r[i], 0)));
    rows.push(tot);
  }
  const notes = P.notes.slice();
  if (P.grand != null) {
    if (Math.abs(gsum - P.grand) > 0.5) notes.push('Garson toplamları (' + fmt(gsum) + ') raporun genel toplamından (' + fmt(P.grand) + ') farklı: bir sayfa ya da personel eksik/yanlış okunmuş olabilir');
    else if (!P.notes.length) notes.push('✓ Toplamlar rapordaki genel toplamla tuttu');
  }
  if (info) notes.push(info);
  if (hasW) notes.push('Tutarı 0,00 olan Wheel kampanyası satırları gruplara katılmadı, "Wheel" sütununda ayrı.');
  const od = Object.keys(other); if (od.length) notes.push('Diğer grubuna giren ürünler: ' + od.slice(0, 10).join(', ') + (od.length > 10 ? '…' : ''));
  const m = pages.map(p => p.text || '').join(' ').match(/Tarih\s+Aral\S{2,4}\s*:\s*([\d.]+\s*-\s*[\d.]+)/i);
  return { title: 'Ürün grupları' + (m ? ' · ' + m[1].replace(/\s+/g, '') : ''), columns: ['Personel'].concat(used, hasW ? ['Wheel'] : [], ['Toplam']), rows: rows, notes: notes.join('\n') };
}

const tbl = j => '<div style="overflow:auto"><table class="xl xl2"><tr>' + j.columns.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr>'
  + j.rows.map((r, k) => '<tr' + (k == j.rows.length - 1 ? ' class="tot"' : '') + '>' + j.columns.map((c, i) => '<td class="' + (i ? 'r' : 'l') + '">' + (typeof r[i] == 'number' ? fmt(r[i]) : esc(r[i] == null ? '' : r[i])) + '</td>').join('') + '</tr>').join('')
  + '</table></div>' + (j.notes ? '<p class="sub" style="margin:10px 2px;line-height:1.5;white-space:pre-line">ℹ ' + esc(j.notes) + '</p>' : '');

window.aiRun = async function () {
  const out = () => $('aio'), fs = window.__aif || [];
  if (!out()) return;
  if (!fs.length) { out().innerHTML = '<div class="err">Önce görselleri seç.</div>'; return; }
  try {
    if (typeof window.ocrW != 'function') throw new Error('Okuma modülü yüklenemedi');
    let note = ''; try { note = ($('aip') && $('aip').value || '').trim(); } catch (e) {}
    const pages = [];
    for (let i = 0; i < fs.length; i++) {
      if (out()) out().innerHTML = '<p class="sub">📖 Sayfa ' + (i + 1) + '/' + fs.length + ' okunuyor… (sayfa başına 10-30 sn, ekranı kapatma)</p>';
      try { OCRL = '📖 Sayfa ' + (i + 1) + '/' + fs.length; } catch (e) {}
      const o = await window.ocrW(fs[i]), m = (o.text || '').match(/Sayfa\s*(\d+)\s*\/\s*\d+/i);
      pages.push({ W: o.W, text: o.text || '', n: m ? +m[1] : null, i: i });
    }
    try { $('st').textContent = ''; } catch (e) {}
    pages.sort((a, b) => (a.n != null && b.n != null) ? a.n - b.n : a.i - b.i);
    const P = parse(pages), names = needNames(P);
    if (!P.staff.length) throw new Error('Görsellerde tablo okunamadı.\nSicil no, personel adı, Ürün No, Ürün Adı ve Miktar sütunu görünecek şekilde, sayfanın tamamını net bir ekran görüntüsü olarak yükleyin.');
    if (out()) out().innerHTML = '<p class="sub">🤖 ' + names.length + ' ürün gruplanıyor…</p>';
    const c = await classify(names, ''), j = build(P, pages, c.map, c.info);
    const ns = pages.map(p => p.n).filter(x => x != null);
    if (ns.some((n, i) => i && n != ns[i - 1] + 1)) j.notes += (j.notes ? '\n' : '') + 'Sayfa numaraları ardışık değil, eksik sayfa olabilir';
    window.__air = j;
    if (out()) out().innerHTML = tbl(j) + '<div class="shg" style="margin-top:10px"><button class="a ed" onclick="aiXlsx(window.__air)">⬇ Excel indir</button><button class="a an" onclick="aiSave()">💾 Garsonlar da görsün (kaydet)</button></div>';
  } catch (e) { try { $('st').textContent = ''; } catch (x) {} if (out()) out().innerHTML = '<div class="err" style="white-space:pre-line">' + esc(emsg(e)) + '</div>'; }
};

const hs = document.querySelector('.hs'); if (hs) hs.textContent += ' · AI6';
});
})();
