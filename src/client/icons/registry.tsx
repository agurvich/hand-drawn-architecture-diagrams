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
  Flame,
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
  fire: Flame,
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
 * Every key this registry can DRAW. Deliberately not the same list as
 * `@shared/icons`'s `ICON_KEYS`, which is what the rules can PRODUCE -- the
 * drift test compares the two, and a single shared list would have nothing to
 * compare.
 */
export const DRAWABLE_ICON_KEYS: readonly string[] = [...Object.keys(GENERAL), ...Object.keys(AWS)]

export function generalIcon(key: string): ComponentType<{ size?: number }> | undefined {
  return GENERAL[key]
}

export function awsIconSvg(key: string): string | undefined {
  return AWS[key]
}

export function hasIcon(key: string): boolean {
  return key in GENERAL || key in AWS
}
