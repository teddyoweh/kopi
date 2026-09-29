import re, json, time, urllib.parse, sys
sys.path.insert(0,'/tmp/sg-sources')
from gobiz_scrape import get, parse_rows
def extract2(b):
    rows=parse_rows(b)
    for rid,(t,p) in rows.items():
        if t=='J' and '{"licence":{' in p:
            k=p.find('{"licence":{')+len('{"licence":')
            obj,_=json.JSONDecoder().raw_decode(p[k:])
            def res(v):
                if isinstance(v,str) and re.fullmatch(r'\$[0-9a-f]+',v):
                    r=rows.get(v[1:])
                    if r and r[0]=='T': return r[1]
                    if r:
                        try: return json.loads(r[1])
                        except Exception: return r[1]
                if v=='$undefined': return None
                if isinstance(v,dict): return {k:res(x) for k,x in v.items()}
                if isinstance(v,list): return [res(x) for x in v]
                return v
            return res(obj)
failed=[l.split()[1] for l in open('/tmp/sg-sources/gobiz_scrape.log') if l.startswith(('NOOBJ','ERR'))]
out=open('/tmp/sg-sources/gobiz_licences.jsonl','a'); ok=0
for u in failed:
    u2=urllib.parse.quote(u,safe=':/')
    try:
        o=extract2(get(u2))
        if o: o['_url']=u2; out.write(json.dumps(o,ensure_ascii=False)+'\n'); ok+=1
        else: print('STILL NOOBJ',u2,flush=True)
    except Exception as e: print('ERR',u2,e,flush=True)
    time.sleep(1)
print('fixed',ok,'of',len(failed))
