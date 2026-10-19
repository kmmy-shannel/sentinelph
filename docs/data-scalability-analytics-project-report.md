# SENTINELPH: A COMMUNITY-POWERED ANTI-SCAM PLATFORM INTEGRATING DISTILBERT RISK TIERING, 2-OF-3 REGIONAL CONSENSUS, AND CRYPTOGRAPHIC HASH CHAINS

## A Collaborative System Project

Presented to  
Department of Computer Science / Information Technology

In Partial Fulfillment of the Requirements for  
**Data Scalability and Analytics**

Prepared by:  
**Group Sentinel (Section DSA-1)**  
Lead Architect, ML Developer, Backend Developer, Frontend/Mobile Developer

**Academic Institution**  
**October 2026**

---

## ABSTRACT

Philippine mobile subscribers continue to receive SMS phishing (smishing) messages that impersonate banks, delivery services, e-wallets, marketplaces, and public agencies. SentinelPH is a community-powered system designed to organize citizen reports, classify risk, support regional officer review, and preserve an auditable record while keeping AI advisory. The prepared corpus contains 7,992 records from five source groups, partitioned into 5,922 training, 658 validation, and 1,412 test examples. Its analytics combine a fine-tuned three-class DistilBERT model, deterministic URL and brand-impersonation rules, Tesseract optical character recognition (OCR), and MongoDB-based officer-vote and subtype-feedback aggregation. The project-reported held-out results are 95.54% accuracy and 0.8856 macro F1; the reported Malicious-class F1 is 0.9183, while Grey Area F1 is 0.7467. The adversarial regression gate passed 27–28 of 28 cases. SentinelPH pairs a React Native reporting client and web review portal with a 2-of-3 regional officer threshold and an append-only SHA-256 report chain. A staged scale plan addresses growth from 7,992 to 80,000 and 800,000 records. The system’s principal design safeguards are advisory-only AI, multi-officer authorization, and privacy-conscious duplicate control. Its current prototype capacity is not benchmarked, and implementation evidence identifies open requirements for chain-write serialization, nullifier verification, regional coverage updates, and reproducible model metrics.

**Keywords:** smishing detection; DistilBERT; regional consensus; privacy-preserving reporting; hash-chain integrity

## TABLE OF CONTENTS

ABSTRACT ............................................................................... i  
1. INTRODUCTION ...................................................................... 1  
   1.1 Background of the Project .................................................... 1  
   1.2 Problem Statement ............................................................ 1  
   1.3 Project Objectives ........................................................... 1  
   1.4 Scope and Limitations ........................................................ 2  
2. DATASET AND DATA PREPARATION ..................................................... 3  
   2.1 Data Sources ................................................................. 3  
   2.2 Data Description ............................................................. 3  
   2.3 Data Preparation ............................................................. 3  
3. ANALYTICS IMPLEMENTATION ........................................................ 4  
   3.1 DistilBERT 3-Class Risk Classification ...................................... 4  
   3.2 Heuristic Rule Layer and OCR Pipeline ....................................... 4  
   3.3 2-of-3 Regional Consensus State Analytics ................................... 5  
   3.4 Summary of Analytical Results ............................................... 5  
4. SYSTEM DESIGN AND DATA WORKFLOW .................................................. 6  
   4.1 System Architecture .......................................................... 6  
   4.2 Data Workflow ................................................................. 6  
   4.3 Technologies Used ............................................................. 6  
5. DASHBOARD AND VISUALIZATION ....................................................... 7  
   5.1 Key Performance Indicators ................................................... 7  
   5.2 Seven-Day Regional Report Volume Trend ....................................... 7  
   5.3 Regional Risk Heatmap and Category Distribution ............................. 7  
   5.4 Officer Subtype Alignment and AI Feedback Matrix ............................ 8  
   5.5 Interactive Filter ........................................................... 8  
6. ANALYTICS-BASED DECISION SUPPORT .................................................. 9  
7. SCALABILITY ANALYSIS ............................................................. 10  
   7.1 Current System Capacity ..................................................... 10  
   7.2 Tenfold Data-Growth Scenario ................................................ 10  
   7.3 Hundredfold Data-Growth Scenario ........................................... 11  
   7.4 Future Scalability Strategy ................................................. 11  
8. DATA QUALITY, ETHICS, PRIVACY, AND GOVERNANCE ................................... 12  
   8.1 Data Quality Concerns ....................................................... 12  
   8.2 Privacy and Security ........................................................ 12  
   8.3 Ethical Considerations ...................................................... 12  
   8.4 Governance and Mitigation ................................................... 13  
9. SYSTEM IMPLEMENTATION AND DEMONSTRATION ......................................... 14  
   9.1 Major System Features ....................................................... 14  
   9.2 Working-System Screen Descriptions .......................................... 14  
10. RESULTS AND DISCUSSION .......................................................... 15  
11. CONCLUSION AND RECOMMENDATIONS .................................................. 16  
   11.1 Conclusion ................................................................. 16  
   11.2 Recommendations ............................................................ 16  
12. INDIVIDUAL CONTRIBUTION ......................................................... 17  
REFERENCES .......................................................................... 18  
APPENDICES ........................................................................... 19  
   Appendix A. Hash-Chain Source Code .............................................. 19  
   Appendix B. Dataset Repositories ................................................. 19  
   Appendix C. Screen Descriptions and Sequence Diagram ............................ 19  
   Appendix D. Architecture and Database Schema ................................... 19  

---

## 1. INTRODUCTION

### 1.1 Background of the Project

Short Message Service (SMS) remains a widely used communication channel for financial alerts, delivery notices, account verification, commerce, and public information. Smishing exploits that familiarity by sending messages that imitate a trusted organization and prompt the recipient to click a link, disclose credentials, provide a one-time password, or call a fraudulent number. Philippine government and commercial brands are frequent lures because citizens routinely receive legitimate service messages from banks, e-wallets, postal and courier services, and online marketplaces.

Republic Act No. 11934, the SIM Registration Act, establishes registration requirements for subscriber identity modules and a policy framework intended to support accountability in the use of SIMs [1]. Registration does not itself determine whether message content is fraudulent, prevent use of compromised or misused accounts, or provide a shared analytical workflow for examining suspicious messages. Official PHLPost advisories have documented scams that misuse the agency’s name and direct recipients to fake websites, illustrating the continuing relevance of brand-impersonation detection [2]. SentinelPH therefore treats incoming reports as evidence for analysis and review rather than assuming that sender registration alone resolves content-based fraud.

A useful anti-scam system must address language variation, local brands, evolving domains, and uncertainty between ordinary marketing and fraud. Data analytics can help organize these signals at scale, but analytical predictions should be bounded by their validation data and error rates. SentinelPH combines a three-class message-risk model with deterministic rules and a regional human review process. It is designed to help officers prioritize evidence while reserving consequential blacklist decisions for an authorized quorum.

### 1.2 Problem Statement

The project addresses four related operational problems:

1. **Fragmented intake and inconsistent triage.** Reports may arrive through separate channels, with different levels of detail and no unified record for regional review or analytics.
2. **False-positive and false-negative risks.** Fully automated blacklisting can harm legitimate senders, while a model can also miss new or obfuscated campaigns. Aggregate accuracy alone does not describe these risks.
3. **Insufficient auditability.** A conventional mutable database can be altered by an actor with sufficient privileges, making it difficult to establish the sequence and integrity of reports after the fact.
4. **Citizen privacy and duplicate abuse.** A reporting service needs to identify duplicate submissions and limit abuse without collecting more reporter identity information than necessary.

SentinelPH responds with structured citizen reporting, advisory AI, regional officer review, a threshold decision rule, and a hash-linked report ledger. These mechanisms reduce specific risks but do not, by themselves, prove that every report is accurate, that every account is uncompromised, or that data is anonymous.

### 1.3 Project Objectives

**General objective.**  
To design, implement, and evaluate SentinelPH, a community-powered, multi-tenant anti-scam platform integrating citizen reporting, two-level AI risk classification, 2-of-3 regional officer threshold consensus, and an append-only SHA-256 hash-chained report ledger.

**Specific objectives.**

