import 'dotenv/config';
import { z } from 'zod';
const key = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const schema = z.object({
  MAX_FEE_PER_GAS_WEI: z.coerce.bigint().positive().optional(),
  DEMO_REPLAY_API_URL: z.url().optional(),
  WEB_DIST_DIR: z.string().min(1).optional(),
  HOST: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017'),
  MONGODB_DATABASE: z.string().regex(/^[a-zA-Z0-9_-]+$/).default('fairpass'),
  DEMO_WORLD_INSTANCE: z.string().regex(/^[a-zA-Z0-9-]{1,40}$/).optional(),
  DEMO_READ_ONLY: z.enum(['true','false']).default('false').transform(v=>v==='true'),
  ISSUER_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  DEMO_REPLAY_MANIFEST: z.string().min(1).optional(),
  REGISTRY_VERSION: z.coerce.number().refine(v=>v===1||v===2).default(1),
  RPC_URL: z.url(), CHAIN_ID: z.coerce.number().refine(v => [31337, 43113, 43114].includes(v)),
  CONTRACT_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  DEPLOYMENT_BLOCK: z.coerce.bigint().nonnegative(),
  ISSUER_PRIVATE_KEY: key.optional(), AUTHORITY_PRIVATE_KEY: key.optional(),
  ADMIN_API_TOKEN: z.string().min(32), INTEGRATION_API_TOKEN: z.string().min(32), ISSUER_API_TOKEN: z.string().min(32),
  SESSION_JWT_SECRET: z.string().min(32).optional(),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(30 * 24 * 60 * 60).default(7 * 24 * 60 * 60),
  INSTITUTION_NAME: z.string().min(1).max(200).default('Example University'),
  INSTITUTION_ID: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).default('fairpass-demo'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(2).default(0),
  CORS_ORIGIN: z.url().default('http://localhost:5173'),
}).superRefine((c,ctx)=>{
  if(!c.DEMO_READ_ONLY && (!c.ISSUER_PRIVATE_KEY||!c.AUTHORITY_PRIVATE_KEY))ctx.addIssue({code:'custom',message:'Write-enabled API requires issuer and authority signers'});
  if(c.DEMO_READ_ONLY && (!c.ISSUER_ADDRESS||c.ISSUER_PRIVATE_KEY||c.AUTHORITY_PRIVATE_KEY))ctx.addIssue({code:'custom',message:'Read-only replay requires a public issuer address and no private signer keys'});
});
export type Config = z.infer<typeof schema>;
export const readConfig = (): Config => schema.parse(process.env);
