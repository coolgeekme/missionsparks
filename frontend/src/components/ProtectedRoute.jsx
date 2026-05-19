import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children, role }) {
    const { user } = useAuth();
    if (user === null) {
        return (
            <div className="min-h-screen flex items-center justify-center" data-testid="auth-loading">
                <div className="text-[#4361EE] font-bold animate-pulse">Loading…</div>
            </div>
        );
    }
    if (!user) return <Navigate to="/login" replace />;
    if (role && user.role !== role) {
        return <Navigate to={user.role === "parent" ? "/parent" : "/student"} replace />;
    }
    return children;
}
