# Permits, licences and registrations: machine-readable sources (Singapore)

**Researched:** Tue 29 Sep 2026. Every source below was fetched with curl or Python on that date. Raw samples are in `~/Library/Caches/kopi/sg-sources/`, outside any repo.
**Question it serves:** "What registrations or licences does this tender require, do we hold them, and how do we get them?"

Legend. **Auth**: none means no key and no login. **Terms**: ODL is the Singapore Open Data Licence v1.0, which allows commercial use and redistribution if you attribute the source and link the licence. "No-repub" means the site's terms of use forbid reproducing or republishing content without the agency's written permission.

---

## Ranked by usefulness for tender eligibility

### 1. GeBIZ Government Supplier Registration (GSR): supply heads and financial grades (reference table)
| | |
|---|---|
| URL | `https://www.gebiz.gov.sg/docs/Appln_Guidelines_for_Gov_Supp_Reg.pdf` (18 pp, dated 28 Oct 2025). An older 2020 copy is at `/cmw/content/4/page3/2/guidelines.pdf`. |
| Auth / format | none / PDF. Tables extract cleanly with PyMuPDF `find_tables()`. |
| Size | **45 supply heads**: 38 goods/services heads in Appendix A §1 and 7 medical heads in §2. **9 financial grades** (S2 to S10) in Appendix B. |
| Fields | supply head code, title, examples of goods and services, and a licence footnote. Each grade has a tendering capacity, a minimum NTA and a minimum turnover. |
| Current? | Yes. It is dated 28 Oct 2025, when GSR processing moved to RMA Contracts Pte Ltd (fee S$43.60 normal, S$56.68 express). |
| Terms | GeBIZ ToU is DSTA's, and it is no-repub. The PDF is a public guideline, so re-keying ~54 facts into our own table is low risk, but not an ODL grant. |
| robots.txt | `Allow: /`, `Disallow: /scripts/` |

Grade table as extracted: S2 $100k · S3 $250k · S4 $500k · S5 $1m · S6 $3m · S7 $5m · S8 $10m · S9 $30m (paid-up capital ≥ S$1.5m) · S10 >$30m (paid-up capital ≥ S$2m).
Sample: `EPU/CMP/10 | Computer Hardware and software Products, Software Development and Maintenance of System, Equipment & Computers | "Readily available hardware and software products ... Software development on tailor-made basis, projects on turnkey basis ..."`
The PDF notes that EPU/FFG/10 and EPU/SER/43 (security) need a separate valid licence, as do EPU/DAP/32 (Poison Licence) and EPU/LCR/34 (Hazardous Substance Licence). It also says "GSR is not a licence".
Parsed output: `~/Library/Caches/kopi/sg-sources/gsr_supply_heads_and_grades.json`.

### 2. GeBIZ Supplier Directory: which GSR supply heads and grade a given UEN holds
| | |
|---|---|
| URL | `https://www.gebiz.gov.sg/ptn/supplier/directory/index.xhtml`. This is a public JSF form. POST the UEN or name with `javax.faces.ViewState`, then GET `searchDetail.xhtml?code=<hash>` in the **same session** (without the session cookie it returns 302). Script: `~/Library/Caches/kopi/sg-sources/gebiz_supdir.py`. |
| Auth / format | none / HTML. Field ids are dynamic (`j_idtNNN`), so parse them from each page load. |
| Size | Per-query. A search for "SECURITY" returned 117 suppliers. I did not find a bulk export. |
| Fields | name, UEN (the "Trading Partner Ref No."), address, email, areas of business, and a supply-head table: head, financial grade, expiry, status. |
| Current? | Yes, it reads the live register. |
| Terms / robots | DSTA no-repub / allowed by robots.txt. |

Sample (NCS PTE. LTD., 198101793G): `EPU/CMP/10 - Computer Related Hardware, Software, and Services | S10 >$30,000,000 (EPU S10) | 06 May 2027 | APPROVED`, plus 11 other heads. The directory's dropdown uses the same 45 codes as the PDF.

