# FairPass — Platform flow

UI ใช้ภาษาอังกฤษและรูปแบบจาก `Downloads/web` ทั้งหน้า live และ preview แต่ live อ่านข้อมูลจาก API จริงและต้อง sign in ตามบทบาท

## ภาพรวม

```text
Institution account → Rulebook draft → Review → Publish & lock rules
                                               ↓
Provisioned students + scores + ranked choices → Preview allocation
                                               ↓
                                  Record results on Avalanche
                                               ↓
                    Student signs in → Read private result
                       ├─ Not admitted → Inspect score/rules/result evidence
                       └─ Admitted → Confirm admission
                                           ↓
                    Institution reviews confirmations → Issue token
                                           ↓
                       Wallet → View token / Verify / Share
                                           ↓
                 Public verification + Public capacity/event history
```

## 1. เตรียมระบบและบัญชี

ผู้ดูแล deploy registry และอนุญาต issuer ไว้ก่อนแล้ว ระบบปัจจุบันใช้ registry เดิมบน Fuji ไม่ deploy ใหม่เมื่อ build เว็บหรือ restart API

ผู้ดูแล provision บัญชีนักเรียนและเจ้าหน้าที่ผ่าน server/CLI บัญชีเจ้าหน้าที่ผูกกับ `INSTITUTION_ID` เดียวและ issuer signer ที่ตั้งไว้ หลัง sign in browser ได้ bearer session อายุ 8 ชั่วโมง เก็บใน `sessionStorage` ของ tab ไม่ได้รับ private key หรือ machine API token

หน้า live ไม่สลับนักเรียนหรือมหาวิทยาลัยแบบ fixture นักเรียนต้อง sign out แล้ว sign in ด้วยบัญชีของตัวเอง ส่วน `?preview=1` ใช้สำรวจต้นแบบได้ แต่ไม่เขียน chain และไม่ใช้แทน API เมื่อระบบขัดข้อง

## 2. สร้างและเผยแพร่กติกา

เปิด **For universities → Program rulebooks → Create rulebook**:

1. **Program details**: ชื่อหลักสูตร คณะ degree ปี รอบ ความจุ และ program slug
2. **Scoring rules**: เลือกวิชา สเกลคะแนน น้ำหนักรวม 100%
3. **Eligibility**: วิชาที่ต้องมี คะแนนขั้นต่ำ และ curriculum
4. **Review rulebook**: ตรวจสูตรและทดลองคะแนนสมมติ ระบบคำนวณ contribution และ eligibility จากกฎที่กำลังแก้จริง

**Save draft** บันทึก MongoDB พร้อม revision จึงเปิดจากเครื่องอื่นได้ การแก้ draft เก่าที่มีคนบันทึกใหม่แล้วจะได้ 409 แทนการเขียนทับ

**Publish on Avalanche** ขอการยืนยันก่อน API ลงทะเบียน program และล็อก rules commitment บน chain เมื่อ transaction สำเร็จจึงแสดง **Rules locked on chain** กฎที่ล็อกแล้วแก้ไม่ได้ การสร้าง version ใหม่ยังต้องใช้ intake/round ใหม่ถ้ากติกาเปลี่ยน เพื่อไม่สร้าง seat pool ซ้ำของ intake เดิม

## 3. ประมวลผลรับสมัคร

เปิด **Process admissions** เลือกหลักสูตรที่ล็อกแล้วในปี/รอบเดียวกัน เลือกบัญชีนักเรียนที่ provision แล้ว ใส่คะแนนและ curriculum และจัดอันดับความต้องการ

**Preview allocation** คำนวณจาก shared TypeScript engine: ตรวจ eligibility → normalized weighted score → จัดอันดับด้วยคะแนนไม่ปัดเศษ → จับคู่ตาม preference และ capacity; exact tie ใช้ applicant ID เพื่อให้ผล deterministic ตัวเลขที่แสดงปัดสองตำแหน่ง

**Process and record results** ขอการยืนยันและส่ง run ID/payload ไป API เก็บ run กับ snapshots ของ rulebooks และ private reports ลง MongoDB จากนั้น authority บันทึก salted commitments ของผลบน chain ข้อมูลชื่อ คะแนน และอันดับไม่ถูกเขียนลง chain

หนึ่ง intake ถูก claim โดย run เดียว การ retry ใช้ ID และ payload เดิมเพื่อป้องกันผลซ้ำ หากเกิด timeout ให้ retry/resume run เดิมจาก **Saved processing runs** ห้ามสร้าง run ใหม่เพื่อเลี่ยง conflict

## 4. นักเรียนอ่านผลและหลักฐาน

เปิด **My wallet** แล้ว sign in ด้วย Student ID:

