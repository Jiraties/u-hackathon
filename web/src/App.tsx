import { useRuleWorkspace } from "./services/ruleWorkspace";
import { Notice } from "./components/ui";
import { Layout, type PageId } from "./components/Layout";
import { demoData } from "./data/demo";
import WalletPage from "./pages/WalletPage";
import UniversityPage from "./pages/UniversityPage";
import TransparencyPage from "./pages/TransparencyPage";
import VerificationPage from "./pages/VerificationPage";

// Local presentation interactions only. No API requests, wallet providers, contract reads, or writes.
// Vite serves index.html for direct route visits; configure the same SPA fallback on hosting later.
const App = () => {
  const controller = useRuleWorkspace(demoData.rulebooks);
  const requestedRun = new URLSearchParams(window.location.search).get("run");
  const run = controller.workspace.runs.find(item=>item.id === requestedRun);
  const wallets = demoData.demoWallets.map(wallet => wallet.admission.status === "not_admitted" && run && !run.studentAdmitted ? {
    ...wallet, admission: { ...wallet.admission, result: { ...wallet.admission.result, rankedPrograms:run.choices,
      attestation:{ ...wallet.admission.result.attestation, id:`LOCAL-${run.id.slice(0,8)}`, previewRunId:run.id, reportedOn:new Date(run.createdAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}) } } }
  } : wallet);
  const data = { ...demoData,rulebooks:controller.workspace.rulebooks,demoWallets:wallets };
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  let page: PageId = "wallet";
  let content = <WalletPage data={data} />;
  if (path === "/university") { page = "university"; content = <UniversityPage data={data} controller={controller} />; }
  else if (path === "/transparency") { page = "transparency"; content = <TransparencyPage data={data} />; }
  else if (path === "/verify" || path.startsWith("/verify/")) {
    page = "verify";
    content = <VerificationPage data={data} credentialId={path === "/verify" ? undefined : path.slice("/verify/".length)} />;
  } else if (path !== "/" && path !== "/student/wallet") {
    content = <section className="panel empty-state"><h1>Page not found</h1><p>This page isn’t part of the frontend preview.</p><a className="button button-primary" href="/student/wallet">Back to My Wallet</a></section>;
  }
  return <Layout page={page}>{page === "wallet" && requestedRun && (!run || run.studentAdmitted) ? <Notice>This local non-admitted result is unavailable. Showing the original seeded wallet.</Notice> : null}{content}</Layout>;
};
export default App;
