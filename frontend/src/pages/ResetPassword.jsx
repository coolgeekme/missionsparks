import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";
import SparkMark from "../components/SparkMark";

export default function ResetPassword() {
    const [params] = useSearchParams();
    const token = params.get("token") || "";
    const [pw, setPw] = useState("");
    const [pw2, setPw2] = useState("");
    const [done, setDone] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const submit = async (e) => {
        e.preventDefault();
        setErr("");
        if (pw.length < 8) {
            setErr("Password must be at least 8 characters.");
            return;
        }
        if (pw !== pw2) {
            setErr("Those passwords don't match.");
            return;
        }
        setBusy(true);
        try {
            await api.post("/auth/reset-password", { token, new_password: pw });
            setDone(true);
        } catch (e2) {
            setErr(e2?.response?.data?.detail || e2?.message || "Something went wrong. Request a new link.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen mb-dots flex items-center justify-center p-6" data-testid="reset-page">
            <div className="w-full max-w-md">
                <Link
                    to="/login"
                    className="inline-flex items-center gap-2 text-sm font-bold text-[#E4572E] hover:text-[#201D18] mb-4"
                    data-testid="reset-back-login"
                >
                    <ArrowLeft size={14} /> Back to login
                </Link>
                <div className="mb-card p-8">
                    <div className="flex flex-col items-center text-center mb-6">
                        <SparkMark size={44} className="mb-3" />
                        <h1 className="font-display font-extrabold text-3xl text-[#201D18]">
                            {done ? "Password updated" : "Choose a new password"}
                        </h1>
                        <p className="text-[#6E675B] font-semibold mt-1">
                            {done ? "You're all set — log in with your new password." : "At least 8 characters."}
                        </p>
                    </div>

                    {!token ? (
                        <div className="text-center">
                            <p className="text-sm font-bold text-[#BC4B32] bg-[#BC4B32]/10 rounded-xl px-3 py-2">
                                This link is missing its reset token. Request a fresh one.
                            </p>
                            <Link to="/forgot-password" className="btn-pop-primary inline-block mt-5" data-testid="reset-request-new">
                                Request a new link
                            </Link>
                        </div>
                    ) : done ? (
                        <div className="text-center">
                            <div className="mx-auto h-14 w-14 rounded-2xl bg-[#3F8C5E]/15 text-[#3F8C5E] flex items-center justify-center mb-4">
                                <CheckCircle2 size={28} />
                            </div>
                            <Link to="/login" className="btn-pop-primary inline-block" data-testid="reset-go-login">
                                Log in
                            </Link>
                        </div>
                    ) : (
                        <form onSubmit={submit} className="space-y-4" data-testid="reset-form">
                            <div>
                                <label className="block text-sm font-bold text-[#201D18] mb-1">New password</label>
                                <input
                                    type="password"
                                    value={pw}
                                    onChange={(e) => setPw(e.target.value)}
                                    placeholder="••••••••"
                                    className="mb-input"
                                    required
                                    minLength={8}
                                    autoComplete="new-password"
                                    data-testid="reset-password"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-[#201D18] mb-1">Confirm new password</label>
                                <input
                                    type="password"
                                    value={pw2}
                                    onChange={(e) => setPw2(e.target.value)}
                                    placeholder="••••••••"
                                    className="mb-input"
                                    required
                                    minLength={8}
                                    autoComplete="new-password"
                                    data-testid="reset-password-confirm"
                                />
                            </div>
                            {err && (
                                <div className="text-sm font-bold text-[#BC4B32] bg-[#BC4B32]/10 rounded-xl px-3 py-2" data-testid="reset-error">
                                    {err}
                                </div>
                            )}
                            <button type="submit" disabled={busy} className="btn-pop-primary w-full" data-testid="reset-submit">
                                {busy ? "Saving…" : "Save new password"}
                            </button>
                            <p className="text-[11px] font-semibold text-[#9A9286] text-center">
                                Need a fresh link?{" "}
                                <Link to="/forgot-password" className="underline text-[#E4572E]">Request another</Link>
                            </p>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
