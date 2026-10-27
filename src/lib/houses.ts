import type { HouseSystem, Kind } from '../types.ts'

/** The kinds cast from a birth chart, whose results have houses; the tarot kinds have none. */
export const HOUSED_KINDS: readonly Kind[] = ['today', 'week', 'month', 'year', 'natal', 'moon']
export const hasHouses = (kind: Kind): boolean => HOUSED_KINDS.includes(kind)

/**
 * The house system a casting was cast in, as astro-mcp recorded it in the
 * result ("house_system", at the top or under "natal"); null for a result
 * with no houses (tarot) or from before there was a choice.
 */
export function houseSystemOf(result: string): HouseSystem | null {
  const m = /"house_system"\s*:\s*"(whole_sign|placidus)"/.exec(result)
  return m ? (m[1] as HouseSystem) : null
}
