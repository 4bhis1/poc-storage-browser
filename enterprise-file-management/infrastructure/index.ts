import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";

// ECR Repository and Image
const repo = new awsx.ecr.Repository("app-repo", {
  forceDelete: true,
});

const image = new awsx.ecr.Image("app-image", {
  repositoryUrl: repo.url,
  context: "../", // Directory with Dockerfile
  platform: "linux/amd64",
});

// Create a VPC with a single NAT gateway to save costs
const vpc = new awsx.ec2.Vpc("app-vpc", {
  natGateways: {
    strategy: "Single",
  },
  enableDnsHostnames: true,
  enableDnsSupport: true,
});

// Security Group for Database
const dbSg = new aws.ec2.SecurityGroup("db-sg", {
  vpcId: vpc.vpcId,
  description: "Allow PostgreSQL from anywhere for POC execution",
  ingress: [
    {
      protocol: "tcp",
      fromPort: 5432,
      toPort: 5432,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
});

const dbSubnetGroup = new aws.rds.SubnetGroup("db-subnets", {
  subnetIds: vpc.publicSubnetIds, // Put in public subnets for easier local prisma db push
});

// Create an RDS PostgreSQL database
const db = new aws.rds.Instance("app-db", {
  engine: "postgres",
  instanceClass: aws.rds.InstanceType.T3_Micro,
  allocatedStorage: 20,
  dbName: "filemanagement",
  username: "myuser",
  password: "mypassword123!",
  vpcSecurityGroupIds: [dbSg.id],
  dbSubnetGroupName: dbSubnetGroup.name,
  skipFinalSnapshot: true,
  publiclyAccessible: true,
});

// Security Group for Application (ALB + Tasks)
const appSg = new aws.ec2.SecurityGroup("app-sg", {
  vpcId: vpc.vpcId,
  description: "Allow HTTP traffic",
  ingress: [
    {
      protocol: "tcp",
      fromPort: 3000,
      toPort: 3000,
      cidrBlocks: ["0.0.0.0/0"],
    },
    {
      protocol: "tcp",
      fromPort: 80,
      toPort: 80,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
});

// Application Load Balancer
const alb = new awsx.lb.ApplicationLoadBalancer("app-alb", {
  subnetIds: vpc.publicSubnetIds,
  securityGroups: [appSg.id],
  defaultTargetGroup: {
    port: 3000,
    protocol: "HTTP",
    targetType: "ip",
    healthCheck: {
      path: "/",
      matcher: "200-399",
    },
  },
  listeners: [
    {
      port: 80,
      protocol: "HTTP",
    },
  ],
});

// IAM Role for the ECS Task
const taskRole = new aws.iam.Role("app-task-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Action: "sts:AssumeRole",
        Principal: {
          Service: "ecs-tasks.amazonaws.com",
        },
        Effect: "Allow",
        Sid: "",
      },
    ],
  }),
});

// Attach policies necessary for the app (e.g., S3 and Cognito)
const s3PolicyAttachment = new aws.iam.RolePolicyAttachment(
  "app-task-role-s3",
  {
    role: taskRole.name,
    policyArn: "arn:aws:iam::aws:policy/AmazonS3FullAccess",
  },
);

const cognitoPolicyAttachment = new aws.iam.RolePolicyAttachment(
  "app-task-role-cognito",
  {
    role: taskRole.name,
    policyArn: "arn:aws:iam::aws:policy/AmazonCognitoPowerUser",
  },
);

// SNS Topic for Share Notifications
const snsTopic = new aws.sns.Topic("fms-share-notifications");

// Dedicated EventBridge event bus for file events (cross-account BYOA events land here)
// Declared early so it can be referenced in ECS env vars below
const fileSyncEventBus = new aws.cloudwatch.EventBus("cams-file-events", {
  name: "cams-file-events",
  tags: { Purpose: "file-sync-cross-account" },
});

const snsSubscription = new aws.sns.TopicSubscription(
  "fms-share-notifications-sub",
  {
    topic: snsTopic.arn,
    protocol: "email",
    endpoint: "absk8634@gmail.com",
  },
);

const snsPolicyAttachment = new aws.iam.RolePolicyAttachment(
  "app-task-role-sns",
  {
    role: taskRole.name,
    policyArn: "arn:aws:iam::aws:policy/AmazonSNSFullAccess",
  },
);

