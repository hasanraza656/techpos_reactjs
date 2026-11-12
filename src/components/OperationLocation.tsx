import type { OpsSetup } from "../lib/operations";
export function OperationLocation({
  setup,
  branch,
  warehouse,
  onBranch,
  onWarehouse,
  disabled = false,
}: {
  setup: OpsSetup;
  branch: string;
  warehouse: string;
  onBranch: (v: string) => void;
  onWarehouse: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="operation-location">
      <label>
        Branch
        <select
          value={branch}
          disabled={disabled}
          onChange={(e) => onBranch(e.target.value)}
        >
          {setup.branches.map((b) => (
            <option key={b.public_id} value={b.public_id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Stockroom
        <select
          value={warehouse}
          disabled={disabled}
          onChange={(e) => onWarehouse(e.target.value)}
        >
          {setup.warehouses
            .filter((w) => w.branch === branch)
            .map((w) => (
              <option key={w.public_id} value={w.public_id}>
                {w.name}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}
