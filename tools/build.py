#!/usr/bin/env python3
"""Build drambayreviews.in from data/reviews.json into dist/. Static, no JS framework.
Rules: only real reviews (Google copy or consented video). No AggregateRating/Review schema
(self-serving reviews are not eligible and the site must not look like it games stars)."""
import json, html, shutil, pathlib, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, DIST = ROOT / "src", ROOT / "docs"
D = json.loads((ROOT / "data" / "reviews.json").read_text(encoding="utf-8"))
SITE = "https://drambayreviews.in"
WA = "https://wa.me/919501034545?text=" + "Hi%20Drambay%2C%20I%20saw%20your%20reviews%20and%20want%20to%20ask%20about%20tiles."
TEL = "tel:+919501034545"
STUDIO = "https://www.drambay.com/rooms-studio.html"
MAIN = "https://www.drambay.com/"
G = D["google"]
TODAY = datetime.date.today().isoformat()
e = lambda s: html.escape(str(s), quote=True)

def stars(n):
    n = int(round(float(n)))
    return f'<span class="stars" aria-label="{n} out of 5 stars">' + "★" * n + '<span class="off">' + "★" * (5 - n) + "</span></span>"

def video_card(v):
    tile = e(v["tile"])
    if v.get("tile_url"):
        tile = f'<a href="{e(v["tile_url"])}">{tile}</a>'
    return f'''
<article class="vcard" id="video-{e(v["slug"])}">
  <div class="vframe">
    <video controls playsinline preload="none" poster="assets/review-{e(v["slug"])}.webp" width="540" height="960"
      aria-label="Video review by {e(v["name"])}">
      <source src="assets/review-{e(v["slug"])}.mp4" type="video/mp4">
    </video>
  </div>
  <div class="vbody">
    <blockquote>&ldquo;{e(v["quote"])}&rdquo;</blockquote>
    <p class="who"><strong>{e(v["name"])}</strong><br>{e(v["where"])}</p>
    <p class="meta"><span>{e(v["project"])}</span><span>Tile: {tile}</span><span>Spoken in {e(v["lang"])}</span></p>
    <details>
      <summary>Read what {e(v["name"].split()[0])} said</summary>
      <p class="tr-en">{e(v["english"])}</p>
      <p class="tr-orig" lang="hi-Latn"><em>{e(v["original"])}</em></p>
      <p class="tr-note">Written out and translated by us from the video. The video is the original.</p>
    </details>
  </div>
</article>'''

def google_card(r):
    reply = ""
    if r.get("owner_reply"):
        reply = f'<p class="reply"><strong>Drambay replied:</strong> {e(r["owner_reply"])}</p>'
    text = f'<p class="gtext">{e(r["text"]).replace(chr(10), "<br>")}</p>' if r.get("text") else '<p class="gtext muted">Rating only, no written comment.</p>'
    return f'''
<article class="gcard">
  <header><strong>{e(r["name"])}</strong> {stars(r["rating"])}</header>
  {text}{reply}
  <p class="gdate">{e(r.get("date_label",""))} on Google</p>
</article>'''

videos_html = "".join(video_card(v) for v in D["videos"])
greviews = sorted(G.get("reviews", []), key=lambda r: -len(r.get("text", "")))
if greviews:
    g_html = f'''
<section class="sec" id="google-reviews" aria-labelledby="g-h">
  <div class="wrap">
    <p class="eyebrow">From our Google profile</p>
    <h2 id="g-h">All {len(greviews)} written Google reviews, copied word for word</h2>
    <p class="lede">Names and spelling appear exactly as on Google. Nothing is shortened or corrected. The other {G.get("rating_only", 0)} reviews are star ratings with no comment.</p>
    <div class="ggrid">{"".join(google_card(r) for r in greviews)}</div>
    <p class="center"><a class="btn ghost" href="{e(G["maps_url"])}" rel="noopener">See every review on Google</a></p>
  </div>
</section>'''
else:
    g_html = ""

