// ---------------------------------------------------------------------------
// What's New content
// ---------------------------------------------------------------------------
// Edit this file to change what shows up in the "What's New" popup on the
// homepage. Nothing else needs to change -- index.html reads WHATS_NEW
// automatically and renders it, newest entry first.
//
// Each entry looks like:
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
    title: "Ad-Free Pass & a cleaner homepage",
    tags: ["new", "improved", "removed"],
    items: [
      "New: watch 20 short ads to earn 12 hours of ad-free play, with a progress bar so you always know how close you are.",
      "New: this What's New page! Check back here to see what's changed.",
      "Improved: game ribbons (like \"NEW\" or \"HOT\") are bigger and easier to read.",
      "Removed: the old live player-counter, which was unreliable and has been retired."
    ]
  },
  {
    date: "Jul 2026",
    title: "Site chat rooms",
    tags: ["new"],
    items: [
      "Added Elementary, Middle, and High School chat rooms.",
      "Chat messages can now be tagged with the game you're currently playing."
    ]
  }
];

window.WHATS_NEW = WHATS_NEW;
