import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import {
    Users, UserPlus, Copy, Check, ArrowLeft, Mail, Crown, Eye, Shield,
    Trash2, LogOut, Plus, X, Pencil, Save, Home, Lock, Key, ExternalLink,
} from "lucide-react";

const ROLE_META = {
    owner: { label: "Owner", icon: Crown, color: "#FFD166", desc: "Full control: invite, remove, billing, delete." },
    co_parent: { label: "Co-parent", icon: Shield, color: "#4361EE", desc: "Create & edit missions, moments, packs." },
    viewer: { label: "Viewer", icon: Eye, color: "#06D6A0", desc: "Read-only. Great for grandparents or tutors." },
};

export default function FamilySettings() {
    const { user, refresh, switchFamily } = useAuth();
    const [activeId, setActiveId] = useState(user?.active_family_id || "");
    const [fam, setFam] = useState(null);
    const [invites, setInvites] = useState([]);
    const [err, setErr] = useState("");
    const [inviting, setInviting] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState("co_parent");
    const [lastInvite, setLastInvite] = useState(null);
    const [editingName, setEditingName] = useState(false);
    const [newName, setNewName] = useState("");
    const [showCreate, setShowCreate] = useState(false);
    const [createName, setCreateName] = useState("");

    useEffect(() => {
        setActiveId(user?.active_family_id || "");
    }, [user?.active_family_id]);

    const load = async (fid) => {
        if (!fid) { setFam(null); return; }
        try {
            const [f, inv] = await Promise.all([
                api.get(`/families/${fid}`),
                api.get(`/families/${fid}/invites`),
            ]);
            setFam(f.data);
            setInvites(inv.data || []);
            setNewName(f.data.name);
        } catch (e) {
            setErr(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        }
    };

    useEffect(() => { load(activeId); }, [activeId]);

    const myRole = useMemo(() => {
        if (!fam) return null;
        const m = fam.members.find((mm) => mm.user_id === user?.id);
        return m?.role || null;
    }, [fam, user?.id]);

    const isOwner = myRole === "owner";
    const canWrite = myRole === "owner" || myRole === "co_parent";

    const handleInvite = async (e) => {
        e?.preventDefault?.();
        if (!inviteEmail.trim()) return;
        setInviting(true);
        try {
            const { data } = await api.post(`/families/${fam.id}/invites`, {
                email: inviteEmail.trim(),
                role: inviteRole,
            });
            toast.success(data.email_sent ? "Invite sent — they'll get an email!" : "Invite ready — share the link with them.");
            setLastInvite(data);
            setInviteEmail("");
            load(activeId);
        } catch (err) {
            toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
        } finally { setInviting(false); }
    };

    const copyLink = (url) => {
        try {
            navigator.clipboard.writeText(url);
            toast.success("Link copied!");
        } catch { toast.error("Couldn't copy — please copy manually."); }
    };

    const cancelInvite = async (id) => {
        if (!window.confirm("Cancel this invite?")) return;
        try {
            await api.delete(`/invites/${id}`);
            toast.info("Invite cancelled.");
            load(activeId);
        } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message); }
    };

    const changeMemberRole = async (uid, role) => {
        try {
            await api.put(`/families/${fam.id}/members/${uid}`, { role });
            toast.success("Role updated.");
            load(activeId);
            if (uid === user.id) await refresh();
        } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message); }
    };

    const removeMember = async (uid) => {
        if (!window.confirm("Remove this member? Their authored content stays in the family.")) return;
        try {
            await api.delete(`/families/${fam.id}/members/${uid}`);
            toast.success("Member removed.");
            load(activeId);
        } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message); }
    };

    const leaveFamily = async () => {
        if (!window.confirm("Leave this family?")) return;
        try {
            await api.post(`/families/${fam.id}/leave`);
            toast.success("Left family.");
            await refresh();
        } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message); }
    };

    const renameFamily = async () => {
        try {
            await api.put(`/families/${fam.id}`, { name: newName.trim() });
            toast.success("Renamed.");
            setEditingName(false);
            load(activeId);
            await refresh();
        } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message); }
    };

    const createNewFamily = async () => {
        const n = createName.trim();
        if (!n) return;
        try {
            const { data } = await api.post("/families", { name: n });
            toast.success("Family created!");
            setShowCreate(false);
            setCreateName("");
            await refresh();
            await switchFamily(data.id);
        } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message); }
    };

    const deleteFamily = async () => {
        if (!window.confirm("Delete this family? All students must be unlinked first.")) return;
        try {
            await api.delete(`/families/${fam.id}`);
            toast.success("Family deleted.");
            await refresh();
        } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message); }
    };

    if (!user || user.role !== "parent") return null;

    return (
        <div className="min-h-screen" data-testid="family-settings-page">
            <Navbar />
            <main className="max-w-4xl mx-auto p-6 md:p-10 space-y-6">
                <Link to="/parent" className="inline-flex items-center gap-2 text-sm font-bold text-[#4361EE]" data-testid="family-back">
                    <ArrowLeft size={16} /> Back to dashboard
                </Link>

                <header className="mb-card p-6 sm:p-8">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">Family settings</p>
                    <div className="flex items-start justify-between gap-3 mt-1">
                        <div className="flex-1">
                            {!editingName ? (
                                <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-[#0B132B]" data-testid="family-name-display">
                                    {fam?.name || "Loading…"}
                                </h1>
                            ) : (
                                <div className="flex gap-2 items-center">
                                    <input
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="rounded-2xl border-2 border-[#E2E8F0] px-4 py-2 font-bold focus:border-[#4361EE] outline-none text-2xl"
                                        data-testid="family-name-input"
                                        maxLength={80}
                                    />
                                    <button onClick={renameFamily} className="btn-pop-primary flex items-center gap-1 text-sm" data-testid="family-name-save"><Save size={14} /> Save</button>
                                    <button onClick={() => { setEditingName(false); setNewName(fam.name); }} className="btn-pop-ghost text-sm">Cancel</button>
                                </div>
                            )}
                            {!editingName && canWrite && (
                                <button onClick={() => setEditingName(true)} className="text-xs font-bold text-[#4361EE] mt-1 flex items-center gap-1" data-testid="family-name-edit">
                                    <Pencil size={12} /> Rename
                                </button>
                            )}
                            {myRole && (
                                <p className="mt-3 text-sm font-semibold text-[#4A5568] inline-flex items-center gap-2">
                                    Your role:
                                    <span className="mb-chip" style={{ background: `${ROLE_META[myRole].color}22`, color: ROLE_META[myRole].color }}>
                                        {(() => { const I = ROLE_META[myRole].icon; return <I size={12} />; })()}
                                        {ROLE_META[myRole].label}
                                    </span>
                                </p>
                            )}
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                            <button onClick={() => setShowCreate(true)} className="btn-pop-ghost flex items-center gap-2 text-sm" data-testid="family-create-new">
                                <Plus size={14} /> New family
                            </button>
                            {fam && !isOwner && (
                                <button onClick={leaveFamily} className="btn-pop-ghost text-[#EF476F] flex items-center gap-2 text-sm" data-testid="family-leave">
                                    <LogOut size={14} /> Leave
                                </button>
                            )}
                        </div>
                    </div>
                </header>

                {err && <p className="text-sm font-bold text-[#EF476F]" data-testid="family-error">{err}</p>}

                {showCreate && (
                    <section className="mb-card p-5 space-y-3" data-testid="family-create-form">
                        <h2 className="font-display font-bold text-xl text-[#0B132B]">New family</h2>
                        <input
                            value={createName}
                            onChange={(e) => setCreateName(e.target.value)}
                            placeholder="e.g. The Smith Family"
                            className="w-full rounded-2xl border-2 border-[#E2E8F0] px-4 py-3 font-bold focus:border-[#4361EE] outline-none"
                            data-testid="family-create-name"
                            maxLength={80}
                        />
                        <div className="flex gap-2">
                            <button onClick={createNewFamily} className="btn-pop-primary" data-testid="family-create-submit">Create family</button>
                            <button onClick={() => setShowCreate(false)} className="btn-pop-ghost">Cancel</button>
                        </div>
                    </section>
                )}

                {fam && (
                    <>
                    <section className="mb-card p-6">
                        <h2 className="font-display font-extrabold text-xl text-[#0B132B] mb-4 flex items-center gap-2">
                            <Users size={20} /> Members ({fam.members.length})
                        </h2>
                        <div className="space-y-3" data-testid="family-members-list">
                            {fam.members.map((m) => {
                                const meta = ROLE_META[m.role];
                                const Icon = meta.icon;
                                const isMe = m.user_id === user.id;
                                const displayName = isMe ? "You" : (m.name || m.email || m.user_id.slice(0, 8));
                                return (
                                    <div key={m.user_id} className="flex items-center justify-between gap-3 p-3 rounded-2xl border-2 border-[#E2E8F0]" data-testid={`family-member-${m.user_id}`}>
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="h-10 w-10 rounded-2xl flex items-center justify-center text-sm font-bold" style={{ background: `${meta.color}22`, color: meta.color }}>
                                                <Icon size={18} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-[#0B132B] truncate">
                                                    {displayName}
                                                    {(isMe || m.email) && <span className="ml-2 text-xs text-[#4A5568] font-semibold">({isMe ? user.email : m.email})</span>}
                                                </p>
                                                <p className="text-xs font-semibold text-[#4A5568]">{meta.label} · joined {new Date(m.joined_at).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        {isOwner && !isMe && (
                                            <div className="flex items-center gap-2">
                                                <select
                                                    value={m.role}
                                                    onChange={(e) => changeMemberRole(m.user_id, e.target.value)}
                                                    className="rounded-xl border-2 border-[#E2E8F0] px-2 py-1 text-sm font-bold focus:border-[#4361EE] outline-none"
                                                    data-testid={`role-select-${m.user_id}`}
                                                >
                                                    <option value="co_parent">Co-parent</option>
                                                    <option value="viewer">Viewer</option>
                                                    <option value="owner">Owner (transfer)</option>
                                                </select>
                                                <button onClick={() => removeMember(m.user_id)} className="text-[#EF476F]" data-testid={`remove-member-${m.user_id}`}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {canWrite && (
                        <section className="mb-card p-6" data-testid="family-invites-section">
                            <h2 className="font-display font-extrabold text-xl text-[#0B132B] mb-4 flex items-center gap-2">
                                <UserPlus size={20} /> Invite a co-parent or viewer
                            </h2>
                            <form onSubmit={handleInvite} className="grid sm:grid-cols-[1fr_auto_auto] gap-2">
                                <input
                                    type="email"
                                    required
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    placeholder="someone@example.com"
                                    className="rounded-2xl border-2 border-[#E2E8F0] px-4 py-3 font-bold focus:border-[#4361EE] outline-none"
                                    data-testid="invite-email"
                                />
                                <select
                                    value={inviteRole}
                                    onChange={(e) => setInviteRole(e.target.value)}
                                    className="rounded-2xl border-2 border-[#E2E8F0] px-3 py-3 font-bold focus:border-[#4361EE] outline-none"
                                    data-testid="invite-role"
                                >
                                    <option value="co_parent">Co-parent</option>
                                    <option value="viewer">Viewer</option>
                                </select>
                                <button type="submit" disabled={inviting} className="btn-pop-primary disabled:opacity-50 flex items-center gap-2" data-testid="invite-submit">
                                    <Mail size={14} /> {inviting ? "Sending…" : "Create invite"}
                                </button>
                            </form>
                            <p className="text-xs font-semibold text-[#4A5568] mt-2">
                                {ROLE_META[inviteRole].desc}
                            </p>

                            {lastInvite && (
                                <div className="mt-4 rounded-2xl bg-[#06D6A0]/10 border-2 border-[#06D6A0]/30 p-4" data-testid="invite-link-card">
                                    <p className="font-bold text-[#0B132B] text-sm">Invite ready for <span className="text-[#057a5b]">{lastInvite.email}</span></p>
                                    <p className="text-xs text-[#4A5568] mt-1">
                                        {lastInvite.email_sent
                                            ? <>📬 Email sent to their inbox. They can also use this link directly. Expires {new Date(lastInvite.expires_at).toLocaleDateString()}.</>
                                            : <>Email couldn&apos;t be sent (sender domain not verified yet) — just share this link with them. Expires {new Date(lastInvite.expires_at).toLocaleDateString()}.</>}
                                    </p>
                                    <div className="flex gap-2 mt-2">
                                        <input
                                            readOnly
                                            value={lastInvite.invite_url}
                                            className="flex-1 rounded-xl border-2 border-[#E2E8F0] px-3 py-2 text-xs font-mono"
                                            data-testid="invite-link-input"
                                            onClick={(e) => e.target.select()}
                                        />
                                        <button onClick={() => copyLink(lastInvite.invite_url)} className="btn-pop-primary text-sm flex items-center gap-1" data-testid="invite-copy-btn">
                                            <Copy size={14} /> Copy
                                        </button>
                                    </div>
                                </div>
                            )}

                            {invites.length > 0 && (
                                <div className="mt-5 space-y-2" data-testid="pending-invites-list">
                                    <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">Pending invites ({invites.length})</p>
                                    {invites.map((inv) => (
                                        <div key={inv.id} className="flex items-center justify-between p-3 rounded-2xl border-2 border-[#E2E8F0]" data-testid={`pending-invite-${inv.id}`}>
                                            <div>
                                                <p className="font-bold text-[#0B132B] text-sm">{inv.email}</p>
                                                <p className="text-xs text-[#4A5568] font-semibold">{ROLE_META[inv.role].label} · expires {new Date(inv.expires_at).toLocaleDateString()}</p>
                                            </div>
                                            <button onClick={() => cancelInvite(inv.id)} className="text-[#EF476F]" data-testid={`cancel-invite-${inv.id}`}>
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    )}

                    {canWrite && <HomeDashboardSection fam={fam} reloadFam={() => load(activeId)} />}
                    {canWrite && <StreakWeekendSection fam={fam} reloadFam={() => load(activeId)} />}

                    {isOwner && fam.student_ids.length === 0 && fam.members.length === 1 && (
                        <section className="mb-card p-6" data-testid="family-danger-zone">
                            <h2 className="font-display font-extrabold text-xl text-[#EF476F] mb-2">Danger zone</h2>
                            <p className="text-sm text-[#4A5568] font-semibold mb-3">This family is empty — no kids, no other members. You can delete it.</p>
                            <button onClick={deleteFamily} className="btn-pop-ghost text-[#EF476F] flex items-center gap-2" data-testid="family-delete">
                                <Trash2 size={14} /> Delete family
                            </button>
                        </section>
                    )}
                    </>
                )}
            </main>
        </div>
    );
}

function HomeDashboardSection({ fam, reloadFam }) {
    const [busy, setBusy] = useState(false);
    const [kids, setKids] = useState([]);
    const [pinInputs, setPinInputs] = useState({});
    const enabled = !!fam.home_dashboard_enabled;
    const homeUrl = fam.slug ? `${window.location.origin}/home/${fam.slug}` : "";

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/students");
                setKids((data || []).filter((s) => fam.student_ids.includes(s.id)));
            } catch { /* noop */ }
        })();
    }, [fam.id, fam.student_ids]);

    const toggle = async () => {
        setBusy(true);
        try {
            await api.put(`/families/${fam.id}/home-dashboard`, { enabled: !enabled });
            toast.success(!enabled ? "Home page is live." : "Home page disabled.");
            await reloadFam();
        } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message); }
        finally { setBusy(false); }
    };

    const copyLink = () => {
        try {
            navigator.clipboard.writeText(homeUrl);
            toast.success("Home page URL copied!");
        } catch { toast.error("Couldn't copy — copy manually."); }
    };

    const savePin = async (kidId) => {
        const pin = (pinInputs[kidId] || "").trim();
        if (!/^\d{4}$/.test(pin)) {
            toast.error("PIN must be 4 digits.");
            return;
        }
        try {
            await api.put(`/students/${kidId}/home-pin`, { pin });
            toast.success("PIN saved.");
            setPinInputs((m) => ({ ...m, [kidId]: "" }));
            setKids((arr) => arr.map((s) => s.id === kidId ? { ...s, home_pin_set: true } : s));
        } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message); }
    };

    const clearPin = async (kidId) => {
        if (!window.confirm("Remove this kid's PIN? They won't be able to use the home page.")) return;
        try {
            await api.delete(`/students/${kidId}/home-pin`);
            toast.success("PIN removed.");
            setKids((arr) => arr.map((s) => s.id === kidId ? { ...s, home_pin_set: false } : s));
        } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message); }
    };

    return (
        <section className="mb-card p-6" data-testid="home-dashboard-section">
            <h2 className="font-display font-extrabold text-xl text-[#0B132B] mb-1 flex items-center gap-2">
                <Home size={20} /> Family home page
            </h2>
            <p className="text-sm text-[#4A5568] font-semibold mb-4">
                A shared-device-friendly page. Bookmark it on your home computer or tablet — kids tap their face and enter their PIN to land straight on their missions. No email/password needed.
            </p>
            <div className="flex items-center gap-3 mb-4">
                <button
                    onClick={toggle}
                    disabled={busy}
                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${enabled ? "bg-[#06D6A0]" : "bg-[#E2E8F0]"}`}
                    aria-pressed={enabled}
                    data-testid="home-dashboard-toggle"
                >
                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${enabled ? "translate-x-7" : "translate-x-1"}`} />
                </button>
                <span className="font-bold text-[#0B132B]" data-testid="home-dashboard-state">{enabled ? "ON" : "OFF"}</span>
            </div>
            {enabled && (
                <>
                    <div className="rounded-2xl bg-[#4361EE]/5 border-2 border-[#4361EE]/20 p-4 mb-5" data-testid="home-dashboard-url-card">
                        <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">Bookmark this URL</p>
                        <div className="flex gap-2 mt-2">
                            <input
                                readOnly
                                value={homeUrl}
                                onClick={(e) => e.target.select()}
                                className="flex-1 rounded-xl border-2 border-[#E2E8F0] px-3 py-2 text-xs font-mono"
                                data-testid="home-dashboard-url"
                            />
                            <button onClick={copyLink} className="btn-pop-primary text-sm flex items-center gap-1" data-testid="home-dashboard-copy">
                                <Copy size={14} /> Copy
                            </button>
                            <a href={homeUrl} target="_blank" rel="noreferrer" className="btn-pop-ghost text-sm flex items-center gap-1" data-testid="home-dashboard-open">
                                <ExternalLink size={14} /> Open
                            </a>
                        </div>
                    </div>

                    <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0] mb-2 flex items-center gap-1"><Key size={11} /> Kid PINs</p>
                    <p className="text-xs text-[#4A5568] font-semibold mb-3">Each kid needs a 4-digit PIN before they can use the home page. 5 wrong tries → 10-min lockout.</p>
                    <div className="space-y-2" data-testid="home-pin-kids-list">
                        {kids.length === 0 && <p className="text-sm font-bold text-[#A0AEC0]">No kids linked to this family yet.</p>}
                        {kids.map((kid) => (
                            <div key={kid.id} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl border-2 border-[#E2E8F0]" data-testid={`home-pin-kid-${kid.id}`}>
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[#4361EE] to-[#06D6A0] text-white flex items-center justify-center font-bold">{kid.name?.[0]?.toUpperCase()}</div>
                                    <div>
                                        <p className="font-bold text-[#0B132B]">{kid.name}</p>
                                        <p className="text-xs font-semibold text-[#4A5568]">
                                            {kid.home_pin_set ? <span className="text-[#057a5b]"><Lock size={10} className="inline" /> PIN set</span> : <span className="text-[#EF476F]">No PIN yet</span>}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="password"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={pinInputs[kid.id] || ""}
                                        onChange={(e) => setPinInputs((m) => ({ ...m, [kid.id]: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                                        placeholder="4-digit"
                                        className="w-24 rounded-xl border-2 border-[#E2E8F0] px-3 py-2 text-center font-mono tracking-widest focus:border-[#4361EE] outline-none"
                                        data-testid={`home-pin-input-${kid.id}`}
                                        maxLength={4}
                                    />
                                    <button onClick={() => savePin(kid.id)} className="btn-pop-primary text-sm" data-testid={`home-pin-save-${kid.id}`}>
                                        {kid.home_pin_set ? "Change" : "Set"}
                                    </button>
                                    {kid.home_pin_set && (
                                        <button onClick={() => clearPin(kid.id)} className="text-[#EF476F] p-1" data-testid={`home-pin-clear-${kid.id}`}>
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </section>
    );
}


function StreakWeekendSection({ fam, reloadFam }) {
    const [mode, setMode] = useState(fam.streak_weekend_mode === "weekdays_only" ? "weekdays_only" : "all_days");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setMode(fam.streak_weekend_mode === "weekdays_only" ? "weekdays_only" : "all_days");
    }, [fam.streak_weekend_mode]);

    const save = async (newMode) => {
        setBusy(true);
        try {
            await api.put(`/families/${fam.id}/streak-weekend-mode`, { mode: newMode });
            setMode(newMode);
            toast.success(newMode === "weekdays_only" ? "Weekends now auto-skip" : "Every day counts now");
            reloadFam?.();
        } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        } finally { setBusy(false); }
    };

    return (
        <section className="mb-card p-6 mt-4" data-testid="streak-weekend-section">
            <h2 className="font-display font-extrabold text-xl text-[#0B132B] mb-1">Spark streak — weekend rule</h2>
            <p className="text-sm font-semibold text-[#4A5568] mb-4">
                Choose how spark streaks treat Saturdays and Sundays for everyone in <strong>{fam.name}</strong>.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
                <button
                    onClick={() => !busy && save("all_days")}
                    className={`rounded-2xl border-2 p-4 text-left transition-all ${mode === "all_days" ? "border-[#4361EE] bg-[#4361EE]/5" : "border-[#E2E8F0] hover:border-[#A0AEC0]"} ${busy ? "opacity-60" : ""}`}
                    disabled={busy}
                    data-testid="weekend-mode-all"
                >
                    <p className="font-display font-extrabold text-base text-[#0B132B]">Every day counts</p>
                    <p className="text-xs font-semibold text-[#4A5568] mt-1">A missed Saturday or Sunday will break the streak — unless you grant a freeze.</p>
                </button>
                <button
                    onClick={() => !busy && save("weekdays_only")}
                    className={`rounded-2xl border-2 p-4 text-left transition-all ${mode === "weekdays_only" ? "border-[#4361EE] bg-[#4361EE]/5" : "border-[#E2E8F0] hover:border-[#A0AEC0]"} ${busy ? "opacity-60" : ""}`}
                    disabled={busy}
                    data-testid="weekend-mode-weekdays"
                >
                    <p className="font-display font-extrabold text-base text-[#0B132B]">Weekdays only</p>
                    <p className="text-xs font-semibold text-[#4A5568] mt-1">Sat & Sun are skipped — kids only need missions Mon-Fri to keep the streak alive.</p>
                </button>
            </div>
        </section>
    );
}
