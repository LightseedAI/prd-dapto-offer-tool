// migrate-agent-slugs.js
// One-time script to add slug fields to all existing agents in Firestore.
// Run: node migrate-agent-slugs.js

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import * as dotenv from 'dotenv';
dotenv.config();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const generateSlug = (name, usedSlugs) => {
  const firstName = name.trim().split(' ')[0];
  const base = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
  let slug = base;
  let counter = 2;
  while (usedSlugs.has(slug)) {
    slug = `${base}${counter}`;
    counter++;
  }
  return slug;
};

async function migrate() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const snap = await getDocs(collection(db, 'agents'));
  const agents = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`Found ${agents.length} agents.`);

  const usedSlugs = new Set(agents.filter(a => a.slug).map(a => a.slug));
  let updated = 0;
  let skipped = 0;

  for (const agent of agents) {
    if (agent.slug) {
      console.log(`  SKIP  ${agent.name} — already has slug: "${agent.slug}"`);
      skipped++;
      continue;
    }

    const slug = generateSlug(agent.name, usedSlugs);
    usedSlugs.add(slug);

    await updateDoc(doc(db, 'agents', agent.id), { slug });
    console.log(`  SET   ${agent.name} → "${slug}"`);
    updated++;
  }

  console.log(`\nDone. ${updated} updated, ${skipped} skipped.`);
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
