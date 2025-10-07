import React from "react";
import { useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Papa from "papaparse";

function normalize(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const headerAliases = {
  name: ["name", "full name", "fullname", "participant", "student", "member"],
  org: ["org", "organization", "organisation", "college", "school", "chapter", "club", "gdsc"],
  track: ["track", "category", "group", "path", "division"],
  // New: skill badges completed
  badges: [
    "skill badges", "skill_badges", "skill-badges",
    "skill badges completed", "skill_badges_completed", "skill-badges-completed",
    "badges", "badges completed"
  ],
  // Points is optional now
  points: ["points", "point", "score", "scores", "total", "total points", "total_points"],
};

function guessHeader(headers, key) {
  const normalized = headers.map((h) => normalize(h));
  const aliases = headerAliases[key].map((a) => normalize(a));
  const idx = normalized.findIndex((h) => aliases.includes(h));
  return idx >= 0 ? headers[idx] : undefined;
}

function toId(name, org, index) {
  const base = `${(name || "").trim()}|${(org || "").trim()}`.toLowerCase();
  if (base.replace(/\W+/g, "").length > 0) return base;
  return `row-${index}`;
}

export default function Login() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [status, setStatus] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const buildParticipants = (rows) => {
    const headers = Object.keys(rows[0] || {});
    const nameH = guessHeader(headers, "name");
    const orgH = guessHeader(headers, "org");
    const trackH = guessHeader(headers, "track");
    const badgesH = guessHeader(headers, "badges");
    const pointsH = guessHeader(headers, "points");

    if (!nameH) {
      setStatus(`Missing required 'Name' header. Detected: ${headers.join(", ")}`);
      return null;
    }

    const participants = rows
      .map((row, i) => {
        const name = String(row[nameH] ?? "").trim();
        if (!name) return null;

        const org = orgH ? String(row[orgH] ?? "").trim() : undefined;
        const track = trackH ? String(row[trackH] ?? "").trim() : undefined;

        let badges = 0;
        if (badgesH) {
          const rawB = String(row[badgesH] ?? "").replace(/,/g, "").trim();
          const n = Number(rawB);
          badges = Number.isFinite(n) ? n : 0;
        }

        let points;
        if (pointsH) {
          const rawP = String(row[pointsH] ?? "").replace(/,/g, "").trim();
          const n = Number(rawP);
          points = Number.isFinite(n) ? n : undefined;
        }

        const id = toId(name, org, i);
        return { id, name, org, track, badges, points };
      })
      .filter(Boolean);

    if (!participants.length) {
      setStatus("No valid rows found. Check your Name column.");
      return null;
    }
    return participants;
  };

  const onSelectFile = (file) => {
    setStatus("Parsing CSV...");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const participants = buildParticipants(res.data || []);
        if (!participants) return;
        localStorage.setItem("leaderboard:data", JSON.stringify({ participants }));
        setStatus(`Loaded ${participants.length} participants. Redirecting...`);
        setTimeout(() => navigate("/"), 500);
      },
      error: (err) => {
        console.error(err);
        setStatus("Failed to parse CSV.");
      },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b1220] via-slate-950 to-black">
      <div className="mx-auto max-w-lg px-4 py-12">
        <Link to="/" className="inline-flex items-center text-sm text-white/60 hover:text-white/80 transition">
          ← Back
        </Link>

        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Upload CSV</h1>
        <p className="mt-2 text-sm text-white/70">
          Upload a CSV containing name, optional org/track, and skill badges completed.
        </p>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_24px_rgba(0,0,0,0.35)]">
          <div
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
              dragOver ? "border-indigo-400 bg-white/10" : "border-white/15 bg-white/5"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) onSelectFile(file);
            }}
          >
            <div className="h-12 w-12 rounded-full bg-indigo-600/20 flex items-center justify-center ring-1 ring-inset ring-indigo-500/30">
              <span className="text-2xl">📄</span>
            </div>
            <div className="mt-2 text-sm text-white/80">
              Drag & drop your CSV here, or
              <button
                className="ml-1 underline decoration-indigo-400/60 hover:text-white"
                onClick={() => fileRef.current?.click()}
              >
                browse
              </button>
            </div>
            <div className="text-xs text-white/60">Headers detected automatically. Use: name, org (opt), track (opt), skill badges completed, points (opt)</div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onSelectFile(f);
              }}
            />
          </div>

          {status && (
            <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
              {status}
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={() => {
                localStorage.removeItem("leaderboard:data");
                navigate("/");
              }}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition"
            >
              Clear saved CSV
            </button>
            <Link
              to="/"
              className="text-sm text-white/70 underline hover:text-white/90 transition"
            >
              Back to leaderboard
            </Link>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/70">
          Tip: Need exact colors/spacing like the reference? Share a screenshot and I’ll tune it.
        </div>
      </div>
    </div>
  );
}