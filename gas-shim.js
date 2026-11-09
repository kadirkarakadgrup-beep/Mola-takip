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
  SRV_PIN: '1234',                      // Garson panelinden servis girişi şifresi
  NTFY_PREFIX: 'mola-DEGISTIR-123xyz',  // Telefonlardaki ntfy kodlarıyla aynı kalmalı (benzersiz yap)
  SEQ: {
    opt: [{ k: 'mola', n: 'Çay Molası', d: 20 }, { k: 'yemek', n: 'Öğlen Yemeği', d: 30 }, { k: 'mola', n: 'Çay Molası', d: 20 }],
    mavi: [{ k: 'mola', n: 'Çay Molası', d: 20 }, { k: 'yemek', n: 'Öğlen Yemeği', d: 40 }, { k: 'mola', n: 'Çay Molası', d: 20 }]
  },
  MAIN: { from: 11, to: 20 },
  EXTRA: [
    { k: 'kahvalti', n: 'Kahvaltı Molası', d: 15, from: 9, to: 12 },
    { k: 'aksam', n: 'Akşam Yemeği', d: 15, from: 20, to: 23 },
    { k: 'ek', n: 'Ek mola', d: 10, from: 0, to: 24, unl: true }   // her an açık, günde sınırsız (hak düşmez)
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
const srvAuth_ = () => {};   // servis girişi şifresiz: sadece Gülkan Korkusuz profili ve yönetici ekranda görür
const barAuth_ = () => {};   // Bar Kontrol artık şifresiz: sadece bar personeli menüde görür
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
// Garsonun göreceği TÜM mola seçenekleri; ok=false olanlar gri gösterilir (neden: why)
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
  async checkPin(pin) { const r = await roleOf_(pin); if (r) VER[String(pin)] = r; return !!r; },
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
    const lev_ = (a, b) => { const d = []; for (let i = 0; i <= a.length; i++) d[i] = [i]; for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
    const used = {}, alias = {}, fuzzy = [], fzk = {};
    staff.forEach(x => { if (map[norm_(x.name)]) used[x.id] = 1; });
    Object.keys(map).filter(k => !known[k]).forEach(k => {      // birebir eşleşmeyenleri benzer isimle eşleştir (ŞEYDANUR ÇETİN ~ ŞEYDA ÇETİN)
      const cand = staff.filter(x => !used[x.id]).map(x => { const a = norm_(x.name); let d = lev_(k, a); if (a.length >= 6 && k.length >= 6 && (k.indexOf(a) === 0 || a.indexOf(k) === 0)) d = 0; return { x: x, d: d }; }).sort((p, q) => p.d - q.d);
      if (cand.length && cand[0].d <= Math.max(2, Math.floor(k.length * 0.25)) && (cand.length < 2 || cand[1].d > cand[0].d)) { alias[cand[0].x.id] = map[k]; used[cand[0].x.id] = 1; fzk[k] = 1; fuzzy.push([map[k].name, cand[0].x.name]); }
    });
    const c0 = new Date(dates[0] + 'T00:00:00Z'); c0.setUTCDate(c0.getUTCDate() - 45);
    const cut = isoD_(c0), absent = [], missing = Object.keys(map).filter(k => !known[k] && !fzk[k]).map(k => map[k].name);
    let ok = 0;
    for (const x of staff) {
      const e = map[norm_(x.name)] || alias[x.id], week = e ? e.week.map(c => parseCell_(c)) : ['', '', '', '', '', '', ''];
      await upd_(x.id, s => {
        const shd = s.shd || {};
        dates.forEach((d, i) => { shd[d] = week[i]; });
        Object.keys(shd).forEach(k => { if (k < cut) delete shd[k]; });
        const byWd = ['', '', '', '', '', '', ''];
        dates.forEach((d, i) => { byWd[(new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7] = week[i]; });
        s.shd = shd; s.sh = byWd; s.shc = ['', '', '', '', '', '', ''];
        if (e && e.pg) { s.pg = true; s.po = Number(e.po) || 0; } else { delete s.pg; delete s.po; }
        if (e) { s.sec = String(e.sec || '').slice(0, 30); s.ord = Number(e.ord) || 0; } else { delete s.sec; delete s.ord; }
      });
      if (e) ok++; else absent.push(x.name);
    }
    return { ok: ok, missing: missing, absent: absent, fuzzy: fuzzy };
  },
  async clearShift(branch, pin) {
    auth_(pin);
    for (const x of (await allStaff_()).filter(s => s.branch === branch)) await upd_(x.id, s => { delete s.sh; delete s.shc; delete s.shd; delete s.pg; delete s.po; delete s.sec; delete s.ord; });
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
      s.shd = shd; s.sh = ['', '', '', '', '', '', '']; delete s.sec; delete s.ord; delete s.pg; delete s.po;
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
    const L = (Array.isArray(list) ? list : []).slice(0, 100).map(v => ({ id: String(v.id || '').slice(0, 30), title: String(v.title || '').slice(0, 80), url: String(v.url || '').slice(0, 1500), path: String(v.path || '').slice(0, 300), t: Number(v.t) || Date.now(), o: v.o === 'p' || v.o === 'l' ? v.o : '' }));
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
const isoT=o=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date(Date.now()+o*864e5)),PCH={};
const postaGet=async o=>{const d=isoT(o),k=B+d,c=PCH[k];if(c&&Date.now()-c.t<30000)return;const r=await gs('getPosta',B,d);PCH[k]={t:Date.now(),m:(r&&r.m)||{}};};
function postaFill(s0){
  if(D.staff.some(s=>s.sec)&&String(s0.sec||'').toLocaleUpperCase('tr').replace(/İ/g,'I').indexOf('SERV')!=0){const e0=$('hipost');if(e0)e0.remove();return;}
  const paint=()=>{const e=$('hipost');if(!e)return;const f=o=>{const c=PCH[B+isoT(o)];if(!c)return '…';const k=Object.keys(c.m).find(p=>c.m[p]==s0.id);return k||'—';};e.innerHTML='📍 Postan: Bugün <span class="sv2">'+esc(f(0))+'</span> · Yarın <span class="sv2">'+esc(f(1))+'</span>';};
  paint();Promise.all([postaGet(0),postaGet(1)]).then(paint).catch(()=>{});
}
const srvOf_=s=>String(s.sec||'').toLocaleUpperCase('tr').replace(/İ/g,'I').indexOf('SERV')==0;
let TRC=null;
function trophyFill(s0){
  const hasSec=D.staff.some(s=>s.sec);
  if(hasSec&&!srvOf_(s0))return;
  const paint=()=>{
    const hi=document.querySelector('#list .hi');if(!hi||!TRC)return;
    let e=$('trph');if(!e){hi.insertAdjacentHTML('afterend','<div id="trph"></div>');e=$('trph');}
    const srv=new Set(D.staff.filter(s=>!hasSec||srvOf_(s)).map(s=>nrm(s.name)));
    const L=TRC.filter(r=>r.sube==B&&srv.has(nrm(r.name)));
    const G=grp(L)[0];if(!G||!G.rows.length){e.innerHTML='';return;}
    const R=G.rows,bo=R.slice().sort((a,b)=>b.ort-a.ort)[0],bc=R.slice().sort((a,b)=>b.ciro-a.ciro)[0],my=nrm(s0.name);
    const card=(t,r,v)=>'<div class="tr1'+(nrm(r.name)==my?' me':'')+'"><b class="mav big" data-nm="'+esc(r.name)+'">'+esc(ini(r.name))+'</b><span class="trc">🏆</span><div><small>'+t+'</small><b>'+esc(nice(r.name))+(nrm(r.name)==my?' (sen)':'')+'</b><em>'+v+'</em></div></div>';
    e.innerHTML='<div class="trw">'+card('Ortalama Birincisi',bo,tl2(bo.ort)+' TL')+card('Ciro Birincisi',bc,tl2(bc.ciro)+' TL')+'</div><div class="trp">'+esc(G.k)+'</div>';
  };
  paint();
  if(!TRC||Date.now()-(TRC.t||0)>60000)gs('listReportsPub').then(r=>{TRC=r;TRC.t=Date.now();paint();}).catch(()=>{});
}
let MLT=null;
window.molaList=function(){
  const render=()=>{
    if($('ov').hidden||$('mt').textContent.indexOf('Moladakiler')<0){clearInterval(MLT);return;}
    const now=Date.now()+off,A=D.staff.filter(s=>s.active).sort((a,b)=>a.active.start-b.active.start);
    $('mf').innerHTML=A.length?'<div class="mtw"><table class="mtb"><tr><th>Personel</th><th>Mola</th><th>Başlama</th><th>Dönüş</th><th>Kalan</th></tr>'+A.map(s=>{const a=s.active,r=endOf(a)-(a.paused?a.pausedAt:now),ab=Math.abs(r);return '<tr><td class="l"><b class="mav" data-nm="'+esc(s.name)+'">'+esc(ini(s.name))+'</b><b>'+esc(nice(s.name))+'</b></td><td>'+esc(a.n)+'</td><td>'+hm(a.start)+'</td><td>'+(a.paused?'⏸':hm(endOf(a)))+'</td><td class="'+(r<0?'late':'ok')+'">'+(r<0?'+':'')+p(ab/60000|0)+':'+p(ab/1000%60|0)+'</td></tr>';}).join('')+'</table></div>':'<p class="sub">Şu an molada kimse yok.</p>';
    const F=[];D.staff.forEach(s=>{const a=(s.done||[]).filter(x=>x&&typeof x=='object').sort((x,y)=>x.t-y.t);if(a.length)F.push({n:s.name,a:a,last:Math.max.apply(null,a.map(x=>x.e||x.t+dm(x)*60000)),tot:a.reduce((q,x)=>q+dm(x),0)});});F.sort((a,b)=>b.last-a.last);
    if(F.length)$('mf').innerHTML+='<div class="sec" style="margin:14px 2px 6px">BUGÜN BİTEN MOLALAR</div><div class="mtw"><table class="mtb"><tr><th>Personel</th><th>Bitenler</th><th>Toplam</th></tr>'+F.map(x=>'<tr><td class="l"><div class="mn"><b class="mav" data-nm="'+esc(x.n)+'">'+esc(ini(x.n))+'</b><b>'+esc(nice(x.n))+'</b></div></td><td class="l">'+x.a.map(y=>'<div class="ml"><span>'+esc(kn(y.k))+'</span> '+hm(y.t)+'–'+hm(y.e||y.t+dm(y)*60000)+' <i>'+dm(y)+' dk</i></div>').join('')+'</td><td><b>'+x.tot+' dk</b></td></tr>').join('')+'</table></div>';
  };
  pop('☕ Moladakiler · '+BR[B],'',false);render();clearInterval(MLT);let n=0;
  MLT=setInterval(()=>{if($('ov').hidden||$('mt').textContent.indexOf('Moladakiler')<0){clearInterval(MLT);return;}render();if(++n%5==0)google.script.run.withFailureHandler(()=>{}).withSuccessHandler(d=>{if(d&&d.names){D=d;off=d.now-Date.now();}}).getState(B,M=='y'?PIN:'');},1000);
};
const ini=n=>nice(n).split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('');
window.pkFilter=v=>{const q=nrm(v);document.querySelectorAll('.pkc').forEach(b=>{b.style.display=(!q||b.dataset.n.indexOf(q)>=0)?'':'none';});};
window.draw=function(){
  if(M!='g'){window.hideLogin&&hideLogin();od();return;}
  const me=getMe();
  if(me&&D.staff.some(s=>s.id==me)){window.hideLogin&&hideLogin();const all=D.staff,s0=all.find(s=>s.id==me);D.staff=all.filter(s=>s.id==me);try{od();}finally{D.staff=all;}
    const left=Math.max(0,D.total-usedOf(s0));
    $('list').insertAdjacentHTML('afterbegin','<div class="hi"><b data-p="'+s0.id+'" onclick="phMenu(\''+s0.id+'\')">'+esc(ini(s0.name))+'</b><div><div class="hi1">Merhaba, '+esc(nice(s0.name).split(' ')[0])+' 👋</div><div class="hi2">'+shiftTwo(s0)+'<div class="sv2l">☕ Kalan mola '+left+' dk</div></div></div></div><div class="chipsrow" style="margin:0 0 12px"><button class="pill" onclick="myCode()">🔔 Bildirim kodum</button><button class="pill" onclick="radioMode()">'+(window.__rwl?'📻 Telsiz dinleme: AÇIK':'📻 Telsiz dinle')+'</button></div>');
    postaFill(s0);trophyFill(s0);mbn(s0,me);vFetch(s0);radioListen(me);
    return;}
  radioListen('');head();window.showLogin();
};
window.head=function(){
  oh();$('tools').style.display='none';
  if(M=='g'){
    const me=getMe();
    $('tools').innerHTML=''
      +'<div class="chipsrow"><button class="pill" onclick="molaList()">☕ Moladakiler</button>'+(me?'<button class="pill" onclick="myCode()">🔔 Bildirim kodum</button><button class="pill" onclick="radioMode()">'+(window.__rwl?'📻 Telsiz dinleme: AÇIK':'📻 Telsiz dinle')+'</button><button class="pill" onclick="pickMe(\'\')">↩ Kişiyi değiştir</button>':'')+'</div>';
  }else if(M=='y')$('tools').innerHTML='';
};
const sty=document.createElement('style');
sty.textContent='.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;width:100%}.tiles button{border:1px solid rgba(148,163,184,.18);border-radius:18px;padding:14px 4px;background:linear-gradient(160deg,#1f2b42,#162033);color:#e2e8f0;font-weight:700;font-size:13px;line-height:1.25;box-shadow:0 6px 16px rgba(0,0,0,.28);display:flex;flex-direction:column;align-items:center;gap:6px}.tiles i{font-style:normal;font-size:26px}.tiles button:active{transform:scale(.97)}.pill{border:1px solid rgba(148,163,184,.25);background:rgba(148,163,184,.1);color:#e2e8f0;border-radius:999px;padding:10px 16px;font-weight:600;font-size:13px}.chipsrow{display:flex;gap:8px;flex-wrap:wrap;width:100%}.pkh{font-weight:800;font-size:16px;display:flex;justify-content:space-between;align-items:center;margin:4px 2px}.pkh span{font-size:12px;color:#94a3b8;font-weight:600}.pks{width:100%;padding:13px 14px;border-radius:14px;border:1px solid #334155;background:#0f172a;color:#fff;font-size:16px;margin:8px 0 12px}.pkg{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pkc{display:flex;align-items:center;gap:10px;text-align:left;padding:10px;border-radius:16px;border:1px solid rgba(148,163,184,.15);background:linear-gradient(160deg,#1f2b42,#162033);color:#f1f5f9;font-size:14px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,.25)}.pkc b{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#6366f1,#8b5cf6);font-size:14px}.pkc span{line-height:1.2;word-break:break-word}.card{border-radius:20px}#list .btns .a{min-height:56px;font-size:16px}';
document.head.appendChild(sty);
const styT=document.createElement('style');styT.textContent='.mav{display:inline-flex;width:26px;height:26px;border-radius:50%;background:#334155;font-size:10px;align-items:center;justify-content:center;vertical-align:middle;margin-right:6px;overflow:hidden;font-weight:800;flex:none}.mav.big{width:40px;height:40px;font-size:13px;margin:0}.tr1 .trc{font-size:22px}.trw{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 4px}.tr1{display:flex;gap:8px;align-items:center;background:linear-gradient(135deg,#78350f,#451a03);border:1px solid #f59e0b;border-radius:16px;padding:10px}.tr1.me{box-shadow:0 0 0 2px #fde68a}.trc{font-size:30px}.tr1 small{display:block;font-size:11px;color:#fde68a;font-weight:700}.tr1 b{display:block;font-size:14px;line-height:1.15;word-break:break-word}.tr1 em{font-style:normal;font-size:13px;color:#fbbf24;font-weight:700}.trp{font-size:11px;color:#94a3b8;margin:0 2px 12px}';document.head.appendChild(styT);

// ===== Sayfalar: Mola | Ciro | Bira | Vardiya (her biri tam sayfa) =====
let PGV='mola',PSIG='',PRQ=0;
let BARCFG={sube:'',shops:null,staff:[],busy:false};
function barIsBar(st){return !!st&&(/(^|\s)BAR/.test(String(st.sec||'').toLocaleUpperCase('tr').replace(/İ/g,'I'))||(BARCFG.staff||[]).indexOf(st.id)>-1);}
function repVis(){if(M=='y')return true;const st=(D&&D.staff)||[],me=st.find(x=>x.id==getMe());if(!me)return false;if(!st.some(x=>x.sec))return true;return srvOf_(me);}
function barVis(){if(M=='y')return true;const me=((D&&D.staff)||[]).find(x=>x.id==getMe());return barIsBar(me);}
const NV=document.createElement('div');NV.id='nv';NV.className='nv';document.querySelector('.hd').after(NV);
const PG=document.createElement('div');PG.id='pg';PG.hidden=true;$('beer').after(PG);
const NAVS=[['mola','🕐','Mola'],['vard','🗓️','Vardiya'],['servis','🚌','Servis'],['bar','🍸','Bar'],['rep','📁','Rapor'],['video','🎬','Video'],['ml','☕','Moladakiler']];
const nvDraw=()=>{NV.innerHTML=NAVS.filter(n=>(n[0]!='bar'||barVis())&&(n[0]!='rep'||repVis())).map(n=>`<button class="${n[0]==PGV?'on':''}" onclick="${n[0]=='ml'?'molaList()':`goPg('${n[0]}')`}"><i>${n[1]}</i>${n[2]}</button>`).join('');};
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
const rVard=()=>[['Ad Soyad'].concat(DAYS.map(d=>d.charAt(0)+d.slice(1).toLocaleLowerCase('tr')))].concat(((D&&D.staff)||[]).filter(s=>!s.off&&s.sh).sort((a,b)=>((a.ord||1e9)-(b.ord||1e9))||a.name.localeCompare(b.name,'tr')).map(s=>[nice(s.name)].concat(DAYS.map((d,i)=>(s.sh[i]||'İZİN').replace('-','–')))));
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
  const td=(new Date().getDay()+6)%7,me=getMe();let st=((D&&D.staff)||[]).filter(s=>!s.off);
  if(st.some(s=>s.sec))st=st.filter(s=>s.sec);
  if(!st.some(s=>s.sh))return '<p class="sub" style="padding:10px">Bu şube için vardiya henüz yüklenmedi.</p>';
  const wn=window.weekNote?window.weekNote():'';
  st.sort((a,b)=>((a.ord||1e9)-(b.ord||1e9))||a.name.localeCompare(b.name,'tr'));let ps='';
  const mon=new Date();mon.setDate(mon.getDate()-td);
  const dts=DAYS.map((d,i)=>{const x=new Date(mon);x.setDate(mon.getDate()+i);return x.toLocaleDateString('tr-TR',{day:'numeric',month:'short'});});
  const ad=M=='y',hd='<tr><th class="nmc">Personel</th>'+DAYS.map((d,i)=>`<th class="${i==td?'td':''}">${dts[i]}<br><span class="dn">${d}</span></th>`).join('')+(ad?'<th></th>':'')+'</tr>';
  return wn+'<div style="overflow:auto"><table class="xl">'+hd+st.map(s=>{const sh=(s.sec&&s.sec!==ps)?'<tr><td class="secr" colspan="'+(ad?9:8)+'">'+esc(s.sec)+'</td></tr>':'';if(s.sec)ps=s.sec;return sh+'<tr'+(s.id==me&&M=='g'?' style="outline:3px solid #facc15;outline-offset:-3px"':'')+'><td class="nmc">'+esc(nice(s.name).toLocaleUpperCase('tr'))+'</td>'+DAYS.map((d,i)=>{const c=shiftCell(s.sh&&s.sh[i]);return `<td class="c ${i==td?'tdy':''}" style="background:${c.bg}">${c.a}</td>`;}).join('')+(ad?'<td class="shact"><button class="x2 w" onclick="shEdit(\''+s.id+'\')">✏️</button><button class="x2 w" onclick="shDel(\''+s.id+'\')">🗑</button></td>':'')+'</tr>';}).join('')+'</table></div>';
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
    }else if(v=='video'){
      await window.vidLoad();
      title='🎬 Eğitim Videoları';
      acts=adm?b('vidPick()','⬆ Video yükle','an')+b('vidLink()','🔗 Link ekle'):'';
      body=window.vidHtml(adm);
    }else if(v=='servis'){
      await svLoad();
      title='🚌 Servis Takip';
      acts=b('svXls()','⬇ Bu ay Excel','')+b('svXlsAll()','⬇ Tüm aylar Excel','an');
      body=svHtml(adm||svMe());
    }else if(v=='bar'){
      title='🍸 Bar Kontrol';
      if(!barVis()){body='<p class="sub" style="padding:10px">Bu bölüm sadece bar personeline açık.</p>';}
      else{await barCfg();
        if(BARTAB=='skt'){sktSub();acts=b('skXls()','⬇ Excel','')+b('skImport()','📥 Listeyi aktar','an');}
        else{await barLoad(false);acts=b('barShops()','✏️ Mağazaları düzenle','an');}
        body=barHtml();}
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
      acts=b("pgXls('vard')",'⬇ Excel','')+(adm?b('shiftXlsPick()','📎 Vardiya Excel yükle','an')+b('postaUI()','📋 Postalar')+b('shAdd()','➕ Vardiyaya kişi ekle')+(window.__shi?b('shImgDel()','🗑 Görseli kaldır','off'):'')+b('shiftClr()','🗑 Tabloyu temizle','off'):'');
      body=(window.__shi?`<div class="simg"><div class="simgh">🖼 Güncel vardiya görseli<span>${new Date(si.t).toLocaleDateString('tr-TR')}</span></div><img src="${si.img}" alt="Vardiya" onclick="showShImg()"><div class="simgt">Büyütmek için dokun</div></div>`:'')+vardHtml();
    }
  }catch(e){body='<div class="err">'+esc(emsg(e))+'</div>';}
  if(my!==PRQ||PGV!=v)return;
  PG.innerHTML=`<div class="pgh"><h2>${title}<small>${BR[B]}</small></h2><div class="pga">${acts}</div></div>${per}<div class="pgb">${body}</div>`;
  if(v=='bar'&&BARTAB=='skt')sktPaint();
}

