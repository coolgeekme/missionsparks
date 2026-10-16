import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiErrorDetail } from "../lib/api";
import { findGame } from "../games";
import { ArrowLeft, Trophy, Sparkles } from "lucide-react";

const STAR_URL = "https://static.prod-images.emergentagent.com/jobs/151314fa-6f88-4a3d-a39f-0044b194f5e9/images/5f587837e7ac036a02af75fb2b488a2a8b33429167fae318cb66d294e807a889.png";

export default function GamePlay() {
    const { logId, gameKey } = useParams();
    const [search] = useSearchParams();
    const packId = search.get("packId");
    const standalone = (logId === "free" || logId === "preview");

    const navigate = useNavigate();
    const game = useMemo(() => findGame(gameKey), [gameKey]);
    const [finished, setFinished] = useState(false);
    const [score, setScore] = useState(null);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");
    const [pack, setPack] = useState(null);
    const [loadingPack, setLoadingPack] = useState(!!packId);

    useEffect(() => {
        if (!game) navigate("/student");
    }, [game, navigate]);

    useEffect(() => {
        if (!packId) return;
        (async () => {
            try {
                const { data } = await api.get(`/game-packs/${packId}`);
                setPack(data);
            } catch (e) {
                setErr(formatApiErrorDetail(e.response?.data?.detail || e.message));
            } finally {
                setLoadingPack(false);
            }
        })();
    }, [packId]);

    const onComplete = async (s) => {
        setScore(s);
        setFinished(true);
        if (standalone) return;
        setSaving(true);
        try {
            await api.post(`/logs/${logId}/game`, { game_key: gameKey, score: s });
        } catch (e) {
            if (e.response?.status !== 409) setErr(e.response?.data?.detail || e.message);
        } finally {
            setSaving(false);
        }
    };

    if (!game) return null;
    if (loadingPack) {
        return (
            <div className="min-h-screen flex items-center justify-center text-[#E4572E] font-bold">Loading pack…</div>
        );
    }
    const Game = game.component;

    const backHref = standalone ? "/games" : `/student/play/${logId}`;
    const backLabel = standalone ? "Back to games" : "Pick another game";

    return (
        <div className="min-h-screen" data-testid="game-play-page">
            <Navbar />
            <main className="max-w-3xl mx-auto p-6 md:p-10 space-y-6">
                <Link to={backHref} className="inline-flex items-center gap-2 text-sm font-bold text-[#E4572E]" data-testid="game-play-back">
                    <ArrowLeft size={16} /> {backLabel}
                </Link>
                <header className="flex items-center gap-3">
                    <div className="h-14 w-14 rounded-2xl flex items-center justify-center text-3xl" style={{ background: `${game.color}1a` }}>
                        {game.emoji}
                    </div>
                    <div className="flex-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286]">{game.tag}</p>
                        <h1 className="font-display font-extrabold text-3xl text-[#201D18]">{game.name}</h1>
                        {pack && (
                            <p className="text-sm font-semibold text-[#6E675B] mt-1" data-testid="game-play-pack-info">
                                Pack: <span className="text-[#201D18]">{pack.name}</span>
                                {pack.creator_name && <span className="text-[#9A9286]"> · by {pack.creator_name}</span>}
                            </p>
                        )}
                    </div>
                </header>

                <section className="mb-card p-6">
                    {!finished ? (
                        <Game onComplete={onComplete} content={pack?.content} />
                    ) : (
                        <div className="text-center py-6" data-testid="game-play-finished">
                            <img src={STAR_URL} alt="Star" className="h-28 w-28 mx-auto drop-shadow-lg" />
                            <h2 className="font-display font-extrabold text-3xl text-[#201D18] mt-3">Nice job! 🎉</h2>
                            {score !== null && (
                                <p className="text-[#6E675B] font-bold mt-1 flex items-center justify-center gap-2">
                                    <Trophy className="text-[#E8A33D]" size={18} /> Score: <span className="text-[#201D18] font-extrabold">{score}</span>
                                </p>
                            )}
                            {saving && <p className="text-xs font-bold text-[#9A9286] mt-1">Saving…</p>}
                            {err && <p className="text-xs font-bold text-[#BC4B32] mt-1">{err}</p>}
                            <div className="flex gap-3 justify-center mt-5">
                                <button onClick={() => navigate(standalone ? "/games" : "/student")} className="btn-pop-primary" data-testid="game-play-home">
                                    {standalone ? "All games" : "Back to missions"}
                                </button>
                                {!standalone && (
                                    <button onClick={() => navigate(`/student/play/${logId}`)} className="btn-pop-ghost flex items-center gap-2" data-testid="game-play-pick-another">
                                        <Sparkles size={14} /> All games
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}
