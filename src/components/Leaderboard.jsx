import React, { useMemo, useState, useEffect } from "react";

const colors = [
  "bg-fuchsia-500","bg-emerald-500","bg-cyan-500","bg-indigo-500",
  "bg-rose-500","bg-amber-500","bg-sky-500","bg-violet-500",
  "bg-lime-500","bg-teal-500","bg-blue-500","bg-pink-500",
];

function pickColor(key = "") {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  const idx = Math.abs(hash) % colors.length;
  return colors[idx];
}

function initials(name = "") {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function toHttp(url = "") {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function orgFromEmail(email = "") {
  const m = String(email).match(/@(.+)$/);
  return m ? m[1] : "";
}

function normalizeParticipant(p, idx) {
  const name = p.name ?? p.userName ?? "Unnamed";
  const email = p.email ?? p.userEmail ?? "";

  return {
    id: p.id ?? p.userEmail ?? p.googleCloudProfileURL ?? `row-${idx}`,
    name,
    email,
    org: p.org ?? orgFromEmail(email),
    track: p.track ?? null,
    badges: 0, // Start with 0, will be updated from API
    points: 0, // Start with 0, will be updated from API
    googleCloudProfileURL: p.googleCloudProfileURL ?? p.profileUrl ?? "",
    profileURLStatus: p.profileURLStatus,
    accessCodeRedemptionStatus: p.accessCodeRedemptionStatus,
    allSkillBadgesAndGamesCompleted: p.allSkillBadgesAndGamesCompleted,
    numArcadeGamesCompleted:
      typeof p.numArcadeGamesCompleted === "number" ? p.numArcadeGamesCompleted : 0,
    completedSkillBadges: p.completedSkillBadges ?? "",
    completedArcadeGames: p.completedArcadeGames ?? "",
  };
}

// Fetch data from your API for a single participant
async function fetchParticipantStats(profileURL) {
  if (!profileURL) return null;
  
  try {
    const url = toHttp(profileURL);
    const apiUrl = `https://skill-boost-stats-api.onrender.com/v1/?url=${encodeURIComponent(url)}`;
    
    const response = await fetch(apiUrl, {
      mode: 'cors',
      headers: {
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch stats for ${url}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    return {
      points: data.points ?? 0,
      badges: data.badges ?? 0
    };
  } catch (error) {
    console.error(`Error fetching stats for ${profileURL}:`, error.message);
    return null;
  }
}

// Fetch with concurrency limit to avoid overwhelming the API
async function fetchWithConcurrencyLimit(participants, limit = 50, onProgress) {
  const results = [];
  const executing = [];
  let completed = 0;
  
  for (const [index, p] of participants.entries()) {
    const promise = fetchParticipantStats(p.googleCloudProfileURL)
      .then(stats => {
        completed++;
        if (onProgress) onProgress(completed, participants.length);
        return { id: p.id, stats, index };
      });
    
    results.push(promise);
    
    if (limit <= participants.length) {
      const e = promise.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  
  return results; // Return promises, not awaited results
}

// Fetch all participants' data in parallel - NO BATCHING for maximum speed
async function fetchAllParticipantsStats(participants) {
  // Launch ALL requests simultaneously for maximum speed
  const allPromises = participants.map(p => 
    fetchParticipantStats(p.googleCloudProfileURL)
      .then(stats => ({ id: p.id, stats }))
  );
  
  return await Promise.all(allPromises);
}

export default function Leaderboard({ participants: rawParticipants }) {
  const [q, setQ] = useState("");
  const [track, setTrack] = useState("All");
  const [sortBy, setSortBy] = useState("badges");
  const [sortDir, setSortDir] = useState("desc");
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [participants, setParticipants] = useState([]);
  const [fetchingCount, setFetchingCount] = useState(0);

  // Initialize and fetch real-time data
  useEffect(() => {
    async function loadData() {
      setInitialLoading(true);
      setLoadingProgress(0);
      
      // Normalize initial data
      const normalized = (rawParticipants || []).map(normalizeParticipant);
      const totalParticipants = normalized.length;
      setFetchingCount(totalParticipants);
      
      // Set initial participants (with default values)
      setParticipants(normalized);
      
      // Launch ALL requests immediately with concurrency control
      let completed = 0;
      let firstResponseReceived = false;
      
      // Create all fetch promises
      const allPromises = normalized.map(async (p) => {
        const stats = await fetchParticipantStats(p.googleCloudProfileURL);
        
        completed++;
        const progress = Math.round((completed / totalParticipants) * 100);
        setLoadingProgress(progress);
        setFetchingCount(totalParticipants - completed);
        
        // Hide loading screen on FIRST result
        if (!firstResponseReceived) {
          firstResponseReceived = true;
          setInitialLoading(false);
        }
        
        return { id: p.id, stats };
      });
      
      // Process results as they arrive
      allPromises.forEach(async (promise) => {
        const result = await promise;
        
        if (result.stats) {
          setParticipants(prev => {
            const updated = [...prev];
            const idx = updated.findIndex(p => p.id === result.id);
            if (idx !== -1) {
              updated[idx] = {
                ...updated[idx],
                badges: result.stats.badges,
                points: result.stats.points
              };
            }
            return updated;
          });
        }
      });
      
      // Wait for all to complete
      await Promise.all(allPromises);
      setFetchingCount(0);
    }
    
    if (rawParticipants && rawParticipants.length > 0) {
      loadData();
    }
  }, [rawParticipants]);

  const hasTrack = useMemo(
    () => participants.some((p) => p.track && String(p.track).trim()),
    [participants]
  );

  const scoreKey = useMemo(() => {
    const hasBadges = participants.some((p) => typeof p?.badges === "number");
    return hasBadges ? "badges" : "points";
  }, [participants]);

  const uniqueTracks = useMemo(() => {
    if (!hasTrack) return ["All"];
    const s = new Set();
    participants.forEach((p) => p.track && s.add(p.track));
    return ["All", ...Array.from(s)];
  }, [participants, hasTrack]);

  const rankedAll = useMemo(() => {
    const rows = [...participants].sort(
      (a, b) => (b?.[scoreKey] || 0) - (a?.[scoreKey] || 0)
    );
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [participants, scoreKey]);

  const top3 = rankedAll.slice(0, 3);

  const filteredSorted = useMemo(() => {
    let rows = [...participants];
    if (hasTrack && track !== "All") rows = rows.filter((r) => r.track === track);
    if (q.trim()) {
      const term = q.toLowerCase();
      rows = rows.filter(
        (r) =>
          String(r.name || "").toLowerCase().includes(term) ||
          String(r.email || "").toLowerCase().includes(term) ||
          String(r.org || "").toLowerCase().includes(term) ||
          String(r.track || "").toLowerCase().includes(term)
      );
    }
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") {
        cmp = String(a.name || "").localeCompare(String(b.name || ""), undefined, {
          sensitivity: "base",
        });
      } else {
        cmp = (a.badges || 0) - (b.badges || 0);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [participants, q, track, sortBy, sortDir, hasTrack]);

  // Loading Screen - only shown initially
  if (initialLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0b1220] via-slate-950 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="mb-6">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-white/20 border-t-sky-500"></div>
          </div>
          <h2 className="text-2xl font-bold mb-2">Loading Leaderboard</h2>
          <p className="text-white/60 mb-4">Starting data fetch from Google Cloud...</p>
          <p className="text-xs text-white/50 mb-4">Waiting for first response...</p>
          <div className="w-64 mx-auto bg-white/10 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-sky-500 h-full transition-all duration-300 ease-out animate-pulse"
              style={{ width: '30%' }}
            ></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b1220] via-slate-950 to-black text-white">
      <div className="sticky top-0 z-20 border-b border-white/10 bg-black/30 backdrop-blur"></div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <div className="flex items-start space-x-4">
            <div className="w-16 h-16 bg-gradient-to-br from-sky-500 to-blue-600 rounded-full flex items-center justify-center text-2xl font-bold">
              S
            </div>
            
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">
                SATI Study Jam Leaderboard
              </h1>
              <p className="mt-1 text-sm text-white/70">
                Google Study Jam 2025-26 Progress for Samrat Ashok Technological Institute Vidisha
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative sm:w-1/2">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50"
              >
                <path
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
                />
              </svg>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, email, org, or track..."
                className="w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 py-2 text-sm outline-none placeholder:text-white/40 focus:border-white/20 focus:ring-2 focus:ring-white/10"
              />
            </div>

            {hasTrack && (
              <select
                value={track}
                onChange={(e) => setTrack(e.target.value)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/20 focus:ring-2 focus:ring-white/10"
              >
                {uniqueTracks.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/20 focus:ring-2 focus:ring-white/10"
            >
              <option value="badges">Sort: Skill Badges</option>
              <option value="name">Sort: Name (A–Z)</option>
            </select>

            <button
              onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition"
              title="Toggle sort direction"
            >
              {sortDir === "desc" ? "↓" : "↑"}
            </button>
          </div>
        </header>

        <section className="mb-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[1, 0, 2].map((idx, col) => {
              const p = top3[idx];
              if (!p) return <div key={col} />;
              const place = idx + 1;
              const color = p.color || pickColor(p.id || p.name || String(col));
              const ring =
                place === 1
                  ? "ring-yellow-400/60"
                  : place === 2
                  ? "ring-slate-200/60"
                  : "ring-amber-700/60";
              const crown = place === 1 ? "👑" : place === 2 ? "🥈" : "🥉";
              const displayMetric =
                typeof p.badges === "number"
                  ? `${p.badges} badges`
                  : `${p.points ?? 0} pts`;
              const profileUrl = toHttp(p.googleCloudProfileURL);

              return (
                <div
                  key={p.id || col}
                  className={`rounded-2xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_24px_rgba(0,0,0,0.35)] ${
                    place === 1 ? "sm:-translate-y-1" : "sm:translate-y-1"
                  }`}
                >
                  <div className="mb-2 text-xl">{crown}</div>
                  <div className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full ring-2 ${ring}`}>
                    {profileUrl ? (
                      <a
                        href={profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open Google Cloud profile"
                        className={`flex h-14 w-14 items-center justify-center rounded-full ${color} text-white font-semibold`}
                      >
                        {initials(p.name)}
                      </a>
                    ) : (
                      <div className={`flex h-14 w-14 items-center justify-center rounded-full ${color} text-white font-semibold`}>
                        {initials(p.name)}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-white/60">#{place}</div>
                  <div className="mt-1 font-semibold">{p.name}</div>
                  <div className="text-xs text-white/60">{p.org}</div>
                  <div className="mt-3">
                    <span className="rounded-md bg-white/10 px-2 py-1 text-sm">{displayMetric}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_24px_rgba(0,0,0,0.35)] overflow-hidden">
          <div className="grid grid-cols-12 border-b border-white/10 px-4 py-3 text-xs uppercase tracking-wide text-white/60">
            <div className="col-span-1">Rank</div>
            <div className={`${hasTrack ? "col-span-5 sm:col-span-5" : "col-span-6 sm:col-span-5"}`}>
              Participant
            </div>
            <div className="hidden col-span-3 sm:block">Points</div>
            {hasTrack && (
              <div className="col-span-3 sm:col-span-2 text-right sm:text-left">Track</div>
            )}
            <div className={`${hasTrack ? "col-span-3 sm:col-span-1" : "col-span-5 sm:col-span-3"} text-right`}>
              Skill Badges
            </div>
          </div>

          <ul className="divide-y divide-white/10">
            {filteredSorted.map((p) => {
              const rank = rankedAll.find((r) => r.id === p.id)?.rank ?? "-";
              const color = p.color || pickColor(p.id || p.name);
              const profileUrl = toHttp(p.googleCloudProfileURL);

              return (
                <li
                  key={p.id}
                  className="grid grid-cols-12 items-center px-4 py-3 hover:bg-white/[0.06] transition"
                >
                  <div className="col-span-1 text-sm text-white/80">#{rank}</div>

                  <div className={`${hasTrack ? "col-span-5 sm:col-span-5" : "col-span-6 sm:col-span-5"} flex items-center gap-3`}>
                    <div className="flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-white/15">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${color} text-white text-sm font-semibold`}>
                        {initials(p.name)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-white/60 sm:hidden">
                        {p.org || "—"}
                        {profileUrl && (
                          <>
                            <span className="mx-1">•</span>
                            <a
                              href={profileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sky-300 hover:text-sky-200 underline decoration-sky-300/40 hover:decoration-sky-200"
                            >
                              Profile
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="hidden col-span-3 text-sm sm:block">
                    {profileUrl ? (
                      <a
                        href={profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200 underline decoration-sky-300/40 hover:decoration-sky-200"
                        title="Open Google Cloud profile"
                      >
                        View profile
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 opacity-80" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 5h6m0 0v6m0-6L10 14" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 13v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" />
                        </svg>
                      </a>
                    ) : (
                      <span className="text-white/60">—</span>
                    )}
                  </div>

                  {hasTrack && (
                    <div className="col-span-3 text-right text-xs sm:col-span-2 sm:text-left">
                      <span className="rounded-md bg-white/10 px-2 py-1">{p.track || "-"}</span>
                    </div>
                  )}

                  <div className={`${hasTrack ? "col-span-3 sm:col-span-1" : "col-span-5 sm:col-span-3"} text-right font-semibold`}>
                    {p.badges ?? 0}
                  </div>
                </li>
              );
            })}

            {filteredSorted.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-white/60">
                No results. Try adjusting filters.
              </li>
            )}
          </ul>
        </section>

        <div className="mt-4 flex items-center gap-3 text-sm text-white/70">
          <span>Live data • Updated in real-time</span>
        </div>
      </div>
    </div>
  );
}