import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const REGION = process.env.AWS_REGION || "ap-south-1";

// Singleton SNS client (only initialized if we have credentials or are in an AWS environment)
const snsClient = new SNSClient({ region: REGION });

export async function sendShareEmailNotification({
  toEmail,
  shareUrl,
  expiryDate,
  downloadLimit,
  hasPassword,
}: {
  toEmail: string;
  shareUrl: string;
  expiryDate: Date;
  downloadLimit: number;
  hasPassword: boolean;
}) {
  const subject = "A file has been shared with you";
  let message = `Hello,\n\nA file has been shared with you via our Secure File Management System.\n\n`;
  message += `Access Link: ${shareUrl}\n`;
  message += `Expires: ${expiryDate.toLocaleString()}\n`;
  message += `Download Limit: ${downloadLimit} downloads\n`;

  if (hasPassword) {
    message += `\nThis share is password protected. You will need to enter the password provided by the sender to access the file.\n`;
  }

  message += `\nThank you,\nFMS Team`;

  // Use SNS if a topic is configured, otherwise fallback to console log for POC
  const topicArn = process.env.SNS_SHARE_NOTIFICATIONS_TOPIC_ARN;

  if (snsClient && topicArn) {
    try {
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
