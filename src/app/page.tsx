import { auth, signOut } from "@/lib/auth/config";
import { LoginGate } from "@/components/LoginGate";
import { SeedStudio } from "@/components/SeedStudio";

export default async function Home() {
  const session = await auth();
  if (!session || (session as { error?: string }).error) return <LoginGate />;
  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Crescendo</h1>
        <form
          action={async () => {
            "use server";
            await signOut();
          }}
        >
          <button className="text-sm text-neutral-400 hover:text-white">Log out</button>
        </form>
      </header>
      <SeedStudio />
      <footer className="mt-12 border-t border-neutral-800 pt-4 text-center text-xs text-neutral-500">
        BPM data from Deezer and{" "}
        <a
          className="underline hover:text-neutral-300"
          href="https://getsongbpm.com"
          target="_blank"
          rel="noreferrer"
        >
          GetSongBPM
        </a>
        .
      </footer>
    </main>
  );
}
