import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ArrowLeft } from "lucide-react";
import SparkMark from "../components/SparkMark";

export default function Register() {
    const { register } = useAuth();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("parent");
    const [acceptTerms, setAcceptTerms] = useState(false);
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    const navigate = useNavigate();

    const submit = async (e) => {
        e.preventDefault();
        setErr("");
        if (!acceptTerms) {
            setErr("Please accept the Terms of Service and Privacy Policy.");
            return;
        }
        setBusy(true);
        try {
            const u = await register({ name, email, password, role, accept_terms: true });
            navigate(u.role === "parent" ? "/parent" : "/student");
        } catch (e2) {
            setErr(e2.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen mb-dots flex items-center justify-center p-6" data-testid="register-page">
            <div className="w-full max-w-md">
                <Link
                    to="/"
                    className="inline-flex items-center gap-2 text-sm font-bold text-[#E4572E] hover:text-[#201D18] mb-4"
                    data-testid="register-back-home"
                >
                    <ArrowLeft size={14} /> Back to home
                </Link>
                <div className="mb-card p-8">
                <div className="flex flex-col items-center text-center mb-6">
                    <SparkMark size={48} className="mb-3" />
                    <h1 className="font-display font-extrabold text-3xl text-[#201D18]">Join MissionSparks</h1>
                    <p className="text-[#6E675B] font-semibold mt-1">Create an account to start your adventure.</p>
                </div>

                <form onSubmit={submit} className="space-y-4" data-testid="register-form">
                    <div>
                        <label className="block text-sm font-bold text-[#201D18] mb-2">I am a…</label>
                        <div className="grid grid-cols-2 gap-3">
                            {["parent", "student"].map((r) => (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => setRole(r)}
                                    className={`rounded-2xl border-2 py-3 px-4 font-bold capitalize transition-all ${
                                        role === r
                                            ? "border-[#E4572E] bg-[#E4572E]/10 text-[#E4572E]"
                                            : "border-[#E8E0D2] bg-white text-[#201D18] hover:border-[#9A9286]"
                                    }`}
                                    data-testid={`register-role-${r}`}
                                >
                                    {r === "parent" ? "👨‍👩 Parent" : "🚀 Student"}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-[#201D18] mb-1">Name</label>
                        <input value={name} onChange={(e) => setName(e.target.value)} className="mb-input" required data-testid="register-name" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-[#201D18] mb-1">Email</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mb-input" required data-testid="register-email" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-[#201D18] mb-1">Password</label>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mb-input" minLength={6} required data-testid="register-password" />
                    </div>
                    {err && (
                        <div className="text-sm font-bold text-[#BC4B32] bg-[#BC4B32]/10 rounded-xl px-3 py-2" data-testid="register-error">
                            {err}
                        </div>
                    )}
                    <label className="flex items-start gap-2 text-sm font-semibold text-[#6E675B] cursor-pointer" data-testid="register-terms-label">
                        <input
                            type="checkbox"
                            checked={acceptTerms}
                            onChange={(e) => setAcceptTerms(e.target.checked)}
                            className="mt-0.5 h-4 w-4"
                            data-testid="register-accept-terms"
                        />
                        <span>
                            I've read and accept the{" "}
                            <Link to="/terms" target="_blank" className="text-[#E4572E] underline">Terms of Service</Link>{" "}
                            and{" "}
                            <Link to="/privacy" target="_blank" className="text-[#E4572E] underline">Privacy Policy</Link>.
                        </span>
                    </label>
                    <button type="submit" disabled={busy} className="btn-pop-primary w-full" data-testid="register-submit">
                        {busy ? "Creating…" : "Create account"}
                    </button>
                </form>

                <div className="mt-5 text-center">
                    <p className="text-sm font-bold text-[#6E675B]">Have an account? <Link to="/login" className="text-[#E4572E] underline" data-testid="register-go-login">Log in</Link></p>
                </div>
                </div>
            </div>
        </div>
    );
}
