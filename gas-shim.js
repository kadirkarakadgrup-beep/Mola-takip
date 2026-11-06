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
const isoD_ = d => d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
const weekIso_ = () => { const o = tp_(), base = Date.UTC(+o.year, +o.month - 1, +o.day) - wd_() * 86400000; return [0, 1, 2, 3, 4, 5, 6].map(i => isoD_(new Date(base + i * 86400000))); };
// Etkin haftalık vardiya: tarihli kayıt (shd) varsa bu haftanın tarihlerinden, yoksa son yüklenen hafta (sh)
function effSh_(s, wk) {
  if (!s.shd) return s.sh;
  const w = wk || weekIso_();
  return w.some(d => d in s.shd) ? w.map(d => s.shd[d] || '') : s.sh;
}
function shift_(s, md, wd) {
  const SH = effSh_(s);
  if (!SH) return { on: true, start: 0, txt: '' };
  const cell = c => { if (!c) return null; const p = c.split('-'); return { a: mm_(p[0]), b: mm_(p[1]), t: c }; };
  const t = cell(SH[wd]), y = cell(SH[(wd + 6) % 7]);
  if (t && (t.b > t.a ? (md >= t.a && md < t.b) : md >= t.a)) return { on: true, start: t.a, txt: t.t };
  if (y && y.b <= y.a && md < y.b) return { on: true, start: y.a - 1440, txt: y.t };
  return { on: false, start: t ? t.a : 9999, txt: t ? t.t : '' };
}
const normR_ = s => String(s || '').trim().replace(/\s*[-–—]\s*/g, '-').replace(/\s+/g, ' ');
const todayLbl_ = () => new Date().toLocaleDateString('tr-TR', { timeZone: TZ });
const msgOf_ = (s, a) => `${nice_(s.name)} (${branchName_(s.branch)}) - ${a.dur} dk ${a.n} süresi doldu!`;

// ---------- Firestore ----------
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
      const sh = shift_(s, md, wd); c.on = sh.on; c.shTxt = sh.txt; c.shStart = sh.start; c.sh = effSh_(s);
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
  async getTopic(id, pin) { if (id === 'yonetici') auth_(pin); return topicOf_(id); },
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
      if (!name) return;
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
  async uploadShiftXls(branch, entries, dates, pin) {
    auth_(pin);
    if (branch !== 'opt' && branch !== 'mavi') throw new Error('Şube geçersiz');
    if (!Array.isArray(entries) || !entries.length || entries.length > 200) throw new Error('Vardiya listesi geçersiz');
    if (!Array.isArray(dates) || dates.length !== 7 || dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(String(d)))) throw new Error('Tarihler geçersiz');
    const staff = (await allStaff_()).filter(s => s.branch === branch), map = {}, known = {};
    staff.forEach(x => { known[norm_(x.name)] = 1; });
    entries.forEach(e => { const k = norm_(e && e.name); if (k && !map[k] && Array.isArray(e.week) && e.week.length === 7) map[k] = e; });
    const c0 = new Date(dates[0] + 'T00:00:00Z'); c0.setUTCDate(c0.getUTCDate() - 45);
    const cut = isoD_(c0), absent = [], missing = Object.keys(map).filter(k => !known[k]).map(k => map[k].name);
    let ok = 0;
    for (const x of staff) {
      const e = map[norm_(x.name)], week = e ? e.week.map(c => parseCell_(c)) : ['', '', '', '', '', '', ''];
      await upd_(x.id, s => {
        const shd = s.shd || {};
        dates.forEach((d, i) => { shd[d] = week[i]; });
        Object.keys(shd).forEach(k => { if (k < cut) delete shd[k]; });
        s.shd = shd; s.sh = week; s.shc = ['', '', '', '', '', '', ''];
        if (e && e.pg) { s.pg = true; s.po = Number(e.po) || 0; } else { delete s.pg; delete s.po; }
      });
      if (e) ok++; else absent.push(x.name);
    }
    return { ok: ok, missing: missing, absent: absent };
  },
  async clearShift(branch, pin) {
    auth_(pin);
    for (const x of (await allStaff_()).filter(s => s.branch === branch)) await upd_(x.id, s => { delete s.sh; delete s.shc; delete s.shd; delete s.pg; delete s.po; });
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
    return (await reports_()).map(r => ({ name: r.name, sube: r.sube, range: r.range, ciro: r.ciro, hesap: r.hesap, ort: r.ort, t: r.t })).sort((a, b) => b.ort - a.ort);
  },
  async delReport(key, pin) { auth_(pin); await col('reports').doc(key).delete(); },
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
  async notifyStaff(id, text, pin) {
    auth_(pin);
    const txt = String(text || '').trim().slice(0, 200) || 'Molan bitti, işe dön!';
    await upd_(id, s => { s.msg = { text: txt, t: Date.now() }; });
    const r = await post_(topicOf_(id), '📣 Yönetici mesajı', txt);
    return { ok: r.ok, err: r.err || '' };
  },
  async notifyBranch(sube, text, pin) {
    auth_(pin);
    if (sube !== 'opt' && sube !== 'mavi') throw new Error('Şube geçersiz');
    const txt = String(text || '').trim().slice(0, 200);
    if (!txt) throw new Error('Mesaj boş');
    const st = (await allStaff_()).filter(s => s.branch === sube && !s.off);
    let ok = 0;
    for (const s of st) {
      await upd_(s.id, x => { x.msg = { text: txt, t: Date.now() }; });
      const r = await post_(topicOf_(s.id), '📣 Yönetici mesajı', txt);
      if (r.ok) ok++;
    }
    return { n: st.length, ok: ok };
  },
  async saveVoice(id, data, pin) {
    auth_(pin);
    if (typeof data !== 'string' || !/^data:audio\/(wav|x-wav|wave);base64,/.test(data) || data.length > 600000) throw new Error('Kayıt geçersiz ya da çok uzun');
    const T = Date.now();
    await col('voice').doc(id).set({ a: data, t: T });
    await upd_(id, s => { s.hasVoice = true; s.voiceT = T; });
    return 'ok';
  },
  async getVoice(id) { const d = await col('voice').doc(id).get(); return d.exists ? d.data() : null; },
  async delVoice(id, pin) { auth_(pin); await col('voice').doc(id).delete(); await upd_(id, s => { s.hasVoice = false; s.voiceT = 0; }); return 'ok'; },
  async sendRadio(to, sube, data, pin) {
    auth_(pin);
    if (sube !== 'opt' && sube !== 'mavi') throw new Error('Şube geçersiz');
    if (typeof data !== 'string' || !/^data:audio\/(wav|x-wav|wave);base64,/.test(data) || data.length > 700000) throw new Error('Kayıt geçersiz ya da çok uzun');
    const all = to === 'all', T = Date.now();
    await col('radio').doc(all ? 'all_' + sube : to).set({ a: data, t: T, from: 'Yönetici' });
    const st = (await allStaff_()).filter(s => all ? (s.branch === sube && !s.off) : s.id === to);
    await Promise.all(st.map(s => post_(topicOf_(s.id), '📻 Telsiz çağrısı', 'Yönetici seni telsizden çağırıyor. Uygulamayı aç.')));
    return { n: st.length };
  },
  async saveAiReport(sube, title, cols, rj, notes, pin) {
    auth_(pin);
    if (sube !== 'opt' && sube !== 'mavi') throw new Error('Şube geçersiz');
    if (!Array.isArray(cols) || !cols.length || typeof rj !== 'string' || rj.length > 200000) throw new Error('Rapor geçersiz');
    const id = sube + '_' + Date.now();
    await col('aireports').doc(id).set({ id, sube, title: String(title || 'Rapor').slice(0, 80), cols: cols.map(String).slice(0, 30), rj, notes: String(notes || '').slice(0, 1500), t: Date.now() });
    return id;
  },
  async listAiReports() { return (await col('aireports').get()).docs.map(d => d.data()).sort((a, b) => b.t - a.t); },
  async delAiReport(id, pin) { auth_(pin); await col('aireports').doc(id).delete(); },
  async saveCat(rows, sube, range, pin) {
    auth_(pin);
    if (sube !== 'opt' && sube !== 'mavi') throw new Error('Şube geçersiz');
    if (!Array.isArray(rows) || !rows.length) throw new Error('Kaydedilecek satır yok');
    const rg = normR_(range).slice(0, 40) || ('Yükleme ' + todayLbl_()), cl = x => (x === null || x === '' || !isFinite(Number(x))) ? null : Number(x);
    await Promise.all(rows.slice(0, 80).map(r => {
      const name = String(r.name || '').trim();
      if (!name) throw new Error('Ad boş olamaz');
      const key = sube + '_' + norm_(name) + '_' + norm_(rg), d = { key, sube, name, range: rg, t: Date.now() };
      if (r.bas !== undefined) d.bas = cl(r.bas);
      if (r.tat !== undefined) d.tat = cl(r.tat);
      return col('cat').doc(key).set(d, { merge: true });
    }));
    return { n: Math.min(rows.length, 80) };
  },
  async listCat() { return (await col('cat').get()).docs.map(d => d.data()); },
  async delCat(key, pin) { auth_(pin); await col('cat').doc(key).delete(); },
  async getServis(sube, ym) {
    if (sube !== 'opt' && sube !== 'mavi') throw new Error('Şube geçersiz');
    if (!/^\d{4}-\d{2}$/.test(String(ym))) throw new Error('Ay geçersiz');
    const a = await Promise.all([col('servis').doc(sube + '_' + ym).get(), col('cfg').doc('servis_' + sube).get()]);
    return { routes: a[1].exists && (a[1].data().list || []).length ? a[1].data().list : ['Buca', 'Torbalı', 'Ayrancılar'], days: a[0].exists ? (a[0].data().days || {}) : {} };
  },
  async getServisAll(sube) {
    if (sube !== 'opt' && sube !== 'mavi') throw new Error('Şube geçersiz');
    return (await col('servis').where('sube', '==', sube).get()).docs.map(d => ({ ym: d.data().ym, days: d.data().days || {} })).sort((a, b) => a.ym < b.ym ? -1 : 1);
  },
  async saveServisDay(sube, date, r, n, pin) {
    auth_(pin);
    if (sube !== 'opt' && sube !== 'mavi') throw new Error('Şube geçersiz');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error('Tarih geçersiz');
    const rr = (Array.isArray(r) ? r : []).map(x => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 20), nn = String(n || '').trim().slice(0, 200);
    const ym = date.slice(0, 7), ref = col('servis').doc(sube + '_' + ym);
    if (!rr.length && !nn) await ref.set({ sube: sube, ym: ym, t: Date.now(), days: { [date]: firebase.firestore.FieldValue.delete() } }, { merge: true });
    else await ref.set({ sube: sube, ym: ym, t: Date.now(), days: { [date]: { r: rr, n: nn } } }, { merge: true });
    return 'ok';
  },
  async saveServisRoutes(sube, list, pin) {
    auth_(pin);
    if (sube !== 'opt' && sube !== 'mavi') throw new Error('Şube geçersiz');
    const L = (Array.isArray(list) ? list : []).map(x => String(x).trim().slice(0, 40)).filter((x, i, a) => x && a.indexOf(x) == i).slice(0, 30);
    if (!L.length) throw new Error('En az bir güzergah olmalı');
    await col('cfg').doc('servis_' + sube).set({ list: L, t: Date.now() });
    return L;
  },
  async getGroups() { const d = await col('cfg').doc('groups').get(); return d.exists ? (d.data().list || []) : []; },
  async saveGroups(list, pin) {
    auth_(pin);
    if (!Array.isArray(list) || list.length > 40) throw new Error('Grup listesi geçersiz');
    const clean = list.map(g => ({ name: String(g.name || '').trim().slice(0, 30), codes: String(g.codes || '').replace(/[^0-9,;\s]/g, '').trim().slice(0, 200), words: String(g.words || '').trim().slice(0, 200) })).filter(g => g.name && (g.codes || g.words));
    await col('cfg').doc('groups').set({ list: clean, t: Date.now() });
    return clean;
  },
  async getTargets() { const d = await col('cfg').doc('targets').get(); return d.exists ? d.data() : {}; },
  async saveShiftImg(sube, img, pin) {
    auth_(pin);
    if (sube !== 'opt' && sube !== 'mavi') throw new Error('Şube geçersiz');
    if (typeof img !== 'string' || img.length > 950000) throw new Error('Görsel çok büyük');
    if (img && !/^data:image\/(jpeg|png|webp);base64,/.test(img)) throw new Error('Görsel biçimi geçersiz');
    await col('cfg').doc('shiftimg_' + sube).set({ img: img, t: Date.now() });
    return 'ok';
  },
  async getShiftImg(sube) { const d = await col('cfg').doc('shiftimg_' + sube).get(); return d.exists ? d.data() : null; },
  async setTarget(sube, kind, val, pin) {
    auth_(pin);
    const v = Number(val);
    if ((sube !== 'opt' && sube !== 'mavi') || ['bira', 'baslangic', 'tatli'].indexOf(kind) < 0 || !(v >= 0) || (kind === 'bira' && !(v > 0))) throw new Error('Hedef geçersiz');
    await col('cfg').doc('targets').set({ [sube + '_' + kind]: v }, { merge: true });
    return v;
  },
  async movePeriod(kind, sube, from, to, pin) {
    auth_(pin);
    const c = kind === 'ciro' ? 'reports' : (kind === 'cat' ? 'cat' : 'beer'), dst = normR_(to);
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
  pages.sort((a,b)=>(a.n!=null&&b.n!=null)?a.n-b.n:a.i-b.i);
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
    $('list').insertAdjacentHTML('afterbegin','<div class="hi"><b>'+esc(ini(s0.name))+'</b><div><div class="hi1">Merhaba, '+esc(nice(s0.name).split(' ')[0])+' 👋</div><div class="hi2">'+shiftTwo(s0)+'☕ Kalan mola '+left+' dk</div></div></div>');
    mbn(s0,me);vFetch(s0);radioListen(me);
    return;}
  radioListen('');head();
  const L=D.staff.filter(s=>!s.off).sort((a,b)=>a.name.localeCompare(b.name,'tr')),sig=L.map(s=>s.id).join();
  if($('pks')&&window.__pkSig===sig)return;
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
      +(me?'<div class="chipsrow"><button class="pill" onclick="myCode()">🔔 Bildirim kodum</button><button class="pill" onclick="radioMode()">'+(window.__rwl?'📻 Telsiz dinleme: AÇIK':'📻 Telsiz dinle')+'</button><button class="pill" onclick="pickMe(\'\')">↩ Kişiyi değiştir</button></div>':'');
  }else if(M=='y')$('tools').innerHTML='';
};
const sty=document.createElement('style');
sty.textContent='.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;width:100%}.tiles button{border:1px solid rgba(148,163,184,.18);border-radius:18px;padding:14px 4px;background:linear-gradient(160deg,#1f2b42,#162033);color:#e2e8f0;font-weight:700;font-size:13px;line-height:1.25;box-shadow:0 6px 16px rgba(0,0,0,.28);display:flex;flex-direction:column;align-items:center;gap:6px}.tiles i{font-style:normal;font-size:26px}.tiles button:active{transform:scale(.97)}.pill{border:1px solid rgba(148,163,184,.25);background:rgba(148,163,184,.1);color:#e2e8f0;border-radius:999px;padding:10px 16px;font-weight:600;font-size:13px}.chipsrow{display:flex;gap:8px;flex-wrap:wrap;width:100%}.pkh{font-weight:800;font-size:16px;display:flex;justify-content:space-between;align-items:center;margin:4px 2px}.pkh span{font-size:12px;color:#94a3b8;font-weight:600}.pks{width:100%;padding:13px 14px;border-radius:14px;border:1px solid #334155;background:#0f172a;color:#fff;font-size:16px;margin:8px 0 12px}.pkg{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pkc{display:flex;align-items:center;gap:10px;text-align:left;padding:10px;border-radius:16px;border:1px solid rgba(148,163,184,.15);background:linear-gradient(160deg,#1f2b42,#162033);color:#f1f5f9;font-size:14px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,.25)}.pkc b{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#6366f1,#8b5cf6);font-size:14px}.pkc span{line-height:1.2;word-break:break-word}.card{border-radius:20px}#list .btns .a{min-height:56px;font-size:16px}';
document.head.appendChild(sty);