ld = [
  {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    "@id": MAIN + "#business",
    "name": "Drambay Tiles & Sanitary Ware",
    "url": MAIN,
    "logo": SITE + "/assets/drambay-avatar.png",
    "image": SITE + "/assets/og.jpg",
    "telephone": "+91-95010-34545",
    "address": {"@type": "PostalAddress", "streetAddress": "Pakhowal Road, Thakkarwal", "addressLocality": "Ludhiana",
                "addressRegion": "Punjab", "postalCode": "142022", "addressCountry": "IN"},
    "openingHoursSpecification": [{"@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"], "opens": "10:00", "closes": "20:00"}],
    "areaServed": ["Ludhiana", "Punjab", "India"],
    "hasMap": G["maps_url"],
    "sameAs": [G["maps_url"], MAIN]
  },
  {
    "@context": "https://schema.org", "@type": "WebPage", "@id": SITE + "/#page", "url": SITE + "/",
    "name": "Drambay Tiles reviews from Ludhiana customers", "inLanguage": "en-IN",
    "about": {"@id": MAIN + "#business"}, "dateModified": TODAY,
    "video": [{"@type": "VideoObject", "name": f"{v['name']} on Drambay Tiles ({v['project'].lower()}, {v['tile']})",
               "description": v["english"], "thumbnailUrl": f"{SITE}/assets/review-{v['slug']}.webp",
               "contentUrl": f"{SITE}/assets/review-{v['slug']}.mp4", "uploadDate": v["upload_date"] + "T10:00:00+05:30",
               "duration": v["duration"], "inLanguage": "hi-IN" if v["lang"] == "Hindi" else "pa-IN"} for v in D["videos"]]
  },
  {
    "@context": "https://schema.org", "@type": "FAQPage",
    "mainEntity": [
      {"@type": "Question", "name": "Are these Drambay reviews real?",
       "acceptedAnswer": {"@type": "Answer", "text": "Yes. Video reviews are filmed with each customer's permission. Written reviews are copied word for word from Drambay's Google profile, where you can read every one."}},
      {"@type": "Question", "name": "Where is the Drambay showroom?",
       "acceptedAnswer": {"@type": "Answer", "text": "Pakhowal Road, Thakkarwal, Ludhiana, Punjab 142022. Open every day, 10 am to 8 pm. WhatsApp +91 95010 34545."}},
      {"@type": "Question", "name": "Does Drambay deliver outside Ludhiana?",
       "acceptedAnswer": {"@type": "Answer", "text": "Yes, Drambay delivers across India, usually within 20 days. Every box is ISI marked, and the batch is shade-matched before dispatch."}},
      {"@type": "Question", "name": "How can I leave a review for Drambay?",
       "acceptedAnswer": {"@type": "Answer", "text": "Please leave it on Drambay's Google profile. Good or bad, it helps the next family choose."}}
    ]
  }
]

