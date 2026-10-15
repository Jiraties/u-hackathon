# FairPass Docker deployment

รันคำสั่งจาก root ของโปรเจกต์ (`/Users/theeratdolchat/Documents/u-hackathon`) ใช้ Docker Desktop หรือ Docker Engine พร้อม **Docker Compose >= 2.24.4** ไม่ต้องติดตั้ง Node.js, npm, pnpm หรือ MongoDB บน host สำหรับ workflow นี้

## Local: เปิดทั้งโปรเจกต์

```sh
docker compose up --build -d --wait
```

เปิด **http://localhost:8080**

| Service | หน้าที่ | การเข้าถึงจาก host |
|---|---|---|
| `web` | Build React/Vite เดิมและ serve ผ่าน Nginx | `http://localhost:8080` |
| `backend` | TypeScript API (production build, non-root user) | ผ่าน `http://localhost:8080/api/` |
| `mongo` | Private records และ sessions | Docker network เท่านั้น |
| `chain` | Local Hardhat EVM | `http://127.0.0.1:18546` |
| `init` | Deploy contract และ authorize issuer | จบการทำงานด้วย exit code 0 |
| `tools` | CLI demo/deploy/verify; เปิดเมื่อสั่ง `run` | ไม่มี port |

ลำดับ startup คือ chain healthy → init deploy/authorize → Mongo healthy → backend ready → web พร้อมใช้งาน

Local mode **ไม่อ่าน `backend/.env`** จึงไม่ต้องเปลี่ยน configuration Fuji ของผู้ใช้ ระบบใช้ public Hardhat keys และ local-only API tokens โดยอัตโนมัติ สร้าง local deployment manifest ใน named volume ให้ backend/tools อ่าน

Frontend ยังเป็น demo เดิมตามขอบเขตที่ห้ามแก้ source การมี container และ reverse proxy **ยังไม่ได้เชื่อมข้อมูลบนหน้า UI กับ backend** ทดสอบ live backend ได้ผ่าน API หรือ CLI ด้านล่าง

### ตรวจระบบและ demo

```sh
docker compose ps -a
curl http://localhost:8080/api/ready
docker compose run --rm --build tools
```

คำสั่ง `tools` ที่ไม่ระบุ arguments จะรัน demo สมมติ: lock rules → record admitted/not-admitted results → authenticated confirmation → issue right → verify บน local EVM

ตรวจ credential ที่ได้จาก demo โดยใส่ bytes32 ID จริง:

```sh
docker compose run --rm tools dist/scripts/verify.js 0x<CREDENTIAL_ID>
curl http://localhost:8080/api/v1/public/verify/0x<CREDENTIAL_ID>
```

ดู logs:

```sh
docker compose logs --tail=100 backend init
docker compose logs -f backend web
```

Local machine tokens (สำหรับใช้ทดสอบเท่านั้น):

| Role | Bearer token |
|---|---|
| Admin | `fairpass-local-admin-token-not-for-public-use` |
| Integration | `fairpass-local-integration-token-not-for-public-use` |
| Issuer | `fairpass-local-issuer-token-not-for-public-use` |

นักเรียนที่ demo สร้างใช้รหัสผ่าน `fairpass-local-fictional-password` และ student ID ที่ demo แสดง เช่น `pim-<runId>` ใช้ `/api/v1/auth/login` เพื่อรับ session

### Port และการหยุดระบบ

ถ้า port ชนกับระบบที่เปิดอยู่:

```sh
WEB_PORT=18080 CHAIN_PORT=18547 docker compose up --build -d --wait
```

ใช้ค่า port เดียวกันในคำสั่ง Compose ถัดไปของชุดนั้นด้วย

```sh
docker compose stop
# กลับมาใช้งาน container เดิม
docker compose up -d --wait

# ปิดและลบ containers/network แต่เก็บ named volumes
docker compose down
```

**Local Hardhat ไม่เก็บ chain state ข้ามการ restart process/container** เมื่อเริ่ม chain ใหม่ให้ใช้ `docker compose down` แล้ว `docker compose up -d --wait` เพื่อให้ init/backend ทำงานตามลำดับใหม่ ระบบจะ deploy ใหม่และเลือก Mongo database ใหม่ให้อัตโนมัติเมื่อไม่พบ contract เดิมบน chain ข้อมูล Mongo เก่ายังเก็บอยู่ใน volume แต่ไม่ถูกนำมาแสดงเป็นข้อมูลของ chain ใหม่

อย่า restart เฉพาะ `chain` แล้วปล่อย backend เก่าทำงานต่อ เพราะ backend โหลด deployment/database ตอนเริ่ม process

## Avalanche Fuji: ใช้ containers กับ public testnet

ใช้ `compose.yaml` ร่วมกับ `compose.fuji.yaml` โหมดนี้เปิดเฉพาะ web/backend/Mongo โดย chain และ init local ถูกปิดด้วย profile ใช้ชื่อ project `fairpass-fuji` และ volumes แยกจาก local

### 1. เตรียม backend/.env

หากยังไม่มีไฟล์ ให้ copy `.env.example` เป็น `.env` โดยไม่ทับไฟล์ที่มีอยู่ แล้วตั้งค่า:

```dotenv
RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
CHAIN_ID=43113
MONGODB_DATABASE=fairpass_fuji
ADMIN_PRIVATE_KEY=0x<ADMIN_PRIVATE_KEY_64_HEX>
ADMIN_ADDRESS=
AUTHORITY_PRIVATE_KEY=0x<AUTHORITY_PRIVATE_KEY_64_HEX>
ISSUER_PRIVATE_KEY=0x<ISSUER_PRIVATE_KEY_64_HEX>
ADMIN_API_TOKEN=<RANDOM_TOKEN_1>
INTEGRATION_API_TOKEN=<RANDOM_TOKEN_2>
ISSUER_API_TOKEN=<RANDOM_TOKEN_3>
CORS_ORIGIN=http://localhost:8080
DEMO_PASSWORD=<FICTIONAL_PASSWORD_AT_LEAST_12_CHARACTERS>
CONTRACT_ADDRESS=
DEPLOYMENT_BLOCK=0
```

