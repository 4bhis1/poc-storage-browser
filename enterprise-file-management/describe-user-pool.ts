import { CognitoIdentityProviderClient, DescribeUserPoolCommand } from "@aws-sdk/client-cognito-identity-provider";
import { fromIni } from "@aws-sdk/credential-providers";

const client = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: fromIni({ profile: process.env.AWS_PROFILE || 'SMC-RESEARCH-DEVELOPMENT-ADMIN' }),
});

async function main() {
  const command = new DescribeUserPoolCommand({ UserPoolId: process.env.COGNITO_USER_POOL_ID || 'ap-south-1_LDgq3ayzF' });
  try {
    const res = await client.send(command);
    console.log(JSON.stringify(res.UserPool?.AdminCreateUserConfig, null, 2));
  } catch (e) {
    console.error(e);
  }
}
main();
