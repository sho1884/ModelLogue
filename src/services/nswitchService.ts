// Client for the modellogue-nswitch HTTP API (SR-103).
// Spec: tools/nswitch/Requirements_Specification.md §9.2.

import type {
  NswitchApiErrorBody,
  NswitchGenerateOptions,
  NswitchGenerationResult,
} from '../types/testCase';

const DEFAULT_BASE_URL = 'http://localhost:8090';

function baseUrl(): string {
  const injected =
    typeof import.meta !== 'undefined'
      ? (import.meta as unknown as { env?: Record<string, string> }).env?.[
          'VITE_NSWITCH_BASE_URL'
        ]
      : undefined;
  return injected || DEFAULT_BASE_URL;
}

/**
 * Error thrown for any non-2xx response, network failure, or body-parse
 * failure. `kind` classifies the failure so the UI can render an
 * appropriate in-place hint without parsing message strings.
 */
export class NswitchError extends Error {
  readonly kind:
    | 'network'
    | 'parse_error'
    | 'invalid_request'
    | 'unsatisfiable'
    | 'internal_error'
    | 'unknown';
  readonly status: number | null;
  readonly probedUrl: string;

  constructor(params: {
    message: string;
    kind: NswitchError['kind'];
    status: number | null;
    probedUrl: string;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = 'NswitchError';
    this.kind = params.kind;
    this.status = params.status;
    this.probedUrl = params.probedUrl;
    if (params.cause !== undefined) {
      (this as { cause?: unknown }).cause = params.cause;
    }
  }
}

export async function generate(
  source: string,
  options: NswitchGenerateOptions = {}
): Promise<NswitchGenerationResult> {
  const url = `${baseUrl()}/generate`;
  const body = {
    source,
    n: options.n ?? 1,
    format: options.format,
    layered: options.layered ?? true,
    max_cycle_unroll: options.max_cycle_unroll ?? 3,
    require_final: options.require_final ?? false,
  };
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (e) {
    if ((e as { name?: string }).name === 'AbortError') throw e;
    throw new NswitchError({
      message: `Test case service unreachable at ${url}`,
      kind: 'network',
      status: null,
      probedUrl: url,
      cause: e,
    });
  }

  if (resp.ok) {
    try {
      return (await resp.json()) as NswitchGenerationResult;
    } catch (e) {
      throw new NswitchError({
        message: 'Response body was not valid JSON',
        kind: 'internal_error',
        status: resp.status,
        probedUrl: url,
        cause: e,
      });
    }
  }

  // Map documented API error shape onto NswitchError.
  let errBody: NswitchApiErrorBody | null = null;
  try {
    errBody = (await resp.json()) as NswitchApiErrorBody;
  } catch {
    // fall through; we'll use the status line
  }
  const errType = errBody?.error?.type ?? 'unknown';
  const errMessage =
    errBody?.error?.message ?? `HTTP ${resp.status} ${resp.statusText}`;
  throw new NswitchError({
    message: errMessage,
    kind:
      errType === 'parse_error' ||
      errType === 'invalid_request' ||
      errType === 'unsatisfiable' ||
      errType === 'internal_error'
        ? errType
        : 'unknown',
    status: resp.status,
    probedUrl: url,
  });
}

export async function checkHealth(
  signal?: AbortSignal
): Promise<{ status: string; version: string }> {
  const url = `${baseUrl()}/health`;
  const resp = await fetch(url, { signal });
  if (!resp.ok) {
    throw new NswitchError({
      message: `Health check failed: HTTP ${resp.status}`,
      kind: 'network',
      status: resp.status,
      probedUrl: url,
    });
  }
  return (await resp.json()) as { status: string; version: string };
}

export function getBaseUrl(): string {
  return baseUrl();
}
