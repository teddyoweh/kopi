import re,html,urllib.request,urllib.parse,http.cookiejar,sys
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
cj=http.cookiejar.CookieJar(); op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
U="https://www.gebiz.gov.sg/ptn/supplier/directory/index.xhtml"
s=op.open(urllib.request.Request(U,headers={"User-Agent":UA}),timeout=40).read().decode('utf-8','ignore')
form=s[s.find('<form id="contentForm"'):]; form=form[:form.find('</form>')]
data={}; textname=None
for m in re.finditer(r'<input[^>]*>',form):
    tag=m.group(0); n=re.search(r'name="([^"]+)"',tag); v=re.search(r'value="([^"]*)"',tag); ty=re.search(r'type="([^"]+)"',tag)
    if not (n and ty): continue
    if ty.group(1)=='hidden': data[html.unescape(n.group(1))]=html.unescape(v.group(1)) if v else ''
    if n.group(1).endswith('_inputButton') and 'HIDDEN' not in n.group(1): textname=n.group(1)[:-len('_inputButton')]
btn=[m.group(0) for m in re.finditer(r'<input[^>]*type="submit"[^>]*>',form)]
print('text field',textname); print('submit buttons',[re.search(r'name="([^"]+)"',b).group(1)+'='+(re.search(r'value="([^"]*)"',b).group(1) if re.search(r'value="([^"]*)"',b) else '') for b in btn])
data[textname]=sys.argv[1]
sb=[b for b in btn if 'Search' in b or 'SEARCH' in b or 'search' in b]
if sb:
    b=sb[0]; data[re.search(r'name="([^"]+)"',b).group(1)]=re.search(r'value="([^"]*)"',b).group(1)
r=op.open(urllib.request.Request(U,data=urllib.parse.urlencode(data).encode(),headers={"User-Agent":UA,"Content-Type":"application/x-www-form-urlencoded","Referer":U}),timeout=60).read().decode('utf-8','ignore')
open(f'/tmp/sg-sources/gebiz_supdir_search_{sys.argv[1]}.html','w').write(r)
t=re.sub(r'<script.*?</script>|<style.*?</style>','',r,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
for k in ['result','Result','records','No record']:
    i=t.find(k)
    if i>=0: print('==',k,t[max(0,i-200):i+1500]); break
links=re.findall(r'href="(/ptn/supplier/directory/searchDetail\.xhtml\?code=[0-9a-f]+)"',r)
print('detail links',links[:3])
if links:
    d=op.open(urllib.request.Request("https://www.gebiz.gov.sg"+links[0],headers={"User-Agent":UA,"Referer":U}),timeout=60).read().decode('utf-8','ignore')
    open(f'/tmp/sg-sources/gebiz_supdir_detail_{sys.argv[1]}.html','w').write(d)
    t=re.sub(r'<script.*?</script>|<style.*?</style>','',d,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t)).replace('LOADING','')
    i=t.find('Supplier Directory',t.find('SIGN UP')); print(t[i:i+3500])
