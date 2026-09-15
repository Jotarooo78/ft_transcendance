import { disconnectPrisma, prisma } from "./prisma.js";

try {
  await prisma.$queryRaw`SELECT 1`;
  console.log("user-service Prisma connection: ok");
} finally {
  await disconnectPrisma();
}
