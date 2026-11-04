// File: mobile/src/redesign/google.js
//
// The two pieces of "Continue with Google" that appear on a login screen, shared
// because the landlord and tenant screens need them identically and a copy in each
// would drift — the sign-in wording on one screen and not the other is exactly the
// kind of difference nobody notices until a user asks why.
//
// Neither component knows anything about OAuth. All of that is on the server (see
// backend/config/googleAuth.js); the view model hands these the three facts they
// need: are we waiting, do we need a phone number, and what went wrong.
import React from 'react';
import { View } from 'react-native';
import { T, Eyebrow, Row, Press, Glyph, Field } from './ui';

// The button, plus the two things that can happen after it is pressed.
//
// The waiting state matters more than it looks. The browser opens over the app and
// does NOT close itself when Google is done, so the person taps back to a screen
// that would otherwise look exactly as it did before they left — no feedback, no
// progress, nothing to suggest their sign-in is one poll away from landing. Saying
// "waiting for Google" is the difference between patience and pressing it again.
export function GoogleButton({ vm, t }) {
    const g = vm.gauth;

    if (g.waiting) {
        return (
            <View>
                <View
                    style={{
                        paddingVertical: 15, borderRadius: 16, backgroundColor: t.ink2,
                        borderWidth: 1, borderColor: t.line, flexDirection: 'row',
                        alignItems: 'center', justifyContent: 'center', columnGap: 9
                    }}
                >
                    <Glyph name="time-outline" size={16} color={t.fg2} />
                    <T w={600} s={13} c={t.fg2}>Waiting for Google…</T>
                </View>
                <T w={400} s={12} lh={1.45} c={t.fg3} style={{ marginTop: 9, textAlign: 'center' }}>
                    Finish signing in your browser, then come back here.
                </T>
                <Press onPress={g.cancel} hitSlop={8} style={{ marginTop: 9, alignSelf: 'center' }}>
                    <T w={600} s={12.5} c={t.accent}>Cancel</T>
                </Press>
            </View>
        );
    }

    return (
        <View>
            <Row gap={8} align="stretch">
                {vm.socials.map((so, i) => (
                    <Press
                        key={i}
                        onPress={so.go}
                        style={{
                            flex: 1, paddingVertical: 15, borderRadius: 16, backgroundColor: t.ink2,
                            borderWidth: 1, borderColor: t.line, flexDirection: 'row',
                            alignItems: 'center', justifyContent: 'center', columnGap: 8
                        }}
                    >
                        <Glyph name={so.icon} size={17} color={t.fg} />
                        <T w={600} s={13.5} c={t.fg}>Continue with {so.label}</T>
                    </Press>
                ))}
            </Row>
            {/* Failures are shown here rather than in the password form's error slot:
                a Google problem has nothing to do with the email and password the
                person typed, and putting it there would look like their details were
                rejected. */}
            {g.hasError ? (
                <Row gap={8} align="flex-start" style={{ marginTop: 10, padding: 11, borderRadius: 13, backgroundColor: t.csoft }}>
                    <Glyph name="alert-circle-outline" size={15} color={t.coral} style={{ marginTop: 1 }} />
                    <T w={500} s={12} lh={1.45} c={t.coral} style={{ flex: 1 }}>{g.error}</T>
                </Row>
            ) : null}
        </View>
    );
}

// The one field Google cannot supply.
//
// Shown INSTEAD of the password form, not alongside it: at this point the person has
// already proved who they are, and a password box would suggest they still need to
// invent one. They do not — this account signs in with Google and has no password,
// which is why the backend had to allow a null hash.
//
// The number is not optional and is not asked for out of habit. Both tables require
// it, a landlord rings their tenant with it, and rent reminders go out by SMS — so
// the reason is printed rather than left as a bare label above an empty box.
export function GoogleFinish({ vm, t }) {
    const g = vm.gauth;
    return (
        <View>
            <Row gap={9} align="flex-start" style={{ padding: 13, borderRadius: 16, backgroundColor: t.lsoft, marginBottom: 16 }}>
                <Glyph name="checkmark-circle" size={17} color={t.pos} style={{ marginTop: 1 }} />
                <T w={500} s={12.5} lh={1.5} c={t.fg} style={{ flex: 1 }}>{g.line}</T>
            </Row>

            <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginBottom: 9 }}>YOUR MOBILE NUMBER</Eyebrow>
            <Field
                label="MOBILE NUMBER"
                icon="call-outline"
                value={vm.authPhone}
                onChangeText={vm.setAuthPhone}
                placeholder="98765 43210"
                keyboardType="phone-pad"
                onSubmitEditing={g.submit}
                returnKeyType="go"
            />
            <T w={400} s={12} lh={1.45} c={t.fg3} style={{ marginTop: 9 }}>{g.why}</T>

            {g.hasError ? (
                <Row gap={8} align="flex-start" style={{ marginTop: 12, padding: 11, borderRadius: 13, backgroundColor: t.csoft }}>
                    <Glyph name="alert-circle-outline" size={15} color={t.coral} style={{ marginTop: 1 }} />
                    <T w={500} s={12} lh={1.45} c={t.coral} style={{ flex: 1 }}>{g.error}</T>
                </Row>
            ) : null}

            <Press
                onPress={g.submit}
                disabled={!g.canSubmit || g.busy}
                style={{
                    marginTop: 16, paddingVertical: 16, borderRadius: 999,
                    backgroundColor: g.canSubmit && !g.busy ? t.lime : t.ink3,
                    borderWidth: 1, borderColor: g.canSubmit && !g.busy ? t.lime : t.line,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8
                }}
            >
                <T w={700} s={14.5} c={g.canSubmit && !g.busy ? t.on : t.fg3}>
                    {g.busy ? 'Creating your account…' : 'Create my account'}
                </T>
            </Press>

            <Press onPress={g.cancel} hitSlop={8} style={{ marginTop: 14, alignSelf: 'center' }}>
                <T w={600} s={13} c={t.fg2}>Use a different sign-in</T>
            </Press>
        </View>
    );
}
