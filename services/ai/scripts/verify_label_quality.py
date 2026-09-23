import pandas as pd

for f in ['data/custom/ph_spam_marketing_labeled.csv', 'data/custom/tagalog_sms_labeled.csv']:
    df = pd.read_csv(f)

    fn = df[(df['label'] == 0) & (
        df['text'].str.contains(
            r'bit\.ly|tinyurl|t\.co|\.xyz|\.icu|\.tv|\.bid|\.buzz|\.cfd|\.website|\.digital|is\.gd|\.pw|\.cn|\.top',
            case=False, regex=True, na=False
        ) |
        df['text'].str.contains(
            r'verify.*account|account.*verify|account.*suspend|suspend.*account|account.*lock|lock.*account|update.*account|account.*update|deactivat',
            case=False, regex=True, na=False
        )
    )]

    fp = df[(df['label'] == 2) & (
        df['text'].str.contains(
            r'#BDOStopScam|#BDOAntiScam|anti-scam|SCAM ALERT|BABALA|public service advisory|NTC Hotline|Never share your OTP|DO NOT SHARE',
            case=False, regex=True, na=False
        )
    )]

    print(f'{f}:')
    print(f'  false-negatives: {len(fn)}')
    print(f'  false-positives: {len(fp)}')
    print(f'  label counts: {dict(df["label"].value_counts().sort_index())}')
    print()