// Fargate Cluster
const cluster = new aws.ecs.Cluster("app-cluster");

// Fargate Service
const service = new awsx.ecs.FargateService("app-svc", {
  cluster: cluster.arn,
  taskDefinitionArgs: {
    taskRole: {
      roleArn: taskRole.arn,
    },
    container: {
      name: "app",
      image: image.imageUri,
      cpu: 512,
      memory: 1024,
      essential: true,
      portMappings: [
        {
          containerPort: 3000,
          targetGroup: alb.defaultTargetGroup,
        },
      ],
      environment: [
        {
          name: "DATABASE_URL",
          value: pulumi.interpolate`postgresql://myuser:mypassword123%21@${db.endpoint}/filemanagement?schema=public`,
        },
        { name: "JWT_SECRET", value: "supersecretkey123" },
        {
          name: "ENCRYPTION_KEY",
          value:
            "dfa35e10f81315ea9e69e3dff3f7a4ac6096a0828052aaf09f38bc11600d4a53",
        },
        // Cognito and AWS config loaded from .env
        { name: "AWS_REGION", value: process.env.AWS_REGION || "ap-south-1" },
        {
          name: "COGNITO_USER_POOL_ID",
          value: process.env.COGNITO_USER_POOL_ID || "",
        },
        {
          name: "COGNITO_CLIENT_ID",
          value: process.env.COGNITO_CLIENT_ID || "",
        },
        {
          name: "COGNITO_CLIENT_SECRET",
          value: process.env.COGNITO_CLIENT_SECRET || "",
        },
        {
          name: "COGNITO_DOMAIN_PREFIX",
          value: process.env.COGNITO_DOMAIN_PREFIX || "",
        },
        {
          name: "OAUTH_CLIENT_ID",
          value: process.env.OAUTH_CLIENT_ID || "",
        },
        {
          name: "OAUTH_CLIENT_SECRET",
          value: process.env.OAUTH_CLIENT_SECRET || "",
        },
        {
          name: "SNS_SHARE_NOTIFICATIONS_TOPIC_ARN",
          value: snsTopic.arn,
        },
        {
          name: "FILE_SYNC_EVENT_BUS_ARN",
          value: fileSyncEventBus.arn,
        },
      ],
    },
  },
  networkConfiguration: {
    subnets: vpc.privateSubnetIds,
    securityGroups: [appSg.id],
    assignPublicIp: false, // In private subnets with NAT gateway, public IP is not required
  },
});

export const url = alb.loadBalancer.dnsName;
export const dbEndpoint = db.endpoint;

// ─── File Sync: SQS + Lambda + EventBridge ────────────────────────────────────

// Dead-letter queue for failed file-sync messages
const fileSyncDlq = new aws.sqs.Queue("file-sync-dlq", {
  messageRetentionSeconds: 1209600, // 14 days
  tags: { Purpose: "file-sync-dead-letter" },
});

// Main SQS queue — receives events from both same-account S3 and cross-account EventBridge
const fileSyncQueue = new aws.sqs.Queue("file-sync-queue", {
  visibilityTimeoutSeconds: 60, // Must be >= Lambda timeout
  messageRetentionSeconds: 86400, // 1 day
  redrivePolicy: fileSyncDlq.arn.apply(arn =>
    JSON.stringify({ deadLetterTargetArn: arn, maxReceiveCount: 3 })
  ),
  tags: { Purpose: "file-sync" },
});

// Queue policy: allow S3 (same-account direct notifications) and EventBridge to send messages
const fileSyncQueuePolicy = new aws.sqs.QueuePolicy("file-sync-queue-policy", {
  queueUrl: fileSyncQueue.url,
  policy: pulumi.all([fileSyncQueue.arn]).apply(([queueArn]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AllowS3DirectNotifications",
          Effect: "Allow",
          Principal: { Service: "s3.amazonaws.com" },
          Action: "sqs:SendMessage",
          Resource: queueArn,
          Condition: {
            ArnLike: { "aws:SourceArn": "arn:aws:s3:::*" },
          },
        },
        {
          Sid: "AllowEventBridgeForwarding",
          Effect: "Allow",
          Principal: { Service: "events.amazonaws.com" },
          Action: "sqs:SendMessage",
          Resource: queueArn,
        },
      ],
    })
  ),
});

