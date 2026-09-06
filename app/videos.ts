// BibleProject videos, matched to the places where their story happens.
//
// The bar is deliberately high, and most places do not clear it: a video goes in
// only when it narrates the episode that happened at that place. BibleProject
// makes book overviews, theme videos, and a handful of narrative episode
// videos — it does not make videos about towns. So an overview of Mark is not a
// video about Gadara, and putting one there says "here is the story of this
// place" when it is nothing of the kind. Seven places clear the bar. The other
// fifty-five show the card with no video, which is the honest answer.
//
// Acts stories belong to the sibling map, not this one. Damascus, Joppa,
// Caesarea, Samaria, Gaza and Lydda carry no gospel reference in the gazetteer
// for exactly that reason, and no video here either.
//
// Every id is checked against YouTube's oEmbed endpoint by
// scripts/check-videos.mjs, which fails if one stops resolving or stops
// belonging to the BibleProject channel. Do not add an id by hand without
// running it — a wrong eleven characters is a silently broken embed.
//
// `title` is ours, written to sit beside the Chinese in the panel; `source` is
// the video's own title on YouTube, shown underneath so the video can be found
// again if this ever goes stale. BibleProject is not affiliated with this map;
// the videos are embedded and credited, never rehosted.

export type Video = {
  /** YouTube id. */
  id: string;
  /** Our label, in the panel's voice. */
  title: string;
  /** The video's own title on YouTube, verbatim. */
  source: string;
};

export const videos = {
  birth: { id: '_OLezoUvOEQ', title: '耶稣的降生 · 路加福音 1–2', source: 'The Birth of Jesus: Luke 1-2' },
  baptism: { id: '0k4GbvZUPuo', title: '耶稣的受洗 · 路加福音 3–9', source: 'The Baptism of Jesus: Luke 3-9' },
  crucifixion: { id: '_unHmAf7INk', title: '受难 · 路加福音 19–23', source: 'The Crucifixion of Jesus: Luke 19-23' },
  resurrection: { id: 'Vb24Lk1Oh5M', title: '复活 · 路加福音 24', source: 'The Resurrection of Jesus: Luke 24' },
} satisfies Record<string, Video>;

export type VideoKey = keyof typeof videos;

/**
 * Which video belongs to which place, with the passage that earns it. Each
 * pairing is the same episode told twice — once by the gazetteer entry, once by
 * the video — not a book that happens to mention the town.
 */
export const placeVideo: Record<string, VideoKey> = {
  nazareth: 'birth',        // 路加福音 1:26–38；2:39–52 — 报喜与成长，正是影片 Luke 1–2 的内容
  bethlehem: 'birth',       // 路加福音 2:1–20 — 降生
  bethabara: 'baptism',     // 马可福音 1:9–13 — 约旦河受洗
  bethphage: 'crucifixion', // 马可福音 11:1–11 ↔ 路加福音 19:28–40 — 骑驴进城，影片由此开始
  jerusalem: 'crucifixion', // 马可福音 11–16 ↔ 路加福音 19–23 — 同一段受难叙事
  olives: 'crucifixion',    // 马可福音 14:26–52 ↔ 路加福音 22:39–53 — 客西马尼与被捕
  emmaus: 'resurrection',   // 路加福音 24:13–35 — 影片正是路加福音 24 章
};
