import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { Zap, Lock, ArrowRight, Loader2 } from "lucide-react";

export default function HomePage() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(true);
    const [active, setActive] = useState(null); // kid currently entering PIN
    const [pin, setPin] = useState("");
    const [busy, setBusy] = useState(false);
    const [pinErr, setPinErr] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get(`/home/${slug}`);
                setData(data);
            } catch (e) {
                setErr(formatApiErrorDetail(e.response?.data?.detail) || "Home page not available.");
            } finally { setLoading(false); }
        })();
    }, [slug]);

    const startPin = (kid) => {
        setActive(kid);
        setPin("");
        setPinErr("");
    };

    const submitPin = async (e) => {
        e?.preventDefault?.();
        if (pin.length !== 4) { setPinErr("PIN must be 4 digits."); return; }
        setBusy(true); setPinErr("");
        try {
            await api.post(`/home/${slug}/login`, { student_id: active.id, pin });
            toast.success(`Hi ${active.name}! 🚀`);
            navigate("/student");
        } catch (e) {
            setPinErr(formatApiErrorDetail(e.response?.data?.detail) || e.message);
            setPin("");
        } finally { setBusy(false); }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" data-testid="home-loading">
                <Loader2 className="animate-spin text-[#4361EE]" size={32} />
            </div>
        );
    }

    if (err) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="mb-card p-8 max-w-md text-center" data-testid="home-error">
                    <h1 className="font-display font-extrabold text-3xl text-[#0B132B]">Home page unavailable</h1>
                    <p className="text-[#4A5568] font-semibold mt-2">{err}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-6" data-testid="home-page">
            <div className="max-w-2xl w-full">
                <header className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 mb-3">
                        <div className="h-12 w-12 rounded-2xl bg-[#4361EE] flex items-center justify-center text-white shadow-[0_4px_0_0_#3A53CC]">
                            <Zap size={22} fill="currentColor" />
                        </div>
                        <span className="font-display font-extrabold text-3xl text-[#0B132B]">MissionSparks</span>
                    </div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">{data.family_name}</p>
                    <h1 className="font-display font-extrabold text-4xl text-[#0B132B] mt-2">Who&apos;s here? 👋</h1>
                    <p className="text-[#4A5568] font-semibold mt-1">Tap your name to start your missions.</p>
                </header>

                {data.kids.length === 0 ? (
                    <div className="mb-card p-8 text-center" data-testid="home-no-kids">
                        <p className="font-display font-bold text-xl text-[#0B132B]">No kids set up yet</p>
                        <p className="text-[#4A5568] font-semibold mt-1">Ask a grown-up to add you in Family Settings.</p>
                    </div>
                ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="home-kid-grid">
                        {data.kids.map((kid) => (
                            <button
                                key={kid.id}
                                onClick={() => startPin(kid)}
                                disabled={!kid.has_pin}
                                className="mb-card mb-card-hover p-6 text-center transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                data-testid={`home-kid-${kid.id}`}
                            >
                                <div className="h-20 w-20 rounded-3xl mx-auto bg-gradient-to-br from-[#4361EE] to-[#06D6A0] text-white flex items-center justify-center text-4xl font-extrabold shadow-lg">
                                    {kid.name?.[0]?.toUpperCase() || "?"}
                                </div>
                                <p className="font-display font-extrabold text-2xl text-[#0B132B] mt-3">{kid.name}</p>
                                {kid.grade && <p className="text-xs font-bold text-[#A0AEC0] uppercase tracking-widest mt-1">Grade {kid.grade}</p>}
                                {!kid.has_pin && (
                                    <p className="text-xs font-bold text-[#EF476F] mt-2">No PIN set — ask a grown-up</p>
                                )}
                                {kid.has_pin && (
                                    <p className="text-xs font-bold text-[#4361EE] mt-2 inline-flex items-center gap-1">
                                        <Lock size={11} /> Enter PIN <ArrowRight size={11} />
                                    </p>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {active && (
                    <div
                        className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
                        onClick={() => !busy && setActive(null)}
                        data-testid="home-pin-modal"
                    >
                        <form
                            onSubmit={submitPin}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-3xl border-2 border-[#E2E8F0] p-8 max-w-sm w-full text-center"
                        >
                            <div className="h-16 w-16 rounded-3xl mx-auto bg-gradient-to-br from-[#4361EE] to-[#06D6A0] text-white flex items-center justify-center text-3xl font-extrabold">
                                {active.name?.[0]?.toUpperCase()}
                            </div>
                            <h2 className="font-display font-extrabold text-2xl text-[#0B132B] mt-3">Hi, {active.name}!</h2>
                            <p className="text-sm font-semibold text-[#4A5568] mt-1">Type your 4-digit PIN.</p>
                            <input
                                type="password"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                autoFocus
                                value={pin}
                                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                                className="mt-5 w-full rounded-2xl border-2 border-[#E2E8F0] px-4 py-4 font-mono text-center text-3xl tracking-[1em] focus:border-[#4361EE] outline-none"
                                placeholder="••••"
                                data-testid="home-pin-input"
                                maxLength={4}
                            />
                            {pinErr && <p className="text-sm font-bold text-[#EF476F] mt-3" data-testid="home-pin-error">{pinErr}</p>}
                            <div className="flex gap-2 mt-4">
                                <button
                                    type="submit"
                                    disabled={busy || pin.length !== 4}
                                    className="btn-pop-primary flex-1 disabled:opacity-50"
                                    data-testid="home-pin-submit"
                                >{busy ? "Checking…" : "Let me in"}</button>
                                <button
                                    type="button"
                                    onClick={() => setActive(null)}
                                    disabled={busy}
                                    className="btn-pop-ghost"
                                    data-testid="home-pin-cancel"
                                >Cancel</button>
                            </div>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
}
