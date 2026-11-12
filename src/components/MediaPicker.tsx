import { useId, useState } from "react";
import { Camera, LoaderCircle, Trash2 } from "lucide-react";
import { api, errorText } from "../lib/api";
import { ProductImage } from "./ProductImage";
import type { MediaImage } from "./ProductImage";
export function MediaPicker({
  image,
  endpoint,
  label,
  onChange,
}: {
  image?: MediaImage | null;
  endpoint: string;
  label: string;
  onChange: (image: MediaImage | null) => void;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload(file?: File) {
    if (!file) return;
    if (
      !/^image\/(jpeg|png|webp)$/.test(file.type) ||
      file.size > 4 * 1024 * 1024
    ) {
      setError("Choose a JPEG, PNG or WebP image up to 4 MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.append("image", file);
      onChange(await api<MediaImage>(endpoint, { method: "POST", body: data }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api(endpoint, { method: "DELETE" });
      onChange(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="media-picker">
      <ProductImage image={image} name={label} />
      <div>
        <strong>{label}</strong>
        <p className="muted">JPEG, PNG or WebP · up to 4 MB</p>
        <div className="row">
          <label
            htmlFor={id}
            className={`button secondary ${busy ? "is-disabled" : ""}`}
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Camera size={16} />
            )}
            {busy ? "Saving image…" : image ? "Change photo" : "Upload photo"}
          </label>
          <input
            id={id}
            type="file"
            className="sr-only"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {image && (
            <button
              type="button"
              className="icon-button"
              disabled={busy}
              aria-label={`Remove ${label.toLowerCase()}`}
              onClick={() => void remove()}
            >
              <Trash2 size={17} />
            </button>
          )}
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
