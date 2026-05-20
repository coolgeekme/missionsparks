import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api } from "../lib/api";
import { GAMES } from "../games";
import { ArrowLeft, Lock, CheckCircle2 } from "lucide-react";

export default function GamePicker() {
    const { logId } = useParams();
    const navigate = useNavigate();
    const [log, setLog] = useState(null);
    const [err, setErr] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/logs", { params: { mission_id: undefined } });
                const found = (data || []).find((l) => l.id === logId);
                if (found) setLog(found);
                else setErr("Log not found.");
            } catch (e) {
                setErr(e.message);
            }
        })();
    }, [logId]);

    const alreadyPlayed = log?.game_played;

    return (
        <div className="min-h-screen" data-testid="game-picker-page">
            <Navbar />
            <main className="max-w-5xl mx-auto p-6 md:p-10 space-y-6">
                <Link to="/student" className="inline-flex items-center gap-2 text-sm font-bold text-[#4361EE]" data-testid="game-picker-back">
                    <ArrowLeft size={16} /> Back to missions
                </Link>
                <header>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">Reward time</p>
                    <h1 className="font-display font-extrabold text-4xl text-[#0B132B] mt-1">Pick a mini-game 🎮</h1>
                    <p className="text-[#4A5568] font-semibold mt-2">
                        {alreadyPlayed
                            ? "You already claimed a game for this mission. Nice!"
                            : "You unlocked one game for finishing your mission. Choose your favorite."}
                    </p>
                </header>
                {err && <p className="text-sm font-bold text-[#EF476F]" data-testid="game-picker-error">{err}</p>}

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="game-picker-grid">
                    {GAMES.map((g) => {
                        const locked = alreadyPlayed;
                        return (
                            <button
                                key={g.key}
                                onClick={() => !locked && navigate(`/student/play/${logId}/${g.key}`)}
                                disabled={locked}
                                className={`mb-card mb-card-hover p-5 text-left ${locked ? "opacity-50 cursor-not-allowed" : ""}`}
                                data-testid={`game-card-${g.key}`}
                                style={locked ? { transform: "none" } : undefined}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="h-14 w-14 rounded-2xl flex items-center justify-center text-3xl" style={{ background: `${g.color}1a` }}>
                                        {g.emoji}
                                    </div>
                                    {locked ? <Lock size={18} className="text-[#A0AEC0]" /> : null}
                                </div>
                                <h3 className="font-display font-bold text-xl text-[#0B132B] mt-3">{g.name}</h3>
                                <p className="text-sm font-semibold text-[#4A5568] mt-1">{g.blurb}</p>
                                <span className="mb-chip mt-3 text-xs py-0.5 px-2" style={{ background: `${g.color}1a`, color: g.color }}>{g.tag}</span>
                            </button>
                        );
                    })}
                </div>

                {alreadyPlayed && (
                    <div className="mb-card p-5 flex items-center gap-3" data-testid="game-picker-played-msg">
                        <CheckCircle2 className="text-[#06D6A0]" />
                        <p className="font-bold text-[#0B132B]">You played <span className="text-[#4361EE]">{log.game_key}</span> for this mission. Come back after your next mission to unlock another!</p>
                    </div>
                )}
            </main>
        </div>
    );
}
