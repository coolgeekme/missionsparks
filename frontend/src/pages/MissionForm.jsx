import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import Navbar from "../components/Navbar";
import EvidenceBadge from "../components/EvidenceBadge";
import { api, formatApiErrorDetail } from "../lib/api";
import { Save, Trash2, Plus, ArrowLeft, Sparkles, Loader2 } from "lucide-react";

// Local calendar date — NOT toISOString(), which converts to UTC and hands
// back tomorrow for anyone west of Greenwich in the evening.
const todayISO = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function MissionForm() {
    const { id } = useParams();
    const editing = Boolean(id);
    const navigate = useNavigate();

    const [students, setStudents] = useState([]);
    const [skills, setSkills] = useState([]);
    const [strategies, setStrategies] = useState([]);
    const [form, setForm] = useState({
        student_id: "",
        title: "",
        description: "",
        steps: [""],
        estimated_minutes: 15,
        due_date: todayISO(),
        skill_ids: [],
        strategy_ids: [],
        recurrence_pattern: "none",  // "none" | "daily" | "weekdays" | "weekends" | "weekly"
        verification: "trust",       // trust | parent_pin | photo | async_review
        auto_approve_hours: 24,
    });
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    const [loadedMission, setLoadedMission] = useState(null);
    // Edit-scope: only matters for recurring missions
    const [editScope, setEditScope] = useState("this");

    // AI draft
    const [aiPrompt, setAiPrompt] = useState("");
    const [missionKind, setMissionKind] = useState("standard"); // "standard" | "reading" | "writing"
    const [topicHint, setTopicHint] = useState("");
    const [levelOverride, setLevelOverride] = useState("");
    const [aiBusy, setAiBusy] = useState(false);
    const [aiErr, setAiErr] = useState("");

    useEffect(() => {
        (async () => {
            const [stu, sk, st] = await Promise.all([
                api.get("/students"),
                api.get("/skills"),
                api.get("/strategies"),
            ]);
            setStudents(stu.data);
            setSkills(sk.data);
            setStrategies(st.data);
            if (!editing && stu.data[0]) {
                setForm((f) => ({ ...f, student_id: stu.data[0].id }));
            }
            if (editing) {
                const { data } = await api.get(`/missions/${id}`);
                setForm({
                    student_id: data.student_id,
                    title: data.title,
                    description: data.description || "",
                    steps: data.steps.length ? data.steps : [""],
                    estimated_minutes: data.estimated_minutes,
                    due_date: data.due_date,
                    skill_ids: data.skill_ids,
                    strategy_ids: data.strategy_ids,
                    recurrence_pattern: data.recurrence_pattern || "none",
                    verification: data.verification || "trust",
                    auto_approve_hours: data.auto_approve_hours ?? 24,
                });
                setLoadedMission(data);
            }
        })();
    }, [id, editing]);

    const setStep = (i, val) => {
        const next = [...form.steps];
        next[i] = val;
        setForm({ ...form, steps: next });
    };

    const addStep = () => setForm({ ...form, steps: [...form.steps, ""] });
    const removeStep = (i) => {
        const next = form.steps.filter((_, idx) => idx !== i);
        setForm({ ...form, steps: next.length ? next : [""] });
    };

    const toggle = (key, id2) => {
        const cur = new Set(form[key]);
        if (cur.has(id2)) cur.delete(id2);
        else cur.add(id2);
        setForm({ ...form, [key]: Array.from(cur) });
    };

    const submit = async (e) => {
        e.preventDefault();
        setErr("");
        setBusy(true);
        try {
            // Practice missions: backend generates content + creates mission in one call
            if (!editing && missionKind !== "standard") {
                const payload = {
                    student_id: form.student_id,
                    due_date: form.due_date,
                    kind: missionKind,
                    estimated_minutes: Number(form.estimated_minutes) || 15,
                };
                if (topicHint.trim()) payload.topic_hint = topicHint.trim();
                if (levelOverride) payload.level_override = levelOverride;
                await api.post("/missions/practice", payload);
                toast.success(missionKind === "reading" ? "Reading mission created." : "Writing mission created.");
                navigate("/parent");
                return;
            }
            const { recurrence_pattern, ...rest } = form;
            const payload = {
                ...rest,
                steps: form.steps.map((s) => s.trim()).filter(Boolean),
                estimated_minutes: Number(form.estimated_minutes) || 10,
            };
            if (editing) {
                const { student_id, ...editRest } = payload; // eslint-disable-line no-unused-vars
                const isRecurring = Boolean(loadedMission?.recurrence_parent_id) || (loadedMission?.recurrence_pattern && loadedMission.recurrence_pattern !== "none");
                if (isRecurring) editRest.scope = editScope;
                await api.put(`/missions/${id}`, editRest);
                toast.success(
                    isRecurring && editScope !== "this"
                        ? (editScope === "future" ? "Updated this + future occurrences." : "Updated the whole series.")
                        : "Mission updated.",
                );
            } else {
                if (recurrence_pattern && recurrence_pattern !== "none") {
                    payload.recurrence = { pattern: recurrence_pattern };
                }
                await api.post("/missions", payload);
                if (recurrence_pattern && recurrence_pattern !== "none") {
                    const labelMap = {
                        daily: "every day",
                        weekdays: "weekdays (Mon–Fri)",
                        weekends: "weekends (Sat–Sun)",
                        weekly: "weekly",
                    };
                    toast.success(`Recurring mission created for the next 30 days · ${labelMap[recurrence_pattern]}`);
                } else {
                    toast.success("Mission created.");
                }
            }
            navigate("/parent");
        } catch (e2) {
            setErr(formatApiErrorDetail(e2.response?.data?.detail) || e2.message);
        } finally {
            setBusy(false);
        }
    };

    const draftWithAI = async () => {
        if (!form.student_id && !editing) {
            setAiErr("Pick a student first.");
            return;
        }
        setAiBusy(true);
        setAiErr("");
        try {
            const { data } = await api.post("/ai/draft-mission", {
                student_id: form.student_id,
                prompt: aiPrompt,
            });
            setForm((f) => ({
                ...f,
                title: data.title || f.title,
                description: data.description || f.description,
                steps: data.steps.length ? data.steps : f.steps,
                estimated_minutes: data.estimated_minutes || f.estimated_minutes,
                skill_ids: data.skill_ids.length ? data.skill_ids : f.skill_ids,
                strategy_ids: data.strategy_ids.length ? data.strategy_ids : f.strategy_ids,
            }));
        } catch (e) {
            setAiErr(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally {
            setAiBusy(false);
        }
    };

    return (
        <div className="min-h-screen" data-testid="mission-form-page">
            <Navbar />
            <main className="max-w-3xl mx-auto p-6 md:p-10">
                <Link to="/parent" className="inline-flex items-center gap-2 text-sm font-bold text-[#E4572E] mb-4" data-testid="mission-form-back">
                    <ArrowLeft size={16} /> Back to dashboard
                </Link>
                <h1 className="font-display font-extrabold text-4xl text-[#201D18] mb-1">
                    {editing ? "Edit mission" : "Create a mission"}
                </h1>
                <p className="text-[#6E675B] font-semibold mb-6">Small steps. Big wins. 🌱</p>

                {(!editing || editing) && missionKind === "standard" && (
                    <div className="mb-card p-5 mb-5 border-[#E8A33D]" data-testid="mission-form-ai-panel">
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="text-[#E8A33D]" size={18} />
                            <h2 className="font-display font-bold text-lg text-[#201D18]">{editing ? "Improve with AI" : "Draft with AI"}</h2>
                            <span className="mb-chip bg-[#E8A33D]/30 text-[#8A6413] text-xs py-0.5 px-2">Optional</span>
                        </div>
                        <p className="text-sm font-semibold text-[#6E675B] mb-3">
                            {editing
                                ? "Type a tweak (e.g. 'make it more about animals' or 'shorter, easier steps') — AI will rewrite the title, steps, skills, and strategies. You can still edit before saving."
                                : "Type a one-line idea and let AI fill in the title, steps, skills, and strategies. You can still edit everything below before saving."}
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <input
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                placeholder={editing ? "Make the steps shorter and add a vocab focus" : "e.g. Reading practice with our chapter book about dragons"}
                                className="mb-input flex-1"
                                data-testid="mission-form-ai-prompt"
                            />
                            <button
                                type="button"
                                onClick={draftWithAI}
                                disabled={aiBusy || !form.student_id || !aiPrompt.trim()}
                                className="btn-pop-secondary flex items-center justify-center gap-2 disabled:opacity-50"
                                data-testid="mission-form-ai-draft"
                            >
                                {aiBusy ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                                {aiBusy ? (editing ? "Improving…" : "Drafting…") : (editing ? "Improve it" : "Draft for me")}
                            </button>
                        </div>
                        {aiErr && <p className="text-sm font-bold text-[#BC4B32] bg-[#BC4B32]/10 rounded-xl px-3 py-2 mt-3" data-testid="mission-form-ai-error">{aiErr}</p>}
                    </div>
                )}

                <form onSubmit={submit} className="mb-card p-6 space-y-5" data-testid="mission-form">
                    {!editing && (
                        <div data-testid="mission-form-type">
                            <label className="block text-sm font-bold text-[#201D18] mb-2">Mission type</label>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { v: "standard", l: "📋 Standard (steps)", desc: "A checklist of steps the kid completes" },
                                    { v: "reading", l: "📖 Reading practice", desc: "AI generates a passage + comprehension questions" },
                                    { v: "writing", l: "✍️ Writing practice", desc: "AI generates a prompt + scaffold" },
                                ].map((o) => (
                                    <button
                                        key={o.v}
                                        type="button"
                                        onClick={() => setMissionKind(o.v)}
                                        title={o.desc}
                                        className={`mb-chip border-2 ${missionKind === o.v ? "bg-[#E4572E] text-white border-[#E4572E]" : "bg-white text-[#201D18] border-[#E8E0D2] hover:border-[#E4572E]"}`}
                                        data-testid={`mission-form-type-${o.v}`}
                                    >
                                        {o.l}
                                    </button>
                                ))}
                            </div>
                            {missionKind !== "standard" && (
                                <p className="text-xs font-semibold text-[#E4572E] mt-2">
                                    AI will generate the content the moment you save. Steps / skills / strategies aren't needed for this type.
                                </p>
                            )}
                        </div>
                    )}

                    {!editing && (
                        <div>
                            <label className="block text-sm font-bold text-[#201D18] mb-1">Student</label>
                            <select
                                value={form.student_id}
                                onChange={(e) => setForm({ ...form, student_id: e.target.value })}
                                className="mb-input"
                                required
                                data-testid="mission-form-student"
                            >
                                <option value="">Select a student…</option>
                                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-bold text-[#201D18] mb-1">Title</label>
                        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mb-input" required data-testid="mission-form-title" />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-[#201D18] mb-1">Description (optional)</label>
                        <textarea
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            rows={2}
                            className="mb-input pt-3 h-auto"
                            data-testid="mission-form-description"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-[#201D18] mb-1">Estimated minutes</label>
                            <input
                                type="number"
                                min={1}
                                value={form.estimated_minutes}
                                onChange={(e) => setForm({ ...form, estimated_minutes: e.target.value })}
                                className="mb-input"
                                data-testid="mission-form-minutes"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-[#201D18] mb-1">Due date</label>
                            <input
                                type="date"
                                value={form.due_date}
                                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                                className="mb-input"
                                required
                                data-testid="mission-form-due-date"
                            />
                        </div>
                    </div>

                    {!editing && missionKind === "standard" && (
                        <div data-testid="mission-form-recurrence">
                            <label className="block text-sm font-bold text-[#201D18] mb-2">Repeat</label>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { v: "none", l: "Just once" },
                                    { v: "daily", l: "Every day" },
                                    { v: "weekdays", l: "Weekdays (Mon–Fri)" },
                                    { v: "weekends", l: "Weekends (Sat–Sun)" },
                                    { v: "weekly", l: "Weekly (same weekday)" },
                                ].map((o) => (
                                    <button
                                        key={o.v}
                                        type="button"
                                        onClick={() => setForm({ ...form, recurrence_pattern: o.v })}
                                        className={`mb-chip border-2 ${form.recurrence_pattern === o.v ? "bg-[#3F8C5E] text-[#201D18] border-[#2F6B47]" : "bg-white text-[#201D18] border-[#E8E0D2] hover:border-[#3F8C5E]"}`}
                                        data-testid={`mission-form-recurrence-${o.v}`}
                                    >
                                        {o.l}
                                    </button>
                                ))}
                            </div>
                            {form.recurrence_pattern !== "none" && (
                                <p className="text-xs font-semibold text-[#2F6B47] mt-2">
                                    We'll create instances for the next 30 days starting from your due date. Edits later only change the day you edit.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Verification (Iter 21) */}
                    <div data-testid="mission-form-verification-section">
                        <label className="block text-sm font-bold text-[#201D18] mb-2">Verification</label>
                        <div className="grid sm:grid-cols-2 gap-2">
                            {[
                                { v: "trust", l: "Trust", d: "Kid self-completes (default).", i: "✅" },
                                { v: "parent_pin", l: "Grown-up PIN", d: "A grown-up enters their verify PIN at completion.", i: "🔐" },
                                { v: "photo", l: "Photo proof", d: "Kid attaches a photo of the done work.", i: "📸" },
                                { v: "async_review", l: "Grown-up review", d: "Kid marks 'ready'. A grown-up approves later.", i: "⏳" },
                            ].map((o) => (
                                <button
                                    key={o.v}
                                    type="button"
                                    onClick={() => setForm({ ...form, verification: o.v })}
                                    className={`text-left rounded-2xl border-2 p-3 transition-all ${form.verification === o.v ? "border-[#E4572E] bg-[#E4572E]/5" : "border-[#E8E0D2] hover:border-[#9A9286]"}`}
                                    data-testid={`mission-form-verification-${o.v}`}
                                >
                                    <p className="font-display font-extrabold text-sm text-[#201D18]">
                                        <span className="mr-1.5">{o.i}</span>{o.l}
                                    </p>
                                    <p className="text-xs font-semibold text-[#6E675B] mt-0.5">{o.d}</p>
                                </button>
                            ))}
                        </div>
                        {form.verification === "async_review" && (
                            <div className="mt-3 flex items-center gap-2 text-sm">
                                <label className="font-semibold text-[#201D18]">Auto-approve after</label>
                                <input
                                    type="number"
                                    min={0}
                                    max={168}
                                    value={form.auto_approve_hours}
                                    onChange={(e) => setForm({ ...form, auto_approve_hours: Math.max(0, Math.min(168, Number(e.target.value) || 0)) })}
                                    className="w-20 rounded-lg border-2 border-[#E8E0D2] px-2 py-1 font-mono text-center focus:border-[#E4572E] outline-none"
                                    data-testid="mission-form-auto-approve-hours"
                                />
                                <span className="font-semibold text-[#6E675B]">hours (0 disables — approval required)</span>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-[#201D18] mb-2">Steps</label>
                        <div className="space-y-2" data-testid="mission-form-steps">
                            {form.steps.map((s, i) => (
                                <div key={i} className="flex gap-2">
                                    <input
                                        value={s}
                                        onChange={(e) => setStep(i, e.target.value)}
                                        placeholder={`Step ${i + 1}`}
                                        className="mb-input"
                                        data-testid={`mission-form-step-${i}`}
                                    />
                                    <button type="button" onClick={() => removeStep(i)} className="btn-pop-ghost px-3" data-testid={`mission-form-step-remove-${i}`}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button type="button" onClick={addStep} className="btn-pop-ghost mt-3 inline-flex items-center gap-2 text-sm py-2" data-testid="mission-form-add-step">
                            <Plus size={14} /> Add step
                        </button>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-[#201D18] mb-2">Skills</label>
                        <div className="flex flex-wrap gap-2" data-testid="mission-form-skills">
                            {skills.map((s) => {
                                const sel = form.skill_ids.includes(s.id);
                                return (
                                    <span key={s.id} className="inline-flex items-center">
                                        <button
                                            type="button"
                                            onClick={() => toggle("skill_ids", s.id)}
                                            className={`mb-chip border-2 inline-flex items-center gap-1 ${sel ? "bg-[#E4572E] text-white border-[#E4572E]" : "bg-white border-[#E8E0D2] text-[#201D18] hover:border-[#E4572E]"}`}
                                            data-testid={`mission-form-skill-${s.id}`}
                                        >
                                            {s.name}
                                        </button>
                                        <EvidenceBadge
                                            citationIds={s.evidence_refs}
                                            tone={sel ? "muted" : "indigo"}
                                            size={11}
                                            testId={`mission-form-skill-evidence-${s.id}`}
                                        />
                                    </span>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-[#201D18] mb-2">Strategies</label>
                        <div className="flex flex-wrap gap-2" data-testid="mission-form-strategies">
                            {strategies.map((s) => {
                                const sel = form.strategy_ids.includes(s.id);
                                return (
                                    <span key={s.id} className="inline-flex items-center">
                                        <button
                                            type="button"
                                            onClick={() => toggle("strategy_ids", s.id)}
                                            className={`mb-chip border-2 inline-flex items-center gap-1 ${sel ? "bg-[#E8A33D] text-[#201D18] border-[#C98A2E]" : "bg-white border-[#E8E0D2] text-[#201D18] hover:border-[#E8A33D]"}`}
                                            data-testid={`mission-form-strategy-${s.id}`}
                                        >
                                            {s.emoji} {s.name}
                                        </button>
                                        <EvidenceBadge
                                            citationIds={s.evidence_refs}
                                            size={11}
                                            testId={`mission-form-strategy-evidence-${s.id}`}
                                        />
                                    </span>
                                );
                            })}
                        </div>
                    </div>

                    {err && <p className="text-sm font-bold text-[#BC4B32] bg-[#BC4B32]/10 rounded-xl px-3 py-2" data-testid="mission-form-error">{err}</p>}

                    {editing && loadedMission && (loadedMission.recurrence_parent_id || (loadedMission.recurrence_pattern && loadedMission.recurrence_pattern !== "none")) && (
                        <div className="mb-card p-4 bg-[#F7E8D8] border-[#E8A33D]" data-testid="edit-scope-picker">
                            <p className="text-xs font-bold uppercase tracking-widest text-[#8A6413] mb-2">Recurring mission · apply changes to</p>
                            <div className="grid sm:grid-cols-3 gap-2">
                                {[
                                    { v: "this", label: "Just this day", desc: "Only this occurrence." },
                                    { v: "future", label: "This + future", desc: "This and all later uncompleted occurrences." },
                                    { v: "series", label: "Entire series", desc: "All uncompleted occurrences. History is preserved." },
                                ].map((opt) => (
                                    <button
                                        key={opt.v}
                                        type="button"
                                        onClick={() => setEditScope(opt.v)}
                                        className={`text-left rounded-2xl border-2 p-3 transition-all ${editScope === opt.v ? "border-[#E4572E] bg-white" : "border-[#E8E0D2] bg-white hover:border-[#E4572E]"}`}
                                        data-testid={`edit-scope-${opt.v}`}
                                    >
                                        <p className="font-bold text-sm text-[#201D18]">{opt.label}</p>
                                        <p className="text-xs text-[#6E675B] mt-1">{opt.desc}</p>
                                    </button>
                                ))}
                            </div>
                            {editScope !== "this" && (
                                <p className="text-xs font-semibold text-[#8A6413] mt-2">
                                    Note: the due date won&apos;t change across occurrences when applying to {editScope === "future" ? "future" : "the whole series"}.
                                </p>
                            )}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button type="submit" disabled={busy} className="btn-pop-primary flex-1 flex items-center justify-center gap-2" data-testid="mission-form-submit">
                            <Save size={16} /> {busy ? "Saving…" : (editing ? "Save changes" : "Create mission")}
                        </button>
                        <Link to="/parent" className="btn-pop-ghost flex items-center justify-center" data-testid="mission-form-cancel">
                            Cancel
                        </Link>
                    </div>
                </form>
            </main>
        </div>
    );
}
