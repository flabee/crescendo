"use client";
import { useEffect, useRef, useState } from "react";

// Minimal typing for the Spotify Web Playback SDK globals. We deliberately use
// `any` for the SDK objects — the SDK ships no types and over-typing here adds
// no safety for our small surface.
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Spotify: any;
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

const SDK_SRC = "https://sdk.scdn.co/spotify-player.js";

async function fetchToken(): Promise<string> {
  const r = await fetch("/api/token");
  const d = await r.json();
  return d.accessToken as string;
}

export function Player({
  tracks,
}: {
  tracks: { title: string; artist: string; isrc?: string }[];
}) {
  const [status, setStatus] = useState<string>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [current, setCurrent] = useState<{ name: string; artist: string } | null>(null);
  const [paused, setPaused] = useState(true);
  const [playError, setPlayError] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const deviceIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Inject the SDK script once; guard against a double-inject across mounts.
    if (!document.getElementById("spotify-sdk")) {
      const script = document.createElement("script");
      script.id = "spotify-sdk";
      script.src = SDK_SRC;
      script.async = true;
      document.body.appendChild(script);
    }

    function createPlayer() {
      if (!window.Spotify) return;
      const player = new window.Spotify.Player({
        name: "Crescendo",
        getOAuthToken: (cb: (token: string) => void) => {
          fetchToken()
            .then((token) => cb(token))
            .catch(() => setError("Could not fetch Spotify token."));
        },
        volume: 0.6,
      });
      playerRef.current = player;

      player.addListener("ready", ({ device_id }: { device_id: string }) => {
        deviceIdRef.current = device_id;
        setDeviceId(device_id);
        setStatus("ready");
      });
      player.addListener("not_ready", () => {
        setStatus("device offline");
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      player.addListener("player_state_changed", (state: any) => {
        if (!state) return;
        const track = state.track_window?.current_track;
        if (track) {
          setCurrent({ name: track.name, artist: track.artists?.[0]?.name ?? "" });
        }
        setPaused(state.paused);
      });
      player.addListener("initialization_error", ({ message }: { message: string }) => {
        setError(message || "Initialization error.");
      });
      player.addListener("authentication_error", ({ message }: { message: string }) => {
        setError(message || "Authentication error.");
      });
      player.addListener("account_error", () => {
        setError("Spotify Premium required");
      });

      player.connect();
    }

    // The SDK fires the ready callback once loaded. If the script already loaded
    // (e.g. remount), window.Spotify may exist already — create immediately.
    if (window.Spotify) {
      createPlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = createPlayer;
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
      }
    };
  }, []);

  async function handlePlay() {
    setPlayError(null);
    const id = deviceIdRef.current;
    if (!id) {
      setPlayError("Player not ready yet.");
      return;
    }
    // Pool tracks are ISRC-keyed, so resolve each ISRC to a real Spotify track
    // URI server-side (paced) before playing the set as a Spotify queue — the
    // SDK auto-advances through the URIs.
    const isrcs = tracks.map((t) => t.isrc).filter((x): x is string => Boolean(x));
    if (isrcs.length === 0) {
      setPlayError("No playable tracks (missing track IDs)");
      return;
    }
    try {
      setStatus("resolving…");
      const rr = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isrcs }),
      });
      if (!rr.ok) {
        const body = await rr.text().catch(() => "");
        setStatus("ready");
        setPlayError(`Resolve failed (${rr.status})${body ? " — " + body.slice(0, 160) : ""}`);
        return;
      }
      const { uris: resolved } = (await rr.json()) as { uris: (string | null)[] };
      const uris = resolved.filter((x): x is string => Boolean(x));
      setStatus("ready");
      if (uris.length === 0) {
        setPlayError("No playable tracks (missing track IDs)");
        return;
      }

      const token = await fetchToken();
      const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        setPlayError(`Playback failed (${res.status})${body ? " — " + body.slice(0, 160) : ""}`);
      }
    } catch (e) {
      setStatus("ready");
      setPlayError(e instanceof Error ? e.message : String(e));
    }
  }

  const playing = current !== null;

  return (
    <section className="panel space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="metric-label">Playback</div>
        <div className="text-[10px] uppercase tracking-[.2em] text-dim">
          <span className={status === "ready" ? "text-cyan glow-c" : "text-amber glow-a"}>{status}</span>
        </div>
      </div>

      {error && (
        <div
          className="glow-r rounded-lg px-4 py-3 text-xs uppercase tracking-[.14em] text-red"
          style={{
            border: "1px solid rgba(255,58,94,.4)",
            background: "rgba(255,58,94,.06)",
          }}
        >
          {error}
        </div>
      )}

      {playError && (
        <div
          className="glow-r rounded-lg px-4 py-3 text-xs uppercase tracking-[.14em] text-red"
          style={{
            border: "1px solid rgba(255,58,94,.4)",
            background: "rgba(255,58,94,.06)",
          }}
        >
          {playError}
        </div>
      )}

      {playing && current && (
        <div className="hairline rounded-lg px-4 py-3">
          <div className="text-[10px] uppercase tracking-[.2em] text-dim">
            {paused ? "Paused" : "Now Playing"}
          </div>
          <p className="truncate text-sm font-medium text-cyanlabel">{current.name}</p>
          <p className="truncate text-xs text-dim">{current.artist}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handlePlay}
          disabled={status !== "ready"}
          className="btn-amber px-6 py-2.5 text-xs disabled:opacity-45"
        >
          ▶ Play Set
        </button>

        {playing && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => playerRef.current?.previousTrack()}
              className="chip !py-1.5 !text-[11px] hover:border-[rgba(65,230,214,.5)]"
              style={{ color: "#41e6d6", borderColor: "rgba(65,230,214,.4)" }}
              aria-label="Previous track"
            >
              ⏮
            </button>
            <button
              onClick={() => playerRef.current?.togglePlay()}
              className="chip !py-1.5 !text-[11px] hover:border-[rgba(65,230,214,.5)]"
              style={{ color: "#41e6d6", borderColor: "rgba(65,230,214,.4)" }}
              aria-label={paused ? "Play" : "Pause"}
            >
              {paused ? "▶" : "⏸"}
            </button>
            <button
              onClick={() => playerRef.current?.nextTrack()}
              className="chip !py-1.5 !text-[11px] hover:border-[rgba(65,230,214,.5)]"
              style={{ color: "#41e6d6", borderColor: "rgba(65,230,214,.4)" }}
              aria-label="Next track"
            >
              ⏭
            </button>
          </div>
        )}
      </div>

      <p className="text-[10px] uppercase tracking-[.16em] text-dim">
        Plays in this browser on the <span className="vfd text-cyan">Crescendo</span> device · Spotify Premium required
      </p>
    </section>
  );
}
