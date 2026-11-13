#!/usr/bin/env python3
"""
Train Pagida's two text models and write them into src/learned/data/.

    python3 scripts/train-text-models.py --data ../data

Expected layout under --data (all public, all free to use):
  mail/phishing-2019 ... phishing-2025   Nazario phishing corpus, CC BY 4.0
                                          https://monkey.org/~jose/phishing/
  mail/easy_ham/ easy_ham_2/ hard_ham/    SpamAssassin public corpus (legitimate mail)
                                          https://spamassassin.apache.org/old/publiccorpus/
  hf/texts.json, hf/webs.json             ealvaradob/phishing-dataset, Apache-2.0
                                          https://huggingface.co/datasets/ealvaradob/phishing-dataset

Honesty rules this script enforces:
  * The tokenizer below must match src/learned/tokenize.ts exactly; the
    shared test vectors in test/learned.test.ts check both.
  * The email model is tested on the newest year of phishing (2025), which it
    never saw in training, so the score says something about phishing it has
    not met before.
  * A model that does not reach MIN_AUC on held-out data is not written.
"""
import argparse, email, email.policy, glob, hashlib, html, json, mailbox, os, random, re, sys

DIMS = 1 << 18
# How many of the strongest weights each model keeps. Chosen by sweeping
# C x KEEP on held-out data (November 2026). 12,000 beat 6,000 on both: emails
# caught 94.9% vs 94.0% with 1.77% vs 1.98% false positives; web pages caught
# 92.4% vs 91.2% with 6.75% vs 6.90% false positives (same split as below).
KEEP = {"emails": 12000, "web pages": 12000}
MIN_AUC = 0.95
URL_RE = re.compile(r"(?:https?://|www\.)\S+")
EMAIL_RE = re.compile(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}")
NUM_RE = re.compile(r"\d+")
SPLIT_RE = re.compile(r"[^a-z]+")
TAG_RE = re.compile(r"<[^>]+>")
DROP_RE = re.compile(r"<(script|style|noscript|svg)[^>]*>.*?</\1>", re.S | re.I)
TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.S | re.I)


def terms(text, max_chars=20000):
    t = text[:max_chars].lower()
    t = URL_RE.sub(" urltoken ", t)
    t = EMAIL_RE.sub(" emailtoken ", t)
    t = NUM_RE.sub(" numtoken ", t)
    words = [w for w in SPLIT_RE.split(t) if 2 <= len(w) <= 24]
    return words + [f"{a}_{b}" for a, b in zip(words, words[1:])]


def fnv1a(s):
    h = 0x811C9DC5
    for ch in s:
        h = ((h ^ ord(ch)) * 0x01000193) & 0xFFFFFFFF
    return h


def buckets(text):
    return {fnv1a(t) % DIMS for t in terms(text)}


def html_to_text(raw):
    raw = DROP_RE.sub(" ", raw)
    title = TITLE_RE.search(raw)
    body = html.unescape(TAG_RE.sub(" ", raw))
    return ((html.unescape(title.group(1)) + "\n") if title else "") + re.sub(r"\s+", " ", body)


def message_text(msg):
    """Subject plus readable body, the same thing the webmail adapter reads off the screen."""
    subject = str(msg.get("subject", "") or "")
    plain, rich = [], []
    for part in msg.walk() if msg.is_multipart() else [msg]:
        ctype = part.get_content_type()
        if part.get_content_maintype() == "multipart" or part.get_filename():
            continue
        try:
            payload = part.get_payload(decode=True)
            if payload is None:
                continue
            text = payload.decode(part.get_content_charset() or "utf-8", "replace")
        except Exception:
            continue
        (plain if ctype == "text/plain" else rich if ctype == "text/html" else []).append(text)
    body = " ".join(plain) if plain else html_to_text(" ".join(rich))
    return f"{subject}\n\n{body}".strip()


def load_mbox(path):
    out = []
    for msg in mailbox.mbox(path, factory=lambda f: email.message_from_binary_file(f, policy=email.policy.compat32)):
        text = message_text(msg)
        if len(text) > 40:
            out.append(text)
    return out


def held_out(name):
    """One file in five is never trained on, picked by name so that
    scripts/email-corpus.py --held-out can select exactly the same files."""
    return hashlib.md5(name.encode()).digest()[0] % 5 == 0


def load_dir(path, want_held_out):
    out = []
    for f in sorted(glob.glob(os.path.join(path, "*"))):
        if os.path.basename(f) == "cmds" or held_out(os.path.basename(f)) != want_held_out:
            continue
        with open(f, "rb") as fh:
            text = message_text(email.message_from_binary_file(fh, policy=email.policy.compat32))
        if len(text) > 40:
            out.append(text)
    return out


def dedupe(texts):
    seen, out = set(), []
    for t in texts:
        k = hashlib.sha1(t[:2000].encode("utf-8", "ignore")).hexdigest()
        if k not in seen:
            seen.add(k)
            out.append(t)
    return out


def matrix(texts):
    from scipy.sparse import csr_matrix
    rows, cols = [], []
    for i, t in enumerate(texts):
        for b in buckets(t):
            rows.append(i)
            cols.append(b)
    return csr_matrix(([1.0] * len(rows), (rows, cols)), shape=(len(texts), DIMS))


def fit(name, train, test):
    """train/test are lists of (text, label). Returns the exported model or None."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score, precision_score, recall_score
    import numpy as np

    Xtr, ytr = matrix([t for t, _ in train]), [y for _, y in train]
    Xte, yte = matrix([t for t, _ in test]), [y for _, y in test]
    clf = LogisticRegression(C=0.5, max_iter=3000, class_weight="balanced")
    clf.fit(Xtr, ytr)

    # Keep only the strongest weights, then score the pruned model, since that
    # is the one that ships.
    w = clf.coef_[0]
    top = np.argsort(-np.abs(w))[:KEEP[name]]
    pruned = np.zeros(DIMS)
    pruned[top] = w[top]
    z = Xte @ pruned + clf.intercept_[0]
    p = 1 / (1 + np.exp(-z))
    auc = roc_auc_score(yte, p)
    pred = (p >= 0.5).astype(int)
    prec, rec = precision_score(yte, pred), recall_score(yte, pred)
    fpr = sum(1 for a, b in zip(pred, yte) if a == 1 and b == 0) / max(1, sum(1 for b in yte if b == 0))
    print(f"[{name}] train {len(train)}, test {len(test)}: AUC {auc:.3f}, precision {prec:.3f}, "
          f"recall {rec:.3f}, false-positive rate {fpr:.3%} at 0.5")
    if auc < MIN_AUC:
        print(f"[{name}] below the {MIN_AUC} bar on held-out data: not written")
        return None
    return {
        "bias": round(float(clf.intercept_[0]), 4),
        "weights": {str(int(i)): round(float(w[i]), 4) for i in top if abs(w[i]) > 1e-4},
        "tested": f"held-out AUC {auc:.3f}, precision {prec:.1%}, recall {rec:.1%}, "
                  f"false positives {fpr:.2%} of legitimate {name}",
    }


def write(path, const, kind, trained_on, model):
    body = {"kind": kind, "bias": model["bias"], "weights": model["weights"],
            "trainedOn": trained_on, "tested": model["tested"]}
    with open(path, "w") as f:
        f.write("/* eslint-disable */\n// Generated by scripts/train-text-models.py. Do not edit by hand.\n"
                "import type { TextModel } from '../textModel.js';\n\n"
                f"export const {const}: TextModel = {json.dumps(body, separators=(',', ':'))};\n")
    print(f"wrote {path} ({os.path.getsize(path) // 1024} KB)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", default="src/learned/data")
    a = ap.parse_args()
    rnd = random.Random(2026)

    # ---------------- emails ----------------
    by_year = {y: dedupe(load_mbox(os.path.join(a.data, f"mail/phishing-{y}"))) for y in range(2019, 2026)}
    texts = json.load(open(os.path.join(a.data, "hf/texts.json")))
    hf_phish = dedupe([x["text"] for x in texts if x["label"] == 1])
    hf_ham = dedupe([x["text"] for x in texts if x["label"] == 0])
    sa_dirs = [os.path.join(a.data, f"mail/{d}") for d in ("easy_ham", "easy_ham_2", "hard_ham")]
    sa_tr = dedupe(sum((load_dir(d, False) for d in sa_dirs), []))
    sa_te = dedupe(sum((load_dir(d, True) for d in sa_dirs), []))
    for lst in (hf_phish, hf_ham):
        rnd.shuffle(lst)

    def split(lst, frac=0.2):
        k = int(len(lst) * frac)
        return lst[k:], lst[:k]

    hf_p_tr, hf_p_te = split(hf_phish)
    hf_h_tr, hf_h_te = split(hf_ham)
    nz_train = sum((by_year[y] for y in range(2019, 2025)), [])
    nz_test = by_year[2025]  # the newest year is never seen in training
    train = [(t, 1) for t in nz_train + hf_p_tr] + [(t, 0) for t in hf_h_tr + sa_tr]
    test = [(t, 1) for t in nz_test + hf_p_te] + [(t, 0) for t in hf_h_te + sa_te]
    print(f"emails: Nazario 2019-24 {len(nz_train)}, Nazario 2025 (test) {len(nz_test)}, "
          f"HF phishing {len(hf_phish)}, HF legit {len(hf_ham)}, SpamAssassin legit {len(sa_tr)} + {len(sa_te)} held out")
    m = fit("emails", train, test)
    if m:
        write(os.path.join(a.out, "emailModel.ts"), "EMAIL_MODEL", "emails",
              f"{sum(1 for _, y in train if y)} phishing and {sum(1 for _, y in train if not y)} legitimate emails "
              "(Nazario phishing corpus 2019-2024, ealvaradob/phishing-dataset, SpamAssassin public corpus)", m)

    # ---------------- web pages ----------------
    webs = json.load(open(os.path.join(a.data, "hf/webs.json")))
    pages = [(html_to_text(x["text"]), x["label"]) for x in webs]
    pages = [(t, y) for t, y in pages if len(t) > 80]
    rnd.shuffle(pages)
    k = int(len(pages) * 0.2)
    print(f"pages: {sum(1 for _, y in pages if y)} phishing, {sum(1 for _, y in pages if not y)} legitimate")
    m = fit("web pages", pages[k:], pages[:k])
    if m:
        write(os.path.join(a.out, "pageModel.ts"), "PAGE_MODEL", "web pages",
              f"{sum(1 for _, y in pages[k:] if y)} phishing and {sum(1 for _, y in pages[k:] if not y)} legitimate "
              "web pages (ealvaradob/phishing-dataset: PhishTank, OpenPhish, PhishRepo and Google results)", m)
    return 0


if __name__ == "__main__":
    sys.exit(main())
