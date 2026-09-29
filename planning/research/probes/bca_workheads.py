import re, html, json, urllib.request, http.cookiejar, time
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"
cj=http.cookiejar.CookieJar(); op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
types=[("registered-contractors","construction"),("registered-contractors","construction-related"),("registered-contractors","mechanical-electrical"),("registered-contractors","regulatory"),("registered-contractors","trade"),("licensed-builders","general-builder"),("licensed-builders","specialist-builder"),("fm-registry","facilities-management"),("fm-registry","housekeeping-cleansing-desilting-conservancy-service"),("fm-registry","landscaping"),("fm-registry","pest-control"),("suppliers-registry","supply")]
out={}
for ct,tt in types:
    u=f"https://www.bca.gov.sg/eBACS/BCA_DIRECTORY/Filter/FilterWorkHeadType?contractorType={ct}&tradeType={tt}"
    req=urllib.request.Request(u,headers={"User-Agent":UA})
    s=op.open(req,timeout=30).read().decode('utf-8','ignore')
    for m in re.finditer(r'Get\w+?\?workhead=([^&"]+)&amp;title=([^&"]+)&amp;grade=([^"&]+)',s):
        code,title,grade=m.group(1),urllib.parse.unquote(html.unescape(m.group(2))),m.group(3)
        e=out.setdefault(code,{"code":code,"title":title,"registry":ct,"trade_type":tt,"grades":[]})
        if grade!="All" and grade not in e["grades"]: e["grades"].append(grade)
    time.sleep(0.5)
json.dump(list(out.values()),open('/tmp/sg-sources/bca_workheads.json','w'),indent=1)
print(len(out))
for v in out.values(): print(v['code'],'|',v['title'],'|',v['registry'],'|',','.join(v['grades']))