### 3. BCA Contractors Registration System (CRS), FM Registry and Suppliers (SY) Registry
**a) Bulk list, data.gov.sg** "Listing of Registered Contractors", `d_dcda79be4aded5f9e769b8e23ff69b47`
- Download: GET `https://api-open.data.gov.sg/v1/public/api/datasets/<id>/poll-download` returns a signed S3 CSV URL. For queries: `https://data.gov.sg/api/action/datastore_search?resource_id=<id>&filters={"uen_no":"..."}`.
- Auth none, CSV 3.0 MB, **24,014 rows, 15,864 UENs, 71 workheads** (CW, CR, ME, RW, TR, FM, SY). Grades are A1 to C3, L1 to L6, M1 to M4 and "Single Grade".
- Fields: `company_name, uen_no, workhead, grade, additional_info, expiry_date, building_no, street_name, unit_no, building_name, postal_code, tel_no`.
- **Stale.** It was last updated 2026-01-12 (coverage ends 2026-01-31). 5,475 rows have expiry dates before today. For example, NCS ME04 L5 shows `01/04/2026` here but `01/04/2029` in the live directory. Licence: ODL.
- Sample: `#1 DESIGN STUDIO PTE. LTD.,201925566H,CR06,L1,na,01/02/2028,1085,EUNOS AVENUE 7A,#03-10,EUNOS INDUSTRIAL ESTATE,409535,84885022`

**b) Live register, BCA e-Directory** at `https://www.bca.gov.sg/eBACS/BCA_DIRECTORY/`
- JSON autocomplete: `GET /eBACS/BCA_DIRECTORY/Utility/SearchCompanies?searchKey=NCS` returns `[{"companyName":"NCS PTE. LTD.","uenNo":"198101793G"}, ...]`
- HTML detail page: `/Company/CompanyDetails?uenNo=198101793G` gives workhead, description, grade and expiry (`ME04 Communication & Security Systems L5 01/04/2029`).
- HTML list pages: `/Filter/GetCRSCompaniesByGrade?workhead=ME04&title=...&grade=L6` returned "Total matches: 25". `/Filter/FilterWorkHeadType?contractorType=...&tradeType=...` gives the **70 workhead codes with titles and allowed grades**, saved as `bca_workheads.json`. That list covers CW01/02, CR01 to 18, ME01 to 15, RW, TR01 to 10, FM01 to 04 and SY01A to SY14. Licensed-builder classes did not parse.
- Auth none. The site is behind Incapsula, but plain browser-UA curl worked. The page says "Last Updated: 29 September 2026". Terms: BCA ToU, no-repub. robots.txt on www.bca.gov.sg only disallows `/quality-housing-portal/*`.

**c) Tendering limits** at `https://www1.bca.gov.sg/growth-and-transformation/procurement/registration-of-built-environment-firms/tendering-limits/crs-fm-and-sy-registries-tendering-limits/`
- HTML tables (Isomer), page updated 16 Jun 2026. The same limits apply for both 1 Jul 25 to 30 Jun 26 and 1 Jul 26 to 30 Jun 27. Parsed: `bca_tendering_limits.json`.
- CW01/CW02 (S$m): A1 unlimited · A2 105 · B1 50 · B2 16 · C1 5 · C2 1.6 · C3 0.8. CR/ME: Single Grade and L6 unlimited · L5 16 · L4 8 · L3 5 · L2 1.6 · L1 0.8. FM01: M1 unlimited · M2 30 · M3 10 · M4 1. FM02 to 04 and SY: L6 unlimited, then 16/8/5/1.6/0.8.
- Third-party web summaries quote A2 as 90 and B1 as 40. The live page says 105 and 50, so use the page. robots.txt: `Disallow: /search` only.

