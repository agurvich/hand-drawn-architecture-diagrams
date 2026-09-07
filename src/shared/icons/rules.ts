/**
 * The keyword table that guesses a node's icon from its label.
 *
 * PORTED from the predecessor, which is the point: the table encodes what the
 * words in an architecture diagram actually mean, and it was grown against real
 * use. No model call, no network -- an ordered list, first match wins.
 *
 * ORDER IS LOAD-BEARING. Specific terms sit above catch-alls, and the AWS block
 * sits above everything, so "S3" is a bucket rather than generic storage and
 * "Lambda" is Lambda rather than a generic function glyph. Appending a rule in
 * the wrong place changes an answer silently, which is why a test pins ordering
 * rather than only pinning outcomes.
 */

export interface IconMatchRule {
  /**
   * Alternatives separated by `|`. A single-word alternative matches as a WHOLE
   * WORD, with simple plural handling in both directions, so "car" does not
   * match "carpet". A multi-word alternative matches as a plain substring, since
   * a real phrase is not at meaningful risk of hiding inside another word.
   */
  pattern: string
  iconKey: string
}

/** What a label matches when nothing else does. */
export const FALLBACK_ICON_KEY = 'box'

export const ICON_MATCH_RULES: readonly IconMatchRule[] = [
  // --- AWS services, ABOVE everything else ---
  //
  // A diagram of an AWS system drawn with generic glyphs is a diagram of a
  // different system. These win by sitting first: "s3" would otherwise hit the
  // generic `bucket` rule, and "lambda" the generic `code` one.
  { pattern: 's3|simple storage service', iconKey: 'aws:s3' },
  { pattern: 'lambda|aws lambda', iconKey: 'aws:lambda' },
  { pattern: 'dynamodb|dynamo', iconKey: 'aws:dynamodb' },
  { pattern: 'rds|aurora', iconKey: 'aws:rds' },
  { pattern: 'ec2|elastic compute', iconKey: 'aws:ec2' },
  { pattern: 'sqs|simple queue service', iconKey: 'aws:sqs' },
  { pattern: 'sns|simple notification service', iconKey: 'aws:sns' },
  { pattern: 'kinesis', iconKey: 'aws:kinesis' },
  { pattern: 'eventbridge|event bridge', iconKey: 'aws:eventbridge' },
  { pattern: 'cloudfront', iconKey: 'aws:cloudfront' },
  { pattern: 'route53|route 53', iconKey: 'aws:route53' },
  { pattern: 'api gateway|apigateway', iconKey: 'aws:api-gateway' },
  { pattern: 'iam|iam role|iam user', iconKey: 'aws:iam' },
  { pattern: 'cognito', iconKey: 'aws:cognito' },
  { pattern: 'kms|key management service', iconKey: 'aws:kms' },
  { pattern: 'secrets manager', iconKey: 'aws:secrets-manager' },
  { pattern: 'ecs|fargate', iconKey: 'aws:ecs' },
  { pattern: 'eks', iconKey: 'aws:eks' },
  { pattern: 'redshift', iconKey: 'aws:redshift' },
  { pattern: 'athena', iconKey: 'aws:athena' },
  { pattern: 'glue|aws glue', iconKey: 'aws:glue' },
  { pattern: 'step functions|stepfunctions', iconKey: 'aws:step-functions' },
  { pattern: 'cloudwatch', iconKey: 'aws:cloudwatch' },
  { pattern: 'elb|alb|nlb|elastic load balanc', iconKey: 'aws:elb' },
  { pattern: 'vpc', iconKey: 'aws:vpc' },
  { pattern: 'efs|elastic file system', iconKey: 'aws:efs' },
  { pattern: 'sagemaker', iconKey: 'aws:sagemaker' },
  { pattern: 'bedrock', iconKey: 'aws:bedrock' },

  // --- Everything else, as ported ---
  {
    pattern: 'server|host|instance|vm|virtual machine|compute|ec2|bare metal|baremetal|hypervisor',
    iconKey: 'server',
  },
  { pattern: 'lambda|function|serverless|faas', iconKey: 'code' },
  { pattern: 'container|docker|pod|kubernetes|k8s|containerd|helm', iconKey: 'docker' },
  { pattern: 'terminal|cli|shell|ssh|bash|command line', iconKey: 'terminal' },
  { pattern: 'worker|job|cron|scheduler|batch|schedule', iconKey: 'clock' },
  { pattern: 'orchestration|orchestrator', iconKey: 'gear' },
  { pattern: 'config|configuration|settings', iconKey: 'gear' },
  {
    pattern:
      'database|db|sql|nosql|postgres|postgresql|mysql|mariadb|sqlite|oracle|mssql|sql server|mongo|mongodb|dynamodb|dynamo|cassandra|couchbase|cosmos db|cosmosdb|rds',
    iconKey: 'database',
  },
  // The port had this on a FLAME -- "hot cache" -- which reads as an alert on a
  // canvas where a flame means nothing else. A bolt says fast, which is the
  // property a cache is on the diagram for.
  { pattern: 'cache|redis|memcached|memcache', iconKey: 'bolt' },
  { pattern: 'bucket|s3|blob storage', iconKey: 'bucket' },
  { pattern: 'storage|blob|volume|disk|object storage', iconKey: 'hard-drive' },
  { pattern: 'bulk storage|archive|cold storage', iconKey: 'boxes-stacked' },
  { pattern: 'folder|directory|file system|filesystem', iconKey: 'folder' },
  { pattern: 'file|files', iconKey: 'file' },
  { pattern: 'search|elasticsearch|solr|opensearch|algolia', iconKey: 'search' },
  { pattern: 'warehouse|data warehouse|snowflake|bigquery|redshift', iconKey: 'warehouse' },
  { pattern: 'data lake|lake', iconKey: 'database' },
  { pattern: 'etl|elt|pipeline|airflow|dbt|data pipeline', iconKey: 'route' },
  { pattern: 'backup|snapshot', iconKey: 'hard-drive' },
  { pattern: 'certificate|cert authority|ca', iconKey: 'certificate' },
  { pattern: 'maintenance|ops|operations|on-call|oncall', iconKey: 'wrench' },
  { pattern: 'architecture|topology|diagram', iconKey: 'diagram-project' },
  // NOT `nodes`: plural matching runs both directions, so it also claimed the
  // bare word "node" -- and every shape in this app is a node, so "worker node"
  // came out as a p2p topology.
  { pattern: 'distributed|peer to peer|p2p', iconKey: 'hexagon-nodes' },
  { pattern: 'arrow|flow direction|directional', iconKey: 'arrow' },
  { pattern: 'connector|line', iconKey: 'line' },
  { pattern: 'copy|duplicate|clone', iconKey: 'copy' },
  { pattern: 'paste', iconKey: 'paste' },
  { pattern: 'download|fetch|pull down', iconKey: 'download' },
  { pattern: 'upload|push up', iconKey: 'upload' },
  { pattern: 'sync|refresh|rotate', iconKey: 'sync' },
  { pattern: 'zip|unzip|compress|compressed', iconKey: 'archive-zip' },
  { pattern: 'delete|remove|purge', iconKey: 'trash-can' },
  { pattern: 'filter|filtering', iconKey: 'filter' },
  { pattern: 'diff|compare|comparison', iconKey: 'code-compare' },
  { pattern: 'branch|git branch', iconKey: 'code-branch' },
  { pattern: 'merge|git merge', iconKey: 'code-merge' },
  { pattern: 'pull request|merge request', iconKey: 'pull-request' },
  { pattern: 'malware|virus|antivirus|av scan|virus scan', iconKey: 'shield-virus' },
  { pattern: 'quarantine|blocked|banned|denylist|blocklist', iconKey: 'ban' },
  { pattern: 'pass|passed|approved|success|successful', iconKey: 'circle-check' },
  { pattern: 'fail|failed|rejected|failure', iconKey: 'circle-xmark' },
  { pattern: 'test|testing|staging|qa|sandbox', iconKey: 'flask' },
  { pattern: 'rocket|launch|go live|go-live', iconKey: 'rocket' },
  { pattern: 'signal|status|health check|healthcheck', iconKey: 'signal' },
  { pattern: 'microservice|microservices', iconKey: 'cubes' },
  { pattern: 'load balancer|balancer|lb|alb|nlb|elb', iconKey: 'gauge' },
  {
    pattern: 'gateway|proxy|reverse proxy|api gateway|nginx|envoy|traefik|haproxy',
    iconKey: 'bridge',
  },
  { pattern: 'network|vpc|subnet|vpn', iconKey: 'network' },
  { pattern: 'route|dns|routing|route53|nameserver|domain', iconKey: 'route' },
  { pattern: 'cdn|edge|cloudfront|fastly|akamai', iconKey: 'globe' },
  { pattern: 'firewall|security group|waf|ips|ids', iconKey: 'shield' },
  { pattern: 'ingress|egress', iconKey: 'route' },
  { pattern: 'wifi|wireless', iconKey: 'network' },
  {
    pattern:
      'queue|kafka|rabbitmq|sqs|pubsub|pub sub|messaging|topic|activemq|nats|kinesis|pulsar|stream|streaming',
    // NOT the envelope the port used, which it shared with `email` -- a Kafka
    // topic and an SMTP inbox drawn the same is the diagram saying they are the
    // same thing.
    iconKey: 'queue',
  },
  { pattern: 'api|endpoint|rest|graphql|webhook|grpc|rpc', iconKey: 'plug' },
  { pattern: 'cluster|pool', iconKey: 'layer-group' },
  { pattern: 'subsystem|module|monolith', iconKey: 'sitemap' },
  { pattern: 'event|event bus|eventbridge|event-driven', iconKey: 'envelope' },
  { pattern: 'email|inbox|smtp', iconKey: 'envelope' },
  { pattern: 'lock|encryption|encrypt|tls|ssl|https|cert|certificate', iconKey: 'lock' },
  { pattern: 'key|auth|oauth|sso|login|credential|iam|jwt|saml|identity', iconKey: 'key' },
  { pattern: 'secret|secrets|vault|kms|secrets manager', iconKey: 'key' },
  { pattern: 'rbac|permission|permissions|acl|access control', iconKey: 'shield' },
  {
    pattern: 'browser|frontend|webapp|web app|spa|react|vue|angular|ui|client',
    iconKey: 'browser',
  },
  { pattern: 'desktop', iconKey: 'desktop' },
  { pattern: 'mobile|ios|android|app store|play store', iconKey: 'mobile' },
  { pattern: 'users|team|tenant|tenants', iconKey: 'users' },
  { pattern: 'user|actor|customer', iconKey: 'user' },
  { pattern: 'table', iconKey: 'table' },
  {
    pattern:
      'chart|analytics|metrics|dashboard|grafana|prometheus|trace|tracing|jaeger|opentelemetry|apm',
    iconKey: 'chart',
  },
  { pattern: 'bug|error|exception|monitoring|logging|log|logs|sentry|datadog', iconKey: 'bug' },
  { pattern: 'alert|alarm|notification|pagerduty|paging|opsgenie', iconKey: 'alert' },
  {
    pattern: 'ci|cd|ci/cd|build|deploy|deployment|jenkins|circleci|github actions|pipeline build',
    iconKey: 'gear',
  },
  { pattern: 'github|git|repo|repository|version control', iconKey: 'github' },
  { pattern: 'artifact|package registry|npm|registry', iconKey: 'package' },
  // CATCH-ALLS LAST. `service` matches almost every label on an architecture
  // diagram -- "Auth service", "Orders service", "Billing service" -- so above
  // the specific rules it swallows all of them into a generic gear. The table's
  // own principle, applied to a rule the port had in the middle of it.
  { pattern: 'service|services', iconKey: 'gear' },

  { pattern: 'aws|amazon web services', iconKey: 'aws' },
  { pattern: 'gcp|google cloud', iconKey: 'google' },
  { pattern: 'azure', iconKey: 'microsoft' },
  { pattern: 'cloud', iconKey: 'cloud' },
]
