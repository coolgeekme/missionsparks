import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, ShieldCheck, ShieldAlert } from "lucide-react";
import {
    SUB_PROCESSORS,
    CATEGORY_LABEL,
    CATEGORY_TONE,
} from "../data/subProcessors";

/**
 * Public sub-processors page linked from the Privacy Policy. Lists every
 * third-party vendor that may receive customer data, with purpose, data
 * shared, region, and BAA status. Source of truth lives in
 * /app/frontend/src/data/subProcessors.js — update there, not here.
 */
export default function SubProcessors() {
    return (
        <div className="min-h-screen bg-[#F0F8FF]" data-testid="subprocessors-page">
            <main className="max-w-4xl mx-auto p-6 sm:p-10">
                <Link
                    to="/privacy"
                    className="inline-flex items-center gap-2 text-sm font-bold text-[#4361EE] mb-4"
                    data-testid="subprocessors-back"
                >
                    <ArrowLeft size={16} /> Back to Privacy Policy
                </Link>

                <header className="space-y-2 mb-8">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#4361EE]">Vendor transparency</p>
                    <h1 className="font-display font-extrabold text-4xl sm:text-5xl text-[#0B132B]">Sub-processors</h1>
                    <p className="text-[#4A5568] font-semibold max-w-2xl">
                        {"Third-party services that may process MissionSparks customer data on our behalf. We maintain this list so therapists, schools, and privacy-conscious parents can see exactly who touches their family's information."}
                    </p>
                    <p className="text-xs font-bold text-[#A0AEC0] pt-1">Last reviewed: Feb 2026. We notify customers by email at least 14 days before adding a new sub-processor.</p>
                </header>

                <ul className="space-y-4" data-testid="subprocessors-list">
                    {SUB_PROCESSORS.map((sp) => (
                        <li
                            key={`${sp.vendor}-${sp.product}`}
                            className="mb-card mb-card-hover p-5 space-y-3 bg-white"
                            data-testid={`subprocessor-${sp.vendor.toLowerCase().replaceAll(" ", "-")}`}
                        >
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div>
                                    <h2 className="font-display font-extrabold text-xl text-[#0B132B]">{sp.vendor}</h2>
                                    <p className="text-sm font-bold text-[#4A5568]">{sp.product}</p>
                                </div>
                                <span className={`mb-chip text-xs ${CATEGORY_TONE[sp.category]}`}>
                                    {CATEGORY_LABEL[sp.category] || sp.category}
                                </span>
                            </div>

                            <Row label="Purpose" value={sp.purpose} />
                            <Row label="Data shared" value={sp.data_shared} />

                            <div className="grid sm:grid-cols-3 gap-3 pt-2 border-t-2 border-[#E2E8F0]">
                                <Meta label="Region" value={sp.region} />
                                <Meta
                                    label="BAA"
                                    value={
                                        <span className={`inline-flex items-center gap-1 ${sp.baa ? "text-[#057a5b]" : "text-[#876200]"}`}>
                                            {sp.baa ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
                                            {sp.baa ? "In place" : "Not yet"}
                                        </span>
                                    }
                                />
                                <Meta label="Added" value={sp.added} />
                            </div>

                            {sp.url && (
                                <a
                                    href={sp.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-bold text-[#4361EE] hover:underline"
                                    data-testid={`subprocessor-link-${sp.vendor.toLowerCase().replaceAll(" ", "-")}`}
                                >
                                    Vendor privacy policy <ExternalLink size={12} />
                                </a>
                            )}
                        </li>
                    ))}
                </ul>

                <footer className="text-xs text-[#4A5568] font-semibold pt-8 mt-8 border-t-2 border-[#E2E8F0] space-y-2">
                    <p>
                        <strong>BAA status:</strong>{" "}
                        {"\"Not yet\" means we use the vendor's consumer-tier endpoints today. Until a Business Associate Agreement is in place, do not log Protected Health Information (PHI) into MissionSparks."}
                    </p>
                    <p>
                        Questions or requests:{" "}
                        <a href="mailto:privacy@missionsparks.example" className="text-[#4361EE] hover:underline">
                            privacy@missionsparks.example
                        </a>
                        .
                    </p>
                </footer>
            </main>
        </div>
    );
}

function Row({ label, value }) {
    return (
        <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#A0AEC0]">{label}</p>
            <p className="text-sm text-[#0B132B] font-semibold mt-0.5">{value}</p>
        </div>
    );
}

function Meta({ label, value }) {
    return (
        <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#A0AEC0]">{label}</p>
            <div className="text-sm font-bold text-[#0B132B] mt-0.5">{value}</div>
        </div>
    );
}
