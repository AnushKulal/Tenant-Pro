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

## Why `runtimeVersion` matters

`runtimeVersion` is the compatibility label between JS and the binary underneath it.
Expo stamps it into the APK at build time and onto every OTA update at publish time,
and a phone installs an update **only if the two strings match exactly**. It is the
one thing standing between "here is some new JavaScript" and "…which calls a native
module your app was never built with".

It used to be the hardcoded string `"1.0.0"`. A constant matches everything, so every
update was delivered to every build regardless of what native code that build
contained. That is not a hypothetical:

- **8 Aug** — an APK is built. Label: `1.0.0`.
- **9 Aug** — `expo-location` is added and an OTA update ships the JS that calls it.
  Label: also `1.0.0`.
- The labels match, so the update installs onto a binary with no location module in
  it. "Use my current location" does nothing, with no error explaining why.

It is now `{ "policy": "appVersion" }`, so the label is the `version` field above —
today `1.3.0`. Old installs carry `1.0.0`, do not match, and correctly stop receiving
updates they cannot run.

### The rule this policy asks you to remember

**Bump `version` whenever you add anything native, and build.** The policy only
separates old binaries from new JS if the version string actually changes, so:

```
add expo-location  ->  bump version 1.3.0 -> 1.4.0  ->  build  ->  install
                       (now old 1.3.0 installs are correctly locked out)
```

Skip the bump and the old bug returns exactly as before: both sides read `1.3.0`,
they match, and the update lands on a binary without the module. Note this is how the
August incident would have played out even under this policy — `version` had been
`1.3.0` since 6 Aug, unchanged across both the build and the module being added.

`{ "policy": "sdkVersion" }` is weaker still: it tracks the Expo SDK, and adding
`expo-location` does not change that. `{ "policy": "fingerprint" }` is the option that
needs no remembering — Expo hashes the real native inputs, so adding a module changes
the label on its own. Measured on this project: dropping the `expo-location` plugin
moves the hash from `564efec4…` to `cd4d2353…`. It is available here (SDK 54,
expo-updates 29) if the manual bump ever gets missed.

## The catch when the label changes

`runtimeVersion` is baked into an APK when it is built. Change the policy — or the
`version` it reads from — and every APK built beforehand keeps its old label, so new
updates no longer match it and stop arriving. **Any change here therefore requires a
new build, and users must install it.** Older installs are frozen at whatever JS they
already have until they do. That is the intended behaviour, not a fault: an update
they cannot run is worse than no update.

## Shipping something native

1. Add the dependency and its `app.json` plugin, commit, push.
2. Run **`build-android.yml`** and install the resulting `tenantpro-apk` artifact.
   GitHub serves it zipped — unzip before installing.
3. Only then does the JS calling it work. Until step 2, expect it to fail softly.

Guard native calls so a binary without the module says so rather than crashing —
`useMyLocation` in `AppContext.js` is the pattern: `require` inside a `try`, and a
plain sentence to the user when it is missing.