// EventBridge bus resource policy: allow tenant accounts to PutEvents
// Tenant account IDs should be managed dynamically; this allows any account in the org.
// Tighten this to specific account IDs in production.
const fileSyncEventBusPolicy = new aws.cloudwatch.EventBusPolicy(
  "cams-file-events-policy",
  {
    eventBusName: fileSyncEventBus.name,
    policy: pulumi.all([fileSyncEventBus.arn]).apply(([busArn]) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "AllowCrossAccountPutEvents",
            Effect: "Allow",
            Principal: { AWS: "*" },
            Action: "events:PutEvents",
            Resource: busArn,
            // Restrict to your AWS Organization in production:
            // Condition: { StringEquals: { "aws:PrincipalOrgID": "o-xxxxxxxxxx" } }
          },
        ],
      })
    ),
  }
);

// EventBridge rule on our bus: forward all S3 file events to the SQS queue
const fileSyncEventRule = new aws.cloudwatch.EventRule("file-sync-eb-rule", {
  eventBusName: fileSyncEventBus.name,
  description: "Forward cross-account S3 file events to file-sync SQS queue",
  eventPattern: JSON.stringify({
    source: ["aws.s3"],
    "detail-type": [
      "Object Created",
      "Object Deleted",
      "Object Restore Completed",
    ],
  }),
  tags: { Purpose: "file-sync" },
});

const fileSyncEventTarget = new aws.cloudwatch.EventTarget(
  "file-sync-eb-target",
  {
    rule: fileSyncEventRule.name,
    eventBusName: fileSyncEventBus.name,
    arn: fileSyncQueue.arn,
  }
);

// Security group for Lambda — allows outbound to RDS
const lambdaSg = new aws.ec2.SecurityGroup("file-sync-lambda-sg", {
  vpcId: vpc.vpcId,
  description: "File sync Lambda — outbound to RDS and internet",
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
});

// IAM role for the file-sync Lambda
const lambdaRole = new aws.iam.Role("file-sync-lambda-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
});

// Attach managed policies
new aws.iam.RolePolicyAttachment("file-sync-lambda-vpc", {
  role: lambdaRole.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole",
});

new aws.iam.RolePolicyAttachment("file-sync-lambda-basic", {
  role: lambdaRole.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
});

// Inline policy: SQS consume permissions
new aws.iam.RolePolicy("file-sync-lambda-sqs-policy", {
  role: lambdaRole.name,
  policy: pulumi.all([fileSyncQueue.arn, fileSyncDlq.arn]).apply(
    ([queueArn, dlqArn]) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "sqs:ReceiveMessage",
              "sqs:DeleteMessage",
              "sqs:GetQueueAttributes",
              "sqs:ChangeMessageVisibility",
            ],
            Resource: [queueArn, dlqArn],
          },
        ],
      })
  ),
});

// Lambda function — expects a pre-built zip at ../lambda/file-sync/function.zip
// Build with: cd lambda/file-sync && npm run bundle
const fileSyncLambda = new aws.lambda.Function("file-sync-lambda", {
  runtime: aws.lambda.Runtime.NodeJS20dX,
  handler: "index.handler",
  role: lambdaRole.arn,
  code: new pulumi.asset.FileArchive("../lambda/file-sync/function.zip"),
  timeout: 30, // seconds — well under SQS visibility timeout of 60s
  memorySize: 256,
  vpcConfig: {
    subnetIds: vpc.privateSubnetIds,
    securityGroupIds: [lambdaSg.id],
  },
  environment: {
    variables: {
      DATABASE_URL: pulumi.interpolate`postgresql://myuser:mypassword123%21@${db.endpoint}/filemanagement?schema=public`,
    },
  },
  tags: { Purpose: "file-sync" },
});

// SQS → Lambda event source mapping with batch processing config
const fileSyncEventSourceMapping = new aws.lambda.EventSourceMapping(
  "file-sync-esm",
  {
    eventSourceArn: fileSyncQueue.arn,
    functionName: fileSyncLambda.arn,
    batchSize: 10,
    maximumBatchingWindowInSeconds: 5,
    functionResponseTypes: ["ReportBatchItemFailures"],
  }
);

export const fileSyncQueueUrl = fileSyncQueue.url;
export const fileSyncQueueArn = fileSyncQueue.arn;
export const fileSyncEventBusArn = fileSyncEventBus.arn;
export const fileSyncLambdaArn = fileSyncLambda.arn;
