#!/usr/bin/env python3
"""Rebuild docs/privacy.html (the page the Chrome Web Store links to) from
PRIVACY.md, so the two can never drift apart again.

  python3 scripts/build-privacy-page.py
"""
import re, markdown

page = open('docs/privacy.html', encoding='utf-8').read()
head = page[:page.index('<div class="wrap">') + len('<div class="wrap">')]
tail_at = page.find('<footer')
tail = page[tail_at:] if tail_at >= 0 else '</div>\n</body>\n</html>\n'
md = open('PRIVACY.md', encoding='utf-8').read()
body = markdown.markdown(md, extensions=['tables'])
body = re.sub(r'<table>', '<div class="tw"><table>', body).replace('</table>', '</table></div>')
open('docs/privacy.html', 'w', encoding='utf-8').write(head + '\n' + body + '\n' + tail)
print('wrote docs/privacy.html')
