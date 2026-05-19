import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiErrorDetail } from "../lib/api";
import { ArrowLeft, Clock, CheckCircle2 } from "lucide-react";

const STAR_URL = "https://static.prod-images.emergentagent.com/jobs/151314fa-6f88-4a3d-a39f-0044b194f5e9/images/5f587837e7ac036a02af75fb2b488a2a8b33429167fae318cb66d294e807a889.png";

const FEELINGS = [
    { key: "bad", emoji: "😖", label: "Tough" },
    { key: "okay", emoji: "😐", label: "Okay" },
    { key: "good", emoji: "😄", label: "Great" },
];
const DIFFICULTIES = [
    { key: "easy", label: "Easy", color: "bg-[#06D6A0]/15 text-[#057a5b] border-[#06D6A0]" },
    { key: "medium", label: "Medium", color: "bg-[#FFD166]/30 text-[#876200] border-[#E5BC5C]" },
    { key: "hard", label: "Hard", color: "bg-[#EF476F]/15 text-[#9b1c3c] border-[#EF476F]" },
];

export default function MissionDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [mission, setMission] = useState(null);
    const [skills, setSkills] = useState([]);
    const [strategies, setStrategies] = useState([]);
    const [checkedSteps, setCheckedSteps] = useState({});
    const [usedStrategies, setUsedStrategies] = useState(false);
    const [difficulty, setDifficulty] = useState(null);
    const [feeling, setFeeling] = useState(null);
    const [note, setNote] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [postStreak, setPostStreak] = useState(null);
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);

    const stratMap = useMemo(() => Object.fromEntries(strategies.map((s) => [s.id, s])), [strategies]);
    const skillMap = useMemo(() => Object.fromEntries(skills.map((s) => [s.id, s])), [skills]);

    useEffect(() => {
        (async () => {
            const [m, sk, st] = await Promise.all([
                api.get(`/missions/${id}`),
                api.get("/skills"),
                api.get("/strategies"),
            ]);
            setMission(m.data);
            setSkills(sk.data);
            setStrategies(st.data);
        })();
    }, [id]);

    const allStepsDone = mission && mission.steps.length > 0 && mission.steps.every((_, i) => checkedSteps[i]);

    const submit = async () => {
        if (!feeling || !difficulty) {
            setErr("Pick how it felt and how hard it was.");
            return;
        }
        setBusy(true);
        setErr("");
        try {
            await api.post(`/missions/${id}/log`, {
                status: "completed",
                used_strategies: usedStrategies,
                difficulty_rating: difficulty,
                feeling,
                note,
            });
            try {
                const { data } = await api.get("/streak");
                setPostStreak(data);
            } catch { /* non-blocking */ }
            setSubmitted(true);
        } catch (e) {
            setErr(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally {
            setBusy(false);
        }
    };

    if (!mission) {
        return (
            <div className="min-h-screen">
                <Navbar />
                <p className="text-center mt-20 text-[#4A5568] font-bold" data-testid="mission-detail-loading">Loading mission…</p>
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="min-h-screen" data-testid="mission-success">
                <Navbar />
                <main className="max-w-2xl mx-auto p-6 md:p-10 text-center">
                    <img src={STAR_URL} alt="Reward" className="h-40 w-40 mx-auto drop-shadow-xl" />
                    <h1 className="font-display font-extrabold text-4xl text-[#0B132B] mt-4">Mission complete! 🎉</h1>
                    <p className="text-[#4A5568] font-semibold mt-2">Awesome reflection. Your parent will see it in their logs.</p>
                    {postStreak && (
                        <div className="mt-5 inline-flex items-center gap-2 rounded-2xl border-2 border-[#EF476F] bg-[#EF476F]/10 px-4 py-2" data-testid="mission-success-streak">
                            <span className="text-2xl">🔥</span>
                            <span className="font-display font-bold text-lg text-[#0B132B]">
                                {postStreak.current_streak} day streak
                            </span>
                        </div>
                    )}
                    <div className="mt-6">
                        <button onClick={() => navigate("/student")} className="btn-pop-primary" data-testid="mission-success-back">
                            Back to missions
                        </button>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen" data-testid="mission-detail-page">
            <Navbar />
            <main className="max-w-2xl mx-auto p-6 md:p-10 space-y-6">
                <Link to="/student" className="inline-flex items-center gap-2 text-sm font-bold text-[#4361EE]" data-testid="mission-detail-back">
                    <ArrowLeft size={16} /> Back to missions
                </Link>

                <section className="mb-card p-6">
                    <h1 className="font-display font-extrabold text-3xl text-[#0B132B]" data-testid="mission-detail-title">{mission.title}</h1>
                    {mission.description && <p className="text-[#4A5568] font-semibold mt-2">{mission.description}</p>}
                    <div className="flex items-center gap-2 text-sm font-bold text-[#4A5568] mt-3">
                        <Clock size={14} /> {mission.estimated_minutes} min
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                        {mission.skill_ids.map((sid) => skillMap[sid] && (
                            <span key={sid} className="mb-chip bg-[#4361EE]/10 text-[#4361EE]">{skillMap[sid].name}</span>
                        ))}
                    </div>
                </section>

                {mission.strategy_ids.length > 0 && (
                    <section className="mb-card p-6" data-testid="mission-detail-strategies">
                        <h2 className="font-display font-bold text-xl text-[#0B132B] mb-3">Try these strategies</h2>
                        <div className="grid sm:grid-cols-2 gap-3">
                            {mission.strategy_ids.map((sid) => {
                                const s = stratMap[sid];
                                if (!s) return null;
                                return (
                                    <div key={sid} className="rounded-2xl border-2 border-[#FFD166] bg-[#FFD166]/15 p-4">
                                        <div className="text-3xl mb-1">{s.emoji}</div>
                                        <div className="font-display font-bold text-[#0B132B]">{s.name}</div>
                                        <div className="text-sm font-semibold text-[#4A5568]">{s.description}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                <section className="mb-card p-6">
                    <h2 className="font-display font-bold text-xl text-[#0B132B] mb-3">Steps</h2>
                    <ul className="space-y-2" data-testid="mission-detail-steps">
                        {mission.steps.map((s, i) => {
                            const checked = !!checkedSteps[i];
                            return (
                                <li key={i}>
                                    <button
                                        type="button"
                                        onClick={() => setCheckedSteps({ ...checkedSteps, [i]: !checked })}
                                        className={`w-full text-left flex items-center gap-3 rounded-2xl border-2 p-3 transition-all ${
                                            checked ? "bg-[#06D6A0]/10 border-[#06D6A0]" : "bg-white border-[#E2E8F0] hover:border-[#4361EE]"
                                        }`}
                                        data-testid={`mission-detail-step-${i}`}
                                    >
                                        <span className={`h-7 w-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${checked ? "border-[#06D6A0] bg-[#06D6A0] text-white" : "border-[#A0AEC0]"}`}>
                                            {checked && <CheckCircle2 size={16} />}
                                        </span>
                                        <span className={`font-bold ${checked ? "text-[#057a5b] line-through" : "text-[#0B132B]"}`}>{s}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </section>

                <section className="mb-card p-6" data-testid="mission-reflection">
                    <h2 className="font-display font-bold text-xl text-[#0B132B] mb-1">Quick reflection</h2>
                    <p className="text-sm font-semibold text-[#4A5568] mb-4">Tap the answers that fit best.</p>

                    <div className="mb-5">
                        <p className="text-sm font-bold text-[#0B132B] mb-2">How did it feel?</p>
                        <div className="grid grid-cols-3 gap-3">
                            {FEELINGS.map((f) => (
                                <button
                                    key={f.key}
                                    type="button"
                                    onClick={() => setFeeling(f.key)}
                                    className={`h-24 rounded-2xl border-4 font-bold flex flex-col items-center justify-center transition-all ${
                                        feeling === f.key
                                            ? "border-[#4361EE] bg-[#4361EE]/10"
                                            : "border-[#E2E8F0] bg-white hover:border-[#A0AEC0]"
                                    }`}
                                    data-testid={`reflection-feeling-${f.key}`}
                                >
                                    <span className="text-3xl">{f.emoji}</span>
                                    <span className="text-xs uppercase tracking-widest text-[#4A5568] mt-1">{f.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mb-5">
                        <p className="text-sm font-bold text-[#0B132B] mb-2">How hard was it?</p>
                        <div className="grid grid-cols-3 gap-3">
                            {DIFFICULTIES.map((d) => (
                                <button
                                    key={d.key}
                                    type="button"
                                    onClick={() => setDifficulty(d.key)}
                                    className={`h-14 rounded-2xl border-2 font-bold transition-all ${
                                        difficulty === d.key ? `${d.color}` : "border-[#E2E8F0] bg-white text-[#0B132B] hover:border-[#A0AEC0]"
                                    }`}
                                    data-testid={`reflection-difficulty-${d.key}`}
                                >
                                    {d.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mb-5">
                        <button
                            type="button"
                            onClick={() => setUsedStrategies(!usedStrategies)}
                            className={`w-full flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all ${
                                usedStrategies ? "bg-[#06D6A0]/10 border-[#06D6A0]" : "bg-white border-[#E2E8F0] hover:border-[#A0AEC0]"
                            }`}
                            data-testid="reflection-used-strategies"
                        >
                            <span className={`h-6 w-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${usedStrategies ? "border-[#06D6A0] bg-[#06D6A0] text-white" : "border-[#A0AEC0]"}`}>
                                {usedStrategies && <CheckCircle2 size={14} />}
                            </span>
                            <span className="font-bold text-[#0B132B]">I used one of the strategies</span>
                        </button>
                    </div>

                    <div className="mb-5">
                        <p className="text-sm font-bold text-[#0B132B] mb-2">Anything to add? (optional)</p>
                        <textarea
                            rows={3}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="One thing I noticed…"
                            className="mb-input pt-3 h-auto"
                            data-testid="reflection-note"
                        />
                    </div>

                    {err && <p className="text-sm font-bold text-[#EF476F] bg-[#EF476F]/10 rounded-xl px-3 py-2 mb-3" data-testid="reflection-error">{err}</p>}

                    <button
                        onClick={submit}
                        disabled={busy || !allStepsDone}
                        className="btn-pop-accent w-full disabled:opacity-50 disabled:cursor-not-allowed"
                        data-testid="reflection-submit"
                    >
                        {allStepsDone ? (busy ? "Saving…" : "Finish mission ✨") : "Check off all steps first"}
                    </button>
                </section>
            </main>
        </div>
    );
}
