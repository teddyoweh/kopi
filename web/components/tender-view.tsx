"use client";

import { ArrowLeft, ExternalLink, FileSearch } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useApi, useKopi } from "@/components/kopi-provider";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import type { Notice } from "@/lib/api";
import { categoryLeaf, closingLabel, dateTime, money } from "@/lib/format";
import { useAsync } from "@/lib/use-async";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

function yesNo(value: boolean | null | undefined): string {
  return value === true ? "Yes" : value === false ? "No" : "Not stated";
}

function Facts({ notice }: { notice: Notice }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-xl bg-secondary p-5 sm:grid-cols-4">
      <Fact label="Closes">{dateTime(notice.closing)}</Fact>
      <Fact label="Published">{dateTime(notice.published)}</Fact>
      <Fact label="Method">{notice.procurement_method || notice.type}</Fact>
      <Fact label="Category">{categoryLeaf(notice.category) || "Not stated"}</Fact>
      <Fact label="Procurement type">{notice.procurement_type || "Not stated"}</Fact>
      <Fact label="Two envelopes">{yesNo(notice.two_envelope)}</Fact>
      <Fact label="WTO-GPA / FTA">{yesNo(notice.wto_gpa)}</Fact>
      <Fact label="Document no.">{notice.doc_no}</Fact>
    </dl>
  );
}

export function TenderView() {
  const doc = useSearchParams().get("doc");
  const api = useApi();
  const { profile } = useKopi();
  const state = useAsync(async () => (api && doc ? api.tender(doc, profile) : null), [api, doc, profile]);

  if (!doc) {
    return (
      <EmptyState icon={FileSearch} title="No tender chosen">
        Open a tender from the{" "}
        <Link href="/" className="text-kopi underline-offset-4 hover:underline">
          overview
        </Link>
        .
      </EmptyState>
    );
  }
  if (state.status === "error") return <ErrorState error={state.error} />;
  if (state.status === "loading" || !state.data) return <RowsSkeleton rows={4} />;

  const { notice } = state.data;
  const registrations = [
    ...(notice.gra_heads ?? []).map((h) => ({
      code: h.code,
      label: h.label,
      detail: [h.grade, money(h.capacity_sgd, true)].filter(Boolean).join(" · "),
    })),
    ...(notice.bca_workheads ?? []).map((w) => ({ code: w.code, label: "BCA workhead", detail: w.grade ?? "" })),
  ];

  return (
    <article className="flex flex-col gap-10">
      <div className="flex flex-col gap-5">
        <Link href="/" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden /> Overview
        </Link>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{notice.type}</Badge>
            <span className="text-sm font-medium text-kopi">{closingLabel(notice.closing)}</span>
          </div>
          <h1 className="max-w-4xl text-2xl leading-tight font-semibold tracking-tight sm:text-[28px]">{notice.title}</h1>
          <p className="text-[15px] text-muted-foreground">{notice.agency}</p>
        </div>
        <a
          href={notice.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-kopi hover:underline"
        >
          View on GeBIZ <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>

      <Facts notice={notice} />

      {notice.description && (
        <section className="flex max-w-3xl flex-col gap-2">
          <h2 className="text-base font-semibold tracking-tight">What the notice says</h2>
          <p className="text-[15px] leading-relaxed whitespace-pre-line">{notice.description}</p>
        </section>
      )}

      {registrations.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold tracking-tight">Registrations named</h2>
          <ul className="flex flex-col gap-2">
            {registrations.map((r) => (
              <li key={r.code} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg bg-secondary px-4 py-3 text-sm">
                <span className="font-mono text-[13px] font-medium">{r.code}</span>
                <span className="text-muted-foreground">{r.label}</span>
                {r.detail && <span className="ml-auto tabular-nums">{r.detail}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(notice.items ?? []).length > 0 && (
        <section className="flex max-w-3xl flex-col gap-3">
          <h2 className="text-base font-semibold tracking-tight">Items to respond</h2>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[15px]">
            {notice.items!.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}
