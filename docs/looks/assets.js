// Where each picture lives. Empty here: the files sit next to the page.
// The drambay.com build writes its own copy of this file with the Wix Media addresses.
export const MEDIA = {};
export const asset = (p) => MEDIA[p] || p;
