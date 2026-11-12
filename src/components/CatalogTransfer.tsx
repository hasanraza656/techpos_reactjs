import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { api, useClient } from "../lib/api";
import { downloadApi, saveBlob } from "../lib/downloads";
import { useWorkspace } from "../App";
import type { Module } from "../lib/types";
import { ErrorBox, Modal } from "./ui";
type Result = {
  rows: number;
  valid_rows: number;
  committed: boolean;
  errors: { row: number; sku: string; messages: string[] }[];
  sample: { sku: string; name: string; selling_price: string }[];
};
export function CatalogTransfer() {
  const { business } = useWorkspace();
  const client = useQueryClient();
  const notify = useClient((s) => s.notify);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState(
    business.permissions.includes("products.create") ? "create" : "update",
  );
  const [result, setResult] = useState<Result | null>(null);
  const [downloadError, setDownloadError] = useState<unknown>();
  const [downloading, setDownloading] = useState(false);
  const modules = useQuery({
    queryKey: ["modules", business.tenant.public_id],
    queryFn: () => api<Module[]>("modules"),
  });
  const bulk = modules.data?.find((m) => m.key === "bulk_data");
  const transfer = useMutation({
    mutationFn: async (preview: boolean) => {
      if (!file) throw new Error("Choose a CSV file first.");
      const body = new FormData();
      body.append("file", file);
      body.append("mode", mode);
      body.append("preview", preview ? "1" : "0");
      return api<Result>("operations/catalog/import", { method: "POST", body });
    },
    onSuccess: (r) => {
      setResult(r);
      if (r.committed) {
        void client.invalidateQueries({ queryKey: ["products"] });
        void client.invalidateQueries({ queryKey: ["pos-products"] });
        void client.invalidateQueries({ queryKey: ["setup-checklist"] });
        notify(
          `${r.valid_rows} products ${mode === "create" ? "created" : "updated"}. Stock quantities were not changed.`,
        );
      }
    },
  });
  async function exportCsv() {
    setDownloading(true);
    setDownloadError(undefined);
    try {
      await downloadApi("operations/catalog/export", "techpos-products.csv");
    } catch (e) {
      setDownloadError(e);
    } finally {
      setDownloading(false);
    }
  }
  const canImport =
    business.permissions.includes("products.create") ||
    business.permissions.includes("products.edit");
  if (!canImport && !business.permissions.includes("reports.export"))
    return null;
  return (
    <>
      <button className="button secondary" onClick={() => setOpen(true)}>
        <FileSpreadsheet size={16} />
        Import / export
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Move your catalog with CSV."
        description="Preview every row before importing. Products stay separate from the stock movement ledger."
      >
        <ErrorBox error={modules.error} />
        {!bulk?.included ? (
          <div className="empty">
            <FileSpreadsheet size={32} />
            <h3>Bring a larger catalog with you.</h3>
            <p>
              Bulk CSV tools are included in Standard and Premium. You can
              continue adding products individually on Free.
            </p>
            <Link className="button" to="/subscription">
              Compare plans
            </Link>
          </div>
        ) : !bulk.enabled ? (
          <div className="empty">
            <h3>Enable your bulk tools.</h3>
            <p>
              Import and export are included in your plan. Enable the module to
              use them.
            </p>
            <Link className="button" to="/modules">
              Open modules
            </Link>
          </div>
        ) : (
          <>
            <p className="muted">
              UTF-8 CSV · up to 250 products / 2 MB per batch. Excel workbooks
              are not supported yet. Image files and opening stock are managed
              separately.
            </p>
            {canImport && (
              <>
                <div className="form-grid">
                  <label>
                    Import mode
                    <select
                      value={mode}
                      disabled={transfer.isPending}
                      onChange={(e) => {
                        setMode(e.target.value);
                        setResult(null);
                        transfer.reset();
                      }}
                    >
                      {business.permissions.includes("products.create") && (
                        <option value="create">Create new products</option>
                      )}
                      {business.permissions.includes("products.edit") && (
                        <option value="update">
                          Update existing products by SKU
                        </option>
                      )}
                    </select>
                  </label>
                  <label>
                    CSV file
                    <input
                      type="file"
                      accept=".csv,text/csv,text/plain"
                      disabled={transfer.isPending}
                      onChange={(e) => {
                        setFile(e.target.files?.[0] ?? null);
                        setResult(null);
                        transfer.reset();
                      }}
                    />
                  </label>
                </div>
                <p className="muted">
                  Create requires name, sku and selling_price. Update requires
                  sku and the current version from an export. Omitted update
                  fields keep their values.
                </p>
                <div className="row mt">
                  <button
                    className="button secondary"
                    onClick={() =>
                      saveBlob(
                        new Blob(
                          [
                            "name,sku,type,unit,cost_price,selling_price,tax_rate,tax_inclusive,reorder_level,active,barcodes\r\n",
                          ],
                          { type: "text/csv" },
                        ),
                        "techpos-product-template.csv",
                      )
                    }
                  >
                    <Download size={16} />
                    Download template
                  </button>
                  <button
                    className="button"
                    disabled={
                      !file || transfer.isPending || !!result?.committed
                    }
                    onClick={() => transfer.mutate(true)}
                  >
                    {transfer.isPending ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <Upload size={16} />
                    )}
                    Preview file
                  </button>
                </div>
                <ErrorBox error={transfer.error} />
                {result && (
                  <section className="csv-result" aria-live="polite">
                    <strong>
                      {result.committed
                        ? "Import complete"
                        : `${result.valid_rows} of ${result.rows} rows passed validation`}
                    </strong>
                    {result.errors.length ? (
                      <>
                        <p>
                          No rows will be imported until every issue is fixed.
                        </p>
                        <ul>
                          {result.errors.map((e, i) => (
                            <li key={i}>
                              Row {e.row}
                              {e.sku ? ` (${e.sku})` : ""}:{" "}
                              {e.messages.join(" ")}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <>
                        <div className="responsive-table">
                          <table>
                            <thead>
                              <tr>
                                <th>SKU</th>
                                <th>Product</th>
                                <th>Price</th>
                              </tr>
                            </thead>
                            <tbody>
                              {result.sample.map((row) => (
                                <tr key={row.sku}>
                                  <td>{row.sku}</td>
                                  <td>{row.name}</td>
                                  <td>{row.selling_price}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {!result.committed && (
                          <>
                            <p>
                              Showing the first {result.sample.length} rows. All
                              rows are validated again when you import.
                            </p>
                            <button
                              className="button"
                              disabled={transfer.isPending}
                              onClick={() => transfer.mutate(false)}
                            >
                              Import {result.valid_rows} products
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </section>
                )}
              </>
            )}
            {business.permissions.includes("reports.export") && (
              <div className="csv-export">
                <h3>Export your catalog</h3>
                <p className="muted">
                  Includes product revisions and barcodes. Cost prices require
                  the cost-view permission. Spreadsheet formulas in text are
                  escaped.
                </p>
                <button
                  className="button secondary"
                  disabled={downloading}
                  onClick={() => void exportCsv()}
                >
                  {downloading ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <Download size={16} />
                  )}
                  Export CSV
                </button>
                <ErrorBox error={downloadError} />
              </div>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
