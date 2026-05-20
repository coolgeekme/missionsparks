import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api } from "../lib/api";
import { findGame } from "../games";
import { ArrowLeft, Trophy, Sparkles } from "lucide-react";

const STAR_URL = "https://static.prod-images.emergentagent.com/jobs/151314fa-6f88-4a3d-a39f-0044b194f5e9/images/5f587837e7ac036a02af75fb2b488a2a8b33429167fae318cb66d294e807a889.png";

export default function GamePlay() {
    const { logId, gameKey } = useParams();
    const navigate = useNavigate();
    const game = useMemo(() => findGame(gameKey), [gameKey]);
    const [finished, setFinished] = useState(false);
    const [score, setScore] = useState(null);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => {
        if (!game) navigate(`/student/play/${logId}`);
    }, [game, logId, navigate]);

    const onComplete = async (s) => {
        setScore(s);
        setFinished(true);
        setSaving(true);
        try {
            await api.post(`/logs/${logId}/game`, { game_key: gameKey, score: s });
        } catch (e) {
            // 409 already-played is fine; everything else just log silently
            if (e.response?.status !== 409) setErr(e.response?.data?.detail || e.message);
        } finally {
            setSaving(false);
        }
    };

    if (!game) return null;
    const Game = game.component;

    return (
        <div className="min-h-screen" data-testid="game-play-page">
            <Navbar />
            <main className="max-w-3xl mx-auto p-6 md:p-10 space-y-6">
                <Link to={`/student/play/${logId}`} className="inline-flex items-center gap-2 text-sm font-bold text-[#4361EE]" data-testid="game-play-back">
                    <ArrowLeft size={16} /> Pick another game
                </Link>
                <header className="flex items-center gap-3">
                    <div className="h-14 w-14 rounded-2xl flex items-center justify-center text-3xl" style={{ background: `${game.color}1a` }}>
                        {game.emoji}
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">{game.tag}</p>
                        <h1 className="font-display font-extrabold text-3xl text-[#0B132B]">{game.name}</h1>
                    </div>
                </header>

                <section className="mb-card p-6">
                    {!finished ? (
                        <Game onComplete={onComplete} />
                    ) : (
                        <div className="text-center py-6" data-testid="game-play-finished">
                            <img src={STAR_URL} alt="Star" className="h-28 w-28 mx-auto drop-shadow-lg" />
                            <h2 className="font-display font-extrabold text-3xl text-[#0B132B] mt-3">Nice job! 🎉</h2>
                            {score !== null && (
                                <p className="text-[#4A5568] font-bold mt-1 flex items-center justify-center gap-2">
                                    <Trophy className="text-[#FFD166]" size={18} /> Score: <span className="text-[#0B132B] font-extrabold">{score}</span>
                                </p>
                            )}
                            {saving && <p className="text-xs font-bold text-[#A0AEC0] mt-1">Saving…</p>}
                            {err && <p className="text-xs font-bold text-[#EF476F] mt-1">{err}</p>}
                            <div className="flex gap-3 justify-center mt-5">
                                <button onClick={() => navigate("/student")} className="btn-pop-primary" data-testid="game-play-home">
                                    Back to missions
                                </button>
                                <button onClick={() => navigate(`/student/play/${logId}`)} className="btn-pop-ghost flex items-center gap-2" data-testid="game-play-pick-another">
                                    <Sparkles size={14} /> All games
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}
