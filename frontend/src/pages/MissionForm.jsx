import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiErrorDetail } from "../lib/api";
import { Save, Trash2, Plus, ArrowLeft, Sparkles, Loader2 } from "lucide-react";

const todayISO = () => new Date().toISOString().slice(0, 10);

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
    });
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);

    // AI draft
    const [aiPrompt, setAiPrompt] = useState("");
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
                });
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
            const payload = {
                ...form,
                steps: form.steps.map((s) => s.trim()).filter(Boolean),
                estimated_minutes: Number(form.estimated_minutes) || 10,
            };
            if (editing) {
                const { student_id, ...rest } = payload; // eslint-disable-line no-unused-vars
                await api.put(`/missions/${id}`, rest);
            } else {
                await api.post("/missions", payload);
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
                <Link to="/parent" className="inline-flex items-center gap-2 text-sm font-bold text-[#4361EE] mb-4" data-testid="mission-form-back">
                    <ArrowLeft size={16} /> Back to dashboard
                </Link>
                <h1 className="font-display font-extrabold text-4xl text-[#0B132B] mb-1">
                    {editing ? "Edit mission" : "Create a mission"}
                </h1>
                <p className="text-[#4A5568] font-semibold mb-6">Small steps. Big wins. 🌱</p>

                {!editing && (
                    <div className="mb-card p-5 mb-5 border-[#FFD166]" data-testid="mission-form-ai-panel">
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="text-[#FFD166]" size={18} />
                            <h2 className="font-display font-bold text-lg text-[#0B132B]">Draft with AI</h2>
                            <span className="mb-chip bg-[#FFD166]/30 text-[#876200] text-xs py-0.5 px-2">Optional</span>
                        </div>
                        <p className="text-sm font-semibold text-[#4A5568] mb-3">
                            Type a one-line idea and let AI fill in the title, steps, skills, and strategies. You can still edit everything below before saving.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <input
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                placeholder="e.g. Reading practice with our chapter book about dragons"
                                className="mb-input flex-1"
                                data-testid="mission-form-ai-prompt"
                            />
                            <button
                                type="button"
                                onClick={draftWithAI}
                                disabled={aiBusy || !form.student_id}
                                className="btn-pop-secondary flex items-center justify-center gap-2 disabled:opacity-50"
                                data-testid="mission-form-ai-draft"
                            >
                                {aiBusy ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                                {aiBusy ? "Drafting…" : "Draft for me"}
                            </button>
                        </div>
                        {aiErr && <p className="text-sm font-bold text-[#EF476F] bg-[#EF476F]/10 rounded-xl px-3 py-2 mt-3" data-testid="mission-form-ai-error">{aiErr}</p>}
                    </div>
                )}

                <form onSubmit={submit} className="mb-card p-6 space-y-5" data-testid="mission-form">
                    {!editing && (
                        <div>
                            <label className="block text-sm font-bold text-[#0B132B] mb-1">Student</label>
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
                        <label className="block text-sm font-bold text-[#0B132B] mb-1">Title</label>
                        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mb-input" required data-testid="mission-form-title" />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-[#0B132B] mb-1">Description (optional)</label>
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
                            <label className="block text-sm font-bold text-[#0B132B] mb-1">Estimated minutes</label>
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
                            <label className="block text-sm font-bold text-[#0B132B] mb-1">Due date</label>
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

                    <div>
                        <label className="block text-sm font-bold text-[#0B132B] mb-2">Steps</label>
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
                        <label className="block text-sm font-bold text-[#0B132B] mb-2">Skills</label>
                        <div className="flex flex-wrap gap-2" data-testid="mission-form-skills">
                            {skills.map((s) => {
                                const sel = form.skill_ids.includes(s.id);
                                return (
                                    <button
                                        type="button"
                                        key={s.id}
                                        onClick={() => toggle("skill_ids", s.id)}
                                        className={`mb-chip border-2 ${sel ? "bg-[#4361EE] text-white border-[#4361EE]" : "bg-white border-[#E2E8F0] text-[#0B132B] hover:border-[#4361EE]"}`}
                                        data-testid={`mission-form-skill-${s.id}`}
                                    >
                                        {s.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-[#0B132B] mb-2">Strategies</label>
                        <div className="flex flex-wrap gap-2" data-testid="mission-form-strategies">
                            {strategies.map((s) => {
                                const sel = form.strategy_ids.includes(s.id);
                                return (
                                    <button
                                        type="button"
                                        key={s.id}
                                        onClick={() => toggle("strategy_ids", s.id)}
                                        className={`mb-chip border-2 ${sel ? "bg-[#FFD166] text-[#0B132B] border-[#E5BC5C]" : "bg-white border-[#E2E8F0] text-[#0B132B] hover:border-[#FFD166]"}`}
                                        data-testid={`mission-form-strategy-${s.id}`}
                                    >
                                        {s.emoji} {s.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {err && <p className="text-sm font-bold text-[#EF476F] bg-[#EF476F]/10 rounded-xl px-3 py-2" data-testid="mission-form-error">{err}</p>}

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
