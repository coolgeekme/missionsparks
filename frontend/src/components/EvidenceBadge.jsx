import { useState } from "react";
import { BookOpen, ExternalLink } from "lucide-react";
import { useResearch } from "../contexts/ResearchContext";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "./ui/popover";

/**
 * Small, unobtrusive book icon that opens a popover listing the citations
 * backing a piece of content. Parents see this on strategies, skills, games,
 * moment types, triggers, and AI-drafted missions. The student UI never
 * renders this component.
 *
 * Props:
 *   - citationIds: string[] — DB ids referencing /api/citations
 *   - label?: string — header text inside the popover (default "Backed by research")
 *   - testId?: string — data-testid for the trigger
 *   - size?: number — icon size (default 14)
 *   - tone?: "amber" | "indigo" | "muted" — visual tone
 */
export default function EvidenceBadge({
    citationIds = [],
    label = "Backed by research",
    testId,
    size = 14,
    tone = "amber",
}) {
    const { byId, ready } = useResearch();
    const [open, setOpen] = useState(false);

    if (!citationIds || citationIds.length === 0) return null;

    const items = citationIds
        .map((id) => byId[id])
        .filter(Boolean);

    if (ready && items.length === 0) return null;

    const toneClass =
        tone === "indigo"
            ? "text-[#E4572E] hover:bg-[#E4572E]/10 ring-[#E4572E]/30"
            : tone === "muted"
                ? "text-[#6E675B] hover:bg-[#E8E0D2] ring-[#E8E0D2]"
                : "text-[#8A6413] hover:bg-[#E8A33D]/30 ring-[#C98A2E]/40";

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ring-1 transition ${toneClass}`}
                    aria-label="View research backing"
                    data-testid={testId || "evidence-badge"}
                >
                    <BookOpen size={size} />
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">
                        {items.length || citationIds.length}
                    </span>
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="w-[min(22rem,90vw)] p-4 bg-white border-2 border-[#E8E0D2] rounded-2xl shadow-xl"
                data-testid="evidence-popover"
            >
                <div className="flex items-center gap-2 mb-3">
                    <BookOpen size={16} className="text-[#8A6413]" />
                    <h4 className="font-display font-extrabold text-sm text-[#201D18]">{label}</h4>
                </div>
                {!ready ? (
                    <p className="text-xs font-semibold text-[#6E675B]">Loading…</p>
                ) : (
                    <ul className="space-y-3 max-h-72 overflow-y-auto pr-1">
                        {items.map((c) => (
                            <li key={c.id} className="text-xs leading-snug" data-testid={`evidence-item-${c.key}`}>
                                <p className="font-bold text-[#201D18]">{c.title}</p>
                                <p className="text-[#6E675B] font-semibold mt-0.5">
                                    {c.authors} · {c.year} · <span className="italic">{c.source}</span>
                                </p>
                                <p className="text-[#6E675B] mt-1">{c.summary}</p>
                                {c.url && (
                                    <a
                                        href={c.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center gap-1 mt-1 text-[#E4572E] font-bold hover:underline"
                                    >
                                        Read source <ExternalLink size={10} />
                                    </a>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </PopoverContent>
        </Popover>
    );
}
