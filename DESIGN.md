# FairPass design direction

**Approved baseline: October 15, 2026.**

The current student-first digital-pass design is the visual standard for FairPass.
Read this document before changing the frontend. Extend the existing design;
do not introduce a new visual direction unless the user asks for one.

This supersedes the earlier corporate academic SaaS, College Board, and
MyTCAS-inspired directions. Those references informed earlier iterations; they
are not the target for future work.

## Product character

**Duolingo's simplicity + Apple Wallet's digital passes + Web3's verifiability.**

FairPass should feel friendly, calm, and straightforward for students. Its main
object is a meaningful university-issued academic token, presented as a digital
pass. Someone unfamiliar with blockchain should understand within 15 seconds that
the university issues the credential and anyone can independently check it.

- Give each screen one clear purpose and one dominant action.
- Make the credential the focus; let the surrounding interface recede.
- Use generous whitespace, readable copy, and large controls.
- Make blockchain understandable rather than hiding it or overwhelming the user.
- Use friendly, direct language without gamification, mascots, or excessive decoration.
- Keep the current desktop-focused scope. Do not spend time on mobile adaptation
  or mobile testing unless requested.

## Visual system

Use `web/src/style.css` as the implementation reference. Reuse its tokens and
component styles rather than adding another theme or an override stylesheet.

| Role | Current value | Use |
| --- | --- | --- |
| Primary blue | `#0075c9` | Main actions, brand, active navigation |
| Deep blue | `#075da5` | Primary action hover |
| Token blue | `#1468da` | Admission pass body |
| Token footer | `#0959c3` | Pass network strip |
| Navy | `#15324d` | Headings and primary hierarchy |
| Text | `#18334e` | Main content |
| Muted text | `#60758a` | Supporting copy |
| Page background | `#fcfdff` | Quiet, nearly white canvas |
| Soft surface | `#f1f6fc` | Explanations and secondary grouping |
| Subtle boundary | `#e2eaf2` | Inputs and necessary separators |
| Green | `#25704f` | Active/valid status with explicit text |
| Amber | `#946724` | Withdrawal, revocation, or attention states |

### Typography

- DM Sans is the primary face. Keep the existing font stack and loading approach.
- Headlines are confident and concise, with moderately tight tracking and compact leading.
- The current page heading scale is approximately 42–46px; section headings are
  approximately 23–29px; body copy is approximately 14–15px.
- Supporting labels should remain readable. Do not return to tiny uppercase,
  widely spaced labels or a dense hierarchy of microtext.
- Use sentence case, medium and semibold weights, and tabular figures where useful.
- Keep technical identifiers secondary and allow long values to wrap.

### Shape, spacing, and surfaces

- Digital passes have substantial rounded corners, approximately 22px.
- Secondary surfaces and dialogs use related rounded shapes, approximately 12–24px.
- Main buttons are at least 52px tall, with approximately 12px corner radii.
- Use soft blue surfaces, restrained boundaries, and flat fills.
- Preserve the understated stacked-pass treatment in the wallet.
- Use icons to explain an action or record, not as decoration on every block.
- Avoid dramatic gradients, glass effects, decorative shadows, noisy textures,
  market charts, trading aesthetics, and elaborate animation.
- Use subtle interaction feedback and respect reduced-motion preferences.

## Navigation and page structure

Keep the simple top navigation: **My wallet**, **Verify a token**, and
**Transparency**, with **For universities** as a secondary destination.

Preserve the existing routes:

- `/student/wallet` and `/`
- `/verify` and `/verify/:credentialId`
- `/transparency`
- `/university`

Do not bring back the persistent administrative sidebar, nested navigation,
dashboard metric grids, or large decorative marketing banners.

## Student wallet

Keep **Back to myTCAS** in the top-right navigation beside **For universities**,
leading to `https://www.mytcas.com/`. It is available for both admitted and
non-admitted students. Do not place it above the student greeting.

After issuance, the admission token is the primary visual element. Preserve the
current two-column relationship between the large pass and its short explanation.

The pass must clearly show:

- Issuing university.
- Program and degree.
- Academic year.
- Credential type.
- Token identifier.
- Current status.
- Network and verification state, with honest demo or connection labels.

Keep the action hierarchy: **View token → Verify → Share**. View token is the
dominant filled action; the others are secondary.

Before issuance, show examination records instead of a nonexistent admission
token. When a token exists, keep exam records in progressive disclosure below it.
Do not turn the wallet into a transcript dashboard or require MetaMask.

Use the existing token-detail and share dialogs. Sharing should explain what the
link reveals and avoid disclosing personal information.

## Explain verification simply

### Non-admitted students

Preserve the admitted wallet. For an unsuccessful applicant, replace the token hero
with an **Admission Result** card and a neutral **Not admitted** status. Use the
heading **Your result. Clearly explained.** and primary action **See why →**.

Lead directly from the result into its supporting records and program calculation
trace. Do not add a separate “Your proof journey”, blockchain comparison lesson,
or “Try changing the result” exercise. Evidence should be available where the
student encounters each record, without introducing hypothetical tampering.

