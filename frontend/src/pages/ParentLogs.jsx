import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api } from "../lib/api";
import { ArrowLeft, CheckCircle2, CircleAlert, Circle } from "lucide-react";

const feelingEmoji = { bad: "😖", okay: "😐", good: "😄" };
const statusColor = {
    completed: "bg-[#06D6A0]/15 text-[#057a5b]",
    in_progress: "bg-[#FFD166]/30 text-[#876200]",
    skipped: "bg-[#EF476F]/15 text-[#9b1c3c]",
    not_started: "bg-[#A0AEC0]/20 text-[#4A5568]",
};

export default function ParentLogs() {
    const [students, setStudents] = useState([]);
    const [selected, setSelected] = useState(null);
    const [logs, setLogs] = useState([]);
    const [missions, setMissions] = useState([]);

    const missionMap = useMemo(() => Object.fromEntries(missions.map((m) => [m.id, m])), [missions]);

    useEffect(() => {
        (async () => {
            const { data } = await api.get("/students");
            setStudents(data);
            if (data[0]) setSelected(data[0]);
        })();
    }, []);

    useEffect(() => {
        (async () => {
            if (!selected) return;
            const [logsR, missR] = await Promise.all([
                api.get("/logs", { params: { student_id: selected.id } }),
                api.get("/missions", { params: { student_id: selected.id } }),
            ]);
            setLogs(logsR.data);
            setMissions(missR.data);
        })();
    }, [selected]);

    return (
        <div className="min-h-screen" data-testid="parent-logs-page">
            <Navbar />
            <main className="max-w-4xl mx-auto p-6 md:p-10">
                <Link to="/parent" className="inline-flex items-center gap-2 text-sm font-bold text-[#4361EE] mb-4" data-testid="parent-logs-back">
                    <ArrowLeft size={16} /> Back to dashboard
                </Link>
                <h1 className="font-display font-extrabold text-4xl text-[#0B132B]">Mission logs</h1>
                <p className="text-[#4A5568] font-semibold mt-1 mb-6">Read your learner's reflections and celebrate their wins.</p>

                {students.length > 1 && (
                    <div className="flex flex-wrap gap-2 mb-6" data-testid="parent-logs-students">
                        {students.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => setSelected(s)}
                                className={`mb-chip border-2 ${selected?.id === s.id ? "bg-[#4361EE] text-white border-[#4361EE]" : "bg-white border-[#E2E8F0] text-[#0B132B]"}`}
                                data-testid={`parent-logs-student-${s.id}`}
                            >
                                🚀 {s.name}
                            </button>
                        ))}
                    </div>
                )}

                {logs.length === 0 ? (
                    <div className="mb-card p-8 text-center" data-testid="parent-logs-empty">
                        <p className="font-display font-bold text-xl text-[#0B132B]">No reflections yet</p>
                        <p className="text-[#4A5568] font-semibold mt-1">Once your learner completes a mission, their notes will appear here.</p>
                    </div>
                ) : (
                    <div className="space-y-4" data-testid="parent-logs-list">
                        {logs.map((l) => {
                            const m = missionMap[l.mission_id];
                            const Icon = l.status === "completed" ? CheckCircle2 : l.status === "skipped" ? CircleAlert : Circle;
                            return (
                                <article key={l.id} className="mb-card p-5" data-testid={`parent-log-${l.id}`}>
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <div className="flex items-center gap-2">
                                            <Icon className={`${l.status === "completed" ? "text-[#06D6A0]" : l.status === "skipped" ? "text-[#EF476F]" : "text-[#A0AEC0]"}`} size={20} />
                                            <h3 className="font-display font-bold text-lg text-[#0B132B]">{m ? m.title : "Mission"}</h3>
                                        </div>
                                        <span className={`mb-chip ${statusColor[l.status]}`}>{l.status.replace("_", " ")}</span>
                                    </div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">
                                        {new Date(l.timestamp).toLocaleString()}
                                    </p>
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {l.feeling && <span className="mb-chip bg-[#F0F8FF] text-[#4361EE]">Feeling {feelingEmoji[l.feeling]} {l.feeling}</span>}
                                        {l.difficulty_rating && <span className="mb-chip bg-[#FFD166]/30 text-[#876200]">Difficulty: {l.difficulty_rating}</span>}
                                        <span className="mb-chip bg-[#06D6A0]/15 text-[#057a5b]">
                                            {l.used_strategies ? "Used strategies ✅" : "No strategies used"}
                                        </span>
                                    </div>
                                    {l.note && (
                                        <p className="mt-3 p-3 rounded-2xl bg-[#F0F8FF] text-[#0B132B] font-semibold text-sm">
                                            “{l.note}”
                                        </p>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
