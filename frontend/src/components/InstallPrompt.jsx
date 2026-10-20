import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Smartphone, X } from "lucide-react";

const DISMISS_KEY = "ms_install_prompt_dismissed";

/**
 * Dismissible "add to home screen" nudge.
 * Only shows on a mobile browser, only if not already installed (standalone),
 * and only until dismissed. Links to the full step-by-step page.
 */
export default function InstallPrompt() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        const standalone =
            (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
            window.navigator.standalone === true;
        const dismissed = localStorage.getItem(DISMISS_KEY) === "1";
        const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
        if (standalone || dismissed || !isMobile) return;
        const t = setTimeout(() => setShow(true), 700);
        return () => clearTimeout(t);
    }, []);

    const dismiss = () => {
        localStorage.setItem(DISMISS_KEY, "1");
        setShow(false);
    };

    if (!show) return null;

    return (
        <section
            className="mb-card p-4 flex flex-col sm:flex-row sm:items-center gap-3 bg-[#FBF6EE]"
            data-testid="install-prompt"
        >
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="h-11 w-11 rounded-2xl bg-[#E4572E] flex items-center justify-center text-white shrink-0">
                    <Smartphone size={22} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#201D18] text-sm">Put MissionSparks on your home screen</p>
                    <p className="text-xs font-semibold text-[#6E675B] mt-0.5">
                        One tap to log a moment — no app store needed.
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <Link
                    to="/add-to-home-screen"
                    className="btn-pop-primary text-sm"
                    data-testid="install-prompt-how"
                >
                    Show me how
                </Link>
                <button
                    onClick={dismiss}
                    aria-label="Dismiss"
                    className="text-[#9A9286] hover:text-[#201D18] p-1"
                    data-testid="install-prompt-dismiss"
                >
                    <X size={18} />
                </button>
            </div>
        </section>
    );
}
