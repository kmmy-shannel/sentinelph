import pandas as pd

f = 'data/custom/tagalog_sms_labeled.csv'
df = pd.read_csv(f)

# The 2 rows that are actual phishing (indices from list_fn_review.py output)
phishing_texts = [
    "GCash Alert! Please be advised that we are asking everyone to update their account to avoid deactivation. Update here: gcashcare-privacy-center.digital",
    "GCash Alert! Please be advised that we are asking everyone to update their account to avoid deactivation. Update here: gcash-advisory-services.website",
]

fixed = 0
for t in phishing_texts:
    mask = df['text'] == t
    n = mask.sum()
    if n > 0:
        df.loc[mask, 'label'] = 2
        df.loc[mask, 'label_name'] = 'Malicious'
        fixed += n
        print(f"Fixed {n} row(s) -> 2")
    else:
        print(f"NOT FOUND: {t[:60]}...")

df.to_csv(f, index=False, encoding='utf-8')
print(f"\nTotal rows fixed: {fixed}")
print("\nNew class balance:")
print(df['label'].value_counts().sort_index())