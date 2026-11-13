# TenantPro

A rent and tenancy record that both sides can see — a landlord application and a
tenant portal, built from one React Native codebase over a Node and Express API.

![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Expo](https://img.shields.io/badge/expo-1C1E24?style=for-the-badge&logo=expo&logoColor=#D04A37)
![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)
![MySQL](https://img.shields.io/badge/mysql-4479A1.svg?style=for-the-badge&logo=mysql&logoColor=white)

---

## What it is

Paying guest houses, private hostels and small apartment blocks house a very
large share of the students and working people in Indian cities, and almost all
of them are still run on paper. Names go into a register. Rent arrives by UPI or
in cash. The only record of a payment is a screenshot on somebody's phone. A
tenant who has paid holds nothing their landlord has acknowledged, and a
landlord with six rooms often cannot say who is behind this month.

TenantPro replaces that with one record both sides read from. The landlord gets
properties, rooms, tenants and a ledger, with each tenancy's rent due on its own
anniversary rather than on a shared calendar month. The tenant sees the same
record from the other side: what is owed, when, what has been paid, and which of
it the landlord has actually confirmed.

## The one decision that shapes everything else

**Money never passes through the platform.** Rent goes straight from the tenant
to the landlord — by UPI into the landlord's own address, or through a payment
gateway connected to the landlord's own merchant account. The platform states
the amount and the destination and records what happened. It holds nobody's
funds and bills nobody.

That keeps the operator outside the Reserve Bank of India's payment-aggregator
perimeter, which carries an authorisation requirement and a net-worth floor in
the tens of crores. It has a cost, and the design pays it openly: an application
that does not touch the money cannot see it. So a payment a **tenant** reports
begins as a *claim* and stays one until a second party vouches for it — the
landlord tapping Confirm, or the gateway answering a direct query from the
server. Both of those end in the same settlement function, so they cannot
disagree about when a month has cleared.

A payment the **landlord** enters themselves is the exception: it is recorded as
confirmed outright, because it is their own statement about their own money and
there is nobody left to verify it against.

## Features

**Landlord**
- Properties, rooms and tenants, with occupancy and arrears at a glance
- Rent due dates computed per tenancy, not per calendar month
- A confirmation queue: no payment settles on the payer's say-so
- Ledger of every rupee in, searchable by person, room, method, reference, amount or date
- Maintenance tickets with a shared thread per issue
- Tenant identity documents, with the landlord's read revoked when a tenancy ends
- Rent reminders by email and push
- Publish a vacant room, and accept or decline the people who ask about it
- Connect a payment gateway using the landlord's own merchant account

**Tenant**
- What is owed and when, with a Pay button that opens UPI or a gateway link
- Payment history, and which payments the landlord has acknowledged
- Raise a maintenance ticket and follow it through
- Own documents, agreement summary, notice period and leave date
- Find a place: search published rooms, filter, and ask to join one

**Both**
- A guided tour on first run, replayable from Settings
- A notifications bell whose rows are derived from data already held — no new list endpoint, though marking them seen needed one
- Check for updates from Settings, and a notice when a new build is out

## Tech

| | |
|---|---|
| Mobile | React Native, Expo SDK 54, delivered as an Android build with over-the-air updates |
| Backend | Node.js, Express |
| Database | MySQL / MariaDB |
| Auth | JWT access tokens with rotating refresh tokens and real revocation |
| Payments | UPI intent and Razorpay Payment Links, against the landlord's own account |

## Project structure

```
Tenant-Pro/
├── backend/              Node + Express API
│   ├── config/           schema.sql, migrations, seed data
│   ├── controllers/      request handlers
│   ├── routes/           91 endpoints (96 in all, with 5 declared in server.js)
│   ├── services/         sessions, push, cron, gateway, SMS, scoring
│   └── utils/            credential sealing, phone normalisation
├── mobile/
│   └── src/
│       ├── redesign/     the current UI: screens, view-model, layout rule,
│       │                 request client, token refresh, interceptors
│       └── api/          the older axios client, kept for the v1 screens
├── tests/                22 suites, 750 assertions, no test framework
├── docs/                 project report, payments setup, test plan
└── .github/workflows/    OTA publish, Android build, rollback
```

## Getting started

**Prerequisites** — Node.js 20+, MySQL or MariaDB, and the Expo CLI.

```bash
git clone https://github.com/AnushKulal/Tenant-Pro.git
cd Tenant-Pro
```

**Backend**

```bash
cd backend
npm install
cp .env.example .env          # then fill in DB_* and JWT_SECRET
node server.js
```

Create the database itself first (`CREATE DATABASE tenantpro;`) — the server
connects to the one `DB_NAME` names and will not create it. Everything inside it
is then created and migrated on each boot from `config/schema.sql`, so there is
no import step and no migration to run by hand. For data to work with:

```bash
node scripts/seed.js --wipe
```

That prints the accounts it made and the seed it used, so an exact dataset can
be reproduced later.

**Mobile**

```bash
cd ../mobile
npm install
EXPO_PUBLIC_API_URL=http://<your-machine-ip>:5000 npx expo start
```

Use your machine's LAN address, not `localhost` — a phone cannot reach your
laptop's loopback.

**Health check.** `GET /healthz` reports the database, mail, push, SMS, uploads,
gateways, the discovery feature and the announced store build in one response.
It is the fastest way to find a misconfiguration.

## Tests

```bash
# Pure suites need nothing running.
node tests/layout.test.js
node tests/appversion.test.js

# The API suite needs a live server and a seeded database. The three accounts
# have no defaults — `scripts/seed.js` prints the ones it just made — and the
# suite's own default port is 4000, so E2E_BASE has to match your server.
E2E_BASE=http://127.0.0.1:5000 \
E2E_OWNER=landlord20260101@example.com \
E2E_TENANT=sandeep.naik1000@example.com \
E2E_UNLINKED=sneha.bhat2000@example.com \
node tests/api.e2e.js

# The browser suites need the app exported for web and served first. The API URL
# is baked in at export time, so it must match the port the server is on.
cd mobile && EXPO_PUBLIC_API_URL=http://127.0.0.1:5000 \
  npx expo export --platform web --output-dir /tmp/webdist && cd ..
npx serve -s /tmp/webdist -l 8080 &
UI_URL=http://127.0.0.1:8080 \
E2E_OWNER=landlord20260101@example.com \
E2E_TENANT=sandeep.naik1000@example.com \
node tests/ui.e2e.js
```

`tests/README.md` has the rest: which tenant not to point a suite at, that
`api.e2e.js` mutates the database and wants a reseed between runs, and the rate
limiter below.

750 assertions across 22 suites. None of them uses a test framework: each is a
plain Node script that exits non-zero on failure.

- **8 pure or stubbed suites** — credential sealing, token renewal, the gateway
  controllers, the view-model, the layout rule, the rate limiter, version
  comparison.
- **3 live-server suites** — every endpoint, refresh-token rotation read straight
  out of the `sessions` table, and the under-eighteen guardian path from form to
  column.
- **11 browser-driven suites** — the real compiled application in Chromium: both
  portals end to end, a ticket crossing from tenant to landlord with the clock
  running, discovery, the bell, the tour, signup validation, updates and layout.

Nothing behind a native module is asserted at all — camera, image picker, push
delivery and the UPI hand-off are simply outside what a browser can reach — so a
green run claims no coverage it does not have. It also does not announce the
gap, which is worth knowing when reading one.

A full run signs in often enough to trip the auth rate limiter. The production
limits are the defaults; raise them for a test run only:

```bash
AUTH_RATE_MAX=100000 API_RATE_MAX=100000 RATE_LIMIT_MAX=100000 node server.js
```

## Releasing

Changes to JavaScript ship over the air; changes to native code need a new APK.

| | |
|---|---|
| **OTA update** | Push to `main` with changes under `mobile/` — `eas-update.yml` publishes and writes the release notes from the commit subjects |
| **Android build** | Actions → *Build Android APK* → Run workflow; the APK is attached to a GitHub release |
| **Rollback** | Actions → *Roll Back The App*, empty first to list recent updates, then again with the ID to put that version back on phones |

**Revert flags** live in `mobile/src/appConfig.js` — `UI_VERSION`, `HEADER_LAYOUT`
and `GUIDED_TOUR`. Each is a build-time constant, so flipping one and publishing
an OTA is the whole revert: about two minutes, no rebuild, no store review,
nothing touched on the server. See [`ROLLBACK.md`](ROLLBACK.md).

**Announcing a new build.** The app cannot discover a store release on its own,
so the server tells it. Set on the backend:

```
APP_LATEST_VERSION   1.5.0
APP_DOWNLOAD_URL     https://github.com/AnushKulal/Tenant-Pro/releases/latest
APP_MIN_VERSION      optional — below this, the notice cannot be dismissed
APP_UPDATE_NOTES     optional — one line per change
```

With `APP_LATEST_VERSION` unset, nothing is announced to anybody. That is the
deliberate default: an unconfigured server must not put a banner on every phone.

## Documentation

- [`docs/TenantPro Project Report.pdf`](docs/) — the full project report
- [`docs/PAYMENTS.md`](docs/PAYMENTS.md) — switching on online rent payments, step by step
- [`ROLLBACK.md`](ROLLBACK.md) — how to undo a release

## Author

MCA project, School of Computer Science and IT, JAIN (Deemed-to-be University),
Bengaluru — 2025–26. Guide: Dr. Kamalraj R.

| | |
|---|---|
| Anush Kulal M | 24MCAR0133 · [@AnushKulal](https://github.com/AnushKulal) |

## Licence

Created for educational purposes.
