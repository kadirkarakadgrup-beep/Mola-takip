(function(){
// Mola Takip - Firebase Firestore arka ucu. index.html'deki google.script.run çağrılarını karşılar.
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD_Bl_RC8xzscXA3-GP8X2tdBi6tFhCs8E',
  authDomain: 'mola-takip-7fc53.firebaseapp.com',
  projectId: 'mola-takip-7fc53',
  appId: '1:130287831940:web:c3a804d90a0225231b2bd1'
};
const CFG = {
  PIN: '1234',                          // Yönetici şifresi (DEĞİŞTİR!)
  NTFY_PREFIX: 'mola-DEGISTIR-123xyz',  // Telefonlardaki ntfy kodlarıyla aynı kalmalı (benzersiz yap)
  SEQ: {
    opt: [{ k: 'mola', n: 'Çay Molası', d: 20 }, { k: 'yemek', n: 'Öğlen Yemeği', d: 30 }, { k: 'mola', n: 'Çay Molası', d: 20 }],
    mavi: [{ k: 'mola', n: 'Çay Molası', d: 20 }, { k: 'yemek', n: 'Öğlen Yemeği', d: 40 }, { k: 'mola', n: 'Çay Molası', d: 20 }]
  },
  MAIN: { from: 11, to: 20 },
  EXTRA: [
    { k: 'kahvalti', n: 'Kahvaltı Molası', d: 15, from: 9, to: 12 },
    { k: 'aksam', n: 'Akşam Yemeği', d: 15, from: 20, to: 23 }
  ]
};

(function(){var h=document.head,l=function(r,a){var e=document.createElement('link');e.rel=r;for(var k in a)e.setAttribute(k,a[k]);h.appendChild(e);};l('manifest',{href:'manifest.json'});l('apple-touch-icon',{href:'hm192.png'});l('icon',{href:'hm192.png',type:'image/png'});})();
firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();
const ready = firebase.auth().signInAnonymously();
const col = n => db.collection(n);

// ---------- yardımcılar ----------
const TZ = 'Europe/Istanbul';
function tp_(d) {
  const o = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour12: false })
    .formatToParts(d || new Date()).forEach(x => o[x.type] = x.value);
  return o;
}
const today_ = d => { const o = tp_(d); return o.year + o.month + o.day; };
const md_ = () => { const o = tp_(); return (+o.hour % 24) * 60 + +o.minute; };
const wd_ = () => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(tp_().weekday);
const copy_ = o => JSON.parse(JSON.stringify(o));
const auth_ = pin => { if (String(pin) !== String(CFG.PIN)) throw new Error('Şifre yanlış'); };
const checkPin_ = pin => String(pin) === String(CFG.PIN);
const total_ = b => (CFG.SEQ[b] || CFG.SEQ.opt).reduce((a, q) => a + q.d, 0);
const mins_ = x => Number(x && typeof x === 'object' ? x.m : x) || 0;
const mainT_ = s => (s.done || []).filter(x => x && (x.k === 'mola' || x.k === 'yemek')).reduce((a, x) => a + mins_(x), 0);
const usedK_ = (s, k) => (s.done || []).filter(x => x && x.k === k).reduce((a, x) => a + mins_(x), 0);
const end_ = a => a.start + (a.pt || 0) + a.dur * 60000;
const branchName_ = b => b === 'mavi' ? 'Mavi Bahçe' : 'Optimum';
const topicOf_ = id => CFG.NTFY_PREFIX + '-' + id;
const mm_ = t => { const p = t.split(':'); return +p[0] * 60 + +p[1]; };
const names_ = () => { const o = {}; CFG.SEQ.opt.concat(CFG.EXTRA).forEach(q => o[q.k] = q.n); return o; };
function norm_(s) {
  return String(s || '').replace(/İ/g, 'i').replace(/I/g, 'i').toLowerCase().replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9]/g, '');
}
function nice_(n) {
  return String(n || '').trim().split(/\s+/).map(w => {
    const l = w.replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase();
    return l.charAt(0).replace('i', 'İ').replace('ı', 'I').toUpperCase() + l.slice(1);
  }).join(' ');
}
function phone_(n) {
  let s = String(n || '').replace(/[^\d+]/g, '');
  if (!s) return '';
  if (s[0] === '+') return s;
  if (s.indexOf('00') === 0) return '+' + s.slice(2);
  if (s[0] === '0') return '+90' + s.slice(1);
  if (s.length === 10 && s[0] === '5') return '+90' + s;
  return '+' + s;
}
function parseCell_(c) {
  const m = String(c || '').match(/(\d{1,2})(?:[:.](\d{2}))?\s*[-–—]\s*(\d{1,2})(?:[:.](\d{2}))?/);
  if (!m) return '';
  const h1 = +m[1], i1 = +(m[2] || 0), h2 = +m[3], i2 = +(m[4] || 0);
  if (h1 > 23 || h2 > 24 || i1 > 59 || i2 > 59) return '';
  const f = (h, i) => (h < 10 ? '0' : '') + h + ':' + (i < 10 ? '0' : '') + i;
  return f(h1, i1) + '-' + f(h2, i2);
}
function opts_(s) {
  // 11:00-20:00 arası çay ve yemek molası aynı anda seçilebilir; her türün toplam hakkı sıradaki mola sürelerinin toplamıdır
  const r = [], md = md_(), seq = CFG.SEQ[s.branch] || CFG.SEQ.opt, seen = {};
  if (md >= CFG.MAIN.from * 60 && md < CFG.MAIN.to * 60) seq.forEach(q => {
    if (seen[q.k]) return; seen[q.k] = 1;
    const quota = seq.filter(x => x.k === q.k).reduce((a, x) => a + x.d, 0), rem = quota - usedK_(s, q.k);
    if (rem > 0) r.push({ k: q.k, n: q.n, d: Math.min(q.d, rem), full: q.d });
  });
  CFG.EXTRA.forEach(e => { const d = e.d - usedK_(s, e.k); if (md >= e.from * 60 && md < e.to * 60 && d > 0) r.push({ k: e.k, n: e.n, d: d, full: e.d }); });
  return r;
}
function rnd_(s) { const T = mainT_(s); let b = 0, i = 0; for (const q of (CFG.SEQ[s.branch] || CFG.SEQ.opt)) { b += q.d; if (T < b) return i; i++; } return i; }
function shift_(s, md, wd) {
  if (!s.sh) return { on: true, start: 0, txt: '' };
  const cell = c => { if (!c) return null; const p = c.split('-'); return { a: mm_(p[0]), b: mm_(p[1]), t: c }; };
  const t = cell(s.sh[wd]), y = cell(s.sh[(wd + 6) % 7]);
  if (t && (t.b > t.a ? (md >= t.a && md < t.b) : md >= t.a)) return { on: true, start: t.a, txt: t.t };
  if (y && y.b <= y.a && md < y.b) return { on: true, start: y.a - 1440, txt: y.t };
  return { on: false, start: t ? t.a : 9999, txt: t ? t.t : '' };
}
const normR_ = s => String(s || '').trim().replace(/\s*[-–—]\s*/g, '-').replace(/\s+/g, ' ');
const todayLbl_ = () => new Date().toLocaleDateString('tr-TR', { timeZone: TZ });
const msgOf_ = (s, a) => `${nice_(s.name)} (${branchName_(s.branch)}) - ${a.dur} dk ${a.n} süresi doldu!`;

// ---------- Firestore ----------
// Personel listesi canlı dinlenir: her 5 sn'lik yenileme bellekten okur, Firestore'dan sadece DEĞİŞEN belgeler okunur
// (eski sürüm her yenilemede tüm personeli okuyup günlük 50.000 okuma kotasını dolduruyordu)
let CACHE = [], CERR = null;
const snapReady = new Promise(res => {
  const sub = () => ready.then(() => col('staff').onSnapshot(q => {
    CERR = null; CACHE = q.docs.map(d => { const s = d.data(); s.id = d.id; return s; }); res();
  }, e => { CERR = e; res(); setTimeout(sub, 60000); })).catch(e => { CERR = e; res(); setTimeout(sub, 60000); });
  sub();
});
async function allStaff_() {
  await snapReady;
  if (CERR && !CACHE.length) throw CERR;
  const t = today_();
  return CACHE.map(o => { const s = copy_(o); if (s.day !== t) { s.day = t; s.done = []; s.active = null; } s.done = s.done || []; return s; });
}
const clean_ = s => JSON.parse(JSON.stringify(s));
async function upd_(id, fn) {
  return db.runTransaction(async tx => {
    const ref = col('staff').doc(id), snap = await tx.get(ref);
    if (!snap.exists) throw new Error('Personel bulunamadı');
    const s = snap.data(), t = today_(); s.id = id;
    if (s.day !== t) { s.day = t; s.done = []; s.active = null; }
    s.done = s.done || [];
    fn(s);
    tx.set(ref, clean_(s));
    return s;
  });
}
// Şubesi kayıtlı olmayan eski raporların şubesini personel listesinden bulur
async function reports_() {
  const rs = (await col('reports').get()).docs.map(d => d.data()), st = await allStaff_();
  rs.forEach(r => { if (!r.sube) { const s = st.find(x => norm_(x.name) === norm_(r.name)); if (s) r.sube = s.branch; } });
  return rs;
}

