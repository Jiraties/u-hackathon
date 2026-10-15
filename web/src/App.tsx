import { Layout, type PageId } from "./components/Layout";
import { demoData } from "./data/demo";
import WalletPage from "./pages/WalletPage";
import UniversityPage from "./pages/UniversityPage";
import TransparencyPage from "./pages/TransparencyPage";
import VerificationPage from "./pages/VerificationPage";

// Local presentation interactions only. No API requests, wallet providers, contract reads, or writes.
// Vite serves index.html for direct route visits; configure the same SPA fallback on hosting later.
const App = () => {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  let page: PageId = "wallet";
  let content = <WalletPage data={demoData} />;
  if (path === "/university") { page = "university"; content = <UniversityPage data={demoData} />; }
  else if (path === "/transparency") { page = "transparency"; content = <TransparencyPage data={demoData} />; }
  else if (path === "/verify" || path.startsWith("/verify/")) {
    page = "verify";
    content = <VerificationPage data={demoData} credentialId={path === "/verify" ? undefined : path.slice("/verify/".length)} />;
  } else if (path !== "/" && path !== "/student/wallet") {
    content = <section className="panel empty-state"><h1>Page not found</h1><p>This page isn’t part of the frontend preview.</p><a className="button button-primary" href="/student/wallet">Back to My Wallet</a></section>;
  }
  return <Layout page={page}>{content}</Layout>;
};
export default App;