1. **Data sourcing and preparation:** assemble and prepare a 7,992-record Philippine-context and international SMS corpus from five source groups, harmonize labels, remove duplicates, and evaluate a fine-tuned DistilBERT model with a deterministic heuristic layer.
2. **Privacy-conscious mobile reporting:** provide a React Native mobile workflow with an offline SQLite outbox and duplicate-submission controls based on a report-nullifier design.
3. **Officer review and consensus:** provide a role-scoped web portal and server-side state transition that requires two approvals within a three-officer regional panel before blacklist finalization, while recording subtype feedback for future model improvement.
4. **Integrity and access control:** protect the report ledger with canonical SHA-256 chaining, use Firebase JWT authentication and four primary RBAC roles, and protect password-change OTP values with a server-side peppered hash.

### 1.4 Scope and Limitations

The project covers SMS phishing and scam reports, sender or brand impersonation indicators, three Level 1 risk tiers (Legitimate, Grey Area, and Malicious), optional Level 2 subtype classification, OCR-assisted screenshot intake, regional review, blacklist disposition, report auditability, and growth planning. The prepared corpus contains 7,992 records; its train, validation, and test partitions contain 5,922, 658, and 1,412 records, respectively.

The current shared application configuration enumerates 17 regions: NCR, CAR, Regions I–XIII, and BARMM. This is the project’s configured coverage, not a complete representation of the current national administrative-region structure: Republic Act No. 12000 established the Negros Island Region in 2024, and the present shared region list does not include it [3]. The configuration should be updated before the system is described as covering every current Philippine region.

The four primary application roles are citizen, officer, admin, and superadmin. AI is advisory only and cannot finalize a blacklist. Finalization requires two approving votes from distinct eligible officers in a three-officer panel; this is a quorum, so a third vote is not required once two approvals have been recorded. A project-reported 30–60 second cold start may affect initial access to the hosted AI service. This is a reported operational observation, not a measured service-level objective. The model’s language coverage is bounded by its training and evaluation data; the project has no supplied performance breakdown for regional Philippine languages, dialects, code-switching, or OCR-corrupted text. The project also lacks production-scale throughput, latency, uptime, and cost benchmarks. Record-volume scenarios in Section 7 are capacity plans, not demonstrated results.

---

## 2. DATASET AND DATA PREPARATION

### 2.1 Data Sources

The five source groups combine Philippine SMS examples, Tagalog messages, international labeled corpora, and official brand-fraud contrast examples. The supplied source-pool counts are not the final retained counts. They sum to more than the prepared corpus because source inventories can overlap and because filtering, harmonization, selection, and deduplication were applied. Source-by-source retained counts were not supplied.

| Dataset | Source | Supplied source-pool count | Purpose |
|---|---|---:|---|
| Philippine Spam/Scam SMS | bwandowando, Kaggle | Approximately 1,000 | Philippine scam and spam patterns, including local sender and brand conventions. |
| Tagalog SMS Corpus | Kaggle corpus identified in the project brief | Approximately 1,000 | Tagalog language coverage and local message forms. |
| SMS Phishing Dataset for Machine Learning and Pattern Recognition | Mishra and Soni, Mendeley Data, f45bkkt8pr [9] | 5,971 | Labeled Ham, Spam, and Smishing messages; international SMS examples. |
| A Balanced Dataset for Spam and Smishing Detection using LLMs | Munoz and Islam, Mendeley Data, vmg875v4xs [10] | 10,191 | Balanced Ham, Spam, and Smishing records; the publisher states that an LLM was used to create the dataset. |
| PH Brand Contrast Set | Curated from official brand and agency advisories | 45 | Contrast real official domains with malicious domains named in advisories for BDO, BPI, Metrobank, PHLPost, GCash, Maya, Lazada, Shopee, and J&T. |
| **Prepared project corpus after adaptation and partitioning** | **SentinelPH data preparation pipeline** | **7,992** | **Final records across training, validation, and test partitions.** |

The PH Brand Contrast Set uses domains documented in public advisories; the project brief specifically identifies phlpost.gov-gdt.win from a PHLPost release dated May 2025. No malicious domain was artificially generated for the contrast set. The project should preserve each example’s source URL, publication date, and evidence of domain attribution.

### 2.2 Data Description

The report record schema combines immutable report evidence and chain metadata with AI assessment and workflow state. The table describes the principal fields specified for the manuscript and the current API model.

| Field | Description | Data type |
|---|---|---|
| reportId | Stable unique identifier for a report. | String |
| textData | Submitted SMS or OCR-extracted content used as report evidence. | String, nullable |
| reportedNumber | Reported originating number or sender header. | String |
| nullifier | Unique report token used for duplicate-submission checking. | String |
| location.region | Region associated with the report, or an unclassified sentinel if unavailable. | String |
| aiFlag.probabilityScore | Model probability or confidence field returned by the AI service. | Number in [0, 1], nullable |
| aiFlag.label | Level 1 risk label, such as legitimate, grey_area, or malicious. | String / enum |
| aiFlag.subtype | Optional Level 2 subtype, such as phishing_link or brand_marketing. | String / enum, nullable |
| status | Report workflow state, including pending, under review, one approval, blacklisted, or rejected. | String / enum |
| sequence | Ordered report position used for chain verification. | Integer |
| previousHash | Digest of the preceding report in the chain, or the configured genesis digest. | 64-character hexadecimal string |
| hash | SHA-256 digest of canonical report fields and previousHash. | 64-character hexadecimal string |

The implementation distinguishes the hash-chained report payload from mutable workflow fields such as votes and status. Report identity, text, sender, location, nullifier, AI assessment, sequence, and creation time form the canonical payload used by the chain utility. This separation permits the system to retain workflow history, but vote and status events require their own audit controls.

    ### 2.3 Data Preparation

    Preparation performs the following documented operations:

    - remove records with missing textData or invalid level1_label;
    - remove 640 template duplicates using scripts/adapt_new_datasets.py;
    - normalize message text and repair URL spacing, including OCR line-break cases;
    - harmonize source labels into Legitimate, Grey Area, and Malicious;
    - partition the prepared corpus into training, validation, and test sets;
    - verify that the three partitions have zero exact-text overlap.

    The split sizes reconcile arithmetically: 5,922 + 658 + 1,412 = 7,992. The exact-text audit prevents exact duplicate leakage but does not rule out near-duplicate templates, campaign-level leakage, source overlap, or temporal leakage. Those checks should be added before later model releases.

    The shared normalizer in services/ai/app/utils/text_normalize.py performs Unicode NFKC normalization, lowercasing, OCR URL repair, replacement of URLs, email addresses, and Philippine-format mobile numbers with tokens, conservative leetspeak substitutions, punctuation stripping, and whitespace collapsing. The following function expresses that sequence using the shared helper patterns used by the project:

    ```python
    import re
    import unicodedata

    URL_PATTERN = re.compile(r"(https?://\S+|www\.\S+)")
    EMAIL_PATTERN = re.compile(r"\S+@\S+\.\S+")
    PHONE_PATTERN = re.compile(r"\b(?:\+?63|0)?9\d{9}\b")
    MULTI_WHITESPACE = re.compile(r"\s+")
    NON_ALNUM = re.compile(r"[^a-z0-9\s]")
    LEET_MAP = {"@": "a", "0": "o", "1": "i", "3": "e", "$": "s", "5": "s", "7": "t"}

    OCR_JOIN_SCHEME = re.compile(r"(https?://)\s*\n\s*", re.IGNORECASE)
    OCR_JOIN_WWW = re.compile(r"(www\.)\s*\n\s*", re.IGNORECASE)
    OCR_DOMAIN_BEFORE_TLD = re.compile(r"([a-z0-9\-]+)\.\s*\n\s*([a-z]{2,})", re.IGNORECASE)
    OCR_DOMAIN_MID_SPLIT = re.compile(r"([a-z0-9\-]+)\s*\n\s*\.([a-z]{2,})", re.IGNORECASE)

    def repair_ocr_url_breaks(text: str) -> str:
        """Rejoin common OCR line breaks inside URL schemes and domain names."""
        if not text:
            return text
        text = OCR_JOIN_SCHEME.sub(r"\1", text)
        text = OCR_JOIN_WWW.sub(r"\1", text)
        text = OCR_DOMAIN_BEFORE_TLD.sub(r"\1.\2", text)
        return OCR_DOMAIN_MID_SPLIT.sub(r"\1.\2", text)

    def normalize_sms_text(raw_text: str) -> str:
        """Normalize SMS/OCR text; URL repair runs before token replacement."""
        if not raw_text:
            return ""
        text = repair_ocr_url_breaks(raw_text)
        text = unicodedata.normalize("NFKC", text).lower()
        text = URL_PATTERN.sub(" __url__ ", text)
        text = EMAIL_PATTERN.sub(" __email__ ", text)
        text = PHONE_PATTERN.sub(" __phone__ ", text)
        text = "".join(LEET_MAP.get(char, char) for char in text)
        text = NON_ALNUM.sub(" ", text)
        return MULTI_WHITESPACE.sub(" ", text).strip()
    ```

    The URL-repair helper is applied before this function’s substitutions so that OCR text such as a scheme or domain split across lines can be rejoined before URL tokenization. The actual shared implementation exports normalize_text; normalize_sms_text above is a report-level name for the same documented transformation, not a separately verified production function. Training and serving must use the same version to avoid preprocessing skew.

    The reported training-class distribution is:

    | Class | Training rows | Share |
    |---|---:|---:|
    | Legitimate | 3,512 | 59.3% |
    | Grey Area | 411 | 6.9% |
    | Malicious | 1,999 | 33.8% |
    | **Total** | **5,922** | **100.0%** |

    Grey Area is the minority class. It represents a difficult boundary between ordinary marketing, transactional messages, and scam-like urgency. Class-specific metrics and review of Grey Area errors are therefore necessary in addition to overall accuracy.

