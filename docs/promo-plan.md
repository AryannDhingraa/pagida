# Pagida — launch video and promotion plan

One video does the work of ten posts, and the Chrome Web Store gives you a
YouTube slot on the listing itself. This is the whole thing: title, script,
shot list, thumbnail, and where each cut goes.

---

## The title

**Primary — use this one:**

> **I built a phishing detector that tells you *why*.**

It works because it does not describe a browser extension, which nobody
searches for, and it makes a claim that is genuinely unusual. Every commercial
tool shows a red screen; almost none of them show their reasoning. That is the
whole product in six words.

**Alternates, by where you post it:**

| Where | Title |
|---|---|
| Chrome Web Store listing video | **Pagida — see exactly why a site is dangerous** |
| YouTube (search-friendlier) | **I built a phishing detector that explains itself — Pagida** |
| LinkedIn native upload | **Most phishing warnings say "danger". Mine says why.** |
| Reddit r/cybersecurity | **I built an open-source phishing detector that shows its scoring, not just a verdict [OC]** |
| TikTok / Shorts / Reels | **This website is fake. Here's how you can tell in 3 seconds.** |

**Titles to avoid:** anything starting "Introducing…", anything with "🚀", and
anything that says *blocks* — you cannot say blocks, and it is a weaker claim
than the true one.

---

## The main video — 75 seconds

Short deliberately. The store listing video is watched by people deciding
whether to click Install, and they decide in the first eight.

### Structure

| Time | What is on screen | What you say |
|---|---|---|
| 0:00–0:06 | A real phishing page, already open. No logo, no intro. Cursor hovers over the login form. | "This is a fake PayPal login. It looks right. The padlock is there." |
| 0:06–0:12 | Click the Pagida icon. Popup opens, Iris is red, score climbs to 78. | "Here's what my extension says about it." |
| 0:12–0:30 | Slow scroll down the signal list. Each signal highlights as it passes. | "Not just 'danger'. The password box sends to a different domain. The domain was registered three days ago. It says PayPal but the owner is verify-account dot t-k. Every reason, with the score it contributed." |
| 0:30–0:40 | Cut to a real bank. Popup opens, Iris is calm blue, score 4. | "And on the real thing, it stays quiet. That's the hard part — anything can shout." |
| 0:40–0:58 | Open the full site report. Scroll: registration, hosting, certificates, mail records, tech. | "One button gets you the whole picture. Who registered it, where it's hosted, its certificate history, whether it can even send email — most scam domains can't." |
| 0:58–1:08 | Options page. Cursor moves down the privacy switches. | "It scores on your machine. Every lookup that leaves is listed here, with a switch. No account, no analytics, nothing sold." |
| 1:08–1:15 | Iris centred on white, blinks once. Text: *Pagida — free and open source*. GitHub URL underneath. | "It's free, it's open source, and the detection is evaluated in public. Link below." |

### Recording notes

- **1280×800, 60fps.** Match the store screenshot size so frames double as stills.
- **Hide your bookmarks bar and use a clean profile.** People pause videos.
- **Use a real phishing URL from the OpenPhish feed**, captured the same day.
  A hand-made fake looks hand-made, and the audience for this notices.
- **Blur nothing that matters.** If you have to blur half the screen, the shot
  is wrong — re-record it in a clean profile instead.
- **Cursor movement is the pacing.** Move it deliberately and slightly slower
  than feels natural. Never let it wander while you talk.
- **Record the audio separately** and lay it under the screen capture. Screen-
  capture audio always sounds like a laptop fan.
- **No music under the voice.** Bring a bed in only at 1:08, under the outro.

### The thumbnail

Split down the middle. Left: the fake login page, slightly desaturated. Right:
the popup with red Iris and the score. One line of text across the top in the
extension's own typeface: **"Spot the difference."** No arrows, no circles, no
face. It should look like the product, because the product looks good.

---

## The cutdowns

