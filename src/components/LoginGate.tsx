"use client";
import { signIn } from "next-auth/react";

export function LoginGate() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Crescendo</h1>
      <p className="max-w-md text-neutral-400">
        Pick a seed track and Crescendo builds a Spotify playlist that follows a BPM curve outward from it.
      </p>
      <button
        onClick={() => signIn("spotify")}
        className="rounded-full bg-green-500 px-8 py-3 font-semibold text-black hover:bg-green-400"
      >
        Log in with Spotify
      </button>
    </div>
  );
}
