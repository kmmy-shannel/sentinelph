# SentinelPH Label Taxonomy — Level 1 + Level 2

**Version:** 1.0
**Scope:** Extends the existing 3-class Level 1 model (`legitimate` / `grey_area` / `malicious`, 90.83% accuracy, n=4,355) with a Level 2 subtype layer.

This taxonomy defines 9 Level 2 subtypes across 3 Level 1 risk tiers.
Four subtypes originally considered (political_campaign, charity_appeal,
wrong_number_baiting, impersonation_family) were removed from scope
because the training data does not contain examples of these patterns.
They are documented as future work.

## 1. Overview: How the Two Levels Work Together

SentinelPH classifies every inbound SMS in two stages. **Level 1** is the gating decision: it asks "is this message safe, ambiguous-but-not-fraudulent, or fraudulent?" and outputs one of `legitimate`, `grey_area`, or `malicious`. **Level 2** is a subtype decision that only runs *within* the Level 1 tier the message was assigned to — a message labeled `legitimate` can only receive one of the five legitimate subtypes, a `grey_area` message can only receive the `brand_marketing` subtype, and a `malicious` message can only receive one of the malicious subtypes. Level 2 never crosses tier boundaries: there is no shared subtype vocabulary between tiers, even when two subtypes in different tiers look superficially similar (e.g., `bank_activity_alert` under `legitimate` vs. a fake bank alert, which is `phishing_link` or `urgent_fine_toll` under `malicious`, never a variant of `bank_activity_alert` itself). This means annotators and the model always make the Level 1 call first — real vs. ambiguous vs. scam — and only then decide *which kind* of real, ambiguous, or scam message it is. If a message is mislabeled at Level 1, its Level 2 subtype is automatically invalid and must be re-annotated, since subtype definitions assume their parent tier's threat context (e.g., "urgent tone" means something different in a `legitimate` `appointment_reminder` than in a `malicious` `urgent_fine_toll`).

---

## 2. LEGITIMATE Subtypes

| Subtype | Definition | Example SMS (PH context, Taglish) | Typical Risk | Common Confusions |
|---|---|---|---|---|
| `personal_conversational` | A message from a known or plausible personal contact with no transactional or promotional content. | 1. "Kuya, andito na ba yung parcel mo? Text mo lang ako pag dating mo."<br>2. "Pare, tara later sa Jollibee Katipunan, 7pm. Sabihan mo rin si Ana."<br>3. "Happy birthday na po! Ingat lagi, God bless." | LOW | `appointment_reminder` if it's actually a scheduled service reminder disguised as casual text. |
| `two_factor_auth` | A one-time password (OTP) or login/verification code sent by a legitimate service the user actually transacted with. | 1. "GCash: Your OTP is 482913. Do not share this with anyone, even GCash staff. Valid for 5 mins."<br>2. "BPI: 391045 is your One-Time PIN for your online banking login. Huwag ibahagi sa kahit kanino."<br>3. "Maya: Use code 738201 to verify your device. This code expires in 3 minutes." | LOW | `phishing_link` (malicious) when a fake OTP message includes a link asking the user to "verify" or "confirm" by clicking — genuine OTPs never contain a verification link. |
| `appointment_reminder` | An automated reminder for a scheduled appointment, booking, or service visit from a business or institution the user has an existing relationship with. | 1. "Reminder: Your dental appointment sa Metro Dental Ortigas ay bukas, Sept 28, 2PM. Reply C to confirm."<br>2. "PhilHealth: Your appointment for member data update is on Oct 3, 9AM, PhilHealth Alabang branch."<br>3. "Your appointment with Dr. Santos (Makati Med) is confirmed for Mon, 10AM. Text CANCEL to reschedule." | LOW | `two_factor_auth` if it also contains a code; `delivery_tracking` when the "appointment" is actually a scheduled delivery window. |
| `delivery_tracking` | A legitimate courier or e-commerce update about a package's shipping status, without a suspicious or unofficial link. | 1. "J&T Express: Your parcel 623xxxxx102PH is out for delivery today. Rider: Mark, 09171234567."<br>2. "Lazada: Your order #LZD88213 has been delivered. Salamat sa pamimili!"<br>3. "LBC: Your shipment is now at LBC Cubao Hub and will arrive within 1-2 business days." | LOW | `phishing_link` when the message mimics a courier but includes an unofficial link (e.g., PHLPOST/J&T impersonation) — see the PHLPOST case in Section 4. |
| `bank_activity_alert` | An automated transaction or account notification sent by a bank or e-wallet the user holds an account with, with no request for credentials or links to unofficial sites. | 1. "BDO: You have sent PHP 2,500.00 to Juan D. via BDO Pay&Go on Sep 27. Ref# 004821."<br>2. "BPI Alert: A withdrawal of PHP 5,000 was made from your account ending in 1234 at BPI Cubao ATM."<br>3. "GCash: You've received PHP 1,000.00 from Maria S. Your new balance is PHP 3,450.00." | LOW | `urgent_fine_toll` / `phishing_link` (malicious) when a similarly-formatted "alert" demands the user click a link or call a number to "verify" or "unlock" the account. |

