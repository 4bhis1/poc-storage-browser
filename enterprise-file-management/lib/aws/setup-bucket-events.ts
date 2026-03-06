import {
  STSClient,
  AssumeRoleCommand,
} from "@aws-sdk/client-sts";
import {
  S3Client,
  PutBucketNotificationConfigurationCommand,
  GetBucketNotificationConfigurationCommand,
} from "@aws-sdk/client-s3";
import {
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
  DeleteRuleCommand,
  RemoveTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import { IAMClient, CreateRoleCommand, PutRolePolicyCommand, GetRoleCommand } from "@aws-sdk/client-iam";
import { decrypt } from "@/lib/encryption";

interface AwsAccountConfig {
  roleArn: string;
  externalId: string;
  awsAccountId: string;
  region: string;
}

interface SetupResult {
  eventBridgeRuleArn: string;
  eventBridgeRuleTargetId: string;
}

/**
 * Assumes a role in the tenant's AWS account and returns temporary credentials.
 */
async function assumeTenantRole(config: AwsAccountConfig) {
  const stsClient = new STSClient({ region: "us-east-1" });
  const decryptedExternalId = decrypt(config.externalId);

  const { Credentials } = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: config.roleArn,
      RoleSessionName: "CamsEventBridgeSetup",
      ExternalId: decryptedExternalId,
    })
  );

  if (!Credentials) throw new Error("Failed to assume tenant role");

  return {
    accessKeyId: Credentials.AccessKeyId!,
    secretAccessKey: Credentials.SecretAccessKey!,
    sessionToken: Credentials.SessionToken!,
  };
}

/**
 * Ensures an IAM role exists in the tenant account that allows EventBridge
 * to put events to our cross-account event bus.
 */
async function ensureEventBridgeCrossAccountRole(
  iamClient: IAMClient,
  ourEventBusArn: string,
  tenantAccountId: string
): Promise<string> {
  const roleName = "CamsEventBridgeCrossAccountRole";

  try {
    const { Role } = await iamClient.send(new GetRoleCommand({ RoleName: roleName }));
    return Role!.Arn!;
  } catch (err: any) {
    if (err.name !== "NoSuchEntityException") throw err;
  }

  // Role doesn't exist — create it
  const { Role } = await iamClient.send(
    new CreateRoleCommand({
      RoleName: roleName,
      Description: "Allows EventBridge to forward S3 events to CAMS platform event bus",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "events.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        ],
      }),
    })
  );

  // Attach inline policy to allow PutEvents on our bus
  await iamClient.send(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: "AllowPutEventsToCamsBus",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: "events:PutEvents",
            Resource: ourEventBusArn,
          },
        ],
      }),
    })
  );

  return Role!.Arn!;
}

/**
 * Configures S3 → EventBridge → cross-account event bus for a BYOA bucket.
 *
 * Steps:
 *   1. AssumeRole into tenant account
 *   2. Enable EventBridge notifications on the S3 bucket
 *   3. Create/ensure IAM role for EventBridge cross-account PutEvents
 *   4. Create EventBridge rule in tenant account: match this bucket's events → our event bus
 *
 * Required permissions on the tenant IAM role:
 *   - s3:PutBucketNotificationConfiguration
 *   - s3:GetBucketNotificationConfiguration
 *   - events:PutRule
 *   - events:PutTargets
 *   - iam:CreateRole (or iam:GetRole if role already exists)
 *   - iam:PutRolePolicy
 *   - iam:PassRole
 */
