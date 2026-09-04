// ---------------------------------------------------------------------------
// What's New content
// ---------------------------------------------------------------------------
// The What's New panel now renders as a timeline with two kinds of entries:
//
//   type: "major"   -> a full update card (big marker, tags, bullet list).
//                      Use this for real releases — new games, redesigns,
//                      anything worth a headline.
//
//   type: "patch"   -> a small tick on the timeline that sits BETWEEN major
//                      releases. Use this for tiny tweaks/hotfixes you want
//                      logged without cluttering the changelog with another
//                      full card — e.g. "fixed a typo", "bumped a cover
//                      image", "quick loading fix for Slope 2".
//
// If `type` is omitted, the entry is treated as "major" — so any existing
// entries you don't touch keep working exactly as before.
//
// Shape of an entry:
//   {
//     date: "Aug 29, 2026",         // shown as a small date label
//     title: "Short headline",      // headline for the update
//     type: "major",                // "major" (default) or "patch"
//     tags: ["new"],                // major only — any of: "new", "improved", "fixed", "removed"
//     items: [                      // bullet points describing the update
//       "Did a thing.",
//       "Did another thing."
//     ]
//   }
//
// To log a small tweak between two major releases, just insert a "patch"
// entry in the right date order, e.g.:
//
//   {
//     date: "Sep 2, 2026",
//     title: "Hotfix: Slope 2 loading",
//     type: "patch",
//     items: ["Fixed a black screen on load for some players"]
//   }
//
// The newest entry should go at the TOP of the array, regardless of type.
// ---------------------------------------------------------------------------

const WHATS_NEW = [
  {
    date: "Sep 7, 2026",
    title: "Overhaul",
    type: "major",
    tags: ["new", "improved"],
    items: [
      "Added Smash Karts",
      "Added Drifting Mania",
      "Changed homepage and overall color to black and purple",
      "Ai chat now only one model but works better",
      "whats new page now timeline+mini updates"
    ]
  },
  {
    date: "Sep 3, 2026",
    title: "More Games+tweaks",
    type: "major",
    tags: ["new", "improved"],
    items: [
      "Added Color Tunnel 2",
      "Changed ribbons on many games",
      "Slots back to old version",
      "Added Block Blast",
      "Huge update with way more games coming soon"
    ]
  },
  {
    date: "Sep 3, 2026",
    title: "All ads removed",
    type: "major",
    tags: ["removed"],
    items: [
      "Removed all ads",
      "Added partial backend scripts for future update"
    ]
  },
  {
    date: "Sep 1, 2026",
    title: "OJ Simpson Simulator Unblocked",
    type: "major",
    tags: ["new"],
    items: [
      "Added OJ Simpson Simulator",
      "Added Escape Road 2",
      "Added cover for Slope 2"
    ]
  },
  {
    date: "Aug 29, 2026",
    title: "Minecraft Reverted to 1.8.8",
    type: "patch",
    items: [
      "Minecraft reverted to version 1.8.8"
    ]
  },
  {
    date: "Aug 29, 2026",
    title: "Ad-Free Pass & FREE AI",
    type: "major",
    tags: ["new", "improved", "removed"],
    items: [
      "NewTab AI is now 100% FREE",
      "You can now open 20 ads to earn 12 hours of ad-free play",
      "Added Whats New page",
      "Better ribbons",
      "Removed player counter"
    ]
  },
  {
    date: "Aug 28, 2026",
    title: "Game Changes",
    type: "major",
    tags: ["improved", "fixed", "removed"],
    items: [
      "Changed minecraft from 1.8.8 to 1.12.2",
      "Removed Angry Birds",
      "Fixed Basket Random",
      "Fixed Basket Bros"
    ]
  }
];

window.WHATS_NEW = WHATS_NEW;
