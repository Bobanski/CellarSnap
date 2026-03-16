import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f0a09] px-6 text-zinc-100">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <span className="block text-xs uppercase tracking-[0.3em] text-amber-300/70">
            404
          </span>
          <h1 className="text-2xl font-semibold text-zinc-50">
            Page not found.
          </h1>
          <p className="text-sm text-zinc-400">
            The page you&rsquo;re looking for doesn&rsquo;t exist or has been moved.
          </p>
        </div>

        <Link
          href="/"
          className="inline-block rounded-full bg-amber-400/90 px-5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