---
> **Note:** This tier currently contains only one subtype (`brand_marketing`).
> No dedicated sub-classifier is trained for grey_area — every `grey_area`
> prediction from the Level 1 model inherits `subtype = "brand_marketing"`
> with the Level 1 confidence score. A sub-classifier will be added when
> additional grey_area subtypes exist.
## 3. GREY_AREA Subtypes

| Subtype | Definition | Example SMS (PH context, Taglish) | Typical Risk | Common Confusions |
|---|---|---|---|---|
| `brand_marketing` | A promotional message from a real, identifiable brand advertising a product, sale, or loyalty offer, sent through normal (if sometimes unsolicited) marketing channels. | 1. "Shopee: 9.9 Mega Sale starts now! Up to 90% off + Free Shipping. Shop: shopee.ph/999sale"<br>2. "Globe: Enjoy GOMO's Php 99 unli data promo! Reply STOP to opt out of promos."<br>3. "Jollibee: Bagong Chickenjoy Bucket Treat available na sa lahat ng branch. Order via Jollibee app!" | MEDIUM | `phishing_link` (malicious) when the "brand" name is spoofed with a lookalike domain or the promo requires entering banking credentials to "claim." |

---

## 4. MALICIOUS Subtypes

| Subtype | Definition | Example SMS (PH context, Taglish) | Typical Risk | Common Confusions |
|---|---|---|---|---|
| `phishing_link` | A message impersonating a brand, government agency, or courier that includes a link to an unofficial domain designed to harvest credentials or payment info. | 1. "PHLPOST: The package has arrived at the warehouse but cannot be delivered due to incomplete address. Update: https://phpost.life/"<br>2. "BDO: Your account has been temporarily suspended. Verify now: bdo-secure-ph.com/verify"<br>3. "Lazada: Congrats! Claim your free gift here: lazada-rewards.vip/claim" | HIGH | `delivery_tracking` / `brand_marketing` (legitimate/grey) when the domain is genuinely official; `urgent_fine_toll` when the link is replaced by a phone number instead. |
| `urgent_fine_toll` | A message creating urgency around an unpaid fine, toll, tax, or bill, pressuring immediate payment or callback to a suspicious number. | 1. "LTO: You have an unsettled traffic violation. Pay within 24hrs to avoid warrant of arrest. Call 0917-XXX-XXXX."<br>2. "NLEX/SLEX: Your RFID account has insufficient balance and outstanding toll of PHP 350. Settle now: nlex-toll.top"<br>3. "BIR: Warning of tax delinquency. Failure to settle within 3 days will result in asset freeze. Call now." | HIGH | `phishing_link` when the urgency is paired with a credential-harvesting link rather than a call/payment demand; `bank_activity_alert` (legitimate) when mistaken for a real account notice. |
| `fake_prize_lottery` | A message claiming the recipient won a prize, raffle, or lottery they did not enter, typically requiring a fee, personal data, or link click to "claim." | 1. "Congratulations! Your number won PHP 50,000 in the GCash Anniversary Raffle. Claim: gcash-promo2026.com"<br>2. "SM Malls 25th Anniversary: You are our lucky winner of a brand new iPhone! Claim now, reply YES."<br>3. "PCSO: Your mobile number won 2nd prize sa 6/42 lotto promo. Text your full name and address to claim." | HIGH | `brand_marketing` when a real brand promo is spoofed. |

---

## 5. Decision Rules for Ambiguous Cases

These rules should be applied **in order** — if an earlier rule resolves the case, later rules are not needed.

