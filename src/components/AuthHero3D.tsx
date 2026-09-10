/**
 * The hero mark for the sign-in page: an extruded 3D "b" bullseye with a
 * breathing mint halo and two counter-rotating rings, ported verbatim from
 * `bottomlines-web/app/components/HeroMark3D.tsx` so the console's front
 * door renders the same lockup as the marketing hero.
 *
 * Everything the mark needs is self-contained — the keyframes live in a
 * scoped `<style>` tag so no changes to `index.css` are required. Twenty-
 * four thin SVG slices, each translated on Z inside a `preserve-3d`
 * container, produce a smooth extruded edge; the halo and the two rings
 * live *outside* the perspective context, because an infinite animation
 * inside `perspective` re-renders every layer every frame. See the
 * comment in the marketing repo for the measurement that motivated this.
 *
 * Pointer tilt (desktop) and scroll tilt (mobile) are both eased in one
 * rAF loop, and the loop parks itself the moment the target and current
 * values settle — a still mark costs no frames.
 */
import { useEffect, useRef } from "react";

const LAYERS = 24;
const DEPTH = 18;

function darken(hex: string, b: number): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * b);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * b);
  const bl = Math.round(parseInt(hex.slice(5, 7), 16) * b);
  return `rgb(${r}, ${g}, ${bl})`;
}

function BLayer({
  idx,
  z,
  brightness,
  isFront,
}: {
  idx: number;
  z: number;
  brightness: number;
  isFront: boolean;
}) {
  const mint = ["#c5f2dc", "#5ed3a4", "#279a75", "#0e5540"].map((c) => darken(c, brightness));
  const rim = ["#8ce0bc", "#3fa280", "#1f8060", "#082e22"].map((c) => darken(c, brightness));
  const back = ["#a4dcbe", "#3fa77e", "#186a52", "#0a3f30"].map((c) => darken(c, brightness));
  const disk = ["#b6ebd0", "#48c091", "#1c7d5f", "#082e22"].map((c) => darken(c, brightness));

  return (
    <svg
      viewBox="0 0 320 320"
      className="absolute inset-0 h-full w-full"
      style={{
        transform: `translateZ(${z}px)`,
        transformBox: "fill-box",
        transformOrigin: "50% 50%",
        backfaceVisibility: "visible",
      }}
      aria-hidden
    >
      <defs>
        <linearGradient id={`authBMint${idx}`} x1="20%" y1="0%" x2="80%" y2="100%">
          {mint.map((c, i) => (
            <stop key={i} offset={`${(i / (mint.length - 1)) * 100}%`} stopColor={c} />
          ))}
        </linearGradient>
        <linearGradient id={`authBRim${idx}`} x1="20%" y1="0%" x2="80%" y2="100%">
          {rim.map((c, i) => (
            <stop key={i} offset={`${(i / (rim.length - 1)) * 100}%`} stopColor={c} />
          ))}
        </linearGradient>
        <radialGradient id={`authBBack${idx}`} cx="34%" cy="28%" r="90%">
          {back.map((c, i) => (
            <stop key={i} offset={`${(i / (back.length - 1)) * 100}%`} stopColor={c} />
          ))}
        </radialGradient>
        <radialGradient id={`authBDisk${idx}`} cx="34%" cy="28%" r="82%">
          {disk.map((c, i) => (
            <stop key={i} offset={`${(i / (disk.length - 1)) * 100}%`} stopColor={c} />
          ))}
        </radialGradient>
      </defs>

      <circle
        cx="180"
        cy="188"
        r="76"
        stroke={`url(#authBMint${idx})`}
        strokeWidth="40"
        fill="none"
      />

      <rect x="68" y="18" width="44" height="292" rx="18" fill={`url(#authBMint${idx})`} />

      <circle cx="180" cy="188" r="46" fill={`url(#authBBack${idx})`} />

      <circle
        cx="180"
        cy="188"
        r="48"
        stroke={`url(#authBRim${idx})`}
        strokeWidth="4"
        fill="none"
      />

      <circle cx="180" cy="188" r="22" fill={`url(#authBDisk${idx})`} />

      {isFront && (
        <ellipse
          cx="170"
          cy="178"
          rx="8"
          ry="5"
          fill="white"
          opacity="0.35"
          transform="rotate(-30 170 178)"
        />
      )}
    </svg>
  );
}

