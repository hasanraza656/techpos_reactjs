import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  Package,
  ClipboardList,
  LayoutGrid,
  List,
} from "lucide-react";
import { useOperations } from "../hooks/useOperations";
import { useWorkspace } from "../App";
import { ops, query } from "../lib/operations";
import type { Product, Page } from "../lib/operations";
import { api, errorText, json, useClient } from "../lib/api";
import { scaled } from "../lib/decimal";
import { ErrorBox, Loading, Modal, PageTitle } from "../components/ui";
import { OperationLocation } from "../components/OperationLocation";
import { ProductImage } from "../components/ProductImage";
import { MediaPicker } from "../components/MediaPicker";
import { CatalogTransfer } from "../components/CatalogTransfer";
type ProductForm = {
  name: string;
  sku: string;
  alternate_name: string;
  brand: string;
  category: string;
  description: string;
  type: "standard" | "weighted" | "service";
  unit: string;
  cost_price: string;
  selling_price: string;
  wholesale_price: string;
  tax_rate: string;
  tax_inclusive: boolean;
  reorder_level: string;
  active: boolean;
  barcodes_text: string;
  version?: number;
};
const blank: ProductForm = {
  name: "",
  sku: "",
  alternate_name: "",
  brand: "",
  category: "",
  description: "",
  type: "standard",
  unit: "piece",
  cost_price: "0.0000",
  selling_price: "0.00",
  wholesale_price: "",
  tax_rate: "0.0000",
  tax_inclusive: false,
  reorder_level: "0.000",
  active: true,
  barcodes_text: "",
};
export function CatalogPage() {
  const o = useOperations();
  const client = useQueryClient();
  const notify = useClient((s) => s.notify);
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [view, setView] = useState<"grid" | "table">(() =>
    localStorage.getItem("techpos:catalog-view") === "table" ? "table" : "grid",
  );
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(search), 220);
    return () => clearTimeout(timer);
  }, [search]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<string | null | undefined>();
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const list = useQuery({
    queryKey: [
      "products",
      o.business.tenant.public_id,
      o.branch,
      o.warehouse,
      searchTerm,
      page,
      includeInactive,
    ],
    queryFn: ({ signal }) =>
      ops<Page<Product>>(
        "products?" +
          query({
            branch: o.branch,
            warehouse: o.warehouse,
            q: searchTerm,
            page,
            include_inactive: includeInactive ? 1 : 0,
          }),
        { signal },
      ),
    enabled: o.ready,
  });
  const category = useMutation({
    mutationFn: () => ops("categories", json("POST", { name: categoryName })),
    onSuccess: () => {
      setCategoryOpen(false);
      setCategoryName("");
      client.invalidateQueries({ queryKey: ["categories"] });
      notify("Category created.");
    },
  });
  if (o.setup.isPending) return <Loading />;
  if (o.setup.error) return <ErrorBox error={o.setup.error} />;
  if (!o.setup.data || !o.setup.data.branches.length)
    return (
      <ErrorBox
        error={new Error("No permitted operational branch is available.")}
      />
    );
  return (
    <>
      <PageTitle
        title="A catalog that’s ready to sell."
        description="Manage real products, barcodes, pricing and stock preferences."
        action={
          <div className="row catalog-actions">
            <CatalogTransfer />
            {o.business.permissions.includes("products.create") && (
              <>
                <button
                  className="button secondary"
                  onClick={() => setCategoryOpen(true)}
                >
                  Add category
                </button>
                {/* New products need an actual cost, which the server only accepts with products.view_cost. */}
                {o.business.permissions.includes("products.view_cost") && (
                  <button className="button" onClick={() => setEditing(null)}>
                    <Plus size={17} />
                    Add product
                  </button>
                )}
              </>
            )}
          </div>
        }
      />
      <OperationLocation
        setup={o.setup.data}
        branch={o.branch}
        warehouse={o.warehouse}
        onBranch={o.setBranch}
        onWarehouse={o.setWarehouse}
      />
      <div className="toolbar mt">
        <div className="input-icon">
          <Search size={17} />
          <input
            aria-label="Search catalog"
            placeholder="Name, SKU, barcode, brand or category…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div
          className="catalog-view-toggle"
          role="group"
          aria-label="Catalog layout"
        >
          <button
            className="icon-button"
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            onClick={() => {
              setView("grid");
              localStorage.setItem("techpos:catalog-view", "grid");
            }}
          >
            <LayoutGrid size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Table view"
            aria-pressed={view === "table"}
            onClick={() => {
              setView("table");
              localStorage.setItem("techpos:catalog-view", "table");
            }}
          >
            <List size={18} />
          </button>
        </div>
      </div>
      {o.business.permissions.includes("products.edit") && (
        <label className="check-label">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => {
              setIncludeInactive(e.target.checked);
              setPage(1);
            }}
          />
          Include inactive products
        </label>
      )}
      <ErrorBox error={list.error} />
      <section className="panel">
        {list.isPending ? (
          <Loading />
        ) : !list.data?.data.length ? (
          <div className="empty">
            <Package size={32} />
            <h3>Your catalog starts here.</h3>
            <p>Add your first product, then record its actual opening stock.</p>
          </div>
        ) : (
          <>
            <div className="catalog-result-count">
              <span>{list.data.total} products</span>
              <span className="muted">
                {o.business.tenant.currency} ·{" "}
                {
                  o.setup.data.warehouses.find(
                    (w) => w.public_id === o.warehouse,
                  )?.name
                }
              </span>
            </div>
            {view === "grid" ? (
              <div className="catalog-grid">
                {list.data.data.map((p) => {
                  const low =
                    p.track_stock &&
                    scaled(p.stock_quantity, 3) <= scaled(p.reorder_level, 3);
                  return (
                    <article key={p.public_id} className="catalog-card">
                      <div className="catalog-card-photo">
                        <ProductImage image={p.image} name={p.name} />
                        <span
                          className={`catalog-stock-label ${low ? "low" : ""}`}
                        >
                          {!p.active
                            ? "Inactive"
                            : !p.track_stock
                              ? "Service"
                              : low
                                ? "Low stock"
                                : "In stock"}
                        </span>
                      </div>
                      <div className="catalog-card-body">
                        <p className="eyebrow">{p.category_name ?? p.type}</p>
                        <h3>{p.name}</h3>
                        <span className="catalog-sku">{p.sku}</span>
                        <div className="row between">
                          <strong className="catalog-card-price">
                            {o.business.tenant.currency}{" "}
                            {Number(p.selling_price).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </strong>
                          <span className="muted">
                            {p.track_stock
                              ? `${p.stock_quantity.replace(/\.000$/, "")} ${p.unit}`
                              : "Non-stock"}
                          </span>
                        </div>
                        <div className="catalog-card-actions">
                          {o.business.permissions.includes("products.edit") && (
                            <button
                              className="text-button"
                              onClick={() => setEditing(p.public_id)}
                            >
                              Edit
                            </button>
                          )}
                          {p.track_stock &&
                            o.permissions.includes("inventory.adjust") && (
                              <button
                                className="text-button"
                                onClick={() => setAdjusting(p)}
                              >
                                Record stock
                              </button>
                            )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="responsive-table">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU / barcode</th>
                      <th>Price</th>
                      <th>Stock</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.data.map((p) => (
                      <tr key={p.public_id}>
                        <td>
                          <div className="catalog-product">
                            <ProductImage image={p.image} name={p.name} />
                            <div>
                              <strong>{p.name}</strong>
                              <small className="table-subtext">
                                {p.category_name ?? p.type} · {p.unit}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          {p.sku}
                          <small className="table-subtext">
                            {p.barcodes.map((b) => b.barcode).join(", ") ||
                              "No barcode"}
                          </small>
                        </td>
                        <td>
                          {o.business.tenant.currency} {p.selling_price}
                          <small className="table-subtext">
                            {p.tax_rate}%{" "}
                            {p.tax_inclusive ? "included" : "exclusive"}
                          </small>
                        </td>
                        <td>
                          {p.track_stock ? p.stock_quantity : "Service"}
                          {p.track_stock &&
                            scaled(p.stock_quantity, 3) <=
                              scaled(p.reorder_level, 3) && (
                              <small className="table-subtext danger-text">
                                Low stock
                              </small>
                            )}
                        </td>
                        <td>
                          <div className="row">
                            {o.business.permissions.includes(
                              "products.edit",
                            ) && (
                              <button
                                className="text-button"
                                onClick={() => setEditing(p.public_id)}
                              >
                                Edit
                              </button>
                            )}
                            {p.track_stock &&
                              o.permissions.includes("inventory.adjust") && (
                                <button
                                  className="text-button"
                                  onClick={() => setAdjusting(p)}
                                >
                                  Record stock
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pagination">
              <button
                className="button secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>
                Page {page} of {list.data.last_page} · {list.data.total}{" "}
                products
              </span>
              <button
                className="button secondary"
                disabled={page >= list.data.last_page}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
      <Modal
        open={editing !== undefined}
        onOpenChange={(v) => {
          if (!v) setEditing(undefined);
        }}
        title={editing ? "Edit product" : "Add your first details"}
        description="Prices and quantities use exact decimals. Existing transaction history is preserved."
      >
        {editing !== undefined && (
          <ProductEditor
            key={editing ?? "new"}
            id={editing}
            onSaved={() => {
              setEditing(undefined);
              client.invalidateQueries({ queryKey: ["products"] });
              client.invalidateQueries({ queryKey: ["pos-products"] });
              client.invalidateQueries({ queryKey: ["setup-checklist"] });
              notify("Product saved.");
            }}
          />
        )}
      </Modal>
      <Modal
        open={!!adjusting}
        onOpenChange={(v) => {
          if (!v) setAdjusting(null);
        }}
        title={`Record stock · ${adjusting?.name ?? ""}`}
        description="Every change becomes an immutable inventory movement. Enter the actual counted quantity and cost."
      >
        {adjusting && (
          <AdjustmentForm
            product={adjusting}
            branch={o.branch}
            warehouse={o.warehouse}
            onSaved={() => {
              setAdjusting(null);
              client.invalidateQueries({ queryKey: ["products"] });
              notify("Stock movement recorded.");
            }}
          />
        )}
      </Modal>
      <Modal
        open={categoryOpen}
        onOpenChange={setCategoryOpen}
        title="Create a category"
        description="Use categories to organize product search."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            category.mutate();
          }}
        >
          <ErrorBox error={category.error} />
          <label>
            Category name
            <input
              required
              maxLength={120}
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
            />
          </label>
          <button className="button full mt" disabled={category.isPending}>
            Save category
          </button>
        </form>
      </Modal>
    </>
  );
}
function ProductEditor({
  id,
  onSaved,
}: {
  id: string | null;
  onSaved: () => void;
}) {
  const client = useQueryClient();
  const { business } = useWorkspace();
  const canCost = business.permissions.includes("products.view_cost");
  const canTax = business.permissions.includes("settings.tax");
  const canEditPhotos = business.permissions.includes("products.edit");
  const form = useForm<ProductForm>({ defaultValues: blank });
  const [workingId, setWorkingId] = useState(id);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [photoError, setPhotoError] = useState("");
  useEffect(() => {
    if (!photo) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const defaults = useQuery({
    queryKey: ["tax-profile", business.tenant.public_id],
    queryFn: () =>
      api<{ tax_profile: { default_rate: string; tax_inclusive: boolean } }>(
        "settings/tax",
      ),
    enabled: !id && canTax,
  });
  useEffect(() => {
    if (!id && defaults.data && !form.getFieldState("tax_rate").isDirty) {
      form.setValue("tax_rate", defaults.data.tax_profile.default_rate);
      if (!form.getFieldState("tax_inclusive").isDirty)
        form.setValue("tax_inclusive", defaults.data.tax_profile.tax_inclusive);
    }
  }, [id, defaults.data, form]);
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => ops<{ public_id: string; name: string }[]>("categories"),
  });
  const [loaded, setLoaded] = useState(!id);
  const detail = useQuery({
    queryKey: ["product-detail", id],
    queryFn: async () => {
      const p = await ops<
        ProductForm & {
          image: import("../components/ProductImage").MediaImage | null;
          barcodes: { barcode: string; quantity: string }[];
          price_history: {
            old_price: string | null;
            new_price: string;
            created_at: string;
          }[];
        }
      >(`products/${id}`);
      form.reset({
        ...p,
        tax_inclusive: !!p.tax_inclusive,
        active: !!p.active,
        barcodes_text: p.barcodes.map((b) => b.barcode).join("\n"),
      });
      setLoaded(true);
      return p;
    },
    enabled: !!id,
    // queryFn hydrates the form, so it must run on every editor mount (a cached
    // entry would leave the editor loading forever and carry a stale version),
    // and must not refetch mid-edit and wipe unsaved input.
    staleTime: Infinity,
    gcTime: 0,
  });
  const save = useMutation({
    mutationFn: async (v: ProductForm) => {
      const { barcodes_text, ...rest } = v;
      const saved = await ops<{ public_id: string; version: number }>(
        workingId ? `products/${workingId}` : "products",
        json(workingId ? "PUT" : "POST", {
          ...rest,
          cost_price: id && !canCost ? undefined : v.cost_price,
          category: v.category || null,
          wholesale_price: v.wholesale_price || null,
          barcodes: barcodes_text
            .split(/[\n,]+/)
            .map((b) => b.trim())
            .filter(Boolean)
            .map((barcode) => ({ barcode, quantity: "1.000" })),
        }),
      );
      setWorkingId(saved.public_id);
      form.setValue("version", saved.version);
      if (photo) {
        const data = new FormData();
        data.append("image", photo);
        try {
          await api(`operations/products/${saved.public_id}/image`, {
            method: "POST",
            body: data,
          });
        } catch (e) {
          throw new Error(
            `Product details were saved, but the photo could not be uploaded. Choose a valid image and save again. ${errorText(e)}`,
          );
        }
      }
      return saved;
    },
    onSuccess: onSaved,
  });
  if (!loaded)
    return detail.error ? <ErrorBox error={detail.error} /> : <Loading />;
  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))}>
      <ErrorBox error={save.error ?? categories.error} />
      {id ? (
        <MediaPicker
          image={detail.data?.image}
          endpoint={`operations/products/${id}/image`}
          label="Product photo"
          onChange={(image) => {
            client.setQueryData(
              ["product-detail", id],
              (old: typeof detail.data) => (old ? { ...old, image } : old),
            );
            client.invalidateQueries({ queryKey: ["products"] });
            client.invalidateQueries({ queryKey: ["pos-products"] });
          }}
        />
      ) : canEditPhotos ? (
        <div className="media-picker">
          <span className="product-photo">
            {preview ? (
              <img src={preview} alt="New product photo preview" />
            ) : (
              <Package size={26} />
            )}
          </span>
          <div>
            <label>
              Product photo <small className="muted">Optional</small>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (
                    file &&
                    (!/^image\/(jpeg|png|webp)$/.test(file.type) ||
                      file.size > 4 * 1024 * 1024)
                  ) {
                    setPhotoError("Choose a JPEG, PNG or WebP up to 4 MB.");
                    setPhoto(null);
                    e.target.value = "";
                    return;
                  }
                  setPhotoError("");
                  setPhoto(file ?? null);
                }}
              />
            </label>
            <p className="muted">JPEG, PNG or WebP · up to 4 MB</p>
            {(photo || photoError) && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setPhoto(null);
                  setPhotoError("");
                }}
              >
                Skip photo
              </button>
            )}
            {photoError && (
              <p className="field-error" role="alert">
                {photoError}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="muted">
          A product editor can add a photo after you create this product.
        </p>
      )}
      <div className="form-grid">
        <label>
          Product name
          <input required maxLength={180} {...form.register("name")} />
        </label>
        <label>
          SKU
          <input required maxLength={80} {...form.register("sku")} />
        </label>
        <label>
          Product type
          <select {...form.register("type")}>
            <option value="standard">Inventory product</option>
            <option value="weighted">Weighted product</option>
            <option value="service">Non-stock service</option>
          </select>
        </label>
        <label>
          Unit
          <input required maxLength={30} {...form.register("unit")} />
        </label>
        {canCost && (
          <label>
            Cost price
            <input
              required
              inputMode="decimal"
              {...form.register("cost_price")}
            />
          </label>
        )}
        <label>
          Selling price
          <input
            required
            inputMode="decimal"
            {...form.register("selling_price")}
          />
        </label>
        <label>
          Wholesale price (optional)
          <input inputMode="decimal" {...form.register("wholesale_price")} />
        </label>
        <label>
          Reorder level
          <input
            required
            inputMode="decimal"
            {...form.register("reorder_level")}
          />
        </label>
        <label>
          Tax rate (%)
          <input required inputMode="decimal" {...form.register("tax_rate")} />
        </label>
        <label>
          Category
          <select {...form.register("category")}>
            <option value="">Uncategorized</option>
            {categories.data?.map((c) => (
              <option key={c.public_id} value={c.public_id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Brand
          <input maxLength={100} {...form.register("brand")} />
        </label>
        <label>
          Alternate name
          <input maxLength={180} {...form.register("alternate_name")} />
        </label>
      </div>
      <label>
        Barcodes (one per line)
        <textarea {...form.register("barcodes_text")} rows={2} />
      </label>
      <label>
        Description
        <textarea {...form.register("description")} rows={2} />
      </label>
      <div className="row">
        <label className="check-label">
          <input type="checkbox" {...form.register("tax_inclusive")} />
          Prices include tax
        </label>
        <label className="check-label">
          <input type="checkbox" {...form.register("active")} />
          Active product
        </label>
      </div>
      {!!detail.data?.price_history?.length && (
        <details className="mt">
          <summary>Price history</summary>
          {detail.data.price_history.map((h, i) => (
            <p className="muted" key={i}>
              {h.created_at}: {h.old_price ?? "Created"} → {h.new_price}
            </p>
          ))}
        </details>
      )}
      <button
        className="button full mt"
        disabled={save.isPending || !!photoError}
      >
        Save product
      </button>
    </form>
  );
}
export function AdjustmentForm({
  product,
  branch,
  warehouse,
  onSaved,
}: {
  product: Product;
  branch: string;
  warehouse: string;
  onSaved: () => void;
}) {
  const [type, setType] = useState("opening_stock");
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState(product.cost_price ?? "");
  const [reason, setReason] = useState("");
  const [key] = useState(crypto.randomUUID());
  const save = useMutation({
    mutationFn: () =>
      ops(
        "inventory/adjustments",
        json("POST", {
          branch,
          warehouse,
          product: product.public_id,
          type,
          quantity:
            (type === "damage" || type === "expiry") &&
            !quantity.startsWith("-")
              ? "-" + quantity
              : quantity,
          unit_cost: cost || null,
          reason,
          idempotency_key: key,
        }),
      ),
    onSuccess: onSaved,
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <ErrorBox error={save.error} />
      <p className="muted">
        Current balance: {product.stock_quantity} {product.unit}
      </p>
      <label>
        Movement type
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="opening_stock">Opening stock / counted receipt</option>
          <option value="adjustment">Adjustment (signed quantity)</option>
          <option value="damage">Damage (remove stock)</option>
          <option value="expiry">Expiry (remove stock)</option>
        </select>
      </label>
      <label>
        Quantity
        <input
          required
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </label>
      <label>
        Actual unit cost (required for additions)
        <input
          inputMode="decimal"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
        />
      </label>
      <label>
        Reason
        <input
          required
          minLength={3}
          maxLength={255}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button className="button full mt" disabled={save.isPending}>
        Record inventory movement
      </button>
    </form>
  );
}
export function InventoryPage() {
  const o = useOperations();
  const [page, setPage] = useState(1);
  const data = useQuery({
    queryKey: [
      "movements",
      o.business.tenant.public_id,
      o.branch,
      o.warehouse,
      page,
    ],
    queryFn: () =>
      ops<
        Page<{
          public_id: string;
          type: string;
          name: string;
          sku: string;
          quantity: string;
          cost_value?: string;
          reason: string;
          created_at: string;
        }>
      >(
        "inventory/movements?" +
          query({ branch: o.branch, warehouse: o.warehouse, page }),
      ),
    enabled: o.ready,
  });
  if (o.setup.isPending) return <Loading />;
  if (o.setup.error) return <ErrorBox error={o.setup.error} />;
  return (
    <>
      <PageTitle
        title="Every movement has a story."
        description="An immutable stock trail, with actual cost valuation."
        action={
          <Link className="button secondary" to="/catalog">
            <ClipboardList size={17} />
            Manage catalog
          </Link>
        }
      />
      {o.setup.data && (
        <OperationLocation
          setup={o.setup.data}
          branch={o.branch}
          warehouse={o.warehouse}
          onBranch={(v) => {
            o.setBranch(v);
            setPage(1);
          }}
          onWarehouse={(v) => {
            o.setWarehouse(v);
            setPage(1);
          }}
        />
      )}
      <ErrorBox error={data.error} />
      <section className="panel mt">
        {data.isPending ? (
          <Loading />
        ) : !data.data?.data.length ? (
          <p className="empty">
            No stock movements yet. Record actual opening stock in the catalog.
          </p>
        ) : (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Product</th>
                  <th>Movement</th>
                  <th>Quantity</th>
                  <th>Cost value</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {data.data.data.map((m) => (
                  <tr key={m.public_id}>
                    <td>{new Date(m.created_at + "Z").toLocaleString()}</td>
                    <td>
                      {m.name}
                      <small className="table-subtext">{m.sku}</small>
                    </td>
                    <td>{m.type.replaceAll("_", " ")}</td>
                    <td>{m.quantity}</td>
                    <td>{m.cost_value ?? "Restricted"}</td>
                    <td>{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!!data.data && data.data.last_page > 1 && (
          <div className="pagination">
            <button
              className="button secondary"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {data.data.last_page}
            </span>
            <button
              className="button secondary"
              disabled={page >= data.data.last_page}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </>
  );
}
