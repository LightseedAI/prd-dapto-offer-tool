# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PRD Dapto Offer Tool is a React application for generating non-binding property purchase offer letters with digital signatures and PDF generation. Built for PRD Dapto real estate professionals.

## Development Commands

```bash
npm run dev        # Start Vite dev server
npm run build      # Production build
npm run preview    # Preview production build
node seed-agents.js # One-time: populate Firebase with agents
```

## Architecture

### Core Files

- **`/src/App.jsx`** (~2400 lines) - Main component containing all form logic, state management, Firebase integration, and admin panel
- **`/src/OfferPdf.jsx`** - PDF template using @react-pdf/renderer

### Data Flow

```
Form Input → React State (formData) → localStorage (auto-save every 3s)
                                   → Firebase Firestore (on submit)
                                   → PDF Generation → Download/Webhook
```

### Key State Structure

```javascript
formData: {
  agentName, agentEmail, propertyAddress,
  buyers: [{ isEntity, firstName/entityName, signature, ... }],
  solicitorCompany, solicitorToBeAdvised,
  purchasePrice, initialDeposit, balanceDeposit,
  financeDate, inspectionDate, settlementDate,
  specialConditions
}
```

### Three Operational Modes

1. **Standard Form** - Full form entry at root URL
2. **QR Code Mode** - Pre-filled via `?id=<shortlinkId>` URL param (skips localStorage draft)
3. **Admin Mode** - Settings icon (bottom-right), password: "PRD"

## Tech Stack

- React 18 + Vite
- TailwindCSS for styling
- Firebase (Firestore + Storage) for persistence
- @react-pdf/renderer for PDF generation
- Google Maps API for address autocomplete
- n8n webhook for form submission notifications

## Key Patterns

### Multi-Buyer System
Supports 1-N buyers per offer, each with individual/entity toggle and separate signature capture.

### Two-Stage Deposits
Initial deposit (on contract) + balance deposit (custom terms).

### Auto-Save
Saves to localStorage every 3 seconds with 24-hour TTL. QR code forms skip draft loading to ensure fresh placeholder values.

### Admin Panel
- **QR Tab**: Generate pre-filled form links
- **Settings Tab**: Configure placeholders, logos
- **Team Tab**: CRUD operations for agents

## Environment Variables

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_PROJECT_ID
VITE_GOOGLE_MAPS_KEY
```

## Firebase Collections

- `agents` - Agent profiles
- `config/settings` - App configuration (logos, placeholders)
- `shortlinks` - QR code URL mappings
- `logos` - Logo gallery

## Constants

```javascript
ADMIN_PASSWORD = "PRD"
AUTOSAVE_INTERVAL = 3000 // ms
CONST_WEBHOOK_URL = "YOUR_WEBHOOK_URL" // TODO: configure for PRD Dapto
```
