import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { ArrowUpRight, Percent, Store } from "lucide-react";
import { api, json, useClient } from "../lib/api";
import { useWorkspace } from "../App";
import { ErrorBox, Loading, PageTitle } from "../components/ui";
type Profile = {
  name: string;
  default_rate: string;
  tax_inclusive: boolean;
  registration_number: string;
};
export function SettingsPage() {
  const { business, me } = useWorkspace();
  const client = useQueryClient();
  const notify = useClient((s) => s.notify);
  const form = useForm<Profile>({
    defaultValues: {
      name: "Tax",
      default_rate: "0",
      tax_inclusive: false,
      registration_number: "",
    },
  });
  const tax = useQuery({
    queryKey: ["tax-profile", business.tenant.public_id],
    queryFn: () => api<{ tax_profile: Profile }>("settings/tax"),
    enabled: business.permissions.includes("settings.tax"),
  });
  // The profile can be served from cache (the product editor shares this key),
  // in which case queryFn never runs; hydrate the form from the data instead.
  const profile = tax.data?.tax_profile;
  useEffect(() => {
    if (profile) form.reset(profile);
  }, [profile, form]);
  const save = useMutation({
    mutationFn: (v: Profile) => api("settings/tax", json("PUT", v)),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["tax-profile"] });
      void client.invalidateQueries({ queryKey: ["setup-checklist"] });
      notify(
        "Tax defaults saved. Existing products and sales keep their recorded tax settings.",
      );
    },
  });
  return (
    <>
      <PageTitle
        title="Your business settings."
        description="Keep your business details and product tax defaults in one place."
      />
      <div className="settings-layout">
        <section className="panel">
          <div className="settings-heading">
            <span className="module-icon">
              <Store size={22} />
            </span>
            <div>
              <h2>Business profile</h2>
              <p className="muted">
                {business.tenant.name} · {business.tenant.currency} ·{" "}
                {business.tenant.timezone}
              </p>
            </div>
          </div>
          <p>
            Update your industry, business details, logo and preferences in
            Business setup.
          </p>
          {business.permissions.includes("onboarding.manage") && (
            <Link to="/onboarding" className="button secondary">
              Edit business profile
              <ArrowUpRight size={16} />
            </Link>
          )}
        </section>
        <section className="panel">
          <div className="settings-heading">
            <span className="module-icon">
              <Percent size={22} />
            </span>
            <div>
              <h2>Tax defaults</h2>
              <p className="muted">Used when you create a new product.</p>
            </div>
          </div>
          <p className="muted">
            Each product keeps its own tax rate. Saving these defaults does not
            change existing products or finalized sales.
          </p>
          {!business.permissions.includes("settings.tax") ? (
            <p>
              Your role does not allow tax changes. Ask your business owner.
            </p>
          ) : !profile && tax.isPending ? (
            <Loading />
          ) : (
            <form onSubmit={form.handleSubmit((v) => save.mutate(v))}>
              <ErrorBox error={tax.error ?? save.error} />
              <div className="form-grid">
                <label>
                  Tax name
                  <input required maxLength={80} {...form.register("name")} />
                </label>
                <label>
                  Default tax rate (%)
                  <input
                    required
                    inputMode="decimal"
                    pattern="\d{1,3}(\.\d{1,4})?"
                    {...form.register("default_rate")}
                  />
                </label>
                <label className="span-two">
                  Tax registration number{" "}
                  <small className="muted">Optional</small>
                  <input
                    maxLength={100}
                    {...form.register("registration_number")}
                  />
                </label>
              </div>
              <label className="check-label">
                <input type="checkbox" {...form.register("tax_inclusive")} />
                New product prices include tax
              </label>
              <button
                className="button mt"
                disabled={save.isPending || !me.user.email_verified_at}
              >
                Save tax defaults
              </button>
              {!me.user.email_verified_at && (
                <p className="muted">
                  Verify your email before changing tax settings.
                </p>
              )}
              <p className="muted">
                This is product tax configuration. Fiscal/FBR submission is not
                connected.
              </p>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
