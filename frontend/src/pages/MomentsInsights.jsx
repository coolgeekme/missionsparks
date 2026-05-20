import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, API } from "../lib/api";
import { ArrowLeft, Download, TrendingUp, BarChart3 } from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    LineChart, Line, CartesianGrid,
} from "recharts";

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${i}h`);

export default function MomentsInsights() {
    const [students, setStudents] = useState([]);
    const [selected, setSelected] = useState(null);
    const [days, setDays] = useState(30);
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
            const { data } = await api.get("/moments/insights", { params: { student_id: selected.id, days } });
            setInsights(data);
        })();
    }, [selected, days]);

    const exportCsv = () => {
        const url = `${API}/moments/export.csv${selected ? `?student_id=${selected.id}` : ""}`;
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

    // build trigger→type co-occurrence rows
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
                <Link to="/parent/moments" className="inline-flex items-center gap-2 text-sm font-bold text-[#4361EE]" data-testid="insights-back">
                    <ArrowLeft size={16} /> Back to moments
                </Link>
                <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">Patterns & insights</p>
                        <h1 className="font-display font-extrabold text-4xl sm:text-5xl text-[#0B132B] mt-1">What the data says</h1>
                        <p className="text-[#4A5568] font-semibold mt-2">A snapshot to share with therapists or guide your next plan.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
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
                                className={`mb-chip border-2 ${selected?.id === s.id ? "bg-[#4361EE] text-white border-[#4361EE]" : "bg-white border-[#E2E8F0]"}`}
                                data-testid={`insights-student-${s.id}`}
                            >🚀 {s.name}</button>
                        ))}
                    </div>
                )}

                {!insights ? (
                    <div className="mb-card p-8 text-center"><p className="text-[#4A5568] font-bold animate-pulse">Loading…</p></div>
                ) : insights.total === 0 ? (
                    <div className="mb-card p-10 text-center" data-testid="insights-empty">
                        <p className="font-display font-bold text-2xl text-[#0B132B]">No moments yet in this window</p>
                        <p className="text-[#4A5568] font-semibold mt-2">Log a few moments to start seeing patterns here.</p>
                    </div>
                ) : (
                    <>
                        <div className="grid sm:grid-cols-3 gap-4">
                            <Stat label="Moments logged" value={insights.total} />
                            <Stat label="Unique trigger types" value={Object.keys(insights.counts_by_trigger).length} />
                            <Stat label="Most active hour" value={
                                (() => {
                                    const max = Math.max(...insights.by_hour);
                                    if (max === 0) return "—";
                                    const idx = insights.by_hour.indexOf(max);
                                    return `${idx}:00`;
                                })()
                            } />
                        </div>

                        <ChartCard title="Top triggers" icon={<TrendingUp size={18} />} testid="chart-top-triggers">
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={topTriggerData} layout="vertical" margin={{ left: 80 }}>
                                    <XAxis type="number" allowDecimals={false} />
                                    <YAxis dataKey="name" type="category" width={140} />
                                    <Tooltip />
                                    <Bar dataKey="value" fill="#4361EE" radius={[0, 8, 8, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <ChartCard title="Top moment types" icon={<BarChart3 size={18} />} testid="chart-top-types">
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={topTypeData} layout="vertical" margin={{ left: 80 }}>
                                    <XAxis type="number" allowDecimals={false} />
                                    <YAxis dataKey="name" type="category" width={160} />
                                    <Tooltip />
                                    <Bar dataKey="value" fill="#EF476F" radius={[0, 8, 8, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <div className="grid lg:grid-cols-2 gap-4">
                            <ChartCard title="By hour of day" testid="chart-by-hour">
                                <ResponsiveContainer width="100%" height={250}>
                                    <BarChart data={hourData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                        <XAxis dataKey="name" interval={2} />
                                        <YAxis allowDecimals={false} />
                                        <Tooltip />
                                        <Bar dataKey="value" fill="#06D6A0" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartCard>
                            <ChartCard title="By day of week" testid="chart-by-dow">
                                <ResponsiveContainer width="100%" height={250}>
                                    <BarChart data={dowData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                        <XAxis dataKey="name" />
                                        <YAxis allowDecimals={false} />
                                        <Tooltip />
                                        <Bar dataKey="value" fill="#FFD166" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        </div>

                        <ChartCard title={`Trend (last ${days} days)`} testid="chart-trend">
                            <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={dailyData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                    <XAxis dataKey="name" interval={Math.max(0, Math.floor(dailyData.length / 12) - 1)} />
                                    <YAxis allowDecimals={false} />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="value" stroke="#4361EE" strokeWidth={3} dot={{ r: 3 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <section className="mb-card p-5" data-testid="chart-cooccurrence">
                            <h3 className="font-display font-bold text-lg text-[#0B132B] mb-2">Trigger → moment co-occurrence</h3>
                            <p className="text-sm font-semibold text-[#4A5568] mb-3">When this trigger happens, this moment shows up most often.</p>
                            {coRows.length === 0 ? (
                                <p className="text-sm font-bold text-[#A0AEC0]">Not enough data yet.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">
                                                <th className="py-2">Trigger</th>
                                                <th className="py-2">Leads to</th>
                                                <th className="py-2 text-right">Count</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {coRows.map((r, i) => (
                                                <tr key={i} className="border-t-2 border-[#E2E8F0]">
                                                    <td className="py-2 font-semibold text-[#0B132B]">{labelTrig(r.trig)}</td>
                                                    <td className="py-2 font-semibold text-[#0B132B]">{labelType(r.type)}</td>
                                                    <td className="py-2 text-right font-extrabold text-[#4361EE]">{r.count}×</td>
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
            <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">{label}</p>
            <p className="font-display font-extrabold text-3xl text-[#0B132B] mt-1">{value}</p>
        </div>
    );
}

function ChartCard({ title, icon, children, testid }) {
    return (
        <section className="mb-card p-5" data-testid={testid}>
            <div className="flex items-center gap-2 mb-3">
                {icon}
                <h3 className="font-display font-bold text-lg text-[#0B132B]">{title}</h3>
            </div>
            {children}
        </section>
    );
}
