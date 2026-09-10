/**
 * The b, loading — the product's own mark doing the waiting.
 *
 * Derived from AuthHero3D's front layer (same geometry, one gradient set):
 * the stem, the bullseye, and the two counter-rotating rings the sign-in
 * hero breathes with. This replaces the anonymous border-arc spinner,
 * which at small sizes read as a broken "X" — David's word for it, and he
 * was right: an arc with a transparent quarter is three-quarters of
 * nothing recognisable. A brand that has a mark should wait wearing it.
 *
 * Motion is the rings only, and it parks under prefers-reduced-motion;
 * the glyph itself never moves, so the loader cannot read as "fluctuating".
 */

export default function BLoader({
  label = "Loading your report",
  size = 72,
}: {
  label?: string;
  size?: number;
}) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4">
      <style>{`
        @keyframes blRingA { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes blRingB { from { transform: rotate(360deg) } to { transform: rotate(0deg) } }
        .bl-ring-a { animation: blRingA 2.6s linear infinite; transform-origin: 180px 188px; }
        .bl-ring-b { animation: blRingB 3.9s linear infinite; transform-origin: 180px 188px; }
        @media (prefers-reduced-motion: reduce) { .bl-ring-a, .bl-ring-b { animation: none } }
      `}</style>
      <svg viewBox="0 0 360 360" width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id="blMint" x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#c5f2dc" />
            <stop offset="33%" stopColor="#5ed3a4" />
            <stop offset="66%" stopColor="#279a75" />
            <stop offset="100%" stopColor="#0e5540" />
          </linearGradient>
          <radialGradient id="blBack" cx="34%" cy="28%" r="90%">
            <stop offset="0%" stopColor="#a4dcbe" />
            <stop offset="50%" stopColor="#3fa77e" />
            <stop offset="100%" stopColor="#0a3f30" />
          </radialGradient>
          <radialGradient id="blDisk" cx="34%" cy="28%" r="82%">
            <stop offset="0%" stopColor="#b6ebd0" />
            <stop offset="55%" stopColor="#48c091" />
            <stop offset="100%" stopColor="#082e22" />
          </radialGradient>
        </defs>

        {/* the two rings, counter-rotating: the loading itself */}
        <g className="bl-ring-a">
          <circle
            cx="180" cy="188" r="132" fill="none"
            stroke="#5ed3a4" strokeOpacity="0.55" strokeWidth="3"
            strokeDasharray="120 90" strokeLinecap="round"
          />
        </g>
        <g className="bl-ring-b">
          <circle
            cx="180" cy="188" r="150" fill="none"
            stroke="#279a75" strokeOpacity="0.35" strokeWidth="2"
            strokeDasharray="60 120" strokeLinecap="round"
          />
        </g>

        {/* the b, exactly the hero's front layer */}
        <circle cx="180" cy="188" r="76" stroke="url(#blMint)" strokeWidth="40" fill="none" />
        <rect x="68" y="18" width="44" height="292" rx="18" fill="url(#blMint)" />
        <circle cx="180" cy="188" r="46" fill="url(#blBack)" />
        <circle cx="180" cy="188" r="48" stroke="#1f8060" strokeWidth="4" fill="none" />
        <circle cx="180" cy="188" r="22" fill="url(#blDisk)" />
        <ellipse cx="170" cy="178" rx="8" ry="5" fill="white" fillOpacity="0.85" />
      </svg>
      <p className="text-[13px] font-medium leading-none text-slate-500">{label}</p>
    </div>
  );
}
