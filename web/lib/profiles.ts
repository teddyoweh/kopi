import brightclean from "./fixtures/profiles/brightclean.json";
import pragnition from "./fixtures/profiles/pragnition.json";
import type { Profile } from "./api";

/** The two seeded company profiles. Edits the person makes are kept in localStorage. */
export const SEEDED_PROFILES: Profile[] = [pragnition as Profile, brightclean as Profile];

export const PROFILES_KEY = "kopi.profiles";
export const ACTIVE_PROFILE_KEY = "kopi.activeProfile";

/** The words that describe what a company does, used as its standing search query. */
export function profileQuery(profile: Profile): string {
  return [profile.summary, ...(profile.capabilities ?? [])].join(" ");
}
