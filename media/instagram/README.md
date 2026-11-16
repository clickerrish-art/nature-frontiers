# Nature Frontiers Instagram media origin

This directory is the zero-cost public static media origin used by the Instagram publisher. The workflow always pins it to the exact checked-out commit on `raw.githubusercontent.com`; custom media-host overrides are disabled.

The workflow resolves files from the exact checked-out commit at:

`https://raw.githubusercontent.com/clickerrish-art/nature-frontiers/<workflow-commit-sha>/media/instagram/`

Use only public, fully rights-cleared, approved media. Every asset is public as soon as it is committed to this public repository. Never upload private, confidential, unlicensed, or embargoed material here.

## Supported files

- Feed image: JPEG only, maximum 8,000,000 bytes.
- Reel: MP4 only, maximum 100,000,000 bytes (deliberately below Meta's 300 MB limit to fit GitHub's per-file limit).

Use a unique, stable filename such as `nf-ig-2026-11-001.jpg` or `nf-ig-2026-11-002.mp4`. Set `media_assets[0].media_path` to that filename. The publisher downloads the file from the exact immutable commit URL, verifies content type, byte count and SHA-256, and refuses redirects or path traversal.

Do not place access tokens, signed URLs, credentials or private media in this directory. The public URL is only an input to Meta's media-container creation step; it is not proof of approval, rights or publication.
