import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, formatApiErrorDetail } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null); // null = checking, false = guest, object = user
    const [error, setError] = useState("");

    const refresh = useCallback(async () => {
        try {
            const { data } = await api.get("/auth/me");
            setUser(data);
            return data;
        } catch {
            setUser(false);
            return null;
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const login = async (email, password) => {
        setError("");
        try {
            const { data } = await api.post("/auth/login", { email, password });
            setUser(data);
            return data;
        } catch (e) {
            const msg = formatApiErrorDetail(e.response?.data?.detail) || e.message;
            setError(msg);
            throw new Error(msg);
        }
    };

    const register = async (payload) => {
        setError("");
        try {
            const { data } = await api.post("/auth/register", payload);
            setUser(data);
            return data;
        } catch (e) {
            const msg = formatApiErrorDetail(e.response?.data?.detail) || e.message;
            setError(msg);
            throw new Error(msg);
        }
    };

    const logout = async () => {
        try {
            await api.post("/auth/logout");
        } catch { /* noop */ }
        setUser(false);
    };

    const switchFamily = useCallback(async (familyId) => {
        await api.put(`/families/${familyId}/active`);
        return await refresh();
    }, [refresh]);

    return (
        <AuthContext.Provider value={{ user, error, login, register, logout, refresh, switchFamily }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