---

## 3. ANALYTICS IMPLEMENTATION

### 3.1 Analytics Function 1 — DistilBERT 3-Class Risk Classification

**Purpose.**  
Estimate whether a reported message is Legitimate, Grey Area, or Malicious and provide a triage signal to the review workflow. The model does not make a final legal determination or blacklist a target.

**Method.**  
The project fine-tuned distilbert-base-uncased, a 66-million-parameter transformer model, for four epochs on an NVIDIA RTX 5070 GPU. The reported learning rate was 5e-5, maximum sequence length was 256 tokens, and Epoch 2 was selected as the best checkpoint. DistilBERT uses a distilled transformer architecture intended to reduce model size and inference cost while retaining useful language-model capability [4]. The exact tokenizer, random seed, batch schedule, label mapping artifact, and training-code revision should accompany the final model release.

**Input.**  
Normalized SMS text, whether typed or extracted from an image using the OCR pipeline.

**Output.**  
A three-class label and probability/risk metadata. The optional Level 2 model may add a subtype, but no independent subtype accuracy or F1 results were supplied.

**Test results.**  
The course-project evaluation reports 95.54% accuracy and 0.8856 macro F1 on 1,412 held-out examples. F1 was 0.9918 for Legitimate, 0.7467 for Grey Area, and 0.9183 for Malicious.

| True class | Predicted Legitimate | Predicted Grey Area | Predicted Malicious | Support |
|---|---:|---:|---:|---:|
| Legitimate | 967 | 4 | 5 | 976 |
| Grey Area | 6 | 84 | 24 | 114 |
| Malicious | 1 | 23 | 298 | 322 |
| **Predicted total** | **974** | **111** | **327** | **1,412** |

The matrix contains 1,349 correct predictions, yielding 1,349 / 1,412 = 95.54% accuracy after rounding. Grey Area is the weakest tier, and the confusion matrix shows both escalation errors (24 true Grey Area messages classified Malicious) and under-classification errors (six classified Legitimate). A Malicious-to-Legitimate error occurred once. An officer interface should display the model tier as an assessment and preserve the message evidence and applied rules.

### 3.2 Analytics Function 2 — Heuristic Rule Layer and OCR Pipeline

**Purpose.**  
Detect known structural indicators and make screenshots usable for message analysis where manual transcription is inconvenient.

**Method.**  
The deterministic rule layer supplements model output. Project-specified rules floor the Malicious probability at 0.90 for suspicious top-level domains such as .icu and .xyz or identified brand impersonation. A verified official *.gov.ph host and Anti-Scam public service messages containing the negation phrase “huwag mag-click” are specified as force-legitimate cases. The rules are asymmetric and must be versioned, logged, and tested against benign and malicious counterexamples. An official-domain rule must parse and validate the hostname boundary; substring matching could mistake a deceptive host for a genuine government domain.

For screenshots, Tesseract OCR extracts text from uploaded images. OCR URL repair attempts to rejoin domains broken by line wrapping before normalization and classification. The extracted text and OCR confidence, where available, should be shown to the user or reviewer because recognition errors can alter spelling, punctuation, digits, and URLs.

**Input.**  
Submitted SMS text or a supported image containing the message; detected links, sender information, and rule patterns.

**Output.**  
OCR text when an image is supplied, model risk metadata, and any applicable deterministic override or risk floor. The report should distinguish raw model results from final post-rule results.

**Interpretation.**  
Rules can improve sensitivity to known patterns but cannot recognize every novel campaign. A force-legitimate override can suppress a genuine model warning, while a malicious-risk floor can produce false alarms. The rules remain advisory and must not trigger blacklist finalization.

### 3.3 Analytics Function 3 — 2-of-3 Regional Consensus State Analytics

**Purpose.**  
Translate independent officer decisions into a consistent report state and aggregate subtype feedback for later analysis and retraining.

**Method.**  
The review workflow stores votes with officer identity, decision, comment, timestamp, and optional subtype action (confirmed, corrected, or unsure). The Report model’s vote operation uses a MongoDB update pipeline to append a vote, recompute approval and rejection counts, and update the report state in a single database operation. The decisive threshold is two approvals; the panel allows up to three officers. The route applies officer authorization and region scoping, while the model prevents the same user from voting twice and rejects votes on resolved reports.

When subtype feedback is available, corrected and confirmed labels are aggregated. The project specifies a threefold training weight for high-value corrected samples. This is a training-data weighting rule, not an independently measured model gain. Officer feedback should be reviewed and versioned before retraining; a vote is not automatically verified ground truth.

**Input.**  
Report identifier, authenticated officer identity and jurisdiction, approve/reject decision, review comment, and optional subtype feedback.

**Output.**  
Updated approval/rejection counts, open or resolved workflow state, a blacklist state after quorum approval, and aggregated subtype feedback.

**Interpretation.**  
The 2-of-3 rule prevents one officer from finalizing a blacklist entry and allows a decision once quorum is reached. It does not establish that the allegation is correct, eliminate collusion, or guarantee geographic independence unless voter eligibility is enforced by server-side role and jurisdiction checks. The atomic vote update protects the threshold transition from common concurrent-vote races; report-chain appends use a separate write path and require independent concurrency review.

### 3.4 Summary of Analytical Results

| Analytics function | Main result | Interpretation | Decision or action |
|---|---|---|---|
| DistilBERT Level 1 classifier | 95.54% reported accuracy; 0.8856 macro F1 on 1,412 test rows. | Strong overall discrimination, with lower Grey Area F1 (0.7467). | Use to prioritize human review; do not automatically blacklist. |
| Heuristic and OCR layer | Suspicious-domain/brand rules, official-domain and PSA exceptions, and OCR text extraction. | Improves pattern coverage but introduces rule and OCR error risks. | Preserve raw model scores, OCR output, rule identifiers, and final advisory result for review. |
| Regional consensus and subtype aggregation | Two approvals from a panel of three finalize a positive blacklist decision; feedback is aggregated. | Encodes a multi-officer threshold and collects structured correction signals. | Verify role, jurisdiction, distinct voter identity, and audit history; curate feedback before retraining. |

---

## 4. SYSTEM DESIGN AND DATA WORKFLOW

### 4.1 System Architecture

The system is organized into five logical layers:

```text
+------------------------------------------------------------+
| 1. CLIENT TIER                                             |
| React Native / Expo mobile app; React + Vite web portal     |
| SQLite offline outbox; citizen reporting; officer review    |
+-------------------------------+----------------------------+
                                |
                                v
+------------------------------------------------------------+
| 2. GATEWAY TIER                                             |
| Node.js 20 + Express API on Render; Firebase Auth JWT       |
| Input validation, authentication, API routing, rate limits  |
+-------------------------------+----------------------------+
                                |
                                v
+------------------------------------------------------------+
| 3. BUSINESS AND WORKFLOW TIER                               |
| Report lifecycle; RBAC and jurisdiction checks; voting;    |
| blacklist synchronization; audit events; hash-chain calls  |
+-------------------------------+----------------------------+
                                |
                    +-----------+-----------+
                    |                       |
                    v                       v
+--------------------------------+  +-------------------------+
| 4. AI MICROSERVICE TIER        |  | 5. STORAGE TIER         |
| Python 3.11 / FastAPI          |  | MongoDB Atlas M0        |
| DistilBERT + rules + Tesseract |  | reports, users,         |
| Hugging Face Spaces, port 7860 |  | auditlogs, blacklist,   |
|                                |  | password-change OTPs    |
+--------------------------------+  +-------------------------+
```

