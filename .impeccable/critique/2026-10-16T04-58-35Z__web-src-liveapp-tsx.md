---
target: FairPass platform journeys for grade-12 students and universities; Web3 explanation guidelines
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
timestamp: 2026-10-16T04-58-35Z
slug: web-src-liveapp-tsx
---
Method: dual-agent (A: /root/ux_assessment_a · B: /root/ux_assessment_b)

**FairPass มีพื้นฐาน UX ที่เหมาะกับนักเรียน ม.6 แต่ยังเหมาะกับ guided demo มากกว่าการให้เด็กและมหาวิทยาลัยใช้งานเองเต็มรูปแบบ** หน้าบัตรกับการตรวจสูตรทำได้ดี จุดที่ต้องแก้ก่อนคือความหมายของการยืนยันรับสิทธิ์ ขอบเขตของคำว่า Verified และงานเจ้าหน้าที่เมื่อมีผู้สมัครจำนวนมาก

**ควรอธิบาย Web3 ให้ชัดขึ้นในจุดตัดสินใจ ไม่ควรเพิ่มข้อความยาวทั้งแพลตฟอร์ม** ผู้ใช้ต้องเข้าใจว่าใครออกบันทึก ตรวจอะไรได้ ข้อมูลใดเปิดเผย และต้องทำอะไรต่อ โดยไม่จำเป็นต้องเรียนรู้ hash, RPC หรือ ZK ก่อนใช้บริการ

เป็น expert review จากโค้ดปัจจุบันและ browser สดของหน้า sign-in, verification และ transparency; private journeys ตรวจจาก source และใช้ภาพเก่าเป็นข้อมูลประกอบเท่านั้น ยังไม่ได้ทดสอบกับนักเรียนหรือเจ้าหน้าที่จริง จึงไม่ถือว่าพิสูจน์ usability แล้ว

**ภาพลักษณ์และสิ่งที่ทำดี**

Digital pass, ลำดับคะแนน → สูตร → eligibility → ผล และภาพจำนวนสิทธิ์เทียบที่นั่งสัมพันธ์กับผลิตภัณฑ์นี้จริง ควรคง English UI, blue/white และ visual identity ปัจจุบันไว้

- แยก offer, ผลที่ไม่ผ่าน และ token ที่ออกแล้ว ช่วยไม่ให้เข้าใจว่าการมีผลเท่ากับได้รับบัตรสิทธิ์
- นักเรียนดูสูตรรายหลักสูตรได้ และรายละเอียดเทคนิคส่วนใหญ่เปิดดูภายหลัง เหมาะกับการใช้งานที่มีเรื่องหลักเพียงหนึ่งเรื่อง
- Publication review อธิบาย fingerprint → lock → receipt และ privacy อยู่แล้ว จึงควรปรับความแม่นยำมากกว่าเพิ่มบทเรียน Blockchain อีกชุด

**ความเหมาะสมของ journey**

| ผู้ใช้/ช่วง | สิ่งที่มี | ช่องว่างที่ควรแก้ |
| --- | --- | --- |
| นักเรียนเข้าใช้ครั้งแรก | แยก student/staff login ชัด | ยังไม่มีทางขอบัญชีหรือช่วยกู้การเข้าใช้ที่เห็นได้ทันที |
| นักเรียนผ่านการคัดเลือก | Offer → confirmation request → token | ความหมายต่อ TCAS และผู้ดำเนินการขั้นต่อไปยังไม่ชัดใกล้ปุ่ม |
| นักเรียนไม่ผ่าน | Result → ranked choices → calculation trace | “See why” สัญญาเหตุผล แต่ข้อมูลยังไม่พิสูจน์เหตุการจัดสรรทั้งหมด |
| นักเรียนรอออกบัตร | แสดง confirmation requested | ต้องมี next actor, การตรวจสถานะล่าสุด และช่องทางติดต่อจริง; เวลารอต้องมาจาก policy ไม่ใช่ค่าที่แต่งขึ้น |
| เจ้าหน้าที่ตั้งกฎ | Builder สี่ขั้น, save draft, review | ต้องทำเงื่อนไข lock/amendment ให้สอดคล้องกับ protocol และช่วยแก้ข้อผิดพลาดในขั้นที่เกิด |
| เจ้าหน้าที่ประมวลผล/ออกบัตร | Manual cohort, preview, confirmed issuance | เพิ่มคนทีละคน/checkbox ทีละราย ไม่เหมาะกับงานจำนวนมาก; partial failures ยังไม่เป็นรายการงานที่ติดตามง่าย |

**5 ประเด็นที่ควรแก้ตามลำดับ**

