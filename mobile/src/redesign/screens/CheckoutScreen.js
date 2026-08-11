// File: mobile/src/redesign/screens/CheckoutScreen.js
//
// Recording a rent payment.
//
// This screen was still the prototype: it read vm.payBreakdown, vm.payMethods,
// vm.payNow and vm.payLabel, none of which exist on the view-model any more, and it
// printed a reference that was typed into the markup by hand. The first of those,
// `vm.payBreakdown.map(...)`, threw "Cannot read property 'map' of undefined" and
// took the whole render down — so tapping Pay crashed the app rather than doing
// nothing. The view-model had been rebuilt for real payments underneath it; only
// this file was left speaking the old language.
//
// The shape it now follows, which is vm.checkout:
//
//   1. Hand off to the tenant's UPI app with the amount, the landlord's real UPI ID
//      and a reference already filled in.
//   2. Ask, on their return, whether it actually went through — React Native cannot
//      read the result of a UPI intent, so asking is the only honest option.
//   3. Or record a payment that moved some other way: cash, bank transfer, cheque.
//
// Every route produces a CLAIM the landlord confirms. Nothing here asserts that
// money arrived, because the app cannot see money.
import React from 'react';
import { View, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Card, Row, Press, Glyph, Field, QrCode } from '../ui';

