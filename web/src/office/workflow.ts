import type { OfficeResult, PublicProgram } from "../services/api";
import type { AdmissionRulebook } from "../domain/rulebooks";
export type CohortApplicant = {
  id: string;
  scores: Record<string, number>;
  curriculum: string;
  preferences: string[];
};
export type ImportReview = { applicants: CohortApplicant[]; errors: string[] };
// RFC-style quoted cells, including escaped quotes and embedded newlines.
export function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell || closed)
        throw new Error("A quote must start an empty CSV cell.");
      quoted = true;
      continue;
    }
    if (c === "," || c === "\n" || c === "\r") {
      row.push(cell);
      cell = "";
      closed = false;
      if (c !== ",") {
        if (c === "\r" && source[i + 1] === "\n") i++;
        if (row.some((v) => v.trim())) rows.push(row);
        row = [];
      }
      continue;
    }
    if (closed) {
      if (c === " " || c === "\t") continue;
      throw new Error("Unexpected text after a quoted CSV cell.");
    }
    cell += c;
  }
  if (quoted) throw new Error("A quoted CSV cell is not closed.");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
export function reviewCohortCsv(
  text: string,
  rules: AdmissionRulebook[],
): ImportReview {
  const applicants: CohortApplicant[] = [],
    errors: string[] = [];
  if (!rules.length)
    return { applicants, errors: ["Choose the cohort programs first."] };
  let rows: string[][];
  try {
    rows = readCsv(text);
  } catch (e) {
    return { applicants, errors: [(e as Error).message] };
  }
  if (rows.length < 2)
    return {
      applicants,
      errors: ["Include a header and at least one applicant."],
    };
  if (rows.length > 101)
    return {
      applicants,
      errors: [
        "This version supports at most 100 applicants per intake. Do not split one intake into multiple processing runs.",
      ],
    };
  const headers = rows[0].map((v) => v.trim()),
    components = [
      ...new Map(
        rules.flatMap((r) => r.components.map((c) => [c.scoreId, c] as const)),
      ).values(),
    ];
  const required = [
    "studentId",
    "curriculum",
    "preferences",
    ...components.map((c) => c.scoreId),
  ];
  if (new Set(headers).size !== headers.length)
    errors.push("Column names must be unique.");
  for (const h of required)
    if (!headers.includes(h)) errors.push(`Missing column: ${h}.`);
  for (const h of headers)
    if (!required.includes(h))
      errors.push(`Unknown column: ${h}. Use the template for these programs.`);
  if (errors.length) return { applicants, errors };
  const seen = new Set<string>();
  rows.slice(1).forEach((cells, index) => {
    const line = index + 2,
      get = (key: string) => (cells[headers.indexOf(key)] ?? "").trim();
    if (cells.length !== headers.length)
      errors.push(`Row ${line}: expected ${headers.length} cells.`);
    const id = get("studentId");
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id))
      errors.push(`Row ${line}: enter a valid student ID.`);
    if (seen.has(id)) errors.push(`Row ${line}: duplicate student ${id}.`);
    seen.add(id);
    const preferences = get("preferences")
      .split("|")
      .map((v) => v.trim())
      .filter(Boolean);
    if (
      !preferences.length ||
      new Set(preferences).size !== preferences.length ||
      preferences.some((p) => !rules.some((r) => r.programId === p))
    )
      errors.push(
        `Row ${line}: preferences must be unique selected program slugs, separated by |.`,
      );
    const curriculum = get("curriculum");
    if (!["Science–Mathematics", "Arts–Languages"].includes(curriculum))
      errors.push(
        `Row ${line}: choose a supported curriculum from the template.`,
      );
    const scores: Record<string, number> = {};
    for (const c of components) {
      const raw = get(c.scoreId),
        value = Number(raw);
      if (!raw || !Number.isFinite(value) || value < 0 || value > c.maximum)
        errors.push(
          `Row ${line}: ${c.label} must be between 0 and ${c.maximum}.`,
        );
      scores[c.scoreId] = value;
    }
    applicants.push({ id, scores, curriculum, preferences });
  });
  return { applicants, errors };
}
export function cohortTemplate(rules: AdmissionRulebook[]): string {
  const components = [
    ...new Map(
      rules.flatMap((r) => r.components.map((c) => [c.scoreId, c] as const)),
    ).values(),
  ];
  const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
  return [
    [
      "studentId",
      "curriculum",
      "preferences",
      ...components.map((c) => c.scoreId),
    ],
    [
      "REPLACE_WITH_STUDENT_ID",
      "Science–Mathematics",
      rules.map((r) => r.programId).join("|"),
      ...components.map(() => ""),
    ],
  ]
    .map((row) => row.map(quote).join(","))
    .join("\r\n");
}
export function issuanceBlock(
  record: OfficeResult,
  program: PublicProgram | undefined,
): string | null {
  if (record.credential) return "Already issued";
  if (record.outcome !== "admitted") return "No offer";
  if (!record.confirmationRequestedAt) return "Awaiting acceptance";
  if (!program) return "Program unavailable";
  if (program.currentRules === false)
    return "Historical rules — review required";
  if (
    program.protocolVersion === 2 &&
    !record.scoring?.some(
      (e) =>
        e.programId === record.programId &&
        e.status === "verified" &&
        e.eligible,
    )
  )
    return "Scoring verification required";
  if (program.active >= program.capacity) return "No available capacity";
  if (program.issuanceAllowance < 1) return "No issuance allowance";
  return null;
}
