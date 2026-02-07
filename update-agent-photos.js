// update-agent-photos.js
// Run this ONCE to add photo URLs to existing agents in Firebase
// Usage: node update-agent-photos.js

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA0_DuIV2ncy0HDuZJtbeu8c_Eedlj-9W0",
  authDomain: "prd-dapto-offer-tool.firebaseapp.com",
  projectId: "prd-dapto-offer-tool",
  storageBucket: "prd-dapto-offer-tool.firebasestorage.app",
  messagingSenderId: "554675652476",
  appId: "1:554675652476:web:1823ff7c8643cfa5f446f9"
};

// TODO: Replace with PRD Dapto agent photo URLs
// Format: { "Agent Name": "photo URL" }
const AGENT_PHOTOS = {
  // "Agent Name": "https://prddapto.com.au/path/to/photo.png",
};

async function updateAgentPhotos() {
  console.log("🔥 Connecting to Firebase...");
  
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const agentsCollection = collection(db, "agents");

  console.log("📸 Fetching existing agents...");
  const snapshot = await getDocs(agentsCollection);
  
  let updated = 0;
  let skipped = 0;

  for (const agentDoc of snapshot.docs) {
    const data = agentDoc.data();
    const photoUrl = AGENT_PHOTOS[data.name];
    
    if (photoUrl) {
      try {
        await updateDoc(doc(db, "agents", agentDoc.id), {
          photo: photoUrl
        });
        console.log(`   ✅ Updated: ${data.name}`);
        updated++;
      } catch (error) {
        console.error(`   ❌ Failed to update ${data.name}:`, error.message);
      }
    } else {
      console.log(`   ⚠️  No photo found for: ${data.name}`);
      skipped++;
    }
  }

  console.log(`\n🎉 Done! Updated ${updated} agents, skipped ${skipped}.`);
  console.log("   Refresh your app to see the photos.");
  
  process.exit(0);
}

updateAgentPhotos().catch(console.error);