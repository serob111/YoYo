#!/usr/bin/env node
// Throwaway local stub standing in for graph.instagram.com, used for both
// load testing (POST .../messages) and manual testing of the Instagram
// existing-inventory import feature (GET .../me/media, GET .../{mediaId}).
// Point worker-messaging/worker-social-sync's META_GRAPH_BASE_URL at this
// (see docker-compose.staging.yml / .env.staging) to exercise the real
// send/read code paths with zero real Meta credentials.
//
// Usage: PORT=8089 STUB_DELAY_MS=150 node scripts/fake-graph-stub.js
const http = require("node:http");
const { randomUUID } = require("node:crypto");

const PORT = Number(process.env.PORT ?? 8089);
const DELAY_MS = Number(process.env.STUB_DELAY_MS ?? 150);

// ---------------------------------------------------------------------------
// Deterministic seeded media for @globalhomes (42 items) - Graph API "media"
// node shape (id, caption, media_type, media_product_type, media_url,
// thumbnail_url, permalink, timestamp, children.data[]). No fake-only
// branching exists in domain code - this is the same shape
// InstagramMediaReaderProvider expects from the real API.
// ---------------------------------------------------------------------------

function isoDate(daysAgo) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function mediaUrl(id) {
  return `https://fake-cdn.local/media/${id}.jpg`;
}

function permalink(id) {
  return `https://www.instagram.com/p/${id}/`;
}

function carouselChildren(baseId, count) {
  return {
    data: Array.from({ length: count }, (_, i) => ({
      id: `${baseId}_c${i + 1}`,
      media_type: "IMAGE",
      media_url: mediaUrl(`${baseId}_c${i + 1}`),
      thumbnail_url: mediaUrl(`${baseId}_c${i + 1}`)
    }))
  };
}

function node(id, { type, productType, caption, daysAgo, children }) {
  return {
    id,
    caption,
    media_type: type,
    ...(productType ? { media_product_type: productType } : {}),
    media_url: mediaUrl(id),
    thumbnail_url: mediaUrl(id),
    permalink: permalink(id),
    timestamp: isoDate(daysAgo),
    ...(children ? { children: carouselChildren(id, children) } : {})
  };
}

const SEEDED_MEDIA = [
  // --- PROPERTY A: Dubai Marina Apartment - 3 posts, AED 1,850,000, 3BR.
  // Two share an explicit reference (strong grouping signal); the third
  // relies on the composite (city/type/price/bedrooms) signal instead.
  node("ig_001", { type: "VIDEO", productType: "REELS", daysAgo: 21, caption: "Stunning 3BR apartment in Dubai Marina, ready to move in! AED 1,850,000. Ref: DM-1029. DM us for a private viewing. #DubaiMarina #ForSale" }),
  node("ig_002", { type: "CAROUSEL_ALBUM", daysAgo: 19, children: 4, caption: "More photos of our Dubai Marina 3-bedroom listing, AED 1,850,000 - marina views from every room. Ref: DM-1029." }),
  node("ig_003", { type: "VIDEO", productType: "REELS", daysAgo: 14, caption: "Walkthrough of the 3 bedroom apartment we listed in Dubai Marina last week - AED 1,850,000, don't miss it!" }),

  // --- PROPERTY B: Palm Jumeirah Villa - 2 posts, AED 12,500,000, no ref.
  node("ig_004", { type: "IMAGE", daysAgo: 30, caption: "Beachfront villa on Palm Jumeirah - 5 bedrooms, private pool, AED 12,500,000. For sale." }),
  node("ig_005", { type: "VIDEO", productType: "REELS", daysAgo: 27, caption: "Sunset views from our Palm Jumeirah villa listing, 5BR, AED 12,500,000 - link in bio." }),

  // --- PROPERTY C: Marbella Villa - reel + carousel, EUR 850,000, no ref.
  node("ig_006", { type: "VIDEO", productType: "REELS", daysAgo: 12, caption: "New listing in Marbella: 4 bedroom villa with sea views, EUR 850,000. Book a viewing today!" }),
  node("ig_007", { type: "CAROUSEL_ALBUM", daysAgo: 10, children: 5, caption: "Full photo tour of our Marbella villa - 4 bedrooms, EUR 850,000, pool and garden included." }),

  // --- PROPERTY D: Limassol Apartment - single post, EUR 470,000.
  node("ig_008", { type: "IMAGE", daysAgo: 8, caption: "2 bedroom apartment for sale in Limassol, EUR 470,000. Great investment opportunity near the marina." }),

  // --- NON-PROPERTY CONTENT.
  node("ig_009", { type: "IMAGE", daysAgo: 365, caption: "Happy New Year from all of us at Global Homes! 🎉" }),
  node("ig_010", { type: "IMAGE", daysAgo: 90, caption: "Meet the team behind Global Homes Realty - here for all your property needs." }),
  node("ig_011", { type: "IMAGE", daysAgo: 45, caption: "Market update: Dubai real estate prices up 8% this quarter. Swipe for the full breakdown." }),
  node("ig_012", { type: "VIDEO", productType: "REELS", daysAgo: 5, caption: "A day in the life at our office 🏢 #realestatelife" }),

  // --- AMBIGUOUS: two vague, sparsely-detailed posts that might be the same
  // listing (or might not) - deliberately low-confidence extraction, not
  // auto-merged with anything.
  node("ig_013", { type: "IMAGE", daysAgo: 6, caption: "Beautiful apartment available now, message us for details!" }),
  node("ig_014", { type: "IMAGE", daysAgo: 4, caption: "Another great apartment just came on the market - reach out to learn more." }),

  // --- OLD PROPERTY: should never auto-become ACTIVE on import (import
  // defaults to DRAFT regardless of post age - this item just exercises that
  // with a stale, availability-uncertain caption).
  node("ig_015", { type: "IMAGE", daysAgo: 730, caption: "3 bedroom villa for sale in Al Barsha, contact for price." })
];