// ===== 🍸 Bar Kontrol: komşu mağazalarla ürün (süt vb.) alış / veriş takibi =====
const BAR={pin:'',L:[],t:0,key:'',shop:'MADO',other:'',dir:'al',item:'Süt',qty:'1',note:'',who:'',busy:false};
const BAR_SHOPS=['MADO','Bisquit','Cookshop','Starbucks','Autof'],barShops_=()=>BARCFG.shops&&BARCFG.shops.length?BARCFG.shops:BAR_SHOPS;
let BARVIS=null;
async function barCfg(force){
  if(!force&&BARCFG.sube===B)return;
  try{const c=await gs('getBarCfg',B);BARCFG.shops=c.shops;BARCFG.staff=c.staff;}catch(e){}
  BARCFG.sube=B;
}
function barWatch(){
  if(D&&BARCFG.sube!==B&&!BARCFG.busy){BARCFG.busy=true;barCfg(true).then(()=>{BARCFG.busy=false;barWatch();});return;}
  const v=barVis()+'|'+repVis();if(v!==BARVIS){BARVIS=v;nvDraw();if(!barVis()&&PGV=='bar')goPg('mola');if(!repVis()&&PGV=='rep')goPg('mola');}
}
window.barShops=()=>ask('✏️ Mağazalar · '+BR[B]+'\nHer satıra bir mağaza yaz. Adı düzeltmek için satırı değiştir, silmek için satırı sil.',[{label:'Mağazalar',type:'textarea',val:barShops_().join('\n')}],async v=>{
  try{BARCFG.shops=await gs('saveBarShops',B,v[0].split(/\r?\n/));if(BAR.shop!='Diğer'&&BARCFG.shops.indexOf(BAR.shop)<0)BAR.shop=BARCFG.shops[0];barRe();}catch(e){msg(emsg(e));}
},'Kaydet');
window.barStaffTog=async id=>{
  const L=(BARCFG.staff||[]).slice(),k=L.indexOf(id);if(k>-1)L.splice(k,1);else L.push(id);
  try{BARCFG.staff=await gs('saveBarStaff',B,L,PIN);barRe();}catch(e){msg(emsg(e));}
};
const barP=()=>M=='y'?PIN:BAR.pin,barRe=()=>renderPg(true);
const barT=t=>new Date(t).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
async function barLoad(force){
  const k=B+M;if(!force&&BAR.key==k&&Date.now()-BAR.t<20000)return;
  BAR.L=await gs('getBar',B,barP());BAR.key=k;BAR.t=Date.now();
}
const barNames=()=>((D&&D.staff)||[]).filter(s=>!s.off&&barIsBar(s)).map(s=>nice(s.name)).sort((a,b)=>a.localeCompare(b,'tr'));
function barLockHtml(){return '<div class="hot" style="margin-bottom:12px">🔒 Bar Kontrol şifreli</div><button class="a an" style="width:100%" onclick="barUnlock()">🔐 Şifre gir</button>';}
window.barUnlock=()=>ask('🍸 Bar Kontrol',[{label:'Şifre',type:'password'}],v=>{gs('barPin',v[0].trim()).then(()=>{BAR.pin=v[0].trim();BAR.key='';barRe();}).catch(e=>msg(emsg(e)));},'Giriş');
window.barLock=()=>{BAR.pin='';BAR.key='';barRe();};
window.barSet=(k,v)=>{BAR[k]=v;};
window.barShop=s=>{BAR.shop=s;barRe();};
window.barDir=d=>{BAR.dir=d;barRe();};
function barShopHtml(){
  if(BAR.shop!='Diğer'&&barShops_().indexOf(BAR.shop)<0)BAR.shop=barShops_()[0];
  const chips=barShops_().concat(['Diğer']).map(x=>'<button class="'+(BAR.shop==x?'on':'')+'" data-s="'+esc(x)+'" onclick="barShop(this.dataset.s)">'+esc(x)+'</button>').join('');
  let h='<div class="bcard">'
   +'<label>Mağaza</label><div class="bchips">'+chips+'</div>'+(BAR.shop=='Diğer'?'<input placeholder="Mağaza adı" value="'+esc(BAR.other)+'" oninput="barSet(\'other\',this.value)">':'')
   +'<div class="seg" style="margin:10px 0 4px"><button class="'+(BAR.dir=='al'?'on':'')+'" onclick="barDir(\'al\')">📥 Aldık</button><button class="'+(BAR.dir=='ver'?'on':'')+'" onclick="barDir(\'ver\')">📤 Verdik</button></div>'
   +'<div class="brow"><div><label>Ürün</label><input value="'+esc(BAR.item)+'" oninput="barSet(\'item\',this.value)"></div><div style="max-width:90px"><label>Adet</label><input type="number" inputmode="decimal" value="'+esc(BAR.qty)+'" oninput="barSet(\'qty\',this.value)"></div></div>'
   +'<label>Not (isteğe bağlı)</label><input value="'+esc(BAR.note)+'" oninput="barSet(\'note\',this.value)">'
   +'<button class="a an" style="width:100%;margin-top:10px"'+(BAR.busy?' disabled':'')+' onclick="barAdd()">'+(BAR.dir=='al'?'Alındı olarak kaydet':'Verildi olarak kaydet')+'</button></div>';
  const op=BAR.L.filter(x=>x.st!='done'),dn=BAR.L.filter(x=>x.st=='done').sort((a,b)=>(b.t2||0)-(a.t2||0)).slice(0,40);
  const row=x=>{const al=x.dir=='al',done=x.st=='done';
    return '<div class="bit '+(done?'dn':'')+'"><div class="bh"><b>'+esc(x.shop)+'</b> · '+esc(x.item)+' × '+x.qty+'<span class="bb '+(al?'a':'v')+'">'+(al?'Alındı':'Verildi')+'</span></div>'
     +'<div class="bs">'+(al?'Alan: ':'Veren: ')+'<b>'+esc(x.who)+'</b> · '+barT(x.t)+'</div>'
     +(x.note?'<div class="bs">📝 '+esc(x.note)+'</div>':'')
     +(done?'<div class="bs ok">✅ '+(al?'Geri verildi':'Teslim edildi')+': <b>'+esc(x.who2||'')+'</b> · '+barT(x.t2)+'</div>':'<button class="a ok2" data-i="'+esc(x.id)+'" onclick="barClose(this.dataset.i)">'+(al?'↩ Geri verildi':'✅ Teslim edildi')+'</button>')
     +(M=='y'?'<button class="x2 bdel" data-i="'+esc(x.id)+'" onclick="barDel(this.dataset.i)">✕</button>':'')+'</div>';};
  h+='<div class="sec2">⏳ BEKLEYENLER <span>'+op.length+'</span></div>'+(op.length?op.map(row).join(''):'<p class="sub">Bekleyen kayıt yok.</p>');
  if(dn.length)h+='<div class="sec2">✅ TAMAMLANANLAR <span>'+dn.length+'</span></div>'+dn.map(row).join('');
  return h;
}
function barAdminCard(){
  return '<div class="bcard"><label>👥 Bar personeli (bu butonu görenler)</label><div class="bchips">'+((D&&D.staff)||[]).filter(x=>!x.off).sort((a,b)=>a.name.localeCompare(b.name,'tr')).map(x=>{const auto=/(^|\s)BAR/.test(String(x.sec||'').toLocaleUpperCase('tr').replace(/İ/g,'I')),on=auto||(BARCFG.staff||[]).indexOf(x.id)>-1;return '<button class="'+(on?'on':'')+'" data-i="'+esc(x.id)+'"'+(auto?' disabled':' onclick="barStaffTog(this.dataset.i)"')+'>'+(on?'✓ ':'')+esc(nice(x.name))+(auto?' (vardiya)':'')+'</button>';}).join('')+'</div><div class="bs">Vardiya listesinde “BAR” bölümünde olanlar otomatik görür. Diğerlerini buradan ekle/çıkar.</div></div>';
}
function barHtml(){
  const names=barNames();
  if(!BAR.who||names.indexOf(BAR.who)<0){const me=((D&&D.staff)||[]).find(x=>x.id==getMe()),n=me?nice(me.name):'';BAR.who=names.indexOf(n)>-1?n:'';}
  let h='<div class="bcard"><label>İşlemi yapan (sadece bar personeli)</label><select onchange="barSet(\'who\',this.value)"><option value="">— seç —</option>'+names.map(n=>'<option'+(n==BAR.who?' selected':'')+'>'+esc(n)+'</option>').join('')+'</select>'+(names.length?'':'<div class="bs">Bar personeli yok. Yönetici, aşağıdaki “Bar personeli” kutusundan ekler.</div>')+'</div>';
  h+='<div class="seg" style="margin-bottom:12px"><button class="'+(BARTAB=='skt'?'':'on')+'" onclick="barTab(\'shop\')">🏪 Mağaza alışveriş</button><button class="'+(BARTAB=='skt'?'on':'')+'" onclick="barTab(\'skt\')">📅 SKT Takip</button></div>';
  h+=BARTAB=='skt'?sktShell():barShopHtml();
  if(M=='y')h+=barAdminCard();
  return h;
}
window.barTab=t=>{BARTAB=t;if(t=='skt')sktSub();barRe();};
window.barAdd=async()=>{
  if(BAR.busy)return;const shop=BAR.shop=='Diğer'?BAR.other.trim():BAR.shop;
  BAR.busy=true;
  try{await gs('addBar',B,{shop:shop,item:BAR.item,qty:BAR.qty,dir:BAR.dir,who:BAR.who,note:BAR.note},barP());BAR.note='';BAR.qty='1';BAR.other='';await barLoad(true);}
  catch(e){msg(emsg(e));}
  BAR.busy=false;barRe();
};
window.barClose=async id=>{
  if(!BAR.who){msg('Önce "İşlemi yapan" kişiyi seç.');return;}
  try{await gs('closeBar',B,id,BAR.who,barP());await barLoad(true);}catch(e){msg(emsg(e));}
  barRe();
};
window.barDel=id=>ask('Bu kayıt silinsin mi?',[],async()=>{try{await gs('delBar',B,id,PIN);await barLoad(true);}catch(e){msg(emsg(e));}barRe();},'Sil');
const styB=document.createElement('style');
styB.textContent='.bcard{background:#172033;border:1px solid rgba(148,163,184,.14);border-radius:16px;padding:12px;margin-bottom:12px}.bcard label{display:block;font-size:12px;color:#94a3b8;font-weight:700;margin:8px 0 4px}.bcard input,.bcard select{width:100%;box-sizing:border-box;background:#0f172a;color:#fff;border:1px solid #334155;border-radius:12px;padding:11px;font-size:15px}.bchips{display:flex;flex-wrap:wrap;gap:6px}.bchips button{background:#0f172a;color:#cbd5e1;border:1px solid #334155;border-radius:20px;padding:8px 13px;font-weight:700;font-size:13px}.bchips button.on{background:#6366f1;border-color:#6366f1;color:#fff}.brow{display:flex;gap:8px}.brow>div{flex:1}.bit{position:relative;background:#172033;border:1px solid rgba(148,163,184,.14);border-radius:14px;padding:10px 12px;margin-bottom:8px}.bit.dn{opacity:.8}.bh{font-size:15px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding-right:28px}.bb{font-size:11px;font-weight:800;border-radius:10px;padding:2px 8px;margin-left:auto}.bb.a{background:#7c2d12;color:#fdba74}.bb.v{background:#1e3a8a;color:#93c5fd}.bs{font-size:12px;color:#94a3b8;margin-top:3px}.bs.ok{color:#4ade80}.a.ok2{width:100%;margin-top:8px;background:linear-gradient(#22c55e,#15803d);color:#fff;border-radius:12px;padding:10px;font-weight:700}.bdel{position:absolute;right:8px;top:8px}.mn{display:flex;align-items:center;gap:6px;min-width:96px}.mn b:last-child{line-height:1.15}.mn .mav{margin:0}.ml{font-size:11px;line-height:1.5;white-space:nowrap;text-align:left}.ml span{font-weight:700}.ml i{font-style:normal;color:#6b7280}';
document.head.appendChild(styB);