// ---------- ntfy ----------
let TOK = null;
async function token_() {
  if (TOK === null) { const d = await col('cfg').doc('ntfy').get(); TOK = d.exists ? String(d.data().token || '').trim() : ''; }
  return TOK;
}
const errText_ = (c, tok) => c === 429 ? (tok ? 'ntfy günlük mesaj kotası dolu (429)' : 'Token kayıtlı değil (429). Panelde ⚙ Araçlar > 🔑 Ntfy Token') : (c === 401 || c === 403) ? 'Token geçersiz (' + c + ')' : 'ntfy hatası ' + c;
async function post_(topic, title, text, delay) {
  const body = { topic: topic, title: title, message: text, priority: 5, tags: ['rotating_light', 'alarm_clock'] };
  if (delay) body.delay = delay;
  try {
    const tok = await token_(), h = { 'Content-Type': 'application/json' };
    if (tok) h.Authorization = 'Bearer ' + tok;
    const r = await fetch('https://ntfy.sh/', { method: 'POST', headers: h, body: JSON.stringify(body) });
    if (!r.ok) return { ok: false, err: errText_(r.status, tok) };
    let id = ''; try { id = (await r.json()).id || ''; } catch (e) {}
    return { ok: true, id: id };
  } catch (e) { return { ok: false, err: String(e).slice(0, 70) }; }
}
async function cancel_(topic, nid) {
  if (!nid) return;
  try { const tok = await token_(); await fetch('https://ntfy.sh/' + topic + '/' + nid, { method: 'DELETE', headers: tok ? { Authorization: 'Bearer ' + tok } : {} }); } catch (e) {}
}
const cancelActive_ = s => { const a = s && s.active; if (a && !a.paused && Date.now() < end_(a)) { cancel_(topicOf_(s.id), a.nid2); return cancel_(topicOf_('yonetici'), a.nid); } };

async function schedule_(id, start, text, delay) {
  const m = await post_(topicOf_('yonetici'), '⏰ Mola doldu', text, delay);
  const m2 = await post_(topicOf_(id), '⏰ Molan doldu', 'Molan bitti! Çabuk postana geç.', delay);
  try {
    await upd_(id, c => {
      if (!c.active || c.active.start !== start) { if (m.ok) cancel_(topicOf_('yonetici'), m.id); if (m2.ok) cancel_(topicOf_(id), m2.id); return; }
      c.active.posting = false;
      if (m.ok) { c.active.sched = true; c.active.nid = m.id; c.active.nid2 = m2.ok ? m2.id : ''; c.active.err = ''; } else { c.active.err = m.err; }
    });
  } catch (e) {}
}
const due_ = (s, now) => { const a = s.active; return !!(a && !a.paused && !a.notified && now >= end_(a) && !(a.lastTry && now - a.lastTry < 60000)); };

