import NavBar from "@/components/NavBar";
import SommelierChat from "@/features/sommelier/SommelierChat";

export default function SommelierPage() {
  return (
    <main className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <NavBar activeHrefOverride="/sommelier" />
        <section className="rounded-[2.25rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(120,53,15,0.25),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-7 shadow-[0_30px_120px_-65px_rgba(0,0,0,0.95)]">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.34em] text-amber-200/70">
              Pocket Sommelier
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-50">
              A tasting-aware wine chat built around your own palate.
            </h1>
            <p className="mt-4 text-base leading-8 text-zinc-300">
              Ask for recommendations, region explainers, pairing help, or a second opinion on a bottle. The assistant uses your logged entries, algorithm-based preference signals, and the sommelier knowledge base.
            </p>
          </div>
        </section>
        <SommelierChat />
      </div>
    </main>
  );
}
