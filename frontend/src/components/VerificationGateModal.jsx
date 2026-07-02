import { useEffect, useRef, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { X, Loader2, Camera, RefreshCcw, Shield, Clock } from "lucide-react";

// Client-side JPEG compression — down-scale + re-encode to keep upload <2MB.
async function compressImage(file, maxDim = 1600, quality = 0.82) {
    const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
    });
    const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = dataUrl;
    });
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
        const scale = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Handles the 4 verification flows for mission completion.
 *
 * Modes:
 *   - trust        : renders nothing; caller submits directly.
 *   - parent_pin   : PIN keypad → issues a single-use token → onProceed({ parent_verify_token })
 *   - photo        : camera / file picker → onProceed({ photo_data })
 *   - async_review : friendly confirmation → onProceed({}); parent must approve later.
 */
export default function VerificationGateModal({
    open, mode, missionId, missionTitle, onClose, onProceed,
}) {
    const [pin, setPin] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [photoDataUrl, setPhotoDataUrl] = useState(null);
    const fileRef = useRef(null);

    useEffect(() => {
        if (!open) {
            setPin(""); setErr(""); setPhotoDataUrl(null); setBusy(false);
        }
    }, [open]);

    if (!open || !mode || mode === "trust") return null;

    const submitPin = async (e) => {
        e?.preventDefault?.();
        if (pin.length !== 4) { setErr("PIN must be 4 digits."); return; }
        setBusy(true); setErr("");
        try {
            const { data } = await api.post(`/missions/${missionId}/verify-pin`, { pin });
            onProceed?.({ parent_verify_token: data.token });
        } catch (e) {
            setErr(formatApiErrorDetail(e.response?.data?.detail) || e.message);
            setPin("");
        } finally { setBusy(false); }
    };

    const pickFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setErr(""); setBusy(true);
        try {
            const compressed = await compressImage(file);
            setPhotoDataUrl(compressed);
        } catch (e) {
            setErr("Couldn't read that photo. Try another one.");
        } finally { setBusy(false); }
    };

    const submitPhoto = async () => {
        if (!photoDataUrl) { setErr("Take or pick a photo first."); return; }
        onProceed?.({ photo_data: photoDataUrl });
    };

    const submitAsync = async () => {
        onProceed?.({});
    };

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={() => !busy && onClose?.()}
            data-testid="verification-gate-modal"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl border-2 border-[#E2E8F0] p-6 sm:p-8 max-w-md w-full"
            >
                <div className="flex items-start justify-between mb-2 gap-3">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#4361EE]">One more step</p>
                        <h2 className="font-display font-extrabold text-2xl text-[#0B132B] mt-0.5">
                            {mode === "parent_pin" && "Ask a grown-up"}
                            {mode === "photo" && "Show your work"}
                            {mode === "async_review" && "Ready for review?"}
                        </h2>
                    </div>
                    <button onClick={() => !busy && onClose?.()} className="text-[#A0AEC0] hover:text-[#0B132B]" data-testid="verification-close">
                        <X size={20} />
                    </button>
                </div>
                <p className="text-sm font-semibold text-[#4A5568] mb-5 truncate">Mission: <strong>{missionTitle}</strong></p>

                {mode === "parent_pin" && (
                    <form onSubmit={submitPin} data-testid="verification-pin-form">
                        <div className="flex items-center gap-2 text-sm font-semibold text-[#4A5568] mb-3">
                            <Shield size={14} className="text-[#4361EE]" />
                            A grown-up needs to type their 4-digit verify PIN.
                        </div>
                        <input
                            type="password"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoFocus
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                            className="w-full rounded-2xl border-2 border-[#E2E8F0] px-4 py-4 font-mono text-center text-3xl tracking-[1em] focus:border-[#4361EE] outline-none"
                            placeholder="••••"
                            maxLength={4}
                            data-testid="verification-pin-input"
                        />
                        {err && <p className="text-sm font-bold text-[#EF476F] mt-3" data-testid="verification-pin-error">{err}</p>}
                        <div className="flex gap-2 mt-4">
                            <button type="submit" disabled={busy || pin.length !== 4} className="btn-pop-primary flex-1 disabled:opacity-50" data-testid="verification-pin-submit">
                                {busy ? <Loader2 className="animate-spin" size={16} /> : "Verify"}
                            </button>
                            <button type="button" onClick={onClose} disabled={busy} className="btn-pop-ghost" data-testid="verification-pin-cancel">
                                Cancel
                            </button>
                        </div>
                    </form>
                )}

                {mode === "photo" && (
                    <div data-testid="verification-photo-panel">
                        <div className="flex items-center gap-2 text-sm font-semibold text-[#4A5568] mb-3">
                            <Camera size={14} className="text-[#4361EE]" />
                            Take a photo showing you're done — a grown-up can see it later.
                        </div>
                        {photoDataUrl ? (
                            <div className="text-center">
                                <img src={photoDataUrl} alt="preview" className="max-h-64 mx-auto rounded-2xl border-2 border-[#E2E8F0]" data-testid="verification-photo-preview" />
                                <button
                                    type="button"
                                    onClick={() => { setPhotoDataUrl(null); fileRef.current && (fileRef.current.value = ""); }}
                                    className="btn-pop-ghost text-xs mt-3 inline-flex items-center gap-1.5"
                                    data-testid="verification-photo-retake"
                                >
                                    <RefreshCcw size={12} /> Try a different photo
                                </button>
                            </div>
                        ) : (
                            <label
                                htmlFor="verification-photo-input"
                                className="block cursor-pointer rounded-2xl border-2 border-dashed border-[#4361EE]/40 bg-[#4361EE]/5 p-8 text-center hover:bg-[#4361EE]/10 transition-all"
                            >
                                <Camera size={32} className="mx-auto text-[#4361EE]" />
                                <p className="font-display font-extrabold text-base text-[#0B132B] mt-2">Tap to take/pick a photo</p>
                                <p className="text-xs font-semibold text-[#4A5568] mt-1">Photos stay in your family — never shared with AI.</p>
                            </label>
                        )}
                        <input
                            id="verification-photo-input"
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={pickFile}
                            className="hidden"
                            data-testid="verification-photo-input"
                        />
                        {err && <p className="text-sm font-bold text-[#EF476F] mt-3">{err}</p>}
                        <div className="flex gap-2 mt-4">
                            <button
                                type="button"
                                onClick={submitPhoto}
                                disabled={busy || !photoDataUrl}
                                className="btn-pop-primary flex-1 disabled:opacity-50"
                                data-testid="verification-photo-submit"
                            >
                                {busy ? <Loader2 className="animate-spin" size={16} /> : "Finish mission"}
                            </button>
                            <button type="button" onClick={onClose} disabled={busy} className="btn-pop-ghost">Cancel</button>
                        </div>
                    </div>
                )}

                {mode === "async_review" && (
                    <div data-testid="verification-async-panel">
                        <div className="rounded-2xl bg-[#4361EE]/5 border-2 border-[#4361EE]/20 p-4 mb-4">
                            <div className="flex items-start gap-2 text-sm font-semibold text-[#0B132B]">
                                <Clock size={16} className="text-[#4361EE] mt-0.5 flex-shrink-0" />
                                <div>
                                    <p>When you're ready, a grown-up will check your work and give you the spark.</p>
                                    <p className="text-xs font-semibold text-[#4A5568] mt-2">You can still write a reflection below.</p>
                                </div>
                            </div>
                        </div>
                        {err && <p className="text-sm font-bold text-[#EF476F] mb-3">{err}</p>}
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={submitAsync}
                                className="btn-pop-primary flex-1"
                                data-testid="verification-async-submit"
                            >
                                I'm ready — send for review
                            </button>
                            <button type="button" onClick={onClose} className="btn-pop-ghost">Cancel</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