// ===== Sayfalar: Mola | Ciro | Bira | Vardiya (her biri tam sayfa) =====
let PGV='mola',PSIG='',PRQ=0;
const NV=document.createElement('div');NV.id='nv';NV.className='nv';document.querySelector('.hd').after(NV);
const PG=document.createElement('div');PG.id='pg';PG.hidden=true;$('beer').after(PG);
const NAVS=[['mola','🕐','Mola'],['vard','🗓️','Vardiya'],['servis','🚌','Servis'],['rep','📁','Rapor']];
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
const fCat=async()=>(await gs('listCat')).filter(inB);
const fBira=async()=>(await gs(M=='y'?'listBeer':'listBeerPub',...(M=='y'?[PIN]:[]))).filter(inB).sort((a,b)=>b.qty-a.qty);
const rCiro=L=>{const c=L.reduce((a,r)=>a+Number(r.ciro||0),0),h=L.reduce((a,r)=>a+Number(r.hesap||0),0);return [['#','Ad Soyad','Ciro (TL)','Hesap Sayısı','Ortalama (TL)']].concat(L.map((r,i)=>[i+1,nice(r.name),Number(r.ciro),Number(r.hesap),Number(r.ort)]),[['','TOPLAM',c,h,h?Math.round(c/h*100)/100:0]]);};
const rBira=L=>[['#','Ad Soyad','Bira Miktarı (Wheel hariç)','Dönem']].concat(L.map((r,i)=>[i+1,nice(r.name),Number(r.qty),r.range||'']),[['','TOPLAM',L.reduce((a,r)=>a+Number(r.qty||0),0),'']]);
const rVard=()=>[['Ad Soyad'].concat(DAYS.map(d=>d.charAt(0)+d.slice(1).toLocaleLowerCase('tr')))].concat(((D&&D.staff)||[]).filter(s=>!s.off&&s.sh).map(s=>[nice(s.name)].concat(DAYS.map((d,i)=>(s.sh[i]||'İZİN').replace('-','–')))));
const PSEL={ciro:null,bira:null,cat:null},PC={ciro:[],bira:[],cat:[]};
const nR=s=>String(s||'').trim().replace(/\s*[-–—]\s*/g,'-').replace(/\s+/g,' ');
const grp=L=>{const m={};L.forEach(r=>{const k=nR(r.range)||('Yükleme '+new Date(r.t||0).toLocaleDateString('tr-TR',{timeZone:'Europe/Istanbul'}));const g=m[k]||(m[k]={k:k,t:0,rows:[]});g.rows.push(r);g.t=Math.max(g.t,r.t||0);});return Object.values(m).sort((a,b)=>b.t-a.t);};
const selG=k=>{const G=PC[k];return (M=='y'&&PSEL[k]&&G.find(g=>g.k==PSEL[k]))||G[0]||null;};
const ensG=async k=>{if(!PC[k].length)PC[k]=grp(await(k=='ciro'?fCiro():(k=='cat'?fCat():fBira())));return selG(k);};
window.setPer=(k,p)=>{PSEL[k]=p;renderPg(true);};
window.delPer=k=>{const g=selG(k);if(!g)return;ask('“'+g.k+'” dönemindeki '+g.rows.length+' kayıt silinsin mi?',[],async()=>{try{for(const r of g.rows)await gs(k=='ciro'?'delReport':(k=='cat'?'delCat':'delBeer'),r.key,PIN);PSEL[k]=null;rptLoad();}catch(e){msg(emsg(e));}},'Sil');};
window.pgXls=async k=>{
  try{
    const fn='HappyMoons_'+BR[B].replace(/\s/g,'_')+'_'+new Date().toISOString().slice(0,10),sh=[];
    if(k=='ciro'||k=='all'){const g=await ensG('ciro');if(g)sh.push(['Ciro '+g.k.replace(/[\\\/?*\[\]:]/g,'-'),rCiro(g.rows.slice().sort((a,b)=>b.ort-a.ort))]);}
    if(k=='bira'||k=='all'){const g=await ensG('bira');if(g)sh.push(['Bira '+g.k.replace(/[\\\/?*\[\]:]/g,'-'),rBira(g.rows.slice().sort((a,b)=>b.qty-a.qty))]);}
    if(k=='cat'||k=='all'){const g=await ensG('cat');if(g)sh.push(['Başl-Tatlı '+g.k.replace(/[\\\/?*\[\]:]/g,'-'),[['#','Ad Soyad','Başlangıç (miktar)','Tatlı (miktar)']].concat(g.rows.slice().sort((a,c)=>nice(a.name).localeCompare(nice(c.name),'tr')).map((r,i)=>[i+1,nice(r.name),typeof r.bas=='number'?r.bas:'',typeof r.tat=='number'?r.tat:'']))]);}
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
let CSUB='ort',REPSUB='ciro';
window.setSub=x=>{CSUB=x;renderPg(true);};
async function renderPg(cache){
  const v=PGV,my=++PRQ,adm=M=='y',b=(f,x,c)=>`<button class="a ${c||'ed'}" onclick="${f}">${x}</button>`;
  let title='',acts='',body='',per='';
  const perBar=(k,g,G)=>adm?'<div class="pers">'+G.map(x=>`<button class="${g&&x.k==g.k?'on':''}" data-p="${esc(x.k)}" onclick="setPer('${k}',this.dataset.p)">${esc(x.k)} · ${x.rows.length}</button>`).join('')+'</div>':(g?`<div class="perl">Son yüklenen dönem: <b>${esc(g.k)}</b> · ${new Date(g.t).toLocaleDateString('tr-TR')}</div>`:'');
  try{
    if(v=='ciro'||v=='bira'||(v=='rep'&&REPSUB=='ciro')){
      const bi=v=='bira',vv=v=='rep'?'ciro':v;
      if(!(cache&&PC[vv].length))PC[vv]=grp(await(bi?fBira():fCiro()));
      const G=PC[vv],g=selG(vv),L=g?g.rows.slice():[];
      const T=bi?((cache&&window.__T)?window.__T:(window.__T=await tgt())):0;
      title=bi?'🍺 Bira Satışı':(v=='rep'?'📁 Raporlar':'📊 Ciro & Ortalama');per=perBar(vv,g,G);
      acts=b(`pgXls('${vv}')`,'⬇ Excel','')+(adm?(bi?b('beerPick()','📷 Görselleri yükle')+b('beerManual()','✍ Elle'):b('ciroXlsPick()','📎 Excel yükle','an')+b('rptManual()','✍ Elle'))+(g?b(`movPer('${vv}')`,'🔀 Dönemi taşı')+b(`delPer('${vv}')`,'🗑 Dönemi sil','off'):'')+(bi?b('setTgt()','🎯 Hedef: '+T):''):'');
      const seg=bi?'':`<div class="seg"><button class="${CSUB=='ort'?'on':''}" onclick="setSub('ort')">📊 Ortalama</button><button class="${CSUB=='ciro'?'on':''}" onclick="setSub('ciro')">💰 Ciro</button></div>`;
      body=(v=='rep'?repTabs()+leadCards(L):'')+seg+(L.length?(bi?lbBira(L.sort((a,c)=>c.qty-a.qty),adm,T):lbCiro(L,adm,CSUB)):'<p class="sub" style="padding:10px">Bu şube için henüz kayıt yok.'+(adm?' 📎 Excel yükle ile "Personel Satış Detay Raporu"nu ekle.':'')+'</p>');
    }else if(v=='rep'){
      const L=(await gs('listAiReports')).filter(r=>r.sube==B);window.__reps=L;
      title='📁 Raporlar';acts=adm?b('aiUI()','📎 Excel ile oluştur','an'):'';
      const sel=L.find(r=>r.id==window.__repSel)||L[0];
      body=repTabs()+(sel?(adm?window.repBoard(sel):window.repMine(sel)):'')+(L.length?'<div class="sec2">📁 KAYITLI RAPORLAR <span>'+L.length+'</span></div><div class="lb">'+L.map(r=>`<div class="lr"${sel&&r.id==sel.id?' style="border-color:#6366f1"':''}><b class="av">📊</b><div class="lm"><div class="ln">${esc(r.title)}</div><div class="ls">${new Date(r.t).toLocaleDateString('tr-TR')} · ${(r.cols||[]).length} sütun</div></div><div class="rb2"><button class="x2 w" data-i="${esc(r.id)}" onclick="repOpen(this.dataset.i)">👁</button>${adm?`<button class="x2 w" data-i="${esc(r.id)}" onclick="repXls(this.dataset.i)">⬇</button>`:''}${adm?`<button class="x2 w" data-i="${esc(r.id)}" onclick="repDel(this.dataset.i)">✕</button>`:''}</div></div>`).join('')+'</div>':'<p class="sub" style="padding:10px">Henüz kaydedilmiş rapor yok.'+(adm?' 🤖 ile bir tane oluştur.':'')+'</p>');
    }else if(v=='servis'){
      await svLoad();
      title='🚌 Servis Takip';
      acts=b('svXls()','⬇ Bu ay Excel','')+b('svXlsAll()','⬇ Tüm aylar Excel','an');
      body=svHtml(adm);
    }else if(v=='cat'){
      if(!(cache&&PC.cat.length))PC.cat=grp(await fCat());
      const G=PC.cat,g=selG('cat'),ts=CATSUB=='tat',kind=ts?'tatli':'baslangic',lbl=ts?'tatlı':'başlangıç',T=await tgtK(kind);
      title='🍰 Başlangıç & Tatlı';per=perBar('cat',g,G);
      const L=g?g.rows.filter(r=>typeof(ts?r.tat:r.bas)=='number').map(r=>Object.assign({},r,{qty:Number(ts?r.tat:r.bas)})).sort((a,c)=>c.qty-a.qty):[];
      acts=b("pgXls('cat')",'⬇ Excel','')+(adm?b('catPick()','📷 Görselleri yükle')+b('catManual()','✍ Elle')+(g?b("movPer('cat')",'🔀 Dönemi taşı')+b("delPer('cat')",'🗑 Dönemi sil','off'):'')+b("setTgt('"+kind+"')",'🎯 Hedef: '+(T||'—')):'');
      body=`<div class="seg"><button class="${ts?'':'on'}" onclick="setCs('bas')">🥗 Başlangıç</button><button class="${ts?'on':''}" onclick="setCs('tat')">🍰 Tatlı</button></div>`+(L.length?lbQty(L,adm,T,lbl):'<p class="sub" style="padding:10px">Bu şube için henüz kayıt yok.</p>');
    }else{
      title='🗓️ Haftalık Vardiya';
      const si=await gs('getShiftImg',B).catch(()=>null);window.__shi=(si&&si.img)?si:null;
      acts=b("pgXls('vard')",'⬇ Excel','')+(adm?b('shiftXlsPick()','📎 Vardiya Excel yükle','an')+b('postaUI()','📋 Postalar')+(window.__shi?b('shImgDel()','🗑 Görseli kaldır','off'):'')+b('shiftClr()','🗑 Tabloyu temizle','off'):'');
      body=(window.__shi?`<div class="simg"><div class="simgh">🖼 Güncel vardiya görseli<span>${new Date(si.t).toLocaleDateString('tr-TR')}</span></div><img src="${si.img}" alt="Vardiya" onclick="showShImg()"><div class="simgt">Büyütmek için dokun</div></div>`:'')+vardHtml();
    }
  }catch(e){body='<div class="err">'+esc(emsg(e))+'</div>';}
  if(my!==PRQ||PGV!=v)return;
  PG.innerHTML=`<div class="pgh"><h2>${title}<small>${BR[B]}</small></h2><div class="pga">${acts}</div></div>${per}<div class="pgb">${body}</div>`;
}
const d2=window.draw;window.draw=function(){d2();pgSync();};
const orl=window.rptLoad;window.rptLoad=function(){orl();if(PGV!='mola'){PSIG='';setTimeout(pgSync,900);}};
// ----- Bildirim kurulumu -----
window.myCode=()=>google.script.run.withFailureHandler(e=>msg(emsg(e))).withSuccessHandler(c=>{
  pop('🔔 Mola bildirimi','<p style="margin:0 0 10px;line-height:1.5">Molan bitince telefonuna bildirim gelsin:</p><ol style="padding-left:20px;line-height:1.6;margin:0 0 12px"><li>Telefonuna <b>ntfy</b> uygulamasını kur.</li><li>Aşağıdaki düğmeye bas ya da kodu uygulamada <b>+</b> ile ekle.</li></ol><div style="background:#0f172a;border-radius:12px;padding:12px;font-family:monospace;word-break:break-all;margin-bottom:10px">'+esc(c)+'</div><a class="a" style="margin-bottom:8px" href="ntfy://ntfy.sh/'+encodeURIComponent(c)+'">📲 ntfy\'de aç</a><button class="a ed" style="width:100%" onclick="try{navigator.clipboard.writeText(\''+c+'\');this.textContent=\'✓ Kopyalandı\';}catch(e){}">Kodu kopyala</button>');
  $('mo').textContent='Kapat';
}).getTopic(getMe(),'');
// ----- Personelin kendi ekranında da sesli uyarı -----
const oa=window.alarm;window.alarm=function(s){oa(s);if(M=='g'){playAnons(s.id);let n=0;const iv=setInterval(()=>{if(++n>3||M!='g'||!document.querySelector('.card.late')){clearInterval(iv);return;}playAnons(s.id);},30000);}};
const sty2=document.createElement('style');
sty2.textContent='.nv{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:0 0 12px}.nv button{border:1px solid rgba(148,163,184,.18);border-radius:16px;padding:10px 2px;background:#172033;color:#94a3b8;font-weight:700;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:3px}.nv button i{font-style:normal;font-size:20px}.nv button.on{background:linear-gradient(135deg,#3b82f6,#6d28d9);color:#fff;border-color:transparent;box-shadow:0 6px 16px rgba(79,70,229,.45)}#pg .pgh{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin:2px 0 12px}#pg h2{margin:0;font-size:19px}#pg h2 small{display:block;font-size:12px;color:#fde68a;letter-spacing:.14em;text-transform:uppercase;margin-top:3px}#pg .pga{display:flex;gap:8px;flex-wrap:wrap}#pg .pga .a{padding:10px 14px}#pg .pgb{background:#0b1220;border:1px solid rgba(148,163,184,.12);border-radius:18px;padding:10px}#pg .xl2{font-size:14px!important}#pg .xl{font-size:13px}.hi{display:flex;align-items:center;gap:12px;padding:14px;border-radius:20px;background:linear-gradient(135deg,#1e3a8a,#4c1d95);margin:0 0 12px;border:1px solid rgba(255,255,255,.1)}.hi b{flex:none;width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#f59e0b,#fde68a);color:#1e1b4b;font-size:17px}.hi1{font-weight:800;font-size:18px}.hi2{font-size:13px;color:#e2e8f0;margin-top:3px}';
document.head.appendChild(sty2);

// ===== Yönetici paneli =====
const rowH=s=>{
  const left=Math.max(0,D.total-usedOf(s));
  const bd=s.off?['İzinli','o']:(s.on===false?['Vardiya dışı','n']:(s.turn?['Sırada','y']:(s.bitti?['Molalar bitti','g']:['Vardiyada','g'])));
  return `<div class="row"><b class="av ${s.off||s.on===false?'dim':''}">${esc(ini(s.name))}</b><div class="rm"><div class="rn">${esc(nice(s.name))}</div><div class="rs"><span class="bd ${bd[1]}">${bd[0]}</span>${s.shTxt?'🕗 '+esc(s.shTxt.replace('-','–'))+' · ':''}☕ ${left} dk</div></div><button class="more bell" onclick="msgStaff('${s.id}')">🔔</button><button class="more" onclick="sheet('${s.id}')">⋯</button></div>`;
};
function admDraw(){
  head();$('sum').innerHTML='';$('rpt').innerHTML='';$('beer').innerHTML='';
  const now=Date.now()+off,S=D.staff,act=S.filter(s=>s.active).sort((a,b)=>a.active.start-b.active.start);
  const late=act.filter(s=>!s.active.paused&&endOf(s.active)<now).length,onsh=S.filter(s=>!s.off&&s.on!==false).length;
  const st=(n,l,c)=>`<div class="st ${c||''}"><b>${n}</b><span>${l}</span></div>`;
  const rest=S.filter(s=>!s.active).sort((a,b)=>((a.off?2:a.on===false?1:0)-(b.off?2:b.on===false?1:0))||(a.sira||999)-(b.sira||999)||a.name.localeCompare(b.name,'tr'));
  let h=admBar()+'<div class="stats">'+st(act.length,'Molada','b')+st(late,'Süre aşan',late?'r':'')+st(onsh,'Vardiyada','g')+st(S.length,'Toplam')+'</div>';
  h+='<div class="dt">📅 '+new Date().toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric',weekday:'long'})+'</div>';
  if(act.length)h+='<div class="sec2">MOLADA <span>'+act.length+'</span></div><div class="grid">'+act.map(tile).join('')+'</div>';
  h+='<div class="sec2">PERSONEL <span>'+rest.length+'</span></div><div class="rows">'+(rest.map(rowH).join('')||'<p class="sub">Şubede personel yok. ➕ Personel ekle ile başla.</p>')+'</div>';
  $('list').innerHTML=h;
  document.querySelectorAll('#list .card[data-id]').forEach(c=>c.insertAdjacentHTML('beforeend','<div class="btns" style="flex-direction:row"><button class="a an" style="flex:2" onclick="msgStaff(\''+c.dataset.id+'\')">🔔 Mesaj gönder</button><button class="a x" style="flex:1" onclick="sheet(\''+c.dataset.id+'\')">⋯</button></div>'));
  tick();
}
const cl="$('ov').hidden=true;";
window.sheet=id=>{
  const s=D.staff.find(x=>x.id==id);if(!s)return;
  const b=(f,x,c)=>`<button class="a ${c||'ed'}" onclick="${cl}${f}">${x}</button>`;
  const done=(s.done||[]).map(x=>typeof x=='object'?esc(kn(x.k))+' '+hm(x.t)+'–'+hm(x.e||x.t+x.m*60000)+' ('+x.m+' dk)':x+' dk').join('<br>')||'Bugün mola kullanmadı';
  pop(nice(s.name),'<div class="sub" style="margin:0 0 12px;line-height:1.6">'+done+'</div><div class="shg">'+b(`msgStaff('${s.id}')`,'🔔 Bildirim mesajı gönder','an')+b(`edit('${s.id}')`,'✏️ Düzenle')+b(`toggleOff('${s.id}',${s.off?'false':'true'})`,s.off?'✅ İzinden al':'🚫 İzinli yap','off')+b(`code('${s.id}','${esc(s.name).replace(/'/g,'')}')`,'📲 Bildirim kodu')+b(`hist('${s.id}')`,'📅 Mola geçmişi')+b(`resetP('${s.id}')`,'♻️ Molayı sıfırla','off')+b(`del('${s.id}')`,'🗑 Sil','end')+'</div>');
  $('mo').textContent='Kapat';
};
window.admSet=()=>{
  const b=(f,x,c)=>`<button class="a ${c||'ed'}" onclick="${cl}${f}">${x}</button>`;
  pop('⚙ Ayarlar','<div class="shg">'+b("code('yonetici','Yönetici')",'📲 Yönetici bildirim kodu')+b("test('yonetici')",'🔔 Test bildirimi','off')+b('tok()','🔑 Ntfy token')+b('aiKey()','🔑 Gemini anahtarı')+b('shiftClr()','🗑 Bu şubenin vardiyasını temizle','end')+'</div>');
  $('mo').textContent='Kapat';
};
const d3=window.draw;window.draw=function(){if(M=='y')radioListen('');if(M=='y'&&D){try{admDraw();}catch(e){$('list').innerHTML='<div class="err">'+esc(emsg(e))+'</div>';}pgSync();}else d3();};
const sty3=document.createElement('style');
sty3.textContent='.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 12px}.st{border-radius:16px;padding:12px 4px;text-align:center;background:#172033;border:1px solid rgba(148,163,184,.14)}.st b{display:block;font-size:26px;line-height:1.1}.st span{font-size:11px;color:#94a3b8;font-weight:600}.st.b b{color:#60a5fa}.st.g b{color:#4ade80}.st.r{border-color:#ef4444;background:#3b0d12}.st.r b{color:#f87171}.admbar{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%}.admbar .a{min-height:48px;border-radius:14px;font-size:14px}.sec2{font-size:12px;font-weight:800;letter-spacing:.1em;color:#94a3b8;margin:14px 2px 8px;display:flex;justify-content:space-between}.sec2 span{background:#334155;color:#e2e8f0;border-radius:20px;padding:0 9px}.rows{display:flex;flex-direction:column;gap:8px}.row{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:16px;background:linear-gradient(160deg,#1f2b42,#162033);border:1px solid rgba(148,163,184,.12)}.av{flex:none;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#6366f1,#8b5cf6);font-size:15px}.av.dim{background:#334155;color:#94a3b8}.rm{flex:1;min-width:0}.rn{font-weight:700;font-size:15px}.rs{font-size:12px;color:#94a3b8;margin-top:3px}.bd{display:inline-block;padding:1px 8px;border-radius:20px;font-size:11px;font-weight:700;margin-right:6px}.bd.g{background:#166534;color:#bbf7d0}.bd.n{background:#334155;color:#e2e8f0}.bd.o{background:#b45309;color:#fff}.bd.y{background:#facc15;color:#422006}.more{flex:none;width:42px;height:42px;border-radius:12px;border:0;background:#334155;color:#fff;font-size:20px}.shg{display:grid;gap:8px}.shg .a{width:100%;min-height:48px}#list .card .ib{display:none}.pers{display:flex;gap:8px;overflow:auto;margin:0 0 10px;padding-bottom:4px}.pers button{flex:none;padding:8px 14px;border-radius:999px;border:1px solid rgba(148,163,184,.25);background:#172033;color:#cbd5e1;font-size:12px;font-weight:700}.pers button.on{background:linear-gradient(135deg,#3b82f6,#6d28d9);color:#fff;border-color:transparent}.perl{font-size:13px;color:#cbd5e1;margin:0 2px 10px}';
document.head.appendChild(sty3);

// ===== Liderlik tabloları (Ciro / Bira) + hedef kotası =====
const fmt=n=>Number(n).toLocaleString('tr-TR');
const tgt=async()=>{try{const x=await gs('getTargets');return +x[B+'_bira']||620;}catch(e){return 620;}};
window.setTgt=async(kind)=>{kind=typeof kind=='string'?kind:'bira';const cur=kind=='bira'?await tgt():await tgtK(kind),nm={bira:'Bira',baslangic:'Başlangıç',tatli:'Tatlı'}[kind];ask('🎯 '+nm+' hedef kotası · '+BR[B]+(kind=='bira'?'':'\n0 yazarsan hedef kapanır'),[{label:'Hedef (miktar)',type:'number',val:String(cur)}],async v=>{try{await gs('setTarget',B,kind,num(v[0]),PIN);window.__T=0;PSIG='';pgSync();}catch(e){msg(emsg(e));}},'Kaydet');};
window.movPer=k=>{const g=selG(k);if(!g)return;ask('“'+g.k+'” dönemindeki '+g.rows.length+' kayıt hangi döneme taşınsın?\nBaşka bir dönemin adını yazarsan ikisi birleşir.',[{label:'Yeni dönem',val:g.k}],async v=>{try{const n=await gs('movePeriod',k,B,g.k,v[0].trim(),PIN);PSEL[k]=nR(v[0]);msg(n+' kayıt taşındı ✅');rptLoad();}catch(e){msg(emsg(e));}},'Taşı');};
function podium(it){
  const o=it.length>=3?[1,0,2]:it.length==2?[1,0]:[0],h=[112,86,68],mk=['🥇','🥈','🥉'];
  return '<div class="pod">'+o.map(i=>{const x=it[i];return `<div class="pd g${i+1}"><div class="pm">${i==0?'👑':''}</div><b class="av big">${esc(ini(x.name))}</b><div class="pn">${esc(nice(x.name).split(' ')[0])}</div><div class="pv">${x.val}</div><div class="ps">${x.sub||''}</div><div class="pb" style="height:${h[i]}px">${mk[i]}</div></div>`;}).join('')+'</div>';
}
function lbRow(rk,r,main,sub,pct,cls,trend,key,adm,kd){
  return `<div class="lr ${trend&&trend.indexOf('d">')>0?'dn':''}"><span class="rk">${rk}</span><b class="av">${esc(ini(r.name))}</b><div class="lm"><div class="ln">${esc(nice(r.name))}${trend||''}</div><div class="ls">${sub}</div><div class="bar"><i class="${cls}" style="width:${Math.max(5,Math.min(100,pct))}%"></i></div></div><div class="lv">${main}</div>${adm?`<div class="rb"><button class="x2" data-k="${esc(key)}" onclick="${kd=='b'?'editBeer':(kd=='k'?'editCat':'editRep')}(this.dataset.k)">✏️</button><button class="x2" data-k="${esc(key)}" onclick="${kd=='b'?'beerDel':(kd=='k'?'catDel':'rptDel')}(this.dataset.k)">✕</button></div>`:''}</div>`;
}
function lbCiro(L,adm,sub){
  const ci=sub=='ciro',val=r=>Number(ci?r.ciro:r.ort);L=L.slice().sort((a,b)=>val(b)-val(a));
  const n=L.length,mx=val(L[0])||1,tc=L.reduce((a,r)=>a+Number(r.ciro||0),0),th=L.reduce((a,r)=>a+Number(r.hesap||0),0),low=Math.min(4,Math.max(0,n-3)),avg=th?tc/th:0;
  const top=r=>ci?fmt(Math.round(r.ciro))+' TL':tl2(r.ort)+' TL';
  let h='<div class="kp">'+(ci?'<div><b>'+fmt(Math.round(tc))+'</b><span>Toplam ciro (TL)</span></div><div><b>'+tl2(avg)+'</b><span>Takım ortalaması</span></div>':'<div><b>'+tl2(avg)+'</b><span>Takım ortalaması (TL)</span></div><div><b>'+fmt(th)+'</b><span>Toplam hesap</span></div>')+'<div><b>'+n+'</b><span>Garson</span></div></div>';
  h+='<div class="hot">🔥 '+esc(nice(L[0].name))+' zirvede! '+(ci?'Ciroda yükselmek için satışa devam.':'Sıralamada yükselmek için hesap başına ortalamanı artır.')+'</div>';
  h+=podium(L.slice(0,3).map(r=>({name:r.name,val:top(r),sub:ci?'ort. '+tl2(r.ort)+' TL':fmt(r.hesap)+' hesap'})));
  h+='<div class="lb">'+L.map((r,i)=>{
    if(!adm&&i<3)return '';
    const rk=i+1,dn=rk>n-low,tp=i<3;
    return lbRow(rk,r,(ci?fmt(Math.round(r.ciro)):tl2(r.ort))+'<small>TL</small>',ci?'ort. '+tl2(r.ort)+' TL · '+fmt(r.hesap)+' hesap':fmt(r.hesap)+' hesap'+(i?' · lidere '+tl2(mx-r.ort)+' TL':''),val(r)/mx*100,dn?'r':(tp?'g':'o'),dn?'<span class="tr d">▼ Düşüşte</span>':(tp?'<span class="tr u">▲ Zirvede</span>':''),r.key,adm,'c');
  }).join('')+'</div>';
  return h;
}
function lbBira(L,adm,T){
  const n=L.length,tq=L.reduce((a,r)=>a+Number(r.qty||0),0),hit=L.filter(r=>r.qty>=T).length,near=L.filter(r=>r.qty<T)[0];
  let h='<div class="kp"><div><b>'+fmt(T)+'</b><span>Hedef kota</span></div><div><b>'+hit+' / '+n+'</b><span>Hedefe ulaşan</span></div><div><b>'+fmt(tq)+'</b><span>Toplam adet</span></div></div>';
  h+=ringBox(tq,T,n);h+='<div class="hot">'+(near?'🔥 '+esc(nice(near.name))+' hedefe sadece <b>'+fmt(T-near.qty)+'</b> adet uzaklıkta! Hedef: '+fmt(T)+' adet':'🎉 Herkes hedefi geçti, tebrikler!')+'</div>';
  const rem=r=>r.qty>=T?'🎉 Hedef tamam (+'+fmt(r.qty-T)+')':'Kalan <b>'+fmt(T-r.qty)+'</b>';
  h+=podium(L.slice(0,3).map(r=>({name:r.name,val:fmt(r.qty)+' adet',sub:rem(r)})));
  h+='<div class="lb">'+L.map((r,i)=>{
    if(!adm&&i<3)return '';
    const p=r.qty/T*100;
    return lbRow(i+1,r,fmt(r.qty)+'<small>adet</small>',rem(r)+' · hedef '+fmt(T),p,p>=100?'g':(p>=70?'o':'r'),p>=100?'<span class="tr u">✓ Hedef</span>':'',r.key,adm,'b');
  }).join('')+'</div>';
  return h;
}
const rowOf=(k,key)=>{for(const g of PC[k]){const r=g.rows.find(x=>x.key==key);if(r)return {r:r,g:g};}return null;};
window.editBeer=key=>{
  const o=rowOf('bira',key);if(!o)return;const r=o.r,g=o.g;
  ask('✏️ Bira miktarını düzelt',[{label:'Ad Soyad',val:nice(r.name)},{label:'Miktar (wheel hariç)',type:'number',val:String(r.qty)}],async v=>{
    const nm=v[0].trim(),q=num(v[1]);if(!nm||!(q>=0)){msg('Ad ve miktar gerekli');return;}
    try{if(nrm(nm)!=nrm(r.name)||!r.range)await gs('delBeer',r.key,PIN);await gs('saveBeer',[{name:nm,qty:q,amt:0,wheel:0}],B,g.k,PIN);PSIG='';rptLoad();msg('Düzeltildi ✅');}catch(e){msg(emsg(e));}
  },'Kaydet');
};
window.editRep=key=>{
  const o=rowOf('ciro',key);if(!o)return;const r=o.r,g=o.g;
  ask('✏️ Satış kaydını düzelt',[{label:'Ad Soyad',val:nice(r.name)},{label:'Ciro (TL)',val:tl2(r.ciro)},{label:'Hesap sayısı',type:'number',val:String(r.hesap)}],async v=>{
    const nm=v[0].trim(),c=num(v[1]),h=num(v[2]);if(!nm||!(c>0)||!(h>0)){msg('Ad, ciro ve hesap sayısı gerekli');return;}
    try{if(nrm(nm)!=nrm(r.name)||!r.range)await gs('delReport',r.key,PIN);await gs('saveReport',{name:nm,ciro:c,hesap:h,range:g.k,firma:r.firma||'',sube:B},PIN);PSIG='';rptLoad();msg('Düzeltildi ✅');}catch(e){msg(emsg(e));}
  },'Kaydet');
};
const shr=(f,w,q)=>new Promise((ok,no)=>{const im=new Image(),u=URL.createObjectURL(f);im.onload=()=>{const s=Math.min(1,w/im.width),c=document.createElement('canvas');c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);ok(c.toDataURL('image/jpeg',q));};im.onerror=no;im.src=u;});
const SF=document.createElement('input');SF.type='file';SF.accept='image/*';SF.hidden=true;document.body.appendChild(SF);
window.shImgPick=()=>{SF.value='';SF.click();};
SF.addEventListener('change',async()=>{
  const f=SF.files[0];if(!f)return;
  try{
    $('st').textContent='🖼 Görsel hazırlanıyor…';let d='';
    for(const a of [[1500,.72],[1300,.62],[1100,.5],[900,.45]]){d=await shr(f,a[0],a[1]);if(d.length<900000)break;}
    if(d.length>=900000)throw new Error('Görsel çok büyük, daha küçük bir görsel seçin');
    await gs('saveShiftImg',B,d,PIN);$('st').textContent='';PSIG='';pgSync();
  }catch(e){$('st').textContent='';msg(emsg(e));}
});
window.shImgDel=()=>ask('Vardiya görseli kaldırılsın mı?',[],async()=>{try{await gs('saveShiftImg',B,'',PIN);PSIG='';pgSync();}catch(e){msg(emsg(e));}},'Kaldır');
window.showShImg=()=>{if(window.__shi)pop('🖼 Vardiya görseli','<img src="'+window.__shi.img+'" style="width:100%;border-radius:12px">',true);};
window.rptBatch=async function(files){
  const rows=[];let bad=0;
  for(let i=0;i<files.length;i++){
    try{OCRL='📖 Görsel '+(i+1)+'/'+files.length;const r=parseRep(await ocr(files[i]));if(!r.name||!r.ciro||!r.hesap)bad++;rows.push(r);}
    catch(e){bad++;rows.push({name:'?',ciro:'',hesap:'',range:''});}
  }
  $('st').textContent='';OCRL='📖 Görsel okunuyor…';
  const cnt={};rows.forEach(r=>{if(r.range){const k=nR(r.range);cnt[k]=(cnt[k]||0)+1;}});
  let per=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0]||'';if(!per)per=await defPer('ciro');
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
sty4.textContent='.kp{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 12px}.kp div{background:#172033;border:1px solid rgba(148,163,184,.14);border-radius:14px;padding:10px 6px;text-align:center}.kp b{display:block;font-size:18px}.kp span{font-size:11px;color:#94a3b8}.hot{background:linear-gradient(135deg,#7c2d12,#b45309);border-radius:14px;padding:12px;font-weight:600;font-size:14px;margin:0 0 12px;text-align:center;line-height:1.4}.pod{display:flex;align-items:flex-end;justify-content:center;gap:8px;margin:6px 0 14px}.pd{flex:1;text-align:center;display:flex;flex-direction:column;align-items:center;min-width:0}.pd .pm{height:22px;font-size:18px}.av.big{width:54px;height:54px;font-size:18px;margin:0 0 4px}.pd .pn{font-weight:800;font-size:13px}.pd .pv{font-size:13px;color:#4ade80;font-weight:800}.pd .ps{font-size:11px;color:#fde68a;min-height:14px}.pd .pb{width:100%;margin-top:6px;border-radius:12px 12px 0 0;display:grid;place-items:center;font-size:26px}.g1 .pb{background:linear-gradient(180deg,#f59e0b,#b45309)}.g2 .pb{background:linear-gradient(180deg,#94a3b8,#475569)}.g3 .pb{background:linear-gradient(180deg,#d97706,#78350f)}.lb{display:flex;flex-direction:column;gap:8px}.lr{display:flex;align-items:center;gap:10px;padding:10px;border-radius:16px;background:linear-gradient(160deg,#1f2b42,#162033);border:1px solid rgba(148,163,184,.12)}.lr.dn{border-color:rgba(239,68,68,.55)}.rk{flex:none;width:24px;text-align:center;font-weight:800;color:#94a3b8}.lm{flex:1;min-width:0}.ln{font-weight:700;font-size:14px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}.ls{font-size:12px;color:#94a3b8;margin:2px 0 6px}.bar{height:8px;border-radius:8px;background:#0f172a;overflow:hidden}.bar i{display:block;height:100%;border-radius:8px}.bar i.g{background:linear-gradient(90deg,#16a34a,#4ade80)}.bar i.o{background:linear-gradient(90deg,#f59e0b,#fbbf24)}.bar i.r{background:linear-gradient(90deg,#dc2626,#f87171)}.lv{flex:none;text-align:right;font-weight:800;font-size:15px}.lv small{display:block;font-size:10px;color:#94a3b8;font-weight:600}.tr{font-size:11px;font-weight:800;border-radius:20px;padding:1px 8px}.tr.d{background:#7f1d1d;color:#fecaca}.tr.u{background:#14532d;color:#bbf7d0}.x2{flex:none;border:0;background:#334155;color:#fff;border-radius:8px;width:30px;height:30px}.rb{display:flex;flex-direction:column;gap:4px}.seg{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 12px}.seg button{border:1px solid rgba(148,163,184,.25);background:#172033;color:#cbd5e1;border-radius:14px;padding:11px;font-weight:700}.seg button.on{background:linear-gradient(135deg,#3b82f6,#6d28d9);color:#fff;border-color:transparent}.simg{margin:0 0 14px;border-radius:16px;overflow:hidden;background:#0f172a;border:1px solid rgba(148,163,184,.18)}.simgh{display:flex;justify-content:space-between;padding:10px 12px;font-weight:700;font-size:13px}.simgh span{color:#94a3b8;font-weight:600}.simg img{display:block;width:100%;max-height:340px;object-fit:cover;object-position:top}.simgt{padding:6px;text-align:center;font-size:11px;color:#94a3b8}';
document.head.appendChild(sty4);

// ===== Başlangıç & Tatlı: görselden sadece Miktar okunur =====
let CATSUB='bas';
window.setCs=x=>{CATSUB=x;renderPg(true);};
const tgtK=async k=>{try{const x=await gs('getTargets');return +x[B+'_'+k]||0;}catch(e){return 0;}};
function catParse(W,st){
  const NR=/^\d{1,3}(?:\.\d{3})*,\d{2}$/,PR=/^\d{1,3}(?:\.\d{3})*,\d{2}/,out=[],NL=/^\d{1,3}(?:\.\d{3})*,\d{1,2}$/;
  const hs=W.map(w=>w.h).sort((a,b)=>a-b),H=hs[hs.length>>1]||12;
  const mk=W.filter(w=>{const n=nrm(w.t);return n=='miktar'||(n.length>=5&&n.length<=7&&lev(n,'miktar')<=1);}).sort((a,b)=>a.y-b.y);
  if(!mk.length)return out;
  const cl=[];mk.forEach(w=>{const c=cl.find(k=>Math.abs(k.y-w.y)<H*1.5);if(c)c.w.push(w);else cl.push({y:w.y,w:[w]});});
  const best=cl.sort((p,q)=>q.w.length-p.w.length||q.y-p.y)[0],hy=best.y,ms=best.w.sort((a,b)=>a.x0-b.x0);
  const G=ms.map((m,i)=>({a:m.x0-14,b:i+1<ms.length?ms[i+1].x0-14:1e9}));
  const inG=(w,g)=>w.x>=g.a&&w.x<g.b;
  const RX={b:/baslangic|2004/,t:/tatli|2015/,r:/biralar|2301/};
  const lab=k=>{const w=W.filter(x=>x.y>hy&&x.x<G[0].a&&RX[k].test(nrm(x.t))).sort((p,q)=>p.y-q.y)[0];return w?w.y:null;};
  let yb=lab('b'),yt=lab('t'),yr=lab('r');
  if(yb==null&&yt==null&&yr==null){
    const ys=[];W.filter(w=>w.y>hy+H&&NR.test(w.t)&&inG(w,G[0])).sort((p,q)=>p.y-q.y).forEach(w=>{if(!ys.length||w.y-ys[ys.length-1]>H*1.2)ys.push(w.y);});
    if(ys.length==1)yr=ys[0];else{yb=ys[0];yt=ys[1];}
  }
  const match=txt=>{const nl=nrm(txt);if(nl.length<4)return null;return st.find(x=>nrm(x.name)==nl)||st.find(x=>lev(nl,nrm(x.name))<=Math.floor(nrm(x.name).length*.25))||null;};
  G.forEach(g=>{
    const nm=W.filter(w=>inG(w,g)&&w.y<hy-H*.5&&w.y>hy-H*4&&/[A-Za-zÇĞİÖŞÜçğıöşü]{2,}/.test(w.t)).sort((p,q)=>p.x0-q.x0).map(w=>w.t.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g,'')).filter(x=>x.length>1).join(' ');
    if(!nm)return;
    const val=(y,pre)=>{if(y==null)return null;const re=pre?PR:NL,t=W.filter(w=>Math.abs(w.y-y)<H*.9&&inG(w,g)&&re.test(w.t)).sort((p,q)=>p.x0-q.x0)[0];return t?num(pre?t.t.match(PR)[0]:t.t):null;};
    if(/genel|toplam/.test(nrm(nm))){out.grand={b:val(yb,1),t:val(yt,1),r:val(yr,1)};return;}
    const s=match(nm);
    out.push({name:s?s.name:nice(nm),b:val(yb),t:val(yt),r:val(yr)});
  });
  return out;
}
function lbQty(L,adm,T,lbl){
  const n=L.length,mx=L[0].qty||1,tq=L.reduce((a,r)=>a+r.qty,0),hit=T>0?L.filter(r=>r.qty>=T).length:0,near=T>0?L.filter(r=>r.qty<T)[0]:null,low=Math.min(4,Math.max(0,n-3));
  const rem=r=>T>0?(r.qty>=T?'🎉 Hedef tamam (+'+fmt(r.qty-T)+')':'Kalan <b>'+fmt(T-r.qty)+'</b>'):'';
  let h='<div class="kp"><div><b>'+(T>0?fmt(T):esc(nice(L[0].name).split(' ')[0]))+'</b><span>'+(T>0?'Hedef kota':'Lider')+'</span></div><div><b>'+(T>0?hit+' / '+n:n)+'</b><span>'+(T>0?'Hedefe ulaşan':'Garson')+'</span></div><div><b>'+fmt(tq)+'</b><span>Toplam miktar</span></div></div>';
  h+=ringBox(tq,T,n);h+='<div class="hot">'+(T>0?(near?'🔥 '+esc(nice(near.name))+' hedefe sadece <b>'+fmt(T-near.qty)+'</b> kaldı! Hedef: '+fmt(T):'🎉 Herkes hedefi geçti, tebrikler!'):'🔥 '+esc(nice(L[0].name))+' '+lbl+' satışında zirvede! Sen de yükselebilirsin.')+'</div>';
  h+=podium(L.slice(0,3).map(r=>({name:r.name,val:fmt(r.qty),sub:rem(r)})));
  h+='<div class="lb">'+L.map((r,i)=>{
    if(!adm&&i<3)return '';
    const p=(T>0?r.qty/T:r.qty/mx)*100,rk=i+1,dn=T<=0&&rk>n-low;
    return lbRow(rk,r,fmt(r.qty)+'<small>miktar</small>',T>0?rem(r)+' · hedef '+fmt(T):(i?'lidere '+fmt(mx-r.qty)+' kaldı':'Lider'),p,T>0?(p>=100?'g':(p>=70?'o':'r')):(dn?'r':(i<3?'g':'o')),T>0?(p>=100?'<span class="tr u">✓ Hedef</span>':''):(dn?'<span class="tr d">▼ Düşüşte</span>':(i<3?'<span class="tr u">▲ Zirvede</span>':'')),r.key,adm,'k');
  }).join('')+'</div>';
  return h;
}
window.catForm=function(lines,sb,head,per){
  ask(head,[{label:'Dönem (boşsa yükleme tarihi yazılır)',val:per||''},{label:'Satırlar (Ad;Başlangıç;Tatlı)',type:'textarea',val:lines}],async v=>{
    const rows=[],fail=[];
    v[1].split(/\r?\n/).forEach(ln=>{if(!ln.trim())return;const p=ln.split(';'),nm=(p[0]||'').trim(),b=num(p[1]),t2=num(p[2]);if(nm&&nm!='?'&&(isFinite(b)||isFinite(t2)))rows.push({name:nm,bas:isFinite(b)?b:undefined,tat:isFinite(t2)?t2:undefined});else fail.push(ln);});
    try{const o=await gs('saveCat',rows,sb,v[0].trim(),PIN);msg(o.n+' garsonun Başlangıç/Tatlı miktarı kaydedildi ✅'+(fail.length?'\n\nAtlanan satırlar:\n'+fail.join('\n'):''));rptLoad();}catch(e){msg(emsg(e));}
  },'Kaydet');
};
window.catManual=()=>catForm('',B,'🍰 Başlangıç & Tatlı miktarını elle gir · '+BR[B]+'\nSatır: Ad;Başlangıç;Tatlı (sadece miktar)','');
window.catPick=()=>{window.__catMode=true;RFM='rpt';$('rf').value='';$('rf').click();};
const orp=window.rptPick;window.rptPick=function(){window.__catMode=false;orp();};
const orb=window.rptBatch;window.rptBatch=function(f){if(window.__catMode){window.__catMode=false;return catBatch(f);}return orb(f);};
window.catDel=k=>ask('Bu kayıt silinsin mi?',[],()=>gs('delCat',k,PIN).then(()=>{PSIG='';rptLoad();}).catch(e=>msg(emsg(e))),'Sil');
window.editCat=key=>{
  const o=rowOf('cat',key);if(!o)return;const r=o.r,g=o.g,f=x=>typeof x=='number'?String(x).replace('.',','):'';
  ask('✏️ Başlangıç & Tatlı düzelt',[{label:'Ad Soyad',val:nice(r.name)},{label:'Başlangıç miktarı',val:f(r.bas)},{label:'Tatlı miktarı',val:f(r.tat)}],async v=>{
    const nm=v[0].trim(),b=num(v[1]),t2=num(v[2]);if(!nm){msg('Ad gerekli');return;}
    try{if(nrm(nm)!=nrm(r.name)||!r.range)await gs('delCat',r.key,PIN);await gs('saveCat',[{name:nm,bas:isFinite(b)?b:null,tat:isFinite(t2)?t2:null}],B,g.k,PIN);PSIG='';rptLoad();msg('Düzeltildi ✅');}catch(e){msg(emsg(e));}
  },'Kaydet');
};

