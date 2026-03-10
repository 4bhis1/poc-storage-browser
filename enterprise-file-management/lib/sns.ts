import {
  SNSClient,
  PublishCommand,
  SubscribeCommand,
  ListSubscriptionsByTopicCommand,
} from "@aws-sdk/client-sns";

const REGION = process.env.AWS_REGION || "ap-south-1";

// Singleton SNS client (only initialized if we have credentials or are in an AWS environment)
const snsClient = new SNSClient({ region: REGION });

export async function sendShareEmailNotification({
  toEmail,
  shareUrl,
  expiryDate,
  downloadLimit,
  password,
}: {
  toEmail: string;
  shareUrl: string;
  expiryDate: Date;
  downloadLimit: number;
  password?: string;
}) {
  const subject = "A file has been shared with you";
  let message = `Hello,\n\nA file has been shared with you via our Secure File Management System.\n\n`;
  message += `Access Link: ${shareUrl}\n`;
  message += `Expires: ${expiryDate.toLocaleString()}\n`;
  message += `Download Limit: ${downloadLimit} downloads\n`;

  if (password) {
    message += `\nThis share is password protected. The sender has provided the following password for you to access the file:\nPassword: ${password}\n`;
  }

  message += `\nThank you,\nFMS Team`;

  // Use SNS if a topic is configured, otherwise fallback to console log for POC
  const topicArn = process.env.SNS_SHARE_NOTIFICATIONS_TOPIC_ARN;

  if (snsClient && topicArn) {
    try {
      // 1. Check if the email is already subscribed
      const listCommand = new ListSubscriptionsByTopicCommand({
        TopicArn: topicArn,
      });
      const listRes = await snsClient.send(listCommand);

      const isSubscribed = listRes.Subscriptions?.find(
        (sub) => sub.Endpoint === toEmail,
      );

      // 2. If not subscribed, subscribe them.
      // This sends the AWS "AWS Notification - Subscription Confirmation" email.
      if (!isSubscribed) {
        console.log(`Subscribing ${toEmail} to SNS Topic...`);
        const subCommand = new SubscribeCommand({
          TopicArn: topicArn,
          Protocol: "email",
          Endpoint: toEmail,
          ReturnSubscriptionArn: true,
        });
        await snsClient.send(subCommand);
        console.log(
          `Successfully sent subscription request to ${toEmail}. They must confirm it.`,
        );
      }

      // 3. Publish the actual share notification.
      // NOTE: If they haven't confirmed the subscription yet, SNS will silently drop this message for them.
      const command = new PublishCommand({
        TopicArn: topicArn,
        Subject: subject,
        Message: message,
        MessageAttributes: {
          email: {
            DataType: "String",
            StringValue: toEmail,
          },
        },
      });
      const response = await snsClient.send(command);
      return response;
    } catch (error) {
      console.error("Failed to send SNS notification:", error);
      throw error;
    }
  } else {
    // Development/POC fallback
    console.log("========== SNS MOCK SEND ==========");
    console.log("To:", toEmail);
    console.log("Subject:", subject);
    console.log("Body:\n", message);
    console.log("===================================");
    return { MessageId: "mock-sns-id" };
  }
}

export async function sendMagicLinkEmail({
  toEmail,
  magicLinkUrl,
}: {
  toEmail: string;
  magicLinkUrl: string;
}) {
  const subject = "Your Secure Access Link";
  const message = `Hello,\n\nUse the following link to securely access the shared file. This link is valid for 15 minutes.\n\n${magicLinkUrl}\n\nIf you did not request this, please ignore this email.\n\nFMS Team`;

  const topicArn = process.env.SNS_SHARE_NOTIFICATIONS_TOPIC_ARN;
  if (snsClient && topicArn) {
    try {
      // 1. Check if the email is already subscribed
      const listCommand = new ListSubscriptionsByTopicCommand({
        TopicArn: topicArn,
      });
      const listRes = await snsClient.send(listCommand);

      const isSubscribed = listRes.Subscriptions?.find(
        (sub) => sub.Endpoint === toEmail,
      );

      // 2. If not subscribed, subscribe them.
      if (!isSubscribed) {
        console.log(`Subscribing ${toEmail} to SNS Topic for magic link...`);
        const subCommand = new SubscribeCommand({
          TopicArn: topicArn,
          Protocol: "email",
          Endpoint: toEmail,
          ReturnSubscriptionArn: true,
        });
        await snsClient.send(subCommand);
      }

      const command = new PublishCommand({
        TopicArn: topicArn,
        Subject: subject,
        Message: message,
        MessageAttributes: {
          email: {
            DataType: "String",
            StringValue: toEmail,
          },
        },
      });
      return await snsClient.send(command);
    } catch (error) {
      console.error("Failed to send magic link via SNS:", error);
      throw error;
    }
  } else {
    console.log("======= SNS MOCK MAGIC LINK =======");
    console.log("To:", toEmail);
    console.log("Subject:", subject);
    console.log("Body:\n", message);
    console.log("===================================");
    return { MessageId: "mock-sns-magic-link-id" };
  }
}
