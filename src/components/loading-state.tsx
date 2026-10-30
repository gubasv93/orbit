import './loading-state.css';

type LoadingStateProps = {
  title?: string;
  description?: string;
  variant?: 'page' | 'panel';
};

/** A real indeterminate state: no invented percentage or simulated progress. */
export function LoadingState({
  title = 'Getting Orbit ready',
  description = 'A moment to bring everything into view.',
  variant = 'page',
}: LoadingStateProps) {
  return <section className={`orbit-loading orbit-loading-${variant}`} role="status" aria-live="polite" aria-busy="true" aria-label={title}>
    <div className="orbit-loading-card">
      <div className="orbit-loading-symbol" aria-hidden="true"><span className="orbit-loading-ring"/><span className="orbit-loading-center"/><span className="orbit-loading-moon"/></div>
      <p className="orbit-state-eyebrow">A little space to get ready</p>
      <h2>{title}</h2>
      <p className="orbit-loading-description">{description}</p>
      <div className="orbit-loading-preview" aria-hidden="true">
        <div className="orbit-loading-preview-top"><i/><i/><i/><span/></div>
        <div className="orbit-loading-preview-body"><div><i/><i/><i/></div><div className="orbit-loading-track"><span/><span/><span/></div></div>
      </div>
    </div>
  </section>;
}
