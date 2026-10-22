import React from 'react';
import { View } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, Monogram, Divider, Field, IdToggle } from '../ui';
import { KeyboardScroll } from '../keyboard';
import { GoogleButton, GoogleFinish } from '../google';

export default function OwnerLoginScreen() {
    const vm = useVm();
    const t = useT();
    return (
        <KeyboardScroll
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 28 }}
            showsVerticalScrollIndicator={false}
        >
            <Press
                onPress={vm.goRole}
                style={{ width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}
            >
                <Glyph name="chevron-back" size={19} color={t.fg} />
            </Press>

            <View style={{ flex: 1, justifyContent: 'center' }}>
                <Row style={{ marginBottom: 18 }}>
                    <Monogram size={34} />
                    <Eyebrow s={10} w={600} ls={0.14} c={t.accent} style={{ marginLeft: 10 }}>OWNER SIGN IN</Eyebrow>
                </Row>

                {/* Not "Welcome back": nobody is signed in on this screen. Greeting a
                    returning user before they have proved who they are — or at all,
                    when they have just signed out — claims to know something the app
                    does not. Signed out is signed out. */}
                <T w={700} s={36} lh={1.02} style={{ letterSpacing: -1.8, marginBottom: 26 }}>Hello{'\n'}there.</T>

                {/* Google vouched for somebody who has no account here yet. The
                    password form is REPLACED rather than joined by a phone field: at
                    this point they have already proved who they are, and leaving a
                    password box on screen would suggest they still need to invent one.
                    They do not — this account signs in with Google. */}
                {vm.gauth.needsPhone ? <GoogleFinish vm={vm} t={t} /> : (<>

                {/* Same EMAIL / MOBILE switch the tenant screen has: /auth/login
                    accepts either identifier, so one field with a mode beats a
                    vague "email or phone" box that guesses at the keyboard. */}
                <IdToggle
                    thumbX={vm.idThumbX}
                    emailFg={vm.emailFg}
                    mobileFg={vm.mobileFg}
                    onEmail={vm.setEmailMode}
                    onMobile={vm.setMobileMode}
                    style={{ marginBottom: 14 }}
                />

                {/* Keyed on the mode so switching re-mounts with the right keyboard. */}
                <Field
                    key={vm.idField.label}
                    label={vm.idField.label}
                    icon="person-outline"
                    value={vm.authId}
                    onChangeText={vm.setAuthId}
                    placeholder={vm.idField.placeholder}
                    keyboardType={vm.idField.keyboard}
                    style={{ marginBottom: 10 }}
                />

                <Field
                    label="PASSWORD"
                    icon="lock-closed-outline"
                    value={vm.authPw}
                    onChangeText={vm.setAuthPw}
                    placeholder="Your password"
                    secure
                    onSubmitEditing={vm.submitLogin}
                    returnKeyType="go"
                    style={{ marginBottom: 14 }}
                />

                {vm.hasAuthError ? (
                    <Row gap={8} align="flex-start" style={{ marginBottom: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.csoft }}>
                        <Glyph name="alert-circle" size={15} color={t.coral} />
                        <T w={500} s={12} lh={1.4} c={t.coral} style={{ flex: 1 }}>{vm.authError}</T>
                    </Row>
                ) : null}


                {vm.authOfferReset ? (
                    <View style={{ marginBottom: 12, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.asoft, borderWidth: 1, borderColor: t.line }}>
                        <Row gap={9} align="flex-start" style={{ marginBottom: 11 }}>
                            <Glyph name="key-outline" size={15} color={t.amber} />
                            <T w={500} s={12.5} lh={1.45} c={t.amber} style={{ flex: 1 }}>{vm.authResetLine}</T>
                        </Row>
                        <Press
                            onPress={vm.goForgot}
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 7, paddingVertical: 13, borderRadius: 999, backgroundColor: t.lime }}
                        >
                            <Glyph name="mail-outline" size={16} color={t.on} />
                            <T w={700} s={13.5} c={t.on}>Reset my password</T>
                        </Press>
                    </View>
                ) : null}
                <Press
                    onPress={vm.submitLogin}
                    disabled={vm.authBusy}
                    style={{ width: '100%', borderRadius: 999, backgroundColor: t.lime, paddingVertical: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8, opacity: vm.authBusy ? 0.7 : 1 }}
                >
                    <T w={700} s={15} c={t.on}>{vm.signInLabel}</T>
                    {!vm.authBusy ? <Glyph name="arrow-forward" size={17} color={t.on} /> : null}
                </Press>

                <Row gap={12} style={{ marginVertical: 18 }}>
                    <Divider style={{ flex: 1 }} />
                    <Eyebrow s={9} w={600} ls={0.1} c={t.fg3}>OR CONTINUE WITH</Eyebrow>
                    <Divider style={{ flex: 1 }} />
                </Row>

                <GoogleButton vm={vm} t={t} />

                <Row justify="space-between" style={{ marginTop: 18 }}>
                    <Press onPress={vm.goForgot} hitSlop={8}>
                        <T w={500} s={13} c={t.fg2}>Forgot password?</T>
                    </Press>
                    <Press onPress={vm.goSignup}>
                        <T
                            w={vm.authOfferSignup ? 700 : 600}
                            s={13}
                            c={vm.authOfferSignup ? t.lime : t.accent}
                        >
                            Create account
                        </T>
                    </Press>
                </Row>
                </>)}
            </View>
        </KeyboardScroll>
    );
}
