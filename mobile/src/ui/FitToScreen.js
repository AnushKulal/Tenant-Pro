// File: mobile/src/ui/FitToScreen.js
// Makes a screen's content FIT the viewport instead of scrolling. A login form that
// scrolls is confusing — the whole thing should be visible at once on any phone.
//
// How: measure the available height and the content's natural height. If the content
// is taller, scale it down (uniformly, capped at a floor) so it fits; if it fits,
// leave it at full size, centred. Because a transform never changes layout, the
// measured content height is always the natural one, so there is no feedback loop.
//
// The keyboard is handled for free: wrapped in a KeyboardAvoidingView, the available
// height shrinks when the keyboard opens, the content scales down to stay above it,
// and nothing is hidden.
//
// Last resort only: if the content is so tall that even the floor scale would
// overflow (a very small device with the tallest form and the keyboard up), it falls
// back to a ScrollView so fields are reachable rather than clipped. On normal phones
// that branch never runs — the form simply fits.
import React, { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';

export default function FitToScreen({
    children,
    minScale = 0.72,     // don't shrink past this; below it, scroll instead of clip
    style
}) {
    const [avail, setAvail] = useState(0);
    const [content, setContent] = useState(0);

    const rawScale = content && avail ? avail / content : 1;
    const scale = Math.min(1, Math.max(minScale, rawScale));

    // Only true once both heights are known AND the content genuinely can't fit even
    // at the floor scale. Until measured, avail/content are 0 and this stays false,
    // so the measuring (scaled) branch always renders first.
    const mustScroll = content > 0 && avail > 0 && content * minScale > avail + 0.5;

    if (mustScroll) {
        return (
            <ScrollView
                style={styles.flex}
                contentContainerStyle={[styles.center, style]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {children}
            </ScrollView>
        );
    }

    return (
        <View
            style={[styles.flex, styles.centerFixed, style]}
            onLayout={(e) => setAvail(e.nativeEvent.layout.height)}
        >
            <View
                onLayout={(e) => setContent(e.nativeEvent.layout.height)}
                style={[styles.full, { transform: [{ scale }] }]}
            >
                {children}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    center: { flexGrow: 1, justifyContent: 'center' },
    centerFixed: { justifyContent: 'center' },
    full: { width: '100%' }
});
