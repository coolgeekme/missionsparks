import { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { Snowflake, Plus, Trash2, Loader2, Info } from "lucide-react";

// Date helpers — local calendar days. The backend now buckets streaks in the
// household's zone, so the UI must speak the same calendar or the two disagree
// every evening.
function todayLocalIso() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function yesterdayLocalIso() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default function StreakFreezeManager({ studentId, studentName, onChanged }) {
    const [state, setState] = useState({ freezes: [], remaining_this_month: 0, monthly_cap: 4, granted_this_month: 0 });
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [pickDate, setPickDate] = useState(yesterdayLocalIso());
    const [pickReason, setPickReason] = useState("");
    const [showForm, setShowForm] = useState(false);

    const refresh = async () => {
        setLoading(true);
        try {
            const { data } = await api.get(`/students/${studentId}/freezes`);
            setState(data);
        } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally { setLoading(false); }
    };

    useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [studentId]);

    const grant = async (e) => {
        e?.preventDefault?.();
        if (!pickDate) return;
        setAdding(true);
        try {
            await api.post(`/students/${studentId}/freezes`, { date: pickDate, reason: pickReason || undefined });
            toast.success("Freeze granted ❄️");
            setShowForm(false);
            setPickReason("");
            await refresh();
            onChanged?.();
        } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally { setAdding(false); }
    };

    const revoke = async (freezeId) => {
        if (!window.confirm("Remove this freeze? The kid's streak may break.")) return;
        try {
            await api.delete(`/students/${studentId}/freezes/${freezeId}`);
            toast.success("Freeze removed");
            await refresh();
            onChanged?.();
        } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        }
    };

    const noneLeft = (state.remaining_this_month || 0) <= 0;
    const today = todayLocalIso();
    const tooOld = (() => {
        try {
            const minDate = new Date();
            minDate.setUTCDate(minDate.getUTCDate() - 60);
            const m = minDate.toISOString().slice(0, 10);
            return pickDate < m;
        } catch { return false; }
    })();
    const futureDate = pickDate > today;

    return (
        <div className="rounded-2xl border-2 border-[#E8E0D2] bg-[#FBF6EE] p-4 sm:p-5" data-testid="streak-freeze-manager">
            <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#4C9A6B] flex items-center gap-1.5">
                        <Snowflake size={12} /> Streak freezes
                    </p>
                    <p className="font-display font-extrabold text-lg text-[#201D18] mt-0.5">
                        {state.remaining_this_month}/{state.monthly_cap} left this month
                    </p>
                </div>
                {!noneLeft && (
                    <button
                        onClick={() => setShowForm((s) => !s)}
                        className="btn-pop-ghost text-xs inline-flex items-center gap-1.5"
                        data-testid="freeze-grant-btn"
                    >
                        <Plus size={12} /> Grant a freeze
                    </button>
                )}
            </div>

            <p className="text-xs font-semibold text-[#6E675B] flex items-start gap-1.5">
                <Info size={12} className="flex-shrink-0 mt-0.5 text-[#9A9286]" />
                A freeze covers ONE missed day so {studentName || "the kid"}'s streak stays alive — for sick days, travel, big events.
            </p>

            {showForm && !noneLeft && (
                <form onSubmit={grant} className="mt-3 p-3 bg-white rounded-xl border border-[#E8E0D2] grid sm:grid-cols-[auto,1fr,auto] gap-2" data-testid="freeze-grant-form">
                    <input
                        type="date"
                        value={pickDate}
                        max={today}
                        onChange={(e) => setPickDate(e.target.value)}
                        className="rounded-lg border-2 border-[#E8E0D2] px-3 py-2 font-bold text-sm focus:border-[#E4572E] outline-none"
                        data-testid="freeze-date-input"
                    />
                    <input
                        type="text"
                        placeholder="Reason (optional) — e.g. fever, school trip"
                        value={pickReason}
                        onChange={(e) => setPickReason(e.target.value.slice(0, 240))}
                        className="rounded-lg border-2 border-[#E8E0D2] px-3 py-2 text-sm font-medium focus:border-[#E4572E] outline-none"
                        data-testid="freeze-reason-input"
                    />
                    <button
                        type="submit"
                        disabled={adding || tooOld || futureDate}
                        className="btn-pop-primary text-xs disabled:opacity-50"
                        data-testid="freeze-submit"
                    >
                        {adding ? <Loader2 size={14} className="animate-spin" /> : <>Grant ❄️</>}
                    </button>
                    {(tooOld || futureDate) && (
                        <p className="sm:col-span-3 text-xs font-bold text-[#BC4B32]">
                            {futureDate ? "Can't freeze a future date." : "Freezes can only cover the last 60 days."}
                        </p>
                    )}
                </form>
            )}

            {loading ? (
                <div className="mt-3 flex justify-center"><Loader2 className="animate-spin text-[#E4572E]" size={18} /></div>
            ) : state.freezes.length === 0 ? (
                <p className="text-xs font-semibold text-[#9A9286] mt-3">No freezes granted yet.</p>
            ) : (
                <ul className="mt-3 space-y-1.5" data-testid="freeze-list">
                    {state.freezes.map((f) => (
                        <li key={f.id} className="flex items-center justify-between gap-2 text-xs font-semibold text-[#201D18] bg-white rounded-lg px-3 py-2 border border-[#E8E0D2]">
                            <span className="flex items-center gap-2 min-w-0">
                                <Snowflake size={12} className="text-[#4C9A6B] flex-shrink-0" />
                                <span className="font-bold">{f.date}</span>
                                {f.reason && <span className="text-[#6E675B] font-medium truncate">— {f.reason}</span>}
                            </span>
                            <button
                                onClick={() => revoke(f.id)}
                                className="text-[#BC4B32] hover:bg-[#BC4B32]/10 rounded-md p-1"
                                title="Remove freeze"
                                data-testid={`freeze-revoke-${f.id}`}
                            ><Trash2 size={12} /></button>
                        </li>
                    ))}
                </ul>
            )}

            {noneLeft && (
                <p className="mt-2 text-xs font-bold text-[#BC4B32]" data-testid="freeze-out-of-quota">
                    Out of freezes this month — quota resets on the 1st.
                </p>
            )}
        </div>
    );
}
