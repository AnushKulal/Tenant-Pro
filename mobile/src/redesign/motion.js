// File: mobile/src/redesign/motion.js
// The design's motion, ported 1:1 from the prototype's CSS keyframes
// (TenantPro App.dc.html):
//   @keyframes tpup    { translateY(14px) opacity 0 -> translateY(0) opacity 1 }  .3s ease
//   @keyframes tpsheet { translateY(100%) -> translateY(0) }  .26s cubic-bezier(.2,.8,.2,1)
//   @keyframes tpwipe  { opacity 0 -> .5 -> 0 }               (theme-swap flash)
// CSS animations don't exist in RN, so these are the Animated equivalents with
// the same durations, easings and values. All use the native driver (transform/
// opacity only), so they run off the JS thread and stay smooth.
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

// CSS `ease` = cubic-bezier(.25,.1,.25,1); the sheet curve is given explicitly.
export const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);
export const EASE_SHEET = Easing.bezier(0.2, 0.8, 0.2, 1);

export const DUR = { up: 300, sheet: 260, wipe: 420 };

// `animation: tpup .3s ease both` — the screen-entrance rise+fade.
// Returns a style object to spread onto an Animated.View.
export function useEnter({ distance = 14, duration = DUR.up, delay = 0, enabled = true } = {}) {
    const t = useRef(new Animated.Value(enabled ? 0 : 1)).current;
    useEffect(() => {
        if (!enabled) return;
        const a = Animated.timing(t, { toValue: 1, duration, delay, easing: EASE, useNativeDriver: true });
        a.start();
        return () => a.stop();
    }, [t, duration, delay, enabled]);
    return {
        opacity: t,
        transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }]
    };
}

// `animation: tpsheet .26s cubic-bezier(.2,.8,.2,1) both` — bottom sheet slide-up.
// `height` is the sheet's travel distance (screen height is a safe upper bound).
export function useSheetIn({ height = 900, duration = DUR.sheet, enabled = true } = {}) {
    const t = useRef(new Animated.Value(enabled ? 0 : 1)).current;
    useEffect(() => {
        if (!enabled) return;
        const a = Animated.timing(t, { toValue: 1, duration, easing: EASE_SHEET, useNativeDriver: true });
        a.start();
        return () => a.stop();
    }, [t, duration, enabled]);
    return {
        transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }]
    };
}

// A sheet that slides BOTH ways, and a scrim that fades with it.
//
// The enter animation was already there; dismissing simply unmounted the sheet, so
// it vanished — motion in, nothing out, which reads as a glitch rather than a
// gesture. `open` drives the direction: false plays the reverse and calls
// `onClosed` when the last frame lands, which is what lets the caller keep the
// sheet mounted (and its content rendered) until the motion has actually finished.
//
// `replayKey` re-arms the entrance: several sheets share one host, and switching
// between them should slide the new one up rather than swap the contents in place.
export function useSheet({ height = 900, duration = DUR.sheet, open = true, replayKey = '', onClosed } = {}) {
    const t = useRef(new Animated.Value(open ? 1 : 0)).current;
    const closed = useRef(onClosed);
    closed.current = onClosed;

    useEffect(() => {
        // Snap back to off-screen so the new sheet rises rather than cross-fading.
        if (open) t.setValue(0);
    }, [replayKey, open, t]);

    useEffect(() => {
        const a = Animated.timing(t, {
            toValue: open ? 1 : 0,
            duration,
            easing: EASE_SHEET,
            useNativeDriver: true
        });
        a.start(({ finished }) => {
            // Only report a COMPLETED close: a run cut short by another change has
            // not dismissed anything, and unmounting there would drop a sheet the
            // user is still looking at.
            if (finished && !open && closed.current) closed.current();
        });
        return () => a.stop();
    }, [t, open, duration]);

    return {
        sheet: { transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }] },
        scrim: { opacity: t }
    };
}

// The scrim behind a sheet fades in over the same beat.
export function useFadeIn({ to = 1, duration = DUR.sheet, enabled = true } = {}) {
    const t = useRef(new Animated.Value(enabled ? 0 : to)).current;
    useEffect(() => {
        if (!enabled) return;
        const a = Animated.timing(t, { toValue: to, duration, easing: EASE_SHEET, useNativeDriver: true });
        a.start();
        return () => a.stop();
    }, [t, to, duration, enabled]);
    return { opacity: t };
}

// `@keyframes tpwipe {0%{opacity:0}35%{opacity:.5}100%{opacity:0}}` — the flash
// that covers a theme swap. Fires whenever `key` changes (the vm's `fx` flag).
export function useWipe(key, { duration = DUR.wipe } = {}) {
    const t = useRef(new Animated.Value(0)).current;
    const first = useRef(true);
    useEffect(() => {
        if (first.current) { first.current = false; return; }
        const a = Animated.sequence([
            Animated.timing(t, { toValue: 0.5, duration: Math.round(duration * 0.35), easing: EASE, useNativeDriver: true }),
            Animated.timing(t, { toValue: 0, duration: Math.round(duration * 0.65), easing: EASE, useNativeDriver: true })
        ]);
        a.start();
        return () => a.stop();
    }, [key, t, duration]);
    return { opacity: t };
}
