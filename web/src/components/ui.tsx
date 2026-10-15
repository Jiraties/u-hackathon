import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
export const Badge = ({ children, tone = "neutral" }: { children: ReactNode; tone?: "blue" | "green" | "amber" | "neutral" }) => <span className={`badge badge-${tone}`}>{children}</span>;
export const PreviewButton = ({ children, icon, variant = "primary" }: { children: ReactNode; icon?: IconName; variant?: "primary" | "secondary" | "text" }) => <button type="button" className={`button button-${variant}`} disabled title="Requires a connected backend and authorized issuer">{icon ? <Icon name={icon} size={18} /> : null}{children}</button>;
export const PageHeading = ({ title, description, children }: { title: string; description: string; children?: ReactNode }) => <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{children}</div>;
export const SectionHeading = ({ title, description, children }: { title: string; description?: string; children?: ReactNode }) => <div className="section-heading"><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{children}</div>;
export const Notice = ({ children, icon = "info" }: { children: ReactNode; icon?: IconName }) => <div className="notice"><Icon name={icon} size={18} /><p>{children}</p></div>;
