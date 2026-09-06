// BibleProject videos, matched to the places where their story happens.
//
// Every id here is checked against YouTube's oEmbed endpoint by
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
  prodigal: { id: 'jUCCUHurV0I', title: '上耶路撒冷的路 · 路加福音 9–19', source: 'The Prodigal Son: Luke 9-19' },
  crucifixion: { id: '_unHmAf7INk', title: '受难 · 路加福音 19–23', source: 'The Crucifixion of Jesus: Luke 19-23' },
  resurrection: { id: 'Vb24Lk1Oh5M', title: '复活 · 路加福音 24', source: 'The Resurrection of Jesus: Luke 24' },
  matthew1: { id: '3Dv4-n6OYGI', title: '马太福音综览 · 上', source: 'Gospel of Matthew Summary (Part 1)' },
  matthew2: { id: 'GGCF3OPWN14', title: '马太福音综览 · 下', source: 'Gospel of Matthew Summary (Part 2)' },
  mark: { id: 'HGHqu9-DtXk', title: '马可福音综览', source: 'Gospel of Mark Summary' },
  luke1: { id: 'XIb_dCIxzr0', title: '路加福音综览 · 上', source: 'Gospel of Luke Summary (Part 1)' },
  john1: { id: 'G-2e9mMf7E8', title: '约翰福音综览 · 上', source: 'Gospel of John Summary (Part 1)' },
  john2: { id: 'RUfh_wOsauk', title: '约翰福音综览 · 下', source: 'Gospel of John Summary (Part 2)' },
  acts812: { id: 'oiVAbkINtRU', title: '使徒行传 8–12 · 福音出犹太', source: 'The Apostle Paul: Acts 8-12' },
  temple: { id: 'wTnq6I3vUbU', title: '圣殿：神与人同住之处', source: 'We Studied the Temple in the Bible' },
  water: { id: 'PgmAkM39Zt4', title: '水在圣经中的意象', source: 'Why Water Matters in the Bible' },
  sermon: { id: 'ajwehw_AT0s', title: '登山宝训', source: 'What Jesus Taught in the Sermon on the Mount' },
} satisfies Record<string, Video>;

export type VideoKey = keyof typeof videos;

/**
 * Which video belongs to which place. Only where the connection is real — a
 * place with nothing genuinely about it simply shows no video, which is a
 * better answer than stretching a book overview to cover a village.
 */
export const placeVideo: Record<string, VideoKey> = {
  // ——— 加利利 ———
  nazareth: 'birth',
  cana: 'john1',
  capernaum: 'mark',
  chorazin: 'matthew1',
  magdala: 'luke1',
  gennesaret: 'sermon',
  tiberias: 'john2',
  nain: 'luke1',
  tabor: 'matthew2',
  bethsaida: 'mark',
  hermon: 'matthew2',

  // ——— 低加波利与约旦河东 ———
  gergesa: 'mark',
  gadara: 'mark',
  machaerus: 'mark',
  bethabara: 'baptism',
  aenon: 'water',

  // ——— 腓尼基与沿海 ———
  tyre: 'mark',
  sidon: 'mark',
  zarephath: 'luke1',
  caesarea: 'acts812',
  joppa: 'acts812',
  azotus: 'acts812',
  gaza: 'acts812',
  lydda: 'acts812',
  ptolemais: 'acts812',

  // ——— 撒马利亚 ———
  sychar: 'john1',
  shechem: 'john1',
  gerizim: 'john1',
  'samaria-city': 'acts812',

  // ——— 犹太 ———
  jerusalem: 'crucifixion',
  olives: 'temple',
  bethphage: 'crucifixion',
  bethany: 'john2',
  bethlehem: 'birth',
  emmaus: 'resurrection',
  ephraim: 'john2',
  jericho: 'prodigal',

  // ——— 更远的背景 ———
  'caesarea-philippi': 'matthew2',
  damascus: 'acts812',
};
