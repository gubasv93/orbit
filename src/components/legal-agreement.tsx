import Link from 'next/link';
import type {ChangeEventHandler} from 'react';
import './legal-agreement.css';

export function LegalAgreement({checked, onChange, form, error, disabled = false}: {
  checked: boolean; onChange: ChangeEventHandler<HTMLInputElement>; form?: string; error?: string; disabled?: boolean;
}) {
  return <div className="legal-agreement">
    <label className="legal-agreement-label"><input id="acceptTerms" name="acceptTerms" type="checkbox" required checked={checked} onChange={onChange} form={form} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? 'legal-agreement-error' : undefined}/><span>I agree to the <Link href="/terms" target="_blank" rel="noopener noreferrer">Terms of Use</Link> and acknowledge the <Link href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>.</span></label>
    {error && <p id="legal-agreement-error" role="alert" className="field-error">{error}</p>}
  </div>;
}