// ===== Yönetici sessiz; anons kaydı sadece personelde çalar =====
window.announce=function(){};
const ANS='anons.m4a';
window.playAnons=()=>{try{const a=new Audio(ANS);a.volume=1;const p=a.play();if(p&&p.catch)p.catch(()=>{});return a;}catch(e){return null;}};
window.testAnons=()=>{perm(true);const a=playAnons();if(!a){msg('Ses çalınamadı');return;}a.onerror=()=>msg('Ses dosyası bulunamadı. anons.m4a dosyasını GitHub deposuna yükle.');};
window.voiceTest=window.testAnons;
document.addEventListener('click',()=>{if(window.__au)return;window.__au=1;try{const a=new Audio(ANS);a.muted=true;const p=a.play();if(p&&p.then)p.then(()=>{a.pause();a.currentTime=0;}).catch(()=>{});}catch(e){}});
function mbn(s,me){
  let seen=0;try{seen=+(localStorage.getItem('mola_msg_'+me)||0);}catch(e){}
  const m=s.msg;if(!m||m.t<=seen||Date.now()-m.t>6*3600e3)return;
  $('list').insertAdjacentHTML('afterbegin','<div class="mbn"><b>📣 Yönetici mesajı</b><div>'+esc(m.text)+'</div><button class="a" onclick="seenMsg(\''+me+'\','+m.t+')">Tamam, anladım</button></div>');
  if((window.__ml||0)<m.t){window.__ml=m.t;playAnons(me);}
}
window.seenMsg=(id,t)=>{try{localStorage.setItem('mola_msg_'+id,String(t));}catch(e){}load();};
window.msgStaff=id=>{
  const s=D.staff.find(x=>x.id==id);if(!s)return;
  ask('🔔 '+nice(s.name)+' için bildirim mesajı',[{label:'Mesaj',val:'Molan bitti, hemen işine dön!'}],async v=>{
    try{const r=await gs('notifyStaff',id,v[0],PIN);msg(r.ok?'Bildirim gönderildi ✅\nTelefona ntfy ile düşer, uygulaması açıksa ekranda da çıkar.':'Uygulama içinde gösterildi, ama telefon bildirimi gönderilemedi:\n'+(r.err||''));}catch(e){msg(emsg(e));}
  },'Gönder');
};
const ring=(p,t)=>{const r=34,c=2*Math.PI*r,d=Math.min(100,Math.max(0,p))/100*c;return `<svg viewBox="0 0 84 84" width="84" height="84"><defs><linearGradient id="rgg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22c55e"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs><circle cx="42" cy="42" r="${r}" fill="none" stroke="#1e293b" stroke-width="9"/><circle cx="42" cy="42" r="${r}" fill="none" stroke="url(#rgg)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${d} ${c}" transform="rotate(-90 42 42)"/><text x="42" y="47" text-anchor="middle" font-size="17" font-weight="800" fill="#fff">${t}</text></svg>`;};
function ringBox(tq,T,n){if(!(T>0&&n))return '';const p=tq/(T*n)*100;return `<div class="rgw">${ring(p,Math.round(p)+'%')}<div class="rgt"><b>Takım hedefi</b><br>${fmt(tq)} / ${fmt(T*n)}<br><span style="color:#94a3b8">${n} garson × ${fmt(T)}</span></div></div>`;}
window.beerBatch=async function(files){
  const pages=[],st=(D&&D.staff)||[],rows={},txt=[];let grand=null;
  for(let i=0;i<files.length;i++){
    OCRL='📖 Sayfa '+(i+1)+'/'+files.length;
    const o=await ocrW(files[i]),m=o.text.match(/Sayfa\s*(\d+)\s*\/\s*\d+/i);
    pages.push({W:o.W,text:o.text,n:m?+m[1]:null,i:i});txt.push(o.text||'');
    const rs=catParse(o.W,st);rs.forEach(r=>{if(r.r!=null)rows[nrm(r.name)]={name:r.name,qty:r.r};});
    if(rs.grand&&rs.grand.r!=null)grand=rs.grand.r;
  }
  $('st').textContent='';OCRL='📖 Görsel okunuyor…';
  const list=Object.keys(rows).map(k=>rows[k]),pm=txt.join(' ').match(/Tarih\s+Aral\S{2,4}\s*:\s*([\d.]+\s*-\s*[\d.]+)/i);let per=pm?pm[1].replace(/\s+/g,''):'';
  if(!per)per=await defPer('bira');
  if(list.length){
    const sum=list.reduce((a,r)=>a+r.qty,0),ok=grand!=null&&Math.abs(sum-grand)<0.5;
    beerForm(list.map(r=>r.name+';'+String(r.qty).replace('.',',')).join('\n'),B,'🍺 Okunan bira satışı · '+BR[B]+'\n'+list.length+' garson · toplam '+fmt(sum)+(grand!=null?(ok?' · ✓ rapordaki Genel Toplam ('+fmt(grand)+') ile tuttu':'\n⚠ Rapordaki Genel Toplam '+fmt(grand)+' ile tutmuyor, eksik ya da yanlış satır olabilir'):'')+absentTxt(list)+'\nSatır: Ad;Miktar',per);
    return;
  }
  pages.sort((a,b)=>(a.n!=null&&b.n!=null)?a.n-b.n:a.i-b.i);
  const ns=pages.map(p=>p.n).filter(x=>x!=null),r=beerPages(pages,st);
  if(ns.some((n,i)=>i&&n!=ns[i-1]+1))r.warn.push('Sayfa numaraları ardışık değil, eksik sayfa olabilir');
  if(!r.rows.length){msg('Görsellerde bira miktarı okunamadı.\nGarson adları ve "2301 - BIRALAR" satırındaki Miktar sütunu görünecek şekilde yükleyin.'+(r.warn.length?'\n\n'+r.warn.join('\n'):''));return;}
  beerForm(r.rows.map(x=>x.name+';'+x.qty).join('\n'),r.sube||B,'🍺 Bira satışı · '+BR[r.sube||B]+'\n'+r.rows.length+' garson'+(r.grandOk?' · ✓ toplamlar rapordaki genel toplamla tuttu':'')+(r.warn.length?'\n⚠ '+r.warn.join('\n⚠ '):'')+'\nSatır: Ad;Miktar (wheel hariç)',per);
};
const sty5=document.createElement('style');
sty5.textContent=`body{background:radial-gradient(900px 520px at 6% -6%,rgba(99,102,241,.38),transparent 62%),radial-gradient(760px 560px at 104% 28%,rgba(168,85,247,.24),transparent 62%),radial-gradient(720px 520px at -4% 100%,rgba(14,165,233,.2),transparent 62%),linear-gradient(180deg,#0b1020,#0f172a 60%,#0b1224) fixed!important}
body::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;background-image:radial-gradient(rgba(255,255,255,.08) 1px,transparent 1.6px);background-size:26px 26px;-webkit-mask-image:linear-gradient(180deg,#000,transparent 85%);mask-image:linear-gradient(180deg,#000,transparent 85%)}
body::after{content:"";position:fixed;right:-70px;bottom:-30px;width:340px;height:340px;pointer-events:none;z-index:0;opacity:.08;background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><mask id='m'><rect width='100' height='100' fill='white'/><circle cx='64' cy='38' r='34' fill='black'/></mask><circle cx='46' cy='54' r='40' fill='white' mask='url(%23m)'/></svg>") no-repeat center/contain}
body>*{position:relative;z-index:1}
.card,.lr,.row,.st,.kp div,.rgw,.pgb{backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.rgw{display:flex;align-items:center;gap:14px;background:linear-gradient(160deg,rgba(31,43,66,.9),rgba(22,32,51,.9));border:1px solid rgba(148,163,184,.18);border-radius:18px;padding:12px 14px;margin:0 0 12px}
.rgt{font-size:13px;line-height:1.55}
.mbn{background:linear-gradient(135deg,#7c2d12,#b45309);border:1px solid rgba(251,191,36,.55);border-radius:18px;padding:14px;margin:0 0 12px;display:grid;gap:8px;box-shadow:0 8px 24px rgba(0,0,0,.35)}`;
document.head.appendChild(sty5);