// ===== 📅 SKT Takip (bar): son kullanma tarihi, kullanıldı / fire, geçmiş =====
let BARTAB='shop';
const SK={d:null,key:'',unsub:null,f:'all',gf:'all',q:'',edit:'',nm:'',cat:'Diğer',qty:'1',skt:'',bc:'',hf:'all',hq:'',tgt:'',mode:'set',note:'',sc:null,tt:null,err:''};
const SK_G=['Bira','Şarap','Rakı','Sert İçki','Likör & Vermut','Easymix','Şurup','Püre','Çay & Kahve','Alkolsüz İçecek','Süt/Krema','Meyve/Sebze','Açılmış şişe','Fıçı bira','Diğer'];
const SK_E={'Bira':'🍺','Şarap':'🍷','Rakı':'🍶','Sert İçki':'🥃','Likör & Vermut':'🍸','Easymix':'🍹','Şurup':'🍯','Püre':'🍓','Çay & Kahve':'☕','Alkolsüz İçecek':'🥤','Süt/Krema':'🥛','Meyve/Sebze':'🍋','Açılmış şişe':'🍾','Fıçı bira':'🍻','Diğer':'📦'};
const SK_CAT={E:'Easymix',W:'Şarap',B:'Bira',S:'Sert İçki',L:'Likör & Vermut',R:'Rakı',C:'Çay & Kahve',U:'Şurup',P:'Püre',A:'Alkolsüz İçecek'},SK_UN={A:'ADET',L:'LT',C:'CL',K:'KG'};
const SK_LIST=`PR001|TOMMYS MARGARITA|E|L
PR002|EASYMIX MOSCOW MULE|E|L
PR003|EASYMIX PASSION MARTINI|E|L
PR004|EASYMIX W.S. SATSUMA|E|L
PR005|EASYMIX LIBIDO|E|L
PR006|EASYMIX TUXEDO|E|L
PR007|EASYMIX VAI VAI|E|L
PR008|EASYMIX PURPLE BASIL|E|L
PR009|EASYMIX CITRUS BLEND|E|L
PR010|EASYMIX WHITE PEACH|E|L
PR011|EASYMIX CRANBERRY HIBISCUS|E|L
PR012|EASYMIX GRASS|E|L
PR013|EASYMIX ROOIBOS PEACH|E|L
PR014|EASYMIX STRAWBERRY HIBISCUS|E|L
PR015|EASYMIX COOL LIME|E|L
PR016|EASYMIX RASPBERRY ACAI|E|L
PR017|EASYMIX WATERMELON|E|L
PR018|EASYMIX ORANGE MANGO|E|L
PR019|EASYMIX VARYASYON|E|L
PR020|EASYMIX MASTICHA TINCTURE|E|L
PR021|EASYMIX ELDERFLOWER TINCTURE|E|L
PR022|EASYMIX LIQUID SMOKE TINCTURE|E|L
PR023|EASYMIX VANILYA SURUBU|E|L
YA00005|SB SELECTION BEYAZ|W|A
YA00006|SB SARTORI PINOT GRIGIO|W|A
YA00008|SB PROSECCO|W|A
YA00013|SB GATTO NEGRO CHARDNY|W|A
YA00014|SB CANKAYA 75 CL|W|A
YA00015|SB CANKAYA 37 CL|W|A
YA00016|SB ANGORA BEYAZ 75CL|W|A
YA00017|SB ANGORA BEYAZ 37 CL|W|A
YA00018|SB ANCYRA SAUVIGNON BLANC|W|A
YA00019|SB ANCRYA NARINCE|W|A
YA00040|MILLER|B|A
YA00042|HEINEKEN|B|A
YA00043|GUINNESS DRAUGHT|B|A
YA00045|ERDINGER|B|A
YA00046|EFES SISE 50 LIK|B|A
YA00048|EFES SISE 33 CL|B|A
YA00051|EFES PILSEN GREEN 50 CL|B|A
YA00053|EFES MALT 50 CL|B|A
YA00056|EFES FICI|B|L
YA00061|EFES BELFAST 50 CL|B|A
YA00062|DUVEL|B|A
YA00063|CORONA 33,5 CL|B|A
YA00066|BOMONTI FILTRESIZ 50 CL|B|A
YA00068|BECKS|B|A
YA00070|AMSTERDAM|B|A
YA00079|VISKI JOHNIE WALKR BLACK 70 CL|S|C
YA00080|VISKI JOHNIE WALKER RED 70 CL|S|C
YA00081|VISKI JIM BEAM 70 CL|S|C
YA00082|VISKI J&B 70 CL|S|C
YA00083|VISKI JAMESON 70 CL|S|C
YA00085|VISKI JACK DANIELS 70 CL|S|C
YA00096|VISKI CHIVAS REGAL 12 YIL 70 CL|S|C
YA00097|VISKI BALLANTINES 70 CL|S|C
YA00099|CIN GORDON 70CL|S|C
YA00100|CIN TANQUERAY TEN 70CL|S|C
YA00102|CIN HENDRIKS 70CL|S|C
YA00104|CIN BEEFEATHER 70CL|S|C
YA00107|SK YAKUT 75 CL|W|A
YA00108|SK YAKUT 37 CL|W|A
YA00110|SK SELECTION KIRMIZI 75 CL|W|A
YA00112|SK MONTES MERLOT|W|A
YA00113|SK MONTES MALBEC|W|A
YA00118|SK GATO NEGRO CAB. SAUV|W|A
YA00119|SK EGEO BLEND|W|A
YA00121|SK BORDEAUX BARON DE LSTC|W|A
YA00122|SK ANGORA KIRMIZI 75 CL|W|A
YA00123|SK ANGORA KIRMIZI 37 CL|W|A
YA00124|SK ANCYRA OKUZGOZU|W|A
YA00125|SK ANCYRA MERLOT|W|A
YA00126|SK ANCYRA KALECIKKARASI|W|A
YA00127|SK ANCYRA CAB. SAUV. SHIRAZ|W|A
YA00128|SK ANCYRA BOGAZKERE|W|A
YA00148|KONYAK HENNESY V.S.O.P 70CL|S|C
YA00149|KONYAK HENNESY V.S 70CL|S|C
YA00150|LIKOR YERLI (JEST PORTAKAL) 70 CL|L|C
YA00157|LIKOR SAFARI 70 CL|L|C
YA00161|LIKOR MALIBU 70 CL|L|C
YA00164|LIKOR KAHLUA 70 CL|L|C
YA00165|LIKOR JAGERMAISTER 70 CL|L|C
YA00168|LIKOR GARRONE TRIBLE SEC 70 CL|L|C
YA00170|LIKOR COINTREAU 70 CL|L|C
YA00172|LIKOR CARDINAL PEACH 70 CL|L|C
YA00173|LIKOR CARDINAL MELAON 70 CL|L|C
YA00174|LIKOR CAMPARI 70 CL|L|C
YA00178|LIKOR BAILEYS 70 CL|L|C
YA00179|LIKOR ARCHERS 70 CL|L|C
YA00180|LIKOR APEROL 70 CL|L|C
YA00184|LIKOR AMARETTO 70 CL|L|C
YA00187|RAKI YENI RAKI YENI SERI 70 CL|R|A
YA00193|RAKI TEKIRDAG RAKI 35 CL|R|A
YA00194|RAKI TEKIRDAG 70 CL|R|A
YA00197|ROM CAPTAIN MORGAN 70CL|S|C
YA00200|ROM BACARDI 70CL|S|C
YA00202|SR SULTANIYE|W|A
YA00204|SR ROSATO|W|A
YA00205|SR MONCIGALE BY BLASH|W|A
YA00206|SR LAL|W|A
YA00207|SR GATO NEGRO ROSE|W|A
YA00208|SR ANCYRA BLUSH|W|A
YA00209|SR SERENA PROSECCO FRIZZANTE TREV|W|A
YA00218|TEKILA OLMECA SILVER 70 CL|S|C
YA00219|TEKILA OLMECA GOLD 70 CL|S|C
YA00223|TEKILA JOSE CUERVO 70 CL|S|C
YA00225|VERMUT ROSSO|L|C
YA00228|VERMUT DRY|L|C
YA00229|VERMUT BIANCO|L|C
YA00235|VOTKA ABSOLUT VANILYA 70CL|S|C
YA00237|VOTKA ABSOLUT CITRON 70CL|S|C
YA00238|VOTKA ABSOLUT 70CL|S|C
YA00240|VOTKA ABSOLUT MANDRIN 70CL|S|C
YA00241|VOTKA ABSOLUT PEACH 70CL|S|C
YA00242|VOTKA SMIRNOFF 70CL|S|C
YA00248|EFES GLUTENSİZ 50 CL|B|A
YA00252|RAKI YENI RAKI 100CL|R|C
YA00253|VOTKA GILBEYS 70 CL|S|C
YA00254|CIN GILBEYS 70 CL|S|C
YA00257|EFES BUD 50 CL|B|A
YA00268|BIRA STELLA ARTOIS 44 CL|B|A
YI00006|BUBBLE TEA CILEK|C|K
YI00007|BUBBLE TEA ELMA|C|K
YI00008|BUBBLE TEA MANGO|C|K
YI00009|BUBBLE TEA YABAN MERSINI|C|K
YI00020|SURUP BLUE|U|A
YI00021|SURUP CIKOLATA|U|A
YI00022|SURUP CILEK|U|A
YI00023|SURUP ELMA|U|A
YI00024|SURUP FALERNUM KOKTEYL|U|L
YI00025|SURUP FINDIK|U|A
YI00027|SURUP GRANADINE|U|A
YI00029|SURUP HINDISTAN|U|A
YI00030|SURUP KARAMEL|U|A
YI00031|SURUP KARPUZ|U|A
YI00032|SURUP KAVUN|U|A
YI00033|SURUP KIWI|U|A
YI00036|SURUP LIME|U|A
YI00039|SURUP MUZ|U|A
YI00040|SURUP MURVER CICEGI|U|A
YI00041|SURUP NANE|U|A
YI00045|SURUP VANILYA|U|A
YI00047|SURUP ZENCEFIL|U|A
YI00050|CAY CHAI TEA LATTE|C|K
YI00051|CAY CILEK|C|K
YI00052|CAY DEMLIK POSET|C|K
YI00053|CAY EARLY GREY 250GR AMBALAJ|C|K
YI00054|CAY ELMA & TARCIN 250GR AMBALAJ|C|K
YI00055|CAY HUBISCUS 250GR AMBALAJ|C|K
YI00056|CAY KARAMEL 250GR AMBALAJ|C|K
YI00057|CAY KIRMIZI ORMAN MYV. 250GR AMBALAJ|C|K
YI00058|CAY KUSBURNU 250GR AMBALAJ|C|K
YI00060|CAY MAVI KELEBEK|C|K
YI00065|CAY YESIL 250GR AMBALAJ|C|K
YI00066|FRENCH VANILYA 250GR AMBALAJ|C|K
YI00067|HAZELNUT 250GR AMBALAJ|C|K
YI00068|IHLAMUR 250GR AMBALAJ|C|K
YI00069|IRIS CREAM 250GR AMBALAJ|C|K
YI00070|KAHVE CEKIRDEK|C|K
YI00071|KAHVE FILTRE|C|A
YI00072|KAHVE NESCAFE  GOLD 900 GR|C|K
YI00074|SAHLEP|C|K
YI00075|SICAK CIKOLATA|C|K
YI00077|TURK KAHVE|C|K
YI00078|TURK KAHVE D.SAKIZLI|C|K
YI00079|ADA ÇAYI 250GR AMBALAJ|C|K
YI00080|AYRAN KUTU|A|A
YI00085|COCA COLA 1 LT PET|A|A
YI00088|COLA LIGHT SISE|A|A
YI00089|COLA SISE|A|A
YI00090|COLA ZERO SISE|A|A
YI00094|DAMACANA SU|A|A
YI00095|FANTA 1 LT PET|A|A
YI00096|FANTA SISE|A|A
YI00097|FUSTEA LIMON SISE|A|A
YI00098|FUSTEA SEFTALI SISE|A|A
YI00101|LIMONATA|A|L
YI00102|MSU ANANAS 1 LT|A|L
YI00103|MSU ELMA 1 LT|A|L
YI00104|MSU KARISIK 1 LT|A|L
YI00105|MSU KAYISI 1 LT|A|L
YI00107|MSU PORTAKAL 1 LT|A|L
YI00108|MSU SEFTALI 1 LT|A|L
YI00109|MSU VISNE 1 LT|A|L
YI00113|PIN YESIL CAY|A|A
YI00114|PORTAKAL SUYU TAZE|A|L
YI00115|REDBULL|A|A
YI00116|REDBULL BLUE EDITION|A|A
YI00118|REDBULL SUGAR FREE|A|A
YI00119|REDBULL WHITE EDITION|A|A
YI00120|REDBULL YELLOW EDITION|A|A
YI00121|SCHWEPS LIMON SISE|A|A
YI00122|SCHWEPS MANDALINA SISE|A|A
YI00123|SODA ELMALI|A|A
YI00124|SODA LIMONLU|A|A
YI00127|SODA SADE|A|A
YI00129|SPRITE SISE|A|A
YI00130|SU CAM SISE 330 ML|A|A
YI00131|TONIK|A|A
YI00133|PURE KIRMIZI ORMAN MEYVELI|P|K
YI00134|PURE MANGO|P|K
YI00135|PURE PASSION FRUIT (CARKIFELEK)|P|K
YI00136|PURE SATSUMA(MANDALINA BODRUM)|P|K
YI00137|PURE SEFTALI|P|K
YI00140|PURE YESIL ELMA|P|K
YI00159|SODA PREMIUM DAMLA 330 ML|A|A
YI00161|LIKOR TRIPLE SEC|L|C
YI00162|SB SULTANIYE EMIR|W|C
YI00167|BURN|A|A`.split('\n').map(x=>x.split('|'));
const SK_MODELS=['gemini-3.8-flash','gemini-3.5-flash-lite','gemini-3.1-flash-lite'];
const SK_AICFG={apiKey:'AIzaSyDVZbP_LYbYVtmDPIR3mfQqEYs20QBLylU',authDomain:'bar-skt-takip.firebaseapp.com',projectId:'bar-skt-takip',storageBucket:'bar-skt-takip.firebasestorage.app',messagingSenderId:'667981178516',appId:'1:667981178516:web:3618e7e73f31e924d33681'};
const SK_DAY=864e5,skToday=()=>{const d=new Date();d.setHours(0,0,0,0);return d;},skPd=s=>{const a=String(s).split('-').map(Number);return new Date(a[0],a[1]-1,a[2]);},skFmt=d=>d.toLocaleDateString('tr-TR');
const skN=s=>String(s||'').toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
const skId=()=>'i'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const skOk=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&+d.slice(0,4)>=2000&&+d.slice(0,4)<=2100;
const skItems=()=>{const o=(SK.d&&SK.d.i)||{};return Object.keys(o).map(k=>Object.assign({id:k},o[k]));};
const skLogs=()=>{const o=(SK.d&&SK.d.l)||{};return Object.keys(o).map(k=>Object.assign({id:k},o[k]));};
const skGroups=()=>SK_G.concat(((SK.d&&SK.d.gr)||[]).filter(n=>SK_G.indexOf(n)<0));
const skFV=()=>firebase.firestore.FieldValue;
async function skUp(obj){await ready;const r=col('cfg').doc('skt_'+B);try{await r.update(obj);}catch(e){if(e&&e.code==='not-found'){await r.set({});await r.update(obj);}else throw e;}}
const skWho=()=>{if(!BAR.who){msg('Önce "İşlemi yapan" kişiyi seç.');return '';}return BAR.who;};
function skStatus(it){
  if(!it.skt)return{k:'none',t:'SKT girilmedi',d:99998};
  const d=Math.round((skPd(it.skt)-skToday())/SK_DAY);
  if(d<0)return{k:'bad',t:Math.abs(d)+' gün geçti',d};
  if(d===0)return{k:'bad',t:'BUGÜN',d};
  if(d<=3)return{k:'warn',t:d+' gün kaldı',d};
  return{k:'ok',t:d+' gün kaldı',d};
}
function sktSub(){
  const k=B;if(SK.key===k)return;
  if(SK.unsub){try{SK.unsub();}catch(e){}}
  SK.key=k;SK.d=null;SK.err='';
  ready.then(()=>{
    if(SK.key!==k)return;
    SK.unsub=col('cfg').doc('skt_'+k).onSnapshot(s=>{if(SK.key!==k)return;SK.d=s.exists?s.data():{};sktPaint();},e=>{SK.d={};SK.err=e.message||e.code;sktPaint();});
  });
}
function skToast(text,undo,ms){
  let t=document.getElementById('skToast');
  if(!t){t=document.createElement('div');t.id='skToast';document.body.appendChild(t);}
  t.textContent='';const sp=document.createElement('span');sp.textContent=text;t.appendChild(sp);
  if(undo){const u=document.createElement('button');u.type='button';u.textContent='↩ Geri al';u.onclick=async()=>{try{await undo();skToast('Geri alındı.');}catch(e){msg(emsg(e));}};t.appendChild(u);}
  t.style.display='flex';clearTimeout(SK.tt);SK.tt=setTimeout(()=>{t.style.display='none';},ms||9000);
}
const skNote=t=>{SK.note=t;const e=document.getElementById('skNote');if(e)e.textContent=t;};
function sktShell(){
  const tile=(k,i,t)=>'<div class="skt '+k+'" data-f="'+k+'" onclick="skTile(\''+k+'\')"><i>'+i+'</i><b id="skc_'+k+'">0</b><small>'+t+'</small></div>';
  const g=skGroups();
  let h='<div class="sksum">'+tile('bad','🔥','Geçti / bugün')+tile('warn','⏳','3 gün içinde')+tile('ok','✅','Güvenli')+tile('none','📝','SKT yok')+'</div>';
  h+='<div class="bcard"><b>'+(SK.edit?'Ürünü düzenle':'Yeni ürün ekle')+'</b>'
   +'<button class="skhero" onclick="document.getElementById(\'skPh\').click()"><span>📸</span><div><b>Etiketi fotoğrafla</b><small>Ürün ve SKT otomatik okunur</small></div></button><input type="file" id="skPh" accept="image/*" capture="environment" hidden onchange="skPhotoMain(this)">'
   +(SK.bc?'<div class="bs">Barkod: '+esc(SK.bc)+'</div>':'')+'<div id="skNote" class="bs">'+esc(SK.note)+'</div>'
   +'<label>Ürün adı</label><input value="'+esc(SK.nm)+'" placeholder="Örn. Şeker şurubu" oninput="skFld(\'nm\',this.value)">'
   +'<div class="brow"><div><label>Grup</label><select onchange="skFld(\'cat\',this.value)">'+g.map(n=>'<option'+(n==SK.cat?' selected':'')+'>'+esc(n)+'</option>').join('')+'</select></div><div style="max-width:90px"><label>Adet</label><input type="number" min="1" inputmode="numeric" value="'+esc(SK.qty)+'" oninput="skFld(\'qty\',this.value)"></div></div>'
   +'<label>SKT (son kullanma tarihi)</label><input type="date" value="'+esc(SK.skt)+'" onchange="skFld(\'skt\',this.value)">'
   +'<div class="brow" style="margin-top:10px"><button class="a an skw" style="margin:0" onclick="skSave()">'+(SK.edit?'Güncelle':'Ekle')+'</button>'+(SK.edit?'<button class="a off skw" style="margin:0" onclick="skCancel()">Vazgeç</button>':'')+'</div></div>';
  h+='<details class="bcard"><summary style="cursor:pointer;font-weight:800">Grupları yönet</summary><div class="brow" style="margin-top:8px"><input id="skGn" placeholder="Yeni grup adı"><button class="a an" style="max-width:90px" onclick="skGAdd()">Ekle</button></div><div class="bchips" style="margin-top:8px">'+((SK.d&&SK.d.gr)||[]).map(n=>'<button data-n="'+esc(n)+'" onclick="skGDel(this.dataset.n)">'+esc(n)+' ✕</button>').join('')+'</div></details>';
  h+='<div class="brow" style="margin:6px 0 8px"><select onchange="skSet(\'f\',this.value)"><option value="all">Tüm durumlar</option><option value="bad"'+(SK.f=='bad'?' selected':'')+'>Geçti/Bugün</option><option value="warn"'+(SK.f=='warn'?' selected':'')+'>3 gün içinde</option><option value="ok"'+(SK.f=='ok'?' selected':'')+'>Güvenli</option><option value="none"'+(SK.f=='none'?' selected':'')+'>SKT girilmemiş</option></select><select onchange="skSet(\'gf\',this.value)"><option value="all">Tüm gruplar</option>'+g.map(n=>'<option'+(n==SK.gf?' selected':'')+'>'+esc(n)+'</option>').join('')+'</select></div>';
  h+='<input class="skq" placeholder="🔍 Ürün ara" value="'+esc(SK.q)+'" oninput="skSet(\'q\',this.value)"><div id="skList"></div>';
  h+='<details class="bcard" style="margin-top:12px"><summary style="cursor:pointer;font-weight:800">🕘 Geçmiş: kullanılan / fire <span id="skhn" style="color:#94a3b8"></span></summary><div class="brow" style="margin-top:8px"><select onchange="skSet(\'hf\',this.value)"><option value="all">Hepsi</option><option value="kullanıldı"'+(SK.hf=='kullanıldı'?' selected':'')+'>Kullanıldı</option><option value="fire"'+(SK.hf=='fire'?' selected':'')+'>Fire</option></select><input placeholder="🔍 Ara" value="'+esc(SK.hq)+'" oninput="skSet(\'hq\',this.value)"></div><div id="skHist"></div></details>';
  h+='<input type="file" id="skItemIn" accept="image/*" capture="environment" hidden onchange="skItemRead(this)">';
  return h;
}
function sktPaint(){
  const L=document.getElementById('skList');if(!L)return;
  if(SK.d===null){L.innerHTML='<p class="sub" style="padding:10px">Yükleniyor…</p>';return;}
  if(SK.err){L.innerHTML='<div class="err">Veri okunamadı: '+esc(SK.err)+'</div>';return;}
  const rows=skItems().map(i=>({i:i,s:skStatus(i)})).sort((a,b)=>a.s.d-b.s.d||String(a.i.name).localeCompare(String(b.i.name),'tr'));
  ['bad','warn','ok','none'].forEach(k=>{const e=document.getElementById('skc_'+k);if(e)e.textContent=rows.filter(r=>r.s.k===k).length;});
  document.querySelectorAll('.skt[data-f]').forEach(t=>t.classList.toggle('on',SK.f===t.dataset.f));
  const q=skN(SK.q.trim()),v=rows.filter(r=>(SK.f=='all'||r.s.k===SK.f)&&(SK.gf=='all'||r.i.cat===SK.gf)&&(!q||skN(r.i.name).indexOf(q)>-1));
  const bt=(t,f,id,c,x)=>'<button class="skb '+(c||'')+'" data-i="'+esc(id)+'" onclick="'+f+'(this.dataset.i'+(x?',\''+x+'\'':'')+')">'+t+'</button>';
  L.innerHTML=v.length?v.map(r=>{const i=r.i,s=r.s,e=i.skt?skFmt(skPd(i.skt)):'';
    return '<div class="skit '+s.k+'"><div class="skt2"><div class="skic">'+(SK_E[i.cat]||'🍸')+'</div><div class="ski"><div class="skn">'+esc(i.name)+(i.qty>1?' ×'+i.qty:'')+'</div><div class="skm">'+esc(i.cat)+(e?' · SKT '+e:'')+(i.by&&i.by!=='Sayım listesi'?' · '+esc(i.by):'')+'</div></div><div class="sktag">'+esc(s.t)+'</div></div><div class="ska">'
     +(s.k=='none'?'<label class="skdp">📅 SKT gir<input type="date" data-i="'+esc(i.id)+'" onchange="skSetDate(this.dataset.i,this.value)"></label>':'')
     +'<div class="skbig">'+bt('✔ Kullanıldı','skRetire',i.id,'good','kullanıldı')+bt('🔥 Fire','skRetire',i.id,'fire','fire')+'</div>'
     +'<div class="skico">'+bt('<i>📷</i>SKT çek','skItemPhoto',i.id,'')+bt('<i>➕</i>Yeni parti','skItemPhoto',i.id,'','new')+bt('<i>✏️</i>Düzenle','skEdit',i.id,'')+bt('<i>🗑</i>Sil','skDel',i.id,'d')+'</div></div></div>';}).join(''):'<p class="sub" style="padding:10px">Kayıt yok.</p>';
  const hq=skN(SK.hq.trim()),lg=skLogs().sort((a,b)=>b.at-a.at),H=lg.filter(l=>(SK.hf=='all'||l.reason===SK.hf)&&(!hq||skN(l.name).indexOf(hq)>-1));
  const hn=document.getElementById('skhn');if(hn)hn.textContent='('+lg.length+')';
  const he=document.getElementById('skHist');
  if(he)he.innerHTML=H.length?H.slice(0,100).map(l=>'<div class="skhr"><div><div class="skn">'+esc(l.name)+'</div><div class="skm">'+esc(l.reason||'')+' · '+barT(l.at)+(l.partial?' · 1 adet':'')+(l.by?' · '+esc(l.by):'')+'</div></div><button class="skb good" data-i="'+esc(l.id)+'" onclick="skRestore(this.dataset.i)">↩ Geri getir</button></div>').join(''):'<p class="sub">Kayıt yok.</p>';
}
window.skFld=(k,v)=>{SK[k]=v;};
window.skSet=(k,v)=>{SK[k]=v;sktPaint();};
window.skTile=k=>{SK.f=SK.f===k?'all':k;barRe();};
window.skCancel=()=>{skReset();barRe();};
function skReset(){SK.edit='';SK.nm='';SK.qty='1';SK.skt='';SK.bc='';SK.note='';}
window.skEdit=id=>{const it=skItems().find(x=>x.id==id);if(!it)return;SK.edit=id;SK.nm=it.name;SK.cat=it.cat;SK.qty=String(it.qty||1);SK.skt=it.skt||'';SK.bc=it.barcode||'';barRe();window.scrollTo(0,0);};
window.skSave=async()=>{
  const w=skWho();if(!w)return;const name=SK.nm.trim();if(!name){msg('Ürün adı yaz.');return;}
  const rec={name:name,cat:SK.cat,qty:Math.max(1,Math.round(Number(SK.qty))||1),skt:SK.skt||'',barcode:SK.bc||''};
  try{
    if(SK.edit){const u={};Object.keys(rec).forEach(k=>{u['i.'+SK.edit+'.'+k]=rec[k];});await skUp(u);}
    else await skUp({['i.'+skId()]:Object.assign({},rec,{added:Date.now(),by:w})});
    const bc=String(rec.barcode).replace(/[^0-9A-Za-z]/g,'');
    if(bc)await skUp({['bc.'+bc]:{name:rec.name,cat:rec.cat}});
    skReset();barRe();
  }catch(e){msg(emsg(e));}
};
window.skSetDate=async(id,v)=>{if(!v)return;try{await skUp({['i.'+id+'.skt']:v});}catch(e){msg(emsg(e));}};
window.skDel=async id=>{
  const it=skItems().find(x=>x.id==id);if(!it)return;if(!confirm('"'+it.name+'" tamamen silinsin mi? (Kayıt tutulmaz)'))return;
  const snap=JSON.parse(JSON.stringify(it));delete snap.id;
  try{await skUp({['i.'+id]:skFV().delete()});if(SK.edit==id)skReset();skToast('🗑 '+it.name+' silindi',()=>skUp({['i.'+id]:snap}),12000);}catch(e){msg(emsg(e));}
};
function skPrune(){
  const L=skLogs().sort((a,b)=>a.at-b.at),lim=Date.now()-90*864e5,del=L.filter((x,k)=>x.at<lim||k<L.length-1500);
  if(!del.length)return;const u={};del.forEach(x=>{u['l.'+x.id]=skFV().delete();});skUp(u).catch(()=>{});
}
window.skRetire=async(id,reason)=>{
  const w=skWho();if(!w)return;const it=skItems().find(x=>x.id==id);if(!it)return;
  if(reason=='fire'&&!confirm('Fire (atık) olarak kaydedilsin mi?'))return;
  const lid='l'+Date.now().toString(36)+Math.random().toString(36).slice(2,4),label=(reason=='fire'?'🔥 Fire: ':'✔ Kullanıldı: ')+it.name,base={name:it.name,cat:it.cat,reason:reason,at:Date.now(),by:w,itemId:id};
  try{
    if((it.qty||1)>1){const q=it.qty;
      await skUp({['i.'+id+'.qty']:q-1,['l.'+lid]:Object.assign({},base,{qty:1,partial:true})});
      skToast(label+' (1 adet, '+(q-1)+' kaldı)',()=>skUp({['i.'+id+'.qty']:q,['l.'+lid]:skFV().delete()}),12000);skPrune();return;}
    const snap=JSON.parse(JSON.stringify(it));delete snap.id;
    await skUp({['i.'+id]:skFV().delete(),['l.'+lid]:Object.assign({},base,{qty:it.qty||1,item:snap})});
    if(SK.edit==id)skReset();
    skToast(label,()=>skUp({['i.'+id]:snap,['l.'+lid]:skFV().delete()}),12000);skPrune();
  }catch(e){msg(emsg(e));}
};
window.skRestore=async id=>{
  const l=skLogs().find(x=>x.id==id);if(!l)return;
  const rec=l.item?l.item:{name:l.name,cat:l.cat||'Diğer',qty:l.qty||1,skt:'',barcode:'',added:Date.now(),by:'Geri getirildi'},iid=l.itemId||skId();
  try{
    if(l.partial){const cur=skItems().find(i=>i.id==l.itemId);
      if(cur)await skUp({['i.'+iid+'.qty']:(cur.qty||1)+(l.qty||1),['l.'+id]:skFV().delete()});
      else await skUp({['i.'+iid]:Object.assign({},rec,{qty:l.qty||1}),['l.'+id]:skFV().delete()});}
    else await skUp({['i.'+iid]:rec,['l.'+id]:skFV().delete()});
    skToast('↩ Geri getirildi: '+l.name);
  }catch(e){msg(emsg(e));}
};
window.skGAdd=async()=>{
  const el=document.getElementById('skGn'),n=(el.value||'').trim();if(!n)return;
  if(skGroups().some(g=>g.toLowerCase()===n.toLowerCase())){msg('Bu grup zaten var.');return;}
  try{await skUp({gr:skFV().arrayUnion(n)});barRe();}catch(e){msg(emsg(e));}
};
window.skGDel=async n=>{
  if(skItems().some(i=>i.cat===n)){msg('Bu grupta ürün var. Önce taşıyın veya silin.');return;}
  if(!confirm('"'+n+'" grubu silinsin mi?'))return;
  try{await skUp({gr:skFV().arrayRemove(n)});barRe();}catch(e){msg(emsg(e));}
};
window.skImport=async()=>{
  const have=new Set(skItems().map(i=>i.code).filter(Boolean)),names=new Set(skItems().map(i=>skN(i.name)));
  const todo=SK_LIST.filter(r=>!have.has(r[0])&&!names.has(skN(r[1])));
  if(!todo.length){msg('Tüm ürünler zaten listede.');return;}
  if(!confirm(todo.length+' bar ürünü SKT\'siz olarak listeye eklensin mi? (Tarihleri sonra girersin.)'))return;
  const u={};todo.forEach(r=>{u['i.imp_'+r[0]]={name:r[1],cat:SK_CAT[r[2]]||'Diğer',qty:1,skt:'',code:r[0],unit:SK_UN[r[3]]||'',barcode:'',added:Date.now(),by:'Sayım listesi'};});
  try{await skUp(u);skToast('✅ '+todo.length+' ürün eklendi.');}catch(e){msg(emsg(e));}
};
window.skXls=()=>{
  const it=skItems().map(i=>({i:i,s:skStatus(i)})).sort((a,b)=>a.s.d-b.s.d),lg=skLogs().sort((a,b)=>b.at-a.at);
  dlX([['Ürünler',[['Kod','Ürün','Grup','Adet','SKT','Durum','Ekleyen']].concat(it.map(x=>[x.i.code||'',x.i.name,x.i.cat,x.i.qty,x.i.skt?skFmt(skPd(x.i.skt)):'',x.s.t,x.i.by||'']))],['Kullanım-Fire',[['Tarih','Ürün','Grup','Adet','Neden','İşlemi yapan']].concat(lg.map(l=>[barT(l.at),l.name,l.cat||'',l.qty,l.reason,l.by||'']))]],'BarSKT_'+BR[B].replace(/\s/g,'_')+'_'+new Date().toISOString().slice(0,10));
};
// ---- Fotoğraftan okuma (Gemini / Firebase AI Logic) ----
let SKAI=null;
async function skAI(){
  if(SKAI)return SKAI;
  const u=n=>'https://www.gstatic.com/firebasejs/11.10.0/firebase-'+n+'.js';
  const m=await Promise.all([import(u('app')),import(u('app-check')),import(u('ai'))]),A=m[0],C=m[1],I=m[2];
  self.FIREBASE_APPCHECK_DEBUG_TOKEN='62c27f1e-0f60-48b7-b076-902db9c50634';
  const app=A.initializeApp(SK_AICFG,'skt-ai');
  C.initializeAppCheck(app,{provider:new C.ReCaptchaEnterpriseProvider('debug-only'),isTokenAutoRefreshEnabled:true});
  const ai=I.getAI(app,{backend:new I.GoogleAIBackend()});
  SKAI=async(prompt,data)=>{let last;
    for(const mn of SK_MODELS){try{
      const model=I.getGenerativeModel(ai,{model:mn,generationConfig:{responseMimeType:'application/json'}});
      const r=await Promise.race([model.generateContent([prompt,{inlineData:{data:data,mimeType:'image/jpeg'}}]),new Promise((_,rej)=>setTimeout(()=>rej(new Error('Zaman aşımı: yanıt gelmedi')),30000))]);
      return JSON.parse(r.response.text().replace(/```json|```/g,'').trim());}catch(e){last=e;}}
    throw last;};
  return SKAI;
}
function skJpeg(file,max){max=max||1280;return new Promise((res,rej)=>{const img=new Image(),u=URL.createObjectURL(file);
  img.onload=()=>{const r=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*r);c.height=Math.round(img.height*r);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(u);res(c.toDataURL('image/jpeg',0.85).split(',')[1]);};
  img.onerror=()=>rej(new Error('Fotoğraf açılamadı'));img.src=u;});}
