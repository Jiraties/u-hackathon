export interface ChainReference {
  chainId: number;
  contractAddress: `0x${string}`;
  transactionHash: `0x${string}`;
  blockNumber: string;
}
export interface ScoreRecord {
  id: string;
  subject: string;
  label: string;
  score: number;
  maximum: number;
  provenance: "simulated-exam-provider";
}
export interface PreviewApplicant {
  id: string;
  scores: readonly ScoreRecord[];
  preferences: string[];
  qualifications: Record<string, string>;
}
export type ProgramScoreCalculation =
  | {
      status: "calculated";
      total: number;
      rawTotal: number;
      terms: {
        subject: string;
        label: string;
        score: number;
        maximum: number;
        weightPercent: number;
        contribution: number;
      }[];
    }
  | { status: "unavailable"; reason: string };

/** Reproducible program-specific arithmetic, not score authentication or allocation verification. */
export const calculateProgramScore = (
  scores: readonly ScoreRecord[],
  criteria: readonly { scoreId: string; weightPercent: number }[],
): ProgramScoreCalculation => {
  if (
    !criteria.length ||
    new Set(criteria.map((term) => term.scoreId)).size !== criteria.length ||
    criteria.some(
      (term) =>
        !Number.isFinite(term.weightPercent) ||
        term.weightPercent <= 0 ||
        term.weightPercent > 100,
    ) ||
    Math.abs(
      criteria.reduce((sum, term) => sum + term.weightPercent, 0) - 100,
    ) > 0.000001
  ) {
    return {
      status: "unavailable",
      reason: "The program’s criteria are incomplete or invalid.",
    };
  }
  const terms = [];
  for (const criterion of criteria) {
    const matches = scores.filter((score) => score.id === criterion.scoreId);
    const score = matches[0];
    if (
      matches.length !== 1 ||
      !score ||
      !Number.isFinite(score.score) ||
      !Number.isFinite(score.maximum) ||
      score.maximum <= 0 ||
      score.score < 0 ||
      score.score > score.maximum
    ) {
      return {
        status: "unavailable",
        reason: "A required subject score is missing or invalid.",
      };
    }
    terms.push({
      subject: score.subject,
      label: score.label,
      score: score.score,
      maximum: score.maximum,
      weightPercent: criterion.weightPercent,
      contribution: (score.score / score.maximum) * criterion.weightPercent,
    });
  }
  // Stable summation order makes canonical-equivalent component sets produce
  // exactly the same unrounded ranking score, while preserving display order.
  const rawTotal = terms
    .map((term) => term.contribution)
    .sort((a, b) => a - b)
    .reduce((sum, value) => sum + value, 0);
  return {
    status: "calculated",
    total: Math.round((rawTotal + Number.EPSILON) * 100) / 100,
    rawTotal,
    terms,
  };
};

export interface ScoringComponent {
  scoreId: string;
  label: string;
  source: "demo-exam-provider" | "demo-school-record";
  sourceComponentId: string;
  maximum: number;
  transformation: "normalize-to-100";
  weightPercent: number;
  minimumPercent: number | null;
}
export interface AdmissionRulebook {
  id: string;
  programId: string;
  institutionId: string;
  programName: string;
  faculty: string;
  academicYear: number;
  round: string;
  capacity: number;
  version: number;
  method: "normalized-weighted-sum";
  components: ScoringComponent[];
  requiredSubjects: string[];
  qualifications: { field: "curriculum"; equals: string }[];
  status: "draft" | "preview" | "published";
  createdAt: string;
  sealedAt: string | null;
  commitment: string | null;
  chainReference: ChainReference | null;
  publication: {
    issuerAuthenticated: boolean;
    inclusionVerified: boolean;
    commitmentMatches: boolean;
    publishedAt: string;
  } | null;
}
export const examComponents: readonly Omit<
  ScoringComponent,
  "weightPercent" | "minimumPercent"
