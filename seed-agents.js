// seed-agents.js
// Run this ONCE to populate your Firebase with agents
// Usage: node seed-agents.js

import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, deleteDoc } from "firebase/firestore";

// Your Firebase Configuration
// TODO: Replace with PRD Dapto Firebase credentials
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
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