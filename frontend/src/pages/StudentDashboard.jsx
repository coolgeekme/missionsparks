import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import {
    Clock, Sparkles, CheckCircle2, Zap, Heart, ChevronLeft, ChevronRight, Calendar, Eye,
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
                        <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">Mission control</p>
                        <h1 className="font-display font-extrabold text-4xl sm:text-5xl text-[#0B132B] mt-1">
                            Hi, {user?.name?.split(" ")[0] || "friend"}! 🚀
                        </h1>
                        <p className="text-[#4A5568] font-semibold mt-2" data-testid="student-summary">
                            {!isToday
                                ? <>You&apos;re looking at <span className="text-[#4361EE]">{friendlyDate(selectedDate)}</span>.</>
                                : (allDone
                                    ? "You crushed every mission today. Legend."
                                    : (<>You&apos;ve got <span className="text-[#4361EE]">{total - completed}</span> mission{total - completed === 1 ? "" : "s"} left today.</>))
                            }
                        </p>
                        {isToday && total > 0 && (
                            <div className="mt-3 flex items-center gap-2 justify-center sm:justify-start">
                                <div className="h-3 flex-1 max-w-xs bg-[#E2E8F0] rounded-full overflow-hidden">
                                    <div className="h-full bg-[#06D6A0] transition-all" style={{ width: total ? `${(completed / total) * 100}%` : "0%" }} data-testid="student-progress-bar" />
                                </div>
                                <span className="text-sm font-bold text-[#4A5568]" data-testid="student-progress-label">{completed}/{total}</span>
                            </div>
                        )}
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <Link to="/student/checkin" className="btn-pop-secondary inline-flex items-center gap-2 text-sm py-2" data-testid="student-checkin-btn">
                                <Heart size={14} /> How am I feeling?
                            </Link>
                            <Link to="/games" className="btn-pop-ghost inline-flex items-center gap-2 text-sm py-2" data-testid="student-games-btn">
                                <Sparkles size={14} /> Mini-games
                            </Link>
                        </div>
                    </div>
                </header>

                {streak && isToday && (
                    <section
                        className={`mb-card p-6 sm:p-7 ${allDone ? "border-[#FFD166] bg-gradient-to-br from-white to-[#FFF8E1]" : ""}`}
                        data-testid="student-streak-card"
                    >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
                            <div className="flex items-center gap-4">
                                <div className={`relative h-16 w-16 rounded-2xl flex items-center justify-center ${streak.current_streak > 0 ? "bg-[#FFD166]/30 text-[#876200]" : "bg-[#E2E8F0] text-[#A0AEC0]"}`} data-testid="student-streak-icon">
                                    <Zap size={32} fill="currentColor" className={streak.current_streak > 0 ? "animate-pulse" : ""} />
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">Spark streak</p>
                                    <p className="font-display font-extrabold text-3xl text-[#0B132B] leading-none" data-testid="student-streak-current">
                                        {streak.current_streak} day{streak.current_streak === 1 ? "" : "s"}
                                    </p>
                                    <p className="text-sm font-bold text-[#4A5568] mt-1">
                                        {streak.longest_streak > streak.current_streak
                                            ? <>Personal best: <span className="text-[#0B132B]">{streak.longest_streak} days</span></>
                                            : (streak.current_streak >= 2 ? "⚡ You're sparking!" : "Finish a mission today to light your first spark.")}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-end gap-2" data-testid="student-streak-week">
                                {streak.week.map((d) => (
                                    <div key={d.date} className="flex flex-col items-center gap-1">
                                        <div className={`h-9 w-9 rounded-xl flex items-center justify-center border-2 ${d.completed ? "bg-[#06D6A0] border-[#06D6A0] text-white" : d.is_today ? "bg-white border-[#4361EE] text-[#4361EE]" : "bg-white border-[#E2E8F0] text-[#A0AEC0]"}`} title={d.date}>
                                            {d.completed ? <CheckCircle2 size={18} /> : <span className="text-xs font-extrabold">{Number(d.date.slice(-2))}</span>}
                                        </div>
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#A0AEC0]">
                                            {DOW_LABELS[new Date(d.date + "T00:00:00").getDay()]}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                )}

                {allDone && (
                    <section className="mb-card p-6 sm:p-8 text-center bg-gradient-to-br from-[#FFD166]/30 to-[#06D6A0]/15 border-[#FFD166]" data-testid="student-all-done">
                        <img src={STAR_URL} alt="Star" className="h-24 w-24 mx-auto drop-shadow-lg" />
                        <h2 className="font-display font-extrabold text-3xl text-[#0B132B] mt-2">All missions complete! 🎉</h2>
                        <p className="text-[#4A5568] font-semibold mt-1">
                            Your spark streak is now <span className="text-[#876200] font-extrabold">{streak?.current_streak ?? 0} day{(streak?.current_streak ?? 0) === 1 ? "" : "s"}</span> long. Come back tomorrow to add another spark.
                        </p>
                    </section>
                )}

                <section>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <h2 className="font-display font-bold text-2xl text-[#0B132B] flex items-center gap-2">
                            <Sparkles className="text-[#FFD166]" size={22} /> {friendlyDate(selectedDate)}&apos;s missions
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
                                className={`px-3 py-2 rounded-2xl font-bold text-sm border-2 transition-all ${isToday ? "bg-[#4361EE] border-[#4361EE] text-white" : "bg-white border-[#E2E8F0] text-[#4A5568] hover:border-[#4361EE]"}`}
                                data-testid="date-today"
                            >Today</button>
                            <button
                                onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                                className="btn-pop-ghost p-2"
                                data-testid="date-next"
                                aria-label="Next day"
                            ><ChevronRight size={16} /></button>
                            <label className="inline-flex items-center gap-1 ml-1">
                                <Calendar size={14} className="text-[#4A5568]" />
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="rounded-xl border-2 border-[#E2E8F0] px-2 py-1 text-xs font-bold focus:border-[#4361EE] outline-none"
                                    data-testid="date-picker"
                                />
                            </label>
                        </div>
                    </div>
                    {missions.length === 0 ? (
                        <div className="mb-card p-8 text-center" data-testid="student-no-missions">
                            <p className="font-display font-bold text-xl text-[#0B132B]">
                                {isFuture ? "Nothing scheduled yet 🌱" : (isToday ? "No missions for today 🎉" : "Nothing on this day 🌙")}
                            </p>
                            <p className="text-[#4A5568] font-semibold mt-1">
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
                                        className={`mb-card p-6 block transition-all ${done ? "bg-[#06D6A0]/8 opacity-90" : "mb-card-hover"}`}
                                        data-testid={`student-mission-${m.id}`}
                                    >
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                            <h3 className={`font-display font-bold text-xl text-[#0B132B] leading-tight ${done ? "line-through decoration-[#06D6A0] decoration-2" : ""}`}>{m.title}</h3>
                                            {done && (
                                                <span className="mb-chip bg-[#06D6A0]/20 text-[#057a5b] flex-shrink-0" data-testid={`mission-done-chip-${m.id}`}>
                                                    <CheckCircle2 size={12} /> Done
                                                </span>
                                            )}
                                        </div>
                                        {m.description && <p className="text-[#4A5568] font-semibold text-sm mb-3">{m.description}</p>}
                                        <div className="flex items-center gap-2 text-sm font-bold text-[#4A5568] mb-3">
                                            <Clock size={14} /> {m.estimated_minutes} min{m.mission_type === "standard" && ` · ${m.steps.length} step${m.steps.length === 1 ? "" : "s"}`}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {m.strategy_ids.map((sid) => stratMap[sid] && (
                                                <span key={sid} className="mb-chip bg-[#FFD166]/30 text-[#876200]">{stratMap[sid].emoji} {stratMap[sid].name}</span>
                                            ))}
                                            {m.skill_ids.slice(0, 1).map((sid) => skillMap[sid] && (
                                                <span key={sid} className="mb-chip bg-[#4361EE]/10 text-[#4361EE]">{skillMap[sid].name}</span>
                                            ))}
                                        </div>
                                        {done && (
                                            <p className="text-xs font-bold text-[#057a5b] mt-3 inline-flex items-center gap-1" data-testid={`mission-view-only-${m.id}`}>
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
        </div>
    );
}
