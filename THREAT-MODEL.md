# Threat Model

What Pagida defends against, what it does not, and what it would take to attack
Pagida itself. Written down because a security tool whose limits are undocumented
invites people to trust it further than it deserves.

## Who this is for

A person browsing the web who might land on a credential-harvesting page, from a
link in an email, a text message, an ad, or a search result. Not an enterprise
deployment; not a malware sandbox; not a substitute for a password manager.

## What Pagida is trying to prevent

**A person typing a real credential into a page that is not who it claims to be.**

Everything else is secondary.

## What it detects reasonably well

| Attack | Which tier catches it |
|---|---|
| Typosquatted domains (`paypall.com`, `paypa1.com`) | Address |
| IDN homograph domains (`аpple.com` with a Cyrillic а) | Address |
| Brand names in subdomains (`paypal.secure-billing.xyz`) | Address |
| Brand names under generic TLDs (`netflix.support`) | Address |
| Disposable infrastructure on free hosting and free TLDs | Address |
| Personalised phishing links with your email in the URL | Address |
| Phishing kits dropped on compromised WordPress sites | Address (path) + page |
| Credential forms that post to a third-party collector | Page |
| Copied login pages whose navigation is all dead links | Page |
| Brand impersonation on an unrelated domain | Page |
| Known phishing URLs | Blocklist |

## What it does not detect

- **A compromised legitimate site that has not been reported yet**, where the
  attacker uses the site's own domain, path structure and appearance. If the URL
  is ordinary and the page does not post credentials off-site, Pagida has
  nothing to work with.
- **Phishing that does not involve a web page** — SMS, voice, QR codes,
  malicious attachments, OAuth consent phishing.
- **Attacker-in-the-middle proxy kits** (Evilginx and similar) served from a
  domain that has aged past the heuristics and is not yet blocklisted. The page
  is a faithful reverse proxy of the real login page, so the page-content tier
  sees a legitimate-looking form. Domain age and the blocklist are the only
  defences here, and neither is guaranteed.
- **Malware, drive-by downloads, or exploits.** Pagida flags a `.exe` in a path;
  it does not analyse files.
- **Anything inside an iframe.** The content script runs in the top frame only,
  by design — running in every frame multiplies the attack surface for a
  marginal gain.
- **Pages loaded before the extension is ready.** On browser startup the service
  worker may take a moment; the first page of a session can be scored late.

## Pagida's own attack surface

### A hostile page trying to hide from the content script

A page can detect that a content script is present and change its behaviour.
Pagida takes the reading once at `document_idle` and again on DOM mutation, so a
kit that swaps in the credential form after a delay is still seen — but a kit
that renders the form only after user interaction may be scored on the wrong
content. **This is a real, unresolved gap.**

### A hostile page trying to suppress or fake the warning bar

The warning bar renders inside a **closed shadow root** appended to
`documentElement`, so the page's own CSS cannot restyle it and page scripts
cannot reach into it through the normal DOM. A determined page can still remove
the host element from the document. Treat the bar as advisory; the toolbar badge,
which the page cannot touch at all, is the authoritative indicator.

### A hostile page trying to poison the score

The content script sends a fixed-shape, strongly-typed summary — booleans,
counts and a small set of strings — never arbitrary page content. A page can lie
about its own structure (hide its password field until later), which reduces the
score; it cannot inject new signals or push the score down below what the
address tier already found.

### The extension's own network calls

Three hosts, all pinned in `host_permissions`, all HTTPS, all with timeouts and
silent failure. A hostile or compromised `rdap.org` could return false ages: the
worst case is a domain-age signal that fires wrongly (±30 points), never remote
code execution. The content security policy forbids remote scripts entirely.

### The stored Safe Browsing key

Stored in `chrome.storage.local`, never synced, never logged, and sent only to
`safebrowsing.googleapis.com`. Anyone with access to the browser profile can
read it — the same as any credential stored in a browser. Use a key scoped to
the Safe Browsing API only.

### Supply chain

Four dev dependencies, zero runtime dependencies. Nothing is fetched at build
time except the allowlist, which is generated deliberately and committed as
readable source. The published package is reproducible from the tagged commit.

## Design decisions that follow from this model

1. **Precision over recall.** A warning people click through is worth nothing, so
   the interrupting band is set where false positives are effectively zero. See
   [EVALUATION.md](EVALUATION.md).
2. **Every warning is dismissible.** A security tool that cannot be overruled
   gets uninstalled, and an uninstalled tool protects nobody.
3. **The user's own judgement wins.** Marking a site safe bypasses scoring
   entirely, and marking one as phishing forces the top band regardless of score.
4. **Fail open, never closed.** Every lookup that fails produces no signal rather
   than an error state. Pagida with no network is a working tool with a smaller
   evidence base.
5. **No remote configuration.** Nothing about the scoring can be changed after
   installation without a version you can read the diff of.
