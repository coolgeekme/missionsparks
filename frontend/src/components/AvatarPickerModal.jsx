import { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { X, Sparkles, Loader2 } from "lucide-react";

// Mirror of backend AVATAR_COLOR_PALETTE
const COLOR_GRADIENTS = {
    indigo: "from-[#4361EE] to-[#06D6A0]",
    emerald: "from-[#06D6A0] to-[#118AB2]",
    pink: "from-[#EF476F] to-[#FFD166]",
    amber: "from-[#FFD166] to-[#EF476F]",
    violet: "from-[#7B2CBF] to-[#4361EE]",
    teal: "from-[#118AB2] to-[#06D6A0]",
    rose: "from-[#FB7185] to-[#F472B6]",
    sky: "from-[#38BDF8] to-[#4361EE]",
};

export default function AvatarPickerModal({ open, onClose, initialName }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [emojiPalette, setEmojiPalette] = useState([]);
    const [colorPalette, setColorPalette] = useState([]);
    const [emoji, setEmoji] = useState(null);
    const [color, setColor] = useState("indigo");

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        (async () => {
            try {
                const { data } = await api.get("/me/avatar");
                setEmojiPalette(data.emoji_palette || []);
                setColorPalette(data.color_palette || []);
                setEmoji(data.emoji || null);
                setColor(data.color || "indigo");
            } catch (e) {
                toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
            } finally { setLoading(false); }
        })();
    }, [open]);

    if (!open) return null;

    const initial = (initialName || "?")[0].toUpperCase();
    const gradient = COLOR_GRADIENTS[color] || COLOR_GRADIENTS.indigo;

    const save = async () => {
        setSaving(true);
        try {
            await api.put("/me/avatar", { emoji: emoji || "", color });
            toast.success("Tile updated!");
            onClose?.(true);
        } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally { setSaving(false); }
    };

    return (
        <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
            onClick={() => !saving && onClose?.(false)}
            data-testid="avatar-picker-modal"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl border-2 border-[#E2E8F0] p-6 sm:p-8 max-w-md w-full"
            >
                <div className="flex items-center justify-between mb-1">
                    <h2 className="font-display font-extrabold text-2xl text-[#0B132B] flex items-center gap-2">
                        <Sparkles size={20} className="text-[#4361EE]" /> My tile
                    </h2>
                    <button onClick={() => onClose?.(false)} className="text-[#A0AEC0] hover:text-[#0B132B]" data-testid="avatar-picker-close">
                        <X size={20} />
                    </button>
                </div>
                <p className="text-sm font-semibold text-[#4A5568] mb-4">Make it yours.</p>

                {loading ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#4361EE]" size={28} /></div>
                ) : (
                    <>
                        {/* Preview */}
                        <div className="flex justify-center mb-5">
                            <div className={`h-24 w-24 rounded-3xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center text-5xl font-extrabold shadow-lg`} data-testid="avatar-preview">
                                {emoji || initial}
                            </div>
                        </div>

                        {/* Emoji palette */}
                        <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0] mb-2">Pick an icon</p>
                        <div className="grid grid-cols-8 gap-2 mb-5" data-testid="avatar-emoji-grid">
                            <button
                                key="initial"
                                onClick={() => setEmoji(null)}
                                className={`h-10 w-10 rounded-2xl border-2 flex items-center justify-center font-extrabold text-sm transition-all ${!emoji ? "border-[#4361EE] bg-[#4361EE]/10" : "border-[#E2E8F0] hover:border-[#A0AEC0]"}`}
                                data-testid="avatar-emoji-initial"
                                aria-label="Use my initial"
                            >{initial}</button>
                            {emojiPalette.map((e) => (
                                <button
                                    key={e}
                                    onClick={() => setEmoji(e)}
                                    className={`h-10 w-10 rounded-2xl border-2 flex items-center justify-center text-xl transition-all ${emoji === e ? "border-[#4361EE] bg-[#4361EE]/10" : "border-[#E2E8F0] hover:border-[#A0AEC0]"}`}
                                    data-testid={`avatar-emoji-${e}`}
                                >{e}</button>
                            ))}
                        </div>

                        {/* Color palette */}
                        <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0] mb-2">Pick a color</p>
                        <div className="grid grid-cols-8 gap-2 mb-6" data-testid="avatar-color-grid">
                            {colorPalette.map((c) => (
                                <button
                                    key={c}
                                    onClick={() => setColor(c)}
                                    className={`h-10 w-10 rounded-2xl border-2 bg-gradient-to-br ${COLOR_GRADIENTS[c] || ""} transition-all ${color === c ? "ring-2 ring-[#0B132B] ring-offset-2" : "border-transparent"}`}
                                    aria-label={c}
                                    data-testid={`avatar-color-${c}`}
                                />
                            ))}
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={save}
                                disabled={saving}
                                className="btn-pop-primary flex-1 disabled:opacity-50"
                                data-testid="avatar-save"
                            >{saving ? "Saving…" : "Save my tile"}</button>
                            <button
                                onClick={() => onClose?.(false)}
                                disabled={saving}
                                className="btn-pop-ghost"
                                data-testid="avatar-cancel"
                            >Cancel</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
