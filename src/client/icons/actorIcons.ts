/**
 * How many actor icons a merged edge shows before it says `+N more`.
 *
 * Two, settled with the user (2026-09-07). A merged edge can stand for many
 * connections, and a tall column of icons on a line is worse than a short one
 * plus a count -- the point is a glance, and expanding the container is the
 * gesture that already exists for seeing them all.
 *
 * Lives with the rendering, not with the derivation: the derivation says what
 * the line stands for, and how many fit is a question about a canvas.
 */
export const MAX_ACTOR_ICONS = 2