// ---------- API ----------
const API = {
  async getState(branch, pin) {
    const mgr = !!pin && checkPin_(pin), md = md_(), wd = wd_();
    const staff = (await allStaff_()).filter(s => s.branch === branch).sort((a, b) => a.name.localeCompare(b.name, 'tr')).map(s => {
      const c = mgr ? s : copy_(s);
      const sh = shift_(s, md, wd); c.on = sh.on; c.shTxt = sh.txt; c.shStart = sh.start;
      c.opts = s.off ? [] : opts_(s);
      c.bitti = !s.off && !c.opts.length && (mainT_(s) >= total_(s.branch) || md >= CFG.MAIN.to * 60);
      if (!mgr) { delete c.email; delete c.phone; if (c.active) ['nid', 'err', 'mailErr'].forEach(k => delete c.active[k]); }
      return c;
    });
    const onl = staff.filter(c => c.on && !c.off).sort((a, b) => a.shStart - b.shStart || a.name.localeCompare(b.name, 'tr'));
    onl.forEach((c, i) => { if (c.sh) c.sira = i + 1; });
    if (staff.some(c => c.sh) && md >= CFG.MAIN.from * 60 && md < CFG.MAIN.to * 60) {
      const n = (CFG.SEQ[branch] || CFG.SEQ.opt).length;
      const cand = onl.filter(c => !c.active && rnd_(c) < n).sort((a, b) => rnd_(a) - rnd_(b) || (a.sira || 999) - (b.sira || 999));
      if (cand[0]) cand[0].turn = true;
    }
    return { now: Date.now(), names: names_(), total: total_(branch), staff: staff };
  },
  async checkPin(pin) { return checkPin_(pin); },
  async getTopic(id, pin) { if (id === 'yonetici') auth_(pin); return topicOf_(id); },   // personel kendi kodunu şifresiz alır
  async saveToken(token, pin) {
    auth_(pin);
    const t = String(token || '').trim();
    if (!t) throw new Error('Token boş');
    const r = await fetch('https://ntfy.sh/v1/account', { headers: { Authorization: 'Bearer ' + t } });
    if (r.status === 401 || r.status === 403) throw new Error('Token geçersiz. ntfy.sh/app > Account > Access tokens bölümünden tk_ ile başlayan token\'ı kopyalayın.');
    if (!r.ok) throw new Error('Token doğrulanamadı: ' + r.status);
    await col('cfg').doc('ntfy').set({ token: t }); TOK = t;
    return 'ok';
  },
  async sendTest(id, pin) {
    auth_(pin);
    const r = await post_(topicOf_(id), '⏰ TEST BİLDİRİMİ', 'Bildirim çalışıyor!');
    if (!r.ok) throw new Error(r.err);
    return 'ok';
  },
  async sendMailTest() { throw new Error('Mail gönderimi bu sürümde yok. Bildirimler ntfy ile gelir.'); },
  async startBreak(id, k) {
    const s = await upd_(id, s => {
      if (s.off) throw new Error('Personel izinli');
      if (s.sh && !shift_(s, md_(), wd_()).on) throw new Error('Vardiyan dışındasın');
      if (s.active) throw new Error('Zaten molada');
      const o = opts_(s).find(x => x.k === k);
      if (!o) throw new Error('Bu mola şu an kullanılamaz');
      s.active = { k: o.k, n: o.n, start: Date.now(), dur: o.d, pt: 0, notified: false, sched: false, posting: true };
    });
    await schedule_(s.id, s.active.start, msgOf_(s, s.active), s.active.dur + 'm');
  },
  async pauseBreak(id, pin) {
    auth_(pin);
    let nid = '', nid2 = '';
    await upd_(id, s => {
      const a = s.active;
      if (!a || a.paused) return;
      if (Date.now() >= end_(a)) throw new Error('Süre doldu. Molayı Bitir butonunu kullanın.');
      nid = a.nid; nid2 = a.nid2; a.nid2 = ''; a.paused = true; a.pausedAt = Date.now(); a.sched = false; a.posting = false; a.nid = ''; a.sent = 0;
    });
    await cancel_(topicOf_('yonetici'), nid); await cancel_(topicOf_(id), nid2);
  },
  async resumeBreak(id, pin) {
    auth_(pin);
    const s = await upd_(id, x => {
      const a = x.active;
      if (!a || !a.paused) return;
      a.pt = (a.pt || 0) + Date.now() - a.pausedAt; a.paused = false; a.pausedAt = 0;
      a.notified = false; a.tries = 0; a.lastTry = 0; a.mailSent = false; a.err = '';
      a.posting = end_(a) - Date.now() > 15000;
    });
    if (s.active && s.active.posting) await schedule_(s.id, s.active.start, msgOf_(s, s.active), String(Math.round(end_(s.active) / 1000)));
  },
  async endBreak(id, pin) {
    let old = null, rec = null;
    await upd_(id, s => {
      const a = s.active;
      if (!a) return;
      old = copy_(s);
      const e = a.paused ? a.pausedAt : Date.now(), m = Math.max(1, Math.round((e - a.start - (a.pt || 0)) / 60000));
      s.done.push({ k: a.k, m: m, t: a.start, e: e });
      s.active = null; rec = [a.start, a.k, m, e];
    });
    if (rec) {
      const ref = col('hist').doc(id), d = await ref.get(), rows = (d.exists ? d.data().rows : []) || [];
      rows.push({ a: rec[0], k: rec[1], m: rec[2], e: rec[3] });
      await ref.set({ rows: rows.slice(-200) });
    }
    if (old) await cancelActive_(old);
  },
  async getHistory(id, pin) {
    auth_(pin);
    const s = (await allStaff_()).find(x => x.id === id);
    if (!s) throw new Error('Personel bulunamadı');
    const d = await col('hist').doc(id).get();
    return { name: s.name, rows: ((d.exists ? d.data().rows : []) || []).map(r => [r.a, r.k, r.m, r.e]).reverse() };
  },
  async resendNotify(id, pin) {
    auth_(pin);
    await upd_(id, s => {
      const a = s.active;
      if (!a) return;
      if (a.paused) throw new Error('Mola durdurulmuş');
      if (Date.now() < end_(a)) throw new Error('Mola süresi henüz dolmadı');
      a.notified = false; a.sched = false; a.posting = false; a.tries = 0; a.lastTry = 0; a.sent = 0; a.err = ''; a.mailSent = false;
    });
    await API.checkBreaks();
  },
  async checkBreaks() {
    const now = Date.now();
    for (const s0 of await allStaff_()) {
      if (!due_(s0, now)) continue;
      let a = null;
      await upd_(s0.id, s => { if (!due_(s, now)) return; s.active.lastTry = now; s.active.tries = (s.active.tries || 0) + 1; a = copy_(s.active); });
      if (!a) continue;
      let ok = !!a.sched, err = a.err || '';
      if (!a.sched && !(a.posting && now - end_(a) < 120000)) {
        const m = await post_(topicOf_('yonetici'), '⏰ Mola doldu', msgOf_(s0, a));
        await post_(topicOf_(s0.id), '⏰ Molan doldu', 'Molan bitti! Çabuk postana geç.');
        ok = m.ok; err = m.err || '';
      }
      await upd_(s0.id, c => {
        const x = c.active;
        if (!x || x.start !== a.start) return;
        if (ok) { x.sent = x.sched ? end_(x) : Date.now(); x.err = ''; x.notified = true; } else { x.err = err; if ((x.tries || 0) >= 5) x.notified = true; }
      });
    }
  },
  async addStaff(branch, name, email, phone, pin) {
    auth_(pin);
    if (!name) throw new Error('İsim gerekli');
    const id = Math.random().toString(36).slice(2, 10);
    await col('staff').doc(id).set(clean_({ id, branch, name: name.trim(), email: (email || '').trim(), phone: phone_(phone), day: today_(), done: [], active: null, off: false }));
  },
  async updateStaff(id, name, email, phone, pin) {
    auth_(pin);
    if (!name || !name.trim()) throw new Error('İsim gerekli');
    await upd_(id, s => { s.name = name.trim(); s.email = (email || '').trim(); s.phone = phone_(phone); });
  },
  async setOff(id, off, pin) {
    auth_(pin);
    await upd_(id, s => {
      if (off && s.active) throw new Error('Molada olan personel izinli yapılamaz. Önce molayı bitirin.');
      s.off = !!off;
    });
  },
  async selfRegister(branch, name, phone, email) {
    if (branch !== 'opt' && branch !== 'mavi') throw new Error('Şube geçersiz');
    name = nice_(name);
    if (name.length < 3) throw new Error('Ad soyad yazın');
    if ((await allStaff_()).some(s => s.branch === branch && norm_(s.name) === norm_(name))) throw new Error('Bu isim bu şubede zaten kayıtlı');
    const id = Math.random().toString(36).slice(2, 10);
    await col('staff').doc(id).set(clean_({ id, branch, name, email: String(email || '').trim(), phone: phone_(phone), day: today_(), done: [], active: null, off: false }));
    return name;
  },
  async removeStaff(id, pin) {
    auth_(pin);
    const s = (await allStaff_()).find(x => x.id === id);
    await col('staff').doc(id).delete(); await col('hist').doc(id).delete();
    if (s) await cancelActive_(s);
  },
  // ---- Vardiya: Excel'den yapıştırma ----
  // Desteklenen biçimler:
  //  1) Her gün iki sütun (başlangıç, bitiş) + altında istasyon kodu satırı (isim sütunu boş)
  //  2) Her gün tek sütun: 08:00-16:00
  async uploadShift(branch, text, pin) {
    auth_(pin);
    const staff = (await allStaff_()).filter(s => s.branch === branch), got = {}, codes = {}, missing = [];
    const split = line => { let p = line.split(/\t|;|\|/); if (p.length < 2) p = line.split(','); return p.map(x => String(x == null ? '' : x).trim()); };
    const tm = c => { const m = String(c).match(/^(\d{1,2})(?:[:.,](\d{2}))?$/); return m && +m[1] <= 24 ? { h: +m[1], i: +(m[2] || 0) } : null; };
    const f2 = t => (t.h < 10 ? '0' : '') + t.h + ':' + (t.i < 10 ? '0' : '') + t.i;
    let last = null;
    String(text || '').split(/\r?\n/).forEach(line => {
      if (!line.trim()) return;
      const parts = split(line), name = parts[0], cells = parts.slice(1);
      if (!name) {   // isim boş = istasyon kodu satırı (T1, S4...)
        return;
      }
      const s = staff.find(x => norm_(x.name) === norm_(name));
      const pair = cells.length >= 12 && cells.some(c => tm(c)) && !cells.some(c => /[-–—]/.test(c));
      const week = [];
      for (let i = 0; i < 7; i++) {
        if (pair) {
          const a = tm(cells[i * 2]), b = tm(cells[i * 2 + 1]);
          week.push(a && b && !(a.h === 0 && a.i === 0) ? f2(a) + '-' + f2(b.h === 0 && b.i === 0 ? { h: 24, i: 0 } : b) : '');
        } else week.push(parseCell_(cells[i]));
      }
      if (s) { got[s.id] = week; codes[s.id] = ['', '', '', '', '', '', '']; last = { id: s.id, pair: pair }; }
      else { last = null; if (week.some(Boolean)) missing.push(name); }
    });
    const ids = Object.keys(got);
    if (!ids.length) throw new Error('Hiç isim eşleşmedi. Her satır: personel adı, sonra Pazartesi-Pazar vardiyaları olmalı.');
    const absent = [];
    for (const x of staff) {
      await upd_(x.id, s => {
        if (got[s.id]) { s.sh = got[s.id]; s.shc = codes[s.id]; }
        else { s.sh = ['', '', '', '', '', '', '']; s.shc = ['', '', '', '', '', '', '']; absent.push(s.name); }
      });
    }
    return { ok: ids.length, missing: missing, absent: absent };
  },
  async clearShift(branch, pin) {
    auth_(pin);
    for (const x of (await allStaff_()).filter(s => s.branch === branch)) await upd_(x.id, s => { delete s.sh; delete s.shc; });
  },
  async resetStaff(id, pin) {
    auth_(pin);
    let old = null;
    await upd_(id, s => { if (s.active) old = copy_(s); s.done = []; s.active = null; });
    const t = today_(), ref = col('hist').doc(id), d = await ref.get();
    if (d.exists) await ref.set({ rows: (d.data().rows || []).filter(r => today_(new Date(r.a)) !== t) });
    if (old) await cancelActive_(old);
  },
  async resetDay(branch, pin) {
    auth_(pin);
    for (const x of (await allStaff_()).filter(s => s.branch === branch)) {
      let old = null;
      await upd_(x.id, s => { if (s.active) old = copy_(s); s.done = []; s.active = null; });
      if (old) await cancelActive_(old);
    }
  },
  // ---- Satış raporu: şubeye göre ayrı ----
  async saveReport(d, pin) {
    auth_(pin);
    const name = String(d.name || '').trim(), ciro = Number(d.ciro), hesap = Number(d.hesap), sube = d.sube;
    if (sube !== 'opt' && sube !== 'mavi') throw new Error('Şube geçersiz');
    if (!name || !(ciro > 0) || !(hesap > 0)) throw new Error('Ad, ciro ve hesap sayısı gerekli');
    const range = normR_(d.range) || ('Yükleme ' + todayLbl_()), key = sube + '_' + norm_(name) + '_' + norm_(range), ort = Math.round(ciro / hesap * 100) / 100;
    await col('reports').doc(key).set({ key, sube, name, firma: String(d.firma || '').trim(), range, ciro, hesap, ort, t: Date.now() });
    return { ort: ort };
  },
  async listReports(pin) {
    auth_(pin);
    return (await reports_()).sort((a, b) => b.ort - a.ort);
  },
  async listReportsPub() {
    return (await reports_()).map(r => ({ name: r.name, sube: r.sube, range: r.range, ciro: r.ciro, hesap: r.hesap, ort: r.ort })).sort((a, b) => b.ort - a.ort);
  },
  async delReport(key, pin) { auth_(pin); await col('reports').doc(key).delete(); },
  // ---- Bira satışı (Personel Ürün Satış Raporu): garson başına miktar, wheel hariç ----
  async saveBeer(rows, sube, range, pin) {
    auth_(pin);
    if (sube !== 'opt' && sube !== 'mavi') throw new Error('Şube geçersiz');
    if (!Array.isArray(rows) || !rows.length) throw new Error('Kaydedilecek satır yok');
    const rg = normR_(range).slice(0, 40) || ('Yükleme ' + todayLbl_());
    await Promise.all(rows.slice(0, 80).map(r => {
      const name = String(r.name || '').trim(), qty = Number(r.qty);
      if (!name || !isFinite(qty) || qty < 0) throw new Error('Geçersiz satır: ' + name);
      const key = sube + '_' + norm_(name) + '_' + norm_(rg);
      return col('beer').doc(key).set({ key, sube, name, range: rg, qty, amt: Number(r.amt) || 0, wheel: Number(r.wheel) || 0, t: Date.now() });
    }));
    return { n: Math.min(rows.length, 80) };
  },
  async listBeer(pin) { auth_(pin); return (await col('beer').get()).docs.map(d => d.data()).sort((a, b) => b.qty - a.qty); },
  async listBeerPub() { return (await col('beer').get()).docs.map(d => { const r = d.data(); return { key: r.key, sube: r.sube, name: r.name, range: r.range, qty: r.qty, amt: r.amt }; }).sort((a, b) => b.qty - a.qty); },
  async delBeer(key, pin) { auth_(pin); await col('beer').doc(key).delete(); },
  async getTargets() { const d = await col('cfg').doc('targets').get(); return d.exists ? d.data() : {}; },
  async setTarget(sube, kind, val, pin) {
    auth_(pin);
    const v = Number(val);
    if ((sube !== 'opt' && sube !== 'mavi') || kind !== 'bira' || !(v > 0)) throw new Error('Hedef geçersiz');
    await col('cfg').doc('targets').set({ [sube + '_' + kind]: v }, { merge: true });
    return v;
  },
  // Bir dönemdeki tüm kayıtları başka bir döneme taşır (iki dönemi birleştirmek için)
  async movePeriod(kind, sube, from, to, pin) {
    auth_(pin);
    const c = kind === 'ciro' ? 'reports' : 'beer', dst = normR_(to);
    if (!dst) throw new Error('Yeni dönem boş olamaz');
    const lbl = r => normR_(r.range) || ('Yükleme ' + new Date(r.t || 0).toLocaleDateString('tr-TR', { timeZone: TZ }));
    let n = 0;
    for (const d of (await col(c).get()).docs) {
      const r = d.data();
      if (r.sube !== sube || lbl(r) !== normR_(from)) continue;
      const key = sube + '_' + norm_(r.name) + '_' + norm_(dst);
      await col(c).doc(key).set(Object.assign({}, r, { range: dst, key: key }));
      if (key !== d.id) await col(c).doc(d.id).delete();
      n++;
    }
    return n;
  }
};

