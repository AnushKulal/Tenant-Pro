// File: mobile/src/redesign/screens/PermissionsScreen.js
// The one-time "what TenantPro uses" primer, shown between the intro and the
// role picker (and reachable again from Settings).
//
// Why it is built this way, because it is easy to get wrong:
//
//  * Nothing is requested when the screen mounts. Every row is a button, so the
//    OS dialog only ever appears one tap after the sentence that says what it is
//    for. A prompt the user did not ask for is the one they deny, and on Android
//    a denied permission gets harder to recover each time.
//  * There is no row for placing calls. `tel:` hands the number to the dialer,
//    which needs no permission at all — asking for CALL_PHONE would be asking
//    for something the app does not use. The card says so instead.
//  * Skipping is a first-class exit. Every permission here is also requested in
//    context at the moment it is needed, so "Not now" costs the user nothing.
//
// Presentational: rows, labels and colour keys all come from vm.permits.
import React from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, IconChip } from '../ui';

function Card({ row, t }) {
    const settled = row.settled;
    return (
        <View
            style={{
                backgroundColor: t.ink2,
                borderWidth: 1,
                borderColor: settled && row.state === 'granted' ? t.pos : t.line,
                borderRadius: 20,
                padding: 16
            }}
        >
            <Row justify="space-between" align="flex-start">
                <Row gap={12} align="center" style={{ flex: 1 }}>
                    <IconChip
                        name={row.icon}
                        size={17}
                        box={38}
                        radius={13}
                        bg={t.lsoft}
                        color={t.accent}
                    />
                    <View style={{ flex: 1 }}>
                        <T w={700} s={15} style={{ letterSpacing: -0.3 }}>{row.title}</T>
                        {row.stateLabel ? (
                            <Eyebrow s={9} ls={0.12} c={t[row.stateFg]} style={{ marginTop: 3 }}>
                                {row.stateLabel}
                            </Eyebrow>
                        ) : null}
                    </View>
                </Row>

                {/* Granted and "not in this build" are both terminal — a button
                    there would either re-ask for something already given or ask
                    the OS for a module that is not installed. */}
                {row.ask && !settled ? (
                    row.busy ? (
                        <ActivityIndicator color={t.lime} />
                    ) : (
                        <Press
                            onPress={row.ask}
                            style={{
                                borderRadius: 999,
                                backgroundColor: t.lime,
                                paddingVertical: 9,
                                paddingHorizontal: 15
                            }}
                        >
                            <T w={700} s={12} c={t.on}>{row.cta}</T>
                        </Press>
                    )
                ) : null}

                {row.ask && row.state === 'granted' ? (
                    <Glyph name="checkmark-circle" size={22} color={t.pos} />
                ) : null}
            </Row>

            <T w={400} s={13} lh={1.5} c={t.fg2} style={{ marginTop: 12 }}>{row.why}</T>

            {row.note ? (
                <T w={400} s={12} lh={1.45} c={t.fg3} style={{ marginTop: 8 }}>{row.note}</T>
            ) : null}
        </View>
    );
}

export default function PermissionsScreen() {
    const vm = useVm();
    const t = useT();
    const p = vm.permits;

    return (
        <View style={{ flex: 1, backgroundColor: t.ink }}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 26, paddingBottom: 34 }}
            >
                <IconChip name="shield-checkmark-outline" size={26} box={56} radius={18} bg={t.lsoft} color={t.accent} />

                <Eyebrow s={9} ls={0.14} c={t.fg3} style={{ marginTop: 24 }}>BEFORE YOU START</Eyebrow>
                <T w={700} s={30} lh={1.08} style={{ letterSpacing: -1.2, marginTop: 10 }}>
                    What TenantPro{' '}
                    <T w={700} s={30} c={t.accent}>asks for.</T>
                </T>
                <T w={400} s={14} lh={1.55} c={t.fg2} style={{ marginTop: 12, maxWidth: 320 }}>
                    Two things, both optional, and only when you use the feature that needs them. Allow them
                    now if you like — the app asks again at the moment it needs one either way.
                </T>

                <View style={{ rowGap: 12, marginTop: 24 }}>
                    {p.rows.map((row) => <Card key={row.key} row={row} t={t} />)}
                    {p.info.map((row) => <Card key={row.key} row={row} t={t} />)}
                </View>

                <T w={400} s={12} lh={1.5} c={t.fg3} style={{ marginTop: 18 }}>
                    You can change any of this later from Settings, or from your phone’s app settings.
                </T>

                <Press
                    onPress={p.done}
                    style={{
                        marginTop: 22,
                        paddingVertical: 15,
                        borderRadius: 999,
                        backgroundColor: t.lime,
                        alignItems: 'center'
                    }}
                >
                    <Row gap={8}>
                        <T w={700} s={14} c={t.on} style={{ letterSpacing: -0.2 }}>{p.doneLabel}</T>
                        <Glyph name="arrow-forward" size={15} color={t.on} />
                    </Row>
                </Press>
            </ScrollView>
        </View>
    );
}
