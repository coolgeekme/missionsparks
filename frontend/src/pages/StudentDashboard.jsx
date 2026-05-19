import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { Clock, Sparkles, CheckCircle2 } from "lucide-react";

const todayISO = () => new Date().toISOString().slice(0, 10);
const ROCKET_URL = "https://static.prod-images.emergentagent.com/jobs/151314fa-6f88-4a3d-a39f-0044b194f5e9/images/1ec739dfedecb93df2ad320aeb4f02b79070a29d4126c045ddb5fc82ecf1c875.png";

export default function StudentDashboard() {
    const { user } = useAuth();
    const [missions, setMissions] = useState([]);
    const [logs, setLogs] = useState([]);
    const [skills, setSkills] = useState([]);
    const [strategies, setStrategies] = useState([]);

    const skillMap = useMemo(() => Object.fromEntries(skills.map((s) => [s.id, s])), [skills]);
    const stratMap = useMemo(() => Object.fromEntries(strategies.map((s) => [s.id, s])), [strategies]);

    useEffect(() => {
        (async () => {
            const [m, l, sk, st] = await Promise.all([
                api.get("/missions", { params: { due_date: todayISO() } }),
                api.get("/logs"),
                api.get("/skills"),
                api.get("/strategies"),
            ]);
            setMissions(m.data);
            setLogs(l.data);
            setSkills(sk.data);
            setStrategies(st.data);
        })();
    }, []);

    const latestLogByMission = useMemo(() => {
        const map = {};
        for (const l of logs) {
            if (!map[l.mission_id]) map[l.mission_id] = l;
        }
        return map;
    }, [logs]);

    const completed = missions.filter((m) => latestLogByMission[m.id]?.status === "completed").length;
    const total = missions.length;

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
                        <p className="text-[#4A5568] font-semibold mt-2">
                            You've got <span className="text-[#4361EE]">{total - completed}</span> mission{total - completed === 1 ? "" : "s"} left today.
                        </p>
                        <div className="mt-3 flex items-center gap-2 justify-center sm:justify-start">
                            <div className="h-3 flex-1 max-w-xs bg-[#E2E8F0] rounded-full overflow-hidden">
                                <div className="h-full bg-[#06D6A0] transition-all" style={{ width: total ? `${(completed / total) * 100}%` : "0%" }} data-testid="student-progress-bar" />
                            </div>
                            <span className="text-sm font-bold text-[#4A5568]" data-testid="student-progress-label">{completed}/{total}</span>
                        </div>
                    </div>
                </header>

                <section>
                    <h2 className="font-display font-bold text-2xl text-[#0B132B] mb-4 flex items-center gap-2">
                        <Sparkles className="text-[#FFD166]" size={22} /> Today's missions
                    </h2>
                    {missions.length === 0 ? (
                        <div className="mb-card p-8 text-center" data-testid="student-no-missions">
                            <p className="font-display font-bold text-xl text-[#0B132B]">No missions for today 🎉</p>
                            <p className="text-[#4A5568] font-semibold mt-1">Enjoy your day off the mission board!</p>
                        </div>
                    ) : (
                        <div className="grid gap-5 md:grid-cols-2">
                            {missions.map((m) => {
                                const log = latestLogByMission[m.id];
                                const done = log?.status === "completed";
                                return (
                                    <Link
                                        to={`/student/missions/${m.id}`}
                                        key={m.id}
                                        className="mb-card mb-card-hover p-6 block"
                                        data-testid={`student-mission-${m.id}`}
                                    >
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                            <h3 className="font-display font-bold text-xl text-[#0B132B] leading-tight">{m.title}</h3>
                                            {done && <CheckCircle2 className="text-[#06D6A0] flex-shrink-0" />}
                                        </div>
                                        {m.description && <p className="text-[#4A5568] font-semibold text-sm mb-3">{m.description}</p>}
                                        <div className="flex items-center gap-2 text-sm font-bold text-[#4A5568] mb-3">
                                            <Clock size={14} /> {m.estimated_minutes} min · {m.steps.length} step{m.steps.length === 1 ? "" : "s"}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {m.strategy_ids.map((sid) => stratMap[sid] && (
                                                <span key={sid} className="mb-chip bg-[#FFD166]/30 text-[#876200]">{stratMap[sid].emoji} {stratMap[sid].name}</span>
                                            ))}
                                            {m.skill_ids.slice(0, 1).map((sid) => skillMap[sid] && (
                                                <span key={sid} className="mb-chip bg-[#4361EE]/10 text-[#4361EE]">{skillMap[sid].name}</span>
                                            ))}
                                        </div>
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
