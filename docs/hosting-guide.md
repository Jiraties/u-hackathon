# FairPass — Public hosting on Fuji

ระบบทั้งชุดรันบน hosting ได้และไม่ต้องเปิดคอมพิวเตอร์ส่วนตัวค้างไว้ โดยให้ VPS รัน frontend/API/HTTPS และให้ MongoDB Atlas เก็บฐานข้อมูล ส่วน smart contract ที่ deploy แล้วรันบน Avalanche อยู่แล้ว

คู่มือนี้เตรียม public **fictional Fuji demo** ไม่ใช่การ deploy mainnet และไม่เปลี่ยน registry/signing keys เดิม ระบบยังไม่พร้อมใช้รับรองสิทธิ์นักเรียนจริงด้วย public development keys

## โครงสร้างที่เตรียมให้

```text
Internet → https://fairpass.your-domain.com
                 Caddy :443
                    ↓
             web / Nginx :8080
                    ↓ /api
               backend :3001
                  ↙     ↘
        MongoDB Atlas   Avalanche Fuji RPC
```

ใช้ [compose.hosting.yaml](../compose.hosting.yaml) แบบ standalone เท่านั้น ไม่รวมกับ `compose.yaml` หรือ `compose.fuji.yaml` เพราะสองชุดนั้นมี MongoDB local และ environment สำหรับ demo บนเครื่อง

เปิด public เฉพาะ 80/443; backend และ web ไม่มี published port, MongoDB อยู่บน Atlas, ไม่มี local Hardhat node และไม่มี auto-deploy contract ในชุด hosting

## 1. เตรียม VPS และ domain

ตัวอย่าง sizing เริ่มต้นสำหรับ demo: Linux VPS 2 vCPU / RAM 4 GB / disk 25–40 GB ไม่ใช่ capacity guarantee ต้องเพิ่มตามการใช้งานจริงและพื้นที่ Docker build

