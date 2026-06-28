import { useState } from "react";
import {
  createAdminChain,
  GatewayError,
  patchAdminChain,
  type ChainSummary,
} from "../../api/gateway";
import { useGatewayToken } from "../../hooks/useGatewayToken";
import { chainPath } from "../../lib/tenantPath";

type Props = {
  gatewayUrl: string;
  audience: string;
  chains: ChainSummary[];
  onChainsChange: () => void;
};

export function AdminBrandsTab({
  gatewayUrl,
  audience,
  chains,
  onChainsChange,
}: Props) {
  const getToken = useGatewayToken(audience);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newCurrency, setNewCurrency] = useState("USD");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editCurrency, setEditCurrency] = useState("USD");

  const startEdit = (chain: ChainSummary) => {
    setEditingId(chain.id);
    setEditCode(chain.code);
    setEditName(chain.name);
    setEditCurrency(chain.default_currency ?? "USD");
    setError(null);
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      await createAdminChain(gatewayUrl, token, {
        code: newCode.trim().toUpperCase(),
        name: newName.trim(),
        default_currency: newCurrency.trim().toUpperCase() || "USD",
      });
      setNewCode("");
      setNewName("");
      onChainsChange();
    } catch (err: unknown) {
      setError(
        err instanceof GatewayError ? err.message : "Create brand failed"
      );
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      await patchAdminChain(gatewayUrl, token, editingId, {
        code: editCode.trim().toUpperCase(),
        name: editName.trim(),
        default_currency: editCurrency.trim().toUpperCase(),
      });
      setEditingId(null);
      onChainsChange();
    } catch (err: unknown) {
      setError(err instanceof GatewayError ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-tab">
      <section className="panel panel-wide">
        <h2 className="section-title">Brands</h2>
        <p className="muted">
          Create and edit booking brands. Each brand gets its own site at{" "}
          <code>/c/:code</code>.
        </p>
        {error && <p className="error">{error}</p>}

        <form className="admin-form" onSubmit={submitCreate}>
          <h3 className="subsection-title">Create brand</h3>
          <label>
            Code
            <input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              required
              placeholder="MYBRAND"
              maxLength={64}
            />
          </label>
          <label>
            Name
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
          </label>
          <label>
            Default currency
            <input
              value={newCurrency}
              onChange={(e) => setNewCurrency(e.target.value.toUpperCase())}
              maxLength={8}
            />
          </label>
          <button type="submit" disabled={busy}>
            Create brand
          </button>
        </form>
      </section>

      <section className="panel panel-wide">
        <h3 className="subsection-title">Your brands</h3>
        {chains.length === 0 ? (
          <p className="muted">No brands yet.</p>
        ) : (
          <ul className="staff-list">
            {chains.map((chain) => (
              <li key={chain.id} className="staff-row">
                {editingId === chain.id ? (
                  <form className="admin-form" onSubmit={submitEdit}>
                    <label>
                      Code
                      <input
                        value={editCode}
                        onChange={(e) =>
                          setEditCode(e.target.value.toUpperCase())
                        }
                        required
                      />
                    </label>
                    <label>
                      Name
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Default currency
                      <input
                        value={editCurrency}
                        onChange={(e) =>
                          setEditCurrency(e.target.value.toUpperCase())
                        }
                      />
                    </label>
                    <div className="staff-edit-actions">
                      <button type="submit" disabled={busy}>
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
                  </form>
                ) : (
                  <>
                    <div className="staff-row-main">
                      <strong>{chain.name}</strong>
                      <span className="staff-meta muted">
                        {chain.code}
                        {chain.default_currency
                          ? ` · ${chain.default_currency}`
                          : ""}
                      </span>
                    </div>
                    <div className="staff-row-actions">
                      <a href={chainPath(chain.code)} className="secondary-link">
                        Booking site →
                      </a>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => startEdit(chain)}
                      >
                        Edit
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
