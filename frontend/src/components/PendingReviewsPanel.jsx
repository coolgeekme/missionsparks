import { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { Clock, Check, X, Loader2, Camera, MessageCircle } from "lucide-react";

export default function PendingReviewsPanel({ onChanged }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [rejectingId, setRejectingId] = useState(null);
    const [rejectReason, setRejectReason] = useState("");
    const [actingId, setActingId] = useState(null);

    const refresh = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/pending-reviews");
            setRows(data);
        } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally { setLoading(false); }
    };

    useEffect(() => { refresh(); }, []);

    const approve = async (logId) => {
        setActingId(logId);
        try {
            await api.post(`/logs/${logId}/approve`);
            toast.success("Approved — spark counted 🎉");
            await refresh();
            onChanged?.();
        } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally { setActingId(null); }
    };

    const openReject = (logId) => { setRejectingId(logId); setRejectReason(""); };

    const submitReject = async () => {
        if (!rejectingId) return;
        setActingId(rejectingId);
        try {
            await api.post(`/logs/${rejectingId}/reject`, { reason: rejectReason || undefined });
            toast.success("Sent back to try again");
            setRejectingId(null);
            setRejectReason("");
            await refresh();
            onChanged?.();
        } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally { setActingId(null); }
    };

    if (loading) {
        return (
            <div className="mb-card p-5 flex items-center justify-center gap-2 text-sm font-semibold text-[#6E675B]" data-testid="pending-reviews-loading">
                <Loader2 className="animate-spin text-[#E4572E]" size={16} /> Loading pending reviews…
            </div>
        );
    }
    if (!rows.length) {
        return (
            <div className="mb-card p-5" data-testid="pending-reviews-empty">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#E4572E] flex items-center gap-1.5">
                    <Clock size={11} /> Pending review
                </p>
                <p className="font-display font-extrabold text-lg text-[#201D18] mt-0.5">Nothing waiting on you.</p>
                <p className="text-sm font-semibold text-[#6E675B] mt-1">All caught up ✅</p>
            </div>
        );
    }

    return (
        <div className="mb-card p-5" data-testid="pending-reviews-panel">
            <div className="flex items-center justify-between mb-3">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#E4572E] flex items-center gap-1.5">
                        <Clock size={11} /> Pending review
                    </p>
                    <p className="font-display font-extrabold text-lg text-[#201D18] mt-0.5">
                        {rows.length} {rows.length === 1 ? "mission" : "missions"} awaiting your approval
                    </p>
                </div>
            </div>
            <ul className="space-y-3">
                {rows.map((r) => (
                    <li
                        key={r.log_id}
                        className="rounded-2xl border-2 border-[#E8E0D2] bg-white p-4"
                        data-testid={`pending-review-row-${r.log_id}`}
                    >
                        <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="min-w-0">
                                <p className="font-display font-extrabold text-base text-[#201D18] truncate">{r.mission_title}</p>
                                <p className="text-xs font-semibold text-[#6E675B]">
                                    {r.student_name} · submitted {new Date(r.submitted_at).toLocaleString()}
                                </p>
                            </div>
                            {r.hours_until_auto_approve !== null && r.hours_until_auto_approve !== undefined && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#E8A33D]/20 text-[#8A6413] px-2 py-0.5 text-[10px] font-bold whitespace-nowrap" title={`Auto-approves at ${r.auto_approve_at}`}>
                                    <Clock size={10} /> auto in {r.hours_until_auto_approve}h
                                </span>
                            )}
                        </div>
                        {r.note && (
                            <div className="flex items-start gap-1.5 text-sm text-[#201D18] mb-2">
                                <MessageCircle size={13} className="text-[#9A9286] flex-shrink-0 mt-0.5" />
                                <p className="font-medium italic">"{r.note}"</p>
                            </div>
                        )}
                        {r.photo_id && (
                            <div className="mb-2">
                                <a
                                    href={`${process.env.REACT_APP_BACKEND_URL}/api/logs/${r.log_id}/photo`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#E4572E] hover:underline"
                                    data-testid={`pending-review-photo-${r.log_id}`}
                                >
                                    <Camera size={12} /> View photo
                                </a>
                            </div>
                        )}
                        {rejectingId === r.log_id ? (
                            <div className="mt-3 flex flex-col sm:flex-row gap-2">
                                <input
                                    type="text"
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value.slice(0, 240))}
                                    placeholder="Optional note back to your kid"
                                    className="rounded-lg border-2 border-[#E8E0D2] px-3 py-2 text-sm font-medium focus:border-[#BC4B32] outline-none flex-1"
                                    data-testid={`pending-review-reject-reason-${r.log_id}`}
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={submitReject}
                                        disabled={actingId === r.log_id}
                                        className="rounded-2xl bg-[#BC4B32] hover:bg-[#BC4B32] text-white font-extrabold text-xs px-3 py-2 disabled:opacity-50 shadow-[0_3px_0_0_#8A3A26]"
                                        data-testid={`pending-review-reject-submit-${r.log_id}`}
                                    >{actingId === r.log_id ? "…" : "Send back"}</button>
                                    <button onClick={() => setRejectingId(null)} disabled={actingId === r.log_id} className="btn-pop-ghost text-xs px-3">Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-3 flex gap-2">
                                <button
                                    onClick={() => approve(r.log_id)}
                                    disabled={actingId === r.log_id}
                                    className="btn-pop-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                                    data-testid={`pending-review-approve-${r.log_id}`}
                                >
                                    {actingId === r.log_id ? <Loader2 className="animate-spin" size={12} /> : <Check size={12} />}
                                    Approve
                                </button>
                                <button
                                    onClick={() => openReject(r.log_id)}
                                    disabled={actingId === r.log_id}
                                    className="btn-pop-ghost text-xs inline-flex items-center gap-1.5"
                                    data-testid={`pending-review-reject-${r.log_id}`}
                                >
                                    <X size={12} /> Send back
                                </button>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
