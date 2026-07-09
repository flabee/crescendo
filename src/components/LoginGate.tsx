"use client";
import { signIn } from "next-auth/react";

export function LoginGate() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8 text-center">
      <h1
        className="glow-c text-5xl font-semibold uppercase text-cyan"
        style={{ letterSpacing: ".38em" }}
      >
        Crescendo
      </h1>
      <p className="max-w-md text-sm leading-relaxed tracking-[.06em] text-cyanlabel">
        Pick a seed track and Crescendo builds a Spotify playlist that follows a
        BPM curve outward from it.
      </p>
      <button
        onClick={() => signIn("spotify")}
        className="flex items-center gap-3 rounded-xl border border-[rgba(65,230,214,.3)] px-8 py-3 text-sm font-medium uppercase tracking-[.24em] text-cyan hover:border-[rgba(65,230,214,.6)]"
        style={{ background: "rgba(65,230,214,.03)" }}
      >
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: "#1db954", boxShadow: "0 0 8px rgba(29,185,84,.7)" }}
        />
        Connect Spotify
      </button>
    </div>
  );
}