>[] = [
  {
    scoreId: "tgat",
    label: "TGAT",
    source: "demo-exam-provider",
    sourceComponentId: "TGAT",
    maximum: 100,
    transformation: "normalize-to-100",
  },
  ...[1, 2, 3, 4, 5].map((number) => ({
    scoreId: `tpat${number}`,
    label: `TPAT${number}`,
    source: "demo-exam-provider" as const,
    sourceComponentId: `TPAT${number}`,
    maximum: 100,
    transformation: "normalize-to-100" as const,
  })),
  ...[
    { scoreId: "math1", label: "Mathematics 1" },
    { scoreId: "physics", label: "Physics" },
    { scoreId: "english", label: "English" },
  ].map((subject) => ({
    ...subject,
    source: "demo-exam-provider" as const,
    sourceComponentId: `A-LEVEL-${subject.scoreId.toUpperCase()}`,
    maximum: 100,
    transformation: "normalize-to-100" as const,
  })),
  {
    scoreId: "gpax",
    label: "GPAX",
    source: "demo-school-record",
    sourceComponentId: "GPAX",
    maximum: 4,
    transformation: "normalize-to-100",
  },
];
export const validateRulebook = (rule: AdmissionRulebook): string[] => {
  const errors: string[] = [];
  if (
    !rule.id?.trim() ||
    !rule.programId?.trim() ||
    !rule.institutionId?.trim() ||
    !rule.programName?.trim() ||
    !rule.faculty?.trim() ||
    !rule.round?.trim()
  )
    errors.push("Complete the university, program, faculty and round.");
  if (
    !Number.isInteger(rule.academicYear) ||
    rule.academicYear < 2020 ||
    rule.academicYear > 2100
  )
    errors.push("Use an academic year from 2020 to 2100.");
  if (
    !Number.isInteger(rule.capacity) ||
    rule.capacity < 1 ||
    rule.capacity > 10000
  )
    errors.push("Capacity must be a whole number from 1 to 10,000.");
  if (!Number.isInteger(rule.version) || rule.version < 1)
    errors.push("A positive version number is required.");
  if (rule.method !== "normalized-weighted-sum")
    errors.push("This builder supports normalized weighted sums only.");
  if (
    !rule.components.length ||
    new Set(rule.components.map((c) => c.scoreId)).size !==
      rule.components.length
  )
    errors.push("Select at least one component, without duplicates.");
  if (
    rule.components.some(
      (c) =>
        !c.scoreId?.trim() ||
        !c.label?.trim() ||
        !c.sourceComponentId?.trim() ||
        !["demo-exam-provider", "demo-school-record"].includes(c.source) ||
        !Number.isFinite(c.maximum) ||
        c.maximum <= 0 ||
        c.transformation !== "normalize-to-100",
    )
  )
    errors.push(
      "Every component needs a source, ID, positive scale and supported transformation.",
    );
  if (
    rule.components.some(
      (c) =>
        !Number.isFinite(c.weightPercent) ||
        c.weightPercent <= 0 ||
        c.weightPercent > 100,
    ) ||
    Math.abs(rule.components.reduce((n, c) => n + c.weightPercent, 0) - 100) >
      0.000001
  )
    errors.push(
      "Scoring weights must total 100%, with each weight greater than zero.",
    );
  if (
    rule.components.some(
      (c) =>
        c.minimumPercent !== null &&
        (!Number.isFinite(c.minimumPercent) ||
          c.minimumPercent < 0 ||
          c.minimumPercent > 100),
    )
  )
    errors.push(
      "Minimum scores must be between 0 and 100% of the component scale.",
    );
  if (
    new Set(rule.requiredSubjects).size !== rule.requiredSubjects.length ||
    rule.requiredSubjects.some(
      (id) => !rule.components.some((c) => c.scoreId === id),
    )
  )
    errors.push(
      "Required subjects must be selected scoring components, without duplicates.",
    );
  if (
    rule.qualifications.some(
      (q) =>
        q.field !== "curriculum" ||
        !["Science–Mathematics", "Arts–Languages"].includes(q.equals),
    )
  )
    errors.push("Choose a valid curriculum requirement.");
  return errors;
};

/** Fixed property order and sorted set-like arrays; excludes publication receipts and UI state.
 * Includes every decision-bearing field. This is the versioned frontend protocol, not a deployed ABI. */
