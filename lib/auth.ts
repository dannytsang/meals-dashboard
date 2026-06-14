import type { NextAuthOptions } from 'next-auth';
import AuthentikProvider from 'next-auth/providers/authentik';

const REQUIRED_AUTH_ENV = [
  'AUTHENTIK_CLIENT_ID',
  'AUTHENTIK_CLIENT_SECRET',
  'AUTHENTIK_ISSUER',
  'NEXTAUTH_SECRET',
] as const;

function configuredEnv(name: string): string {
  return process.env[name] || `missing-${name.toLowerCase().replaceAll('_', '-')}`;
}

export function getMissingAuthEnvironment(): string[] {
  return REQUIRED_AUTH_ENV.filter(name => !process.env[name]);
}

export function assertAuthConfigured(): void {
  const missing = getMissingAuthEnvironment();
  if (missing.length > 0) {
    throw new Error(`Missing required auth environment variable(s): ${missing.join(', ')}`);
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    AuthentikProvider({
      clientId: configuredEnv('AUTHENTIK_CLIENT_ID'),
      clientSecret: configuredEnv('AUTHENTIK_CLIENT_SECRET'),
      issuer: configuredEnv('AUTHENTIK_ISSUER'),
    }),
  ],
  secret: configuredEnv('NEXTAUTH_SECRET'),
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/auth/signin',
  },
};
