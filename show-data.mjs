import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "prisma", "dev.db"), { readonly: true });

const waitlist = db.prepare("SELECT * FROM WaitlistEntry ORDER BY createdAt DESC").all();
const founders = db.prepare("SELECT * FROM FounderContactEntry ORDER BY createdAt DESC").all();

console.log("\n=== WAITLIST (" + waitlist.length + " entries) ===\n");
if (waitlist.length === 0) {
  console.log("No entries yet.");
} else {
  waitlist.forEach((r, i) => {
    console.log(`${i + 1}. ${r.firstName} ${r.lastName} | ${r.company} | ${r.email} | ${r.phone}`);
    console.log(`   Submitted: ${r.createdAt}\n`);
  });
}

console.log("\n=== FOUNDER CONTACT (" + founders.length + " entries) ===\n");
if (founders.length === 0) {
  console.log("No entries yet.");
} else {
  founders.forEach((r, i) => {
    console.log(`${i + 1}. ${r.email} | Submitted: ${r.createdAt}`);
    if (r.message) console.log(`   Message:\n${r.message.split("\n").map(l => "   " + l).join("\n")}`);
    console.log();
  });
}

db.close();
