import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import MissionTimer from "../components/MissionTimer";
import VerificationGateModal from "../components/VerificationGateModal";
import { api, formatApiErrorDetail } from "../lib/api";
import { ArrowLeft, Clock, CheckCircle2, Plus, X, Gamepad2, Zap, Eye, Shield, Camera } from "lucide-react";

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
    const [search] = useSearchParams();
    const viewParam = search.get("view") === "1";
    const [mission, setMission] = useState(null);
    const [skills, setSkills] = useState([]);
    const [strategies, setStrategies] = useState([]);
    const [checkedSteps, setCheckedSteps] = useState({});
    const [usedStrategies, setUsedStrategies] = useState(false);
    const [difficulty, setDifficulty] = useState(null);
    const [feeling, setFeeling] = useState(null);
    const [note, setNote] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [createdLogId, setCreatedLogId] = useState(null);
    const [postStreak, setPostStreak] = useState(null);
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    const [priorLog, setPriorLog] = useState(null);
    // Verification gate (Iter 21)
    const [showVerifyGate, setShowVerifyGate] = useState(false);
    const [pendingReview, setPendingReview] = useState(false);

    // Read-only mode kicks in when this mission already has a completed log
    // (either passed ?view=1 from the dashboard, or a kid revisits it directly).
    const viewOnly = (viewParam || !!priorLog) && priorLog?.status === "completed";

    // Clue captures (works for digital + audio books)
    const [clueDraft, setClueDraft] = useState("");
    const [clues, setClues] = useState([]);

    const stratMap = useMemo(() => Object.fromEntries(strategies.map((s) => [s.id, s])), [strategies]);
    const skillMap = useMemo(() => Object.fromEntries(skills.map((s) => [s.id, s])), [skills]);

    // Clue captures are reading-specific. Only show on missions that target
    // Reading skills OR use a reading-focused strategy.
    const READING_STRATEGY_NAMES = new Set([
        "Underline clues", "Jot a clue", "Picture it", "Ask a question", "Re-read", "Slow down mode",
    ]);
    const isReadingMission = useMemo(() => {
        if (!mission) return false;
        const hasReadingSkill = (mission.skill_ids || []).some((sid) => skillMap[sid]?.category === "Reading");
        const hasReadingStrategy = (mission.strategy_ids || []).some((sid) => READING_STRATEGY_NAMES.has(stratMap[sid]?.name));
        return hasReadingSkill || hasReadingStrategy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mission, skillMap, stratMap]);

    useEffect(() => {
        (async () => {
            const [m, sk, st, lg] = await Promise.all([
                api.get(`/missions/${id}`),
                api.get("/skills"),
                api.get("/strategies"),
                api.get("/logs", { params: { mission_id: id } }).catch(() => ({ data: [] })),
            ]);
            setMission(m.data);
            setSkills(sk.data);
            setStrategies(st.data);
            const completedLog = (lg.data || []).find((row) => row.status === "completed");
            if (completedLog) {
                setPriorLog(completedLog);
                // Pre-fill display state so the kid can see what they did
                const stepMap = {};
                (m.data.steps || []).forEach((_, i) => { stepMap[i] = true; });
                setCheckedSteps(stepMap);
                setDifficulty(completedLog.difficulty_rating);
                setFeeling(completedLog.feeling);
                setNote(completedLog.note || "");
                setUsedStrategies(!!completedLog.used_strategies);
                setClues(completedLog.clue_captures || []);
            }
        })();
    }, [id]);

    const allStepsDone = mission && mission.steps.length > 0 && mission.steps.every((_, i) => checkedSteps[i]);

    const submit = async () => {
        if (!feeling || !difficulty) {
            setErr("Pick how it felt and how hard it was.");
            return;
        }
        setErr("");
        // Route through the verification gate if this mission requires it.
        const verification = mission?.verification || "trust";
        if (verification !== "trust") {
            setShowVerifyGate(true);
            return;
        }
        await sendLog({});
    };

    // Actually POSTs the log. Called directly for trust missions, or via the
    // verification gate's onProceed callback (which supplies parent_verify_token /
    // photo_data / nothing depending on the mode).
    const sendLog = async (extra) => {
        setBusy(true);
        setErr("");
        try {
            const { data: createdLog } = await api.post(`/missions/${id}/log`, {
                status: "completed",
                used_strategies: usedStrategies,
                difficulty_rating: difficulty,
                feeling,
                note,
                clue_captures: clues,
                ...extra,
            });
            setCreatedLogId(createdLog.id);
            if (createdLog.verification_status === "pending") {
                setPendingReview(true);
            }
            try {
                const { data } = await api.get("/streak");
                setPostStreak(data);
            } catch { /* non-blocking */ }
            setSubmitted(true);
            setShowVerifyGate(false);
        } catch (e) {
            setErr(formatApiErrorDetail(e.response?.data?.detail) || e.message);
            // Keep the verification modal open if it was source of the call so the
            // kid can re-try (bad PIN, missing photo, etc).
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
        if (pendingReview) {
            return (
                <div className="min-h-screen" data-testid="mission-pending-review">
                    <Navbar />
                    <main className="max-w-2xl mx-auto p-6 md:p-10 text-center">
                        <div className="h-32 w-32 rounded-full bg-[#4361EE]/10 flex items-center justify-center mx-auto">
                            <Clock size={64} className="text-[#4361EE]" />
                        </div>
                        <h1 className="font-display font-extrabold text-4xl text-[#0B132B] mt-6">Sent for review ⏳</h1>
                        <p className="text-[#4A5568] font-semibold mt-2 max-w-md mx-auto">
                            Great work! A grown-up will look at what you did and give you the spark.
                            You'll see it once they approve.
                        </p>
                        <div className="mt-8">
                            <Link to="/student" className="btn-pop-primary inline-flex items-center gap-2" data-testid="pending-review-home">
                                Back to my missions
                            </Link>
                        </div>
                    </main>
                </div>
            );
        }
        return (
            <div className="min-h-screen" data-testid="mission-success">
                <Navbar />
                <main className="max-w-2xl mx-auto p-6 md:p-10 text-center">
                    <img src={STAR_URL} alt="Reward" className="h-40 w-40 mx-auto drop-shadow-xl" />
                    <h1 className="font-display font-extrabold text-4xl text-[#0B132B] mt-4">Mission complete! 🎉</h1>
                    <p className="text-[#4A5568] font-semibold mt-2">Awesome reflection. Your parent will see it in their logs.</p>
                    {postStreak && (
                        <div className="mt-5 inline-flex items-center gap-2 rounded-2xl border-2 border-[#FFD166] bg-[#FFD166]/20 px-4 py-2" data-testid="mission-success-streak">
                            <Zap size={22} fill="currentColor" className="text-[#876200]" />
                            <span className="font-display font-bold text-lg text-[#0B132B]">
                                +1 spark · {postStreak.current_streak} day streak
                            </span>
                        </div>
                    )}
                    <div className="mt-7 mb-card p-5 bg-gradient-to-br from-white to-[#FFF8E1] border-[#FFD166]">
                        <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">Reward unlocked</p>
                        <h2 className="font-display font-extrabold text-2xl text-[#0B132B] mt-1">Pick a mini-game 🎮</h2>
                        <p className="text-sm font-semibold text-[#4A5568] mt-1">One game on the house for finishing your mission.</p>
                        <button
                            onClick={() => navigate(`/student/play/${createdLogId}`)}
                            disabled={!createdLogId}
                            className="btn-pop-secondary mt-4 inline-flex items-center gap-2 disabled:opacity-50"
                            data-testid="mission-success-play"
                        >
                            <Gamepad2 size={16} /> Play now
                        </button>
                    </div>
                    <div className="mt-4">
                        <button onClick={() => navigate("/student")} className="btn-pop-ghost" data-testid="mission-success-back">
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
                    <div className="flex items-center gap-2 text-sm font-bold text-[#4A5568] mt-3 flex-wrap">
                        <span className="inline-flex items-center gap-1"><Clock size={14} /> {mission.estimated_minutes} min</span>
                        {mission.verification && mission.verification !== "trust" && (
                            <span
                                className="inline-flex items-center gap-1 rounded-full bg-[#4361EE]/10 text-[#4361EE] px-2 py-0.5 text-[11px]"
                                data-testid={`mission-detail-verification-${mission.verification}`}
                                title={{
                                    parent_pin: "Requires a grown-up's PIN at the end.",
                                    photo: "Requires a photo of your work.",
                                    async_review: "A grown-up reviews before it counts.",
                                }[mission.verification]}
                            >
                                {mission.verification === "parent_pin" && <><Shield size={11} /> Grown-up PIN</>}
                                {mission.verification === "photo" && <><Camera size={11} /> Photo proof</>}
                                {mission.verification === "async_review" && <>⏳ Grown-up review</>}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                        {mission.skill_ids.map((sid) => skillMap[sid] && (
                            <span key={sid} className="mb-chip bg-[#4361EE]/10 text-[#4361EE]">{skillMap[sid].name}</span>
                        ))}
                    </div>
                    {viewOnly && (
                        <div className="mt-4 rounded-2xl bg-[#06D6A0]/10 border-2 border-[#06D6A0]/40 p-4 flex items-start gap-3" data-testid="mission-view-only-banner">
                            <Eye className="text-[#057a5b] flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold text-[#0B132B]">You already crushed this mission ✅</p>
                                <p className="text-sm font-semibold text-[#4A5568] mt-1">
                                    Here are the steps and what you said about it. You can&apos;t redo it — your spark for this one is already locked in!
                                </p>
                            </div>
                        </div>
                    )}
                </section>

                <MissionTimer estimatedMinutes={mission.estimated_minutes} />

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

                {isReadingMission && (
                    <section className="mb-card p-6" data-testid="mission-detail-clues">
                    <h2 className="font-display font-bold text-xl text-[#0B132B] mb-1">📝 Clue captures</h2>
                    <p className="text-sm font-semibold text-[#4A5568] mb-3">
                        {viewOnly
                            ? "The clues you saved during this mission:"
                            : "Reading on a screen or listening to an audiobook? Type the line or paraphrase what you heard. Paper readers can still underline — both work."}
                    </p>
                    {!viewOnly && (
                    <div className="flex gap-2">
                        <input
                            value={clueDraft}
                            onChange={(e) => setClueDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && clueDraft.trim()) {
                                    e.preventDefault();
                                    setClues([...clues, clueDraft.trim()]);
                                    setClueDraft("");
                                }
                            }}
                            placeholder="e.g. 'Roz held very still so the geese wouldn't fly away.'"
                            className="mb-input flex-1"
                            data-testid="mission-detail-clue-input"
                        />
                        <button
                            type="button"
                            disabled={!clueDraft.trim()}
                            onClick={() => { setClues([...clues, clueDraft.trim()]); setClueDraft(""); }}
                            className="btn-pop-primary px-4 py-3 disabled:opacity-50 flex items-center gap-2"
                            data-testid="mission-detail-clue-add"
                        >
                            <Plus size={16} /> Add
                        </button>
                    </div>
                    )}
                    {clues.length > 0 && (
                        <ul className="mt-3 space-y-2" data-testid="mission-detail-clue-list">
                            {clues.map((c, i) => (
                                <li key={i} className="flex items-start gap-2 rounded-2xl bg-[#F0F8FF] border-2 border-[#E2E8F0] p-3" data-testid={`mission-detail-clue-${i}`}>
                                    <span className="mb-chip bg-[#4361EE]/10 text-[#4361EE] flex-shrink-0">#{i + 1}</span>
                                    <span className="font-semibold text-[#0B132B] flex-1">{c}</span>
                                    {!viewOnly && (
                                    <button
                                        type="button"
                                        onClick={() => setClues(clues.filter((_, idx) => idx !== i))}
                                        className="p-1 rounded-lg hover:bg-[#EF476F]/10"
                                        aria-label="remove clue"
                                        data-testid={`mission-detail-clue-remove-${i}`}
                                    >
                                        <X size={14} className="text-[#EF476F]" />
                                    </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
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
                                        onClick={() => !viewOnly && setCheckedSteps({ ...checkedSteps, [i]: !checked })}
                                        disabled={viewOnly}
                                        className={`w-full text-left flex items-center gap-3 rounded-2xl border-2 p-3 transition-all ${
                                            checked ? "bg-[#06D6A0]/10 border-[#06D6A0]" : "bg-white border-[#E2E8F0] hover:border-[#4361EE]"
                                        } ${viewOnly ? "cursor-not-allowed opacity-90" : ""}`}
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

                {!viewOnly && (
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
                )}
            </main>
            <VerificationGateModal
                open={showVerifyGate}
                mode={mission?.verification}
                missionId={id}
                missionTitle={mission?.title}
                onClose={() => setShowVerifyGate(false)}
                onProceed={(extra) => sendLog(extra)}
            />
        </div>
    );
}
