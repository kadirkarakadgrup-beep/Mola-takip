mkdir -p /tmp/cat && cd /tmp/cat && python3 - <<'E'
from PIL import Image, ImageEnhance
import subprocess,json
im=Image.open('/mnt/user-data/uploads/99503.jpg').convert('L'); print(im.size)
w=max(1800,im.width); im=im.resize((w,round(im.height*w/im.width)),Image.LANCZOS); im=ImageEnhance.Contrast(im).enhance(1.3); im.save('c.png')
for psm in (11,6,3):
    subprocess.run(['tesseract','c.png',f'c{psm}','-l','eng','--psm',str(psm),'tsv'],capture_output=True)
    words=[]
    for l in open(f'c{psm}.tsv',encoding='utf-8').read().split('\n')[1:]:
        p=l.split('\t')
        if len(p)==12 and p[11].strip():
            x,y,w2,h=map(int,p[6:10]); words.append({'t':p[11].strip(),'x0':x,'x':x+w2/2,'y':y+h/2,'h':h})
    json.dump(words,open(f'c{psm}.json','w'))
    print(psm,len(words))
    if psm==11:
        for x in sorted(words,key=lambda r:(round(r['y']/12),r['x0'])):
            if 1700<x['y']<2300: print(round(x['x0']),round(x['y']),x['t'])
E
