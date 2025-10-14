import React, { useState, useEffect, useMemo } from "react";

const colors = [
  "bg-fuchsia-500","bg-emerald-500","bg-cyan-500","bg-indigo-500",
  "bg-rose-500","bg-amber-500","bg-sky-500","bg-violet-500",
  "bg-lime-500","bg-teal-500","bg-blue-500","bg-pink-500",
];

function pickColor(key = "") {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

function initials(name = "") {
  return name.split(" ").map(n => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function toHttp(url = "") {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function orgFromEmail(email = "") {
  const m = String(email).match(/@(.+)$/);
  return m ? m[1] : "";
}

export default function Leaderboard({ participants: rawParticipants }) {
  const [q, setQ] = useState("");
  const [sortDir, setSortDir] = useState("desc");
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState(0);
  const [firstResponseReceived, setFirstResponseReceived] = useState(false);

  // Fetch data from API
  useEffect(() => {
    if (!rawParticipants || rawParticipants.length === 0) return;

    // Initialize with 0 badges and 0 points
    const initial = rawParticipants.map((p, idx) => ({
      id: p.id || p.userEmail || p.googleCloudProfileURL || `row-${idx}`,
      name: p.name || p.userName || "Unnamed",
      email: p.email || p.userEmail || "",
      org: p.org || orgFromEmail(p.email || p.userEmail || ""),
      profileUrl: p.googleCloudProfileURL || p.profileUrl || "",
      badges: 0,
      points: 0,
    }));

    setParticipants(initial);
    const total = initial.length;
    setRemaining(total);
    setLoading(true);
    setFirstResponseReceived(false);

    // Fetch all at once
    initial.forEach(async (person) => {
      if (!person.profileUrl) {
        setRemaining(prev => Math.max(0, prev - 1));
        if (!firstResponseReceived) {
          setFirstResponseReceived(true);
          setLoading(false);
        }
        return;
      }

      try {
        const url = toHttp(person.profileUrl);
        const apiUrl = `https://skill-boost-stats-api.onrender.com/v1/?url=${encodeURIComponent(url)}`;
        const res = await fetch(apiUrl);
        
        if (res.ok) {
          const data = await res.json();
          setParticipants(prev => prev.map(p => 
            p.id === person.id 
              ? { ...p, badges: data.badges || 0, points: data.points || 0 }
              : p
          ));
        }
      } catch (err) {
        console.error(`Failed to fetch ${person.name}:`, err);
      } finally {
        setRemaining(prev => {
          const newRemaining = Math.max(0, prev - 1);
          return newRemaining;
        });
        
        if (!firstResponseReceived) {
          setFirstResponseReceived(true);
          setLoading(false);
        }
      }
    });
  }, [rawParticipants]);

  // Sort participants
  const sorted = useMemo(() => {
    const rows = [...participants].filter(p => {
      if (!q.trim()) return true;
      const term = q.toLowerCase();
      return (
        p.name.toLowerCase().includes(term) ||
        p.email.toLowerCase().includes(term) ||
        p.org.toLowerCase().includes(term)
      );
    });

    rows.sort((a, b) => {
      const badgeDiff = b.badges - a.badges;
      if (badgeDiff !== 0) return sortDir === "desc" ? badgeDiff : -badgeDiff;
      const pointsDiff = b.points - a.points;
      return sortDir === "desc" ? pointsDiff : -pointsDiff;
    });

    return rows;
  }, [participants, q, sortDir]);

  const top3 = sorted.slice(0, 3);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0b1220] via-slate-950 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-white/20 border-t-sky-500 mb-6"></div>
          <h2 className="text-2xl font-bold mb-2">Loading Leaderboard</h2>
          <p className="text-white/60">Waiting for first response...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b1220] via-slate-950 to-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-8">
        
        {/* Loading indicator at top - RED */}
        {remaining > 0 && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/20 border-t-red-400"></div>
              <div>
                <p className="text-sm font-medium text-red-300">⚠️ Leaderboard is still updating...</p>
                <p className="text-xs text-white/70">{remaining} profiles remaining</p>
              </div>
            </div>
          </div>
        )}

        {remaining === 0 && (
          <div className="mb-6 rounded-lg border border-green-500/30 bg-green-500/10 p-3">
            <p className="text-sm text-green-400">✓ All data loaded successfully</p>
          </div>
        )}

        {/* Header */}
        <header className="mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">
            SATI Study Jam Leaderboard
          </h1>
          <p className="text-sm text-white/70 mb-6">
            Google Study Jam 2025-26 Progress for Samrat Ashok Technological Institute Vidisha
          </p>

          <div className="flex gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, email, or org..."
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm outline-none placeholder:text-white/40 focus:border-white/20"
            />
            <button
              onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            >
              {sortDir === "desc" ? "↓" : "↑"}
            </button>
          </div>
        </header>

        {/* Podium */}
        <section className="mb-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[1, 0, 2].map((idx) => {
              const p = top3[idx];
              if (!p) return <div key={idx} />;
              const place = idx + 1;
              const color = pickColor(p.id || p.name);
              const ring = place === 1 ? "ring-yellow-400/60" : place === 2 ? "ring-slate-200/60" : "ring-amber-700/60";
              const crown = place === 1 ? "👑" : place === 2 ? "🥈" : "🥉";

              return (
                <div
                  key={p.id}
                  className={`rounded-2xl border border-white/10 bg-white/5 p-5 text-center ${
                    place === 1 ? "sm:-translate-y-1" : "sm:translate-y-1"
                  }`}
                >
                  <div className="mb-2 text-xl">{crown}</div>
                  <div className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full ring-2 ${ring}`}>
                    <div className={`flex h-14 w-14 items-center justify-center rounded-full ${color} text-white font-semibold`}>
                      {initials(p.name)}
                    </div>
                  </div>
                  <div className="text-xs text-white/60">#{place}</div>
                  <div className="mt-1 font-semibold">{p.name}</div>
                  <div className="text-xs text-white/60">{p.org}</div>
                  <div className="mt-3">
                    <span className="rounded-md bg-white/10 px-2 py-1 text-sm">{p.badges} badges</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Table */}
        <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="grid grid-cols-12 border-b border-white/10 px-4 py-3 text-xs uppercase tracking-wide text-white/60">
            <div className="col-span-1">Rank</div>
            <div className="col-span-6 sm:col-span-5">Participant</div>
            <div className="hidden col-span-3 sm:block">Points</div>
            <div className="col-span-5 sm:col-span-3 text-right">Badges</div>
          </div>

          <ul className="divide-y divide-white/10">
            {sorted.map((p, idx) => {
              const color = pickColor(p.id || p.name);
              const profileUrl = toHttp(p.profileUrl);

              return (
                <li key={p.id} className="grid grid-cols-12 items-center px-4 py-3 hover:bg-white/[0.06]">
                  <div className="col-span-1 text-sm text-white/80">#{idx + 1}</div>

                  <div className="col-span-6 sm:col-span-5 flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${color} text-white text-sm font-semibold`}>
                      {initials(p.name)}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-white/60">{p.org}</div>
                    </div>
                  </div>

                  <div className="hidden col-span-3 text-sm sm:block">
                    {profileUrl ? (
                      <a
                        href={profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200"
                      >
                        <span className="font-semibold">{p.points}</span>
                        <span className="text-white/50 text-xs">pts</span>
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ) : (
                      <span className="text-white/60">—</span>
                    )}
                  </div>

                  <div className="col-span-5 sm:col-span-3 text-right font-semibold">
                    {p.badges}
                  </div>
                </li>
              );
            })}

            {sorted.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-white/60">
                No results found.
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}