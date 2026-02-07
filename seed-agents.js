// seed-agents.js
// Run this ONCE to populate your Firebase with agents
// Usage: node seed-agents.js

import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, deleteDoc } from "firebase/firestore";

// Your Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyA0_DuIV2ncy0HDuZJtbeu8c_Eedlj-9W0",
  authDomain: "prd-dapto-offer-tool.firebaseapp.com",
  projectId: "prd-dapto-offer-tool",
  storageBucket: "prd-dapto-offer-tool.firebasestorage.app",
  messagingSenderId: "554675652476",
  appId: "1:554675652476:web:1823ff7c8643cfa5f446f9"
};

// TODO: Replace with PRD Dapto agents
const DEFAULT_AGENTS = [
  { name: 'General Office', email: 'admin@prddapto.com.au' },
  // Add PRD Dapto agents here:
  // { name: 'Agent Name', email: 'agent@prddapto.com.au' },
];

async function seedAgents() {
  console.log("🔥 Connecting to Firebase...");
  
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const agentsCollection = collection(db, "agents");

  // Optional: Clear existing agents first
  console.log("🗑️  Clearing existing agents...");
  const existingAgents = await getDocs(agentsCollection);
  for (const doc of existingAgents.docs) {
    await deleteDoc(doc.ref);
  }
  console.log(`   Deleted ${existingAgents.size} existing agents`);

  // Add all agents
  console.log("📝 Adding agents to Firebase...");
  
  for (const agent of DEFAULT_AGENTS) {
    try {
      await addDoc(agentsCollection, {
        name: agent.name,
        email: agent.email
      });
      console.log(`   ✅ Added: ${agent.name}`);
    } catch (error) {
      console.error(`   ❌ Failed to add ${agent.name}:`, error.message);
    }
  }

  console.log("\n🎉 Done! All agents have been added to Firebase.");
  console.log("   You can now refresh your app to see the agents.");
  
  process.exit(0);
}

seedAgents().catch(console.error);