// ---------- google.script.run uyumluluğu ----------
function chain_() {
  let ok = () => {}, fail = () => {};
  const o = new Proxy({}, {
    get(_, k) {
      if (k === 'withSuccessHandler') return f => { ok = f; return o; };
      if (k === 'withFailureHandler') return f => { fail = f; return o; };
      return (...a) => {
        ready.then(() => { if (!API[k]) throw new Error('Bilinmeyen işlem: ' + String(k)); return API[k](...a); })
          .then(r => ok(r), e => fail(e instanceof Error ? e : new Error(String(e))));
      };
    }
  });
  return o;
}
window.google = { script: { get run() { return chain_(); } } };

// ---------- Bira raporu okuma düzeltmesi ----------
// index.html'deki ocrW ve beerPages, sayfa yüklendikten sonra bunlarla değiştirilir:
// seyrek metin modu (PSM 11) ile tablo satırları tam okunur; garson blokları sütun konumlarından ve toplam satırlarından bulunur.
window.addEventListener('load', function () {
window.ocrW = async function (f) {
  if (typeof Tesseract === 'undefined') throw new Error('Okuma modülü yüklenemedi');
  const c = await cv(f, true);
  const wk = await Tesseract.createWorker('eng', 1, { logger: m => { if (m.status) $('st').textContent = OCRL + ' ' + (m.progress ? '%' + Math.round(m.progress * 100) : ''); } });
  try {
    await wk.setParameters({ tessedit_pageseg_mode: '11' });
    const r = await wk.recognize(c);
    return { text: r.data.text || '', W: (r.data.words || []).filter(w => w && w.text && w.text.trim() && w.bbox).map(w => ({ t: w.text.trim(), x0: w.bbox.x0, x: (w.bbox.x0 + w.bbox.x1) / 2, y: (w.bbox.y0 + w.bbox.y1) / 2, h: w.bbox.y1 - w.bbox.y0 })) };
  } finally { try { await wk.terminate(); } catch (e) {} }
};
// Bira raporu ayrıştırıcı (sütun konumlarına dayanır; ürün kodu/sicil no okunamasa da çalışır)
window.beerPages=function(pages,st){
  const warn=[],ev=[],qre=/^\d{1,3}(?:\.\d{3})*,\d{3}$/,are=/^\d{1,3}(?:\.\d{3})*,\d{2}$/;
  const fix=t=>(/^[\dOo.,]+$/.test(t)&&/\d/.test(t))?t.replace(/[Oo]/g,'0'):t;
  const isBr=w=>['hm','izmir','optimum','mavi','bahce'].indexOf(nrm(w.t))>=0;
  const letters=t=>t.replace(/[^A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû]/g,'');
  const match=txt=>{const nl=nrm(txt);if(nl.length<4)return null;return st.find(x=>nrm(x.name)==nl)||st.find(x=>nl.indexOf(nrm(x.name))>=0&&nrm(x.name).length>4)||st.find(x=>lev(nl,nrm(x.name))<=Math.floor(nrm(x.name).length*.3))||null;};
  let sube='';
  pages.forEach(pg=>{
    if(!sube){if(/MAVI\s*BAH/i.test(pg.text||''))sube='mavi';else if(/OPTIMUM/i.test(pg.text||''))sube='opt';}
    const W=pg.W.map(w=>Object.assign({},w,{t:fix(w.t)}));
    if(!W.length)return;
    const mk=W.filter(w=>{const n=nrm(w.t);return n=='miktar'||n=='tutar';}).sort((a,b)=>a.y-b.y)[0];
    const hdr=mk?W.filter(w=>nrm(w.t)=='urun'&&Math.abs(w.y-mk.y)<mk.h*1.5).sort((a,b)=>a.x0-b.x0)[0]:null;
    const codes=W.filter(w=>/^\D?\d{7}\D?$/.test(w.t)).map(w=>w.x0).sort((a,b)=>a-b);
    let codeX=hdr?hdr.x0:(codes.length?codes[codes.length>>1]:0);
    if(!codeX){warn.push('Bir sayfada tablo başlığı bulunamadı, o sayfa atlandı');return;}
    codeX-=6;
    const topY=mk?mk.y+mk.h:0,hs=W.map(w=>w.h).sort((a,b)=>a-b),H=hs[hs.length>>1]||12,L=[];
    W.filter(w=>w.y>topY).sort((a,b)=>a.y-b.y).forEach(w=>{const l=L[L.length-1];if(l&&Math.abs(w.y-l.y)<H*.6){l.w.push(w);l.y=(l.y*(l.w.length-1)+w.y)/l.w.length;}else L.push({y:w.y,w:[w]});});
    let last=null;
    L.forEach(l=>{
      const t=l.w.sort((a,b)=>a.x0-b.x0),left=t.filter(w=>w.x0<codeX),right=t.filter(w=>w.x0>=codeX);
      const code=right.find(w=>/^\D?\d{7}\D?$/.test(w.t)),br=right.some(isBr);
      const q=right.filter(w=>qre.test(w.t)).pop(),a=right.filter(w=>are.test(w.t)).pop(),qv=q?num(q.t):NaN;
      // garson adı (sicil no + ad); sicil no ya da kayıtlı personel eşleşmesi şart
      const idw=left.find(w=>/\d{2}-\d{1,3}/.test(w.t)),txt=left.map(w=>letters(w.t.replace(/^[^A-Za-zÇĞİÖŞÜçğıöşü]*\d{2}-\d{1,3}/,''))).filter(x=>x.length>=2).join(' '),s=match(txt);
      if(idw||s)ev.push({k:'name',name:s?s.name:(txt.length>=3?nice(txt):'?'),known:!!s});
      if(code||br){
        if(q){ev.push({k:'row',q:qv});last={q:qv,y:l.y,w:false};
          if(a&&num(a.t)===0&&qv>0){ev.push({k:'wheel',q:qv});last.w=true;}}
      }else if(q){ev.push({k:'tot',q:qv});last=null;}
      if(!q&&last&&!last.w&&l.y-last.y<H*2.6&&t.some(w=>/whe+l|kmpn/i.test(w.t))){ev.push({k:'wheel',q:last.q});last.w=true;}
      if(q&&(code||br)&&t.some(w=>/whe+l|kmpn/i.test(w.t))&&last&&!last.w){ev.push({k:'wheel',q:qv});last.w=true;}
    });
  });
  const out={},order=[];let cur=null,grand=null,gsum=0;
  const fin=(tot)=>{
    if(!cur)return;
    const c=cur;cur=null;
    const qty=(tot!=null?tot:c.sum)-c.wheel;
    if(tot==null)warn.push(c.name+': toplam satırı okunamadı, satırlar toplandı (kontrol edin)');
    else if(Math.abs(c.sum-tot)>0.5)warn.push(c.name+': satırlar toplamı ('+c.sum+') rapor toplamından ('+tot+') farklı, kontrol edin');
    if(c.name=='?')warn.push('Adı okunamayan garson (miktar '+qty+'): adı yazın');
    gsum+=tot!=null?tot:c.sum;
    const k=nrm(c.name);if(out[k])out[k].qty+=qty;else{out[k]={name:c.name,qty:qty};order.push(k);}
  };
  ev.forEach(e=>{
    if(e.k=='name'){
      if(cur&&nrm(cur.name)==nrm(e.name))return;
      if(cur&&(cur.rows>0||cur.wheel>0))fin(null);
      if(cur&&cur.name!='?'&&!e.known&&e.name=='?')return;
      cur={name:e.name,sum:0,wheel:0,rows:0};
    }else if(e.k=='row'){if(!cur)cur={name:'?',sum:0,wheel:0,rows:0};cur.sum+=e.q;cur.rows++;}
    else if(e.k=='wheel'){if(cur)cur.wheel+=e.q;}
    else if(e.k=='tot'){if(cur)fin(e.q);else grand=e.q;}
  });
  if(cur&&cur.rows>0)fin(null);
  if(grand!=null&&Math.abs(gsum-grand)>0.5)warn.push('Garson toplamları ('+gsum+') raporun genel toplamından ('+grand+') farklı: bir garson eksik ya da yanlış okunmuş olabilir');
  return{rows:order.map(k=>out[k]).map(r=>({name:r.name,qty:r.qty,amt:0,wheel:0})).sort((a,b)=>b.qty-a.qty),warn:warn,sube:sube,grandOk:grand!=null&&Math.abs(gsum-grand)<=0.5};
};

window.beerBatch=async function(files){
  const pages=[];
  for(let i=0;i<files.length;i++){
    OCRL='📖 Sayfa '+(i+1)+'/'+files.length;
    const o=await ocrW(files[i]),m=o.text.match(/Sayfa\s*(\d+)\s*\/\s*\d+/i);
    pages.push({W:o.W,text:o.text,n:m?+m[1]:null,i:i});
  }
  $('st').textContent='';OCRL='📖 Görsel okunuyor…';
  pages.sort((a,b)=>(a.n!=null&&b.n!=null)?a.n-b.n:a.i-b.i);   // "Sayfa n/m" numarasına göre sırala
  const ns=pages.map(p=>p.n).filter(x=>x!=null),r=beerPages(pages,(D&&D.staff)||[]);
  if(ns.some((n,i)=>i&&n!=ns[i-1]+1))r.warn.push('Sayfa numaraları ardışık değil, eksik sayfa olabilir');
  if(!r.rows.length){msg('Görsellerde garson toplamı okunamadı.\nSicil no (37-4), garson adı ve Miktar sütunu görünecek şekilde, rapor sayfalarının tamamını yükleyin.'+(r.warn.length?'\n\n'+r.warn.join('\n'):''));return;}
  beerForm(r.rows.map(x=>x.name+';'+x.qty).join('\n'),r.sube||B,'🍺 Bira satışı · '+BR[r.sube||B]+'\n'+r.rows.length+' garson'+(r.grandOk?' · ✓ toplamlar rapordaki genel toplamla tuttu':'')+(r.warn.length?'\n⚠ '+r.warn.join('\n⚠ '):'')+'\nSatır: Ad;Miktar (wheel hariç)',(function(){const m=pages.map(p=>p.text||'').join(' ').match(/Tarih\s+Aral\S{2,4}\s*:\s*([\d.]+\s*-\s*[\d.]+)/i);return m?m[1].replace(/\s+/g,''):'';})());
};
window.beerForm=function(lines,sb,head,per){
  ask(head,[{label:'Dönem (boşsa yükleme tarihi yazılır)',val:per||''},{label:'Satırlar (Ad;Miktar)',type:'textarea',val:lines}],async v=>{
    const rows=[],fail=[];
    v[1].split(/\r?\n/).forEach(ln=>{if(!ln.trim())return;const p=ln.split(';'),d={name:(p[0]||'').trim(),qty:num(p[1]),amt:0,wheel:0};if(d.name&&d.name!='?'&&isFinite(d.qty)&&d.qty>=0)rows.push(d);else fail.push(ln);});
    try{const o=await gs('saveBeer',rows,sb,v[0].trim(),PIN);msg(o.n+' garsonun bira miktarı kaydedildi ✅\n'+BR[sb]+(fail.length?'\n\nAtlanan satırlar:\n'+fail.join('\n'):''));rptLoad();}catch(e){msg(emsg(e));}
  },'Kaydet');
};
window.beerManual=function(){beerForm('',B,'🍺 Bira satışını elle gir · '+BR[B]+'\nSatır: Ad;Miktar (wheel hariç). Şube sekmesinin doğru olduğundan emin ol.');};
window.beerTable=function(L,del){
  const tq=L.reduce((a,r)=>a+Number(r.qty||0),0);
  return '<div style="overflow:auto"><table class="xl xl2"><tr><th>#</th><th class="l">Ad Soyad</th><th>Miktar</th>'+(del?'<th></th>':'')+'</tr>'
   +L.map((r,i)=>`<tr><td>${i+1}</td><td class="l"><b>${esc(nice(r.name))}</b>${r.range?'<br><span style="font-size:10px;color:#475569">'+esc(r.range)+'</span>':''}</td><td class="r g">${Number(r.qty).toLocaleString('tr-TR')}</td>${del?`<td><button class="a x" style="padding:4px 8px" data-k="${esc(r.key)}" onclick="beerDel(this.dataset.k)">Sil</button></td>`:''}</tr>`).join('')
   +`<tr class="tot"><td></td><td class="l">TOPLAM</td><td class="r">${tq.toLocaleString('tr-TR')}</td>${del?'<td></td>':''}</tr></table></div>`;
};
// ----- Personel: sadece kendi adı, kendi molası, kendi bildirimi -----
const meK=()=>'mola_me_'+B,getMe=()=>{try{return localStorage.getItem(meK())||'';}catch(e){return '';}};
window.pickMe=id=>{try{id?localStorage.setItem(meK(),id):localStorage.removeItem(meK());}catch(e){}load();};
window.myCode=()=>google.script.run.withFailureHandler(e=>msg(emsg(e))).withSuccessHandler(c=>msg('Senin bildirim kodun:\n\n'+c+'\n\nTelefonuna ntfy uygulamasını kur, "+" ile bu kodu ekle. Molan bitince bildirim sana düşer.')).getTopic(getMe(),'');
const od=window.draw,oh=window.head;
const ini=n=>nice(n).split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('');
window.pkFilter=v=>{const q=nrm(v);document.querySelectorAll('.pkc').forEach(b=>{b.style.display=(!q||b.dataset.n.indexOf(q)>=0)?'':'none';});};
window.draw=function(){
  if(M!='g'){od();return;}
  const me=getMe();
  if(me&&D.staff.some(s=>s.id==me)){const all=D.staff,s0=all.find(s=>s.id==me);D.staff=all.filter(s=>s.id==me);try{od();}finally{D.staff=all;}
    const left=Math.max(0,D.total-usedOf(s0));
    $('list').insertAdjacentHTML('afterbegin','<div class="hi"><b>'+esc(ini(s0.name))+'</b><div><div class="hi1">Merhaba, '+esc(nice(s0.name).split(' ')[0])+' 👋</div><div class="hi2">'+(s0.shTxt?'🕗 Bugün '+esc(s0.shTxt.replace('-','–'))+' · ':'')+'☕ Kalan mola '+left+' dk</div></div></div>');
    return;}
  head();
  const L=D.staff.filter(s=>!s.off).sort((a,b)=>a.name.localeCompare(b.name,'tr')),sig=L.map(s=>s.id).join();
  if($('pks')&&window.__pkSig===sig)return;   // 5 sn'lik yenilemede arama kutusu silinmesin
  window.__pkSig=sig;
  $('list').innerHTML='<div class="pk"><div class="pkh">👤 Kim olduğunu seç<span>'+L.length+' kişi</span></div><input id="pks" class="pks" placeholder="🔎 Adını yaz…" oninput="pkFilter(this.value)" autocomplete="off">'
    +'<div class="pkg">'+L.map(s=>`<button class="pkc" data-n="${esc(nrm(s.name))}" onclick="pickMe('${s.id}')"><b>${esc(ini(s.name))}</b><span>${esc(nice(s.name))}</span></button>`).join('')+'</div>'
    +(L.length?'':'<p class="sub">Listede kimse yok.</p>')+'<button class="pill" style="margin-top:14px" onclick="regMe()">➕ Listede yoksan kayıt ol</button></div>';
};
window.head=function(){
  oh();
  if(M=='g'){
    const me=getMe();
    $('tools').innerHTML=''
      +(me?'<div class="chipsrow"><button class="pill" onclick="myCode()">🔔 Bildirim kodum</button><button class="pill" onclick="pickMe(\'\')">↩ Kişiyi değiştir</button></div>':'');
  }else if(M=='y')$('tools').innerHTML='<div class="admbar"><button class="a" onclick="add()">➕ Personel ekle</button><button class="a x" onclick="reset()">↻ Günü sıfırla</button><button class="a an" onclick="anons()">📢 Anons '+(ANONS?'AÇIK':'modu')+'</button><button class="a ed" onclick="admSet()">⚙ Ayarlar</button></div>';
};
// ----- Görünüm + uygulama simgesi -----
const sty=document.createElement('style');
sty.textContent='.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;width:100%}.tiles button{border:1px solid rgba(148,163,184,.18);border-radius:18px;padding:14px 4px;background:linear-gradient(160deg,#1f2b42,#162033);color:#e2e8f0;font-weight:700;font-size:13px;line-height:1.25;box-shadow:0 6px 16px rgba(0,0,0,.28);display:flex;flex-direction:column;align-items:center;gap:6px}.tiles i{font-style:normal;font-size:26px}.tiles button:active{transform:scale(.97)}.pill{border:1px solid rgba(148,163,184,.25);background:rgba(148,163,184,.1);color:#e2e8f0;border-radius:999px;padding:10px 16px;font-weight:600;font-size:13px}.chipsrow{display:flex;gap:8px;flex-wrap:wrap;width:100%}.pkh{font-weight:800;font-size:16px;display:flex;justify-content:space-between;align-items:center;margin:4px 2px}.pkh span{font-size:12px;color:#94a3b8;font-weight:600}.pks{width:100%;padding:13px 14px;border-radius:14px;border:1px solid #334155;background:#0f172a;color:#fff;font-size:16px;margin:8px 0 12px}.pkg{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pkc{display:flex;align-items:center;gap:10px;text-align:left;padding:10px;border-radius:16px;border:1px solid rgba(148,163,184,.15);background:linear-gradient(160deg,#1f2b42,#162033);color:#f1f5f9;font-size:14px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,.25)}.pkc b{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#6366f1,#8b5cf6);font-size:14px}.pkc span{line-height:1.2;word-break:break-word}.card{border-radius:20px}#list .btns .a{min-height:56px;font-size:16px}';
document.head.appendChild(sty);

// ===== Sayfalar: Mola | Ciro | Bira | Vardiya (her biri tam sayfa) =====
let PGV='mola',PSIG='',PRQ=0;
const NV=document.createElement('div');NV.id='nv';NV.className='nv';document.querySelector('.hd').after(NV);
const PG=document.createElement('div');PG.id='pg';PG.hidden=true;$('beer').after(PG);
const NAVS=[['mola','🕐','Mola'],['ciro','📊','Ciro'],['bira','🍺','Bira'],['vard','🗓️','Vardiya']];
const nvDraw=()=>{NV.innerHTML=NAVS.map(n=>`<button class="${n[0]==PGV?'on':''}" onclick="goPg('${n[0]}')"><i>${n[1]}</i>${n[2]}</button>`).join('');};
window.goPg=v=>{
  PGV=v;PSIG='';nvDraw();
  ['tools','st','sum','list','rpt','beer'].forEach(id=>{const e=$(id);if(e)e.style.display=v=='mola'?'':'none';});
  PG.hidden=v=='mola';
  if(v!='mola'){PG.innerHTML='<p class="sub">Yükleniyor…</p>';pgSync();}
  window.scrollTo(0,0);
};
nvDraw();
const pgSig=()=>B+M+PGV+(D?D.staff.map(s=>s.id+(s.sh||[]).join('|')).join(','):'');
function pgSync(){if(PGV=='mola'||!D)return;const s=pgSig();if(s!==PSIG){PSIG=s;renderPg();}}
const dlX=(sheets,fn)=>{
  try{if(typeof XLSX!=='undefined'){const wb=XLSX.utils.book_new();sheets.forEach(s=>XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(s[1]),s[0].slice(0,30)));XLSX.writeFile(wb,fn+'.xlsx');return;}}catch(e){}
  const csv='\ufeff'+sheets[0][1].map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(';')).join('\r\n'),a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=fn+'.csv';document.body.appendChild(a);a.click();a.remove();
};
const fCiro=async()=>(await gs(M=='y'?'listReports':'listReportsPub',...(M=='y'?[PIN]:[]))).filter(inB).sort((a,b)=>b.ort-a.ort);
const fBira=async()=>(await gs(M=='y'?'listBeer':'listBeerPub',...(M=='y'?[PIN]:[]))).filter(inB).sort((a,b)=>b.qty-a.qty);
const rCiro=L=>{const c=L.reduce((a,r)=>a+Number(r.ciro||0),0),h=L.reduce((a,r)=>a+Number(r.hesap||0),0);return [['#','Ad Soyad','Ciro (TL)','Hesap Sayısı','Ortalama (TL)']].concat(L.map((r,i)=>[i+1,nice(r.name),Number(r.ciro),Number(r.hesap),Number(r.ort)]),[['','TOPLAM',c,h,h?Math.round(c/h*100)/100:0]]);};
const rBira=L=>[['#','Ad Soyad','Bira Miktarı (Wheel hariç)','Dönem']].concat(L.map((r,i)=>[i+1,nice(r.name),Number(r.qty),r.range||'']),[['','TOPLAM',L.reduce((a,r)=>a+Number(r.qty||0),0),'']]);
const rVard=()=>[['Ad Soyad'].concat(DAYS.map(d=>d.charAt(0)+d.slice(1).toLocaleLowerCase('tr')))].concat(((D&&D.staff)||[]).filter(s=>!s.off&&s.sh).map(s=>[nice(s.name)].concat(DAYS.map((d,i)=>(s.sh[i]||'İZİN').replace('-','–')))));
const PSEL={ciro:null,bira:null},PC={ciro:[],bira:[]};
const nR=s=>String(s||'').trim().replace(/\s*[-–—]\s*/g,'-').replace(/\s+/g,' ');
const grp=L=>{const m={};L.forEach(r=>{const k=nR(r.range)||('Yükleme '+new Date(r.t||0).toLocaleDateString('tr-TR',{timeZone:'Europe/Istanbul'}));const g=m[k]||(m[k]={k:k,t:0,rows:[]});g.rows.push(r);g.t=Math.max(g.t,r.t||0);});return Object.values(m).sort((a,b)=>b.t-a.t);};
const selG=k=>{const G=PC[k];return (M=='y'&&PSEL[k]&&G.find(g=>g.k==PSEL[k]))||G[0]||null;};
const ensG=async k=>{if(!PC[k].length)PC[k]=grp(await(k=='ciro'?fCiro():fBira()));return selG(k);};
window.setPer=(k,p)=>{PSEL[k]=p;renderPg();};
window.delPer=k=>{const g=selG(k);if(!g)return;ask('“'+g.k+'” dönemindeki '+g.rows.length+' kayıt silinsin mi?',[],async()=>{try{for(const r of g.rows)await gs(k=='ciro'?'delReport':'delBeer',r.key,PIN);PSEL[k]=null;rptLoad();}catch(e){msg(emsg(e));}},'Sil');};
window.pgXls=async k=>{
  try{
    const fn='HappyMoons_'+BR[B].replace(/\s/g,'_')+'_'+new Date().toISOString().slice(0,10),sh=[];
    if(k=='ciro'||k=='all'){const g=await ensG('ciro');if(g)sh.push(['Ciro '+g.k.replace(/[\\\/?*\[\]:]/g,'-'),rCiro(g.rows.slice().sort((a,b)=>b.ort-a.ort))]);}
    if(k=='bira'||k=='all'){const g=await ensG('bira');if(g)sh.push(['Bira '+g.k.replace(/[\\\/?*\[\]:]/g,'-'),rBira(g.rows.slice().sort((a,b)=>b.qty-a.qty))]);}
    if(k=='vard'||k=='all')sh.push(['Vardiya',rVard()]);
    if(!sh.length||sh.every(s=>s[1].length<2)){msg('İndirilecek kayıt yok.');return;}
    dlX(sh,fn);
  }catch(e){msg(emsg(e));}
};
function vardHtml(){
  const td=(new Date().getDay()+6)%7,st=((D&&D.staff)||[]).filter(s=>!s.off),me=getMe();
  if(!st.some(s=>s.sh))return '<p class="sub" style="padding:10px">Bu şube için vardiya henüz yüklenmedi.</p>';
  const mon=new Date();mon.setDate(mon.getDate()-td);
  const dts=DAYS.map((d,i)=>{const x=new Date(mon);x.setDate(mon.getDate()+i);return x.toLocaleDateString('tr-TR',{day:'numeric',month:'short'});});
  const hd='<tr><th class="nmc">Personel</th>'+DAYS.map((d,i)=>`<th class="${i==td?'td':''}">${dts[i]}<br><span class="dn">${d}</span></th>`).join('')+'</tr>';
  return '<div style="overflow:auto"><table class="xl">'+hd+st.map(s=>'<tr'+(s.id==me&&M=='g'?' style="outline:3px solid #facc15;outline-offset:-3px"':'')+'><td class="nmc">'+esc(nice(s.name).toLocaleUpperCase('tr'))+'</td>'+DAYS.map((d,i)=>{const c=shiftCell(s.sh&&s.sh[i]);return `<td class="c ${i==td?'tdy':''}" style="background:${c.bg}">${c.a}</td>`;}).join('')+'</tr>').join('')+'</table></div>';
}
async function renderPg(){
  const v=PGV,my=++PRQ,adm=M=='y',b=(f,x,c)=>`<button class="a ${c||'ed'}" onclick="${f}">${x}</button>`;
  let title='',acts='',body='',per='';
  const perBar=(k,g,G)=>adm?'<div class="pers">'+G.map(x=>`<button class="${g&&x.k==g.k?'on':''}" data-p="${esc(x.k)}" onclick="setPer('${k}',this.dataset.p)">${esc(x.k)} · ${x.rows.length}</button>`).join('')+'</div>':(g?`<div class="perl">Son yüklenen dönem: <b>${esc(g.k)}</b> · ${new Date(g.t).toLocaleDateString('tr-TR')}</div>`:'');
  try{
    if(v=='ciro'||v=='bira'){
      const bi=v=='bira';PC[v]=grp(await(bi?fBira():fCiro()));const G=PC[v],g=selG(v),L=g?g.rows.slice().sort((a,c)=>bi?c.qty-a.qty:c.ort-a.ort):[];
      const T=bi?await tgt():0;title=bi?'🍺 Bira Satışı':'📊 Ciro Ortalama';per=perBar(v,g,G);
      acts=b(`pgXls('${v}')`,'⬇ Excel','')+(adm?(bi?b('beerPick()','📷 Görselleri yükle')+b('beerManual()','✍ Elle'):b('rptPick()','📷 Rapor yükle')+b('rptManual()','✍ Elle'))+(g?b(`movPer('${v}')`,'🔀 Dönemi taşı')+b(`delPer('${v}')`,'🗑 Dönemi sil','off'):'')+(bi?b('setTgt()','🎯 Hedef: '+T):''):'');
      body=L.length?(bi?lbBira(L,adm,T):lbCiro(L,adm)):'<p class="sub" style="padding:10px">Bu şube için henüz kayıt yok.</p>';
    }else{title='🗓️ Haftalık Vardiya';acts=b("pgXls('vard')",'⬇ Excel','')+(adm?b('shiftUp()','📅 Excel yapıştır')+b('shiftPick()','📷 Görsel')+b('shiftClr()','🗑 Temizle','off'):'');body=vardHtml();}
    if(adm)acts+=b("pgXls('all')",'⬇ Hepsi','an');
  }catch(e){body='<div class="err">'+esc(emsg(e))+'</div>';}
  if(my!==PRQ||PGV!=v)return;
  PG.innerHTML=`<div class="pgh"><h2>${title}<small>${BR[B]}</small></h2><div class="pga">${acts}</div></div>${per}<div class="pgb">${body}</div>`;
}
const d2=window.draw;window.draw=function(){d2();pgSync();};
const orl=window.rptLoad;window.rptLoad=function(){orl();if(PGV!='mola'){PSIG='';setTimeout(pgSync,900);}};
// ----- Bildirim kurulumu: tek dokunuşla ntfy -----
window.myCode=()=>google.script.run.withFailureHandler(e=>msg(emsg(e))).withSuccessHandler(c=>{
  pop('🔔 Mola bildirimi','<p style="margin:0 0 10px;line-height:1.5">Molan bitince telefonuna bildirim gelsin:</p><ol style="padding-left:20px;line-height:1.6;margin:0 0 12px"><li>Telefonuna <b>ntfy</b> uygulamasını kur.</li><li>Aşağıdaki düğmeye bas ya da kodu uygulamada <b>+</b> ile ekle.</li></ol><div style="background:#0f172a;border-radius:12px;padding:12px;font-family:monospace;word-break:break-all;margin-bottom:10px">'+esc(c)+'</div><a class="a" style="margin-bottom:8px" href="ntfy://ntfy.sh/'+encodeURIComponent(c)+'">📲 ntfy\'de aç</a><button class="a ed" style="width:100%" onclick="try{navigator.clipboard.writeText(\''+c+'\');this.textContent=\'✓ Kopyalandı\';}catch(e){}">Kodu kopyala</button>');
  $('mo').textContent='Kapat';
}).getTopic(getMe(),'');
// ----- Personelin kendi ekranında da sesli uyarı -----
const oa=window.alarm;window.alarm=function(s){oa(s);if(M=='g'){try{siren();setTimeout(()=>speak(nice(s.name)+', molan bitti! Çabuk postana geç!'),650);}catch(e){}}};
const sty2=document.createElement('style');
sty2.textContent='.nv{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 12px}.nv button{border:1px solid rgba(148,163,184,.18);border-radius:16px;padding:10px 2px;background:#172033;color:#94a3b8;font-weight:700;font-size:12px;display:flex;flex-direction:column;align-items:center;gap:3px}.nv button i{font-style:normal;font-size:20px}.nv button.on{background:linear-gradient(135deg,#3b82f6,#6d28d9);color:#fff;border-color:transparent;box-shadow:0 6px 16px rgba(79,70,229,.45)}#pg .pgh{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin:2px 0 12px}#pg h2{margin:0;font-size:19px}#pg h2 small{display:block;font-size:12px;color:#fde68a;letter-spacing:.14em;text-transform:uppercase;margin-top:3px}#pg .pga{display:flex;gap:8px;flex-wrap:wrap}#pg .pga .a{padding:10px 14px}#pg .pgb{background:#0b1220;border:1px solid rgba(148,163,184,.12);border-radius:18px;padding:10px}#pg .xl2{font-size:14px!important}#pg .xl{font-size:13px}.hi{display:flex;align-items:center;gap:12px;padding:14px;border-radius:20px;background:linear-gradient(135deg,#1e3a8a,#4c1d95);margin:0 0 12px;border:1px solid rgba(255,255,255,.1)}.hi b{flex:none;width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#f59e0b,#fde68a);color:#1e1b4b;font-size:17px}.hi1{font-weight:800;font-size:18px}.hi2{font-size:13px;color:#e2e8f0;margin-top:3px}';
document.head.appendChild(sty2);

