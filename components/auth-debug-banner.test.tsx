import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthDebugBanner } from './auth-debug-banner';

describe('AuthDebugBanner', () => {
  it('shows the Authentik issuer value for deployment smoke testing', () => {
    render(<AuthDebugBanner issuer="https://auth.example.test/application/o/meals-dashboard/" />);

    expect(screen.getByText('OIDC debug')).toBeTruthy();
    expect(screen.getByText('AUTHENTIK_ISSUER')).toBeTruthy();
    expect(screen.getByText('https://auth.example.test/application/o/meals-dashboard/')).toBeTruthy();
  });

  it('shows a not configured state when AUTHENTIK_ISSUER is unavailable', () => {
    render(<AuthDebugBanner issuer={undefined} />);

    expect(screen.getByText('AUTHENTIK_ISSUER')).toBeTruthy();
    expect(screen.getByText('not configured')).toBeTruthy();
  });
});
