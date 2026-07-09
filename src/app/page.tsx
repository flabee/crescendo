import { auth, signOut } from "@/lib/auth/config";
import { LoginGate } from "@/components/LoginGate";
import { SeedStudio } from "@/components/SeedStudio";

export default async function Home() {
  const session = await auth();
  if (!session || (session as { error?: string }).error) return <LoginGate />;
  return (
    <main className="mx-auto w-full max-w-[960px] px-6 py-8">
      <header className="mb-8 flex items-center justify-between border-b border-[rgba(65,230,214,.14)] pb-5">
        <h1 className="glow-c text-2xl font-semibold uppercase text-cyan" style={{ letterSpacing: ".42em" }}>
          Crescendo
        </h1>
        <form
          action={async () => {
            "use server";
            await signOut();
          }}
        >
          <button className="text-[11px] uppercase tracking-[.24em] text-dim hover:text-cyan">
            Log out
          </button>
        </form>
      </header>
      <SeedStudio />
      <footer className="mt-12 flex items-center justify-between border-t border-[rgba(65,230,214,.14)] pt-4 text-[10px] uppercase tracking-[.22em] text-dim">
        <span>
          BPM DATA: DEEZER &amp;{" "}
          <a
            className="hover:text-cyan"
            href="https://getsongbpm.com"
            target="_blank"
            rel="noreferrer"
          >
            GETSONGBPM
          </a>
        </span>
        <span>SYNC: OK</span>
      </footer>
    </main>
  );
}