// ===== Yönetici araç çubuğu =====
function admBar(){return '<div class="admbar"><button class="a an full" style="min-height:58px;font-size:16px" onclick="radioUI()">📻 Telsiz · konuş</button><button class="a ed" onclick="ciroXlsPick()">💰 Ciro Excel yükle</button><button class="a ed" onclick="aiUI()">🍺 Ürün Excel yükle</button><button class="a an full" onclick="postaUI()">📋 Postalar · vardiya ve WhatsApp görseli</button><button class="a" onclick="add()">➕ Personel ekle</button><button class="a x" onclick="reset()">↻ Günü sıfırla</button><button class="a an" onclick="testAnons()">🔊 Anons testi</button><button class="a off" onclick="msgPick()">🔔 Mesaj gönder</button><button class="a ed" onclick="vList()">🎙 İsim kayıtları</button><button class="a x" onclick="admSet()">⚙ Ayarlar</button></div>';}
window.msgPick=()=>{
  const now=Date.now()+off,rk=s=>s.active?(!s.active.paused&&endOf(s.active)<now?0:1):2,S=D.staff.filter(s=>!s.off).sort((a,b)=>rk(a)-rk(b)||a.name.localeCompare(b.name,'tr'));
  const st=s=>s.active?(!s.active.paused&&endOf(s.active)<now?' · 🔴 mola bitti':' · ☕ molada'):'';
  pop('🔔 Kime mesaj gönderilsin?','<div class="shg"><button class="a an" onclick="$(\'ov\').hidden=true;msgAll()">📢 '+BR[B]+' · tüm personel</button>'+S.map(s=>`<button class="a ed" onclick="$('ov').hidden=true;msgStaff('${s.id}')">${esc(nice(s.name))}${st(s)}</button>`).join('')+'</div>');
  $('mo').textContent='Kapat';
};
window.msgAll=()=>ask('📢 '+BR[B]+' tüm personele mesaj',[{label:'Mesaj',val:'Dikkat: '}],async v=>{
  try{const r=await gs('notifyBranch',B,v[0],PIN);msg(r.n+' personele mesaj gönderildi ✅\n'+r.ok+' kişiye telefon bildirimi iletildi, diğerleri uygulamayı açınca görür.');}catch(e){msg(emsg(e));}
},'Gönder');
const sty6=document.createElement('style');
sty6.textContent='.admbar{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 12px;position:relative;z-index:2}.admbar .a{min-height:50px;border-radius:14px;font-size:14px;width:100%}.admbar .full{grid-column:1/-1}.more.bell{background:#7c3aed;margin-left:6px}.row .more{flex:none}';
document.head.appendChild(sty6);

async function defPer(k){try{const L=await(k=='bira'?fBira():(k=='cat'?fCat():fCiro()));const G=grp(L);return G[0]?G[0].k:'';}catch(e){return '';}}

// ===== İsim anonsu =====
const VK=id=>'mola_voice_'+id;
const vGet=id=>{try{return JSON.parse(localStorage.getItem(VK(id))||'null');}catch(e){return null;}};
window.vFetch=async s=>{
  if(!s||!s.hasVoice)return;
  const c=vGet(s.id);if(c&&c.t==s.voiceT)return;
  try{const r=await gs('getVoice',s.id);if(r&&r.a)localStorage.setItem(VK(s.id),JSON.stringify({t:s.voiceT,a:r.a}));}catch(e){}
};
const AU=new Audio();
window.playAnons=id=>{
  try{
    AU.pause();AU.onended=null;AU.onerror=null;AU.muted=false;AU.volume=1;
    const c=id?vGet(id):null,gen=()=>{AU.onended=null;AU.onerror=null;AU.src=ANS;const p=AU.play();if(p&&p.catch)p.catch(()=>{});};
    if(c&&c.a){AU.src=c.a;AU.onended=()=>setTimeout(gen,120);AU.onerror=gen;const p=AU.play();if(p&&p.catch)p.catch(gen);}else gen();
    return AU;
  }catch(e){return null;}
};
document.addEventListener('click',()=>{if(window.__au2)return;window.__au2=1;try{AU.muted=true;AU.src=ANS;const p=AU.play();if(p&&p.then)p.then(()=>{AU.pause();AU.currentTime=0;AU.muted=false;}).catch(()=>{AU.muted=false;});}catch(e){}});
async function tWav(blob,sr0){
  const ab=await blob.arrayBuffer(),AC=window.AudioContext||window.webkitAudioContext,ctx=new AC();
  const buf=await new Promise((ok,no)=>ctx.decodeAudioData(ab,ok,no));
  const sr=sr0||16000,oc=new OfflineAudioContext(1,Math.max(1,Math.ceil(buf.duration*sr)),sr),src=oc.createBufferSource();
  src.buffer=buf;src.connect(oc.destination);src.start();
  const d=(await oc.startRendering()).getChannelData(0);
  let a=0,b=d.length-1;const th=0.02;while(a<b&&Math.abs(d[a])<th)a++;while(b>a&&Math.abs(d[b])<th)b--;
  a=Math.max(0,a-1600);b=Math.min(d.length-1,b+2400);
  const n=b-a+1;if(n<2400)throw new Error('Ses algılanamadı, tekrar dene');
  const o=new DataView(new ArrayBuffer(44+n*2)),w=(p,s)=>{for(let i=0;i<s.length;i++)o.setUint8(p+i,s.charCodeAt(i));};
  w(0,'RIFF');o.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');o.setUint32(16,16,true);o.setUint16(20,1,true);o.setUint16(22,1,true);o.setUint32(24,sr,true);o.setUint32(28,sr*2,true);o.setUint16(32,2,true);o.setUint16(34,16,true);w(36,'data');o.setUint32(40,n*2,true);
  for(let i=0;i<n;i++){const v=Math.max(-1,Math.min(1,d[a+i]));o.setInt16(44+i*2,v<0?v*0x8000:v*0x7fff,true);}
  const u=new Uint8Array(o.buffer);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));
  try{ctx.close();}catch(e){}
  return 'data:audio/wav;base64,'+btoa(s);
}
window.vList=()=>{
  const S=D.staff.filter(s=>!s.off).sort((a,b)=>a.name.localeCompare(b.name,'tr'));
  pop('🎙 İsim anons kayıtları · '+BR[B],'<p class="sub" style="margin:0 0 10px;line-height:1.5">Her personelin adını kendi sesinle kaydet. Mola bitince önce adı, sonra genel anons (anons.m4a) çalar.</p><div class="shg">'+S.map(s=>`<div class="vrow"><div class="vn">${esc(nice(s.name))}<span>${s.hasVoice?'✓ kayıtlı':'— kayıt yok'}</span></div><button class="a ed" onclick="vRec('${s.id}')">🎙</button>${s.hasVoice?`<button class="a" onclick="vPlay('${s.id}')">▶</button><button class="a end" onclick="vDel('${s.id}')">🗑</button>`:''}</div>`).join('')+'</div>');
  $('mo').textContent='Kapat';
};
window.vPlay=async id=>{const s=D.staff.find(x=>x.id==id);await vFetch(s);perm(true);playAnons(id);};
window.vDel=id=>ask('Bu isim kaydı silinsin mi?',[],async()=>{try{await gs('delVoice',id,PIN);try{localStorage.removeItem(VK(id));}catch(e){}load();msg('Kayıt silindi');}catch(e){msg(emsg(e));}},'Sil');
window.vRec=async id=>{
  const s=D.staff.find(x=>x.id==id);if(!s)return;
  if(!navigator.mediaDevices||!window.MediaRecorder){msg('Bu tarayıcı ses kaydını desteklemiyor.');return;}
  let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:true});}catch(e){msg('Mikrofon izni verilmedi.');return;}
  const ch=[],mr=new MediaRecorder(stream);let tm=null;
  mr.ondataavailable=e=>{if(e.data&&e.data.size)ch.push(e.data);};
  mr.onstop=async()=>{
    clearTimeout(tm);stream.getTracks().forEach(t=>t.stop());
    if(!ch.length)return;
    try{
      const wav=await tWav(new Blob(ch,{type:mr.mimeType||'audio/webm'}));
      try{const a=new Audio(wav);a.play();}catch(e){}
      ask('🎙 '+nice(s.name)+'\nKaydı dinledin mi? Kullanılsın mı?',[],async()=>{try{await gs('saveVoice',id,wav,PIN);load();msg('Kaydedildi ✅');}catch(e){msg(emsg(e));}},'✓ Kaydet');
    }catch(e){msg('Kayıt işlenemedi: '+emsg(e));}
  };
  ask('🎙 Kayıt: '+nice(s.name)+'\nSadece adı söyle, sonra Bitir\'e bas (en çok 4 sn)',[],()=>{try{if(mr.state=='recording')mr.stop();}catch(e){}},'⏹ Bitir');
  $('mc').onclick=()=>{$('ov').hidden=true;mr.onstop=null;try{if(mr.state=='recording')mr.stop();}catch(e){}stream.getTracks().forEach(t=>t.stop());clearTimeout(tm);};
  mr.start();tm=setTimeout(()=>{try{if(mr.state=='recording'){$('ov').hidden=true;mr.stop();}}catch(e){}},4000);
};
const absentTxt=list=>{const have=new Set(list.map(r=>nrm(r.name))),a=((D&&D.staff)||[]).filter(s=>!s.off&&!have.has(nrm(s.name))).map(s=>nice(s.name));return a.length?'\nℹ Okunmayan personel: '+a.join(', ')+' (raporda yoksa sorun değil, varsa satır ekle)':'';};
window.catBatch=async function(files){
  const all={},txt=[];let grand=null;
  for(let i=0;i<files.length;i++){
    OCRL='📖 Sayfa '+(i+1)+'/'+files.length;
    const o=await ocrW(files[i]);txt.push(o.text||'');
    const rs=catParse(o.W,(D&&D.staff)||[]);rs.forEach(r=>{all[nrm(r.name)]=r;});if(rs.grand)grand=rs.grand;
  }
  $('st').textContent='';OCRL='📖 Görsel okunuyor…';
  const rs=Object.keys(all).map(k=>all[k]);
  if(!rs.length){msg('Görsellerde tablo okunamadı.\nGarson adları ve Miktar sütunu görünecek şekilde, "2004 - BASLANGICLAR" ve "2015 - TATLILAR" satırlarıyla birlikte yükleyin.');return;}
  const f=x=>x==null?'?':String(x).replace('.',','),miss=rs.filter(r=>r.b==null||r.t==null).length,pm=txt.join(' ').match(/Tarih\s+Aral\S{2,4}\s*:\s*([\d.]+\s*-\s*[\d.]+)/i);
  const sb=rs.reduce((a,r)=>a+(r.b||0),0),stt=rs.reduce((a,r)=>a+(r.t||0),0),w=[];
  if(grand){
    if(grand.b!=null&&Math.abs(sb-grand.b)>0.5)w.push('Başlangıç toplamı '+fmt(sb)+', rapordaki Genel Toplam '+fmt(grand.b)+' → '+fmt(Math.round((grand.b-sb)*100)/100)+' eksik, bir garson okunamamış olabilir');
    if(grand.t!=null&&Math.abs(stt-grand.t)>0.5)w.push('Tatlı toplamı '+fmt(stt)+', rapordaki Genel Toplam '+fmt(grand.t)+' → '+fmt(Math.round((grand.t-stt)*100)/100)+' eksik, bir garson okunamamış olabilir');
    if(!w.length)w.push('✓ toplamlar rapordaki Genel Toplam ile tuttu');
  }
  catForm(rs.map(r=>[r.name,f(r.b),f(r.t)].join(';')).join('\n'),B,'🍰 Okunan Başlangıç & Tatlı · '+BR[B]+'\n'+rs.length+' garson'+(miss?' · ⚠ '+miss+' satırda eksik (?) var, düzeltin':'')+(w.length?'\n'+w.map(x=>x[0]=='✓'?x:'⚠ '+x).join('\n'):'')+absentTxt(rs)+'\nSatır: Ad;Başlangıç;Tatlı (sadece miktar)',(pm?pm[1].replace(/\s+/g,''):'')||await defPer('cat'));
};
const sty7=document.createElement('style');
sty7.textContent='.vrow{display:flex;gap:8px;align-items:center}.vn{flex:1;font-weight:700;font-size:14px}.vn span{display:block;font-size:11px;color:#94a3b8;font-weight:600}.vrow .a{width:auto!important;min-width:48px;padding:10px 14px;min-height:44px}';
document.head.appendChild(sty7);

// ===== 📻 Telsiz =====
const RA=new Audio();
document.addEventListener('click',()=>{if(window.__ra2)return;window.__ra2=1;try{RA.muted=true;RA.src=ANS;const p=RA.play();if(p&&p.then)p.then(()=>{RA.pause();RA.currentTime=0;RA.muted=false;}).catch(()=>{RA.muted=false;});}catch(e){}});
let RR=null;
window.radioUI=()=>{
  const S=D.staff.filter(s=>!s.off).sort((a,b)=>a.name.localeCompare(b.name,'tr'));
  pop('📻 Telsiz · '+BR[B],'<p class="sub" style="margin:0 0 10px;line-height:1.5">Kime konuşacaksın? Konuş\'a bas, söyleyeceğini söyle, tekrar basıp gönder (en çok 12 sn).</p><select id="rto" class="rsel"><option value="all">📢 Tüm personel</option>'+S.map(s=>`<option value="${s.id}">${esc(nice(s.name))}</option>`).join('')+'</select><button id="rbt" class="a an rbig" onclick="radioTalk()">🎙 Konuş</button><div id="rst" class="sub" style="margin-top:10px;text-align:center"></div>');
  $('mo').textContent='Kapat';
  $('mo').onclick=()=>{$('ov').hidden=true;if(RR){RR.cancel=1;try{RR.mr.stop();}catch(e){}}};
};
window.radioTalk=async()=>{
  const stt=$('rst'),btn=$('rbt');
  if(RR){try{RR.mr.stop();}catch(e){}return;}
  if(!navigator.mediaDevices||!window.MediaRecorder){stt.textContent='Bu tarayıcı ses kaydını desteklemiyor';return;}
  let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:true});}catch(e){stt.textContent='Mikrofon izni verilmedi';return;}
  const ch=[],mr=new MediaRecorder(stream),to=$('rto').value;let tm=null,sec=0;
  RR={mr:mr,cancel:0};
  mr.ondataavailable=e=>{if(e.data&&e.data.size)ch.push(e.data);};
  mr.onstop=async()=>{
    clearInterval(tm);stream.getTracks().forEach(t=>t.stop());
    const cancelled=RR&&RR.cancel;RR=null;
    const b=$('rbt');if(b){b.textContent='🎙 Konuş';b.classList.remove('rec');}
    if(cancelled||!ch.length)return;
    try{
      if($('rst'))$('rst').textContent='Gönderiliyor…';
      const wav=await tWav(new Blob(ch,{type:mr.mimeType||'audio/webm'}),11025);
      const r=await gs('sendRadio',to,B,wav,PIN);
      if($('rst'))$('rst').textContent='✅ Gönderildi · '+r.n+' kişiye çağrı bildirimi gitti';
    }catch(e){if($('rst'))$('rst').textContent='⚠ '+emsg(e);}
  };
  mr.start();btn.classList.add('rec');btn.textContent='⏹ Bitir ve gönder (0 sn)';stt.textContent='Konuşabilirsin…';
  tm=setInterval(()=>{sec++;const b=$('rbt');if(b)b.textContent='⏹ Bitir ve gönder ('+sec+' sn)';if(sec>=12){try{mr.stop();}catch(e){}}},1000);
};
function rbn(){
  let el=document.getElementById('rdo');if(!el){el=document.createElement('div');el.id='rdo';el.className='rdo';document.body.appendChild(el);}
  el.innerHTML='<b>📻 Telsiz mesajı</b><button onclick="radioAgain()">▶ Dinle</button><button onclick="document.getElementById(\'rdo\').remove()">✕</button>';
  clearTimeout(window.__rt);window.__rt=setTimeout(()=>{const e=document.getElementById('rdo');if(e)e.remove();},30000);
}
function radioPlay(m){
  window.__rlast=m;
  try{navigator.vibrate&&navigator.vibrate([300,150,300]);}catch(e){}
  try{RA.pause();RA.muted=false;RA.volume=1;RA.src=m.a;const p=RA.play();if(p&&p.catch)p.catch(()=>{});}catch(e){}
  rbn();
}
window.radioAgain=()=>{const m=window.__rlast;if(!m)return;try{RA.pause();RA.src=m.a;RA.play();}catch(e){}};
window.radioListen=me=>{
  const key=me?me+'|'+B:'';
  if(window.__rid===key)return;
  (window.__runs||[]).forEach(f=>{try{f();}catch(e){}});window.__runs=[];window.__rid=key;
  if(!me)return;
  [me,'all_'+B].forEach(id=>{
    window.__runs.push(col('radio').doc(id).onSnapshot(d=>{
      if(!d.exists)return;const m=d.data();if(!m||!m.a)return;
      let seen=0;try{seen=+(localStorage.getItem('mola_radio_'+id)||0);}catch(e){}
      if(m.t<=seen)return;
      try{localStorage.setItem('mola_radio_'+id,String(m.t));}catch(e){}
      if(Date.now()-m.t<120000)radioPlay(m);
    },()=>{}));
  });
};
window.radioMode=async()=>{
  const want=!window.__rwl,ok=await wake(want);
  window.__rwl=want&&ok;
  msg(want?(ok?'📻 Telsiz dinleme açık.\nEkran açık kalır, telsiz çağrılarını duyarsın. Telefonu şarjda tut ve bu sayfayı kapatma.':'Ekran açık tutulamadı. Telefon ayarlarından ekran zaman aşımını uzat.'):'Telsiz dinleme kapatıldı');
  head();
};
const sty8=document.createElement('style');
sty8.textContent='.rsel{width:100%;padding:12px;border-radius:12px;background:#0f172a;color:#fff;border:1px solid #475569;font-size:16px;margin-bottom:12px}.rbig{width:100%;min-height:76px;font-size:20px;border-radius:18px}.rbig.rec{background:#dc2626;animation:rpulse 1s infinite}@keyframes rpulse{50%{opacity:.65}}.rdo{position:fixed;left:12px;right:12px;top:12px;z-index:30;background:linear-gradient(135deg,#7c3aed,#4c1d95);border-radius:16px;padding:12px 14px;display:flex;align-items:center;gap:10px;box-shadow:0 10px 30px rgba(0,0,0,.5)}.rdo b{flex:1}.rdo button{border:0;border-radius:10px;padding:8px 12px;font-weight:700}';
document.head.appendChild(sty8);

