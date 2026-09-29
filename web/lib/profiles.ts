import brightclean from "./fixtures/profiles/brightclean.json";
import pragnition from "./fixtures/profiles/pragnition.json";
import { clipQuery, type Profile } from "./api";

/** The two seeded company profiles. Edits the person makes are kept in localStorage. */
export const SEEDED_PROFILES: Profile[] = [pragnition as Profile, brightclean as Profile];

export const PROFILES_KEY = "kopi.profiles";
export const ACTIVE_PROFILE_KEY = "kopi.activeProfile";

/**
 * The words that describe what a company does, used as its standing search query: the
 * summary, then the capabilities, cut at a word boundary to the API's 300-character limit
 * (Pragnition's runs to 408, and an over-long `q` is a 422, not a shorter search).
 */
export function profileQuery(profile: Profile): string {
  return clipQuery([profile.summary, ...(profile.capabilities ?? [])].join(" "));
}