1. **Brand mention + domain check.**
   If a message names a real brand or agency (e.g., PHLPOST, BDO, LBC) **and** the linked domain matches that entity's officially registered domain (e.g., `phlpost.gov.ph`, `bdo.com.ph`), **then** classify under the corresponding `legitimate` or `grey_area` subtype (e.g., `delivery_tracking`, `brand_marketing`).
   If the domain is a lookalike, misspelling, unofficial TLD, or uses generic/free hosting (e.g., `phpost.life`, `.top`, `.vip`, `.xyz`, URL shorteners masking the real destination), **then** classify as `malicious` → `phishing_link`, regardless of how convincing the brand framing is. This is the exact PHLPOST failure pattern (`phpost.life`) that motivated this rebuild — brand name + off-brand domain is treated as a hard signal for `phishing_link`, not as `delivery_tracking`.

2. **OTP legitimacy.**
   If a message contains a numeric code **and** does not ask the user to click a link, call a number, or reply with the code, **then** classify as `legitimate` → `two_factor_auth`.
   If a message contains a code (or claims to) **and** also asks the user to "verify," "confirm," or "unlock" via a link, callback number, or by replying with the code itself, **then** classify as `malicious` → `phishing_link`. Legitimate OTPs are single-purpose and self-contained; any added call-to-action is the tell.

3. **Marketing vs. phishing links.**
   If a message advertises a product/sale from a named brand **and** the link resolves to that brand's official domain or a known official shortlink (e.g., `shopee.ph`, `lazada.com.ph`), **then** classify as `grey_area` → `brand_marketing`.
   If the message uses urgency ("claim now," "limited time," "congrats you won") stacked with a non-official domain, or asks for payment/card details to "unlock" a discount, **then** classify as `malicious` → `phishing_link` or `fake_prize_lottery` (use `fake_prize_lottery` specifically if the framing is "you won," otherwise `phishing_link`).

4. **Bank activity alert vs. fake bank alert.**
   If a transactional notice matches the bank/e-wallet's standard notification format (reference number, exact amount, account-ending digits) **and** contains no link or contains only a link to the bank's verified official domain/app, **then** classify as `legitimate` → `bank_activity_alert`.
   If the notice includes urgency about suspension/freezing **and** a call-to-action link or number not matching the bank's official channels, **then** classify as `malicious` → `phishing_link` (if link-based) or `urgent_fine_toll` (if callback/payment-based).

---

## 6. Boundary Examples

| # | Message | Correct Label (L1 → L2) | Justification |
|---|---|---|---|
| 1 | "BDO PSA: Huwag magbigay ng OTP o account details sa kahit kanino, kahit sabihing BDO staff. Mag-ingat sa scam texts." | `legitimate` → `bank_activity_alert` | Looks alarming/scam-adjacent in tone, but it is BDO's own anti-scam public service announcement — no link, no data request, official warning content. |
| 2 | "PHLPOST - The package has arrived at the CMEC but could not be delivered due to unpaid customs fee. Settle here: https://phpost.life/" | `malicious` → `phishing_link` | Looks like a routine delivery update (legit-sounding), but `phpost.life` is not PHLPOST's official `.gov.ph` domain — classic brand-impersonation smishing (the case that started this rebuild). |
| 3 | "Grab a friend, grab a treat — buy 1 take 1 sa lahat ng participating branches this week lang!" | `grey_area` → `brand_marketing` | No explicit brand name or link, but the promotional structure ("buy 1 take 1," "participating branches") is clearly a marketing push, not a scam or personal message — annotate by structure/intent, not by keyword presence. |
| 4 | "Hi, sorry, kilala mo ba si Mark? Kuya niya ito, hinahanap lang namin siya, baka nasa inyo." | `legitimate` → `personal_conversational` | Borderline because it's from an unknown number and framed around a person, but it contains no financial ask, job offer, or urgency-to-pay — a genuine (if mistaken) personal inquiry stays legitimate unless a hook follows. |
| 5 | "GCash: You have a pending cash-in of PHP 25,000. Verify your MPIN to receive: gcash-verify.net/claim" | `malicious` → `phishing_link` | Mimics GCash's transactional alert format exactly, but legitimate GCash never asks users to "verify MPIN" via an external link — domain and MPIN request are the tells. |
| 6 | "J&T Express: Paalala, ang courier ay darating sa inyong address sa loob ng 30 minuto. Please prepare ang exact payment kung COD." | `legitimate` → `delivery_tracking` | Has urgency ("30 minuto") which can read as scam-like pressure, but it's operationally normal courier language with no link, no account verification ask, and no suspicious domain. |
| 7 | "Manalo ng PHP 100,000! I-claim ang iyong premyo bilang aming paraan ng pagbibigay pabalik sa komunidad. Text CLAIM ngayon." | `malicious` → `fake_prize_lottery` | Uses charity-adjacent "giving back to community" language, but it centers on the recipient *winning* a cash prize with no named organization — reward framing overrides the charitable framing. |
| 8 | "Maya: 583920 is your verification code. Huwag ibahagi ito. Kung hindi ikaw ang humiling nito, i-ignore ang message na ito." | `legitimate` → `two_factor_auth` | Could be flagged by "urgent/security" heuristics, but it is a self-contained OTP with an explicit non-action instruction ("i-ignore") and no link or callback — textbook legitimate OTP. |
| 9 | "LTO Region 4A: May balanseng multa ka sa aming rekord. I-settle within 24 hours through this link para maiwasan ang suspension: lto-payment.info" | `malicious` → `urgent_fine_toll` | Mimics a government-agency notice, which can read as authoritative/legitimate, but LTO does not send SMS payment links to third-party `.info` domains — urgency + off-domain link is the malicious signal. |