export async function setupBucketEventBridge(
  tenantAccount: AwsAccountConfig,
  bucketName: string,
  ourEventBusArn: string
): Promise<SetupResult> {
  const credentials = await assumeTenantRole(tenantAccount);
  const region = tenantAccount.region;

  const s3Client = new S3Client({ region, credentials });
  const ebClient = new EventBridgeClient({ region, credentials });
  const iamClient = new IAMClient({ region: "us-east-1", credentials }); // IAM is global

  // ── Step 1: Enable EventBridge notifications on the S3 bucket ─────────────
  // We must preserve existing notification configs (SNS/SQS/Lambda) if any
  const existingConfig = await s3Client.send(
    new GetBucketNotificationConfigurationCommand({ Bucket: bucketName })
  );

  await s3Client.send(
    new PutBucketNotificationConfigurationCommand({
      Bucket: bucketName,
      NotificationConfiguration: {
        // Preserve existing configs
        TopicConfigurations: existingConfig.TopicConfigurations,
        QueueConfigurations: existingConfig.QueueConfigurations,
        LambdaFunctionConfigurations: existingConfig.LambdaFunctionConfigurations,
        // Enable EventBridge — this is the key addition
        EventBridgeConfiguration: {},
      },
    })
  );

  // ── Step 2: Ensure cross-account IAM role for EventBridge ─────────────────
  const crossAccountRoleArn = await ensureEventBridgeCrossAccountRole(
    iamClient,
    ourEventBusArn,
    tenantAccount.awsAccountId
  );

  // ── Step 3: Create EventBridge rule in tenant account ─────────────────────
  // Rule matches S3 events for this specific bucket and forwards to our event bus
  const ruleName = `cams-s3-events-${bucketName.substring(0, 40)}`;
  const targetId = `cams-platform-bus`;

  const { RuleArn } = await ebClient.send(
    new PutRuleCommand({
      Name: ruleName,
      Description: `Forward S3 events for bucket ${bucketName} to CAMS platform`,
      EventPattern: JSON.stringify({
        source: ["aws.s3"],
        "detail-type": ["Object Created", "Object Deleted", "Object Restore Completed"],
        detail: {
          bucket: { name: [bucketName] },
        },
      }),
      State: "ENABLED",
    })
  );

  await ebClient.send(
    new PutTargetsCommand({
      Rule: ruleName,
      Targets: [
        {
          Id: targetId,
          Arn: ourEventBusArn,
          RoleArn: crossAccountRoleArn,
        },
      ],
    })
  );

  return {
    eventBridgeRuleArn: RuleArn!,
    eventBridgeRuleTargetId: targetId,
  };
}

/**
 * Tears down the EventBridge rule and S3 notification config for a BYOA bucket.
 * Call this when a BYOA bucket is deregistered.
 */
export async function teardownBucketEventBridge(
  tenantAccount: AwsAccountConfig,
  bucketName: string,
  ruleArn: string
): Promise<void> {
  const credentials = await assumeTenantRole(tenantAccount);
  const region = tenantAccount.region;

  const s3Client = new S3Client({ region, credentials });
  const ebClient = new EventBridgeClient({ region, credentials });

  const ruleName = ruleArn.split("/").pop()!;

  // Remove EventBridge rule target then rule
  try {
    await ebClient.send(
      new RemoveTargetsCommand({ Rule: ruleName, Ids: ["cams-platform-bus"] })
    );
    await ebClient.send(new DeleteRuleCommand({ Name: ruleName }));
  } catch (err) {
    console.warn(`Failed to delete EventBridge rule ${ruleName}:`, err);
  }

  // Remove EventBridge notification from S3 bucket (preserve other configs)
  try {
    const existingConfig = await s3Client.send(
      new GetBucketNotificationConfigurationCommand({ Bucket: bucketName })
    );
    await s3Client.send(
      new PutBucketNotificationConfigurationCommand({
        Bucket: bucketName,
        NotificationConfiguration: {
          TopicConfigurations: existingConfig.TopicConfigurations,
          QueueConfigurations: existingConfig.QueueConfigurations,
          LambdaFunctionConfigurations: existingConfig.LambdaFunctionConfigurations,
          // Omitting EventBridgeConfiguration disables it
        },
      })
    );
  } catch (err) {
    console.warn(`Failed to remove S3 EventBridge notification for ${bucketName}:`, err);
  }
}
