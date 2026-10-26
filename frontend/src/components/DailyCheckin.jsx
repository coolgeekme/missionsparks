import { useEffect, useState } from "react";
import { Pill, Moon, Utensils } from "lucide-react";
import { api } from "../lib/api";

const SLEEP_OPTIONS = [
    ["8plus", "8h+"],
    ["7", "7h"],
    ["6", "6h"],
    ["under6", "<6h"],
];

const MEALS = [
    ["ate_breakfast", "Breakfast"],
    ["ate_lunch", "Lunch"],
    ["ate_dinner", "Dinner"],
];

function Chip({ active, onClick, children, disabled }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`px-3 py-1.5 rounded-xl border-2 text-xs font-bold transition-all ${
                active
                    ? "bg-[#E4572E] border-[#E4572E] text-white"
                    : "bg-white border-[#E8E0D2] text-[#6E675B] hover:border-[#E4572E]"
            } ${disabled ? "opacity-60" : ""}`}
        >
            {children}
        </button>
    );
}

/**
 * Three taps a day, per kid. This is the baseline that makes "why was today
 * hard?" answerable — without a row for the calm days there is nothing to
 * compare the hard ones against.
 *
 * Medication is recorded, never interpreted. Nothing here gives advice.
 */
export default function DailyCheckin() {
    const [students, setStudents] = useState([]);
    const [rows, setRows] = useState({});
    const [busy, setBusy] = useState({});

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/students");
                setStudents(data);
                const entries = await Promise.all(
                    data.map(async (s) => {
                        try {
                            const r = await api.get(`/students/${s.id}/checkin`);
                            return [s.id, r.data.checkin || {}];
                        } catch {
                            return [s.id, {}];
                        }
                    })
                );
                setRows(Object.fromEntries(entries));
            } catch {
                /* the rest of the dashboard still works */
            }
        })();
    }, []);

    const save = async (sid, patch) => {
        setRows((prev) => ({ ...prev, [sid]: { ...(prev[sid] || {}), ...patch } }));
        setBusy((b) => ({ ...b, [sid]: true }));
        try {
            const { data } = await api.put(`/students/${sid}/checkin`, patch);
            setRows((prev) => ({ ...prev, [sid]: data.checkin || {} }));
        } catch {
            /* keep the optimistic value; the next tap retries */
        } finally {
            setBusy((b) => ({ ...b, [sid]: false }));
        }
    };

    if (!students.length) return null;

    return (
        <section className="mb-card p-5" data-testid="daily-checkin">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h2 className="font-display font-extrabold text-xl text-[#201D18]">Today&apos;s check-in</h2>
                <p className="text-xs font-semibold text-[#6E675B]">
                    Three taps. This is what makes &ldquo;why was today hard?&rdquo; answerable later.
                </p>
            </div>

            <div className="mt-4 space-y-4">
                {students.map((s) => {
                    const row = rows[s.id] || {};
                    const complete = row.sleep_bucket && (row.meds_taken !== null && row.meds_taken !== undefined || row.no_meds_today);
                    return (
                        <div key={s.id} className="border-t-2 border-[#E8E0D2] pt-3 first:border-t-0 first:pt-0" data-testid={`checkin-${s.id}`}>
                            <div className="flex items-center gap-2 mb-2">
                                <p className="font-bold text-[#201D18]">{s.name}</p>
                                {complete && <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#3F8C5E]">logged</span>}
                            </div>

                            <div className="grid sm:grid-cols-3 gap-3">
                                <div>
                                    <p className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-[#6E675B] mb-1">
                                        <Pill size={11} /> Meds
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        <Chip
                                            active={row.meds_taken === true}
                                            disabled={busy[s.id]}
                                            onClick={() => save(s.id, { meds_taken: true })}
                                        >
                                            {row.meds_taken === true ? `Taken ${row.meds_time || ""}`.trim() : "Taken"}
                                        </Chip>
                                        <Chip
                                            active={row.meds_taken === false}
                                            disabled={busy[s.id]}
                                            onClick={() => save(s.id, { meds_taken: false })}
                                        >
                                            Not yet
                                        </Chip>
                                        <Chip
                                            active={row.no_meds_today === true}
                                            disabled={busy[s.id]}
                                            onClick={() => save(s.id, { no_meds_today: true })}
                                        >
                                            No meds
                                        </Chip>
                                    </div>
                                </div>

                                <div>
                                    <p className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-[#6E675B] mb-1">
                                        <Moon size={11} /> Sleep
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {SLEEP_OPTIONS.map(([value, label]) => (
                                            <Chip
                                                key={value}
                                                active={row.sleep_bucket === value}
                                                disabled={busy[s.id]}
                                                onClick={() => save(s.id, { sleep_bucket: value })}
                                            >
                                                {label}
                                            </Chip>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <p className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-[#6E675B] mb-1">
                                        <Utensils size={11} /> Ate
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {MEALS.map(([key, label]) => (
                                            <Chip
                                                key={key}
                                                active={row[key] === true}
                                                disabled={busy[s.id]}
                                                onClick={() => save(s.id, { [key]: !row[key] })}
                                            >
                                                {label}
                                            </Chip>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
