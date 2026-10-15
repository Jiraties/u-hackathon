# FairPass backend — แผนงานและผลลัพธ์ราย Phase

ขอบเขต: TypeScript backend และ Solidity เท่านั้น ทุกไฟล์เพิ่มใน `backend/` ไม่แก้หรือเชื่อม frontend เดิมโดยอัตโนมัติ

| Phase | ผลลัพธ์ | สถานะ |
|---|---|---|
| 1 — Smart contract | authorization, rule lock, result commitments, admission rights, capacity, lifecycle | เสร็จและผ่าน local EVM tests |
| 2 — Backend API | บัญชี, private records, integration intake, issuer operations, public verification | เสร็จและผ่าน API + MongoDB tests |
| 3 — End-to-end verification | simulator, deploy/bootstrap/server/demo/verify CLI | เสร็จและผ่าน local end-to-end test |
| 4 — Avalanche Fuji | network configuration, deployment scripts, คู่มือใช้งาน | สคริปต์และคู่มือพร้อม; ยังไม่ได้ deploy บน Fuji |

## Phase 1 — Smart contract

ไฟล์หลัก: [FairPassRegistry.sol](contracts/FairPassRegistry.sol)

- Admin อนุญาต institution และจัดการ result-authority role
- Institution ลงทะเบียน program/year/capacity/rules hash แล้ว lock ก่อนบันทึก admitted result
- แยก result attestation จาก admission right; ผู้ไม่ผ่านไม่มีสิทธิ์เข้าศึกษา
- Authority บันทึก confirmation; issuer ออกสิทธิ์ได้หลังยืนยันเท่านั้น
- จำกัด active rights ตาม capacity และหนึ่ง active right ต่อ opaque subject/ปี
- Enrolled ยังใช้ที่นั่ง; Withdrawn/Revoked เก็บประวัติและไม่เติม issuance allowance อัตโนมัติ
- Reallocation ต้องอนุมัติแยก; unauthorized writes และการออกเกิน capacity ถูกปฏิเสธ

**เกณฑ์ผ่าน:** compiler สำเร็จ, contract deploy บน local EVM ได้, transaction ออกเกิน capacity มี receipt `reverted`, lifecycle และ authorization checks ผ่าน

**ผล:** ผ่าน Solidity 0.8.28 / Shanghai EVM; deployed bytecode ขนาด 9,507 bytes

## Phase 2 — Backend API และ private records

ไฟล์หลัก: [app.ts](src/app.ts), [store.ts](src/store.ts), [chain.ts](src/chain.ts), [API.md](API.md)

- Student login/session/logout และการอ่านผลเฉพาะบัญชีตัวเอง
- Admin, integration และ issuer ใช้ machine tokens แยกกัน
- MongoDB เก็บข้อมูลส่วนตัวและ durable intent ก่อนส่งธุรกรรม
- Event ID เดิมพร้อม payload เดิม retry ได้; payload เปลี่ยนได้ conflict
- เก็บ salted result commitment และเทียบ report กับ chain จริง
- Public verify ไม่เปิดชื่อ คะแนน preferences หรือ salt และแยก not found จาก unavailable
- Chain counts และ event history ใช้ข้อมูลจริงจาก contract

**เกณฑ์ผ่าน:** นักเรียนอ่านผลข้ามบัญชีไม่ได้, การแก้ private report ทำให้ integrity check ไม่ผ่าน, retry ไม่ออก credential ซ้ำ, Mongo unique indexes และการเปิด connection ใหม่ยังเห็นข้อมูลเดิม

**ผล:** ผ่าน API integration test กับ MongoDB process จริงและ production chain gateway ที่เชื่อม local EVM

## Phase 3 — Simulator และทดสอบครบวงจร

ไฟล์หลัก: [simulator.ts](src/simulator.ts), [demo.ts](scripts/demo.ts), [backend.test.ts](test/backend.test.ts)

Simulator สมมติใช้ weighted scores, eligibility threshold, preferences สูงสุด 10 ลำดับ และ student-proposing deferred acceptance โดย tie-break ตาม opaque applicant ID แบบ ASCII ไม่ใช่ official TCAS engine

```sh
cd backend
npm ci
npm test
```

Test command compile Solidity และ build TypeScript ก่อนเปิด local EVM/MongoDB ชั่วคราว ครอบคลุม 5 ชุด:

1. Authority, rules lock, confirmation, capacity และ explicit seat reuse
2. หนึ่ง active right ต่อ subject/year, ผู้ไม่ผ่าน, duplicate results และ lifecycle authorization
3. Private API, idempotency, commitment tampering, public privacy และ Mongo persistence/indexes
4. Fictional matching: preferences, capacity, ties และ eligibility
5. คำสั่ง deploy → bootstrap → server → demo → independent verify จริงครบวงจรในเครื่อง

**ผลล่าสุด:** ผ่าน 5/5 ชุด ไม่มี skipped tests; ไม่ต้องใช้ private keys หรือ AVAX ของผู้ใช้ในการทดสอบ local

## Phase 4 — Avalanche Fuji deployment และใช้งาน

คู่มือเต็ม: [README.md](README.md); configuration: [.env.example](.env.example)

1. ตั้งค่า admin, result-authority และ institution issuer keys **ใน `.env` บนเครื่องผู้ใช้** และเติม test AVAX ให้บัญชีที่ส่งธุรกรรม ไม่ต้องส่ง private keys ในแชต
2. ตั้ง RPC/chain ID ของ Fuji ตาม README แล้วรัน `npm run compile` และ `npm run deploy`
3. ใส่ `CONTRACT_ADDRESS` / `DEPLOYMENT_BLOCK` จาก receipt ลง `.env`
4. รัน `npm run bootstrap` เพื่อ authorize issuer
5. เปิด MongoDB, `npm run build`, `npm start` และตรวจ `/ready`
6. รัน `npm run demo`, ตรวจ transaction ใน explorer และใช้ `npm run verify -- <credentialId>` อ่านแบบอิสระ

**เกณฑ์ผ่านบน Fuji:** มี deployment receipt/contract address จริง, issuer authorization สำเร็จ, demo ผลทั้งสองแบบบันทึกบน Fuji, credential อ่านกลับได้จาก RPC และ independent CLI

**สถานะ:** สคริปต์ผ่าน local end-to-end แล้ว แต่เกณฑ์บน Fuji ยังไม่ผ่านเพราะยังไม่ได้ส่งธุรกรรมบน Fuji ไม่มีการอ้างว่า local deployment เป็น testnet deployment

## ข้อจำกัดที่คงไว้ตามข้อกำหนด

- Result integrity ที่ผ่านตรวจความตรงกันกับผลที่ authority บันทึก ไม่รับรองความถูกต้องของผลต้นฉบับ
- Score authenticity และ allocation correctness ยังคง `not_verified`; ไม่มี official MyTCAS integration หรือ authenticated national dataset
- Registry ไม่ใช่ ERC-721 และไม่ให้นักเรียนจัดการ crypto wallet
- ไม่มีชื่อ/คะแนน/preferences บน chain แต่ transaction/storage ยังอาจเชื่อมโยง opaque IDs ได้ ไม่ใช่ strong anonymity
- MVP ใช้หนึ่ง institutional issuer signer ต่อ backend instance; ไม่มี distributed signer queue หรือ autonomous reconciliation worker
- ยังไม่ผ่าน independent security audit สำหรับข้อมูลและระบบ admissions จริง

รายละเอียด trust boundaries: [SECURITY.md](SECURITY.md)
