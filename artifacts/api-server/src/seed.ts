import { db } from "@workspace/db";
import { usersTable, agentsTable, offersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Seeding database...");

  const adminEmail = "admin@btc-experiment.com";
  let admin = await db.select().from(usersTable).where(eq(usersTable.email, adminEmail)).limit(1).then(r => r[0]);
  if (!admin) {
    [admin] = await db.insert(usersTable).values({
      email: adminEmail,
      slug: "admin",
      displayName: "Admin",
      role: "admin",
      referralCode: "BTCADMIN",
    }).returning();
    console.log("Created admin user:", admin.email);
  } else {
    console.log("Admin user already exists");
  }

  const ralph = await db.select().from(agentsTable).where(eq(agentsTable.slug, "ralph")).limit(1).then(r => r[0]);
  if (!ralph) {
    await db.insert(agentsTable).values({
      slug: "ralph",
      name: "Ralph",
      description: "The main AI lead-generation agent. Ralph scans the internet for high-intent buyers and routes them to your offers 24/7.",
      persona: "Ralph is your tireless AI agent. He never sleeps, never complains, and gets better results with every rotation.",
      offerUrl: "https://bitcoin.org/en/getting-started",
      fallbackUrl: "https://bitcoin.org",
      isActive: true,
      isPaused: false,
      freeSlotCapacity: 25,
      paidSlotCapacity: 25,
      freeSlotWeight: 1,
      paidSlotWeight: 3,
      slotDurationHours: 24,
      dailyCap: 100,
      paidSlotPrice: 9.99,
      leadApprovalMode: "manual",
      nftMintEnabled: false,
    });
    console.log("Created Ralph agent");
  } else {
    console.log("Ralph already exists");
  }

  const qualifyingOffer = await db.select().from(offersTable).where(eq(offersTable.slug, "btc-starter")).limit(1).then(r => r[0]);
  if (!qualifyingOffer) {
    await db.insert(offersTable).values({
      slug: "btc-starter",
      name: "BTC Starter Pack",
      description: "Get started with Bitcoin in 5 minutes. Free account, no experience needed. Earn your spot in the rotator.",
      offerUrl: "https://bitcoin.org/en/getting-started",
      logoUrl: null,
      isActive: true,
      isQualifying: true,
    });
    console.log("Created qualifying offer: BTC Starter Pack");
  }

  const secondOffer = await db.select().from(offersTable).where(eq(offersTable.slug, "crypto-portfolio-tracker")).limit(1).then(r => r[0]);
  if (!secondOffer) {
    await db.insert(offersTable).values({
      slug: "crypto-portfolio-tracker",
      name: "Crypto Portfolio Tracker",
      description: "Track all your crypto assets in one place. Free plan available.",
      offerUrl: "https://coingecko.com",
      logoUrl: null,
      isActive: true,
      isQualifying: false,
    });
    console.log("Created offer: Crypto Portfolio Tracker");
  }

  console.log("Seed complete!");
  process.exit(0);
}

seed().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
