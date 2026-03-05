/**
 * backend/cognito.js
 * Pure Cognito SDK wrapper — runs only in the Electron main process (Node.js).
 * All five auth flows the agent needs, plus SECRET_HASH computation.
 */

const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
} = require('@aws-sdk/client-cognito-identity-provider');
const crypto = require('crypto');

const REGION      = process.env.AWS_REGION       || 'ap-south-1';
const CLIENT_ID   = process.env.COGNITO_CLIENT_ID;
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET;
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

const client = new CognitoIdentityProviderClient({ region: REGION });

/**
 * Compute the SECRET_HASH required when the app client has a client secret.
 * Formula: HMAC-SHA256(ClientSecret, Username + ClientId)  → base64
 */
function computeSecretHash(username) {
  return crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(username + CLIENT_ID)
    .digest('base64');
}

/**
 * Sign in with email + password via USER_PASSWORD_AUTH.
 * Returns:
 *   - { accessToken, idToken, refreshToken }  on success
 *   - { challengeName, session }               on NEW_PASSWORD_REQUIRED
 */
async function authenticateCognitoUser(email, password) {
  const cmd = new InitiateAuthCommand({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: CLIENT_ID,
    AuthParameters: {
      USERNAME:    email,
      PASSWORD:    password,
      SECRET_HASH: computeSecretHash(email),
    },
  });

  const response = await client.send(cmd);

  if (response.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
    return {
      challengeName: 'NEW_PASSWORD_REQUIRED',
      session: response.Session,
      username: email,
    };
  }

  const tokens = response.AuthenticationResult;
  return {
    accessToken:  tokens.AccessToken,
    idToken:      tokens.IdToken,
    refreshToken: tokens.RefreshToken,
    username:     email,
  };
}

/**
 * Refresh tokens using a stored RefreshToken.
 * Returns: { accessToken, idToken }
 */
async function refreshCognitoToken(refreshToken, username) {
  const cmd = new InitiateAuthCommand({
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: CLIENT_ID,
    AuthParameters: {
      REFRESH_TOKEN: refreshToken,
      SECRET_HASH:   computeSecretHash(username),
    },
  });

  const response = await client.send(cmd);
  const tokens = response.AuthenticationResult;
  return {
    accessToken: tokens.AccessToken,
    idToken:     tokens.IdToken,
  };
}

/**
 * Complete the NEW_PASSWORD_REQUIRED challenge.
 * Returns: { accessToken, idToken, refreshToken }
 */
async function respondToNewPasswordChallenge(username, newPassword, session) {
  const cmd = new RespondToAuthChallengeCommand({
    ClientId:      CLIENT_ID,
    ChallengeName: 'NEW_PASSWORD_REQUIRED',
    Session:       session,
    ChallengeResponses: {
      USERNAME:     username,
      NEW_PASSWORD: newPassword,
      SECRET_HASH:  computeSecretHash(username),
    },
  });

  const response = await client.send(cmd);
  const tokens = response.AuthenticationResult;
  return {
    accessToken:  tokens.AccessToken,
    idToken:      tokens.IdToken,
    refreshToken: tokens.RefreshToken,
    username,
  };
}

/**
 * Initiate the forgot-password flow — sends a verification code to the user's email.
 */
async function forgotPassword(email) {
  const cmd = new ForgotPasswordCommand({
    ClientId:   CLIENT_ID,
    Username:   email,
    SecretHash: computeSecretHash(email),
  });
  await client.send(cmd);
  return { success: true };
}

/**
 * Confirm the forgot-password flow with the emailed code + new password.
 */
async function confirmForgotPassword(email, code, newPassword) {
  const cmd = new ConfirmForgotPasswordCommand({
    ClientId:         CLIENT_ID,
    Username:         email,
    ConfirmationCode: code,
    Password:         newPassword,
    SecretHash:       computeSecretHash(email),
  });
  await client.send(cmd);
  return { success: true };
}

module.exports = {
  authenticateCognitoUser,
  refreshCognitoToken,
  respondToNewPasswordChallenge,
  forgotPassword,
  confirmForgotPassword,
};
