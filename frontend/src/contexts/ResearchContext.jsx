import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";

/**
 * Loads the full citation library once per session for any authenticated user
 * and exposes a quick id→citation lookup. The student UI never surfaces the
 * library; this is parent/therapist facing.
 */
const ResearchContext = createContext({ citations: [], byId: {}, ready: false, refresh: () => {} });

export function ResearchProvider({ children }) {
    const { user } = useAuth();
    const [citations, setCitations] = useState([]);
    const [ready, setReady] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const { data } = await api.get("/citations");
            setCitations(data);
            setReady(true);
        } catch {
            setCitations([]);
            setReady(true);
        }
    }, []);

    useEffect(() => {
        if (user && user.id) {
            refresh();
        } else {
            setCitations([]);
            setReady(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, refresh]);

    const byId = useMemo(() => Object.fromEntries(citations.map((c) => [c.id, c])), [citations]);

    return (
        <ResearchContext.Provider value={{ citations, byId, ready, refresh }}>
            {children}
        </ResearchContext.Provider>
    );
}

export const useResearch = () => useContext(ResearchContext);
