import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiErrorDetail } from "../lib/api";
import { Plus, ClipboardList, Users, Pencil, Trash2, UserPlus, Clock } from "lucide-react";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function ParentDashboard() {
    const [students, setStudents] = useState([]);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [missions, setMissions] = useState([]);
    const [skills, setSkills] = useState([]);
    const [strategies, setStrategies] = useState([]);
    const [linkEmail, setLinkEmail] = useState("");
    const [linkErr, setLinkErr] = useState("");
    const [busy, setBusy] = useState(false);

    const skillMap = useMemo(() => Object.fromEntries(skills.map((s) => [s.id, s])), [skills]);
    const stratMap = useMemo(() => Object.fromEntries(strategies.map((s) => [s.id, s])), [strategies]);

    const loadStudents = async () => {
        const { data } = await api.get("/students");
        setStudents(data);
        if (data.length && !selectedStudent) setSelectedStudent(data[0]);
        if (data.length === 0) setSelectedStudent(null);
    };

    const loadMissions = async (studentId) => {
        if (!studentId) return setMissions([]);
        const { data } = await api.get("/missions", { params: { student_id: studentId, due_date: todayISO() } });
        setMissions(data);
    };

    useEffect(() => {
        (async () => {
            const [sk, st] = await Promise.all([api.get("/skills"), api.get("/strategies")]);
            setSkills(sk.data);
            setStrategies(st.data);
            await loadStudents();
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (selectedStudent) loadMissions(selectedStudent.id);
    }, [selectedStudent]);

    const handleLink = async (e) => {
        e.preventDefault();
        setLinkErr("");
        setBusy(true);
        try {
            await api.post("/students/link", { student_email: linkEmail });
            setLinkEmail("");
            await loadStudents();
        } catch (e2) {
            setLinkErr(formatApiErrorDetail(e2.response?.data?.detail) || e2.message);
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Delete this mission?")) return;
        await api.delete(`/missions/${id}`);
        loadMissions(selectedStudent.id);
    };

    return (
        <div className="min-h-screen" data-testid="parent-dashboard">
            <Navbar />
            <main className="max-w-6xl mx-auto p-6 md:p-10 space-y-8">
                <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">Parent control room</p>
                        <h1 className="font-display font-extrabold text-4xl sm:text-5xl text-[#0B132B] mt-1">Today's missions</h1>
                        <p className="text-[#4A5568] font-semibold mt-2">Build small, doable wins for your learner.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link to="/parent/logs" className="btn-pop-ghost flex items-center gap-2" data-testid="parent-view-logs">
                            <ClipboardList size={16} /> View logs
                        </Link>
                        <Link
                            to="/parent/missions/new"
                            className={`btn-pop-primary flex items-center gap-2 ${!selectedStudent ? "pointer-events-none opacity-50" : ""}`}
                            data-testid="parent-create-mission"
                        >
                            <Plus size={18} /> New mission
                        </Link>
                    </div>
                </header>

                <section className="mb-card p-6" data-testid="parent-students-card">
                    <div className="flex items-center gap-2 mb-4">
                        <Users size={18} className="text-[#4361EE]" />
                        <h2 className="font-display font-bold text-xl text-[#0B132B]">Your linked learners</h2>
                    </div>
                    {students.length === 0 ? (
                        <p className="text-[#4A5568] font-semibold mb-3" data-testid="parent-no-students">
                            You haven't linked a student yet. Ask your child to sign up as a Student, then enter their email below.
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-2 mb-4">
                            {students.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => setSelectedStudent(s)}
                                    className={`mb-chip border-2 ${
                                        selectedStudent?.id === s.id
                                            ? "bg-[#4361EE] text-white border-[#4361EE]"
                                            : "bg-white text-[#0B132B] border-[#E2E8F0] hover:border-[#4361EE]"
                                    }`}
                                    data-testid={`parent-student-chip-${s.id}`}
                                >
                                    🚀 {s.name}
                                </button>
                            ))}
                        </div>
                    )}

                    <form onSubmit={handleLink} className="flex flex-col sm:flex-row gap-3" data-testid="parent-link-form">
                        <input
                            type="email"
                            placeholder="student@email.com"
                            value={linkEmail}
                            onChange={(e) => setLinkEmail(e.target.value)}
                            className="mb-input sm:max-w-sm"
                            required
                            data-testid="parent-link-email"
                        />
                        <button type="submit" disabled={busy} className="btn-pop-accent flex items-center gap-2" data-testid="parent-link-submit">
                            <UserPlus size={16} /> {busy ? "Linking…" : "Link student"}
                        </button>
                    </form>
                    {linkErr && <p className="text-sm font-bold text-[#EF476F] mt-2" data-testid="parent-link-error">{linkErr}</p>}
                </section>

                <section data-testid="parent-missions-section">
                    <h2 className="font-display font-bold text-2xl text-[#0B132B] mb-4">
                        {selectedStudent ? `Missions for ${selectedStudent.name}` : "Missions"}
                    </h2>
                    {!selectedStudent ? (
                        <div className="mb-card p-8 text-center">
                            <p className="text-[#4A5568] font-bold">Link a student above to start assigning missions.</p>
                        </div>
                    ) : missions.length === 0 ? (
                        <div className="mb-card p-8 text-center" data-testid="parent-no-missions">
                            <p className="font-display font-bold text-xl text-[#0B132B]">No missions for today yet</p>
                            <p className="text-[#4A5568] font-semibold mt-1">Hit "New mission" to create one.</p>
                        </div>
                    ) : (
                        <div className="grid gap-5 md:grid-cols-2">
                            {missions.map((m) => (
                                <article key={m.id} className="mb-card mb-card-hover p-6" data-testid={`parent-mission-${m.id}`}>
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <h3 className="font-display font-bold text-xl text-[#0B132B] leading-tight">{m.title}</h3>
                                        <div className="flex gap-1">
                                            <Link to={`/parent/missions/${m.id}/edit`} className="p-2 rounded-xl hover:bg-[#F0F8FF]" data-testid={`parent-mission-edit-${m.id}`}>
                                                <Pencil size={16} className="text-[#4361EE]" />
                                            </Link>
                                            <button onClick={() => handleDelete(m.id)} className="p-2 rounded-xl hover:bg-[#EF476F]/10" data-testid={`parent-mission-delete-${m.id}`}>
                                                <Trash2 size={16} className="text-[#EF476F]" />
                                            </button>
                                        </div>
                                    </div>
                                    {m.description && <p className="text-[#4A5568] font-semibold text-sm mb-3">{m.description}</p>}
                                    <div className="flex items-center gap-2 text-sm font-bold text-[#4A5568] mb-3">
                                        <Clock size={14} /> {m.estimated_minutes} min · {m.steps.length} steps
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {m.skill_ids.map((sid) => skillMap[sid] && (
                                            <span key={sid} className="mb-chip bg-[#4361EE]/10 text-[#4361EE]">{skillMap[sid].name}</span>
                                        ))}
                                        {m.strategy_ids.map((sid) => stratMap[sid] && (
                                            <span key={sid} className="mb-chip bg-[#FFD166]/30 text-[#876200]">{stratMap[sid].emoji} {stratMap[sid].name}</span>
                                        ))}
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}
