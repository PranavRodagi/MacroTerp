// Placeholder branding from the onboarding prototype: sage circle with a white bowl + "NourishUMD".
export function Logo({ compact = false }: { compact?: boolean }) {
  const icon = compact ? 21 : 25;
  return (
    <div className={`logo ${compact ? "logo--compact" : ""}`}>
      <span className="logo-mark">
        <svg aria-hidden="true" fill="none" height={icon} viewBox="0 0 24 24" width={icon}>
          <path d="M6.2 5.5h11.6l-1.1 9.1a4.7 4.7 0 0 1-4.7 4.1 4.7 4.7 0 0 1-4.7-4.1L6.2 5.5Z" fill="white" />
          <path d="M9.2 5.5c.4-1.8 1.3-3 2.8-3.7 1.5.7 2.4 1.9 2.8 3.7" stroke="white" strokeLinecap="round" strokeWidth="1.5" />
        </svg>
      </span>
      <span className="logo-name">NourishUMD</span>
    </div>
  );
}
