import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import {
    ArrowLeft, ArrowRight, ChevronRight, Save, Sparkles, MessageCircle,
    Loader2, X, Plus, Check, Send, Wand2, BookOpen,
} from "lucide-react";
import {
    GRADE_OPTIONS, READING_LEVEL_OPTIONS, ADHD_SUBTYPE_OPTIONS, PEAK_HOUR_OPTIONS,
    SUGGESTED_INTERESTS, SUGGESTED_SENSITIVITIES, SUGGESTED_TRIGGERS,
    SUGGESTED_STRENGTHS, SUGGESTED_MOTIVATORS,
    VANDERBILT_SCALE, VANDERBILT_INATTENTION, VANDERBILT_HYPERACTIVITY,
} from "../data/intakeOptions";

const EMPTY_PROFILE = {
    grade: null, reading_level: null, school: null,
    diagnosed: null, adhd_subtype: null, diagnosis_year: null, on_medication: null,
    interests: [], sensitivities: [], peak_hours: [],
    common_triggers: [], strengths: [], motivators: [],
    vanderbilt_inattention: [], vanderbilt_hyperactivity: [],
    vanderbilt_taken_at: null,
    interview_summary: null, interview_completed_at: null,
    parent_notes: null,
};

const STEPS = [
    { key: "basics", label: "Basics" },
    { key: "adhd", label: "ADHD details" },
    { key: "interests", label: "Interests & strengths" },
    { key: "sensitivities", label: "Sensitivities & triggers" },
    { key: "peak", label: "Peak hours & motivators" },
    { key: "vanderbilt", label: "Quick screen" },
    { key: "review", label: "Review" },
];

