/**
 * Loading = the admin console's sign-in animation, verbatim.
 *
 * The owner's spec, his words: "the same animation as the admin console
 * login, simple". So this is not a derivative mark -- it IS AuthHero3D,
 * the breathing halo, the counter-rotating rings, the extruded b, boxed
 * to a loader's size. The first attempt drew its own two dashed rings
 * over a flat b, and at loader size the stem crossing the arcs read as
 * an X -- the exact thing he was pointing at. One animation in the
 * product, one source file for it.
 */

import AuthHero3D from "@/components/AuthHero3D";

export default function BLoader({
  label = "Loading your report",
  size = 180,
}: {
  label?: string;
  size?: number;
}) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-2">
      <div style={{ width: size, height: size }} className="relative">
        <AuthHero3D />
      </div>
      <p className="text-[13px] font-medium leading-none text-slate-500">{label}</p>
    </div>
  );
}