### 4. GoBusiness Licence Directory: how to get each licence (agency, fees, processing time, documents)
| | |
|---|---|
| URL | Index: `https://licensing.gobusiness.gov.sg/licence-directory/sitemap/0.xml` (**324 URLs**; the directory page also reports `totalResults: 324`). Detail: `https://licensing.gobusiness.gov.sg/licence-directory/<agency>/<slug>`. |
| Hidden JSON | The site is a Next.js App Router app. I found no REST API; the only `/api/*` strings in the JS bundles are `/api/config` and analytics-style `/api/surveys` and `/api/product_tours`. Each detail page carries a full JSON `licence` object in its React Server Components payload. **GET with header `RSC: 1`** returns ~40 KB `text/x-component` instead of ~224 KB HTML. Parse the row that contains `{"licence":{`, then resolve `$NN` references to text rows. Scraper: `~/Library/Caches/kopi/sg-sources/gobiz_scrape.py` plus `gobiz_scrape_fix.py`. |
| Auth / format | none / RSC flight, which contains JSON. www.gobusiness.gov.sg returns a CloudFront 403 to curl's default UA; a browser UA gets 200. |
| Size | All **324 licences captured** in `gobiz_licences.jsonl` (2 MB). 219 are applied for on GoBusiness, 100 on the agency's own site, 5 by download. They span 42 agencies; the largest are IMDA 46, SPF 40, NEA 33 and SFA 26. Agency ids map to names via the facet in the directory page (`gobiz_agency_ids.json`). |
| Fields | `slug, display_name, short_description, long_description (HTML), agency_in_charge, industry_sector[], estimated_processing_time` (319 of 324 filled), `licence_validity` (293), `fee_details` (253, HTML), `payment_methods, documents[{title,description}]` (195), `additional_eligibility_requirements` (178, often lists prerequisite licences), `faq[], application_link_url, agency_contact_*` |
| Current? | Yes. Fees already show the 1 Apr 2026 and 1 Jul 2026 changes. |
| Terms | GoBusiness ToU allows "reasonable copies ... solely for your personal or internal business use". Any other reproduce or publish needs written permission. It also bans scraping tools that "damage or interfere" with the service. robots.txt: `User-Agent: *` with no Disallow. I used 1 request/s. |

Sample (`nea/cleaning-business-licence`): `display_name "Cleaning Business Licence"`, agency NEA (34), `estimated_processing_time "within 14 working days"`, `licence_validity "2 Years"`, `fee_details "$130 (before 1 April 2026) / $180 (from 1 April 2026)"`, `payment_methods ["PAYNOW","ONLINE"]`, prerequisite `ACRA registration`.

### 5. bizSAFE register (WSH Council / Tripartite Alliance): whether a UEN is bizSAFE-certified, level and expiry
| | |
|---|---|
| URL | `https://www.tal.sg/wshc/-/media/tal/wshc/programmes/files/bizsafe-self-help_20260923.xlsx`, linked from `/wshc/programmes/bizsafe/bizsafe-e-services`. The filename carries a date, so re-read the page to find the current file. |
| Auth / format | none / XLSX, 5.1 MB, sheet `Data`. |
| Size | **51,013 rows**: 27,711 Approved, 23,283 Expired, 19 Terminated. Levels: L3 28,294 · Star 11,226 · L4 3,956 · L1 3,919 · L2 3,029 · Partner 571 · Mentor 18. |
| Fields | `UEN, COMPANY_NAME, CERT, TYPE, ACTIVE, EXPIRY, STATUS, APPROVAL, LEVEL, DESCRPTION` |
| Current? | Yes, dated 23 Sep 2026. |
| Terms | TAL ToU has a generic IP clause and no open licence. robots.txt returns an HTML "Page Not Found", so there is effectively none. |

Sample: `198101793G, NCS PTE. LTD., E05780, E, Renewal, 2029-02-04, Approved, 2026-02-05, Level Star, "Provides comprehensive services including application development, ..."`
Also published: `bizsafe-marketplace_20260923.xlsx`, ~27k rows with name, level, expiry, description and **contact email**. It has no UEN and contains personal data, so skip it.

### 6. ACRA entity register (data.gov.sg): is the UEN live, and what does it do (SSIC)
- `d_3f960c10fed6145404ca7b821f263b87` "Entities Registered with ACRA": **2,120,264 rows**, 233.5 MB CSV, updated 2026-09-15. Fields: `uen, issuance_agency_desc, uen_status_desc, entity_name, entity_type_desc, uen_issue_date, reg_street_name, reg_postal_code`.
- Collection 2 "ACRA Information on Corporate Entities" is split across 27 datasets and updated monthly (last 2026-09-16). For example 'A' is `d_8575e84912df3c28995b8e6e0e05205a` (175,111 rows, 57 MB) and 'N' is `d_67e99e6eabc4aad9b5d48663b579746a`. It adds `entity_status_description, primary/secondary_ssic_code, account_due_date, annual_return_date, no_of_officers, former names, audit firms`.
- Auth none, ODL. UEN lookup works: `datastore_search?resource_id=d_67e9...&filters={"uen":"198101793G"}` returned `NCS PTE. LTD., Live Company, primary_ssic_code 62011`.
- **Caveat:** the SSIC description field is unreliable. Codes 62011 and 62023 both came back labelled "COMPUTER SYSTEMS INTEGRATION SERVICES (63192)", so join the codes to an SSIC table instead.

