import pandas as pd

df = pd.read_csv('data/processed/combined_dataset_3class.csv')

# Normalize text for near-dup detection
df['text_norm'] = df['text'].str.strip().str.lower().str.replace(r'\s+', ' ', regex=True)

exact_dups = df.duplicated(subset=['text']).sum()
norm_dups = df.duplicated(subset=['text_norm']).sum()

print(f'Total rows: {len(df)}')
print(f'Exact-text duplicates: {exact_dups}')
print(f'Normalized-text duplicates (lowercase, whitespace-collapsed): {norm_dups}')
print()

# Show a few examples of normalized duplicates
dupe_groups = df.groupby('text_norm').filter(lambda g: len(g) > 1)
print(f'Rows involved in normalized dupe groups: {len(dupe_groups)}')
print()

# Show 5 examples with different sources
examples = dupe_groups.groupby('text_norm').filter(lambda g: g['source'].nunique() > 1)
print(f'Dupe groups where same text has DIFFERENT sources: {examples["text_norm"].nunique()}')
print()

for i, (norm, group) in enumerate(examples.groupby('text_norm')):
    if i >= 5:
        break
    print(f'=== group {i} ===')
    for _, r in group.iterrows():
        print(f'  source={r["source"]}, label={r["label"]}')
        print(f'  text={r["text"][:100]}')
    print()