import { PrismaClient } from "./lib/generated/prisma/client";
const prisma = new PrismaClient();
async function main() {
  const files = await prisma.fileObject.findMany({
    where: { name: "browser-dev" },
  });
  console.log(JSON.stringify(files, null, 2));
}
main().finally(() => prisma.$disconnect());
