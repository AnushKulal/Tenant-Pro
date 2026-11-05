# Taking rent online

How to switch on card, netbanking and self-confirming UPI payments, start to
finish, without anybody's rent passing through this application.

---

## The one decision everything follows from

**Each landlord connects their own merchant account. Money moves tenant →
landlord directly, and never through TenantPro.**

That is deliberate, and it is not just tidiness. Collecting other people's rent
into one account and paying it out is *operating as a payment aggregator*, which
in India requires RBI authorisation — a licence, a ₹15 crore net-worth floor and
an audit. Staying out of the money's path keeps this an app rather than a
regulated financial business.

It has a second consequence worth knowing before you start: the gateway's fee
(Razorpay is about 2% + GST) is charged **to the landlord who switched it on, by
their own gateway, on their own account**. Nobody is billed for a feature they
did not ask for, and TenantPro never holds anybody's money or takes a cut.

The free UPI route is unchanged and is not going anywhere. This sits beside it.
What it buys is cards, netbanking, and confirmation that does not wait on a
landlord noticing a claim in a queue.

---

## Part 1 — The server (once, by you)

Landlords' gateway secrets are sealed with AES-256-GCM before they touch the
database. The key lives in the environment, never in the database, so that the
two are separable: a copy of the database on its own decrypts nothing.

**1. Generate a key**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

It must be exactly 64 hex characters (32 bytes). Anything else is refused rather
than silently weakened.

**2. Put it in Render → tenant-pro → Environment**

```
CREDENTIALS_KEY = <the 64 hex characters>
```

**3. Check it took**

Run **Actions → Keep Backend Awake** and read `gateways` in the `/healthz` line:

```
"gateways":"ready"                                    good
"gateways":"not-configured (CREDENTIALS_KEY not set)" not set
"gateways":"not-configured (CREDENTIALS_KEY must be 64 hex characters (32 bytes))"
```

> **This is already done on your live server.** The last health check reported
> `"gateways":"ready"`. Part 1 is here for a rebuild, or a second environment.

### Never change this key casually

Every stored gateway secret was sealed with it. Change it and every landlord's
connection stops working and has to be reconnected from their dashboard. If you
ever must rotate it, tell landlords first — their recovery is to generate a new
key at their gateway, not to look the old one up.

---

## Part 2 — A landlord connects their gateway

This is the part each landlord does for themselves, in the app.

### What they need first

Razorpay will ask for:

- **PAN**
- **a bank account**
- **one business proof**

**Expect 2–5 working days for live keys** — KYC first (Razorpay documents 24–48
hours), then a *separate* check of the website the payments are collected on (up
to 3 working days). Those two run one after the other. They are Razorpay's
numbers, not ours, and neither is ours to promise.

> **No GST?** A free **Udyam (MSME)** registration at `udyamregistration.gov.in`
> counts as business proof and takes about ten minutes. This is the wall most
> small landlords hit — "business proof" sounds like something only a registered
> company has, and a landlord with three rooms gives up there.

**Nobody is stuck waiting.** Test keys work straight away and show the whole
thing working end to end, and tenants can keep paying by UPI the entire time.

### Getting the keys

**Razorpay Dashboard → Account & Settings → API Keys → Generate Key**

You get two strings:

| | |
|---|---|
| **Key ID** | starts `rzp_live_…` (or `rzp_test_…` for test mode) |
| **Key Secret** | **shown once, at generation, and never again** |

If the secret is lost, the recovery is to generate a *new* key — not to look it
up. Save it somewhere before leaving that page.

### Connecting it in the app

**Settings → Online payments → Connect**

Paste the Key ID and the Key Secret. The app immediately asks Razorpay whether
they work, and tells you which of two different things went wrong:

- **"Razorpay did not accept that Key ID and secret"** — the keys are wrong.
  Check them, or generate a new pair.
- **"We could not reach Razorpay"** — the keys may be perfectly fine and
  Razorpay was simply unreachable. Try again shortly.

That distinction matters: being told the first when it is really the second
sends you off to regenerate a key that was never the problem.

The row then reads `ON`, `PAUSED` or `OFF`. **PAUSED** keeps the credentials but
stops offering online payment to tenants — use it to switch the feature off for
a while without reconnecting later. **Disconnect** removes the credentials
entirely.

---

## Part 3 — Try it before trusting it with rent

Do this with `rzp_test_` keys. They run the whole flow against Razorpay's test
mode and move no real money, which is the only honest way to see it work first.

