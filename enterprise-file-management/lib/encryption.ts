
import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const algorithm = "aes-256-gcm"
const secretKey = process.env.ENCRYPTION_KEY || ""

if (!secretKey) {
    throw new Error("ENCRYPTION_KEY is not defined")
}

const key = Buffer.from(secretKey, "hex")

export function encrypt(text: string): string {
    const iv = randomBytes(16)
    const cipher = createCipheriv(algorithm, key, iv)
    let encrypted = cipher.update(text, "utf8", "hex")
    encrypted += cipher.final("hex")
    const authTag = cipher.getAuthTag().toString("hex")
    return `${iv.toString("hex")}:${encrypted}:${authTag}`
}

export function decrypt(text: string): string {
    if (!text) return text

    const [ivHex, encryptedHex, authTagHex] = text.split(":")
    if (!ivHex || !encryptedHex || !authTagHex) {
        // Return potentially unencrypted text for backward compatibility during migration
        // or simply fail if strict mode is desired
        return text
    }

    const iv = Buffer.from(ivHex, "hex")
    const authTag = Buffer.from(authTagHex, "hex")
    const decipher = createDecipheriv(algorithm, key, iv)
    decipher.setAuthTag(authTag)
    let decrypted = decipher.update(encryptedHex, "hex", "utf8")
    decrypted += decipher.final("utf8")
    return decrypted
}
