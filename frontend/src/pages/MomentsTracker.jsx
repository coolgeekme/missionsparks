import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import EvidenceBadge from "../components/EvidenceBadge";
import { api, formatApiErrorDetail, API } from "../lib/api";
import {
    ArrowLeft, Plus, Trash2, Download, BarChart3, X, Filter, Clock, ChevronRight, Mic,
} from "lucide-react";
import AudioRecorder from "../components/AudioRecorder";

const fmtTime = (iso) => {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
};
const nowLocalInput = () => {
    const d = new Date();
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 16);
};
const localToIso = (local) => {
    if (!local) return new Date().toISOString();
    return new Date(local).toISOString();
};

export default function MomentsTracker() {
    const navigate = useNavigate();
    const [students, setStudents] = useState([]);
    const [selected, setSelected] = useState(null);
    const [catalog, setCatalog] = useState({ moment_types: [], triggers: [] });
    const [moments, setMoments] = useState([]);
    const [filter, setFilter] = useState({ type: "", trigger: "" });
    const [busy, setBusy] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [err, setErr] = useState("");

    const [form, setForm] = useState({
        timestamp: nowLocalInput(),
        moment_type: "",
        intensity: 3,
        duration_minutes: "",
        triggers: [],
        context_note: "",
        antecedent: "",
        response: "",
        outcome: "",
        notes: "",
    });
    // Voice mode: when true the modal opens to the recorder first
    const [voiceMode, setVoiceMode] = useState(false);
    const [pendingAudio, setPendingAudio] = useState(null); // {audio_data, audio_mime, transcript}
    const [transcript, setTranscript] = useState("");

    const typeMap = useMemo(() => Object.fromEntries(catalog.moment_types.map((t) => [t.key, t])), [catalog]);
    const trigMap = useMemo(() => Object.fromEntries(catalog.triggers.map((t) => [t.key, t])), [catalog]);

    const load = async (studentId) => {
        const params = {};
        if (studentId) params.student_id = studentId;
        if (filter.type) params.moment_type = filter.type;
        if (filter.trigger) params.trigger = filter.trigger;
        const { data } = await api.get("/moments", { params });
        setMoments(data);
    };

    useEffect(() => {
        (async () => {
            const [stu, cat] = await Promise.all([api.get("/students"), api.get("/moments/catalog")]);
            setStudents(stu.data);
            setCatalog(cat.data);
            if (stu.data[0]) setSelected(stu.data[0]);
        })();
    }, []);

    useEffect(() => {
        if (selected) load(selected.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected, filter.type, filter.trigger]);

    const toggleTrigger = (k) => {
        const cur = new Set(form.triggers);
        if (cur.has(k)) cur.delete(k); else cur.add(k);
        setForm({ ...form, triggers: Array.from(cur) });
    };

    const submit = async (e) => {
        e.preventDefault();
        if (!form.moment_type) { setErr("Pick a moment first."); return; }
        setBusy(true);
        setErr("");
        try {
            await api.post("/moments", {
                student_id: selected?.id,
                timestamp: localToIso(form.timestamp),
                moment_type: form.moment_type,
                intensity: Number(form.intensity) || 3,
                duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
                triggers: form.triggers,
                context_note: form.context_note,
                antecedent: form.antecedent,
                response: form.response,
                outcome: form.outcome,
                notes: form.notes,
                audio_data: pendingAudio?.audio_data || null,
                audio_mime: pendingAudio?.audio_mime || null,
                transcript: pendingAudio?.transcript || transcript || null,
            });
            closeForm();
            load(selected.id);
        } catch (e2) {
            setErr(formatApiErrorDetail(e2.response?.data?.detail) || e2.message);
        } finally {
            setBusy(false);
        }
    };

    const closeForm = () => {
        setFormOpen(false);
        setVoiceMode(false);
        setPendingAudio(null);
        setTranscript("");
        setForm({
            timestamp: nowLocalInput(), moment_type: "", intensity: 3, duration_minutes: "",
            triggers: [], context_note: "", antecedent: "", response: "", outcome: "", notes: "",
        });
    };

    const handleParsed = ({ transcript: tx, audio_data, audio_mime, parsed }) => {
        setTranscript(tx);
        setPendingAudio({ audio_data, audio_mime, transcript: tx });
        setForm((f) => ({
            ...f,
            moment_type: parsed.moment_type || f.moment_type,
            intensity: parsed.intensity || f.intensity,
            triggers: parsed.triggers || [],
            context_note: parsed.context_note || "",
            antecedent: parsed.antecedent || "",
            response: parsed.response || "",
            outcome: parsed.outcome || "",
            notes: parsed.notes || "",
        }));
        setVoiceMode(false);
    };

    const openVoice = () => {
        setVoiceMode(true);
        setFormOpen(true);
    };

    const removeMoment = async (id) => {
        if (!window.confirm("Delete this moment?")) return;
        await api.delete(`/moments/${id}`);
        load(selected.id);
    };

    const exportCsv = () => {
        const url = `${API}/moments/export.csv${selected ? `?student_id=${selected.id}` : ""}`;
        // Use fetch to include cookies, then trigger download
        fetch(url, { credentials: "include" })
            .then((r) => r.blob())
            .then((blob) => {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `moments_${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
            });
    };

    return (
        <div className="min-h-screen" data-testid="moments-tracker-page">
            <Navbar />
            <main className="max-w-6xl mx-auto p-6 md:p-10 space-y-6">
                <Link to="/parent" className="inline-flex items-center gap-2 text-sm font-bold text-[#4361EE]" data-testid="moments-back">
                    <ArrowLeft size={16} /> Back to dashboard
                </Link>
                <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">Behavior tracker</p>
                        <h1 className="font-display font-extrabold text-4xl sm:text-5xl text-[#0B132B] mt-1">Moments</h1>
                        <p className="text-[#4A5568] font-semibold mt-2">Capture what happened, what set it off, and what helped. Patterns build over time.</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <button onClick={() => navigate("/parent/moments/insights")} className="btn-pop-ghost flex items-center gap-2" data-testid="moments-go-insights">
                            <BarChart3 size={16} /> Insights
                        </button>
                        <button onClick={exportCsv} className="btn-pop-ghost flex items-center gap-2" data-testid="moments-export-csv">
                            <Download size={16} /> Export CSV
                        </button>
                        <button onClick={openVoice} disabled={!selected} className="btn-pop-secondary flex items-center gap-2 disabled:opacity-50" data-testid="moments-speak">
                            <Mic size={16} /> Speak it
                        </button>
                        <button onClick={() => setFormOpen(true)} disabled={!selected} className="btn-pop-primary flex items-center gap-2 disabled:opacity-50" data-testid="moments-add">
                            <Plus size={16} /> Log moment
                        </button>
                    </div>
                </header>

                {students.length > 1 && (
                    <div className="flex flex-wrap gap-2" data-testid="moments-student-chips">
                        {students.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => setSelected(s)}
                                className={`mb-chip border-2 ${selected?.id === s.id ? "bg-[#4361EE] text-white border-[#4361EE]" : "bg-white border-[#E2E8F0]"}`}
                                data-testid={`moments-student-${s.id}`}
                            >
                                🚀 {s.name}
                            </button>
                        ))}
                    </div>
                )}

                <section className="mb-card p-5" data-testid="moments-filters">
                    <div className="flex items-center gap-2 mb-3">
                        <Filter size={16} className="text-[#4361EE]" />
                        <p className="font-bold text-[#0B132B]">Filter</p>
                        {(filter.type || filter.trigger) && (
                            <button onClick={() => setFilter({ type: "", trigger: "" })} className="ml-auto text-xs font-bold text-[#EF476F]" data-testid="moments-filter-clear">
                                Clear
                            </button>
                        )}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                        <select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })} className="mb-input" data-testid="moments-filter-type">
                            <option value="">All moments</option>
                            {catalog.moment_types.map((t) => <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>)}
                        </select>
                        <select value={filter.trigger} onChange={(e) => setFilter({ ...filter, trigger: e.target.value })} className="mb-input" data-testid="moments-filter-trigger">
                            <option value="">All triggers</option>
                            {catalog.triggers.map((t) => <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>)}
                        </select>
                    </div>
                </section>

                <section data-testid="moments-list">
                    {moments.length === 0 ? (
                        <div className="mb-card p-8 text-center" data-testid="moments-empty">
                            <p className="font-display font-bold text-xl text-[#0B132B]">No moments logged yet</p>
                            <p className="text-[#4A5568] font-semibold mt-1">Hit "Log moment" the next time something noteworthy happens.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {moments.map((m) => {
                                const t = typeMap[m.moment_type] || { emoji: "📌", label: m.moment_type, category: "neutral" };
                                const catColor = t.category === "challenging" ? "bg-[#EF476F]/10 text-[#9b1c3c] border-[#EF476F]" :
                                    t.category === "positive" ? "bg-[#06D6A0]/15 text-[#057a5b] border-[#06D6A0]" :
                                    "bg-[#F0F8FF] text-[#0B132B] border-[#E2E8F0]";
                                return (
                                    <article key={m.id} className="mb-card p-4 sm:p-5" data-testid={`moment-${m.id}`}>
                                        <div className="flex items-start justify-between gap-3 flex-wrap">
                                            <div className="flex items-center gap-3">
                                                <div className={`h-12 w-12 rounded-2xl flex items-center justify-center border-2 text-2xl ${catColor}`}>
                                                    {t.emoji}
                                                </div>
                                                <div>
                                                    <h3 className="font-display font-bold text-lg text-[#0B132B]">{t.label}</h3>
                                                    <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0] mt-0.5 flex items-center gap-1">
                                                        <Clock size={12} /> {fmtTime(m.timestamp)} · by {m.logged_by_role}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="mb-chip bg-[#FFD166]/30 text-[#876200]" title="Intensity 1-5">
                                                    {"●".repeat(m.intensity)}{"○".repeat(5 - m.intensity)}
                                                </span>
                                                <button onClick={() => removeMoment(m.id)} className="p-2 rounded-xl hover:bg-[#EF476F]/10" data-testid={`moment-delete-${m.id}`} aria-label="delete">
                                                    <Trash2 size={14} className="text-[#EF476F]" />
                                                </button>
                                            </div>
                                        </div>
                                        {m.triggers.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-3">
                                                {m.triggers.map((tg, i) => {
                                                    const tr = trigMap[tg];
                                                    return <span key={i} className="mb-chip bg-[#4361EE]/10 text-[#4361EE] text-xs py-0.5 px-2">
                                                        {tr ? `${tr.emoji} ${tr.label}` : tg}
                                                    </span>;
                                                })}
                                            </div>
                                        )}
                                        {(m.context_note || m.antecedent || m.response || m.outcome || m.notes) && (
                                            <div className="mt-3 grid sm:grid-cols-2 gap-2 text-sm">
                                                {m.context_note && <Detail label="Context" v={m.context_note} />}
                                                {m.antecedent && <Detail label="Just before" v={m.antecedent} />}
                                                {m.response && <Detail label="What we tried" v={m.response} />}
                                                {m.outcome && <Detail label="Outcome" v={m.outcome} />}
                                                {m.notes && <Detail label="Notes" v={m.notes} />}
                                            </div>
                                        )}
                                        {m.transcript && (
                                            <div className="mt-3 rounded-2xl bg-[#FFD166]/15 border-2 border-[#FFD166] p-3" data-testid={`moment-transcript-${m.id}`}>
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-[#876200]">🎤 Voice note</p>
                                                <p className="text-sm font-semibold text-[#0B132B] mt-1 italic">"{m.transcript}"</p>
                                                {m.audio_data && (
                                                    <audio
                                                        controls
                                                        className="mt-2 w-full"
                                                        src={`data:${m.audio_mime || "audio/webm"};base64,${m.audio_data}`}
                                                        data-testid={`moment-audio-${m.id}`}
                                                    />
                                                )}
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>
            </main>

            {formOpen && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-3" data-testid="moments-form-modal" onClick={closeForm}>
                    <div className="bg-white rounded-3xl border-2 border-[#E2E8F0] w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        {voiceMode ? (
                            <div className="p-6 space-y-5" data-testid="moments-voice-panel">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h2 className="font-display font-extrabold text-2xl text-[#0B132B]">Speak the moment</h2>
                                        <p className="text-sm font-semibold text-[#4A5568] mt-1">
                                            Just describe what happened for {selected?.name}. AI will fill in the form — you'll review before saving.
                                        </p>
                                        <p className="text-xs font-bold text-[#A0AEC0] mt-2">
                                            Try: "Enzo was doing homework and got frustrated when math problems got hard. We did a body break and he came back."
                                        </p>
                                    </div>
                                    <button type="button" onClick={closeForm} className="p-2 rounded-xl hover:bg-[#F7FAFC]" data-testid="moments-voice-close" aria-label="close">
                                        <X size={18} />
                                    </button>
                                </div>
                                <AudioRecorder onParsed={handleParsed} />
                                <button type="button" onClick={() => setVoiceMode(false)} className="btn-pop-ghost w-full text-sm py-2" data-testid="moments-voice-skip">
                                    Or type it instead →
                                </button>
                            </div>
                        ) : (
                        <form onSubmit={submit} className="p-6 space-y-5" data-testid="moments-form">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h2 className="font-display font-extrabold text-2xl text-[#0B132B]">Log a moment</h2>
                                    <p className="text-sm font-semibold text-[#4A5568] mt-1">For {selected?.name}. The more detail, the better the pattern.</p>
                                </div>
                                <button type="button" onClick={closeForm} className="p-2 rounded-xl hover:bg-[#F7FAFC]" data-testid="moments-form-close" aria-label="close">
                                    <X size={18} />
                                </button>
                            </div>

                            {transcript && (
                                <div className="rounded-2xl bg-[#FFD166]/20 border-2 border-[#FFD166] p-3" data-testid="moments-form-transcript">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#876200]">🎤 What you said</p>
                                    <p className="text-sm font-semibold text-[#0B132B] mt-1 italic">"{transcript}"</p>
                                </div>
                            )}

                            <div>
                                <p className="text-sm font-bold text-[#0B132B] mb-2">What happened?</p>
                                <div className="flex flex-wrap gap-2" data-testid="moments-form-types">
                                    {catalog.moment_types.map((t) => (
                                        <span key={t.key} className="inline-flex items-center">
                                            <button
                                                type="button"
                                                onClick={() => setForm({ ...form, moment_type: t.key })}
                                                className={`mb-chip border-2 inline-flex items-center gap-1 ${form.moment_type === t.key
                                                    ? (t.category === "challenging" ? "bg-[#EF476F] text-white border-[#EF476F]"
                                                        : t.category === "positive" ? "bg-[#06D6A0] text-white border-[#06D6A0]"
                                                        : "bg-[#4361EE] text-white border-[#4361EE]")
                                                    : "bg-white border-[#E2E8F0] text-[#0B132B] hover:border-[#4361EE]"}`}
                                                data-testid={`moments-form-type-${t.key}`}
                                            >
                                                {t.emoji} {t.label}
                                            </button>
                                            <EvidenceBadge
                                                citationIds={t.evidence_refs}
                                                tone={form.moment_type === t.key ? "muted" : "amber"}
                                                size={11}
                                                testId={`moments-form-type-evidence-${t.key}`}
                                            />
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="grid sm:grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm font-bold text-[#0B132B] mb-2">When?</p>
                                    <input type="datetime-local" value={form.timestamp} onChange={(e) => setForm({ ...form, timestamp: e.target.value })} className="mb-input" data-testid="moments-form-time" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-[#0B132B] mb-2">Intensity (1-5)</p>
                                    <input type="range" min="1" max="5" value={form.intensity} onChange={(e) => setForm({ ...form, intensity: Number(e.target.value) })} className="w-full" data-testid="moments-form-intensity" />
                                    <p className="text-center font-display font-extrabold text-2xl text-[#EF476F]" data-testid="moments-form-intensity-display">{form.intensity}</p>
                                </div>
                            </div>

                            <div>
                                <p className="text-sm font-bold text-[#0B132B] mb-2">Triggers (tap any that apply)</p>
                                <div className="flex flex-wrap gap-2" data-testid="moments-form-triggers">
                                    {catalog.triggers.map((t) => {
                                        const sel = form.triggers.includes(t.key);
                                        return (
                                            <span key={t.key} className="inline-flex items-center">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleTrigger(t.key)}
                                                    className={`mb-chip border-2 inline-flex items-center gap-1 ${sel ? "bg-[#4361EE] text-white border-[#4361EE]" : "bg-white border-[#E2E8F0] hover:border-[#4361EE]"}`}
                                                    data-testid={`moments-form-trigger-${t.key}`}
                                                >
                                                    {t.emoji} {t.label}
                                                </button>
                                                <EvidenceBadge
                                                    citationIds={t.evidence_refs}
                                                    tone={sel ? "muted" : "indigo"}
                                                    size={11}
                                                    testId={`moments-form-trigger-evidence-${t.key}`}
                                                />
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid sm:grid-cols-2 gap-3">
                                <TextField label="Context (where/activity)" value={form.context_note} onChange={(v) => setForm({ ...form, context_note: v })} testid="moments-form-context" />
                                <TextField label="Just before (antecedent)" value={form.antecedent} onChange={(v) => setForm({ ...form, antecedent: v })} testid="moments-form-antecedent" />
                                <TextField label="What we tried" value={form.response} onChange={(v) => setForm({ ...form, response: v })} testid="moments-form-response" />
                                <TextField label="Outcome / what helped" value={form.outcome} onChange={(v) => setForm({ ...form, outcome: v })} testid="moments-form-outcome" />
                            </div>

                            <TextField label="Extra notes (optional)" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} testid="moments-form-notes" textarea />

                            {err && <p className="text-sm font-bold text-[#EF476F] bg-[#EF476F]/10 rounded-xl px-3 py-2" data-testid="moments-form-error">{err}</p>}

                            <div className="flex gap-3 pt-2">
                                <button type="submit" disabled={busy} className="btn-pop-primary flex-1 flex items-center justify-center gap-2" data-testid="moments-form-submit">
                                    {busy ? "Saving…" : (<><ChevronRight size={16} /> Save moment</>)}
                                </button>
                                <button type="button" onClick={closeForm} className="btn-pop-ghost" data-testid="moments-form-cancel">Cancel</button>
                            </div>
                        </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function Detail({ label, v }) {
    return (
        <div className="rounded-2xl bg-[#F0F8FF] border-2 border-[#E2E8F0] p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#A0AEC0]">{label}</p>
            <p className="text-sm font-semibold text-[#0B132B] mt-0.5">{v}</p>
        </div>
    );
}

function TextField({ label, value, onChange, testid, textarea }) {
    return (
        <div>
            <label className="block text-sm font-bold text-[#0B132B] mb-1">{label}</label>
            {textarea ? (
                <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} className="mb-input pt-3 h-auto" data-testid={testid} />
            ) : (
                <input value={value} onChange={(e) => onChange(e.target.value)} className="mb-input" data-testid={testid} />
            )}
        </div>
    );
}
