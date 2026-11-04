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
| `safe/before-discovery` | `f18183e` | `main` as it stood immediately before the discovery release — no suggested properties, no listings table, the Find screen still invite-code only |

These are branches rather than tags because this repository refuses tag pushes
(HTTP 403 on `refs/tags/*`). A branch does the same job — a durable named pointer
you can return to.

## What was live when the marker was made

```
backend on Render    main af93a2c   ← does NOT include the profile work
OTA on phones        0aae128
installed APK        build 25 (2c0b0db, first build carrying Firebase)
```

## If only the suggested-properties feature misbehaves

Try this before anything else. There is a switch on the server, and it needs no
deploy, no rebuild and no over-the-air update:

**Render → tenant-pro → Environment → add `DISCOVER_ENABLED` = `false` → Save**

Render restarts the service, and within about half a minute:

- the search endpoint answers with an empty, `disabled` result,
- the app hides the whole suggestions section and the Find screen goes back to
  being the invite-code screen it was before, with the code box already open,
- a landlord trying to publish a room gets *"Listing rooms is switched off at the
  moment"* rather than writing a row nothing can read.

Nothing is deleted. Existing `listings` rows stay exactly as they are, so setting
the variable back to `true` — or simply removing it — brings the feature back with
every listing intact. Phones need no update either way; they ask the server on each
visit to the screen.

This is deliberately the cheapest lever in this document. Reverting code takes
minutes and can fail, and the moment you most want a feature gone is the moment you
least want to be shipping something.

### The sample rooms specifically

The Find screen is seeded with eighteen listed rooms across eight showcase
properties, so it is not an empty list on a database where no real landlord has
published anything yet (`backend/config/seedShowcase.js`). Those landlords cannot
be signed into — their password is a random string thrown away at the moment the
hash is made — and their email addresses all end in `@showcase.invalid`, a reserved
domain that can never be a real mailbox.

`SHOWCASE_LISTINGS=false` stops them being topped up on boot. It does **not** delete
the rows already there; removing sample data is a deliberate act, not something a
restart should do on its own. To take them off the screen without deleting
anything:

```sql
UPDATE listings l
  JOIN owners o ON o.id = l.owner_id
   SET l.published = 0
 WHERE o.email LIKE '%@showcase.invalid';
```

Set `published = 1` to bring them back.

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
