// File: mobile/src/redesign/screens/AgreementScreen.js
// The tenant's rental agreement, generated from their tenancy.
//
// It is reachable only once the tenant has a room AND a recorded payment — see the
// `myDocs` gate in AppContext for why both are necessary. Every figure on this page
// is a column that already exists; nothing is invented, and a clause the backend
// has no answer for is omitted rather than filled with a plausible number.
//
// It also says what it is: a summary of recorded terms, not a stamped deed. Sharing
// it as a real file would need a native print/PDF module, which cannot arrive over
// the air — copying the text out does work today.
import React from 'react';
import { View, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, IconChip, Divider } from '../ui';

function Line({ item, t }) {
    return (
        <View style={{ paddingVertical: 13 }}>
            <Eyebrow s={9} ls={0.1} c={t.fg3}>{item.k}</Eyebrow>
            <T w={600} s={14.5} lh={1.3} style={{ marginTop: 6 }}>{item.v}</T>
            {item.sub ? (
                <T mono w={600} s={9} lh={1.4} ls={0.06} c={t.fg3} style={{ marginTop: 4 }}>{item.sub}</T>
            ) : null}
        </View>
    );
}

export default function AgreementScreen() {
    const vm = useVm();
    const t = useT();
    const a = vm.agreement;

    return (
        <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 22, paddingBottom: 34 }}
            showsVerticalScrollIndicator={false}
        >
            <Press
                onPress={a.back}
                style={{ width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}
            >
                <Glyph name="chevron-back" size={19} color={t.fg} />
            </Press>

            <IconChip name="document-text-outline" size={24} box={52} radius={17} bg={t.lsoft} color={t.accent} />

            <Eyebrow s={9} ls={0.14} c={t.fg3} style={{ marginTop: 20 }}>YOUR TENANCY</Eyebrow>
            <T w={700} s={28} lh={1.08} style={{ letterSpacing: -1.1, marginTop: 9 }}>{a.title}</T>
            <T w={500} s={13.5} lh={1.5} c={t.accent} style={{ marginTop: 8 }}>{a.subtitle}</T>

            <View style={{ marginTop: 20, borderRadius: 18, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, paddingVertical: 4, paddingHorizontal: 16 }}>
                {a.parties.map((x, i) => (
                    <View key={x.k}>
                        {i > 0 ? <Divider /> : null}
                        <Line item={x} t={t} />
                    </View>
                ))}
            </View>

            <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginTop: 24, marginBottom: 10 }}>TERMS</Eyebrow>
            <View style={{ borderRadius: 18, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, paddingVertical: 4, paddingHorizontal: 16 }}>
                {a.terms.map((x, i) => (
                    <View key={x.k}>
                        {i > 0 ? <Divider /> : null}
                        <Line item={x} t={t} />
                    </View>
                ))}
            </View>

            <Row gap={9} align="flex-start" style={{ marginTop: 18, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.asoft }}>
                <Glyph name="information-circle-outline" size={16} color={t.amber} />
                <T w={500} s={12} lh={1.5} c={t.amber} style={{ flex: 1 }}>{a.note}</T>
            </Row>

            <Press
                onPress={a.copy}
                style={{ marginTop: 18, paddingVertical: 15, borderRadius: 999, backgroundColor: t.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8 }}
            >
                <Glyph name="copy-outline" size={16} color={t.on} />
                <T w={700} s={14} c={t.on}>Copy the agreement</T>
            </Press>
        </ScrollView>
    );
}
