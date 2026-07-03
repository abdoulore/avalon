import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDatabase } from "./config/database.js";
import { Content } from "./models/Content.js";
import { LedgerEntry } from "./models/LedgerEntry.js";
import { UsageSession } from "./models/UsageSession.js";
import { User } from "./models/User.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// One-line synopses for the public-domain books (keyed by Gutenberg id).
const SYNOPSIS = {
  1342: "Elizabeth Bennet spars with the proud Mr. Darcy in Austen's wit-sharp comedy of manners.",
  84: "A young scientist creates a living being, then abandons it, with tragic consequences.",
  11: "A girl tumbles down a rabbit hole into a kingdom of riddles and contradictions.",
  345: "Letters and journals trace a vampire's move from Transylvania to London.",
  1661: "Twelve cases of pure deduction with the great detective and Dr. Watson.",
  98: "Love and sacrifice across London and Paris on the edge of revolution.",
  2701: "Captain Ahab hunts the white whale that maimed him, whatever the cost.",
  174: "A portrait ages while its beautiful subject does not, and corruption follows.",
  76: "A boy and a runaway man raft down the Mississippi toward freedom.",
  46: "Three spirits show a miser the true cost of a closed heart.",
  35: "A traveller journeys to the far future and finds humanity divided.",
  36: "Martian war machines land in England and civilization buckles.",
  43: "A doctor's experiment splits his good and monstrous selves.",
  5200: "A salesman wakes transformed into a monstrous insect.",
  219: "A voyage up the Congo toward an ivory agent named Kurtz.",
  215: "A stolen dog is pulled from comfort into the Klondike wild.",
  120: "A map, a mutiny, and Long John Silver's hunt for buried gold.",
  16: "The boy who won't grow up takes the Darling children to Neverland.",
  1952: "A woman confined for a 'rest cure' slowly unravels in a papered room.",
  1400: "An orphan's fortunes rise on a mysterious benefactor's gift.",
  55: "A Kansas girl and friends seek a wizard down the yellow brick road.",
  514: "The four March sisters grow up through hardship and love.",
};

await connectDatabase();

await Promise.all([
  Content.deleteMany({}),
  LedgerEntry.deleteMany({}),
  UsageSession.deleteMany({}),
  User.deleteMany({}),
]);

const user = await User.create({
  name: "Demo User",
  email: "demo@avalon.local",
  balanceUsd: 25,
  currency: "USDC",
});

// Seeded content belongs to the demo account (creatorName keeps the real
// author for display): the demo login doubles as the creator-side demo, so
// its dashboard shows the whole catalog's earnings.
const demoCreatorId = String(user._id);