**1. [P1] ทำให้การยืนยันมีความหมายเดียวตลอด flow**

ปัจจุบันใช้ “Request confirmation”, dialog “Confirm admission?” และ success “Confirmation submitted” ขณะที่ API บันทึกคำร้องใน FairPass ก่อนออกบัตรแยกต่างหาก เด็กอาจเข้าใจว่าการยืนยันสิทธิ์ในระบบทางการเสร็จแล้ว นี่เป็นความเสี่ยงจาก expert review ไม่ใช่พฤติกรรมที่วัดแล้ว

Guideline: ใช้ชื่อ action ให้ตรงหน้าที่จริง เช่น **“Confirm this offer in FairPass”** หากบันทึก consent หรือ **“Request admission record”** หากขอออก credential; กำหนด product semantics ก่อนเลือกคำ ใกล้ปุ่มต้องแสดง program/round, ผลของการกด และ **“This does not confirm your place in myTCAS.”** หลังส่งให้บอกว่าใครทำต่อ อย่าเสนอถอนคำร้องหรือกำหนด deadline ถ้า backend/policy ยังไม่รองรับ

Suggested command: `$impeccable clarify`, `$impeccable harden`

**2. [P1] จำกัดคำสัญญาของผลและ proof ให้ตรงสิ่งที่ตรวจจริง**

“See why” พาไปดูสูตร แต่ไม่ได้อธิบายการจัดสรรครบทั้ง cohort ขณะเดียวกัน `ResultProofSummary` ใช้ “Your result. Backed by proof.” และ “The math is proven” แม้ยังไม่ verified คำอธิบายจำกัดขอบเขตด้านล่างช่วยอยู่แล้ว แต่ headline ยังอาจให้น้ำหนักเกินหลักฐาน

Guideline: ใช้ **“Review scores and rules”** แทนคำที่สัญญา causal explanation; summary ใช้ **“See what was checked”** และเปลี่ยน headline ตาม actual state ติดชื่อ program และขอบเขตไว้ใกล้ badge การยังไม่มี proof ต้องเป็น **“Not checked”**; อ่านหลักฐานไม่ได้เป็น **“Could not complete check”**; proof ไม่ผ่านเป็น **“Check failed”** ไม่รวมเป็นความหมายเดียว

โค้ดปัจจุบันรองรับการตรวจ scoring กับ authorized fictional exam dataset แล้ว จึงไม่ควรเหมารวมว่าคะแนนไม่มีทาง verified แต่ต้องแยก “ตรงกับ dataset ที่ได้รับอนุญาต”, “คำนวณถูกตามกฎ”, “report ตรง commitment” และ “จัดสรรทั้งระบบถูกต้อง” ซึ่งอย่างหลังยังไม่ independently verified

Suggested command: `$impeccable clarify`

**3. [P1] เปลี่ยนหน่วยงานหลักของเจ้าหน้าที่เป็น intake/cohort**

Manual entry เหมาะกับ demo แต่หน้า Simulation เพิ่ม applicant ทีละคน และ issuance เลือกทีละ checkbox ไม่มี search/bulk selection จึงไม่ควรสรุปว่าพร้อมให้มหาวิทยาลัยประมวลผลจำนวนมากโดยไม่ปรับ workflow

Guideline: เลือก year/round/program ครั้งเดียว แล้วมี cohort overview แสดง **Ready / Needs review / Awaiting confirmation / Issued / Failed**; เพิ่ม import จากระบบต้นทางหรือ CSV พร้อม mapping, duplicate checks, dry-run และ row errors; รองรับค้นหา/filter/select all เฉพาะรายการที่พร้อม ไม่ใช้ CSV แทน authenticated consent

สิ่งนี้ต้องเพิ่ม API/workflow บางส่วน ไม่ใช่เปลี่ยน CSS หรือเพิ่มปุ่มอย่างเดียว ขั้นปัจจุบัน “Import confirmed students” ควรเปลี่ยนเป็น **“Select confirmed students”** จนกว่าจะมี import จริง

Suggested command: `$impeccable shape`, `$impeccable optimize`

**4. [P1] ให้ข้อผิดพลาดนำไปสู่ทางแก้และติดตาม batch ได้**

ระบบมี validation, review, contract guards, revision conflict และ saved-run retry แล้ว แต่ 400/409 บางกรณียังใช้ข้อความรวมพร้อม error code เจ้าหน้าที่จึงต้องตีความเองว่า retry, reload หรือสร้างรอบใหม่ การออกบัตรหลายรายยังไม่มีผลต่อแถวที่อธิบายได้ครบ

