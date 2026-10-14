import { useId } from 'react';
import type { CropId } from '../game/config';

/** Hand-drawn vector icons in a chunky cartoon style (thick outline, gradients). */

const OUT = '#5a3214';
type P = { size?: number; className?: string };

function Svg({ size = 48, className, children }: P & { children: React.ReactNode }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" fill="none" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      {children}
    </svg>
  );
}

export function CarrotIcon(p: P) {
  const id = useId();
  return (
    <Svg {...p}>
      <defs>
        <linearGradient id={`${id}o`} x1="20" y1="20" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffb347" />
          <stop offset="1" stopColor="#f2660f" />
        </linearGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#8fe05a" />
          <stop offset="1" stopColor="#3f9a2a" />
        </linearGradient>
      </defs>
      <path d="M40 19C38 9 43 4 48 5c-1 5-2 9-4 14z" fill={`url(#${id}g)`} stroke={OUT} strokeWidth="2.5" />
      <path d="M43 21c5-8 13-9 16-5-5 2-9 4-13 8z" fill={`url(#${id}g)`} stroke={OUT} strokeWidth="2.5" />
      <path d="M40 20c-4-8-10-10-13-8 3 3 6 6 9 10z" fill={`url(#${id}g)`} stroke={OUT} strokeWidth="2.5" />
      <path d="M40 17c9 3 10 13 4 18L17 55c-4 3-9-1-6-6L33 21c2-3 4-5 7-4z" fill={`url(#${id}o)`} stroke={OUT} strokeWidth="3" />
      <path d="M27 33l5 3M22 41l4 2M33 26l4 3" stroke="#c94e06" strokeWidth="2.2" />
      <path d="M35 22c-5 6-11 15-17 25" stroke="#fff" strokeOpacity=".55" strokeWidth="2.5" />
    </Svg>
  );
}

export function WheatIcon(p: P) {
  const id = useId();
  const ear = (x: number, y: number, rot: number) => (
    <g transform={`rotate(${rot} ${x} ${y})`}>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <ellipse cx={x - 3.2} cy={y + i * 5.2} rx="3" ry="4.4" fill={`url(#${id}w)`} stroke={OUT} strokeWidth="1.8" transform={`rotate(-25 ${x - 3.2} ${y + i * 5.2})`} />
          <ellipse cx={x + 3.2} cy={y + i * 5.2} rx="3" ry="4.4" fill={`url(#${id}w)`} stroke={OUT} strokeWidth="1.8" transform={`rotate(25 ${x + 3.2} ${y + i * 5.2})`} />
        </g>
      ))}
      <ellipse cx={x} cy={y - 3.5} rx="2.8" ry="4.4" fill={`url(#${id}w)`} stroke={OUT} strokeWidth="1.8" />
    </g>
  );
  return (
    <Svg {...p}>
      <defs>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#ffe27a" />
          <stop offset="1" stopColor="#e2a020" />
        </linearGradient>
      </defs>
      <path d="M32 60V30M32 60L20 30M32 60l12-30" stroke={OUT} strokeWidth="5" />
      <path d="M32 60V30M32 60L20 30M32 60l12-30" stroke="#e8b84a" strokeWidth="2.6" />
      {ear(19, 12, -20)}
      {ear(32, 8, 0)}
      {ear(45, 12, 20)}
      <rect x="24" y="43" width="16" height="7" rx="3" fill="#c0392b" stroke={OUT} strokeWidth="2.4" />
    </Svg>
  );
}

