import { useId, useRef, useState } from "react";
import { Icon } from "./Icon";
export const ShareTokenButton = ({ credentialId, live = false }: { credentialId: string; live?:boolean }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [notice, setNotice] = useState("");
  const link = `${window.location.origin}/verify/${encodeURIComponent(credentialId)}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setNotice(live ? "Link copied." : "Demo link copied."); }
    catch { setNotice("Select the link above and copy it manually."); }
  };
  return <>
    <button className="button button-quiet" type="button" onClick={() => { setNotice(""); dialog.current?.showModal(); }}><Icon name="share" size={18} />Share</button>
    <dialog ref={dialog} className="share-dialog" aria-labelledby={titleId}>
      <form method="dialog" className="dialog-close"><button className="close-button" aria-label="Close sharing dialog">×</button></form>
      <span className="dialog-symbol"><Icon name="share" size={28} /></span><h2 id={titleId}>Let someone check your token.</h2><p>The link shows the admission record, without a student name or exam scores.</p>
      <label className="field-label" htmlFor={`${titleId}-link`}>{live ? "Verification link" : "Demo verification link"}</label><input id={`${titleId}-link`} value={link} readOnly onFocus={event => event.currentTarget.select()} />
      <button className="button button-primary full-width" type="button" onClick={() => void copy()}><Icon name="file" size={18} />{live ? "Copy link" : "Copy demo link"}</button><p className="copy-status" role="status">{notice}</p><p className="fine-print">{live ? "A link checks the record, not the identity of the person sharing it." : "This local link works only while the preview is running. A link verifies a record, not the identity of the person sharing it."}</p>
    </dialog>
  </>;
};