export default function StudentIntake() {
    const { studentId } = useParams();
    const navigate = useNavigate();
    const [student, setStudent] = useState(null);
    const [profile, setProfile] = useState(EMPTY_PROFILE);
    const [stepIdx, setStepIdx] = useState(0);
    const [saving, setSaving] = useState(false);
    const [showInterview, setShowInterview] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [students, p] = await Promise.all([
                    api.get("/students"),
                    api.get(`/students/${studentId}/intake`),
                ]);
                const found = students.data.find((s) => s.id === studentId);
                if (!found) {
                    toast.error("Student not found.");
                    navigate("/parent");
                    return;
                }
                setStudent(found);
                setProfile({ ...EMPTY_PROFILE, ...(p.data || {}) });
            } catch (err) {
                toast.error(formatApiErrorDetail(err));
                navigate("/parent");
            }
        })();
    }, [studentId, navigate]);

    const save = async () => {
        setSaving(true);
        try {
            const payload = {
                ...profile,
                vanderbilt_taken_at:
                    profile.vanderbilt_inattention.length === 9 || profile.vanderbilt_hyperactivity.length === 9
                        ? profile.vanderbilt_taken_at || new Date().toISOString()
                        : profile.vanderbilt_taken_at,
            };
            const { data } = await api.put(`/students/${studentId}/intake`, payload);
            setProfile({ ...EMPTY_PROFILE, ...data });
            toast.success("Profile saved.");
        } catch (err) {
            toast.error(formatApiErrorDetail(err));
        } finally {
            setSaving(false);
        }
    };

    const completion = useMemo(() => computeCompletion(profile), [profile]);

    if (!student) {
        return (
            <div className="min-h-screen">
                <Navbar />
                <div className="max-w-3xl mx-auto p-10 text-center font-bold text-[#4A5568]">Loading…</div>
            </div>
        );
    }

    const step = STEPS[stepIdx];

    return (
        <div className="min-h-screen" data-testid="intake-page">
            <Navbar />
            <main className="max-w-3xl mx-auto p-6 sm:p-10 space-y-6">
                <Link to="/parent" className="inline-flex items-center gap-2 text-sm font-bold text-[#4361EE]" data-testid="intake-back">
                    <ArrowLeft size={16} /> Back to dashboard
                </Link>

                <header className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">Child profile · intake</p>
                    <h1 className="font-display font-extrabold text-4xl sm:text-5xl text-[#0B132B]">Tell us about {student.name}</h1>
                    <p className="text-[#4A5568] font-semibold">
                        The more we know, the better every AI-drafted mission fits {student.name}. You can come back and update this any time.
                    </p>
                </header>

                <section className="mb-card p-5 space-y-3" data-testid="intake-completion">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-[#0B132B]">Profile completion</p>
                        <span className="text-sm font-extrabold text-[#4361EE]">{completion.percent}%</span>
                    </div>
                    <div className="h-3 rounded-full bg-[#E2E8F0] overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[#4361EE] to-[#06D6A0] transition-all" style={{ width: `${completion.percent}%` }} />
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                        {STEPS.slice(0, -1).map((s, i) => (
                            <button
                                key={s.key}
                                type="button"
                                onClick={() => setStepIdx(i)}
                                className={`mb-chip border-2 text-xs ${completion.done[s.key] ? "bg-[#06D6A0]/15 text-[#057a5b] border-[#06D6A0]/30" : i === stepIdx ? "bg-[#4361EE] text-white border-[#4361EE]" : "bg-white text-[#4A5568] border-[#E2E8F0]"}`}
                                data-testid={`intake-step-jump-${s.key}`}
                            >
                                {completion.done[s.key] && <Check size={12} />} {s.label}
                            </button>
                        ))}
                    </div>
                </section>

                <section className="mb-card p-6 space-y-5" data-testid={`intake-step-${step.key}`}>
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">Step {stepIdx + 1} of {STEPS.length}</p>
                        <button
                            type="button"
                            onClick={() => setShowInterview(true)}
                            className="btn-pop-ghost text-xs flex items-center gap-1.5"
                            data-testid="intake-open-interview"
                        >
                            <Wand2 size={14} /> Skip the form — chat with our coach instead
                        </button>
                    </div>
                    <h2 className="font-display font-extrabold text-2xl text-[#0B132B]">{step.label}</h2>

                    {step.key === "basics" && <BasicsStep profile={profile} setProfile={setProfile} />}
                    {step.key === "adhd" && <AdhdStep profile={profile} setProfile={setProfile} />}
                    {step.key === "interests" && (
                        <ChipMultiStep profile={profile} setProfile={setProfile}
                            fields={[
                                { key: "interests", label: "What's your child into?", suggestions: SUGGESTED_INTERESTS, testId: "intake-interests" },
                                { key: "strengths", label: "Strengths and qualities", suggestions: SUGGESTED_STRENGTHS, testId: "intake-strengths" },
                            ]}
                        />
                    )}
                    {step.key === "sensitivities" && (
                        <ChipMultiStep profile={profile} setProfile={setProfile}
                            fields={[
                                { key: "sensitivities", label: "Sensory or environmental sensitivities", suggestions: SUGGESTED_SENSITIVITIES, testId: "intake-sensitivities" },
                                { key: "common_triggers", label: "Common things that derail learning", suggestions: SUGGESTED_TRIGGERS, testId: "intake-triggers" },
                            ]}
                        />
                    )}
                    {step.key === "peak" && <PeakStep profile={profile} setProfile={setProfile} />}
                    {step.key === "vanderbilt" && <VanderbiltStep profile={profile} setProfile={setProfile} />}
                    {step.key === "review" && <ReviewStep profile={profile} student={student} />}

                    <div className="flex items-center justify-between pt-4 border-t-2 border-[#E2E8F0] gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
                            disabled={stepIdx === 0}
                            className="btn-pop-ghost text-sm flex items-center gap-1.5 disabled:opacity-40"
                            data-testid="intake-prev"
                        >
                            <ArrowLeft size={14} /> Back
                        </button>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={save}
                                disabled={saving}
                                className="btn-pop-ghost text-sm flex items-center gap-1.5"
                                data-testid="intake-save"
                            >
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
                            </button>
                            {stepIdx < STEPS.length - 1 ? (
                                <button
                                    type="button"
                                    onClick={() => setStepIdx(stepIdx + 1)}
                                    className="btn-pop-primary text-sm flex items-center gap-1.5"
                                    data-testid="intake-next"
                                >
                                    Next <ArrowRight size={14} />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={async () => { await save(); navigate("/parent"); }}
                                    className="btn-pop-primary text-sm flex items-center gap-1.5"
                                    data-testid="intake-finish"
                                >
                                    Save & finish <Check size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                </section>

                {step.key === "vanderbilt" && (
                    <p className="text-xs text-[#4A5568] font-semibold">
                        <BookOpen size={11} className="inline mr-1 text-[#876200]" />
                        Short form inspired by the NICHQ Vanderbilt parent rating scale (Wolraich 2003). Not a diagnostic tool — share results with your pediatrician if you're concerned.
                    </p>
                )}
            </main>

            {showInterview && (
                <InterviewModal
                    studentId={studentId}
                    studentName={student.name}
                    onClose={() => setShowInterview(false)}
                    onFinished={async () => {
                        // Re-pull the profile (interview likely merged interests/etc)
                        const { data } = await api.get(`/students/${studentId}/intake`);
                        setProfile({ ...EMPTY_PROFILE, ...data });
                        setShowInterview(false);
                        toast.success("Coach summary saved to the profile.");
                    }}
                />
            )}
        </div>
    );
}

// ---------- Steps ----------
function BasicsStep({ profile, setProfile }) {
    return (
        <div className="space-y-4">
            <Field label="Grade">
                <select className="mb-input" value={profile.grade || ""} onChange={(e) => setProfile({ ...profile, grade: e.target.value || null })} data-testid="intake-grade">
                    <option value="">Select…</option>
                    {GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
            </Field>
            <Field label="Reading level">
                <select className="mb-input" value={profile.reading_level || ""} onChange={(e) => setProfile({ ...profile, reading_level: e.target.value || null })} data-testid="intake-reading-level">
                    <option value="">Select…</option>
                    {READING_LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </Field>
            <Field label="School (optional)">
                <input className="mb-input" value={profile.school || ""} onChange={(e) => setProfile({ ...profile, school: e.target.value })} data-testid="intake-school" />
            </Field>
        </div>
    );
}

function AdhdStep({ profile, setProfile }) {
    return (
        <div className="space-y-4">
            <Field label="Has your child been formally diagnosed?">
                <div className="flex gap-2">
                    {[{ v: true, l: "Yes" }, { v: false, l: "No" }, { v: null, l: "Not sure" }].map((o) => (
                        <button key={String(o.v)} type="button"
                            onClick={() => setProfile({ ...profile, diagnosed: o.v })}
                            className={`mb-chip border-2 ${profile.diagnosed === o.v ? "bg-[#4361EE] text-white border-[#4361EE]" : "bg-white text-[#0B132B] border-[#E2E8F0]"}`}
                            data-testid={`intake-diagnosed-${String(o.v)}`}>
                            {o.l}
                        </button>
                    ))}
                </div>
            </Field>
            <Field label="ADHD presentation (best guess is fine)">
                <select className="mb-input" value={profile.adhd_subtype || ""} onChange={(e) => setProfile({ ...profile, adhd_subtype: e.target.value || null })} data-testid="intake-subtype">
                    <option value="">Select…</option>
                    {ADHD_SUBTYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </Field>
            <Field label="Currently on ADHD medication?">
                <div className="flex gap-2">
                    {[{ v: true, l: "Yes" }, { v: false, l: "No" }].map((o) => (
                        <button key={String(o.v)} type="button"
                            onClick={() => setProfile({ ...profile, on_medication: o.v })}
                            className={`mb-chip border-2 ${profile.on_medication === o.v ? "bg-[#4361EE] text-white border-[#4361EE]" : "bg-white text-[#0B132B] border-[#E2E8F0]"}`}
                            data-testid={`intake-meds-${String(o.v)}`}>
                            {o.l}
                        </button>
                    ))}
                </div>
            </Field>
        </div>
    );
}

function ChipMultiStep({ profile, setProfile, fields }) {
    return (
        <div className="space-y-6">
            {fields.map((f) => (
                <ChipMulti key={f.key} field={f.key} label={f.label} suggestions={f.suggestions} profile={profile} setProfile={setProfile} testId={f.testId} />
            ))}
        </div>
    );
}

function ChipMulti({ field, label, suggestions, profile, setProfile, testId }) {
    const [draft, setDraft] = useState("");
    const selected = profile[field] || [];
    const add = (raw) => {
        const v = raw.trim().toLowerCase();
        if (!v || selected.includes(v)) return;
        setProfile({ ...profile, [field]: [...selected, v].slice(0, 20) });
        setDraft("");
    };
    const remove = (v) => setProfile({ ...profile, [field]: selected.filter((x) => x !== v) });

    return (
        <Field label={label}>
            <div className="flex flex-wrap gap-1.5 mb-2" data-testid={`${testId}-selected`}>
                {selected.length === 0 && <span className="text-xs text-[#A0AEC0] font-bold">Pick from suggestions or type your own.</span>}
                {selected.map((v) => (
                    <span key={v} className="mb-chip bg-[#4361EE] text-white inline-flex items-center gap-1" data-testid={`${testId}-chip-${v.replaceAll(" ", "-")}`}>
                        {v}
                        <button type="button" onClick={() => remove(v)} className="hover:opacity-70" aria-label={`Remove ${v}`}>
                            <X size={12} />
                        </button>
                    </span>
                ))}
            </div>
            <div className="flex gap-2 mb-2">
                <input
                    className="mb-input flex-1"
                    placeholder="Add your own…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); } }}
                    data-testid={`${testId}-input`}
                />
                <button type="button" onClick={() => add(draft)} className="btn-pop-ghost text-sm flex items-center gap-1" data-testid={`${testId}-add`}>
                    <Plus size={14} /> Add
                </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {suggestions.filter((s) => !selected.includes(s)).slice(0, 12).map((s) => (
                    <button key={s} type="button" onClick={() => add(s)} className="mb-chip border-2 border-dashed border-[#E2E8F0] text-[#4A5568] hover:border-[#4361EE] hover:text-[#4361EE]" data-testid={`${testId}-suggest-${s.replaceAll(" ", "-")}`}>
                        + {s}
                    </button>
                ))}
            </div>
        </Field>
    );
}

function PeakStep({ profile, setProfile }) {
    const togglePeak = (v) => {
        const cur = profile.peak_hours || [];
        setProfile({ ...profile, peak_hours: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
    };
    return (
        <div className="space-y-6">
            <Field label="When is your child at their best for focused work?">
                <div className="flex flex-wrap gap-2" data-testid="intake-peak">
                    {PEAK_HOUR_OPTIONS.map((o) => (
                        <button key={o.value} type="button" onClick={() => togglePeak(o.value)}
                            className={`mb-chip border-2 ${(profile.peak_hours || []).includes(o.value) ? "bg-[#FFD166] text-[#876200] border-[#E5BC5C]" : "bg-white text-[#0B132B] border-[#E2E8F0]"}`}
                            data-testid={`intake-peak-${o.value}`}>
                            {o.label}
                        </button>
                    ))}
                </div>
            </Field>
            <ChipMulti field="motivators" label="What encouragement actually works?" suggestions={SUGGESTED_MOTIVATORS} profile={profile} setProfile={setProfile} testId="intake-motivators" />
            <Field label="Anything else worth knowing? (free notes)">
                <textarea
                    className="mb-input min-h-[100px]"
                    placeholder="Things that don't fit in the boxes above…"
                    value={profile.parent_notes || ""}
                    onChange={(e) => setProfile({ ...profile, parent_notes: e.target.value })}
                    data-testid="intake-parent-notes"
                />
            </Field>
        </div>
    );
}

function VanderbiltStep({ profile, setProfile }) {
    return (
        <div className="space-y-6">
            <p className="text-sm font-semibold text-[#4A5568]">
                Over the past 6 months, how often have you observed each of these in your child?
            </p>
            <VanderbiltGroup
                title="Inattention items"
                items={VANDERBILT_INATTENTION}
                values={profile.vanderbilt_inattention}
                onChange={(arr) => setProfile({ ...profile, vanderbilt_inattention: arr })}
                testId="intake-vand-in"
            />
            <VanderbiltGroup
                title="Hyperactivity / impulsivity items"
                items={VANDERBILT_HYPERACTIVITY}
                values={profile.vanderbilt_hyperactivity}
                onChange={(arr) => setProfile({ ...profile, vanderbilt_hyperactivity: arr })}
                testId="intake-vand-hy"
            />
        </div>
    );
}

function VanderbiltGroup({ title, items, values, onChange, testId }) {
    const set = (i, v) => {
        const arr = items.map((_, idx) => values[idx] ?? null);
        arr[i] = v;
        onChange(arr);
    };
    return (
        <div className="space-y-3" data-testid={testId}>
            <h3 className="font-display font-bold text-base text-[#0B132B]">{title}</h3>
            {items.map((label, i) => (
                <div key={i} className="rounded-2xl border-2 border-[#E2E8F0] p-3" data-testid={`${testId}-row-${i}`}>
                    <p className="text-sm text-[#0B132B] font-semibold mb-2">{label}</p>
                    <div className="flex flex-wrap gap-1.5">
                        {VANDERBILT_SCALE.map((o) => {
                            const sel = (values[i] ?? null) === o.value;
                            return (
                                <button key={o.value} type="button" onClick={() => set(i, o.value)}
                                    className={`mb-chip border-2 text-xs ${sel ? "bg-[#4361EE] text-white border-[#4361EE]" : "bg-white text-[#4A5568] border-[#E2E8F0]"}`}
                                    data-testid={`${testId}-${i}-${o.value}`}>
                                    {o.value} · {o.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

function ReviewStep({ profile, student }) {
    return (
        <div className="space-y-4">
            <p className="text-sm font-semibold text-[#4A5568]">
                Here's what we have for {student.name}. This goes straight into every AI-drafted mission.
            </p>
            <div className="rounded-2xl bg-[#F0F8FF] p-4 space-y-2 text-sm" data-testid="intake-review">
                <ReviewRow label="Grade" value={profile.grade} />
                <ReviewRow label="Reading level" value={profile.reading_level} />
                <ReviewRow label="ADHD subtype" value={profile.adhd_subtype} />
                <ReviewRow label="Interests" value={(profile.interests || []).join(", ")} />
                <ReviewRow label="Strengths" value={(profile.strengths || []).join(", ")} />
                <ReviewRow label="Sensitivities" value={(profile.sensitivities || []).join(", ")} />
                <ReviewRow label="Triggers" value={(profile.common_triggers || []).join(", ")} />
                <ReviewRow label="Peak hours" value={(profile.peak_hours || []).join(", ")} />
                <ReviewRow label="Motivators" value={(profile.motivators || []).join(", ")} />
                {profile.interview_summary && (
                    <div className="pt-2 border-t-2 border-white">
                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#876200]">Coach summary</p>
                        <p className="text-sm text-[#0B132B] font-semibold mt-0.5">{profile.interview_summary}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function ReviewRow({ label, value }) {
    return (
        <div className="flex gap-3">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#A0AEC0] w-28 shrink-0 mt-0.5">{label}</span>
            <span className="text-sm font-semibold text-[#0B132B]">{value || <em className="text-[#A0AEC0]">not yet</em>}</span>
        </div>
    );
}

function Field({ label, children }) {
    return (
        <div>
            <label className="block text-sm font-bold text-[#0B132B] mb-2">{label}</label>
            {children}
        </div>
    );
}

// ---------- AI Interview modal ----------
function InterviewModal({ studentId, studentName, onClose, onFinished }) {
    const [session, setSession] = useState(null);
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [finishing, setFinishing] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.post(`/students/${studentId}/interview`);
                setSession(data);
            } catch (err) {
                toast.error(formatApiErrorDetail(err));
                onClose();
            }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentId]);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [session]);

    const sendReply = async () => {
        if (!draft.trim() || busy) return;
        setBusy(true);
        try {
            const { data } = await api.post(`/interviews/${session.id}/reply`, { content: draft.trim() });
            setSession(data);
            setDraft("");
        } catch (err) {
            toast.error(formatApiErrorDetail(err));
        } finally {
            setBusy(false);
        }
    };

    const finish = async () => {
        if (!session) return;
        setFinishing(true);
        try {
            await api.post(`/interviews/${session.id}/finish`);
            onFinished();
        } catch (err) {
            toast.error(formatApiErrorDetail(err));
            setFinishing(false);
        }
    };

    const wrapped = useMemo(() => {
        if (!session) return false;
        const last = session.messages[session.messages.length - 1];
        return last && last.role === "assistant" && last.content.includes("<<<WRAP_UP>>>");
    }, [session]);

    const visibleMessages = useMemo(() => {
        if (!session) return [];
        return session.messages.map((m) => ({
            ...m,
            content: m.content.replaceAll("<<<WRAP_UP>>>", "").trim(),
        }));
    }, [session]);

    return (
        <div className="fixed inset-0 z-40 bg-[#0B132B]/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" data-testid="interview-modal" onClick={onClose}>
            <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <header className="flex items-center justify-between p-5 border-b-2 border-[#E2E8F0]">
                    <div className="flex items-center gap-2">
                        <div className="h-9 w-9 rounded-2xl bg-[#FFD166] flex items-center justify-center text-[#876200]">
                            <MessageCircle size={18} />
                        </div>
                        <div>
                            <p className="font-display font-extrabold text-lg text-[#0B132B]">Chat with the coach</p>
                            <p className="text-xs font-bold text-[#4A5568]">Quick 5-minute interview about {studentName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="btn-pop-ghost text-sm" data-testid="interview-close">
                        <X size={16} />
                    </button>
                </header>
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3" data-testid="interview-transcript">
                    {!session && <p className="text-center text-[#4A5568] font-bold py-10">Loading the coach…</p>}
                    {visibleMessages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === "parent" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm font-semibold ${m.role === "parent" ? "bg-[#4361EE] text-white" : "bg-[#F0F8FF] text-[#0B132B]"}`}
                                data-testid={`interview-msg-${m.role}-${i}`}>
                                {m.content}
                            </div>
                        </div>
                    ))}
                    {busy && (
                        <div className="flex justify-start">
                            <div className="bg-[#F0F8FF] rounded-2xl px-4 py-2.5 text-sm font-semibold text-[#4A5568] flex items-center gap-2">
                                <Loader2 size={14} className="animate-spin" /> Coach is typing…
                            </div>
                        </div>
                    )}
                </div>
                <footer className="border-t-2 border-[#E2E8F0] p-4 space-y-2">
                    {wrapped ? (
                        <div className="text-center space-y-2" data-testid="interview-wrapped">
                            <p className="text-sm font-bold text-[#057a5b] flex items-center justify-center gap-1.5">
                                <Sparkles size={14} /> Coach has enough to build a great profile.
                            </p>
                            <button onClick={finish} disabled={finishing} className="btn-pop-primary text-sm w-full flex items-center justify-center gap-2" data-testid="interview-save-summary">
                                {finishing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save coach summary to profile
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <textarea
                                className="mb-input flex-1 min-h-[44px] max-h-32"
                                placeholder="Type your reply…"
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                                disabled={!session || busy}
                                data-testid="interview-input"
                            />
                            <button onClick={sendReply} disabled={!draft.trim() || busy} className="btn-pop-primary text-sm flex items-center gap-1.5 self-end" data-testid="interview-send">
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            </button>
                        </div>
                    )}
                    <p className="text-[10px] text-[#A0AEC0] font-semibold text-center">
                        Press Enter to send. The coach will wrap up after ~6 exchanges.
                    </p>
                </footer>
            </div>
        </div>
    );
}

// ---------- Helpers ----------
function computeCompletion(p) {
    const done = {
        basics: !!(p.grade && p.reading_level),
        adhd: p.diagnosed !== null && p.adhd_subtype,
        interests: (p.interests || []).length >= 1 && (p.strengths || []).length >= 1,
        sensitivities: (p.sensitivities || []).length + (p.common_triggers || []).length >= 1,
        peak: (p.peak_hours || []).length >= 1 && (p.motivators || []).length >= 1,
        vanderbilt: (p.vanderbilt_inattention || []).filter((v) => v !== null && v !== undefined).length === 9
            && (p.vanderbilt_hyperactivity || []).filter((v) => v !== null && v !== undefined).length === 9,
    };
    const total = Object.keys(done).length;
    const completed = Object.values(done).filter(Boolean).length;
    return { done, percent: Math.round((completed / total) * 100) };
}