// Every video is a real, full-length film on the public internet (Blender open
// movies, CC-BY; plus public-domain classics). Title, cover, runtime, and the
// file that plays all match — and the URLs are range-verified (HTTP 206), so the
// per-second meter has genuine watch time. covers come from archive.org so the
// poster matches the film.
const VIDEOS = [
  // --- Blender open movies (CC-BY) ---
  ["Big Buck Bunny", "Blender Foundation", "A large, good-natured rabbit takes revenge on three bullying rodents. Blender open movie (2008).", "9:57", "BigBuckBunny_124", "https://archive.org/download/BigBuckBunny_124/Content%2Fbig_buck_bunny_720p_surround.mp4", 0.0012, false],
  ["Elephants Dream", "Blender Foundation", "Two characters explore a strange, shifting machine world. The first Blender open movie (2006).", "10:54", "ElephantsDream", "https://archive.org/download/ElephantsDream/ed_1024_512kb.mp4", 0.0012, false],
  ["Sintel", "Blender Foundation", "A lone warrior crosses a frozen world to find the dragon she once raised. Blender open movie (2010).", "14:48", "Sintel", "https://archive.org/download/Sintel/sintel-2048-stereo_512kb.mp4", 0.0015, true],
  ["Tears of Steel", "Blender Foundation", "Live action meets VFX in a sci-fi short set in a future Amsterdam. Blender open movie (2012).", "12:14", "Tears-of-Steel", "https://archive.org/download/Tears-of-Steel/tears_of_steel_720p.mp4", 0.0015, true],
  ["Cosmos Laundromat", "Blender Foundation", "A suicidal sheep meets a salesman offering infinite lives. Blender open movie (2015).", "12:11", "cosmos-laundromat", "https://archive.org/download/cosmos-laundromat/Cosmos%20Laundromat.mp4", 0.0015, true],
  ["Spring", "Blender Foundation", "A shepherd girl and her dog face the spirits that bring the seasons. Blender animated short (2019).", "7:44", "spring_202601", "https://archive.org/download/spring_202601/Spring.ia.mp4", 0.0012, true],
  ["Hero", "Blender Foundation", "A grease-pencil action short, hand-drawn in 3D space. Blender open movie (2018).", "3:57", "hero_20260106", "https://archive.org/download/hero_20260106/hero.ia.mp4", 0.001, false],
  ["Coffee Run", "Blender Foundation", "A caffeine-fuelled dash through memory and exhaustion. Blender animated short (2020).", "3:05", "coffee-run", "https://archive.org/download/coffee-run/Coffee%20Run.ia.mp4", 0.001, false],
  ["Agent 327: Operation Barbershop", "Blender Foundation", "A Dutch secret agent walks into a barbershop ambush. Blender action short (2017).", "3:52", "agent-327-operation-barbershop", "https://archive.org/download/agent-327-operation-barbershop/Agent%20327%20Operation%20Barbershop.ia.mp4", 0.001, false],
  ["Caminandes: Llamigos", "Blender Foundation", "Koro the llama befriends a stubborn penguin over a winter snack. Blender comedy short (2016).", "2:30", "CaminandesLlamigos", "https://archive.org/download/CaminandesLlamigos/Caminandes_%20Llamigos-1080p.mp4", 0.0008, false],
  ["Caminandes 2: Gran Dillama", "Blender Foundation", "Koro the llama versus an electric fence and his own appetite. Blender comedy short (2013).", "2:26", "Caminandes2GranDillama", "https://archive.org/download/Caminandes2GranDillama/02_gran_dillama_1080p.mp4", 0.0008, false],

  // --- Public-domain classics ---
  ["Night of the Living Dead", "George A. Romero", "Strangers barricade a farmhouse against the recently risen dead. Romero's 1968 horror landmark.", "95:53", "night-of-the-living-dead-1968_202312", "https://archive.org/download/night-of-the-living-dead-1968_202312/Night%20of%20the%20Living%20Dead%20(1968).mp4", 0.001, false],
  ["Charade", "Stanley Donen", "A widow is pursued by men hunting her late husband's fortune. Donen's 1963 comic thriller.", "113:05", "charade-1963-cary-grant-audrey-hepburn-comedy-mystery-romance-thriller-full-movie", "https://archive.org/download/charade-1963-cary-grant-audrey-hepburn-comedy-mystery-romance-thriller-full-movie/Charade_READY.mp4", 0.001, true],
  ["Metropolis", "Fritz Lang", "A worker and an elite clash in a divided future city. Fritz Lang's 1927 sci-fi epic (Pathéscope cut).", "60:25", "youtube-bmNn-hKND4A", "https://archive.org/download/youtube-bmNn-hKND4A/youtube-bmNn-hKND4A.mp4", 0.0012, true],
  ["The General", "Buster Keaton", "A railroad engineer chases his stolen locomotive through the Civil War. Buster Keaton, 1926.", "78:52", "TheGeneral1926", "https://archive.org/download/TheGeneral1926/The_General_1926_720p_512kb.mp4", 0.001, false],
  ["Nosferatu", "F. W. Murnau", "A real-estate clerk's client turns out to be a vampire. Murnau's 1922 silent horror.", "92:14", "nosferatu-v.-1-converted", "https://archive.org/download/nosferatu-v.-1-converted/Nosferatu%20v.1%20(Converted).mp4", 0.001, false],
  ["The Cabinet of Dr. Caligari", "Robert Wiene", "A hypnotist and a sleepwalker in a town of crooked shadows. 1920 German Expressionist landmark.", "74:23", "TheCabinetOfDr.Caligari1920FULLMOVIE", "https://archive.org/download/TheCabinetOfDr.Caligari1920FULLMOVIE/The%20Cabinet%20of%20Dr.%20Caligari%20(1920)%20FULL%20MOVIE.mp4", 0.001, false],
  ["House on Haunted Hill", "William Castle", "Five guests are offered $10,000 to survive a night of terror. Vincent Price, 1959.", "74:43", "The_House_On_Haunted_Hill", "https://archive.org/download/The_House_On_Haunted_Hill/The_House_On_Haunted_Hill_512kb.mp4", 0.001, false],
  ["Plan 9 from Outer Space", "Ed Wood", "Aliens resurrect the dead to stop humanity. Ed Wood's gloriously bad 1959 sci-fi.", "83:18", "mmcmor-Public_Domain_Classics_-_Plan_9_from_Outer_Space_1959_Full_Movie", "https://archive.org/download/mmcmor-Public_Domain_Classics_-_Plan_9_from_Outer_Space_1959_Full_Movie/Public_Domain_Classics_-_Plan_9_from_Outer_Space_1959_Full_Movie.mp4", 0.0008, false],
  ["Sita Sings the Blues", "Nina Paley", "The Ramayana retold through 1920s jazz and animation. Nina Paley, CC-BY-SA (2008).", "81:50", "SitaSingsTheBlues_201812", "https://archive.org/download/SitaSingsTheBlues_201812/Sita%20Sings%20the%20Blues.mp4", 0.0012, true],
];

