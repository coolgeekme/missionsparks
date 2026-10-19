import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import AudioRecorder from "../components/AudioRecorder";
import { api, formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { ArrowLeft, ThumbsUp, ThumbsDown, Sparkles, Mic } from "lucide-react";

const LS_KEY_PREFIX = "missionsparks:lastCaptureStudent:";

export default function QuickCapture() {
    const { user } = useAuth();
    const [students, setStudents] = useState([]);
    const [selected, setSelected] = useState(null);
    const [busy, setBusy] = useState(null); // "positive" | "negative" | "voice" | null
    const [lastLogged, setLastLogged] = useState(null); // {name, at}
    const [err, setErr] = useState("");
    const [voiceOpen, setVoiceOpen] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/students");
                setStudents(data);
                if (!data.length) return;
                const lsKey = LS_KEY_PREFIX + user.id;
                let pick = null;
                try {
                    const saved = localStorage.getItem(lsKey);
                    if (saved) pick = data.find((s) => s.id === saved) || null;
                } catch { /* storage unavailable */ }
                setSelected(pick || data[0]);
            } catch (e) {
                setErr(formatApiErrorDetail(e.response?.data?.detail) || e.message);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const pickStudent = (s) => {
        setSelected(s);
        try { localStorage.setItem(LS_KEY_PREFIX + user.id, s.id); } catch { /* ignore */ }
    };

    const capture = async (valence) => {
        if (!selected || busy) return;
        setBusy(valence);
        setErr("");
        try {
            await api.post("/moments", { student_id: selected.id, valence });
            setLastLogged({ name: selected.name, at: new Date() });
        } catch (e) {
            setErr(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally {
            setBusy(null);
        }
    };

    const handleParsed = async ({ transcript, audio_data, audio_mime, parsed }) => {
        if (!selected) return;
        setBusy("voice");
        setErr("");
        try {
            await api.post("/moments", {
                student_id: selected.id,
                moment_type: parsed.moment_type || "regulated",
                intensity: parsed.intensity || 3,
                triggers: parsed.triggers || [],
                context_note: parsed.context_note || "",
                antecedent: parsed.antecedent || "",
                response: parsed.response || "",
                outcome: parsed.outcome || "",
                notes: parsed.notes || "",
                audio_data: audio_data || null,
                audio_mime: audio_mime || null,
                transcript: transcript || null,
            });
            setLastLogged({ name: selected.name, at: new Date() });
            setVoiceOpen(false);
        } catch (e) {
            setErr(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="min-h-screen" data-testid="quick-capture-page">
            <Navbar />
            <main className="max-w-md mx-auto p-4 sm:p-6 space-y-5">
                <Link to="/parent" className="inline-flex items-center gap-2 text-sm font-bold text-[#E4572E]" data-testid="quick-capture-back">
                    <ArrowLeft size={16} /> Dashboard
                </Link>

                <header className="text-center">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286]">Quick log</p>
                    <h1 className="font-display font-extrabold text-3xl text-[#201D18] mt-1">How did it go?</h1>
                    <p className="text-[#6E675B] font-semibold mt-1">One tap — or speak it — and it's logged for the day.</p>
                </header>

                {students.length === 0 ? (
                    <div className="mb-card p-6 text-center" data-testid="quick-capture-empty">
                        <p className="font-display font-bold text-lg text-[#201D18]">No kids linked yet</p>
                        <p className="text-[#6E675B] font-semibold mt-1">Link a student from your dashboard first.</p>
                        <Link to="/parent" className="btn-pop-primary inline-flex mt-4">Go to dashboard</Link>
                    </div>
                ) : (
                    <>
                        {/* Kid switcher */}
                        <div className="flex flex-wrap justify-center gap-2" data-testid="quick-capture-student-chips">
                            {students.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => pickStudent(s)}
                                    className={`mb-chip border-2 ${selected?.id === s.id ? "bg-[#E4572E] text-white border-[#E4572E]" : "bg-white border-[#E8E0D2]"}`}
                                    data-testid={`quick-capture-student-${s.id}`}
                                >
                                    🚀 {s.name}
                                </button>
                            ))}
                        </div>

                        {/* The two buttons */}
                        <div className="grid grid-cols-2 gap-4" data-testid="quick-capture-buttons">
                            <button
                                onClick={() => capture("positive")}
                                disabled={!!busy}
                                className="rounded-3xl border-2 border-[#3F8C5E] bg-[#3F8C5E] text-white p-6 sm:p-8 flex flex-col items-center gap-3 shadow-[0_8px_0_0_#2F6B47] hover:-translate-y-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-60"
                                data-testid="quick-capture-positive"
                            >
                                <ThumbsUp size={48} fill="currentColor" />
                                <span className="font-display font-extrabold text-xl">Positive</span>
                                <span className="text-xs font-bold text-white/80">Good moment</span>
                            </button>
                            <button
                                onClick={() => capture("negative")}
                                disabled={!!busy}
                                className="rounded-3xl border-2 border-[#BC4B32] bg-[#BC4B32] text-white p-6 sm:p-8 flex flex-col items-center gap-3 shadow-[0_8px_0_0_#9A3C28] hover:-translate-y-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-60"
                                data-testid="quick-capture-negative"
                            >
                                <ThumbsDown size={48} fill="currentColor" />
                                <span className="font-display font-extrabold text-xl">Negative</span>
                                <span className="text-xs font-bold text-white/80">Hard moment</span>
                            </button>
                        </div>

                        {/* Speak it */}
                        <button
                            onClick={() => setVoiceOpen((v) => !v)}
                            disabled={!!busy}
                            className="btn-pop-secondary w-full flex items-center justify-center gap-2 disabled:opacity-60"
                            data-testid="quick-capture-speak"
                        >
                            <Mic size={16} /> {voiceOpen ? "Cancel voice" : "Speak it instead"}
                        </button>

                        {voiceOpen && (
                            <div className="mb-card p-5" data-testid="quick-capture-voice">
                                <p className="font-display font-bold text-lg text-[#201D18] mb-1">Describe it for {selected?.name}</p>
                                <p className="text-xs font-bold text-[#9A9286] mb-3">
                                    Try: "Enzo got frustrated with math homework, so we took a body break."
                                </p>
                                <AudioRecorder onParsed={handleParsed} />
                            </div>
                        )}

                        {err && (
                            <p className="text-sm font-bold text-[#BC4B32] bg-[#BC4B32]/10 rounded-xl px-3 py-2 text-center" data-testid="quick-capture-error">
                                {err}
                            </p>
                        )}
                        {lastLogged && !err && (
                            <div className="rounded-xl bg-[#3F8C5E]/10 border-2 border-[#3F8C5E] px-3 py-2 text-center" data-testid="quick-capture-confirmation">
                                <p className="text-sm font-bold text-[#2F6B47]">✓ Logged for {lastLogged.name} · {lastLogged.at.toLocaleTimeString()}</p>
                                <Link to={`/parent/moments?student=${selected?.id}`} className="text-xs font-bold text-[#E4572E] underline inline-flex items-center gap-1 mt-1" data-testid="quick-capture-add-details">
                                    Add details / edit →
                                </Link>
                            </div>
                        )}

                        {/* PWA hint */}
                        <div className="text-center text-xs font-semibold text-[#9A9286]" data-testid="quick-capture-pwa-hint">
                            <Sparkles size={12} className="inline mr-1" />
                            On your phone?{" "}
                            <Link to="/add-to-home-screen" className="text-[#E4572E] underline font-bold" data-testid="quick-capture-home-screen-link">
                                Add it to your home screen
                            </Link>{" "}
                            for one-tap access.
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
