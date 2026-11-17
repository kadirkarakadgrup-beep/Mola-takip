/* ============================================================
   gas-shim.js — Mola Takip Backend (Firebase Firestore)
   v2.0 — Kapsamlı iyileştirme (güvenlik + quiz + tipbox)
   
   YAPILAN DEĞİŞİKLİKLER:
   ✅ CFG güvenlik uyarıları + NTFY_PREFIX rastgele önerisi
   ✅ cancelActive_ bug fix (iç içe return düzeltildi)
   ✅ getKasaDay optimize (5 ardışık → tek Promise.all)
   ✅ getTipBase optimize (20x seri → paralel)
   ✅ saveTipBox transaction yorumu
   ✅ YENİ: getTipSummary (özet raporu)
   ✅ YENİ: Quiz backend (getQuizQuestions, saveQuizResult,
           getQuizLeaderboard, saveQuizBank, resetQuizScores)
   ============================================================ */
(function(){
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD_Bl_RC8xzscXA3-GP8X2tdBi6tFhCs8E',
  authDomain: 'mola-takip-7fc53.firebaseapp.com',
  projectId: 'mola-takip-7fc53',
  appId: '1:130287831940:web:c3a804d90a0225231b2bd1'
};
const CFG = {
  // ⚠️ GÜVENLİK: PIN'ler cfg/admins dokümanında hash'lenmiş olarak tutulur.
  // Buradaki değer sadece ilk kurulumda "fallback" olarak kullanılır.
  PIN: '1234',
  SRV_PIN: '1234',
  // ⚠️ GÜVENLİK: Her kurulumda FARKLI olmalı!
  // Yeni değer üretmek için tarayıcı konsolunda:
  //   'mola-' + Array.from(crypto.getRandomValues(new Uint8Array(8))).map(x=>x.toString(36)).join('')
  NTFY_PREFIX: 'mola-DEGISTIR-123xyz',
  SEQ: {
    opt: [{ k: 'mola', n: 'Çay Molası', d: 20 }, { k: 'yemek', n: 'Öğlen Yemeği', d: 30 }, { k: 'mola', n: 'Çay Molası', d: 20 }],
    mavi: [{ k: 'mola', n: 'Çay Molası', d: 20 }, { k: 'yemek', n: 'Öğlen Yemeği', d: 40 }, { k: 'mola', n: 'Çay Molası', d: 20 }]
  },
  MAIN: { from: 11, to: 20 },
  EXTRA: [
    { k: 'kahvalti', n: 'Kahvaltı Molası', d: 15, from: 9, to: 12 },
    { k: 'aksam', n: 'Akşam Yemeği', d: 15, from: 20, to: 23 },
    { k: 'ek', n: 'Ek mola', d: 10, from: 0, to: 24, unl: true }
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
const VER = {};
const auth_ = pin => { if (!VER[String(pin)]) throw new Error('Şifre yanlış'); };
const srvAuth_ = () => {};
const barAuth_ = () => {};
const barSube_ = x => { if (x !== 'opt' && x !== 'mavi') throw new Error('Şube geçersiz'); };
const own_ = pin => { auth_(pin); if (VER[String(pin)].role !== 'owner') throw new Error('Bu işlem sadece ana yönetici içindir'); };
const hash_ = async s => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hm|' + FIREBASE_CONFIG.projectId + '|' + s)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''); };
const admDoc_ = async () => { const d = await col('cfg').doc('admins').get(), a = d.exists ? d.data() : {}; a.list = a.list || []; return a; };
const roleOf_ = async pin => {
  pin = String(pin || ''); if (!pin) return null;
  const a = await admDoc_(), h = await hash_(pin);
  if (a.owner ? h === a.owner : pin === String(CFG.PIN)) return { role: 'owner', name: 'Ana yönetici' };
  const m = a.list.find(x => x.h === h); return m ? { role: 'admin', name: m.name, id: m.id } : null;
};
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
const hhmm_ = h => (h < 10 ? '0' : '') + h + ':00';
const winTxt_ = (f, t) => 'saat ' + hhmm_(f % 24) + ' ile ' + hhmm_(t % 24) + ' arasında';
function all_(s) {
  const r = [], md = md_(), seq = CFG.SEQ[s.branch] || CFG.SEQ.opt, seen = {}, W = CFG.MAIN;
  seq.forEach(q => {
    if (seen[q.k]) return; seen[q.k] = 1;
    const quota = seq.filter(x => x.k === q.k).reduce((a, x) => a + x.d, 0), rem = quota - usedK_(s, q.k);
    const win = '', inW = true;
    r.push({ k: q.k, n: q.n, d: rem > 0 ? Math.min(q.d, rem) : q.d, full: q.d, ok: rem > 0 && inW, win: win, why: rem <= 0 ? 'Bugünkü hakkın doldu' : (inW ? '' : win) });
  });
  CFG.EXTRA.forEach(e => {
    const rem = e.unl ? e.d : e.d - usedK_(s, e.k), inW = true, win = '';
    r.push({ k: e.k, n: e.n, d: rem > 0 ? rem : e.d, full: e.d, ok: rem > 0 && inW, win: win, why: rem <= 0 ? 'Bugünkü hakkın doldu' : (inW ? '' : win) });
  });
  return r;
}
function opts_(s) { return all_(s).filter(o => o.ok).map(o => ({ k: o.k, n: o.n, d: o.d, full: o.full })); }
function rnd_(s) { const T = mainT_(s); let b = 0, i = 0; for (const q of (CFG.SEQ[s.branch] || CFG.SEQ.opt)) { b += q.d; if (T < b) return i; i++; } return i; }
const isoD_ = d => d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
const weekIso_ = () => { const o = tp_(), base = Date.UTC(+o.year, +o.month - 1, +o.day) - wd_() * 86400000; return [0, 1, 2, 3, 4, 5, 6].map(i => isoD_(new Date(base + i * 86400000))); };
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
let RPT_C = { t: 0, v: null };
async function reports_() {
  let rs;
  if (RPT_C.v && Date.now() - RPT_C.t < 180000) rs = RPT_C.v.map(x => Object.assign({}, x));
  else { rs = (await col('reports').get()).docs.map(d => d.data()); RPT_C = { t: Date.now(), v: rs.map(x => Object.assign({}, x)) }; }
  const st = await allStaff_();
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
// ✅ FIX: iç içe return sorunu giderildi, paralel cancel
const cancelActive_ = s => {
  const a = s && s.active;
  if (!a || a.paused || Date.now() >= end_(a)) return Promise.resolve();
  return Promise.all([
    cancel_(topicOf_(s.id), a.nid2),
    cancel_(topicOf_('yonetici'), a.nid)
  ]);
};

async function rezOk_(pin, me) {
  if (pin && VER[String(pin)]) return true;
  const st = (await allStaff_()).find(x => x.id === String(me || '')), sec = String((st && st.sec) || '').toLocaleUpperCase('tr').replace(/İ/g, 'I');
  if (!/HOSTES/.test(sec)) throw new Error('Rezerve yetkin yok (sadece Hostes ve yönetici)');
  return true;
}
async function rezSched_(id) {
  const ref = col('rez').doc(id);
  const r = await db.runTransaction(async tx => {
    const sn = await tx.get(ref); if (!sn.exists) return null;
    const x = sn.data(), now = Date.now(), fire = x.ts - 3600000;
    if (x.sched === true || (x.sched === 'pending' && now - (x.schedT || 0) < 120000) || fire <= now + 20000 || fire > now + 2.9 * 86400000) return null;
    tx.update(ref, { sched: 'pending', schedT: now }); return x;
  });
  if (!r) return false;
  const br = r.branch === 'mavi' ? 'Mavi Bahçe' : 'Optimum', kind = r.type === 'dogum' ? '🎂 Doğum günü rezervesi' : r.type === 'kahvalti' ? '🥐 Kahvaltı rezervesi' : '🍽️ Yemekli rezerve';
  const text = kind + ' · ' + br + '\n🕐 ' + r.time + ' · ' + r.guest + (r.phone ? ' · ' + r.phone : '') + (r.note ? '\n📝 ' + r.note : '') + (r.taker ? '\nAlan: ' + r.taker : '') + '\n⏰ 1 saat sonra gelecek';
  const delay = String(Math.floor((r.ts - 3600000) / 1000));
  const m = await post_(topicOf_('yonetici'), '📅 Rezerve · 1 saat kaldı', text, delay);
  let m2 = { ok: false }; if (r.by) m2 = await post_(topicOf_(r.by), '📅 Rezerve · 1 saat kaldı', text, delay);
  try { await ref.update({ sched: !!(m.ok || m2.ok), nid: m.ok ? m.id : '', nid2: m2.ok ? m2.id : '' }); } catch (e) {}
  return !!(m.ok || m2.ok);
}
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
    const mgr = !!pin && !!VER[String(pin)], md = md_(), wd = wd_();
    const staff = (await allStaff_()).filter(s => s.branch === branch).sort((a, b) => a.name.localeCompare(b.name, 'tr')).map(s => {
      const c = mgr ? s : copy_(s);
      const sh = shift_(s, md, wd); c.on = sh.on; c.shTxt = sh.txt; c.shStart = sh.start; c.sh = effSh_(s);
      c.opts = s.off ? [] : opts_(s); c.all = s.off ? [] : all_(s);
      c.bitti = !s.off && !c.opts.length && (mainT_(s) >= total_(s.branch));
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
  async checkPin(pin) { const r = await roleOf_(pin); if (r) { VER[String(pin)] = r; try { localStorage.setItem('hm_apin', String(pin)); } catch (e) {} } return !!r; },
  async adminInfo(pin) { auth_(pin); return VER[String(pin)]; },
  async adminList(pin) { own_(pin); return (await admDoc_()).list.map(x => ({ id: x.id, name: x.name })); },
  async adminAdd(name, newPin, pin) {
    own_(pin); name = String(name || '').trim().slice(0, 30); newPin = String(newPin || '').trim();
    if (!name) throw new Error('İsim gerekli'); if (!/^\d{4,8}$/.test(newPin)) throw new Error('Şifre 4-8 haneli rakam olmalı');
    const a = await admDoc_(), h = await hash_(newPin);
    if (h === a.owner || (!a.owner && newPin === String(CFG.PIN)) || a.list.some(x => x.h === h)) throw new Error('Bu şifre kullanımda, başka bir şifre seç');
    a.list.push({ id: Math.random().toString(36).slice(2, 10), name: name, h: h });
    await col('cfg').doc('admins').set({ owner: a.owner || null, list: a.list }); return 'ok';
  },
  async adminDel(id, pin) { own_(pin); const a = await admDoc_(); a.list = a.list.filter(x => x.id !== id); await col('cfg').doc('admins').set({ owner: a.owner || null, list: a.list }); return 'ok'; },
  async ownerSetPin(newPin, pin) {
    own_(pin); newPin = String(newPin || '').trim(); if (!/^\d{4,8}$/.test(newPin)) throw new Error('Şifre 4-8 haneli rakam olmalı');
    const a = await admDoc_(), h = await hash_(newPin);
    if (a.list.some(x => x.h === h)) throw new Error('Bu şifre bir yöneticide kullanımda');
    await col('cfg').doc('admins').set({ owner: h, list: a.list }); delete VER[String(pin)]; VER[newPin] = { role: 'owner', name: 'Ana yönetici' }; return 'ok';
  },
  async changePin(oldPin, newPin) {
    oldPin = String(oldPin || '').trim(); newPin = String(newPin || '').trim();
    const role = await roleOf_(oldPin); if (!role) throw new Error('Mevcut şifre yanlış');
    if (!/^\d{4,8}$/.test(newPin)) throw new Error('Yeni şifre 4-8 haneli rakam olmalı');
    if (newPin === oldPin) throw new Error('Yeni şifre eskisiyle aynı olamaz');
    const a = await admDoc_(), h = await hash_(newPin);
    if (role.role === 'owner') {
      if (a.list.some(x => x.h === h)) throw new Error('Bu şifre bir yöneticide kullanımda, başka seç');
      await col('cfg').doc('admins').set({ owner: h, list: a.list });
    } else {
      if (h === a.owner || (!a.owner && newPin === String(CFG.PIN)) || a.list.some(x => x.h === h && x.id !== role.id)) throw new Error('Bu şifre kullanımda, başka bir şifre seç');
      const m = a.list.find(x => x.id === role.id); if (!m) throw new Error('Yönetici kaydı bulunamadı');
      m.h = h; await col('cfg').doc('admins').set({ owner: a.owner || null, list: a.list });
    }
    delete VER[oldPin]; VER[newPin] = role; return 'ok';
  },
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
  async autoEndBreak(id) {
    let old = null, rec = null;
    await upd_(id, s => {
      const a = s.active;
      if (!a || a.paused || Date.now() < end_(a) + 300000) return;
      old = copy_(s);
      const e = end_(a), m = Math.max(1, Number(a.dur) || 1);
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
  async removeDone(id, t, pin) {
    auth_(pin);
    await upd_(id, s => { s.done = (s.done || []).filter(x => !(x && typeof x === 'object' && x.t === t)); });
    const ref = col('hist').doc(id), d = await ref.get();
    if (d.exists) await ref.set({ rows: (d.data().rows || []).filter(r => r.a !== t) });
    return 'ok';
  },
  async setDoneMin(id, t, m, pin) {
    auth_(pin);
    m = Math.round(Number(m));
    if (!(m >= 1 && m <= 300)) throw new Error('Süre 1-300 dk arasında olmalı');
    await upd_(id, s => { (s.done || []).forEach(x => { if (x && typeof x === 'object' && x.t === t) { x.m = m; x.e = x.t + m * 60000; } }); });
    const ref = col('hist').doc(id), d = await ref.get();
    if (d.exists) await ref.set({ rows: (d.data().rows || []).map(r => r.a === t ? Object.assign({}, r, { m: m, e: t + m * 60000 }) : r) });
    return 'ok';
  },
  async dropActive(id, pin) {
    auth_(pin);
    let old = null;
    await upd_(id, s => { if (s.active) { old = copy_(s); s.active = null; } });
    if (old) await cancelActive_(old);
    return 'ok';
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
  async selfRegister(branch, name, phone, email, dept) {
    if (branch !== 'opt' && branch !== 'mavi') throw new Error('Şube geçersiz');
    name = nice_(name);
    if (name.length < 3) throw new Error('Ad soyad yazın');
    if ((await allStaff_()).some(s => s.branch === branch && norm_(s.name) === norm_(name))) throw new Error('Bu isim bu şubede zaten kayıtlı');
    const id = Math.random().toString(36).slice(2, 10);
    const rec = { id, branch, name, email: String(email || '').trim(), phone: phone_(phone), day: today_(), done: [], active: null, off: false };
    const sec = String(dept || '').toLocaleUpperCase('tr').trim();
    if (['SERVİS', 'BAR', 'RUNNER', 'HOSTES', 'TEMİZLİK'].indexOf(sec) > -1) {
      const all = (await allStaff_()).filter(x => x.branch === branch), same = all.filter(x => x.sec === sec && x.ord);
      rec.sec = sec; rec.secLock = true;
      rec.ord = same.length ? Math.max.apply(null, same.map(x => Number(x.ord) || 0)) + 0.001 : Math.max.apply(null, [0].concat(all.map(x => Number(x.ord) || 0))) + 1;
    }
    await col('staff').doc(id).set(clean_(rec));
    return name;
  },
  async tipOk_(branch, pin, me) {
    if (pin && VER[String(pin)]) return true;
    const d = await col('cfg').doc('tipperm_' + branch).get(), ids = d.exists ? (d.data().ids || []) : [];
    if (!me || ids.indexOf(String(me)) < 0) throw new Error('Tip Box yetkin yok');
    return true;
  },
  async getTipPerm(branch) { const d = await col('cfg').doc('tipperm_' + branch).get(); return d.exists ? (d.data().ids || []) : []; },
  async setTipPerm(branch, ids, pin) { auth_(pin); await col('cfg').doc('tipperm_' + branch).set({ ids: (ids || []).slice(0, 60).map(x => String(x).slice(0, 40)), t: Date.now() }); },
  async getTipBox(branch, wk, pin, me) {
    await this.tipOk_(branch, pin, me);
    const d = await col('cfg').doc('tipbox_' + branch + '_' + wk).get();
    return d.exists ? d.data() : null;
  },
  async saveTipBox(branch, wk, data, pin, me) {
    await this.tipOk_(branch, pin, me);
    const ref = col('cfg').doc('tipbox_' + branch + '_' + wk);
    // ✅ Kapanmış dönemi kontrol et
    { const cur = await ref.get(); if (cur.exists && cur.data().closed) throw new Error('Bu dönem kapandı (devredildi), değiştirilemez.'); }
    const clip = (o, n) => String(o == null ? '' : o).slice(0, n), num = v => { v = Number(v); return isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : 0; };
    const vals = {}; Object.keys((data && data.vals) || {}).slice(0, 200).forEach(k => { const v = data.vals[k] || {}; vals[clip(k, 40)] = { h: num(v.h), d: v.d == null || v.d === '' ? null : Math.min(31, num(v.d)) }; });
    const ex = ((data && data.ex) || []).slice(0, 60).map(e => ({ id: clip(e.id, 40), name: clip(e.name, 60), grp: e.grp === 'pay' ? 'pay' : 'rec' }));
    const res = {}; Object.keys((data && data.res) || {}).slice(0, 200).forEach(k => { const r = data.res[k] || {}; res[clip(k, 40)] = { r: r.r === 'pay' ? 'pay' : 'rec', a: num(r.a), d: num(r.d), p: r.p ? 1 : 0 }; });
    const hide = {}; Object.keys((data && data.hide) || {}).slice(0, 200).forEach(k => { if (data.hide[k]) hide[clip(k, 40)] = 1; });
    const paid = {}; Object.keys((data && data.paid) || {}).slice(0, 200).forEach(k => { if (data.paid[k]) paid[clip(k, 40)] = 1; });
    const names = {}; Object.keys((data && data.names) || {}).slice(0, 200).forEach(k => { const n = data.names[k] || {}; names[clip(k, 40)] = { n: clip(n.n, 60), g: clip(n.g, 40), c: clip(n.c, 12), o: num(n.o) }; });
    await ref.set({ vals: vals, ex: ex, res: res, paid: paid, hide: hide, names: names, t: Date.now() }, { mergeFields: ['vals', 'ex', 'res', 'paid', 'hide', 'names', 't'] });
    const bs = (data && data.base) || {}, bk = Object.keys(bs).slice(0, 200);
    if (bk.length) { await this.getTipBase(branch, pin, me); const h = {}; bk.forEach(k => { h[clip(k, 40)] = num(bs[k]); }); await col('cfg').doc('tipbase_' + branch).set({ h: h, t: Date.now() }, { merge: true }); }
  },
  // ✅ OPTIMIZE: Tüm dönemleri paralel çek
  async getTipBase(branch, pin, me) {
    await this.tipOk_(branch, pin, me);
    const ref = col('cfg').doc('tipbase_' + branch), d = await ref.get();
    if (d.exists) return d.data().h || {};
    const keys = [], per = await col('cfg').doc('tipper_' + branch).get();
    ((per.exists ? per.data().list : []) || []).forEach(x => keys.push(x.k));
    const m = new Date(); m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7));
    for (let i = 0; i < 12; i++) keys.push(new Date(m.getTime() - i * 7 * 864e5).toISOString().slice(0, 10));
    const uniq = [...new Set(keys)].sort().reverse().slice(0, 20);
    const snaps = await Promise.all(uniq.map(k => col('cfg').doc('tipbox_' + branch + '_' + k).get()));
    const h = {};
    snaps.forEach(snap => {
      if (!snap.exists) return;
      const v = snap.data().vals || {};
      Object.keys(v).forEach(id => {
        const n = Number((v[id] || {}).h) || 0;
        if (n > 0 && h[id] === undefined) h[id] = n;
      });
    });
    await ref.set({ h: h, t: Date.now() });
    return h;
  },
  async getTipPeriod(branch) {
    barSube_(branch);
    const d = await col('cfg').doc('tipper_' + branch).get();
    return d.exists ? { cur: d.data().cur || '', list: d.data().list || [] } : { cur: '', list: [] };
  },
  async tipNewPeriod(branch, from, start, end, pin, me) {
    await this.tipOk_(branch, pin, me); barSube_(branch);
    const okd = x => /^\d{4}-\d{2}-\d{2}$/.test(String(x || ''));
    if (!okd(from) || !okd(start) || !okd(end) || end < start) throw new Error('Tarihler geçersiz');
    if (start <= from) throw new Error('Yeni dönem, mevcut dönemin başlangıcından sonra başlamalı');
    const prevRef = col('cfg').doc('tipbox_' + branch + '_' + from), newRef = col('cfg').doc('tipbox_' + branch + '_' + start), perRef = col('cfg').doc('tipper_' + branch);
    if ((await newRef.get()).exists) throw new Error('Bu başlangıç tarihli bir dönem zaten var');
    const prev = await prevRef.get(), pd = prev.exists ? prev.data() : {};
    const base = await this.getTipBase(branch, pin, me), vals = {};
    const ids = new Set(Object.keys(pd.vals || {}).concat(Object.keys(base)));
    ids.forEach(k => { const ph = Number(((pd.vals || {})[k] || {}).h) || 0, hh = ph > 0 ? ph : (Number(base[k]) || 0); vals[k] = { h: hh, d: null }; });
    const dayBefore = new Date(Date.parse(start + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
    await prevRef.set({ closed: true, s: pd.s || from, e: dayBefore, t: Date.now() }, { merge: true });
    await newRef.set({ vals: vals, ex: pd.ex || [], res: {}, paid: {}, hide: pd.hide || {}, names: {}, s: start, e: end, from: from, t: Date.now() });
    const per = await perRef.get(); let list = per.exists ? (per.data().list || []) : [];
    const pe = list.find(x => x.k === from); if (pe) { pe.e = dayBefore; } else list.push({ k: from, s: pd.s || from, e: dayBefore });
    list.push({ k: start, s: start, e: end });
    list = list.sort((a, b) => a.k < b.k ? -1 : 1).slice(-60);
    await perRef.set({ cur: start, list: list, t: Date.now() });
    return { cur: start, list: list };
  },
  // ✅ YENİ: Tip Box özet raporu
  async getTipSummary(branch, wk, pin, me) {
    await this.tipOk_(branch, pin, me);
    const box = await col('cfg').doc('tipbox_' + branch + '_' + wk).get();
    if (!box.exists) return { total: 0, paid: 0, unpaid: 0, people: 0, rows: [] };
    const d = box.data();
    const vals = d.vals || {}, paid = d.paid || {}, names = d.names || {}, meta = d.meta || {};
    let total = 0, paidSum = 0, unpaid = 0;
    const rows = Object.keys(vals).map(id => {
      const h = Number((vals[id] || {}).h) || 0;
      total += h;
      if (paid[id]) paidSum += h; else unpaid += h;
      return { id, name: (names[id] && names[id].n) || id, hak: h, paid: !!paid[id], meta: meta[id] || {} };
    }).sort((a, b) => b.hak - a.hak);
    return { total: Math.round(total * 100) / 100, paid: Math.round(paidSum * 100) / 100, unpaid: Math.round(unpaid * 100) / 100, people: rows.length, rows };
  },
  async getTipBoxMine(branch, wk, id, needAnn) {
    const d = await col('cfg').doc('tipbox_' + branch + '_' + wk).get();
    const r = d.exists && d.data().res ? d.data().res[String(id)] : null;
    if (!r) return null;
    if (!needAnn) return Object.assign({}, r, { ann: false });
    const a = await col('cfg').doc('tipann_' + branch).get();
    return Object.assign({}, r, { ann: a.exists ? a.data().on !== false : true });
  },
  async getTipAnn(branch) { const a = await col('cfg').doc('tipann_' + branch).get(); return a.exists ? a.data().on !== false : true; },
  async setTipAnn(branch, on, pin, me) { await this.tipOk_(branch, pin, me); await col('cfg').doc('tipann_' + branch).set({ on: !!on, t: Date.now() }); },
  async getTipExcl(branch, pin, me) { await this.tipOk_(branch, pin, me); const d = await col('cfg').doc('tipexcl_' + branch).get(); return d.exists ? (d.data().ids || []) : null; },
  async getTipMeta(branch, pin, me) { await this.tipOk_(branch, pin, me); const d = await col('cfg').doc('tipmeta_' + branch).get(); return d.exists ? (d.data().meta || {}) : {}; },
  async setTipMeta(branch, meta, pin, me) {
    await this.tipOk_(branch, pin, me);
    const clip = (o, n) => String(o == null ? '' : o).slice(0, n), COL = ['turuncu', 'yesil', 'gri', 'mor', 'mavi', 'sari', 'kirmizi', 'pembe'], out = {};
    Object.keys(meta || {}).slice(0, 300).forEach(k => {
      const m = meta[k] || {}, o = {};
      if (COL.indexOf(m.c) > -1) o.c = m.c;
      if (m.g === 'rec' || m.g === 'pay') o.g = m.g;
      if (m.o != null && isFinite(Number(m.o))) o.o = Math.max(0, Math.min(9999, Math.round(Number(m.o))));
      if (m.n) o.n = clip(m.n, 60);
      out[clip(k, 40)] = o;
    });
    await col('cfg').doc('tipmeta_' + branch).set({ meta: out, t: Date.now() });
  },
  async setTipExcl(branch, ids, pin, me) { await this.tipOk_(branch, pin, me); await col('cfg').doc('tipexcl_' + branch).set({ ids: (ids || []).slice(0, 100).map(x => String(x).slice(0, 40)), t: Date.now() }); },
  async addRez(branch, r, me, pin) {
    await rezOk_(pin, me);
    if (branch !== 'opt' && branch !== 'mavi') throw new Error('Şube geçersiz');
    r = r || {}; const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clip(r.date, 10)), tm = /^(\d{2}):(\d{2})$/.exec(clip(r.time, 5));
    if (!dm || !tm) throw new Error('Tarih ve saat gerekli');
    const guest = clip(r.guest, 60); if (!guest) throw new Error('Misafir adı gerekli');
    const ts = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +tm[1] - 3, +tm[2]);
    if (!isFinite(ts)) throw new Error('Tarih geçersiz');
    const id = Math.random().toString(36).slice(2, 10);
    await col('rez').doc(id).set(clean_({ id: id, branch: branch, type: r.type === 'dogum' ? 'dogum' : r.type === 'kahvalti' ? 'kahvalti' : 'yemekli', date: clip(r.date, 10), time: clip(r.time, 5), ts: ts, guest: guest, phone: clip(r.phone, 20), taker: clip(r.taker, 60), note: clip(r.note, 300), by: me ? String(me).slice(0, 40) : '', t: Date.now(), sched: false }));
    return { ok: true, id: id, sched: await rezSched_(id), ts: ts };
  },
  async listRez(branch, pin, me) { await rezOk_(pin, me); const from = Date.now() - 3 * 86400000; return (await col('rez').where('ts', '>=', from).get()).docs.map(d => d.data()).filter(r => r.branch === branch).sort((a, b) => a.ts - b.ts); },
  async delRez(id, pin, me) {
    const ref = col('rez').doc(String(id)), d = await ref.get(); if (!d.exists) return;
    const r = d.data();
    if (!(pin && VER[String(pin)]) && !(me && r.by && r.by === String(me))) throw new Error('Silme yetkin yok');
    if (r.nid) cancel_(topicOf_('yonetici'), r.nid);
    if (r.nid2 && r.by) cancel_(topicOf_(r.by), r.nid2);
    await ref.delete();
  },
  async rezSync(branch) {
    const now = Date.now(), L = (await col('rez').where('ts', '>', now + 3600000).where('ts', '<=', now + 3600000 + 2.9 * 86400000).get()).docs.map(d => d.data()).filter(r => r.branch === branch && r.sched !== true);
    let n = 0; for (const r of L) { if (await rezSched_(r.id)) n++; } return n;
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
    const numNm = n => /^\d{1,3}([.,]\d+)?$/.test(String(n || '').trim());
    for (let i = staff.length - 1; i >= 0; i--) if (numNm(staff[i].name)) {
      const bad = staff[i]; staff.splice(i, 1);
      try { await col('staff').doc(bad.id).delete(); await col('hist').doc(bad.id).delete(); } catch (e) {}
    }
    entries = entries.filter(e => !numNm(e && e.name));
    staff.forEach(x => { known[norm_(x.name)] = 1; });
    entries.forEach(e => { const k = norm_(e && e.name); if (k && !map[k] && Array.isArray(e.week) && e.week.length === 7) map[k] = e; });
    const lev_ = (a, b) => { const d = []; for (let i = 0; i <= a.length; i++) d[i] = [i]; for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
    const used = {}, alias = {}, fuzzy = [], fzk = {};
    staff.forEach(x => { if (map[norm_(x.name)]) used[x.id] = 1; });
    Object.keys(map).filter(k => !known[k]).forEach(k => {
      const cand = staff.filter(x => !used[x.id]).map(x => { const a = norm_(x.name); let d = lev_(k, a); if (a.length >= 6 && k.length >= 6 && (k.indexOf(a) === 0 || a.indexOf(k) === 0)) d = 0; return { x: x, d: d }; }).sort((p, q) => p.d - q.d);
      if (cand.length && cand[0].d <= Math.max(2, Math.floor(k.length * 0.25)) && (cand.length < 2 || cand[1].d > cand[0].d)) { alias[cand[0].x.id] = map[k]; used[cand[0].x.id] = 1; fzk[k] = 1; fuzzy.push([map[k].name, cand[0].x.name]); }
    });
    const c0 = new Date(dates[0] + 'T00:00:00Z'); c0.setUTCDate(c0.getUTCDate() - 45);
    const cut = isoD_(c0), absent = [], missing = Object.keys(map).filter(k => !known[k] && !fzk[k]).map(k => map[k].name);
    const added = [];
    if (branch === 'mavi') {
      for (const k of Object.keys(map).filter(k => !known[k] && !fzk[k])) {
        const nm = String(map[k].name || '').trim(); if (!nm) continue;
        const id = Math.random().toString(36).slice(2, 10);
        await col('staff').doc(id).set(clean_({ id, branch, name: nm, email: '', phone: '', day: today_(), done: [], active: null, off: false }));
        staff.push({ id: id, name: nm, branch: branch }); added.push(nm);
      }
      for (let i = missing.length - 1; i >= 0; i--) if (added.indexOf(missing[i]) >= 0) missing.splice(i, 1);
    }
    let ok = 0; const pm = dates.map(() => ({})), pconf = []; let hasPst = false;
    for (const x of staff) {
      const e = map[norm_(x.name)] || alias[x.id], week = e ? e.week.map(c => parseCell_(c)) : ['', '', '', '', '', '', ''];
      if (branch === 'mavi' && e && Array.isArray(e.pst) && e.pst.length === 7) {
        hasPst = true;
        e.pst.forEach((p, i) => { p = String(p || '').trim().slice(0, 14); if (!p || !week[i]) return; if (pm[i][p] && pm[i][p] !== x.id) { const o = staff.find(y => y.id === pm[i][p]); pconf.push(dates[i].slice(8) + '.' + dates[i].slice(5, 7) + ' ' + p + ': ' + (o ? o.name : '?') + ' / ' + x.name); return; } pm[i][p] = x.id; });
      }
      await upd_(x.id, s => {
        const shd = s.shd || {};
        dates.forEach((d, i) => { shd[d] = week[i]; });
        Object.keys(shd).forEach(k => { if (k < cut) delete shd[k]; });
        const byWd = ['', '', '', '', '', '', ''];
        dates.forEach((d, i) => { byWd[(new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7] = week[i]; });
        s.shd = shd; s.sh = byWd; s.shc = ['', '', '', '', '', '', ''];
        if (e && e.pg) { s.pg = true; s.po = Number(e.po) || 0; } else { delete s.pg; delete s.po; }
        if (e) { s.sec = String(e.sec || '').slice(0, 30); s.ord = Number(e.ord) || 0; } else if (!s.secLock) { delete s.sec; delete s.ord; }
      });
      if (e) ok++; else absent.push(x.name);
    }
    let postaN = 0, postaList = [];
    if (branch === 'mavi' && hasPst) {
      const nat = (a, b) => a.localeCompare(b, 'tr', { numeric: true });
      const all = {}; pm.forEach(m => Object.keys(m).forEach(k => { all[k] = 1; }));
      postaList = Object.keys(all).sort(nat);
      for (let i = 0; i < 7; i++) { await col('cfg').doc('posta_mavi_' + dates[i]).set({ m: pm[i], t: Date.now() }); postaN += Object.keys(pm[i]).length; }
      const pl = await col('cfg').doc('postalist_mavi').get(), old = pl.exists ? (pl.data().list || []) : [];
      await col('cfg').doc('postalist_mavi').set({ list: postaList.concat(old.filter(k => !all[k])).slice(0, 60), t: Date.now() });
    }
    return { ok: ok, missing: missing, absent: absent, fuzzy: fuzzy, added: added, postaN: postaN, postaList: postaList, postaConf: pconf };
  },
  async clearShift(branch, pin) {
    auth_(pin);
    for (const x of (await allStaff_()).filter(s => s.branch === branch)) await upd_(x.id, s => { delete s.sh; delete s.shc; delete s.shd; delete s.pg; delete s.po; if (!s.secLock) { delete s.sec; delete s.ord; } });
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
    RPT_C.t = 0; await col('reports').doc(key).set({ key, sube, name, firma: String(d.firma || '').trim(), range, ciro, hesap, ort, t: Date.now() });
    return { ort: ort };
  },
  async listReports(pin) {
    auth_(pin);
    return (await reports_()).sort((a, b) => b.ort - a.ort);
  },
  async listReportsPub() {
    return (await reports_()).map(r => ({ name: r.name, sube: r.sube, range: r.range, ciro: r.ciro, hesap: r.hesap, ort: r.ort, t: r.t })).sort((a, b) => b.ort - a.ort);
  },
  async delReport(key, pin) { auth_(pin); RPT_C.t = 0; await col('reports').doc(key).delete(); },
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
  async delBeer(key, pin) { auth_(pin); await col('beer').doc(key).delete(); },  // ===== Z POS (Kredi / Nakit + yan sütunlar) =====
  async getZPos(branch, ym, pin) {
    auth_(pin);
    barSube_(branch);
    ym = String(ym || '').replace(/[^\d]/g, '').slice(0, 6);
    if (ym.length !== 6) throw new Error('Ay formatı YYYYMM olmalı');
    const d = await col('cfg').doc('zpos_' + branch + '_' + ym).get();
    return d.exists ? (d.data().days || {}) : {};
  },
  async setZPos(branch, ym, day, data, pin) {
    auth_(pin);
    barSube_(branch);
    ym = String(ym || '').replace(/[^\d]/g, '').slice(0, 6);
    day = String(+day || 0);
    if (ym.length !== 6) throw new Error('Ay formatı YYYYMM olmalı');
    if (!(+day >= 1 && +day <= 31)) throw new Error('Gün 1-31 olmalı');
    const ref = col('cfg').doc('zpos_' + branch + '_' + ym);
    const rnd = n => Math.round((Number(n) || 0) * 100) / 100;
    let fin = null;
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const days = (snap.exists ? snap.data().days : {}) || {};
      const clean = { main: {}, extra: {}, yemek: {}, garson: [] };
      const main = (data && data.main) || {};
      Object.keys(main).forEach(p => {
        const x = main[p] || {};
        const o = { pk: rnd(x.pk), n: rnd(x.n), k: rnd(x.k), qr: rnd(x.qr), kf: rnd(x.kf), nf: rnd(x.nf) };
        if (o.pk || o.n || o.k || o.qr || o.kf || o.nf) clean.main[String(p).slice(0, 24)] = o;
      });
      const extra = (data && data.extra) || {};
      Object.keys(extra).forEach(lab => {
        const v = rnd(extra[lab]);
        if (v) clean.extra[String(lab).slice(0, 32)] = v;
      });
      const yemek = (data && data.yemek) || {};
      Object.keys(yemek).forEach(k => {
        const x = yemek[k] || {};
        const o = { a: rnd(x.a), b: rnd(x.b), c: rnd(x.c) };
        if (o.a || o.b || o.c) clean.yemek[String(k).slice(0, 24)] = o;
      });
      const tk = (data && data.topkasa) || {};
      if (rnd(tk.blank) || rnd(tk.fark)) clean.topkasa = { blank: rnd(tk.blank), fark: rnd(tk.fark) };
      const garson = (data && data.garson) || [];
      if (Array.isArray(garson)) {
        const nm = x => String(x || '').toLocaleUpperCase('tr').replace(/İ/g, 'I').replace(/\s+/g, ' ').trim();
        const FL = ['ticket', 'sodexho', 'multinet', 'metropol', 'setcard', 'token', 'kk', 'nakit', 'hediye', 'ciro', 'check'];
        const force = !!(data && data.force), syncT = Number(data && data.syncT) || 0;
        const sG = Array.isArray((days[day] || {}).garson) ? days[day].garson : [], sMap = {};
        sG.forEach(x => { sMap[nm(x.name)] = x; });
        const inc = garson.slice(0, 20).map(g => ({
          name: String(g.name || '').slice(0, 40),
          ticket: rnd(g.ticket), sodexho: rnd(g.sodexho), multinet: rnd(g.multinet),
          metropol: rnd(g.metropol), setcard: rnd(g.setcard), token: rnd(g.token),
          kk: rnd(g.kk), nakit: rnd(g.nakit), hediye: rnd(g.hediye),
          ciro: rnd(g.ciro), check: Math.round(Number(g.check) || 0), _bt: Number(g.bt) || 0
        })).filter(g => g.name || g.ticket || g.sodexho || g.multinet || g.metropol || g.setcard || g.token || g.kk || g.nakit || g.hediye || g.ciro || g.check);
        const out = inc.map(g => {
          const bt = g._bt; delete g._bt;
          const sv = sMap[nm(g.name)];
          if (force || !sv) { g.t = Date.now(); return g; }
          if (sv.t && Number(sv.t) !== bt) return sv;
          g.t = FL.every(f => Number(sv[f] || 0) === Number(g[f] || 0)) ? (sv.t || 0) : Date.now();
          return g;
        });
        if (!force) sG.forEach(sv => {
          if (!inc.some(g => nm(g.name) === nm(sv.name)) && Number(sv.t || 0) > syncT) out.push(sv);
        });
        clean.garson = out.slice(0, 20); fin = clean.garson;
      }
      if (days[day] && days[day].closed) clean.closed = true;
      if (days[day] && days[day].closedAt) clean.closedAt = days[day].closedAt;
      if (Object.keys(clean.main).length || Object.keys(clean.extra).length || Object.keys(clean.yemek).length || clean.topkasa || clean.garson.length || clean.closed)
        days[day] = clean;
      else delete days[day];
      tx.set(ref, { days, t: Date.now(), branch, ym });
    });
    return { ok: true, garson: fin || [] };
  },
  // ===== 86 listesi (biten ürünler): herkes ekler, herkes "geldi" diyebilir =====
  async get86(branch) {
    barSube_(branch);
    const d = await col('cfg').doc('e86_' + branch).get();
    return d.exists ? (d.data().list || []) : [];
  },
  async add86(branch, name, by) {
    barSube_(branch);
    name = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!name) throw new Error('Ürün adı yaz');
    by = String(by || '').trim().slice(0, 40);
    const ref = col('cfg').doc('e86_' + branch);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const list = (snap.exists ? snap.data().list : []) || [];
      if (!list.some(x => norm_(x.n) === norm_(name)))
        list.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), n: name, by, t: Date.now() });
      tx.set(ref, { list: list.slice(-100), t: Date.now() });
    });
    return 'ok';
  },
  async del86(branch, id) {
    barSube_(branch);
    const ref = col('cfg').doc('e86_' + branch);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const list = ((snap.exists ? snap.data().list : []) || []).filter(x => x.id !== id);
      tx.set(ref, { list, t: Date.now() });
    });
    return 'ok';
  },
  // ✅ OPTIMIZE: 5 ardışık Firestore çağrısı → tek Promise.all
  async getKasaDay(branch) {
    barSube_(branch);
    const o = tp_();
    const probe = new Date(Date.UTC(+o.year, +o.month - 1, +o.day));
    if (+o.hour % 24 < 2) probe.setUTCDate(probe.getUTCDate() - 1);
    // Hangi ym'ler gerekli olabilir? En fazla 5 gün, muhtemelen 1-2 ay.
    const months = [];
    const cursor = new Date(probe.getTime());
    for (let i = 0; i < 5; i++) {
      const ym = cursor.getUTCFullYear() + ('0' + (cursor.getUTCMonth() + 1)).slice(-2);
      if (!months.includes(ym)) months.push(ym);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    // Paralel çek
    const snaps = await Promise.all(months.map(ym => col('cfg').doc('zpos_' + branch + '_' + ym).get()));
    const cache = {};
    snaps.forEach((s, i) => { cache[months[i]] = s.exists ? (s.data().days || {}) : {}; });
    // Günü bul
    const dt = new Date(probe.getTime());
    for (let i = 0; i < 5; i++) {
      const ym = dt.getUTCFullYear() + ('0' + (dt.getUTCMonth() + 1)).slice(-2);
      const day = dt.getUTCDate();
      if (!(cache[ym][String(day)] || {}).closed) return { ym, day };
      dt.setUTCDate(dt.getUTCDate() + 1);
    }
    const ym = dt.getUTCFullYear() + ('0' + (dt.getUTCMonth() + 1)).slice(-2);
    return { ym, day: dt.getUTCDate() };
  },
  async getGoAlias(branch) {
    barSube_(branch);
    const d = await col('cfg').doc('goalias_' + branch).get();
    return { m: d.exists ? (d.data().m || {}) : {} };
  },
  async setGoAlias(branch, raws, name, pin) {
    auth_(pin); barSube_(branch);
    if (!Array.isArray(raws) || !raws.length || raws.length > 60) throw new Error('Veri geçersiz');
    name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const ref = col('cfg').doc('goalias_' + branch), d = await ref.get(), m = d.exists ? (d.data().m || {}) : {};
    raws.forEach(r => { const k = String(r).slice(0, 60); if (name) m[k] = name; else delete m[k]; });
    await ref.set({ m: m, t: Date.now() }); return { m: m };
  },
  async getGunOrt(branch) {
    barSube_(branch);
    const d = await col('cfg').doc('gunort_' + branch).get();
    return d.exists ? { days: d.data().days || {}, t: d.data().t || 0 } : { days: {}, t: 0 };
  },
  async setGunOrt(branch, days, pin) {
    auth_(pin); barSube_(branch);
    if (!days || typeof days !== 'object') throw new Error('Veri yok');
    const ref = col('cfg').doc('gunort_' + branch);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const cur = (snap.exists ? snap.data().days : {}) || {};
      Object.keys(days).slice(0, 400).forEach(k => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
        const o = {};
        Object.keys(days[k] || {}).slice(0, 60).forEach(n => {
          const a = days[k][n], nm = String(n).replace(/[.\/\[\]*~`]/g, ' ').trim().slice(0, 40); if (!nm) return;
          o[nm] = [Math.round(Number(a && a[0]) || 0), Math.round((Number(a && a[1]) || 0) * 100) / 100];
        });
        cur[k] = o;
      });
      tx.set(ref, { days: cur, t: Date.now(), branch });
    });
    return 'ok';
  },
  async clearZPosFrom(branch, ym, fromDay, pin) {
    auth_(pin); barSube_(branch);
    ym = String(ym || '').replace(/[^\d]/g, '').slice(0, 6); fromDay = +fromDay;
    if (ym.length !== 6 || !(fromDay >= 1 && fromDay <= 31)) throw new Error('Ay/gün geçersiz');
    const ref = col('cfg').doc('zpos_' + branch + '_' + ym); let n = 0;
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref); if (!snap.exists) return;
      const days = snap.data().days || {};
      Object.keys(days).forEach(k => { if (+k >= fromDay) { delete days[k]; n++; } });
      tx.set(ref, { days, t: Date.now(), branch, ym }, { merge: false });
    });
    return { deleted: n };
  },
  async getOyunMenu(branch) {
    barSube_(branch);
    const d = await col('cfg').doc('oyunmenu_' + branch).get();
    return d.exists ? { items: d.data().items || [], t: d.data().t || 0 } : { items: [], t: 0 };
  },
  async setOyunMenu(branch, items, pin) {
    auth_(pin); barSube_(branch);
    const arr = (Array.isArray(items) ? items : []).slice(0, 400).map(x => ({
      n: String((x && x.n) || '').slice(0, 80), p: Math.max(0, Math.round((Number(x && x.p) || 0) * 100) / 100),
      d: String((x && x.d) || '').slice(0, 300), c: String((x && x.c) || '').slice(0, 40)
    })).filter(x => x.n);
    await col('cfg').doc('oyunmenu_' + branch).set({ items: arr, t: Date.now() });
    return { n: arr.length };
  },
  async getOyunScores(branch) {
    barSube_(branch);
    const d = await col('cfg').doc('oyunpuan_' + branch).get();
    return d.exists ? (d.data().s || {}) : {};
  },
  async saveOyunScore(branch, id, name, score, correct) {
    barSube_(branch); id = String(id || '').replace(/[^\w-]/g, '').slice(0, 40);
    if (!id) throw new Error('Kişi seçilmedi');
    score = Math.min(1500, Math.max(0, Math.round(Number(score) || 0))); correct = Math.min(10, Math.max(0, Math.round(Number(correct) || 0)));
    const m = new Date(); m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7)); const wk = m.toISOString().slice(0, 10);
    const ref = col('cfg').doc('oyunpuan_' + branch);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref), s = (snap.exists ? snap.data().s : {}) || {};
      const o = s[id] || { best: 0, tot: 0, plays: 0, cor: 0, wk: wk, wbest: 0 };
      if (o.wk !== wk) { o.wk = wk; o.wbest = 0; }
      o.n = String(name || '').slice(0, 40); o.best = Math.max(o.best || 0, score); o.wbest = Math.max(o.wbest || 0, score);
      o.tot = (o.tot || 0) + score; o.plays = (o.plays || 0) + 1; o.cor = (o.cor || 0) + correct; o.last = score; o.t = Date.now();
      s[id] = o; tx.set(ref, { s: s, t: Date.now() });
    });
    return 'ok';
  },
  async resetOyunScores(branch, pin) {
    auth_(pin); barSube_(branch);
    await col('cfg').doc('oyunpuan_' + branch).set({ s: {}, t: Date.now() });
    return 'ok';
  },
  // ===== YENİ: Bilgi Yarışması (Quiz) backend =====
  async getQuizQuestions(branch) {
    barSube_(branch);
    const d = await col('cfg').doc('quizbank_' + branch).get();
    if (d.exists && (d.data().list || []).length) return d.data().list;
    return null;
  },
  async saveQuizBank(branch, questions, pin) {
    auth_(pin); barSube_(branch);
    if (!Array.isArray(questions) || questions.length > 200) throw new Error('Soru bankası geçersiz');
    const clean = questions.slice(0, 200).map(q => {
      if (!q || typeof q.q !== 'string' || !Array.isArray(q.a) || q.a.length !== 4) return null;
      const c = Math.round(Number(q.c));
      if (!(c >= 0 && c <= 3)) return null;
      return { q: String(q.q).slice(0, 200), a: q.a.slice(0, 4).map(x => String(x).slice(0, 80)), c: c, cat: String(q.cat || 'genel').slice(0, 30) };
    }).filter(Boolean);
    await col('cfg').doc('quizbank_' + branch).set({ list: clean, t: Date.now() });
    return { n: clean.length };
  },
  async saveQuizResult(branch, playerId, playerName, score, correct, total, dur) {
    barSube_(branch);
    playerId = String(playerId || '').replace(/[^\w-]/g, '').slice(0, 40);
    if (!playerId) throw new Error('Kişi seçilmedi');
    score = Math.min(5000, Math.max(0, Math.round(Number(score) || 0)));
    correct = Math.min(50, Math.max(0, Math.round(Number(correct) || 0)));
    total = Math.min(50, Math.max(1, Math.round(Number(total) || 10)));
    dur = Math.min(3600, Math.max(1, Math.round(Number(dur) || 0)));
    const m = new Date(); m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7));
    const wk = m.toISOString().slice(0, 10);
    const ref = col('cfg').doc('quizscores_' + branch);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const s = (snap.exists ? snap.data().s : {}) || {};
      const o = s[playerId] || { name: '', best: 0, tot: 0, plays: 0, cor: 0, last: 0, wk: wk, wbest: 0, wtot: 0, wplays: 0 };
      if (o.wk !== wk) { o.wk = wk; o.wbest = 0; o.wtot = 0; o.wplays = 0; }
      o.n = String(playerName || '').slice(0, 40);
      o.best = Math.max(o.best || 0, score); o.wbest = Math.max(o.wbest || 0, score);
      o.tot = (o.tot || 0) + score; o.wtot = (o.wtot || 0) + score;
      o.plays = (o.plays || 0) + 1; o.wplays = (o.wplays || 0) + 1;
      o.cor = (o.cor || 0) + correct; o.last = score;
      o.lastTotal = total; o.lastDur = dur; o.t = Date.now();
      s[playerId] = o;
      tx.set(ref, { s, t: Date.now() });
    });
    return 'ok';
  },
  async getQuizLeaderboard(branch, period) {
    barSube_(branch);
    const d = await col('cfg').doc('quizscores_' + branch).get();
    const s = d.exists ? (d.data().s || {}) : {};
    const rows = Object.keys(s).map(id => {
      const o = s[id];
      const score = period === 'week' ? (o.wbest || 0) : period === 'total' ? (o.tot || 0) : (o.best || 0);
      const plays = period === 'week' ? (o.wplays || 0) : (o.plays || 0);
      const avg = plays > 0 ? Math.round(((period === 'week' ? (o.wtot || 0) : (o.tot || 0)) / plays) * 10) / 10 : 0;
      return { id, name: o.n || '?', score, plays, avg, best: o.best || 0, last: o.last || 0 };
    }).filter(r => r.plays > 0).sort((a, b) => b.score - a.score || b.plays - a.plays);
    return rows.slice(0, 50);
  },
  async resetQuizScores(branch, pin) {
    auth_(pin); barSube_(branch);
    await col('cfg').doc('quizscores_' + branch).set({ s: {}, t: Date.now() });
    return 'ok';
  },
  async getKasaOpen(branch) {
    barSube_(branch);
    const d = await col('cfg').doc('kasaopen_' + branch).get();
    return { open: !!(d.exists && d.data().open) };
  },
  async setKasaOpen(branch, open, pin) {
    auth_(pin); barSube_(branch);
    await col('cfg').doc('kasaopen_' + branch).set({ open: !!open, t: Date.now() });
    return { open: !!open };
  },
  async getMyKasa(branch, ym, day, name) {
    barSube_(branch);
    ym = String(ym || '').replace(/[^\d]/g, '').slice(0, 6);
    day = String(+day || 0);
    name = String(name || '').trim().slice(0, 40);
    if (ym.length !== 6 || !(+day >= 1 && +day <= 31) || !name) return { row: null, closed: false };
    const d = await col('cfg').doc('zpos_' + branch + '_' + ym).get();
    const days = d.exists ? (d.data().days || {}) : {};
    const cur = days[day] || {};
    const g = cur.garson || [];
    const norm = s => String(s || '').toLocaleUpperCase('tr').replace(/İ/g, 'I').replace(/\s+/g, ' ').trim();
    const hit = g.find(x => norm(x.name) === norm(name));
    return { row: hit || null, closed: !!cur.closed };
  },
  async setMyKasa(branch, ym, day, name, data) {
    barSube_(branch);
    ym = String(ym || '').replace(/[^\d]/g, '').slice(0, 6);
    day = String(+day || 0);
    name = String(name || '').trim().slice(0, 40);
    if (ym.length !== 6) throw new Error('Ay formatı YYYYMM olmalı');
    if (!(+day >= 1 && +day <= 31)) throw new Error('Gün 1-31 olmalı');
    if (!name) throw new Error('İsim gerekli');
    { const ko = await col('cfg').doc('kasaopen_' + branch).get(); if (!(ko.exists && ko.data().open)) throw new Error('Yönetici Kasaföy\'ü henüz açmadı.'); }
    const rnd = n => Math.round((Number(n) || 0) * 100) / 100;
    const ref = col('cfg').doc('zpos_' + branch + '_' + ym);
    const norm = s => String(s || '').toLocaleUpperCase('tr').replace(/İ/g, 'I').replace(/\s+/g, ' ').trim();
    const row = {
      name, t: Date.now(),
      ticket: rnd(data && data.ticket), sodexho: rnd(data && data.sodexho),
      multinet: rnd(data && data.multinet), metropol: rnd(data && data.metropol),
      setcard: rnd(data && data.setcard), token: rnd(data && data.token),
      kk: rnd(data && data.kk), nakit: rnd(data && data.nakit), hediye: rnd(data && data.hediye),
      ciro: rnd(data && data.ciro), check: Math.round(Number(data && data.check) || 0)
    };
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const days = (snap.exists ? snap.data().days : {}) || {};
      const cur = days[day] || { main: {}, extra: {}, yemek: {}, garson: [] };
      if (cur.closed) throw new Error('Bu gün kapatıldı (günsonu alındı). Yeni giriş yapılamaz.');
      const g = Array.isArray(cur.garson) ? cur.garson.slice() : [];
      const i = g.findIndex(x => norm(x.name) === norm(name));
      if (i >= 0) g[i] = Object.assign({}, g[i], row);
      else g.push(row);
      cur.garson = g.slice(0, 20);
      days[day] = cur;
      tx.set(ref, { days, t: Date.now(), branch, ym }, { merge: true });
    });
    return 'ok';
  },
  async closeKasaDay(branch, ym, day, pin) {
    auth_(pin);
    barSube_(branch);
    ym = String(ym || '').replace(/[^\d]/g, '').slice(0, 6);
    day = String(+day || 0);
    if (ym.length !== 6 || !(+day >= 1 && +day <= 31)) throw new Error('Geçersiz gün');
    const ref = col('cfg').doc('zpos_' + branch + '_' + ym);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const days = (snap.exists ? snap.data().days : {}) || {};
      const cur = days[day] || { main: {}, extra: {}, yemek: {}, garson: [] };
      cur.closed = true;
      cur.closedAt = Date.now();
      days[day] = cur;
      tx.set(ref, { days, t: Date.now(), branch, ym }, { merge: true });
    });
    try { await col('cfg').doc('kasaopen_' + branch).set({ open: false, t: Date.now() }); } catch (e) {}
    return 'ok';
  },
  async reopenKasaDay(branch, ym, day, pin) {
    auth_(pin);
    barSube_(branch);
    ym = String(ym || '').replace(/[^\d]/g, '').slice(0, 6);
    day = String(+day || 0);
    const ref = col('cfg').doc('zpos_' + branch + '_' + ym);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const days = (snap.exists ? snap.data().days : {}) || {};
      const cur = days[day] || {};
      cur.closed = false;
      days[day] = cur;
      tx.set(ref, { days, t: Date.now(), branch, ym }, { merge: true });
    });
    return 'ok';
  },
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
  async replyRadio(id, sube, data) {
    if (sube !== 'opt' && sube !== 'mavi') throw new Error('Şube geçersiz');
    if (typeof data !== 'string' || !/^data:audio\/(wav|x-wav|wave);base64,/.test(data) || data.length > 700000) throw new Error('Kayıt geçersiz ya da çok uzun');
    const st = (await allStaff_()).find(s => s.id === id); if (!st) throw new Error('Personel bulunamadı');
    await col('radio').doc('re_' + id).set({ a: data, t: Date.now(), from: st.name, to: 'admin_' + sube });
    return 'ok';
  },
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
  async srvPin(pin) { srvAuth_(pin); return 'ok'; },
  async getBarCfg(sube) {
    barSube_(sube);
    const d = await col('cfg').doc('bar_' + sube).get(), x = d.exists ? d.data() : {};
    return { shops: Array.isArray(x.shops) && x.shops.length ? x.shops : ['MADO', 'Bisquit', 'Cookshop', 'Starbucks', 'Autof'], staff: Array.isArray(x.staff) ? x.staff : [] };
  },
  async saveBarShops(sube, list) {
    barSube_(sube);
    const L = (Array.isArray(list) ? list : []).map(x => String(x).trim().slice(0, 40)).filter((x, i, a) => x && a.indexOf(x) == i).slice(0, 30);
    if (!L.length) throw new Error('En az bir mağaza olmalı');
    await col('cfg').doc('bar_' + sube).set({ shops: L }, { merge: true });
    return L;
  },
  async saveBarStaff(sube, ids, pin) {
    auth_(pin); barSube_(sube);
    const L = (Array.isArray(ids) ? ids : []).map(x => String(x).slice(0, 60)).filter((x, i, a) => x && a.indexOf(x) == i).slice(0, 100);
    await col('cfg').doc('bar_' + sube).set({ staff: L }, { merge: true });
    return L;
  },
  async getBar(sube, pin) {
    barAuth_(pin); barSube_(sube);
    const d = await col('cfg').doc('bar_' + sube).get(), e = d.exists ? (d.data().e || {}) : {};
    return Object.keys(e).map(k => Object.assign({ id: k }, e[k])).sort((a, b) => (b.t || 0) - (a.t || 0));
  },
  async addBar(sube, o, pin) {
    barAuth_(pin); barSube_(sube); o = o || {};
    const shop = String(o.shop || '').trim().slice(0, 40), item = String(o.item || '').trim().slice(0, 40), who = String(o.who || '').trim().slice(0, 40), note = String(o.note || '').trim().slice(0, 120), qty = Math.round(Number(o.qty) * 100) / 100, dir = o.dir === 'ver' ? 'ver' : 'al';
    if (!shop) throw new Error('Mağaza seç'); if (!item) throw new Error('Ürün yaz'); if (!(qty > 0 && qty < 10000)) throw new Error('Adet geçersiz'); if (!who) throw new Error('İşlemi yapan kişiyi seç');
    const id = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    await col('cfg').doc('bar_' + sube).set({ e: { [id]: { shop: shop, item: item, qty: qty, dir: dir, who: who, note: note, t: Date.now(), st: 'open' } } }, { merge: true });
    return id;
  },
  async closeBar(sube, id, who, pin) {
    barAuth_(pin); barSube_(sube); id = String(id || ''); who = String(who || '').trim().slice(0, 40);
    if (!/^b[a-z0-9]+$/.test(id)) throw new Error('Kayıt geçersiz'); if (!who) throw new Error('İşlemi yapan kişiyi seç');
    const ref = col('cfg').doc('bar_' + sube), d = await ref.get(), x = d.exists && d.data().e && d.data().e[id];
    if (!x) throw new Error('Kayıt bulunamadı'); if (x.st === 'done') throw new Error('Bu kayıt zaten tamamlanmış');
    await ref.update({ ['e.' + id + '.st']: 'done', ['e.' + id + '.t2']: Date.now(), ['e.' + id + '.who2']: who });
    return 'ok';
  },
  async delBar(sube, id, pin) {
    auth_(pin); barSube_(sube); id = String(id || ''); if (!/^b[a-z0-9]+$/.test(id)) throw new Error('Kayıt geçersiz');
    await col('cfg').doc('bar_' + sube).update({ ['e.' + id]: firebase.firestore.FieldValue.delete() });
    return 'ok';
  },
  async saveServisDay(sube, date, r, n, pin) {
    srvAuth_(pin);
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
  async setShiftWeek(id, cells, dates, sec, pin) {
    auth_(pin);
    if (!Array.isArray(cells) || cells.length !== 7 || !Array.isArray(dates) || dates.length !== 7 || dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(String(d)))) throw new Error('Veri geçersiz');
    await upd_(id, s => {
      const shd = s.shd || {}, byWd = (s.sh && s.sh.length === 7) ? s.sh.slice() : ['', '', '', '', '', '', ''];
      dates.forEach((d, i) => { const c = parseCell_(cells[i]); shd[d] = c; byWd[(new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7] = c; });
      s.shd = shd; s.sh = byWd; if (!s.shc) s.shc = ['', '', '', '', '', '', ''];
      if (sec) { s.sec = String(sec).slice(0, 30); if (!s.ord) s.ord = 9999; }
    });
    return 'ok';
  },
  async shiftRemove(id, dates, pin) {
    auth_(pin);
    if (!Array.isArray(dates) || dates.length !== 7) throw new Error('Veri geçersiz');
    await upd_(id, s => {
      const shd = s.shd || {}; dates.forEach(d => { shd[d] = ''; });
      s.shd = shd; s.sh = ['', '', '', '', '', '', '']; delete s.sec; delete s.ord; delete s.secLock; delete s.pg; delete s.po;
    });
    return 'ok';
  },
  async getPhotos() { const d = await col('cfg').doc('photos_all').get(); return d.exists ? d.data() : {}; },
  async setPhoto(id, data, pin) {
    if (pin) auth_(pin);
    id = String(id || ''); if (!/^[\w-]{1,40}$/.test(id)) throw new Error('Kişi geçersiz');
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(String(data)) || String(data).length > 40000) throw new Error('Fotoğraf geçersiz ya da çok büyük');
    await col('cfg').doc('photos_all').set({ ['p_' + id]: data }, { merge: true }); return 'ok';
  },
  async delPhoto(id, pin) {
    if (pin) auth_(pin);
    try { await col('cfg').doc('photos_all').update({ ['p_' + String(id)]: firebase.firestore.FieldValue.delete() }); } catch (e) {}
    return 'ok';
  },
  async getVideos(sube) {
    const d = await col('cfg').doc('videos_all').get();
    if (d.exists) return d.data().list || [];
    const L = [], seen = {};
    for (const k of ['opt', 'mavi']) { const o = await col('cfg').doc('videos_' + k).get(); if (o.exists) (o.data().list || []).forEach(v => { if (!seen[v.id]) { seen[v.id] = 1; L.push(v); } }); }
    return L;
  },
  async saveVideos(sube, list, pin) {
    auth_(pin);
    const L = (Array.isArray(list) ? list : []).slice(0, 100).map(v => ({ id: String(v.id || '').slice(0, 30), title: String(v.title || '').slice(0, 80), url: String(v.url || '').slice(0, 1500), path: String(v.path || '').slice(0, 300), t: Number(v.t) || Date.now(), o: v.o === 'p' || v.o === 'l' ? v.o : '', ad: v.ad ? 1 : 0 }));
    await col('cfg').doc('videos_all').set({ list: L, t: Date.now() });
    return L;
  },
  async getPostaList(sube) {
    if (sube !== 'opt' && sube !== 'mavi') throw new Error('Şube geçersiz');
    const d = await col('cfg').doc('postalist_' + sube).get();
    return d.exists && (d.data().list || []).length ? d.data().list : ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'S1', 'S2', 'S3', 'B1', 'G1', 'J'];
  },
  async savePostaList(sube, list, pin) {
    auth_(pin);
    if (sube !== 'opt' && sube !== 'mavi') throw new Error('Şube geçersiz');
    const L = (Array.isArray(list) ? list : []).map(x => String(x).trim().slice(0, 14)).filter((x, i, a) => x && a.indexOf(x) == i).slice(0, 60);
    if (!L.length) throw new Error('En az bir posta olmalı');
    await col('cfg').doc('postalist_' + sube).set({ list: L, t: Date.now() });
    return L;
  },
  async getPosta(sube, date) {
    if (sube !== 'opt' && sube !== 'mavi') throw new Error('Şube geçersiz');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error('Tarih geçersiz');
    const d = await col('cfg').doc('posta_' + sube + '_' + date).get();
    return { m: d.exists ? (d.data().m || {}) : {} };
  },
  async savePosta(sube, date, m, pin) {
    auth_(pin);
    if (sube !== 'opt' && sube !== 'mavi') throw new Error('Şube geçersiz');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error('Tarih geçersiz');
    const o = {}; Object.keys(m || {}).slice(0, 80).forEach(k => { if (m[k]) o[String(k).slice(0, 14)] = String(m[k]).slice(0, 40); });
    await col('cfg').doc('posta_' + sube + '_' + date).set({ m: o, t: Date.now() });
    return 'ok';
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
    if ((sube !== 'opt' && sube !== 'mavi') || ['bira', 'cay', 'baslangic', 'tatli'].indexOf(kind) < 0 || !(v >= 0) || (kind === 'bira' && !(v > 0))) throw new Error('Hedef geçersiz');
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
  if(!r.rows.length){msg('Görsellerde garson toplamı okunamadı.\nSicil no (37-4), garson adı ve Miktar sütunu görünecek şekilde, rapor sayfalarının
