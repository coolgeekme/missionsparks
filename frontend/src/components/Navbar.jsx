import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { LogOut, Settings, Users, ChevronDown, Check, Plus } from "lucide-react";
import SparkMark from "./SparkMark";
import { useState } from "react";
import { toast } from "sonner";
import { formatApiErrorDetail } from "../lib/api";

export default function Navbar() {
    const { user, logout, switchFamily } = useAuth();
    const navigate = useNavigate();
    const [famOpen, setFamOpen] = useState(false);
    const [switching, setSwitching] = useState(false);

    const handleLogout = async () => {
        await logout();
        navigate("/login");
    };

    const handleSwitch = async (fid) => {
        if (fid === user.active_family_id) { setFamOpen(false); return; }
        setSwitching(true);
        try {
            await switchFamily(fid);
            toast.success("Switched family");
            setFamOpen(false);
        } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally { setSwitching(false); }
    };

    const isParent = user && user.id && user.role === "parent";
    const families = (user?.families) || [];
    const activeFamily = families.find((f) => f.id === user?.active_family_id) || families[0];

    return (
        <nav className="w-full bg-white border-b-2 border-[#E8E0D2]" data-testid="main-navbar">
            <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
                <Link to="/" className="flex items-center gap-2.5" data-testid="nav-logo">
                    <SparkMark size={30} />
                    <span className="hidden sm:inline font-display font-extrabold text-2xl text-[#201D18]">Mission<span className="text-[#E4572E]">Sparks</span></span>
                </Link>
                {user && user.id && (
                    <div className="flex items-center gap-2 sm:gap-3">
                        {isParent && families.length > 0 && (
                            <div className="relative">
                                <button
                                    onClick={() => setFamOpen((v) => !v)}
                                    disabled={switching}
                                    data-testid="nav-family-switcher"
                                    aria-label="Switch family"
                                    className="btn-pop-ghost flex items-center gap-2 max-w-[14rem]"
                                >
                                    <Users size={16} />
                                    <span className="hidden sm:inline font-bold text-sm truncate">{activeFamily?.name || "Family"}</span>
                                    {families.length > 1 && <ChevronDown size={14} />}
                                </button>
                                {famOpen && (
                                    <div className="absolute right-0 mt-2 w-72 bg-white border-2 border-[#E8E0D2] rounded-2xl shadow-lg z-40 overflow-hidden" data-testid="nav-family-dropdown">
                                        <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[#9A9286]">Your families</div>
                                        {families.map((f) => (
                                            <button
                                                key={f.id}
                                                onClick={() => handleSwitch(f.id)}
                                                className="w-full text-left px-4 py-3 hover:bg-[#F6F1E7] flex items-center justify-between"
                                                data-testid={`nav-family-${f.id}`}
                                            >
                                                <div>
                                                    <p className="font-bold text-[#201D18] text-sm">{f.name}</p>
                                                    <p className="text-xs text-[#6E675B] capitalize">{f.role.replace("_", "-")}</p>
                                                </div>
                                                {f.id === user.active_family_id && <Check size={16} className="text-[#3F8C5E]" />}
                                            </button>
                                        ))}
                                        <Link
                                            to="/family"
                                            onClick={() => setFamOpen(false)}
                                            className="block px-4 py-3 border-t-2 border-[#E8E0D2] font-bold text-sm text-[#E4572E] hover:bg-[#F6F1E7]"
                                            data-testid="nav-family-manage"
                                        >Manage families →</Link>
                                    </div>
                                )}
                            </div>
                        )}
                        <span className="hidden sm:inline text-sm font-bold text-[#6E675B]" data-testid="nav-user-name">
                            {user.name} · {user.role === "parent" ? "Parent" : "Student"}
                        </span>
                        {isParent && (
                            <Link to="/capture" className="btn-pop-primary flex items-center gap-2" data-testid="nav-quick-capture" aria-label="Quick log">
                                <Plus size={16} /> <span className="hidden sm:inline">Quick log</span>
                            </Link>
                        )}
                        <Link to="/account" className="btn-pop-ghost flex items-center gap-2" data-testid="nav-settings" aria-label="Settings">
                            <Settings size={16} /> <span className="hidden sm:inline">Settings</span>
                        </Link>
                        <button onClick={handleLogout} className="btn-pop-ghost flex items-center gap-2" data-testid="nav-logout" aria-label="Logout">
                            <LogOut size={16} /> <span className="hidden sm:inline">Logout</span>
                        </button>
                    </div>
                )}
            </div>
        </nav>
    );
}
