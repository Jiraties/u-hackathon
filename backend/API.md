# API v1

สถานะการพัฒนาและเกณฑ์ทดสอบแยกตาม Phase: [PHASES.md](PHASES.md)

Base URL: `http://127.0.0.1:3001`. JSON request/response; error เป็น `{ "error": "..." }`; HTTP 400 invalid input, 401 unauthorized, 403 wrong issuer, 404 not found, 409 conflict, 503 operation/verification unavailable

ใช้ `Authorization: Bearer <token>` ตาม role; student token ได้จาก login ไม่มี token ของ university/admin ใน browser bundle ตัวระบบปัจจุบันรองรับ **หนึ่ง institutional issuer signer ต่อ backend instance** การขยายหลายมหาวิทยาลัยต้องมี trusted issuer routing และการแยก signer เพิ่ม

| Method / path | Authorization | หน้าที่ |
|---|---|---|
| GET `/health` | public | process liveness |
| GET `/ready` | public | Mongo + RPC chain + contract + signer authorization |
| POST `/v1/admin/students` | ADMIN_API_TOKEN | provision บัญชีนักเรียน |
| POST `/v1/auth/login` | public, rate limited | รับ opaque session 8 ชั่วโมง |
| POST `/v1/auth/logout` | student token | revoke session |
| GET `/v1/me/wallet` | student token | ผลของบัญชีตัวเองและสิทธิ์จาก chain |
| GET `/v1/me/results/:id/proof` | student token | private report/salt + live integrity check |
| POST `/v1/me/results/:id/confirm` | student token | บันทึกคำยืนยันที่ authenticate แล้ว |
| POST `/v1/issuer/programs` | ISSUER_API_TOKEN | register + lock program/rules |
| POST `/v1/integration/results` | INTEGRATION_API_TOKEN | durable intake + result commitment |
| POST `/v1/issuer/results/:id/issue` | ISSUER_API_TOKEN | บันทึก confirmation บน chain และออกสิทธิ์ |
| POST `/v1/issuer/credentials/:id/status` | ISSUER_API_TOKEN | enrolled/withdrawn/revoked |
| GET `/v1/public/programs` | public | rules และ chain counts (สูงสุด 200 โปรแกรม) |
| GET `/v1/public/programs/:id/events` | public | program events แบบแบ่งช่วง block |
| GET `/v1/public/verify/:id` | public | credential status อ่านจาก chain |

ทุก `:id` ของ result/program/credential เป็น **bytes32 hex 0x + 64 ตัว** ไม่ใช่ student ID หรือ frontend fixture `FP-2027-00842` ห้าม hash student ID หรือนำชื่อมาใช้เป็น credential code; backend สร้าง opaque result/credential IDs ด้วย randomness 256 bits

## Provision และ login

```json
{ "studentId": "fictional-pim", "name": "Pim (fictional)", "password": "a-long-demo-password" }
```

ส่งไป `/v1/admin/students` ด้วย admin token; login ใช้ `{ "studentId": "fictional-pim", "password": "a-long-demo-password" }` ได้ `{ token, expiresAt }` ส่วน `/v1/me/*` ไม่รับ student ID ที่ client เลือก เพื่อป้องกันการอ่านบัญชีอื่น

## Register rules

`POST /v1/issuer/programs`:

```json
{
  "programId": "0x1111111111111111111111111111111111111111111111111111111111111111",
  "academicYear": 2027,
  "capacity": 1,
  "rules": {
    "name": "Fictional Engineering",
    "weights": { "math": 6000, "english": 4000 },
    "minimumScore": 50,
    "tieBreak": "opaque-applicant-id-ascending",
    "fictional": true
  }
}
```

Weights รวม 10000 basis points; backend เติม version/year/capacity ใน rules แล้ว hash canonical JSON และ lock ใน transaction แยก โปรแกรมใน endpoint นี้เป็น fictional MVP rules เท่านั้น contract รองรับ opaque rules hash สำหรับ integrations อื่น หากต้องการเริ่มรอบ/ปีใหม่ให้ใช้ program ID ใหม่

## Authenticated result intake

`POST /v1/integration/results`:

```json
{
  "eventId": "pim-fictional-round3-v1",
  "studentId": "fictional-pim",
  "academicYear": 2027,
  "round": "fictional-round-3",
  "outcome": "admitted",
  "programId": "0x1111111111111111111111111111111111111111111111111111111111111111",
  "scores": { "math": 95, "english": 90 },
  "preferences": ["0x1111111111111111111111111111111111111111111111111111111111111111"],
  "trace": [{
    "programId": "0x1111111111111111111111111111111111111111111111111111111111111111",
    "eligible": true,
    "calculatedScore": 93,
    "explanation": "Selected by fictional deferred acceptance"
  }],
  "source": "fictional-simulator"
}
```

ผู้ไม่ผ่านใช้ `outcome: "not_admitted"`, `programId: null` ยังมี preferences/trace ได้ ทั้งสองแบบ return `{ resultId, commitment, grantsAdmissionRight: false, chainId, contractAddress, deploymentBlock }` ผลสมัครไม่ใช่ admission right

`source: "external-adapter"` รับได้เฉพาะผ่าน integration token เช่นกัน เป็นชื่อแหล่งรายงาน ไม่ใช่การรับรองว่าเชื่อม MyTCAS หรือรับรองคะแนนแล้ว

