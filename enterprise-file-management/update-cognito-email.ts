import { CognitoIdentityProviderClient, UpdateUserPoolCommand, DescribeUserPoolCommand } from "@aws-sdk/client-cognito-identity-provider";
import { fromIni } from "@aws-sdk/credential-providers";

const client = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: fromIni({ profile: process.env.AWS_PROFILE || 'SMC-RESEARCH-DEVELOPMENT-ADMIN' }),
});

async function main() {
  const userPoolId = process.env.COGNITO_USER_POOL_ID || 'ap-south-1_LDgq3ayzF';
  
  // 1. Fetch current User Pool config so we don't overwrite other settings with defaults
  const describeCommand = new DescribeUserPoolCommand({ UserPoolId: userPoolId });
  try {
    const { UserPool } = await client.send(describeCommand);
    if (!UserPool) throw new Error("User pool not found");

    const htmlMessage = `
<p>Hello <b>{name}</b>,</p>
<p>You have been invited to use Enterprise File Management.</p>
<br>
<p>Here are your login details:</p>
<p>Email: <b>{username}</b></p>
<p>Temporary Password: <b>{####}</b></p>
<br>
<p>Please log in and change your password as soon as possible.</p>
<br>
<p>Best regards,</p>
<p>Enterprise File Management Team</p>
    `.trim();

    // 2. Assemble update parameters. UpdateUserPool requires many fields to be present
    // if we don't want them reset. We copy them from the described UserPool.
    const updateCommand = new UpdateUserPoolCommand({
      UserPoolId: userPoolId,
      Policies: UserPool.Policies,
      DeletionProtection: UserPool.DeletionProtection,
      LambdaConfig: UserPool.LambdaConfig,
      AutoVerifiedAttributes: UserPool.AutoVerifiedAttributes,
      VerificationMessageTemplate: UserPool.VerificationMessageTemplate,
      SmsAuthenticationMessage: UserPool.SmsAuthenticationMessage,
      MfaConfiguration: UserPool.MfaConfiguration,
      DeviceConfiguration: UserPool.DeviceConfiguration,
      EmailConfiguration: UserPool.EmailConfiguration,
      SmsConfiguration: UserPool.SmsConfiguration,
      UserPoolTags: UserPool.UserPoolTags,
      AdminCreateUserConfig: {
        ...UserPool.AdminCreateUserConfig,
        InviteMessageTemplate: {
          EmailSubject: "Welcome to Enterprise File Management!",
          EmailMessage: htmlMessage,
          SMSMessage: "Your username is {username} and temporary password is {####}"
        }
      },
      UserPoolAddOns: UserPool.UserPoolAddOns,
      AccountRecoverySetting: UserPool.AccountRecoverySetting,
    });

    await client.send(updateCommand);
    console.log("Successfully updated User Pool InviteMessageTemplate");
  } catch (e) {
    console.error("Failed to update User Pool:", e);
  }
}

main();