const SK_RULES='Kurallar: Tarihler gün/ay/yıl sırasıdır (23/12/2028 = 2028-12-23). Bitişik 6 haneli GGAAYY biçimi de çok yaygındır: "170926 TETT:170327" demek üretim tarihi 17.09.2026, tavsiye edilen tüketim tarihi (TETT) 17.03.2027 demektir (170327 = 2027-03-17). TETT, SKT, EXP, Son Tüketim yazan tarih "expiry", ÜRT, PRD, Üretim yazan tarih "production" alanıdır. Sadece ay/yıl varsa ayın son gününü yaz. Üretim tarihini son kullanma tarihiyle karıştırma. Okuyamadığını uydurma, null yaz.';
const skPrompt=()=>'Bu, bir bar/restoran malzemesinin (şişe, kutu, paket) etiket fotoğrafı. Etiketten şunları oku ve SADECE JSON döndür:\n{"name":"marka + ürün adı + hacim (yoksa null)","expiry":"son kullanma/tüketim tarihi YYYY-MM-DD (yoksa null)","production":"üretim tarihi YYYY-MM-DD (yoksa null)","group":"şu listeden en uygunu: '+skGroups().join(', ')+' (yoksa null)","match":"aşağıdaki MEVCUT ÜRÜN LİSTESİNDEN fotoğraftaki ürüne karşılık geleni listede yazdığı gibi AYNEN yaz; marka/çeşit/hacim açıkça uyuyorsa seç, emin değilsen null"}\n'+SK_RULES+'\nMEVCUT ÜRÜN LİSTESİ: '+skItems().map(i=>i.name).slice(0,700).join(' | ');
const SK_EXP='Bu fotoğrafta bir ürünün (şişe, kutu, paket) üzerinde tarih yazıyor olabilir. SADECE JSON döndür:\n{"expiry":"son kullanma/tüketim tarihi YYYY-MM-DD, yoksa null","production":"üretim tarihi YYYY-MM-DD, yoksa null"}\n'+SK_RULES+' Sadece üretim tarihi varsa expiry null olsun.';
window.skPhotoMain=async inp=>{
  const f=inp.files[0];inp.value='';if(!f)return;const w=skWho();if(!w)return;
  skNote('⏳ Fotoğraf okunuyor…');
  try{
    const ask=await skAI(),out=await ask(skPrompt(),await skJpeg(f)),all=skItems();
    const m=out.match?all.find(i=>skN(i.name)==skN(out.match)):null,exp=skOk(out.expiry)?out.expiry:'',name=m?m.name:(out.name?String(out.name).trim():'');
    if(m&&exp){const old=m.skt||'';await skUp({['i.'+m.id+'.skt']:exp});skNote('');skToast('✅ '+m.name+' · SKT: '+skFmt(skPd(exp))+(old?' (eski: '+skFmt(skPd(old))+')':''),()=>skUp({['i.'+m.id+'.skt']:old}),10000);return;}
    if(!m&&name&&exp){const id=skId(),g=out.group&&skGroups().indexOf(out.group)>-1?out.group:SK.cat;
      await skUp({['i.'+id]:{name:name,cat:g,qty:1,skt:exp,barcode:'',added:Date.now(),by:w}});skNote('');
      skToast('✅ Yeni ürün eklendi: '+name+' · SKT: '+skFmt(skPd(exp)),()=>skUp({['i.'+id]:skFV().delete()}),10000);return;}
    if(name&&!SK.edit)SK.nm=name;if(out.group&&skGroups().indexOf(out.group)>-1)SK.cat=out.group;if(exp)SK.skt=exp;
    SK.note=exp?'⚠ SKT okundu: '+skFmt(skPd(exp))+' · ürün adı bulunamadı: ön yüzü fotoğraflayın veya elle yazın.':(name?'⚠ Ürün: '+name+' · SKT bulunamadı: tarihin yazılı olduğu yüzü fotoğraflayın veya elle girin.':'⚠ Okunamadı, daha net/yakından çekin.');
    barRe();
  }catch(e){skNote('Okunamadı: '+(e.message||e.code||e));}
};
window.skItemPhoto=(id,mode)=>{SK.tgt=id;SK.mode=mode||'set';document.getElementById('skItemIn').click();};
window.skItemRead=async inp=>{
  const f=inp.files[0];inp.value='';const id=SK.tgt,mode=SK.mode;SK.tgt='';SK.mode='set';const it=skItems().find(x=>x.id==id);if(!f||!it)return;
  const w=skWho();if(!w)return;
  skToast('⏳ '+it.name+': tarih okunuyor…',null,60000);
  try{
    const ask=await skAI(),out=await ask(SK_EXP,await skJpeg(f));
    if(!skOk(out.expiry)){skToast('⚠ '+it.name+': SKT okunamadı. Tarihin yazılı yerini daha net çekin veya elle girin.',null,10000);return;}
    if(mode==='new'){const nid=skId();
      await skUp({['i.'+nid]:{name:it.name,cat:it.cat,qty:1,skt:out.expiry,code:it.code||'',unit:it.unit||'',barcode:it.barcode||'',added:Date.now(),by:w}});
      skToast('✅ Yeni parti eklendi: '+it.name+' · SKT: '+skFmt(skPd(out.expiry)),()=>skUp({['i.'+nid]:skFV().delete()}),10000);return;}
    const old=it.skt||'';await skUp({['i.'+id+'.skt']:out.expiry});
    skToast('✅ '+it.name+' · SKT: '+skFmt(skPd(out.expiry)),()=>skUp({['i.'+id+'.skt']:old}),10000);
  }catch(e){skToast('Okunamadı: '+(e.message||e.code||e),null,12000);}
};
// ---- Barkod ----
async function skLookup(code){
  SK.bc=code;const key=String(code).replace(/[^0-9A-Za-z]/g,''),k=SK.d&&SK.d.bc&&SK.d.bc[key];
  if(k){SK.nm=k.name;if(skGroups().indexOf(k.cat)>-1)SK.cat=k.cat;SK.note='Barkod kayıtlı ürün bulundu.';barRe();return;}
  SK.note='Barkod aranıyor…';barRe();
  try{const r=await fetch('https://world.openfoodfacts.org/api/v2/product/'+code+'.json?fields=product_name,brands'),j=await r.json();
    if(j.status===1&&j.product&&(j.product.product_name||j.product.brands)){SK.nm=[j.product.brands&&j.product.brands.split(',')[0],j.product.product_name].filter(Boolean).join(' ');SK.note='Ürün bulundu, kontrol edin.';barRe();return;}}catch(e){}
  SK.note='Ürün bulunamadı, adını yazın (bir sonraki sefer hatırlanır).';barRe();
}
window.skScanX=async()=>{const ov=document.getElementById('skScan');if(ov)ov.style.display='none';if(SK.sc){try{await SK.sc.stop();SK.sc.clear();}catch(e){}SK.sc=null;}};
window.skScan=async()=>{
  if(typeof Html5Qrcode==='undefined'){
    await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';s.onload=ok;s.onerror=()=>no(new Error('Barkod kütüphanesi yüklenemedi'));document.head.appendChild(s);}).catch(e=>msg(e.message));
    if(typeof Html5Qrcode==='undefined')return;
  }
  let ov=document.getElementById('skScan');
  if(!ov){ov=document.createElement('div');ov.id='skScan';ov.style.cssText='position:fixed;inset:0;background:#000;z-index:60;display:flex;flex-direction:column;padding:16px;gap:12px;color:#fff';ov.innerHTML='<b>Barkodu kameraya tutun</b><div id="skReader" style="flex:1;min-height:0"></div><button class="a off" onclick="skScanX()">Kapat</button>';document.body.appendChild(ov);}
  ov.style.display='flex';
  SK.sc=new Html5Qrcode('skReader',{experimentalFeatures:{useBarCodeDetector:true}});
  try{await SK.sc.start({facingMode:'environment'},{fps:10,qrbox:{width:260,height:160}},async code=>{await skScanX();skLookup(code);},()=>{});}
  catch(e){await skScanX();msg('Kamera açılamadı. Tarayıcıda kamera iznini verin.');}
};
const styKT=document.createElement('style');
styKT.textContent='.sksum{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}.skt{border-radius:16px;padding:10px 4px 9px;text-align:center;border:1px solid rgba(148,163,184,.18);background:#172033;cursor:pointer}.skt i{font-style:normal;font-size:17px;display:block}.skt b{display:block;font-size:22px;font-weight:800;margin-top:2px}.skt small{display:block;font-size:10.5px;color:#94a3b8}.skt.bad b{color:#ff5273}.skt.warn b{color:#ffc83d}.skt.ok b{color:#2ee6a6}.skt.none b{color:#9a93bb}.skt.on{box-shadow:0 0 0 2px #f472b6}.skw{width:100%;margin-top:8px}.skq{width:100%;box-sizing:border-box;background:#0f172a;color:#fff;border:1px solid #334155;border-radius:12px;padding:11px;font-size:15px;margin-bottom:10px}.skit{background:#172033;border:1px solid rgba(148,163,184,.14);border-radius:16px;padding:10px;margin-bottom:9px}.skit.bad{border-color:rgba(255,82,115,.5)}.skt2{display:flex;align-items:center;gap:10px}.skic{flex:none;width:42px;height:42px;border-radius:13px;display:grid;place-items:center;font-size:22px;background:rgba(154,147,187,.2)}.skit.ok .skic{background:rgba(46,230,166,.2)}.skit.warn .skic{background:rgba(255,200,61,.22)}.skit.bad .skic{background:rgba(255,82,115,.24)}.ski{flex:1;min-width:0}.skn{font-weight:700;font-size:15px;line-height:1.25;word-break:break-word}.skm{font-size:12px;color:#94a3b8;margin-top:2px}.sktag{flex:none;font-size:11px;font-weight:800;padding:4px 9px;border-radius:999px;background:rgba(154,147,187,.2);color:#9a93bb;white-space:nowrap}.skit.ok .sktag{background:rgba(46,230,166,.18);color:#2ee6a6}.skit.warn .sktag{background:rgba(255,200,61,.2);color:#ffc83d}.skit.bad .sktag{background:rgba(255,82,115,.22);color:#ff5273}.ska{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px;align-items:center}.skb{border:1px solid rgba(148,163,184,.25);background:#0f172a;color:#e2e8f0;border-radius:999px;padding:7px 12px;font-size:12.5px;font-weight:700}.skb.cam{background:linear-gradient(135deg,#22d3ee,#7c5cff);border:0;color:#fff}.skb.good{color:#2ee6a6;border-color:rgba(46,230,166,.4)}.skb.fire{color:#ff9f43;border-color:rgba(255,159,67,.4)}.skb.d{color:#ff5273;border-color:rgba(255,82,115,.4)}.skdp{display:flex;align-items:center;gap:6px;font-size:12.5px;background:#0f172a;border:1px solid rgba(148,163,184,.25);border-radius:999px;padding:3px 4px 3px 12px;margin:0}.skdp input{width:auto;padding:4px 6px;border-radius:999px;font-size:12.5px}.skhr{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-top:1px solid rgba(148,163,184,.15)}#skToast{position:fixed;left:12px;right:12px;bottom:14px;background:#1e1b4b;color:#fff;border:1px solid rgba(255,255,255,.2);padding:12px 14px;border-radius:16px;z-index:70;display:none;font-size:14px;align-items:center;gap:10px;justify-content:space-between;box-shadow:0 10px 30px rgba(0,0,0,.5)}#skToast button{width:auto;padding:7px 12px;font-size:13px;border-radius:999px;background:linear-gradient(135deg,#f43f5e,#fb923c);color:#fff;border:0;white-space:nowrap}';
document.head.appendChild(styKT);
const styKT2=document.createElement('style');
styKT2.textContent='.sksum .skt{background:linear-gradient(160deg,#1e293b,#0f172a);box-shadow:0 6px 16px rgba(0,0,0,.25)}.skt.bad{background:linear-gradient(160deg,rgba(255,82,115,.28),rgba(15,23,42,.9))}.skt.warn{background:linear-gradient(160deg,rgba(255,200,61,.26),rgba(15,23,42,.9))}.skt.ok{background:linear-gradient(160deg,rgba(46,230,166,.24),rgba(15,23,42,.9))}.skhero{width:100%;display:flex;align-items:center;gap:12px;margin:10px 0 4px;padding:14px;border:0;border-radius:18px;background:linear-gradient(135deg,#22d3ee,#6366f1 55%,#a855f7);color:#fff;text-align:left;box-shadow:0 10px 24px rgba(99,102,241,.38)}.skhero span{font-size:30px}.skhero b{display:block;font-size:16px}.skhero small{display:block;font-size:12px;opacity:.85;margin-top:2px}.skit{border-radius:20px;padding:12px;box-shadow:0 6px 18px rgba(0,0,0,.25)}.ska{display:block}.skdp{margin-bottom:8px;width:max-content}.skbig{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.skbig .skb{padding:12px;border-radius:14px;font-size:14.5px;font-weight:800;border:0;color:#fff}.skbig .skb.good{background:linear-gradient(135deg,#10b981,#047857)}.skbig .skb.fire{background:linear-gradient(135deg,#fb923c,#dc2626)}.skico{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:8px}.skico .skb{border-radius:14px;padding:8px 2px;font-size:11px;font-weight:700;background:#0f172a;border:1px solid rgba(148,163,184,.22);color:#cbd5e1;display:flex;flex-direction:column;align-items:center;gap:3px}.skico .skb i{font-style:normal;font-size:19px;line-height:1}.skico .skb.d{color:#fb7185;border-color:rgba(251,113,133,.35)}';
document.head.appendChild(styKT2);

