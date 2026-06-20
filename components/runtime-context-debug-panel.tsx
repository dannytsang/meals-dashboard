'use client';

import { DebugDataPanel } from './debug-data-panel';

type RuntimeContextPayload = {
  runtimeMode: string;
  blobCredentialsState: string;
  cookie: { state: string; value: string | null; effectiveDebugMode: boolean };
  runtime: { mode: string; blobConfigured: boolean; activeReader: string };
  user: { displayName: string; source: string };
  request: { path: string; origin: string; deploymentId: string | null; vercelEnv: string | null; region: string | null; fetchedAt: string };
};

export function RuntimeContextDebugPanel() {
  return (
    <DebugDataPanel<RuntimeContextPayload>
      title="Runtime Context"
      description="Shows the effective debug-cookie state, active reader, request provenance, and the authenticated-user display derivation source."
      endpoint="/api/debug/runtime-context"
      testId="runtime-context-debug-panel"
      rows={(data) => [
        { label: 'runtimeMode', value: data.runtimeMode },
        { label: 'blobCredentialsState', value: data.blobCredentialsState },
        { label: 'cookie.state', value: data.cookie.state },
        { label: 'cookie.value', value: data.cookie.value ?? 'null' },
        { label: 'cookie.effectiveDebugMode', value: String(data.cookie.effectiveDebugMode) },
        { label: 'runtime.mode', value: data.runtime.mode },
        { label: 'runtime.blobConfigured', value: String(data.runtime.blobConfigured) },
        { label: 'runtime.activeReader', value: data.runtime.activeReader },
        { label: 'user.displayName', value: data.user.displayName },
        { label: 'user.source', value: data.user.source },
        { label: 'request.path', value: data.request.path },
        { label: 'request.origin', value: data.request.origin || 'unset' },
        { label: 'request.deploymentId', value: data.request.deploymentId ?? 'unset' },
        { label: 'request.vercelEnv', value: data.request.vercelEnv ?? 'unset' },
        { label: 'request.region', value: data.request.region ?? 'unset' },
        { label: 'request.fetchedAt', value: data.request.fetchedAt },
      ]}
    />
  );
}
