# Security Policy

## Supported versions

The latest released version is the only supported one. Pagida is a single-file
extension with no server component; upgrading means installing the current
release.

## Reporting a vulnerability

Please report security issues **privately** rather than opening a public issue.

- Preferred: [GitHub private vulnerability reporting](https://github.com/AryanDhingraa/pagida/security/advisories/new)
- Alternative: open an issue titled "security contact request" containing no
  details, and I will reply with a private channel.

Please include what the issue is, how to reproduce it, and what an attacker
gains. A proof of concept helps enormously.

I will acknowledge within 72 hours and aim to ship a fix within 14 days for
anything that lets a page suppress a warning, extract stored data, or influence
the score in an attacker's favour.

## In scope

- Anything that lets a web page read, alter or delete Pagida's stored data
- Anything that lets a page suppress, spoof or bypass the warning bar or badge
- Anything that leaks the Safe Browsing API key
- Anything that causes Pagida to send browsing data to an unintended destination
- Injection, prototype pollution or DoS through the content script's message path

## Out of scope

- Phishing pages that Pagida fails to detect. These are gaps in coverage, not
  vulnerabilities — please open a normal issue with the URL, defanged.
- False positives on legitimate sites. Also a normal issue, and very welcome.
- Findings that require an already-compromised browser profile or physical
  access to an unlocked machine.
- Denial of service against `rdap.org` or `raw.githubusercontent.com`.

## Safe harbour

Good-faith research that stays within this policy, does not touch other people's
data, and gives me a reasonable window to fix things before disclosure will not
be pursued in any way.
