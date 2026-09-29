# Subagent: permits, licences and registrations source research

`09-sub-permits-research` · model claude-opus-5-5 · 2 assistant messages · 120 tool calls · 29 Sep 08:00 UTC → 29 Sep 08:27 UTC

Redacted export: thinking, images, system reminders and mailbox results are removed; secrets, emails, phone numbers and home paths are masked; long tool output is cut.

---

## Turn 1 · Teddy · 29 Sep 08:00 UTC

> I'm building a Singapore government-tender copilot (GeBIZ). It needs machine-readable sources for the PERMITS, LICENCES and REGISTRATIONS a supplier needs to bid, so a copilot can answer "what registrations/licences does this tender require, do we have them, and how do we get them". Find the real sources and PROVE each one works with an actual request (curl/python). Do not report anything you did not fetch.
>
> Find and probe, in this order:
> 1. **EPU / GRA supply heads** (Government Registration Authority, "EPU/CMP/10 – Computer Related Hardware, Software and Services", financial grades S2–S10 with tendering capacity). Where is the full list of supply heads and grade→tendering capacity table published? (GeBIZ pages, MOF/GRA PDFs, data.gov.sg.) Get the actual list if it is fetchable.
> 2. **BCA Contractors Registry (CRS)**: workheads (CW01, CW02, ME01…, CR…) with grades (A1…C3) and tendering limits; and the public list of registered contractors. data.gov.sg datasets and BCA's own directory (bca.gov.sg / BCA Directory of Registered Contractors). Note: the data.gov.sg search API ignores `query=` — use the collections/dataset catalogue differently (e.g. https://api-production.data.gov.sg/v2/public/api/collections, https://data.gov.sg/datasets?query=… pages, or direct dataset IDs from web search), or search the web for "data.gov.sg registered contractors BCA dataset d_".
> 3. **GoBusiness Licensing** (gobusiness.gov.sg): the licence directory / "Licence Finder" — every licence with issuing agency, description, fees, processing time. Is there a JSON API behind the page (inspect network calls; try the obvious /api/ endpoints the page's JS uses)? If it's a JS app, find the JSON it loads.
> 4. Any other open datasets useful for tender eligibility: licensed security agencies (PLRD), SFA licensed food establishments, NEA licensed cleaning businesses (Environmental Public Health cleaning licence), ACRA entity lookup (open data), bizSAFE, ISO, etc. Just the ones with a working machine-readable source.
>
> For each source report: URL/endpoint, auth needed (none/key), format, row count or size, fields, licence/terms (esp. any no-republication clause), one real sample record, and whether it's current. Also note robots.txt for any site you'd scrape.
>
> Save raw samples you fetch under /tmp/sg-sources/ (not in any repo). Write your final report as markdown to ~/Documents/codes/gebiz-triage/planning/research/permits-licences-sources.md (create the folder), ranked by usefulness for tender eligibility, ending with a recommendation of the 3–5 sources to index. Keep it factual and compact. Return a 10-line summary.

- **Bash** — Create output dirs and check tools
  
  ```
  mkdir -p /tmp/sg-sources ~/Documents/codes/gebiz-triage/planning/research && ls ~/Documents/codes/gebiz-triage/planning/ 2>/dev/null; ls ~/Documents/codes/gebiz-triage/planning/research 2>/dev/null; which curl python3 jq
  ```

- **ToolSearch** `{"query": "select:WebSearch,WebFetch", "max_results": 2}`

  <details><summary>result</summary>

  ```
  00-brief.md
  01-discovery.md
  research
  /usr/bin/curl
  /usr/bin/python3
  /usr/bin/jq
  ```

  </details>

  <details><summary>result</summary>

  ```
  [omitted: tool schemas loaded]
  ```

  </details>

- **Bash** — Check existing planning files
  
  ```
  ls -la ~/Documents/codes/gebiz-triage/planning/research; head -40 ~/Documents/codes/gebiz-triage/planning/00-brief.md
  ```

  <details><summary>result</summary>

  ```
  total 0
  drwxr-xr-x@ 2 teddy  staff   64 Sep 29 04:00 .
  drwxr-xr-x@ 5 teddy  staff  160 Sep 29 04:00 ..
  # 00 — Brief
  
  **Received:** Tue 29 Sep 2026 · **Due:** Thu 1 Oct 2026
  **Assessment:** Pragnition Labs — AI-Native Builder Technical Assessment
  
  ## What they asked for
  
  Build or improve a small project using coding agents heavily. Keep planning notes,
  handoff files and agent plans in `planning/`. Ship a README (what, how to run,
  trade-offs), exported agent session logs, a public repo and a short demo.
  
  The demo has to
  [… 1,345 chars cut …]
  and that an AI system can take over without taking
  the decision away from the person.
  
  So the product is a **triage tool for a supplier's bid manager**: it reads today's
  ```

  </details>

- **Bash** — Probe data.gov.sg collections API
  
  ```
  cd /tmp/sg-sources; curl -s -m 30 "https://api-production.data.gov.sg/v2/public/api/collections?page=1" -o collections_p1.json; python3 -c "
  import json;d=json.load(open('collections_p1.json'));print(d.keys() if isinstance(d,dict) else type(d));
  dd=d.get('data',{});print(dd.keys() if isinstance(dd,dict) else '');
  cols=dd.get('collections',[]);print(len(cols));print(json.dumps(cols[0],indent=1)[:800]);print(dd.get('pages'))"
  ```

  <details><summary>result</summary>

  ```
  dict_keys(['code', 'data', 'errorMsg'])
  dict_keys(['collections', 'pages'])
  10
  {
   "collectionId": "471",
   "createdAt": "2018-11-07T19:04:51+08:00",
   "name": "TradeNet Service Centres & Certified Vendors",
   "description": "This data contains information on the location of tradenet service centres and certified vendors",
   "lastUpdatedAt": "2024-06-06T15:06:15+08:00",
   "frequency": "ad-hoc",
   "sources": [
    "Singapore Customs"
   ],
   "managedByAgencyName": "Singapore Customs",
   "childDatasets": [
    "d_b35e13da57bb6303224e03f0b86238fb",
    "d_ea81d312239b3337316b887a7dfe665f"
   ]
  }
  137
  ```

  </details>

- **Bash** — Fetch all data.gov.sg collections
  
  ```
  cd /tmp/sg-sources; cat > fetch_colls.py <<'EOF'
  import json, urllib.request, time
  out=[]
  for p in range(1,138):
      for attempt in range(5):
          try:
              r=urllib.request.urlopen(f"https://api-production.data.gov.sg/v2/public/api/collections?page={p}",timeout=30)
              d=json.load(r); out+=d['data']['collections']; break
          except Exception as e:
              time.sleep(3*(attempt+1))
      time.sleep(0.3)
  json.dump(out,open('dgs_collections_all.json','w'))
  print(len(out))
  EOF
  python3 fetch_colls.py
  ```

  <details><summary>result</summary>

  ```
  Command running in background with ID: bn8ngnho6. Output is being written to: /private/tmp/claude-501/-Users-teddy--universe-sessions-529c67bc-baf4-434e-a6d1-a7855631d0a5/7142f416-4f85-496d-ae13-524a650d7452/tasks/bn8ngnho6.output. You will be notified when it completes. To check interim output, use Read on that file path.
  Session cwd remains ~/.universe/sessions/529c67bc-baf4-434e-a6d1-a7855631d0a5; directory changes made by the backgrounded command do not apply to subsequent commands.
  ```

  </details>

- **Bash** — Fetch robots.txt for key sites
  
  ```
  cd /tmp/sg-sources; for u in https://www.gebiz.gov.sg/robots.txt https://www.gobusiness.gov.sg/robots.txt https://www1.bca.gov.sg/robots.txt https://www.bca.gov.sg/robots.txt https://data.gov.sg/robots.txt https://www.mof.gov.sg/robots.txt; do echo "=== $u"; curl -s -m 20 -A "Mozilla/5.0" -w "\nHTTP %{http_code}\n" "$u" | head -30; done
  ```

  <details><summary>result</summary>

  ```
  === https://www.gebiz.gov.sg/robots.txt
  User-agent: *
  Allow: /
  Disallow: /scripts/
  
  Sitemap: https://www.gebiz.gov.sg/sitemap.xml
  HTTP 200
  === https://www.gobusiness.gov.sg/robots.txt
  <!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
  <HTML><HEAD><META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=iso-8859-1">
  <TITLE>ERROR: The request could not be satisfied</TITLE>
  </HEAD><BODY>
  <H1>403 ERROR</H1>
  <H2>The request could not be satisfied.</H2>
  <HR noshade
  [… 1,025 chars cut …]
  User-agent: *
  Allow: /
  HTTP 200
  === https://www.mof.gov.sg/robots.txt
  User-Agent: *
  Allow: /
  Disallow: /search
  
  Sitemap: https://www.mof.gov.sg/sitemap.xml
  
  HTTP 200
  ```

  </details>

- **WebSearch** `{"query": "GeBIZ Government Registration Authority supply heads list EPU/CMP/10 financial grade tendering capacity"}`

- **WebSearch** `{"query": "GeBIZ \"supply head\" list PDF EPU \"tendering capacity\" S2 S10"}`

  <details><summary>result</summary>

  ```
  Web search results for query: "GeBIZ "supply head" list PDF EPU "tendering capacity" S2 S10"
  
  Links: [{"title":"GeBIZ ICT Tender Guide for Singapore SIs (2026)","url":"https://techdirectory.sg/guides/singapore-gebiz-ict-suppliers"},{"title":"Government – Vicinity Studio","url":"https://vicinity.studio/government/"},{"title":"GeBiz EPPU Supply Head EPU/CMP/10 at financial grade S4 approved","url":"http://www.colvecs.com/colvecsweb/index.php/7-news-and-announcements/38-gebiz-eppu-supply-head-epucmp10-at-financial-grade-s2
  [… 1,617 chars cut …]
  comprehensive and up-to-date documentation would be available there.
  
  
  REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.
  ```

  </details>

  <details><summary>result</summary>

  ```
  Web search results for query: "GeBIZ Government Registration Authority supply heads list EPU/CMP/10 financial grade tendering capacity"
  
  Links: [{"title":"14 Oct 2020 1 REGISTRATION GUIDELINES FOR GOVERNMENT SUPPLIER REGISTRATION","url":"https://www.gebiz.gov.sg/cmw/content/4/page3/2/guidelines.pdf"},{"title":"28 Oct 2025 1 REGISTRATION GUIDELINES FOR GOVERNMENT SUPPLIER REGISTRATION","url":"https://www.gebiz.gov.sg/docs/Appln_Guidelines_for_Gov_Supp_Reg.pdf"},{"title":"Gebiz EPU/CMP/10 -
  [… 2,341 chars cut …]
  full supply heads list are not fully displayed in the search results.
  
  
  REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.
  ```

  </details>

- **Bash** — Download GeBIZ GSR registration guidelines PDFs
  
  ```
  cd /tmp/sg-sources; for u in "https://www.gebiz.gov.sg/docs/Appln_Guidelines_for_Gov_Supp_Reg.pdf" "https://www.gebiz.gov.sg/cmw/content/4/page3/2/guidelines.pdf"; do f=$(basename $u); curl -s -m 60 -A "Mozilla/5.0" -o "gebiz_$f" -w "$u HTTP %{http_code} %{size_download} %{content_type}\n" "$u"; done; file gebiz_*.pdf; which pdftotext
  ```

  <details><summary>error</summary>

  ```
  Exit code 1
  https://www.gebiz.gov.sg/docs/Appln_Guidelines_for_Gov_Supp_Reg.pdf HTTP 200 367813 application/pdf
  https://www.gebiz.gov.sg/cmw/content/4/page3/2/guidelines.pdf HTTP 200 613851 application/pdf
  gebiz_Appln_Guidelines_for_Gov_Supp_Reg.pdf: PDF document, version 1.7, 18 pages
  gebiz_guidelines.pdf:                        PDF document, version 1.5, 17 pages
  pdftotext not found
  ```

  </details>

- **Bash** — Check available PDF libraries
  
  ```
  cd /tmp/sg-sources; python3 -c "import pypdf; print('pypdf', pypdf.__version__)" 2>&1; python3 -c "import pdfplumber; print('pdfplumber ok')" 2>&1; python3 -c "import fitz; print('fitz ok')" 2>&1
  ```

  <details><summary>result</summary>

  ```
  pypdf 6.18.0
  Traceback (most recent call last):
    File "<string>", line 1, in <module>
  ModuleNotFoundError: No module named 'pdfplumber'
  fitz ok
  ```

  </details>

- **Bash** — Extract text from GSR guidelines PDF
  
  ```
  cd /tmp/sg-sources; python3 -c "
  import fitz
  d=fitz.open('gebiz_Appln_Guidelines_for_Gov_Supp_Reg.pdf')
  t='\n'.join(p.get_text() for p in d)
  open('gebiz_Appln_Guidelines_for_Gov_Supp_Reg.txt','w').write(t)
  print(len(t))
  "; grep -n -i -E "S2|S10|tendering capacity|supply head|appendix|EPU/" gebiz_Appln_Guidelines_for_Gov_Supp_Reg.txt | head -80
  ```

  <details><summary>result</summary>

  ```
  31116
  15:Supply Heads and Financial Grades ...................................................................... 2 
  32:APPENDIX A – TYPES OF GOVERNMENT SUPPLY HEADS .................................... 8 
  34:Supply Heads for Goods / Services (excluding Medical Supplies / Equipment and 
  37:Supply Heads For Medical Supplies / Equipment ................................................ 13 
  38:APPENDIX B – FINANCIAL GRADES AND EVALUATION CRITERIA ...................... 14 
  91:3. Supply Heads and Financial Grades  
  93:3.1
  [… 2,234 chars cut …]
  Licence)  
  1098:APPENDIX B – FINANCIAL GRADES AND EVALUATION CRITERIA 
  1117:S2  
  1154:S10##  
  1180:and paid-up capital criteria (for S9 & S10) of the next financial grade.
  ```

  </details>

- **Bash** — Read Appendix A supply heads section
  
  ```
  cd /tmp/sg-sources; sed -n 1,20p gebiz_Appln_Guidelines_for_Gov_Supp_Reg.txt; echo ----; sed -n 392,520p gebiz_Appln_Guidelines_for_Gov_Supp_Reg.txt
  ```

  <details><summary>result</summary>

  ```
  28 Oct 2025 
    
  1  
  REGISTRATION GUIDELINES FOR GOVERNMENT SUPPLIER REGISTRATION 
  (GSR) 
   
  Contents 
  1. 
  Introduction ............................................................................................................ 2 
  2. 
  GSR is not a Licence ............................................................................................. 2 
  3. 
  Supply Heads and Financial Grades ...................................................................... 2 
  4. 
  GSR Registration Criteria
  [… 2,099 chars cut …]
   
    
  Connectors, 
  passive 
  components 
  printed circuit boards, relays, solenoids, 
  semiconductors, switches and other 
  related items  
    
   
   
  
   
   
  28 Oct 2025 
    
  9
  ```

  </details>

- **Bash** — Extract tables from GSR PDF
  
  ```
  cd /tmp/sg-sources; python3 -c "
  import fitz, json, re
  print(fitz.__doc__)
  d=fitz.open('gebiz_Appln_Guidelines_for_Gov_Supp_Reg.pdf')
  rows=[]
  for i,p in enumerate(d):
      try:
          tabs=p.find_tables()
      except Exception as e:
          print('no find_tables',e); break
      for t in tabs.tables:
          for r in t.extract():
              rows.append([ (c or '').replace('\n',' ').strip() for c in r])
              
  json.dump(rows,open('gsr_tables_raw.json','w'),indent=0)
  for r in rows: print(r)
  " 2>&1 | head -150
  ```

  <details><summary>result</summary>

  ```
  PyMuPDF 1.26.0: Python bindings for the MuPDF 1.26.1 library (rebased implementation).
  Python 3.9 running on darwin (64-bit).
  
  ['', '', '', '', '', '', 'Processing Time', 'Requirements']
  ['', 'Service', '', '', 'Processing Fee', '', '', '']
  ['', 'Type', '', '', '', '', '', '']
  ['Normal Service', '', '', 'S$43.60 (inclusive of GST) per application (w.e.f. 28 Oct 2025)', '', '', 'Within 3 working days', 'Applications will only be processed after full payment has been made and the required supporting documents have been
  [… 2,324 chars cut …]
  GSR holders Applicable only to GeBIZ Trading Partners who are ACRA-registered', 'Must be registered as GeBIZ Trading Partners with GeBIZ ACRA status must be “live”.']
  ```

  </details>

- **Bash** — Read supply head footnotes and intro
  
  ```
  cd /tmp/sg-sources; sed -n 960,1100p gebiz_Appln_Guidelines_for_Gov_Supp_Reg.txt | tr -s ' \n' ' ' | fold -w 200; echo; sed -n 85,130p gebiz_Appln_Guidelines_for_Gov_Supp_Reg.txt | tr -s ' \n' ' ' | fold -w 200
  ```

  <details><summary>result</summary>

  ```
  38. EPU/SER/46 Cleaning Services All forms of cleaning eg toilet cleaning and maintenance of Aquariums and fish pond etc. This however excludes laundry service, cleaning and maintenance of building wh
  ich comes under BCA. * It is the responsibility of the company/business to obtain the relevant valid license to carry out jobs/supplies for which they wish to tender for (e.g. Supply Head EPU/FFG/10 a
  nd Supply Head EPU/SER/43. 28 Oct 2025 13 2. Supply Heads For Medical Supplies / Equipment S/No Supply Head Brief
  [… 2,319 chars cut …]
  mode of registration is via GeBIZ at https://www.gebiz.gov.sg 5.3 The processing f
  ee will be payable to RMA. 6. Processing Fee 6.1 Each application will be assessed by RMA.
  ```

  </details>

- **Bash** — Check collections fetch progress
  
  ```
  cat /private/tmp/claude-501/-Users-teddy--universe-sessions-529c67bc-baf4-434e-a6d1-a7855631d0a5/7142f416-4f85-496d-ae13-524a650d7452/tasks/bn8ngnho6.output; ls -la /tmp/sg-sources/
  ```

  <details><summary>result</summary>

  ```
  total 2120
  drwxr-xr-x@  8 teddy  wheel     256 Sep 29 04:01 .
  drwxrwxrwt  73 root   wheel    2336 Sep 29 04:01 ..
  -rw-r--r--@  1 teddy  wheel    5386 Sep 29 04:00 collections_p1.json
  -rw-r--r--@  1 teddy  wheel     450 Sep 29 04:01 fetch_colls.py
  -rw-r--r--@  1 teddy  wheel  367813 Sep 29 04:01 gebiz_Appln_Guidelines_for_Gov_Supp_Reg.pdf
  -rw-r--r--@  1 teddy  wheel   31231 Sep 29 04:01 gebiz_Appln_Guidelines_for_Gov_Supp_Reg.txt
  -rw-r--r--@  1 teddy  wheel  613851 Sep 29 04:01 gebiz_guidelines.pdf
  -rw-r--r--@  1 teddy  wheel   14533 Sep 29 04:01 gsr_tables_raw.json
  ```

  </details>

- **WebSearch** `{"query": "data.gov.sg \"Listing of Registered Contractors\" BCA dataset"}`

- **WebSearch** `{"query": "BCA Contractors Registry workheads grades tendering limits CW01 CW02 ME01 financial year 2025 2026"}`

  <details><summary>result</summary>

  ```
  Web search results for query: "data.gov.sg "Listing of Registered Contractors" BCA dataset"
  
  Links: [{"title":"Listing of Registered Contractors-Data.gov.sg","url":"https://data.gov.sg/dataset/listing-of-registered-contractors"},{"title":"Listing of Registered Contractors | BCA | data.gov.sg","url":"https://data.gov.sg/datasets/d_dcda79be4aded5f9e769b8e23ff69b47/view"},{"title":"Singapore BCA Registered Contractors Scraper · Apify","url":"https://apify.com/automation-lab/singapore-bca-registered-contractors-scraper"},{"
  [… 1,828 chars cut …]
  and is available for reuse and citation in research publications.
  
  
  REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.
  ```

  </details>

  <details><summary>result</summary>

  ```
  Web search results for query: "BCA Contractors Registry workheads grades tendering limits CW01 CW02 ME01 financial year 2025 2026"
  
  Links: [{"title":"CRS, FM, and SY Registries tendering limits | Building and Construction Authority","url":"https://www1.bca.gov.sg/growth-and-transformation/procurement/registration-of-built-environment-firms/tendering-limits/crs-fm-and-sy-registries-tendering-limits/"},{"title":"Building & Construction Authority","url":"https://www.bca.gov.sg/ContractorsRegistry/contractors_tendering_limi
  [… 2,234 chars cut …]
  million, and L5 or L6 at unlimited, depending on the workhead category.
  
  
  REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.
  ```

  </details>

- **Bash** — Fetch BCA CRS dataset metadata
  
  ```
  cd /tmp/sg-sources; D=d_dcda79be4aded5f9e769b8e23ff69b47; curl -s -m 30 "https://api-production.data.gov.sg/v2/public/api/datasets/$D/metadata" -o bca_crs_metadata.json; python3 -m json.tool bca_crs_metadata.json | head -80
  ```

  <details><summary>result</summary>

  ```
  {
      "code": 0,
      "data": {
          "datasetId": "d_dcda79be4aded5f9e769b8e23ff69b47",
          "createdAt": "2016-06-21T23:00:26+08:00",
          "name": "Listing of Registered Contractors",
          "collectionIds": [
              "16"
          ],
          "description": "Listing of Registered Contractors",
          "format": "CSV",
          "lastUpdatedAt": "2026-01-12T13:51:07+08:00",
          "managedBy": "Building and Construction Authority",
          "coverageStart": "2025-07-01T00:00:00+08:00",
          "coverageEnd":
  [… 2,289 chars cut …]
      "index": "3",
                      "isCategorical": true
                  },
                  "c_ak420n766efthlh5n5kzl72qy": {
                      "name": "additional_info",
  ```

  </details>

- **Bash** — Query BCA CRS datastore and poll download
  
  ```
  cd /tmp/sg-sources; D=d_dcda79be4aded5f9e769b8e23ff69b47; curl -s -m 30 "https://data.gov.sg/api/action/datastore_search?resource_id=$D&limit=2" | python3 -m json.tool | head -60; echo; curl -s -m 30 "https://api-open.data.gov.sg/v1/public/api/datasets/$D/poll-download" | head -c 600
  ```

  <details><summary>result</summary>

  ```
  {
      "success": true,
      "result": {
          "resource_id": "d_dcda79be4aded5f9e769b8e23ff69b47",
          "fields": [
              {
                  "type": "text",
                  "id": "company_name"
              },
              {
                  "type": "text",
                  "id": "uen_no"
              },
              {
                  "type": "text",
                  "id": "workhead"
              },
              {
                  "type": "text",
                  "id": "grade"
              },
              {
                 
  [… 1,256 chars cut …]
  ws4_request&X-Amz-Date=20260929T080208Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEH4aDmFwLXNvdXRoZWFzdC0xIkYwRAIgBxfy%[secret]%2FmjDILVfSvAQ7Qhf%2FipXAo%2FcTJsb
  ```

  </details>

- **Bash** — Download BCA registered contractors CSV
  
  ```
  cd /tmp/sg-sources; cat > dgs_dl.sh <<'EOF'
  #!/bin/bash
  # usage: dgs_dl.sh DATASET_ID OUTFILE
  D=$1; OUT=$2
  curl -s -m 30 "https://api-open.data.gov.sg/v1/public/api/datasets/$D/initiate-download" >/dev/null
  for i in 1 2 3 4 5 6; do
    J=$(curl -s -m 30 "https://api-open.data.gov.sg/v1/public/api/datasets/$D/poll-download")
    URL=$(echo "$J" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('data',{}).get('url',''))" 2>/dev/null)
    if [ -n "$URL" ]; then curl -s -m 120 -o "$OUT" "$URL"; echo "$D -> $OUT $(wc -c <"$OUT") bytes"; exit 0; fi
    sleep 3
  done
  echo "FAILED $D: $J"
  EOF
  chmod +x dgs_dl.sh; ./dgs_dl.sh d_dcda79be4aded5f9e769b8e23ff69b47 bca_crs_registered_contractors.csv; wc -l bca_crs_registered_contractors.csv; head -3 bca_crs_registered_contractors.csv
  ```

  <details><summary>result</summary>

  ```
  d_dcda79be4aded5f9e769b8e23ff69b47 -> bca_crs_registered_contractors.csv  3003780 bytes
     24015 bca_crs_registered_contractors.csv
  company_name,uen_no,workhead,grade,additional_info,expiry_date,building_no,street_name,unit_no,building_name,postal_code,tel_no
  #1 DESIGN STUDIO PTE. LTD.,201925566H,CR06,L1,na,01/02/2028,1085,EUNOS AVENUE 7A,#03-10,EUNOS INDUSTRIAL ESTATE,409535,84885022
  #1 DESIGN STUDIO PTE. LTD.,201925566H,FM02,L1,na,01/02/2028,1085,EUNOS AVENUE 7A,#03-10,EUNOS INDUSTRIAL ESTATE,409535,84885022
  ```

  </details>

- **Bash** — Profile BCA CRS CSV
  
  ```
  cd /tmp/sg-sources; python3 -c "
  import csv, collections
  r=list(csv.DictReader(open('bca_crs_registered_contractors.csv')))
  print('rows',len(r),'companies',len({x['uen_no'] for x in r}))
  wh=collections.Counter(x['workhead'] for x in r); print('workheads',len(wh)); print(sorted(wh.items()))
  print(collections.Counter(x['grade'] for x in r).most_common())
  print(collections.Counter(x['additional_info'] for x in r).most_common(8))
  import datetime
  ex=[datetime.datetime.strptime(x['expiry_date'],'%d/%m/%Y') for x in r if x['expiry_date']]
  print('expiry min/max',min(ex),max(ex)); print('expired before 2026-09-29:',sum(1 for e in ex if e<datetime.datetime(2026,9,29)))
  "
  ```

  <details><summary>result</summary>

  ```
  rows 24014 companies 15864
  workheads 71
  [('CR01', 2214), ('CR02', 47), ('CR03', 444), ('CR04', 69), ('CR05', 102), ('CR06', 3595), ('CR07', 502), ('CR08', 122), ('CR09', 647), ('CR10A', 7), ('CR10B', 50), ('CR11', 118), ('CR12', 60), ('CR13', 417), ('CR14', 68), ('CR15', 56), ('CR16', 296), ('CR17', 56), ('CR18', 252), ('CW01', 2049), ('CW02', 935), ('FM01', 100), ('FM02', 517), ('FM03', 287), ('FM04', 119), ('ME01', 1706), ('ME02', 395), ('ME03', 200), ('ME04', 751), ('ME05', 2600), ('ME06', 758), ('ME07', 18),
  [… 1,699 chars cut …]
  (MOH)', 8), ('FIRM IS COMMITTED TO THE ADOPTION OF PROGRESSIVE WAGE MODEL (PWM)', 8)]
  expiry min/max 2025-12-01 00:00:00 2029-02-01 00:00:00
  expired before 2026-09-29: 5475
  ```

  </details>

- **Bash** — Fetch BCA tendering limits page
  
  ```
  cd /tmp/sg-sources; U="https://www1.bca.gov.sg/growth-and-transformation/procurement/registration-of-built-environment-firms/tendering-limits/crs-fm-and-sy-registries-tendering-limits/"; curl -s -m 30 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36" -o bca_tendering_limits.html -w "HTTP %{http_code} %{size_download} %{url_effective}\n" -L "$U"; python3 - <<'EOF'
  import re,html
  s=open('/tmp/sg-sources/bca_tendering_limits.html',encoding='utf-8',errors='ignore').read()
  print(len(s), s.count('<table'))
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S)
  t=re.sub(r'<(tr)[^>]*>','\n',t); t=re.sub(r'<t[dh][^>]*>',' | ',t); t=re.sub(r'<[^>]+>','',t); t=html.unescape(t)
  t=re.sub(r'[ \t\r]+',' ',t); t=re.sub(r'\n\s*\n+','\n',t)
  i=t.find('Tendering'); print(t[i:i+6000])
  EOF
  ```

  <details><summary>result</summary>

  ```
  HTTP 200 664801 https://www1.bca.gov.sg/growth-and-transformation/procurement/registration-of-built-environment-firms/tendering-limits/crs-fm-and-sy-registries-tendering-limits/
  664785 5
  Tendering Limits for Contractors, Facilities Management Companies, Suppliers, and ConsultantsCRS, FM, and SY Registries tendering limitsCRS, FM, and SY Registries tendering limitsContractors Registration System (CRS), Facilities Management (FM), and Suppliers (SY) Registry tendering limits by registration grade. Find eligibility
  [… 2,327 chars cut …]
  Vulnerability (opens in new tab)Privacy StatementTerms of UseREACH (opens in new tab)Made with Isomer (opens in new tab)Built by Open Government Products (opens in new tab)
  ```

  </details>

- **Bash** — Find BCA directory and workhead links
  
  ```
  cd /tmp/sg-sources; grep -o -E 'href="[^"]*(directory|Directory|workhead|crs|contractors-registration)[^"]*"' bca_tendering_limits.html | sort -u | head -30
  ```

  <details><summary>result</summary>

  ```
  href="/growth-and-transformation/procurement/registration-of-built-environment-firms/contractors-registration-system-crs/"
  href="https://www.bca.gov.sg/eBACS/bca_directory"
  href="https://www1.bca.gov.sg/growth-and-transformation/procurement/registration-of-built-environment-firms/tendering-limits/crs-fm-and-sy-registries-tendering-limits/"
  ```

  </details>

- **Bash** — Fetch BCA CRS page and e-Directory
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"; curl -s -m 30 -A "$UA" -L -o bca_crs_page.html -w "HTTP %{http_code} %{size_download}\n" "https://www1.bca.gov.sg/growth-and-transformation/procurement/registration-of-built-environment-firms/contractors-registration-system-crs/"; grep -o -E 'href="[^"]*"' bca_crs_page.html | grep -i -E 'workhead|crs|pdf|xlsx' | sort -u | head -40; curl -s -m 30 -A "$UA" -L -o bca_directory.html -w "eBACS HTTP %{http_code} %{size_download} %{url_effective}\n" "https://www.bca.gov.sg/eBACS/bca_directory"; head -c 1500 bca_directory.html
  ```

  <details><summary>result</summary>

  ```
  HTTP 200 582792
  href="/growth-and-transformation/procurement/registration-of-built-environment-firms/list-of-firms-registered-in-pspc-crs-fmsy-registries/"
  href="/growth-and-transformation/procurement/registration-of-built-environment-firms/tendering-limits/crs-fm-and-sy-registries-tendering-limits/"
  href="https://chat.vica.gov.sg/bca-ask-bca?vica-url-launch-event=Workhead_Recommender"
  href="https://go.gov.sg/crs-bls-update-director-and-resigned-personnel"
  href="https://go.gov.sg/crs-personnel-checker"
  [… 2,348 chars cut …]
  class="btn-close btn-close-white" data-bs-toggle="collapse" data-bs-target="#collapse-maintenance" aria-expanded="false" aria-controls="collapse-maintenance" style="
  ```

  </details>

- **Bash** — Fetch BCA list-of-firms page and directory links
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"; curl -s -m 30 -A "$UA" -L -o bca_list_firms.html -w "HTTP %{http_code} %{size_download}\n" "https://www1.bca.gov.sg/growth-and-transformation/procurement/registration-of-built-environment-firms/list-of-firms-registered-in-pspc-crs-fmsy-registries/"; grep -o -E 'href="[^"]*(\.xlsx|\.xls|\.csv|\.pdf|data\.gov|go\.gov)[^"]*"' bca_list_firms.html | sort -u; python3 - <<'EOF'
  import re,html
  s=open('/tmp/sg-sources/bca_list_firms.html',encoding='utf-8',errors='ignore').read()
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
  i=t.find('Last updated'); print(t[i:i+2500])
  EOF
  grep -o -E '(action|href|src|url)[=:] *"[^"]*"' bca_directory.html | grep -v -E 'css|fonts|\.png|\.svg' | sort -u | head -40
  ```

  <details><summary>result</summary>

  ```
  HTTP 200 447355
  href="https://go.gov.sg/report-vulnerability"
  Last updated on 12 March 2026 On this page BCA e-Directory PSPC Listing Additional resources This page provides centralised access to the various registries of firms in the Built Environment sector. BCA e-Directory Through the BCA e-Directory, you can search for: Contractors Registration System (CRS)-registered firms across various workheads and grades Facilities Management (FM) firms registered under different FM Registry workheads Suppliers registered
  [… 2,352 chars cut …]
  src="/eBACS/BCA_DIRECTORY/Content/Icon/telegram.jpg"
  src="/eBACS/BCA_DIRECTORY/Content/Icon/youtube.jpg"
  src="/eBACS/BCA_DIRECTORY/Scripts/global.js"
  ```

  </details>

- **Bash** — Probe BCA e-Directory workhead filter page
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"; curl -s -m 30 -A "$UA" -c bca_cookies.txt -b bca_cookies.txt -L -o bca_dir_filter_mne.html -w "HTTP %{http_code} %{size_download}\n" "https://www.bca.gov.sg/eBACS/BCA_DIRECTORY/Filter/FilterWorkHeadType?contractorType=registered-contractors&tradeType=mechanical-electrical"; python3 - <<'EOF'
  import re,html
  s=open('/tmp/sg-sources/bca_dir_filter_mne.html',encoding='utf-8',errors='ignore').read()
  print(re.findall(r'(?:action|href|url|data-url)\s*[=:]\s*["\']([^"\']*(?:Search|Result|Filter|api|Api)[^"\']*)',s)[:30])
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
  i=t.find('ME01'); print(t[max(0,i-300):i+1500])
  print([m for m in re.findall(r'<script[^>]*>(.*?)</script>',s,flags=re.S) if 'ajax' in m or 'url' in m][:3])
  EOF
  ```

  <details><summary>result</summary>

  ```
  HTTP 200 56683
  ['https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&display=swap', '/eBACS/BCA_DIRECTORY/Filter/FilterWorkHeadType?contractorType=registered-contractors&amp;tradeType=construction', '/eBACS/BCA_DIRECTORY/Filter/FilterWorkHeadType?contractorType=registered-contractors&amp;tradeType=construction-related', '/eBACS/BCA_DIRECTORY/Filter/FilterWorkHeadType?contractorType=registered-contractors&amp;tradeType=mechanical-electrical',
  [… 2,425 chars cut …]
  +\n                \'?searchKey=\' + encodeURIComponent(SearchString);\n                }\n\n\n\n\n            }\n\n\n\n    });\n    ']
  ```

  </details>

- **Bash** — Probe BCA directory JSON and grade listing
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"; curl -s -m 30 -A "$UA" -c bca_cookies.txt -b bca_cookies.txt -H "X-Requested-With: XMLHttpRequest" -H "Accept: application/json" -o bca_dir_searchcompanies.json -w "HTTP %{http_code} %{size_download} %{content_type}\n" "https://www.bca.gov.sg/eBACS/BCA_DIRECTORY/Utility/SearchCompanies?searchKey=NCS"; head -c 800 bca_dir_searchcompanies.json; echo; curl -s -m 60 -A "$UA" -c bca_cookies.txt -b bca_cookies.txt -o bca_dir_ME04_L6.html -w "HTTP %{http_code} %{size_download}\n" "https://www.bca.gov.sg/eBACS/BCA_DIRECTORY/Filter/GetCRSCompaniesByGrade?workhead=ME04&title=Communication%20%26%20Security%20Systems&grade=L6"; python3 - <<'EOF'
  import re,html
  s=open('/tmp/sg-sources/bca_dir_ME04_L6.html',encoding='utf-8',errors='ignore').read()
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
  i=t.find('Communication & Security'); print(t[i:i+1500])
  print(re.findall(r'href="([^"]*(?:Detail|Company|uen)[^"]*)"',s,flags=re.I)[:5])
  EOF
  ```

  <details><summary>result</summary>

  ```
  HTTP 200 208 application/json; charset=utf-8
  [{"companyName":"NCS COMMUNICATIONS ENGINEERING PTE. LTD.","uenNo":"199603123G"},{"companyName":"NCS PTE. LTD.","uenNo":"198101793G"},{"companyName":"NCS WASTE MANAGEMENT (S) PTE. LTD.","uenNo":"200107102M"}]
  HTTP 200 78929
  Communication & Security Systems | Building And Construction Authority (BCA) Government officials will NEVER ask you to transfer money or disclose bank log-in details over a phone call. Call the 24/7 ScamShield Helpline at 1799 or visit
  [… 1,455 chars cut …]
  '/eBACS/BCA_DIRECTORY/Company/CompanyDetails?uenNo=200501189G', '/eBACS/BCA_DIRECTORY/Company/CompanyDetails?uenNo=199001878M']
  ```

  </details>

- **Bash** — Fetch BCA directory company details page
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"; curl -s -m 30 -A "$UA" -c bca_cookies.txt -b bca_cookies.txt -o bca_dir_company_198101793G.html -w "HTTP %{http_code} %{size_download}\n" "https://www.bca.gov.sg/eBACS/BCA_DIRECTORY/Company/CompanyDetails?uenNo=198101793G"; python3 - <<'EOF'
  import re,html
  s=open('/tmp/sg-sources/bca_dir_company_198101793G.html',encoding='utf-8',errors='ignore').read()
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<(tr|br|div)[^>]*>','\n',t); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'[ \t]+',' ',t)); t=re.sub(r'\n\s*\n+','\n',t)
  i=t.find('NCS PTE'); print(t[i:i+2500])
  EOF
  ```

  <details><summary>result</summary>

  ```
  HTTP 200 41850
  NCS PTE. LTD. 
   UEN: 198101793G
   5 ANG MO KIO STREET 62 NCS HUB SINGAPORE 569141
   [phone] 
   NIL
   Tendering Limit 
   Find out more about the tendering limits 
   Check 
   Registered Contractors 
   Workhead 
   Description 
   Grade 
   Expiry Date 
   ME02 
  Building Automation, Industrial & Process Control Systems 
   Building Automation, Industrial & Process Control Systems 
   L1 
   01/04/2029 
   ME04 
  Communication & Security Systems 
   Communication & Security Systems 
   L5 
   01/04/2029 
   The Building and Construction
  [… 442 chars cut …]
  Us
   Feedback
   FAQS
   Reach 
   Report Vulnerability 
   Privacy Statement 
   Terms of Use 
   Sitemap 
   © 2026 Building and Construction Authority.
   Last Updated: 01 January 2026
  ```

  </details>

- **Bash** — Compare CSV vs live directory; check collection fetch
  
  ```
  cd /tmp/sg-sources; grep -E "198101793G|199603321N" bca_crs_registered_contractors.csv; ls -la; cat /private/tmp/claude-501/-Users-teddy--universe-sessions-529c67bc-baf4-434e-a6d1-a7855631d0a5/7142f416-4f85-496d-ae13-524a650d7452/tasks/bn8ngnho6.output
  ```

  <details><summary>result</summary>

  ```
  AEQON TJ PTE LTD,199603321N,ME04,L6,na,01/07/2027,8,ALJUNIED AVE 3,na,THE PULSE,389933,69571111
  NCS PTE. LTD.,198101793G,ME02,L1,na,01/04/2026,5,ANG MO KIO STREET 62,na,NCS HUB,569141,65568000
  NCS PTE. LTD.,198101793G,ME04,L5,na,01/04/2026,5,ANG MO KIO STREET 62,na,NCS HUB,569141,65568000
  total 12216
  drwxr-xr-x@ 20 teddy  wheel      640 Sep 29 04:03 .
  drwxrwxrwt  73 root   wheel     2336 Sep 29 04:03 ..
  -rw-r--r--@  1 teddy  wheel      450 Sep 29 04:03 bca_cookies.txt
  -rw-r--r--@  1 teddy  wheel     3001 Sep 29 04:02
  [… 1,080 chars cut …]
  -rw-r--r--@  1 teddy  wheel   613851 Sep 29 04:01 gebiz_guidelines.pdf
  -rw-r--r--@  1 teddy  wheel    14533 Sep 29 04:01 gsr_tables_raw.json
  ```

  </details>

- **Bash** — Scrape BCA workhead code/title/grade list
  
  ```
  cd /tmp/sg-sources; cat > bca_workheads.py <<'EOF'
  import re, html, json, urllib.request, http.cookiejar, time
  UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"
  cj=http.cookiejar.CookieJar(); op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
  types=[("registered-contractors","construction"),("registered-contractors","construction-related"),("registered-contractors","mechanical-electrical"),("registered-contractors","regulatory"),("registered-contractors","trade"),("licensed-builders","general-builder"),("licensed-builders","specialist-builder"),("fm-registry","facilities-management"),("fm-registry","housekeeping-cleansing-desilting-conservancy-service"),("fm-registry","landscaping"),("fm-registry","pest-control"),("suppliers-registry","supply")]
  out={}
  for ct,tt in types:
      u=f"https://www.bca.gov.sg/eBACS/BCA_DIRECTORY/Filter/FilterWorkHeadType?contractorType={ct}&tradeType={tt}"
      req=urllib.request.Request(u,headers={"User-Agent":UA})
      s=op.open(req,timeout=30).read().decode('utf-8','ignore')
      for m in
  [… 281 chars cut …]
          if grade!="All" and grade not in e["grades"]: e["grades"].append(grade)
      time.sleep(0.5)
  json.dump(list(out.values()),open('/tmp/sg-sources/bca_workheads.json','w'),indent=1)
  print(len(out))
  for v in out.values(): print(v['code'],'|',v['title'],'|',v['registry'],'|',','.join(v['grades']))
  EOF
  python3 bca_workheads.py
  ```

  <details><summary>result</summary>

  ```
  70
  CW01 | General Building | registered-contractors | A1,A2,B1,B2,C1,C2,C3
  CW02 | Civil Engineering  | registered-contractors | A1,A2,B1,B2,C1,C2,C3
  CR01 | Minor Construction Works | registered-contractors | Single%20Grade
  CR02 | Corrosion Protection | registered-contractors | L1,L2,L3,L4,L5,L6
  CR03 | Demolition | registered-contractors | Single%20Grade
  CR04 | Fencing & Ironworks | registered-contractors | L1,L2,L3,L4,L5,L6
  CR05 | Concrete Repairs | registered-contractors | L1,L2,L3,L4,L5,L6
  CR06 | Interior Decoration
  [… 2,320 chars cut …]
  Products  | suppliers-registry | L1,L2,L3,L4,L5,L6
  SY12 | Pipes | suppliers-registry | L1,L2,L3,L4,L5,L6
  SY14 | Sanitary Products | suppliers-registry | L1,L2,L3,L4,L5,L6
  ```

  </details>

- **Bash** — Check licensed builder filter and search endpoint
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"; curl -s -m 30 -A "$UA" "https://www.bca.gov.sg/eBACS/BCA_DIRECTORY/Filter/FilterWorkHeadType?contractorType=licensed-builders&tradeType=general-builder" | grep -o -E 'href="/eBACS/BCA_DIRECTORY/Filter/[^"]+"' | head -5; curl -s -m 30 -A "$UA" "https://www.bca.gov.sg/eBACS/BCA_DIRECTORY/Search/SearchResults?searchKey=NCS" | grep -o -E 'CompanyDetails\?uenNo=[^"]+' | head
  ```

  <details><summary>result</summary>

  ```
  href="/eBACS/BCA_DIRECTORY/Filter/FilterWorkHeadType?contractorType=registered-contractors&amp;tradeType=construction"
  href="/eBACS/BCA_DIRECTORY/Filter/FilterWorkHeadType?contractorType=registered-contractors&amp;tradeType=construction-related"
  href="/eBACS/BCA_DIRECTORY/Filter/FilterWorkHeadType?contractorType=registered-contractors&amp;tradeType=mechanical-electrical"
  href="/eBACS/BCA_DIRECTORY/Filter/FilterWorkHeadType?contractorType=registered-contractors&amp;tradeType=regulatory"
  href="/eBACS/BCA_DIRECTORY/Filter/FilterWorkHeadType?contractorType=registered-contractors&amp;tradeType=trade"
  CompanyDetails?uenNo=199603123G
  CompanyDetails?uenNo=198101793G
  CompanyDetails?uenNo=200107102M
  ```

  </details>

- **Bash** — Probe GoBusiness with browser headers
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; for u in "https://www.gobusiness.gov.sg/" "https://www.gobusiness.gov.sg/licences/" "https://licensing.gobusiness.gov.sg/" "https://www.gobusiness.gov.sg/robots.txt"; do curl -s -m 30 -A "$UA" -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" -H "Accept-Language: en-US,en;q=0.9" -o /dev/null -w "$u HTTP %{http_code} %{size_download} -> %{redirect_url}\n" "$u"; done
  ```

  <details><summary>result</summary>

  ```
  https://www.gobusiness.gov.sg/ HTTP 200 97434 -> 
  https://www.gobusiness.gov.sg/licences/ HTTP 308 9 -> https://www.gobusiness.gov.sg/licences
  https://licensing.gobusiness.gov.sg/ HTTP 200 89258 -> 
  https://www.gobusiness.gov.sg/robots.txt HTTP 200 66 ->
  ```

  </details>

- **Bash** — Fetch GoBusiness robots and licence pages
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; H=(-A "$UA" -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" -H "Accept-Language: en-US,en;q=0.9"); curl -s -m 30 "${H[@]}" https://www.gobusiness.gov.sg/robots.txt | tee gobiz_robots.txt; echo; curl -s -m 30 "${H[@]}" https://licensing.gobusiness.gov.sg/robots.txt | tee gobiz_licensing_robots.txt; echo; curl -s -m 30 "${H[@]}" -L -o gobiz_licences.html -w "HTTP %{http_code} %{size_download}\n" https://www.gobusiness.gov.sg/licences; curl -s -m 30 "${H[@]}" -o gobiz_licensing_home.html https://licensing.gobusiness.gov.sg/; grep -o -E '<script[^>]+src="[^"]+"' gobiz_licensing_home.html | head -20; grep -o -E '__NEXT_DATA__|window\.__[A-Z_]+' gobiz_licensing_home.html | sort | uniq -c
  ```

  <details><summary>result</summary>

  ```
  User-Agent: *
  
  Sitemap: https://www.gobusiness.gov.sg/sitemap.xml
  
  User-Agent: *
  
  Sitemap: https://licensing.gobusiness.gov.sg/sitemap_index.xml
  
  HTTP 200 89358
  <script src="/_next/static/chunks/81779b5b-ebcac68f045bef6f.js"
  <script src="/_next/static/chunks/497-c79291ef8c63ab22.js"
  <script src="/_next/static/chunks/main-app-f0b8c4478d300a6f.js"
  <script src="/_next/static/chunks/b902a2fa-9dd426c65bb7a523.js"
  <script src="/_next/static/chunks/cd24890f-381ebea1b6fd4bc7.js"
  <script
  [… 814 chars cut …]
  <script src="/_next/static/chunks/polyfills-42372ed130431b0a.js"
  <script src="/_next/static/chunks/webpack-8c4ed7a3ec37fd90.js"
  ```

  </details>

- **Bash** — Fetch GoBusiness sitemaps
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; H=(-A "$UA" -H "Accept-Language: en-US,en;q=0.9"); curl -s -m 30 "${H[@]}" https://licensing.gobusiness.gov.sg/sitemap_index.xml | tee gobiz_licensing_sitemap_index.xml | head -30; echo; curl -s -m 30 "${H[@]}" https://www.gobusiness.gov.sg/sitemap.xml -o gobiz_sitemap.xml; grep -o '<loc>[^<]*</loc>' gobiz_sitemap.xml | wc -l; grep -o '<loc>[^<]*licen[^<]*</loc>' gobiz_sitemap.xml | head -20
  ```

  <details><summary>result</summary>

  ```
  <?xml version="1.0" encoding="UTF-8"?>
  <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <sitemap>
      <loc>https://licensing.gobusiness.gov.sg/sitemap.xml</loc>
      <lastmod>2026-09-29T08:04:22.136Z</lastmod>
    </sitemap>
    <sitemap>
      <loc>https://licensing.gobusiness.gov.sg/licence-directory/sitemap/0.xml</loc>
      <lastmod>2026-09-29T08:04:22.136Z</lastmod>
    </sitemap>
  </sitemapindex>
        24
  ```

  </details>

- **Bash** — Parse GoBusiness licence directory sitemap
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; H=(-A "$UA" -H "Accept-Language: en-US,en;q=0.9"); curl -s -m 30 "${H[@]}" https://licensing.gobusiness.gov.sg/licence-directory/sitemap/0.xml -o gobiz_licence_directory_sitemap.xml; grep -o '<loc>[^<]*</loc>' gobiz_licence_directory_sitemap.xml | wc -l; grep -o '<loc>[^<]*</loc>' gobiz_licence_directory_sitemap.xml | head -8; grep -o '<loc>[^<]*</loc>' gobiz_licence_directory_sitemap.xml | sed -E 's#<loc>https://licensing.gobusiness.gov.sg/licence-directory/([^/]+)/.*#\1#' | sort | uniq -c | sort -rn | head -60; curl -s -m 30 "${H[@]}" https://licensing.gobusiness.gov.sg/sitemap.xml | grep -o '<loc>[^<]*</loc>' | head -20
  ```

  <details><summary>result</summary>

  ```
  324
  <loc>https://licensing.gobusiness.gov.sg/licence-directory/spf/security-officer-licence</loc>
  <loc>https://licensing.gobusiness.gov.sg/licence-directory/lta/taxi-drivers-vocational-licence-tdvl</loc>
  <loc>https://licensing.gobusiness.gov.sg/licence-directory/lta/private-hire-car-drivers-vocational-licence-pdvl</loc>
  <loc>https://licensing.gobusiness.gov.sg/licence-directory/lta/bus-drivers-vocational-licence-bdvl</loc>
  <loc>https://licensing.gobusiness.gov.sg/licence-directory/nea/fumigation-permit</loc>
  [… 2,015 chars cut …]
  <loc>https://licensing.gobusiness.gov.sg/faq/hs-ca-code-checker</loc>
  <loc>https://licensing.gobusiness.gov.sg/faq/id-card-training-records-for-security-officers</loc>
  ```

  </details>

- **Bash** — Fetch a GoBusiness licence detail page
  
  ```
  cd /tmp/sg-sources; grep -o '<loc>[^<]*</loc>' gobiz_licence_directory_sitemap.xml | grep -i -E 'security-agenc|cleaning|food-shop|electrical|public-entertain' ; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 30 -A "$UA" -H "Accept-Language: en-US" -o gobiz_licence_sfa_food_shop.html -w "HTTP %{http_code} %{size_download}\n" https://licensing.gobusiness.gov.sg/licence-directory/sfa/food-shop-licence; grep -o -E 'self\.__next_f\.push' gobiz_licence_sfa_food_shop.html | wc -l; python3 - <<'EOF'
  import re,html
  s=open('/tmp/sg-sources/gobiz_licence_sfa_food_shop.html',encoding='utf-8',errors='ignore').read()
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
  i=t.find('Food Shop'); print(t[i:i+3000])
  EOF
  ```

  <details><summary>result</summary>

  ```
  <loc>https://licensing.gobusiness.gov.sg/licence-directory/sfa/food-shop-licence</loc>
  <loc>https://licensing.gobusiness.gov.sg/licence-directory/nea/cleaning-business-licence</loc>
  <loc>https://licensing.gobusiness.gov.sg/licence-directory/spf/public-entertainment-licence-notification-to-the-police-for-an-event-or-activity-exempted-under-the-public-entertainments-exemptions-order</loc>
  <loc>https://licensing.gobusiness.gov.sg/licence-directory/spf/public-entertainment-licence</loc>
  [… 2,357 chars cut …]
  In-Principle Approval (IPA) will be issued. Successful applicants will be notified within 7 working days via email. Applicants may also refer to their GoBusiness for updates
  ```

  </details>

- **Bash** — Inspect Next.js RSC payload for licence fields
  
  ```
  cd /tmp/sg-sources; python3 - <<'EOF'
  import re,json
  s=open('/tmp/sg-sources/gobiz_licence_sfa_food_shop.html',encoding='utf-8',errors='ignore').read()
  chunks=re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)</script>',s,flags=re.S)
  print(len(chunks))
  full=''.join(json.loads('"'+c+'"') for c in chunks)
  open('/tmp/sg-sources/gobiz_food_shop_rsc.txt','w').write(full)
  print(len(full))
  for k in ['processingTime','processing','"fee','agency','licenceName','validity','"title"','apiUrl','https://','/api/']:
      idx=[m.start() for m in re.finditer(re.escape(k),full)][:3]
      print('==',k,len([m for m in re.finditer(re.escape(k),full)]))
      for i in idx[:2]: print('   ',full[max(0,i-150):i+250].replace('\n',' '))
  EOF
  ```

  <details><summary>result</summary>

  ```
  27
  61823
  == processingTime 0
  == processing 3
      _PERMIT","licence_id":58,"licence_index":93,"application_link_url":"https://dashboard.gobusiness.gov.sg/licence-details/food-shop-licence","estimated_processing_time":"7 working days if application is complete and in order.","application_guide_url":"$undefined","long_description":"$32","more_info_link_label":"$undefined","more_info_link_url":"$undefined","display_name":"Food Shop Licence","hide_fr
     
  [… 2,353 chars cut …]
  ivr.net/npm/@govtechsg/sgds-web-component@3.22.1/components/Masthead/index.umd.min.js"}]]}],["$","$L18",null,{"children":["$","body",null,{"className":"flex flex-co
  == /api/ 0
  ```

  </details>

- **Bash** — Extract structured licence object from RSC payload
  
  ```
  cd /tmp/sg-sources; python3 - <<'EOF'
  import re,json
  full=open('/tmp/sg-sources/gobiz_food_shop_rsc.txt').read()
  i=full.find('"licence_id"')
  # walk back to the enclosing '{'
  depth=0; j=i
  while j>0:
      c=full[j]
      if c=='}': depth+=1
      elif c=='{':
          if depth==0: break
          depth-=1
      j-=1
  # forward balanced parse using json raw_decode
  obj,end=json.JSONDecoder().raw_decode(full[j:])
  print(list(obj.keys()))
  print(json.dumps({k:(v if not isinstance(v,str) or len(v)<200 else v[:200]+'...') for k,v in obj.items()},indent=1)[:5000])
  json.dump(obj,open('/tmp/sg-sources/gobiz_licence_food_shop_object.json','w'),indent=1)
  EOF
  ```

  <details><summary>result</summary>

  ```
  ['id', 'slug', 'category', 'licence_id', 'licence_index', 'application_link_url', 'estimated_processing_time', 'application_guide_url', 'long_description', 'more_info_link_label', 'more_info_link_url', 'display_name', 'hide_from_directory', 'short_description', 'additional_search_keywords', 'application_link_label', 'estimated_completion_time', 'documents', 'additional_eligibility_requirements', 'third_parties', 'operation_type', 'allowed_user_types', 'licence_validity', 'fee_details', 'payment_required',
  [… 2,328 chars cut …]
  "New",
   "allowed_user_types": [
    "INDIVIDUAL_USER",
    "BUSINESS_USER"
   ],
   "licence_validity": "1 year",
   "fee_details": "<p>The Food Shop Licence including enter
  ```

  </details>

- **Bash** — Download GoBusiness JS chunks and grep API URLs
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 30 -A "$UA" -o gobiz_licence_directory_index.html -w "HTTP %{http_code} %{size_download}\n" https://licensing.gobusiness.gov.sg/licence-directory; grep -o -E '/_next/static/chunks/[^"]+\.js' gobiz_licence_directory_index.html gobiz_licence_sfa_food_shop.html | cut -d: -f2 | sort -u > gobiz_chunks.txt; wc -l gobiz_chunks.txt; mkdir -p gobiz_js; while read p; do curl -s -m 30 -A "$UA" -o "gobiz_js/$(basename $p)" "https://licensing.gobusiness.gov.sg$p"; done < gobiz_chunks.txt; grep -h -o -E '"(https?://[a-zA-Z0-9.-]*gobusiness[^"]*|/api/[^"]*)"' gobiz_js/*.js | sort -u | head -40; grep -h -o -E '(fetch|axios[.a-z]*)\([^)]{0,120}\)' gobiz_js/*.js | head -20
  ```

  <details><summary>result</summary>

  ```
  HTTP 200 289759
        21 gobiz_chunks.txt
  "/api/config"
  "/api/early_access_features/?token="
  "/api/product_tours/?token="
  "/api/surveys/?token="
  "/api/web_experiments/?token="
  "https://dashboard.gobusiness.gov.sg"
  "https://grants.gobusiness.gov.sg/"
  "https://licensing.gobusiness.gov.sg/"
  "https://www.gobusiness.gov.sg"
  "https://www.gobusiness.gov.sg/contact-us/?src=topnav"
  fetch(t,{cache:"no-cache",method:"POST",headers:this.getHeaders()
  fetch(r.toString()
  fetch(o,{credentials:"same-origin",headers:t,priority:r||void 0,signal:n})
  fetch(r.prefetchHref,{kind:e})
  fetch("/api/config")
  ```

  </details>

- **Bash** — Inspect licence directory index RSC payload
  
  ```
  cd /tmp/sg-sources; python3 - <<'EOF'
  import re,json
  s=open('/tmp/sg-sources/gobiz_licence_directory_index.html',encoding='utf-8',errors='ignore').read()
  chunks=re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)</script>',s,flags=re.S)
  full=''.join(json.loads('"'+c+'"') for c in chunks)
  open('/tmp/sg-sources/gobiz_directory_rsc.txt','w').write(full)
  print(len(full))
  for k in ['"slug"','licence_id','display_name','agency','"name"','total']:
      print(k, full.count(k))
  i=full.find('"slug"'); print(full[i-400:i+800])
  EOF
  ```

  <details><summary>result</summary>

  ```
  60798
  "slug" 0
  licence_id 0
  display_name 71
  agency 2
  "name" 15
  total 1
  ```

  </details>

- **Bash** — Show licence directory RSC context
  
  ```
  cd /tmp/sg-sources; python3 - <<'EOF'
  full=open('/tmp/sg-sources/gobiz_directory_rsc.txt').read()
  import re
  for k in ['display_name','total','agency']:
      for m in list(re.finditer(k,full))[:2]:
          i=m.start(); print('==',k, full[max(0,i-300):i+400].replace('\n',' ')); print()
  EOF
  ```

  <details><summary>result</summary>

  ```
  == display_name semibold text-type-color-label-dark","children":"Filter"}],["$","$L2f",null,{}]]}],["$","$L30",null,{"type":"multiple","accordionType":"default","defaultValue":["agencyIds","sectors","userTypes"],"children":["$L31",["$","$L32",null,{"fieldName":"sectors","facet":[{"value":"Utilities & Environment","display_name":"Utilities & Environment"},{"value":"Telecommunication Infrastructure","display_name":"Telecommunication Infrastructure"},{"value":"Food & Beverage","display_name":"Food &
  [… 2,320 chars cut …]
  Food Agency (SFA)"},{"value":6,"display_name":"Animal & Veterinary Service (AVS)"},{"value":59,"display_name":"Singapore Customs (Singapore Custo
  ```

  </details>

- **Bash** — Fetch GoBusiness licence page as RSC flight
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 30 -A "$UA" -H "RSC: 1" -o gobiz_security_agency.rsc -w "HTTP %{http_code} %{size_download} %{content_type}\n" https://licensing.gobusiness.gov.sg/licence-directory/spf/security-agency-licence; head -c 300 gobiz_security_agency.rsc; echo; grep -c licence_id gobiz_security_agency.rsc
  ```

  <details><summary>result</summary>

  ```
  HTTP 200 40039 text/x-component
  1:"$Sreact.fragment"
  4:I[5341,[],""]
  5:I[25,[],""]
  8:I[5104,[],"OutletBoundary"]
  a:I[7158,[],"AsyncMetadataOutlet"]
  c:I[5104,[],"ViewportBoundary"]
  e:I[5104,[],"MetadataBoundary"]
  f:"$Sreact.suspense"
  11:I[9780,["3835","static/chunks/app/licence-directory/layout-0c142fd11e0f705a.js"],"default"]
  12:I
  1
  ```

  </details>

- **Bash** — Write and test GoBusiness licence scraper
  
  ```
  cd /tmp/sg-sources; cat > gobiz_scrape.py <<'EOF'
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
  [… 1,219 chars cut …]
              else: fail+=1; print('NOOBJ',u,flush=True)
          except Exception as e:
              fail+=1; print('ERR',u,e,flush=True)
          time.sleep(1.0)
      print('ok',ok,'fail',fail)
  EOF
  python3 gobiz_scrape.py 2 && head -c 3000 gobiz_licences.jsonl | python3 -c "import sys,json; o=json.loads(sys.stdin.readline()); print({k:(str(v)[:150]) for k,v in o.items()})"
  ```

  <details><summary>error</summary>

  ```
  Exit code 1
  ok 2 fail 0
  Traceback (most recent call last):
    File "<string>", line 1, in <module>
    File "/Applications/Xcode-26.6.0.app/Contents/Developer/Library/Frameworks/Python3.framework/Versions/3.9/lib/python3.9/json/__init__.py", line 346, in loads
      return _default_decoder.decode(s)
    File "/Applications/Xcode-26.6.0.app/Contents/Developer/Library/Frameworks/Python3.framework/Versions/3.9/lib/python3.9/json/decoder.py", line 337, in decode
      obj, end = self.raw_decode(s, idx=_w(s, 0).end())
    File
  [… 134 chars cut …]
  line 353, in raw_decode
      obj, end = self.scan_once(s, idx)
  json.decoder.JSONDecodeError: Unterminated string starting at: line 1 column 2994 (char 2993)
  ```

  </details>

- **Bash** — Show first scraped licence records
  
  ```
  cd /tmp/sg-sources; python3 -c "
  import json
  for l in open('gobiz_licences.jsonl'):
      o=json.loads(l); print({k:(str(v)[:160]) for k,v in o.items()}); print()
  "
  ```

  <details><summary>result</summary>

  ```
  {'id': 'ec574a1e-c1f1-4696-b966-734a5f4bbf49', 'slug': 'security-officer-licence', 'category': 'LICENCE_PERMIT', 'licence_id': '221', 'licence_index': '99', 'application_link_url': 'https://dashboard.gobusiness.gov.sg/licence-details/security-officer-licence', 'estimated_processing_time': '3 - 4 weeks', 'application_guide_url': 'None', 'long_description': '<p>A "security officer" means any individual who, for reward, carries out any of the following functions:</p>\n<ol>\n<li>patrolling or guarding another person\'s p',
  [… 2,320 chars cut …]
  '3', 'industry_sector': "['Land Transport Infrastructure']", '_url': 'https://licensing.gobusiness.gov.sg/licence-directory/lta/taxi-drivers-vocational-licence-tdvl'}
  ```

  </details>

- **Bash** — Scrape all 324 GoBusiness licence pages
  
  ```
  cd /tmp/sg-sources; python3 gobiz_scrape.py > gobiz_scrape.log 2>&1; tail -3 gobiz_scrape.log; wc -l gobiz_licences.jsonl
  ```

  <details><summary>result</summary>

  ```
  Command running in background with ID: bcflxiqz0. Output is being written to: /private/tmp/claude-501/-Users-teddy--universe-sessions-529c67bc-baf4-434e-a6d1-a7855631d0a5/7142f416-4f85-496d-ae13-524a650d7452/tasks/bcflxiqz0.output. You will be notified when it completes. To check interim output, use Read on that file path.
  Session cwd remains ~/.universe/sessions/529c67bc-baf4-434e-a6d1-a7855631d0a5; directory changes made by the backgrounded command do not apply to subsequent commands.
  ```

  </details>

- **Bash** — Extract GoBusiness agency id map; check collections
  
  ```
  cd /tmp/sg-sources; python3 - <<'EOF'
  import re,json
  full=open('/tmp/sg-sources/gobiz_directory_rsc.txt').read()
  i=full.find('"fieldName":"agencyIds","facet":')
  obj,_=json.JSONDecoder().raw_decode(full[i+len('"fieldName":"agencyIds","facet":'):])
  m={o['value']:o['display_name'] for o in obj}
  json.dump(m,open('/tmp/sg-sources/gobiz_agency_ids.json','w'),indent=1)
  print(len(m)); print(m)
  EOF
  cat /private/tmp/claude-501/-Users-teddy--universe-sessions-529c67bc-baf4-434e-a6d1-a7855631d0a5/7142f416-4f85-496d-ae13-524a650d7452/tasks/bn8ngnho6.output
  ```

  <details><summary>result</summary>

  ```
  42
  {21: 'Infocomm Media Development Authority (IMDA)', 41: 'Singapore Police Force (SPF)', 34: 'National Environment Agency (NEA)', 39: 'Singapore Food Agency (SFA)', 6: 'Animal & Veterinary Service (AVS)', 59: 'Singapore Customs (Singapore Customs)', 24: 'Monetary Authority of Singapore (MAS)', 3: 'Land Transport Authority (LTA)', 30: 'Maritime and Port Authority (MPA)', 38: 'Singapore Civil Defence Force (SCDF)', 9: 'Civil Aviation Authority of Singapore (CAAS)', 12: 'Cyber Security Agency of Singapore (CSA)', 28:
  [… 1,070 chars cut …]
  (MHA)', 35: 'Professional Engineers Board (PEB)', 19: 'Hotels Licensing Board (HLB)', 4: 'Ministry of Education (MOE)', 25: 'Ministry of Culture, Community and Youth (MCCY)'}
  ```

  </details>

- **Bash** — Fetch GoBusiness terms of use
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; for u in https://www.gobusiness.gov.sg/terms-of-use/ https://www.gobusiness.gov.sg/terms-of-use; do curl -s -m 30 -A "$UA" -L -o gobiz_terms.html -w "$u HTTP %{http_code} %{size_download}\n" "$u"; done; python3 - <<'EOF'
  import re,html
  s=open('/tmp/sg-sources/gobiz_terms.html',encoding='utf-8',errors='ignore').read()
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
  for k in ['reproduc','copyright','Copyright','permission','commercial','hyperlink','automated','scrap','crawl']:
      for m in list(re.finditer(k,t))[:2]:
          print('==',k,':',t[max(0,m.start()-200):m.start()+350]); print()
  EOF
  ```

  <details><summary>result</summary>

  ```
  https://www.gobusiness.gov.sg/terms-of-use/ HTTP 200 192320
  https://www.gobusiness.gov.sg/terms-of-use HTTP 200 192320
  == reproduc : set out in Clause 6.1. “ Website ” has the meaning set out in Clause 1.1. “ Your Content ” has the meaning set out in Clause 7.1. 2.2 The words “written” and “in writing” include any means of visible reproduction. 2.3 The headings are for convenience of reference only and shall not be taken into consideration for the purpose of interpretation. 2.4 References to a “person” include any
  [… 2,325 chars cut …]
  or    (iii) introduce security vulnerabilities to any Service, any Account or any Device of any other persons; (j) access or use the Services in any manner that could dam
  ```

  </details>

- **Bash** — Fetch BCA and GeBIZ terms of use
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 30 -A "$UA" -L -o bca_terms.html -w "HTTP %{http_code} %{size_download}\n" https://www1.bca.gov.sg/terms-of-use; curl -s -m 30 -A "$UA" -L -o gebiz_terms.html -w "gebiz HTTP %{http_code} %{size_download}\n" "https://www.gebiz.gov.sg/terms-of-use.html"; python3 - <<'EOF'
  import re,html
  for f in ['bca_terms.html','gebiz_terms.html']:
      s=open('/tmp/sg-sources/'+f,encoding='utf-8',errors='ignore').read()
      t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
      print('#####',f,len(t))
      for k in ['reproduc','Copyright','copyright']:
          for m in list(re.finditer(k,t))[:2]:
              print('==',k,':',t[max(0,m.start()-250):m.start()+400]); print()
  EOF
  ```

  <details><summary>result</summary>

  ```
  HTTP 200 453538
  gebiz HTTP 200 74195
  ##### bca_terms.html 7217
  == reproduc : n etc. Any commercial/financial information or trade secrets submitted to BCA will not be shared with third parties without your prior consent. Restrictions on use of Materials Except as otherwise provided, the Contents of this Web Site shall not be reproduced, republished, uploaded, posted, transmitted or otherwise distributed in any way, without the prior written permission of BCA. Modification of any of the Contents or use of the Contents
  [… 2,323 chars cut …]
  and Liability 7. The Contents of this Web Site are provided on an "as is" basis without warranties of any kind. To the fullest extent permitted by law, DSTA does not war
  ```

  </details>

- **Bash** — Check progress; fetch data.gov.sg licence
  
  ```
  ps aux | grep -E "fetch_colls|gobiz_scrape" | grep -v grep | awk '{print $2, $10, $12, $13}'; wc -l /tmp/sg-sources/gobiz_licences.jsonl; cd /tmp/sg-sources; curl -s -m 30 -A "Mozilla/5.0" -o dgs_licence.html -w "HTTP %{http_code} %{size_download}\n" https://data.gov.sg/open-data-licence; python3 - <<'EOF'
  import re,html
  s=open('/tmp/sg-sources/dgs_licence.html',encoding='utf-8',errors='ignore').read()
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
  i=t.find('Open Data Licence'); print(t[i:i+1800])
  EOF
  ```

  <details><summary>result</summary>

  ```
  61792 0:00.24 gobiz_scrape.py 
  61789 0:00.00 -c source
  58404 0:00.39 fetch_colls.py 
  58401 0:00.00 -c source
        15 /tmp/sg-sources/gobiz_licences.jsonl
  HTTP 200 97021
  Open Data Licence Privacy & Terms Open data licence Acceptance and grant of Licence By Using (as defined below) the datasets on the Relevant Websites, you agree to the terms of this Licence. The Agency grants you a worldwide, perpetual, royalty-free, non-exclusive licence to Use the datasets, subject to the terms of this Licence. What you can do You
  [… 1,279 chars cut …]
  of access of dataset} from {source of data} which is made available under the terms of the Singapore Open Data Licence version 1.0 {URL link to licence}]* Disclaimers The
  ```

  </details>

- **WebSearch** `{"query": "data.gov.sg licensed cleaning businesses NEA dataset"}`

- **WebSearch** `{"query": "data.gov.sg \"security agencies\" licensed dataset police licensing"}`

  <details><summary>result</summary>

  ```
  Web search results for query: "data.gov.sg licensed cleaning businesses NEA dataset"
  
  Links: [{"title":"List of Cleaning Contractors and Location of Work | NEA | data.gov.sg","url":"https://data.gov.sg/datasets/d_8383572bdfd37d3586933c3ff5ec1922/view"},{"title":"List of NEA Licensed Eating Establishments with Grades, Demerit Points and Suspension History-Data.gov.sg","url":"https://data.gov.sg/dataset/list-of-nea-licensed-eating-establishments-with-grades-demerit-points-and-suspension-history"},{"title":"List of NEA
  [… 1,615 chars cut …]
  operating in Singapore and their work locations, maintained by the NEA.
  
  
  REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.
  ```

  </details>

  <details><summary>result</summary>

  ```
  Web search results for query: "data.gov.sg "security agencies" licensed dataset police licensing"
  
  Links: [{"title":"Singapore Open Data Licence-Data.gov.sg","url":"https://data.gov.sg/open-data-licence"},{"title":"Total Number Of Persons Holding Qualified Driving Licence | SPF | data.gov.sg","url":"https://data.gov.sg/datasets/d_c043f1858d5fc5a1930cdda165590a33/view"},{"title":"Singapore Police Force Establishments | SPF | data.gov.sg","url":"https://data.gov.sg/datasets/d_c69e6d27d72f765fabfbeea362299378/view"},{"titl
  [… 2,039 chars cut …]
  contact the relevant government agencies for more detailed information.
  
  
  REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.
  ```

  </details>

- **WebSearch** `{"query": "police.gov.sg list of licensed security agencies PLRD SAGE grading results download"}`

- **WebSearch** `{"query": "data.gov.sg \"Entities Registered with ACRA\" dataset d_"}`

  <details><summary>result</summary>

  ```
  Web search results for query: "police.gov.sg list of licensed security agencies PLRD SAGE grading results download"
  
  Links: [{"title":"Enhancements to Security Agency Grading Exercise and Protection for Private Security Officers | Ministry of Home Affairs","url":"https://www.mha.gov.sg/media-room/newsroom/enhancements-to-security-agency-grading-exercise-and-protection-for-private-security-officers/"},{"title":"Security Agencies Grading Exercise 2017 to 2019 Result (
  [… 2,372 chars cut …]
  these documents and lists directly from the police.gov.sg website.
  
  
  REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.
  ```

  </details>

  <details><summary>result</summary>

  ```
  Web search results for query: "data.gov.sg "Entities Registered with ACRA" dataset d_"
  
  Links: [{"title":"Entities Registered with ACRA | ACRA | data.gov.sg","url":"https://data.gov.sg/datasets/d_3f960c10fed6145404ca7b821f263b87/view"},{"title":"data.gov.sg","url":"https://data.gov.sg/datasets?agencies=Accounting+and+Corporate+Regulatory+Authority+(ACRA)&[secret]"},{"title":"ACRA's Open Data Initiative - Singapore","url":"https://www.acra.gov.sg/about-bizfile/updates-and-announcements/acra-s-open-data-initiative"},{"tit
  [… 1,877 chars cut …]
  https://data.gov.sg/datasets/d_3f960c10fed6145404ca7b821f263b87/view
  
  
  REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.
  ```

  </details>

- **Bash** — Probe candidate data.gov.sg datasets
  
  ```
  cd /tmp/sg-sources; cat > dgs_probe.py <<'EOF'
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
  EOF
  python3 dgs_probe.py d_8383572bdfd37d3586933c3ff5ec1922 d_227473e811b09731e64725f140b77697 d_3f960c10fed6145404ca7b821f263b87
  ```

  <details><summary>result</summary>

  ```
  {
   "d_8383572bdfd37d3586933c3ff5ec1922": {
    "name": "List of Cleaning Contractors and Location of Work",
    "managedBy": "National Environment Agency",
    "format": "CSV",
    "lastUpdatedAt": "2024-06-06T14:45:40+08:00",
    "coverageStart": "2014-09-01T08:00:00+08:00",
    "coverageEnd": "2020-03-31T08:00:00+08:00",
    "size": 1004,
    "collectionIds": [
     "1384"
    ],
    "total": 5,
    "fields": [
     "cleansvcpr",
     "email_add",
     "contact",
     "zone",
     "remark"
    ],
    "sample": {
     "_id": 1,
     "cleansvcpr": "Chye Thiam
  [… 1,923 chars cut …]
     "entity_type_desc": "Local Company",
     "uen_issue_date": "2012-01-26",
     "reg_street_name": "BENCOOLEN STREET",
     "reg_postal_code": "189648"
    },
    "err": null
   }
  }
  ```

  </details>

- **Bash** — Look up a UEN in ACRA dataset via API
  
  ```
  cd /tmp/sg-sources; curl -s -m 60 -G "https://data.gov.sg/api/action/datastore_search" --data-urlencode "resource_id=d_3f960c10fed6145404ca7b821f263b87" --data-urlencode 'filters={"uen":"198101793G"}' -o acra_lookup_198101793G.json; cat acra_lookup_198101793G.json | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['result'].get('total'),d['result']['records'])"; ls -la /tmp/sg-sources/dgs_collections_all.json 2>/dev/null
  ```

  <details><summary>error</summary>

  ```
  Exit code 1
  1 [{'_id': 332809, 'uen': '198101793G', 'issuance_agency_desc': 'ACRA', 'uen_status_desc': 'Registered', 'entity_name': 'NCS PTE. LTD.', 'entity_type_desc': 'Local Company', 'uen_issue_date': '1981-04-23', 'reg_street_name': 'ANG MO KIO STREET 62', 'reg_postal_code': '569141'}]
  ```

  </details>

- **Bash** — Fetch ACRA collection metadata
  
  ```
  cd /tmp/sg-sources; curl -s -m 30 "https://api-production.data.gov.sg/v2/public/api/collections/1/metadata" -o dgs_collection_1.json; python3 -c "
  import json;d=json.load(open('dgs_collection_1.json'))['data']['collectionMetadata'];print(d['name'],d['lastUpdatedAt'],len(d['childDatasets']));print(d['childDatasets'][:40])"
  ```

  <details><summary>result</summary>

  ```
  Registered Entities with Unique Entity Number 2026-09-15T18:04:03+08:00 2
  ['d_3f960c10fed6145404ca7b821f263b87', 'd_b1d2b840ab9e993570c037b706b39bb8']
  ```

  </details>

- **WebSearch** `{"query": "data.gov.sg \"ACRA Information on Corporate Entities\" SSIC dataset"}`

- **Bash** — Probe second ACRA dataset
  
  ```
  cd /tmp/sg-sources; python3 dgs_probe.py d_b1d2b840ab9e993570c037b706b39bb8 2>&1 | head -40; wc -l gobiz_licences.jsonl; ls -la dgs_collections_all.json 2>&1
  ```

  <details><summary>result</summary>

  ```
  Web search results for query: "data.gov.sg "ACRA Information on Corporate Entities" SSIC dataset"
  
  Links: [{"title":"ACRA Information on Corporate Entities ('A') | ACRA | data.gov.sg","url":"https://data.gov.sg/datasets/d_8575e84912df3c28995b8e6e0e05205a/view"},{"title":"ACRA Information on Corporate Entities ('S') | ACRA | data.gov.sg","url":"https://data.gov.sg/datasets/d_df7d2d661c0c11a7c367c9ee4bf896c1/view"},{"title":"ACRA Information on Corporate Entities ('N') | ACRA |
  [… 2,296 chars cut …]
  detailed documentation or data dictionary on the data.gov.sg website.
  
  
  REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.
  ```

  </details>

  <details><summary>error</summary>

  ```
  Exit code 1
  {
   "d_b1d2b840ab9e993570c037b706b39bb8": {
    "name": "Entities Registered with Other UEN Issuance Agencies",
    "managedBy": "Accounting and Corporate Regulatory Authority",
    "format": "CSV",
    "lastUpdatedAt": "2026-09-15T18:04:03+08:00",
    "coverageStart": "2008-08-19T08:00:00+08:00",
    "coverageEnd": "2026-09-09T08:00:00+08:00",
    "size": 3159319,
    "collectionIds": [
     "1"
    ],
    "total": 23190,
    "fields": [
     "uen",
     "issuance_agency_desc",
     "uen_status_desc",
     "entity_name",
    
  [… 378 chars cut …]
  "North Bridge Road",
     "reg_postal_code": "188778"
    },
    "err": null
   }
  }
        38 gobiz_licences.jsonl
  ls: dgs_collections_all.json: No such file or directory
  ```

  </details>

- **Bash** — Probe ACRA Corporate Entities A dataset
  
  ```
  cd /tmp/sg-sources; python3 dgs_probe.py d_8575e84912df3c28995b8e6e0e05205a 2>&1 | python3 -c "
  import sys,json; t=sys.stdin.read(); d=json.loads(t); v=list(d.values())[0]; print({k:v[k] for k in ['name','lastUpdatedAt','coverageEnd','size','total','collectionIds']}); print(v['fields']); print(v['sample'])"
  ```

  <details><summary>result</summary>

  ```
  {'name': "ACRA Information on Corporate Entities ('A')", 'lastUpdatedAt': '2026-09-16T10:00:50+08:00', 'coverageEnd': '2026-09-16T10:01:02+08:00', 'size': 57470770, 'total': 175111, 'collectionIds': ['2']}
  ['uen', 'issuance_agency_id', 'entity_name', 'entity_type_description', 'business_constitution_description', 'company_type_description', 'paf_constitution_description', 'entity_status_description', 'registration_incorporation_date', 'uen_issue_date', 'address_type', 'block', 'street_name', 'level_no', 'unit_no',
  [… 2,327 chars cut …]
  'uen_of_audit_firm3': 'na', 'name_of_audit_firm3': 'na', 'uen_of_audit_firm4': 'na', 'name_of_audit_firm4': 'na', 'uen_of_audit_firm5': 'na', 'name_of_audit_firm5': 'na'}
  ```

  </details>

- **Bash** — ACRA corporate collection and UEN lookup with SSIC
  
  ```
  cd /tmp/sg-sources; curl -s -m 30 "https://api-production.data.gov.sg/v2/public/api/collections/2/metadata" -o dgs_collection_2.json; python3 -c "
  import json;d=json.load(open('dgs_collection_2.json'))['data']['collectionMetadata'];print(d['name'],d['lastUpdatedAt'],d.get('frequency'),len(d['childDatasets']))"; curl -s -m 60 -G "https://data.gov.sg/api/action/datastore_search" --data-urlencode "resource_id=d_67e99e6eabc4aad9b5d48663b579746a" --data-urlencode 'filters={"uen":"198101793G"}' -o acra_corp_N_198101793G.json; python3 -c "
  import json;d=json.load(open('acra_corp_N_198101793G.json'));r=d['result']['records'][0];print({k:v for k,v in r.items() if v!='na'})"
  ```

  <details><summary>result</summary>

  ```
  ACRA Information on Corporate Entities 2026-09-16T10:04:13+08:00 monthly 27
  {'_id': 2266, 'uen': '198101793G', 'issuance_agency_id': 'ACRA', 'entity_name': 'NCS PTE. LTD.', 'entity_type_description': 'Local Company', 'company_type_description': 'Private Company Limited by Shares', 'entity_status_description': 'Live Company', 'registration_incorporation_date': '1981-04-23', 'uen_issue_date': '1981-04-23', 'address_type': 'LOCAL', 'block': '5', 'street_name': 'ANG MO KIO STREET 62', 'building_name': 'NCS HUB',
  [… 226 chars cut …]
  '62023', 'secondary_ssic_description': 'COMPUTER SYSTEMS INTEGRATION SERVICES (63192)', 'no_of_officers': '54', 'former_entity_name1': 'NATIONAL COMPUTER SYSTEMS'}
  ```

  </details>

- **Bash** — Check collections fetch and rate limit
  
  ```
  ps aux | grep fetch_colls | grep -v grep | wc -l; curl -s -m 20 -o /dev/null -w "%{http_code}\n" "https://api-production.data.gov.sg/v2/public/api/collections?page=50"; curl -s -m 20 -i "https://api-production.data.gov.sg/v2/public/api/collections?page=51" | head -20
  ```

  <details><summary>result</summary>

  ```
  2
  200
  HTTP/2 200 
  date: Tue, 29 Sep 2026 08:07:36 GMT
  content-type: application/json
  content-length: 7269
  cf-ray: a4297ec43c4939b4-EWR
  cf-cache-status: DYNAMIC
  access-control-allow-origin: *
  server: cloudflare
  cf-placement: remote-SIN
  x-amz-apigw-id: Ec63aHGlyQ0EMdA=
  x-amzn-requestid: 068bbbc9-2cbb-4a12-8c38-a5bfa4c89449
  x-amzn-trace-id: Root=1-6abb71c8-36f8f42c609c630f41996cf6
  x-dgs-request-id: a4297ec43c4939b4
  strict-transport-security: max-age=[phone]; includeSubDomains
  x-content-type-options:
  [… 2,237 chars cut …]
  and Construction Authority"],"managedByAgencyName":"Building and Construction Authority","childDatasets":["d_19573c579879be15623f2e1e3854926d"]}],"pages":137},"errorMsg":""}
  ```

  </details>

- **Bash** — Fetch SPF robots and SACE page
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 30 -A "$UA" https://www.police.gov.sg/robots.txt | head -30; curl -s -m 30 -A "$UA" -L -o spf_sace_page.html -w "HTTP %{http_code} %{size_download} %{url_effective}\n" "https://www.police.gov.sg/Business-E-Services/Apply-for-Security-Agency-Licence/Information-on-Security-Agencies-Competency-Evaluation"; grep -o -E 'href="[^"]*(\.pdf|\.ashx|\.xlsx|\.csv)[^"]*"' spf_sace_page.html | sort -u | head -20
  ```

  <details><summary>result</summary>

  ```
  User-agent: *
  Disallow: /sitecore
  Disallow: /Sitecore
  Disallow: /sitecore_files/
  Disallow: /sitecore modules/
  Disallow: /App_Browsers/
  Disallow: /App_config/
  Disallow: /App_Data/
  Disallow: /temp/
  Disallow: /upload/
  Disallow: /login
  Disallow: /user/
  Disallow: /xsl/
  Disallow: /*/search
  Disallow: /search-results
  Disallow: /Search-Results
  
  
  #  Bots to disallow:
  User-agent: Rogerbot
  User-agent: Exabot
  User-agent: Dotbot
  User-agent: Gigabot
  User-agent: BlackWidow
  User-agent: ChinaClaw
  User-agent: Custo
  User-agent: DISCo
  [… 2,299 chars cut …]
  href="/-/media/SPF/Files/E-services/SACE/SACE-Resources/Webinar-on-SACE-Presentation-Materials-on-7-April-2021/SACE-PLRD-Webinar-on-7-April-21-Overview-of-SACE.pdf"
  ```

  </details>

- **Bash** — Look for SACE results link
  
  ```
  cd /tmp/sg-sources; grep -o -E 'href="[^"]*(Result|result|RESULT|grade|Grade|List|list)[^"]*"' spf_sace_page.html | sort -u | head -20; python3 - <<'EOF'
  import re,html
  s=open('/tmp/sg-sources/spf_sace_page.html',encoding='utf-8',errors='ignore').read()
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
  for k in ['Result','result','list of security agencies','grading']:
      for m in list(re.finditer(k,t))[:3]: print('==',t[max(0,m.start()-200):m.start()+300]); print()
  EOF
  ```

  <details><summary>result</summary>

  ```
  href="/-/media/SPF/Files/E-services/SACE/SACE-Assessment-Checklists/Annex-A--Administrative-Instruction-for-SACE-1-Jan-2026.pdf"
  href="/-/media/SPF/Files/E-services/SACE/SACE-Assessment-Checklists/Annex-B--Submission-Covering-Note-for-SACE-1-Jan-2026.pdf"
  href="/-/media/SPF/Files/E-services/SACE/SACE-Assessment-Checklists/Annex-C--Participation-Form-for-Electives-1-Jan-2026.pdf"
  href="/-/media/SPF/Files/E-services/SACE/SACE-Assessment-Checklists/Annex-D--Elective-Competencies-Doc-Submission-1-Jan-2026.pdf"
  [… 2,287 chars cut …]
  Results for New SAs SACE 2025 Results for New SAs SACE 2026 Results for New SAs   SACE Cycle 1 Results SACE Cycle 2 Results SACE Cycle 3 Results SACE Cycle 4 Results Share T
  ```

  </details>

- **Bash** — List SACE results links
  
  ```
  cd /tmp/sg-sources; grep -o -E 'href="[^"]*SACE-Results[^"]*"' spf_sace_page.html | sort -u; grep -o -E 'href="[^"]*Cycle-5[^"]*"' spf_sace_page.html | sort -u
  ```

  <details><summary>result</summary>

  ```
  href="/-/media/SPF/Files/E-services/SACE/SACE-Results/SACE-2022-Results-for-new-SAs-as-of-30-Dec-2022a.pdf"
  href="/-/media/SPF/Files/E-services/SACE/SACE-Results/SACE-2023-Results-for-new-SAs-as-of-25-Sep-2023.pdf"
  href="/-/media/SPF/Files/E-services/SACE/SACE-Results/SACE-2024-Results-for-new-SAs-as-of-27-Nov-2024.pdf"
  href="/-/media/SPF/Files/E-services/SACE/SACE-Results/SACE-2025-Results-for-new-SAs-as-of-26-Dec-2025.pdf"
  href="/-/media/SPF/Files/E-services/SACE/SACE-Results/SACE-2026-Results-for-new-SAs.pdf"
  [… 490 chars cut …]
  href="/-/media/SPF/Files/E-services/SACE/SACE-Results/SACE-Cycle-5-Results-as-of-7-Aug-2026.pdf"
  ```

  </details>

- **Bash** — Download and parse SACE result PDFs
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; for f in SACE-Cycle-4-Results-as-of-20-Aug-2025.pdf SACE-Cycle-5-Results-as-of-7-Aug-2026.pdf; do curl -s -m 60 -A "$UA" -o "spf_$f" -w "$f HTTP %{http_code} %{size_download} %{content_type}\n" "https://www.police.gov.sg/-/media/SPF/Files/E-services/SACE/SACE-Results/$f"; done; python3 - <<'EOF'
  import fitz
  for f in ['spf_SACE-Cycle-4-Results-as-of-20-Aug-2025.pdf','spf_SACE-Cycle-5-Results-as-of-7-Aug-2026.pdf']:
      d=fitz.open('/tmp/sg-sources/'+f); print('####',f,d.page_count)
      rows=[]
      for p in d:
          for t in p.find_tables().tables:
              rows+= [[(c or '').replace('\n',' ') for c in r] for r in t.extract()]
      print(len(rows)); 
      for r in rows[:6]: print(r)
      print(rows[-1])
  EOF
  ```

  <details><summary>result</summary>

  ```
  SACE-Cycle-4-Results-as-of-20-Aug-2025.pdf HTTP 200 295243 application/pdf
  SACE-Cycle-5-Results-as-of-7-Aug-2026.pdf HTTP 200 142768 application/pdf
  #### spf_SACE-Cycle-4-Results-as-of-20-Aug-2025.pdf 8
  269
  ['S/No.', 'Name of Company', 'SACE Batch', 'Assessment Start Date', 'Assessment End Date', 'Core Competency Result', 'Elective Compete', '', '', '', '', '', '', '', '', '', '', '', '', 'Date of Results', 'Eligible Licence Tenure (year)']
  ['', '', '', '', '', '', 'E.1', 'E.2', 'E.3', 'E.4', 'E.5', 'E.6', 'E.7',
  [… 2,185 chars cut …]
  '3']
  ['146', 'WHITE KNIGHTS SECURITY SERVICES PTE. LTD.', 'A1', '01-Jul-25', '26-Sep-25', 'Pass', '', '', '', '', '', '', '', '', '', '', '', '', '', '26-Sep-25', '1']
  ```

  </details>

- **Bash** — Convert SACE PDFs to CSV
  
  ```
  cd /tmp/sg-sources; python3 - <<'EOF'
  import fitz,csv
  for f,out in [('spf_SACE-Cycle-4-Results-as-of-20-Aug-2025.pdf','spf_sace_cycle4.csv'),('spf_SACE-Cycle-5-Results-as-of-7-Aug-2026.pdf','spf_sace_cycle5.csv')]:
      d=fitz.open('/tmp/sg-sources/'+f); rows=[]
      for p in d:
          for t in p.find_tables().tables:
              rows+= [[(c or '').replace('\n',' ').strip() for c in r] for r in t.extract()]
      data=[r for r in rows if r and r[0].isdigit()]
      w=csv.writer(open('/tmp/sg-sources/'+out,'w'))
      w.writerow(['s_no','company','batch','assess_start','assess_end','core_result']+[f'E{i}' for i in range(1,14)]+['date_of_results','eligible_licence_tenure_years'])
      w.writerows(data); print(out,len(data))
  EOF
  wc -l gobiz_licences.jsonl; ls dgs_collections_all.json 2>&1
  ```

  <details><summary>error</summary>

  ```
  Exit code 1
  spf_sace_cycle4.csv 252
  spf_sace_cycle5.csv 146
        62 gobiz_licences.jsonl
  ls: dgs_collections_all.json: No such file or directory
  ```

  </details>

- **Bash** — Restart collections fetch with progress
  
  ```
  pkill -f fetch_colls.py; cd /tmp/sg-sources; cat > fetch_colls.py <<'EOF'
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
  EOF
  timeout 60 python3 fetch_colls.py; ls dgs_coll_pages | wc -l
  ```

  <details><summary>result</summary>

  ```
  (eval):23: command not found: timeout
  ls: dgs_coll_pages: No such file or directory
         0
  ```

  </details>

- **Bash** — Fetch data.gov.sg collections in background
  
  ```
  cd /tmp/sg-sources; python3 fetch_colls.py > fetch_colls.log 2>&1; tail -5 fetch_colls.log
  ```

  <details><summary>result</summary>

  ```
  Command running in background with ID: bdq4l1x4n. Output is being written to: /private/tmp/claude-501/-Users-teddy--universe-sessions-529c67bc-baf4-434e-a6d1-a7855631d0a5/7142f416-4f85-496d-ae13-524a650d7452/tasks/bdq4l1x4n.output. You will be notified when it completes. To check interim output, use Read on that file path.
  Session cwd remains ~/.universe/sessions/529c67bc-baf4-434e-a6d1-a7855631d0a5; directory changes made by the backgrounded command do not apply to subsequent commands.
  ```

  </details>

- **WebSearch** `{"query": "data.gov.sg SFA licensed food establishments dataset \"Singapore Food Agency\""}`

- **WebSearch** `{"query": "bizSAFE enterprises list download WSH Council certified companies directory"}`

  <details><summary>result</summary>

  ```
  Web search results for query: "data.gov.sg SFA licensed food establishments dataset "Singapore Food Agency""
  
  Links: [{"title":"Licensed Food Establishments By Grade | SFA | data.gov.sg","url":"https://data.gov.sg/datasets/d_203c698549799927dd74aed8d226528b/view"},{"title":"data.gov.sg","url":"https://data.gov.sg/datasets?agencies=Singapore+Food+Agency+(SFA)&[secret]"},{"title":"Licensed Food Factories, (End Of Period), Annual | SFA | data.gov.sg","url":"https://data.gov.sg/datasets/d_3995b7317bd9b550f814b117efde0097/vi
  [… 1,758 chars cut …]
  directly through the platform for research and analysis purposes.
  
  
  REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.
  ```

  </details>

  <details><summary>result</summary>

  ```
  Web search results for query: "bizSAFE enterprises list download WSH Council certified companies directory"
  
  Links: [{"title":"bizSAFE Frequently Asked Questions","url":"https://www.tal.sg/wshc/programmes/bizsafe/frequently-asked-questions"},{"title":"WSH Awards 2026","url":"https://www.tal.sg/wshc/wsh-awards"},{"title":"What is bizSAFE: Certifications, Processes, Benefits and Requirements","url":"https://scal-academy.com.sg/courses/course_detail/What-is-bizSAFE-Certifications-Processes-Benefits-and-Requirements"},{"tit
  [… 2,142 chars cut …]
  at tal.sg/wshc or contact them for access to their complete register.
  
  
  REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.
  ```

  </details>

- **Bash** — Probe SFA datasets
  
  ```
  cd /tmp/sg-sources; python3 dgs_probe.py d_1f0313499a17075d13aae6ed3e825bc6 d_203c698549799927dd74aed8d226528b 2>&1 | python3 -c "
  import sys,json,re
  t=sys.stdin.read()
  for blk in re.split(r'\n(?=\{\n \"d_)',t):
      try: d=json.loads(blk)
      except Exception as e: print('parse fail',blk[:300]); continue
      for k,v in d.items(): print(k,{x:v[x] for x in ['name','managedBy','lastUpdatedAt','coverageEnd','size','total','fields']}); print('  sample',v['sample'])
  "
  ```

  <details><summary>result</summary>

  ```
  d_1f0313499a17075d13aae6ed3e825bc6 {'name': None, 'managedBy': None, 'lastUpdatedAt': None, 'coverageEnd': None, 'size': None, 'total': None, 'fields': []}
    sample None
  d_203c698549799927dd74aed8d226528b {'name': None, 'managedBy': None, 'lastUpdatedAt': None, 'coverageEnd': None, 'size': None, 'total': 55, 'fields': ['year', 'grade', 'no_of_food_establishments']}
    sample {'_id': 1, 'year': '2010', 'grade': 'Grade A', 'no_of_food_establishments': '143'}
  ```

  </details>

- **Bash** — Look for bizSAFE directory on WSHC site
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 30 -A "$UA" https://www.tal.sg/robots.txt | head -20; curl -s -m 30 -A "$UA" -L -o wshc_bizsafe_faq.html -w "HTTP %{http_code} %{size_download}\n" https://www.tal.sg/wshc/programmes/bizsafe/frequently-asked-questions; python3 - <<'EOF'
  import re,html
  s=open('/tmp/sg-sources/wshc_bizsafe_faq.html',encoding='utf-8',errors='ignore').read()
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
  for k in ['directory','Directory','verify','list of bizSAFE','search']:
      for m in list(re.finditer(k,t))[:2]: print('==',k,':',t[max(0,m.start()-250):m.start()+300]); print()
  print(sorted(set(re.findall(r'href="([^"]*(?:bizsafe|directory|enterprise)[^"]*)"',s,flags=re.I)))[:30])
  EOF
  ```

  <details><summary>result</summary>

  ```
  <!DOCTYPE html>
  
  <html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>
  
  </title></head>
  <body>
      <form method="post" action="/robots.txt" id="form1">
  <div class="aspNetHidden">
  <input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="[secret]/[secret]/6nQVcSlj54SJE5eKA70FZ3k=" />
  </div>
  
  <div class="aspNetHidden">
  
  	<input type="hidden" name="__VIEWSTATEGENERATOR" id="__VIEWSTATEGENERATOR" value="41AE31D4" />
  </div>
      <div>
      Page Not Found!
  HTTP 200 81797
  == search :  Frequently
  [… 2,168 chars cut …]
  ources/publications/checklists-and-articles/risk-management-implementation-checklist-for-bizsafe-exemplary-awards-2026', 'https://www.tal.sg/wshc/resources?programme=bizSAFE']
  ```

  </details>

- **Bash** — Fetch bizSAFE e-services and marketplace pages
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; for p in bizsafe-e-services bizsafe-marketplace; do curl -s -m 30 -A "$UA" -L -o wshc_$p.html -w "$p HTTP %{http_code} %{size_download}\n" https://www.tal.sg/wshc/programmes/bizsafe/$p; python3 - $p <<'EOF'
  import re,html,sys
  s=open(f'/tmp/sg-sources/wshc_{sys.argv[1]}.html',encoding='utf-8',errors='ignore').read()
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
  i=t.find('Part of:'); print(t[i:i+1500])
  print([h for h in set(re.findall(r'href="(https?://[^"]+)"',s)) if 'tal.sg/wshc' not in h and 'facebook' not in h][:20])
  EOF
  done
  ```

  <details><summary>result</summary>

  ```
  bizsafe-e-services HTTP 200 43565
  Part of: Programmes 1. About bizSAFE 2. Apply for bizSAFE 3. bizSAFE e-Services 4. bizSAFE Marketplace 5. bizSAFE: Approved Training Providers 6. bizSAFE Awards 7. bizSAFE Partner 8. Frequently Asked Questions 9. For More Information 3. bizSAFE e-Services You can use the following e-Services to: bizSAFE Self-Help Excel Check if a company is recognised by bizSAFE (including bizSAFE level, status and certificate expiry date) You will require the company's Unique Entity Number (UEN) or
  [… 2,344 chars cut …]
  'https://www.tiktok.com/@wshcouncilsg', 'https://www.linkedin.com/company/workplace-safety-and-health-council', 'https://www.tal.sg/privacy-statement']
  ```

  </details>

- **Bash** — Find bizSAFE Self-Help Excel link
  
  ```
  cd /tmp/sg-sources; grep -o -E '<a[^>]+href="[^"]+"[^>]*>[^<]{0,80}(Self-Help|bizSAFE companies|e-Service Request)[^<]{0,40}' wshc_bizsafe-e-services.html wshc_bizsafe-marketplace.html; grep -o -E 'href="[^"]*(xls|xlsx|Self|self|marketplace|Marketplace|go\.gov|form\.gov)[^"]*"' wshc_bizsafe-e-services.html wshc_bizsafe-marketplace.html | sort -u
  ```

  <details><summary>result</summary>

  ```
  ugrep: error: error at position 1569
  [\x80-\xbf][\x80-\xbf]){0,40}
  exceeds complexity limits___/
  
  
  wshc_bizsafe-e-services.html:href="https://www.tal.sg/wshc/-/media/tal/wshc/programmes/files/bizsafe-self-help_20260923.xlsx"
  wshc_bizsafe-e-services.html:href="https://www.tal.sg/wshc/programmes/bizsafe/bizsafe-marketplace"
  wshc_bizsafe-marketplace.html:href="https://www.tal.sg/wshc/-/media/tal/wshc/programmes/files/bizsafe-marketplace_20260923.xlsx"
  wshc_bizsafe-marketplace.html:href="https://www.tal.sg/wshc/programmes/bizsafe/bizsafe-marketplace"
  ```

  </details>

- **Bash** — Download bizSAFE self-help and marketplace xlsx
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; for f in bizsafe-self-help_20260923.xlsx bizsafe-marketplace_20260923.xlsx; do curl -s -m 120 -A "$UA" -o "wshc_$f" -w "$f HTTP %{http_code} %{size_download} %{content_type}\n" "https://www.tal.sg/wshc/-/media/tal/wshc/programmes/files/$f"; done; python3 -c "import openpyxl;print('openpyxl ok')"
  ```

  <details><summary>result</summary>

  ```
  bizsafe-self-help_20260923.xlsx HTTP 200 5067356 application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
  bizsafe-marketplace_20260923.xlsx HTTP 200 2682724 application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
  openpyxl ok
  ```

  </details>

- **Bash** — Profile bizSAFE xlsx files
  
  ```
  cd /tmp/sg-sources; python3 - <<'EOF'
  import openpyxl, collections
  for f in ['wshc_bizsafe-self-help_20260923.xlsx','wshc_bizsafe-marketplace_20260923.xlsx']:
      wb=openpyxl.load_workbook('/tmp/sg-sources/'+f,read_only=True)
      print('####',f,wb.sheetnames)
      for ws in wb.worksheets:
          rows=list(ws.iter_rows(values_only=True))
          print(ws.title,'rows',len(rows))
          for r in rows[:6]: print('  ',r)
          # find header row
          hdr_i=next((i for i,r in enumerate(rows) if r and any(isinstance(c,str) and 'UEN' in c.upper() for c in r if c)),None)
          if hdr_i is not None:
              hdr=rows[hdr_i]; print('  header@',hdr_i,hdr)
              data=[r for r in rows[hdr_i+1:] if r and any(r)]
              print('  data rows',len(data)); print('  sample',data[0]); print('  last',data[-1])
              for ci,h in enumerate(hdr):
                  if h and ('level' in str(h).lower() or 'status' in str(h).lower()):
                      print('  ',h,collections.Counter(r[ci] for r in data).most_common(10))
  EOF
  ```

  <details><summary>result</summary>

  ```
  #### wshc_bizsafe-self-help_20260923.xlsx ['Please Read', 'Self-Help', 'Data', 'Formula']
  Please Read rows 50
     ('Instructions on using the bizSAFE Self-Help excel file.', None, None, None, None, None, None, None, None, None, None, None, None, None, None)
     (None, None, None, None, None, None, None, None, None, None, None, None, None, None, None)
     ('Thank you for downloading the bizSAFE self-help excel file. Please refer to the steps below to ensure that the search function will be able to function normally.',
  [… 2,281 chars cut …]
  2, 4, 0, 0), 'STRUCTURAL WORK FABRICATION', '[email]', 'STRUCTURAL WORK FABRICATION', None)
     Level 3 [('Level 3', 15847), ('Level Star', 8336), ('Level 4', 2780)]
  ```

  </details>

- **Bash** — Export bizSAFE data to CSV; check TAL terms
  
  ```
  cd /tmp/sg-sources; python3 - <<'EOF'
  import openpyxl, csv
  wb=openpyxl.load_workbook('/tmp/sg-sources/wshc_bizsafe-self-help_20260923.xlsx',read_only=True)
  ws=wb['Data']; w=csv.writer(open('/tmp/sg-sources/bizsafe_selfhelp_data.csv','w'))
  n=0
  for r in ws.iter_rows(values_only=True):
      w.writerow([c.date().isoformat() if hasattr(c,'date') else c for c in r]); n+=1
  print(n)
  EOF
  grep -c "" bizsafe_selfhelp_data.csv; grep -E "^198101793G|^199603321N" bizsafe_selfhelp_data.csv; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 30 -A "$UA" -L -o tal_terms.html -w "HTTP %{http_code} %{size_download}\n" https://www.tal.sg/terms-of-use; python3 - <<'EOF'
  import re,html
  s=open('/tmp/sg-sources/tal_terms.html',encoding='utf-8',errors='ignore').read()
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
  for m in list(re.finditer('reproduc',t))[:2]: print(t[max(0,m.start()-250):m.start()+350]); print()
  EOF
  ```

  <details><summary>result</summary>

  ```
  51014
  56418
  199603321N,AEQON TJ PTE. LTD.,E07071,E,Renewal,2027-06-06,Approved,2024-06-10,Level Star,SECURITY SYSTEMS
  198101793G,NCS PTE. LTD.,E05780,E,Renewal,2029-02-04,Approved,2026-02-05,Level Star,"Provides comprehensive services including application development, systems integration, infrastructure management, engineering, and cybersecurity."
  HTTP 200 14929
  ```

  </details>

- **Bash** — Inspect TAL terms; check progress
  
  ```
  cd /tmp/sg-sources; python3 - <<'EOF'
  import re,html
  s=open('/tmp/sg-sources/tal_terms.html',encoding='utf-8',errors='ignore').read()
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
  print(t[:600]); 
  for k in ['copy','Copyright','permission']:
      for m in list(re.finditer(k,t))[:2]: print('==',t[max(0,m.start()-250):m.start()+350]); print()
  EOF
  cat fetch_colls.log | tail -3; ls dgs_coll_pages | wc -l; wc -l gobiz_licences.jsonl
  ```

  <details><summary>result</summary>

  ```
  Terms of Use Skip to main content About TAL Our People Join Us Media Agencies https://www.tal.sg/#agencies Annual Report https://www.tal.sg/#annual-report Tripartite Alliance Award https://www.tal.sg/tripartite-alliance-award Tripartite Collective https://www.tal.sg/tripartite-collective $name Terms of Use Terms of use Welcome to Tripartite Alliance Limited (TAL). The Website is owned and maintained by TAL. The use of this Website constitutes agreement with the terms and conditions provided in this Agreement. PLEASE
  [… 552 chars cut …]
  purpose or in any other manner inconsistent with the Terms of Use. By assessing and/or using the Website, Users agree that Singapo
  
       122
       159 gobiz_licences.jsonl
  ```

  </details>

- **WebSearch** `{"query": "CSRO list of licensed cybersecurity service providers penetration testing managed security operations centre csa.gov.sg"}`

  <details><summary>result</summary>

  ```
  Web search results for query: "CSRO list of licensed cybersecurity service providers penetration testing managed security operations centre csa.gov.sg"
  
  Links: [{"title":"CSA Kicks Off Licensing Framework for Cybersecurity Service Providers | Cyber Security Agency of Singapore","url":"https://www.csa.gov.sg/news-events/press-releases/csa-kicks-off-licensing-framework-for-cybersecurity-service-providers/"},{"title":"Closing Note to the Consultation on the Licensing Framework for Cybersecurity Service Providers | Cyber
  [… 2,315 chars cut …]
  providing penetration testing and managed SOC services in Singapore.
  
  
  REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.
  ```

  </details>

- **Bash** — Fetch CSRO licensed service providers page
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 30 -A "$UA" https://www.csro.gov.sg/robots.txt | head; curl -s -m 30 -A "$UA" -L -o csro_lsp.html -w "HTTP %{http_code} %{size_download}\n" https://www.csro.gov.sg/resources/licensed-service-providers/; grep -o -E 'href="[^"]*(\.pdf|\.xlsx|\.csv|\.json)[^"]*"' csro_lsp.html | sort -u | head; python3 - <<'EOF'
  import re,html
  s=open('/tmp/sg-sources/csro_lsp.html',encoding='utf-8',errors='ignore').read()
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
  i=t.find('Licensed Service Providers'); print(t[i:i+2000])
  print(s.count('<table'))
  EOF
  ```

  <details><summary>result</summary>

  ```
  User-Agent: *
  Allow: /
  Disallow: /search
  
  Sitemap: https://www.csro.gov.sg/sitemap.xml
  HTTP 200 362835
  href="https://isomer-user-content.by.gov.sg/370/17db14ca-e969-4f43-b4a8-27193fd57591/list_of licensed_individuals_25sep.pdf"
  href="https://isomer-user-content.by.gov.sg/370/3b626c97-d59b-4450-aa3d-50187ad05a82/list_of licensed_business_entities_25sep.pdf"
  Licensed Service Providers | Cybersecurity Services Regulation Office Skip to main content A Singapore Government Agency Website How to identify Official website
  [… 1,668 chars cut …]
  Service Providers Documents and Guides Legislation FAQ Contact Feedback (opens in new tab) © 2026 Government of Singapore, last updated on 29 September 2026 Report Vulnera
  1
  ```

  </details>

- **Bash** — Download and parse CSRO licensee PDF
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 60 -A "$UA" -o csro_licensed_business_entities_25sep.pdf -w "HTTP %{http_code} %{size_download} %{content_type}\n" "https://isomer-user-content.by.gov.sg/370/3b626c97-d59b-4450-aa3d-50187ad05a82/list_of%20licensed_business_entities_25sep.pdf"; python3 - <<'EOF'
  import fitz,csv
  d=fitz.open('/tmp/sg-sources/csro_licensed_business_entities_25sep.pdf'); print('pages',d.page_count)
  rows=[]
  for p in d:
      for t in p.find_tables().tables:
          rows+=[[(c or '').replace('\n',' ').strip() for c in r] for r in t.extract()]
  print(len(rows))
  for r in rows[:5]: print(r)
  print(rows[-1])
  csv.writer(open('/tmp/sg-sources/csro_licensed_business_entities.csv','w')).writerows(rows)
  import collections
  print(collections.Counter(r[3] if len(r)>3 else '' for r in rows).most_common(6))
  EOF
  ```

  <details><summary>result</summary>

  ```
  HTTP 200 680760 application/pdf
  pages 41
  762
  ['S/n.', 'Name', 'UEN', 'Licence ID']
  ['(A) Managed Security Operations Centre Monitoring', '', '', '']
  ['Cyber Trust Mark Advocate (Tier 5) or equivalent', '', '', '']
  ['1', 'ABPCYBER PTE LTD', '201325759R', 'CS/SOC/C-2022-0138RR']
  ['2', 'ACCENTURE PTE LTD', '197501877H', 'CS/SOC/C-2023-0288R']
  ['304', 'ZENDATA CYBERSECURITY PTE. LTD.', '202513566H', 'CS/PTS/C-202508-003']
  [('Licence ID', 41), ('', 10), ('CS/SOC/C-2022-0138RR', 1), ('CS/SOC/C-2023-0288R', 1), ('CS/SOC/C-2023-0300R', 1), ('CS/SOC/C-2023-0332R', 1)]
  ```

  </details>

- **Bash** — Grep data.gov.sg collections for licence/registry datasets
  
  ```
  cd /tmp/sg-sources; tail -2 fetch_colls.log; python3 - <<'EOF'
  import json,re
  c=json.load(open('/tmp/sg-sources/dgs_collections_all.json'))
  print(len(c))
  pat=re.compile(r'licen|regist|contractor|accredit|certif|supplier|vendor|approved|permit|security agen|cleaning|bizsafe|builder|panel|directory|listing of',re.I)
  hits=[x for x in c if pat.search(x['name']) or pat.search(x.get('description','')[:300])]
  print(len(hits))
  for x in sorted(hits,key=lambda x:x['managedByAgencyName']):
      print(f"{x['collectionId']:>5} | {x['managedByAgencyName'][:28]:28} | {x['lastUpdatedAt'][:10]} | {x.get('coverageEnd','')[:10]:10} | {x.get('frequency','')[:8]:8} | {x['name'][:80]} | {len(x['childDatasets'])}")
  EOF
  ```

  <details><summary>result</summary>

  ```
  total 1370
  1370
  238
      1 | Accounting and Corporate Reg | 2026-09-15 | 2021-09-05 | ad-hoc   | Registered Entities with Unique Entity Number | 2
      2 | Accounting and Corporate Reg | 2026-09-16 | 2023-03-30 | monthly  | ACRA Information on Corporate Entities | 27
     11 | Board of Architects          | 2026-08-06 | 2050-12-31 | annual   | Singapore-registered architectural firms under BOA | 1
     12 | Board of Architects          | 2026-08-14 | 2029-12-31 | annual   | ASEAN architects registered under BOA | 1
      9 |
  [… 2,321 chars cut …]
  quarterl | Completed Private Residential Units Sold in the Quarter, Quarterly | 1
   1624 | Workforce Singapore          | 2024-06-06 |            | ad-hoc   | CET Centres | 0
  ```

  </details>

- **Bash** — List child datasets of relevant collections
  
  ```
  cd /tmp/sg-sources; python3 - <<'EOF'
  import json
  c={x['collectionId']:x for x in json.load(open('/tmp/sg-sources/dgs_collections_all.json'))}
  ids=[]
  for cid in ['14','15','1434','1433','136','155','11','1951','1565','616','1626']:
      x=c[cid]; print(cid,x['name'],'|',x['description'][:200].replace('\n',' '),'|',x['childDatasets']); ids+=x['childDatasets']
  open('/tmp/sg-sources/probe_ids.txt','w').write(' '.join(ids))
  EOF
  cat probe_ids.txt
  ```

  <details><summary>result</summary>

  ```
  14 Listing of Licensed Builders | This dataset contains the list of licensed builders. The Licensing of Builders Scheme is part of BCA’s long-term plan to upgrade the safety and quality standards of the construction sector. The aim of | ['d_19573c579879be15623f2e1e3854926d']
  15 Listing of Public Sector Panels of Consultants | This dataset contains the list of Public Sector Panels of Consultants (PSPC). The PSPC is administered by the Building and Construction Authority, on behalf of the Ministry of Finance to serve the
  [… 2,295 chars cut …]
  d_9973d2c119ed4dd1560aebf8f0829b86 d_d5c0a4ffd076a3e40d772275619bbb66 d_1bf762ee1d6d7fb61192cb442fb2f5b4 d_e643dd525fb927ee16f54f093c73b490 d_563451336616abdf5b2c36472c2afd8b
  ```

  </details>

- **Bash** — Probe relevant data.gov.sg datasets
  
  ```
  cd /tmp/sg-sources; python3 dgs_probe.py d_19573c579879be15623f2e1e3854926d d_a347a40f7b073e56227a29eb3c9387ff d_546a95c5e6a0a264a82247ec107a0629 d_996c0e2023d90266cb62ce67f0a28970 d_b1d236af9430bbe874b4dd97aa97a684 d_9973d2c119ed4dd1560aebf8f0829b86 d_d5c0a4ffd076a3e40d772275619bbb66 > dgs_probe_batch2.txt 2>&1; python3 - <<'EOF'
  import json,re
  t=open('/tmp/sg-sources/dgs_probe_batch2.txt').read()
  dec=json.JSONDecoder(); i=0
  while True:
      j=t.find('{',i)
      if j<0: break
      try: o,e=dec.raw_decode(t[j:])
      except Exception: i=j+1; continue
      i=j+e
      for k,v in o.items():
          print(k,'|',v['name'],'|',v['managedBy'],'| upd',v['lastUpdatedAt'],'| cov',v['coverageEnd'],'| fmt',v['format'],'| size',v['size'],'| rows',v['total'])
          print('   fields',v['fields']); print('   sample',str(v['sample'])[:400])
  EOF
  ```

  <details><summary>result</summary>

  ```
  d_19573c579879be15623f2e1e3854926d | Listing of Licensed Builders | Building and Construction Authority | upd 2026-01-12T13:30:40+08:00 | cov 2026-01-31T23:59:59+08:00 | fmt CSV | size 757023 | rows 5214
     fields ['company_name', 'uen_no', 'class', 'class_code', 'additional_info', 'expiry_date', 'building_no', 'street_name', 'unit_no', 'building_name', 'postal_code', 'tel_no']
     sample {'_id': 1, 'company_name': 'WOH HUP (PRIVATE) LIMITED', 'uen_no': '194000021M', 'class': 'General Builder Class 1', 'class_code':
  [… 2,282 chars cut …]
  'firm_name': '103 East Architects', 'firm_address': 'Blk 125 Bukit Merah Lane 1 #03-162 Singapore 150125', 'firm_phone': '[phone]', 'firm_fax': '', 'firm_email': '[email]'}
  ```

  </details>

- **Bash** — Profile scraped GoBusiness licences
  
  ```
  cd /tmp/sg-sources; tail -5 gobiz_scrape.log; wc -l gobiz_licences.jsonl; python3 - <<'EOF'
  import json,collections
  ag=json.load(open('/tmp/sg-sources/gobiz_agency_ids.json'))
  L=[json.loads(l) for l in open('/tmp/sg-sources/gobiz_licences.jsonl')]
  print(len(L), 'unique slugs',len({(x['_url']) for x in L}))
  def filled(k): return sum(1 for x in L if x.get(k) not in (None,'',[],'$undefined'))
  for k in ['display_name','short_description','long_description','agency_in_charge','fee_details','estimated_processing_time','licence_validity','documents','additional_eligibility_requirements','industry_sector','payment_methods','application_link_url','category']:
      print(f'{k:40} {filled(k)}')
  print(collections.Counter(x.get('category') for x in L))
  print(collections.Counter(ag.get(str(x.get('agency_in_charge')),x.get('agency_in_charge')) for x in L).most_common(8))
  # pick samples
  for s in ['cleaning-business-licence','security-agency-licence']:
      x=next(o for o in L if o['slug']==s)
      print(json.dumps({k:x[k] for k in ['slug','display_name','agency_in_charge','category','short_description','estimated_processing_time','licence_validity','fee_details','payment_methods','additional_eligibility_requirements','industry_sector','application_link_url','_url']},ensure_ascii=False,indent=1)[:2500])
  EOF
  ```

  <details><summary>result</summary>

  ```
  NOOBJ https://licensing.gobusiness.gov.sg/licence-directory/nparks/usage-of-premises-in-parks
  NOOBJ https://licensing.gobusiness.gov.sg/licence-directory/mom/work-passes-and-permits
  NOOBJ https://licensing.gobusiness.gov.sg/licence-directory/nea/written-permission-to-discharge-trade-effluent-into-a-watercourse
  ERR https://licensing.gobusiness.gov.sg/licence-directory/singapore customs/n-a URL can't contain control characters. '/licence-directory/singapore customs/n-a' (found at least ' ')
  ok 238 fail 86
       238
  [… 2,318 chars cut …]
  changes include the change in reporting requirements with respect to changes of business names and officers, i.e. directors and partners, of security agencies. For change of
  ```

  </details>

- **Bash** — Inspect a licence page with no licence_id
  
  ```
  cd /tmp/sg-sources; grep -c NOOBJ gobiz_scrape.log; grep NOOBJ gobiz_scrape.log | head -3; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 30 -A "$UA" -H "RSC: 1" -o gobiz_noobj_sample.rsc https://licensing.gobusiness.gov.sg/licence-directory/mom/work-passes-and-permits; python3 - <<'EOF'
  t=open('/tmp/sg-sources/gobiz_noobj_sample.rsc',encoding='utf-8',errors='ignore').read()
  import re
  for k in ['"slug"','display_name','"category"','processing','fee']:
      i=t.find(k); print('==',k,i, t[max(0,i-300):i+400].replace('\n',' ') if i>=0 else '')
  EOF
  ```

  <details><summary>result</summary>

  ```
  70
  NOOBJ https://licensing.gobusiness.gov.sg/licence-directory/mpa/accreditation-scheme-for-bunker-surveying-companies
  NOOBJ https://licensing.gobusiness.gov.sg/licence-directory/mas/application-for-bank-representative-office
  NOOBJ https://licensing.gobusiness.gov.sg/licence-directory/lta/application-for-change-of-use-and-parking-layout-to-existing-developments
  == "slug" 1166 5981-d61ad88cde75317a.js","489","static/chunks/489-6caec83e2b52da34.js","5924","static/chunks/app/licence-directory/%5Bagency%5D/%5Bslug%5D/page-1
  [… 2,271 chars cut …]
  email":"https://www.mom.gov.sg/contact-us/feedback-and-enquiries","agency_contact_number":"[phone]","agency_in_charge":29,"industry_sector":["Employment & Labour Services"]}}]
  ```

  </details>

- **Bash** — Re-scrape failed GoBusiness licence pages
  
  ```
  cd /tmp/sg-sources; grep -c ERR gobiz_scrape.log; grep ERR gobiz_scrape.log | grep -v "control characters" | head -3; cat > gobiz_scrape_fix.py <<'EOF'
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
  failed=[l.split()[1] for l in
  [… 191 chars cut …]
      try:
          o=extract2(get(u2))
          if o: o['_url']=u2; out.write(json.dumps(o,ensure_ascii=False)+'\n'); ok+=1
          else: print('STILL NOOBJ',u2,flush=True)
      except Exception as e: print('ERR',u2,e,flush=True)
      time.sleep(1)
  print('fixed',ok,'of',len(failed))
  EOF
  python3 gobiz_scrape_fix.py 2>&1 | tail -5; wc -l gobiz_licences.jsonl
  ```

  <details><summary>result</summary>

  ```
  16
  STILL NOOBJ https://licensing.gobusiness.gov.sg/licence-directory/singapore
  STILL NOOBJ https://licensing.gobusiness.gov.sg/licence-directory/singapore
  STILL NOOBJ https://licensing.gobusiness.gov.sg/licence-directory/singapore
  STILL NOOBJ https://licensing.gobusiness.gov.sg/licence-directory/singapore
  fixed 70 of 86
       308 gobiz_licences.jsonl
  ```

  </details>

- **Bash** — Scrape GoBusiness URLs containing spaces
  
  ```
  cd /tmp/sg-sources; python3 - <<'EOF'
  import re,json,time,urllib.parse,sys
  sys.path.insert(0,'/tmp/sg-sources')
  from gobiz_scrape import get
  from gobiz_scrape_fix import extract2
  EOF
  python3 - <<'EOF' 2>&1 | tail -4
  import re,json,time,urllib.parse,sys,importlib.util
  sys.path.insert(0,'/tmp/sg-sources')
  from gobiz_scrape import get, parse_rows
  src=open('/tmp/sg-sources/gobiz_scrape_fix.py').read().split('failed=')[0]
  exec(src)
  urls=[u for u in re.findall(r'<loc>([^<]+)</loc>',open('/tmp/sg-sources/gobiz_licence_directory_sitemap.xml').read()) if ' ' in u]
  print(len(urls))
  out=open('/tmp/sg-sources/gobiz_licences.jsonl','a'); ok=0
  for u in urls:
      u2=urllib.parse.quote(u,safe=':/')
      try:
          o=extract2(get(u2))
          if o: o['_url']=u2; out.write(json.dumps(o,ensure_ascii=False)+'\n'); ok+=1
          else: print('NOOBJ',u2)
      except Exception as e: print('ERR',u2,e)
      time.sleep(1)
  print('ok',ok)
  EOF
  wc -l gobiz_licences.jsonl
  ```

  <details><summary>result</summary>

  ```
  STILL NOOBJ https://licensing.gobusiness.gov.sg/licence-directory/singapore
  STILL NOOBJ https://licensing.gobusiness.gov.sg/licence-directory/singapore
  STILL NOOBJ https://licensing.gobusiness.gov.sg/licence-directory/singapore
  STILL NOOBJ https://licensing.gobusiness.gov.sg/licence-directory/singapore
  STILL NOOBJ https://licensing.gobusiness.gov.sg/licence-directory/singapore
  STILL NOOBJ https://licensing.gobusiness.gov.sg/licence-directory/singapore
  STILL NOOBJ
  [… 673 chars cut …]
  STILL NOOBJ https://licensing.gobusiness.gov.sg/licence-directory/singapore
  fixed 70 of 86
  16
  ok 16
       394 gobiz_licences.jsonl
  ```

  </details>

- **Bash** — Deduplicate GoBusiness licences and add agency names
  
  ```
  cd /tmp/sg-sources; python3 - <<'EOF'
  import json,collections
  ag=json.load(open('/tmp/sg-sources/gobiz_agency_ids.json'))
  seen={}; 
  for l in open('/tmp/sg-sources/gobiz_licences.jsonl'):
      o=json.loads(l); seen[o['_url']]=o
  L=list(seen.values())
  for o in L: o['agency_name']=ag.get(str(o.get('agency_in_charge')))
  with open('/tmp/sg-sources/gobiz_licences.jsonl','w') as f:
      for o in L: f.write(json.dumps(o,ensure_ascii=False)+'\n')
  print('unique',len(L))
  print('with licence_id (applied via GoBusiness)',sum(1 for o in L if o.get('licence_id')))
  print('application_link_label',collections.Counter(o.get('application_link_label') for o in L))
  def filled(k): return sum(1 for x in L if x.get(k) not in (None,'',[]))
  for k in ['fee_details','estimated_processing_time','licence_validity','documents','additional_eligibility_requirements']: print(k,filled(k))
  print(collections.Counter(o['agency_name'] for o in L).most_common(5))
  EOF
  ls -la gobiz_licences.jsonl
  ```

  <details><summary>result</summary>

  ```
  unique 324
  with licence_id (applied via GoBusiness) 219
  application_link_label Counter({'GOBUSINESS': 219, 'AGENCY': 100, 'DOWNLOAD': 5})
  fee_details 253
  estimated_processing_time 319
  licence_validity 293
  documents 195
  additional_eligibility_requirements 178
  [('Infocomm Media Development Authority (IMDA)', 46), ('Singapore Police Force (SPF)', 40), ('National Environment Agency (NEA)', 33), ('Singapore Food Agency (SFA)', 26), ('Animal & Veterinary Service (AVS)', 16)]
  -rw-r--r--@ 1 teddy  wheel  2050453 Sep 29 04:20 gobiz_licences.jsonl
  ```

  </details>

- **Bash** — Fetch metadata for SFA datasets directly
  
  ```
  cd /tmp/sg-sources; for D in d_546a95c5e6a0a264a82247ec107a0629 d_996c0e2023d90266cb62ce67f0a28970 d_1f0313499a17075d13aae6ed3e825bc6; do curl -s -m 30 "https://api-production.data.gov.sg/v2/public/api/datasets/$D/metadata" | python3 -c "
  import sys,json; d=json.load(sys.stdin); m=d.get('data') or {}; print('$D', d.get('code'), d.get('errorMsg'), m.get('name'), m.get('format'), m.get('lastUpdatedAt'), m.get('coverageEnd'), m.get('datasetSize'), m.get('managedBy'))"; sleep 1; done
  ```

  <details><summary>result</summary>

  ```
  d_546a95c5e6a0a264a82247ec107a0629 2 The dataset id is invalid. None None None None None None
  d_996c0e2023d90266cb62ce67f0a28970 2 The dataset id is invalid. None None None None None None
  d_1f0313499a17075d13aae6ed3e825bc6 2 The dataset id is invalid. None None None None None None
  ```

  </details>

- **WebSearch** `{"query": "SFA \"track records\" licensed food establishments search caterers list sfa.gov.sg"}`

  <details><summary>result</summary>

  ```
  Web search results for query: "SFA "track records" licensed food establishments search caterers list sfa.gov.sg"
  
  Links: [{"title":"Track Records for Licensed Food Establishments","url":"https://www.sfa.gov.sg/tools-and-resources/track-records"},{"title":"Home | Singapore Government Singapore Food Agency","url":"https://www.sfa.gov.sg/"},{"title":"Understanding the Safety Assurance for Food Establishments (SAFE) Framework","url":"https://www.sfa.gov.sg/regulatory-standards-frameworks-guidelines/understanding-the-safety-
  [… 2,302 chars cut …]
  licensed food establishments, including caterers, in Singapore.
  
  
  REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.
  ```

  </details>

- **Bash** — Probe SFA track records page
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 30 -A "$UA" https://www.sfa.gov.sg/robots.txt | head -15; curl -s -m 30 -A "$UA" -L -o sfa_track_records.html -w "HTTP %{http_code} %{size_download}\n" https://www.sfa.gov.sg/tools-and-resources/track-records; grep -o -E '(src|href|action|url)\s*[=:]\s*["'"'"'][^"'"'"']*(api|Api|API|track|Track|search|Search|licen)[^"'"'"']*' sfa_track_records.html | sort -u | head -20; grep -o -E '<iframe[^>]+>' sfa_track_records.html | head
  ```

  <details><summary>result</summary>

  ```
  <h1>404 - Custom User's Page not found!</h1>
  <p>
      We apologise for the inconvenience. Please navigate back to our <a href="/">home</a> page.
  </p>
  HTTP 200 110878
  href="/farming/animal-feed/application-process---fees-for-licence-to-manufacture-and-process-animal-feed-for-food-producing-animals
  href="/farming/licence-registration
  href="/farming/licence-registration/application-process-fees-for-licence-registration-for-farming
  href="/farming/licence-registration/businesses-that-need-licence-registration-for-farming
  [… 1,479 chars cut …]
  ng-storage/licence-registration/update-renew-cancel-licence-registration-for-food-manufacturing-storage
  href="/food-retail/businesses-that-currently-do-not-need-licence-permit
  ```

  </details>

- **Bash** — Inspect SFA track records page scripts
  
  ```
  cd /tmp/sg-sources; python3 - <<'EOF'
  import re,html
  s=open('/tmp/sg-sources/sfa_track_records.html',encoding='utf-8',errors='ignore').read()
  scripts=re.findall(r'<script[^>]*>(.*?)</script>',s,flags=re.S)
  for sc in scripts:
      if any(k in sc for k in ['ajax','fetch(','api','Track','track']):
          print(sc[:1500]); print('-----')
  print(re.findall(r'<script[^>]+src="([^"]+)"',s))
  print(re.findall(r'<form[^>]*>',s)[:5])
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
  i=t.find('Track Record'); print(t[i:i+1200])
  EOF
  ```

  <details><summary>result</summary>

  ```
  { "@context": "https://schema.gov.sg/", "title":  "Track Records for Licensed Food Establishments", "description": "Use this tool to check the Safety Assurance for Food Establishments (SAFE) grades, food hygiene rating and track records of licensed food establishments, such as food stalls, caterers and food manufacturers. ", "type": [], "topic": [], "image": ["https://www.sfa.gov.sg"], }
  
  -----
  { "@context": "https://schema.org", "@type": "NewsArticle", "headline": "Track Records for Licensed Food Establishments",
  [… 2,277 chars cut …]
  Export Certificates for Food Auditing Organisation Recognition (AOR) Programme Licence, Permit & Registration Licence, Permit & Registration Businesses that Need Licence /
  ```

  </details>

- **Bash** — Find SFA track record API endpoint in JS
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 30 -A "$UA" -o sfa_track-record.js "https://www.sfa.gov.sg/Mvc/Scripts/TrackRecord/track-record.js?package=ResourceSFA"; wc -c sfa_track-record.js; grep -o -E '(url|URL)\s*[:=]\s*["'"'"'`][^"'"'"'`]+' sfa_track-record.js | head; grep -o -E '["'"'"'`](/[A-Za-z0-9_/.-]*(api|Api|TrackRecord|trackrecord|json|Search)[^"'"'"'`]*)' sfa_track-record.js | sort -u | head
  ```

  <details><summary>result</summary>

  ```
  25805 sfa_track-record.js
  url: '/api/TrackRecord/SuggestionByPostCode?postalCode=
  url: '/api/TrackRecord/SuggestionByEstablishmentAddress?establishmentAddress=
  url: '/api/TrackRecord/SuggestionByLicenceNumber?licenceNumber=
  url: '/api/TrackRecord/SuggestionByBusinessName?businessName=
  url: '/api/TrackRecord/SuggestionByLicenseeName?licenseeName=
  url: '/api/TrackRecord/
  url: '/api/TrackRecord/GetTypeOfFoodBussiness?isShowLicenceSuspended=
  '/api/TrackRecord/
  '/api/TrackRecord/GetTrackRecord
  [… 196 chars cut …]
  '/api/TrackRecord/SuggestionByLicenceNumber?licenceNumber=
  '/api/TrackRecord/SuggestionByLicenseeName?licenseeName=
  '/api/TrackRecord/SuggestionByPostCode?postalCode=
  ```

  </details>

- **Bash** — Read SFA GetTrackRecord call
  
  ```
  cd /tmp/sg-sources; grep -n -E "GetTrackRecord|api/TrackRecord/'|type:|data:" sfa_track-record.js | head -30; grep -n -B3 -A25 "GetTrackRecord" sfa_track-record.js | head -70
  ```

  <details><summary>result</summary>

  ```
  249:            type: 'GET',
  269:            type: 'GET',
  289:            type: 'GET',
  309:            type: 'GET',
  329:            type: 'GET',
  463:            type: 'GET',
  464:            url: '/api/TrackRecord/' + endpoint,
  465:            data: getParam(),
  481:                let blob = new Blob([response], { type: "application/octetstream" });
  534:        $.get('/api/TrackRecord/GetTrackRecord', req, function (result) {
  586:                    data: 'establishmentAddress',
  593:                { data: 'grades' },
  [… 1,429 chars cut …]
  {
  557-        let url = window.location.pathname + "?" + jQuery.param(paramObject);
  558-        window.history.pushState(paramObject, "", url)
  559-    }
  ```

  </details>

- **Bash** — Call SFA TrackRecord JSON API
  
  ```
  cd /tmp/sg-sources; sed -n 455,480p sfa_track-record.js; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 60 -A "$UA" -H "X-Requested-With: XMLHttpRequest" -H "Referer: https://www.sfa.gov.sg/tools-and-resources/track-records" -o sfa_trackrecord_caterer.json -w "HTTP %{http_code} %{size_download} %{content_type}\n" "https://www.sfa.gov.sg/api/TrackRecord/GetTrackRecord?postalCode=&establishmentAddress=&licenceNumber=&businessName=SATS&licenseeName=&typeOfFoodBussiness=&isShowLicenceSuspended=false&grades="; head -c 1500 sfa_trackrecord_caterer.json; echo; curl -s -m 60 -A "$UA" -H "X-Requested-With: XMLHttpRequest" -o sfa_food_types.json -w "types HTTP %{http_code} %{size_download}\n" "https://www.sfa.gov.sg/api/TrackRecord/GetTypeOfFoodBussiness?isShowLicenceSuspended=false"; head -c 800 sfa_food_types.json
  ```

  <details><summary>result</summary>

  ```
  grades: $('#grades').val(),
          }
          return param;
      }
  
      function download(endpoint, type) {
          $(".search-suggest").hide();
          $.ajax({
              type: 'GET',
              url: '/api/TrackRecord/' + endpoint,
              data: getParam(),
              responseType: "blob",
              xhr: function () {
                  let xhr = new XMLHttpRequest();
                  xhr.onreadystatechange = function () {
                      if (xhr.readyState == 2) {
                          if
  [… 2,320 chars cut …]
  BLENDING OF POWDERED BEVERAGES (2) REPACKING OF FOOD INGREDIENTS","(1) BLENDING OF TEA (2) MFG OF COLD BREW TEA, FLOUR CONFECTIONERY, FROZEN DESSERT  (ICE CREAM, SORB
  ```

  </details>

- **Bash** — Find SFA download endpoints; query caterers
  
  ```
  cd /tmp/sg-sources; grep -n -E "download\(['\"]" sfa_track-record.js | head; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 60 -A "$UA" -H "X-Requested-With: XMLHttpRequest" -o sfa_trackrecord_caterers_type.json -w "HTTP %{http_code} %{size_download}\n" "https://www.sfa.gov.sg/api/TrackRecord/GetTrackRecord?postalCode=&establishmentAddress=&licenceNumber=&businessName=&licenseeName=&typeOfFoodBussiness=Caterer&isShowLicenceSuspended=false&grades="; python3 -c "
  import json;d=json.load(open('/tmp/sg-sources/sfa_trackrecord_caterers_type.json'));print(len(d['data']));print(d['data'][:2])"
  ```

  <details><summary>result</summary>

  ```
  52:        download('ExportExcel', '.xlsx');
  56:        download('ExportPdf', '.pdf');
  HTTP 200 81504
  281
  [{'refNo': 'W92112K000', 'applType': 'EHFE', 'establishmentAddress': '2 STAMFORD ROAD Singapore 178882 LEVEL 4', 'licenceNumber': 'W92112K000', 'businessName': 'RAFFLES KITCHEN', 'licenseeName': 'RC HOTELS (PTE.) LTD.', 'typeOfFoodBussiness': 'Food Caterer', 'grades': 'A'}, {'refNo': 'W94245L000', 'applType': 'EHFE', 'establishmentAddress': '190 ORCHARD BOULEVARD FOUR SEASONS HOTEL,Singapore 248646', 'licenceNumber': 'W94245L000', 'businessName': 'BANQUET BALLROOM', 'licenseeName': 'HPL PROPERTIES PTE LTD', 'typeOfFoodBussiness': 'Food Caterer', 'grades': 'A'}]
  ```

  </details>

- **Bash** — Test SFA ExportExcel endpoint
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 120 -A "$UA" -H "X-Requested-With: XMLHttpRequest" -o sfa_export_caterer.xlsx -w "HTTP %{http_code} %{size_download} %{content_type}\n" "https://www.sfa.gov.sg/api/TrackRecord/ExportExcel?postalCode=&establishmentAddress=&licenceNumber=&businessName=&licenseeName=&typeOfFoodBussiness=Food%20Caterer&isShowLicenceSuspended=false&grades="; file sfa_export_caterer.xlsx; python3 -c "
  import openpyxl;wb=openpyxl.load_workbook('/tmp/sg-sources/sfa_export_caterer.xlsx',read_only=True);ws=wb.active;rows=list(ws.iter_rows(values_only=True));print(len(rows));[print(r) for r in rows[:4]]" 2>&1 | head
  ```

  <details><summary>result</summary>

  ```
  HTTP 200 16182 application/octet-stream
  sfa_export_caterer.xlsx: Microsoft Excel 2007+
  283
  ('SNO', 'Establishment Address', 'Grade', 'Licence Number', 'Licensee Name', 'Business Name', 'Type of Food Business')
  ('1', '2_x0020_STAMFORD_x0020_ROAD_x0020_Singapore_x0020_178882_x0020_LEVEL_x0020_4', 'A', 'W92112K000', 'RC_x0020_HOTELS_x0020__x0028_PTE._x0029__x0020_LTD.', 'RAFFLES_x0020_KITCHEN', 'Food_x0020_Caterer')
  ('2', '190_x0020_ORCHARD_x0020_BOULEVARD_x0020_FOUR_x0020_SEASONS_x0020_HOTEL_x002C_Singapore_x0020_248646',
  [… 257 chars cut …]
  'B', 'S01024C000', 'WAHIDAH_x0020_CATERING_x0020_SERVICES', 'Wahidah_x0020_Catering_x0020_Services', 'Food_x0020_Caterer')
  ```

  </details>

- **Bash** — Check SFA, SPF, CSRO terms of use
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; for pair in "sfa|https://www.sfa.gov.sg/terms-of-use" "spf|https://www.police.gov.sg/Terms-of-Use" "csro|https://www.csro.gov.sg/terms-of-use/"; do n=${pair%%|*}; u=${pair#*|}; curl -s -m 30 -A "$UA" -L -o terms_$n.html -w "$n HTTP %{http_code} %{size_download}\n" "$u"; python3 - $n <<'EOF'
  import re,html,sys
  s=open(f'/tmp/sg-sources/terms_{sys.argv[1]}.html',encoding='utf-8',errors='ignore').read()
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
  m=re.search(r'shall not be reproduced|not be reproduced|reproduce',t)
  print('   ',t[max(0,m.start()-150):m.start()+300] if m else 'no reproduce clause found')
  EOF
  done
  ```

  <details><summary>result</summary>

  ```
  sfa HTTP 200 109826
      ed. Apart from any fair dealings for the purposes of private study, research, criticism or review, as permitted in law, no part of The Website may be reproduced or reused for any commercial purposes whatsoever without our prior written permission. 7 General Disclaimer And Limitation Of Liability We will not be liable for any loss or damage (i) that you may incur on account of using, visiting or relying on any statements, opinion, representation o
  spf HTTP 200 303309
      re  to review this Site
  [… 734 chars cut …]
  permission of CSRO. Modification of any of the Contents or use of the Contents for any other purpose will be a violation of CSRO’s copyright and other intellectual prope
  ```

  </details>

- **Bash** — Probe GeBIZ Supplier Directory
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; for u in "https://www.gebiz.gov.sg/ptn/supplier/directory/index.xhtml" "https://www.gebiz.gov.sg/ptn/supplier/directory/SupplierDirectoryPage.xhtml"; do curl -s -m 30 -A "$UA" -L -o gebiz_supdir.html -w "$u HTTP %{http_code} %{size_download} %{url_effective}\n" "$u"; python3 - <<'EOF'
  import re,html
  s=open('/tmp/sg-sources/gebiz_supdir.html',encoding='utf-8',errors='ignore').read()
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
  i=t.find('Supplier Directory'); print('  ',t[i:i+900] if i>=0 else t[:400])
  EOF
  done
  ```

  <details><summary>result</summary>

  ```
  https://www.gebiz.gov.sg/ptn/supplier/directory/index.xhtml HTTP 200 211032 https://www.gebiz.gov.sg/ptn/supplier/directory/index.xhtml
     Supplier Directory Listing Skip to main content A Singapore Government Agency Website How to identify Official website links end with .gov.sg Government agencies communicate via .gov.sg websites (e.g. go.gov.sg/open). Trusted websites Secure websites use HTTPS Look for a lock ( ) or https:// as an added precaution. Share sensitive information only on official, secure websites.
  [… 1,390 chars cut …]
  Log in for Foreigners w/o Singpass LOADING WHICH TO USE? LOADING SIGN UP LOADING Supplier Directory Search and view suppliers who have Government Supplier registration usin
  ```

  </details>

- **Bash** — Read GeBIZ Supplier Directory content
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 30 -A "$UA" -c gebiz_cookies.txt -b gebiz_cookies.txt -o gebiz_supplier_directory.html "https://www.gebiz.gov.sg/ptn/supplier/directory/index.xhtml"; python3 - <<'EOF'
  import re,html
  s=open('/tmp/sg-sources/gebiz_supplier_directory.html',encoding='utf-8',errors='ignore').read()
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
  i=t.find('Search and view suppliers'); print(t[i:i+4000])
  print(len(re.findall(r'EPU/',s)))
  EOF
  ```

  <details><summary>result</summary>

  ```
  Search and view suppliers who have Government Supplier registration using Unique Entity Number (UEN), Y-prefix Code (Y-Code) or Supplier Name. UEN / Y-Code / Supplier Name Supply Head All EPU/AVP/10 - Audio Visual,Photographic & Optical Products EPU/CNE/10 - Communication and Navigation Systems EPU/CMP/10 - Computer Related Hardware, Software, and Services EPU/HEQ/10 - Domestic Equipment & Supplies EPU/DAP/32 - Drugs and Pharmaceuticals EPU/ECS/10 - Electrical Components EPU/FFG/10 - Fire Fighting, Safety & Rescue
  [… 2,320 chars cut …]
  Devices & Drives Telecommunication Devices Others Miscellaneous Disposal Management Safety & Rescue Equipment Others Services Advertising Services Childcare Services Data
  135
  ```

  </details>

- **Bash** — Inspect GeBIZ supplier directory form
  
  ```
  cd /tmp/sg-sources; python3 - <<'EOF'
  import re
  s=open('/tmp/sg-sources/gebiz_supplier_directory.html',encoding='utf-8',errors='ignore').read()
  for m in re.finditer(r'<form[^>]*>',s): print(m.group(0)[:300])
  names=re.findall(r'<(?:input|select|button)[^>]*name="([^"]+)"[^>]*>',s)
  print(sorted(set(names))[:80])
  vs=re.search(r'name="javax\.faces\.ViewState"[^>]*value="([^"]+)"',s); print('viewstate',vs.group(1)[:60] if vs else None)
  i=s.find('EPU/CMP/10'); print(s[i-600:i+200])
  for m in re.finditer(r'(Search|SEARCH)',s):
      ctx=s[max(0,m.start()-300):m.start()+100]
      if 'button' in ctx or 'input' in ctx: print('BTN',ctx.replace('\n',' ')[:400]); break
  EOF
  ```

  <details><summary>result</summary>

  ```
  <form id="dialogForm" name="dialogForm" method="post" action="/ptn/supplier/directory/index.xhtml" class="form-horizontal" enctype="application/x-www-form-urlencoded">
  <form id="contentForm" name="contentForm" method="post" action="/ptn/supplier/directory/index.xhtml" class="form-horizontal" enctype="application/x-www-form-urlencoded">
  <form id="j_idt249" name="j_idt249" method="post" action="/ptn/supplier/directory/index.xhtml" class="form-horizontal" enctype="application/x-www-form-urlencoded">
  ['contentForm',
  [… 2,315 chars cut …]
  this, 'contentForm:j_idt183');" onkeydown="return selectOneMenu_NavigateSearchMenu(event, 'contentForm:j_idt183');" role="button" style="width: 100%" title="All" class="sel
  ```

  </details>

- **Bash** — Submit GeBIZ supplier directory search by UEN
  
  ```
  cd /tmp/sg-sources; python3 - <<'EOF'
  import re,html,urllib.request,urllib.parse,http.cookiejar
  UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
  cj=http.cookiejar.CookieJar(); op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
  U="https://www.gebiz.gov.sg/ptn/supplier/directory/index.xhtml"
  s=op.open(urllib.request.Request(U,headers={"User-Agent":UA}),timeout=40).read().decode('utf-8','ignore')
  vs=re.search(r'name="javax\.faces\.ViewState"[^>]*value="([^"]+)"',s).group(1)
  # collect contentForm hidden inputs
  form=s[s.find('<form id="contentForm"'):]; form=form[:form.find('</form>')]
  data={}
  for m in re.finditer(r'<input[^>]*>',form):
      tag=m.group(0); n=re.search(r'name="([^"]+)"',tag); v=re.search(r'value="([^"]*)"',tag); ty=re.search(r'type="([^"]+)"',tag)
      if n and ty and ty.group(1) in ('hidden','text'): data[html.unescape(n.group(1))]=html.unescape(v.group(1)) if v else ''
  print({k:v[:40] for k,v in data.items()})
  data['contentForm:j_idt179']='198101793G'
  data['contentForm:search']='Search'
  [… 256 chars cut …]
  open('/tmp/sg-sources/gebiz_supdir_search_198101793G.html','w').write(r)
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',r,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
  i=t.find('NCS'); print(len(r)); print(t[i-500:i+2500] if i>=0 else t[t.find('Search and view'):][:2500])
  EOF
  ```

  <details><summary>result</summary>

  ```
  {'contentForm': 'contentForm', 'contentForm:j_idt117_windowName': '', 'contentForm:j_idt130_listButton2_HIDDEN-INPUT': '', 'contentForm:j_idt151': '', 'contentForm:j_idt155_SEARCH': '', 'contentForm:j_idt159_selectManyMenu_SEARCH-INPUT': '', 'contentForm:j_idt159_selectManyMenu-HIDDEN-INPUT': '', 'contentForm:j_idt159_selectManyMenu-HIDDEN-ACTION-INPUT': '', 'javax.faces.ViewState': '3807755744430936145:-5762538542021364157'}
  272522
  Search and view suppliers who have Government Supplier registration using Unique Entity
  [… 2,247 chars cut …]
  Medals & Trophies Music & Video Office Supplies & Stationery Paper Photographic & Imaging Services Postage & Courier Printing Services Publications & Periodicals Spor
  ```

  </details>

- **Bash** — Retry GeBIZ supplier search with dynamic field ids
  
  ```
  cd /tmp/sg-sources; cat > gebiz_supdir.py <<'EOF'
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
      if ty.group(1)=='text' and textname is None and 'SEARCH' not in n.group(1) and 'selectMany' not in n.group(1): textname=n.group(1)
  btn=[m.group(0) for m in re.finditer(r'<input[^>]*type="submit"[^>]*>',form)]
  [… 617 chars cut …]
  open(f'/tmp/sg-sources/gebiz_supdir_search_{sys.argv[1]}.html','w').write(r)
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',r,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
  for k in ['result','Result','records','No record']:
      i=t.find(k)
      if i>=0: print('==',k,t[max(0,i-200):i+1500]); break
  EOF
  python3 gebiz_supdir.py 198101793G
  ```

  <details><summary>result</summary>

  ```
  text field contentForm:j_idt130_listButton2_HIDDEN-INPUT
  submit buttons ['contentForm:j_id39=For Companies', 'contentForm:j_id40=For Individuals', 'contentForm:j_id41=For Foreigners w/o Singpass', 'contentForm:j_idt130_listButton2_HIDDEN-INPUT_inputButton=', 'contentForm:j_idt151_inputButton=', 'contentForm:j_idt159_selectManyMenu-HIDDEN-INPUT_inputButton=', 'contentForm:j_idt159_selectManyMenu-HIDDEN-ACTION-INPUT_inputButton=', 'contentForm:search=Search']
  ```

  </details>

- **Bash** — Fix text field detection and retry search
  
  ```
  cd /tmp/sg-sources; python3 - <<'EOF'
  import re
  p=open('/tmp/sg-sources/gebiz_supdir.py').read()
  p=p.replace("""    if ty.group(1)=='text' and textname is None and 'SEARCH' not in n.group(1) and 'selectMany' not in n.group(1): textname=n.group(1)""","""    if n.group(1).endswith('_inputButton') and 'HIDDEN' not in n.group(1): textname=n.group(1)[:-len('_inputButton')]""")
  open('/tmp/sg-sources/gebiz_supdir.py','w').write(p)
  EOF
  python3 gebiz_supdir.py 198101793G
  ```

  <details><summary>result</summary>

  ```
  text field contentForm:j_idt151
  submit buttons ['contentForm:j_id39=For Companies', 'contentForm:j_id40=For Individuals', 'contentForm:j_id41=For Foreigners w/o Singpass', 'contentForm:j_idt130_listButton2_HIDDEN-INPUT_inputButton=', 'contentForm:j_idt151_inputButton=', 'contentForm:j_idt159_selectManyMenu-HIDDEN-INPUT_inputButton=', 'contentForm:j_idt159_selectManyMenu-HIDDEN-ACTION-INPUT_inputButton=', 'contentForm:search=Search']
  == result enance Others Workshop Equipment and Services Workshop Furniture Workshop
  [… 1,323 chars cut …]
  FAQ Sitemap Report Vulnerability Privacy Statement Terms of Use © 2026 Government Of Singapore WARNING Your session is about to expire. Click OK to continue your session.
  ```

  </details>

- **Bash** — Inspect GeBIZ search result markup
  
  ```
  cd /tmp/sg-sources; python3 - <<'EOF'
  import re
  r=open('/tmp/sg-sources/gebiz_supdir_search_198101793G.html').read()
  i=r.find('NCS PTE. LTD.'); print(r[i-2500:i+1500])
  EOF
  ```

  <details><summary>result</summary>

  ```
  <option value="SUPPLIER_NAME" selected="selected" title="Supplier Name">Supplier Name&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</option><option value="TRADING_PARTNER_NO" title="Trading Partner Ref.No.">Trading Partner Ref.No.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</option></select><div id="contentForm:j_idt191_loadingScreen_BACKGROUND" class="loadingScreen_BACKGROUND noselect"></div><div id="contentForm:j_idt191_loadingScreen_BOX-OUTER" class="loadingScreen_BOX-OUTER noselect"><div class="loadingScreen_BOX-MIDDLE
  [… 2,236 chars cut …]
  top;"><div class="formOutputText_VALUE-DIV " style="text-align: left;">198101793G</div></div></div></div></div></div><div id="contentForm:j_idt193:j_id43:j_idt199" c
  ```

  </details>

- **Bash** — Fetch GeBIZ supplier detail page without session
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 60 -A "$UA" -o gebiz_supdir_detail_NCS.html -w "HTTP %{http_code} %{size_download} %{url_effective}\n" "https://www.gebiz.gov.sg/ptn/supplier/directory/searchDetail.xhtml?code=5039d9834cf67ce6339805b8f2178684"; python3 - <<'EOF'
  import re,html
  r=open('/tmp/sg-sources/gebiz_supdir_detail_NCS.html',encoding='utf-8',errors='ignore').read()
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',r,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t)); t=t.replace('LOADING','')
  i=t.find('NCS PTE'); print(t[i:i+3000])
  EOF
  ```

  <details><summary>result</summary>

  ```
  HTTP 302 315 https://www.gebiz.gov.sg/ptn/supplier/directory/searchDetail.xhtml?code=5039d9834cf67ce6339805b8f2178684
  ```

  </details>

- **Bash** — Follow GeBIZ supplier detail link in session
  
  ```
  cd /tmp/sg-sources; cat >> gebiz_supdir.py <<'EOF'
  links=re.findall(r'href="(/ptn/supplier/directory/searchDetail\.xhtml\?code=[0-9a-f]+)"',r)
  print('detail links',links[:3])
  if links:
      d=op.open(urllib.request.Request("https://www.gebiz.gov.sg"+links[0],headers={"User-Agent":UA,"Referer":U}),timeout=60).read().decode('utf-8','ignore')
      open(f'/tmp/sg-sources/gebiz_supdir_detail_{sys.argv[1]}.html','w').write(d)
      t=re.sub(r'<script.*?</script>|<style.*?</style>','',d,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t)).replace('LOADING','')
      i=t.find('Supplier Directory',t.find('SIGN UP')); print(t[i:i+3500])
  EOF
  python3 gebiz_supdir.py 198101793G 2>&1 | tail -3
  ```

  <details><summary>result</summary>

  ```
  == result enance Others Workshop Equipment and Services Workshop Furniture Workshop Machinery, DIY Machinery & Supplies Workshop Tools Maintenance Workshop Tools, DIY Tools & Accessories SEARCHING Results    1 result found. Sort by Supplier Name Supplier Name        Trading Partner Ref.No.        LOADING 1 NCS PTE. LTD. LOADING Trading Partner Ref No. 198101793G [phone] [phone] LOADING LOADING LOADING LOADING LOADING Government Electronic Business Procurement Information Listing of Indicative Government Procurement
  [… 2,332 chars cut …]
  Listing of Indicative Government Procurement Opportunities Guide to Singapore Procurement Government Procurement Opportunities in Other Countries Support Acronyms F
  ```

  </details>

- **Bash** — Inspect GeBIZ supply head selector form
  
  ```
  cd /tmp/sg-sources; python3 - <<'EOF' 2>&1 | head -20
  import re,html,urllib.request,urllib.parse,http.cookiejar
  UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
  cj=http.cookiejar.CookieJar(); op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
  U="https://www.gebiz.gov.sg/ptn/supplier/directory/index.xhtml"
  s=op.open(urllib.request.Request(U,headers={"User-Agent":UA}),timeout=40).read().decode('utf-8','ignore')
  form=s[s.find('<form id="contentForm"'):]; form=form[:form.find('</form>')]
  data={}
  for m in re.finditer(r'<input[^>]*>',form):
      tag=m.group(0); n=re.search(r'name="([^"]+)"',tag); v=re.search(r'value="([^"]*)"',tag); ty=re.search(r'type="([^"]+)"',tag)
      if n and ty and ty.group(1)=='hidden': data[html.unescape(n.group(1))]=html.unescape(v.group(1)) if v else ''
  # find supply head select one menu hidden field: look for input whose value is 'All' or similar near EPU list
  sel=re.search(r'id="(contentForm:j_idt\d+)" class="formSelectOneMenu_INNER-DIV"',form).group(1)
  print('select id',sel)
  hid=[k for k in data if k.startswith(sel)]
  print('hidden for select',hid)
  # look at select element
  m=re.search(r'<select[^>]*name="('+re.escape(sel)+r'[^"]*)"[^>]*>(.*?)</select>',form,flags=re.S)
  if m: 
      print('select name',m.group(1)); opts=re.findall(r'<option value="([^"]*)"[^>]*>([^<]*)',m.group(2)); print(opts[:5])
  EOF
  ```

  <details><summary>result</summary>

  ```
  select id contentForm:j_idt155
  hidden for select []
  ```

  </details>

- **Bash** — Test GeBIZ directory name search result count
  
  ```
  cd /tmp/sg-sources; python3 gebiz_supdir.py "SECURITY" 2>&1 | grep -o -E "[0-9,]+ results? found" | head -2
  ```

  <details><summary>result</summary>

  ```
  117 results found
  ```

  </details>

- **Bash** — Build GSR supply heads and grades JSON
  
  ```
  cd /tmp/sg-sources; python3 - <<'EOF'
  import json,re
  rows=json.load(open('/tmp/sg-sources/gsr_tables_raw.json'))
  heads=[]; grades=[]
  for r in rows:
      cells=[c for c in r if c]
      if len(cells)>=3 and re.match(r'^\*{0,2}\s*EPU/',cells[1] if len(cells)>1 else ''):
          code=re.sub(r'[\*\s]','',cells[1]); heads.append({"code":code,"title":cells[2],"examples":cells[3] if len(cells)>3 else "","licence_note":"*" in cells[1]})
      if cells and re.match(r'^S\d+#*$',cells[0]):
          g=re.sub('#','',cells[0]); grades.append({"grade":g,"tendering_capacity_sgd":cells[1],"min_nta_sgd":cells[2],"min_turnover_sgd":cells[3]})
  json.dump({"source":"https://www.gebiz.gov.sg/docs/Appln_Guidelines_for_Gov_Supp_Reg.pdf","dated":"28 Oct 2025","supply_heads":heads,"financial_grades":grades},open('/tmp/sg-sources/gsr_supply_heads_and_grades.json','w'),indent=1)
  print(len(heads),len(grades)); print(heads[2]); print(grades)
  EOF
  ```

  <details><summary>result</summary>

  ```
  45 9
  {'code': 'EPU/CMP/10', 'title': 'Computer Hardware and software Products, Software Development and Maintenance of System, Equipment & Computers', 'examples': 'Readily available hardware and software products, modems, accessories and computer cabling excluding computer suppliers eg diskettes, computer ribbons. Software development on tailor-made basis, projects on turnkey basis and Internet Service Provider for all Internet related services and any other types of IT services. Maintenance of System, Equipment
  [… 1,007 chars cut …]
  {'grade': 'S10', 'tendering_capacity_sgd': '>30,000,000', 'min_nta_sgd': '4,500,000 ##Paid Up Capital must be at least S$2m', 'min_turnover_sgd': '>15,000,000'}]
  ```

  </details>

- **Bash** — Check rate-limit evidence; save BCA limits JSON
  
  ```
  cd /tmp/sg-sources; grep -c "HTTP 429" fetch_colls.log; head -3 fetch_colls.log; curl -s -m 20 -D - -o /dev/null "https://api-open.data.gov.sg/v1/public/api/datasets/d_dcda79be4aded5f9e769b8e23ff69b47/poll-download" | grep -i -E "ratelimit|retry|x-.*limit"; python3 - <<'EOF'
  import json
  lim={"source":"https://www1.bca.gov.sg/growth-and-transformation/procurement/registration-of-built-environment-firms/tendering-limits/crs-fm-and-sy-registries-tendering-limits/","page_last_updated":"16 June 2026","validity":["1 Jul 25 to 30 Jun 26","1 Jul 26 to 30 Jun 27"],"unit":"S$ million",
  "CW01_CW02":{"A1":"unlimited","A2":105,"B1":50,"B2":16,"C1":5,"C2":1.6,"C3":0.8},
  "CR_ME":{"Single Grade":"unlimited","L6":"unlimited","L5":16,"L4":8,"L3":5,"L2":1.6,"L1":0.8},
  "FM01":{"M1":"unlimited","M2":30,"M3":10,"M4":1},
  "FM02_FM03_FM04":{"L6":"unlimited","L5":16,"L4":8,"L3":5,"L2":1.6,"L1":0.8},
  "SY":{"L6":"unlimited","L5":16,"L4":8,"L3":5,"L2":1.6,"L1":0.8}}
  json.dump(lim,open('/tmp/sg-sources/bca_tendering_limits.json','w'),indent=1)
  EOF
  ls /tmp/sg-sources | head -100; du -sh /tmp/sg-sources
  ```

  <details><summary>result</summary>

  ```
  0
  total 1370
  acra_corp_N_198101793G.json
  acra_lookup_198101793G.json
  bca_cookies.txt
  bca_crs_metadata.json
  bca_crs_page.html
  bca_crs_registered_contractors.csv
  bca_dir_ME04_L6.html
  bca_dir_company_198101793G.html
  bca_dir_filter_mne.html
  bca_dir_searchcompanies.json
  bca_directory.html
  bca_list_firms.html
  bca_tendering_limits.html
  bca_tendering_limits.json
  bca_terms.html
  bca_workheads.json
  bca_workheads.py
  bizsafe_selfhelp_data.csv
  collections_p1.json
  csro_licensed_business_entities.csv
  [… 1,718 chars cut …]
  wshc_bizsafe-marketplace.html
  wshc_bizsafe-marketplace_20260923.xlsx
  wshc_bizsafe-self-help_20260923.xlsx
  wshc_bizsafe_faq.html
   33M	/tmp/sg-sources
  ```

  </details>

- **Bash** — Download builders/poison CSVs; check NEA cleaning list
  
  ```
  cd /tmp/sg-sources; ./dgs_dl.sh d_19573c579879be15623f2e1e3854926d bca_licensed_builders.csv; ./dgs_dl.sh d_b1d236af9430bbe874b4dd97aa97a684 hsa_poison_licence_holders.csv; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 30 -A "$UA" https://www.nea.gov.sg/robots.txt | head -12; curl -s -m 30 -A "$UA" -L -o nea_cbl.html -w "NEA HTTP %{http_code} %{size_download}\n" https://www.nea.gov.sg/our-services/public-cleanliness/cleaning-industry/cleaning-business-licence; grep -o -E 'href="[^"]*(\.xlsx|\.xls|\.csv|\.pdf|list|List|directory|Directory)[^"]*"' nea_cbl.html | sort -u | head -15
  ```

  <details><summary>result</summary>

  ```
  d_19573c579879be15623f2e1e3854926d -> bca_licensed_builders.csv   751805 bytes
  d_b1d236af9430bbe874b4dd97aa97a684 -> hsa_poison_licence_holders.csv    60616 bytes
  User-Agent: *
  Allow: /
  Disallow: /search
  
  Sitemap: https://www.nea.gov.sg/sitemap.xmlNEA HTTP 200 98620
  href="/docs/default-source/default-document-library/20240102-terms-and-conditions---addendum-a-of-cleaning-business-licence.pdf"
  href="/docs/default-source/default-document-library/20240102-terms-and-conditions-of-cleaning-business-licence.pdf"
  [… 1,257 chars cut …]
  href="https://www.myskillsfuture.gov.sg/content/portal/en/training-exchange/course-directory.html"
  ```

  </details>

- **Bash** — Resolve and fetch NEA licensed cleaning businesses list
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 30 -A "$UA" -o /dev/null -w "HTTP %{http_code} -> %{redirect_url}\n" https://go.gov.sg/nea-list-of-lcbs; R=$(curl -s -m 30 -A "$UA" -o /dev/null -w "%{redirect_url}" https://go.gov.sg/nea-list-of-lcbs); echo "$R"; curl -s -m 90 -A "$UA" -L -o nea_lcbs_download -w "HTTP %{http_code} %{size_download} %{content_type} %{url_effective}\n" "$R"; file nea_lcbs_download
  ```

  <details><summary>result</summary>

  ```
  HTTP 200 -> 
  
  curl: option : blank argument where content is expected
  curl: try 'curl --help' or 'curl --manual' for more information
  nea_lcbs_download: cannot open `nea_lcbs_download' (No such file or directory)
  ```

  </details>

- **Bash** — Inspect go.gov.sg redirect page
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 30 -A "$UA" -o gogovsg_lcbs.html https://go.gov.sg/nea-list-of-lcbs; wc -c gogovsg_lcbs.html; grep -o -E '(https?://[^"'"'"' <>]+)' gogovsg_lcbs.html | grep -v -E 'go\.gov\.sg/(_next|static)|googletagmanager|fonts' | sort -u | head -15; grep -o -E '"longUrl":"[^"]+"|"url":"[^"]+"|content="0;[^"]*"' gogovsg_lcbs.html | head
  ```

  <details><summary>result</summary>

  ```
  2647 gogovsg_lcbs.html
  https://file.go.gov.sg/nea-list-of-lcbs.pdf
  https://www.gov.sg
  ```

  </details>

- **Bash** — Download and parse NEA licensed cleaning businesses PDF
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 90 -A "$UA" -L -o nea_list_of_lcbs.pdf -w "HTTP %{http_code} %{size_download} %{content_type}\n" https://file.go.gov.sg/nea-list-of-lcbs.pdf; python3 - <<'EOF'
  import fitz,csv
  d=fitz.open('/tmp/sg-sources/nea_list_of_lcbs.pdf'); print('pages',d.page_count)
  print(d[0].get_text()[:600])
  rows=[]
  for p in d:
      for t in p.find_tables().tables:
          rows+=[[(c or '').replace('\n',' ').strip() for c in r] for r in t.extract()]
  print(len(rows)); [print(r) for r in rows[:4]]; print(rows[-1])
  csv.writer(open('/tmp/sg-sources/nea_licensed_cleaning_businesses.csv','w')).writerows(rows)
  print(d.metadata)
  EOF
  ```

  <details><summary>result</summary>

  ```
  HTTP 200 1240755 application/pdf
  pages 59
  As at 28 September 2026
  Business Name
  UEN
  Licence No.
  Licence Expiry Date
  Class Issued
  @1A FMC PTE. LTD.
  201912436H
  NEA260426/2436H/C1/R02
  07/05/2028
  Class 1
  @BSOLUTE CLEANING PTE. LTD.
  201317775M
  NEA250065/7775M/C3/R01
  24/01/2027
  Class 3
  @BSOLUTE CLEANING PTE. LTD.
  201317775M
  NEA260415/7775M/C2/R02
  24/01/2029
  Class 2
  @BSOLUTE PART TIME MAID PTE. LTD.
  201409938C
  NEA250764/9938C/C2/R02
  13/05/2028
  Class 2
  @KLEANSG SERVICES PTE. LTD.
  202136711K
  NEA250986/6711K/C2/R02
  18/04/2028
  [… 637 chars cut …]
  '', 'keywords': '', 'creator': '', 'producer': '', 'creationDate': "D:20260928095452+08'00'", 'modDate': "D:20260928095454+08'00'", 'trapped': '', 'encryption': None}
  ```

  </details>

- **Bash** — Check NEA terms and profile downloaded lists
  
  ```
  cd /tmp/sg-sources; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; curl -s -m 30 -A "$UA" -L -o terms_nea.html -w "HTTP %{http_code}\n" https://www.nea.gov.sg/terms-of-use; python3 - <<'EOF'
  import re,html
  s=open('/tmp/sg-sources/terms_nea.html',encoding='utf-8',errors='ignore').read()
  t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>',' ',t); t=html.unescape(re.sub(r'\s+',' ',t))
  m=re.search(r'reproduc',t); print(t[max(0,m.start()-200):m.start()+300] if m else 'none')
  EOF
  python3 -c "
  import csv,datetime
  r=list(csv.reader(open('/tmp/sg-sources/nea_licensed_cleaning_businesses.csv')))[1:]
  r=[x for x in r if len(x)==5 and x[0]!='Business Name']
  print(len(r), 'unique UEN',len({x[1] for x in r}))
  import collections; print(collections.Counter(x[4] for x in r))
  "; python3 -c "
  import csv,collections
  r=list(csv.DictReader(open('/tmp/sg-sources/bca_licensed_builders.csv')));print(len(r),collections.Counter(x['class_code'] for x in r).most_common(8))
  r=list(csv.DictReader(open('/tmp/sg-sources/hsa_poison_licence_holders.csv')));print(len(r),collections.Counter(x['LicenseType'] for x in r).most_common(5))"
  ```

  <details><summary>result</summary>

  ```
  HTTP 200
  by NEA. 3. PRIVACY STATEMENT Please click here to review this Site's Privacy Statement. 4. RESTRICTIONS ON USE OF THE CONTENTS 4.1 Except as otherwise provided, the Contents of this Site shall not be reproduced, republished, uploaded, posted, transmitted or otherwise distributed in any way, without the prior written permission of NEA. 4.2 Subject to Clause 4.3, to use any parts of the Contents of this Site, the user must seek NEA's permission in writing, stating the: contents for use; intent of 
  2062 unique
  [… 51 chars cut …]
  'Class 1': 304})
  5214 [('GB2', 2866), ('GB1', 1440), ('SB(SS)', 375), ('SB(PW)', 189), ('SB(PC)', 127), ('SB(GS)', 127), ('SB(SI)', 47), ('SB(IM)', 31)]
  269 [('PO_FA', 269)]
  ```

  </details>

- **Bash** — Count CSRO licences and stale builder rows
  
  ```
  cd /tmp/sg-sources; python3 - <<'EOF'
  import csv,collections
  rows=list(csv.reader(open('/tmp/sg-sources/csro_licensed_business_entities.csv')))
  data=[r for r in rows if r and r[0].strip().isdigit()]
  sections=[r[0] for r in rows if r and r[0].startswith('(')]
  print(len(data),'unique UEN',len({r[2] for r in data})); print(sections)
  print(collections.Counter(r[3].split('/')[1] if '/' in r[3] else '?' for r in data))
  EOF
  head -c 400 dgs_probe_batch2.txt >/dev/null; python3 -c "
  import csv; r=list(csv.DictReader(open('/tmp/sg-sources/bca_licensed_builders.csv'))); import datetime
  print(sum(1 for x in r if datetime.datetime.strptime(x['expiry_date'],'%d/%m/%Y')<datetime.datetime(2026,9,29)))"
  ```

  <details><summary>result</summary>

  ```
  711 unique UEN 479
  ['(A) Managed Security Operations Centre Monitoring', '(B) Penetration Testing']
  Counter({'PTS': 396, 'SOC': 315})
  835
  ```

  </details>

Probing is complete. Writing the report now.

- **Write** `~/Documents/codes/gebiz-triage/planning/research/permits-licences-sources.md`

  <details><summary>result</summary>

  ```
  File created successfully at: ~/Documents/codes/gebiz-triage/planning/research/permits-licences-sources.md (file state is current in your context — no need to Read it back)
  ```

  </details>

- **Edit** `~/Documents/codes/gebiz-triage/planning/research/permits-licences-sources.md`

  <details><summary>result</summary>

  ```
  The file ~/Documents/codes/gebiz-triage/planning/research/permits-licences-sources.md has been updated successfully. (file state is current in your context — no need to Read it back)
  ```

  </details>

I found working machine-readable sources for all four areas and fetched each one; the report ranks them and recommends five to index.

1. **GeBIZ supply heads (EPU/GRA):** the full list and the grade-to-tendering-capacity table are in `https://www.gebiz.gov.sg/docs/Appln_Guidelines_for_Gov_Supp_Reg.pdf` (dated 28 Oct 2025). It has 45 supply heads and grades S2 $100k up to S10 >$30m; I parsed it to JSON. There is no bulk list of who holds which supply head. The public GeBIZ Supplier Directory (a session-based HTML form) answers one company registration number (UEN) at a time; for example, NCS holds EPU/CMP/10 at S10, expiring 06 May 2027.
2. **BCA contractors, bulk list:** data.gov.sg `d_dcda79be4aded5f9e769b8e23ff69b47` works (24,014 rows, 15,864 UENs, 71 workheads, open licence). It is 8 months stale: last updated 12 Jan 2026, and 5,475 rows show expiry dates already past.
3. **BCA contractors, live:** the BCA e-Directory is current. It has a JSON company search (`/eBACS/BCA_DIRECTORY/Utility/SearchCompanies?searchKey=`) plus HTML detail and per-grade list pages. From it I built a 70-workhead code/title/grade list. The tendering limits page (updated 16 Jun 2026) gives CW01/02 A2 as S$105m and B1 as S$50m. Several third-party websites say 90 and 40, which is wrong.
4. **GoBusiness licence directory:** there is no REST API. Requesting each licence page with the header `RSC: 1` returns a structured JSON licence object. I captured all 324 licences, with issuing agency, fees, processing time, validity, required documents and prerequisite licences.
5. **Company identity:** the ACRA datasets on data.gov.sg are current (updated 15–16 Sep 2026) and openly licensed. They give live/struck-off status and industry codes, and UEN lookup works through the API. The industry-code description field is unreliable, so match the codes to a separate table.
6. **Other lists that work:**
   - bizSAFE: 51,013 rows keyed by UEN, dated 23 Sep 2026.
   - NEA licensed cleaning businesses: about 2,060 licences with UEN, as at 28 Sep 2026.
   - Licensed penetration-testing and security-monitoring providers (CSRO): 711 licences with UEN.
   - Security agencies: the police competency-results PDFs (no UEN).
   - SFA food establishments: a JSON API behind its search page (no UEN).
   - Small data.gov.sg lists: licensed builders, public-sector consultant panels, poison licence holders, architecture firms.
7. **Stale or useless:** the NEA "cleaning contractors" dataset on data.gov.sg has only 5 rows (coverage ends 2020), and the NEA eating-establishments dataset ends in 2016.
8. **Terms, which matter for a public repo:** only the data.gov.sg datasets can be redistributed (open licence, with attribution). GeBIZ, BCA, GoBusiness, NEA, the police, CSRO and SFA all forbid republishing without written permission. GoBusiness allows copies for internal business use only. So ship small samples or derived facts with source links, and fetch the rest at runtime. robots.txt allows every path I used.
9. **Recommended five to index:**
   - the supply-head table, plus live per-UEN GeBIZ lookups;
   - BCA workheads and tendering limits, the data.gov.sg list, and live e-Directory checks;
   - the GoBusiness licence records;
   - the bizSAFE register;
   - the ACRA company register.

Add NEA, CSRO, police and poison-licence lists only when a tender's sector needs them.

The report is at `~/Documents/codes/gebiz-triage/planning/research/permits-licences-sources.md`. Raw samples and scraper scripts are in `/tmp/sg-sources/` (33 MB).
