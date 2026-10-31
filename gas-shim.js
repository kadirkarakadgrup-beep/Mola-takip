cd /mnt/user-data/outputs; cp gas-shim.js /tmp/shim.v7; python3 - <<'E'
t=open('gas-shim.js',encoding='utf-8').read()
def rep(a,b):
    global t
    assert t.count(a)==1,a[:70]; t=t.replace(a,b)
# ---- API: dönem biçimi, hedef, dönem taşıma
rep("const todayLbl_ =","const normR_ = s => String(s || '').trim().replace(/\\s*[-–—]\\s*/g, '-').replace(/\\s+/g, ' ');\nconst todayLbl_ =")
rep("const range = String(d.range || '').trim() || ('Yükleme ' + todayLbl_()), key = sube","const range = normR_(d.range) || ('Yükleme ' + todayLbl_()), key = sube")
rep("const rg = String(range || '').trim().slice(0, 40) || ('Yükleme ' + todayLbl_());","const rg = normR_(range).slice(0, 40) || ('Yükleme ' + todayLbl_());")
rep("  async delBeer(key, pin) { auth_(pin); await col('beer').doc(key).delete(); }\n",
"""  async delBeer(key, pin) { auth_(pin); await col('beer').doc(key).delete(); },
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
""")
# ---- İstemci
rep("const grp=L=>{const m={};L.forEach(r=>{const k=r.range||(","const nR=s=>String(s||'').trim().replace(/\\s*[-–—]\\s*/g,'-').replace(/\\s+/g,' ');\nconst grp=L=>{const m={};L.forEach(r=>{const k=nR(r.range)||(")
rep("title=bi?'🍺 Bira Satışı':'📊 Ciro Ortalama';per=perBar(v,g,G);","const T=bi?await tgt():0;title=bi?'🍺 Bira Satışı':'📊 Ciro Ortalama';per=perBar(v,g,G);")
rep("(g?b(`delPer('${v}')`,'🗑 Dönemi sil','off'):'')","(g?b(`movPer('${v}')`,'🔀 Dönemi taşı')+b(`delPer('${v}')`,'🗑 Dönemi sil','off'):'')+(bi?b('setTgt()','🎯 Hedef: '+T):'')")
rep("body=L.length?(bi?beerTable(L,adm):rptTable(L,adm)):","body=L.length?(bi?lbBira(L,adm,T):lbCiro(L,adm)):")
block=r'''
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
'''
i=t.index("var hs = document.querySelector('.hs')")
t=t[:i]+block+t[i:]
t=t.replace("' · v7'","' · v8'")
open('gas-shim.js','w',encoding='utf-8').write(t)
E
node --check gas-shim.js && echo SHIM_OK
# işlevsel deneme (DOM taklidi ile)
python3 - <<'E'
import re
s=open('/mnt/user-data/outputs/gas-shim.js',encoding='utf-8').read()
a=s.index("const fmt=n=>"); b=s.index("// ----- Toplu rapor yükleme")
code=s[a:b]
test='''
const esc=x=>String(x==null?'':x),nice=x=>String(x),ini=n=>String(n).split(' ').map(w=>w[0]).join(''),tl2=n=>Number(n).toFixed(2),gs=async()=>({}),B='opt',ask=()=>{},msg=()=>{},PIN='',PSIG='',pgSync=()=>{},num=Number,nR=x=>x,selG=()=>null,rptLoad=()=>{},PSEL={},BR={opt:'O'};
'''+code+'''
const L=[...Array(10)].map((_,i)=>({name:'Kisi '+i,ort:1400-i*20,ciro:1000*(10-i),hesap:100+i,key:'k'+i,qty:600-i*40}));
const h1=lbCiro(L,false),h2=lbCiro(L,true),h3=lbBira(L,false,620),h4=lbBira(L.slice(0,2),true,620);
console.log(h1.length,h2.length,h3.length,h4.length,(h1.match(/Düşüşte/g)||[]).length,(h3.match(/Kalan/g)||[]).length);
'''
open('/tmp/lbtest.js','w',encoding='utf-8').write(test)
E
node /tmp/lbtest.js
