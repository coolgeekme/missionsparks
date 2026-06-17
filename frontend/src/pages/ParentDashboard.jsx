import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import EvidenceBadge from "../components/EvidenceBadge";
import { Popover, PopoverTrigger, PopoverContent } from "../components/ui/popover";
import { api, formatApiErrorDetail } from "../lib/api";
import {
    Plus, ClipboardList, Users, Pencil, Trash2, UserPlus, Clock,
    Sparkles, Save, Loader2, Wand2, X, Zap, Activity, BookOpen,
    HelpCircle, Copy, Repeat,
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
    const [consent, setConsent] = useState({
        guardian_name: "",
        guardian_relationship: "parent",
        child_under_13: true,
        consent_given: false,
    });

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
        if (!consent.consent_given || !consent.guardian_name.trim()) {
            setLinkErr("Please complete the parental consent form (your name + check the agreement).");
            return;
        }
        setBusy(true);
        try {
            await api.post("/students/link", {
                student_email: linkEmail,
                guardian_name: consent.guardian_name.trim(),
                guardian_relationship: consent.guardian_relationship,
                child_under_13: consent.child_under_13,
                consent_given: true,
            });
            setLinkEmail("");
            setConsent({ ...consent, consent_given: false });
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

    const [duplicatingId, setDuplicatingId] = useState(null);
    const handleDuplicate = async (id) => {
        setDuplicatingId(id);
        try {
            await api.post(`/missions/${id}/duplicate`, { due_date: todayISO() });
            await loadMissions(selectedStudent.id);
        } catch (e) {
            window.alert(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally {
            setDuplicatingId(null);
        }
    };

    const [generatingPractice, setGeneratingPractice] = useState(null);
    const generatePractice = async (kind) => {
        if (!selectedStudent) return;
        setGeneratingPractice(kind);
        try {
            const url = kind === "reading" ? "/reading/passage" : "/writing/prompt";
            const { data } = await api.post(url, { student_id: selectedStudent.id });
            const path = kind === "reading"
                ? `/student/practice/reading/${data.id}`
                : `/student/practice/writing/${data.id}`;
            window.open(path, "_blank");
        } catch (e) {
            window.alert(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally {
            setGeneratingPractice(null);
        }
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
                        <Link to="/parent/research" className="btn-pop-ghost flex items-center gap-2" data-testid="parent-go-research">
                            <BookOpen size={16} /> Research
                        </Link>
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

                    <form onSubmit={handleLink} className="space-y-3" data-testid="parent-link-form">
                        <div className="flex flex-col sm:flex-row gap-3">
                            <input
                                type="email"
                                placeholder="student@email.com"
                                value={linkEmail}
                                onChange={(e) => setLinkEmail(e.target.value)}
                                className="mb-input sm:max-w-sm"
                                required
                                data-testid="parent-link-email"
                            />
                        </div>
                        <details className="rounded-2xl border-2 border-[#FFD166] bg-[#FFD166]/10 p-4" data-testid="parent-link-consent">
                            <summary className="cursor-pointer font-display font-bold text-[#876200]">
                                🛡️ Parental consent (required)
                            </summary>
                            <div className="mt-3 grid sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-bold text-[#0B132B] mb-1">Your name (guardian)</label>
                                    <input
                                        value={consent.guardian_name}
                                        onChange={(e) => setConsent({ ...consent, guardian_name: e.target.value })}
                                        className="mb-input"
                                        data-testid="parent-link-guardian-name"
                                        placeholder="Pat Smith"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-[#0B132B] mb-1">Relationship</label>
                                    <select
                                        value={consent.guardian_relationship}
                                        onChange={(e) => setConsent({ ...consent, guardian_relationship: e.target.value })}
                                        className="mb-input"
                                        data-testid="parent-link-relationship"
                                    >
                                        <option value="parent">Parent</option>
                                        <option value="legal_guardian">Legal guardian</option>
                                        <option value="grandparent">Grandparent</option>
                                        <option value="foster_parent">Foster parent</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                            </div>
                            <label className="flex items-center gap-2 mt-3 text-sm font-semibold text-[#0B132B]" data-testid="parent-link-under13-label">
                                <input
                                    type="checkbox"
                                    checked={consent.child_under_13}
                                    onChange={(e) => setConsent({ ...consent, child_under_13: e.target.checked })}
                                    data-testid="parent-link-under13"
                                />
                                This child is under 13 (COPPA applies)
                            </label>
                            <label className="flex items-start gap-2 mt-3 text-sm font-semibold text-[#0B132B]" data-testid="parent-link-consent-label">
                                <input
                                    type="checkbox"
                                    checked={consent.consent_given}
                                    onChange={(e) => setConsent({ ...consent, consent_given: e.target.checked })}
                                    className="mt-0.5"
                                    data-testid="parent-link-consent-checkbox"
                                />
                                <span>
                                    I am the parent or legal guardian and consent to MissionSparks processing my child's information as described in the{" "}
                                    <Link to="/privacy" className="text-[#4361EE] underline" target="_blank">Privacy Policy</Link>.
                                </span>
                            </label>
                        </details>
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
                                    <span className={`mb-chip ${studentStreak.current_streak > 0 ? "bg-[#FFD166]/30 text-[#876200]" : "bg-[#E2E8F0] text-[#4A5568]"}`}>
                                        <Zap size={14} fill="currentColor" /> {studentStreak.current_streak}-day spark streak
                                    </span>
                                    <span className="mb-chip bg-[#06D6A0]/15 text-[#057a5b]">
                                        {studentStreak.completed_today_count}/{studentStreak.missions_today_count} today
                                    </span>
                                </div>
                            )}
                        </div>
                        <p className="text-sm font-semibold text-[#4A5568] mb-3">
                            Optional notes the AI will use when drafting missions (grade, reading level, interests, struggles, motivation).
                            {" "}
                            <Link to={`/parent/students/${selectedStudent.id}/intake`} className="text-[#4361EE] font-bold hover:underline" data-testid="parent-open-intake">
                                Set up the full structured profile →
                            </Link>
                        </p>
                        <div className="flex flex-wrap gap-2 mb-3" data-testid="parent-practice-cta">
                            <button onClick={() => generatePractice("reading")} disabled={generatingPractice} className="btn-pop-ghost text-xs flex items-center gap-1.5" data-testid="parent-generate-reading">
                                {generatingPractice === "reading" ? <Loader2 size={12} className="animate-spin" /> : <BookOpen size={12} />} Generate reading passage
                            </button>
                            <button onClick={() => generatePractice("writing")} disabled={generatingPractice} className="btn-pop-ghost text-xs flex items-center gap-1.5" data-testid="parent-generate-writing">
                                {generatingPractice === "writing" ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Generate writing prompt
                            </button>
                            <Link to={`/parent/students/${selectedStudent.id}/portfolio`} className="btn-pop-ghost text-xs flex items-center gap-1.5" data-testid="parent-open-portfolio">
                                <BookOpen size={12} /> Portfolio
                            </Link>
                        </div>
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
                                        <div className="flex flex-wrap gap-1.5 mt-3 items-center">
                                            {d.skill_ids.map((sid) => skillMap[sid] && (
                                                <span key={sid} className="mb-chip bg-[#4361EE]/10 text-[#4361EE] text-xs py-0.5 px-2 inline-flex items-center gap-1">
                                                    {skillMap[sid].name}
                                                    <EvidenceBadge citationIds={skillMap[sid].evidence_refs} tone="indigo" size={10} testId={`ai-skill-evidence-${i}-${sid}`} />
                                                </span>
                                            ))}
                                            {d.strategy_ids.map((sid) => stratMap[sid] && (
                                                <span key={sid} className="mb-chip bg-[#FFD166]/40 text-[#876200] text-xs py-0.5 px-2 inline-flex items-center gap-1">
                                                    {stratMap[sid].emoji} {stratMap[sid].name}
                                                    <EvidenceBadge citationIds={stratMap[sid].evidence_refs} size={10} testId={`ai-strat-evidence-${i}-${sid}`} />
                                                </span>
                                            ))}
                                        </div>
                                        {((d.evidence_refs && d.evidence_refs.length > 0) || d.rationale) && (
                                            <div className="mt-3 pt-3 border-t border-[#E2E8F0] flex items-center gap-2 flex-wrap" data-testid={`ai-draft-evidence-${i}`}>
                                                {d.evidence_refs && d.evidence_refs.length > 0 && (
                                                    <>
                                                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#4A5568]">Backed by</span>
                                                        <EvidenceBadge citationIds={d.evidence_refs} label="Research supporting this mission" testId={`ai-draft-evidence-badge-${i}`} />
                                                        {d.evidence_tags && d.evidence_tags.length > 0 && (
                                                            <span className="text-[10px] font-bold text-[#4A5568]">
                                                                {d.evidence_tags.map((t) => t.replaceAll("_", " ")).join(" · ")}
                                                            </span>
                                                        )}
                                                    </>
                                                )}
                                                {d.rationale && (
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <button
                                                                type="button"
                                                                className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ring-[#4361EE]/30 bg-[#4361EE]/10 text-[#4361EE] text-[10px] font-extrabold uppercase tracking-wider hover:bg-[#4361EE]/15 transition"
                                                                data-testid={`ai-draft-why-${i}`}
                                                                aria-label="Why this mission?"
                                                            >
                                                                <HelpCircle size={11} /> Why this mission?
                                                            </button>
                                                        </PopoverTrigger>
                                                        <PopoverContent
                                                            align="end"
                                                            className="w-[min(20rem,90vw)] p-4 bg-white border-2 border-[#E2E8F0] rounded-2xl shadow-xl"
                                                            data-testid={`ai-draft-why-popover-${i}`}
                                                        >
                                                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#4361EE] mb-2 flex items-center gap-1">
                                                                <Wand2 size={11} /> Why this mission?
                                                            </p>
                                                            <p className="text-sm font-semibold text-[#0B132B] leading-snug">{d.rationale}</p>
                                                        </PopoverContent>
                                                    </Popover>
                                                )}
                                            </div>
                                        )}
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
                                        <div className="flex-1">
                                            <h3 className="font-display font-bold text-xl text-[#0B132B] leading-tight">{m.title}</h3>
                                            {m.recurrence_pattern && (
                                                <span className="mt-1 inline-flex items-center gap-1 mb-chip bg-[#06D6A0]/15 text-[#057a5b] text-[10px] py-0.5" data-testid={`parent-mission-recurs-${m.id}`}>
                                                    <Repeat size={10} /> Repeats {m.recurrence_pattern}
                                                </span>
                                            )}
                                            {m.recurrence_parent_id && !m.recurrence_pattern && (
                                                <span className="mt-1 inline-flex items-center gap-1 mb-chip bg-[#06D6A0]/10 text-[#057a5b] text-[10px] py-0.5" data-testid={`parent-mission-instance-${m.id}`}>
                                                    <Repeat size={10} /> Recurring instance
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex gap-1 flex-wrap justify-end">
                                            <Link to={`/parent/missions/${m.id}/edit`} className="p-2 rounded-xl hover:bg-[#F0F8FF] inline-flex items-center gap-1 text-xs font-bold text-[#4361EE]" data-testid={`parent-mission-edit-${m.id}`} title="Edit">
                                                <Pencil size={16} /> Edit
                                            </Link>
                                            <button
                                                onClick={() => handleDuplicate(m.id)}
                                                className="p-2 rounded-xl hover:bg-[#FFD166]/30 inline-flex items-center gap-1 text-xs font-bold text-[#876200]"
                                                data-testid={`parent-mission-duplicate-${m.id}`}
                                                disabled={duplicatingId === m.id}
                                                title="Duplicate to today"
                                            >
                                                {duplicatingId === m.id ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />} Duplicate
                                            </button>
                                            <button onClick={() => handleDelete(m.id)} className="p-2 rounded-xl hover:bg-[#EF476F]/10" data-testid={`parent-mission-delete-${m.id}`} title="Delete">
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
                                            <span key={sid} className="mb-chip bg-[#4361EE]/10 text-[#4361EE] inline-flex items-center gap-1">
                                                {skillMap[sid].name}
                                                <EvidenceBadge citationIds={skillMap[sid].evidence_refs} tone="indigo" size={11} testId={`mission-skill-evidence-${m.id}-${sid}`} />
                                            </span>
                                        ))}
                                        {m.strategy_ids.map((sid) => stratMap[sid] && (
                                            <span key={sid} className="mb-chip bg-[#FFD166]/30 text-[#876200] inline-flex items-center gap-1">
                                                {stratMap[sid].emoji} {stratMap[sid].name}
                                                <EvidenceBadge citationIds={stratMap[sid].evidence_refs} size={11} testId={`mission-strat-evidence-${m.id}-${sid}`} />
                                            </span>
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
