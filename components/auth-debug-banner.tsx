interface AuthDebugBannerProps {
  issuer?: string;
}

export function AuthDebugBanner({ issuer }: AuthDebugBannerProps) {
  const displayedIssuer = issuer?.trim() ? issuer : 'not configured';

  return (
    <section
      aria-label="OIDC debug"
      style={{
        margin: '16px auto 0',
        maxWidth: '1200px',
        border: '1px solid rgba(99, 102, 241, 0.35)',
        borderRadius: '12px',
        padding: '12px 16px',
        background: 'rgba(30, 41, 59, 0.72)',
        color: '#e2e8f0',
        fontSize: '14px',
      }}
    >
      <strong style={{ marginRight: '12px', color: '#c4b5fd' }}>OIDC debug</strong>
      <span style={{ color: '#94a3b8', marginRight: '8px' }}>AUTHENTIK_ISSUER</span>
      <code style={{ overflowWrap: 'anywhere' }}>{displayedIssuer}</code>
    </section>
  );
}
