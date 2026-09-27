# services/ai/diagnose_model.py
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
MODEL_PATH = "models/transformer"
tok = AutoTokenizer.from_pretrained(MODEL_PATH)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)
model.eval()

print("=" * 60)
print("MODEL CONFIG")
print("=" * 60)
print("id2label       :", model.config.id2label)
print("label2id       :", model.config.label2id)
print("num_labels     :", model.config.num_labels)
print("model_max_len  :", tok.model_max_length)
print("vocab_size     :", tok.vocab_size)
print()

text = (
    "+66 82-069-0703\n\n"
    "iMessage\n"
    "Sat, Nov 4 at 8:01 PM\n\n"
    "PHLPOST - The package has arrived at the warehouse and cannot be "
    "delivered due to incomplete address information. Please confirm your "
    "address at the link.\n\n"
    "https://phpost.life/\n"
    "(Please reply 1 to activate the link or copy the link to your Safari "
    "browser and open it)\n\n"
    "The PHLPOST team wishes you a great day!\n\n"
    "The sender is not in your contact list.\n\n"
    "Report Junk"
)

print("=" * 60)
print("TOKENIZATION CHECK")
print("=" * 60)
enc_full = tok(text, return_tensors="pt", truncation=False)
full_len = enc_full["input_ids"].shape[1]
print("Full token count (no truncation):", full_len)
print("Model max length                :", tok.model_max_length)
print("Will truncate?                  :", full_len > tok.model_max_length)
print()

for ml in [64, 128, 256, 512]:
    enc_ml = tok(text, return_tensors="pt", truncation=True, max_length=ml)
    print(f"  max_length={ml:>3} -> {enc_ml['input_ids'].shape[1]:>3} tokens")

print()
print("=" * 60)
print("PREDICTION AT VARIOUS MAX_LENGTHS")
print("=" * 60)

for ml in [128, 256, 512]:
    enc_ml = tok(text, return_tensors="pt", truncation=True, max_length=ml)
    with torch.no_grad():
        logits = model(**enc_ml).logits
        probs = torch.softmax(logits, dim=-1)[0]
    pred_idx = probs.argmax().item()
    pred_label = model.config.id2label[pred_idx]
    print(f"max_length={ml}:")
    print(f"  probs    : {[round(p, 4) for p in probs.tolist()]}")
    print(f"  predicted: {pred_label}")
    print()

print("=" * 60)
print("URL-ONLY TEST (does the model see the fake domain?)")
print("=" * 60)
url_texts = [
    "https://phpost.life/",
    "PHLPOST https://phpost.life/",
    "PHLPOST package https://phpost.life/ confirm address",
    "https://phlpost.gov.ph/track",
    "Your package is waiting, confirm address",
]
for t in url_texts:
    enc_t = tok(t, return_tensors="pt", truncation=True, max_length=128)
    with torch.no_grad():
        logits = model(**enc_t).logits
        probs = torch.softmax(logits, dim=-1)[0]
    pred_idx = probs.argmax().item()
    print(f"  '{t[:60]}'")
    print(f"    -> {model.config.id2label[pred_idx]}  (probs: {[round(p, 4) for p in probs.tolist()]})")
