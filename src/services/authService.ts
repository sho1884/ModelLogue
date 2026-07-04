// SR-136: front-end AI-availability probe.
//
// This is the INSURANCE layer only — bypassable, NOT the security boundary.
// The real boundary is server-side (SR-137): the auth gate rejects
// unauthenticated AI requests before any Gemini call. This probe just gives
// anonymous visitors a clean AI-free UI and avoids doomed calls.
//
// The switch is authenticated IDENTITY, never whether n8n is reachable. We
// ask a same-origin probe (/auth/whoami) that the reverse proxy answers from
// the gate identity: behind the auth gate (Cloudflare Access etc.) it reports
// the authenticated operator; with no gate / an anonymous visitor it reports
// not-authenticated. Fail-safe: any error, non-200, or non-JSON response
// counts as NOT available, so the chat stays hidden.
//
// Local dev: mock-AI mode implies availability so the chat works offline
// without a gate. Without mock, the probe returns not-authenticated, which is
// exactly the anonymous experience we want to be able to see locally.

import { isMockMode } from './mockAi';

interface WhoamiResponse {
  authenticated?: boolean;
}

export async function checkAiAvailability(): Promise<boolean> {
  if (isMockMode()) return true;
  try {
    const response = await fetch('/auth/whoami', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return false;
    const data = (await response.json()) as WhoamiResponse;
    return data.authenticated === true;
  } catch {
    return false;
  }
}
