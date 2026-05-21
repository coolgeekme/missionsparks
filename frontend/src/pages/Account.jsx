import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { ArrowLeft, Mic, Download, Trash2, Shield, History } from "lucide-react";

export default function Account() {
    const { user, refresh, logout } = useAuth();
    const navigate = useNavigate();
    const [discardAudio, setDiscardAudio] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedMsg, setSavedMsg] = useState("");
    const [deleting, setDeleting] = useState(false);
    const [confirmText, setConfirmText] = useState("");
    const [err, setErr] = useState("");

    useEffect(() => {
        if (user && user.id) setDiscardAudio(!!user.discard_audio);
    }, [user]);

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
            a.download = `missionboard_export_${new Date().toISOString().slice(0, 10)}.json`;
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

    if (!user || !user.id) return null;

    return (
        <div className="min-h-screen" data-testid="account-page">
            <Navbar />
            <main className="max-w-3xl mx-auto p-6 md:p-10 space-y-6">
                <Link to={user.role === "parent" ? "/parent" : "/student"} className="inline-flex items-center gap-2 text-sm font-bold text-[#4361EE]" data-testid="account-back">
                    <ArrowLeft size={16} /> Back
                </Link>
                <header>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">Account & privacy</p>
                    <h1 className="font-display font-extrabold text-4xl text-[#0B132B] mt-1">Your settings</h1>
                    <p className="text-[#4A5568] font-semibold mt-2">{user.name} · {user.email} · {user.role}</p>
                </header>

                {err && <p className="text-sm font-bold text-[#EF476F] bg-[#EF476F]/10 rounded-xl px-3 py-2" data-testid="account-error">{err}</p>}

                <section className="mb-card p-6" data-testid="account-audio-section">
                    <div className="flex items-start gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-[#EF476F]/15 text-[#EF476F] flex items-center justify-center">
                            <Mic />
                        </div>
                        <div className="flex-1">
                            <h2 className="font-display font-bold text-xl text-[#0B132B]">Discard audio after transcription</h2>
                            <p className="text-sm text-[#4A5568] font-semibold mt-1">
                                When ON, voice recordings are transcribed by Whisper and then thrown away — we keep only the text on your Moment. <strong>Recommended.</strong>
                            </p>
                            <div className="flex items-center gap-3 mt-3">
                                <button
                                    onClick={() => saveAudio(!discardAudio)}
                                    disabled={saving}
                                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                                        discardAudio ? "bg-[#06D6A0]" : "bg-[#E2E8F0]"
                                    }`}
                                    aria-pressed={discardAudio}
                                    data-testid="account-discard-audio-toggle"
                                >
                                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${discardAudio ? "translate-x-7" : "translate-x-1"}`} />
                                </button>
                                <span className="font-bold text-[#0B132B]" data-testid="account-discard-audio-state">{discardAudio ? "ON" : "OFF"}</span>
                                {savedMsg && <span className="text-sm font-bold text-[#057a5b]" data-testid="account-discard-audio-msg">{savedMsg}</span>}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="mb-card p-6" data-testid="account-export-section">
                    <div className="flex items-start gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-[#4361EE]/15 text-[#4361EE] flex items-center justify-center">
                            <Download />
                        </div>
                        <div className="flex-1">
                            <h2 className="font-display font-bold text-xl text-[#0B132B]">Download your data</h2>
                            <p className="text-sm text-[#4A5568] font-semibold mt-1">A full JSON copy of everything in your account.</p>
                            <button onClick={exportData} className="btn-pop-primary mt-3 inline-flex items-center gap-2" data-testid="account-export-btn">
                                <Download size={14} /> Download JSON
                            </button>
                        </div>
                    </div>
                </section>

                {user.role === "parent" && (
                    <section className="mb-card p-6" data-testid="account-audit-section">
                        <div className="flex items-start gap-3">
                            <div className="h-12 w-12 rounded-2xl bg-[#FFD166]/30 text-[#876200] flex items-center justify-center">
                                <History />
                            </div>
                            <div className="flex-1">
                                <h2 className="font-display font-bold text-xl text-[#0B132B]">Activity log</h2>
                                <p className="text-sm text-[#4A5568] font-semibold mt-1">See who did what in your account.</p>
                                <Link to="/parent/audit" className="btn-pop-ghost mt-3 inline-flex items-center gap-2" data-testid="account-audit-link">
                                    Open activity log →
                                </Link>
                            </div>
                        </div>
                    </section>
                )}

                <section className="mb-card p-6 border-[#EF476F]" data-testid="account-delete-section">
                    <div className="flex items-start gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-[#EF476F]/15 text-[#EF476F] flex items-center justify-center">
                            <Trash2 />
                        </div>
                        <div className="flex-1">
                            <h2 className="font-display font-bold text-xl text-[#0B132B]">Delete my account</h2>
                            <p className="text-sm text-[#4A5568] font-semibold mt-1">
                                Permanently erases your account and everything it owns. {user.role === "parent" ? "Your linked students keep their own accounts." : "Your missions, logs, and moments will be removed."}
                            </p>
                            <p className="text-sm font-bold text-[#EF476F] mt-3">Type <code className="bg-[#EF476F]/10 px-1 rounded">DELETE</code> to confirm:</p>
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
                                    className="btn-pop-primary bg-[#EF476F] flex items-center gap-2 disabled:opacity-50"
                                    style={{ boxShadow: "0 6px 0 0 #9b1c3c", backgroundColor: "#EF476F" }}
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
                        <Shield size={16} className="text-[#4361EE]" />
                        <h3 className="font-display font-bold text-lg text-[#0B132B]">Legal</h3>
                    </div>
                    <div className="text-sm text-[#4A5568] font-semibold space-y-1">
                        <p><Link to="/privacy" className="text-[#4361EE] underline" data-testid="account-link-privacy">Privacy Policy</Link></p>
                        <p><Link to="/terms" className="text-[#4361EE] underline" data-testid="account-link-terms">Terms of Service</Link></p>
                    </div>
                </section>
            </main>
        </div>
    );
}