Cut these from the same footage. Do not re-record.

**A. Fifteen seconds, vertical (TikTok, Shorts, Reels).**
0:00 fake page, 0:03 popup opens red, 0:05–0:12 three signals only, held long
enough to read, 0:12 "it's free, it's open source". No talking head. Burn in
captions — most of it is watched muted.

**B. Thirty seconds, silent, looping (LinkedIn).**
Phishing page → popup → signal list → clean site → Iris. Captions on screen
carry the whole story. LinkedIn autoplays muted and this is the format that
gets watched to the end.

**C. Six seconds (the store listing GIF).**
Icon click → red popup → score lands. This one runs in the README too, so keep
it under 3MB.

---

## Where it goes, and in what order

Launch over four days rather than all at once — every platform's algorithm
punishes a burst of identical links, and you want each post to have somewhere
to point.

**Day 0 — the foundation.**
Repository public, README with the GIF at the top, evaluation numbers visible,
release tagged `v2.1.1` with a real changelog. The store submission goes in the
same day, set to Unlisted; it takes a few days to review and you want the link
live before the posts go out.

**Day 1 — YouTube.**
Upload the 75-second cut. Description: what it does, how the scoring works, the
GitHub link, and the evaluation caveats. Pin a comment with the honest
limitation — "it cannot catch a legitimate site compromised an hour ago" — which
buys more credibility in this audience than any feature claim.

**Day 2 — LinkedIn.**
Native upload of cut B, never a YouTube link; LinkedIn suppresses outbound
links in the feed. The post itself matters more than the video here — write it
as the story of one bug, not as an announcement. Tag RMIT, and put the GitHub
link in the first comment.

**Day 3 — Reddit.**
r/cybersecurity, r/netsec (read their rules first — they are strict about self-
promotion and will remove a post that reads like marketing), r/chrome_extensions,
r/opensource. Title it as an engineering post, lead with the evaluation
methodology rather than the features, and be in the comments for the first two
hours. This audience will find something wrong with it; the fastest way to earn
their respect is to agree and fix it.

**Day 4 — Hacker News.**
`Show HN: Pagida – a phishing detector that shows its scoring`. Post Tuesday to
Thursday, 8–10am US Eastern. First comment from you: why you built it, what it
gets wrong, what the false-positive rate actually is. Never defend, always
answer.

**Ongoing.**
Every time you fix a false positive, that is a post. "Google AI Studio was
scoring 34. Here's why, and what I changed." Those posts perform better than
launches do, and they are the ones that read as an engineer rather than a
founder.

---

## The LinkedIn post — draft

Rewrite this in your own words before you post it. It should sound like you.

> A fake PayPal login page and the real one are pixel-identical. The padlock is
> on both. Every browser I tried either said nothing or said "Dangerous site"
> with no reason attached.
>
> So I spent the last few weeks building Pagida — a Chrome extension that scores
> a page against 38 signals and then shows you every one it found, in plain
> English, with the weight it contributed. Login form submits to a different
> domain: +32. Domain registered three days ago: +30.
>
> The hard part was not catching phishing. It was not crying wolf. An extension
> that flags your bank is an extension you uninstall, so I built an evaluation
> harness against live phishing feeds and real brand login pages, and published
> the numbers — including the ones that are not flattering.
>
> It is free, open source, and the whole scoring engine is readable in one
> afternoon.
>
> Code and evaluation in the comments.

---

## What success looks like

Do not chase installs in the first week — the store review alone eats most of
it. The things worth watching:

- **GitHub stars from people who are not your friends.** Twenty of those is a
  real signal.
- **One issue opened by a stranger.** That is the moment it becomes a project
  rather than a portfolio piece.
- **A recruiter mentioning it unprompted.** This is what the whole thing is for.

The video is a portfolio artefact in its own right. Being able to explain a
security tool clearly in seventy-five seconds is, for most of the roles you are
aiming at, a more useful demonstration than the code.
