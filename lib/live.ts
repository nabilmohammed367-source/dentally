// Live mode is switched on only by setting NEXT_PUBLIC_DENTALOS_LIVE=true in .env.local.
// The public website never sets it, so it keeps running the safe browser-only demo.
export const LIVE = process.env.NEXT_PUBLIC_DENTALOS_LIVE === 'true'