const videoDocs = VIDEOS.map(([title, creatorName, description, durationLabel, id, mediaUrl, pricePerSecondUsd, isPremium]) => ({
  title,
  creatorId: demoCreatorId,
  creatorName,
  type: "video",
  description,
  coverUrl: `https://archive.org/services/img/${id}`,
  mediaUrl,
  durationLabel,
  pricePerSecondUsd,
  freePreviewSeconds: 0,
  isPremium,
  liveEventPricePerSecondUsd: 0,
}));

// Real public-domain books, pre-fetched + paginated into src/data/books.json
// (see scripts/build-books). Each carries real page text in bookPages, so the
// reader shows the actual book — title and content match.
const booksPath = path.join(__dirname, "data", "books.json");
const booksData = fs.existsSync(booksPath) ? JSON.parse(fs.readFileSync(booksPath, "utf8")) : [];
const bookDocs = booksData.map((b) => ({
  title: b.title,
  creatorId: demoCreatorId,
  creatorName: b.author,
  type: "book",
  description: SYNOPSIS[b.gutenbergId] || `${b.title} by ${b.author}. Public-domain edition via Project Gutenberg.`,
  coverUrl: `https://www.gutenberg.org/cache/epub/${b.gutenbergId}/pg${b.gutenbergId}.cover.medium.jpg`,
  pages: b.pages.length,
  pricePerPageUsd: b.pricePerPageUsd,
  freePreviewPages: b.freePreviewPages,
  isPremium: b.isPremium,
  bookPages: b.pages,
}));

await Content.create([...videoDocs, ...bookDocs]);

await LedgerEntry.create({
  userId: user._id,
  type: "credit",
  amountUsd: 25,
  balanceAfterUsd: 25,
  note: "Seed mock balance",
});

console.log(`Seeded Avalon demo data: ${videoDocs.length} videos, ${bookDocs.length} books.`);
process.exit(0);
