# SentinelPH — AI Scam Detection Platform

Civic-tech platform for report ingestion, advisory AI scam classification, and two-officer consensus auditing.

## Repository Structure
- `services/api` — Node.js / Express API Gateway (Port 4000)
- `services/ai` — FastAPI / Python ML Microservice (Port 8000)

## Quick Start
1. Clone repository: `git clone https://github.com/YOUR_USERNAME/sentinelph.git`
2. Configure `.env` files from `.env.example` templates in both `services/api` and `services/ai`.
3. Train ML model: `cd services/ai && python -m venv venv && .\venv\Scripts\activate && pip install -r requirements.txt && python scripts/train.py`
4. Start AI Service: `uvicorn app.main:app --port 8000 --reload`
5. Start API Gateway: `cd services/api && npm install && npm run dev`

sentinelph/
├── .docs/
│   ├── PROJECT_CONTEXT.md
│   └── SYSTEM_PROMPT.md
├── .promptignore
├── package.json
├── package-lock.json
├── README.md
│
├── apps/
│   ├── mobile/                              # Citizen-facing Expo app
│   │   ├── App.js
│   │   ├── app.json
│   │   ├── babel.config.js
│   │   ├── package.json
│   │   ├── tailwind.config.js
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── BlacklistStatusBanner.js
│   │   │   ├── OfflineSyncIndicator.js
│   │   │   ├── QuickReportCard.js
│   │   │   └── NearbyAlertsWidget.js        # [NEW] currently inlined in HomeScreen; extract for reuse in AlertsScreen
│   │   ├── db/
│   │   │   ├── sqlite.js                    # Offline Outbox queue
│   │   │   └── syncQueue.js                 # [NEW] background sweep: getPendingReports -> submitReport -> markReportSynced -> deleteSyncedReport
│   │   ├── lib/
│   │   │   ├── api.js                       # Axios client + Firebase token interceptor
│   │   │   └── zkp/                         # [NEW] ZKP local proof generation
│   │   │       ├── nullifierGenerator.js    # [NEW] derives one-time-reporter nullifier client-side
│   │   │       └── proofClient.js           # [NEW] wraps whatever proving library is chosen (e.g. snarkjs)
│   │   ├── notifications/                   # [NEW] Firebase Cloud Messaging
│   │   │   ├── fcmClient.js                 # [NEW] token registration + permission request
│   │   │   └── notificationHandlers.js      # [NEW] foreground/background message handling
│   │   ├── navigation/
│   │   │   └── TabNavigator.js
│   │   └── screens/
│   │       ├── HomeScreen.js                # /home
│   │       ├── ReportScreen.js              # /report/new
│   │       ├── SearchScreen.js              # /search
│   │       ├── AlertsScreen.js              # /alerts
│   │       ├── MyReportsScreen.js           # [NEW] /my-reports — citizen's own submission history
│   │       └── ProfileScreen.js             # /profile
│   │
│   └── web/                                 # Officer / Analyst / Auditor portal
│       ├── index.html
│       ├── package.json
│       ├── postcss.config.js
│       ├── tailwind.config.js
│       ├── vite.config.js
│       ├── public/
│       │   └── favicon.ico
│       └── src/
│           ├── App.jsx
│           ├── main.jsx
│           ├── index.css
│           ├── assets/
│           ├── config/
│           │   └── firebase.js
│           ├── context/
│           │   └── AuthContext.jsx
│           ├── lib/
│           │   └── api.js
│           ├── components/
│           │   ├── Sidebar.jsx
│           │   ├── Topbar.jsx
│           │   ├── StatCard.jsx
│           │   ├── ProtectedRoute.jsx
│           │   ├── CaseReviewModal.jsx      # shared by OfficerDashboard + officer/case/:id detail view
│           │   └── ConsensusStatusWidget.jsx # [NEW] extract from CaseReviewModal for reuse on /officer/case/:id
│           ├── layouts/
│           │   └── DashboardLayout.jsx
│           └── pages/
│               ├── Login.jsx
│               ├── officer/                 # [REORG] group by role — see Section 4 for migration order
│               │   ├── ReviewQueue.jsx      # [RENAME of OfficerDashboard.jsx] /officer/queue
│               │   ├── BlacklistRegistry.jsx # [NEW] /officer/registry
│               │   └── CaseDetail.jsx       # [NEW] /officer/case/:id
│               ├── analyst/
│               │   ├── PatternExplorer.jsx  # [RENAME of AnalystDashboard.jsx] /analyst/patterns
│               │   ├── ModelInsights.jsx    # [NEW] /analyst/model-insights
│               │   └── ReportExporter.jsx   # [NEW] /analyst/reports
│               └── auditor/
│                   ├── VerificationTool.jsx # [RENAME of AuditorDashboard.jsx, split] /auditor/verify
│                   └── AuditTrail.jsx       # [NEW, split from AuditorDashboard.jsx] /auditor/audit-trail
│
├── services/
│   ├── ai/                                  # FastAPI ML microservice
│   │   ├── .env
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── __init__.py                  # [NEW] confirm present — needed for `app.` imports to resolve reliably
│   │   │   ├── main.py
│   │   │   ├── config.py
│   │   │   ├── inference.py
│   │   │   ├── model_loader.py              # [RENAME of model.py]
│   │   │   ├── schemas.py
│   │   │   ├── retrain/                     # [NEW] analyst feedback loop → AI retrain queue
│   │   │   │   ├── feedback_queue.py        # [NEW] receives analyst-flagged misclassifications
│   │   │   │   └── retrain_job.py           # [NEW] scheduled/triggered retraining entrypoint
│   │   │   └── utils/
│   │   │       ├── __init__.py
│   │   │       ├── ocr.py                   # [MOVE target from services/api/utils/ocr.py — merge first, see 1.2]
│   │   │       └── text_normalize.py
│   │   ├── data/
│   │   │   └── sms_spam_collection.tsv
│   │   ├── models/                          # trained artifacts (pickle files) — NOT to be confused with app/model_loader.py
│   │   │   ├── logreg_classifier.pkl
│   │   │   ├── tfidf_vectorizer.pkl
│   │   │   └── model_metadata.json
│   │   └── scripts/
│   │       └── train.py
│   │
│   └── api/                                 # Express Gateway
│       ├── .env
│       ├── package.json
│       ├── server.js
│       ├── config/
│       │   ├── db.js
│       │   └── firebase.js
│       ├── middleware/
│       │   ├── auth.js
│       │   ├── errorHandler.js
│       │   ├── rateLimiter.js
│       │   └── rbac.js
│       ├── models/
│       │   ├── AuditLog.js
│       │   ├── BlacklistEntry.js
│       │   ├── Report.js
│       │   └── User.js
│       ├── controllers/
│       │   ├── blacklistController.js       # Two-Officer Consensus State Machine lives here
│       │   ├── reportController.js
│       │   └── consensusController.js       # [NEW] extract consensus vote-casting logic out of blacklistController.js once /officer/case/:id ships (see Section 4)
│       ├── routes/
│       │   ├── auditor.js                   # Chain Integrity Health Check route
│       │   ├── blacklist.js
│       │   ├── health.js
│       │   └── reports.js
│       ├── jobs/                            # [NEW] background workers — distinct from request/response routes
│       │   └── chainVerificationJob.js      # [NEW] scheduled re-verification of the full hash chain, independent of the on-demand /api/v1/auditor/verify route
│       └── utils/
│           ├── aiServiceClient.js
│           └── hashChain.js