---

## 7. Inter-Annotator Agreement Protocol

**Setup.** Every SMS in the labeling queue (surfaced via `apps/web/src/pages/Officer-Tabs/ReviewQueue.jsx`) is independently labeled at both Level 1 and Level 2 by **two officers** before it is accepted into the training set.

**Resolving disagreements:**
- **Level 1 disagreement** (e.g., one officer says `grey_area`, the other says `malicious`): this always escalates to a **third reviewer**, since a Level 1 mismatch invalidates any Level 2 label and has the largest downstream impact on model quality. The third reviewer's Level 1 call is final, and only then do the original two officers re-attempt Level 2 within that confirmed tier.
- **Level 2 disagreement within the same Level 1 tier** (e.g., both say `malicious`, but one says `phishing_link` and the other says `urgent_fine_toll`): the two officers first attempt a **direct discussion/reconciliation** (target: within the same review session). If they reach agreement, that label stands. If they cannot agree after discussion, it escalates to a **third reviewer**, whose Level 2 call is final.
- **Escalation trigger, generally:** any case requiring a third reviewer must be flagged in the dashboard with a `disagreement` tag and the two original labels retained in the audit log (never overwritten), so disagreement patterns can be reviewed later for taxonomy or heuristic-rule gaps (e.g., recurring confusion between `bank_activity_alert` and `phishing_link` would signal the heuristic rules need tuning).

**Recording "unsure":**
- Either officer may mark a message **`unsure`** at Level 1 or Level 2 instead of forcing a guess. `unsure` is not a training label — any row where *either* officer marks `unsure`, and reconciliation/escalation does not resolve it to a confident label, is **excluded from the training set** entirely (not defaulted to any class).
- `unsure` rows are logged separately in a `needs_review` bucket rather than deleted, so they can be revisited once the taxonomy, examples, or heuristic rules are updated (a message that's `unsure` today may become confidently labelable after Section 5's rules are refined).
- An officer should choose `unsure` rather than guess when: the message is truncated/incomplete, the linked domain cannot be verified at review time, or the message plausibly fits two subtypes even after consulting Sections 5 and 6 of this document.

**Agreement threshold:**
- Target **inter-annotator agreement (IAA) of ≥80%** at Level 1 (raw agreement before any reconciliation) and **≥80% at Level 2 within correctly-agreed Level 1 tiers**, measured on a rolling basis (e.g., every 200 newly double-labeled rows).
- If IAA on a given batch falls below 80%, labeling is paused for that batch's tier(s) and the two officers review the specific confusion pairs (using Section 5's decision rules and Section 6's boundary examples as the reference standard) before resuming. Persistent sub-80% agreement on a specific subtype pair is treated as a signal to revise this taxonomy document, not just to retrain officers.

---

## 8. Future Work

The following subtypes were considered during taxonomy design but removed from scope because the current training data contains no examples of these patterns. They should be reconsidered if representative data becomes available:

- `political_campaign` (grey_area) — messages promoting a political candidate, party, or campaign activity.
- `charity_appeal` (grey_area) — solicitations for donations from a named, identifiable cause or organization.
- `wrong_number_baiting` (malicious) — messages pretending to be a misdirected personal text used to open a scam conversation.
- `impersonation_family` (malicious) — messages pretending to be a family member to solicit urgent money transfer.