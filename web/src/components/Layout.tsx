import type { ReactNode } from "react";
import { Icon } from "./Icon";
export type PageId = "wallet" | "university" | "transparency" | "verify";
const navigation: { id: PageId; label: string; href: string }[] = [
  { id: "wallet", label: "My wallet", href: "/student/wallet" },
  { id: "verify", label: "Verify a token", href: "/verify" },
  { id: "transparency", label: "Transparency", href: "/transparency" },
];
export const Layout = ({ page, children, live = false }: { page: PageId; children: ReactNode; live?:boolean }) => (
  <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className={`site-header${page === "wallet" ? " wallet-header" : ""}`}>
      <a className="wordmark" href="/student/wallet" aria-label="FairPass home"><span className="brand-symbol"><Icon name="graduation" size={27} /></span>FairPass<span className="brand-period">.</span></a>
      <nav className="primary-nav" aria-label="Primary navigation">{navigation.map(item => <a key={item.id} className={`nav-link${page === item.id ? " active" : ""}`} aria-current={page === item.id ? "page" : undefined} href={live?item.href:item.href+"?preview=1"}>{item.label}</a>)}</nav>
      <div className="header-end">{page === "wallet" ? <a className="mytcas-header-link" href="https://www.mytcas.com/">Back to myTCAS <Icon name="external" size={14} /></a> : null}<a className={`institution-link${page === "university" ? " active" : ""}`} href={live?"/university":"/university?preview=1"} aria-current={page === "university" ? "page" : undefined}>For universities <Icon name="arrow" size={16} /></a><span className="preview-pill"><span />{live?"Live mode":"Preview"}</span></div>
    </header>
    <main id="main-content" tabIndex={-1}>{children}</main>
    <footer id="prototype-note"><a href="/student/wallet" className="footer-brand">FairPass.</a><span>University-issued. Independently checkable.</span><p>{live?"Fictional admissions · Chain evidence where available · No university affiliation or official TCAS integration.":"Fictional records · No university affiliation, TCAS integration, or live blockchain verification."}</p></footer>
  </>
);