const d2=window.draw;window.draw=function(){d2();barWatch();radioAdmin();pgSync();};
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
sty2.textContent+='.sv2l{font-size:12px;color:#e2e8f0;margin-top:3px;line-height:1.35}.sv2{font-weight:700;color:#fde68a;white-space:nowrap}.mlr{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #334155}.mlr small{display:block;color:#94a3b8;font-size:12px}.mlr span{font-weight:800;font-size:22px;color:#4ade80;font-variant-numeric:tabular-nums}.mlr span.late{color:#f87171}.xl.svt{min-width:0!important;font-size:12px}.xl.svt th,.xl.svt td{white-space:normal;padding:6px 4px}.xl.svt td.svd{text-align:left;white-space:nowrap}.ptag{flex:none;min-width:46px;text-align:center;background:#312e81;color:#e0e7ff;border-radius:10px;padding:10px 6px;font-size:14px}.psel{flex:1;min-width:0;padding:11px;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#fff;font-size:15px}';
document.head.appendChild(sty2);

// ===== Yönetici paneli =====
const rowH=s=>{
  const left=Math.max(0,D.total-usedOf(s));
  const bd=s.off?['İzinli','o']:(s.on===false?['Vardiya dışı','n']:(s.turn?['Sırada','y']:(s.bitti?['Molalar bitti','g']:['Vardiyada','g'])));
  return `<div class="row"><b class="av ${s.off||s.on===false?'dim':''}" data-p="${s.id}" onclick="phMenu('${s.id}')">${esc(ini(s.name))}</b><div class="rm"><div class="rn">${esc(nice(s.name))}</div><div class="rs"><span class="bd ${bd[1]}">${bd[0]}</span>${s.shTxt?'🕗 '+esc(s.shTxt.replace('-','–'))+' · ':''}☕ ${left} dk</div></div><button class="more bell" onclick="msgStaff('${s.id}')">🔔</button><button class="more" onclick="sheet('${s.id}')">⋯</button></div>`;
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
  const hasSec=S.some(s=>s.sec),G=[],gm={};
  rest.forEach(s=>{const k=s.sec?s.sec:(hasSec?'VARDİYA LİSTESİNDE OLMAYANLAR':'PERSONEL');if(!gm[k]){gm[k]={k:k,o:s.sec?(s.ord||1e9):2e9,l:[]};G.push(gm[k]);}gm[k].l.push(s);});
  G.sort((a,b)=>a.o-b.o);
  G.forEach(g=>{h+='<div class="sec2">'+esc(g.k)+' <span>'+g.l.length+'</span></div><div class="rows">'+g.l.map(rowH).join('')+'</div>';});
  if(!G.length)h+='<p class="sub">Şubede personel yok. ➕ Personel ekle ile başla.</p>';
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
const d3=window.draw;window.draw=function(){if(M=='y')radioListen('');if(M=='y'&&D){window.hideLogin&&hideLogin();try{admDraw();}catch(e){$('list').innerHTML='<div class="err">'+esc(emsg(e))+'</div>';}pgSync();}else d3();};
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
  return '<div class="pod">'+o.map(i=>{const x=it[i];return `<div class="pd g${i+1}"><div class="pm">${i==0?'🏆':''}</div><b class="av big" data-nm="${esc(x.name)}">${esc(ini(x.name))}</b><div class="pn">${esc(nice(x.name).split(' ')[0])}</div><div class="pv">${x.val}</div><div class="ps">${x.sub||''}</div><div class="pb" style="height:${h[i]}px">${mk[i]}</div></div>`;}).join('')+'</div>';
}
function lbRow(rk,r,main,sub,pct,cls,trend,key,adm,kd){
  return `<div class="lr ${trend&&trend.indexOf('d">')>0?'dn':''}"><span class="rk">${rk}</span><b class="av" data-nm="${esc(r.name)}">${esc(ini(r.name))}</b><div class="lm"><div class="ln">${esc(nice(r.name))}${trend||''}</div><div class="ls">${sub}</div><div class="bar"><i class="${cls}" style="width:${Math.max(5,Math.min(100,pct))}%"></i></div></div><div class="lv">${main}</div>${adm?`<div class="rb"><button class="x2" data-k="${esc(key)}" onclick="${kd=='b'?'editBeer':(kd=='k'?'editCat':'editRep')}(this.dataset.k)">✏️</button><button class="x2" data-k="${esc(key)}" onclick="${kd=='b'?'beerDel':(kd=='k'?'catDel':'rptDel')}(this.dataset.k)">✕</button></div>`:''}</div>`;
}
function lbCiro(L,adm,sub){
  const ci=sub=='ciro',val=r=>Number(ci?r.ciro:r.ort);L=L.slice().sort((a,b)=>val(b)-val(a));
  const n=L.length,mx=val(L[0])||1,tc=L.reduce((a,r)=>a+Number(r.ciro||0),0),th=L.reduce((a,r)=>a+Number(r.hesap||0),0),low=Math.min(4,Math.max(0,n-3)),avg=th?tc/th:0;
  const top=r=>ci?fmt(Math.round(r.ciro))+' TL':tl2(r.ort)+' TL';
  let h='<div class="kp">'+(ci?'<div><b>'+fmt(Math.round(tc))+'</b><span>Toplam ciro (TL)</span></div><div><b>'+tl2(avg)+'</b><span>Takım ortalaması</span></div>':'<div><b>'+tl2(avg)+'</b><span>Takım ortalaması (TL)</span></div><div><b>'+fmt(th)+'</b><span>Toplam hesap</span></div>')+'<div><b>'+n+'</b><span>Garson</span></div></div>';
  h+='<div class="hot">🔥 '+esc(nice(L[0].name))+' zirvede! '+(ci?'Ciroda yükselmek için satışa devam.':'Sıralamada yükselmek için hesap başına ortalamanı artır.')+'</div>';
  h+=podium(L.slice(0,3).map(r=>({name:r.name,val:top(r),sub:ci?'ort. '+tl2(r.ort)+' TL':fmt(r.hesap)+' hesap · ciro '+fmt(Math.round(r.ciro))+' TL'})));
  h+='<div class="lb">'+L.map((r,i)=>{
    if(!adm&&i<3)return '';
    const rk=i+1,dn=rk>n-low,tp=i<3;
    return lbRow(rk,r,(ci?fmt(Math.round(r.ciro)):tl2(r.ort))+'<small>TL</small>',ci?'ort. '+tl2(r.ort)+' TL · '+fmt(r.hesap)+' hesap':fmt(r.hesap)+' hesap · ciro '+fmt(Math.round(r.ciro))+' TL'+(i?' · lidere '+tl2(mx-r.ort)+' TL':''),val(r)/mx*100,dn?'r':(tp?'g':'o'),dn?'<span class="tr d">▼ Düşüşte</span>':(tp?'<span class="tr u">▲ Zirvede</span>':''),r.key,adm,'c');
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
const ANS='data:audio/wav;base64,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';
window.playAnons=()=>{try{const a=new Audio(ANS);a.volume=1;const p=a.play();if(p&&p.catch)p.catch(()=>{});return a;}catch(e){return null;}};
window.testAnons=()=>{perm(true);const a=playAnons();if(!a){msg('Ses çalınamadı');return;}a.onerror=()=>msg('Çan sesi çalınamadı.');};
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
function admBar(){return '<div class="admbar"><button class="a an full" style="min-height:58px;font-size:16px" onclick="radioUI()">📻 Telsiz · konuş</button><button class="a off" onclick="msgPick()">🔔 Mesaj gönder</button><button class="a ed" onclick="postaUI()">📋 Postalar</button><button class="a x full" onclick="admMenu()">☰ Yönetim menüsü</button></div>';}
window.admMenu=()=>{
  const it=(i,t,s,f)=>'<button class="mi" onclick="$(\'ov\').hidden=true;'+f+'"><i>'+i+'</i><span>'+t+(s?'<small>'+s+'</small>':'')+'</span></button>';
  pop('☰ Yönetim menüsü',
    '<div class="mgrp">RAPORLAR</div>'+it('💰','Ciro Excel yükle','Satış ve ortalama','ciroXlsPick()')+it('🍺','Ürün Excel yükle','Bira ve ürün grupları','aiUI()')
    +'<div class="mgrp">PERSONEL</div>'+it('➕','Personel ekle','','add()')+it('↻','Günü sıfırla','Tüm molaları sıfırlar','reset()')
    +'<div class="mgrp">SES VE ANONS</div>'+it('🔊','Anons testi','','testAnons()')+it('🎙','İsim kayıtları','','vList()')
    +'<div class="mgrp">SİSTEM</div>'+(window.__ADM&&window.__ADM.role=='owner'?it('👥','Yöneticiler','Ekle, çıkar, şifre','admUsers()'):'')+it('🔑','Şifremi değiştir','Yönetici giriş şifresi','admPass()')+it('⚙','Ayarlar','','admSet()'));
  $('mo').textContent='Kapat';$('mc').style.display='none';
};
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
sty6.textContent+='.mgrp{font-size:11px;letter-spacing:.12em;color:#fca5a5;margin:14px 2px 6px;font-weight:800}.mgrp:first-child{margin-top:0}.mi{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;border:1px solid rgba(254,202,202,.14);background:rgba(255,255,255,.05);color:#fff;border-radius:14px;font-size:15px;font-weight:700;text-align:left;margin-bottom:6px}.mi:active{background:rgba(254,202,202,.12)}.mi i{font-style:normal;font-size:20px;width:26px;text-align:center}.mi small{display:block;color:#b9a7aa;font-size:12px;font-weight:500;margin-top:1px}';document.head.appendChild(sty6);

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
    const c=null,gen=()=>{AU.onended=null;AU.onerror=null;AU.src=ANS;const p=AU.play();if(p&&p.catch)p.catch(()=>{});};
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
window.radioUI=pre=>{
  const S=D.staff.filter(s=>!s.off).sort((a,b)=>a.name.localeCompare(b.name,'tr'));
  pop('📻 Telsiz · '+BR[B],'<p class="sub" style="margin:0 0 10px;line-height:1.5">Kime konuşacaksın? Konuş\'a bas, söyleyeceğini söyle, tekrar basıp gönder (en çok 12 sn).</p><select id="rto" class="rsel"><option value="all">📢 Tüm personel</option>'+S.map(s=>`<option value="${s.id}">${esc(nice(s.name))}</option>`).join('')+'</select><button id="rbt" class="a an rbig" onclick="radioTalk()">🎙 Konuş</button><div id="rst" class="sub" style="margin-top:10px;text-align:center"></div>');
  $('mo').textContent='Kapat';if(pre&&$('rto'))$('rto').value=pre;
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
  el.innerHTML='<b>📻 Telsiz mesajı</b><button onclick="radioAgain()">▶ Dinle</button><button id="rrb" style="background:#22c55e;color:#fff" onclick="radioReply()">🎙 Cevap ver</button><button onclick="document.getElementById(\'rdo\').remove()">✕</button>';
  clearTimeout(window.__rt);window.__rt=setTimeout(()=>{const e=document.getElementById('rdo');if(e)e.remove();},30000);
}
function radioPlay(m){
  window.__rlast=m;
  try{navigator.vibrate&&navigator.vibrate([300,150,300]);}catch(e){}
  try{RA.pause();RA.muted=false;RA.volume=1;RA.src=m.a;const p=RA.play();if(p&&p.catch)p.catch(()=>{});}catch(e){}
  rbn();
}
let RRP=null;
window.radioReply=async()=>{
  const btn=document.getElementById('rrb');if(!btn)return;
  if(RRP){try{RRP.mr.stop();}catch(e){}return;}
  if(!navigator.mediaDevices||!window.MediaRecorder){msg('Bu tarayıcı ses kaydını desteklemiyor');return;}
  let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:true});}catch(e){msg('Mikrofon izni verilmedi');return;}
  clearTimeout(window.__rt);
  const ch=[],mr=new MediaRecorder(stream);let tm=null,sec=0;RRP={mr:mr};
  mr.ondataavailable=e=>{if(e.data&&e.data.size)ch.push(e.data);};
  mr.onstop=async()=>{
    clearInterval(tm);stream.getTracks().forEach(t=>t.stop());RRP=null;
    let b=document.getElementById('rrb');
    if(!ch.length){if(b)b.textContent='🎙 Cevap ver';return;}
    try{
      if(b)b.textContent='Gönderiliyor…';
      const wav=await tWav(new Blob(ch,{type:mr.mimeType||'audio/webm'}),11025);
      await gs('replyRadio',getMe(),B,wav);
      b=document.getElementById('rrb');if(b)b.textContent='✅ Gönderildi';
      setTimeout(()=>{const e=document.getElementById('rdo');if(e)e.remove();},2500);
    }catch(e){b=document.getElementById('rrb');if(b)b.textContent='🎙 Cevap ver';msg(emsg(e));}
  };
  mr.start();btn.textContent='⏹ Bitir ve gönder (0 sn)';
  tm=setInterval(()=>{sec++;const b=document.getElementById('rrb');if(b)b.textContent='⏹ Bitir ve gönder ('+sec+' sn)';if(sec>=12){try{mr.stop();}catch(e){}}},1000);
};
function radioGot(m,sid){
  window.__rrlast=m;
  try{navigator.vibrate&&navigator.vibrate([200,100,200]);}catch(e){}
  try{RA.pause();RA.muted=false;RA.volume=1;RA.src=m.a;const p=RA.play();if(p&&p.catch)p.catch(()=>{});}catch(e){}
  let el=document.getElementById('rda');if(!el){el=document.createElement('div');el.id='rda';el.className='rdo';el.style.top='72px';document.body.appendChild(el);}
  el.innerHTML='<b>📻 '+esc(nice(m.from||'Personel'))+' cevap verdi</b><button onclick="try{RA.pause();RA.src=window.__rrlast.a;RA.play();}catch(e){}">▶ Dinle</button><button style="background:#22c55e;color:#fff" data-i="'+esc(sid)+'" onclick="radioUI(this.dataset.i);document.getElementById(\'rda\').remove()">🎙 Yanıtla</button><button onclick="document.getElementById(\'rda\').remove()">✕</button>';
}
window.radioAdmin=()=>{
  const key=(M=='y'&&D)?B:'';
  if(window.__radk===key)return;
  if(window.__radu){try{window.__radu();}catch(e){}window.__radu=null;}
  window.__radk=key;if(!key)return;
  window.__radu=col('radio').where('to','==','admin_'+key).onSnapshot(sn=>{
    sn.docChanges().forEach(c=>{
      if(c.type==='removed')return;const m=c.doc.data(),id=c.doc.id;if(!m||!m.a)return;
      let seen=0;try{seen=+(localStorage.getItem('mola_rre_'+id)||0);}catch(e){}
      if(m.t<=seen)return;try{localStorage.setItem('mola_rre_'+id,String(m.t));}catch(e){}
      if(Date.now()-m.t<300000)radioGot(m,id.slice(3));
    });
  },()=>{});
};
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
    return `<div class="lr"><b class="av" data-nm="${esc(p.name)}">${esc(ini(p.name))}</b><div class="lm"><div class="ln">${esc(nice(p.name))}<span class="tr u">${gIco(b.g)} ${esc(b.g)} ${med(b.rank)}</span></div><div class="ls">${fmt(b.v)} adet · ortalamanın ${pc>=0?'%'+pc+' üstünde':'%'+(-pc)+' altında'}${oth?'<br>Ayrıca: '+oth:''}</div></div></div>`;
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
  h+='<div class="hi"><b data-nm="'+esc(s0.name)+'">'+esc(ini(s0.name))+'</b><div><div class="hi1">'+esc(nice(s0.name))+'</div><div class="hi2">Toplam '+fmt(tot)+' adet</div></div></div>';
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
  return '';
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
const SV={pin:'',cur:svIso(new Date()),routes:[],days:{},draft:{r:[],n:''},dirty:false,loaded:'',t:0,busy:false,msg:''};
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
window.svMe=()=>{const m=((D&&D.staff)||[]).find(x=>x.id==getMe());if(!m)return false;const n=skN(m.name);return n.indexOf('gulkan')>-1&&n.indexOf('korkusuz')>-1;};
window.svUnlock_old=()=>ask('🚌 Servis girişi',[{label:'Şifre',type:'password'}],v=>{gs('srvPin',v[0].trim()).then(()=>{SV.pin=v[0].trim();svRe();}).catch(e=>msg(emsg(e)));},'Giriş');
window.svLock=()=>{SV.pin='';svRe();};
window.svNote=v=>{SV.draft.n=v;SV.dirty=true;const b=$('svsave');if(b){b.textContent='Kaydet (değişiklik var)';b.classList.add('dirty');}};
window.svClear=()=>{SV.draft={r:[],n:''};SV.dirty=true;svRe();};
window.svSave=async function(){
  if(SV.busy)return;
  const r=SV.draft.r.filter(Boolean),n=SV.draft.n.trim();
  SV.busy=true;SV.msg='Kaydediliyor…';svRe();
  try{
    if(!(M=='y'||svMe())){msg('Servis girişini sadece Gülkan Korkusuz ve yönetici yapabilir.');return;}await gs('saveServisDay',B,SV.cur,r,n,M=='y'?PIN:'');
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
    h+='<div class="svb">'+SVG[d.getDay()]+', '+svFmt(d)+'</div><div class="svch">'+SV.routes.map(r=>{const on=SV.draft.r.indexOf(r)>-1;return `<button class="${on?'on':''}" data-r="${esc(r)}" onclick="svTog(this.dataset.r)">${on?'✓ ':''}${esc(r)}</button>`;}).join('')+(M=='y'?'<button class="add" onclick="svRoutes()">✏️ Güzergah ekle / düzenle</button>':'')+'</div>';
    h+='<input class="svnote" placeholder="Not (servis, plaka, şoför…)" value="'+esc(SV.draft.n)+'" oninput="svNote(this.value)">';
    h+='<button id="svsave" class="a an svsave'+(SV.dirty?' dirty':'')+'" onclick="svSave()"'+(SV.busy?' disabled':'')+'>'+(SV.dirty?'Kaydet (değişiklik var)':'Kaydet')+'</button><div class="svst">'+esc(SV.msg)+'</div>';
    h+='<div class="svrow"><button class="a x" onclick="svClear()">Bu günü temizle</button><button class="a ed" onclick="svToday()">Bugün</button></div></div>';
  }
  h+='<div class="svn" style="margin-top:14px"><button class="x2 w" onclick="svMon(-1)">‹</button><div class="svm">'+SVM[d.getMonth()]+' '+d.getFullYear()+' raporu</div><button class="x2 w" onclick="svMon(1)">›</button></div>';
  const cs=Object.keys(cnt);
  h+='<div class="svs">'+(cs.length?cs.map(r=>'<span><b>'+esc(r)+'</b> '+cnt[r]+' gün</span>').join(''):'<span>Bu ay henüz kayıt yok</span>')+'</div>';
  h+='<div style="overflow:auto"><table class="xl svt"><tr><th>Gün</th><th>Güzergah</th><th>Not</th></tr>'+R.map(x=>'<tr'+(x.k===SV.cur?' style="outline:2px solid #6366f1;outline-offset:-2px"':'')+(adm?' onclick="svPick(\''+x.k+'\')"':'')+'><td class="svd"><b>'+svFmt(x.d).slice(0,5)+'</b> '+SVG[x.d.getDay()].slice(0,3)+'</td><td'+(x.r.length?'':' style="color:#64748b"')+'>'+(x.r.length?esc(x.r.join(' - ')):'—')+'</td><td>'+esc(x.n)+'</td></tr>').join('')+'</table></div>';
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
const styV=document.createElement('style');styV.textContent='.xl td.secr{background:#312e81!important;color:#e0e7ff!important;font-weight:800;letter-spacing:.12em;text-align:left;padding:8px 10px;position:sticky;left:0}';document.head.appendChild(styV);
const styS=document.createElement('style');
styS.textContent='.svc{background:#172033;border:1px solid rgba(148,163,184,.14);border-radius:16px;padding:12px}.svn{display:flex;gap:8px;align-items:center}.svn input{flex:1;min-width:0;padding:11px;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#fff;font-size:16px}.svn .x2{width:44px;height:44px;font-size:20px}.svm{flex:1;text-align:center;font-weight:800;font-size:15px}.svb{font-weight:800;font-size:18px;margin:12px 2px 4px}.svch{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.svch button{border:1.5px solid #475569;background:transparent;color:#e2e8f0;padding:11px 16px;border-radius:999px;font-size:16px}.svch button.on{background:#14532d;border-color:#4ade80;color:#bbf7d0;font-weight:700}.svch button.add{border-style:dashed;color:#94a3b8;font-size:14px}.svnote{width:100%;margin-top:12px;padding:11px;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#fff;font-size:16px}.svsave{width:100%;margin-top:12px}.svsave.dirty{background:#c77700!important}.svst{font-size:13px;color:#94a3b8;margin-top:8px;min-height:18px}.svrow{display:flex;gap:8px;margin-top:8px}.svrow .a{flex:1}.svs{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.svs span{background:#172033;border:1px solid rgba(148,163,184,.18);border-radius:999px;padding:6px 12px;font-size:13px}.svs b{color:#4ade80}';
document.head.appendChild(styS);

// ===== Personel ekranı: bugünün ve yarının vardiyası =====
const istIso=off=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date(Date.now()+off*864e5));
window.shiftOf=(s,key)=>{   // 'YYYY-MM-DD' -> 'HH:MM-HH:MM' | '' (izin) | undefined (bilinmiyor)
  if(s.shd&&(key in s.shd))return s.shd[key];
  if(!s.sh)return undefined;
  return s.sh[(new Date(key+'T00:00:00Z').getUTCDay()+6)%7];
};
const stfAll=()=>((typeof D!='undefined'&&D&&D.staff)||[]);
window.shdInfo=key=>{   // son yüklenen hafta ve (varsa) verilen tarihin yüklü olup olmadığı
  let mx='';stfAll().forEach(s=>{if(s.shd)Object.keys(s.shd).forEach(k=>{if(k>mx)mx=k;});});
  if(!mx)return null;
  const d=new Date(mx+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
  const from=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);
  return {from:from,to:d.toISOString().slice(0,10),cov:key?stfAll().some(s=>s.shd&&(key in s.shd)):true};
};
window.weekNote=()=>{   // bu hafta için vardiya yüklenmemişse uyarı
  const inf=window.shdInfo();if(!inf)return '';
  const t=new Date(istIso(0)+'T00:00:00Z');t.setUTCDate(t.getUTCDate()-(t.getUTCDay()+6)%7);
  for(let i=0;i<7;i++){const k=t.toISOString().slice(0,10);if(stfAll().some(s=>s.shd&&(k in s.shd)))return '';t.setUTCDate(t.getUTCDate()+1);}
  const f=x=>x.slice(8)+'.'+x.slice(5,7);
  return '<div class="hot" style="margin-bottom:10px;text-align:left">⚠ Yüklü vardiya <b>'+f(inf.from)+' – '+f(inf.to)+'</b> haftasına ait. Bu haftanın Excel\'ini yükle. Şimdilik o haftanın düzeni tekrar ediyor.</div>';
};
function shiftTwo(s){
  if(!s.shd&&!s.sh)return '';
  const f=k=>{const v=window.shiftOf(s,k);return v===undefined?'—':(v?esc(v.replace('-','–')):'İzin');};
  return '<div class="sv2l">🕗 Bugün <span class="sv2">'+f(istIso(0))+'</span> · Yarın <span class="sv2">'+f(istIso(1))+'</span></div><div class="sv2l" id="hipost"></div>';
}

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
  pop('🍺 Ürün grupları raporu · AI20', '<p class="sub" style="margin:0 0 10px;line-height:1.5">Kasa programından aldığın <b>Personel Ürün Satış Raporu</b> Excel dosyasını (.xls / .xlsx) seç. Ürünler gruplara ayrılır, her personel için grup toplamı çıkar. Tabloyu Excel olarak indirebilir ya da garsonlar da görsün diye kaydedebilirsin.</p><div class="shg"><button class="a ed" onclick="aiPick()">📎 Excel dosyasını seç <span id="aic"></span></button><button class="a an" onclick="aiRun()">📊 Tabloyu oluştur</button><button class="a off" onclick="grpUI()">🧩 Grup ekle / düzenle (kod → grup)</button></div><div id="aio" style="margin-top:12px"></div>', true);
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
const TRM = { OCAK: 1, SUBAT: 2, MART: 3, NISAN: 4, MAYIS: 5, HAZIRAN: 6, TEMMUZ: 7, AGUSTOS: 8, EYLUL: 9, EKIM: 10, KASIM: 11, ARALIK: 12 };
const monthOf = w => { const k = Object.keys(TRM).find(m => m.indexOf(w) == 0 || w.indexOf(m) == 0); return k ? TRM[k] : 0; };
function dateOf(v, yr) {      // hücre -> 'YYYY-MM-DD' (seri no, 06.11.2026, 2026-11-06, "6 Kasım", "6 KAS 2026")
  if (typeof v == 'number') return v > 30000 && v < 80000 ? new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10) : '';
  const t = fold(v); if (!t) return '';
  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return m[1] + '-' + pad2(+m[2]) + '-' + pad2(+m[3]);
  m = t.match(/(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{4})/); if (m) return m[3] + '-' + pad2(+m[2]) + '-' + pad2(+m[1]);
  m = t.match(/(\d{1,2})\s*\.?\s*([A-Z]{3,})\s*\.?\s*(\d{4})?/); if (m) { const mo = monthOf(m[2]); if (mo) return (m[3] || yr) + '-' + pad2(mo) + '-' + pad2(+m[1]); }
  return '';
}
function parseShift(aoa, firstDate) {
  const txt = x => String(x == null ? '' : x).trim();
  const yr = istIso2(0).slice(0, 4), hh = h => { const m = Math.round(h * 60); return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); };
  const num24 = v => typeof v == 'number' && v >= 0 && v <= 24;
  const rangeOf = v => {      // "14.00 – 24.00", "14:00-24:00", "8-17" -> 'HH:MM-HH:MM' ; geçersizse null
    const m = txt(v).match(/(\d{1,2})(?:[:.](\d{1,2}))?\s*[-–—]\s*(\d{1,2})(?:[:.](\d{1,2}))?/); if (!m) return null;
    const a = +m[1] + (+(m[2] || 0)) / 60, b = +m[3] + (+(m[4] || 0)) / 60; if (a > 24 || b > 24) return null;
    return a == 0 && b == 0 ? '' : hh(a) + '-' + hh(b);
  };
  const isOff = v => { const t = fold(v); return /^(OFF|IZIN|IZINLI|X|-|0|0[.,]0+)$/.test(t) || /IZIN|RAPOR/.test(t); };
  const prev = () => aoa.slice(0, 8).map((r, i) => (i + 1) + ': ' + r.filter(x => x !== '').slice(0, 8).join(' | ')).filter(x => !/: $/.test(x)).join('\n');
  // 1) 7 günlük tarih hücreleri (herhangi bir sütunda)
  let dates = null, dcols = null;
  for (let i = 0; i < Math.min(aoa.length, 12) && !dates; i++) {
    const cs = []; aoa[i].forEach((v, c) => { const d = dateOf(v, yr); if (d) cs.push({ c: c, d: d }); });
    if (cs.length >= 7) { dates = cs.slice(0, 7).map(x => x.d); dcols = cs.slice(0, 7).map(x => x.c); }
  }
  // 2) tek bir tarih / tarih aralığı yazısı ya da kullanıcının girdiği ilk gün
  let start = firstDate ? dateOf(firstDate, yr) : '';
  for (let i = 0; i < Math.min(aoa.length, 12) && !dates && !start; i++) for (const v of aoa[i]) { const d = typeof v == 'string' ? dateOf(v, yr) : ''; if (d) { start = d; break; } }
  if (!dates && start) { dates = []; const d0 = new Date(start + 'T00:00:00Z'); for (let i = 0; i < 7; i++) { dates.push(d0.toISOString().slice(0, 10)); d0.setUTCDate(d0.getUTCDate() + 1); } }
  if (!dates) { const e = new Error('Excel\'de tarihler bulunamadı.\nOkunan ilk satırlar:\n' + prev()); e.needDate = true; throw e; }
  // 3) gün sütunları: tarih sütunları yoksa sayı çiftlerinden (2\'şer) ya da yazılı aralıklardan bul
  if (!dcols) {
    const pc = {}, tc = {};
    aoa.slice(2).forEach(r => { if (!txt(r[0])) return; r.forEach((v, c) => { if (c && num24(v) && num24(r[c + 1])) pc[c] = (pc[c] || 0) + 1; if (c && rangeOf(v) !== null && typeof v == 'string') tc[c] = (tc[c] || 0) + 1; }); });
    const pb = Object.keys(pc).map(Number).filter(c => pc[c] >= 3).sort((a, b) => a - b)[0], tb = Object.keys(tc).map(Number).filter(c => tc[c] >= 3).sort((a, b) => a - b)[0];
    if (pb !== undefined) dcols = [0, 1, 2, 3, 4, 5, 6].map(i => pb + 2 * i); else if (tb !== undefined) dcols = [0, 1, 2, 3, 4, 5, 6].map(i => tb + i);
    else throw new Error('Vardiya saatleri okunamadı.\nOkunan ilk satırlar:\n' + prev());
  }
  const list = [], seen = {}, dup = []; let barAt = -1, sec = 'SERVİS', ord = 0;
  aoa.forEach(r => {
    const name = txt(r[0]); if (!name) return;
    if (fold(name) == 'BAR' && barAt < 0) barAt = list.length;
    const week = []; let any = false;
    dcols.forEach(c => {
      if (num24(r[c]) && num24(r[c + 1])) { any = true; week.push(r[c] == 0 && r[c + 1] == 0 ? '' : hh(r[c]) + '-' + hh(r[c + 1])); return; }
      const rg = typeof r[c] == 'string' ? rangeOf(r[c]) : null;
      if (rg !== null) { any = true; week.push(rg); return; }
      if (txt(r[c]) !== '' && isOff(r[c])) { any = true; week.push(''); return; }
      week.push('');
    });
    if (!any) { if (r.some(c => fold(c) == 'PAZARTESI') && !/\d/.test(name)) sec = name; return; }   // BAR / RUNNER / TEMİZLİK / HOSTES / YÖNETİM başlıkları
    const k = fold(name);
    if (seen[k]) { list[seen[k] - 1].week = week; dup.push(name); return; }
    list.push({ name: name, week: week, sec: sec, ord: ++ord }); seen[k] = list.length;
  });
  if (!list.length) throw new Error('Vardiya satırı bulunamadı.\nOkunan ilk satırlar:\n' + prev());
  if (barAt > 0) list.forEach((x, i) => { if (i < barAt) x.sec = 'SERVİS'; });
  const s0 = list.findIndex(x => fold(x.name) == POSTA_BASLA), s1 = list.findIndex(x => fold(x.name) == POSTA_BITIS);
  let lo = -1, hi = -1;
  if (s0 >= 0 && s1 >= s0) { lo = s0; hi = s1; } else if (barAt > 0) { lo = 0; hi = barAt - 1; }
  list.forEach((x, i) => { if (lo >= 0 && i >= lo && i <= hi) { x.pg = true; x.po = i - lo + 1; } });
  return { dates: dates, list: list, dup: dup, posta: lo >= 0 ? list.slice(lo, hi + 1).map(x => x.name) : [] };
}
const SX = document.createElement('input'); SX.type = 'file'; SX.accept = '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; SX.hidden = true; document.body.appendChild(SX);
window.shiftXlsPick = () => { SX.value = ''; SX.click(); };
SX.addEventListener('change', () => { if (SX.files[0]) window.shiftXlsRun(SX.files[0]); });
window.shiftXlsRun = async function (f, firstDate) {
  let step = 'dosya okuma';
  try {
    const nm = f.name || '', b = typeof B != 'undefined' ? B : 'opt';
    if (b == 'mavi' && /OPT[İI]MUM/i.test(nm)) throw new Error('Bu dosya Optimum şubesine ait görünüyor (dosya adı). Üstten Optimum\'u seçip tekrar dene.');
    if (b == 'opt' && /MAV[İI]/i.test(nm)) throw new Error('Bu dosya Mavi Bahçe şubesine ait görünüyor (dosya adı). Üstten Mavi Bahçe\'yi seçip tekrar dene.');
    const aoa = await readXls(f);
    step = 'tablo çözümleme';
    const P = parseShift(aoa, firstDate);
    if (!P.list.length) throw new Error('Excel\'de vardiya satırı bulunamadı.');
    step = 'kaydetme';
    const r = await gs('uploadShiftXls', b, P.list.map(x => ({ name: x.name, week: x.week, pg: !!x.pg, po: x.po || 0, sec: x.sec, ord: x.ord })), P.dates, PIN);
    const fd = d => d.slice(8) + '.' + d.slice(5, 7);
    try { load(); } catch (e) {} try { rptLoad(); } catch (e) {}
    msg(r.ok + ' personelin vardiyası eklendi ✅\nHafta: ' + fd(P.dates[0]) + ' – ' + fd(P.dates[6]) + '.' + P.dates[6].slice(0, 4)
      + '\nPersonel ekranında bugün ve yarın görünür.'
      + (P.posta.length ? '\n\nPosta listesi: ' + P.posta.length + ' kişi (' + nice(P.posta[0]) + ' → ' + nice(P.posta[P.posta.length - 1]) + ')' : '')
      + (r.fuzzy && r.fuzzy.length ? '\n\nBenzer isimle eşleştirildi (Excel → uygulama):\n' + r.fuzzy.map(x => nice(x[0]) + ' → ' + nice(x[1])).join('\n') : '')
      + (r.missing.length ? '\n\nUygulamada kayıtlı olmayanlar (eklenmedi):\n' + r.missing.map(nice).join(', ') : '')
      + (r.absent.length ? '\n\nExcel\'de olmayanlar (izinli sayıldı):\n' + r.absent.map(nice).join(', ') : '')
      + (P.dup.length ? '\n\nExcel\'de iki kez geçenler (son satır kullanıldı):\n' + P.dup.map(nice).join(', ') : ''));
  } catch (e) {
    if (e && e.needDate && !firstDate) { ask('📅 Excel\'de tarih bulunamadı.\nHaftanın ilk sütunundaki günün tarihini yaz (ör. 06.11.2026).', [{ label: 'İlk gün (gg.aa.yyyy)', val: '' }], v => { const t = (v[0] || '').trim(); if (t) window.shiftXlsRun(f, t); }, 'Devam'); return; }
    msg(em(e) + '\n(adım: ' + step + ')');
  }
};

