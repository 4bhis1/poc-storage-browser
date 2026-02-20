
import "dotenv/config";
import { encrypt, decrypt } from "../lib/encryption";

console.log("Testing encryption...");

try {
    const original = "AKIAEXAMPLE1234567890";
    console.log("Original:", original);

    const encrypted = encrypt(original);
    console.log("Encrypted:", encrypted);

    const decrypted = decrypt(encrypted);
    console.log("Decrypted:", decrypted);

    if (original === decrypted) {
        console.log("SUCCESS: Encryption/Decryption works.");
    } else {
        console.error("FAILURE: Decrypted value does not match original.");
    }
} catch (error) {
    console.error("ERROR:", error);
}
