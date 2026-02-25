import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
import { fromIni } from "@aws-sdk/credential-providers";
import crypto from 'crypto';

const client = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: fromIni({ profile: process.env.AWS_PROFILE || 'SMC-RESEARCH-DEVELOPMENT-ADMIN' }),
});

const CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET || '';

function generateSecretHash(userName: string): string {
  return crypto.createHmac('sha256', CLIENT_SECRET).update(userName + CLIENT_ID).digest('base64');
}

async function testLogin(username: string, password: string) {
  try {
    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
        SECRET_HASH: generateSecretHash(username),
      },
    });
    const result = await client.send(command);
    console.log("Success for:", username);
  } catch (e: any) {
    console.error("Error with:", username, e.name, e.message);
  }
}

async function run() {
  await testLogin('Admin@fms.com', 'Admin@Password1');
  await testLogin('admin@fms.com', 'Admin@Password1');
  await testLogin('11d37d5a-e0a1-70b7-689b-6e774da4fded', 'Admin@Password1');
}

run();
