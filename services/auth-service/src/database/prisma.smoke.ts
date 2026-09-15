import { disconnectPrisma, prisma } from "./prisma.js";

try {
  await prisma.$queryRaw`SELECT 1`;
  console.log("auth-service Prisma connection: ok");
} finally {
  await disconnectPrisma();
}
