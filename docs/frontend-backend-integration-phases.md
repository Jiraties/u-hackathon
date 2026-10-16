# FairPass: แผนเชื่อม frontend–backend ราย Phase

สถานะ: **Phase 1–5 implement แล้ว; Phase 6 ผ่าน local/browser/Docker/Fuji journey แล้ว ผู้ใช้เลือกใช้ registry เดิมสำหรับ demo โดยรับทราบข้อจำกัดของ public Hardhat keys; ไม่มีการย้าย keys/registry**

## ผลงานที่ทำแล้ว


| Phase | สิ่งที่ใช้งานได้ |
| --- | --- |
| 1 | Live public Verify/Transparency, bytes32 IDs, typed HTTP errors, event paging, Vite/Nginx proxy |
| 2 | Student login/logout/session expiry, private wallet/proof, confirmation request แยกจาก issuance |
| 3 | Shared canonical Rulebook + SHA-256/scoring/eligibility/allocation ใน backend/shared/domain.ts; ใช้ raw score จัดอันดับ |
| 4 | Institutional sessions, server-side program scope, publication/confirmation queue/issuance/lifecycle พร้อม receipts |
| 5 | Persisted fictional simulation run, intake claims ป้องกัน processing ซ้ำ, pinned rules/results ใน MongoDB |
| 6 | Browser journey ผ่าน local EVM และ Fuji จริง, independent CLI, Docker build/start/recreate persistence, recorded fallback; ใช้ registry เดิมตามคำสั่งผู้ใช้; ไม่อ้าง secure issuer trust |

Live mode เป็น default; preview เดิมเปิดด้วย ?preview=1 และไม่มี fixture fallback เมื่อ API ใช้งานไม่ได้

คู่มือใช้งาน: [Live demo guide](live-demo-guide.md)

หลักฐานการซ้อม Fuji บน registry เดิม:
- Contract: 0x55e5eee9feb02b6e4b534b1b0d1ea8ea61eb2955, chain 43113
- Credential: 0xacb813b174f598f8dcdd746cd655bb886184f83c679ac99996d7a92781f22ea0 — browser และ independent CLI แสดง valid ตรงกัน
- Public evidence/screenshots/video: backend/cache/fuji-demo/ (ไม่เข้า Git)
- Local Docker check: backend/scripts/check-docker.ts และโหมด persisted ตรวจ IDs เดิมหลัง recreate API/web โดยไม่ recreate chain
- Automated tests: frontend rulebooks/evidence checks และ backend 7 tests เมื่อเปิด FAIRPASS_BROWSER_TEST=1

การตัดสินใจวันที่ 16 ตุลาคม 2026: ผู้ใช้เลือกไม่ย้าย keys และให้ใช้ registry เดิมสำหรับ demo จึงไม่ดำเนินการ funding/deploy registry ใหม่หรือเปลี่ยน keys/contract/database ใน .env สคริปต์ backend/scripts/prepare-private-fuji.ts ยังไม่ได้ execute และต้องได้รับคำสั่งใหม่ก่อนใช้งาน

ข้อจำกัด: admin/authority/issuer ของ registry เดิมใช้ public Hardhat keys ซึ่งบุคคลอื่นสามารถนำไปลงนามตามสิทธิ์ของแต่ละ role ได้ การที่ credential มีสถานะ valid และ issuerCurrentlyAuthorized=true แสดงสถานะบน contract เท่านั้น ไม่พิสูจน์ว่ามหาวิทยาลัยเป็นผู้ลงนามจริง ใช้ข้อมูลสมมติในการ demo และไม่อ้างความปลอดภัยของ institutional key custody เกณฑ์เรื่อง private institutional keys ใน Phase 6 จึงยังไม่ผ่าน และอยู่นอกขอบเขต demo ที่ผู้ใช้เลือก

รายการด้านล่างคงไว้เป็น specification และ acceptance criteria ของแต่ละ Phase


