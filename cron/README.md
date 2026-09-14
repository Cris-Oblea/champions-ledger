# The cron Worker

A punctual trigger for the nightly refresh, running on Cloudflare instead of
inside GitHub.

## Why

GitHub delays scheduled workflows on shared runners when the queue is busy, and
drops them when it is very busy. Measured on this repository, not assumed:

| workflow | cron | actually ran | late by |
|---|---|---|---|
| daily refresh | 08:30 UTC | 12:16 / 13:24 / 15:10 | 3h46 – 6h40 |
| back the ledger up | 07:00 UTC | 13:30 | 6h30 |

Both sat on `:00` and `:30`, the two most contended minutes there are. The
refresh asks three times a day now and a guard stops the duplicates, so it is
**reliable**. Nothing inside GitHub can make it **punctual**.

This Worker fires on Cloudflare's own schedule and asks GitHub to start the
workflow by `workflow_dispatch`, which is not queued the way a schedule is.

**It does not replace the GitHub schedule, it sits in front of it.** Remove this
Worker, mis-deploy it or revoke its credential and the three crons still fire —
the refresh just happens later. Punctuality is what this buys; reliability is
already paid for. And because the workflow asks "did a run already succeed
today?", the two cannot double up.

**Nothing here expires.** It authenticates as the `champions-ledger-bot` GitHub
App — the same one the nightly already uses to open its pull request — because
an App's private key has no expiry date, while a fine-grained token lasts a year
at most. An unattended job that dies quietly in a year is the failure this whole
chain is built to avoid.

## Setting it up — once

Everything below runs from `cron/`. `npx wrangler` is already logged in.

**0. Let the App start workflows.** It was created to open pull requests, so
it has Contents and Pull requests. Dispatching a workflow needs one more:
**Settings → Developer settings → GitHub Apps → champions-ledger-bot →
Permissions & events → Repository permissions → Actions: Read and write**, then
**Install App → the repository → Review and accept** the new permission. Without
it step 4 fails with `403`, and nothing else gives that away.

**1. Convert the App's private key.** GitHub hands out PKCS#1
(`-----BEGIN RSA PRIVATE KEY-----`); the Web Crypto API in a Worker can only
import PKCS#8 (`-----BEGIN PRIVATE KEY-----`). One command, and Git Bash ships
`openssl`:

```bash
openssl pkcs8 -topk8 -nocrypt \
  -in ~/Downloads/champions-ledger-bot.<date>.private-key.pem \
  -out ~/champions-ledger-bot.pkcs8.pem
head -1 ~/champions-ledger-bot.pkcs8.pem     # must say BEGIN PRIVATE KEY
```

If the `.pem` is not on this machine any more, GitHub will not show the old one
again — generate a fresh key at **Settings → Developer settings → GitHub Apps →
champions-ledger-bot → Private keys → Generate a private key**. The old key
keeps working; delete it there once this is running.

**2. Publish the Worker.**

```bash
cd cron
npx wrangler deploy
```

**3. Give it the two secrets.** Each command prompts and the value never
touches the repo or the terminal history:

```bash
npx wrangler secret put GH_APP_ID
#   paste the App ID from the App's settings page (a number)

npx wrangler secret put GH_APP_PRIVATE_KEY
#   paste the WHOLE pkcs8 file, BEGIN/END lines included, then Ctrl+Z, Enter
```

**4. Prove it works, without waiting for 08:07.**

```bash
npx wrangler dev --test-scheduled
# in another terminal:
curl "http://localhost:8787/__scheduled?cron=7+8+*+*+*"
```

The first terminal prints `[cron] dispatched`, and a `daily refresh` run appears
under Actions within seconds. A failure prints `[cron] FAILED: ...` with the
status GitHub returned:

| status | what it means |
|---|---|
| `401` | the private key or the App id is wrong |
| `403` | step 0 was skipped: the App cannot write Actions |
| `404` | the App is not installed on this repository |

The key conversion in step 1 is not optional, and it fails clearly rather than
subtly: handed a PKCS#1 key, Web Crypto refuses with `DataError: Invalid
keyData` — tested, along with the converted one importing cleanly.

**5. Watch the first real one.** `npx wrangler tail` streams the Worker's logs
live, so the 08:07 firing can be read as it happens.

## What to check if the refresh stops being punctual

```bash
cd cron && npx wrangler tail          # is the Worker firing at all?
gh run list --workflow "daily refresh" --limit 5
```

A run whose event is `workflow_dispatch` came from here; one whose event is
`schedule` means this Worker did not fire and GitHub's own cron covered — which
is the fallback working, not a failure.
