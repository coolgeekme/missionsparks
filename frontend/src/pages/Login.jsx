import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ArrowLeft } from "lucide-react";
import SparkMark from "../components/SparkMark";

export default function Login() {
    const { login } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const redirect = params.get("redirect");

    const submit = async (e) => {
        e.preventDefault();
        setErr("");
        setBusy(true);
        try {
            const u = await login(email, password);
            if (redirect) navigate(redirect);
            else navigate(u.role === "parent" ? "/parent" : "/student");
        } catch (e2) {
            setErr(e2.message);
        } finally {
            setBusy(false);
        }
    };

    const fillDemo = (role) => {
        if (role === "parent") {
            setEmail("parent@demo.com");
            setPassword("demo1234");
        } else {
            setEmail("student@demo.com");
            setPassword("demo1234");
        }
    };

    return (
        <div className="min-h-screen mb-dots flex items-center justify-center p-6" data-testid="login-page">
            <div className="w-full max-w-md">
                <Link
                    to="/"
                    className="inline-flex items-center gap-2 text-sm font-bold text-[#E4572E] hover:text-[#201D18] mb-4"
                    data-testid="login-back-home"
                >
                    <ArrowLeft size={14} /> Back to home
                </Link>
                <div className="mb-card p-8">
                    <Link to="/" className="flex flex-col items-center text-center mb-6 group" data-testid="login-logo-home">
                        <SparkMark size={48} className="mb-3 group-hover:scale-105 transition-transform" />
                        <h1 className="font-display font-extrabold text-3xl text-[#201D18]">Welcome back!</h1>
                        <p className="text-[#6E675B] font-semibold mt-1">{"Log in to launch today's missions."}</p>
                    </Link>

                <form onSubmit={submit} className="space-y-4" data-testid="login-form">
                    <div>
                        <label className="block text-sm font-bold text-[#201D18] mb-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@email.com"
                            className="mb-input"
                            required
                            data-testid="login-email"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-[#201D18] mb-1">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="mb-input"
                            required
                            data-testid="login-password"
                        />
                    </div>
                    {err && (
                        <div className="text-sm font-bold text-[#BC4B32] bg-[#BC4B32]/10 rounded-xl px-3 py-2" data-testid="login-error">
                            {err}
                        </div>
                    )}
                    <button type="submit" disabled={busy} className="btn-pop-primary w-full" data-testid="login-submit">
                        {busy ? "Logging in…" : "Log in"}
                    </button>
                </form>

                <div className="mt-5 text-center">
                    <p className="text-sm font-bold text-[#6E675B]">No account? <Link to="/register" className="text-[#E4572E] underline" data-testid="login-go-register">Sign up</Link></p>
                </div>

                <div className="mt-6 pt-5 border-t-2 border-dashed border-[#E8E0D2]">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286] mb-2 text-center">Quick demo</p>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => fillDemo("parent")} className="btn-pop-ghost flex-1 text-sm py-2" data-testid="login-demo-parent">
                            Use demo Parent
                        </button>
                        <button type="button" onClick={() => fillDemo("student")} className="btn-pop-secondary flex-1 text-sm py-2" data-testid="login-demo-student">
                            Use demo Student
                        </button>
                    </div>
                </div>
                <p className="text-xs font-semibold text-[#9A9286] mt-5 text-center" data-testid="login-legal-links">
                    <Link to="/privacy" className="underline hover:text-[#E4572E]">Privacy</Link>
                    {" · "}
                    <Link to="/terms" className="underline hover:text-[#E4572E]">Terms</Link>
                </p>
                </div>
            </div>
        </div>
    );
}
