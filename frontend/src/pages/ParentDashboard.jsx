import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiErrorDetail } from "../lib/api";
import {
    Plus, ClipboardList, Users, Pencil, Trash2, UserPlus, Clock,
    Sparkles, Save, Loader2, Wand2, X, Flame, Activity,
} from "lucide-react";

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

    // Profile notes editor
    const [profileNotes, setProfileNotes] = useState("");
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileMsg, setProfileMsg] = useState("");

    // Streak for selected student (parent view)
    const [studentStreak, setStudentStreak] = useState(null);

    // AI day drafting
    const [aiOpen, setAiOpen] = useState(false);
    const [aiPrompt, setAiPrompt] = useState("");
    const [aiBusy, setAiBusy] = useState(false);
    const [aiErr, setAiErr] = useState("");
    const [aiDrafts, setAiDrafts] = useState([]);
    const [savingIdx, setSavingIdx] = useState(null);
    const [savedIdx, setSavedIdx] = useState({});

    const skillMap = useMemo(() => Object.fromEntries(skills.map((s) => [s.id, s])), [skills]);
    const stratMap = useMemo(() => Object.fromEntries(strategies.map((s) => [s.id, s])), [strategies]);

    const loadStudents = async (keepSelectedId) => {
        const { data } = await api.get("/students");
        setStudents(data);
        if (data.length === 0) {
            setSelectedStudent(null);
            return;
        }
        if (keepSelectedId) {
            const found = data.find((s) => s.id === keepSelectedId);
            setSelectedStudent(found || data[0]);
        } else if (!selectedStudent) {
            setSelectedStudent(data[0]);
        }
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
        if (selectedStudent) {
            loadMissions(selectedStudent.id);
            setProfileNotes(selectedStudent.profile_notes || "");
            setAiDrafts([]);
            setSavedIdx({});
            setAiOpen(false);
            (async () => {
                try {
                    const { data } = await api.get(`/streak/${selectedStudent.id}`);
                    setStudentStreak(data);
                } catch {
                    setStudentStreak(null);
                }
            })();
        }
        // intentionally NOT clearing profileMsg here — saveProfile sets it after a
        // successful PUT and we want it to remain visible after loadStudents
        // returns a new object reference for the same student.
    }, [selectedStudent?.id]);

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

    const saveProfile = async () => {
        if (!selectedStudent) return;
        setProfileSaving(true);
        setProfileMsg("");
        try {
            await api.put(`/students/${selectedStudent.id}/profile`, { profile_notes: profileNotes });
            await loadStudents(selectedStudent.id);
            setProfileMsg("Saved ✓");
        } catch (e) {
            setProfileMsg(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally {
            setProfileSaving(false);
        }
    };

    const generateDay = async () => {
        if (!selectedStudent) return;
        setAiBusy(true);
        setAiErr("");
        setAiDrafts([]);
        setSavedIdx({});
        try {
            const { data } = await api.post("/ai/draft-day", {
                student_id: selectedStudent.id,
                count: 3,
                prompt: aiPrompt,
            });
            setAiDrafts(data);
            if (!data.length) setAiErr("AI returned no drafts — try a different idea.");
        } catch (e) {
            setAiErr(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally {
            setAiBusy(false);
        }
    };

    const saveDraft = async (idx) => {
        const d = aiDrafts[idx];
        if (!d || !selectedStudent) return;
        setSavingIdx(idx);
        try {
            await api.post("/missions", {
                student_id: selectedStudent.id,
                title: d.title,
                description: d.description,
                steps: d.steps,
                estimated_minutes: d.estimated_minutes,
                due_date: todayISO(),
                skill_ids: d.skill_ids,
                strategy_ids: d.strategy_ids,
            });
            setSavedIdx({ ...savedIdx, [idx]: true });
            loadMissions(selectedStudent.id);
        } catch (e) {
            setAiErr(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally {
            setSavingIdx(null);
        }
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
                    <div className="flex flex-wrap items-center gap-3">
                        <Link to="/parent/moments" className="btn-pop-ghost flex items-center gap-2" data-testid="parent-go-moments">
                            <Activity size={16} /> Moments
                        </Link>
                        <Link to="/parent/logs" className="btn-pop-ghost flex items-center gap-2" data-testid="parent-view-logs">
                            <ClipboardList size={16} /> View logs
                        </Link>
                        <button
                            onClick={() => setAiOpen((v) => !v)}
                            disabled={!selectedStudent}
                            className="btn-pop-secondary flex items-center gap-2 disabled:opacity-50"
                            data-testid="parent-ai-toggle"
                        >
                            <Sparkles size={16} /> AI draft day
                        </button>
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

                {selectedStudent && (
                    <section className="mb-card p-6" data-testid="parent-profile-card">
                        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                            <div className="flex items-center gap-2">
                                <Wand2 size={18} className="text-[#4361EE]" />
                                <h2 className="font-display font-bold text-xl text-[#0B132B]">About {selectedStudent.name}</h2>
                                <span className="mb-chip bg-[#FFD166]/30 text-[#876200]">Helps AI personalize</span>
                            </div>
                            {studentStreak && (
                                <div className="flex items-center gap-2" data-testid="parent-student-streak">
                                    <span className={`mb-chip ${studentStreak.current_streak > 0 ? "bg-[#EF476F]/15 text-[#EF476F]" : "bg-[#E2E8F0] text-[#4A5568]"}`}>
                                        <Flame size={14} /> {studentStreak.current_streak} day streak
                                    </span>
                                    <span className="mb-chip bg-[#06D6A0]/15 text-[#057a5b]">
                                        {studentStreak.completed_today_count}/{studentStreak.missions_today_count} today
                                    </span>
                                </div>
                            )}
                        </div>
                        <p className="text-sm font-semibold text-[#4A5568] mb-3">
                            Optional notes the AI will use when drafting missions (grade, reading level, interests, struggles, motivation).
                        </p>
                        <textarea
                            value={profileNotes}
                            onChange={(e) => setProfileNotes(e.target.value)}
                            rows={3}
                            placeholder={`e.g. ${selectedStudent.name}, 4th grade. Reads at ~3rd grade level. Loves dragons. Loses focus after ~15 min.`}
                            className="mb-input pt-3 h-auto"
                            data-testid="parent-profile-notes"
                        />
                        <div className="flex items-center gap-3 mt-3">
                            <button onClick={saveProfile} disabled={profileSaving} className="btn-pop-primary flex items-center gap-2" data-testid="parent-profile-save">
                                <Save size={14} /> {profileSaving ? "Saving…" : "Save notes"}
                            </button>
                            {profileMsg && <span className="text-sm font-bold text-[#057a5b]" data-testid="parent-profile-msg">{profileMsg}</span>}
                        </div>
                    </section>
                )}

                {aiOpen && selectedStudent && (
                    <section className="mb-card p-6 border-[#FFD166]" data-testid="parent-ai-panel">
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex items-center gap-2">
                                <Sparkles className="text-[#FFD166]" size={20} />
                                <h2 className="font-display font-bold text-xl text-[#0B132B]">Draft today's missions with AI</h2>
                            </div>
                            <button onClick={() => setAiOpen(false)} className="p-2 rounded-xl hover:bg-[#F7FAFC]" data-testid="parent-ai-close" aria-label="Close">
                                <X size={18} />
                            </button>
                        </div>
                        <p className="text-sm font-semibold text-[#4A5568] mb-3">
                            Give the AI a one-line hint (or leave blank). It will use {selectedStudent.name}'s profile notes to draft 3 small missions for today.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <input
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                placeholder="e.g. focus on inference + a quick planning task"
                                className="mb-input flex-1"
                                data-testid="parent-ai-prompt"
                            />
                            <button onClick={generateDay} disabled={aiBusy} className="btn-pop-secondary flex items-center gap-2" data-testid="parent-ai-generate">
                                {aiBusy ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                                {aiBusy ? "Drafting…" : "Generate 3 missions"}
                            </button>
                        </div>
                        {aiErr && <p className="text-sm font-bold text-[#EF476F] bg-[#EF476F]/10 rounded-xl px-3 py-2 mt-3" data-testid="parent-ai-error">{aiErr}</p>}

                        {aiDrafts.length > 0 && (
                            <div className="mt-5 grid gap-4 md:grid-cols-3" data-testid="parent-ai-drafts">
                                {aiDrafts.map((d, i) => (
                                    <article key={i} className="rounded-2xl border-2 border-[#E2E8F0] p-4 bg-[#F0F8FF]" data-testid={`parent-ai-draft-${i}`}>
                                        <h3 className="font-display font-bold text-lg text-[#0B132B] leading-tight">{d.title}</h3>
                                        {d.description && <p className="text-sm text-[#4A5568] font-semibold mt-1">{d.description}</p>}
                                        <div className="flex items-center gap-2 text-xs font-bold text-[#4A5568] mt-2">
                                            <Clock size={12} /> {d.estimated_minutes} min · {d.steps.length} steps
                                        </div>
                                        <ol className="text-sm text-[#0B132B] font-semibold mt-2 space-y-1 list-decimal pl-5">
                                            {d.steps.map((s, j) => <li key={j}>{s}</li>)}
                                        </ol>
                                        <div className="flex flex-wrap gap-1.5 mt-3">
                                            {d.skill_ids.map((sid) => skillMap[sid] && (
                                                <span key={sid} className="mb-chip bg-[#4361EE]/10 text-[#4361EE] text-xs py-0.5 px-2">{skillMap[sid].name}</span>
                                            ))}
                                            {d.strategy_ids.map((sid) => stratMap[sid] && (
                                                <span key={sid} className="mb-chip bg-[#FFD166]/40 text-[#876200] text-xs py-0.5 px-2">{stratMap[sid].emoji} {stratMap[sid].name}</span>
                                            ))}
                                        </div>
                                        <button
                                            onClick={() => saveDraft(i)}
                                            disabled={savedIdx[i] || savingIdx === i}
                                            className={`mt-3 w-full ${savedIdx[i] ? "btn-pop-ghost" : "btn-pop-primary"} text-sm py-2 flex items-center justify-center gap-2`}
                                            data-testid={`parent-ai-draft-save-${i}`}
                                        >
                                            {savedIdx[i] ? "Saved ✓" : savingIdx === i ? "Saving…" : (<><Plus size={14} /> Add to today</>)}
                                        </button>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>
                )}

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
                            <p className="text-[#4A5568] font-semibold mt-1">Hit "AI draft day" or "New mission" to create one.</p>
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
