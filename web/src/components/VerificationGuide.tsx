import { Icon, type IconName } from "./Icon";
const steps: { icon: IconName; title: string; description: string }[] = [
  { icon: "university", title: "Your university issues it.", description: "An authorized institution registers your confirmed admission." },
  { icon: "globe", title: "Avalanche records it.", description: "The network keeps a shared record of the token and its status." },
  { icon: "shield", title: "Anyone can check it.", description: "A verifier checks the issuer and current status against that record." },
];
export const VerificationGuide = ({ open = false }: { open?: boolean }) => (
  <details className="verification-guide" open={open || undefined}>
    <summary><span className="guide-summary-icon"><Icon name="globe" size={20} /></span><span>How verification works</span><Icon className="disclosure-chevron" name="down" size={18} /></summary>
    <ol className="guide-steps">{steps.map(step => <li key={step.title}><span className="guide-step-icon"><Icon name={step.icon} size={23} /></span><div><h3>{step.title}</h3><p>{step.description}</p></div></li>)}</ol>
    <p className="guide-note">This is the connected product flow. This preview uses fictional records and does not read Avalanche.</p>
  </details>
);
