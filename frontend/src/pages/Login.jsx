import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Rocket } from "lucide-react";

export default function Login() {
    const { login } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    const navigate = useNavigate();

    const submit = async (e) => {
        e.preventDefault();
        setErr("");
        setBusy(true);
        try {
            const u = await login(email, password);
            navigate(u.role === "parent" ? "/parent" : "/student");
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
            <div className="w-full max-w-md mb-card p-8">
                <div className="flex flex-col items-center text-center mb-6">
                    <div className="h-14 w-14 rounded-2xl bg-[#4361EE] flex items-center justify-center text-white shadow-[0_6px_0_0_#3A53CC] mb-3">
                        <Rocket size={26} />
                    </div>
                    <h1 className="font-display font-extrabold text-3xl text-[#0B132B]">Welcome back!</h1>
                    <p className="text-[#4A5568] font-semibold mt-1">Log in to launch today's missions.</p>
                </div>

                <form onSubmit={submit} className="space-y-4" data-testid="login-form">
                    <div>
                        <label className="block text-sm font-bold text-[#0B132B] mb-1">Email</label>
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
                        <label className="block text-sm font-bold text-[#0B132B] mb-1">Password</label>
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
                        <div className="text-sm font-bold text-[#EF476F] bg-[#EF476F]/10 rounded-xl px-3 py-2" data-testid="login-error">
                            {err}
                        </div>
                    )}
                    <button type="submit" disabled={busy} className="btn-pop-primary w-full" data-testid="login-submit">
                        {busy ? "Logging in…" : "Log in"}
                    </button>
                </form>

                <div className="mt-5 text-center">
                    <p className="text-sm font-bold text-[#4A5568]">No account? <Link to="/register" className="text-[#4361EE] underline" data-testid="login-go-register">Sign up</Link></p>
                </div>

                <div className="mt-6 pt-5 border-t-2 border-dashed border-[#E2E8F0]">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0] mb-2 text-center">Quick demo</p>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => fillDemo("parent")} className="btn-pop-ghost flex-1 text-sm py-2" data-testid="login-demo-parent">
                            Use demo Parent
                        </button>
                        <button type="button" onClick={() => fillDemo("student")} className="btn-pop-secondary flex-1 text-sm py-2" data-testid="login-demo-student">
                            Use demo Student
                        </button>
                    </div>
                </div>
                <p className="text-xs font-semibold text-[#A0AEC0] mt-5 text-center" data-testid="login-legal-links">
                    <Link to="/privacy" className="underline hover:text-[#4361EE]">Privacy</Link>
                    {" · "}
                    <Link to="/terms" className="underline hover:text-[#4361EE]">Terms</Link>
                </p>
            </div>
        </div>
    );
}
