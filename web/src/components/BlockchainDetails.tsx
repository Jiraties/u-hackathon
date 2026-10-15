import type { PublicCredential } from "../domain/models";
import { Icon } from "./Icon";
export const BlockchainDetails = ({ credential }: { credential?: PublicCredential }) => (
  <details className="blockchain-details"><summary>View blockchain details <Icon className="disclosure-chevron" name="down" size={16} /></summary>
    <dl className="detail-list"><div><dt>Intended network</dt><dd>Avalanche Fuji testnet</dd></div><div><dt>Data source</dt><dd>{credential?.source === "fixture" || !credential ? "Fictional demo record" : credential.source}</dd></div><div><dt>Contract</dt><dd className="technical-value">{credential?.chainReference?.contractAddress ?? "Not connected"}</dd></div><div><dt>Transaction</dt><dd className="technical-value">{credential?.chainReference?.transactionHash ?? "Not available"}</dd></div><div><dt>Issuer authorization</dt><dd>Not checked in this preview</dd></div></dl>
  </details>
);
