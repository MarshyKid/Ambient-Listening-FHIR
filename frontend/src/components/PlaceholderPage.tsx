interface PlaceholderPageProps {
  eyebrow: string;
  title: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function PlaceholderPage({ eyebrow, title, text, actionLabel, onAction }: PlaceholderPageProps) {
  return (
    <section className="placeholder-page">
      <div className="pagehead">
        <div>
          <p className="page-label">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
        {actionLabel && onAction && (
          <button className="primary-button" type="button" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>

      <div className="card placeholder-card">
        <p>{text}</p>
      </div>

      <p className="app-footnote">Demo environment - synthetic patients only - no real PHI</p>
    </section>
  );
}
