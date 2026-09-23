import pandas as pd

df = pd.read_csv('data/custom/tagalog_sms_labeled.csv')

fn = df[(df['label'] == 0) & (
    df['text'].str.contains(
        r'bit\.ly|tinyurl|t\.co|\.xyz|\.icu|\.tv|\.bid|\.buzz|\.cfd|\.website|\.digital|is\.gd|\.pw|\.cn|\.top',
        case=False, regex=True, na=False
    ) |
    df['text'].str.contains(
        r'verify.*account|account.*verify|account.*suspend|suspend.*account|account.*lock|lock.*account|update.*account|account.*update|deactivat',
        case=False, regex=True, na=False
    )
)].copy()

fn = fn.reset_index(drop=True)

for i, row in fn.iterrows():
    print(f"[{i}] SENDER: {row['sender']}")
    print(row['text'])
    print("---")