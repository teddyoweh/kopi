"use client";

import { Check, ChevronsUpDown, Pencil } from "lucide-react";
import Link from "next/link";

import { useKopi } from "@/components/kopi-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name: string): string {
  return name
    .replace(/(pte\.?|ltd\.?|labs?)/gi, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

export function ProfileSwitcher() {
  const { profiles, profile, setProfile } = useKopi();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-9 items-center gap-2.5 rounded-md pr-2 pl-1 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/40"
        aria-label={`Company profile: ${profile.name}. Switch profile`}
      >
        <span className="grid size-7 place-items-center rounded-md bg-kopi-soft text-[11px] font-semibold text-kopi">
          {initials(profile.name)}
        </span>
        <span className="hidden max-w-44 flex-col leading-tight sm:flex">
          <span className="truncate text-sm font-medium">{profile.name}</span>
          <span className="text-xs text-muted-foreground">Bidding as</span>
        </span>
        <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Bid as</DropdownMenuLabel>
          {profiles.map((p) => (
            <DropdownMenuItem key={p.id} onClick={() => setProfile(p.id)} className="gap-2.5 py-1.5">
              <span className="grid size-6 place-items-center rounded bg-muted text-[10px] font-semibold">{initials(p.name)}</span>
              <span className="flex-1 truncate">{p.name}</span>
              {p.id === profile.id && <Check className="text-kopi" aria-label="Active" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuItem render={<Link href="/profile" />} className="mt-1 gap-2.5 py-1.5 text-muted-foreground">
          <Pencil aria-hidden />
          Edit profile
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
