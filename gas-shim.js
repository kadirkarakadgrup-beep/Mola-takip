cd /mnt/user-data/outputs; cp gas-shim.js /tmp/shim.v13; cat > /tmp/voice.js <<'EOF'

// ===== İsim anonsu: yönetici personelin adını kendi sesiyle kaydeder =====
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
async function toWav(blob){
  const ab=await blob.arrayBuffer(),AC=window.AudioContext||window.webkitAudioContext,ctx=new AC();
  const buf=await new Promise((ok,no)=>ctx.decodeAudioData(ab,ok,no));
  const sr=16000,oc=new OfflineAudioContext(1,Math.max(1,Math.ceil(buf.duration*sr)),sr),src=oc.createBufferSource();
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
      const wav=await toWav(new Blob(ch,{type:mr.mimeType||'audio/webm'}));
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
EOF
python3 - <<'E'
t=open('gas-shim.js',encoding='utf-8').read()
R=[]
# tablo okuyucu: gevşek başlık ve sayı
R.append(("const NR=/^\\d{1,3}(?:\\.\\d{3})*,\\d{2}$/,PR=/^\\d{1,3}(?:\\.\\d{3})*,\\d{2}/,out=[];","const NR=/^\\d{1,3}(?:\\.\\d{3})*,\\d{2}$/,PR=/^\\d{1,3}(?:\\.\\d{3})*,\\d{2}/,out=[],NL=/^\\d{1,3}(?:\\.\\d{3})*,\\d{1,2}$/;"))
R.append(("const mk=W.filter(w=>nrm(w.t)=='miktar').sort((a,b)=>a.y-b.y);","const mk=W.filter(w=>{const n=nrm(w.t);return n=='miktar'||(n.length>=5&&n.length<=7&&lev(n,'miktar')<=1);}).sort((a,b)=>a.y-b.y);"))
R.append(("const re=pre?PR:NR,t=W.filter(","const re=pre?PR:NL,t=W.filter("))
R.append(("return t?num(t.t.match(PR)[0]):null;","return t?num(pre?t.t.match(PR)[0]:t.t):null;"))
# bira: okunmayan personel
R.append(("'\\nSatır: Ad;Miktar',per);\n    return;","absentTxt(list)+'\\nSatır: Ad;Miktar',per);\n    return;"))
# garson tarafı: isimli anons
R.append(("const oa=window.alarm;window.alarm=function(s){oa(s);if(M=='g'){playAnons();let n=0;const iv=setInterval(()=>{if(++n>3||M!='g'||!document.querySelector('.card.late')){clearInterval(iv);return;}playAnons();},30000);}};","const oa=window.alarm;window.alarm=function(s){oa(s);if(M=='g'){playAnons(s.id);let n=0;const iv=setInterval(()=>{if(++n>3||M!='g'||!document.querySelector('.card.late')){clearInterval(iv);return;}playAnons(s.id);},30000);}};"))
R.append(("if((window.__ml||0)<m.t){window.__ml=m.t;playAnons();}","if((window.__ml||0)<m.t){window.__ml=m.t;playAnons(me);}"))
R.append(("    mbn(s0,me);\n    return;}","    mbn(s0,me);vFetch(s0);\n    return;}"))
# yönetici düğmeleri
R.append(("<button class=\"a ed full\" onclick=\"admSet()\">⚙ Ayarlar</button>","<button class=\"a ed\" onclick=\"vList()\">🎙 İsim kayıtları</button><button class=\"a x\" onclick=\"admSet()\">⚙ Ayarlar</button>"))
# API
R.append(("  // ---- Başlangıç & Tatlı satış miktarları","""  async saveVoice(id, data, pin) {   // yöneticinin kendi sesiyle kaydettiği isim anonsu
    auth_(pin);
    if (typeof data !== 'string' || !/^data:audio\\/(wav|x-wav|wave);base64,/.test(data) || data.length > 600000) throw new Error('Kayıt geçersiz ya da çok uzun');
    const T = Date.now();
    await col('voice').doc(id).set({ a: data, t: T });
    await upd_(id, s => { s.hasVoice = true; s.voiceT = T; });
    return 'ok';
  },
  async getVoice(id) { const d = await col('voice').doc(id).get(); return d.exists ? d.data() : null; },
  async delVoice(id, pin) { auth_(pin); await col('voice').doc(id).delete(); await upd_(id, s => { s.hasVoice = false; s.voiceT = 0; }); return 'ok'; },
  // ---- Başlangıç & Tatlı satış miktarları"""))
bad=[a[:80] for a,b in R if t.count(a)!=1]
print('EŞLEŞMEYEN:',bad)
if not bad:
    for a,b in R: t=t.replace(a,b)
    # eski catBatch'i sil (yenisi voice.js içinde)
    i=t.index("window.catBatch=async function(files){"); j=t.index("window.catPick=")
    t=t[:i]+t[j:]
    k=t.index("var hs = document.querySelector('.hs')")
    t=t[:k]+open('/tmp/voice.js',encoding='utf-8').read()+t[k:]
    t=t.replace("' · v13'","' · v14'")
    open('gas-shim.js','w',encoding='utf-8').write(t); print('YAZILDI')
E
node --check gas-shim.js && echo SHIM_OK
