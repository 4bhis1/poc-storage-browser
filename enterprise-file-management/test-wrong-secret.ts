import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
import { fromIni } from "@aws-sdk/credential-providers";
import crypto from 'crypto';

const client = new CognitoIdentityProviderClient({
  region: 'ap-south-1',
  credentials: fromIni({ profile: process.env.AWS_PROFILE || 'SMC-RESEARCH-DEVELOPMENT-ADMIN' }),
});

const CLIENT_ID = '2tstbe7suat4m124f06selfpul';
const WRONG_SECRET = 'wrongsecret';

function generateSecretHash(userName: string): string {
  return crypto.createHmac('sha256', WRONG_SECRET).update(userName + CLIENT_ID).digest('base64');
}

async function run() {
  try {
    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: 'Admin@fms.com',
        PASSWORD: 'Admin@Password1',
        SECRET_HASH: generateSecretHash('Admin@fms.com'),
      },
    });
    await client.send(command);
  } catch (e: any) {
    console.error("Wrong secret error:", e.name, e.message);
  }
}

run();
