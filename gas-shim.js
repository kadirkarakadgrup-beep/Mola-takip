// Garson olmayıp hesap açan kişiler: ciro 0 görünür ama hesap sayıları tabloya ve toplama girer
function isZeroAcc(n) {
  const k = String(n || '').toLocaleUpperCase('tr').replace(/İ/g, 'I').replace(/Ö/g, 'O').replace(/Ü/g, 'U').replace(/Ş/g, 'S').replace(/Ç/g, 'C').replace(/Ğ/g, 'G').replace(/\s+/g, ' ').trim(), t = k.split(' ');
  return ['AHMET CANCI', 'KADIR KARA', 'MAHMUT YILDAN'].some(z => { const u = z.split(' '); return k == z || (t.length >= 2 && (t.every(w => u.indexOf(w) >= 0) || u.every(w => t.indexOf(w) >= 0))); });
}
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
try { db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}   // HIZ+KOTA: açılışta veri önce cihazdaki önbellekten gelir, sunucudan yalnızca değişenler indirilir
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
  const m = a.list.find(x => x.h === h); return m ? { role: 'admin', name: m.name, id: m.id, perms: Array.isArray(m.perms) ? m.perms : null } : null;
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
let CACHE = [], CERR = null, SCOPE = null, SUB = null, SNAPP = Promise.resolve();
/* KOTA: Personel listesi artık SADECE gereken kadar dinleniyor.
   - Yönetici (şifre girilmiş / yönetici modu): iki şubenin tamamı
   - Personel / garson: yalnızca kendi şubesi (diğer şubenin değişiklikleri okuma sayılmaz) */
const isMgr_ = () => { try { return Object.keys(VER).length > 0 || (typeof M != 'undefined' && M == 'y'); } catch (e) { return false; } };
const attach_ = scope => {
  if (SUB) { try { SUB(); } catch (e) {} SUB = null; }
  SCOPE = scope; CACHE = []; CERR = null;
  SNAPP = new Promise(res => {
    const retry = () => setTimeout(() => { if (SCOPE === scope) sub(); }, 60000);
    const sub = () => ready.then(() => {
      if (SCOPE !== scope) { res(); return; }
      const q = scope === 'all' ? col('staff') : col('staff').where('branch', '==', scope);
      SUB = q.onSnapshot(sn => { if (SCOPE !== scope) return; CERR = null; CACHE = sn.docs.map(d => { const s = d.data(); s.id = d.id; return s; }); res(); },
        e => { if (SCOPE === scope) CERR = e; res(); retry(); });
    }).catch(e => { CERR = e; res(); retry(); });
    sub();
  });
  return SNAPP;
};
async function allStaff_(branch) {
  let want;
  if (isMgr_()) want = 'all';
  else if (branch) want = branch;
  else if (SCOPE && SCOPE !== 'all') want = SCOPE;
  else want = (typeof B != 'undefined' && B) ? String(B) : 'all';
  if (SCOPE !== want) attach_(want);
  await SNAPP;
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
let RPT_C = { t: 0, v: null };   // kota: tüm rapor koleksiyonu 3 dk önbellekte
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
const cancelActive_ = s => { const a = s && s.active; if (a && !a.paused && Date.now() < end_(a)) { cancel_(topicOf_(s.id), a.nid2); return cancel_(topicOf_('yonetici'), a.nid); } };

async function rezOk_(pin, me) {
  if (pin && VER[String(pin)]) return true;
  const st = (await allStaff_()).find(x => x.id === String(me || ''));
  if (!st) throw new Error('Rezerve yetkin yok');
  const d = await col('cfg').doc('rezperm_' + st.branch).get();      // yönetici yetkili seçtiyse yalnızca onlar
  if (d.exists) { if ((d.data().ids || []).indexOf(st.id) > -1) return true; throw new Error('Rezerve yetkin yok (yönetici tarafından seçilenler)'); }
  const sec = String(st.sec || '').toLocaleUpperCase('tr').replace(/İ/g, 'I');      // yetkili listesi yoksa eski kural: Hostes
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
    const staff = (await allStaff_(mgr ? null : branch)).filter(s => s.branch === branch).sort((a, b) => a.name.localeCompare(b.name, 'tr')).map(s => {
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
  async checkPin(pin) { const r = await roleOf_(pin); if (r) { VER[String(pin)] = r; } return !!r; },
  async forgotAdminPing() { return await post_(topicOf_('yonetici'), '🔑 Şifre yardımı isteniyor', 'Biri Yönetici Girişi ekranında "Şifremi unuttum"a bastı. Yöneticiler menüsünden ilgili kişiyi çıkarıp yeni bir şifreyle tekrar ekleyebilirsin.'); },
  async adminInfo(pin) { auth_(pin); return VER[String(pin)]; },
  async adminList(pin) { own_(pin); return (await admDoc_()).list.map(x => ({ id: x.id, name: x.name, perms: Array.isArray(x.perms) ? x.perms : null })); },
  async adminNames() { return (await admDoc_()).list.map(x => ({ id: x.id, name: x.name })); },
  async adminSetPerms(id, perms, pin) { own_(pin); const a = await admDoc_(); const m = a.list.find(x => x.id === id); if (!m) throw new Error('Yönetici bulunamadı'); m.perms = Array.isArray(perms) ? perms.filter(x => typeof x === 'string').slice(0, 40) : null; await col('cfg').doc('admins').set({ owner: a.owner || null, list: a.list }); return 'ok'; },
  async adminAdd(name, newPin, pin, perms) {
    own_(pin); name = String(name || '').trim().slice(0, 30); newPin = String(newPin || '').trim();
    if (!name) throw new Error('İsim gerekli'); if (!/^\d{4,8}$/.test(newPin)) throw new Error('Şifre 4-8 haneli rakam olmalı');
    const a = await admDoc_(), h = await hash_(newPin);
    if (h === a.owner || (!a.owner && newPin === String(CFG.PIN)) || a.list.some(x => x.h === h)) throw new Error('Bu şifre kullanımda, başka bir şifre seç');
    a.list.push({ id: Math.random().toString(36).slice(2, 10), name: name, h: h, perms: Array.isArray(perms) ? perms.filter(x => typeof x === 'string').slice(0, 40) : null });
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
    if (['SERVİS', 'BAR', 'RUNNER', 'HOSTES', 'TEMİZLİK', 'EĞİTİM'].indexOf(sec) > -1) {      // departman: vardiyada o bölümün en altına, Tip Box'ta da o gruba geçer
      const all = (await allStaff_()).filter(x => x.branch === branch), same = all.filter(x => x.sec === sec && x.ord);
      rec.sec = sec; rec.secLock = true;
      rec.ord = same.length ? Math.max.apply(null, same.map(x => Number(x.ord) || 0)) + 0.001 : Math.max.apply(null, [0].concat(all.map(x => Number(x.ord) || 0))) + 1;
    }
    await col('staff').doc(id).set(clean_(rec));
    return name;
  },
  async staffPinState(id) {                           // kişinin şifresi belirlenmiş mi
    id = String(id || '').slice(0, 40); if (!id) return { has: false, t: 0 };
    const d = await col('cfg').doc('spin_' + id).get();
    return d.exists && d.data().h ? { has: true, t: d.data().t || 0 } : { has: false, t: 0 };
  },
  async staffPinSet(id, pin) {                        // sadece bir kez: personel kendi şifresini belirler
    id = String(id || '').slice(0, 40); pin = String(pin || '').trim();
    if (!/^\d{4,8}$/.test(pin)) throw new Error('Şifre 4-8 haneli rakam olmalı');
    if (!(await allStaff_()).some(x => x.id === id)) throw new Error('Personel bulunamadı');
    const ref = col('cfg').doc('spin_' + id), d = await ref.get();
    if (d.exists && d.data().h) throw new Error('Bu kişinin şifresi zaten belirlenmiş. Unuttuysan yöneticiden sıfırlamasını iste.');
    const t = Date.now(); await ref.set({ h: await hash_(id + '|' + pin), t: t });
    return { t: t };
  },
  async staffPinCheck(id, pin) {
    id = String(id || '').slice(0, 40); const d = await col('cfg').doc('spin_' + id).get();
    if (!d.exists || !d.data().h) return { ok: false, t: 0, none: true };
    return { ok: (await hash_(id + '|' + String(pin || '').trim())) === d.data().h, t: d.data().t || 0 };
  },
  async staffPinReset(id, pin) {                      // yönetici: şifreyi sıfırlar, kişi bir sonraki girişte yenisini belirler
    auth_(pin); id = String(id || '').slice(0, 40); if (!id) throw new Error('Personel yok');
    await col('cfg').doc('spin_' + id).delete(); return 'ok';
  },
  async tipOk_(branch, pin, me) {
    if (pin && VER[String(pin)]) return true;
    const d = await col('cfg').doc('tipperm_' + branch).get(), ids = d.exists ? (d.data().ids || []) : [];
    if (!me || ids.indexOf(String(me)) < 0) throw new Error('Tip Box yetkin yok');
    return true;
  },
  async getTipPerm(branch) { const d = await col('cfg').doc('tipperm_' + branch).get(); return d.exists ? (d.data().ids || []) : []; },
  async setTipPerm(branch, ids, pin) { auth_(pin); await col('cfg').doc('tipperm_' + branch).set({ ids: (ids || []).slice(0, 60).map(x => String(x).slice(0, 40)), t: Date.now() }); },
  async getRezPerm(branch) { const d = await col('cfg').doc('rezperm_' + branch).get(); return d.exists ? { set: true, ids: d.data().ids || [] } : { set: false, ids: [] }; },
  async setRezPerm(branch, ids, pin) { auth_(pin); const ref = col('cfg').doc('rezperm_' + branch); if (ids === null) { await ref.delete(); return; } await ref.set({ ids: (ids || []).slice(0, 80).map(x => String(x).slice(0, 40)), t: Date.now() }); },
  async getTipBox(branch, wk, pin, me) {
    await this.tipOk_(branch, pin, me);
    const d = await col('cfg').doc('tipbox_' + branch + '_' + wk).get();
    return d.exists ? d.data() : null;
  },
  async saveTipBox(branch, wk, data, pin, me) {
    await this.tipOk_(branch, pin, me);
    const ref = col('cfg').doc('tipbox_' + branch + '_' + wk);
    { const cur = await ref.get(); if (cur.exists && cur.data().closed) throw new Error('Bu dönem kapandı (devredildi), değiştirilemez.'); }
    const clip = (o, n) => String(o == null ? '' : o).slice(0, n), num = v => { v = Number(v); return isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : 0; };
    const vals = {}; Object.keys((data && data.vals) || {}).slice(0, 200).forEach(k => { const v = data.vals[k] || {}; vals[clip(k, 40)] = { h: num(v.h), d: v.d == null || v.d === '' ? null : Math.min(31, num(v.d)) }; });
    const ex = ((data && data.ex) || []).slice(0, 60).map(e => ({ id: clip(e.id, 40), name: clip(e.name, 60), grp: e.grp === 'pay' ? 'pay' : 'rec', dep: clip(e.dep, 30) }));
    const res = {}; Object.keys((data && data.res) || {}).slice(0, 200).forEach(k => { const r = data.res[k] || {}; res[clip(k, 40)] = { r: r.r === 'pay' ? 'pay' : 'rec', a: num(r.a), d: num(r.d), p: r.p ? 1 : 0 }; });
    const hide = {}; Object.keys((data && data.hide) || {}).slice(0, 200).forEach(k => { if (data.hide[k]) hide[clip(k, 40)] = 1; });
    const paid = {}; Object.keys((data && data.paid) || {}).slice(0, 200).forEach(k => { if (data.paid[k]) paid[clip(k, 40)] = 1; });
    const names = {}; Object.keys((data && data.names) || {}).slice(0, 200).forEach(k => { const n = data.names[k] || {}; names[clip(k, 40)] = { n: clip(n.n, 60), g: clip(n.g, 40), c: clip(n.c, 12), o: num(n.o) }; });
    await ref.set({ vals: vals, ex: ex, res: res, paid: paid, hide: hide, names: names, t: Date.now() }, { mergeFields: ['vals', 'ex', 'res', 'paid', 'hide', 'names', 't'] });
    const bs = (data && data.base) || {}, bk = Object.keys(bs).slice(0, 200);      // elle girilen hak edişler kalıcı tabana yazılır
    if (bk.length) { await this.getTipBase(branch, pin, me); const h = {}; bk.forEach(k => { h[clip(k, 40)] = num(bs[k]); }); await col('cfg').doc('tipbase_' + branch).set({ h: h, t: Date.now() }, { merge: true }); }
  },
  async getTipBase(branch, pin, me) {       // kişi bazında son bilinen haftalık hak ediş (yeni dönemlere otomatik gelir)
    await this.tipOk_(branch, pin, me);
    const ref = col('cfg').doc('tipbase_' + branch), d = await ref.get();
    if (d.exists) return d.data().h || {};
    const keys = [], per = await col('cfg').doc('tipper_' + branch).get();       // ilk kez: geçmiş dönemlerden en son girilen tutarları bul
    ((per.exists ? per.data().list : []) || []).forEach(x => keys.push(x.k));
    const m = new Date(); m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7));
    for (let i = 0; i < 12; i++) keys.push(new Date(m.getTime() - i * 7 * 864e5).toISOString().slice(0, 10));
    const h = {};
    for (const k of [...new Set(keys)].sort().reverse().slice(0, 20)) {
      const x = await col('cfg').doc('tipbox_' + branch + '_' + k).get(); if (!x.exists) continue;
      const v = x.data().vals || {};
      Object.keys(v).forEach(id => { const n = Number((v[id] || {}).h) || 0; if (n > 0 && h[id] === undefined) h[id] = n; });
    }
    await ref.set({ h: h, t: Date.now() });
    return h;
  },
  async getTipPeriod(branch) {
    barSube_(branch);
    const d = await col('cfg').doc('tipper_' + branch).get();
    return d.exists ? { cur: d.data().cur || '', list: d.data().list || [] } : { cur: '', list: [] };
  },
  async tipNewPeriod(branch, from, start, end, pin, me) {     // dönemi kapat, hak edişleri yeni döneme aktar
    await this.tipOk_(branch, pin, me); barSube_(branch);
    const okd = x => /^\d{4}-\d{2}-\d{2}$/.test(String(x || ''));
    if (!okd(from) || !okd(start) || !okd(end) || end < start) throw new Error('Tarihler geçersiz');
    if (start <= from) throw new Error('Yeni dönem, mevcut dönemin başlangıcından sonra başlamalı');
    const prevRef = col('cfg').doc('tipbox_' + branch + '_' + from), newRef = col('cfg').doc('tipbox_' + branch + '_' + start), perRef = col('cfg').doc('tipper_' + branch);
    if ((await newRef.get()).exists) throw new Error('Bu başlangıç tarihli bir dönem zaten var');
    const prev = await prevRef.get(), pd = prev.exists ? prev.data() : {};
    const base = await this.getTipBase(branch, pin, me), vals = {};
    const ids = new Set(Object.keys(pd.vals || {}).concat(Object.keys(base)));
    ids.forEach(k => { const ph = Number(((pd.vals || {})[k] || {}).h) || 0, hh = ph > 0 ? ph : (Number(base[k]) || 0); vals[k] = { h: hh, d: null }; });   // hak ediş aynen, gün sıfırlanır
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
      if (m.d) o.d = clip(m.d, 30);
      out[clip(k, 40)] = o;
    });
    await col('cfg').doc('tipmeta_' + branch).set({ meta: out, t: Date.now() });
  },
  // ===== 📝 Menü Sınavı: yazılı cevaplar + yönetici puanlaması =====
  async getExamPerm(branch) { barSube_(branch); const d = await col('cfg').doc('examperm_' + branch).get(); return d.exists ? (d.data().ids || []) : []; },
  async setExamPerm(branch, ids, pin) {
    auth_(pin); barSube_(branch);
    const out = (Array.isArray(ids) ? ids : []).slice(0, 300).map(x => String(x).slice(0, 40));
    await col('cfg').doc('examperm_' + branch).set({ ids: out, t: Date.now() }); return out.length;
  },
  async examGet(branch, unit, pin, me) {
    barSube_(branch); unit = String(unit) === '2' ? '2' : '1';
    const d = await col('cfg').doc('exam_' + branch + '_' + unit).get(), p = (d.exists ? d.data().p : null) || {};
    let adm = false; try { auth_(pin); adm = true; } catch (e) {}
    if (adm) return p;
    const id = String(me || ''), o = {}; if (id && p[id]) o[id] = p[id]; return o;      // personel sadece kendi kaydını alır
  },
  async examSubmit(branch, unit, id, name, answers) {
    barSube_(branch); unit = String(unit) === '2' ? '2' : '1'; id = String(id || '').slice(0, 40);
    if (!id) throw new Error('Kişi seçili değil');
    const pd = await col('cfg').doc('examperm_' + branch).get();
    if (!(((pd.exists ? pd.data().ids : []) || []).indexOf(id) > -1)) throw new Error('Bu sınav sana atanmadı');
    const a = (Array.isArray(answers) ? answers : []).slice(0, 30).map(x => String(x == null ? '' : x).trim().slice(0, 300));
    if (!a.some(Boolean)) throw new Error('En az bir soruyu cevapla');
    const ref = col('cfg').doc('exam_' + branch + '_' + unit);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref), p = (snap.exists ? snap.data().p : null) || {};
      if (p[id]) throw new Error('Bu üniteyi zaten gönderdin');
      if (Object.keys(p).length >= 120) throw new Error('Kayıt sınırı doldu');
      p[id] = { n: String(name || '').slice(0, 40), a: a, t: Date.now() };
      tx.set(ref, { p: p, t: Date.now() });
    });
    return 'ok';
  },
  async examGrade(branch, unit, id, grades, pin) {
    auth_(pin); barSube_(branch); unit = String(unit) === '2' ? '2' : '1'; id = String(id || '').slice(0, 40);
    const g = (Array.isArray(grades) ? grades : []).slice(0, 30).map(x => { x = Number(x); return x >= 1 ? 1 : x >= 0.5 ? 0.5 : 0; });
    const ref = col('cfg').doc('exam_' + branch + '_' + unit); let sc = 0;
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref), p = (snap.exists ? snap.data().p : null) || {};
      if (!p[id]) throw new Error('Kayıt bulunamadı');
      sc = g.reduce((a, b) => a + b, 0); p[id].g = g; p[id].s = sc; p[id].gt = Date.now();
      tx.set(ref, { p: p, t: Date.now() });
    });
    return sc;
  },
  async examReset(branch, unit, id, pin) {
    auth_(pin); barSube_(branch); unit = String(unit) === '2' ? '2' : '1'; id = String(id || '').slice(0, 40);
    const ref = col('cfg').doc('exam_' + branch + '_' + unit);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref), p = (snap.exists ? snap.data().p : null) || {};
      delete p[id]; tx.set(ref, { p: p, t: Date.now() });
    });
    return 'ok';
  },
  // ===== 🍽️ Yemek Oyunu: şube soruları + aylık skor =====
  async getQuizQ(branch) { barSube_(branch); const d = await col('cfg').doc('quizq_' + branch).get(); return d.exists ? (d.data().list || []) : []; },
  async setQuizQ(branch, list, pin) {
    auth_(pin); barSube_(branch);
    const clip = (o, n) => String(o == null ? '' : o).trim().slice(0, n);
    const out = (Array.isArray(list) ? list : []).slice(0, 200).map(q => ({
      id: clip(q && q.id, 20) || Math.random().toString(36).slice(2, 8), q: clip(q && q.q, 200),
      o: (Array.isArray(q && q.o) ? q.o : []).slice(0, 4).map(x => clip(x, 80)), a: Math.max(0, Math.min(3, Number(q && q.a) || 0)), e: clip(q && q.e, 200)
    })).filter(q => q.q && q.o.length === 4 && q.o.every(Boolean));
    await col('cfg').doc('quizq_' + branch).set({ list: out, t: Date.now() });
    return out.length;
  },
  async getQuizBoard(branch, ym) {
    barSube_(branch); if (!/^\d{6}$/.test(String(ym))) throw new Error('Ay geçersiz');
    const d = await col('cfg').doc('quizsc_' + branch + '_' + ym).get(); return d.exists ? (d.data().p || {}) : {};
  },
  async quizSubmit(branch, id, name, pts, ok) {
    barSube_(branch);
    id = String(id || '').slice(0, 40); pts = Math.round(Number(pts)); ok = Math.round(Number(ok));
    if (!id || !(pts >= 0 && pts <= 150) || !(ok >= 0 && ok <= 10)) throw new Error('Skor geçersiz');
    const t = new Date(Date.now() + 3 * 3600000).toISOString(), day = t.slice(0, 10), ym = t.slice(0, 4) + t.slice(5, 7);
    const ref = col('cfg').doc('quizsc_' + branch + '_' + ym); let res = null;
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref), p = (snap.exists ? snap.data().p : null) || {};
      const e = p[id] || { n: '', pts: 0, g: 0, best: 0, day: '', dg: 0 };
      if (e.day !== day) { e.day = day; e.dg = 0; }
      e.n = String(name || e.n || '').slice(0, 40);
      const scored = e.dg < 3;
      if (scored) { e.pts += pts; e.g += 1; e.dg += 1; e.best = Math.max(e.best || 0, pts); }
      p[id] = e; tx.set(ref, { p: p, t: Date.now() });
      res = { scored: scored, left: Math.max(0, 3 - e.dg), pts: e.pts };
    });
    return res;
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
        const oldSh = (s.sh && s.sh.length === 7) ? s.sh : null, tIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
        dates.forEach((d, i) => {
          // Yeni Excel'de olmayan (işten ayrılan) personelin bugüne ve geçmişe ait vardiyası silinmesin: izinli görünmesin
          if (!e && d <= tIso && (d in shd || oldSh)) { if (!(d in shd)) shd[d] = oldSh[(new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7]; }
          else shd[d] = week[i];
        });
        Object.keys(shd).forEach(k => { if (k < cut) delete shd[k]; });
        const byWd = ['', '', '', '', '', '', ''];
        dates.forEach((d, i) => { byWd[(new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7] = week[i]; });
        s.shd = shd; s.sh = byWd; s.shc = ['', '', '', '', '', '', ''];
        if (e && e.pg) { s.pg = true; s.po = Number(e.po) || 0; } else { delete s.pg; delete s.po; }
        if (e) { if (!(s.secLock && s.sec)) { s.sec = String(e.sec || '').slice(0, 30); s.ord = Number(e.ord) || 0; } } else if (!s.secLock) { delete s.sec; delete s.ord; }
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
    if (!name || !(ciro >= 0) || !(hesap > 0)) throw new Error('Ad, ciro ve hesap sayısı gerekli');
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
  async delBeer(key, pin) { auth_(pin); await col('beer').doc(key).delete(); },
  // ===== Z POS (Kredi / Nakit + yan sütunlar) =====
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
          if (sv.t && Number(sv.t) !== bt) return sv;                       // personel/başka cihaz güncellemiş → onunki kalsın
          g.t = FL.every(f => Number(sv[f] || 0) === Number(g[f] || 0)) ? (sv.t || 0) : Date.now();
          return g;
        });
        if (!force) sG.forEach(sv => {                                       // yönetici ekranı açılmadan sonra gelen yeni satırlar kaybolmasın
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
  async getKasaDay(branch) {   // geçerli kasa günü: 00:00-02:00 arası önceki gün; günsonu alınmışsa bir sonraki gün
    barSube_(branch);
    const o = tp_(); const dt = new Date(Date.UTC(+o.year, +o.month - 1, +o.day));
    if (+o.hour % 24 < 2) dt.setUTCDate(dt.getUTCDate() - 1);
    const cache = {}; let ym = '', day = 1;
    for (let i = 0; i < 5; i++) {
      ym = dt.getUTCFullYear() + ('0' + (dt.getUTCMonth() + 1)).slice(-2); day = dt.getUTCDate();
      if (!cache[ym]) { const d = await col('cfg').doc('zpos_' + branch + '_' + ym).get(); cache[ym] = d.exists ? (d.data().days || {}) : {}; }
      if (!(cache[ym][String(day)] || {}).closed) break;
      dt.setUTCDate(dt.getUTCDate() + 1);
    }
    return { ym, day };
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
  async setGunOrt(branch, days, pin, range) {
    auth_(pin); barSube_(branch);
    if (!days || typeof days !== 'object') throw new Error('Veri yok');
    const ref = col('cfg').doc('gunort_' + branch); let removed = 0;
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
      const f = range && String(range.f || ''), t2 = range && String(range.t || '');      // aktarılan tarih aralığında raporda olmayan (eski/yanlış) günleri temizle
      if (/^\d{4}-\d{2}-\d{2}$/.test(f) && /^\d{4}-\d{2}-\d{2}$/.test(t2)) Object.keys(cur).forEach(k => { if (k >= f && k <= t2 && !days[k]) { delete cur[k]; removed++; } });
      tx.set(ref, { days: cur, t: Date.now(), branch });
    });
    return { ok: true, removed: removed };
  },
  async getPersDetay(branch) {
    barSube_(branch);
    const d = await col('cfg').doc('persdetay_' + branch).get();
    return d.exists ? { rows: d.data().rows || {}, f: d.data().f || '', e: d.data().e || '', t: d.data().t || 0 } : { rows: {}, f: '', e: '', t: 0 };
  },
  async setPersDetay(branch, rows, range, pin) {      // Personel Satış Detay raporu: kişi başı [hesap sayısı, ödemeler toplamı]
    auth_(pin); barSube_(branch);
    if (!rows || typeof rows !== 'object') throw new Error('Veri yok');
    const o = {};
    Object.keys(rows).slice(0, 80).forEach(n => {
      const a = rows[n], nm = String(n).replace(/[.\/\[\]*~`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40); if (!nm) return;
      o[nm] = [Math.round(Number(a && a[0]) || 0), Math.round((Number(a && a[1]) || 0) * 100) / 100];
    });
    if (!Object.keys(o).length) throw new Error('Kişi bulunamadı');
    const ok = x => /^\d{4}-\d{2}-\d{2}$/.test(String(x || '')) ? String(x) : '';
    await col('cfg').doc('persdetay_' + branch).set({ rows: o, f: ok(range && range.f), e: ok(range && range.e), t: Date.now(), branch });
    return { ok: true, n: Object.keys(o).length };
  },
  async clearZPosFrom(branch, ym, fromDay, pin) {      // fromDay (dahil) ve sonrasındaki günlerin kasa kayıtlarını siler
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
    await col('aireports').doc(id).set({ id, sube, title: String(title || 'Rapor').slice(0, 80), cols: cols.map(String).slice(0, 300), rj, notes: String(notes || '').slice(0, 1500), t: Date.now() });
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
    let nord = 0;
    if (sec) { const me = (await allStaff_()).find(x => x.id === id); if (me) { const same = (await allStaff_()).filter(x => x.branch === me.branch && x.id !== id && x.sec === String(sec).slice(0, 30) && x.ord); nord = same.length ? Math.max.apply(null, same.map(x => Number(x.ord) || 0)) + 0.001 : 9999; } }
    await upd_(id, s => {
      const shd = s.shd || {}, byWd = (s.sh && s.sh.length === 7) ? s.sh.slice() : ['', '', '', '', '', '', ''];
      dates.forEach((d, i) => { const c = parseCell_(cells[i]); shd[d] = c; byWd[(new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7] = c; });
      s.shd = shd; s.sh = byWd; if (!s.shc) s.shc = ['', '', '', '', '', '', ''];
      if (sec) { const ns = String(sec).slice(0, 30); if (s.sec !== ns) { s.sec = ns; s.ord = nord || 9999; s.secLock = true; } else if (!s.ord) s.ord = 9999; }   // departman elle değişince Excel yüklemesi geri bozmasın
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
const pDays=()=>{const t0=isoT(0),dow=(new Date(t0+'T00:00:00Z').getUTCDay()+6)%7,days=[];for(let i=0;i<14;i++){const d=new Date(t0+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-dow+i);days.push(d.toISOString().slice(0,10));}return days;};
const postaLoad=(days,ttl)=>Promise.all(days.map(async d=>{const k=B+d,c=PCH[k];if(c&&Date.now()-c.t<ttl)return;try{const r=await gs('getPosta',B,d);PCH[k]={t:Date.now(),m:(r&&r.m)||{}};}catch(e){}}));
function postaFill(s0){
  const sc=String(s0.sec||'').toLocaleUpperCase('tr').replace(/İ/g,'I').replace(/Ğ/g,'G');
  const srv=!sc||sc.indexOf('SERV')==0||sc.indexOf('EGIT')==0;   // servis / eğitim / bölümsüz: satır hep görünür
  const mine=()=>pDays().some(d=>{const c=PCH[B+d];return c&&Object.keys(c.m).some(p=>c.m[p]==s0.id);});
  const ensure=()=>{let e=$('hipost');if(e)return e;const h2=document.querySelector('.hi2');if(!h2)return null;e=document.createElement('div');e.className='sv2l';e.id='hipost';const k=Array.from(h2.children).find(c=>c.textContent.indexOf('☕')==0);k?h2.insertBefore(e,k):h2.appendChild(e);return e;};
  const paint=()=>{
    if(!srv&&!mine()){const e0=$('hipost');if(e0)e0.remove();return;}   // servis dışı: sadece postası varsa göster
    const e=ensure();if(!e)return;
    const f=o=>{const c=PCH[B+isoT(o)];if(!c)return '…';const k=Object.keys(c.m).find(p=>c.m[p]==s0.id);return k||'—';};
    const h='📍 Postan: Bugün <span class=\"sv2\">'+esc(f(0))+'</span> · Yarın <span class=\"sv2\">'+esc(f(1))+'</span> · <span style=\"text-decoration:underline\">📅 Haftalık</span>';
    if(e.dataset.h!==h){e.dataset.h=h;e.innerHTML=h;}
    e.style.cursor='pointer';e.onclick=()=>window.postaWeek(s0.id);
  };
  paint();
  postaLoad([isoT(0),isoT(1)],30000).then(paint);
  setTimeout(()=>postaLoad(pDays(),120000).then(paint),250);   // haftalık pencere için arka planda önceden yükle
}
window.postaWeek=async id=>{      // garson: bu haftanın ve (yüklendiyse) gelecek haftanın postaları
  const days=pDays(),t0=isoT(0),T='📅 Haftalık postam';
  const build=()=>{
    const GK=['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'],f=x=>x.slice(8)+'.'+x.slice(5,7);
    const ms=days.map(d=>(PCH[B+d]&&PCH[B+d].m)||{});
    const my=ms.map(m=>Object.keys(m).find(p=>m[p]==id)||''),any=ms.map(m=>Object.keys(m).length>0);
    const wk=(a,b,t)=>{if(!any.slice(a,b).some(x=>x))return '';let h='<div style=\"font-weight:800;margin:10px 2px 4px\">'+t+'</div><table class=\"xl xl2\" style=\"width:100%\">';
      for(let i=a;i<b;i++)h+='<tr'+(days[i]==t0?' style=\"background:rgba(250,204,21,.18)\"':'')+'><td class=\"l\"><b>'+GK[i%7]+'</b> <small>'+f(days[i])+'</small></td><td>'+(any[i]?(my[i]?'<b>'+esc(my[i])+'</b>':'—'):'<span style=\"opacity:.4\">henüz yok</span>')+'</td></tr>';
      return h+'</table>';};
    return wk(0,7,'Bu hafta')+wk(7,14,'Gelecek hafta');
  };
  const show=h=>{pop(T,h||'<p class=\"sub\">Bu hafta için henüz posta dağıtılmamış.</p>',true);$('mo').textContent='Kapat';};
  const cached=days.every(d=>PCH[B+d]);
  if(cached){show(build());   // önbellek hazır: anında aç, arkadan tazele
    postaLoad(days,60000).then(()=>{if(!$('ov').hidden&&$('mt').textContent.indexOf('Haftalık postam')>=0)show(build());});return;}
  pop(T,'<p class=\"sub\">Yükleniyor…</p>',true);$('mo').textContent='Kapat';
  try{await postaLoad(days,60000);show(build());}
  catch(e){pop(T,'<p class=\"sub\">Yüklenemedi, tekrar dene.</p>',true);$('mo').textContent='Kapat';}
};
const srvOf_=s=>String(s.sec||'').toLocaleUpperCase('tr').replace(/İ/g,'I').indexOf('SERV')==0;
let TRC=null;
function trophyFill(s0){
  { const t0=document.getElementById('trph'); if(t0) t0.remove(); } return;
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
if(!window.__mltVis){window.__mltVis=1;document.addEventListener('visibilitychange',()=>{try{if(document.visibilityState==='visible'&&window.__mltNow)window.__mltNow();}catch(e){}});}
window.molaList=function(){
  const render=()=>{
    if($('ov').hidden||$('mt').textContent.indexOf('Moladakiler')<0){clearInterval(MLT);return;}
    const now=Date.now()+off,A=D.staff.filter(s=>s.active).sort((a,b)=>a.active.start-b.active.start);
    $('mf').innerHTML=A.length?'<div class="mtw"><table class="mtb"><tr><th>Personel</th><th>Mola</th><th>Başlama</th><th>Dönüş</th><th>Kalan</th></tr>'+A.map(s=>{const a=s.active,r=endOf(a)-(a.paused?a.pausedAt:now),ab=Math.abs(r);return '<tr><td class="l"><b class="mav" data-nm="'+esc(s.name)+'">'+esc(ini(s.name))+'</b><b>'+esc(nice(s.name))+'</b></td><td>'+esc(a.n)+'</td><td>'+hm(a.start)+'</td><td>'+(a.paused?'⏸':hm(endOf(a)))+'</td><td class="'+(r<0?'late':'ok')+'">'+(r<0?'+':'')+p(ab/60000|0)+':'+p(ab/1000%60|0)+'</td></tr>';}).join('')+'</table></div>':'<p class="sub">Şu an molada kimse yok.</p>';
    const F=[];D.staff.forEach(s=>{const a=(s.done||[]).filter(x=>x&&typeof x=='object').sort((x,y)=>x.t-y.t);if(a.length)F.push({n:s.name,a:a,last:Math.max.apply(null,a.map(x=>x.e||x.t+dm(x)*60000)),tot:a.reduce((q,x)=>q+dm(x),0)});});F.sort((a,b)=>b.last-a.last);
    if(F.length)$('mf').innerHTML+='<div class="sec" style="margin:14px 2px 6px">BUGÜN BİTEN MOLALAR</div><div class="mtw"><table class="mtb"><tr><th>Personel</th><th>Bitenler</th><th>Toplam</th></tr>'+F.map(x=>'<tr><td class="l"><div class="mn"><b class="mav" data-nm="'+esc(x.n)+'">'+esc(ini(x.n))+'</b><b>'+esc(nice(x.n))+'</b></div></td><td class="l">'+x.a.map(y=>'<div class="ml"><span>'+esc(kn(y.k))+'</span> '+hm(y.t)+'–'+hm(y.e||y.t+dm(y)*60000)+' <i>'+dm(y)+' dk</i></div>').join('')+'</td><td><b>'+x.tot+' dk</b></td></tr>').join('')+'</table></div>';
  };
  pop('☕ Moladakiler · '+BR[B],'',false);render();clearInterval(MLT);let n=0;
  MLT=setInterval(()=>{if(document.hidden)return;if($('ov').hidden||$('mt').textContent.indexOf('Moladakiler')<0){clearInterval(MLT);return;}render();if(++n%5==0)google.script.run.withFailureHandler(()=>{}).withSuccessHandler(d=>{if(d&&d.names){D=d;off=d.now-Date.now();}}).getState(B,M=='y'?PIN:'');},1000);
window.__mltNow=()=>{if($('ov').hidden||$('mt').textContent.indexOf('Moladakiler')<0)return;render();google.script.run.withFailureHandler(()=>{}).withSuccessHandler(d=>{if(d&&d.names){D=d;off=d.now-Date.now();}}).getState(B,M=='y'?PIN:'');};   // uygulama tekrar açılınca hemen yenile
};
const ini=n=>nice(n).split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('');
window.pkFilter=v=>{const q=nrm(v);document.querySelectorAll('.pkc').forEach(b=>{b.style.display=(!q||b.dataset.n.indexOf(q)>=0)?'':'none';});};
window.regMe=()=>{ask('Kayıt Ol · '+BR[B],[{label:'Ad Soyad'},{label:'Telefon (isteğe bağlı)',type:'tel'},{label:'E-posta (isteğe bağlı)'},{label:'Departman',type:'select',opts:[['SERVİS','Servis'],['BAR','Bar'],['RUNNER','Runner'],['HOSTES','Hostes'],['TEMİZLİK','Temizlik']]}],v=>{if(!v[0].trim())return;google.script.run.withFailureHandler(e=>msg(emsg(e))).withSuccessHandler(n=>{msg('Kaydın oluşturuldu ✅');setTimeout(()=>{load();},400);}).selfRegister(B,v[0],v[1],v[2],v[3]);},'Kaydol');};
window.draw=function(){
  if(M!='g'){window.hideLogin&&hideLogin();od();return;}
  const me=getMe();
  if(me&&D.staff.some(s=>s.id==me)){window.hideLogin&&hideLogin();const all=D.staff,s0=all.find(s=>s.id==me);D.staff=all.filter(s=>s.id==me);try{od();}finally{D.staff=all;}
    const left=Math.max(0,D.total-usedOf(s0));
    $('list').insertAdjacentHTML('afterbegin','<div class="hi"><b data-p="'+s0.id+'" onclick="phMenu(\''+s0.id+'\')">'+esc(ini(s0.name))+'</b><div><div class="hi1">Merhaba, '+esc(nice(s0.name).split(' ')[0])+' 👋</div><div class="hi2">'+shiftTwo(s0)+'<div class="sv2l">☕ Kalan mola '+left+' dk</div></div></div></div><div class="chipsrow" style="margin:0 0 12px"><button class="pill" onclick="myCode()">🔔 Bildirim kodum</button><button class="pill" onclick="radioMode()">'+(window.__rwl?'📻 Telsiz dinleme: AÇIK':'📻 Telsiz dinle')+'</button><button class="pill" onclick="pickMe(\'\')">↩ Kişiyi değiştir</button>'+'<button class="pill" onclick="isgAc()">🦺 İSG</button>'+'<button class="pill" onclick="qrUI()">⭐ Yorum QR</button>'+'</div>');
    postaFill(s0);trophyFill(s0);window.e86Fill&&e86Fill();mbn(s0,me);vFetch(s0);radioListen(me);window.tipFill&&tipFill(s0);
    return;}
  radioListen('');head();window.showLogin();
};
window.head=function(){
  oh();$('tools').style.display='none';
  if(M=='g'){
    const me=getMe();
    $('tools').innerHTML=''
      +'<div class="chipsrow"><button class="pill" onclick="molaList()">☕ Moladakiler</button>'+(me?'<button class="pill" onclick="myCode()">🔔 Bildirim kodum</button><button class="pill" onclick="radioMode()">'+(window.__rwl?'📻 Telsiz dinleme: AÇIK':'📻 Telsiz dinle')+'</button>'+'<button class="pill" onclick="pickMe(\'\')">↩ Kişiyi değiştir</button>':'')+'</div>';
  }else if(M=='y')$('tools').innerHTML='';
};
const sty=document.createElement('style');
sty.textContent='.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;width:100%}.tiles button{border:1px solid rgba(148,163,184,.18);border-radius:18px;padding:14px 4px;background:linear-gradient(160deg,#1f2b42,#162033);color:#e2e8f0;font-weight:700;font-size:13px;line-height:1.25;box-shadow:0 6px 16px rgba(0,0,0,.28);display:flex;flex-direction:column;align-items:center;gap:6px}.tiles i{font-style:normal;font-size:26px}.tiles button:active{transform:scale(.97)}.pill{border:1px solid rgba(148,163,184,.25);background:rgba(148,163,184,.1);color:#e2e8f0;border-radius:999px;padding:10px 16px;font-weight:600;font-size:13px}.chipsrow{display:flex;gap:8px;flex-wrap:wrap;width:100%}.pkh{font-weight:800;font-size:16px;display:flex;justify-content:space-between;align-items:center;margin:4px 2px}.pkh span{font-size:12px;color:#94a3b8;font-weight:600}.pks{width:100%;padding:13px 14px;border-radius:14px;border:1px solid #334155;background:#0f172a;color:#fff;font-size:16px;margin:8px 0 12px}.pkg{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pkc{display:flex;align-items:center;gap:10px;text-align:left;padding:10px;border-radius:16px;border:1px solid rgba(148,163,184,.15);background:linear-gradient(160deg,#1f2b42,#162033);color:#f1f5f9;font-size:14px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,.25)}.pkc b{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#6366f1,#8b5cf6);font-size:14px}.pkc span{line-height:1.2;word-break:break-word}.card{border-radius:20px}#list .btns .a{min-height:56px;font-size:16px}';
document.head.appendChild(sty);
const styT=document.createElement('style');styT.textContent='.mav{display:inline-flex;width:26px;height:26px;border-radius:50%;background:#334155;font-size:10px;align-items:center;justify-content:center;vertical-align:middle;margin-right:6px;overflow:hidden;font-weight:800;flex:none}.mav.big{width:40px;height:40px;font-size:13px;margin:0}.tr1 .trc{font-size:22px}.trw{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 4px}.tr1{display:flex;gap:8px;align-items:center;background:linear-gradient(135deg,#78350f,#451a03);border:1px solid #f59e0b;border-radius:16px;padding:10px}.tr1.me{box-shadow:0 0 0 2px #fde68a}.trc{font-size:30px}.tr1 small{display:block;font-size:11px;color:#fde68a;font-weight:700}.tr1 b{display:block;font-size:14px;line-height:1.15;word-break:break-word}.tr1 em{font-style:normal;font-size:13px;color:#fbbf24;font-weight:700}.trp{font-size:11px;color:#94a3b8;margin:0 2px 12px}';document.head.appendChild(styT);

// ===== Sayfalar: Mola | Ciro | Bira | Vardiya (her biri tam sayfa) =====
let PGV='mola',PSIG='',PRQ=0,PERFSUB='';
let BARCFG={sube:'',shops:null,staff:[],busy:false};
function barIsBar(st){return !!st&&(/(^|\s)BAR/.test(String(st.sec||'').toLocaleUpperCase('tr').replace(/İ/g,'I'))||(BARCFG.staff||[]).indexOf(st.id)>-1);}
function repVis(){if(M=='y')return true;const st=(D&&D.staff)||[],me=st.find(x=>x.id==getMe());if(!me)return false;if(!st.some(x=>x.sec))return true;return srvOf_(me);}
function kasaVis(){if(M=='y')return true;const me=((D&&D.staff)||[]).find(x=>x.id==getMe());return !!me&&!!me.sec&&srvOf_(me);}   // Kasaföy: sadece SERVİS bölümü
function barVis(){if(M=='y')return true;const me=((D&&D.staff)||[]).find(x=>x.id==getMe());return barIsBar(me);}
const NV=document.createElement('div');NV.id='nv';NV.className='nv';document.querySelector('.hd').after(NV);
try{const hd0=document.querySelector('.hd');
  const bt=document.createElement('button');bt.id='dwb';bt.type='button';bt.setAttribute('aria-label','Menü');bt.innerHTML='<span></span><span></span><span></span><em>MENÜ</em>';bt.onclick=()=>window.dwOpen();hd0.insertBefore(bt,hd0.firstChild);
  const ov=document.createElement('div');ov.id='dwo';ov.onclick=()=>window.dwClose();document.body.appendChild(ov);
  const dw=document.createElement('aside');dw.id='dw';dw.innerHTML='<div class="dwh"><div id="dwp" class="dwp"></div><button type="button" class="dwx" onclick="dwClose()" aria-label="Kapat">✕</button></div><div id="dwl"></div>';document.body.appendChild(dw);
}catch(e){}
const PG=document.createElement('div');PG.id='pg';PG.hidden=true;$('beer').after(PG);
window.PERMS=[['personel','👥','Personel Listesi'],['ml','☕','Moladakiler'],['kasa','📋','Günsonu'],['vard','🗓️','Haftalık Şift'],['servis','🚌','Servis'],['bar','🍸','Bar'],['pprim','💎','Primler'],['prep','📈','Ciro / Ortalama'],['gm','⭐','GM Raporu'],['adis','🧾','Adisyon Bul'],['rapor','📤','Rapor Yükle'],['e86','🚫','86'],['rez','📅','Rezerve'],['tip','💰','Tip Box'],['video','🎬','Eğitim Videoları']];
window.hasPerm=function(k){const a=window.__ADM;if(!a||a.role=='owner')return true;if(!Array.isArray(a.perms))return true;return a.perms.indexOf(k)>=0;};
const NAVS=[['mola','🕐','Mola'],['ml','☕','Moladakiler'],['kasa','📋','Günsonu'],['vard','🗓️','Haftalık Şift'],['servis','🚌','Servis'],['bar','🍸','Bar'],['pprim','💎','Primler'],['prep','📈','Ciro / Ortalama'],['rep','📁','Performans'],['prim','💎','Primli Ürünler'],['gm','⭐','GM Raporu'],['adis','🧾','Adisyon Bul'],['e86','🚫','86'],['rez','📅','Rezerve'],['tip','💰','Tip Box']];
const navOK=n=>n[0]!='rep'&&n[0]!='prim'&&(n[0]!='bar'||barVis())&&((n[0]!='rep'&&n[0]!='gm'&&n[0]!='prim')||repVis())&&(n[0]!='pprim'&&n[0]!='prep'||M=='y')&&(n[0]!='adis'||M=='y')&&(n[0]!='e86'||M=='y')&&(n[0]!='kasa'||M=='y'||(M=='g'&&getMe()&&kasaVis()&&window.__kasaOpen))&&(n[0]!='servis'||M=='y'||(M=='g'&&getMe()))&&(n[0]!='rez'||(window.rezOK&&rezOK()))&&(n[0]!='tip'||M=='y'||(M=='g'&&getMe()&&(window.__tipIds||[]).indexOf(getMe())>-1))&&(M!='y'||hasPerm(n[0]));
const navGo=n=>n[0]=='pprim'?"perfDirect('prim')":n[0]=='prep'?"perfDirect('rep')":n[0]=='e86'?'e86UI()':n[0]=='kasa'?(M=='y'?'zPosUI()':'myKasaUI()'):n[0]=='ml'?'molaList()':n[0]=='tip'?'tipUI()':n[0]=='rez'?'rezUI()':"goPg('"+n[0]+"')";
const navLb=n=>n[0]=='kasa'&&M!='y'?'Kasaföy':n[2];
window.dwOpen=()=>{try{nvDraw();}catch(e){}document.body.classList.add('dwon');};
window.dwClose=()=>{document.body.classList.remove('dwon');};

/* ===== Personel ekranı: menü tuşu yok, ana sayfada kutucuklar, beyaz canlı tema ===== */
let EXPERM={b:'',ids:null,t:0,busy:false};
function exOK(){   // Menü Sınavı: sadece yöneticinin seçtiği kişiler (izin listesi sınav modülüyle aynı önbellek)
  try{
    const me=getMe();if(!me)return false;
    if(EXPERM.b!==B){EXPERM={b:B,ids:null,t:0,busy:false};try{const c=JSON.parse(localStorage.getItem('exam_perm_'+B)||'null');if(c&&c.ids){EXPERM.ids=c.ids;EXPERM.t=c.t||0;}}catch(e){}}
    if((!EXPERM.ids||Date.now()-EXPERM.t>900000)&&!EXPERM.busy){EXPERM.busy=true;gs('getExamPerm',B).then(r=>{EXPERM.ids=r||[];EXPERM.t=Date.now();try{localStorage.setItem('exam_perm_'+B,JSON.stringify({t:EXPERM.t,ids:EXPERM.ids}));}catch(e){}EXPERM.busy=false;NVSIG='';}).catch(()=>{EXPERM.busy=false;EXPERM.t=Date.now()-840000;});}
    return !!EXPERM.ids&&EXPERM.ids.indexOf(me)>-1;
  }catch(e){return false;}
}
function pTiles(){
  const me=((D&&D.staff)||[]).find(x=>x.id==getMe()),srv=!!me&&!!me.sec&&srvOf_(me);
  const t=[['mola','🕐','Mola',"goPg('mola')"],['ml','☕','Moladakiler','molaList()'],['vard','🗓️','Haftalık Şift',"goPg('vard')"]];
  if(srv){t.push(['pprim','💎','Primler',"perfDirect('prim')"]);t.push(['prep','📈','Ciro / Ortalama',"perfDirect('rep')"]);if(window.__kasaOpen)t.push(['kasa','📋','Kasaföy','myKasaUI()']);if(exOK())t.push(['exam','📝','Menü Sınavı','examUI()']);t.push(['oyun','🎮','Oyunlar','oyunlarUI()']);}
  t.push(['video','🎬','Videolar',"goPg('video')"]);
  t.push(['hijyen','🧼','Hijyen Belgesi',"window.open('https://www.hemba.gov.tr/egitim-detay/isimiz-temiz-projesi-yiyecek-icecek-sektorundeki-mikro-isletmeler-icin-hijyen-egitimi-43','_blank')"]);
  t.push(['rlife','📱','R Life İndir',"window.open('https://apps.apple.com/app/id1672302010','_blank')"]);
  NAVS.forEach(n=>{if(['servis','bar','rez','tip'].indexOf(n[0])>-1&&navOK(n))t.push([n[0],n[1],navLb(n),navGo(n)]);});
  return t;
}
const PMS={set:new WeakSet(),mod:[],obs:null,t:0};
(function(){const st=document.createElement('style');st.id='pmcss';st.textContent=`
html.pm #dwb,html.pm #dw,html.pm #dwo{display:none!important}
#nv.pnv{display:grid!important;grid-template-columns:repeat(3,1fr)!important;gap:8px!important;padding:0!important;margin:0 0 12px!important;overflow:visible!important;background:transparent!important;border:0!important;box-shadow:none!important}
#nv.pnv button{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:5px!important;min-height:74px!important;padding:9px 4px!important;margin:0!important;width:auto!important;flex:none!important;border-radius:16px!important;border:1px solid rgba(255,255,255,.09)!important;background:linear-gradient(160deg,#2b161a,#1a0d10)!important;color:#f6ecec!important;font-weight:700!important;font-size:12px!important;line-height:1.2!important;text-align:center!important;white-space:normal!important;overflow-wrap:anywhere!important;box-shadow:0 4px 12px rgba(0,0,0,.35)!important}
#nv.pnv button i{font-style:normal!important;font-size:24px!important;line-height:1!important}
#nv.pnv button.on{background:linear-gradient(160deg,#e0524a,#b02a27)!important;color:#fff!important;border-color:rgba(255,255,255,.18)!important;box-shadow:0 6px 16px rgba(176,42,39,.45)!important}
html.pm #dwb,html.pm #dw,html.pm #dwo{display:none!important}
.psec{margin:0 0 20px}.pst{font-weight:900;font-size:16px;margin:4px 2px 8px}
.pfo{display:flex;flex-direction:column;gap:12px}
.pfb{display:flex!important;align-items:center;gap:14px;width:100%;padding:16px 14px!important;border:0!important;border-radius:18px!important;color:#fff!important;text-align:left;box-shadow:0 8px 20px rgba(0,0,0,.22)}
.pfb i{font-style:normal;font-size:32px;flex:none;line-height:1}.pfb span{flex:1;min-width:0}.pfb b{display:block;font-size:16px;font-weight:800;color:#fff}.pfb small{display:block;font-size:12px;opacity:.92;margin-top:2px;font-weight:600;color:#fff}.pfb em{font-style:normal;font-size:28px;opacity:.85;color:#fff}
.pf-prim{background:linear-gradient(135deg,#7c3aed,#4f46e5)!important}.pf-rep{background:linear-gradient(135deg,#0ea5e9,#2563eb)!important}.pf-gm{background:linear-gradient(135deg,#f59e0b,#ea580c)!important}
.pfback{border:0;background:rgba(148,163,184,.2);color:inherit;border-radius:12px;padding:9px 14px;font-weight:700;margin:0 0 10px;font-size:13.5px}
`;document.head.appendChild(st);})();
function pmApply(){const on=(M=='g');document.documentElement.classList.toggle('pm',on);document.body.classList.toggle('pmode',on);}
const nvDraw=()=>{
  pmApply();
  const items=NAVS.filter(navOK),cur=items.find(n=>n[0]==PGV);
  /* Ana sayfa: Mola başlat + Moladakiler sekmesi. Diğer her şey soldaki menüden. */
  if(M=='g'&&getMe()){
    NV.className='nv pnv';
    NV.innerHTML=pTiles().map(t=>'<button class="'+(navOn(t)?'on':'')+'" onclick="'+t[3]+'"><i>'+t[1]+'</i>'+t[2]+'</button>').join('');
  }else if(M=='y'){
    NV.className='nv pnv ynv';
    NV.innerHTML=(hasPerm('personel')?'<button onclick="stfOpen()"><i>👥</i>Personel Listesi</button>':'')+items.filter(n=>['mola','e86','rez','tip'].indexOf(n[0])<0).map(n=>'<button class="'+(navOn(n)?'on':'')+'" onclick="'+navGo(n)+'"><i>'+n[1]+'</i>'+esc(navLb(n))+'</button>').join('');
  }else{
    NV.className='nv';
    NV.innerHTML='<button class="'+(PGV=='mola'?'on':'')+'" onclick="goPg(\'mola\')"><i>🕐</i>Mola</button><button onclick="molaList()"><i>☕</i>Moladakiler</button>'+((PGV!='mola'&&cur&&cur[0]!='ml')?'<button class="on"><i>'+cur[1]+'</i>'+navLb(cur)+'</button>':'');
    NV.classList.remove('nv5');
  }
  const dl=document.getElementById('dwl');if(!dl)return;
  let me0=null;try{me0=((D&&D.staff)||[]).find(x=>x.id==getMe())||null;}catch(e){}
  const hd=document.getElementById('dwp');
  if(hd){let who=(M=='y')?'Yönetici':(me0?nice(me0.name):'Personel');let br='';try{br=BR[B]||'';}catch(e){}hd.innerHTML='<b>'+esc(String(who).trim().charAt(0).toLocaleUpperCase('tr')||'?')+'</b><div><div class="dwn">'+esc(who)+'</div><div class="dws2">'+esc(br)+' · '+(M=='y'?'Yönetici modu':'Personel')+'</div></div>';}
  const row=(ic,lb,fn,on)=>'<button class="dwi'+(on?' on':'')+'" onclick="dwClose();'+fn+'"><i>'+ic+'</i><span>'+lb+'</span></button>';
  let h='<div class="dwt">MENÜ</div>'+items.map(n=>row(n[1],esc(navLb(n)),navGo(n),navOn(n))).join('');
  h+='<div class="dwt">KISAYOLLAR</div>';
  if(M=='g'&&me0){h+=row('🔔','Bildirim kodum','myCode()')+row('📻',window.__rwl?'Telsiz dinleme: AÇIK':'Telsiz dinle','radioMode()')+row('↩','Kişiyi değiştir',"pickMe('')");}
  h+=row('🎮','Oyunlar','oyunlarUI()')+row('🦺','İSG','isgAc()')+row('⭐','Yorum QR','qrUI()');
  dl.innerHTML=h;
};
window.perfGo=k=>{PERFSUB=k||'';PSIG='';pgSync();window.scrollTo(0,0);};
window.perfOpen=()=>{PERFSUB='';goPg('perf');};
window.perfDirect=k=>{PERFSUB=k;PGV='perf';goPg('perf');};
function navOn(n){return n[0]=='pprim'?(PGV=='perf'&&PERFSUB=='prim'):n[0]=='prep'?(PGV=='perf'&&PERFSUB=='rep'):PGV==n[0];}
window.goPg=v=>{
  if(v=='perf'&&PGV!='perf')PERFSUB='';
  PGV=v;PSIG='';nvDraw();
  ['tools','st','sum','list','rpt','beer'].forEach(id=>{const e=$(id);if(e)e.style.display=v=='mola'?'':'none';});
  PG.hidden=v=='mola';
  if(v!='mola'){PG.innerHTML='<p class="sub">Yükleniyor…</p>';pgSync();}
  window.scrollTo(0,0);
};
nvDraw();
// Menü butonları; mod (Personel/Yönetici), kişi veya yetki değişince kendiliğinden yenilensin (draw()'a bağlı kalma)
window.__kasaOpen=false;
/* KOTA: eskiden her garson telefonu 8 sn'de bir Firestore'dan "kasa açık mı" okuyordu (saatte ~450 okuma/telefon).
   Şimdi tek bir canlı dinleyici var: yalnızca yönetici kasayı açıp/kapatınca okuma sayılır. Aşağıdaki 3 sn'lik zamanlayıcı SADECE yerel kontrol yapar (sunucuya gitmez). */
const KOP={b:null,un:null,wait:0};
const kopSub=()=>{try{
  const want=(M=='g'&&typeof B!='undefined'&&B&&getMe())?B:null;
  if(want===KOP.b||(want&&Date.now()<KOP.wait))return;
  if(KOP.un){try{KOP.un();}catch(e){}KOP.un=null;}
  KOP.b=want;
  if(!want){window.__kasaOpen=false;return;}
  ready.then(()=>{ if(KOP.b!==want)return;
    KOP.un=col('cfg').doc('kasaopen_'+want).onSnapshot(sn=>{window.__kasaOpen=!!(sn.exists&&sn.data().open);},e=>{KOP.b=null;KOP.un=null;KOP.wait=Date.now()+60000;});
  }).catch(()=>{KOP.b=null;KOP.wait=Date.now()+60000;});
}catch(e){}};
setInterval(kopSub,3000);setTimeout(kopSub,1800);
let NVSIG='';setInterval(()=>{try{const v=(D?barVis()+'|'+repVis()+'|'+(window.svMe&&svMe()):'x')+'|'+M+'|'+B+'|'+PGV+'|'+getMe()+'|'+(window.__tipIds||[]).join(',')+'|'+(window.rezOK&&rezOK())+'|'+(window.__kasaOpen?1:0)+'|'+(M=='g'?exOK():'');if(v!==NVSIG){NVSIG=v;nvDraw();}}catch(e){}},600);
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
window.vwkSet=k=>{window.__vwk=k;PSIG='';try{pgSync();}catch(e){}};
function vardHtml(){
  const td=(new Date().getDay()+6)%7,me=getMe();let st=((D&&D.staff)||[]).filter(s=>!s.off);
  if(st.some(s=>s.sec))st=st.filter(s=>s.sec);
  if(!st.some(s=>s.sh))return '<p class="sub" style="padding:10px">Bu şube için vardiya henüz yüklenmedi.</p>';
  const wn=window.weekNote?window.weekNote():'';
  st.sort((a,b)=>((a.ord||1e9)-(b.ord||1e9))||a.name.localeCompare(b.name,'tr'));
  const sk=s=>String(s.sec||'').toLocaleUpperCase('tr').replace(/İ/g,'I').trim(),so=[];st.forEach(s=>{const k=sk(s);if(so.indexOf(k)<0)so.push(k);});
  st.sort((a,b)=>so.indexOf(sk(a))-so.indexOf(sk(b)));let ps='';   // yeni eklenenler de kendi departmanının altına girer
  const mon0=new Date();mon0.setDate(mon0.getDate()-td);
  const isoL=x=>x.getFullYear()+'-'+('0'+(x.getMonth()+1)).slice(-2)+'-'+('0'+x.getDate()).slice(-2);
  const nIso=DAYS.map((d,i)=>{const x=new Date(mon0);x.setDate(mon0.getDate()+7+i);return isoL(x);});
  const hasNext=st.some(s=>s.shd&&nIso.some(d=>s.shd[d]));      // gelecek haftanın vardiyası yüklendi mi
  const wk=hasNext?(window.__vwk==null?(td>=5?1:0):window.__vwk):0,tdx=wk?-1:td;   // cumartesi/pazar günü doğrudan gelecek hafta açılır
  const mon=new Date(mon0);mon.setDate(mon0.getDate()+wk*7);
  const vtabs=hasNext?'<div class="seg" style="margin:6px 0"><button class="'+(wk?'':'on')+'" onclick="vwkSet(0)">Bu hafta</button><button class="'+(wk?'on':'')+'" onclick="vwkSet(1)">Gelecek hafta</button></div>':'';
  const dts=DAYS.map((d,i)=>{const x=new Date(mon);x.setDate(mon.getDate()+i);return x.toLocaleDateString('tr-TR',{day:'numeric',month:'short'});});
  const ad=M=='y',hd='<tr><th class="nmc">Personel</th>'+DAYS.map((d,i)=>'<th class="'+(i==tdx?'td':'')+'">'+dts[i]+'<br><span class="dn">'+VD_SH[i]+'</span></th>').join('')+'<th class="mc">Mesai<br><span class="dn">9 sa üzeri</span></th></tr>';
  const rows=st.map(s=>{
    const sh=(s.sec&&sk(s)!==ps)?'<tr><td class="secr" colspan="9">'+esc(s.sec)+'</td></tr>':'';if(s.sec)ps=sk(s);
    let ot=0,hs=0;
    const tds=DAYS.map((d,i)=>{const c=vdCell(wk?(s.shd&&s.shd[nIso[i]]):(s.sh&&s.sh[i]));ot+=c.ot;hs+=c.h;return '<td class="c '+c.cls+(i==tdx?' tdy':'')+'">'+c.a+'</td>';}).join('');
    return sh+'<tr'+(s.id==me&&M=='g'?' class="mine"':'')+'><td class="nmc">'+esc(nice(s.name).toLocaleUpperCase('tr'))+(ad?'<div class="vda"><button onclick="shEdit(\''+s.id+'\')">✏️</button><button onclick="shDel(\''+s.id+'\')">🗑</button></div>':'')+'</td>'+tds
      +'<td class="mt">'+(ot?'<b>+'+vdF(ot)+'</b><small>'+vdF(hs)+' sa</small>':'<b class="z">–</b><small>'+(hs?vdF(hs)+' sa':'')+'</small>')+'</td></tr>';
  }).join('');
  const lg='<div class="vdl"><span><u class="off"></u>İzinli</span><span><u class="y"></u>08</span><span><u class="g"></u>10</span><span><u class="b"></u>12</span><span><u class="n"></u>14-16</span><span class="vdn">+ = 9 saati aşan mesai</span></div>';
  return wn+vtabs+'<div class="vdw"><table class="vd">'+hd+rows+'</table></div>'+lg;
}
const styVD=document.createElement('style');
styVD.textContent='.vdw{border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#fff}table.vd{border-collapse:separate;border-spacing:0;table-layout:fixed;width:100%;color:#111827;font-size:10px}table.vd th,table.vd td{border-bottom:1px solid #eceff3;border-right:1px solid #f1f3f6;padding:5px 1px;text-align:center;vertical-align:middle;overflow:hidden}table.vd th{background:#7f1d1d;color:#fff;font-weight:700;font-size:9px;line-height:1.25;padding:6px 1px}table.vd th .dn{color:#fecaca;font-weight:600;font-size:8.5px}table.vd th.nmc{width:19%;text-align:left;padding-left:6px}table.vd th.mc{width:12%}table.vd th.td{background:#b91c1c}table.vd td.nmc{text-align:left;font-weight:800;font-size:9.5px;line-height:1.2;padding:5px 3px 5px 6px;background:#fff;color:#111827;word-break:break-word}table.vd td.secr{background:#fee2e2;color:#7f1d1d;font-weight:800;letter-spacing:.1em;text-align:left;padding:8px 8px;font-size:11px}table.vd td.c b{display:block;font-weight:800;font-size:10px;line-height:1.15}table.vd td.c i{display:block;font-style:normal;font-size:9.5px;line-height:1.15;opacity:.8}table.vd td.c em{display:block;font-style:normal;font-size:8.5px;font-weight:800;color:#b45309;line-height:1.2;margin-top:1px}table.vd td.c .vi{font-weight:800;font-size:9px;color:#991b1b}table.vd td.off{background:#fecaca}table.vd td.y{background:#fde047}table.vd td.g{background:#d1d5db}table.vd td.b{background:#93c5fd}table.vd td.n{background:#86efac}table.vd td.tdy{box-shadow:inset 0 0 0 2px #7f1d1d}table.vd td.mt{background:#fffbeb}table.vd td.mt b{display:block;font-size:11px;font-weight:800;color:#b45309}table.vd td.mt b.z{color:#9ca3af}table.vd td.mt small{display:block;font-size:8.5px;color:#6b7280}table.vd tr.mine td.nmc{outline:3px solid #facc15;outline-offset:-3px}.vda{margin-top:3px}.vda button{border:0;background:#f1f5f9;border-radius:6px;font-size:10px;padding:2px 5px;margin-right:3px}.vdl{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:11px;color:#cbd5e1;margin:10px 2px 0;align-items:center}.vdl u{display:inline-block;width:12px;height:12px;border-radius:4px;vertical-align:-2px;margin-right:4px;text-decoration:none}.vdl u.off{background:#fecaca}.vdl u.y{background:#fde047}.vdl u.g{background:#d1d5db}.vdl u.b{background:#93c5fd}.vdl u.n{background:#86efac}.vdn{opacity:.8}';
document.head.appendChild(styVD);
let CSUB='ort',REPSUB='ciro';const PS=()=>['urun','cay','bira'].indexOf(REPSUB)>=0?REPSUB:'urun';
window.setSub=x=>{CSUB=x;renderPg(true);};
async function renderPg(cache,vv0,ret){
  const v=vv0||PGV,my=ret?PRQ:++PRQ,adm=M=='y',b=(f,x,c)=>`<button class="a ${c||'ed'}" onclick="${f}">${x}</button>`;
  let title='',acts='',body='',per='';
  const pAct=sel=>adm?b('aiUI()','📎 Excel yükle','an')+(sel?b(`repDel('${sel.id}')`,'🗑 Dönemi sil','off'):''):'';
  const perBar=(k,g,G)=>adm?'<div class="pers">'+G.map(x=>`<button class="${g&&x.k==g.k?'on':''}" data-p="${esc(x.k)}" onclick="setPer('${k}',this.dataset.p)">${esc(x.k)} · ${x.rows.length}</button>`).join('')+'</div>':(g?`<div class="perl">Son yüklenen dönem: <b>${esc(g.k)}</b> · ${new Date(g.t).toLocaleDateString('tr-TR')}</div>`:'');
  try{
    let jr=false;
    if(v=='rep'){try{await goLoad(false);jr=!!(GO.d&&Object.keys(GO.d).length);}catch(e){jr=false;}}
    if(v=='perf'){
      const PF={prim:['💎','Garson Prim Tablosu','Primli ürünler · çay ve bira kotası'],rep:['📈','Garson Ortalama · Ciro','Tarih aralığına göre ortalama, ciro, hesap'],gm:['⭐','Garson GM Raporu','GM raporu']};
      if(!PERFSUB||!PF[PERFSUB]){
        title='📊 Garson Performans Raporu';
        body='<button class="pfback" onclick="goPg(\'mola\')">🏠 Ana Sayfa</button><div class="pfo">'+['prim','rep','gm'].map(k=>'<button class="pfb pf-'+k+'" onclick="perfGo(\''+k+'\')"><i>'+PF[k][0]+'</i><span><b>'+PF[k][1]+'</b><small>'+PF[k][2]+'</small></span><em>›</em></button>').join('')+'</div>';
      }else{
        const r=await renderPg(cache,PERFSUB,true);
        title=PF[PERFSUB][0]+' '+PF[PERFSUB][1];acts=r.acts||'';per=r.per||'';
        body='<button class="pfback" onclick="goPg(\'mola\')">‹ 🏠 Ana Sayfa</button>'+r.body;
      }
    }else if(v=='rep'&&jr){
      const m=goModel(),L=m.names.map(n=>{const t=m.tot[n];return {name:n,ciro:t[1],hesap:t[0],ort:t[0]?t[1]/t[0]:0};}).filter(r=>(r.ciro>0&&r.hesap>=5)||(isZeroAcc(r.name)&&r.hesap>0)),hid=m.names.length-L.length;
      window.__jrRows=L.filter(r=>!isZeroAcc(r.name));
      const yrs=new Set(m.all.map(k=>k.slice(0,4))).size>1,lab=k=>{const t=adFmtD(k);return yrs?t:t.slice(0,5);},opts=sel=>m.all.map(k=>'<option value="'+k+'"'+(k==sel?' selected':'')+'>'+lab(k)+'</option>').join('');
      const exN=m.ds.length-(m.on?m.on.length:m.ds.length);
      title='📁 Personel Performans';per='';
      acts=(adm?b("goUp('rep')",'📎 Fiş jurnali yükle','an')+b('ciroXlsPick()','📎 Personel detay yükle','an'):'')+b('jrXls()','⬇ Excel','')+(adm?b('goNames()','✏️ İsimler'):'');
      body='<div class="gor"><span>Tarih</span><select onchange="repRange(\'f\',this.value)">'+opts(GO.f)+'</select><span>–</span><select onchange="repRange(\'e\',this.value)">'+opts(GO.e)+'</select><button onclick="repLast(7)">Son 7</button><button onclick="repLast(14)">Son 14</button><button onclick="repLast(0)">Tümü</button></div>'
        +'<div class="perl" style="margin:6px 2px 10px">'+adFmtD(GO.f)+' – '+adFmtD(GO.e)+' · <b>'+m.ds.length+'</b> gün'+(exN>0?' ('+exN+' gün hesaba katılmıyor)':'')+(GO.t?' · yüklenme '+new Date(GO.t).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'')+(hid>0?' · '+hid+' kişi (5\'ten az hesap) gizlendi':'')+'</div>'
        +'<div class="perl" style="margin:10px 2px 4px"><b>🧾 Fiş jurnali</b></div>'
        +(L.length?lbCiro(L,false,CSUB):'<p class="sub" style="padding:10px">Bu tarih aralığında kayıt yok.</p>');
      try{const RG=grp(await fCiro()),g=RG[0];if(g&&g.rows.length){body+='<div class="perl" style="margin:16px 2px 4px"><b>📄 Personel detay raporu</b> · '+esc(g.k)+' · yüklenme '+new Date(g.t).toLocaleDateString('tr-TR')+'<br><span style="font-size:11px">Ortalama = Ödemeler Toplamı ÷ Hesap Sayısı</span></div>'+lbCiro(g.rows.slice().sort((a,c)=>c.ort-a.ort),false,'ort');}}catch(e){}
    }else if(v=='ciro'||v=='bira'||v=='rep'){
      const bi=v=='bira',vv=v=='rep'?'ciro':v;
      if(!(cache&&PC[vv].length))PC[vv]=grp(await(bi?fBira():fCiro()));
      const G=PC[vv],g=selG(vv),L=g?g.rows.slice():[];
      const T=bi?((cache&&window.__T)?window.__T:(window.__T=await tgt())):0;
      title=bi?'🍺 Bira Satışı':(v=='rep'?'📁 Personel Performans':'📊 Ciro & Ortalama');per=perBar(vv,g,G);
      acts=b(`pgXls('${vv}')`,'⬇ Excel','')+(adm?(bi?b('beerPick()','📷 Görselleri yükle')+b('beerManual()','✍ Elle'):b(v=='rep'?"goUp('rep')":'ciroXlsPick()','📎 '+(v=='rep'?'Fiş jurnali yükle':'Excel yükle'),'an')+(v=='rep'?b('ciroXlsPick()','📎 Personel detay yükle','an'):'')+b('rptManual()','✍ Elle'))+(g?b(`movPer('${vv}')`,'🔀 Dönemi taşı')+b(`delPer('${vv}')`,'🗑 Dönemi sil','off'):'')+(bi?b('setTgt()','🎯 Hedef: '+T):''):'');
      const seg=bi?'':'';const seg_old=bi?'':`<div class="seg"><button class="${CSUB=='ort'?'on':''}" onclick="setSub('ort')">📊 Ortalama</button><button class="${CSUB=='ciro'?'on':''}" onclick="setSub('ciro')">💰 Ciro</button></div>`;
      body=(v=='rep'?leadCards(L):'')+seg+(L.length?(bi?lbBira(L.sort((a,c)=>c.qty-a.qty),adm,T):lbCiro(L,adm,CSUB)):'<p class="sub" style="padding:10px">Bu şube için henüz kayıt yok.'+(adm?' 📎 Excel yükle ile "Personel Satış Detay Raporu"nu ekle.':'')+'</p>');
    }else if(v=='prim'&&PS()=='cay'){
      const Lr=(await gs('listAiReports')).filter(r=>r.sube==B).map(x=>window.repNorm?window.repNorm(x):x);window.__reps=Lr;
      const T=await tgtK('cay');window.__cayT=T;const wc=Lr.filter(r=>(r.cols||[]).indexOf('Çay')>0),sel=wc.find(r=>r.id==window.__repSel)||wc[0];
      title='💎 Primli Ürünler';acts=pAct(sel)+(adm?b("setTgt('cay')",'🎯 Kota: '+(T||'yaz')):'');
      body=repTabs()+(sel?cayKota(sel,T,adm,wc):'<p class="sub" style="padding:10px">Çay satışı için önce <b>Primli ürünler</b> raporu (Ürün Excel) yüklenmeli.</p>');
    }else if(v=='prim'&&PS()=='bira'){
      const Lr=(await gs('listAiReports')).filter(r=>r.sube==B).map(x=>window.repNorm?window.repNorm(x):x);window.__reps=Lr;
      const T=window.__biraT=await tgtK('bira'),wb=Lr.filter(r=>(r.cols||[]).indexOf('Bira')>0),sel=wb.find(r=>r.id==window.__repSel)||wb[0];
      title='💎 Primli Ürünler';acts=pAct(sel)+(adm?b("setTgt('bira')",'🎯 Kota: '+(T||'yaz')):'');
      body=repTabs()+(sel?biraKota(sel,T,adm,wb):'<p class="sub" style="padding:10px">Bira satışı için önce <b>Primli ürünler</b> raporu (Ürün Excel) yüklenmeli.</p>');
    }else if(v=='prim'){
      const L=(await gs('listAiReports')).filter(r=>r.sube==B).map(x=>window.repNorm?window.repNorm(x):x);window.__reps=L;window.__cayT=await tgtK('cay');window.__biraT=await tgtK('bira');
      const sel=L.find(r=>r.id==window.__repSel)||L[0];
      title='💎 Primli Ürünler';acts=pAct(sel);
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
      title='🗓️ Haftalık Şift';
      const si=await gs('getShiftImg',B).catch(()=>null);window.__shi=(si&&si.img)?si:null;
      acts=(adm?b('shiftXlsPick()','📎 Vardiya Excel yükle','an')+b('postaUI()','📋 Postalar')+b('shAdd()','➕ Vardiyaya kişi ekle')+(window.__shi?b('shImgDel()','🗑 Görseli kaldır','off'):'')+b('shiftClr()','🗑 Tabloyu temizle','off'):'');
      body=(window.__shi?`<div class="simg"><div class="simgh">🖼 Güncel vardiya görseli<span>${new Date(si.t).toLocaleDateString('tr-TR')}</span></div><img src="${si.img}" alt="Vardiya" onclick="showShImg()"><div class="simgt">Büyütmek için dokun</div></div>`:'')+vardHtml();
    }
  }catch(e){body='<div class="err">'+esc(emsg(e))+'</div>';}
  if(ret)return {title:title,acts:acts,body:body,per:per};
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
  const v=barVis()+'|'+repVis()+'|'+M;if(v!==BARVIS){BARVIS=v;nvDraw();if(M!='y'&&PGV=='adis')goPg('mola');if(!barVis()&&PGV=='bar')goPg('mola');if(!repVis()&&(PGV=='rep'||PGV=='gm'||PGV=='prim'))goPg('mola');}
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
styGM.textContent='.gmc{background:#172033;color:#f1f5f9;border:1px solid rgba(148,163,184,.14);border-radius:18px;margin-bottom:10px;overflow:hidden}.gmm{display:flex;align-items:center;gap:12px;padding:12px}.gms{flex:none;width:64px;height:64px;border-radius:18px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#334155;color:#fff}.gms b{font-size:24px;line-height:1}.gms small{font-size:9px;opacity:.85;margin-top:2px}.gms.g{background:linear-gradient(135deg,#10b981,#047857)}.gms.o{background:linear-gradient(135deg,#f59e0b,#b45309)}.gms.r{background:linear-gradient(135deg,#ef4444,#991b1b)}.gms.big{width:78px;height:78px}.gms.big b{font-size:30px}.gmi{flex:1;min-width:0}.gmz{font-weight:800;font-size:15px}.gmme{font-size:10px;background:#f59e0b;color:#1c1917;border-radius:8px;padding:2px 6px;margin-left:6px;vertical-align:middle}.gmn{display:flex;align-items:center;gap:6px;margin-top:4px;font-size:14px;font-weight:700}.gmn.miss{color:#fbbf24}.gmx{font-size:11.5px;color:#94a3b8;margin-top:3px}.gmgo{font-size:26px;color:#64748b}.gma{display:flex;gap:8px;padding:0 12px 12px}.gmh{display:flex;align-items:center;gap:14px;margin-bottom:12px}.gmt{overflow-x:auto;margin-bottom:12px}.gmt table{width:100%;border-collapse:collapse;font-size:12.5px}.gmt th{font-size:10.5px;color:#94a3b8;padding:4px 6px;text-align:right}.gmt th:first-child,.gmt td:first-child{text-align:left}.gmt td{padding:6px;text-align:right;border-top:1px solid rgba(148,163,184,.14)}.gmt tr.l1 td{font-weight:800;background:rgba(148,163,184,.1)}.gmt tr.l0 td{font-weight:800}.gmt tr.l2 td:first-child{padding-left:14px}.gmt td.r{color:#fb7185;font-weight:800}.gmh2{font-weight:800;margin:12px 0 6px}.gmb{display:flex;gap:10px;align-items:flex-start;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:12px;padding:8px 10px;margin-bottom:6px;font-size:13px}.gmb>b{flex:none;background:#ef4444;color:#fff;border-radius:8px;padding:2px 8px}.gmb small{display:block;color:#94a3b8;margin-top:2px}.gmk{background:#0f172a;border-radius:12px;padding:10px;margin-bottom:6px;font-size:13px;line-height:1.45}.gmk small{display:block;color:#94a3b8;font-weight:700;margin-bottom:3px}';
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
// ===== 📅 Günlük ortalama: Fiş Journal (adisyon) raporundan gün gün personel ortalaması =====
const GO = { d: null, b: '', t: 0, at: 0, m: 'ort', mo: '', ex: {} };
function goParse(aoa) {
  let hi = -1, C = {};
  for (let i = 0; i < Math.min(aoa.length, 80) && hi < 0; i++) {
    const f = aoa[i].map(c => skN(c).trim());
    const di = f.indexOf('tarih'), fi = f.indexOf('fis no'), ti = f.findIndex(x => x == 'tutar' || x == 'toplam tutar'),
      pi = f.findIndex(x => x == 'kasiyer_adi' || x.indexOf('kasiyer') == 0 || x == 'garson' || x.indexOf('personel adi') == 0);
    if (di > -1 && fi > -1 && ti > -1 && pi > -1) { hi = i; C = { d: di, n: fi, t: ti, p: pi }; }
  }
  if (hi < 0) throw new Error('Rapor formatı tanınmadı (Tarih / Fiş No / Kasiyer / Tutar sütunları yok). "Fiş Journal Raporu" yüklemelisin.');
  const dd = v => {
    if (typeof v == 'number' && v > 20000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5).toISOString().slice(0, 10);
    const m = String(v || '').trim().match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
    return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : '';
  };
  const num = v => { if (typeof v == 'number') return v; let t = String(v == null ? '' : v).trim(); if (!t) return NaN; if (t.indexOf(',') > -1) t = t.replace(/\./g, '').replace(',', '.'); const x = parseFloat(t); return isNaN(x) ? NaN : x; };
  const days = {}; let cnt = 0, mn = '9999', mx = '0000', zero = 0, rawSum = 0, foot = null;
  for (let i = hi + 1; i < aoa.length; i++) {
    if (foot == null) { const r0 = aoa[i], k0 = r0.findIndex(c => skN(c).replace(/[\s:]/g, '') == 'toplamtutar'); if (k0 > -1) { const v0 = r0.slice(k0 + 1).map(x => (typeof x == 'number' ? x : parseFloat(String(x).replace(/\./g, '').replace(',', '.')))).find(x => typeof x == 'number' && !isNaN(x)); if (v0 != null) foot = v0; } }
    let r = aoa[i], d = dd(r[C.d]), fn = num(r[C.n]), tt = num(r[C.t]), nm = String(r[C.p] == null ? '' : r[C.p]).replace(/\s+/g, ' ').trim();
    if (!d || !(fn > 0) || isNaN(tt)) continue;
    rawSum += tt;
    if (tt < 0) { zero++; continue; }           // eksi tutarlı (iade) satırlar atlanır; 0 TL ile kapanan hesaplar HESAP SAYISINA girer (Personel detay raporuyla aynı)
    if (!nm) nm = 'İsimsiz';
    const o = days[d] || (days[d] = {}), a = o[nm] || (o[nm] = [0, 0]);
    a[0] += 1; a[1] += tt; cnt++;
    if (d < mn) mn = d; if (d > mx) mx = d;
  }
  if (!cnt) throw new Error('Dosyada fiş satırı bulunamadı');
  Object.keys(days).forEach(d => Object.keys(days[d]).forEach(n => { days[d][n][1] = Math.round(days[d][n][1] * 100) / 100; }));
  return { days: days, cnt: cnt, from: mn, to: mx, zero: zero, rawSum: Math.round(rawSum * 100) / 100, foot: foot };
}
// ===== 💳 Personel Satış Detay raporu: ödemeler toplamı ÷ hesap sayısı = ortalama =====
const pdIs = aoa => aoa.some(r => r.some(c => skN(c).indexOf('personel numarasi / adi') == 0));
function pdParse(aoa) {
  const num = v => { if (typeof v == 'number') return v; let t = String(v == null ? '' : v).trim(); if (!t || t == ':') return NaN; if (t.indexOf(',') > -1) t = t.replace(/\./g, '').replace(',', '.'); const x = parseFloat(t); return isNaN(x) ? NaN : x; };
  const nums = (r, k) => r.slice(k + 1).map(num).filter(x => !isNaN(x));
  let f = '', e = '';
  for (let i = 0; i < Math.min(aoa.length, 30) && !f; i++) aoa[i].forEach(c => { if (skN(c).indexOf('tarih araligi') > -1) { const m = String(c).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\D+(\d{1,2})\.(\d{1,2})\.(\d{4})/); if (m) { f = m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); e = m[6] + '-' + ('0' + m[5]).slice(-2) + '-' + ('0' + m[4]).slice(-2); } } });
  const starts = []; aoa.forEach((r, i) => { if (r.some(c => skN(c).indexOf('personel numarasi / adi') == 0)) starts.push(i); });
  const rows = {};
  starts.forEach((st, bi) => {
    const en = bi + 1 < starts.length ? starts[bi + 1] : aoa.length;
    const hc = aoa[st].find(c => skN(c).indexOf('personel numarasi / adi') == 0);
    let nm = String(hc).replace(/^[^:]*:\s*/, '').replace(/^[^\/]*\/\s*/, '').replace(/\s+/g, ' ').trim();
    if (!nm || /tan[ıi]ms[ıi]z/i.test(nm)) nm = 'İsimsiz';
    let hs = NaN, od = NaN, odCol = 1e9;
    for (let i = st; i < en; i++) {
      const r = aoa[i];
      const k1 = r.findIndex(c => skN(c).replace(/[\s:]/g, '') == 'hesapsayisi');
      if (isNaN(hs) && k1 > -1) { const v = nums(r, k1)[0]; if (v != null) hs = v; }
      const k2 = r.findIndex(c => skN(c).replace(/[\s:]/g, '') == 'odemelertoplami');
      if (k2 > -1 && k2 < odCol) { const v = nums(r, k2); if (v.length) { od = v.length > 1 ? v[1] : v[0]; odCol = k2; } }
    }
    if (isNaN(hs) || isNaN(od)) return;
    const a = rows[nm] || (rows[nm] = [0, 0]); a[0] += hs; a[1] += od;
  });
  if (!Object.keys(rows).length) throw new Error('Rapor formatı tanınmadı (Hesap Sayısı / Ödemeler Toplamı bulunamadı)');
  return { rows: rows, f: f, e: e };
}
async function goLoad(force) {
  if (!force && GO.d && GO.b == B && Date.now() - GO.at < 30000) return;
  const r = await gs('getGunOrt', B); GO.d = (r && r.days) || {}; GO.t = (r && r.t) || 0; GO.b = B; GO.at = Date.now();
  try { const a = await gs('getGoAlias', B); GO.al = (a && a.m) || {}; } catch (e) { GO.al = GO.al || {}; }
  try { GO.pd = await gs('getPersDetay', B); } catch (e) { GO.pd = GO.pd || null; }
}
const goFold = x => String(x || '').toLocaleUpperCase('tr').replace(/İ/g, 'I').replace(/Ö/g, 'O').replace(/Ü/g, 'U').replace(/Ş/g, 'S').replace(/Ç/g, 'C').replace(/Ğ/g, 'G').replace(/\s+/g, ' ').trim();
function goModel() {
  const all = Object.keys(GO.d || {}).sort();
  if (!all.length) return { all: [], ds: [], names: [], vis: [], tot: {}, head: [], hidden: 0 };
  if (!GO.f || all.indexOf(GO.f) < 0) GO.f = all[0];
  if (!GO.e || all.indexOf(GO.e) < 0) GO.e = all[all.length - 1];
  if (GO.f > GO.e) { const x = GO.f; GO.f = GO.e; GO.e = x; }
  const ds = all.filter(k => k >= GO.f && k <= GO.e), on = ds.filter(k => !GO.ex[k]), tot = {}, st = (D && D.staff) || [], disp = {};
  st.forEach(x => { disp[goFold(x.name)] = nice(x.name); });
  const alz = GO.al || {};
  ds.forEach(d => Object.keys(GO.d[d]).forEach(n => { const a = GO.d[d][n], k = alz[n] || n, t = tot[k] || (tot[k] = [0, 0]); if (!GO.ex[d]) { t[0] += a[0]; t[1] += a[1]; } }));
  const names = Object.keys(tot).sort((a, b) => tot[b][1] - tot[a][1]);
  const vis = GO.showAll ? names : names.filter(n => tot[n][0] >= 20);     // çok az kaydı olanlar (yedek/yanlış giriş) tabloyu genişletmesin
  const full = vis.map(n => disp[goFold(n)] || nice(n)), first = full.map(x => x.split(' ')[0]);
  const head = full.map((x, i) => { const p = x.split(' '); return first.filter(f => f == first[i]).length > 1 && p.length > 1 ? p[0] + ' ' + p[p.length - 1][0] + '.' : p[0]; });
  return { all, ds, on, names, vis, tot, head, full, hidden: names.length - vis.length };
}
window.GO = GO; window.goFold = goFold; window.goLoad = goLoad; window.goModel = goModel; window.renderPg = renderPg; try { window.getMe = window.getMe || getMe; } catch (e) {}
const goF0 = v => String(Math.round(v || 0));
const goBin = v => ((v || 0) / 1000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function goSeg(mt) {
  const bt = (k, t) => '<button class="' + (mt == k ? 'on' : '') + '" onclick="goMetric(\'' + k + '\')">' + t + '</button>';
  return '<div class="seg" style="margin-top:6px">' + bt('ort', '📊 Ortalama') + bt('ciro', '💰 Ciro (bin ₺)') + bt('hesap', '🧾 Hesap') + bt('pd', '💳 Ödeme ort.') + '</div>';
}
function pdRows() {
  const P = GO.pd, rows = (P && P.rows) || {}, al = GO.al || {}, disp = {}, L = {};
  ((D && D.staff) || []).forEach(x => { disp[goFold(x.name)] = nice(x.name); });
  Object.keys(rows).forEach(n => { const k = al[n] || n, a = L[k] || (L[k] = [0, 0]); a[0] += rows[n][0]; a[1] += rows[n][1]; });
  return Object.keys(L).filter(n => L[n][0] > 0).map(n => ({ n: disp[goFold(n)] || nice(n), h: L[n][0], t: L[n][1], o: L[n][1] / L[n][0] })).sort((a, b) => b.o - a.o);
}
function pdHtml() {
  const arr = pdRows(), P = GO.pd || {};
  if (!arr.length) return '<p class="sub" style="padding:10px">Henüz Personel Satış Detay raporu yüklenmemiş. Yukarıdaki yükle butonundan raporu seç; ödemeler toplamı ÷ hesap sayısı otomatik hesaplanır.</p>';
  const tl = v => Math.round(v).toLocaleString('tr-TR'), th = arr.reduce((a, r) => a + r.h, 0), tt = arr.reduce((a, r) => a + r.t, 0);
  let h = '<div class="sub" style="margin:6px 2px;font-size:11px">' + (P.f ? adFmtD(P.f) + ' – ' + adFmtD(P.e) : '') + (P.t ? ' · yüklenme ' + new Date(P.t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '') + '</div>';
  h += '<div class="gow"><table class="go"><tr><th class="gn">Garson</th><th>Hesap</th><th>Ödemeler</th><th>Ortalama</th></tr>';
  arr.forEach(r => { h += '<tr><td class="gn">' + esc(r.n) + '</td><td>' + r.h + '</td><td>' + tl(r.t) + '</td><td style="font-weight:700">' + tl(r.o) + '</td></tr>'; });
  h += '<tr class="gtot"><td class="gn">EKİP</td><td>' + th + '</td><td>' + tl(tt) + '</td><td style="font-weight:700">' + tl(tt / (th || 1)) + '</td></tr></table></div>';
  h += '<p class="sub" style="margin:6px 2px;font-size:11px">Ortalama = rapordaki Ödemeler Toplamı ÷ Hesap Sayısı.</p>';
  h += '<button class="a ed" style="width:100%;margin-top:6px" onclick="pdXls()">⬇ Excel indir</button>';
  return h;
}
window.pdXls = () => {
  const arr = pdRows(); if (!arr.length) { msg('İndirilecek kayıt yok.'); return; }
  const r2 = x => Math.round(x * 100) / 100, th = arr.reduce((a, r) => a + r.h, 0), tt = arr.reduce((a, r) => a + r.t, 0);
  const rows = [['#', 'Garson', 'Hesap', 'Ödemeler toplamı', 'Ortalama']].concat(arr.map((r, i) => [i + 1, r.n, r.h, r2(r.t), r2(r.o)]));
  rows.push(['', 'EKİP', th, r2(tt), r2(tt / (th || 1))]);
  dlX([['Ödeme Ortalaması', rows]], 'ODEME_ORTALAMASI_' + B + '_' + ((GO.pd && GO.pd.f) || '') + '_' + ((GO.pd && GO.pd.e) || ''));
};
function goHtml() {
  const adm = M == 'y';
  const up = adm ? '<button class="a" style="width:100%;margin:0 0 8px" onclick="goUp()">📤 Fiş Journal / Personel detay raporu yükle</button>' : '';
  if (GO.m == 'pd') return up + goSeg('pd') + pdHtml();
  if ((!GO.d || !Object.keys(GO.d).length) && GO.pd && Object.keys(GO.pd.rows || {}).length) return up + goSeg('ort') + pdHtml();
  if (!GO.d || !Object.keys(GO.d).length) return up + '<p class="sub" style="padding:10px">Henüz günlük ortalama raporu yüklenmemiş.' + (adm ? ' Yukarıdan <b>Fiş Journal (adisyon) raporunu</b> seç; gün gün personel ortalamaları otomatik çıkar.' : ' Yönetici raporu yükleyince burada görünür.') + '</p>';
  const m = goModel(), mt = GO.m, me = goFold(((D && D.staff) || []).filter(s => s.id == getMe()).map(s => s.name)[0] || '');
  const val = a => !a ? '' : mt == 'ort' ? goF0(a[1] / (a[0] || 1)) : mt == 'ciro' ? goBin(a[1]) : String(a[0]);
  const raw = a => !a ? -1 : mt == 'ort' ? (a[0] >= 5 ? a[1] / a[0] : -1) : mt == 'ciro' ? a[1] : a[0];
  const DN = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'], yrs = new Set(m.all.map(k => k.slice(0, 4))).size > 1;
  const lab = k => { const t = adFmtD(k); return yrs ? t : t.slice(0, 5); };
  const opts = sel => m.all.map(k => '<option value="' + k + '"' + (k == sel ? ' selected' : '') + '>' + lab(k) + '</option>').join('');
  let h = up;
  h += '<div class="gor"><span>Tarih</span><select onchange="goRange(\'f\',this.value)">' + opts(GO.f) + '</select><span>–</span><select onchange="goRange(\'e\',this.value)">' + opts(GO.e) + '</select><button onclick="goLast(7)">Son 7</button><button onclick="goLast(0)">Tümü</button></div>';
  h += goSeg(mt);
  h += '<div class="sub" style="margin:6px 2px;font-size:11px">' + adFmtD(GO.f) + ' – ' + adFmtD(GO.e) + ' · ' + m.ds.length + ' gün' + (GO.t ? ' · yüklenme ' + new Date(GO.t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '') + '</div>';
  const f2 = a => !a ? '' : val(a);
  let gh = 0, gc = 0; m.names.forEach(n => { gh += m.tot[n][0]; gc += m.tot[n][1]; });
  const dayTot = d => { let th = 0, tc = 0; Object.keys(GO.d[d]).forEach(n => { th += GO.d[d][n][0]; tc += GO.d[d][n][1]; }); return [th, tc]; };
  const mx = {}; m.ds.forEach(d => { mx[d] = Math.max.apply(null, m.vis.map(n => raw(GO.d[d][n]))); });
  h += '<div class="gow"><table class="go"><tr><th class="gn">Garson</th><th class="gp">Dönem</th>' + m.ds.map(d => { const dt = new Date(d + 'T00:00:00Z'); return '<th class="gh' + (GO.ex[d] ? ' gx' : '') + '" onclick="goDay(\'' + d + '\')"><b>' + (+d.slice(8)) + '</b><small>' + DN[dt.getUTCDay()] + '</small></th>'; }).join('') + '</tr>';
  m.vis.forEach((n, i) => {
    h += '<tr><td class="gn' + (goFold(n) == me ? ' gme' : '') + '">' + esc(m.head[i]) + '</td><td class="gp">' + f2(m.tot[n]) + '</td>' + m.ds.map(d => { const a = GO.d[d][n], top = mx[d] > 0 && raw(a) == mx[d]; return '<td class="' + (GO.ex[d] ? 'gx' : (top ? 'gtop' : '')) + '">' + f2(a) + '</td>'; }).join('') + '</tr>';
  });
  h += '<tr class="gtot"><td class="gn">EKİP</td><td class="gp">' + (mt == 'ort' ? goF0(gc / (gh || 1)) : mt == 'ciro' ? goBin(gc) : String(gh)) + '</td>' + m.ds.map(d => { const t = dayTot(d); return '<td' + (GO.ex[d] ? ' class="gx"' : '') + '>' + (mt == 'ort' ? goF0(t[1] / (t[0] || 1)) : mt == 'ciro' ? goBin(t[1]) : String(t[0])) + '</td>'; }).join('') + '</tr></table></div>';
  h += '<p class="sub" style="margin:6px 2px;font-size:11px">Ortalama = günlük ciro ÷ hesap sayısı. Sarı = o günün en yükseği' + (mt == 'ort' ? ' (en az 5 hesap)' : '') + '. Gün başlığına dokununca o gün hesaptan çıkar / geri girer (gri = hesaba katılmıyor). Tablo yana kayar, isimler sabit.' + (m.hidden ? ' <a href="#" onclick="goAll();return false" style="color:#93c5fd">' + m.hidden + ' kişi daha (az kayıtlı) göster</a>' : (GO.showAll ? ' <a href="#" onclick="goAll();return false" style="color:#93c5fd">az kayıtlıları gizle</a>' : '')) + '</p>';
  h += '<button class="a ed" style="width:100%;margin-top:6px" onclick="goXls()">⬇ Excel indir</button>';
  return h;
}
window.gunOrtUI = async () => {
  pop('📅 Günlük ortalama · ' + (BR[B] || ''), '<p class="sub">Yükleniyor…</p>', true);
  try { await goLoad(true); } catch (e) { GO.d = {}; msg(emsg(e)); }
  const mf = $('mf'); if (mf) mf.innerHTML = goHtml(); const mo = $('mo'); if (mo) mo.textContent = 'Kapat';
};
const goRender = () => { const mf = $('mf'); if (mf) mf.innerHTML = goHtml(); };
window.goMetric = k => { GO.m = k; goRender(); };
window.goRange = (w, v) => { GO[w] = v; goRender(); };
window.goLast = n => { const all = Object.keys(GO.d || {}).sort(); if (!all.length) return; GO.e = all[all.length - 1]; GO.f = n ? all[Math.max(0, all.length - n)] : all[0]; goRender(); };
window.goAll = () => { GO.showAll = !GO.showAll; goRender(); };
window.goDay = d => { if (GO.ex[d]) delete GO.ex[d]; else GO.ex[d] = 1; goRender(); };
window.goUp = back => {
  const i = document.createElement('input'); i.type = 'file'; i.accept = '.xls,.xlsx,.html,.htm';
  i.onchange = async () => {
    const f = i.files && i.files[0]; if (!f) return; msg('⏳ Rapor okunuyor…');
    try {
      if (!window.__readXls) throw new Error('Excel okuyucu hazır değil, sayfayı yenileyip tekrar dene');
      const aoa = await window.__readXls(f);
      if (pdIs(aoa)) {                                   // Personel Satış Detay raporu: Ciro & Ortalama kayıtlarına işle (Ödemeler Toplamı ÷ Hesap Sayısı)
        try { const q = pdParse(aoa); await gs('setPersDetay', B, q.rows, { f: q.f, e: q.e }, PIN); } catch (e) {}
        if (window.ciroXlsRun) await window.ciroXlsRun(f); else msg('❌ Ciro yükleyici hazır değil, sayfayı yenileyip tekrar dene');
        if (back) { PSIG = ''; try { pgSync(); } catch (e) {} } else gunOrtUI();
        return;
      }
      const p = goParse(aoa);
      const key = t => { const m = String(t || '').trim().match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/); return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : ''; };
      const miss = []; { const a = new Date(p.from + 'T00:00:00Z'), z = new Date(p.to + 'T00:00:00Z'); for (let t = a; t <= z; t = new Date(t.getTime() + 864e5)) { const k = t.toISOString().slice(0, 10); if (!p.days[k]) miss.push(k.slice(8) + '.' + k.slice(5, 7)); } }
      const chk = p.foot != null ? (Math.abs(p.foot - p.rawSum) < 1 ? '\n✓ Satır toplamı rapor toplamıyla tuttu: ' + Math.round(p.foot).toLocaleString('tr-TR') + ' TL' : '\n⚠ Rapor toplamı ' + Math.round(p.foot).toLocaleString('tr-TR') + ' TL, okunan ' + Math.round(p.rawSum).toLocaleString('tr-TR') + ' TL') : '';
      ask('📅 Hangi tarihler arası aktarılsın?\nRaporda: ' + adFmtD(p.from) + ' – ' + adFmtD(p.to) + ' (' + Object.keys(p.days).length + ' gün, ' + p.cnt + ' fiş' + (p.zero ? ', ' + p.zero + ' adet eksi tutarlı satır atlandı' : '') + ')' + chk + (miss.length ? '\nRaporda satışı olmayan gün: ' + miss.join(', ') + ' (bu günler eski kayıttan da silinir)' : ''), [{ label: 'Başlangıç (gg.aa.yyyy)', val: adFmtD(p.from) }, { label: 'Bitiş (gg.aa.yyyy)', val: adFmtD(p.to) }], async v => {
        try {
          const k1 = key(v[0]), k2 = key(v[1]); if (!k1 || !k2) throw new Error('Tarihleri gg.aa.yyyy şeklinde yaz (örn. 01.11.2026)');
          const days = {}; Object.keys(p.days).forEach(d => { if (d >= k1 && d <= k2) days[d] = p.days[d]; });
          const n = Object.keys(days).length; if (!n) throw new Error('Bu tarih aralığında gün yok');
          const rs = await gs('setGunOrt', B, days, PIN, { f: k1, t: k2 }); GO.f = GO.e = null; GO.ex = {}; await goLoad(true);
          msg('✅ ' + n + ' gün aktarıldı (' + adFmtD(k1) + ' – ' + adFmtD(k2) + ')' + (rs && rs.removed ? ' · eski kayıttan ' + rs.removed + ' gün silindi' : ''));
        } catch (e) { msg('❌ ' + emsg(e)); }
        if (back) { PSIG = ''; pgSync(); } else gunOrtUI();
      }, 'Aktar');
    } catch (e) { msg('❌ ' + emsg(e)); }
  };
  i.click();
};
window.repRange = (w, v) => { GO[w] = v; PSIG = ''; pgSync(); };
window.repLast = n => { const all = Object.keys(GO.d || {}).sort(); if (!all.length) return; GO.e = all[all.length - 1]; GO.f = n ? all[Math.max(0, all.length - n)] : all[0]; PSIG = ''; pgSync(); };
window.jrXls = () => {
  const L = (window.__jrRows || []).slice().sort((a, b) => b.ort - a.ort); if (!L.length) { msg('İndirilecek kayıt yok.'); return; }
  const r2 = x => Math.round(x * 100) / 100, tc = L.reduce((a, r) => a + r.ciro, 0), th = L.reduce((a, r) => a + r.hesap, 0);
  const rows = [['#', 'Garson', 'Ortalama', 'Ciro', 'Hesap']].concat(L.map((r, i) => [i + 1, nice(r.name), r2(r.ort), Math.round(r.ciro), r.hesap]));
  rows.push(['', 'TOPLAM', r2(th ? tc / th : 0), Math.round(tc), th]);
  dlX([['Ciro-Ortalama', rows]], 'HappyMoons_' + BR[B].replace(/\s/g, '_') + '_' + GO.f + '_' + GO.e);
};
window.goXls = () => {
  const m = goModel(); if (!m.ds.length) return;
  const disp = {}; ((D && D.staff) || []).forEach(x => { disp[goFold(x.name)] = nice(x.name); });
  const r2 = x => Math.round(x * 100) / 100;
  const mk = f => {
    const rows = [['Garson', 'Dönem'].concat(m.ds.map(d => adFmtD(d)))];
    m.names.forEach(n => rows.push([disp[goFold(n)] || nice(n), f(m.tot[n])].concat(m.ds.map(d => { const a = GO.d[d][n]; return a ? f(a) : ''; })).map(v => v === undefined ? '' : v)));
    let gh = 0, gc = 0; m.names.forEach(n => { gh += m.tot[n][0]; gc += m.tot[n][1]; });
    rows.push(['EKİP', f([gh, gc])].concat(m.ds.map(d => { let th = 0, tc = 0; Object.keys(GO.d[d]).forEach(n => { th += GO.d[d][n][0]; tc += GO.d[d][n][1]; }); return f([th, tc]); })));
    return rows;
  };
  dlX([['Ortalama', mk(a => r2(a[1] / (a[0] || 1)))], ['Ciro', mk(a => r2(a[1]))], ['Hesap', mk(a => a[0])]], 'GUNLUK_ORTALAMA_' + B + '_' + m.ds[0] + '_' + m.ds[m.ds.length - 1]);
};
(function () { const I = '!important', G = '1px solid #a6a6a6' + I, st = document.createElement('style'); st.textContent = [
'.gow{border-radius:4px;background:#fff;border:1px solid #7f7f7f;overflow:auto;max-height:70vh;-webkit-overflow-scrolling:touch}',
'table.go{border-collapse:separate' + I + ';border-spacing:0' + I + ';table-layout:auto' + I + ';width:max-content' + I + ';min-width:100%' + I + ';margin:0' + I + ';background:#fff' + I + ';font-family:Arial,Helvetica,sans-serif' + I + '}',
'table.go th,table.go td{box-sizing:border-box' + I + ';padding:7px 4px' + I + ';margin:0' + I + ';text-align:center' + I + ';vertical-align:middle' + I + ';font-size:12px' + I + ';font-weight:400' + I + ';line-height:1.2' + I + ';font-variant-numeric:tabular-nums;border:0' + I + ';border-right:' + G + ';border-bottom:' + G + ';background:#fff' + I + ';border-radius:0' + I + ';min-width:46px' + I + ';white-space:nowrap' + I + ';color:#000' + I + ';box-shadow:none' + I + '}',
'table.go th{background:#d9d9d9' + I + ';font-weight:700' + I + ';position:sticky;top:0;z-index:2}',
'table.go th.gh{cursor:pointer;line-height:1.1' + I + '}table.go th.gh small{display:block' + I + ';font-size:9px' + I + ';font-weight:400' + I + ';color:#404040' + I + ';background:none' + I + ';border:0' + I + ';padding:0' + I + ';min-width:0' + I + '}table.go th.gh b{font-size:13px' + I + ';background:none' + I + ';border:0' + I + ';padding:0' + I + ';min-width:0' + I + '}',
'table.go th.gn,table.go td.gn{position:sticky;left:0;z-index:3;min-width:74px' + I + ';width:74px' + I + ';text-align:left' + I + ';padding-left:6px' + I + ';font-weight:700' + I + ';background:#f2f2f2' + I + ';border-right:2px solid #595959' + I + '}',
'table.go th.gn{background:#d9d9d9' + I + ';z-index:4}',
'table.go th.gp,table.go td.gp{position:sticky;left:74px;z-index:3;min-width:52px' + I + ';width:52px' + I + ';font-weight:700' + I + ';background:#fce4d6' + I + ';border-right:2px solid #595959' + I + '}',
'table.go th.gp{background:#f8cbad' + I + ';z-index:4}',
'table.go td.gme{background:#ffe699' + I + '}',
'table.go td.gtop{background:#ffff00' + I + ';font-weight:700' + I + '}',
'table.go th.gx,table.go td.gx{background:#e7e6e6' + I + ';color:#9a9a9a' + I + ';text-decoration:line-through' + I + '}',
'table.go tr.gtot td{font-weight:700' + I + ';background:#d9d9d9' + I + ';border-top:2px solid #595959' + I + '}',
'table.go tr.gtot td.gp{background:#f8cbad' + I + '}table.go tr.gtot td.gx{background:#e7e6e6' + I + '}',
'.gor{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12px;color:#94a3b8}.gor select{background:#111b2e;color:#e2e8f0;border:1px solid rgba(148,163,184,.3);border-radius:8px;padding:6px 4px;font-size:12px}.gor button{margin-left:auto;background:#1e293b;color:#e2e8f0;border:1px solid rgba(148,163,184,.3);border-radius:8px;padding:6px 8px;font-size:12px;width:auto}.gor button+button{margin-left:0}'
].join(''); document.head.appendChild(st); })();
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
styAD.textContent='.admeta{font-size:12.5px;color:#94a3b8;margin:2px 2px 10px;line-height:1.5}.admeta b{color:#e2e8f0}.adsug,.adsel{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.adb{border:1px solid rgba(148,163,184,.25);background:#172033;color:#e2e8f0;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:600}.adb small{margin-left:6px;opacity:.6;font-size:11px}.adb.mix{border-color:#6366f1;color:#c7d2fe}.adx{border:0;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:700}.adctl{display:flex;flex-direction:column;gap:8px;margin:6px 0 12px}.adsum{display:flex;align-items:center;gap:6px;font-size:14px;margin:4px 2px 10px}.adsum b{font-size:20px;color:#2ee6a6}.adxl{margin-left:auto;border:1px solid rgba(148,163,184,.3);background:#0f172a;color:#e2e8f0;border-radius:10px;padding:7px 11px;font-size:12px;font-weight:700}.adc{background:#172033;border:1px solid rgba(148,163,184,.14);border-radius:18px;padding:12px;margin-bottom:10px;box-shadow:0 6px 18px rgba(0,0,0,.22)}.adh{display:flex;align-items:center;gap:10px}.adh .adm{flex:none;width:54px;height:54px;border-radius:15px;background:linear-gradient(135deg,#0ea5e9,#6366f1);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff}.adh .adm small{font-size:8.5px;opacity:.85;letter-spacing:.5px}.adh .adm b{font-size:19px;line-height:1.1}.adi{flex:1;min-width:0}.adg{font-weight:800;font-size:15px;word-break:break-word}.adt{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:12px;color:#94a3b8;margin-top:3px}.adt b{color:#e2e8f0}.adp{flex:none;text-align:right}.adp small{display:block;font-size:10.5px;color:#94a3b8}.adp b{font-size:14px}.adl{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px;padding-top:9px;border-top:1px solid rgba(148,163,184,.14)}.adl span{font-size:12px;background:#0f172a;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;border-radius:9px;padding:4px 8px}.adl span.hit{background:rgba(251,191,36,.18);border-color:#f59e0b;color:#fde68a;font-weight:800}';
document.head.appendChild(styAD);

// GM detay: bütün kriterler (karne detayındaki gibi)
const styGM2=document.createElement('style');
styGM2.textContent='.gmf{display:flex;gap:8px;align-items:center;margin:4px 0 10px;flex-wrap:wrap}.gmf .seg{margin:0;flex:1}.gmk3{background:#172033;border:1px solid rgba(148,163,184,.14);border-radius:14px;padding:10px;margin-bottom:7px}.gmk3.bad{border-color:rgba(239,68,68,.55);background:rgba(239,68,68,.08)}.gmk3 .t{font-size:13.5px;line-height:1.35;font-weight:600;word-break:break-word}.gmk3 .v{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center}.gmk3 .ans{font-size:11.5px;font-weight:800;border-radius:999px;padding:3px 10px;background:rgba(148,163,184,.2);color:#e2e8f0}.gmk3.bad .ans{background:rgba(239,68,68,.25);color:#fca5a5}.gmk3 .sc{font-size:11px;color:#94a3b8;background:#0f172a;border-radius:8px;padding:3px 7px}.gmk3 .sc b{color:#e2e8f0;font-size:12px}.gmk3 .sc.r b{color:#fb7185}.gmsec{display:flex;align-items:center;gap:8px;margin:14px 0 6px;padding:9px 10px;border-radius:12px;font-weight:800;font-size:13px;background:rgba(99,102,241,.18);color:#e0e7ff}.gmsec.l2{background:rgba(148,163,184,.14);color:#e2e8f0;font-size:12.5px;margin-top:10px}.gmsec span{margin-left:auto;font-size:11px;font-weight:700;opacity:.9;white-space:nowrap}';
document.head.appendChild(styGM2);
const styZap=document.createElement('style');
styZap.textContent='.zap{position:relative}.zap .bolt{position:absolute;pointer-events:none;z-index:6;font-size:30px;line-height:1;opacity:0;filter:drop-shadow(0 0 5px #fde047) drop-shadow(0 0 14px #facc15);animation:zapf 3.6s 1}.pd.zap .b1{left:-6px;top:4px}.pd.zap .b2{right:-4px;top:34px;font-size:24px;animation-delay:.14s}.pd.zap .b3{left:42%;top:-20px;font-size:26px;animation-delay:.28s}.tr1.zap .b1{right:8px;top:-10px;animation-delay:.1s}.tr1.zap .b2{left:34px;bottom:-10px;font-size:22px;animation-delay:.3s}@keyframes zapf{0%,80%,100%{opacity:0;transform:scale(.5) rotate(-12deg)}82%{opacity:1;transform:scale(1.3) rotate(-12deg)}84%{opacity:.1}86%{opacity:1;transform:scale(1) rotate(-12deg)}92%{opacity:0;transform:scale(1.1) rotate(-12deg)}}.pd.zap .av{animation:zapg 3.6s 1}.tr1.zap{animation:zapg 3.6s 1}@keyframes zapg{0%,80%,100%{box-shadow:0 0 0 0 rgba(253,224,71,0)}82%,86%{box-shadow:0 0 28px 8px rgba(253,224,71,.9)}84%{box-shadow:0 0 0 0 rgba(253,224,71,0)}}html:not(.zap1) .zap .bolt,html:not(.zap1) .pd.zap .av,html:not(.zap1) .tr1.zap{animation:none!important}@media (prefers-reduced-motion:reduce){.zap .bolt,.pd.zap .av,.tr1.zap{animation:none}}.gmsec{flex-wrap:wrap}';
document.documentElement.classList.add('zap1');setTimeout(function(){document.documentElement.classList.remove('zap1');},9000);
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

window.__rezPerm={set:false,ids:[]};
window.rezOK=()=>{try{if(M=='y')return true;if(M!='g')return false;const me=((D&&D.staff)||[]).find(x=>x.id==getMe());if(!me)return false;const P=window.__rezPerm||{};if(P.set)return (P.ids||[]).indexOf(me.id)>-1;return /HOSTES/.test(String(me.sec||'').toLocaleUpperCase('tr').replace(/İ/g,'I'));}catch(e){return false;}};   // yönetici seçtiyse sadece seçilenler, seçmediyse Hostes
(function(){let lastB=null;
  window.rezPermLoad=force=>{const k='rezperm_'+B;let c=null;try{c=JSON.parse(localStorage.getItem(k)||'null');}catch(e){}
    if(!force&&c&&Date.now()-c.t<20*60000){window.__rezPerm=c.p||{set:false,ids:[]};return Promise.resolve();}      // kota: 20 dk önbellek
    return gs('getRezPerm',B).then(pp=>{window.__rezPerm=pp||{set:false,ids:[]};try{localStorage.setItem(k,JSON.stringify({t:Date.now(),p:window.__rezPerm}));}catch(e){}}).catch(()=>{});};
  setInterval(()=>{try{if(typeof B!='undefined'&&B!==lastB){lastB=B;window.__rezPerm={set:false,ids:[]};window.rezPermLoad();}}catch(e){}},1000);   // yalnızca şube değişince (yerel kontrol)
})();
window.adWho=()=>{try{if(!repVis())return false;if(M=='y')return true;const me=((D&&D.staff)||[]).find(x=>x.id==getMe());if(!me)return false;const sec=String(me.sec||'').toLocaleUpperCase('tr').replace(/İ/g,'I');return !(/HOSTES|RUNNER|BAR/.test(sec)||barIsBar(me));}catch(e){return false;}};
const d2=window.draw;window.draw=function(){d2();nvDraw();barWatch();radioAdmin();pgSync();};
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
  h+='<div id="stfl" style="display:none">';
  G.forEach(g=>{h+='<div class="sec2">'+esc(g.k)+' <span>'+g.l.length+'</span></div><div class="rows">'+g.l.map(rowH).join('')+'</div>';});
  h+='</div>';
  if(!G.length)h+='<p class="sub">Şubede personel yok. ➕ Personel ekle ile başla.</p>';
  $('list').innerHTML=h;
  document.querySelectorAll('#list .card[data-id]').forEach(c=>c.insertAdjacentHTML('beforeend','<div class="btns" style="flex-direction:row"><button class="a an" style="flex:2" onclick="msgStaff(\''+c.dataset.id+'\')">🔔 Mesaj</button><button class="a x" style="flex:1" onclick="sheet(\''+c.dataset.id+'\')">⋯</button></div>'));
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
window.setTgt=async(kind)=>{kind=typeof kind=='string'?kind:'bira';const cur=await tgtK(kind),nm={bira:'Bira',cay:'Çay',baslangic:'Başlangıç',tatli:'Tatlı'}[kind];ask('🎯 '+nm+' hedef kotası · '+BR[B]+(kind=='bira'?'\nKotanın üstündeki her bira için 12 TL prim':(kind=='cay'?'\nKotanın üstündeki her çay için 3 TL prim\n0 yazarsan kota kapanır':'\n0 yazarsan hedef kapanır')),[{label:'Hedef (miktar)',type:'number',val:String(cur)}],async v=>{try{await gs('setTarget',B,kind,num(v[0]),PIN);window.__T=0;PSIG='';pgSync();}catch(e){msg(emsg(e));}},'Kaydet');};
window.movPer=k=>{const g=selG(k);if(!g)return;ask('“'+g.k+'” dönemindeki '+g.rows.length+' kayıt hangi döneme taşınsın?\nBaşka bir dönemin adını yazarsan ikisi birleşir.',[{label:'Yeni dönem',val:g.k}],async v=>{try{const n=await gs('movePeriod',k,B,g.k,v[0].trim(),PIN);PSEL[k]=nR(v[0]);msg(n+' kayıt taşındı ✅');rptLoad();}catch(e){msg(emsg(e));}},'Taşı');};
function podium(it,bolt){
  const o=it.length>=3?[1,0,2]:it.length==2?[1,0]:[0],h=[112,86,68],mk=['🥇','🥈','🥉'];
  return '<div class="pod">'+o.map(i=>{const x=it[i];return `<div class="pd g${i+1}${i==0&&bolt?' zap':''}"><div class="pm">${i==0?'🏆':''}</div>${i==0&&bolt?'<span class="bolt b1">⚡</span><span class="bolt b2">⚡</span><span class="bolt b3">⚡</span>':''}<b class="av big" data-nm="${esc(x.name)}">${esc(ini(x.name))}</b><div class="pn">${esc(nice(x.name).split(' ')[0])}</div><div class="pv">${x.val}</div><div class="ps">${x.sub||''}</div><div class="pb" style="height:${h[i]}px">${mk[i]}</div></div>`;}).join('')+'</div>';
}
function lbRow(rk,r,main,sub,pct,cls,trend,key,adm,kd){
  return `<div class="lr ${trend&&trend.indexOf('d">')>0?'dn':''}"><span class="rk">${rk}</span><b class="av" data-nm="${esc(r.name)}">${esc(ini(r.name))}</b><div class="lm"><div class="ln">${esc(nice(r.name))}${trend||''}</div><div class="ls">${sub}</div><div class="bar"><i class="${cls}" style="width:${Math.max(5,Math.min(100,pct))}%"></i></div></div><div class="lv">${main}</div>${adm?`<div class="rb"><button class="x2" data-k="${esc(key)}" onclick="${kd=='b'?'editBeer':(kd=='k'?'editCat':'editRep')}(this.dataset.k)">✏️</button><button class="x2" data-k="${esc(key)}" onclick="${kd=='b'?'beerDel':(kd=='k'?'catDel':'rptDel')}(this.dataset.k)">✕</button></div>`:''}</div>`;
}
function lbCiro(L,adm,sub){
  const ci=sub=='ciro',val=r=>Number(ci?r.ciro:r.ort);
  const ZA=L.filter(r=>isZeroAcc(r.name)),xh=ZA.reduce((a,r)=>a+Number(r.hesap||0),0);   // listede görünmez, sadece takım toplam hesabına eklenir
  L=L.filter(r=>!isZeroAcc(r.name)).sort((a,b)=>val(b)-val(a));
  const tc=L.reduce((a,r)=>a+Number(r.ciro||0),0),th=L.reduce((a,r)=>a+Number(r.hesap||0),0)+xh,avg=th?tc/th:0,me=nrm(((D&&D.staff)||[]).filter(s=>s.id==getMe()).map(s=>s.name)[0]||'');
  let h='<div class="kp"><div><b>'+tl2(avg)+'</b><span>Takım ortalaması (TL)</span></div><div><b>'+fmt(Math.round(tc))+'</b><span>Toplam ciro (TL)</span></div><div><b>'+L.length+'</b><span>Garson</span></div></div>';
  h+='<div class="ctw"><table class="ct"><tr><th>#</th><th class="l">Garson</th><th class="'+(ci?'':'on')+'" onclick="setSub(\'ort\')">Ortalama'+(ci?'':' ▾')+'</th><th class="'+(ci?'on':'')+'" onclick="setSub(\'ciro\')">Ciro'+(ci?' ▾':'')+'</th><th>Hesap</th>'+(adm?'<th></th>':'')+'</tr>';
  h+=L.map((r,i)=>'<tr'+(nrm(r.name)==me?' class="me"':'')+'><td>'+(i+1)+'</td><td class="l"'+(M=='y'&&!adm?' data-gn="'+esc(r.name)+'"':'')+'>'+esc(nice(r.name))+(M=='y'&&!adm?' <small class="gne">✏️</small>':'')+'</td><td class="'+(ci?'':'on')+'">'+tl2(r.ort)+'</td><td class="'+(ci?'on':'')+'">'+fmt(Math.round(r.ciro))+'</td><td>'+fmt(r.hesap)+'</td>'+(adm?'<td class="ac"><button class="x2" data-k="'+esc(r.key)+'" onclick="editRep(this.dataset.k)">✏️</button><button class="x2" data-k="'+esc(r.key)+'" onclick="rptDel(this.dataset.k)">✕</button></td>':'')+'</tr>').join('');
  h+='<tr class="tot"><td></td><td class="l">TOPLAM</td><td>'+tl2(avg)+'</td><td>'+fmt(Math.round(tc))+'</td><td>'+fmt(th)+'</td>'+(adm?'<td></td>':'')+'</tr></table></div>'+(xh?'<div class="perl" style="margin:4px 2px;font-size:11px">Toplam hesaba 0 cirolu '+fmt(xh)+' hesap dahil (Ahmet Çancı, Kadir Kara, Mahmut Yıldan)</div>':'');
  return h;
}
(function(){const st=document.createElement('style');st.textContent='.ctw{overflow-x:auto;border-radius:12px;background:rgba(15,23,42,.55);border:1px solid rgba(148,163,184,.18)}table.ct{width:100%;border-collapse:collapse;font-size:13px;color:#e2e8f0}table.ct th,table.ct td{padding:9px 6px;text-align:right;border-bottom:1px solid rgba(148,163,184,.12);white-space:nowrap}table.ct th{font-size:11px;color:#94a3b8;font-weight:700}table.ct th.l,table.ct td.l{text-align:left}table.ct td.l{font-weight:700;white-space:normal}table.ct th:first-child,table.ct td:first-child{text-align:center;color:#94a3b8;width:24px}table.ct .on{color:#fbbf24;font-weight:800}.seg button{font-size:12px;padding-left:4px;padding-right:4px}table.ct th[onclick]{cursor:pointer}table.ct tr.me td{background:rgba(251,191,36,.08)}table.ct tr.tot td{font-weight:800;border-bottom:0;background:rgba(148,163,184,.08)}table.ct td.ac{white-space:nowrap}table.ct td.ac .x2{margin-left:2px}';document.head.appendChild(st);})();
function biraKota(r,T,adm,all){
  let cols,rows;try{cols=r.cols||[];rows=JSON.parse(r.rj||'[]').filter(x=>String(x[0]).toUpperCase()!='TOPLAM');}catch(e){return '';}
  const ci=cols.indexOf('Bira');if(ci<1)return '';
  const me=nrm(((D&&D.staff)||[]).filter(s=>s.id==getMe()).map(s=>s.name)[0]||''),BT=12,tlf=x=>(Math.round(x*100)/100).toLocaleString('tr-TR');
  const L=rows.map(x=>({name:String(x[0]),q:Number(x[ci])||0})).sort((a,b)=>b.q-a.q),tq=L.reduce((a,x)=>a+x.q,0);
  const pr=q=>T>0&&q>T?q*BT:0,tp=L.reduce((a,x)=>a+pr(x.q),0);
  const rem=q=>T>0?(q>=T?'<span style="color:#6ee7b7;font-weight:800">✓ doldu'+(q>T?' (+'+fmt(q-T)+')':'')+'</span>':'<b>'+fmt(T-q)+'</b>'):'—';
  let h='<div class="simgh" style="padding:2px 2px 8px"><b>🍺 Bira kotası</b><span>'+esc(r.title)+' · '+new Date(r.t).toLocaleDateString('tr-TR')+'</span></div>';
  if(adm&&all&&all.length>1)h+='<div class="pers">'+all.map(x=>`<button class="${x.id==r.id?'on':''}" data-i="${esc(x.id)}" onclick="repOpen(this.dataset.i)">${esc(x.title)}</button>`).join('')+'</div>';
  h+='<div class="kp"><div><b>'+(T>0?fmt(T):'—')+'</b><span>Kota (kişi başı)</span></div><div><b>'+fmt(tq)+'</b><span>Toplam satış</span></div><div><b>'+tlf(tp)+'</b><span>Toplam prim (TL)</span></div></div>';
  h+=T>0?'<div class="hot">💰 Kotayı geçen, sattığı <b>tüm</b> bira için adet başı <b>'+BT+' TL</b> prim alır</div>':'<div class="hot">🎯 Kota henüz yazılmamış.'+(adm?' Üstteki <b>Kota</b> butonuna dokunup yaz.':'')+'</div>';
  h+='<div class="ctw"><table class="ct"><tr><th>#</th><th class="l">Garson</th><th>Satış</th><th>Kota</th><th>Kalan</th><th>Prim</th></tr>'+L.map((x,i)=>'<tr'+(nrm(x.name)==me?' class="me"':'')+'><td>'+(i+1)+'</td><td class="l">'+esc(nice(x.name))+'</td><td class="on">'+fmt(x.q)+'</td><td>'+(T>0?fmt(T):'—')+'</td><td>'+rem(x.q)+'</td><td>'+(pr(x.q)>0?'<b style="color:#6ee7b7">'+tlf(pr(x.q))+' TL</b>':'—')+'</td></tr>').join('')+'</table></div>';
  return h;
}
function cayKota(r,T,adm,all){
  let cols,rows;try{cols=r.cols||[];rows=JSON.parse(r.rj||'[]').filter(x=>String(x[0]).toUpperCase()!='TOPLAM');}catch(e){return '';}
  const ci=cols.indexOf('Çay');if(ci<1)return '';
  const me=nrm(((D&&D.staff)||[]).filter(s=>s.id==getMe()).map(s=>s.name)[0]||''),CT=3,tlf=x=>(Math.round(x*100)/100).toLocaleString('tr-TR');
  const L=rows.map(x=>({name:String(x[0]),q:Number(x[ci])||0})).sort((a,b)=>b.q-a.q),tq=L.reduce((a,x)=>a+x.q,0);
  const pr=q=>T>0&&q>T?q*CT:0,tp=L.reduce((a,x)=>a+pr(x.q),0);
  const rem=q=>T>0?(q>=T?'<span style="color:#6ee7b7;font-weight:800">✓ kota doldu'+(q>T?' (+'+fmt(q-T)+')':'')+'</span>':'<b>'+fmt(T-q)+'</b>'):'—';
  let h='<div class="simgh" style="padding:2px 2px 8px"><b>🫖 Çay kotası</b><span>'+esc(r.title)+' · '+new Date(r.t).toLocaleDateString('tr-TR')+'</span></div>';
  if(adm&&all&&all.length>1)h+='<div class="pers">'+all.map(x=>`<button class="${x.id==r.id?'on':''}" data-i="${esc(x.id)}" onclick="repOpen(this.dataset.i)">${esc(x.title)}</button>`).join('')+'</div>';
  h+='<div class="kp"><div><b>'+(T>0?fmt(T):'—')+'</b><span>Kota (kişi başı)</span></div><div><b>'+fmt(tq)+'</b><span>Toplam satış</span></div><div><b>'+tlf(tp)+'</b><span>Toplam prim (TL)</span></div></div>';
  h+=T>0?'<div class="hot">💰 Kotayı geçen, sattığı <b>tüm</b> çay için adet başı <b>'+CT+' TL</b> prim alır</div>':'<div class="hot">🎯 Kota henüz yazılmamış.'+(adm?' Üstteki <b>Kota</b> butonuna dokunup yaz.':'')+'</div>';
  h+='<div class="ctw"><table class="ct"><tr><th>#</th><th class="l">Garson</th><th>Satış</th><th>Kota</th><th>Kalan</th><th>Prim</th></tr>'+L.map((x,i)=>'<tr'+(nrm(x.name)==me?' class="me"':'')+'><td>'+(i+1)+'</td><td class="l">'+esc(nice(x.name))+'</td><td class="on">'+fmt(x.q)+'</td><td>'+(T>0?fmt(T):'—')+'</td><td>'+rem(x.q)+'</td><td>'+(pr(x.q)>0?'<b style="color:#6ee7b7">'+tlf(pr(x.q))+' TL</b>':'—')+'</td></tr>').join('')+'</table></div>';
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
function admBar(){return '<div class="admbar"><button class="a an" onclick="radioUI()"><i>📻</i>Telsiz</button><button class="a off" onclick="msgPick()"><i>🔔</i>Mesaj</button><button class="a ed" onclick="postaUI()"><i>📋</i>Postalar</button><button class="a x" onclick="admMenu()"><i>☰</i>Menü</button></div>';}
window.admMenu=()=>{
  const it=(i,t,s,f)=>'<button class="mi" onclick="$(\'ov\').hidden=true;'+f+'"><i>'+i+'</i><span>'+t+(s?'<small>'+s+'</small>':'')+'</span></button>';
  pop('☰ Yönetim menüsü',
    (hasPerm('rapor')?'<div class="mgrp">RAPORLAR</div>'+it('💰','Ciro Excel yükle','Satış ve ortalama','ciroXlsPick()')+it('🍺','Ürün Excel yükle','Bira ve primli ürünler','aiUI()')+it('💳','Günsonu Kasa Raporu','Garson + POS + Yemek + formüller','zPosUI()'):'')
    +(hasPerm('personel')?'<div class="mgrp">PERSONEL</div>'+it('➕','Personel ekle','','add()')+it('↻','Günü sıfırla','Tüm molaları sıfırlar','reset()'):'')
    +'<div class="mgrp">DİĞER</div>'+(hasPerm('e86')?it('🚫','86','','e86UI()'):'')+((hasPerm('rez')&&window.rezOK&&rezOK())?it('📅','Rezerve','','rezUI()'):'')+(hasPerm('tip')?it('💰','Tip Box','','tipUI()'):'')+(hasPerm('video')?'<div class="mgrp">VİDEO</div>'+it('🎬','Eğitim videoları','Instagram Reels / YouTube link ekle · video yükle · reklam',"goPg('video')"):'')+'<div class="mgrp">SES VE ANONS</div>'+it('🔊','Anons testi','','testAnons()')+it('🎙','İsim kayıtları','','vList()')
    +'<div class="mgrp">SİSTEM</div>'+(window.__ADM&&window.__ADM.role=='owner'?it('👥','Yöneticiler','Ekle, çıkar, şifre','admUsers()'):'')+it('🔁','Başka girişle gir','Kaydedilmiş şifreyi unutur, tekrar sorar','admSwitch()')+it('📝','Menü sınavı','Sınav sonuçları · cevap anahtarı','examUI()')+it('🎮','Oyunlar','Yemek oyunu · Bilgi oyunu','oyunlarUI()')+it('🦺','İSG','Rönesans İSG tesis girişi','isgAc()')+it('⭐','Yorum QR','Google yorum QR kodu · NFC · paylaş','qrUI()')+it('🔑','Şifremi değiştir','Yönetici giriş şifresi','admPass()')+it('⚙','Ayarlar','','admSet()'));
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

// ===== 💳 GÜNSONU KASA RAPORU (Excel birebir) =====
const ZPOS_MAIN = [
  { id: '52870738', a: '-52870738', c: '52870738' },
  { id: '57307617', a: '-57307617', c: '57307617' },
  { id: '2D10043049', a: '2D10043049', c: '2D10043049' },
  { id: '2D10008634', a: 'QE10-8634', c: '2D10008634' },
  { id: '2D10008641', a: 'QE09-8641', c: '2D10008641' },
  { id: 'SABİT', a: '', c: 'SABİT-29724243' }
];
const ZPOS_EXTRA = [
  '1427-52870738', '1128-57307617', '0988-10043049',
  '2D10008634', '2D10008641',
  'PS9481-57307617', 'PS0275-10043049', 'PS4861-2D10008634', 'PS4860-2D10008641'
];
const ZPOS_FARK_MAP = {
  '52870738': ['1427-52870738'],
  '57307617': ['1128-57307617', 'PS9481-57307617'],
  '2D10043049': ['0988-10043049', 'PS0275-10043049'],
  '2D10008634': ['2D10008634', 'PS4861-2D10008634'],
  '2D10008641': ['2D10008641', 'PS4860-2D10008641'],
  'SABİT': []
};
const ZPOS_YEMEK = ['TİCKET', 'SODEXHO', 'MULTİNET', 'METROPOL', 'SETCARD', 'TOKEN FLEX'];
const ZPOS_YEMEK_KEY = { 'TİCKET': 'ticket', 'SODEXHO': 'sodexho', 'MULTİNET': 'multinet', 'METROPOL': 'metropol', 'SETCARD': 'setcard', 'TOKEN FLEX': 'token' };
const ZPOS_GARSON_DEFAULT = [
  'AHMET POLAT', 'ALİ YILDAN', 'BETÜL DUMAN', 'ENES BERK', 'FURKAN ÖZCAN',
  'GÜLKAN KORKUSUZ', 'ÖMER KARA', 'TEOMAN NEZİR', 'AHMET ÇANCI', 'Aleyna Pilgir', 'ŞİYAR ERTAŞ'
];
const ZPOS_CFG = {
  opt: {
    main: ZPOS_MAIN.map(x => Object.assign({}, x)),
    fark: JSON.parse(JSON.stringify(ZPOS_FARK_MAP)),
    garson: ZPOS_GARSON_DEFAULT.slice()
  },
  mavi: {
    main: [
      { id: 'S140YG02', a: 'S140YG02', c: '51548495' },
      { id: 'S0WF3F01', a: 'S0WF3F01', c: '24815472' },
      { id: 'S0WF3F04', a: 'S0WF3F04', c: '25048965' },
      { id: 'S0WF3F02', a: 'S0WF3F02', c: '24826924' },
      { id: 'S140YG03', a: 'S140YG03', c: '2D10042009' },
      { id: 'SABİT', a: '', c: 'SABİT-24817529' }
    ],
    fark: {
      'S140YG02': ['1427-52870738'],
      'S0WF3F01': ['1128-57307617', 'PS9481-57307617'],
      'S0WF3F04': ['0988-10043049', 'PS0275-10043049'],
      'S0WF3F02': ['2D10008634', 'PS4861-2D10008634'],
      'S140YG03': ['2D10008641', 'PS4860-2D10008641'],
      'SABİT': []
    },
    garson: ['SERHAT SOYLU', 'BERKAN YILDIRIM', 'SARP CALAY', 'MEHMET EFE ÖZDAL', 'CAFER KELTEN', 'MERT ALTUNTAŞ', 'EFE ALİ ERSOY', 'YASİN ÖRBEYİ', 'Solmaz Asadova', 'Melih Tuturmaz', 'ESAT ÖZGÜR', 'Evrim Yaşar', 'SARP ATALAY']
  }
};
let ZPOS_BR = 'opt';
function zApplyBranch() {       // POS numaraları ve garson listesi şubeye göre değişir (diziler yerinde güncellenir)
  const b = (typeof B !== 'undefined' && ZPOS_CFG[B]) ? B : 'opt';
  if (ZPOS_BR === b) return; ZPOS_BR = b; const c = ZPOS_CFG[b];
  ZPOS_MAIN.splice(0, ZPOS_MAIN.length, ...c.main.map(x => Object.assign({}, x)));
  Object.keys(ZPOS_FARK_MAP).forEach(k => delete ZPOS_FARK_MAP[k]); Object.assign(ZPOS_FARK_MAP, JSON.parse(JSON.stringify(c.fark)));
  ZPOS_GARSON_DEFAULT.splice(0, ZPOS_GARSON_DEFAULT.length, ...c.garson);
}
const zNormN = s => String(s || '').toLocaleUpperCase('tr').replace(/İ/g, 'I').replace(/\s+/g, ' ').trim();
function zSyncGarson() {      // Mavibahçe: garson listesi vardiyadaki SERVİS personelinden gelir (tam adlarıyla)
  zApplyBranch();
  if (typeof B === 'undefined') return;
  const stAll = ((typeof D !== 'undefined' && D && D.staff) || []).filter(x => !x.off);
  if (B !== 'mavi') {   // Optimum: sabit liste + bugün vardiyası olan servis personeli (listede yoksa eklenir)
    try {
      stAll.filter(x => x.shTxt && (!x.sec || /^SERV/.test(zNormN(x.sec)))).forEach(x => {
        const n = zNormN(nice_(x.name)); if (n && !ZPOS_GARSON_DEFAULT.some(g => zNormN(g) === n || zResolveG(g) === n)) ZPOS_GARSON_DEFAULT.push(n);
      });
    } catch (e) {}
    return;
  }
  try {
    let st = stAll;
    // vardiyadan çıkarılmış ama bugün çalışan (vardiyası olan) kişi de listede kalır
    if (st.some(x => x.sec)) st = st.filter(x => /^SERV/.test(zNormN(x.sec)) || (!x.sec && x.shTxt));
    if (!st.length) return;
    st = st.slice().sort((a, b) => ((a.ord || 1e9) - (b.ord || 1e9)) || String(a.name).localeCompare(String(b.name), 'tr'));
    const names = [], seen = {};
    st.forEach(x => { const n = zNormN(nice_(x.name)), k = zNormN(n); if (k && !seen[k]) { seen[k] = 1; names.push(n); } });
    if (names.length) ZPOS_GARSON_DEFAULT.splice(0, ZPOS_GARSON_DEFAULT.length, ...names);
  } catch (e) {}
}
function zResolveG(name) {    // eski kısa isim ("SERHAT SOYLU") → listedeki tam ad ("ONUR SERHAT SOYLU")
  const k = zNormN(name); if (!k || (typeof B === 'undefined') || B !== 'mavi') return k;
  const L = ZPOS_GARSON_DEFAULT.map(zNormN); if (L.indexOf(k) >= 0) return k;
  const tk = k.split(' '); if (tk.length < 2) return k;
  const c = L.filter(x => { const t = x.split(' '); return tk.every(w => t.indexOf(w) >= 0) || (t.length >= 2 && t.every(w => tk.indexOf(w) >= 0)); });
  return c.length === 1 ? c[0] : k;
}
const zGHas = g => !!g && (['ticket', 'sodexho', 'multinet', 'metropol', 'setcard', 'token', 'kk', 'nakit', 'hediye', 'ciro', 'check'].some(c => Number(g[c])));
const ZG_COLS = ['ticket', 'sodexho', 'multinet', 'metropol', 'setcard', 'token', 'kk', 'nakit', 'hediye'];
let ZPOS = { ym: '', day: 1, days: {}, dirty: false, ver: 0, tab: 'g', _t: 0 };
const zYmNow = () => {
  try { const o = tp_(); return o.year + o.month; }
  catch (e) { const d = new Date(); return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2); }
};
const zDayNow = () => { try { return +tp_().day || 1; } catch (e) { return new Date().getDate(); } };
const zNum = v => { let s = String(v == null ? '' : v).trim().replace(/\s/g, ''); if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.'); const n = Number(s); return isFinite(n) ? n : 0; };
const zPosVal = id => { const el = document.getElementById(id); if (!el) return 0; return zNum(el.value !== undefined ? el.value : el.textContent); };
const zPosFmt = n => { n = Math.round((Number(n) || 0) * 100) / 100; if (!n) n = 0; return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
function zPosInp(id, v, bg) {
  const b = bg || '#fef08a';
  return '<input id="' + id + '" type="text" inputmode="decimal" autocomplete="off" value="' + (Number(v) ? v : '') + '" style="width:100%;min-width:0;box-sizing:border-box;background:' + b + ';color:#111;border:1px solid #cbd5e1;border-radius:6px;padding:7px 4px;font-size:14px;text-align:right;margin:0" oninput="zPosCalc();zPosAuto()">';
}
// ===== 🚫 86 listesi (biten ürünler) =====
let E86 = { list: [], t: 0, b: '' };
const e86eh = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const e86Load = async force => {
  if (!force && E86.b == B && Date.now() - E86.t < 120000) return;
  try { E86.list = (await gs('get86', B)) || []; } catch (e) {}
  E86.t = Date.now(); E86.b = B;
};
const e86Who = () => { const s = ((D && D.staff) || []).find(x => x.id == getMe()); return s ? nice(s.name) : (M == 'y' ? 'Yönetici' : ''); };
window.hmBoxes = () => {      // ana ekrandaki Şube seçici ve Personel/Yönetici seçici kutularını bul
  const o = { br: null, mode: null };
  document.querySelectorAll('body *').forEach(el => {
    if (el.childElementCount || el.closest('#ov,#pg,#nv,#list,#tools,#e86c')) return;
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!o.mode && /^(\S{1,4} )?Personel$/.test(t) && el.parentElement) o.mode = el.parentElement;
    if (!o.br && /^Mavi Bah[çc]e$/.test(t) && el.parentElement) o.br = el.parentElement;
  });
  return o;
};
window.e86Fill = () => {
  const paint = () => {
    let e = document.getElementById('e86c');
    const bx = window.hmBoxes(), hi = document.querySelector('#list .hi');
    if (M != 'g' || !hi || !bx.mode) { if (e) e.remove(); return; }
    if (!e) { e = document.createElement('div'); e.id = 'e86c'; }
    if (bx.mode.nextElementSibling !== e) bx.mode.insertAdjacentElement('afterend', e);
    const L = E86.b == B ? E86.list : [];
    e.innerHTML = '<div onclick="e86UI()" style="margin:0 0 12px;padding:10px 12px;border-radius:14px;background:rgba(220,38,38,.14);border:1px solid rgba(248,113,113,.45);color:#fecaca">'
      + '<div style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px"><span style="flex:1">🚫 86 · Biten ürünler' + (L.length ? ' (' + L.length + ')' : '') + '</span><span style="background:#dc2626;color:#fff;border-radius:999px;padding:4px 10px;font-size:12px">＋ Ekle</span></div>'
      + (L.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">' + L.map(x => '<span style="background:rgba(0,0,0,.35);border-radius:999px;padding:4px 10px;font-size:12.5px;font-weight:700;color:#fff">' + e86eh(x.n) + '</span>').join('') + '</div>'
        : '<div style="font-size:12px;margin-top:4px;opacity:.8">Şu an biten ürün yok. Biten bir şey olursa dokunup ekle.</div>')
      + '</div>';
  };
  paint(); e86Load().then(paint);
};
// Personel ekranında şube seçici gizli (yönetici görür); mod değişince 86 kutusu da kalksın
setInterval(() => {
  try {
    const bx = window.hmBoxes();
    if (bx.br) bx.br.style.display = (M == 'g') ? 'none' : '';
    if (M != 'g' || !document.querySelector('#list .hi')) { const e = document.getElementById('e86c'); if (e) e.remove(); }
  } catch (x) {}
}, 500);
function e86Render() {
  const mf = document.getElementById('mf'); if (!mf || $('ov').hidden || $('mt').textContent.indexOf('86') < 0) return;
  const ago = t => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 60 ? m + ' dk önce' : Math.round(m / 60) + ' sa önce'; };
  const L = E86.list.slice().sort((a, b) => b.t - a.t);
  mf.innerHTML = '<div style="background:#f8fafc;color:#111;border-radius:14px;padding:10px;max-width:100%;box-sizing:border-box">'
    + '<div style="display:flex;gap:6px;margin-bottom:10px"><input id="e86_in" type="text" maxlength="60" placeholder="Biten ürün (örn. Efes Draft)" autocomplete="off" style="flex:1;min-width:0;box-sizing:border-box;background:#fff;color:#111;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font-size:15px;margin:0" onkeydown="if(event.key===\'Enter\')e86Add()">'
    + '<button class="a" style="background:linear-gradient(135deg,#dc2626,#b91c1c);padding:0 14px;border-radius:8px;font-weight:800" onclick="e86Add()">＋ Ekle</button></div>'
    + (L.length ? L.map(x => '<div style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px;margin-bottom:6px"><div style="flex:1;min-width:0"><div style="font-weight:800;font-size:14px;overflow:hidden;text-overflow:ellipsis">🚫 ' + e86eh(x.n) + '</div><div style="font-size:11px;color:#64748b">' + e86eh(x.by || '') + (x.by ? ' · ' : '') + ago(x.t) + '</div></div>'
      + '<button class="a" style="background:linear-gradient(135deg,#16a34a,#15803d);padding:8px 10px;border-radius:8px;font-size:12px;font-weight:800;white-space:nowrap" onclick="e86Del(\'' + x.id + '\')">✓ Geldi</button></div>').join('')
      : '<p class="sub" style="color:#64748b">Biten ürün yok.</p>')
    + '<p class="sub" style="font-size:11px;color:#64748b;margin-top:6px">Herkes ekleyebilir. Ürün tekrar gelince "✓ Geldi" ile listeden kaldır.</p></div>';
}
window.e86UI = async () => {
  pop('🚫 86 · Biten ürünler · ' + BR[B], '<p class="sub">Yükleniyor…</p>', true);
  await e86Load(true); e86Render();
};
window.e86Add = async () => {
  const el = document.getElementById('e86_in'); const n = el ? el.value.trim() : '';
  if (!n) { msg('Ürün adı yaz'); return; }
  try { await gs('add86', B, n, e86Who()); await e86Load(true); e86Render(); window.e86Fill && e86Fill(); }
  catch (e) { msg(emsg(e)); }
};
window.e86Del = async id => {
  try { await gs('del86', B, id); await e86Load(true); e86Render(); window.e86Fill && e86Fill(); }
  catch (e) { msg(emsg(e)); }
};
window.myKasaUI = async () => {
  const meId = getMe();
  const st = ((D && D.staff) || []).find(s => s.id == meId);
  if (!st) { msg('Önce kendini seç'); return; }
  if (M != 'y' && !(typeof kasaVis == 'function' && kasaVis())) { msg('Kasaföy sadece servis personeline açık.'); return; }
const name = nice(st.name);
  try { const ko = await gs('getKasaOpen', B); if (!(ko && ko.open)) { window.__kasaOpen = false; msg('Kasaföy henüz açılmadı. Yönetici açınca burada görünür.'); return; } window.__kasaOpen = true; } catch (e) {}
  let ym = zYmNow(), day = zDayNow();
  try { const kd = await gs('getKasaDay', B); if (kd && kd.ym) { ym = kd.ym; day = +kd.day; } } catch (e) {}
  pop('📋 Kasaföy · ' + name, '<p class="sub">Yükleniyor…</p>', true);
  let row = {}, closed = false;
  try {
    const r = await gs('getMyKasa', B, ym, day, name);
    if (r && r.row !== undefined) { row = r.row || {}; closed = !!r.closed; }
    else if (r) row = r;
  } catch(e) {}
  if (closed) {
    $('mf').innerHTML = '<div style="padding:20px;text-align:center;color:#0f172a">'
      + '<div style="font-size:42px;margin-bottom:8px">🔒</div>'
      + '<div style="font-size:16px;font-weight:800">Günsonu alındı</div>'
      + '<p style="color:#64748b;margin-top:8px;font-size:13px">'+day+'/'+ym.slice(4)+'/'+ym.slice(0,4)+' kapatıldı.<br>Yeni giriş yapılamaz. Yarın tekrar dene.</p></div>';
    return;
  }
  const fields = [
    ['ticket','TİCKET'],['sodexho','SODEXHO'],['multinet','MULTİNET'],
    ['metropol','METROPOL'],['setcard','SETCARD'],['token','TOKEN'],
    ['kk','K.K'],['nakit','NAKİT'],['hediye','HEDİYE'],
    ['ciro','CİRO *'],['check','ÇEK *']
  ];
  const inp = (id,v) => '<input id="'+id+'" type="text" inputmode="decimal" autocomplete="off" value="'+(Number(v)?v:'')+'" style="width:100%;box-sizing:border-box;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:6px;padding:6px 4px;font-size:13px;font-weight:600;text-align:right" oninput="myKasaLive();myKasaAuto()">';
  let h = '<div style="background:linear-gradient(180deg,#f1f5f9,#fff);color:#0f172a;border-radius:12px;padding:10px 8px;max-width:100%">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding:0 2px">'
    + '<span style="font-size:12px;font-weight:700;color:#64748b">'+BR[B]+'</span>'
    + '<span style="font-size:12px;font-weight:800;background:#0f172a;color:#fff;border-radius:999px;padding:3px 10px">Gün '+day+' · '+ym.slice(4)+'/'+ym.slice(0,4)+'</span></div>'
    + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">';
  fields.forEach(([k,lab]) => {
    const req = (k==='ciro'||k==='check');
    const hi = req ? 'background:#fef9c3;border-color:#eab308' : '';
    h += '<div style="background:#fff;border:1px solid '+(req?'#eab308':'#e2e8f0')+';border-radius:8px;padding:6px 5px'+(req?';box-shadow:0 0 0 1px rgba(234,179,8,.2)':'')+'">'
      + '<label style="font-size:9px;font-weight:800;letter-spacing:.03em;color:'+(req?'#b45309':'#64748b')+';display:block;margin-bottom:3px">'+lab+'</label>'
      + inp('mk_'+k, row[k]).replace('border:1px solid #e2e8f0', 'border:1px solid #e2e8f0;'+hi)
      + '</div>';
  });
  h += '</div>'
    + '<div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:6px">'
    + '<div style="padding:8px 10px;background:#0f172a;border-radius:8px;display:flex;justify-content:space-between;align-items:center">'
    + '<span style="font-size:11px;font-weight:700;color:#94a3b8">TOPLAM</span>'
    + '<span id="mk_toplam" style="font-size:15px;font-weight:800;color:#38bdf8">0,00</span></div>'
    + '<div style="padding:8px 10px;background:#0f172a;border-radius:8px;display:flex;justify-content:space-between;align-items:center">'
    + '<span style="font-size:11px;font-weight:700;color:#94a3b8">FARK</span>'
    + '<span id="mk_fark" style="font-size:15px;font-weight:800;color:#4ade80">0,00</span></div></div>'
    + '<button class="a" style="width:100%;margin-top:8px;padding:12px;border-radius:10px;font-size:15px;font-weight:800;background:linear-gradient(135deg,#16a34a,#15803d)" onclick="myKasaSave()">💾 Kaydet</button>'
    + '<button style="width:100%;margin-top:6px;padding:10px;border:0;border-radius:10px;font-size:14px;font-weight:800;background:#475569;color:#fff" onclick="myKasaClose()">✕ Kapat</button>'
    + '<p id="mk_st" style="margin:6px 2px 0;font-size:10px;color:#94a3b8;text-align:center">Yazdıkça otomatik kaydedilir ve yöneticiye düşer</p></div>';
  $('mf').innerHTML = h;
  window.__mk = { ym: ym, day: day, name: name };
  setTimeout(myKasaLive, 0);
};
window.myKasaLive = function(){
  const keys = ['ticket','sodexho','multinet','metropol','setcard','token','kk','nakit','hediye'];
  let sum = 0;
  keys.forEach(k => { const el = document.getElementById('mk_'+k); sum += el ? zNum(el.value) : 0; });
  const ciroEl = document.getElementById('mk_ciro');
  const ciro = ciroEl ? zNum(ciroEl.value) : 0;
  const fmt = n => Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const t = document.getElementById('mk_toplam'); if (t) t.textContent = fmt(sum);
  const f = document.getElementById('mk_fark'); if (f) { f.textContent = fmt(sum - ciro); f.style.color = Math.abs(sum-ciro)<0.005 ? '#16a34a' : '#dc2626'; }
};
window.myKasaAuto = () => { clearTimeout(window.__mkt); const st = document.getElementById('mk_st'); if (st) st.textContent = '● kaydediliyor…'; window.__mkt = setTimeout(() => myKasaSave(true), 700); };
window.myKasaClose = async () => { clearTimeout(window.__mkt); try { await myKasaSave(true); } catch (e) {} $('ov').hidden = true; };
window.myKasaSave = async (silent) => {
  const m = window.__mk; if (!m) return;
  if (!document.getElementById('mk_ciro')) return;
  const elVal = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const g = id => { const el = document.getElementById(id); return el ? zNum(el.value) : 0; };
  const ciroRaw = elVal('mk_ciro').trim();
  const checkRaw = elVal('mk_check').trim();
  const _auto = !!silent;
  const ciroEl = document.getElementById('mk_ciro');
  const checkEl = document.getElementById('mk_check');
  const mark = (el, bad) => { if (!el) return; el.style.borderColor = bad ? '#dc2626' : '#e2e8f0'; el.style.boxShadow = bad ? '0 0 0 2px rgba(220,38,38,.25)' : ''; };
  if (!_auto) { mark(ciroEl, !ciroRaw); mark(checkEl, !checkRaw); }
  if (!_auto && (!ciroRaw || !checkRaw)) {
    msg('CİRO ve ÇEK alanları zorunlu. Lütfen doldur.');
    if (!ciroRaw && ciroEl) ciroEl.focus();
    else if (checkEl) checkEl.focus();
    return;
  }
  if (!_auto && g('mk_ciro') <= 0) {
    mark(ciroEl, true);
    msg('CİRO 0 olamaz. Gerçek ciro tutarını gir.');
    if (ciroEl) ciroEl.focus();
    return;
  }
  if (!_auto && g('mk_check') <= 0) {
    mark(checkEl, true);
    msg('ÇEK SAYISI 0 olamaz. Fiş/çek adedini gir.');
    if (checkEl) checkEl.focus();
    return;
  }
  const data = {
    ticket: g('mk_ticket'), sodexho: g('mk_sodexho'), multinet: g('mk_multinet'),
    metropol: g('mk_metropol'), setcard: g('mk_setcard'), token: g('mk_token'),
    kk: g('mk_kk'), nakit: g('mk_nakit'), hediye: g('mk_hediye'),
    ciro: g('mk_ciro'), check: g('mk_check')
  };
  try {
    await gs('setMyKasa', B, m.ym, m.day, m.name, data);
    if (silent) { const st = document.getElementById('mk_st'); if (st) { st.textContent = '✓ Kaydedildi · yöneticiye iletildi ' + new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); st.style.color = '#16a34a'; } } else msg('✓ Satışların kaydedildi');
  } catch(e) { const st = document.getElementById('mk_st'); if (st && silent) { st.textContent = '⚠ Kaydedilemedi: ' + emsg(e); st.style.color = '#dc2626'; } else msg(emsg(e)); }
};

(function () {      // eski sürüm anahtarları temizlenir (yeni kalıcı giriş 'hm_apin2' ile dosya sonunda)
  try { localStorage.removeItem('hm_apin'); localStorage.removeItem('hm_mode'); } catch (e) {}   // eski sürümde kaydedilmiş şifre/mod varsa sil
})();
(function () {      // tam ekran Günsonu: başka bir pencere açılınca normale döner
  const st = document.createElement('style');
  st.textContent = '#ov.zfull{padding:0!important;align-items:stretch!important;justify-content:stretch!important}#ov.zfull .mb{width:100vw!important;max-width:100vw!important;height:100vh!important;max-height:100vh!important;border-radius:0!important;margin:0!important;overflow:auto!important;box-sizing:border-box}';
  document.head.appendChild(st);
  const a0 = window.ask; window.ask = function () { const o = document.getElementById('ov'); if (o) o.classList.remove('zfull'); return a0.apply(this, arguments); };
})();
window.zPosUI = async () => {
  ZPOS.ym = zYmNow(); ZPOS.day = zDayNow(); ZPOS.days = {}; ZPOS.dirty = false;
  pop('📋 Günsonu Kasa Raporu · ' + BR[B], '<p class="sub">Yükleniyor…</p>', true);
  document.getElementById('ov').classList.add('zfull');
  try { const kd = await gs('getKasaDay', B); if (kd && kd.ym) { ZPOS.ym = kd.ym; ZPOS.day = +kd.day; } } catch (e) {}
  try { ZPOS.days = (await gs('getZPos', B, ZPOS.ym, PIN)) || {}; }
  catch (e) { msg(emsg(e)); return; }
  zPosRtSync();
  try { const ko = await gs('getKasaOpen', B); ZPOS.kopen = !!(ko && ko.open); } catch (e) {}
  zPosRender();
};
window.zPosRtSync = () => {   // ekrandaki günün satır zaman damgaları (çakışma kontrolü)
  const ng = x => String(x || '').toLocaleUpperCase('tr').replace(/İ/g, 'I').replace(/\s+/g, ' ').trim();
  ZPOS.rt = {}; const d = ZPOS.days[String(ZPOS.day)] || {};
  (Array.isArray(d.garson) ? d.garson : []).forEach(x => { ZPOS.rt[ng(x.name)] = x.t || 0; });
  ZPOS.syncT = Date.now() - 4000; ZPOS._rk = ZPOS.ym + '|' + ZPOS.day;
};
window.zPosCalc = function () {
  // Garson satır toplam / fark
  let colTot = { ticket: 0, sodexho: 0, multinet: 0, metropol: 0, setcard: 0, token: 0, kk: 0, nakit: 0, hediye: 0, toplam: 0, ciro: 0, check: 0 };
  for (let i = 0; i < 20 && document.getElementById('zg_' + i + '_name'); i++) {
    let rowSum = 0;
    ZG_COLS.forEach(c => {
      const v = zPosVal('zg_' + i + '_' + c);
      colTot[c] += v;
      if (c !== 'hediye') rowSum += v;      // Excel: TOPLAM = SUM(B:I), Hediye çeki ayrı
    });
    const ciro = zPosVal('zg_' + i + '_ciro');
    const check = zPosVal('zg_' + i + '_check');
    colTot.toplam += rowSum;
    colTot.ciro += ciro;
    colTot.check += check;
    const tEl = document.getElementById('zg_' + i + '_toplam');
    const fEl = document.getElementById('zg_' + i + '_fark');
    if (tEl) tEl.textContent = zPosFmt(rowSum);
    if (fEl) { fEl.textContent = zPosFmt(rowSum - ciro); fEl.style.color = Math.abs(rowSum - ciro) < 0.005 ? '#16a34a' : '#dc2626'; }
  }
  ZG_COLS.forEach(c => {
    const el = document.getElementById('zg_tot_' + c);
    if (el) el.textContent = zPosFmt(colTot[c]);
  });
  const setT = (id, n) => { const e = document.getElementById(id); if (e) e.textContent = zPosFmt(n); };
  setT('zg_tot_toplam', colTot.toplam);
  setT('zg_tot_ciro', colTot.ciro);
  setT('zg_tot_fark', colTot.toplam - colTot.ciro);
  setT('zg_tot_check', colTot.check);
  // Özet
  setT('oz_nakit', colTot.nakit);
  setT('oz_hediye', colTot.hediye);
  setT('oz_ciro', colTot.ciro);
  // POS FARK
  ZPOS_MAIN.forEach(p => {
    const k = zPosVal('zk_' + p.id), pk = zPosVal('zpk_' + p.id), qr = zPosVal('zqr_' + p.id);
    let extraSum = 0;
    (ZPOS_FARK_MAP[p.id] || []).forEach(lab => { extraSum += zPosVal('zex_' + lab.replace(/[^a-zA-Z0-9]/g, '_')); });
    const fark = k - (pk + extraSum) - qr;
    const el = document.getElementById('zfark_' + p.id);
    if (el) { el.textContent = zPosFmt(fark); el.style.color = Math.abs(fark) < 0.005 ? '#16a34a' : '#dc2626'; }
  });
  // TOPLAM KASA
  let tPk = 0, tN = 0, tK = 0, tQr = 0, tKf = 0, tNf = 0;
  ZPOS_MAIN.forEach(p => {
    tPk += zPosVal('zpk_' + p.id); tN += zPosVal('zn_' + p.id); tK += zPosVal('zk_' + p.id);
    tQr += zPosVal('zqr_' + p.id); tKf += zPosVal('zkf_' + p.id); tNf += zPosVal('znf_' + p.id);
  });
  ZPOS_EXTRA.forEach(lab => { tPk += zPosVal('zex_' + lab.replace(/[^a-zA-Z0-9]/g, '_')); });
  setT('ztk_fark', tK - tPk - tQr); setT('ztk_pk', tPk + tQr); setT('ztk_n', tN); setT('ztk_k', tK); setT('ztk_qr', tQr); setT('ztk_kf', tKf); setT('ztk_nf', tNf);
  // Yemek POS toplam + FARK (Excel: F55-B20 vb.)
  let yGrand = 0;
  ZPOS_YEMEK.forEach(name => {
    const key = name.replace(/[^a-zA-Z0-9]/g, '_');
    const s = zPosVal('zya_' + key) + zPosVal('zyb_' + key) + zPosVal('zyc_' + key);
    yGrand += s;
    setT('zyt_' + key, s);
    const gk = ZPOS_YEMEK_KEY[name];
    const gTot = colTot[gk] || 0;
    const fEl = document.getElementById('zyf_' + key);
    if (fEl) { fEl.textContent = zPosFmt(s - gTot); fEl.style.color = Math.abs(s - gTot) < 0.005 ? '#16a34a' : '#dc2626'; }
  });
  setT('zy_grand', yGrand);
  setT('oz_ykpos', yGrand);
  // ÖZET KASA (Excel: B23=F61, B24=E52, B25=I20, B28=J20, B33=SUM(B23:B25)+B28, D26=B33-D23)
  const topKasa = yGrand + tK + colTot.nakit + colTot.hediye;
  setT('oz_yemek', yGrand); setT('oz_kk', tK); setT('oz_top', topKasa);
  setT('oz_fark', topKasa - colTot.ciro);
  { const e = document.getElementById('oz_fark'); if (e) e.style.color = Math.abs(topKasa - colTot.ciro) < 0.005 ? '#16a34a' : '#dc2626'; }
  setT('oz_zkk', tK - colTot.kk);
  { const e = document.getElementById('oz_zkk'); if (e) e.style.color = Math.abs(tK - colTot.kk) < 0.005 ? '#16a34a' : '#dc2626'; }
};
function zPosRender() {
  zSyncGarson();
  if (ZPOS._rk !== ZPOS.ym + '|' + ZPOS.day) zPosRtSync();
  const ym = ZPOS.ym, day = ZPOS.day;
  const raw = ZPOS.days[String(day)] || {};
  const ddata = raw.main || raw.garson ? raw : { main: raw, extra: {}, yemek: {}, garson: [] };
  const main = ddata.main || {}, extra = ddata.extra || {}, yemek = ddata.yemek || {};
  const _normG = s => String(s || '').toLocaleUpperCase('tr').replace(/İ/g, 'I').replace(/\s+/g, ' ').trim();
  const eh = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const _byName = {};
  (Array.isArray(ddata.garson) ? ddata.garson : []).forEach(g => { if (g && g.name) { const k = zResolveG(g.name); if (!_byName[k] || zGHas(g)) _byName[k] = g; } });
  let garson = ZPOS_GARSON_DEFAULT.map(n => { const g = _byName[_normG(n)]; return g ? Object.assign({}, g, { name: n }) : { name: n }; });
  Object.keys(_byName).forEach(k => {
    if (ZPOS_GARSON_DEFAULT.some(n => _normG(n) === k)) return;
    if (typeof B !== 'undefined' && B === 'mavi' && !zGHas(_byName[k])) return;   // serviste olmayan ve verisi boş olanlar listeden çıkar
    garson.push(_byName[k]);
  });
  const GN = Math.min(17, Math.max(12, ZPOS.gn || 12, garson.length));
  ZPOS.gn = GN;
  while (garson.length < GN) garson.push({ name: '' });
  const y = ym.slice(0, 4), m = ym.slice(4);
  const maxD = new Date(+y, +m, 0).getDate();
  const dayOpts = Array.from({ length: maxD }, (_, i) => i + 1).map(d => '<option value="' + d + '"' + (d == day ? ' selected' : '') + '>' + d + '</option>').join('');
  const lab = (t, c) => '<div style="font-size:9px;font-weight:800;color:' + (c || '#64748b') + ';margin:0 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + t + '</div>';
  const cell = (t, id, v, bg, c) => '<div style="min-width:0">' + lab(t, c) + zPosInp(id, v, bg || '#fff') + '</div>';
  const grid = h => '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px">' + h + '</div>';
  const sec = t => '<div style="font-size:11px;font-weight:800;margin:12px 0 5px;color:#334155">' + t + '</div>';
  const box = (t, id, c) => '<div style="min-width:0;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:5px 6px">' + lab(t) + '<div id="' + id + '" style="font-size:12px;font-weight:800;text-align:right;color:' + (c || '#0f172a') + ';white-space:nowrap">0,00</div></div>';
  const GL = { ticket: 'TİCKET', sodexho: 'SODEXHO', multinet: 'MULTİNET', metropol: 'METROPOL', setcard: 'SETCARD', token: 'TOKEN', kk: 'K.K', nakit: 'NAKİT', hediye: 'HEDİYE' };
  // ---- GARSON kartları (satıra dokun: aç/kapa) ----
  let gCards = '';
  for (let i = 0; i < GN; i++) {
    const g = garson[i] || {};
    const has = ZG_COLS.some(c => g[c]) || g.ciro || g.check;
    gCards += '<details' + (has ? ' open' : '') + ' style="border:1px solid #cbd5e1;border-radius:10px;background:#fff;margin-bottom:5px;overflow:hidden">'
      + '<summary style="display:flex;align-items:center;gap:6px;padding:8px 9px;cursor:pointer;list-style:none;font-size:12px;font-weight:800">'
      + '<span style="color:#94a3b8">▸</span><span id="zg_' + i + '_sn" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + eh(g.name || '(boş satır)') + '</span>'
      + '<span style="font-size:11px;font-weight:700;color:#475569;white-space:nowrap">Σ <span id="zg_' + i + '_toplam">0,00</span></span>'
      + '<span id="zg_' + i + '_fark" style="font-size:11px;font-weight:800;min-width:50px;text-align:right;white-space:nowrap">0,00</span></summary>'
      + '<div style="padding:0 8px 8px">'
      + '<input id="zg_' + i + '_name" type="text" value="' + eh(g.name || '') + '" placeholder="Garson adı" style="width:100%;box-sizing:border-box;background:#fff;color:#111;border:1px solid #cbd5e1;border-radius:6px;padding:7px 6px;font-size:14px;margin:0 0 6px" oninput="zPosSn(' + i + ');zPosAuto()">'
      + grid(ZG_COLS.map(c => cell(GL[c], 'zg_' + i + '_' + c, g[c])).join('') + cell('CİRO', 'zg_' + i + '_ciro', g.ciro, '#fff7ed', '#b45309') + cell('ÇEK', 'zg_' + i + '_check', g.check, '#fff7ed', '#b45309'))
      + '</div></details>';
  }
  const gTot = grid(ZG_COLS.map(c => box(GL[c], 'zg_tot_' + c)).join('') + box('TOPLAM', 'zg_tot_toplam') + box('CİRO', 'zg_tot_ciro') + box('FARK', 'zg_tot_fark') + box('ÇEK', 'zg_tot_check'));
  // ---- POS kartları ----
  const BANK = {
    is: { bg: '#bfdbfe', c: '#1d4ed8' },       // İş Bankası - mavi
    ga: { bg: '#bbf7d0', c: '#15803d' },       // Garanti - yeşil
    zi: { bg: '#fde047', c: '#854d0e' }        // Ziraat - sarı
  };
  const exCell = (l, b) => cell(l, 'zex_' + l.replace(/[^a-zA-Z0-9]/g, '_'), extra[l], b.bg, b.c);
  // Her POS kendi Z raporunun altında: POS KREDİ (İş mavi) + Garanti (yeşil) + Ziraat (sarı)
  const mainCards = ZPOS_MAIN.map(p => {
    const v = main[p.id] || {};
    const kc = [];
    if (p.a) kc.push(cell(p.a, 'zpk_' + p.id, v.pk, BANK.is.bg, BANK.is.c));
    (ZPOS_FARK_MAP[p.id] || []).forEach(l => kc.push(exCell(l, /^PS/i.test(l) ? BANK.zi : BANK.ga)));
    return '<div style="border:1px solid #cbd5e1;background:#fff;border-radius:10px;padding:8px;margin-bottom:8px">'
      + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;font-weight:800;color:#111"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">' + (p.a ? p.a + ' · ' : '') + p.c + '</span><span style="font-size:10px;color:#64748b">FARK</span><span id="zfark_' + p.id + '" style="min-width:56px;text-align:right">0,00</span></div>'
      + grid(cell('Z NAKİT', 'zn_' + p.id, v.n) + cell('Z KREDİ', 'zk_' + p.id, v.k, '#fef08a') + cell('QR FAST', 'zqr_' + p.id, v.qr)
        + cell('KREDİ FAT.', 'zkf_' + p.id, v.kf) + cell('NAKİT FAT.', 'znf_' + p.id, v.nf))
      + (kc.length ? '<div style="font-size:9px;font-weight:800;color:#334155;margin:8px 0 3px;border-top:1px dashed #cbd5e1;padding-top:6px">POS KREDİ YATAN (farka dahil)</div>' + grid(kc.join('')) : '')
      + (!p.a ? '<input type="hidden" id="zpk_' + p.id + '" value="' + (v.pk || '') + '">' : '')
      + '</div>';
  }).join('');
  const tk = ddata.topkasa || {};
  const tkBox = grid(box('POS KREDİ (+QR)', 'ztk_pk', '#2563eb') + box('Z NAKİT', 'ztk_n') + box('Z KREDİ', 'ztk_k')
    + box('QR FAST', 'ztk_qr') + box('KREDİ FAT.', 'ztk_kf') + box('NAKİT FAT.', 'ztk_nf')
    + box('Z KREDİ FARK', 'ztk_fark', '#dc2626') + '<div style="min-width:0">' + lab('NOT / EK') + zPosInp('ztk_blank', tk.blank) + '</div>');
  // ---- YEMEK POS ----
  const yemekCards = ZPOS_YEMEK.map(name => {
    const key = name.replace(/[^a-zA-Z0-9]/g, '_');
    const v = yemek[name] || {};
    return '<div style="border:1px solid #e5e7eb;background:#fff;border-radius:10px;padding:8px;margin-bottom:5px">'
      + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;font-weight:800;color:#111"><span style="flex:1;min-width:0">' + name + '</span><span style="font-size:11px;font-weight:700;color:#475569;white-space:nowrap">Σ <span id="zyt_' + key + '">0,00</span></span><span id="zyf_' + key + '" style="min-width:56px;text-align:right;white-space:nowrap">0,00</span></div>'
      + grid(cell('1', 'zya_' + key, v.a) + cell('2', 'zyb_' + key, v.b) + cell('3', 'zyc_' + key, v.c)) + '</div>';
  }).join('');
  const fs = 'background:#fff;color:#111;border:1px solid #cbd5e1;border-radius:8px;padding:6px 7px;font-size:14px;margin:0;width:auto;';
  const ozr = (l, id, big) => '<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px dashed #e2e8f0' + (big ? ';font-weight:800;font-size:13px' : '') + '"><span style="min-width:0">' + l + '</span><b id="' + id + '" style="font-variant-numeric:tabular-nums">0,00</b></div>';
  const tbtn = (k, t) => '<button id="zt_b_' + k + '" onclick="zPosTab(\'' + k + '\')" style="flex:1;min-width:0;border:1px solid #cbd5e1;border-radius:10px;padding:9px 3px;font-size:12px;font-weight:800;line-height:1.15;margin:0;background:#fff;color:#334155">' + t + '</button>';
  $('mf').innerHTML = '<div id="zpw" style="background:#f8fafc;color:#111;border-radius:12px;padding:0 8px 8px;max-width:100%;box-sizing:border-box">'
    + '<style>#zpw summary::-webkit-details-marker{display:none}#zpw details[open]>summary{border-bottom:1px solid #e2e8f0}</style>'
    + '<div style="position:sticky;top:0;z-index:6;background:#f8fafc;padding:8px 0 6px">'
    + '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">'
    + '<label style="font-size:12px;color:#64748b">Ay</label>'
    + '<input id="z_ym" type="text" inputmode="numeric" value="' + ym + '" maxlength="6" style="' + fs + 'width:78px" onchange="zPosYm()">'
    + '<label style="font-size:12px;color:#64748b">Gün</label>'
    + '<select id="z_day" onchange="zPosDay()" style="' + fs + 'min-width:56px">' + dayOpts + '</select>'
    + '<span style="flex:1"></span><button onclick="zPosClose()" style="margin:0;border:0;border-radius:10px;padding:8px 14px;font-size:13px;font-weight:800;background:#dc2626;color:#fff;white-space:nowrap">✕ Kapat</button></div>'
    + '<div style="display:flex;gap:6px">' + tbtn('g', '👥 Garson<br>Tablosu') + tbtn('z', '🧾 Z<br>Raporları') + tbtn('y', '🍽️ Yemek<br>Çekleri') + '</div></div>'
    + '<div id="zt_g">' + gCards + (GN < 17 ? '<button onclick="zPosAddG()" style="width:100%;margin:2px 0 8px;padding:10px;border:1px dashed #16a34a;border-radius:10px;background:#f0fdf4;color:#15803d;font-size:13px;font-weight:800">➕ Garson ekle</button>' : '') + gTot
    + sec('ÖZET KASA')
    + '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:6px 8px;font-size:12px">'
    + ozr('Yemek kartları (Yemek POS toplamı)', 'oz_yemek') + ozr('Kredi kartı (Z KREDİ toplamı)', 'oz_kk') + ozr('Nakit (garson nakit)', 'oz_nakit') + ozr('Hediye çeki', 'oz_hediye')
    + ozr('TOPLAM KASA', 'oz_top', 1) + ozr('CİRO', 'oz_ciro', 1) + ozr('FARK (Toplam kasa − Ciro)', 'oz_fark', 1)
    + ozr('Z KREDİ − Garson K.K', 'oz_zkk') + '<span id="oz_ykpos" style="display:none"></span></div></div>'
    + '<div id="zt_z" style="display:none"><div style="font-size:10px;font-weight:800;margin:2px 0 6px"><span style="color:#1d4ed8">■ İş Bankası</span> · <span style="color:#a16207">■ Ziraat</span> · <span style="color:#15803d">■ Garanti</span></div>'
    + mainCards + sec('TOPLAM KASA') + tkBox + '</div>'
    + '<div id="zt_y" style="display:none"><div style="font-size:11px;color:#64748b;margin:2px 0 6px">Her satıra POS fişlerinin 1 · 2 · 3 tutarlarını gir.</div>' + yemekCards
    + '<div style="background:#f1f5f9;border-radius:8px;padding:8px;font-size:12px;font-weight:800;display:flex;justify-content:space-between"><span>YEMEK ÇEKLERİ GENEL TOPLAM</span><span id="zy_grand">0,00</span></div></div>'
    + '<div style="position:sticky;bottom:0;z-index:6;background:#f8fafc;border-top:1px solid #e2e8f0;margin-top:10px;padding:6px 0 2px">'
    + '<button id="zk_open" onclick="zKasaOpenToggle()" style="width:100%;margin:0 0 6px;padding:9px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:12px;font-weight:800">…</button>'
    + '<button onclick="zPosClearFrom()" style="width:100%;margin:0 0 6px;padding:8px;border:1px dashed #dc2626;border-radius:10px;background:#fff;color:#b91c1c;font-size:12px;font-weight:800">🧹 Şu günden itibaren kasaları temizle</button>'
    + '<button onclick="zPosImportPick()" style="width:100%;margin:0 0 6px;padding:8px;border:1px dashed #94a3b8;border-radius:10px;background:#fff;color:#334155;font-size:12px;font-weight:800">⬆ Excel\'den aktar (ayın günleri)</button>'
    + '<div id="zs_st" style="font-size:11px;font-weight:700;color:#64748b;text-align:center;margin-bottom:4px">otomatik kaydedilir</div>'
    + '<div style="display:flex;gap:6px">'
    + '<button class="a" style="flex:1;padding:10px 4px;font-size:13px;background:linear-gradient(135deg,#16a34a,#15803d)" onclick="zPosSave()">💾 Kaydet</button>'
    + '<button class="a ed" style="flex:1;padding:10px 4px;font-size:13px" onclick="zPosXls()">⬇ Excel</button>'
    + '<button class="a" style="flex:1.3;padding:10px 4px;font-size:13px;background:linear-gradient(135deg,#b45309,#92400e)" onclick="zPosCloseDay()">🔒 Günsonu Al</button>'
    + '<button style="flex:.8;margin:0;border:0;border-radius:10px;padding:10px 4px;font-size:13px;font-weight:800;background:#475569;color:#fff" onclick="zPosClose()">✕ Kapat</button>'
    + '</div></div></div>';
  zPosFull(); zPosTab(ZPOS.tab || 'g'); zPosKopenBtn();
  setTimeout(zPosCalc, 0);
}
window.zPosClose = async () => {
  clearTimeout(ZPOS._t);
  if (ZPOS.dirty) { try { await zPosSave(true); } catch (e) {} }
  $('ov').hidden = true;
};
window.zPosTab = k => {
  ZPOS.tab = k;
  ['g', 'z', 'y'].forEach(x => {
    const sec = document.getElementById('zt_' + x), b = document.getElementById('zt_b_' + x);
    if (sec) sec.style.display = x === k ? '' : 'none';
    if (b) { b.style.background = x === k ? 'linear-gradient(135deg,#1e293b,#0f172a)' : '#fff'; b.style.color = x === k ? '#fff' : '#334155'; }
  });
  const mf = document.getElementById('mf'); if (mf) mf.scrollTop = 0;
};
function zPosFull() {
  const mf = $('mf'), ov = $('ov'); if (!mf || !ov) return;
  let box = mf; while (box.parentElement && box.parentElement !== ov) box = box.parentElement;
  if (!box || box === mf || box.dataset.zo !== undefined) return;
  box.dataset.zo = box.style.cssText; mf.dataset.zo = mf.style.cssText;
  box.style.cssText += ';position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;border-radius:0;overflow:hidden;box-sizing:border-box';
  mf.style.cssText += ';max-height:calc(100dvh - 64px);overflow-y:auto;-webkit-overflow-scrolling:touch';
  if (!window.__zobs) {
    window.__zobs = new MutationObserver(() => {
      if (!ov.hidden) return;
      if (ZPOS.dirty && document.getElementById('z_ym')) zPosSave(true);
      const b = [...ov.children].find(c => c.dataset && c.dataset.zo !== undefined);
      if (b) { b.style.cssText = b.dataset.zo; delete b.dataset.zo; }
      if (mf.dataset.zo !== undefined) { mf.style.cssText = mf.dataset.zo; delete mf.dataset.zo; }
    });
    window.__zobs.observe(ov, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
  }
}
window.zPosSn = i => { const n = document.getElementById('zg_' + i + '_name'), s = document.getElementById('zg_' + i + '_sn'); if (n && s) s.textContent = n.value.trim() || '(boş satır)'; };
window.zPosCloseDay = async () => {
  if (!confirm('Gün ' + ZPOS.day + ' kapatılsın mı?\n\nPersoneller bu güne satış giremeyecek.')) return;
  try {
    await gs('closeKasaDay', B, ZPOS.ym, ZPOS.day, PIN);
    if (!ZPOS.days[String(ZPOS.day)]) ZPOS.days[String(ZPOS.day)] = {};
    ZPOS.days[String(ZPOS.day)].closed = true;
    msg('✓ Gün ' + ZPOS.day + ' kapatıldı. Personel girişi kilitli.');
    // bir sonraki güne geç
    const y = ZPOS.ym.slice(0, 4), m = ZPOS.ym.slice(4);
    const maxD = new Date(+y, +m, 0).getDate();
    if (ZPOS.day < maxD) {
      ZPOS.day = ZPOS.day + 1;
      ZPOS.dirty = false;
      zPosRender();
    }
  } catch (e) { msg(emsg(e)); }
};
window.zPosYm = async () => {
  const el = document.getElementById('z_ym'); if (!el) return;
  let ym = String(el.value || '').replace(/[^\d]/g, '').slice(0, 6);
  if (ym.length !== 6) { el.value = ZPOS.ym; return; }
  if (ym === ZPOS.ym) return;
  if (ZPOS.dirty) await zPosSave(true);
  ZPOS.ym = ym; ZPOS.day = 1; ZPOS.dirty = false;
  try { ZPOS.days = (await gs('getZPos', B, ZPOS.ym, PIN)) || {}; } catch (e) { msg(emsg(e)); ZPOS.days = {}; }
  zPosRender();
};
window.zPosDay = async () => {
  const el = document.getElementById('z_day'); if (!el) return;
  const d = +el.value || 1;
  if (d === ZPOS.day) return;
  if (ZPOS.dirty) await zPosSave(true);
  ZPOS.day = d; ZPOS.dirty = false;
  zPosRender();
};
window.zPosAuto = () => {
  ZPOS.dirty = true; ZPOS.ver = (ZPOS.ver || 0) + 1;
  const st = document.getElementById('zs_st'); if (st) { st.textContent = '● kaydedilecek…'; st.style.color = '#b45309'; }
  clearTimeout(ZPOS._t); ZPOS._t = setTimeout(() => zPosSave(true), 2000);
};
window.zPosKopenBtn = () => {
  const b = document.getElementById('zk_open'); if (!b) return;
  b.textContent = ZPOS.kopen ? '🟢 Garsonlara AÇIK · kapatmak için dokun' : '🔴 Garsonlara kapalı · açmak için dokun';
  b.style.background = ZPOS.kopen ? '#dcfce7' : '#fee2e2'; b.style.color = ZPOS.kopen ? '#166534' : '#991b1b'; b.style.borderColor = ZPOS.kopen ? '#16a34a' : '#dc2626';
};
window.zKasaOpenToggle = async () => {
  try { const r = await gs('setKasaOpen', B, !ZPOS.kopen, PIN); ZPOS.kopen = !!(r && r.open); zPosKopenBtn(); msg(ZPOS.kopen ? '✓ Kasaföy garsonlara açıldı' : 'Kasaföy garsonlara kapatıldı'); }
  catch (e) { msg(emsg(e)); }
};
let __zpBusy = false;
window.__zpAct = Date.now(); ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(ev => document.addEventListener(ev, () => { window.__zpAct = Date.now(); }, { passive: true, capture: true }));
window.zPosPoll = async () => {     // personelin girdiği satışlar birkaç saniyede yönetici tablosuna düşer
  if (__zpBusy || !document.getElementById('zpw') || ($('ov') && $('ov').hidden)) return;
if (document.visibilityState !== 'visible' || Date.now() - (window.__zpAct || 0) > 10 * 60000) return;   // KOTA: ekran arka plandaysa ya da 10 dk dokunulmadıysa sorgulamayı durdur
  __zpBusy = true;
  try {
    const ng = x => String(x || '').toLocaleUpperCase('tr').replace(/İ/g, 'I').replace(/\s+/g, ' ').trim();
    const days = (await gs('getZPos', B, ZPOS.ym, PIN)) || {};
    try { const ko = await gs('getKasaOpen', B); const v = !!(ko && ko.open); if (v !== ZPOS.kopen) { ZPOS.kopen = v; zPosKopenBtn(); } } catch (e) {}
    const d = days[String(ZPOS.day)] || {}, sg = Array.isArray(d.garson) ? d.garson : [];
    if (d.closed && !(ZPOS.days[String(ZPOS.day)] || {}).closed) { ZPOS.days[String(ZPOS.day)] = Object.assign({}, ZPOS.days[String(ZPOS.day)] || {}, { closed: true }); }
    ZPOS.rt = ZPOS.rt || {};
    const names = []; for (let i = 0; i < 20; i++) { const e = document.getElementById('zg_' + i + '_name'); if (!e) break; names.push(e); }
    let needRender = false, changed = false;
    sg.forEach(r => {
      const k = ng(r.name); if (!k || (r.t || 0) === (ZPOS.rt[k] || 0)) return;
      let idx = names.findIndex(e => ng(e.value) === k);
      if (idx < 0) idx = names.findIndex(e => !e.value.trim() && e !== document.activeElement);
      if (idx < 0) { needRender = true; return; }
      const act = document.activeElement;
      if (act && act.id && act.id.indexOf('zg_' + idx + '_') === 0) return;      // o satırı yazıyorsa dokunma
      const nm = names[idx]; if (!nm.value.trim()) nm.value = r.name;
      ZG_COLS.concat(['ciro', 'check']).forEach(f => { const el = document.getElementById('zg_' + idx + '_' + f); if (el && el !== act) el.value = Number(r[f]) ? r[f] : ''; });
      zPosSn(idx); const det = nm.closest('details'); if (det) det.open = true;
      ZPOS.rt[k] = r.t || 0; changed = true;
    });
    if (changed) { zPosCalc(); const st = document.getElementById('zs_st'); if (st) { st.textContent = '⬇ personelden güncellendi'; st.style.color = '#2563eb'; } }
    if (needRender && !ZPOS.dirty) {
      const act = document.activeElement;
      if (!(act && act.closest && act.closest('#zpw') && /INPUT|SELECT/.test(act.tagName))) {
        const mf = $('mf'), top = mf ? mf.scrollTop : 0;
        ZPOS.days[String(ZPOS.day)] = Object.assign({}, ZPOS.days[String(ZPOS.day)] || {}, { garson: sg });
        sg.forEach(r => { ZPOS.rt[ng(r.name)] = r.t || 0; });
        zPosRender(); if (mf) mf.scrollTop = top;
      }
    }
  } catch (e) {} finally { __zpBusy = false; }
};
setInterval(() => { try { window.zPosPoll(); } catch (e) {} }, 4000);
window.zPosAddG = async () => {
  ZPOS.gn = Math.min(17, (ZPOS.gn || 12) + 1);
  await zPosSave(true);
  zPosRender();
  try {
    const el = document.getElementById('zg_' + (ZPOS.gn - 1) + '_name');
    if (el) { const d = el.closest('details'); if (d) d.open = true; el.scrollIntoView({ block: 'center' }); el.focus(); }
  } catch (e) {}
};
window.zPosSave = async (silent) => {
  if (!document.getElementById('z_ym')) return;
  clearTimeout(ZPOS._t); const v0 = ZPOS.ver || 0;
  const g = id => zPosVal(id);
  const main = {};
  ZPOS_MAIN.forEach(p => {
    const o = { pk: g('zpk_' + p.id), n: g('zn_' + p.id), k: g('zk_' + p.id), qr: g('zqr_' + p.id), kf: g('zkf_' + p.id), nf: g('znf_' + p.id) };
    if (o.pk || o.n || o.k || o.qr || o.kf || o.nf) main[p.id] = o;
  });
  const extra = {};
  ZPOS_EXTRA.forEach(lab => { const v = g('zex_' + lab.replace(/[^a-zA-Z0-9]/g, '_')); if (v) extra[lab] = v; });
  const yemek = {};
  ZPOS_YEMEK.forEach(name => {
    const key = name.replace(/[^a-zA-Z0-9]/g, '_');
    const o = { a: g('zya_' + key), b: g('zyb_' + key), c: g('zyc_' + key) };
    if (o.a || o.b || o.c) yemek[name] = o;
  });
  const topkasa = { blank: g('ztk_blank'), fark: g('ztk_fark') };
  const _ng = x => String(x || '').toLocaleUpperCase('tr').replace(/İ/g, 'I').replace(/\s+/g, ' ').trim();
  const garson = [];
  for (let i = 0; i < 20; i++) {
    const nameEl = document.getElementById('zg_' + i + '_name');
    if (!nameEl) break;
    const name = nameEl.value.trim();
    const row = { name };
    ZG_COLS.forEach(c => { row[c] = g('zg_' + i + '_' + c); });
    row.ciro = g('zg_' + i + '_ciro');
    row.check = g('zg_' + i + '_check');
    row.bt = (ZPOS.rt || {})[_ng(name)] || 0;
    if (name || ZG_COLS.some(c => row[c]) || row.ciro || row.check) garson.push(row);
  }
  try {
    const rs = await gs('setZPos', B, ZPOS.ym, ZPOS.day, { main, extra, yemek, topkasa, garson, syncT: ZPOS.syncT || 0 }, PIN);
    const fg = (rs && rs.garson) || garson;
    ZPOS.rt = ZPOS.rt || {}; fg.forEach(x => { ZPOS.rt[_ng(x.name)] = x.t || 0; });
    ZPOS.syncT = Date.now() - 4000;
    ZPOS.days[String(ZPOS.day)] = Object.assign({}, ZPOS.days[String(ZPOS.day)] || {}, { main, extra, yemek, topkasa, garson: fg });
    if ((ZPOS.ver || 0) === v0) ZPOS.dirty = false;
    const st = document.getElementById('zs_st');
    if (st) { st.textContent = '✓ kaydedildi ' + new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); st.style.color = '#16a34a'; }
    if (!silent) msg('✓ Gün ' + ZPOS.day + ' kaydedildi');
  } catch (e) {
    const st = document.getElementById('zs_st');
    if (silent && st) { st.textContent = '⚠ kaydedilemedi'; st.style.color = '#dc2626'; } else msg(emsg(e));
  }
};
// ===== Excel stil tablosu (şablon: KASIM 2026 KASA FÖY · sayfa '14') =====
const KSTYLE = {"S":[[["Calibri",24.0,1,"FFFF0000"],null,[["thin","FF000000"],null,null,null],["center","center",0],"#,##0.00"],[["Calibri",11.0,0,"FF000000"],null,[null,null,null,null],[null,null,0],"General"],[["Arial Tur",22.0,1,"FF000000"],null,[null,null,null,null],[null,null,0],"General"],[["Calibri",20.0,1,"FF000000"],"FFD9D9D9",[["thick",null],["hair",null],["thick",null],["hair",null]],["center","center",0],"General"],[["Arial Black",28.0,1,"FF000000"],"FFFFFFFF",[["hair",null],["hair",null],["thick",null],["hair",null]],["center","center",0],"#,##0.00"],[["Arial Black",22.0,1,"FF000000"],null,[["hair",null],["hair",null],["thick",null],["hair",null]],["center","center",0],"#,##0.00"],[["Arial Black",22.0,1,"FF000000"],"FFFFFFFF",[["hair",null],["hair",null],["thick",null],["hair",null]],["center","center",0],"#,##0.00"],[["Arial Black",22.0,1,"FF000000"],"FFD9D9D9",[["hair",null],["hair",null],["thick",null],["hair",null]],["center","center",0],"#,##0.00"],[["Arial Black",22.0,1,"FF000000"],"FFD9D9D9",[["hair",null],["thick",null],["thick",null],["hair",null]],["center","center",0],"#,##0.00"],[["Arial Black",20.0,0,"FF000000"],null,[["hair",null],["hair",null],["hair",null],null],["center","center",0],"General"],[["Arial Tur",12.0,1,"FF000000"],null,[null,null,null,null],[null,null,0],"General"],[["Arial Tur",20.0,1,"FF000000"],null,[null,null,null,null],[null,null,0],"General"],[["Arial Tur",20.0,0,"FF000000"],null,[null,null,null,null],[null,null,0],"General"],[["Calibri",22.0,1,"FF000000"],"FFFFFF00",[["thick",null],["hair",null],["hair",null],["hair",null]],[null,null,0],"General"],[["Arial Black",22.0,1,"FF000000"],"FFFFFFFF",[["hair",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"#,##0.00"],[["Arial Black",22.0,1,"FFFF0000"],"FFD9D9D9",[["hair",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"#,##0.00"],[["Arial Black",22.0,1,"FFFFFFFF"],"FF000000",[["hair",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"#,##0.00"],[["Arial Black",22.0,1,"FFFF0000"],"FFD9D9D9",[["hair","FF000000"],["thick","FF000000"],["hair","FF000000"],["hair","FF000000"]],["center","center",0],"#,##0.00"],[["Arial Tur",22.0,0,"FF000000"],null,[["hair",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"General"],[["Arial Tur",16.0,1,"FF000000"],"FFFFFFFF",[null,null,null,null],[null,null,0],"General"],[["Arial Tur",20.0,1,"FF000000"],"FFFFFFFF",[null,null,null,null],[null,null,0],"General"],[["Calibri",20.0,1,"FF0000FF"],"FFD9D9D9",[["thick",null],["hair",null],["hair",null],["thick",null]],["center","center",0],"General"],[["Arial Black",22.0,1,"FFFF0000"],"FFFFFFFF",[["hair",null],["hair",null],["hair",null],["thick",null]],["center","center",0],"#,##0.00"],[["Arial Black",22.0,1,"FFFF0000"],null,[["hair",null],["hair",null],["hair",null],["thick",null]],["center","center",0],"#,##0.00"],[["Arial Black",22.0,1,"FFFF0000"],"FFD9D9D9",[["hair","FF000000"],["thick","FF000000"],["hair","FF000000"],["thick","FF000000"]],["center","center",0],"#,##0.00"],[["Arial Tur",22.0,1,"FF000000"],null,[["hair",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"General"],[["Arial Tur",10.0,1,"FF000000"],"FFFFFFFF",[null,null,null,null],[null,null,0],"General"],[["Arial",22.0,1,"FF000000"],"FFD9D9D9",[null,null,["thick",null],["medium",null]],["center","center",0],"General"],[["Calibri",11.0,0,"FF000000"],null,[null,null,["thick",null],["medium",null]],[null,null,0],"General"],[["Arial",22.0,1,"FF000000"],null,[null,null,null,null],["center","center",0],"General"],[["Arial",16.0,1,"FF0000FF"],null,[null,null,null,null],["center","center",0],"#,##0.00"],[["Arial Tur",20.0,1,"FFFF0000"],null,[["thick",null],["hair",null],["thick",null],["hair",null]],["center",null,0],"General"],[["Arial",26.0,1,"FF0000FF"],null,[["hair",null],["thick",null],["thick",null],["hair",null]],["center","center",0],"#,##0.00"],[["Arial Black",20.0,1,"FF000000"],null,[["medium","FF000000"],["medium","FF000000"],["medium","FF000000"],null],["center","center",0],"#,##0.00"],[["Arial",18.0,1,"FF4F81BD"],null,[["medium","FF000000"],["medium","FF000000"],["medium","FF000000"],null],["center","center",0],"#,##0.00"],[["Arial",22.0,1,"FF000000"],"FFD9D9D9",[["medium",null],["hair",null],["medium",null],["hair",null]],["center","center",0],"General"],[["Arial",22.0,1,"FF000000"],"FFD9D9D9",[["hair",null],["medium",null],["medium",null],["hair",null]],["center","center",0],"#,##0.00"],[["Arial",22.0,1,"FF000000"],null,[null,null,null,null],["center","center",0],"#,##0.00"],[["Arial Tur",26.0,1,"FFFFFFFF"],null,[null,null,null,null],["center","center",0],"General"],[["Arial Tur",20.0,1,"FFFF0000"],null,[["thick",null],["hair",null],["hair",null],["hair",null]],["center",null,0],"General"],[["Arial Tur",20.0,1,"FFFF0000"],null,[["hair","FF000000"],["thick","FF000000"],["hair","FF000000"],["hair","FF000000"]],["center","center",0],"0.00"],[["Arial Tur",20.0,1,"FFFF0000"],null,[["medium","FF000000"],["medium","FF000000"],null,["medium","FF000000"]],["center","center",0],"General"],[["Arial Tur",20.0,1,"FF000000"],null,[["hair","FF000000"],["thick","FF000000"],["hair","FF000000"],["hair","FF000000"]],["center","center",0],"General"],[["Arial Tur",22.0,1,"FF000000"],"FFFFFFFF",[null,null,null,null],[null,"center",0],"General"],[["Arial Tur",22.0,1,"FF000000"],null,[null,null,null,null],[null,"center",0],"General"],[["Arial Tur",20.0,1,"FF000000"],null,[null,null,null,null],[null,"center",0],"General"],[["Arial Tur",20.0,0,"FF000000"],null,[null,null,null,null],[null,"center",0],"General"],[["Arial Black",22.0,1,"FF000000"],"FFFFFFFF",[["medium",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"#,##0.00"],[["Arial",20.0,1,"FFFF0000"],"FFFFFFFF",[["hair",null],["medium",null],["hair",null],["hair",null]],["center","center",0],"\"₺\"#,##0.00"],[["Arial",20.0,1,"FF000000"],null,[["medium",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"General"],[["Arial",20.0,1,"FFFF0000"],null,[null,null,null,null],["center","center",0],"#,##0.00_ ;\\-#,##0.00\\ "],[["Arial Tur",20.0,1,"FF000000"],null,[["thick",null],["hair",null],["hair",null],["hair",null]],["center",null,0],"General"],[["Arial Tur",20.0,1,"FF000000"],null,[["hair","FF000000"],["thick","FF000000"],["hair","FF000000"],["hair","FF000000"]],["center","center",0],"_-* #,##0.00_-;\\-* #,##0.00_-;_-* \"-\"??_-;_-@_-"],[["Arial Black",20.0,1,"FFFF0000"],null,[["medium","FF000000"],["medium","FF000000"],null,["medium","FF000000"]],["center","center",0],"General"],[["Arial Black",22.0,1,"FF000000"],"FFFFFFFF",[null,null,null,null],["right",null,0],"General"],[["Arial",20.0,1,"FF000000"],"FFFFFFFF",[["medium",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"_-* #,##0.00\\ [$TL-41F]_-;\\-* #,##0.00\\ [$TL-41F]_-;_-* \"-\"??\\ [$TL-41F]_-;_-@_-"],[["Arial",20.0,1,"FF000000"],"FFFFFFFF",[["hair",null],["medium",null],["hair",null],["hair",null]],["center","center",0],"\"₺\"#,##0.00"],[["Arial",20.0,1,"FF000000"],null,[null,null,null,null],["center","center",0],"#,##0.00_ ;\\-#,##0.00\\ "],[["Arial Tur",20.0,1,"FF000000"],null,[["hair","FF000000"],null,["hair","FF000000"],["hair","FF000000"]],["center","center",0],"_-* #,##0.00_-;\\-* #,##0.00_-;_-* \"-\"??_-;_-@_-"],[["Arial Black",20.0,1,"FFFF0000"],null,[["medium","FF000000"],["medium","FF000000"],null,null],["center","center",0],"General"],[["Arial Tur",20.0,1,"FF000000"],null,[["hair","FF000000"],["thick","FF000000"],["hair","FF000000"],null],["center","center",0],"0.00"],[["Arial",20.0,1,"FF000000"],"FFFFFF00",[["medium",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"_-* #,##0.00\\ [$TL-41F]_-;\\-* #,##0.00\\ [$TL-41F]_-;_-* \"-\"??\\ [$TL-41F]_-;_-@_-"],[["Arial Black",20.0,1,"FFFF0000"],"FFFFFF00",[["hair",null],["medium",null],["hair",null],["hair",null]],["center","center",0],"\"₺\"#,##0.00"],[["Arial Black",20.0,1,"FFFF0000"],null,[null,null,null,null],["center","center",0],"#,##0.00_ ;\\-#,##0.00\\ "],[["Arial Black",20.0,1,"FFC00000"],null,[["thin","FF000000"],["thin","FF000000"],["thin","FF000000"],["thin","FF000000"]],["center",null,0],"General"],[["Arial Tur",20.0,1,"FF000000"],null,[["thin","FF000000"],["thin","FF000000"],["thin","FF000000"],["thin","FF000000"]],[null,null,0],"General"],[["Arial Black",22.0,1,"FF000000"],null,[["medium",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"#,##0.00"],[["Calibri",11.0,0,"FF000000"],null,[["medium",null],["hair",null],["hair",null],["medium",null]],["center","center",0],"General"],[["Calibri",11.0,0,"FF000000"],"FFFF0000",[["hair",null],["medium",null],["hair",null],["medium",null]],["center","center",0],"General"],[["Calibri",11.0,0,"FF000000"],null,[null,null,null,null],["center","center",0],"General"],[["Arial Black",20.0,1,"FFFF0000"],null,[["thin",null],["thin",null],["thin",null],null],["center","center",0],"General"],[["Arial Tur",20.0,1,"FFFF0000"],null,[["thin",null],["thin",null],["thin",null],null],["center","center",0],"\"₺\"#,##0.00"],[["Arial Tur",20.0,1,"FF000000"],null,[["thick",null],["hair",null],["hair",null],["thick",null]],[null,null,0],"General"],[["Arial Tur",24.0,1,"FFFF0000"],null,[["hair","FF000000"],["thick","FF000000"],["hair","FF000000"],["thick","FF000000"]],["center","center",0],"_-* #,##0.00_-;\\-* #,##0.00_-;_-* \"-\"??_-;_-@_-"],[["Arial Tur",20.0,1,"FF000000"],null,[null,null,null,null],["center","center",0],"General"],[["Arial",20.0,1,"FFFF0000"],null,[["hair",null],["medium",null],["hair",null],["hair",null]],["center","center",0],"\"₺\"#,##0.00"],[["Arial Tur",22.0,0,"FF000000"],null,[null,null,null,null],["center","center",0],"General"],[["Arial",20.0,1,"FF000000"],"FFFFFFFF",[["medium",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"General"],[["Calibri",20.0,1,"FF000000"],null,[["medium",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"General"],[["Arial",20.0,1,"FFFFFFFF"],"FF000000",[["hair",null],["medium",null],["hair",null],["hair",null]],["center","center",0],"_-* #,##0.00\\ [$TL-41F]_-;\\-* #,##0.00\\ [$TL-41F]_-;_-* \"-\"??\\ [$TL-41F]_-;_-@_-"],[["Arial",20.0,1,"FFFFFFFF"],null,[null,null,null,null],[null,"center",0],"_-* #,##0.00\\ [$TL-41F]_-;\\-* #,##0.00\\ [$TL-41F]_-;_-* \"-\"??\\ [$TL-41F]_-;_-@_-"],[["Calibri",10.0,0,"FF000000"],null,[null,null,null,null],["center","center",0],"General"],[["Calibri",10.0,0,"FF000000"],null,[null,null,null,null],[null,null,0],"General"],[["Arial Tur",36.0,1,"FF000000"],"FFFFFFFF",[null,null,null,null],["center",null,0],"\"₺\"#,##0.00"],[["Calibri",24.0,1,"FFFFFFFF"],"FFFFFFFF",[["medium","FF000000"],["hair","FF000000"],null,null],["center","center",0],"General"],[["Calibri",24.0,1,"FFFFFFFF"],"FFFFFFFF",[null,null,null,null],["center","center",0],"General"],[["Calibri",30.0,1,"FFFFFFFF"],"FF000000",[["thick",null],["hair",null],["thick",null],["hair",null]],["center","center",0],"General"],[["Calibri",30.0,1,"FFFFFFFF"],"FF000000",[["hair",null],["hair",null],["thick",null],["hair",null]],["center","center",0],"General"],[["Arial Tur",30.0,1,"FFFFFFFF"],"FF000000",[["hair",null],["hair",null],["thick",null],["hair",null]],["center","center",0],"General"],[["Arial Tur",30.0,1,"FFFFFFFF"],"FF000000",[["hair",null],null,["thick",null],["hair",null]],["center","center",0],"General"],[["Arial Tur",36.0,1,"FFFF0000"],"FFFFFFFF",[["medium","FF000000"],["medium","FF000000"],["medium","FF000000"],["medium","FF000000"]],["right","center",0],"General"],[["Calibri",30.0,1,"FFFFFFFF"],"FFFFFFFF",[null,null,null,null],["center","center",0],"General"],[["Calibri",30.0,1,"FF000000"],"FFFFFFFF",[null,null,null,null],["center","center",0],"General"],[["Calibri gövde",30.0,1,"FF000000"],"FFFFFF00",[["thick","FF000000"],["thin","FF000000"],["thin","FF000000"],["thin","FF000000"]],["center","center",0],"General"],[["Arial Black",20.0,1,"FF0070C0"],"FFFFFF00",[["thin","FF000000"],["thick","FF000000"],["thick","FF000000"],["thin","FF000000"]],["center",null,0],"\"₺\"#,##0.00"],[["Arial Black",24.0,1,"FF000000"],"FFFFFF00",[["thick",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"General"],[["Calibri",24.0,1,"FF000000"],null,[["hair",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"\"₺\"#,##0.00"],[["Calibri",24.0,1,"FF000000"],"FFFFFF00",[["hair",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"\"₺\"#,##0.00"],[["Arial Tur",26.0,1,"FF000000"],null,[["hair",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"\"₺\"#,##0.00"],[["Arial Tur",26.0,1,"FF000000"],"FFFFFFFF",[["hair",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"\"₺\"#,##0.00"],[["Arial Tur",26.0,1,"FF000000"],"FFFFFFFF",[["hair","FF000000"],null,["hair","FF000000"],["hair","FF000000"]],["center","center",0],"\"₺\"#,##0.00"],[["Arial Tur",36.0,1,"FFFF0000"],null,[["medium","FF000000"],["medium","FF000000"],["medium","FF000000"],["thin",null]],["center",null,0],"0.00"],[["Arial Tur",26.0,1,"FF000000"],"FFFFFFFF",[null,null,null,null],["center","center",0],"\"₺\"#,##0.00"],[["Arial Black",20.0,1,"FF0070C0"],"FFFFFF00",[["thin","FF000000"],["thick","FF000000"],["thin","FF000000"],["thin","FF000000"]],["center",null,0],"\"₺\"#,##0.00"],[["Arial Black",24.0,1,"FF000000"],"FFFFFF00",[["thick","FF000000"],["thin","FF000000"],["thin","FF000000"],["thin","FF000000"]],["center","center",0],"General"],[["Arial Tur",36.0,1,"FFFF0000"],null,[["medium","FF000000"],["medium","FF000000"],null,["thin",null]],["center",null,0],"0.00"],[["Arial Tur",36.0,1,"FFFF0000"],null,[["medium","FF000000"],["medium","FF000000"],null,["medium","FF000000"]],["center",null,0],"0.00"],[["Calibri gövde",30.0,1,"FFFFFFFF"],"FF000000",[["thick","FF000000"],["thin","FF000000"],["thin","FF000000"],["thin","FF000000"]],["left","center",0],"General"],[["Arial Black",20.0,1,"FFFF0000"],"FF9BBB59",[["thin","FF000000"],["thick","FF000000"],["thin","FF000000"],["thin","FF000000"]],["center",null,0],"\"₺\"#,##0.00"],[["Calibri",24.0,1,"FF000000"],"FFFFFFFF",[["hair",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"\"₺\"#,##0.00"],[["Arial Tur",26.0,1,"FF000000"],"FFFFFFFF",[["hair","FF000000"],["thick","FF000000"],["hair","FF000000"],["hair","FF000000"]],["center","center",0],"\"₺\"#,##0.00"],[["Arial Black",20.0,1,"FFFFFFFF"],"FFFFFF00",[["thick",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"_-* #,##0.00\\ [$TL-41F]_-;\\-* #,##0.00\\ [$TL-41F]_-;_-* \"-\"??\\ [$TL-41F]_-;_-@_-"],[["Calibri",24.0,1,"FFFFFFFF"],"FFFFFFFF",[["hair",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"\"₺\"#,##0.00"],[["Arial Tur",26.0,1,"FFFFFFFF"],"FFFFFFFF",[["hair",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"\"₺\"#,##0.00"],[["Arial Tur",26.0,1,"FFFFFFFF"],"FFFFFFFF",[["hair","FF000000"],["thick","FF000000"],["hair","FF000000"],["hair","FF000000"]],["center","center",0],"\"₺\"#,##0.00"],[["Arial Black",20.0,1,"FF0070C0"],"FFFFFF00",[["thick",null],["hair",null],["hair",null],["hair",null]],["center",null,0],"_-* #,##0.00\\ [$TL-41F]_-;\\-* #,##0.00\\ [$TL-41F]_-;_-* \"-\"??\\ [$TL-41F]_-;_-@_-"],[["Arial Black",20.0,1,"FFFF0000"],"FFF79646",[["thin","FF000000"],["thick","FF000000"],["thin","FF000000"],["thin","FF000000"]],["center",null,0],"\"₺\"#,##0.00"],[["Arial Tur",26.0,1,"FF000000"],"FFFFFFFF",[null,null,null,null],["center","center",0],"General"],[["Calibri gövde",30.0,1,"FFFFFFFF"],"FF000000",[["thick","FF000000"],["thin","FF000000"],["thin","FF000000"],null],["left","center",0],"General"],[["Arial Black",20.0,1,"FF002060"],"FFFFFFFF",[["thin","FF000000"],["thick","FF000000"],["thin","FF000000"],null],["center",null,0],"_-* #,##0.00\\ [$TL-41F]_-;\\-* #,##0.00\\ [$TL-41F]_-;_-* \"-\"??\\ [$TL-41F]_-;_-@_-"],[["Arial Black",20.0,1,"FF0070C0"],"FFFFFF00",[["thick",null],["hair",null],["hair",null],["thick",null]],["center",null,0],"_-* #,##0.00\\ [$TL-41F]_-;\\-* #,##0.00\\ [$TL-41F]_-;_-* \"-\"??\\ [$TL-41F]_-;_-@_-"],[["Calibri",24.0,1,"FF000000"],null,[["hair",null],["hair",null],["hair",null],["thick",null]],["center","center",0],"\"₺\"#,##0.00"],[["Calibri",24.0,1,"FF000000"],null,[["hair","FF000000"],["thick","FF000000"],["hair","FF000000"],["thick","FF000000"]],["center","center",0],"\"₺\"#,##0.00"],[["Calibri",28.0,1,"FFFFFFFF"],"FF000000",[null,["thin","FF000000"],null,null],["left",null,0],"General"],[["Arial Black",20.0,1,"FF002060"],"FFFFFFFF",[["thin","FF000000"],null,null,null],["center",null,0],"_-* #,##0.00\\ [$TL-41F]_-;\\-* #,##0.00\\ [$TL-41F]_-;_-* \"-\"??\\ [$TL-41F]_-;_-@_-"],[["Arial Black",20.0,1,"FF0070C0"],"FFFFFF00",[["thick","FF000000"],null,null,null],["center",null,0],"_-* #,##0.00\\ [$TL-41F]_-;\\-* #,##0.00\\ [$TL-41F]_-;_-* \"-\"??\\ [$TL-41F]_-;_-@_-"],[["Calibri",24.0,1,"FF000000"],null,[null,null,null,null],["center","center",0],"\"₺\"#,##0.00"],[["Calibri",24.0,1,"FFFF0000"],"FFFFFF00",[null,null,null,null],["center","center",0],"\"₺\"#,##0.00"],[["Calibri",11.0,0,"FF000000"],"FFFFFFFF",[["thick","FF000000"],null,null,["thin","FF000000"]],[null,"center",0],"General"],[["Arial Black",28.0,1,"FF000000"],"FFFFFFFF",[["thick",null],["hair",null],["thick",null],["hair",null]],["center","center",0],"#,##0.00"],[["Arial Black",28.0,1,"FF000000"],"FFFFFFFF",[["hair",null],["hair",null],["thick",null],["hair",null]],["center","center",0],"General"],[["Arial Black",28.0,1,"FF000000"],"FFFFFFFF",[["hair",null],["thick",null],["thick",null],["hair",null]],["center","center",1],"General"],[["Arial Tur",36.0,1,"FFFF0000"],"FFFFFFFF",[null,["medium","FF000000"],["medium","FF000000"],null],["center","center",0],"General"],[["Calibri",11.0,0,"FF000000"],"FFFFFFFF",[null,null,null,null],[null,null,0],"General"],[["Arial Black",22.0,1,"FF000000"],"FFFFFFFF",[["thick","FF000000"],null,["thin","FF000000"],["thin","FF000000"]],["center","center",0],"General"],[["Arial Black",28.0,1,"FF000000"],"FFFFFFFF",[["thick",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"#,##0.00"],[["Arial Black",22.0,1,"FF000000"],"FFFFFFFF",[["hair",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"\"₺\"#,##0.00"],[["Arial Black",28.0,0,"FFFF0000"],"FFFFFFFF",[["hair","FF000000"],["thick","FF000000"],["hair","FF000000"],["hair","FF000000"]],["center","center",1],"\"₺\"#,##0.00"],[["Arial Tur",28.0,1,"FF000000"],"FFFFFFFF",[["thin","FF000000"],["thin","FF000000"],["thin","FF000000"],["thin","FF000000"]],["center","center",0],"\"₺\"#,##0.00"],[["Arial Black",20.0,1,"FF000000"],"FFFFFFFF",[["thick","FF000000"],null,["thin","FF000000"],["thick","FF000000"]],["center","center",1],"General"],[["Calibri",11.0,0,"FFFFFFFF"],"FFFFFFFF",[null,null,null,null],[null,null,0],"General"],[["Calibri",28.0,1,"FF000000"],"FFFFFFFF",[["thin","FF000000"],["thin","FF000000"],["thin","FF000000"],["thin","FF000000"]],["center","center",0],"\"₺\"#,##0.00"],[["Arial Tur",20.0,1,"FFFFFFFF"],"FFFFFFFF",[null,null,null,null],[null,null,0],"General"],[["Arial Black",28.0,1,"FF000000"],"FFFFFFFF",[["hair",null],["hair",null],["hair",null],["hair",null]],["center","center",0],"\"₺\"#,##0.00"],[["Arial Black",28.0,1,"FF000000"],"FFFFFFFF",[["thick",null],["hair",null],["hair",null],["thick",null]],["center","center",0],"#,##0.00"],[["Arial Black",28.0,1,"FF000000"],"FFFFFFFF",[["hair",null],["hair",null],["hair",null],["thick",null]],["center","center",0],"\"₺\"#,##0.00"],[["Arial Black",28.0,0,"FFFF0000"],"FFFFFFFF",[["hair","FF000000"],["thick","FF000000"],["hair","FF000000"],["thick","FF000000"]],["center","center",1],"\"₺\"#,##0.00"],[["Calibri",28.0,1,"FFFF0000"],"FFFFFFFF",[["thin","FF000000"],["thin","FF000000"],["thin","FF000000"],["thin","FF000000"]],["center","center",0],"General"]],"R":[[0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,1,1,1,1,1,1,1,1,1],[3,4,4,4,4,4,5,6,5,5,7,7,8,9,10,11,11,11,11,11,12,12,12,1,1],[13,14,14,14,14,14,14,14,14,14,15,16,17,18,19,20,20,11,11,11,12,12,12,1,1],[13,14,14,14,14,14,14,14,14,14,15,16,17,18,19,20,20,11,11,11,12,12,12,1,1],[13,14,14,14,14,14,14,14,14,14,15,16,17,18,19,20,20,11,11,11,12,12,12,1,1],[13,14,14,14,14,14,14,14,14,14,15,16,17,18,19,20,20,11,11,11,12,12,12,1,1],[13,14,14,14,14,14,14,14,14,14,15,16,17,18,19,20,20,11,11,11,12,12,12,1,1],[13,14,14,14,14,14,14,14,14,14,15,16,17,18,19,20,20,11,11,11,12,12,12,1,1],[13,14,14,14,14,14,14,14,14,14,15,16,17,18,19,20,20,11,11,11,12,12,12,1,1],[13,14,14,14,14,14,14,14,14,14,15,16,17,18,19,20,20,11,11,11,12,12,12,1,1],[13,14,14,14,14,14,14,14,14,14,15,16,17,18,19,20,20,11,11,11,12,12,12,1,1],[13,14,14,14,14,14,14,14,14,14,15,16,17,18,19,20,20,11,11,11,12,12,12,1,1],[13,14,14,14,14,14,14,14,14,14,15,16,17,18,19,20,20,11,11,11,12,12,12,1,1],[13,14,14,14,14,14,14,14,14,14,15,16,17,18,19,20,20,11,11,11,12,12,12,1,1],[13,14,14,14,14,14,14,14,14,14,15,16,17,18,19,20,20,11,11,11,12,12,12,1,1],[13,14,14,14,14,14,14,14,14,14,15,16,17,18,19,20,20,11,11,11,12,12,12,1,1],[13,14,14,14,14,14,14,14,14,14,15,16,17,18,19,20,20,11,11,11,12,12,12,1,1],[13,14,14,14,14,14,14,14,14,14,15,16,17,18,19,20,20,11,11,11,12,12,12,1,1],[13,14,14,14,14,14,14,14,14,14,15,16,17,18,19,20,20,11,11,11,12,12,12,1,1],[21,22,23,23,23,23,23,23,23,23,23,23,24,25,26,20,20,1,1,1,12,12,1,1,1],[27,28,28,28,29,30,30,30,30,31,32,33,34,1,1,2,26,20,20,1,1,1,1,1,1],[35,36,35,36,37,11,11,11,38,39,40,41,42,11,11,43,44,45,45,45,45,45,46,46,46],[47,48,49,48,50,11,11,11,38,51,52,53,42,11,11,54,1,1,1,1,1,1,1,1,1],[47,48,55,56,57,11,11,11,11,51,52,53,42,11,11,54,1,1,1,1,1,1,1,1,1],[47,48,55,48,50,11,11,11,11,51,58,59,60,11,11,54,1,1,1,1,1,1,1,1,1],[47,48,61,62,63,11,11,11,11,51,58,64,65,11,11,54,1,1,1,1,1,1,1,1,1],[66,48,67,68,69,11,11,11,11,51,52,70,71,11,11,54,1,1,1,1,1,1,1,1,1],[66,48,69,69,69,11,11,11,11,72,73,11,11,11,11,54,1,1,1,1,1,1,1,1,1],[66,48,69,69,69,11,11,11,11,11,74,11,11,11,11,54,1,1,1,1,1,1,1,1,1],[49,75,76,69,69,1,1,1,11,11,11,11,11,11,11,54,1,1,1,1,1,1,1,1,1],[77,75,76,69,69,1,1,1,11,11,11,11,11,11,11,54,1,1,1,1,1,1,1,1,1],[49,48,69,69,69,1,1,1,11,11,11,11,11,11,11,54,1,1,1,1,1,1,1,1,1],[78,79,80,81,81,81,82,82,11,83,83,83,83,83,11,54,1,1,1,1,1,1,1,1,1],[84,85,86,87,88,88,88,89,90,91,91,91,91,92,11,54,1,1,1,1,1,1,1,1,1],[93,94,95,96,97,98,99,100,101,102,102,102,102,102,11,54,1,1,1,1,1,1,1,1,1],[93,103,104,96,97,98,99,100,105,102,102,102,102,102,11,54,1,1,1,1,1,1,1,1,1],[93,103,95,96,97,98,99,100,105,102,102,102,102,102,11,54,1,1,1,1,1,1,1,1,1],[95,103,95,96,97,98,99,100,105,102,102,102,102,102,11,1,1,1,1,1,1,1,1,1,1],[95,103,95,96,97,98,99,100,105,102,102,102,102,102,11,1,1,1,1,1,1,1,1,1,1],[95,103,95,96,97,98,99,100,106,102,102,102,102,102,11,1,1,1,1,1,1,1,1,1,1],[107,108,95,96,109,98,99,110,11,20,20,20,20,20,11,1,1,1,1,1,1,1,1,1,1],[107,108,111,112,112,113,113,114,11,20,20,20,20,20,11,1,1,1,1,1,1,1,1,1,1],[107,108,111,112,112,113,113,114,11,11,11,11,11,11,11,1,1,1,1,1,1,1,1,1,1],[107,108,115,96,96,98,99,110,11,11,11,11,11,11,11,1,1,1,1,1,1,1,1,1,1],[107,108,115,96,96,98,99,110,11,11,11,11,11,11,11,1,1,1,1,1,1,1,1,1,1],[107,108,115,96,96,98,99,110,11,11,11,11,11,11,11,1,1,1,1,1,1,1,1,1,1],[107,116,115,96,96,98,99,110,11,11,11,11,11,11,11,1,1,1,1,1,1,1,1,1,1],[107,116,115,96,96,98,99,110,117,11,11,11,11,11,11,1,1,1,1,1,1,1,1,1,1],[107,116,115,96,96,98,99,110,117,11,11,11,11,11,11,1,1,1,1,1,1,1,1,1,1],[107,116,115,96,96,98,99,110,117,11,11,11,11,11,11,1,1,1,1,1,1,1,1,1,1],[107,116,115,96,96,98,99,110,117,11,11,11,11,11,11,1,1,1,1,1,1,1,1,1,1],[118,119,120,121,121,121,121,122,117,20,20,20,20,11,11,1,1,1,1,1,1,1,1,1,1],[123,124,125,126,127,126,126,126,117,20,20,20,20,11,11,1,1,1,1,1,1,1,1,1,1],[128,129,130,130,130,131,132,20,20,20,133,133,133,20,11,1,1,1,1,1,1,1,1,1,1],[134,135,136,136,136,137,138,20,20,20,1,1,1,20,20,133,133,133,133,133,133,133,133,133,133],[134,135,136,136,136,137,138,20,20,20,1,1,1,20,20,133,133,133,133,133,133,133,133,133,133],[134,135,136,136,136,137,138,20,20,20,1,1,1,20,20,133,133,133,133,133,133,133,133,133,133],[139,135,136,136,136,137,138,20,20,20,1,1,1,20,20,133,133,133,133,133,133,133,133,133,133],[140,135,136,136,136,137,141,140,142,142,140,140,140,142,20,133,133,133,133,133,133,133,133,133,133],[140,135,143,143,143,137,141,140,142,142,1,1,1,142,142,140,140,140,140,140,140,140,140,140,140],[140,144,145,145,145,146,147,140,142,142,1,1,1,142,142,140,140,140,140,140,140,140,140,140,140]],"H":[66.75,52.5,45.75,42.0,41.25,41.25,39.0,41.25,41.25,41.25,41.25,41.25,41.25,41.25,41.25,35.25,41.25,41.25,41.25,52.5,90.75,48.0,45.75,45.75,45.75,45.75,45.75,45.75,45.75,45.75,45.75,45.75,45.75,45.75,78.95,78.95,78.95,78.95,78.95,78.95,78.95,63.95,63.95,63.95,63.95,63.75,63.95,63.95,63.95,63.95,63.95,63.95,63.95,78.75,107.25,105.0,105.0,105.0,105.0,105.0,105.0],"W":[63.86,41,50.43,35.43,35.86,47.29,49,43,37.14,45.43,41.14,41.14,37,44.86,26.43,21.86,15.14,8.86,8.86,8.86,8.86,8.86,8.86,8.86,8.86]};
let __exjs = null;
const loadExcelJS = () => __exjs || (__exjs = new Promise((res, rej) => {
  if (window.ExcelJS) return res(window.ExcelJS);
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
  s.onload = () => window.ExcelJS ? res(window.ExcelJS) : rej(new Error('ExcelJS yok'));
  s.onerror = () => { __exjs = null; rej(new Error('ExcelJS yüklenemedi')); };
  document.head.appendChild(s);
}));
async function kasaStyledXlsx(wsObj, sheetName, fileName) {
  const EJ = await loadExcelJS();
  const K = KSTYLE;
  const wb = new EJ.Workbook();
  const ws = wb.addWorksheet(sheetName, {
    views: [{ zoomScale: 40, zoomScaleNormal: 40 }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
  });
  ws.properties.defaultRowHeight = 39.75;
  K.W.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  K.H.forEach((h, i) => { ws.getRow(i + 1).height = h; });
  for (let r = 0; r < K.R.length; r++) for (let c = 0; c < K.R[r].length; c++) {
    const st = K.S[K.R[r][c]], cell = ws.getCell(r + 1, c + 1);
    const fo = st[0], fl = st[1], bd = st[2], al = st[3], nf = st[4];
    cell.font = { name: fo[0], size: fo[1], bold: !!fo[2], color: { argb: fo[3] } };
    if (fl) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fl }, bgColor: { argb: fl } };
    const b = {};
    ['left', 'right', 'top', 'bottom'].forEach((k, i) => { if (bd[i]) b[k] = { style: bd[i][0], color: { argb: bd[i][1] } }; });
    if (Object.keys(b).length) cell.border = b;
    const a = {}; if (al[0]) a.horizontal = al[0]; if (al[1]) a.vertical = al[1]; if (al[2]) a.wrapText = true;
    if (Object.keys(a).length) cell.alignment = a;
    if (nf && nf !== 'General') cell.numFmt = nf;
  }
  Object.keys(wsObj).forEach(a => {
    if (a[0] === '!') return;
    const c = wsObj[a], cell = ws.getCell(a);
    cell.value = c.f ? { formula: c.f, result: c.v } : c.v;
  });
  (wsObj['!merges'] || []).forEach(m => ws.mergeCells(m.s.r + 1, m.s.c + 1, m.e.r + 1, m.e.c + 1));
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const l = document.createElement('a');
  l.href = URL.createObjectURL(blob); l.download = fileName; document.body.appendChild(l); l.click();
  setTimeout(() => { URL.revokeObjectURL(l.href); l.remove(); }, 4000);
}
// ===== Excel'den aktar: aylık kasa föyü (1, 2, 3 … 31 sayfaları) → uygulamaya günlük kasa kayıtları =====
const KIMP_EX = { '1427-52870738': 41, '1128-57307617': 42, '0988-10043049': 43, '2D10008634': 44, '2D10008641': 45, 'PS9481-57307617': 47, 'PS0275-10043049': 48, 'PS4861-2D10008634': 49, 'PS4860-2D10008641': 50 };
function kasaParseSheet(ws) {
  zApplyBranch();
  const gv = a => { const c = ws[a]; return c && c.v !== undefined ? c.v : undefined; };
  const nv = a => { const v = gv(a); const n = typeof v === 'number' ? v : zNum(v); return isFinite(n) ? Math.round(n * 100) / 100 : 0; };
  const LET = 'BCDEFGHIJ', garson = [];
  for (let r = 3; r <= 19; r++) {
    const name = String(gv('A' + r) == null ? '' : gv('A' + r)).trim();
    const row = { name };
    ZG_COLS.forEach((c, i) => { row[c] = nv(LET[i] + r); });
    row.ciro = nv('L' + r); row.check = Math.round(nv('N' + r));
    if (ZG_COLS.some(c => row[c]) || row.ciro || row.check) garson.push(row);
  }
  const main = {};
  ZPOS_MAIN.forEach((p, idx) => {
    const r = 35 + idx, o = { pk: nv('B' + r), n: nv('D' + r), k: nv('E' + r), qr: nv('F' + r), kf: nv('G' + r), nf: nv('H' + r) };
    if (o.pk || o.n || o.k || o.qr || o.kf || o.nf) main[p.id] = o;
  });
  const extra = {};
  Object.keys(KIMP_EX).forEach(lab => { const v = nv('B' + KIMP_EX[lab]); if (v) extra[lab] = v; });
  const yemek = {};
  ZPOS_YEMEK.forEach((name, i) => { const r = 55 + i, o = { a: nv('C' + r), b: nv('D' + r), c: nv('E' + r) }; if (o.a || o.b || o.c) yemek[name] = o; });
  const has = garson.length || Object.keys(main).length || Object.keys(extra).length || Object.keys(yemek).length;
  return has ? { main, extra, yemek, garson } : null;
}
window.zPosClearFrom = () => {
  const cur = ZPOS.ym === zYmNow();
  ask('🧹 ' + (BR[B] || '') + ' · ' + ZPOS.ym.slice(4) + '/' + ZPOS.ym.slice(0, 4) + ' kasa kayıtlarını temizle', [{ label: 'Şu günden itibaren (dahil) tüm günleri sil', val: cur ? String(Math.min(31, zDayNow())) : '16' }], async v => {
    const d = parseInt(v[0], 10); if (!(d >= 1 && d <= 31)) { msg('Gün 1-31 olmalı'); return; }
    if (!confirm((BR[B] || '') + ' · ' + d + '. gün ve sonrası (' + d + '–31) kasa kayıtları KALICI olarak silinecek. Emin misin?')) return;
    try { const r = await gs('clearZPosFrom', B, ZPOS.ym, d, PIN); ZPOS.days = (await gs('getZPos', B, ZPOS.ym, PIN)) || {}; ZPOS.dirty = false; zPosRtSync(); zPosRender(); msg('✓ ' + ((r && r.deleted) || 0) + ' günün kaydı silindi'); } catch (e) { msg(emsg(e)); }
  }, 'Sil');
};
window.zPosImportPick = () => {
  const i = document.createElement('input'); i.type = 'file'; i.accept = '.xlsx,.xls';
  i.onchange = () => { if (i.files && i.files[0]) zPosImportFile(i.files[0]); };
  i.click();
};
window.zPosImportFile = async file => {
  try {
    if (typeof XLSX === 'undefined') { msg('Excel kütüphanesi yok'); return; }
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const days = {};
    wb.SheetNames.forEach(n => {
      const d = /^\d{1,2}$/.test(String(n).trim()) ? +n : 0;
      if (d < 1 || d > 31) return;
      const o = kasaParseSheet(wb.Sheets[n]); if (o) days[d] = o;
    });
    const list = Object.keys(days).map(Number).sort((a, b) => a - b);
    if (!list.length) { msg('Bu dosyada günlük kasa sayfası (1, 2, 3 …) bulunamadı'); return; }
    // ay: sayfanın başlığından (KASIM 2026); yoksa ekrandaki ay
    const MONR = { 'OCAK': '01', 'ŞUBAT': '02', 'MART': '03', 'NİSAN': '04', 'MAYIS': '05', 'HAZİRAN': '06', 'TEMMUZ': '07', 'AĞUSTOS': '08', 'EYLÜL': '09', 'EKİM': '10', 'KASIM': '11', 'ARALIK': '12' };
    const first = wb.Sheets[String(list[0])], t = String(first && first.A1 ? first.A1.v : '').toLocaleUpperCase('tr');
    let ym = ZPOS.ym;
    const mm = t.match(/(OCAK|ŞUBAT|MART|NİSAN|MAYIS|HAZİRAN|TEMMUZ|AĞUSTOS|EYLÜL|EKİM|KASIM|ARALIK)\s+(\d{4})/);
    if (mm) ym = mm[2] + MONR[mm[1]];
    const brOk = !t || (B == 'opt' ? !/MAV[İI]/.test(t) : !/OPT[İI]MUM/.test(t));
    if (!brOk) { msg('Bu dosya başka şubeye ait görünüyor (' + (BR[B] || B) + ' ekranındasın).'); return; }
    const mx = list[list.length - 1], cur = ym === zYmNow();
    const defEnd = cur ? Math.max(1, Math.min(mx, zDayNow() - 1)) : mx;
    ask('📥 ' + (BR[B] || '') + ' · ' + ym.slice(4) + '/' + ym.slice(0, 4) + '\nDosyada ' + list.length + ' gün var (' + list[0] + '–' + mx + '). Hangi günler aktarılsın?', [
      { label: 'Başlangıç günü', val: String(list[0]) },
      { label: 'Bitiş günü (dahil)', val: String(defEnd) },
      { label: 'Uygulamadaki kasaları şu günden itibaren (dahil) SİL — boş bırak = silme', val: cur && defEnd < 31 ? String(defEnd + 1) : '' }
    ], async v => {
      try {
        const a1 = Math.max(1, parseInt(v[0], 10) || list[0]), b1 = Math.min(31, parseInt(v[1], 10) || mx), cl = parseInt(v[2], 10) || 0;
        const pick = list.filter(d => d >= a1 && d <= b1);
        if (!pick.length && !cl) { msg('Seçtiğin aralıkta gün yok'); return; }
        const rng = pick.length ? (pick.length == 1 ? pick[0] + '. gün' : pick[0] + '–' + pick[pick.length - 1] + '. günler (' + pick.length + ' gün)') : '—';
        if (!confirm((BR[B] || '') + ' · ' + ym.slice(4) + '/' + ym.slice(0, 4) + '\n\nAktarılacak: ' + rng + (cl ? '\nSİLİNECEK: ' + cl + '. gün ve sonrası (' + cl + '–31) uygulamadaki kasa kayıtları' : '') + '\n\nAynı günde kayıt varsa üzerine yazılır. Devam?')) return;
        let ok = 0;
        for (const d of pick) { await gs('setZPos', B, ym, d, Object.assign({ force: true }, days[d]), PIN); ok++; msg('Aktarılıyor… ' + ok + '/' + pick.length); }
        let del = 0; if (cl) { const r = await gs('clearZPosFrom', B, ym, cl, PIN); del = (r && r.deleted) || 0; }
        ZPOS.ym = ym; if (pick.length && pick.indexOf(ZPOS.day) < 0 && ZPOS.ym !== zYmNow()) ZPOS.day = pick[0];
        ZPOS.days = (await gs('getZPos', B, ZPOS.ym, PIN)) || {}; ZPOS.dirty = false; zPosRtSync();
        zPosRender();
        msg('✓ ' + ok + ' gün aktarıldı' + (cl ? ' · ' + del + ' günün kaydı silindi (' + cl + '. gün ve sonrası)' : ''));
      } catch (e) { msg('Aktarma hatası: ' + (e.message || e)); }
    }, 'Devam');
  } catch (e) { msg('Aktarma hatası: ' + (e.message || e)); }
};
window.zPosXls = async () => {
  zSyncGarson();
  // TEK GÜN: seçili günün sayfası · şablonla aynı hücre adresleri; sadece girilen değerler yazılır, formül/toplam/fark hücreleri boş
  const ym = ZPOS.ym, y = ym.slice(0, 4), m = ym.slice(4);
  const maxD = new Date(+y, +m, 0).getDate();
  const days = ZPOS.days || {};
  const brName = (typeof BR !== 'undefined' && BR[B]) ? BR[B] : B;
  const MON = { '01': 'OCAK', '02': 'ŞUBAT', '03': 'MART', '04': 'NİSAN', '05': 'MAYIS', '06': 'HAZİRAN', '07': 'TEMMUZ', '08': 'AĞUSTOS', '09': 'EYLÜL', '10': 'EKİM', '11': 'KASIM', '12': 'ARALIK' };
  const dayData = d => {
    const raw = days[String(d)] || {};
    return { main: raw.main || {}, extra: raw.extra || {}, yemek: raw.yemek || {}, garson: (Array.isArray(raw.garson) ? raw.garson : []).map(g => { if (!g || !g.name) return g; const k = zResolveG(g.name), hit = ZPOS_GARSON_DEFAULT.find(n => zNormN(n) === k); return hit ? Object.assign({}, g, { name: hit }) : g; }).filter(g => !(g && g.name && B === 'mavi' && !ZPOS_GARSON_DEFAULT.some(n => zNormN(n) === zNormN(g.name)) && !zGHas(g))) };
  };
  const norm = s => String(s || '').toLocaleUpperCase('tr').replace(/İ/g, 'I').replace(/\s+/g, ' ').trim();
  const defSet = {}; ZPOS_GARSON_DEFAULT.forEach(n => { defSet[norm(n)] = 1; });
  const extraOrder = [];   // listede olmayan (yeni) personel: ilk göründüğü sıraya göre, hep en altta
  for (let d0 = 1; d0 <= maxD; d0++) dayData(d0).garson.forEach(g => { const k = norm(g && g.name); if (k && !defSet[k] && extraOrder.indexOf(k) < 0) extraOrder.push(k); });
  const N = v => Number(v) || 0;
  const LET = 'BCDEFGHIJ';
  // Şablondaki ek satır etiketleri ve satır numaraları
  const EXROW = { '1427-52870738': [41, '1427-52870738'], '1128-57307617': [42, '1128- 57307617'], '0988-10043049': [43, '0988-10043049'], '2D10008634': [44, '2D10008634'], '2D10008641': [45, '2D10008641'],
    'PS9481-57307617': [47, 'PS9481-57307617'], 'PS0275-10043049': [48, 'PS0275-10043049'], 'PS4861-2D10008634': [49, 'PS4861-2D10008634'], 'PS4860-2D10008641': [50, 'PS4860-2D10008641'] };
  const FARK_ROW = { 35: [41], 36: [42, 47], 37: [43, 48], 38: [44, 49], 39: [45, 50], 40: [46, 51] };
  const build = d => {
    const dd = dayData(d), ws = {};
    const S = (a, v) => { ws[a] = { t: 's', v: String(v) }; };
    const V = (a, v) => { ws[a] = { t: 'n', v: v }; };
    // Şablondaki formüller aynen yazılır (kopyala-yapıştırda ana dosyadaki formüller korunur). D23 (Z raporu ciro) elle yazılır: BOŞ bırakılır.
    const F = (a, f, v) => { if (a === 'D23') return; ws[a] = { t: 'n', f: f, v: Math.round((v || 0) * 100) / 100 }; };
    S('A1', 'İZMİR ' + String(brName).toLocaleUpperCase('tr') + '  ŞUBESİ ' + (MON[m] || m) + ' ' + y + '  GÜNSONU KASA RAPORU');
    ['GARSON', 'TİCKET', 'SODEXHO', 'MULTİNET', 'METROPOL', 'SETCARD', 'TOKEN FLEX', 'K.K', 'NAKİT', 'HEDİYE ÇEKİ', 'TOPLAM', 'CİRO', 'FARK', 'CHEK SAYISI'].forEach((h, i) => S('ABCDEFGHIJKLMN'[i] + '2', h));
    // ---- Garson satırları 3..19
    const byName = {}; dd.garson.forEach(g => { byName[norm(g.name)] = g; });
    const order = [];
    ZPOS_GARSON_DEFAULT.forEach(n => { const g = byName[norm(n)]; order.push(g ? Object.assign({}, g, { name: n }) : { name: n }); delete byName[norm(n)]; });
    Object.keys(byName).sort((a, b) => { const ia = extraOrder.indexOf(a), ib = extraOrder.indexOf(b); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); }).forEach(k => order.push(byName[k]));
    const ct = { ticket: 0, sodexho: 0, multinet: 0, metropol: 0, setcard: 0, token: 0, kk: 0, nakit: 0, hediye: 0, toplam: 0, ciro: 0, check: 0 };
    for (let i = 0; i < 17; i++) {
      const g = order[i] || { name: '' }, r = 3 + i;
      const named = !!String(g.name || '').trim();
      if (named) S('A' + r, g.name);
      let sum = 0;
      ZG_COLS.forEach((c, ci) => { const v = N(g[c]); ct[c] += v; if (c !== 'hediye') sum += v; if (named || v) V(LET[ci] + r, v); });
      const ciro = N(g.ciro), chk = N(g.check);
      ct.toplam += sum; ct.ciro += ciro; ct.check += chk;
      F('K' + r, 'SUM(B' + r + ':I' + r + ')', sum);
      V('L' + r, ciro);
      F('M' + r, 'K' + r + '-L' + r, sum - ciro);
      if (named || chk) V('N' + r, chk);
    }
    S('A20', 'TOPLAM');
    ZG_COLS.forEach((c, ci) => F(LET[ci] + '20', 'SUM(' + LET[ci] + '3:' + LET[ci] + '19)', ct[c]));
    F('K20', 'SUM(K3:K19)', ct.toplam); F('L20', 'SUM(L3:L19)', ct.ciro); F('M20', 'K20-L20', ct.toplam - ct.ciro); F('N20', 'SUM(N3:N19)', ct.check);
    // ---- POS toplamları (değerler)
    let tPkRaw = 0, tN = 0, tK = 0, tQr = 0, tKf = 0, tNf = 0, kf5 = 0;
    ZPOS_MAIN.forEach((p, idx) => {
      const v = dd.main[p.id] || {};
      tPkRaw += N(v.pk); tN += N(v.n); tK += N(v.k); tQr += N(v.qr); tKf += N(v.kf); tNf += N(v.nf); if (idx < 5) kf5 += N(v.kf);
    });
    let exSum = 0; ZPOS_EXTRA.forEach(lab => { exSum += N(dd.extra[lab]); });
    const tPk = tPkRaw + exSum + tQr;
    let yGrand = 0; const yRows = {};
    ZPOS_YEMEK.forEach(name => { const v = dd.yemek[name] || {}; const s = N(v.a) + N(v.b) + N(v.c); yRows[name] = s; yGrand += s; });
    const top = yGrand + tK + ct.nakit + ct.hediye;
    // ---- Özet 21..33
    S('A21', 'ÖZET KASA RAPORU'); S('L21', 'KART HARCAMA');
    S('A22', 'TÜRÜ'); S('B22', 'TUTAR'); S('C22', 'KASA'); S('D22', 'TUTAR'); S('J22', 'EKMEK GEVREK'); S('L22', 'ÜRÜN'); S('M22', 'TOPLAM');
    S('A23', 'YEMEK KARTLARI'); F('B23', 'F61', yGrand); S('C23', 'CİRO'); F('D23', 'L20', ct.ciro); S('J23', 'CİRO'); F('K23', 'D23', ct.ciro); S('L23', 'SİMİT');
    S('A24', 'KREDİ KARTI'); F('B24', 'E52', tK); S('J24', 'KK'); F('K24', 'B24', tK); S('L24', 'EKMEK');
    S('A25', 'NAKİT'); F('B25', 'I20', ct.nakit); S('J25', 'YÇ'); F('K25', 'B23', yGrand); S('L25', '….');
    S('A26', 'KREDİ FATURA'); F('B26', 'SUM(G35:G39)', kf5); S('C26', 'FARK'); F('D26', 'B33-D23', top - ct.ciro); S('J26', 'R'); F('K26', 'D52', tN); S('L26', '…..');
    S('A27', 'NAKİT FATURA'); F('B27', 'H52', tNf); S('J27', 'GR'); F('K27', 'I20-SUM(D52)', ct.nakit - tN); S('L27', 'TOPLAM'); F('M27', '(M23*20)+(M24*17.5)+M25+M26', 0);
    S('A28', 'HEDİYE ÇEKİ'); F('B28', 'J20', ct.hediye); F('K28', 'K27-K22-K21', ct.nakit - tN);
    F('B31', 'J59', 0); F('B32', 'I59', 0);
    S('A33', 'TOPLAM KASA'); F('B33', 'SUM(B23:B25)+B28', top);
    // ---- POS NO - Z 34..53
    ['POS NO - Z', 'POS KREDİ', 'POS', 'Z NAKİT', 'Z KREDİ', 'QR FAST İŞLEM', 'KREDİ FATURA', 'NAKİT FATURA', 'FARK'].forEach((h, i) => S('ABCDEFGHI'[i] + '34', h));
    ZPOS_MAIN.forEach((p, idx) => {
      const r = 35 + idx, v = dd.main[p.id] || {};
      const num = s => /^-?\d+$/.test(s) ? V : S;
      if (p.a) (num(p.a) === V ? V('A' + r, Number(p.a)) : S('A' + r, p.a));
      V('B' + r, N(v.pk)); if (/^-?\d+$/.test(p.c)) V('C' + r, Number(p.c)); else S('C' + r, p.c);
      V('D' + r, N(v.n)); V('E' + r, N(v.k));
      if (v.qr) V('F' + r, N(v.qr)); if (v.kf) V('G' + r, N(v.kf)); if (v.nf) V('H' + r, N(v.nf));
      const ex = FARK_ROW[r] || [];
      let es = 0; (ZPOS_FARK_MAP[p.id] || []).forEach(lab => { es += N(dd.extra[lab]); });
      const f = 'E' + r + '-(B' + r + '+B' + ex[0] + ')-F' + r + (ex[1] ? '-B' + ex[1] : '');
      F('I' + r, f, N(v.k) - (N(v.pk) + es) - N(v.qr));
    });
    Object.keys(EXROW).forEach(lab => { const e = EXROW[lab]; S('A' + e[0], e[1]); if (dd.extra[lab] !== undefined && dd.extra[lab] !== '') V('B' + e[0], N(dd.extra[lab])); });
    S('A52', 'TOPLAM KASA');
    F('B52', 'SUM(B35:B51)+F35+F36+F37+F38+F39+F40', tPk); F('D52', 'SUM(D35:D51)', tN); F('E52', 'SUM(E35:E51)', tK);
    F('F52', 'SUM(F35:F51)', tQr); F('G52', 'SUM(G35:G51)', tKf); F('H52', 'SUM(H35:H51)', tNf);
    F('E53', 'E52-H20', tK - ct.kk);
    // ---- YEMEK POS 54..61
    V('C54', 1); V('D54', 2); V('E54', 3); S('F54', 'YEMEK POS GENEL TOPLAM'); S('G54', 'FARK');
    const GK = ['B', 'C', 'D', 'E', 'F', 'G'];
    ZPOS_YEMEK.forEach((name, i) => {
      const r = 55 + i, v = dd.yemek[name] || {};
      S('B' + r, name);
      if (v.a) V('C' + r, N(v.a)); if (v.b) V('D' + r, N(v.b)); if (v.c) V('E' + r, N(v.c));
      F('F' + r, 'SUM(C' + r + ':E' + r + ')', yRows[name]);
      F('G' + r, 'F' + r + '-' + GK[i] + '20', yRows[name] - ct[ZPOS_YEMEK_KEY[name]]);
    });
    S('B61', 'TOPLAM'); F('F61', 'SUM(F55:F60)', yGrand);
    ws['!ref'] = 'A1:N61';
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 13 } }, { s: { r: 20, c: 0 }, e: { r: 20, c: 3 } }];
    ws['!cols'] = [{ wch: 22 }, { wch: 13 }, { wch: 15 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 12 }];
    return ws;
  };
  const fname = 'KASA_FOY_' + brName.replace(/\s+/g, '_') + '_' + y + '-' + m + '-' + (ZPOS.day < 10 ? '0' : '') + ZPOS.day + '.xlsx';
  try {
    // Tek sayfa (seçili gün) · şablonla aynı renk/kenarlık/yazı tipi/ölçüler
    await kasaStyledXlsx(build(ZPOS.day), String(ZPOS.day), fname);
  } catch (e1) {
    try {   // ExcelJS yüklenemezse (internet yok): stilsiz yedek
      if (typeof XLSX === 'undefined') { msg('Excel hata: ' + (e1.message || e1)); return; }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, build(ZPOS.day), String(ZPOS.day));
      XLSX.writeFile(wb, fname);
      msg('Renkli Excel için internet gerekir; sade dosya indirildi');
    } catch (e) { msg('Excel hata: ' + (e.message || e)); }
  }
};

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
    try{await gs('saveAiReport',B,v[0].trim()||'Rapor',j.columns,JSON.stringify(j.rows),j.notes||'',PIN);PSIG='';pgSync();msg('Kaydedildi ✅\nGarsonlar "💎 Primli Ürünler" sekmesinden görüp Excel indirebilir.');}catch(e){msg(emsg(e));}
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
const repNorm0=function(r){
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
const gHid=c=>['bira','çay'].indexOf(String(c||'').toLocaleLowerCase('tr'))>=0||/^Kahve · /.test(String(c||''))||/^Ürün · /.test(String(c||''));   // Bira ve Çay (kotalı) ayrı sekmede
const REP_OK=['çay','bira','alkollü kokteyl','kadeh şarap','şişe şarap','başlangıç','menemen & omlet','tatlı','sıcak kahve'];   // raporda kalan gruplar (+ Wheel, Bahşiş, Toplam, Kahve · döküm)
const HOT_AL=['türk kahvesi','filtre kahve','kahve'];   // eski raporlardaki ayrı kahve sütunları → 'Sıcak Kahve'
const repKD=c=>/^Kahve · /.test(String(c||''));
const repPD=c=>/^Ürün · /.test(String(c||''));
const lc=c=>String(c||'').toLocaleLowerCase('tr').trim();
const repOk=c=>{const k=lc(c);return k=='toplam'||k=='wheel'||k=='bahşiş'||REP_OK.indexOf(k)>=0||HOT_AL.indexOf(k)>=0||repKD(c)||repPD(c);};
window.repNorm=function(r){
  r=repNorm0(r);
  try{
    const cols=r.cols||[];
    if(!cols.some((c,i)=>i>0&&(!repOk(c)||HOT_AL.indexOf(lc(c))>=0)))return r;
    const mp=cols.map((c,i)=>i==0?c:(!repOk(c)?null:(HOT_AL.indexOf(lc(c))>=0?'Sıcak Kahve':c))),nc=[],ix={};
    mp.forEach(c=>{if(c==null||ix[c]!=null)return;ix[c]=nc.length;nc.push(c);});
    const ti=nc.indexOf('Toplam'),gi=[];
    nc.forEach((c,i)=>{if(i>0&&c!='Toplam'&&c!='Wheel'&&c!='Bahşiş'&&!repKD(c)&&!repPD(c))gi.push(i);});
    const rows=JSON.parse(r.rj||'[]').map(x=>{const o=nc.map(()=>0);o[0]=x[0];mp.forEach((c,i)=>{if(i==0||c==null)return;const j=ix[c];o[j]=Math.round(((Number(o[j])||0)+(Number(x[i])||0))*100)/100;});if(ti>0)o[ti]=Math.round(gi.reduce((a,i)=>a+(Number(o[i])||0),0)*100)/100;return o;});
    return Object.assign({},r,{cols:nc,rj:JSON.stringify(rows)});
  }catch(e){return r;}
};
const PRIM_MAP={'başlangıç':12,'menemen & omlet':12,'tatlı':12,'sıcak kahve':12,'alkollü kokteyl':12,'kadeh şarap':12,'şişe şarap':50},CAY_TL=3,BIRA_TL=12;   // adet başı TL · Çay: kota üstü her adet 3 TL · Bira: kota üstü her adet 12 TL
const primOf=g=>PRIM_MAP[String(g||'').toLocaleLowerCase('tr').trim()]||0;
const cayPrim=q=>{const T=+window.__cayT||0;return T>0&&q>T?q*CAY_TL:0;};      // kotayı geçen: sattığı TÜM çay × 3 TL
const biraPrim=q=>{const T=+window.__biraT||0;return T>0&&q>T?q*BIRA_TL:0;};      // kotayı geçen: sattığı TÜM bira × 12 TL
const GICO={'Bahşiş':'💵','Taze Meyve Suyu':'🍊','Bubble Tea':'🧋','Menemen & Omlet':'🍳','Filtre Kahve':'☕','Bira':'🍺','Alkollü Kokteyl':'🍹','Kadeh Şarap':'🍷','Şişe Şarap':'🍾','Buzlu Kahve':'🧊','Limonata':'🍋','Su':'💧','Soğuk İçecek':'🥤','Kokteyl':'🍹','Türk Kahvesi':'☕','Filtre Kahve':'☕','Kahve':'☕','Sıcak Kahve':'☕','Çay':'🫖','Sıcak İçecek':'🍫','Tatlı':'🍰','Başlangıç':'🥗','Yemek':'🍽️','Diğer':'📦'};
const gIco=g=>GICO[g]||'🏷️';
window.repGrp=g=>{RGRP=g;PSIG='';pgSync();};
window.primHak=function(){
  const r=window.__primR;if(!r)return;let cols,rows;
  try{cols=r.cols||[];rows=JSON.parse(r.rj||'[]').filter(x=>String(x[0]).toUpperCase()!='TOPLAM');}catch(e){return;}
  const tlf=x=>(Math.round(x*100)/100).toLocaleString('tr-TR'),gs2=[],ci=cols.indexOf('Çay'),bi=cols.indexOf('Bira'),T=+window.__cayT||0,TB=+window.__biraT||0;
  cols.forEach((c,i)=>{if(i>0&&c!='Toplam'&&c!='Wheel'&&primOf(c)>0)gs2.push(i);});
  const L=rows.map(x=>{let q=0,tl=0;const d=[];gs2.forEach(i=>{const v=Number(x[i])||0;if(v>0){q+=v;tl+=v*primOf(cols[i]);d.push({g:cols[i],v:v});}});d.sort((a,b)=>b.v-a.v);
    const cq=ci>0?Number(x[ci])||0:0,cp=cayPrim(cq),bq=bi>0?Number(x[bi])||0:0,bp=biraPrim(bq);
    if(cp>0)d.push({g:'Çay (kotayı geçti)',v:cq});if(bp>0)d.push({g:'Bira (kotayı geçti)',v:bq});
    return {name:String(x[0]),q:q+(cp>0?cq:0)+(bp>0?bq:0),tl:tl+cp+bp,d:d};}).filter(x=>x.tl>0).sort((a,b)=>b.tl-a.tl);
  const TQ=L.reduce((a,x)=>a+x.q,0),TT=L.reduce((a,x)=>a+x.tl,0),hi=cols.indexOf('Sıcak Kahve'),HK=hi>0?rows.reduce((a,x)=>a+(Number(x[hi])||0),0):0;
  let h='<p class=\"sub\" style=\"margin:0 0 10px;line-height:1.5\">'+esc(r.title)+'<br>Adet başı: Başlangıç, Menemen &amp; Omlet, Tatlı, Sıcak Kahve, Alkollü Kokteyl, Kadeh Şarap <b>12 TL</b> · Şişe Şarap <b>50 TL</b><br>Kotayı geçenler, sattığı tüm: Çay '+(T>0?'(kota '+fmt(T)+')':'(kota yazılmamış)')+' <b>'+CAY_TL+' TL</b> · Bira '+(TB>0?'(kota '+fmt(TB)+')':'(kota yazılmamış)')+' <b>'+BIRA_TL+' TL</b></p>';
  h+='<div class=\"kp\"><div><b>'+L.length+'</b><span>Personel</span></div><div><b>'+fmt(TQ)+'</b><span>Primli adet</span></div><div><b>'+tlf(TT)+'</b><span>Toplam TL</span></div></div>';
  if(HK>0)h+='<div class=\"hot\" style=\"margin-bottom:10px\">☕ Toplam sıcak kahve: <b>'+fmt(HK)+'</b> adet</div>';
  h+='<div style=\"overflow-x:auto\"><table style=\"width:100%;border-collapse:collapse;font-size:13px\"><tr style=\"text-align:left;opacity:.7\"><th style=\"padding:6px 4px\">#</th><th>Personel</th><th style=\"text-align:right\">Adet</th><th style=\"text-align:right\">Hak ediş</th></tr>'+L.map((x,i)=>'<tr style=\"border-top:1px solid rgba(255,255,255,.1)\"><td style=\"padding:7px 4px\">'+(i+1)+'</td><td><b>'+esc(nice(x.name))+'</b><div style=\"font-size:11px;opacity:.65\">'+x.d.slice(0,6).map(y=>esc(y.g)+' '+fmt(y.v)).join(' · ')+'</div></td><td style=\"text-align:right\">'+fmt(x.q)+'</td><td style=\"text-align:right;color:#6ee7b7\"><b>'+tlf(x.tl)+' TL</b></td></tr>').join('')+'<tr style=\"border-top:2px solid rgba(255,255,255,.25)\"><td></td><td><b>TOPLAM</b></td><td style=\"text-align:right\"><b>'+fmt(TQ)+'</b></td><td style=\"text-align:right;color:#6ee7b7\"><b>'+tlf(TT)+' TL</b></td></tr></table></div>';
  pop('💰 Primli ürünler hak edişi',h,true);
};
window.repBoardRank=function(r){
  let cols,rows;
  try{cols=r.cols||[];rows=JSON.parse(r.rj||'[]').filter(x=>String(x[0]).toUpperCase()!='TOPLAM');}catch(e){return '';}
  const gi=[];cols.forEach((c,i)=>{if(i>0&&c!='Toplam'&&c!='Wheel'&&c!='Bahşiş'&&!gHid(c)&&rows.some(x=>Number(x[i])>0))gi.push(i);});
  const ti=cols.indexOf('Bahşiş'),hasTip=ti>0&&rows.some(x=>Number(x[ti])>0);
  if(!gi.length)return '';
  if(!(hasTip&&RGRP=='Bahşiş')&&!gi.some(i=>cols[i]==RGRP))RGRP=cols[gi[0]];
  const ci=cols.indexOf(RGRP),dt=new Date(r.t).toLocaleDateString('tr-TR'),tlf2=x=>(Math.round(x*100)/100).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
  let h='<div class="simgh" style="padding:2px 2px 10px"><b>🏆 '+esc(r.title)+'</b><span>'+dt+'</span></div>';
  window.__primR=r;
  h+='<button class="a an" style="width:100%;margin:2px 0 10px;background:linear-gradient(135deg,#059669,#047857)" onclick="primHak()">💰 Primli ürünler hak edişi</button>';
  h+='<button class="a ed" style="width:100%;margin:0 0 10px" onclick="repView(\'list\')">📋 Liste görünümüne dön</button>';
  h+='<div class="pers">'+gi.map(i=>`<button class="${cols[i]==RGRP?'on':''}" data-g="${esc(cols[i])}" onclick="repGrp(this.dataset.g)">${gIco(cols[i])} ${esc(cols[i])}</button>`).join('')+(hasTip?`<button class="${RGRP=='Bahşiş'?'on':''}" data-g="Bahşiş" onclick="repGrp(this.dataset.g)">💵 Bahşiş</button>`:'')+'</div>';
  if(hasTip&&RGRP=='Bahşiş'){
    const T2=rows.filter(x=>Number(x[ti])>0).map(x=>({n:String(x[0]),v:Number(x[ti])})).sort((a,b)=>b.v-a.v),tt=T2.reduce((a,x)=>a+x.v,0);
    h+='<div class="hot" style="background:linear-gradient(135deg,#047857,#022c22);margin-bottom:10px">💵 Toplam bahşiş: <b>'+tlf2(tt)+' TL</b><br><small style="opacity:.85">'+T2.length+' garson · tutar olarak, adet toplamlarına girmez</small></div><div class="lb">'+T2.map((x,k)=>`<div class="lr"><b class="av" data-nm="${esc(x.n)}">${esc(ini(x.n))}</b><div class="lm"><div class="ln">${esc(nice(x.n))}</div><div class="ls">${k+1}. sıra</div></div><div class="lv" style="font-weight:800;color:#6ee7b7">${tlf2(x.v)} TL</div></div>`).join('')+'</div>';
    h+='<button class="a ed" style="width:100%;margin:10px 0 14px" data-i="'+esc(r.id)+'" onclick="repTable(this.dataset.i)">📋 Tablo / Excel</button>';
    return h;
  }
  const L=rows.filter(x=>Number(x[ci])>0).map(x=>({name:String(x[0]),qty:Number(x[ci]),key:''})).sort((a,b)=>b.qty-a.qty);
  h+=lbQty(L,false,0,RGRP.toLowerCase(),primOf(RGRP));
  if(RGRP=='Sıcak Kahve'){
    const K={};cols.forEach((c,i)=>{if(repKD(c)){const v=rows.reduce((a,x)=>a+(Number(x[i])||0),0);if(v>0)K[String(c).slice(8)]=v;}});
    const ks=Object.keys(K).sort((a,b)=>K[b]-K[a]),kt=ks.reduce((a,n)=>a+K[n],0);
    if(ks.length)h+='<div class="sec2" style="margin-top:16px">☕ KAHVE TÜRÜNE GÖRE <span>'+fmt(kt)+'</span></div><div class="ctw"><table class="ct"><tr><th>#</th><th class="l">Kahve</th><th>Adet</th></tr>'+ks.map((n,i)=>'<tr><td>'+(i+1)+'</td><td class="l">'+esc(n)+'</td><td class="on">'+fmt(K[n])+'</td></tr>').join('')+'<tr class="tot"><td></td><td class="l">TOPLAM</td><td>'+fmt(kt)+'</td></tr></table></div>';
  }
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

// ===== Primli ürünler: kişi bazlı liste görünümü (sıralama görünümü isteğe bağlı) =====
window.repBoard=function(r){ return window.__rbView=='rank'?window.repBoardRank(r):repList(r); };
window.repView=function(v){window.__rbView=v;PSIG='';pgSync();};
function repList(r){
  window.__primR=r;
  let cols,rows;
  try{cols=r.cols||[];rows=JSON.parse(r.rj||'[]').filter(x=>String(x[0]).toUpperCase()!='TOPLAM');}catch(e){return '';}
  const tlf=x=>(Math.round(x*100)/100).toLocaleString('tr-TR'),ci=cols.indexOf('Çay'),bi=cols.indexOf('Bira'),T=+window.__cayT||0,TB=+window.__biraT||0;
  const ti=cols.indexOf('Bahşiş'),hasTip=ti>0&&rows.some(x=>Number(x[ti])>0),pc=[];
  cols.forEach((c,i)=>{if(i>0&&c!='Toplam'&&c!='Wheel'&&c!='Bahşiş'&&primOf(c)>0)pc.push(i);});
  const P=rows.map(x=>{
    const items=[];let tl=0,q=0;
    pc.forEach(i=>{const v=Number(x[i])||0;if(v>0){const t=v*primOf(cols[i]);items.push({g:cols[i],v:v,t:t});tl+=t;q+=v;}});
    items.sort((a,b)=>b.t-a.t);
    const cq=ci>0?Number(x[ci])||0:0,bq=bi>0?Number(x[bi])||0:0,cp=cayPrim(cq),bp=biraPrim(bq);
    return {name:String(x[0]),items:items,cq:cq,bq:bq,cp:cp,bp:bp,q:q+cq+bq,tl:tl+cp+bp};
  }).filter(p=>p.items.length||p.cq>0||p.bq>0).sort((a,b)=>b.tl-a.tl);
  const dt=new Date(r.t).toLocaleDateString('tr-TR'),TQ=P.reduce((a,p)=>a+p.q,0),TT=P.reduce((a,p)=>a+p.tl,0);
  let h='<div class="simgh" style="padding:2px 2px 10px"><b>💎 '+esc(r.title)+'</b><span>'+dt+'</span></div>';
  h+='<div style="display:flex;gap:6px;margin:0 0 10px">'+(hasTip?'<button class="a an" style="flex:1;padding:11px 4px;background:linear-gradient(135deg,#059669,#047857)" onclick="repTip()">💵 Bahşiş</button>':'')+'<button class="a ed" style="flex:1;padding:11px 4px" data-i="'+esc(r.id)+'" onclick="repTable(this.dataset.i)">📋 Tablo / Excel</button><button class="a ed" style="flex:1;padding:11px 4px" onclick="repView(\'rank\')">🏆 Sıralama</button></div>';
  h+='<div class="kp"><div><b>'+P.length+'</b><span>Personel</span></div><div><b>'+fmt(TQ)+'</b><span>Toplam satış (adet)</span></div><div><b>'+tlf(TT)+'</b><span>Toplam prim (TL)</span></div></div>';
  h+='<p class="sub" style="margin:2px 2px 10px;line-height:1.5;font-size:12px">12 TL: Başlangıç, Menemen &amp; Omlet, Tatlı, Sıcak Kahve, Alkollü Kokteyl, Kadeh Şarap · Şişe Şarap 50 TL · Kotayı geçen, sattığı tüm çay ve biradan: Çay '+CAY_TL+' TL, Bira '+BIRA_TL+' TL</p>';
  const kb=(ico,nm,q,K,pt,rate)=>'<div style="flex:1;min-width:0;background:rgba(255,255,255,.05);border-radius:10px;padding:7px 9px"><div style="font-size:12px;font-weight:800">'+ico+' '+nm+'</div><div style="font-size:13px;margin-top:2px"><b>'+fmt(q)+'</b> adet <span style="opacity:.65">· kota '+(K>0?fmt(K):'yok')+'</span></div><div style="font-size:12px;margin-top:2px;'+(pt>0?'color:#6ee7b7;font-weight:800':'opacity:.65')+'">'+(K<=0?'kota yazılmamış':pt>0?'✓ kotayı geçti · '+fmt(q)+' × '+rate+' TL = '+tlf(pt)+' TL':q>0?(q==K?'tam kotada · 1 adet daha lazım':'kota altı · kalan '+fmt(K-q)):'—')+'</div></div>';
  h+=P.map(p=>'<div style="background:#111827;color:#f1f5f9;border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:10px 12px;margin:0 0 8px">'
    +'<div style="display:flex;align-items:center;gap:10px"><b class="av" data-nm="'+esc(p.name)+'">'+esc(ini(p.name))+'</b><div style="flex:1;min-width:0;font-weight:800;font-size:15px">'+esc(nice(p.name))+'</div><div style="text-align:right"><div style="color:#6ee7b7;font-weight:800;font-size:18px">'+tlf(p.tl)+' TL</div><div style="font-size:11px;opacity:.7">toplam '+fmt(p.q)+' satış</div></div></div>'
    +(p.items.length?'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">'+p.items.map(x=>'<span data-n="'+esc(p.name)+'" data-g="'+esc(x.g)+'" onclick="repChipDet(this.dataset.n,this.dataset.g)" style="cursor:pointer;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:3px 9px;font-size:12px">'+gIco(x.g)+' '+esc(x.g)+' <b>'+fmt(x.v)+'</b> <span style="opacity:.6">· '+tlf(x.t)+' TL</span> <span style="opacity:.7">›</span></span>').join('')+'</div>':'')
    +'<div style="display:flex;gap:8px;margin-top:8px">'+kb('🫖','Çay',p.cq,T,p.cp,CAY_TL)+kb('🍺','Bira',p.bq,TB,p.bp,BIRA_TL)+'</div></div>').join('');
  if(!P.length)h+='<p class="sub" style="padding:10px">Bu raporda primli ürün satışı yok.</p>';
  h+='<div class="sec2" style="margin-top:12px">TOPLAM</div><div style="background:#111827;color:#f1f5f9;border-radius:14px;padding:10px 12px;font-size:13px;line-height:1.7">'
    +pc.map(i=>{const v=rows.reduce((a,x)=>a+(Number(x[i])||0),0);return v>0?gIco(cols[i])+' '+esc(cols[i])+' <b>'+fmt(v)+'</b>':'';}).filter(Boolean).join(' · ')
    +(P.length?'<br>🫖 Çay (kotayı geçenlerin) <b>'+fmt(P.reduce((a,p)=>a+(p.cp>0?p.cq:0),0))+'</b> · 🍺 Bira (kotayı geçenlerin) <b>'+fmt(P.reduce((a,p)=>a+(p.bp>0?p.bq:0),0))+'</b>':'')
    +'<div style="margin-top:6px;color:#6ee7b7;font-weight:800;font-size:16px">Toplam prim: '+tlf(TT)+' TL</div></div>';
  return h;
}
window.repTip=function(){
  const r=window.__primR;if(!r)return;let cols,rows;
  try{cols=r.cols||[];rows=JSON.parse(r.rj||'[]').filter(x=>String(x[0]).toUpperCase()!='TOPLAM');}catch(e){return;}
  const ti=cols.indexOf('Bahşiş');if(ti<1)return;
  const tl=x=>(Math.round(x*100)/100).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const T2=rows.filter(x=>Number(x[ti])>0).map(x=>({n:String(x[0]),v:Number(x[ti])})).sort((a,b)=>b.v-a.v),tt=T2.reduce((a,x)=>a+x.v,0);
  pop('💵 Bahşiş',
    '<div class="hot" style="background:linear-gradient(135deg,#047857,#022c22);margin-bottom:10px">💵 Toplam bahşiş: <b>'+tl(tt)+' TL</b><br><small style="opacity:.85">'+T2.length+' garson · tutar olarak, primli ürünlere ve adet toplamlarına girmez</small></div>'
    +'<div class="lb">'+T2.map((x,k)=>'<div class="lr"><b class="av" data-nm="'+esc(x.n)+'">'+esc(ini(x.n))+'</b><div class="lm"><div class="ln">'+esc(nice(x.n))+'</div><div class="ls">'+(k+1)+'. sıra</div></div><div class="lv" style="font-weight:800;color:#6ee7b7">'+tl(x.v)+' TL</div></div>').join('')+'</div>',true);
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
    if(i==0||c=='Toplam'||c=='Wheel'||c=='Bahşiş'||gHid(c))return;
    const v=Number(mine[i])||0;if(v<=0)return;
    const all=rows.map(x=>Number(x[i])||0).filter(x=>x>0),rank=all.filter(x=>x>v).length+1,idx=v/(all.reduce((a,b)=>a+b,0)/all.length);
    tot+=v;const pr=primOf(c)*v;ptot+=pr;cards.push({g:c,v:v,rank:rank,n:all.length,pr:pr});
    if(!best||idx>best.idx)best={g:c,rank:rank,idx:idx};
  });
  h+='<div class=\"pnm\"><b>'+esc(nice(s0.name))+'</b><span>Toplam '+fmt(tot)+' adet</span></div>';
  const tipI=cols.indexOf('Bahşiş'),tipV=tipI>0?Number(mine[tipI])||0:0;
  if(tipV>0)h+='<div class="hot" style="background:linear-gradient(135deg,#047857,#022c22);margin-bottom:10px;text-align:center">💵 Bahşişin<div style="font-size:26px;font-weight:800;margin-top:2px">'+tlf(tipV)+' TL</div></div>';
  if(!cards.length)return h+(tipV>0?'':'<div class="hot">Bu raporda satışın görünmüyor.</div>');
  h+='<button class="a an" style="width:100%;margin:2px 0 10px" onclick="repCmp()">⚖️ Kıyasla</button>';
  if(best)h+='<div class="hot">⭐ En güçlü olduğun grup: '+gIco(best.g)+' <b>'+esc(best.g)+'</b> ('+best.rank+'. sıradasın)</div>';
  const ciM=cols.findIndex(c=>String(c).toLocaleLowerCase('tr')=='çay'),biM=cols.findIndex(c=>String(c).toLocaleLowerCase('tr')=='bira');
  const cqM=ciM>0?Number(mine[ciM])||0:0,bqM=biM>0?Number(mine[biM])||0:0,kpr=cayPrim(cqM)+biraPrim(bqM);
  cards.sort((a,b)=>b.pr-a.pr);
  h+='<div style="background:#111827;color:#f1f5f9;border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:12px;margin:0 0 10px"><div style="display:flex;align-items:center;gap:10px"><div style="flex:1;min-width:0;font-weight:800;font-size:15px">💎 Sattığın primli ürünler</div><div style="text-align:right"><div style="color:#6ee7b7;font-weight:800;font-size:22px">'+tlf(ptot+kpr)+' TL</div><div style="font-size:11px;opacity:.7">toplam '+fmt(tot+cqM+bqM)+' satış</div></div></div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">'+cards.map(c=>'<span data-g="'+esc(c.g)+'" onclick="repGrpDet(this.dataset.g)" style="cursor:pointer;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:5px 11px;font-size:13px">'+gIco(c.g)+' '+esc(c.g)+' <b>'+fmt(c.v)+'</b> <span style="opacity:.6">· '+tlf(c.pr)+' TL</span> <span style="opacity:.7">›</span></span>').join('')+'</div></div>';
  const kd=[];cols.forEach((c,i)=>{if(repKD(c)){const v=Number(mine[i])||0;if(v>0)kd.push({n:String(c).slice(8),v:v});}});
  if(kd.length){kd.sort((a,b)=>b.v-a.v);const kt=kd.reduce((a,x)=>a+x.v,0);h+='<div class="sec2" style="margin-top:14px">☕ SICAK KAHVE DÖKÜMÜN <span>'+fmt(kt)+'</span></div><div class="ctw"><table class="ct"><tr><th>#</th><th class="l">Kahve</th><th>Adet</th></tr>'+kd.map((x,i)=>'<tr><td>'+(i+1)+'</td><td class="l">'+esc(x.n)+'</td><td class="on">'+fmt(x.v)+'</td></tr>').join('')+'<tr class="tot"><td></td><td class="l">TOPLAM</td><td>'+fmt(kt)+'</td></tr></table></div>';}
  const pd={};cols.forEach((c,i)=>{if(repPD(c)){const v=Number(mine[i])||0,m=String(c).slice(7).split(' · ');if(v>0&&m.length>=2)(pd[m[0]]=pd[m[0]]||[]).push({n:m.slice(1).join(' · '),v:v});}});
  if(kd.length)pd['Sıcak Kahve']=kd;
  window.__repPD=pd;
  return h;
};
window.repChipDet=(n,g)=>{
  const r=window.__primR;if(!r)return;let cols,rows;
  try{cols=r.cols||[];rows=JSON.parse(r.rj||'[]');}catch(e){return;}
  const row=rows.find(x=>String(x[0])==n);if(!row)return;
  const L=[];cols.forEach((c,i)=>{const v=Number(row[i])||0;if(v<=0)return;
    if(g=='Sıcak Kahve'&&repKD(c))L.push({n:String(c).slice(8),v:v});
    else if(repPD(c)){const m=String(c).slice(7).split(' · ');if(m[0]==g&&m.length>=2)L.push({n:m.slice(1).join(' · '),v:v});}});
  if(!L.length){msg(nice(n)+' · '+g+': ürün dökümü yok. Bu rapor eski yüklenmiş; raporu yeniden yükleyince görünür.');return;}
  L.sort((a,b)=>b.v-a.v);const t=L.reduce((a,x)=>a+x.v,0),pr=primOf(g),tlf=x=>(Math.round(x*100)/100).toLocaleString('tr-TR');
  pop(gIco(g)+' '+esc(nice(n))+' · '+esc(g),'<div class="pdw"><table class="pdt"><tr><th>#</th><th class="l">Ürün</th><th>Adet</th><th>Prim</th></tr>'+L.map((x,i)=>'<tr><td>'+(i+1)+'</td><td class="l">'+esc(x.n)+'</td><td class="on">'+fmt(x.v)+'</td><td>'+(pr>0?tlf(x.v*pr)+' TL':'—')+'</td></tr>').join('')+'<tr class="tot"><td></td><td class="l">TOPLAM</td><td>'+fmt(t)+'</td><td>'+(pr>0?tlf(t*pr)+' TL':'—')+'</td></tr></table></div>',true);
};
window.repGrpDet=g=>{
  const L=(((window.__repPD||{})[g])||[]).slice().sort((a,b)=>b.v-a.v);
  if(!L.length){msg(g+' için ürün dökümü yok. Bu rapor eski yüklenmiş; yönetici raporu yeniden yükleyince görünür.');return;}
  const t=L.reduce((a,x)=>a+x.v,0);
  pop(gIco(g)+' '+g+' dökümün','<div class="pdw"><table class="pdt"><tr><th>#</th><th class="l">Ürün</th><th>Adet</th></tr>'+L.map((x,i)=>'<tr><td>'+(i+1)+'</td><td class="l">'+esc(x.n)+'</td><td class="on">'+fmt(x.v)+'</td></tr>').join('')+'<tr class="tot"><td></td><td class="l">TOPLAM</td><td>'+fmt(t)+'</td></tr></table></div>',true);
};

// ===== ⚖️ Kıyasla: garson, seçtiği garsonla ürün grubu satışlarını karşılaştırır =====
const rcRow=(rows,name)=>{const k=nrm(name);return rows.find(x=>nrm(x[0])==k)||rows.find(x=>nrm(x[0]).length>3&&lev(nrm(x[0]),k)<=Math.floor(k.length*.25));};
function rcData(){
  const r=(window.__reps||[]).find(x=>x.id==window.__repSel)||(window.__reps||[])[0];if(!r)return null;
  let cols,rows;try{cols=r.cols||[];rows=JSON.parse(r.rj||'[]').filter(x=>String(x[0]).toUpperCase()!='TOPLAM');}catch(e){return null;}
  const gi=[];cols.forEach((c,i)=>{if(i>0&&c!='Toplam'&&c!='Wheel'&&c!='Bahşiş'&&!gHid(c)&&rows.some(x=>Number(x[i])>0))gi.push(i);});
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
const repTabs=()=>`<div class="seg"><button class="${PS()=='urun'?'on':''}" onclick="repSub('urun')">⭐ Primli ürünler</button><button class="${PS()=='cay'?'on':''}" onclick="repSub('cay')">🫖 Çay</button><button class="${PS()=='bira'?'on':''}" onclick="repSub('bira')">🍺 Bira</button></div>`;
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


// ===== ✏️ İsimler (yönetici elle yazar) + 📊 personelin kendi ortalaması / cirosu =====
(function () {
  const rawsOf = k => { const al = GO.al || {}, out = {}; Object.keys(GO.d || {}).forEach(d => Object.keys(GO.d[d]).forEach(n => { if ((al[n] || n) === k) out[n] = 1; })); return Object.keys(out); };
  window.goNames = async () => {
    try { await goLoad(true); } catch (e) { msg(emsg(e)); return; }
    const m = goModel();
    const rows = m.names.slice().sort((a, b) => m.tot[b][0] - m.tot[a][0]);
    window.__gn = rows;
    pop('✏️ İsimler · ' + BR[B], '<p class="sub" style="margin:0 0 10px;line-height:1.5">Fiş jurnalindeki isimler. Adı olmayan fişler <b>İsimsiz</b> olarak listelenir. ✏️ ile gerçek adı yaz. Aynı adı iki satıra yazarsan toplamları birleşir.</p>'
      + rows.map((n, i) => '<div class="mdc"><div><b>' + esc(nice(n)) + '</b><small>' + m.tot[n][0] + ' hesap · ' + Math.round(m.tot[n][1]).toLocaleString('tr-TR') + ' TL</small></div><button class="a ed" style="padding:9px 12px" onclick="goRen(' + i + ')">✏️ Adı yaz</button></div>').join(''));
    $('mo').textContent = 'Kapat'; $('mc').style.display = 'none';
  };
  window.goRenName = k => { window.__gn = [k]; goRen(0); };
  document.addEventListener('click', e => { if (M != 'y') return; const t = e.target.closest && e.target.closest('td.l[data-gn]'); if (t) goRenName(t.dataset.gn); });
  window.goRen = i => {
    const k = window.__gn[i]; if (k == null) return;
    ask('Adı yaz\n' + nice(k), [{ label: 'Ad Soyad (boş bırakırsan eski adına döner)', val: k == 'İsimsiz' ? '' : nice(k) }], async v => {
      try { const raws = rawsOf(k); const r = await gs('setGoAlias', B, raws.length ? raws : [k], v[0], PIN); GO.al = r.m || {}; renderPg(true); goNames(); }
      catch (e) { msg(emsg(e)); }
    }, 'Kaydet');
  };
  // kişinin kendi toplamı
  const goMy = name => {
    const al = GO.al || {}, me = goFold(name), tk = me.split(' ').filter(Boolean); let c = 0, s = 0, f = '', l = '';
    Object.keys(GO.d || {}).sort().forEach(d => {
      if (GO.ex && GO.ex[d]) return;
      const o = GO.d[d];
      Object.keys(o).forEach(n => { const k = goFold(al[n] || n); if (k === me || (tk.length > 1 && tk.every(t => k.indexOf(t) >= 0))) { c += o[n][0]; s += o[n][1]; if (!f) f = d; l = d; } });
    });
    return c ? { c: c, s: s, ort: s / c, f: f, l: l } : null;
  };
  const meStaff = () => { try { const id = localStorage.getItem('mola_me_' + B); return ((D && D.staff) || []).find(s => s.id == id) || null; } catch (e) { return null; } };
  const dm = k => k.slice(8) + '.' + k.slice(5, 7);
  function paint() {
    const h2 = document.querySelector('.hi2'); if (!h2 || M == 'y') return;
    const s = meStaff(); if (!s) return;
    let e = document.getElementById('himy'); if (!e) { e = document.createElement('div'); e.id = 'himy'; e.className = 'sv2l'; h2.appendChild(e); }
    const r = (GO && GO.d && GO.b == B) ? goMy(s.name) : null;
    const hh = r ? '📊 Ortalama <span class="sv2">' + tl2(r.ort) + ' TL</span> · Ciro <span class="sv2">' + Math.round(r.s).toLocaleString('tr-TR') + ' TL</span><div class="himd">' + r.c + ' hesap · ' + dm(r.f) + '–' + dm(r.l) + '</div>' : ''; if (e.dataset.h !== hh) { e.dataset.h = hh; e.innerHTML = hh; }
  }
  let raf = 0;
  new MutationObserver(() => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (document.querySelector('.hi2')) { paint(); goLoad(false).then(paint).catch(() => {}); } }); }).observe(document.body, { childList: true, subtree: true });
  const st = document.createElement('style'); st.textContent = '.himd{font-size:11px;color:#fecaca;opacity:.85;margin-top:1px}.gne{opacity:.55;font-size:11px}td.l[data-gn]{cursor:pointer}'; document.head.appendChild(st);
})();
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

const GR = ['Çay', 'Bira', 'Alkollü Kokteyl', 'Kadeh Şarap', 'Şişe Şarap', 'Başlangıç', 'Menemen & Omlet', 'Tatlı', 'Sıcak Kahve'];   // tabloya girenler (primli ürünler + çay/bira kotalı + şarap/kokteyl); bunların dışındaki ürünler tabloya alınmaz
let CG = [];   // yöneticinin eklediği gruplar: {name, codes:"2005,2006", words:"tost,sandvic"}
const GRX = () => GR.slice();   // sadece yukarıdaki liste; yöneticinin eklediği ek gruplar tabloya alınmaz
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
const KDN = {'TURK KAHVESI':'Türk Kahvesi','DOUBLE TURK KAHVE':'Double Türk Kahvesi','DAMLA SAKIZLI TURK KAHVESI':'Damla Sakızlı Türk Kahvesi','FILITRE KAHVE':'Filtre Kahve','FILTRE KAHVE':'Filtre Kahve','CAFE AMERICANO':'Americano','CAFE LATTE':'Latte','CAFE MOCHA':'Mocha','CAPPUCHINO':'Cappuccino','CAPPUCCINO':'Cappuccino','ESPRESSO':'Espresso','DOUBLE ESP':'Double Espresso','SUTLU NES CAFE':'Sütlü Nescafe','NESCAFE':'Nescafe','CORTADO':'Cortado','MACCHIATO':'Macchiato','CARAMEL LATTE':'Caramel Latte','CARAMEL MOCHA':'Caramel Mocha','STRAWBERRY CAPPUCINO':'Strawberry Cappuccino'};
const kdName = n => KDN[fold(n)] || String(n || '').toLocaleLowerCase('tr').replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toLocaleUpperCase('tr'));
const HOTG = ['Türk Kahvesi', 'Filtre Kahve', 'Kahve'];   // sıcak kahve alt grupları → tek 'Sıcak Kahve' sütunu
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
  if (/^250[5-7]/.test(c)) return 'Şişe Şarap';      // 2505 kırmızı, 2506 roze (Blush), 2507 beyaz
  if (/^2202/.test(c) && /LATTE|MOCHA|CAPPU/.test(x)) return 'Kahve';      // aromalı sıcak kahveler (Caramel Latte vb.)
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
      cur.items.push({ code: code, pn: pn, q: q, amt: amt, wh: /WHE+L|KMPN/i.test(pn) || (amt === 0 && q > 0 && /^2500/.test(code)) });
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
  const map = {}, order = [], other = {}, det = {}, pdet = {};
  const PDG = ['alkollü kokteyl', 'kadeh şarap', 'şişe şarap', 'başlangıç', 'menemen & omlet', 'tatlı'];
  let gsum = 0, drop = 0;
  P.staff.forEach(s => {
    gsum += s.sum;
    const m = match(s.name), nm = nice(m ? m.name : s.name), k = nrm(nm) || ('x' + order.length);
    const t = map[k] || (map[k] = { name: nm, g: {}, d: {}, p: {}, wheel: 0, tip: 0 });
    if (!t._in) { t._in = 1; order.push(k); }
    s.items.forEach(it => {
      if (/BAHSIS/.test(fold(it.pn))) { t.tip += isNaN(it.amt) ? it.q : it.amt; return; }      // bahşiş: tutar (TL), adet toplamlarına girmez
      if (it.wh) { t.wheel += it.q; return; }
      let g = custom(it.code, it.pn) || byCode(it.code, it.pn) || (it.code ? 'Diğer' : (gmap[fold(it.pn)] || rule(it.code, it.pn)));
      if (g === 'Su') return;      // su gruplara alınmaz
      if (g === 'Çay' && it.code && !/^2201/.test(it.code)) return;      // çay: sadece Bardak Çay (2201…); kahvaltı çayı seçeneği, bitki çayları sayılmaz
      if (HOTG.indexOf(g) >= 0) { const dn = kdName(it.pn); t.d[dn] = (t.d[dn] || 0) + it.q; det[dn] = (det[dn] || 0) + it.q; g = 'Sıcak Kahve'; }      // kahve türü dökümü ayrıca tutulur
      else if (PDG.indexOf(String(g).toLocaleLowerCase('tr')) >= 0 && it.q > 0) { const pk = g + ' · ' + kdName(it.pn); t.p[pk] = (t.p[pk] || 0) + it.q; pdet[pk] = (pdet[pk] || 0) + it.q; }      // diğer primli grupların ürün dökümü
      t.g[g] = (t.g[g] || 0) + it.q;
      if (GRX().indexOf(g) < 0) { drop += it.q; if (it.q > 0) other[it.pn] = 1; }
    });
  });
  const used = GRX().filter(g => order.some(k => map[k].g[g] > 0)), hasW = order.some(k => map[k].wheel > 0), hasTip = order.some(k => map[k].tip > 0), r2 = x => Math.round(x * 100) / 100;
  const dcols = Object.keys(det).sort((a, b) => det[b] - det[a]);
  const pcols = Object.keys(pdet).sort((a, b) => a.split(' · ')[0].localeCompare(b.split(' · ')[0], 'tr') || pdet[b] - pdet[a]);
  const rows = order.map(k => {
    const t = map[k], v = used.map(g => r2(t.g[g] || 0));
    return [t.name].concat(v, hasW ? [r2(t.wheel)] : [], hasTip ? [r2(t.tip)] : [], [r2(v.reduce((a, x) => a + x, 0))], dcols.map(n => r2(t.d[n] || 0)), pcols.map(n => r2(t.p[n] || 0)));
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
  if (hasTip) notes.push('Bahşiş tutar (TL) olarak ayrı sütunda; adet toplamlarına ve primli ürünlere girmedi.');
  if (dcols.length) notes.push('"Kahve · …" sütunları sıcak kahvenin türlere göre dökümüdür; Toplam\'a ayrıca eklenmez.');
  if (pcols.length) notes.push('"Ürün · …" sütunları primli grupların ürün dökümüdür (garson, gruba tıklayınca görür); Toplam\'a ayrıca eklenmez.');
  if (hasW) notes.push('Tutarı 0,00 olan Wheel kampanyası satırları gruplara katılmadı, "Wheel" sütununda ayrı.');
  const od = Object.keys(other); if (od.length) notes.push('Tabloya alınmayan ürünler: ' + fmt(drop) + ' adet (' + od.slice(0, 6).join(', ') + (od.length > 6 ? ' ve ' + (od.length - 6) + ' ürün daha' : '') + ')');
  const m = pages.map(p => p.text || '').join(' ').match(/Tarih\s+Aral\S{2,4}\s*:\s*([\d.]+\s*-\s*[\d.]+)/i);
  return { title: 'Primli ürünler' + (m ? ' · ' + m[1].replace(/\s+/g, '') : ''), columns: ['Personel'].concat(used, hasW ? ['Wheel'] : [], hasTip ? ['Bahşiş'] : [], ['Toplam'], dcols.map(n => 'Kahve · ' + n), pcols.map(n => 'Ürün · ' + n)), rows: rows, notes: notes.join('\n') };
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
      if (isZeroAcc(s.name) && !(ciro > 0)) ciro = 0;
      else if (!(ciro > 0)) { skip.push(nm + ' (ödeme yok)'); continue; }
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
  pop('🍺 Primli ürünler raporu · AI20', '<p class="sub" style="margin:0 0 10px;line-height:1.5">Kasa programından aldığın <b>Personel Ürün Satış Raporu</b> Excel dosyasını (.xls / .xlsx) seç. Ürünler gruplara ayrılır, her personel için grup toplamı çıkar. Tabloyu Excel olarak indirebilir ya da garsonlar da görsün diye kaydedebilirsin.</p><div class="shg"><button class="a ed" onclick="aiPick()">📎 Excel dosyasını seç <span id="aic"></span></button><button class="a an" onclick="aiRun()">📊 Tabloyu oluştur</button><button class="a off" onclick="grpUI()">🧩 Grup ekle / düzenle (kod → grup)</button></div><div id="aio" style="margin-top:12px"></div>', true);
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
const isEgt = s => String(s.sec || '').toLocaleUpperCase('tr').replace(/İ/g, 'I').indexOf('EGIT') == 0;          // Eğitimdeki personel
const isSrv = s => String(s.sec || '').toLocaleUpperCase('tr').replace(/İ/g, 'I').indexOf('SERV') == 0 || isEgt(s);     // servis listelerinde görünür
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
    + '<div id="pmsg" class="svst"></div><button class="a an" style="width:100%;margin-top:6px" onclick="postaAuto()">🎲 Haftalık otomatik dağıt (servis)</button><button class="a x" style="width:100%;margin-top:6px" onclick="postaEditList()">✏️ Posta listesini düzenle</button><button class="a an" style="width:100%;margin-top:8px" onclick="postaShare()">🖼 WhatsApp görseli oluştur</button><button class="a x" style="width:100%;margin-top:8px" onclick="postaClear()">Bu günü temizle</button>';
}
window.postaPut = (i, id) => {
  const p = PL[i]; if (id) { Object.keys(PA).forEach(k => { if (PA[k] == id && k != p) delete PA[k]; }); PA[p] = id; } else delete PA[p];
  document.querySelectorAll('.psel').forEach(el => { const q = PL[+el.dataset.i]; el.innerHTML = window.__postaOpt(q); el.value = PA[q] || ''; });
  pgMsg('Kaydediliyor…'); clearTimeout(PT);
  PT = setTimeout(async () => { try { await gs('savePosta', B, PD, PA, PIN); pgMsg('✓ Kaydedildi'); } catch (e) { pgMsg('⚠ ' + (e && e.message || 'Kaydedilemedi')); } }, 400);
};
// ---- Haftalık otomatik posta dağıtımı (yalnızca servis personeli) ----
function hungarian(a) {      // en küçük maliyetli atama (n×n); ans[satır] = sütun
  const n = a.length, INF = 1e9, u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0), p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0; const minv = new Array(n + 1).fill(INF), used = new Array(n + 1).fill(false);
    do {
      used[j0] = true; const i0 = p[j0]; let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) { const cur = a[i0 - 1][j - 1] - u[i0] - v[j]; if (cur < minv[j]) { minv[j] = cur; way[j] = j0; } if (minv[j] < delta) { delta = minv[j]; j1 = j; } }
      for (let j = 0; j <= n; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const ans = new Array(n); for (let j = 1; j <= n; j++) ans[p[j] - 1] = j - 1; return ans;
}
// days: [{d:'2026-11-16', staff:[{id}]}], posts: ['G1','S1','S2','T1',...], last0: {kişiId: dünkü posta}, fixed: {G1: kişiId}
// Kurallar: G1, S1, S2 her gün mutlaka dolar (önce bunlar); kalan personel T1'den başlayarak sayıya göre dağıtılır,
// yetmezse sondaki T postaları boş kalır. G1 için sabit kişi tanımlıysa çalıştığı her gün o yazılır.
function postaPlan(days, posts, last0, fixed) {
  const had = {}, last = Object.assign({}, last0 || {}), unas = {}, out = {}, fx = fixed || {}, FIRST = ['G1', 'S1', 'S2'];
  const rk = p => { const i = FIRST.indexOf(String(p).toUpperCase()); return i < 0 ? 99 : i; };
  const prio = posts.slice().sort((x, y) => rk(x) - rk(y) || posts.indexOf(x) - posts.indexOf(y));      // öncelik: G1, S1, S2, sonra listedeki sıra (T1, T2…)
  days.forEach(day => {
    const S = day.staff.slice(), m = {}; let P = prio.slice();
    prio.forEach(p => {                                                                                    // sabit kişi o gün çalışıyorsa direkt yazılır
      const id = fx[p]; if (!id) return; const i = S.findIndex(x => x.id == id); if (i < 0) return;
      m[p] = id; S.splice(i, 1); P = P.filter(q => q != p); had[id] = had[id] || {}; had[id][p] = (had[id][p] || 0) + 1; last[id] = p;
    });
    if (!S.length) { out[day.d] = m; return; }
    const n = S.length, k = Math.min(n, P.length), act = P.slice(0, k), a = [];                           // personel kadar posta açılır (öncelik sırasıyla)
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < n; j++) {
        if (j < k) { const id = S[i].id; row.push(10 * ((had[id] || {})[act[j]] || 0) + (last[id] === act[j] ? 200 : 0) + Math.random() * 3); }   // hafta içi tekrar + üst üste aynı posta cezası
        else row.push(60 + 30 * (unas[S[i].id] || 0) + Math.random());                                       // postasız kalma (sırayla herkese)
      }
      a.push(row);
    }
    const ans = hungarian(a);
    S.forEach((s, i) => {
      const j = ans[i];
      if (j < k) { m[act[j]] = s.id; had[s.id] = had[s.id] || {}; had[s.id][act[j]] = (had[s.id][act[j]] || 0) + 1; last[s.id] = act[j]; }
      else { unas[s.id] = (unas[s.id] || 0) + 1; last[s.id] = null; }
    });
    out[day.d] = m;
  });
  return out;
}
const pgFixKey = () => 'mola_posta_fix_' + B;
const pgFix = () => { try { return JSON.parse(localStorage.getItem(pgFixKey()) || '{}') || {}; } catch (e) { return {}; } };
window.postaFix = () => {
  const hasSec = stfX().some(s => s.sec), L = stfX().filter(s => !hasSec || isSrv(s)).sort((x, y) => x.name.localeCompare(y.name, 'tr')), cur = pgFix();
  const fp = PL.find(p => String(p).toUpperCase() == 'G1') || 'G1';
  ask('📌 ' + fp + ' sabit kişi · ' + BR[B] + '\nBu kişi çalıştığı her gün ' + fp + ' postasına yazılır. Çalışmadığı gün ' + fp + ' sırayla başkasına verilir.', [{ label: 'Sabit kişi', type: 'select', opts: [['', '— sabit yok —']].concat(L.map(s => [s.id, nice(s.name)])) }], v => {
    const o = pgFix(); if (v[0]) o[fp] = v[0]; else delete o[fp];
    try { localStorage.setItem(pgFixKey(), JSON.stringify(o)); } catch (e) {}
    window.postaUI(PD);
  }, 'Kaydet');
  setTimeout(() => { const e = $('f0'); if (e && cur[fp]) e.value = cur[fp]; }, 0);
};
window.postaAuto = () => {
  const hasSec = stfX().some(s => s.sec), srv = () => stfX().filter(s => (!hasSec || isSrv(s)) && !isEgt(s));      // eğitimdekine otomatik posta verilmez
  const inf = window.shdInfo ? window.shdInfo(PD) : null;
  let from = inf && inf.cov ? inf.from : null;
  if (!from) { const d0 = new Date(PD + 'T00:00:00Z'), k = (d0.getUTCDay() + 6) % 7; d0.setUTCDate(d0.getUTCDate() - k); from = d0.toISOString().slice(0, 10); }
  const dates = []; for (let i = 0; i < 7; i++) { const d1 = new Date(from + 'T00:00:00Z'); d1.setUTCDate(d1.getUTCDate() + i); dates.push(d1.toISOString().slice(0, 10)); }
  const days = dates.map(d => ({ d: d, staff: srv().filter(s => window.shiftOf(s, d)).sort((x, y) => (x.ord || 1e9) - (y.ord || 1e9) || x.name.localeCompare(y.name, 'tr')) }));
  if (!PL.length) { pgMsg('Önce posta listesini ekle.'); return; }
  if (!days.some(x => x.staff.length)) { pgMsg('Bu hafta vardiyası olan servis personeli yok.'); return; }
  const f = x => x.slice(8) + '.' + x.slice(5, 7);
  ask('🎲 Haftalık posta dağıtımı\n' + f(dates[0]) + ' – ' + f(dates[6]) + ' · ' + PL.length + ' posta\nSadece servis personeli.\nG1, S1, S2 her gün mutlaka yazılır; kalan personel T1\'den başlayarak sayıya göre dağıtılır (personel yetmezse sondaki T postaları boş kalır).\nAynı posta üst üste gün gelmez, hafta içinde mümkün olduğunca tekrar etmez.' + (Object.keys(pgFix()).length ? '\nSabit: ' + Object.keys(pgFix()).map(k => k + ' → ' + nice(((D && D.staff) || []).filter(x => x.id == pgFix()[k]).map(x => x.name)[0] || '?')).join(', ') : '') + '\nO haftanın mevcut posta atamalarının üzerine yazılır.', [], async () => {
    pop('🎲 Postalar dağıtılıyor…', '<p class="sub">Kaydediliyor…</p>', true); $('mo').textContent = 'Kapat'; $('mc').style.display = 'none';
    try {
      const last0 = {};
      try { const q = new Date(dates[0] + 'T00:00:00Z'); q.setUTCDate(q.getUTCDate() - 1); const r0 = await gs('getPosta', B, q.toISOString().slice(0, 10)); Object.keys(r0.m || {}).forEach(k => { last0[r0.m[k]] = k; }); } catch (e) {}
      const plan = postaPlan(days, PL, last0, {});      // G1 sabit değil: herkese eşit dağılır
      for (const d of dates) if (days.find(x => x.d == d).staff.length) await gs('savePosta', B, d, plan[d] || {}, PIN);
      const nm = {}, work = {}, inv = {}; days.forEach(x => { work[x.d] = {}; x.staff.forEach(s => { nm[s.id] = s; work[x.d][s.id] = 1; }); });
      dates.forEach(d => { inv[d] = {}; Object.keys(plan[d] || {}).forEach(k => { inv[d][plan[d][k]] = k; }); });
      const ids = Object.keys(nm).sort((x, y) => (nm[x].ord || 1e9) - (nm[y].ord || 1e9) || nm[x].name.localeCompare(nm[y].name, 'tr')), GK = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
      const head = '<tr><th class="l">Ad Soyad</th>' + dates.map(d => '<th>' + GK[new Date(d + 'T00:00:00Z').getUTCDay()] + '<br><small>' + f(d) + '</small></th>').join('') + '</tr>';
      const rows = ids.map(id => '<tr><td class="l"><b>' + esc(nice(nm[id].name)) + '</b></td>' + dates.map(d => '<td>' + (work[d][id] ? (inv[d][id] ? '<b>' + esc(inv[d][id]) + '</b>' : '—') : '<span style="opacity:.35">·</span>') + '</td>').join('') + '</tr>').join('');
      pop('🎲 Haftalık posta dağılımı', '<div style="overflow:auto"><table class="xl xl2">' + head + rows + '</table></div><p class="sub" style="margin:8px 2px;line-height:1.5">· = o gün çalışmıyor · — = o gün postası yok. Kaydedildi ✓ Garsonlar kendi postasını ana ekranda görür.</p>'
        + '<div style="display:flex;gap:8px;margin-top:8px"><button class="a an" style="flex:1" onclick="postaAuto()">🔁 Yeniden dağıt</button><button class="a ed" style="flex:1" onclick="postaUI(PD)">← Postalara dön</button></div>', true);
      $('mo').textContent = 'Kapat'; $('mc').style.display = 'none';
    } catch (e) { msg('Dağıtım kaydedilemedi: ' + (e && e.message || e)); }
  }, 'Dağıt');
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
  setTimeout(() => { try { window.vidAdBoot(); } catch (e) {} }, 1500);   // reklam videosu: uygulama açılınca başlat
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
    const dl = ['RUNNER', 'BAR', 'HOSTES', 'TEMİZLİK', 'SERVİS', 'EĞİTİM']; D.staff.forEach(x => { if (x.sec && dl.indexOf(x.sec) < 0) dl.push(x.sec); });
    const cur = s.sec || '', dopts = (cur ? [cur] : []).concat(dl.filter(x => x !== cur)).map(c => [c, c]);
    const fields = dts.map((d, i) => ({ label: DN[i] + ' ' + d.slice(8) + '.' + d.slice(5, 7), val: cellTxt(s.sh && s.sh[i]) }));
    if (!sec) fields.push({ label: 'Departman', type: 'select', opts: dopts });
    ask('✏️ ' + nice(s.name) + ' · bu haftanın vardiyası + departman\nSaat yaz: 14:00-24:00 · boş bırak = izinli',
      fields,
      async v => { try { await gs('setShiftWeek', s.id, v.slice(0, 7), dts, sec || v[7] || '', PIN); ref(); } catch (e) { msg(e && e.message || 'Kaydedilemedi'); } }, 'Kaydet');
  }
  window.shEdit = id => { const s = D.staff.find(x => x.id == id); if (s) form(s, ''); };
  window.shDel = id => { const s = D.staff.find(x => x.id == id); if (!s) return; ask(nice(s.name) + ' vardiya listesinden çıkarılsın mı?\nBu haftanın vardiyası silinir; tabloda görünmez.', [], async () => { try { await gs('shiftRemove', id, wkDates(), PIN); ref(); } catch (e) { msg(e && e.message); } }, 'Sil'); };
  window.shAdd = () => {
    const out = D.staff.filter(s => !s.sec).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    if (!out.length) { msg('Hepsi zaten vardiya listesinde.'); return; }
    const secs = []; D.staff.forEach(s => { if (s.sec && secs.indexOf(s.sec) < 0) secs.push(s.sec); });
    if (!secs.length) secs.push('SERVİS');
    if (secs.indexOf('EĞİTİM') < 0) secs.push('EĞİTİM');
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
  function permRow(a) {
    const full = !Array.isArray(a.perms), sel = a.perms || [];
    const grid = window.PERMS.map(p => '<label style="display:flex;align-items:center;gap:6px;font-size:12.5px"><input type="checkbox" data-pg="' + esc(a.id) + '" value="' + p[0] + '" ' + (sel.indexOf(p[0]) >= 0 ? 'checked' : '') + '>' + p[1] + ' ' + p[2] + '</label>').join('');
    return '<div class="mdc" style="flex-direction:column;align-items:stretch;gap:8px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center"><div><b>' + esc(a.name) + '</b><small>Yönetici</small></div><button class="a off" style="padding:9px 12px" data-i="' + esc(a.id) + '" onclick="admDelU(this.dataset.i)">Çıkar</button></div>'
      + '<label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" id="pfa-' + esc(a.id) + '" ' + (full ? 'checked' : '') + ' onchange="admPermToggle(\'' + esc(a.id) + '\',this.checked)"> Tüm yetkiler</label>'
      + '<div id="pg-' + esc(a.id) + '" style="display:' + (full ? 'none' : 'grid') + ';grid-template-columns:1fr 1fr;gap:4px 10px">' + grid + '</div>'
      + '<button class="a" style="width:100%" onclick="admSavePerms(\'' + esc(a.id) + '\')">Kaydet</button>'
      + '</div>';
  }
  window.admPermToggle = (id, full) => { const g = $('pg-' + id); if (g) g.style.display = full ? 'none' : 'grid'; };
  window.admSavePerms = id => {
    const full = $('pfa-' + id) && $('pfa-' + id).checked;
    const perms = full ? null : Array.from(document.querySelectorAll('[data-pg="' + id + '"]:checked')).map(x => x.value);
    gs('adminSetPerms', id, perms, PIN).then(() => msg('Yetkiler kaydedildi ✅')).catch(e => msg(emsg(e)));
  };
  function draw() {
    gs('adminList', PIN).then(L => {
      $('mf').innerHTML = '<p class="sub" style="margin:0 0 10px">Yönetim paneline şifreyle girebilen kişiler. "Tüm yetkiler" işaretli değilse, sadece işaretlediğin ekranları görür.</p>'
        + '<div class="mdc"><div><b>Ana yönetici</b><small>Sen · yönetici ekleyip çıkarabilirsin, her şeyi görür</small></div></div>'
        + (L.length ? L.map(permRow).join('') : '<p class="sub" style="margin-top:10px">Henüz başka yönetici yok.</p>')
        + '<button class="a" style="width:100%;margin-top:12px" onclick="admAddU()">➕ Yönetici ekle</button><button class="a x" style="width:100%;margin-top:8px" onclick="admOwnPin()">🔑 Ana şifreyi değiştir</button>';
    }).catch(e => { $('mf').innerHTML = '<div class="err">' + esc(emsg(e)) + '</div>'; });
  }
  window.admSwitch = () => { $('ov').hidden = true; admForget(); setM('y', true); };
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
      PH = m; save(); try { localStorage.setItem('phc_t', String(Date.now())); } catch (e) {} apply();
    }).getPhotos();
  }
  { let t0 = 0; try { t0 = +localStorage.getItem('phc_t') || 0; } catch (e) {} if (!Object.keys(PH).length || Date.now() - t0 > 45 * 60000) fetchPh(); }   // HIZ: önbellek tazeyse açılışta büyük fotoğraf belgesi indirilmez
setInterval(() => { if (document.visibilityState === 'visible') fetchPh(); }, 45 * 60000);      // kota: fotoğraflar 45 dakikada bir
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


// ===== 💰 Tip Box =====
(function () {

  if (!document.getElementById('tbcss')) {
    const st = document.createElement('style'); st.id = 'tbcss';
    st.textContent = `
.tb{--mut:#8d98b8;--line:rgba(255,255,255,.08);color:#e8ecf8;border-radius:20px;padding:12px;background:radial-gradient(120% 70% at 50% -8%,#1d2a5e 0%,#0d1226 58%,#090d1c 100%)}
.tb *{box-sizing:border-box}
.tb button{font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .12s,filter .12s}
.tb button:active{transform:scale(.96);filter:brightness(1.15)}
.tb-per{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.tb-nav{width:40px;height:40px;border:1px solid var(--line);border-radius:13px;background:rgba(255,255,255,.06);color:#fff;font-size:13px}
.tb-wk{flex:1;text-align:center;font-weight:800;font-size:15px;letter-spacing:.01em}
.tb-badge{display:inline-block;margin-top:4px;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700;background:rgba(34,197,94,.15);color:#86efac}
.tb-badge.off{background:rgba(251,191,36,.15);color:#fcd34d}
.tb-devret{width:100%;margin:0 0 10px;padding:10px;border:1px solid rgba(251,191,36,.35);border-radius:14px;background:linear-gradient(135deg,rgba(180,83,9,.55),rgba(120,53,15,.55));color:#fde68a;font-weight:800;font-size:13px}
.tb-devret small{display:block;font-weight:600;font-size:10.5px;opacity:.8;margin-top:1px}
.tb-hero{position:relative;overflow:hidden;border-radius:24px;padding:18px 14px 14px;text-align:center;color:#fff;background:linear-gradient(135deg,#4338ca 0%,#7c3aed 55%,#c026d3 120%);box-shadow:0 16px 34px rgba(76,29,149,.45),inset 0 1px 0 rgba(255,255,255,.25)}
.tb-hero:before{content:"";position:absolute;right:-50px;top:-60px;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.28),transparent 70%)}
.tb-hero:after{content:"💰";position:absolute;left:12px;top:8px;font-size:22px;opacity:.9}
.tb-lab{position:relative;font-size:12px;font-weight:600;letter-spacing:.03em;opacity:.88}
.tb-pool{position:relative;font-size:40px;font-weight:800;line-height:1.1;margin:4px 0 12px;color:#fff;text-shadow:0 2px 14px rgba(0,0,0,.35)}
.tb-stats{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tb-stat{padding:9px 6px;border-radius:15px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.18)}
.tb-sl{font-size:11px;opacity:.85}
.tb-sv{font-size:19px;font-weight:800;margin-top:1px;color:#fde68a}
.tb-seg{display:flex;gap:4px;padding:4px;margin:14px 0 0;border-radius:18px;background:rgba(255,255,255,.06);border:1px solid var(--line)}
.tb-seg button{flex:1;border:0;border-radius:14px;padding:12px 4px;font-size:14px;font-weight:700;color:var(--mut);background:transparent}
.tb-seg button em{font-style:normal;margin-left:5px;padding:1px 7px;border-radius:99px;font-size:11px;background:rgba(255,255,255,.1)}
.tb-seg button.on{color:#fff;background:linear-gradient(135deg,var(--c1),var(--c2));box-shadow:0 6px 16px rgba(0,0,0,.35)}
.tb-seg button.on em{background:rgba(255,255,255,.25)}
.tb-sum{margin:14px 2px 0}
.tb-prog{height:9px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}
.tb-prog i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#34d399,#22c55e);transition:width .35s}
.tb-sumt{display:flex;justify-content:space-between;margin-top:7px;font-size:12.5px;color:var(--mut)}
.tb-sumt b{color:#86efac}
.tb-sumt span b{color:#e8ecf8}
.tb-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.tb-p{position:relative;min-width:0;overflow:hidden;padding:14px 12px 12px;border-radius:20px;background:linear-gradient(160deg,#1b2347,#121830);border:1px solid var(--line);box-shadow:0 8px 18px rgba(0,0,0,.28)}
.tb-p:before{content:"";position:absolute;left:0;right:0;top:0;height:4px;background:var(--ac)}
.tb-p.paid{border-color:rgba(34,197,94,.6);background:linear-gradient(160deg,#10321f,#0e1c2b)}
.tb-top{display:flex;align-items:center;gap:8px;min-width:0}
.tb-av{flex:none;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:15px;background:var(--ac);color:var(--tc);box-shadow:0 3px 10px rgba(0,0,0,.35)}
.tb-nm{font-weight:800;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tb-dep{font-size:10.5px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}
.tb-sub{margin-top:12px;font-size:11.5px;color:var(--mut)}
.tb-sub.ed:after{content:" ✎";opacity:.8}
.tb-amt{margin-top:1px;font-size:22px;font-weight:800;color:#fbbf24}
.tb-step{display:flex;align-items:center;margin-top:10px;padding:3px;border-radius:15px;background:rgba(0,0,0,.3)}
.tb-step button{flex:none;width:40px;height:40px;border:0;border-radius:12px;background:rgba(255,255,255,.1);color:#fff;font-size:21px;font-weight:700}
.tb-step div{flex:1;text-align:center;font-size:21px;font-weight:800;line-height:1}
.tb-step small{display:block;margin-top:2px;font-size:9.5px;font-weight:600;color:var(--mut)}
.tb-pay{width:100%;margin-top:10px;padding:9px;border:0;border-radius:13px;font-size:12.5px;font-weight:800;color:#cbd5e1;background:rgba(255,255,255,.09)}
.tb-pay.on{color:#fff;background:linear-gradient(135deg,#22c55e,#15803d);box-shadow:0 5px 14px rgba(22,163,74,.4)}
.tb-empty{margin:18px 4px;text-align:center;font-size:13px;color:var(--mut)}
.tb-foot{margin:14px 2px 0;font-size:11.5px;color:var(--mut);text-align:center}
.tb-act{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
.tb-act button{padding:12px 6px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.07);color:#e8ecf8;font-size:13px;font-weight:700;line-height:1.25}
.tb-act button i{display:block;font-style:normal;font-size:19px;margin-bottom:2px}
.tb-act button small{display:block;font-size:10.5px;font-weight:600;color:var(--mut)}
.tb-act button.on{border-color:rgba(56,189,248,.5);background:rgba(14,116,144,.35)}
.tb-act button.on small{color:#7dd3fc}
.tb-big{width:100%;margin-top:8px;padding:14px;border:0;border-radius:16px;color:#fff;font-size:15px;font-weight:800}
.tb-big small{display:block;font-size:11px;font-weight:600;opacity:.85;margin-top:1px}
.tb-big.wa{background:linear-gradient(135deg,#22c55e,#15803d);box-shadow:0 8px 20px rgba(22,163,74,.35)}
.tb-big.xl{background:linear-gradient(135deg,#3b82f6,#1d4ed8);box-shadow:0 8px 20px rgba(37,99,235,.35)}
.tb-back{text-align:center;margin-top:12px}
`;
    document.head.appendChild(st);
  }
  const BASE = 6;                                     // günlük hak ediş = haftalık hak ediş / 6
  const fo = x => String(x || '').toLocaleUpperCase('tr').replace(/İ/g, 'I');
  const grpOf = st => { const c = fo(st.sec); if (/RUNNER|BAR|HOSTES|TEMIZ/.test(c)) return 'rec'; if (!c || /^SERV/.test(c)) return 'pay'; return ''; };
  const depLbl = (x, g) => { const t = String(x.sec || '').trim(); if (!t) return g == 'pay' ? 'Servis' : 'Diğer'; return t.charAt(0).toLocaleUpperCase('tr') + t.slice(1).toLocaleLowerCase('tr'); };
  const DORD = ['RUNNER', 'BAR', 'HOSTES', 'TEMIZ', 'SERV'];
  const dkey = d => { const i = DORD.findIndex(k => fo(d).indexOf(k) > -1); return i < 0 ? 9 : i; };
  const grouped = rows => { const m = new Map(); rows.forEach(r => { const d = r.p.dep || 'Diğer'; if (!m.has(d)) m.set(d, []); m.get(d).push(r); }); return [...m.entries()].sort((a, b) => (dkey(a[0]) - dkey(b[0])) || a[0].localeCompare(b[0], 'tr')); };
  const money = x => (Math.round((Number(x) || 0) * 100) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = v => { v = parseFloat(String(v).replace(',', '.')); return isFinite(v) && v >= 0 ? v : 0; };
  let T = null, WK = '', saveT = null;
  const weekKey = () => { const d = new Date(), td = (d.getDay() + 6) % 7; d.setDate(d.getDate() - td); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  let PER = { cur: '', list: [] };
  const keyDate = k => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const weekLbl = () => {
    const f = x => x.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }), en = (PER.list || []).find(x => x.k == WK);
    let s0 = keyDate((en && en.s) || WK), e0 = keyDate(en && en.e);
    if (!s0) { s0 = new Date(); s0.setDate(s0.getDate() - (s0.getDay() + 6) % 7); }
    if (!e0) { e0 = new Date(s0); e0.setDate(s0.getDate() + 6); }
    return f(s0) + ' – ' + f(e0);
  };
  // ----- kişi renkleri / sıra / grup ayarları (Kişileri düzenle ekranı) -----
  let META = {}, metaT = null;
  const COLS = {
    turuncu: { l: 'Turuncu', f: '#F0883E', t: '#5A2A00' }, yesil: { l: 'Yeşil', f: '#5FAD46', t: '#123D0E' },
    gri: { l: 'Gri', f: '#8C8C8C', t: '#FFFFFF' }, mor: { l: 'Mor', f: '#8B5FBF', t: '#FFFFFF' },
    mavi: { l: 'Mavi', f: '#3B82F6', t: '#FFFFFF' }, sari: { l: 'Sarı', f: '#FFC000', t: '#5A4300' },
    kirmizi: { l: 'Kırmızı', f: '#EF4444', t: '#FFFFFF' }, pembe: { l: 'Pembe', f: '#EC4899', t: '#FFFFFF' }
  };
  const defCol = (dep, g) => { const k = fo(dep); return g == 'pay' ? 'mavi' : /BAR/.test(k) ? 'yesil' : /HOSTES/.test(k) ? 'gri' : /TEMIZ/.test(k) ? 'mor' : 'turuncu'; };
  const saveMeta = () => { clearTimeout(metaT); metaT = setTimeout(() => gs('setTipMeta', B, META, M == 'y' ? PIN : '', meId()).catch(() => {}), 600); };
  const people = () => {                              // vardiyadan gelenler + ekstra eklenenler (+ kişi ayarları)
    const out = { rec: [], pay: [] };
    const put = (o, g0) => { const m = META[o.id] || {}, g = (m.g == 'rec' || m.g == 'pay') ? m.g : g0; if (m.n) o.name = m.n; if (m.d) o.dep = m.d; o.col = m.c && COLS[m.c] ? m.c : defCol(o.dep, g); o.mo = m.o; out[g].push(o); };
    const exDep = e => {                              // ekstra eklenen kişinin departmanı: seçilen > vardiya/personel listesinden bulunan > grubuna göre
      if (e.dep) return e.dep;
      const k = fo(e.name).replace(/[^A-Z0-9]/g, ''), sf = ((D && D.staff) || []).find(x => fo(nice(x.name)).replace(/[^A-Z0-9]/g, '') == k);
      if (sf && sf.sec) return depLbl(sf, grpOf(sf) || 'rec');
      return e.grp == 'pay' ? 'Servis' : 'Diğer';
    };
    ((D && D.staff) || []).filter(x => !x.off && (x.sh || x.sec)).forEach(x => {
      if (T.hide && T.hide[x.id]) return;
      const m = META[x.id] || {}, g = (m.g == 'rec' || m.g == 'pay') ? m.g : grpOf(x); if (!g) return;
      put({ id: x.id, name: nice(x.name), vd: (x.sh || []).filter(Boolean).length, ord: x.ord || 1e9, ex: false, dep: depLbl(x, grpOf(x) || g) }, g);
    });
    T.ex.forEach(e => put({ id: e.id, name: e.name, vd: 0, ord: 1e9, ex: true, dep: exDep(e) }, e.grp == 'pay' ? 'pay' : 'rec'));
    const key = p => p.mo != null ? p.mo : 1e6 + dkey(p.dep) * 1e5 + (p.ord < 1e9 ? p.ord : 99999);
    ['rec', 'pay'].forEach(g => out[g].sort((a, b) => (key(a) - key(b)) || a.name.localeCompare(b.name, 'tr')));
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
  const payBtn = (id, g) => { const on = T.paid && T.paid[id]; return '<button class="tb-pay' + (on ? ' on' : '') + '" onclick="tipPaid(\'' + esc(id) + '\')">' + (on ? '✓ ' + (g == 'pay' ? 'Ödedi' : 'Ödendi') : (g == 'pay' ? 'Ödemedi' : 'Ödenmedi')) + '</button>'; };
  const paidSum = (rows, f) => rows.filter(x => T.paid && T.paid[x.p.id]).reduce((a, x) => a + f(x), 0);
  window.tipPaid = id => { if (!T.paid) T.paid = {}; if (T.paid[id]) delete T.paid[id]; else T.paid[id] = 1; render(); save(); };
  const inp = 'background:#fff;color:#111827;border:1px solid #cbd5e1;border-radius:8px;padding:6px 4px;font-size:14px;text-align:center;width:100%;box-sizing:border-box';
  const th = 'padding:6px 3px;font-size:11px;opacity:.7;font-weight:600';
  const grpRows = (rows, fn, span, clr) => grouped(rows).map(([dep, rs]) => '<tr><td colspan="' + span + '" style="padding:10px 2px 3px;font-size:12px;font-weight:800;color:' + clr + ';border-top:2px solid rgba(255,255,255,.18)">▸ ' + esc(dep.toLocaleUpperCase('tr')) + ' <span style="opacity:.7;font-weight:600">· ' + rs.length + ' kişi</span></td></tr>' + rs.map(fn).join('')).join('');
  const fmt$ = x => money(x) + ' ₺';
  const dayTxt = d => String(d % 1 ? d : Math.round(d));
  const stepBtn = 'width:44px;height:44px;border:0;border-radius:12px;background:rgba(255,255,255,.1);color:#fff;font-size:22px;font-weight:700';
  const ini = n => esc(String(n || '?').trim().charAt(0).toLocaleUpperCase('tr'));
  const render = () => {
    if (T.closed) { renderClosed(); return; }
    if (T.edit) { renderEdit(); return; }
    const C = calc(), tab = T.tab || 'rec', tdays = C.Y.reduce((a, y) => a + y.d, 0), daily = tdays ? C.pool / tdays : 0;
    const pdRec = paidSum(C.R, r => r.pay), nPay = C.Y.filter(y => y.d > 0).length, nPaid = C.Y.filter(y => T.paid[y.p.id]).length;
    const pct = tab == 'rec' ? (C.pool > 0 ? Math.min(100, pdRec / C.pool * 100) : 0) : (nPay ? Math.min(100, nPaid / nPay * 100) : 0);
    const stepper = (id, d) => `<div class="tb-step"><button onclick="tipStep('${esc(id)}',-1)">−</button><div><span id="td_${esc(id)}">${dayTxt(d)}</span><small>gün</small></div><button onclick="tipStep('${esc(id)}',1)">+</button></div>`;
    const card = (p, ac, tc, sub, amtId, amt, d, g) => `<div class="tb-p${T.paid[p.id] ? ' paid' : ''}" style="--ac:${ac};--tc:${tc}"><div class="tb-top"><div class="tb-av">${ini(p.name)}</div><div style="min-width:0"><div class="tb-nm">${esc(p.name)}</div><div class="tb-dep">${esc(p.dep || '')}</div></div></div>${sub}<div id="${amtId}" class="tb-amt">${fmt$(amt)}</div>${stepper(p.id, d)}${payBtn(p.id, g)}</div>`;
    const recCard = r => card(r.p, COLS[r.p.col].f, COLS[r.p.col].t, `<div id="th_${esc(r.p.id)}" class="tb-sub ed" onclick="tipHak('${esc(r.p.id)}')">Hak ${fmt$(r.h)}</div>`, 'tp_' + esc(r.p.id), r.pay, r.d, 'rec');
    const payCard = y => card(y.p, COLS.mavi.f, COLS.mavi.t, `<div id="tg2_${esc(y.p.id)}" class="tb-sub">Günlük ${fmt$(daily)}</div>`, 'ty_' + esc(y.p.id), y.share, y.d, 'pay');
    const tabBtn = (k, t, n, c1, c2) => `<button onclick="tipTab('${k}')" class="${tab == k ? 'on' : ''}" style="--c1:${c1};--c2:${c2}">${t}<em>${n}</em></button>`;
    const grid = (arr, fn, empty) => arr.length ? `<div class="tb-grid">${arr.map(fn).join('')}</div>` : `<p class="tb-empty">${empty}</p>`;
    const hid = Object.keys(T.hide || {}).length;
    const h = `<div class="tb">${periodBar()}
      <div class="tb-hero">
        <div class="tb-lab">Dağıtılacak toplam · ödeme alanların hak edişi</div>
        <div id="tpool" class="tb-pool">${fmt$(C.pool)}</div>
        <div class="tb-stats">
          <div class="tb-stat"><div class="tb-sl">Günlük kişi başı pay</div><div id="tdaily" class="tb-sv">${fmt$(daily)}</div></div>
          <div class="tb-stat"><div class="tb-sl">Ödeme yapanların toplamı</div><div id="tpayt" class="tb-sv">${fmt$(C.Y.reduce((a, y) => a + y.share, 0))}</div></div>
        </div>
      </div>
      <div class="tb-seg">${tabBtn('rec', 'Ödeme Alanlar', C.R.length, '#65a30d', '#3f7d20')}${tabBtn('pay', 'Ödeme Yapanlar', C.Y.length, '#3b82f6', '#1d4ed8')}</div>
      <div class="tb-sum"><div class="tb-prog"><i id="tbar" style="width:${pct.toFixed(1)}%"></i></div>
        <div class="tb-sumt">${tab == 'rec' ? `<div>✓ Ödenen <b id="tpaid">${fmt$(pdRec)}</b></div><span>Kalan <b id="trest">${fmt$(C.pool - pdRec)}</b></span>` : `<div><b id="typ">${nPaid}/${nPay} ödedi</b></div><span></span>`}</div></div>
      ${tab == 'rec' ? grid(C.R, recCard, 'Ödeme alan kişi yok. “Kişileri düzenle”den ekleyebilirsin.') : grid(C.Y, payCard, 'Vardiyada servis personeli bulunamadı.')}
      <div class="tb-foot" id="tinfo">${C.n} kişi ödüyor · <span id="tsave">değişiklikler otomatik kaydedilir</span></div>
      <div class="tb-act">
        <button onclick="tipEdit()"><i>⚙️</i>Kişileri düzenle</button>
        <button onclick="tipAnn()" class="${T.ann ? 'on' : ''}"><i>📢</i>Pazar duyurusu<small>Personel ekranında: ${T.ann ? 'Açık' : 'Gizli'}</small></button>
      </div>
      <button class="tb-big wa" onclick="tipShare()">📲 WhatsApp'ta görsel paylaş</button>
      <button class="tb-big xl" onclick="tipXls()">📊 Excel indir<small>Haftalık Ödeme Listesi</small></button>
      ${hid ? `<div class="tb-back"><a href="#" onclick="tipUnhide();return false" style="color:#93c5fd;font-size:13px">↩ Listeden çıkarılan ${hid} kişiyi geri getir</a></div>` : ''}
      ${M == 'y' ? permHtml() : ''}</div>`;
    $('mf').innerHTML = h;
  };
  const refresh = () => {                              // yazarken odak kaybolmasın: sadece sonuç hücrelerini güncelle
    const C = calc(), set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const tdays = C.Y.reduce((a, y) => a + y.d, 0), daily = tdays ? C.pool / tdays : 0;
    C.R.forEach(r => { set('tp_' + r.p.id, fmt$(r.pay)); set('td_' + r.p.id, dayTxt(r.d)); set('th_' + r.p.id, 'Hak ' + fmt$(r.h)); });
    C.Y.forEach(y => { set('ty_' + y.p.id, fmt$(y.share)); set('td_' + y.p.id, dayTxt(y.d)); set('tg2_' + y.p.id, 'Günlük ' + fmt$(daily)); });
    set('tpool', fmt$(C.pool)); set('tdaily', fmt$(daily)); set('tpayt', fmt$(C.Y.reduce((a, y) => a + y.share, 0)));
    set('tpaid', fmt$(paidSum(C.R, r => r.pay))); set('trest', fmt$(C.pool - paidSum(C.R, r => r.pay)));
    set('typ', C.Y.filter(y => T.paid[y.p.id]).length + '/' + C.Y.filter(y => y.d > 0).length + ' ödedi');
    { const bar = document.getElementById('tbar'); if (bar) { const tb = T.tab || 'rec', pd = paidSum(C.R, r => r.pay), np = C.Y.filter(y => y.d > 0).length, nd = C.Y.filter(y => T.paid[y.p.id]).length, pc = tb == 'rec' ? (C.pool > 0 ? pd / C.pool * 100 : 0) : (np ? nd / np * 100 : 0); bar.style.width = Math.min(100, pc).toFixed(1) + '%'; } }
    const i = document.getElementById('tinfo'); if (i && i.firstChild) i.firstChild.textContent = C.n + ' kişi ödüyor · ';
  };
  window.tipTab = k => { T.tab = k; render(); };
  window.tipStep = (id, dl) => {
    const P = people(), p = P.rec.concat(P.pay).find(x => x.id == id); if (!p) return;
    const o = T.vals[id] || (T.vals[id] = { h: 0, d: null }), cur = o.d == null || o.d === '' ? p.vd : num(o.d);
    o.d = Math.max(0, Math.min(7, cur + dl)); refresh(); save();
  };
  window.tipHak = id => {
    const P = people(), p = P.rec.find(x => x.id == id); if (!p) return;
    ask('Hak ediş · ' + p.name, [{ label: 'Haftalık hak ediş (₺)', val: String((T.vals[id] || {}).h || '') }], v => { window.tipPHak(id, v[0]); render(); }, 'Kaydet');
  };
  // ===== ⚙️ Kişileri düzenle =====
  const selCss = 'background:rgba(255,255,255,.07);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:14px 12px;font-size:16px;width:100%;box-sizing:border-box;margin:0';
  const colOpts = sel => Object.keys(COLS).map(k => `<option value="${k}"${k == sel ? ' selected' : ''}>${COLS[k].l}</option>`).join('');
  const DEPS = ['Runner', 'Bar', 'Hostes', 'Temizlik', 'Servis'];
  const depOpts = cur => (DEPS.some(d => fo(d) == fo(cur)) ? '' : '<option value="" selected>' + esc(cur || 'Departman seç') + '</option>') + DEPS.map(d => `<option value="${d}"${fo(d) == fo(cur) ? ' selected' : ''}>${d}</option>`).join('');
  window.tipPDep = (id, v) => { if (!v) return; (META[id] || (META[id] = {})).d = v; const e = T.ex.find(x => x.id == id); if (e) e.dep = v; save(); saveMeta(); render(); };
  const renderEdit = () => {
    const P = people();
    const row = (p, g) => `<div style="background:linear-gradient(160deg,#1b2347,#121830);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:12px;margin-top:12px;border-left:7px solid ${COLS[p.col].f}">
      <input value="${esc(p.name)}" onchange="tipPName('${esc(p.id)}',this.value)" style="${selCss};font-size:17px">
      <select onchange="tipPDep('${esc(p.id)}',this.value)" style="${selCss};margin-top:8px">${depOpts(p.dep)}</select>
      <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
        <select onchange="tipPType('${esc(p.id)}',this.value)" style="${selCss};flex:1"><option value="rec"${g == 'rec' ? ' selected' : ''}>Ödeme alan</option><option value="pay"${g == 'pay' ? ' selected' : ''}>Ödeme yapan</option></select>
        ${g == 'rec' ? `<input inputmode="decimal" placeholder="Hak edişi (₺)" value="${esc((T.vals[p.id] || {}).h || '')}" onchange="tipPHak('${esc(p.id)}',this.value)" style="${selCss};flex:1">` : '<div style="flex:1;font-size:13px;opacity:.75">Günlük pay otomatik</div>'}
      </div>
      ${g == 'rec' ? `<select onchange="tipPCol('${esc(p.id)}',this.value)" style="${selCss};margin-top:8px">${colOpts(p.col)}</select>` : ''}
      <div style="display:flex;gap:8px;margin-top:8px"><button onclick="tipMove('${esc(p.id)}',-1)" style="${stepBtn};flex:1;width:auto">↑</button><button onclick="tipMove('${esc(p.id)}',1)" style="${stepBtn};flex:1;width:auto">↓</button><button onclick="tipDel('${esc(p.id)}')" style="${stepBtn};flex:1;width:auto;font-size:15px;color:#f87171">🗑️ Sil</button></div></div>`;
    $('mf').innerHTML = `<div class="tb">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><div style="font-size:21px;font-weight:800">⚙️ Kişileri düzenle</div><button onclick="tipEditBack()" style="border:0;border-radius:12px;padding:10px 18px;font-size:15px;color:#fff;background:#1c1c21">Geri</button></div>
      <div style="background:linear-gradient(160deg,#1b2347,#121830);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:12px"><div style="font-weight:800;margin-bottom:8px">➕ Yeni kişi</div>
        <input id="te_n" placeholder="Ad Soyad" style="${selCss}">
        <select id="te_d" style="${selCss};margin-top:8px">${DEPS.map(d => `<option value="${d}">${d}</option>`).join('')}</select>
        <div style="display:flex;gap:8px;margin-top:8px"><select id="te_g" onchange="tipNewType()" style="${selCss};flex:1"><option value="rec">Ödeme alan</option><option value="pay">Ödeme yapan</option></select><input id="te_h" inputmode="decimal" placeholder="Hak edişi (₺)" style="${selCss};flex:1"></div>
        <div style="display:flex;gap:8px;margin-top:8px"><select id="te_c" style="${selCss};flex:1">${colOpts('turuncu')}</select><button onclick="tipNew()" style="${selCss};flex:1;text-align:center">Ekle</button></div></div>
      <div style="font-weight:800;margin:16px 2px 0">💸 Ödeme alanlar</div>${P.rec.map(p => row(p, 'rec')).join('') || '<p style="opacity:.6;font-size:13px">Kimse yok.</p>'}
      <div style="font-weight:800;margin:18px 2px 0">🧾 Ödeme yapanlar</div>${P.pay.map(p => row(p, 'pay')).join('') || '<p style="opacity:.6;font-size:13px">Kimse yok.</p>'}
      <button onclick="tipEditBack()" style="width:100%;margin-top:14px;border:0;border-radius:12px;padding:12px;font-weight:800;font-size:15px;color:#fff;background:#334155">Geri</button></div>`;
  };
  window.tipEdit = () => { T.edit = true; render(); const m = document.getElementById('mf'); if (m) m.scrollTop = 0; };
  window.tipEditBack = () => { T.edit = false; render(); };
  window.tipNewType = () => { const g = document.getElementById('te_g'), h = document.getElementById('te_h'), c = document.getElementById('te_c'); if (!g) return; const rec = g.value == 'rec'; if (h) h.style.display = rec ? '' : 'none'; if (c) c.style.display = rec ? '' : 'none'; };
  window.tipNew = () => {
    const n = (document.getElementById('te_n').value || '').trim(); if (!n) { msg('Ad Soyad yaz'); return; }
    const g = document.getElementById('te_g').value == 'pay' ? 'pay' : 'rec', id = 'x' + Math.random().toString(36).slice(2, 8), P = people();
    const dp = (document.getElementById('te_d') || {}).value || (g == 'pay' ? 'Servis' : 'Runner');
    T.ex.push({ id: id, name: n, grp: g, dep: dp });
    const mx = P[g].reduce((a, p) => Math.max(a, p.mo != null ? p.mo : 0), P[g].length);
    META[id] = { c: g == 'rec' ? document.getElementById('te_c').value : 'mavi', o: mx + 1, g: g, d: dp };
    if (g == 'rec') { T.vals[id] = { h: num(document.getElementById('te_h').value), d: null }; (T.he || (T.he = {}))[id] = 1; }
    render(); save(); saveMeta();
  };
  window.tipPName = (id, v) => {
    v = String(v || '').trim(); if (!v) { render(); return; }
    const e = T.ex.find(x => x.id == id); if (e) e.name = v; else { (META[id] || (META[id] = {})).n = v; }
    save(); saveMeta(); render();
  };
  window.tipPType = (id, g) => {
    g = g == 'pay' ? 'pay' : 'rec'; const e = T.ex.find(x => x.id == id); if (e) e.grp = g;
    const m = META[id] || (META[id] = {}); m.g = g; delete m.o; if (g == 'pay') m.c = 'mavi'; else if (m.c == 'mavi') delete m.c;
    save(); saveMeta(); render();
  };
  window.tipPHak = (id, v) => { const o = T.vals[id] || (T.vals[id] = { h: 0, d: null }); o.h = num(v); (T.he || (T.he = {}))[id] = 1; if (!T.edit) refresh(); save(); };
  window.tipPCol = (id, c) => { if (!COLS[c]) return; (META[id] || (META[id] = {})).c = c; saveMeta(); render(); };
  window.tipMove = (id, dir) => {
    const P = people(), g = P.rec.some(p => p.id == id) ? 'rec' : 'pay', L = P[g], i = L.findIndex(p => p.id == id), j = i + dir;
    if (j < 0 || j >= L.length) return;
    L.forEach((p, k) => { (META[p.id] || (META[p.id] = {})).o = k; });
    const a = META[L[i].id], b = META[L[j].id], t = a.o; a.o = b.o; b.o = t;
    saveMeta(); save(); render();
  };
  const nameSnap = C => { const o = {}; C.R.forEach((r, i) => { o[r.p.id] = { n: r.p.name, g: r.p.dep, c: r.p.col, o: i }; }); C.Y.forEach((y, i) => { o[y.p.id] = { n: y.p.name, g: y.p.dep, c: 'mavi', o: i }; }); return o; };
  const saveNow = () => {
    const C = calc(), res = {};
    C.R.forEach(r => { res[r.p.id] = { r: 'rec', a: r.pay, d: r.d, p: T.paid[r.p.id] ? 1 : 0 }; });
    C.Y.forEach(y => { res[y.p.id] = { r: 'pay', a: y.share, d: y.d, p: T.paid[y.p.id] ? 1 : 0 }; });
    const base = {}; Object.keys(T.he || {}).forEach(id => { base[id] = num((T.vals[id] || {}).h); });
    return gs('saveTipBox', B, WK, { vals: T.vals, ex: T.ex, res: res, paid: T.paid, hide: T.hide, names: nameSnap(C), base: base }, M == 'y' ? PIN : '', meId());
  };
  const save = () => {
    if (T.closed) return;
    const e = document.getElementById('tsave'); if (e) e.textContent = 'kaydediliyor…';
    clearTimeout(saveT); saveT = setTimeout(() => {
      saveNow().then(() => { const x = document.getElementById('tsave'); if (x) x.textContent = '✓ kaydedildi'; }).catch(er => { const x = document.getElementById('tsave'); if (x) x.textContent = '⚠ kaydedilemedi: ' + (er && er.message || ''); });
    }, 700);
  };
  const bBtn = 'border:0;border-radius:10px;padding:8px 14px;font-weight:800;font-size:15px;color:#fff;background:#334155';
  const periodBar = () => '<div class="tb-per"><button class="tb-nav" onclick="tipNav(-1)">◀</button><div class="tb-wk">' + esc(weekLbl()) + '<div><span class="tb-badge' + (T.closed ? ' off' : '') + '">' + (T.closed ? '🔒 Kapandı · hak edişler saklı' : '● Aktif dönem') + '</span></div></div><button class="tb-nav" onclick="tipNav(1)">▶</button></div>'
    + (T.closed ? '' : '<button class="tb-devret" onclick="tipDevret()">➡ Sonraki döneme devret<small>hak edişler aynen aktarılır</small></button>');
  const renderClosed = () => {
    const rows = { rec: [], pay: [] }, st = (D && D.staff) || [];
    Object.keys(T.res || {}).forEach(id => { const r = T.res[id], nm = (T.names || {})[id] || {}, sf = st.find(x => x.id == id), ex = (T.ex || []).find(x => x.id == id); rows[r.r == 'pay' ? 'pay' : 'rec'].push({ id: id, name: nm.n || (sf && nice(sf.name)) || (ex && ex.name) || id, dep: nm.g || '', a: r.a, d: r.d, p: r.p }); });
    const so = arr => arr.sort((x, y) => (x.dep || '').localeCompare(y.dep || '', 'tr') || x.name.localeCompare(y.name, 'tr'));
    const tr = (r, clr) => '<tr style="border-top:1px solid rgba(255,255,255,.1)' + (r.p ? ';background:rgba(22,163,74,.16)' : '') + '"><td style="padding:6px 2px;font-size:13px"><b>' + esc(r.name) + '</b>' + (r.dep ? '<div style="font-size:10.5px;opacity:.6">' + esc(r.dep) + '</div>' : '') + '</td><td style="text-align:center;font-size:13px">' + (r.d % 1 ? r.d : Math.round(r.d)) + '</td><td style="text-align:right;font-weight:700;font-size:13px;color:' + clr + '">' + money(r.a) + '</td><td style="text-align:right;font-size:11px;font-weight:800;color:' + (r.p ? '#86efac' : '#94a3b8') + '">' + (r.p ? '✓' : '—') + '</td></tr>';
    const tot = arr => arr.reduce((a, x) => a + (x.a || 0), 0), tp = arr => arr.filter(x => x.p).reduce((a, x) => a + (x.a || 0), 0);
    const tbl = (arr, ttl, lab, clr) => '<div style="font-weight:800;margin:12px 0 6px">' + ttl + '</div><table style="width:100%;border-collapse:collapse"><tr style="text-align:left"><th style="' + th + '">Personel</th><th style="' + th + ';text-align:center">Gün</th><th style="' + th + ';text-align:right">' + lab + '</th><th style="' + th + ';text-align:right">Durum</th></tr>' + (arr.length ? so(arr).map(r => tr(r, clr)).join('') : '<tr><td colspan="4" style="padding:8px;opacity:.6;font-size:12px">Kayıt yok</td></tr>') + '</table><div style="margin-top:6px;font-size:12px;opacity:.85">Toplam: <b>' + money(tot(arr)) + ' TL</b> · ✓ Ödenen/Ödeyen: <b>' + money(tp(arr)) + ' TL</b></div>';
    $('mf').innerHTML = '<div class="tb">' + periodBar() + tbl(rows.rec, '💸 Ödeme alan personel', 'Hak ediş', '#6ee7b7') + tbl(rows.pay, '🧾 Ödeme yapan personel', 'Ödeyeceği', '#fcd34d') + '<div style="margin-top:12px;font-size:11px;opacity:.65">Bu dönem kapanmıştır; tutarlar kapandığı andaki haliyle saklanır.</div><button onclick="tipXls()" style="width:100%;margin-top:8px;border:0;border-radius:12px;padding:12px;font-weight:800;font-size:15px;color:#fff;background:linear-gradient(135deg,#2563eb,#1d4ed8)">📊 Excel indir (Haftalık Ödeme Listesi)</button></div>';
  };
  window.tipNav = async dir => {
    const keys = (PER.list || []).map(x => x.k); if (PER.cur && keys.indexOf(PER.cur) < 0) keys.push(PER.cur); if (keys.indexOf(WK) < 0) keys.push(WK);
    keys.sort(); const i = keys.indexOf(WK), j = Math.min(keys.length - 1, Math.max(0, i + dir)); if (j === i) { msg(dir < 0 ? 'Daha eski dönem yok' : 'Daha yeni dönem yok'); return; }
    await tipLoad(keys[j]);
  };
  window.tipDevret = () => {
    const en = (PER.list || []).find(x => x.k == WK); let s0 = keyDate((en && en.s) || WK) || new Date(), e0 = keyDate(en && en.e);
    if (!e0) { e0 = new Date(s0); e0.setDate(s0.getDate() + 6); }
    const ns = new Date(e0); ns.setDate(e0.getDate() + 1); const ne = new Date(ns); ne.setDate(ns.getDate() + 6);
    const t2 = d => String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
    const pk = x => { const m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/.exec(String(x || '').trim()); return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : ''; };
    ask('➡ Sonraki döneme devret\n' + weekLbl() + ' dönemi kapanır ve saklanır; hak edişler yeni döneme aynen aktarılır (gün ve ödendi bilgileri sıfırlanır).', [{ label: 'Yeni dönem başlangıcı (gg.aa.yyyy)', val: t2(ns) }, { label: 'Yeni dönem bitişi (gg.aa.yyyy)', val: t2(ne) }], async v => {
      const a = pk(v[0]), b = pk(v[1]); if (!a || !b || b < a) { msg('Tarihleri gg.aa.yyyy şeklinde yaz (bitiş, başlangıçtan önce olamaz)'); return; }
      try { clearTimeout(saveT); await saveNow(); await gs('tipNewPeriod', B, WK, a, b, M == 'y' ? PIN : '', meId()); msg('✓ Yeni dönem açıldı, hak edişler aktarıldı'); } catch (er) { msg(emsg(er)); }
      tipUI();
    }, 'Devret');
  };
  const tipLoad = async k => {
    WK = k; const ann = T ? T.ann : true; T = { vals: {}, ex: [], mode: 'gun', paid: {}, hide: {}, ann: ann, closed: false, res: {}, names: {}, he: {} };
    const pin = M == 'y' ? PIN : '', me = meId();
    try { const d = await gs('getTipBox', B, WK, pin, me); if (d) { T.vals = d.vals || {}; T.ex = d.ex || []; T.paid = d.paid || {}; T.closed = !!d.closed; T.res = d.res || {}; T.names = d.names || {}; if (T.closed) T.hide = d.hide || {}; } } catch (e) {}
    if (!T.closed) {
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
      try {                                                   // hak ediş boş/0 olanlara kişinin son bilinen haftalık hak edişini getir
        const base = await gs('getTipBase', B, pin, me) || {}; let filled = false;
        Object.keys(base).forEach(id => { const b = Number(base[id]) || 0, v = T.vals[id]; if (b > 0 && !(v && Number(v.h) > 0)) { T.vals[id] = Object.assign({ d: null }, v || {}, { h: b }); filled = true; } });
        if (filled) save();
      } catch (e) {}
    }
    render();
  };
  window.tipSet = (id, k, v) => { const o = T.vals[id] || (T.vals[id] = { h: 0, d: null }); if (k == 'h') { o.h = num(v); (T.he || (T.he = {}))[id] = 1; } else o.d = String(v).trim() === '' ? null : num(v); refresh(); save(); };
  window.tipMode = m => { T.mode = m; render(); save(); };
  window.tipAdd = g => { const e = document.getElementById('tx_' + g), n = e ? e.value.trim() : ''; if (!n) return; T.ex.push({ id: 'x' + Math.random().toString(36).slice(2, 8), name: n, grp: g, dep: g == 'pay' ? 'Servis' : 'Runner' }); render(); save(); };
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
    if (TC.id != s0.id) TC = { id: s0.id, v: null, t: 0, wk: '' };
    tipPut();
    if (Date.now() - TC.t < 60 * 60000) return; TC.t = Date.now();      // kota: 60 dk
    gs('getTipPeriod', B).then(p => gs('getTipBoxMine', B, (p && p.cur) || weekKey(), s0.id, new Date().getDay() == 0)).then(v => { if (TC.id == s0.id) { TC.v = v && v.a > 0 ? v : null; tipPut(); if (TC.v && TC.v.ann !== false && !TC.v.p && new Date().getDay() == 0) showAnn(TC.v); } }).catch(() => {});
  };
  // Tip Box yetkilileri (yönetici seçer; yetkili kişinin ana sayfasında Tip Box seçeneği çıkar)
  let lastB = null;
  const permLoad = (force) => {
    const k = 'tipperm_' + B; let c = null; try { c = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) {}
    if (!force && c && Date.now() - c.t < 20 * 60000) { window.__tipIds = c.ids || []; return Promise.resolve(); }      // kota: 20 dk önbellek
    return gs('getTipPerm', B).then(ids => { window.__tipIds = ids || []; try { localStorage.setItem(k, JSON.stringify({ t: Date.now(), ids: ids || [] })); } catch (e) {} }).catch(() => {});
  };
  setInterval(() => { if (B != lastB) { lastB = B; window.__tipIds = []; permLoad(); } }, 1000);
  const meId = () => { try { return localStorage.getItem('mola_me_' + B) || ''; } catch (e) { return ''; } };
  const permHtml = () => {
    const st = people().pay.filter(x => !x.ex).sort((a, b) => a.name.localeCompare(b.name, 'tr')), ids = window.__tipIds || [];
    return '<div style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,.12)"><div style="font-weight:800;margin-bottom:4px">🔑 Tip Box yetkilisi</div><div style="font-size:12px;opacity:.7;margin-bottom:8px">Sadece ödeme yapanlar (servis) arasından seçilir. Seçtiğin kişinin ana sayfasında Tip Box seçeneği çıkar; hak edişleri o girer.</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px">' + st.map(x => { const on = ids.indexOf(x.id) > -1; return '<button onclick="tipPerm(\'' + esc(x.id) + '\')" style="border:1px solid ' + (on ? '#34d399' : 'rgba(255,255,255,.2)') + ';border-radius:999px;padding:6px 10px;font-size:12px;font-weight:700;color:#fff;background:' + (on ? '#047857' : 'transparent') + '">' + (on ? '✓ ' : '') + esc(x.name) + '</button>'; }).join('') + '</div></div>';
  };
  window.tipPerm = id => {
    const ids = (window.__tipIds || []).slice(), k = ids.indexOf(id); if (k > -1) ids.splice(k, 1); else ids.push(id);
    window.__tipIds = ids; render(); try { localStorage.setItem('tipperm_' + B, JSON.stringify({ t: Date.now(), ids: ids })); } catch (e) {}
    gs('setTipPerm', B, ids, PIN).catch(er => { const x = document.getElementById('tsave'); if (x) x.textContent = '⚠ ' + (er && er.message || ''); });
  };
  // ===== 📊 Excel: "Haftalık Ödeme Listesi" =====
  const XL_DEP = d => {
    const k = fo(d);
    if (/RUNNER/.test(k)) return { f: 'FFF0883E', t: 'FF5A2A00' };    // turuncu
    if (/BAR/.test(k)) return { f: 'FF5FAD46', t: 'FF123D0E' };       // yeşil
    if (/HOSTES/.test(k)) return { f: 'FF8C8C8C', t: 'FFFFFFFF' };    // gri
    if (/TEMIZ/.test(k)) return { f: 'FF8B5FBF', t: 'FFFFFFFF' };     // mor
    return { f: 'FFBFC5CC', t: 'FF1F2937' };
  };
  window.tipXls = async () => {
    try {
      msg('Excel hazırlanıyor…');
      const EJ = await loadExcelJS();
      const rec = [], pay = [];
      if (T.closed) {
        const st = (D && D.staff) || [];
        Object.keys(T.res || {}).forEach(id => {
          const r = T.res[id], nm = (T.names || {})[id] || {}, sf = st.find(x => x.id == id), ex = (T.ex || []).find(x => x.id == id);
          const name = nm.n || (sf && nice(sf.name)) || (ex && ex.name) || id;
          if (r.r == 'pay') pay.push({ name: name, o: nm.o, d: Number(r.d) || 0 });
          else rec.push({ name: name, dep: nm.g || '', col: nm.c, o: nm.o, h: num((T.vals[id] || {}).h), d: Number(r.d) || 0, fixed: Number(r.a) || 0 });
        });
      } else {
        const C = calc();
        C.R.filter(r => r.pay > 0 || r.h > 0).forEach(r => rec.push({ name: r.p.name, dep: r.p.dep, col: r.p.col, h: r.h, d: r.d }));
        C.Y.filter(y => y.d > 0).forEach(y => pay.push({ name: y.p.name, d: y.d }));
      }
      if (T.closed) { const so = (a, b) => ((a.o == null ? 1e6 : a.o) - (b.o == null ? 1e6 : b.o)) || a.name.localeCompare(b.name, 'tr'); rec.sort(so); pay.sort(so); }   // açık dönemde sıra: Kişileri düzenle'deki sıra
      const br = B == 'mavi' ? 'Mavi Bahçe' : 'Optimum';
      const en = (PER.list || []).find(x => x.k == WK);
      let s0 = keyDate((en && en.s) || WK) || new Date(), e0 = keyDate(en && en.e);
      if (!e0) { e0 = new Date(s0); e0.setDate(s0.getDate() + 6); }
      const d2 = d => String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0');
      const per = d2(s0) + ' - ' + d2(e0) + '.' + e0.getFullYear();
      const wb = new EJ.Workbook(), ws = wb.addWorksheet('Haftalık Ödeme', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
      ws.views = [{ showGridLines: false }];
      [34, 16, 16, 9, 4, 34, 21, 9].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      const FN = 'Arial';
      const grey = { style: 'thin', color: { argb: 'FF9CA3AF' } }, bd = { left: grey, right: grey, top: grey, bottom: grey };
      const put = (r, c, v, o) => {
        const cell = ws.getCell(r, c); o = o || {};
        cell.value = v;
        cell.font = { name: FN, size: o.size || 12, italic: o.italic !== false, bold: !!o.bold, color: { argb: o.color || 'FF111111' } };
        if (o.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill }, bgColor: { argb: o.fill } };
        if (o.border !== false) cell.border = bd;
        cell.alignment = { horizontal: o.align || 'center', vertical: 'middle' };
        if (o.nf) cell.numFmt = o.nf;
        return cell;
      };
      ws.mergeCells(1, 1, 1, 8);
      put(1, 1, 'Haftalık Ödeme Listesi', { size: 24, italic: false, border: false, align: 'left' }); ws.getRow(1).height = 40;
      ws.mergeCells(2, 1, 2, 8);
      put(2, 1, br + ' Tip Box · ' + per, { size: 13, italic: false, border: false, align: 'left', color: 'FF6B7280' }); ws.getRow(2).height = 24;
      const HR = 4;
      ['ADI SOYADI', 'HAK EDİŞİ', 'TOPLAM', 'GÜN'].forEach((t, i) => put(HR, 1 + i, t, { size: 12, fill: 'FFFFFFFF' }));
      ['ADI SOYADI', 'ÖDENECEK TUTAR', 'GÜN'].forEach((t, i) => put(HR, 6 + i, t, { size: 12, fill: 'FFFFFFFF' }));
      ws.getRow(HR).height = 30;
      const NF = '#,##0.00';
      const r1 = HR + 1, rN = HR + rec.length, p1 = HR + 1, pN = HR + pay.length;
      const sumRow = Math.max(rN, pN) + 2;           // alt toplam satırı (iki tablonun altında)
      rec.forEach((x, i) => {
        const r = r1 + i, cl = (COLS[x.col] ? { f: 'FF' + COLS[x.col].f.slice(1), t: 'FF' + COLS[x.col].t.slice(1) } : XL_DEP(x.dep));
        put(r, 1, String(x.name || '').toLocaleUpperCase('tr'), { fill: cl.f, color: cl.t, align: 'left' });
        put(r, 2, x.h || 0, { fill: 'FFFFFFFF', nf: NF });
        const v = x.fixed != null ? x.fixed : (x.h / BASE) * x.d;
        put(r, 3, x.fixed != null ? x.fixed : { formula: 'B' + r + '/' + BASE + '*D' + r, result: v }, { fill: 'FF4472C4', color: 'FFFFFFFF', nf: NF });
        put(r, 4, x.d, { fill: 'FFFFC000', color: 'FF7A4B00', nf: '0.##' });
        ws.getRow(r).height = 27;
      });
      const poolV = rec.reduce((a, x) => a + (x.fixed != null ? x.fixed : (x.h / BASE) * x.d), 0), tdV = pay.reduce((a, y) => a + y.d, 0), dailyV = tdV ? poolV / tdV : 0;
      pay.forEach((y, i) => {
        const r = p1 + i;
        put(r, 6, String(y.name || '').toLocaleUpperCase('tr'), { fill: 'FF0070C0', color: 'FFDDEBF7', align: 'left' });
        put(r, 7, { formula: '$G$' + sumRow + '*H' + r, result: dailyV * y.d }, { fill: 'FF000000', color: 'FFFFFFFF', nf: NF });
        put(r, 8, y.d, { fill: 'FFE5E7EB', color: 'FF374151', nf: '0.##' });
        ws.getRow(r).height = 27;
      });
      const lab = (r, c, t, o) => put(r, c, t, Object.assign({ border: false, italic: false, align: 'left', size: 12 }, o || {}));
      const money2 = { border: false, italic: false, align: 'left', nf: '#,##0.00" ₺"' };
      lab(sumRow, 1, 'Ödeme alanların toplamı:'); ws.mergeCells(sumRow, 1, sumRow, 2);
      put(sumRow, 3, rec.length ? { formula: 'SUM(C' + r1 + ':C' + rN + ')', result: poolV } : 0, Object.assign({ size: 12, bold: true }, money2));
      lab(sumRow, 6, 'Günlük kişi başı pay:');
      const dsum = pay.length ? 'SUM(H' + p1 + ':H' + pN + ')' : '0';
      put(sumRow, 7, { formula: 'IF(' + dsum + '=0,0,$C$' + sumRow + '/' + dsum + ')', result: dailyV }, Object.assign({ size: 12, bold: true }, money2));
      lab(sumRow + 1, 6, 'Ödeme yapanların toplamı:', { size: 11, color: 'FF6B7280' });
      put(sumRow + 1, 7, pay.length ? { formula: 'SUM(G' + p1 + ':G' + pN + ')', result: dailyV * tdV } : 0, Object.assign({ size: 11, color: 'FF6B7280' }, money2));
      ws.getRow(sumRow).height = 24; ws.getRow(sumRow + 1).height = 22;
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const l = document.createElement('a');
      l.href = URL.createObjectURL(blob); l.download = 'TipBox_' + (B == 'mavi' ? 'MaviBahce' : 'Optimum') + '_' + d2(s0).replace('.', '-') + '_' + d2(e0).replace('.', '-') + '.xlsx';
      document.body.appendChild(l); l.click(); setTimeout(() => { URL.revokeObjectURL(l.href); l.remove(); }, 4000);
      msg('✓ Excel indirildi');
    } catch (e) { msg('Excel hazırlanamadı: ' + (e && e.message || e)); }
  };
  // ===== 📲 WhatsApp'ta görsel paylaş =====
  window.tipShare = async () => {
    const C = calc(), W = 900, rh = 46, pad = 34;
    const R = C.R.filter(r => r.pay > 0 || r.h > 0), Y = C.Y.filter(y => y.d > 0);
    const H = pad + 120 + 70 + R.length * rh + 90 + 70 + Y.length * rh + 90 + (grouped(R).length + grouped(Y).length) * rh;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0f172a'); bg.addColorStop(1, '#1e1b4b'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const txt = (t, x, y, f, c, a) => { g.font = f; g.fillStyle = c; g.textAlign = a || 'left'; g.fillText(t, x, y); };
    const br = B == 'mavi' ? 'Mavi Bahçe' : 'Optimum';
    let y = pad + 40; txt('💰 Tip Box', pad, y, 'bold 40px sans-serif', '#fff'); y += 40; txt(br + ' · ' + weekLbl(), pad, y, '24px sans-serif', '#cbd5e1');
    const sec = (title, col, colR, rows, label, tot, vf) => {
      y += 50; g.fillStyle = col; g.fillRect(pad, y - 30, W - 2 * pad, 44); txt(title, pad + 14, y, 'bold 24px sans-serif', '#fff'); txt('Gün', W - 300, y, 'bold 20px sans-serif', '#fff', 'center'); txt(label, W - pad - 14, y, 'bold 20px sans-serif', '#fff', 'right'); y += 26;
      grouped(rows).forEach(([dep, rs]) => {
        y += rh; g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(pad, y - 32, W - 2 * pad, rh);
        txt('▸ ' + dep.toLocaleUpperCase('tr') + ' · ' + rs.length + ' kişi', pad + 14, y, 'bold 21px sans-serif', colR);
        txt(money(rs.reduce((a, r) => a + vf(r), 0)) + ' TL', W - pad - 14, y, 'bold 20px sans-serif', colR, 'right');
        rs.forEach((r, i) => {
          y += rh; if (i % 2) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(pad, y - 32, W - 2 * pad, rh); }
          txt(r.p.name + (T.paid && T.paid[r.p.id] ? '  ✓' : ''), pad + 14, y, '24px sans-serif', T.paid && T.paid[r.p.id] ? '#86efac' : '#f1f5f9');
          txt(String(r.d % 1 ? r.d : Math.round(r.d)), W - 300, y, '24px sans-serif', '#cbd5e1', 'center');
          txt(money(vf(r)) + ' TL', W - pad - 14, y, 'bold 24px sans-serif', colR, 'right');
        });
      });
      y += rh + 8; g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(pad, y - 34, W - 2 * pad, 48); txt('TOPLAM', pad + 14, y, 'bold 26px sans-serif', '#fff'); txt(money(tot) + ' TL', W - pad - 14, y, 'bold 26px sans-serif', colR, 'right');
    };
    sec('💸 ÖDEME ALANLAR', '#047857', '#6ee7b7', R, 'Alacağı', C.pool, r => r.pay);
    sec('🧾 ÖDEME YAPANLAR', '#b45309', '#fcd34d', Y, 'Ödeyeceği', C.pool, y2 => y2.share);
    const blob = await new Promise(ok => cv.toBlob(ok, 'image/png'));
    const file = new File([blob], 'tip-box.png', { type: 'image/png' }), cap = '💰 Tip Box · ' + br + ' · ' + weekLbl();
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: cap }); return; }
    } catch (e) { if (e && e.name == 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tip-box.png'; document.body.appendChild(a); a.click(); a.remove();
    window.open('https://wa.me/?text=' + encodeURIComponent(cap), '_blank');
  };
  window.tipUI = async () => {
    if (!(M == 'y' || (meId() && (window.__tipIds || []).indexOf(meId()) > -1))) return;
    T = { vals: {}, ex: [], mode: 'esit', paid: {}, hide: {}, ann: true, closed: false, res: {}, names: {} };
    pop('💰 Tip Box', '<p class="sub">Yükleniyor…</p>', true);
    try { PER = (await gs('getTipPeriod', B)) || { cur: '', list: [] }; } catch (e) { PER = { cur: '', list: [] }; }
    try { T.ann = (await gs('getTipAnn', B)) !== false; } catch (e) {}
    try { META = (await gs('getTipMeta', B, M == 'y' ? PIN : '', meId())) || {}; } catch (e) { META = {}; }
    await tipLoad(PER.cur || weekKey());
  };
})();


// ===== 🧠 Bilgi Oyunu · tamamen çevrimdışı: sorular cihazda, Firestore/ağ kullanmaz → kota harcamaz =====
(function () {
  // [kategori, soru, DOĞRU cevap, yanlış1, yanlış2, yanlış3, açıklama]
  const RAW = [
    ['gk', 'Bir yılda yaklaşık kaç hafta vardır?', '52', '48', '56', '60', 'Bir yıl 365 gün, yani yaklaşık 52 haftadır.'],
    ['gk', 'Satrançta en güçlü taş hangisidir?', 'Vezir', 'Kale', 'Fil', 'At', 'Vezir tahtanın en güçlü taşıdır.'],
    ['gk', 'Gökkuşağında kaç renk vardır?', '7', '5', '6', '8', 'Kırmızıdan mora tam 7 renk sayılır.'],
    ['gk', 'Standart bir piyanoda kaç tuş vardır?', '88', '76', '64', '100', 'Standart piyano 52 beyaz + 36 siyah, toplam 88 tuştur.'],
    ['gk', 'Mona Lisa tablosunun ressamı kimdir?', 'Leonardo da Vinci', 'Michelangelo', 'Rembrandt', 'Picasso', 'Mona Lisa, Leonardo da Vinci’nin eseridir.'],
    ['gk', '“Yüzüklerin Efendisi” kitabının yazarı kimdir?', 'J.R.R. Tolkien', 'C.S. Lewis', 'J.K. Rowling', 'George R.R. Martin', ''],
    ['gk', 'Hangi hayvan “çölün gemisi” olarak bilinir?', 'Deve', 'At', 'Fil', 'Zürafa', 'Deve, susuzluğa dayanıklılığıyla çölün gemisi sayılır.'],
    ['gk', 'Roma rakamlarında “X” kaçı gösterir?', '10', '5', '50', '100', ''],
    ['gk', 'Olimpiyat bayrağında kaç halka vardır?', '5', '4', '6', '7', 'Beş halka, beş kıtayı simgeler.'],
    ['gk', 'Ana dil olarak en çok konuşulan dil hangisidir?', 'Mandarin Çincesi', 'İngilizce', 'İspanyolca', 'Hintçe', ''],
    ['gk', 'Nobel Barış Ödülü hangi şehirde verilir?', 'Oslo', 'Stockholm', 'Cenevre', 'Brüksel', 'Diğer Nobel ödülleri Stockholm’de, Barış Ödülü Oslo’da verilir.'],
    ['gk', 'Tavlada her oyuncunun kaç pulu vardır?', '15', '12', '16', '10', ''],
    ['gk', 'Bir saat kaç saniyedir?', '3600', '360', '6000', '1800', '60 dakika × 60 saniye = 3600.'],
    ['gk', 'Hangisi telli bir çalgıdır?', 'Bağlama', 'Davul', 'Ney', 'Zurna', ''],

    ['cg', 'Türkiye’nin en yüksek dağı hangisidir?', 'Ağrı Dağı', 'Erciyes', 'Uludağ', 'Kaçkar Dağı', 'Ağrı Dağı yaklaşık 5137 m ile en yüksek dağımızdır.'],
    ['cg', 'Türkiye’nin en büyük gölü hangisidir?', 'Van Gölü', 'Tuz Gölü', 'Beyşehir Gölü', 'Eğirdir Gölü', ''],
    ['cg', 'Eyfel Kulesi hangi şehirdedir?', 'Paris', 'Londra', 'Roma', 'Berlin', ''],
    ['cg', 'Dünyanın en büyük kıtası hangisidir?', 'Asya', 'Afrika', 'Avrupa', 'Kuzey Amerika', ''],
    ['cg', 'Sahra Çölü hangi kıtadadır?', 'Afrika', 'Asya', 'Avustralya', 'Güney Amerika', ''],
    ['cg', 'Pamukkale hangi ilimizdedir?', 'Denizli', 'Muğla', 'Aydın', 'Burdur', ''],
    ['cg', 'Türkiye kaç coğrafi bölgeye ayrılır?', '7', '5', '6', '8', 'Marmara, Ege, Akdeniz, İç Anadolu, Karadeniz, Doğu ve Güneydoğu Anadolu.'],
    ['cg', 'Çanakkale Boğazı hangi iki denizi birbirine bağlar?', 'Ege ve Marmara', 'Marmara ve Karadeniz', 'Akdeniz ve Ege', 'Karadeniz ve Ege', ''],
    ['cg', 'Avustralya’nın başkenti neresidir?', 'Canberra', 'Sidney', 'Melbourne', 'Perth', 'Büyük şehirler Sidney ve Melbourne olsa da başkent Canberra’dır.'],
    ['cg', 'Nemrut Dağı’ndaki dev heykeller hangi ilimizdedir?', 'Adıyaman', 'Van', 'Malatya', 'Elazığ', ''],
    ['cg', 'Kızılırmak hangi denize dökülür?', 'Karadeniz', 'Ege Denizi', 'Akdeniz', 'Marmara Denizi', ''],
    ['cg', 'Kolezyum hangi şehirdedir?', 'Roma', 'Atina', 'Madrid', 'Viyana', ''],
    ['cg', 'Amazon Ormanları’nın büyük bölümü hangi ülkededir?', 'Brezilya', 'Arjantin', 'Meksika', 'Peru', ''],
    ['cg', 'Hangi şehrimiz iki kıta üzerinde yer alır?', 'İstanbul', 'Ankara', 'İzmir', 'Çanakkale', 'İstanbul hem Avrupa hem Asya’dadır.'],
    ['cg', 'Dünyanın en büyük okyanusu hangisidir?', 'Pasifik', 'Atlas', 'Hint', 'Arktik', ''],

    ['th', 'Cumhuriyet hangi tarihte ilan edildi?', '29 Ekim 1923', '23 Nisan 1920', '30 Ağustos 1922', '19 Mayıs 1919', ''],
    ['th', 'İstanbul hangi yıl fethedildi?', '1453', '1071', '1299', '1517', 'Fatih Sultan Mehmet, 1453’te İstanbul’u fethetti.'],
    ['th', 'Malazgirt Savaşı hangi yıl yapıldı?', '1071', '1453', '1299', '1402', 'Alparslan komutasındaki Selçuklular Bizans’ı yendi.'],
    ['th', 'Osmanlı Devleti’nin kurucusu kimdir?', 'Osman Bey', 'Orhan Bey', 'Ertuğrul Gazi', 'Murat Hüdavendigâr', ''],
    ['th', 'Çanakkale Deniz Zaferi hangi tarihte kazanıldı?', '18 Mart 1915', '18 Mart 1918', '25 Nisan 1915', '10 Kasım 1938', ''],
    ['th', 'Ay’a ayak basan ilk insan kimdir?', 'Neil Armstrong', 'Buzz Aldrin', 'Yuri Gagarin', 'John Glenn', 'Neil Armstrong, 1969’da Ay’a ilk adımı attı.'],
    ['th', 'Berlin Duvarı hangi yıl yıkıldı?', '1989', '1979', '1991', '1985', ''],
    ['th', 'İkinci Dünya Savaşı hangi yıl sona erdi?', '1945', '1939', '1950', '1941', ''],
    ['th', 'Türkiye’de kadınlara milletvekili seçme ve seçilme hakkı hangi yıl verildi?', '1934', '1923', '1928', '1946', ''],
    ['th', 'Efsanevi Troya antik kenti hangi ilimizdedir?', 'Çanakkale', 'İzmir', 'Balıkesir', 'Aydın', ''],
    ['th', 'Ayasofya’yı yaptıran Bizans İmparatoru kimdir?', 'Justinianus', 'Konstantin', 'Heraklius', 'Theodosius', ''],
    ['th', 'Kanuni Sultan Süleyman kaçıncı Osmanlı padişahıdır?', '10.', '5.', '7.', '12.', ''],
    ['th', 'Harf Devrimi (yeni Türk harfleri) hangi yıl yapıldı?', '1928', '1923', '1934', '1938', ''],
    ['th', 'Piramitler hangi uygarlığa aittir?', 'Eski Mısır', 'Roma', 'Sümer', 'Hitit', ''],

    ['bl', 'Suyun kimyasal formülü nedir?', 'H2O', 'CO2', 'O2', 'NaCl', ''],
    ['bl', 'Güneş Sistemi’nin en büyük gezegeni hangisidir?', 'Jüpiter', 'Satürn', 'Neptün', 'Dünya', ''],
    ['bl', 'Yetişkin bir insanda kaç kemik bulunur?', '206', '150', '300', '412', ''],
    ['bl', 'Elmas hangi elementten oluşur?', 'Karbon', 'Silisyum', 'Demir', 'Kalsiyum', 'Elmas, saf karbonun kristal halidir.'],
    ['bl', 'Altının element simgesi nedir?', 'Au', 'Ag', 'Fe', 'Gd', 'Au, Latince “aurum”dan gelir.'],
    ['bl', 'Atmosferde en çok bulunan gaz hangisidir?', 'Azot', 'Oksijen', 'Karbondioksit', 'Argon', 'Hava yaklaşık %78 azottur.'],
    ['bl', '“Kızıl Gezegen” olarak bilinen gezegen hangisidir?', 'Mars', 'Venüs', 'Merkür', 'Uranüs', ''],
    ['bl', 'Yer çekimi yasasını formüle eden bilim insanı kimdir?', 'Isaac Newton', 'Albert Einstein', 'Galileo', 'Nikola Tesla', ''],
    ['bl', 'Ses hangi ortamda yayılamaz?', 'Boşlukta', 'Suda', 'Havada', 'Metalde', 'Ses yayılmak için bir madde ortamına ihtiyaç duyar.'],
    ['bl', 'Güneş ışığıyla vücudumuzda üretilen vitamin hangisidir?', 'D vitamini', 'C vitamini', 'B12 vitamini', 'A vitamini', ''],
    ['bl', 'Örümceklerin kaç bacağı vardır?', '8', '6', '10', '4', ''],
    ['bl', 'Balinalar hangi canlı grubundandır?', 'Memeli', 'Balık', 'Sürüngen', 'Kabuklu', 'Balinalar balık değil, memelidir.'],
    ['bl', 'Ahtapotun kaç kalbi vardır?', '3', '1', '2', '4', ''],
    ['bl', 'Işığın boşluktaki hızı yaklaşık kaç km/sn’dir?', '300.000', '30.000', '3.000', '3.000.000', ''],
    ['bl', 'Bitkiler fotosentezde hangi gazı kullanır?', 'Karbondioksit', 'Oksijen', 'Azot', 'Hidrojen', ''],

    ['sp', 'Voleybolda bir takım sahada kaç oyuncuyla yer alır?', '6', '5', '7', '9', ''],
    ['sp', 'Maraton yaklaşık kaç kilometredir?', '42 km', '21 km', '10 km', '50 km', 'Maraton mesafesi 42,195 km’dir.'],
    ['sp', 'FIFA Dünya Kupası kaç yılda bir yapılır?', '4', '2', '3', '5', ''],
    ['sp', 'Wimbledon tenis turnuvası hangi zeminde oynanır?', 'Çim', 'Kil', 'Sert zemin', 'Halı', ''],
    ['sp', 'Futbolda normal bir maç kaç dakikadır?', '90', '80', '100', '120', ''],
    ['sp', '“Ippon” terimi hangi spora aittir?', 'Judo', 'Karate', 'Boks', 'Eskrim', ''],
    ['sp', 'Basketbolda bir takım sahada kaç oyuncuyla yer alır?', '5', '6', '7', '4', ''],
    ['sp', 'Satranç tahtasında kaç kare vardır?', '64', '49', '81', '100', '8 × 8 = 64 kare.'],
    ['sp', 'Basketbolda serbest atış kaç sayıdır?', '1', '2', '3', '0', ''],
    ['sp', 'Hangisi bir raket sporu değildir?', 'Yüzme', 'Badminton', 'Tenis', 'Squash', ''],
    ['sp', 'Futbolda penaltı noktası kale çizgisine kaç metre uzaktadır?', '11', '9', '7', '13', ''],
    ['sp', 'Yaz Olimpiyat Oyunları kaç yılda bir düzenlenir?', '4', '2', '3', '5', ''],

    ['kl', 'Orhan Pamuk hangi yıl Nobel Edebiyat Ödülü’nü kazandı?', '2006', '1998', '2010', '2001', ''],
    ['kl', 'İstiklal Marşı’nın şairi kimdir?', 'Mehmet Akif Ersoy', 'Ziya Gökalp', 'Nâzım Hikmet', 'Yahya Kemal', ''],
    ['kl', 'Harry Potter serisinin yazarı kimdir?', 'J.K. Rowling', 'Roald Dahl', 'Stephen King', 'Dan Brown', ''],
    ['kl', 'Titanik gemisi hangi yıl battı?', '1912', '1905', '1922', '1898', ''],
    ['kl', '“İnce Memed” romanının yazarı kimdir?', 'Yaşar Kemal', 'Orhan Kemal', 'Aziz Nesin', 'Sait Faik', ''],
    ['kl', 'Nasreddin Hoca hangi ilçemizle özdeşleşmiştir?', 'Akşehir', 'Bolu', 'Safranbolu', 'Ürgüp', ''],
    ['kl', 'Mevlânâ’nın türbesi hangi ilimizdedir?', 'Konya', 'Ankara', 'Kayseri', 'Sivas', ''],
    ['kl', 'Mimar Sinan’ın “ustalık eserim” dediği cami hangisidir?', 'Selimiye Camii', 'Süleymaniye Camii', 'Şehzade Camii', 'Mihrimah Sultan Camii', 'Selimiye Edirne’dedir.'],
    ['kl', 'Karagöz gölge oyununda Karagöz’ün arkadaşı kimdir?', 'Hacivat', 'Nasreddin', 'Keloğlan', 'Bekri Mustafa', ''],
    ['kl', 'Ünlü ressam Van Gogh hangi ülkelidir?', 'Hollanda', 'Fransa', 'İspanya', 'İtalya', ''],
    ['kl', 'Ney hangi tür çalgıdır?', 'Nefesli', 'Telli', 'Vurmalı', 'Yaylı', ''],
    ['kl', 'Sultanahmet Camii halk arasında hangi adla da bilinir?', 'Mavi Cami', 'Kırmızı Cami', 'Yeşil Cami', 'Beyaz Cami', 'İç duvarlarındaki mavi İznik çinilerinden dolayı Mavi Cami denir.']
  ];
  const CATS = { gk: ['🌍', 'Genel Kültür'], cg: ['🗺️', 'Coğrafya'], th: ['🏛️', 'Tarih'], bl: ['🔬', 'Bilim'], sp: ['⚽', 'Spor'], kl: ['🎭', 'Kültür-Sanat'] };
  const Q = RAW.map((r, i) => ({ id: i, c: r[0], q: r[1], o: [r[2], r[3], r[4], r[5]], e: r[6] || '' }));
  const NQ = 10, SEC = 20, KEY = 'bilgi_oyunu_v1';
  const g$ = id => document.getElementById(id);
  const eh = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  const ld = () => { try { return Object.assign({ best: 0, games: 0, bestStreak: 0, seen: [] }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { best: 0, games: 0, bestStreak: 0, seen: [] }; } };
  const sv = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
  let sel = 'all', G = { tmr: 0 };

  if (!g$('bzcss')) {
    const st = document.createElement('style'); st.id = 'bzcss';
    st.textContent = `
.bz{color:#e8ecf8;border-radius:20px;padding:12px;background:radial-gradient(120% 70% at 50% -8%,#2a1f5e 0%,#0d1226 58%,#090d1c 100%)}
.bz *{box-sizing:border-box}
.bz button{font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .12s,filter .12s}
.bz button:active:not(:disabled){transform:scale(.97);filter:brightness(1.15)}
.bz-logo{text-align:center;font-size:54px;line-height:1;filter:drop-shadow(0 6px 16px rgba(168,85,247,.55))}
.bz-h{text-align:center;font-size:24px;font-weight:800;margin:6px 0 2px}
.bz-sub{text-align:center;font-size:13px;color:#8d98b8;line-height:1.5;margin:0 6px}
.bz-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}
.bz-stats div{padding:10px 4px;border-radius:15px;text-align:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08)}
.bz-stats b{display:block;font-size:20px;color:#fbbf24}
.bz-stats span{font-size:10.5px;color:#8d98b8}
.bz-chips{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:4px 0 8px}
.bz-chips button{border:1px solid rgba(255,255,255,.12);border-radius:99px;padding:8px 12px;font-size:12.5px;font-weight:700;color:#aab4d4;background:rgba(255,255,255,.05)}
.bz-chips button.on{color:#fff;border-color:transparent;background:linear-gradient(135deg,#8b5cf6,#d946ef);box-shadow:0 5px 14px rgba(139,92,246,.45)}
.bz-big{width:100%;margin-top:10px;padding:15px;border:0;border-radius:16px;color:#fff;font-size:16px;font-weight:800}
.bz-big.go{background:linear-gradient(135deg,#8b5cf6,#d946ef);box-shadow:0 10px 24px rgba(139,92,246,.4)}
.bz-big.gr{background:rgba(255,255,255,.09)}
.bz-note{margin-top:12px;text-align:center;font-size:11px;color:#6b7694}
.bz-hud{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#aab4d4}
.bz-hud b{color:#fff}
.bz-sc b{color:#fbbf24;font-size:16px}
.bz-st{padding:2px 9px;border-radius:99px;background:rgba(255,255,255,.07)}
.bz-st.hot{background:rgba(249,115,22,.25);color:#fdba74}
.bz-dots{display:flex;gap:4px;margin:10px 0}
.bz-dots i{flex:1;height:6px;border-radius:99px;background:rgba(255,255,255,.1)}
.bz-dots i.ok{background:#22c55e}.bz-dots i.no{background:#ef4444}.bz-dots i.cur{background:#a78bfa}
.bz-timer{position:relative;height:26px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}
.bz-timer i{position:absolute;left:0;top:0;bottom:0;width:100%;border-radius:99px;background:linear-gradient(90deg,#22c55e,#16a34a)}
.bz-timer i.mid{background:linear-gradient(90deg,#f59e0b,#d97706)}
.bz-timer i.low{background:linear-gradient(90deg,#ef4444,#b91c1c)}
.bz-timer b{position:relative;display:block;text-align:center;line-height:26px;font-size:13px;font-weight:800;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.5)}
.bz-card{margin:12px 0;padding:16px 14px;border-radius:20px;background:linear-gradient(160deg,#241c4d,#161a38);border:1px solid rgba(255,255,255,.1);box-shadow:0 10px 24px rgba(0,0,0,.3)}
.bz-cat{font-size:11.5px;font-weight:700;color:#c4b5fd;letter-spacing:.03em;margin-bottom:6px}
.bz-q{font-size:18px;font-weight:800;line-height:1.35}
.bz-opts{display:grid;gap:8px}
.bz-o{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:11px 12px;border:1px solid rgba(255,255,255,.1);border-radius:16px;color:#e8ecf8;font-size:15px;font-weight:700;background:rgba(255,255,255,.06)}
.bz-o i{flex:none;width:30px;height:30px;border-radius:10px;display:grid;place-items:center;font-style:normal;font-size:13px;font-weight:800;background:rgba(255,255,255,.1)}
.bz-o.good{border-color:#22c55e;background:linear-gradient(135deg,rgba(34,197,94,.35),rgba(21,128,61,.3))}
.bz-o.good i{background:#22c55e;color:#fff}
.bz-o.bad{border-color:#ef4444;background:linear-gradient(135deg,rgba(239,68,68,.35),rgba(153,27,27,.3))}
.bz-o.bad i{background:#ef4444;color:#fff}
.bz-o.gone{opacity:.22;pointer-events:none}
.bz-jk{display:flex;gap:8px;margin-top:10px}
.bz-jk button{flex:1;padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:14px;font-size:13px;font-weight:700;color:#e8ecf8;background:rgba(255,255,255,.07)}
.bz-jk button:disabled{opacity:.3}
.bz-fb{margin-top:10px;padding:12px;border-radius:16px;font-size:14px;line-height:1.45}
.bz-fb.ok{background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.4)}
.bz-fb.no{background:rgba(239,68,68,.14);border:1px solid rgba(239,68,68,.4)}
.bz-fb b{display:block;font-size:15px;margin-bottom:2px}
.bz-fb small{display:block;color:#aab4d4;font-size:12.5px}
.bz-res{text-align:center}
.bz-rank{font-size:56px;line-height:1}
.bz-score{font-size:46px;font-weight:800;color:#fbbf24;margin:4px 0 0}
.bz-new{display:inline-block;margin:6px 0;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:800;color:#422006;background:linear-gradient(135deg,#fde68a,#f59e0b)}
`;
    document.head.appendChild(st);
  }

  const put = h => { const m = g$('mf'); if (m) m.innerHTML = '<div class="bz">' + h + '</div>'; };
  const stop = () => { clearInterval(G.tmr); G.tmr = 0; };

  const menu = () => {
    stop(); const S = ld();
    const pool = n => Q.filter(q => n == 'all' || q.c == n).length;
    const chip = (k, t) => '<button class="' + (sel == k ? 'on' : '') + '" onclick="bzCat(\'' + k + '\')">' + t + '</button>';
    put('<div class="bz-logo">🧠</div><div class="bz-h">Bilgi Oyunu</div>'
      + '<p class="bz-sub">' + NQ + ' soru · her soruya ' + SEC + ' saniye<br>Hızlı ve seri cevap = bonus puan. 2 joker hakkın var!</p>'
      + '<div class="bz-stats"><div><b>' + S.best + '</b><span>En yüksek skor</span></div><div><b>' + S.games + '</b><span>Oynanan oyun</span></div><div><b>' + S.bestStreak + '🔥</b><span>En uzun seri</span></div></div>'
      + '<div class="bz-chips">' + chip('all', '🎲 Karışık (' + pool('all') + ')') + Object.keys(CATS).map(k => chip(k, CATS[k][0] + ' ' + CATS[k][1])).join('') + '</div>'
      + '<button class="bz-big go" onclick="bzStart()">▶ Oyunu başlat</button>'
      + '<button class="bz-big gr" onclick="document.getElementById(\'ov\').hidden=true">Kapat</button>'
      + '<div class="bz-note">📴 Çevrimdışı çalışır · internet ve sunucu kullanmaz, kota harcamaz<br>Skorlar yalnızca bu cihazda saklanır</div>');
  };

  const pick = () => {
    const S = ld(), pool = Q.filter(q => sel == 'all' || q.c == sel);
    let un = pool.filter(q => S.seen.indexOf(q.id) < 0);
    if (un.length < NQ) { S.seen = S.seen.filter(id => !pool.some(q => q.id == id)); sv(S); un = pool; }   // havuz bitince baştan başlar
    return shuffle(un).slice(0, NQ).map(q => { const idx = shuffle([0, 1, 2, 3]); return { id: q.id, c: q.c, q: q.q, o: idx.map(i => q.o[i]), a: idx.indexOf(0), e: q.e }; });
  };

  const start = () => {
    G = { tmr: 0, qs: pick(), i: 0, score: 0, ok: 0, streak: 0, best: 0, res: [], j1: 1, j2: 1, locked: false, end: 0, tmax: SEC * 1000, left: SEC * 1000 };
    show();
  };

  const tick = () => {
    const bar = g$('bz_bar'); if (!bar) { stop(); return; }
    if (G.locked) return;
    G.left = Math.max(0, G.end - Date.now());
    const p = Math.min(100, G.left / G.tmax * 100);
    bar.style.width = p + '%'; bar.className = p < 25 ? 'low' : p < 55 ? 'mid' : '';
    const t = g$('bz_t'); if (t) t.textContent = Math.ceil(G.left / 1000);
    if (G.left <= 0) answer(-1);
  };

  const show = () => {
    stop(); const q = G.qs[G.i], c = CATS[q.c]; G.locked = false; G.tmax = SEC * 1000; G.left = G.tmax; G.end = Date.now() + G.tmax;
    put('<div class="bz-hud"><span>Soru <b>' + (G.i + 1) + '</b>/' + G.qs.length + '</span><span class="bz-sc">⭐ <b id="bz_sc">' + G.score + '</b></span><span id="bz_st" class="bz-st' + (G.streak > 1 ? ' hot' : '') + '">🔥 ' + G.streak + '</span></div>'
      + '<div class="bz-dots">' + G.qs.map((_, i) => '<i class="' + (i < G.i ? (G.res[i] ? 'ok' : 'no') : i == G.i ? 'cur' : '') + '"></i>').join('') + '</div>'
      + '<div class="bz-timer"><i id="bz_bar"></i><b id="bz_t">' + SEC + '</b></div>'
      + '<div class="bz-card"><div class="bz-cat">' + c[0] + ' ' + c[1] + '</div><div class="bz-q">' + eh(q.q) + '</div></div>'
      + '<div class="bz-opts">' + q.o.map((t, i) => '<button class="bz-o" id="bz_o' + i + '" onclick="bzAns(' + i + ')"><i>' + 'ABCD'[i] + '</i><span>' + eh(t) + '</span></button>').join('') + '</div>'
      + '<div class="bz-jk"><button id="bz_j1" onclick="bzJoker(1)"' + (G.j1 ? '' : ' disabled') + '>✂️ 50:50</button><button id="bz_j2" onclick="bzJoker(2)"' + (G.j2 ? '' : ' disabled') + '>⏱️ +10 sn</button></div><div id="bz_fb"></div>');
    G.tmr = setInterval(tick, 100);
  };

  const answer = i => {
    if (G.locked) return; G.locked = true; stop();
    const q = G.qs[G.i], ok = i == q.a, S = ld(); let pts = 0, info = '';
    if (ok) {
      const tb = Math.round(G.left / 1000 * 2.5), sb = Math.min(50, G.streak * 10);
      pts = 100 + tb + sb; G.score += pts; G.ok++; G.streak++; G.best = Math.max(G.best, G.streak);
      info = '+' + pts + ' puan <small>100 temel' + (tb ? ' + ' + tb + ' hız' : '') + (sb ? ' + ' + sb + ' seri' : '') + '</small>';
    } else G.streak = 0;
    G.res[G.i] = ok;
    if (S.seen.indexOf(q.id) < 0) { S.seen.push(q.id); if (S.seen.length > 300) S.seen.shift(); sv(S); }
    for (let k = 0; k < 4; k++) { const b = g$('bz_o' + k); if (!b) continue; b.disabled = true; b.classList.remove('gone'); if (k == q.a) b.classList.add('good'); else if (k == i) b.classList.add('bad'); }
    const sc = g$('bz_sc'); if (sc) sc.textContent = G.score;
    const st = g$('bz_st'); if (st) { st.textContent = '🔥 ' + G.streak; st.className = 'bz-st' + (G.streak > 1 ? ' hot' : ''); }
    ['bz_j1', 'bz_j2'].forEach(id => { const b = g$(id); if (b) b.disabled = true; });
    const fb = g$('bz_fb'), last = G.i >= G.qs.length - 1;
    if (fb) fb.innerHTML = '<div class="bz-fb ' + (ok ? 'ok' : 'no') + '"><b>' + (ok ? '✅ Doğru! ' + info : (i < 0 ? '⏰ Süre doldu!' : '❌ Yanlış')) + '</b>' + (ok ? '' : '<small>Doğru cevap: ' + eh(q.o[q.a]) + '</small>') + (q.e ? '<small>' + eh(q.e) + '</small>' : '') + '</div>'
      + '<button class="bz-big go" onclick="bzNext()">' + (last ? '🏁 Sonucu gör' : 'Sonraki soru →') + '</button>';
    if (fb && fb.scrollIntoView) { try { fb.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {} }
  };

  const joker = n => {
    if (G.locked) return; const q = G.qs[G.i];
    if (n == 1 && G.j1) {
      G.j1 = 0; shuffle([0, 1, 2, 3].filter(k => k != q.a)).slice(0, 2).forEach(k => { const b = g$('bz_o' + k); if (b) b.classList.add('gone'); });
      const b1 = g$('bz_j1'); if (b1) b1.disabled = true;
    } else if (n == 2 && G.j2) {
      G.j2 = 0; G.end += 10000; G.tmax = Math.max(G.tmax, G.end - Date.now());
      const b2 = g$('bz_j2'); if (b2) b2.disabled = true;
    }
  };

  const finish = () => {
    stop(); const S = ld(), rec = G.score > S.best;
    S.games++; if (rec) S.best = G.score; S.bestStreak = Math.max(S.bestStreak, G.best); sv(S);
    const r = G.ok >= 9 ? ['👑', 'Efsane'] : G.ok >= 7 ? ['🧠', 'Bilge'] : G.ok >= 5 ? ['🔎', 'Meraklı'] : ['🌱', 'Çaylak'];
    put('<div class="bz-res"><div class="bz-rank">' + r[0] + '</div><div class="bz-h">' + r[1] + '!</div>'
      + '<div class="bz-score">' + G.score + '</div><div class="bz-sub">puan</div>' + (rec ? '<div class="bz-new">🏆 Yeni rekor!</div>' : '')
      + '<div class="bz-stats"><div><b>' + G.ok + '/' + G.qs.length + '</b><span>Doğru</span></div><div><b>' + G.best + '🔥</b><span>En uzun seri</span></div><div><b>' + S.best + '</b><span>Rekor</span></div></div>'
      + '<div class="bz-dots">' + G.qs.map((_, i) => '<i class="' + (G.res[i] ? 'ok' : 'no') + '"></i>').join('') + '</div></div>'
      + '<button class="bz-big go" onclick="bzStart()">🔁 Tekrar oyna</button>'
      + '<button class="bz-big gr" onclick="bzMenu()">☰ Menü</button>'
      + '<button class="bz-big gr" onclick="document.getElementById(\'ov\').hidden=true">Kapat</button>');
  };

  window.bilgiUI = () => { pop('🧠 Bilgi Oyunu', '', true); menu(); };
  window.bzMenu = menu; window.bzStart = start; window.bzAns = answer; window.bzJoker = joker;
  window.bzCat = k => { sel = k; menu(); };
  window.bzNext = () => { if (G.i >= G.qs.length - 1) finish(); else { G.i++; show(); } };
})();


// ===== 🎮 Oyunlar menüsü: Yemek Oyunu + Bilgi Oyunu tek yerde =====
(function () {
  if (!document.getElementById('oyncss')) {
    const st = document.createElement('style'); st.id = 'oyncss';
    st.textContent = `
.oy{color:#e8ecf8;border-radius:20px;padding:12px;background:radial-gradient(120% 70% at 50% -8%,#1d2a5e 0%,#0d1226 58%,#090d1c 100%)}
.oy *{box-sizing:border-box}
.oy-h{text-align:center;font-size:13px;color:#8d98b8;margin:2px 0 12px}
.oy-c{display:flex;align-items:center;gap:12px;width:100%;margin-top:10px;padding:14px;border:0;border-radius:20px;text-align:left;color:#fff;font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .12s}
.oy-c:active{transform:scale(.97)}
.oy-c i{flex:none;width:54px;height:54px;border-radius:16px;display:grid;place-items:center;font-style:normal;font-size:28px;background:rgba(255,255,255,.2)}
.oy-c b{display:block;font-size:17px;font-weight:800}
.oy-c small{display:block;margin-top:2px;font-size:12px;font-weight:600;opacity:.85;line-height:1.35}
.oy-c.a{background:linear-gradient(135deg,#16a34a,#15803d);box-shadow:0 10px 22px rgba(22,163,74,.35)}
.oy-c.b{background:linear-gradient(135deg,#8b5cf6,#d946ef);box-shadow:0 10px 22px rgba(139,92,246,.4)}
.oy-c:after{content:"›";margin-left:auto;font-size:26px;opacity:.7}
`;
    document.head.appendChild(st);
  }
  window.oyunlarUI = () => {
    const go = f => "document.getElementById('ov').hidden=true;" + f;
    pop('🎮 Oyunlar',
      '<div class="oy"><div class="oy-h">Bir oyun seç</div>'
      + '<button class="oy-c a" onclick="' + go('quizUI()') + '"><i>🍽️</i><span><b>Yemek Oyunu</b><small>Mutfak ve servis soruları · aylık skor tablosu</small></span></button>'
      + '<button class="oy-c b" onclick="' + go('bilgiUI()') + '"><i>🧠</i><span><b>Bilgi Oyunu</b><small>Genel kültür · çevrimdışı, kota harcamaz</small></span></button></div>');
    const mo = document.getElementById('mo'), mc = document.getElementById('mc');
    if (mo) mo.textContent = 'Kapat'; if (mc) mc.style.display = 'none';
  };
})();


// ===== 🦺 İSG: Rönesans İSG Tesis girişi (harici bağlantı) =====
window.isgAc = () => { const u = 'https://isgtesis.ronesans.com/login'; try { window.open(u, '_blank', 'noopener'); } catch (e) { location.href = u; } };   // site iframe içinde açılmayı engelliyor → doğrudan tarayıcıda açılır

// ===== ⭐ Google Yorum QR + NFC etiket + paylaş (tamamen çevrimdışı QR üretimi, sunucu/kota kullanmaz) =====
(function () {
  // Şubeler: link/isim değiştirmek veya şube eklemek için bu listeyi düzenle
  const BRANCHES = [
    { tab: 'İzmir Optimum', name: "Happy Moon's İzmir Optimum", url: "https://search.google.com/local/writereview?placeid=ChIJ60jVJdnfuxQRV8KH25Iy9f0" },
    { tab: 'Mavibahçe', name: "Happy Moon’s Mavibahçe AVM Karşıyaka", url: "https://g.page/r/CTf4SUAzgMEiEAE/review" }
  ];
  let cur = 0; const B = () => BRANCHES[cur];

  // ---- Küçük QR kodu üretici (bayt modu, hata düzeltme M, sürüm otomatik) ----
  const ECC_PB = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
  const NBLK = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
  const rawMods = v => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; };
  const gmul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; };
  const rsDiv = d => { const r = new Array(d).fill(0); r[d - 1] = 1; let root = 1; for (let i = 0; i < d; i++) { for (let j = 0; j < d; j++) { r[j] = gmul(r[j], root); if (j + 1 < d) r[j] ^= r[j + 1]; } root = gmul(root, 2); } return r; };
  const rsRem = (data, div) => { const r = div.map(() => 0); data.forEach(b => { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gmul(c, f); }); }); return r; };
  const utf8 = s => Array.from(unescape(encodeURIComponent(s))).map(c => c.charCodeAt(0));

  const encode = text => {
    const bytes = utf8(text); let ver = 1, cap = 0;
    for (; ver <= 40; ver++) { cap = Math.floor(rawMods(ver) / 8) - ECC_PB[ver] * NBLK[ver]; if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= cap * 8) break; }
    if (ver > 40) throw new Error('Metin çok uzun');
    const bits = []; const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, cap * 8 - bits.length)); while (bits.length % 8) bits.push(0);
    const data = []; for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }
    for (let p = 0xEC; data.length < cap; p ^= 0xEC ^ 0x11) data.push(p);
    // bloklara böl + hata düzeltme + serpiştir
    const nb = NBLK[ver], eccLen = ECC_PB[ver], raw = Math.floor(rawMods(ver) / 8), nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDiv(eccLen), blocks = [];
    for (let i = 0, k = 0; i < nb; i++) { const dl = shortLen - eccLen + (i < nShort ? 0 : 1), d = data.slice(k, k + dl); k += dl; const e = rsRem(d, div); if (i < nShort) d.push(0); blocks.push(d.concat(e)); }
    const all = []; for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i != shortLen - eccLen || j >= nShort) all.push(b[i]); });
    // matris
    const N = ver * 4 + 17, M = [], F = [];
    for (let i = 0; i < N; i++) { M.push(new Array(N).fill(false)); F.push(new Array(N).fill(false)); }
    const set = (x, y, v) => { M[y][x] = v; F[y][x] = true; };
    for (let i = 0; i < N; i++) { set(6, i, i % 2 == 0); set(i, 6, i % 2 == 0); }
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy; if (x >= 0 && x < N && y >= 0 && y < N) set(x, y, d != 2 && d != 4); } };
    finder(3, 3); finder(N - 4, 3); finder(3, N - 4);
    const pos = []; if (ver > 1) { const n = Math.floor(ver / 7) + 2, step = ver == 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2; pos.push(6); for (let p = N - 7; pos.length < n; p -= step) pos.splice(1, 0, p); }
    pos.forEach((px, i) => pos.forEach((py, j) => { if ((i == 0 && j == 0) || (i == 0 && j == pos.length - 1) || (i == pos.length - 1 && j == 0)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) != 1); }));
    const fmt = mask => { const d = (0 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); const b = ((d << 10) | r) ^ 0x5412, bit = i => ((b >>> i) & 1) != 0;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i)); set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(N - 1 - i, 8, bit(i)); for (let i = 8; i < 15; i++) set(8, N - 15 + i, bit(i)); set(8, N - 8, true); };
    fmt(0);
    if (ver >= 7) { let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25); const b = (ver << 12) | r; for (let i = 0; i < 18; i++) { const c = ((b >>> i) & 1) != 0, a = N - 11 + i % 3, d = Math.floor(i / 3); set(a, d, c); set(d, a, c); } }
    // veri bitlerini yerleştir
    let bi = 0;
    for (let right = N - 1; right >= 1; right -= 2) { if (right == 6) right = 5; for (let vert = 0; vert < N; vert++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) == 0, y = up ? N - 1 - vert : vert; if (!F[y][x] && bi < all.length * 8) { M[y][x] = ((all[bi >>> 3] >>> (7 - (bi & 7))) & 1) != 0; bi++; } } }
    const mk = (m, x, y) => { switch (m) { case 0: return (x + y) % 2 == 0; case 1: return y % 2 == 0; case 2: return x % 3 == 0; case 3: return (x + y) % 3 == 0; case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 == 0; case 5: return x * y % 2 + x * y % 3 == 0; case 6: return (x * y % 2 + x * y % 3) % 2 == 0; default: return ((x + y) % 2 + x * y % 3) % 2 == 0; } };
    const apply = m => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!F[y][x] && mk(m, x, y)) M[y][x] = !M[y][x]; };
    const penalty = () => { let p = 0;
      for (let t = 0; t < 2; t++) for (let a = 0; a < N; a++) { let run = 1; for (let b = 1; b < N; b++) { const c = t ? M[b][a] : M[a][b], q = t ? M[b - 1][a] : M[a][b - 1]; if (c == q) { run++; if (run == 5) p += 3; else if (run > 5) p++; } else run = 1; } }
      for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) { const c = M[y][x]; if (c == M[y][x + 1] && c == M[y + 1][x] && c == M[y + 1][x + 1]) p += 3; }
      let dark = 0; M.forEach(r => r.forEach(c => { if (c) dark++; })); p += Math.floor(Math.abs(dark * 20 - N * N * 10) / (N * N)) * 10; return p; };
    let best = 0, bp = 1e9;
    for (let m = 0; m < 8; m++) { apply(m); fmt(m); const p = penalty(); if (p < bp) { bp = p; best = m; } apply(m); }
    apply(best); fmt(best);
    return M;
  };
  window.qrMatrix = encode;

  const svg = text => { const M = encode(text), n = M.length, q = 4; let d = ''; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (M[y][x]) d += 'M' + (x + q) + ',' + (y + q) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + 2 * q) + ' ' + (n + 2 * q) + '" shape-rendering="crispEdges" style="display:block;width:100%;height:auto"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#111"/></svg>'; };

  // ---- Arayüz ----
  if (!document.getElementById('qrcss')) {
    const st = document.createElement('style'); st.id = 'qrcss';
    st.textContent = `
.qrw{color:#e8ecf8;border-radius:20px;padding:12px;background:radial-gradient(120% 70% at 50% -8%,#3a2a0a 0%,#0d1226 58%,#090d1c 100%)}
.qrw *{box-sizing:border-box}
.qrw-tabs{display:flex;gap:4px;padding:4px;margin-bottom:12px;border-radius:16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08)}
.qrw-tabs button{flex:1;min-width:0;border:0;border-radius:12px;padding:11px 4px;font-family:inherit;font-size:13.5px;font-weight:700;color:#9aa5c4;background:transparent;cursor:pointer;-webkit-tap-highlight-color:transparent}
.qrw-tabs button.on{color:#fff;background:linear-gradient(135deg,#f59e0b,#d97706);box-shadow:0 5px 14px rgba(217,119,6,.4)}
.qrw-h{text-align:center;font-size:17px;font-weight:800}
.qrw-s{text-align:center;font-size:12.5px;color:#aab4d4;margin:3px 8px 12px;line-height:1.45}
.qrw-box{width:min(78%,290px);margin:0 auto;padding:10px;border-radius:22px;background:#fff;box-shadow:0 14px 30px rgba(0,0,0,.45),0 0 0 4px rgba(251,191,36,.55)}
.qrw-box svg{border-radius:12px}
.qrw-g{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
.qrw-g button,.qrw-b{font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;padding:12px 6px;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(255,255,255,.07);color:#e8ecf8;font-size:13px;font-weight:700}
.qrw-g button i{display:block;font-style:normal;font-size:20px;margin-bottom:2px}
.qrw-g button:active,.qrw-b:active{filter:brightness(1.2)}
.qrw-b{width:100%;margin-top:8px;color:#fff;border:0;background:linear-gradient(135deg,#f59e0b,#d97706)}
.qrw-st{min-height:18px;margin-top:10px;text-align:center;font-size:12.5px;color:#fcd34d}
.qrw-n{margin-top:8px;text-align:center;font-size:11px;color:#6b7694;line-height:1.5}
`;
    document.head.appendChild(st);
  }
  const say = t => { const e = document.getElementById('qrst'); if (e) e.textContent = t; };

  const body = () => {
    let img; try { img = svg(B().url); } catch (e) { img = '<div style="padding:30px;color:#000">QR oluşturulamadı</div>'; }
    return '<div class="qrw"><div class="qrw-tabs">' + BRANCHES.map((b, k) => '<button class="' + (k == cur ? 'on' : '') + '" onclick="qrBr(' + k + ')">' + b.tab + '</button>').join('') + '</div>'
      + '<div class="qrw-h">' + B().name + '</div>'
      + '<div class="qrw-s">Telefonun kamerasını QR koda tut,<br>yorumlar Google’da açılsın.</div>'
      + '<div class="qrw-box">' + img + '</div>'
      + '<div class="qrw-g"><button onclick="qrShare()"><i>📤</i>Paylaş</button><button onclick="qrCopy()"><i>📋</i>Linki kopyala</button><button onclick="qrOpen()"><i>🔗</i>Linki aç</button><button onclick="qrNfc()"><i>📲</i>NFC etikete yaz</button><button onclick="qrNfcErase()" style="grid-column:1/-1"><i>🧹</i>NFC etiketi sil</button></div>'
      + '<div id="qrst" class="qrw-st"></div>'
      + '<div class="qrw-n">📤 Paylaş → Quick Share / Nearby Share ile telefondan telefona gönderilir.<br>📲 NFC: boş bir etiket yazdırınca, o etikete dokunan her telefon linki açar.</div></div>';
  };
  window.qrUI = () => {
    pop('⭐ Google Yorumlar', body());
    const mo = document.getElementById('mo'), mc = document.getElementById('mc');
    if (mo) mo.textContent = 'Kapat'; if (mc) mc.style.display = 'none';
  };
  window.qrBr = k => { cur = k; armed.w = armed.e = 0; const m = document.getElementById('mf'); if (m) m.innerHTML = body(); };
  const armed = {};
  const arm = (k, msg) => { const now = Date.now(); if (armed[k] && now - armed[k] < 6000) { armed[k] = 0; return true; } armed[k] = now; say(msg); return false; };
  window.qrOpen = () => { try { window.open(B().url, '_blank', 'noopener'); } catch (e) { location.href = B().url; } };
  window.qrCopy = async () => {
    try { await navigator.clipboard.writeText(B().url); say('✅ Link kopyalandı'); }
    catch (e) { try { const t = document.createElement('textarea'); t.value = B().url; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); say('✅ Link kopyalandı'); } catch (e2) { say('Kopyalanamadı'); } }
  };
  window.qrShare = async () => {
    if (!navigator.share) { say('Bu cihaz paylaşmayı desteklemiyor, “Linki kopyala”yı dene'); return; }
    try { await navigator.share({ title: B().name + ' yorumları', text: B().name + ' Google yorumları', url: B().url }); } catch (e) { if (e && e.name != 'AbortError') say('Paylaşılamadı'); }
  };
  window.qrNfcErase = async () => {
    if (!('NDEFReader' in window)) { say('NFC yalnızca Android Chrome’da çalışır'); return; }
    if (!arm('e', '⚠️ Kartın içindeki tüm veri silinecek. Devam etmek için 6 sn içinde butona tekrar dokun.')) return;
    try {
      const n = new NDEFReader(); say('🧹 Silinecek etiketi telefonun arkasına yaklaştır…');
      try { await n.write({ records: [{ recordType: 'empty' }] }); }
      catch (e1) { if (e1 && e1.name == 'NotAllowedError') throw e1; await n.write({ records: [{ recordType: 'text', data: '' }] }); }
      say('✅ Etiket silindi, tekrar yazabilirsin');
    } catch (e) { say(e && e.name == 'NotAllowedError' ? 'NFC izni verilmedi ya da NFC kapalı' : 'Silinemedi (etiket kilitli/salt okunur olabilir)'); }
  };
  window.qrNfc = async () => {
    if (!('NDEFReader' in window)) { say('NFC yazma yalnızca Android Chrome’da çalışır (HTTPS gerekir)'); return; }
    if (!arm('w', '⚠️ Kartın içindeki mevcut link silinip yerine bu link yazılacak. Devam etmek için 6 sn içinde butona tekrar dokun.')) return;
    try { const n = new NDEFReader(); say('📲 Boş NFC etiketini telefonun arkasına yaklaştır…'); await n.write({ records: [{ recordType: 'url', data: B().url }] }); say('✅ Etikete yazıldı! Artık dokunan telefon linki açar'); }
    catch (e) { say(e && e.name == 'NotAllowedError' ? 'NFC izni verilmedi ya da NFC kapalı (Ayarlar → NFC)' : 'Yazılamadı: ' + (e && e.message ? e.message : e)); }
  };
})();



// ===== 🎨 Ana ekran düzeni (v71): sade, toplu, kompakt; eski kırmızı-beyaz şerit kaldırıldı =====
(function () {
  const st = document.createElement('style'); st.id = 'home70';
  st.textContent = `
/* --- Header --- */
html body .hd{position:relative!important;overflow:hidden!important;padding:12px 14px 14px!important;margin-bottom:12px!important;gap:12px!important;border-radius:22px!important;background:linear-gradient(135deg,#a3192b 0%,#7f1d1d 52%,#470c13 100%)!important;border:1px solid rgba(255,255,255,.14)!important;box-shadow:0 10px 26px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.2)!important}
html body .hd::before{content:"";position:absolute;right:-50px;top:-60px;width:190px;height:190px;border-radius:50%;background:radial-gradient(circle,rgba(253,230,138,.24),transparent 70%);pointer-events:none}
html body .hd::after{content:""!important;display:block!important;position:absolute!important;left:16px!important;right:16px!important;bottom:0!important;height:2px!important;border-radius:2px!important;background:linear-gradient(90deg,transparent,#fcd34d 28%,#fcd34d 72%,transparent)!important;opacity:.7!important}
html body .lg{height:56px!important;width:56px!important;border-radius:15px!important;box-shadow:0 4px 12px rgba(0,0,0,.4),0 0 0 2px rgba(255,255,255,.18)!important}
html body .hn{font-size:21px!important;letter-spacing:.01em}
html body .hs{font-size:10.5px!important;letter-spacing:.22em!important;margin-top:5px!important;color:#fcd34d!important;display:flex;align-items:center;gap:8px}
html body .hs::before{content:"";width:18px;height:2px;border-radius:2px;background:linear-gradient(90deg,#fcd34d,rgba(252,211,77,.2))}
html body .vt{right:14px!important;top:9px!important;bottom:auto!important;font-size:9px!important;opacity:.4!important}
/* --- Sekmeler (Mola / Moladakiler) --- */
html body .nv{display:flex!important;grid-template-columns:none!important;gap:4px!important;margin:0 0 10px!important;padding:4px!important;background:#2a1015!important;border:1px solid rgba(254,202,202,.12)!important;border-radius:16px!important}
html body .nv button{flex:1 1 0!important;min-width:0;flex-direction:row!important;justify-content:center!important;align-items:center!important;gap:7px!important;min-height:44px!important;padding:8px 6px!important;border-radius:12px!important;background:transparent!important;border:0!important;box-shadow:none!important;color:#cdb9bd!important;font-size:14px!important;font-weight:700!important;line-height:1.1!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
html body .nv button i{font-size:18px!important;font-style:normal}
html body .nv button.on{background:linear-gradient(135deg,#ef4444,#b91c1c)!important;color:#fff!important;box-shadow:0 5px 14px rgba(220,38,38,.4)!important}
/* --- Soldaki menü düğmesi + çekmece --- */
html body .hd{position:relative}
#dwb{flex:none;width:58px;height:58px;border-radius:16px;border:1px solid rgba(255,255,255,.26);background:rgba(255,255,255,.13);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent;z-index:2}
#dwb span{display:block;width:22px;height:2.5px;border-radius:2px;background:#fff}
#dwb em{font-style:normal;font-size:10.5px;font-weight:800;letter-spacing:.1em;color:#fff;margin-top:2px;line-height:1}
#dwb:active{background:rgba(255,255,255,.22)}
#dwo{position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.6);opacity:0;pointer-events:none;transition:opacity .22s}
#dw{position:fixed;top:0;bottom:0;left:0;width:min(84vw,330px);z-index:9991;transform:translateX(-104%);transition:transform .26s cubic-bezier(.2,.8,.2,1);background:linear-gradient(180deg,#2b1117 0%,#170709 100%);border-right:1px solid rgba(254,202,202,.18);box-shadow:12px 0 40px rgba(0,0,0,.55);overflow-y:auto;padding:max(14px,env(safe-area-inset-top)) 12px 20px;color:#f5e9ea}
body.dwon #dwo{opacity:1;pointer-events:auto}
body.dwon #dw{transform:none}
#dw .dwh{display:flex;align-items:center;gap:10px;padding:4px 2px 12px;border-bottom:1px solid rgba(254,202,202,.12);margin-bottom:4px}
#dw .dwp{flex:1;display:flex;align-items:center;gap:12px;min-width:0}
#dw .dwp b{flex:none;width:46px;height:46px;border-radius:50%;display:grid;place-items:center;font-size:18px;color:#422006;background:linear-gradient(135deg,#fde68a,#f59e0b)}
#dw .dwn{font-size:16px;font-weight:800;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#dw .dws2{font-size:12px;color:#d4b5b9;margin-top:2px}
#dw .dwx{flex:none;width:36px;height:36px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.07);color:#fff;font-size:15px;cursor:pointer}
#dw .dwt{font-size:11px;font-weight:700;letter-spacing:.16em;color:#b79ea3;margin:14px 8px 6px}
#dw .dwi{display:flex;align-items:center;gap:12px;width:100%;padding:6px 10px;margin:1px 0;border:0;border-radius:14px;background:transparent;color:#ecdcde;font-size:15px;font-weight:600;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}
#dw .dwi i{flex:none;width:34px;height:34px;border-radius:11px;display:grid;place-items:center;font-style:normal;font-size:18px;background:rgba(255,255,255,.07)}
#dw .dwi:active{background:rgba(255,255,255,.08)}
#dw .dwi.on{background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;box-shadow:0 6px 16px rgba(220,38,38,.35)}
#dw .dwi.on i{background:rgba(255,255,255,.22)}
/* --- Ana sayfa sırası: önce Mola başlat; kısayol hapları artık menüde --- */
html body #list{display:flex;flex-direction:column}
html body #list>.dt{order:-4;align-self:flex-start}
html body #list>.hi{order:-3}
html body #list>.grid.one{order:-2;margin-bottom:8px}
html body #list .chipsrow{display:none!important}
html body #list>button.a.x{order:9;min-height:54px!important;padding:15px 14px!important;font-size:16px!important;border-radius:15px!important;margin-top:14px!important}
/* --- Şube / mod seçimi: ince --- */
html body .top{padding:3px!important;margin-bottom:8px!important;border-radius:14px!important;gap:3px!important}
html body .tab{padding:10px 4px!important;font-size:14px!important;border-radius:11px!important}
/* --- Yönetici butonları + istatistik --- */
html body .admbar{grid-template-columns:repeat(4,1fr)!important;gap:7px!important;margin:0 0 10px!important}
html body .admbar .a{min-height:56px!important;padding:8px 2px!important;display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:11.5px!important;border-radius:16px!important;line-height:1.1}
html body .admbar .a i{font-style:normal;font-size:19px}
html body .stats{gap:7px!important;margin:0 0 10px!important}
html body .st{padding:8px 2px!important;border-radius:14px!important;background:linear-gradient(160deg,#2b1117,#1c0a0e)!important;border-color:rgba(254,202,202,.12)!important}
html body .st b{font-size:20px!important;line-height:1.1!important}
html body .st span{font-size:10.5px!important;display:block;margin-top:2px;line-height:1.1}
html body .sec2{margin-top:4px}
html body .dt{margin:0 0 8px!important;font-size:12.5px!important;padding:5px 11px!important}
/* --- Personel karşılama kartı: kompakt --- */
html body .hi{gap:10px!important;padding:10px 12px!important;border-radius:16px!important;margin:0 0 8px!important;background:linear-gradient(135deg,#8f1d2c,#3f0d14)!important;border:1px solid rgba(255,255,255,.12)!important}
html body .hi b{width:38px!important;height:38px!important;font-size:15px!important}
html body .hi1{font-size:16px!important}
html body .hi2{font-size:12px!important;line-height:1.4;margin-top:2px!important}
html body .sv2l{font-size:11.5px!important;margin-top:2px!important;line-height:1.35!important}
/* --- Hızlı seçenek hapları: küçük --- */
html body .chipsrow{gap:6px!important}
html body .pill{padding:7px 12px!important;font-size:12px!important;font-weight:600!important}
/* --- Mola kartları: kompakt, profesyonel --- */
html body .grid{gap:8px!important}
html body .card{min-height:0!important;padding:9px 8px!important;gap:5px!important;border-radius:16px!important;border-width:1.5px!important}
html body .nm{font-size:15px!important}
html body .sr{width:20px!important;height:20px!important;line-height:20px!important;font-size:11px!important}
html body .tm{font-size:26px!important}
html body .chips{gap:3px!important}
html body .chip{font-size:10.5px!important;padding:1px 7px!important}
html body .chip.cur{padding:0 6px!important;border-width:1.5px!important}
html body .btns{flex-direction:row!important;flex-wrap:wrap;gap:5px!important}
html body .btns button,html body .btns a{flex:1 1 0;min-width:0;width:auto!important;padding:8px 4px!important;font-size:12px!important;border-radius:11px!important;white-space:nowrap}
html body .btns button small{display:none!important}
html body button.a.mola{padding:12px 6px!important;font-size:15px!important}
html body .ib{gap:4px!important}
html body .ib button{flex:1 1 30px!important;padding:7px 0!important;font-size:14px!important;border-radius:9px!important}
/* --- Personelin kendi mola kartı --- */
html body .grid.one .card{padding:12px!important;gap:8px!important}
html body .grid.one .tm{font-size:40px!important}
html body .grid.one .nm{font-size:18px!important}
html body .grid.one .btns button{padding:11px 6px!important;font-size:14px!important}
`;
  document.head.appendChild(st);
  try { const v = document.querySelector('.vt'); if (v) v.textContent = 'v72'; } catch (e) {}
})();

// ===== Molada / personel kartları: derli toplu (ana HTML'deki sınıf adlarına göre) =====
(function () {
  const st = document.createElement('style'); st.id = 'moladaTidy';
  st.textContent = `
#list .grid:not(.one){align-items:start!important;gap:8px!important}
#list .grid:not(.one) .card{min-height:0!important;padding:10px 8px 8px!important;gap:6px!important;border-radius:16px!important}
#list .grid:not(.one) .card .nm{font-size:15.5px!important}
#list .grid:not(.one) .card .tm{font-size:28px!important;margin:2px 0!important}
#list .grid:not(.one) .card .chips{gap:4px!important}
#list .grid:not(.one) .card .chip{font-size:11px!important;padding:2px 8px!important;line-height:1.3!important}
#list .grid:not(.one) .card .btns{gap:6px!important}
#list .grid:not(.one) .card .btns .a{min-height:38px!important;font-size:13px!important;padding:8px 6px!important;border-radius:12px!important;white-space:nowrap}
#list .grid:not(.one) .card .btns button small{font-size:11px!important}
#list .grid:not(.one) .card .ib button{padding:7px 0!important;font-size:15px!important}
`;
  document.head.appendChild(st);
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
  let R = { list: [], type: 'yemekli', past: false, form: false, ft: '', fp: '', rows: [] };
  const dLbl = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); if (!m) return d; return m[3] + '.' + m[2] + '.' + m[1] + ' · ' + new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('tr-TR', { weekday: 'short', timeZone: 'UTC' }); };
  const todayTR = () => { const t = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10).split('-'); return t[2] + '.' + t[1] + '.' + t[0]; };
  const today = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  const TY = { yemekli: ['🍽️', 'Yemekli', '#4f46e5'], dogum: ['🎂', 'Doğum günü', '#db2777'], kahvalti: ['🥐', 'Kahvaltı', '#d97706'] };
  const tyOf = r => TY[r.type] || TY.yemekli;
  const thS = 'position:sticky;top:0;background:#1e293b;padding:8px;text-align:left;font-size:12px;border:1px solid rgba(255,255,255,.18);white-space:nowrap';
  const tdS = 'padding:7px 8px;border:1px solid rgba(255,255,255,.12);vertical-align:top;font-size:13px';
  const trow = (r, i) => {
    const can = M == 'y' || (r.by && r.by == meId()), tel = String(r.phone || '').replace(/[^\d+]/g, ''), t = tyOf(r);
    return '<tr style="' + (i % 2 ? 'background:rgba(255,255,255,.04)' : '') + '"><td style="' + tdS + ';opacity:.6;text-align:center">' + (i + 1) + '</td>'
      + '<td style="' + tdS + ';white-space:nowrap">' + esc(dLbl(r.date)) + '</td>'
      + '<td style="' + tdS + ';white-space:nowrap;font-weight:800;font-size:15px">' + esc(r.time) + '</td>'
      + '<td style="' + tdS + ';white-space:nowrap"><span style="background:' + t[2] + ';border-radius:999px;padding:2px 8px;font-size:12px;font-weight:700;color:#fff">' + t[0] + ' ' + t[1] + '</span></td>'
      + '<td style="' + tdS + ';font-weight:700;min-width:110px">' + esc(r.guest) + '</td>'
      + '<td style="' + tdS + ';white-space:nowrap">' + (r.phone ? '<a href="tel:' + esc(tel) + '" style="color:#93c5fd;text-decoration:none">' + esc(r.phone) + '</a>' : '') + '</td>'
      + '<td style="' + tdS + ';min-width:90px">' + esc(r.taker || '') + '</td>'
      + '<td style="' + tdS + ';min-width:150px;max-width:230px">' + esc(r.note || '') + (r.sched === true ? '<div style="font-size:11px;color:#86efac">⏰ bildirim ayarlı</div>' : '') + '</td>'
      + '<td style="' + tdS + ';white-space:nowrap;text-align:center"><button onclick="rezShare(\'' + esc(r.id) + '\')" style="border:0;background:rgba(34,197,94,.22);color:#86efac;border-radius:8px;padding:5px 8px;font-size:14px">📲</button>'
      + (can ? ' <button onclick="rezDel(\'' + esc(r.id) + '\')" style="border:0;background:rgba(239,68,68,.2);color:#fca5a5;border-radius:8px;padding:5px 8px;font-size:14px">🗑</button>' : '') + '</td></tr>';
  };
  const selS = 'background:#1e293b;color:#e5e7eb;border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:8px;font-size:13px;flex:1;min-width:0';
  const visList = () => { const now = Date.now(), up = r => r.ts >= now - 3 * 3600000; return (R.past ? R.list.filter(r => !up(r)) : R.list.filter(up)).slice().sort((x, z) => x.ts - z.ts); };
  const render = () => {
    const base = visList(), takers = base.map(r => r.taker).filter((v, i, a) => v && a.indexOf(v) == i).sort((a, b) => a.localeCompare(b, 'tr'));
    if (R.fp && takers.indexOf(R.fp) < 0) R.fp = '';
    const vis = base.filter(r => (!R.ft || (r.type || 'yemekli') == R.ft) && (!R.fp || r.taker == R.fp));
    R.rows = vis; R.vis = Object.keys(TY).map(k => [TY[k][0] + ' ' + TY[k][1], TY[k][2], vis.filter(r => (r.type || 'yemekli') == k)]);
    const tb = (t, txt) => '<button id="rt_' + t + '" onclick="rezType(\'' + t + '\')" style="flex:1;border:0;border-radius:10px;padding:9px 2px;font-size:13px;font-weight:700;color:#fff;background:' + (R.type == t ? '#6366f1' : '#334155') + '">' + txt + '</button>';
    const names = ((D && D.staff) || []).filter(x => !x.off).map(x => nice(x.name)).filter((v, i, a) => a.indexOf(v) == i).sort((a, b) => a.localeCompare(b, 'tr'));
    const form = R.form ? '<div style="background:rgba(255,255,255,.05);border-radius:12px;padding:10px;margin:8px 0"><div style="display:flex;gap:6px">' + tb('yemekli', '🍽️ Yemekli') + tb('dogum', '🎂 Doğum günü') + tb('kahvalti', '🥐 Kahvaltı') + '</div>'
      + '<div style="display:flex;gap:8px"><div style="flex:1"><label style="' + lbl + '">Tarih</label><input id="rz_d" inputmode="numeric" maxlength="10" placeholder="GG.AA.YYYY" value="' + todayTR() + '" oninput="rezMask(this,\'d\')" style="' + inp + '"></div><div style="flex:1"><label style="' + lbl + '">Saat</label><input id="rz_t" inputmode="numeric" maxlength="5" placeholder="SS:DD" oninput="rezMask(this,\'t\')" style="' + inp + '"></div></div>'
      + '<label style="' + lbl + '">Misafir adı</label><input id="rz_g" style="' + inp + '" placeholder="Ad soyad">'
      + '<label style="' + lbl + '">Telefon</label><input id="rz_p" type="tel" inputmode="tel" style="' + inp + '" placeholder="05xx xxx xx xx">'
      + '<label style="' + lbl + '">Rezerveyi alan kişi <span style="opacity:.6">(listeden seç ya da yaz)</span></label><input id="rz_k" list="rz_kl" style="' + inp + '" value="' + esc(meName()) + '" placeholder="Kişi seç / yaz"><datalist id="rz_kl">' + names.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>'
      + '<label style="' + lbl + '">📝 Not</label><textarea id="rz_n" rows="3" style="' + inp + ';resize:vertical" placeholder="Kişi sayısı, pasta, masa, özel istek…"></textarea>'
      + '<button onclick="rezSave()" style="width:100%;margin-top:12px;border:0;border-radius:12px;padding:12px;font-weight:800;font-size:15px;color:#fff;background:linear-gradient(135deg,#16a34a,#15803d)">💾 Kaydet</button><div id="rz_m" style="font-size:12px;margin-top:6px;opacity:.85"></div></div>' : '';
    const filt = '<div style="display:flex;gap:6px;margin:10px 0 6px"><select onchange="rezFilt(\'t\',this.value)" style="' + selS + '"><option value="">Tüm türler</option>' + Object.keys(TY).map(k => '<option value="' + k + '"' + (R.ft == k ? ' selected' : '') + '>' + TY[k][0] + ' ' + TY[k][1] + '</option>').join('') + '</select>'
      + '<select onchange="rezFilt(\'p\',this.value)" style="' + selS + '"><option value="">Tüm kişiler</option>' + takers.map(n => '<option value="' + esc(n) + '"' + (R.fp == n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></div>';
    const table = vis.length ? '<div style="overflow:auto;max-height:55vh;border-radius:10px;border:1px solid rgba(255,255,255,.18)"><table style="border-collapse:collapse;width:100%;min-width:760px"><tr><th style="' + thS + '">#</th><th style="' + thS + '">Tarih</th><th style="' + thS + '">Saat</th><th style="' + thS + '">Tür</th><th style="' + thS + '">Misafir</th><th style="' + thS + '">Telefon</th><th style="' + thS + '">Alan kişi</th><th style="' + thS + '">Not</th><th style="' + thS + '"></th></tr>' + vis.map(trow).join('') + '</table></div>' : '<div style="opacity:.6;font-size:13px;padding:14px 4px;text-align:center">Bu seçimde rezerve yok.</div>';
    $('mf').innerHTML = '<div style="background:#0f172a;color:#e5e7eb;border-radius:14px;padding:10px">'
      + '<button onclick="rezForm()" style="width:100%;border:0;border-radius:12px;padding:12px;font-weight:800;font-size:15px;color:#fff;background:' + (R.form ? '#475569' : 'linear-gradient(135deg,#6366f1,#4338ca)') + '">' + (R.form ? '✕ Formu kapat' : '➕ Yeni rezerve') + '</button>' + form
      + (M == 'y' ? '<button onclick="rezPermUI()" style="width:100%;margin-top:8px;border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:10px;font-weight:700;font-size:13px;color:#e5e7eb;background:rgba(255,255,255,.07)">👥 Rezerve yetkilileri</button>' : '')
      + '<div style="font-size:12px;opacity:.7;margin-top:8px">⏰ Misafirin gelmesinden 1 saat önce bildirim gider.</div>'
      + filt + '<div style="display:flex;gap:6px;margin:0 0 8px"><button onclick="rezShare()" style="flex:1;border:0;border-radius:10px;padding:10px;font-weight:800;font-size:13px;color:#fff;background:linear-gradient(135deg,#16a34a,#15803d)">📲 WhatsApp görseli</button><button onclick="rezXls()" style="flex:1;border:0;border-radius:10px;padding:10px;font-weight:800;font-size:13px;color:#fff;background:linear-gradient(135deg,#0369a1,#075985)">⬇ Excel</button></div>'
      + '<div style="font-size:12px;opacity:.7;margin-bottom:6px">' + vis.length + ' rezerve · tarih ve saat sırasına göre</div>' + table
      + '<div style="text-align:center;margin-top:12px"><a href="#" onclick="rezPast();return false" style="color:#93c5fd;font-size:13px">' + (R.past ? '↩ Yaklaşanları göster' : '🕘 Geçmiş rezerveleri göster') + '</a></div></div>';
  };
  window.rezFilt = (k, v) => { if (k == 't') R.ft = v; else R.fp = v; render(); };
  window.rezXls = () => {
    const rows = (R.rows || []).map(r => [dLbl(r.date).split(' · ')[0], r.time, tyOf(r)[1], r.guest, r.phone || '', r.taker || '', r.note || '']), cols = ['Tarih', 'Saat', 'Tür', 'Misafir', 'Telefon', 'Alan kişi', 'Not'];
    if (!rows.length) { msg('İndirilecek rezerve yok.'); return; }
    if (window.aiXlsx) { window.aiXlsx({ title: 'Rezerveler', columns: cols, rows: rows }); return; }
    const csv = '\ufeff' + [cols].concat(rows).map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'rezerveler.csv'; document.body.appendChild(a); a.click(); a.remove();
  };

  const load = async () => { try { R.list = await gs('listRez', B, M == 'y' ? PIN : '', meId()); } catch (e) { R.list = []; } render(); };
  const permBody = () => {
    const P = window.__rezPerm || { set: false, ids: [] }, ids = P.ids || [];
    const st = ((D && D.staff) || []).filter(x => !x.off).slice().sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    return '<div style="background:#0f172a;color:#e5e7eb;border-radius:14px;padding:12px">'
      + '<div style="font-size:13px;line-height:1.5;opacity:.85;margin-bottom:10px">Seçtiğin kişilerin ana sayfasında <b>Rezerve</b> görünür. ' + (P.set ? 'Şu an sadece seçilenler ve yöneticiler görüyor.' : 'Henüz seçim yok: şu an Hostes çalışanları ve yöneticiler görüyor.') + '</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px">' + st.map(x => { const on = ids.indexOf(x.id) > -1; return '<button onclick="rezPermTog(\'' + esc(x.id) + '\')" style="border:1px solid ' + (on ? '#34d399' : 'rgba(255,255,255,.2)') + ';border-radius:999px;padding:8px 12px;font-size:13px;font-weight:700;color:#fff;background:' + (on ? '#047857' : 'transparent') + '">' + (on ? '✓ ' : '') + esc(nice(x.name)) + '</button>'; }).join('') + '</div>'
      + '<div id="rzpst" style="min-height:18px;margin-top:10px;font-size:12px;color:#fcd34d"></div>'
      + '<div style="display:flex;gap:8px;margin-top:6px"><button onclick="rezPermReset()" style="flex:1;border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:10px;font-size:13px;font-weight:700;color:#e5e7eb;background:transparent">↺ Varsayılana dön</button><button onclick="rezUI()" style="flex:1;border:0;border-radius:12px;padding:10px;font-size:13px;font-weight:800;color:#fff;background:linear-gradient(135deg,#6366f1,#4338ca)">← Rezerveye dön</button></div></div>';
  };
  const permSave = (p) => {
    window.__rezPerm = p; try { localStorage.setItem('rezperm_' + B, JSON.stringify({ t: Date.now(), p: p })); } catch (e) {}
    $('mf').innerHTML = permBody();
    gs('setRezPerm', B, p.set ? p.ids : null, PIN).then(() => { const x = document.getElementById('rzpst'); if (x) x.textContent = '✓ Kaydedildi'; }).catch(er => { const x = document.getElementById('rzpst'); if (x) x.textContent = '⚠ ' + (er && er.message || 'Kaydedilemedi'); });
  };
  window.rezPermUI = () => { pop('👥 Rezerve yetkilileri · ' + ((typeof BR != 'undefined' && BR[B]) || ''), permBody()); };
  window.rezPermTog = id => { const P = window.__rezPerm || { set: false, ids: [] }, ids = (P.ids || []).slice(), k = ids.indexOf(id); if (k > -1) ids.splice(k, 1); else ids.push(id); permSave({ set: true, ids: ids }); };
  window.rezPermReset = () => { permSave({ set: false, ids: [] }); };
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
  const rezSyncOk = () => { try { return window.rezOK && rezOK(); } catch (e) { return false; } };   // kota: sadece yönetici/Hostes cihazları, saatte bir
  setTimeout(() => { if (rezSyncOk()) gs('rezSync', B).catch(() => {}); }, 20000);
  setInterval(() => { if (rezSyncOk() && document.visibilityState === 'visible') gs('rezSync', B).catch(() => {}); }, 3 * 60 * 60 * 1000);
})();

// ===== 🍽️ Yemek Oyunu (personel soru oyunu) =====
(function () {
  // [soru, [4 seçenek], doğru seçenek no (0-3), açıklama]
  const SEED = [
    ['Menemen hangi malzemelerle yapılır?', ['Yumurta, domates, biber', 'Yumurta, patates, soğan', 'Peynir, mantar, domates', 'Yumurta, patlıcan, kabak'], 0, 'Menemen: yumurta, domates ve biberle yapılır.'],
    ['Baklava hangi hamurla yapılır?', ['İnce açılmış yufka', 'Maya hamuru', 'Kek hamuru', 'Poğaça hamuru'], 0, 'Baklava, çok ince açılmış yufka katmanlarından oluşur.'],
    ['Türk kahvesi hangi kapta pişirilir?', ['Cezve', 'French press', 'Moka potu', 'Filtre makinesi'], 0, 'Türk kahvesi cezvede, kısık ateşte pişirilir.'],
    ['Eşit parça espresso, sıcak süt ve süt köpüğüyle yapılan kahve hangisidir?', ['Cappuccino', 'Americano', 'Ristretto', 'Doppio'], 0, 'Cappuccino: espresso, sıcak süt ve süt köpüğü.'],
    ['Americano nasıl yapılır?', ['Espresso + sıcak su', 'Espresso + süt', 'Süt + çikolata', 'Soğuk demleme + buz'], 0, 'Americano, espresso üzerine sıcak su eklenerek yapılır.'],
    ['“Latte” İtalyancada ne demektir?', ['Süt', 'Kahve', 'Köpük', 'Şeker'], 0, 'Latte, İtalyancada süt demektir.'],
    ['Tek shot espresso yaklaşık kaç ml’dir?', ['30 ml', '100 ml', '200 ml', '5 ml'], 0, 'Standart tek shot espresso yaklaşık 30 ml’dir.'],
    ['Cold brew nasıl hazırlanır?', ['Kahve soğuk suda uzun süre demlenir', 'Espresso buzla çalkalanır', 'Sıcak kahve dondurulur', 'Kahve süt ile kaynatılır'], 0, 'Cold brew, soğuk suda saatlerce (12–24 saat) demlenir.'],
    ['Pizza Margherita’nın klasik malzemeleri hangileridir?', ['Domates, mozzarella, fesleğen', 'Sucuk, kaşar, mantar', 'Ton balığı, soğan, mısır', 'Pastırma, yumurta, ıspanak'], 0, 'Margherita: domates, mozzarella ve fesleğen (İtalyan bayrağının renkleri).'],
    ['Hangisi İtalyan mutfağına aittir?', ['Risotto', 'Pad Thai', 'Sushi', 'Paella'], 0, 'Risotto, İtalyan pirinç yemeğidir.'],
    ['Sushi rulolarını saran yosunun adı nedir?', ['Nori', 'Wasabi', 'Miso', 'Tofu'], 0, 'Nori, kurutulmuş deniz yosunudur.'],
    ['Kimchi hangi ülke mutfağına aittir?', ['Kore', 'Japonya', 'Çin', 'Tayland'], 0, 'Kimchi, fermente sebze yemeği olarak Kore mutfağının simgesidir.'],
    ['Guacamole’nin ana malzemesi nedir?', ['Avokado', 'Nohut', 'Patlıcan', 'Zeytin'], 0, 'Guacamole avokadodan yapılır.'],
    ['Humus’un ana malzemesi nedir?', ['Nohut', 'Mercimek', 'Fasulye', 'Bezelye'], 0, 'Humus; nohut, tahin, limon ve sarımsakla yapılır.'],
    ['Tiramisu’da hangi peynir kullanılır?', ['Mascarpone', 'Parmesan', 'Feta', 'Lor'], 0, 'Tiramisu, mascarpone peyniri ve kahveyle yapılır.'],
    ['Pesto sosun ana otu hangisidir?', ['Fesleğen', 'Nane', 'Dereotu', 'Kekik'], 0, 'Pesto; fesleğen, çam fıstığı, parmesan ve zeytinyağından yapılır.'],
    ['Mojito kokteylinde hangi ot kullanılır?', ['Nane', 'Fesleğen', 'Kekik', 'Maydanoz'], 0, 'Mojito: rom, nane, lime, şeker ve soda.'],
    ['Şarap hangi meyvenin fermantasyonuyla yapılır?', ['Üzüm', 'Elma', 'Kiraz', 'Nar'], 0, 'Şarap, üzümün mayalanmasıyla elde edilir.'],
    ['Bira yapımında temel tahıl hangisidir?', ['Arpa (malt)', 'Pirinç', 'Mısır', 'Yulaf'], 0, 'Geleneksel bira arpa maltından yapılır.'],
    ['Kırmızı şarap hangi sıcaklığa yakın servis edilir?', ['16–18 °C', '0–2 °C', '25–28 °C', '4–6 °C'], 0, 'Kırmızı şarap serin oda sıcaklığında (16–18 °C) servis edilir.'],
    ['Beyaz şarap hangi sıcaklığa yakın servis edilir?', ['8–10 °C', '20–22 °C', '25 °C', '−5 °C'], 0, 'Beyaz şarap soğuk, yaklaşık 8–10 °C’de servis edilir.'],
    ['Flambe tekniği nedir?', ['Alkolü yakarak alevlendirmek', 'Yemeği buharda pişirmek', 'Yemeği dondurmak', 'Yağda kızartmak'], 0, 'Flambe, yemeğe alkol ekleyip yakarak alevlendirme tekniğidir.'],
    ['Lahmacun hangi bölgeyle özdeşleşmiştir?', ['Güneydoğu Anadolu', 'Karadeniz', 'Trakya', 'Ege kıyısı'], 0, 'Lahmacun, Güneydoğu Anadolu (Antep, Urfa) mutfağıyla özdeşleşmiştir.'],
    ['Mısır unu, peynir ve tereyağıyla yapılan Karadeniz yemeği hangisidir?', ['Kuymak (Muhlama)', 'Mantı', 'Künefe', 'İçli köfte'], 0, 'Kuymak (muhlama) Karadeniz’e özgüdür.'],
    ['Künefe hangi hamurla yapılır?', ['Tel kadayıf', 'Yufka', 'Milföy', 'Pide hamuru'], 0, 'Künefe, tel kadayıf ve künefe peyniriyle yapılır.'],
    ['Mantı genelde nasıl servis edilir?', ['Yoğurt ve tereyağlı sosla', 'Şerbetle', 'Süt ve şekerle', 'Domates çorbasıyla'], 0, 'Mantı klasik olarak yoğurt ve tereyağlı (pul biberli) sosla servis edilir.'],
    ['Sütlaç hangi tahılla yapılır?', ['Pirinç', 'Bulgur', 'Buğday', 'Mısır'], 0, 'Sütlaç, pirinç ve sütle yapılan fırın tatlısıdır.'],
    ['Türk çayında ideal demin rengi nasıl tarif edilir?', ['Tavşan kanı', 'Su gibi açık', 'Simsiyah', 'Altın sarısı'], 0, 'İyi demlenmiş çayın rengi “tavşan kanı” olarak tarif edilir.'],
    ['Ekmeği kabartan canlı mikroorganizma hangisidir?', ['Maya', 'Tuz', 'Nişasta', 'Yağ'], 0, 'Maya, hamurdaki şekeri mayalayarak gaz üretir ve hamuru kabartır.'],
    ['Tereyağı neyden yapılır?', ['Sütün kaymağından', 'Zeytinden', 'Yumurtadan', 'Fındıktan'], 0, 'Tereyağı, sütün kaymağının çalkalanmasıyla elde edilir.'],
    ['Laktoz hangi besinde bulunan şekerdir?', ['Süt', 'Bal', 'Meyve', 'Pirinç'], 0, 'Laktoz, süt şekeridir.'],
    ['Hangisi gluten içermez?', ['Pirinç', 'Buğday', 'Arpa', 'Çavdar'], 0, 'Buğday, arpa ve çavdar gluten içerir; pirinç içermez.'],
    ['Hangisi 14 ana alerjen grubundan biridir?', ['Susam', 'Pirinç', 'Elma', 'Havuç'], 0, 'Susam, bildirilmesi zorunlu ana alerjenlerdendir.'],
    ['Vegan biri hangisini yemez?', ['Bal', 'Zeytin', 'Nohut', 'Patates'], 0, 'Vegan beslenmede bal dahil tüm hayvansal ürünler tüketilmez.'],
    ['Çapraz bulaşma nedir?', ['Alerjen veya mikrobun bir üründen diğerine geçmesi', 'Yemeğin fazla pişmesi', 'Sosun ayrışması', 'Ürünün raf ömrünün dolması'], 0, 'Aynı bıçak, tahta veya eldivenle alerjen/mikrop başka ürüne taşınabilir.'],
    ['Buzdolabı sıcaklığı gıda güvenliği için yaklaşık kaç derece olmalıdır?', ['+4 °C ve altı', '+12 °C', '+18 °C', '0 °C’nin altı'], 0, 'Soğuk muhafaza +4 °C ve altında yapılmalıdır.'],
    ['Dondurucu sıcaklığı yaklaşık kaç derece olmalıdır?', ['−18 °C', '−2 °C', '0 °C', '+4 °C'], 0, 'Derin dondurucu en az −18 °C olmalıdır.'],
    ['Bakterilerin hızla çoğaldığı “tehlikeli bölge” hangisidir?', ['5–60 °C', '−20–0 °C', '70–90 °C', '100 °C üstü'], 0, 'Yiyecekleri 5–60 °C arasında uzun süre bekletmemek gerekir.'],
    ['El yıkama en az kaç saniye sürmelidir?', ['20 saniye', '2 saniye', '5 saniye', '1 dakika'], 0, 'Sabunla en az 20 saniye yıkamak önerilir.'],
    ['Pastörizasyon ne yapar?', ['Zararlı mikroorganizmaları ısıyla azaltır', 'Yemeği tuzlar', 'Rengi değiştirir', 'Gıdayı dondurur'], 0, 'Pastörizasyon, ısıl işlemle zararlı mikropları azaltır.']
  ].map((x, i) => ({ id: 's' + i, q: x[0], o: x[1], a: x[2], e: x[3] }));
  let CUST = null, CT = 0, BR = '';
  const QZ = { qs: [], i: 0, pts: 0, ok: 0, t0: 0, tm: 0, locked: false };
  const eh = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const g$ = id => document.getElementById(id);
  const meId = () => { try { return localStorage.getItem('mola_me_' + B) || ''; } catch (e) { return ''; } };
  const meName = () => { const x = ((D && D.staff) || []).find(y => y.id == meId()); return x ? nice(x.name) : ''; };
  const trYm = () => { const t = new Date(Date.now() + 3 * 3600000).toISOString(); return t.slice(0, 4) + t.slice(5, 7); };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  const loadCust = async force => { if (!force && CUST && BR == B && Date.now() - CT < 30 * 60000) return; try { CUST = (await gs('getQuizQ', B)) || []; } catch (e) { CUST = CUST || []; } CT = Date.now(); BR = B; };
  const put = h => { const m = g$('mf'); if (m) m.innerHTML = '<div style="background:#0f172a;color:#e5e7eb;border-radius:14px;padding:12px">' + h + '</div>'; };
  const btn = (t, on, bg, ex) => '<button onclick="' + on + '" style="width:100%;border:0;border-radius:14px;padding:14px;font-size:16px;font-weight:800;color:#fff;background:' + (bg || '#334155') + ';margin-top:10px;' + (ex || '') + '">' + t + '</button>';
  const inp = 'width:100%;box-sizing:border-box;background:#fff;color:#111;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font-size:15px;margin:6px 0 0';

  const home = async () => {
    put('<p style="opacity:.7">Yükleniyor…</p>');
    await loadCust();
    const n = SEED.length + (CUST || []).length;
    put('<div style="text-align:center;font-size:44px">🍽️</div><div style="text-align:center;font-size:22px;font-weight:800;margin:4px 0">Yemek Oyunu</div>'
      + '<p style="text-align:center;opacity:.8;font-size:14px;line-height:1.5;margin:6px 0 4px">10 soru · her soruya 15 saniye<br>Doğru cevap 10 puan, hızlı cevap +5 puan bonus.<br>Günde 3 oyun skora yazılır. Skor tablosu ay sonunda sıfırlanır.</p>'
      + '<p style="text-align:center;opacity:.55;font-size:12px;margin:0">Soru havuzu: ' + n + ' soru</p>'
      + btn('▶ Oyna', 'quizPlay()', 'linear-gradient(135deg,#16a34a,#15803d)')
      + btn('🏆 Skor tablosu', 'quizBoard()', 'linear-gradient(135deg,#2563eb,#1d4ed8)')
      + (M == 'y' ? btn('➕ Soru ekle / yönet', 'quizAdmin()', '#92400e') : '')
      + btn('Kapat', "$('ov').hidden=true", '#475569'));
  };
  window.quizUI = () => { pop('🍽️ Yemek Oyunu', '', true); home(); };
  window.quizHome = home;
  window.quizPlay = async () => {
    await loadCust();
    const all = SEED.concat(CUST || []);
    QZ.qs = shuffle(all).slice(0, 10).map(q => { const idx = shuffle([0, 1, 2, 3]); return { q: q.q, o: idx.map(i => q.o[i]), a: idx.indexOf(q.a), e: q.e || '' }; });
    QZ.i = 0; QZ.pts = 0; QZ.ok = 0; showQ();
  };
  const showQ = () => {
    const q = QZ.qs[QZ.i]; QZ.locked = false; QZ.t0 = Date.now(); clearInterval(QZ.tm);
    put('<div style="display:flex;justify-content:space-between;font-size:13px;opacity:.8"><span>Soru ' + (QZ.i + 1) + '/' + QZ.qs.length + '</span><span>⭐ ' + QZ.pts + ' puan</span></div>'
      + '<div style="height:6px;background:rgba(255,255,255,.12);border-radius:6px;margin:8px 0 14px;overflow:hidden"><div id="qz_bar" style="height:100%;width:100%;background:#22c55e;transition:width .25s linear"></div></div>'
      + '<div style="font-size:19px;font-weight:800;line-height:1.35;margin-bottom:4px">' + eh(q.q) + '</div>'
      + q.o.map((t, k) => '<button id="qz_o' + k + '" onclick="quizAns(' + k + ')" style="width:100%;text-align:left;border:2px solid rgba(255,255,255,.14);border-radius:14px;padding:13px 14px;font-size:15.5px;font-weight:600;color:#fff;background:#1c1c21;margin-top:9px">' + eh(t) + '</button>').join('')
      + '<div id="qz_fb"></div>');
    QZ.tm = setInterval(() => {
      const bar = g$('qz_bar'); if (!bar) { clearInterval(QZ.tm); return; } if (QZ.locked) return;
      const left = 15 - (Date.now() - QZ.t0) / 1000; bar.style.width = Math.max(0, left / 15 * 100) + '%'; bar.style.background = left < 5 ? '#ef4444' : left < 10 ? '#f59e0b' : '#22c55e';
      if (left <= 0) window.quizAns(-1);
    }, 250);
  };
  window.quizAns = k => {
    if (QZ.locked) return; QZ.locked = true; clearInterval(QZ.tm);
    const q = QZ.qs[QZ.i], ok = k === q.a, secs = (Date.now() - QZ.t0) / 1000, gain = ok ? 10 + (secs < 5 ? 5 : secs < 10 ? 3 : 0) : 0;
    if (ok) { QZ.pts += gain; QZ.ok++; }
    q.o.forEach((t, j) => { const b = g$('qz_o' + j); if (!b) return; b.disabled = true; if (j === q.a) { b.style.background = '#15803d'; b.style.borderColor = '#4ade80'; } else if (j === k) { b.style.background = '#b91c1c'; b.style.borderColor = '#f87171'; } else b.style.opacity = '.55'; });
    const fb = g$('qz_fb'); if (fb) fb.innerHTML = '<div style="margin-top:12px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.08);font-size:14px;line-height:1.45"><b>' + (ok ? '✅ Doğru! +' + gain : k < 0 ? '⏱ Süre doldu.' : '❌ Yanlış.') + '</b> ' + eh(q.e) + '</div>'
      + btn(QZ.i + 1 < QZ.qs.length ? 'Sonraki ▶' : 'Sonucu gör 🏁', 'quizNext()', 'linear-gradient(135deg,#2563eb,#1d4ed8)');
  };
  window.quizNext = () => { QZ.i++; if (QZ.i < QZ.qs.length) showQ(); else finish(); };
  const finish = async () => {
    const n = QZ.qs.length, t = QZ.ok >= 9 ? '👨‍🍳 Usta şef!' : QZ.ok >= 7 ? '🔥 Harika!' : QZ.ok >= 5 ? '👍 İdare eder' : '📚 Biraz daha çalış';
    put('<div style="text-align:center;font-size:20px;font-weight:800">' + t + '</div><div style="text-align:center;font-size:44px;font-weight:800;color:#fde68a;margin:6px 0">' + QZ.pts + ' puan</div>'
      + '<div style="text-align:center;opacity:.85">' + QZ.ok + ' / ' + n + ' doğru</div><div id="qz_sv" style="text-align:center;font-size:13px;opacity:.8;margin:10px 0">Skor kaydediliyor…</div>'
      + btn('▶ Tekrar oyna', 'quizPlay()', 'linear-gradient(135deg,#16a34a,#15803d)') + btn('🏆 Skor tablosu', 'quizBoard()', 'linear-gradient(135deg,#2563eb,#1d4ed8)') + btn('Ana ekran', 'quizHome()', '#475569'));
    const set = s => { const e = g$('qz_sv'); if (e) e.textContent = s; };
    if (!meId()) { set('Yönetici/misafir oyunu: puan skor tablosuna yazılmaz.'); return; }
    try {
      const r = await gs('quizSubmit', B, meId(), meName(), QZ.pts, QZ.ok);
      set(r.scored ? '✓ Skora yazıldı · bu ayki toplamın: ' + r.pts + ' puan · bugün ' + r.left + ' puanlı oyun hakkın kaldı' : 'Bugünkü 3 puanlı oyun hakkını doldurdun; bu oyun skora yazılmadı. Yarın tekrar!');
    } catch (e) { set('⚠ Skor kaydedilemedi: ' + (e && e.message || '')); }
  };
  window.quizBoard = async () => {
    put('<p style="opacity:.7">Yükleniyor…</p>');
    let p = {}; try { p = (await gs('getQuizBoard', B, trYm())) || {}; } catch (e) { put('<p>⚠ Skor tablosu açılamadı.</p>' + btn('Geri', 'quizHome()', '#475569')); return; }
    const L = Object.keys(p).map(id => Object.assign({ id: id }, p[id])).sort((a, b) => b.pts - a.pts || b.best - a.best).slice(0, 20), me = meId();
    const med = k => k == 0 ? '🥇' : k == 1 ? '🥈' : k == 2 ? '🥉' : (k + 1) + '.';
    put('<div style="font-size:20px;font-weight:800;margin-bottom:2px">🏆 Skor tablosu</div><div style="font-size:12px;opacity:.65;margin-bottom:8px">Bu ay · en iyi 20 · günde 3 oyun puanlanır</div>'
      + (L.length ? L.map((x, k) => '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;margin-top:6px;border-radius:12px;background:' + (x.id == me ? 'rgba(34,197,94,.22)' : '#1c1c21') + '"><div style="width:30px;font-size:17px;text-align:center">' + med(k) + '</div><div style="flex:1;min-width:0"><div style="font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + eh(x.n || '—') + '</div><div style="font-size:11px;opacity:.6">' + x.g + ' oyun · en iyi ' + x.best + '</div></div><div style="font-weight:800;color:#fde68a;font-size:18px">' + x.pts + '</div></div>').join('') : '<p style="opacity:.6">Henüz oynayan yok. İlk sen ol!</p>')
      + btn('▶ Oyna', 'quizPlay()', 'linear-gradient(135deg,#16a34a,#15803d)') + btn('Geri', 'quizHome()', '#475569'));
  };
  // ----- yönetici: kendi şubenin soruları -----
  window.quizAdmin = async () => {
    put('<p style="opacity:.7">Yükleniyor…</p>'); await loadCust(true);
    const L = CUST || [];
    put('<div style="font-size:20px;font-weight:800;margin-bottom:6px">➕ Soru ekle</div>'
      + '<input id="qa_q" placeholder="Soru (örn. Hangi tatlımız fıstıklıdır?)" style="' + inp + '">'
      + [0, 1, 2, 3].map(i => '<input id="qa_o' + i + '" placeholder="' + 'ABCD'[i] + ' şıkkı" style="' + inp + '">').join('')
      + '<select id="qa_a" style="' + inp + '"><option value="0">Doğru cevap: A</option><option value="1">Doğru cevap: B</option><option value="2">Doğru cevap: C</option><option value="3">Doğru cevap: D</option></select>'
      + '<input id="qa_e" placeholder="Açıklama (isteğe bağlı)" style="' + inp + '">'
      + btn('Kaydet', 'quizAdd()', 'linear-gradient(135deg,#16a34a,#15803d)')
      + '<div style="font-weight:800;margin:18px 0 4px">Eklediğim sorular (' + L.length + ')</div>'
      + (L.length ? L.map(q => '<div style="background:#1c1c21;border-radius:12px;padding:10px 12px;margin-top:6px"><div style="font-weight:700;font-size:14px">' + eh(q.q) + '</div><div style="font-size:12px;opacity:.7;margin-top:2px">✓ ' + eh(q.o[q.a]) + '</div><button onclick="quizDel(\'' + eh(q.id) + '\')" style="margin-top:6px;border:0;border-radius:8px;padding:6px 12px;background:#7f1d1d;color:#fff;font-weight:700">🗑 Sil</button></div>').join('') : '<p style="opacity:.6;font-size:13px">Henüz kendi sorun yok. Menüne özel sorular ekleyebilirsin.</p>')
      + btn('Geri', 'quizHome()', '#475569'));
  };
  const saveCust = async () => { await gs('setQuizQ', B, CUST, PIN); };
  window.quizAdd = async () => {
    const v = id => (g$(id) ? g$(id).value.trim() : ''), o = [0, 1, 2, 3].map(i => v('qa_o' + i));
    if (!v('qa_q') || o.some(x => !x)) { msg('Soru ve 4 şıkkın hepsini yaz'); return; }
    CUST = (CUST || []).concat([{ id: Math.random().toString(36).slice(2, 8), q: v('qa_q'), o: o, a: Number(v('qa_a')) || 0, e: v('qa_e') }]);
    try { await saveCust(); msg('✓ Soru eklendi'); } catch (e) { CUST.pop(); msg((e && e.message) || 'Kaydedilemedi'); }
    window.quizAdmin();
  };
  window.quizDel = async id => {
    if (!confirm('Soru silinsin mi?')) return; const old = CUST;
    CUST = (CUST || []).filter(q => q.id != id);
    try { await saveCust(); } catch (e) { CUST = old; msg((e && e.message) || 'Silinemedi'); }
    window.quizAdmin();
  };
})();


// ===== 🔑 Personel şifresi: herkes kendi belirler (bir kez), cihaz hatırlar; yönetici sıfırlar =====
(function () {
  const meOf = () => { try { return localStorage.getItem('mola_me_' + B) || ''; } catch (e) { return ''; } };
  const okK = id => 'mola_pin_ok_' + B + '_' + id;
  const getOk = id => { try { return localStorage.getItem(okK(id)) || ''; } catch (e) { return ''; } };
  const setOk = (id, v) => { try { localStorage.setItem(okK(id), String(v)); } catch (e) {} };
  const clrOk = id => { try { localStorage.removeItem(okK(id)); } catch (e) {} };
  const inp = 'width:100%;box-sizing:border-box;margin-top:8px;padding:13px;border-radius:12px;border:1px solid #334155;background:#0f172a;color:#fff;font-size:20px;text-align:center;letter-spacing:.3em';
  const btnS = 'width:100%;margin-top:10px;border:0;border-radius:12px;padding:13px;font-size:16px;font-weight:800;color:#fff;background:#16a34a';
  const modal = o => new Promise(res => {
    const ov = document.createElement('div'); ov.id = 'pinov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#0b1220;display:flex;align-items:center;justify-content:center;padding:18px';
    ov.innerHTML = '<div style="width:100%;max-width:380px;background:#172033;border:1px solid rgba(148,163,184,.25);border-radius:22px;padding:22px 18px;color:#fff;text-align:center"><div style="font-size:38px">🔑</div><div style="font-size:19px;font-weight:800;margin-top:4px">' + esc(o.title) + '</div><div style="font-size:13px;opacity:.75;margin:6px 0 8px;white-space:pre-line">' + esc(o.sub || '') + '</div>'
      + o.fields.map((f, i) => '<input class="pinf" type="password" ' + (o.free ? '' : 'inputmode="numeric" maxlength="8" ') + 'autocomplete="off" placeholder="' + esc(f) + '" style="' + inp + '">').join('')
      + '<div class="pinerr" style="color:#fca5a5;font-size:13px;min-height:18px;margin:8px 0 0"></div><button class="pinok" style="' + btnS + '">' + esc(o.btn) + '</button>'
      + (o.adm ? '<button class="pinadm" style="' + btnS + ';background:#7c3aed;font-weight:600;font-size:14px">🔑 Yönetici şifresiyle gir</button>' : '')
      + (o.alt ? '<button class="pinalt" style="' + btnS + ';background:#334155;font-weight:600;font-size:14px">' + esc(o.alt) + '</button>' : '') + '</div>';
    document.body.appendChild(ov);
    const q = c => ov.querySelector(c), fs = Array.from(ov.querySelectorAll('.pinf')); if (fs[0]) setTimeout(() => fs[0].focus(), 50);
    const go = async () => {
      const b = q('.pinok'); b.disabled = true; q('.pinerr').textContent = '';
      let r; try { r = await o.submit(fs.map(x => x.value.trim())); } catch (e) { r = 'Hata, tekrar dene'; }
      b.disabled = false;
      if (r === true) { ov.remove(); res(true); } else q('.pinerr').textContent = String(r || 'Hata');
    };
    q('.pinok').onclick = go; fs.forEach(f => f.addEventListener('keydown', e => { if (e.key == 'Enter') go(); }));
    if (o.alt) q('.pinalt').onclick = () => { ov.remove(); res('alt'); };
    if (o.adm) q('.pinadm').onclick = () => { ov.remove(); res('adm'); };
  });
  const admFlow = async id => {          // yönetici şifresi doğruysa bu oturumda şifresiz girer (kalıcı kayıt yok)
    const r = await modal({ title: 'Yönetici şifresi', sub: 'Yönetici şifresini girince bu profile şifresiz girersin.', fields: ['Yönetici şifresi'], free: true, btn: 'Giriş', alt: 'Geri',
      submit: async v => { try { return (await gs('checkPin', v[0])) ? true : 'Şifre yanlış'; } catch (e) { return 'Şifre yanlış'; } } });
    if (r === true) { CH[B + id] = 1; } else { delete CH[B + id]; setTimeout(() => gate(id), 100); }
  };
  const setFlow = id => modal({
    title: 'Şifre belirle', sub: 'Kendine 4-8 haneli rakamdan oluşan bir şifre belirle. Bu telefonda bir kez girmen yeter, sonra sormaz.\nUnutursan yöneticiye söyle, sıfırlasın.',
    fields: ['Yeni şifre', 'Şifreyi tekrar yaz'], btn: 'Kaydet', adm: true,
    submit: async v => {
      if (!/^\d{4,8}$/.test(v[0])) return 'Şifre 4-8 haneli rakam olmalı';
      if (v[0] !== v[1]) return 'İki şifre aynı değil';
      try { const r = await gs('staffPinSet', id, v[0]); setOk(id, r.t); return true; } catch (e) { const m = emsg(e); if (/zaten/.test(m)) { delete CH[B + id]; return true; } return m; }
    }
  });
  const FAIL = {};
  const askFlow = id => modal({
    title: 'Şifreni gir', sub: 'Bu telefonda bir kez girmen yeter.', fields: ['Şifren'], btn: 'Giriş', adm: true, alt: 'Ben değilim / başka kişi seç',
    submit: async v => {
      const f = FAIL[id] || (FAIL[id] = { n: 0, t: 0 });
      if (f.t > Date.now()) return 'Çok fazla yanlış deneme. ' + Math.ceil((f.t - Date.now()) / 60000) + ' dk sonra tekrar dene.';
      const r = await gs('staffPinCheck', id, v[0]);
      if (r.none) { delete CH[B + id]; return true; }
      if (!r.ok) { f.n++; if (f.n >= 5) { f.n = 0; f.t = Date.now() + 5 * 60000; } return 'Şifre yanlış'; }
      setOk(id, r.t); return true;
    }
  }).then(r => { if (r === 'alt') { try { window.pickMe(null); } catch (e) {} } else if (r === 'adm') return admFlow(id); });
  const CH = {}; let busy = false;
  const gate = async id0 => {
    if (busy || document.getElementById('pinov')) return;
    if (typeof M !== 'undefined' && M == 'y') return;
    const id = meOf(); if (!id || (id0 && id0 != id) || CH[B + id]) return;
    if (!((typeof D !== 'undefined' && D && D.staff) || []).some(x => x.id == id)) return;
    busy = true;
    try {
      const st = await gs('staffPinState', id); if (!st) return;
      CH[B + id] = 1;
      if (!st.has) { clrOk(id); const r0 = await setFlow(id); if (r0 === 'adm') await admFlow(id); }
      else if (getOk(id) !== String(st.t)) { clrOk(id); await askFlow(id); }
    } catch (e) {} finally { busy = false; }
  };
  // Şifre sadece kişi kendi ismine tıklayınca / kendi ekranı açılınca istenir (ana ekranda ve yönetici girişinde çıkmaz)
  const op = window.pickMe; if (typeof op == 'function') window.pickMe = id => { op(id); if (id) setTimeout(() => gate(id), 400); };
  const of0 = window.tipFill; if (typeof of0 == 'function') window.tipFill = s0 => { try { if (s0 && s0.id) gate(s0.id); } catch (e) {} return of0(s0); };
  setInterval(() => { const o = document.getElementById('pinov'); if (o && typeof M !== 'undefined' && M == 'y') o.remove(); }, 1000);
  // yönetici: personel menüsüne "🔑 Şifreyi sıfırla" düğmesi
  const addRst = () => {
    if (typeof M === 'undefined' || M != 'y') return;
    document.querySelectorAll('button').forEach(b => {
      if (!/Bildirim kodu/.test(b.textContent)) return;
      const nx = b.nextElementSibling; if (nx && nx.dataset && nx.dataset.pinrst) return;
      const card = b.parentElement; if (!card) return;
      const names = Array.from(card.children).map(c => c.textContent.trim()), st = ((typeof D !== 'undefined' && D && D.staff) || []).find(x => names.some(n => n && (n === nice(x.name) || n === x.name)));
      if (!st) return;
      const nb = document.createElement('button'); nb.className = b.className; nb.setAttribute('style', b.getAttribute('style') || ''); nb.dataset.pinrst = '1'; nb.textContent = '🔑 Şifreyi sıfırla';
      nb.onclick = async e => { e.stopPropagation(); if (!confirm(nice(st.name) + ' için şifre sıfırlansın mı?\nBir sonraki girişinde yeni şifre belirler.')) return; try { await gs('staffPinReset', st.id, PIN); msg('✅ ' + nice(st.name) + ' şifresi sıfırlandı. Girişte yeni şifre belirleyecek.'); } catch (er) { msg(emsg(er)); } };
      b.insertAdjacentElement('afterend', nb);
    });
  };
  new MutationObserver(addRst).observe(document.body, { childList: true, subtree: true });
})();

// ===== 📝 Menü Sınavı (yazılı sınav · cevap anahtarı · yönetici puanlaması) =====
(function () {
  const EXAM = {"1":{"t":"Ünite 1","q":["Serpme Kahvaltıdaki Peynir Çeşitleri Nedir- Kaç Kişiye Ücretsiz Çay Vardır- 3 Kişilik Yapılabilir mi?","Meyveli Pancake İçindeki Meyveler Nelerdir, Hangi Saate Kadar Servisi Vardır?","Egg Royale İçeriğini yazınız?","Kaç Çeşit Granola Vardır, Granola Bowl’un İçeriğini Yazınız?","Peynir Tabağındaki Peynir Çeşitlerini Yazınız?","Toquitos İçeriğini Yazınız, Yanındaki Sosları Nedir?","Günün Çorbalarını Günlere Göre Sırasıyla Yazınız?","Sızzler Burger’in İçeriğini ve Sunum Şeklini Yazınız? Burgerlerin Köfte Gramajını Yazınız?","Burger Sosun İçeriğini Yazınız?","Noodle Tavuklu İçeriğini Sosuyla Birlikte Yazınız?","Köri Soslu Tavuk İçeriğini ve Garnitürlerini Yazınız, İçinde Mantar Var mıdır?","Jerk Chıcken Tabanındaki Sos Nedir, Tavuk But mu- Gögüs müdür?","Cafe de Paris Bonfile Sosunun İçeriğini ve Garnitürlerini Yazınız, Et’i Kaç Gr’dır?","Fısh&Chips’te Balığın Cinsi Nedir, Nerede Pişer, Garnitürlerini Yazınız?","Akdeniz Pizza İçeriğini Yazınız?","Kaç Çeşit Bowl Vardır, 1 Tanesinin İçeriğini Yazınız?","Örümcek Adamın Favorisi Nedir, İçeriğini Yazınız?","Yanında Sos Olan Bir Yemeğe İlave 1 Sos Daha İstendiğinde Extra Fiyat Yansıtılır Mı, Ya Da Hangi Durumlarda Yansıtılır?","Everest’in İçeriğini Yazınız?","Detoks Limonata İçeriğini Yazınız?","Refresher Kokteyl- Raspberry Acai İçeriğini Yazınız?","Aromalı Kahve ve Specıal Kahve Çeşitlerini Yazınız?","Kadeh Verdiğimiz Kırmızı Şarapları Yazınız?","Aperol Spritz İçeriğini Yazınız?","Long Island İçeriğini Yazınız?"],"k":["Beyaz Peynir, Kaşar Peyniri, Eski Kaşar, Hellim Peyniri, Dil Peyniri, Lor Peyniri Vardır. 2 Kişiye Sınırsız Çay Servisi Yapılır. 1.5 Tuşlayarak 3 Kişilik De Yapılabilir.","Muz Ve Çilek Vardır. Gün Boyu Servisi Yapılır.","Brıoche Ekmeği Üzerinde Sote Ispanak, Somon Füme, Poşe Yumurta Ve Hollandez Sos İle Hazırlanır. (Hollandez Sos: Yumurta Sarısı- Tereyağ-Limon Suyu)","3 Çeşit Granola Vardır. Granola Bowl İçeriğinde Orman Meyveli Yoğurt, Granola, Bisküvi Kırıntısı Ve Çilek Vardır.","Rokfor Peyniri, İsli Peynir, Beyaz Peynir, Kaşar Peyniri, Eski Kaşar, Dil Peyniri, Cheddar Peyniri","Bbq Soslu Tiftik Et, Renkli Biberler, Soğan ve Cheddar Peyniri İle Sarılıp Fritözde Kızartılmış 4 Adet Mısır Tortillası. Yanında Salsa- Sourcream Sos Vardır. Üzerinde İse Lor Peyniri Ve Ranchero Sos İle Servis Edilir.","Haftanın 6 Günü Sırasıyla; Yayla, Közde Patlıcan, Tahıllı Köy, Süzme Mercimek, Şehriyeli Tavuk Ve Ezo Gelin Çorbası. Haftanın 7 Günü Sabit Olarak Domates Çorbası Vardır.","İçeriğinde Burger Köftesinin Üzerinde Karamelize Soğan Vardır. Sıcak Döküm Tabakta Ve Cheddar Soslu Olarak Servis Edilir. Burger Köftelerinin Gramajı 160. Gr’dır.","Burger Sosun İçeriğinde Mayonez ve Sweet Chılı Sos Vardır. Bu Sos Tüm Burgerlerde Vardır.","Julıan Tavuk Dilimleri, Havuç, Renkli Biberler, Taze Soğan, Kabak, Mantar Ve Noodle Sos İle Pişirilir. Üzerinde Susam Serpilir. Noodle Sos: Oister Sos, Susam Yağı, Soya Sos’un Karışımıdır.","Kuşbaşı Tavuk Göğüs Parçaları (250gr) Krema Ve Köri Sos İle Pişirilir. Yanında Safranlı Pilav, Sebze Ve Patates İle Servis Edilir. İçinde Mantar Yoktur, İstenir İse Extra Olarak İlave Edilebilir.","Tabanda Mantar, Soğan ve Yumurta Cheddar sos Yoğunluktadır. 3 Şiş Olarak Servis Edilir.","Rokfor Peyniri, Krema, Tereyağ, Köri Ve Çeşitli Bahatlar İle Elde Edilen Fransız Kökenli Bir Sostur. Bonfile 200 Gr’dır. Yanında Patates ve Yeşillik Vardır.","Fileto Mezgit Balığından Yapılır. Fritözde Pişer. Yanında Yeşillik, Patates ve Tartar Sos İle Servis Edilir.","Mozarella Peyniri, Domates Sos, Salam, Mantar, Yeşil Biber, Domates ve Soğan Vardır.","Falafel Bowl, Köfte Bowl Ve Tavuk Bowl Olarak 3 Çeşit Bowl Vardır…Köfte Bowl; 180 Gr-6 Adet Köfte, Buğday Tabule, Kimyonlu Nohut, Köz Biber Turşusu ve Avakado’dan Oluşur.","4 Adet Izgara Köfte, Yanında Safranlı Pilav Ve Patates İle Servis Edilir.","Yanında Sos Olan Yemeğe Aynı Sostan 1 Adet Daha İstenir İse Ücretsiz Olarak Verilir. 1’den Fazla İstenen Soslar İse Extra Olarak Yazılır.","Özel Krema, Küp Brownıe Parçaları ve Taze Çilek İle Yapılır.","Normal Limonataya Ek Olarak Salatalık ve Maydanoz İle Blender’da Yapılır.","Raspberry Acai mix ve Soda","Aromalı Kahveler: Hazelnut, Irısh Cream, French Vanilya. Specıal Kahveler: Banana Capucıno, Caramel Mocha, Strawberry Cappucıno.","Yakut, Angora Kırmızı, Gato Negro Cabarnet Sauvıgnon, Ancyra Merlot.","Aperol, Prosecco, Soda, Çilek İle.","Vodka, Cin, Tekila, Rum, Portakal Likörü, Sweet Sour Mix ve Cola İle."]},"2":{"t":"Ünite 2","q":["Kahvaltı Tabağında Kaç Kişiye Ücretsiz Çay Vardır- Yumurtası Sahanda Yapılabilir Mi?","Egg Benedict İçeriğini Yazınız?","Kaç Çeşit Nachos Vardır, Etli İstenir İse Nasıl Fiyatlandırma Yapılır?","Happy Moon’s Burger’in Sosunun İçeriği Nedir?","BBQ Burger’in Et Özelliği Nedir, Yanında Garnitür Ne Vardır?","Tortilla’da Sunumu Yapılan Burger Hangisidir, İçeriğini Yazınız.. Burgerlerin Et Gramajını Yazınız?","Kaç Çeşit Tavuklu Salata Vardır, İsimlerini Yazınız?","Honey Mustard Sosun İçeriğini Yazınız?","Burritos Tavuklu İçeriğini Ve Yanındaki Garnitürleri Yazınız?","Fajitaların Yanında Kaç Adet Tortilla Servis Edilir, Ek İstenirse Nasıl Uygulama Yapılır?","Fettucine Alfredo’nun İçeriğini Yazınız?","Arizona Chıcken Sosunun Adı Nedir, Nasıl Bir Tadı Vardır, Garnitürlerini Yazınız?","But’tan Yapılan Tavuk Yemeklerini Yazınız?","Happy Moons Kebap İçeriğini Yazınız?","Fısh & Chips’te Balığın Cinsi Nedir, Nerede Pişer, Garnitürlerini Yazınız?","4 Peynirli Pizza’daki Peynir Çeşitlerini Yazınız?","Fit Menüde Olan Yemekleri Yazınız?","Little Chıcken Kaç Adettir, Garnitürlerini Yazınız?","Yanında Sos Olan Bir Yemeğe İlave 1 Sos Daha İstendiğinde, Extra Fiyat Yansıtılır Mı, Ya Da Hangi Durumlarda Yansıtılır","Yanında Ve İçinde Dondurma Olan Tatlıları Yazınız?","Kaç Çeşit Limonata Vardır, Çeşitlerini Yazınız?","Bitki Ve Meyve Çayı Çeşitlerini Yazınız?","Kadeh Verdiğimiz Beyaz Şarapları Yazınız?","Lyncburg Lemonade İçeriğini Yazınız?","Mojito’nun İçeriğini Yazınız?","Mandarin içeriğini yazınız?"],"k":["Çay 1 Kişiye Ücretsizdir, Yumurtası Sahanda Göz Şeklinde Veya Çırpılmış Olarak Yapılabilir.","Brıoche Ekmeği Üzerinde Sote Ispanak, Dana Bacon, Poşe Yumurta ve Hollandez Sos İle Hazırlanır. (Hollandez Sos: Yumurta Sarısı- Tereyağ- Limon Suyu)","Peynirli Ve Tavuklu Çeşitleri Vardır. Etli İstenir İse Müdür Bilgisi Dahilinde Extra Bonfile Girişi Yapılarak Servis Edilebilir.","Krema, Mantar Ve Dömi Glass Sostan Oluşur","Fırında Pişmiş Tiftik Ettir. Piştikten Sonra Bbq Sos İle Harmanlanır. Tüm Burgerlerin Yanında Patates ve Yeşillik Vardır.","Colorado Burger Tortillaya Sarılı Olarak Hazırlanır. İçinde Karamelize Soğan, Mantar Ve Cheddar Peyniri Vardır. Burger Köftelerinin Gramajı 160. Gr’dır.","5 Çeşit Tavuklu Salata Vardır..Kinoa Tavuk Salata- Cajun Chıcken Salata- Tavuk Salatası- Tavuklu Sezar Salata- Mexıcan Fıesta Salata","Bal- Hardal, Mayonez, Tuz- Karabiber","Tortilla Ekmeğine Sarılı Olarak Servis Edilir. İçeriği: Julıan Tavuk Parçaları-Renkli Biberler-Soğan-Kaşar Peyniri..Üzerinde Dilim Kaşar Peyniri, Ranchero Sos İle. (Ranchero Sos: Acı Biber Sosu)","4 Adet Totilla Servis Edilir. 2 Adet Daha İstenir İse Ücretsiz Verilir. 3. ve Daha Sonraki İsteklerde Extra Ücretlendirme Yapılır.","Krema, Mantar, Dana, Jambon, Sarımsak, Pesto Sos… Makarna Gramajı 250 Gr’dır.","Sweet Chılı Sos’tur. Tatlı Acı Bir Tadı Vardır. Patates- Brokoli Ve Köz Kapya Biber İle Servis Edilir.","4 Adet Tavuk Yemeği But’tan Yapılır. Arizona Chıcken- Cajun Soslu Tavuk- Bacon& Cheese Tavuk- Hardal Soslu Tavuk","Yufkaya Sarılı 3 Şiş Olarak Servis Edilir. 180 Gr Köfte Vardır. Yanında Haşlanmış Sebze, Patates ve Cacık İle Servis Edilir.","Fileto Mezgit Balığından Yapılır. Fritözde Pişer. Yanında Yeşillik, Patates ve Tartar Sos İle Servis Edilir.","Mozarella, Rokfor, Hellim, Parmesan","Fit Broklili Tavuk- Fit Maş Fasulyeli Tavuk, Mangolıan Beef- Fit Somon Izgara","6 adet Nugget, Yanına Pilav ve Patates Vardır.","Yanında Sos Olan Yemeğe Aynı Sostan 1 Adet Daha İstenir İse Ücretsiz Olarak Verilir. 1’den Fazla İstenen Soslar İse Extra Olarak Ücretli Yazılır.","Brownıe, Dondurmalı Cookıe, Hot Chocolate Cake, Banana Split, Karamelize Elmalı Pıe, Kızarmış Dondurma, Waffle Cup","9 Çeşittir. Limonata-Çilekli Limonata-Naneli Limonata- Detox Limonata- Mango Peach Limonata- Passıon Limonata- Kırmızı Orman Meyveli Limonata- Mürver Öilekli Limonata- Zencefilli Limonata","Ihlamur- Red Forest- Elma Tarçın, Çilek, Kuşburnu, Yeşil Çay, Karamel Çayı, Earl Grey","4 Adet’tir. Çankaya, Angora Beyaz, Gato Negro Chardonnay, Ancyra Sauvıgnon Blanc","Jack Danıels, Portakal Likörü, Sweet Sour Mix, Sprite","Rum, Esmer Şeker, Taze Nane, Lime, Soda",""]}};
  if (!document.getElementById('sncss')) {
    const st = document.createElement('style'); st.id = 'sncss';
    st.textContent = `
.sn{color:#e8ecf8;border-radius:16px;padding:12px;background:radial-gradient(120% 60% at 50% -10%,#1d2a5e 0%,#0d1226 60%,#090d1c 100%)}
.sn *{box-sizing:border-box}
.sn-t{font-size:20px;font-weight:800;margin:2px 0 4px}.sn-s{font-size:12.5px;color:#9aa6c7;line-height:1.45;margin:0 0 8px}
.sn-card{display:flex;align-items:center;gap:12px;width:100%;margin-top:10px;padding:14px;border:0;border-radius:18px;text-align:left;color:#fff;font-family:inherit;background:linear-gradient(135deg,#3b4fb8,#5b3fb8);box-shadow:0 8px 20px rgba(59,79,184,.35)}
.sn-card i{flex:none;width:50px;height:50px;border-radius:15px;display:grid;place-items:center;font-style:normal;font-size:26px;background:rgba(255,255,255,.2)}
.sn-card b{display:block;font-size:17px}.sn-card small{display:block;margin-top:2px;font-size:12.5px;opacity:.9;font-weight:600}
.sn-b{width:100%;border:0;border-radius:14px;padding:13px;margin-top:10px;font-size:15.5px;font-weight:800;color:#fff;background:#334155;font-family:inherit}
.sn-b.g{background:linear-gradient(135deg,#16a34a,#15803d)}.sn-b.r{background:#7f1d1d}.sn-b.o{background:linear-gradient(135deg,#d97706,#b45309)}
.sn-q{background:#161c36;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:12px;margin-top:10px}
.sn-qh{display:flex;gap:10px;align-items:flex-start}.sn-qn{flex:none;width:28px;height:28px;border-radius:50%;background:#4f46e5;color:#fff;font-weight:800;font-size:13px;display:grid;place-items:center}
.sn-qt{font-size:15px;font-weight:700;line-height:1.4}
.sn-ta{width:100%;margin-top:8px;background:#fff;color:#111;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font-size:15px;font-family:inherit;resize:vertical;min-height:70px}
.sn-ans{margin-top:8px;padding:9px 11px;border-radius:10px;background:rgba(255,255,255,.06);font-size:13.5px;line-height:1.45}
.sn-ans small{display:block;font-size:10.5px;font-weight:800;letter-spacing:.5px;color:#9aa6c7;margin-bottom:2px}
.sn-key{background:rgba(34,197,94,.14);border:1px solid rgba(34,197,94,.35)}
.sn-chip{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11.5px;font-weight:800}
.sn-gr{display:flex;gap:6px;margin-top:8px}.sn-gr button{flex:1;border:2px solid rgba(255,255,255,.15);border-radius:12px;padding:10px 2px;background:#1c2240;color:#cbd5e1;font-weight:800;font-size:14px;font-family:inherit}
.sn-gr button.on1{background:#15803d;border-color:#4ade80;color:#fff}.sn-gr button.on5{background:#b45309;border-color:#fbbf24;color:#fff}.sn-gr button.on0{background:#b91c1c;border-color:#f87171;color:#fff}
.sn-row{display:flex;align-items:center;gap:10px;width:100%;margin-top:8px;padding:12px;border:0;border-radius:14px;background:#161c36;color:#e8ecf8;text-align:left;font-family:inherit}
`;
    document.head.appendChild(st);
  }
  const eh = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const g$ = id => document.getElementById(id);
  const meId = () => { try { return localStorage.getItem('mola_me_' + B) || ''; } catch (e) { return ''; } };
  const meName = () => { const x = ((D && D.staff) || []).find(y => y.id == meId()); return x ? nice(x.name) : ''; };
  const adm = () => M == 'y';
  const put = h => { const m = g$('mf'); if (m) m.innerHTML = '<div class="sn">' + h + '</div>'; };
  const btn = (t, on, c) => '<button class="sn-b ' + (c || '') + '" onclick="' + on + '">' + t + '</button>';
  const fmtS = x => (Math.round(x * 2) / 2).toString().replace('.', ',');
  const dtf = t => { try { return new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  const EX = { 1: null, 2: null };            // yönetici önbelleği
  // ---- sınava girecek kişileri yönetici belirler ----
  let PERM = null, PT = 0;
  const loadPerm = async force => {
    if (!force && PERM && Date.now() - PT < 600000) return PERM;
    if (!force) { try { const c = JSON.parse(localStorage.getItem('exam_perm_' + B) || 'null'); if (c && c.ids && Date.now() - c.t < 900000) { PERM = c.ids; PT = c.t; return PERM; } } catch (e) {} }
    try { PERM = (await gs('getExamPerm', B)) || []; PT = Date.now(); try { localStorage.setItem('exam_perm_' + B, JSON.stringify({ t: PT, ids: PERM })); } catch (e) {} } catch (e) { PERM = PERM || []; }
    return PERM;
  };
  window.examChip = async () => {
    const el = g$('exam-chip'); if (!el) return; const me = meId(); if (!me) return;
    const ids = await loadPerm(), e2 = g$('exam-chip'); if (e2 && ids.indexOf(me) > -1) e2.style.display = '';
  };
  if (document.body) new MutationObserver(() => { const el = g$('exam-chip'); if (el && el.dataset.q !== '1') { el.dataset.q = '1'; window.examChip(); } }).observe(document.body, { childList: true, subtree: true });
  // ---- cevap anahtarına benzerlik önerisi (yönetici değiştirebilir) ----
  const STOP = ['vardir', 'olarak', 'servis', 'edilir', 'yazilir', 'icin', 'adet', 'daha', 'istenir', 'yaninda', 'uzerine', 'uzerinde', 'hazirlanir', 'yapilir', 'kisilik', 'ilave', 'gram'];
  const norm = s => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9 ]/g, ' ');
  const toks = s => norm(s).split(/\s+/).filter(w => (w.length >= 4 || /^\d+$/.test(w)) && STOP.indexOf(w) < 0);
  const suggest = (ans, key) => {
    if (!key) return null; const a = toks(ans), k = Array.from(new Set(toks(key))); if (!a.length || !k.length) return 0;
    const hit = k.filter(w => a.some(x => x == w || (w.length >= 5 && x.length >= 5 && x.slice(0, 5) == w.slice(0, 5)))).length, r = hit / k.length;
    return r >= 0.6 ? 1 : r >= 0.3 ? 0.5 : 0;
  };
  const fetchU = async (u, me) => (await gs('examGet', B, u, adm() ? PIN : '', me || '')) || {};
  const close = btn('Kapat', "document.getElementById('ov').hidden=true");

  // ================= PERSONEL =================
  const home = async () => {
    if (adm()) return adminHome();
    const me = meId();
    if (!me) { put('<div class="sn-t">📝 Menü Sınavı</div><p class="sn-s">Sınava girmek için önce ana ekrandan adını seçmelisin.</p>' + close); return; }
    put('<p class="sn-s">Yükleniyor…</p>');
    if ((await loadPerm()).indexOf(me) < 0) { put('<div class="sn-t">📝 Menü Sınavı</div><p class="sn-s">Bu sınav sana atanmadı. Girmen gerekiyorsa yöneticine haber ver.</p>' + close); return; }
    const st = {}; await Promise.all(['1', '2'].map(async u => { try { st[u] = (await fetchU(u, me))[me] || null; } catch (e) { st[u] = null; } }));
    const cardF = u => {
      const e = st[u], n = EXAM[u].q.length, sub = !e ? 'Henüz girmedin · ' + n + ' soru' : e.s != null ? 'Puanın: ' + fmtS(e.s) + ' / ' + n : '✓ Gönderildi · değerlendirme bekleniyor';
      return '<button class="sn-card" onclick="examOpen(\'' + u + '\')"><i>' + (!e ? '📝' : e.s != null ? '🏅' : '⏳') + '</i><span><b>' + EXAM[u].t + '</b><small>' + sub + '</small></span></button>';
    };
    put('<div class="sn-t">📝 Menü Sınavı</div><p class="sn-s">Yazılı sınav: her soruyu kendi cümlelerinle yaz. Her üniteyi bir kez gönderebilirsin. Yazdıkların kendiliğinden taslak olarak saklanır; sonuç ve cevap anahtarı yönetici puanladıktan sonra açılır.</p>' + cardF('1') + cardF('2') + close);
  };
  window.examUI = () => { pop('📝 Menü Sınavı', '', true); home(); };
  window.examHome = home;
  const dk = u => 'exam_d_' + B + '_' + u + '_' + meId();
  window.examOpen = async u => {
    const me = meId(); put('<p class="sn-s">Yükleniyor…</p>');
    let e = null; try { e = (await fetchU(u, me))[me] || null; } catch (x) { put('<p>⚠ Açılamadı.</p>' + btn('Geri', 'examHome()')); return; }
    if (!e) return form(u);
    if (e.s == null) { put('<div class="sn-t">' + EXAM[u].t + '</div><p class="sn-s">✓ Cevapların ' + dtf(e.t) + ' tarihinde gönderildi. Yönetici puanladığında sonucunu ve cevap anahtarını burada görebilirsin.</p>' + btn('Geri', 'examHome()')); return; }
    put('<div class="sn-t">' + EXAM[u].t + ' · sonuç</div><div style="text-align:center;font-size:38px;font-weight:800;color:#fde68a;margin:6px 0">' + fmtS(e.s) + ' / ' + EXAM[u].q.length + '</div>'
      + EXAM[u].q.map((q, i) => {
        const gr = (e.g || [])[i], ic = gr >= 1 ? '✅' : gr >= 0.5 ? '➖' : '❌';
        return '<div class="sn-q"><div class="sn-qh"><div class="sn-qn">' + (i + 1) + '</div><div class="sn-qt">' + eh(q) + '</div></div><div class="sn-ans"><small>SENİN CEVABIN ' + ic + '</small>' + (eh((e.a || [])[i]) || '<i>boş</i>') + '</div><div class="sn-ans sn-key"><small>CEVAP ANAHTARI</small>' + (eh(EXAM[u].k[i]) || '—') + '</div></div>';
      }).join('') + btn('Geri', 'examHome()'));
  };
  const form = u => {
    let d = {}; try { d = JSON.parse(localStorage.getItem(dk(u)) || '{}') || {}; } catch (e) {}
    put('<div class="sn-t">' + EXAM[u].t + ' · ' + EXAM[u].q.length + ' soru</div><p class="sn-s" id="sn_prog">0 / ' + EXAM[u].q.length + ' cevaplandı · taslak kendiliğinden saklanır</p>'
      + EXAM[u].q.map((q, i) => '<div class="sn-q"><div class="sn-qh"><div class="sn-qn">' + (i + 1) + '</div><div class="sn-qt">' + eh(q) + '</div></div><textarea id="sn_a' + i + '" class="sn-ta" maxlength="300" placeholder="Cevabını yaz…" oninput="examDraft(\'' + u + '\')">' + eh(d[i] || '') + '</textarea></div>').join('')
      + btn('📨 Sınavı gönder', "examSend('" + u + "')", 'g') + btn('Geri', 'examHome()'));
    window.examDraft(u, true);
  };
  window.examDraft = (u, noSave) => {
    const a = EXAM[u].q.map((q, i) => (g$('sn_a' + i) ? g$('sn_a' + i).value : '')), n = a.filter(x => x.trim()).length, p = g$('sn_prog');
    if (p) p.textContent = n + ' / ' + a.length + ' cevaplandı · taslak kendiliğinden saklanır';
    if (!noSave) { const o = {}; a.forEach((x, i) => { if (x) o[i] = x; }); try { localStorage.setItem(dk(u), JSON.stringify(o)); } catch (e) {} }
  };
  window.examSend = async u => {
    const a = EXAM[u].q.map((q, i) => (g$('sn_a' + i) ? g$('sn_a' + i).value.trim() : '')), n = a.filter(Boolean).length;
    if (!n) { msg('En az bir soruyu cevapla'); return; }
    if (!confirm((n < a.length ? (a.length - n) + ' soru boş. ' : '') + 'Gönderdikten sonra cevaplar değiştirilemez. Gönderilsin mi?')) return;
    try { await gs('examSubmit', B, u, meId(), meName(), a); try { localStorage.removeItem(dk(u)); } catch (e) {} msg('✓ Sınav gönderildi'); home(); }
    catch (e) { msg((e && e.message) || 'Gönderilemedi'); }
  };

  // ================= YÖNETİCİ =================
  const adminHome = async () => {
    put('<p class="sn-s">Yükleniyor…</p>');
    const pids = await loadPerm(true);
    await Promise.all(['1', '2'].map(async u => { try { EX[u] = await fetchU(u); } catch (e) { EX[u] = EX[u] || {}; } }));
    const cardA = u => { const p = EX[u] || {}, ids = Object.keys(p), gd = ids.filter(i => p[i].s != null).length; return '<button class="sn-card" onclick="examList(\'' + u + '\')"><i>📋</i><span><b>' + EXAM[u].t + ' · ' + EXAM[u].q.length + ' soru</b><small>' + ids.length + ' kişi gönderdi · ' + gd + ' puanlandı · ' + (ids.length - gd) + ' bekliyor</small></span></button>'; };
    put('<div class="sn-t">📝 Menü Sınavı · ' + BR[B] + '</div><p class="sn-s">Personelin yazılı cevaplarını cevap anahtarıyla karşılaştırıp puanla. Önerilen puan anahtardaki kelimelere göre hesaplanır; her soruyu sen değiştirebilirsin.</p>'
      + btn('👥 Sınava girecekleri seç (' + pids.length + ' kişi)', 'examPermUI()', 'o') + cardA('1') + cardA('2') + btn('🔑 Ünite 1 cevap anahtarı', "examKey('1')") + btn('🔑 Ünite 2 cevap anahtarı', "examKey('2')") + close);
  };
  window.examKey = u => {
    put('<div class="sn-t">🔑 ' + EXAM[u].t + ' · cevap anahtarı</div>' + EXAM[u].q.map((q, i) => '<div class="sn-q"><div class="sn-qh"><div class="sn-qn">' + (i + 1) + '</div><div class="sn-qt">' + eh(q) + '</div></div><div class="sn-ans sn-key"><small>CEVAP</small>' + (eh(EXAM[u].k[i]) || '⚠ Cevap anahtarında yok — kendin değerlendir') + '</div></div>').join('') + btn('Geri', 'examHome()'));
  };
  window.examList = async u => {
    put('<p class="sn-s">Yükleniyor…</p>'); try { EX[u] = await fetchU(u); } catch (e) { EX[u] = EX[u] || {}; }
    const p = EX[u], ids = Object.keys(p).sort((a, b) => (p[a].n || '').localeCompare(p[b].n || '', 'tr'));
    const missing = (((D && D.staff) || []).filter(s => !s.off && !p[s.id] && (PERM || []).indexOf(s.id) > -1)).map(s => nice(s.name)).sort((a, b) => a.localeCompare(b, 'tr'));
    put('<div class="sn-t">📋 ' + EXAM[u].t + ' · gönderenler</div>'
      + (ids.length ? ids.map(id => { const e = p[id]; return '<button class="sn-row" onclick="examGradeUI(\'' + u + '\',\'' + eh(id) + '\')"><span style="flex:1;min-width:0"><b>' + eh(e.n || id) + '</b><br><small style="color:#9aa6c7">' + dtf(e.t) + '</small></span>'
        + (e.s != null ? '<span class="sn-chip" style="background:#15803d;color:#fff">' + fmtS(e.s) + ' / ' + EXAM[u].q.length + '</span>' : '<span class="sn-chip" style="background:#b45309;color:#fff">Bekliyor</span>') + '</button>'; }).join('') : '<p class="sn-s">Henüz kimse göndermedi.</p>')
      + (missing.length ? '<div class="sn-s" style="margin-top:14px"><b>Henüz girmeyenler (' + missing.length + '):</b> ' + eh(missing.join(', ')) + '</div>' : '') + btn('Geri', 'examHome()'));
  };
  let PSEL = null, PL = [];
  const drawP = s => { const el = g$('sn_p_' + s.id); if (el) el.innerHTML = '<span style="font-size:20px">' + (PSEL.has(s.id) ? '✅' : '⬜') + '</span><span style="flex:1;font-weight:700">' + eh(nice(s.name)) + '</span><small style="color:#9aa6c7">' + eh(s.sec || '') + '</small>'; };
  window.examPermUI = async () => {
    put('<p class="sn-s">Yükleniyor…</p>'); PSEL = new Set(await loadPerm(true));
    PL = ((D && D.staff) || []).filter(s => !s.off).sort((a, b) => nice(a.name).localeCompare(nice(b.name), 'tr'));
    put('<div class="sn-t">👥 Sınava girecekler</div><p class="sn-s">Seçtiğin kişilerin ekranında “Menü Sınavı” butonu görünür. Seçmediklerin sınavı hiç görmez.</p>'
      + '<div style="display:flex;gap:8px"><button class="sn-b" style="margin:10px 0 0" onclick="examPermAll(true)">Hepsini seç</button><button class="sn-b" style="margin:10px 0 0" onclick="examPermAll(false)">Temizle</button></div>'
      + PL.map(s => '<button class="sn-row" id="sn_p_' + eh(s.id) + '" onclick="examPermTog(\'' + eh(s.id) + '\')"></button>').join('')
      + btn('💾 Kaydet', 'examPermSave()', 'g') + btn('Geri', 'examHome()'));
    PL.forEach(drawP);
  };
  window.examPermTog = id => { if (PSEL.has(id)) PSEL.delete(id); else PSEL.add(id); const s = PL.find(x => x.id == id); if (s) drawP(s); };
  window.examPermAll = v => { PSEL = new Set(v ? PL.map(s => s.id) : []); PL.forEach(drawP); };
  window.examPermSave = async () => {
    try { const ids = Array.from(PSEL); await gs('setExamPerm', B, ids, PIN); PERM = ids; PT = Date.now(); try { localStorage.setItem('exam_perm_' + B, JSON.stringify({ t: PT, ids: ids })); } catch (e) {} msg('✓ ' + ids.length + ' kişi sınava atandı'); home(); }
    catch (e) { msg((e && e.message) || 'Kaydedilemedi'); }
  };
  let GR = null;
  window.examGradeUI = (u, id) => {
    const e = (EX[u] || {})[id]; if (!e) return;
    GR = { u: u, id: id, g: EXAM[u].q.map((q, i) => (e.g && e.g[i] != null) ? e.g[i] : suggest((e.a || [])[i], EXAM[u].k[i])), had: e.g != null };
    put('<div class="sn-t">' + eh(e.n || id) + ' · ' + EXAM[u].t + '</div><p class="sn-s">' + (GR.had ? 'Daha önce puanlanmış; değiştirebilirsin.' : 'Puanlar cevap anahtarına göre <b>önerilmiştir</b>, kontrol edip gerekirse değiştir.') + '</p>'
      + '<div style="position:sticky;top:0;z-index:5;background:#0d1226;padding:6px 0;text-align:center;font-weight:800;font-size:17px;color:#fde68a" id="sn_tot"></div>'
      + EXAM[u].q.map((q, i) => '<div class="sn-q"><div class="sn-qh"><div class="sn-qn">' + (i + 1) + '</div><div class="sn-qt">' + eh(q) + '</div></div>'
        + '<div class="sn-ans"><small>PERSONELİN CEVABI</small>' + (eh((e.a || [])[i]) || '<i>boş</i>') + '</div>'
        + '<div class="sn-ans sn-key"><small>CEVAP ANAHTARI</small>' + (eh(EXAM[u].k[i]) || '⚠ Cevap anahtarında yok — kendin değerlendir') + '</div>'
        + '<div class="sn-gr" id="sn_g' + i + '"></div></div>').join('')
      + btn('💾 Puanı kaydet', 'examSaveG()', 'g') + btn('🗑 Cevapları sil (tekrar girebilsin)', 'examResetG()', 'r') + btn('Geri', "examList('" + u + "')"));
    EXAM[u].q.forEach((q, i) => drawG(i)); drawTot();
  };
  const drawG = i => {
    const el = g$('sn_g' + i); if (!el) return; const v = GR.g[i];
    el.innerHTML = [[1, '✓ Doğru', 'on1'], [0.5, '½ Kısmi', 'on5'], [0, '✗ Yanlış', 'on0']].map(x => '<button class="' + (v === x[0] ? x[2] : '') + '" onclick="examSetG(' + i + ',' + x[0] + ')">' + x[1] + '</button>').join('');
  };
  const drawTot = () => { const t = g$('sn_tot'); if (!t) return; const s = GR.g.reduce((a, b) => a + (b || 0), 0), un = GR.g.filter(x => x == null).length; t.textContent = 'Toplam: ' + fmtS(s) + ' / ' + GR.g.length + (un ? ' · ' + un + ' soru işaretsiz' : ''); };
  window.examSetG = (i, v) => { GR.g[i] = v; drawG(i); drawTot(); };
  window.examSaveG = async () => {
    try { const s = await gs('examGrade', B, GR.u, GR.id, GR.g.map(x => x || 0), PIN); msg('✓ Kaydedildi: ' + fmtS(s) + ' / ' + GR.g.length); window.examList(GR.u); }
    catch (e) { msg((e && e.message) || 'Kaydedilemedi'); }
  };
  window.examResetG = async () => {
    if (!confirm('Bu kişinin cevapları silinsin mi? Sınavı yeniden girebilir.')) return;
    try { await gs('examReset', B, GR.u, GR.id, PIN); msg('Silindi'); window.examList(GR.u); } catch (e) { msg((e && e.message) || 'Silinemedi'); }
  };
})();
;(function(){try{var st=document.createElement('style');st.textContent='button,.pill,.card,.nv button,[onclick]{touch-action:manipulation;-webkit-tap-highlight-color:transparent}';(document.head||document.documentElement).appendChild(st);}catch(e){}})();

// ===== 🎨 Yeni görünüm: giriş seçimi (Yönetici / Personel), Hızlı İşlemler kutuları, alt menü çubuğu =====
(function () {
  window.addEventListener('load', function () {
    const meId = () => { try { return localStorage.getItem('mola_me_' + B) || ''; } catch (e) { return ''; } };
    const logo = () => { const l = document.querySelector('.hd .lg'); return l ? l.src : ''; };
    const ini2 = n => nice(n).split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('');

    /* ---------- 1) Giriş ekranı ---------- */
    window.__lgS = 'home';
    window.lgStage = s => { window.__lgS = s; const o = document.getElementById('lgn'); if (o) o.dataset.sig = ''; window.showLogin(); };
    window.showLogin = () => {
      let o = document.getElementById('lgn'); if (!o) { o = document.createElement('div'); o.id = 'lgn'; document.body.appendChild(o); }
      o.style.display = 'flex'; document.body.style.overflow = 'hidden';
      const S = window.__lgS || 'home';
      const L = ((D && D.staff) || []).filter(s => !s.off).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      const sig = S + '|' + B + '|' + (S == 'staff' ? L.map(s => s.id).join() : '');
      if (o.dataset.sig === sig) return; o.dataset.sig = sig;
      const br = '<div class="lgb"><button class="' + (B == 'opt' ? 'on' : '') + '" onclick="lgBr(\'opt\')">Optimum</button><button class="' + (B == 'mavi' ? 'on' : '') + '" onclick="lgBr(\'mavi\')">Mavi Bahçe</button></div>';
      if (S == 'home') {
        o.innerHTML = '<div class="lgx"><img src="' + logo() + '" alt=""><h1>Happy Moon\'s</h1><p>İzmir Şubeler</p>' + br + '</div>'
          + '<div class="lgc"><button class="lgcard" onclick="lgStage(\'staff\')"><i>👤</i><span><b>Personel Girişi</b><small>Adını seç, şifreni gir</small></span><em>›</em></button>'
          + '<button class="lgcard lgadm" onclick="setM(\'y\')"><i>🔑</i><span><b>Yönetici Girişi</b><small>Yönetici şifresiyle gir</small></span><em>›</em></button></div>'
          + '<div class="lgf2"><button onclick="regMe()">➕ Kayıt ol</button></div>';
      } else {
        o.innerHTML = '<div class="lgh"><div class="lgr"><button class="lgback" onclick="lgStage(\'home\')">‹ Geri</button>' + br + '</div><h1>Personel Girişi</h1><input id="pks" class="pks" placeholder="🔎 Adını yaz…" oninput="pkFilter(this.value)" autocomplete="off"></div>'
          + '<div class="lgl">' + L.map(s => '<button class="pkc" data-n="' + esc(nrm(s.name)) + '" onclick="pickMe(\'' + s.id + '\')"><b data-p="' + s.id + '">' + esc(ini2(s.name)) + '</b><span>' + esc(nice(s.name)) + '</span></button>').join('') + (L.length ? '' : '<p style="text-align:center;opacity:.85">Listede kimse yok. Önceki ekrandan kayıt olabilirsin.</p>') + '</div>';
      }
    };
    const pm0 = window.pickMe; window.pickMe = id => { if (!id) window.__lgS = 'home'; return pm0(id); };
    { const o = document.getElementById('lgn'); if (o && o.style.display != 'none' && !meId()) window.showLogin(); }

    /* ---------- 2) Alt menü çubuğu (personel) ---------- */
    window.__pg = 'mola';
    const g0 = window.goPg; window.goPg = v => { window.__pg = v; g0(v); setTimeout(showBar, 0); };
    window.bnProf = () => {
      if (M == 'y') { pop('👤 Yönetici', '<button class="a x" style="width:100%;margin-top:8px;text-align:left" onclick="$(\'ov\').hidden=true;setM(\'g\')">👤 Personel ekranına geç</button>'); $('mo').textContent = 'Kapat'; $('mc').style.display = 'none'; return; }
      const id = meId(), h = (ic, t, f) => '<button class="a x" style="width:100%;margin-top:8px;text-align:left" onclick="' + f + '">' + ic + ' ' + t + '</button>';
      pop('👤 Profilim', h('📷', 'Profil fotoğrafı', "phMenu('" + id + "')") + h('🔔', 'Bildirim kodum', 'myCode()') + h('📻', window.__rwl ? 'Telsiz dinleme: AÇIK' : 'Telsiz dinle', "$('ov').hidden=true;radioMode()") + h('↩', 'Kişiyi değiştir', "$('ov').hidden=true;pickMe('')"));
      $('mo').textContent = 'Kapat'; $('mc').style.display = 'none';
    };
    const bn = document.createElement('nav'); bn.id = 'bnav';
    bn.innerHTML = '<button data-k="mola" onclick="goPg(\'mola\')"><i>🏠</i>Ana Sayfa</button><button data-k="ml" onclick="molaList()"><i>☕</i>Moladakiler</button><button data-k="vard" onclick="goPg(\'vard\')"><i>🗓️</i>Şift</button><button data-k="pf" onclick="bnProf()"><i>👤</i>Profil</button>';
    document.body.appendChild(bn);
    function showBar() {
      try {
        const id = meId(), l = document.getElementById('lgn'), lv = l && l.style.display != 'none';
        const ok = M == 'g' && id && D && D.staff.some(s => s.id == id) && !lv, adm = M == 'y' && !!D && !lv;
        bn.style.display = (ok || adm) ? 'flex' : 'none';
        document.body.classList.toggle('hasbn', !!ok); document.body.classList.toggle('adm', !!adm);
        bn.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k == window.__pg));
      } catch (e) {}
    }
    setInterval(showBar, 600); showBar();

    /* ---------- 3) Stil ---------- */
    const st = document.createElement('style'); st.textContent = [
      '#lgn{background:radial-gradient(120% 60% at 50% 0,#c81e3a 0,#5b0d1c 55%,#1a0509 100%)!important}',
      '.lgx{text-align:center;margin-top:6vh}.lgx img{height:92px;background:#fff;border-radius:24px;padding:6px 12px;box-shadow:0 10px 30px rgba(0,0,0,.4)}.lgx h1{font-size:30px;font-weight:800;margin:16px 0 0}.lgx p{margin:2px 0 16px;color:#fecdd3;font-weight:700;letter-spacing:.16em;text-transform:uppercase;font-size:12px}',
      '.lgc{flex:1;display:flex;flex-direction:column;justify-content:center;gap:14px;padding:6px 0}.lgcard{display:flex;align-items:center;gap:14px;width:100%;text-align:left;padding:18px 16px;border-radius:22px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.14);color:#fff;backdrop-filter:blur(6px);box-shadow:0 10px 26px rgba(0,0,0,.28)}.lgcard:active{transform:scale(.98)}',
      '.lgcard i{font-style:normal;font-size:28px;width:56px;height:56px;border-radius:18px;display:grid;place-items:center;background:rgba(255,255,255,.95);flex:none}.lgcard span{flex:1;min-width:0}.lgcard b{display:block;font-size:18px;font-weight:800}.lgcard small{display:block;margin-top:3px;font-size:13px;opacity:.85}.lgcard em{font-style:normal;font-size:30px;opacity:.8}',
      '.lgcard.lgadm i{background:#fde68a}.lgf2{text-align:center;padding-bottom:6px}.lgf2 button{border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.1);color:#fff;border-radius:999px;padding:11px 18px;font-weight:700;font-size:14px}',
      '.lgr{display:flex;justify-content:space-between;align-items:center}.lgback{border:0;background:rgba(0,0,0,.28);color:#fff;border-radius:12px;padding:10px 14px;font-weight:700;font-size:14px}',
      /* personel ana sayfası: Hızlı İşlemler */
      'html.pm .hi{padding:16px!important;border-radius:22px!important;box-shadow:0 10px 26px rgba(0,0,0,.35)}html.pm .hi b[data-p],html.pm .hi>b{width:64px!important;height:64px!important;font-size:22px!important;border:2px solid rgba(255,255,255,.55)}html.pm .hi1{font-size:19px!important}',
      '#nv.pnv::before{content:"Hızlı İşlemler";grid-column:1/-1;font-weight:800;font-size:16px;margin:6px 2px 0;color:#fff}',
      '#nv.pnv button i{width:50px!important;height:50px!important;border-radius:16px!important;display:grid!important;place-items:center!important;font-size:25px!important;background:rgba(255,255,255,.1)}',
      '#nv.pnv button:nth-of-type(6n+1) i{background:rgba(34,197,94,.22)}#nv.pnv button:nth-of-type(6n+2) i{background:rgba(245,158,11,.24)}#nv.pnv button:nth-of-type(6n+3) i{background:rgba(59,130,246,.24)}#nv.pnv button:nth-of-type(6n+4) i{background:rgba(168,85,247,.24)}#nv.pnv button:nth-of-type(6n+5) i{background:rgba(236,72,153,.24)}#nv.pnv button:nth-of-type(6n) i{background:rgba(20,184,166,.24)}',
      '#nv.pnv button{min-height:96px!important;gap:7px!important;border-radius:20px!important;touch-action:manipulation}',
      '#bnav{display:none;position:fixed;left:0;right:0;bottom:0;z-index:7;justify-content:space-around;padding:6px 6px max(8px,env(safe-area-inset-bottom));background:rgba(26,8,12,.96);border-top:1px solid rgba(254,202,202,.16);backdrop-filter:blur(10px)}',
      '#bnav button{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;border:0;background:transparent;color:#a8a29e;font-size:11px;font-weight:700;padding:6px 2px;touch-action:manipulation}#bnav button i{font-style:normal;font-size:22px;line-height:1}#bnav button.on{color:#fff}#bnav button.on i{filter:drop-shadow(0 0 6px rgba(239,68,68,.8))}',
      'body.hasbn{padding-bottom:92px!important}'
    ].join('\n'); document.head.appendChild(st);
  });
})();

// ===== 🟢 Yeşil açık tema (örnek ekran görüntülerindeki gibi) =====
(function () {
  const css = `
html body{background:#eef2ef!important;background-image:none!important;color:#1f2937!important}
html body .hd{background:linear-gradient(135deg,#16a34a,#0b6b2a)!important;border:0!important;box-shadow:0 8px 22px rgba(22,163,74,.35)!important}
.hd::after{display:none!important}html body .hn{color:#fff!important}html body .hs{color:#dcfce7!important}
html body .top,html body .nv:not(.pnv) button{background:#fff!important;border:1px solid #e5e7eb!important}
html body .tab{color:#64748b!important}html body .tab.on,html body .tab.m.on{background:linear-gradient(135deg,#22c55e,#15803d)!important;color:#fff!important;box-shadow:0 4px 12px rgba(22,163,74,.4)!important}
html body .nv:not(.pnv) button{color:#64748b!important}html body .nv:not(.pnv) button.on{background:linear-gradient(135deg,#22c55e,#15803d)!important;color:#fff!important}
html body .hi{background:linear-gradient(135deg,#16a34a,#0b6b2a)!important;border:0!important;color:#fff!important}
html body .hi b{background:#fff!important;color:#15803d!important}html body .hi1,html body .hi2,html body .sv2l{color:#fff!important}html body .sv2{color:#fef08a!important}
html body .dt{background:#fff!important;color:#374151!important;border:1px solid #e5e7eb}
html body .sec,html body .legend,html body .sub{color:#6b7280!important}
html body .card{background:#fff!important;border:1px solid #e5e7eb!important;box-shadow:0 4px 14px rgba(0,0,0,.06)!important;color:#1f2937!important}
html body .card.on{border-color:#22c55e!important}html body .card .nm{color:#111827!important}html body .tm{color:#16a34a!important}
html body .chip{background:#dcfce7!important;color:#166534!important}html body .chip.left{background:#f1f5f9!important;color:#475569!important}html body .chip.cur{background:#fff!important;color:#b45309!important;border-color:#f59e0b!important}
html body button.a,html body a.a{background:linear-gradient(180deg,#22c55e,#15803d)!important;color:#fff!important;border:0!important}
html body button.a.mola{background:linear-gradient(180deg,#22c55e,#15803d)!important}
html body button.a.x{background:linear-gradient(180deg,#9ca3af,#6b7280)!important}html body button.a.end{background:linear-gradient(180deg,#ef4444,#b91c1c)!important}html body button.a.off{background:linear-gradient(180deg,#f59e0b,#b45309)!important}html body button.a.ed{background:linear-gradient(180deg,#14a9c9,#0e7490)!important}
html body .pill{background:#fff!important;color:#166534!important;border:1px solid #bbf7d0!important}
html body #nv.pnv::before{color:#111827!important}
html body #nv.pnv button{background:#fff!important;color:#374151!important;border:1px solid #e5e7eb!important;box-shadow:0 3px 10px rgba(0,0,0,.06)!important}
html body #nv.pnv button.on{background:linear-gradient(160deg,#22c55e,#15803d)!important;color:#fff!important;border-color:transparent!important}
html body .mb{background:#fff!important;color:#1f2937!important;border:1px solid #e5e7eb!important}html body .mb h3{color:#111827!important}html body .mb label{color:#6b7280!important}
html body .mb input,html body .mb textarea,html body .mb select,html body .psel{background:#f8fafc!important;color:#111827!important;border:1px solid #cbd5e1!important}
html body .mrad{background:#fff!important;border-color:#e5e7eb!important;color:#1f2937!important}html body .mrad.on{border-color:#22c55e!important;background:#f0fdf4!important}html body .mrad b{color:#111827!important}
html body #pg .pgb{background:#fff!important;border-color:#e5e7eb!important}html body #pg h2{color:#111827!important}html body #pg h2 small{color:#16a34a!important}
html body .xl th,html body .xl th.nmc,html body .xl2 th{background:#15803d!important;color:#fff!important}html body .xl th.td{background:#16a34a!important}html body .xl td.tdy{background:#f0fdf4!important}
html body .pkc{background:#fff!important;color:#111827!important;border:1px solid #e5e7eb!important}
html body #bnav{background:rgba(255,255,255,.97)!important;border-top:1px solid #e5e7eb!important}html body #bnav button{color:#9ca3af!important}html body #bnav button.on{color:#15803d!important}html body #bnav button.on i{filter:none!important}
html body #lgn{background:radial-gradient(120% 60% at 50% 0,#22b04f 0,#0e6a2c 55%,#053a19 100%)!important}
html body .lgx p{color:#bbf7d0!important}html body .lgcard.lgadm i{background:#bbf7d0!important}html body .lgb button.on{color:#15803d!important}html body .lgb button{color:#dcfce7!important}
html body #lgn .pkc{background:rgba(255,255,255,.95)!important;color:#111827!important}html body #lgn .pkc b{background:#dcfce7!important;color:#15803d!important}
html body #pinov>div{background:#fff!important;color:#111827!important}html body #pinov .pinf{background:#f1f5f9!important;color:#111827!important;border-color:#cbd5e1!important}html body #pinov{background:rgba(15,40,25,.85)!important}
`;
  const st = document.createElement('style'); st.id = 'greenTheme'; st.textContent = css; document.head.appendChild(st);
  try { document.querySelectorAll('meta[name=theme-color]').forEach(m => m.setAttribute('content', '#15803d')); } catch (e) {}
})();

// ===== 🟢 Personel ana ekranı (2. resim düzeni) + kalan bordoların temizlenmesi =====
(function () {
  const css = `
/* kalan bordo parçalar -> yeşil */
html body #dw{background:#fff!important;color:#1f2937!important;border-right:1px solid #e5e7eb!important}
html body #dw .dwh{border-color:#e5e7eb!important}html body #dw .dwn{color:#111827!important}html body #dw .dws2,html body #dw .dwt{color:#6b7280!important}
html body #dw .dwp b{background:linear-gradient(135deg,#22c55e,#15803d)!important;color:#fff!important}
html body #dw .dwx{background:#f1f5f9!important;color:#374151!important;border-color:#e5e7eb!important}
html body #dw .dwi{color:#1f2937!important;background:transparent!important}html body #dw .dwi i{background:#f1f5f9!important}
html body #dw .dwi.on{background:linear-gradient(135deg,#22c55e,#15803d)!important;color:#fff!important;box-shadow:0 6px 16px rgba(22,163,74,.35)!important}html body #dw .dwi.on i{background:rgba(255,255,255,.25)!important}
html body #dwb{background:#fff!important;color:#15803d!important;border:1px solid #bbf7d0!important}html body #dwb span{background:#15803d!important}
html body .av,html body .pkc b,html body .sec2 span{background:linear-gradient(135deg,#22c55e,#15803d)!important;color:#fff!important}
html body .rows,html body .rows .row{background:#fff!important;border-color:#e5e7eb!important;color:#1f2937!important}html body .rn{color:#111827!important}html body .rs{color:#6b7280!important}
html body .more{background:#f1f5f9!important;color:#374151!important;border-color:#e5e7eb!important}
/* personel ana ekranı */
html body.hasbn{padding-top:0!important}
html body.hasbn .hd,html body.hasbn #br,html body.hasbn #md,html body.hasbn #list .chipsrow{display:none!important}
html body.hasbn .hi{flex-direction:column!important;align-items:center!important;text-align:center!important;gap:8px!important;margin:0 -14px 16px!important;padding:max(26px,env(safe-area-inset-top)) 16px 22px!important;border-radius:0 0 34px 34px!important;box-shadow:0 10px 26px rgba(22,163,74,.35)!important}
html body.hasbn .hi b{width:92px!important;height:92px!important;font-size:32px!important;border:3px solid rgba(255,255,255,.85)!important}
html body.hasbn .hi1{font-size:22px!important;font-weight:800!important}html body.hasbn .hi2{font-size:12.5px!important}
html body.hasbn .dt{display:none!important}
html body.hasbn .grid.one .card:not(.on){background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important}
html body.hasbn .grid.one .card:not(.on) .btns button.mola{padding:20px!important;font-size:19px!important;border-radius:20px!important;box-shadow:0 10px 24px rgba(22,163,74,.4)!important}
html body.hasbn .grid.one .card:not(.on) .btns button.mola small{color:#dcfce7!important}
html body.hasbn #nv.pnv{grid-template-columns:repeat(2,1fr)!important;gap:12px!important;margin-top:18px!important}
html body.hasbn #nv.pnv button[onclick*="goPg('mola')"]{display:none!important}
html body.hasbn #nv.pnv button{min-height:112px!important;border-radius:22px!important;font-size:13px!important}
`;
  const st = document.createElement('style'); st.id = 'greenTheme2'; st.textContent = css; document.head.appendChild(st);
})();

// ===== 🟢 v3: stil önceliği düzeltmesi + sade personel ana ekranı =====
(function () {
  window.addEventListener('load', function () {
    const css = `
html body.hasbn{display:flex!important;flex-direction:column!important}
html body.hasbn #list{order:1}html body.hasbn #nv{order:2}html body.hasbn #e86c{order:3}
html body.hasbn.pgon #nv{order:-1}
/* başlık: sadece fotoğraf + isim */
html body.hasbn .hi2,html body.hasbn .hi .sv2l{display:none!important}
html body.hasbn .hi{padding-bottom:20px!important}
html body.hasbn #e86c{display:none!important}
html body #nv.pnv button.t86{position:relative!important;background:#fff5f5!important;border:2px solid #fca5a5!important}
html body #nv.pnv button.t86 i{background:rgba(220,38,38,.16)!important}
html body #nv.pnv button.t86 .bdg{position:absolute;top:10px;right:12px;min-width:28px;height:28px;padding:0 6px;border-radius:999px;background:#dc2626;color:#fff;display:grid;place-items:center;font-weight:800;font-size:14px;box-shadow:0 2px 6px rgba(220,38,38,.5)}
html body #nv.pnv button.t86.has{animation:pl86 1.6s infinite}
@keyframes pl86{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.45)}50%{box-shadow:0 0 0 9px rgba(220,38,38,0)}}
/* Tip Box kartı kalktı */
html body #tipcard{display:none!important}
/* 86 kutusu: açık tema, en altta */
html body #e86c>div{background:#fff!important;color:#7f1d1d!important;border:1px solid #fecaca!important;margin-top:14px!important}
html body #e86c [style*="rgba(0,0,0,.35)"]{background:#fee2e2!important;color:#7f1d1d!important}
/* Molaya Çık butonu */
html body.hasbn .grid.one .card:not(.on) .btns button.mola small{display:none!important}
html body.hasbn .grid.one .card:not(.on) .btns button.mola{opacity:1!important;color:#fff!important}
html body.hasbn .grid.one .card.offc{opacity:1!important}
/* Profil değiştir */
html body.hasbn #list>button.a.x{background:#fff!important;color:#15803d!important;border:1px solid #bbf7d0!important;margin-top:12px!important}
html body .mb .sv2{color:#15803d!important}html body .mb .himd{color:#6b7280!important}
`;
    const st = document.createElement('style'); st.id = 'greenTheme3'; st.textContent = css;
    document.head.appendChild(st);

    window.avgShow = () => {
      const h = document.getElementById('himy'), t = h && h.innerHTML.trim() ? h.innerHTML : '<p class="sub">Henüz veri yok.</p>';
      pop('📊 Ortalama / Ciro', '<div style="font-size:17px;line-height:1.8;text-align:center">' + t + '</div>');
      $('mo').textContent = 'Kapat'; $('mc').style.display = 'none';
    };
    const ms = window.molaSec;
    window.molaSec = function (id) {
      ms(id);
      try { const s = D.staff.find(x => x.id == id), left = Math.max(0, D.total - usedOf(s)); $('mt').textContent = 'Mola Seçin\nKalan mola: ' + left + ' dk'; } catch (e) {}
    };

    const tweak = () => {
      try {
        const nv = document.getElementById('nv'), li = document.getElementById('list');
        if (!nv || !li) return;
        document.body.classList.toggle('pgon', li.style.display === 'none');
        const id = (localStorage.getItem('mola_me_' + B) || '');
        if (document.body.classList.contains('hasbn') && nv.classList.contains('pnv') && !nv.querySelector('[data-x]'))
          nv.insertAdjacentHTML('beforeend', '<button data-x="1" onclick="postaWeek(\'' + id + '\')"><i>📍</i>Haftalık Posta</button><button data-x="1" onclick="avgShow()"><i>📊</i>Ortalama / Ciro</button>');
        if (document.body.classList.contains('hasbn') && nv.classList.contains('pnv')) {
          const e86 = document.getElementById('e86c'), m = e86 && /\((\d+)\)/.exec(e86.textContent), n = m ? +m[1] : 0;
          let t = nv.querySelector('.t86');
          if (!t) {
            nv.insertAdjacentHTML('beforeend', '<button class="t86" onclick="e86UI()"><i>🚫</i>86 · Biten Ürünler<span class="bdg"></span></button>');
            t = nv.querySelector('.t86'); const og = nv.querySelector('button[onclick*="oyunlarUI"]'); if (og) og.insertAdjacentElement('afterend', t);
          }
          const bd = t.querySelector('.bdg'); if (bd.textContent !== String(n)) bd.textContent = n; t.classList.toggle('has', n > 0); bd.style.display = n > 0 ? '' : 'none';
        }
        const b = li.querySelector('button.a.mola');
        if (b && b.firstChild && b.firstChild.nodeType === 3 && b.firstChild.textContent.indexOf('Molaya Çık') < 0) b.firstChild.textContent = '☕ Molaya Çık';
        li.querySelectorAll(':scope>button.a.x').forEach(x => { if (x.dataset.pd !== '1') { x.dataset.pd = '1'; x.textContent = '🔄 Profil Değiştir'; x.removeAttribute('onclick'); x.onclick = () => window.pickMe(''); } });
      } catch (e) {}
    };
    let tb = false; const run = () => { if (tb) return; tb = true; try { tweak(); } finally { tb = false; } };
    const mo = new MutationObserver(run);
    try {
      const e1 = document.getElementById('nv'), e2 = document.getElementById('list');
      if (e1) mo.observe(e1, { childList: true, subtree: true });
      if (e2) mo.observe(e2, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    } catch (er) {}
    tweak();
    setInterval(() => { const e = document.getElementById('e86c'); if (e && !e.dataset.ob) { e.dataset.ob = '1'; mo.observe(e, { childList: true, subtree: true, characterData: true }); run(); } }, 1500);

    /* eski koyu tema (index.html sonunda) yeşil temayı eziyordu: öncelik artır ve sona taşı */
    setTimeout(() => {
      ['greenTheme', 'greenTheme2', 'greenTheme3'].forEach(i => {
        const e = document.getElementById(i); if (!e) return;
        if (!e.dataset.up) { e.dataset.up = '1'; e.textContent = e.textContent.replace(/html body/g, 'html:root body'); }
        document.body.appendChild(e);
      });
    }, 300);
  });
})();

// ===== 🧊 v4: titreme/kayma önleme + yönetici paneli kutucuklu =====
(function () {
  window.addEventListener('load', function () {
    const css = `
html body.adm #dwb,html body.adm #dw,html body.adm #dwo,html body.adm #md{display:none!important}
html body.adm,html body.hasbn{padding-bottom:92px!important}
html body.pgon #nv{display:none!important}
html body.adm #nv.pnv{grid-template-columns:repeat(3,1fr)!important;gap:10px!important;margin:0 0 14px!important}
html body.adm #nv.pnv button{min-height:92px!important;border-radius:20px!important;font-size:12px!important}
html body #lgn::before{opacity:.035!important}
`;
    const st = document.createElement('style'); st.id = 'greenTheme4'; st.textContent = css.replace(/html body/g, 'html:root body');
    document.body.appendChild(st);

    let lastSig = '', lastT = 0; const od9 = window.draw;
    window.draw = function () {
      try {
        const l = document.getElementById('lgn'), lv = l && l.style.display != 'none';
        if (window.__pg == 'mola' && D && !lv && document.getElementById('list').children.length && (M == 'y' || M == 'g')) {
          const me = M == 'g' ? (localStorage.getItem('mola_me_' + B) || '') : '';
          const pk = x => [x.id, x.name, x.off, x.on, x.sira, x.turn, x.shTxt, x.sec, x.phone, x.active && [x.active.start, x.active.dur, x.active.pt, x.active.paused, x.active.pausedAt, x.active.sent, x.active.sched, x.active.err, x.active.n, x.active.notified], (x.done || []).map(y => typeof y == 'object' ? [y.k, y.t, y.e, y.m] : y), x.opts && x.opts.length, x.sh];
          const arr = M == 'g' ? D.staff.filter(x => x.id == me) : D.staff;
          const sig = M + '|' + B + '|' + me + '|' + D.total + '|' + ANONS + '|' + JSON.stringify(arr.map(pk));
          if (sig === lastSig && Date.now() - lastT < 60000) { tick(); return; }
          lastSig = sig; lastT = Date.now();
        } else lastSig = '';
      } catch (e) { lastSig = ''; }
      return od9.apply(this, arguments);
    };
  });
})();

// ===== 👥 Personel Listesi butonu (yönetici) + yatay kayma önleme =====
window.stfOpen = () => {
  const e = document.getElementById('stfl');
  pop('👥 Personel Listesi · ' + BR[B], e ? e.innerHTML : '<p class="sub">Liste hazır değil, tekrar dene.</p>', true);
  $('mo').textContent = 'Kapat'; $('mc').style.display = 'none';
};
(function () {
  const st = document.createElement('style'); st.id = 'greenTheme5';
  st.textContent = 'html:root{overflow-x:clip!important;max-width:100%}html:root body{overflow-x:clip!important;overflow-y:visible!important;max-width:100%!important;width:100%}@supports not (overflow:clip){html:root{overflow-x:hidden!important}html:root body{overflow-x:visible!important}}html:root body #list,html:root body #nv{max-width:100%;min-width:0}';
  window.addEventListener('load', () => document.body.appendChild(st));
})();

// ===== 🛡 Stil önceliği: her zaman en sonda, tekrar tekrar (diğer bloklardan bağımsız) =====
(function () {
  const fix = () => {
    try {
      ['greenTheme', 'greenTheme2', 'greenTheme3'].forEach(i => {
        const e = document.getElementById(i); if (!e) return;
        if (!e.dataset.up) { e.dataset.up = '1'; e.textContent = e.textContent.replace(/html body/g, 'html:root body'); }
        if (e.parentNode !== document.body || e.nextElementSibling) document.body.appendChild(e);
      });
    } catch (er) {}
  };
  window.addEventListener('load', () => { fix(); setTimeout(fix, 400); setTimeout(fix, 1500); setTimeout(fix, 4000); });
})();

// ===== 📖 Garson Performans Raporu / sayfalar: açık zeminde okunabilir renkler =====
(function () {
  const css = `
html:root body .pnm{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;margin:0 0 12px;border-radius:14px;background:#f0fdf4;border:1px solid #bbf7d0;color:#14532d}
html:root body .pnm b{font-size:17px}html:root body .pnm span{font-size:13px;font-weight:700;color:#15803d}
html:root body #pg .kp div{background:#f0fdf4!important;border:1px solid #bbf7d0!important}
html:root body #pg .kp b{color:#111827!important}html:root body #pg .kp span{color:#4b5563!important}html:root body #pg .kp span[style]{color:#b45309!important;font-weight:800}
html:root body #pg .hot,html:root body #pg .hot b,html:root body #pg .hot small,html:root body #pg .hot div{color:#fff!important}
html:root body #pg .sec2{color:#15803d!important}html:root body #pg .sec2 span{background:#15803d!important;color:#fff!important}
html:root body #pg .ctw{background:#f8fafc!important;border:1px solid #e5e7eb!important}
html:root body #pg table.ct{color:#1f2937!important}html:root body #pg table.ct th{color:#6b7280!important;background:transparent!important}
html:root body #pg table.ct td,html:root body #pg table.ct th{border-color:#e5e7eb!important}html:root body #pg table.ct td:first-child{color:#9ca3af!important}
html:root body #pg table.ct .on{color:#b45309!important}html:root body #pg table.ct tr.tot td{background:#ecfdf5!important;color:#14532d!important;font-weight:800}
html:root body #pg .simgh,html:root body #pg .simgh b{color:#111827!important}html:root body #pg .simgh span{color:#6b7280!important}
html:root body #pg .lr,html:root body #pg .lb{color:#1f2937!important}html:root body #pg .ln{color:#111827!important}html:root body #pg .ls{color:#6b7280!important}
`;
  const st = document.createElement('style'); st.id = 'greenTheme6'; st.textContent = css;
  window.addEventListener('load', () => document.body.appendChild(st));
})();

// ===== 🎯 Yönetici paneli: hepsi ortalı, son kutucuk ortada, panel açılınca sayfa başa gelsin =====
(function () {
  const css = `
html:root body.adm{padding-bottom:110px!important}
html:root body.adm .hd{padding:8px 12px!important;margin-bottom:8px!important}
html:root body.adm #nv.pnv.ynv{display:flex!important;flex-wrap:wrap!important;justify-content:center!important;align-content:flex-start!important;gap:7px!important;width:100%!important;max-width:560px!important;margin:0 auto 8px!important}
html:root body.adm #nv.pnv.ynv::before{content:none!important;display:none!important}
html:root body.adm #nv.pnv.ynv .uplt{display:none!important}
html:root body.adm #nv.pnv.ynv button{flex:0 0 calc((100% - 21px)/4)!important;width:calc((100% - 21px)/4)!important;max-width:calc((100% - 21px)/4)!important;min-height:0!important;height:auto!important;padding:7px 2px 6px!important;border-radius:16px!important;font-size:10.5px!important;line-height:1.12!important;gap:3px!important;box-sizing:border-box!important}
html:root body.adm #nv.pnv.ynv button i{width:34px!important;height:34px!important;font-size:19px!important;border-radius:11px!important;margin:0!important}
html:root body.adm #nv.pnv.ynv button[data-upl]{background:#fff7e6!important;border:1.5px solid #f5c26b!important}
html:root body.adm .top{margin:0 auto 6px!important;padding:2px!important}
html:root body.adm .top>*{min-height:0!important;padding:7px 14px!important;font-size:13px!important;line-height:1.15!important;white-space:nowrap!important}
html:root body.adm #list>.dt{align-self:center!important;margin:0 auto 6px!important;text-align:center!important;font-size:12px!important;padding:3px 10px!important}
html:root body.adm #list .admbar{display:grid!important;grid-template-columns:repeat(4,1fr)!important;width:100%!important;max-width:560px!important;margin:0 auto 7px!important;gap:6px!important}
html:root body.adm #list .admbar .a{width:auto!important;min-width:0!important;min-height:46px!important;padding:5px 2px!important;font-size:10.5px!important}
html:root body.adm #list .admbar .a i{font-size:16px!important}
html:root body.adm #list .stats{width:100%!important;max-width:560px!important;margin:0 auto 8px!important;gap:6px!important}
html:root body.adm #list .stats .st{padding:6px 2px!important;border-radius:12px!important}
html:root body.adm #list .stats .st b{font-size:20px!important}
html:root body.adm #list .stats .st span{font-size:10px!important}
html:root body.adm #list .sec2,html:root body.adm #list .sec{text-align:center!important;justify-content:center!important}
html:root body.adm #list .grid{max-width:560px!important;margin-left:auto!important;margin-right:auto!important}
`;
  const put = () => {
    try {
      let st = document.getElementById('admCenter');
      if (!st) { st = document.createElement('style'); st.id = 'admCenter'; }
      st.textContent = css; document.body.appendChild(st);
    } catch (e) {}
  };
  window.addEventListener('load', () => {
    put(); setTimeout(put, 600); setTimeout(put, 2500);
    // yönetici paneli ilk açıldığında sayfa başa gelsin (üst kısım yukarıda kalmasın)
    let was = false;
    const chk = () => {
      const on = document.body.classList.contains('adm');
      if (on && !was) { try { window.scrollTo(0, 0); document.body.scrollTop = 0; document.documentElement.scrollTop = 0; } catch (e) {} }
      was = on;
    };
    try { new MutationObserver(chk).observe(document.body, { attributes: true, attributeFilter: ['class'] }); } catch (e) {}
    chk();
  });
})();

// ===== 📤 Yönetici paneli: rapor yükleme kısayolları (Fiş Journal · Satış detay · Primli ürünler Excel) =====
(function () {
  const UP = [
    ['📤', 'Fiş Journal yükle', 'goUp()'],
    ['📊', 'Satış detay yükle', 'ciroXlsPick()'],
    ['💎', 'Primli ürünler Excel', 'aiUI()']
  ];
  window.repUploadMenu = () => {
    pop('📤 Rapor Yükle', UP.map(u => '<button class="a off" style="width:100%;text-align:left;margin-top:8px" onclick="$(\'ov\').hidden=true;' + u[2] + '"><i>' + u[0] + '</i> ' + u[1] + '</button>').join(''), true);
  };
  function addUp() {
    try {
      const nv = document.getElementById('nv');
      if (!nv || !document.body.classList.contains('adm') || !nv.classList.contains('ynv')) return;
      if (!hasPerm('rapor')) return;
      if (nv.querySelector('[data-upl]')) return;
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-upl', '1'); b.setAttribute('onclick', 'repUploadMenu()');
      b.innerHTML = '<i>📤</i>Rapor Yükle';
      nv.appendChild(b);
    } catch (e) {}
  }
  window.addEventListener('load', () => {
    try { const st = document.createElement('style'); st.id = 'uplCss'; st.textContent = css; document.head.appendChild(st); } catch (e) {}
    const nv = document.getElementById('nv');
    if (nv) { try { new MutationObserver(addUp).observe(nv, { childList: true }); } catch (e) {} }
    setInterval(addUp, 1500); addUp();
  });
})();

// ===== Yönetici Paneli başlığı: logosuz, yeşil zeminsiz düz yazı + sayfalarda "yukarı çık" düğmesi =====
(function () {
  const st = document.createElement('style');
  st.textContent = [
    'html:root body header.hd{background:transparent!important;border:0!important;box-shadow:none!important;padding:6px 4px 2px!important;justify-content:center!important;text-align:center!important}',
    'html:root body header.hd::before,html:root body header.hd::after{display:none!important;content:none!important}',
    'html:root body header.hd .lg{display:none!important}',
    'html:root body header.hd .adl{display:block!important;height:54px;width:auto;object-fit:contain;flex:none}',
    'html:root body header.hd .hn{color:#14532d!important;font-size:24px!important;font-weight:800!important;text-align:center!important}',
    'html:root body header.hd .vt{color:#6b7280!important}',
    'html:root body header.hd .hn{text-shadow:none!important;filter:none!important}',
    'html:root body #pg{overflow:visible!important;max-height:none!important;height:auto!important;touch-action:pan-y!important}',
    '#upBtn{position:fixed;right:14px;bottom:96px;width:46px;height:46px;border-radius:50%;border:0;background:#16a34a;color:#fff;font-size:24px;font-weight:800;line-height:1;box-shadow:0 6px 16px rgba(0,0,0,.35);z-index:9000;display:none}'
  ].join('\n');
  document.head.appendChild(st);

  const b = document.createElement('button');
  b.id = 'upBtn'; b.type = 'button'; b.setAttribute('aria-label', 'Yukarı çık'); b.textContent = '↑';
  const top = () => { [window, document.scrollingElement, document.documentElement, document.body, document.getElementById('pg')].forEach(e => { try { if (e && e.scrollTo) e.scrollTo({ top: 0, behavior: 'smooth' }); else if (e) e.scrollTop = 0; } catch (x) {} }); };
  b.onclick = top;
  document.body.appendChild(b);
  const y = () => Math.max(window.pageYOffset || 0, document.documentElement.scrollTop || 0, document.body.scrollTop || 0);
  setInterval(() => { try { const pg = document.getElementById('pg'); b.style.display = (pg && !pg.hidden && y() > 250) ? 'block' : 'none'; } catch (e) {} }, 400);
})();

// ===== v73: Mola kartları ekrana sığar · durum rozeti belirgin · Excel indir (şift) yok =====
(function () {
  const st = document.createElement('style'); st.id = 'v73fix';
  st.textContent = `
/* 1) Molada / personel kartları: 3 sütun, yatay taşma yok, her şey küçülüp sığar */
html body #list{overflow-x:hidden!important;max-width:100%!important}
html body #list .grid:not(.one){grid-template-columns:repeat(3,minmax(0,1fr))!important;width:100%!important;max-width:100%!important;gap:6px!important;align-items:start!important}
html body #list .grid:not(.one) .card{min-width:0!important;width:100%!important;padding:7px 5px 6px!important;gap:4px!important;border-radius:13px!important;overflow:hidden}
html body #list .grid:not(.one) .card .nm{font-size:12.5px!important;line-height:1.15!important;word-break:break-word;overflow-wrap:anywhere}
html body #list .grid:not(.one) .card .sr{width:16px!important;height:16px!important;line-height:16px!important;font-size:9px!important}
html body #list .grid:not(.one) .card .tm{font-size:21px!important;margin:0!important;line-height:1.1!important}
html body #list .grid:not(.one) .card .chips{gap:3px!important;width:100%!important;min-width:0}
html body #list .grid:not(.one) .card .chip{font-size:9px!important;line-height:1.2!important;padding:2px 5px!important;border-radius:9px!important;white-space:normal!important;text-align:center;max-width:100%;overflow-wrap:anywhere}
html body #list .grid:not(.one) .card .chip.cur{padding:1px 4px!important;border-width:1px!important}
html body #list .grid:not(.one) .card .lt{font-size:10px!important}
html body #list .grid:not(.one) .card .btns{flex-direction:column!important;gap:4px!important;width:100%!important;min-width:0}
html body #list .grid:not(.one) .card .btns button,html body #list .grid:not(.one) .card .btns a,html body #list .grid:not(.one) .card .btns .a{width:100%!important;flex:none!important;min-height:30px!important;padding:5px 3px!important;font-size:10.5px!important;border-radius:9px!important;white-space:nowrap!important;overflow:hidden;text-overflow:clip;min-width:0}
html body #list .grid:not(.one) .card .btns[style*="row"]{flex-direction:row!important}
html body #list .grid:not(.one) .card .btns[style*="row"] button{width:auto!important;min-height:30px!important;padding:5px 2px!important;font-size:10.5px!important}
html body #list .grid:not(.one) .card .ib{gap:3px!important}
html body #list .grid:not(.one) .card .ib button{flex:1 1 22px!important;padding:5px 0!important;font-size:12px!important}
html body #stfl,html body #stfl .rows{max-width:100%}
/* 2) Personel listesi: "Vardiyada" vb. rozetler ve bölüm başlıkları belirgin */
html body .bd{font-size:12px!important;font-weight:800!important;padding:2px 10px!important;border:0!important;text-shadow:none!important;letter-spacing:.2px}
html body .bd.g{background:#15803d!important;color:#fff!important}
html body .bd.n{background:#64748b!important;color:#fff!important}
html body .bd.o{background:#b45309!important;color:#fff!important}
html body .bd.y{background:#facc15!important;color:#422006!important}
html body .sec2{color:#14532d!important;text-shadow:none!important;font-weight:900!important;font-size:13px!important}
html body .sec2 span{background:#15803d!important;color:#fff!important}
html body .ov .sec2,html body #stfl .sec2{color:#14532d!important}
`;
  document.head.appendChild(st);
  try { const v = document.querySelector('.vt'); if (v) v.textContent = 'v73'; } catch (e) {}
})();


// ===== Yönetim menüsü: açık zeminde okunur renkler =====
(function(){const st=document.createElement('style');
st.textContent='#mf .mi{color:#1f2937!important;background:#f8fafc!important;border:1px solid #e2e8f0!important}#mf .mi span{color:#1f2937!important}#mf .mi small{color:#64748b!important}#mf .mgrp{color:#b91c1c!important}#mf .mi:active{background:#e2e8f0!important}';
document.head.appendChild(st);})();


// ===== Ürün dökümü penceresi: açık zeminde okunur tablo =====
(function(){const st=document.createElement('style');
st.textContent='.pdw{border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#fff}.pdt{width:100%;border-collapse:collapse;font-size:15px;color:#1f2937}.pdt th{background:#f1f5f9;color:#475569;font-size:12.5px;font-weight:700;padding:9px 10px;text-align:right}.pdt td{padding:10px;border-top:1px solid #eef2f7;text-align:right;color:#1f2937}.pdt th.l,.pdt td.l{text-align:left}.pdt th:first-child,.pdt td:first-child{width:30px;text-align:center;color:#94a3b8}.pdt td.on{font-weight:800;color:#b45309}.pdt tr.tot td{font-weight:800;background:#f8fafc;border-top:2px solid #cbd5e1;color:#1f2937}';
document.head.appendChild(st);})();


// ===== Ana sayfa sayaçları: koyu zeminde okunur sayılar =====
(function(){const st=document.createElement('style');
st.textContent='html body .st b{color:#e2e8f0!important}html body .st.b b{color:#60a5fa!important}html body .st.g b{color:#4ade80!important}html body .st.r b{color:#f87171!important}html body .st span{color:#94a3b8!important}';
document.head.appendChild(st);})();
