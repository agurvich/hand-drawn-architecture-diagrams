import type { ComponentType } from 'react'
import {
  Activity,
  AppWindow,
  ArrowRight,
  BadgeCheck,
  Ban,
  Blocks,
  Box,
  Boxes,
  Bug,
  ChartLine,
  CircleCheck,
  CircleX,
  ClipboardPaste,
  Clock,
  Cloud,
  Code,
  Container,
  Copy,
  Database,
  Download,
  File,
  FileArchive,
  Filter,
  FlaskConical,
  Folder,
  Gauge,
  GitBranch,
  GitCompare,
  GitMerge,
  GitPullRequest,
  Globe,
  HardDrive,
  Hexagon,
  KeyRound,
  Layers,
  ListOrdered,
  Lock,
  Mail,
  Minus,
  Monitor,
  Network,
  Package,
  Plug,
  RefreshCw,
  Rocket,
  Route,
  Search,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  Smartphone,
  Table,
  Terminal,
  Trash2,
  TriangleAlert,
  Upload,
  User,
  Users,
  Warehouse,
  Waypoints,
  Workflow,
  Wrench,
  Zap,
} from 'lucide-react'

/**
 * THE ARTWORK. Keys are shared -- the matcher names them and the document
 * carries them -- but the components live here, because `src/shared/` stays
 * runtime-agnostic and an icon is rendering.
 *
 * TWO SETS, and the keys are namespaced so they cannot collide. Lucide draws
 * the general vocabulary; the `aws:` half is the REAL AWS architecture icons,
 * vendored as SVG under `./aws/`, because a diagram of an AWS system drawn with
 * generic glyphs is a diagram of a different system.
 */

/** Lucide, for everything that is not a named AWS service. */
const GENERAL: Record<string, ComponentType<{ size?: number }>> = {
  alert: TriangleAlert,
  'archive-zip': FileArchive,
  arrow: ArrowRight,
  aws: Cloud,
  ban: Ban,
  bolt: Zap,
  box: Box,
  'boxes-stacked': Boxes,
  bridge: Waypoints,
  browser: AppWindow,
  bucket: Container,
  bug: Bug,
  certificate: BadgeCheck,
  chart: ChartLine,
  'circle-check': CircleCheck,
  'circle-xmark': CircleX,
  clock: Clock,
  cloud: Cloud,
  code: Code,
  'code-branch': GitBranch,
  'code-compare': GitCompare,
  'code-merge': GitMerge,
  copy: Copy,
  cubes: Blocks,
  database: Database,
  desktop: Monitor,
  'diagram-project': Workflow,
  docker: Container,
  download: Download,
  envelope: Mail,
  file: File,
  filter: Filter,
  flask: FlaskConical,
  folder: Folder,
  gauge: Gauge,
  gear: Settings,
  github: GitBranch,
  globe: Globe,
  google: Globe,
  'hard-drive': HardDrive,
  'hexagon-nodes': Hexagon,
  key: KeyRound,
  'layer-group': Layers,
  line: Minus,
  lock: Lock,
  microsoft: AppWindow,
  mobile: Smartphone,
  network: Network,
  package: Package,
  queue: ListOrdered,
  paste: ClipboardPaste,
  plug: Plug,
  'pull-request': GitPullRequest,
  rocket: Rocket,
  route: Route,
  search: Search,
  server: Server,
  shield: Shield,
  'shield-virus': ShieldAlert,
  signal: Activity,
  sitemap: Network,
  sync: RefreshCw,
  table: Table,
  terminal: Terminal,
  'trash-can': Trash2,
  upload: Upload,
  user: User,
  users: Users,
  warehouse: Warehouse,
  wrench: Wrench,
}

/**
 * The AWS set, loaded as raw SVG rather than as components.
 *
 * `import.meta.glob` with `eager` so the keys are known at build time -- the
 * drift test compares this registry against the rule table, and a lazily
 * loaded set would have nothing to compare until something rendered.
 */
const AWS_SVG = import.meta.glob('./aws/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const AWS: Record<string, string> = Object.fromEntries(
  Object.entries(AWS_SVG).map(([path, svg]) => [
    `aws:${path.replace('./aws/', '').replace('.svg', '')}`,
    svg,
  ]),
)

/**
 * The two sets, as their own key lists.
 *
 * Separate rather than one flat list because the drift test asks a question no
 * flat list can answer: does a key appear in BOTH? Re-partitioning a combined
 * list by the `aws:` prefix cannot fail -- it just puts each key back where it
 * came from -- and a test that cannot fail was ticking the criterion.
 */
export const GENERAL_ICON_KEYS: readonly string[] = Object.keys(GENERAL)
export const AWS_ICON_KEYS: readonly string[] = Object.keys(AWS)

/**
 * Every key this registry can DRAW. Deliberately not the same list as
 * `@shared/icons`'s `ICON_KEYS`, which is what the rules can PRODUCE -- the
 * drift test compares the two, and a single shared list would have nothing to
 * compare.
 *
 * NOT deduped: a key in both sets is a defect, and silently folding it here
 * would leave nothing for the overlap test to see.
 */
export const DRAWABLE_ICON_KEYS: readonly string[] = [...GENERAL_ICON_KEYS, ...AWS_ICON_KEYS]

/*
 * `Object.hasOwn` on all three lookups, never a bare index.
 *
 * These are ordinary objects, so `AWS['toString']` finds `Object.prototype`'s
 * method rather than `undefined`. `icon` is a `T.string` with no enum validator,
 * so a peer in a sync room can write exactly that -- nothing is injected (it
 * stringifies to source text with no `<` in it) but "an unknown key draws
 * nothing" would stop being true, which is the contract the import validator and
 * the picker are both written against.
 */

/** The Lucide component for a key, or undefined if this is not a general key. */
export function generalIcon(key: string): ComponentType<{ size?: number }> | undefined {
  return Object.hasOwn(GENERAL, key) ? GENERAL[key] : undefined
}

/** The vendored AWS artwork for a key, as raw SVG, or undefined. */
export function awsIconSvg(key: string): string | undefined {
  return Object.hasOwn(AWS, key) ? AWS[key] : undefined
}

/** Can this registry draw `key` at all? The drift test's one question. */
export function hasIcon(key: string): boolean {
  return Object.hasOwn(GENERAL, key) || Object.hasOwn(AWS, key)
}
