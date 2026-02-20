
import { SignJWT, jwtVerify } from 'jose';

const SECRET_KEY = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY || 'default-secret-key-change-it';
const ENCODED_SECRET = new TextEncoder().encode(SECRET_KEY);

export async function createAccessToken(payload: any) {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('15m') // Short-lived
        .sign(ENCODED_SECRET);
}

export async function createRefreshToken(payload: any) {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d') // Long-lived
        .sign(ENCODED_SECRET);
}

export async function verifyToken(token: string) {
    try {
        const { payload } = await jwtVerify(token, ENCODED_SECRET);
        return payload;
    } catch (error) {
        return null;
    }
}

export function getAuthHeader(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    const token = localStorage.getItem('accessToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}
