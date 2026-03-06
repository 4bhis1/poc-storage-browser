"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrismaClient = getPrismaClient;
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
// Reuse across warm invocations
let prisma;
function getPrismaClient() {
    if (!prisma) {
        const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
        const adapter = new adapter_pg_1.PrismaPg(pool);
        prisma = new client_1.PrismaClient({ adapter });
    }
    return prisma;
}
