# Rolling back

## The thing that catches people out

**A `git revert` does not fix a broken app on a handset.** The phone has already
downloaded the bad JS bundle and will keep running it. Expo updates only roll
FORWARD — there is no "undo" button. The recovery is always to *publish a newer
update* whose contents are the older, good code.

That is why the safe point below is the last commit an OTA was actually published
from, rather than simply the last commit that passed tests: it is known to run on a
real phone, which is a different and stronger claim.

## The safe points

| Branch | Commit | What it is |
|---|---|---|
| `safe/before-profile-app` | `8e377fa` | Profile **backend** complete and tested; the app untouched, so nothing user-facing depends on it |
| `safe/last-published-ota` | `0aae128` | The last bundle actually published to phones and seen working |

These are branches rather than tags because this repository refuses tag pushes
(HTTP 403 on `refs/tags/*`). A branch does the same job — a durable named pointer
you can return to.

## What was live when the marker was made

```
backend on Render    main af93a2c   ← does NOT include the profile work
OTA on phones        0aae128
installed APK        build 25 (2c0b0db, first build carrying Firebase)
```

## If the app breaks after an update

Publish a new OTA whose contents are the known-good bundle:

```bash
git fetch origin
git checkout -B rollback origin/safe/last-published-ota
git push -u origin rollback --force-with-lease
```

Then **Actions → Publish OTA Update**, run against `rollback`.

Phones pick it up on next launch. Nothing needs reinstalling.

## If the app breaks so badly it cannot start

An update that crashes before the JS loads cannot be replaced by another update,
because the app never gets far enough to fetch one. That needs a reinstall of the
APK, which carries its own bundle:

**[Releases](https://github.com/AnushKulal/Tenant-Pro/releases) → build 25 →
`tenantpro.apk`**

This has only been a theoretical risk so far — `app.json` sets
`checkAutomatically: ON_ERROR_RECOVERY`, so the app deliberately re-checks for an
update when it has crashed, which is the case this setting exists for.

## If the backend breaks

Different mechanism, and easier: Render serves whatever is on `main`, so reverting
`main` and pushing is a real rollback.

```bash
git checkout main
git revert <bad-commit>       # revert, don't reset — main is deployed history
git push origin main
```

Watch it come back with **Actions → Keep Backend Awake**, which prints `/healthz`
including the running commit — that is the only window onto the live server from a
sandbox that cannot reach Render directly.

**Check for a migration first.** `config/schema.sql` only ever uses
`CREATE TABLE IF NOT EXISTS` and `initDb.js` only ever ADDS columns, so rolling the
code back never drops data — but a new table that older code does not know about
simply sits there unused, which is fine. Reverting is safe in that direction.
