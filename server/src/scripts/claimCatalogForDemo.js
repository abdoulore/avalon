// One-off migration for the accounts rollout: re-point catalog items (and their
// settlement ledger rows) whose creatorId is a legacy author slug — not a real
// user id — to the demo account, which owns the seeded catalog from now on.
// Idempotent: rows already owned by a real user are left alone.
//   node src/scripts/claimCatalogForDemo.js
import { connectDatabase } from "../config/database.js";
import { Content } from "../models/Content.js";
import { LedgerEntry } from "../models/LedgerEntry.js";
import { User } from "../models/User.js";

await connectDatabase();

const demo = await User.findOne({ email: "demo@avalon.local" });
if (!demo) {
  console.error("Demo user not found — run the seed first.");
  process.exit(1);
}

const realUserIds = (await User.find({}, { _id: 1 })).map((u) => String(u._id));
const demoId = String(demo._id);

const content = await Content.updateMany(
  { creatorId: { $nin: realUserIds } },
  { $set: { creatorId: demoId } }
);
const ledger = await LedgerEntry.updateMany(
  { creatorId: { $nin: [...realUserIds, ""] } },
  { $set: { creatorId: demoId } }
);

console.log(`Claimed for demo (${demoId}): ${content.modifiedCount} content docs, ${ledger.modifiedCount} ledger rows.`);
process.exit(0);
