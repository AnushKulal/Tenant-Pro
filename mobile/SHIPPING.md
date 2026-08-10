# Shipping TenantPro: updates vs builds

There are two ways to get a change onto a phone, and picking the wrong one is how a
feature ends up silently doing nothing.

| | `eas-update.yml` (OTA) | `build-android.yml` (APK) |
|---|---|---|
| Ships | the JavaScript bundle | the whole app, native code included |
| Reaches users | in seconds, on next app open | only by installing the APK |
| Can add a native module | **no** | yes |

Almost everything is JavaScript and goes out over the air. The exception is anything
that needs native code compiled in: a new `expo-*` module, a new permission, an
`app.json` plugin, an SDK bump. Those need a build.

## Why `runtimeVersion` is a fingerprint

`runtimeVersion` is the compatibility label between JS and the binary underneath it.
Expo stamps it into the APK at build time and onto every OTA update at publish time,
and a phone installs an update **only if the two strings match exactly**. It is the
one thing standing between "here is some new JavaScript" and "…which calls a native
module your app was never built with".

It used to be the hardcoded string `"1.0.0"`. A constant matches everything, so every
update was delivered to every build regardless of what native code that build
contained. That is not a hypothetical:

- **8 Aug** — an APK is built.
- **9 Aug** — `expo-location` is added and an OTA update ships the JS that calls it.
- The update installs happily onto the 8 Aug APK, which has no location module in it.
  "Use my current location" does nothing, with no error explaining why.

It is now `{ "policy": "fingerprint" }`. Expo hashes the actual native inputs —
dependencies, config plugins, permissions, autolinking — so adding a native module
changes the label automatically, with nothing to remember. Verified rather than
assumed: removing the `expo-location` plugin moves the hash from `564efec4…` to
`cd4d2353…`, so an update built with location could not have reached a binary
without it.

### Why not the other policies

- `"1.0.0"` or any fixed string — matches everything, protects nothing.
- `{ "policy": "sdkVersion" }` — tracks the Expo SDK only. Adding `expo-location`
  does not change the SDK version, so **this would not have caught the bug above.**
- `{ "policy": "appVersion" }` — tracks `version` in `app.json`. That was `1.3.0` on
  both sides of the incident, so **this would not have caught it either**, unless you
  remember to bump the version every time native code changes. Fingerprint is the
  same discipline without the remembering.

Fingerprint stability depends on both workflows computing the same hash from the same
commit. Two things keep that true, and both matter:

- `android/` and `ios/` are gitignored, so every run starts from the same managed
  project rather than a generated one that may differ.
- `package-lock.json` is committed, so the dependency tree the hash covers is the
  same tree in both workflows.

## The catch when the label changes

`runtimeVersion` is baked into an APK when it is built. Change the policy and every
APK built before the change keeps its old label — so new updates no longer match it
and stop arriving. **Changing this file's `runtimeVersion` therefore requires a new
build, and users must install it.** Installs older than that change are frozen at
whatever JS they already have until they do.

## Shipping something native

1. Add the dependency and its `app.json` plugin, commit, push.
2. Run **`build-android.yml`** and install the resulting `tenantpro-apk` artifact.
   GitHub serves it zipped — unzip before installing.
3. Only then does the JS calling it work. Until step 2, expect it to fail softly.

Guard native calls so a binary without the module says so rather than crashing —
`useMyLocation` in `AppContext.js` is the pattern: `require` inside a `try`, and a
plain sentence to the user when it is missing.