function BStack() {
  return (
    <>
      {Array.from({ length: LAYERS }, (_, i) => {
        const t = i / (LAYERS - 1);
        const z = (t - 0.5) * DEPTH;
        const fromMid = Math.abs(t - 0.5) * 2;
        const brightness = t >= 0.5 ? 0.2 + fromMid * 0.8 : 0.2 + fromMid * 0.34;
        return <BLayer key={i} idx={i} z={z} brightness={brightness} isFront={i === LAYERS - 1} />;
      })}
    </>
  );
}

export function AuthHero3D() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const tilt = tiltRef.current;
    if (!wrap || !tilt) return;

    const stage = wrap.closest("[data-auth-stage]") ?? wrap.parentElement;
    if (!stage) return;

    const isTouch = window.matchMedia("(hover: none)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ptr = { tx: 0, ty: 0, cx: 0, cy: 0 };
    const scr = { tY: 0, tX: 0, cY: 0, cX: 0 };
    let raf = 0;
    let visible = true;
    let last = "";

    const EASE = 0.14;

    const computeScroll = () => {
      const r = stage.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const p = Math.min(1, Math.max(0, -r.top / vh));
      scr.tY = p * 64;
      scr.tX = Math.sin(p * Math.PI) * 7;
    };

    const tick = () => {
      ptr.cx += (ptr.tx - ptr.cx) * EASE;
      ptr.cy += (ptr.ty - ptr.cy) * EASE;
      scr.cY += (scr.tY - scr.cY) * EASE;
      scr.cX += (scr.tX - scr.cX) * EASE;

      let rotY: number,
        rotX: number,
        tx = 0,
        ty = 0;
      if (isTouch) {
        rotY = scr.cY;
        rotX = scr.cX;
      } else {
        rotY = ptr.cx * 14 + scr.cY;
        rotX = -ptr.cy * 11 + scr.cX;
        tx = ptr.cx * 6;
        ty = ptr.cy * 5;
      }

      const next = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`;
      if (next !== last) {
        tilt.style.transform = next;
        last = next;
      }

      const settled =
        Math.abs(ptr.tx - ptr.cx) < 0.002 &&
        Math.abs(ptr.ty - ptr.cy) < 0.002 &&
        Math.abs(scr.tY - scr.cY) < 0.05 &&
        Math.abs(scr.tX - scr.cX) < 0.05;
      if (settled || !visible) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const ensure = () => {
      if (!raf && visible && !reduced) raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      ptr.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      ptr.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      ensure();
    };
    const onLeave = () => {
      ptr.tx = 0;
      ptr.ty = 0;
      ensure();
    };
    const onScroll = () => {
      computeScroll();
      ensure();
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) ensure();
        else if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      },
      { threshold: 0 },
    );
    io.observe(stage);

    computeScroll();

    if (reduced) {
      tilt.style.transform = "translate3d(0,0,0)";
      return () => io.disconnect();
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    if (!isTouch) {
      stage.addEventListener("pointermove", onMove as EventListener);
      stage.addEventListener("pointerleave", onLeave);
    }
    ensure();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (!isTouch) {
        stage.removeEventListener("pointermove", onMove as EventListener);
        stage.removeEventListener("pointerleave", onLeave);
      }
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <style>{`
        @keyframes authHaloBreathe {
          0%, 100% { opacity: 0.55 }
          50%      { opacity: 0.9  }
        }
        @keyframes authSpinSlow {
          from { transform: rotate(0deg)   }
          to   { transform: rotate(360deg) }
        }
      `}</style>

      <div
        aria-hidden
        className="absolute inset-[-12%] rounded-full"
        style={{
          background: "radial-gradient(closest-side, rgba(95, 230, 189, 0.42), transparent 70%)",
          animation: "authHaloBreathe 7s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-[4%] rounded-full border"
        style={{
          borderColor: "hsl(163 52% 55% / 0.30)",
          animation: "authSpinSlow 48s linear infinite",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-[14%] rounded-full border"
        style={{
          borderColor: "hsl(163 52% 55% / 0.22)",
          animation: "authSpinSlow 36s linear infinite reverse",
        }}
      />

      <div
        className="absolute inset-0"
        style={{ perspective: "620px", perspectiveOrigin: "50% 50%" }}
      >
        <div
          ref={tiltRef}
          className="relative h-full w-full will-change-transform"
          style={{ transformStyle: "preserve-3d", transformOrigin: "50% 50%" }}
        >
          <BStack />
        </div>
      </div>
    </div>
  );
}

export default AuthHero3D;
