
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';


async function main() {
    console.log("Starting Login Verification...");
    console.log("Database URL:", process.env.DATABASE_URL);

    const email = 'admin@platform.com'; // Using the user seeded in seed.ts
    const password = 'password123'; // The password that corresponds to the hash in seed.ts

    try {
        // 1. Check Database Connection & User Existence
        console.log(`\nSearching for user: ${email}...`);
        const user = await prisma.user.findUnique({
            where: { email },
            include: { tenant: true }
        });

        if (!user) {
            console.error("❌ User not found!");
            return;
        }

        console.log("✅ User found:", user.email, "(ID:", user.id, ")");
        console.log("   Role:", user.role);
        console.log("   Tenant:", user.tenant?.name);
        console.log("   Stored Password Hash:", user.password);

        // 2. Verify Password
        console.log(`\nVerifying password: '${password}'...`);
        const isValid = await bcrypt.compare(password, user.password);

        if (isValid) {
            console.log("✅ Password verification SUCCESSFUL!");
        } else {
            console.error("❌ Password verification FAILED!");
            const testHash = await bcrypt.hash(password, 10);
            console.log("   Diagnostic: New hash for '" + password + "':", testHash);
        }

    } catch (error) {
        console.error("❌ An error occurred during verification:");
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