// ===== Yönetici paneli =====
const rowH=s=>{
  const left=Math.max(0,D.total-usedOf(s));
  const bd=s.off?['İzinli','o']:(s.on===false?['Vardiya dışı','n']:(s.turn?['Sırada','y']:(s.bitti?['Molalar bitti','g']:['Vardiyada','g'])));
  return `<div class="row"><b class="av ${s.off||s.on===false?'dim':''}">${esc(ini(s.name))}</b><div class="rm"><div class="rn">${esc(nice(s.name))}</div><div class="rs"><span class="bd ${bd[1]}">${bd[0]}</span>${s.shTxt?'🕗 '+esc(s.shTxt.replace('-','–'))+' · ':''}☕ ${left} dk</div></div><button class="more" onclick="sheet('${s.id}')">⋯</button></div>`;
};
function admDraw(){
  head();$('sum').innerHTML='';$('rpt').innerHTML='';$('beer').innerHTML='';
  const now=Date.now()+off,S=D.staff,act=S.filter(s=>s.active).sort((a,b)=>a.active.start-b.active.start);
  const late=act.filter(s=>!s.active.paused&&endOf(s.active)<now).length,onsh=S.filter(s=>!s.off&&s.on!==false).length;
  const st=(n,l,c)=>`<div class="st ${c||''}"><b>${n}</b><span>${l}</span></div>`;
  const rest=S.filter(s=>!s.active).sort((a,b)=>((a.off?2:a.on===false?1:0)-(b.off?2:b.on===false?1:0))||(a.sira||999)-(b.sira||999)||a.name.localeCompare(b.name,'tr'));
  let h='<div class="stats">'+st(act.length,'Molada','b')+st(late,'Süre aşan',late?'r':'')+st(onsh,'Vardiyada','g')+st(S.length,'Toplam')+'</div>';
  h+='<div class="dt">📅 '+new Date().toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric',weekday:'long'})+'</div>';
  if(act.length)h+='<div class="sec2">MOLADA <span>'+act.length+'</span></div><div class="grid">'+act.map(tile).join('')+'</div>';
  h+='<div class="sec2">PERSONEL <span>'+rest.length+'</span></div><div class="rows">'+(rest.map(rowH).join('')||'<p class="sub">Şubede personel yok. ➕ Personel ekle ile başla.</p>')+'</div>';
  $('list').innerHTML=h;
  document.querySelectorAll('#list .card[data-id]').forEach(c=>c.insertAdjacentHTML('beforeend','<button class="a x" style="width:100%" onclick="sheet(\''+c.dataset.id+'\')">⋯ İşlemler</button>'));
  tick();
}
const cl="$('ov').hidden=true;";
window.sheet=id=>{
  const s=D.staff.find(x=>x.id==id);if(!s)return;
  const b=(f,x,c)=>`<button class="a ${c||'ed'}" onclick="${cl}${f}">${x}</button>`;
  const done=(s.done||[]).map(x=>typeof x=='object'?esc(kn(x.k))+' '+hm(x.t)+'–'+hm(x.e||x.t+x.m*60000)+' ('+x.m+' dk)':x+' dk').join('<br>')||'Bugün mola kullanmadı';
  pop(nice(s.name),'<div class="sub" style="margin:0 0 12px;line-height:1.6">'+done+'</div><div class="shg">'+b(`edit('${s.id}')`,'✏️ Düzenle')+b(`toggleOff('${s.id}',${s.off?'false':'true'})`,s.off?'✅ İzinden al':'🚫 İzinli yap','off')+b(`code('${s.id}','${esc(s.name).replace(/'/g,'')}')`,'📲 Bildirim kodu')+b(`hist('${s.id}')`,'📅 Mola geçmişi')+b(`resetP('${s.id}')`,'♻️ Molayı sıfırla','off')+b(`del('${s.id}')`,'🗑 Sil','end')+'</div>');
  $('mo').textContent='Kapat';
};
window.admSet=()=>{
  const b=(f,x,c)=>`<button class="a ${c||'ed'}" onclick="${cl}${f}">${x}</button>`;
  pop('⚙ Ayarlar','<div class="shg">'+b("code('yonetici','Yönetici')",'📲 Yönetici bildirim kodu')+b("test('yonetici')",'🔔 Test bildirimi','off')+b('tok()','🔑 Ntfy token')+b('voiceTest()','🔊 Anons testi')+b('shiftClr()','🗑 Bu şubenin vardiyasını temizle','end')+'</div>');
  $('mo').textContent='Kapat';
};
const d3=window.draw;window.draw=function(){if(M=='y'&&D){try{admDraw();}catch(e){$('list').innerHTML='<div class="err">'+esc(emsg(e))+'</div>';}pgSync();}else d3();};
const sty3=document.createElement('style');
sty3.textContent='.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 12px}.st{border-radius:16px;padding:12px 4px;text-align:center;background:#172033;border:1px solid rgba(148,163,184,.14)}.st b{display:block;font-size:26px;line-height:1.1}.st span{font-size:11px;color:#94a3b8;font-weight:600}.st.b b{color:#60a5fa}.st.g b{color:#4ade80}.st.r{border-color:#ef4444;background:#3b0d12}.st.r b{color:#f87171}.admbar{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%}.admbar .a{min-height:48px;border-radius:14px;font-size:14px}.sec2{font-size:12px;font-weight:800;letter-spacing:.1em;color:#94a3b8;margin:14px 2px 8px;display:flex;justify-content:space-between}.sec2 span{background:#334155;color:#e2e8f0;border-radius:20px;padding:0 9px}.rows{display:flex;flex-direction:column;gap:8px}.row{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:16px;background:linear-gradient(160deg,#1f2b42,#162033);border:1px solid rgba(148,163,184,.12)}.av{flex:none;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#6366f1,#8b5cf6);font-size:15px}.av.dim{background:#334155;color:#94a3b8}.rm{flex:1;min-width:0}.rn{font-weight:700;font-size:15px}.rs{font-size:12px;color:#94a3b8;margin-top:3px}.bd{display:inline-block;padding:1px 8px;border-radius:20px;font-size:11px;font-weight:700;margin-right:6px}.bd.g{background:#166534;color:#bbf7d0}.bd.n{background:#334155;color:#e2e8f0}.bd.o{background:#b45309;color:#fff}.bd.y{background:#facc15;color:#422006}.more{flex:none;width:42px;height:42px;border-radius:12px;border:0;background:#334155;color:#fff;font-size:20px}.shg{display:grid;gap:8px}.shg .a{width:100%;min-height:48px}#list .card .ib{display:none}.pers{display:flex;gap:8px;overflow:auto;margin:0 0 10px;padding-bottom:4px}.pers button{flex:none;padding:8px 14px;border-radius:999px;border:1px solid rgba(148,163,184,.25);background:#172033;color:#cbd5e1;font-size:12px;font-weight:700}.pers button.on{background:linear-gradient(135deg,#3b82f6,#6d28d9);color:#fff;border-color:transparent}.perl{font-size:13px;color:#cbd5e1;margin:0 2px 10px}';
document.head.appendChild(sty3);