1. Connect the **test** keys in Settings → Online payments.
2. Sign in as a tenant with rent due and tap **Pay**.
3. The app creates a Razorpay **Payment Link** using *that landlord's*
   credentials and opens it. Pay on Razorpay's own hosted page with one of their
   test cards.
4. Back in the app, the payment settles **only after the server asks Razorpay
   what happened** and Razorpay says paid.

Then swap the test keys for live ones when they arrive. Same screen, same steps.

### How a payment becomes real

A payment is real once something **other than the tenant** vouches for it.

- Without a gateway, that is the landlord tapping **Confirm**.
- With one, it is the gateway, asked directly by the server using the landlord's
  credentials.

The app can ask "did that go through?" as often as it likes and never influence
the answer — it is a server-to-server read. A tenant cannot talk the app into
believing they have paid.

---

## Part 4 — Webhooks (optional, and genuinely optional)

Polling is the primary route on purpose: a webhook needs the landlord to
configure a URL and a secret in a dashboard, and a feature that depends on that
step is one most landlords will never finish switching on. **Everything above
works without this section.**

If you do want Razorpay to push events as well:

1. Set the secret on the server (Render → Environment):

   ```
   RAZORPAY_WEBHOOK_SECRET = <the secret you choose in Razorpay>
   ```

2. Point Razorpay at:

   ```
   https://tenantpro-backend.onrender.com/api/webhooks/payments/razorpay
   ```

Until that variable is set the endpoint answers **404**, so an unconfigured
provider looks like nothing at all from the outside. Every request is refused
unless the secret is configured *and* the HMAC signature over the raw body
matches — the signature is the only credential, because the caller is a machine
with no account.

---

## Part 5 — PayU

**Not supported yet.** Razorpay is the only provider wired up today:

```
providers: razorpay
```

Adding PayU is contained work rather than a rewrite. The provider table in
`backend/services/gatewayService.js` was built for exactly this — each entry owns
its own HTTP, and the rest of the code knows only three functions:

| | |
|---|---|
| `createLink` | make a payment link, return its URL and id |
| `readLink`   | ask the gateway whether it has been paid |
| `verify`     | check a landlord's credentials are accepted |

Plus the labels a landlord sees: what the credentials are called in *their*
dashboard, where to find them, and what the onboarding will actually demand.

**One known difference.** Razorpay uses plain HTTP Basic auth — key as user,
secret as password, no signing dance. PayU signs requests with a merchant **key
and salt**, so the PayU entry will not be a copy of the Razorpay one.

**What is needed to build it properly:**

1. **PayU's current API documentation.** I could not reach `docs.payu.in` or
   `devguide.payu.in` from the build environment — the network policy blocks
   them — so the endpoints, parameters and hashing must be read from PayU's own
   docs rather than written from memory.
2. **A PayU sandbox account to test against**, the way `rzp_test_` keys let the
   Razorpay path be proven end to end. Code that has only been reasoned about is
   not code that has been shown to work.
3. **The salt handled as the password it is** — through the secure credential
   form, never pasted into a chat or committed.

---

## If something goes wrong

| What you see | What it means |
|---|---|
| Settings says online payments are "not available on this server yet" | `CREDENTIALS_KEY` is missing or malformed. Part 1. |
| "Razorpay did not accept that Key ID and secret" | The keys are wrong. |
| "We could not reach Razorpay" | Network, not credentials. Try again shortly. |
| Tenant pays, app still says awaiting | Ask again — it is a server-to-server read and safe to repeat. If it persists, check the payment in the Razorpay dashboard. |
| You want it off for a while | Settings → Online payments → **Pause**. Keeps the credentials. |

Tenants are never cut off: UPI costs ₹0, already works, and is unaffected by any
of this.

---

## Where this lives in the code

| | |
|---|---|
| `backend/services/gatewayService.js` | the provider table and all gateway HTTP |
| `backend/utils/secretBox.js` | AES-256-GCM sealing; `CREDENTIALS_KEY` |
| `backend/controllers/paymentController.js` | connect / pause / disconnect |
| `backend/controllers/webhookController.js` | inbound events, signature checked |
| `backend/config/schema.sql` → `payment_settings` | where a landlord's sealed credentials sit |
| `mobile/src/redesign/Sheets.js` | the Connect sheet |
| `tests/gateway.test.js`, `tests/vm.gateway.test.js` | 124 assertions, including that no credential ever reaches the view-model |
