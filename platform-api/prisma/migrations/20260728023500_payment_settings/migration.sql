CREATE TABLE "PaymentSetting" (
    "provider" "PaymentProvider" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "payee" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "qrMimeType" TEXT,
    "qrBytes" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSetting_pkey" PRIMARY KEY ("provider")
);