ส่ง **eventId เดิมและ payload เดิม** เพื่อ retry จะใช้ resultId/credentialId/salt เดิม ส่ง eventId เดิมแต่แก้ payload ได้ 409; อย่าสร้าง eventId ใหม่เพื่อ retry ธุรกรรมที่ timeout ตรวจ chain ก่อนเสมอ ยังไม่มี API สำหรับแก้ไข attestation ที่บันทึกแล้ว

## Confirm → issue → lifecycle

1. นักเรียน `POST /v1/me/results/<resultId>/confirm` body `{}`
2. มหาวิทยาลัย `POST /v1/issuer/results/<resultId>/issue` body `{}`
3. รับ `credentialId` และอ่าน public verify; retry issue ใช้ ID เดิม ไม่ออกซ้ำ
4. เปลี่ยนสถานะด้วย:

```json
{ "status": "withdrawn", "reasonCommitment": "0x2222222222222222222222222222222222222222222222222222222222222222" }
```

`reasonCommitment` ควรเป็น salted hash ของเหตุผลที่เก็บส่วนตัว ห้ามใส่ข้อความ PII ลง chain

นักเรียนไม่สามารถเรียก issuer endpoint ด้วย session ของตัวเองได้ สำหรับถอนสิทธิ์ MVP นี้มหาวิทยาลัยเป็นผู้ authenticate และส่งคำสั่ง lifecycle; ยังไม่มี student self-withdrawal API

การนำที่นั่งที่ถอนแล้วกลับมาใช้ ต้องลงนามอนุมัติแยก:

```sh
npm run reallocate -- 0x<PROGRAM_ID> 1 0x<PRIVATE_REASON_COMMITMENT>
```

คำสั่งนี้ **เพิ่ม allowance** ห้ามรันซ้ำโดยไม่ตรวจผลเดิม ถ้า RPC timeout ให้ตรวจ events/state ก่อน ไม่ใช่ HTTP endpoint ที่ retry อัตโนมัติ

## Verification และ events

Public verify ไม่ส่งชื่อ คะแนน preferences, subject binding, resultId หรือ salt; QR/code ตรวจความมีอยู่และสถานะเท่านั้น ไม่พิสูจน์ว่าผู้นำเสนอเป็นเจ้าของบัญชีนักเรียน

`valid` หมายถึง active/enrolled right ที่ contract ออกโดย issuer ที่ได้รับอนุญาตในขณะออก `issuerCurrentlyAuthorized` แสดงสถานะปัจจุบันแยกต่างหาก การถอด issuer ออกจาก allowlist ไม่เพิกถอน credentials เก่าอัตโนมัติ

RPC ล่ม → HTTP 503 `verification_unavailable`; chain อ่านได้แต่ไม่มี ID → HTTP 404 `not_found`; ห้ามแปลงทั้งสองกรณีเป็น valid

Events query: `?fromBlock=100&toBlock=2099` สูงสุด 2000 blocks ต่อครั้ง default เริ่ม deployment block และ response มี `nextBlock` ให้ไล่จนครบ ผู้ใช้ต้องตามทุกหน้าเพื่อได้ประวัติทั้งหมด

API ไม่ได้เขียน adapter ลง frontend เดิม ให้ทีม frontend เชื่อม endpoint และแปลง model อย่างชัดเจนภายหลัง frontend ports เดิมยังเป็น demo types และไม่ได้ตรงกับ API ทุก field

## Browser integration: complete shared rulebooks

One configured INSTITUTION_ID maps to one issuer signer. Institutional bearer sessions are separate from student sessions; machine tokens remain server/CLI credentials.

- POST /v1/admin/operators (admin token): {operatorId,name,institutionId,password}.
- POST /v1/auth/institution/login: {operatorId,password} → {token,expiresAt,institutionId,name}.
- POST /v1/auth/institution/logout (institution session): invalidate session.
- POST /v1/office/rulebooks/publish (institution session): complete AdmissionRulebook from backend/shared/domain.ts, with draft/preview status and null chainReference/publication. Returns program key, rules hash and registration/lock receipts. The intake key includes institution/program/year/round, excluding version. Changed rules in an existing intake return 409.
- GET /v1/office/results (institution session): scoped results, confirmations and credentials.
- POST /v1/office/simulations (institution session): {runId,programIds:bytes32[],applicants:[{id,scores:[{id,subject,label,score,maximum,provenance:"simulated-exam-provider"}],preferences:logicalProgramId[],qualifications:{curriculum:string}}]}. Requires existing students/locked rules. Maximum 100 applicants and 10 programs, same year/round. One run claims each intake; retries retain result IDs.
- Existing issuer result issuance and credential lifecycle endpoints also accept institution sessions, with program scope checks. Machine-token compatibility is retained. Issuance returns its saved receipt where available; after a mined transaction/database-update loss, receipt may be null while chain state is recovered.

Public program DTOs add rulebook, registration and lock (nullable for legacy records). rulesMatch uses SHA-256 for shared rulebooks and legacy Keccak otherwise. Event DTOs use event, transactionHash, blockNumber, logIndex and nullable nextBlock.

Wallet DTOs add publication/issuance receipts and credential lifecycle. Simulator reports pin rulebook snapshots, private score records, qualifications and run ID. Public verification never returns these private fields.

Shared ranking uses unrounded normalized weighted sums, stable summation and ascending applicant IDs for exact ties. Display scores round to two decimals. Result attestations retain salted Keccak fairpass-result-v1. The legacy CLI simulator remains a compatibility protocol; browser processing uses the shared full-rulebook engine.

See [Live demo guide](../docs/live-demo-guide.md) for setup and tests.
