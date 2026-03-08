import "dotenv/config";
import prisma from "../lib/prisma";

async function cleanup() {
  console.log("Starting user email cleanup...");

  const users = await prisma.user.findMany();
  console.log(`Found ${users.length} total users.`);

  const emailMap = new Map();

  for (const user of users) {
    const lowerEmail = user.email.toLowerCase();

    if (emailMap.has(lowerEmail)) {
      const existingUser = emailMap.get(lowerEmail);
      console.log(`Duplicate found for ${lowerEmail}:`);
      console.log(
        `  - Keep: ${existingUser.id} (${existingUser.email}) created at ${existingUser.createdAt}`,
      );
      console.log(
        `  - Delete: ${user.id} (${user.email}) created at ${user.createdAt}`,
      );

      // Simple merge logic: delete the duplicate (the one we just found)
      // In a real app, we might need to reassign relations (buckets, logs, etc.)
      // But for this POC development, we'll just delete the redundant admin entry.
      await prisma.user.delete({
        where: { id: user.id },
      });
      console.log(`  Deleted ${user.id}`);
    } else {
      emailMap.set(lowerEmail, user);

      // Update the original user to have a lowercased email if it doesn't
      if (user.email !== lowerEmail) {
        console.log(`Updating ${user.email} -> ${lowerEmail}`);
        await prisma.user.update({
          where: { id: user.id },
          data: { email: lowerEmail },
        });
      }
    }
  }

  console.log("Cleanup complete.");
}

cleanup()
  .catch((e) => {
    console.error("Cleanup failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
