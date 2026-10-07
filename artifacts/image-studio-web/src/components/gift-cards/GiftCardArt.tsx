import { useEffect, useMemo, useRef, type PointerEvent, type ReactNode } from 'react';
import type { GiftCardThemeKey } from '@shared/gift-card-types';
import { GIFT_CARD_AMBIENT, GIFT_CARD_THEMES, giftCardThemeVars } from './giftCardThemes';
import './gift-cards.css';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** Generatore pseudo-casuale deterministico: la stessa card ha sempre gli stessi decori. */
function createRng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pct = (value: number) => `${value.toFixed(1)}%`;

const HEART_PATH =
  'M12 21s-7-4.6-9.3-9C1 8.6 3.2 5 6.6 5c2 0 3.5 1 5.4 3 1.9-2 3.4-3 5.4-3 3.4 0 5.6 3.6 3.9 7C19 16.4 12 21 12 21z';
const EGG_PATH = 'M12 2C7 2 4 10 4 14a8 8 0 0 0 16 0C20 10 17 2 12 2z';

export function GiftCardGlyph({ theme }: { theme: GiftCardThemeKey }) {
  switch (theme) {
    case 'natale':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <text x="12" y="16.5" textAnchor="middle" fontFamily="Playfair Display,serif" fontStyle="italic" fontSize="13" fill="currentColor">IS</text>
        </svg>
      );
    case 'carnevale':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 11c0-3.5 4-6 9-6s9 2.5 9 6c0 3-2.4 5-5 5-1.8 0-2.2-1.2-4-1.2S8.8 16 7 16c-2.6 0-4-2-4-5z" fill="currentColor" />
          <ellipse cx="8.2" cy="10.8" rx="2" ry="1.2" fill="var(--gk-seal)" />
          <ellipse cx="15.8" cy="10.8" rx="2" ry="1.2" fill="var(--gk-seal)" />
        </svg>
      );
    case 'san-valentino':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={HEART_PATH} fill="currentColor" />
        </svg>
      );
    case 'pasqua':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={EGG_PATH} fill="currentColor" />
          <polyline points="5,13.5 7.4,11.5 9.8,13.5 12.2,11.5 14.6,13.5 17,11.5 19,13" fill="none" stroke="var(--gk-seal)" strokeWidth="1.2" />
        </svg>
      );
    case 'halloween':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="12" cy="12" r="2.6" fill="currentColor" />
        </svg>
      );
  }
}

export function GiftCardDecor({ theme }: { theme: GiftCardThemeKey }) {
  const nodes = useMemo<ReactNode[]>(() => {
    const rng = createRng(theme.split('').reduce((sum, char) => sum + char.charCodeAt(0), 7));
    const between = (min: number, max: number) => min + rng() * (max - min);
    const items: ReactNode[] = [];
    const push = (node: ReactNode) => items.push(node);

    if (theme === 'natale') {
      for (let i = 0; i < 44; i++) {
        const size = between(0.8, 2.6);
        push(<i key={`d${i}`} className="gcx-dot" style={{ left: pct(between(0, 100)), top: pct(between(0, 72)), width: size, height: size, opacity: between(0.25, 0.85) }} />);
      }
      for (let i = 0; i < 5; i++) {
        const size = between(22, 60);
        push(<i key={`b${i}`} className="gcx-bokeh" style={{ left: pct(between(-5, 95)), top: pct(between(55, 100)), width: size, height: size, background: `rgba(246,227,160,${between(0.06, 0.2).toFixed(2)})` }} />);
      }
      push(
        <svg key="fir" className="gcx-fir" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
          {[8, 24, 41, 58, 76, 92].map((x, i) => {
            const h = 22 + ((i * 7) % 11);
            const w = 7 + (i % 3) * 1.5;
            return (
              <g key={x}>
                <polygon points={`${x},${40 - h - 6} ${x - w},${40 - h * 0.35} ${x + w},${40 - h * 0.35}`} />
                <polygon points={`${x},${40 - h + 4} ${x - w * 1.35},${40 - h * 0.05} ${x + w * 1.35},${40 - h * 0.05}`} />
              </g>
            );
          })}
          <rect x="0" y="34" width="100" height="6" />
        </svg>,
      );
    } else if (theme === 'carnevale') {
      const colors = ['#FF8A3D', '#F7B731', '#FF4F8B', '#3DD6C6', '#B07CFF'];
      for (let i = 0; i < 40; i++) {
        push(<i key={`c${i}`} className="gcx-conf" style={{ left: pct(between(0, 100)), top: pct(between(0, 100)), width: Math.round(between(3, 7)), height: Math.round(between(6, 13)), background: colors[i % 5], transform: `rotate(${between(0, 180).toFixed(0)}deg)`, opacity: between(0.5, 0.95) }} />);
      }
      push(
        <svg key="ser" className="gcx-ser" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
          <path d="M-5 14C12 -6 24 34 44 12S78 -4 106 18" />
          <path className="gcx-ser-b" d="M-5 48C16 30 30 66 52 46S84 30 106 50" />
        </svg>,
      );
    } else if (theme === 'san-valentino') {
      for (let i = 0; i < 30; i++) {
        const size = Math.round(between(7, 25));
        push(
          <svg key={`h${i}`} className="gcx-hrt" viewBox="0 0 24 24" aria-hidden="true" style={{ left: pct(between(-3, 97)), top: pct(between(-3, 97)), width: size, height: size, opacity: between(0.08, 0.38), transform: `rotate(${between(-30, 30).toFixed(0)}deg)` }}>
            <path d={HEART_PATH} />
          </svg>,
        );
      }
      push(<i key="glow" className="gcx-glow" style={{ right: '-20%', top: '-15%', width: '80%', height: '60%', background: 'radial-gradient(closest-side,rgba(255,120,150,.38),transparent)' }} />);
    } else if (theme === 'pasqua') {
      push(<i key="b1" className="gcx-blob" style={{ left: '-15%', top: '-10%', width: '70%', height: '50%', background: 'radial-gradient(closest-side,rgba(183,156,232,.55),transparent)' }} />);
      push(<i key="b2" className="gcx-blob" style={{ right: '-20%', top: '25%', width: '75%', height: '50%', background: 'radial-gradient(closest-side,rgba(246,214,107,.5),transparent)' }} />);
      push(<i key="b3" className="gcx-blob" style={{ left: '5%', bottom: '-15%', width: '80%', height: '45%', background: 'radial-gradient(closest-side,rgba(140,210,170,.5),transparent)' }} />);
      const eggColors = ['#F6D66B', '#B79CE8', '#8CD2AA'];
      ([[8, 62, 26, -14], [68, 70, 22, 12], [40, 78, 18, 6]] as const).forEach(([x, y, size, rotation], i) => {
        push(
          <svg key={`e${i}`} viewBox="0 0 24 24" aria-hidden="true" style={{ left: `${x}%`, top: `${y}%`, width: size * 1.6, transform: `rotate(${rotation}deg)` }}>
            <path d={EGG_PATH} fill={eggColors[i]} />
            <polyline points="4.6,13 7,11 9.4,13 11.8,11 14.2,13 16.6,11 19.4,13" fill="none" stroke="#fff" strokeWidth="1.1" />
          </svg>,
        );
      });
    } else if (theme === 'halloween') {
      push(<i key="moon" className="gcx-moon" />);
      for (let i = 0; i < 18; i++) {
        const size = between(0.8, 2.4);
        push(<i key={`s${i}`} className="gcx-dot" style={{ left: pct(between(0, 100)), top: pct(between(0, 60)), width: size, height: size, opacity: between(0.2, 0.7) }} />);
      }
      ([[10, 18, 34, -8], [30, 38, 24, 10], [72, 52, 28, -4]] as const).forEach(([x, y, size, rotation], i) => {
        push(
          <svg key={`bat${i}`} className="gcx-bat" viewBox="0 0 24 14" aria-hidden="true" style={{ left: `${x}%`, top: `${y}%`, width: size, transform: `rotate(${rotation}deg)` }}>
            <path d="M12 5C10 1 6 0 2 2c2 1 2.5 3 2 5 2-1 4-.5 5 1 1-1 2-1 3 0 1-1 2-1 3 0 1-1.5 3-2 5-1-.5-2 0-4 2-5-4-2-8-1-10 3z" />
          </svg>,
        );
      });
      push(<i key="fog" className="gcx-fog" />);
    } else {
      push(<i key="g1" className="gcx-glow" style={{ left: '-25%', top: '-20%', width: '90%', height: '70%', background: 'radial-gradient(closest-side,rgba(127,163,146,.35),transparent)' }} />);
      push(<i key="g2" className="gcx-glow" style={{ right: '-30%', bottom: '-25%', width: '90%', height: '70%', background: 'radial-gradient(closest-side,rgba(220,196,138,.25),transparent)' }} />);
      [60, 92, 124].forEach(width => {
        push(<i key={`r${width}`} className="gcx-ring" style={{ left: '50%', top: '46%', width: `${width}%`, aspectRatio: '1', transform: 'translate(-50%,-50%)' }} />);
      });
    }
    return items;
  }, [theme]);

  return <div className="gcx-decor" aria-hidden="true">{nodes}</div>;
}

/** Inclinazione e riflesso che seguono il puntatore. */
function useTilt() {
  const ref = useRef<HTMLDivElement>(null);
  return {
    ref,
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const el = ref.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      el.style.setProperty('--mx', `${x * 100}%`);
      el.style.setProperty('--my', `${y * 100}%`);
      el.classList.add('gcx-lit');
      if (!prefersReducedMotion()) {
        el.style.transform = `perspective(800px) rotateY(${(x - 0.5) * 9}deg) rotateX(${(0.5 - y) * 9}deg)`;
      }
    },
    onPointerLeave() {
      const el = ref.current;
      if (!el) return;
      el.style.transform = '';
      el.classList.remove('gcx-lit');
    },
  };
}

/** Data come 20.12.2026, nel fuso orario dello studio. */
export function formatCardDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(date)
    .replace(/\//g, '.');
}

export function GiftCardSeal({ theme, size }: { theme: GiftCardThemeKey; size?: number }) {
  return (
    <span className="gcx-seal" style={size ? { width: size, height: size } : undefined} aria-hidden="true">
      <GiftCardGlyph theme={theme} />
    </span>
  );
}

export function GiftCardMini({ theme, name, small, kicker = 'Gift card' }: { theme: GiftCardThemeKey; name?: string; small?: string; kicker?: string }) {
  const tilt = useTilt();
  const style = GIFT_CARD_THEMES[theme];
  return (
    <div ref={tilt.ref} className="gcx gcx-mini" style={giftCardThemeVars(theme)} onPointerMove={tilt.onPointerMove} onPointerLeave={tilt.onPointerLeave}>
      <GiftCardDecor theme={theme} />
      <div className="gcx-frame" />
      <div className="gcx-body">
        <div className="gcx-eyebrow">Image Studio</div>
        <div className="gcx-mid">
          <div className="gcx-kick">{kicker}</div>
          <div className="gcx-name">{name || style.name}</div>
          {small ? <div className="gcx-small">{small}</div> : null}
        </div>
        <GiftCardSeal theme={theme} />
      </div>
      <div className="gcx-shine" />
    </div>
  );
}

export interface GiftCardFullProps {
  theme: GiftCardThemeKey;
  title: string;
  line2?: string;
  recipientName?: string;
  message?: string;
  validUntil?: string | null;
  code?: string;
  /** Mostra la card spenta, per gli stati in cui non si può usare. */
  ghost?: boolean;
}

export function GiftCardFull({ theme, title, line2, recipientName, message, validUntil, code, ghost }: GiftCardFullProps) {
  const tilt = useTilt();
  return (
    <div
      ref={tilt.ref}
      className={`gcx gcx-full${ghost ? ' gcx-ghost' : ''}`}
      style={giftCardThemeVars(theme)}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
    >
      <GiftCardDecor theme={theme} />
      <div className="gcx-frame" />
      <div className="gcx-body">
        <div className="gcx-f-top">
          <div>
            <div className="gcx-eyebrow">Image Studio · Gift card</div>
            <div className="gcx-f-title">{title}</div>
            {line2 ? <div className="gcx-f-line2">{line2}</div> : null}
          </div>
          <GiftCardSeal theme={theme} size={42} />
        </div>
        {recipientName ? <div className="gcx-f-to">Per {recipientName}</div> : null}
        <div className="gcx-f-msg">{message}</div>
        <div className="gcx-f-foot">
          <div>
            <small>Valida fino al</small>
            <b>{validUntil === undefined ? '—' : validUntil === null ? 'Senza scadenza' : formatCardDate(validUntil)}</b>
          </div>
          <div style={{ textAlign: 'right' }}>
            <small>Codice</small>
            <b>{code || '—'}</b>
          </div>
        </div>
      </div>
      <div className="gcx-shine" />
      {ghost ? null : <div className="gcx-sweep" />}
    </div>
  );
}

/** Particelle di sfondo della scena di apertura (neve, coriandoli, cuori...). */
export function GiftCardAmbient({ theme }: { theme: GiftCardThemeKey }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const config = GIFT_CARD_AMBIENT[theme];
    const reduced = prefersReducedMotion();
    let width = 0;
    let height = 0;
    let raf = 0;
    type Particle = { x: number; y: number; size: number; speed: number; phase: number; color: string; rotation: number };
    let particles: Particle[] = [];
    const random = (min: number, max: number) => min + Math.random() * (max - min);

    const spawn = (initial: boolean): Particle => {
      const speed = random(config.speed[0], config.speed[1]);
      return {
        x: random(0, width),
        y: initial ? random(0, height) : speed >= 0 ? -10 : height + 10,
        size: random(config.size[0], config.size[1]),
        speed,
        phase: random(0, Math.PI * 2),
        color: config.colors[Math.floor(Math.random() * config.colors.length)],
        rotation: random(0, Math.PI),
      };
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      particles = Array.from({ length: config.count }, () => spawn(true));
    };

    const drawHeart = (p: Particle) => {
      const s = p.size / 24;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(s, s);
      ctx.fill(new Path2D(HEART_PATH));
      ctx.restore();
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        ctx.fillStyle = p.color;
        if (config.shape === 'dot') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (config.shape === 'rect') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillRect(-p.size / 2, -p.size, p.size, p.size * 1.8);
          ctx.restore();
        } else {
          drawHeart(p);
        }
      }
    };

    const step = () => {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.y += p.speed;
        p.phase += 0.012;
        p.rotation += 0.01;
        p.x += Math.sin(p.phase) * config.sway;
        if (p.speed >= 0 ? p.y > height + 12 : p.y < -12) particles[i] = spawn(false);
      }
      draw();
      raf = requestAnimationFrame(step);
    };

    resize();
    draw();
    if (!reduced) raf = requestAnimationFrame(step);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { resize(); draw(); }) : null;
    observer?.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [theme]);

  return <canvas ref={canvasRef} className="gcx-ambient" aria-hidden="true" />;
}
