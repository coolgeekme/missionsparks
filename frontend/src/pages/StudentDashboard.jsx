import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import AvatarPickerModal from "../components/AvatarPickerModal";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import {
    Clock, Sparkles, CheckCircle2, Zap, Heart, ChevronLeft, ChevronRight, Calendar, Eye, Smile,
} from "lucide-react";

const isoDate = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.toISOString().slice(0, 10);
};
const todayISO = () => isoDate(new Date());
const addDays = (iso, n) => {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return isoDate(d);
};
const ROCKET_URL = "https://static.prod-images.emergentagent.com/jobs/151314fa-6f88-4a3d-a39f-0044b194f5e9/images/1ec739dfedecb93df2ad320aeb4f02b79070a29d4126c045ddb5fc82ecf1c875.png";
const STAR_URL = "https://static.prod-images.emergentagent.com/jobs/151314fa-6f88-4a3d-a39f-0044b194f5e9/images/5f587837e7ac036a02af75fb2b488a2a8b33429167fae318cb66d294e807a889.png";
const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const friendlyDate = (iso) => {
    const today = todayISO();
    if (iso === today) return "Today";
    if (iso === addDays(today, -1)) return "Yesterday";
    if (iso === addDays(today, 1)) return "Tomorrow";
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
};

export default function StudentDashboard() {
    const { user } = useAuth();
    const [missions, setMissions] = useState([]);
    const [logs, setLogs] = useState([]);
    const [skills, setSkills] = useState([]);
    const [strategies, setStrategies] = useState([]);
    const [streak, setStreak] = useState(null);
    const [selectedDate, setSelectedDate] = useState(todayISO());
    const [showAvatarPicker, setShowAvatarPicker] = useState(false);

    const skillMap = useMemo(() => Object.fromEntries(skills.map((s) => [s.id, s])), [skills]);
    const stratMap = useMemo(() => Object.fromEntries(strategies.map((s) => [s.id, s])), [strategies]);

    const loadMissions = useCallback(async (date) => {
        const m = await api.get("/missions", { params: { due_date: date } });
        setMissions(m.data);
    }, []);

    useEffect(() => {
        (async () => {
            const [l, sk, st, sr] = await Promise.all([
                api.get("/logs"),
                api.get("/skills"),
                api.get("/strategies"),
                api.get("/streak"),
            ]);
            setLogs(l.data);
            setSkills(sk.data);
            setStrategies(st.data);
            setStreak(sr.data);
        })();
    }, []);

    useEffect(() => { loadMissions(selectedDate); }, [selectedDate, loadMissions]);

    const latestLogByMission = useMemo(() => {
        const map = {};
        for (const l of logs) if (!map[l.mission_id]) map[l.mission_id] = l;
        return map;
    }, [logs]);

    const completed = missions.filter((m) => latestLogByMission[m.id]?.status === "completed").length;
    const total = missions.length;
    const isToday = selectedDate === todayISO();
    const isFuture = selectedDate > todayISO();
    const allDone = isToday && total > 0 && completed === total;

    return (
        <div className="min-h-screen" data-testid="student-dashboard">
            <Navbar />
            <main className="max-w-5xl mx-auto p-6 md:p-10 space-y-8">
                <header className="mb-card p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6">
                    <img src={ROCKET_URL} alt="Rocket" className="h-28 w-28 object-contain drop-shadow-lg" data-testid="student-hero-rocket" />
                    <div className="flex-1 text-center sm:text-left">
                        <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286]">Mission control</p>
                        <h1 className="font-display font-extrabold text-4xl sm:text-5xl text-[#201D18] mt-1">
                            Hi, {user?.name?.split(" ")[0] || "friend"}! 🚀
                        </h1>
                        <p className="text-[#6E675B] font-semibold mt-2" data-testid="student-summary">
                            {!isToday
                                ? <>You&apos;re looking at <span className="text-[#E4572E]">{friendlyDate(selectedDate)}</span>.</>
                                : (allDone
                                    ? "You crushed every mission today. Legend."
                                    : (<>You&apos;ve got <span className="text-[#E4572E]">{total - completed}</span> mission{total - completed === 1 ? "" : "s"} left today.</>))
                            }
                        </p>
                        {isToday && total > 0 && (
                            <div className="mt-3 flex items-center gap-2 justify-center sm:justify-start">
                                <div className="h-3 flex-1 max-w-xs bg-[#E8E0D2] rounded-full overflow-hidden">
                                    <div className="h-full bg-[#3F8C5E] transition-all" style={{ width: total ? `${(completed / total) * 100}%` : "0%" }} data-testid="student-progress-bar" />
                                </div>
                                <span className="text-sm font-bold text-[#6E675B]" data-testid="student-progress-label">{completed}/{total}</span>
                            </div>
                        )}
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <Link to="/student/checkin" className="btn-pop-secondary inline-flex items-center gap-2 text-sm py-2" data-testid="student-checkin-btn">
                                <Heart size={14} /> How am I feeling?
                            </Link>
                            <Link to="/games" className="btn-pop-ghost inline-flex items-center gap-2 text-sm py-2" data-testid="student-games-btn">
                                <Sparkles size={14} /> Mini-games
                            </Link>
                            <button
                                onClick={() => setShowAvatarPicker(true)}
                                className="btn-pop-ghost inline-flex items-center gap-2 text-sm py-2"
                                data-testid="student-avatar-edit-btn"
                            >
                                <Smile size={14} /> My tile
                            </button>
                        </div>
                    </div>
                </header>

                {streak && isToday && (
                    <section
                        className={`mb-card p-6 sm:p-7 ${allDone ? "border-[#E8A33D] bg-gradient-to-br from-white to-[#F7ECD8]" : ""}`}
                        data-testid="student-streak-card"
                    >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
                            <div className="flex items-center gap-4">
                                <div className={`relative h-16 w-16 rounded-2xl flex items-center justify-center ${streak.current_streak > 0 ? "bg-[#E8A33D]/30 text-[#8A6413]" : "bg-[#E8E0D2] text-[#9A9286]"}`} data-testid="student-streak-icon">
                                    <Zap size={32} fill="currentColor" className={streak.current_streak > 0 ? "animate-pulse" : ""} />
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286]">Spark streak</p>
                                    <p className="font-display font-extrabold text-3xl text-[#201D18] leading-none" data-testid="student-streak-current">
                                        {streak.current_streak} day{streak.current_streak === 1 ? "" : "s"}
                                    </p>
                                    <p className="text-sm font-bold text-[#6E675B] mt-1">
                                        {streak.longest_streak > streak.current_streak
                                            ? <>Personal best: <span className="text-[#201D18]">{streak.longest_streak} days</span></>
                                            : (streak.current_streak >= 2 ? "⚡ You're sparking!" : "Finish a mission today to light your first spark.")}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-end gap-2" data-testid="student-streak-week">
                                {streak.week.map((d) => {
                                    const kind = d.kind || (d.completed ? "completed" : "missed");
                                    const cls = {
                                        completed: "bg-[#3F8C5E] border-[#3F8C5E] text-white",
                                        freeze: "bg-[#4C9A6B]/15 border-[#4C9A6B] text-[#4C9A6B]",
                                        weekend: "bg-[#FBF6EE] border-dashed border-[#9A9286] text-[#9A9286]",
                                        missed: "bg-white border-[#BC4B32]/30 text-[#BC4B32]/70",
                                        pending: "bg-white border-[#E4572E] text-[#E4572E]",
                                    }[kind] || "bg-white border-[#E8E0D2] text-[#9A9286]";
                                    const label = {
                                        completed: <CheckCircle2 size={18} />,
                                        freeze: <span className="text-base" aria-label="freeze">❄</span>,
                                        weekend: <span className="text-xs font-bold">·</span>,
                                    }[kind] || <span className="text-xs font-extrabold">{Number(d.date.slice(-2))}</span>;
                                    return (
                                        <div key={d.date} className="flex flex-col items-center gap-1" data-testid={`streak-day-${kind}`}>
                                            <div className={`h-9 w-9 rounded-xl flex items-center justify-center border-2 ${cls}`} title={`${d.date} · ${kind}`}>
                                                {label}
                                            </div>
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#9A9286]">
                                                {DOW_LABELS[new Date(d.date + "T00:00:00").getDay()]}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </section>
                )}

                {allDone && (
                    <section className="mb-card p-6 sm:p-8 text-center bg-gradient-to-br from-[#E8A33D]/30 to-[#3F8C5E]/15 border-[#E8A33D]" data-testid="student-all-done">
                        <img src={STAR_URL} alt="Star" className="h-24 w-24 mx-auto drop-shadow-lg" />
                        <h2 className="font-display font-extrabold text-3xl text-[#201D18] mt-2">All missions complete! 🎉</h2>
                        <p className="text-[#6E675B] font-semibold mt-1">
                            Your spark streak is now <span className="text-[#8A6413] font-extrabold">{streak?.current_streak ?? 0} day{(streak?.current_streak ?? 0) === 1 ? "" : "s"}</span> long. Come back tomorrow to add another spark.
                        </p>
                    </section>
                )}

                <section>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <h2 className="font-display font-bold text-2xl text-[#201D18] flex items-center gap-2">
                            <Sparkles className="text-[#E8A33D]" size={22} /> {friendlyDate(selectedDate)}&apos;s missions
                        </h2>
                        <div className="flex items-center gap-2" data-testid="date-strip">
                            <button
                                onClick={() => setSelectedDate(addDays(selectedDate, -1))}
                                className="btn-pop-ghost p-2"
                                data-testid="date-prev"
                                aria-label="Previous day"
                            ><ChevronLeft size={16} /></button>
                            <button
                                onClick={() => setSelectedDate(todayISO())}
                                disabled={isToday}
                                className={`px-3 py-2 rounded-2xl font-bold text-sm border-2 transition-all ${isToday ? "bg-[#E4572E] border-[#E4572E] text-white" : "bg-white border-[#E8E0D2] text-[#6E675B] hover:border-[#E4572E]"}`}
                                data-testid="date-today"
                            >Today</button>
                            <button
                                onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                                className="btn-pop-ghost p-2"
                                data-testid="date-next"
                                aria-label="Next day"
                            ><ChevronRight size={16} /></button>
                            <label className="inline-flex items-center gap-1 ml-1">
                                <Calendar size={14} className="text-[#6E675B]" />
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="rounded-xl border-2 border-[#E8E0D2] px-2 py-1 text-xs font-bold focus:border-[#E4572E] outline-none"
                                    data-testid="date-picker"
                                />
                            </label>
                        </div>
                    </div>
                    {missions.length === 0 ? (
                        <div className="mb-card p-8 text-center" data-testid="student-no-missions">
                            <p className="font-display font-bold text-xl text-[#201D18]">
                                {isFuture ? "Nothing scheduled yet 🌱" : (isToday ? "No missions for today 🎉" : "Nothing on this day 🌙")}
                            </p>
                            <p className="text-[#6E675B] font-semibold mt-1">
                                {isFuture ? "Your grown-up hasn't planned this day yet." : "Enjoy your day off the mission board!"}
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-5 md:grid-cols-2">
                            {missions.map((m) => {
                                const log = latestLogByMission[m.id];
                                const done = log?.status === "completed";
                                const practiceHref = m.mission_type === "reading_passage" && m.linked_passage_id
                                    ? `/student/practice/reading/${m.linked_passage_id}`
                                    : m.mission_type === "writing_prompt" && m.linked_writing_id
                                    ? `/student/practice/writing/${m.linked_writing_id}`
                                    : `/student/missions/${m.id}`;
                                const target = done ? `${practiceHref}?view=1` : practiceHref;
                                return (
                                    <Link
                                        to={target}
                                        key={m.id}
                                        className={`mb-card p-6 block transition-all ${done ? "bg-[#3F8C5E]/8 opacity-90" : "mb-card-hover"}`}
                                        data-testid={`student-mission-${m.id}`}
                                    >
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                            <h3 className={`font-display font-bold text-xl text-[#201D18] leading-tight ${done ? "line-through decoration-[#3F8C5E] decoration-2" : ""}`}>{m.title}</h3>
                                            {done && (
                                                <span className="mb-chip bg-[#3F8C5E]/20 text-[#2F6B47] flex-shrink-0" data-testid={`mission-done-chip-${m.id}`}>
                                                    <CheckCircle2 size={12} /> Done
                                                </span>
                                            )}
                                        </div>
                                        {m.description && <p className="text-[#6E675B] font-semibold text-sm mb-3">{m.description}</p>}
                                        <div className="flex items-center gap-2 text-sm font-bold text-[#6E675B] mb-3">
                                            <Clock size={14} /> {m.estimated_minutes} min{m.mission_type === "standard" && ` · ${m.steps.length} step${m.steps.length === 1 ? "" : "s"}`}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {m.strategy_ids.map((sid) => stratMap[sid] && (
                                                <span key={sid} className="mb-chip bg-[#E8A33D]/30 text-[#8A6413]">{stratMap[sid].emoji} {stratMap[sid].name}</span>
                                            ))}
                                            {m.skill_ids.slice(0, 1).map((sid) => skillMap[sid] && (
                                                <span key={sid} className="mb-chip bg-[#E4572E]/10 text-[#E4572E]">{skillMap[sid].name}</span>
                                            ))}
                                            {m.verification && m.verification !== "trust" && !done && (
                                                <span
                                                    className="mb-chip bg-[#E4572E]/10 text-[#E4572E]"
                                                    data-testid={`mission-verify-badge-${m.id}`}
                                                    title={{
                                                        parent_pin: "Needs a grown-up's PIN",
                                                        photo: "Needs a photo",
                                                        async_review: "Needs a grown-up to review",
                                                    }[m.verification]}
                                                >
                                                    {m.verification === "parent_pin" && "🔐 Grown-up PIN"}
                                                    {m.verification === "photo" && "📸 Photo"}
                                                    {m.verification === "async_review" && "⏳ Review"}
                                                </span>
                                            )}
                                        </div>
                                        {done && (
                                            <p className="text-xs font-bold text-[#2F6B47] mt-3 inline-flex items-center gap-1" data-testid={`mission-view-only-${m.id}`}>
                                                <Eye size={11} /> Tap to view the steps you did
                                            </p>
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </section>
            </main>
            <AvatarPickerModal
                open={showAvatarPicker}
                onClose={() => setShowAvatarPicker(false)}
                initialName={user?.name}
            />
        </div>
    );
}