export function TomatoIcon(p: P) {
  const id = useId();
  return (
    <Svg {...p}>
      <defs>
        <radialGradient id={`${id}r`} cx="0.38" cy="0.35" r="0.75">
          <stop stopColor="#ff8a6a" />
          <stop offset=".45" stopColor="#f2382b" />
          <stop offset="1" stopColor="#b51e17" />
        </radialGradient>
      </defs>
      <path d="M32 18c13 0 23 8 23 20S45 58 32 58 9 50 9 38s10-20 23-20z" fill={`url(#${id}r)`} stroke={OUT} strokeWidth="3" />
      <path d="M19 30c2-4 6-6 10-6" stroke="#fff" strokeOpacity=".7" strokeWidth="3.5" />
      <path d="M32 21l-5-6 7 3 4-7 1 8 8-2-6 6 7 3-9 1-3 6-2-6-9 2 6-5z" fill="#5cb83a" stroke={OUT} strokeWidth="2.2" />
      <path d="M33 14c0-4 2-7 5-8" stroke={OUT} strokeWidth="3" />
    </Svg>
  );
}

export function CoinIcon(p: P) {
  const id = useId();
  return (
    <Svg {...p}>
      <defs>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#ffe680" />
          <stop offset="1" stopColor="#f0a818" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="34" r="25" fill="#c77b0a" stroke={OUT} strokeWidth="3" />
      <circle cx="32" cy="31" r="25" fill={`url(#${id}c)`} stroke={OUT} strokeWidth="3" />
      <circle cx="32" cy="31" r="18" fill="none" stroke="#d98a10" strokeWidth="2.5" />
      <path d="M32 18l3.8 8 8.7 1-6.4 6 1.7 8.6L32 37.4 24.2 41.6l1.7-8.6-6.4-6 8.7-1z" fill="#fff3b0" stroke="#d98a10" strokeWidth="2" />
      <path d="M17 22c3-5 8-8 14-8" stroke="#fff" strokeOpacity=".8" strokeWidth="3" />
    </Svg>
  );
}

export function SeedBagIcon(p: P) {
  const id = useId();
  return (
    <Svg {...p}>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#f1d199" />
          <stop offset="1" stopColor="#c9975a" />
        </linearGradient>
      </defs>
      <path d="M22 18c-9 8-14 20-12 31 1 7 9 10 22 10s21-3 22-10c2-11-3-23-12-31z" fill={`url(#${id}b)`} stroke={OUT} strokeWidth="3" />
      <path d="M21 18c3-6 6-9 11-9s8 3 11 9" fill="#e6bf85" stroke={OUT} strokeWidth="3" />
      <path d="M20 19h24" stroke="#c0392b" strokeWidth="5" />
      <path d="M20 19h24" stroke={OUT} strokeWidth="1.5" strokeOpacity=".4" />
      <circle cx="32" cy="40" r="10" fill="#fff6dc" stroke={OUT} strokeWidth="2.4" />
      <path d="M32 46v-7" stroke="#3f9a2a" strokeWidth="2.6" />
      <path d="M32 40c-1-4-4-6-7-5 1 3 4 5 7 5zM32 39c1-4 4-6 7-5-1 3-4 5-7 5z" fill="#6fcf3f" stroke="#2f7a1f" strokeWidth="1.6" />
    </Svg>
  );
}

export function BarnIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M8 30L32 10l24 20v26H8z" fill="#e2483a" stroke={OUT} strokeWidth="3" />
      <path d="M5 31L32 8l27 23" stroke="#5b6e8c" strokeWidth="7" />
      <path d="M5 31L32 8l27 23" stroke={OUT} strokeWidth="2" strokeOpacity=".35" />
      <rect x="20" y="34" width="24" height="22" fill="#9a3a26" stroke="#fff6e6" strokeWidth="3" />
      <path d="M20 34l24 22M44 34L20 56" stroke="#fff6e6" strokeWidth="3" />
      <rect x="27" y="20" width="10" height="8" fill="#4a2a1d" stroke="#fff6e6" strokeWidth="2.5" />
      <path d="M8 56h48" stroke={OUT} strokeWidth="3" />
    </Svg>
  );
}

