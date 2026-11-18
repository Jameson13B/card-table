import { useCallback, useEffect, useRef, useState } from 'react';

// Phones/tablets: tilt the held card by tilting the device.
//
// - Browsers only expose motion on HTTPS pages (not plain http on a LAN IP).
// - iOS Safari also needs an explicit permission tap (DeviceOrientationEvent.requestPermission),
//   which must come from a user gesture, so we expose `request` for a button.
// - Android Chrome fires events without asking.

type IOSOrientationEvent = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

let permission: 'unknown' | 'granted' | 'denied' = 'unknown';

const RANGE = 22; // degrees of device tilt (from where you started) that maps to the card's full tilt

function isTouchDevice() {
  return matchMedia('(hover: none) and (pointer: coarse)').matches;
}

export function deviceTiltSupported(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && 'DeviceOrientationEvent' in window && isTouchDevice();
}

function needsPermissionPrompt(): boolean {
  const DOE = window.DeviceOrientationEvent as IOSOrientationEvent;
  return typeof DOE?.requestPermission === 'function' && permission !== 'granted';
}

/** Rotate the raw beta/gamma readings so "left/right" matches the screen in landscape too. */
function screenAxes(beta: number, gamma: number): [number, number] {
  const angle = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number;
  switch (((angle % 360) + 360) % 360) {
    case 90:
      return [beta, -gamma];
    case 270:
      return [-beta, gamma];
    case 180:
      return [-gamma, -beta];
    default:
      return [gamma, beta];
  }
}

/**
 * Calls `onTilt(px, py, strength)` with px/py in 0..1 (0.5 = centered, same as a pointer
 * position over the card) and strength 0..1 for the glare.
 */
export function useDeviceTilt(enabled: boolean, onTilt: (px: number, py: number, strength: number) => void) {
  const supported = enabled && deviceTiltSupported();
  const [needsTap, setNeedsTap] = useState(() => supported && needsPermissionPrompt());
  const [active, setActive] = useState(() => supported && !needsPermissionPrompt() && permission !== 'denied');
  const cb = useRef(onTilt);
  cb.current = onTilt;

  useEffect(() => {
    if (!active) return;
    let base: [number, number] | null = null;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      const [x, y] = screenAxes(e.beta, e.gamma);
      if (!base) base = [x, y];
      // Slowly re-center on however they're holding the phone now.
      base = [base[0] + (x - base[0]) * 0.015, base[1] + (y - base[1]) * 0.015];
      const dx = Math.max(-RANGE, Math.min(RANGE, x - base[0]));
      const dy = Math.max(-RANGE, Math.min(RANGE, y - base[1]));
      const strength = Math.min(1, Math.hypot(dx, dy) / (RANGE * 0.45));
      cb.current(0.5 + dx / (RANGE * 2), 0.5 + dy / (RANGE * 2), strength);
    };
    window.addEventListener('deviceorientation', onOrient);
    return () => window.removeEventListener('deviceorientation', onOrient);
  }, [active]);

  /** Must be called from a tap/click handler (iOS rule). */
  const request = useCallback(async () => {
    const DOE = window.DeviceOrientationEvent as IOSOrientationEvent;
    try {
      permission = (await DOE.requestPermission?.()) ?? 'granted';
    } catch {
      permission = 'denied';
    }
    setNeedsTap(false);
    setActive(permission === 'granted');
  }, []);

  return { needsTap, active, request };
}