Use compact proof badges beside the timeline and calculation steps. Each opens a
direct Web3 evidence modal for that step: source, applicable formula, commitment,
network, contract, transaction, block and independent verification state. Use
**On-chain** with a check only when authenticated chain evidence has actually been
verified. Rule badges use a quiet blue check and **Smart contract rules** (or **Contract
criteria** for eligibility). Other records use specific labels such as **Score
record**, **Calculation**, and **Result record**. Keep demo and missing-chain
qualifiers inside the proof modal and retain the page’s fictional-data context.
A blue rule badge identifies contract-oriented provenance in the preview; it must
not say **Verified** unless a real verification exists. Never create fake transaction data to fill a modal.

Ranked Thai programs are selectable cards with the full calculation visible:
**Scores → Formula → Calculated score → Eligibility → Reported outcome**.
Keep responsive changes scoped to the non-admitted experience and preserve the
admitted screen. Keep privacy and allocation limitations concise; detailed
verification explanations belong in the relevant modal.

Show ranked programs and their locally calculated, program-specific scores.
Let students inspect the formula and reported subject inputs. Calculation alone is
not authentication or allocation verification; distinguish all three checks:

- **Score authenticity:** authenticated examination-provider evidence.
- **Result integrity:** the private report matches a commitment actually recorded
  and checked on-chain.
- **Allocation correctness:** recomputation using complete, authenticated inputs
  and the applicable verified allocation algorithm.

Use neutral unverified/unavailable states when evidence is absent. Never give the
allocation a verified/fair badge just because a report exists or a hash matches.
Explain commitments as sealed references to report versions, with technical evidence
available on demand. They do not establish the truth of the committed contents.

Model a result attestation separately from an admission-right token. The result
grants no seat. Unsuccessful applicants must not receive or see an admission-right
token, including when inconsistent upstream data attaches one accidentally.
Identity, scores, and ranked choices stay in the private account; a public projection
contains only an opaque, randomized commitment and its evidence. Keep the seeded
admitted/non-admitted demo switch available without changing the admitted hero.

### Admission-token explanation

Preserve the expandable **How verification works** interaction:

1. The university issues the credential.
2. Avalanche records it.
3. Anyone can check its authenticity and current status.

Use short sentences and simple icons. Describe this as the connected product flow
when the current experience is only a demonstration.

Put contract addresses, transaction hashes, and issuer evidence under
**View blockchain details**. Technical implementation details should not dominate
the student experience.

## University rulebooks and issuance

Lead the university console with **Set the rules. Make them checkable.** Program
rulebook cards show year, capacity, version and honest Draft / Local preview /
Published status. Creating a rulebook is primary; issuing credentials is secondary.

Use a focused four-step builder: **Program details → Scoring rules → Eligibility →
Review rulebook**. Show the score composition visually, use editable weights and
component scales, and validate the total at 100% for normalized weighted sums.
Other scoring methods need an explicitly modeled adapter; do not imply these
sample formulas describe every official TCAS program.

Review the full rules with a fictional student calculation. **Publish on Avalanche**
remains disabled until a versioned Fuji registry and authorized signer exist.
**Prepare local preview** produces a fixed local version and deterministic rule
fingerprint; it never means published or verified on-chain. Historical versions
cannot be edited. Changes create a new version.

The local central simulator handles preferences and program-specific rankings.
Keep that separate from university rule authoring. Student results reference the
same rulebook ID and version used for processing; newer versions never silently
replace historical rules. Local simulation does not verify allocation fairness.

Preserve **Choose program → Import confirmed students → Review & issue** under
**Issue admission tokens**. Preview capacity comes from the prepared rulebook.
Actual issuance remains disabled and must ultimately use live contract capacity,
authorization and confirmation state. A frontend counter cannot enforce it.

## Public transparency

Lead with the large capacity visualization and a plain-language comparison of
active rights against authorized seats. Use a simple timeline for institutional
changes rather than a technical event table.

Program selection must keep counts and history associated with the same program.
Clearly distinguish sample counts from actual contract checks, and partial sample
history from a complete audit trail.

Explain both the guarantees and their limits: contracts can enforce registry
authorization, capacity, and lifecycle rules. They cannot establish that the
underlying admissions selection was fair or account for off-system admissions.
An unoccupied seat does not automatically authorize a new offer.

## Independent verification

Keep a single prominent token-code/link field and one **Verify token** action.
The result should be immediately understandable:

- Valid.
- Withdrawn or revoked.
- Not found.
- Unable to verify.

Show the issuer, relevant program, and current status. Keep detailed evidence
expandable. An unavailable check must never be presented as an invalid token.
Unknown identifiers must never fall back to a positive sample result.

Local demo results must explicitly say they are simulated. QR scanning remains
clearly unavailable until it is actually implemented.

## Content and technical honesty

- Retain Thai university examples, currently Kasetsart, Chulalongkorn, and Thammasat.
  University names are illustrative and imply no affiliation.
- All current scores, applicants, admission records, capacities, and issuance
  examples are fictional. Keep that distinction visible.