// ===== 🤖 Yapay zeka (Gemini) Entegrasyonu =====
const GK='mola_gemini_key',GMK='mola_gemini_model',GP='mola_ai_prompt';
const gKey=()=>{try{return localStorage.getItem(GK)||'';}catch(e){return '';}};
const AIP0='Ürünleri gruplara ayır (Bira, Kokteyl, Kahve, Tatlı, Başlangıç, Yemek, Diğer) ve her personel için grup bazında Miktar toplamlarını çıkar. Son sütun Toplam olsun.';
window.aiKey=()=>ask('🔑 Gemini API anahtarı\naistudio.google.com/apikey adresinden ücretsiz alınır. Anahtar yalnızca bu telefonda saklanır, GitHub\'a ya da veritabanına yazılmaz.',[{label:'API anahtarı',val:gKey()}],v=>{
  const k=v[0].trim();if(!k)return;
  try{localStorage.setItem(GK,k);localStorage.removeItem(GMK);}catch(e){}
  msg('Anahtar kaydedildi ✅');
},'Kaydet');

// --- Gemini çağrısı: güncel modelleri sırayla dener (eski model kalkarsa 404'te sıradakine geçer) ---
async function gCall(key, parts) {
  const models = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'];
  let last = '';
  for (const m of models) {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + encodeURIComponent(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: parts }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
      })
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      const p = (((j.candidates || [])[0] || {}).content || {}).parts;
      if (!p) throw new Error('Gemini boş yanıt döndürdü' + (j.promptFeedback ? ' (içerik engellendi)' : ''));
      return p.map(x => x.text || '').join('');
    }
    last = (j.error && j.error.message) || ('HTTP ' + r.status);
    if (r.status === 429) throw new Error('Gemini kullanım sınırına takıldı. Birkaç dakika sonra tekrar dene.');
    if (r.status !== 404) break; // 404 değilse başka model denemenin anlamı yok
  }
  throw new Error('Gemini hatası: ' + last);
}

const aiPrompt=u=>'Sen bir restoran satış raporu analiz asistanısın. Ekli görseller bir kasa programının "Personel Ürün Satış Raporu" sayfalarıdır: her personelin sicil no ve adı, altında ürün no, ürün adı, şube adı, Miktar ve Tutar sütunları ve her personelin sonunda sarı toplam satırı vardır. Sayfalar aynı personelin satırlarını devam ettirebilir.\n\nKullanıcının isteği: '+u+'\n\nKurallar:\n- Yalnızca görselde gerçekten yazan sayıları kullan, tahmin etme. Okunamayan değer için null yaz.\n- Aksi istenmedikçe Miktar sütununu topla (Tutar değil).\n- Tutarı 0,00 olan "WHELL KMPNY" (Wheel kampanyası) satırlarını Bira grubuna katma; "Wheel" adlı ayrı bir sütunda göster.\n- Aynı kişi birden çok sayfada geçiyorsa tek satırda birleştir; personel adlarını düzgün Türkçe yaz.\n- Ürünleri ürün adına bakarak mantıklı gruplara ayır. Hangi ürünün hangi gruba girdiği "notes" alanında kısaca yazsın.\n- Rapordaki sarı toplam satırıyla karşılaştır, tutarsızlık varsa "notes" alanında belirt.\n\nYanıtı yalnızca şu JSON biçiminde ver, başka metin yazma: {"title":"kısa rapor adı","columns":["Personel","Grup1","Grup2","Toplam"],"rows":[["Ad Soyad",1,2,3]],"notes":"kısa açıklama"}';
function aiTable(j){
  const cell=v=>typeof v=='number'?fmt(v):(v==null?'':esc(v));
  return '<div style="overflow:auto"><table class="xl xl2"><tr>'+j.columns.map(c=>`<th>${esc(c)}</th>`).join('')+'</tr>'+j.rows.map(r=>'<tr>'+j.columns.map((c,i)=>`<td class="${i?'r':'l'}">${cell(r[i])}</td>`).join('')+'</tr>').join('')+'</table></div>'+(j.notes?'<p class="sub" style="margin:10px 2px;line-height:1.5;white-space:pre-line">ℹ '+esc(j.notes)+'</p>':'');
}
function aiXlsx(j){dlX([[String(j.title||'Rapor').replace(/[\\\/?*\[\]:]/g,'-').slice(0,30),[j.columns].concat(j.rows)]],'HappyMoons_'+String(j.title||'Rapor').replace(/[^A-Za-z0-9ğüşöçıİĞÜŞÖÇ]+/g,'_').slice(0,30)+'_'+new Date().toISOString().slice(0,10));}
const AIF=document.createElement('input');AIF.type='file';AIF.accept='image/*';AIF.multiple=true;AIF.hidden=true;document.body.appendChild(AIF);
AIF.addEventListener('change',()=>{window.__aif=[...AIF.files];const c=$('aic');if(c)c.textContent='('+AIF.files.length+' görsel)';});
window.aiPick=()=>{AIF.value='';AIF.click();};
window.aiUI=()=>{
  let p=AIP0;try{p=localStorage.getItem(GP)||AIP0;}catch(e){}
  window.__aif=[];
  pop('🤖 Yapay zeka ile rapor','<p class="sub" style="margin:0 0 8px;line-height:1.5">Satış raporu görsellerini seç, ne istediğini yaz. Tablo çıkar; Excel\'e aktarabilir ya da garsonlar da indirsin diye kaydedebilirsin.</p><textarea id="aip" class="rsel" rows="5" style="font-size:14px">'+esc(p)+'</textarea><div class="shg"><button class="a ed" onclick="aiPick()">📷 Görselleri seç <span id="aic"></span></button><button class="a an" onclick="aiRun()">🤖 Tabloyu oluştur</button></div><div id="aio" style="margin-top:12px">'+(gKey()?'':'<div class="err">Önce ⚙ Ayarlar → 🔑 Gemini anahtarı ekle.</div>')+'</div>',true);
  $('mo').textContent='Kapat';
};
window.aiRun=async()=>{
  const out=$('aio'),key=gKey(),fs=window.__aif||[];
  if(!key){out.innerHTML='<div class="err">Önce ⚙ Ayarlar → 🔑 Gemini anahtarı ekle.</div>';return;}
  if(!fs.length){out.innerHTML='<div class="err">Önce görselleri seç.</div>';return;}
  const u=$('aip').value.trim()||AIP0;try{localStorage.setItem(GP,u);}catch(e){}
  out.innerHTML='<p class="sub">🤖 Gemini çalışıyor… (10-40 sn sürebilir)</p>';
  try{
    const parts=[{text:aiPrompt(u)}];
    for(const f of fs){const d=await shr(f,1600,.82);parts.push({inline_data:{mime_type:'image/jpeg',data:d.split(',')[1]}});}
    const txt=(await gCall(key,parts)).replace(/^\s*```(?:json)?/i,'').replace(/```\s*$/,'').trim(),j=JSON.parse(txt);
    if(!Array.isArray(j.columns)||!Array.isArray(j.rows))throw new Error('Yanıt tablo biçiminde değil, isteği biraz değiştirip tekrar dene');
    window.__air=j;
    if($('aio'))$('aio').innerHTML=aiTable(j)+'<div class="shg" style="margin-top:10px"><button class="a ed" onclick="aiXlsx(window.__air)">⬇ Excel indir</button><button class="a an" onclick="aiSave()">💾 Garsonlar da görsün (kaydet)</button></div>';
  }catch(e){if($('aio'))$('aio').innerHTML='<div class="err">'+esc(emsg(e))+'</div>';}
};
window.aiXlsx=aiXlsx;
window.aiSave=()=>{
  const j=window.__air;if(!j)return;
  ask('💾 Raporu kaydet · '+BR[B],[{label:'Rapor adı',val:j.title||'Rapor'}],async v=>{
    try{await gs('saveAiReport',B,v[0].trim()||'Rapor',j.columns,JSON.stringify(j.rows),j.notes||'',PIN);PSIG='';pgSync();msg('Kaydedildi ✅\nGarsonlar "📁 Rapor" sekmesinden görüp Excel indirebilir.');}catch(e){msg(emsg(e));}
  },'Kaydet');
};
const repOf=id=>(window.__reps||[]).find(x=>x.id==id);
window.repOpen=id=>{window.__repSel=id;RGRP='';PSIG='';pgSync();window.scrollTo(0,0);};window.repTable=id=>{const r=repOf(id);if(!r)return;const j={title:r.title,columns:r.cols,rows:JSON.parse(r.rj),notes:r.notes};pop('📊 '+r.title,aiTable(j)+'<button class="a ed" style="width:100%;margin-top:10px" onclick="repXls(\''+id+'\')">⬇ Excel indir</button>',true);$('mo').textContent='Kapat';};
window.repXls=id=>{const r=repOf(id);if(!r)return;aiXlsx({title:r.title,columns:r.cols,rows:JSON.parse(r.rj)});};
window.repDel=id=>ask('Bu rapor silinsin mi?',[],async()=>{try{await gs('delAiReport',id,PIN);PSIG='';pgSync();}catch(e){msg(emsg(e));}},'Sil');
const sty9=document.createElement('style');
sty9.textContent='.nv{grid-template-columns:repeat(4,1fr)!important;gap:6px!important}.nv button{font-size:12px!important;padding:10px 0!important}.rb2{display:flex;gap:6px}.x2.w{width:38px;height:38px;font-size:16px}';
document.head.appendChild(sty9);

// ===== Rapor sayfası: grup bazlı liderlik tablosu + kim hangi grupta güçlü =====
let RGRP='';
const GICO={'Taze Meyve Suyu':'🍊','Bubble Tea':'🧋','Menemen & Omlet':'🍳','Filtre Kahve':'☕','Bira':'🍺','Alkollü Kokteyl':'🍹','Kadeh Şarap':'🍷','Şişe Şarap':'🍾','Buzlu Kahve':'🧊','Limonata':'🍋','Su':'💧','Soğuk İçecek':'🥤','Kokteyl':'🍹','Türk Kahvesi':'☕','Filtre Kahve':'☕','Kahve':'☕','Çay':'🫖','Sıcak İçecek':'🍫','Tatlı':'🍰','Başlangıç':'🥗','Yemek':'🍽️','Diğer':'📦'};
const gIco=g=>GICO[g]||'🏷️';
window.repGrp=g=>{RGRP=g;PSIG='';pgSync();};
window.repBoard=function(r){
  let cols,rows;
  try{cols=r.cols||[];rows=JSON.parse(r.rj||'[]').filter(x=>String(x[0]).toUpperCase()!='TOPLAM');}catch(e){return '';}
  const gi=[];cols.forEach((c,i)=>{if(i>0&&c!='Toplam'&&c!='Wheel'&&rows.some(x=>Number(x[i])>0))gi.push(i);});
  if(!gi.length)return '';
  if(!gi.some(i=>cols[i]==RGRP))RGRP=cols[gi[0]];
  const ci=cols.indexOf(RGRP),dt=new Date(r.t).toLocaleDateString('tr-TR');
  let h='<div class="simgh" style="padding:2px 2px 10px"><b>🏆 '+esc(r.title)+'</b><span>'+dt+'</span></div>';
  h+='<div class="pers">'+gi.map(i=>`<button class="${cols[i]==RGRP?'on':''}" data-g="${esc(cols[i])}" onclick="repGrp(this.dataset.g)">${gIco(cols[i])} ${esc(cols[i])}</button>`).join('')+'</div>';
  const L=rows.filter(x=>Number(x[ci])>0).map(x=>({name:String(x[0]),qty:Number(x[ci]),key:''})).sort((a,b)=>b.qty-a.qty);
  h+=lbQty(L,false,0,RGRP.toLowerCase());
  const stat={};
  gi.forEach(i=>{const v=rows.map(x=>({n:String(x[0]),v:Number(x[i])||0})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v),avg=v.reduce((a,x)=>a+x.v,0)/v.length,pos={};v.forEach((x,k)=>{pos[x.n]=k+1;});stat[i]={avg:avg,pos:pos};});
  const P=rows.map(x=>{const a=[];gi.forEach(i=>{const v=Number(x[i])||0;if(v>0)a.push({g:cols[i],v:v,rank:stat[i].pos[String(x[0])],idx:v/stat[i].avg});});a.sort((p,q)=>q.idx-p.idx);return {name:String(x[0]),a:a};}).filter(p=>p.a.length).sort((p,q)=>q.a[0].idx-p.a[0].idx);
  const med=k=>k==1?'🥇':k==2?'🥈':k==3?'🥉':k+'.';
  h+='<div class="sec2" style="margin-top:16px">⭐ KİM HANGİ GRUPTA GÜÇLÜ <span>'+P.length+'</span></div><div class="lb">'+P.map(p=>{
    const b=p.a[0],pc=Math.round((b.idx-1)*100),oth=p.a.slice(1).filter(x=>x.rank<=3).map(x=>gIco(x.g)+' '+esc(x.g)+' '+med(x.rank)).join(' · ');
    return `<div class="lr"><b class="av">${esc(ini(p.name))}</b><div class="lm"><div class="ln">${esc(nice(p.name))}<span class="tr u">${gIco(b.g)} ${esc(b.g)} ${med(b.rank)}</span></div><div class="ls">${fmt(b.v)} adet · ortalamanın ${pc>=0?'%'+pc+' üstünde':'%'+(-pc)+' altında'}${oth?'<br>Ayrıca: '+oth:''}</div></div></div>`;
  }).join('')+'</div><p class="sub" style="margin:8px 2px;line-height:1.5">Güçlü grup: kişinin o gruptaki miktarının, grup ortalamasına oranı en yüksek olan grup.</p>';
  h+='<button class="a ed" style="width:100%;margin:6px 0 14px" data-i="'+esc(r.id)+'" onclick="repTable(this.dataset.i)">📋 Tablo / Excel</button>';
  return h;
};

// ----- Garson: Rapor sekmesinde sadece kendi satışları -----
window.repMine=function(r){
  const me=getMe(),s0=((D&&D.staff)||[]).find(s=>s.id==me);
  if(!s0)return '<div class="hot">Önce <b>Mola</b> sekmesinden adını seç. Satışların burada sadece sana özel görünür.</div>';
  let cols,rows;
  try{cols=r.cols||[];rows=JSON.parse(r.rj||'[]').filter(x=>String(x[0]).toUpperCase()!='TOPLAM');}catch(e){return '';}
  const k=nrm(s0.name),mine=rows.find(x=>nrm(x[0])==k)||rows.find(x=>nrm(x[0]).length>3&&lev(nrm(x[0]),k)<=Math.floor(k.length*.25));
  let h='<div class="simgh" style="padding:2px 2px 10px"><b>📊 '+esc(r.title)+'</b><span>'+new Date(r.t).toLocaleDateString('tr-TR')+'</span></div>';
  if(!mine)return h+'<div class="hot">Bu raporda adına ait satış bulunamadı.</div>';
  const cards=[];let best=null,tot=0;
  cols.forEach((c,i)=>{
    if(i==0||c=='Toplam'||c=='Wheel')return;
    const v=Number(mine[i])||0;if(v<=0)return;
    const all=rows.map(x=>Number(x[i])||0).filter(x=>x>0),rank=all.filter(x=>x>v).length+1,idx=v/(all.reduce((a,b)=>a+b,0)/all.length);
    tot+=v;cards.push({g:c,v:v,rank:rank,n:all.length});
    if(!best||idx>best.idx)best={g:c,rank:rank,idx:idx};
  });
  h+='<div class="hi"><b>'+esc(ini(s0.name))+'</b><div><div class="hi1">'+esc(nice(s0.name))+'</div><div class="hi2">Toplam '+fmt(tot)+' adet</div></div></div>';
  if(!cards.length)return h+'<div class="hot">Bu raporda satışın görünmüyor.</div>';
  if(best)h+='<div class="hot">⭐ En güçlü olduğun grup: '+gIco(best.g)+' <b>'+esc(best.g)+'</b> ('+best.rank+'. sıradasın)</div>';
  h+='<div class="kp">'+cards.map(c=>`<div><b>${fmt(c.v)}</b><span>${gIco(c.g)} ${esc(c.g)}</span><span style="display:block;color:#fde68a;margin-top:2px">${c.rank}. / ${c.n}</span></div>`).join('')+'</div>';
  return h;
};

// ===== Ciro / ortalama birincisi kartları (Rapor > Ciro & Ortalama) =====
const repTabs=()=>`<div class="seg"><button class="${REPSUB=='ciro'?'on':''}" onclick="repSub('ciro')">💰 Ciro & Ortalama</button><button class="${REPSUB=='urun'?'on':''}" onclick="repSub('urun')">🍺 Ürün grupları</button></div>`;
window.repSub=x=>{REPSUB=x;PSIG='';pgSync();};
window.ciroRefresh=per=>{PSEL.ciro=per?nR(per):null;PC.ciro=[];REPSUB='ciro';if(PGV!='rep')goPg('rep');else{PSIG='';pgSync();}};
function leadCards(L){
  const R=L.filter(r=>Number(r.ciro)>0);if(!R.length)return '';
  const big=R.filter(r=>Number(r.hesap)>=10),pool=big.length?big:R;
  const c=R.slice().sort((a,b)=>b.ciro-a.ciro)[0],o=pool.slice().sort((a,b)=>b.ort-a.ort)[0];
  return '<div class="lead"><div><small>💰 CİRO BİRİNCİSİ</small><b>'+esc(nice(c.name))+'</b><span>'+fmt(Math.round(c.ciro))+' TL</span></div><div><small>📈 ORTALAMA BİRİNCİSİ</small><b>'+esc(nice(o.name))+'</b><span>'+tl2(o.ort)+' TL</span></div></div>';
}
const styL=document.createElement('style');
styL.textContent='.lead{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 6px}.lead div{background:linear-gradient(135deg,#7c2d12,#b45309);border:1px solid rgba(251,191,36,.45);border-radius:16px;padding:10px 12px;min-width:0}.lead small{display:block;font-size:10px;letter-spacing:.06em;color:#fde68a;font-weight:800}.lead b{display:block;font-size:15px;margin:3px 0 1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lead span{font-weight:800;color:#fff}.leadp{font-size:11px;color:#94a3b8;margin:0 2px 12px}';
document.head.appendChild(styL);

