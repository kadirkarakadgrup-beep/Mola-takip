(function(){
// Mola Takip - Apps Script (Code.gs) mantığının Firebase Firestore'a taşınmış hali.
// index.html'deki google.script.run çağrıları aynen çalışır.
const FIREBASE_CONFIG = {
  // Mevcut Mola-takip repondaki index.html içinden firebaseConfig değerlerini buraya kopyala:
  apiKey: 'AIzaSyD_Bl_RC8xzscXA3-GP8X2tdBi6tFhCs8E',
  authDomain: 'mola-takip-7fc53.firebaseapp.com',
  projectId: 'mola-takip-7fc53',
  appId: '1:130287831940:web:c3a804d90a0225231b2bd1'
};
const CFG = {
  PIN: '1234',                          // Yönetici şifresi (değiştir!)
  NTFY_PREFIX: 'mola-DEGISTIR-123xyz',  // Telefonlardaki ntfy kodlarıyla aynı kalmalı (benzersiz yap)
  SEQ: {
    opt: [{ k: 'mola', n: 'Çay Molası', d: 20 }, { k: 'yemek', n: 'Öğlen Yemeği', d: 30 }, { k: 'mola', n: 'Çay Molası', d: 20 }],
    mavi: [{ k: 'mola', n: 'Çay Molası', d: 20 }, { k: 'yemek', n: 'Öğlen Yemeği', d: 40 }, { k: 'mola', n: 'Çay Molası', d: 20 }]
  },
  MAIN: { from: 11, to: 20 },
  EXTRA: [
    { k: 'kahvalti', n: 'Kahvaltı Molası', d: 15, from: 8, to: 11 },
    { k: 'aksam', n: 'Akşam Yemeği', d: 15, from: 20, to: 24 }
  ]
};

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
  const r = [], T = mainT_(s), md = md_();
  let b = 0;
  if (md >= CFG.MAIN.from * 60 && md < CFG.MAIN.to * 60) for (const q of (CFG.SEQ[s.branch] || CFG.SEQ.opt)) { b += q.d; if (T < b) { r.push({ k: q.k, n: q.n, d: b - T, full: q.d }); break; } }
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
const msgOf_ = (s, a) => `${nice_(s.name)} (${branchName_(s.branch)}) - ${a.dur} dk ${a.n} süresi doldu!`;

// ---------- Firestore ----------
async function allStaff_() {
  const q = await col('staff').get(), t = today_();
  return q.docs.map(d => { const s = d.data(); s.id = d.id; if (s.day !== t) { s.day = t; s.done = []; s.active = null; } s.done = s.done || []; return s; });
}
const clean_ = s => JSON.parse(JSON.stringify(s));
// Tek personel belgesini transaction ile güncelle (fn içinde hata fırlatılırsa hiçbir şey yazılmaz)
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

// ---------- ntfy (tarayıcıdan doğrudan) ----------
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
const cancelActive_ = s => { const a = s && s.active; if (a && !a.paused && Date.now() < end_(a)) return cancel_(topicOf_('yonetici'), a.nid); };

async function schedule_(id, start, text, delay) {
  const m = await post_(topicOf_('yonetici'), '⏰ Mola doldu', text, delay);
  try {
    await upd_(id, c => {
      if (!c.active || c.active.start !== start) { if (m.ok) cancel_(topicOf_('yonetici'), m.id); return; }
      c.active.posting = false;
      if (m.ok) { c.active.sched = true; c.active.nid = m.id; c.active.err = ''; } else { c.active.err = m.err; }
    });
  } catch (e) {}
}
const due_ = (s, now) => { const a = s.active; return !!(a && !a.paused && !a.notified && now >= end_(a) && !(a.lastTry && now - a.lastTry < 60000)); };

// ---------- API (google.script.run.<ad>) ----------
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
  async getTopic(id, pin) { auth_(pin); return topicOf_(id); },
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
  async sendMailTest() { throw new Error('Mail gönderimi bu sürümde yok (GitHub Pages sunucusuz çalışır). Bildirimler ntfy ile gelir.'); },
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
    let nid = '';
    await upd_(id, s => {
      const a = s.active;
      if (!a || a.paused) return;
      if (Date.now() >= end_(a)) throw new Error('Süre doldu. Molayı Bitir butonunu kullanın.');
      nid = a.nid; a.paused = true; a.pausedAt = Date.now(); a.sched = false; a.posting = false; a.nid = ''; a.sent = 0;
    });
    await cancel_(topicOf_('yonetici'), nid);
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
    auth_(pin);
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
      rows.push(rec);
      await ref.set({ rows: rows.slice(-200).map(r => ({ a: r[0], k: r[1], m: r[2], e: r[3] })) });
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
  async checkBreaks() {   // Sayfa açıkken 20 sn'de bir çağrılır; süresi dolan ama bildirimi gitmemiş molaları gönderir
    const now = Date.now();
    for (const s0 of await allStaff_()) {
      if (!due_(s0, now)) continue;
      let a = null;
      await upd_(s0.id, s => { if (!due_(s, now)) return; s.active.lastTry = now; s.active.tries = (s.active.tries || 0) + 1; a = copy_(s.active); });
      if (!a) continue;
      let ok = !!a.sched, err = a.err || '';
      if (!a.sched && !(a.posting && now - end_(a) < 120000)) {
        const m = await post_(topicOf_('yonetici'), '⏰ Mola doldu', `${nice_(s0.name)} (${branchName_(s0.branch)}) - ${a.dur} dk ${a.n} süresi doldu!`);
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
  async removeStaff(id, pin) {
    auth_(pin);
    const s = (await allStaff_()).find(x => x.id === id);
    await col('staff').doc(id).delete(); await col('hist').doc(id).delete();
    if (s) await cancelActive_(s);
  },
  async uploadShift(branch, text, pin) {
    auth_(pin);
    const staff = (await allStaff_()).filter(s => s.branch === branch), got = {}, missing = [];
    String(text || '').split(/\r?\n/).forEach(line => {
      if (!line.trim()) return;
      let parts = line.split(/\t|;|\|/);
      if (parts.length < 2) parts = line.split(',');
      const name = String(parts[0] || '').trim();
      if (!name) return;
      const week = []; for (let i = 0; i < 7; i++) week.push(parseCell_(parts[i + 1]));
      const s = staff.find(x => norm_(x.name) === norm_(name));
      if (s) got[s.id] = week; else if (week.some(Boolean)) missing.push(name);
    });
    const ids = Object.keys(got);
    if (!ids.length) throw new Error('Hiç isim eşleşmedi. Her satır: personel adı, sonra Pazartesi-Pazar vardiyaları olmalı.');
    const absent = [];
    for (const x of staff) {
      await upd_(x.id, s => { if (got[s.id]) s.sh = got[s.id]; else { s.sh = ['', '', '', '', '', '', '']; absent.push(s.name); } });
    }
    return { ok: ids.length, missing: missing, absent: absent };
  },
  async clearShift(branch, pin) {
    auth_(pin);
    for (const x of (await allStaff_()).filter(s => s.branch === branch)) await upd_(x.id, s => { delete s.sh; });
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
  // ---- Satış raporu (görselden okuma yok; ciro ve hesap sayısı elle girilir) ----
  async readReport() { throw new Error('Görselden otomatik okuma bu sürümde yok (Google Drive OCR gerekir).'); },
  async saveReport(d, pin) {
    auth_(pin);
    const name = String(d.name || '').trim(), ciro = Number(d.ciro), hesap = Number(d.hesap);
    if (!name || !(ciro > 0) || !(hesap > 0)) throw new Error('Ad, ciro ve hesap sayısı gerekli');
    const range = String(d.range || '').trim(), key = norm_(name) + '_' + norm_(range), ort = Math.round(ciro / hesap * 100) / 100;
    await col('reports').doc(key).set({ key, name, firma: String(d.firma || '').trim(), range, ciro, hesap, ort, t: Date.now() });
    return { ort: ort };
  },
  async listReports(pin) {
    auth_(pin);
    return (await col('reports').get()).docs.map(d => d.data()).sort((a, b) => b.ort - a.ort);
  },
  async delReport(key, pin) { auth_(pin); await col('reports').doc(key).delete(); }
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
})();