ฐานที่มีแล้ว: React frontend แบบ local preview, Express/MongoDB backend, admission registry บน Fuji, Docker และ backend integration tests ส่วน frontend ล่าสุดมี versioned rulebooks และ local allocation preview ที่ยังไม่ตรงกับ backend protocol ทั้งหมด

## Phase 1 — Public Verify และ Transparency

เป้าหมาย: ให้กรรมการตรวจ credential และ capacity บนหน้าเว็บจาก Fuji จริงได้ก่อน โดยยังไม่ต้อง login

งาน:

- เพิ่ม `web/src/services/api.ts` สำหรับ HTTP requests และ typed errors
- เพิ่ม API DTOs/adapters แยกจาก fixture models
- เชื่อม `/api/v1/public/verify/:id`, `/api/v1/public/programs` และ program events
- ใช้ bytes32 IDs จริง แยกจากรหัสแสดงผล และแก้การ uppercase `0x` ใน demo verifier
- Map `valid`/lifecycle จาก API เป็นสถานะ UI อย่างชัดเจน
- รองรับ loading, HTTP 400, 404, 503 และไล่ event pages ผ่าน `nextBlock`
- เพิ่ม Vite `/api` proxy สำหรับ dev; Docker ใช้ Nginx proxy ที่มีแล้ว
- แยก live mode จาก preview; API ล่มต้องไม่ fallback เป็น fixture ที่แสดง verified

ไฟล์หลัก: `web/src/services/`, `web/src/pages/VerificationPage.tsx`, `web/src/pages/TransparencyPage.tsx`, `web/vite.config.ts` และ public endpoints ใน `backend/src/app.ts`

เกณฑ์ผ่าน:

- Credential จริงแสดงสถานะตรงกับ independent CLI บน contract/network เดียวกัน
- ID ที่ไม่มีอยู่แสดง not found และ RPC ล่มแสดง unavailable
- Capacity/counters/events มาจาก chain จริง และเปลี่ยนตาม lifecycle operations
- ไม่มี machine tokens หรือ private keys ใน browser bundle

## Phase 2 — Student Login, Wallet, Proof และ Confirmation

เป้าหมาย: นักเรียนเข้าบัญชีและดูผล/สิทธิ์ของตัวเองได้จริง

งาน:

- เพิ่ม login/logout และจัดการ student session/expiry
- เชื่อม `/auth/login`, `/auth/logout`, `/me/wallet`, `/me/results/:id/proof` และ `/confirm`
- เปลี่ยนจาก demo account selector เป็น authenticated identity ใน live mode
- แปลง API `records[]` เป็น wallet view โดยเลือก academic year/round อย่างชัดเจน
- เพิ่มข้อมูล API ที่ UI ต้องใช้จริง เช่น lifecycle, metadata และ timestamps; ไม่สร้างวันที่หรือ transaction references ขึ้นเอง
- แสดง confirmation requested แยกจาก credential issued เพราะเป็นคนละขั้นตอน
- แสดง result integrity ตามหลักฐานจริง; score authenticity/allocation correctness ยังคง not verified

ไฟล์หลัก: `web/src/pages/WalletPage.tsx`, `web/src/components/NonAdmittedWallet.tsx`, service adapters, `backend/src/app.ts`, `backend/src/store.ts`

เกณฑ์ผ่าน:

- นักเรียน A อ่านผลของ B ไม่ได้ แม้แก้ URL/ID
- Logout หรือ session หมดอายุแล้ว private API ปฏิเสธการเข้าถึง
- ผู้ไม่ผ่านมี result attestation แต่ไม่มี admission right
- Confirmation ไม่ถูกแสดงว่าออกสิทธิ์สำเร็จก่อน issuer transaction สำเร็จ

## Phase 3 — Shared Rulebook, Hash และ Scoring Protocol

เป้าหมาย: กติกาที่ผู้ใช้เห็น กติกาที่ backend ประมวลผล และกติกาที่ commit ต้องเป็นชุดเดียวกัน

งาน:

