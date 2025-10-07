import React from "react";
import { useEffect, useState } from "react";
import Leaderboard from "../components/Leaderboard.jsx";
import fallbackData from "../data/fallback.js";

export default function Home() {
  const [participants, setParticipants] = useState(fallbackData);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("leaderboard:data");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.participants) && parsed.participants.length) {
        setParticipants(parsed.participants);
      }
    } catch (e) {
      console.error("Failed to read saved CSV data", e);
    }
  }, []);

  return <Leaderboard participants={participants} />;
}