// ===== 🚌 Servis Takip: günlük güzergah kaydı, her ay ayrı rapor =====
const SVG=['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'],SVM=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const p2=n=>('0'+n).slice(-2),svIso=d=>d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate()),svParse=x=>{const a=x.split('-');return new Date(+a[0],+a[1]-1,+a[2]);},svFmt=d=>p2(d.getDate())+'.'+p2(d.getMonth()+1)+'.'+d.getFullYear();
const SV={cur:svIso(new Date()),routes:[],days:{},draft:{r:[],n:''},dirty:false,loaded:'',t:0,busy:false,msg:''};
const svDraftFrom=()=>{const o=SV.days[SV.cur];SV.draft={r:(o&&o.r)?o.r.slice():[],n:(o&&o.n)||''};SV.dirty=false;};
async function svLoad(force){
  const key=B+SV.cur.slice(0,7);
  if(!force&&SV.loaded==key&&(SV.dirty||Date.now()-SV.t<30000))return;
  const d=await gs('getServis',B,SV.cur.slice(0,7));
  SV.routes=d.routes;SV.days=d.days;SV.loaded=key;SV.t=Date.now();
  if(!SV.dirty)svDraftFrom();
}
const svRe=()=>renderPg(true);
window.svSwitch=async function(nd){
  if(SV.dirty){let q=true;try{q=confirm('Kaydedilmemiş değişiklik var. Kaydedilsin mi?');}catch(e){}if(q)await svSave();}
  const sameMonth=nd.slice(0,7)==SV.cur.slice(0,7);
  SV.cur=nd;SV.dirty=false;SV.msg='';
  if(sameMonth){svDraftFrom();svRe();}else{PSIG='';await renderPg();}
};
window.svGo=n=>svSwitch(svIso(new Date(svParse(SV.cur).getFullYear(),svParse(SV.cur).getMonth(),svParse(SV.cur).getDate()+n)));
window.svPick=x=>{if(x)svSwitch(x);};
window.svToday=()=>svSwitch(svIso(new Date()));
window.svMon=n=>{const d=svParse(SV.cur);svSwitch(svIso(new Date(d.getFullYear(),d.getMonth()+n,1)));};
window.svTog=r=>{const k=SV.draft.r.indexOf(r);if(k>-1)SV.draft.r.splice(k,1);else SV.draft.r.push(r);SV.draft.r.sort((a,b)=>SV.routes.indexOf(a)-SV.routes.indexOf(b));SV.dirty=true;SV.msg='';svRe();};
window.svNote=v=>{SV.draft.n=v;SV.dirty=true;const b=$('svsave');if(b){b.textContent='Kaydet (değişiklik var)';b.classList.add('dirty');}};
window.svClear=()=>{SV.draft={r:[],n:''};SV.dirty=true;svRe();};
window.svSave=async function(){
  if(SV.busy)return;
  const r=SV.draft.r.filter(Boolean),n=SV.draft.n.trim();
  SV.busy=true;SV.msg='Kaydediliyor…';svRe();
  try{
    await gs('saveServisDay',B,SV.cur,r,n,PIN);
    if(r.length||n)SV.days[SV.cur]={r:r,n:n};else delete SV.days[SV.cur];
    SV.dirty=false;SV.t=Date.now();SV.msg='✓ Kaydedildi '+p2(new Date().getHours())+':'+p2(new Date().getMinutes())+' · herkes görebilir';
  }catch(e){SV.msg='Kaydedilemedi: '+emsg(e);}
  SV.busy=false;svRe();
};
window.svRoutes=()=>ask('🚌 Güzergahlar · '+BR[B]+'\nHer satıra bir güzergah yaz. Silmek için satırı sil.',[{label:'Güzergahlar',type:'textarea',val:SV.routes.join('\n')}],async v=>{
  try{SV.routes=await gs('saveServisRoutes',B,v[0].split(/\r?\n/),PIN);SV.draft.r=SV.draft.r.filter(x=>SV.routes.indexOf(x)>-1);svRe();}catch(e){msg(emsg(e));}
},'Kaydet');
function svRows(ym,days){   // ay içindeki satırlar: Pazartesi-Cumartesi + kaydı olan Pazarlar
  const a=ym.split('-'),y=+a[0],m=+a[1]-1,n=new Date(y,m+1,0).getDate(),R=[];
  for(let i=1;i<=n;i++){const d=new Date(y,m,i),k=svIso(d),o=days[k];if(d.getDay()===0&&!(o&&((o.r&&o.r.length)||o.n)))continue;R.push({k:k,d:d,r:(o&&o.r)||[],n:(o&&o.n)||''});}
  return R;
}
function svHtml(adm){
  const ym=SV.cur.slice(0,7),d=svParse(SV.cur),R=svRows(ym,SV.days),tk=svIso(new Date()),cnt={};
  R.forEach(x=>x.r.forEach(r=>{cnt[r]=(cnt[r]||0)+1;}));
  let h='';
  const td=SV.days[tk];
  if(ym==tk.slice(0,7))h+='<div class="hot" style="margin-bottom:10px">📅 Bugün: <b>'+(td&&td.r&&td.r.length?esc(td.r.join(' - ')):'kayıt yok')+'</b>'+(td&&td.n?'<br><small>'+esc(td.n)+'</small>':'')+'</div>';
  if(adm){
    h+='<div class="svc"><div class="svn"><button class="x2 w" onclick="svGo(-1)">‹</button><input type="date" value="'+SV.cur+'" onchange="svPick(this.value)"><button class="x2 w" onclick="svGo(1)">›</button></div>';
    h+='<div class="svb">'+SVG[d.getDay()]+', '+svFmt(d)+'</div><div class="svch">'+SV.routes.map(r=>{const on=SV.draft.r.indexOf(r)>-1;return `<button class="${on?'on':''}" data-r="${esc(r)}" onclick="svTog(this.dataset.r)">${on?'✓ ':''}${esc(r)}</button>`;}).join('')+'<button class="add" onclick="svRoutes()">✏️ Güzergah ekle / düzenle</button></div>';
    h+='<input class="svnote" placeholder="Not (servis, plaka, şoför…)" value="'+esc(SV.draft.n)+'" oninput="svNote(this.value)">';
    h+='<button id="svsave" class="a an svsave'+(SV.dirty?' dirty':'')+'" onclick="svSave()"'+(SV.busy?' disabled':'')+'>'+(SV.dirty?'Kaydet (değişiklik var)':'Kaydet')+'</button><div class="svst">'+esc(SV.msg)+'</div>';
    h+='<div class="svrow"><button class="a x" onclick="svClear()">Bu günü temizle</button><button class="a ed" onclick="svToday()">Bugün</button></div></div>';
  }
  h+='<div class="svn" style="margin-top:14px"><button class="x2 w" onclick="svMon(-1)">‹</button><div class="svm">'+SVM[d.getMonth()]+' '+d.getFullYear()+' raporu</div><button class="x2 w" onclick="svMon(1)">›</button></div>';
  const cs=Object.keys(cnt);
  h+='<div class="svs">'+(cs.length?cs.map(r=>'<span><b>'+esc(r)+'</b> '+cnt[r]+' gün</span>').join(''):'<span>Bu ay henüz kayıt yok</span>')+'</div>';
  h+='<div style="overflow:auto"><table class="xl"><tr><th>Tarih</th><th>Gün</th><th>Güzergah</th><th>Not</th></tr>'+R.map(x=>'<tr'+(x.k===SV.cur?' style="outline:2px solid #6366f1;outline-offset:-2px"':'')+(adm?' onclick="svPick(\''+x.k+'\')"':'')+'><td>'+svFmt(x.d)+'</td><td>'+SVG[x.d.getDay()]+'</td><td'+(x.r.length?'':' style="color:#64748b"')+'>'+(x.r.length?esc(x.r.join(' - ')):'—')+'</td><td>'+esc(x.n)+'</td></tr>').join('')+'</table></div>';
  return h;
}
const svAoa=(ym,days)=>[['Tarih','Gün','Güzergah','Not']].concat(svRows(ym,days).map(x=>[svFmt(x.d),SVG[x.d.getDay()],x.r.join(' - '),x.n]));
const svName=ym=>{const a=ym.split('-');return SVM[+a[1]-1]+' '+a[0];};
window.svXls=()=>{const ym=SV.cur.slice(0,7);dlX([[svName(ym),svAoa(ym,SV.days)]],'Servis_'+BR[B].replace(/\s/g,'_')+'_'+ym);};
window.svXlsAll=async()=>{
  try{
    const L=await gs('getServisAll',B);
    if(!L.length){msg('Henüz kayıt yok.');return;}
    dlX(L.map(x=>[svName(x.ym),svAoa(x.ym,x.days)]),'Servis_'+BR[B].replace(/\s/g,'_')+'_tum_aylar');
  }catch(e){msg(emsg(e));}
};
const styS=document.createElement('style');
styS.textContent='.svc{background:#172033;border:1px solid rgba(148,163,184,.14);border-radius:16px;padding:12px}.svn{display:flex;gap:8px;align-items:center}.svn input{flex:1;min-width:0;padding:11px;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#fff;font-size:16px}.svn .x2{width:44px;height:44px;font-size:20px}.svm{flex:1;text-align:center;font-weight:800;font-size:15px}.svb{font-weight:800;font-size:18px;margin:12px 2px 4px}.svch{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.svch button{border:1.5px solid #475569;background:transparent;color:#e2e8f0;padding:11px 16px;border-radius:999px;font-size:16px}.svch button.on{background:#14532d;border-color:#4ade80;color:#bbf7d0;font-weight:700}.svch button.add{border-style:dashed;color:#94a3b8;font-size:14px}.svnote{width:100%;margin-top:12px;padding:11px;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#fff;font-size:16px}.svsave{width:100%;margin-top:12px}.svsave.dirty{background:#c77700!important}.svst{font-size:13px;color:#94a3b8;margin-top:8px;min-height:18px}.svrow{display:flex;gap:8px;margin-top:8px}.svrow .a{flex:1}.svs{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.svs span{background:#172033;border:1px solid rgba(148,163,184,.18);border-radius:999px;padding:6px 12px;font-size:13px}.svs b{color:#4ade80}';
document.head.appendChild(styS);

// ===== Personel ekranı: bugünün ve yarının vardiyası =====
const istIso=off=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date(Date.now()+off*864e5));
window.shiftOf=(s,key)=>{   // 'YYYY-MM-DD' -> 'HH:MM-HH:MM' | '' (izin) | undefined (bilinmiyor)
  if(s.shd&&(key in s.shd))return s.shd[key];
  if(s.shd||!s.sh)return undefined;
  return s.sh[(new Date(key+'T00:00:00Z').getUTCDay()+6)%7];
};
function shiftTwo(s){
  if(!s.shd&&!s.sh)return '';
  const f=k=>{const v=window.shiftOf(s,k);return v===undefined?'—':(v?esc(v.replace('-','–')):'İzin');};
  return '🕗 Bugün <b>'+f(istIso(0))+'</b> · Yarın <b>'+f(istIso(1))+'</b><br>';
}
var hs = document.querySelector('.hs'); if (hs) hs.textContent += ' · v26';
});
})();

// 🤖 Rapor modülü v3
// 1) Görseli telefonda OCR ile okur (görsel internete gönderilmez, "Failed to fetch" olmaz)
// 2) Ürün ADLARINI (küçük bir metin listesi) Gemini'ye gönderip gruplara ayırtır
// 3) Gemini'ye ulaşılamazsa anahtar kelime kurallarıyla gruplar
// 4) Toplamları kod hesaplar: Personel x Grup (Bira, Kokteyl, Kahve, Tatlı, Başlangıç, Yemek, Diğer) + Toplam
// index.html'de gas-shim.js satırının HEMEN ALTINA: <script src="ai-rapor.js"></script>
(function () {
window.addEventListener('load', function () {

const GR = ['Bira', 'Alkollü Kokteyl', 'Kadeh Şarap', 'Şişe Şarap', 'Türk Kahvesi', 'Filtre Kahve', 'Buzlu Kahve', 'Çay', 'Limonata', 'Su', 'Taze Meyve Suyu', 'Bubble Tea', 'Tatlı', 'Başlangıç', 'Menemen & Omlet'];   // tabloya girenler; bunların dışındaki ürünler tabloya alınmaz
let CG = [];   // yöneticinin eklediği gruplar: {name, codes:"2005,2006", words:"tost,sandvic"}
const GRX = () => GR.concat(CG.map(g => g.name).filter(n => GR.indexOf(n) < 0).filter((n, i, a) => a.indexOf(n) == i));
const fmt = n => Number(n).toLocaleString('tr-TR');
const nu = s => parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
const fold = s => String(s || '').replace(/İ/g, 'I').replace(/ı/g, 'i').toUpperCase().replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C').replace(/\s+/g, ' ').trim();
const custom = (code, name) => {
  const c = String(code || ''), x = fold(name);
  let best = '', bl = 0;
  CG.forEach(g => String(g.codes || '').split(/[,;\s]+/).filter(Boolean).forEach(p => { if (c.indexOf(p) === 0 && p.length > bl) { best = g.name; bl = p.length; } }));
  if (best) return best;
  for (const g of CG) { const ws = String(g.words || '').split(/[,;]+/).map(w => fold(w)).filter(Boolean); if (ws.some(w => x.indexOf(w) >= 0)) return g.name; }
  return '';
};

// ---- Yedek kural listesi (ürün kodu tanınmazsa ad kelimelerine bakılır) ----
const RX = [
  ['Bira', /EFES|PILSEN|MALT|CORONA|MILLER|BOMONTI|\bBUD\b|GUINNESS|HEINEKEN|TUBORG|CARLSBERG|STELLA|ERDINGER|DUVEL|BECK|BIRA|FICI|FILTRESIZ|WHE+L|KMPN/],
  ['Alkollü Kokteyl', /MOJITO|MARGARITA|COSMOPOLITAN|LONG ISLAND|APEROL|SPRITZ|MARTINI|ZESTY|VELVET|PINA|COLADA|KOKTEYL|NEGRONI|DAIQUIRI|CAIPIRINHA|BLOODY|SEX ON|COCKTAIL|SANGRIA|MIMOSA|BELLINI|MIRAGE|BASIL/],
  ['Kadeh Şarap', /\bKADEH/],
  ['Şişe Şarap', /SISE SARAP|YAKUT|\bSARAP\b/],
  ['Buzlu Kahve', /\bICE (AMERICANO|LATTE|MOCHA|CARAMEL)|FRAPPE|FROZEN|VANILLINO|CREMINO/],
  ['Türk Kahvesi', /TURK\s*KAH/],
  ['Filtre Kahve', /FILI?TRE\s*KAH/],
  ['Çay', /\bCAY\b/],
  ['Sıcak İçecek', /CHAI|SICAK CIKOLATA|SAHLEP|SALEP/],
  ['Kahve', /KAHVE|COFFEE|ESPRESSO|LATTE|CAPPUCCINO|AMERICANO|MOCHA|NESCAFE|MACCHIATO|CORTADO/],
  ['Menemen & Omlet', /MENEMEN|OMLET/],
  ['Bubble Tea', /BUBBLE/],
  ['Taze Meyve Suyu', /^TAZE\b.*SUYU/],
  ['Limonata', /LIMONATA/],
  ['Su', /^SU$/],
  ['Soğuk İçecek', /COLA|FANTA|SPRITE|SODA|REDBULL|AYRAN|CAPPY|FUSE TEA|SCHWEPPES|TONIC|MEYVE SUYU|PORTAKAL SUYU|HAVUC SUYU|ELMA SUYU|BUBBLE|ICE TEA/],
  ['Tatlı', /TATLI|CHEESECAKE|SUFLE|TIRAMISU|TIREMISU|BROWNIE|WAFFLE|DONDURMA|SAN SEBASTIAN|PROFITEROL|BAKLAVA|KUNEFE|SUTLAC|TRILECE|CHURROS|PASTA\b|\bKEK\b|LAVA|FONDANT|MAGNOLIA|COOKIE|KREP|BANANA SPLIT/],
  ['Başlangıç', /BASLANGIC|CHICKEN|NACOS|NACHOS|MAC AND CHEESE|QUESADILLA|COMBO|FONDU|PARMAK|CORBA|SALATA|MEZE|PATATES|SOGAN|CITIR|KANAT|PEYNIR|BRUSCHETTA|HUMMUS|SIGARA|BOREK|ATISTIRMALIK/],
  ['Yemek', /BURGER|PIZZA|MAKARNA|PENNE|SPAGHETTI|TAVUK|STEAK|BIFTEK|KOFTE|SANDVIC|SANDWICH|DURUM|WRAP|KUZU|KARIDES|BALIK|SNITZEL|PILAV|YEMEK|IZGARA|SOTE|TOST|OMLET|MENEMEN/]
];
const hot = n => {   // 2201xxx = sıcak içecekler, alt grubu ürün adından
  const x = fold(n);
  if (/TURK\s*KAH/.test(x)) return 'Türk Kahvesi';
  if (/FILI?TRE/.test(x)) return 'Filtre Kahve';
  if (/\bCAY\b/.test(x)) return 'Çay';
  if (/CHAI|SICAK CIKOLATA|SAHLEP|SALEP/.test(x)) return 'Sıcak İçecek';
  if (/AMERICANO|LATTE|MOCHA|CAPP?U|ESP|NES ?CAFE|CAFE|MACCHIATO|CORTADO|KAHVE/.test(x)) return 'Kahve';
  return 'Sıcak İçecek';
};
const soft = n => {  // 2200xxx = soğuk içecekler
  const x = fold(n);
  if (x == 'SU') return 'Su';
  if (/LIMONATA/.test(x)) return 'Limonata';
  return 'Soğuk İçecek';
};
const byCode = (c, n) => {
  const x = fold(n);
  if (/MENEMEN|OMLET/.test(x)) return 'Menemen & Omlet';
  if (/BUBBLE/.test(x)) return 'Bubble Tea';
  if (/^TAZE\b.*SUYU/.test(x)) return 'Taze Meyve Suyu';
  if (/^2500/.test(c)) return 'Bira';
  if (/^2512/.test(c)) return 'Alkollü Kokteyl';
  if (/^2502/.test(c) || /^KADEH/.test(x)) return 'Kadeh Şarap';
  if (/^2505/.test(c)) return 'Şişe Şarap';
  if (/^2203/.test(c)) return 'Buzlu Kahve';
  if (/^2201/.test(c)) return hot(n);
  if (/^2200/.test(c)) return soft(n);
  if (/^2003/.test(c)) return 'Başlangıç';
  if (/^2013/.test(c)) return 'Tatlı';
  return '';
};
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
  const prompt = 'Aşağıda bir restoran/kafe kasa programından ürün adları var. Her ürünü şu gruplardan SADECE birine ata: ' + GRX().concat(['Diğer']).join(', ') + '. Hiçbirine uymayanlar Diğer olsun. Türk kahvesi ve double Türk kahve Türk Kahvesi; sıcak espresso bazlı kahveler Kahve; ice/buzlu kahveler Buzlu Kahve; bardak/fincan çay Çay; sade su Su; limonata çeşitleri Limonata; kola, soda, meyve suyu, ayran vb. Soğuk İçecek; kadeh şarap Kadeh Şarap; şişe şarap Şişe Şarap; alkollü kokteyller Alkollü Kokteyl.' + (note ? '\nKullanıcı notu: ' + note : '') + '\nYanıtı yalnızca JSON nesnesi olarak ver, anahtar ürün adı (aynen), değer grup: {"ÜRÜN ADI":"Grup"}\n\nÜrünler:\n' + list.join('\n');
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
    names.forEach(nm => { const v = lk[fold(nm)], g = GRX().find(x => fold(x) == fold(v)); if (g) { map[fold(nm)] = g; n++; } });
    return { map: map, info: '✓ Ürün grupları Gemini ile belirlendi (' + n + '/' + names.length + ' ürün).' };
  } catch (e) { return { map: map, info: '⚠ Gemini\'ye ulaşılamadı (' + e.message + '), ürünler anahtar kelime kurallarıyla gruplandı.' }; }
}

// ---- Excel okuyucu: .xls'yi kendisi okur (internet / harici kütüphane gerekmez) ----
function cfbStream(u8) {                       // .xls = OLE2 kap dosyası; içinden "Workbook" akışını çıkar
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const ss = 1 << dv.getUint16(30, true), ms = 1 << dv.getUint16(32, true), END = 0xFFFFFFFA;
  const nFat = dv.getUint32(44, true), dirStart = dv.getUint32(48, true), cutoff = dv.getUint32(56, true), mfStart = dv.getUint32(60, true), difStart = dv.getUint32(68, true), nDif = dv.getUint32(72, true);
  const sec = i => u8.subarray((i + 1) * ss, (i + 2) * ss);
  const fatIdx = [];
  for (let i = 0; i < 109; i++) { const v = dv.getUint32(76 + i * 4, true); if (v < END) fatIdx.push(v); }
  for (let d = difStart, n = 0; n < nDif && d < END; n++) {
    const sd = sec(d), x = new DataView(sd.buffer, sd.byteOffset, sd.byteLength);
    for (let i = 0; i < ss / 4 - 1; i++) { const v = x.getUint32(i * 4, true); if (v < END) fatIdx.push(v); }
    d = x.getUint32(ss - 4, true);
  }
  const fat = [];
  fatIdx.slice(0, nFat).forEach(i => { const sd = sec(i), x = new DataView(sd.buffer, sd.byteOffset, sd.byteLength); for (let k = 0; k < ss / 4; k++) fat.push(x.getUint32(k * 4, true)); });
  const chain = (st, tbl) => { const o = []; let c = st, g = 0; while (c < END && g++ < 5e6) { o.push(c); c = tbl[c]; } return o; };
  const readBig = (st, size) => { const ch = chain(st, fat), buf = new Uint8Array(ch.length * ss); ch.forEach((c, i) => buf.set(sec(c), i * ss)); return size == null ? buf : buf.subarray(0, size); };
  const dir = readBig(dirStart), dd = new DataView(dir.buffer, dir.byteOffset, dir.byteLength), ents = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nl = dd.getUint16(o + 64, true); let nm = '';
    for (let k = 0; k < (nl >> 1) - 1; k++) nm += String.fromCharCode(dd.getUint16(o + k * 2, true));
    ents.push({ name: nm, type: dir[o + 66], start: dd.getUint32(o + 116, true), size: dd.getUint32(o + 120, true) });
  }
  const wb = ents.find(e => e.type == 2 && /^(workbook|book)$/i.test(e.name));
  if (!wb) throw new Error('Excel içinde çalışma kitabı bulunamadı');
  if (wb.size >= cutoff) return readBig(wb.start, wb.size);
  const root = ents.find(e => e.type == 5), mini = readBig(root.start, root.size), mf = [];
  chain(mfStart, fat).forEach(i => { const sd = sec(i), x = new DataView(sd.buffer, sd.byteOffset, sd.byteLength); for (let k = 0; k < ss / 4; k++) mf.push(x.getUint32(k * 4, true)); });
  const mch = chain(wb.start, mf), out = new Uint8Array(mch.length * ms);
  mch.forEach((c, i) => out.set(mini.subarray(c * ms, (c + 1) * ms), i * ms));
  return out.subarray(0, wb.size);
}
function biffAoa(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), recs = [];
  for (let p = 0; p + 4 <= b.length;) { const id = dv.getUint16(p, true), len = dv.getUint16(p + 2, true); recs.push({ id: id, d: b.subarray(p + 4, p + 4 + len) }); p += 4 + len; }
  const ustr = (d, off, cch, fl) => {            // 0x01 = 16 bit karakter
    let s = ''; for (let i = 0; i < cch; i++) s += String.fromCharCode((fl & 1) ? (d[off + i * 2] | (d[off + i * 2 + 1] << 8)) : d[off + i]); return s;
  };
  const sstParse = chunks => {                    // paylaşılan metin tablosu (CONTINUE kayıtlarını da birleştirir)
    let ci = 0, pos = 0;
    const need = () => { while (ci < chunks.length && pos >= chunks[ci].length) { ci++; pos = 0; } return ci < chunks.length; };
    const u8 = () => { need(); return chunks[ci][pos++]; }, u16 = () => u8() | (u8() << 8), u32 = () => (u16() | (u16() << 16)) >>> 0;
    u32(); const uniq = u32(), out = [];
    for (let k = 0; k < uniq && need(); k++) {
      const cch = u16(), fl = u8(); let rt = 0, ext = 0, wide = fl & 1, s = '';
      if (fl & 8) rt = u16(); if (fl & 4) ext = u32();
      for (let n = 0; n < cch; n++) {
        if (pos >= chunks[ci].length) { ci++; pos = 0; if (ci >= chunks.length) break; wide = chunks[ci][pos++] & 1; }
        s += String.fromCharCode(wide ? (u8() | (u8() << 8)) : u8());
      }
      for (let i = 0; i < rt * 4 + ext; i++) u8();
      out.push(s);
    }
    return out;
  };
  const rk = n => { let x; if (n & 2) x = n >> 2; else { const t = new DataView(new ArrayBuffer(8)); t.setUint32(0, (n & 0xFFFFFFFC) >>> 0); x = t.getFloat64(0); } return (n & 1) ? x / 100 : x; };
  let sst = [], inSheet = false, done = false, maxC = 0, pend = null;
  const cells = [], put = (r, c, v) => { (cells[r] || (cells[r] = []))[c] = v; if (c > maxC) maxC = c; };
  for (let i = 0; i < recs.length && !done; i++) {
    const r = recs[i], d = r.d, v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    if (r.id == 0xFC) { const ch = [d]; while (i + 1 < recs.length && recs[i + 1].id == 0x3C) ch.push(recs[++i].d); sst = sstParse(ch); continue; }
    if (r.id == 0x809) { if (v.getUint16(2, true) == 0x10) { if (inSheet) done = true; else inSheet = true; } continue; }
    if (!inSheet) continue;
    if (r.id == 0x0A) { done = true; continue; }
    if (r.id == 0xFD) put(v.getUint16(0, true), v.getUint16(2, true), sst[v.getUint32(6, true)]);
    else if (r.id == 0x203) put(v.getUint16(0, true), v.getUint16(2, true), v.getFloat64(6, true));
    else if (r.id == 0x27E) put(v.getUint16(0, true), v.getUint16(2, true), rk(v.getUint32(6, true)));
    else if (r.id == 0xBD) { const row = v.getUint16(0, true), c0 = v.getUint16(2, true), n = (d.length - 6) / 6 | 0; for (let k = 0; k < n; k++) put(row, c0 + k, rk(v.getUint32(6 + k * 6, true))); }
    else if (r.id == 0x204) { const cch = v.getUint16(6, true), fl = d[8]; put(v.getUint16(0, true), v.getUint16(2, true), ustr(d, 9, cch, fl)); }
    else if (r.id == 0x06) { if (d[12] == 0xFF && d[13] == 0xFF) pend = [v.getUint16(0, true), v.getUint16(2, true)]; else put(v.getUint16(0, true), v.getUint16(2, true), v.getFloat64(6, true)); }
    else if (r.id == 0x207 && pend) { const cch = v.getUint16(0, true); put(pend[0], pend[1], ustr(d, 3, cch, d[2])); pend = null; }
  }
  const aoa = [];
  for (let r = 0; r < cells.length; r++) { const row = []; for (let c = 0; c <= maxC; c++) { const x = cells[r] && cells[r][c]; row.push(x == null ? '' : x); } aoa.push(row); }
  return aoa;
}
async function readXls(f) {
  const buf = await new Promise((ok, no) => {
    const fr = () => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('Dosya okunamadı (' + ((r.error && r.error.name) || 'izin') + '). Dosyayı "Dosyalar / İndirilenler" içinden tekrar seçip dene')); r.readAsArrayBuffer(f); };
    if (f.arrayBuffer) f.arrayBuffer().then(ok, fr); else fr();
  });
  const u = new Uint8Array(buf);
  if (u[0] == 0xD0 && u[1] == 0xCF) return biffAoa(cfbStream(u));                       // .xls
  if (u[0] == 0x50 && u[1] == 0x4B) {                                                   // .xlsx
    if (typeof DecompressionStream != 'undefined') { try { return await xlsxAoa(u); } catch (e) {} }
    if (typeof XLSX == 'undefined') await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; sc.onload = ok; sc.onerror = () => no(new Error('.xlsx okuyucu yüklenemedi, dosyayı .xls olarak kaydet')); document.head.appendChild(sc); });
    const wb = XLSX.read(u, { type: 'array' });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
  }
  const head = new TextDecoder().decode(u.subarray(0, 300));
  if (/<html|<table/i.test(head)) {                                                     // HTML olarak kaydedilmiş .xls
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(u), 'text/html');
    return [...doc.querySelectorAll('tr')].map(tr => [...tr.children].map(td => td.textContent.trim()));
  }
  throw new Error('Dosya Excel (.xls / .xlsx) biçiminde değil');
}
function parseRows(aoa, br) {
  const staff = [], notes = [];
  let cur = null, grand = null, skipped = 0, hi = -1, cc = -1, nc = -1, sc = -1, qc = -1;
  const txt = x => String(x == null ? '' : x).trim();
  const num = v => { if (typeof v == 'number') return v; const s = txt(v); if (!s || !/^-?[\d.,]+$/.test(s)) return NaN; return /,/.test(s) ? nu(s) : parseFloat(s); };
  for (let i = 0; i < aoa.length && hi < 0; i++) {
    const f = aoa[i].map(c => fold(c)), k = f.indexOf('URUN NO');
    if (k >= 0) { hi = i; cc = k; nc = f.indexOf('URUN ADI'); sc = f.indexOf('SUBE ADI'); qc = f.indexOf('MIKTAR'); }
  }
  if (hi < 0 || qc < 0) throw new Error('Excel biçimi tanınmadı (Ürün No / Miktar sütunları bulunamadı)');
  const open = () => { cur = { name: '?', items: [], sum: 0, tot: null }; staff.push(cur); };
  for (let i = hi + 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r.some(c => txt(c) !== '') || r.some(c => fold(c) == 'URUN NO')) continue;
    const code = [cc, cc - 1, cc + 1].map(k => txt(r[k])).find(t => /^\d{7}$/.test(t)) || '';
    const left = r.slice(0, cc).map(txt).filter(Boolean);
    const idc = left.find(t => /^\d{1,3}-\d{1,3}$/.test(t)) || '';
    const nameC = left.filter(t => t != idc && /[A-Za-zÇĞİÖŞÜçğıöşü]{2,}/.test(t)).join(' ');
    const nums = r.slice(Math.max(qc - 2, 0)).map(num).filter(x => !isNaN(x));
    if (idc || nameC.length >= 4) { open(); cur.name = nameC || '?'; }
    if (code && nums.length) {
      const fb = fold(sc >= 0 ? txt(r[sc]) : '');
      if (fb && (br == 'mavi' ? (/OPTIMUM/.test(fb) && !/MAVI/.test(fb)) : (/MAVI/.test(fb) && !/OPTIMUM/.test(fb)))) { skipped++; continue; }
      const q = nums[0], amt = nums.length > 1 ? nums[nums.length - 1] : NaN;
      const pn = (nc >= 0 && txt(r[nc])) || r.slice(cc + 1).map(txt).filter(t => /[A-Za-z]{3,}/.test(t) && !/IZMIR|OPTIMUM|MAVI/.test(fold(t)))[0] || '';
      if (!cur || cur.tot != null) open();
      cur.items.push({ code: code, pn: pn, q: q, wh: /WHE+L|KMPN/i.test(pn) || (amt === 0 && q > 0 && /^2500/.test(code)) });
      cur.sum += q;
    } else if (!code && nums.length >= 2 && !nameC && !idc) {      // sarı toplam satırı
      if (cur && cur.tot == null) cur.tot = nums[0]; else grand = nums[0];
    }
  }
  if (skipped) notes.push(skipped + ' satır başka şubeye ait olduğu için atlandı');
  else staff.forEach(s => {
    if (!s.items.length) return;
    const nm = nice(s.name);
    if (s.tot == null) notes.push(nm + ': toplam satırı bulunamadı');
    else if (Math.abs(s.sum - s.tot) > 0.5) notes.push(nm + ': satırlar toplamı ' + fmt(s.sum) + ', rapordaki toplam ' + fmt(s.tot) + ' → kontrol edin');
  });
  return { staff: staff.filter(s => s.items.length), notes: notes, grand: grand, skipped: skipped };
}
const needNames = P => { const o = {}; P.staff.forEach(s => s.items.forEach(it => { if (!it.wh && it.q > 0 && !it.code && !custom(it.code, it.pn) && !byCode(it.code, it.pn) && it.pn) o[fold(it.pn)] = it.pn; })); return Object.keys(o).map(k => o[k]); };