The mobile client supports reporting and local queuing. The web portal provides role-scoped review and management workflows. The Express gateway authenticates Firebase tokens, validates requests, calls the AI service, and mediates database operations. Business logic separates report ingestion, officer decisions, and blacklist finalization. The FastAPI service performs text classification and OCR-related analysis. MongoDB stores reports and supporting user, audit, blacklist, and OTP data. Render, Hugging Face Spaces, and Atlas are the current reported hosting services; their free or development-scale plans should not be interpreted as production capacity.

### 4.2 Data Workflow

1. **Ingestion:** a citizen enters SMS text or submits a screenshot through the mobile app. If the device is offline, the local SQLite outbox retains the report for later synchronization.
2. **Processing:** the API validates required content and sender information, obtains an advisory assessment from the AI service, and applies OCR extraction when an image is supplied. The service retains the distinction between user-provided text, OCR text, raw model output, and heuristic-adjusted output.
3. **Storage:** the gateway stores report content, location, nullifier, AI metadata, workflow state, and chain metadata in MongoDB. The report receives a sequence number, predecessor digest, and SHA-256 digest.
4. **Analytics:** the classifier and rules produce risk metadata; MongoDB queries and aggregations summarize reports, regional volume, officer votes, consensus state, and subtype feedback.
5. **Visualization:** role-authorized dashboards present report counts, risk categories, pending review, regional patterns, and officer feedback. Filters should apply to the same authorized scope as the underlying query.
6. **Disposition:** officers review evidence and vote. A two-approval quorum changes the report to a finalized positive state and synchronizes the corresponding blacklist entry.
Duplicate retry behavior, and chained storage must be coordinated through idempotent API handling. A repeated network request should not create a second report or create a fork in chain order.

### 4.3 Technologies Used

| Component | Technology | Purpose |
|---|---|---|
| Frontend and mobile client | React Native, Expo SDK 51, SQLite | Citizen report entry, offline outbox, device-side interaction. |
| Web portal | React 18, Vite, Tailwind CSS | Officer review queue, dashboards, blacklist and user administration. |
| Backend and API | Node.js 20, Express | Authentication integration, validation, workflow orchestration, and API operations. |
| Authentication | Firebase Authentication and JWT | User sign-in and token-based API authentication. |
| Database | MongoDB Atlas M0, Mongoose | Report ledger and workflow collections. |
| Analytics | Python 3.11, FastAPI, DistilBERT, deterministic rules | Risk classification and model service endpoints. |
| OCR | Tesseract | Extract message text from screenshots for review and analysis. |
| Integrity | Node.js crypto module, SHA-256 | Canonical report hashing and chain verification. |
| Visualization | React dashboard components and chart/summary views | Present KPIs, regional and risk summaries, and officer feedback. |
| Current hosting | Render and Hugging Face Spaces | API gateway and AI microservice hosting in the reported prototype. |

---

## 5. DASHBOARD AND VISUALIZATION

### 5.1 Key Performance Indicators

The dashboard should display operational measures derived from authorized live queries. Except for the model evaluation metric, the task materials do not provide a dated database snapshot; those values are therefore defined below rather than fabricated.

| KPI | Definition | Reported value or source |
|---|---|---|
| Total Reports | Number of stored report records within the selected scope and date range. | Live database aggregate; no fixed snapshot supplied. |
| AI Model Accuracy | Correct predictions divided by the 1,412 held-out test examples. | 95.54% project-reported evaluation result. |
| Open Reports Pending Vote | Unresolved reports in the selected jurisdiction for which the current officer has not voted. | Live database aggregate; no fixed snapshot supplied. |
| Active Officers | Number of active officer accounts in the selected jurisdiction or full admin scope. | Live user aggregate; no fixed snapshot supplied. |

The 95.54% KPI is a frozen evaluation result, not a live operational accuracy estimate. A live accuracy dashboard would require subsequently adjudicated ground-truth labels and a defined evaluation window.

### 5.2 Visualization 1 — Seven-Day Regional Report Volume Trend

**Chart type:** multi-series line chart or stacked area chart.  
**Data source:** report creation timestamps grouped by local calendar date and configured region, filtered by the viewer’s jurisdiction.  
**Operational insight:** a sudden rise in one region may indicate a coordinated campaign or a service reporting burst. Analysts can compare the timing of volume changes with newly reported brands, URLs, and scam subtypes. Counts should use an explicit timezone and exclude test or seed records.

### 5.3 Visualization 2 — Regional Risk Heatmap and Category Distribution

**Chart type:** choropleth or region-by-risk heatmap paired with a stacked bar chart.  
**Data source:** reports grouped by location.region, Level 1 risk label, and scam category.  
**Operational insight:** the heatmap shows where reports are concentrated; the category distribution shows whether a region’s reports are predominantly delivery, account, prize, or other scam patterns. A high count indicates report activity, not necessarily the true prevalence of scams, because reporting behavior and access to the app can differ across regions.

### 5.4 Visualization 3 — Officer Subtype Alignment and AI Feedback Matrix

**Chart type:** stacked bars for Confirmed, Corrected, and Unsure officer subtype verdicts, accompanied by a confusion-style matrix comparing AI subtype with the final officer-aggregated subtype.  
**Data source:** vote fields for subtypeAction, correctedSubtype, AI subtype at vote time, and high-value feedback flag.  
**Operational insight:** a concentration of corrections for one subtype can identify a taxonomy or model weakness. Unsure responses should remain visible and should not be silently converted to confirmed labels. High-value samples may receive the specified 3× training weight only after data-quality review.

### 5.5 Interactive Filter

The primary dashboard filter is **Regional Jurisdiction and Scam Type**. Applying it should change the report count, pending-vote count, seven-day series, heatmap/category distribution, and subtype-feedback chart to the same region/category subset. The officer’s view is restricted to the assigned jurisdiction; admin and superadmin views may use broader scopes according to server-side authorization.

This report defines the intended filter semantics. No dated dashboard export or interaction recording was supplied, so it does not claim that a particular set of values or regional chart changes was observed during a live demonstration.

---

## 6. ANALYTICS-BASED DECISION SUPPORT

| Analytical result | Interpretation | Recommended decision |
|---|---|---|
| AI returns a high Malicious score or a suspicious-domain rule raises the risk floor. | The message has indicators consistent with known scam patterns, but model and rule errors remain possible. | Place the report in the review queue, show the evidence and applied rule, and request human verification. Do not auto-blacklist. |
| Two eligible officers approve the same report in the regional panel. | The configured 2-of-3 quorum has been met. | Finalize the positive report state and synchronize the blacklist record through the authorized API operation; retain the vote and audit history. |
| Officer feedback corrects an AI subtype and is marked high-value. | The example may be useful for improving subtype training data. | Preserve the original AI output and correction, inspect label quality and provenance, then include the validated record using the specified 3× sample weight in a controlled training release. |
| OCR output is incomplete or a URL appears malformed. | The input may contain recognition noise that changes classification. | Request a text confirmation or manual review; do not treat OCR output as verified source text. |
| Report is classified as Grey Area or the model is unavailable. | The evidence is ambiguous or automated analysis is unavailable. | Retain the report for officer assessment and display the uncertainty or service unavailability explicitly. |

Decision support is limited to prioritization and workflow state. The human review process must remain accountable for evidence assessment, correction, appeal, and any final blacklist action.

---

## 7. SCALABILITY ANALYSIS

### 7.1 Current System Capacity

The prototype dataset contains 7,992 prepared records, including 1,412 held-out test records. The reported backend uses a MongoDB Atlas M0 cluster with 512 MB storage, a Render Free Tier API deployment, and a Hugging Face Spaces AI service. These are current development constraints, not load-tested throughput limits. The supplied 30–60 second cold-start observation can make the first AI request substantially slower than a warm request.

The project has not supplied request-per-second capacity, end-to-end latency percentiles, database query profiles, concurrency limits, inference utilization, uptime targets, or cost data. Record count alone is not enough to infer traffic capacity because payload size, index footprint, query mix, retention, and request burstiness also affect system load.

### 7.2 Tenfold Data-Growth Scenario — 80,000 Records

