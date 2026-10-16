import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { Lock, ArrowRight, Loader2, Sparkles, Flame, Target } from "lucide-react";
import SparkMark from "../components/SparkMark";

// Mirror of backend AVATAR_COLOR_PALETTE → tailwind gradients.
const COLOR_GRADIENTS = {
    indigo: "from-[#E4572E] to-[#3F8C5E]",
    emerald: "from-[#3F8C5E] to-[#4C9A6B]",
    pink: "from-[#BC4B32] to-[#E8A33D]",
    amber: "from-[#E8A33D] to-[#BC4B32]",
    violet: "from-[#7A5C8E] to-[#E4572E]",
    teal: "from-[#4C9A6B] to-[#3F8C5E]",
    rose: "from-[#D08A76] to-[#D08A76]",
    sky: "from-[#6EA886] to-[#E4572E]",
};
const SPARK_KIND_META = {
    fun_fact: { label: "Fun fact", icon: Sparkles, color: "#E8A33D" },
    riddle: { label: "Riddle", icon: Sparkles, color: "#7A5C8E" },
    affirmation: { label: "For you", icon: Sparkles, color: "#3F8C5E" },
    science_nugget: { label: "Did you know?", icon: Sparkles, color: "#4C9A6B" },
};

export default function HomePage() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const { refresh } = useAuth();
    const [data, setData] = useState(null);
    const [spark, setSpark] = useState(null);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(true);
    const [active, setActive] = useState(null);
    const [pin, setPin] = useState("");
    const [busy, setBusy] = useState(false);
    const [pinErr, setPinErr] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get(`/home/${slug}`);
                setData(data);
                // Spark is best-effort — don't block the page if AI is slow/down
                api.get(`/home/${slug}/spark`).then(({ data: s }) => setSpark(s)).catch(() => {});
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
            await refresh();
            navigate("/student");
        } catch (e) {
            setPinErr(formatApiErrorDetail(e.response?.data?.detail) || e.message);
            setPin("");
        } finally { setBusy(false); }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" data-testid="home-loading">
                <Loader2 className="animate-spin text-[#E4572E]" size={32} />
            </div>
        );
    }

    if (err) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="mb-card p-8 max-w-md text-center" data-testid="home-error">
                    <h1 className="font-display font-extrabold text-3xl text-[#201D18]">Home page unavailable</h1>
                    <p className="text-[#6E675B] font-semibold mt-2">{err}</p>
                </div>
            </div>
        );
    }

    const totalOpen = (data.kids || []).reduce((acc, k) => acc + (k.open_missions_today || 0), 0);
    const sparkMeta = spark ? (SPARK_KIND_META[spark.kind] || SPARK_KIND_META.fun_fact) : null;

    return (
        <div className="min-h-screen flex items-start sm:items-center justify-center p-6 py-10" data-testid="home-page">
            <div className="max-w-2xl w-full">
                <header className="text-center mb-6">
                    <div className="inline-flex items-center gap-2.5 mb-3">
                        <SparkMark size={34} />
                        <span className="font-display font-extrabold text-3xl text-[#201D18]">Mission<span className="text-[#E4572E]">Sparks</span></span>
                    </div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286]">{data.family_name}</p>
                    <h1 className="font-display font-extrabold text-4xl text-[#201D18] mt-2">Who&apos;s here? 👋</h1>
                    <p className="text-[#6E675B] font-semibold mt-1">
                        {totalOpen > 0
                            ? <>You&apos;ve got <span className="text-[#E4572E]">{totalOpen}</span> mission{totalOpen === 1 ? "" : "s"} to crush today.</>
                            : "All caught up today — high five! ✋"}
                    </p>
                </header>

                {spark && sparkMeta && (
                    <div
                        className="mb-6 mb-card p-4 sm:p-5 flex items-start gap-3"
                        style={{ background: `linear-gradient(135deg, ${sparkMeta.color}14 0%, transparent 70%)` }}
                        data-testid="home-spark-banner"
                    >
                        <div
                            className="h-10 w-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                            style={{ background: `${sparkMeta.color}22`, color: sparkMeta.color }}
                        >
                            <sparkMeta.icon size={20} />
                        </div>
                        <div className="min-w-0 text-left">
                            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: sparkMeta.color }} data-testid="home-spark-kind">
                                {sparkMeta.label}
                            </p>
                            <p className="font-display font-bold text-[#201D18] text-base sm:text-lg leading-snug mt-0.5" data-testid="home-spark-content">
                                {spark.content}
                            </p>
                        </div>
                    </div>
                )}

                {data.kids.length === 0 ? (
                    <div className="mb-card p-8 text-center" data-testid="home-no-kids">
                        <p className="font-display font-bold text-xl text-[#201D18]">No kids set up yet</p>
                        <p className="text-[#6E675B] font-semibold mt-1">Ask a grown-up to add you in Family Settings.</p>
                    </div>
                ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="home-kid-grid">
                        {data.kids.map((kid) => {
                            const gradient = COLOR_GRADIENTS[kid.avatar_color] || COLOR_GRADIENTS.indigo;
                            const initial = kid.name?.[0]?.toUpperCase() || "?";
                            return (
                                <button
                                    key={kid.id}
                                    onClick={() => startPin(kid)}
                                    disabled={!kid.has_pin}
                                    className="mb-card mb-card-hover p-6 text-center transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                    data-testid={`home-kid-${kid.id}`}
                                >
                                    <div className={`h-20 w-20 rounded-3xl mx-auto bg-gradient-to-br ${gradient} text-white flex items-center justify-center text-4xl font-extrabold shadow-lg`}>
                                        {kid.avatar_emoji || initial}
                                    </div>
                                    <p className="font-display font-extrabold text-2xl text-[#201D18] mt-3" data-testid={`home-kid-name-${kid.id}`}>{kid.name}</p>

                                    <div className="flex items-center justify-center gap-1.5 mt-2 flex-wrap">
                                        {kid.streak_current > 0 && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-[#E8A33D]/15 text-[#8A6413] px-2 py-0.5 text-[11px] font-bold" data-testid={`home-kid-streak-${kid.id}`}>
                                                <Flame size={11} /> {kid.streak_current}
                                            </span>
                                        )}
                                        {kid.open_missions_today > 0 && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-[#E4572E]/10 text-[#E4572E] px-2 py-0.5 text-[11px] font-bold" data-testid={`home-kid-open-${kid.id}`}>
                                                <Target size={11} /> {kid.open_missions_today}
                                            </span>
                                        )}
                                        {kid.missions_today_count > 0 && kid.open_missions_today === 0 && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-[#3F8C5E]/15 text-[#2F6B47] px-2 py-0.5 text-[11px] font-bold" data-testid={`home-kid-done-${kid.id}`}>
                                                ✓ Done today
                                            </span>
                                        )}
                                    </div>

                                    {kid.interest_tag && (
                                        <p className="text-[11px] font-bold text-[#9A9286] mt-2 truncate" data-testid={`home-kid-interest-${kid.id}`}>
                                            loves {kid.interest_tag}
                                        </p>
                                    )}

                                    {!kid.has_pin ? (
                                        <p className="text-xs font-bold text-[#BC4B32] mt-2">No PIN set — ask a grown-up</p>
                                    ) : (
                                        <p className="text-xs font-bold text-[#E4572E] mt-2 inline-flex items-center gap-1">
                                            <Lock size={11} /> Enter PIN <ArrowRight size={11} />
                                        </p>
                                    )}
                                </button>
                            );
                        })}
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
                            className="bg-white rounded-3xl border-2 border-[#E8E0D2] p-8 max-w-sm w-full text-center"
                        >
                            <div className={`h-16 w-16 rounded-3xl mx-auto bg-gradient-to-br ${COLOR_GRADIENTS[active.avatar_color] || COLOR_GRADIENTS.indigo} text-white flex items-center justify-center text-3xl font-extrabold`}>
                                {active.avatar_emoji || active.name?.[0]?.toUpperCase()}
                            </div>
                            <h2 className="font-display font-extrabold text-2xl text-[#201D18] mt-3">Hi, {active.name}!</h2>
                            <p className="text-sm font-semibold text-[#6E675B] mt-1">Type your 4-digit PIN.</p>
                            <input
                                type="password"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                autoFocus
                                value={pin}
                                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                                className="mt-5 w-full rounded-2xl border-2 border-[#E8E0D2] px-4 py-4 font-mono text-center text-3xl tracking-[1em] focus:border-[#E4572E] outline-none"
                                placeholder="••••"
                                data-testid="home-pin-input"
                                maxLength={4}
                            />
                            {pinErr && <p className="text-sm font-bold text-[#BC4B32] mt-3" data-testid="home-pin-error">{pinErr}</p>}
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
