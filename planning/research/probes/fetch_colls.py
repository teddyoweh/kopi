import json, urllib.request, urllib.error, time, os, sys
os.makedirs('/tmp/sg-sources/dgs_coll_pages',exist_ok=True)
for p in range(1,138):
    fn=f'/tmp/sg-sources/dgs_coll_pages/{p}.json'
    if os.path.exists(fn): continue
    for attempt in range(8):
        try:
            r=urllib.request.urlopen(urllib.request.Request(f"https://api-production.data.gov.sg/v2/public/api/collections?page={p}",headers={"User-Agent":"Mozilla/5.0"}),timeout=20)
            d=json.load(r); json.dump(d['data']['collections'],open(fn,'w')); break
        except urllib.error.HTTPError as e:
            print(p,'HTTP',e.code,flush=True); time.sleep(10)
        except Exception as e:
            print(p,'ERR',e,flush=True); time.sleep(5)
    time.sleep(1)
out=[]
for p in range(1,138):
    fn=f'/tmp/sg-sources/dgs_coll_pages/{p}.json'
    if os.path.exists(fn): out+=json.load(open(fn))
json.dump(out,open('/tmp/sg-sources/dgs_collections_all.json','w'))
print('total',len(out))
