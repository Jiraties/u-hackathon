# FairPass backend — TypeScript + Solidity / Avalanche

ส่วนนี้แยกจาก `web/` ทั้งหมด ไม่มีการแก้หรือเชื่อม frontend อัตโนมัติ เป็น backend MVP ที่ใช้ MongoDB จริงและส่งธุรกรรมจริงผ่าน RPC ไม่ใช่ตัวจำลอง blockchain

**สถานะ:** ทดสอบใน local EVM; ยังไม่ deploy ไป Fuji จนกว่าผู้ใช้จะใส่ institutional keys และเติม test AVAX ไม่มี official MyTCAS integration ไม่มีข้อมูลนักเรียนจริงใน demo

ดูการแบ่งงาน สถานะ และเกณฑ์ผ่านแต่ละ Phase ใน [PHASES.md](PHASES.md)

## สิ่งที่ทำได้

- API นักเรียนแบบ walletless: provision บัญชี, login, logout, ดูผลส่วนตัว, ขอ confirmation
- แยก result attestation สำหรับทั้งผู้ผ่าน/ไม่ผ่าน ออกจาก admission right ที่ออกหลัง confirmation เท่านั้น
- มหาวิทยาลัยที่ admin อนุญาต ลงทะเบียน program/year/capacity/rules hash และ lock ก่อนประมวลผล
- Contract บังคับ active rights ไม่เกิน capacity และหนึ่ง active right ต่อ opaque subject/ปี
- สิทธิ์เป็น nontransferable registry entry ไม่ใช่ ERC-721 และไม่มี `transfer` หรือ student crypto wallet
- สถานะ Active → Enrolled / Withdrawn / Revoked; Enrolled ยังนับ active; สิทธิ์ที่สิ้นสุดไม่กลับมา active
- ถอน/เพิกถอนไม่เติม issuance allowance อัตโนมัติ ต้อง authorizeReallocation โดยมหาวิทยาลัย
- public verification อ่าน contract จริง พร้อมแยก not found กับ RPC unavailable
- ผลส่วนตัวใช้ salted commitment; นักเรียนตรวจด้วย chain หรือ CLI อิสระได้
- simulator แบบ deferred acceptance, weighted scores, preference สูงสุด 10 ลำดับ, threshold และ deterministic tie-break โดยระบุชัดว่าเป็นสมมติ

รันทั้งโปรเจกต์ผ่าน Docker ได้จาก root โดยไม่ต้องติดตั้ง Node/MongoDB บน host ดู [คู่มือ Docker](../DOCKER.md) สำหรับ local และ Fuji

## เริ่มต้น

ใช้ Node.js **24 LTS** (หรือ Node 22 รุ่นที่ Hardhat รองรับ) และ npm; frontend เดิมยังใช้คำสั่งเดิมได้

```sh
cd /Users/theeratdolchat/Documents/u-hackathon/backend
npm ci
cp .env.example .env
npm run compile
npm run check
npm test
npm run build
```

`npm test` เปิด local EVM port **18545** และ MongoDB ชั่วคราวจริง แล้วปิดเมื่อเสร็จ ครั้งแรกดาวน์โหลด MongoDB binary เก็บใน `backend/cache/` จึงต้องมีอินเทอร์เน็ต ไม่ต้องใช้ private key หรือ AVAX ในการทดสอบ

`npm run compile` ใช้ solc-js ที่ pin ไว้ใน lockfile ไม่ต้องดาวน์โหลด compiler ผ่าน Hardhat; optimizer 200 runs, Solidity 0.8.28, EVM Shanghai ซึ่งอยู่ภายในชุด opcode ที่ Avalanche รองรับ

## Deploy ไป Avalanche Fuji จริง

Fuji เป็น testnet; chain ID **43113**, RPC **https://api.avax-test.network/ext/bc/C/rpc**, native gas **AVAX** ตาม [Avalanche network documentation](https://build.avax.network/docs/dapps) และ [Fuji setup](https://support.avax.network/en/articles/6224787-how-to-connect-to-the-fuji-testnet)

