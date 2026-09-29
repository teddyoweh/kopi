"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";

import { useKopi } from "@/components/kopi-provider";
import { Wordmark } from "@/components/shell/wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-frame px-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

function SignIn() {
  const { signIn } = useKopi();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(code.trim());
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? "That access code is not valid." : "Could not reach Kopi. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Centered>
      <form onSubmit={submit} className="flex flex-col gap-6 rounded-3xl border bg-card p-8 shadow-float">
        <Wordmark />
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[20px] font-medium tracking-[-0.02em]">Enter your access code</h1>
          <p className="text-sm text-muted-foreground">Kopi is in private preview. The code came with your invitation.</p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="access-code" className="text-[13px] font-book">
            Access code
          </label>
          <Input
            id="access-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoFocus
            className="h-11 rounded-xl px-3.5"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "access-code-error" : undefined}
          />
          {error && (
            <p id="access-code-error" className="text-sm text-unmet">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" size="lg" className="h-10 w-full" disabled={!code.trim() || busy}>
          {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          Continue
        </Button>
      </form>
    </Centered>
  );
}

/** Shows the app once signed in; the sign-in form or a connection error otherwise. */
export function AccessGate({ children }: { children: React.ReactNode }) {
  const { session } = useKopi();
  if (session === "signed-in") return <>{children}</>;
  if (session === "signed-out") return <SignIn />;
  if (session === "unreachable")
    return (
      <Centered>
        <div className="flex flex-col gap-4 rounded-3xl border bg-card p-8 shadow-float">
          <Wordmark />
          <h1 className="text-[20px] font-medium tracking-[-0.02em]">Kopi is not reachable</h1>
          <p className="text-sm text-muted-foreground">The API did not answer. It may be starting up; this takes a few seconds.</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </Centered>
    );
  return (
    <Centered>
      <div className="flex justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    </Centered>
  );
}
