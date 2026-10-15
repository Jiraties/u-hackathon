import type { PublicCredential } from "../domain/models";
export type DemoVerificationResult =
  | { kind: "valid" | "withdrawn" | "revoked"; credential: PublicCredential }
  | { kind: "not_found" | "unavailable" };
/** Local presentation demo only. This is NOT an implementation of PublicRegistry. */
export const checkDemoCredential = (code: string, records: readonly PublicCredential[]): DemoVerificationResult => {
  if (code === "FP-DEMO-OFFLINE") return { kind: "unavailable" };
  const credential = records.find(record => record.id === code);
  if (!credential) return { kind: "not_found" };
  return { kind: credential.status === "active" ? "valid" : credential.status, credential };
};
export const normalizeCredentialCode = (input: string): string => {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const path = new URL(trimmed).pathname.match(/^\/verify\/([^/]+)\/?$/);
      return path ? normalizeCredentialCode(decodeURIComponent(path[1])) : "";
    } catch { return ""; }
  }
  return /^0x[0-9a-f]{64}$/i.test(trimmed) ? trimmed.toLowerCase() : trimmed.toUpperCase();
};
