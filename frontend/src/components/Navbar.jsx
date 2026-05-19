import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Rocket, LogOut } from "lucide-react";

export default function Navbar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await logout();
        navigate("/login");
    };

    return (
        <nav className="w-full bg-white border-b-2 border-[#E2E8F0]" data-testid="main-navbar">
            <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                <Link to="/" className="flex items-center gap-2" data-testid="nav-logo">
                    <div className="h-10 w-10 rounded-2xl bg-[#4361EE] flex items-center justify-center text-white shadow-[0_4px_0_0_#3A53CC]">
                        <Rocket size={20} />
                    </div>
                    <span className="font-display font-extrabold text-2xl text-[#0B132B]">MissionBoard</span>
                </Link>
                {user && user.id && (
                    <div className="flex items-center gap-3">
                        <span className="hidden sm:inline text-sm font-bold text-[#4A5568]" data-testid="nav-user-name">
                            {user.name} · {user.role === "parent" ? "Parent" : "Student"}
                        </span>
                        <button onClick={handleLogout} className="btn-pop-ghost flex items-center gap-2" data-testid="nav-logout">
                            <LogOut size={16} /> Logout
                        </button>
                    </div>
                )}
            </div>
        </nav>
    );
}