Guideline: revision conflict → เปิด version ล่าสุดพร้อมเปรียบเทียบ; intake already processed → เปิด saved run; capacity conflict → refresh capacity; batch failure → บอก issued/skipped/failed รายคนและ resume เฉพาะค้าง ออกแบบสถานะ **Draft → Sending → Waiting for network → Confirmed / Needs attention** ให้ตรง server state และไม่อนุญาตกดซ้ำเพียงเพราะ timeout

ควร autosave/recover draft และแก้ความขัดแย้งของ copy: ZK path มี **“Create amended version”** แต่ publication review บางข้อความยังบอกว่าทุกการเปลี่ยนต้องเป็น intake ใหม่ ให้แสดงเงื่อนไขตาม protocol จริง

Suggested command: `$impeccable harden`, `$impeccable clarify`

**5. [P2] เติมทางเข้าบัญชีและทางไปต่อหลังอ่านผล**

Sign-in บอกว่าผู้ดูแลสร้างบัญชีให้ แต่ไม่มี next action สำหรับคนที่ไม่มีบัญชี ผู้ไม่ผ่านอาจเห็น “Meets minimums” และ “Not admitted” แล้วจบโดยไม่มีทางดำเนินการต่อ

Guideline: มี **“Need help signing in?”** ไปยังช่องทางจริง; empty state อธิบายว่ารออะไรและติดต่อใคร; หลังผลไม่ผ่านให้ **“Check your recorded scores”** และ **“Contact admissions”** เมื่อมีทีม/ช่องทางรองรับ อธิบายสั้น ๆ ว่าผ่านขั้นต่ำไม่เท่ากับได้ที่นั่ง อย่าสร้างคำรับรองกระบวนการอุทธรณ์ที่ยังไม่มี

English UI คงเดิม ใช้คำง่ายและประโยคสั้น ทดสอบความเข้าใจคำว่า admission record, confirmation และ verified กับเด็กกลุ่มเป้าหมายก่อนพิจารณาภาษาอื่น

Suggested command: `$impeccable onboard`, `$impeccable clarify`

**ควรอธิบาย Web3 แค่ไหน**

ใช้ progressive disclosure: แสดงข้อมูลที่ต้องใช้ทำงานก่อน แล้วให้เปิดกลไก/หลักฐานภายหลัง ตาม [NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)

| ชั้น | เนื้อหา | ตัวอย่าง English copy |
| --- | --- | --- |
| หน้าหลัก | บริการช่วยอะไรและไม่แทนอะไร | “View your admission record and check its current status. FairPass does not replace myTCAS.” |
| จุดตัดสินใจ | ใครทำอะไร, เกิดผลอะไร, ตรวจส่วนไหน | “Your university issues the record. You do not need a crypto wallet.” |
| View evidence / How verification works | Fingerprint, dataset, ZK, issuer, network, receipt และข้อจำกัด | “This proof checks the calculation for this program. It does not verify the complete admissions allocation.” |

สำหรับมหาวิทยาลัย เน้น **อะไรล็อกเมื่อ publish, แก้ได้เมื่อไร, ใครจ่าย network fee, สำเร็จแล้วดู receipt ที่ไหน และ failure ต้องทำอย่างไร** คำอธิบายปัจจุบันเริ่มทำเรื่องนี้ดีแล้ว ไม่จำเป็นต้องเพิ่ม consensus/mining หรือบังคับ onboarding ก่อนใช้

ประโยค “Your scores stay private” ควรอธิบายในรายละเอียดว่า **ไม่เผยคะแนนลง public blockchain** ไม่ใช่อ้างว่า API/มหาวิทยาลัยไม่เคยเห็นคะแนน

**Cognitive load และอารมณ์ของผู้ใช้**

