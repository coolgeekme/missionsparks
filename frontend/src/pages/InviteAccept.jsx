import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { useAuth } from "../contexts/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Mail, Loader2, ArrowRight, LogIn } from "lucide-react";

export default function InviteAccept() {
    const [params] = useSearchParams();
    const token = params.get("token");
    const navigate = useNavigate();
    const { user, refresh } = useAuth();

    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [accepting, setAccepting] = useState(false);

    useEffect(() => {
        if (!token) {
            setErr("This invite link is missing its token.");
            setLoading(false);
            return;
        }
        (async () => {
            try {
                const { data } = await api.get(`/invites/preview?token=${encodeURIComponent(token)}`);
                setPreview(data);
            } catch (e) {
                setErr(formatApiErrorDetail(e.response?.data?.detail) || "Invite not found or expired.");
            } finally { setLoading(false); }
        })();
    }, [token]);

    const accept = async () => {
        if (!user || !user.id) {
            navigate(`/login?redirect=/invite/accept?token=${encodeURIComponent(token)}`);
            return;
        }
        setAccepting(true);
        try {
            const { data } = await api.post("/invites/accept", { token });
            await refresh();
            toast.success(`You've joined ${preview.family_name}! 🎉`);
            navigate("/family");
        } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally { setAccepting(false); }
    };

    const status = preview?.status;
    const wrongEmail = user && user.id && preview && preview.email && user.email?.toLowerCase() !== preview.email.toLowerCase();

    return (
        <div className="min-h-screen" data-testid="invite-accept-page">
            <Navbar />
            <main className="max-w-2xl mx-auto p-6 md:p-10">
                <div className="mb-card p-8 text-center space-y-4">
                    {loading && (
                        <div className="flex flex-col items-center gap-3 py-6" data-testid="invite-loading">
                            <Loader2 className="animate-spin text-[#4361EE]" size={32} />
                            <p className="font-bold text-[#4A5568]">Checking your invite…</p>
                        </div>
                    )}

                    {!loading && err && (
                        <div data-testid="invite-error">
                            <AlertTriangle className="mx-auto text-[#EF476F]" size={40} />
                            <h1 className="font-display font-extrabold text-3xl text-[#0B132B] mt-3">Invite unavailable</h1>
                            <p className="text-[#4A5568] font-semibold mt-2">{err}</p>
                            <Link to="/" className="btn-pop-primary inline-flex items-center gap-2 mt-5">
                                Go home <ArrowRight size={14} />
                            </Link>
                        </div>
                    )}

                    {!loading && preview && status === "pending" && (
                        <div data-testid="invite-preview">
                            <Mail className="mx-auto text-[#4361EE]" size={40} />
                            <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0] mt-3">You&apos;re invited</p>
                            <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-[#0B132B] mt-1">
                                Join {preview.family_name}
                            </h1>
                            <p className="text-[#4A5568] font-semibold mt-2">
                                {preview.invited_by_name ? `${preview.invited_by_name} invited` : "You were invited"} as a
                                <span className="mx-1 mb-chip bg-[#4361EE]/10 text-[#4361EE]">{preview.role === "co_parent" ? "Co-parent" : "Viewer"}</span>
                                using <span className="text-[#0B132B] font-bold">{preview.email}</span>.
                            </p>

                            {!user || !user.id ? (
                                <div className="mt-6 space-y-2">
                                    <p className="text-sm text-[#4A5568] font-semibold">Sign in first with the invited email to accept.</p>
                                    <Link
                                        to={`/login?redirect=${encodeURIComponent(`/invite/accept?token=${token}`)}`}
                                        className="btn-pop-primary inline-flex items-center gap-2"
                                        data-testid="invite-login"
                                    >
                                        <LogIn size={14} /> Sign in
                                    </Link>
                                    <p className="text-xs text-[#A0AEC0]">
                                        No account yet?{" "}
                                        <Link to="/register" className="text-[#4361EE] font-bold">Create one</Link>{" "}
                                        with <span className="font-mono">{preview.email}</span>.
                                    </p>
                                </div>
                            ) : wrongEmail ? (
                                <div className="mt-6 rounded-2xl bg-[#FFD166]/15 p-4" data-testid="invite-wrong-email">
                                    <p className="text-sm text-[#876200] font-bold">
                                        You&apos;re signed in as <span className="font-mono">{user.email}</span>, but this invite is for <span className="font-mono">{preview.email}</span>.
                                    </p>
                                    <p className="text-xs text-[#876200] font-semibold mt-2">
                                        Log out and sign in with the invited email to accept.
                                    </p>
                                </div>
                            ) : (
                                <button
                                    onClick={accept}
                                    disabled={accepting}
                                    className="btn-pop-primary inline-flex items-center gap-2 mt-5 disabled:opacity-50"
                                    data-testid="invite-accept-btn"
                                >
                                    <CheckCircle2 size={16} /> {accepting ? "Joining…" : "Accept invite"}
                                </button>
                            )}

                            <p className="text-xs text-[#A0AEC0] font-semibold mt-4">Expires {new Date(preview.expires_at).toLocaleDateString()}.</p>
                        </div>
                    )}

                    {!loading && preview && status && status !== "pending" && (
                        <div data-testid="invite-already-handled">
                            <CheckCircle2 className="mx-auto text-[#06D6A0]" size={40} />
                            <h1 className="font-display font-extrabold text-3xl text-[#0B132B] mt-3">Invite {status}</h1>
                            <p className="text-[#4A5568] font-semibold mt-2">
                                {status === "accepted" ? "This invite has already been accepted." :
                                 status === "expired" ? "This invite expired. Ask for a new one." :
                                 "This invite has been cancelled."}
                            </p>
                            <Link to="/" className="btn-pop-primary inline-flex items-center gap-2 mt-5">Go home</Link>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
