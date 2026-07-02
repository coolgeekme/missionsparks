import { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import {
    Bell, BellOff, Smartphone, CheckCircle2, AlertTriangle, Loader2, Info,
} from "lucide-react";
import {
    pushCapabilities, subscribeToPush, unsubscribeFromPush, sendTestPush,
    getCurrentSubscription,
} from "../lib/push";

// Human labels + descriptions for each preference key.
const PREF_ROWS = {
    parent: [
        ["parent_streak_at_risk", "Streak at risk", "6pm ping if your kid hasn't done today's missions yet."],
        ["parent_kid_completed", "Kid finished today", "When your kid completes all of today's missions."],
        ["parent_pending_review", "Awaiting your review", "When your kid submits a mission that needs your approval."],
        ["parent_coparent_activity", "Co-parent activity", "When another parent adds a mission or grants a freeze."],
        ["parent_digest_ready", "Digest ready", "A ping alongside your daily/weekly digest email."],
    ],
    kid: [
        ["kid_missions_morning", "Morning missions", "A morning ping so I don't forget today's missions."],
        ["kid_streak_milestone", "Streak wins", "Celebrate every 3, 5, 7, 10, 14, 21, 30, 50, 100-day streak."],
        ["kid_pack_unlocked", "New unlocks", "When I unlock the Kid Studio or a new pack."],
    ],
};

export default function NotificationSettingsPanel({ role }) {
    const [cap] = useState(() => pushCapabilities());
    const [prefs, setPrefs] = useState(null);
    const [deviceCount, setDeviceCount] = useState(0);
    const [busy, setBusy] = useState(false);
    const [subscribed, setSubscribed] = useState(false);

    const refresh = async () => {
        try {
            const { data } = await api.get("/me/notification-prefs");
            setPrefs(data.prefs);
            setDeviceCount(data.device_count);
            const sub = await getCurrentSubscription();
            setSubscribed(!!sub);
        } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        }
    };

    useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

    const enable = async () => {
        setBusy(true);
        try {
            await subscribeToPush();
            toast.success("Notifications turned on 🔔");
            await refresh();
        } catch (e) {
            const map = {
                "permission-denied": "You said no to notifications. Enable them in your browser settings and try again.",
                "ios-needs-install": "Add MissionSparks to your Home Screen first (Share → Add to Home Screen), then reopen from there.",
                "no-sw": "Your browser doesn't support service workers.",
                "no-push": "Your browser doesn't support push notifications.",
                "no-notification-api": "Your browser doesn't support notifications.",
            };
            toast.error(map[e.message] || (e.response?.data?.detail || e.message));
        } finally { setBusy(false); }
    };

    const disable = async () => {
        setBusy(true);
        try {
            await unsubscribeFromPush();
            await api.put("/me/notification-prefs", { enabled: false });
            toast.success("Notifications turned off on this device");
            await refresh();
        } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally { setBusy(false); }
    };

    const sendTest = async () => {
        setBusy(true);
        try {
            const { data } = await sendTestPush();
            toast.success(data.sent > 0 ? `Sent to ${data.sent} device${data.sent === 1 ? "" : "s"} — check your notifications` : `No devices reached (${data.reason || "unknown"}).`);
        } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally { setBusy(false); }
    };

    const setPref = async (key, val) => {
        // Optimistic update
        const next = { ...prefs, [key]: val };
        setPrefs(next);
        try {
            await api.put("/me/notification-prefs", { [key]: val });
        } catch (e) {
            setPrefs(prefs);
            toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        }
    };

    if (!prefs) {
        return (
            <div className="mb-card p-6 flex items-center gap-2 text-sm font-semibold text-[#4A5568]" data-testid="notification-panel-loading">
                <Loader2 className="animate-spin text-[#4361EE]" size={16} /> Loading…
            </div>
        );
    }

    const rows = PREF_ROWS[role === "student" ? "kid" : "parent"] || [];
    const masterOn = prefs.enabled && subscribed;

    return (
        <section className="mb-card p-6" data-testid="notification-settings-panel">
            <div className="flex items-start gap-3 mb-4">
                <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${masterOn ? "bg-[#4361EE]/15 text-[#4361EE]" : "bg-[#F8FAFC] text-[#A0AEC0]"}`}>
                    {masterOn ? <Bell size={22} /> : <BellOff size={22} />}
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className="font-display font-bold text-xl text-[#0B132B]">Push notifications</h2>
                    <p className="text-sm font-semibold text-[#4A5568] mt-1">
                        Get a heads-up when things happen — even if the app isn't open.
                        {deviceCount > 0 && (
                            <span className="ml-1 inline-flex items-center gap-1 text-[#4361EE]">
                                <Smartphone size={12} /> {deviceCount} device{deviceCount === 1 ? "" : "s"} subscribed
                            </span>
                        )}
                    </p>
                </div>
            </div>

            {!cap.supported ? (
                <div className="rounded-2xl bg-[#FFD166]/15 border-2 border-[#FFD166] p-4 flex items-start gap-2" data-testid="notification-unsupported">
                    <AlertTriangle size={16} className="text-[#876200] flex-shrink-0 mt-0.5" />
                    <div className="text-sm font-semibold text-[#0B132B]">
                        {cap.reason === "ios-needs-install" && (
                            <>
                                <strong>Almost there!</strong> On iPhone, add MissionSparks to your Home Screen first.
                                Tap the <span className="font-mono">Share</span> button in Safari → <em>Add to Home Screen</em>.
                                Then open the app from your Home Screen and come back to this page.
                            </>
                        )}
                        {cap.reason !== "ios-needs-install" && (
                            <>Your browser doesn't support push notifications yet. Try Chrome, Edge, Firefox, or Safari on macOS/iOS 16.4+.</>
                        )}
                    </div>
                </div>
            ) : (
                <>
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        {subscribed ? (
                            <>
                                <span className="mb-chip bg-[#06D6A0]/15 text-[#057a5b]" data-testid="notification-subscribed-chip">
                                    <CheckCircle2 size={12} className="inline mr-1" /> This device is subscribed
                                </span>
                                <button
                                    onClick={sendTest}
                                    disabled={busy}
                                    className="btn-pop-ghost text-sm disabled:opacity-50"
                                    data-testid="notification-test-btn"
                                >
                                    {busy ? "…" : "Send me a test"}
                                </button>
                                <button
                                    onClick={disable}
                                    disabled={busy}
                                    className="text-sm font-bold text-[#EF476F] hover:underline"
                                    data-testid="notification-disable-btn"
                                >
                                    Turn off on this device
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={enable}
                                disabled={busy}
                                className="btn-pop-primary text-sm inline-flex items-center gap-2 disabled:opacity-50"
                                data-testid="notification-enable-btn"
                            >
                                <Bell size={14} /> {busy ? "Turning on…" : "Turn on notifications"}
                            </button>
                        )}
                    </div>

                    {subscribed && (
                        <>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#A0AEC0] mb-2">What to notify me about</p>
                            <ul className="space-y-2" data-testid="notification-prefs-list">
                                {rows.map(([key, label, desc]) => (
                                    <li key={key} className="flex items-start justify-between gap-3 rounded-2xl border-2 border-[#E2E8F0] bg-white p-3">
                                        <div className="min-w-0">
                                            <p className="font-display font-bold text-sm text-[#0B132B]">{label}</p>
                                            <p className="text-xs font-semibold text-[#4A5568] mt-0.5">{desc}</p>
                                        </div>
                                        <label className="inline-flex items-center cursor-pointer flex-shrink-0">
                                            <input
                                                type="checkbox"
                                                checked={!!prefs[key]}
                                                onChange={(e) => setPref(key, e.target.checked)}
                                                className="sr-only peer"
                                                data-testid={`notification-pref-${key}`}
                                            />
                                            <div className="relative w-10 h-6 bg-[#E2E8F0] rounded-full peer peer-focus:outline-none peer-checked:bg-[#4361EE] transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
                                        </label>
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-3 text-xs font-semibold text-[#A0AEC0] flex items-start gap-1.5">
                                <Info size={12} className="mt-0.5 flex-shrink-0" />
                                Notifications work best when MissionSparks is installed on your home screen.
                                On iPhone: Share → Add to Home Screen. On Android/Chrome: three-dot menu → Install app.
                            </p>
                        </>
                    )}
                </>
            )}
        </section>
    );
}