### 7. NEA licensed cleaning businesses (Environmental Public Health Act cleaning licence)
- `https://go.gov.sg/nea-list-of-lcbs` redirects to `https://file.go.gov.sg/nea-list-of-lcbs.pdf`. Linked from nea.gov.sg's Cleaning Business Licence page.
- Auth none, PDF, 59 pp, 1.2 MB, "As at 28 September 2026" (**current**). About **2,062 licence rows and 1,858 UENs**: Class 1 304, Class 2 959, Class 3 799. Fields: `Business Name, UEN, Licence No., Licence Expiry Date, Class Issued`.
- Sample: `@1A FMC PTE. LTD. | 201912436H | NEA260426/2436H/C1/R02 | 07/05/2028 | Class 1`
- Terms: NEA ToU, no-repub. robots.txt: `Disallow: /search`.
- The data.gov.sg alternative, "List of Cleaning Contractors and Location of Work" (`d_8383572b...`), has **only 5 rows**, with coverage ending 2020, so it is useless.

### 8. CSRO licensed cybersecurity service providers (penetration testing and managed SOC), for ICT tenders
- `https://www.csro.gov.sg/resources/licensed-service-providers/` links to an Isomer-hosted PDF: `https://isomer-user-content.by.gov.sg/370/3b626c97-d59b-4450-aa3d-50187ad05a82/list_of%20licensed_business_entities_25sep.pdf`. There is also a PDF of licensed individuals.
- Auth none, PDF, 41 pp, updated 25 Sep 2026 (**current**). **711 licences** (315 SOC, 396 PT) held by **479 UENs**. Fields: `S/n, Name, UEN, Licence ID`, grouped by service and Cyber Trust tier.
- Sample: `ABPCYBER PTE LTD | 201325759R | CS/SOC/C-2022-0138RR`
- Terms: CSRO ToU, no-repub. robots.txt: `Disallow: /search`.

### 9. SPF (Police Licensing & Regulatory Dept, PLRD) security agencies: SACE (Security Agencies Competency Evaluation) results, a proxy for the list of licensed security agencies
- `https://www.police.gov.sg/-/media/SPF/Files/E-services/SACE/SACE-Results/SACE-Cycle-5-Results-as-of-7-Aug-2026.pdf`. Cycle 4 and results for new agencies are linked from `/Business-E-Services/Apply-for-Security-Agency-Licence/Information-on-Security-Agencies-Competency-Evaluation`.
- Auth none, PDF with clean tables. Cycle 5 has **146 agencies** so far and is published in batches; Cycle 4 had 252.
- Fields: company, batch, assessment dates, core result, elective results E.1 to E.13, date of results, eligible licence tenure. There is **no UEN**, so join to ACRA by name.
- Sample: `A BEST SECURITY MANAGEMENT PTE LTD | C1 | 01-Jan-26 | 27-Apr-26 | Pass | ... | 27-Apr-26 | 3`
- I found no open list of all licensed security agencies. SPF ToU is no-repub. robots.txt disallows `/*/search` and sitecore paths; the media PDFs are not disallowed.

### 10. SFA (Singapore Food Agency) licensed food establishments ("Track Records")
- The page `https://www.sfa.gov.sg/tools-and-resources/track-records` loads `track-record.js`, which calls a JSON API: `GET https://www.sfa.gov.sg/api/TrackRecord/GetTrackRecord?postalCode=&establishmentAddress=&licenceNumber=&businessName=&licenseeName=&typeOfFoodBussiness=Caterer&isShowLicenceSuspended=false&grades=`. It also offers `ExportExcel`/`ExportPdf` with the same parameters, `GetTypeOfFoodBussiness`, and `Suggestion*` endpoints.
- Auth none, JSON. A caterer query returned 281 rows. Fields: `refNo, applType, establishmentAddress, licenceNumber, businessName, licenseeName, typeOfFoodBussiness, grades`. **No UEN.**
- Sample: `{"licenceNumber":"SE17730V000","businessName":"Blossom - SATS & Plaza Premium Lounge","licenseeName":"SATS PPG SINGAPORE PTE. LTD.","typeOfFoodBussiness":"Snack Counter","grades":"A"}`
- The page says data is live, with renewals reflected within 3 working days. SFA ToU bans commercial reuse without permission. robots.txt returns 404, so there is none.
- The data.gov.sg SFA/NEA datasets are stale or aggregate only: NEA eating establishments end 2016, SFA-by-grade is counts only, and several SFA dataset ids return "dataset id is invalid".

