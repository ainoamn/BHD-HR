import { DEFAULT_IDENTITY_ISSUER } from "@/lib/bhd/identity-public";

export const IDENTITY_RUNTIME_URL = `${DEFAULT_IDENTITY_ISSUER}/api/bhd/runtime`;
export const IDENTITY_SCRIPT_URL = `${DEFAULT_IDENTITY_ISSUER}/bhd-identity.js`;

/** Fallback if the identity host is unreachable — matches live runtime (40 days). */
export const SESSION_MAX_AGE_FALLBACK = 40 * 24 * 60 * 60;

export type BhdIdentityRuntime = {
  spec?: string;
  live?: boolean;
  issuer?: string;
  script?: string;
  session?: {
    maxAgeSec?: number;
    maxAgeDays?: number;
    idleTimeout?: boolean;
    cookieNames?: string[];
    windowTokenKey?: string;
    windowSignedOutKey?: string;
  };
};

let cache: { at: number; maxAgeSec: number; runtime: BhdIdentityRuntime } | null = null;
const CACHE_MS = 60_000;

/** Live session length from identity — do not hardcode 400/40 in the product. */
export async function identitySessionMaxAgeSec(): Promise<number> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.maxAgeSec;
  try {
    const response = await fetch(IDENTITY_RUNTIME_URL, { cache: "no-store", next: { revalidate: 60 } });
    if (!response.ok) throw new Error(`runtime ${response.status}`);
    const runtime = (await response.json()) as BhdIdentityRuntime;
    const maxAgeSec =
      typeof runtime.session?.maxAgeSec === "number" && runtime.session.maxAgeSec > 0
        ? Math.floor(runtime.session.maxAgeSec)
        : SESSION_MAX_AGE_FALLBACK;
    cache = { at: now, maxAgeSec, runtime };
    return maxAgeSec;
  } catch {
    if (cache) return cache.maxAgeSec;
    return SESSION_MAX_AGE_FALLBACK;
  }
}

export async function fetchIdentityRuntime(): Promise<BhdIdentityRuntime | null> {
  try {
    await identitySessionMaxAgeSec();
    return cache?.runtime ?? null;
  } catch {
    return null;
  }
}
