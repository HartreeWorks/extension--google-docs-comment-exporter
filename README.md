# Google Docs Comment Exporter

A Chrome extension to download Google Docs as text files, including comments.

## Features

- **Download current doc** — One-click download when viewing a Google Doc
- **Batch export** — Find all Google Docs across all open tabs and download them all at once
- Uses Google's native export endpoint, which includes resolved comments in the exported text

## Installation

1. [Download](https://github.com/HartreeWorks/extension--google-docs-comment-exporter/archive/refs/heads/main.zip) or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the extension folder

## Usage

1. Click the extension icon in your toolbar
2. If you're on a Google Doc, click **Download current doc** to export it
3. To batch export, click **Find Google Docs in all tabs**, then **Download all**

Files are saved as `.txt` with sanitised filenames based on the document title.

## Requirements

- Google Chrome (or Chromium-based browser)
- You must be logged into Google with access to the documents you want to export

## How it works

The extension uses Google's built-in export endpoint (`/export?format=txt`) which returns the document as plain text. This endpoint includes resolved comments in the output.

## Permissions

- `activeTab` — To detect if the current tab is a Google Doc
- `tabs` — To find Google Docs across all open tabs for batch export
- `downloads` — To save exported files to your computer

## Licence

MIT