### 11. Other data.gov.sg registers worth a join (all ODL, CSV, no auth)
| Dataset | id | Rows | Updated | Use |
|---|---|---|---|---|
| BCA Licensed Builders (GB1/GB2, SB classes) | `d_19573c579879be15623f2e1e3854926d` | 5,214 | 2026-01-12, and 835 rows already past expiry | builder licence needed for building works |
| BCA Public Sector Panels of Consultants (PSPC) | `d_a347a40f7b073e56227a29eb3c9387ff` | 444 | 2026-01-08 (listing_period 2026) | panels for consultancy tenders |
| HSA poison licence holders | `d_b1d236af9430bbe874b4dd97aa97a684` | 269 | 2026-08-07 | the Poison Licence required for EPU/DAP/32 |
| BOA registered architecture firms | `d_d5c0a4ffd076a3e40d772275619bbb66` | 1,999 | 2026-08-06 | architectural services |
| HDB Directory of Renovation Contractors | `d_9973d2c119ed4dd1560aebf8f0829b86` | 2,708 | 2026-03-24 | HDB works (has UEN) |

Sample (licensed builders): `WOH HUP (PRIVATE) LIMITED, 194000021M, General Builder Class 1, GB1, expiry 16/06/2027`.

**data.gov.sg catalogue.** `https://api-production.data.gov.sg/v2/public/api/collections?page=N` returned 137 pages and **1,370 collections**, saved as `dgs_collections_all.json`. I grepped names and descriptions locally rather than using the site search. Dataset metadata comes from `/v2/public/api/datasets/<id>/metadata`. My first bulk loop stalled; a second run with 1 s spacing finished without any HTTP 429. robots.txt: `Allow: /`.

---

## Findings that matter for the build
1. **Two kinds of source.** The *requirement tables* (GSR supply heads and grades, BCA workheads and limits, the GoBusiness licence catalogue) are small, static and scrapeable. The *holder registers* (who holds what) split three ways:
   - open ODL CSVs: ACRA, and BCA data.gov.sg, which is stale;
   - current but no-repub: NEA and CSRO PDFs, the bizSAFE xlsx;
   - live HTML lookups: GeBIZ Supplier Directory, BCA e-Directory, SFA.
2. **The BCA data.gov.sg CSV is 8 months stale.** Use it for bulk indexing, but confirm "do we hold it" against the live e-Directory, which has a JSON search endpoint and an HTML detail page.
3. **No GSR bulk list exists.** The GeBIZ Supplier Directory is the only machine path to "does UEN X hold EPU/CMP/10 at S4+", and it goes one UEN at a time through a JSF session.
4. **Licensing and terms.** Only the data.gov.sg datasets are clearly redistributable (ODL, with attribution). GeBIZ/DSTA, BCA, GoBusiness, NEA, SPF, CSRO and SFA all prohibit republication without permission. For a public repo, ship small samples or derived facts with source links, and fetch the rest at runtime or keep it in a private cache.
5. **Join key.** UEN is present in GSR directory, BCA, bizSAFE, ACRA, NEA and CSRO. SACE (security agencies) and SFA have no UEN, so they need name matching against ACRA.

## Recommendation: index these 5
1. **GSR reference table**: 45 supply heads and 9 grade→capacity rows from the GeBIZ PDF. Add **per-UEN live lookups in the GeBIZ Supplier Directory** for "do we have it".
2. **BCA workheads and tendering limits**: 70 workheads with titles and grades from the e-Directory, limits from the www1 page. Use **data.gov.sg CRS CSV** as the bulk holder index and **e-Directory `SearchCompanies` + `CompanyDetails`** for live confirmation.
3. **GoBusiness licence directory**: 324 JSON records via RSC. This is the "how do we get it" answer: agency, fee, processing time, validity, documents, prerequisites. Keep it internal and link out.
4. **bizSAFE Self-Help xlsx**: 51k UEN-keyed rows, current. NEA's cleaning-licence page links a "bizSAFE Level 3 certification requirements" guidebook. How often GeBIZ tenders require bizSAFE was not measured here.
5. **ACRA entities (data.gov.sg, ODL)**: the UEN master for live or struck-off status, SSIC codes and name joins.

Sector add-ons to load only when a tender needs them: NEA licensed cleaning businesses PDF (cleaning tenders), CSRO licensee PDF (ICT and cyber tenders), SPF SACE PDF (security tenders), HSA poison licence CSV (pharma supply heads).
