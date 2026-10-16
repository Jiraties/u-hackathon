# Reference UI → Connected API

Visual and English-copy authority: `/Users/theeratdolchat/Downloads/web`. Default routes are connected; `?preview=1` preserves the original fixture experience. The API remains authoritative for authentication, publication, confirmation, capacity and issuance.

| Reference function | Connected behavior | API/domain |
| --- | --- | --- |
| Student wallet/pass | Authenticated private wallet, real lifecycle, assigned program metadata; never render a right for a non-admitted report | `/me/wallet` |
| View token | Native dialog with actual credential ID, program, year and status | Wallet projection |
| Verify / share | Real ID/link, privacy-preserving public verification; manual copy fallback | `/public/verify/:id` |
| Exam records | Private reported subject inputs and pinned rules; unavailable historical evidence remains unavailable | Wallet report `scoreRecords`/`rulebooks` |
| Non-admitted result | Neutral result card; ranked program cards and selected score/formula/eligibility/outcome trace | Private `report.trace` order and shared `evaluateRulebook` |
| Result evidence | API compares private report with on-chain commitment; authenticity/fairness remain separate unverified checks | `/me/results/:id/proof` |
| Admission confirmation | Authenticated student consent, distinct from token issuance | `/me/results/:id/confirm` |
| Rulebook gallery | Published programs and persisted drafts; open immutable rule/history details | `/public/programs`, `/office/workspace` |
| Four-step builder | Program/degree, weights, minimums, curriculum, actual editable fictional review calculation | Shared rulebook model/validation |
| Save/edit draft | Server persistence and optimistic revision conflict protection | `/office/rulebooks/drafts` |
| Publish | Register and lock real rules, wait for receipts, retain old versions | `/office/rulebooks/publish` |
| New version | Fork a draft; changed published intake requires another round | Immutable intake contract/API constraints |
| Central allocation | Real provisioned students, multiple same-round programs, preferences, preview and durable processing | `/office/students`, `/office/simulations`, shared allocation engine |
| Recover interrupted processing | Exact saved payload for pending run retry | `/office/simulations/:id` |
| Import confirmed students | Select real saved authenticated confirmations; no fixture/CSV substitution for consent | `/office/results` |
| Review/bulk issuance | Sequential real writes, capacity/allowance checks, idempotent retries | `/issuer/results/:id/issue` |
| Manage lifecycle | Enrollment/withdrawal/revocation with hashed reason and explicit confirmation | `/issuer/credentials/:id/status` |
| Capacity ring/history | Real counters, program-bound paginated event history | `/public/programs`, `/public/programs/:id/events` |
| Sample student/university switches | Retained in preview. Live sessions use their own account/institution | Authentication and institutional scope |
| Sample valid/not-found/offline shortcuts | Retained in preview. Live uses actual ID and service state | No fixture fallback |
| QR scanning | Source control was unavailable; no live camera implementation is claimed | Code/link entry remains supported |

Institution names configured for live display are labels, not proof of affiliation. Existing Fuji development keys remain unchanged by user decision. Never infer secure institutional custody from issuer authorization alone.

Finish review disposition: **PASS**. F1 admitted progressive disclosure, F2 mobile actions, F3 myTCAS navigation, F4 ranked selector/outcome, F5 evaluated rulebook trial, skip-link overlay and settled trace captures are resolved. Review used source and desktop/390px captures; it is not a comprehensive accessibility certification.

Validation: frontend build/type checks and shared-domain checks; 7/7 local EVM/API/CLI/browser tests. Real Fuji smoke checks use login/logout and read-only pages, without new public-chain writes. Public VPS/domain/Atlas deployment remains a separate installation step documented in [Hosting guide](hosting-guide.md).
