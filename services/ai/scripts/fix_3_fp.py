import pandas as pd

f = 'data/custom/tagalog_sms_labeled.csv'
df = pd.read_csv(f)

mask = (df['label'] == 2) & (
    df['text'].str.contains(
        r'#BDOStopScam|#BDOAntiScam|anti-scam|SCAM ALERT|BABALA|public service advisory|NTC Hotline|Never share your OTP|DO NOT SHARE',
        case=False, regex=True, na=False
    )
)

print(f"Fixing {mask.sum()} rows: 2 -> 0")
df.loc[mask, 'label'] = 0
df.loc[mask, 'label_name'] = 'Legitimate'
df.to_csv(f, index=False, encoding='utf-8')
print(df['label'].value_counts().sort_index())