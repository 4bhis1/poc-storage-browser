import { jwtVerify, createRemoteJWKSet } from 'jose';

const REGION = process.env.AWS_REGION || 'ap-south-1';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'ap-south-1_LDgq3ayzF';

const jwksUrl = new URL(`https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`);
const JWKS = createRemoteJWKSet(jwksUrl);

export async function verifyToken(token: string) {
    try {
        const { payload } = await jwtVerify(token, JWKS, {
            issuer: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`,
        });
        return payload;
    } catch (error) {
        console.error("Token verification failed:", error);
        return null;
    }
}

export function getAuthHeader(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    const token = localStorage.getItem('accessToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}
