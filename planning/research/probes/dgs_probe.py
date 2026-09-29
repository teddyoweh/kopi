import json, sys, urllib.request, time
def get(u):
    for a in range(5):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"Mozilla/5.0"}),timeout=40))
        except Exception as e:
            err=e; time.sleep(4*(a+1))
    return {"error":str(err)}
res={}
for D in sys.argv[1:]:
    m=get(f"https://api-production.data.gov.sg/v2/public/api/datasets/{D}/metadata").get('data',{})
    s=get(f"https://data.gov.sg/api/action/datastore_search?resource_id={D}&limit=1")
    r=s.get('result',{}) if isinstance(s,dict) else {}
    res[D]={"name":m.get('name'),"managedBy":m.get('managedBy'),"format":m.get('format'),"lastUpdatedAt":m.get('lastUpdatedAt'),"coverageStart":m.get('coverageStart'),"coverageEnd":m.get('coverageEnd'),"size":m.get('datasetSize'),"collectionIds":m.get('collectionIds'),"total":r.get('total'),"fields":[f['id'] for f in r.get('fields',[]) if f['id']!='_id'],"sample":(r.get('records') or [None])[0], "err": s.get('error') if isinstance(s,dict) else None}
    print(json.dumps({D:res[D]},ensure_ascii=False,indent=1)); sys.stdout.flush()
    time.sleep(1.5)
json.dump(res,open('/tmp/sg-sources/dgs_probe_'+str(int(time.time()))+'.json','w'),indent=1,ensure_ascii=False)
