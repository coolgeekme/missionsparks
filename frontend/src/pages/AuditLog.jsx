import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api } from "../lib/api";
import { ArrowLeft, History } from "lucide-react";

const labelFor = (action) => {
    const m = {
        "auth.login": "🔑 Logged in",
        "auth.logout": "🚪 Logged out",
        "auth.register": "✨ Account created",
        "students.link": "🔗 Linked a student",
        "student.profile_update": "✍️ Updated student profile",
        "moment.create": "💛 Moment logged",
        "moment.delete": "🗑️ Moment deleted",
        "account.preferences_update": "⚙️ Updated preferences",
        "account.export": "📦 Exported data",
        "account.delete": "🔥 Account deleted",
    };
    return m[action] || action;
};

export default function AuditLog() {
    const [rows, setRows] = useState([]);
    const [err, setErr] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/audit?limit=200");
                setRows(data);
            } catch (e) {
                setErr(e.response?.data?.detail || e.message);
            }
        })();
    }, []);

    return (
        <div className="min-h-screen" data-testid="audit-page">
            <Navbar />
            <main className="max-w-3xl mx-auto p-6 md:p-10 space-y-4">
                <Link to="/account" className="inline-flex items-center gap-2 text-sm font-bold text-[#E4572E]" data-testid="audit-back">
                    <ArrowLeft size={16} /> Back to account
                </Link>
                <header className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-[#E8A33D]/30 text-[#8A6413] flex items-center justify-center">
                        <History />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286]">Activity log</p>
                        <h1 className="font-display font-extrabold text-3xl text-[#201D18]">Recent activity</h1>
                    </div>
                </header>

                {err && <p className="text-sm font-bold text-[#BC4B32]" data-testid="audit-error">{err}</p>}

                {rows.length === 0 ? (
                    <div className="mb-card p-8 text-center" data-testid="audit-empty">
                        <p className="text-[#6E675B] font-bold">No activity yet.</p>
                    </div>
                ) : (
                    <div className="mb-card p-2" data-testid="audit-list">
                        {rows.map((r) => (
                            <div key={r.id} className="px-4 py-3 border-b-2 border-[#E8E0D2] last:border-0" data-testid={`audit-row-${r.id}`}>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <p className="font-bold text-[#201D18]">{labelFor(r.action)}</p>
                                    <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286]">{new Date(r.timestamp).toLocaleString()}</p>
                                </div>
                                <p className="text-xs text-[#6E675B] font-semibold mt-1">
                                    {r.user_email} ({r.user_role})
                                    {r.target_type && <> · target: {r.target_type} {r.target_id?.slice(0, 8)}</>}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
