// File: mobile/src/redesign/PushTestCard.js
//
// "Did that notification actually arrive?"
//
// A push is the only thing this app does whose evidence is somewhere else — a phone
// lighting up in another room, possibly somebody else's. Every other feature can be
// checked by looking at a screen. Without this control the only way to find out whether
// delivery works is to stage a real event against a real tenant: declare a payment,
// give notice, raise a repair. That is a bad way to test, and a worse way to discover
// two weeks later that nothing has been arriving.
//
// The card's whole value is in refusing to be cheerful. It reports three separate
// things, because they have three different fixes:
//
//   · what this BINARY can do          — an OTA cannot add the native module
//   · who the send was aimed at        — reported even when delivery then failed
//   · what became of it                — "sent" only when something really was
//
// Shared by both Settings screens so the landlord's answer and the tenant's answer are
// worded and coloured by the same code. All the logic lives in the view-model; this is
// the drawing.

import React from 'react';
import { View } from 'react-native';
import { useT } from './ThemeContext';
import { T, Eyebrow, Row, Press, Field, IconChip } from './ui';

export default function PushTestCard({ pt }) {
    const t = useT();
    if (!pt) return null;

    // Green when something was delivered, amber when it went nowhere, red when the
    // server refused. Anything else is ordinary body text.
    const saidColour = { pos: t.pos, amber: t.amber, coral: t.coral }[pt.tone] || t.fg2;

    return (
        <View style={{ borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, padding: 18, marginBottom: 8 }}>
            <Row gap={10} style={{ marginBottom: 12 }}>
                <IconChip name="notifications-outline" size={15} color={t.accent} bg={t.vsoft} box={30} radius={10} />
                <Eyebrow s={10} ls={0.12} c={t.fg3} style={{ flex: 1 }}>NOTIFICATIONS</Eyebrow>
                {/* Said out loud, because "registered and working" and "nothing has
                    happened yet" look identical when neither is stated. */}
                {pt.ok ? <Eyebrow s={9} ls={0.06} c={t.pos}>THIS PHONE IS ON</Eyebrow> : null}
            </Row>

            {/* The device's own problem, above the button — no amount of sending fixes
                it, so offering the send first would be sending someone down a dead end. */}
            {pt.blocked ? (
                <View style={{ borderRadius: 14, backgroundColor: t.asoft, padding: 13, marginBottom: 12 }}>
                    <T w={400} s={12} lh={1.5} c={t.amber}>{pt.blocked}</T>
                </View>
            ) : null}

            {pt.asksPhone ? (
                <Field
                    label="PHONE NUMBER"
                    icon="call-outline"
                    value={pt.phone}
                    onChangeText={pt.setPhone}
                    placeholder="Blank for this phone"
                    keyboardType="phone-pad"
                    editable={!pt.busy}
                    maxLength={16}
                    style={{ marginBottom: 10 }}
                />
            ) : null}

            <T w={400} s={12} lh={1.5} c={t.fg3}>{pt.hint}</T>

            <Press
                onPress={pt.busy ? undefined : pt.send}
                disabled={pt.busy}
                style={{
                    width: '100%', marginTop: 14, paddingVertical: 13, borderRadius: 999,
                    borderWidth: 1, borderColor: pt.busy ? t.line : t.accent,
                    backgroundColor: pt.busy ? t.ink3 : t.vsoft, alignItems: 'center'
                }}
            >
                <T w={700} s={13} lh={1} c={pt.busy ? t.fg3 : t.accent}>{pt.label}</T>
            </Press>

            {/* Kept on the card rather than flashed in a toast: the answer runs to a
                couple of sentences and is usually worth reading twice. */}
            {pt.said ? (
                <T w={500} s={12} lh={1.5} c={saidColour} style={{ marginTop: 12 }}>{pt.said}</T>
            ) : null}
        </View>
    );
}