// ===== 📋 Postalar: günlük posta listesi + WhatsApp görseli =====
const istIso2 = off => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(Date.now() + off * 864e5));
const GUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
let PD = '', PST = { p: {}, x: {} };
const pgKey = () => 'mola_posta_' + B + '_' + PD;
const pgSave = () => { try { localStorage.setItem(pgKey(), JSON.stringify(PST)); } catch (e) {} };
const stfX = () => ((typeof D != 'undefined' && D && D.staff) || []).filter(s => !s.off);
const pgWork = () => stfX().map(s => ({ s: s, sh: window.shiftOf(s, PD) })).filter(x => x.sh);        // o gün çalışanlar (izinliler görünmez)
const pgMain = () => pgWork().filter(x => x.s.pg).sort((a, b) => (a.s.po || 0) - (b.s.po || 0));       // posta listesi (Excel sırası)
const pgOther = () => pgWork().filter(x => !x.s.pg).sort((a, b) => a.s.name.localeCompare(b.s.name, 'tr'));
const pgSel = () => pgMain().filter(x => !PST.x[x.s.id]).concat(pgOther().filter(x => PST.o[x.s.id]));
const pgLbl = d => { const x = new Date(d + 'T00:00:00Z'); return GUN[x.getUTCDay()] + ', ' + d.slice(8) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4); };
const pgT = sh => { const t = sh.split('-'); return [t[0], t[1] == '24:00' ? '00:00' : t[1]]; };
const pgMsg = t => { const e = $('pmsg'); if (e) e.textContent = t; };
const pgRow = (x, other) => { const t = pgT(x.sh), id = x.s.id; return '<div class="prow"><label class="pck"><input type="checkbox" ' + (other ? (PST.o[id] ? 'checked' : '') : (PST.x[id] ? '' : 'checked')) + ' onchange="postaTog(\'' + id + '\',this.checked,' + (other ? 1 : 0) + ')"><span>' + esc(nice(x.s.name)) + '<small>' + t[0] + ' – ' + t[1] + '</small></span></label><input class="pin" maxlength="12" placeholder="Posta" value="' + esc(PST.p[id] || '') + '" oninput="postaSet(\'' + id + '\',this.value)"></div>'; };
let PL = [], PA = {}, PT = null;
const isSrv = s => String(s.sec || '').toLocaleUpperCase('tr').replace(/İ/g, 'I').indexOf('SERV') == 0;
const pgSrv = () => { const hasSec = stfX().some(s => s.sec); return pgWork().filter(x => !hasSec || isSrv(x.s)); };
window.postaUI = async function (dt) {
  PD = dt || PD || istIso2(0);
  const all = stfX().some(s => s.shd || s.sh);
  if (!all) { pop('📋 Postalar · ' + BR[B], '<p class="sub" style="line-height:1.5">Önce <b>Vardiya</b> sekmesinden vardiya Excel\'ini yükle.</p>', true); $('mo').textContent = 'Kapat'; return; }
  pop('📋 Postalar · ' + BR[B], '<p class="sub">Yükleniyor…</p>', true); $('mo').textContent = 'Kapat';
  try { const r = await Promise.all([gs('getPostaList', B), gs('getPosta', B, PD)]); PL = r[0]; PA = r[1].m || {}; }
  catch (e) { $('mf').innerHTML = '<div class="err">' + esc(e && e.message || 'Hata') + '</div>'; return; }
  postaDraw();
};
function postaDraw() {
  const W = pgSrv().sort((a, b) => (a.s.ord || 1e9) - (b.s.ord || 1e9) || a.s.name.localeCompare(b.s.name, 'tr')), inf = window.shdInfo ? window.shdInfo(PD) : null, f = x => x.slice(8) + '.' + x.slice(5, 7);
  const opt = p => '<option value="">— seç —</option>' + W.filter(x => PA[p] == x.s.id || !Object.keys(PA).some(k => PA[k] == x.s.id)).map(x => { const t = pgT(x.sh); return '<option value="' + x.s.id + '"' + (PA[p] == x.s.id ? ' selected' : '') + '>' + esc(nice(x.s.name)) + ' (' + t[0] + '–' + t[1] + ')</option>'; }).join('');
  window.__postaOpt = opt;
  $('mf').innerHTML = '<div class="svn"><button class="x2 w" onclick="postaGo(-1)">‹</button><input type="date" value="' + PD + '" onchange="postaUI(this.value)"><button class="x2 w" onclick="postaGo(1)">›</button></div>'
    + '<div class="svrow" style="margin:8px 0"><button class="a ed" onclick="postaDay(0)">Bugün</button><button class="a ed" onclick="postaDay(1)">Yarın</button></div>'
    + '<div class="svb" style="margin-top:4px">' + esc(pgLbl(PD)) + '</div>'
    + (inf && !inf.cov ? '<div class="hot" style="margin:8px 0;text-align:left">⚠ Bu tarih yüklü vardiya haftasının (<b>' + f(inf.from) + ' – ' + f(inf.to) + '</b>) dışında.</div>' : '')
    + '<p class="sub" style="margin:4px 2px 10px">Postalar sabit. Her postanın karşısına o gün çalışan personeli seç. Garsonlar kendi postasını uygulamada görür.</p>'
    + PL.map((p, i) => '<div class="prow"><b class="ptag">' + esc(p) + '</b><select class="psel" data-i="' + i + '" onchange="postaPut(' + i + ',this.value)">' + opt(p) + '</select></div>').join('')
    + '<div id="pmsg" class="svst"></div><button class="a x" style="width:100%;margin-top:6px" onclick="postaEditList()">✏️ Posta listesini düzenle</button><button class="a an" style="width:100%;margin-top:8px" onclick="postaShare()">🖼 WhatsApp görseli oluştur</button><button class="a x" style="width:100%;margin-top:8px" onclick="postaClear()">Bu günü temizle</button>';
}
window.postaPut = (i, id) => {
  const p = PL[i]; if (id) { Object.keys(PA).forEach(k => { if (PA[k] == id && k != p) delete PA[k]; }); PA[p] = id; } else delete PA[p];
  document.querySelectorAll('.psel').forEach(el => { const q = PL[+el.dataset.i]; el.innerHTML = window.__postaOpt(q); el.value = PA[q] || ''; });
  pgMsg('Kaydediliyor…'); clearTimeout(PT);
  PT = setTimeout(async () => { try { await gs('savePosta', B, PD, PA, PIN); pgMsg('✓ Kaydedildi'); } catch (e) { pgMsg('⚠ ' + (e && e.message || 'Kaydedilemedi')); } }, 400);
};
window.postaClear = () => { PA = {}; gs('savePosta', B, PD, PA, PIN).then(postaDraw).catch(e => pgMsg('⚠ ' + (e && e.message))); };
window.postaEditList = () => { ask('Posta listesi · ' + BR[B] + '\nHer satıra ya da virgülle bir posta adı yaz', [{ label: 'Postalar', type: 'textarea', val: PL.join('\n') }], async v => { try { PL = await gs('savePostaList', B, v[0].split(/[\n,;]+/), PIN); } catch (e) { msg(e && e.message); return; } postaDraw(); $('ov').hidden = false; }, 'Kaydet'); };
window.postaGo = n => { const d = new Date(PD + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); window.postaUI(d.toISOString().slice(0, 10)); };
window.postaDay = o => window.postaUI(istIso2(o));
window.postaTog = () => {}; window.postaSet = () => {};
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
  const wk = {}; pgSrv().forEach(w => { wk[w.s.id] = w; });
  const rows = PL.filter(p => PA[p] && wk[PA[p]]).map(p => ({ x: wk[PA[p]], p: p }));
  if (!rows.length) return pgMsg('Henüz kimse bir postaya atanmadı.');
  const data = rows.map(r => { const t = pgT(r.x.sh); return { name: nice(r.x.s.name), a: t[0], b: t[1], p: r.p }; });
  const cv = postaCanvas(data, PD), blob = await new Promise(ok => cv.toBlob(ok, 'image/png'));
  const file = new File([blob], 'postalar_' + PD + '.png', { type: 'image/png' });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Postalar ' + PD }); return; } } catch (e) { if (e && e.name == 'AbortError') return; }
  const url = URL.createObjectURL(blob);
  pop('🖼 Posta görseli', '<img src="' + url + '" style="width:100%;border-radius:12px"><div class="shg" style="margin-top:10px"><a class="a an" href="' + url + '" download="postalar_' + PD + '.png">⬇ Görseli indir</a></div><p class="sub" style="margin:8px 2px;line-height:1.5">Görsele uzun basıp kaydedebilir ya da WhatsApp\'a paylaşabilirsin.</p>', true);
  $('mo').textContent = 'Kapat';
};
const stP = document.createElement('style');
stP.textContent = '.prow{display:flex;gap:8px;align-items:center;margin:0 0 8px}.prow .pck{flex:1 1 auto;display:flex;gap:10px;align-items:center;min-width:0;font-weight:700;font-size:15px}.prow .pck input{width:22px!important;height:22px!important;min-width:22px!important;flex:none!important;padding:0!important;margin:0!important}.prow .pck span{display:block;line-height:1.2;min-width:0;word-break:break-word}.prow .pck small{display:block;color:#94a3b8;font-weight:600;font-size:12px;margin-top:2px;white-space:nowrap}.prow .pin{width:92px!important;min-width:92px!important;flex:none!important;padding:11px 6px!important;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#fff;font-size:16px;text-align:center;text-transform:uppercase}';
document.head.appendChild(stP);

