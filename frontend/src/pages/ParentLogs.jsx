import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api } from "../lib/api";
import { ArrowLeft, CheckCircle2, CircleAlert, Circle } from "lucide-react";

const feelingEmoji = { bad: "😖", okay: "😐", good: "😄" };
const statusColor = {
    completed: "bg-[#3F8C5E]/15 text-[#2F6B47]",
    in_progress: "bg-[#E8A33D]/30 text-[#8A6413]",
    skipped: "bg-[#BC4B32]/15 text-[#8A3A26]",
    not_started: "bg-[#9A9286]/20 text-[#6E675B]",
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
                <Link to="/parent" className="inline-flex items-center gap-2 text-sm font-bold text-[#E4572E] mb-4" data-testid="parent-logs-back">
                    <ArrowLeft size={16} /> Back to dashboard
                </Link>
                <h1 className="font-display font-extrabold text-4xl text-[#201D18]">Mission logs</h1>
                <p className="text-[#6E675B] font-semibold mt-1 mb-6">Read your learner's reflections and celebrate their wins.</p>

                {students.length > 1 && (
                    <div className="flex flex-wrap gap-2 mb-6" data-testid="parent-logs-students">
                        {students.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => setSelected(s)}
                                className={`mb-chip border-2 ${selected?.id === s.id ? "bg-[#E4572E] text-white border-[#E4572E]" : "bg-white border-[#E8E0D2] text-[#201D18]"}`}
                                data-testid={`parent-logs-student-${s.id}`}
                            >
                                🚀 {s.name}
                            </button>
                        ))}
                    </div>
                )}

                {logs.length === 0 ? (
                    <div className="mb-card p-8 text-center" data-testid="parent-logs-empty">
                        <p className="font-display font-bold text-xl text-[#201D18]">No reflections yet</p>
                        <p className="text-[#6E675B] font-semibold mt-1">Once your learner completes a mission, their notes will appear here.</p>
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
                                            <Icon className={`${l.status === "completed" ? "text-[#3F8C5E]" : l.status === "skipped" ? "text-[#BC4B32]" : "text-[#9A9286]"}`} size={20} />
                                            <h3 className="font-display font-bold text-lg text-[#201D18]">{m ? m.title : "Mission"}</h3>
                                        </div>
                                        <span className={`mb-chip ${statusColor[l.status]}`}>{l.status.replace("_", " ")}</span>
                                    </div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286]">
                                        {new Date(l.timestamp).toLocaleString()}
                                    </p>
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {l.feeling && <span className="mb-chip bg-[#FBF6EE] text-[#E4572E]">Feeling {feelingEmoji[l.feeling]} {l.feeling}</span>}
                                        {l.difficulty_rating && <span className="mb-chip bg-[#E8A33D]/30 text-[#8A6413]">Difficulty: {l.difficulty_rating}</span>}
                                        <span className="mb-chip bg-[#3F8C5E]/15 text-[#2F6B47]">
                                            {l.used_strategies ? "Used strategies ✅" : "No strategies used"}
                                        </span>
                                        {l.game_played && (
                                            <span className="mb-chip bg-[#E8A33D]/30 text-[#8A6413]" data-testid={`parent-log-game-${l.id}`}>
                                                🎮 Played {l.game_key}{l.game_score != null ? ` · ${l.game_score} pts` : ""}
                                            </span>
                                        )}
                                    </div>
                                    {l.clue_captures && l.clue_captures.length > 0 && (
                                        <div className="mt-3" data-testid={`parent-log-clues-${l.id}`}>
                                            <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286] mb-1">Clues captured</p>
                                            <ul className="space-y-1">
                                                {l.clue_captures.map((c, i) => (
                                                    <li key={i} className="text-sm font-semibold text-[#201D18] rounded-2xl bg-[#E4572E]/5 border-2 border-[#E4572E]/15 p-3">
                                                        “{c}”
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {l.note && (
                                        <p className="mt-3 p-3 rounded-2xl bg-[#FBF6EE] text-[#201D18] font-semibold text-sm">
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