| Area | Potential bottleneck | Proposed solution | Validation evidence |
|---|---|---|---|
| Regional review queries | Collection scans and slower sorting as report volume grows. | Add compound indexes based on measured filters, such as region, status, and chronology. | Query explain plans, index size, write overhead, and p95/p99 query latency. |
| Public blacklist lookups | Repeated reads load the database. | Add Redis caching for frequently requested public entries with explicit invalidation. | Cache hit rate, staleness window, invalidation behavior, and database load reduction. |
| API/database connections | Connection churn or pool saturation during bursts. | Configure and tune Mongoose connection pooling. | Pool wait time, connection count, saturation, and recovery behavior. |
| Report ingestion | Concurrent writes may select the same chain tail. | Serialize or transactionally coordinate chain appends. | Concurrent append test and complete chain verification afterward. |
| AI inference | Cold start or queue buildup under burst traffic. | Instrument request queue and latency; tune warm instances before adding replicas. | Warm/cold latency, timeout rate, queue depth, and representative message throughput. |

Indexes should follow observed query patterns rather than be added speculatively. Each index consumes storage and adds write cost. Redis should not become an authority for blacklist state: MongoDB remains the source of truth, and invalidation must occur whenever the underlying entry changes.

### 7.3 Hundredfold Data-Growth Scenario — 800,000 Records

| Area | Potential bottleneck | Proposed solution | Validation evidence |
|---|---|---|---|
| Database distribution | A single cluster may not meet required storage, I/O, and read/write capacity. | Migrate to a MongoDB sharded cluster; evaluate location.region as a shard key. | Region skew, hot-shard behavior, chunk distribution, shard targeting, and migration rehearsal. |
| AI service availability | A single inference instance can queue or fail under concurrent use. | Deploy FastAPI replicas on Kubernetes with Horizontal Pod Autoscaling (HPA). | Autoscaling lag, queue depth, replica recovery, cold start, CPU/GPU use, and failure tests. |
| Inference throughput | Transformer inference can become CPU/GPU constrained. | Benchmark ONNX Runtime and TensorRT acceleration. | Throughput and latency plus prediction agreement and class-metric regression against the reference model. |
| Chain integrity | A globally ordered hash chain is difficult to maintain across distributed writers. | Specify a single ordered writer or a verifiable per-region ledger and checkpointing scheme before sharding. | Deterministic ordering, fork detection, checkpoint verification, and recovery procedure. |
| Data migration | Backfill and cutover may create missing or reordered records. | Rehearse migration, freeze or coordinate writes, verify all chain ranges, and define rollback criteria. | Row counts, digest verification, reconciliation logs, and successful rollback rehearsal. |

Regional sharding is a proposal, not a demonstrated optimum. A highly active region can create a hot shard; shard-key selection should be based on regional workload measurements. Scaling inference through Kubernetes does not automatically solve database, network, or chain serialization bottlenecks.

### 7.4 Future Scalability Strategy

The staged strategy is to:

1. establish baseline query, inference, and API latency metrics before any capacity claim;
2. create indexes from observed regional review and blacklist query patterns;
3. use bounded pagination and projection to avoid loading entire report documents;
4. cache read-heavy public blacklist data with explicit invalidation and a defined staleness policy;
5. configure connection pooling and request limits;
6. batch offline outbox synchronization while preserving idempotency and append order;
7. separate asynchronous OCR/model jobs from interactive request paths where latency warrants it;
8. introduce distributed processing only after profiling identifies a processing bottleneck;
9. add load balancing and horizontally replicated stateless services as service demand grows;
10. preserve rollback, data-integrity verification, and the advisory-only / 2-of-3 invariants during every scale migration.

---

## 8. DATA QUALITY, ETHICS, PRIVACY, AND GOVERNANCE

### 8.1 Data Quality Concerns

| Concern | Example | Impact | Mitigation |
|---|---|---|---|
| OCR noise | Tesseract reads 0 as O, splits a domain across lines, or misses a URL character. | Risk scores and domain rules can change when text is corrupted. | Preserve the original image where policy permits, surface extracted text for confirmation, repair line breaks conservatively, and evaluate OCR-specific errors. |
| Dialect and language variation | Cebuano, Ilocano, Hiligaynon, Waray, or code-switched messages are underrepresented. | Uneven recall across linguistic groups and message styles. | Collect reviewed regional examples, report per-language performance, and include community and officer feedback under documented consent and retention rules. |
| Template duplicates | Repeated campaign text appears in train and test partitions. | Data leakage can inflate evaluation results. | Record 640 duplicate removals, test normalized and near-duplicate overlap, and add campaign/source/time-based split checks. |
| Synthetic or LLM-generated examples | The vmg875v4xs source publisher describes an LLM-generated balanced dataset. | Generated language may not match real campaign behavior and can produce overly optimistic or distorted results. | Track provenance by source, measure results with and without generated rows, and use real-world and temporal holdouts. |
| Label mapping and boundary ambiguity | Upstream Ham/Spam/Smishing categories map into three SentinelPH tiers. | Inconsistent mapping can affect training labels and Grey Area performance. | Version the mapping, publish annotation rules, retain adjudication notes, and report inter-annotator agreement where available. |

### 8.2 Privacy and Security

**Nullifier and citizen hash.**  
The design brief specifies a device-bound HMAC nullifier over message text, sender, and hour:

N = HMAC(DeviceSecret, Text || Sender || Hour).

This mechanism can support scoped duplicate checks, but it is a keyed pseudonymous token rather than a formal zero-knowledge proof. Its production contract must define normalization, unambiguous field encoding, time zone and hour bucketing, secret generation, key storage, rotation, and retention.

The current report API accepts nullifier and zkpHash from the request body; the inspected controller does not compute or validate the specified device-bound HMAC itself. Separately, citizenHash.js creates a server-side HMAC of the authenticated UID or request IP for hourly rate limiting. Its source includes a public default-salt fallback and warns when CITIZEN_SALT is absent. The nullifier and citizenHash therefore serve different purposes and must not be described as one verified anonymous identity mechanism. Before claiming privacy-preserving deduplication as fully enforced, the server must validate the nullifier protocol and production key configuration.

**Authentication and role-based access.**  
Firebase Authentication supplies JWTs used by the API. Four primary roles—citizen, officer, admin, and superadmin—are represented in the user schema. Authorization must be checked server-side for every protected operation, including region, report, and blacklist scopes; hiding a button in the web interface is not an access-control boundary. Authentication and authorization should be reviewed against current digital-identity guidance and application-security verification requirements [7, 8].

**Peppered OTP values.**  
The password-change OTP utility generates six-digit values with a cryptographically secure random function and stores a SHA-256 hash over the value and a server-side pepper. It uses timing-safe comparison. The implementation warns when the pepper is absent or shorter than 16 characters and recommends a longer random value; the environment must set a strong secret and the OTP lifecycle must include expiration, attempt limits, and one-time use.

**Personal information and data minimization.**  
Reports can contain personal information about a sender, recipient, or bystander. citizenHash is pseudonymous, not anonymous. Raw text, uploaded images, IP-derived values, audit events, and model outputs need documented access, retention, deletion, and disclosure policies. These controls should be assessed against the Philippine Data Privacy Act of 2012 and applicable institutional requirements; this report does not claim a legal compliance determination [5].

### 8.3 Ethical Considerations

False positive blacklist outcomes can affect legitimate individuals or organizations. False negatives can leave citizens exposed to harmful links. The system mitigates unilateral automated action by keeping AI advisory and requiring a two-officer approval threshold, but human reviewers can still share the same bias, misunderstand evidence, or collude. Reviewers should see the original evidence, model uncertainty, source provenance, and any deterministic override.

The model’s lower Grey Area F1 and limited language-specific evidence create risks of unequal performance. Evaluation should be disaggregated by language, region, source, sender type, and OCR status where sample sizes permit. A confidence score should not be presented as certainty or proof of malicious intent. Citizens need an accessible explanation of how their reports are used, how long evidence is retained, and how a mistaken report or blacklist entry can be challenged.

### 8.4 Governance and Mitigation