ใช้บัญชีสถาบันใหม่แยก 3 บัญชีและเติม **test AVAX บน Fuji C-Chain** ให้ทั้งสามบัญชี ห้ามใช้ public Hardhat keys สำหรับ Fuji หรือ mainnet สร้าง API tokens แยกสามค่าด้วย `openssl rand -hex 32` หรือเครื่องมือสร้าง secret ที่เชื่อถือได้

Fuji network/faucet: https://build.avax.network/docs/primary-network

`env_file` ส่งค่าเข้า container ตอน runtime; `.dockerignore` และ explicit COPY ป้องกัน `.env` เข้า build image ไม่ใส่ keys ใน build arguments อย่างไรก็ตามผู้ที่เข้าถึง Docker daemon ได้สามารถตรวจ environment ของ container ได้

### 2. Deploy contract ผ่าน tooling container

```sh
docker compose -f compose.yaml -f compose.fuji.yaml run --rm --build tools dist/scripts/deploy.js
```

นำ `CONTRACT_ADDRESS` และ `DEPLOYMENT_BLOCK` จากผลลัพธ์มาใส่ใน `backend/.env` จากนั้น authorize issuer:

```sh
docker compose -f compose.yaml -f compose.fuji.yaml run --rm tools dist/scripts/bootstrap.js
```

การ run สองคำสั่งนี้ส่งธุรกรรมจริงขึ้น Fuji มีค่า gas เป็น test AVAX และบันทึก deployment manifest ใน named volume `fairpass-fuji_deployments` ไม่เปิด backend ก่อนตั้งค่าเสร็จ

ถ้ามี contract Fuji เดิมที่ถูกต้องแล้ว ไม่ต้อง deploy ซ้ำ ให้ใช้ address/block เดิมและตรวจว่า authority/issuer ตรงกับ configuration

### 3. เปิดแอปและตรวจผล

ถ้า local stack ใช้ port 8080 อยู่ ให้หยุด local ด้วย `docker compose down` ก่อน หรือกำหนด `WEB_PORT` อื่น

```sh
docker compose -f compose.yaml -f compose.fuji.yaml up --build -d --wait
curl http://localhost:8080/api/ready
docker compose -f compose.yaml -f compose.fuji.yaml run --rm tools
```

ตรวจ credential แบบอิสระ:

```sh
docker compose -f compose.yaml -f compose.fuji.yaml run --rm tools dist/scripts/verify.js 0x<CREDENTIAL_ID>
```

API ยังรันใน Docker บนเครื่องคุณได้ขณะที่ contract อยู่บน Fuji ไม่จำเป็นต้องนำ API ขึ้น cloud เพื่อทดสอบ chain

Compose override ตั้ง `HOST=0.0.0.0`, port ภายใน 3001, `MONGODB_URI=mongodb://mongo:27017`, `API_URL=http://backend:3001` ให้เอง ส่วน database name, keys, tokens, RPC และ address/block มาจาก `.env` ควรใช้ database name แยกเมื่อ deploy contract ใหม่ เพื่อไม่ให้ records ของ contract เก่าปะปนกัน หากแก้ `.env` หลังเปิดระบบ ให้ recreate backend:

```sh
docker compose -f compose.yaml -f compose.fuji.yaml up -d --force-recreate backend web
```

### นำไปเปิดบน server

นำ source และ `backend/.env` ไปยัง server ที่มี Docker แล้วทำขั้นตอน Fuji เดิม ใช้ contract เดิมได้ ไม่ต้อง deploy ใหม่ทุกครั้งที่ rebuild image

```sh
WEB_BIND=0.0.0.0 WEB_PORT=80 docker compose -f compose.yaml -f compose.fuji.yaml up --build -d --wait
```

ตั้ง `CORS_ORIGIN` เป็น URL ที่ผู้ใช้เปิดจริง และวาง HTTPS reverse proxy/load balancer ด้านหน้าเมื่อเปิดให้ผู้อื่นใช้งาน ไม่มีการ publish MongoDB หรือ backend port โดยตรงใน configuration นี้

Mongo ที่มากับ Compose เหมาะกับ demo ใน private Docker network ยังไม่ได้ตั้ง authentication/TLS หรือ automated backups สำหรับข้อมูลนักเรียนจริง หากใช้งานจริงให้จัดการส่วนนี้ก่อน โค้ด contract ยังเป็น hackathon MVP ที่ไม่ได้ผ่าน independent security audit

## การเก็บข้อมูลและการสำรอง

- `mongo-data`: ข้อมูลนักเรียน sessions และผลสมัคร
- `deployments`: contract deployment manifests และ local runtime configuration
- `docker compose down` เก็บ volumes ไว้
- `docker compose down -v` **ลบ volumes และข้อมูลในชุดนั้น** ใช้เฉพาะเมื่อจงใจล้าง demo
- Local และ Fuji ใช้ project names/volumes คนละชุด แต่ใช้ host port เดียวกันโดย default
- เมื่อใช้ Fuji การ rebuild/restart containers ไม่ได้ล้างข้อมูลบน public chain จึงต้องรักษา Mongo และ salts/mappings ไว้ด้วย

เอกสาร API: [backend/API.md](backend/API.md); trust boundaries: [backend/SECURITY.md](backend/SECURITY.md)
