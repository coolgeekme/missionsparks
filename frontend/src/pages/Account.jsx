import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import NotificationSettingsPanel from "../components/NotificationSettingsPanel";
import { toast } from "sonner";
import { ArrowLeft, Mic, Download, Trash2, Shield, History, Mail, Send, Clock } from "lucide-react";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIMEZONES = [
    "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
    "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Kolkata", "Asia/Tokyo",
    "Australia/Sydney", "UTC",
];

export default function Account() {
    const { user, refresh, logout } = useAuth();
    const navigate = useNavigate();
    const [discardAudio, setDiscardAudio] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedMsg, setSavedMsg] = useState("");
    const [deleting, setDeleting] = useState(false);
    const [confirmText, setConfirmText] = useState("");
    const [err, setErr] = useState("");

    // Digest preferences (parent-only)
    const [digestPrefs, setDigestPrefs] = useState(null);
    const [digestSaving, setDigestSaving] = useState(false);
    const [sendingSample, setSendingSample] = useState(false);

    // Verify PIN (parent-only, Iter 21)
    const [verifyPinSet, setVerifyPinSet] = useState(false);
    const [verifyPinDraft, setVerifyPinDraft] = useState("");
    const [verifyPinBusy, setVerifyPinBusy] = useState(false);
    const [verifyPinEditing, setVerifyPinEditing] = useState(false);

    useEffect(() => {
        if (user && user.id) setDiscardAudio(!!user.discard_audio);
    }, [user]);

    useEffect(() => {
        if (user && user.role === "parent") {
            api.get("/me/digest-preferences").then(({ data }) => setDigestPrefs(data)).catch(() => {});
            api.get("/me/verify-pin").then(({ data }) => setVerifyPinSet(!!data.is_set)).catch(() => {});
        }
    }, [user?.id, user?.role]);

    const saveVerifyPin = async () => {
        if (!/^\d{4}$/.test(verifyPinDraft)) {
            toast.error("Verify PIN must be exactly 4 digits.");
            return;
        }
        setVerifyPinBusy(true);
        try {
            await api.put("/me/verify-pin", { pin: verifyPinDraft });
            setVerifyPinSet(true);
            setVerifyPinDraft("");
            setVerifyPinEditing(false);
            toast.success("Verify PIN saved.");
        } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally { setVerifyPinBusy(false); }
    };

    const clearVerifyPin = async () => {
        if (!window.confirm("Remove your verify PIN? Any missions set to 'Grown-up PIN' verification will require another linked parent's PIN.")) return;
        setVerifyPinBusy(true);
        try {
            await api.delete("/me/verify-pin");
            setVerifyPinSet(false);
            setVerifyPinDraft("");
            setVerifyPinEditing(false);
            toast.success("Verify PIN removed.");
        } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally { setVerifyPinBusy(false); }
    };

    const saveAudio = async (next) => {
        setSaving(true);
        setSavedMsg("");
        try {
            await api.put("/account/preferences", { discard_audio: next });
            setDiscardAudio(next);
            setSavedMsg("Saved ✓");
            refresh();
        } catch (e) {
            setErr(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally {
            setSaving(false);
        }
    };

    const exportData = async () => {
        try {
            const { data } = await api.get("/account/export");
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `missionsparks_export_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
        } catch (e) {
            setErr(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        }
    };

    const deleteAccount = async () => {
        if (confirmText !== "DELETE") {
            setErr('Type DELETE in the box to confirm.');
            return;
        }
        setDeleting(true);
        try {
            await api.delete("/account/me");
            await logout();
            navigate("/login", { replace: true });
        } catch (e) {
            setErr(formatApiErrorDetail(e.response?.data?.detail) || e.message);
            setDeleting(false);
        }
    };

    const saveDigest = async (patch) => {
        if (!digestPrefs) return;
        const next = { ...digestPrefs, ...patch };
        setDigestPrefs(next);  // optimistic
        setDigestSaving(true);
        try {
            const { data } = await api.put("/me/digest-preferences", {
                enabled: !!next.enabled,
                cadence: next.cadence,
                preferred_hour: next.preferred_hour,
                preferred_minute: next.preferred_minute,
                preferred_weekday: next.preferred_weekday,
                tz: next.tz,
            });
            setDigestPrefs(data);
            toast.success("Digest preferences saved.");
        } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally { setDigestSaving(false); }
    };

    const sendSample = async () => {
        setSendingSample(true);
        try {
            const { data } = await api.post("/me/digest/send-sample");
            if (data.sent) toast.success(`Sample sent to ${user.email} 📬`);
            else toast.error("Couldn't send sample email — check that your sender domain is verified.");
        } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally { setSendingSample(false); }
    };

    if (!user || !user.id) return null;

    return (
        <div className="min-h-screen" data-testid="account-page">
            <Navbar />
            <main className="max-w-3xl mx-auto p-6 md:p-10 space-y-6">
                <Link to={user.role === "parent" ? "/parent" : "/student"} className="inline-flex items-center gap-2 text-sm font-bold text-[#E4572E]" data-testid="account-back">
                    <ArrowLeft size={16} /> Back
                </Link>
                <header>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286]">Account & privacy</p>
                    <h1 className="font-display font-extrabold text-4xl text-[#201D18] mt-1">Your settings</h1>
                    <p className="text-[#6E675B] font-semibold mt-2">{user.name} · {user.email} · {user.role}</p>
                </header>

                {err && <p className="text-sm font-bold text-[#BC4B32] bg-[#BC4B32]/10 rounded-xl px-3 py-2" data-testid="account-error">{err}</p>}

                <section className="mb-card p-6" data-testid="account-audio-section">
                    <div className="flex items-start gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-[#BC4B32]/15 text-[#BC4B32] flex items-center justify-center">
                            <Mic />
                        </div>
                        <div className="flex-1">
                            <h2 className="font-display font-bold text-xl text-[#201D18]">Discard audio after transcription</h2>
                            <p className="text-sm text-[#6E675B] font-semibold mt-1">
                                When ON, voice recordings are transcribed and then thrown away — we keep only the text on your Moment. <strong>Recommended.</strong>
                            </p>
                            <div className="flex items-center gap-3 mt-3">
                                <button
                                    onClick={() => saveAudio(!discardAudio)}
                                    disabled={saving}
                                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                                        discardAudio ? "bg-[#3F8C5E]" : "bg-[#E8E0D2]"
                                    }`}
                                    aria-pressed={discardAudio}
                                    data-testid="account-discard-audio-toggle"
                                >
                                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${discardAudio ? "translate-x-7" : "translate-x-1"}`} />
                                </button>
                                <span className="font-bold text-[#201D18]" data-testid="account-discard-audio-state">{discardAudio ? "ON" : "OFF"}</span>
                                {savedMsg && <span className="text-sm font-bold text-[#2F6B47]" data-testid="account-discard-audio-msg">{savedMsg}</span>}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="mb-card p-6" data-testid="account-export-section">
                    <div className="flex items-start gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-[#E4572E]/15 text-[#E4572E] flex items-center justify-center">
                            <Download />
                        </div>
                        <div className="flex-1">
                            <h2 className="font-display font-bold text-xl text-[#201D18]">Download your data</h2>
                            <p className="text-sm text-[#6E675B] font-semibold mt-1">A full JSON copy of everything in your account.</p>
                            <button onClick={exportData} className="btn-pop-primary mt-3 inline-flex items-center gap-2" data-testid="account-export-btn">
                                <Download size={14} /> Download JSON
                            </button>
                        </div>
                    </div>
                </section>

                {user.role === "parent" && digestPrefs && (
                    <section className="mb-card p-6" data-testid="digest-section">
                        <div className="flex items-start gap-3">
                            <div className="h-12 w-12 rounded-2xl bg-[#3F8C5E]/15 text-[#2F6B47] flex items-center justify-center">
                                <Mail />
                            </div>
                            <div className="flex-1">
                                <h2 className="font-display font-bold text-xl text-[#201D18]">Family digest email</h2>
                                <p className="text-sm text-[#6E675B] font-semibold mt-1">
                                    A regular summary of each kid&apos;s activity + a personalized off-app activity + an ADHD article worth reading.
                                </p>

                                <div className="mt-4 flex items-center gap-3">
                                    <button
                                        onClick={() => saveDigest({ enabled: !digestPrefs.enabled })}
                                        disabled={digestSaving}
                                        className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${digestPrefs.enabled ? "bg-[#3F8C5E]" : "bg-[#E8E0D2]"}`}
                                        aria-pressed={digestPrefs.enabled}
                                        data-testid="digest-enable-toggle"
                                    >
                                        <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${digestPrefs.enabled ? "translate-x-7" : "translate-x-1"}`} />
                                    </button>
                                    <span className="font-bold text-[#201D18]" data-testid="digest-enable-state">{digestPrefs.enabled ? "ON" : "OFF"}</span>
                                </div>

                                {digestPrefs.enabled && (
                                    <div className="mt-5 grid sm:grid-cols-2 gap-4" data-testid="digest-config">
                                        <div>
                                            <label className="text-xs font-bold uppercase tracking-widest text-[#9A9286] mb-2 block">Cadence</label>
                                            <div className="flex gap-2" data-testid="digest-cadence-row">
                                                {["daily", "weekly"].map((c) => (
                                                    <button
                                                        key={c}
                                                        onClick={() => saveDigest({ cadence: c })}
                                                        className={`px-4 py-2 rounded-2xl font-bold text-sm border-2 transition-all ${digestPrefs.cadence === c ? "bg-[#E4572E] border-[#E4572E] text-white" : "bg-white border-[#E8E0D2] text-[#6E675B] hover:border-[#E4572E]"}`}
                                                        data-testid={`digest-cadence-${c}`}
                                                    >{c[0].toUpperCase() + c.slice(1)}</button>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-xs font-bold uppercase tracking-widest text-[#9A9286] mb-2 block">Timezone</label>
                                            <select
                                                value={digestPrefs.tz}
                                                onChange={(e) => saveDigest({ tz: e.target.value })}
                                                className="w-full rounded-2xl border-2 border-[#E8E0D2] px-3 py-2 font-bold focus:border-[#E4572E] outline-none"
                                                data-testid="digest-tz"
                                            >
                                                {TIMEZONES.map((z) => <option key={z} value={z}>{z.replace("_", " ")}</option>)}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="text-xs font-bold uppercase tracking-widest text-[#9A9286] mb-2 block flex items-center gap-1"><Clock size={11} /> Send time (local)</label>
                                            <select
                                                value={digestPrefs.preferred_hour}
                                                onChange={(e) => saveDigest({ preferred_hour: parseInt(e.target.value, 10) })}
                                                className="w-full rounded-2xl border-2 border-[#E8E0D2] px-3 py-2 font-bold focus:border-[#E4572E] outline-none"
                                                data-testid="digest-hour"
                                            >
                                                {Array.from({ length: 24 }).map((_, h) => (
                                                    <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                                                ))}
                                            </select>
                                        </div>

                                        {digestPrefs.cadence === "weekly" && (
                                            <div>
                                                <label className="text-xs font-bold uppercase tracking-widest text-[#9A9286] mb-2 block">Day of week</label>
                                                <div className="flex gap-1 flex-wrap" data-testid="digest-weekday-row">
                                                    {WEEKDAYS.map((d, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => saveDigest({ preferred_weekday: i })}
                                                            className={`w-12 py-2 rounded-2xl font-bold text-xs border-2 transition-all ${digestPrefs.preferred_weekday === i ? "bg-[#E4572E] border-[#E4572E] text-white" : "bg-white border-[#E8E0D2] text-[#6E675B] hover:border-[#E4572E]"}`}
                                                            data-testid={`digest-weekday-${i}`}
                                                        >{d}</button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="mt-5 flex flex-wrap items-center gap-3">
                                    <button onClick={sendSample} disabled={sendingSample} className="btn-pop-primary inline-flex items-center gap-2 disabled:opacity-50" data-testid="digest-send-sample">
                                        <Send size={14} /> {sendingSample ? "Sending…" : "Send me a sample now"}
                                    </button>
                                    {digestPrefs.last_sent_at && (
                                        <span className="text-xs font-bold text-[#9A9286]" data-testid="digest-last-sent">
                                            Last sent {new Date(digestPrefs.last_sent_at).toLocaleString()}
                                        </span>
                                    )}
                                    {digestPrefs.next_due_at && digestPrefs.enabled && (
                                        <span className="text-xs font-bold text-[#2F6B47]" data-testid="digest-next-due">
                                            Next: {new Date(digestPrefs.next_due_at).toLocaleString()}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                <NotificationSettingsPanel role={user.role} />

                {user.role === "parent" && (
                    <section className="mb-card p-6" data-testid="verify-pin-section">
                        <div className="flex items-start gap-3">
                            <div className="h-12 w-12 rounded-2xl bg-[#E4572E]/15 text-[#E4572E] flex items-center justify-center">
                                <Shield />
                            </div>
                            <div className="flex-1">
                                <h2 className="font-display font-bold text-xl text-[#201D18]">Verify PIN</h2>
                                <p className="text-sm text-[#6E675B] font-semibold mt-1">
                                    A 4-digit code you type on your kid's device when a mission is marked "Grown-up PIN". Not the same as your login password or the home-page PIN.
                                </p>
                                {!verifyPinEditing && (
                                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                                        {verifyPinSet ? (
                                            <span className="mb-chip bg-[#3F8C5E]/15 text-[#2F6B47]" data-testid="verify-pin-status-set">✓ PIN is set</span>
                                        ) : (
                                            <span className="mb-chip bg-[#E8A33D]/25 text-[#8A6413]" data-testid="verify-pin-status-unset">No PIN set yet</span>
                                        )}
                                        <button
                                            onClick={() => setVerifyPinEditing(true)}
                                            className="btn-pop-ghost text-sm"
                                            data-testid="verify-pin-edit-btn"
                                        >
                                            {verifyPinSet ? "Change PIN" : "Set PIN"}
                                        </button>
                                        {verifyPinSet && (
                                            <button
                                                onClick={clearVerifyPin}
                                                disabled={verifyPinBusy}
                                                className="text-sm font-bold text-[#BC4B32] hover:underline"
                                                data-testid="verify-pin-clear-btn"
                                            >Remove PIN</button>
                                        )}
                                    </div>
                                )}
                                {verifyPinEditing && (
                                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                                        <input
                                            type="password"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={verifyPinDraft}
                                            onChange={(e) => setVerifyPinDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
                                            placeholder="••••"
                                            className="w-32 rounded-2xl border-2 border-[#E8E0D2] px-3 py-2 font-mono text-center text-2xl tracking-[0.5em] focus:border-[#E4572E] outline-none"
                                            data-testid="verify-pin-input"
                                            maxLength={4}
                                            autoFocus
                                        />
                                        <button
                                            onClick={saveVerifyPin}
                                            disabled={verifyPinBusy || verifyPinDraft.length !== 4}
                                            className="btn-pop-primary text-sm disabled:opacity-50"
                                            data-testid="verify-pin-save"
                                        >{verifyPinBusy ? "Saving…" : "Save PIN"}</button>
                                        <button
                                            onClick={() => { setVerifyPinEditing(false); setVerifyPinDraft(""); }}
                                            className="btn-pop-ghost text-sm"
                                            data-testid="verify-pin-cancel"
                                        >Cancel</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>
                )}

                {user.role === "parent" && (
                    <section className="mb-card p-6" data-testid="account-audit-section">
                        <div className="flex items-start gap-3">
                            <div className="h-12 w-12 rounded-2xl bg-[#E8A33D]/30 text-[#8A6413] flex items-center justify-center">
                                <History />
                            </div>
                            <div className="flex-1">
                                <h2 className="font-display font-bold text-xl text-[#201D18]">Activity log</h2>
                                <p className="text-sm text-[#6E675B] font-semibold mt-1">See who did what in your account.</p>
                                <Link to="/parent/audit" className="btn-pop-ghost mt-3 inline-flex items-center gap-2" data-testid="account-audit-link">
                                    Open activity log →
                                </Link>
                            </div>
                        </div>
                    </section>
                )}

                <section className="mb-card p-6 border-[#BC4B32]" data-testid="account-delete-section">
                    <div className="flex items-start gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-[#BC4B32]/15 text-[#BC4B32] flex items-center justify-center">
                            <Trash2 />
                        </div>
                        <div className="flex-1">
                            <h2 className="font-display font-bold text-xl text-[#201D18]">Delete my account</h2>
                            <p className="text-sm text-[#6E675B] font-semibold mt-1">
                                Permanently erases your account and everything it owns. {user.role === "parent" ? "Your linked students keep their own accounts." : "Your missions, logs, and moments will be removed."}
                            </p>
                            <p className="text-sm font-bold text-[#BC4B32] mt-3">Type <code className="bg-[#BC4B32]/10 px-1 rounded">DELETE</code> to confirm:</p>
                            <div className="flex gap-2 mt-2">
                                <input
                                    value={confirmText}
                                    onChange={(e) => setConfirmText(e.target.value)}
                                    className="mb-input flex-1"
                                    placeholder="DELETE"
                                    data-testid="account-delete-confirm"
                                />
                                <button
                                    onClick={deleteAccount}
                                    disabled={deleting || confirmText !== "DELETE"}
                                    className="btn-pop-primary bg-[#BC4B32] flex items-center gap-2 disabled:opacity-50"
                                    style={{ boxShadow: "0 6px 0 0 #8A3A26", backgroundColor: "#BC4B32" }}
                                    data-testid="account-delete-btn"
                                >
                                    <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete forever"}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="mb-card p-5" data-testid="account-legal">
                    <div className="flex items-center gap-2 mb-2">
                        <Shield size={16} className="text-[#E4572E]" />
                        <h3 className="font-display font-bold text-lg text-[#201D18]">Legal</h3>
                    </div>
                    <div className="text-sm text-[#6E675B] font-semibold space-y-1">
                        <p><Link to="/privacy" className="text-[#E4572E] underline" data-testid="account-link-privacy">Privacy Policy</Link></p>
                        <p><Link to="/terms" className="text-[#E4572E] underline" data-testid="account-link-terms">Terms of Service</Link></p>
                    </div>
                </section>
            </main>
        </div>
    );
}