| Risk | Potential impact | Mitigation strategy |
|---|---|---|
| Rogue or colluding officer voting | Unjustified blacklist action or distorted subtype feedback. | Enforce role and region eligibility server-side, count distinct users once, limit the panel to three, record immutable vote events, monitor unusual voting patterns, and provide an appeal/correction path. |
| Database record mutation or chain rewrite | Loss of report history or false appearance of integrity. | Use append-only permissions and model safeguards, verify the chain regularly, protect and independently checkpoint the chain head, retain backups, and audit privileged access. |
| API overload or abuse | Slow or unavailable reporting and inference, including outbox retry spikes. | Apply authentication and rate limiting, payload limits, bounded queues, retry backoff, input validation, monitoring, and staged horizontal scaling. |
| Nullifier secret or privacy-control failure | Cross-report linkage, duplicate bypass, or exposure of reporter-derived data. | Validate nullifier generation server-side or by a verifiable protocol, use strong secrets, rotate keys, restrict access, and document the token’s scope and retention. |
| Model or rule drift | Changing campaign patterns produce more errors. | Version models and heuristics, monitor class/rule distributions, review errors, and require release evaluation before deployment. |

---

## 9. SYSTEM IMPLEMENTATION AND DEMONSTRATION

### 9.1 Major System Features

| Feature | Description |
|---|---|
| Quick Report Wizard | Mobile reporting flow for sender, message text or screenshot, scam category, and optional location; supports offline queuing through a local SQLite outbox. |
| Review Queue Vote Modal | Officer interface for reviewing message evidence, AI metadata, and report details, then submitting an approve/reject vote and optional subtype feedback. |
| Blacklist Registry | Role-scoped view of finalized blacklist entries, with public-safe lookup and administrative review workflows. A positive entry is synchronized after the report reaches the required two-approval quorum. |
| Chain Integrity Verifier | API utility that canonicalizes report fields, recomputes SHA-256 digests, checks predecessor links, and returns mismatch details for the requested sequence range. |
| User RBAC Manager | Administrative workflows for managing user roles, officer status, and regional jurisdiction. Authorization remains enforced by the API. |

### 9.2 Working-System Screen Descriptions

The report brief requests five screen figures. The workspace snapshot used to prepare this manuscript contains no exported screenshot image assets. The following figure captions describe the screens to be documented and do not claim that image files are embedded here.

**Figure 1. Mobile Quick Report Wizard.** The screen shows the citizen’s report form, sender field, SMS text or screenshot attachment, category selection, and optional regional location. An offline indicator communicates when the report is queued locally for synchronization.

**Figure 2. Officer Review Queue.** The web portal lists reports awaiting review with jurisdiction, received time, AI tier, scam category, and vote state. The officer can open a report to inspect message evidence and the rule/model metadata.

**Figure 3. Review Vote Modal and Subtype Feedback.** The modal presents the evidence and offers approve/reject decisions, a required comment, and Confirmed/Corrected/Unsure subtype feedback. The vote count makes the 2-of-3 threshold visible without treating the AI output as the final decision.

**Figure 4. Blacklist Registry and Chain Verification.** The registry displays finalized entries and their report references. The integrity panel shows the number of chain entries checked and any predecessor or digest mismatch returned by the verifier.

**Figure 5. User RBAC Manager and Regional Dashboard.** The administrative view shows role, active status, and jurisdiction controls together with regional report and review summaries restricted to the administrator’s permitted scope.

For a defense presentation, captured images should be exported from the running client and web portal, scrubbed of real personal data, and inserted with these captions. The current text manuscript records the intended figure content and its privacy requirements.

---

## 10. RESULTS AND DISCUSSION

The project-reported test results indicate strong aggregate performance for the Level 1 three-class classifier: 95.54% accuracy and 0.8856 macro F1 on 1,412 held-out examples. The class results are uneven. Legitimate F1 is 0.9918, Malicious F1 is 0.9183, and Grey Area F1 is 0.7467. The confusion matrix records 63 errors, including 23 true Malicious examples classified Grey Area and one classified Legitimate. The result supports triage use but does not justify treating any individual prediction as ground truth. The adversarial regression gate is reported as 27–28 passes out of 28; the exact run and failed case, if any, should be resolved before a formal defense.

The 2-of-3 consensus state analytics create a clear decision threshold and the current Report model uses a MongoDB update pipeline to append votes and recompute the state atomically. That protects the vote-count transition from common concurrent vote updates, subject to route-level authorization and data-integrity controls. No measured decision latency, officer agreement, queue time, or consensus throughput was supplied, so consensus efficiency cannot be quantified from the available evidence.

The SHA-256 utility canonicalizes objects, excludes Mongoose bookkeeping fields, hashes the canonical JSON together with the preceding hash, and includes a chain-range verifier. The Report model protects core fields from direct update/delete operations. These mechanisms make alteration detectable when compared with a trusted chain head; they do not make the entire database intrinsically immutable. In the report creation controller, the chain tail is read before a new record is saved. Concurrent creators could therefore select the same predecessor unless append allocation is serialized or otherwise made atomic. An independently retained chain-head checkpoint and a concurrency-safe append operation are recommended before the ledger is described as production-grade immutable.

The privacy controls also require precise descriptions. The API accepts the report nullifier from the request and does not itself demonstrate computation of the specified device-bound HMAC. The separate citizenHash is a pseudonymous UID/IP-derived rate-limit token, and its source has a development fallback salt. These facts do not invalidate the design objective, but they mean that the deployed privacy behavior must be verified before claims of anonymous or zero-knowledge reporting are made.

**Metric provenance note.** This manuscript carries the 95.54% accuracy, 0.8856 macro F1, and 1,412-example test-set figures supplied in the project brief as the course-project evaluation results. The local services/ai/models/model_metadata_v002.json currently contains different metrics (95.09% accuracy, 0.8636 macro F1, and 1,404 test examples). The model release manifest and evaluation report should be reconciled and frozen to one test-set run before the figures are used in a formal defense or publication.

The major strengths are local brand-contrast examples, class-specific evaluation, human-authorized disposition, a structured workflow, and a concrete integrity-verification utility. The key limitations are source and language coverage, the Grey Area boundary, lack of temporal and campaign-aware evaluation, incomplete privacy-protocol evidence, possible chain append races, missing screenshot exports, and the absence of measured capacity and service-level data. Scalability recommendations should therefore be treated as engineering plans and validated under representative workloads.

---

## 11. CONCLUSION AND RECOMMENDATIONS

### 11.1 Conclusion

SentinelPH combines community reporting, automated risk triage, officer review, consensus-based blacklist finalization, and tamper-evident report ordering in one anti-smishing workflow. Its project-reported DistilBERT results—95.54% accuracy and 0.8856 macro F1—show promising overall performance on the supplied test set, while the lower Grey Area F1 of 0.7467 demonstrates why the model must remain advisory. The 2-of-3 regional vote rule gives the system a human authorization boundary, and its SHA-256 chain utility provides a basis for verifying report continuity.

The project meets its design objectives at prototype level, but production assurance depends on reconciling model metrics, validating nullifier generation, updating regional configuration, coordinating concurrent chain appends, and producing operational screenshots and measured capacity results. The report therefore distinguishes implemented code paths from design requirements and future scale plans.

### 11.2 Recommendations

1. Freeze the v002 model artifact, data manifest, exact test split, confusion matrix, and adversarial-suite result under one reproducible release record.
2. Add temporal, campaign-grouped, source-disjoint, and near-duplicate evaluation; report class precision, recall, calibration, and uncertainty intervals.
3. Expand and evaluate Filipino regional-language and code-switching coverage, including OCR-corrupted inputs, with community-reviewed labels.
4. Update the project region list to include the Negros Island Region and preserve unclassified-location handling.
5. Make report-chain append allocation concurrency-safe; run a recurring verifier and retain independent chain-head checkpoints.
6. Implement and audit nullifier generation and verification, remove public fallback secrets in deployed environments, and document token scope and retention.
7. Define data retention, redress, and audit policies consistent with the Data Privacy Act and institutional governance requirements.
8. Add an Android SMS Retriever API or SMS User Consent API flow for user-controlled capture where it improves report entry. These APIs are intended for SMS verification and require a supported message flow; a consent-based message selection approach is more appropriate when the platform does not control the incoming message [6].
9. Establish workload profiles and service objectives, then validate indexes, Redis caching, connection pools, sharding, Kubernetes HPA, and inference acceleration at each growth gate.
10. Develop a cross-agency federation model with explicit data-sharing agreements, regional ownership, role mapping, and common audit semantics before connecting external agencies.
11. Capture demonstration screenshots using synthetic or redacted data and include them in the final defense manuscript.

---

## 12. INDIVIDUAL CONTRIBUTION