- ยังไม่มีผล: **No results yet**, refresh ได้
- ไม่ผ่าน: **Your result. Clearly explained. → Not admitted → See why** เลือก ranked program แล้วดูคะแนน สูตร คะแนนรวม eligibility และ reported outcome
- ผ่านแต่ยังไม่ได้บัตร: แสดง **Admission offered** และ **Request confirmation** ไม่แสดงบัตรที่ยังไม่ได้ออก
- ยืนยันแล้ว: รอเจ้าหน้าที่ issuance การยืนยันของนักเรียนยังไม่ใช่ transaction ออกบัตร

**Check result integrity** เรียก API เปรียบเทียบ private report กับ commitment บน chain แยกชัดเจนจาก score authenticity และ allocation correctness ซึ่งยังไม่ verified

ผลแต่ละรอบอ้างกฎ version เดิมที่ใช้ประมวลผล ไม่แทนที่ด้วยกฎล่าสุด ข้อมูลเก่าที่ขาด rulebook/score provenance แสดง unavailable แทนสร้างหลักฐานขึ้นเอง

## 5. ออกและจัดการ admission token

เปิด **Issue admission tokens**:

1. **Choose program**
2. **Import confirmed students**: เลือกจากผลที่บันทึกและนักเรียนยืนยันจริง ไม่ใช่นำ CSV มาแทนคำยืนยัน
3. **Review & issue**: ตรวจ active capacity และ issuance allowance ก่อนยืนยันส่ง transaction

API/contract ตรวจ issuer authorization, offered result, confirmation, capacity และ active right ต่อคน/ปี การ retry ไม่ออก token ซ้ำ การออกหลายรายการทำทีละรายการ หากบางรายการล้มเหลวให้ refresh และ retry ที่เหลือ

สถานะหลังออก: `valid` → `enrolled`, `withdrawn` หรือ `revoked` ตาม transition ที่ contract อนุญาต เจ้าหน้าที่ต้องระบุเหตุผล ระบบส่งเฉพาะ hash ของเหตุผลขึ้น chain ไม่สามารถคืน withdrawn/revoked เป็น valid ผ่าน UI

ที่นั่งว่างไม่ได้แปลว่าออกใหม่ได้ทันที การเพิ่ม allowance เพื่อ reallocation ใช้ institutional CLI แยกต่างหากตามคู่มือ backend

## 6. Wallet, verification และ transparency

หลังออกบัตร wallet แสดง pass สีน้ำเงินพร้อมหลักสูตร degree ปี token ID สถานะและ network:

- **View token** เปิดรายละเอียดบัตร
- **Verify** ไป public verifier ของ ID จริง
- **Share** ส่ง verification link ซึ่งไม่รวมชื่อ/คะแนน
- คะแนนและผลส่วนตัวอยู่ใน disclosure ใต้บัตร

**Verify a token** รับ ID หรือ link และอ่าน registry ปัจจุบัน: valid/enrolled, withdrawn, revoked, not found หรือ unavailable ไม่ใช้ตัวอย่าง valid แทนเมื่อเชื่อม API ไม่ได้ และไม่ได้รับรองตัวตนผู้ถือ link

**Transparency** เลือก program ดู capacity/active rights/historical issued/allowance และ event timeline แบบแบ่งช่วง block ข้อมูลแต่ละหลักสูตรแยกกัน ประวัติที่โหลดบางช่วงไม่อ้างว่าเป็น complete audit

## 7. ข้อมูลอยู่ที่ไหน

| ที่เก็บ | ข้อมูล | ถ้าเครื่องผู้พัฒนาปิด |
| --- | --- | --- |
| Browser | UI, session ของ tab | ผู้ใช้เปิดเว็บจาก hosting ได้ |
| API server | Authentication, workflow, signer access, RPC calls | ต้องมี hosting ที่เปิดตลอด |
| MongoDB | Accounts/password hashes, drafts, private scores/reports/salts, runs, program metadata, receipts, subject mappings | ต้องใช้ Atlas หรือ database server ที่เปิดตลอด |
| Avalanche Fuji | Contract, authorized roles, capacity, commitments, token state/events | เครือข่ายรันต่อเอง ไม่พึ่งเครื่องผู้พัฒนา |

Blockchain ไม่ใช่ backup ของ MongoDB: commitment ย้อนกลับเป็นชื่อ/คะแนน/private report ไม่ได้ ต้อง backup ฐานข้อมูลแยก

## ขอบเขตที่ยังต้องบอกใน demo

ข้อมูลรับสมัครและคะแนนเป็น fictional ไม่มี official TCAS/exam-provider integration การมี hash ตรงกันไม่ได้พิสูจน์คะแนนจริงหรือการจัดสรรยุติธรรม Registry Fuji ปัจจุบันใช้ public Hardhat development keys ตามการตัดสินใจเดิมของผู้ใช้ จึง demo ได้แต่ยังใช้รับรองสิทธิ์มหาวิทยาลัยจริงอย่างปลอดภัยไม่ได้

สำหรับ hosting ดู [Hosting guide](hosting-guide.md) และสำหรับการกด demo ดู [Live demo guide](live-demo-guide.md)
