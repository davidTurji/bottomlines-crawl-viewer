import { useEffect, useId, useRef, useState } from "react";
import { ReportButton } from "./ReportButton";
import { ReportDisclosure } from "./ReportDisclosure";
import { checkSellerDraft, type SellerDraft } from "@/lib/sellerDraft";
import { SELLER_TYPES, type FillField, type SellerRow } from "@/lib/sellersFix";
import { cn } from "@/lib/utils";

/** A draft stays local until the last step is explicitly saved. */
export function SellerSetup({ row, draft, check, step, onStep, onEdit, onNoWebsite, onSave, onSkip, inputClassName, roleGuide }: {
  row: SellerRow;
  draft?: SellerDraft;
  check: ReturnType<typeof checkSellerDraft>;
  step: number;
  onStep: (step: number) => void;
  onEdit: (field: FillField, value: string) => void;
  onNoWebsite: (value: boolean) => void;
  onSave: () => void;
  onSkip: () => void;
  inputClassName: string;
  roleGuide: string;
}) {
  const [attempted, setAttempted] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  const fields = check.fields;
  const index = Math.min(step, fields.length - 1);
  const field = fields[index];
  const last = index === fields.length - 1;
  const error = attempted ? check.errors[field] : undefined;
  const label = field === "name" ? "Seller name" : field === "domain" ? "Domain" : "Account role";
  const value = field === "domain" && draft?.noWebsite ? "" : draft?.[field] ?? String(row.suggested?.[field] ?? "");
  const move = (next: number) => { setAttempted(false); onStep(next); };
  useEffect(() => {
    const frame = requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('input:not(:disabled), select')?.focus({preventScroll:true}));
    return () => cancelAnimationFrame(frame);
  }, [field]);

  return <form ref={form} className="max-w-lg" noValidate aria-label={`Details for seller ${row.seller_id}`} onSubmit={event => {
    event.preventDefault();
    if (check.errors[field]) {
      setAttempted(true);
      form.current?.querySelector<HTMLElement>(`[data-seller-field="${field}"]`)?.focus();
    } else if (!last) move(index + 1);
    else if (check.ready) onSave();
    else {
      const firstError = fields.findIndex(key => check.errors[key]);
      if (firstError >= 0) onStep(firstError);
      setAttempted(true);
    }
  }}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <label htmlFor={`${id}-${field}`} className="text-[13px] font-semibold text-slate-900">{label}</label>
      <span className="text-[11px] tabular-nums text-slate-500" aria-label={`Step ${index + 1} of ${fields.length}`}>{index + 1} of {fields.length}</span>
    </div>
    <div key={field} className="seller-setup-step min-h-[80px] max-w-lg">
      {field === "seller_type" ? <select id={`${id}-${field}`} data-seller-field={field}
        aria-label={`Account role for seller ${row.seller_id}`} aria-required="true" aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined} value={value} onChange={event => onEdit(field, event.target.value)}
        className={cn(inputClassName, "h-10 text-[13px]", error && "border-critical")}>
        <option value="" disabled>Choose a role</option>
        {SELLER_TYPES.map(role => <option key={role} value={role}>{role === "PUBLISHER" ? "Publisher" : role === "INTERMEDIARY" ? "Intermediary" : "Both"}</option>)}
      </select> : <input id={`${id}-${field}`} data-seller-field={field}
        aria-label={`${label} for seller ${row.seller_id}`} aria-required={Number(row.suggested?.is_confidential ?? 0) !== 1 && (field === "name" || !draft?.noWebsite)}
        aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
        disabled={field === "domain" && Boolean(draft?.noWebsite)} value={value}
        onChange={event => onEdit(field, event.target.value)} placeholder={field === "name" ? "Seller or company name" : "example.com"}
        inputMode={field === "domain" ? "url" : "text"} autoCapitalize={field === "domain" ? "none" : "words"} spellCheck={field !== "domain"}
        className={cn(inputClassName, "h-10 text-[13px]", error && "border-critical")} />}
      {field === "domain" && <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={Boolean(draft?.noWebsite)} onChange={event => onNoWebsite(event.target.checked)}
          aria-label={`No website for seller ${row.seller_id}`} className="h-4 w-4 rounded border-border accent-primary" />No website
      </label>}
      {error && <p id={`${id}-error`} role="alert" className="mt-2 text-xs text-critical">{error}</p>}
      {field === "seller_type" && <ReportDisclosure summary="About account roles" triggerClassName="py-2 text-[11px] text-slate-500">
        <p className="pb-2 text-[11px] leading-relaxed text-slate-500">{roleGuide}</p>
      </ReportDisclosure>}
      {attempted && check.other.map(message => <p key={message} role="alert" className="mt-2 text-xs text-critical">{message}</p>)}
    </div>
    <div className="mt-3 flex items-center gap-2">
      {index > 0 && <ReportButton variant="outline" size="sm" onClick={() => move(index - 1)}>Back</ReportButton>}
      <ReportButton type="submit" size="sm">{last ? "Save" : "Next"}</ReportButton>
      <ReportButton variant="outline" size="sm" onClick={onSkip}>Skip</ReportButton>
    </div>
  </form>;
}
