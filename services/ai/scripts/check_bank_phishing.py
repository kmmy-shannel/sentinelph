import pandas as pd
import json

df = pd.read_csv('data/processed/combined_dataset_3class.csv')
bank = df[df['source'] == 'ph_bank_phishing']

print(f'Total rows with source=ph_bank_phishing: {len(bank)}')
print(f'  label=0: {(bank["label"]==0).sum()}')
print(f'  label=1: {(bank["label"]==1).sum()}')
print(f'  label=2: {(bank["label"]==2).sum()}')
print()

# Load original JSON
with open('data/custom/ph_bank_phishing.json', encoding='utf-8') as f:
    j = json.load(f)
print(f'JSON has {len(j)} rows')

# Check how many JSON texts appear in the merged file
json_texts = set(r['text'] for r in j)
merged_texts = set(bank['text'])
in_both = json_texts & merged_texts
print(f'JSON texts also in merged: {len(in_both)}')
print(f'JSON texts MISSING from merged: {len(json_texts - merged_texts)}')
print(f'Merged texts not from JSON: {len(merged_texts - json_texts)}')