// Eski bir ai-rapor.js hâlâ yüklüyse (index.html'de script satırı kaldıysa) onun üzerine yazdığı fonksiyonları geri al
const MINE = { shiftXlsPick: window.shiftXlsPick, shiftXlsRun: window.shiftXlsRun, postaUI: window.postaUI, postaGo: window.postaGo, postaDay: window.postaDay, postaTog: window.postaTog, postaSet: window.postaSet, postaShare: window.postaShare, ciroXlsPick: window.ciroXlsPick, ciroXlsRun: window.ciroXlsRun, aiRun: window.aiRun, aiUI: window.aiUI, aiPick: window.aiPick, grpUI: window.grpUI, grpEdit: window.grpEdit, grpDel: window.grpDel };
setTimeout(() => Object.assign(window, MINE), 600);


});
})();

// ===== 🎬 Video: yönetici yükler, personel izler =====
(function () {
  let VL = [];
  const yid = u => { const m = String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : ''; };
  const dd = t => new Date(t).toLocaleDateString('tr-TR');
  window.vidLoad = async () => { try { VL = await gs('getVideos', B); } catch (e) { VL = []; } };
  window.vidHtml = adm => {
    if (!VL.length) return '<p class="sub" style="padding:10px">Henüz video yok.' + (adm ? ' ⬆ Video yükle ile ilk videoyu ekle.' : '') + '</p>';
    return VL.slice().sort((a, b) => b.t - a.t).map(v => {
      const y = yid(v.url), ig = String(v.url).match(/instagram\.com\/(?:[\w.]+\/)?(p|reels?|tv)\/([\w-]+)/i), isFile = !!v.path || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(v.url) || /firebasestorage|storage\.googleapis/.test(v.url);
      let pl;
      const por = v.o ? v.o == 'p' : /\/shorts\//.test(v.url);
      if (y) pl = '<iframe class="' + (por ? 'por' : '') + '" data-src="https://www.youtube.com/embed/' + y + '?playsinline=1&rel=0" allow="fullscreen; picture-in-picture; encrypted-media; autoplay" allowfullscreen></iframe>';
      else if (ig) pl = '<div class="igw ' + (/^reel/i.test(ig[1]) ? 'igr' : 'igp') + '"><iframe data-src="https://www.instagram.com/' + (/^reel/i.test(ig[1]) ? 'reel' : ig[1].toLowerCase()) + '/' + ig[2] + '/embed/" allowfullscreen scrolling="no"></iframe></div>';
      else if (isFile) pl = '<video controls playsinline preload="none" data-src="' + esc(v.url) + '"></video>';
      else pl = '<a class="vopen" target="_blank" rel="noopener" href="' + esc(v.url) + '">▶ Videoyu aç</a>';
      const ext = (y || ig) ? '<a class="vlk" target="_blank" rel="noopener" href="' + esc(v.url) + '">↗ Aç</a>' : '';
      return '<details class="vcard" ontoggle="vidOpen(this)"><summary class="vtt"><span class="vch">▸</span><div class="vtl"><b>' + esc(v.title) + '</b><small>' + dd(v.t) + '</small></div>' + ext + (adm ? (y ? '<button class="x2 w" title="Yön" data-i="' + esc(v.id) + '" onclick="event.preventDefault();event.stopPropagation();vidOri(this.dataset.i)">' + (por ? '📱' : '🖥') + '</button>' : '') + '<button class="x2 w" data-i="' + esc(v.id) + '" onclick="event.preventDefault();event.stopPropagation();vidDel(this.dataset.i)">✕</button>' : '') + '</summary><div class="vpl">' + pl + '</div></details>';
    }).join('');
  };
  window.vidOri = id => { const L = VL.map(v => v.id == id ? Object.assign({}, v, { o: (v.o ? v.o == 'p' : /\/shorts\//.test(v.url)) ? 'l' : 'p' }) : v); vsave(L).catch(e => msg(e && e.message)); };
  window.vidOpen = d => {
    d.querySelectorAll('[data-src]').forEach(e => { if (d.open) { if (!e.getAttribute('src')) { e.setAttribute('src', e.dataset.src); if (e.load) e.load(); } } else { if (e.pause) e.pause(); else e.removeAttribute('src'); } });
  };
  const vsave = async L => { await gs('saveVideos', B, L, PIN); VL = L; if (window.goPg) window.goPg('video'); };
  const vf = document.createElement('input'); vf.type = 'file'; vf.accept = 'video/*'; vf.hidden = true; document.body.appendChild(vf);
  window.vidPick = () => { vf.value = ''; vf.click(); };
  vf.addEventListener('change', () => {
    const f = vf.files[0]; if (!f) return;
    if (f.size > 300 * 1024 * 1024) { msg('Video çok büyük (en çok 300 MB). Telefonda kısaltıp tekrar dene.'); return; }
    ask('Video başlığı', [{ label: 'Başlık', val: f.name.replace(/\.[^.]+$/, '') }], v => vidUp(f, v[0].trim() || f.name), 'Yükle');
  });
  async function vidUp(f, title) {
    if (typeof firebase.storage != 'function') { msg('Depolama eklentisi yüklenmedi. index.html güncel mi? (firebase-storage-compat.js)'); return; }
    pop('⬆ Video yükleniyor', '<div id="vp" style="font-size:28px;font-weight:800;text-align:center;padding:12px">0%</div><p class="sub">Bu pencereyi kapatma, yükleme bitene kadar bekle.</p>');
    $('mc').style.display = 'none'; $('mo').style.display = 'none';
    try {
      const path = 'videos/' + B + '/' + Date.now() + '_' + f.name.replace(/[^\w.\-]/g, '_'), pid = firebase.app().options.projectId;
      let bks = [pid + '.firebasestorage.app', pid + '.appspot.com'], last = null, url = '';
      try { const sv = localStorage.getItem('stbk'); if (sv) bks = [sv].concat(bks.filter(b => b != sv)); } catch (e) {}
      for (const bk of bks) {
        try {
          const ref = firebase.app().storage('gs://' + bk).ref(path), task = ref.put(f, { contentType: f.type || 'video/mp4' });
          task.on('state_changed', s => { const e = $('vp'); if (e) e.textContent = Math.round(s.bytesTransferred / s.totalBytes * 100) + '%'; });
          await task; url = await ref.getDownloadURL(); try { localStorage.setItem('stbk', bk); } catch (e) {} last = null; break;
        } catch (e) { last = e; if (!/bucket|not-found|unknown|404|retry/i.test((e && (e.code + ' ' + e.message)) || '')) break; }
      }
      if (last) throw last;
      await vsave(VL.concat([{ id: Math.random().toString(36).slice(2, 10), title: title, url: url, path: path, t: Date.now() }]));
      $('mo').style.display = ''; $('ov').hidden = true;
    } catch (e) {
      $('mo').style.display = ''; $('mo').textContent = 'Tamam';
      $('mt').textContent = 'Video yüklenemedi'; $('mf').innerHTML = '<p class="sub" style="line-height:1.5">' + esc(e && e.message || 'Hata') + '<br><br>Firebase konsolunda <b>Build > Storage > Get started</b> ile Storage açık olmalı, kurallar <b>request.auth != null</b> olmalı. Storage yeni projelerde ücretli (Blaze) plan isteyebilir. Alternatif: 🔗 Link ekle ile YouTube bağlantısı ekleyebilirsin.</p>';
    }
  }
  window.vidLink = () => ask('Video linki ekle\nİki şubede de görünür', [{ label: 'Başlık' }, { label: 'YouTube / Instagram / .mp4 bağlantısı', type: 'url' }, { label: 'Video yönü', type: 'select', opts: [['p', '📱 Dikey (Shorts / Reels)'], ['l', '🖥 Yatay (normal video)']] }], async v => {
    if (!v[0].trim() || !/^https:\/\//.test(v[1].trim())) { msg('Başlık ve https:// ile başlayan bağlantı gerekli.'); return; }
    try { await vsave(VL.concat([{ id: Math.random().toString(36).slice(2, 10), title: v[0].trim(), url: v[1].trim(), path: '', o: v[2], t: Date.now() }])); } catch (e) { msg(e && e.message); }
  }, 'Ekle');
  window.vidDel = id => { const v = VL.find(x => x.id == id); if (!v) return; ask('“' + v.title + '” silinsin mi?', [], async () => { try { if (v.path && firebase.storage) { const pid = firebase.app().options.projectId; for (const bk of [pid + '.firebasestorage.app', pid + '.appspot.com']) { try { await firebase.app().storage('gs://' + bk).ref(v.path).delete(); break; } catch (e) {} } } await vsave(VL.filter(x => x.id != id)); } catch (e) { msg(e && e.message); } }, 'Sil'); };
  const st = document.createElement('style');
  st.textContent = '.vcard{background:linear-gradient(160deg,#2b1117,#1c0a0e);border:1px solid rgba(254,202,202,.14);border-radius:18px;overflow:hidden;margin:0 0 12px}.vpl{position:relative;background:#000}.vpl video,.vpl iframe{display:block;width:100%;aspect-ratio:16/9;border:0}.vpl iframe.por{width:min(100%,calc(80vh*9/16));aspect-ratio:9/16;margin:0 auto}.vpl video{max-height:78vh;background:#000}.igw{position:relative;overflow:hidden;width:min(100%,calc(80vh*9/16));aspect-ratio:9/16;margin:0 auto;background:#000}.vpl .igw iframe{position:absolute;border:0;background:#000;aspect-ratio:auto;max-height:none}.vpl .igw.igr iframe{width:142%;left:-21%;top:-56px;height:calc(100% + 240px)}.vpl .igw.igp{aspect-ratio:4/5;width:100%}.vpl .igw.igp iframe{width:100%;left:0;top:-56px;height:calc(100% + 240px)}.vopen{display:block;padding:26px 12px;text-align:center;color:#fff;font-weight:800;text-decoration:none;background:linear-gradient(135deg,#dc2626,#7f1d1d)}.vlk{color:#fecaca;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap}.vtt{display:flex;align-items:center;gap:10px;padding:14px 12px;cursor:pointer;list-style:none}.vtt::-webkit-details-marker{display:none}.vtl{flex:1;min-width:0}.vch{color:#fca5a5;font-size:18px;transition:transform .15s}details.vcard[open] .vch{transform:rotate(90deg)}details.vcard[open] .vtt{border-bottom:1px solid rgba(254,202,202,.14)}.vtt b{font-size:15px}.vtt small{display:block;color:#94a3b8;font-size:12px;margin-top:2px}';
  document.head.appendChild(st);
})();

// ===== ✏️ Vardiya düzenle / sil / ekle =====
(function () {
  const iso = o => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(Date.now() + o * 864e5));
  const wkDates = () => { const wd = (new Date(iso(0) + 'T00:00:00Z').getUTCDay() + 6) % 7; return [0, 1, 2, 3, 4, 5, 6].map(i => iso(i - wd)); };
  const DN = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const ref = () => { if (window.goPg) window.goPg('vard'); setTimeout(() => { try { load(); } catch (e) {} }, 300); };
  const cellTxt = c => { const m = String(c || '').match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/); return m ? m[1] + '-' + m[2] : ''; };
  function form(s, sec) {
    const dts = wkDates();
    ask('✏️ ' + nice(s.name) + ' · bu haftanın vardiyası\nSaat yaz: 14:00-24:00 · boş bırak = izinli',
      dts.map((d, i) => ({ label: DN[i] + ' ' + d.slice(8) + '.' + d.slice(5, 7), val: cellTxt(s.sh && s.sh[i]) })),
      async v => { try { await gs('setShiftWeek', s.id, v, dts, sec || '', PIN); ref(); } catch (e) { msg(e && e.message || 'Kaydedilemedi'); } }, 'Kaydet');
  }
  window.shEdit = id => { const s = D.staff.find(x => x.id == id); if (s) form(s, ''); };
  window.shDel = id => { const s = D.staff.find(x => x.id == id); if (!s) return; ask(nice(s.name) + ' vardiya listesinden çıkarılsın mı?\nBu haftanın vardiyası silinir; tabloda görünmez.', [], async () => { try { await gs('shiftRemove', id, wkDates(), PIN); ref(); } catch (e) { msg(e && e.message); } }, 'Sil'); };
  window.shAdd = () => {
    const out = D.staff.filter(s => !s.sec).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    if (!out.length) { msg('Hepsi zaten vardiya listesinde.'); return; }
    const secs = []; D.staff.forEach(s => { if (s.sec && secs.indexOf(s.sec) < 0) secs.push(s.sec); });
    if (!secs.length) secs.push('SERVİS');
    ask('➕ Vardiyaya kişi ekle', [{ label: 'Personel', type: 'select', opts: out.map(s => [s.id, nice(s.name)]) }, { label: 'Departman', type: 'select', opts: secs.map(c => [c, c]) }], v => { const s = D.staff.find(x => x.id == v[0]); if (s) setTimeout(() => form(s, v[1]), 150); }, 'Devam');
  };
})();

// ===== ♻️ Mola düzenleme: tek tek sıfırla / süre düzelt / aktif molayı iptal et =====
(function () {
  const TT = 'Molaları düzenle';
  const open = () => !$('ov').hidden && $('mt').textContent.indexOf(TT) >= 0;
  function draw(id) {
    const s = D.staff.find(x => x.id == id); if (!s || !open()) return;
    const left = Math.max(0, D.total - usedOf(s)), dn = (s.done || []).filter(x => x && typeof x === 'object');
    let h = '<div class="sub" style="margin-bottom:8px">Bugün kullanılan: <b>' + usedOf(s) + ' dk</b> · Kalan: <b>' + left + ' dk</b></div>';
    if (s.active) h += '<div class="mdc"><div><b>Şu an molada: ' + esc(s.active.n) + '</b><small>' + hm(s.active.start) + ' çıktı</small></div><button class="a end" onclick="mdDrop(\'' + id + '\')">İptal et<br><small>süre sayılmasın</small></button></div>';
    h += dn.length ? dn.map(x => '<div class="mdc"><div><b>' + esc(kn(x.k)) + '</b><small>' + hm(x.t) + '–' + hm(x.e || x.t + x.m * 60000) + ' · ' + x.m + ' dk</small></div><div class="mdb"><button class="a ed" onclick="mdMin(\'' + id + '\',' + x.t + ',' + x.m + ')">✏️ Süre</button><button class="a off" onclick="mdDel(\'' + id + '\',' + x.t + ')">♻️ Sıfırla</button></div></div>').join('') : '<p class="sub">Bugün biten mola yok.</p>';
    h += '<button class="a x" style="width:100%;margin-top:10px" onclick="mdAll(\'' + id + '\')">Tüm molaları sıfırla</button>';
    $('mf').innerHTML = h;
  }
  function reload(id) { google.script.run.withFailureHandler(e => msg(emsg(e))).withSuccessHandler(d => { if (d && d.names) { D = d; off = d.now - Date.now(); } draw(id); }).getState(B, PIN); }
  function openMD(id) { const s = D.staff.find(x => x.id == id); if (!s) return; pop('☕ ' + nice(s.name) + '\n' + TT, ''); $('mo').textContent = 'Kapat'; $('mc').style.display = 'none'; draw(id); }
  const call = (fn, id, ...a) => gs(fn, id, ...a, PIN).then(() => reload(id)).catch(e => msg(emsg(e)));
  window.resetP = openMD;
  window.mdDel = (id, t) => call('removeDone', id, t);
  window.mdDrop = id => call('dropActive', id);
  window.mdMin = (id, t, m) => ask('Mola süresini düzelt (dk)', [{ label: 'Gerçek süre', type: 'number', val: String(m) }], v => { gs('setDoneMin', id, t, v[0], PIN).then(() => { reload(id); openMD(id); }).catch(e => msg(emsg(e))); }, 'Kaydet');
  window.mdAll = id => { const s = D.staff.find(x => x.id == id); ask(nice(s.name) + ' için bugünkü TÜM molalar sıfırlansın mı?', [], () => { gs('resetStaff', id, PIN).then(() => load()).catch(e => msg(emsg(e))); }, 'Hepsini sıfırla'); };
  const st = document.createElement('style');
  st.textContent = '.mdc{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #334155}.mdc small{display:block;color:#94a3b8;font-size:12px;margin-top:2px}.mdb{display:flex;gap:6px}.mdb button{padding:9px 10px;font-size:13px}';
  document.head.appendChild(st);
})();

// ===== 👥 Yöneticiler (sadece ana yönetici) =====
(function () {
  function draw() {
    gs('adminList', PIN).then(L => {
      $('mf').innerHTML = '<p class="sub" style="margin:0 0 10px">Yönetim paneline şifreyle girebilen kişiler. Her yöneticinin kendi şifresi var.</p>'
        + '<div class="mdc"><div><b>Ana yönetici</b><small>Sen · yönetici ekleyip çıkarabilirsin</small></div></div>'
        + (L.length ? L.map(a => '<div class="mdc"><div><b>' + esc(a.name) + '</b><small>Yönetici</small></div><button class="a off" style="padding:9px 12px" data-i="' + esc(a.id) + '" onclick="admDelU(this.dataset.i)">Çıkar</button></div>').join('') : '<p class="sub" style="margin-top:10px">Henüz başka yönetici yok.</p>')
        + '<button class="a" style="width:100%;margin-top:12px" onclick="admAddU()">➕ Yönetici ekle</button><button class="a x" style="width:100%;margin-top:8px" onclick="admOwnPin()">🔑 Ana şifreyi değiştir</button>';
    }).catch(e => { $('mf').innerHTML = '<div class="err">' + esc(emsg(e)) + '</div>'; });
  }
  window.admUsers = () => { pop('👥 Yöneticiler', '<p class="sub">Yükleniyor…</p>'); $('mo').textContent = 'Kapat'; $('mc').style.display = 'none'; draw(); };
  window.admAddU = () => ask('Yönetici ekle', [{ label: 'Ad Soyad' }, { label: 'Şifre (4-8 rakam)', type: 'password' }], v => { gs('adminAdd', v[0], v[1], PIN).then(() => { admUsers(); }).catch(e => { msg(emsg(e)); }); }, 'Ekle');
  window.admDelU = id => ask('Bu yönetici çıkarılsın mı?', [], () => { gs('adminDel', id, PIN).then(() => admUsers()).catch(e => msg(emsg(e))); }, 'Çıkar');
  window.admPass = () => ask('🔑 Şifremi değiştir', [{ label: 'Mevcut şifre', type: 'password' }, { label: 'Yeni şifre (4-8 rakam)', type: 'password' }, { label: 'Yeni şifre (tekrar)', type: 'password' }], v => {
    if (v[1] !== v[2]) { msg('Yeni şifreler aynı değil'); return; }
    gs('changePin', v[0], v[1]).then(() => { PIN = v[1].trim(); msg('Şifren değişti ✅\nBir sonraki girişte yeni şifreyi kullan.'); }).catch(e => msg(emsg(e)));
  }, 'Değiştir');
  window.admOwnPin = () => ask('Ana şifreyi değiştir', [{ label: 'Yeni şifre (4-8 rakam)', type: 'password' }], v => { gs('ownerSetPin', v[0], PIN).then(() => { PIN = v[0]; msg('Ana şifre değişti ✅'); }).catch(e => msg(emsg(e))); }, 'Değiştir');
})();

// ===== 📷 Profil fotoğrafları (küçültülüp veritabanında saklanır) =====
(function () {
  let PH = {};
  try { PH = JSON.parse(localStorage.getItem('phc') || '{}'); } catch (e) {}
  const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.hidden = true; document.body.appendChild(fi);
  let target = '';
  const save = () => { try { localStorage.setItem('phc', JSON.stringify(PH)); } catch (e) {} };
  function apply() {
    try {
      const st = (typeof D !== 'undefined' && D && D.staff) || [], mp = {}; st.forEach(x => { mp[nrm(x.name)] = x.id; });
      document.querySelectorAll('[data-nm]').forEach(el => { const id = mp[nrm(el.dataset.nm)]; if (id && el.dataset.p !== id) el.dataset.p = id; });
    } catch (e) {}
    document.querySelectorAll('[data-p]').forEach(el => {
      const u = PH[el.dataset.p], im = el.querySelector('img');
      if (u) { if (!im) { el.dataset.n = el.textContent; el.innerHTML = '<img alt="" src="' + u + '">'; } else if (im.getAttribute('src') !== u) im.src = u; }
      else if (im) { el.textContent = el.dataset.n || ''; }
    });
  }
  let raf = 0; new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; apply(); }); }).observe(document.body, { childList: true, subtree: true });
  function fetchPh() {
    google.script.run.withFailureHandler(() => {}).withSuccessHandler(o => {
      const m = {}; Object.keys(o || {}).forEach(k => { if (k.indexOf('p_') === 0) m[k.slice(2)] = o[k]; });
      PH = m; save(); apply();
    }).getPhotos();
  }
  fetchPh(); setInterval(() => { if (document.visibilityState === 'visible') fetchPh(); }, 60000);
  const shrink = f => new Promise((ok, no) => { const im = new Image(), u = URL.createObjectURL(f); im.onload = () => { const s = Math.min(im.width, im.height), c = document.createElement('canvas'); c.width = c.height = 160; c.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 160, 160); URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', .72)); }; im.onerror = no; im.src = u; });
  fi.addEventListener('change', async () => {
    const f = fi.files[0]; if (!f || !target) return;
    try { const d = await shrink(f); await gs('setPhoto', target, d, M == 'y' ? PIN : ''); PH[target] = d; save(); apply(); }
    catch (e) { msg('Fotoğraf eklenemedi:\n' + emsg(e)); }
  });
  window.phMenu = id => {
    target = id; const has = !!PH[id];
    pop('📷 Profil fotoğrafı', '<button class="a" style="width:100%" onclick="$(\'ov\').hidden=true;phPick()">📷 ' + (has ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle') + '</button>' + (has ? '<button class="a off" style="width:100%;margin-top:8px" onclick="phDel()">🗑 Fotoğrafı kaldır</button>' : '') + '<p class="sub" style="margin-top:10px">Kameradan çek ya da galeriden seç. Fotoğraf küçültülerek kaydedilir.</p>');
    $('mo').textContent = 'Kapat'; $('mc').style.display = 'none';
  };
  window.phPick = () => { fi.value = ''; fi.click(); };
  window.phDel = async () => { $('ov').hidden = true; try { await gs('delPhoto', target, M == 'y' ? PIN : ''); delete PH[target]; save(); apply(); } catch (e) { msg(emsg(e)); } };
  const st = document.createElement('style');
  st.textContent = '[data-p]{cursor:pointer}[data-p] img{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block}.hi b[data-p]{position:relative;width:56px;height:56px;flex:none}.hi b[data-p]::after{content:"📷";position:absolute;right:-5px;bottom:-5px;font-size:11px;background:#fff;border-radius:50%;width:20px;height:20px;display:grid;place-items:center;box-shadow:0 1px 4px rgba(0,0,0,.4)}.av[data-p]{width:46px;height:46px;overflow:hidden;padding:0}.pkc b[data-p]{overflow:hidden;padding:0}';
  document.head.appendChild(st);
})();

// ===== Açılış: "Kullanıcı Seçin" tam ekran giriş =====
(function () {
  const ini2 = n => nice(n).split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('');
  const logo = () => { const l = document.querySelector('.hd .lg'); return l ? l.src : ''; };
  window.hideLogin = () => { const o = document.getElementById('lgn'); if (o) o.style.display = 'none'; document.body.style.overflow = ''; };
  window.lgBr = b => { B = b; lset('br', b); RPL = 0; RP = []; BP = []; const o = document.getElementById('lgn'); if (o) o.dataset.sig = ''; load(); };
  window.showLogin = () => {
    let o = document.getElementById('lgn'); if (!o) { o = document.createElement('div'); o.id = 'lgn'; document.body.appendChild(o); }
    o.style.display = 'flex'; document.body.style.overflow = 'hidden';
    const L = ((D && D.staff) || []).filter(s => !s.off).sort((a, b) => a.name.localeCompare(b.name, 'tr')), sig = B + '|' + L.map(s => s.id).join();
    if (o.dataset.sig === sig && document.getElementById('pks')) return; o.dataset.sig = sig;
    o.innerHTML = '<div class="lgh"><div class="lgb"><button class="' + (B == 'opt' ? 'on' : '') + '" onclick="lgBr(\'opt\')">Optimum</button><button class="' + (B == 'mavi' ? 'on' : '') + '" onclick="lgBr(\'mavi\')">Mavi Bahçe</button></div><h1>Kullanıcı Seçin</h1><input id="pks" class="pks" placeholder="🔎 Adını yaz…" oninput="pkFilter(this.value)" autocomplete="off"></div>'
      + '<div class="lgl">' + L.map(s => '<button class="pkc" data-n="' + esc(nrm(s.name)) + '" onclick="pickMe(\'' + s.id + '\')"><b data-p="' + s.id + '">' + esc(ini2(s.name)) + '</b><span>' + esc(nice(s.name)) + '</span></button>').join('') + (L.length ? '' : '<p style="text-align:center;opacity:.85">Listede kimse yok. Aşağıdan kayıt olabilirsin.</p>') + '</div>'
      + '<div class="lgf"><img src="' + logo() + '" alt=""><div class="lgt">Happy Moon\'s · Mola Takip</div><div class="lga"><button onclick="regMe()">➕ Kayıt ol</button><button onclick="setM(\'y\')">🔑 Yönetici girişi</button></div></div>';
  };
  // Açılışta boş ekran yerine hemen giriş ekranı
  try {
    if (!localStorage.getItem('mola_me_' + (localStorage.getItem('br') || 'opt'))) {
      const o = document.createElement('div'); o.id = 'lgn'; o.innerHTML = '<div class="lgh"><h1 style="margin-top:40px">Kullanıcı Seçin</h1></div><div class="lgl"><p style="text-align:center;opacity:.85">Yükleniyor…</p></div><div class="lgf"><img src="' + logo() + '" alt=""><div class="lgt">Happy Moon\'s · Mola Takip</div></div>';
      document.body.appendChild(o); document.body.style.overflow = 'hidden';
    }
  } catch (e) {}
  const st = document.createElement('style');
  st.textContent = '#lgn{position:fixed;inset:0;z-index:8;display:flex;flex-direction:column;background:linear-gradient(160deg,#e11d48 0%,#a3152f 42%,#4a0a1a 100%);color:#fff;padding:max(18px,env(safe-area-inset-top)) 18px max(14px,env(safe-area-inset-bottom));overflow:hidden}#lgn::before{content:"";position:absolute;inset:0;opacity:.07;pointer-events:none;background:conic-gradient(#fff 25%,transparent 0 50%,#fff 0 75%,transparent 0) 0 0/60px 60px}#lgn>*{position:relative}'
    + '.lgh{text-align:center}.lgh h1{font-size:26px;margin:14px 0 12px;font-weight:800}.lgb{display:inline-flex;background:rgba(0,0,0,.28);border-radius:14px;padding:4px}.lgb button{border:0;background:transparent;color:#fecdd3;padding:9px 18px;border-radius:11px;font-weight:700;font-size:14px}.lgb button.on{background:#fff;color:#9f1239}'
    + '#lgn .pks{width:100%;padding:13px 14px;border-radius:14px;border:0;background:rgba(255,255,255,.18);color:#fff;font-size:16px}#lgn .pks::placeholder{color:#fecdd3}'
    + '.lgl{flex:1;overflow:auto;display:flex;flex-direction:column;gap:10px;margin:14px 0;padding-bottom:6px;-webkit-overflow-scrolling:touch}'
    + '#lgn .pkc{flex:none;background:rgba(255,255,255,.17);border:1px solid rgba(255,255,255,.2);box-shadow:none;backdrop-filter:blur(4px)}#lgn .pkc:active{background:rgba(255,255,255,.28)}#lgn .pkc b{background:rgba(255,255,255,.26)}'
    + '.lgf{text-align:center}.lgf img{height:54px;background:#fff;border-radius:14px;padding:3px 8px}.lgt{font-weight:800;margin:6px 0 8px;font-size:14px;letter-spacing:.02em}.lga{display:flex;gap:8px;justify-content:center}.lga button{border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);color:#fff;border-radius:999px;padding:10px 14px;font-weight:700;font-size:13px}';
  document.head.appendChild(st);
})();
