// File: mobile/src/redesign/motion.js
// The design's motion, ported 1:1 from the prototype's CSS keyframes
// (TenantPro App.dc.html):
//   @keyframes tpup    { translateY(14px) opacity 0 -> translateY(0) opacity 1 }  .3s ease
//   @keyframes tpsheet { translateY(100%) -> translateY(0) }  .26s cubic-bezier(.2,.8,.2,1)
//   @keyframes tpwipe  { opacity 0 -> .5 -> 0 }               (theme-swap flash)
// CSS animations don't exist in RN, so these are the Animated equivalents with
// the same durations, easings and values. All use the native driver (transform/
// opacity only), so they run off the JS thread and stay smooth.
import React, { useEffect, useRef } from 'react';
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

// ── Additions for the discovery work ─────────────────────────────────────────
// Everything below is still transform + opacity only, so it keeps running on the
// native driver. Nothing here needs a native module, which matters because the
// whole point of staying inside Animated is that these ship over the air.

// A list that assembles instead of appearing. Each child rises on the same curve
// as a screen entrance, offset by its position.
//
// The delay is CAPPED. Uncapped, the twentieth card waits two fifths of a second
// after the first, by which time the person has already scrolled past it and sees
// an empty row animating in behind their thumb. Past the cap everything arrives
// together, which nobody notices because it is below the fold.
export function useStagger(index = 0, { step = 28, cap = 10, distance = 10, duration = 260 } = {}) {
    return useEnter({ distance, duration, delay: Math.min(index, cap) * step });
}

export function Stagger({ index = 0, children, style, ...rest }) {
    const s = useStagger(index, rest);
    return <Animated.View style={[style, s]}>{children}</Animated.View>;
}

// Press feedback: the thing you touched gets smaller while your finger is down.
//
// Worth having because this app routes by state rather than by a navigator, so a
// tap that opens a sheet or changes a screen has no system-provided "something
// happened" of its own. Spring rather than timing: a press that eases back looks
// mechanical, one that settles looks like it was pushed.
export function usePress({ to = 0.97 } = {}) {
    const v = useRef(new Animated.Value(1)).current;
    const spring = (toValue) =>
        Animated.spring(v, { toValue, useNativeDriver: true, speed: 42, bounciness: 5 }).start();
    return {
        style: { transform: [{ scale: v }] },
        onPressIn: () => spring(to),
        onPressOut: () => spring(1)
    };
}

// `usePress` wrapped around whatever is inside it, so a caller can add the feel
// without rewriting a Press into an Animated.View by hand.
//
// It clones its child to attach the handlers rather than wrapping it in another
// touchable: two nested touchables means the outer one swallows presses meant for
// the inner, which is how a button stops working.
export function Pop({ children, to = 0.97, style }) {
    const p = usePress({ to });
    const child = React.Children.only(children);
    return (
        <Animated.View style={[style, p.style]}>
            {React.cloneElement(child, {
                onPressIn: (e) => { p.onPressIn(); if (child.props.onPressIn) child.props.onPressIn(e); },
                onPressOut: (e) => { p.onPressOut(); if (child.props.onPressOut) child.props.onPressOut(e); }
            })}
        </Animated.View>
    );
}

// A number that counts up to its value instead of snapping to it.
//
// Used where a figure changes under the user — a result count that drops from 22
// to 3 as a filter is applied. The jump is the only evidence the filter did
// anything, and a jump is easy to miss.
export function useCountUp(value, { duration = 420 } = {}) {
    const [shown, setShown] = React.useState(value);
    const from = useRef(value);
    useEffect(() => {
        const start = from.current;
        if (start === value) return;
        const began = Date.now();
        const id = setInterval(() => {
            const k = Math.min(1, (Date.now() - began) / duration);
            // ease-out, so it decelerates into the final figure rather than
            // stopping dead on it
            const eased = 1 - (1 - k) ** 3;
            setShown(Math.round(start + (value - start) * eased));
            if (k >= 1) { clearInterval(id); from.current = value; }
        }, 16);
        return () => { clearInterval(id); from.current = value; };
    }, [value, duration]);
    return shown;
}
