import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  InitiateAuthCommand,
  AdminUpdateUserAttributesCommand,
  ConfirmForgotPasswordCommand,
  ForgotPasswordCommand,
  AdminSetUserPasswordCommand,
  AdminEnableUserCommand,
  AdminDisableUserCommand,
  AdminDeleteUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { fromIni } from "@aws-sdk/credential-providers";
import crypto from "crypto";

// Access Cognito info from the env
const REGION = process.env.AWS_REGION || "ap-south-1";
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || "ap-south-1_LDgq3ayzF";
const CLIENT_ID = process.env.COGNITO_CLIENT_ID || "2tstbe7suat4m124f06selfpul";
const CLIENT_SECRET =
  process.env.COGNITO_CLIENT_SECRET ||
  "156o2erns4fjj447fa7asqh7lcp9eo145ptkd2uo9l0jf4mp7bvo";

export const cognitoClient = new CognitoIdentityProviderClient({
  region: REGION,
  ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          sessionToken: process.env.AWS_SESSION_TOKEN
            ? process.env.AWS_SESSION_TOKEN
            : undefined,
        },
      }
    : {}),
});

export function generateSecretHash(userName: string): string {
  return crypto
    .createHmac("sha256", CLIENT_SECRET)
    .update(userName + CLIENT_ID)
    .digest("base64");
}

export async function inviteUserToCognito(
  email: string,
  tenantId?: string,
  role: string = "TEAMMATE",
  name?: string,
) {
  email = email.toLowerCase();
  try {
    const userAttributes = [
      { Name: "email", Value: email },
      { Name: "email_verified", Value: "true" },
      { Name: "custom:role", Value: role },
    ];

    if (name) {
      userAttributes.push({ Name: "name", Value: name });
    }

    if (tenantId) {
      userAttributes.push({ Name: "custom:tenantId", Value: tenantId });
    }

    const command = new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: userAttributes,
      DesiredDeliveryMediums: ["EMAIL"],
    });

    const response = await cognitoClient.send(command);
    return response.User;
  } catch (error) {
    console.error("Error inviting user to Cognito:", error);
    throw error;
  }
}

export async function createUserWithPasswordInCognito(
  email: string,
  password: string,
  role: string = "TENANT_ADMIN",
  name?: string,
  tenantId?: string,
) {
  email = email.toLowerCase();
  try {
    const userAttributes = [
      { Name: "email", Value: email },
      { Name: "email_verified", Value: "true" },
      { Name: "custom:role", Value: role },
    ];

    if (name) {
      userAttributes.push({ Name: "name", Value: name });
    }

    if (tenantId) {
      userAttributes.push({ Name: "custom:tenantId", Value: tenantId });
    }

    const createCommand = new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: userAttributes,
      MessageAction: "SUPPRESS",
    });

    const createResponse = await cognitoClient.send(createCommand);

    const setPasswordCommand = new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      Password: password,
      Permanent: true,
    });

    await cognitoClient.send(setPasswordCommand);

    return createResponse.User;
  } catch (error) {
    console.error("Error creating user with password in Cognito:", error);
    throw error;
  }
}

export async function updateUserRoleInCognito(email: string, role: string) {
  email = email.toLowerCase();
  try {
    const command = new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: [{ Name: "custom:role", Value: role }],
    });
    const response = await cognitoClient.send(command);
    return response;
  } catch (error) {
    console.error("Error updating user role in Cognito:", error);
    throw error;
  }
}

export async function authenticateCognitoUser(email: string, password: string) {
  email = email.toLowerCase();
  try {
    const command = new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
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
    console.error("Cognito Auth Error:", error);
    throw error;
  }
}

export async function refreshCognitoToken(
  userId: string,
  refreshToken: string,
) {
  try {
    const command = new InitiateAuthCommand({
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: CLIENT_ID,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
        SECRET_HASH: generateSecretHash(userId),
      },
    });

    const response = await cognitoClient.send(command);
    return response;
  } catch (error) {
    console.error("Cognito Refresh Error:", error);
    throw error;
  }
}

import { RespondToAuthChallengeCommand } from "@aws-sdk/client-cognito-identity-provider";

export async function respondToNewPasswordChallenge(
  email: string,
  newPassword: string,
  session: string,
) {
  email = email.toLowerCase();
  try {
    const command = new RespondToAuthChallengeCommand({
      ChallengeName: "NEW_PASSWORD_REQUIRED",
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
    console.error("Respond to auth challenge error:", error);
    throw error;
  }
}

export async function forgotPassword(email: string) {
  email = email.toLowerCase();
  try {
    const command = new ForgotPasswordCommand({
      ClientId: CLIENT_ID,
      Username: email,
      SecretHash: generateSecretHash(email),
    });

    const response = await cognitoClient.send(command);
    return response;
  } catch (error) {
    console.error("Forgot password error:", error);
    throw error;
  }
}

export async function confirmForgotPassword(
  email: string,
  confirmationCode: string,
  newPassword: string,
) {
  email = email.toLowerCase();
  try {
    const command = new ConfirmForgotPasswordCommand({
      ClientId: CLIENT_ID,
      Username: email,
      ConfirmationCode: confirmationCode,
      Password: newPassword,
      SecretHash: generateSecretHash(email),
    });

    const response = await cognitoClient.send(command);
    return response;
  } catch (error) {
    console.error("Confirm forgot password error:", error);
    throw error;
  }
}

export async function toggleUserActiveStatusInCognito(
  email: string,
  isActive: boolean,
) {
  email = email.toLowerCase();
  try {
    const CommandConstructor = isActive
      ? AdminEnableUserCommand
      : AdminDisableUserCommand;
    const command = new CommandConstructor({
      UserPoolId: USER_POOL_ID,
      Username: email,
    });
    const response = await cognitoClient.send(command);
    return response;
  } catch (error) {
    console.error(
      `Error ${isActive ? "enabling" : "disabling"} user in Cognito:`,
      error,
    );
    throw error;
  }
}

export async function deleteUserInCognito(email: string) {
  email = email.toLowerCase();
  try {
    const command = new AdminDeleteUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
    });
    const response = await cognitoClient.send(command);
    return response;
  } catch (error) {
    console.error("Error deleting user in Cognito:", error);
    // Suppress error if user already doesn't exist to allow DB cleanup
    if ((error as any).name === "UserNotFoundException") {
      return null;
    }
    throw error;
  }
}
