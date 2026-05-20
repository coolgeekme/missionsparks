import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiErrorDetail } from "../lib/api";
import { ArrowLeft, Heart } from "lucide-react";

export default function StudentCheckIn() {
    const navigate = useNavigate();
    const [catalog, setCatalog] = useState({ moment_types: [], triggers: [] });
    const [step, setStep] = useState(1);
    const [type, setType] = useState("");
    const [intensity, setIntensity] = useState(3);
    const [triggers, setTriggers] = useState([]);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [done, setDone] = useState(false);

    useEffect(() => {
        (async () => {
            const { data } = await api.get("/moments/catalog");
            setCatalog(data);
        })();
    }, []);

    const toggleTrigger = (k) => {
        const cur = new Set(triggers);
        if (cur.has(k)) cur.delete(k); else cur.add(k);
        setTriggers(Array.from(cur));
    };

    const submit = async () => {
        setBusy(true);
        setErr("");
        try {
            await api.post("/moments", {
                student_id: undefined,
                moment_type: type,
                intensity,
                triggers,
                notes: note,
            });
            setDone(true);
        } catch (e) {
            setErr(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally {
            setBusy(false);
        }
    };

    if (done) {
        return (
            <div className="min-h-screen" data-testid="checkin-done">
                <Navbar />
                <main className="max-w-xl mx-auto p-6 md:p-10 text-center">
                    <div className="text-7xl">💛</div>
                    <h1 className="font-display font-extrabold text-4xl text-[#0B132B] mt-3">Thanks for checking in</h1>
                    <p className="text-[#4A5568] font-semibold mt-2">Knowing how you feel right now is a superpower. Your parent will see this in your moments.</p>
                    <button onClick={() => navigate("/student")} className="btn-pop-primary mt-6" data-testid="checkin-back">
                        Back to missions
                    </button>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen" data-testid="checkin-page">
            <Navbar />
            <main className="max-w-xl mx-auto p-6 md:p-10 space-y-6">
                <Link to="/student" className="inline-flex items-center gap-2 text-sm font-bold text-[#4361EE]" data-testid="checkin-back-link">
                    <ArrowLeft size={16} /> Back to missions
                </Link>
                <header className="flex items-center gap-3">
                    <div className="h-14 w-14 rounded-2xl bg-[#EF476F]/15 flex items-center justify-center text-[#EF476F]">
                        <Heart size={28} />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">Quick check-in</p>
                        <h1 className="font-display font-extrabold text-3xl text-[#0B132B]">How are you right now?</h1>
                    </div>
                </header>

                {/* Step 1: pick moment */}
                {step === 1 && (
                    <section className="mb-card p-6" data-testid="checkin-step-1">
                        <p className="text-sm font-semibold text-[#4A5568] mb-4">Pick the one that fits best.</p>
                        <div className="grid grid-cols-2 gap-3" data-testid="checkin-types">
                            {catalog.moment_types.map((t) => (
                                <button
                                    key={t.key}
                                    onClick={() => { setType(t.key); setStep(2); }}
                                    className={`rounded-2xl border-2 p-4 text-left transition-all hover:-translate-y-1 ${
                                        t.category === "challenging" ? "border-[#EF476F]/30 hover:border-[#EF476F] bg-white" :
                                        t.category === "positive" ? "border-[#06D6A0]/30 hover:border-[#06D6A0] bg-white" :
                                        "border-[#E2E8F0] hover:border-[#4361EE] bg-white"
                                    }`}
                                    data-testid={`checkin-type-${t.key}`}
                                >
                                    <div className="text-3xl">{t.emoji}</div>
                                    <div className="font-display font-bold text-[#0B132B] mt-1">{t.label}</div>
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {/* Step 2: intensity + triggers */}
                {step === 2 && (
                    <section className="mb-card p-6 space-y-5" data-testid="checkin-step-2">
                        <div>
                            <p className="text-sm font-bold text-[#0B132B] mb-2">How strong is it? (1 = a tiny bit, 5 = a lot)</p>
                            <input type="range" min="1" max="5" value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="w-full" data-testid="checkin-intensity" />
                            <p className="text-center font-display font-extrabold text-4xl text-[#EF476F] mt-1" data-testid="checkin-intensity-display">{intensity}</p>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-[#0B132B] mb-2">What set it off? (tap any that fit)</p>
                            <div className="flex flex-wrap gap-2" data-testid="checkin-triggers">
                                {catalog.triggers.map((t) => {
                                    const sel = triggers.includes(t.key);
                                    return (
                                        <button
                                            key={t.key} type="button"
                                            onClick={() => toggleTrigger(t.key)}
                                            className={`mb-chip border-2 ${sel ? "bg-[#4361EE] text-white border-[#4361EE]" : "bg-white border-[#E2E8F0] hover:border-[#4361EE]"}`}
                                            data-testid={`checkin-trigger-${t.key}`}
                                        >
                                            {t.emoji} {t.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-[#0B132B] mb-2">Want to say more? (optional)</p>
                            <textarea
                                rows={2}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                className="mb-input pt-3 h-auto"
                                placeholder="Anything else…"
                                data-testid="checkin-note"
                            />
                        </div>

                        {err && <p className="text-sm font-bold text-[#EF476F] bg-[#EF476F]/10 rounded-xl px-3 py-2" data-testid="checkin-error">{err}</p>}

                        <div className="flex gap-3">
                            <button onClick={() => setStep(1)} className="btn-pop-ghost flex-1" data-testid="checkin-back-step">Back</button>
                            <button onClick={submit} disabled={busy} className="btn-pop-primary flex-1" data-testid="checkin-submit">
                                {busy ? "Saving…" : "Save check-in"}
                            </button>
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}
