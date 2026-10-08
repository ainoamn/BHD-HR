import { createHash, randomBytes } from "crypto";
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from "jose";
import { DEFAULT_IDENTITY_ISSUER } from "./identity-public";

export const OAUTH_STATE_COOKIE = "bhd_oauth_state";

export type IdentityConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type OAuthState = {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
};

export type IdentityProfile = {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
};

export function identityIssuer() {
  return (process.env.BHD_IDENTITY_ISSUER?.trim() || DEFAULT_IDENTITY_ISSUER).replace(/\/$/, "");
}

export function isSsoConfigured() {
  return Boolean(process.env.BHD_OAUTH_CLIENT_ID?.trim());
}

export function identityConfig(requestOrigin: string): IdentityConfig {
  return {
    issuer: identityIssuer(),
    clientId: process.env.BHD_OAUTH_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.BHD_OAUTH_CLIENT_SECRET?.trim() ?? "",
    redirectUri: process.env.BHD_OAUTH_REDIRECT_URI?.trim() || `${requestOrigin}/api/auth/bhd/callback`,
  };
}

export function randomUrlToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function isSafeReturnPath(value: string | null | undefined): value is string {
  if (!value || !value.startsWith("/")) return false;
  if (value.startsWith("//") || value.includes("\\") || value.includes("://")) return false;
  return true;
}

export function safeReturnPath(value: string | null | undefined, fallback = "/") {
  return isSafeReturnPath(value) ? value : fallback;
}

export function oauthStateCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 5 * 60,
  };
}

export function encodeOAuthState(value: OAuthState) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeOAuthState(raw: string | undefined): OAuthState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<OAuthState>;
    if (!parsed.state || !parsed.nonce || !parsed.verifier) return null;
    return { state: parsed.state, nonce: parsed.nonce, verifier: parsed.verifier, returnTo: safeReturnPath(parsed.returnTo) };
  } catch {
    return null;
  }
}

export function authorizeUrl(config: IdentityConfig, oauth: OAuthState) {
  const url = new URL(`${config.issuer}/oauth/authorize`);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state: oauth.state,
    nonce: oauth.nonce,
    code_challenge: pkceChallenge(oauth.verifier),
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export function endSessionUrl(requestOrigin: string) {
  const issuer = identityIssuer();
  const clientId = process.env.BHD_OAUTH_CLIENT_ID?.trim() ?? "";
  const url = new URL(`${issuer}/oauth/end-session`);
  url.search = new URLSearchParams({ client_id: clientId, post_logout_redirect_uri: `${requestOrigin}/` }).toString();
  return url.toString();
}

type TokenResponse = { id_token?: string; access_token?: string; error?: string };

export async function exchangeCode(config: IdentityConfig, code: string, verifier: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    code_verifier: verifier,
  });
  if (config.clientSecret) body.set("client_secret", config.clientSecret);
  const response = await fetch(`${config.issuer}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    cache: "no-store",
  });
  const json = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !json.id_token) throw new Error(json.error || `token_${response.status}`);
  return { idToken: json.id_token, accessToken: json.access_token ?? "" };
}

function checkClaims(payload: JWTPayload, config: IdentityConfig, nonce: string) {
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== config.issuer) throw new Error("iss");
  if (!audience.includes(config.clientId)) throw new Error("aud");
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error("exp");
  if (payload.nonce !== nonce) throw new Error("nonce");
}

async function verifiedPayload(config: IdentityConfig, idToken: string, accessToken: string) {
  const options = { issuer: config.issuer, audience: config.clientId };
  try {
    const jwks = createRemoteJWKSet(new URL(`${config.issuer}/oauth/jwks.json`));
    return (await jwtVerify(idToken, jwks, { ...options, algorithms: ["RS256"] })).payload;
  } catch {
    /* fall through to the documented fallbacks */
  }
  const shared = process.env.BHD_IDENTITY_TOKEN_SECRET?.trim();
  if (shared) {
    try {
      return (await jwtVerify(idToken, new TextEncoder().encode(shared), { ...options, algorithms: ["HS256"] })).payload;
    } catch {
      /* fall through to userinfo */
    }
  }
  if (!accessToken) throw new Error("id_token");
  const claims = decodeJwt(idToken);
  const response = await fetch(`${config.issuer}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`userinfo_${response.status}`);
  const info = (await response.json()) as JWTPayload;
  if (!info.sub || info.sub !== claims.sub) throw new Error("userinfo_sub");
  return { ...claims, ...info, iss: claims.iss, aud: claims.aud, exp: claims.exp, nonce: claims.nonce };
}

export async function verifyIdentity(config: IdentityConfig, idToken: string, accessToken: string, nonce: string): Promise<IdentityProfile> {
  const payload = await verifiedPayload(config, idToken, accessToken);
  checkClaims(payload, config, nonce);
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!payload.sub || !email) throw new Error("claims");
  if (payload.email_verified !== true) throw new Error("email_verified");
  const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : email.split("@")[0];
  const picture = typeof payload.picture === "string" && payload.picture.startsWith("https://") ? payload.picture : null;
  return { sub: payload.sub, email, name, picture };
}
