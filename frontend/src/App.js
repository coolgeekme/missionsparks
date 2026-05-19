import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ParentDashboard from "./pages/ParentDashboard";
import MissionForm from "./pages/MissionForm";
import ParentLogs from "./pages/ParentLogs";
import StudentDashboard from "./pages/StudentDashboard";
import MissionDetail from "./pages/MissionDetail";
import { Toaster } from "./components/ui/sonner";
import "./App.css";

function RootRedirect() {
    const { user } = useAuth();
    if (user === null) return <div className="min-h-screen flex items-center justify-center text-[#4361EE] font-bold">Loading…</div>;
    if (!user) return <Navigate to="/login" replace />;
    return <Navigate to={user.role === "parent" ? "/parent" : "/student"} replace />;
}

export default function App() {
    return (
        <div className="App">
            <AuthProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<RootRedirect />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        <Route
                            path="/parent"
                            element={
                                <ProtectedRoute role="parent">
                                    <ParentDashboard />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/parent/missions/new"
                            element={
                                <ProtectedRoute role="parent">
                                    <MissionForm />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/parent/missions/:id/edit"
                            element={
                                <ProtectedRoute role="parent">
                                    <MissionForm />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/parent/logs"
                            element={
                                <ProtectedRoute role="parent">
                                    <ParentLogs />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/student"
                            element={
                                <ProtectedRoute role="student">
                                    <StudentDashboard />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/student/missions/:id"
                            element={
                                <ProtectedRoute role="student">
                                    <MissionDetail />
                                </ProtectedRoute>
                            }
                        />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                    <Toaster />
                </BrowserRouter>
            </AuthProvider>
        </div>
    );
}
