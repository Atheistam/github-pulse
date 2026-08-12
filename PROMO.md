# 🚀 Launch post drafts — GitHub Pulse

## Hacker News (Show HN)

**Title:** Show HN: I built a radar that catches GitHub's push-farm botnets in real time

**Body:**

Every hour, GH Archive records ~150K public GitHub events. I stream all of
them and rank what's actually *happening* on GitHub right now — hottest
repos, human signal, top actors, languages, releases.

The interesting part is what I had to kill to make it work: **push-farms.**

~48% of all pushes on GitHub right now are spam. Thousands of auto-created
accounts (`smithhoward5868/faiucd`, `conleyricky202/babjhl`) push hundreds
of times an hour to freshly-created gibberish repos — for what, I'm still
not sure (SEO, GH-Action reselling, ???). One repo, `LiamBruhin/SillyStuff`,
pushed 344 times in a single hour from one actor, and has done so for 13
hours straight.

The farms read the site and adapt. When I thresholded at 40 pushes/hr they
dropped to 30, then 25, then 24. So detection is now *profile-based*:
zero human signal (no PRs/issues/stars/forks/releases) + ≤2 actors +
auto-generated account names + a persistent ledger of known farm accounts
(repos rotate, accounts persist).

You can see the live botnet watch: https://github-pulse.surge.sh
RSS: https://github-pulse.surge.sh/data/digest.xml
Code: it's a single zero-dependency Node script (pipeline/pulse.cjs),
open-sourced: https://github.com/Atheistam/github-pulse

Questions I'm curious about: what ARE these farms for? Why do they keep
pushing to fresh repos forever? Anyone seen the pattern before?

## Reddit (r/programming or r/dataisbeautiful)

**Title:** ~48% of all GitHub pushes are spam from automated push-farms — I built a live radar that catches them [OC]

**Body:**

I stream the full GH Archive event feed hourly and rank repos by real human
activity. To keep the chart honest I had to build botnet detection: the
farms use bulk-created accounts (word+digits usernames, gibberish repo
names), push 100-350×/hour with zero human interaction, adapt their volume
to evade thresholds, launder pushes through GitHub Actions, and rotate repo
names while keeping the same owner accounts.

Live: https://github-pulse.surge.sh — includes a Bot Watch panel showing
each hour's farms and the % of all pushes that are spam (currently ~36%,
it was 48% six hours earlier — the farms ebb and flow, the detection holds).

The data is real, from GH Archive. Open source, single script:
https://github.com/Atheistam/github-pulse
