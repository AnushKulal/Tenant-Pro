// File: mobile/src/redesign/screens/ForgotPasswordScreen.js
// Password recovery, in the redesign's language. Same two-request flow v1 runs —
// POST /auth/forgot-password emails a 6-digit code, POST /auth/reset-password
// spends it — shown as three panes over one screen:
//
//   'ask'   → who are you (email or mobile)
//   'reset' → the code + a new password
//   'done'  → confirmation, back to sign in
//
// The code is generated and mailed by the backend, and only ever to an address
// that is actually registered: an unknown identifier comes back 404 and is shown
// as such, so nothing pretends to send. The code always goes to the ACCOUNT's own
// email, never to whatever was typed here, so a reset cannot be redirected by
// asking for it with someone else's address.
//
// Owners and tenants are separate accounts in separate tables, so the flow
// carries the role it was opened from — a code issued for one cannot reset the
// other.
import React from 'react';
import { View, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, Monogram, Field } from '../ui';

export default function ForgotPasswordScreen() {
    const vm = useVm();
    const t = useT();
    const f = vm.forgot;

    return (
        <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 28 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            <Press
                onPress={f.backToLogin}
                style={{ width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}
            >
                <Glyph name="chevron-back" size={19} color={t.fg} />
            </Press>

            <View style={{ flex: 1, justifyContent: 'center' }}>
                <Row style={{ marginBottom: 18 }}>
                    <Monogram size={34} />
                    <Eyebrow s={10} w={600} ls={0.14} c={t.accent} style={{ marginLeft: 10 }}>
                        {f.roleLabel}
                    </Eyebrow>
                </Row>

                {/* ── Step 1: who are you ─────────────────────────────── */}
                {f.asking && (
                    <>
                        <T w={700} s={36} lh={1.02} style={{ letterSpacing: -1.8, marginBottom: 10 }}>
                            Reset your{'\n'}password.
                        </T>
                        <T w={400} s={13.5} lh={1.5} c={t.fg2} style={{ marginBottom: 22, maxWidth: 320 }}>
                            Tell us the email or mobile number on your account and we’ll send a
                            6-digit code to its registered email.
                        </T>

                        <Field
                            label="EMAIL OR PHONE"
                            icon="mail-outline"
                            value={f.id}
                            onChangeText={f.setId}
                            placeholder="you@example.com"
                            keyboardType="email-address"
                            editable={!f.busy}
                            onSubmitEditing={f.send}
                            returnKeyType="send"
                            style={{ marginBottom: 14 }}
                        />

                        <Notice error={f.error} t={t} />

                        <Press
                            onPress={f.send}
                            disabled={f.busy}
                            style={{ width: '100%', borderRadius: 999, backgroundColor: t.lime, paddingVertical: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8, opacity: f.busy ? 0.7 : 1 }}
                        >
                            <T w={700} s={15} c={t.on}>{f.busy ? 'Sending…' : 'Send me a code'}</T>
                            {!f.busy ? <Glyph name="arrow-forward" size={17} color={t.on} /> : null}
                        </Press>
                    </>
                )}

                {/* ── Step 2: the code + a new password ───────────────── */}
                {f.resetting && (
                    <>
                        <T w={700} s={34} lh={1.04} style={{ letterSpacing: -1.6, marginBottom: 10 }}>
                            Check your{'\n'}email.
                        </T>
                        <Row gap={9} align="flex-start" style={{ paddingVertical: 12, paddingHorizontal: 13, borderRadius: 14, backgroundColor: t.lsoft, marginBottom: 18 }}>
                            <Glyph name="mail-unread-outline" size={16} color={t.accent} />
                            <T w={500} s={12.5} lh={1.45} c={t.fg2} style={{ flex: 1 }}>{f.sentLine}</T>
                        </Row>

                        <Field
                            label="6-DIGIT CODE"
                            icon="keypad-outline"
                            value={f.code}
                            onChangeText={f.setCode}
                            placeholder="000000"
                            keyboardType="number-pad"
                            maxLength={6}
                            editable={!f.busy}
                            style={{ marginBottom: 10 }}
                            inputStyle={{ letterSpacing: 6, fontSize: 17 }}
                        />
                        <Field
                            label="NEW PASSWORD"
                            icon="lock-closed-outline"
                            value={f.pw}
                            onChangeText={f.setPw}
                            placeholder="At least 6 characters"
                            secure
                            editable={!f.busy}
                            style={{ marginBottom: 10 }}
                        />
                        <Field
                            label="CONFIRM PASSWORD"
                            icon="lock-closed-outline"
                            value={f.pw2}
                            onChangeText={f.setPw2}
                            placeholder="Type it again"
                            secure
                            editable={!f.busy}
                            onSubmitEditing={f.save}
                            returnKeyType="go"
                            style={{ marginBottom: 14 }}
                        />

                        <Notice error={f.error} t={t} />

                        <Press
                            onPress={f.save}
                            disabled={f.busy}
                            style={{ width: '100%', borderRadius: 999, backgroundColor: t.lime, paddingVertical: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8, opacity: f.busy ? 0.7 : 1 }}
                        >
                            <T w={700} s={15} c={t.on}>{f.busy ? 'Saving…' : 'Set new password'}</T>
                            {!f.busy ? <Glyph name="checkmark" size={17} color={t.on} /> : null}
                        </Press>

                        <Row justify="space-between" style={{ marginTop: 18 }}>
                            <Press onPress={f.editAccount} disabled={f.busy} hitSlop={8}>
                                <T w={500} s={13} c={t.fg2}>Wrong account?</T>
                            </Press>
                            <Press onPress={f.resend} disabled={f.busy} hitSlop={8}>
                                <T w={600} s={13} c={t.accent}>Resend code</T>
                            </Press>
                        </Row>
                    </>
                )}

                {/* ── Step 3: done ────────────────────────────────────── */}
                {f.done && (
                    <>
                        <View style={{ width: 62, height: 62, borderRadius: 22, backgroundColor: t.lsoft, alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
                            <Glyph name="checkmark-circle" size={32} color={t.pos} />
                        </View>
                        <T w={700} s={34} lh={1.04} style={{ letterSpacing: -1.6, marginBottom: 10 }}>
                            Password{'\n'}changed.
                        </T>
                        <T w={400} s={13.5} lh={1.5} c={t.fg2} style={{ marginBottom: 24, maxWidth: 320 }}>
                            Sign in with your new password. The code you used has been retired, and
                            any other device stays signed in until it signs out.
                        </T>
                        <Press
                            onPress={f.backToLogin}
                            style={{ width: '100%', borderRadius: 999, backgroundColor: t.lime, paddingVertical: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8 }}
                        >
                            <T w={700} s={15} c={t.on}>Back to sign in</T>
                            <Glyph name="arrow-forward" size={17} color={t.on} />
                        </Press>
                    </>
                )}

                {/* Progress rail — the two data-entry steps; 'done' reads as full. */}
                {!f.done && (
                    <View style={{ marginTop: 26 }}>
                        <Eyebrow s={9} w={600} ls={0.12} c={t.fg3} style={{ marginBottom: 8 }}>{f.stepLabel}</Eyebrow>
                        <View style={{ height: 3, borderRadius: 2, backgroundColor: t.line, overflow: 'hidden' }}>
                            <View style={{ width: f.progress, height: '100%', borderRadius: 2, backgroundColor: t.lime }} />
                        </View>
                    </View>
                )}
            </View>
        </ScrollView>
    );
}

// The one error banner both steps share.
function Notice({ error, t }) {
    if (!error) return null;
    return (
        <Row gap={8} align="flex-start" style={{ marginBottom: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.csoft }}>
            <Glyph name="alert-circle" size={15} color={t.coral} />
            <T w={500} s={12} lh={1.4} c={t.coral} style={{ flex: 1 }}>{error}</T>
        </Row>
    );
}
