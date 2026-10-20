import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Mail } from "lucide-react";
import { api } from "../lib/api";
import SparkMark from "../components/SparkMark";

export default function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [sent, setSent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const submit = async (e) => {
        e.preventDefault();
        setErr("");
        setBusy(true);
        try {
            await api.post("/auth/forgot-password", { email });
            setSent(true);
        } catch (e2) {
            setErr(e2?.response?.data?.detail || e2?.message || "Something went wrong. Try again.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen mb-dots flex items-center justify-center p-6" data-testid="forgot-page">
            <div className="w-full max-w-md">
                <Link
                    to="/login"
                    className="inline-flex items-center gap-2 text-sm font-bold text-[#E4572E] hover:text-[#201D18] mb-4"
                    data-testid="forgot-back-login"
                >
                    <ArrowLeft size={14} /> Back to login
                </Link>
                <div className="mb-card p-8">
                    <div className="flex flex-col items-center text-center mb-6">
                        <SparkMark size={44} className="mb-3" />
                        <h1 className="font-display font-extrabold text-3xl text-[#201D18]">
                            {sent ? "Check your email" : "Reset your password"}
                        </h1>
                        <p className="text-[#6E675B] font-semibold mt-1">
                            {sent
                                ? "If that address has an account, a reset link is on its way."
                                : "We'll email you a link to choose a new one."}
                        </p>
                    </div>

                    {sent ? (
                        <div className="text-center">
                            <div className="mx-auto h-14 w-14 rounded-2xl bg-[#3F8C5E]/15 text-[#3F8C5E] flex items-center justify-center mb-4">
                                <Mail size={26} />
                            </div>
                            <p className="text-sm font-semibold text-[#6E675B]">
                                Sent to <span className="font-bold text-[#201D18]">{email}</span>.
                                The link expires in 1 hour.
                            </p>
                            <p className="text-xs font-semibold text-[#9A9286] mt-3">
                                Nothing in your inbox? Check spam, then{" "}
                                <button
                                    type="button"
                                    onClick={() => { setSent(false); setErr(""); }}
                                    className="underline text-[#E4572E]"
                                >
                                    try a different email
                                </button>.
                            </p>
                            <Link to="/login" className="btn-pop-primary inline-block mt-5" data-testid="forgot-back-login-2">
                                Back to login
                            </Link>
                        </div>
                    ) : (
                        <form onSubmit={submit} className="space-y-4" data-testid="forgot-form">
                            <div>
                                <label className="block text-sm font-bold text-[#201D18] mb-1">Email</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@email.com"
                                    className="mb-input"
                                    required
                                    data-testid="forgot-email"
                                />
                            </div>
                            {err && (
                                <div className="text-sm font-bold text-[#BC4B32] bg-[#BC4B32]/10 rounded-xl px-3 py-2" data-testid="forgot-error">
                                    {err}
                                </div>
                            )}
                            <button type="submit" disabled={busy} className="btn-pop-primary w-full" data-testid="forgot-submit">
                                {busy ? "Sending…" : "Send reset link"}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