ติดตั้ง Docker Engine และ Compose plugin ตาม [Docker Ubuntu guide](https://docs.docker.com/engine/install/ubuntu/) ให้ Docker daemon เริ่มอัตโนมัติเมื่อ VPS reboot แล้วตรวจ:

```sh
docker version
docker compose version
```

ตั้ง DNS A record ของ `fairpass.your-domain.com` ไป public IPv4 ของ VPS ถ้าใส่ AAAA ต้องให้ IPv6 ไป VPS ที่รับ traffic ได้จริง เปิด inbound TCP 80/443 และ SSH เฉพาะที่จำเป็น อย่าเปิด 3001/8080/27017 สู่ Internet

Caddy ออกและต่ออายุ TLS certificate ให้เมื่อ DNS ตรงและ ports เข้าถึงได้ เก็บ certificate ใน persistent volumes ตาม [Automatic HTTPS](https://caddyserver.com/docs/automatic-https)

## 2. สร้าง MongoDB Atlas

1. สร้าง Atlas project และ cluster เลือก region ใกล้ API server
2. สร้าง **database user** สำหรับแอป ต่างจากบัญชี login เข้า Atlas ให้สิทธิ์ read/write เฉพาะฐานข้อมูล FairPass
3. ใน IP access list เพิ่ม public outbound IP ของ VPS (หรือใช้ private connectivity ที่รองรับ) ไม่เปิด `0.0.0.0/0` เป็นค่าเริ่มต้น
4. เลือก Connect → Drivers → Node.js คัดลอก `mongodb+srv://...` และใส่ database username/password; URL-encode อักขระพิเศษใน username/password
5. ตั้งชื่อฐานข้อมูลแยกตาม network/contract เช่น `fairpass_fuji_demo` ฐานข้อมูลจะเกิดเมื่อแอปเขียนข้อมูล

รายละเอียดจาก [Atlas connection guide](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/)

ฐานข้อมูลไม่ได้ย้ายขึ้น Atlas อัตโนมัติ การตั้ง URI ใหม่จะได้ฐานข้อมูลว่าง ถ้าต้องการบัญชี/ผล/บัตรจาก demo เดิม ต้องย้ายข้อมูลตามข้อ 3 ก่อนเปิด API ใหม่

## 3. ย้ายข้อมูลเดิม โดยคง registry

ถ้าต้องการเริ่มฐานข้อมูลใหม่ให้ข้ามส่วนนี้แล้ว provision บัญชีใหม่ แต่ wallet ของบัญชีใหม่จะไม่เห็นผลเดิมเพียงเพราะใช้ contract เดิม

ถ้าต้องการเก็บผลเดิม:

1. หยุด API writer เดิมชั่วคราว รอ transaction ที่กำลังทำให้จบ คง MongoDB เดิมไว้
2. บนเครื่องเดิม export database ที่ระบุใน `backend/.env` (แทน `ACTUAL_DATABASE_NAME`):

```sh
umask 077
docker compose -f compose.yaml -f compose.fuji.yaml stop backend
docker compose -f compose.yaml -f compose.fuji.yaml exec -T mongo \
  mongodump --db ACTUAL_DATABASE_NAME --archive --gzip > /private/tmp/fairpass.archive.gz
```

3. ส่ง archive ไป VPS ผ่าน SSH/SCP และเก็บนอก git/web directory ด้วย permission 600
4. ติดตั้ง MongoDB Database Tools บน VPS สร้าง `/secure/atlas-restore.yaml` แบบ permission 600:

```yaml
uri: "mongodb+srv://DATABASE_USER:ENCODED_PASSWORD@YOUR_CLUSTER/?retryWrites=true&w=majority"
```

5. Restore เข้า **ฐานข้อมูลใหม่ที่ว่าง** บน Atlas เปลี่ยนชื่อถ้าจำเป็น:

```sh
mongorestore --config=/secure/atlas-restore.yaml \
  --archive=/secure/fairpass.archive.gz --gzip \
  --nsInclude='ACTUAL_DATABASE_NAME.*' \
  --nsFrom='ACTUAL_DATABASE_NAME.*' --nsTo='fairpass_fuji_demo.*'
```

คำสั่งนี้ไม่ใช้ `--drop` และไม่ควร restore ทับฐานข้อมูลที่กำลังรับงาน เก็บ collection ทั้งชุดรวม `subjects`, `results`, `programs`, `runs`, accounts และ drafts; salt และ subject mappings ต้องคงเดิม ตรวจจำนวน documents/IDs และให้ sign in ใหม่หลังย้าย (session เก่าอาจตามมาด้วยและยังไม่หมดอายุ)

6. เปิด API hosted หลังตรวจข้อมูลแล้ว หลีกเลี่ยง writer สองชุดใช้ signer เดียวพร้อมกัน ถ้า rollback ให้หยุด hosted writer ก่อนเปิด writer เดิม

ดู [mongorestore configuration/archive documentation](https://www.mongodb.com/docs/database-tools/mongorestore/) ฐานข้อมูลมีข้อมูลส่วนตัว จึงเก็บ archive/config เป็นความลับและ backup แบบเข้ารหัส

## 4. เตรียม repository และ environment บน VPS

```sh
git clone --branch api https://github.com/Jiraties/u-hackathon.git
cd u-hackathon
cp hosting.env.example .env.hosting
cp backend/.env.example backend/.env
chmod 600 .env.hosting backend/.env
```

โค้ดใหม่ต้อง commit/push ให้ VPS clone ได้ก่อน ขั้นตอน clone ไม่ได้อัปโหลดงาน local ให้เอง

แก้ `.env.hosting`:

```dotenv
PUBLIC_HOST=fairpass.your-domain.com
ACME_EMAIL=you@your-domain.com
```

แก้ `backend/.env` บน VPS โดยย้ายค่าเดิมผ่านช่องทางปลอดภัย ไม่ใส่ใน git หรือ frontend variables:

```dotenv
CHAIN_ID=43113
RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
CONTRACT_ADDRESS=0x55e5eee9feb02b6e4b534b1b0d1ea8ea61eb2955
DEPLOYMENT_BLOCK=59517556
MONGODB_URI=mongodb+srv://DATABASE_USER:ENCODED_PASSWORD@YOUR_CLUSTER/?retryWrites=true&w=majority
MONGODB_DATABASE=fairpass_fuji_demo
INSTITUTION_ID=fairpass-demo
INSTITUTION_NAME=Example University
```

ใช้ `ISSUER_PRIVATE_KEY` / `AUTHORITY_PRIVATE_KEY` ที่ตรงกับ registry เดิมตาม `.env` เดิม และ machine tokens ที่ตั้งไว้ ห้ามใส่ placeholder เป็น key จริง ต้องมี test AVAX สำหรับ authority/issuer ที่ส่งธุรกรรม

`ADMIN_API_TOKEN`, `ISSUER_API_TOKEN`, `INTEGRATION_API_TOKEN` ต้องยาวอย่างน้อย 32 ตัวและเป็น secret ถ้าสร้างใหม่ใช้ตัวสร้าง random ที่เชื่อถือได้ เช่น `openssl rand -hex 32` แล้วบันทึกเฉพาะ server ตั้ง `DEMO_PASSWORD` อย่างน้อย 12 ตัวสำหรับ provisioning demo accounts

Compose hosted บังคับ Fuji, ปิด local keys/deployment loading และกำหนด `CORS_ORIGIN=https://PUBLIC_HOST` กับ `TRUST_PROXY_HOPS=2` ให้เอง ค่า 2 ใช้กับ topology **Caddy → Nginx → API** ที่ไม่มี API public port เท่านั้น ตาม [Express proxy guidance](https://expressjs.com/en/guide/behind-proxies/)

Fuji chain ID/RPC มาจาก [Avalanche Primary Network documentation](https://build.avax.network/docs/primary-network) ไม่ต้องรัน Avalanche validator หรือ Hardhat บน VPS เพื่อใช้ public RPC

## 5. Build และ start

```sh
docker compose --env-file .env.hosting -f compose.hosting.yaml config --quiet
docker compose --env-file .env.hosting -f compose.hosting.yaml build backend web tools
docker compose --env-file .env.hosting -f compose.hosting.yaml up -d backend web caddy
docker compose --env-file .env.hosting -f compose.hosting.yaml ps
```

อย่าแสดง `docker compose config` แบบเต็มใน log สาธารณะ เพราะค่า env_file อาจมี secrets ใช้ `--quiet` เพื่อตรวจ syntax

ถ้าฐานข้อมูลใหม่ยังไม่มีบัญชี:

```sh
docker compose --env-file .env.hosting -f compose.hosting.yaml --profile tools \
  run --rm tools dist/scripts/provision-demo.js
```

ได้ demo-office/demo-pim/demo-narin ใช้ password ที่ provision ไว้ บัญชีที่มีแล้วจะไม่เปลี่ยน password อัตโนมัติ คำสั่ง provisioning ไม่ deploy contract หรือออก admission token

## 6. ตรวจหลังขึ้น hosting

```sh
curl --fail https://fairpass.your-domain.com/healthz
curl --fail https://fairpass.your-domain.com/api/ready
```

ตรวจ chain ID/contract ให้ตรง Fuji เดิม จากนั้น:

1. เปิดเว็บจากมือถือผ่าน mobile Internet
2. Sign in เจ้าหน้าที่และนักเรียน ตรวจข้อมูลเดิมหลัง migration
3. Verify credential ID เดิมและเปรียบเทียบ explorer
4. ทดสอบหนึ่ง intake สมมติตาม [live-demo-guide.md](live-demo-guide.md) การทดสอบแบบเขียนส่ง real Fuji transactions และใช้ test AVAX
5. Sign out แล้ว sign in ใหม่ ตรวจ flow ที่ยังไม่มีผล/not found/unavailable
6. ปิดคอมพิวเตอร์ส่วนตัวและเปิดเว็บจากอุปกรณ์อื่น ถ้ายังใช้ได้แสดงว่าไม่พึ่งเครื่อง local

Local automated tests ผ่านไม่ได้แปลว่า DNS/TLS/Atlas ของ server ใหม่ผ่าน ต้องตรวจขั้นตอนนี้ที่ VPS จริง

## 7. Update และ operation

```sh
git pull --ff-only origin api
docker compose --env-file .env.hosting -f compose.hosting.yaml build backend web tools
docker compose --env-file .env.hosting -f compose.hosting.yaml up -d --no-deps backend web
docker compose --env-file .env.hosting -f compose.hosting.yaml ps
```

ระหว่าง update แบบ single API อาจมีช่วงสั้นที่ใช้งานไม่ได้ ไม่ใช่ zero-downtime deployment เก็บหนึ่ง API writer ต่อ signer wallet; การ scale ต้องเพิ่ม durable queue/nonce coordination ก่อน

ตั้ง monitoring HTTPS และ `/api/ready`, disk/RAM, Atlas, RPC และ test AVAX balances ตั้ง backup ตาม tier ที่เลือกและลอง restore ลงฐานข้อมูลแยกจริง Atlas Free cluster ต้องวางแผน `mongodump`/`mongorestore` เองตาม [Atlas backup documentation](https://www.mongodb.com/docs/atlas/backup-restore-cluster/)

หาก restart VPS Docker เริ่มขึ้นและ `restart: unless-stopped` จะช่วยเปิด services ที่ไม่ได้ถูก stop ไว้ก่อนหน้า แต่ยังต้องให้ VPS/Atlas/RPC พร้อม ไม่สามารถปิด VPS แล้วคาดว่า API จะทำงานได้

## พร้อมใช้งานระดับไหน

| ประเด็น | สถานะ |
| --- | --- |
| Host UI/API/MongoDB ให้เปิดใช้จาก Internet | รองรับ topology นี้ ต้องใส่ VPS/domain/Atlas และตรวจจริง |
| ใช้ registry Fuji เดิม ไม่ต้องเปิดเครื่องส่วนตัว | ได้ ไม่ต้อง deploy ใหม่ |
| Mainnet | ชุด hosting นี้ป้องกันไว้ ไม่ deploy mainnet |
| ข้อมูลรับสมัครจริง / university identity | ยังไม่พร้อมด้วย public development keys และ fictional inputs |
| Account recovery, MFA, official score-provider integration | ยังไม่มี |
| Independent allocation fairness proof | ยังไม่มี |
| High availability / multiple signer writers | ยังไม่มี; single-server MVP |

ไฟล์ hosting ถูกเตรียมให้แล้ว แต่ยังไม่ได้สร้าง VPS/Atlas/domain หรือเผยแพร่ public URL แทนคุณ เพราะยังไม่มีบัญชีและค่าปลายทางนั้น
