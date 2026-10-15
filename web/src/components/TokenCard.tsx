import type { Institution, Program, PublicCredential } from "../domain/models";
import { Icon } from "./Icon";

const statusLabels = { active: "Active", withdrawn: "Withdrawn", revoked: "Revoked" } as const;

export const TokenCard = ({ credential, institution, program, compact = false }: {
  credential: PublicCredential; institution: Institution; program: Program; compact?: boolean;
}) => (
  <article className={`token-card${compact ? " token-card-compact" : ""}`} aria-label={`${institution.name} admission token, sample record`}>
    <div className="token-top"><span className="token-issuer-mark">{institution.abbreviation}</span><div><span className="token-caption">Issued by</span><h3>{institution.name}</h3></div><Icon name="graduation" size={28} /></div>
    <div className="token-main"><span className="token-type">Admission token</span><h2>{program.name}</h2><p>{program.degree}</p><div className="token-meta"><div><span>Academic year</span><strong>{program.academicYear}</strong></div><div><span>Current status</span><strong><i className={`token-status-dot ${credential.status}`} />{statusLabels[credential.status]}</strong></div></div></div>
    <div className="token-bottom"><div><span className="token-caption">Token ID</span><strong>{credential.id}</strong></div><span className="token-sample">Demo token</span></div>
    <div className="token-network"><Icon name="globe" size={16} /><span>Avalanche Fuji</span><span className="network-notice">Not verified on-chain</span></div>
  </article>
);
