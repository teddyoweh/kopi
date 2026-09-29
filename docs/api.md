# Kopi API

Every route except `/health` and `/auth` needs `Authorization: Bearer <token>` when the
server has access codes configured (`KOPI_ACCESS_CODES`). Get a token with `POST /auth`.
Types: `kopi/models.py` → `openapi.json` → `web/lib/api-types.ts` (`make types`).

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/health` | | `{ok, auth}` |
| POST | `/auth` | `{code}` | `AuthResponse {token, expires_at}` (12 h) |
| GET | `/search` | `q`, `limit`, `status`, `agency`, `category`, `method`, `closing_after`, `closing_before` | `SearchResponse` |
| GET | `/tenders` | same filters, `limit`, `offset` | `NoticeSummary[]`, newest first |
| GET | `/tenders/{doc_no}` | | `TenderDetail` (no eligibility) |
| POST | `/tenders/{doc_no}/detail` | `{profile}` | `TenderDetail` with eligibility for the profile |
| POST | `/tenders/{doc_no}/overview` | `{profile}` | `Overview` (AI, quotes verified) |
| POST | `/eligibility` | `{doc_no, profile}` | `EligibilityCheck[]` |
| GET | `/awards/similar` | `q`, `agency`, `k` | `MarketContext` |
| GET | `/licences` | `limit`, `offset` | `Licence[]` |
| GET | `/licences/search` | `q`, `limit` | `Licence[]` |
| POST | `/chat` | `ChatRequest {message, session_id?, profile, doc_no?}` | SSE stream of `ChatEvent` (`event:` = type) |
| GET | `/sessions/{id}/files` | | `SessionFile[]` |
| GET | `/sessions/{id}/files/{name}` | | markdown attachment |

`status` defaults to `open`. Errors are `{"detail": "…"}` with 400/401/404/422.
