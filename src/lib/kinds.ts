import type { Kind } from '../types.ts'

/** The kinds in the order the home screen shows them: the shortcut tiles and the recent list's groups agree. */
export const KIND_ORDER: Kind[] = ['today', 'week', 'month', 'year', 'moon', 'natal']

/** A kind's castings in list order: the starred ones first, then the most recently changed. */
export const byPlace = <T extends { starred: boolean; updatedAt: number }>(a: T, b: T): number =>
  Number(b.starred) - Number(a.starred) || b.updatedAt - a.updatedAt

/** A kind's short name, for a list row or a group heading. */
export const KIND_LABEL: Record<Kind, string> = { today: 'Today', week: 'Week', month: 'Month', year: 'Year', moon: 'Moon', natal: 'Birth chart' }
