"use client";

import { Check, ChevronDown, Pencil } from "lucide-react";
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

/** The company Kopi bids as, in the place Linear keeps its workspace switcher. */
export function ProfileSwitcher() {
  const { profiles, profile, setProfile } = useKopi();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-8 min-w-0 items-center gap-2 rounded-md pr-1.5 pl-1 text-left transition-colors outline-none hover:bg-sidebar-hover focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label={`Bidding as ${profile.name}. Switch company`}
      >
        <span className="grid size-5.5 shrink-0 place-items-center rounded-md bg-kopi text-[10px] font-semibold text-white">{initials(profile.name)}</span>
        <span className="min-w-0 truncate text-[14px] font-semibold tracking-[-0.01em]">{profile.name}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-1">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Bid as</DropdownMenuLabel>
          {profiles.map((p) => (
            <DropdownMenuItem key={p.id} onClick={() => setProfile(p.id)} className="gap-2.5 py-1.5">
              <span className="grid size-5.5 place-items-center rounded-md bg-muted text-[10px] font-semibold">{initials(p.name)}</span>
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