export default function CheckoutScreen() {
    const vm = useVm();
    const c = vm.checkout;
    const t = useT();

    const PrimaryButton = ({ label, onPress, disabled }) => (
        <Press
            onPress={onPress}
            disabled={disabled}
            style={{ width: '100%', marginTop: 14, paddingVertical: 17, borderRadius: 999, backgroundColor: disabled ? t.ink3 : t.lime, alignItems: 'center', opacity: disabled ? 0.7 : 1 }}
        >
            <T w={700} s={15} lh={1} c={disabled ? t.fg3 : t.on}>{label}</T>
        </Press>
    );

    const QuietButton = ({ label, onPress }) => (
        <Press
            onPress={onPress}
            style={{ width: '100%', marginTop: 9, paddingVertical: 15, borderRadius: 999, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}
        >
            <T w={600} s={14} lh={1} c={t.fg}>{label}</T>
        </Press>
    );

    return (
        <ScrollView
            contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 18, paddingBottom: 28 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            <Row gap={11} style={{ marginBottom: 16 }}>
                <Press
                    onPress={vm.goPortal}
                    style={{ width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Glyph name="chevron-back" size={17} color={t.fg} />
                </Press>
                <T w={600} s={16} lh={1.1} style={{ flex: 1, letterSpacing: -0.4 }}>Payment</T>
            </Row>

            {/* Already waiting on the landlord. A second claim would leave them two
                identical rows with no way to tell a double-tap from two real payments,
                and the server refuses it anyway — so say so before anything is tapped
                rather than after a failure. */}
            {vm.unpaid && c.waiting && (
                <>
                    <Card radius={24} pad={18}>
                        <Row gap={9} style={{ marginBottom: 10 }}>
                            <Glyph name="time-outline" size={16} color={t.amber} />
                            <Eyebrow s={10} ls={0.12} c={t.amber}>AWAITING CONFIRMATION</Eyebrow>
                        </Row>
                        <T w={400} s={13} lh={1.5} c={t.fg2}>{c.waitingLine}</T>
                    </Card>
                    <PrimaryButton label="See my receipts" onPress={c.goReceipts} />
                    <QuietButton label="Back to home" onPress={vm.goPortal} />
                </>
            )}

            {vm.unpaid && !c.waiting && (
                <>
                    <Card radius={24} pad={18} style={{ marginBottom: 8 }}>
                        <Eyebrow s={10} ls={0.12} c={t.fg3}>PAYING</Eyebrow>
                        <T w={700} s={38} lh={1} style={{ marginTop: 12, letterSpacing: -1.9 }}>{c.amountLabel}</T>
                        <T w={400} s={12} lh={1.4} c={t.fg2} style={{ marginTop: 7 }}>{c.home}</T>
                        <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.line }}>
                            {c.breakdown.map((b, i) => (
                                <Row key={i} justify="space-between" style={{ paddingVertical: 5 }}>
                                    <T w={400} s={13} lh={1.3} c={t.fg2}>{b.k}</T>
                                    <T w={600} s={13} lh={1.3} c={t.fg}>{b.v}</T>
                                </Row>
                            ))}
                        </View>
                        {/* The reference is the whole mechanism by which a landlord
                            matches a credit in their bank to a claim in here, so it is
                            shown before paying, not only afterwards. */}
                        <Row justify="space-between" style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.line }}>
                            <T mono w={600} s={9} lh={1} ls={0.08} c={t.fg3}>REFERENCE</T>
                            <T mono w={600} s={10} lh={1} ls={0.06} c={t.fg}>{c.reference}</T>
                        </Row>
                    </Card>

                    {c.hasError && (
                        <Card radius={16} pad={13} style={{ marginTop: 8, borderColor: t.coral }}>
                            <Row gap={8}>
                                <Glyph name="alert-circle-outline" size={15} color={t.coral} />
                                <T w={500} s={12.5} lh={1.45} c={t.fg} style={{ flex: 1 }}>{c.error}</T>
                            </Row>
                        </Card>
                    )}

                    {/* Step 2 takes over the screen once the handoff has happened.
                        Nothing else should be tappable while an unanswered question is
                        on screen. */}
                    {c.asked ? (
                        <>
                            <Eyebrow s={10} ls={0.12} c={t.fg3} style={{ marginTop: 18, marginBottom: 10 }}>DID IT GO THROUGH?</Eyebrow>
                            <Card radius={20} pad={16}>
                                <T w={400} s={13} lh={1.5} c={t.fg2}>
                                    We cannot see inside your UPI app, so only you know how that ended. Tell us and your landlord gets the claim to confirm.
                                </T>
                            </Card>
                            <PrimaryButton
                                label={c.busy ? 'Sending…' : 'Yes, I paid'}
                                onPress={c.confirmSent}
                                disabled={c.busy}
                            />
                            <QuietButton label="No, it did not work" onPress={c.cancelSent} />
                        </>
                    ) : c.isOther ? (
                        <>
                            <Eyebrow s={10} ls={0.12} c={t.fg3} style={{ marginTop: 18, marginBottom: 10 }}>HOW DID YOU PAY?</Eyebrow>
                            <Row wrap gap={7} style={{ marginBottom: 14 }}>
                                {c.methods.map((m) => (
                                    <Press
                                        key={m.label}
                                        onPress={m.go}
                                        style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: m.on ? t.lime : t.line, backgroundColor: m.on ? t.lsoft : 'transparent' }}
                                    >
                                        <T w={600} s={12.5} lh={1} c={m.on ? t.lime : t.fg2}>{m.label}</T>
                                    </Press>
                                ))}
                            </Row>
                            <Field
                                label="REFERENCE OR NOTE (OPTIONAL)"
                                icon="pricetag-outline"
                                value={c.otherRef}
                                onChangeText={c.setOtherRef}
                                placeholder="UTR, cheque number, or how it was handed over"
                                autoCapitalize="characters"
                                maxLength={100}
                            />
                            <PrimaryButton
                                label={c.busy ? 'Recording…' : 'Record this payment'}
                                onPress={c.submitOther}
                                disabled={c.busy}
                            />
                            <QuietButton label="Cancel" onPress={c.closeOther} />
                        </>
                    ) : (
                        <>
                            {/* Without the landlord's UPI details there is nothing to
                                open. Saying that is more use than a button that cannot
                                work — and the other path still does. */}
                            {c.missingUpi ? (
                                <Card radius={20} pad={16} style={{ marginTop: 18 }}>
                                    <Row gap={9} style={{ marginBottom: 9 }}>
                                        <Glyph name="information-circle-outline" size={16} color={t.amber} />
                                        <Eyebrow s={10} ls={0.12} c={t.amber}>NO UPI ID YET</Eyebrow>
                                    </Row>
                                    <T w={400} s={13} lh={1.5} c={t.fg2}>{c.missingUpiLine}</T>
                                </Card>
                            ) : (
                                <>
                                    <Eyebrow s={10} ls={0.12} c={t.fg3} style={{ marginTop: 18, marginBottom: 10 }}>PAY BY UPI</Eyebrow>
                                    <Card radius={20} pad={16}>
                                        <Row justify="space-between">
                                            <T w={400} s={12} lh={1.3} c={t.fg3}>Paying to</T>
                                            <T mono w={600} s={11} lh={1.3} c={t.fg}>{c.payeeLabel}</T>
                                        </Row>

                                        {/* The QR carries the payee, the exact amount and the
                                            reference, so scanning it from ANOTHER phone works
                                            just as well as tapping through on this one — and
                                            the reference is what makes the credit findable in
                                            a bank statement afterwards. It is regenerated from
                                            the URI, so an amount change is reflected with no
                                            stale code to clear. */}
                                        {c.canUpi ? (
                                            <View style={{ alignItems: 'center', marginTop: 15 }}>
                                                <QrCode value={c.upiUri} size={220} />
                                                <T w={400} s={12} lh={1.45} c={t.fg2} style={{ marginTop: 13, textAlign: 'center', maxWidth: 250 }}>
                                                    Scan with any UPI app to pay {c.amountLabel}, or use the button below on this phone.
                                                </T>
                                            </View>
                                        ) : (
                                            <T w={400} s={12.5} lh={1.5} c={t.fg2} style={{ marginTop: 11 }}>
                                                Opens your UPI app with the amount and reference already filled in.
                                            </T>
                                        )}
                                    </Card>
                                    <PrimaryButton label="Open my UPI app" onPress={c.openUpi} disabled={!c.canUpi} />
                                </>
                            )}

                            <QuietButton label="I paid another way" onPress={c.openOther} />
                            <T mono w={600} s={9} lh={1.6} ls={0.06} c={t.fg3} style={{ textAlign: 'center', marginTop: 14 }}>
                                PAID STRAIGHT TO YOUR LANDLORD · NO PLATFORM FEE
                            </T>
                        </>
                    )}
                </>
            )}

            {/* Sent, not settled. The old copy said "sent" over a tick and left it
                there, which reads as done; a claim the landlord has not looked at yet
                is not done, and the reference is the real one now. */}
            {vm.paid && (
                <>
                    <Card radius={26} pad={0} style={{ alignItems: 'center', paddingVertical: 46, paddingHorizontal: 20 }}>
                        <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: t.lime, alignItems: 'center', justifyContent: 'center' }}>
                            <Glyph name="checkmark" size={30} color={t.on} />
                        </View>
                        <T w={700} s={26} lh={1.05} style={{ marginTop: 18, textAlign: 'center', letterSpacing: -1.2 }}>{c.amountLabel} recorded</T>
                        <T w={400} s={13} lh={1.5} c={t.fg2} style={{ marginTop: 9, maxWidth: 262, textAlign: 'center' }}>
                            Your landlord confirms it, then it clears the month and appears as paid in your receipts.
                        </T>
                        <T mono w={600} s={9} lh={1} ls={0.08} c={t.fg3} style={{ marginTop: 16 }}>REF · {c.reference}</T>
                    </Card>
                    <PrimaryButton label="See my receipts" onPress={c.goReceipts} />
                    <QuietButton label="Back to home" onPress={vm.payDone} />
                </>
            )}
        </ScrollView>
    );
}
