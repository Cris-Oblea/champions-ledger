/* A punctual trigger for the nightly refresh, from outside GitHub.
 *
 * WHY THIS EXISTS. GitHub delays scheduled workflows on shared runners when
 * the queue is busy and drops them when it is very busy. Measured on this
 * repository rather than assumed: one cron at 08:30 UTC fired at 12:16, 13:24
 * and 15:10 on three consecutive days - four to seven hours late every time.
 * The refresh asks three times a day now and a guard stops the duplicates, so
 * it is RELIABLE; nothing inside GitHub can make it PUNCTUAL.
 *
 * Cloudflare's cron triggers run on Cloudflare's own schedule, which is the
 * point: this fires at 08:07 UTC and asks GitHub to start the workflow by
 * `workflow_dispatch`, which is not queued the way a schedule is.
 *
 * IT DOES NOT REPLACE THE GITHUB SCHEDULE, it sits in front of it. If this
 * Worker is ever removed, mis-deployed or its credential revoked, the three
 * crons still fire and the refresh still happens - just later. Punctuality is
 * what this buys; reliability is already paid for. And because the workflow's
 * own guard asks "did a run already succeed today?", the two cannot double up.
 *
 * NOTHING HERE EXPIRES. It authenticates as the `champions-ledger-bot` GitHub
 * App - the same one the nightly already uses to open its pull request -
 * because an App's private key has no expiry date, while a fine-grained token
 * lasts a year at most. An unattended job that dies quietly in a year is the
 * failure this whole chain is built to avoid.
 */

const OWNER = "Cris-Oblea";
const REPO = "champions-ledger";
const WORKFLOW = "daily.yml";
const API = "https://api.github.com";
const UA = "champions-ledger-cron";

/* base64url, which is what a JWT is made of - not plain base64 */
function b64url(bytes) {
  let s = "";
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const b of a) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* The PEM's base64 body as bytes. The key must be PKCS#8 ("BEGIN PRIVATE
   KEY"); GitHub hands out PKCS#1 ("BEGIN RSA PRIVATE KEY"), which Web Crypto
   cannot import, so it is converted once with openssl when the secret is set -
   see cron/README.md. Doing that conversion here would mean writing DER by
   hand in a Worker, which is a fiddly thing to get wrong quietly. */
function pemBytes(pem) {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const raw = atob(body);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function appJwt(appId, pem) {
  const key = await crypto.subtle.importKey(
    "pkcs8", pemBytes(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  /* 60 seconds into the past: GitHub rejects a JWT whose `iat` is in the
     future, and the clocks are not the same clock. */
  const head = b64url(new TextEncoder().encode(
    JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const body = b64url(new TextEncoder().encode(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId })));
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head + "." + body));
  return head + "." + body + "." + b64url(sig);
}

async function gh(url, token, init) {
  const r = await fetch(url, {
    ...init,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "User-Agent": UA,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init && init.headers),
    },
  });
  return r;
}

/* The App is installed on the repository; this asks which installation that
   is rather than keeping its id as a fourth secret, so there is one less thing
   to be wrong after a reinstall. */
async function installationToken(env) {
  const jwt = await appJwt(env.GH_APP_ID, env.GH_APP_PRIVATE_KEY);
  const inst = await gh(
    `${API}/repos/${OWNER}/${REPO}/installation`, jwt);
  if (!inst.ok) throw new Error(`installation lookup ${inst.status}`);
  const id = (await inst.json()).id;
  const tok = await gh(`${API}/app/installations/${id}/access_tokens`, jwt,
                       { method: "POST" });
  if (!tok.ok) throw new Error(`installation token ${tok.status}`);
  return (await tok.json()).token;
}

async function trigger(env) {
  const token = await installationToken(env);
  const r = await gh(
    `${API}/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    token,
    { method: "POST", body: JSON.stringify({ ref: "main" }) });
  /* 204 is the success GitHub returns here, with no body. */
  if (r.status !== 204) {
    throw new Error(`dispatch ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  return "dispatched";
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(trigger(env).then(
      (m) => console.log(`[cron] ${m}`),
      /* Logged and swallowed. A throw here retries on Cloudflare's terms and
         could dispatch twice; the workflow's own guard would stop the second,
         but the three GitHub crons are the real safety net, so the honest
         thing is to say it failed and let them cover. */
      (e) => console.log(`[cron] FAILED: ${e.message}`)));
  },

  /* No public surface. The Worker exists for its schedule; anything reaching
     it over HTTP is not something it has an answer for. */
  async fetch() {
    return new Response("champions-ledger cron: nothing to see here\n",
                        { status: 404 });
  },
};
