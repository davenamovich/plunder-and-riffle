const ADJECTIVES = [
  "swift","brave","calm","bold","keen","warm","cool","dark","fair","free",
  "glad","gold","gray","iron","jade","kind","lead","lime","loud","mild",
  "mint","mist","nova","peak","pine","rose","ruby","sage","salt","sand",
  "silk","slim","soft","sole","star","teal","tide","true","vast","wild",
  "wise","zinc","blue","fire","flux","glow","haze","lark","lush","onyx",
  "opal","pure","reef","snap","snow","void","wave","zinc","arc","ash",
];

const NOUNS = [
  "wolf","hawk","bear","lion","fox","deer","crow","owl","elk","ram",
  "colt","dove","duck","fawn","hare","kite","lark","lynx","mink","mole",
  "moth","mule","puma","seal","swan","toad","vole","wren","yak","zebu",
  "bolt","cape","core","cove","crag","dale","dune","edge","fell","ford",
  "gale","glen","hill","isle","knob","lake","leaf","mesa","moon","moor",
  "peak","pike","pine","pond","reef","rift","rock","ridge","rune","seed",
  "span","stem","tide","vale","vent","void","wake","wave","well","wind",
];

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function generateReferralCode(): string {
  return Math.random().toString(36).slice(2, 9).toUpperCase();
}

export function generateRandomSlug(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${adj}-${noun}-${num}`;
}

// Legacy export — kept for any call sites that pass email
export function generateUserSlug(_email: string, _suffix?: string): string {
  return generateRandomSlug();
}
