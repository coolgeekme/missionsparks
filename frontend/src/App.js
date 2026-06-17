import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ResearchProvider } from "./contexts/ResearchContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ParentDashboard from "./pages/ParentDashboard";
import MissionForm from "./pages/MissionForm";
import ParentLogs from "./pages/ParentLogs";
import StudentDashboard from "./pages/StudentDashboard";
import MissionDetail from "./pages/MissionDetail";
import GamePicker from "./pages/GamePicker";
import GamePlay from "./pages/GamePlay";
import MomentsTracker from "./pages/MomentsTracker";
import MomentsInsights from "./pages/MomentsInsights";
import StudentCheckIn from "./pages/StudentCheckIn";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Account from "./pages/Account";
import AuditLog from "./pages/AuditLog";
import Research from "./pages/Research";
import Landing from "./pages/Landing";
import Changelog from "./pages/Changelog";
import { Toaster } from "./components/ui/sonner";
import "./App.css";

function RootRedirect() {
    const { user } = useAuth();
    if (user === null) return <div className="min-h-screen flex items-center justify-center text-[#4361EE] font-bold">Loading…</div>;
    if (!user) return <Landing />;
    return <Navigate to={user.role === "parent" ? "/parent" : "/student"} replace />;
}

export default function App() {
    return (
        <div className="App">
            <AuthProvider>
                <ResearchProvider>
                    <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<RootRedirect />} />
                        <Route path="/changelog" element={<Changelog />} />
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
                        <Route
                            path="/student/play/:logId"
                            element={
                                <ProtectedRoute role="student">
                                    <GamePicker />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/student/play/:logId/:gameKey"
                            element={
                                <ProtectedRoute role="student">
                                    <GamePlay />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/parent/moments"
                            element={
                                <ProtectedRoute role="parent">
                                    <MomentsTracker />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/parent/moments/insights"
                            element={
                                <ProtectedRoute role="parent">
                                    <MomentsInsights />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/student/checkin"
                            element={
                                <ProtectedRoute role="student">
                                    <StudentCheckIn />
                                </ProtectedRoute>
                            }
                        />
                        <Route path="/privacy" element={<Privacy />} />
                        <Route path="/terms" element={<Terms />} />
                        <Route
                            path="/account"
                            element={
                                <ProtectedRoute>
                                    <Account />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/parent/audit"
                            element={
                                <ProtectedRoute role="parent">
                                    <AuditLog />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/parent/research"
                            element={
                                <ProtectedRoute role="parent">
                                    <Research />
                                </ProtectedRoute>
                            }
                        />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                    <Toaster />
                </BrowserRouter>
                </ResearchProvider>
            </AuthProvider>
        </div>
    );
}
