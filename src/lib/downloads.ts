import { ApiError, csrf, useClient } from "./api";
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadApi(path: string, filename: string) {
  const tenant = useClient.getState().tenant;
  await csrf();
  const response = await fetch(`/api/v1/${path}`, {
    credentials: "include",
    headers: { Accept: "text/csv, application/json", "X-Tenant-ID": tenant },
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: "The export could not be prepared." }));
    throw new ApiError(
      error.message ?? "Export failed.",
      response.status,
      error.errors ?? {},
    );
  }
  saveBlob(await response.blob(), filename);
}
