import { reseedDemoData } from "../services/seed-service.js";

async function runSeed() {
  await reseedDemoData();
  console.log("MediVanta demo accounts and hospital data have been seeded.");
}

void runSeed();
