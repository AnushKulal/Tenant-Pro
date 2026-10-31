# Tests

Six suites. None of them needs a CI service, a test framework, or a dependency that
is not already here — they are plain Node scripts that exit non-zero on failure.

| File | What it drives | Needs |
|---|---|---|
| `secretbox.test.js` | AES-256-GCM sealing of gateway credentials | nothing |
| `session.test.js` | token renewal, through the real middleware and the real axios interceptor | nothing |
| `gateway.test.js` | the gateway controllers, with `db` and `fetch` stubbed | nothing |
| `vm.gateway.test.js` | the real `deriveVm`, with react-native stubbed | `mobile/node_modules` |
| `refresh.client.test.js` | the real axios interceptor: refresh-on-401, retry, and when NOT to sign out | nothing |
| `refresh.e2e.js` | refresh tokens against a real server and a real MySQL | a running server + seeded DB + `E2E_SOCK` |
| `api.e2e.js` | every HTTP endpoint, against a real server and a real MySQL | a running server + seeded DB |
| `ui.e2e.js` | the real app in a browser, clicking real buttons | a web build + Chromium |

```bash
# the four that need nothing but node
cd backend && node ../tests/secretbox.test.js
cd backend && node ../tests/session.test.js
cd backend && node ../tests/gateway.test.js
cd mobile  && node ../tests/refresh.client.test.js
cd mobile  && node ../tests/vm.gateway.test.js
```

## The two end-to-end suites

Both need a database and a server. Point a `.env` at a local MySQL, then:

```bash
cd backend
node scripts/seed.js --wipe --seed 20260101     # see below
node server.js &

E2E_OWNER=landlord20260101@example.com \
E2E_TENANT=sandeep.naik1000@example.com \
E2E_UNLINKED=sneha.bhat2000@example.com \
node ../tests/api.e2e.js

# refresh tokens also read the database directly, to prove the token is NOT stored
E2E_SOCK=/path/to/mysql.sock E2E_OWNER=... E2E_TENANT=... node ../tests/refresh.e2e.js
```

**`api.e2e.js` mutates the database it runs against** — it confirms a declared
payment, creates and deletes a property, moves a tenant out. Reseed before each run
or the second run fails on rows the first one consumed. That is not a flaw to paper
over: a suite that leaves the world as it found it would not be exercising the
writes.

**It will also trip the auth rate limiter** (30 attempts per 15 minutes per IP) if
run several times in quick succession, which is the limiter doing its job. Restart
the server to clear it — the counter is in memory.

For the UI suite, build the app for web against the local server first:

```bash
cd mobile
EXPO_PUBLIC_API_URL=http://127.0.0.1:4000 npx expo export --platform web --output-dir /tmp/webdist
cd /tmp/webdist && python3 -m http.server 4173 &

CHROME_PATH=/path/to/chrome UI_URL=http://127.0.0.1:4173 \
E2E_OWNER=... E2E_TENANT=... node tests/ui.e2e.js
```

It needs `playwright-core`, which is not a project dependency —
`npm i playwright-core` wherever you run it from.

### What the UI suite does and does not cover

It runs **the same JavaScript the phone runs**: same AppContext, same `deriveVm`,
same screens, same `api.js` and its interceptors, laid out by react-native-web —
which is exactly what `expo export --platform web` produces.

It therefore **cannot** cover anything behind a native module: the camera, the image
picker, push notifications, the UPI intent hand-off. Those need a real device or an
emulator, and an emulator needs nested virtualisation.

It also prints `SKIP` rather than a pass for anything it could not reach, so a green
run never implies coverage it does not have.

## Seeding

```bash
node scripts/seed.js                 # 3 properties, a dozen rooms, tenants
node scripts/seed.js --big           # 8 properties
node scripts/seed.js --wipe          # clear previously seeded rows first
node scripts/seed.js --seed 42       # the same "random" data every time
```

The generator is deterministic, so a failing run is reproducible by passing the same
`--seed` back. It prints the logins it created at the end.

It deliberately produces the rows that break screens and never occur by accident: a
tenant with no room, a guest with no email, a guest whose stay has **already** ended
(the only way to reach `requireLiveStay`'s 403), rent overdue / due today / upcoming
/ never set, a payment declared and undecided, one rejected with a reason, requests
where the landlord spoke last and where the tenant did, a tenant who has given
notice, and a property with no rooms at all.

## A warning worth repeating

Two of the bugs these suites found were **the suites themselves lying**:

- the first UI run never got past the permissions primer, and because its assertions
  were phrased as the *absence* of a string the primer also lacked, half of it passed
  while testing nothing;
- `chk()` crashed on a failure whose context was `undefined`, taking down the run it
  was trying to report.

Assert positively — that the thing you want is *there*, not that something else is
absent — and make the failure reporter the most boring code in the file.