| Member | Role | Major contribution |
|---|---|---|
| Group Sentinel member — Lead Architect | Lead Architect | System requirements, architecture, security invariants, and project integration. |
| Group Sentinel member — ML Developer | ML Developer | Dataset preparation, DistilBERT fine-tuning, evaluation, heuristic analysis, and model release artifacts. |
| Group Sentinel member — Backend Developer | Backend Developer | Express API, report workflow, MongoDB models, authentication integration, consensus logic, and hash-chain utilities. |
| Group Sentinel member — Frontend/Mobile Developer | Frontend/Mobile Developer | React web portal, React Native report workflow, offline outbox, dashboards, and role-aware user experience. |

Individual names were not provided in the project materials; contributions are attributed by project role rather than assigning invented names.

---

## REFERENCES

1. Republic of the Philippines. (2022). *Republic Act No. 11934: Subscriber Identity Module (SIM) Registration Act*. Supreme Court E-Library. https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/95890
2. Philippine Postal Corporation. (2025, May 13). *PHLPost warns of fake messages using PHLPost and other delivery services*. https://phlpost.gov.ph/cpt-press-releases/phlpost-warns-of-fake-messages-using-phlpost-and-other-delivery-services/
3. Republic of the Philippines. (2024). *Republic Act No. 12000: Negros Island Region Act*. Supreme Court E-Library. https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/97490
4. Sanh, V., Debut, L., Chaumond, J., & Wolf, T. (2019). *DistilBERT, a distilled version of BERT: Smaller, faster, cheaper and lighter*. arXiv:1910.01108. https://arxiv.org/abs/1910.01108
5. Republic of the Philippines. (2012). *Republic Act No. 10173: Data Privacy Act of 2012*. Official Gazette. https://officialgazette.gov.ph/2012/08/15/republic-act-no-10173/
6. Google for Developers. (n.d.). *Automatic SMS verification with the SMS Retriever API*. https://developers.google.com/identity/sms-retriever/overview
7. National Institute of Standards and Technology. (2025). *NIST Special Publication 800-63B-4: Digital Identity Guidelines — Authentication and Authenticator Management*. https://pages.nist.gov/800-63-4/sp800-63b.html
8. OWASP Foundation. (n.d.). *Application Security Verification Standard (ASVS), version 5.0.0*. https://owasp.org/projects/asvs?tab=main
9. Mishra, S., & Soni, D. (2022). *SMS Phishing Dataset for Machine Learning and Pattern Recognition* (Version 1). Mendeley Data. https://doi.org/10.17632/f45bkkt8pr.1
10. Munoz, M., & Islam, M. (2025). *A Balanced Dataset for Spam and Smishing Detection using Large Language Models (LLMs)* (Version 1). Mendeley Data. https://doi.org/10.17632/vmg875v4xs.1
11. bwandowando. (n.d.). *Philippine Spam/Scam SMS*. Kaggle. https://www.kaggle.com/datasets/bwandowando/philippine-spam-sms-messages

The course brief also named “Delos Santos (2024)” and “Ibanez (2024)” without titles, publication venues, identifiers, or links. They are not included as formal citations because those author-year references cannot be uniquely identified from the supplied information.

---

## APPENDICES

### Appendix A. Source Code — services/api/utils/hashChain.js

The following is the current hash-chain utility from the project repository. It is reproduced to document the canonicalization and verification behavior; production append ordering is handled by the report controller and must be concurrency-safe.

```~javascript
const crypto = require('crypto');

/**
 * Recursively normalizes a value into a deterministic, hashable shape:
 * - Dates become ISO-8601 strings.
 * - Mongoose ObjectIds (or anything exposing toHexString) become hex strings.
 * - Arrays keep their order (order is semantically meaningful).
 * - Plain objects have their keys sorted alphabetically, and Mongoose's
 *   internal `_id` / `__v` bookkeeping fields are stripped so that the
 *   same logical data always canonicalizes identically regardless of
 *   whether it came from a fresh in-memory document or a `.lean()` read.
 */
/**
 * Returns true for any object that looks like a Mongoose Document or
 * Subdocument. We detect this by the presence of the internal `$__`
 * pointer that Mongoose injects on every document and subdocument.
 *
 * Those internal pointers create circular references back to the parent
 * document, which is exactly what was causing the infinite recursion
 * (and the resulting `RangeError: Maximum call stack size exceeded`)
 * in the previous version of this function.
 */
function isMongooseDocument(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.toObject === 'function' &&
    Object.prototype.hasOwnProperty.call(value, '$__')
  );
}

function canonicalize(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value.toHexString === 'function') {
    // Mongoose ObjectId
    return value.toHexString();
  }

  // Unwrap Mongoose documents before recursive canonicalization.
  // Without this, we walk the document's internal `$__` graph (which is
  // circular) and blow the call stack. `.toObject()` produces a plain
  // object with no internal pointers, so the recursion terminates.
  if (isMongooseDocument(value)) {
    return canonicalize(value.toObject({ depopulate: true, virtuals: false }));
  }

  // Also handle plain objects that contain a `_doc` wrapper (some
  // Mongoose versions expose it directly without `toObject`).
  if (
    typeof value === 'object' &&
    value._doc !== undefined &&
    Object.prototype.hasOwnProperty.call(value, '$__')
  ) {
    return canonicalize(value._doc);
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (typeof value === 'object') {
    const sortedKeys = Object.keys(value)
      .filter((key) => key !== '_id' && key !== '__v')
      .sort();

    const out = {};
    sortedKeys.forEach((key) => {
      out[key] = canonicalize(value[key]);
    });
    return out;
  }

  return value;
}

/** Produces the deterministic JSON string used as hashing input. */
function canonicalizeToString(payload) {
  return JSON.stringify(canonicalize(payload));
}

/**
 * Computes H_n = SHA-256(canonicalize(Data_n) || H_{n-1}).
 * @param {object} payload - The immutable data fields of the record (Data_n).
 * @param {string} previousHash - H_{n-1}, the hash of the prior record in the chain.
 * @returns {string} The resulting hex-encoded SHA-256 digest (H_n).
 */
function computeHash(payload, previousHash) {
  if (typeof previousHash !== 'string' || previousHash.length === 0) {
    throw new Error('computeHash() requires a non-empty previousHash string.');
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('computeHash() requires a payload object.');
  }

  const canonicalString = canonicalizeToString(payload);

  return crypto
    .createHash('sha256')
    .update(canonicalString + previousHash)
    .digest('hex');
}

/**
 * Returns the genesis hash used for the very first record in any chain.
 * Configurable via GENESIS_HASH env var; defaults to 64 zero characters.
 */
function getGenesisHash() {
  return process.env.GENESIS_HASH || '0'.repeat(64);
}

/**
 * Walks an ordered list of chain entries and verifies:
 *   1. Each entry's declared previousHash matches the actual hash of
 *      the entry immediately before it in the sequence.
 *   2. Each entry's stored hash matches a fresh recomputation of
 *      SHA-256(canonicalPayload || previousHash).
 *
 * @param {Array<{id: string, sequence: number, previousHash: string, hash: string, canonicalPayload: object}>} entries
 * @returns {{valid: boolean, totalChecked: number, breaks: Array<object>}}
 */
function verifyChainRange(entries) {
  const breaks = [];
  let expectedPreviousHash = null;

  entries.forEach((entry, index) => {
    if (index === 0) {
      // The first entry in *this range* is trusted to declare the hash
      // it links back to (it may not be record 0 of the full chain if
      // a partial range was requested).
      expectedPreviousHash = entry.previousHash;
    }

    if (entry.previousHash !== expectedPreviousHash) {
      breaks.push({
        sequence: entry.sequence,
        id: entry.id,
        reason: 'PREVIOUS_HASH_MISMATCH',
        expected: expectedPreviousHash,
        found: entry.previousHash,
      });
    }

    let recomputedHash;
    try {
      recomputedHash = computeHash(entry.canonicalPayload, entry.previousHash);
    } catch (err) {
      breaks.push({
        sequence: entry.sequence,
        id: entry.id,
        reason: 'RECOMPUTE_FAILED',
        detail: err.message,
      });
      expectedPreviousHash = entry.hash;
      return;
    }

    if (recomputedHash !== entry.hash) {
      breaks.push({
        sequence: entry.sequence,
        id: entry.id,
        reason: 'HASH_MISMATCH',
        expected: recomputedHash,
        found: entry.hash,
      });
    }

    expectedPreviousHash = entry.hash;
  });

  return {
    valid: breaks.length === 0,
    totalChecked: entries.length,
    breaks,
  };
}

/**
 * High-level helper: pulls Report documents from the given Mongoose model
 * (optionally scoped to a sequence range), rebuilds each one's canonical
 * payload, and runs verifyChainRange() over them. The Report model is
 * passed in as a parameter (rather than required directly) to avoid a
 * circular dependency between this utility and models/Report.js, and so
 * this helper can be reused by both the reports and auditor route modules.
 *
 * @param {import('mongoose').Model} ReportModel
 * @param {{startSequence?: number, endSequence?: number}} [options]
 */
async function verifyReportChain(ReportModel, options = {}) {
  const { startSequence, endSequence } = options;

  const query = {};
  if (typeof startSequence === 'number' || typeof endSequence === 'number') {
    query.sequence = {};
    if (typeof startSequence === 'number') query.sequence.$gte = startSequence;
    if (typeof endSequence === 'number') query.sequence.$lte = endSequence;
  }

  const docs = await ReportModel.find(query).sort({ sequence: 1 }).lean();

  const entries = docs.map((doc) => ({
    id: doc.reportId,
    sequence: doc.sequence,
    previousHash: doc.previousHash,
    hash: doc.hash,
    canonicalPayload: {
      reportId: doc.reportId,
      textData: doc.textData,
      reportedNumber: doc.reportedNumber,
      location: doc.location,
      nullifier: doc.nullifier,
      aiFlag: doc.aiFlag,
      sequence: doc.sequence,
      createdAt: doc.createdAt,
    },
  }));

  const result = verifyChainRange(entries);

  return {
    ...result,
    rangeChecked: {
      startSequence: typeof startSequence === 'number' ? startSequence : null,
      endSequence: typeof endSequence === 'number' ? endSequence : null,
    },
  };
}

module.exports = {
  canonicalize,
  canonicalizeToString,
  computeHash,
  getGenesisHash,
  verifyChainRange,
  verifyReportChain,
};

```~

