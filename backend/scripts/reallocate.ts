import { readConfig } from '../src/config.js';
import { createChain } from '../src/chain.js';
import { z } from 'zod';
const args = z.tuple([z.string().regex(/^0x[0-9a-fA-F]{64}$/), z.coerce.number().int().positive(), z.string().regex(/^0x[0-9a-fA-F]{64}$/)]).parse(process.argv.slice(2));
const gateway = createChain(readConfig());
await gateway.ready();
console.log(await gateway.write('issuer', 'authorizeReallocation', args));
