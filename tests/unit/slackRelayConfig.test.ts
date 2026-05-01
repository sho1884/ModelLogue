// SR-135 — Slack relay config helper.
//
// Verifies the env-var → SlackRelayConfig|null mapping rules:
//   - missing / empty / whitespace → null  (relay disabled)
//   - non-empty                    → { baseUrl }, with trailing
//                                    slashes stripped so callers
//                                    can append paths cleanly.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getSlackRelayConfig,
  isSlackRelayEnabled,
} from '../../src/services/slackRelay';

const KEY = 'VITE_SLACK_RELAY_BASE_URL';

let original: string | undefined;

beforeEach(() => {
  original = process.env[KEY];
  delete process.env[KEY];
});

afterEach(() => {
  if (original === undefined) delete process.env[KEY];
  else process.env[KEY] = original;
});

describe('getSlackRelayConfig', () => {
  it('returns null when the env var is missing', () => {
    expect(getSlackRelayConfig()).toBeNull();
    expect(isSlackRelayEnabled()).toBe(false);
  });

  it('returns null when the env var is an empty string', () => {
    process.env[KEY] = '';
    expect(getSlackRelayConfig()).toBeNull();
    expect(isSlackRelayEnabled()).toBe(false);
  });

  it('returns null when the env var is whitespace only', () => {
    process.env[KEY] = '   ';
    expect(getSlackRelayConfig()).toBeNull();
  });

  it('returns the base URL when set', () => {
    process.env[KEY] = 'http://localhost:5678';
    expect(getSlackRelayConfig()).toEqual({
      baseUrl: 'http://localhost:5678',
    });
    expect(isSlackRelayEnabled()).toBe(true);
  });

  it('strips trailing slashes', () => {
    process.env[KEY] = 'http://localhost:5678///';
    expect(getSlackRelayConfig()).toEqual({
      baseUrl: 'http://localhost:5678',
    });
  });

  it('trims surrounding whitespace before evaluating', () => {
    process.env[KEY] = '  http://localhost:5678/  ';
    expect(getSlackRelayConfig()).toEqual({
      baseUrl: 'http://localhost:5678',
    });
  });
});