- สร้าง shared domain package สำหรับ Rulebook schema, canonicalization, scoring และ eligibility
- ย้าย/ใช้ shared functions จากทั้ง frontend และ backend แทนการมีสอง implementation ต่างกัน
- รองรับ score maximum, GPAX normalization, minimum รายวิชา, required subjects และ curriculum ตาม UI
- กำหนด precision, weight units, rounding และ tie-break ให้แน่นอน ไม่เปรียบเทียบ rounded scores ฝั่งหนึ่งกับ raw scores อีกฝั่ง
- กำหนด rules commitment protocol ให้ตรงกันทั้ง canonical payload และ hash algorithm; แนวทางเริ่มต้นคือ SHA-256 ของ complete frontend rulebook โดยแยกจาก Keccak result commitments เดิม
- เก็บกติกาทุก field ที่มีผลต่อการตัดสิน ห้ามตัด fields ทิ้งเพื่อให้ผ่าน API schema เก่า
- กำหนด mapping ระหว่าง logical program IDs กับ on-chain bytes32 keys

ขอบเขต versioning สำหรับ MVP:

- มีหลาย draft/preview versions ได้ แต่หนึ่ง intake/cycle ใช้ published rulebook เดียวหลัง lock
- Contract ปัจจุบันไม่ใช่ versioned rule registry ตาม frontend `RuleRegistry` port
- ห้ามให้ version ใหม่สร้างโควตาอิสระซ้ำใน intake เดิมโดยไม่มี capacity policy
- การเปลี่ยน published rules ต้องกำหนด cycle/version policy ก่อน หากต้องรองรับ versioning เต็มบน chain อาจต้องขยาย contract และ deploy ใหม่

ไฟล์หลัก: shared package ใหม่, `web/src/domain/rulebooks.ts`, `web/src/services/ruleWorkspace.ts`, `backend/src/crypto.ts`, `backend/src/simulator.ts`, program/result schemas

เกณฑ์ผ่าน:

- Shared test vectors ได้ canonical bytes/hash เดียวกันทั้งสองฝั่ง
- Inputs/rules เดียวกันได้คะแนน eligibility และ allocation เดียวกัน รวม near-ties และ GPAX
- เปลี่ยน decision-bearing field ใดก็ทำให้ commitment เปลี่ยน
- Historical results อ้างอิงกติกาฉบับเดิมได้ และการเปลี่ยน version ไม่เพิ่มสิทธิ์เกินนโยบาย capacity

## Phase 4 — University Authentication, Publication และ Issuance

เป้าหมาย: เจ้าหน้าที่ที่ได้รับอนุญาตจัดการโปรแกรมและออกสิทธิ์ผ่านหน้าเว็บได้

งาน:

- เพิ่ม institutional user/session และ server-side authorization
- จำกัด institution/program ที่เจ้าหน้าที่จัดการได้
- เพิ่ม endpoint รายการผลและ confirmations ที่รอ issuance ของ institution นั้น
- ให้ server ตรวจสิทธิ์ก่อนเรียก signer; browser ไม่ถือ issuer/admin/integration machine tokens
- เชื่อม Rulebook publication, issuance, enrolled/withdrawn/revoked และ refresh state จาก chain
- ส่ง transaction references ที่ตรวจสอบได้จริงให้ UI; แสดง pending/failed/confirmed ตามสิ่งที่ระบบทราบ
- Persist issuance IDs และใช้ retry workflow เดิมเพื่อไม่ออกซ้ำ

ขอบเขตเริ่มต้น: หนึ่ง institution กับหนึ่ง configured issuer signer; multi-institution signer routing เป็นงานเพิ่มเติม ไม่ใช้ label หลายมหาวิทยาลัยแทนการแยก authority จริง

ไฟล์หลัก: backend auth/store/endpoints, `web/src/pages/UniversityPage.tsx`, `web/src/components/IssuanceConsole.tsx`, `web/src/services/ports.ts`

เกณฑ์ผ่าน:

