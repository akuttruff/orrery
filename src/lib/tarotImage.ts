import { imageFor } from './tarotSpread.ts'

/** A card's picture: the server serves tarot-mcp's deck under /api/tarot/, not lm-chat's /tarot/. */
export const tarotImage = (id: string): string => imageFor(id, '/api/tarot/')
