---
"@cosyte/cli": patch
---

The README now opens with the Cosyte lockup, which follows the reader's light or dark colour scheme.

It is a `<picture>` element above the heading: a `<source>` carrying the on-dark cut for `prefers-color-scheme: dark`, and an `<img>` carrying the on-light cut as the fallback. On GitHub a dark-mode reader gets the dark cut. On npm the `<img>` is lifted out of the `<picture>` by the anchor the site wraps README images in, so the light cut renders, which is the right one there because npmjs.com has no dark mode. A renderer that drops `<source>` altogether still renders the inner `<img>`, so the worst case is a light-ground mark on a dark page, never a missing or broken image. Both images were confirmed to return `200` and `image/png` before this landed.

The alt text describes the artwork, a plus mark set in two overlapping rounded squares beside the Cosyte wordmark, rather than the package. It is what a screen reader on the package page announces and what a reader gets if the image fails to load, so it says what the image is instead of repeating the heading underneath it. The `# @cosyte/cli` heading and the blockquote below it are unchanged.

This supersedes a decision recorded in the other changeset in this release, and the correction is stated rather than left implicit. That entry put a per-package banner at the top of the README as a plain markdown image, and it chose that construct over an `<img>` or a `<picture>` pair on the explicit ground that whether npm's markdown sanitizer preserves `<picture>` was unverified. That was an accurate statement of what was known when it was written. It has since been measured on a published package page: the sanitizer keeps the `<picture>`, and the anchor wrapper hoists the `<img>` out of it, so the light cut is what renders on npm. The reason was untested rather than wrong, and it is tested now. Because both changes fall inside the same unreleased window, no consumer ever had the intermediate banner, so this ships as one change rather than an addition followed by a replacement.

Documentation only. No runtime behaviour changed: the command surface, the exit-code contract, the diagnostic codes, and the value-free stderr posture are not part of this change.
