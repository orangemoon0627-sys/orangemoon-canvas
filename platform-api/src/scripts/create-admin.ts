import { Algorithm, hash } from "@node-rs/argon2";

import { PrismaService } from "../prisma/prisma.service";

async function main() {
    const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const password = String(process.env.ADMIN_PASSWORD || "");
    const displayName = String(process.env.ADMIN_DISPLAY_NAME || "橙月管理员").trim().slice(0, 40);
    const resetPassword = String(process.env.ADMIN_RESET_PASSWORD || "").toLowerCase() === "true";
    if (!email || !email.includes("@")) throw new Error("请设置有效的 ADMIN_EMAIL");
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) throw new Error("ADMIN_PASSWORD 至少 8 位并同时包含字母和数字");

    const prisma = new PrismaService();
    await prisma.$connect();
    try {
        const existing = await prisma.user.findUnique({ where: { email } });
        const passwordHash = !existing || resetPassword
            ? await hash(password, { algorithm: Algorithm.Argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 })
            : undefined;
        const user = await prisma.user.upsert({
            where: { email },
            create: { email, displayName, passwordHash: passwordHash!, role: "ADMIN", status: "ACTIVE", wallet: { create: {} } },
            update: { role: "ADMIN", status: "ACTIVE", displayName, ...(passwordHash ? { passwordHash } : {}) },
        });
        await prisma.auditLog.create({ data: { actorId: user.id, action: existing ? "admin.promote" : "admin.create", targetType: "User", targetId: user.id, details: { resetPassword } } });
        process.stdout.write(`管理员已就绪: ${user.email}\n`);
    } finally {
        await prisma.$disconnect();
    }
}

void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "管理员创建失败"}\n`);
    process.exitCode = 1;
});