// ===== Liderlik tabloları (Ciro / Bira) + hedef kotası =====
const fmt=n=>Number(n).toLocaleString('tr-TR');
const tgt=async()=>{try{const x=await gs('getTargets');return +x[B+'_bira']||620;}catch(e){return 620;}};
window.setTgt=async()=>{const cur=await tgt();ask('🎯 Bira hedef kotası · '+BR[B],[{label:'Hedef (adet)',type:'number',val:String(cur)}],async v=>{try{await gs('setTarget',B,'bira',num(v[0]),PIN);PSIG='';pgSync();}catch(e){msg(emsg(e));}},'Kaydet');};
window.movPer=k=>{const g=selG(k);if(!g)return;ask('“'+g.k+'” dönemindeki '+g.rows.length+' kayıt hangi döneme taşınsın?\nBaşka bir dönemin adını yazarsan ikisi birleşir.',[{label:'Yeni dönem',val:g.k}],async v=>{try{const n=await gs('movePeriod',k,B,g.k,v[0].trim(),PIN);PSEL[k]=nR(v[0]);msg(n+' kayıt taşındı ✅');rptLoad();}catch(e){msg(emsg(e));}},'Taşı');};
function podium(it){
  const o=it.length>=3?[1,0,2]:it.length==2?[1,0]:[0],h=[112,86,68],mk=['🥇','🥈','🥉'];
  return '<div class="pod">'+o.map(i=>{const x=it[i];return `<div class="pd g${i+1}"><div class="pm">${i==0?'👑':''}</div><b class="av big">${esc(ini(x.name))}</b><div class="pn">${esc(nice(x.name).split(' ')[0])}</div><div class="pv">${x.val}</div><div class="ps">${x.sub||''}</div><div class="pb" style="height:${h[i]}px">${mk[i]}</div></div>`;}).join('')+'</div>';
}
function lbRow(rk,r,main,sub,pct,cls,trend,del,key){
  return `<div class="lr ${trend?'dn':''}"><span class="rk">${rk}</span><b class="av">${esc(ini(r.name))}</b><div class="lm"><div class="ln">${esc(nice(r.name))}${trend||''}</div><div class="ls">${sub}</div><div class="bar"><i class="${cls}" style="width:${Math.max(5,Math.min(100,pct))}%"></i></div></div><div class="lv">${main}</div>${del?`<button class="x2" data-k="${esc(key)}" onclick="${del}(this.dataset.k)">✕</button>`:''}</div>`;
}
function lbCiro(L,adm){
  const n=L.length,mx=L[0].ort||1,tc=L.reduce((a,r)=>a+Number(r.ciro||0),0),th=L.reduce((a,r)=>a+Number(r.hesap||0),0),low=Math.min(4,Math.max(0,n-3));
  let h='<div class="kp"><div><b>'+tl2(th?tc/th:0)+'</b><span>Takım ortalaması (TL)</span></div><div><b>'+fmt(th)+'</b><span>Toplam hesap</span></div><div><b>'+n+'</b><span>Garson</span></div></div>';
  h+='<div class="hot">🔥 '+esc(nice(L[0].name))+' zirvede! Sıralamada yükselmek için hesap başına ortalamanı artır.</div>';
  h+=podium(L.slice(0,3).map(r=>({name:r.name,val:tl2(r.ort)+' TL',sub:fmt(r.hesap)+' hesap'})));
  h+='<div class="lb">'+L.map((r,i)=>{
    if(!adm&&i<3)return '';
    const rk=i+1,dn=rk>n-low,top=i<3;
    return lbRow(rk,r,tl2(r.ort)+'<small>TL</small>',fmt(r.hesap)+' hesap'+(i?' · lidere '+tl2(mx-r.ort)+' TL':''),r.ort/mx*100,dn?'r':(top?'g':'o'),dn?'<span class="tr d">▼ Düşüşte</span>':(top?'<span class="tr u">▲ Zirvede</span>':''),adm?'rptDel':'',r.key);
  }).join('')+'</div>';
  return h;
}
function lbBira(L,adm,T){
  const n=L.length,tq=L.reduce((a,r)=>a+Number(r.qty||0),0),hit=L.filter(r=>r.qty>=T).length,near=L.filter(r=>r.qty<T)[0];
  let h='<div class="kp"><div><b>'+fmt(T)+'</b><span>Hedef kota</span></div><div><b>'+hit+' / '+n+'</b><span>Hedefe ulaşan</span></div><div><b>'+fmt(tq)+'</b><span>Toplam adet</span></div></div>';
  h+='<div class="hot">'+(near?'🔥 '+esc(nice(near.name))+' hedefe sadece <b>'+fmt(T-near.qty)+'</b> adet uzaklıkta! Herkes için hedef: '+fmt(T)+' adet':'🎉 Herkes hedefi geçti, tebrikler!')+'</div>';
  const rem=r=>r.qty>=T?'🎉 Hedef tamam (+'+fmt(r.qty-T)+')':'Kalan <b>'+fmt(T-r.qty)+'</b>';
  h+=podium(L.slice(0,3).map(r=>({name:r.name,val:fmt(r.qty)+' adet',sub:rem(r)})));
  h+='<div class="lb">'+L.map((r,i)=>{
    if(!adm&&i<3)return '';
    const p=r.qty/T*100;
    return lbRow(i+1,r,fmt(r.qty)+'<small>adet</small>',rem(r)+' · hedef '+fmt(T),p,p>=100?'g':(p>=70?'o':'r'),p>=100?'<span class="tr u">✓ Hedef</span>':'',adm?'beerDel':'',r.key);
  }).join('')+'</div>';
  return h;
}
// ----- Toplu rapor yükleme: tüm görseller için ortak dönem -----
window.rptBatch=async function(files){
  const rows=[];let bad=0;
  for(let i=0;i<files.length;i++){
    try{OCRL='📖 Görsel '+(i+1)+'/'+files.length;const r=parseRep(await ocr(files[i]));if(!r.name||!r.ciro||!r.hesap)bad++;rows.push(r);}
    catch(e){bad++;rows.push({name:'?',ciro:'',hesap:'',range:''});}
  }
  $('st').textContent='';OCRL='📖 Görsel okunuyor…';
  const cnt={};rows.forEach(r=>{if(r.range){const k=nR(r.range);cnt[k]=(cnt[k]||0)+1;}});
  const per=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0]||'';
  ask('Okunan satış raporları · '+BR[B]+'\n'+files.length+' görsel'+(bad?' · ⚠ '+bad+' tanesi eksik okundu (?), düzeltin':'')+'\nSatır: Ad;Ciro;Hesap',
    [{label:'Dönem (hepsi için ortak)',val:per},{label:'Raporlar',type:'textarea',val:rows.map(r=>[nice(r.name)||'?',r.ciro?tl2(r.ciro):'?',r.hesap||'?'].join(';')).join('\n')}],async v=>{
      let ok=0;const fail=[];
      for(const ln of v[1].split(/\r?\n/)){
        if(!ln.trim())continue;const p=ln.split(';'),d={name:(p[0]||'').trim(),ciro:num(p[1]),hesap:num(p[2]),range:v[0].trim(),firma:'',sube:B};
        if(!d.name||d.name=='?'||!(d.ciro>0)||!(d.hesap>0)){fail.push(ln);continue;}
        try{await gs('saveReport',d,PIN);ok++;}catch(e){fail.push(ln+' → '+emsg(e));}
      }
      rptLoad();msg(ok+' rapor kaydedildi ✅'+(fail.length?'\n\nKaydedilemeyenler:\n'+fail.join('\n'):''));
    },'Kaydet');
};
const sty4=document.createElement('style');
sty4.textContent='.kp{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 12px}.kp div{background:#172033;border:1px solid rgba(148,163,184,.14);border-radius:14px;padding:10px 6px;text-align:center}.kp b{display:block;font-size:18px}.kp span{font-size:11px;color:#94a3b8}.hot{background:linear-gradient(135deg,#7c2d12,#b45309);border-radius:14px;padding:12px;font-weight:600;font-size:14px;margin:0 0 12px;text-align:center;line-height:1.4}.pod{display:flex;align-items:flex-end;justify-content:center;gap:8px;margin:6px 0 14px}.pd{flex:1;text-align:center;display:flex;flex-direction:column;align-items:center;min-width:0}.pd .pm{height:22px;font-size:18px}.av.big{width:54px;height:54px;font-size:18px;margin:0 0 4px}.pd .pn{font-weight:800;font-size:13px}.pd .pv{font-size:13px;color:#4ade80;font-weight:800}.pd .ps{font-size:11px;color:#fde68a;min-height:14px}.pd .pb{width:100%;margin-top:6px;border-radius:12px 12px 0 0;display:grid;place-items:center;font-size:26px}.g1 .pb{background:linear-gradient(180deg,#f59e0b,#b45309)}.g2 .pb{background:linear-gradient(180deg,#94a3b8,#475569)}.g3 .pb{background:linear-gradient(180deg,#d97706,#78350f)}.lb{display:flex;flex-direction:column;gap:8px}.lr{display:flex;align-items:center;gap:10px;padding:10px;border-radius:16px;background:linear-gradient(160deg,#1f2b42,#162033);border:1px solid rgba(148,163,184,.12)}.lr.dn{border-color:rgba(239,68,68,.55)}.rk{flex:none;width:24px;text-align:center;font-weight:800;color:#94a3b8}.lm{flex:1;min-width:0}.ln{font-weight:700;font-size:14px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}.ls{font-size:12px;color:#94a3b8;margin:2px 0 6px}.bar{height:8px;border-radius:8px;background:#0f172a;overflow:hidden}.bar i{display:block;height:100%;border-radius:8px}.bar i.g{background:linear-gradient(90deg,#16a34a,#4ade80)}.bar i.o{background:linear-gradient(90deg,#f59e0b,#fbbf24)}.bar i.r{background:linear-gradient(90deg,#dc2626,#f87171)}.lv{flex:none;text-align:right;font-weight:800;font-size:15px}.lv small{display:block;font-size:10px;color:#94a3b8;font-weight:600}.tr{font-size:11px;font-weight:800;border-radius:20px;padding:1px 8px}.tr.d{background:#7f1d1d;color:#fecaca}.tr.u{background:#14532d;color:#bbf7d0}.x2{flex:none;border:0;background:#334155;color:#fff;border-radius:8px;width:28px;height:28px}';
document.head.appendChild(sty4);
var hs = document.querySelector('.hs'); if (hs) hs.textContent += ' · v8';   // yeni dosyanın yüklendiğini göstermek için
});
})();
