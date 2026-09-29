"use client";

import Link from "next/link";
import { Fragment } from "react";
import { createPortal } from "react-dom";

import { usePanel } from "@/components/shell/app-shell";

export type Crumb = { label: string; href?: string };

/**
 * A page's name and actions go in the panel's top bar, as in Linear; its description, if any,
 * opens the page body. `crumbs` come before the title ("Overview / MOE000…").
 */
export function PageHeader({
  title,
  crumbs = [],
  description,
  actions,
}: {
  title: string;
  crumbs?: Crumb[];
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const panel = usePanel();
  const name = (
    <span data-page-title className="flex min-w-0 items-center gap-1.5 text-[14px]">
      {crumbs.map((crumb) => (
        <Fragment key={crumb.label}>
          {crumb.href ? (
            <Link href={crumb.href} className="shrink-0 text-muted-foreground transition-colors hover:text-foreground">
              {crumb.label}
            </Link>
          ) : (
            <span className="shrink-0 text-muted-foreground">{crumb.label}</span>
          )}
          <span className="text-muted-foreground/60" aria-hidden>
            /
          </span>
        </Fragment>
      ))}
      <h1 className="truncate font-medium">{title}</h1>
    </span>
  );
  return (
    <>
      {panel.title && createPortal(name, panel.title)}
      {panel.actions && actions && createPortal(actions, panel.actions)}
      {description && <p className="max-w-2xl pb-7 text-[14px] leading-relaxed text-pretty text-muted-foreground">{description}</p>}
    </>
  );
}

export function SectionHeader({
  id,
  title,
  description,
  action,
}: {
  id?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 pb-3">
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-[15px] font-medium tracking-[-0.01em]">
          {title}
        </h2>
        {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