### Appendix B. Dataset Repositories and Links

| Source | Repository link | Provenance note |
|---|---|---|
| Philippine Spam/Scam SMS | https://www.kaggle.com/datasets/bwandowando/philippine-spam-sms-messages | Philippine-local examples; source pool described as approximately 1,000 rows in the project brief. |
| Tagalog SMS Corpus | Kaggle corpus named in the project brief; exact dataset URL/version was not supplied. | Preserve the downloaded source URL, license, and version in the next data manifest. |
| SMS Phishing Dataset for Machine Learning and Pattern Recognition | https://data.mendeley.com/datasets/f45bkkt8pr/1 | Version 1, 5,971 labeled records; Mishra and Soni, 2022. |
| A Balanced Dataset for Spam and Smishing Detection using LLMs | https://data.mendeley.com/datasets/vmg875v4xs/1 | Version 1, 10,191 records; the publisher states that the dataset is balanced and LLM-generated. |
| PH Brand Contrast Set | Curated from official organization and brand advisories; source links are maintained per example in the dataset manifest. | 45 curated contrast examples; no artificial malicious domains. PHLPost’s May 2025 advisory: https://phlpost.gov.ph/cpt-press-releases/phlpost-warns-of-fake-messages-using-phlpost-and-other-delivery-services/. |

The source-pool sizes are not the post-cleaning corpus counts. The final prepared release is reported as 7,992 rows, with per-source retained counts to be supplied through a versioned data manifest.

### Appendix C. Additional Screen Descriptions and Sequence Diagram

#### C.1 Demonstration screen captions

- **Figure C1.** Mobile report form with sender, message, category, optional location, and screenshot attachment.
- **Figure C2.** Offline outbox showing queued reports awaiting synchronization.
- **Figure C3.** Regional review queue with report status, AI tier, and vote count.
- **Figure C4.** Officer decision modal with evidence, comments, and subtype feedback.
- **Figure C5.** Blacklist registry and chain verification result with checked range and mismatch status.

No image assets were present in the workspace snapshot used to prepare this manuscript. These captions define the evidence to capture for the final visual appendix; they are not substitutes for screenshot files.

#### C.2 Report and consensus sequence

```text
Citizen       Mobile App        API Gateway       AI Service       MongoDB       Officer
   |               |                 |                 |              |             |
   | enter report  |                 |                 |              |             |
   |-------------->|                 |                 |              |             |
   |               | POST report     |                 |              |             |
   |               |---------------->| authenticate,   |              |             |
   |               |                 | validate         |              |             |
   |               |                 | assess text/image|              |             |
   |               |                 |---------------->| classify/OCR  |             |
   |               |                 |<----------------| risk metadata |             |
   |               |                 | read chain tail, allocate sequence           |
   |               |                 |-------------------------------->|             |
   |               |                 | append report and digest        |             |
   |               |                 |<--------------------------------|             |
   |               |<----------------| report ID/status                |             |
   |               |                 |                 |              |             |
   |               |                 |                 |              | review report|
   |               |                 |<----------------------------------------------|
   |               |                 | validate role/region and record vote         |
   |               |                 |-------------------------------->|             |
   |               |                 | recompute 2-of-3 state atomically             |
   |               |                 |<--------------------------------|             |
   |               |                 | sync blacklist if quorum reached             |
   |               |                 |-------------------------------->|             |
``` 

#### C.3 Integrity verification sequence

```text
Auditor       Web Portal       API Gateway       Chain Verifier       MongoDB
   |               |                 |                  |                 |
   | request range |                 |                  |                 |
   |-------------->| GET verify      |                  |                 |
   |               |---------------->| authorize scope  |                 |
   |               |                 | verify range      |                 |
   |               |                 |----------------->| load ordered    |
   |               |                 |                  |---------------> |
   |               |                 |                  | recompute each  |
   |               |                 |                  | hash and link   |
   |               |                 |                  |<--------------- |
   |               |                 |<-----------------| result/breaks   |
   |               |<----------------| integrity status |                 |
``` 

The report controller currently reads the highest sequence and digest before saving a report. A production chain writer should serialize that allocation or use an atomic database protocol so concurrent requests cannot fork the chain.

### Appendix D. System Architecture and Database Schema

#### D.1 Logical architecture

```text
Mobile / Web clients
        |
        v
Node.js / Express API Gateway
        |
        +-----------------------> Python / FastAPI AI service
        |                         DistilBERT + rules + OCR
        v
Business workflow and authorization
        |
        v
MongoDB Atlas
  + reports (canonical report fields, workflow state, votes)
  + users (identity, role, status, jurisdiction)
  + auditlogs (security and workflow events)
  + blacklistentries (finalized blacklist read model)
  + password_change_otps (OTP verification records)
```

#### D.2 Principal collections

| Collection | Principal content | Governance purpose |
|---|---|---|
| reports | Report ID, SMS text, reported sender, location, nullifier, AI flag, status, votes, sequence, predecessor hash, report hash, timestamps. | Source report and consensus workflow; core fields are protected against direct update/delete by the model layer. |
| users | Firebase UID, email, role, badge/agency, jurisdiction, status, account timestamps. | Four primary roles and regional authorization scope. |
| auditlogs | Actor identity, role, action, IP-derived metadata, event details, timestamp. | Trace administrative, authentication, and review actions. |
| blacklistentries | Target number or brand, final status, approving officers, source report references, finalization time, blacklist hash. | Read model for finalized blacklist data. |
| password_change_otps | Account reference, OTP hash, expiry and use state. | Password-change verification; pepper and lifecycle controls are required. |

#### D.3 Report hash payload

The current verifier reconstructs the canonical payload from:

- reportId
- textData
- reportedNumber
- location
- nullifier
- aiFlag
- sequence
- createdAt

The previous digest is stored separately as previousHash. The resulting record digest is computed as SHA-256 of the canonical JSON string concatenated with the prior hash string. The canonicalization utility sorts object keys, preserves array order, converts dates to ISO-8601 strings, converts ObjectIds to hex strings, unwraps Mongoose documents, and removes Mongoose _id and __v bookkeeping fields.

For independent verification, each release must retain the canonicalization version, genesis hash, field set, byte encoding, chain-order policy, and an independently protected chain-head checkpoint. A hash chain is tamper-evident only relative to a trusted predecessor and checkpoint; it does not encrypt report contents or prevent a privileged actor from rewriting both records and the chain head.