นักเรียนที่ได้บัตรมีภาระต่ำถึงปานกลาง: pass ชัดและมีเพียงสาม actions ผู้ไม่ผ่านมีภาระปานกลางเพราะต้องแยกหลายชนิดของ verification และมีทั้ง See why กับ View evidence แข่งกัน เจ้าหน้าที่มีภาระสูงเมื่อ cohort โต: ต้องจำ account, scores, preferences, round และผล retry ข้ามขั้น ควรให้ระบบแสดง context แทนให้จำ ตาม [NN/g recognition over recall](https://www.nngroup.com/articles/recognition-and-recall/)

จุดอารมณ์ที่ต้องออกแบบคือรอหลังยืนยันและจบหลังไม่ผ่าน ให้ทั้งสองจุดจบด้วย next action ที่ทำได้จริง ไม่เพิ่ม celebratory animation หรือคำปลอบที่ไม่ช่วยทำงาน

**Persona red flags**

- **นักเรียน ม.6 ครั้งแรก:** ไม่รู้ขอบัญชีจากใคร อาจตีความ confirmation เป็น TCAS และอ่าน Verified ว่าคัดเลือกถูกต้องทั้งหมด
- **เจ้าหน้าที่ช่วงรับสมัคร:** การกรอกทีละคนและดูผล batch เองเพิ่มโอกาสหลงรายการ ต้องมี search, validation และสถานะต่อแถว
- **ผู้ใช้เครื่องร่วม/ผู้ใช้ accessibility:** session ปัจจุบันจำ login ใน localStorage ค่าเริ่มต้น 7 วัน ควรมี shared-device guidance หรือ remember-me policy; labels/native controls เป็นฐานดี แต่ยังไม่ได้ทดสอบ keyboard/screen reader จริง

**Design health — expert estimate**

| Heuristic | คะแนน /4 | ประเด็นหลัก |
| --- | ---: | --- |
| Visibility of system status | 3 | มี loading/toast แต่ batch ยังขาดสถานะรายแถว |
| Match with real world | 2 | Confirmation/token/proof ต้องตีความ |
| User control and freedom | 2 | มี Back/Close/Draft แต่ recovery บางจุดยังไม่ชัด |
| Consistency and standards | 3 | ภาพสม่ำเสมอ; amendment/lock copy ไม่ตรงกัน |
| Error prevention | 3 | Guardrails ดี; ยังช่วยแก้ field ก่อนท้ายขั้นได้อีก |
| Recognition rather than recall | 2 | ต้องจำ context ระหว่างงานหลายขั้น |
| Flexibility and efficiency | 1 | Manual cohort และไม่มี bulk selection/search |
| Aesthetic and minimalist design | 3 | Pass เด่น; evidence บางทางซ้ำกัน |
| Error recovery | 2 | Generic errors และ partial batch recovery |
| Help and documentation | 2 | Web3 help มี; account/task help ยังขาด |
| **รวม** | **23/40** | **Acceptable — ต้องแก้จุดสำคัญก่อนใช้เองจริง** |

คะแนนนี้ไม่ใช่คะแนนความพึงพอใจจากผู้ใช้หรือความพร้อมด้านความปลอดภัย

**รายละเอียดเล็กที่ควรเก็บหลังแก้ flow**

Browser พบ program options ชื่อซ้ำ “Fictional Engineering” ควรใส่ year/round/version ให้แยกได้ และแก้ “1 seats” เป็น “1 seat” ให้ status/time มาก่อน full transaction hash ไม่ใช้ “Live mode” เพียงอย่างเดียวแทน fictional-data cue

Static detector รอบนี้พบ **0 findings** ใน LiveApp, Layout และ ShareTokenButton ไม่มี false positives ให้ตัดสิน ผลนี้ไม่หักล้างปัญหา journey ที่คนประเมินพบ และไม่ใช่ accessibility certification ไม่มี user-visible overlay เพราะ native browser API ให้ evaluate แบบ read-only; ใช้ fresh Chrome screenshots และ accessibility trees เป็นหลักฐานเสริม

**เกณฑ์ทดสอบก่อนนำไป pilot**

เริ่ม qualitative test กับนักเรียน ม.6 5–8 คนและเจ้าหน้าที่ 3–5 คน เป็นรอบค้นหาปัญหา ไม่ใช่การพิสูจน์เชิงสถิติ ให้ทำเองโดยไม่สอนก่อน:

1. นักเรียนบอกผลของตัวเองและขั้นต่อไปได้ และอธิบายว่าการกดยืนยันมีผลต่อ myTCAS หรือไม่
2. นักเรียนแยกได้ว่า proof ตรวจอะไรและไม่ได้พิสูจน์อะไร โดยเฉพาะผลไม่ผ่านที่คะแนนถึงขั้นต่ำ
3. เจ้าหน้าที่สร้างกฎ ตรวจข้อผิดพลาด และรู้ว่า publish ล็อกอะไรได้โดยไม่ต้องถามผู้พัฒนา
4. เจ้าหน้าที่แก้กรณี batch สำเร็จบางส่วนได้โดยไม่ออกบัตรซ้ำ และไม่แก้ intake ผิดรอบ
5. ผู้ใช้มือถือและ keyboard อ่านสถานะ เปิด/ปิดหลักฐาน และกลับงานหลักได้

บันทึก task completion, จุดที่ต้องขอความช่วยเหลือ, เวลา และการตีความผิด ควรแก้ confirmation/proof comprehension ก่อนวัดความชอบสีหรือ animation