page = f'''<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Drambay Tiles Reviews: Real Customers, Ludhiana Showroom</title>
<meta name="description" content="Real reviews of Drambay Tiles &amp; Sanitary Ware, Pakhowal Road, Ludhiana. Customer videos from homes and a hospital, plus {G["rating"]} stars from {G["count"]} Google reviews.">
<link rel="canonical" href="{SITE}/">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#F5F2EC">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Drambay Tiles Reviews">
<meta property="og:title" content="Drambay Tiles reviews from Ludhiana customers">
<meta property="og:description" content="Customer videos and Google reviews for Drambay Tiles, Pakhowal Road, Ludhiana.">
<meta property="og:url" content="{SITE}/">
<meta property="og:image" content="{SITE}/assets/og.jpg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:locale" content="en_IN">
<meta name="twitter:card" content="summary_large_image">
<meta name="geo.region" content="IN-PB"><meta name="geo.placename" content="Ludhiana">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="assets/drambay-avatar.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<a class="skip" href="#main">Skip to reviews</a>
<header class="top">
  <div class="wrap bar">
    <a href="{MAIN}" class="logo"><img src="assets/drambay-logo.svg" alt="Drambay Tiles &amp; Sanitary Ware" width="164" height="42"></a>
    <nav aria-label="Main">
      <a href="#videos">Videos</a>
      {'<a href="#google-reviews">Google reviews</a>' if greviews else ''}
      <a href="#visit">Visit</a>
      <a class="btn sm" href="{WA}" rel="noopener">WhatsApp</a>
    </nav>
  </div>
</header>

<main id="main">
<section class="hero">
  <div class="wrap">
    <p class="eyebrow">Drambay Tiles &amp; Sanitary Ware &middot; Pakhowal Road, Ludhiana</p>
    <h1>Drambay Tiles reviews, in our customers&rsquo; own words</h1>
    <p class="lede">We call them tiles people ask about. Guests ask where they came from: <em>puchhange kitthon liya</em>. Here is what the families who chose them say, on camera and on Google.</p>
    <div class="score">
      <a href="{e(G["maps_url"])}" rel="noopener" class="scorebox">
        <span class="big">{e(G["rating"])}</span>
        <span>{stars(G["rating"])}<br><small>{e(G["count"])} Google reviews, as of {e(G["as_of"])}</small></span>
      </a>
      <a class="btn" href="#videos">Watch the customer videos</a>
    </div>
  </div>
</section>

<section class="sec" id="videos" aria-labelledby="v-h">
  <div class="wrap">
    <p class="eyebrow">Customer videos</p>
    <h2 id="v-h">Three customers, three different jobs</h2>
    <p class="lede">A home renovation, a flat in Omaxe and a hospital. Each customer agreed to be filmed and shared.</p>
    <div class="vgrid">{videos_html}</div>
  </div>
</section>
{g_html}
<section class="sec alt" id="why" aria-labelledby="w-h">
  <div class="wrap">
    <p class="eyebrow">Why buy from Drambay</p>
    <h2 id="w-h">Less guessing when you buy tiles</h2>
    <div class="pgrid">
      <div><h3>See it in your room first</h3><p>Try any Drambay tile on a real room in <a href="{STUDIO}">Rooms Studio</a> before you visit.</p></div>
      <div><h3>One batch, one shade</h3><p>Your order is shade-matched from the same batch before it leaves.</p></div>
      <div><h3>ISI on every box</h3><p>Every box carries the ISI mark.</p></div>
      <div><h3>Delivery across India</h3><p>Usually within 20 days, from our Ludhiana showroom.</p></div>
    </div>
  </div>
</section>

<section class="sec" id="honest" aria-labelledby="h-h">
  <div class="wrap narrow">
    <h2 id="h-h">How we collect these reviews</h2>
    <ul class="ticks">
      <li>Videos are filmed with each customer&rsquo;s permission. We add the tile name and place, nothing else.</li>
      <li>Written reviews are copied word for word from our Google profile, where you can read every one.</li>
    </ul>
    <p>Bought from us? Tell the next family how it went, good or bad.</p>
    <p><a class="btn ghost" href="{e(G["write_review_url"])}" rel="noopener">Leave a Google review</a></p>
  </div>
</section>

<section class="sec dark" id="visit" aria-labelledby="vi-h">
  <div class="wrap vgrid2">
    <div>
      <p class="eyebrow">Visit the showroom</p>
      <h2 id="vi-h">Come and see the tiles in person</h2>
      <address>
        <strong>Drambay Tiles &amp; Sanitary Ware</strong><br>
        Pakhowal Road, Thakkarwal<br>Ludhiana, Punjab 142022<br>
        Open every day, 10 am to 8 pm
      </address>
    </div>
    <div class="ctas">
      <a class="btn" href="{STUDIO}">Try tiles in Rooms Studio</a>
      <a class="btn light" href="{WA}" rel="noopener">WhatsApp +91 95010 34545</a>
      <a class="btn light" href="{TEL}">Call the showroom</a>
      <a class="btn light" href="{e(G["maps_url"])}" rel="noopener">Directions on Google Maps</a>
    </div>
  </div>
</section>

<section class="sec" id="faq" aria-labelledby="f-h">
  <div class="wrap narrow">
    <h2 id="f-h">Questions</h2>
    {"".join(f'<details class="faq"><summary>{e(q["name"])}</summary><p>{e(q["acceptedAnswer"]["text"])}</p></details>' for q in ld[2]["mainEntity"])}
  </div>
</section>
</main>

<footer class="foot">
  <div class="wrap">
    <img src="assets/drambay-logo-white.svg" alt="Drambay" width="140" height="36" loading="lazy">
    <p>This review page belongs to Drambay Tiles &amp; Sanitary Ware. Main website: <a href="{MAIN}">drambay.com</a>.</p>
    <p class="muted">Page updated {datetime.date.today().strftime("%d %B %Y").lstrip("0")}.</p>
  </div>
</footer>
</body>
</html>
'''

if DIST.exists():
    shutil.rmtree(DIST)
shutil.copytree(SRC, DIST)
(DIST / "index.html").write_text(page, encoding="utf-8")
(DIST / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n")
(DIST / "sitemap.xml").write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>{SITE}/</loc><lastmod>{TODAY}</lastmod></url></urlset>
''')
if (ROOT / "data" / "CNAME_ON").exists():
    (DIST / "CNAME").write_text("drambayreviews.in\n")
(DIST / ".nojekyll").write_text("")
(DIST / "404.html").write_text(f'''<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page not found | Drambay Tiles Reviews</title><meta name="robots" content="noindex"><link rel="stylesheet" href="style.css"></head>
<body><main class="sec"><div class="wrap narrow"><h1>That page isn&rsquo;t here</h1><p><a class="btn" href="./">See Drambay reviews</a></p></div></main></body></html>''')
print("built", sorted(p.name for p in DIST.iterdir()))
