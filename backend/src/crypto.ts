import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { keccak256, stringToHex, type Hex } from 'viem';
const scrypt = promisify(scryptCallback);
export const randomId = (): Hex => `0x${randomBytes(32).toString('hex')}`;
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export function safeEqual(a: string, b: string) {
  const left = Buffer.from(tokenHash(a)); const right = Buffer.from(tokenHash(b));
  return timingSafeEqual(left, right);
}
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}
export async function passwordMatches(password: string, encoded: string) {
  const [salt, expected] = encoded.split(':');
  const actual = await scrypt(password, salt, 64) as Buffer;
  const bytes = Buffer.from(expected, 'hex');
  return bytes.length === actual.length && timingSafeEqual(bytes, actual);
}
/** Versioned canonical JSON: recursively sorted keys; input validated before hashing. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map(key => `${JSON.stringify(key)}:${canonical(obj[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export const commitment = (record: unknown, salt: Hex): Hex =>
  keccak256(stringToHex(canonical({ scheme: 'fairpass-result-v1', salt, record })));
export const rulesCommitment = (record: unknown): Hex => keccak256(stringToHex(canonical(record)));