- FairPass complements official admissions infrastructure; it does not replace TCAS
  or decide who deserves admission.
- Do not claim real on-chain verification from an imported record, a transaction
  hash, a green badge, or a local lookup.
- Do not expose student names, national IDs, exam scores, or preference rankings
  in public blockchain records.
- Tokens are non-transferable academic credentials, not financial assets.
- A wallet-like credential vault does not imply student-controlled NFT ownership
  or a student-controlled blockchain address.
- A valid credential or sharing link does not establish the presenter's identity.

## Implementation guidance

Preserve working routes, typed view data, and the private-backend/public-registry/
authorized-writer boundaries in `web/src/services/ports.ts`. Keep presentation
changes separate from backend or contract implementation.

Reuse the existing components:

- `Layout` and shared UI primitives.
- `TokenCard` for the digital pass.
- `VerificationGuide` for the three-step explanation.
- `BlockchainDetails` for secondary evidence.
- `ShareTokenButton` for the local share interaction.

Do not add a UI framework, animation library, new font, or other dependency when
the existing React and CSS can deliver the change. Prioritize focused, reviewable
improvements that preserve this approved design.

Before finishing a visual change, check the relevant desktop layout, hierarchy,
readability, action states, and demo labels. Report verification accurately; do not
claim browser validation that did not happen. Documentation-only changes do not
need application tests.

## Connected UI implementation — 16 October 2026

This addendum records the connected implementation in `web/src/LiveApp.tsx`,
`web/src/components/Layout.tsx`, `web/src/components/ShareTokenButton.tsx`, and
`web/src/style.css`. The approved digital-pass direction above remains the visual
baseline. This is an implementation record, not a replacement design system.

### Scope and language

- Default routes render the connected UI and request `/api/v1`; `?preview=1`
  explicitly selects the original local fixtures. An unavailable API does not
  substitute preview records.
- Earlier guidance about disabled live publication/issuance, local-only sharing,
  demo switching, and preparing a local rulebook preview describes `?preview=1`.
  The connected university flow performs authorized API operations and reports
  their returned state. The fictional admissions context remains visible in both.
- The connected interface is English, with document language `en`. Retain English
  labels, explanations, and context while keeping university/program names as
  record data. Copy uses short sentences and familiar words suitable for Grade 12
  students; technical payloads and chain identifiers remain secondary disclosures.

### Preserved visual system and mobile adaptation

- Reuse DM Sans, primary blue (`#0075c9`), navy (`#15324d`), the admission-pass
  body (`#1468da`) and network strip (`#0959c3`), rounded passes, quiet surfaces,
  and the established top navigation. No new token vocabulary or theme is added.
- Connected layout changes are scoped by `body.connected-view` in the existing
  stylesheet. The connected experience now includes phone adaptation, including
  390px layouts; the earlier desktop-only scope does not limit this requested work.
  At the existing 1000px and 640px breakpoints, navigation wraps, content grids
  collapse, verification controls stack, and dialogs fit the viewport.
- Preserve **View token → Verify → Share** on the admitted pass, including compact
  phone controls. **Back to myTCAS** stays in wallet navigation beside **For
  universities**, for admitted and non-admitted students.

### Connected component behavior

- An issued admitted wallet keeps its pass first. A native, initially closed
  **Scores and admission result** disclosure holds private scores and calculation
  traces below it. Unsuccessful applicants see their result and explanation, with
  no admission-right token. An offer awaiting issuance remains a separate state.
- Ranked program cards select one calculation trace. Its sequence is **Scores →
  Formula → Calculated score → Eligibility → Reported admission outcome**.
  Preference order comes from the report trace; missing order is labeled
  unavailable. The displayed outcome is explicitly the overall round result, not
  a claim that the selected calculation establishes why a seat was assigned.
- The four-step university builder retains **Program details → Scoring rules →
  Eligibility → Review rulebook**. Review includes editable fictional score and
  curriculum inputs evaluated by the shared `evaluateRulebook` implementation.
  Draft saves use an expected revision; publication locks one rulebook version
  for an intake. Changed locked rules require another intake in this implementation.
- Connected sharing opens the existing dialog with a public verification link,
  copy feedback, and an identity limitation. Names and scores remain private.

### API and evidence truth

- Private student and institution actions require API sessions. Machine credentials
  and signing keys stay outside the browser. Transaction progress, failures, and
  returned receipts must remain distinct from successful chain verification.
- Result integrity, score authenticity, and allocation correctness remain separate
  checks. A matching commitment does not authenticate scores or verify allocation
  fairness; this connected demo does not establish those latter guarantees.
- The chosen Fuji demo retains its existing registry and public development keys;
  registry/key migration was declined. Contract state is not proof that a real
  university signed a record. Keep fictional-record and no-affiliation context.

Desktop and phone review captures are stored under
`backend/cache/connected-*-desktop.png` and `backend/cache/connected-*-mobile.png`,
including wallet, non-admitted result, sign-in, verification, transparency,
university console, builder, and builder review. These captures document the
connected surfaces; they do not establish production readiness or admissions
fairness. Runtime/setup details remain in `docs/live-demo-guide.md`.
