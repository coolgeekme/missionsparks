import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { ArrowLeft, ThumbsUp, ThumbsDown, Sparkles } from "lucide-react";

const LS_KEY_PREFIX = "missionsparks:lastCaptureStudent:";

export default function QuickCapture() {
    const { user } = useAuth();
    const [students, setStudents] = useState([]);
    const [selected, setSelected] = useState(null);
    const [busy, setBusy] = useState(null); // "positive" | "negative" | null
    const [lastLogged, setLastLogged] = useState(null); // {valence, name, at}
    const [err, setErr] = useState("");

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
            setLastLogged({ valence, name: selected.name, at: new Date() });
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
                <Link to="/parent" className="inline-flex items-center gap-2 text-sm font-bold text-[#4361EE]" data-testid="quick-capture-back">
                    <ArrowLeft size={16} /> Dashboard
                </Link>

                <header className="text-center">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">Quick log</p>
                    <h1 className="font-display font-extrabold text-3xl text-[#0B132B] mt-1">How did it go?</h1>
                    <p className="text-[#4A5568] font-semibold mt-1">One tap. It's logged for the day.</p>
                </header>

                {students.length === 0 ? (
                    <div className="mb-card p-6 text-center" data-testid="quick-capture-empty">
                        <p className="font-display font-bold text-lg text-[#0B132B]">No kids linked yet</p>
                        <p className="text-[#4A5568] font-semibold mt-1">Link a student from your dashboard first.</p>
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
                                    className={`mb-chip border-2 ${selected?.id === s.id ? "bg-[#4361EE] text-white border-[#4361EE]" : "bg-white border-[#E2E8F0]"}`}
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
                                className="rounded-3xl border-2 border-[#06D6A0] bg-[#06D6A0] text-white p-6 sm:p-8 flex flex-col items-center gap-3 shadow-[0_8px_0_0_#04A57A] hover:-translate-y-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-60"
                                data-testid="quick-capture-positive"
                            >
                                <ThumbsUp size={48} fill="currentColor" />
                                <span className="font-display font-extrabold text-xl">Positive</span>
                                <span className="text-xs font-bold text-white/80">Good moment</span>
                            </button>
                            <button
                                onClick={() => capture("negative")}
                                disabled={!!busy}
                                className="rounded-3xl border-2 border-[#EF476F] bg-[#EF476F] text-white p-6 sm:p-8 flex flex-col items-center gap-3 shadow-[0_8px_0_0_#C8385A] hover:-translate-y-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-60"
                                data-testid="quick-capture-negative"
                            >
                                <ThumbsDown size={48} fill="currentColor" />
                                <span className="font-display font-extrabold text-xl">Negative</span>
                                <span className="text-xs font-bold text-white/80">Hard moment</span>
                            </button>
                        </div>

                        {err && (
                            <p className="text-sm font-bold text-[#EF476F] bg-[#EF476F]/10 rounded-xl px-3 py-2 text-center" data-testid="quick-capture-error">
                                {err}
                            </p>
                        )}
                        {lastLogged && !err && (
                            <p className="text-sm font-bold text-[#06D6A0] bg-[#06D6A0]/10 rounded-xl px-3 py-2 text-center" data-testid="quick-capture-confirmation">
                                ✓ Logged for {lastLogged.name} · {lastLogged.at.toLocaleTimeString()}
                            </p>
                        )}

                        {/* PWA hint */}
                        <div className="text-center text-xs font-semibold text-[#A0AEC0]" data-testid="quick-capture-pwa-hint">
                            <Sparkles size={12} className="inline mr-1" />
                            On your phone, use "Add to Home Screen" for one-tap access.
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