function build(P, pages, gmap, info) {
  const map = {}, order = [], other = {};
  let gsum = 0, drop = 0;
  P.staff.forEach(s => {
    gsum += s.sum;
    const m = match(s.name), nm = nice(m ? m.name : s.name), k = nrm(nm) || ('x' + order.length);
    const t = map[k] || (map[k] = { name: nm, g: {}, wheel: 0 });
    if (!t._in) { t._in = 1; order.push(k); }
    s.items.forEach(it => {
      if (it.wh) { t.wheel += it.q; return; }
      const g = custom(it.code, it.pn) || byCode(it.code, it.pn) || (it.code ? 'Diğer' : (gmap[fold(it.pn)] || rule(it.code, it.pn)));
      t.g[g] = (t.g[g] || 0) + it.q;
      if (GRX().indexOf(g) < 0) { drop += it.q; if (it.q > 0) other[it.pn] = 1; }
    });
  });
  const used = GRX().filter(g => order.some(k => map[k].g[g] > 0)), hasW = order.some(k => map[k].wheel > 0), r2 = x => Math.round(x * 100) / 100;
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
  const od = Object.keys(other); if (od.length) notes.push('Tabloya alınmayan ürünler: ' + fmt(drop) + ' adet (' + od.slice(0, 6).join(', ') + (od.length > 6 ? ' ve ' + (od.length - 6) + ' ürün daha' : '') + ')');
  const m = pages.map(p => p.text || '').join(' ').match(/Tarih\s+Aral\S{2,4}\s*:\s*([\d.]+\s*-\s*[\d.]+)/i);
  return { title: 'Ürün grupları' + (m ? ' · ' + m[1].replace(/\s+/g, '') : ''), columns: ['Personel'].concat(used, hasW ? ['Wheel'] : [], ['Toplam']), rows: rows, notes: notes.join('\n') };
}

const tbl = j => '<div style="overflow:auto"><table class="xl xl2"><tr>' + j.columns.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr>'
  + j.rows.map((r, k) => '<tr' + (k == j.rows.length - 1 ? ' class="tot"' : '') + '>' + j.columns.map((c, i) => '<td class="' + (i ? 'r' : 'l') + '">' + (typeof r[i] == 'number' ? fmt(r[i]) : esc(r[i] == null ? '' : r[i])) + '</td>').join('') + '</tr>').join('')
  + '</table></div>' + (j.notes ? '<p class="sub" style="margin:10px 2px;line-height:1.5;white-space:pre-line">ℹ ' + esc(j.notes) + '</p>' : '');

const em = e => (e && e.message) || String(e);
window.aiRun = async function () {
  const out = () => $('aio'), all = window.__aif || [];
  if (!out()) return;
  if (!all.length) { out().innerHTML = '<div class="err">Önce Excel dosyasını seç.</div>'; return; }
  let step = 'başlangıç';
  try {
    step = 'grup listesi'; try { CG = (await gs('getGroups')) || []; } catch (e) {}
    const parts = [], pages = [];
    for (let i = 0; i < all.length; i++) {
      if (out()) out().innerHTML = '<p class="sub">📗 Excel okunuyor: ' + esc(all[i].name || '') + ' (' + Math.round((all[i].size || 0) / 1024) + ' KB)…</p>';
      step = 'dosya okuma';
      const aoa = await readXls(all[i]);
      if (isDetay(aoa) && !isUrun(aoa)) {                      // yanlış düğme: bu bir ciro raporu
        if (out()) out().innerHTML = '<p class="sub">ℹ Bu dosya Ciro raporu, ciro ve ortalama olarak ekleniyor…</p>';
        await window.ciroXlsRun(all[i]); return;
      }
      step = 'tablo çözümleme';
      parts.push(parseRows(aoa, typeof B != 'undefined' ? B : ''));
      pages.push({ text: aoa.slice(0, 15).map(r => r.filter(x => x !== '').join(' ')).join(' ') });
    }
    const P = { staff: [], notes: [], grand: null };
    parts.forEach(p => { P.staff = P.staff.concat(p.staff); P.notes = P.notes.concat(p.notes); });
    if (parts.length == 1) P.grand = parts[0].grand;
    if (!P.staff.length) {
      if (parts.some(p => p.skipped)) throw new Error('Bu Excel başka şubeye ait görünüyor. Üstten doğru şubeyi (Optimum / Mavi Bahçe) seçip tekrar dene.');
      throw new Error('Excel\'de satış satırı bulunamadı. Kasa programından "Personel Ürün Satış Raporu" Excel çıktısını yükle.');
    }
    step = 'ürün gruplama';
    const names = needNames(P);
    if (names.length && out()) out().innerHTML = '<p class="sub">🤖 ' + names.length + ' ürün gruplanıyor…</p>';
    const c = await classify(names, '');
    step = 'tablo hazırlama';
    const j = build(P, pages, c.map, c.info);
    window.__air = j;
    if (out()) out().innerHTML = tbl(j) + '<div class="shg" style="margin-top:10px"><button class="a ed" onclick="aiXlsx(window.__air)">⬇ Excel indir</button><button class="a an" onclick="aiSave()">💾 Garsonlar da görsün (kaydet)</button></div>';
  } catch (e) { if (out()) out().innerHTML = '<div class="err" style="white-space:pre-line">' + esc(em(e)) + '\n(adım: ' + step + (e && e.name ? ', ' + e.name : '') + ')</div>'; }
};

// dosya türü: "Personel Satış Detay Raporu" (ciro) mu, "Personel Ürün Satış Raporu" (ürün) mu?
const isDetay = aoa => aoa.some(r => r.some(c => /Personel Numaras\S*\s*\/\s*Ad/i.test(String(c))));
const isUrun = aoa => aoa.some(r => r.some(c => fold(c) == 'URUN NO'));
// ---- Ciro & ortalama: "Personel Satış Detay Raporu" Excel'i ----
const CIRO_KAYNAK = 'odeme';   // 'odeme' = Ödemeler Toplamı (ödeme tipi tablosu), 'satis' = Toplam Satış
function parseDetay(aoa) {
  const txt = x => String(x == null ? '' : x).trim();
  const numv = v => { if (typeof v == 'number') return v; const t = txt(v); return /^-?[\d.,]+$/.test(t) ? (/,/.test(t) ? nu(t) : parseFloat(t)) : NaN; };
  const after = (r, i) => { for (let k = i + 1; k < r.length; k++) { const t = txt(r[k]); if (t === '' || t === ':') continue; return numv(r[k]); } return NaN; };
  let range = '', firma = '', cur = null; const staff = [];
  for (const r of aoa) {
    for (let i = 0; i < r.length; i++) {
      const c = txt(r[i]); if (!c) continue;
      let m;
      if (!range && (m = c.match(/Tarih\s+Aral\S{2,4}\s*:\s*([\d.]+\s*-\s*[\d.]+)/i))) range = m[1].replace(/\s+/g, '');
      else if ((m = c.match(/Firma Ad\S+\s*:\s*(.+)$/i))) firma = m[1].trim();
      else if ((m = c.match(/Personel Numaras\S*\s*\/\s*Ad\S*\s*:\s*(\S+)\s*\/\s*(.+)$/i))) { cur = { sicil: m[1], name: m[2].trim(), firma: firma, od: [], hesap: NaN, satis: NaN }; staff.push(cur); }
      else if (cur) {
        const f = fold(c);
        if (f == 'HESAP SAYISI') cur.hesap = after(r, i);
        else if (f == 'TOPLAM SATIS') cur.satis = after(r, i);
        else if (/^ODEMELER TOPLAMI/.test(f)) {               // etiketten sonra, başka yazıya rastlayana kadar sayılar: [adet, toplam]
          const nums = [];
          for (let k = i + 1; k < r.length; k++) { const t = txt(r[k]); if (t === '' || t === ':') continue; const n = numv(r[k]); if (isNaN(n)) break; nums.push(n); }
          cur.od.push(nums.length ? nums[nums.length - 1] : NaN);
        }
      }
    }
  }
  return { range: range, staff: staff };
}
const CX = document.createElement('input'); CX.type = 'file'; CX.accept = '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; CX.hidden = true; document.body.appendChild(CX);
window.ciroXlsPick = () => { CX.value = ''; CX.click(); };
CX.addEventListener('change', () => { if (CX.files[0]) window.ciroXlsRun(CX.files[0]); });
window.ciroXlsRun = async function (f) {
  let step = 'dosya okuma';
  try {
    try { $('st').textContent = '📗 Ciro Excel\'i okunuyor…'; } catch (e) {}
    const aoa = await readXls(f);
    if (!isDetay(aoa) && isUrun(aoa)) {                          // yanlış düğme: bu bir ürün raporu
      try { $('st').textContent = ''; } catch (e) {}
      window.aiUI(); window.__aif = [f];
      if ($('aio')) $('aio').innerHTML = '<p class="sub">ℹ Bu dosya Ürün satış raporu, ürün grupları olarak açılıyor…</p>';
      await window.aiRun(); return;
    }
    const P = parseDetay(aoa);
    step = 'tablo çözümleme';
    if (!P.staff.length) throw new Error('Excel\'de personel bulunamadı. Kasa programından "Personel Satış Detay Raporu" Excel çıktısını yükle.');
    const range = P.range || ('Yükleme ' + new Date().toLocaleDateString('tr-TR'));
    const br = x => /MAVI/.test(fold(x)) ? 'mavi' : (/OPTIMUM/.test(fold(x)) ? 'opt' : '');
    const ok = { opt: 0, mavi: 0 }, skip = [], notes = [];
    step = 'kaydetme';
    for (const s of P.staff) {
      const sube = br(s.firma), nm = nice(s.name);
      let ciro = CIRO_KAYNAK == 'odeme' ? s.od[0] : s.satis;
      if (!sube) { skip.push(nm + ' (şube tanınmadı: ' + s.firma + ')'); continue; }
      if (!(ciro > 0)) { skip.push(nm + ' (ödeme yok)'); continue; }
      if (!(s.hesap > 0)) { skip.push(nm + ' (hesap sayısı yok)'); continue; }
      await gs('saveReport', { name: s.name, ciro: ciro, hesap: s.hesap, range: range, firma: '', sube: sube }, PIN);
      ok[sube]++;
    }
    try { $('st').textContent = ''; } catch (e) {}
    const n = ok.opt + ok.mavi;
    if (window.ciroRefresh) window.ciroRefresh(range);
    msg(n + ' personelin ciro ve ortalaması eklendi ✅\nDönem: ' + range + (ok.opt ? '\nOptimum: ' + ok.opt + ' kişi' : '') + (ok.mavi ? '\nMavi Bahçe: ' + ok.mavi + ' kişi' : '')
      + '\nOrtalama = ' + (CIRO_KAYNAK == 'odeme' ? 'Ödemeler Toplamı' : 'Toplam Satış') + ' ÷ Hesap Sayısı'
      + (notes.length ? '\n\nℹ ' + notes.join('\nℹ ') : '') + (skip.length ? '\n\nEklenmeyenler:\n' + skip.join('\n') : ''));
  } catch (e) { try { $('st').textContent = ''; } catch (x) {} msg(em(e) + '\n(adım: ' + step + ')'); }
};

