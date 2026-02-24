import prisma from './lib/prisma';

async function main() {
  const buckets = await prisma.bucket.findMany({
    where: { name: 'file-managment-system-smc-web-app' },
    include: { account: true, objects: false } as any
  });
  console.log("Buckets:", JSON.stringify(buckets, null, 2));
  
  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, tenantId: true }
  });
  console.log("Users:", JSON.stringify(users, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
