import re, json, sys, time, urllib.request
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
def get(url, rsc=True):
    h={"User-Agent":UA,"Accept-Language":"en-US"}
    if rsc: h["RSC"]="1"
    return urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=40).read()
def parse_rows(b):
    rows={}; i=0; n=len(b)
    while i<n:
        c=b.find(b':',i)
        if c<0: break
        rid=b[i:c].decode(); 
        if c+1<n and b[c+1:c+2]==b'T':
            comma=b.find(b',',c)
            ln=int(b[c+2:comma],16)
            rows[rid]=('T',b[comma+1:comma+1+ln].decode('utf-8','ignore'))
            i=comma+1+ln
        else:
            nl=b.find(b'\n',c)
            if nl<0: nl=n
            rows[rid]=('J',b[c+1:nl].decode('utf-8','ignore')); i=nl+1
    return rows
def extract(b):
    rows=parse_rows(b)
    for rid,(t,p) in rows.items():
        if t=='J' and '"licence_id"' in p:
            k=p.find('"licence_id"'); j=k; depth=0
            while j>0:
                ch=p[j]
                if ch=='}': depth+=1
                elif ch=='{':
                    if depth==0: break
                    depth-=1
                j-=1
            obj,_=json.JSONDecoder().raw_decode(p[j:])
            def res(v):
                if isinstance(v,str) and re.fullmatch(r'\$[0-9a-f]+',v):
                    r=rows.get(v[1:]); 
                    if r and r[0]=='T': return r[1]
                    if r: 
                        try: return json.loads(r[1])
                        except Exception: return r[1]
                if v=='$undefined': return None
                if isinstance(v,dict): return {k:res(x) for k,x in v.items()}
                if isinstance(v,list): return [res(x) for x in v]
                return v
            return res(obj)
    return None
if __name__=='__main__':
    urls=re.findall(r'<loc>([^<]+)</loc>',open('/tmp/sg-sources/gobiz_licence_directory_sitemap.xml').read())
    limit=int(sys.argv[1]) if len(sys.argv)>1 else len(urls)
    out=open('/tmp/sg-sources/gobiz_licences.jsonl','w'); ok=fail=0
    for u in urls[:limit]:
        try:
            o=extract(get(u)); 
            if o: o['_url']=u; out.write(json.dumps(o,ensure_ascii=False)+'\n'); ok+=1
            else: fail+=1; print('NOOBJ',u,flush=True)
        except Exception as e:
            fail+=1; print('ERR',u,e,flush=True)
        time.sleep(1.0)
    print('ok',ok,'fail',fail)