- Student session เรียก issuer operations ไม่ได้
- เจ้าหน้าที่จัดการโปรแกรมนอกสิทธิ์ไม่ได้
- Publish/issue สำเร็จมี chain evidence และ wallet/transparency แสดงผลเดียวกัน
- Retry หลัง timeout ไม่สร้าง credential ซ้ำ
- Publish button ไม่แสดง success หากไม่มี receipt/commitment ที่ตรงกัน

## Phase 5 — Server-side Simulator และ Result Journey

เป้าหมาย: ใช้ shared rules คำนวณผลสมมติหนึ่งรอบบน server แล้วบันทึกผลให้ผู้ใช้ดูผ่านบัญชี

งาน:

- ให้ server เป็นผู้สร้าง/persist simulation run และผลของ cohort สมมติ
- ใช้ shared engine จาก Phase 3; browser preview เป็นตัวช่วย ไม่ใช่ผลรับรองจาก authority
- ตรวจว่า rules lock สำเร็จก่อนเริ่ม processing และ pin exact rulebook/cycle ในผล
- ส่งผลผ่าน authenticated integration workflow โดย machine token อยู่ฝั่ง server
- เชื่อมรายงาน admitted/not-admitted กับ student wallet/proof
- ไม่อาศัย localStorage เพื่อส่งผลสมัครให้ผู้ใช้อีกเครื่องหนึ่ง
- คง fictional labels และไม่อ้างว่าเป็น official TCAS หรือ independent allocation proof

เกณฑ์ผ่าน:

- เปลี่ยน browser/device แล้วยังเปิดผลเดิมจากบัญชีได้
- ผลทั้ง cohort ตรงกับ shared engine และ capacity/preference policy
- ผู้ไม่ผ่านไม่มี credential และผู้ผ่านต้อง confirm ก่อน issuance
- Local preview ไม่ถูกแสดงเป็น authenticated/on-chain result

## Phase 6 — End-to-end, Docker และ Fuji Demo

เป้าหมาย: พิสูจน์เส้นทางใช้งานผ่าน UI จริงและเตรียม demo ที่ทำซ้ำได้

งาน:

- เพิ่ม browser E2E สำหรับ login → result → confirm → institutional issue → public verify
- ตรวจ Transparency และ Wallet ว่าใช้ program/credential IDs เดียวกัน
- ทดสอบ unauthorized access, 404/503, tampered proof, duplicate submission และ lifecycle
- เตรียม capacity-negative test ที่ข้อมูลอื่นถูกต้อง เพื่อให้ปฏิเสธด้วย Capacity จริง
- ทดสอบ Docker build/start/recreate และ persistence
- ใช้ institutional keys ใหม่ที่ไม่ใช่ public Hardhat keys สำหรับ demo ที่ต้องการแสดง issuer trust
- ซ้อมบน Fuji, เก็บ contract address/receipts, และมี recorded fallback ที่ระบุชัดว่าไม่ใช่ live

เกณฑ์ผ่าน:

- ผู้ใช้ทำเส้นทางหลักผ่าน browser ได้โดยไม่ต้องใช้ CLI เป็นทางเชื่อมระหว่างหน้า
- Independent verifier ตรวจสถานะ credential เดียวกันได้
- Tests ไม่ทำ mainnet transactions และข้อมูล demo ไม่ปะปนกับของเก่า
- ไม่มี secrets ใน frontend/image และไม่มี fabricated blockchain evidence
- Demo 3–5 นาทีแสดงสิ่งที่ commit/check/enforce ได้จริง พร้อมขอบเขตที่ยังไม่ verified

## ลำดับส่งมอบ

Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Phase 1–2 ใช้ registry ที่ deploy อยู่แล้วสำหรับ read/student flows ได้ Phase 3 ต้องกำหนด protocol ให้ตรงกันก่อนเปิด publication/processing จาก Rulebook Builder และ Phase 4 ต้องมี institutional auth ก่อนเปิด browser issuance

เอกสารเกี่ยวข้อง: [Backend API](../backend/API.md), [Docker deployment](../DOCKER.md), [Security boundaries](../backend/SECURITY.md)
