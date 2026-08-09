// File: mobile/src/redesign/screens/GuestJoinScreen.js
// "Join as a guest" — the way in for someone standing in the building today with no
// TenantPro account and no interest in making one yet.
//
// Two steps, because they are answered in two different ways: the first is usually
// answered by pointing a camera at a QR code, the second by typing and photographing.
// Putting them on one screen made a wall of fields under a scanner button.
//
//   1. WHICH PROPERTY — scan the QR, or type the code.
//   2. WHO TO LET IN   — a mobile number, and a photo of a government ID.
//
// That is the whole form. No name, no email, no password: a landlord deciding
// whether to let someone into a building needs a number to ring and an ID to check,
// and everything else can wait until the person is actually living there. What comes
// back is a randomised guest ID that lasts as long as the stay.
import React from 'react';
import { View, Image, ActivityIndicator } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, Field, IconChip } from '../ui';
import { KeyboardScroll } from '../keyboard';

export default function GuestJoinScreen() {
    const vm = useVm();
    const t = useT();
    const g = vm.guest;

    return (
        <KeyboardScroll
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 30 }}
            showsVerticalScrollIndicator={false}
        >
            <Press
                onPress={g.onYou ? g.back : vm.goTenantLogin}
                style={{ width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}
            >
                <Glyph name="chevron-back" size={19} color={t.fg} />
            </Press>

            <View style={{ flex: 1, justifyContent: 'center' }}>
                {/* ── Step 1: which property ─────────────────────────────── */}
                {g.onCode ? (
                    <View>
                        <IconChip name="enter-outline" size={24} box={52} radius={17} bg={t.lsoft} color={t.accent} />

                        <Eyebrow s={9} ls={0.14} c={t.fg3} style={{ marginTop: 22 }}>STEP 1 OF 2 · JOIN A PROPERTY</Eyebrow>
                        <T w={700} s={32} lh={1.06} style={{ letterSpacing: -1.4, marginTop: 10 }}>
                            Have a{'\n'}
                            <T w={700} s={32} c={t.accent}>property code?</T>
                        </T>
                        <T w={400} s={13.5} lh={1.55} c={t.fg2} style={{ marginTop: 12 }}>{g.line}</T>

                        <Press
                            onPress={g.scan}
                            style={{ marginTop: 26, paddingVertical: 17, borderRadius: 20, backgroundColor: t.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 10 }}
                        >
                            <Glyph name="qr-code" size={19} color={t.on} />
                            <T w={700} s={15} c={t.on}>Scan the QR</T>
                        </Press>

                        <Row gap={12} style={{ marginVertical: 18 }}>
                            <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
                            <Eyebrow s={9} ls={0.12} c={t.fg3}>OR TYPE IT</Eyebrow>
                            <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
                        </Row>

                        <Field
                            label="PROPERTY CODE"
                            icon="key-outline"
                            value={g.code}
                            onChangeText={g.setCode}
                            placeholder="TP-SUN-8412"
                            autoCapitalize="characters"
                            onSubmitEditing={g.submitCode}
                            returnKeyType="go"
                            style={{ marginBottom: 12 }}
                        />

                        {g.hasError ? <ErrorLine t={t} text={g.error} /> : null}

                        <Press
                            onPress={g.submitCode}
                            disabled={!g.canSubmit}
                            style={{
                                paddingVertical: 16,
                                borderRadius: 999,
                                backgroundColor: g.canSubmit ? t.fg : t.ink3,
                                borderWidth: 1,
                                borderColor: g.canSubmit ? t.fg : t.line,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                columnGap: 8
                            }}
                        >
                            <T w={700} s={14.5} c={g.canSubmit ? t.ink : t.fg3}>{g.busy ? 'Checking…' : 'Continue'}</T>
                            {g.busy
                                ? <ActivityIndicator size="small" color={g.canSubmit ? t.ink : t.fg3} />
                                : <Glyph name="arrow-forward" size={16} color={g.canSubmit ? t.ink : t.fg3} />}
                        </Press>

                        <Row justify="center" gap={7} style={{ marginTop: 22 }}>
                            <T w={400} s={13} c={t.fg3}>Already have an account?</T>
                            <Press onPress={vm.goTenantLogin} hitSlop={8}>
                                <T w={600} s={13} c={t.accent}>Sign in</T>
                            </Press>
                        </Row>
                        {/* A returning guest has no password to sign in with, so the
                            ordinary sign-in link is not their way back. */}
                        <Row justify="center" gap={7} style={{ marginTop: 10 }}>
                            <T w={400} s={13} c={t.fg3}>Been here before?</T>
                            <Press onPress={vm.goGuestSignIn} hitSlop={8}>
                                <T w={600} s={13} c={t.accent}>Use my guest ID</T>
                            </Press>
                        </Row>
                    </View>
                ) : null}

                {/* ── Step 2: who to let in ──────────────────────────────── */}
                {g.onYou ? (
                    <View>
                        <IconChip name="id-card-outline" size={24} box={52} radius={17} bg={t.lsoft} color={t.accent} />

                        <Eyebrow s={9} ls={0.14} c={t.fg3} style={{ marginTop: 22 }}>STEP 2 OF 2 · WHO TO LET IN</Eyebrow>
                        <T w={700} s={28} lh={1.08} style={{ letterSpacing: -1.2, marginTop: 10 }}>{g.youTitle}</T>
                        <T mono w={600} s={10} lh={1.5} ls={0.08} c={t.fg3} style={{ marginTop: 7 }}>{g.placeLine}</T>
                        <T w={400} s={13.5} lh={1.55} c={t.fg2} style={{ marginTop: 12, marginBottom: 20 }}>{g.youLine}</T>

                        <Field
                            label="MOBILE NUMBER"
                            icon="call-outline"
                            value={g.phone}
                            onChangeText={g.setPhone}
                            placeholder="98765 43210"
                            keyboardType="phone-pad"
                            style={{ marginBottom: 16 }}
                        />

                        <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginBottom: 9 }}>WHICH ID</Eyebrow>
                        <Row wrap gap={7} style={{ marginBottom: 13 }}>
                            {g.docTypes.map((d) => (
                                <Press
                                    key={d.key}
                                    onPress={d.go}
                                    style={{
                                        paddingVertical: 10,
                                        paddingHorizontal: 14,
                                        borderRadius: 999,
                                        backgroundColor: d.on ? t.fg : t.ink2,
                                        borderWidth: 1,
                                        borderColor: d.on ? t.fg : t.line
                                    }}
                                >
                                    <T mono w={600} s={10} lh={1} ls={0.06} c={d.on ? t.ink : t.fg2}>{d.label}</T>
                                </Press>
                            ))}
                        </Row>

                        <Field
                            label={g.docNumberLabel}
                            icon="card-outline"
                            value={g.docNumber}
                            onChangeText={g.setDocNumber}
                            placeholder="ABCDE1234F"
                            autoCapitalize="characters"
                            style={{ marginBottom: 13 }}
                        />

                        {g.hasPhoto ? (
                            <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: t.line, marginBottom: 11 }}>
                                <Image source={{ uri: g.photoUri }} style={{ width: '100%', height: 170 }} resizeMode="cover" />
                                <Press
                                    onPress={g.clearPhoto}
                                    style={{ position: 'absolute', top: 9, right: 9, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, backgroundColor: 'rgba(4,4,6,0.72)' }}
                                >
                                    <T mono w={600} s={9} ls={0.1} c="#FFFFFF">RETAKE</T>
                                </Press>
                            </View>
                        ) : null}

                        {/* Camera first: the usual case is holding the card. */}
                        <Row gap={8} align="stretch" style={{ marginBottom: 13 }}>
                            <Press
                                onPress={g.capture}
                                style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 7 }}
                            >
                                <Glyph name="camera-outline" size={16} color={t.accent} />
                                <T w={600} s={12.5} c={t.fg}>Take a photo</T>
                            </Press>
                            <Press
                                onPress={g.pick}
                                style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 7 }}
                            >
                                <Glyph name="image-outline" size={16} color={t.fg2} />
                                <T w={600} s={12.5} c={t.fg}>Choose a file</T>
                            </Press>
                        </Row>

                        <Row gap={8} align="flex-start" style={{ marginBottom: 14 }}>
                            <Glyph name="lock-closed-outline" size={13} color={t.fg3} />
                            <T w={400} s={11.5} lh={1.45} c={t.fg3} style={{ flex: 1 }}>{g.privacy}</T>
                        </Row>

                        {g.hasError ? <ErrorLine t={t} text={g.error} /> : null}

                        <Press
                            onPress={g.submit}
                            disabled={!g.canJoin}
                            style={{
                                paddingVertical: 17,
                                borderRadius: 999,
                                backgroundColor: g.canJoin ? t.lime : t.ink3,
                                borderWidth: 1,
                                borderColor: g.canJoin ? t.lime : t.line,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                columnGap: 8
                            }}
                        >
                            <T w={700} s={15} c={g.canJoin ? t.on : t.fg3}>{g.submitLabel}</T>
                            {g.busy ? <ActivityIndicator size="small" color={g.canJoin ? t.on : t.fg3} /> : null}
                        </Press>
                    </View>
                ) : null}
            </View>
        </KeyboardScroll>
    );
}

function ErrorLine({ t, text }) {
    return (
        <Row gap={8} align="flex-start" style={{ marginBottom: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 13, backgroundColor: t.csoft }}>
            <Glyph name="alert-circle" size={15} color={t.coral} />
            <T w={500} s={12.5} lh={1.45} c={t.coral} style={{ flex: 1 }}>{text}</T>
        </Row>
    );
}
