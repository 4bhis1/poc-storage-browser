import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { fromIni } from '@aws-sdk/credential-providers';
import crypto from 'crypto';

// Access Cognito info from the env
const REGION = process.env.AWS_REGION || 'ap-south-1';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'ap-south-1_LDgq3ayzF';
const CLIENT_ID = process.env.COGNITO_CLIENT_ID || '2tstbe7suat4m124f06selfpul';
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET || '156o2erns4fjj447fa7asqh7lcp9eo145ptkd2uo9l0jf4mp7bvo';

export const cognitoClient = new CognitoIdentityProviderClient({
  region: REGION,
  credentials: fromIni({ profile: process.env.AWS_PROFILE || 'SMC-RESEARCH-DEVELOPMENT-ADMIN' }),
});

export function generateSecretHash(userName: string): string {
  return crypto.createHmac('sha256', CLIENT_SECRET).update(userName + CLIENT_ID).digest('base64');
}

export async function inviteUserToCognito(email: string, tenantId?: string, role: string = 'TEAMMATE', name?: string) {
  try {
    const userAttributes = [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
      { Name: 'custom:role', Value: role },
    ];

    if (name) {
      userAttributes.push({ Name: 'name', Value: name });
    }

    if (tenantId) {
      userAttributes.push({ Name: 'custom:tenantId', Value: tenantId });
    }

    const command = new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: userAttributes,
      DesiredDeliveryMediums: ['EMAIL'],
    });

    const response = await cognitoClient.send(command);
    return response.User;
  } catch (error) {
    console.error('Error inviting user to Cognito:', error);
    throw error;
  }
}

export async function authenticateCognitoUser(email: string, password: string) {
  try {
    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
        SECRET_HASH: generateSecretHash(email),
      },
    });

    const response = await cognitoClient.send(command);
    return response;
  } catch (error) {
    console.error('Cognito Auth Error:', error);
    throw error;
  }
}

import { RespondToAuthChallengeCommand } from '@aws-sdk/client-cognito-identity-provider';

export async function respondToNewPasswordChallenge(email: string, newPassword: string, session: string) {
  try {
    const command = new RespondToAuthChallengeCommand({
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      ClientId: CLIENT_ID,
      ChallengeResponses: {
        USERNAME: email,
        NEW_PASSWORD: newPassword,
        SECRET_HASH: generateSecretHash(email),
      },
      Session: session,
    });

    const response = await cognitoClient.send(command);
    return response;
  } catch (error) {
    console.error('Respond to auth challenge error:', error);
    throw error;
  }
}
