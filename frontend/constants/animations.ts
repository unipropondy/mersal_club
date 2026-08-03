/**
 * ★ Smart Club — Animation Presets ★
 *
 * Smooth, professional micro-animations inspired by Facebook / Instagram:
 *   - Spring entrances (natural bounce, no overshoot)
 *   - Fade + slide combos for screens / modals
 *   - Scale pulses for CTAs and notifications
 *   - Press feedback (like IG heart / FB reaction)
 *   - Skeleton shimmer timing
 *
 * Usage:
 *   import { useSpringFadeIn, usePressScale } from '@/constants/animations';
 *   const { opacity, translateY } = useSpringFadeIn();
 *   const { scale, onPressIn, onPressOut } = usePressScale();
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

// ── Timing constants ──────────────────────────────────────────────────────────
export const Duration = {
  instant:   80,
  fast:      150,
  normal:    250,
  moderate:  350,
  slow:      500,
  verySlow:  800,
};

export const Spring = {
  /** Snappy — button press, badge pop */
  snappy:    { tension: 200, friction: 18, useNativeDriver: true },
  /** Smooth — card entrance, modal open */
  smooth:    { tension: 60,  friction: 12, useNativeDriver: true },
  /** Gentle — drawer slide, tooltip */
  gentle:    { tension: 40,  friction: 10, useNativeDriver: true },
  /** Bouncy — success tick, notification */
  bouncy:    { tension: 120, friction: 8,  useNativeDriver: true },
  /** IG-style heart reaction */
  heart:     { tension: 300, friction: 10, useNativeDriver: true },
};

export const Eases = {
  /** iOS default decelerate */
  decelerate: Easing.out(Easing.cubic),
  /** Material design standard */
  standard:   Easing.bezier(0.4, 0, 0.2, 1),
  /** Entrance — starts slow, finishes fast */
  entrance:   Easing.out(Easing.back(1.2)),
  /** Exit — starts fast, finishes slow */
  exit:       Easing.in(Easing.cubic),
};

// ── Hook: Fade-in + slide-up on mount (FB/IG card entrance) ──────────────────
export function useSpringFadeIn(
  delay: number = 0,
  offsetY: number = 24,
) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(offsetY)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue:         1,
        duration:        Duration.slow,
        delay,
        easing:          Eases.decelerate,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        delay,
        ...Spring.smooth,
      }),
    ]).start();
  }, []);

  return { opacity, translateY };
}

// ── Hook: Fade-in only ────────────────────────────────────────────────────────
export function useFadeIn(delay: number = 0, duration: number = Duration.normal) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue:         1,
      duration,
      delay,
      easing:          Eases.decelerate,
      useNativeDriver: true,
    }).start();
  }, []);

  return opacity;
}

// ── Hook: Scale pop on mount (notification badge, success icon) ───────────────
export function useScalePop(delay: number = 0) {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      delay,
      ...Spring.bouncy,
    }).start();
  }, []);

  return scale;
}

// ── Hook: Press feedback (IG-style) ──────────────────────────────────────────
export function usePressScale(
  pressedScale: number = 0.93,
  duration:     number = Duration.fast,
) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.timing(scale, {
      toValue:         pressedScale,
      duration,
      easing:          Eases.standard,
      useNativeDriver: true,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      ...Spring.snappy,
    }).start();
  };

  return { scale, onPressIn, onPressOut };
}

// ── Hook: IG Heart double-tap pulse ──────────────────────────────────────────
export function useHeartPulse() {
  const scale   = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const pulse = () => {
    scale.setValue(0);
    opacity.setValue(1);

    Animated.sequence([
      Animated.spring(scale, { toValue: 1.4, ...Spring.heart }),
      Animated.spring(scale, { toValue: 1.0, ...Spring.snappy }),
      Animated.delay(400),
      Animated.timing(opacity, {
        toValue:         0,
        duration:        Duration.normal,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return { scale, opacity, pulse };
}

// ── Hook: Shimmer skeleton loader ─────────────────────────────────────────────
export function useShimmer() {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue:         1,
          duration:        1000,
          easing:          Eases.standard,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue:         0,
          duration:        1000,
          easing:          Eases.standard,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const opacity = shimmer.interpolate({
    inputRange:  [0, 1],
    outputRange: [0.3, 0.7],
  });

  return opacity;
}

// ── Hook: Slide in from right (screen transition) ─────────────────────────────
export function useSlideInRight(screenWidth: number = 400) {
  const translateX = useRef(new Animated.Value(screenWidth)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue:         1,
        duration:        Duration.normal,
        easing:          Eases.decelerate,
        useNativeDriver: true,
      }),
      Animated.spring(translateX, {
        toValue: 0,
        ...Spring.smooth,
      }),
    ]).start();
  }, []);

  return { translateX, opacity };
}

// ── Hook: Stagger children entrance (like FB feed loading) ────────────────────
export function useStaggeredFadeIn(
  count:     number,
  stagger:   number = 60,
  baseDelay: number = 0,
) {
  const anims = useRef(
    Array.from({ length: count }, () => ({
      opacity:    new Animated.Value(0),
      translateY: new Animated.Value(20),
    })),
  ).current;

  useEffect(() => {
    const animations = anims.flatMap((anim, i) => [
      Animated.timing(anim.opacity, {
        toValue:         1,
        duration:        Duration.slow,
        delay:           baseDelay + i * stagger,
        easing:          Eases.decelerate,
        useNativeDriver: true,
      }),
      Animated.spring(anim.translateY, {
        toValue: 0,
        delay:   baseDelay + i * stagger,
        ...Spring.smooth,
      }),
    ]);

    Animated.parallel(animations).start();
  }, [count]);

  return anims;
}

// ── Utility: Create a looping glow pulse for active elements ──────────────────
export function createGlowPulse(anim: Animated.Value) {
  return Animated.loop(
    Animated.sequence([
      Animated.timing(anim, {
        toValue:         1,
        duration:        1500,
        easing:          Eases.standard,
        useNativeDriver: true,
      }),
      Animated.timing(anim, {
        toValue:         0.4,
        duration:        1500,
        easing:          Eases.standard,
        useNativeDriver: true,
      }),
    ]),
  );
}
