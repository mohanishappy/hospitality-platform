import { useCallback, useEffect, useState } from "react";
import {
  GatewayError,
  inviteStaffMember,
  listAdminStaff,
  patchStaffMember,
  replaceStaffChainGrants,
  type ChainSummary,
  type StaffMember,
} from "../../api/gateway";
import { useGatewayToken } from "../../hooks/useGatewayToken";

type Props = {
  gatewayUrl: string;
  audience: string;
  chains: ChainSummary[];
};

const ROLES = [
  { value: "front_desk", label: "Front desk" },
  { value: "manager", label: "Manager" },
  { value: "read_only", label: "Read only" },
] as const;

function chainLabel(id: string, chains: ChainSummary[]): string {
  const chain = chains.find((c) => c.id === id);
  return chain ? `${chain.name} (${chain.code})` : id.slice(0, 8);
}

export function AdminStaffTab({ gatewayUrl, audience, chains }: Props) {
  const getToken = useGatewayToken(audience);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("front_desk");
  const [inviteAllChains, setInviteAllChains] = useState(true);
  const [inviteChainIds, setInviteChainIds] = useState<string[]>([]);
  const [lastAcceptUrl, setLastAcceptUrl] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAllChains, setEditAllChains] = useState(true);
  const [editChainIds, setEditChainIds] = useState<string[]>([]);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const data = await listAdminStaff(gatewayUrl, token);
      setStaff(data.staff ?? []);
    } catch (err: unknown) {
      setError(
        err instanceof GatewayError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load staff"
      );
    } finally {
      setLoading(false);
    }
  }, [gatewayUrl, getToken]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setBusy(true);
    setError(null);
    setLastAcceptUrl(null);
    try {
      const token = await getToken();
      const data = await inviteStaffMember(gatewayUrl, token, {
        email,
        intended_role: inviteRole,
        all_chains: inviteAllChains,
        chain_ids: inviteAllChains ? undefined : inviteChainIds,
      });
      setLastAcceptUrl(data.invite.accept_url);
      setInviteEmail("");
      await loadStaff();
    } catch (err: unknown) {
      setError(
        err instanceof GatewayError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Invite failed"
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (member: StaffMember) => {
    if (member.status === "pending") return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      await patchStaffMember(gatewayUrl, token, member.id, {
        active: !member.active,
      });
      await loadStaff();
    } catch (err: unknown) {
      setError(
        err instanceof GatewayError ? err.message : "Update failed"
      );
    } finally {
      setBusy(false);
    }
  };

  const startEditGrants = (member: StaffMember) => {
    setEditingId(member.id);
    setEditAllChains(member.all_chains);
    setEditChainIds(member.chain_ids ?? []);
  };

  const saveGrants = async (memberId: string) => {
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      if (editAllChains) {
        await patchStaffMember(gatewayUrl, token, memberId, {
          all_chains: true,
        });
      } else {
        await patchStaffMember(gatewayUrl, token, memberId, {
          all_chains: false,
        });
        await replaceStaffChainGrants(
          gatewayUrl,
          token,
          memberId,
          editChainIds
        );
      }
      setEditingId(null);
      await loadStaff();
    } catch (err: unknown) {
      setError(
        err instanceof GatewayError ? err.message : "Failed to save grants"
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleInviteChain = (chainId: string) => {
    setInviteChainIds((prev) =>
      prev.includes(chainId)
        ? prev.filter((id) => id !== chainId)
        : [...prev, chainId]
    );
  };

  const toggleEditChain = (chainId: string) => {
    setEditChainIds((prev) =>
      prev.includes(chainId)
        ? prev.filter((id) => id !== chainId)
        : [...prev, chainId]
    );
  };

  return (
    <div className="admin-tab">
      <section className="panel panel-wide">
        <h2 className="section-title">Invite staff</h2>
        <p className="muted">
          Creates a pending profile and returns a copy-link accept URL (email
          sending is Phase 9C).
        </p>
        <form className="admin-form" onSubmit={submitInvite}>
          <label>
            Email
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
          <label>
            Role
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={inviteAllChains}
              onChange={(e) => setInviteAllChains(e.target.checked)}
            />
            All brands in this enterprise
          </label>
          {!inviteAllChains && chains.length > 0 && (
            <fieldset className="chain-checkboxes">
              <legend>Brand access</legend>
              {chains.map((chain) => (
                <label key={chain.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={inviteChainIds.includes(chain.id)}
                    onChange={() => toggleInviteChain(chain.id)}
                  />
                  {chain.name} ({chain.code})
                </label>
              ))}
            </fieldset>
          )}
          <button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Create invite"}
          </button>
        </form>
        {lastAcceptUrl && (
          <div className="invite-url-box">
            <p className="success">Invite created. Share this link:</p>
            <input
              type="text"
              readOnly
              value={lastAcceptUrl}
              onFocus={(e) => e.target.select()}
            />
          </div>
        )}
      </section>

      <section className="panel panel-wide">
        <h2 className="section-title">Team</h2>
        {loading && <p className="muted">Loading staff…</p>}
        {error && <p className="error">{error}</p>}
        {!loading && staff.length === 0 && (
          <p className="muted">No staff members yet.</p>
        )}
        {staff.length > 0 && (
          <ul className="staff-list">
            {staff.map((member) => (
              <li key={member.id} className="staff-row">
                <div className="staff-row-main">
                  <strong>{member.email}</strong>
                  <span className="staff-meta">
                    {member.intended_role.replace(/_/g, " ")} ·{" "}
                    {member.status}
                    {member.status === "active" &&
                      (member.active ? "" : " (disabled)")}
                  </span>
                  <span className="staff-meta muted">
                    {member.all_chains
                      ? "All brands"
                      : (member.chain_ids ?? [])
                          .map((id: string) => chainLabel(id, chains))
                          .join(", ") || "No brands assigned"}
                  </span>
                </div>
                <div className="staff-row-actions">
                  {member.status === "active" && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => void toggleActive(member)}
                    >
                      {member.active ? "Disable" : "Enable"}
                    </button>
                  )}
                  {member.status !== "pending" && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => startEditGrants(member)}
                    >
                      Edit brands
                    </button>
                  )}
                </div>
                {editingId === member.id && (
                  <div className="staff-edit-grants">
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={editAllChains}
                        onChange={(e) => setEditAllChains(e.target.checked)}
                      />
                      All brands
                    </label>
                    {!editAllChains &&
                      chains.map((chain) => (
                        <label key={chain.id} className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={editChainIds.includes(chain.id)}
                            onChange={() => toggleEditChain(chain.id)}
                          />
                          {chain.name} ({chain.code})
                        </label>
                      ))}
                    <div className="staff-edit-actions">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveGrants(member.id)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
