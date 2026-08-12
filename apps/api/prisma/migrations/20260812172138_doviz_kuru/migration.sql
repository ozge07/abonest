-- CreateTable
CREATE TABLE "exchange_rates" (
    "code" CHAR(3) NOT NULL,
    "tryPerUnit" DECIMAL(18,6) NOT NULL,
    "rateDate" DATE NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("code")
);