// dosya seçici: sadece Excel
const AIX = document.createElement('input'); AIX.type = 'file'; AIX.accept = '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; AIX.multiple = true; AIX.hidden = true; document.body.appendChild(AIX);
AIX.addEventListener('change', () => { window.__aif = [...AIX.files]; const c = $('aic'); if (c) c.textContent = '(' + AIX.files.length + ' dosya)'; });
window.aiPick = () => { AIX.value = ''; AIX.click(); };

// ---- Yönetici: grup ekle / düzenle ----
window.grpUI = async function () {
  try { CG = (await gs('getGroups')) || []; } catch (e) {}
  pop('🧩 Gruplar', '<p class="sub" style="margin:0 0 10px;line-height:1.5">Kendi grubunu ekle: ürün kodunun başlangıcını yaz (örn. 2005). Rapor okununca o koddaki ürünlerin miktarı bu gruba toplanır. Senin gruplarin hazır kuralların önüne geçer.<br><br>Hazır kurallar: 2500 Bira · 2512 Kokteyl · 2201 sıcak içecekler (Türk Kahvesi, Filtre Kahve, Kahve, Çay, Sıcak İçecek) · 2003 Başlangıç · 2013 Tatlı</p><div class="shg">'
    + CG.map((g, i) => '<div class="vrow"><div class="vn">' + esc(g.name) + '<span>' + esc([g.codes, g.words].filter(Boolean).join(' · ')) + '</span></div><button class="a ed" onclick="$(\'ov\').hidden=true;grpEdit(' + i + ')">✏️</button><button class="a end" onclick="$(\'ov\').hidden=true;grpDel(' + i + ')">🗑</button></div>').join('')
    + '<button class="a an" onclick="$(\'ov\').hidden=true;grpEdit(-1)">➕ Grup ekle</button></div>');
  $('mo').textContent = 'Kapat';
};
window.grpEdit = function (i) {
  const g = i >= 0 ? CG[i] : { name: '', codes: '', words: '' };
  ask(i >= 0 ? '✏️ Grubu düzenle' : '➕ Yeni grup', [{ label: 'Grup adı (örn. Tost)', val: g.name }, { label: 'Ürün kodu başlangıçları (virgülle, örn. 2005,2006)', val: g.codes || '' }, { label: 'Ürün adı kelimeleri (isteğe bağlı, virgülle)', val: g.words || '' }], async v => {
    const n = { name: v[0].trim(), codes: v[1].replace(/[^0-9,;\s]/g, '').trim(), words: v[2].trim() };
    if (!n.name || !(n.codes || n.words)) { msg('Grup adı ve en az bir kod ya da kelime gerekli'); return; }
    const L = CG.slice(); if (i >= 0) L[i] = n; else L.push(n);
    try { CG = await gs('saveGroups', L, PIN); msg('Grup kaydedildi ✅\nBundan sonra okunan raporlarda bu ürünler "' + n.name + '" sütununa toplanır.'); } catch (e) { msg(emsg(e)); }
  }, 'Kaydet');
};
window.grpDel = i => ask('“' + CG[i].name + '” grubu silinsin mi?', [], async () => {
  try { CG = await gs('saveGroups', CG.filter((x, k) => k != i), PIN); msg('Silindi'); } catch (e) { msg(emsg(e)); }
}, 'Sil');
window.aiUI = function () {
  window.__aif = [];
  pop('🍺 Ürün grupları raporu · AI17', '<p class="sub" style="margin:0 0 10px;line-height:1.5">Kasa programından aldığın <b>Personel Ürün Satış Raporu</b> Excel dosyasını (.xls / .xlsx) seç. Ürünler gruplara ayrılır, her personel için grup toplamı çıkar. Tabloyu Excel olarak indirebilir ya da garsonlar da görsün diye kaydedebilirsin.</p><div class="shg"><button class="a ed" onclick="aiPick()">📎 Excel dosyasını seç <span id="aic"></span></button><button class="a an" onclick="aiRun()">📊 Tabloyu oluştur</button><button class="a off" onclick="grpUI()">🧩 Grup ekle / düzenle (kod → grup)</button></div><div id="aio" style="margin-top:12px"></div>', true);
  $('mo').textContent = 'Kapat';
};

// ===== .xlsx okuyucu (zip + xml, harici kütüphane yok) =====
const xdec = t => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
async function unzipAll(u) {
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let e = u.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('ZIP bulunamadı');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const F = {};
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl)), st = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    F[name] = { method: method, raw: u.subarray(st, st + csz) };
    p += 46 + nl + el + cl;
  }
  return F;
}
async function zget(F, name) {
  const f = F[name]; if (!f) return null;
  const d = f.method === 0 ? f.raw : new Uint8Array(await new Response(new Blob([f.raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  return new TextDecoder().decode(d);
}
async function xlsxAoa(u) {
  const F = await unzipAll(u), wb = await zget(F, 'xl/workbook.xml'), rels = await zget(F, 'xl/_rels/workbook.xml.rels');
  let target = 'worksheets/sheet1.xml';
  const sh = wb && wb.match(/<sheet\b[^>]*>/), rid = sh && sh[0].match(/r:id="([^"]+)"/);
  if (rid && rels) { const m = rels.match(new RegExp('<Relationship\\b[^>]*\\bId="' + rid[1] + '"[^>]*>')), t = m && m[0].match(/Target="([^"]+)"/); if (t) target = t[1].replace(/^\/?(xl\/)?/, ''); }
  const ss = [], sst = await zget(F, 'xl/sharedStrings.xml');
  if (sst) (sst.match(/<si\b[\s\S]*?<\/si>/g) || []).forEach(si => ss.push(xdec((si.match(/<t\b[^>]*>[\s\S]*?<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''))));
  const xml = await zget(F, 'xl/' + target); if (!xml) throw new Error('sayfa bulunamadı');
  const cells = []; let maxC = 0;
  const colIdx = t => { let n = 0; for (const ch of t) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  xml.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (m, at, inner) => {
    const r = at.match(/\br="([A-Z]+)(\d+)"/); if (!r) return m;
    const tt = (at.match(/\bt="(\w+)"/) || [])[1], v = inner && inner.match(/<v>([\s\S]*?)<\/v>/);
    let val = '';
    if (tt == 'inlineStr') val = xdec(((inner || '').match(/<t\b[^>]*>[\s\S]*?<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''));
    else if (v) { if (tt == 's') val = ss[+v[1]]; else if (tt == 'str') val = xdec(v[1]); else if (tt == 'b') val = v[1] == '1'; else if (tt == 'e') val = ''; else { const n = parseFloat(v[1]); val = isNaN(n) ? '' : n; } }
    const ri = +r[2] - 1, ci = colIdx(r[1]); (cells[ri] || (cells[ri] = []))[ci] = val; if (ci > maxC) maxC = ci;
    return m;
  });
  const aoa = [];
  for (let i = 0; i < cells.length; i++) { const row = []; for (let c = 0; c <= maxC; c++) { const x = cells[i] && cells[i][c]; row.push(x == null ? '' : x); } aoa.push(row); }
  return aoa;
}

// ===== Vardiya Excel'i (haftalık şift listesi) =====
const POSTA_BASLA = 'ALEYNA PILGIR', POSTA_BITIS = 'SIYAR ERTAS';     // posta listesi: bu iki isim arası (Excel sırasıyla)
const pad2 = n => ('0' + n).slice(-2);
function parseShift(aoa) {
  const txt = x => String(x == null ? '' : x).trim();
  const iso = v => {
    if (typeof v == 'number' && v > 30000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10);
    const m = txt(v).match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/); return m ? m[3] + '-' + pad2(+m[2]) + '-' + pad2(+m[1]) : '';
  };
  let dates = null;
  for (let i = 0; i < Math.min(aoa.length, 8) && !dates; i++) { const d = [1, 3, 5, 7, 9, 11, 13].map(c => iso(aoa[i][c])); if (d.every(Boolean)) dates = d; }
  if (!dates) throw new Error('Tarihler bulunamadı (ilk satırlarda Pazartesi-Pazar tarihleri olmalı)');
  const hh = h => { const m = Math.round(h * 60); return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); };
  const list = [], seen = {}, dup = []; let barAt = -1;
  aoa.forEach(r => {
    const name = txt(r[0]); if (!name) return;
    if (fold(name) == 'BAR' && barAt < 0) barAt = list.length;
    const week = []; let any = false;
    for (let d = 0; d < 7; d++) {
      const a = r[1 + 2 * d], b = r[2 + 2 * d];
      if (typeof a == 'number' && typeof b == 'number' && a >= 0 && a <= 24 && b >= 0 && b <= 24) { any = true; week.push(a == 0 && b == 0 ? '' : hh(a) + '-' + hh(b)); } else week.push('');
    }
    if (!any) return;
    const k = fold(name);
    if (seen[k]) { dup.push(name); return; }
    seen[k] = 1; list.push({ name: name, week: week });
  });
  const s0 = list.findIndex(x => fold(x.name) == POSTA_BASLA), s1 = list.findIndex(x => fold(x.name) == POSTA_BITIS);
  let lo = -1, hi = -1;
  if (s0 >= 0 && s1 >= s0) { lo = s0; hi = s1; } else if (barAt > 0) { lo = 0; hi = barAt - 1; }
  list.forEach((x, i) => { if (lo >= 0 && i >= lo && i <= hi) { x.pg = true; x.po = i - lo + 1; } });
  return { dates: dates, list: list, dup: dup, posta: lo >= 0 ? list.slice(lo, hi + 1).map(x => x.name) : [] };
}
const SX = document.createElement('input'); SX.type = 'file'; SX.accept = '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; SX.hidden = true; document.body.appendChild(SX);
window.shiftXlsPick = () => { SX.value = ''; SX.click(); };
SX.addEventListener('change', () => { if (SX.files[0]) window.shiftXlsRun(SX.files[0]); });
window.shiftXlsRun = async function (f) {
  let step = 'dosya okuma';
  try {
    const nm = f.name || '', b = typeof B != 'undefined' ? B : 'opt';
    if (b == 'mavi' && /OPT[İI]MUM/i.test(nm)) throw new Error('Bu dosya Optimum şubesine ait görünüyor (dosya adı). Üstten Optimum\'u seçip tekrar dene.');
    if (b == 'opt' && /MAV[İI]/i.test(nm)) throw new Error('Bu dosya Mavi Bahçe şubesine ait görünüyor (dosya adı). Üstten Mavi Bahçe\'yi seçip tekrar dene.');
    const aoa = await readXls(f);
    step = 'tablo çözümleme';
    const P = parseShift(aoa);
    if (!P.list.length) throw new Error('Excel\'de vardiya satırı bulunamadı.');
    step = 'kaydetme';
    const r = await gs('uploadShiftXls', b, P.list.map(x => ({ name: x.name, week: x.week, pg: !!x.pg, po: x.po || 0 })), P.dates, PIN);
    const fd = d => d.slice(8) + '.' + d.slice(5, 7);
    try { load(); } catch (e) {} try { rptLoad(); } catch (e) {}
    msg(r.ok + ' personelin vardiyası eklendi ✅\nHafta: ' + fd(P.dates[0]) + ' – ' + fd(P.dates[6]) + '.' + P.dates[6].slice(0, 4)
      + '\nPersonel ekranında bugün ve yarın görünür.'
      + (P.posta.length ? '\n\nPosta listesi: ' + P.posta.length + ' kişi (' + nice(P.posta[0]) + ' → ' + nice(P.posta[P.posta.length - 1]) + ')' : '')
      + (r.missing.length ? '\n\nUygulamada kayıtlı olmayanlar (eklenmedi):\n' + r.missing.map(nice).join(', ') : '')
      + (r.absent.length ? '\n\nExcel\'de olmayanlar (izinli sayıldı):\n' + r.absent.map(nice).join(', ') : '')
      + (P.dup.length ? '\n\nExcel\'de iki kez geçenler (ilk satır kullanıldı):\n' + P.dup.map(nice).join(', ') : ''));
  } catch (e) { msg(em(e) + '\n(adım: ' + step + ')'); }
};

// ===== 📋 Postalar: günlük posta listesi + WhatsApp görseli =====
const istIso2 = off => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(Date.now() + off * 864e5));
const GUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
let PD = '', PST = { p: {}, x: {} };
const pgKey = () => 'mola_posta_' + B + '_' + PD;
const pgSave = () => { try { localStorage.setItem(pgKey(), JSON.stringify(PST)); } catch (e) {} };
const pgStaff = () => ((typeof D != 'undefined' && D && D.staff) || []).filter(s => s.pg && !s.off).sort((a, b) => (a.po || 0) - (b.po || 0));
const pgRows = () => pgStaff().map(s => ({ s: s, sh: window.shiftOf(s, PD) })).filter(x => x.sh);    // izinliler (vardiyası boş) görünmez
const pgLbl = d => { const x = new Date(d + 'T00:00:00Z'); return GUN[x.getUTCDay()] + ', ' + d.slice(8) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4); };
const pgT = sh => { const t = sh.split('-'); return [t[0], t[1] == '24:00' ? '00:00' : t[1]]; };
const pgMsg = t => { const e = $('pmsg'); if (e) e.textContent = t; };
window.postaUI = function (dt) {
  PD = dt || PD || istIso2(0);
  try { PST = JSON.parse(localStorage.getItem(pgKey()) || '{}'); } catch (e) { PST = {}; }
  PST.p = PST.p || {}; PST.x = PST.x || {};
  let h;
  if (!pgStaff().length) h = '<p class="sub" style="line-height:1.5">Önce <b>Vardiya</b> sekmesinden vardiya Excel\'ini yükle. Posta listesi Excel\'deki sıradan (Aleyna\'dan Şiyar\'a kadar) oluşturulur.</p>';
  else {
    const rows = pgRows();
    h = '<div class="svn"><button class="x2 w" onclick="postaGo(-1)">‹</button><input type="date" value="' + PD + '" onchange="postaUI(this.value)"><button class="x2 w" onclick="postaGo(1)">›</button></div>'
      + '<div class="svrow" style="margin:8px 0"><button class="a ed" onclick="postaDay(0)">Bugün</button><button class="a ed" onclick="postaDay(1)">Yarın</button></div>'
      + '<div class="svb" style="margin-top:4px">' + esc(pgLbl(PD)) + '</div>'
      + '<p class="sub" style="margin:4px 2px 10px;line-height:1.5">İsimleri seç, her kişiye <b>tek</b> posta yaz. İzinli olanlar listede görünmez.</p>'
      + (rows.length ? rows.map(x => { const t = pgT(x.sh); return '<div class="prow"><label class="pck"><input type="checkbox" ' + (PST.x[x.s.id] ? '' : 'checked') + ' onchange="postaTog(\'' + x.s.id + '\',this.checked)"><span>' + esc(nice(x.s.name)) + '<small>' + t[0] + ' – ' + t[1] + '</small></span></label><input class="pin" maxlength="12" placeholder="Posta" value="' + esc(PST.p[x.s.id] || '') + '" oninput="postaSet(\'' + x.s.id + '\',this.value)"></div>'; }).join('') : '<p class="sub">Bu gün için vardiyası olan kimse yok (ya da bu günün vardiyası yüklenmemiş).</p>')
      + '<div id="pmsg" class="svst" style="color:#fca5a5"></div>'
      + (rows.length ? '<button class="a an" style="width:100%;margin-top:6px" onclick="postaShare()">🖼 WhatsApp görseli oluştur</button>' : '');
  }
  pop('📋 Postalar · ' + BR[B], h, true); $('mo').textContent = 'Kapat';
};
window.postaGo = n => { const d = new Date(PD + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); window.postaUI(d.toISOString().slice(0, 10)); };
window.postaDay = o => window.postaUI(istIso2(o));
window.postaTog = (id, on) => { if (on) delete PST.x[id]; else PST.x[id] = 1; pgSave(); };
window.postaSet = (id, v) => { PST.p[id] = v.trim(); pgSave(); pgMsg(''); };
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function postaCanvas(rows, dt) {
  const W = 1080, RH = 96, TOP = 200, H = TOP + 80 + rows.length * RH + 100;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.textBaseline = 'middle';
  g.fillStyle = '#0b1220'; g.fillRect(0, 0, W, H);
  const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#2563eb'); gr.addColorStop(1, '#6d28d9');
  g.fillStyle = gr; g.fillRect(0, 0, W, 170);
  g.fillStyle = '#fff'; g.font = '800 64px sans-serif'; g.textAlign = 'left'; g.fillText('POSTALAR', 48, 70);
  g.fillStyle = '#e0e7ff'; g.font = '600 36px sans-serif'; g.fillText(pgLbl(dt) + ' · ' + BR[B], 48, 126);
  g.fillStyle = '#94a3b8'; g.font = '700 28px sans-serif';
  g.textAlign = 'left'; g.fillText('AD SOYAD', 56, TOP + 20);
  g.textAlign = 'center'; g.fillText('GELİŞ', 650, TOP + 20); g.fillText('ÇIKIŞ', 810, TOP + 20); g.fillText('POSTA', 965, TOP + 20);
  rows.forEach((r, i) => {
    const y = TOP + 60 + i * RH;
    g.fillStyle = i % 2 ? '#111a2e' : '#172033'; g.fillRect(24, y, W - 48, RH - 6);
    let fs = 42; g.font = '700 ' + fs + 'px sans-serif'; while (g.measureText(r.name).width > 480 && fs > 24) { fs -= 2; g.font = '700 ' + fs + 'px sans-serif'; }
    g.fillStyle = '#f8fafc'; g.textAlign = 'left'; g.fillText(r.name, 56, y + (RH - 6) / 2);
    g.font = '700 42px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#e2e8f0';
    g.fillText(r.a, 650, y + (RH - 6) / 2); g.fillText(r.b, 810, y + (RH - 6) / 2);
    if (r.p) {
      g.font = '800 40px sans-serif'; const w = Math.max(120, g.measureText(r.p).width + 44);
      g.fillStyle = '#f59e0b'; rrect(g, 965 - w / 2, y + 12, w, RH - 30, 20); g.fill();
      g.fillStyle = '#1c1917'; g.fillText(r.p, 965, y + (RH - 6) / 2 + 1);
    } else { g.fillStyle = '#64748b'; g.font = '700 40px sans-serif'; g.fillText('—', 965, y + (RH - 6) / 2); }
  });
  g.textAlign = 'left'; g.fillStyle = '#94a3b8'; g.font = '600 30px sans-serif';
  g.fillText('Toplam ' + rows.length + ' kişi', 56, H - 50);
  return c;
}
window.postaShare = async function () {
  const rows = pgRows().filter(x => !PST.x[x.s.id]);
  if (!rows.length) return pgMsg('Listede kimse seçili değil.');
  const bad = rows.filter(x => /[\s,;\/+&]/.test(String(PST.p[x.s.id] || '').trim()));
  if (bad.length) return pgMsg('⚠ Aynı kişiye tek posta yazılabilir: ' + bad.map(x => nice(x.s.name)).join(', '));
  const data = rows.map(x => { const t = pgT(x.sh); return { name: nice(x.s.name), a: t[0], b: t[1], p: String(PST.p[x.s.id] || '').trim() }; });
  const cv = postaCanvas(data, PD), blob = await new Promise(ok => cv.toBlob(ok, 'image/png'));
  const file = new File([blob], 'postalar_' + PD + '.png', { type: 'image/png' });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Postalar ' + PD }); return; } } catch (e) { if (e && e.name == 'AbortError') return; }
  const url = URL.createObjectURL(blob);
  pop('🖼 Posta görseli', '<img src="' + url + '" style="width:100%;border-radius:12px"><div class="shg" style="margin-top:10px"><a class="a an" href="' + url + '" download="postalar_' + PD + '.png">⬇ Görseli indir</a></div><p class="sub" style="margin:8px 2px;line-height:1.5">Görsele uzun basıp kaydedebilir ya da WhatsApp\'a paylaşabilirsin.</p>', true);
  $('mo').textContent = 'Kapat';
};
const stP = document.createElement('style');
stP.textContent = '.prow{display:flex;gap:8px;align-items:center;margin:0 0 8px}.pck{flex:1;display:flex;gap:10px;align-items:center;min-width:0;font-weight:700;font-size:15px}.pck input{width:22px;height:22px;flex:none}.pck span{display:block;line-height:1.2}.pck small{display:block;color:#94a3b8;font-weight:600;font-size:12px;margin-top:2px}.pin{width:96px;padding:11px 8px;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#fff;font-size:16px;text-align:center;text-transform:uppercase}';
document.head.appendChild(stP);

// Eski bir ai-rapor.js hâlâ yüklüyse (index.html'de script satırı kaldıysa) onun üzerine yazdığı fonksiyonları geri al
const MINE = { shiftXlsPick: window.shiftXlsPick, shiftXlsRun: window.shiftXlsRun, postaUI: window.postaUI, postaGo: window.postaGo, postaDay: window.postaDay, postaTog: window.postaTog, postaSet: window.postaSet, postaShare: window.postaShare, ciroXlsPick: window.ciroXlsPick, ciroXlsRun: window.ciroXlsRun, aiRun: window.aiRun, aiUI: window.aiUI, aiPick: window.aiPick, grpUI: window.grpUI, grpEdit: window.grpEdit, grpDel: window.grpDel };
setTimeout(() => Object.assign(window, MINE), 600);

const hs = document.querySelector('.hs'); if (hs) hs.textContent += ' · AI17';
});
})();
