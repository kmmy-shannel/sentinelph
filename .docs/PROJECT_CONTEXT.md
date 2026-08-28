# SentinelPH System Architecture

## Core Tech Stack
- Frontend Web: React 18, Vite, Tailwind CSS (`apps/web`)
- Mobile App: Expo React Native, NativeWind, SQLite (`apps/mobile`)
- API Gateway: Express.js, MongoDB/Mongoose, Firebase Admin (`services/api`)
- AI Service: Python 3.10+, FastAPI, Scikit-Learn (`services/ai-detector`)

## Key Entry Points & Critical File Paths
- Web Entry Point: `apps/web/src/main.jsx`
- Web Case Review Modal: `apps/web/src/components/CaseReviewModal.jsx` (UI Component)
- Web Route Guard: `apps/web/src/components/ProtectedRoute.jsx`
- Mobile Client Entry: `apps/mobile/App.js`
- Mobile API Helper: `apps/mobile/lib/api.js` (Note: Uses `/lib/`, NOT `/services/`)
- Express API Gateway: `services/api/server.js`
- ML Microservice: `services/ai-detector/app/main.py`

## Progress Status
- [x] Phase 1: Gateway Setup & Firebase/Express Middleware (`services/api`)
- [x] Phase 2: MongoDB Schemas, Cryptographic Hash Chain & RBAC (`services/api`)
- [x] Phase 3: Expo React Native Mobile Client (`apps/mobile`)
- [x] Phase 4: React + Tailwind Web Dashboards (`apps/web`)

## API Gateway Middleware Stack (`services/api/server.js`)
- Security: `helmet`, `cors`, `express-mongo-sanitize`, `express-rate-limit`
- Auth: Firebase JWT claims check (`req.user.role`)
- Database: Mongoose connection (`services/api/config/db.js`)