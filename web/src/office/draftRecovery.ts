import type { AdmissionRulebook } from "../domain/rulebooks";
export type DraftRecovery = {
  rule: AdmissionRulebook;
  revision: number;
  updatedAt: string;
};
const prefix = "fairpass-rule-recovery:";
export function recoveredDrafts(institution: string): DraftRecovery[] {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(`${prefix}${institution}:`))
      .flatMap((key) => {
        try {
          const value = JSON.parse(
            localStorage.getItem(key) ?? "null",
          ) as DraftRecovery;
          if (
            value?.rule?.institutionId !== institution ||
            typeof value.rule.id !== "string" ||
            !Array.isArray(value.rule.components) ||
            !Array.isArray(value.rule.qualifications) ||
            !Array.isArray(value.rule.requiredSubjects) ||
            !Number.isInteger(value.revision) ||
            !Number.isFinite(Date.parse(value.updatedAt))
          )
            return [];
          return [value];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}
export function rememberDraft(
  rule: AdmissionRulebook,
  revision: number,
): boolean {
  try {
    localStorage.setItem(
      `${prefix}${rule.institutionId}:${rule.id}`,
      JSON.stringify({ rule, revision, updatedAt: new Date().toISOString() }),
    );
    return true;
  } catch {
    return false;
  }
}
export function forgetDraft(rule: AdmissionRulebook) {
  try {
    localStorage.removeItem(`${prefix}${rule.institutionId}:${rule.id}`);
  } catch {
    /* Browser storage may be unavailable. */
  }
}
