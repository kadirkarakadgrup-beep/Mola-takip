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
    const clip = (o, n) => String(o == null ? '' : o).slice(0, n), num = v => { v = Number(v); return isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : 0; };
    const vals = {}; Object.keys((data && data.vals) || {}).slice(0, 200).forEach(k => { const v = data.vals[k] || {}; vals[clip(k, 40)] = { h: num(v.h), d: v.d == null || v.d === '' ? null : Math.min(7, num(v.d)) }; });
    const ex = ((data && data.ex) || []).slice(0, 60).map(e => ({ id: clip(e.id, 40), name: clip(e.name, 60), grp: e.grp === 'pay' ? 'pay' : 'rec' }));
    const res = {}; Object.keys((data && data.res) || {}).slice(0, 200).forEach(k => { const r = data.res[k] || {}; res[clip(k, 40)] = { r: r.r === 'pay' ? 'pay' : 'rec', a: num(r.a), d: num(r.d), p: r.p ? 1 : 0 }; });
    const hide = {}; Object.keys((data && data.hide) || {}).slice(0, 200).forEach(k => { if (data.hide[k]) hide[clip(k, 40)] = 1; });
    const paid = {}; Object.keys((data && data.paid) || {}).slice(0, 200).forEach(k => { if (data.paid[k]) paid[clip(k, 40)] = 1; });
    await col('cfg').doc('tipbox_' + branch + '_' + wk).set({ vals: vals, ex: ex, res: res, paid: paid, hide: hide, t: Date.now() });
  },
  async getTipBoxMine(branch, wk, id) {
    const d = await col('cfg').doc('tipbox_' + branch + '_' + wk).get();
    const r = d.exists && d.data().res ? d.data().res[String(id)] : null;
    if (!r) return null;
    const a = await col('cfg').doc('tipann_' + branch).get();
    return Object.assign({}, r, { ann: a.exists ? a.data().on !== false : true });
  },
  async getTipAnn(branch) { const a = await col('cfg').doc('tipann_' + branch).get(); return a.exists ? a.data().on !== false : true; },
  async setTipAnn(branch, on, pin, me) { await this.tipOk_(branch, pin, me); await col('cfg').doc('tipann_' + branch).set({ on: !!on, t: Date.now() }); },
  async getTipExcl(branch, pin, me) { await this.tipOk_(branch, pin, me); const d = await col('cfg').doc('tipexcl_' + branch).get(); return d.exists ? (d.data().ids || []) : null; },
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
    if ((await col('rez').get()).size > 800) throw new Error('Çok fazla rezerve kaydı var');
    const id = Math.random().toString(36).slice(2, 10);
    await col('rez').doc(id).set(clean_({ id: id, branch: branch, type: r.type === 'dogum' ? 'dogum' : r.type === 'kahvalti' ? 'kahvalti' : 'yemekli', date: clip(r.date, 10), time: clip(r.time, 5), ts: ts, guest: guest, phone: clip(r.phone, 20), taker: clip(r.taker, 60), note: clip(r.note, 300), by: me ? String(me).slice(0, 40) : '', t: Date.now(), sched: false }));
    return { ok: true, id: id, sched: await rezSched_(id), ts: ts };
  },
  async listRez(branch, pin, me) { await rezOk_(pin, me); const from = Date.now() - 3 * 86400000; return (await col('rez').get()).docs.map(d => d.data()).filter(r => r.branch === branch && r.ts >= from).sort((a, b) => a.ts - b.ts); },
  async delRez(id, pin, me) {
    const ref = col('rez').doc(String(id)), d = await ref.get(); if (!d.exists) return;
    const r = d.data();
    if (!(pin && VER[String(pin)]) && !(me && r.by && r.by === String(me))) throw new Error('Silme yetkin yok');
    if (r.nid) cancel_(topicOf_('yonetici'), r.nid);
    if (r.nid2 && r.by) cancel_(topicOf_(r.by), r.nid2);
    await ref.delete();
  },
  async rezSync(branch) {
    const now = Date.now(), L = (await col('rez').get()).docs.map(d => d.data()).filter(r => r.branch === branch && r.sched !== true && r.ts - 3600000 > now && r.ts - 3600000 <= now + 2.9 * 86400000);
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
    for (let i = staff.length - 1; i >= 0; i--) if (numNm(staff[i].name)) {      // hatalı yüklemeyle eklenmiş "1, 2, 3…" adlı kayıtları temizle
      const bad = staff[i]; staff.splice(i, 1);
      try { await col('staff').doc(bad.id).delete(); await col('hist').doc(bad.id).delete(); } catch (e) {}
    }
    entries = entries.filter(e => !numNm(e && e.name));
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
    const added = [];
    if (branch === 'mavi') {      // Mavi Bahçe: Excel'de olup uygulamada kayıtlı olmayan personeli otomatik ekle
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
      if (branch === 'mavi' && e && Array.isArray(e.pst) && e.pst.length === 7) {      // kişinin altındaki posta → o günün posta tablosu
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
        if (e) { s.sec = String(e.sec || '').slice(0, 30); s.ord = Number(e.ord) || 0; } else { delete s.sec; delete s.ord; }
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
    const card=(t,r,v)=>'<div class="tr1 zap'+(nrm(r.name)==my?' me':'')+'"><span class="bolt b1">⚡</span><span class="bolt b2">⚡</span><b class="mav big" data-nm="'+esc(r.name)+'">'+esc(ini(r.name))+'</b><span class="trc">🏆</span><div><small>'+t+'</small><b>'+esc(nice(r.name))+(nrm(r.name)==my?' (sen)':'')+'</b><em>'+v+'</em></div></div>';
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
    postaFill(s0);trophyFill(s0);mbn(s0,me);vFetch(s0);radioListen(me);window.tipFill&&tipFill(s0);
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
const NAVS=[['mola','🕐','Mola'],['vard','🗓️','Vardiya'],['servis','🚌','Servis'],['bar','🍸','Bar'],['rep','📁','Rapor'],['gm','⭐','GM Raporu'],['adis','🧾','Adisyon Bul'],['video','🎬','Video'],['rez','📅','Rezerve'],['tip','💰','Tip Box'],['ml','☕','Moladakiler']];
const nvDraw=()=>{NV.innerHTML=NAVS.filter(n=>(n[0]!='bar'||barVis())&&((n[0]!='rep'&&n[0]!='gm')||repVis())&&(n[0]!='adis'||M=='y')&&(n[0]!='rez'||rezOK())&&(n[0]!='tip'||M=='y'||(M=='g'&&getMe()&&(window.__tipIds||[]).indexOf(getMe())>-1))).map(n=>`<button class="${n[0]==PGV?'on':''}" onclick="${n[0]=='ml'?'molaList()':n[0]=='tip'?'tipUI()':n[0]=='rez'?'rezUI()':`goPg('${n[0]}')`}"><i>${n[1]}</i>${n[2]}</button>`).join('');NV.classList.toggle('nv5',NV.children.length>8);};
window.goPg=v=>{
  PGV=v;PSIG='';nvDraw();
  ['tools','st','sum','list','rpt','beer'].forEach(id=>{const e=$(id);if(e)e.style.display=v=='mola'?'':'none';});
  PG.hidden=v=='mola';
  if(v!='mola'){PG.innerHTML='<p class="sub">Yükleniyor…</p>';pgSync();}
  window.scrollTo(0,0);
};
nvDraw();
// Menü butonları; mod (Personel/Yönetici), kişi veya yetki değişince kendiliğinden yenilensin (draw()'a bağlı kalma)
let NVSIG='';setInterval(()=>{try{const v=(D?barVis()+'|'+repVis():'x')+'|'+M+'|'+B+'|'+PGV+'|'+getMe()+'|'+(window.__tipIds||[]).join(',')+'|'+rezOK();if(v!==NVSIG){NVSIG=v;nvDraw();}}catch(e){}},600);
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
const VD_SH=['PZT','SAL','ÇAR','PER','CUM','CMT','PAZ'];
const vdP=n=>(+n<10?'0':'')+(+n),vdF=x=>String(Math.round(x*10)/10).replace('.',',');
function vdCell(c){
  const m=String(c||'').match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if(!m)return{cls:'off',a:'<span class="vi">İzinli</span>',h:0,ot:0};
  const s0=+m[1]*60+ +m[2];let e0=+m[3]*60+ +m[4];if(e0<=s0)e0+=1440;
  const h=(e0-s0)/60,ot=Math.max(0,Math.round((h-9)*100)/100),sh=+m[1];
  const cls=sh<=9?'y':(sh<=11?'g':(sh<=13?'b':'n'));
  return{cls:cls,h:h,ot:ot,a:'<b>'+vdP(m[1])+':'+m[2]+'</b><i>'+vdP(m[3])+':'+m[4]+'</i>'+(ot?'<em>+'+vdF(ot)+'</em>':'')};
}
function vardHtml(){
  const td=(new Date().getDay()+6)%7,me=getMe();let st=((D&&D.staff)||[]).filter(s=>!s.off);
  if(st.some(s=>s.sec))st=st.filter(s=>s.sec);
  if(!st.some(s=>s.sh))return '<p class="sub" style="padding:10px">Bu şube için vardiya henüz yüklenmedi.</p>';
  const wn=window.weekNote?window.weekNote():'';
  st.sort((a,b)=>((a.ord||1e9)-(b.ord||1e9))||a.name.localeCompare(b.name,'tr'));let ps='';
  const mon=new Date();mon.setDate(mon.getDate()-td);
  const dts=DAYS.map((d,i)=>{const x=new Date(mon);x.setDate(mon.getDate()+i);return x.toLocaleDateString('tr-TR',{day:'numeric',month:'short'});});
  const ad=M=='y',hd='<tr><th class="nmc">Personel</th>'+DAYS.map((d,i)=>'<th class="'+(i==td?'td':'')+'">'+dts[i]+'<br><span class="dn">'+VD_SH[i]+'</span></th>').join('')+'<th class="mc">Mesai<br><span class="dn">9 sa üzeri</span></th></tr>';
  const rows=st.map(s=>{
    const sh=(s.sec&&s.sec!==ps)?'<tr><td class="secr" colspan="9">'+esc(s.sec)+'</td></tr>':'';if(s.sec)ps=s.sec;
    let ot=0,hs=0;
    const tds=DAYS.map((d,i)=>{const c=vdCell(s.sh&&s.sh[i]);ot+=c.ot;hs+=c.h;return '<td class="c '+c.cls+(i==td?' tdy':'')+'">'+c.a+'</td>';}).join('');
    return sh+'<tr'+(s.id==me&&M=='g'?' class="mine"':'')+'><td class="nmc">'+esc(nice(s.name).toLocaleUpperCase('tr'))+(ad?'<div class="vda"><button onclick="shEdit(\''+s.id+'\')">✏️</button><button onclick="shDel(\''+s.id+'\')">🗑</button></div>':'')+'</td>'+tds
      +'<td class="mt">'+(ot?'<b>+'+vdF(ot)+'</b><small>'+vdF(hs)+' sa</small>':'<b class="z">–</b><small>'+(hs?vdF(hs)+' sa':'')+'</small>')+'</td></tr>';
  }).join('');
  const lg='<div class="vdl"><span><u class="off"></u>İzinli</span><span><u class="y"></u>08</span><span><u class="g"></u>10</span><span><u class="b"></u>12</span><span><u class="n"></u>14-16</span><span class="vdn">+ = 9 saati aşan mesai</span></div>';
  return wn+'<div class="vdw"><table class="vd">'+hd+rows+'</table></div>'+lg;
}
const styVD=document.createElement('style');
styVD.textContent='.vdw{border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#fff}table.vd{border-collapse:separate;border-spacing:0;table-layout:fixed;width:100%;color:#111827;font-size:10px}table.vd th,table.vd td{border-bottom:1px solid #eceff3;border-right:1px solid #f1f3f6;padding:5px 1px;text-align:center;vertical-align:middle;overflow:hidden}table.vd th{background:#7f1d1d;color:#fff;font-weight:700;font-size:9px;line-height:1.25;padding:6px 1px}table.vd th .dn{color:#fecaca;font-weight:600;font-size:8.5px}table.vd th.nmc{width:19%;text-align:left;padding-left:6px}table.vd th.mc{width:12%}table.vd th.td{background:#b91c1c}table.vd td.nmc{text-align:left;font-weight:800;font-size:9.5px;line-height:1.2;padding:5px 3px 5px 6px;background:#fff;color:#111827;word-break:break-word}table.vd td.secr{background:#fee2e2;color:#7f1d1d;font-weight:800;letter-spacing:.1em;text-align:left;padding:8px 8px;font-size:11px}table.vd td.c b{display:block;font-weight:800;font-size:10px;line-height:1.15}table.vd td.c i{display:block;font-style:normal;font-size:9.5px;line-height:1.15;opacity:.8}table.vd td.c em{display:block;font-style:normal;font-size:8.5px;font-weight:800;color:#b45309;line-height:1.2;margin-top:1px}table.vd td.c .vi{font-weight:800;font-size:9px;color:#991b1b}table.vd td.off{background:#fecaca}table.vd td.y{background:#fde047}table.vd td.g{background:#d1d5db}table.vd td.b{background:#93c5fd}table.vd td.n{background:#86efac}table.vd td.tdy{box-shadow:inset 0 0 0 2px #7f1d1d}table.vd td.mt{background:#fffbeb}table.vd td.mt b{display:block;font-size:11px;font-weight:800;color:#b45309}table.vd td.mt b.z{color:#9ca3af}table.vd td.mt small{display:block;font-size:8.5px;color:#6b7280}table.vd tr.mine td.nmc{outline:3px solid #facc15;outline-offset:-3px}.vda{margin-top:3px}.vda button{border:0;background:#f1f5f9;border-radius:6px;font-size:10px;padding:2px 5px;margin-right:3px}.vdl{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:11px;color:#cbd5e1;margin:10px 2px 0;align-items:center}.vdl u{display:inline-block;width:12px;height:12px;border-radius:4px;vertical-align:-2px;margin-right:4px;text-decoration:none}.vdl u.off{background:#fecaca}.vdl u.y{background:#fde047}.vdl u.g{background:#d1d5db}.vdl u.b{background:#93c5fd}.vdl u.n{background:#86efac}.vdn{opacity:.8}';
document.head.appendChild(styVD);
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
      const L=(await gs('listAiReports')).filter(r=>r.sube==B).map(x=>window.repNorm?window.repNorm(x):x);window.__reps=L;
      title='📁 Raporlar';acts=adm?b('aiUI()','📎 Excel ile oluştur','an'):'';
      const sel=L.find(r=>r.id==window.__repSel)||L[0];
      body=repTabs()+(sel?(adm?window.repBoard(sel):window.repMine(sel)):'')+(L.length?'<div class="sec2">📁 KAYITLI RAPORLAR <span>'+L.length+'</span></div><div class="lb">'+L.map(r=>`<div class="lr"${sel&&r.id==sel.id?' style="border-color:#6366f1"':''}><b class="av">📊</b><div class="lm"><div class="ln">${esc(r.title)}</div><div class="ls">${new Date(r.t).toLocaleDateString('tr-TR')} · ${(r.cols||[]).length} sütun</div></div><div class="rb2"><button class="x2 w" data-i="${esc(r.id)}" onclick="repOpen(this.dataset.i)">👁</button>${adm?`<button class="x2 w" data-i="${esc(r.id)}" onclick="repXls(this.dataset.i)">⬇</button>`:''}${adm?`<button class="x2 w" data-i="${esc(r.id)}" onclick="repDel(this.dataset.i)">✕</button>`:''}</div></div>`).join('')+'</div>':'<p class="sub" style="padding:10px">Henüz kaydedilmiş rapor yok.'+(adm?' 🤖 ile bir tane oluştur.':'')+'</p>');
    }else if(v=='video'){
      await window.vidLoad();
      title='🎬 Eğitim Videoları';
      acts=adm?b('vidPick()','⬆ Video yükle','an')+b('vidLink()','🔗 Link ekle')+b('vidAdTest()','📢 Reklamı dene'):'';
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
    }else if(v=='gm'){
      title='⭐ GM Raporu';
      if(!repVis()){body='<p class="sub" style="padding:10px">Bu bölüm sadece servis personeline açık.</p>';}
      else{try{await gmQuick();}catch(e){GM.L=[];}acts=adm?b('gmUp()','📤 Excel yükle','an'):'';body=gmHtml();}
    }else if(v=='adis'){
      title='🧾 Adisyon Bul';
      if(M!='y'){body='<p class="sub" style="padding:10px">Bu bölüm sadece yöneticiye açık.</p>';}
      else{try{await adLoad(false);}catch(e){AD.F=[];AD.meta=null;}acts=b('adUp()','📤 Adisyon raporu yükle','an')+(AD.meta?b('adClear()','🗑 Raporu sil','off'):'');body=adHtml(true);}
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
  if(v=='adis'&&M=='y')adPaint();
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
  const v=barVis()+'|'+repVis()+'|'+M;if(v!==BARVIS){BARVIS=v;nvDraw();if(M!='y'&&PGV=='adis')goPg('mola');if(!barVis()&&PGV=='bar')goPg('mola');if(!repVis()&&(PGV=='rep'||PGV=='gm'))goPg('mola');}
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


// ===== ⭐ GM Raporu (karne detay: gizli müşteri ziyaret raporları) =====
const GM={L:[],key:'',t:0};
const GM_MON={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,ocak:1,'şubat':2,subat:2,mart:3,nisan:4,'mayıs':5,mayis:5,haziran:6,temmuz:7,'ağustos':8,agustos:8,'eylül':9,eylul:9,ekim:10,'kasım':11,kasim:11,'aralık':12,aralik:12};
const GM_TR=['','Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
function gmPeriod(s){const m=String(s||'').trim().toLowerCase().match(/([a-zçğıöşü]+)\s+(\d{4})/);if(m&&GM_MON[m[1]]){const n=GM_MON[m[1]];return m[2]+'-'+(n<10?'0':'')+n;}return '0000-00';}
const gmPLabel=d=>{const m=String(d).match(/^(\d{4})-(\d{2})$/);return m&&+m[2]?GM_TR[+m[2]]+' '+m[1]:'Dönem belirsiz';};
function gmName(raw){let s=String(raw||'').trim();s=s.replace(/^.*\//,'').trim();if(!s||/muvafakat|yok|belirtilmemi|^[-–—\s]+$/i.test(s))return '';return s;}
const gmNum=x=>{const v=parseFloat(String(x).replace(',','.'));return isNaN(v)?null:v;};
function gmParse(text,buf){
  let R=[];
  if(/<table/i.test(text)){const d=new DOMParser().parseFromString(text,'text/html');d.querySelectorAll('tr').forEach(tr=>{R.push([].map.call(tr.children,c=>c.textContent.replace(/\s+/g,' ').trim()));});}
  else if(window.XLSX&&buf){const wb=XLSX.read(buf,{type:'array'});R=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''}).map(r=>r.map(x=>String(x).trim()));}
  const info={};let i=0;
  for(;i<R.length;i++){const k=String(R[i][0]||'').replace(/\s*:\s*$/,'').toLowerCase();if(k=='kriter')break;
    if(k.indexOf('bayi')==0)info.bayi=R[i][1];else if(k.indexOf('karne')==0)info.per=R[i][1];else if(k.indexOf('ziyaret')==0)info.z=R[i][1];else if(k.indexOf('satış')==0||k.indexOf('satis')==0)info.n=R[i][1];}
  if(i>=R.length)throw new Error('Karne formatı tanınmadı');
  const MAIN=['FİZİKİ DEĞERLENDİRMELER','MİSAFİR HİZMETLERİ'],rows=[],com=[];let cm=false;
  for(let j=i+1;j<R.length;j++){const r=R[j];if(!r[0]&&!r[1])continue;
    if(r[0]=='YORUMLAR'){cm=true;continue;}
    if(cm){if(r[1])com.push([r[0],r[1]]);continue;}
    const head=r[1]=='-',lv=!head?3:(r[0]=='GENEL SKOR'?0:(MAIN.indexOf(r[0])>-1?1:2));
    rows.push([r[0],head?'':r[1],gmNum(r[2]),gmNum(r[3]),gmNum(r[4]),gmNum(r[5]),lv]);}
  const gen=rows.find(x=>x[6]===0)||[0,'',null,null,null,null,0],per=gmPeriod(info.per),z=parseInt(info.z)||1;
  const bay=String(info.bayi||'');
  return{sube:/optimum/i.test(bay)?'opt':(/mavi/i.test(bay)?'mavi':B),d:per,z:z,n:gmName(info.n),bay:bay,g:gen[2],b:gen[3],rg:gen[4],t:gen[5],f:rows.filter(x=>x[6]===3&&x[2]!==null&&x[2]<100).length,rows:rows,com:com};
}
async function gmLoad(force){
  const k=B;if(!force&&GM.key===k&&Date.now()-GM.t<30000)return;
  await ready;const d=await col('cfg').doc('gm_'+k).get(),o=d.exists?(d.data().r||{}):{};
  GM.L=Object.keys(o).map(id=>Object.assign({id:id},o[id]));GM.key=k;GM.t=Date.now();
  try{localStorage.setItem('hm_gm_'+k,JSON.stringify({L:GM.L}));}catch(e){}
}
async function gmQuick(){
  const k=B;
  if(GM.key!==k){try{const c=JSON.parse(localStorage.getItem('hm_gm_'+k)||'null');if(c&&Array.isArray(c.L)){GM.L=c.L;GM.key=k;GM.t=0;}}catch(e){}}
  if(GM.key===k){
    if(Date.now()-GM.t>=30000&&!GM.bg){GM.bg=1;gmLoad(true).then(()=>{GM.bg=0;if(PGV=='gm')renderPg(true);}).catch(()=>{GM.bg=0;});}
    return;
  }
  await gmLoad(false);
}
const GMD={};
const gmCls=v=>v==null?'':(v>=90?'g':(v>=80?'o':'r'));
const gmSame=(a,b)=>{const f=s=>skN(s).split(/\s+/).filter(Boolean).sort().join(' ');return !!a&&!!b&&f(a)==f(b);};
function gmHtml(){
  const me=((D&&D.staff)||[]).find(x=>x.id==getMe()),adm=M=='y';
  if(!GM.L.length)return '<p class="sub" style="padding:10px">Henüz GM raporu yok.'+(adm?' Üstteki <b>Excel yükle</b> ile karne dosyalarını (.xls) ekle.':'')+'</p>';
  const G={};GM.L.forEach(r=>{(G[r.d]=G[r.d]||[]).push(r);});
  return Object.keys(G).sort().reverse().map(d=>{
    const L=G[d].sort((a,b)=>a.z-b.z),av=L.filter(x=>x.g!=null).reduce((q,x)=>q+x.g,0)/(L.filter(x=>x.g!=null).length||1);
    return '<div class="sec2">'+esc(gmPLabel(d))+' <span>ort. '+(Math.round(av*10)/10)+'</span></div>'+L.map(r=>{
      const mine=me&&gmSame(r.n,me.name);
      return '<div class="gmc"><div class="gmm" data-i="'+esc(r.id)+'" onclick="gmOpen(this.dataset.i)"><div class="gms '+gmCls(r.g)+'"><b>'+(r.g==null?'-':r.g)+'</b><small>Genel skor</small></div><div class="gmi"><div class="gmz">'+r.z+'. Ziyaret'+(mine?' <span class="gmme">SENİN</span>':'')+'</div>'
       +(r.n?'<div class="gmn"><b class="mav" data-nm="'+esc(r.n)+'">'+esc(ini(r.n))+'</b>'+esc(nice(r.n))+'</div>':'<div class="gmn miss">⚠ Personel adı yok</div>')
       +'<div class="gmx">Bayi '+(r.b==null?'-':r.b)+(r.f?' · '+r.f+' eksik':' · eksik yok')+'</div></div><div class="gmgo">›</div></div>'
       +(adm?'<div class="gma"><button class="skb" data-i="'+esc(r.id)+'" onclick="gmAssign(this.dataset.i)">👤 Personel '+(r.n?'değiştir':'ekle')+'</button><button class="skb d" data-i="'+esc(r.id)+'" onclick="gmDel(this.dataset.i)">🗑 Sil</button></div>':'')+'</div>';}).join('');
  }).join('');
}
window.gmOpen=async id=>{
  const r=GM.L.find(x=>x.id==id);if(!r)return;
  pop('⭐ '+r.z+'. Ziyaret · '+gmPLabel(r.d),'<p class="sub">Yükleniyor…</p>',true);
  try{
    const ck='hm_gmd_'+id+'_'+(r.at||0);let x=GMD[ck];
    if(!x){try{x=JSON.parse(localStorage.getItem(ck)||'null');}catch(e){}}
    if(!x){const d=await col('cfg').doc('gmd_'+id).get();x=d.exists?JSON.parse(d.data().rj||'{}'):{};try{localStorage.setItem(ck,JSON.stringify(x));}catch(e){}}
    GMD[ck]=x;const rows=x.rows||[],com=x.com||[];
    const sc=v=>v==null?'-':v,cl=(a,b)=>a!=null&&b!=null&&a<b?'r':'';
    let h='<div class="gmh"><div class="gms big '+gmCls(r.g)+'"><b>'+sc(r.g)+'</b><small>Genel skor</small></div><div>'+(r.n?'<b>'+esc(nice(r.n))+'</b>':'<b style="color:#fbbf24">Personel adı yok</b>')+'<div class="gmx">Görüşme '+sc(r.g)+' · Bayi '+sc(r.b)+'</div></div></div>';
    GMX.rows=rows;GMX.com=com;GMX.only=0;
    const nbad=rows.filter(q=>q[6]===3&&q[2]!=null&&q[2]<100).length;
    h+='<div class="gmf"><div class="seg" id="gmFs"><button class="on" onclick="gmOnly(0)">Tüm kriterler</button><button onclick="gmOnly(1)">⚠ Sadece eksikler ('+nbad+')</button></div></div><div id="gmAll">'+gmFull()+'</div>';
    if(com.length)h+='<div class="gmh2">💬 Yorumlar</div>'+com.map(c=>'<div class="gmk"><small>'+esc(c[0])+'</small>'+esc(c[1])+'</div>').join('');
    $('mf').innerHTML=h;
  }catch(e){$('mf').innerHTML='<p class="sub">Detay okunamadı: '+esc(emsg(e))+'</p>';}
};
window.gmUp=()=>{
  const i=document.createElement('input');i.type='file';i.multiple=true;i.accept='.xls,.xlsx,.html,.htm';
  i.onchange=async()=>{
    const F=[].slice.call(i.files);if(!F.length)return;msg('⏳ '+F.length+' dosya okunuyor…');
    let ok=0,miss=0;const bad=[];
    for(const f of F){try{
      const buf=await f.arrayBuffer(),p=gmParse(new TextDecoder('utf-8').decode(buf).replace(/^\uFEFF/,''),buf);
      const id=p.sube+'_'+p.d.replace('-','')+'_'+p.z,ref=col('cfg').doc('gm_'+p.sube),ex=await ref.get(),old=ex.exists&&ex.data().r&&ex.data().r[id];
      let n=p.n,m=0;if(!n&&old&&old.n){n=old.n;m=1;}
      const ent={d:p.d,z:p.z,n:n,m:m,bay:p.bay,g:p.g,b:p.b,rg:p.rg,t:p.t,f:p.f,at:Date.now()};
      const bt=firebase.firestore().batch();bt.set(ref,{r:{[id]:ent}},{merge:true});bt.set(col('cfg').doc('gmd_'+id),{rj:JSON.stringify({rows:p.rows,com:p.com})});await bt.commit();
      ok++;if(!n)miss++;
    }catch(e){bad.push(f.name+': '+(e.message||e));}}
    await gmLoad(true);renderPg(true);
    msg((ok?'✅ '+ok+' rapor yüklendi.':'')+(miss?'\n⚠ '+miss+' raporda personel adı yok: kartta “Personel ekle”ye bas.':'')+(bad.length?'\n❌ '+bad.join('\n'):''));
  };
  i.click();
};
window.gmAssign=id=>{
  const r=GM.L.find(x=>x.id==id);if(!r)return;
  const names=((D&&D.staff)||[]).map(s=>s.name).sort((a,b)=>a.localeCompare(b,'tr'));
  pop('👤 Personel · '+r.z+'. Ziyaret','<label style="display:block;font-size:12px;opacity:.7;margin-bottom:4px">Listeden seç</label><select id="gmSel" class="rsel"><option value="">— seç —</option>'+names.map(n=>'<option value="'+esc(n)+'"'+(gmSame(n,r.n)?' selected':'')+'>'+esc(nice(n))+'</option>').join('')+'</select><label style="display:block;font-size:12px;opacity:.7;margin:6px 0 4px">veya listede yoksa ismi yaz</label><input id="gmTxt" class="rsel" placeholder="Ad Soyad" value="'+(r.n&&!names.some(n=>gmSame(n,r.n))?esc(r.n):'')+'">');
  $('mo').textContent='Kaydet';if($('mc')){$('mc').style.display='';$('mc').textContent='İptal';$('mc').onclick=()=>{$('ov').hidden=true;};}
  $('mo').onclick=async()=>{
    const n=($('gmTxt').value.trim()||$('gmSel').value||'').slice(0,60);$('ov').hidden=true;
    try{await col('cfg').doc('gm_'+B).update({['r.'+id+'.n']:n,['r.'+id+'.m']:n?1:0});await gmLoad(true);renderPg(true);}catch(e){msg(emsg(e));}
  };
};
window.gmDel=id=>{
  const r=GM.L.find(x=>x.id==id);if(!r)return;if(!confirm(r.z+'. Ziyaret raporu ('+gmPLabel(r.d)+') silinsin mi?'))return;
  (async()=>{try{await col('cfg').doc('gm_'+B).update({['r.'+id]:firebase.firestore.FieldValue.delete()});await col('cfg').doc('gmd_'+id).delete();await gmLoad(true);renderPg(true);}catch(e){msg(emsg(e));}})();
};
const styGM=document.createElement('style');
styGM.textContent='.gmc{background:#172033;border:1px solid rgba(148,163,184,.14);border-radius:18px;margin-bottom:10px;overflow:hidden}.gmm{display:flex;align-items:center;gap:12px;padding:12px}.gms{flex:none;width:64px;height:64px;border-radius:18px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#334155;color:#fff}.gms b{font-size:24px;line-height:1}.gms small{font-size:9px;opacity:.85;margin-top:2px}.gms.g{background:linear-gradient(135deg,#10b981,#047857)}.gms.o{background:linear-gradient(135deg,#f59e0b,#b45309)}.gms.r{background:linear-gradient(135deg,#ef4444,#991b1b)}.gms.big{width:78px;height:78px}.gms.big b{font-size:30px}.gmi{flex:1;min-width:0}.gmz{font-weight:800;font-size:15px}.gmme{font-size:10px;background:#f59e0b;color:#1c1917;border-radius:8px;padding:2px 6px;margin-left:6px;vertical-align:middle}.gmn{display:flex;align-items:center;gap:6px;margin-top:4px;font-size:14px;font-weight:700}.gmn.miss{color:#fbbf24}.gmx{font-size:11.5px;color:#94a3b8;margin-top:3px}.gmgo{font-size:26px;color:#64748b}.gma{display:flex;gap:8px;padding:0 12px 12px}.gmh{display:flex;align-items:center;gap:14px;margin-bottom:12px}.gmt{overflow-x:auto;margin-bottom:12px}.gmt table{width:100%;border-collapse:collapse;font-size:12.5px}.gmt th{font-size:10.5px;color:#94a3b8;padding:4px 6px;text-align:right}.gmt th:first-child,.gmt td:first-child{text-align:left}.gmt td{padding:6px;text-align:right;border-top:1px solid rgba(148,163,184,.14)}.gmt tr.l1 td{font-weight:800;background:rgba(148,163,184,.1)}.gmt tr.l0 td{font-weight:800}.gmt tr.l2 td:first-child{padding-left:14px}.gmt td.r{color:#fb7185;font-weight:800}.gmh2{font-weight:800;margin:12px 0 6px}.gmb{display:flex;gap:10px;align-items:flex-start;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:12px;padding:8px 10px;margin-bottom:6px;font-size:13px}.gmb>b{flex:none;background:#ef4444;color:#fff;border-radius:8px;padding:2px 8px}.gmb small{display:block;color:#94a3b8;margin-top:2px}.gmk{background:#0f172a;border-radius:12px;padding:10px;margin-bottom:6px;font-size:13px;line-height:1.45}.gmk small{display:block;color:#94a3b8;font-weight:700;margin-bottom:3px}';
document.head.appendChild(styGM);


// ===== 🧾 Adisyon Bul (yönetici): ürün seç → o ürünlerin geçtiği adisyonlar =====
const AD={F:[],meta:null,key:'',t:0,P:[],sel:[],q:'',mode:'any',gar:'',n:60};
const adFmtD=s=>{const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'.'+m[2]+'.'+m[1]:s||'';};
const adMoney=v=>(Math.round((v||0)*100)/100).toLocaleString('tr-TR',{minimumFractionDigits:0,maximumFractionDigits:2});
function adParse(aoa){
  let hi=-1,C={};
  for(let i=0;i<Math.min(aoa.length,60)&&hi<0;i++){
    const f=aoa[i].map(c=>skN(c).trim());
    if(f.indexOf('fis no')>-1&&f.some(x=>x.indexOf('urun adi')==0)){
      hi=i;
      f.forEach((x,j)=>{
        if(x=='tarih'&&C.d==null)C.d=j;
        else if(x=='saat'&&C.s==null)C.s=j;
        else if(x.indexOf('acilis')>-1&&C.o==null)C.o=j;
        else if(x.indexOf('kapanis')>-1&&C.c==null)C.c=j;
        else if(x=='fis no')C.n=j;
        else if(x=='masa'&&C.m==null)C.m=j;
        else if(x=='masa adi')C.ma=j;
        else if(x.indexOf('urun adi')==0)C.p=j;
        else if(x.indexOf('personel')==0||x=='garson')C.g=j;
        else if(x=='adet')C.q=j;
        else if(x=='toplam'&&C.t==null)C.t=j;
      });
    }
  }
  if(hi<0||C.p==null||C.n==null)throw new Error('Adisyon raporu formatı tanınmadı (Fiş No / Ürün Adı sütunları yok)');
  const serial=v=>{if(typeof v=='number')return v;const s=String(v||'').trim().replace(',','.');return /^\d+(\.\d+)?$/.test(s)?parseFloat(s):NaN;};
  const day=v=>new Date(Date.UTC(1899,11,30)+Math.floor(v)*864e5).toISOString().slice(0,10);
  const hm=v=>{if(!(v>=0))return '';let s=Math.round((v-Math.floor(v))*86400);if(s>=86400)s=86399;const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return (h<10?'0':'')+h+':'+(m<10?'0':'')+m;};
  const G=new Map();let mn='9999',mx='0000',hasOC=false;
  for(let i=hi+1;i<aoa.length;i++){
    const r=aoa[i],fn=serial(r[C.n]);if(!(fn>0))continue;
    const sv=C.s!=null?serial(r[C.s]):NaN,dv=C.d!=null?serial(r[C.d]):NaN;
    const dd=sv>=1?day(sv):(dv>=1?day(dv):'');if(!dd)continue;
    const ov=C.o!=null?serial(r[C.o]):NaN,cv=C.c!=null?serial(r[C.c]):NaN;
    const tm=hm(sv),to=hm(ov),tc=hm(cv);if(to||tc)hasOC=true;
    const nm=String(r[C.p]||'').trim();if(!nm)continue;
    const qty=serial(r[C.q]),tot=serial(r[C.t]);
    const k=dd+'|'+fn;let f=G.get(k);
    if(!f){f={d:dd,n:fn,m:String(r[C.m]==null?'':r[C.m]).trim(),mn:C.ma!=null?String(r[C.ma]||'').trim():'',g:String(r[C.g]||'').trim(),a:to||tm,c:tc||tm,it:new Map(),t:0};G.set(k,f);}
    if(to&&(!f.a||to<f.a))f.a=to;if(tm&&!to&&(!f.a||tm<f.a))f.a=tm;
    if(tc&&tc>f.c)f.c=tc;if(tm&&!tc&&tm>f.c)f.c=tm;
    let it=f.it.get(nm);if(!it){it=[nm,0,0];f.it.set(nm,it);}
    it[1]+=isNaN(qty)?0:qty;it[2]+=isNaN(tot)?0:tot;f.t+=isNaN(tot)?0:tot;
    if(dd<mn)mn=dd;if(dd>mx)mx=dd;
  }
  const F=[...G.values()].map(f=>[f.d,f.n,f.mn||f.m,f.g,f.a,f.c,Math.round(f.t*100)/100,[...f.it.values()].filter(x=>Math.abs(x[1])>1e-9||Math.abs(x[2])>1e-9).map(x=>[x[0],x[1],Math.round(x[2]*100)/100])]).filter(f=>f[7].length);
  if(!F.length)throw new Error('Dosyada adisyon satırı bulunamadı');
  return{F:F,from:mn,to:mx,oc:hasOC};
}
async function adLoad(force){
  const k=B;if(!force&&AD.key===k&&Date.now()-AD.t<60000)return;
  await ready;const md=await col('cfg').doc('adis_'+k).get();
  if(!md.exists){AD.F=[];AD.meta=null;}
  else{
    const m=md.data(),ids=[];for(let i=0;i<(m.parts||0);i++)ids.push(i);
    const ds=await Promise.all(ids.map(i=>col('cfg').doc('adis_'+k+'_'+i).get()));
    let F=[];ds.forEach(d=>{if(d.exists)try{F=F.concat(JSON.parse(d.data().j||'[]'));}catch(e){}});
    AD.F=F;AD.meta=m;
  }
  const P=new Map();AD.F.forEach(f=>f[7].forEach(x=>{if(x[1]>0)P.set(x[0],(P.get(x[0])||0)+x[1]);}));
  AD.P=[...P.entries()].sort((a,b)=>b[1]-a[1]).map(x=>({n:x[0],k:skN(x[0]),c:x[1]}));
  AD.key=k;AD.t=Date.now();
  AD.sel=AD.sel.filter(s=>s.x?AD.P.some(p=>p.n==s.n):true);
}
function adFind(){
  const T=AD.sel.map(s=>({k:skN(s.n),x:s.x}));
  if(!T.length)return null;
  const hit=(f,t)=>f[7].some(x=>x[1]>0&&(t.x?skN(x[0])==t.k:skN(x[0]).indexOf(t.k)>-1));
  let L=AD.F.filter(f=>AD.mode=='all'?T.every(t=>hit(f,t)):T.some(t=>hit(f,t)));
  if(AD.gar)L=L.filter(f=>f[3]==AD.gar);
  return L.sort((a,b)=>(b[0]+(b[4]||''))>(a[0]+(a[4]||''))?1:-1);
}
const adIsHit=(nm)=>AD.sel.some(s=>s.x?skN(nm)==skN(s.n):skN(nm).indexOf(skN(s.n))>-1);
function adCard(f){
  const oc=AD.meta&&AD.meta.oc,tm=oc?'<span>🟢 Açılış <b>'+esc(f[4]||'-')+'</b></span><span>🔴 Kapanış <b>'+esc(f[5]||'-')+'</b></span>':'<span>🕐 Saat <b>'+esc(f[4]||'-')+'</b></span>';
  return '<div class="adc"><div class="adh"><div class="adm"><small>MASA</small><b>'+esc(f[2]||'-')+'</b></div><div class="adi"><div class="adg">👤 '+esc(nice(f[3])||'Garson yok')+'</div><div class="adt">'+tm+'<span>📅 '+adFmtD(f[0])+'</span></div></div><div class="adp"><small>Fiş '+f[1]+'</small><b>'+adMoney(f[6])+' ₺</b></div></div>'
    +'<div class="adl">'+f[7].filter(x=>x[1]>0).map(x=>'<span class="'+(adIsHit(x[0])?'hit':'')+'">'+(x[1]!=1?x[1]+'× ':'')+esc(x[0])+'</span>').join('')+'</div></div>';
}
window.adPaint=()=>{
  const sg=$('adSug'),sl=$('adSel'),rs=$('adRes');if(!sg||!rs)return;
  const q=skN(AD.q).trim();
  sg.innerHTML=q?(['<button class="adb mix" data-t="'+esc(AD.q.trim())+'" onclick="adAdd(this.dataset.t,0)">🔎 “'+esc(AD.q.trim())+'” içeren tüm ürünler</button>']
    .concat(AD.P.filter(p=>p.k.indexOf(q)>-1&&!AD.sel.some(s=>s.x&&s.n==p.n)).slice(0,10).map(p=>'<button class="adb" data-t="'+esc(p.n)+'" onclick="adAdd(this.dataset.t,1)">'+esc(p.n)+'<small>'+p.c+'</small></button>'))).join(''):'';
  sl.innerHTML=AD.sel.map((s,i)=>'<button class="adx" onclick="adDel('+i+')">'+esc(s.n)+(s.x?'':'*')+' ✕</button>').join('');
  const L=adFind(),gars=[...new Set(AD.F.map(f=>f[3]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));
  const ctl=$('adCtl');if(ctl)ctl.innerHTML='<div class="seg"><button class="'+(AD.mode=='any'?'on':'')+'" onclick="adMode(\'any\')">Herhangi biri</button><button class="'+(AD.mode=='all'?'on':'')+'" onclick="adMode(\'all\')">Hepsi aynı adisyonda</button></div>'
    +'<select class="rsel" onchange="adGar(this.value)"><option value="">Tüm garsonlar</option>'+gars.map(g=>'<option value="'+esc(g)+'"'+(g==AD.gar?' selected':'')+'>'+esc(nice(g))+'</option>').join('')+'</select>';
  if(!AD.meta){rs.innerHTML='<p class="sub" style="padding:10px">Henüz adisyon raporu yüklenmemiş. Üstteki <b>📤 Adisyon raporu yükle</b> ile “Fiş Journal Raporu - Ürün Detay” (.xls) dosyasını ekle.</p>';return;}
  if(!L){rs.innerHTML='<p class="sub" style="padding:10px">Yukarıya ürün adı yaz (ör. cola, karışık pizza), listeden seç. Seçtiğin ürünlerin geçtiği tüm adisyonlar burada çıkar.</p>';return;}
  const tot=L.reduce((a,f)=>a+f[6],0);
  rs.innerHTML='<div class="adsum"><b>'+L.length+'</b> adisyon bulundu'+(L.length?' · toplam '+adMoney(tot)+' ₺':'')+'<button class="adxl" onclick="adXls()">⬇ Excel</button></div>'
    +L.slice(0,AD.n).map(adCard).join('')+(L.length>AD.n?'<button class="a ed" style="width:100%;margin:6px 0" onclick="adMore()">Daha fazla göster ('+(L.length-AD.n)+' kaldı)</button>':'');
};
window.adType=v=>{AD.q=v;adPaint();};
window.adAdd=(t,x)=>{t=String(t||'').trim();if(!t)return;if(!AD.sel.some(s=>s.n==t&&!!s.x==!!x))AD.sel.push({n:t,x:!!x});AD.q='';AD.n=60;const i=$('adQ');if(i){i.value='';i.focus();}adPaint();};
window.adDel=i=>{AD.sel.splice(i,1);AD.n=60;adPaint();};
window.adMode=m=>{AD.mode=m;AD.n=60;adPaint();};
window.adGar=g=>{AD.gar=g;AD.n=60;adPaint();};
window.adMore=()=>{AD.n+=100;adPaint();};
window.adXls=()=>{
  const L=adFind()||[],oc=AD.meta&&AD.meta.oc;
  dlX([['Adisyonlar',[['Tarih'].concat(oc?['Açılış','Kapanış']:['Saat'],['Fiş No','Masa','Garson','Ürünler','Tutar'])].concat(L.map(f=>[adFmtD(f[0])].concat(oc?[f[4],f[5]]:[f[4]],[f[1],f[2],f[3],f[7].filter(x=>x[1]>0).map(x=>(x[1]!=1?x[1]+'× ':'')+x[0]).join(', '),f[6]])))]],'adisyon-bul');
};
window.adUp=()=>{
  const i=document.createElement('input');i.type='file';i.accept='.xls,.xlsx,.html,.htm';
  i.onchange=async()=>{
    const f=i.files&&i.files[0];if(!f)return;msg('⏳ Adisyon raporu okunuyor… (büyük dosya, biraz sürebilir)');
    try{
      if(!window.__readXls)throw new Error('Excel okuyucu hazır değil, sayfayı yenileyip tekrar dene');
      const aoa=await window.__readXls(f),p=adParse(aoa),k=B,CH=700,parts=Math.ceil(p.F.length/CH);
      const old=await col('cfg').doc('adis_'+k).get(),oldParts=old.exists?(old.data().parts||0):0;
      for(let s=0;s<parts;s+=1){await col('cfg').doc('adis_'+k+'_'+s).set({j:JSON.stringify(p.F.slice(s*CH,(s+1)*CH))});}
      await col('cfg').doc('adis_'+k).set({parts:parts,cnt:p.F.length,from:p.from,to:p.to,oc:p.oc,at:Date.now(),fn:f.name});
      for(let s=parts;s<oldParts;s++){try{await col('cfg').doc('adis_'+k+'_'+s).delete();}catch(e){}}
      await adLoad(true);renderPg(true);
      msg('✅ '+p.F.length+' adisyon yüklendi ('+adFmtD(p.from)+' – '+adFmtD(p.to)+').'+(p.oc?'':'\nℹ Bu raporda fiş başına tek saat var; açılış/kapanış ayrı verilmemiş.'));
    }catch(e){msg('❌ '+emsg(e));}
  };
  i.click();
};
window.adClear=()=>{
  if(!AD.meta){msg('Silinecek rapor yok.');return;}
  const m=AD.meta;
  ask('🧾 '+BR[B]+' adisyon raporu silinsin mi?\n'+m.cnt+' adisyon · '+adFmtD(m.from)+' – '+adFmtD(m.to),[],async()=>{
    try{
      const k=B,parts=m.parts||0;
      for(let q=0;q<parts;q++){try{await col('cfg').doc('adis_'+k+'_'+q).delete();}catch(e){}}
      await col('cfg').doc('adis_'+k).delete();
      AD.F=[];AD.meta=null;AD.P=[];AD.sel=[];AD.key='';AD.t=0;
      await adLoad(true);renderPg(true);msg('🗑 Adisyon raporu silindi.');
    }catch(e){msg(emsg(e));}
  },'Sil');
};
function adHtml(adm){
  const m=AD.meta;
  return '<div class="admeta">'+(m?'🧾 <b>'+m.cnt+'</b> adisyon · '+adFmtD(m.from)+' – '+adFmtD(m.to)+' · '+esc(BR[B]||'')+(m.oc?'':'<br><small>Rapordaki saat fiş başına tek değer olduğu için “Saat” olarak gösterilir.</small>'):'Adisyon raporu yok')+'</div>'
    +'<input id="adQ" class="skq" type="search" autocomplete="off" placeholder="Ürün adı yaz… (cola, karışık pizza)" value="'+esc(AD.q)+'" oninput="adType(this.value)">'
    +'<div id="adSug" class="adsug"></div><div id="adSel" class="adsel"></div><div id="adCtl" class="adctl"></div><div id="adRes"></div>';
}
const styAD=document.createElement('style');
styAD.textContent='.admeta{font-size:12.5px;color:#94a3b8;margin:2px 2px 10px;line-height:1.5}.admeta b{color:#e2e8f0}.adsug,.adsel{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.adb{border:1px solid rgba(148,163,184,.25);background:#172033;color:#e2e8f0;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:600}.adb small{margin-left:6px;opacity:.6;font-size:11px}.adb.mix{border-color:#6366f1;color:#c7d2fe}.adx{border:0;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:700}.adctl{display:flex;flex-direction:column;gap:8px;margin:6px 0 12px}.adsum{display:flex;align-items:center;gap:6px;font-size:14px;margin:4px 2px 10px}.adsum b{font-size:20px;color:#2ee6a6}.adxl{margin-left:auto;border:1px solid rgba(148,163,184,.3);background:#0f172a;color:#e2e8f0;border-radius:10px;padding:7px 11px;font-size:12px;font-weight:700}.adc{background:#172033;border:1px solid rgba(148,163,184,.14);border-radius:18px;padding:12px;margin-bottom:10px;box-shadow:0 6px 18px rgba(0,0,0,.22)}.adh{display:flex;align-items:center;gap:10px}.adm{flex:none;width:54px;height:54px;border-radius:15px;background:linear-gradient(135deg,#0ea5e9,#6366f1);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff}.adm small{font-size:8.5px;opacity:.85;letter-spacing:.5px}.adm b{font-size:19px;line-height:1.1}.adi{flex:1;min-width:0}.adg{font-weight:800;font-size:15px;word-break:break-word}.adt{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:12px;color:#94a3b8;margin-top:3px}.adt b{color:#e2e8f0}.adp{flex:none;text-align:right}.adp small{display:block;font-size:10.5px;color:#94a3b8}.adp b{font-size:14px}.adl{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px;padding-top:9px;border-top:1px solid rgba(148,163,184,.14)}.adl span{font-size:12px;background:#0f172a;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;border-radius:9px;padding:4px 8px}.adl span.hit{background:rgba(251,191,36,.18);border-color:#f59e0b;color:#fde68a;font-weight:800}';
document.head.appendChild(styAD);

// GM detay: bütün kriterler (karne detayındaki gibi)
const styGM2=document.createElement('style');
styGM2.textContent='.gmf{display:flex;gap:8px;align-items:center;margin:4px 0 10px;flex-wrap:wrap}.gmf .seg{margin:0;flex:1}.gmk3{background:#172033;border:1px solid rgba(148,163,184,.14);border-radius:14px;padding:10px;margin-bottom:7px}.gmk3.bad{border-color:rgba(239,68,68,.55);background:rgba(239,68,68,.08)}.gmk3 .t{font-size:13.5px;line-height:1.35;font-weight:600;word-break:break-word}.gmk3 .v{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center}.gmk3 .ans{font-size:11.5px;font-weight:800;border-radius:999px;padding:3px 10px;background:rgba(148,163,184,.2);color:#e2e8f0}.gmk3.bad .ans{background:rgba(239,68,68,.25);color:#fca5a5}.gmk3 .sc{font-size:11px;color:#94a3b8;background:#0f172a;border-radius:8px;padding:3px 7px}.gmk3 .sc b{color:#e2e8f0;font-size:12px}.gmk3 .sc.r b{color:#fb7185}.gmsec{display:flex;align-items:center;gap:8px;margin:14px 0 6px;padding:9px 10px;border-radius:12px;font-weight:800;font-size:13px;background:rgba(99,102,241,.18);color:#e0e7ff}.gmsec.l2{background:rgba(148,163,184,.14);color:#e2e8f0;font-size:12.5px;margin-top:10px}.gmsec span{margin-left:auto;font-size:11px;font-weight:700;opacity:.9;white-space:nowrap}';
document.head.appendChild(styGM2);
const styZap=document.createElement('style');
styZap.textContent='.zap{position:relative}.zap .bolt{position:absolute;pointer-events:none;z-index:6;font-size:30px;line-height:1;opacity:0;filter:drop-shadow(0 0 5px #fde047) drop-shadow(0 0 14px #facc15);animation:zapf 3.6s infinite}.pd.zap .b1{left:-6px;top:4px}.pd.zap .b2{right:-4px;top:34px;font-size:24px;animation-delay:.14s}.pd.zap .b3{left:42%;top:-20px;font-size:26px;animation-delay:.28s}.tr1.zap .b1{right:8px;top:-10px;animation-delay:.1s}.tr1.zap .b2{left:34px;bottom:-10px;font-size:22px;animation-delay:.3s}@keyframes zapf{0%,80%,100%{opacity:0;transform:scale(.5) rotate(-12deg)}82%{opacity:1;transform:scale(1.3) rotate(-12deg)}84%{opacity:.1}86%{opacity:1;transform:scale(1) rotate(-12deg)}92%{opacity:0;transform:scale(1.1) rotate(-12deg)}}.pd.zap .av{animation:zapg 3.6s infinite}.tr1.zap{animation:zapg 3.6s infinite}@keyframes zapg{0%,80%,100%{box-shadow:0 0 0 0 rgba(253,224,71,0)}82%,86%{box-shadow:0 0 28px 8px rgba(253,224,71,.9)}84%{box-shadow:0 0 0 0 rgba(253,224,71,0)}}@media (prefers-reduced-motion:reduce){.zap .bolt,.pd.zap .av,.tr1.zap{animation:none}}.gmsec{flex-wrap:wrap}';
document.head.appendChild(styZap);
const GMX={rows:[],com:[],r:null,only:0};
function gmFull(){
  const sc=v=>v==null?'-':v,rows=GMX.rows,out=[];
  rows.forEach(q=>{
    const lv=q[6];
    if(lv<=2){
      if(GMX.only)return;
      out.push('<div class="gmsec'+(lv==2?' l2':'')+'">'+esc(q[0])+'<span>Görüşme '+sc(q[2])+' · Bayi '+sc(q[3])+'</span></div>');
    }else{
      const bad=q[2]!=null&&q[2]<100;if(GMX.only&&!bad)return;
      out.push('<div class="gmk3'+(bad?' bad':'')+'"><div class="t">'+esc(q[0])+'</div><div class="v"><span class="ans">'+(esc(q[1])||'-')+'</span><span class="sc'+(bad?' r':'')+'">Görüşme <b>'+sc(q[2])+'</b></span><span class="sc">Bayi <b>'+sc(q[3])+'</b></span></div></div>');
    }
  });
  return out.length?out.join(''):'<p class="sub">Eksik çıkan madde yok. 👏</p>';
}
window.gmOnly=v=>{GMX.only=v;const e=$('gmAll');if(e)e.innerHTML=gmFull();const b=$('gmFs');if(b)b.innerHTML='<button class="'+(v?'':'on')+'" onclick="gmOnly(0)">Tüm kriterler</button><button class="'+(v?'on':'')+'" onclick="gmOnly(1)">⚠ Sadece eksikler ('+GMX.rows.filter(q=>q[6]===3&&q[2]!=null&&q[2]<100).length+')</button>';};

window.rezOK=()=>{try{if(M=='y')return true;if(M!='g')return false;const me=((D&&D.staff)||[]).find(x=>x.id==getMe());return !!me&&/HOSTES/.test(String(me.sec||'').toLocaleUpperCase('tr').replace(/İ/g,'I'));}catch(e){return false;}};
window.adWho=()=>{try{if(!repVis())return false;if(M=='y')return true;const me=((D&&D.staff)||[]).find(x=>x.id==getMe());if(!me)return false;const sec=String(me.sec||'').toLocaleUpperCase('tr').replace(/İ/g,'I');return !(/HOSTES|RUNNER|BAR/.test(sec)||barIsBar(me));}catch(e){return false;}};
const d2=window.draw;window.draw=function(){d2();nvDraw();barWatch();radioAdmin();pgSync();if(window.vidAdBoot)window.vidAdBoot();};
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
function podium(it,bolt){
  const o=it.length>=3?[1,0,2]:it.length==2?[1,0]:[0],h=[112,86,68],mk=['🥇','🥈','🥉'];
  return '<div class="pod">'+o.map(i=>{const x=it[i];return `<div class="pd g${i+1}${i==0&&bolt?' zap':''}"><div class="pm">${i==0?'🏆':''}</div>${i==0&&bolt?'<span class="bolt b1">⚡</span><span class="bolt b2">⚡</span><span class="bolt b3">⚡</span>':''}<b class="av big" data-nm="${esc(x.name)}">${esc(ini(x.name))}</b><div class="pn">${esc(nice(x.name).split(' ')[0])}</div><div class="pv">${x.val}</div><div class="ps">${x.sub||''}</div><div class="pb" style="height:${h[i]}px">${mk[i]}</div></div>`;}).join('')+'</div>';
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
  h+=podium(L.slice(0,3).map(r=>({name:r.name,val:top(r),sub:ci?'ort. '+tl2(r.ort)+' TL':fmt(r.hesap)+' hesap · ciro '+fmt(Math.round(r.ciro))+' TL'})),1);
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
function lbQty(L,adm,T,lbl,pr){
  pr=pr||0;const tlf=x=>(Math.round(x*100)/100).toLocaleString('tr-TR'),pm=r=>pr>0?'💰 <b>'+tlf(r.qty*pr)+' TL</b> prim':'';
  const n=L.length,mx=L[0].qty||1,tq=L.reduce((a,r)=>a+r.qty,0),hit=T>0?L.filter(r=>r.qty>=T).length:0,near=T>0?L.filter(r=>r.qty<T)[0]:null,low=Math.min(4,Math.max(0,n-3));
  const rem=r=>T>0?(r.qty>=T?'🎉 Hedef tamam (+'+fmt(r.qty-T)+')':'Kalan <b>'+fmt(T-r.qty)+'</b>'):'';
  let h='<div class="kp"><div><b>'+(T>0?fmt(T):esc(nice(L[0].name).split(' ')[0]))+'</b><span>'+(T>0?'Hedef kota':'Lider')+'</span></div><div><b>'+(T>0?hit+' / '+n:n)+'</b><span>'+(T>0?'Hedefe ulaşan':'Garson')+'</span></div><div><b>'+fmt(tq)+'</b><span>Toplam miktar</span></div></div>';
  if(pr>0)h+='<div class="hot" style="background:linear-gradient(135deg,#047857,#065f46);margin-bottom:10px">💰 Toplam prim: <b>'+tlf(tq*pr)+' TL</b><br><small style="opacity:.85">Adet başı '+pr+' TL × '+fmt(tq)+' adet</small></div>';
  h+=ringBox(tq,T,n);h+='<div class="hot">'+(T>0?(near?'🔥 '+esc(nice(near.name))+' hedefe sadece <b>'+fmt(T-near.qty)+'</b> kaldı! Hedef: '+fmt(T):'🎉 Herkes hedefi geçti, tebrikler!'):'🔥 '+esc(nice(L[0].name))+' '+lbl+' satışında zirvede! Sen de yükselebilirsin.')+'</div>';
  h+=podium(L.slice(0,3).map(r=>({name:r.name,val:fmt(r.qty),sub:(rem(r)&&pm(r)?rem(r)+' · ':rem(r))+pm(r)})));
  h+='<div class="lb">'+L.map((r,i)=>{
    if(!adm&&i<3)return '';
    const p=(T>0?r.qty/T:r.qty/mx)*100,rk=i+1,dn=T<=0&&rk>n-low;
    return lbRow(rk,r,fmt(r.qty)+'<small>miktar</small>',(T>0?rem(r)+' · hedef '+fmt(T):(i?'lidere '+fmt(mx-r.qty)+' kaldı':'Lider'))+(pr>0?' · '+pm(r):''),p,T>0?(p>=100?'g':(p>=70?'o':'r')):(dn?'r':(i<3?'g':'o')),T>0?(p>=100?'<span class="tr u">✓ Hedef</span>':''):(dn?'<span class="tr d">▼ Düşüşte</span>':(i<3?'<span class="tr u">▲ Zirvede</span>':'')),r.key,adm,'k');
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
const ANS=(function(){
  try{
    const sr=16000,sec=8.5,n=Math.floor(sr*sec),x=new Float32Array(n);
    const P=[[0.5,0.35,2.2],[1,1,3.0],[1.2,0.55,3.6],[1.5,0.35,4.2],[2,0.5,5.0],[2.5,0.25,6.5],[3,0.2,7.5],[4.2,0.12,9.0]];
    for(let t0=0;t0<6.5;t0+=1.2){            // 6 çan vuruşu, 1,2 sn arayla
      const st=Math.floor(t0*sr);
      for(let k=st;k<n;k++){
        const t=(k-st)/sr;if(t>2.6)break;let a=0;
        for(let q=0;q<P.length;q++)a+=P[q][1]*Math.exp(-t*P[q][2]*0.8)*Math.sin(6.2831853*660*P[q][0]*t);
        x[k]+=a*Math.min(1,t/0.003);
      }
    }
    let mx=0;for(let k=0;k<n;k++)if(Math.abs(x[k])>mx)mx=Math.abs(x[k]);
    const buf=new ArrayBuffer(44+n*2),v=new DataView(buf),w=(o,t)=>{for(let q=0;q<t.length;q++)v.setUint8(o+q,t.charCodeAt(q));};
    w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);
    for(let k=0;k<n;k++)v.setInt16(44+k*2,Math.round(x[k]/(mx||1)*0.85*32767),true);
    return URL.createObjectURL(new Blob([buf],{type:'audio/wav'}));
  }catch(e){return '';}
})();
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
// Aynı ürün grubunun farklı yazımlarını (Tatlı / Tatlılar, Başlangıç / Başlangıçlar, Bira / Biralar…) tek sütunda birleştir
window.repNorm=function(r){
  try{
    const cols=r.cols||[],rows=JSON.parse(r.rj||'[]');
    const ca=c=>{const k=String(c||'').toLocaleLowerCase('tr').replace(/ı/g,'i').replace(/ş/g,'s').replace(/ç/g,'c').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ö/g,'o').replace(/[^a-z0-9& ]/g,'').replace(/\s+/g,' ').trim();
      if(/^tatli(lar|lari)?$/.test(k))return 'Tatlı';if(/^baslangic(lar|lari)?$/.test(k))return 'Başlangıç';if(/^bira(lar|lari)?$/.test(k))return 'Bira';return String(c||'');};
    const nc=cols.map((c,i)=>i==0?c:ca(c)),first={},keep=[];
    nc.forEach((c,i)=>{if(i==0||c=='Toplam'||c=='Wheel'||first[c]==null){first[c]=i;keep.push(i);}});
    if(keep.length==cols.length&&nc.every((c,i)=>c==cols[i]))return r;
    const outC=keep.map(i=>nc[i]);
    const outR=rows.map(x=>{const o=keep.map(i=>x[i]);nc.forEach((c,i)=>{if(i>0&&c!='Toplam'&&c!='Wheel'&&first[c]!=i){const j=keep.indexOf(first[c]);o[j]=Math.round(((Number(o[j])||0)+(Number(x[i])||0))*100)/100;}});return o;});
    return Object.assign({},r,{cols:outC,rj:JSON.stringify(outR)});
  }catch(e){return r;}
};
const PRIM_TL=12,PRIM_HARIC=['su','çay','bira','alkollü kokteyl','kadeh şarap','şişe şarap'];   // adet başı prim; bu gruplar HARİÇ tüm ürün gruplarından prim alınır
const primOf=g=>PRIM_HARIC.indexOf(String(g||'').toLocaleLowerCase('tr').trim())>=0?0:PRIM_TL;
const GICO={'Taze Meyve Suyu':'🍊','Bubble Tea':'🧋','Menemen & Omlet':'🍳','Filtre Kahve':'☕','Bira':'🍺','Alkollü Kokteyl':'🍹','Kadeh Şarap':'🍷','Şişe Şarap':'🍾','Buzlu Kahve':'🧊','Limonata':'🍋','Su':'💧','Soğuk İçecek':'🥤','Kokteyl':'🍹','Türk Kahvesi':'☕','Filtre Kahve':'☕','Kahve':'☕','Çay':'🫖','Sıcak İçecek':'🍫','Tatlı':'🍰','Başlangıç':'🥗','Yemek':'🍽️','Diğer':'📦'};
const gIco=g=>GICO[g]||'🏷️';
window.repGrp=g=>{RGRP=g;PSIG='';pgSync();};
window.primHak=function(){
  const r=window.__primR;if(!r)return;let cols,rows;
  try{cols=r.cols||[];rows=JSON.parse(r.rj||'[]').filter(x=>String(x[0]).toUpperCase()!='TOPLAM');}catch(e){return;}
  const tlf=x=>(Math.round(x*100)/100).toLocaleString('tr-TR'),gs2=[];
  cols.forEach((c,i)=>{if(i>0&&c!='Toplam'&&c!='Wheel'&&primOf(c)>0)gs2.push(i);});
  const L=rows.map(x=>{let q=0;const d=[];gs2.forEach(i=>{const v=Number(x[i])||0;if(v>0){q+=v;d.push({g:cols[i],v:v});}});d.sort((a,b)=>b.v-a.v);return {name:String(x[0]),q:q,tl:q*PRIM_TL,d:d};}).filter(x=>x.q>0).sort((a,b)=>b.tl-a.tl);
  const TQ=L.reduce((a,x)=>a+x.q,0);
  const ex=PRIM_HARIC.map(g=>g.charAt(0).toLocaleUpperCase('tr')+g.slice(1)).join(', ');
  let h='<p class="sub" style="margin:0 0 10px;line-height:1.5">'+esc(r.title)+'<br>Adet başı <b>'+PRIM_TL+' TL</b> · hariç: '+esc(ex)+'</p>';
  h+='<div class="kp"><div><b>'+L.length+'</b><span>Personel</span></div><div><b>'+fmt(TQ)+'</b><span>Primli adet</span></div><div><b>'+tlf(TQ*PRIM_TL)+'</b><span>Toplam TL</span></div></div>';
  h+='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="text-align:left;opacity:.7"><th style="padding:6px 4px">#</th><th>Personel</th><th style="text-align:right">Adet</th><th style="text-align:right">Hak ediş</th></tr>'+L.map((x,i)=>'<tr style="border-top:1px solid rgba(255,255,255,.1)"><td style="padding:7px 4px">'+(i+1)+'</td><td><b>'+esc(nice(x.name))+'</b><div style="font-size:11px;opacity:.65">'+x.d.slice(0,4).map(y=>esc(y.g)+' '+fmt(y.v)).join(' · ')+'</div></td><td style="text-align:right">'+fmt(x.q)+'</td><td style="text-align:right;color:#6ee7b7"><b>'+tlf(x.tl)+' TL</b></td></tr>').join('')+'</table></div>';
  pop('💰 Primli ürünler hak edişi',h,true);
};
window.repBoard=function(r){
  let cols,rows;
  try{cols=r.cols||[];rows=JSON.parse(r.rj||'[]').filter(x=>String(x[0]).toUpperCase()!='TOPLAM');}catch(e){return '';}
  const gi=[];cols.forEach((c,i)=>{if(i>0&&c!='Toplam'&&c!='Wheel'&&rows.some(x=>Number(x[i])>0))gi.push(i);});
  if(!gi.length)return '';
  if(!gi.some(i=>cols[i]==RGRP))RGRP=cols[gi[0]];
  const ci=cols.indexOf(RGRP),dt=new Date(r.t).toLocaleDateString('tr-TR');
  let h='<div class="simgh" style="padding:2px 2px 10px"><b>🏆 '+esc(r.title)+'</b><span>'+dt+'</span></div>';
  window.__primR=r;
  h+='<button class="a an" style="width:100%;margin:2px 0 10px;background:linear-gradient(135deg,#059669,#047857)" onclick="primHak()">💰 Primli ürünler hak edişi</button>';
  h+='<div class="pers">'+gi.map(i=>`<button class="${cols[i]==RGRP?'on':''}" data-g="${esc(cols[i])}" onclick="repGrp(this.dataset.g)">${gIco(cols[i])} ${esc(cols[i])}</button>`).join('')+'</div>';
  const L=rows.filter(x=>Number(x[ci])>0).map(x=>({name:String(x[0]),qty:Number(x[ci]),key:''})).sort((a,b)=>b.qty-a.qty);
  h+=lbQty(L,false,0,RGRP.toLowerCase(),primOf(RGRP));
  const stat={};
  gi.forEach(i=>{const v=rows.map(x=>({n:String(x[0]),v:Number(x[i])||0})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v),avg=v.reduce((a,x)=>a+x.v,0)/v.length,pos={};v.forEach((x,k)=>{pos[x.n]=k+1;});stat[i]={avg:avg,pos:pos};});
  const P=rows.map(x=>{const a=[];gi.forEach(i=>{const v=Number(x[i])||0;if(v>0)a.push({g:cols[i],v:v,rank:stat[i].pos[String(x[0])],idx:v/stat[i].avg});});a.sort((p,q)=>q.idx-p.idx);return {name:String(x[0]),a:a};}).filter(p=>p.a.length).sort((p,q)=>q.a[0].idx-p.a[0].idx);
  const med=k=>k==1?'🥇':k==2?'🥈':k==3?'🥉':k+'.';
  h+='<div class="sec2" style="margin-top:16px">⭐ KİM HANGİ GRUPTA GÜÇLÜ <span>'+P.length+'</span></div><div class="lb">'+P.map(p=>{
    const b=p.a[0],pc=Math.round((b.idx-1)*100),oth=p.a.slice(1).filter(x=>x.rank<=3).map(x=>gIco(x.g)+' '+esc(x.g)+' '+med(x.rank)).join(' · ');
    return `<div class="lr"><b class="av" data-nm="${esc(p.name)}">${esc(ini(p.name))}</b><div class="lm"><div class="ln">${esc(nice(p.name))}<span class="tr u">${gIco(b.g)} ${esc(b.g)} ${med(b.rank)}</span></div><div class="ls">${fmt(b.v)} adet · ortalamanın ${pc>=0?'%'+pc+' üstünde':'%'+(-pc)+' altında'}${oth?'<br>Ayrıca: '+oth:''}</div></div></div>`;
  }).join('')+'</div><p class="sub" style="margin:8px 2px;line-height:1.5">Güçlü grup: kişinin o gruptaki miktarının, grup ortalamasına oranı en yüksek olan grup.</p>';
  h+='<button class="a an" style="width:100%;margin:6px 0 8px" onclick="repCmp()">⚖️ Kıyasla</button><button class="a ed" style="width:100%;margin:0 0 14px" data-i="'+esc(r.id)+'" onclick="repTable(this.dataset.i)">📋 Tablo / Excel</button>';
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
  const cards=[];let best=null,tot=0,ptot=0;const tlf=x=>(Math.round(x*100)/100).toLocaleString('tr-TR');
  cols.forEach((c,i)=>{
    if(i==0||c=='Toplam'||c=='Wheel')return;
    const v=Number(mine[i])||0;if(v<=0)return;
    const all=rows.map(x=>Number(x[i])||0).filter(x=>x>0),rank=all.filter(x=>x>v).length+1,idx=v/(all.reduce((a,b)=>a+b,0)/all.length);
    tot+=v;const pr=primOf(c)*v;ptot+=pr;cards.push({g:c,v:v,rank:rank,n:all.length,pr:pr});
    if(!best||idx>best.idx)best={g:c,rank:rank,idx:idx};
  });
  h+='<div class="hi"><b data-nm="'+esc(s0.name)+'">'+esc(ini(s0.name))+'</b><div><div class="hi1">'+esc(nice(s0.name))+'</div><div class="hi2">Toplam '+fmt(tot)+' adet</div></div></div>';
  if(!cards.length)return h+'<div class="hot">Bu raporda satışın görünmüyor.</div>';
  h+='<button class="a an" style="width:100%;margin:2px 0 10px" onclick="repCmp()">⚖️ Kıyasla</button>';
  if(best)h+='<div class="hot">⭐ En güçlü olduğun grup: '+gIco(best.g)+' <b>'+esc(best.g)+'</b> ('+best.rank+'. sıradasın)</div>';
  h+='<div class="kp">'+cards.map(c=>`<div><b>${fmt(c.v)}</b><span>${gIco(c.g)} ${esc(c.g)}</span><span style="display:block;color:#fde68a;margin-top:2px">${c.rank}. / ${c.n}</span></div>`).join('')+'</div>';
  return h;
};

// ===== ⚖️ Kıyasla: garson, seçtiği garsonla ürün grubu satışlarını karşılaştırır =====
const rcRow=(rows,name)=>{const k=nrm(name);return rows.find(x=>nrm(x[0])==k)||rows.find(x=>nrm(x[0]).length>3&&lev(nrm(x[0]),k)<=Math.floor(k.length*.25));};
function rcData(){
  const r=(window.__reps||[]).find(x=>x.id==window.__repSel)||(window.__reps||[])[0];if(!r)return null;
  let cols,rows;try{cols=r.cols||[];rows=JSON.parse(r.rj||'[]').filter(x=>String(x[0]).toUpperCase()!='TOPLAM');}catch(e){return null;}
  const gi=[];cols.forEach((c,i)=>{if(i>0&&c!='Toplam'&&c!='Wheel'&&rows.some(x=>Number(x[i])>0))gi.push(i);});
  return{r:r,cols:cols,rows:rows,gi:gi};
}
window.repCmp=()=>{
  const d=rcData();if(!d||!d.gi.length){msg('Karşılaştırılacak ürün grubu raporu yok.');return;}
  const adm=M=='y',s0=((D&&D.staff)||[]).find(s=>s.id==getMe());
  let mine=null;
  if(!adm){if(!s0){msg('Önce Mola sekmesinden adını seç.');return;}mine=rcRow(d.rows,s0.name);if(!mine){msg('Bu raporda adına ait satış bulunamadı.');return;}}
  const names=d.rows.map(x=>String(x[0])).filter(n=>!mine||n!=String(mine[0])).sort((a,b)=>a.localeCompare(b,'tr'));
  const opt=(sel)=>'<option value="">— garson seç —</option>'+names.map(n=>'<option value="'+esc(n)+'"'+(n==sel?' selected':'')+'>'+esc(nice(n))+'</option>').join('');
  window.__rcD=d;window.__rcMine=mine;
  pop('⚖️ Kıyasla · '+d.r.title,(adm?'<label class="rcl">1. garson</label><select id="rcA" class="rsel" onchange="rcGo()">'+opt('')+'</select>':'<div class="rcme">Sen: <b>'+esc(nice(mine[0]))+'</b></div>')+'<label class="rcl">'+(adm?'2. garson':'Kıyaslanacak garson')+'</label><select id="rcB" class="rsel" onchange="rcGo()">'+opt('')+'</select><div id="rcOut"><p class="sub">Bir garson seç, ürün gruplarındaki satışlarınız yan yana çıksın.</p></div>',true);
  $('mo').textContent='Kapat';
};
window.rcGo=()=>{
  const d=window.__rcD,out=$('rcOut');if(!d||!out)return;
  const adm=M=='y',b=$('rcB').value,aN=adm?($('rcA')?$('rcA').value:''):String(window.__rcMine[0]);
  if(!b||!aN){out.innerHTML='<p class="sub">'+(adm?'İki garsonu da seç.':'Bir garson seç.')+'</p>';return;}
  const ra=d.rows.find(x=>String(x[0])==aN),rb=d.rows.find(x=>String(x[0])==b);if(!ra||!rb)return;
  const L=d.gi.map(i=>({g:d.cols[i],a:Number(ra[i])||0,b:Number(rb[i])||0})).filter(x=>x.a>0||x.b>0).sort((p,q)=>Math.max(q.a,q.b)-Math.max(p.a,p.b));
  const ta=L.reduce((s,x)=>s+x.a,0),tb=L.reduce((s,x)=>s+x.b,0),wa=L.filter(x=>x.a>x.b).length,wb=L.filter(x=>x.b>x.a).length,eq=L.length-wa-wb;
  const na=adm?nice(aN):'Sen',nb=nice(b),first=n=>String(n).split(' ')[0];
  let h='<div class="rch"><div class="rcp a"><b>'+esc(ini(aN))+'</b><span>'+esc(adm?first(nice(aN)):'Sen')+'</span><em>'+fmt(ta)+'</em></div><div class="rcvs">VS</div><div class="rcp b"><b>'+esc(ini(b))+'</b><span>'+esc(first(nb))+'</span><em>'+fmt(tb)+'</em></div></div>';
  h+='<div class="rcs">'+(adm?esc(first(na)):'Sen')+' <b>'+wa+'</b> grupta önde · '+esc(first(nb))+' <b>'+wb+'</b> grupta önde'+(eq?' · '+eq+' eşit':'')+'</div>';
  h+=L.map(x=>{
    const mx=Math.max(x.a,x.b)||1,d2=x.a-x.b,tag=d2==0?'<span class="rct">=</span>':'<span class="rct '+(d2>0?'u':'d')+'">'+(d2>0?'▲ +':'▼ ')+fmt(d2)+'</span>';
    return '<div class="rcg"><div class="rcgh">'+gIco(x.g)+' '+esc(x.g)+tag+'</div><div class="rcb"><i class="a" style="width:'+Math.max(x.a/mx*100,x.a?4:0)+'%"></i><span>'+fmt(x.a)+'</span></div><div class="rcb"><i class="b" style="width:'+Math.max(x.b/mx*100,x.b?4:0)+'%"></i><span>'+fmt(x.b)+'</span></div></div>';
  }).join('');
  const gap=L.filter(x=>x.b>x.a).sort((p,q)=>(q.b-q.a)-(p.b-p.a)).slice(0,3);
  if(gap.length)h+='<div class="hot" style="margin-top:10px">💡 '+(adm?esc(first(na)):'Sen')+' şu gruplarda geride: '+gap.map(x=>gIco(x.g)+' <b>'+esc(x.g)+'</b> (−'+fmt(x.b-x.a)+')').join(', ')+'</div>';
  out.innerHTML=h;
};
const styRC=document.createElement('style');
styRC.textContent='.rcl{display:block;font-size:12px;opacity:.7;margin:8px 0 4px}.rcme{font-size:14px;margin-bottom:2px}.rch{display:flex;align-items:center;justify-content:space-around;margin:14px 0 8px}.rcp{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:84px}.rcp b{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;font-size:17px;color:#fff}.rcp.a b{background:linear-gradient(135deg,#0ea5e9,#6366f1)}.rcp.b b{background:linear-gradient(135deg,#f59e0b,#ea580c)}.rcp span{font-size:13px;font-weight:700}.rcp em{font-style:normal;font-size:20px;font-weight:800}.rcvs{font-weight:900;color:#64748b}.rcs{font-size:12.5px;color:#94a3b8;text-align:center;margin-bottom:10px;line-height:1.5}.rcs b{color:#e2e8f0}.rcg{background:#172033;border:1px solid rgba(148,163,184,.14);border-radius:14px;padding:9px 10px;margin-bottom:7px}.rcgh{display:flex;align-items:center;gap:6px;font-weight:700;font-size:13.5px;margin-bottom:6px}.rct{margin-left:auto;font-size:11.5px;font-weight:800;border-radius:999px;padding:2px 8px;background:rgba(148,163,184,.2);color:#cbd5e1}.rct.u{background:rgba(46,230,166,.2);color:#2ee6a6}.rct.d{background:rgba(255,82,115,.22);color:#ff7a93}.rcb{display:flex;align-items:center;gap:8px;height:18px;margin-top:3px}.rcb i{display:block;height:10px;border-radius:6px;min-width:0}.rcb i.a{background:linear-gradient(90deg,#0ea5e9,#6366f1)}.rcb i.b{background:linear-gradient(90deg,#f59e0b,#ea580c)}.rcb span{font-size:12px;font-weight:800}';
document.head.appendChild(styRC);

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
window.__readXls = readXls;
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
  // Ad sütununun solunda sıra numarası sütunu varsa (1, 2, 3 | AD SOYAD | saatler…) o sütunu at
  (() => {
    const isNo = v => (typeof v == 'number' && v >= 0 && v == Math.floor(v)) || /^\d{1,3}([.,]0+)?$/.test(txt(v));
    const rows = aoa.filter(r => r && isNo(r[0]) && txt(r[1]) !== '' && !isNo(r[1]));
    if (rows.length < 3) return;
    let ttl = '';
    aoa = aoa.map(r => {
      if (!r) return r;
      if (isNo(r[0]) && txt(r[1]) !== '' && !isNo(r[1])) return r.slice(1).map((v, i) => { if (!i || typeof v != 'string') return v; const m = v.trim().match(/^(\d{1,2})[.,:](\d{2})$/); return m && +m[1] <= 24 && +m[2] < 60 ? +m[1] + +m[2] / 60 : v; });   // "14.00" yazı olarak gelirse sayıya çevir
      if (txt(r[0]) === '' && txt(r[1]) === '' && r.slice(2).some(v => txt(v) !== '')) return r.slice(1);        // kişinin altındaki posta satırı
      if (fold(r[0]) == 'NO' && /^AD/.test(fold(r[1]))) { const t = fold(ttl); return [/^GARSON/.test(t) || !ttl ? 'SERVİS' : ttl].concat(r.slice(2)); }   // "NO | AD SOYAD | PAZARTESİ…" başlığı → bölüm adı
      if (!isNo(r[0]) && txt(r[0]) !== '' && r.slice(1).every(v => txt(v) === '')) { ttl = txt(r[0]); return r; }
      if (!isNo(r[0]) && txt(r[0]) !== '' && txt(r[1]) === '') return [r[0]].concat(r.slice(2));
      return r;
    });
  })();
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
  let lastE = null;
  aoa.forEach(r => {
    const name = txt(r[0]);
    if (!name) {      // kişinin altındaki posta satırı (B5, S2, -) → o kişinin günlük postası
      if (lastE) { const pv = dcols.map(c => { const v = txt(r[c]).toLocaleUpperCase('tr').replace(/\s+/g, ''); return !v || /^[-–—.]+$/.test(v) || v.length > 14 ? '' : v; }); if (pv.some(Boolean)) lastE.pst = pv; }
      return;
    }
    lastE = null;
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
    if (seen[k]) { list[seen[k] - 1].week = week; dup.push(name); lastE = list[seen[k] - 1]; return; }
    list.push({ name: name, week: week, sec: sec, ord: ++ord }); seen[k] = list.length; lastE = list[list.length - 1];
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
    const r = await gs('uploadShiftXls', b, P.list.map(x => ({ name: x.name, week: x.week, pg: !!x.pg, po: x.po || 0, sec: x.sec, ord: x.ord, pst: x.pst || null })), P.dates, PIN);
    const fd = d => d.slice(8) + '.' + d.slice(5, 7);
    try { load(); } catch (e) {} try { rptLoad(); } catch (e) {}
    msg(r.ok + ' personelin vardiyası eklendi ✅\nHafta: ' + fd(P.dates[0]) + ' – ' + fd(P.dates[6]) + '.' + P.dates[6].slice(0, 4)
      + '\nPersonel ekranında bugün ve yarın görünür.'
      + (P.posta.length ? '\n\nPosta listesi: ' + P.posta.length + ' kişi (' + nice(P.posta[0]) + ' → ' + nice(P.posta[P.posta.length - 1]) + ')' : '')
      + (r.fuzzy && r.fuzzy.length ? '\n\nBenzer isimle eşleştirildi (Excel → uygulama):\n' + r.fuzzy.map(x => nice(x[0]) + ' → ' + nice(x[1])).join('\n') : '')
      + (r.postaN ? '\n\n📋 Postalar: ' + r.postaN + ' günlük atama kaydedildi (' + r.postaList.join(', ') + ')' : '')
      + (r.postaConf && r.postaConf.length ? '\n\n⚠ Aynı gün iki kişiye yazılmış posta (ilk kişi kaydedildi):\n' + r.postaConf.join('\n') : '')
      + (r.added && r.added.length ? '\n\nUygulamaya yeni eklenen personel (' + r.added.length + '):\n' + r.added.map(nice).join(', ') : '')
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
      return '<details class="vcard" ontoggle="vidOpen(this)"><summary class="vtt"><span class="vch">▸</span><div class="vtl"><b>' + esc(v.title) + '</b><small>' + dd(v.t) + '</small></div>' + ext + (adm ? (y ? '<button class="x2 w" title="Yön" data-i="' + esc(v.id) + '" onclick="event.preventDefault();event.stopPropagation();vidOri(this.dataset.i)">' + (por ? '📱' : '🖥') + '</button>' : '') + '<button class="x2 w" title="Reklam olarak göster" style="' + (v.ad ? 'background:#f59e0b;color:#fff' : '') + '" data-i="' + esc(v.id) + '" onclick="event.preventDefault();event.stopPropagation();vidAdTog(this.dataset.i)">📢</button>' + '<button class="x2 w" data-i="' + esc(v.id) + '" onclick="event.preventDefault();event.stopPropagation();vidDel(this.dataset.i)">✕</button>' : '') + '</summary><div class="vpl">' + pl + '</div></details>';
    }).join('');
  };
  window.vidAdTog = id => { const L = VL.map(v => v.id == id ? Object.assign({}, v, { ad: v.ad ? 0 : 1 }) : v); vsave(L).catch(e => msg(e && e.message)); };
  // ===== 📢 Reklam gibi çıkan video (servis personeli + yönetici) =====
  const AD_GAP = 30 * 60 * 1000;
  let adOpen = false, adBooted = false, adShowForce = false;
  const lsg = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lss = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const adClose = () => { const o = document.getElementById('vadov'); if (o) o.remove(); adOpen = false; };
  window.vidAdClose = adClose;
  async function adShow(ign) {
    if (adOpen || (document.hidden && !adShowForce)) return;
    if (!ign && Date.now() - (+lsg('vad_t') || 0) < AD_GAP) return;
    if (!window.adWho || !adWho()) return;
    let L; try { L = await gs('getVideos', B); } catch (e) { return; }
    L = (L || []).filter(v => v.ad).sort((a, b) => a.t - b.t);
    if (!L.length || adOpen) return;
    const i = (+lsg('vad_i') || 0) % L.length, v = L[i];
    lss('vad_i', String(i + 1)); lss('vad_t', String(Date.now())); adOpen = true;
    const y = yid(v.url), ig = String(v.url).match(/instagram\.com\/(?:[\w.]+\/)?(p|reels?|tv)\/([\w-]+)/i), isFile = !!v.path || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(v.url) || /firebasestorage|storage\.googleapis/.test(v.url);
    const por = v.o ? v.o == 'p' : /\/shorts\//.test(v.url);
    let pl;
    if (y) pl = '<iframe class="' + (por ? 'por' : '') + '" src="https://www.youtube.com/embed/' + y + '?playsinline=1&autoplay=1&mute=1&rel=0" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe>';
    else if (ig) pl = '<div class="igw ' + (/^reel/i.test(ig[1]) ? 'igr' : 'igp') + '"><iframe src="https://www.instagram.com/' + (/^reel/i.test(ig[1]) ? 'reel' : ig[1].toLowerCase()) + '/' + ig[2] + '/embed/" allowfullscreen scrolling="no"></iframe></div>';
    else if (isFile) pl = '<video controls autoplay muted playsinline src="' + esc(v.url) + '"></video>';
    else pl = '<a class="vopen" target="_blank" rel="noopener" href="' + esc(v.url) + '">▶ Videoyu aç</a>';
    const o = document.createElement('div'); o.id = 'vadov';
    o.innerHTML = '<div class="vadbx"><div class="vadtop"><span>📢 Duyuru · ' + esc(v.title) + '</span><button id="vadx" disabled>6</button></div><div class="vpl">' + pl + '</div></div>';
    document.body.appendChild(o);
    let n = 6; const bt = document.getElementById('vadx');
    bt.onclick = adClose;
    const iv = setInterval(() => { if (!document.getElementById('vadov')) { clearInterval(iv); return; } n--; if (n > 0) bt.textContent = n; else { clearInterval(iv); bt.disabled = false; bt.textContent = 'Kapat ✕'; } }, 1000);
  }
  window.vidAdTest = () => { lss('vad_t', '0'); adOpen = false; adShowForce = true; adShow().then(() => { adShowForce = false; if (!adOpen) msg('Reklam olarak işaretli (📢) video yok. Bir videonun yanındaki 📢 butonuna bas.'); }); };
  // Her uygulama açılışında bir kez; veri gelene kadar 2 sn'de bir dener (en çok 30 sn)
  const adEntry = () => { let n = 0; const t = setInterval(async () => { n++; if (adOpen || n > 15) { clearInterval(t); return; } if (window.adWho && adWho()) { clearInterval(t); await adShow(true); } }, 2000); };
  window.vidAdBoot = () => { if (adBooted) return; adBooted = true; adEntry(); setInterval(adShow, 5 * 60 * 1000); let away = 0; document.addEventListener('visibilitychange', () => { if (document.hidden) away = Date.now(); else if (away && Date.now() - away > 60000) { away = 0; adEntry(); } }); };
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
  st.textContent += '#vadov{position:fixed;inset:0;z-index:99999;background:rgba(10,3,5,.94);display:flex;align-items:center;justify-content:center;padding:14px}.vadbx{width:100%;max-width:520px;background:#1c0a0e;border:1px solid rgba(254,202,202,.2);border-radius:18px;overflow:hidden}.vadtop{display:flex;align-items:center;gap:10px;justify-content:space-between;padding:10px 12px;color:#fff;font-weight:700;font-size:14px}.vadtop span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#vadx{border:0;border-radius:10px;padding:8px 14px;font-weight:800;background:#b91c1c;color:#fff;min-width:64px}#vadx:disabled{opacity:.55}';
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
      + '<div class="lgf"><img src="' + logo() + '" alt=""><div class="lgt">Happy Moon\'s İzmir Şubeler</div><div class="lga"><button onclick="regMe()">➕ Kayıt ol</button><button onclick="setM(\'y\')">🔑 Yönetici girişi</button></div></div>';
  };
  // Açılışta boş ekran yerine hemen giriş ekranı
  try {
    if (!localStorage.getItem('mola_me_' + (localStorage.getItem('br') || 'opt'))) {
      const o = document.createElement('div'); o.id = 'lgn'; o.innerHTML = '<div class="lgh"><h1 style="margin-top:40px">Kullanıcı Seçin</h1></div><div class="lgl"><p style="text-align:center;opacity:.85">Yükleniyor…</p></div><div class="lgf"><img src="' + logo() + '" alt=""><div class="lgt">Happy Moon\'s İzmir Şubeler</div></div>';
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


// ===== 📲 Uygulamayı yükle uyarısı (tarayıcıda açılınca) =====
(function(){
  var KEY='hm_inst_hide',ev=null,shown=false;
  function standalone(){return (window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true||/[?&]source=pwa/.test(location.search);}
  function hidden(){try{return Date.now()-(+localStorage.getItem(KEY)||0)<7*864e5;}catch(e){return false;}}
  var ua=navigator.userAgent||'',ios=/iPhone|iPad|iPod/i.test(ua),android=/Android/i.test(ua);
  if(!(ios||android))return;
  var st=document.createElement('style');
  st.textContent='#hmi{position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:80;background:linear-gradient(135deg,#991b1b,#450a0a);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:18px;padding:12px;display:flex;gap:10px;align-items:center;box-shadow:0 12px 32px rgba(0,0,0,.55)}#hmi img{width:46px;height:46px;border-radius:12px;flex:none}#hmi div{flex:1;font-size:13px;line-height:1.35}#hmi b{display:block;font-size:14.5px}#hmi button{border:0;border-radius:12px;padding:10px 14px;font-weight:800;font-size:14px}#hmi .y{background:#fff;color:#7f1d1d}#hmi .x{background:rgba(255,255,255,.15);color:#fff;padding:10px 12px}';
  document.head.appendChild(st);
  function hide(save){var e=document.getElementById('hmi');if(e)e.remove();if(save){try{localStorage.setItem(KEY,String(Date.now()));}catch(x){}}}
  function show(){
    if(shown||standalone()||hidden())return;shown=true;
    var d=document.createElement('div');d.id='hmi';
    var tip=ios?'Alttaki <b style="display:inline">Paylaş ⬆</b> simgesine, sonra <b style="display:inline">Ana Ekrana Ekle</b>\'ye dokun.':'Yükle\'ye dokun; olmazsa tarayıcı menüsünden (⋮) <b style="display:inline">Uygulamayı yükle</b> / <b style="display:inline">Ana ekrana ekle</b>\'yi seç.';
    d.innerHTML='<img src="hm192.png" alt=""><div><b>Uygulamayı indir</b>'+(ev?'Telefonuna yükle, tek dokunuşla aç.':tip)+'</div>'+(ev?'<button class="y" id="hmiy">Yükle</button>':'')+'<button class="x" id="hmix">✕</button>';
    document.body.appendChild(d);
    var y=document.getElementById('hmiy');
    if(y)y.onclick=function(){try{ev.prompt();ev.userChoice.then(function(){ev=null;hide(true);});}catch(e){hide(true);}};
    document.getElementById('hmix').onclick=function(){hide(true);};
  }
  window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();ev=e;var o=document.getElementById('hmi');if(o){o.remove();shown=false;}show();});
  window.addEventListener('appinstalled',function(){hide(true);});
  window.addEventListener('load',function(){setTimeout(show,2500);});
})();


// ===== 💰 Haftalık Tip Box =====
(function () {
  const BASE = 6;                                     // günlük hak ediş = haftalık hak ediş / 6
  const fo = x => String(x || '').toLocaleUpperCase('tr').replace(/İ/g, 'I');
  const grpOf = st => { const c = fo(st.sec); if (/RUNNER|BAR|HOSTES|TEMIZ/.test(c)) return 'rec'; if (!c || /^SERV/.test(c)) return 'pay'; return ''; };
  const money = x => (Math.round((Number(x) || 0) * 100) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = v => { v = parseFloat(String(v).replace(',', '.')); return isFinite(v) && v >= 0 ? v : 0; };
  let T = null, WK = '', saveT = null;
  const weekKey = () => { const d = new Date(), td = (d.getDay() + 6) % 7; d.setDate(d.getDate() - td); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const weekLbl = () => { const m = new Date(), td = (m.getDay() + 6) % 7; m.setDate(m.getDate() - td); const e = new Date(m); e.setDate(m.getDate() + 6); const f = x => x.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }); return f(m) + ' – ' + f(e); };
  const people = () => {                              // vardiyadan gelenler + ekstra eklenenler
    const out = { rec: [], pay: [] };
    ((D && D.staff) || []).filter(x => !x.off && x.sh).forEach(x => {
      if (T.hide && T.hide[x.id]) return;
      const g = grpOf(x); if (!g) return;
      out[g].push({ id: x.id, name: nice(x.name), vd: x.sh.filter(Boolean).length, ord: x.ord || 1e9, ex: false });
    });
    out.rec.concat(out.pay).sort(() => 0);
    ['rec', 'pay'].forEach(g => out[g].sort((a, b) => (a.ord - b.ord) || a.name.localeCompare(b.name, 'tr')));
    T.ex.forEach(e => { out[e.grp].push({ id: e.id, name: e.name, vd: 0, ord: 1e9, ex: true }); });
    return out;
  };
  const calc = () => {
    const P = people(), R = P.rec.map(p => { const v = T.vals[p.id] || {}, h = num(v.h), dd = v.d == null || v.d === '' ? p.vd : num(v.d), daily = h / BASE; return { p: p, h: h, d: dd, daily: daily, pay: daily * dd }; });
    const pool = R.reduce((a, r) => a + r.pay, 0);
    const Y = P.pay.map(p => { const v = T.vals[p.id] || {}, dd = v.d == null || v.d === '' ? p.vd : num(v.d); return { p: p, d: dd, share: 0 }; });
    const el = Y.filter(y => y.d > 0), td = el.reduce((a, y) => a + y.d, 0);
    el.forEach(y => { y.share = td ? pool * y.d / td : 0; });
    return { R: R, Y: Y, pool: pool, n: el.length };
  };
  const payBtn = (id, g) => { const on = T.paid && T.paid[id]; return '<div><button onclick="tipPaid(\'' + esc(id) + '\')" style="margin-top:4px;border:0;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:800;color:#fff;background:' + (on ? '#16a34a' : '#475569') + '">' + (on ? '✓ ' + (g == 'pay' ? 'Ödedi' : 'Ödendi') : (g == 'pay' ? 'Ödemedi' : 'Ödenmedi')) + '</button></div>'; };
  const paidSum = (rows, f) => rows.filter(x => T.paid && T.paid[x.p.id]).reduce((a, x) => a + f(x), 0);
  window.tipPaid = id => { if (!T.paid) T.paid = {}; if (T.paid[id]) delete T.paid[id]; else T.paid[id] = 1; render(); save(); };
  const inp = 'background:#fff;color:#111827;border:1px solid #cbd5e1;border-radius:8px;padding:6px 4px;font-size:14px;text-align:center;width:100%;box-sizing:border-box';
  const th = 'padding:6px 3px;font-size:11px;opacity:.7;font-weight:600';
  const render = () => {
    const C = calc(), P = people();
    const rowR = r => '<tr style="border-top:1px solid rgba(255,255,255,.1)' + (T.paid[r.p.id] ? ';background:rgba(22,163,74,.16)' : '') + '"><td style="padding:6px 2px;font-size:13px"><b>' + esc(r.p.name) + '</b>' + (1 ? ' <a href="#" onclick="tipDel(\'' + esc(r.p.id) + '\');return false" style="color:#fca5a5;text-decoration:none">✕</a>' : '') + payBtn(r.p.id, 'rec') + '</td>'
      + '<td style="width:15%"><input style="' + inp + '" inputmode="decimal" value="' + (T.vals[r.p.id] && T.vals[r.p.id].d != null && T.vals[r.p.id].d !== '' ? esc(T.vals[r.p.id].d) : r.p.vd) + '" oninput="tipSet(\'' + esc(r.p.id) + '\',\'d\',this.value)"></td>'
      + '<td style="width:27%"><input style="' + inp + '" inputmode="decimal" placeholder="TL" value="' + (r.h || '') + '" oninput="tipSet(\'' + esc(r.p.id) + '\',\'h\',this.value)"></td>'
      + '<td style="text-align:right;font-size:12px;opacity:.8" id="tg_' + esc(r.p.id) + '">' + money(r.daily) + '</td>'
      + '<td style="text-align:right;color:#6ee7b7;font-weight:700;font-size:13px" id="tp_' + esc(r.p.id) + '">' + money(r.pay) + '</td></tr>';
    const rowY = y => '<tr style="border-top:1px solid rgba(255,255,255,.1)' + (T.paid[y.p.id] ? ';background:rgba(22,163,74,.16)' : '') + '"><td style="padding:6px 2px;font-size:13px"><b>' + esc(y.p.name) + '</b>' + (1 ? ' <a href="#" onclick="tipDel(\'' + esc(y.p.id) + '\');return false" style="color:#fca5a5;text-decoration:none">✕</a>' : '') + payBtn(y.p.id, 'pay') + '</td>'
      + '<td style="width:20%"><input style="' + inp + '" inputmode="decimal" value="' + (T.vals[y.p.id] && T.vals[y.p.id].d != null && T.vals[y.p.id].d !== '' ? esc(T.vals[y.p.id].d) : y.p.vd) + '" oninput="tipSet(\'' + esc(y.p.id) + '\',\'d\',this.value)"></td>'
      + '<td style="text-align:right;color:#fbbf24;font-weight:700;font-size:13px" id="ty_' + esc(y.p.id) + '">' + money(y.share) + '</td></tr>';
    const add = g => '<div style="display:flex;gap:6px;margin-top:8px"><input id="tx_' + g + '" placeholder="Ekstra personel adı" style="' + inp + ';text-align:left;flex:1"><button onclick="tipAdd(\'' + g + '\')" style="border:0;border-radius:8px;padding:6px 12px;font-weight:700;background:#6366f1;color:#fff">➕ Ekle</button></div>';
    const h = '<div style="background:#0f172a;color:#e5e7eb;border-radius:14px;padding:10px">'
      + '<div style="font-size:12px;opacity:.75;margin-bottom:8px">' + weekLbl() + ' · günlük hak ediş = haftalık ÷ ' + BASE + ' · ödenecek = günlük × çalıştığı gün (7 gün çalışana fazla) · servis personeli de sadece çalıştığı günler kadar öder</div>'
      + '<button onclick="tipAnn()" style="width:100%;border:0;border-radius:10px;padding:9px;margin:2px 0 8px;font-weight:700;font-size:13px;color:#fff;background:' + (T.ann ? '#0369a1' : '#475569') + '">📢 Pazar duyurusu (personel ekranında): ' + (T.ann ? 'Açık — gizlemek için dokun' : 'Gizli — açmak için dokun') + '</button>'
      + '<div style="font-weight:800;margin:6px 0">💸 Ödeme alan personel <span style="font-weight:500;opacity:.65;font-size:12px">(Runner · Bar · Hostes · Temizlik)</span></div>'
      + '<table style="width:100%;border-collapse:collapse"><tr style="text-align:left"><th style="' + th + '">Personel</th><th style="' + th + '">Gün</th><th style="' + th + '">Haftalık hak ediş</th><th style="' + th + ';text-align:right">Günlük</th><th style="' + th + ';text-align:right">Ödenecek</th></tr>' + (C.R.length ? C.R.map(rowR).join('') : '<tr><td colspan="5" style="padding:8px;opacity:.6;font-size:12px">Vardiyada Runner/Bar/Hostes/Temizlik personeli bulunamadı.</td></tr>') + '</table>' + add('rec')
      + '<div style="margin:12px 0 6px;padding:10px;border-radius:12px;background:rgba(16,185,129,.15);font-size:14px">Toplam ödenecek: <b id="tpool" style="color:#6ee7b7">' + money(C.pool) + ' TL</b><div style="font-size:12px;margin-top:5px;opacity:.9">✓ Ödenen: <b id="tpaid" style="color:#86efac">' + money(paidSum(C.R, r => r.pay)) + ' TL</b> · Kalan: <b id="trest">' + money(C.pool - paidSum(C.R, r => r.pay)) + ' TL</b></div></div>'
      + '<div style="font-weight:800;margin:10px 0 6px">🧾 Ödeme yapan personel <span style="font-weight:500;opacity:.65;font-size:12px">(Servis)</span> <span id="typ" style="font-size:12px;color:#86efac;font-weight:700">' + C.Y.filter(y => T.paid[y.p.id]).length + '/' + C.Y.filter(y => y.d > 0).length + ' ödedi</span></div>'
      + '<table style="width:100%;border-collapse:collapse"><tr style="text-align:left"><th style="' + th + '">Personel</th><th style="' + th + '">Gün</th><th style="' + th + ';text-align:right">Ödeyeceği</th></tr>' + (C.Y.length ? C.Y.map(rowY).join('') : '<tr><td colspan="3" style="padding:8px;opacity:.6;font-size:12px">Vardiyada servis personeli bulunamadı.</td></tr>') + '</table>' + add('pay')
      + '<div style="margin-top:10px;font-size:12px;opacity:.75" id="tinfo">' + C.n + ' kişi ödüyor · <span id="tsave">değişiklikler otomatik kaydedilir</span></div>' + '<button onclick="tipShare()" style="width:100%;margin-top:12px;border:0;border-radius:12px;padding:12px;font-weight:800;font-size:15px;color:#fff;background:linear-gradient(135deg,#16a34a,#15803d)">📲 WhatsApp\'ta görsel paylaş</button>' + (Object.keys(T.hide || {}).length ? '<div style="margin-top:10px;text-align:center"><a href="#" onclick="tipUnhide();return false" style="color:#93c5fd;font-size:13px">↩ Listeden çıkarılan ' + Object.keys(T.hide).length + ' kişiyi geri getir</a></div>' : '') + (M == 'y' ? permHtml() : '') + '</div>';
    $('mf').innerHTML = h;
  };
  const refresh = () => {                              // yazarken odak kaybolmasın: sadece sonuç hücrelerini güncelle
    const C = calc(), set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    C.R.forEach(r => { set('tg_' + r.p.id, money(r.daily)); set('tp_' + r.p.id, money(r.pay)); });
    C.Y.forEach(y => set('ty_' + y.p.id, money(y.share)));
    set('tpool', money(C.pool) + ' TL'); set('tpaid', money(paidSum(C.R, r => r.pay)) + ' TL'); set('trest', money(C.pool - paidSum(C.R, r => r.pay)) + ' TL');
    const i = document.getElementById('tinfo'); if (i) i.firstChild.textContent = C.n + ' kişi ödüyor · ';
  };
  const save = () => {
    const e = document.getElementById('tsave'); if (e) e.textContent = 'kaydediliyor…';
    clearTimeout(saveT); saveT = setTimeout(() => {
      (() => { const C = calc(), res = {}; C.R.forEach(r => { res[r.p.id] = { r: 'rec', a: r.pay, d: r.d, p: T.paid[r.p.id] ? 1 : 0 }; }); C.Y.forEach(y => { res[y.p.id] = { r: 'pay', a: y.share, d: y.d, p: T.paid[y.p.id] ? 1 : 0 }; }); return gs('saveTipBox', B, WK, { vals: T.vals, ex: T.ex, res: res, paid: T.paid, hide: T.hide }, M == 'y' ? PIN : '', meId()); })().then(() => { const x = document.getElementById('tsave'); if (x) x.textContent = '✓ kaydedildi'; }).catch(er => { const x = document.getElementById('tsave'); if (x) x.textContent = '⚠ kaydedilemedi: ' + (er && er.message || ''); });
    }, 700);
  };
  window.tipSet = (id, k, v) => { const o = T.vals[id] || (T.vals[id] = { h: 0, d: null }); if (k == 'h') o.h = num(v); else o.d = String(v).trim() === '' ? null : num(v); refresh(); save(); };
  window.tipMode = m => { T.mode = m; render(); save(); };
  window.tipAdd = g => { const e = document.getElementById('tx_' + g), n = e ? e.value.trim() : ''; if (!n) return; T.ex.push({ id: 'x' + Math.random().toString(36).slice(2, 8), name: n, grp: g }); render(); save(); };
  window.tipDel = id => {
    const P = people(), all = P.rec.concat(P.pay), nm = (all.find(p => p.id == id) || {}).name || '', isEx = T.ex.some(e => e.id == id);
    if (!confirm(nm + ' Tip Box listesinden çıkarılsın mı?')) return;
    if (isEx) { T.ex = T.ex.filter(e => e.id != id); delete T.vals[id]; } else { if (!T.hide) T.hide = {}; T.hide[id] = 1; }
    if (T.paid) delete T.paid[id];
    render(); save(); saveExcl();
  };
  const saveExcl = () => gs('setTipExcl', B, Object.keys(T.hide || {}), M == 'y' ? PIN : '', meId()).catch(() => {});
  window.tipUnhide = () => { T.hide = {}; render(); save(); saveExcl(); };
  window.tipAnn = () => { T.ann = !T.ann; render(); gs('setTipAnn', B, T.ann, M == 'y' ? PIN : '', meId()).catch(() => {}); };
  let TC = { id: '', v: null, t: 0, wk: '' };
  const tipCard = v => { if (!v) return ''; const pay = v.r == 'pay', g = pay ? 'linear-gradient(135deg,#92400e,#451a03)' : 'linear-gradient(135deg,#047857,#022c22)', bd = pay ? 'rgba(251,191,36,.4)' : 'rgba(110,231,183,.4)';
    return '<div id="tipcard" style="margin:0 0 8px;padding:8px 14px;border-radius:14px;background:' + g + ';border:1px solid ' + bd + ';display:flex;align-items:center;justify-content:space-between;gap:8px;color:#fff"><div style="min-width:0"><div style="font-size:13px;font-weight:700">💰 Tip Box · ' + (pay ? 'Ödeyeceğin' : 'Alacağın') + '</div><div style="font-size:11px;opacity:.8">' + (v.d % 1 ? v.d : Math.round(v.d)) + ' gün' + (v.p ? ' · <span style="color:#86efac;font-weight:800">✓ ' + (pay ? 'Ödedin' : 'Ödendi') + '</span>' : '') + '</div></div><div style="white-space:nowrap"><span style="font-size:20px;font-weight:800">' + money(v.a) + '</span> <span style="font-size:12px;opacity:.85">TL</span></div></div>'; };
  const tipPut = () => { const o = document.getElementById('tipcard'); if (o) o.remove(); const h = document.querySelector('.hi'); if (h && TC.v) h.insertAdjacentHTML('afterend', tipCard(TC.v)); };
  let annDone = false;
  const showAnn = (v, tries) => {
    if (annDone || document.getElementById('tipannov')) return;
    if (document.getElementById('vadov') && (tries || 0) < 10) { setTimeout(() => showAnn(v, (tries || 0) + 1), 3000); return; }   // reklam videosu açıksa bitmesini bekle
    annDone = true; const pay = v.r == 'pay', o = document.createElement('div'); o.id = 'tipannov';
    o.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(10,3,5,.88);display:flex;align-items:center;justify-content:center;padding:18px';
    o.innerHTML = '<div style="width:100%;max-width:420px;border-radius:22px;padding:22px 20px;text-align:center;color:#fff;background:' + (pay ? 'linear-gradient(135deg,#92400e,#451a03)' : 'linear-gradient(135deg,#047857,#022c22)') + ';border:1px solid rgba(255,255,255,.2)"><div style="font-size:42px">💰</div><div style="font-size:13px;letter-spacing:.1em;opacity:.8;margin-top:4px">HAFTALIK TİP BOX</div><div style="font-size:16px;font-weight:700;margin-top:10px">' + (pay ? 'Bu hafta ödeyeceğin tutar' : 'Bu hafta alacağın tutar') + '</div><div style="font-size:38px;font-weight:800;margin:6px 0">' + money(v.a) + ' <span style="font-size:18px">TL</span></div><div style="font-size:13px;opacity:.8">' + (v.d % 1 ? v.d : Math.round(v.d)) + ' gün çalışma üzerinden</div><button onclick="document.getElementById(\'tipannov\').remove()" style="margin-top:16px;width:100%;border:0;border-radius:12px;padding:12px;font-weight:800;font-size:15px;background:#fff;color:#111">Tamam</button></div>';
    document.body.appendChild(o);
  };
  window.tipFill = s0 => {
    const wk = weekKey(); if (TC.id != s0.id || TC.wk != wk) TC = { id: s0.id, v: null, t: 0, wk: wk };
    tipPut();
    if (Date.now() - TC.t < 120000) return; TC.t = Date.now();
    gs('getTipBoxMine', B, wk, s0.id).then(v => { if (TC.id == s0.id) { TC.v = v && v.a > 0 ? v : null; tipPut(); if (TC.v && TC.v.ann !== false && !TC.v.p && new Date().getDay() == 0) showAnn(TC.v); } }).catch(() => {});
  };
  // Tip Box yetkilileri (yönetici seçer; yetkili kişinin ana sayfasında Tip Box seçeneği çıkar)
  let lastB = null;
  const permLoad = () => gs('getTipPerm', B).then(ids => { window.__tipIds = ids || []; }).catch(() => {});
  setInterval(() => { if (B != lastB) { lastB = B; window.__tipIds = []; permLoad(); } }, 1000);
  setInterval(permLoad, 60000);
  const meId = () => { try { return localStorage.getItem('mola_me_' + B) || ''; } catch (e) { return ''; } };
  const permHtml = () => {
    const st = people().pay.filter(x => !x.ex).sort((a, b) => a.name.localeCompare(b.name, 'tr')), ids = window.__tipIds || [];
    return '<div style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,.12)"><div style="font-weight:800;margin-bottom:4px">🔑 Tip Box yetkilisi</div><div style="font-size:12px;opacity:.7;margin-bottom:8px">Sadece ödeme yapanlar (servis) arasından seçilir. Seçtiğin kişinin ana sayfasında Tip Box seçeneği çıkar; hak edişleri o girer.</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px">' + st.map(x => { const on = ids.indexOf(x.id) > -1; return '<button onclick="tipPerm(\'' + esc(x.id) + '\')" style="border:1px solid ' + (on ? '#34d399' : 'rgba(255,255,255,.2)') + ';border-radius:999px;padding:6px 10px;font-size:12px;font-weight:700;color:#fff;background:' + (on ? '#047857' : 'transparent') + '">' + (on ? '✓ ' : '') + esc(x.name) + '</button>'; }).join('') + '</div></div>';
  };
  window.tipPerm = id => {
    const ids = (window.__tipIds || []).slice(), k = ids.indexOf(id); if (k > -1) ids.splice(k, 1); else ids.push(id);
    window.__tipIds = ids; render();
    gs('setTipPerm', B, ids, PIN).catch(er => { const x = document.getElementById('tsave'); if (x) x.textContent = '⚠ ' + (er && er.message || ''); });
  };
  // ===== 📲 WhatsApp'ta görsel paylaş =====
  window.tipShare = async () => {
    const C = calc(), W = 900, rh = 46, pad = 34;
    const R = C.R.filter(r => r.pay > 0 || r.h > 0), Y = C.Y.filter(y => y.d > 0);
    const H = pad + 120 + 70 + R.length * rh + 90 + 70 + Y.length * rh + 90;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0f172a'); bg.addColorStop(1, '#1e1b4b'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const txt = (t, x, y, f, c, a) => { g.font = f; g.fillStyle = c; g.textAlign = a || 'left'; g.fillText(t, x, y); };
    const br = B == 'mavi' ? 'Mavi Bahçe' : 'Optimum';
    let y = pad + 40; txt('💰 Haftalık Tip Box', pad, y, 'bold 40px sans-serif', '#fff'); y += 40; txt(br + ' · ' + weekLbl(), pad, y, '24px sans-serif', '#cbd5e1');
    const sec = (title, col, colR, rows, label, tot, vf) => {
      y += 50; g.fillStyle = col; g.fillRect(pad, y - 30, W - 2 * pad, 44); txt(title, pad + 14, y, 'bold 24px sans-serif', '#fff'); txt('Gün', W - 300, y, 'bold 20px sans-serif', '#fff', 'center'); txt(label, W - pad - 14, y, 'bold 20px sans-serif', '#fff', 'right'); y += 26;
      rows.forEach((r, i) => { y += rh; if (i % 2) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(pad, y - 32, W - 2 * pad, rh); } txt(r.p.name + (T.paid && T.paid[r.p.id] ? '  ✓' : ''), pad + 14, y, '24px sans-serif', T.paid && T.paid[r.p.id] ? '#86efac' : '#f1f5f9'); txt(String(r.d % 1 ? r.d : Math.round(r.d)), W - 300, y, '24px sans-serif', '#cbd5e1', 'center'); txt(money(vf(r)) + ' TL', W - pad - 14, y, 'bold 24px sans-serif', colR, 'right'); });
      y += rh + 8; g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(pad, y - 34, W - 2 * pad, 48); txt('TOPLAM', pad + 14, y, 'bold 26px sans-serif', '#fff'); txt(money(tot) + ' TL', W - pad - 14, y, 'bold 26px sans-serif', colR, 'right');
    };
    sec('💸 ÖDEME ALANLAR', '#047857', '#6ee7b7', R, 'Alacağı', C.pool, r => r.pay);
    sec('🧾 ÖDEME YAPANLAR', '#b45309', '#fcd34d', Y, 'Ödeyeceği', C.pool, y2 => y2.share);
    const blob = await new Promise(ok => cv.toBlob(ok, 'image/png'));
    const file = new File([blob], 'tip-box.png', { type: 'image/png' }), cap = '💰 Haftalık Tip Box · ' + br + ' · ' + weekLbl();
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: cap }); return; }
    } catch (e) { if (e && e.name == 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tip-box.png'; document.body.appendChild(a); a.click(); a.remove();
    window.open('https://wa.me/?text=' + encodeURIComponent(cap), '_blank');
  };
  window.tipUI = async () => {
    if (!(M == 'y' || (meId() && (window.__tipIds || []).indexOf(meId()) > -1))) return;
    WK = weekKey(); T = { vals: {}, ex: [], mode: 'esit', paid: {}, hide: {}, ann: true };
    pop('💰 Haftalık Tip Box', '<p class="sub">Yükleniyor…</p>', true);
    try { const d = await gs('getTipBox', B, WK, M == 'y' ? PIN : '', meId()); if (d) T = { vals: d.vals || {}, ex: d.ex || [], mode: 'gun', paid: d.paid || {}, hide: {}, ann: true }; } catch (e) {}
    const pin = M == 'y' ? PIN : '', me = meId();
    try {                                                   // Tip Box'tan kalıcı çıkarılanlar (yöneticiler ilk açılışta otomatik)
      let ids = await gs('getTipExcl', B, pin, me);
      if (ids === null) {
        const ff = n => String(n || '').toLocaleUpperCase('tr').replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C').replace(/\s+/g, ' ').trim();
        const MG = ['KEMALCAN SUREN', 'KADIR KARA', 'MELIH TUTURMAZ'];
        ids = ((D && D.staff) || []).filter(x => MG.indexOf(ff(x.name)) > -1).map(x => x.id);
        gs('setTipExcl', B, ids, pin, me).catch(() => {});
      }
      ids.forEach(i => { T.hide[i] = 1; });
    } catch (e) {}
    try { T.ann = (await gs('getTipAnn', B)) !== false; } catch (e) {}
    render();
  };
})();


// ===== 📅 Rezerve =====
(function () {
  const st = document.createElement('style');
  st.textContent = '.nv.nv5{grid-template-columns:repeat(5,1fr)!important}.nv.nv5 button{font-size:10.5px!important;padding:9px 0!important}';
  document.head.appendChild(st);
  const meId = () => { try { return localStorage.getItem('mola_me_' + B) || ''; } catch (e) { return ''; } };
  const meName = () => { const x = ((D && D.staff) || []).find(y => y.id == meId()); return x ? nice(x.name) : ''; };
  const inp = 'background:#fff;color:#111827;border:1px solid #cbd5e1;border-radius:10px;padding:9px 8px;font-size:15px;width:100%;box-sizing:border-box';
  const lbl = 'display:block;font-size:11px;opacity:.7;margin:8px 0 3px';
  let R = { list: [], type: 'yemekli', past: false, form: false };
  const dLbl = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); if (!m) return d; return m[3] + '.' + m[2] + '.' + m[1] + ' · ' + new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('tr-TR', { weekday: 'short', timeZone: 'UTC' }); };
  const todayTR = () => { const t = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10).split('-'); return t[2] + '.' + t[1] + '.' + t[0]; };
  const today = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  const row = r => { const can = M == 'y' || (r.by && r.by == meId()), tel = String(r.phone || '').replace(/[^\d+]/g, '');
    return '<div style="border-top:1px solid rgba(255,255,255,.1);padding:9px 2px;display:flex;gap:10px;align-items:flex-start"><div style="min-width:96px"><div style="font-size:12px;opacity:.75">' + esc(dLbl(r.date)) + '</div><div style="font-size:18px;font-weight:800">' + esc(r.time) + '</div></div>'
      + '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:15px">' + esc(r.guest) + '</div>'
      + (r.phone ? '<a href="tel:' + esc(tel) + '" style="color:#93c5fd;font-size:13px;text-decoration:none">📞 ' + esc(r.phone) + '</a>' : '')
      + (r.taker ? '<div style="font-size:12px;opacity:.75">Alan: ' + esc(r.taker) + '</div>' : '') + (r.note ? '<div style="font-size:12px;opacity:.85">📝 ' + esc(r.note) + '</div>' : '')
      + (r.sched === true ? '<div style="font-size:11px;color:#86efac">⏰ 1 saat önce bildirim ayarlı</div>' : '') + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:6px"><button onclick="rezShare(\'' + esc(r.id) + '\')" style="border:0;background:rgba(34,197,94,.22);color:#86efac;border-radius:8px;padding:6px 9px;font-size:14px">📲</button>' + (can ? '<button onclick="rezDel(\'' + esc(r.id) + '\')" style="border:0;background:rgba(239,68,68,.2);color:#fca5a5;border-radius:8px;padding:6px 9px;font-size:14px">🗑</button>' : '') + '</div></div>'; };
  const sec = (title, list) => '<div style="font-weight:800;margin:14px 0 2px">' + title + ' <span style="opacity:.6;font-weight:500;font-size:12px">(' + list.length + ')</span></div>' + (list.length ? list.map(row).join('') : '<div style="opacity:.55;font-size:13px;padding:8px 2px">Rezerve yok.</div>');
  const render = () => {
    const now = Date.now(), up = r => r.ts >= now - 3 * 3600000, vis = (R.past ? R.list.filter(r => !up(r)) : R.list.filter(up)).slice().sort((x, z) => x.ts - z.ts);
    const y = vis.filter(r => r.type == 'yemekli' || !r.type), d = vis.filter(r => r.type == 'dogum'), kb = vis.filter(r => r.type == 'kahvalti');
    R.vis = [['🍽️ Yemekli', '#4f46e5', y], ['🎂 Doğum günü', '#db2777', d], ['🥐 Kahvaltı', '#d97706', kb]];
    const tb = (t, txt) => '<button id="rt_' + t + '" onclick="rezType(\'' + t + '\')" style="flex:1;border:0;border-radius:10px;padding:9px 2px;font-size:13px;font-weight:700;color:#fff;background:' + (R.type == t ? '#6366f1' : '#334155') + '">' + txt + '</button>';
    const form = R.form ? '<div style="background:rgba(255,255,255,.05);border-radius:12px;padding:10px;margin:8px 0"><div style="display:flex;gap:6px">' + tb('yemekli', '🍽️ Yemekli') + tb('dogum', '🎂 Doğum günü') + tb('kahvalti', '🥐 Kahvaltı') + '</div>'
      + '<div style="display:flex;gap:8px"><div style="flex:1"><label style="' + lbl + '">Tarih</label><input id="rz_d" inputmode="numeric" maxlength="10" placeholder="GG.AA.YYYY" value="' + todayTR() + '" oninput="rezMask(this,\'d\')" style="' + inp + '"></div><div style="flex:1"><label style="' + lbl + '">Saat</label><input id="rz_t" inputmode="numeric" maxlength="5" placeholder="SS:DD" oninput="rezMask(this,\'t\')" style="' + inp + '"></div></div>'
      + '<label style="' + lbl + '">Misafir adı</label><input id="rz_g" style="' + inp + '" placeholder="Ad soyad">'
      + '<label style="' + lbl + '">Telefon</label><input id="rz_p" type="tel" inputmode="tel" style="' + inp + '" placeholder="05xx xxx xx xx">'
      + '<label style="' + lbl + '">Rezerveyi alan kişi</label><input id="rz_k" style="' + inp + '" value="' + esc(meName()) + '" placeholder="Adın">'
      + '<label style="' + lbl + '">📝 Not</label><textarea id="rz_n" rows="3" style="' + inp + ';resize:vertical" placeholder="Kişi sayısı, pasta, masa, özel istek…"></textarea>'
      + '<button onclick="rezSave()" style="width:100%;margin-top:12px;border:0;border-radius:12px;padding:12px;font-weight:800;font-size:15px;color:#fff;background:linear-gradient(135deg,#16a34a,#15803d)">💾 Kaydet</button><div id="rz_m" style="font-size:12px;margin-top:6px;opacity:.85"></div></div>' : '';
    $('mf').innerHTML = '<div style="background:#0f172a;color:#e5e7eb;border-radius:14px;padding:10px">'
      + '<button onclick="rezForm()" style="width:100%;border:0;border-radius:12px;padding:12px;font-weight:800;font-size:15px;color:#fff;background:' + (R.form ? '#475569' : 'linear-gradient(135deg,#6366f1,#4338ca)') + '">' + (R.form ? '✕ Formu kapat' : '➕ Yeni rezerve') + '</button>' + form
      + '<div style="font-size:12px;opacity:.7;margin-top:8px">⏰ Misafirin gelmesinden 1 saat önce bildirim gider.</div>'
      + '<button onclick="rezShare()" style="width:100%;margin-top:8px;border:0;border-radius:12px;padding:11px;font-weight:800;font-size:14px;color:#fff;background:linear-gradient(135deg,#16a34a,#15803d)">📲 WhatsApp\'ta görsel paylaş</button>'
      + sec('🍽️ Yemekli rezerveler', y) + sec('🎂 Doğum günü rezerveleri', d) + sec('🥐 Kahvaltı rezerveleri', kb)
      + '<div style="text-align:center;margin-top:12px"><a href="#" onclick="rezPast();return false" style="color:#93c5fd;font-size:13px">' + (R.past ? '↩ Yaklaşanları göster' : '🕘 Geçmiş rezerveleri göster') + '</a></div></div>';
  };
  const load = async () => { try { R.list = await gs('listRez', B, M == 'y' ? PIN : '', meId()); } catch (e) { R.list = []; } render(); };
  window.rezUI = async () => { R.form = false; R.past = false; pop('📅 Rezerve', '<p class="sub">Yükleniyor…</p>', true); await load(); gs('rezSync', B).catch(() => {}); };
  window.rezMask = (el, k) => { const d = el.value.replace(/[^\d]/g, ''); el.value = k == 'd' ? (d.length > 4 ? d.slice(0, 2) + '.' + d.slice(2, 4) + '.' + d.slice(4, 8) : d.length > 2 ? d.slice(0, 2) + '.' + d.slice(2) : d) : (d.length > 2 ? d.slice(0, 2) + ':' + d.slice(2, 4) : d); };
  window.rezForm = () => { R.form = !R.form; render(); };
  window.rezPast = () => { R.past = !R.past; render(); };
  window.rezType = t => { R.type = t; ['yemekli', 'dogum', 'kahvalti'].forEach(x => { const e = document.getElementById('rt_' + x); if (e) e.style.background = x == t ? '#6366f1' : '#334155'; }); };
  window.rezSave = async () => {
    const v = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; }, m = document.getElementById('rz_m');
    const dd = v('rz_d').replace(/[^\d]/g, ''), tt = v('rz_t').replace(/[^\d]/g, '');
    let iso = '', hm = '';
    if (dd.length == 8 || dd.length == 6) { const D2 = dd.slice(0, 2), M2 = dd.slice(2, 4), Y2 = dd.length == 8 ? dd.slice(4) : '20' + dd.slice(4); if (+D2 >= 1 && +D2 <= 31 && +M2 >= 1 && +M2 <= 12) iso = Y2 + '-' + M2 + '-' + D2; }
    if (tt.length == 4 || tt.length == 3) { const t4 = tt.length == 3 ? '0' + tt : tt; if (+t4.slice(0, 2) <= 23 && +t4.slice(2) <= 59) hm = t4.slice(0, 2) + ':' + t4.slice(2); }
    const r = { type: R.type, date: iso, time: hm, guest: v('rz_g'), phone: v('rz_p'), taker: v('rz_k'), note: v('rz_n') };
    if (!r.date || !r.time || !r.guest) { if (m) m.textContent = '⚠ ' + (!r.date ? 'Tarihi rakamla yaz (örn. 14.11.2026).' : !r.time ? 'Saati rakamla yaz (örn. 20:30).' : 'Misafir adı gerekli.'); return; }
    if (m) m.textContent = 'Kaydediliyor…';
    try {
      const o = await gs('addRez', B, r, meId(), M == 'y' ? PIN : ''), left = o.ts - Date.now();
      const note = o.sched ? '⏰ 1 saat önce bildirim ayarlandı.' : left < 3600000 ? 'Misafir 1 saatten kısa sürede gelecek, bildirim ayarlanamadı.' : 'Bildirim, zamanı yaklaşınca otomatik ayarlanacak.';
      R.form = false; await load(); msg('✓ Rezerve kaydedildi\n\n' + note);
    } catch (e) { if (m) m.textContent = '⚠ ' + (e && e.message || 'Kaydedilemedi'); }
  };
  window.rezDel = async id => {
    const r = R.list.find(x => x.id == id); if (!r || !confirm(r.guest + ' (' + r.time + ') rezervesi silinsin mi?')) return;
    try { await gs('delRez', id, M == 'y' ? PIN : '', meId()); R.list = R.list.filter(x => x.id != id); render(); } catch (e) { msg(e && e.message || 'Silinemedi'); }
  };
  // ===== 📲 WhatsApp'ta görsel paylaş =====
  const mkImg = async (title, secs) => {
    const W = 900, pad = 32, tx = pad + 200, mw = W - pad - tx, cv = document.createElement('canvas'), g = cv.getContext('2d');
    g.font = '22px sans-serif';
    const wrap = (t, f, mw2) => { g.font = f; const out = []; String(t || '').split('\n').forEach(par => { let ln = ''; par.split(/\s+/).forEach(w => { const tt = ln ? ln + ' ' + w : w; if (g.measureText(tt).width > mw2 && ln) { out.push(ln); ln = w; } else ln = tt; }); out.push(ln); }); return out; };
    const items = secs.filter(s2 => s2[2].length).map(s2 => ({ t: s2[0], c: s2[1], rows: s2[2].map(r => { const nl = r.note ? wrap('📝 ' + r.note, 'italic 21px sans-serif', mw) : []; return { r: r, nl: nl, h: 24 + 34 + (r.phone || r.taker ? 30 : 0) + nl.length * 28 + 16 }; }) }));
    let H = pad + 100; items.forEach(it => { H += 64; it.rows.forEach(x => { H += x.h; }); H += 16; }); H += 30;
    cv.width = W; cv.height = Math.max(H, 260);
    const bg = g.createLinearGradient(0, 0, W, cv.height); bg.addColorStop(0, '#0f172a'); bg.addColorStop(1, '#1e1b4b'); g.fillStyle = bg; g.fillRect(0, 0, W, cv.height);
    const txt = (t, x, y, f, c, a) => { g.font = f; g.fillStyle = c; g.textAlign = a || 'left'; g.fillText(t, x, y); };
    let y = pad + 42; txt(title, pad, y, 'bold 38px sans-serif', '#fff');
    y += 36; txt(new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }), pad, y, '22px sans-serif', '#94a3b8');
    items.forEach(it => {
      y += 30; g.fillStyle = it.c; g.fillRect(pad, y, W - 2 * pad, 44); txt(it.t + ' (' + it.rows.length + ')', pad + 14, y + 31, 'bold 24px sans-serif', '#fff'); y += 44 + 8;
      it.rows.forEach((x, i) => {
        const r = x.r, top = y; if (i % 2) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(pad, top, W - 2 * pad, x.h); }
        txt(dLbl(r.date), pad + 12, top + 34, '20px sans-serif', '#cbd5e1'); txt(r.time, pad + 12, top + 74, 'bold 38px sans-serif', '#fff');
        let ly = top + 38; txt(r.guest, tx, ly, 'bold 28px sans-serif', '#f8fafc'); ly += 32;
        if (r.phone || r.taker) { txt((r.phone ? '📞 ' + r.phone : '') + (r.phone && r.taker ? '  ·  ' : '') + (r.taker ? 'Alan: ' + r.taker : ''), tx, ly, '22px sans-serif', '#93c5fd'); ly += 28; }
        x.nl.forEach(l => { txt(l, tx, ly, 'italic 21px sans-serif', '#fde68a'); ly += 28; });
        y += x.h;
      });
      y += 8;
    });
    return new Promise(ok => cv.toBlob(ok, 'image/png'));
  };
  const shareBlob = async (blob, cap) => {
    const file = new File([blob], 'rezerve.png', { type: 'image/png' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: cap }); return; } } catch (e) { if (e && e.name == 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'rezerve.png'; document.body.appendChild(a); a.click(); a.remove();
    window.open('https://wa.me/?text=' + encodeURIComponent(cap), '_blank');
  };
  window.rezShare = async id => {
    const br = B == 'mavi' ? 'Mavi Bahçe' : 'Optimum';
    let secs, title;
    if (id) { const r = R.list.find(x => x.id == id); if (!r) return; secs = [[r.type == 'dogum' ? '🎂 Doğum günü' : r.type == 'kahvalti' ? '🥐 Kahvaltı' : '🍽️ Yemekli', r.type == 'dogum' ? '#db2777' : r.type == 'kahvalti' ? '#d97706' : '#4f46e5', [r]]]; title = '📅 Rezerve · ' + br; }
    else { secs = R.vis || []; if (!secs.some(x => x[2].length)) { msg('Paylaşılacak rezerve yok.'); return; } title = '📅 Rezerveler · ' + br; }
    try { await shareBlob(await mkImg(title, secs), title); } catch (e) { msg('Görsel oluşturulamadı: ' + (e && e.message || '')); }
  };
  // Açık cihazlar, 3 günden uzak rezervelerin bildirimini zamanı gelince ayarlasın
  setTimeout(() => { try { gs('rezSync', B).catch(() => {}); } catch (e) {} }, 8000);
  setInterval(() => { try { gs('rezSync', B).catch(() => {}); } catch (e) {} }, 15 * 60 * 1000);
})();
