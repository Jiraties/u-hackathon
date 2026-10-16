import 'dotenv/config';
import { z } from 'zod';
const key = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const schema = z.object({
  HOST: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017'),
  MONGODB_DATABASE: z.string().regex(/^[a-zA-Z0-9_-]+$/).default('fairpass'),
  RPC_URL: z.url(), CHAIN_ID: z.coerce.number().refine(v => [31337, 43113, 43114].includes(v)),
  CONTRACT_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  DEPLOYMENT_BLOCK: z.coerce.bigint().nonnegative(),
  ISSUER_PRIVATE_KEY: key, AUTHORITY_PRIVATE_KEY: key,
  ADMIN_API_TOKEN: z.string().min(32), INTEGRATION_API_TOKEN: z.string().min(32), ISSUER_API_TOKEN: z.string().min(32),
  INSTITUTION_NAME: z.string().min(1).max(200).default('Example University'),
  INSTITUTION_ID: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).default('fairpass-demo'),
  CORS_ORIGIN: z.url().default('http://localhost:5173'),
});
export type Config = z.infer<typeof schema>;
export const readConfig = (): Config => schema.parse(process.env);
