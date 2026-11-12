import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Check,
  Package,
  ScanBarcode,
  Users,
  Percent,
} from "lucide-react";
import { api } from "../lib/api";
import { useWorkspace } from "../App";
import { ErrorBox } from "./ui";
type Item = {
  key: string;
  title: string;
  description: string;
  to: string;
  done: boolean;
};
export function SetupChecklist({
  onNavigate,
}: {
  onNavigate?: (to: string) => void;
}) {
  const { business } = useWorkspace();
  const result = useQuery({
    queryKey: ["setup-checklist", business.tenant.public_id],
    queryFn: () => api<{ items: Item[] }>("business/setup-checklist"),
  });
  if (result.error) return <ErrorBox error={result.error} />;
  const complete = result.data?.items.filter((i) => i.done).length ?? 0;
  return (
    <section className="setup-checklist" aria-label="Getting started checklist">
      <div className="row between">
        <div>
          <p className="eyebrow">YOUR FIRST STEPS</p>
          <h3>A little progress goes a long way.</h3>
        </div>
        <span className="neutral-pill">
          {complete}/{result.data?.items.length ?? 4} complete
        </span>
      </div>
      <div className="checklist-progress">
        <span
          style={{
            width: `${result.data?.items.length ? (complete / result.data.items.length) * 100 : 0}%`,
          }}
        />
      </div>
      {result.isPending ? (
        <p role="status">Loading your setup tasks…</p>
      ) : (
        <div className="setup-task-grid">
          {result.data?.items.map((item) => {
            const Icon =
              item.key === "product"
                ? Package
                : item.key === "customer"
                  ? Users
                  : item.key === "tax"
                    ? Percent
                    : ScanBarcode;
            const content = (
              <>
                <span
                  className={`setup-task-icon ${item.done ? "complete" : ""}`}
                >
                  {item.done ? <Check size={19} /> : <Icon size={19} />}
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
                <ArrowUpRight size={17} />
              </>
            );
            return onNavigate ? (
              <button
                key={item.key}
                type="button"
                className="setup-task"
                onClick={() => onNavigate(item.to)}
              >
                {content}
              </button>
            ) : (
              <Link key={item.key} to={item.to} className="setup-task">
                {content}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
