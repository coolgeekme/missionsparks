import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Sparkles } from "lucide-react";

export default function Register() {
    const { register } = useAuth();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("parent");
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    const navigate = useNavigate();

    const submit = async (e) => {
        e.preventDefault();
        setErr("");
        setBusy(true);
        try {
            const u = await register({ name, email, password, role });
            navigate(u.role === "parent" ? "/parent" : "/student");
        } catch (e2) {
            setErr(e2.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen mb-dots flex items-center justify-center p-6" data-testid="register-page">
            <div className="w-full max-w-md mb-card p-8">
                <div className="flex flex-col items-center text-center mb-6">
                    <div className="h-14 w-14 rounded-2xl bg-[#06D6A0] flex items-center justify-center text-white shadow-[0_6px_0_0_#05B488] mb-3">
                        <Sparkles size={26} />
                    </div>
                    <h1 className="font-display font-extrabold text-3xl text-[#0B132B]">Join MissionBoard</h1>
                    <p className="text-[#4A5568] font-semibold mt-1">Create an account to start your adventure.</p>
                </div>

                <form onSubmit={submit} className="space-y-4" data-testid="register-form">
                    <div>
                        <label className="block text-sm font-bold text-[#0B132B] mb-2">I am a…</label>
                        <div className="grid grid-cols-2 gap-3">
                            {["parent", "student"].map((r) => (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => setRole(r)}
                                    className={`rounded-2xl border-2 py-3 px-4 font-bold capitalize transition-all ${
                                        role === r
                                            ? "border-[#4361EE] bg-[#4361EE]/10 text-[#4361EE]"
                                            : "border-[#E2E8F0] bg-white text-[#0B132B] hover:border-[#A0AEC0]"
                                    }`}
                                    data-testid={`register-role-${r}`}
                                >
                                    {r === "parent" ? "👨‍👩 Parent" : "🚀 Student"}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-[#0B132B] mb-1">Name</label>
                        <input value={name} onChange={(e) => setName(e.target.value)} className="mb-input" required data-testid="register-name" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-[#0B132B] mb-1">Email</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mb-input" required data-testid="register-email" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-[#0B132B] mb-1">Password</label>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mb-input" minLength={6} required data-testid="register-password" />
                    </div>
                    {err && (
                        <div className="text-sm font-bold text-[#EF476F] bg-[#EF476F]/10 rounded-xl px-3 py-2" data-testid="register-error">
                            {err}
                        </div>
                    )}
                    <button type="submit" disabled={busy} className="btn-pop-primary w-full" data-testid="register-submit">
                        {busy ? "Creating…" : "Create account"}
                    </button>
                </form>

                <div className="mt-5 text-center">
                    <p className="text-sm font-bold text-[#4A5568]">Have an account? <Link to="/login" className="text-[#4361EE] underline" data-testid="register-go-login">Log in</Link></p>
                </div>
            </div>
        </div>
    );
}
