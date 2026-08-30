// ---------------------------------------------------------------------------
// What's New content
// ---------------------------------------------------------------------------
//   {
//     date: "Aug 29, 2026",             // shown as a small date label
//     title: "Short headline",          // bold headline for the update
//     tags: ["new"],                    // any of: "new", "improved", "fixed", "removed"
//     items: [                          // bullet points describing the update
//       "Did a thing.",
//       "Did another thing."
//     ]
//   }
//
// The newest entry should go at the TOP of the array.
// ---------------------------------------------------------------------------

const WHATS_NEW = [
  {
    date: "Aug 29, 2026",
    title: "Ad-Free Pass & FREE AI",
    tags: ["new", "improved","removed"],
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
    tags: ["improved","fixed","removed"],
    items: [
      "Changed minecraft from 1.8.8 to 1.12.2",
      "Removed Angry Birds",
      "Fixed Basket Random",
      "Fixed Basket Bros"
    ]
  }
];

window.WHATS_NEW = WHATS_NEW;
