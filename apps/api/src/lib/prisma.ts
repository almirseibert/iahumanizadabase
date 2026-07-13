import { PrismaClient } from "@prisma/client";

// Singleton usado pela API e pelos workers
export const prisma = new PrismaClient();