1. สร้างบัญชีสถาบันทดสอบแยก 3 บัญชีใน Core/MetaMask: **admin**, **result authority**, **university issuer** นักเรียนไม่ต้องมี wallet
2. ขอ test AVAX จาก [Avalanche faucet](https://faucet.avax.network/) ตามเงื่อนไขที่เว็บกำหนด แล้วเติมทั้ง 3 บัญชีที่ต้องส่งธุรกรรม
3. ตั้งค่า `.env`:

```dotenv
RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
CHAIN_ID=43113
ADMIN_PRIVATE_KEY=0x...64_hex_characters...
AUTHORITY_PRIVATE_KEY=0x...64_hex_characters...
ISSUER_PRIVATE_KEY=0x...64_hex_characters...
# เว้นว่างเพื่อใช้ admin signer เป็น admin หรือระบุ governance address
ADMIN_ADDRESS=
```

สร้าง API tokens **สามค่าต่างกัน** ด้วย `openssl rand -hex 32` แล้วใส่ `ADMIN_API_TOKEN`, `INTEGRATION_API_TOKEN`, `ISSUER_API_TOKEN` คีย์และ tokens อยู่ฝั่ง server เท่านั้น ห้ามใช้ชื่อ `VITE_*` หรือ commit `.env`

4. Deploy และ authorize issuer:

```sh
npm run compile
npm run deploy
# ใส่ CONTRACT_ADDRESS และ DEPLOYMENT_BLOCK จากผลลัพธ์ลง .env
npm run bootstrap
```

`deploy` ตรวจ chain ID จริง, รอ receipt สำเร็จ และบันทึก manifest ใน `deployments/<chainId>-<address>.json` ถ้า `ADMIN_ADDRESS` เป็น multisig ให้ multisig เรียก `authorizeInstitution(issuerAddress, true)` แทน bootstrap ที่ใช้ admin private key

5. เปิด MongoDB และ API:

```sh
docker compose up -d mongo
# หรือใส่ MongoDB Atlas URI ใน MONGODB_URI แทน Docker
npm run build
npm start
```

API bind `127.0.0.1:3001` สำหรับเครื่อง local เมื่อ deploy server ให้ใช้ HTTPS reverse proxy มายัง port นี้ MongoDB compose เปิดเฉพาะ loopback และมี persistent volume; สำหรับ shared/hosted environment ให้ใช้ฐานข้อมูลที่มี authentication และ TLS

```sh
curl http://127.0.0.1:3001/ready
```

6. ตั้ง `DEMO_PASSWORD` อย่างน้อย 12 ตัวอักษรใน `.env` แล้วรัน:

```sh
npm run demo
```

Demo จะ commit/lock กติกาของ Fictional Engineering (capacity 1) **ก่อน** เรียก matching engine สร้าง Pim ผ่านและ Narin ไม่ผ่าน บันทึกผลทั้งคู่ ให้ Pim login/confirm ออก admission right แล้วอ่านยืนยันจาก Fuji; Narin ได้ผลและ proof ไม่มี admission right ทุกครั้งสร้าง run ใหม่ จึงมีค่า gas testnet ทุกครั้ง

ดู transaction ใน [Avalanche Fuji explorer](https://subnets-test.avax.network/c-chain) โดยค้น hash จาก deploy output หรือ API proof

## รันครบวงจรในเครื่องโดยไม่ใช้ AVAX

Terminal แรก:

```sh
cd backend
npm run chain
```

ตั้ง `.env` ให้ `RPC_URL=http://127.0.0.1:8545`, `CHAIN_ID=31337` และใช้ private keys ของบัญชีทดสอบที่ Hardhat แสดง เลือกบัญชี 0 เป็น admin, 1 เป็น authority, 2 เป็น issuer **คีย์ Hardhat เป็นคีย์สาธารณะ ห้ามใช้บน network ที่มีสินทรัพย์จริง**

Terminal ที่สองทำตามลำดับ `compile → deploy → ใส่ address/block → bootstrap → docker compose up -d mongo → dev → demo` โดยรัน `demo` ในอีก terminal หลัง API พร้อม

รีสตาร์ต Hardhat จะล้าง chain ต้อง deploy ใหม่ และใช้ Mongo database ใหม่หรือเคลียร์เฉพาะข้อมูล demo เดิมก่อน อย่านำข้อมูลจาก chain เก่ามาอ้างเป็นหลักฐานของ chain ใหม่

## ตรวจเองโดยไม่พึ่ง API

CLI ต่อไปนี้ใช้แค่ RPC_URL, CHAIN_ID, CONTRACT_ADDRESS และ ABI ไม่ต้องใช้ private keys หรือ API tokens:

```sh
npm run verify -- 0x<CREDENTIAL_ID_64_HEX>
# หลังนักเรียนอนุญาตให้รับ private proof JSON:
npm run verify -- 0x<RESULT_ID_64_HEX> ./private-proof.json
```

Proof JSON มาจาก `GET /v1/me/results/:id/proof` ประกอบด้วย report และ salt ผู้ถือควรแชร์เฉพาะเมื่อยินยอม เพราะมีคะแนนและ preferences ห้ามอัปโหลดลง explorer หรือ public storage ตัว CLI คำนวณ canonical commitment ใหม่และเทียบกับ contract ไม่อาศัยค่า `verification` ที่มากับ JSON

ผลที่ตรง commitment หมายถึง **ผลตรงกับที่ authority บันทึก** ไม่ได้หมายความว่าคะแนนมาจากหน่วยสอบจริงหรือ allocation ถูกต้อง ทุก API proof จึงตั้ง `scoreAuthenticity` และ `allocationCorrectness` เป็น `not_verified` ใน MVP นี้

## ตรวจ source บน explorer

หลัง compile จะมี `artifacts/standard-input.json` ที่รวม imported OpenZeppelin sources แล้ว ใน explorer ที่รองรับ Solidity Standard JSON Input ให้เลือก compiler `v0.8.28+commit.7893614a`, optimizer 200, EVM Shanghai และ contract `FairPassRegistry.sol:FairPassRegistry`

Constructor arguments คือ `(adminAddress, authorityAddress)` ดูค่าจาก deployment manifest หาก explorer ขอ ABI-encoded constructor arguments ให้ encode สอง address นี้ตาม ABI; การ deploy สำเร็จและการ verify source เป็นคนละขั้นตอน

## Mainnet

C-Chain mainnet ใช้ chain ID **43114** และ RPC **https://api.avax.network/ext/bc/C/rpc** ตาม [Avalanche docs](https://build.avax.network/docs/dapps) deploy script ต้องตั้ง `ALLOW_MAINNET=true` จึงจะส่งธุรกรรม deploy บน mainnet ให้เริ่มด้วย Fuji ก่อน โค้ดนี้เป็น hackathon MVP ที่ยังไม่ผ่าน independent security audit และยังไม่มี official admissions integration

ดู [API.md](API.md) สำหรับ endpoint/payload และ [SECURITY.md](SECURITY.md) สำหรับสิ่งที่ระบบบังคับจริงและ trust boundaries
