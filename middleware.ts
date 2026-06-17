import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/auth/signin',
  },
});

export const config = {
  // Spec 022 / NFR-005: the OIDC gate must cover the /debug page and
  // /api/debug/* routes. Debug mode does not bypass auth.
  matcher: ['/', '/debug', '/api/dashboard/:path*', '/api/debug/:path*'],
};
