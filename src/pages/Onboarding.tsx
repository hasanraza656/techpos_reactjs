import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CloudCheck,
  Coffee,
  Gamepad2,
  Globe2,
  Hammer,
  HeartPulse,
  Laptop,
  LoaderCircle,
  MapPin,
  Scissors,
  Search,
  Shirt,
  ShoppingBasket,
  Sparkles,
  Store,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";
import { api, ApiError, json, useClient } from "../lib/api";
import { useWorkspace } from "../App";
import type { Industry } from "../lib/types";
import { ErrorBox, Loading } from "../components/ui";
import { MediaPicker } from "../components/MediaPicker";
import { ModulesContent } from "./Configuration";
import { SetupChecklist } from "../components/SetupChecklist";

type Answers = Record<string, string>;
type Progress = {
  step: number;
  data: string;
  revision: number;
  completed_at: string | null;
  deferred_at: string | null;
};
const steps = [
  { name: "Your industry", detail: "Start with what you do" },
  { name: "How you work", detail: "A few quick questions" },
  { name: "Business details", detail: "Make it feel like yours" },
  { name: "Your workspace", detail: "Choose your essentials" },
  { name: "Ready to go", detail: "Take your first step" },
];
const languages = {
  en: "English",
  ur: "اردو",
  "ur-Latn": "Roman Urdu",
  ar: "العربية",
  hi: "हिन्दी",
};
function IndustryIcon({ industry }: { industry: string }) {
  const Icon = /pharmacy/.test(industry)
    ? HeartPulse
    : /restaurant|bakery/.test(industry)
      ? UtensilsCrossed
      : /cafe/.test(industry)
        ? Coffee
        : /salon/.test(industry)
          ? Scissors
          : /gaming/.test(industry)
            ? Gamepad2
            : /clothing|fashion/.test(industry)
              ? Shirt
              : /electronics|mobile/.test(industry)
                ? Laptop
                : /hardware|electrical/.test(industry)
                  ? Hammer
                  : /service/.test(industry)
                    ? Wrench
                    : /grocery|supermarket|superstore/.test(industry)
                      ? ShoppingBasket
                      : Store;
  return <Icon size={23} strokeWidth={1.7} />;
}
function ChoiceQuestion({
  title,
  description,
  value,
  options,
  onChange,
}: {
  title: string;
  description: string;
  value?: string;
  options: [string, string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <fieldset className="setup-question">
      <legend>{title}</legend>
      <p className="muted">{description}</p>
      <div className="setup-choices" role="group" aria-label={title}>
        {options.map(([key, label, help]) => (
          <button
            type="button"
            key={key}
            className={`setup-choice ${value === key ? "selected" : ""}`}
            aria-pressed={value === key}
            onClick={() => onChange(value === key ? "" : key)}
          >
            <span className="choice-radio" aria-hidden="true">
              {value === key && <Check size={13} />}
            </span>
            <span>
              <strong>{label}</strong>
              <small>{help}</small>
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function OnboardingPage() {
  const { business } = useWorkspace();
  const client = useQueryClient();
  const navigate = useNavigate();
  const notify = useClient((s) => s.notify);
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState("");
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const [error, setError] = useState<unknown>();
  const [conflict, setConflict] = useState(false);
  const latest = useRef<Answers>({});
  const revision = useRef(1);
  const blocked = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const navLock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const industries = useQuery({
    queryKey: ["industries"],
    queryFn: () => api<Industry[]>("industries"),
  });
  const progress = useQuery({
    queryKey: ["onboarding", business.tenant.public_id],
    queryFn: () => api<Progress>("onboarding"),
  });
  const hydrate = useCallback(
    (p: Progress) => {
      const saved = JSON.parse(p.data) as Answers;
      // Only answer fields are rehydrated; transport/control fields never become editable answers.
      const keys = [
        "industry_key",
        "business_model",
        "operation",
        "locations",
        "name",
        "phone",
        "address",
        "city",
        "country",
        "currency",
        "timezone",
        "locale",
      ];
      const a: Answers = {
        name: business.tenant.name,
        country: "PK",
        currency: business.tenant.currency,
        timezone: business.tenant.timezone,
        locale: business.tenant.locale,
      };
      keys.forEach((k) => {
        if (typeof saved[k] === "string") a[k] = saved[k];
      });
      latest.current = a;
      revision.current = p.revision;
      blocked.current = false;
      setAnswers(a);
      setStep(p.completed_at ? 1 : p.step);
      setDirty(false);
      setConflict(false);
      setError(undefined);
      setReady(true);
    },
    [business.tenant],
  );
  useEffect(() => {
    if (progress.data && !ready) hydrate(progress.data);
  }, [progress.data, ready, hydrate]);
  useEffect(() => {
    if (ready) heading.current?.focus({ preventScroll: true });
  }, [step, ready]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const persist = useCallback(
    (
      snapshot: Answers,
      next: number,
      flags: { completed?: boolean; deferred?: boolean } = {},
    ) => {
      setPending((n) => n + 1);
      const task = queue.current
        .catch(() => undefined)
        .then(async () => {
          if (blocked.current)
            throw new Error(
              "Review the latest saved answers before continuing.",
            );
          const clean = Object.fromEntries(
            Object.entries(snapshot).map(([k, v]) => [
              k,
              v || (k === "name" ? business.tenant.name : null),
            ]),
          );
          try {
            const saved = await api<{ revision: number }>(
              "onboarding",
              json("PUT", {
                ...clean,
                step: next,
                revision: revision.current,
                ...flags,
              }),
            );
            revision.current = saved.revision;
            if (JSON.stringify(snapshot) === JSON.stringify(latest.current))
              setDirty(false);
            setError(undefined);
          } catch (e) {
            if (e instanceof ApiError && e.status === 409) {
              blocked.current = true;
              setConflict(true);
            }
            setError(e);
            throw e;
          }
        })
        .finally(() => setPending((n) => n - 1));
      queue.current = task;
      return task;
    },
    [business.tenant.name],
  );
  useEffect(() => {
    if (!ready || !dirty || navigating || conflict) return;
    const timer = setTimeout(() => {
      void persist({ ...latest.current }, step).catch(() => undefined);
    }, 750);
    return () => clearTimeout(timer);
  }, [answers, ready, dirty, navigating, conflict, step, persist]);
  function update(key: string, value: string) {
    const next = { ...latest.current, [key]: value };
    latest.current = next;
    setAnswers(next);
    setDirty(true);
  }
  async function move(
    next: number,
    flags: { completed?: boolean; deferred?: boolean } = {},
    destination?: string,
  ) {
    if (navLock.current) return;
    navLock.current = true;
    setNavigating(true);
    try {
      await persist({ ...latest.current }, next, flags);
      setStep(next);
      if (flags.completed || flags.deferred) {
        await client.invalidateQueries({ queryKey: ["business"] });
        await client.invalidateQueries({ queryKey: ["setup-checklist"] });
        if (flags.completed)
          notify("Your workspace is ready. Start with whatever you need.");
        navigate(destination ?? "/");
      }
    } catch {
      /* The saved answers and visible error remain available for retry. */
    } finally {
      navLock.current = false;
      setNavigating(false);
    }
  }
  if (
    progress.isPending ||
    industries.isPending ||
    (!ready && !progress.error && !industries.error)
  )
    return <Loading />;
  if (progress.error || industries.error)
    return <ErrorBox error={progress.error ?? industries.error} />;
  const selected = industries.data?.find((i) => i.key === answers.industry_key);
  const visible =
    industries.data?.filter((i) =>
      `${i.name} ${i.description}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    ) ?? [];
  const titles = [
    "What kind of business do you run?",
    "How does your business work?",
    "Let’s make this your space.",
    "The right tools, at your pace.",
    "You’re ready for your first day.",
  ];
  return (
    <div className="setup-page">
      <header className="setup-page-header">
        <div>
          <span className="eyebrow">A WORKSPACE THAT FITS YOU</span>
          <h1>Welcome to your next chapter.</h1>
          <p className="muted">
            A few quick choices. You can change them anytime.
          </p>
        </div>
        <button
          className="text-button"
          disabled={navigating || conflict}
          onClick={() => void move(step, { deferred: true })}
        >
          Finish later <ArrowRight size={16} />
        </button>
      </header>
      <div className="setup-layout">
        <aside className="setup-rail">
          <div className="setup-rail-heading">
            <Sparkles size={21} />
            <strong>Let’s get you settled.</strong>
          </div>
          <p>
            Tell us a little about your business. We’ll help you find a useful
            starting point.
          </p>
          <ol>
            {steps.map((s, i) => (
              <li
                key={s.name}
                className={
                  i + 1 === step ? "active" : i + 1 < step ? "complete" : ""
                }
                aria-current={i + 1 === step ? "step" : undefined}
              >
                <span className="setup-step-dot">
                  {i + 1 < step ? <Check size={15} /> : i + 1}
                </span>
                <div>
                  <strong>{s.name}</strong>
                  <small>{s.detail}</small>
                </div>
              </li>
            ))}
          </ol>
          <div className="setup-reassurance">
            <CloudCheck size={19} />
            <span>
              Your answers save as you go.
              <br />
              No payment details needed.
            </span>
          </div>
        </aside>
        <section className="setup-main panel" aria-busy={navigating}>
          <div
            className="setup-mobile-progress"
            aria-label={`Step ${step} of 5`}
          >
            {steps.map((s, i) => (
              <span key={s.name} className={i + 1 <= step ? "done" : ""} />
            ))}
          </div>
          <div className="setup-heading">
            <span className="eyebrow">
              STEP {step} OF 5 · {steps[step - 1].name.toUpperCase()}
            </span>
            <h2 tabIndex={-1} ref={heading}>
              {titles[step - 1]}
            </h2>
            <p className="muted">
              {step === 1
                ? "Choose the closest match. Your records stay safe if you change industries later."
                : step === 2
                  ? "Tap the answers that fit. All three questions are optional."
                  : step === 3
                    ? "Use the defaults to get started. Everything here can be updated later."
                    : step === 4
                      ? "Your plan controls access. Industry recommendations include workflows still in development."
                      : "Setup is a starting point. You can try the product without completing every task."}
            </p>
          </div>
          <ErrorBox error={error} />
          {conflict && (
            <div className="setup-conflict">
              <p>
                Your answers are still visible here. Load the latest saved setup
                to resolve the difference.
              </p>
              <button
                className="button secondary"
                onClick={async () => {
                  await queue.current.catch(() => undefined);
                  const r = await progress.refetch();
                  if (r.data) hydrate(r.data);
                }}
              >
                Load saved setup
              </button>
            </div>
          )}
          <div className="setup-step-content" key={step}>
            {step === 1 && (
              <>
                <div className="input-icon setup-industry-search">
                  <Search size={18} />
                  <input
                    aria-label="Search industries"
                    placeholder="Search grocery, pharmacy, restaurant…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="setup-industry-grid">
                  {visible.map((i) => (
                    <button
                      type="button"
                      key={i.key}
                      className={`setup-industry-card ${answers.industry_key === i.key ? "selected" : ""}`}
                      aria-pressed={answers.industry_key === i.key}
                      onClick={() => update("industry_key", i.key)}
                    >
                      <span className="setup-industry-icon">
                        <IndustryIcon industry={i.key} />
                      </span>
                      <span className="setup-industry-text">
                        <strong>{i.name}</strong>
                        <small>{i.description}</small>
                      </span>
                      <span className="setup-selection" aria-hidden="true">
                        {answers.industry_key === i.key && <Check size={14} />}
                      </span>
                    </button>
                  ))}
                </div>
                {!visible.length && (
                  <div className="empty">
                    <Search size={25} />
                    <h3>No matches yet.</h3>
                    <p>
                      Try a broader search, or choose Other / Custom Business.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => setSearch("")}
                    >
                      Show all industries
                    </button>
                  </div>
                )}
              </>
            )}
            {step === 2 && (
              <>
                <ChoiceQuestion
                  title="How do you sell?"
                  description="This helps us suggest useful catalog and checkout defaults."
                  value={answers.business_model}
                  onChange={(v) => update("business_model", v)}
                  options={[
                    ["retail", "Retail", "Sell directly to customers"],
                    ["wholesale", "Wholesale", "Sell in bulk to businesses"],
                    ["both", "Retail & wholesale", "A mix of both"],
                    [
                      "services",
                      "Services only",
                      "Sell your time or expertise",
                    ],
                    [
                      "invoicing",
                      "Invoicing only",
                      "Send invoices for your work",
                    ],
                  ]}
                />
                <ChoiceQuestion
                  title="Where do you operate?"
                  description="Choose the channel that best describes your business."
                  value={answers.operation}
                  onChange={(v) => update("operation", v)}
                  options={[
                    [
                      "physical",
                      "Physical store",
                      "A shop or business location",
                    ],
                    ["online", "Online", "Website or social channels"],
                    ["both", "Both", "In person and online"],
                  ]}
                />
                <ChoiceQuestion
                  title="How many locations?"
                  description="You can start with one and grow later. Branch limits follow your plan."
                  value={answers.locations}
                  onChange={(v) => update("locations", v)}
                  options={[
                    ["one", "One location", "Keep everything in one place"],
                    [
                      "multiple",
                      "Multiple locations",
                      "Manage more than one branch",
                    ],
                    ["unsure", "Not sure yet", "I’m still figuring this out"],
                  ]}
                />
              </>
            )}
            {step === 3 && (
              <>
                <MediaPicker
                  image={business.logo}
                  endpoint="business/logo"
                  label="Business logo"
                  onChange={() => {
                    void client.invalidateQueries({ queryKey: ["business"] });
                  }}
                />
                <div className="form-grid setup-details">
                  <label className="span-two">
                    Business name
                    <input
                      maxLength={150}
                      value={answers.name ?? ""}
                      autoComplete="organization"
                      placeholder="Your business name"
                      onChange={(e) => update("name", e.target.value)}
                    />
                  </label>
                  <label>
                    Phone <small className="muted">Optional</small>
                    <input
                      maxLength={30}
                      type="tel"
                      autoComplete="tel"
                      placeholder="e.g. +92 300 1234567"
                      value={answers.phone ?? ""}
                      onChange={(e) => update("phone", e.target.value)}
                    />
                  </label>
                  <label>
                    City <small className="muted">Optional</small>
                    <input
                      maxLength={100}
                      autoComplete="address-level2"
                      placeholder="e.g. Lahore"
                      value={answers.city ?? ""}
                      onChange={(e) => update("city", e.target.value)}
                    />
                  </label>
                  <label className="span-two">
                    Address <small className="muted">Optional</small>
                    <input
                      maxLength={255}
                      autoComplete="street-address"
                      placeholder="Street, area or building"
                      value={answers.address ?? ""}
                      onChange={(e) => update("address", e.target.value)}
                    />
                  </label>
                  <label>
                    Country
                    <select
                      value={answers.country ?? "PK"}
                      onChange={(e) => update("country", e.target.value)}
                    >
                      {Object.entries({
                        PK: "Pakistan",
                        IN: "India",
                        AE: "United Arab Emirates",
                        SA: "Saudi Arabia",
                        GB: "United Kingdom",
                        US: "United States",
                        BD: "Bangladesh",
                        QA: "Qatar",
                        OM: "Oman",
                        CA: "Canada",
                        AU: "Australia",
                      }).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                      {answers.country &&
                        ![
                          "PK",
                          "IN",
                          "AE",
                          "SA",
                          "GB",
                          "US",
                          "BD",
                          "QA",
                          "OM",
                          "CA",
                          "AU",
                        ].includes(answers.country) && (
                          <option value={answers.country}>
                            {answers.country}
                          </option>
                        )}
                    </select>
                  </label>
                  <label>
                    Currency
                    <select
                      value={answers.currency ?? "PKR"}
                      disabled={business.currency_locked}
                      onChange={(e) => update("currency", e.target.value)}
                    >
                      {["PKR", "USD", "GBP", "EUR", "AED", "SAR", "INR"].map(
                        (c) => (
                          <option key={c}>{c}</option>
                        ),
                      )}
                    </select>
                    {business.currency_locked && (
                      <small className="muted">
                        Currency is fixed after the first stock movement, shift
                        or sale.
                      </small>
                    )}
                  </label>
                  <label>
                    Time zone
                    <select
                      value={answers.timezone ?? "Asia/Karachi"}
                      onChange={(e) => update("timezone", e.target.value)}
                    >
                      {Array.from(
                        new Set([
                          "Asia/Karachi",
                          ...(Intl.supportedValuesOf?.("timeZone") ?? []),
                          answers.timezone ?? "UTC",
                          "UTC",
                        ]),
                      ).map((zone) => (
                        <option key={zone}>{zone}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Preferred language
                    <select
                      value={answers.locale ?? "en"}
                      onChange={(e) => update("locale", e.target.value)}
                    >
                      {Object.entries(languages).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="setup-hint">
                  <Globe2 size={16} /> Language and terminology preferences are
                  saved. Untranslated screens currently fall back to English.
                </p>
              </>
            )}
            {step === 4 && (
              <>
                <div className="setup-personalized">
                  <span className="setup-industry-icon">
                    <IndustryIcon industry={answers.industry_key ?? ""} />
                  </span>
                  <div>
                    <strong>
                      Your {selected?.name ?? "business"} workspace
                    </strong>
                    <p>
                      Start with catalog, customers and checkout. Choose
                      additional module preferences below.
                    </p>
                  </div>
                </div>
                <ModulesContent
                  recommended={Array.from(
                    new Set([
                      "pos",
                      "inventory",
                      "customers",
                      "receipts",
                      "daily_summary",
                      "offline_basic",
                      ...(selected?.template.recommended_modules ?? []),
                    ]),
                  )}
                />
              </>
            )}
            {step === 5 && (
              <>
                <div className="setup-complete">
                  <span className="setup-success-icon">
                    <CheckCircle2 size={34} />
                  </span>
                  <h3>Welcome to {answers.name || business.tenant.name}.</h3>
                  <p>
                    Your answers are saved. Pick a first task, or head straight
                    to your workspace.
                  </p>
                  <div className="setup-summary">
                    <span>
                      <Store size={15} />
                      {selected?.name ?? "Your business"}
                    </span>
                    <span>
                      <MapPin size={15} />
                      {answers.locations === "multiple"
                        ? "Multiple locations planned"
                        : "Start with one location"}
                    </span>
                    <span>{answers.currency ?? "PKR"}</span>
                  </div>
                </div>
                <SetupChecklist
                  onNavigate={(to) => void move(5, { completed: true }, to)}
                />
              </>
            )}
          </div>
          <footer className="setup-footer">
            <button
              className="button secondary"
              disabled={step === 1 || navigating || conflict}
              onClick={() => void move(step - 1)}
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <span className="setup-save-state" role="status" aria-live="polite">
              {pending ? (
                <>
                  <LoaderCircle className="spin" size={15} />
                  Saving…
                </>
              ) : dirty ? (
                "Unsaved changes"
              ) : (
                <>
                  <CloudCheck size={16} />
                  All changes saved
                </>
              )}
            </span>
            <button
              className="button"
              disabled={
                navigating || conflict || (step === 1 && !answers.industry_key)
              }
              onClick={() =>
                void move(
                  step === 5 ? 5 : step + 1,
                  step === 5 ? { completed: true } : {},
                )
              }
            >
              {navigating && <LoaderCircle className="spin" size={16} />}
              {step === 5 ? "Open my workspace" : "Continue"}
              <ArrowRight size={16} />
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
}
