import { api } from "./api";

// VAPID base64url → Uint8Array (browsers need it as a typed array).
function urlBase64ToUint8Array(b64) {
    const padding = "=".repeat((4 - (b64.length % 4)) % 4);
    const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
}

export function pushCapabilities() {
    if (typeof window === "undefined") return { supported: false, reason: "no-window" };
    if (!("serviceWorker" in navigator)) return { supported: false, reason: "no-sw" };
    if (!("PushManager" in window)) return { supported: false, reason: "no-push" };
    if (!("Notification" in window)) return { supported: false, reason: "no-notification-api" };
    // iOS Safari requires PWA install (standalone display-mode) before push works.
    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
        || window.navigator.standalone === true;
    if (isIOS && !isStandalone) {
        return { supported: false, reason: "ios-needs-install" };
    }
    return { supported: true, reason: "ok" };
}

let _swReg = null;
export async function ensureServiceWorker() {
    if (_swReg) return _swReg;
    if (!("serviceWorker" in navigator)) return null;
    _swReg = await navigator.serviceWorker.register("/sw.js");
    // Wait until the SW is really ready before returning.
    await navigator.serviceWorker.ready;
    return _swReg;
}

export async function getCurrentSubscription() {
    const reg = await ensureServiceWorker();
    if (!reg) return null;
    return reg.pushManager.getSubscription();
}

export async function subscribeToPush() {
    const cap = pushCapabilities();
    if (!cap.supported) throw new Error(cap.reason);
    const reg = await ensureServiceWorker();
    if (!reg) throw new Error("no-sw-registration");

    // Ask the browser for a permission grant. MUST be inside a user-gesture call chain.
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("permission-denied");

    // Get the VAPID public key from our backend
    const { data } = await api.get("/push/vapid-public-key");
    const applicationServerKey = urlBase64ToUint8Array(data.public_key);

    const existing = await reg.pushManager.getSubscription();
    if (existing) {
        // Re-sync with backend (in case DB was reset)
        await postSubscription(existing);
        return existing;
    }

    const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
    });
    await postSubscription(sub);
    return sub;
}

async function postSubscription(sub) {
    const json = sub.toJSON();
    await api.post("/push/subscribe", {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
}

export async function unsubscribeFromPush() {
    const sub = await getCurrentSubscription();
    if (!sub) return { ok: true, removed: 0 };
    try {
        await api.post("/push/unsubscribe", { endpoint: sub.endpoint });
    } catch { /* still try to drop the browser subscription */ }
    await sub.unsubscribe();
    return { ok: true, removed: 1 };
}

export async function sendTestPush() {
    return api.post("/push/test");
}