export function LockIcon(p: P) {
  const id = useId();
  return (
    <Svg {...p}>
      <defs>
        <linearGradient id={`${id}l`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#ffd75e" />
          <stop offset="1" stopColor="#e09412" />
        </linearGradient>
      </defs>
      <path d="M20 30v-8a12 12 0 0124 0v8" stroke={OUT} strokeWidth="9" />
      <path d="M20 30v-8a12 12 0 0124 0v8" stroke="#b9c3cc" strokeWidth="5" />
      <rect x="12" y="28" width="40" height="30" rx="7" fill={`url(#${id}l)`} stroke={OUT} strokeWidth="3" />
      <circle cx="32" cy="41" r="4" fill={OUT} />
      <path d="M32 43v7" stroke={OUT} strokeWidth="3.5" />
    </Svg>
  );
}

export function GearIcon(p: P) {
  return (
    <Svg {...p}>
      <path
        d="M28 6h8l1.5 7 5 2.2 6-4 5.7 5.7-4 6 2.1 5 7 1.6v8l-7 1.5-2.1 5 4 6-5.7 5.7-6-4-5 2.1L36 58h-8l-1.5-7-5-2.1-6 4-5.7-5.7 4-6-2.1-5L6 36v-8l7-1.5 2.1-5-4-6 5.7-5.7 6 4 5-2.1z"
        fill="#d9e1e8"
        stroke={OUT}
        strokeWidth="3"
      />
      <circle cx="32" cy="32" r="9" fill="#8a97a3" stroke={OUT} strokeWidth="3" />
    </Svg>
  );
}

export function SickleIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M14 52l12-12" stroke={OUT} strokeWidth="10" />
      <path d="M14 52l12-12" stroke="#b77a45" strokeWidth="6" />
      <path d="M26 40C16 26 24 8 44 8c8 0 13 5 13 10-9-6-25-2-27 18z" fill="#dfe7ee" stroke={OUT} strokeWidth="3" />
      <path d="M33 15c5-3 12-3 17 0" stroke="#fff" strokeWidth="2.5" />
    </Svg>
  );
}

export function ClockIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="32" cy="34" r="22" fill="#fff" stroke={OUT} strokeWidth="4" />
      <path d="M32 22v12l8 5" stroke={OUT} strokeWidth="4" />
      <path d="M26 8h12" stroke={OUT} strokeWidth="5" />
    </Svg>
  );
}

export function SproutIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M32 58V32" stroke={OUT} strokeWidth="6" />
      <path d="M32 58V32" stroke="#4f9f2c" strokeWidth="3" />
      <path d="M32 34C30 22 20 15 9 17c1 11 11 18 23 17z" fill="#7fd04a" stroke={OUT} strokeWidth="3" />
      <path d="M32 30c2-12 12-19 23-17-1 11-11 18-23 17z" fill="#9ee05a" stroke={OUT} strokeWidth="3" />
      <ellipse cx="32" cy="58" rx="16" ry="4" fill="#8a5a35" stroke={OUT} strokeWidth="2.5" />
    </Svg>
  );
}

export function SoundIcon({ on, ...p }: P & { on: boolean }) {
  return (
    <Svg {...p}>
      <path d="M10 25h10l14-11v36L20 39H10z" fill="#ffd75e" stroke={OUT} strokeWidth="3.5" />
      {on ? (
        <path d="M42 22c4 5 4 15 0 20M48 16c8 9 8 23 0 32" stroke={OUT} strokeWidth="4" />
      ) : (
        <path d="M42 24l14 16M56 24L42 40" stroke="#e2483a" strokeWidth="5" />
      )}
    </Svg>
  );
}

export function CloseIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M18 18l28 28M46 18L18 46" stroke="#fff" strokeWidth="9" />
    </Svg>
  );
}

export function StarIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M32 6l7.6 16 17.4 2.2-12.8 12 3.3 17.3L32 45l-15.5 8.5L19.8 36 7 24.2 24.4 22z" fill="#ffd75e" stroke={OUT} strokeWidth="3" />
    </Svg>
  );
}

export function CropIcon({ crop, ...p }: P & { crop: CropId }) {
  if (crop === 'carrot') return <CarrotIcon {...p} />;
  if (crop === 'wheat') return <WheatIcon {...p} />;
  return <TomatoIcon {...p} />;
}
