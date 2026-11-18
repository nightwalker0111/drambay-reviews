// Where each picture lives. Empty here: the files sit next to the page.
// The drambay.com build writes its own copy of this file with the Wix Media addresses.
export const MEDIA = {};
// The tool's lists (designs, face ids, tones, each room's layout), when they travel inside this file. Empty here: they are fetched as files.
export const DATA = {};
export const asset = (p) => MEDIA[p] || p;
