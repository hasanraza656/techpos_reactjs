export type User = {
  public_id: string;
  name: string;
  email: string;
  is_superadmin: boolean;
  platform_access?: boolean;
  email_verified_at: string | null;
};
export type Membership = {
  public_id: string;
  name: string;
  status: string;
  is_owner: boolean;
};
export type Me = { user: User; tenants: Membership[] };
export type Plan = {
  id: number;
  key: string;
  name: string;
  description: string;
  limits: Record<string, number>;
  prices: { amount: string; currency: string }[];
};
export type Business = {
  currency_locked?: boolean;
  logo?: import("../components/ProductImage").MediaImage | null;
  tenant: {
    public_id: string;
    name: string;
    timezone: string;
    locale: string;
    currency: string;
  };
  permissions: string[];
  plan: Plan;
  subscription: { ends_at: string | null; status: string };
  branches: { public_id: string; name: string; address: string | null }[];
  onboarding: {
    step: number;
    completed_at: string | null;
    deferred_at?: string | null;
    revision?: number;
  };
};
export type Module = {
  availability: "available" | "partial" | "planned";
  key: string;
  name: string;
  category: string;
  description: string;
  dependencies: string[];
  included: boolean;
  enabled: boolean;
  missing_dependencies: string[];
  requires_configuration: boolean;
};
export type Industry = {
  key: string;
  name: string;
  description: string;
  template: { recommended_modules: string[]; labels: Record<string, string> };
};
export type Payment = {
  id: number;
  public_id: string;
  plan_id: number;
  payment_method_id: number;
  amount: string;
  status: string;
  transaction_reference: string | null;
  paid_on: string | null;
  review_note: string | null;
  has_proof: boolean;
  expires_at: string;
  events: {
    id: number;
    status: string;
    note: string | null;
    created_at: string;
  }[];
};
export type Catalog = {
  plans: Plan[];
  payment_methods: {
    id: number;
    name: string;
    details: Record<string, string>;
  }[];
};
