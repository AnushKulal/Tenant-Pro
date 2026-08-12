// File: mobile/src/redesign/screens/DocumentsScreen.js
// The tenant's own ID proofs: what they have uploaded, what their landlord made of
// each one, and the form to add another.
//
// This screen has two modes, and vm.tdocs.gate is the difference:
//
//   • GATE (straight after registering) — it is the last step of signing up. A
//     landlord is being asked to hand over a room, so "who is this person" has to
//     be answerable. There is no skip: `canContinue` stays false until the server
//     confirms a stored document.
//   • NORMAL (reached from the profile) — a manager for documents already there.
//
// Why the requirement lives here and not on the signup form: uploading needs the
// token that registering returns. A file attached to the registration call itself
// would be lost if the account was created and the upload then failed, leaving a
// real account that could never satisfy its own requirement.
import React, { useEffect } from 'react';
import { View, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, Field, IconChip, DocThumb } from '../ui';
import { useIdShield } from '../shield';

export default function DocumentsScreen() {
    const vm = useVm();
    const t = useT();
    const d = vm.tdocs;
    const f = d.form;
    const col = (v) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);

    // The thumbnails on this screen are photographs of government IDs, so a screenshot
    // of it leaks the same thing the full-screen viewer does. Shielded for the whole
    // time the screen is mounted, and released on the way out — see shield.js.
    useIdShield(true, 'tenantpro-id-mydocs');

    // Reached by the gate (which routes here directly rather than through
    // goTDocs), so fetch on mount if nothing has been loaded yet.
    useEffect(() => {
        if (!d.loaded && !d.loading) vm.loadMyDocsOnce();
    }, [d.loaded, d.loading, vm]);

    return (
        <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 22, paddingBottom: 34 }}
            showsVerticalScrollIndicator={false}
        >
            <IconChip
                name={d.gate ? 'shield-checkmark-outline' : 'folder-open-outline'}
                size={24}
                box={52}
                radius={17}
                bg={t.lsoft}
                color={t.accent}
            />

            <Eyebrow s={9} ls={0.14} c={t.fg3} style={{ marginTop: 20 }}>
                {d.gate ? 'FINISH SETTING UP' : 'MY DOCUMENTS'}
            </Eyebrow>
            <T w={700} s={28} lh={1.08} style={{ letterSpacing: -1.1, marginTop: 9 }}>{d.title}</T>
            <T w={400} s={13.5} lh={1.55} c={t.fg2} style={{ marginTop: 10 }}>{d.blurb}</T>

            {d.hasError ? (
                <Row gap={8} align="flex-start" style={{ marginTop: 14, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 13, backgroundColor: t.csoft }}>
                    <Glyph name="alert-circle" size={15} color={t.coral} />
                    <T w={500} s={12.5} lh={1.45} c={t.coral} style={{ flex: 1 }}>{d.error}</T>
                </Row>
            ) : null}

            {/* ── What is already on file ─────────────────────────────── */}
            <Row justify="space-between" style={{ marginTop: 24, marginBottom: 10 }}>
                <Eyebrow s={9} ls={0.12} c={t.fg3}>ON FILE</Eyebrow>
                <Eyebrow s={9} ls={0.06} c={t.fg3}>{d.summaryLine}</Eyebrow>
            </Row>

            {d.loading ? (
                <View style={{ alignItems: 'center', paddingVertical: 26 }}>
                    <ActivityIndicator color={t.lime} />
                </View>
            ) : null}

            {d.empty ? (
                <View style={{ paddingVertical: 18, paddingHorizontal: 15, borderRadius: 18, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line }}>
                    <T w={400} s={13} lh={1.5} c={t.fg2}>
                        Nothing yet. Add one below — a photo of the card is enough.
                    </T>
                </View>
            ) : null}

            <View style={{ rowGap: 8 }}>
                {d.rows.map((x) => (
                    <View
                        key={x.id}
                        style={{ borderRadius: 18, backgroundColor: t.ink2, borderWidth: 1, borderColor: x.verified ? t.pos : t.line, padding: 14 }}
                    >
                        {/* Opens full screen in the app, where it zooms. A tenant who can
                            actually look at what they sent can tell a blurred photograph
                            from a readable one — which is the most common reason a
                            landlord rejects an ID. */}
                        <Press onPress={x.open}>
                            <Row gap={12}>
                                <DocThumb uri={x.thumb} isPdf={x.isPdf} size={40} radius={13} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={600} s={14} lh={1.2} numberOfLines={1}>{x.label}</T>
                                    {x.hasNumber ? (
                                        <T mono w={600} s={9} lh={1.4} ls={0.08} c={t.fg2} numberOfLines={1} style={{ marginTop: 4 }}>{x.number}</T>
                                    ) : null}
                                    <Eyebrow s={9} ls={0.06} c={t.fg3} style={{ marginTop: 3 }}>{x.age}</Eyebrow>
                                </View>
                                <T mono w={600} s={8} lh={1} ls={0.08} c={col(x.statusFg)}>{x.status}</T>
                            </Row>
                        </Press>

                        {x.by ? <Eyebrow s={9} ls={0.06} c={t.fg3} style={{ marginTop: 10 }}>{x.by}</Eyebrow> : null}
                        {x.hasNote ? (
                            <T w={400} s={12} lh={1.45} c={x.rejected ? t.coral : t.fg2} style={{ marginTop: 9 }}>{x.note}</T>
                        ) : null}

                        {/* A verified document cannot be withdrawn: the verdict is a
                            record of what was checked, and removing the evidence would
                            leave the badge standing on nothing. */}
                        {x.canRemove ? (
                            <Press onPress={x.remove} style={{ marginTop: 11, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 13, borderRadius: 11, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                <T w={600} s={11.5} c={t.fg2}>Remove</T>
                            </Press>
                        ) : null}
                    </View>
                ))}
            </View>

            {/* ── Add one ─────────────────────────────────────────────── */}
            <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginTop: 26, marginBottom: 10 }}>ADD A DOCUMENT</Eyebrow>

            <Row wrap gap={7} style={{ marginBottom: 13 }}>
                {f.types.map((x) => (
                    <Press
                        key={x.key}
                        onPress={x.go}
                        style={{
                            paddingVertical: 10,
                            paddingHorizontal: 14,
                            borderRadius: 999,
                            backgroundColor: x.on ? t.fg : t.ink2,
                            borderWidth: 1,
                            borderColor: x.on ? t.fg : t.line
                        }}
                    >
                        <T mono w={600} s={10} lh={1} ls={0.06} c={x.on ? t.ink : t.fg2}>{x.label}</T>
                    </Press>
                ))}
            </Row>

            <Field
                label={f.numberLabel}
                icon="card-outline"
                value={f.number}
                onChangeText={f.setNumber}
                placeholder="ABCDE1234F"
                autoCapitalize="characters"
                style={{ marginBottom: 11 }}
            />

            {f.hasPhoto ? (
                <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: t.line, marginBottom: 11 }}>
                    <Image source={{ uri: f.photoUri }} style={{ width: '100%', height: 170 }} resizeMode="cover" />
                </View>
            ) : null}

            {/* Camera first: the usual case is holding the card. */}
            <Row gap={8} align="stretch" style={{ marginBottom: 11 }}>
                <Press
                    onPress={f.capture}
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 7 }}
                >
                    <Glyph name="camera-outline" size={16} color={t.accent} />
                    <T w={600} s={12.5} c={t.fg}>Take a photo</T>
                </Press>
                <Press
                    onPress={f.pick}
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 7 }}
                >
                    <Glyph name="image-outline" size={16} color={t.fg2} />
                    <T w={600} s={12.5} c={t.fg}>{f.pickLabel}</T>
                </Press>
            </Row>

            {f.hasError ? (
                <Row gap={8} align="flex-start" style={{ marginBottom: 11, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 13, backgroundColor: t.csoft }}>
                    <Glyph name="alert-circle" size={15} color={t.coral} />
                    <T w={500} s={12.5} lh={1.45} c={t.coral} style={{ flex: 1 }}>{f.error}</T>
                </Row>
            ) : null}

            <Press
                onPress={f.submit}
                disabled={!f.canSubmit}
                style={{
                    paddingVertical: 15,
                    borderRadius: 999,
                    backgroundColor: f.canSubmit ? t.lime : t.ink3,
                    borderWidth: 1,
                    borderColor: f.canSubmit ? t.lime : t.line,
                    alignItems: 'center'
                }}
            >
                <T w={700} s={14} c={f.canSubmit ? t.on : t.fg3}>{f.submitLabel}</T>
            </Press>

            {/* ── Leaving ─────────────────────────────────────────────── */}
            <View style={{ marginTop: 22 }}>
                <T w={400} s={12} lh={1.5} c={t.fg3} style={{ marginBottom: 11 }}>{d.continueLine}</T>
                <Press
                    onPress={d.continue}
                    disabled={!d.canContinue}
                    style={{
                        paddingVertical: 15,
                        borderRadius: 999,
                        backgroundColor: d.canContinue ? t.fg : t.ink3,
                        borderWidth: 1,
                        borderColor: d.canContinue ? t.fg : t.line,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        columnGap: 8
                    }}
                >
                    <T w={700} s={14} c={d.canContinue ? t.ink : t.fg3}>
                        {d.gate ? 'Continue to my portal' : 'Done'}
                    </T>
                    <Glyph name="arrow-forward" size={15} color={d.canContinue ? t.ink : t.fg3} />
                </Press>
            </View>
        </ScrollView>
    );
}