// Padding to 42 total - generic non-property filler, distinct captions.
const FILLER_CAPTIONS = [
  "Client testimonial: \"Global Homes made our purchase so easy!\" ⭐⭐⭐⭐⭐",
  "Throwback to our booth at the Dubai property expo.",
  "Reminder: our office is closed this Friday for a public holiday.",
  "Tips for first-time buyers - swipe through our carousel guide.",
  "Congratulations to the Al Farsi family on their new home! 🏡",
  "Behind the scenes at a client viewing this morning.",
  "Ramadan Kareem from the Global Homes team!",
  "We're hiring - link in bio for open agent positions.",
  "Coffee run with the team before a busy day of viewings ☕",
  "5 questions to ask before renting your next apartment.",
  "Our agents at the annual real estate networking gala.",
  "Throwback Thursday: our very first office space.",
  "Weekend market update - mortgage rates holding steady this month.",
  "Say hello to our newest team member, joining the sales desk!",
  "Client appreciation event highlights from last night.",
  "How we help you navigate the paperwork - process explained.",
  "A quick tour of our newly renovated office reception.",
  "Community spotlight: local cafes near our office.",
  "Global Homes proudly sponsors the city marathon this year.",
  "Friday wrap-up: another great week closing deals.",
  "Our top 3 tips for staging a home before listing.",
  "Excited to announce our new partnership with a local mortgage broker.",
  "National Day celebrations at the Global Homes office 🎉",
  "A look back at our best moments from this year.",
  "Get to know our leasing specialist in this quick Q&A.",
  "Office renovation progress - can't wait to show you the final look.",
  "Thank you to everyone who visited our open house this weekend!"
];

for (let i = 0; i < FILLER_CAPTIONS.length && SEEDED_MEDIA.length < 42; i++) {
  const id = `ig_${String(SEEDED_MEDIA.length + 1).padStart(3, "0")}`;
  SEEDED_MEDIA.push(node(id, { type: "IMAGE", daysAgo: 100 + i * 3, caption: FILLER_CAPTIONS[i] }));
}

const MEDIA_BY_ID = new Map(SEEDED_MEDIA.map((m) => [m.id, m]));
const PAGE_LIMIT_DEFAULT = 25;

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function handleListMedia(req, res, url) {
  const limit = Number(url.searchParams.get("limit") ?? PAGE_LIMIT_DEFAULT);
  const after = Number(url.searchParams.get("after") ?? "0");
  const page = SEEDED_MEDIA.slice(after, after + limit);
  const nextOffset = after + limit;
  const hasMore = nextOffset < SEEDED_MEDIA.length;

  setTimeout(() => {
    sendJson(res, 200, {
      data: page,
      paging: hasMore ? { cursors: { after: String(nextOffset) } } : {}
    });
  }, DELAY_MS);
}

function handleGetMediaDetails(req, res, mediaId) {
  const found = MEDIA_BY_ID.get(mediaId);
  setTimeout(() => {
    if (!found) {
      sendJson(res, 404, { error: { message: `No media found for id ${mediaId}` } });
      return;
    }
    sendJson(res, 200, found);
  }, DELAY_MS);
}

function handleSendMessage(req, res) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    setTimeout(() => {
      let recipientId = "unknown";
      try {
        recipientId = JSON.parse(body)?.recipient?.id ?? "unknown";
      } catch {
        // Malformed body - respond anyway, matches "answer every send" contract.
      }
      sendJson(res, 200, { recipient_id: recipientId, message_id: `fake_mid_${randomUUID()}` });
    }, DELAY_MS);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "POST" && url.pathname.endsWith("/messages")) {
    handleSendMessage(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname.endsWith("/me/media")) {
    handleListMedia(req, res, url);
    return;
  }

  if (req.method === "GET") {
    // /{version}/{mediaId} - single path segment after the version prefix.
    const segments = url.pathname.split("/").filter(Boolean);
    const mediaId = segments[segments.length - 1];
    if (mediaId && MEDIA_BY_ID.has(mediaId)) {
      handleGetMediaDetails(req, res, mediaId);
      return;
    }
  }

  sendJson(res, 404, { error: { message: "not found (fake-graph-stub only answers POST .../messages, GET .../me/media, GET .../{mediaId})" } });
});

server.listen(PORT, () => {
  console.log(`fake-graph-stub listening on :${PORT} (delay ${DELAY_MS}ms, ${SEEDED_MEDIA.length} seeded media items)`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
