import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, API } from "../lib/api";
import { ArrowLeft, Download, TrendingUp, BarChart3, Activity, Link2 } from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    LineChart, Line, CartesianGrid, Legend,
} from "recharts";

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hourLabel = (h) => (h === 0 ? "12 AM" : h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`);
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => hourLabel(i));
// The browser's own zone — same source toLocaleString() uses, so the charts
// and the moment list can never disagree.
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const CAT_COLORS = {
    Challenging: "#E4572E",
    Positive: "#3F8C5E",
    Neutral: "#E8A33D",
    Other: "#B7A99A",
};

const TONE_BAR = {
    watch: "border-l-[#E8A33D]",
    good: "border-l-[#3F8C5E]",
    neutral: "border-l-[#C9BFAE]",
};

/**
 * One plain-English finding. The number is the hook, the sentence is the point —
 * a parent should be able to read the row and know what to do without parsing
 * an axis.
 */
function FindingCard({ f }) {
    return (
        <div
            className={`mb-card p-4 border-l-4 ${TONE_BAR[f.tone] || TONE_BAR.neutral}`}
            data-testid={`finding-${f.kind}`}
        >
            <p className="font-display font-extrabold text-3xl text-[#201D18] leading-none tracking-tight">
                {f.value}
            </p>
            <p className="font-bold text-sm text-[#201D18] mt-2 leading-snug">{f.title}</p>
            <p className="text-xs font-semibold text-[#6E675B] mt-1 leading-relaxed">{f.detail}</p>
        </div>
    );
}

export default function MomentsInsights() {
    const [students, setStudents] = useState([]);
    const [selected, setSelected] = useState(null);
    const [days, setDays] = useState(30);
    const [granularity, setGranularity] = useState("daily");
    const [insights, setInsights] = useState(null);
    const [catalog, setCatalog] = useState({ moment_types: [], triggers: [] });

    const typeMap = useMemo(() => Object.fromEntries(catalog.moment_types.map((t) => [t.key, t])), [catalog]);
    const trigMap = useMemo(() => Object.fromEntries(catalog.triggers.map((t) => [t.key, t])), [catalog]);

    useEffect(() => {
        (async () => {
            const [stu, cat] = await Promise.all([api.get("/students"), api.get("/moments/catalog")]);
            setStudents(stu.data);
            setCatalog(cat.data);
            if (stu.data[0]) setSelected(stu.data[0]);
        })();
    }, []);

    useEffect(() => {
        if (!selected) return;
        (async () => {
            const { data } = await api.get("/moments/insights", { params: { student_id: selected.id, days, tz: TZ } });
            setInsights(data);
        })();
    }, [selected, days]);

    const exportCsv = () => {
        const params = new URLSearchParams({ tz: TZ });
        if (selected) params.set("student_id", selected.id);
        const url = `${API}/moments/export.csv?${params.toString()}`;
        fetch(url, { credentials: "include" })
            .then((r) => r.blob())
            .then((blob) => {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `moments_${selected?.name || "all"}_${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
            });
    };

    const labelType = (k) => (typeMap[k] ? `${typeMap[k].emoji} ${typeMap[k].label}` : k);
    const labelTrig = (k) => (trigMap[k] ? `${trigMap[k].emoji} ${trigMap[k].label}` : k);

    const topTypeData = (insights?.top_types || []).map((x) => ({ name: labelType(x.key), value: x.count }));
    const topTriggerData = (insights?.top_triggers || []).map((x) => ({ name: labelTrig(x.key), value: x.count }));
    const hourData = (insights?.by_hour || []).map((v, i) => ({ name: HOUR_LABELS[i], value: v }));
    const dowData = (insights?.by_dow || []).map((v, i) => ({ name: DOW_LABELS[i], value: v }));

    const dailyData = (insights?.daily_counts || []).map((d) => ({ name: d.date.slice(5), value: d.count }));
    const weeklyCountData = (insights?.weekly_counts || []).map((w) => ({ name: w.week.slice(5), value: w.count }));
    const freqData = granularity === "daily" ? dailyData : weeklyCountData;

    const dailyIntensityData = (insights?.daily_intensity || []).map((d) => ({ name: d.date.slice(5), avg: d.avg }));
    const weeklyIntensityData = (insights?.weekly_intensity || []).map((w) => ({ name: w.week.slice(5), avg: w.avg }));
    const severityData = granularity === "daily" ? dailyIntensityData : weeklyIntensityData;

    // trigger → behavior correlation (valence category split, ranked by volume)
    const corrData = useMemo(() => {
        const t2c = insights?.trigger_to_category || {};
        return Object.entries(t2c)
            .map(([trig, cats]) => ({
                name: labelTrig(trig),
                Challenging: cats.challenging || 0,
                Positive: cats.positive || 0,
                Neutral: cats.neutral || 0,
                Other: cats.other || 0,
                total: (cats.challenging || 0) + (cats.positive || 0) + (cats.neutral || 0) + (cats.other || 0),
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 8);
    }, [insights]);

    // trigger → specific behavior co-occurrence rows
    const coRows = useMemo(() => {
        if (!insights?.trigger_to_type) return [];
        const out = [];
        for (const [trig, typeCounts] of Object.entries(insights.trigger_to_type)) {
            for (const [type, count] of Object.entries(typeCounts)) {
                out.push({ trig, type, count });
            }
        }
        return out.sort((a, b) => b.count - a.count).slice(0, 15);
    }, [insights]);

    return (
        <div className="min-h-screen" data-testid="moments-insights-page">
            <Navbar />
            <main className="max-w-6xl mx-auto p-6 md:p-10 space-y-6">
                <Link to="/parent/moments" className="inline-flex items-center gap-2 text-sm font-bold text-[#E4572E]" data-testid="insights-back">
                    <ArrowLeft size={16} /> Back to moments
                </Link>
                <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286]">Patterns & insights</p>
                        <h1 className="font-display font-extrabold text-4xl sm:text-5xl text-[#201D18] mt-1">What the data says</h1>
                        <p className="text-[#6E675B] font-semibold mt-2">A snapshot to guide your next plan.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex rounded-xl border-2 border-[#E8E0D2] overflow-hidden" data-testid="insights-granularity">
                            {["daily", "weekly"].map((g) => (
                                <button key={g} onClick={() => setGranularity(g)}
                                    className={`px-3 py-2 text-sm font-bold capitalize ${granularity === g ? "bg-[#E4572E] text-white" : "bg-white text-[#6E675B]"}`}>
                                    {g}
                                </button>
                            ))}
                        </div>
                        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="mb-input max-w-[10rem]" data-testid="insights-range">
                            <option value={7}>Last 7 days</option>
                            <option value={14}>Last 14 days</option>
                            <option value={30}>Last 30 days</option>
                            <option value={60}>Last 60 days</option>
                            <option value={90}>Last 90 days</option>
                        </select>
                        <button onClick={exportCsv} className="btn-pop-ghost flex items-center gap-2" data-testid="insights-export-csv">
                            <Download size={16} /> Export CSV
                        </button>
                    </div>
                </header>

                {students.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                        {students.map((s) => (
                            <button key={s.id} onClick={() => setSelected(s)}
                                className={`mb-chip border-2 ${selected?.id === s.id ? "bg-[#E4572E] text-white border-[#E4572E]" : "bg-white border-[#E8E0D2]"}`}
                                data-testid={`insights-student-${s.id}`}
                            >🚀 {s.name}</button>
                        ))}
                    </div>
                )}

                {!insights ? (
                    <div className="mb-card p-8 text-center"><p className="text-[#6E675B] font-bold animate-pulse">Loading…</p></div>
                ) : insights.total === 0 ? (
                    <div className="mb-card p-10 text-center" data-testid="insights-empty">
                        <p className="font-display font-bold text-2xl text-[#201D18]">No moments yet in this window</p>
                        <p className="text-[#6E675B] font-semibold mt-2">Log a few moments to start seeing patterns here.</p>
                    </div>
                ) : (
                    <>
                        {(insights.findings || []).length > 0 ? (
                            <section data-testid="insights-findings">
                                <div className="flex items-center gap-2 mb-2">
                                    <h2 className="font-display font-extrabold text-2xl text-[#201D18]">What the data says</h2>
                                </div>
                                <p className="text-sm font-semibold text-[#6E675B] mb-3">
                                    Plain readings of the last {days} days — strongest signals first.
                                </p>
                                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {insights.findings.map((f) => <FindingCard key={f.kind} f={f} />)}
                                </div>
                            </section>
                        ) : (
                            <div className="mb-card p-5" data-testid="insights-not-enough">
                                <p className="font-bold text-[#201D18]">Not enough data to find a pattern yet</p>
                                <p className="text-sm font-semibold text-[#6E675B] mt-1">
                                    Log a handful more moments and this fills in — it needs a few in the same
                                    time of day before it will call something a pattern.
                                </p>
                            </div>
                        )}

                        <div className="grid sm:grid-cols-3 gap-4">
                            <Stat label="Moments logged" value={insights.total} />
                            <Stat label="Unique trigger types" value={Object.keys(insights.counts_by_trigger).length} />
                            <Stat label="Most active hour" value={
                                (() => {
                                    const max = Math.max(...insights.by_hour);
                                    if (max === 0) return "—";
                                    const idx = insights.by_hour.indexOf(max);
                                    return hourLabel(idx);
                                })()
                            } />
                        </div>

                        <ChartCard title={`Frequency (${granularity})`} icon={<TrendingUp size={18} />} testid="chart-trend">
                            <p className="text-sm font-semibold text-[#6E675B] mb-3">
                                How often moments get logged. A spike day is worth a second look — something
                                happened that day.
                            </p>
                            <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={freqData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D2" />
                                    <XAxis dataKey="name" interval={Math.max(0, Math.floor(freqData.length / 12) - 1)} />
                                    <YAxis allowDecimals={false} />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="value" name="Moments" stroke="#E4572E" strokeWidth={3} dot={{ r: 3 }} connectNulls={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <ChartCard title={`Severity trend (${granularity})`} icon={<Activity size={18} />} testid="chart-severity">
                            <p className="text-sm font-semibold text-[#6E675B] mb-3">Average intensity (1–5) over time. A falling line means behaviors are getting milder.</p>
                            <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={severityData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D2" />
                                    <XAxis dataKey="name" interval={Math.max(0, Math.floor(severityData.length / 12) - 1)} />
                                    <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="avg" name="Avg intensity" stroke="#3F8C5E" strokeWidth={3} dot={{ r: 3 }} connectNulls={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <ChartCard title="Trigger → behavior correlation" icon={<Link2 size={18} />} testid="chart-correlation">
                            <p className="text-sm font-semibold text-[#6E675B] mb-3">When this trigger happens, what kind of behavior follows — challenging, positive, or neutral.</p>
                            {corrData.length === 0 ? (
                                <p className="text-sm font-bold text-[#9A9286]">Not enough data yet.</p>
                            ) : (
                                <ResponsiveContainer width="100%" height={Math.max(200, corrData.length * 40)}>
                                    <BarChart data={corrData} layout="vertical" margin={{ left: 80 }}>
                                        <XAxis type="number" allowDecimals={false} />
                                        <YAxis dataKey="name" type="category" width={140} />
                                        <Tooltip />
                                        <Legend />
                                        <Bar dataKey="Challenging" stackId="a" fill={CAT_COLORS.Challenging} />
                                        <Bar dataKey="Positive" stackId="a" fill={CAT_COLORS.Positive} />
                                        <Bar dataKey="Neutral" stackId="a" fill={CAT_COLORS.Neutral} />
                                        <Bar dataKey="Other" stackId="a" fill={CAT_COLORS.Other} radius={[0, 8, 8, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>

                        <ChartCard title="Top triggers" icon={<TrendingUp size={18} />} testid="chart-top-triggers">
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={topTriggerData} layout="vertical" margin={{ left: 80 }}>
                                    <XAxis type="number" allowDecimals={false} />
                                    <YAxis dataKey="name" type="category" width={140} />
                                    <Tooltip />
                                    <Bar dataKey="value" fill="#E4572E" radius={[0, 8, 8, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <ChartCard title="Top moment types" icon={<BarChart3 size={18} />} testid="chart-top-types">
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={topTypeData} layout="vertical" margin={{ left: 80 }}>
                                    <XAxis type="number" allowDecimals={false} />
                                    <YAxis dataKey="name" type="category" width={160} />
                                    <Tooltip />
                                    <Bar dataKey="value" fill="#BC4B32" radius={[0, 8, 8, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <div className="grid lg:grid-cols-2 gap-4">
                            <ChartCard title="When moments happen (your local time)" testid="chart-by-hour">
                                <p className="text-sm font-semibold text-[#6E675B] mb-3">
                                    Darker bars mean more moments. The flat stretches are the calm parts of
                                    the day — worth protecting.
                                </p>
                                {(() => {
                                    const maxH = Math.max(...insights.by_hour, 1);
                                    const peak = insights.by_hour.indexOf(maxH);
                                    return (
                                        <>
                                            <div className="flex items-end gap-[3px]" data-testid="hour-strip">
                                                {insights.by_hour.map((v, i) => {
                                                    const pct = v / maxH;
                                                    return (
                                                        <div key={i} className="flex-1">
                                                            <div
                                                                className="rounded-md"
                                                                style={{
                                                                    height: `${16 + pct * 84}px`,
                                                                    background: v === 0
                                                                        ? "#F4EEE3"
                                                                        : `rgba(228,87,46,${0.20 + pct * 0.70})`,
                                                                    outline: i === peak && maxH > 0 ? "2px solid #201D18" : "none",
                                                                    outlineOffset: "1px",
                                                                }}
                                                                title={`${hourLabel(i)} · ${v} moment${v === 1 ? "" : "s"}`}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="flex justify-between mt-2 text-[10px] font-bold uppercase tracking-wider text-[#9A9286]">
                                                <span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11 PM</span>
                                            </div>
                                            {maxH > 0 && (
                                                <p className="text-xs font-bold text-[#201D18] mt-3">
                                                    Peak: {hourLabel(peak)} — {maxH} moment{maxH === 1 ? "" : "s"}.
                                                </p>
                                            )}
                                        </>
                                    );
                                })()}
                            </ChartCard>
                            <ChartCard title="By day of week" testid="chart-by-dow">
                                <ResponsiveContainer width="100%" height={250}>
                                    <BarChart data={dowData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D2" />
                                        <XAxis dataKey="name" />
                                        <YAxis allowDecimals={false} />
                                        <Tooltip />
                                        <Bar dataKey="value" fill="#E8A33D" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        </div>

                        <section className="mb-card p-5" data-testid="chart-cooccurrence">
                            <h3 className="font-display font-bold text-lg text-[#201D18] mb-2">Top trigger → behavior pairs</h3>
                            <p className="text-sm font-semibold text-[#6E675B] mb-3">The single most common behavior that follows each trigger.</p>
                            {coRows.length === 0 ? (
                                <p className="text-sm font-bold text-[#9A9286]">Not enough data yet.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-xs font-bold uppercase tracking-widest text-[#9A9286]">
                                                <th className="py-2">Trigger</th>
                                                <th className="py-2">Leads to</th>
                                                <th className="py-2 text-right">Count</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {coRows.map((r, i) => (
                                                <tr key={i} className="border-t-2 border-[#E8E0D2]">
                                                    <td className="py-2 font-semibold text-[#201D18]">{labelTrig(r.trig)}</td>
                                                    <td className="py-2 font-semibold text-[#201D18]">{labelType(r.type)}</td>
                                                    <td className="py-2 text-right font-extrabold text-[#E4572E]">{r.count}×</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    </>
                )}
            </main>
        </div>
    );
}

function Stat({ label, value }) {
    return (
        <div className="mb-card p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286]">{label}</p>
            <p className="font-display font-extrabold text-3xl text-[#201D18] mt-1">{value}</p>
        </div>
    );
}

function ChartCard({ title, icon, children, testid }) {
    return (
        <section className="mb-card p-5" data-testid={testid}>
            <div className="flex items-center gap-2 mb-3">
                {icon}
                <h3 className="font-display font-bold text-lg text-[#201D18]">{title}</h3>
            </div>
            {children}
        </section>
    );
}