export const canonicalRulebook = (rule: AdmissionRulebook): string => {
  const errors = validateRulebook(rule);
  if (errors.length) throw new Error(errors.join(" "));
  return JSON.stringify({
    schema: "fairpass-rulebook-v1",
    id: rule.id,
    programId: rule.programId,
    institutionId: rule.institutionId,
    programName: rule.programName,
    faculty: rule.faculty,
    academicYear: rule.academicYear,
    round: rule.round,
    capacity: rule.capacity,
    version: rule.version,
    method: rule.method,
    components: [...rule.components]
      .sort((a, b) =>
        a.scoreId < b.scoreId ? -1 : a.scoreId > b.scoreId ? 1 : 0,
      )
      .map((c) => ({
        scoreId: c.scoreId,
        label: c.label,
        source: c.source,
        sourceComponentId: c.sourceComponentId,
        maximum: c.maximum,
        transformation: c.transformation,
        weightPercent: c.weightPercent,
        minimumPercent: c.minimumPercent,
      })),
    requiredSubjects: [...rule.requiredSubjects].sort(),
    qualifications: [...rule.qualifications]
      .sort((a, b) => (a.equals < b.equals ? -1 : a.equals > b.equals ? 1 : 0))
      .map((q) => ({ field: q.field, equals: q.equals })),
  });
};
export const rulebookCommitment = async (
  rule: AdmissionRulebook,
): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalRulebook(rule)),
  );
  return `0x${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
};
export const ruleIsOnChain = (rule: AdmissionRulebook) =>
  rule.status === "published" &&
  !!rule.commitment &&
  rule.chainReference?.chainId === 43113 &&
  !!rule.publication?.issuerAuthenticated &&
  rule.publication.inclusionVerified &&
  rule.publication.commitmentMatches;
export const evaluateRulebook = (
  rule: AdmissionRulebook,
  scores: readonly ScoreRecord[],
  qualifications: Record<string, string> = {},
) => {
  const errors = validateRulebook(rule);
  if (errors.length)
    return { status: "unavailable" as const, reason: errors[0] };
  for (const c of rule.components) {
    const matches = scores.filter((s) => s.id === c.scoreId);
    if (matches.length !== 1 || matches[0].maximum !== c.maximum)
      return {
        status: "unavailable" as const,
        reason: `Missing or invalid ${c.label} on the required ${c.maximum}-point scale.`,
      };
  }
  const calculation = calculateProgramScore(
    scores.map((s) => ({
      ...s,
      label: rule.components.find((c) => c.scoreId === s.id)?.label ?? s.label,
    })),
    rule.components,
  );
  if (calculation.status !== "calculated") return calculation;
  const eligible =
    rule.components.every(
      (c) =>
        c.minimumPercent === null ||
        (scores.find((s) => s.id === c.scoreId)!.score / c.maximum) * 100 >=
          c.minimumPercent,
    ) &&
    rule.requiredSubjects.every((id) => scores.some((s) => s.id === id)) &&
    rule.qualifications.every((q) => qualifications[q.field] === q.equals);
  return { ...calculation, eligible };
};
export const nextRuleVersion = (
  rules: readonly AdmissionRulebook[],
  programId: string,
) =>
  Math.max(
    0,
    ...rules.filter((r) => r.programId === programId).map((r) => r.version),
  ) + 1;
export const forkRulebook = (
  original: AdmissionRulebook,
  all: readonly AdmissionRulebook[],
  now: string,
): AdmissionRulebook => {
  const version = nextRuleVersion(all, original.programId);
  return {
    ...structuredClone(original),
    id: `${original.programId}-v${version}`,
    version,
    status: "draft",
    createdAt: now,
    sealedAt: null,
    commitment: null,
    chainReference: null,
    publication: null,
  };
};

/** Fictional student-proposing deferred acceptance. Each program ranks by its own
 * unrounded normalized score; ties use opaque applicant IDs in codepoint order.
 * No authentic TCAS algorithm, inputs, or independent fairness verification is claimed. */
export const allocatePreview = (
  rules: readonly AdmissionRulebook[],
  applicants: readonly PreviewApplicant[],
) => {
  if (
    new Set(rules.map((r) => r.programId)).size !== rules.length ||
    rules.some((r) => validateRulebook(r).length)
  )
    throw new Error("Use one valid rulebook per program.");
  if (
    new Set(applicants.map((a) => a.id)).size !== applicants.length ||
    applicants.some(
      (a) =>
        new Set(a.preferences).size !== a.preferences.length ||
        a.preferences.some((p) => !rules.some((r) => r.programId === p)),
    )
  )
    throw new Error(
      "Applicant IDs and preferences must be unique and refer to supplied programs.",
    );
  const queue = [...applicants];
  const next = new Map(applicants.map((a) => [a.id, 0]));
  const held = new Map<string, { id: string; score: number }[]>(
    rules.map((r) => [r.programId, []]),
  );
  while (queue.length) {
    const applicant = queue.shift()!;
    const index = next.get(applicant.id)!;
    if (index >= applicant.preferences.length) continue;
    const programId = applicant.preferences[index];
    next.set(applicant.id, index + 1);
    const rule = rules.find((r) => r.programId === programId)!;
    const evaluated = evaluateRulebook(
      rule,
      applicant.scores,
      applicant.qualifications,
    );
    if (evaluated.status !== "calculated" || !evaluated.eligible) {
      queue.push(applicant);
      continue;
    }
    const pool = [
      ...held.get(programId)!,
      { id: applicant.id, score: evaluated.rawTotal },
    ].sort(
      (a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    const rejected = pool.length > rule.capacity ? pool.pop() : undefined;
    held.set(programId, pool);
    if (rejected) queue.push(applicants.find((a) => a.id === rejected.id)!);
  }
  const assignments: Record<string, string | null> = Object.fromEntries(
    applicants.map((a) => [a.id, null]),
  );
  for (const [program, students] of held)
    for (const student of students) assignments[student.id] = program;
  return assignments;
};
