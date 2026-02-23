import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client'

const connectionString = `${process.env.DATABASE_URL}`

const prismaClientSingleton = () => {
  const pool = new Pool({ connectionString })
  const adapter = new PrismaPg(pool)
  // @ts-ignore: Adapter property might be missing in generated types but valid at runtime
  return new PrismaClient({ adapter })
}

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma
