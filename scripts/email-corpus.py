#!/usr/bin/env python3
"""Turn mbox files and maildir-style folders into JSONL of the facts the email
engine reads (the same fields the Gmail and Outlook adapters fill in).

  python3 scripts/email-corpus.py ../data/mail/phishing-2025 > /tmp/phish.jsonl
  python3 scripts/email-corpus.py --held-out ../data/mail/easy_ham ../data/mail/hard_ham > /tmp/ham.jsonl

--held-out keeps only the files the text model never trained on (the same
one-in-five split as scripts/train-text-models.py).
"""
import hashlib, email, email.policy, email.utils, html, json, mailbox, os, re, sys
from html.parser import HTMLParser

class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.links = []; self.text = []; self._href = None; self._buf = []; self.images = 0
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'a' and a.get('href'): self._href = a['href']; self._buf = []
        if tag == 'img': self.images += 1
        if tag in ('br', 'p', 'div', 'tr', 'li'): self.text.append('\n')
    def handle_endtag(self, tag):
        if tag == 'a' and self._href is not None:
            self.links.append({'href': self._href, 'text': ''.join(self._buf).strip()[:200]}); self._href = None
    def handle_data(self, d):
        self.text.append(d)
        if self._href is not None: self._buf.append(d)

URL = re.compile(r'https?://[^\s<>"\')\]]+', re.I)

def facts(msg):
    name, addr = email.utils.parseaddr(str(msg.get('From', '')))
    to = (email.utils.getaddresses([str(msg.get('To', '') or '')]) or [('', '')])[0][1]
    subject = str(msg.get('Subject', '') or '')
    body_text, links, attachments = [], [], []
    for part in msg.walk():
        if part.is_multipart(): continue
        fn = part.get_filename()
        ctype = part.get_content_type()
        if fn or (part.get('Content-Disposition', '') or '').lower().startswith('attachment'):
            if fn: attachments.append(str(fn))
            continue
        if not ctype.startswith('text/'): continue
        try: raw = part.get_content()
        except Exception:
            try: raw = (part.get_payload(decode=True) or b'').decode('utf-8', 'replace')
            except Exception: continue
        if not isinstance(raw, str): continue
        if ctype == 'text/html':
            p = Links()
            try: p.feed(raw)
            except Exception: pass
            links += p.links; body_text.append(html.unescape(''.join(p.text)))
        else:
            body_text.append(raw)
            links += [{'href': u, 'text': u} for u in URL.findall(raw)]
    text = re.sub(r'[ \t\r\f\v]+', ' ', '\n'.join(body_text))
    text = re.sub(r'\n\s*\n+', '\n\n', text).strip()[:20000]
    links = [l for l in links if re.match(r'https?:', l['href'], re.I)][:60]
    return {'client': 'test', 'fromName': name, 'fromAddress': addr, 'toAddress': to, 'subject': subject[:300],
            'bodyText': text, 'links': links, 'attachments': list(dict.fromkeys(attachments))}

HELD_OUT = '--held-out' in sys.argv

def messages(path):
    if os.path.isdir(path):
        for f in sorted(os.listdir(path)):
            if f.startswith('.') or f == 'cmds': continue
            if HELD_OUT and hashlib.md5(f.encode()).digest()[0] % 5 != 0: continue
            with open(os.path.join(path, f), 'rb') as fh:
                yield email.message_from_binary_file(fh, policy=email.policy.default)
    else:
        for m in mailbox.mbox(path, factory=lambda f: email.message_from_binary_file(f, policy=email.policy.default)):
            yield m

for path in [a for a in sys.argv[1:] if not a.startswith('--')]:
    for m in messages(path):
        try: print(json.dumps(facts(m)))
        except Exception: pass
