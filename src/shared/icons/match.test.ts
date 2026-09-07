import { describe, it, expect } from 'vitest'
import { guessIconKey, resolveNodeIcon, ICON_NONE } from './match'
import { ICON_MATCH_RULES, FALLBACK_ICON_KEY } from './rules'

/**
 * A LABEL CORPUS, not a handful of obvious cases. The table has over a hundred
 * rules and a test touching six of them is not evidence that the port survived.
 *
 * Every entry is a label somebody would really type on an architecture diagram.
 */
const CORPUS: Array<[label: string, key: string]> = [
  // --- AWS services must beat the generic rules ---
  ['S3', 'aws:s3'],
  ['Raw bucket (S3)', 'aws:s3'],
  ['Lambda', 'aws:lambda'],
  ['Ingest lambda', 'aws:lambda'],
  ['DynamoDB', 'aws:dynamodb'],
  ['RDS', 'aws:rds'],
  ['Aurora', 'aws:rds'],
  ['EC2', 'aws:ec2'],
  ['SQS', 'aws:sqs'],
  ['SNS', 'aws:sns'],
  ['Kinesis', 'aws:kinesis'],
  ['EventBridge', 'aws:eventbridge'],
  ['CloudFront', 'aws:cloudfront'],
  ['Route53', 'aws:route53'],
  ['API Gateway', 'aws:api-gateway'],
  ['IAM role', 'aws:iam'],
  ['Cognito', 'aws:cognito'],
  ['KMS', 'aws:kms'],
  ['Secrets Manager', 'aws:secrets-manager'],
  ['ECS', 'aws:ecs'],
  ['EKS', 'aws:eks'],
  ['Redshift', 'aws:redshift'],
  ['Athena', 'aws:athena'],
  ['Glue', 'aws:glue'],
  ['Step Functions', 'aws:step-functions'],
  ['CloudWatch', 'aws:cloudwatch'],
  ['VPC', 'aws:vpc'],
  ['SageMaker', 'aws:sagemaker'],
  ['ELB', 'aws:elb'],
  ['EFS', 'aws:efs'],
  ['Bedrock', 'aws:bedrock'],

  // --- Compute ---
  ['Web server', 'server'],
  ['Docker container', 'docker'],
  ['Kubernetes', 'docker'],
  ['Nightly cron', 'clock'],
  ['Scheduler', 'clock'],
  // Every shape in this app is a node, so the bare word must NOT reach the
  // p2p-topology icon.
  ['Worker node', 'clock'],
  ['Node', 'box'],

  // --- Data ---
  ['Postgres', 'database'],
  ['MongoDB', 'database'],
  ['Redis cache', 'bolt'],
  ['Snowflake', 'warehouse'],
  ['Elasticsearch', 'search'],
  ['dbt pipeline', 'route'],

  // --- Networking ---
  ['Load balancer', 'gauge'],
  ['Reverse proxy', 'bridge'],
  ['nginx', 'bridge'],
  ['Firewall', 'shield'],

  // --- Messaging ---
  ['Kafka', 'queue'],
  ['RabbitMQ', 'queue'],
  ['REST API', 'plug'],
  ['GraphQL endpoint', 'plug'],

  // --- Security / people ---
  ['Auth service', 'key'],
  ['Vault', 'key'],
  ['User', 'user'],
  ['Users', 'users'],
  ['Customer', 'user'],

  // --- Clients / observability / CI ---
  ['Mobile app', 'mobile'],
  ['React frontend', 'browser'],
  ['Grafana dashboard', 'chart'],
  ['Sentry', 'bug'],
  ['PagerDuty', 'alert'],
  ['GitHub', 'github'],
  ['Jenkins', 'gear'],
]

describe('guessIconKey — the label corpus', () => {
  it('covers enough of the table to be evidence', () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(40)
    // And enough of the AWS half specifically, which is the reason the second
    // set exists.
    expect(CORPUS.filter(([, key]) => key.startsWith('aws:')).length).toBeGreaterThanOrEqual(20)
  })

  for (const [label, key] of CORPUS) {
    it(`${label} -> ${key}`, () => {
      expect(guessIconKey(label)).toBe(key)
    })
  }
})

describe('guessIconKey — the matching rules themselves', () => {
  it('matches a WHOLE WORD, so a short keyword cannot hide inside another', () => {
    expect(guessIconKey('car')).toBe(FALLBACK_ICON_KEY)
    expect(guessIconKey('carpet')).toBe(FALLBACK_ICON_KEY)
  })

  it('handles plurals in both directions', () => {
    expect(guessIconKey('buckets')).toBe('bucket')
    expect(guessIconKey('bucket')).toBe('bucket')
  })

  it('distinguishes singular from plural where BOTH have a rule', () => {
    // The one place this improves on the port. Plural handling runs both ways,
    // so a single pass makes `user` and `users` indistinguishable and whichever
    // rule sits first wins both -- the predecessor's ordering meant a node
    // called "User" got the plural icon forever.
    expect(guessIconKey('User')).toBe('user')
    expect(guessIconKey('Users')).toBe('users')
  })

  it('matches a multi-word alternative as a substring', () => {
    expect(guessIconKey('Application load balancer')).toBe('gauge')
  })

  it('is case-insensitive', () => {
    expect(guessIconKey('POSTGRES')).toBe(guessIconKey('postgres'))
  })

  it('RULE ORDER decides a tie', () => {
    // "s3 bucket" matches both the AWS rule and the generic `bucket` one. The
    // AWS block sits first, and that is the whole reason the second set exists:
    // a diagram of an AWS system drawn with generic glyphs is a diagram of a
    // different system. Appending a rule in the wrong place changes this
    // silently, which is why order is pinned and not only outcomes.
    expect(guessIconKey('s3 bucket')).toBe('aws:s3')
    const awsIndex = ICON_MATCH_RULES.findIndex((r) => r.iconKey === 'aws:s3')
    const genericIndex = ICON_MATCH_RULES.findIndex((r) => r.iconKey === 'bucket')
    expect(awsIndex).toBeLessThan(genericIndex)
  })

  it('falls back for a label nothing matches, and the fallback is a real key', () => {
    expect(guessIconKey('zzzz qqqq')).toBe(FALLBACK_ICON_KEY)
    expect(FALLBACK_ICON_KEY.length).toBeGreaterThan(0)
  })

  it('does not throw on an empty or punctuation-only label', () => {
    expect(guessIconKey('')).toBe(FALLBACK_ICON_KEY)
    expect(guessIconKey('--- ///')).toBe(FALLBACK_ICON_KEY)
  })
})

describe('resolveNodeIcon — the three states', () => {
  it('pinned wins over the label', () => {
    expect(resolveNodeIcon('aws:s3', 'Postgres')).toBe('aws:s3')
  })

  it('none means no icon, and is not the same as unset', () => {
    expect(resolveNodeIcon(ICON_NONE, 'Postgres')).toBeNull()
    expect(resolveNodeIcon('', 'Postgres')).toBe('database')
  })

  it('unset RE-GUESSES, so renaming changes the icon', () => {
    // The behaviour the three states exist for, and the one an implementation
    // that wrote the guess at creation would look identical on day one and lose
    // forever.
    expect(resolveNodeIcon('', 'DB')).toBe('database')
    expect(resolveNodeIcon('', 'Queue')).toBe('queue')
  })

  it('a pinned icon does NOT change when the label does', () => {
    expect(resolveNodeIcon('database', 'Queue')).toBe('database')
  })
})
